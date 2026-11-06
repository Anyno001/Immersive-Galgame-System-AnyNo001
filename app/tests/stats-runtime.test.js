import test from 'node:test';
import assert from 'node:assert/strict';
import { STATS_PROMPT_KEY, createStatsRuntime } from '../src/core/stats-runtime.js';
import { STATS_METADATA_KEY } from '../src/scene/stats/stat-persist.js';
import { serializeLedger } from '../src/scene/stats/stat-persist.js';
import { createStatsLedger } from '../src/scene/stats/stat-ledger.js';
import { ledgerKey } from '../src/scene/stats/stat-ledger.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function fakeHost() {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
        count() { let k = 0; for (const s of handlers.values()) k += s.size; return k; },
    };
    let saves = 0;
    const ctx = {
        name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {},
        eventSource, eventTypes: T, getCurrentChatId: () => 'chat-1',
        setExtensionPrompt(key, value, position) { this.extensionPrompts[key] = { value, position }; },
        saveMetadata() { saves += 1; },
    };
    return { ctx, eventSource, saves: () => saves };
}

// 内存版数值日志表：和宿主 statsTables 同形，read 返回 { ok, stats }，append 追加，version 随写入递增。
function fakeTables({ exists = true } = {}) {
    const t = { rows: exists ? [] : null, version: 0, reads: 0 };
    t.api = () => ({
        ok: true,
        get version() { return t.version; },
        read() { t.reads += 1; return { ok: true, stats: t.rows ? t.rows.slice() : undefined }; },
        append(records) { t.rows.push(...records); t.version += 1; return Promise.resolve({ ok: true }); },
        ensure() { t.rows = t.rows || []; return Promise.resolve({ ok: true }); },
    });
    return t;
}

function setup(enabled = true, extra = {}, tableOpts = {}) {
    const host = fakeHost();
    // 设置按引用缓存规范化结果，所以改设置要换新对象，不能原地改。
    const holder = { cur: { enabled, ...extra } };
    const set = (patch) => { holder.cur = { ...holder.cur, ...patch }; };
    const tables = fakeTables(tableOpts);
    const make = (over = {}) => createStatsRuntime({ getContext: () => host.ctx, readSettings: () => holder.cur, statsTables: tables.api, ...over });
    const rt = make();
    rt.sync();
    return { host, rt, set, tables, make };
}

function reply(host, text, swipeId = 0) {
    host.ctx.chat.push({ is_user: false, mes: text, swipe_id: swipeId });
    return host.ctx.chat.length - 1;
}

function generate(host, text, type = 'normal') {
    host.eventSource.emit('gs', type, {}, false);
    const injected = host.ctx.extensionPrompts[STATS_PROMPT_KEY]?.value || '';
    const id = type === 'continue' ? host.ctx.chat.length - 1 : reply(host, text);
    if (type === 'continue') host.ctx.chat[id].mes += text;
    host.eventSource.emit('ge', id);
    return { id, injected };
}

const favor = (rt) => rt.getState()?.characters.小雪?.dims.好感;

test('总开关关闭时不挂任何监听；打开后挂上，再关掉全部解绑（易错点 H1）', () => {
    const { host, rt, set } = setup(false);
    assert.equal(host.eventSource.count(), 0);
    set({ enabled: true });
    rt.sync();
    assert.ok(host.eventSource.count() > 0);
    set({ enabled: false });
    rt.sync();
    assert.equal(host.eventSource.count(), 0);
});

test('本聊天未启用时不注入、不结算（易错点 H2）', () => {
    const { host, rt, tables } = setup();
    const { injected } = generate(host, '[igs-stat:favor|小雪|开心]');
    assert.equal(injected, '');
    assert.equal(rt.getState(), null);
    assert.equal(host.ctx.chatMetadata[STATS_METADATA_KEY], undefined);
    assert.equal(tables.rows.length, 0);
});

test('正常发送：生成前注入、结束后清除并结算一次，差分写进数据库表（易错点 A3/A6/B2）', async () => {
    const { host, rt, tables } = setup(true, { favorMode: 'hard' });
    rt.enableForChat();
    const { injected } = generate(host, '她笑了。[igs-stat:favor|小雪|开心]');
    assert.match(injected, /主角状态/);
    assert.equal(host.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined);
    assert.ok(favor(rt) >= 1);
    await rt.whenSaved();
    assert.ok(tables.rows.some((r) => r.type === 'init'));
    assert.ok(tables.rows.some((r) => r.type === 'floor'));
    assert.ok(tables.rows.some((r) => r.payload.key === 'chat:enabled' && r.payload.value === true));
    assert.equal(host.ctx.chatMetadata[STATS_METADATA_KEY], undefined);
    const before = favor(rt);
    host.eventSource.emit('ge', 1);
    assert.equal(favor(rt), before);
});

test('dryRun、quiet、代写生成不注入、不结算（易错点 A1）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    for (const [type, dry] of [['normal', true], ['quiet', false], ['impersonate', false]]) {
        host.eventSource.emit('gs', type, {}, dry);
        assert.equal(host.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined, type);
        reply(host, '[igs-stat:favor|小雪|感动]');
        host.eventSource.emit('ge');
    }
    assert.equal(rt.getState().characters.小雪, undefined);
});

test('继续生成按原种子对全文重算，标签不重复计入（易错点 A2）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|感动]');
    const first = favor(rt);
    generate(host, '她又笑了。', 'continue');
    assert.equal(favor(rt), first);
});

test('新 swipe 从上一楼状态重掷；切回旧 swipe 读取已存结果；删楼回退（易错点 B1/B3）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    const { id } = generate(host, '[igs-stat:favor|小雪|受伤]');
    assert.equal(favor(rt), -15);
    host.ctx.chat[id] = { is_user: false, mes: '[igs-stat:favor|小雪|失望]', swipe_id: 1 };
    host.eventSource.emit('sw', id);
    host.eventSource.emit('gs', 'swipe', {}, false);
    host.eventSource.emit('ge', id);
    assert.equal(favor(rt), -3);
    host.ctx.chat[id] = { is_user: false, mes: '[igs-stat:favor|小雪|受伤]', swipe_id: 0 };
    host.eventSource.emit('sw', id);
    assert.equal(favor(rt), -15);
    host.ctx.chat.pop();
    host.eventSource.emit('del', id);
    assert.equal(rt.getState().characters.小雪, undefined);
});

test('编辑 AI 楼正文后只重算该楼（易错点 A5）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    const { id } = generate(host, '[igs-stat:favor|小雪|开心]');
    host.ctx.chat[id].mes = '[igs-stat:favor|小雪|受伤]';
    host.eventSource.emit('upd', id);
    assert.equal(favor(rt), -15);
});

test('换聊天后从表里读回；旧版存档来自更新版本时拒绝导入且不覆盖', async () => {
    const { host, rt, tables, make } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    await rt.whenSaved();
    host.eventSource.emit('chat');
    assert.equal(rt.isChatEnabled(), true);
    assert.equal(favor(rt), -15);
    const fresh = fakeTables();
    const other = make({ statsTables: fresh.api });
    host.ctx.chatMetadata[STATS_METADATA_KEY] = { version: 99 };
    other.sync();
    assert.equal(other.enableForChat().reason, 'stats-save-newer');
    assert.deepEqual(host.ctx.chatMetadata[STATS_METADATA_KEY], { version: 99 });
    assert.equal(fresh.rows.length, 0);
    assert.ok(other.getDiagnostics().some((d) => d.code === 'stats-save-newer'));
    assert.ok(tables.rows.length > 0);
});

test('本聊天关闭后数值冻结，生成不结算', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    rt.disableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    assert.equal(favor(rt), -15);
});

test('人物数值数据源：本聊天启用时接管已登记角色，未启用或关闭时返回 null（易错点 H3）', () => {
    const { host, rt } = setup();
    assert.equal(rt.metricsLookup(), null);
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    const lookup = rt.metricsLookup();
    assert.equal(lookup('小雪').stages[0].value, '淡淡不喜');
    assert.deepEqual(lookup('路人'), { metrics: [], stages: [] });
    rt.disableForChat();
    assert.equal(rt.metricsLookup(), null);
});

test('总开关关闭时在设置页启用本聊天：先读存档，不用空账本覆盖；总开关关闭时设置页只用缓存不读表', async () => {
    const { host, rt, set, tables, make } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    await rt.whenSaved();
    set({ enabled: false });
    rt.sync();
    const cold = make({ readSettings: () => ({ enabled: false }) });
    cold.sync();
    assert.equal(host.eventSource.count(), 0);
    const reads = tables.reads;
    assert.deepEqual(cold.chatStatus(), { enabled: false, blocked: '', hasChat: true });
    assert.equal(cold.archive(), null);
    assert.equal(tables.reads, reads);
    assert.equal(cold.enableForChat().ok, true);
    assert.equal(cold.getState().characters.小雪.dims.好感, -15);
    assert.equal(cold.disableForChat().ok, true);
    assert.equal(cold.chatStatus().enabled, false);
    assert.equal(cold.getState().characters.小雪.dims.好感, -15);
});

test('先掷后写：命中技能时生成前掷骰并注入检定段，结算记录检定；继续生成沿用；关闭自动判断不掷（§4.1）', () => {
    const { host, rt, set } = setup();
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '我给她做一顿寿司' });
    const { id, injected } = generate(host, '她尝了一口。');
    assert.match(injected, /【本轮检定】烹饪：1d100=\d+，需≤\d+，结果【[^】]+】/);
    const checkOf = () => rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0)).meta.check;
    const check = checkOf();
    assert.equal(check.skill, '烹饪');
    assert.equal(Boolean(rt.getState().protagonist.skills.烹饪.marked), check.success);
    const cont = generate(host, '她又笑了。', 'continue');
    assert.match(cont.injected, new RegExp(`1d100=${check.roll}，`));
    assert.deepEqual(checkOf(), check);
    host.ctx.chat[id].mes += '（改）';
    host.eventSource.emit('upd', id);
    assert.deepEqual(checkOf(), check);
    set({ autoSkill: false });
    host.ctx.chat.push({ is_user: true, mes: '我去晨跑' });
    assert.doesNotMatch(generate(host, '跑完了。').injected, /本轮检定/);
    host.ctx.chat.push({ is_user: true, mes: '我们聊天' });
    set({ autoSkill: true });
    assert.doesNotMatch(generate(host, '聊了很久。').injected, /本轮检定/);
});

test('学习表存成聊天级键值：本地匹配使用学习词；坏条目读取时丢弃；表里没有学习词时按空表（§4.1A）', async () => {
    const { host, rt, tables, make } = setup();
    rt.enableForChat();
    await rt.whenSaved();
    assert.ok(!tables.rows.some((r) => String(r.payload.key || '').startsWith('learned:')));
    const row = (word, value, n) => ({ id: `sc|t|${n}`, type: 'learned', character: '主角', anchor: null, createdAt: 0, change: '', payload: { key: `learned:${word}`, value } });
    tables.rows.push(row('熬魔药', '烹饪', 1), row('熬3锅', '烹饪', 2), row('乱写', 42, 3));
    tables.version += 1;
    host.eventSource.emit('chat');
    assert.equal(rt.isChatEnabled(), true);
    host.ctx.chat.push({ is_user: true, mes: '我熬魔药' });
    assert.match(generate(host, '锅里冒泡。').injected, /【本轮检定】烹饪：/);
});

test('总开关关闭时 chatStatus/archive 不读表，缓存键（聊天 id + 表版本）不变就不重读', async () => {
    const { host, rt, tables } = setup();
    rt.enableForChat();
    await rt.whenSaved();
    const reads = tables.reads;
    for (let i = 0; i < 5; i += 1) { rt.chatStatus(); rt.archive(); }
    assert.equal(tables.reads, reads + 0);
    tables.version += 1;
    rt.sync();
    assert.ok(rt.getState());
});

test('CoC 与 D&D 的正文检定分流：CoC 注入百分骰序，D&D 注入 d20 骰序；同楼同 swipe 骰序恒定', () => {
    const coc = setup(true, { ruleset: 'coc7' });
    coc.rt.enableForChat();
    coc.host.ctx.chat.push({ is_user: true, mes: '我们继续' });
    const a = generate(coc.host, '她点头。').injected;
    assert.match(a, /d100/);
    const dnd = setup(true, { ruleset: 'dnd5e' }, {});
    dnd.rt.enableForChat();
    dnd.host.ctx.chat.push({ is_user: true, mes: '我们继续' });
    assert.doesNotMatch(generate(dnd.host, '她点头。').injected, /d100/);
    // 同一楼同一 swipe 的骰序恒定：再来一遍注入文本里的骰序相同
    const again = setup(true, { ruleset: 'coc7' });
    again.rt.enableForChat();
    again.host.ctx.chat.push({ is_user: true, mes: '我们继续' });
    const seq = (text) => text.match(/本层骰序[^\n]*/)?.[0];
    assert.equal(seq(generate(again.host, '她点头。').injected), seq(a));
});

test('正文检定回放：CoC 标签按楼内百分骰序结算，结果写进 meta.checks 并带规则体系', () => {
    const { host, rt } = setup(true, { ruleset: 'coc7' });
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '我们继续' });
    const { id } = generate(host, '[igs-check:主角|感知|普通]她看了一眼。');
    const entry = rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0));
    assert.equal(entry.meta.checks.length, 1);
    assert.equal(entry.meta.checks[0].ruleset, 'coc7');
    const replay = rt.checkReplayFor(id);
    assert.equal(replay.ok, true);
    assert.equal(replay.results.length, 1);
});

test('NPC 属性档：手改属性、导出 npcAbilities；理智单独存 san；旧卡属性迁移', async () => {
    const { host, rt } = setup();
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(host, '[igs-stat:favor|小雪|开心]');
    assert.equal(rt.npcAbilities('小雪'), null);
    assert.equal(rt.sheetOp('edit', '小雪', { skill: '力量', tier: '17' }).ok, true);
    assert.equal(rt.getCatalog().sheets.小雪.attributes.力量, 17);
    assert.equal(rt.getCatalog().sheets.小雪.scale, 'score');
    assert.equal(rt.sheetOp('edit', '小雪', { skill: '理智', tier: '60' }).ok, true);
    assert.equal(rt.getCatalog().sheets.小雪.san, 60);
    assert.equal(rt.sheetOp('edit', '小雪', { skill: '力量', tier: '不知道' }).reason, 'stats-sheet-edit-invalid');
    for (const a of ['敏捷', '体质', '智力', '感知', '魅力']) rt.sheetOp('edit', '小雪', { skill: a, tier: '普通' });
    const abilities = rt.npcAbilities('小雪');
    assert.equal(abilities.scores.str, 17);
    assert.ok(abilities.scores.dex >= 10 && abilities.scores.dex <= 11);
    await rt.whenSaved();
});

test('编辑技能：熟练度下拉写档位；删除让技能从列表消失（含剧情技能）；内置技能可改所属属性', async () => {
    const { host, rt } = setup();
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(host, '好。');
    const shown = () => rt.archive().skills.map((s) => s.name);
    assert.equal(rt.heroOp('edit', '烹饪', { tier: '熟练' }).ok, true);
    assert.equal(rt.heroOp('edit', '火尖枪', { tier: '精通' }).ok, true);
    assert.ok(shown().includes('烹饪') && shown().includes('火尖枪'));
    assert.ok(rt.getCatalog().story.some((s) => s.name === '火尖枪'));
    assert.equal(rt.skillOp('remove', '火尖枪').ok, true);
    assert.ok(!shown().includes('火尖枪'));
    assert.ok(!rt.getCatalog().story.some((s) => s.name === '火尖枪'));
    assert.equal(rt.skillOp('remove', '烹饪').ok, true);
    assert.ok(!shown().includes('烹饪'));
    assert.equal(rt.skillOp('edit', '烹饪', { attribute: '感知' }).ok, true);
    assert.equal(rt.archive().skillEdit.find((s) => s.name === '烹饪').attribute, '感知');
    assert.equal(rt.skillOp('edit', '烹饪', { attribute: '乱写' }).ok, false);
    await rt.whenSaved();
});

test('战斗扩展开启时总开关强制为开，本聊天不能关；结算丢弃 battle 标签', () => {
    const host = fakeHost();
    const tables = fakeTables();
    const rt = createStatsRuntime({ getContext: () => host.ctx, readSettings: () => ({ enabled: false }), statsTables: tables.api, combatEnabled: () => true });
    rt.sync();
    assert.ok(host.eventSource.count() > 0);
    assert.equal(rt.isChatEnabled(), true);
    assert.equal(rt.disableForChat().reason, 'stats-combat-locked');
    host.ctx.chat.push({ is_user: true, mes: '你好' });
    const { id } = generate(host, '[igs-stat:battle|杂兵]');
    const meta = rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0)).meta;
    assert.ok(meta.diagnostics.some((d) => d.code === 'stats-battle-skipped-combat'));
});

test('结算种子由聊天、楼序号、swipe 决定：两个独立运行得到同样的结算', () => {
    const run = () => {
        const { host, rt } = setup(true, { ruleset: 'dnd5e' });
        rt.enableForChat();
        host.ctx.chat.push({ is_user: true, mes: '我去晨跑' });
        const { id } = generate(host, '跑完了。[igs-stat:stamina|重]');
        return rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0)).seed;
    };
    assert.equal(run(), run());
});

test('statsTables 缺失时数值系统停摆并给出原因，不抛错、不写任何东西', () => {
    const host = fakeHost();
    const rt = createStatsRuntime({ getContext: () => host.ctx, readSettings: () => ({ enabled: true }) });
    rt.sync();
    assert.equal(rt.enableForChat().reason, 'stats-db-missing');
    assert.equal(rt.chatStatus().blocked, 'stats-db-missing');
});
