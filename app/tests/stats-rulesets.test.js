import test from 'node:test';
import assert from 'node:assert/strict';
import * as coc7 from '../src/scene/stats/rulesets/coc7.js';
import * as dnd5e from '../src/scene/stats/rulesets/dnd5e.js';
import { createEngine, resolveCheck, contestCheck, prerollTable, rollPreroll, checkFromPreroll, markGrowth, PROTAGONIST, chanceOf } from '../src/scene/stats/stat-engine.js';
import { createStatsState, createCharacter } from '../src/scene/stats/stat-state.js';

const p = (value, extra = {}) => ({ kind: 'skill', value, learned: true, attributeValue: 50, rank: '普通人', entry: { attribute: '敏捷' }, ...extra });
const raw100 = (v) => ({ unit: v % 10, tens: [v === 100 ? 0 : Math.floor(v / 10) % 10, 9, 9] });

test('CoC：困难 1/2、极难 1/5；大成功 ≤5、大失败 ≥96（用户定，沿用 v1）', () => {
    assert.equal(coc7.resolve(p(50), { difficulty: '普通' }, raw100(50)).success, true);
    assert.equal(coc7.resolve(p(50), { difficulty: '困难' }, raw100(26)).success, false);
    assert.equal(coc7.resolve(p(50), { difficulty: '困难' }, raw100(25)).success, true);
    assert.equal(coc7.resolve(p(50), { difficulty: '极难' }, raw100(10)).ladder, 'extreme');
    assert.equal(coc7.resolve(p(50), { difficulty: '极难' }, raw100(5)).ladder, 'crit');
    assert.equal(coc7.resolve(p(80), { difficulty: '普通' }, raw100(96)).ladder, 'fumble');
});

test('CoC：简单 = 1 颗奖励骰；奖惩骰抵消且最多 2 颗', () => {
    const easy = coc7.resolve(p(50), { difficulty: '简单' }, { unit: 0, tens: [7, 3, 9] });
    assert.equal(easy.roll, 30);
    assert.equal(easy.edge, 1);
    assert.equal(coc7.netEdge('普通', 5), 2);
    assert.equal(coc7.netEdge('简单', -1), 0);
});

test('CoC 对抗：比成功等级，同级技能值高者胜，都失败为僵持', () => {
    // 20 对 60 与 15 对 40 同为困难成功：技能值高者胜。
    const a = coc7.resolve(p(60), {}, raw100(20));
    const b = coc7.resolve(p(40), {}, raw100(15));
    assert.equal(a.ladder, b.ladder);
    assert.equal(coc7.contest(a, b), 'left');
    const fa = coc7.resolve(p(30), {}, raw100(80));
    const fb = coc7.resolve(p(30), {}, raw100(90));
    assert.equal(coc7.contest(fa, fb), 'tie');
    // 战斗的官方平局规则（反击时攻击方胜、闪避时闪避方胜）优先于技能值。
    assert.equal(coc7.contest(a, b, { tieWinner: 'right' }), 'right');
});

test('D&D：属性值 = 底数/5、修正向下取整；熟练与专精按底数分段，熟练加值看资历', () => {
    assert.equal(dnd5e.scoreOf(50), 10);
    assert.equal(dnd5e.modOf(50), 0);
    assert.equal(dnd5e.modOf(90), 4);
    assert.equal(dnd5e.modOf(40), -1);
    assert.equal(dnd5e.bonusOf(p(60, { attributeValue: 50 })), 2);
    assert.equal(dnd5e.bonusOf(p(80, { attributeValue: 50 })), 4);
    assert.equal(dnd5e.bonusOf(p(80, { attributeValue: 50, rank: '精英' })), 8);
    assert.equal(dnd5e.bonusOf(p(30, { attributeValue: 70 })), 2);
    assert.equal(dnd5e.bonusOf({ kind: 'attribute', value: 70, learned: true, attributeValue: 70, rank: '传奇' }), 2);
});

test('D&D：DC 10/15/20/25；自然 20/1 默认不自动成败，开启后才算；优势取高', () => {
    const prof = p(60, { attributeValue: 50 });
    assert.equal(dnd5e.resolve(prof, { difficulty: '普通' }, { d20: [13, 1] }).success, true);
    assert.equal(dnd5e.resolve(prof, { difficulty: '普通' }, { d20: [12, 1] }).success, false);
    assert.equal(dnd5e.resolve(prof, { difficulty: '极难' }, { d20: [20, 1] }).success, false);
    assert.equal(dnd5e.resolve(prof, { difficulty: '极难', natural: true }, { d20: [20, 1] }).success, true);
    assert.equal(dnd5e.resolve(prof, { difficulty: '普通', edge: 1 }, { d20: [3, 18] }).roll, 18);
    assert.equal(dnd5e.resolve(prof, { difficulty: '普通', edge: -1 }, { d20: [3, 18] }).roll, 3);
    assert.equal(dnd5e.resolve(prof, { difficulty: '简单' }, { d20: [20, 1] }).ladder, 'crit');
});

test('成功率表与计划 §4.3 一致（抽查）', () => {
    const round = (x) => Math.round(x * 100);
    assert.equal(round(coc7.chance(p(50), { difficulty: '普通' })), 50);
    assert.equal(round(coc7.chance(p(50), { difficulty: '困难' })), 25);
    assert.equal(round(coc7.chance(p(50), { difficulty: '简单' })), 75);
    assert.equal(round(dnd5e.chance(p(60, { attributeValue: 50 }), { difficulty: '普通' })), 40);
    assert.equal(round(dnd5e.chance(p(10, { attributeValue: 50, learned: false }), { difficulty: '极难' })), 0);
});

test('切换体系不改存档：同一状态两套体系都能检定，底数原样', () => {
    const state = createStatsState();
    const before = JSON.stringify(state);
    const coc = resolveCheck(createEngine({}, { ruleset: 'coc7' }), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.3);
    const dnd = resolveCheck(createEngine({}, { ruleset: 'dnd5e' }), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.3);
    assert.equal(coc.ruleset, 'coc7');
    assert.equal(dnd.ruleset, 'dnd5e');
    assert.equal(JSON.stringify(state), before);
});

test('未学技能：CoC 用基础值（侦查 25、开锁 1、闪避 敏捷/2），D&D 只加属性修正', () => {
    const state = createStatsState();
    const coc = createEngine({}, { ruleset: 'coc7' });
    assert.equal(resolveCheck(coc, state, { actor: PROTAGONIST, skill: '侦查' }, () => 0.1).value, 25);
    assert.equal(resolveCheck(coc, state, { actor: PROTAGONIST, skill: '开锁' }, () => 0.1).value, 1);
    assert.equal(resolveCheck(coc, state, { actor: PROTAGONIST, skill: '闪避' }, () => 0.1).value, 20);
    const dnd = createEngine({}, { ruleset: 'dnd5e' });
    assert.equal(resolveCheck(dnd, state, { actor: PROTAGONIST, skill: '开锁' }, () => 0.1).bonus, -1);
});

test('好感影响社交检定：深爱给奖励骰 / 优势，仇恨给 2 颗惩罚骰；非社交技能不受影响（§7.1）', () => {
    const base = createStatsState();
    const love = { ...base, characters: { 小雪: { ...createCharacter(1), dims: { 好感: 90, 信任: 0, 了解: 0 } } } };
    const hate = { ...base, characters: { 小雪: { ...createCharacter(1), dims: { 好感: -90, 信任: 0, 了解: 0 } } } };
    const coc = createEngine({}, { ruleset: 'coc7' });
    assert.equal(resolveCheck(coc, love, { actor: PROTAGONIST, skill: '话术', toward: '小雪' }, () => 0.5).edge, 1);
    assert.equal(resolveCheck(coc, hate, { actor: PROTAGONIST, skill: '话术', toward: '小雪' }, () => 0.5).edge, -2);
    assert.equal(resolveCheck(coc, love, { actor: PROTAGONIST, skill: '烹饪', toward: '小雪' }, () => 0.5).edge, 0);
    assert.equal(resolveCheck(createEngine({}, { ruleset: 'dnd5e' }), hate, { actor: PROTAGONIST, skill: '话术', toward: '小雪' }, () => 0.5).edge, -1);
});

test('对抗 NPC：按对方被动值定难度（CoC）/ DC（D&D）；没卡的 NPC 按普通人', () => {
    const state = createStatsState();
    const sheets = { 林晚: { rank: '普通人', attributes: { 观察: 80 }, skills: { 心理学: 70 }, provisional: {} } };
    const coc = resolveCheck(createEngine({ sheets }, { ruleset: 'coc7' }), state, { actor: PROTAGONIST, skill: '话术', against: '林晚' }, () => 0.1);
    assert.equal(coc.threshold, 25);
    assert.equal(coc.opposed.skill, '心理学');
    const dnd = resolveCheck(createEngine({ sheets }, { ruleset: 'dnd5e' }), state, { actor: PROTAGONIST, skill: '话术', against: '林晚' }, () => 0.1);
    assert.equal(dnd.dc, 10 + 3 + 2);
    const nobody = resolveCheck(createEngine({}, { ruleset: 'coc7' }), state, { actor: PROTAGONIST, skill: '话术', against: '路人' }, () => 0.1);
    assert.equal(nobody.threshold, 50);
});

test('主动对抗：两边各掷一次', () => {
    // 同一颗骰：主角力量 40（−1）输给普通人 50（+0）。
    const r = contestCheck(createEngine({}, { ruleset: 'dnd5e' }), createStatsState(), { actor: PROTAGONIST, skill: '力量' }, { actor: '阿强', skill: '力量' }, () => 0.5);
    assert.equal(r.left.roll, r.right.roll);
    assert.equal(r.winner, 'right');
});

test('预掷：表只给结论不给骰面；结算按同一颗骰重算，与表一致（§5.2、N7）', () => {
    const state = createStatsState();
    const engine = createEngine({}, { ruleset: 'coc7' });
    const preroll = { ruleset: 'coc7', raw: { unit: 2, tens: [1, 5, 8] } };
    const table = prerollTable(engine, state, preroll, { present: [] });
    assert.ok(table.lines.some((l) => /能过到困难：.*烹饪/.test(l)));
    assert.ok(!table.lines.join('').match(/12/));
    const check = checkFromPreroll(engine, state, preroll, { skill: '烹饪', difficulty: '困难' });
    assert.equal(check.success, true);
    assert.equal(check.roll, 12);
    assert.equal(checkFromPreroll(engine, state, preroll, { skill: '烹饪', difficulty: '极难' }).success, false);
    assert.equal(prerollTable(createEngine({}, { ruleset: 'dnd5e' }), state, preroll), null);
    assert.ok(rollPreroll(engine, () => 0.4).raw.tens.length === 3);
});

test('用过就会：未学技能检定成功后登记进主角技能并打成长勾（§6.1）', () => {
    const state = createStatsState();
    const engine = createEngine({}, { ruleset: 'coc7' });
    // 个位 1、十位 0 → 01，开锁基础值 1 也能过。
    const rolls = [0.15, 0.05];
    const check = resolveCheck(engine, state, { actor: PROTAGONIST, skill: '开锁' }, () => rolls.shift());
    assert.equal(check.success, true);
    const next = markGrowth(state, check);
    assert.deepEqual(next.protagonist.skills.开锁, { value: 1, marked: true });
    assert.equal(markGrowth(state, { ...check, success: false }), state);
});

test('选项成功率：按当前体系与修正计算', () => {
    const state = createStatsState();
    assert.equal(Math.round(chanceOf(createEngine({}, { ruleset: 'coc7' }), state, { actor: PROTAGONIST, skill: '烹饪', difficulty: '困难' }) * 100), 25);
});
