// prompt.caption 是自动画师拼接前正文；sentPrompt 是实际发送的白名单快照。
import { checkPromptRecipe } from '../schemas/prompt-recipe.js';
import { isImageSeed } from './image-seed.js';
import { normalizeCharacterDna } from '../scene/character-dna.js';

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
    return { positive, negative, ...(caption && { caption }), ...promptProvenance(value) };
}

// 只保留协议白名单，供图片、CG、导入导出及嵌套旧 prompt 共用；显式坏版本不能降级为旧词。
export function promptProvenance(value = {}) {
    const out = {};
    const invalid = () => { throw new TypeError('PROMPT_PROVENANCE_INVALID'); };
    if (value.captionMode !== undefined) {
        if (value.captionMode !== 'final') invalid();
        out.captionMode = 'final';
    }
    if (value.promptRecipe !== undefined) {
        const raw = value.promptRecipe;
        const caption = normalizeCaption(raw?.caption);
        const checked = checkPromptRecipe(raw, caption, undefined,
            { allowArchivedCorrection: value.sentPrompt?.action === 'infill' && value.dnaSnapshot !== undefined, allowStoredNoOutfit: true });
        if (!caption || !checked.ok) invalid();
        out.promptRecipe = checked.value;
    }
    if (value.dnaSnapshot !== undefined) {
        const raw = value.dnaSnapshot;
        if (raw?.version !== 1 || !Array.isArray(raw.characters) || raw.characters.length > 16) invalid();
        out.dnaSnapshot = { version: 1, characters: raw.characters.map((c) => {
            if (!c || !['saved', 'candidate', 'scene'].includes(c.source)
                || c.dnaVersion !== (c.source === 'scene' ? 0 : 2) || (c.source === 'scene' && c.kind !== 'named')
                || typeof c.subject !== 'string' || typeof c.negative !== 'string'
                || !['named', 'reference'].includes(c.kind) || typeof c.characterKey !== 'string'
                || !Number.isInteger(c.captionIndex) || c.captionIndex < 0
                || typeof c.token !== 'string' || !['full_body', 'half_body', 'portrait', 'partial'].includes(c.framing)) invalid();
            if (c.application !== undefined) {
                const binding = out.promptRecipe?.bindings.find(b => b.captionIndex === c.captionIndex);
                if (c.application !== 'appearance_correction' || c.source !== 'saved'
                    || out.promptRecipe?.identityMode !== c.application || !binding
                    || binding.characterKey !== c.characterKey || binding.token !== c.token || binding.kind !== c.kind
                    || binding.framing !== c.framing || binding.correction.subject !== c.subject
                    || binding.correction.negative !== c.negative) invalid();
            } else if (out.promptRecipe?.identityMode === 'appearance_correction') invalid();
            return { kind: c.kind, characterKey: c.characterKey, captionIndex: c.captionIndex,
                token: c.token, framing: c.framing, source: c.source, dnaVersion: c.dnaVersion,
                ...(c.application !== undefined && { application: c.application }),
                subject: c.subject, negative: c.negative, profile: normalizeCharacterDna(c.profile) };
        }) };
        if (out.promptRecipe?.identityMode === 'appearance_correction'
            && (out.dnaSnapshot.characters.length !== out.promptRecipe.bindings.length
                || new Set(out.dnaSnapshot.characters.map(c => c.captionIndex)).size !== out.dnaSnapshot.characters.length)) invalid();
    }
    if (value.outfitSnapshot !== undefined) {
        const raw = value.outfitSnapshot;
        if (raw?.version !== 1 || !Array.isArray(raw.characters) || raw.characters.length > 16) invalid();
        const indexes = new Set();
        out.outfitSnapshot = { version: 1, characters: raw.characters.map(c => {
            if (!c || !['saved', 'candidate'].includes(c.source)
                || typeof c.characterKey !== 'string' || !c.characterKey.trim()
                || !Number.isInteger(c.captionIndex) || c.captionIndex < 0 || c.captionIndex >= 16
                || indexes.has(c.captionIndex) || typeof c.token !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(c.token)
                || typeof c.name !== 'string' || c.name.length > 128
                || typeof c.description !== 'string' || c.description.length > 4096
                || /<<\s*(?:dna|outfit)/i.test(c.description)
                || (c.descriptionHalfBody !== undefined && (typeof c.descriptionHalfBody !== 'string'
                    || !c.descriptionHalfBody.trim() || c.descriptionHalfBody.length > 4096
                    || /<<\s*(?:dna|outfit)/i.test(c.descriptionHalfBody)))) invalid();
            indexes.add(c.captionIndex);
            return { characterKey: c.characterKey, captionIndex: c.captionIndex, token: c.token,
                name: c.name, description: c.description,
                ...(c.descriptionHalfBody !== undefined && { descriptionHalfBody: c.descriptionHalfBody }), source: c.source };
        }) };
    }
    if (value.sentPrompt !== undefined) {
        const raw = value.sentPrompt;
        const caption = normalizeCaption(raw?.caption);
        if (raw?.version !== 1 || !caption || typeof raw.model !== 'string'
            || !['generate', 'img2img', 'infill'].includes(raw.action)
            || (raw.artist !== null && (!raw.artist || typeof raw.artist.positivePrompt !== 'string'
                || typeof raw.artist.negativePrompt !== 'string'))) invalid();
        out.sentPrompt = { version: 1, model: raw.model, action: raw.action, caption,
            artist: raw.artist === null ? null : { positivePrompt: raw.artist.positivePrompt, negativePrompt: raw.artist.negativePrompt } };
    }
    if (value.consistencyPrompt !== undefined) {
        const raw = value.consistencyPrompt;
        if (raw?.version !== 1 || !Array.isArray(raw.rounds) || !raw.rounds.length || raw.rounds.length > 16) invalid();
        const ids = new Set(), keys = new Set();
        out.consistencyPrompt = { version: 1, rounds: raw.rounds.map((round) => {
            if (!Number.isSafeInteger(round?.slotId) || round.slotId < 2 || ids.has(round.slotId)
                || typeof round.characterKey !== 'string' || !round.characterKey.trim()
                || keys.has(round.characterKey) || round.consistencyPrompt !== undefined) invalid();
            ids.add(round.slotId); keys.add(round.characterKey);
            const checked = promptProvenance({ promptRecipe: round.promptRecipe,
                dnaSnapshot: round.dnaSnapshot, outfitSnapshot: round.outfitSnapshot, sentPrompt: round.sentPrompt });
            if (!checked.promptRecipe || !checked.dnaSnapshot || checked.sentPrompt?.action !== 'infill'
                || !checked.promptRecipe.bindings.some((b) => b.kind === 'reference'
                    && b.characterKey === round.characterKey)) invalid();
            let appearance;
            if (round.appearance !== undefined) {
                const a = round.appearance, r = a?.reference;
                const text = (v, max) => typeof v === 'string' && v.length <= max;
                if (a?.version !== 1 || !text(a.requestedOutfit, 128) || !text(a.effectiveOutfit, 128)
                    || !a.effectiveOutfit.trim() || !text(a.requirementSource, 128)
                    || !['requested', 'default', 'default-fallback'].includes(a.selectionSource)
                    || !text(a.fallbackReason, 128) || typeof a.confirmed !== 'boolean'
                    || (a.selectionSource === 'default-fallback' && a.confirmed !== true)
                    || !text(r?.slot, 128) || !/^[0-9a-f]{16}$/.test(r?.sourceId)
                    || (r.url !== undefined && (!text(r.url, 256) || !/^igs-gen:[A-Za-z0-9_-]+$/.test(r.url)))
                    || (r.revision !== undefined && !(Number.isSafeInteger(r.revision) && r.revision >= 0)
                        && !text(r.revision, 256))
                    || ['scopeKey', 'ownerKey'].some(k => a[k] !== undefined && !text(a[k], 512))
                    || !checked.outfitSnapshot?.characters.some(c => c.characterKey === round.characterKey
                        && c.name === a.effectiveOutfit)) invalid();
                appearance = { version: 1, requestedOutfit: a.requestedOutfit, effectiveOutfit: a.effectiveOutfit,
                    requirementSource: a.requirementSource, selectionSource: a.selectionSource,
                    fallbackReason: a.fallbackReason, confirmed: a.confirmed,
                    reference: { slot: r.slot, sourceId: r.sourceId, ...(r.url !== undefined && { url: r.url }),
                        ...(r.revision !== undefined && { revision: r.revision }) },
                    ...Object.fromEntries(['scopeKey', 'ownerKey'].filter(k => a[k] !== undefined).map(k => [k, a[k]])) };
            }
            return { slotId: round.slotId, characterKey: round.characterKey, ...checked,
                ...(isImageSeed(round.seed) && { seed: round.seed }),
                ...(appearance && { appearance }) };
        }) };
    }
    return out;
}

// 后端结果的正文和来源分别归档，不从 wire 文本猜测/剥除画师。
export function storedPromptFromResult(result, fallbackCaption) {
    const prompt = normalizeStoredPrompt(result?.prompt) || promptFromCaption(result?.caption || fallbackCaption);
    return prompt ? { ...prompt, ...promptProvenance(result) } : null;
}

export function editedStoredPrompt(prompt, previous = {}) {
    const body = normalizeStoredPrompt(prompt);
    if (!body) return null;
    return { ...body, ...promptProvenance(previous), captionMode: 'final' };
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
