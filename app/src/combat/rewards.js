// 战斗奖励规划：按敌人档位、难度、特性关联，用固定种子生成翻牌奖励槽位（主组 + 备选组）。纯函数。
import { combatExpReward, difficultyRule } from './rules.js';
import { GEAR_SLOTS, REWARD_SLOT_COUNT } from './schema.js';
import { hash32, nextRandom } from './random.js';

const RARITY_ORDER = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'mythic']);
const rarityIndex = (rarity) => RARITY_ORDER.indexOf(rarity);
const atLeast = (rarity, floor) => rarityIndex(rarity) >= rarityIndex(floor);

// 各敌人档位的掉落规则。keepsake 是非保底槽位出纪念品的概率；guaranteed 是保底槽位数
// （这些槽位不出纪念品）；floor 是保底槽位的稀有度下限；cardCap 是卡牌稀有度上限。
// rarity/kinds 是 [值, 权重] 表；cardRate 是 3 槽盲翻一张的目标卡牌率，从杂物份额补足。
const TIER_LOOT = Object.freeze({
    normal: Object.freeze({ keepsake: 0.85, guaranteed: 0, cardCap: 'uncommon', cardRate: 0.3, rarity: Object.freeze([['common', 75], ['uncommon', 22], ['rare', 3]]), kinds: Object.freeze([['item', 4], ['card', 3], ['gear', 2], ['treasure', 1]]) }),
    elite: Object.freeze({ keepsake: 0.8, guaranteed: 1, cardRate: 0.4, rarity: Object.freeze([['uncommon', 40], ['rare', 40], ['epic', 20]]), kinds: Object.freeze([['card', 3], ['gear', 3], ['item', 2], ['treasure', 2]]) }),
    boss: Object.freeze({ keepsake: 0.8, guaranteed: 1, floor: 'epic', cardRate: 0.5, rarity: Object.freeze([['rare', 50], ['epic', 40], ['mythic', 10]]), keepsakeRarity: Object.freeze([['rare', 20], ['epic', 50], ['mythic', 30]]), kinds: Object.freeze([['card', 3], ['gear', 3], ['treasure', 3], ['item', 1]]) }),
});
// 卡牌费用的权重表。
const CARD_COST_WEIGHTS = Object.freeze([[0, 1], [1, 3], [2, 3], [3, 2]]);
// 装备槽位（不含宝物槽）。
const PLAIN_GEAR_SLOTS = Object.freeze(GEAR_SLOTS.filter((slot) => slot !== 'treasure'));
// 经验奖励上限。
const EXP_REWARD_CAP = 1000;

// 由字符串种子得到一个返回 [0,1) 的随机函数。
function randomFrom(seed) {
    let state = hash32(seed);
    return () => {
        const next = nextRandom(state);
        state = next.state;
        return next.value;
    };
}

// 按权重表抽取。
function pickWeighted(random, table) {
    let roll = random() * table.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [value, weight] of table) {
        roll -= weight;
        if (roll < 0) return value;
    }
    return table[table.length - 1][0];
}

const pickIndex = (random, length) => Math.min(length - 1, Math.floor(random() * length));
export const victoryExpFor = (tiers) => Math.min(combatExpReward(tiers), EXP_REWARD_CAP);
// 规范化特性关联：reveal 0/1/2，reflip/fortune 布尔。
const normalizeLinks = (links) => ({ reveal: links?.reveal === 2 ? 2 : links?.reveal ? 1 : 0, reflip: links?.reflip === true, fortune: links?.fortune === true });
// 稀有度升一档（原地改槽位，封顶神话）。
const bumpRarity = (slot) => {
    slot.rarity = RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, rarityIndex(slot.rarity) + 1)];
};

// 难度的额外掉落：每个槽位以 loot 概率升一档（卡牌不超过该档位的 cardCap）。
function applyLootBonus(slots, rule, loot) {
    if (!loot) return;
    const random = randomFrom(loot.seed);
    for (const slot of slots) {
        if (random() >= loot.chance || (slot.kind === 'card' && rule.cardCap && rarityIndex(slot.rarity) >= rarityIndex(rule.cardCap))) continue;
        bumpRarity(slot);
    }
}

function promoteKeepsakesToCards(slots, rule, kinds, seed) {
    const cardWeight = kinds.find(([kind]) => kind === 'card')?.[1] || 0;
    if (!cardWeight) return;
    const share = rule.keepsake * (REWARD_SLOT_COUNT - rule.guaranteed) / REWARD_SLOT_COUNT;
    const baseRate = (1 - share) * cardWeight / kinds.reduce((sum, [, weight]) => sum + weight, 0);
    const chance = Math.min(1, Math.max(0, (rule.cardRate - baseRate) / share));
    // 独立序列保留原装备、道具和保底槽，只替换抽中的杂物。
    const random = randomFrom(`${seed}|cards`);
    for (const slot of slots) {
        if (slot.kind !== 'keepsake' || random() >= chance) continue;
        let rarity = pickWeighted(random, rule.rarity);
        if (rule.cardCap && rarityIndex(rarity) > rarityIndex(rule.cardCap)) rarity = rule.cardCap;
        Object.assign(slot, { kind: 'card', rarity, cost: pickWeighted(random, CARD_COST_WEIGHTS) });
    }
}

// 生成一组 count 个槽位。fortune 为真时随机一个非纪念品槽位升一档。
function buildSlots(seed, rule, kinds, count, fortune, loot = null) {
    const random = randomFrom(seed);
    const slots = [];
    for (let index = 0; index < count; index += 1) {
        if (index >= rule.guaranteed && random() < rule.keepsake) {
            slots.push({ index, kind: 'keepsake', rarity: pickWeighted(random, rule.keepsakeRarity || rule.rarity) });
            continue;
        }
        let rarity = pickWeighted(random, rule.rarity);
        if (index < rule.guaranteed && rule.floor && rarityIndex(rarity) < rarityIndex(rule.floor)) rarity = rule.floor;
        let kind = pickWeighted(random, kinds);
        // 宝物至少要稀有；卡牌受档位稀有度上限约束。
        if (kind === 'treasure' && !atLeast(rarity, 'rare')) kind = 'gear';
        if (kind === 'card' && rule.cardCap && rarityIndex(rarity) > rarityIndex(rule.cardCap)) rarity = rule.cardCap;
        const slot = { index, kind: kind === 'treasure' ? 'gear' : kind, rarity };
        if (kind === 'card') slot.cost = pickWeighted(random, CARD_COST_WEIGHTS);
        if (kind === 'gear') slot.gearSlot = PLAIN_GEAR_SLOTS[pickIndex(random, PLAIN_GEAR_SLOTS.length)];
        if (kind === 'treasure') slot.gearSlot = 'treasure';
        slots.push(slot);
    }
    promoteKeepsakesToCards(slots, rule, kinds, seed);
    const nonKeepsake = slots.filter((slot) => slot.kind !== 'keepsake');
    if (fortune) {
        const upgradable = nonKeepsake.filter((slot) => rarityIndex(slot.rarity) < RARITY_ORDER.length - 1);
        if (upgradable.length) bumpRarity(upgradable[pickIndex(random, upgradable.length)]);
    }
    applyLootBonus(slots, rule, loot);
    // 物品数量：史诗及以上给 2 个。
    for (const slot of nonKeepsake) if (slot.kind === 'item') slot.count = atLeast(slot.rarity, 'epic') ? 2 : 1;
    return slots;
}

// 规划一场战斗的奖励。返回 { seed, tier, exp, links, slots, reserve }。
export function planRewardSlots({ combatId, randomKey, tier, enemyTiers = [], character = null, links, difficulty } = {}) {
    const tierKey = Object.hasOwn(TIER_LOOT, tier) ? tier : 'normal';
    const rule = TIER_LOOT[tierKey];
    const normalLinks = normalizeLinks(links);
    const seed = `reward|${randomKey ?? combatId ?? ''}|${character?.id ?? ''}`;
    // 只有牌组角色才掉卡牌。
    const kinds = rule.kinds.filter(([kind]) => kind !== 'card' || character?.kind === 'deck-character');
    // 「再翻」关联多给一个槽位。
    const count = REWARD_SLOT_COUNT + (normalLinks.reflip ? 1 : 0);
    const lootChance = difficultyRule(difficulty).loot;
    const lootFor = (key) => (lootChance > 0 ? { chance: lootChance, seed: `${key}|loot` } : null);
    const slots = buildSlots(seed, rule, kinds, count, normalLinks.fortune, lootFor(seed));
    const reserve = buildSlots(`${seed}|reserve`, rule, kinds, count, normalLinks.fortune, lootFor(`${seed}|reserve`));
    return { seed, tier: tierKey, exp: victoryExpFor(enemyTiers), links: normalLinks, slots, reserve };
}
