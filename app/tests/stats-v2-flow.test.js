import test from 'node:test';
import assert from 'node:assert/strict';
import { STATS_PROMPT_KEY, createStatsRuntime } from '../src/core/stats-runtime.js';
import { STATS_BACKUP_KEY, STATS_METADATA_KEY, deserializeLedger, serializeLedger, emptyCatalog } from '../src/scene/stats/stat-persist.js';
import { ledgerKey, createStatsLedger } from '../src/scene/stats/stat-ledger.js';
import { settleFloorText, constrainFavor } from '../src/scene/stats/stat-settle.js';
import { parseStatDirectives, stripStatDirectives } from '../src/scene/stats/stat-directives.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';
import { parseSheetReply, sheetFromTiers, parseBackfillReply, applyBackfillToSheet } from '../src/scene/stats/stat-sheets.js';
import { createSkillRegistry, registerStorySkill, STORY_SKILL_MAX } from '../src/scene/stats/stat-registry.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function host() {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { let out; for (const f of [...(handlers.get(n) || [])]) out = f(...a); return out; },
    };
    const ctx = {
        name1: '阿明', name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {},
        eventSource, eventTypes: T, getCurrentChatId: () => 'chat-1',
        setExtensionPrompt(key, value) { this.extensionPrompts[key] = { value }; }, saveMetadata() {},
    };
    return { ctx, eventSource };
}

function setup(extra = {}, opts = {}) {
    const h = host();
    const settings = { enabled: true, ...extra };
    const checks = [];
    const notices = [];
    const rt = createStatsRuntime({ getContext: () => h.ctx, readSettings: () => settings, onCheck: (c) => checks.push(c), onNotices: (n) => notices.push(n), ...opts });
    rt.sync();
    return { h, rt, settings, checks, notices };
}

function generate(h, text, type = 'normal') {
    h.eventSource.emit('gs', type, {}, false);
    const injected = h.ctx.extensionPrompts[STATS_PROMPT_KEY]?.value || '';
    if (type === 'continue') h.ctx.chat[h.ctx.chat.length - 1].mes += text;
    else h.ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
    const id = h.ctx.chat.length - 1;
    h.eventSource.emit('ge', id);
    return { id, injected };
}

test('roll 标签解析：难度、对抗、新技能属性顺序不限；所有出口剥除', () => {
    const { directives } = parseStatDirectives('[igs-stat:roll|开锁|困难|敏捷][igs-stat:roll|话术|对抗:林晚|心理学]【igs-stat：roll｜侦查｜很难】');
    assert.deepEqual(directives[0], { kind: 'roll', skill: '开锁', difficulty: '困难', attribute: '敏捷' });
    assert.deepEqual(directives[1], { kind: 'roll', skill: '话术', difficulty: '普通', against: '林晚', opposedSkill: '心理学' });
    assert.equal(directives[2].difficulty, '极难');
    assert.equal(stripStatDirectives('她点头。[igs-stat:roll|侦查|困难]').trim(), '她点头。');
    assert.equal(stripMarkerDirectives('她点头。[igs-stat:roll|侦查|困难]').trim(), '她点头。');
});

test('预掷：没有输入匹配时注入骰运表；AI 打 roll 标签后按同一颗骰结算并播放掷骰卡（§5.2）', () => {
    const { h, rt, checks } = setup();
    rt.enableForChat();
    h.ctx.chat.push({ is_user: true, mes: '我们继续往前走' });
    const { id, injected } = generate(h, '你屏住呼吸观察四周。[igs-stat:roll|侦查|普通]');
    assert.match(injected, /【本轮骰运】/);
    assert.match(injected, /【主角技能】属性：/);
    assert.match(injected, /【主角感知】/);
    assert.doesNotMatch(injected, /1d100=/);
    const entry = rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0));
    assert.equal(entry.meta.check.skill, '侦查');
    assert.equal(entry.meta.check.source, 'roll');
    assert.equal(entry.meta.note.source, 'roll');
    assert.equal(checks.length, 1);
    assert.match(rt.diagnose(id), /检定来源 预掷 · 侦查/);
});

test('预掷：AI 没打标签按无检定，诊断写明原因；故事中检定关闭时不注入骰运表', () => {
    const { h, rt, settings } = setup();
    rt.enableForChat();
    h.ctx.chat.push({ is_user: true, mes: '随便走走' });
    const { id } = generate(h, '天气很好。');
    assert.match(rt.diagnose(id), /AI 没有打 roll 标签/);
    settings.storyCheck = 'off';
    h.ctx.chat.push({ is_user: true, mes: '随便走走' });
    assert.doesNotMatch(generate(h, '还是很好。').injected, /本轮骰运/);
});

test('roll 标签里的新技能：登记进剧情技能、进补全队列，按未学基础值算（§6.1）', () => {
    const { h, rt } = setup();
    rt.enableForChat();
    h.ctx.chat.push({ is_user: true, mes: '试试看' });
    const { id } = generate(h, '你掏出发卡。[igs-stat:roll|撬保险柜|困难|敏捷]');
    const cat = rt.getCatalog();
    assert.ok(cat.story.some((s) => s.name === '撬保险柜' && s.attribute === '敏捷'));
    assert.ok(cat.queue.skills.includes('撬保险柜'));
    assert.equal(rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0)).meta.check.skill, '撬保险柜');
});

test('后台请求触发的生成事件不注入、不结算（N2）', () => {
    let bg = false;
    const { h, rt } = setup({}, { isBackground: () => bg });
    rt.enableForChat();
    bg = true;
    h.eventSource.emit('gs', 'normal', {}, false);
    assert.equal(h.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined);
    h.ctx.chat.push({ is_user: false, mes: '{"小雪":{}}', swipe_id: 0 });
    h.eventSource.emit('ge', h.ctx.chat.length - 1);
    assert.equal(rt.getLedger().entries.size, 0);
});

test('选项骰子走 IGS 引擎：结果按当前体系、元叙事格式不变；发送后本楼沿用，不再按输入重掷（§5.1、N6）', () => {
    const { h, rt } = setup({ ruleset: 'dnd5e' });
    rt.enableForChat();
    const r = rt.resolveDice('检定 <user> 侦查 难度=困难', { userName: '阿明' });
    assert.equal(r.ok, true);
    assert.match(r.line, /^元叙事：阿明发起了【侦查】检定（困难），d20\(\d+\)[+-]\d+=\d+，DC20/);
    assert.equal(r.detail.die, 20);
    h.ctx.chat.push({ is_user: true, mes: `我搜查房间。 <meta:检定结果>\n${r.line}\n</meta:检定结果>` });
    const { id, injected } = generate(h, '你翻遍了抽屉。');
    assert.match(injected, /【本轮检定】侦查（困难）：d20/);
    const check = rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0)).meta.check;
    assert.equal(check.source, 'option');
    assert.equal(check.roll, r.roll);
    assert.ok(rt.diceChance('检定 <user> 侦查 难度=困难').chance >= 0);
});

test('数值系统未启用时选项骰子返回 null，交回 AcuDice', () => {
    const { rt } = setup();
    assert.equal(rt.resolveDice('检定 <user> 侦查'), null);
});

test('v1 存档自动迁移：底数不变，首次写回前留一份备份，只备份一次（§3.5）', () => {
    const { h, rt } = setup();
    const ledger = createStatsLedger('chat-1', createStatsState());
    const v1 = { ...serializeLedger(ledger, { chatEnabled: true }), version: 1 };
    delete v1.catalog;
    h.ctx.chatMetadata[STATS_METADATA_KEY] = v1;
    h.eventSource.emit('chat');
    assert.equal(rt.isChatEnabled(), true);
    h.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(h, '[igs-stat:favor|小雪|开心]');
    assert.equal(h.ctx.chatMetadata[STATS_BACKUP_KEY].version, 1);
    assert.equal(h.ctx.chatMetadata[STATS_METADATA_KEY].version, 2);
    assert.deepEqual(h.ctx.chatMetadata[STATS_METADATA_KEY].catalog.story, emptyCatalog().story);
    assert.deepEqual(h.ctx.chatMetadata[STATS_METADATA_KEY].catalog.sheets, {});
    h.ctx.chatMetadata[STATS_BACKUP_KEY] = 'kept';
    h.eventSource.emit('chat');
    generate(h, '[igs-stat:favor|小雪|开心]');
    assert.equal(h.ctx.chatMetadata[STATS_BACKUP_KEY], 'kept');
    const back = deserializeLedger(h.ctx.chatMetadata[STATS_METADATA_KEY], 'chat-1');
    assert.equal(back.ok, true);
    assert.equal(back.migrated, false);
});

test('开局引导：总开关开、本聊天未定时出提示；选「本聊天不用」后不再出；「自动快速开始」直接启用（§9.5）', () => {
    const ask = setup({ newChat: 'ask' });
    assert.ok(ask.rt.notices().some((n) => n.id === 'onboarding'));
    ask.rt.noticeAction('onboarding', 'decline');
    ask.h.eventSource.emit('chat');
    assert.ok(!ask.rt.notices().some((n) => n.id === 'onboarding'));
    const auto = setup({ newChat: 'auto' });
    assert.equal(auto.rt.isChatEnabled(), true);
});

test('新角色出现时提醒生成数值；生成请求只收档位，写进聊天级角色卡并可跨聊天沿用（§6.4）', async () => {
    const stored = new Map();
    const sheetStore = { get: (card, name) => stored.get(`${card}|${name}`) || null, put: (card, name, sheet) => { stored.set(`${card}|${name}`, sheet); return { ok: true }; } };
    const reply = JSON.stringify({ 小雪: { 资历: '老手', 属性: { 观察: '出众', 力量: 42 }, 技能: { 话术: '熟练', 说服: '精通' }, 招牌技能: [{ 名: '茶艺', 属性: '敏捷' }] } });
    const { h, rt } = setup({}, { getBackgroundRequest: () => async () => reply, sheetStore });
    rt.enableForChat();
    h.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(h, '[igs-stat:favor|小雪|开心]');
    assert.ok(rt.notices().some((n) => n.id === 'sheets' && /小雪/.test(n.text)));
    const r = await rt.noticeAction('sheets', 'generate');
    assert.equal(r.ok, true);
    const sheet = rt.getCatalog().sheets.小雪;
    assert.equal(sheet.rank, '老手');
    assert.ok(sheet.attributes.观察 >= 60 && sheet.attributes.观察 <= 70);
    assert.ok(sheet.attributes.力量 >= 45 && sheet.attributes.力量 <= 55);
    assert.ok(sheet.skills.话术 >= 75);
    assert.ok(rt.getCatalog().story.some((s) => s.name === '茶艺'));
    assert.ok(stored.has('小雪|小雪'));
});

test('角色卡解析：整份坏 JSON 不写；数字档位整格丢弃；同名同聊天取值稳定（N3、N4）', () => {
    const registry = createSkillRegistry({});
    assert.equal(parseSheetReply('不是 JSON', { names: ['甲'], registry }).ok, false);
    const r = parseSheetReply('{"甲":{"属性":{"敏捷":"80"},"技能":{"潜行":"熟练"}}}', { names: ['甲'], registry });
    assert.equal(r.ok, true);
    assert.deepEqual(r.sheets.甲.attributes, {});
    const a = sheetFromTiers('甲', r.sheets.甲, { chatSeed: 'c' });
    const b = sheetFromTiers('甲', r.sheets.甲, { chatSeed: 'c' });
    assert.deepEqual(a, b);
});

test('批量补全：已有非临时值不改，只填空；主角最多补到熟练', () => {
    const fills = parseBackfillReply('{"甲":{"开锁":"大师"},"主角":{"开锁":"大师"}}', { names: ['甲', '主角'], skills: ['开锁'] });
    assert.equal(fills.ok, true);
    const kept = applyBackfillToSheet({ skills: { 开锁: 40 }, provisional: {} }, fills.fills.甲, { name: '甲' });
    assert.equal(kept.skills.开锁, 40);
    const filled = applyBackfillToSheet({ skills: { 开锁: 40 }, provisional: { 开锁: true } }, fills.fills.甲, { name: '甲' });
    assert.ok(filled.skills.开锁 >= 90);
});

test('剧情技能上限：每聊天 24 个，一楼 2 个；已知名字与别名归并', () => {
    let catalog = {};
    assert.equal(registerStorySkill(catalog, '搜查').name, '侦查');
    assert.equal(registerStorySkill(catalog, '洞察').name, '观察');
    for (let i = 0; i < STORY_SKILL_MAX; i += 1) catalog = registerStorySkill(catalog, `技能${String.fromCharCode(0x4e00 + i)}`).catalog;
    assert.equal(registerStorySkill(catalog, '再来一个').reason, 'capped');
    assert.equal(registerStorySkill({}, '炼丹', { createdThisFloor: 2 }).reason, 'floor-capped');
});

test('社交检定失败时对象的正向好感降一档；成功不变（§7.2）', () => {
    const d = [{ kind: 'favor', target: '小雪', dim: '好感', value: '心动' }, { kind: 'favor', target: '阿强', dim: '好感', value: '开心' }];
    const failed = constrainFavor(d, { social: true, success: false, toward: '小雪' });
    assert.equal(failed[0].value, '开心');
    assert.equal(failed[1].value, '开心');
    assert.deepEqual(constrainFavor(d, { social: true, success: true, toward: '小雪' }), d);
    const s = createStatsState();
    const state = { ...s, characters: { 小雪: { ...createCharacter(1), dims: { 好感: 10, 信任: 0, 了解: 0 } } } };
    const r = settleFloorText(state, '[igs-stat:favor|小雪|心动]', { random: () => 0.99, check: { social: true, success: false, toward: '小雪', actor: '主角', skill: '话术' }, engine: createEngine() });
    assert.match(r.changes.find((c) => c.target === '小雪').note, /检定失败/);
});

test('战斗按 D&D：攻击检定对 AC，闪避为敏捷豁免；战败不死（§7.3）', () => {
    const engine = createEngine({}, { ruleset: 'dnd5e' });
    const r = settleFloorText(createStatsState({ money: 100 }), '[igs-stat:battle|杂兵]', { random: () => 0.01, engine });
    assert.equal(r.meta.events.find((e) => e.kind === 'battle').ruleset, 'dnd5e');
    assert.equal(r.meta.flags.battle.outcome, '败');
    assert.ok(r.state.protagonist.bars.health > 0);
});
