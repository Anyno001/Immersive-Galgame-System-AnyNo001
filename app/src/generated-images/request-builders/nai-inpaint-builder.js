// NAI 局部重绘（infill）请求：复用 V4 结构化 caption，只切换 action / model 并附上原图与遮罩。
// 只接受白名单基础模型或对应专模；不猜后缀、不跨模型回退。
// 字段形状按公开客户端常见格式构造，真实接口兼容性需真机验证；本模块不发请求、不记录原图。
import { buildNaiV4Request, NAI_DEFAULT_SETTINGS } from './nai-v4-builder.js';
import { CG_PIXEL_CAP } from '../illustration/cg-pixel-cap.js';
import { inspectPngDataUrl } from '../../media/png-validation.js';

const INPAINT_MODELS = Object.freeze({
    'nai-diffusion-5-full': 'nai-diffusion-5-full-inpainting',
    'nai-diffusion-4-5-full': 'nai-diffusion-4-5-full-inpainting',
    'nai-diffusion-4-5-curated': 'nai-diffusion-4-5-curated-inpainting',
    'nai-diffusion-4-full': 'nai-diffusion-4-full-inpainting',
    'nai-diffusion-4-curated-preview': 'nai-diffusion-4-curated-inpainting',
});

export function resolveNaiInpaintModel(model) {
    if (typeof model !== 'string') return '';
    return Object.hasOwn(INPAINT_MODELS, model) ? INPAINT_MODELS[model]
        : Object.values(INPAINT_MODELS).includes(model) ? model : '';
}

const validSide = (v) => Number.isInteger(v) && v >= 64 && v <= 4096 && v % 64 === 0;

// request：{ sourceDataUrl, maskDataUrl, prompt, negative, width, height, strength }
export function buildNaiInpaintRequest(request = {}, naiSettings = {}, random = Math.random) {
    const baseModel = Object.hasOwn(request, 'model') ? request.model
        : Object.hasOwn(naiSettings, 'model') ? naiSettings.model : NAI_DEFAULT_SETTINGS.model;
    const model = resolveNaiInpaintModel(baseModel);
    if (!model) return { ok: false, reason: 'image-edit-unsupported' };
    const width = request.width, height = request.height;
    if (!validSide(width) || !validSide(height) || width * height > CG_PIXEL_CAP) return { ok: false, reason: 'invalid-size' };
    const strength = request.strength === undefined ? 0.7 : request.strength;
    if (!Number.isFinite(strength) || strength < 0.1 || strength > 1)
        return { ok: false, reason: 'invalid-strength' };
    const options = { width, height, maxPixels: CG_PIXEL_CAP };
    const image = inspectPngDataUrl(request.sourceDataUrl, options);
    const mask = inspectPngDataUrl(request.maskDataUrl, options);
    if (!image.ok || !mask.ok) return { ok: false, reason: !image.ok ? image.reason : mask.reason };
    const final = request.captionMode === 'final';
    if (request.captionMode !== undefined && !final) return { ok: false, reason: 'PROMPT_MODE_CONFLICT' };
    if (final ? !request.caption : !String(request.prompt || '').trim()) return { ok: false, reason: 'empty-prompt' };
    if (final && ![request.caption.v4_prompt?.caption?.base_caption,
        ...(request.caption.v4_prompt?.caption?.char_captions || []).map((c) => c.char_caption)].some((v) => typeof v === 'string' && v.trim()))
        return { ok: false, reason: 'empty-prompt' };
    const body = buildNaiV4Request(
        final ? { caption: request.caption, captionMode: 'final' }
            : { scene: String(request.prompt || ''), sceneUc: String(request.negative || ''), chars: [] },
        { ...naiSettings, model: baseModel, size: `${width}x${height}`,
            ...(request.seed !== undefined && { seed: request.seed }) },
        random,
    );
    body.model = model;
    body.action = 'infill';
    body.parameters = {
        ...body.parameters,
        image: image.base64,
        mask: mask.base64,
        inpaintImg2ImgStrength: strength,
        ...(strength < 1 && { img2img: { strength, color_correct: true } }),
        noise: 0,
        add_original_image: true,
        straight_alpha: false,
        tag_hint_transparent_background: false,
    };
    return { ok: true, body };
}
