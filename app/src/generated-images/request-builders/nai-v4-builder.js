import { clampPixelPair } from '../illustration/cg-pixel-cap.js';

export const NAI_OFFICIAL_ENDPOINT = 'https://image.novelai.net/ai/generate-image';

export const NAI_FIXED_STRUCTURE = Object.freeze({
    v4_prompt: Object.freeze({ use_coords: true, use_order: true }),
    v4_negative_prompt: Object.freeze({ legacy_uc: false }),
});

export const NAI_DEFAULT_NEGATIVE = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';

export const NAI_DEFAULT_SETTINGS = Object.freeze({
    transport: 'direct',
    endpoint: '',
    apiKey: '',
    model: 'nai-diffusion-4-5-full',
    size: '832x1216',
    steps: 28,
    scale: 5,
    sampler: 'k_euler_ancestral',
    noiseSchedule: 'karras',
    artistPrefix: '',
    negativePrompt: NAI_DEFAULT_NEGATIVE,
    timeoutMs: 120000,
});

// NAI 官方没有模型列表接口；请求体是 V4 结构，只列 V4 及以后的模型。
export const NAI_OFFICIAL_MODELS = Object.freeze([
    'nai-diffusion-5-full',
    'nai-diffusion-5-curated',
    'nai-diffusion-4-5-full',
    'nai-diffusion-4-5-curated',
    'nai-diffusion-4-full',
    'nai-diffusion-4-curated-preview',
]);

// 地址留空、填 novelai.net 官方域名、或以 /ai/generate-image 结尾的第三方中转走 NAI 原生格式；其余地址返回空串。
export function resolveNaiNativeEndpoint(endpoint) {
    const trimmed = String(endpoint || '').trim();
    if (!trimmed) return NAI_OFFICIAL_ENDPOINT;
    let parsed;
    try { parsed = new URL(trimmed); } catch (error) { return ''; }
    const path = parsed.pathname.replace(/\/+$/, '');
    if (/(^|\.)novelai\.net$/i.test(parsed.hostname)) return path ? trimmed : NAI_OFFICIAL_ENDPOINT;
    return /\/ai\/generate-image$/i.test(path) ? trimmed : '';
}

const GRID = [0.1, 0.3, 0.5, 0.7, 0.9];

export function snapToNaiGrid(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.5;
    return GRID.reduce((best, g) => (Math.abs(g - n) < Math.abs(best - n) ? g : best), 0.5);
}

function joinTags(...parts) {
    return parts.map((p) => String(p || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');
}

// 仅 V5 支持原生透明底；4.5 的模型名含「-5-full」子串，必须先排除。
export function supportsNaiTransparentBackground(model) {
    const m = String(model || '').toLowerCase();
    if (m.includes('4-5') || m.includes('4.5')) return false;
    return m.includes('diffusion-5');
}

// 请求体里的采样器与噪声计划必须在 NAI 支持范围内，手填错值或 V5 用非 Karras 都会直接回 500。
export const NAI_SAMPLERS = Object.freeze(['k_euler_ancestral', 'k_euler', 'k_dpmpp_2s_ancestral', 'k_dpmpp_2m', 'k_dpmpp_sde', 'ddim_v3']);
export const NAI_NOISE_SCHEDULES = Object.freeze(['karras', 'native', 'exponential', 'polyexponential']);

function isNaiV5(model) {
    return supportsNaiTransparentBackground(model);
}

function resolveSampler(value) {
    const v = String(value || '').trim();
    return NAI_SAMPLERS.includes(v) ? v : NAI_DEFAULT_SETTINGS.sampler;
}

function resolveNoiseSchedule(value, model) {
    const v = String(value || '').trim();
    if (isNaiV5(model)) return 'karras';
    return NAI_NOISE_SCHEDULES.includes(v) ? v : NAI_DEFAULT_SETTINGS.noiseSchedule;
}

function parseSize(size) {
    const m = String(size || '').match(/(\d+)\s*[x×*]\s*(\d+)/i);
    const w = m ? Number(m[1]) : 832;
    const h = m ? Number(m[2]) : 1216;
    return clampPixelPair(w, h);
}

export function buildNaiV4Request(slot, naiSettings = {}, random = Math.random) {
    const settings = { ...NAI_DEFAULT_SETTINGS, ...naiSettings };
    const chars = Array.isArray(slot && slot.chars) ? slot.chars.filter((c) => c && String(c.tags || '').trim()) : [];
    const base = joinTags(settings.artistPrefix, slot && slot.scene);
    const negBase = joinTags(settings.negativePrompt, slot && slot.sceneUc);
    const posChars = chars.map((c) => ({
        char_caption: String(c.tags).trim(),
        centers: [{ x: snapToNaiGrid(c.x), y: snapToNaiGrid(c.y) }],
    }));
    const negChars = chars.map((c, i) => ({
        char_caption: String(c.uc || '').trim(),
        centers: posChars[i].centers,
    }));
    const useCoords = posChars.length > 0;
    const { width, height } = parseSize(settings.size);
    const model = String(settings.model || NAI_DEFAULT_SETTINGS.model);
    const transparent = slot && slot.transparent === true && supportsNaiTransparentBackground(model);
    return {
        input: base,
        model,
        action: 'generate',
        parameters: {
            params_version: 4,
            width,
            height,
            scale: Number(settings.scale) || 5,
            sampler: resolveSampler(settings.sampler),
            steps: Math.max(1, Math.min(50, Number(settings.steps) || 28)),
            n_samples: 1,
            seed: Math.floor(random() * 4294967295),
            noise_schedule: resolveNoiseSchedule(settings.noiseSchedule, model),
            cfg_rescale: 0,
            skip_cfg_above_sigma: null,
            image_format: 'png',
            qualityToggle: true,
            tag_hint_qt: true,
            ucPreset: 0,
            tag_hint_uc_preset: true,
            ...(transparent && { straight_alpha: true, tag_hint_transparent_background: true }),
            negative_prompt: negBase,
            use_coords: useCoords,
            v4_prompt: {
                caption: { base_caption: base, char_captions: posChars },
                use_coords: useCoords,
                use_order: NAI_FIXED_STRUCTURE.v4_prompt.use_order,
            },
            v4_negative_prompt: {
                caption: { base_caption: negBase, char_captions: negChars },
                ...NAI_FIXED_STRUCTURE.v4_negative_prompt,
            },
        },
    };
}


export function validateNaiV4Request(request) {
    if (!request || typeof request !== 'object') return { ok: false, reason: 'invalid-request' };
    if (!String(request.input || '').trim()) return { ok: false, reason: 'empty-prompt' };
    const p = request.parameters || {};
    if (!p.width || !p.height) return { ok: false, reason: 'invalid-size' };
    return { ok: true };
}

export const naiV4Builder = Object.freeze({
    providerType: 'nai-official',
    schemaVersion: 1,
    buildRequest(promptContext, promptPreset, providerPreset) {
        return buildNaiV4Request(promptContext, providerPreset);
    },
    validateRequest: validateNaiV4Request,
});