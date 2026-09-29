import { prefersReducedMotion } from './reduced-motion.js';

export const RENDER_QUALITY_SETTINGS = Object.freeze(['auto', 'normal', 'low']);

export const RENDER_QUALITY_OPTIONS = Object.freeze([
    Object.freeze(['auto', '自动']),
    Object.freeze(['normal', '标准']),
    Object.freeze(['low', '低画质']),
]);

const NORMAL_FACTOR = Object.freeze({ density: 1, fps: null, dprCap: null });
const LOW_FACTOR = Object.freeze({ density: 0.5, fps: 20, dprCap: 1 });

let appliedTier = 'normal';
let cachedMatchMedia = null;
let cachedCoarseQuery = null;

export function normalizeRenderQualitySetting(value) {
    return RENDER_QUALITY_SETTINGS.includes(value) ? value : 'auto';
}

function isCoarsePointer(nav) {
    const matchMedia = globalThis.matchMedia;
    if (typeof matchMedia === 'function') {
        if (matchMedia !== cachedMatchMedia || !cachedCoarseQuery) {
            cachedMatchMedia = matchMedia;
            try {
                cachedCoarseQuery = globalThis.matchMedia('(pointer: coarse)');
            } catch {
                cachedCoarseQuery = null;
            }
        }
        if (cachedCoarseQuery) return Boolean(cachedCoarseQuery.matches);
    }
    return Number(nav && nav.maxTouchPoints) > 0;
}

export function isLowEndDevice(nav = globalThis.navigator) {
    if (!nav) return false;
    const memory = Number(nav.deviceMemory);
    if (Number.isFinite(memory) && memory > 0 && memory <= 4) return true;
    const cores = Number(nav.hardwareConcurrency);
    return Number.isFinite(cores) && cores > 0 && cores <= 4 && isCoarsePointer(nav);
}

export function resolveRenderQuality(setting) {
    const normalized = normalizeRenderQualitySetting(setting);
    if (normalized !== 'auto') return normalized;
    return isLowEndDevice() || prefersReducedMotion() ? 'low' : 'normal';
}

export function setRenderQuality(tier) {
    appliedTier = tier === 'low' ? 'low' : 'normal';
    return appliedTier;
}

export function getRenderQuality() {
    return appliedTier;
}

// 返回常量对象：粒子循环可以按引用比较，察觉档位切换后重新布点。
export function getQualityFactor(tier = appliedTier) {
    return tier === 'low' ? LOW_FACTOR : NORMAL_FACTOR;
}

export function applyRenderQualityToDom(overlay, setting) {
    const tier = setRenderQuality(resolveRenderQuality(setting));
    if (overlay && typeof overlay.setAttribute === 'function') {
        if (tier === 'low') {
            if (overlay.getAttribute?.('data-igs-quality') !== 'low') overlay.setAttribute('data-igs-quality', 'low');
        } else if (typeof overlay.removeAttribute === 'function') {
            overlay.removeAttribute('data-igs-quality');
        }
    }
    return tier;
}
