import test from 'node:test';
import assert from 'node:assert/strict';
import * as coc7 from '../src/scene/stats/rulesets/coc7.js';
import * as dnd5e from '../src/scene/stats/rulesets/dnd5e.js';
import { createEngine, engineFor, withAbilityMemo, resolveCheck, contestCheck, markGrowth, profileOf, attributeNamesOf, SAN_ATTRIBUTE, PROTAGONIST, chanceOf } from '../src/scene/stats/stat-engine.js';
import { DEFAULT_RULESET, getRuleset, hasRuleset, rulesetOptions } from '../src/scene/stats/rulesets/index.js';
import { createStatsState, createCharacter } from '../src/scene/stats/stat-state.js';

const p = (value, extra = {}) => ({ kind: 'skill', value, learned: true, attributeValue: 50, rank: '普通人', entry: { attribute: '敏捷' }, ...extra });
// 主角六维 8 分（折百分制 40，同旧版建卡起点），其余角色 10 分（50）。
const scoresOf = (n) => ({ str: n, dex: n, con: n, int: n, wis: n, cha: n });
const FLAT = { readAbilities: (name) => ({ scores: scoresOf(name === '主角' ? 8 : 10) }) };
const mk = (catalog, ruleset, readers = FLAT) => createEngine(catalog, {}, ruleset, readers);
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
    // 25–49 半熟练：熟练加值减半向下取整（普通人 +2 → +1；老手 +3 → +1）。
    assert.equal(dnd5e.bonusOf(p(30, { attributeValue: 70 })), 3);
    assert.equal(dnd5e.bonusOf(p(30, { attributeValue: 50, rank: '老手' })), 1);
    assert.equal(dnd5e.bonusOf(p(20, { attributeValue: 50 })), 0);
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
    const coc = resolveCheck(mk({}, 'coc7'), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.3);
    const dnd = resolveCheck(mk({}, 'dnd5e'), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.3);
    assert.equal(coc.ruleset, 'coc7');
    assert.equal(dnd.ruleset, 'dnd5e');
    assert.equal(JSON.stringify(state), before);
});

test('未学技能：CoC 用基础值（侦查 25、开锁 1、闪避 敏捷/2），D&D 只加属性修正', () => {
    const state = createStatsState();
    const coc = mk({}, 'coc7');
    assert.equal(resolveCheck(coc, state, { actor: PROTAGONIST, skill: '侦查' }, () => 0.1).value, 25);
    assert.equal(resolveCheck(coc, state, { actor: PROTAGONIST, skill: '开锁' }, () => 0.1).value, 1);
    assert.equal(resolveCheck(coc, state, { actor: PROTAGONIST, skill: '闪避' }, () => 0.1).value, 20);
    const dnd = mk({}, 'dnd5e');
    assert.equal(resolveCheck(dnd, state, { actor: PROTAGONIST, skill: '开锁' }, () => 0.1).bonus, -1);
});

test('好感影响社交检定：深爱给奖励骰 / 优势，仇恨给 2 颗惩罚骰；非社交技能不受影响（§7.1）', () => {
    const base = createStatsState();
    const love = { ...base, characters: { 小雪: { ...createCharacter(1), dims: { 好感: 90, 信任: 0, 了解: 0 } } } };
    const hate = { ...base, characters: { 小雪: { ...createCharacter(1), dims: { 好感: -90, 信任: 0, 了解: 0 } } } };
    const coc = mk({}, 'coc7');
    assert.equal(resolveCheck(coc, love, { actor: PROTAGONIST, skill: '话术', toward: '小雪' }, () => 0.5).edge, 1);
    assert.equal(resolveCheck(coc, hate, { actor: PROTAGONIST, skill: '话术', toward: '小雪' }, () => 0.5).edge, -2);
    assert.equal(resolveCheck(coc, love, { actor: PROTAGONIST, skill: '烹饪', toward: '小雪' }, () => 0.5).edge, 0);
    assert.equal(resolveCheck(mk({}, 'dnd5e'), hate, { actor: PROTAGONIST, skill: '话术', toward: '小雪' }, () => 0.5).edge, -1);
});

test('对抗 NPC：按对方被动值定难度（CoC）/ DC（D&D）；没卡的 NPC 按普通人', () => {
    const state = createStatsState();
    const sheets = { 林晚: { rank: '普通人', scale: 'score', attributes: { 力量: 10, 敏捷: 10, 体质: 10, 智力: 10, 感知: 16, 魅力: 10 }, skills: { 察言观色: 70 }, provisional: {} } };
    const coc = resolveCheck(mk({ sheets }, 'coc7'), state, { actor: PROTAGONIST, skill: '话术', against: '林晚' }, () => 0.1);
    assert.equal(coc.threshold, 25);
    assert.equal(coc.opposed.skill, '察言观色');
    const dnd = resolveCheck(mk({ sheets }, 'dnd5e'), state, { actor: PROTAGONIST, skill: '话术', against: '林晚' }, () => 0.1);
    assert.equal(dnd.dc, 10 + 3 + 2);
    const nobody = resolveCheck(mk({}, 'coc7'), state, { actor: PROTAGONIST, skill: '话术', against: '路人' }, () => 0.1);
    assert.equal(nobody.threshold, 50);
});

test('主动对抗：两边各掷一次', () => {
    // 同一颗骰：主角力量 40（−1）输给普通人 50（+0）。
    const r = contestCheck(mk({}, 'dnd5e'), createStatsState(), { actor: PROTAGONIST, skill: '力量' }, { actor: '阿强', skill: '力量' }, () => 0.5);
    assert.equal(r.left.roll, r.right.roll);
    assert.equal(r.winner, 'right');
});

test('用过就会：未学技能检定成功后登记进主角技能并打成长勾（§6.1）', () => {
    const state = createStatsState();
    const engine = mk({}, 'coc7');
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
    assert.equal(Math.round(chanceOf(mk({}, 'coc7'), state, { actor: PROTAGONIST, skill: '烹饪', difficulty: '困难' }) * 100), 25);
});

test('规则体系登记：默认 D&D，下拉里 D&D 在前、CoC 在后；旧值回落到默认', () => {
    assert.equal(DEFAULT_RULESET, 'dnd5e');
    assert.deepEqual(rulesetOptions().map(([id]) => id), ['dnd5e', 'coc7']);
    assert.equal(hasRuleset('coc7'), true);
    assert.equal(getRuleset('nope').ID, 'dnd5e');
    assert.equal(typeof dnd5e.resolveTotal, 'function');
    assert.equal(dnd5e.resolveTotal(3, { difficulty: '普通' }, { d20: [12, 1] }).success, true);
    assert.equal(dnd5e.resolveTotal(3, { difficulty: '普通' }, { d20: [11, 1] }).success, false);
});

test('引擎：自然 20/1 常开；六维取战斗读数 ×5，读不到按偏好推导', () => {
    const engine = mk({}, 'dnd5e');
    assert.equal(engine.natural, true);
    assert.equal(profileOf(engine, createStatsState(), PROTAGONIST, '力量').value, 40);
    assert.equal(profileOf(engine, createStatsState(), '路人', '力量').value, 50);
    const derived = createEngine({}, {}, 'dnd5e');
    const prefs = { major: 'str', minor: 'dex', weak: 'int' };
    const state = createStatsState({ prefs });
    assert.equal(profileOf(derived, state, PROTAGONIST, '力量').value, 75);
    assert.equal(profileOf(derived, state, PROTAGONIST, '智力').value, 40);
});

test('NPC 六维优先序：属性档（scale:score）→ 战斗读取 → 推导；旧式百分制卡不当属性档', () => {
    const state = createStatsState();
    const card = { scale: 'score', attributes: { 力量: 18, 敏捷: 9, 体质: 10, 智力: 10, 感知: 10, 魅力: 10 }, skills: {} };
    const engine = mk({ sheets: { 小雪: card, 旧卡: { attributes: { 力量: 90 }, skills: {} } } }, 'dnd5e');
    assert.equal(profileOf(engine, state, '小雪', '力量').value, 90);
    assert.equal(profileOf(engine, state, '旧卡', '力量').value, 50);
});

test('CoC：理智是第七项属性，主角取存档里的理智，没有取感知×5；D&D 下理智就是智力', () => {
    const coc = mk({}, 'coc7');
    assert.deepEqual(attributeNamesOf(coc), ['力量', '敏捷', '体质', '智力', '感知', '魅力', '理智']);
    assert.equal(attributeNamesOf(mk({}, 'dnd5e')).length, 6);
    const state = createStatsState();
    assert.equal(profileOf(coc, state, PROTAGONIST, SAN_ATTRIBUTE).value, 40);
    const grown = { ...state, protagonist: { ...state.protagonist, skills: { ...state.protagonist.skills, 理智: { value: 62, marked: false } } } };
    assert.equal(profileOf(coc, grown, PROTAGONIST, SAN_ATTRIBUTE).value, 62);
    assert.equal(profileOf(coc, state, '小雪', SAN_ATTRIBUTE).value, 50);
    assert.equal(profileOf(mk({ sheets: { 小雪: { san: 33, skills: {} } } }, 'coc7'), state, '小雪', SAN_ATTRIBUTE).value, 33);
    const dnd = mk({}, 'dnd5e');
    const r = resolveCheck(dnd, state, { actor: PROTAGONIST, skill: '理智' }, () => 0.5);
    assert.equal(r.skill, '理智');
    assert.equal(profileOf(dnd, state, PROTAGONIST, '智力').value, 40);
});

test('生命状态惩罚：重伤给惩罚骰（CoC）/ 劣势（D&D），轻伤与无数据不影响', () => {
    const state = createStatsState();
    const hurt = (vitals) => ({ readAbilities: FLAT.readAbilities, readVitals: () => vitals });
    assert.equal(resolveCheck(mk({}, 'coc7', hurt({ hp: 10, maxHp: 100 })), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.5).edge, -1);
    assert.equal(resolveCheck(mk({}, 'dnd5e', hurt({ hp: 10, maxHp: 100 })), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.5).edge, -1);
    assert.equal(resolveCheck(mk({}, 'coc7', hurt({ hp: 40, maxHp: 100 })), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.5).edge, 0);
    assert.equal(resolveCheck(mk({}, 'coc7'), state, { actor: PROTAGONIST, skill: '烹饪' }, () => 0.5).edge, 0);
});

test('引擎缓存：同一 catalog/settings 引用复用，换引用重建；withAbilityMemo 返回浅拷贝并按名记忆', () => {
    const catalog = {};
    const settings = {};
    const a = engineFor(catalog, settings, 'dnd5e', FLAT);
    assert.equal(engineFor(catalog, settings, 'dnd5e', FLAT), a);
    assert.notEqual(engineFor(catalog, {}, 'dnd5e', FLAT), a);
    assert.notEqual(engineFor({}, settings, 'dnd5e', FLAT), a);
    assert.notEqual(engineFor(catalog, settings, 'coc7', FLAT), a);
    assert.notEqual(engineFor(catalog, settings, 'dnd5e', { ...FLAT, userName: '小明' }), a);
    let calls = 0;
    const counted = engineFor({}, {}, 'dnd5e', { readAbilities: (name) => { calls += 1; return { scores: scoresOf(10) }; } });
    const memo = withAbilityMemo(counted);
    assert.notEqual(memo, counted);
    assert.equal(counted.memoized, undefined);
    memo.readAbilities('甲');
    memo.readAbilities('甲');
    memo.readAbilities('乙');
    assert.equal(calls, 2);
    assert.equal(withAbilityMemo(memo), memo);
});
