import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TABLE, resolveBattle } from '../src/scene/stats/stat-battle.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { mandatesFromFlags } from '../src/scene/stats/stat-prompt.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';

// rollD100 先取个位再取十位：0.15 → 11，0.99 → 99。
function seq(...values) { let i = 0; return () => values[i++ % values.length]; }
const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);

function stateWith({ money = 0, favor = null } = {}) {
    const s = createStatsState({ money });
    if (favor === null) return s;
    const c = createCharacter(1);
    return { ...s, characters: { 小雪: { ...c, dims: { ...c.dims, 好感: favor } } } };
}

// 六维全 10 分（折百分制 50）；CoC 整场对抗，D&D 攻击对 AC。
const READERS = { readAbilities: () => ({ scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }) };
const cocEngine = createEngine({}, {}, 'coc7', READERS);
const dndEngine = createEngine({}, {}, 'dnd5e', READERS);
const settle = (text, state, random, engine = cocEngine) => settleFloorText(state, text, { random, resolveCharacter, engine });

test('敌人档：杂兵 1 次、精英 2 次、头目 3 次对抗（§6A）', () => {
    for (const [tier, row] of Object.entries(ENEMY_TABLE)) {
        assert.equal(resolveBattle(createStatsState(), { tier, count: 1 }, high, cocEngine).rounds.length, row.rounds, tier);
    }
});

test('大胜：小耗体力、拿战利品（对抗用的是属性，不进存档也不打成长勾）', () => {
    const r = settle('[igs-stat:battle|杂兵|1]', stateWith(), seq(0.15, 0.15, 0.99, 0.99));
    assert.equal(r.meta.flags.battle.outcome, '大胜');
    assert.equal(r.state.protagonist.bars.stamina, 95);
    assert.equal(r.state.protagonist.bars.money, 20);
    assert.equal(r.meta.flags.battle.tier, '杂兵');
    assert.equal(Object.hasOwn(r.state.protagonist.skills, '力量'), false);
});

test('战败不会死亡：按敌人档受伤、体力 −30、丢两成金钱，并要求 AI 写出结局', () => {
    const r = settle('[igs-stat:battle|杂兵]', stateWith({ money: 100 }), high);
    assert.equal(r.meta.flags.battle.outcome, '败');
    const bars = r.state.protagonist.bars;
    // 伤势不再扣数值侧生命条，只记档位交给战斗账本。
    assert.deepEqual([bars.stamina, bars.money], [70, 80]);
    assert.equal(Object.hasOwn(bars, 'health'), false);
    assert.equal(r.meta.flags.battleHurt, '轻伤');
    assert.match(mandatesFromFlags(r.meta.flags).join(''), /【败】/);
});

test('队友并肩取胜算「共患难」，可突破好感关口；解析不了的队友名记诊断并去掉', () => {
    const win = seq(0.15, 0.15, 0.15, 0.99, 0.99, 0.15, 0.15, 0.15, 0.15, 0.15);
    const r = settle('[igs-stat:battle|杂兵|1|小雪]', stateWith({ favor: 25 }), win);
    assert.equal(r.meta.flags.battle.ally, '小雪');
    assert.equal(r.state.characters.小雪.dims.好感, 26);
    assert.deepEqual(r.state.characters.小雪.unlocked, ['gate-25']);
    const stranger = settle('[igs-stat:battle|杂兵|1|路人甲]', stateWith(), high);
    assert.equal(stranger.meta.flags.battle.ally, null);
    assert.ok(stranger.meta.diagnostics.some((d) => d.code === 'stat-unknown-character' && d.name === '路人甲'));
});

test('打工：成功等级决定收入档，扣体力，成功时打成长勾', () => {
    const r = settle('[igs-stat:work|打工]', stateWith(), () => 0.15);
    assert.deepEqual(r.meta.flags.work, { skill: '烹饪', tier: '困难成功', income: '普通' });
    assert.equal(r.state.protagonist.bars.money, 100);
    assert.equal(r.state.protagonist.bars.stamina, 85);
    assert.equal(r.state.protagonist.skills.烹饪.marked, true);
    assert.ok(!r.meta.diagnostics.some((d) => d.code === 'stat-tag-deferred'));
});

test('险胜只记轻伤档，不改生命条；战斗扩展接管时丢弃 battle 标签并记诊断', () => {
    const skipped = settleFloorText(stateWith(), '[igs-stat:battle|杂兵]', { random: high, resolveCharacter, engine: cocEngine, noBattle: true });
    assert.equal(skipped.meta.flags.battle, undefined);
    assert.ok(skipped.meta.diagnostics.some((d) => d.code === 'stats-battle-skipped-combat'));
});

test('D&D：攻击检定对 AC，闪避为敏捷豁免；有角色卡的敌人 AC = 10 + 敏捷修正', () => {
    const r = settle('[igs-stat:battle|杂兵]', stateWith(), () => 0.99, dndEngine);
    assert.equal(r.meta.flags.battle.outcome, '大胜');
    const win = resolveBattle(createStatsState(), { tier: '杂兵', count: 1 }, () => 0.5, dndEngine);
    assert.equal(win.ruleset, 'dnd5e');
    assert.equal(win.rounds[0].ac, ENEMY_TABLE.杂兵.ac);
    const withCard = createEngine({ sheets: { 刺客: { scale: 'score', attributes: { 力量: 10, 敏捷: 18, 体质: 10, 智力: 10, 感知: 10, 魅力: 10 }, skills: {} } } }, {}, 'dnd5e', READERS);
    const carded = resolveBattle(createStatsState(), { tier: '杂兵', count: 1, foe: '刺客' }, () => 0.5, withCard);
    assert.equal(carded.rounds[0].ac, 10 + 4);
});

test('CoC：有角色卡的敌人取卡里最高的战斗技能对抗', () => {
    const card = { rank: '普通人', skills: { 格斗: 90 }, provisional: {} };
    const engine = createEngine({ sheets: { 刺客: card } }, {}, 'coc7', READERS);
    const r = resolveBattle(createStatsState(), { tier: '杂兵', count: 1, foe: '刺客' }, seq(0.99, 0.99, 0.99, 0.99), engine);
    assert.equal(r.ruleset, 'coc7');
    assert.equal(r.rounds[0].foeRoll > 0, true);
    assert.equal(r.rounds[0].win, false);
});
test('剧情货币上下文：速算战利品、战败和打工均不改积分，未就绪不回落旧余额', () => {
    const table = { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 };
    const cases = [
        ['[igs-stat:battle|杂兵|1]', seq(0.15, 0.15, 0.99, 0.99), 7],
        ['[igs-stat:battle|杂兵]', high, -20],
        ['[igs-stat:work|打工]', () => 0.15, 30],
    ];
    for (const [text, random, delta] of cases) {
        const r = settleFloorText(stateWith({ money: 500 }), text, {
            random, resolveCharacter, engine: cocEngine, walletExtra: 1000,
            currency: { ready: true, balance: 100, table },
        });
        assert.equal(r.state.protagonist.bars.money, 500, text);
        assert.deepEqual(r.meta.currency, { delta, balance: 100 + delta }, text);
        const paused = settleFloorText(stateWith({ money: 500 }), text, {
            random, resolveCharacter, engine: cocEngine,
            currency: { ready: false, balance: 100, table },
        });
        assert.equal(paused.state.protagonist.bars.money, 500, text);
        assert.equal(paused.meta.currency, undefined, text);
        assert.ok(paused.meta.diagnostics.some((d) => d.code === 'stats-currency-unready'), text);
    }
});