// 六维能力值：偏好（主/副/弱项）、基础点数、关系档、升级加点、手动点购、战斗初始化解析。
// 纯函数，随机性只来自 hash32，同名同输入结果恒定。
import { hash32 } from './random.js';
import { COMBAT_RULES } from './rules.js';

export const ABILITY_KEYS = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export const ABILITY_LABELS = Object.freeze({ str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' });
// 各能力的可接受写法（小写比较）。
const ABILITY_ALIASES = Object.freeze({
    str: ['str', '力量', '力'],
    dex: ['dex', '敏捷', '敏'],
    con: ['con', '体质', '体'],
    int: ['int', '智力', '智'],
    wis: ['wis', '感知', '感'],
    cha: ['cha', '魅力', '魅'],
});
export const ABILITY_CAPS = Object.freeze({ protagonist: 20, other: 30 });
export const LEVEL_CAPS = Object.freeze({ protagonist: 20, other: 30 });
export const ABILITY_MIN = 1;
// 默认分配：主项 15、副项 14、弱项 8，其余三项按哈希顺序取 13/12/10。
const FILLER_SCORES = Object.freeze([13, 12, 10]);

export const ROLE_DEFAULT_PREFS = Object.freeze({
    warrior: Object.freeze(['str', 'con', 'int']),
    guardian: Object.freeze(['con', 'str', 'int']),
    ranger: Object.freeze(['dex', 'wis', 'cha']),
    assassin: Object.freeze(['dex', 'int', 'str']),
    mage: Object.freeze(['int', 'con', 'str']),
    priest: Object.freeze(['wis', 'con', 'dex']),
    summoner: Object.freeze(['int', 'cha', 'str']),
    bard: Object.freeze(['cha', 'dex', 'str']),
});

// 相对主角的强弱档：offset 是等级偏移区间，mod 是能力修正，ally 是同伴档位。
export const REL_TIERS = Object.freeze({
    outclassed: Object.freeze({ label: '远逊', offset: Object.freeze([-6, -4]), mod: -2, ally: 'support' }),
    weaker: Object.freeze({ label: '稍弱', offset: Object.freeze([-3, -2]), mod: -1, ally: 'support' }),
    even: Object.freeze({ label: '相当', offset: Object.freeze([-1, 1]), mod: 0, ally: 'peer' }),
    stronger: Object.freeze({ label: '稍强', offset: Object.freeze([2, 3]), mod: 1, ally: 'ace' }),
    formidable: Object.freeze({ label: '强敌', offset: Object.freeze([4, 6]), mod: 2, ally: 'ace' }),
    overwhelming: Object.freeze({ label: '碾压', offset: Object.freeze([7, 12]), mod: 3, ally: 'legend' }),
});
export const DEFAULT_REL_TIER = 'even';
const REL_KEY_BY_LABEL = Object.freeze(Object.fromEntries(Object.entries(REL_TIERS).map(([key, tier]) => [tier.label, key])));

// 获得升级加点的等级（主角 / 其他角色）与每次加点数。
export const ASI_LEVELS = Object.freeze([4, 8, 12, 16, 19]);
export const ASI_LEVELS_OTHER = Object.freeze([...ASI_LEVELS, 24, 28]);
export const ASI_POINTS = 2;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 把各种写法归一成能力键，认不出返回 null。
export function abilityKeyOf(input) {
    const text = String(input ?? '').trim().toLowerCase();
    return (text && ABILITY_KEYS.find((key) => ABILITY_ALIASES[key].includes(text))) || null;
}

// 关系档的键或中文标签归一成键，认不出返回 null。
export function relTierOf(input) {
    const text = String(input ?? '').trim();
    return Object.hasOwn(REL_TIERS, text) ? text : REL_KEY_BY_LABEL[text] || null;
}

export const abilityMod = (score) => Math.floor((Number(score) - 10) / 2);
export const proficiencyBonus = (level) => 2 + Math.floor((clamp(Math.floor(Number(level) || 1), 1, LEVEL_CAPS.other) - 1) / 4);
export const abilityCap = (protagonist) => (protagonist ? ABILITY_CAPS.protagonist : ABILITY_CAPS.other);
export const levelCap = (protagonist) => (protagonist ? LEVEL_CAPS.protagonist : LEVEL_CAPS.other);

// 偏好必须是三个互不相同的能力，否则返回 null。
export function normalizePrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') return null;
    const major = abilityKeyOf(prefs.major);
    const minor = abilityKeyOf(prefs.minor);
    const weak = abilityKeyOf(prefs.weak);
    if (!major || !minor || !weak || new Set([major, minor, weak]).size !== 3) return null;
    return { major, minor, weak };
}

// 职业的默认偏好，未知职业按战士。
export function defaultPrefs(role) {
    const [major, minor, weak] = ROLE_DEFAULT_PREFS[role] || ROLE_DEFAULT_PREFS.warrior;
    return { major, minor, weak };
}

// 按偏好给出基础六维；其余三项按 name 哈希排序后取 13/12/10。
export function baseScores(prefs, name) {
    const chosen = normalizePrefs(prefs) || defaultPrefs();
    const fillers = ABILITY_KEYS
        .filter((key) => key !== chosen.major && key !== chosen.minor && key !== chosen.weak)
        .map((key) => [key, hash32(`ability:${name}:${key}`)])
        .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    const scores = { [chosen.major]: 15, [chosen.minor]: 14, [chosen.weak]: 8 };
    fillers.forEach(([key], index) => {
        scores[key] = FILLER_SCORES[index];
    });
    return Object.fromEntries(ABILITY_KEYS.map((key) => [key, scores[key]]));
}

// 手动点购规则：每项 3~18，总和不超过 base*6+pool。
export const MANUAL_BUILD = Object.freeze({ base: 8, pool: 24, min: 3, max: 18 });
export const MANUAL_TOTAL = MANUAL_BUILD.base * ABILITY_KEYS.length + MANUAL_BUILD.pool;

// 校验手动六维，合法返回规整后的副本，否则 null。
export function normalizeManualScores(scores) {
    if (!scores || typeof scores !== 'object' || Array.isArray(scores) || Object.keys(scores).some((key) => !ABILITY_KEYS.includes(key))) return null;
    const result = {};
    for (const key of ABILITY_KEYS) {
        const value = scores[key];
        if (!Number.isInteger(value) || value < MANUAL_BUILD.min || value > MANUAL_BUILD.max) return null;
        result[key] = value;
    }
    return Object.values(result).reduce((sum, value) => sum + value, 0) > MANUAL_TOTAL ? null : result;
}

// 由六维反推偏好：最高两项为主/副，其余里最低的为弱项（同分按固定顺序）。
export function prefsFromScores(scores) {
    const order = (key) => ABILITY_KEYS.indexOf(key);
    const [major, minor] = [...ABILITY_KEYS].sort((a, b) => scores[b] - scores[a] || order(a) - order(b));
    const weak = ABILITY_KEYS.filter((key) => key !== major && key !== minor).sort((a, b) => scores[a] - scores[b] || order(a) - order(b))[0];
    return { major, minor, weak };
}

// 关系档对应的等级偏移，按 name 哈希在区间内取值。
export function relOffset(name, tier) {
    const rule = REL_TIERS[tier] || REL_TIERS[DEFAULT_REL_TIER];
    const [low, high] = rule.offset;
    return low + hash32(`rel:${name}:${tier}`) % (high - low + 1);
}

// 非主角角色相对锚点等级的实际等级。
export function relLevel({ name, tier = DEFAULT_REL_TIER, anchorLevel = 1 } = {}) {
    return clamp(Math.floor(Number(anchorLevel) || 1) + relOffset(name, tier), 1, LEVEL_CAPS.other);
}

// 到某等级为止已获得的升级加点次数。
export function asiCountAt(level, protagonist) {
    return (protagonist ? ASI_LEVELS : ASI_LEVELS_OTHER).filter((at) => at <= level).length;
}

// 自动加点：每次先补主项、再补副项，都满了就补当前最高的其余项。
export function autoAllocate(scores, prefs, asiCount, cap) {
    const result = { ...scores };
    const chosen = normalizePrefs(prefs) || defaultPrefs();
    for (let i = 0; i < asiCount * ASI_POINTS; i += 1) {
        const target = [chosen.major, chosen.minor].find((key) => result[key] < cap)
            || ABILITY_KEYS.filter((key) => result[key] < cap).sort((a, b) => result[b] - result[a] || ABILITY_KEYS.indexOf(a) - ABILITY_KEYS.indexOf(b))[0];
        if (!target) break;
        result[target] += 1;
    }
    return result;
}

// 推导完整能力：scores、修正、熟练加值、上限。base 为手动六维时优先于偏好。
export function deriveAbilities({ prefs, name, level = 1, protagonist = false, tier = DEFAULT_REL_TIER, adjustments = [], base = null } = {}) {
    const cap = abilityCap(protagonist);
    const manual = base ? normalizeManualScores(base) : null;
    let scores = manual ? { ...manual } : baseScores(prefs, name);
    if (!protagonist) {
        const tierMod = (REL_TIERS[tier] || REL_TIERS[DEFAULT_REL_TIER]).mod;
        scores = Object.fromEntries(ABILITY_KEYS.map((key) => [key, clamp(scores[key] + tierMod, ABILITY_MIN, cap)]));
        scores = autoAllocate(scores, prefs, asiCountAt(level, false), cap);
    }
    // base：剧情、升级加点之前的底数（设置页「修改属性」按它预填，点数上限只约束底数）。
    const unadjusted = { ...scores };
    for (const adjustment of Array.isArray(adjustments) ? adjustments : []) {
        const key = abilityKeyOf(adjustment?.ability);
        const amount = Math.floor(Number(adjustment?.amount) || 0);
        if (key && amount) scores[key] = clamp(scores[key] + amount, ABILITY_MIN, cap);
    }
    const mods = Object.fromEntries(ABILITY_KEYS.map((key) => [key, abilityMod(scores[key])]));
    return { scores, base: unadjusted, mods, proficiency: proficiencyBonus(level), cap };
}

// 尚未花掉的升级加点数。
export function asiBalance(level, spent = 0) {
    return Math.max(0, asiCountAt(level, true) * ASI_POINTS - Math.max(0, Math.floor(Number(spent) || 0)));
}

export const isAsiLevel = (level, protagonist = true) => (protagonist ? ASI_LEVELS : ASI_LEVELS_OTHER).includes(Number(level));

// 解析 AI 给出的战斗初始化；失败返回 { ok:false, field, problem }。
export function parseCombatInit(input, { allowScores = false } = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, field: '', problem: 'expected-object' };
    for (const field of ['className', 'role', 'major', 'minor', 'weak']) {
        if (input[field] !== undefined && typeof input[field] !== 'string') return { ok: false, field, problem: 'expected-string' };
    }
    const className = (input.className ?? '').trim();
    if (className.length > 12) return { ok: false, field: 'className', problem: 'too-long' };
    const roleText = String(input.role ?? '').trim();
    const archetypes = COMBAT_RULES.archetypes;
    const role = Object.hasOwn(archetypes, roleText) ? roleText : Object.keys(archetypes).find((key) => archetypes[key].label === roleText) || null;
    if (!role) return { ok: false, field: 'role', problem: 'unknown-role' };
    if (allowScores && input.scores !== undefined) {
        const scores = normalizeManualScores(input.scores);
        return scores
            ? { ok: true, value: { className, role, ...prefsFromScores(scores), scores } }
            : { ok: false, field: 'scores', problem: 'invalid-scores' };
    }
    const prefs = {};
    for (const field of ['major', 'minor', 'weak']) {
        const key = abilityKeyOf(input[field]);
        if (!key) return { ok: false, field, problem: 'unknown-ability' };
        prefs[field] = key;
    }
    if (new Set([prefs.major, prefs.minor, prefs.weak]).size !== 3) return { ok: false, field: 'prefs', problem: 'prefs-duplicate' };
    return { ok: true, value: { className, role, ...prefs } };
}

export const BUILD_MODES = Object.freeze(['auto', 'manual', 'relative']);
export const BUILD_CHOICES = Object.freeze(['auto', 'skip']);

// 当前构建模式下是否要让 AI 自动初始化能力值。
export function wantsAutoInit({ mode = null, choice = null, protagonist = false, enemy = false } = {}) {
    if (mode === 'relative') return !!protagonist;
    if (mode === 'manual') return !!enemy || choice === 'auto';
    return true;
}
