import { stripOutfitFields } from '../../scene/directive-tags.js';

const SCENE_RE = /\[igs-scene:([^|\]\n]+)\|([^|\]\n]+)\|([^|\]\n]+)(?:\|([^\]\n]*))?\]/g;
const CHAR_RE = /\[igs-char:([^|\]\n]+)\|(?:([^|\]\n]*)\|)?([^|\]\n]+)\]?/g;
const THOUGHT_RE = /\[igs-thought:([^|\]\n]+)\|(?:([^|\]\n]*)\|)?([^|\]\n]+)\]?/g;
const IMG_RE = /(?:\[igs-img:\s*\d+\s*\]|<IMG>\s*\d+\s*<\/IMG>)/gi;
const LEADING_SCENE_RE = /^(\s*(?:\[igs-scene:[^\]\n]*\]\s*)+)/;

function contentRange(lines) {
    const start = lines.findIndex((l) => /<content\b[^>]*>/i.test(l));
    if (start < 0) return [0, lines.length - 1];
    let end = lines.length - 1;
    for (let i = start; i < lines.length; i += 1) {
        if (/<\/content>/i.test(lines[i])) { end = i; break; }
    }
    return [start, end];
}

function readableLine(line) {
    return String(line || '')
        .replace(IMG_RE, '')
        .replace(SCENE_RE, '')
        .replace(CHAR_RE, (_, name, _mood, text) => `${name.trim()}：「${text.trim()}」`)
        .replace(THOUGHT_RE, (_, name, _mood, text) => `${name.trim()}（心想）：${text.trim()}`)
        .replace(/<\/?[a-zA-Z][^>]*>/g, '')
        .trim();
}

export function numberParagraphs(raw, options = {}) {
    const lines = String(raw || '').split('\n');
    const [from, to] = contentRange(lines);
    const paragraphs = [];
    const scenes = [];
    const characters = new Set();
    for (let i = from; i <= to; i += 1) {
        const line = stripOutfitFields(lines[i], options && options.outfitResolver);
        for (const m of line.matchAll(SCENE_RE)) {
            scenes.push({ scene: m[1].trim(), time: m[2].trim(), weather: m[3].trim(), nsfw: String(m[4] || '').trim().toLowerCase() === 'nsfw' });
        }
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
