// 敌人装配：按难度档与阶级给敌人补词缀（被动）和补满的技能。
// 词缀表与补技能名表为冻结常量，输出前对 effects 做 JSON 深拷贝以免调用方改动共享数据。
import { COMBAT_RULES, SKILL_COUNT_MAX, difficultyRule, skillTarget } from './rules.js';
import { SKILL_TEMPLATES, skillFromTemplate } from './card-templates.js';
import { hash32 } from './random.js';
import { ENEMY_AFFIXES } from './enemy-affixes.js';
export { ENEMY_AFFIXES } from './enemy-affixes.js';


// 补技能时可选的模板键 -> 技能名。
const FILL_SKILL_NAMES = Object.freeze({
    slash: '斩击', heavy: '重劈', combo: '连击', cleave: '横扫', drain: '噬血', venom: '毒牙', curse: '衰咒', expose: '破甲',
    guard: '架势', shelter: '结阵', roar: '咆哮', mend: '疗伤', gash: '裂创', sunder: '震地', 'guard-strike': '攻守',
    ward: '庇护', warcry: '战吼', leech: '汲取', plague: '瘟疫',
});

const normalizeDifficulty = (key) => (Object.hasOwn(COMBAT_RULES.difficulty, key) ? key : 'normal');
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

// 按 seed 哈希对字符串数组做稳定排序（哈希相同按字典序）。
function shuffleByHash(items, seed) {
    return items
        .map((item) => [item, hash32(`${seed}|${item}`)])
        .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
        .map(([item]) => item);
}

// 给敌人挑词缀：数量由难度档与阶级决定；名额不少于 2 时保证优先放入一条减益类词缀，只有 1 个名额时按洗牌顺序取
// （否则只限普通阶级的非减益词缀，如 E05 硬化、E11 不灭，永远抽不到）。只影响新建 setup，已保存的记录照旧重放。
export function enemyAffixes(enemy, difficulty = 'normal') {
    const diff = normalizeDifficulty(difficulty);
    const tier = Object.hasOwn(COMBAT_RULES.tiers, enemy?.tier) ? enemy.tier : 'normal';
    const count = difficultyRule(diff).affixes[tier] || 0;
    if (!count || !enemy?.id) return [];
    const order = shuffleByHash(Object.keys(ENEMY_AFFIXES).filter((key) => !ENEMY_AFFIXES[key].tiers || ENEMY_AFFIXES[key].tiers.includes(tier)), `affix:${enemy.id}:${diff}`);
    const firstDebuff = count >= 2 ? order.find((key) => ENEMY_AFFIXES[key].debuff) : undefined;
    const picked = firstDebuff ? [firstDebuff, ...order.filter((key) => key !== firstDebuff)] : order;
    return picked.slice(0, count).map((key) => {
        const def = ENEMY_AFFIXES[key];
        return {
            id: `af-${key}`,
            name: def.name,
            trigger: def.trigger,
            ...(def.cardType ? { cardType: def.cardType } : {}),
            effects: cloneJson(def.effects),
            source: 'affix',
        };
    });
}

// 把非生成敌人的技能补到阶级应有的数量（并加上难度额外技能数），不超过技能数上限。
export function enemyFillSkills(enemy, level = 1, difficulty = 'normal') {
    const tierRule = COMBAT_RULES.tiers[enemy?.tier];
    if (!tierRule || !enemy?.id || !Array.isArray(enemy.skills)) return [];
    const have = enemy.skills.length;
    const base = enemy.generated === false ? Math.max(have, skillTarget(level, enemy.tier)) : have;
    const missing = Math.min(SKILL_COUNT_MAX, base + difficultyRule(normalizeDifficulty(difficulty)).extraSkills) - have;
    if (missing <= 0) return [];
    const usedNames = new Set(enemy.skills.map((skill) => skill.name));
    const keys = Object.keys(FILL_SKILL_NAMES).filter((key) => Object.hasOwn(SKILL_TEMPLATES, key));
    return shuffleByHash(keys, `fill:${enemy.id}`)
        .filter((key) => !usedNames.has(FILL_SKILL_NAMES[key]))
        .slice(0, missing)
        .map((key, index) => ({ id: `${enemy.id}-f${index + 1}`, name: FILL_SKILL_NAMES[key], ...skillFromTemplate(key, tierRule.damageCap) }));
}

export function enemyLoadout(enemy, level, difficulty) {
    return { skills: enemyFillSkills(enemy, level, difficulty), passives: enemyAffixes(enemy, difficulty) };
}
