// 读牌：只用公开信息估计对手 o 听牌的概率、某张牌是他和的牌的概率、点到他平均赔多少。
// 三张表由 scripts/scmj-read-table.mjs 用电脑自对局统计（两轮），这里只查表。
import { threatIndex } from './rules.js';
import { waitWeight } from './planner.js';

const SUIT = (id) => Math.floor(id / 9);

export const TENPAI_CELLS = 125;
export const WAIT_CELLS = 6 * 5 * 5 * 4 * 3;
export const LOSS_CELLS = 2 * 5;

export function queGap(table, o) {
    const river = table.discards[o];
    const que = table.ques[o];
    if (que < 0) return null;
    for (let i = river.length - 1; i >= 0; i -= 1) if (SUIT(river[i]) === que) return river.length - 1 - i;
    return null;
}

export function tenpaiCell(table, o) {
    return threatIndex(table.discards[o].length, table.melds[o].length, queGap(table, o));
}

function oneSuit(table, o) {
    const melds = table.melds[o];
    return melds.length >= 1 && new Set(melds.map((m) => SUIT(m.tile))).size === 1;
}

export function lossCell(table, o) {
    return (oneSuit(table, o) ? 5 : 0) + Math.min(4, table.melds[o].length);
}

// 牌 k 对对手 o：k 那门在他（非缺门）弃牌里的占比、离边张多远、未见张能组成的形状、他在这门/另一门有没有副露、这张他打过没有。
export function waitCell(table, o, k, unseen, holdCount) {
    const que = table.ques[o];
    const suit = SUIT(k);
    let same = 0;
    let other = 0;
    for (const id of table.discards[o]) {
        const s = SUIT(id);
        if (s === que) continue;
        if (s === suit) same += 1;
        else other += 1;
    }
    const share = same + other === 0 ? 5 : Math.min(4, Math.floor((same / (same + other)) * 5));
    const n = (k % 9) + 1;
    const edge = Math.min(n, 10 - n) - 1;
    const w = waitWeight(unseen, k, holdCount);
    const shape = w === 0 ? 0 : w <= 3 ? 1 : w <= 9 ? 2 : w <= 15 ? 3 : 4;
    let mSame = 0;
    let mOther = 0;
    for (const m of table.melds[o]) {
        if (SUIT(m.tile) === suit) mSame = 1;
        else mOther = 1;
    }
    const own = table.fresh[o].has(k) ? 2 : table.discards[o].includes(k) ? 1 : 0;
    return (((share * 5 + edge) * 5 + shape) * 4 + (mSame * 2 + mOther)) * 3 + own;
}

export function createReader(tables) {
    const t = tables && tables.tenpai && tables.tenpai.length === TENPAI_CELLS ? tables.tenpai : null;
    const w = tables && tables.wait && tables.wait.length === WAIT_CELLS ? tables.wait : null;
    const l = tables && tables.loss && tables.loss.length === LOSS_CELLS ? tables.loss : null;
    return {
        ready: Boolean(t && w && l),
        tenpai: (table, o) => (t ? t[tenpaiCell(table, o)] : 0),
        wait: (table, o, k, unseen, holdCount) => (SUIT(k) === table.ques[o] ? 0 : w ? w[waitCell(table, o, k, unseen, holdCount)] : 0),
        loss: (table, o) => (l ? l[lossCell(table, o)] : 0),
    };
}
