import assert from 'node:assert/strict';
import test from 'node:test';
import { createScmjController } from '../src/visual/igs-ui/scmj/controller.js';
import { createScmjPlayer } from '../src/visual/igs-ui/scmj/player.js';
import { chengduWaits, chengduXiangting } from '../src/visual/igs-ui/scmj/profile.js';
import readJson from '../src/visual/igs-ui/scmj/read-table.json' with { type: 'json' };
import { createReader } from '../src/visual/igs-ui/scmj/reading.js';
import { chengduSettle, tenpaiValues } from '../src/visual/igs-ui/scmj/rules.js';
import { countsOf, fastXiangting } from '../src/visual/igs-ui/scmj/shanten.js';

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

function randomHand(rng, size) {
    const pool = [];
    for (let id = 0; id < 27; id += 1) for (let n = 0; n < 4; n += 1) pool.push(id);
    const holds = [];
    for (let n = 0; n < size; n += 1) holds.push(pool.splice(rng() % pool.length, 1)[0]);
    return holds.sort((a, b) => a - b);
}

// 一门缺、两门做成 4 面子 1 雀头，再拿掉一张、可能换进一张别的，得到近听牌的 13 张。
function nearTenpai(rng) {
    const que = rng() % 3;
    const suits = [0, 1, 2].filter((suit) => suit !== que);
    const counts = Array(27).fill(0);
    const put = (ids) => {
        if (ids.some((id) => counts[id] + ids.filter((other) => other === id).length > 4)) return false;
        for (const id of ids) counts[id] += 1;
        return true;
    };
    let groups = 0;
    while (groups < 4) {
        const base = suits[rng() % 2] * 9;
        const tile = base + (rng() % 7);
        if (rng() % 3 === 0 ? put([tile, tile, tile]) : put([tile, tile + 1, tile + 2])) groups += 1;
    }
    while (!put(Array(2).fill(suits[rng() % 2] * 9 + (rng() % 9))));
    const holds = [];
    for (let id = 0; id < 27; id += 1) for (let n = 0; n < counts[id]; n += 1) holds.push(id);
    holds.splice(rng() % holds.length, 1);
    if (rng() % 3 === 0) {
        const add = rng() % 27;
        if (holds.filter((id) => id === add).length < 4) holds.splice(rng() % holds.length, 1, add);
    }
    return { holds: holds.sort((a, b) => a - b), que };
}

test('gate:scmj:fast-xiangting-matches-profile', () => {
    const rng = rngOf(11);
    for (let n = 0; n < 4000; n += 1) {
        if (n % 2) {
            const { holds, que } = nearTenpai(rng);
            assert.equal(fastXiangting(countsOf(holds), que, 0), chengduXiangting(holds, que, 0), JSON.stringify({ holds, que }));
            continue;
        }
        const melds = rng() % 3;
        const holds = randomHand(rng, (n % 4 ? 14 : 13) - 3 * melds);
        const que = rng() % 3;
        assert.equal(fastXiangting(countsOf(holds), que, melds), chengduXiangting(holds, que, melds), JSON.stringify({ holds, que, melds }));
    }
});

test('gate:scmj:tenpai-values-match-youlin-settle', () => {
    const internals = createScmjController({ seed: 1 }).xzdd.__internals;
    const rng = rngOf(23);
    const none = { pengs: [], angangs: [], diangangs: [], wangangs: [] };
    let tenpai = 0;
    for (let n = 0; n < 1500; n += 1) {
        const { holds, que } = nearTenpai(rng);
        const values = tenpaiValues(internals, { holds, que, ...none });
        assert.deepEqual(values.map((row) => row.pai), chengduWaits(holds, que, 0), JSON.stringify({ holds, que }));
        for (const row of values) {
            tenpai += 1;
            const spec = { holds: holds.concat(row.pai), win: row.pai, que, ...none, payers: 1 };
            assert.equal(row.zimo, chengduSettle(internals, { ...spec, zimo: true }).score);
            assert.equal(row.ron, chengduSettle(internals, { ...spec, zimo: false }).score);
        }
    }
    assert.ok(tenpai > 300);
});

test('gate:scmj:reader-treats-the-que-suit-as-safe', () => {
    const reader = createReader(readJson);
    assert.equal(reader.ready, true);
    const player = createScmjPlayer(0, 1001, createScmjController({ seed: 1 }).xzdd.__internals);
    const table = player.table;
    table.ques = [0, 2, 1, 0];
    table.discards[1] = [0, 9, 10, 26];
    const unseen = Array(27).fill(4);
    for (let id = 0; id < 27; id += 1) {
        const w = reader.wait(table, 1, id, unseen, 0);
        if (Math.floor(id / 9) === 2) assert.equal(w, 0);
        else assert.ok(w > 0, `tile ${id}`);
    }
});

test('gate:scmj:dingque-and-huan-pick-the-lone-suit', () => {
    const internals = createScmjController({ seed: 1 }).xzdd.__internals;
    const player = createScmjPlayer(0, 1001, internals);
    // 筒 123 456 99、条 234 6、万一张孤张：缺万。
    assert.equal(player.decide({ pending: 'dingque', holds: [0, 1, 2, 3, 4, 5, 8, 8, 10, 11, 12, 14, 22] }).que, 2);
    const huan = player.decide({ pending: 'huan', holds: [0, 1, 2, 3, 4, 5, 8, 8, 10, 11, 12, 20, 22] }).huan;
    assert.equal(huan.length, 3);
    assert.equal(new Set(huan.map((id) => Math.floor(id / 9))).size, 1);
    assert.deepEqual(createScmjPlayer(0, 1001, internals).decide({ pending: 'huan', holds: [0, 1, 2, 3, 4, 5, 8, 8, 10, 11, 12, 20, 22] }).huan, huan);
});
