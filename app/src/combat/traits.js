// 角色特性：槽位与解锁费用、天生特性保留、特性替换、稀有度抽取、关联（透视/再翻/天运）。纯函数。
import { hash32, nextRandom } from './random.js';

export const TRAIT_RARITY_WEIGHTS = Object.freeze({ common: 50, uncommon: 30, rare: 14, epic: 5, mythic: 1 });
export const TRAIT_RARITIES = Object.freeze(Object.keys(TRAIT_RARITY_WEIGHTS));
export const TRAIT_LINKS = Object.freeze(['reveal', 'reflip', 'fortune']);
export const TRAIT_LINK_LABELS = Object.freeze({ reveal: '透视', reflip: '再翻', fortune: '天运' });
export const TRAIT_KINDS = Object.freeze(['active', 'passive']);
export const TRAIT_SKILL_COSTS = Object.freeze([1, 2]);
export const TRAIT_BASE_SLOTS = 2;
export const TRAIT_SLOT_MAX = 5;
// 解锁第 N 个槽位的点数费用。
export const TRAIT_SLOT_COSTS = Object.freeze({ 3: 500, 4: 1000, 5: 2000 });
// 主动特性数量上限（含天生主动技能）。
export const TRAIT_ACTIVE_MAX = 2;
export const INNATE_TRAIT_KINDS = Object.freeze(['active', 'passive']);

// 天生特性 id：主动是英雄技能（缺省 `<角色id>-h0`），被动是个人被动（可为 null）。
export function innateTraitIds(profile, id) {
    return { active: profile?.heroSkill?.id || `${id ?? ''}-h0`, passive: profile?.personalPassive?.id || null };
}

const traitsOf = (character) => (Array.isArray(character?.traits) ? character.traits : []);
const isActive = (trait) => trait?.kind === 'active';

// 当前槽位数：基础 2 + 已解锁，封顶 5。
export function traitSlots(character) {
    return TRAIT_BASE_SLOTS + Math.max(0, Math.min(TRAIT_SLOT_MAX - TRAIT_BASE_SLOTS, Number.isInteger(character?.slotUnlocks) ? character.slotUnlocks : 0));
}

// 下一个可解锁的槽位及费用；已满返回 null。
export function nextTraitSlot(character) {
    const slot = traitSlots(character) + 1;
    return TRAIT_SLOT_COSTS[slot] ? { slot, cost: TRAIT_SLOT_COSTS[slot] } : null;
}

// 仍占槽位的天生特性种类：未被丢弃、槽位有余，且主动数量未超上限。
export function keptInnateKinds(character) {
    const dropped = Array.isArray(character?.innateDropped) ? character.innateDropped : [];
    const traits = traitsOf(character);
    let freeSlots = traitSlots(character) - traits.length;
    const kept = [];
    if (!dropped.includes('active') && freeSlots > 0 && traits.filter(isActive).length < TRAIT_ACTIVE_MAX) {
        kept.push('active');
        freeSlots -= 1;
    }
    if (!dropped.includes('passive') && character?.profile?.personalPassive && freeSlots > 0) kept.push('passive');
    return kept;
}

// 已占用槽位数（保留的天生特性 + 习得特性）。
export const traitCount = (character) => keptInnateKinds(character).length + traitsOf(character).length;
// 主动特性数（含保留的天生主动）。
export const activeTraitCount = (character) => (keptInnateKinds(character).includes('active') ? 1 : 0) + traitsOf(character).filter(isActive).length;
// 能否再放入一个该种类的特性。
export const traitFits = (character, kind) => traitCount(character) < traitSlots(character) && (kind !== 'active' || activeTraitCount(character) < TRAIT_ACTIVE_MAX);

// 用 newTrait 替换 targetId 对应的特性（已习得的，或天生的）。找不到返回 null。
// blocked 为真表示替换会挤掉别的天生特性、或让主动数超上限。
export function traitSwap(character, newTrait, targetId) {
    const keptBefore = keptInnateKinds(character);
    const innateIds = innateTraitIds(character?.profile, character?.id);
    const traits = traitsOf(character);
    const learnedIndex = traits.findIndex((trait) => trait.traitId === targetId);
    const innateKind = learnedIndex < 0 ? keptBefore.find((kind) => innateIds[kind] === targetId) : undefined;
    if (learnedIndex < 0 && !innateKind) return null;
    const replacedWasActive = learnedIndex >= 0 ? isActive(traits[learnedIndex]) : innateKind === 'active';
    const dropped = Array.isArray(character?.innateDropped) ? character.innateDropped : [];
    const next = {
        profile: character?.profile,
        slotUnlocks: character?.slotUnlocks,
        traits: learnedIndex >= 0 ? traits.map((trait, i) => (i === learnedIndex ? newTrait : trait)) : [...traits, newTrait],
        innateDropped: innateKind ? [...dropped, innateKind] : dropped,
    };
    const keptAfter = keptInnateKinds(next);
    const blocked = (isActive(newTrait) && !replacedWasActive) || keptBefore.some((kind) => kind !== innateKind && !keptAfter.includes(kind)) || activeTraitCount(next) > TRAIT_ACTIVE_MAX;
    return { traits: next.traits, innateDropped: next.innateDropped, blocked };
}

// 特性随机种子：`<标识>|<序号>`，序号非整数按 0。
export const traitSeed = (id, index) => `${id ?? ''}|${Number.isInteger(index) ? index : 0}`;

// 按权重抽稀有度（同种子恒定）。
export function planTrait(seed = '') {
    let roll = nextRandom(hash32(`trait:${seed}`)).value * Object.values(TRAIT_RARITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    for (const [rarity, weight] of Object.entries(TRAIT_RARITY_WEIGHTS)) {
        if (roll < weight) return { rarity };
        roll -= weight;
    }
    return { rarity: TRAIT_RARITIES.at(-1) };
}

// 新抽特性附带翻牌联动的概率（规则 v5 D9）：稀有 10%、史诗 20%、神话 35%，三种联动等概率；其余稀有度不附。
export const TRAIT_LINK_CHANCE = Object.freeze({ rare: 0.1, epic: 0.2, mythic: 0.35 });

// 按种子抽定新特性的联动（与稀有度、形状用不同的种子域，互不影响）；不附时返回 null。
export function planTraitLink(seed = '', rarity) {
    const chance = TRAIT_LINK_CHANCE[rarity] || 0;
    if (chance <= 0) return null;
    const first = nextRandom(hash32(`trait-link:${seed}`));
    if (first.value >= chance) return null;
    const second = nextRandom(first.state);
    return TRAIT_LINKS[Math.min(TRAIT_LINKS.length - 1, Math.floor(second.value * TRAIT_LINKS.length))];
}

// 参与翻牌联动的装备部位（饰品、宝物）。
export const LINK_GEAR_SLOTS = Object.freeze(['accessory', 'treasure']);

// 汇总特性与已装备饰品、宝物的关联：reveal 取最高档（神话 2，其余 1），reflip/fortune 为布尔。
// gearSlots 是角色视图的 gear.slots（部位 → 装备对象），缺省时只看特性。
export function traitLinks(traits, gearSlots) {
    const links = { reveal: 0, reflip: false, fortune: false };
    const gear = gearSlots && typeof gearSlots === 'object' ? LINK_GEAR_SLOTS.map((slot) => gearSlots[slot]).filter(Boolean) : [];
    for (const source of [...(Array.isArray(traits) ? traits : []), ...gear]) {
        if (source?.link === 'reveal') links.reveal = Math.max(links.reveal, source.rarity === 'mythic' ? 2 : 1);
        else if (source?.link === 'reflip') links.reflip = true;
        else if (source?.link === 'fortune') links.fortune = true;
    }
    return links;
}

// 习得特性携带的被动列表。
export const traitPassives = (character) => traitsOf(character).map((trait) => trait?.passive).filter(Boolean);
