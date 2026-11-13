// 敌人条目编写工具：原始数值与原版模型只存数据，换算、缝合和抽取由独立入口负责。
export { atk, aoe, ap, blk, heal, op, rnd, st, when } from '../fixed-cards/dsl.js';

export const ENEMY_STATUSES = Object.freeze(['release', 'pending', 'beta', 'deprecated']);
export const freezeEnemyData = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeEnemyData(child);
        Object.freeze(value);
    }
    return value;
};

export const skill = (id, name, intent, effects, fields = {}) => ({ id, name, intent, effects, ...fields });
export const passive = (id, name, trigger, effects, fields = {}) => ({ id, name, trigger, effects, ...fields });
export const opener = (id) => ({ opener: id });
export const cycle = (ids, loopFrom = 0) => ({ cycle: [...ids], loopFrom });
export const phase = (trigger, fields = {}) => ({ ...trigger, ...fields });

// flags 保留来源证据、原始HP、排除原因与数值微调；不把未知数值补成档位默认值。
export function enemy(source, group, no, name, tier, status, original, flags = {}) {
    if (!['sts1', 'sts2'].includes(source) || !/^[a-z][a-z0-9-]*$/.test(group)
        || !Number.isInteger(no) || no < 1 || !['normal', 'elite', 'boss'].includes(tier)
        || !ENEMY_STATUSES.includes(status)) throw new Error('invalid-enemy-entry');
    const copy = JSON.parse(JSON.stringify({
        ...flags, id: `en-${source}-${group}-${String(no).padStart(2, '0')}`,
        source, group, name, tier, status, original,
    }));
    return freezeEnemyData(copy);
}

// 来源记录保留证据与原因；只有正式版的已知能力限制使用 excluded。
export function unavailableEnemy(source, group, no, name, tier, status, { reason, notes = [], ...flags }) {
    if (typeof reason !== 'string' || !reason.trim()) throw new Error('enemy-unavailable-reason');
    return enemy(source, group, no, name, tier, status, null, {
        ...flags, notes: [reason, ...notes],
        ...(status === 'release' ? { excluded: reason } : {}),
    });
}
