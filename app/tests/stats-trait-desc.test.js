// C 批：说明写了、此前没有结算的子效果。每条新规则一例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName, sanitizeTraits, traitCatalogOf, traitDice } from '../src/scene/stats/stat-traits.js';
import { settleNaturalHeal } from '../src/scene/stats/stat-heal.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';
import { battleDirectiveOf, parseBattleReport } from '../src/combat/battle-report.js';

const high = () => 0.99;
const resolve = (n) => n;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: resolve, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const base = () => createStatsState();
const npc = (patch = {}, bars = {}) => {
    const c = createCharacter(1, { nsfw: true });
    return { ...base(), characters: { 林夏: { ...c, ...patch, dims: { ...c.dims, ...(patch.dims || {}) }, bars: { ...c.bars, ...bars } } } };
};
const two = () => {
    const c = createCharacter(1, { nsfw: true });
    return { ...base(), characters: { 林夏: { ...c, dims: { ...c.dims, 欲望: 10 }, bars: { ...c.bars, stress: 20 } }, 小雪: { ...c, dims: { ...c.dims, 好感: 10 } } } };
};
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) });

test('占有狂：主角与他人亲近那一楼，其欲望、压力各小升', () => {
    const text = '[igs-stat:event|小雪|约会]';
    const plain = floor(two(), text).state.characters.林夏;
    const own = floor(two(), text, traitsFor('林夏', '占有狂')).state.characters.林夏;
    assert.equal(own.dims.欲望, plain.dims.欲望 + 2);
    assert.equal(own.bars.stress, plain.bars.stress + 5);
});

test('现实派：约会那一楼好感上升少 1', () => {
    const text = '[igs-stat:favor|林夏|开心|中][igs-stat:event|林夏|约会]';
    const plain = floor(npc({ dims: { 好感: 10 } }), text).state.characters.林夏.dims.好感;
    const real = floor(npc({ dims: { 好感: 10 } }), text, traitsFor('林夏', '现实派')).state.characters.林夏.dims.好感;
    assert.ok(plain - 10 >= 2);
    assert.equal(real, plain - 1);
});

test('完美主义者：战斗失败的压力上升加倍', () => {
    const report = ['（战斗结束）', '<igs-combat-report id="rdesc1" result="lose" encounter="草原">', '终局：我方落败。我方：林默 重创。敌方：史莱姆 无伤。', '</igs-combat-report>'].join('\n');
    const directive = battleDirectiveOf(parseBattleReport(report), { isHero: (n) => n === '林默', floor: 4 });
    const run = (traits) => floor(npc(), '她倒下了。', traits, { noBattle: true, extraDirectives: [directive] }).state.protagonist.bars.stress;
    const start = base().protagonist.bars.stress;
    const plain = run({});
    assert.ok(plain > start);
    assert.equal(run(traitsFor('主角', '完美主义者')), plain + (plain - start));
});

test('毒舌：与主角同场的日子，主角压力每天缓升', () => {
    const dayState = () => ({ ...npc(), protagonist: { ...base().protagonist, bars: { stamina: 100, money: 0, stress: 30 } }, clock: { ...base().clock, day: 9 } });
    const run = (names, present) => settleDay(dayState(), { random: high, rev: 2, traits: traitsFor('林夏', ...names), nsfw: true, present }).protagonist.bars.stress;
    assert.equal(run(['毒舌'], ['林夏']), run([], ['林夏']) + 3);
    assert.equal(run(['毒舌'], []), run([], []));
});

test('天然呆 / 小恶魔 / 狐系：主角对其社交检定奖惩骰', () => {
    const dice = (names) => traitDice(base(), traitCatalogOf(traitsFor('林夏', ...names), true), '林夏', '社交');
    assert.equal(dice(['天然呆']), 1);
    assert.equal(dice(['小恶魔']), -1);
    assert.equal(dice(['狐系']), -1);
});

test('身经百战：自然回血多一半', () => {
    const engine = createEngine({}, {}, undefined, { readVitals: () => ({ hp: 50, maxHp: 100, down: false }) });
    const run = (names) => {
        const cat = { traits: sanitizeTraits({ 主角: Object.fromEntries(names.map((n) => [n, on])) }), nsfw: true };
        return settleNaturalHeal(base(), { settings: normalizeStatsSettings({}), engine, traitCat: cat, present: [], days: 1, changes: [] })[0].amount;
    };
    assert.equal(run([]), 10);
    assert.equal(run(['身经百战']), 15);
});

test('ABO：Alpha、Beta、Omega 三选一互斥', () => {
    for (const [a, b] of [['Alpha', 'Beta'], ['Alpha', 'Omega'], ['Beta', 'Omega']]) assert.ok(getTraitByName(a).exclusive.includes(getTraitByName(b).id), `${a}-${b}`);
});
