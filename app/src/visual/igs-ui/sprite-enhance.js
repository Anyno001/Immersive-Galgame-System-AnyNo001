const SIZES = [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2];
const STRENGTHS = [5, 10, 15, 20, 30, 40, 50];

export function normalizeSpriteEnhance(value) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        enabled: raw.enabled === true,
        mode: raw.mode === 'shadow' ? 'shadow' : 'outline',
        color: /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '#000000',
        strength: STRENGTHS.includes(Number(raw.strength)) ? Number(raw.strength) : 20,
        size: SIZES.includes(Number(raw.size)) ? Number(raw.size) : 0.8,
    };
}

// drop-shadow follows the PNG's alpha, unlike box-shadow on the full-stage background div.
export function spriteEnhanceFilter(value) {
    const setting = normalizeSpriteEnhance(value);
    if (!setting.enabled) return '';
    const rgb = [1, 3, 5].map((i) => parseInt(setting.color.slice(i, i + 2), 16)).join(',');
    const ink = `rgba(${rgb},${setting.strength / 100})`;
    const size = setting.size;
    if (setting.mode === 'shadow') return `drop-shadow(0 ${size * 1.25}px ${size * 2.5}px ${ink})`;
    return [
        `${size}px 0`, `-${size}px 0`, `0 ${size}px`, `0 -${size}px`,
    ].map((offset) => `drop-shadow(${offset} 0 ${ink})`).join(' ');
}
