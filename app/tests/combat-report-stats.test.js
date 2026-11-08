// 卡牌战斗战报进数值系统：战斗事件、撤退、伤势、好战名单与伤势带入下一局。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombatReport } from '../src/combat/report.js';
import { battleDirectiveOf, parseBattleReport } from '../src/combat/battle-report.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName } from '../src/scene/stats/stat-traits.js';
import { applyCombatRuleModifiers, combatCooldownFloorsOf } from '../src/scene/combat-prompt.js';

const reportText = (result, party, id = 'rabc123') => `（战斗结束）\n<igs-combat-report id="${id}" result="${result}" encounter="草原">\n第1回合：主角 以「斩击」出手。\n终局：我方获胜。我方：${party}。敌方：史莱姆 倒下。\n</igs-combat-report>`;
const directiveOf = (text) => battleDirectiveOf(parseBattleReport(text), { isHero: (name) => name === '林默', floor: 4 });
const marks = (...names) => Object.fromEntries(names.map((n) => [getTraitByName(n).id, { on: true, src: 'manual' }]));

function world(extra = {}) {
    const s = createStatsState();
    return { ...s, characters: { 小雪: createCharacter(1) }, ...extra };
}
const settle = (state, text, { traits = {}, directives = [], noBattle = true } = {}) => settleFloorText(state, '她挥剑。', {
    random: () => 0.99, noBattle, traits, favorTier: 'normal', strengthRev: 2, present: ['小雪'], resolveCharacter: (n) => (n === '小雪' ? '小雪' : null),
    extraDirectives: directives.length ? directives : [directiveOf(text)],
});

test('战报解析：结果与我方伤势，主角别名与用户名都认，倒下的同伴不算并肩', () => {
    const d = directiveOf(reportText('win', '林默 轻伤，小雪 无伤，阿虎 倒下'));
    assert.deepEqual([d.kind, d.result, d.heroStatus, d.hurt, d.allies], ['battle', 'win', '轻伤', '轻伤', ['小雪']]);
    assert.equal(directiveOf(reportText('win', '主角 无伤')).hurt, null);
    assert.equal(directiveOf(reportText('lose', '林默 濒死')).hurt, '重伤');
    assert.equal(directiveOf(reportText('win', '林默 重创')).hurt, '中伤');
    assert.equal(parseBattleReport('没有战报'), null);
    // 与真实生成器对得上
    const built = buildCombatReport({ combatId: 'c1|3', encounter: '草原', state: { outcome: 'victory', units: { h: { name: '林默', side: 'ally', alive: true, hp: 70, maxHp: 80 }, e: { name: '史莱姆', side: 'enemy', alive: false, hp: 0, maxHp: 20 } } }, events: [] });
    assert.equal(built.ok, true);
    const parsed = parseBattleReport(built.text);
    assert.deepEqual([parsed.result, parsed.party.map((p) => p.name + p.status)], ['win', ['林默轻伤']]);
});

test('战报合成战斗事件：noBattle 下照样记 events 与 flags，伤势档进 battleHurt，不扣钱不给战利品', () => {
    const text = reportText('win', '林默 轻伤，小雪 无伤');
    const r = settle(world(), text);
    const ev = r.meta.events.find((e) => e.kind === 'battle');
    assert.deepEqual([ev.outcome, ev.ally, ev.fromReport], ['胜', '小雪', true]);
    assert.deepEqual([r.meta.flags.battle.outcome, r.meta.flags.battleHurt], ['胜', '轻伤']);
    assert.equal(r.state.protagonist.bars.money, 0);
    assert.equal(r.state.protagonist.bars.stamina, 100);
    assert.equal(r.state.clock.lastBattleReport, 'rabc123');
    // 全员无伤算大胜
    assert.equal(settle(world(), reportText('win', '林默 无伤，小雪 无伤', 'rabc124')).meta.flags.battle.outcome, '大胜');
});

test('同一份战报只结算一次（重新生成同一楼沿用已记的战报号）', () => {
    const first = settle(world(), reportText('lose', '林默 重创'));
    assert.equal(first.state.protagonist.bars.stress, 10);
    const again = settle(first.state, reportText('lose', '林默 重创'));
    assert.equal(again.state.protagonist.bars.stress, 10);
    assert.equal(again.meta.events.some((e) => e.kind === 'battle'), false);
});

test('战败压力上一档中，胜利不改压力；败不算胜', () => {
    const lose = settle(world(), reportText('lose', '林默 倒下'));
    assert.equal(lose.state.protagonist.bars.stress, 10);
    assert.equal(lose.meta.flags.battle.outcome, '败');
    assert.equal(settle(world(), reportText('win', '林默 轻伤')).state.protagonist.bars.stress, 0);
});

test('撤退：战斗狂压力小升并记战斗日，厌战压力下降一小档，慕强、魔族、身经百战、共患难都不给', () => {
    const base = world();
    const stressed = { ...base, protagonist: { ...base.protagonist, bars: { ...base.protagonist.bars, stress: 40 } } };
    const text = reportText('escape', '林默 轻伤，小雪 无伤');
    const mad = settle(stressed, text, { traits: { 主角: marks('战斗狂') } });
    assert.equal(mad.meta.flags.battle.outcome, '撤');
    assert.equal(mad.state.protagonist.bars.stress, 45);
    assert.equal(mad.state.protagonist.traitMarks.lastBattleDay, 1);
    const weary = settle(stressed, text, { traits: { 主角: marks('厌战') } });
    assert.equal(weary.state.protagonist.bars.stress, 35);
    const demon = settle(stressed, text, { traits: { 主角: marks('魔族') } });
    assert.equal(demon.state.protagonist.bars.stress, 40);
    // 同伴没有共患难事件
    assert.equal(mad.meta.events.some((e) => e.kind === 'battle' && e.outcome === '撤'), true);
    assert.equal(mad.meta.events.some((e) => e.target === '小雪' && e.event), false);
    // 取胜才给战斗狂压力下降
    const win = settle(stressed, reportText('win', '林默 轻伤'), { traits: { 主角: marks('战斗狂') } });
    assert.equal(win.state.protagonist.bars.stress, 20);
});

test('好战名单：开战冷却减半、频率行改为积极安排并写明是谁好战；没有名单保持原样', () => {
    const settings = { combatExpansion: { enabled: true, cooldownFloors: 8, frequency: 'low' }, combatSinceStart: 5 };
    assert.equal(combatCooldownFloorsOf(settings), 8);
    assert.match(applyCombatRuleModifiers('规则', settings), /距离上一场战斗不足8楼/);
    const eager = { ...settings, combatEager: { names: ['小雪'] } };
    assert.equal(combatCooldownFloorsOf(eager), 4);
    const text = applyCombatRuleModifiers('规则', eager);
    assert.doesNotMatch(text, /不足/);
    assert.match(text, /小雪好战，会主动挑起或卷入冲突，可以把主角卷进来/);
    assert.equal(combatCooldownFloorsOf({ ...eager, combatExpansion: { cooldownFloors: 1 } }), 1);
    assert.match(applyCombatRuleModifiers('规则', { combatExpansion: { frequency: 'low' } }), /只在冲突无法回避时/);
});
