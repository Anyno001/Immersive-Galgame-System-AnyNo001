import assert from 'node:assert/strict';
import test from 'node:test';
import { chengduXiangting } from '../src/visual/igs-ui/scmj/profile.js';

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

function sum(counts) {
    return counts.reduce((total, count) => total + count, 0);
}

function hasQue(counts, que) {
    const start = que * 9;
    for (let id = start; id < start + 9; id += 1) if (counts[id]) return true;
    return false;
}

function groups(counts, need) {
    let id = 0;
    while (id < 27 && counts[id] === 0) id += 1;
    if (id === 27) return need === 0;
    if (need <= 0) return false;
    if (counts[id] >= 3) {
        counts[id] -= 3;
        if (groups(counts, need - 1)) {
            counts[id] += 3;
            return true;
        }
        counts[id] += 3;
    }
    if (id % 9 <= 6 && counts[id + 1] > 0 && counts[id + 2] > 0) {
        counts[id] -= 1;
        counts[id + 1] -= 1;
        counts[id + 2] -= 1;
        if (groups(counts, need - 1)) {
            counts[id] += 1;
            counts[id + 1] += 1;
            counts[id + 2] += 1;
            return true;
        }
        counts[id] += 1;
        counts[id + 1] += 1;
        counts[id + 2] += 1;
    }
    return false;
}

function isStandard(counts, melds) {
    if (sum(counts) !== 14 - melds * 3) return false;
    for (let id = 0; id < 27; id += 1) {
        if (counts[id] < 2) continue;
        counts[id] -= 2;
        if (groups(counts, 4 - melds)) {
            counts[id] += 2;
            return true;
        }
        counts[id] += 2;
    }
    return false;
}

function isSeven(counts, melds) {
    if (melds || sum(counts) !== 14) return false;
    let pairs = 0;
    for (const count of counts) {
        if (count === 0) continue;
        if (count === 2) pairs += 1;
        else if (count === 4) pairs += 2;
        else return false;
    }
    return pairs === 7;
}

function isWin(counts, melds, que) {
    if (hasQue(counts, que)) return false;
    return isSeven(counts, melds) || isStandard(counts, melds);
}

// 和牌距离减 1，和向听同一把尺子。深度只搜索到 3 次摸牌，足够认定距离 ≤ 2。
function exhaustive(counts, melds, que) {
    const target = 14 - melds * 3;
    const memo = new Map();
    function key(arr, budget) {
        return `${budget}:${arr.join(',')}`;
    }
    function draws(arr, budget) {
        if (isWin(arr, melds, que)) return 0;
        if (budget <= 0) return Infinity;
        const id = key(arr, budget);
        const cached = memo.get(id);
        if (cached != null) return cached;
        const size = sum(arr);
        let best = Infinity;
        if (size === target) {
            for (let tile = 0; tile < 27; tile += 1) {
                if (!arr[tile]) continue;
                arr[tile] -= 1;
                best = Math.min(best, draws(arr, budget));
                arr[tile] += 1;
                if (best === 1) break;
            }
        } else if (size === target - 1) {
            const start = [0, 9, 18].filter((base) => base !== que * 9);
            for (const base of start) {
                for (let n = 0; n < 9; n += 1) {
                    const tile = base + n;
                    if (arr[tile] >= 4) continue;
                    arr[tile] += 1;
                    const next = draws(arr, budget - 1);
                    arr[tile] -= 1;
                    if (next !== Infinity) best = Math.min(best, next + 1);
                    if (best === 1) break;
                }
                if (best === 1) break;
            }
        }
        memo.set(id, best);
        return best;
    }
    const needed = draws(counts.slice(), 3);
    return needed === Infinity ? 99 : needed - 1;
}

function winningCounts(rng) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const que = rng() % 3;
        const suits = [0, 1, 2].filter((suit) => suit !== que);
        const melds = rng() % 3;
        const counts = Array(27).fill(0);
        let built = true;
        for (let group = 0; group < 4 - melds; group += 1) {
            let placed = false;
            for (let tryGroup = 0; tryGroup < 30 && !placed; tryGroup += 1) {
                const base = suits[rng() % suits.length] * 9;
                if (rng() % 2 === 0) {
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
            if (!placed) built = false;
        }
        let paired = false;
        for (let tryPair = 0; tryPair < 30 && built && !paired; tryPair += 1) {
            const tile = suits[rng() % suits.length] * 9 + (rng() % 9);
            if (counts[tile] + 2 <= 4) {
                counts[tile] += 2;
                paired = true;
            }
        }
        if (built && paired && isWin(counts, melds, que)) return { counts, que, melds };
    }
    return null;
}

function disturb(counts, rng) {
    const next = counts.slice();
    const times = 1 + (rng() % 2);
    for (let n = 0; n < times; n += 1) {
        const have = [];
        for (let id = 0; id < 27; id += 1) if (next[id]) have.push(id);
        const drop = have[rng() % have.length];
        const add = rng() % 27;
        if (next[add] >= 4) continue;
        next[drop] -= 1;
        next[add] += 1;
    }
    return next;
}

test('gate:scmj:xiangting-matches-depth-2-search', () => {
    const withQue = [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 9];
    const tenpai = [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 3];
    const seven = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6];
    const pairedQue = [18, 19, 20, 21, 22, 23, 24, 25, 26, 0, 1, 2, 9, 9];
    const pung = [0, 1, 2, 3, 4, 5, 6, 7, 8, 18, 18];
    assert.equal(chengduXiangting(withQue, 1), 1);
    assert.equal(chengduXiangting(tenpai, 1), 0);
    assert.equal(chengduXiangting(seven, 2), 0);
    assert.equal(chengduXiangting(pairedQue, 1), 1);
    assert.equal(chengduXiangting(pung, 1, 1), -1);
    assert.equal(exhaustive(holdsToCounts(withQue), 0, 1), 1);
    assert.equal(exhaustive(holdsToCounts(tenpai), 0, 1), 0);
    assert.equal(exhaustive(holdsToCounts(seven), 0, 2), 0);
    assert.equal(exhaustive(holdsToCounts(pairedQue), 0, 1), 1);
    assert.equal(exhaustive(holdsToCounts(pung), 1, 1), -1);

    const hands = Number(process.env.SCMJ_XIANGTING_HANDS || 2000);
    const rng = rngOf(1);
    let compared = 0;
    for (let n = 0; n < hands; n += 1) {
        const win = winningCounts(rng);
        assert.ok(win, 'could not build a winning hand');
        const counts = disturb(win.counts, rng);
        const distance = exhaustive(counts, win.melds, win.que);
        if (distance > 2) continue;
        compared += 1;
        const got = chengduXiangting(holdsOf(counts), win.que, win.melds);
        assert.equal(got, distance, JSON.stringify({ n, que: win.que, melds: win.melds, holds: holdsOf(counts), got, distance }));
    }
    assert.ok(compared > hands * 0.5, `only ${compared} hands were within distance 2`);
});

function holdsToCounts(holds) {
    const counts = Array(27).fill(0);
    for (const id of holds) counts[id] += 1;
    return counts;
}
