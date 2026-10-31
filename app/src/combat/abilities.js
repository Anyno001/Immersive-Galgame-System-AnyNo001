import { hash32 } from './random.js';
import { COMBAT_RULES } from './rules.js';

// DND 六维：键、中文名、调整值、熟练加值、初始倾向、相对强度档与属性提升。纯函数，不读写任何存储。
export const ABILITY_KEYS = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export const ABILITY_LABELS = Object.freeze({ str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' });
const ABILITY_ALIASES = Object.freeze({
    str: ['str', '力量', '力'], dex: ['dex', '敏捷', '敏'], con: ['con', '体质', '体'],
    int: ['int', '智力', '智'], wis: ['wis', '感知', '感'], cha: ['cha', '魅力', '魅'],
});

export const ABILITY_CAPS = Object.freeze({ protagonist: 20, other: 30 });
export const LEVEL_CAPS = Object.freeze({ protagonist: 20, other: 30 });
export const ABILITY_MIN = 1;
const STANDARD_REST = Object.freeze([13, 12, 10]);

// 定位缺 init 时的默认倾向：[主擅长, 次擅长, 短板]。
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

// 相对强度档（相对主角）：等级偏移区间与六维修正。
export const REL_TIERS = Object.freeze({
    outclassed: Object.freeze({ label: '远逊', offset: Object.freeze([-6, -4]), mod: -2, ally: 'support' }),
    weaker: Object.freeze({ label: '稍弱', offset: Object.freeze([-3, -2]), mod: -1, ally: 'support' }),
    even: Object.freeze({ label: '相当', offset: Object.freeze([-1, 1]), mod: 0, ally: 'peer' }),
    stronger: Object.freeze({ label: '稍强', offset: Object.freeze([2, 3]), mod: 1, ally: 'ace' }),
    formidable: Object.freeze({ label: '强敌', offset: Object.freeze([4, 6]), mod: 2, ally: 'ace' }),
    overwhelming: Object.freeze({ label: '碾压', offset: Object.freeze([7, 12]), mod: 3, ally: 'legend' }),
});
export const DEFAULT_REL_TIER = 'even';
const REL_BY_LABEL = Object.freeze(Object.fromEntries(Object.entries(REL_TIERS).map(([k, v]) => [v.label, k])));

// 属性提升等级：主角 4/8/12/16/19；非主角另在 24、28 级。
export const ASI_LEVELS = Object.freeze([4, 8, 12, 16, 19]);
export const ASI_LEVELS_OTHER = Object.freeze([...ASI_LEVELS, 24, 28]);
export const ASI_POINTS = 2;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function abilityKeyOf(text) {
    const t = String(text ?? '').trim().toLowerCase();
    if (!t) return null;
    return ABILITY_KEYS.find((k) => ABILITY_ALIASES[k].includes(t)) || null;
}

export function relTierOf(text) {
    const t = String(text ?? '').trim();
    if (Object.hasOwn(REL_TIERS, t)) return t;
    return REL_BY_LABEL[t] || null;
}

export const abilityMod = (score) => Math.floor((Number(score) - 10) / 2);
export const proficiencyBonus = (level) => 2 + Math.floor((clamp(Math.floor(Number(level) || 1), 1, LEVEL_CAPS.other) - 1) / 4);
export const abilityCap = (protagonist) => (protagonist ? ABILITY_CAPS.protagonist : ABILITY_CAPS.other);
export const levelCap = (protagonist) => (protagonist ? LEVEL_CAPS.protagonist : LEVEL_CAPS.other);

// 倾向：{ major, minor, weak } 必须是六维键且互不相同；不合法返回 null。
export function normalizePrefs(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const major = abilityKeyOf(raw.major);
    const minor = abilityKeyOf(raw.minor);
    const weak = abilityKeyOf(raw.weak);
    if (!major || !minor || !weak || new Set([major, minor, weak]).size !== 3) return null;
    return { major, minor, weak };
}

export function defaultPrefs(role) {
    const [major, minor, weak] = ROLE_DEFAULT_PREFS[role] || ROLE_DEFAULT_PREFS.warrior;
    return { major, minor, weak };
}

// 标准数组：15 主擅长、14 次擅长、8 短板，13 / 12 / 10 按角色规范名种子分给其余三项。
export function baseScores(prefs, name) {
    const p = normalizePrefs(prefs) || defaultPrefs();
    const rest = ABILITY_KEYS.filter((k) => k !== p.major && k !== p.minor && k !== p.weak);
    const order = rest.map((k) => [k, hash32(`ability:${name}:${k}`)]).sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
    const scores = { [p.major]: 15, [p.minor]: 14, [p.weak]: 8 };
    order.forEach(([k], i) => { scores[k] = STANDARD_REST[i]; });
    return Object.fromEntries(ABILITY_KEYS.map((k) => [k, scores[k]]));
}

// 手动建档（P8c）：六项同一底分 8，另有 24 点自由分配，单项 3–18（调低可退回点数），总分不超过 72（与标准数组持平）。
export const MANUAL_BUILD = Object.freeze({ base: 8, pool: 24, min: 3, max: 18 });
export const MANUAL_TOTAL = MANUAL_BUILD.base * ABILITY_KEYS.length + MANUAL_BUILD.pool;

// 手动分值：恰好六维键、整数、单项在 3–18、总分不超过 72；不合法返回 null。
export function normalizeManualScores(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (Object.keys(raw).some((k) => !ABILITY_KEYS.includes(k))) return null;
    const out = {};
    for (const k of ABILITY_KEYS) {
        const n = raw[k];
        if (!Number.isInteger(n) || n < MANUAL_BUILD.min || n > MANUAL_BUILD.max) return null;
        out[k] = n;
    }
    return Object.values(out).reduce((sum, n) => sum + n, 0) > MANUAL_TOTAL ? null : out;
}

// 手动分值推导擅长项（P8c 1A）：最高两项为主擅长、次擅长，其余里最低一项为短板；同分按六维键序（力、敏、体、智、感、魅）。
export function prefsFromScores(scores) {
    const at = (k) => ABILITY_KEYS.indexOf(k);
    const [major, minor] = [...ABILITY_KEYS].sort((a, b) => scores[b] - scores[a] || at(a) - at(b));
    const weak = ABILITY_KEYS.filter((k) => k !== major && k !== minor).sort((a, b) => scores[a] - scores[b] || at(a) - at(b))[0];
    return { major, minor, weak };
}

// 相对档偏移：区间内按「角色名 + 档」散列取定值。
export function relOffset(name, tier) {
    const rule = REL_TIERS[tier] || REL_TIERS[DEFAULT_REL_TIER];
    const [lo, hi] = rule.offset;
    return lo + (hash32(`rel:${name}:${tier}`) % (hi - lo + 1));
}

export function relLevel({ name, tier = DEFAULT_REL_TIER, anchorLevel = 1 } = {}) {
    return clamp(Math.floor(Number(anchorLevel) || 1) + relOffset(name, tier), 1, LEVEL_CAPS.other);
}

export function asiCountAt(level, protagonist) {
    const list = protagonist ? ASI_LEVELS : ASI_LEVELS_OTHER;
    return list.filter((l) => l <= level).length;
}

// 非主角属性提升：每次 +2，依次加主擅长、次擅长，封顶后转其余属性中最高且未封顶的一项（同分按键序）。
export function autoAllocate(scores, prefs, count, cap) {
    const out = { ...scores };
    const p = normalizePrefs(prefs) || defaultPrefs();
    for (let n = 0; n < count * ASI_POINTS; n += 1) {
        const pick = [p.major, p.minor].find((k) => out[k] < cap)
            || ABILITY_KEYS.filter((k) => out[k] < cap).sort((a, b) => out[b] - out[a] || ABILITY_KEYS.indexOf(a) - ABILITY_KEYS.indexOf(b))[0];
        if (!pick) break;
        out[pick] += 1;
    }
    return out;
}

// 当前六维：基础 + 档位修正（仅非主角）+ 属性提升 + 有效记录（[{ ability, amount }]）；限 1..上限。
// 主角的属性提升来自 alloc 记录（已在 adjustments 里），非主角自动分配。
// base：手动建档的六项分值（P8c），给出时代替标准数组；档位修正、属性提升与调整照常叠加。
export function deriveAbilities({ prefs, name, level = 1, protagonist = false, tier = DEFAULT_REL_TIER, adjustments = [], base = null } = {}) {
    const cap = abilityCap(protagonist);
    const manual = base ? normalizeManualScores(base) : null;
    let scores = manual ? { ...manual } : baseScores(prefs, name);
    if (!protagonist) {
        const mod = (REL_TIERS[tier] || REL_TIERS[DEFAULT_REL_TIER]).mod;
        scores = Object.fromEntries(ABILITY_KEYS.map((k) => [k, clamp(scores[k] + mod, ABILITY_MIN, cap)]));
        scores = autoAllocate(scores, prefs, asiCountAt(level, false), cap);
    }
    for (const adj of Array.isArray(adjustments) ? adjustments : []) {
        const k = abilityKeyOf(adj?.ability);
        const amount = Math.floor(Number(adj?.amount) || 0);
        if (k && amount) scores[k] = clamp(scores[k] + amount, ABILITY_MIN, cap);
    }
    const mods = Object.fromEntries(ABILITY_KEYS.map((k) => [k, abilityMod(scores[k])]));
    return { scores, mods, proficiency: proficiencyBonus(level), cap };
}

// 主角属性提升余额：已达到的提升次数 × 2 − 已分配点数。
export function asiBalance(level, spent = 0) {
    return Math.max(0, asiCountAt(level, true) * ASI_POINTS - Math.max(0, Math.floor(Number(spent) || 0)));
}

export const isAsiLevel = (level, protagonist = true) => (protagonist ? ASI_LEVELS : ASI_LEVELS_OTHER).includes(Number(level));

// 初始化字段（立绘 DNA 补档与开战档案请求共用）：职业名可空、≤12 字；定位写原型键或其中文名；
// 主擅长 / 次擅长 / 短板写六维键或中文名且互不相同。返回 { ok, value } 或 { ok:false, field, problem }。
// allowScores：只有手动建档写口（P8c）传 true 时才收六项分值；副 LLM 的初始化忽略 scores，与旧版一致。
export function parseCombatInit(raw, { allowScores = false } = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, field: '', problem: 'expected-object' };
    for (const field of ['className', 'role', 'major', 'minor', 'weak']) {
        if (raw[field] !== undefined && typeof raw[field] !== 'string') return { ok: false, field, problem: 'expected-string' };
    }
    const className = (raw.className ?? '').trim();
    if (className.length > 12) return { ok: false, field: 'className', problem: 'too-long' };
    const roleText = String(raw.role ?? '').trim();
    const archetypes = COMBAT_RULES.archetypes;
    const role = Object.hasOwn(archetypes, roleText) ? roleText : Object.keys(archetypes).find((k) => archetypes[k].label === roleText) || null;
    if (!role) return { ok: false, field: 'role', problem: 'unknown-role' };
    // 手动建档（P8c）：带 scores 时擅长项由分值推导，传入的倾向不计；不带时返回形状与旧版一致。
    if (allowScores && raw.scores !== undefined) {
        const scores = normalizeManualScores(raw.scores);
        if (!scores) return { ok: false, field: 'scores', problem: 'invalid-scores' };
        return { ok: true, value: { className, role, ...prefsFromScores(scores), scores } };
    }
    const prefs = {};
    for (const field of ['major', 'minor', 'weak']) {
        const key = abilityKeyOf(raw[field]);
        if (!key) return { ok: false, field, problem: 'unknown-ability' };
        prefs[field] = key;
    }
    if (new Set([prefs.major, prefs.minor, prefs.weak]).size !== 3) return { ok: false, field: 'prefs', problem: 'prefs-duplicate' };
    return { ok: true, value: { className, role, ...prefs } };
}
// 建档方式（P8c）：auto 自动生成 / manual 手动建档 / relative 相对数值；choice 为手动建档下逐角色的 auto（改用自动生成）或 skip（跳过）。
export const BUILD_MODES = Object.freeze(['auto', 'manual', 'relative']);
export const BUILD_CHOICES = Object.freeze(['auto', 'skip']);

// 尚未建档的角色是否由副 LLM 自动给初始化：相对数值只给主角（主角没有相对档）；手动建档只给敌人与选了「自动」的角色；未选或自动生成时都给。
export function wantsAutoInit({ mode = null, choice = null, protagonist = false, enemy = false } = {}) {
    if (mode === 'relative') return Boolean(protagonist);
    if (mode === 'manual') return Boolean(enemy) || choice === 'auto';
    return true;
}

