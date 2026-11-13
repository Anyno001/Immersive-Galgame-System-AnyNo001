// 敌人模板只读索引：正式条目先校验原版模型，再统一换算并逐一校验档案。
import { ENEMY_ENTRIES } from './entries.js';
import { freezeEnemyData } from './dsl.js';
import { enemyReferences, enemyScale } from './scaling.js';
import { compileEnemyModel, ENEMY_MODELS, materializeEnemy } from './materialize.js';

export { ENEMY_MODELS, materializeEnemy };
export function prepareEnemyEntries(entries) {
    const seen = new Set();
    for (const item of entries) {
        if (seen.has(item.id)) throw new Error(`enemy-duplicate:${item.id}`);
        seen.add(item.id);
    }
    const references = enemyReferences(entries);
    const prepared = entries.map((item) => {
        if (item.status !== 'release' || item.excluded) return freezeEnemyData(JSON.parse(JSON.stringify(item)));
        const models = Object.fromEntries(ENEMY_MODELS.map((key) => [key, compileEnemyModel(item, key)]));
        const next = { ...item, ...models, scale: enemyScale(item, models, references) };
        for (const key of ENEMY_MODELS) materializeEnemy(next, key);
        return freezeEnemyData(next);
    });
    return freezeEnemyData({ entries: prepared, references });
}

const library = prepareEnemyEntries(ENEMY_ENTRIES);
export const ENEMIES = library.entries;
export const SOURCE_TIER_REF = library.references;
const BY_ID = new Map(ENEMIES.map((item) => [item.id, item]));
export const enemyById = (id) => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);
