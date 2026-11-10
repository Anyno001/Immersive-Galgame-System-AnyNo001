// 技能注册表（数值 v2 §3.2、附录 A）：内置条目写在代码里，剧情中新出现的技能存在聊天级 catalog.story。
// 每条：所属属性、类别（决定 CoC 未学基础值）、是否社交、默认对抗技能、别名。纯函数，返回新对象不改入参。
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS } from './stat-state.js';
import { WORLDVIEW_SPECIAL_SKILLS } from './stat-world-skills.js';

export const CATEGORY_BASE = Object.freeze({ daily: 25, general: 15, pro: 5, rare: 1 });
export const CATEGORY_LABEL = Object.freeze({ daily: '日常', general: '通用', pro: '专业', rare: '稀有' });
export const STORY_SKILL_MAX = 24;
export const STORY_SKILL_PER_FLOOR = 2;
// 旧属性名到新六维名的映射（旧存档、旧表格列、旧提示词里的叫法）。
export const LEGACY_ATTRIBUTE_MAP = Object.freeze({ 健康: '体质', 理智: '智力', 观察: '感知' });
// 旧技能名到新技能名的映射：旧存档里以旧名为键的值，读入时落到新名（不遍历改写存档）。
export const LEGACY_SKILL_MAP = Object.freeze({
    妙手: '顺手牵羊', 医疗: '医术', 急救: '医术', 机械: '修理', 电子学: '修理', 骇入: '电脑', 枪械: '射击', 武艺: '格斗', 剑道: '剑术', 咒语: '魔法',
    礼法: '礼仪', 求生: '野外求生', 文学: '写作', 图书馆: '查资料', 心理学: '察言观色', 估价: '鉴定', 乔装: '伪装',
    酒量: '喝酒', 照顾宠物: '养宠物', 记路: '认路', 开溜: '逃跑', 下黑手: '偷袭', 画大饼: '忽悠', 看人下菜碟: '察言观色', 装病: '演戏', 装可怜: '演戏',
});
// 多个旧名（或旧名与新名）都有值时合并：数值取大，{ value } 条目取值大的一份并合并 marked，其余以新名自己的为准。
export function mergeLegacyValue(existing, incoming, incomingIsOwn = false) {
    const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (typeof existing === 'number' && typeof incoming === 'number') return Math.max(existing, incoming);
    if (typeof existing === 'boolean' && typeof incoming === 'boolean') return existing || incoming;
    if (isObj(existing) && isObj(incoming) && Number.isFinite(Number(existing.value)) && Number.isFinite(Number(incoming.value))) {
        const best = Number(incoming.value) > Number(existing.value) ? incoming : existing;
        return 'marked' in existing || 'marked' in incoming ? { ...best, marked: existing.marked === true || incoming.marked === true } : { ...best };
    }
    return incomingIsOwn ? incoming : existing;
}
export const canonicalSkillName = (name) => (typeof name === 'string' && Object.hasOwn(LEGACY_SKILL_MAP, name) ? LEGACY_SKILL_MAP[name] : name);
const NAME = /^[^\s0-9０-９.\[\]{}<>|:："'`\\/]{1,8}$/;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

const e = (attribute, category, extra = {}) => Object.freeze({ attribute, category, aliases: Object.freeze(extra.aliases || []), ...extra, kind: 'skill' });

// base：官方表里有的同名技能用官方基础值；'half-dex' 为闪避（敏捷 / 2）。
const CORE = {
    烹饪: e('智力', 'daily', { aliases: ['厨艺', '做菜'] }),
    家务: e('体质', 'daily'),
    学习: e('智力', 'daily'),
    运动: e('力量', 'daily', { aliases: ['体育', '游泳'] }),
    艺术: e('魅力', 'general', { aliases: ['表演', '演奏', '绘画'] }),
    话术: e('魅力', 'general', { social: true, opposedBy: '察言观色', aliases: ['说服', '劝说', '谈判', '口才', '交涉'] }),
    照顾: e('感知', 'daily', { aliases: ['看护', '护理'] }),
    应变: e('智力', 'general', { aliases: ['急智', '随机应变'] }),
    侦查: e('感知', 'general', { base: 25, aliases: ['搜查', '调查', '搜索', '察觉', '侦察'] }),
    聆听: e('感知', 'general', { base: 20, aliases: ['倾听', '偷听'] }),
    察言观色: e('感知', 'general', { base: 10, aliases: ['心理学', '洞悉', '看穿', '识破', '看人下菜碟'] }),
    医术: e('智力', 'general', { base: 30, aliases: ['医疗', '急救', '治疗', '医学', '中医', '包扎', '止血'] }),
    潜行: e('敏捷', 'general', { base: 20, opposedBy: '侦查', aliases: ['隐匿', '潜入', '躲藏'] }),
    闪避: e('敏捷', 'general', { base: 'half-dex', aliases: ['躲闪'] }),
    攀爬: e('力量', 'general', { base: 20, aliases: ['攀登', '爬墙', '运动能力'] }),
    格斗: e('力量', 'general', { base: 25, opposedBy: '闪避', aliases: ['斗殴', '搏斗', '肉搏', '近战', '武艺', '武功', '武术'] }),
    射击: e('敏捷', 'general', { base: 20, opposedBy: '闪避', aliases: ['射箭', '弓术', '枪械', '枪法'] }),
    恐吓: e('魅力', 'general', { base: 15, social: true, opposedBy: '感知', aliases: ['威胁', '威吓'] }),
    魅惑: e('魅力', 'general', { base: 15, social: true, opposedBy: '察言观色', aliases: ['勾引', '调情', '诱惑'] }),
    开锁: e('敏捷', 'pro', { base: 1, aliases: ['撬锁'] }),
    驾驶: e('敏捷', 'general', { base: 20, aliases: ['开车', '驾车', '汽车驾驶'] }),
    // 都市常用的 CoC 技能（基础值取官方表）。
    电脑: e('智力', 'pro', { base: 5, aliases: ['计算机', '编程', '骇入', '黑客', '入侵'] }),
    查资料: e('智力', 'general', { base: 20, aliases: ['图书馆', '图书馆使用', '检索'] }),
    伪装: e('魅力', 'general', { base: 5, aliases: ['乔装', '易容'] }),
    顺手牵羊: e('敏捷', 'pro', { base: 10, aliases: ['妙手', '扒窃', '偷东西'] }),
    投掷: e('敏捷', 'general', { base: 20 }),
    法律: e('智力', 'pro', { base: 5 }),
    财务: e('智力', 'general', { base: 5, aliases: ['会计', '理财'] }),
    外语: e('智力', 'general', { base: 1, aliases: ['英语', '日语'] }),
    鉴定: e('智力', 'pro', { base: 5, aliases: ['估价'] }),
    跳跃: e('力量', 'general', { base: 20 }),
    追踪: e('感知', 'general', { base: 10, aliases: ['寻踪'] }),
    // 日常与生活技能（无官方值，基础值按类别）。
    唱歌: e('魅力', 'general'),
    舞蹈: e('敏捷', 'general'),
    摄影: e('感知', 'general'),
    写作: e('智力', 'general', { aliases: ['文学'] }),
    手工: e('敏捷', 'general'),
    化妆: e('魅力', 'general'),
    穿搭: e('魅力', 'daily'),
    园艺: e('体质', 'general'),
    养宠物: e('感知', 'daily', { aliases: ['照顾宠物'] }),
    喝酒: e('体质', 'daily', { aliases: ['酒量'] }),
    安抚: e('魅力', 'general', { social: true }),
    八卦: e('魅力', 'daily', { social: true }),
    撒娇: e('魅力', 'general', { social: true, opposedBy: '察言观色' }),
    游戏: e('敏捷', 'daily'),
    棋牌: e('智力', 'general'),
    记忆: e('智力', 'general'),
    讲故事: e('魅力', 'general'),
    演讲: e('魅力', 'general', { social: true }),
    调酒: e('敏捷', 'pro'),
    按摩: e('敏捷', 'general'),
    砍价: e('魅力', 'general', { social: true, opposedBy: '察言观色' }),
    修理: e('智力', 'general', { aliases: ['机械', '机械维修', '维修', '电子学', '电工'] }),
    带娃: e('感知', 'general'),
    认路: e('感知', 'general', { aliases: ['记路'] }),
    // 歪门邪道技能。
    撒谎: e('魅力', 'general', { social: true, opposedBy: '察言观色', aliases: ['欺骗', '哄骗'] }),
    勒索: e('魅力', 'general', { social: true, opposedBy: '察言观色', aliases: ['敲诈'] }),
    挑拨: e('魅力', 'general', { social: true, aliases: ['离间'] }),
    造谣: e('魅力', 'general', { social: true, aliases: ['散布谣言'] }),
    演戏: e('魅力', 'general', { social: true, aliases: ['装病', '装晕', '装死', '装可怜', '卖惨'] }),
    甩锅: e('魅力', 'general', { social: true }),
    忽悠: e('魅力', 'general', { social: true, aliases: ['画大饼'] }),
    道德绑架: e('魅力', 'general', { social: true }),
    套话: e('魅力', 'general', { social: true, opposedBy: '察言观色' }),
    拍马屁: e('魅力', 'general', { social: true, aliases: ['奉承', '讨好'] }),
    煽动: e('魅力', 'general', { social: true, aliases: ['起哄'] }),
    精神控制: e('魅力', 'rare', { social: true, opposedBy: '察言观色', aliases: ['洗脑', '操控'] }),
    下药: e('智力', 'pro'),
    伪造: e('智力', 'pro', { aliases: ['假证', '仿签名'] }),
    诈骗: e('智力', 'general', { aliases: ['骗钱'] }),
    销毁证据: e('智力', 'general'),
    黑话: e('智力', 'general', { aliases: ['暗语'] }),
    尾随: e('敏捷', 'general', { opposedBy: '侦查', aliases: ['跟踪', '盯梢'] }),
    偷拍: e('敏捷', 'general'),
    作弊: e('敏捷', 'general', { opposedBy: '侦查', aliases: ['抄袭', '打小抄', '出老千'] }),
    逃跑: e('敏捷', 'general', { aliases: ['开溜', '溜号'] }),
    赌博: e('感知', 'general'),
    偷袭: e('力量', 'general', { opposedBy: '侦查', aliases: ['下黑手', '暗算'] }),
};

// 世界观附加技能：与核心同名的（急救、潜行、驾驶）沿用核心条目。
const WORLD_META = {
    书画: e('魅力', 'general'),
    礼仪: e('魅力', 'general', { social: true, aliases: ['礼法'] }),
    剑术: e('力量', 'general', { opposedBy: '闪避', aliases: ['剑道'] }),
    魔法: e('智力', 'rare', { opposedBy: '闪避', aliases: ['法术', '施法', '咒语'] }),
    骑术: e('敏捷', 'general', { aliases: ['骑马'] }),
    野外求生: e('体质', 'general', { aliases: ['生存', '求生'] }),
    魔药: e('智力', 'pro', { aliases: ['炼金', '药剂'] }),
    飞行: e('敏捷', 'pro'),
    占卜: e('感知', 'rare'),
    茶道: e('感知', 'pro'),
    驱邪: e('智力', 'rare'),
    灵感: e('感知', 'rare'),
};

function buildBuiltin() {
    const out = {};
    for (const name of BASE_ATTRIBUTES) out[name] = Object.freeze({ kind: 'attribute', attribute: name, category: 'general', aliases: Object.freeze([]), social: name === '魅力' });
    for (const [name, entry] of Object.entries(CORE)) out[name] = Object.freeze({ ...entry, origin: DEFAULT_SPECIAL_SKILLS.includes(name) ? 'builtin' : 'core' });
    for (const table of Object.values(WORLDVIEW_SPECIAL_SKILLS)) {
        for (const name of Object.keys(table)) {
            if (out[name]) continue;
            out[name] = Object.freeze({ ...(WORLD_META[name] || e('智力', 'general')), origin: 'world' });
        }
    }
    return Object.freeze(out);
}

export const BUILTIN_SKILLS = buildBuiltin();
export const CORE_SKILL_NAMES = Object.freeze(Object.keys(CORE).filter((name) => !DEFAULT_SPECIAL_SKILLS.includes(name)));

// 战斗技能（§7.3）：已学的取最高，属性始终可用。
export const COMBAT_SKILLS = Object.freeze(['格斗', '射击', '剑术', '魔法', '力量', '敏捷']);
export const DODGE_SKILLS = Object.freeze(['闪避', '敏捷']);

const ATTRIBUTE_ALIASES = Object.freeze({
    健康: '体质', 体力: '体质', 身体: '体质', 力气: '力量', 体能: '力量', 灵巧: '敏捷', 身手: '敏捷', 速度: '敏捷',
    理智: '智力', 智慧: '智力', 冷静: '智力', 意志: '感知', 观察: '感知', 洞察: '感知', 外貌: '魅力', 魅惑力: '魅力',
});

// CoC第七版里「理智」是独立的第七项属性（SAN），不并入智力。
export const COC_SAN_NAME = '理智';

function isCocRuleset(ruleset) {
    const id = ruleset && typeof ruleset === 'object' ? ruleset.ID : ruleset;
    return id === 'coc7';
}

// 归一属性名。options.ruleset 为 'coc7'（或带 ID 的规则集对象）时，「理智」保持为「理智」，其余同 v0.39。
export function normalizeAttribute(raw, { ruleset = null } = {}) {
    const text = String(raw ?? '').trim();
    if (BASE_ATTRIBUTES.includes(text)) return text;
    if (text === COC_SAN_NAME && isCocRuleset(ruleset)) return COC_SAN_NAME;
    return ATTRIBUTE_ALIASES[text] || null;
}

// CoC专用：属性名归一，「理智」保留。等价于 normalizeAttribute(raw, { ruleset: 'coc7' })。
export function cocAttributeOf(raw) {
    return normalizeAttribute(raw, { ruleset: 'coc7' });
}

export function validSkillName(raw) {
    const name = String(raw ?? '').trim().replace(/(?:检定|技能)$/, '');
    return NAME.test(name) && !RESERVED.has(name) ? name : null;
}

// 猜所属属性与类别：只在标签与生成结果都没给属性时用；猜过的标记 guessed，补全时让模型确认。
const GUESS = [
    [/剑|刀|拳|武|搏|斗|摔|举|扛|砍|劈/, '力量'],
    [/射|枪|弓|驾|骑|偷|盗|锁|躲|潜|爬|跳|舞|手|飞/, '敏捷'],
    [/医|药|学|算|修|骇|机|术|法|咒|文|史|识|计|阵|符|炼/, '智力'],
    [/察|看|听|侦|搜|追|感|觉|卜/, '感知'],
    [/说|骗|谈|演|唱|魅|诱|吓|礼|交|歌|讲/, '魅力'],
    [/跑|游|耐|忍|酒|饮|扛/, '体质'],
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
    // 玩家给内置技能改的所属属性（catalog.attributes：{ 技能: 属性 }）；剧情技能改属性直接写在 story 条目里。
    const attrs = catalog.attributes && typeof catalog.attributes === 'object' ? catalog.attributes : {};
    for (const [name, raw] of Object.entries(attrs)) {
        const entry = map.get(name);
        const attribute = normalizeAttribute(raw);
        if (entry && entry.kind === 'skill' && attribute) map.set(name, Object.freeze({ ...entry, attribute }));
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
// exact：玩家自定义的技能只认同名，不按别名归并（如东方世界观的「法术」不并进「魔法」）；与六维同名的照旧拒绝。
export function registerStorySkill(catalog, raw, { attribute, category, floor = null, createdThisFloor = 0, exact = false } = {}) {
    const registry = createSkillRegistry(catalog);
    const name = validSkillName(raw);
    if (!name) return { catalog, name: null, created: false, reason: 'invalid' };
    const existing = exact ? (registry.has(name) ? name : normalizeAttribute(name) || null) : registry.resolve(name);
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
