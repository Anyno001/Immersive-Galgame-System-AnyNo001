import { hash32 } from './random.js';

// 积分（助手反馈 3，数值为十倍口径）：只主角有收支；余额不另存，由日志表 sell（卖出背包里的杂物或装备，加分）与 loot（翻牌换上备用套，扣分）等条目
// 按楼层顺序推导，楼层换 swipe 或删楼时随条目回退。纯常量与纯函数，不读写存储。
export const KEEPSAKE_PRICES = Object.freeze({ common: 10, uncommon: 20, rare: 40, epic: 80, mythic: 150 });
// 翻牌花积分重抽一次：换上准备阶段一起生成的备用套。
export const REROLL_COST = 30;
// 重新生成主角基础卡组（P-b）：写入 rebuild 条目时扣，生成失败不写、不扣。
export const REBUILD_COST = 200;
// 转职（P-c）：花积分换到另一个职业（已登记职业或按剧情新生成），阶数回到一阶；写入 respec 条目时扣，失败不写、不扣。
export const RESPEC_COST = 150;
// 职业升阶（P-c）：逐阶升到二阶 / 三阶的花费、主角等级门槛与追加职业卡（3 张）的稀有度；写入 ascend 条目时扣，生成失败不写、不扣。
export const ASCEND_TIERS = Object.freeze({
    2: Object.freeze({ cost: 300, level: 5, rarity: 'rare' }),
    3: Object.freeze({ cost: 600, level: 10, rarity: 'epic' }),
});
// 抽人物特性（P-d）：生成成功、写入 trait 条目时扣，生成失败或取消不写、不扣。
export const TRAIT_DRAW_COST = 100;

// 售价：以稀有度基准价为中心，按物品身份（杂物为 loot 条目 ID、装备为 gearId）确定性上下浮动 SELL_PRICE_SPREAD，
// 同一物品每次归并都得同一价；没有或未登记稀有度（如剧情 equip 标签得到的装备）按普通。杂物与装备同规则。
export const SELL_PRICE_SPREAD = 0.2;
export function sellPrice(rarity, key) {
    const base = KEEPSAKE_PRICES[rarity] ?? KEEPSAKE_PRICES.common;
    const span = Math.round(base * SELL_PRICE_SPREAD);
    return Math.max(1, base - span + (hash32(`igs-sell:${key ?? ''}`) % (span * 2 + 1)));
}
