import { hash32 } from './random.js';

// 正文获得物（带稀有度的 equip / item / learn，D7–D9，助手 10-30）的候选模板：
// 调用方先按类型、部位与该稀有度下有解筛出 keys；这里按名称与简述和模板说明的字面重合排序，
// 有重合的不足 CANDIDATE_MIN 个时按种子补足，最多 CANDIDATE_MAX 个。同一输入结果确定。
export const CANDIDATE_MIN = 3;
export const CANDIDATE_MAX = 5;
// 带稀有度装备的被动出现概率（D7，助手 10-30）：普通、罕见没有被动；按装备 ID 种子抽定，同一件装备结果恒定。
export const GEAR_PASSIVE_CHANCE = Object.freeze({ common: 0, uncommon: 0, rare: 0.3, epic: 0.6, mythic: 1 });
export function gearHasPassive(gearId, rarity) {
    const p = GEAR_PASSIVE_CHANCE[rarity] ?? 0;
    if (p <= 0) return false;
    if (p >= 1) return true;
    return hash32(`gear-passive:${gearId}`) / 4294967296 < p;
}

const STOP = new Set('的了和与并在一名点层张个'.split(''));
const charsOf = (s) => new Set([...String(s || '').normalize('NFKC').replace(/[\s\d\p{P}\p{S}]/gu, '')].filter((ch) => !STOP.has(ch)));

export function templateCandidates(keys, labelOf, text, seed, { min = CANDIDATE_MIN, max = CANDIDATE_MAX } = {}) {
    const want = charsOf(text);
    const scored = [...new Set(keys)].map((key) => {
        let score = 0;
        for (const ch of charsOf(labelOf(key))) if (want.has(ch)) score += 1;
        return { key, score, order: hash32(`${seed}|${key}`) };
    }).sort((a, b) => b.score - a.score || a.order - b.order);
    const hits = scored.filter((s) => s.score > 0).length;
    return scored.slice(0, Math.min(max, scored.length, Math.max(min, hits))).map((s) => s.key);
}
