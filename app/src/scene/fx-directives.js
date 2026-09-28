export const FX_TAG_KINDS = Object.freeze(['call', 'notify', 'flashback', 'letterbox', 'sfx', 'eye']);
export const FX_RANGE_KINDS = Object.freeze(['call', 'flashback', 'letterbox']);
export const FX_EYE_MODES = Object.freeze(['open', 'close']);

const FX_TAG_RE = /\[igs-fx:([^\]\n]*)(?:\]|$)/gm;
const FIELD_MAX = 60;

function field(value) {
    return String(value == null ? '' : value).trim().slice(0, FIELD_MAX);
}

// 返回 { kind, end, args } 或 null；end 表示区间结束标签（call-end 等）。
export function parseFxBody(body) {
    const parts = String(body || '').split('|').map(field);
    const head = parts[0].toLowerCase();
    const isEnd = head.endsWith('-end');
    const kind = isEnd ? head.slice(0, -4) : head;
    if (!FX_TAG_KINDS.includes(kind)) return null;
    if (isEnd) return FX_RANGE_KINDS.includes(kind) ? { kind, end: true, args: [] } : null;
    const args = parts.slice(1);
    if (kind === 'call' && !args[0]) return null;
    if (kind === 'notify' && !args[1] && !args[0]) return null;
    if (kind === 'sfx' && !args[0]) return null;
    if (kind === 'eye') {
        const mode = String(args[0] || '').toLowerCase();
        if (!FX_EYE_MODES.includes(mode)) return null;
        return { kind, end: false, args: [mode] };
    }
    return { kind, end: false, args };
}

export function hasFxTags(text) {
    return String(text || '').includes('[igs-fx:');
}

export function extractFxDirectives(source) {
    const text = String(source || '');
    if (!hasFxTags(text)) return [];
    const out = [];
    for (const m of text.matchAll(FX_TAG_RE)) {
        const parsed = parseFxBody(m[1]);
        if (parsed) out.push({ ...parsed, offset: m.index });
    }
    return out;
}

function instantOf(d) {
    if (d.kind === 'call') return d.end ? { kind: 'call-end' } : { kind: 'call', name: d.args[0] };
    if (d.kind === 'notify') return { kind: 'notify', sender: d.args[1] ? d.args[0] : '', text: d.args[1] || d.args[0] };
    if (d.kind === 'sfx') return { kind: 'sfx', text: d.args[0] };
    if (d.kind === 'eye') return { kind: 'eye', mode: d.args[0] };
    return null;
}

// 瞬时标签落在 (prevOffset, offset] 内时归当前页；首页 prevOffset 传 -1。
// 区间状态取 offset 之前最近一次开/关；同类瞬时演出每页只取第一个。
export function resolveFxAtPage(directives, offset, prevOffset = -1) {
    const result = { instants: [], call: null, flashback: false, letterbox: false };
    const at = Number(offset);
    if (!Array.isArray(directives) || !directives.length || !Number.isFinite(at) || at < 0) return result;
    const from = Number.isFinite(Number(prevOffset)) ? Number(prevOffset) : -1;
    const seen = new Set();
    for (const d of directives) {
        if (d.offset > at) break;
        if (d.kind === 'call') result.call = d.end ? null : { name: d.args[0] };
        else if (d.kind === 'flashback') result.flashback = !d.end;
        else if (d.kind === 'letterbox') result.letterbox = !d.end;
        if (d.offset <= from) continue;
        const instant = instantOf(d);
        if (!instant || seen.has(instant.kind)) continue;
        seen.add(instant.kind);
        result.instants.push(instant);
    }
    return result;
}

export function filterFxByKinds(fx, enabledKinds) {
    const allow = new Set(enabledKinds || []);
    return {
        instants: fx.instants.filter((item) => allow.has(item.kind === 'call-end' ? 'call' : item.kind)),
        call: allow.has('call') ? fx.call : null,
        flashback: allow.has('flashback') && fx.flashback,
        letterbox: allow.has('letterbox') && fx.letterbox,
    };
}
