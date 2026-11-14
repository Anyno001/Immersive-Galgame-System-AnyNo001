import { parseChoiceItems } from './choice-parser.js';

const QUICK_MAX_LINES = 8;
const BODY_MAX_ITEMS = 8;
const BODY_ITEM_MAX_LENGTH = 80;
const BODY_TAIL_LINES = 14;
const HINT_PATTERN = /(选项|选择|你可以|你想|你要|接下来|怎么做|如何行动|行动|可选)/;
const NUMBERED_LINE = /^\s*(?:[（(]\d{1,2}[）)]|\d{1,2}[.、)]|(?:选项|选择)\s*\d{0,2}\s*[:：])\s*\S/;
const BULLET_LINE = /^\s*[-*•]\s*\S/;

function toLines(value) {
    if (Array.isArray(value)) return value.map(item => String(item ?? ''));
    return String(value ?? '').split(/\r?\n/);
}

export function normalizeQuickActions(value) {
    const seen = new Set();
    const lines = [];
    for (const raw of toLines(value)) {
        const line = raw.replace(/\s+/g, ' ').trim();
        if (!line || seen.has(line)) continue;
        seen.add(line);
        lines.push(line);
        if (lines.length >= QUICK_MAX_LINES) break;
    }
    return lines.join('\n');
}

export function splitQuickActions(value) {
    const text = normalizeQuickActions(value);
    return text ? text.split('\n') : [];
}

export function normalizeOptionSources(src) {
    const source = src && typeof src === 'object' ? src : {};
    return {
        itemButton: source.itemButton !== false,
        bodyFallback: source.bodyFallback !== false,
        quickActions: normalizeQuickActions(source.quickActions),
    };
}

export function buildItemActionText(action, itemName, targetName = '') {
    const name = String(itemName || '').trim();
    if (!name) return '';
    const target = String(targetName || '').trim();
    if (action === 'give') return `我把【${name}】递给了${target}`;
    if (action === 'inspect') return `我仔细查看了【${name}】`;
    return `我使用了【${name}】`;
}

export function listPresentNames(content, protagonist = '') {
    const names = [];
    const add = (name) => {
        const text = String(name || '').trim();
        if (!text || text === protagonist || /^(?:\{\{user\}\}|user|玩家)$/i.test(text) || names.includes(text)) return;
        names.push(text);
    };
    const data = content && typeof content === 'object' ? content : {};
    add(data.spriteImage ? data.spriteCharacter : '');
    for (const member of Array.isArray(data.castSprites) ? data.castSprites : []) add(member && member.character);
    return names;
}

const NOT_HINT_PATTERN = /(状态|面板|属性|数值|数据|日志|背包|任务栏)/;
const STAT_BULLET = /^\s*[-*•]\s*[^\s：:]{1,10}[：:]\s*[-+]?\d/;
const STRIP_LOOKBACK = 80;

function isOptionLine(line) {
    return NUMBERED_LINE.test(line) || BULLET_LINE.test(line);
}

// 往上找到与结尾对应的开头行，找不到返回 -1。
function findOpening(lines, end, test) {
    for (let i = end; i >= 0 && end - i <= STRIP_LOOKBACK; i -= 1) if (test(lines[i])) return i;
    return -1;
}

// 剔除正文尾部的非剧情块：分隔线、HTML 注释、成对标签（<meta> / <status> 等）、代码围栏、【】面板。
function stripTrailingBlocks(lines) {
    for (let guard = 0; guard < 12; guard += 1) {
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        if (!lines.length) return;
        const last = lines[lines.length - 1];
        const trimmed = last.trim();
        if (isOptionLine(last)) return;
        let start = -1;
        if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) start = lines.length - 1;
        else if (/-->$/.test(trimmed)) start = findOpening(lines, lines.length - 1, line => line.includes('<!--'));
        else if (/^```/.test(trimmed)) start = findOpening(lines, lines.length - 2, line => /^\s*```/.test(line));
        else if (/^<[A-Za-z_][^>]*\/>$/.test(trimmed) || /^<([A-Za-z_][\w:.一-龥-]*)(?=[\s>])[^>]*>.*<\/\1>$/.test(trimmed)) start = lines.length - 1;
        else {
            const close = /^<\/([A-Za-z_][\w:.一-龥-]*)\s*>$/.exec(trimmed);
            if (close) start = findOpening(lines, lines.length - 1, line => new RegExp(`<${close[1].replace(/[.$]/g, '\\$&')}(?:\\s[^>]*)?>`).test(line));
            else if (/^【.*】$/.test(trimmed)) start = lines.length - 1;
            else if (/】$/.test(trimmed)) start = findOpening(lines, lines.length - 1, line => /^\s*【/.test(line));
        }
        if (start < 0) return;
        lines.length = start;
    }
}

// 只认正文末尾紧挨着的选项块：编号块直接认，符号列表必须前面有「选项 / 你可以 / 请选择」类提示行。
// 先剔除尾部状态块 / 注释 / 面板再找；找不到明确选项块一律返回空。
export function extractBodyChoices(text, settings = {}) {
    const lines = String(text || '').split(/\r?\n/);
    stripTrailingBlocks(lines);
    const block = [];
    let index = lines.length - 1;
    for (; index >= 0 && lines.length - index <= BODY_TAIL_LINES; index -= 1) {
        const line = lines[index];
        if (NUMBERED_LINE.test(line) || BULLET_LINE.test(line)) block.unshift(line);
        else break;
    }
    if (block.length < 2) return [];
    const numbered = block.every(line => NUMBERED_LINE.test(line));
    if (!numbered && block.every(line => STAT_BULLET.test(line))) return [];
    let hintLine = lines[index] || '';
    if (!hintLine.trim() && index > 0) hintLine = lines[index - 1] || '';
    const hinted = (HINT_PATTERN.test(hintLine) && !NOT_HINT_PATTERN.test(hintLine) && hintLine.trim().length <= 40)
        || /^\s*(?:选项|选择)/.test(block[0]);
    if (!numbered && !hinted) return [];
    if (numbered && !hinted && !/^\s*(?:[（(]?1[）).、]|选项)/.test(block[0])) return [];
    const items = parseChoiceItems(block.join('\n'), null, settings)
        .filter(item => item.text.length <= BODY_ITEM_MAX_LENGTH)
        .slice(0, BODY_MAX_ITEMS);
    if (items.length < 2) return [];
    return items.map(item => ({ display: item.text, send: item.sendText || item.text }));
}
