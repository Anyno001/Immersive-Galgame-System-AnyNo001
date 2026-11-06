// 建卡（v0.39）：六维倾向（主擅长 / 次擅长 / 短板）或手动六维（底 8、池 24，单项 3–18，合计 72）加职业；
// 技能：擅长 3 项（60）、比较擅长 5 项（30，擅长减半），其余按规则的未学基础值。
// 候选 = 全部内置技能 + 玩家自定义项；世界观技能与剧情技能另外算，不占这 8 格。纯函数，不改入参。
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS, createStatsState, withSkills } from './stat-state.js';
import { CORE_SKILL_NAMES, LEGACY_ATTRIBUTE_MAP } from './stat-registry.js';
import { ABILITY_KEYS, ABILITY_LABELS, MANUAL_BUILD, MANUAL_TOTAL, abilityKeyOf, defaultPrefs, normalizeManualScores, normalizePrefs, prefsFromScores } from '../../combat/abilities.js';
import { COMBAT_RULES } from '../../combat/rules.js';

export const BUILD_PREF_FIELDS = Object.freeze(['major', 'minor', 'weak']);
export const BUILD_PREF_LABELS = Object.freeze({ major: '主擅长', minor: '次擅长', weak: '短板' });
// 两档技能格：路径 bridge.stats.build.picks.strong1… / good1…，值为技能名，空串为未选。
export const BUILD_STRONG_COUNT = 3;
export const BUILD_GOOD_COUNT = 5;
export const BUILD_STRONG_VALUE = 60;
export const BUILD_GOOD_VALUE = 30;
export const BUILD_PICK_SLOTS = Object.freeze([
    ...Array.from({ length: BUILD_STRONG_COUNT }, (_, i) => `strong${i + 1}`),
    ...Array.from({ length: BUILD_GOOD_COUNT }, (_, i) => `good${i + 1}`),
]);
export const BUILD_CUSTOM_MAX = 8;
// 下拉末尾的「自定义…」选项值：只触发弹框，不会写进设置。
export const BUILD_CUSTOM_OPTION = '__custom__';
// 默认：原来的 8 项日常技能，前 3 项擅长、后 5 项比较擅长。
const DEFAULT_PICKS = Object.freeze(Object.fromEntries(BUILD_PICK_SLOTS.map((slot, i) => [slot, DEFAULT_SPECIAL_SKILLS[i] || ''])));
export const slotValue = (slot) => (slot.startsWith('strong') ? BUILD_STRONG_VALUE : BUILD_GOOD_VALUE);
// 自定义技能名会拼进设置路径 bridge.stats.build.special.<名>：不收点号、空白、数字与标记符号，1–8 字（同学习表词长）。
const CUSTOM_NAME = /^[^\s0-9０-９.\[\]{}<>|:："'`\/]{1,8}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);
// 旧属性名（健康 / 理智 / 观察）会被归一成六维，收作技能名会和属性串号；「理智」在 CoC 下是理智值。
const ATTRIBUTE_ALIASES = new Set(Object.keys(LEGACY_ATTRIBUTE_MAP));
const DEFAULT_ROLE = 'warrior';
const CLASS_NAME_MAX = 12;
export const BUILD_ABILITY_OPTIONS = Object.freeze(ABILITY_KEYS.map((key) => [key, ABILITY_LABELS[key]]));
export const BUILD_ROLE_OPTIONS = Object.freeze(Object.entries(COMBAT_RULES.archetypes).map(([key, rule]) => [key, rule.label || key]));

// 校验单个自定义技能名；返回规范名或 null。与基础属性、默认特有技能重名的不收（已有）。
export function validCustomSkillName(raw) {
    const name = String(raw ?? '').trim();
    if (!CUSTOM_NAME.test(name) || RESERVED.has(name)) return null;
    if (BASE_ATTRIBUTES.includes(name) || ATTRIBUTE_ALIASES.has(name) || DEFAULT_SPECIAL_SKILLS.includes(name)) return null;
    return name;
}

function normalizeCustom(raw) {
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const name = validCustomSkillName(item);
        if (name && !out.includes(name)) out.push(name);
        if (out.length >= BUILD_CUSTOM_MAX) break;
    }
    return out;
}

// 自定义技能所属六维：{ 名字: 六维之一 }，只留 build.custom 里有的名字；没写的在登记时按敏捷。
function normalizeCustomAttrs(raw, custom) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const name of custom) if (BASE_ATTRIBUTES.includes(src[name])) out[name] = src[name];
    return out;
}

// 倾向三项：认得出的用，认不出的补默认职业的倾向（可能重复，由 buildSummary 报错）。
function normalizePrefFields(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const fallback = defaultPrefs();
    return Object.fromEntries(BUILD_PREF_FIELDS.map((field) => [field, abilityKeyOf(src[field]) || fallback[field]]));
}

// 下拉候选：全部内置技能（日常 8 项在前）+ 自定义项。世界观技能与剧情技能另外算，不进候选。
export function pickCandidates(build) {
    const custom = build && Array.isArray(build.custom) ? normalizeCustom(build.custom) : [];
    return [...new Set([...DEFAULT_SPECIAL_SKILLS, ...CORE_SKILL_NAMES, ...custom])];
}

// 下拉分组（成员表由本文件维护；未列入的候选落「其他」，测试断言内置候选不会落进「其他」）。
export const SKILL_GROUPS = Object.freeze([
    ['日常', ['烹饪', '家务', '学习', '运动', '艺术', '话术', '照顾', '应变']],
    ['生活', ['穿搭', '化妆', '园艺', '养宠物', '喝酒', '带娃', '认路', '修理', '游戏', '棋牌', '按摩', '驾驶']],
    ['才艺', ['唱歌', '舞蹈', '摄影', '写作', '手工', '讲故事', '调酒']],
    ['社交', ['恐吓', '魅惑', '安抚', '八卦', '撒娇', '砍价', '演讲']],
    ['调查', ['侦查', '聆听', '察言观色', '查资料', '追踪', '记忆']],
    ['身手', ['潜行', '闪避', '攀爬', '格斗', '射击', '投掷', '跳跃', '开锁']],
    ['专业', ['医术', '电脑', '法律', '财务', '外语', '鉴定']],
    ['歪门邪道', ['撒谎', '勒索', '挑拨', '造谣', '演戏', '甩锅', '忽悠', '道德绑架', '套话', '拍马屁', '煽动', '精神控制', '下药', '伪造', '诈骗', '销毁证据', '黑话', '尾随', '偷拍', '作弊', '逃跑', '赌博', '偷袭', '顺手牵羊', '伪装']],
]);
export const SKILL_GROUP_OTHER = '其他';

// 技能名按类分组：不在任何分组里的落「其他」，空组不返回。
export function groupSkillNames(names) {
    const placed = new Set();
    const groups = SKILL_GROUPS.map(([label, members]) => {
        const items = members.filter((name) => names.includes(name));
        items.forEach((name) => placed.add(name));
        return { label, items };
    });
    const rest = names.filter((name) => !placed.has(name));
    if (rest.length) groups.push({ label: SKILL_GROUP_OTHER, items: rest });
    return groups.filter((g) => g.items.length);
}

// 下拉候选：已建的自定义技能单独列在前面，其余内置候选按类分组。
export function groupPickCandidates(build) {
    const b = build && Array.isArray(build.custom) ? build : normalizeBuild(build);
    const custom = normalizeCustom(b.custom);
    return { custom, groups: groupSkillNames(pickCandidates({ custom }).filter((name) => !custom.includes(name))) };
}

// 旧设置 build.special（开关，最多 3 项）迁成擅长格，比较擅长格补默认里没被占用的。
function picksFromSpecial(special, candidates) {
    const on = Object.entries(special).filter(([name, v]) => v === true && candidates.includes(name)).map(([name]) => name).slice(0, BUILD_STRONG_COUNT);
    const strong = [...on, ...DEFAULT_SPECIAL_SKILLS.filter((n) => !on.includes(n))].slice(0, BUILD_STRONG_COUNT);
    const good = DEFAULT_SPECIAL_SKILLS.filter((n) => !strong.includes(n)).slice(0, BUILD_GOOD_COUNT);
    return Object.fromEntries(BUILD_PICK_SLOTS.map((slot) => {
        const i = Number(slot.replace(/\D/g, '')) - 1;
        return [slot, (slot.startsWith('strong') ? strong[i] : good[i]) || ''];
    }));
}

function normalizePicks(src, custom) {
    const candidates = pickCandidates({ custom });
    const raw = src.picks && typeof src.picks === 'object' && !Array.isArray(src.picks) ? src.picks : null;
    if (!raw) {
        const special = src.special && typeof src.special === 'object' && !Array.isArray(src.special) ? src.special : null;
        return special ? picksFromSpecial(special, candidates) : { ...DEFAULT_PICKS };
    }
    return Object.fromEntries(BUILD_PICK_SLOTS.map((slot) => {
        const name = typeof raw[slot] === 'string' ? raw[slot].trim() : '';
        return [slot, candidates.includes(name) ? name : ''];
    }));
}

// 旧存档的 build.base（60 点分配）不再识别：忽略。
export function normalizeBuild(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const prefs = normalizePrefFields(src.prefs);
    const custom = normalizeCustom(src.custom);
    const picks = normalizePicks(src, custom);
    const scoresSrc = src.scores && typeof src.scores === 'object' && !Array.isArray(src.scores) ? src.scores : {};
    const scores = Object.fromEntries(ABILITY_KEYS.map((key) => {
        const n = scoresSrc[key] === '' || scoresSrc[key] == null ? NaN : Math.round(Number(scoresSrc[key]));
        return [key, Number.isFinite(n) ? n : MANUAL_BUILD.base];
    }));
    const role = Object.hasOwn(COMBAT_RULES.archetypes, src.role) ? src.role : DEFAULT_ROLE;
    const className = typeof src.className === 'string' ? src.className.trim().slice(0, CLASS_NAME_MAX) : '';
    const customAttrs = normalizeCustomAttrs(src.customAttrs, custom);
    return { prefs, picks, custom, customAttrs, scores, role, className };
}

// 选技能汇总：{ 技能: 起始值 }；擅长三格必须选满，同一技能不能占两格。
export function pickSummary(build) {
    const b = normalizeBuild(build);
    const skills = {};
    const slots = {};
    const errors = [];
    for (const slot of BUILD_PICK_SLOTS) {
        const name = b.picks[slot];
        if (!name) { if (slot.startsWith('strong')) errors.push('stats-build-strong-missing'); continue; }
        if (Object.hasOwn(skills, name)) { errors.push('stats-build-pick-duplicate'); continue; }
        skills[name] = slotValue(slot);
        slots[slot] = name;
    }
    const unique = [...new Set(errors)];
    // 已选的自定义技能带上所属六维，建卡或选技能时据此登记。
    const attributes = Object.fromEntries(Object.keys(skills).filter((name) => Object.hasOwn(b.customAttrs, name)).map((name) => [name, b.customAttrs[name]]));
    return { skills, slots, attributes, picked: Object.keys(skills), errors: unique, ok: unique.length === 0 };
}

// 旧存档没有 catalog.heroSlots 时，按主角已学的非剧情技能回填八格：entries 为 [[技能, 当前值]]。
// 按值从高到低，值不低于擅长起步值的先进擅长格（至多 3 格），其余进比较擅长格（至多 5 格）；填不下的不占格。
export function backfillHeroSlots(entries) {
    const sorted = [...entries].filter(([, v]) => Number(v) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
    const slots = {};
    let strong = 0;
    let good = 0;
    for (const [name, value] of sorted) {
        if (Number(value) >= BUILD_STRONG_VALUE && strong < BUILD_STRONG_COUNT) slots[`strong${++strong}`] = name;
        else if (good < BUILD_GOOD_COUNT) slots[`good${++good}`] = name;
    }
    return slots;
}

// 倾向建卡（自动 / 相对数值）的汇总：倾向三项须互不相同，技能格见 pickSummary。
export function buildSummary(build) {
    const b = normalizeBuild(build);
    const p = pickSummary(b);
    const errors = [...(normalizePrefs(b.prefs) ? [] : ['stats-build-prefs-duplicate']), ...p.errors];
    return { prefs: b.prefs, picked: p.picked, skills: p.skills, attributes: p.attributes, errors, ok: errors.length === 0 };
}

// 手动六维建卡的汇总：单项 3–18、合计不超过 72。
export function manualBuildSummary(build) {
    const b = normalizeBuild(build);
    const total = ABILITY_KEYS.reduce((sum, key) => sum + b.scores[key], 0);
    const valid = normalizeManualScores(b.scores);
    const p = pickSummary(b);
    const errors = [...(valid ? [] : [total > MANUAL_TOTAL ? 'stats-build-over-total' : 'stats-build-score-range']), ...p.errors];
    return { scores: b.scores, total, max: MANUAL_TOTAL, left: MANUAL_TOTAL - total, prefs: valid ? prefsFromScores(valid) : null, role: b.role, className: b.className, picked: p.picked, skills: p.skills, attributes: p.attributes, errors, ok: errors.length === 0 };
}

const skillTableOf = (values) => Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value, marked: false }]));

// 返回 { ok, state } 或 { ok: false, reason }；不合规时不建卡。mode 为 'manual' 时另返回 manual 附件，交战斗侧写初始档案。
export function buildInitialState(build, { mode } = {}) {
    const b = normalizeBuild(build);
    if (mode === 'manual') {
        const summary = manualBuildSummary(b);
        if (!summary.ok) return { ok: false, reason: summary.errors[0], summary };
        return { ok: true, state: withSkills(createStatsState({ prefs: summary.prefs }), skillTableOf(summary.skills)), summary, manual: { className: summary.className, role: summary.role, scores: { ...summary.scores } } };
    }
    const summary = buildSummary(b);
    if (!summary.ok) return { ok: false, reason: summary.errors[0], summary };
    return { ok: true, state: withSkills(createStatsState({ prefs: normalizePrefs(b.prefs) }), skillTableOf(summary.skills)), summary };
}
