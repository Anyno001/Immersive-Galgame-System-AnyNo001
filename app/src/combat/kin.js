// 随从表的共用边界与引用遍历；不依赖档案、模板目录或引擎。
import { opHandler } from './mechanics/registry.js';

export const KIN_LIMIT = 6;
export const DEATH_SPAWN_LIMIT = 4;
export const KIN_FIELDS = Object.freeze(['kin', 'kinScale', 'deathSpawns']);
export const KIN_DEF_FIELDS = Object.freeze(['name', 'maxHp', 'skills', 'passives', 'phases', 'script', 'art', 'minion', 'speed', 'deathSpawns']);
export const validKinKey = (key) => typeof key === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(key)
    && !['__proto__', 'prototype', 'constructor'].includes(key);

// 初始同场与运行时生成共用装配；数值已由来源换算，伤害只继承主人最终倍率。
export function kinUnitDefinition(owner, key, hp) {
    const def = owner.kin[key];
    const maxHp = Math.max(1, Math.min(9999, Math.round(hp ?? def.maxHp * (owner.kinScale ?? 1))));
    return {
        name: typeof def.name === 'string' && def.name ? def.name : key, maxHp, hp: maxHp,
        speed: def.speed ?? owner.speed, damageScale: owner.damageScale, skills: def.skills, passives: def.passives || [],
        ...(def.phases ? { phases: def.phases } : {}), ...(def.script ? { script: def.script } : {}),
        ...(def.art ? { art: def.art } : owner.art ? { art: owner.art } : {}),
        ...(def.deathSpawns ? { deathSpawns: def.deathSpawns } : {}),
        kin: owner.kin, ...(owner.kinScale !== undefined ? { kinScale: owner.kinScale } : {}),
    };
}

export function effectKinRefs(effects) {
    return (Array.isArray(effects) ? effects : []).flatMap((effect) => [
        ...(opHandler(effect?.op)?.refs?.(effect) || []),
        ...['then', 'a', 'b'].flatMap((key) => effectKinRefs(effect?.[key])),
    ]);
}

const list = (value) => Array.isArray(value) ? value : [];
export const kitEffects = (def) => [
    ...list(def?.skills), ...list(def?.passives),
    ...list(def?.phases).flatMap((phase) => [...list(phase?.addSkills), ...list(phase?.passives)]),
].flatMap((item) => Array.isArray(item?.effects) ? item.effects : []);

export const kitKinRefs = (def) => [...list(def?.deathSpawns), ...effectKinRefs(kitEffects(def))];

export function renameKinEffects(effects, rename) {
    return (effects || []).map((effect) => {
        const next = { ...effect };
        if (opHandler(effect.op)?.refs && Array.isArray(effect.kin)) next.kin = effect.kin.map(rename);
        for (const key of ['then', 'a', 'b']) if (Array.isArray(effect[key])) next[key] = renameKinEffects(effect[key], rename);
        return next;
    });
}
