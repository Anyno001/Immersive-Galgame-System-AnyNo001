import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDim, stageOf } from '../src/scene/stats/stat-favor.js';
import { applyGift, applyKeyEvent, coolDown } from '../src/scene/stats/stat-favor-events.js';
import { createCharacter } from '../src/scene/stats/stat-state.js';

const high = () => 0.99; // d100 = 99
function seq(...values) { let i = 0; return () => values[i++ % values.length]; }
// rollD100 先取个位再取十位；返回能掷出 v 的两个随机值。
function d100(v) { const unit = v % 10; const ten = v === 100 ? 0 : Math.floor(v / 10); return [(unit + 0.5) / 10, (ten + 0.5) / 10]; }
function withFavor(favor, patch = {}) { const c = createCharacter(1); return { ...c, ...patch, dims: { ...c.dims, 好感: favor } }; }
const favorAfter = (c, value, random) => applyDim(c, '好感', value, { random }).character.dims.好感;

test('好感边界 -100、-1、0、1、25、26、100（易错点 E6）', () => {
    const cases = [[-100, -98, -100], [-1, 1, -7], [0, 2, -6], [1, 3, -5], [25, 25, 19], [26, 28, 20], [100, 100, 94]];
    for (const [from, up, down] of cases) {
        assert.equal(favorAfter(withFavor(from), '开心', high), up, `开心 ${from}`);
        assert.equal(favorAfter(withFavor(from), '受伤', high), down, `受伤 ${from}`);
    }
});

test('越高越难涨：点数不大于当前值只加 1，负值按 0 算', () => {
    assert.equal(favorAfter(withFavor(30), '感动', seq(...d100(20))), 31);
    assert.equal(favorAfter(withFavor(30), '感动', seq(...d100(40))), 33);
    assert.equal(favorAfter(withFavor(-40), '感动', seq(...d100(5))), -37);
});

test('信任正向减半、负向加倍', () => {
    const c = createCharacter(1);
    assert.equal(applyDim(c, '信任', '上升', { random: high }).character.dims.信任, 1);
    assert.equal(applyDim(c, '信任', '下降', { random: high }).character.dims.信任, -4);
});

test('单楼 +3 与每日 +8 上限，扣分不设上限', () => {
    assert.equal(favorAfter(withFavor(30, { daily: { day: 1, gained: { 好感: 7 } } }), '感动', high), 31);
    const full = withFavor(30, { daily: { day: 1, gained: { 好感: 8 } } });
    assert.equal(favorAfter(full, '感动', high), 30);
    assert.equal(applyDim(withFavor(30), '好感', '感动', { random: high, floorRoom: 1 }).character.dims.好感, 31);
    assert.equal(favorAfter(full, '受伤', high), 24);
});

test('关口封顶；关键事件突破后同一关口不再封顶，也不能重复使用（易错点 E4）', () => {
    assert.equal(favorAfter(withFavor(24), '心动', high), 25);
    const fail = applyKeyEvent(withFavor(25), '约会', { charm: 50, random: high });
    assert.equal(fail.result.success, false);
    assert.equal(fail.character.dims.好感, 25);
    const pass = applyKeyEvent(withFavor(25), '约会', { charm: 50, random: seq(...d100(10)) });
    assert.equal(pass.result.success, true);
    assert.equal(pass.character.dims.好感, 26);
    assert.deepEqual(pass.character.unlocked, ['gate-25']);
    const dropped = { ...pass.character, dims: { ...pass.character.dims, 好感: 24 } };
    assert.equal(favorAfter(dropped, '心动', high), 27);
    const again = applyKeyEvent({ ...dropped, dims: { ...dropped.dims, 好感: 25 } }, '告白', { charm: 50, random: seq(...d100(10)) });
    assert.equal(again.result.reason, 'not-at-gate');
    assert.equal(favorAfter(withFavor(48, { unlocked: ['gate-25'] }), '心动', high), 50);
});

test('同类礼物重复递减：第二次减半，第三次不加', () => {
    let c = withFavor(10);
    const values = [];
    for (let i = 0; i < 3; i += 1) { c = applyGift(c, '甜点', { random: high }).character; values.push(c.dims.好感); }
    assert.deepEqual(values, [12, 13, 13]);
    assert.equal(applyGift(c, '花', { random: high }).character.dims.好感, 15);
});

test('冷落超过 3 天每天 −1，止于阶段下限；负值不变', () => {
    const c = withFavor(40, { lastSeenDay: 1 });
    assert.equal(coolDown(c, 4).dims.好感, 40);
    assert.equal(coolDown(c, 5).dims.好感, 39);
    assert.equal(coolDown(c, 30, 30).dims.好感, 26);
    assert.equal(coolDown(withFavor(-10, { lastSeenDay: 1 }), 10).dims.好感, -10);
    assert.equal(stageOf(26).name, '明确喜欢');
});
