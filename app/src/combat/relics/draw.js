// 规则 v6 遗物抽取（G5f）：遗物条目与原版 / 拆解模型都由程序按种子决定，副 LLM 不参与概率。
// 模型用独立的 relic-model 种子域，原版:拆解 = 1:1；条目用 relic-pick 种子域，按归属、稀有度、职业池筛选后等概率抽取。
import { hash32, nextRandom } from '../random.js';
import { RELICS, relicById, relicPassive } from './index.js';
import { normalizePassive } from '../schema.js';

// 奖励槽稀有度 → 可出的遗物稀有度（宝物槽至少稀有，见 rewards.js buildSlots）。
export const RELIC_TIERS_BY_RARITY = Object.freeze({
    rare: Object.freeze(['common']),
    epic: Object.freeze(['uncommon', 'shop']),
    mythic: Object.freeze(['rare']),
});

function randomFrom(seed) {
    let state = hash32(seed);
    return () => {
        const next = nextRandom(state);
        state = next.state;
        return next.value;
    };
}

// 同一种子恒定给出同一模型；不同种子原版与拆解各占一半。
export const relicModelFor = (seed) => (randomFrom(`relic-model|${seed ?? ''}`)() < 0.5 ? 'original' : 'split');

// 候选：归属（trait / treasure）、遗物稀有度列表、职业池（通用 + 本职业），排除已持有的条目。
export function relicCandidates({ home, tiers, archetype, owned = [] } = {}) {
    const skip = new Set(owned);
    return RELICS.filter((item) => (!home || item.home === home)
        && (!tiers || tiers.includes(item.tier))
        && (item.pool === 'any' || item.pool === archetype)
        && !skip.has(item.id));
}

// 抽一件遗物并定模型。返回 { relicId, model, name, tier, home, passive | offCombat }；没有候选时返回 null。
export function drawRelic({ seed, home, rarity, tiers, archetype, owned } = {}) {
    const pool = relicCandidates({ home, tiers: tiers || RELIC_TIERS_BY_RARITY[rarity], archetype, owned });
    if (!pool.length) return null;
    const item = pool[Math.min(pool.length - 1, Math.floor(randomFrom(`relic-pick|${seed ?? ''}`)() * pool.length))];
    return resolveRelic(item.id, relicModelFor(seed));
}

// 人物特性抽取里遗物所占的份额（程序按独立种子域 relic-trait 决定，副 LLM 不参与）。
export const RELIC_TRAIT_SHARE = 0.5;
// 特性稀有度 → 可出的遗物稀有度。
export const TRAIT_RELIC_TIERS = Object.freeze({
    common: Object.freeze(['common']),
    uncommon: Object.freeze(['uncommon', 'shop']),
    rare: Object.freeze(['rare']),
    epic: Object.freeze(['rare']),
    mythic: Object.freeze(['rare']),
});

// 人物特性抽取（规则 v6）：按种子决定这次是否出遗物特性；出时从特性归属的遗物里抽一件并定模型，否则返回 null（照旧走特性池）。
// 模型为战斗外用途时照样出：特性只记遗物引用，不带战斗被动，效果由程序在战斗外结算（G5f-4），原版:拆解保持 1:1。
export function planTraitRelic({ seed, rarity, archetype, owned } = {}) {
    if (!TRAIT_RELIC_TIERS[rarity]) return null;
    if (randomFrom(`relic-trait|${seed ?? ''}`)() >= RELIC_TRAIT_SHARE) return null;
    return drawRelic({ seed: `trait|${seed ?? ''}`, home: 'trait', tiers: TRAIT_RELIC_TIERS[rarity], archetype, owned });
}

// 按已记下的条目 ID 与模型还原内容（重放时用，不再抽取）。条目或模型无效时返回 null。
export function resolveRelic(relicId, model) {
    const item = relicById(relicId);
    if (!item || (model !== 'original' && model !== 'split')) return null;
    const base = { relicId: item.id, model, name: item.name, tier: item.tier, home: item.home };
    const passive = relicPassive(item, model);
    if (passive) return { ...base, passive };
    const { text, ...rest } = item[model];
    return { ...base, offCombat: JSON.parse(JSON.stringify(rest)), description: text };
}

// 遗物引用的效果说明（战斗内为被动描述，战斗外为用途描述）；引用无效时返回空串。
export function relicText(ref) {
    const relic = resolveRelic(ref?.relicId, ref?.model);
    return relic ? relic.passive?.description || relic.description || '' : '';
}

// 装备 / 特性的被动是否就是其遗物引用还原出的原样被动（程序定的数值，不受副 LLM 模板的伤害上限约束）。
// 引用无效、模型为战斗外、或触发器 / 过滤字段 / 效果被改动过时返回 false，调用方照常按上限校验。id、name、description 不参与比较。
// 两侧都先过 normalizePassive（补默认字段，如效果的 target），账本规范化前后比对结果一致。
const passiveCore = (passive) => {
    const normalized = normalizePassive(passive);
    if (!normalized.ok) return null;
    const { id: _id, name: _name, description: _description, ...rest } = normalized.value;
    return JSON.stringify(Object.keys(rest).sort().map((key) => [key, rest[key]]));
};
export function isRelicPassive(holder) {
    const ref = holder?.relic;
    if (!ref || !holder.passive) return false;
    const relic = resolveRelic(ref.relicId, ref.model);
    if (!relic?.passive) return false;
    const expected = passiveCore(relic.passive);
    return expected !== null && expected === passiveCore(holder.passive);
}
