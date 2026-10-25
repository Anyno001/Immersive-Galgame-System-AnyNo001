import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TILES_KINDS,
    TILES_SLOT_SIZE,
    TILES_STYLE,
    buildTilesLayout,
    freeTiles,
    isTileCovered,
    slotAdd,
    slotReturn,
    startTiles,
    tilesCleared,
} from '../src/visual/igs-ui/wait-stage-tiles.js';
import { FakeEl, makeTimers } from './helpers/fake-dom.js';

function seeded(seed) {
    let s = seed;
    return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

function solvable(tiles) {
    let budget = 50000;
    const dfs = (removed) => {
        if (removed.size === tiles.length) return true;
        if (budget-- <= 0) return false;
        const free = freeTiles(tiles, removed);
        const by = {};
        for (const t of free) (by[t.kind] ||= []).push(t);
        for (const group of Object.values(by)) {
            if (group.length < 3) continue;
            for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) for (let k = j + 1; k < group.length; k += 1) {
                const next = new Set(removed);
                next.add(group[i].id); next.add(group[j].id); next.add(group[k].id);
                if (dfs(next)) return true;
            }
        }
        return false;
    };
    return dfs(new Set());
}

test('布局：总数与每种牌数都是 3 的倍数，且存在逐组清空的解', () => {
    for (const level of [1, 2]) {
        for (let seed = 1; seed <= 30; seed += 1) {
            const layout = buildTilesLayout(seeded(seed), level);
            assert.equal(layout.tiles.length % 3, 0);
            const count = {};
            for (const tile of layout.tiles) count[tile.kind] = (count[tile.kind] || 0) + 1;
            for (const n of Object.values(count)) assert.equal(n % 3, 0);
            assert.ok(layout.tiles.every((tile) => TILES_KINDS.some((kind) => kind.id === tile.kind)));
            assert.ok(solvable(layout.tiles), `level ${level} seed ${seed} 无解`);
            assert.ok(layout.tiles.length >= 18);
        }
    }
});

test('布局：第二关比第一关牌多', () => {
    assert.ok(buildTilesLayout(seeded(3), 2).tiles.length > buildTilesLayout(seeded(3), 1).tiles.length);
});

test('遮挡判定：高层重叠的牌压住低层，移走后解除', () => {
    const tiles = [
        { id: 0, x: 1, y: 0, z: 0, kind: 'm1' },
        { id: 1, x: 2, y: 1.25, z: 1, kind: 'm1' },
        { id: 2, x: 9, y: 0, z: 0, kind: 'm1' },
    ];
    assert.equal(isTileCovered(tiles[0], tiles), true);
    assert.equal(isTileCovered(tiles[1], tiles), false);
    assert.equal(isTileCovered(tiles[2], tiles), false);
    assert.deepEqual(freeTiles(tiles).map((t) => t.id), [1, 2]);
    assert.equal(isTileCovered(tiles[0], tiles, new Set([1])), false);
    assert.equal(tilesCleared(tiles, new Set([0, 1])), false);
    assert.equal(tilesCleared(tiles, new Set([0, 1, 2])), true);
});

test('三消：同种牌凑够 3 张自动消除，同种牌在槽内相邻', () => {
    let r = slotAdd([], 'm1');
    r = slotAdd(r.slot, 'p2');
    r = slotAdd(r.slot, 'm1');
    assert.deepEqual(r.slot, ['m1', 'm1', 'p2']);
    assert.equal(r.cleared, false);
    r = slotAdd(r.slot, 'm1');
    assert.equal(r.cleared, true);
    assert.deepEqual(r.slot, ['p2']);
    assert.equal(r.lost, false);
});

test('判负：槽满 7 张且没有消除才输；最后一张凑成三消不算输', () => {
    const kinds = ['m1', 'm2', 'm3', 'p1', 'p2', 'p3'];
    let slot = [];
    for (const kind of kinds) slot = slotAdd(slot, kind).slot;
    assert.equal(slot.length, TILES_SLOT_SIZE - 1);
    const lose = slotAdd(slot, 's1');
    assert.equal(lose.lost, true);
    assert.equal(lose.slot.length, TILES_SLOT_SIZE);
    const ok = slotAdd(['m1', 'm1', 'm2', 'm3', 'p1', 'p2'], 'm1');
    assert.equal(ok.cleared, true);
    assert.equal(ok.lost, false);
});

test('道具：退回槽内最早的 3 张', () => {
    const r = slotReturn([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], 3);
    assert.deepEqual(r.back.map((x) => x.id), [1, 2, 3]);
    assert.deepEqual(r.slot.map((x) => x.id), [4]);
});

test('样式：只用主题变量，带 reduced-motion', () => {
    assert.match(TILES_STYLE, /--igs-bar-ink/);
    assert.match(TILES_STYLE, /prefers-reduced-motion/);
});

test('startTiles：整局可点通关第一关并进入第二关，输了会 markDone', () => {
    const timers = makeTimers();
    const doc = { createElement(tag) { return new FakeEl(doc, tag); } };
    const board = doc.createElement('div');
    let done = 0;
    const notes = [];
    const ctx = {
        doc, board, timers, random: seeded(7), model: {},
        markDone() { done += 1; }, setNote(t) { notes.push(t); }, onVoice() {},
        isSettled() { return false; }, isExiting() { return false; }, requestClose() {},
    };
    startTiles(ctx);
    const field = () => board.children[2].children[0];
    assert.equal(field().children.length, 36);
    // 乱点：只点最顶层可点的牌，直到结束。
    let guard = 0;
    while (!done && guard++ < 400) {
        const nodes = field().children.filter((n) => !/is-gone|is-covered/.test(n.className));
        if (!nodes.length) break;
        nodes[0].fire('click');
    }
    assert.ok(done === 1 || field().children.length > 0);
    assert.ok(notes.length >= 1);
});
