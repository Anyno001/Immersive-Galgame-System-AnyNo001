// 出图时实际交给模型的正负提示词。只存文本，不存密钥和整份请求体。

function sideText(node) {
    const cap = node && node.caption && typeof node.caption === 'object' ? node.caption : {};
    const base = String(cap.base_caption || '').trim();
    const chars = (Array.isArray(cap.char_captions) ? cap.char_captions : [])
        .map((item) => String(item && item.char_caption || '').trim())
        .filter(Boolean);
    return [base, ...chars].filter(Boolean).join('\n');
}

function captionSide(node) {
    const cap = node && node.caption && typeof node.caption === 'object' ? node.caption : null;
    if (!cap) return null;
    const chars = (Array.isArray(cap.char_captions) ? cap.char_captions : [])
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
            const text = String(item.char_caption || '');
            const centers = (Array.isArray(item.centers) ? item.centers : [])
                .filter((point) => point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)))
                .map((point) => ({ x: Number(point.x), y: Number(point.y) }));
            return centers.length ? { char_caption: text, centers } : { char_caption: text };
        });
    return { base_caption: String(cap.base_caption || ''), char_captions: chars };
}

function normalizeCaption(caption) {
    if (!caption || typeof caption !== 'object') return null;
    const positive = captionSide(caption.v4_prompt);
    const negative = captionSide(caption.v4_negative_prompt);
    if (!positive || !negative) return null;
    const hasText = positive.base_caption.trim()
        || negative.base_caption.trim()
        || positive.char_captions.some((item) => item.char_caption.trim())
        || negative.char_captions.some((item) => item.char_caption.trim());
    if (!hasText) return null;
    return {
        v4_prompt: { caption: positive },
        v4_negative_prompt: { caption: negative },
    };
}

function coordText(chars) {
    const point = (Array.isArray(chars) ? chars : [])
        .map((item) => (item && Array.isArray(item.centers) ? item.centers[0] : null))
        .find((item) => item && Number.isFinite(item.x) && Number.isFinite(item.y));
    if (!point) return '';
    return `${Number(point.x).toFixed(2)}, ${Number(point.y).toFixed(2)}`;
}

function formatCaptionText(caption) {
    const positive = caption.v4_prompt.caption;
    const negative = caption.v4_negative_prompt.caption;
    const blocks = [];
    const scene = ['场景'];
    if (positive.base_caption.trim()) scene.push(`正面：${positive.base_caption.trim()}`);
    if (negative.base_caption.trim()) scene.push(`负面：${negative.base_caption.trim()}`);
    if (scene.length > 1) blocks.push(scene.join('\n'));
    const count = Math.max(positive.char_captions.length, negative.char_captions.length);
    for (let i = 0; i < count; i += 1) {
        const charPositive = positive.char_captions[i] || { char_caption: '' };
        const charNegative = negative.char_captions[i] || { char_caption: '' };
        const lines = [`角色${i + 1}`];
        if (String(charPositive.char_caption || '').trim()) lines.push(`正面：${String(charPositive.char_caption).trim()}`);
        if (String(charNegative.char_caption || '').trim()) lines.push(`负面：${String(charNegative.char_caption).trim()}`);
        const at = coordText([charPositive, charNegative]);
        if (at) lines.push(`位置：${at}`);
        if (lines.length > 1) blocks.push(lines.join('\n'));
    }
    return blocks.join('\n\n');
}

export function promptFromCaption(caption) {
    if (!caption || typeof caption !== 'object') return null;
    const positive = sideText(caption.v4_prompt);
    const negative = sideText(caption.v4_negative_prompt);
    const structured = normalizeCaption(caption);
    if (!positive && !negative && !structured) return null;
    return structured ? { positive, negative, caption: structured } : { positive, negative };
}

export function promptFromText(positive, negative) {
    const pos = String(positive || '').trim();
    const neg = String(negative || '').trim();
    if (!pos && !neg) return null;
    return { positive: pos, negative: neg };
}

export function promptFromNaiBody(body) {
    if (!body || typeof body !== 'object') return null;
    const parameters = body.parameters && typeof body.parameters === 'object' ? body.parameters : {};
    return promptFromCaption({
        v4_prompt: parameters.v4_prompt,
        v4_negative_prompt: parameters.v4_negative_prompt,
    }) || promptFromText(body.input, parameters.negative_prompt);
}

export function normalizeStoredPrompt(value) {
    if (!value || typeof value !== 'object') return null;
    const positive = String(value.positive || '').trim();
    const negative = String(value.negative || '').trim();
    const caption = normalizeCaption(value.caption);
    if (!positive && !negative && !caption) return null;
    return caption ? { positive, negative, caption } : { positive, negative };
}

export function formatStoredPrompt(prompt) {
    const value = normalizeStoredPrompt(prompt);
    if (!value) return '';
    if (value.caption) {
        const structured = formatCaptionText(value.caption);
        if (structured) return structured;
    }
    return `正面\n${value.positive || '（空）'}\n\n负面\n${value.negative || '（空）'}`;
}

const EDIT_FIELD_RE = /^(slotid|scene|scene_uc|char|char_uc)\s*:\s*(.*)$/i;

function formatCaptionFields(caption) {
    const pos = caption.v4_prompt.caption;
    const neg = caption.v4_negative_prompt.caption;
    const lines = ['slotid: 1'];
    if (pos.base_caption.trim()) lines.push(`scene: ${pos.base_caption.trim()}`);
    if (neg.base_caption.trim()) lines.push(`scene_uc: ${neg.base_caption.trim()}`);
    const count = Math.max(pos.char_captions.length, neg.char_captions.length);
    for (let i = 0; i < count; i += 1) {
        const item = pos.char_captions[i] || { char_caption: '' };
        const uc = neg.char_captions[i] || { char_caption: '' };
        const center = Array.isArray(item.centers) ? item.centers[0] : null;
        const x = center && Number.isFinite(Number(center.x)) ? Number(center.x) : 0.5;
        const y = center && Number.isFinite(Number(center.y)) ? Number(center.y) : 0.5;
        const text = String(item.char_caption || '').trim();
        const negative = String(uc.char_caption || '').trim();
        if (text) lines.push(`char: ${x},${y} | ${text}`);
        if (negative) lines.push(`char_uc: ${negative}`);
    }
    return lines.join('\n');
}

// 单张立绘的提示词编辑框：有结构就按插件字段展示，改完还能按原结构重画。
export function formatEditablePrompt(prompt) {
    const value = normalizeStoredPrompt(prompt);
    if (!value) return '';
    if (value.caption) {
        const fields = formatCaptionFields(value.caption);
        if (fields) return fields;
    }
    const lines = [];
    if (value.positive) lines.push(`scene: ${value.positive}`);
    if (value.negative) lines.push(`scene_uc: ${value.negative}`);
    return lines.join('\n');
}

export function parseEditablePrompt(text) {
    const raw = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return null;
    const lines = raw.split('\n');
    if (!lines.some((line) => EDIT_FIELD_RE.test(line.trim()))) return promptFromText(raw, '');
    let scene = '';
    let sceneUc = '';
    const chars = [];
    const ucs = [];
    for (const line of lines) {
        const match = EDIT_FIELD_RE.exec(line.trim());
        if (!match) continue;
        const key = match[1].toLowerCase();
        const body = match[2].trim();
        if (key === 'scene') scene = body;
        else if (key === 'scene_uc') sceneUc = body;
        else if (key === 'char') {
            const parts = body.split('|');
            let x = 0.5;
            let y = 0.5;
            let captionText = body;
            if (parts.length >= 2) {
                const coords = parts[0].trim().split(',');
                const nx = Number(coords[0]);
                const ny = Number(coords[1]);
                if (Number.isFinite(nx) && Number.isFinite(ny)) {
                    x = nx;
                    y = ny;
                    captionText = parts.slice(1).join('|').trim();
                }
            }
            chars.push({ char_caption: captionText, centers: [{ x, y }] });
        } else if (key === 'char_uc') ucs.push({ char_caption: body });
    }
    const count = Math.max(chars.length, ucs.length);
    while (ucs.length < count) ucs.push({ char_caption: '' });
    return promptFromCaption({
        v4_prompt: { caption: { base_caption: scene, char_captions: chars } },
        v4_negative_prompt: { caption: { base_caption: sceneUc, char_captions: ucs.slice(0, count) } },
    });
}
