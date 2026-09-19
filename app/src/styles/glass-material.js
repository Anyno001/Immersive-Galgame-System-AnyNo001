export const IGS_TRANSPARENT_GLASS_ALPHA = 0.62;
export const IGS_TRANSPARENT_GLASS_BG = `rgba(20,20,22,${IGS_TRANSPARENT_GLASS_ALPHA})`;
export const IGS_TRANSPARENT_GLASS_BACKDROP_FILTER = 'none';
export const IGS_FROSTED_GLASS_BACKDROP_FILTER = 'blur(32px) saturate(180%)';

export function normalizeGlassDensity(value, fallback = IGS_TRANSPARENT_GLASS_ALPHA) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(1, Math.max(0, numeric));
}

export function createTransparentGlassBg(density) {
    return `rgba(20,20,22,${normalizeGlassDensity(density)})`;
}

export function resolveGlassBackdropFilter(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed || trimmed === '0' || trimmed === 'false' || trimmed === 'none') return IGS_TRANSPARENT_GLASS_BACKDROP_FILTER;
        if (trimmed === 'true') return IGS_FROSTED_GLASS_BACKDROP_FILTER;
        return trimmed;
    }
    return value ? IGS_FROSTED_GLASS_BACKDROP_FILTER : IGS_TRANSPARENT_GLASS_BACKDROP_FILTER;
}

export function applyTransparentGlassMaterial(target, density, options = {}) {
    const style = target && target.style ? target.style : target;
    if (!style || typeof style.setProperty !== 'function') return;
    const normalizedDensity = normalizeGlassDensity(density);
    const glassBg = createTransparentGlassBg(normalizedDensity);
    const backdropFilter = resolveGlassBackdropFilter(options.backdropFilter);
    style.setProperty('--igs-glass-opacity', String(normalizedDensity));
    style.setProperty('--igs-glass-density', String(normalizedDensity));
    style.setProperty('--igs-glass-fill-alpha', String(normalizedDensity));
    style.setProperty('--igs-transparent-glass-bg', glassBg);
    style.setProperty('--igs-glass-bg', glassBg);
    style.setProperty('--igs-glass-blur', backdropFilter);
    style.setProperty('--igs-dialog-bg', glassBg);
    style.setProperty('--igs-dialog-blur', backdropFilter);
    style.setProperty('--igs-toolbar-bg', glassBg);
    style.setProperty('--igs-toolbar-blur', backdropFilter);
    style.setProperty('--igs-choice-bg', glassBg);
    style.setProperty('--igs-choice-blur', backdropFilter);
    style.setProperty('--igs-db-bg', glassBg);
    style.setProperty('--igs-db-blur', backdropFilter);
    style.setProperty('--igs-db-head-bg', glassBg);
    style.setProperty('--igs-db-head-blur', backdropFilter);
}
