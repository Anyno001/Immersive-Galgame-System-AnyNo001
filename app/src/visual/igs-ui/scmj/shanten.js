// 成都向听的快速版：与 profile.js 的 chengduXiangting 结果相同，但直接吃幼麟牌码计数，按单门缓存。
// 一般形照搬 @kobalab/majiang-core xiangting.js 的 mianzi/dazi/_xiangting；七对与 profile.js 的 qiduiXiangting 一致。

function _xiangting(m, d, g, j) {
    const n = j ? 4 : 5;
    if (m > 4) { d += m - 4; m = 4; }
    if (m + d > 4) { g += m + d - 4; d = 4 - m; }
    if (m + d + g > n) g = n - m - d;
    if (j) d += 1;
    return 13 - m * 3 - d * 2 - g;
}

function dazi(bingpai) {
    let nPai = 0;
    let nDazi = 0;
    let nGuli = 0;
    for (let n = 1; n <= 9; n += 1) {
        nPai += bingpai[n];
        if (n <= 7 && bingpai[n + 1] === 0 && bingpai[n + 2] === 0) {
            nDazi += nPai >> 1;
            nGuli += nPai % 2;
            nPai = 0;
        }
    }
    nDazi += nPai >> 1;
    nGuli += nPai % 2;
    return { a: [0, nDazi, nGuli], b: [0, nDazi, nGuli] };
}

function mianzi(bingpai, n = 1) {
    if (n > 9) return dazi(bingpai);
    const max = mianzi(bingpai, n + 1);
    if (n <= 7 && bingpai[n] > 0 && bingpai[n + 1] > 0 && bingpai[n + 2] > 0) {
        bingpai[n] -= 1; bingpai[n + 1] -= 1; bingpai[n + 2] -= 1;
        const r = mianzi(bingpai, n);
        bingpai[n] += 1; bingpai[n + 1] += 1; bingpai[n + 2] += 1;
        r.a[0] += 1; r.b[0] += 1;
        if (r.a[2] < max.a[2] || (r.a[2] === max.a[2] && r.a[1] < max.a[1])) max.a = r.a;
        if (r.b[0] > max.b[0] || (r.b[0] === max.b[0] && r.b[1] > max.b[1])) max.b = r.b;
    }
    if (bingpai[n] >= 3) {
        bingpai[n] -= 3;
        const r = mianzi(bingpai, n + 1);
        bingpai[n] += 3;
        r.a[0] += 1; r.b[0] += 1;
        if (r.a[2] < max.a[2] || (r.a[2] === max.a[2] && r.a[1] < max.a[1])) max.a = r.a;
        if (r.b[0] > max.b[0] || (r.b[0] === max.b[0] && r.b[1] > max.b[1])) max.b = r.b;
    }
    return max;
}

const SUIT_MEMO = new Map();
const ZERO = Object.freeze({ a: [0, 0, 0], b: [0, 0, 0] });

function suitKey(hand, base) {
    let key = 0;
    for (let i = 8; i >= 0; i -= 1) key = key * 5 + hand[base + i];
    return key;
}

function suitParts(hand, base) {
    const key = suitKey(hand, base);
    if (key === 0) return ZERO;
    let hit = SUIT_MEMO.get(key);
    if (!hit) {
        const bingpai = [0];
        for (let i = 0; i < 9; i += 1) bingpai.push(hand[base + i]);
        const r = mianzi(bingpai);
        hit = { a: r.a.slice(), b: r.b.slice() };
        SUIT_MEMO.set(key, hit);
    }
    return hit;
}

function combine(parts, nFulou, jiangpai) {
    let min = 13;
    const [x, y, z] = parts;
    for (const m of [x.a, x.b]) {
        for (const p of [y.a, y.b]) {
            for (const s of [z.a, z.b]) {
                const v = _xiangting(nFulou + m[0] + p[0] + s[0], m[1] + p[1] + s[1], m[2] + p[2] + s[2], jiangpai);
                if (v < min) min = v;
            }
        }
    }
    return min;
}

function yiban(hand, que, nFulou) {
    const parts = [0, 1, 2].map((s) => (s === que ? ZERO : suitParts(hand, s * 9)));
    let min = combine(parts, nFulou, false);
    for (let s = 0; s < 3; s += 1) {
        if (s === que) continue;
        const base = s * 9;
        for (let i = 0; i < 9; i += 1) {
            if (hand[base + i] < 2) continue;
            hand[base + i] -= 2;
            const saved = parts[s];
            parts[s] = suitParts(hand, base);
            const v = combine(parts, nFulou, true);
            parts[s] = saved;
            hand[base + i] += 2;
            if (v < min) min = v;
        }
    }
    return min;
}

// 四个一样记两对，三个记一对加一张单（幼麟 checkCanTingPai 的龙七对口径）。
function qidui(hand, que) {
    let pairs = 0;
    let singles = 0;
    for (let id = 0; id < 27; id += 1) {
        if (Math.floor(id / 9) === que) continue;
        const c = hand[id];
        if (c >= 4) pairs += 2;
        else if (c >= 2) pairs += 1;
        if (c % 2 === 1) singles += 1;
    }
    if (pairs > 7) pairs = 7;
    if (pairs + singles > 7) singles = 7 - pairs;
    return 13 - pairs * 2 - singles;
}

// hand：长度 27 的计数（幼麟牌码），que：0 筒 1 条 2 万，-1/null 不定缺；nFulou：碰杠数。
export function fastXiangting(hand, que, nFulou = 0) {
    const q = que === 0 || que === 1 || que === 2 ? que : -1;
    const v = yiban(hand, q, nFulou);
    return nFulou ? v : Math.min(v, qidui(hand, q));
}

export function countsOf(holds) {
    const hand = new Array(27).fill(0);
    for (const id of holds) hand[id] += 1;
    return hand;
}
