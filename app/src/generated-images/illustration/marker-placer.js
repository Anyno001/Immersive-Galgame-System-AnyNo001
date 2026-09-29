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
