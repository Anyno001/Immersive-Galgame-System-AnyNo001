import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TABLE, resolveBattle } from '../src/scene/stats/stat-battle.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { mandatesFromFlags } from '../src/scene/stats/stat-prompt.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';

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

const settle = (text, state, random) => settleFloorText(state, text, { random, resolveCharacter });

test('敌人档：杂兵 1 次、精英 2 次、头目 3 次对抗（§6A）', () => {
    for (const [tier, row] of Object.entries(ENEMY_TABLE)) {
        assert.equal(resolveBattle(createStatsState(), { tier, count: 1 }, high).rounds.length, row.rounds, tier);
    }
});

test('大胜：小耗体力、拿战利品、给对抗技能打成长勾', () => {
    const r = settle('[igs-stat:battle|杂兵|1]', stateWith(), seq(0.15, 0.15, 0.99, 0.99));
    assert.equal(r.meta.flags.battle.outcome, '大胜');
    assert.equal(r.state.protagonist.bars.stamina, 95);
    assert.equal(r.state.protagonist.bars.money, 20);
    assert.equal(r.state.protagonist.skills.力量.marked, true);
});

test('战败不会死亡：按敌人档受伤、体力 −30、丢两成金钱，并要求 AI 写出结局', () => {
    const r = settle('[igs-stat:battle|杂兵]', stateWith({ money: 100 }), high);
    assert.equal(r.meta.flags.battle.outcome, '败');
    const bars = r.state.protagonist.bars;
    assert.deepEqual([bars.health, bars.stamina, bars.money], [85, 70, 80]);
    assert.ok(bars.health > 0);
    assert.match(mandatesFromFlags(r.meta.flags, bars).join(''), /【败】/);
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
