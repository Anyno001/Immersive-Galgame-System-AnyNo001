const STORAGE_KEY = 'igs_image_prompt_capture';
export const PROMPT_CAPTURE_LIMIT = 8;

let entries = null;
let seq = 0;
const listeners = new Set();

function storage() {
    try { return globalThis.localStorage || null; } catch { return null; }
}

function load() {
    if (entries) return entries;
    entries = [];
    try {
        const raw = storage()?.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed)) entries = parsed.filter((e) => e && typeof e === 'object').slice(-PROMPT_CAPTURE_LIMIT);
    } catch { entries = []; }
    return entries;
}

function persist() {
    const store = storage();
    if (!store) return;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        try { store.setItem(STORAGE_KEY, JSON.stringify(entries)); return; } catch {
            entries = entries.slice(Math.ceil(entries.length / 2));
            if (!entries.length) return;
        }
    }
}

function notify() {
    for (const fn of [...listeners]) { try { fn(); } catch { /* 监听方异常不影响记录。 */ } }
}

function omitImage(value) {
    if (typeof value !== 'string' || value.length < 200) return value;
    return `[图片已省略，约${Math.max(1, Math.round(value.length * 0.75 / 1024))} KB]`;
}

function sanitize(wire) {
    const body = JSON.parse(JSON.stringify(wire));
    if (body.parameters && typeof body.parameters === 'object') {
        for (const key of ['image', 'mask']) if (key in body.parameters) body.parameters[key] = omitImage(body.parameters[key]);
    }
    if ('image' in body) body.image = omitImage(body.image);
    delete body.apiKey;
    return body;
}

function kindOf(wire) {
    if (wire?.req_type) return 'emotion';
    if (wire?.action === 'infill') return 'infill';
    return 'generate';
}

export function capturePrompt(wire, meta = {}) {
    if (!wire || typeof wire !== 'object') return null;
    const entry = {
        id: `pc${Date.now().toString(36)}${(seq += 1)}`,
        at: Date.now(),
        kind: kindOf(wire),
        model: String(wire.model || ''),
        endpointKind: String(meta.endpointKind || ''),
        transport: String(meta.transport || ''),
        body: sanitize(wire),
    };
    load().push(entry);
    if (entries.length > PROMPT_CAPTURE_LIMIT) entries = entries.slice(-PROMPT_CAPTURE_LIMIT);
    persist();
    notify();
    return entry;
}

export function listPromptCaptures() {
    return [...load()].reverse();
}

export function clearPromptCaptures() {
    const removed = load().length;
    entries = [];
    persist();
    notify();
    return { removed };
}

export function onPromptCaptureChange(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
}

const KIND_LABEL = { generate: '生图', infill: '局部重绘', emotion: '导演工具' };
export const promptCaptureKindLabel = (kind) => KIND_LABEL[kind] || String(kind || '');

export function formatCaptureTime(at) {
    const d = new Date(at);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function formatPromptCapture(entry) {
    const body = entry?.body || {};
    const p = body.parameters || {};
    const lines = [`时间：${formatCaptureTime(entry.at)}`, `类型：${promptCaptureKindLabel(entry.kind)}`, `模型：${entry.model || '未知'}`];
    const width = p.width ?? body.width;
    const height = p.height ?? body.height;
    if (width && height) lines.push(`尺寸：${width}x${height}`);
    if (p.steps != null) lines.push(`步数：${p.steps}`);
    if (p.sampler) lines.push(`采样：${p.sampler}`);
    if (p.seed != null) lines.push(`种子：${p.seed}`);
    if (p.strength != null) lines.push(`强度：${p.strength}`);
    if (p.straight_alpha) lines.push('透明底：是');
    lines.push(`通道：${[entry.endpointKind, entry.transport].filter(Boolean).join('·') || '未知'}`);
    if (entry.kind === 'emotion') {
        lines.push('', '提示词（prompt）：', String(body.prompt ?? ''));
    } else {
        lines.push('', '正面（input）：', String(body.input ?? ''), '', '负面（negative_prompt）：', String(p.negative_prompt ?? ''));
        const pos = p.v4_prompt?.caption?.char_captions || [];
        const neg = p.v4_negative_prompt?.caption?.char_captions || [];
        const count = Math.max(pos.length, neg.length);
        for (let i = 0; i < count; i += 1) {
            lines.push('', `角色段${i + 1}正面：`, String(pos[i]?.char_caption ?? ''), `角色段${i + 1}负面：`, String(neg[i]?.char_caption ?? ''));
        }
    }
    lines.push('', '完整请求体（JSON）：', JSON.stringify(body, null, 2));
    return lines.join('\n');
}

export function formatAllPromptCaptures(list = listPromptCaptures()) {
    return list.map((e) => formatPromptCapture(e)).join('\n\n========================================\n\n');
}
