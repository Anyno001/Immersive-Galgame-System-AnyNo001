// 牌码映射和成都向听。向听先清掉定缺那门，再取一般形和七对的较小值，不算国士。
import Majiang from '@kobalab/majiang-core';

const SUITS = ['p', 's', 'm'];

export function youlinSuit(id) {
    if (id >= 0 && id < 9) return 'p';
    if (id >= 9 && id < 18) return 's';
    return 'm';
}

export function youlinToCode(id) {
    return `${youlinSuit(id)}${(id % 9) + 1}`;
}

export function codeToYoulin(code) {
    const suit = code[0];
    const n = Number(code.slice(1)) - 1;
    return (suit === 'p' ? 0 : suit === 's' ? 9 : 18) + n;
}

export function queToSuit(que) {
    return SUITS[que] || null;
}

export function handToShoupai(holds, melds = 0) {
    const shoupai = new Majiang.Shoupai([]);
    for (const id of holds) {
        const code = youlinToCode(id);
        shoupai._bingpai[code[0]][Number(code.slice(1))] += 1;
    }
    for (let i = 0; i < melds; i += 1) shoupai._fulou.push('m111');
    return shoupai;
}

// 四个一样记两对。幼麟 checkCanTingPai 在 c == 4 时 pairCount += 2，龙七对才听得对。
function qiduiXiangting(shoupai) {
    if (shoupai._fulou.length) return Infinity;
    let pairs = 0;
    let singles = 0;
    for (const suit of SUITS) {
        const row = shoupai._bingpai[suit];
        for (let n = 1; n <= 9; n += 1) {
            const count = row[n];
            if (count >= 4) pairs += 2;
            else if (count >= 2) pairs += 1;
            if (count % 2 === 1) singles += 1;
        }
    }
    if (pairs > 7) pairs = 7;
    if (pairs + singles > 7) singles = 7 - pairs;
    return 13 - pairs * 2 - singles;
}

// que 为 null 时不定缺（换三张、定缺决策）。有副露时七对不成立。
export function chengduXiangting(holds, que, melds = 0) {
    const shoupai = handToShoupai(holds, melds);
    const suit = queToSuit(que);
    if (suit) {
        for (let n = 1; n <= 9; n += 1) shoupai._bingpai[suit][n] = 0;
    }
    return Math.min(Majiang.Util.xiangting_yiban(shoupai), qiduiXiangting(shoupai));
}

// 听牌集合：手里还有缺门牌就没有听；只列出摸进后和牌的牌。期望值搜索用的是向听下降的牌，不走这里。
export function chengduWaits(holds, que, melds = 0) {
    const suit = queToSuit(que);
    if (suit && holds.some((id) => youlinSuit(id) === suit)) return [];
    const shoupai = handToShoupai(holds, melds);
    if (chengduXiangtingShoupai(shoupai, que) !== 0) return [];
    const waits = [];
    for (let id = 0; id < 27; id += 1) {
        if (youlinSuit(id) === suit) continue;
        const next = handToShoupai(holds.concat(id), melds);
        if (chengduXiangtingShoupai(next, que) === -1) waits.push(id);
    }
    return waits;
}

export function chengduXiangtingShoupai(shoupai, que) {
    const copy = shoupai.clone();
    const suit = queToSuit(que);
    if (suit) copy._bingpai[suit] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    copy._bingpai.z = [0, 0, 0, 0, 0, 0, 0, 0];
    return Math.min(Majiang.Util.xiangting_yiban(copy), qiduiXiangting(copy));
}
