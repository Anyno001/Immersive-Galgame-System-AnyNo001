import { stripOutfitFields } from '../../scene/directive-tags.js';

const SCENE_RE = /\[igs-scene:([^|\]\n]+)\|([^|\]\n]+)\|([^|\]\n]+)(?:\|([^\]\n]*))?\]/g;
const CHAR_RE = /\[igs-char:([^|\]\n]+)\|(?:([^|\]\n]*)\|)?([^|\]\n]+)\]?/g;
const THOUGHT_RE = /\[igs-thought:([^|\]\n]+)\|(?:([^|\]\n]*)\|)?([^|\]\n]+)\]?/g;
const IMG_RE = /(?:\[igs-img:\s*\d+\s*\]|<IMG>\s*\d+\s*<\/IMG>)/gi;
const LEADING_SCENE_RE = /^(\s*(?:\[igs-scene:[^\]\n]*\]\s*)+)/;

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
    for (let i = 0; i < lines.length; i += 1) {
        const line = stripOutfitFields(lines[i], options && options.outfitResolver);
        // 场景标签整楼都认。写在第一段 </content> 之后的转场也要算进 NSFW 和背景。
        for (const m of line.matchAll(SCENE_RE)) {
            scenes.push({ scene: m[1].trim(), time: m[2].trim(), weather: m[3].trim(), nsfw: String(m[4] || '').trim().toLowerCase() === 'nsfw' });
        }
        if (!lineInSpans(i, spans)) continue;
        for (const m of line.matchAll(CHAR_RE)) characters.add(m[1].trim());
        for (const m of line.matchAll(THOUGHT_RE)) characters.add(m[1].trim());
        const text = readableLine(line);
        if (text) paragraphs.push({ no: paragraphs.length + 1, lineIndex: i, text });
    }
    return { paragraphs, scenes, characters: Array.from(characters), isNsfw: scenes.some((s) => s.nsfw) };
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
 * 命中后落回本插件的段落编号，标记仍插在该段前面。
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
 * 在 text 中定位 anchor，返回插入下标（anchor 结束之后）；找不到返回 -1。
 * @param {string} text
 * @param {string} anchorSentence
 * @returns {{ index: number, mode: string }}
 */
export function findAnchorInsertIndex(text, anchorSentence) {
    const source = typeof text === 'string' ? text : '';
    const anchor = typeof anchorSentence === 'string' ? anchorSentence : '';
    if (!anchor) return { index: -1, mode: 'fail' };
    const exact = source.indexOf(anchor);
    if (exact !== -1) return { index: exact + anchor.length, mode: 'exact' };
    const normResult = findNormalized(source, anchor);
    if (normResult.index >= 0) return { index: normResult.index, mode: 'normalized' };
    const lcsResult = findByLongestCommonSubstring(source, anchor);
    if (lcsResult.index >= 0) return { index: lcsResult.index, mode: 'lcs' };
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

// 同一段里可以有多句生成点。按句尾插入，不按整段，避免四张标记叠在同一处。
export function insertMarkersAtAnchors(raw, slots) {
    const source = String(raw || '');
    const placed = [];
    for (const slot of Array.isArray(slots) ? slots : []) {
        if (!slot) continue;
        const found = findAnchorInsertIndex(source, slot.anchorSentence);
        if (found.index < 0) continue;
        placed.push({ index: found.index, slot: Number(slot.slot) || placed.length + 1 });
    }
    placed.sort((a, b) => b.index - a.index || b.slot - a.slot);
    let text = source;
    for (const item of placed) {
        text = insertTokenOnOwnLine(text, item.index, `[igs-img:${item.slot}]`);
    }
    return text;
}

function insertTokenOnOwnLine(text, index, token) {
    const at = Math.max(0, Math.min(text.length, Number(index) || 0));
    const before = text.slice(0, at);
    const after = text.slice(at);
    const lead = before.length === 0 || before.endsWith('\n') ? '' : '\n';
    const trail = after.length === 0 || after.startsWith('\n') ? '' : '\n';
    return before + lead + token + trail + after;
}

export function insertMarkers(raw, paragraphs, slots) {
    const lines = String(raw || '').split('\n');
    const ordered = [...slots].sort((a, b) => b.at - a.at);
    for (const s of ordered) {
        const p = paragraphs[s.at - 1];
        if (!p) continue;
        const marker = `[igs-img:${s.slot}]`;
        const line = lines[p.lineIndex];
        const lead = line.match(LEADING_SCENE_RE);
        if (lead) {
            lines[p.lineIndex] = `${lead[1].trimEnd()}${marker}${line.slice(lead[1].length)}`;
        } else {
            lines.splice(p.lineIndex, 0, marker);
        }
    }
    return lines.join('\n');
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
    const lines = String(text || '').replace(/\[igs-img:\d+\]/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
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
    for (const item of placed) text = insertTokenOnOwnLine(text, item.index, `[igs-img:${item.slot}]`);
    return { text, slots: placed.map((item) => item.slot).sort((a, b) => a - b) };
}
