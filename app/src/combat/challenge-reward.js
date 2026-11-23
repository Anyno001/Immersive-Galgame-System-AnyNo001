// 日常挑战胜利奖励：
// 1. planPreparedDailyLoot：准备期先从当前领域专属模板池抽取并程序缝合 3 张候选卡，供 LLM 按模板与世界观起名与写来历。
// 2. applyDailyLootNaming：把准备期 LLM 生成的卡名与来历安全合并进候选单，非法或缺失项回退本领域默认卡名池。
// 3. planChallengeLootOffer：胜利时返回三选一盲翻纯卡牌奖励单（优先沿用准备期已命名的候选单，无预备单时确定性本地生成）。
// 4. planChallengeReward：保留旧版单张经验牌函数供兼容与旧回归使用。
import { planRewardSlots } from './rewards.js';
import { solveCardTemplate } from './card-templates.js';
import { hash32, hashString, nextRandom } from './random.js';
import {
    CHALLENGE_GENERAL_DOMAIN,
    DOMAIN_CARD_KEYS,
    DOMAIN_CARD_POOLS,
    describeDailyCardSummary,
    normalizeChallengeDomain,
    stitchChallengeCard,
} from './challenge-cards.js';
import { CHALLENGE_TIER_RULES } from './challenge-setup.js';
import { challengeHarvest } from './challenge-foes.js';

// 奖励牌最高到稀有，且费用至少 1（0 费槽对模板有额外限制）。
export const CHALLENGE_REWARD_RARITIES = Object.freeze(['common', 'uncommon', 'rare']);
export const DAILY_LOOT_SLOT_COUNT = 3;
const HERO = Object.freeze({ id: 'hero', kind: 'deck-character' });

// 按难度档与结局区分稀有度权重（圆满优于勉强，最高到史诗）。
const DAILY_RARITY_WEIGHTS = Object.freeze({
    轻松: Object.freeze({ 勉强: Object.freeze([['common', 75], ['uncommon', 25]]), 圆满: Object.freeze([['common', 55], ['uncommon', 40], ['rare', 5]]) }),
    普通: Object.freeze({ 勉强: Object.freeze([['common', 45], ['uncommon', 45], ['rare', 10]]), 圆满: Object.freeze([['common', 25], ['uncommon', 50], ['rare', 25]]) }),
    艰难: Object.freeze({ 勉强: Object.freeze([['uncommon', 45], ['rare', 45], ['epic', 10]]), 圆满: Object.freeze([['uncommon', 25], ['rare', 50], ['epic', 25]]) }),
});

// 准备期预抽取权重（未知最终结局，按难度档居中取值）。
const DAILY_PREP_RARITY_WEIGHTS = Object.freeze({
    轻松: Object.freeze([['common', 60], ['uncommon', 35], ['rare', 5]]),
    普通: Object.freeze([['common', 30], ['uncommon', 50], ['rare', 20]]),
    艰难: Object.freeze([['uncommon', 30], ['rare', 50], ['epic', 20]]),
});

// 各领域翻牌奖励卡名池：作为无模型兜底，同时也作为风格示例喂给准备期 LLM。
export const DAILY_LOOT_NAMES = Object.freeze({
    烹饪: Object.freeze(['文火慢炖', '提鲜妙招', '刀工利落', '颠勺起锅', '秘制酱汁', '配菜得当', '火候拿捏', '余香留味', '现做现端', '风味平衡', '点睛摆盘', '灶台从容']),
    话术: Object.freeze(['旁征博引', '化繁为简', '切中要害', '妙语解围', '步步紧逼', '洞若观火', '从容定调', '反客为主', '娓娓道来', '掷地有声', '借力打力', '留有余地']),
    学习: Object.freeze(['温故知新', '提纲挈领', '触类旁通', '查漏补缺', '思路豁然', '旁敲侧击', '归纳总结', '重点标注', '逻辑闭环', '过目成诵', '拆题入微', '厚积薄发']),
    应变: Object.freeze(['临危不乱', '审时度势', '将计就计', '化险为夷', '当机立断', '留好后手', '顺势而为', '出其不意', '稳住阵脚', '见缝插针', '转危为机', '收放自如']),
    魅力: Object.freeze(['笑意盈盈', '心照不宣', '恰如其分', '轻声安抚', '目光相接', '投其所好', '默契十足', '温言软语', '分寸得当', '自然亲近', '润物无声', '余韵悠长']),
    照顾: Object.freeze(['细致入微', '未雨绸缪', '恰时递茶', '轻手轻脚', '妥帖周全', '贴心提醒', '耐心倾听', '雪中送炭', '井然有序', '留心冷暖', '安顿妥当', '温柔守护']),
    艺术: Object.freeze(['留白生韵', '气韵生动', '巧思独运', '意境渐开', '笔锋流转', '光影交错', '收笔点睛', '韵律相合', '匠心微调', '灵感迸发', '浑然天成', '余音绕梁']),
    运动: Object.freeze(['步频稳健', '呼吸同调', '核心发力', '加速冲刺', '灵活变向', '重心下沉', '蓄力爆发', '节奏掌控', '轻盈落地', '耐力续航', '舒展回气', '乘胜追击']),
    家务: Object.freeze(['分类归置', '一尘不染', '动线顺手', '随手归位', '高效统筹', '窗明几净', '井井有条', '细节打理', '化繁为简', '省力巧法', '清爽宜人', '妥善收纳']),
    [CHALLENGE_GENERAL_DOMAIN]: Object.freeze(['沉心静气', '稳步推进', '找准节奏', '从容应对', '蓄势待发', '巧妙周旋', '把握先机', '聚精会神', '以静制动', '随机应变', '乘势而上', '收官稳妥']),
});

function randomFrom(seed) {
    let state = hash32(seed);
    return () => {
        const next = nextRandom(state);
        state = next.state;
        return next.value;
    };
}

function pickWeighted(random, table) {
    let roll = random() * table.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [value, weight] of table) {
        roll -= weight;
        if (roll < 0) return value;
    }
    return table[table.length - 1][0];
}

function shuffled(list, random) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function buildDomainLootSlots({ seed, domainKey, rarityTable }) {
    const random = randomFrom(seed);
    // 严格只从当前领域专属模板池中抽牌，不跨领域串池。
    const pool = [...(DOMAIN_CARD_POOLS[domainKey] || DOMAIN_CARD_POOLS[CHALLENGE_GENERAL_DOMAIN])];
    const pickedKeys = shuffled(pool, random);
    const namePool = shuffled(DAILY_LOOT_NAMES[domainKey] || DAILY_LOOT_NAMES[CHALLENGE_GENERAL_DOMAIN], random);
    const slots = [];
    let keyCursor = 0;
    for (let index = 0; index < DAILY_LOOT_SLOT_COUNT; index += 1) {
        const rarity = pickWeighted(random, rarityTable);
        const preferredCost = random() < 0.65 ? 1 : 2;
        const costs = preferredCost === 1 ? [1, 2] : [2, 1];
        let solved = null;
        let cost = 1;
        while (keyCursor < pickedKeys.length && !solved) {
            const key = pickedKeys[keyCursor];
            keyCursor += 1;
            for (const c of costs) {
                const candidate = stitchChallengeCard({ domain: domainKey, key, cost: c, rarity, random, allowStitch: true });
                if (candidate) { solved = candidate; cost = c; break; }
            }
        }
        if (!solved) solved = stitchChallengeCard({ domain: domainKey, key: pool[0] || 'strike', cost: 1, rarity: 'common', random, allowStitch: false }) || solveCardTemplate('strike', 1, 'common');
        const name = namePool[index % namePool.length] || `${domainKey}心得`;
        const origin = `${domainKey}历练`;
        const card = { id: `ch-loot-${hashString(`${seed}|${index}`)}`, name, cost: solved.cost ?? cost, rarity: solved.rarity ?? rarity, ...solved, flavor: origin };
        slots.push({ index, kind: 'card', rarity: card.rarity, name: card.name, origin, card });
    }
    return slots;
}

// 准备期先由程序按本领域专属池抽取并缝合 3 张战利品候选卡，供准备期 LLM 结合世界观起名与写来历。
export function planPreparedDailyLoot({ combatId, randomKey, tier = '普通', domain = '' } = {}) {
    if (!combatId) return null;
    const domainKey = normalizeChallengeDomain(domain);
    const tierKey = Object.hasOwn(CHALLENGE_TIER_RULES, tier) ? tier : '普通';
    const engineTier = CHALLENGE_TIER_RULES[tierKey].engineTier;
    const seed = `daily-loot|${randomKey ?? combatId}|${domainKey}|${tierKey}`;
    const rarityTable = DAILY_PREP_RARITY_WEIGHTS[tierKey] || DAILY_PREP_RARITY_WEIGHTS.普通;
    const slots = buildDomainLootSlots({ seed, domainKey, rarityTable });
    return {
        combatId,
        ...(randomKey ? { randomKey } : {}),
        tier: engineTier,
        domain: domainKey,
        reveal: 0,
        slots,
    };
}

// 供准备期 LLM 阅读的 3 张候选卡模板摘要。
export function describePreparedLootCards(offer) {
    if (!Array.isArray(offer?.slots)) return [];
    return offer.slots.map((slot) => ({
        index: slot.index,
        rarity: slot.rarity,
        cost: slot.card?.cost,
        summary: describeDailyCardSummary(slot.card),
    }));
}

// 把 LLM 按模板生成的名称与来历写回准备期候选单；缺项或非法项保留本领域默认名与来历。
export function applyDailyLootNaming(offer, namedList) {
    if (!offer || !Array.isArray(offer.slots)) return offer;
    const byIndex = new Map();
    for (const item of Array.isArray(namedList) ? namedList : []) {
        if (!item || !Number.isInteger(item.index)) continue;
        byIndex.set(item.index, item);
    }
    if (!byIndex.size) return offer;
    const slots = offer.slots.map((slot) => {
        const picked = byIndex.get(slot.index);
        if (!picked) return slot;
        const name = typeof picked.name === 'string' ? picked.name.trim() : '';
        const origin = typeof picked.origin === 'string' ? picked.origin.trim() : '';
        const nextName = name && [...name].length <= 12 ? name : slot.name;
        const nextOrigin = origin && [...origin].length <= 40 ? origin : slot.origin;
        return {
            ...slot,
            name: nextName,
            origin: nextOrigin,
            card: { ...slot.card, name: nextName, flavor: nextOrigin },
        };
    });
    return { ...offer, slots };
}

// 日常挑战胜利的三选一纯卡牌盲翻奖励单（仅胜利且非亲密对决使用）。
// 若本场准备期已生成 preparedOffer（含 LLM 按世界观起的名称与来历），直接沿用；否则确定性本地生成。
export function planChallengeLootOffer({ combatId, randomKey, outcome = '圆满', tier = '普通', domain = '', preparedOffer = null } = {}) {
    if (!combatId || (outcome !== '圆满' && outcome !== '勉强')) return null;
    const domainKey = normalizeChallengeDomain(domain);
    if (preparedOffer && Array.isArray(preparedOffer.slots) && preparedOffer.slots.length === DAILY_LOOT_SLOT_COUNT) {
        return {
            ...preparedOffer,
            combatId,
            ...(randomKey ? { randomKey } : {}),
            domain: preparedOffer.domain || domainKey,
            reveal: 0,
        };
    }
    const tierKey = Object.hasOwn(CHALLENGE_TIER_RULES, tier) ? tier : '普通';
    const engineTier = CHALLENGE_TIER_RULES[tierKey].engineTier;
    const seed = `daily-loot|${randomKey ?? combatId}|${domainKey}|${tierKey}|${outcome}`;
    const rarityTable = DAILY_RARITY_WEIGHTS[tierKey][outcome] || DAILY_RARITY_WEIGHTS.普通.圆满;
    const slots = buildDomainLootSlots({ seed, domainKey, rarityTable });
    return {
        combatId,
        ...(randomKey ? { randomKey } : {}),
        tier: engineTier,
        domain: domainKey,
        reveal: 0,
        slots,
    };
}

// 只有圆满且该难关登记了「经验」才出奖励；返回 { ok:true, seed, slot, card } 或 { ok:false, reason }。
export function planChallengeReward({ combatId, randomKey, outcome, tier = '普通', foe = '', domain = '' } = {}) {
    if (!combatId) return { ok: false, reason: 'challenge-reward-invalid' };
    if (!challengeHarvest(foe, outcome, tier).card) return { ok: false, reason: 'challenge-reward-none' };
    const engineTier = (CHALLENGE_TIER_RULES[tier] || CHALLENGE_TIER_RULES.普通).engineTier;
    const plan = planRewardSlots({ combatId, randomKey, tier: engineTier, enemyTiers: [engineTier], character: HERO });
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
