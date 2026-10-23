import { DEFAULT_HTML_CARD_TAGS, extractHtmlCards, parseHtmlCardMarker } from './html-cards.js';
import { extractChatBlocks, parseChatMarker } from './chat-blocks.js';
import { readerBodyText } from './message-source.js';
import { stripIllustrationMarkers } from './scene-directives.js';

// 战斗标签 [igs-combat:类型|栏位…]。开战标签只在正文最后一个非空行生效；成长标签可出现在正文任意位置。
// 依赖方向是 combat → scene，这里不导入 combat；上限与 COMBAT_RULES 的一致性由 combat-directives.test.js 锁定。
export const COMBAT_TAG_LIMITS = Object.freeze({ maxEnemies: 5, maxAllies: 3, storyExpCapPerFloor: 50, expMax: 1000 });
export const COMBAT_GROWTH_KINDS = Object.freeze(['exp', 'learn', 'upgrade', 'class']);
export const COMBAT_TIERS = Object.freeze({ 普通: 'normal', normal: 'normal', 精英: 'elite', elite: 'elite', 首领: 'boss', boss: 'boss' });

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

const GROWTH_FIELD_MAX = Object.freeze({ exp: 3, learn: 3, upgrade: 3, class: 2 });

function parseGrowth(kind, fields) {
    if (fields.length > GROWTH_FIELD_MAX[kind]) return invalid('fields', 'too-many-fields');
    const character = textIn('character', fields[0], NAME_MAX, true);
    if (!character.ok) return character;
    const base = { character: character.value };
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
    const skill = textIn('skill', fields[1], NAME_MAX, true);
    if (!skill.ok) return skill;
    const description = textIn('description', fields[2], TEXT_MAX, false);
    return description.ok ? { ok: true, value: { ...base, skill: skill.value, description: description.value } } : description;
}

const anchorOf = (tag) => ({ tagHash: tag.tagHash, occurrence: tag.occurrence, index: tag.index });

function lastNonEmptyLine(body) {
    const lines = String(body || '').split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i].trim()) return lines[i].trim();
    return '';
}

// 开战标签：只有正文最后一个非空行恰好是一条完整的 [igs-combat:start|…] 才生效；其余开战标签只记诊断。
// 是否为最新 AI 楼由调用方判断，这里只看正文。
export function extractCombatStart(raw, options = {}) {
    const body = combatBodyText(raw, options);
    const starts = scanCombatTags(body).filter((tag) => tag.kind === 'start');
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
    return { start: { ...parsed.value, ...anchorOf(last) }, diagnostics };
}

// 成长标签：按正文顺序解析。剧情 EXP 每楼每角色累计封顶，超出部分截断并记诊断；
// 程序生成的战报楼由调用方传 { expCap: false} 跳过封顶；战报是用户楼、没有正文容器，传 { raw: true } 直接扫原文。
export function extractGrowthDirectives(raw, options = {}) {
    const body = options.raw === true ? String(raw || '') : combatBodyText(raw, options);
    const cap = options.expCap === false ? Infinity : COMBAT_TAG_LIMITS.storyExpCapPerFloor;
    const used = new Map();
    const directives = [];
    const diagnostics = [];
    for (const tag of scanCombatTags(body)) {
        if (tag.kind === 'start') continue;
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
        directives.push(value);
    }
    return { directives, diagnostics };
}

