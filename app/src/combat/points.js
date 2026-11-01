// 战斗点数经济：出售价、重抽/重建/洗点/升阶费用、特性抽取费用。数值原样来自 v0.39.0。
import { hash32 } from './random.js';

// 纪念品基础价，按稀有度。
export const KEEPSAKE_PRICES = Object.freeze({ common: 10, uncommon: 20, rare: 40, epic: 80, mythic: 150 });
export const REROLL_COST = 30;
export const REBUILD_COST = 200;
export const RESPEC_COST = 150;
// 升阶档：键为目标阶数，要求等级与最低稀有度。
export const ASCEND_TIERS = Object.freeze({
    2: Object.freeze({ cost: 300, level: 5, rarity: 'rare' }),
    3: Object.freeze({ cost: 600, level: 10, rarity: 'epic' }),
});
export const TRAIT_DRAW_COST = 100;
// 出售价在基础价上下浮动的比例。
export const SELL_PRICE_SPREAD = 0.2;

// 出售价：基础价 ± 20%，浮动由 seed 哈希决定（同 seed 恒定），最低 1。
export function sellPrice(rarity, seed) {
    const base = KEEPSAKE_PRICES[rarity] ?? KEEPSAKE_PRICES.common;
    const spread = Math.round(base * SELL_PRICE_SPREAD);
    return Math.max(1, base - spread + (hash32(`igs-sell:${seed ?? ''}`) % (spread * 2 + 1)));
}
