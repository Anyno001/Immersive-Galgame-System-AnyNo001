// 原版模型校验与档案物化：条目只存原版模型；缝合项由特性池按种子从原版取材，不在条目层维护。
import { normalizeProfile } from '../schema.js';
import { scaleEnemyModel } from './scaling.js';
import { KIN_FIELDS } from '../kin.js';

export const ENEMY_MODELS = Object.freeze(['original']);
const copy = (value) => JSON.parse(JSON.stringify(value));
const fail = (id, path) => { throw new Error(`enemy-model:${id}:${path}`); };

export function compileEnemyModel(item, key) {
    const model = item?.[key];
    if (!ENEMY_MODELS.includes(key) || !model || !Array.isArray(model.skills) || !model.skills.length) fail(item?.id, key);
    return copy(model);
}

// 返回独立、已规范化的档案；未准备或已排除的条目不物化。
export function materializeEnemy(item, model, { id, names } = {}) {
    if (!item || item.status !== 'release' || item.excluded || !item.scale || !ENEMY_MODELS.includes(model) || !item[model]) return null;
    const data = scaleEnemyModel(item[model], item.scale);
    const skills = [...data.skills, ...(data.phases || []).flatMap((p) => p.addSkills || [])];
    skills.forEach((skill, i) => {
        const name = Array.isArray(names) ? names[i] : null;
        if (typeof name === 'string' && name.trim() && name.trim().length <= 20) skill.name = name.trim();
    });
    const result = normalizeProfile({
        kind: 'enemy', id: id ?? item.id, name: item.name, tier: item.tier,
        base: { hp: item.scale.hp }, skills: data.skills, passives: data.passives || [], phases: data.phases || [],
        ...Object.fromEntries(KIN_FIELDS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])),
        ...(data.script ? { script: data.script } : {}), template: { enemyId: item.id, model }, generated: true,
    });
    if (!result.ok) throw new Error(`enemy-profile:${item.id}:${model}:${JSON.stringify(result.errors)}`);
    return result.value;
}
