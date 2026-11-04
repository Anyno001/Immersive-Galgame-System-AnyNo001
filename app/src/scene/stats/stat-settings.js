// 数值系统设置（§1、§10、v2 §10）：总开关默认关闭；规范化只读入参、返回新对象。
import { DEFAULT_STAGE_TEXT, DEFAULT_STAT_PROMPTS, STAT_BACKGROUND_PROMPTS, STAT_INLINE_PROMPTS, STAT_PROMPT_SEGMENTS, STAT_PROMPTS_VERSION, STAT_STALE_PROMPT_KEYS } from './stat-prompt.js';
import { normalizeBuild } from './stat-build.js';
import { DEFAULT_RULESET, hasRuleset } from './rulesets/index.js';

// v0.39 之前的工作区默认规则体系。
const LEGACY_RULESET = 'coc7';

const PROMPT_MAX = 4000;
// 曾被 v0.39 放进 stalePrompts 的键，这里仍是有效模板，迁移时搬回 prompts。
const RESTORABLE_KEYS = Object.freeze(['sheets', 'sheetGen']);
const STALE_STORE_KEYS = Object.freeze([...STAT_STALE_PROMPT_KEYS, ...RESTORABLE_KEYS]);
export const STAT_PROMPT_KEYS = Object.freeze([...STAT_PROMPT_SEGMENTS, 'diceManual', ...STAT_INLINE_PROMPTS, ...STAT_BACKGROUND_PROMPTS]);

export const STATS_SETTINGS_DEFAULTS = Object.freeze({
    enabled: false,
    autoSkill: true,
    register: 'auto',
    hudLabel: 'number',
    favorMode: 'normal',
    intimacyGate: true,
    ruleset: DEFAULT_RULESET,
    newChat: 'ask',
    storyCheck: 'preroll',
    checkFx: true,
    optionChance: true,
    sheetGen: 'prompt',
    backfill: 'auto',
    bars: Object.freeze({ stamina: true, money: true, stress: true }),
    push: Object.freeze({ enabled: false }),
});

const REGISTER_MODES = new Set(['auto', 'manual']);
const HUD_LABELS = new Set(['stage', 'number', 'both']);
const FAVOR_MODES = new Set(['normal', 'hard']);
const NEW_CHAT = new Set(['ask', 'auto', 'off']);
const STORY_CHECK = new Set(['preroll', 'manual', 'off']);
const SHEET_GEN = new Set(['prompt', 'auto', 'off']);
const BACKFILL = new Set(['auto', 'manual', 'off']);

function bool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function pick(set, value, fallback) {
    return set.has(value) ? value : fallback;
}

// v0.39.24 之前默认「阶段名」，且设置页保存时会把默认值一并写进配置；没有 hudLabelVersion 的 stage 视为旧默认，改为数字。
const HUD_LABEL_VERSION = 2;
function hudLabelOf(src, d) {
    if (src.hudLabelVersion !== HUD_LABEL_VERSION && src.hudLabel === 'stage') return d.hudLabel;
    return pick(HUD_LABELS, src.hudLabel, d.hudLabel);
}

// 用户覆盖的文本：只收已登记的键与非空字符串（超长截断）；留空表示用默认值（§9）。
// 设置页框里直接显示默认原文，与默认值相同的内容不算覆盖，内置提示词更新时仍跟随默认。
function textMap(raw, keys, defaults = {}) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const key of keys) {
        const value = src[key];
        if (typeof value !== 'string' || !value.trim()) continue;
        if (typeof defaults[key] === 'string' && value.trim() === defaults[key].trim()) continue;
        out[key] = value.slice(0, PROMPT_MAX);
    }
    return out;
}

// 提示词覆盖按版本迁移：
// - 版本已是当前：prompts 与 stalePrompts 各自过滤；v0.39 曾把 sheets、sheetGen 误放进 stalePrompts，prompts 里没有时搬回来。
// - 版本较旧（含工作区旧设置，没有 promptsVersion）：失效清单里的键移进 stalePrompts，其余（含 sheets、sheetGen）原样保留；
//   旧键 rollManual 的覆盖随失效清单移走，不再对应新键 diceManual。
function migratePrompts(src) {
    const prompts = src.prompts && typeof src.prompts === 'object' && !Array.isArray(src.prompts) ? src.prompts : {};
    const stale = textMap(src.stalePrompts, STALE_STORE_KEYS);
    const restore = {};
    for (const key of RESTORABLE_KEYS) {
        if (typeof stale[key] === 'string' && !(typeof prompts[key] === 'string' && prompts[key].trim())) restore[key] = stale[key];
        delete stale[key];
    }
    const merged = { ...restore, ...prompts };
    if (src.promptsVersion === STAT_PROMPTS_VERSION) return { prompts: textMap(merged, STAT_PROMPT_KEYS, DEFAULT_STAT_PROMPTS), stale: textMap(stale, STAT_STALE_PROMPT_KEYS) };
    const kept = { ...merged };
    for (const key of STAT_STALE_PROMPT_KEYS) {
        delete kept[key];
        const text = merged[key];
        if (typeof text !== 'string' || !text.trim()) continue;
        if (typeof DEFAULT_STAT_PROMPTS[key] === 'string' && text.trim() === DEFAULT_STAT_PROMPTS[key].trim()) continue;
        stale[key] = text.slice(0, PROMPT_MAX);
    }
    return { prompts: textMap(kept, STAT_PROMPT_KEYS, DEFAULT_STAT_PROMPTS), stale: textMap(stale, STAT_STALE_PROMPT_KEYS) };
}

// 每段注入是否开启：未写或非布尔一律视为开启。
function segmentMap(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return Object.fromEntries(STAT_PROMPT_SEGMENTS.map((id) => [id, src[id] !== false]));
}

// 推送映射覆盖（§8B）：{ 模板指纹: { 编码后的「表|列」: 'auto' | 'skip' | 'number' | 'stage' } }。
// 已确认过的模板即使没有覆盖也保留空对象，用来区分「新模板」。
const FINGERPRINT = /^tpl-[0-9a-f]{1,8}$/;
const MAPPING_VALUES = new Set(['auto', 'skip', 'number', 'stage']);

function mappingMap(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const [fp, rows] of Object.entries(src)) {
        if (!FINGERPRINT.test(fp) || !rows || typeof rows !== 'object' || Array.isArray(rows)) continue;
        const kept = {};
        for (const [key, value] of Object.entries(rows)) if (key.length <= 400 && MAPPING_VALUES.has(value)) kept[key] = value;
        out[fp] = kept;
    }
    return out;
}

// readStatsSettings 的结果按入参对象引用缓存：已保存的配置共享只读、改动时整体换新对象，引用不变即复用；
// 返回值调用方不得原地修改。入参非对象时不缓存。
const NORMALIZED = new WeakMap();

// 规则体系的旧默认：没有 promptsVersion 的是 v0.39 之前的工作区设置，当时默认 CoC第七版；显式存了的照旧保留。
function rulesetOf(src, d) {
    if (typeof src.ruleset === 'string' && hasRuleset(src.ruleset)) return src.ruleset;
    return src.promptsVersion === undefined && Object.keys(src).length ? LEGACY_RULESET : d.ruleset;
}

// 运行时热路径用：读的是已保存的设置快照（写时浅拷，不会原地改），可按引用缓存。
export function readStatsSettings(raw) {
    if (!raw || typeof raw !== 'object') return normalizeStatsSettings(raw);
    let result = NORMALIZED.get(raw);
    if (!result) { result = normalizeStatsSettings(raw); NORMALIZED.set(raw, result); }
    return result;
}

// 不缓存：设置页草稿会被原地改（如新增自定义技能），按引用缓存会读到旧值。
export function normalizeStatsSettings(raw) {
    const isObject = raw && typeof raw === 'object';
    const src = isObject ? raw : {};
    const d = STATS_SETTINGS_DEFAULTS;
    const bars = src.bars && typeof src.bars === 'object' ? src.bars : {};
    const push = src.push && typeof src.push === 'object' ? src.push : {};
    const migrated = migratePrompts(src);
    const result = {
        enabled: bool(src.enabled, d.enabled),
        autoSkill: bool(src.autoSkill, d.autoSkill),
        register: pick(REGISTER_MODES, src.register, d.register),
        hudLabel: hudLabelOf(src, d),
        hudLabelVersion: HUD_LABEL_VERSION,
        favorMode: pick(FAVOR_MODES, src.favorMode, d.favorMode),
        intimacyGate: bool(src.intimacyGate, d.intimacyGate),
        ruleset: rulesetOf(src, d),
        newChat: pick(NEW_CHAT, src.newChat, d.newChat),
        storyCheck: pick(STORY_CHECK, src.storyCheck, d.storyCheck),
        checkFx: bool(src.checkFx, d.checkFx),
        optionChance: bool(src.optionChance, d.optionChance),
        sheetGen: pick(SHEET_GEN, src.sheetGen, d.sheetGen),
        backfill: pick(BACKFILL, src.backfill, d.backfill),
        bars: {
            stamina: bool(bars.stamina, d.bars.stamina),
            money: bool(bars.money, d.bars.money),
            stress: bool(bars.stress, d.bars.stress),
        },
        push: { enabled: bool(push.enabled, d.push.enabled), mappings: mappingMap(push.mappings) },
        promptsVersion: STAT_PROMPTS_VERSION,
        prompts: migrated.prompts,
        stalePrompts: migrated.stale,
        staleNoticeSeen: bool(src.staleNoticeSeen, false),
        segments: segmentMap(src.segments),
        stageText: textMap(src.stageText, Object.keys(DEFAULT_STAGE_TEXT), DEFAULT_STAGE_TEXT),
        // 建卡（倾向 / 手动六维 / 职业 / 特有技能）；「按分配启用」时用它生成本聊天初始数值。
        build: normalizeBuild(src.build),
    };
    return result;
}

// 总开关与本聊天开关都开着才运行（易错点 H1/H2）。
export function statsActive(settings, save) {
    return Boolean(settings && settings.enabled && save && save.chatEnabled === true);
}
