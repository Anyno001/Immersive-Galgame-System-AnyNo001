import { COMBAT_RULES, combatSpeedFor } from './rules.js';
import { REL_TIERS } from './abilities.js';

// 生命与速度换算（开战、人物状态、数值系统共用）。纯函数，不读宿主、不改档案。
const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));

// 没有战斗档案的主角按默认职业原型（战士）的生命基数：原型生命区间的中值（合并计划 N2：70–90 → 80）。
export const HERO_BASE_ARCHETYPE = 'warrior';
export const HERO_BASE_HP = (() => {
    const [lo, hi] = COMBAT_RULES.archetypes[HERO_BASE_ARCHETYPE].hp;
    return Math.round((lo + hi) / 2);
})();

export function allyTierOf(profile) {
    const key = Object.hasOwn(COMBAT_RULES.allyTiers, profile?.tier) ? profile.tier : COMBAT_RULES.defaultAllyTier;
    return { key, ...COMBAT_RULES.allyTiers[key] };
}

export function skillTierFor(view) {
    const relAlly = view.attributes?.relTagged ? REL_TIERS[view.attributes.tier]?.ally : null;
    return relAlly && COMBAT_RULES.allyTiers[relAlly] ? { key: relAlly, ...COMBAT_RULES.allyTiers[relAlly] } : allyTierOf(view.profile);
}

// 六维开战换算：生命 + 体质调整值 × 等级（不低于原生命一半），速度 + 敏捷调整值 × 2（夹 40–200）。没有属性视图时原样返回。
export function applyAbilities(hp, speed, attr) {
    if (!attr?.mods) return { hp, speed };
    const level = Math.max(1, Number(attr.level) || 1);
    return {
        hp: clampInt(Math.max(Math.ceil(hp / 2), hp + attr.mods.con * level), 1, 9999),
        speed: clampInt(speed + attr.mods.dex * 2, 40, 200),
    };
}

// 人物状态与开战共享生命、速度换算。
export function characterCombatStats(view) {
    const deck = view.kind === 'deck-character';
    const tier = deck ? null : skillTierFor(view);
    const baseHp = deck ? view.hpMax : tier.hp === 1 ? view.profile.base.hp : clampInt(view.profile.base.hp * tier.hp, 1, 999);
    const speed = view.profile.base.speed ?? combatSpeedFor({ ...(deck && { archetype: view.classProfile?.archetype }), id: view.id });
    return applyAbilities(baseHp, speed, view.attributes);
}

// 没有战斗档案的主角：战士原型生命基数，按六维与等级换算。
export function heroBaseStats(attributes, id = 'hero') {
    return applyAbilities(HERO_BASE_HP, combatSpeedFor({ archetype: HERO_BASE_ARCHETYPE, id }), attributes);
}

// 人物状态显示的当前生命：上限减去最近记录的损失（至少 1）；倒下为 0。没有伤势时为满血。
export function vitalsOf(maxHp, wound) {
    if (!wound) return { hp: maxHp, maxHp, down: false };
    if (wound.down) return { hp: 0, maxHp, down: true };
    return { hp: Math.min(maxHp, Math.max(1, maxHp - Math.max(0, wound.maxHp - wound.hp))), maxHp, down: false };
}
