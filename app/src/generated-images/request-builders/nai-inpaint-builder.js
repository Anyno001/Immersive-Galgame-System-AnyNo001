// NAI 局部重绘（infill）请求：复用 V4 结构化 caption，只切换 action / model 并附上原图与遮罩。
// 模型映射只列已知存在 inpainting 版本的模型；未知模型（含 V5）返回空串，调用方按 image-edit-unsupported 处理。
// 字段形状按公开客户端常见格式构造，真实接口兼容性需真机验证；本模块不发请求、不记录原图。
import { buildNaiV4Request, NAI_DEFAULT_SETTINGS } from './nai-v4-builder.js';

const INPAINT_MODELS = Object.freeze({
    'nai-diffusion-4-5-full': 'nai-diffusion-4-5-full-inpainting',
    'nai-diffusion-4-5-curated': 'nai-diffusion-4-5-curated-inpainting',
    'nai-diffusion-4-full': 'nai-diffusion-4-full-inpainting',
    'nai-diffusion-4-curated-preview': 'nai-diffusion-4-curated-inpainting',
});

export function resolveNaiInpaintModel(model) {
    const key = String(model || '').trim();
    return Object.prototype.hasOwnProperty.call(INPAINT_MODELS, key) ? INPAINT_MODELS[key] : '';
}

function stripDataUrl(value) {
    const text = String(value || '');
    const m = /^data:image\/[a-z0-9.+-]+;base64,/i.exec(text);
    return m ? text.slice(m[0].length) : '';
}

const validSide = (v) => Number.isInteger(v) && v >= 64 && v % 64 === 0;

// request：{ sourceDataUrl, maskDataUrl, prompt, negative, width, height, strength }
export function buildNaiInpaintRequest(request = {}, naiSettings = {}, random = Math.random) {
    const baseModel = String(naiSettings.model || NAI_DEFAULT_SETTINGS.model);
    const model = resolveNaiInpaintModel(baseModel);
    if (!model) return { ok: false, reason: 'image-edit-unsupported' };
    const image = stripDataUrl(request.sourceDataUrl);
    const mask = stripDataUrl(request.maskDataUrl);
    if (!image || !mask) return { ok: false, reason: 'invalid-edit-request' };
    const width = Number(request.width);
    const height = Number(request.height);
    if (!validSide(width) || !validSide(height)) return { ok: false, reason: 'invalid-size' };
    if (!String(request.prompt || '').trim()) return { ok: false, reason: 'empty-prompt' };
    const body = buildNaiV4Request(
        { scene: String(request.prompt || ''), sceneUc: String(request.negative || ''), chars: [] },
        { ...naiSettings, model: baseModel, size: `${width}x${height}` },
        random,
    );
    const strength = Number(request.strength);
    body.model = model;
    body.action = 'infill';
    body.parameters = {
        ...body.parameters,
        image,
        mask,
        strength: Number.isFinite(strength) ? Math.max(0.1, Math.min(1, strength)) : 0.7,
        noise: 0,
        add_original_image: true,
    };
    return { ok: true, body };
}
