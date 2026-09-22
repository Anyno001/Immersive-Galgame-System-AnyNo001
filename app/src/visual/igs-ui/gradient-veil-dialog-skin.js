export const DIALOG_SKIN_GRADIENT_VEIL = 'gradient-veil';

export const GRADIENT_VEIL_DEFAULTS = Object.freeze({
    color: '#000000',
    heightPercent: 60,
    opacity: 0.85,
    speakerStyle: 'default',
});

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const SPEAKER_STYLES = new Set(['default', 'plain-text']);

function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

export function normalizeGradientVeil(value) {
    const source = value && typeof value === 'object' ? value : {};
    const color = HEX_COLOR_RE.test(source.color) ? source.color.toLowerCase() : GRADIENT_VEIL_DEFAULTS.color;
    const heightPercent = Math.round(clampNumber(
        source.heightPercent,
        20,
        90,
        GRADIENT_VEIL_DEFAULTS.heightPercent,
    ));
    const opacity = clampNumber(source.opacity, 0, 1, GRADIENT_VEIL_DEFAULTS.opacity);
    const speakerStyle = SPEAKER_STYLES.has(source.speakerStyle)
        ? source.speakerStyle
        : GRADIENT_VEIL_DEFAULTS.speakerStyle;
    return { color, heightPercent, opacity, speakerStyle };
}

export function isGradientVeilDialogSkin(value) {
    return value === DIALOG_SKIN_GRADIENT_VEIL
        || Boolean(value && value.dialogSkin === DIALOG_SKIN_GRADIENT_VEIL);
}

export function gradientVeilColorToRgba(color, opacity) {
    const normalized = normalizeGradientVeil({ color, opacity });
    const red = Number.parseInt(normalized.color.slice(1, 3), 16);
    const green = Number.parseInt(normalized.color.slice(3, 5), 16);
    const blue = Number.parseInt(normalized.color.slice(5, 7), 16);
    return `rgba(${red},${green},${blue},${normalized.opacity})`;
}

export const GRADIENT_VEIL_STYLE_TEXT = `
#igs-gradient-veil.igs-dialog-gradient-veil {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    z-index: 0;
    width: 100%;
    height: var(--igs-gradient-veil-height, 60%);
    pointer-events: none;
    background: linear-gradient(to top, var(--igs-gradient-veil-color, rgba(0,0,0,.85)) 0%, transparent 100%);
}
#igs-overlay.igs-gradient-veil-active:not(.igs-scene-nsfw) #igs-bg::after {
    display: none;
}
.igs-dialog[data-igs-dialog-skin="gradient-veil"] {
    background: transparent;
    border: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
}
.igs-dialog[data-igs-dialog-skin="gradient-veil"][data-igs-speaker-style="plain-text"] #igs-speaker {
    background: transparent;
    font-weight: 700;
    text-shadow: 0 1px 3px rgba(0,0,0,.9);
}
`;
