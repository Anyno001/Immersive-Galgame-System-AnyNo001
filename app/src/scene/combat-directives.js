// 战斗正文标签解析：从楼层正文里扫描 [igs-combat:...] 与 [igs-fx:item|获得|...] 标签，
// 校验字段后产出开战指令、成长指令（经验/学习/装备等）和获得物指令，并给出诊断。
// 纯函数。标签文本为 AI 输出，一律按不可信输入处理：长度、数量、枚举都在此校验。
import { DEFAULT_HTML_CARD_TAGS, extractHtmlCards, parseHtmlCardMarker } from './html-cards.js';
import { extractChatBlocks, parseChatMarker } from './chat-blocks.js';
import { stripMarkerDirectives } from './directive-tags.js';
import { readerBodyText } from './message-source.js';
import { stripIllustrationMarkers } from './scene-directives.js';

export const COMBAT_TAG_LIMITS = Object.freeze({ maxEnemies: 50, maxAllies: 3, storyExpCapPerFloor: 50, expMax: 1e3 });
export const COMBAT_GROWTH_KINDS = Object.freeze(['exp', 'learn', 'upgrade', 'class', 'equip', 'unequip', 'item', 'rel', 'stat', 'loot', 'heal', 'inscribe', 'purge', 'card-upgrade']);

// 战报编号：r + 最多 13 位小写字母数字。
const REPORT_ID_PATTERN = /^r[0-9a-z]{1,13}$/;

// 属性词（中英文）-> 属性键。
export const COMBAT_ABILITY_WORDS = Object.freeze({
    力量: 'str', 敏捷: 'dex', 体质: 'con', 智力: 'int', 感知: 'wis', 魅力: 'cha',
    str: 'str', dex: 'dex', con: 'con', int: 'int', wis: 'wis', cha: 'cha', 自由: 'free', free: 'free',
});
export const COMBAT_STAT_CAP_PER_FLOOR = 2;

// 关系强弱词 -> 档位键。
export const COMBAT_REL_TIERS = Object.freeze({
    远逊: 'outclassed', 稍弱: 'weaker', 相当: 'even', 稍强: 'stronger', 强敌: 'formidable', 碾压: 'overwhelming',
    outclassed: 'outclassed', weaker: 'weaker', even: 'even', stronger: 'stronger', formidable: 'formidable', overwhelming: 'overwhelming',
});

export const COMBAT_GEAR_SLOTS = Object.freeze({
    武器: 'weapon', 防具: 'armor', 饰品: 'accessory', 宝物: 'treasure',
    weapon: 'weapon', armor: 'armor', accessory: 'accessory', treasure: 'treasure',
});
export const COMBAT_ITEM_COUNT_MAX = 3;

export const COMBAT_RARITY_WORDS = Object.freeze({
    普通: 'common', 罕见: 'uncommon', 稀有: 'rare', 史诗: 'epic', 神话: 'mythic',
    common: 'common', uncommon: 'uncommon', rare: 'rare', epic: 'epic', mythic: 'mythic',
});

export const COMBAT_TIERS = Object.freeze({ 普通: 'normal', normal: 'normal', 精英: 'elite', elite: 'elite', 首领: 'boss', boss: 'boss' });

// 觉醒类型：中文名 -> 键。
export const COMBAT_AWAKEN_TYPES = Object.freeze({ 怒火: 'rage', 守护: 'guard', 悲恸: 'grief', 决意: 'resolve', 羁绊: 'bond', 极限: 'limit', 复仇: 'vengeance', 不屈: 'unyielding' });
// 觉醒类型接受中文名或键本身。
const AWAKEN_TYPE_LOOKUP = Object.freeze(Object.fromEntries(Object.entries(COMBAT_AWAKEN_TYPES).flatMap(([name, key]) => [[name, key], [key, key]])));

const AWAKEN_LINE_MAX = 30;
const COMBAT_TAG_PATTERN = /\[igs-combat:([^\]\n]*)\]/g;
const LIST_SEPARATOR = /[,，、;；]+/;
// 「名称*数量」，乘号可为 * ＊ ×，数量可为全角数字。
const COUNTED_NAME_PATTERN = /^(.+?)\s*[*＊×]\s*([0-9０-９]+)$/;
const DIGITS_PATTERN = /^\d{1,6}$/;
const NAME_MAX = 20;
const DESC_MAX = 80;
const CLASS_NAME_MAX = 12;

// 全角数字转半角。
const toHalfWidthDigits = (value) => String(value).replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248));
const validText = (value, max) => typeof value === 'string' && value.length >= 1 && value.length <= max;
const fail = (field, problem) => ({ ok: false, field, problem });

// 标签哈希（FNV-1a 32 位，36 进制），用来在正文里定位同一个标签。
function tagHashOf(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function parseTagList(value) {
    return String(value ?? DEFAULT_HTML_CARD_TAGS).split(/[\n,，]+/).map((tag) => tag.trim()).filter(Boolean);
}

// 去掉满足 locate(line) >= 0 的整行。
function dropLines(text, locate) {
    return text.split('\n').filter((line) => locate(line) < 0).join('\n');
}

// 取可信正文：去插图标记、HTML 卡片、阅读器非正文、聊天块，保证标签不会来自这些区域。
export function combatBodyText(raw, options = {}) {
    const filter = options.sourceFilter;
    const noCards = extractHtmlCards(stripIllustrationMarkers(raw), parseTagList(filter?.htmlCardTags)).text;
    const body = readerBodyText(dropLines(noCards, parseHtmlCardMarker), filter);
    return dropLines(extractChatBlocks(body).text, parseChatMarker);
}

// 扫描所有 [igs-combat:kind|a|b...]；tagHash 与 occurrence 用于区分重复出现的相同标签。
export function scanCombatTags(text) {
    const source = String(text || '');
    const seen = new Map();
    const tags = [];
    for (const match of source.matchAll(COMBAT_TAG_PATTERN)) {
        const [head, ...fields] = match[1].split('|').map((part) => part.trim());
        const kind = head.toLowerCase();
        const tagHash = tagHashOf([kind, ...fields].join('|'));
        const occurrence = seen.get(tagHash) || 0;
        seen.set(tagHash, occurrence + 1);
        tags.push({ kind, fields, raw: match[0], index: match.index, tagHash, occurrence });
    }
    return tags;
}

// 解析 1..max 范围内的纯数字（容许全角），失败返回 null。
function parseIntInRange(value, min, max) {
    const text = toHalfWidthDigits(value ?? '').trim();
    if (!DIGITS_PATTERN.test(text)) return null;
    const num = Number(text);
    return num >= min && num <= max ? num : null;
}

// 文本字段：空串时 required 决定报错或给空值；超长报 too-long。
function textField(field, value, max, required) {
    const text = String(value ?? '').trim();
    if (!text) return required ? fail(field, 'required') : { ok: true, value: '' };
    return text.length <= max ? { ok: true, value: text } : fail(field, 'too-long');
}

const splitList = (value) => String(value || '').split(LIST_SEPARATOR).map((part) => part.trim()).filter(Boolean);

// 敌人列表「名*数量」，同名合并；总数不超过 maxEnemies。
function parseEnemies(value) {
    const list = [];
    let total = 0;
    for (const part of splitList(value)) {
        const match = part.match(COUNTED_NAME_PATTERN);
        const name = (match ? match[1] : part).trim();
        const count = match ? parseIntInRange(match[2], 1, 99) : 1;
        if (!validText(name, NAME_MAX)) return fail('enemies', 'invalid-name');
        if (count === null) return fail('enemies', 'invalid-count');
        total += count;
        const same = list.find((item) => item.name === name);
        if (same) same.count += count;
        else list.push({ name, count });
    }
    if (!list.length) return fail('enemies', 'required');
    return total > COMBAT_TAG_LIMITS.maxEnemies ? fail('enemies', 'too-many') : { ok: true, value: list };
}

function parseAllies(value) {
    const names = [...new Set(splitList(value))];
    if (names.some((name) => !validText(name, NAME_MAX))) return fail('allies', 'invalid-name');
    return names.length > COMBAT_TAG_LIMITS.maxAllies ? fail('allies', 'too-many') : { ok: true, value: names };
}

// 开战标签字段：遭遇名|敌人|友军|阶级。
function parseStartFields(fields) {
    if (fields.length > 4) return fail('fields', 'too-many-fields');
    const encounter = textField('encounter', fields[0], NAME_MAX, true);
    if (!encounter.ok) return encounter;
    const enemies = parseEnemies(fields[1]);
    if (!enemies.ok) return enemies;
    const allies = parseAllies(fields[2]);
    if (!allies.ok) return allies;
    const tierWord = String(fields[3] ?? '').trim().toLowerCase();
    if (tierWord && !Object.hasOwn(COMBAT_TIERS, tierWord)) return fail('tier', 'unknown-tier');
    const tier = tierWord ? COMBAT_TIERS[tierWord] : 'normal';
    return { ok: true, value: { encounter: encounter.value, enemies: enemies.value, allies: allies.value, tier } };
}

// 各成长标签允许的最大字段数（含角色名）。
// loot 第 5 字段（规则 v6）：三选一卡牌槽的候选序号（0 起）或 skip，旧标签不带。
// purge（规则 v6 删卡，只写在胜利战报后）：角色、战报 ID、卡组副本 ID。
// card-upgrade（规则 v6 G3c 升级机会，只写在胜利战报后）：字段同 purge。
const GROWTH_FIELD_MAX = Object.freeze({ exp: 3, learn: 4, upgrade: 3, class: 2, equip: 5, unequip: 2, item: 5, rel: 2, stat: 4, loot: 5, heal: 3, inscribe: 4, purge: 3, 'card-upgrade': 3 });
const HEAL_FLAT_MAX = 9999;

// 稀有度字段：空为 null（不指定），未知词报错。
function parseRarity(value) {
    const word = String(value ?? '').trim().toLowerCase();
    if (!word) return { ok: true, value: null };
    return Object.hasOwn(COMBAT_RARITY_WORDS, word) ? { ok: true, value: COMBAT_RARITY_WORDS[word] } : fail('rarity', 'unknown-rarity');
}

const withRarity = (obj, rarity) => (rarity ? { ...obj, rarity } : obj);

// equip / unequip / item：名称必填；equip 要槽位，item 要数量。
function parseGearOrItem(kind, base, fields) {
    const name = textField('name', fields[1], NAME_MAX, true);
    if (!name.ok) return name;
    const head = { ...base, name: name.value };
    if (kind === 'unequip') return { ok: true, value: head };
    if (kind === 'equip') {
        const slotWord = String(fields[2] ?? '').trim().toLowerCase();
        if (!slotWord) return fail('slot', 'required');
        if (!Object.hasOwn(COMBAT_GEAR_SLOTS, slotWord)) return fail('slot', 'unknown-slot');
        const description = textField('description', fields[3], DESC_MAX, false);
        if (!description.ok) return description;
        const rarity = parseRarity(fields[4]);
        return rarity.ok ? { ok: true, value: withRarity({ ...head, slot: COMBAT_GEAR_SLOTS[slotWord], description: description.value }, rarity.value) } : rarity;
    }
    const countText = String(fields[2] ?? '').trim();
    const count = countText ? parseIntInRange(countText, 1, COMBAT_ITEM_COUNT_MAX) : 1;
    if (count === null) return fail('count', 'invalid-count');
    const description = textField('description', fields[3], DESC_MAX, false);
    if (!description.ok) return description;
    const rarity = parseRarity(fields[4]);
    return rarity.ok ? { ok: true, value: withRarity({ ...head, count, description: description.value }, rarity.value) } : rarity;
}

// 单条成长标签的字段校验，返回 { ok, value } 或 { ok:false, field, problem }。
function parseGrowthFields(kind, fields) {
    if (fields.length > GROWTH_FIELD_MAX[kind]) return fail('fields', 'too-many-fields');
    const character = textField('character', fields[0], NAME_MAX, true);
    if (!character.ok) return character;
    const base = { character: character.value };
    if (kind === 'equip' || kind === 'unequip' || kind === 'item') return parseGearOrItem(kind, base, fields);
    if (kind === 'loot') {
        const reportId = String(fields[1] ?? '').trim();
        if (!REPORT_ID_PATTERN.test(reportId)) return fail('reportId', 'invalid-report-id');
        const slot = parseIntInRange(fields[2], 0, 3);
        if (slot === null) return fail('slot', 'invalid-slot');
        const set = String(fields[3] ?? '').trim() || 'main';
        if (set !== 'main' && set !== 'reserve') return fail('set', 'unknown-set');
        const pickWord = String(fields[4] ?? '').trim().toLowerCase();
        if (!pickWord) return { ok: true, value: { ...base, reportId, slot, set } };
        if (pickWord === 'skip') return { ok: true, value: { ...base, reportId, slot, set, pick: 'skip' } };
        const pick = parseIntInRange(pickWord, 0, 3);
        return pick === null ? fail('pick', 'invalid-pick') : { ok: true, value: { ...base, reportId, slot, set, pick } };
    }
    if (kind === 'purge' || kind === 'card-upgrade') {
        const reportId = String(fields[1] ?? '').trim();
        if (!REPORT_ID_PATTERN.test(reportId)) return fail('reportId', 'invalid-report-id');
        const copyId = String(fields[2] ?? '').trim();
        if (!/^[A-Za-z0-9_:.-]{1,200}$/.test(copyId)) return fail('copyId', 'invalid-copy-id');
        return { ok: true, value: { ...base, reportId, copyId } };
    }
    if (kind === 'heal') {
        // 数量可写成百分比（含全角％）。
        const text = toHalfWidthDigits(fields[1] ?? '').trim().replace(/％/g, '%');
        const percent = text.endsWith('%');
        const amount = parseIntInRange(percent ? text.slice(0, -1) : text, 1, percent ? 100 : HEAL_FLAT_MAX);
        if (amount === null) return fail('amount', 'invalid-amount');
        const reason = textField('reason', fields[2], DESC_MAX, false);
        return reason.ok ? { ok: true, value: { ...base, amount, mode: percent ? 'percent' : 'flat', reason: reason.value } } : reason;
    }
    // 规则 v5 P5b 刻印：角色|牌名|刻印名|原因。刻印名由账本按刻印表核对。
    if (kind === 'inscribe') {
        const card = textField('card', fields[1], NAME_MAX, true);
        if (!card.ok) return card;
        const inscription = textField('inscription', fields[2], NAME_MAX, true);
        if (!inscription.ok) return inscription;
        const reason = textField('reason', fields[3], DESC_MAX, false);
        return reason.ok ? { ok: true, value: { ...base, card: card.value, inscription: inscription.value, reason: reason.value } } : reason;
    }
    if (kind === 'exp') {
        const amount = parseIntInRange(fields[1], 1, COMBAT_TAG_LIMITS.expMax);
        if (amount === null) return fail('amount', 'invalid-amount');
        const reason = textField('reason', fields[2], DESC_MAX, false);
        return reason.ok ? { ok: true, value: { ...base, amount, reason: reason.value } } : reason;
    }
    if (kind === 'class') {
        const className = textField('className', fields[1], CLASS_NAME_MAX, true);
        return className.ok ? { ok: true, value: { ...base, className: className.value } } : className;
    }
    if (kind === 'rel') {
        const word = String(fields[1] ?? '').trim().toLowerCase();
        if (!word) return fail('tier', 'required');
        return Object.hasOwn(COMBAT_REL_TIERS, word) ? { ok: true, value: { ...base, tier: COMBAT_REL_TIERS[word] } } : fail('tier', 'unknown-tier');
    }
    if (kind === 'stat') {
        const word = String(fields[1] ?? '').trim().toLowerCase();
        if (!word) return fail('ability', 'required');
        if (!Object.hasOwn(COMBAT_ABILITY_WORDS, word)) return fail('ability', 'unknown-ability');
        const amount = parseIntInRange(fields[2], 1, COMBAT_STAT_CAP_PER_FLOOR);
        if (amount === null) return fail('amount', 'invalid-amount');
        const reason = textField('reason', fields[3], DESC_MAX, false);
        return reason.ok ? { ok: true, value: { ...base, ability: COMBAT_ABILITY_WORDS[word], amount, reason: reason.value } } : reason;
    }
    // learn / upgrade：技能名必填，描述可选；learn 还可带稀有度。
    const skill = textField('skill', fields[1], NAME_MAX, true);
    if (!skill.ok) return skill;
    const description = textField('description', fields[2], DESC_MAX, false);
    if (!description.ok) return description;
    const value = { ...base, skill: skill.value, description: description.value };
    if (kind !== 'learn') return { ok: true, value };
    const rarity = parseRarity(fields[3]);
    return rarity.ok ? { ok: true, value: withRarity(value, rarity.value) } : rarity;
}

// 觉醒标签字段：角色|类型|台词。
function parseAwakenFields(fields) {
    if (fields.length > 3) return fail('fields', 'too-many-fields');
    const character = textField('character', fields[0], NAME_MAX, true);
    if (!character.ok) return character;
    const word = String(fields[1] ?? '').trim().toLowerCase();
    if (!word) return fail('type', 'required');
    if (!Object.hasOwn(AWAKEN_TYPE_LOOKUP, word)) return fail('type', 'unknown-type');
    const line = textField('line', fields[2], AWAKEN_LINE_MAX, false);
    return line.ok ? { ok: true, value: { character: character.value, type: AWAKEN_TYPE_LOOKUP[word], line: line.value } } : line;
}

// 标签在正文中的定位信息，写进指令与诊断。
const locateOf = (tag) => ({ tagHash: tag.tagHash, occurrence: tag.occurrence, index: tag.index });

// 文本最后一个非空行（已 trim）。
function lastNonEmptyLine(text) {
    const lines = String(text || '').split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i].trim()) return lines[i].trim();
    return '';
}

// 觉醒标签必须是紧贴开战标签前的独立一行；其余觉醒标签记「放错位置」诊断。
function pickAwaken(body, tags, startTag, diagnostics) {
    const awakens = tags.filter((tag) => tag.kind === 'awaken');
    if (!awakens.length) return null;
    const before = body.slice(0, startTag.index).trimEnd();
    const last = awakens.at(-1);
    const wellPlaced = last.index < startTag.index && last.index + last.raw.length === before.length && lastNonEmptyLine(before) === last.raw;
    for (const tag of awakens) if (tag !== last || !wellPlaced) diagnostics.push({ code: 'combat-awaken-misplaced', ...locateOf(tag) });
    if (!wellPlaced) return null;
    const parsed = parseAwakenFields(last.fields);
    if (parsed.ok) return { ...parsed.value, ...locateOf(last) };
    diagnostics.push({ code: 'combat-awaken-invalid', field: parsed.field, problem: parsed.problem, ...locateOf(last) });
    return null;
}

// 开战标签之后只剩纯标记行（数值 stat、成长 rel / exp、判定、恐怖档位等，不含开战与觉醒标签）时视同末行（v0.39.2）：
// 模型常把这些结算标签写在开战标签后面，它们不承载正文；后面还有任何正文时仍判 combat-start-not-tail。
const START_OR_AWAKEN_RE = /\[igs-combat:\s*(?:start|awaken)\s*[|\]]/i;
function withoutTrailingMarkers(body) {
    const lines = String(body || '').split('\n');
    while (lines.length) {
        const line = lines[lines.length - 1].trim();
        if (line && (START_OR_AWAKEN_RE.test(line) || stripMarkerDirectives(line).trim())) break;
        lines.pop();
    }
    return lines.join('\n');
}

// 提取开战指令：只认正文最后一行（忽略其后的纯标记行）的最后一个 start 标签，其余记「不在末尾」诊断。
export function extractCombatStart(raw, options = {}) {
    const body = combatBodyText(raw, options);
    const tags = scanCombatTags(body);
    const starts = tags.filter((tag) => tag.kind === 'start');
    const diagnostics = [];
    const head = withoutTrailingMarkers(body);
    const lastLine = lastNonEmptyLine(head);
    const last = starts.at(-1);
    const atTail = !!last && lastLine === last.raw && head.trimEnd().endsWith(last.raw);
    for (const tag of starts) if (tag !== last || !atTail) diagnostics.push({ code: 'combat-start-not-tail', ...locateOf(tag) });
    if (!atTail) return { start: null, diagnostics };
    const parsed = parseStartFields(last.fields);
    if (!parsed.ok) {
        diagnostics.push({ code: 'combat-start-invalid', field: parsed.field, problem: parsed.problem, ...locateOf(last) });
        return { start: null, diagnostics };
    }
    const start = { ...parsed.value, ...locateOf(last) };
    const awaken = pickAwaken(body, tags, last, diagnostics);
    if (awaken) start.awaken = awaken;
    const lines = pickCombatLines(tags, last, diagnostics);
    if (lines.length) start.lines = lines;
    return { start, diagnostics };
}

// 战斗台词 [igs-combat:lines|角色|开场|出招|受击|倒下]：只给面板演出与朗读，不进账本、不改战斗结算。
// 四段各用「/」写多句，每句不超过 LINES_SENTENCE_MAX 字、每段不超过 LINES_PER_PHASE 句；每个角色取第一条，最多 LINES_MAX_CHARACTERS 人。
// 必须写在开战标签之前（开战标签之后的 lines 忽略）。
const LINES_SENTENCE_MAX = 20;
const LINES_PER_PHASE = 4;
const LINES_MAX_CHARACTERS = 6;
const LINES_PHASES = Object.freeze(['open', 'attack', 'hit', 'down']);

function parseLinePhase(value) {
    return String(value ?? '').split(/[\/／]+/).map((part) => part.trim()).filter((part) => part && part.length <= LINES_SENTENCE_MAX).slice(0, LINES_PER_PHASE);
}

function collectCombatLines(tags, diagnostics, beforeIndex = Infinity) {
    const out = [];
    const seen = new Set();
    for (const tag of tags) {
        if (tag.kind !== 'lines') continue;
        if (tag.index > beforeIndex) { diagnostics.push({ code: 'combat-lines-after-start', ...locateOf(tag) }); continue; }
        const character = textField('character', tag.fields[0], NAME_MAX, true);
        if (!character.ok) { diagnostics.push({ code: 'combat-lines-invalid', field: character.field, problem: character.problem, ...locateOf(tag) }); continue; }
        if (seen.has(character.value)) { diagnostics.push({ code: 'combat-lines-duplicate', ...locateOf(tag) }); continue; }
        const entry = { character: character.value };
        LINES_PHASES.forEach((phase, i) => { entry[phase] = parseLinePhase(tag.fields[i + 1]); });
        if (!LINES_PHASES.some((phase) => entry[phase].length)) { diagnostics.push({ code: 'combat-lines-invalid', field: 'lines', problem: 'required', ...locateOf(tag) }); continue; }
        seen.add(character.value);
        out.push(entry);
        if (out.length >= LINES_MAX_CHARACTERS) break;
    }
    return out;
}

const pickCombatLines = (tags, startTag, diagnostics) => collectCombatLines(tags, diagnostics, startTag.index);

// 亲密对决的台词：同一个 lines 标签，四段含义为开场、出招、受击、快失守；标签位置不限，按角色名对上对方。
export function extractIntimateLines(body, diagnostics = []) {
    return collectCombatLines(scanCombatTags(body), diagnostics);
}

// 提取成长指令。经验按角色每楼封顶，属性点按角色每楼封顶；超出部分截断并记诊断。
// options.raw=true 时不做正文净化；options.expCap=false 时经验不封顶。
export function extractGrowthDirectives(raw, options = {}) {
    const body = options.raw === true ? String(raw || '') : combatBodyText(raw, options);
    const expCap = options.expCap === false ? Infinity : COMBAT_TAG_LIMITS.storyExpCapPerFloor;
    const expUsed = new Map();
    const statUsed = new Map();
    const directives = [];
    const diagnostics = [];
    for (const tag of scanCombatTags(body)) {
        if (tag.kind === 'start' || tag.kind === 'awaken' || tag.kind === 'lines') continue;
        if (!COMBAT_GROWTH_KINDS.includes(tag.kind)) {
            diagnostics.push({ code: 'combat-tag-unknown', kind: tag.kind, ...locateOf(tag) });
            continue;
        }
        const parsed = parseGrowthFields(tag.kind, tag.fields);
        if (!parsed.ok) {
            diagnostics.push({ code: 'combat-tag-invalid', kind: tag.kind, field: parsed.field, problem: parsed.problem, ...locateOf(tag) });
            continue;
        }
        const directive = { kind: tag.kind, ...parsed.value, ...locateOf(tag) };
        if (tag.kind === 'exp') {
            const used = expUsed.get(directive.character) || 0;
            const granted = Math.min(directive.amount, Math.max(0, expCap - used));
            if (granted < directive.amount) diagnostics.push({ code: 'combat-exp-capped', character: directive.character, requested: directive.amount, granted, ...locateOf(tag) });
            if (!granted) continue;
            expUsed.set(directive.character, used + granted);
            directive.amount = granted;
        }
        if (tag.kind === 'stat') {
            const used = statUsed.get(directive.character) || 0;
            const granted = Math.min(directive.amount, Math.max(0, COMBAT_STAT_CAP_PER_FLOOR - used));
            if (granted < directive.amount) diagnostics.push({ code: 'combat-stat-capped', character: directive.character, requested: directive.amount, granted, ...locateOf(tag) });
            if (!granted) continue;
            statUsed.set(directive.character, used + granted);
            directive.amount = granted;
        }
        directives.push(directive);
    }
    return { directives, diagnostics };
}

// 获得物分类（物品演出标签的第 4 字段）-> 指令类型与槽位。
export const COMBAT_GAIN_CATEGORIES = Object.freeze({
    武器: Object.freeze({ kind: 'equip', slot: 'weapon' }),
    防具: Object.freeze({ kind: 'equip', slot: 'armor' }),
    饰品: Object.freeze({ kind: 'equip', slot: 'accessory' }),
    宝物: Object.freeze({ kind: 'equip', slot: 'treasure' }),
    道具: Object.freeze({ kind: 'item' }),
    杂物: Object.freeze({ kind: 'keepsake' }),
});

const GAIN_TAG_PATTERN = /\[igs-fx:item\|([^\]\n]*)\]/gi;
const GAIN_VERBS = new Set(['获得', '得到', 'gain']);

// 扫描物品演出标签中「获得」类且分类合法的条目。
export function scanGainTags(text) {
    const seen = new Map();
    const tags = [];
    for (const match of String(text || '').matchAll(GAIN_TAG_PATTERN)) {
        const fields = match[1].split('|').map((part) => part.trim());
        if (!GAIN_VERBS.has(fields[0].toLowerCase()) || !Object.hasOwn(COMBAT_GAIN_CATEGORIES, fields[3] || '')) continue;
        const tagHash = tagHashOf(['fx-item', ...fields].join('|'));
        const occurrence = seen.get(tagHash) || 0;
        seen.set(tagHash, occurrence + 1);
        tags.push({ kind: 'gain', fields, raw: match[0], index: match.index, tagHash, occurrence });
    }
    return tags;
}

// 把物品演出标签转成「我」获得物品的指令：装备、道具、杂物。
export function extractGainDirectives(raw, options = {}) {
    const body = combatBodyText(raw, options);
    const directives = [];
    const diagnostics = [];
    for (const tag of scanGainTags(body)) {
        const reject = (field, problem) => diagnostics.push({ code: 'combat-gain-invalid', field, problem, ...locateOf(tag) });
        if (tag.fields.length > 5) {
            reject('fields', 'too-many-fields');
            continue;
        }
        const name = textField('name', tag.fields[1], NAME_MAX, true);
        if (!name.ok) {
            reject(name.field, name.problem);
            continue;
        }
        const description = textField('description', tag.fields[2], DESC_MAX, false);
        if (!description.ok) {
            reject(description.field, description.problem);
            continue;
        }
        const rarity = parseRarity(tag.fields[4]);
        if (!rarity.ok) {
            reject(rarity.field, rarity.problem);
            continue;
        }
        const category = COMBAT_GAIN_CATEGORIES[tag.fields[3]];
        const base = { character: '我', name: name.value, ...locateOf(tag) };
        if (category.kind === 'equip') directives.push(withRarity({ kind: 'equip', ...base, slot: category.slot, description: description.value }, rarity.value));
        else if (category.kind === 'item') directives.push(withRarity({ kind: 'item', ...base, count: 1, description: description.value }, rarity.value));
        else directives.push(withRarity({ kind: 'keepsake', ...base, origin: description.value }, rarity.value));
    }
    return { directives, diagnostics };
}

const LOSS_ACTION_WORDS = new Set(['失去', 'lose']);
const LOSS_ALL_WORDS = new Set(['全部', '所有', 'all']);
export const COMBAT_LOSS_MAX = 30;

export function scanLossTags(body) {
    const counts = new Map();
    const tags = [];
    for (const match of String(body || '').matchAll(GAIN_TAG_PATTERN)) {
        const fields = match[1].split('|').map((field) => field.trim());
        if (!LOSS_ACTION_WORDS.has(fields[0].toLowerCase())) continue;
        const tagHash = tagHashOf(['fx-item', ...fields].join('|'));
        const occurrence = counts.get(tagHash) || 0;
        counts.set(tagHash, occurrence + 1);
        tags.push({ kind: 'lose', fields, raw: match[0], index: match.index, tagHash, occurrence });
    }
    return tags;
}

function lossCountIn(value) {
    const word = toHalfWidthDigits(value ?? '').trim().toLowerCase();
    if (!word) return { ok: true, value: 1 };
    if (LOSS_ALL_WORDS.has(word)) return { ok: true, value: 'all' };
    if (!DIGITS_PATTERN.test(word)) return { ok: false, field: 'count', problem: 'not-integer' };
    const count = Number(word);
    return count >= 1 && count <= COMBAT_LOSS_MAX
        ? { ok: true, value: count }
        : { ok: false, field: 'count', problem: 'out-of-range' };
}

export function extractLossDirectives(raw, options = {}) {
    const body = combatBodyText(raw, options);
    const directives = [];
    const diagnostics = [];
    for (const tag of scanLossTags(body)) {
        const reject = (field, problem) => diagnostics.push({ code: 'combat-loss-invalid', field, problem, ...locateOf(tag) });
        if (tag.fields.length > 5) { reject('fields', 'too-many-fields'); continue; }
        const name = textField('name', tag.fields[1], NAME_MAX, true);
        if (!name.ok) { reject(name.field, name.problem); continue; }
        const count = lossCountIn(tag.fields[3]);
        if (!count.ok) { reject(count.field, count.problem); continue; }
        const who = textField('character', tag.fields[4], NAME_MAX, false);
        if (!who.ok) { reject(who.field, who.problem); continue; }
        const reason = String(tag.fields[2] || '').trim().slice(0, DESC_MAX);
        directives.push({ kind: 'lose', character: who.value || '我', name: name.value, ...(count.value === 'all' ? { all: true } : { count: count.value }), reason, ...locateOf(tag) });
    }
    return { directives, diagnostics };
}