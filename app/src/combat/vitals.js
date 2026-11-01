// 战斗生命与速度：同伴档位、能力修正后的生命/速度、主角基础值、跨战斗的生命快照。纯函数。
import { COMBAT_RULES, combatSpeedFor } from './rules.js';
import { REL_TIERS } from './abilities.js';

const clampRound = (value, min, max) => Math.min(max, Math.max(min, Math.round(value)));

export const HERO_BASE_ARCHETYPE = 'warrior';
// 主角基础生命：战士生命区间的中点。
export const HERO_BASE_HP = (() => {
    const [low, high] = COMBAT_RULES.archetypes[HERO_BASE_ARCHETYPE].hp;
    return Math.round((low + high) / 2);
})();

// 角色档案里的同伴档位；档位名非法时回落默认档。
export function allyTierOf(profile) {
    const key = Object.hasOwn(COMBAT_RULES.allyTiers, profile?.tier) ? profile.tier : COMBAT_RULES.defaultAllyTier;
    return { key, ...COMBAT_RULES.allyTiers[key] };
}

// 技能档位：带关系标记的属性优先按关系档取同伴档，否则按角色档案。
export function skillTierFor(character) {
    const relAlly = character.attributes?.relTagged ? REL_TIERS[character.attributes.tier]?.ally : null;
    return relAlly && COMBAT_RULES.allyTiers[relAlly]
        ? { key: relAlly, ...COMBAT_RULES.allyTiers[relAlly] }
        : allyTierOf(character.profile);
}

// 能力修正：体质按等级加生命（至少剩一半），敏捷加速度。没有 mods 原样返回。
export function applyAbilities(hp, speed, attributes) {
    if (!attributes?.mods) return { hp, speed };
    const level = Math.max(1, Number(attributes.level) || 1);
    return {
        hp: clampRound(Math.max(Math.ceil(hp / 2), hp + attributes.mods.con * level), 1, 9999),
        speed: clampRound(speed + attributes.mods.dex * 2, 40, 200),
    };
}

// 角色的战斗生命与速度。牌组角色用 hpMax；其余按同伴档位的生命倍率缩放。
export function characterCombatStats(character) {
    const isDeckCharacter = character.kind === 'deck-character';
    const tier = isDeckCharacter ? null : skillTierFor(character);
    const hp = isDeckCharacter ? character.hpMax : tier.hp === 1 ? character.profile.base.hp : clampRound(character.profile.base.hp * tier.hp, 1, 999);
    const speed = character.profile.base.speed ?? combatSpeedFor({ ...(isDeckCharacter && { archetype: character.classProfile?.archetype }), id: character.id });
    return applyAbilities(hp, speed, character.attributes);
}

// 主角基础生命与速度（战士模板 + 能力修正）。
export function heroBaseStats(attributes, id = 'hero') {
    return applyAbilities(HERO_BASE_HP, combatSpeedFor({ archetype: HERO_BASE_ARCHETYPE, id }), attributes);
}

// 带入新战斗的生命快照：无快照满血；倒下则 0 血；否则保留已损失的生命（至少剩 1）。
export function vitalsOf(maxHp, saved) {
    if (!saved) return { hp: maxHp, maxHp, down: false };
    if (saved.down) return { hp: 0, maxHp, down: true };
    return { hp: Math.min(maxHp, Math.max(1, maxHp - Math.max(0, saved.maxHp - saved.hp))), maxHp, down: false };
}
