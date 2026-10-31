import { DEFAULT_HTML_CARD_TAGS, extractHtmlCards, parseHtmlCardMarker } from './html-cards.js';
import { extractChatBlocks, parseChatMarker } from './chat-blocks.js';
import { readerBodyText } from './message-source.js';
import { stripIllustrationMarkers } from './scene-directives.js';

// 战斗标签 [igs-combat:类型|栏位…]。开战标签只在正文最后一个非空行生效；成长标签可出现在正文任意位置。
// 依赖方向是 combat → scene，这里不导入 combat；上限与 COMBAT_RULES 的一致性由 combat-directives.test.js 锁定。
export const COMBAT_TAG_LIMITS = Object.freeze({ maxEnemies: 50, maxAllies: 3, storyExpCapPerFloor: 50, expMax: 1000 });
// loot 只由程序写在胜利战报块之后（翻牌兑现），账本只认战报楼里的 loot；主模型不写。
export const COMBAT_GROWTH_KINDS = Object.freeze(['exp', 'learn', 'upgrade', 'class', 'equip', 'unequip', 'item', 'rel', 'stat', 'loot', 'heal']);
const REPORT_ID_RE = /^r[0-9a-z]{1,13}$/;
// 六维：中文名或内部键 → 内部键（与 combat/abilities.js 一致，由测试锁定）。stat 点数 1–2，每楼每角色合计不超过 2。
export const COMBAT_ABILITY_WORDS = Object.freeze({
    力量: 'str', 敏捷: 'dex', 体质: 'con', 智力: 'int', 感知: 'wis', 魅力: 'cha',
    str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha', 自由: 'free', free: 'free',
});
export const COMBAT_STAT_CAP_PER_FLOOR = 2;
// 相对强度档：中文名或内部键 → 内部键（与 combat/abilities.js 的 REL_TIERS 一致，由测试锁定）。
export const COMBAT_REL_TIERS = Object.freeze({
    远逊: 'outclassed', 稍弱: 'weaker', 相当: 'even', 稍强: 'stronger', 强敌: 'formidable', 碾压: 'overwhelming',
    outclassed: 'outclassed', weaker: 'weaker', even: 'even', stronger: 'stronger', formidable: 'formidable', overwhelming: 'overwhelming',
});
// 装备部位：中文名或内部键 → 内部键；每部位同时只装 1 件。一次性道具每条标签数量 1–3。
export const COMBAT_GEAR_SLOTS = Object.freeze({ 武器: 'weapon', 防具: 'armor', 饰品: 'accessory', 宝物: 'treasure', weapon: 'weapon', armor: 'armor', accessory: 'accessory', treasure: 'treasure' });
export const COMBAT_ITEM_COUNT_MAX = 3;
// 正文获得物稀有度（equip / item / learn 末栏，可省略）：中文名或内部键 → 内部键（与 combat 的五档池稀有度一致，由测试锁定）。
export const COMBAT_RARITY_WORDS = Object.freeze({
    普通: 'common', 罕见: 'uncommon', 稀有: 'rare', 史诗: 'epic', 神话: 'mythic',
    common: 'common', uncommon: 'uncommon', rare: 'rare', epic: 'epic', mythic: 'mythic',
});
export const COMBAT_TIERS = Object.freeze({ 普通: 'normal', normal: 'normal', 精英: 'elite', elite: 'elite', 首领: 'boss', boss: 'boss' });
// 觉醒类型：中文名 → 内部键。台词上限 30 字。
export const COMBAT_AWAKEN_TYPES = Object.freeze({
    怒火: 'rage', 守护: 'guard', 悲恸: 'grief', 决意: 'resolve', 羁绊: 'bond', 极限: 'limit', 复仇: 'vengeance', 不屈: 'unyielding',
});
const AWAKEN_LOOKUP = Object.freeze(Object.fromEntries(Object.entries(COMBAT_AWAKEN_TYPES).flatMap(([name, key]) => [[name, key], [key, key]])));
const AWAKEN_LINE_MAX = 30;

const TAG_RE = /\[igs-combat:([^\]\n]*)\]/g;
const LIST_SPLIT_RE = /[,，、;；]+/;
const COUNT_RE = /^(.+?)\s*[*＊×]\s*([0-9０-９]+)$/;
const INT_RE = /^\d{1,6}$/;
const NAME_MAX = 20;
const TEXT_MAX = 80;
const CLASS_MAX = 12;

const toHalfDigits = (value) => String(value).replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
const fits = (value, max) => typeof value === 'string' && value.length >= 1 && value.length <= max;
const invalid = (field, problem) => ({ ok: false, field, problem });

// FNV-1a 32 位，转 36 进制，结果满足日志锚点 tagHash 的 ID 格式。
function tagHashOf(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

function cardTags(value) {
    return String(value ?? DEFAULT_HTML_CARD_TAGS).split(/[\n,，]+/).map((tag) => tag.trim()).filter(Boolean);
}

function dropMarkerLines(text, parseMarker) {
    return text.split('\n').filter((line) => parseMarker(line) < 0).join('\n');
}

// 与阅读器同一套正文来源：剔除生图标记、HTML 卡片、排除块与聊天块后的正文，锚点也以它为准。
export function combatBodyText(raw, options = {}) {
    const filter = options.sourceFilter;
    const cards = extractHtmlCards(stripIllustrationMarkers(raw), cardTags(filter?.htmlCardTags)).text;
    const body = readerBodyText(dropMarkerLines(cards, parseHtmlCardMarker), filter);
    return dropMarkerLines(extractChatBlocks(body).text, parseChatMarker);
}

// tagHash 由规范化后的类型与栏位计算，occurrence 为同一 tagHash 在本楼的序号，二者组成日志锚点。
export function scanCombatTags(body) {
    const source = String(body || '');
    const counts = new Map();
    const tags = [];
    for (const match of source.matchAll(TAG_RE)) {
        const [kindField, ...fields] = match[1].split('|').map((field) => field.trim());
        const kind = kindField.toLowerCase();
        const tagHash = tagHashOf([kind, ...fields].join('|'));
        const occurrence = counts.get(tagHash) || 0;
        counts.set(tagHash, occurrence + 1);
        tags.push({ kind, fields, raw: match[0], index: match.index, tagHash, occurrence });
    }
    return tags;
}

function intIn(value, min, max) {
    const text = toHalfDigits(value ?? '').trim();
    if (!INT_RE.test(text)) return null;
    const n = Number(text);
    return n >= min && n <= max ? n : null;
}

function textIn(field, value, max, required) {
    const text = String(value ?? '').trim();
    if (!text) return required ? invalid(field, 'required') : { ok: true, value: '' };
    return text.length <= max ? { ok: true, value: text } : invalid(field, 'too-long');
}

const listOf = (field) => String(field || '').split(LIST_SPLIT_RE).map((part) => part.trim()).filter(Boolean);

function parseEnemies(field) {
    const units = [];
    let total = 0;
    for (const part of listOf(field)) {
        const m = part.match(COUNT_RE);
        const name = (m ? m[1] : part).trim();
        const count = m ? intIn(m[2], 1, 99) : 1;
        if (!fits(name, NAME_MAX)) return invalid('enemies', 'invalid-name');
        if (count === null) return invalid('enemies', 'invalid-count');
        total += count;
        const same = units.find((unit) => unit.name === name);
        if (same) same.count += count;
        else units.push({ name, count });
    }
    if (!units.length) return invalid('enemies', 'required');
    if (total > COMBAT_TAG_LIMITS.maxEnemies) return invalid('enemies', 'too-many');
    return { ok: true, value: units };
}

function parseAllies(field) {
    const names = [...new Set(listOf(field))];
    if (names.some((name) => !fits(name, NAME_MAX))) return invalid('allies', 'invalid-name');
    if (names.length > COMBAT_TAG_LIMITS.maxAllies) return invalid('allies', 'too-many');
    return { ok: true, value: names };
}

function parseStart(fields) {
    if (fields.length > 4) return invalid('fields', 'too-many-fields');
    const encounter = textIn('encounter', fields[0], NAME_MAX, true);
    if (!encounter.ok) return encounter;
    const enemies = parseEnemies(fields[1]);
    if (!enemies.ok) return enemies;
    const allies = parseAllies(fields[2]);
    if (!allies.ok) return allies;
    const tierWord = String(fields[3] ?? '').trim().toLowerCase();
    if (tierWord && !Object.hasOwn(COMBAT_TIERS, tierWord)) return invalid('tier', 'unknown-tier');
    const tier = tierWord ? COMBAT_TIERS[tierWord] : 'normal';
    return { ok: true, value: { encounter: encounter.value, enemies: enemies.value, allies: allies.value, tier } };
}

const GROWTH_FIELD_MAX = Object.freeze({ exp: 3, learn: 4, upgrade: 3, class: 2, equip: 5, unequip: 2, item: 5, rel: 2, stat: 4, loot: 4, heal: 3 });
// 剧情回血点数上限（百分比为 1–100）；不设每楼上限（助手 10-29）。
const HEAL_MAX = 9999;

// 末栏稀有度：留空时不带 rarity 键（走旧路径），写了未登记的稀有度整条拒收。
function rarityIn(value) {
    const word = String(value ?? '').trim().toLowerCase();
    if (!word) return { ok: true, value: null };
    return Object.hasOwn(COMBAT_RARITY_WORDS, word) ? { ok: true, value: COMBAT_RARITY_WORDS[word] } : invalid('rarity', 'unknown-rarity');
}
const withRarity = (value, rarity) => (rarity ? { ...value, rarity } : value);

// equip|角色|名称|部位|简述|稀有度、unequip|角色|名称、item|角色|名称|数量|简述|稀有度（数量缺省为 1，稀有度可省略）。
function parseGear(kind, base, fields) {
    const name = textIn('name', fields[1], NAME_MAX, true);
    if (!name.ok) return name;
    const value = { ...base, name: name.value };
    if (kind === 'unequip') return { ok: true, value };
    if (kind === 'equip') {
        const word = String(fields[2] ?? '').trim().toLowerCase();
        if (!word) return invalid('slot', 'required');
        if (!Object.hasOwn(COMBAT_GEAR_SLOTS, word)) return invalid('slot', 'unknown-slot');
        const description = textIn('description', fields[3], TEXT_MAX, false);
        if (!description.ok) return description;
        const rarity = rarityIn(fields[4]);
        return rarity.ok ? { ok: true, value: withRarity({ ...value, slot: COMBAT_GEAR_SLOTS[word], description: description.value }, rarity.value) } : rarity;
    }
    const rawCount = String(fields[2] ?? '').trim();
    const count = rawCount ? intIn(rawCount, 1, COMBAT_ITEM_COUNT_MAX) : 1;
    if (count === null) return invalid('count', 'invalid-count');
    const description = textIn('description', fields[3], TEXT_MAX, false);
    if (!description.ok) return description;
    const rarity = rarityIn(fields[4]);
    return rarity.ok ? { ok: true, value: withRarity({ ...value, count, description: description.value }, rarity.value) } : rarity;
}

function parseGrowth(kind, fields) {
    if (fields.length > GROWTH_FIELD_MAX[kind]) return invalid('fields', 'too-many-fields');
    const character = textIn('character', fields[0], NAME_MAX, true);
    if (!character.ok) return character;
    const base = { character: character.value };
    if (kind === 'equip' || kind === 'unequip' || kind === 'item') return parseGear(kind, base, fields);
    // loot|角色|战报ID|槽位|main 或 reserve（缺省 main）。
    if (kind === 'loot') {
        const reportId = String(fields[1] ?? '').trim();
        if (!REPORT_ID_RE.test(reportId)) return invalid('reportId', 'invalid-report-id');
        const slot = intIn(fields[2], 0, 3);
        if (slot === null) return invalid('slot', 'invalid-slot');
        const set = String(fields[3] ?? '').trim() || 'main';
        if (set !== 'main' && set !== 'reserve') return invalid('set', 'unknown-set');
        return { ok: true, value: { ...base, reportId, slot, set } };
    }
    // heal|角色|恢复量|原因：恢复量写点数，或带 % 写生命上限的百分比（全角数字与 ％ 都认）。
    if (kind === 'heal') {
        const raw = toHalfDigits(fields[1] ?? '').trim().replace(/％/g, '%');
        const percent = raw.endsWith('%');
        const amount = intIn(percent ? raw.slice(0, -1) : raw, 1, percent ? 100 : HEAL_MAX);
        if (amount === null) return invalid('amount', 'invalid-amount');
        const reason = textIn('reason', fields[2], TEXT_MAX, false);
        return reason.ok ? { ok: true, value: { ...base, amount, mode: percent ? 'percent' : 'flat', reason: reason.value } } : reason;
    }
    if (kind === 'exp') {
        const amount = intIn(fields[1], 1, COMBAT_TAG_LIMITS.expMax);
        if (amount === null) return invalid('amount', 'invalid-amount');
        const reason = textIn('reason', fields[2], TEXT_MAX, false);
        return reason.ok ? { ok: true, value: { ...base, amount, reason: reason.value } } : reason;
    }
    if (kind === 'class') {
        const className = textIn('className', fields[1], CLASS_MAX, true);
        return className.ok ? { ok: true, value: { ...base, className: className.value } } : className;
    }
    // rel|角色|档、stat|角色|属性|点数|原因。
    if (kind === 'rel') {
        const word = String(fields[1] ?? '').trim().toLowerCase();
        if (!word) return invalid('tier', 'required');
        return Object.hasOwn(COMBAT_REL_TIERS, word) ? { ok: true, value: { ...base, tier: COMBAT_REL_TIERS[word] } } : invalid('tier', 'unknown-tier');
    }
    if (kind === 'stat') {
        const word = String(fields[1] ?? '').trim().toLowerCase();
        if (!word) return invalid('ability', 'required');
        if (!Object.hasOwn(COMBAT_ABILITY_WORDS, word)) return invalid('ability', 'unknown-ability');
        const amount = intIn(fields[2], 1, COMBAT_STAT_CAP_PER_FLOOR);
        if (amount === null) return invalid('amount', 'invalid-amount');
        const reason = textIn('reason', fields[3], TEXT_MAX, false);
        return reason.ok ? { ok: true, value: { ...base, ability: COMBAT_ABILITY_WORDS[word], amount, reason: reason.value } } : reason;
    }
    const skill = textIn('skill', fields[1], NAME_MAX, true);
    if (!skill.ok) return skill;
    const description = textIn('description', fields[2], TEXT_MAX, false);
    if (!description.ok) return description;
    const value = { ...base, skill: skill.value, description: description.value };
    if (kind !== 'learn') return { ok: true, value };
    const rarity = rarityIn(fields[3]);
    return rarity.ok ? { ok: true, value: withRarity(value, rarity.value) } : rarity;
}

function parseAwaken(fields) {
    if (fields.length > 3) return invalid('fields', 'too-many-fields');
    const character = textIn('character', fields[0], NAME_MAX, true);
    if (!character.ok) return character;
    const word = String(fields[1] ?? '').trim().toLowerCase();
    if (!word) return invalid('type', 'required');
    if (!Object.hasOwn(AWAKEN_LOOKUP, word)) return invalid('type', 'unknown-type');
    const line = textIn('line', fields[2], AWAKEN_LINE_MAX, false);
    if (!line.ok) return line;
    return { ok: true, value: { character: character.value, type: AWAKEN_LOOKUP[word], line: line.value } };
}

const anchorOf = (tag) => ({ tagHash: tag.tagHash, occurrence: tag.occurrence, index: tag.index });

function lastNonEmptyLine(body) {
    const lines = String(body || '').split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i].trim()) return lines[i].trim();
    return '';
}

// 觉醒标签：只认开战标签上一非空行恰为一条完整 awaken 标签的那一条（同楼、每场最多一个）；
// 其余 awaken 记 combat-awaken-misplaced，栏位非法记 combat-awaken-invalid。不影响开战标签本身的锚点。
function awakenAbove(body, tags, start, diagnostics) {
    const awakens = tags.filter((tag) => tag.kind === 'awaken');
    if (!awakens.length) return null;
    const before = body.slice(0, start.index).trimEnd();
    const cand = awakens.at(-1);
    const adjacent = cand.index < start.index && cand.index + cand.raw.length === before.length && lastNonEmptyLine(before) === cand.raw;
    for (const tag of awakens) {
        if (tag !== cand || !adjacent) diagnostics.push({ code: 'combat-awaken-misplaced', ...anchorOf(tag) });
    }
    if (!adjacent) return null;
    const parsed = parseAwaken(cand.fields);
    if (!parsed.ok) {
        diagnostics.push({ code: 'combat-awaken-invalid', field: parsed.field, problem: parsed.problem, ...anchorOf(cand) });
        return null;
    }
    return { ...parsed.value, ...anchorOf(cand) };
}

// 开战标签：只有正文最后一个非空行恰好是一条完整的 [igs-combat:start|…] 才生效；其余开战标签只记诊断。
// 是否为最新 AI 楼由调用方判断，这里只看正文。
export function extractCombatStart(raw, options = {}) {
    const body = combatBodyText(raw, options);
    const tags = scanCombatTags(body);
    const starts = tags.filter((tag) => tag.kind === 'start');
    const diagnostics = [];
    const tail = lastNonEmptyLine(body);
    const last = starts.at(-1);
    const atTail = Boolean(last) && tail === last.raw && body.trimEnd().endsWith(last.raw);
    for (const tag of starts) {
        if (tag !== last || !atTail) diagnostics.push({ code: 'combat-start-not-tail', ...anchorOf(tag) });
    }
    if (!atTail) return { start: null, diagnostics };
    const parsed = parseStart(last.fields);
    if (!parsed.ok) {
        diagnostics.push({ code: 'combat-start-invalid', field: parsed.field, problem: parsed.problem, ...anchorOf(last) });
        return { start: null, diagnostics };
    }
    const start = { ...parsed.value, ...anchorOf(last) };
    const awaken = awakenAbove(body, tags, last, diagnostics);
    if (awaken) start.awaken = awaken;
    return { start, diagnostics };
}

// 成长标签：按正文顺序解析。剧情 EXP 每楼每角色累计封顶，超出部分截断并记诊断；
// 程序生成的战报楼由调用方传 { expCap: false} 跳过封顶；战报是用户楼、没有正文容器，传 { raw: true } 直接扫原文。
export function extractGrowthDirectives(raw, options = {}) {
    const body = options.raw === true ? String(raw || '') : combatBodyText(raw, options);
    const cap = options.expCap === false ? Infinity : COMBAT_TAG_LIMITS.storyExpCapPerFloor;
    const used = new Map();
    const statUsed = new Map();
    const directives = [];
    const diagnostics = [];
    for (const tag of scanCombatTags(body)) {
        // 开战与觉醒标签由 extractCombatStart 处理，不进成长账本。
        if (tag.kind === 'start' || tag.kind === 'awaken') continue;
        if (!COMBAT_GROWTH_KINDS.includes(tag.kind)) {
            diagnostics.push({ code: 'combat-tag-unknown', kind: tag.kind, ...anchorOf(tag) });
            continue;
        }
        const parsed = parseGrowth(tag.kind, tag.fields);
        if (!parsed.ok) {
            diagnostics.push({ code: 'combat-tag-invalid', kind: tag.kind, field: parsed.field, problem: parsed.problem, ...anchorOf(tag) });
            continue;
        }
        const value = { kind: tag.kind, ...parsed.value, ...anchorOf(tag) };
        if (tag.kind === 'exp') {
            const spent = used.get(value.character) || 0;
            const granted = Math.min(value.amount, Math.max(0, cap - spent));
            if (granted < value.amount) diagnostics.push({ code: 'combat-exp-capped', character: value.character, requested: value.amount, granted, ...anchorOf(tag) });
            if (!granted) continue;
            used.set(value.character, spent + granted);
            value.amount = granted;
        }
        if (tag.kind === 'stat') {
            const spent = statUsed.get(value.character) || 0;
            const granted = Math.min(value.amount, Math.max(0, COMBAT_STAT_CAP_PER_FLOOR - spent));
            if (granted < value.amount) diagnostics.push({ code: 'combat-stat-capped', character: value.character, requested: value.amount, granted, ...anchorOf(tag) });
            if (!granted) continue;
            statUsed.set(value.character, spent + granted);
            value.amount = granted;
        }
        directives.push(value);
    }
    return { directives, diagnostics };
}
// 战斗开启时的统一获得物 [igs-fx:item|获得|名称|描述|类别|稀有度]（合并计划 N5 / P7d）：只认动作为获得、第 4 栏是登记类别的写法，物品归主角。
// 旧的四 / 五栏物品标签（没有类别）不在这里入账，照旧只给物品演出。tagHash 以 fx-item 开头计算，不与 igs-combat 标签相撞。
export const COMBAT_GAIN_CATEGORIES = Object.freeze({
    武器: Object.freeze({ kind: 'equip', slot: 'weapon' }), 防具: Object.freeze({ kind: 'equip', slot: 'armor' }),
    饰品: Object.freeze({ kind: 'equip', slot: 'accessory' }), 宝物: Object.freeze({ kind: 'equip', slot: 'treasure' }),
    道具: Object.freeze({ kind: 'item' }), 杂物: Object.freeze({ kind: 'keepsake' }),
});
const FX_ITEM_TAG_RE = /\[igs-fx:item\|([^\]\n]*)\]/gi;
const GAIN_ACTION_WORDS = new Set(['获得', '得到', 'gain']);

export function scanGainTags(body) {
    const counts = new Map();
    const tags = [];
    for (const match of String(body || '').matchAll(FX_ITEM_TAG_RE)) {
        const fields = match[1].split('|').map((field) => field.trim());
        if (!GAIN_ACTION_WORDS.has(fields[0].toLowerCase()) || !Object.hasOwn(COMBAT_GAIN_CATEGORIES, fields[3] || '')) continue;
        const tagHash = tagHashOf(['fx-item', ...fields].join('|'));
        const occurrence = counts.get(tagHash) || 0;
        counts.set(tagHash, occurrence + 1);
        tags.push({ kind: 'gain', fields, raw: match[0], index: match.index, tagHash, occurrence });
    }
    return tags;
}

// 统一获得物 → 与旧 equip / item 同形的指令（装备带部位，道具数量 1），杂物为 keepsake（描述作来历）；栏位非法只记诊断。
export function extractGainDirectives(raw, options = {}) {
    const body = combatBodyText(raw, options);
    const directives = [];
    const diagnostics = [];
    for (const tag of scanGainTags(body)) {
        const bad = (field, problem) => diagnostics.push({ code: 'combat-gain-invalid', field, problem, ...anchorOf(tag) });
        if (tag.fields.length > 5) { bad('fields', 'too-many-fields'); continue; }
        const name = textIn('name', tag.fields[1], NAME_MAX, true);
        if (!name.ok) { bad(name.field, name.problem); continue; }
        const description = textIn('description', tag.fields[2], TEXT_MAX, false);
        if (!description.ok) { bad(description.field, description.problem); continue; }
        const rarity = rarityIn(tag.fields[4]);
        if (!rarity.ok) { bad(rarity.field, rarity.problem); continue; }
        const category = COMBAT_GAIN_CATEGORIES[tag.fields[3]];
        const base = { character: '我', name: name.value, ...anchorOf(tag) };
        if (category.kind === 'equip') directives.push(withRarity({ kind: 'equip', ...base, slot: category.slot, description: description.value }, rarity.value));
        else if (category.kind === 'item') directives.push(withRarity({ kind: 'item', ...base, count: 1, description: description.value }, rarity.value));
        else directives.push(withRarity({ kind: 'keepsake', ...base, origin: description.value }, rarity.value));
    }
    return { directives, diagnostics };
}
