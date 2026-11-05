// 获得物品时的候选模板筛选：按名称/描述与正文的字面重合度打分，再用哈希做稳定的伪随机排序。
// 纯函数，无随机数，同样输入永远得到同样结果。
import { hash32 } from './random.js';

export const CANDIDATE_MIN = 3;
export const CANDIDATE_MAX = 5;

// 装备带被动的概率：0 表示从不，1 表示必带，其余按装备名哈希判定（稳定）。
export const GEAR_PASSIVE_CHANCE = Object.freeze({ common: 0, uncommon: 0, rare: 0.3, epic: 0.6, mythic: 1 });

export function gearHasPassive(gearKey, rarity) {
    const chance = GEAR_PASSIVE_CHANCE[rarity] ?? 0;
    if (chance <= 0) return false;
    if (chance >= 1) return true;
    return hash32(`gear-passive:${gearKey}`) / 4294967296 < chance;
}

// 比较时忽略的高频虚字。
const STOP_CHARS = new Set('的了和与并在一名点层张个'.split(''));

// 取文本的字符集合：NFKC 归一，去掉空白/数字/标点/符号与虚字。
function charSet(text) {
    const cleaned = String(text || '').normalize('NFKC').replace(/[\s\d\p{P}\p{S}]/gu, '');
    return new Set([...cleaned].filter((ch) => !STOP_CHARS.has(ch)));
}

// 同分时的定序：权重 w 的键取 w 个哈希里最小的一个（相当于多张签），权重 1 时与原定序一致。
function ticketOrder(seed, key, weight) {
    let best = hash32(`${seed}|${key}`);
    for (let i = 1; i < weight; i += 1) best = Math.min(best, hash32(`${seed}|${key}|${i}`));
    return best;
}

// 从 keys 中挑候选：得分 = describe(key) 与 text 的共有字符数；
// 得分相同按 seed|key 的哈希定序（weightOf 给出的权重越高越靠前）；数量取 max(min, 有得分的数量)，且不超过 max 与总数。
export function templateCandidates(keys, describe, text, seed, { min = CANDIDATE_MIN, max = CANDIDATE_MAX, weightOf = null } = {}) {
    const textChars = charSet(text);
    const scored = [...new Set(keys)].map((key) => {
        let score = 0;
        for (const ch of charSet(describe(key))) if (textChars.has(ch)) score += 1;
        return { key, score, order: ticketOrder(seed, key, Math.max(1, Math.floor(weightOf ? weightOf(key) : 1))) };
    }).sort((a, b) => b.score - a.score || a.order - b.order);
    const matched = scored.filter((item) => item.score > 0).length;
    return scored.slice(0, Math.min(max, scored.length, Math.max(min, matched))).map((item) => item.key);
}
