import { COMBAT_RULES, SKILL_COUNT_MAX, difficultyRule, skillTarget } from './rules.js';
import { SKILL_TEMPLATES, skillFromTemplate } from './card-templates.js';
import { hash32 } from './random.js';

// 敌人参战配置（计划 5.4 / 5.5）：开战时按身份种子与当场难度算出，只写进 setup，不改档案、不发请求；同一敌人同一难度每次相同，重放只认 setup。
// 常驻效果：数量取难度表 affixes[档位]，第一个必为削弱我方的；带 source:'affix'，只供头像详情分组，不参与结算。
// 补技能：模板敌人（generated:false）补到 skillTarget(等级, 档位)；难度表 extraSkills 对所有敌人再追加；总数不超过 SKILL_COUNT_MAX。
const st = (status, stacks, target = 'self') => ({ op: 'status', status, stacks, target });
const affix = (name, trigger, effects, extra = {}) => Object.freeze({ name, trigger, effects: Object.freeze(effects), ...extra });
export const ENEMY_AFFIXES = Object.freeze({
    rite: affix('祭仪', 'turn-start', [st('strength', 1)]),
    plate: affix('铁甲', 'turn-end', [{ op: 'block', amount: 6, target: 'self' }]),
    spikes: affix('棘刺', 'battle-start', [st('thorns', 3)]),
    renew: affix('复生', 'turn-end', [{ op: 'heal', amount: 4, target: 'self' }]),
    fury: affix('怒意', 'on-hit', [st('strength', 1)]),
    curl: affix('蜷身', 'on-hit', [{ op: 'block', amount: 3, target: 'self' }]),
    relic: affix('秘器', 'battle-start', [st('artifact', 2)]),
    rile: affix('躁怒', 'foe-card-played', [st('strength', 1)], { cardType: 'skill' }),
    sap: affix('萎靡之气', 'battle-start', [st('weak', 2, 'all-enemies')], { debuff: true }),
    breach: affix('破绽', 'battle-start', [st('vulnerable', 2, 'all-enemies')], { debuff: true }),
    brittle: affix('蚀骨', 'battle-start', [st('frail', 2, 'all-enemies')], { debuff: true }),
    pulse: affix('心律', 'foe-card-played', [{ op: 'damage', amount: 1, hits: 1, target: 'enemy' }], { debuff: true }),
    daze: affix('晕眩', 'turn-end', [{ op: 'create', card: 'status-daze', amount: 1, to: 'draw' }], { debuff: true }),
    wound: affix('撕伤', 'battle-start', [{ op: 'create', card: 'status-wound', amount: 2, to: 'draw' }], { debuff: true }),
});
// 补技能池与战斗中显示的技能名：模板登记到这里才进池，新增模板不打乱已有敌人的补技能顺序。
const FILL_NAMES = Object.freeze({ slash: '斩击', heavy: '重劈', combo: '连击', cleave: '横扫', drain: '噬血', venom: '毒牙', curse: '衰咒', expose: '破甲', guard: '架势', shelter: '结阵', roar: '咆哮', mend: '疗伤', gash: '裂创', sunder: '震地', 'guard-strike': '攻守', ward: '庇护', warcry: '战吼', leech: '汲取', plague: '瘟疫' });

const difficultyKey = (difficulty) => (Object.hasOwn(COMBAT_RULES.difficulty, difficulty) ? difficulty : 'normal');
const clone = (v) => JSON.parse(JSON.stringify(v));
// 按种子给键排序：同一种子永远同一顺序。
const ranked = (keys, seed) => keys.map((k) => [k, hash32(`${seed}|${k}`)]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);

// 常驻效果：数量取当场难度表；第一个从削弱我方的里取，其余从剩下的里按种子顺序取。
export function enemyAffixes(profile, difficulty = 'normal') {
    const key = difficultyKey(difficulty);
    const tier = Object.hasOwn(COMBAT_RULES.tiers, profile?.tier) ? profile.tier : 'normal';
    const count = difficultyRule(key).affixes[tier] || 0;
    if (!count || !profile?.id) return [];
    const order = ranked(Object.keys(ENEMY_AFFIXES), `affix:${profile.id}:${key}`);
    const first = order.find((k) => ENEMY_AFFIXES[k].debuff);
    return [first, ...order.filter((k) => k !== first)].slice(0, count).map((k) => {
        const a = ENEMY_AFFIXES[k];
        return { id: `af-${k}`, name: a.name, trigger: a.trigger, ...(a.cardType ? { cardType: a.cardType } : {}), effects: clone(a.effects), source: 'affix' };
    });
}

// 补技能：模板敌人补到 skillTarget(等级, 档位)，再加难度表 extraSkills；生成的敌人只加 extraSkills（按等级补齐走参战准备的补技能请求）。
// 补的技能按档案 ID 的种子从池里依次取（种子不含难度：难度越高取得越多、前面的不变），跳过同名，伤害按档位封顶折算。
export function enemyFillSkills(profile, level = 1, difficulty = 'normal') {
    const tierRule = COMBAT_RULES.tiers[profile?.tier];
    if (!tierRule || !profile?.id || !Array.isArray(profile.skills)) return [];
    const have = profile.skills.length;
    const base = profile.generated === false ? Math.max(have, skillTarget(level, profile.tier)) : have;
    const want = Math.min(SKILL_COUNT_MAX, base + difficultyRule(difficultyKey(difficulty)).extraSkills) - have;
    if (want <= 0) return [];
    const names = new Set(profile.skills.map((s) => s.name));
    const pool = ranked(Object.keys(FILL_NAMES).filter((k) => Object.hasOwn(SKILL_TEMPLATES, k)), `fill:${profile.id}`).filter((k) => !names.has(FILL_NAMES[k]));
    return pool.slice(0, want).map((k, i) => ({ id: `${profile.id}-f${i + 1}`, name: FILL_NAMES[k], ...skillFromTemplate(k, tierRule.damageCap) }));
}

export function enemyLoadout(profile, level, difficulty) {
    return { skills: enemyFillSkills(profile, level, difficulty), passives: enemyAffixes(profile, difficulty) };
}

