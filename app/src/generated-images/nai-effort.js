const MEDIUM_MODELS = Object.freeze({
    'nai-diffusion-5-full': 'nai-diffusion-5-full-medium',
    'nai-diffusion-5-full-inpainting': 'nai-diffusion-5-full-medium-inpainting',
});

export const normalizeNaiEffort = value => value === 'medium' ? 'medium' : 'high';
export const supportsNaiEffort = model => Object.hasOwn(MEDIUM_MODELS, model);
export const isNaiMediumModel = model => Object.values(MEDIUM_MODELS).includes(model);

// 只转换本次实际选中的 V5 Full；原设置保留，切回 High 时恢复用户的步数和采样器。
export function resolveNaiEffortSettings(settings = {}) {
    const model = normalizeNaiEffort(settings.effort) === 'medium' && supportsNaiEffort(settings.model)
        ? MEDIUM_MODELS[settings.model] : settings.model;
    return isNaiMediumModel(model)
        ? { ...settings, model, steps: 14, sampler: 'k_euler_ancestral' }
        : { ...settings, model };
}
