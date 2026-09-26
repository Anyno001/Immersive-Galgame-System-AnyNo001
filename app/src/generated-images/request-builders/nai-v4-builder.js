export const NAI_FIXED_STRUCTURE = Object.freeze({
    v4_prompt: Object.freeze({ use_coords: true, use_order: true }),
    v4_negative_prompt: Object.freeze({ legacy_uc: false }),
});

export const NAI_DEFAULT_NEGATIVE = 'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';

export const NAI_DEFAULT_SETTINGS = Object.freeze({
    transport: 'direct',
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

const GRID = [0.1, 0.3, 0.5, 0.7, 0.9];

export function snapToNaiGrid(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.5;
    return GRID.reduce((best, g) => (Math.abs(g - n) < Math.abs(best - n) ? g : best), 0.5);
}

function joinTags(...parts) {
    return parts.map((p) => String(p || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');
}

function parseSize(size) {
    const m = String(size || '').match(/(\d+)\s*[x×*]\s*(\d+)/i);
    const w = m ? Number(m[1]) : 832;
    const h = m ? Number(m[2]) : 1216;
    const round64 = (v) => Math.max(64, Math.round(v / 64) * 64);
    return { width: round64(w), height: round64(h) };
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
    return {
        input: base,
        model: String(settings.model || NAI_DEFAULT_SETTINGS.model),
        action: 'generate',
        parameters: {
            params_version: 4,
            width,
            height,
            scale: Number(settings.scale) || 5,
            sampler: String(settings.sampler || 'k_euler_ancestral'),
            steps: Math.max(1, Math.min(50, Number(settings.steps) || 28)),
            n_samples: 1,
            seed: Math.floor(random() * 4294967295),
            noise_schedule: String(settings.noiseSchedule || 'karras'),
            cfg_rescale: 0,
            skip_cfg_above_sigma: null,
            image_format: 'png',
            qualityToggle: true,
            ucPreset: 0,
            sm: false,
            sm_dyn: false,
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