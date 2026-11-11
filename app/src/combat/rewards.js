// 战斗奖励规划：按敌人档位、难度、特性关联，用固定种子生成翻牌奖励槽位（主组 + 备选组）。纯函数。
import { cardCopyLimit, combatExpReward, difficultyRule } from './rules.js';
import { CARD_DRAW_CHOICES, GEAR_SLOTS, REWARD_CARD_CHOICES, REWARD_CARD_CHOICES_MAX, REWARD_SLOT_COUNT, REWARD_SLOT_MAX } from './schema.js';
import { hash32, hashString, nextRandom } from './random.js';
import { weakShare } from './points.js';
import { INSCRIPTION_KEYS, inscribable } from './mechanics/inscription.js';
import { FIXED_GENERAL_CARDS, fixedClassPool } from './fixed-cards/index.js';
import { drawRelic } from './relics/draw.js';
import { flipRewardBonus, heldOffCombat } from './relics/off-combat.js';
import { biasWeightOf, heldCounterTraits, pickBias, pickTraitFlip } from './trait-reward-bias.js';

const RARITY_ORDER = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'mythic']);
const rarityIndex = (rarity) => RARITY_ORDER.indexOf(rarity);
const atLeast = (rarity, floor) => rarityIndex(rarity) >= rarityIndex(floor);

// 各敌人档位的掉落规则。keepsake 是非保底槽位出纪念品的概率；guaranteed 是保底槽位数
// （这些槽位不出纪念品）；floor 是保底槽位的稀有度下限；cardCap 是卡牌稀有度上限。
// rarity/kinds 是 [值, 权重] 表；cardRate 是 3 槽盲翻一张的目标卡牌率，从杂物份额补足。
// inscribe（规则 v5 P5b 刻印）只在调用方开启 inscribe 时参与抽取，未开启时与旧表一致。
const TIER_LOOT = Object.freeze({
    normal: Object.freeze({ keepsake: 0.85, guaranteed: 0, cardCap: 'uncommon', cardRate: 0.3, rarity: Object.freeze([['common', 75], ['uncommon', 22], ['rare', 3]]), kinds: Object.freeze([['item', 4], ['card', 3], ['gear', 2], ['treasure', 1], ['inscribe', 1]]) }),
    elite: Object.freeze({ keepsake: 0.8, guaranteed: 1, cardRate: 0.4, rarity: Object.freeze([['uncommon', 40], ['rare', 40], ['epic', 20]]), kinds: Object.freeze([['card', 3], ['gear', 3], ['item', 2], ['treasure', 2], ['inscribe', 2]]) }),
    boss: Object.freeze({ keepsake: 0.8, guaranteed: 1, floor: 'epic', cardRate: 0.5, rarity: Object.freeze([['rare', 50], ['epic', 40], ['mythic', 10]]), keepsakeRarity: Object.freeze([['rare', 20], ['epic', 50], ['mythic', 30]]), kinds: Object.freeze([['card', 3], ['gear', 3], ['treasure', 3], ['item', 1], ['inscribe', 2]]) }),
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

// 刻印槽的候选：卡组里未刻印、目录里有定义的副本（角色视图的 deckEntries）。
function inscribeTargets(character) {
    const catalog = character?.catalog instanceof Map ? character.catalog : null;
    const seen = new Set();
    const out = [];
    for (const entry of Array.isArray(character?.deckEntries) ? character.deckEntries : []) {
        const card = catalog?.get(entry?.cardId);
        if (!card || !entry.copyId || entry.inscription || seen.has(entry.copyId)) continue;
        seen.add(entry.copyId);
        out.push({ cardId: entry.cardId, copyId: entry.copyId, card });
    }
    return out;
}

// 刻印槽定案：按槽位种子先在至少有一张可刻副本的刻印里等概率挑一种，再在可刻的副本里挑一张。没有可刻副本时返回 null（改出卡牌）。
function pickInscription(seed, targets) {
    const keys = INSCRIPTION_KEYS.filter((key) => targets.some((t) => inscribable(t.card, key)));
    if (!keys.length) return null;
    const random = randomFrom(seed);
    const inscription = keys[pickIndex(random, keys.length)];
    const fits = targets.filter((t) => inscribable(t.card, inscription));
    const target = fits[pickIndex(random, fits.length)];
    return { inscription, cardId: target.cardId, copyId: target.copyId, cardName: String(target.card.name || target.cardId) };
}

// 生成一组 count 个槽位。fortune 为真时随机一个非纪念品槽位升一档。
// targets 为刻印槽候选（开启刻印时才有）；刻印槽定不下目标时改为卡牌槽。
function buildSlots(seed, rule, kinds, count, fortune, loot = null, targets = null) {
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
        let mark = null;
        if (kind === 'inscribe') {
            mark = pickInscription(`${seed}|inscribe|${index}`, targets || []);
            if (!mark) kind = 'card';
        }
        // 宝物至少要稀有；卡牌受档位稀有度上限约束。
        if (kind === 'treasure' && !atLeast(rarity, 'rare')) kind = 'gear';
        if (kind === 'card' && rule.cardCap && rarityIndex(rarity) > rarityIndex(rule.cardCap)) rarity = rule.cardCap;
        const slot = { index, kind: kind === 'treasure' ? 'gear' : kind, rarity };
        if (mark) Object.assign(slot, mark);
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

// 规则 v6 G3d 弱敌战（D-24）：槽位数不变，每槽（含精英、首领的保底槽）按 WEAK_JUNK_CHANCE 出普通劣等杂物（junk）；
// 其余槽稀有度封顶普通（宝物降为普通装备），不做杂物转卡牌、难度升档与特性关联升档。独立种子域 `${seed}|weak`。
export const WEAK_JUNK_CHANCE = 0.95;
function buildWeakSlots(seed, kinds, count, targets = null) {
    const random = randomFrom(`${seed}|weak`);
    const slots = [];
    for (let index = 0; index < count; index += 1) {
        if (random() < WEAK_JUNK_CHANCE) {
            slots.push({ index, kind: 'keepsake', rarity: 'common', junk: true });
            continue;
        }
        let kind = pickWeighted(random, kinds);
        let mark = null;
        if (kind === 'inscribe') {
            mark = pickInscription(`${seed}|weak|inscribe|${index}`, targets || []);
            if (!mark) kind = 'card';
        }
        if (kind === 'treasure') kind = 'gear';
        const slot = { index, kind, rarity: 'common', ...(mark || {}) };
        if (kind === 'card') slot.cost = pickWeighted(random, CARD_COST_WEIGHTS);
        if (kind === 'gear') slot.gearSlot = PLAIN_GEAR_SLOTS[pickIndex(random, PLAIN_GEAR_SLOTS.length)];
        if (kind === 'item') slot.count = 1;
        slots.push(slot);
    }
    return slots;
}

// 规则 v6 卡牌槽的固定候选：从本职业固定池按槽位稀有度（史诗及以上按稀有）取 count 张不同的牌，
// 跳过已达同名上限与已选的牌，不够时逐档降低稀有度补足；floor 为最低稀有度（无色池没有普通，按罕见起算）。
const FIXED_TOP = rarityIndex('rare');
// 无色固定卡进战利品翻牌的比例：每个卡牌槽以此概率把一张固定候选换成无色牌（积分抽卡不出无色）。
export const REWARD_GENERAL_SHARE = 0.25;
// weightOf（可选，特质偏向）：牌 -> 权重；不传时与原来的均匀抽逐位一致（每抽仍只消耗一个随机数）。
function fixedCandidates(seed, rarity, pool, owned, count, taken = [], floor = 'common', weightOf = null) {
    const random = randomFrom(seed);
    const out = [];
    const top = Math.max(rarityIndex(floor), Math.min(rarityIndex(rarity), FIXED_TOP));
    for (let r = top; r >= 0 && out.length < count; r -= 1) {
        const left = pool.filter((card) => card.rarity === RARITY_ORDER[r] && !out.includes(card.id) && !taken.includes(card.id) && (owned.get(card.id) || 0) < cardCopyLimit(card.rarity));
        while (out.length < count && left.length) {
            let at;
            if (weightOf) {
                const weights = left.map(weightOf);
                let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
                at = weights.findIndex((weight) => (roll -= weight) < 0);
                if (at < 0) at = left.length - 1;
            } else at = pickIndex(random, left.length);
            out.push(left.splice(at, 1)[0].id);
        }
    }
    return out;
}

// 规则 v6：卡牌槽展开为 REWARD_CARD_CHOICES 张候选，本职业固定卡与随机卡 2:1，随机卡的位置由种子定；
// 每槽以 REWARD_GENERAL_SHARE 的概率把最后一张固定候选换成无色固定卡。
// 程序在槽位上记 fixedIds / randomAt / archetype，随机卡由副 LLM 按本职业模板命名。本职业固定池凑不齐时该槽照旧只出一张随机卡。
// heroTraits 为主角数值特质名单（可选）：命中偏向时本职业固定候选按牌类加权，applied 收集实际生效的 { trait, category }。
function withCardCandidates(slots, seed, pool, owned, archetype, general = [], bonus = {}, heroTraits = null, applied = null) {
    return slots.map((slot) => {
        if (slot.kind !== 'card') return slot;
        const marked = { ...slot, ...(bonus.inscribe > 0 ? { inscribe: bonus.inscribe } : {}), ...(bonus.upgradeNoDamage ? { upgradeNoDamage: true } : {}) };
        if (!pool.length) return marked;
        const count = Math.min(REWARD_CARD_CHOICES_MAX, REWARD_CARD_CHOICES + (bonus.choices || 0));
        const bias = heroTraits ? pickBias(heroTraits, pool) : null;
        const fixedIds = fixedCandidates(`${seed}|cand|${slot.index}`, slot.rarity, pool, owned, count - 1, [], 'common', bias ? biasWeightOf(bias.category) : null);
        if (bias && applied && fixedIds.length >= REWARD_CARD_CHOICES - 1) applied.push(bias);
        if (fixedIds.length < REWARD_CARD_CHOICES - 1) return marked;
        const size = fixedIds.length + 1;
        if (general.length && randomFrom(`${seed}|cand-general|${slot.index}`)() < REWARD_GENERAL_SHARE) {
            const [colorless] = fixedCandidates(`${seed}|cand-general-pick|${slot.index}`, slot.rarity, general, owned, 1, fixedIds, 'uncommon');
            if (colorless) fixedIds[fixedIds.length - 1] = colorless;
        }
        const randomAt = pickIndex(randomFrom(`${seed}|cand-at|${slot.index}`), size);
        return { ...marked, archetype, fixedIds, randomAt };
    });
}

// 规则 v6 宝物槽（G5f）：按槽位种子从遗物表抽一件宝物遗物，原版 / 拆解模型由 relic-model 种子域 1:1 定，记在槽位 relic；
// 已持有与同一次奖励里已抽到的不再出。候选用尽时槽位不带 relic，照旧由副 LLM 按被动模板起名。
export function ownedRelicIds(character) {
    const gear = character?.gear || {};
    const slotted = Object.values(gear.slots || {}).flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []));
    const traits = Array.isArray(character?.traits) ? character.traits : [];
    return [...slotted, ...(Array.isArray(gear.bag) ? gear.bag : []), ...traits].map((item) => item?.relic?.relicId).filter((id) => typeof id === 'string');
}
function withRelics(slots, seed, archetype, taken) {
    return slots.map((slot) => {
        if (slot.kind !== 'gear' || slot.gearSlot !== 'treasure') return slot;
        const got = drawRelic({ seed: `${seed}|relic|${slot.index}`, home: 'treasure', rarity: slot.rarity, archetype, owned: taken });
        if (!got) return slot;
        taken.push(got.relicId);
        return { ...slot, relic: { relicId: got.relicId, model: got.model } };
    });
}

// 规则 v6 积分抽卡（D-09 / D-15）：稀有度与费用的权重表；候选只取本职业，不混无色。
export const CARD_DRAW_RARITY = Object.freeze([['common', 60], ['uncommon', 32], ['rare', 8]]);
// 积分抽卡规划：以主角 ID 加已抽次数为种子，定稀有度、随机卡费用、本职业固定候选 2 张与随机卡位置。
// 本职业固定池凑不齐 2 张（未知职业或同名都已满）时返回 null，不能抽。
export function planCardDraw(character) {
    if (character?.kind !== 'deck-character' || !character.id) return null;
    const draws = Number.isInteger(character.cardDraws) ? character.cardDraws : 0;
    const seed = `card-draw|${character.id}|${draws}`;
    const pool = fixedClassPool(character.classProfile?.archetype);
    const owned = character.owned instanceof Map ? character.owned : new Map();
    const random = randomFrom(seed);
    const rarity = pickWeighted(random, CARD_DRAW_RARITY);
    const cost = pickWeighted(random, CARD_COST_WEIGHTS);
    const fixedIds = fixedCandidates(`${seed}|cand`, rarity, pool, owned, CARD_DRAW_CHOICES - 1);
    if (fixedIds.length < CARD_DRAW_CHOICES - 1) return null;
    const randomAt = pickIndex(randomFrom(`${seed}|cand-at`), CARD_DRAW_CHOICES);
    const mark = hashString(seed);
    return { seed, drawId: `cd-${mark}`, cardId: `dc-${mark}`, archetype: character.classProfile.archetype, rarity, cost, fixedIds, randomAt };
}

// 规划一场战斗的奖励。返回 { seed, tier, exp, links, slots, reserve }。
// inscribe 为真（规则 v5 胜利奖励）时卡组角色可出刻印槽；日常挑战等其他调用方不开启，槽位与旧规则一致。
// candidates 为真（规则 v6 胜利奖励）时卡组角色的卡牌槽展开为三选一（本职业固定卡、按比例混入无色固定卡、本职业随机卡，见 withCardCandidates）。
// weak 为真（规则 v6 G3d 弱敌战，只与 candidates 同开）时按 buildWeakSlots 出槽，经验按 1/4 向下取整。
// statTraits（可选）：{ hero: 主角数值特质名单, allies: 同场同伴的特质名单（只供福星）}，由宿主层读取后传入；不传时与旧规划逐位一致。
// 生效来源记在返回值：traitBias { trait, category }（B 类牌类偏向）、traitFlip { trait, effect: 'choices' | 'reveal' | 'reroll', noDamage? }（C 类）、
// traitHeld（需按胜场计数的 C 类特质，账本据此累计 flipWins 的 trait:<特质名>）。
export function planRewardSlots({ combatId, randomKey, tier, enemyTiers = [], character = null, links, difficulty, inscribe = false, candidates = false, weak = false, statTraits = null } = {}) {
    const tierKey = Object.hasOwn(TIER_LOOT, tier) ? tier : 'normal';
    const rule = TIER_LOOT[tierKey];
    let normalLinks = normalizeLinks(links);
    const seed = `reward|${randomKey ?? combatId ?? ''}|${character?.id ?? ''}`;
    const deck = character?.kind === 'deck-character';
    // 只有牌组角色才掉卡牌与刻印；刻印另需调用方开启。
    const kinds = rule.kinds.filter(([kind]) => (kind === 'inscribe' ? deck && inscribe === true : kind !== 'card' || deck));
    const targets = deck && inscribe === true ? inscribeTargets(character) : null;
    // 「再翻」关联多给一个槽位。
    const flipRelics = deck && candidates === true ? heldOffCombat(character?.traits, 'flip') : [];
    const bonus = flipRewardBonus(flipRelics, { tier: tierKey, wins: character?.flipWins, weak });
    // 特质翻牌便利（C 类）：多一个可选项并进 bonus.choices（封顶 1，遗物已给时不叠加），透视 +1 封顶 2，免费重抽只记来源。
    const traitFlip = deck && candidates === true && statTraits ? pickTraitFlip(statTraits, { tier: tierKey, weak: weak === true, wins: character?.flipWins, reveal: normalLinks.reveal, relicChoices: bonus.choices }) : null;
    if (traitFlip?.effect === 'choices') bonus.choices = 1;
    if (traitFlip?.effect === 'reveal') normalLinks = { ...normalLinks, reveal: Math.min(2, normalLinks.reveal + 1) };
    const traitHeld = deck && candidates === true && statTraits ? heldCounterTraits(statTraits) : [];
    const heroTraits = deck && candidates === true && weak !== true && Array.isArray(statTraits?.hero) && statTraits.hero.length ? statTraits.hero : null;
    const biasApplied = [];
    const baseCount = REWARD_SLOT_COUNT + (normalLinks.reflip ? 1 : 0);
    const count = Math.min(REWARD_SLOT_MAX, baseCount + bonus.extra);
    const lootChance = difficultyRule(difficulty).loot;
    const lootFor = (key) => (lootChance > 0 ? { chance: lootChance, seed: `${key}|loot` } : null);
    const archetype = character?.classProfile?.archetype;
    const pool = deck && candidates === true ? fixedClassPool(archetype) : [];
    const general = pool.length ? FIXED_GENERAL_CARDS : [];
    const owned = character?.owned instanceof Map ? character.owned : new Map();
    // 宝物遗物只在规则 v6 卡组角色出（与三选一同一开关），旧战斗与重放的槽位形状不变。
    const taken = deck && candidates === true ? ownedRelicIds(character) : null;
    const relics = (list, key) => (taken ? withRelics(list, key, archetype, taken) : list);
    const weakOn = weak === true && candidates === true;
    const base = (key) => {
        const list = weakOn ? buildWeakSlots(key, kinds, count, targets) : buildSlots(key, rule, kinds, baseCount, normalLinks.fortune, lootFor(key), targets);
        if (!weakOn && bonus.extra) {
            const random = randomFrom(`${key}|extra-card`);
            const rarity = bonus.rarity || pickWeighted(random, rule.rarity);
            const slot = { index: REWARD_SLOT_MAX - 1, kind: 'card', rarity: rule.cardCap && rarityIndex(rarity) > rarityIndex(rule.cardCap) ? rule.cardCap : rarity, cost: pickWeighted(random, CARD_COST_WEIGHTS) };
            if (list.length < REWARD_SLOT_MAX) list.push(slot);
            else list[REWARD_SLOT_MAX - 1] = slot;
        }
        return list;
    };
    const slots = relics(withCardCandidates(base(seed), seed, pool, owned, archetype, general, bonus, heroTraits, biasApplied), seed);
    const reserveSeed = `${seed}|reserve`;
    const reserve = relics(withCardCandidates(base(reserveSeed), reserveSeed, pool, owned, archetype, general, bonus, heroTraits), reserveSeed);
    const exp = weakOn ? weakShare(victoryExpFor(enemyTiers)) : victoryExpFor(enemyTiers);
    return { seed, tier: tierKey, exp, links: normalLinks, slots, reserve, ...(flipRelics.length ? { flipRelics } : {}), ...(weakOn ? { weak: true } : {}),
        ...(biasApplied.length ? { traitBias: { trait: biasApplied[0].trait, category: biasApplied[0].category } } : {}), ...(traitFlip ? { traitFlip } : {}), ...(traitHeld.length ? { traitHeld } : {}) };
}
