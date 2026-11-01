import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';

const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' || name === '雪' ? '小雪' : null);
function settle(text, opts = {}, state = createStatsState()) { return settleFloorText(state, text, { random: high, resolveCharacter, ...opts }); }
function stateWith(bars, clock = {}) {
    const s = createStatsState();
    return { ...s, clock: { ...s.clock, ...clock }, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, ...bars } } };
}

test('一楼 10 个感动只结算一次，同维度取最强方向（易错点 C5）', () => {
    const r = settle('[igs-stat:favor|小雪|感动]'.repeat(10));
    assert.equal(r.state.characters.小雪.dims.好感, 3);
    assert.equal(r.changes.filter((c) => c.key === '好感').length, 1);
    assert.equal(settle('[igs-stat:favor|小雪|开心][igs-stat:favor|小雪|受伤]').state.characters.小雪.dims.好感, -6);
});

test('送礼与好感标签共用单楼 +3 上限，别名归到主名', () => {
    const r = settle('[igs-stat:favor|雪|感动][igs-stat:gift|小雪|甜点]');
    assert.equal(r.state.characters.小雪.dims.好感, 3);
    assert.equal(r.state.characters.雪, undefined);
});

test('路人、主角、未开 NSFW 的欲望标签不结算并记诊断（易错点 C3/E5）', () => {
    const r = settle('[igs-stat:favor|路人甲|开心][igs-stat:favor|<user>|开心][igs-stat:desire|小雪|上升]');
    assert.deepEqual(Object.keys(r.state.characters), []);
    assert.deepEqual(r.meta.diagnostics.map((d) => d.code), ['stat-unknown-character', 'stat-user-target', 'stat-dim-disabled']);
    assert.equal(settle('[igs-stat:desire|小雪|上升]', { nsfw: true }).state.characters.小雪.dims.欲望, 2);
});

test('sleep 标签和「第二天」同楼只跨一天（易错点 D1）', () => {
    const r = settle('她睡下了。第二天一早……[igs-stat:sleep]');
    assert.equal(r.state.clock.day, 2);
    assert.equal(r.meta.flags.dayAdvance, 'sleep');
});

test('引号台词与回忆里的跨天字样不算，标签不论位置照常结算（易错点 C6）', () => {
    assert.equal(settle('她说：“第二天见。”').state.clock.day, 1);
    assert.equal(settle('她回忆起第二天发生的事。').state.clock.day, 1);
    assert.equal(settle('她说：“[igs-stat:sleep]”').state.clock.day, 2);
});

test('钟点只作辅助：深夜到早上算跨天，正文里的钟点字样不算（易错点 D3）', () => {
    assert.equal(settle('醒来。', { hour: 7 }, stateWith({}, { lastHour: 23 })).state.clock.day, 2);
    assert.equal(settle('想起三点钟的约定。').state.clock.day, 1);
});

test('连续 30 楼不跨天时软跨天：只清每日上限（易错点 D2）', () => {
    const base = stateWith({ stamina: 40 }, { floorsSinceDay: 29 });
    const state = { ...base, characters: { 小雪: { ...createCharacter(1), daily: { day: 1, gained: { 好感: 8 } } } } };
    const r = settle('闲聊。', {}, state);
    assert.equal(r.meta.flags.softDay, true);
    assert.equal(r.state.clock.day, 1);
    assert.equal(r.state.clock.floorsSinceDay, 0);
    assert.deepEqual(r.state.characters.小雪.daily.gained, {});
    assert.equal(r.state.protagonist.bars.stamina, 40);
});

test('时间跳跃上限 30 天，体力生命回满（易错点 D4）', () => {
    const r = settle('[igs-stat:skip|十年后]', {}, stateWith({ stamina: 10, health: 30 }));
    assert.equal(r.state.clock.day, 31);
    assert.equal(r.meta.flags.skipCapped, true);
    assert.equal(r.state.protagonist.bars.stamina, 100);
    assert.equal(r.state.protagonist.bars.health, 100);
});

test('23 点后每天只记一次熬夜，当夜入睡体力只恢复到 70', () => {
    const late = settle('', { hour: 23 });
    assert.equal(late.state.protagonist.bars.stamina, 80);
    assert.equal(settle('', { hour: 0 }, late.state).state.protagonist.bars.stamina, 80);
    const r = settle('[igs-stat:sleep]', { hour: 23 }, stateWith({ stamina: 50 }));
    assert.equal(r.state.clock.day, 2);
    assert.equal(r.state.protagonist.bars.stamina, 70);
    assert.equal(r.state.clock.stayedUp, false);
});

test('体力归零强制休息并按入睡跨天', () => {
    const r = settle('[igs-stat:stamina|重]', {}, stateWith({ stamina: 10 }));
    assert.equal(r.meta.flags.forcedRest, true);
    assert.equal(r.state.clock.day, 2);
    assert.equal(r.state.protagonist.bars.stamina, 100);
});

test('买不起不扣钱；漏打体力标签按正文兜底进食，好感不兜底', () => {
    const poor = settle('[igs-stat:money|花费|昂贵]');
    assert.equal(poor.meta.flags.shortfall, true);
    assert.equal(poor.state.protagonist.bars.money, 0);
    const fed = settle('他们一起吃了晚饭，她很开心。', {}, stateWith({ stamina: 50 }));
    assert.equal(fed.state.protagonist.bars.stamina, 60);
    assert.deepEqual(fed.state.characters, {});
});

test('日结算对打勾技能掷成长：通过则 +1d10 并清勾', () => {
    const s = createStatsState();
    const state = { ...s, protagonist: { ...s.protagonist, skills: { ...s.protagonist.skills, 烹饪: { value: 20, marked: true } } } };
    const r = settle('[igs-stat:sleep]', {}, state);
    assert.deepEqual(r.state.protagonist.skills.烹饪, { value: 30, marked: false });
    assert.ok(r.changes.some((c) => c.key === '烹饪' && c.note === '成长'));
});

const READERS = { readAbilities: () => ({ scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }) };
const dnd = createEngine({}, {}, 'dnd5e', READERS);
const coc = createEngine({}, {}, 'coc7', READERS);
const D20_PAIRS = Array.from({ length: 10 }, () => [12, 3]);
const COC_PAIRS = Array.from({ length: 10 }, () => ({ unit: 2, tens: [1, 5, 8] }));

test('roll 标签取骰按规则体系分流：D&D 取 rollPairs 的 d20 对，CoC 取 { unit, tens }', () => {
    const text = '她试了试。[igs-stat:roll|烹饪|普通]';
    const d = settle(text, { engine: dnd, rollPairs: D20_PAIRS });
    assert.equal(d.meta.check.ruleset, 'dnd5e');
    assert.equal(d.meta.check.roll, 12);
    assert.equal(d.meta.pendingRoll, undefined);
    const c = settle(text, { engine: coc, rollPairs: COC_PAIRS });
    assert.equal(c.meta.check.ruleset, 'coc7');
    assert.equal(c.meta.check.roll, 12);
    // 骰序形状与规则体系不符时当作没有骰序，转手动掷骰。
    assert.ok(settle(text, { engine: coc, rollPairs: D20_PAIRS }).meta.pendingRoll);
    assert.ok(settle(text, { engine: dnd, rollPairs: COC_PAIRS }).meta.pendingRoll);
});

test('roll 标签按前面出现的正文检定标签数取第几对骰；旧预掷形状匹配时仍可用', () => {
    const pairs = Array.from({ length: 10 }, (_, i) => [i + 1, 1]);
    const text = '[igs-check:甲|力量|10]。[igs-stat:roll|烹饪|普通]';
    assert.equal(settle(text, { engine: dnd, rollPairs: pairs }).meta.check.roll, 2);
    const old = settle('[igs-stat:roll|烹饪|普通]', { engine: dnd, preroll: { ruleset: 'dnd5e', raw: { d20: [9, 1] } } });
    assert.equal(old.meta.check.roll, 9);
    const oldCoc = settle('[igs-stat:roll|烹饪|普通]', { engine: coc, preroll: { ruleset: 'coc7', raw: { unit: 2, tens: [1, 5, 8] } } });
    assert.equal(oldCoc.meta.check.roll, 12);
    assert.ok(settle('[igs-stat:roll|烹饪|普通]', { engine: coc, preroll: { ruleset: 'dnd5e', raw: { d20: [9, 1] } } }).meta.pendingRoll);
});

test('storyChecks：主角成功的检定打成长勾并写进 meta.checks；社交大成功触发突破加成', () => {
    const checks = [{ ruleset: 'dnd5e', actor: '主角', skill: '烹饪', kind: 'skill', value: 40, success: true, dc: 15, roll: 18, total: 19, tier: '大成功', ladder: 'crit' }];
    const r = settle('闲聊。', { engine: dnd, storyChecks: checks });
    assert.equal(r.state.protagonist.skills.烹饪.marked, true);
    assert.equal(r.meta.checks.length, 1);
    assert.equal(r.meta.checks[0].ruleset, 'dnd5e');
    const other = settle('闲聊。', { engine: dnd, storyChecks: [{ ...checks[0], actor: '小雪' }] });
    assert.equal(other.state.protagonist.skills.烹饪.marked, false);
    const social = { ...checks[0], skill: '话术', social: true, against: '小雪' };
    const r2 = settle('[igs-stat:favor|小雪|感动]', { engine: dnd, storyChecks: [social] });
    assert.equal(r2.state.characters.小雪.dims.好感 >= 3, true);
});

test('noBattle：战斗扩展接管时 battle 标签被丢弃', () => {
    const r = settle('[igs-stat:battle|杂兵]', { engine: dnd, noBattle: true });
    assert.equal(r.meta.flags.battle, undefined);
    assert.ok(r.meta.diagnostics.some((d) => d.code === 'stats-battle-skipped-combat'));
});
