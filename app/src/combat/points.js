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
// 规则 v6 积分抽卡（D-09）：3 张本职业候选（固定 2 + 随机 1），选一张进卡组或放弃，放弃不退款；单价不递增。
export const CARD_DRAW_COST = 150;
// 规则 v6 删卡（D-05 / D-06 / D-07）：每满 PURGE_EVERY 场普通战斗胜利给一次机会，过期作废；费用 75 + 50 × 已删次数。
export const PURGE_EVERY = 5;
export const PURGE_BASE_COST = 75;
export const PURGE_STEP_COST = 50;
export const purgeCost = (used) => PURGE_BASE_COST + PURGE_STEP_COST * Math.max(0, Number(used) || 0);
// 出售价在基础价上下浮动的比例。
export const SELL_PRICE_SPREAD = 0.2;
// 规则 v6 G5g 战斗胜利积分（D-16）：按本场最高敌人档位取区间，以战斗 ID 作种子定额。
export const BATTLE_POINTS_RANGE = Object.freeze({
    normal: Object.freeze([10, 15]), elite: Object.freeze([16, 22]), boss: Object.freeze([23, 30]),
});
export const BATTLE_POINT_TIERS = Object.freeze(['normal', 'elite', 'boss']);

// 本场档位：有首领取首领，否则有精英取精英，其余为普通。
export const battleTierOf = (tiers) => (Array.isArray(tiers) && tiers.includes('boss') ? 'boss' : Array.isArray(tiers) && tiers.includes('elite') ? 'elite' : 'normal');

// 胜利积分：区间内按战斗 ID 哈希定额，同一战斗恒定。
export function battlePoints(tier, combatId) {
    const [min, max] = BATTLE_POINTS_RANGE[tier] || BATTLE_POINTS_RANGE.normal;
    return min + (hash32(`igs-win:${combatId ?? ''}`) % (max - min + 1));
}

// 出售价：基础价 ± 20%，浮动由 seed 哈希决定（同 seed 恒定），最低 1。
export function sellPrice(rarity, seed) {
    const base = KEEPSAKE_PRICES[rarity] ?? KEEPSAKE_PRICES.common;
    const spread = Math.round(base * SELL_PRICE_SPREAD);
    return Math.max(1, base - spread + (hash32(`igs-sell:${seed ?? ''}`) % (spread * 2 + 1)));
}
