import { splitIgsDirectiveLines, stripOutfitFields } from '../../scene/directive-tags.js';
import { imageMarkerBoundary, imageMarkerContentRanges, insertImageMarkerOnLine } from '../../scene/image-marker-layout.js';

const SCENE_RE = /\[igs-scene:([^|\]\n]+)\|([^|\]\n]+)(?:\|([^|\]\n]*))?(?:\|([^|\]\n]*))?(?:\|[^\]\n]*)?\]/g;
const CHAR_RE = /\[igs-char:([^|\]\n]+)\|(?:([^|\]\n]*)\|)?([^|\]\n]+)\]?/g;
const THOUGHT_RE = /\[igs-thought:([^|\]\n]+)\|(?:([^|\]\n]*)\|)?([^|\]\n]+)\]?/g;
const IMG_RE = /(?:\[igs-img:\s*\d+\s*\]|<IMG>\s*\d+\s*<\/IMG>)/gi;

// 一段正文里可以有多段 <content>。只认第一段会漏掉后面的场景标签。
function contentSpans(lines) {
    const spans = [];
    let start = -1;
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (start < 0 && /<content\b[^>]*>/i.test(line)) start = i;
        if (start >= 0 && /<\/content>/i.test(line)) {
            spans.push([start, i]);
            start = -1;
        }
    }
    if (start >= 0) spans.push([start, lines.length - 1]);
    return spans.length ? spans : [[0, lines.length - 1]];
}

function lineInSpans(index, spans) {
    return spans.some(([from, to]) => index >= from && index <= to);
}

function readableLine(line) {
    return String(line || '')
        .replace(IMG_RE, '')
        .replace(SCENE_RE, '')
        .replace(CHAR_RE, (_, name, _mood, text) => `${name.trim()}：「${text.trim()}」`)
        .replace(THOUGHT_RE, (_, name, _mood, text) => `${name.trim()}（心想）：${text.trim()}`)
        // 柏宝绘 / 智绘姬写回楼层的生图词不是正文。
        .replace(/<bbi_image>[\s\S]*?<\/bbi_image>|<image>[\s\S]*?<\/image>|image###[\s\S]*?###/gi, '')
        .replace(/<\/?[a-zA-Z][^>]*>/g, '')
        .trim();
}

export function numberParagraphs(raw, options = {}) {
    const lines = String(raw || '').split('\n');
    const spans = contentSpans(lines);
    const paragraphs = [];
    const scenes = [];
    const characters = new Set();
    for (const { text, lineIndex } of splitIgsDirectiveLines(raw)) {
        const line = stripOutfitFields(text, options && options.outfitResolver);
        // 场景标签整楼都认。写在第一段 </content> 之后的转场也要算进 NSFW 和背景。
        for (const m of line.matchAll(SCENE_RE)) {
            scenes.push({ scene: m[1].trim(), time: m[2].trim(), weather: m[3].trim(), nsfw: String(m[4] || '').trim().toLowerCase() === 'nsfw' });
        }
        if (!lineInSpans(lineIndex, spans)) continue;
        for (const m of line.matchAll(CHAR_RE)) characters.add(m[1].trim());
        for (const m of line.matchAll(THOUGHT_RE)) characters.add(m[1].trim());
        const readable = readableLine(line);
        if (readable) paragraphs.push({ no: paragraphs.length + 1, lineIndex, text: readable });
    }
    return { paragraphs, scenes, characters: Array.from(characters), isNsfw: scenes.some((s) => s.nsfw) };
}

// 本楼出场角色：说过话或有心里话的人，加上场景标签第 5 段写明的在场名单。extra 里的名字一并带上。
export function floorCharacterKeywords(text, extra = []) {
    const names = [];
    const add = (name) => {
        const value = String(name || '').trim();
        if (!value || names.includes(value)) return;
        names.push(value);
    };
    const presentRe = /\[igs-scene:[^|\n\]]+\|[^|\n\]]+(?:\|[^|\n\]]*)?(?:\|[^|\n\]]*)?\|([^\n\]]*)\]/g;
    for (const name of numberParagraphs(text).characters) add(name);
    for (const match of String(text || '').matchAll(presentRe)) {
        for (const part of String(match[1] || '').split(/[,，、;；\s]+/)) add(part);
    }
    for (const name of Array.isArray(extra) ? extra : []) add(name);
    return names;
}

export function formatNumberedParagraphs(paragraphs, maxChars = 6000) {
    const out = [];
    let total = 0;
    for (const p of paragraphs) {
        const line = `${p.no}. ${p.text}`;
        total += line.length + 1;
        if (total > maxChars) break;
        out.push(line);
    }
    return out.join('\n');
}

/**
 * 与数据库生图插件的生成点定位相同：精确 → 去掉空白和标点 → 最长公共子串。
 * 命中后落回完整结构结束处对应的段落编号。
 * @param {string} raw
 * @param {Array<{ no: number, lineIndex: number }>} paragraphs
 * @param {string} anchor
 * @returns {number}
 */
export function paragraphNoForAnchor(raw, paragraphs, anchor) {
    const source = String(raw || '');
    const found = findAnchorInsertIndex(source, anchor);
    if (found.index < 0) return 0;
    const lineIndex = source.slice(0, Math.max(0, found.index - 1)).split('\n').length - 1;
    const list = Array.isArray(paragraphs) ? paragraphs : [];
    const exact = list.find((paragraph) => paragraph.lineIndex === lineIndex);
    if (exact) return exact.no;
    let before = null;
    for (const paragraph of list) {
        if (paragraph.lineIndex <= lineIndex) before = paragraph;
        else break;
    }
    if (before) return before.no;
    return list.length ? list[0].no : 0;
}

/**
 * 在 text 中定位 anchor，返回完整结构与所在行之后的安全插入下标；找不到返回 -1。
 * @param {string} text
 * @param {string} anchorSentence
 * @returns {{ index: number, mode: string }}
 */
export function findAnchorInsertIndex(text, anchorSentence) {
    const source = typeof text === 'string' ? text : '';
    const anchor = typeof anchorSentence === 'string' ? anchorSentence : '';
    if (!anchor) return { index: -1, mode: 'fail' };
    const located = (anchorIndex, mode) => ({ index: imageMarkerBoundary(source, anchorIndex), anchorIndex, mode });
    const bodies = imageMarkerContentRanges(source);
    const scopes = bodies.length ? bodies.map(body => [body.openEnd, body.closeStart]) : [[0, source.length]];
    // 优先级跨正文块统一：后一个正文块的精确命中优先于前一块的模糊相似句。
    for (const mode of ['exact', 'normalized', 'lcs']) for (const [from, to] of scopes) {
        const text = source.slice(from, to);
        const at = mode === 'exact' ? text.indexOf(anchor) : -1;
        const hit = mode === 'exact' ? (at >= 0 ? at + anchor.length : -1)
            : mode === 'normalized' ? findNormalized(text, anchor).index : findByLongestCommonSubstring(text, anchor).index;
        if (hit >= 0) return located(from + hit, mode);
    }
    return { index: -1, mode: 'fail' };
}

function findNormalized(text, anchor) {
    const { normalized: normText, map } = normalizeWithMap(text);
    const normAnchor = normalizeAnchorText(anchor);
    if (!normAnchor) return { index: -1 };
    const at = normText.indexOf(normAnchor);
    if (at === -1) return { index: -1 };
    const endOrig = map[at + normAnchor.length - 1];
    if (endOrig == null) return { index: -1 };
    return { index: endOrig + 1 };
}

function normalizeAnchorText(s) {
    return s
        .replace(/\s+/g, '')
        .replace(/[，。！？、；：""''「」『』（）【】《》,.!?;:'"()\[\]{}]/g, '')
        .toLowerCase();
}

function normalizeWithMap(text) {
    const map = [];
    const chars = [];
    const lower = text.toLowerCase();
    for (let i = 0; i < text.length; i += 1) {
        const ch = lower[i];
        if (/\s/.test(ch)) continue;
        if (/[，。！？、；：""''「」『』（）【】《》,.!?;:'"()\[\]{}]/.test(ch)) continue;
        chars.push(ch);
        map.push(i);
    }
    return { normalized: chars.join(''), map };
}

function findByLongestCommonSubstring(text, anchor) {
    const a = text.toLowerCase();
    const b = anchor.toLowerCase();
    if (!a || !b) return { index: -1 };
    const minLen = Math.max(4, Math.ceil(b.length * 0.4));
    let bestLen = 0;
    let bestEndInText = -1;
    let prev = new Array(b.length + 1).fill(0);
    let curr = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            if (a[i - 1] === b[j - 1]) {
                curr[j] = prev[j - 1] + 1;
                if (curr[j] > bestLen) {
                    bestLen = curr[j];
                    bestEndInText = i;
                }
            } else {
                curr[j] = 0;
            }
        }
        const tmp = prev;
        prev = curr;
        curr = tmp;
        curr.fill(0);
    }
    if (bestLen < minLen || bestEndInText < 0) return { index: -1 };
    return { index: bestEndInText };
}

// 锚句落在同一结构时，保留锚句顺序并统一放到结构结束之后。
export function insertMarkersAtAnchors(raw, slots) {
    const source = String(raw || '');
    const placed = [];
    for (const slot of Array.isArray(slots) ? slots : []) {
        if (!slot) continue;
        const found = findAnchorInsertIndex(source, slot.anchorSentence);
        if (found.index < 0) continue;
        placed.push({ index: found.index, anchorIndex: found.anchorIndex, slot: Number(slot.slot) || placed.length + 1 });
    }
    placed.sort((a, b) => b.index - a.index || b.anchorIndex - a.anchorIndex || b.slot - a.slot);
    let text = source;
    for (const item of placed) {
        text = insertImageMarkerOnLine(text, item.index, `[igs-img:${item.slot}]`);
    }
    return text;
}

export function insertMarkers(raw, paragraphs, slots) {
    const source = String(raw || ''), lines = source.split('\n');
    const ends = [];
    let offset = 0;
    for (const line of lines) { ends.push(offset + line.length); offset += line.length + 1; }
    const placed = [];
    for (const s of slots) {
        const p = paragraphs[s.at - 1];
        if (!p) continue;
        const index = imageMarkerBoundary(source, ends[p.lineIndex]);
        if (index >= 0) placed.push({ index, slot: s.slot });
    }
    placed.sort((a, b) => b.index - a.index || b.slot - a.slot);
    let text = source;
    for (const item of placed) text = insertImageMarkerOnLine(text, item.index, `[igs-img:${item.slot}]`);
    return text;
}

/**
 * 出图期间其他插件只在正文末尾追加了内容（平行事件、状态栏等）时，返回追加的那一截；
 * 正文没变返回 ''，正文中间被改过返回 null。原文结尾的空白允许被改写。
 * @param {string} before 开始出图时的正文
 * @param {string} after 现在的正文
 * @returns {string | null}
 */
export function appendedTail(before, after) {
    const source = String(before || '');
    const current = String(after || '');
    if (current === source) return '';
    const head = source.replace(/\s+$/, '');
    if (!head || !current.startsWith(head)) return null;
    return current.slice(head.length);
}

/**
 * 把插好标记的正文接回追加的那一截。没有追加时原样返回。
 * @param {string} marked 按开始时的正文插好标记的结果
 * @param {string} tail appendedTail 的返回值
 * @returns {string}
 */
export function reattachTail(marked, tail) {
    if (!tail) return marked;
    return String(marked || '').replace(/\s+$/, '') + tail;
}

const TRANSPLANT_MARKER_RE = /\[igs-img:(\d+)\]/g;
const TRANSPLANT_CONTEXT = 60;

function contextLine(text, fromEnd) {
    const lines = splitIgsDirectiveLines(String(text || '').replace(/\[igs-img:\d+\]/g, '')).map((line) => line.text.trim()).filter(Boolean);
    const line = fromEnd ? lines[lines.length - 1] : lines[0];
    if (!line) return '';
    return fromEnd ? line.slice(-TRANSPLANT_CONTEXT) : line.slice(0, TRANSPLANT_CONTEXT);
}

/**
 * 出图期间正文被其他插件改过（开头、中间、content 外插了平行事件等）时，把按旧正文插好的标记搬到现在的正文上：
 * 每个标记按它前面一行（没有就按后面一行）的文字在新正文里找位置；对不上的那张丢掉，不连累整楼。
 * @param {string} marked 按旧正文插好标记的结果
 * @param {string} current 现在的正文
 * @returns {{ text: string, slots: number[] }} slots 为搬过去的标记编号
 */
export function transplantMarkers(marked, current) {
    const source = String(marked || '');
    const target = String(current || '');
    const placed = [];
    TRANSPLANT_MARKER_RE.lastIndex = 0;
    let match;
    while ((match = TRANSPLANT_MARKER_RE.exec(source))) {
        const slot = Number(match[1]);
        const before = contextLine(source.slice(0, match.index), true);
        let index = before ? findAnchorInsertIndex(target, before).index : -1;
        if (index < 0) {
            const after = contextLine(source.slice(match.index + match[0].length), false);
            const at = after ? target.indexOf(after) : -1;
            index = at;
        }
        if (index >= 0) placed.push({ index, slot });
    }
    placed.sort((a, b) => b.index - a.index || b.slot - a.slot);
    let text = target;
    for (const item of placed) text = insertImageMarkerOnLine(text, item.index, `[igs-img:${item.slot}]`);
    return { text, slots: placed.map((item) => item.slot).sort((a, b) => a - b) };
}
