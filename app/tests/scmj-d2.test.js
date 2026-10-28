import assert from 'node:assert/strict';
import test from 'node:test';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { chengduWaits } from '../src/visual/igs-ui/scmj/profile.js';

function rngOf(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return (value ^ (value >>> 14)) >>> 0;
    };
}

function holdsOf(counts) {
    const holds = [];
    for (let id = 0; id < 27; id += 1) {
        for (let n = 0; n < counts[id]; n += 1) holds.push(id);
    }
    return holds;
}

function winningCounts(rng) {
    const que = rng() % 3;
    const suits = [0, 1, 2].filter((suit) => suit !== que);
    const melds = rng() % 3;
    const counts = Array(27).fill(0);
    for (let group = 0; group < 4 - melds; group += 1) {
        let placed = false;
        for (let attempt = 0; attempt < 40 && !placed; attempt += 1) {
            const base = suits[rng() % suits.length] * 9;
            if ((rng() % 3) === 0) {
                const tile = base + (rng() % 9);
                if (counts[tile] + 3 <= 4) {
                    counts[tile] += 3;
                    placed = true;
                }
            } else {
                const tile = base + (rng() % 7);
                if (counts[tile] < 4 && counts[tile + 1] < 4 && counts[tile + 2] < 4) {
                    counts[tile] += 1;
                    counts[tile + 1] += 1;
                    counts[tile + 2] += 1;
                    placed = true;
                }
            }
        }
        if (!placed) return winningCounts(rng);
    }
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const tile = suits[rng() % suits.length] * 9 + (rng() % 9);
        if (counts[tile] + 2 <= 4) {
            counts[tile] += 2;
            return { counts, que, melds };
        }
    }
    return winningCounts(rng);
}

test('gate:scmj:waits-match-youlin-tingmap', () => {
    const controller = createScmjController({ seed: 1 });
    const checkCanTingPai = controller.xzdd.__internals.checkCanTingPai;
    const hands = Number(process.env.SCMJ_WAIT_HANDS || 5000);
    const rng = rngOf(7);
    let tenpai = 0;
    for (let n = 0; n < hands; n += 1) {
        const win = winningCounts(rng);
        const counts = win.counts.slice();
        const have = [];
        for (let id = 0; id < 27; id += 1) if (counts[id]) have.push(id);
        counts[have[rng() % have.length]] -= 1;
        if (rng() % 3 === 0) {
            const add = rng() % 27;
            if (counts[add] < 4) {
                const dropFrom = [];
                for (let id = 0; id < 27; id += 1) if (counts[id]) dropFrom.push(id);
                counts[dropFrom[rng() % dropFrom.length]] -= 1;
                counts[add] += 1;
            }
        }
        const holds = holdsOf(counts);
        const seat = {
            holds: holds.slice(),
            countMap: {},
            que: win.que,
            tingMap: {},
            pengs: [],
            angangs: [],
            diangangs: [],
            wangangs: [],
        };
        for (const id of holds) seat.countMap[id] = (seat.countMap[id] || 0) + 1;
        checkCanTingPai(null, seat);
        const youlin = Object.keys(seat.tingMap).map(Number).sort((a, b) => a - b);
        const ours = chengduWaits(holds, win.que, win.melds).slice().sort((a, b) => a - b);
        if (youlin.length) tenpai += 1;
        assert.equal(ours.length > 0, youlin.length > 0, JSON.stringify({ n, holds, que: win.que, melds: win.melds, ours, youlin }));
        assert.deepEqual(ours, youlin, JSON.stringify({ n, holds, que: win.que, melds: win.melds }));
    }
    assert.ok(tenpai > hands * 0.3, `only ${tenpai} tenpai hands`);
});
