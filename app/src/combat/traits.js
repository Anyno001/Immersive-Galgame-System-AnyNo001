import { hash32, nextRandom } from './random.js';

// 人物特性（P-d，助手反馈 3）：只主角、只能花积分抽（TRAIT_DRAW_COST，points.js），装不下时新特性待定，替换一个或放弃（都永久消失）。
// 稀有度按 TRAIT_RARITY_WEIGHTS 抽，种子为主角 ID 与已生效的抽取次数（traitSeed）：楼层回退后再抽得到同一稀有度，不能靠回退刷稀有度。
// 特性可带一种翻牌联动（透视 reveal / 再翻 reflip / 天运 fortune），由日志载荷的 link 给定；抽取时附带联动的比例待助手确认，确认前抽到的特性不带联动。
// 纯常量与纯函数，不读写存储；名称、来历与被动模板由副 LLM 按剧情生成，程序组装（generation.js 的 trait 实体）。
export const TRAIT_RARITY_WEIGHTS = Object.freeze({ common: 50, uncommon: 30, rare: 14, epic: 5, mythic: 1 });
export const TRAIT_RARITIES = Object.freeze(Object.keys(TRAIT_RARITY_WEIGHTS));
export const TRAIT_LINKS = Object.freeze(['reveal', 'reflip', 'fortune']);
export const TRAIT_LINK_LABELS = Object.freeze({ reveal: '透视', reflip: '再翻', fortune: '天运' });
// v4（助手 10-28）：人物技能并入人物特性，特性分主动 / 被动；抽到的主动特性费用为 1 或 2（按模板与稀有度求解），每回合限用一次。
export const TRAIT_KINDS = Object.freeze(['active', 'passive']);
export const TRAIT_SKILL_COSTS = Object.freeze([1, 2]);
// v4 特性槽（助手 10-28）：基础 TRAIT_BASE_SLOTS 槽，花积分按顺序永久解锁第 3 / 4 / 5 槽（TRAIT_SLOT_COSTS，日志表 trait-slot 条目），最多 TRAIT_SLOT_MAX 槽；
// 主动特性（含固有人物技能）最多 TRAIT_ACTIVE_MAX 个。固有人物技能（主动）与个人被动（被动）也占槽。
// 抽到的特性优先：固有特性只补剩下的空位（主动优先，且主动不超上限），补不进的暂停，解锁新槽或腾出位置后自动回来；
// 被玩家替换掉的固有特性按种类记入 innateDropped，永久不再出现。
// 新抽到的特性（账本条目带 kind）装得下（有空槽且主动不超上限）时直接装上，否则待定：替换一个特性（替换后其他保留着的固有特性不能被挤掉，主动不超上限）或放弃。
// 旧账本里抽到的特性（条目没有 kind）照旧按「抽到的满 TRAIT_BASE_SLOTS 个才待定」入账，不受固有特性影响。
export const TRAIT_BASE_SLOTS = 2;
export const TRAIT_SLOT_MAX = 5;
export const TRAIT_SLOT_COSTS = Object.freeze({ 3: 500, 4: 1000, 5: 2000 });
export const TRAIT_ACTIVE_MAX = 2;
export const INNATE_TRAIT_KINDS = Object.freeze(['active', 'passive']);
// 固有特性的 ID：人物技能（旧档案没有时为按职业原型回落的默认技能 `<角色>-h0`）与个人被动（没有时为 null）。
export function innateTraitIds(profile, ownerId) {
    return { active: profile?.heroSkill?.id || `${ownerId ?? ''}-h0`, passive: profile?.personalPassive?.id || null };
}
const drawnOf = (view) => (Array.isArray(view?.traits) ? view.traits : []);
const isActive = (t) => t?.kind === 'active';
// 当前槽数（基础 + 已解锁）；view.slotUnlocks 为已解锁的额外槽数，旧账本没有时为 0。
export const traitSlots = (view) => TRAIT_BASE_SLOTS
    + Math.max(0, Math.min(TRAIT_SLOT_MAX - TRAIT_BASE_SLOTS, Number.isInteger(view?.slotUnlocks) ? view.slotUnlocks : 0));
// 下一个可解锁的槽 { slot, cost }；已到上限为 null。
export function nextTraitSlot(view) {
    const slot = traitSlots(view) + 1;
    return TRAIT_SLOT_COSTS[slot] ? { slot, cost: TRAIT_SLOT_COSTS[slot] } : null;
}
// 还保留着（未暂停、未被替换）的固有特性种类，按 active、passive 的顺序补抽到的特性剩下的空位；
// view 为账本角色状态或视图（profile、traits、innateDropped、slotUnlocks）。
export function keptInnateKinds(view) {
    const dropped = Array.isArray(view?.innateDropped) ? view.innateDropped : [];
    const drawn = drawnOf(view);
    let room = traitSlots(view) - drawn.length;
    const out = [];
    if (!dropped.includes('active') && room > 0 && drawn.filter(isActive).length < TRAIT_ACTIVE_MAX) {
        out.push('active');
        room -= 1;
    }
    if (!dropped.includes('passive') && view?.profile?.personalPassive && room > 0) out.push('passive');
    return out;
}
// 特性合计（保留着的固有 + 抽到的）与其中的主动特性数。
export const traitCount = (view) => keptInnateKinds(view).length + drawnOf(view).length;
export const activeTraitCount = (view) => (keptInnateKinds(view).includes('active') ? 1 : 0) + drawnOf(view).filter(isActive).length;
// 新特性装得下：有空槽，且主动特性未到上限。
export const traitFits = (view, kind) => traitCount(view) < traitSlots(view) && (kind !== 'active' || activeTraitCount(view) < TRAIT_ACTIVE_MAX);
// 用待定特性 pending 替换 drop（抽到的特性 ID 或保留着的固有特性 ID）后的特性状态 { traits, innateDropped, blocked }；drop 不认识时为 null。
// 待定的主动只能替换一个主动（抽到的主动或固有人物技能），待定的被动可替换任意一个；替换会让其他保留着的固有特性暂停、
// 或主动特性超过 TRAIT_ACTIVE_MAX 时 blocked 为真。账本归并（trait-pick）与构筑面板共用。
export function traitSwap(view, pending, drop) {
    const kept = keptInnateKinds(view);
    const ids = innateTraitIds(view?.profile, view?.id);
    const drawn = drawnOf(view);
    const at = drawn.findIndex((t) => t.traitId === drop);
    const innate = at < 0 ? kept.find((k) => ids[k] === drop) : undefined;
    if (at < 0 && !innate) return null;
    const dropActive = at >= 0 ? isActive(drawn[at]) : innate === 'active';
    const dropped = Array.isArray(view?.innateDropped) ? view.innateDropped : [];
    const next = {
        profile: view?.profile, slotUnlocks: view?.slotUnlocks,
        traits: at >= 0 ? drawn.map((t, i) => (i === at ? pending : t)) : [...drawn, pending],
        innateDropped: innate ? [...dropped, innate] : dropped,
    };
    const after = keptInnateKinds(next);
    const blocked = (isActive(pending) && !dropActive) || kept.some((k) => k !== innate && !after.includes(k)) || activeTraitCount(next) > TRAIT_ACTIVE_MAX;
    return { traits: next.traits, innateDropped: next.innateDropped, blocked };
}

export const traitSeed = (heroId, draws) => `${heroId ?? ''}|${Number.isInteger(draws) ? draws : 0}`;

// 按种子确定性抽稀有度：同一种子结果相同。
export function planTrait(seed = '') {
    let x = nextRandom(hash32(`trait:${seed}`)).value * Object.values(TRAIT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
    for (const [rarity, w] of Object.entries(TRAIT_RARITY_WEIGHTS)) {
        if (x < w) return { rarity };
        x -= w;
    }
    return { rarity: TRAIT_RARITIES.at(-1) };
}

// 翻牌联动汇总（准备阶段按当时装着的特性，开战后换特性不影响本场）：透视取最大（神话特性亮 2 张），再翻与天运任一即生效；每场每种最多一次。
export function traitLinks(traits) {
    const out = { reveal: 0, reflip: false, fortune: false };
    for (const t of Array.isArray(traits) ? traits : []) {
        if (t?.link === 'reveal') out.reveal = Math.max(out.reveal, t.rarity === 'mythic' ? 2 : 1);
        else if (t?.link === 'reflip') out.reflip = true;
        else if (t?.link === 'fortune') out.fortune = true;
    }
    return out;
}

// 装着的特性的战斗被动，随角色进入 setup；待定（尚未决定替换或放弃）的特性不生效。
export const traitPassives = (view) => (Array.isArray(view?.traits) ? view.traits : []).map((t) => t?.passive).filter(Boolean);
