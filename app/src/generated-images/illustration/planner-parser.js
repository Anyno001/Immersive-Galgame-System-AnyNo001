import { snapToNaiGrid } from '../request-builders/nai-v4-builder.js';

const FIELD_RE = /^\s*[-*]?\s*(slot|at|analysis|scene_uc|scene|char_uc|char)\s*[:：]\s*(.*)$/i;

function parseCharLine(value) {
    const bar = value.search(/[|｜]/);
    let x = 0.5;
    let y = 0.5;
    let tags = value;
    if (bar >= 0) {
        const coord = value.slice(0, bar).match(/([\d.]+)\s*[,，]\s*([\d.]+)/);
        if (coord) { x = snapToNaiGrid(coord[1]); y = snapToNaiGrid(coord[2]); }
        tags = value.slice(bar + 1);
    }
    return { x, y, tags: tags.trim(), uc: '' };
}

export function parseIllustrationPlan(text, { maxSlots = 1, paragraphCount = 1 } = {}) {
    const lines = String(text || '').replace(/```[a-zA-Z]*\s*/g, '').split(/\r?\n/);
    const slots = [];
    let current = null;
    let lastKey = '';
    const begin = () => {
        current = { at: null, analysis: '', scene: '', sceneUc: '', chars: [] };
        slots.push(current);
    };
    for (const line of lines) {
        const m = line.match(FIELD_RE);
        if (!m) {
            if (current && lastKey === 'analysis' && line.trim()) current.analysis += ` ${line.trim()}`;
            continue;
        }
        const key = m[1].toLowerCase();
        const value = m[2].trim();
        if (key === 'slot') { begin(); lastKey = key; continue; }
        if (!current) begin();
        lastKey = key;
        if (key === 'at') current.at = parseInt(value.replace(/[^\d]/g, ''), 10);
        else if (key === 'analysis') current.analysis = value;
        else if (key === 'scene') current.scene = value;
        else if (key === 'scene_uc') current.sceneUc = value;
        else if (key === 'char') current.chars.push(parseCharLine(value));
        else if (key === 'char_uc' && current.chars.length) current.chars[current.chars.length - 1].uc = value;
    }
    const usable = slots.filter((s) => s.scene || s.chars.some((c) => c.tags)).slice(0, Math.max(1, maxSlots));
    const count = Math.max(1, paragraphCount);
    const used = new Set();
    usable.forEach((s, i) => {
        let at = Number.isInteger(s.at) && s.at >= 1 && s.at <= count ? s.at : Math.max(1, Math.round(((i + 1) * count) / (usable.length + 1)));
        while (used.has(at) && at < count) at += 1;
        s.at = at;
        used.add(at);
    });
    const deduped = usable.filter((s, i, arr) => arr.findIndex((o) => o.at === s.at) === i).sort((a, b) => a.at - b.at);
    deduped.forEach((s, i) => { s.slot = i + 1; });
    return deduped.length ? { ok: true, slots: deduped } : { ok: false, slots: [], error: '副 LLM 输出中没有可用的插图字段' };
}
