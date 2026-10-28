// 数值系统设置（§1、§10）：总开关默认关闭；规范化只读入参、返回新对象。
import { DEFAULT_STAGE_TEXT, DEFAULT_STAT_PROMPTS, STAT_PROMPT_SEGMENTS } from './stat-prompt.js';
import { normalizeBuild } from './stat-build.js';

const PROMPT_MAX = 4000;

export const STATS_SETTINGS_DEFAULTS = Object.freeze({
    enabled: false,
    autoSkill: true,
    register: 'auto',
    hudLabel: 'stage',
    intimacyGate: true,
    bars: Object.freeze({ stamina: true, money: true, stress: true }),
    push: Object.freeze({ enabled: false }),
});

const REGISTER_MODES = new Set(['auto', 'manual']);
const HUD_LABELS = new Set(['stage', 'number', 'both']);

function bool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
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

export function normalizeStatsSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const d = STATS_SETTINGS_DEFAULTS;
    const bars = src.bars && typeof src.bars === 'object' ? src.bars : {};
    const push = src.push && typeof src.push === 'object' ? src.push : {};
    return {
        enabled: bool(src.enabled, d.enabled),
        autoSkill: bool(src.autoSkill, d.autoSkill),
        register: REGISTER_MODES.has(src.register) ? src.register : d.register,
        hudLabel: HUD_LABELS.has(src.hudLabel) ? src.hudLabel : d.hudLabel,
        intimacyGate: bool(src.intimacyGate, d.intimacyGate),
        bars: {
            stamina: bool(bars.stamina, d.bars.stamina),
            money: bool(bars.money, d.bars.money),
            stress: bool(bars.stress, d.bars.stress),
        },
        push: { enabled: bool(push.enabled, d.push.enabled), mappings: mappingMap(push.mappings) },
        prompts: textMap(src.prompts, STAT_PROMPT_SEGMENTS, DEFAULT_STAT_PROMPTS),
        segments: segmentMap(src.segments),
        stageText: textMap(src.stageText, Object.keys(DEFAULT_STAGE_TEXT), DEFAULT_STAGE_TEXT),
        // 建卡分配（Q5：点数分配可在设置中修改）；「按分配启用」时用它生成本聊天初始数值。
        build: normalizeBuild(src.build),
    };
}

// 总开关与本聊天开关都开着才运行（易错点 H1/H2）。
export function statsActive(settings, save) {
    return Boolean(settings && settings.enabled && save && save.chatEnabled === true);
}
