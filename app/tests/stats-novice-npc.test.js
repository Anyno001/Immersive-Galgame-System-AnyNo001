import test from 'node:test';
import assert from 'node:assert/strict';
import {
    NPC_SKILL_OFFSETS, applyBackfillToSheet, npcSkillTier, npcSkillValue, parseBackfillReply, parseSheetReply, sheetFromTiers, strongSkills,
} from '../src/scene/stats/stat-sheets.js';
import { createEngine, markCheckOpponents, markNpcGrowth, npcGrowthBonus, profileOf } from '../src/scene/stats/stat-engine.js';
import { settleDay, settleSkip } from '../src/scene/stats/stat-day.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createSkillRegistry } from '../src/scene/stats/stat-registry.js';
import { composeStatsHud } from '../src/scene/stats/stat-metrics.js';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { growthResults } from '../src/scene/stats/stat-fx.js';
import { buildStatsPageValues } from '../src/visual/igs-ui/stats-settings-fields.js';
import { getPageTemplate } from '../src/visual/igs-ui/settings-tabs.js';
import { renderTemplate } from '../src/visual/igs-ui/settings-fields.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';

const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
const withHeroSkill = (state, name, value) => ({ ...state, protagonist: { ...state.protagonist, skills: { ...state.protagonist.skills, [name]: { value, marked: false } } } });
const withNpc = (state, name, character = {}) => ({ ...state, characters: { ...state.characters, [name]: { ...createCharacter(1), ...character } } });
const engineWith = (sheets) => createEngine({ sheets }, { ruleset: 'coc7' }, 'coc7');
const BASE_SHEET = { rank: '普通人', attributes: { 力量: 10, 敏捷: 10, 体质: 10, 智力: 10, 感知: 10, 魅力: 10 }, scale: 'score', provisional: {}, signature: [] };

// ---------- 相对档换算 ----------
test('NPC 技能档：以主角同项值加偏移，同档内确定性抖动不超过 5，夹在 5–95', () => {
    for (const [tier, offset] of Object.entries(NPC_SKILL_OFFSETS)) {
        const value = npcSkillValue(tier, 60, `c|甲|话术`);
        assert.ok(Math.abs(value - Math.min(95, Math.max(5, 60 + offset))) <= 5, `${tier}:${value}`);
        assert.equal(value, npcSkillValue(tier, 60, `c|甲|话术`));
    }
    assert.ok(npcSkillValue('生疏', 20, 'x') >= 5);
    assert.ok(npcSkillValue('大师', 90, 'x') <= 95);
    assert.ok(npcSkillValue('大师', 90, 'x') >= 90);
});

test('主角没有这项技能时以 50 为基准；未学不生成值', () => {
    const v = npcSkillValue('相当', null, 'c|甲|开锁');
    assert.ok(v >= 45 && v <= 55);
    assert.equal(npcSkillValue('相当', 0, 'c|甲|开锁'), v);
    assert.equal(npcSkillValue('未学', 60, 'x'), null);
});

test('旧档名兼容：入门、熟练按旧绝对区间；精通、大师新旧同名，按相对档处理', () => {
    assert.equal(npcSkillTier('入门'), '入门');
    const low = npcSkillValue('入门', 90, 'c|甲|x');
    assert.ok(low >= 25 && low <= 45);
    const mid = npcSkillValue('熟练', 10, 'c|甲|x');
    assert.ok(mid >= 50 && mid <= 70);
    assert.equal(npcSkillTier('精通'), '精通');
    const expert = npcSkillValue('精通', 40, 'c|甲|x');
    assert.ok(expert >= 65 && expert <= 75);
    assert.equal(npcSkillTier('80'), null);
    assert.equal(npcSkillTier('擅长'), '擅长');
});

test('角色卡解析收相对档与旧档名；生成时按主角同项值换算并冻结', () => {
    const registry = createSkillRegistry({});
    const parsed = parseSheetReply('{"甲":{"技能":{"话术":"擅长","开锁":"熟练"}}}', { names: ['甲'], registry });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.sheets.甲.skills, { 话术: '擅长', 开锁: '熟练' });
    const hero = (skill) => (skill === '话术' ? 60 : null);
    const sheet = sheetFromTiers('甲', parsed.sheets.甲, { chatSeed: 'c', heroSkill: hero });
    assert.ok(sheet.skills.话术 >= 70 && sheet.skills.话术 <= 80);
    assert.ok(sheet.skills.开锁 >= 50 && sheet.skills.开锁 <= 70);
    const later = sheetFromTiers('甲', parsed.sheets.甲, { chatSeed: 'c', heroSkill: () => 90 });
    assert.notEqual(later.skills.话术, sheet.skills.话术);
    const engine = engineWith({ 甲: sheet });
    const before = profileOf(engine, withHeroSkill(createStatsState(), '话术', 60), '甲', '话术').value;
    const after = profileOf(engine, withHeroSkill(createStatsState(), '话术', 90), '甲', '话术').value;
    assert.equal(before, sheet.skills.话术);
    assert.equal(after, before);
});

test('批量补全：NPC 按相对档、主角按绝对档解析与换算', () => {
    const r = parseBackfillReply('{"甲":{"开锁":"擅长"},"主角":{"开锁":"熟练"}}', { names: ['甲', '主角'], skills: ['开锁'] });
    assert.deepEqual(r.fills, { 甲: { 开锁: '擅长' }, 主角: { 开锁: '熟练' } });
    const sheet = applyBackfillToSheet({ skills: {}, provisional: {} }, r.fills.甲, { name: '甲', chatSeed: 'c', heroSkill: () => 40 });
    assert.ok(sheet.skills.开锁 >= 50 && sheet.skills.开锁 <= 60);
    assert.equal(parseBackfillReply('{"主角":{"开锁":"擅长"}}', { names: ['主角'], skills: ['开锁'] }).fills.主角.开锁, '熟练');
});

// ---------- NPC 成长 ----------
test('对抗检定的对手打成长勾；主角、未登记角色、属性不打勾', () => {
    const state = withNpc(createStatsState(), '小雪');
    const marked = markCheckOpponents(state, { opposed: { actor: '小雪', skill: '话术' } });
    assert.equal(marked.characters.小雪.skillGrowth.话术.marked, true);
    assert.equal(markCheckOpponents(state, { opposed: { actor: '主角', skill: '话术' } }), state);
    assert.equal(markNpcGrowth(state, '路人', '话术'), state);
    assert.equal(markNpcGrowth(state, '小雪', '力量'), state);
    assert.equal(markNpcGrowth(marked, '小雪', '话术'), marked);
});

test('日结算：打勾的 NPC 技能掷 d100 后再对半，通过才成长；成长幅度同主角，成长记进变动记录', () => {
    const engine = engineWith({ 小雪: { ...BASE_SHEET, skills: { 话术: 40 } } });
    const start = markNpcGrowth(withNpc(createStatsState(), '小雪'), '小雪', '话术');
    const valueOf = (st, name, skill) => profileOf(engine, st, name, skill).value;
    const changes = [];
    const grown = settleDay(start, { random: seq(0.99, 0.99, 0.1, 0.5), changes, skillValueOf: valueOf });
    assert.equal(grown.characters.小雪.skillGrowth.话术.marked, false);
    assert.ok(grown.characters.小雪.skillGrowth.话术.bonus >= 1 && grown.characters.小雪.skillGrowth.话术.bonus <= 10);
    const row = changes.find((c) => c.target === '小雪' && c.note === '成长');
    assert.equal(row.key, '话术');
    assert.equal(row.to - row.from, grown.characters.小雪.skillGrowth.话术.bonus);
    assert.equal(profileOf(engine, grown, '小雪', '话术').value, row.to);
    assert.deepEqual(growthResults(changes).map((g) => g.target), ['小雪']);
    assert.equal(strongSkills({ skills: { 话术: 70 } }, { 话术: { bonus: 8 } }), '话术（精通）');

    const halved = settleDay(start, { random: seq(0.99, 0.99, 0.9, 0.5), changes: [], skillValueOf: valueOf });
    assert.equal(halved.characters.小雪.skillGrowth.话术.bonus, 0);
    assert.equal(halved.characters.小雪.skillGrowth.话术.marked, false);
    const failed = settleDay(start, { random: seq(0.11, 0.11, 0.1, 0.5), changes: [], skillValueOf: valueOf });
    assert.equal(failed.characters.小雪.skillGrowth.话术.bonus, 0);
});

test('没有勾的 NPC 不消耗随机数，主角成长结果不受影响', () => {
    let draws = 0;
    const random = () => { draws += 1; return 0.5; };
    settleDay(withNpc(createStatsState(), '小雪'), { random, changes: [] });
    const heroOnly = draws;
    draws = 0;
    settleDay(createStatsState(), { random, changes: [] });
    assert.equal(heroOnly, draws);
    const skipped = settleSkip(markNpcGrowth(withNpc(createStatsState(), '小雪'), '小雪', '话术'), 3, { random: seq(0.11), changes: [] });
    assert.equal(skipped.characters.小雪.skillGrowth.话术.marked, false);
});

test('成长上限：不超过 90，已高于 90 的冻结值不被压低', () => {
    const engine = engineWith({ 小雪: { ...BASE_SHEET, skills: { 话术: 88, 开锁: 95 } } });
    const state = { ...withNpc(createStatsState(), '小雪'), };
    const grown = { ...state, characters: { 小雪: { ...state.characters.小雪, skillGrowth: { 话术: { bonus: 20, marked: false }, 开锁: { bonus: 5, marked: false } } } } };
    assert.equal(profileOf(engine, grown, '小雪', '话术').value, 90);
    assert.equal(profileOf(engine, grown, '小雪', '开锁').value, 95);
    assert.equal(npcGrowthBonus(grown, '小雪', '话术'), 20);
});

test('剧情成长标签：只给已登记的 NPC，同一角色同一技能每个游戏日一次，AI 不给数字', () => {
    const parsed = parseStatDirectives('[igs-stat:grow|小雪|话术][igs-stat:grow|小雪|话术5][igs-stat:grow|小雪]');
    assert.deepEqual(parsed.directives, [{ kind: 'grow', target: '小雪', skill: '话术' }]);
    assert.equal(parsed.diagnostics.length, 2);
    const engine = engineWith({ 小雪: { ...BASE_SHEET, skills: { 话术: 40 } } });
    const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
    const first = settleFloorText(createStatsState(), '[igs-stat:grow|小雪|话术]', { random: seq(0.5), resolveCharacter, engine });
    const bonus = first.state.characters.小雪.skillGrowth.话术.bonus;
    assert.ok(bonus >= 1 && bonus <= 10);
    assert.equal(first.changes.find((c) => c.note === '成长').target, '小雪');
    assert.equal(first.state.characters.小雪.skillGrowth.话术.tagDay, 1);
    const again = settleFloorText(first.state, '[igs-stat:grow|小雪|话术]', { random: seq(0.5), resolveCharacter, engine });
    assert.equal(again.state.characters.小雪.skillGrowth.话术.bonus, bonus);
    assert.ok(again.meta.diagnostics.some((d) => d.code === 'stat-grow-daily-limit'));
    const nextDay = { ...first.state, clock: { ...first.state.clock, day: 2 } };
    const third = settleFloorText(nextDay, '[igs-stat:grow|小雪|话术]', { random: seq(0.5), resolveCharacter, engine });
    assert.ok(third.state.characters.小雪.skillGrowth.话术.bonus > bonus);
    const unknown = settleFloorText(createStatsState(), '[igs-stat:grow|路人|话术][igs-stat:grow|<user>|话术]', { random: seq(0.5), resolveCharacter, engine });
    assert.deepEqual(Object.keys(unknown.state.characters), []);
});

test('结算里 NPC 作为对手的检定打勾，次日结算时成长', () => {
    const engine = engineWith({ 小雪: { ...BASE_SHEET, skills: { 话术: 40 } } });
    const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
    const state = withNpc(createStatsState(), '小雪');
    const check = { actor: '主角', skill: '话术', success: true, opposed: { actor: '小雪', skill: '话术', value: 40 } };
    const r = settleFloorText(state, '她笑了笑。', { random: seq(0.5), resolveCharacter, engine, check });
    assert.equal(r.state.characters.小雪.skillGrowth.话术.marked, true);
    const viaStory = settleFloorText(state, '他们较量。', { random: seq(0.5), resolveCharacter, engine, npcChecks: [{ actor: '小雪', skill: '话术' }, { actor: '路人', skill: '话术' }] });
    assert.equal(viaStory.state.characters.小雪.skillGrowth.话术.marked, true);
    assert.equal(viaStory.state.characters.路人, undefined);
});

// ---------- 状态栏常驻主角区 ----------
const heroBlock = { name: '阿明', metrics: [{ label: '体力', percent: 60, display: '60', colorKey: 'slot-2' }] };
const charModel = (over = {}) => ({ enabled: true, character: '小雪', metrics: [{ label: '好感', percent: 10, display: '平淡' }], hiddenCount: 0, relation: '', ...over });
const heroLookup = (name) => (name === '阿明' || name === '主角' ? { metrics: heroBlock.metrics, stages: [] } : null);
const lookup = (name) => heroLookup(name) || (name === '小雪' ? { metrics: [{ label: '好感', percent: 30, display: '熟人' }], stages: [] } : null);

test('状态栏开着：旁白页与其他角色说话时不加主角区', () => {
    const narration = composeStatsHud(charModel({ character: '', metrics: [] }), { lookup, speaker: '' });
    assert.equal(narration.hero, undefined);
    const other = composeStatsHud(charModel(), { lookup, speaker: '小雪' });
    assert.equal(other.hero, undefined);
    assert.equal(other.metrics[0].display, '熟人');
});

test('状态栏开着：说话人是主角时显示主角条', () => {
    const own = composeStatsHud(charModel({ character: '阿明' }), { lookup, speaker: '阿明' });
    assert.equal(own.hero, undefined);
    assert.equal(own.metrics, heroBlock.metrics);
});

test('状态栏关着：什么都不加，也不替换', () => {
    const off = charModel({ enabled: false, metrics: [] });
    assert.equal(composeStatsHud(off, { lookup, speaker: '小雪' }), off);
    assert.equal(composeStatsHud(off, { lookup, speaker: '' }).hero, undefined);
    const on = charModel();
    assert.equal(composeStatsHud(on, { lookup, speaker: '' }), on);
});

// ---------- 设置页版面 ----------
const sectionOrder = (html) => ['我的角色', '玩法', '其他角色', '高级'].map((title) => html.indexOf(`>${title}`));
function page(over = {}) {
    const stats = normalizeStatsSettings({ enabled: true, ...(over.stats || {}) });
    const values = buildStatsPageValues({ stats, chat: over.chat === undefined ? { hasChat: true, enabled: false } : over.chat, archive: over.archive || null, combatOn: false });
    return renderTemplate(getPageTemplate('stats'), values);
}

test('数值页分区顺序：我的角色、玩法、其他角色、高级；页面上不出现 CoC、D&D 字样的主选项', () => {
    const html = page();
    const at = sectionOrder(html);
    assert.ok(at.every((i) => i >= 0), String(at));
    assert.deepEqual([...at].sort((a, b) => a - b), at);
    const visible = html.slice(0, html.indexOf('data-advanced="stats-more"'));
    assert.doesNotMatch(visible, /CoC|D&D/);
    assert.match(html, /data-segment-path="bridge\.stats\.ruleset" data-segment-value="coc7"/);
    assert.match(html, /百分骰[\s\S]*二十面骰/);
    assert.match(html, /data-segment-path="bridge\.stats\.favorMode" data-segment-value="hard"/);
});

test('我的角色：未开始显示快速开始与自己建卡，已开始显示角色卡与暂停', () => {
    const idle = page();
    assert.match(idle, /data-action="stats-build-mode:manual"/);
    const archive = { day: 3, bars: { stamina: 70, stress: 10, money: 20 }, wallet: 20, vitals: null, attributes: [{ name: '力量', display: '10' }], skills: [{ name: '话术', value: 50, display: '50', marked: true }], characters: [], log: [], total: 0, checks: [], story: [], sheets: [], pendingPeople: [], pendingSkills: [] };
    const started = page({ chat: { hasChat: true, enabled: true }, archive });
    assert.match(started, /力量 10/);
    assert.match(started, /话术<\/span><b>50<i[^>]*aria-label="今日可成长"[^>]*>✓/);
    assert.match(started, /data-action="stats-chat-disable"/);
    assert.doesNotMatch(started, /本聊天已开始|暂停后数值冻结|AI只负责|由脚本结算/);
    const startRow = idle.match(/<div class="igs-settings-row"( hidden[^>]*)?>\s*<button class="igs-settings-action" data-action="stats-chat-enable"/);
    assert.ok(startRow && !startRow[1]);
    const startedRow = started.match(/<div class="igs-settings-row"( hidden[^>]*)?>\s*<button class="igs-settings-action" data-action="stats-chat-enable"/);
    assert.ok(startedRow && startedRow[1]);
});

test('自己建卡：选了手动建档后，职业与六维加点直接出现在「我的角色」里并展开', () => {
    const html = page({ chat: { hasChat: true, enabled: false, pendingMode: 'manual' } });
    const mine = html.slice(html.indexOf('>我的角色'), html.indexOf('>玩法'));
    assert.match(mine, /bridge\.stats\.build\.className/);
    assert.match(mine, /data-advanced="stats-build" open/);
    assert.doesNotMatch(html.slice(html.indexOf('data-advanced="stats-more"')), /bridge\.stats\.build\.className/);
    const auto = page();
    assert.doesNotMatch(auto.slice(auto.indexOf('>我的角色'), auto.indexOf('>玩法')), /bridge\.stats\.build\./);
    assert.match(auto.slice(auto.indexOf('data-advanced="stats-more"')), /bridge\.stats\.build\.prefs\.major/);
});

test('数值系统关闭时下方整块隐藏', () => {
    const stats = normalizeStatsSettings({ enabled: false });
    const html = renderTemplate(getPageTemplate('stats'), buildStatsPageValues({ stats, chat: null, combatOn: false }));
    assert.match(html, /<div class="igs-stats-content" hidden>/);
});

// ---------- 状态栏渲染：主角区常驻 ----------
test('状态栏渲染：旁白页只有主角区也显示；有角色时主角区在前、角色条在后；状态栏关着隐藏', async () => {
    const { FakeEl, makeStage } = await import('./helpers/fake-dom.js');
    if (!Object.getOwnPropertyDescriptor(FakeEl.prototype, 'classList')) {
        Object.defineProperty(FakeEl.prototype, 'classList', { get() {
            const el = this;
            const list = () => String(el.className).split(/\s+/).filter(Boolean);
            return { add: (...n) => { el.className = [...new Set([...list(), ...n])].join(' '); }, remove: (...n) => { el.className = list().filter((x) => !n.includes(x)).join(' '); }, contains: (n) => list().includes(n), toggle(n, on) { if (on) this.add(n); else this.remove(n); } };
        } });
    }
    const { applyStatusHudToDom } = await import('../src/visual/igs-ui/reader-dom-render.js');
    const render = (hud) => {
        const root = makeStage({ hud: true });
        applyStatusHudToDom(root, { content: { statusHud: hud }, readerSettings: { statusHud: { enabled: hud.enabled } } });
        const host = root.querySelector('#igs-status-hud');
        return { host, blocks: host.children.filter((c) => /igs-hud-metrics/.test(c.className)), hidden: host.hasAttribute?.('hidden') || host.attrs.has('hidden') };
    };
    const hero = { name: '阿明', metrics: [{ label: '体力', percent: 50, display: '50', colorKey: 'slot-2' }, { label: '金钱', percent: 4, display: '120', colorKey: 'slot-3' }] };
    const base = { enabled: true, character: '', location: '', metrics: [], avatarRadius: 'circle' };
    const narration = render({ ...base, hero });
    assert.equal(narration.hidden, false);
    assert.equal(narration.blocks.length, 1);
    assert.match(narration.blocks[0].className, /igs-hud-hero/);
    assert.equal(narration.blocks[0].children.length, 2);
    const withChar = render({ ...base, character: '小雪', metrics: [{ label: '好感', percent: 30, display: '熟人', colorKey: 'favor' }], hero });
    assert.deepEqual(withChar.blocks.map((b) => /igs-hud-hero/.test(b.className)), [true, false]);
    assert.equal(withChar.blocks[1].children.length, 1);
    const plain = render({ ...base, character: '小雪', metrics: [{ label: '好感', percent: 30, display: '熟人', colorKey: 'favor' }] });
    assert.deepEqual(plain.blocks.map((b) => /igs-hud-hero/.test(b.className)), [false]);
    const nothing = render({ ...base });
    assert.equal(nothing.hidden, true);
    assert.equal(nothing.blocks.length, 0);
    const off = render({ ...base, enabled: false, character: '小雪', hero });
    assert.equal(off.hidden, true);
    assert.equal(off.blocks.length, 0);
});
