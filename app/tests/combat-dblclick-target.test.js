// 双击出牌的目标决策（纯函数）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { autoTargetFor } from '../src/visual/igs-ui/combat-target-picker.js';

const u = (id, side, alive = true) => ({ id, name: id, side, alive, hp: 10, maxHp: 20 });
const card = (over) => ({ inst: 'c1', playable: true, targets: [], affects: [], ...over });
const view = (c, allies = [u('hero', 'ally')], enemies = [u('e1', 'enemy')]) => ({ hand: [c], allies, enemies });

test('无需目标 / 全体：直接打出', () => {
    assert.deepEqual(autoTargetFor(view(card({ affects: ['hero'] })), 'c1'), { kind: 'play', ids: ['hero'] });
    assert.deepEqual(autoTargetFor(view(card()), 'c1'), { kind: 'play', ids: [] });
});
test('攻击单体：敌人 1 个打它，多个打前排', () => {
    assert.deepEqual(autoTargetFor(view(card({ targets: ['e1'] })), 'c1'), { kind: 'target', ids: ['e1'] });
    const es = [u('e1', 'enemy'), u('e2', 'enemy'), u('e3', 'enemy')];
    const v = view(card({ targets: ['e1', 'e2', 'e3'] }), undefined, es);
    assert.deepEqual(autoTargetFor(v, 'c1', 'e2'), { kind: 'target', ids: ['e2'] });
    assert.deepEqual(autoTargetFor(v, 'c1', ''), { kind: 'target', ids: ['e1'] });
    assert.deepEqual(autoTargetFor(view(card({ targets: ['e1', 'e3'] }), undefined, [u('e1', 'enemy', false), u('e2', 'enemy'), u('e3', 'enemy')]), 'c1', 'e2'), { kind: 'target', ids: ['e3'] });
});
test('友方：仅主角直接用，多名弹选择', () => {
    assert.deepEqual(autoTargetFor(view(card({ targets: ['hero'] })), 'c1'), { kind: 'target', ids: ['hero'] });
    const al = [u('hero', 'ally'), u('a2', 'ally'), u('a3', 'ally', false)];
    assert.deepEqual(autoTargetFor(view(card({ targets: ['hero', 'a2', 'a3'] }), al), 'c1'), { kind: 'pick', ids: ['hero', 'a2'] });
});
test('不可出的牌与不存在的牌：none', () => {
    assert.equal(autoTargetFor(view(card({ playable: false })), 'c1').kind, 'none');
    assert.equal(autoTargetFor(view(card()), 'zz').kind, 'none');
});
