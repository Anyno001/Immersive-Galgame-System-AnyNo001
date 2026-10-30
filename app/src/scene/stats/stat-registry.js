// 技能注册表（数值 v2 §3.2、附录 A）：内置条目写在代码里，剧情中新出现的技能存在聊天级 catalog.story。
// 每条：所属属性、类别（决定 CoC 未学基础值）、是否社交、默认对抗技能、别名。纯函数，返回新对象不改入参。
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS } from './stat-state.js';
import { WORLDVIEW_SPECIAL_SKILLS } from './stat-world-skills.js';

export const CATEGORY_BASE = Object.freeze({ daily: 25, general: 15, pro: 5, rare: 1 });
export const CATEGORY_LABEL = Object.freeze({ daily: '日常', general: '通用', pro: '专业', rare: '稀有' });
export const STORY_SKILL_MAX = 24;
export const STORY_SKILL_PER_FLOOR = 2;
export const ATTRIBUTE_DND_LABEL = Object.freeze({ 健康: '体质', 力量: '力量', 敏捷: '敏捷', 理智: '智力', 观察: '感知', 魅力: '魅力' });
const NAME = /^[^\s0-9０-９.\[\]{}<>|:："'`\\/]{1,8}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

const e = (attribute, category, extra = {}) => Object.freeze({ attribute, category, aliases: Object.freeze(extra.aliases || []), ...extra, kind: 'skill' });

// base：官方表里有的同名技能用官方基础值；'half-dex' 为闪避（敏捷 / 2）。
const CORE = {
    烹饪: e('理智', 'daily', { aliases: ['厨艺', '做菜'] }),
    家务: e('健康', 'daily'),
    学习: e('理智', 'daily'),
    运动: e('力量', 'daily', { aliases: ['体育', '游泳'] }),
    艺术: e('魅力', 'general', { aliases: ['表演', '演奏', '绘画'] }),
    话术: e('魅力', 'general', { social: true, opposedBy: '心理学', aliases: ['说服', '劝说', '谈判', '口才', '交涉', '欺骗', '哄骗'] }),
    照顾: e('观察', 'daily', { aliases: ['看护', '护理'] }),
    应变: e('理智', 'general', { aliases: ['急智', '随机应变'] }),
    侦查: e('观察', 'general', { base: 25, aliases: ['搜查', '调查', '搜索', '察觉', '侦察'] }),
    聆听: e('观察', 'general', { base: 20, aliases: ['倾听', '偷听'] }),
    心理学: e('观察', 'general', { base: 10, aliases: ['洞悉', '察言观色', '看穿', '识破'] }),
    潜行: e('敏捷', 'general', { base: 20, opposedBy: '侦查', aliases: ['隐匿', '潜入', '躲藏'] }),
    闪避: e('敏捷', 'general', { base: 'half-dex', aliases: ['躲闪'] }),
    攀爬: e('力量', 'general', { base: 20, aliases: ['攀登', '爬墙', '运动能力'] }),
    格斗: e('力量', 'general', { base: 25, opposedBy: '闪避', aliases: ['斗殴', '搏斗', '肉搏', '近战'] }),
    射击: e('敏捷', 'general', { base: 20, opposedBy: '闪避', aliases: ['射箭', '弓术'] }),
    急救: e('理智', 'general', { base: 30, aliases: ['包扎', '止血'] }),
    恐吓: e('魅力', 'general', { base: 15, social: true, opposedBy: '理智', aliases: ['威胁', '威吓'] }),
    魅惑: e('魅力', 'general', { base: 15, social: true, opposedBy: '心理学', aliases: ['勾引', '调情', '诱惑'] }),
    开锁: e('敏捷', 'pro', { base: 1, aliases: ['撬锁'] }),
    驾驶: e('敏捷', 'general', { base: 20, aliases: ['开车', '驾车', '汽车驾驶'] }),
};

// 世界观附加技能：与核心同名的（急救、潜行、驾驶）沿用核心条目。
const WORLD_META = {
    武艺: e('力量', 'general', { opposedBy: '闪避', aliases: ['武功', '武术'] }),
    医术: e('理智', 'pro', { aliases: ['医学', '中医'] }),
    书画: e('魅力', 'general'),
    礼仪: e('魅力', 'general', { social: true }),
    剑术: e('力量', 'general', { opposedBy: '闪避' }),
    魔法: e('理智', 'rare', { opposedBy: '闪避', aliases: ['法术', '施法'] }),
    骑术: e('敏捷', 'general', { aliases: ['骑马'] }),
    野外求生: e('健康', 'general', { aliases: ['生存'] }),
    咒语: e('理智', 'rare', { opposedBy: '闪避' }),
    魔药: e('理智', 'pro', { aliases: ['炼金', '药剂'] }),
    飞行: e('敏捷', 'pro'),
    占卜: e('观察', 'rare'),
    骇入: e('理智', 'pro', { aliases: ['黑客', '入侵'] }),
    机械: e('理智', 'pro', { aliases: ['机械维修', '维修'] }),
    医疗: e('理智', 'pro', { aliases: ['医学'] }),
    求生: e('健康', 'general', { aliases: ['生存'] }),
    枪械: e('敏捷', 'general', { opposedBy: '闪避', aliases: ['枪法'] }),
    茶道: e('观察', 'pro'),
    剑道: e('力量', 'general', { opposedBy: '闪避' }),
    文学: e('理智', 'general'),
    礼法: e('魅力', 'general', { social: true }),
    驱邪: e('理智', 'rare'),
    灵感: e('观察', 'rare'),
};

function buildBuiltin() {
    const out = {};
    for (const name of BASE_ATTRIBUTES) out[name] = Object.freeze({ kind: 'attribute', attribute: name, category: 'general', aliases: Object.freeze([]), social: name === '魅力' });
    for (const [name, entry] of Object.entries(CORE)) out[name] = Object.freeze({ ...entry, origin: DEFAULT_SPECIAL_SKILLS.includes(name) ? 'builtin' : 'core' });
    for (const table of Object.values(WORLDVIEW_SPECIAL_SKILLS)) {
        for (const name of Object.keys(table)) {
            if (out[name]) continue;
            out[name] = Object.freeze({ ...(WORLD_META[name] || e('理智', 'general')), origin: 'world' });
        }
    }
    return Object.freeze(out);
}

export const BUILTIN_SKILLS = buildBuiltin();
export const CORE_SKILL_NAMES = Object.freeze(Object.keys(CORE).filter((name) => !DEFAULT_SPECIAL_SKILLS.includes(name)));

// 战斗技能（§7.3）：已学的取最高，属性始终可用。
export const COMBAT_SKILLS = Object.freeze(['格斗', '射击', '武艺', '剑术', '剑道', '枪械', '魔法', '咒语', '力量', '敏捷']);
export const DODGE_SKILLS = Object.freeze(['闪避', '敏捷']);

const ATTRIBUTE_ALIASES = Object.freeze({
    体质: '健康', 体力: '健康', 身体: '健康', 力气: '力量', 体能: '力量', 灵巧: '敏捷', 身手: '敏捷', 速度: '敏捷',
    智力: '理智', 智慧: '理智', 冷静: '理智', 意志: '理智', 感知: '观察', 洞察: '观察', 外貌: '魅力', 魅惑力: '魅力',
});

export function normalizeAttribute(raw) {
    const text = String(raw ?? '').trim();
    if (BASE_ATTRIBUTES.includes(text)) return text;
    return ATTRIBUTE_ALIASES[text] || null;
}

export function validSkillName(raw) {
    const name = String(raw ?? '').trim().replace(/(?:检定|技能)$/, '');
    return NAME.test(name) && !RESERVED.has(name) ? name : null;
}

// 猜所属属性与类别：只在标签与生成结果都没给属性时用；猜过的标记 guessed，补全时让模型确认。
const GUESS = [
    [/剑|刀|拳|武|搏|斗|摔|举|扛|砍|劈/, '力量'],
    [/射|枪|弓|驾|骑|偷|盗|锁|躲|潜|爬|跳|舞|手|飞/, '敏捷'],
    [/医|药|学|算|修|骇|机|术|法|咒|文|史|识|计|阵|符|炼/, '理智'],
    [/察|看|听|侦|搜|追|感|觉|卜/, '观察'],
    [/说|骗|谈|演|唱|魅|诱|吓|礼|交|歌|讲/, '魅力'],
    [/跑|游|耐|忍|酒|饮|扛/, '健康'],
];

export function guessAttribute(name) {
    for (const [pattern, attribute] of GUESS) if (pattern.test(name)) return attribute;
    return null;
}

export function guessCategory(name) {
    if (/魔|咒|法术|灵|神|仙|妖|符|阵/.test(name)) return 'rare';
    if (/医|药|锁|骇|驾|机械|术|炼/.test(name)) return 'pro';
    return 'general';
}

function storyEntries(story) {
    return Array.isArray(story) ? story.filter((s) => s && typeof s.name === 'string') : [];
}

// catalog：{ story: [{ name, attribute, category, aliases, createdAt, guessed }], merged: { 旧名: 新名 } }
export function createSkillRegistry(catalog = {}) {
    const story = storyEntries(catalog.story);
    const merged = catalog.merged && typeof catalog.merged === 'object' ? catalog.merged : {};
    const map = new Map(Object.entries(BUILTIN_SKILLS));
    for (const s of story) {
        if (map.has(s.name)) continue;
        map.set(s.name, Object.freeze({
            kind: 'skill', attribute: normalizeAttribute(s.attribute) || '敏捷', category: CATEGORY_BASE[s.category] !== undefined ? s.category : 'general',
            aliases: Object.freeze(Array.isArray(s.aliases) ? s.aliases.filter((a) => typeof a === 'string') : []),
            social: s.social === true, origin: 'story', createdAt: s.createdAt, guessed: s.guessed === true,
        }));
    }
    const alias = new Map();
    for (const [name, entry] of map) for (const a of entry.aliases || []) if (!map.has(a) && !alias.has(a)) alias.set(a, name);
    for (const [from, to] of Object.entries(merged)) if (map.has(to)) alias.set(from, to);
    function resolve(raw) {
        const name = validSkillName(raw);
        if (!name) return null;
        if (map.has(name)) return name;
        if (alias.has(name)) return alias.get(name);
        const attribute = normalizeAttribute(name);
        return attribute || null;
    }
    return {
        get: (name) => map.get(name) || null,
        has: (name) => map.has(name),
        resolve,
        entries: () => [...map.entries()],
        story: () => story.slice(),
        merged: () => ({ ...merged }),
        aliasPairs: () => [...alias.entries()],
    };
}

// CoC 未学基础值：官方同名技能取官方值，其余按类别；闪避按敏捷 / 2。
export function baseValueOf(entry, attributes = {}) {
    if (!entry) return CATEGORY_BASE.general;
    if (entry.kind === 'attribute') return Number(attributes[entry.attribute]) || 50;
    if (entry.base === 'half-dex') return Math.max(1, Math.floor((Number(attributes.敏捷) || 50) / 2));
    if (Number.isFinite(entry.base)) return entry.base;
    return CATEGORY_BASE[entry.category] ?? CATEGORY_BASE.general;
}

// 登记剧情新技能（§6.1）：先归并到已有技能，命中不了才新建；超出上限返回 capped。
export function registerStorySkill(catalog, raw, { attribute, category, floor = null, createdThisFloor = 0 } = {}) {
    const registry = createSkillRegistry(catalog);
    const name = validSkillName(raw);
    if (!name) return { catalog, name: null, created: false, reason: 'invalid' };
    const existing = registry.resolve(name);
    if (existing) return { catalog, name: existing, created: false, reason: 'known' };
    const story = storyEntries(catalog.story);
    if (story.length >= STORY_SKILL_MAX) return { catalog, name: null, created: false, reason: 'capped' };
    if (createdThisFloor >= STORY_SKILL_PER_FLOOR) return { catalog, name: null, created: false, reason: 'floor-capped' };
    const attr = normalizeAttribute(attribute) || guessAttribute(name);
    const entry = {
        name, attribute: attr || '敏捷', category: CATEGORY_BASE[category] !== undefined ? category : guessCategory(name),
        aliases: [], createdAt: floor, guessed: !normalizeAttribute(attribute),
    };
    return { catalog: { ...catalog, story: [...story, entry] }, name, created: true, entry, reason: 'created' };
}

export function editStorySkill(catalog, name, patch = {}) {
    const story = storyEntries(catalog.story);
    const index = story.findIndex((s) => s.name === name);
    if (index < 0) return catalog;
    const cur = story[index];
    const next = { ...cur };
    const rename = patch.name !== undefined ? validSkillName(patch.name) : null;
    if (rename && rename !== cur.name && !createSkillRegistry(catalog).has(rename)) next.name = rename;
    if (patch.attribute !== undefined && normalizeAttribute(patch.attribute)) { next.attribute = normalizeAttribute(patch.attribute); next.guessed = false; }
    if (patch.category !== undefined && CATEGORY_BASE[patch.category] !== undefined) next.category = patch.category;
    const list = story.slice();
    list[index] = next;
    const merged = next.name !== cur.name ? { ...(catalog.merged || {}), [cur.name]: next.name } : catalog.merged;
    return { ...catalog, story: list, ...(merged ? { merged } : {}) };
}

// 合并：删掉剧情技能本身，旧名以后归并到目标技能。
export function mergeStorySkill(catalog, from, to) {
    const registry = createSkillRegistry(catalog);
    if (!registry.has(to) || from === to) return catalog;
    const story = storyEntries(catalog.story).filter((s) => s.name !== from);
    return { ...catalog, story, merged: { ...(catalog.merged || {}), [from]: to } };
}

export function removeStorySkill(catalog, name) {
    const story = storyEntries(catalog.story);
    if (!story.some((s) => s.name === name)) return catalog;
    return { ...catalog, story: story.filter((s) => s.name !== name) };
}
