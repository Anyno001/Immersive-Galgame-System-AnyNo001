// 特质接入卡牌战斗（A 类）：战报补字段、护短认战斗伤势、同伴倒下、各特质结算与限制。
import test from 'node:test';
import assert from 'node:assert/strict';
import { battleDirectiveOf, parseBattleReport } from '../src/combat/battle-report.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName } from '../src/scene/stats/stat-traits.js';
import { hasRel } from '../src/scene/stats/stat-trait-rules-bond.js';

const report = (result, party, { id = 'rc1', weak = false, foes = '史莱姆 倒下' } = {}) => `（战斗结束）\n<igs-combat-report id="${id}" result="${result}" encounter="草原"${weak ? ' weak="1"' : ''}>\n终局：我方获胜。我方：${party}。敌方：${foes}。\n</igs-combat-report>`;
const directiveOf = (text) => battleDirectiveOf(parseBattleReport(text), { isHero: (n) => n === '林默', floor: 4 });
const on = { on: true, src: 'manual' };
const traitsFor = (map) => Object.fromEntries(Object.entries(map).map(([who, names]) => [who, Object.fromEntries(names.map((n) => [getTraitByName(n).id, on]))]));
const world = (names, patch = {}) => {
    const s = createStatsState();
    return { ...s, characters: Object.fromEntries(names.map((n) => [n, { ...createCharacter(1), ...patch }])), clock: { ...s.clock, day: 3 } };
};
const settle = (state, text, traits, present) => settleFloorText(state, '她挥剑。', {
    random: () => 0.99, noBattle: true, traits: traitsFor(traits), favorTier: 'normal', strengthRev: 2, present: present || Object.keys(state.characters),
    resolveCharacter: (n) => (state.characters[n] ? n : null), extraDirectives: [directiveOf(text)],
});
const notes = (r, target, key) => r.changes.filter((c) => c.target === target && c.key === key && c.source === 'trait').map((c) => c.note);

test('战报解析：party / fallen / weak / foes，旧战报缺字段按旧行为', () => {
    const d = directiveOf(report('win', '林默 轻伤，小雪 无伤，阿虎 倒下', { weak: true }));
    assert.deepEqual(d.party, [{ name: '小雪', status: '无伤' }, { name: '阿虎', status: '倒下' }]);
    assert.deepEqual([d.fallen, d.weak, d.foes, d.allies], [['阿虎'], true, [{ name: '史莱姆', status: '倒下' }], ['小雪']]);
    const old = parseBattleReport('<igs-combat-report id="rold" result="win" encounter="x">\n第1回合：x。\n</igs-combat-report>');
    assert.deepEqual([old.weak, old.foes, old.party], [false, [], []]);
});

test('透传到 flags.battle', () => {
    const r = settle(world(['小雪']), report('win', '林默 重创，小雪 无伤'), {});
    assert.deepEqual([r.meta.flags.battle.heroStatus, r.meta.flags.battle.weak, r.meta.flags.battle.party], ['重创', false, [{ name: '小雪', status: '无伤' }]]);
});

test('护短：战斗重创也算主角受伤', () => {
    const r = settle(world(['小雪']), report('win', '林默 重创，小雪 无伤'), { 小雪: ['护短'] });
    assert.ok(notes(r, '小雪', '好感').includes('护短') || r.changes.some((c) => c.target === '小雪' && c.note === '护短'));
});

test('犬系：取胜好感小升，同日第二次不再触发，弱小战不触发', () => {
    const start = world(['小雪']);
    const a = settle(start, report('win', '林默 无伤，小雪 无伤'), { 小雪: ['犬系'] });
    assert.ok(a.state.characters.小雪.dims.好感 > start.characters.小雪.dims.好感);
    assert.ok(notes(a, '小雪', '好感').includes('犬系'));
    const b = settle(a.state, report('win', '林默 无伤，小雪 无伤', { id: 'rc2' }), { 小雪: ['犬系'] });
    assert.equal(notes(b, '小雪', '好感').includes('犬系'), false);
    const w = settle(start, report('win', '林默 无伤，小雪 无伤', { weak: true }), { 小雪: ['犬系'] });
    assert.equal(notes(w, '小雪', '好感').includes('犬系'), false);
});

test('病娇：主角重创，TA 压力上升；黏人较小', () => {
    const start = world(['小雪', '阿月']);
    const r = settle(start, report('win', '林默 重创，小雪 无伤，阿月 无伤'), { 小雪: ['病娇'], 阿月: ['黏人'] });
    const up = (n) => r.state.characters[n].bars.stress - start.characters[n].bars.stress;
    assert.ok(up('小雪') > up('阿月') && up('阿月') > 0);
    assert.ok(notes(r, '小雪', 'stress').includes('病娇'));
});

test('同伴倒下：同伴压力小升；冷血免除；玻璃心更多', () => {
    const start = world(['小雪', '阿月', '阿虎']);
    const r = settle(start, report('win', '林默 轻伤，小雪 无伤，阿月 无伤，阿虎 倒下'), { 阿月: ['冷血'], 小雪: [] });
    const up = (n) => r.state.characters[n].bars.stress - start.characters[n].bars.stress;
    assert.ok(up('小雪') > 0);
    assert.equal(up('阿月'), 0);
    const g = settle(start, report('win', '林默 轻伤，小雪 无伤，阿月 无伤，阿虎 倒下'), { 小雪: ['玻璃心'] });
    assert.ok(g.state.characters.小雪.bars.stress - start.characters.小雪.bars.stress > up('小雪'));
});

test('女王：战败好感小降', () => {
    const start = world(['小雪'], { dims: { ...createCharacter(1).dims, 好感: 30 } });
    const r = settle(start, report('lose', '林默 倒下，小雪 无伤'), { 小雪: ['女王'] });
    assert.ok(notes(r, '小雪', '好感').includes('女王'));
    assert.ok(r.state.characters.小雪.dims.好感 < 30);
});

test('赌徒：取胜压力大降', () => {
    const s = world(['小雪']);
    const st = { ...s, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, stress: 50 } } };
    const r = settle(st, report('win', '林默 无伤'), { 主角: ['赌徒'] });
    assert.equal(r.state.protagonist.bars.stress, 30);
});

test('敌方 NPC：已建档敌人被击败，记仇者芥蒂升、慕强者好感升', () => {
    const start = world(['小雪', '魔将', '剑客']);
    const r = settle(start, report('win', '林默 无伤，小雪 无伤', { foes: '魔将 倒下，剑客 倒下' }), { 魔将: ['记仇'], 剑客: ['慕强者'] }, ['小雪']);
    assert.ok(r.state.characters.魔将.dims.芥蒂 > start.characters.魔将.dims.芥蒂);
    assert.ok(r.state.characters.剑客.dims.好感 > start.characters.剑客.dims.好感);
});

const heroStress = (r) => r.state.protagonist.bars.stress;
const withHeroStress = (s, v) => ({ ...s, protagonist: { ...s.protagonist, bars: { ...s.protagonist.bars, stress: v } } });

test('乐天派：战败时主角压力上升少于无特质', () => {
    const st = withHeroStress(world(['小雪']), 20);
    const text = report('lose', '林默 倒下，小雪 无伤');
    const base = settle(st, text, {});
    const calm = settle(st, text, { 主角: ['乐天派'] });
    assert.ok(heroStress(base) > 20);
    assert.ok(heroStress(calm) < heroStress(base));
});

test('自卑：战败时主角压力额外上升', () => {
    const st = withHeroStress(world(['小雪']), 20);
    const text = report('lose', '林默 倒下，小雪 无伤');
    assert.ok(heroStress(settle(st, text, { 主角: ['自卑'] })) > heroStress(settle(st, text, {})));
});

test('佛系：战斗不改变压力', () => {
    const st = withHeroStress(world(['小雪']), 20);
    const r = settle(st, report('lose', '林默 重创，小雪 无伤'), { 主角: ['佛系'] });
    assert.equal(heroStress(r), 20);
});

test('赌徒：战败压力大升', () => {
    const st = withHeroStress(world(['小雪']), 20);
    const text = report('lose', '林默 重创，小雪 无伤');
    assert.ok(heroStress(settle(st, text, { 主角: ['赌徒'] })) >= heroStress(settle(st, text, {})) + 20);
});

test('花痴：主角无伤取胜，同场同伴欲望上升', () => {
    const r = settle(world(['小雪'], { dims: { ...createCharacter(1).dims, 欲望: 0 } }), report('win', '林默 无伤，小雪 无伤'), { 小雪: ['花痴'] });
    assert.ok(r.state.characters.小雪.dims.欲望 > 0);
});

test('知恩图报 / 白眼狼：负伤取胜恩情加深，战败恩情淡化', () => {
    const start = world(['小雪']);
    const win = settle(start, report('win', '林默 无伤，小雪 轻伤'), { 小雪: ['知恩图报'] });
    assert.ok(hasRel(win.state, '小雪', '欠你人情', 'ta'));
    const fade = settle(win.state, report('lose', '林默 倒下，小雪 无伤', { id: 'rc9' }), { 小雪: ['白眼狼'] });
    assert.equal(hasRel(fade.state, '小雪', '欠你人情', 'ta'), false);
});
