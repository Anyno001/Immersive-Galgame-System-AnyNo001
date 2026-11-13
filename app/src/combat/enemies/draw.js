// 条目抽取使用独立种子域；副 LLM 不参与概率，空档位明确返回 null。
import { hash32, nextRandom } from '../random.js';
import { ENEMIES, ENEMY_MODELS, materializeEnemy } from './index.js';

const roll = (seed) => nextRandom(hash32(seed)).value;

// encounterOnly 条目（如帝蟹两爪）只经遭遇条目同场展开，不作单体抽取或还原。
export function enemyCandidates({ tier, exclude = [] } = {}, entries = ENEMIES) {
    const skip = new Set(exclude);
    return entries.filter((item) => item.status === 'release' && !item.excluded && !item.encounterOnly
        && (!tier || item.tier === tier) && !skip.has(item.id));
}

// 只还原已记录的条目与模型，不再次抽取；无效引用不回退成另一个敌人。
export function resolveEnemy(enemyId, model, entries = ENEMIES) {
    if (!ENEMY_MODELS.includes(model)) return null;
    const item = entries.find((entry) => entry.id === enemyId);
    return item?.status === 'release' && !item.excluded && !item.encounterOnly ? materializeEnemy(item, model) : null;
}

export function drawEnemy({ seed, tier, exclude } = {}, entries = ENEMIES) {
    const pool = enemyCandidates({ tier, exclude }, entries);
    if (!pool.length) return null;
    const index = Math.min(pool.length - 1, Math.floor(roll(`enemy-pick|${seed ?? ''}`) * pool.length));
    return resolveEnemy(pool[index].id, 'original', entries);
}
