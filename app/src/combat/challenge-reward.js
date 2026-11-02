// 日常挑战胜利的「经验」牌奖励：走 planRewardSlots 的简化版，只出一张牌的数据，不写任何存储。纯函数。
import { planRewardSlots } from './rewards.js';
import { solveCardTemplate } from './card-templates.js';
import { hash32, hashString } from './random.js';
import { DOMAIN_CARD_KEYS, CHALLENGE_GENERAL_DOMAIN } from './challenge-cards.js';
import { CHALLENGE_TIER_RULES } from './challenge-setup.js';
import { challengeHarvest } from './challenge-foes.js';

// 奖励牌最高到稀有，且费用至少 1（0 费槽对模板有额外限制）。
export const CHALLENGE_REWARD_RARITIES = Object.freeze(['common', 'uncommon', 'rare']);
const HERO = Object.freeze({ id: 'hero', kind: 'deck-character' });

// 只有圆满且该难关登记了「经验」才出奖励；返回 { ok:true, seed, slot, card } 或 { ok:false, reason }。
export function planChallengeReward({ combatId, outcome, tier = '普通', foe = '', domain = '' } = {}) {
    if (!combatId) return { ok: false, reason: 'challenge-reward-invalid' };
    if (!challengeHarvest(foe, outcome, tier).card) return { ok: false, reason: 'challenge-reward-none' };
    const engineTier = (CHALLENGE_TIER_RULES[tier] || CHALLENGE_TIER_RULES.普通).engineTier;
    const plan = planRewardSlots({ combatId, tier: engineTier, enemyTiers: [engineTier], character: HERO });
    const picked = plan.slots.find((slot) => slot.kind === 'card');
    const slot = {
        rarity: CHALLENGE_REWARD_RARITIES.includes(picked?.rarity) ? picked.rarity : picked ? CHALLENGE_REWARD_RARITIES.at(-1) : CHALLENGE_REWARD_RARITIES[0],
        cost: Math.max(1, Math.min(2, Number(picked?.cost) || 1)),
    };
    const keys = DOMAIN_CARD_KEYS[Object.hasOwn(DOMAIN_CARD_KEYS, domain) ? domain : CHALLENGE_GENERAL_DOMAIN];
    const start = hash32(`${plan.seed}|card`) % keys.length;
    for (let step = 0; step < keys.length; step += 1) {
        const key = keys[(start + step) % keys.length];
        const solved = solveCardTemplate(key, slot.cost, slot.rarity);
        if (solved) return { ok: true, seed: plan.seed, slot, card: { id: `ch-exp-${hashString(plan.seed)}`, name: `${domain || '历练'}心得`, cost: slot.cost, rarity: slot.rarity, ...solved } };
    }
    return { ok: false, reason: 'challenge-reward-unsolved' };
}
