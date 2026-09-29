// 界面音效：翻页、选项悬停/确认、菜单开合，音色族随对话框皮肤切换；默认关闭，全部实时合成。
import { createSynthPartial as p, playSynthPartials } from './chat-sfx.js';

export const UI_SFX_KINDS = Object.freeze(['page', 'hover', 'confirm', 'open', 'close']);
export const UI_SOUND_DEFAULTS = Object.freeze({ enabled: false, volume: 0.4 });
const HOVER_GAP_MS = 80;

const n = (from, to, start, duration, gain, extra = {}) => p('noise', from, to, start, duration, gain, extra);

// 每族五种声音：木质偏低沉敲击，纸张为滤波噪声，柔和为圆润正弦，玻璃为高频泛音。
export const UI_SFX_FAMILIES = Object.freeze({
    wood: Object.freeze({
        page: Object.freeze([p('triangle', 520, 380, 0, 0.07, 0.6, { attack: 0.001, sweep: 1 }), n(1800, 1800, 0, 0.03, 0.25, { attack: 0.001 })]),
        hover: Object.freeze([p('triangle', 700, 640, 0, 0.035, 0.3, { attack: 0.001, sweep: 1 })]),
        confirm: Object.freeze([p('triangle', 440, 330, 0, 0.08, 0.6, { attack: 0.001, sweep: 1 }), p('triangle', 660, 520, 0.07, 0.1, 0.5, { attack: 0.001, sweep: 1 })]),
        open: Object.freeze([p('triangle', 330, 494, 0, 0.12, 0.5, { attack: 0.002, sweep: 1 })]),
        close: Object.freeze([p('triangle', 494, 330, 0, 0.12, 0.5, { attack: 0.002, sweep: 1 })]),
    }),
    paper: Object.freeze({
        page: Object.freeze([n(1200, 4200, 0, 0.16, 0.7, { filter: 'bandpass', q: 0.9, attack: 0.03, sweep: 1 })]),
        hover: Object.freeze([n(3000, 3000, 0, 0.03, 0.3, { filter: 'highpass', attack: 0.002 })]),
        confirm: Object.freeze([n(2400, 2400, 0, 0.05, 0.55, { filter: 'bandpass', q: 1.5, attack: 0.001 }), p('sine', 880, 880, 0.03, 0.08, 0.2, { attack: 0.002 })]),
        open: Object.freeze([n(800, 3000, 0, 0.2, 0.6, { filter: 'bandpass', q: 0.8, attack: 0.04, sweep: 1 })]),
        close: Object.freeze([n(3000, 800, 0, 0.18, 0.6, { filter: 'bandpass', q: 0.8, attack: 0.02, sweep: 1 })]),
    }),
    soft: Object.freeze({
        page: Object.freeze([p('sine', 660, 880, 0, 0.12, 0.5, { attack: 0.01, sweep: 0.5 })]),
        hover: Object.freeze([p('sine', 1046, 1046, 0, 0.05, 0.22, { attack: 0.005 })]),
        confirm: Object.freeze([p('sine', 784, 784, 0, 0.1, 0.5, { attack: 0.006 }), p('sine', 1175, 1175, 0.08, 0.16, 0.45, { attack: 0.006 })]),
        open: Object.freeze([p('sine', 523, 784, 0, 0.16, 0.45, { attack: 0.015, sweep: 0.7 })]),
        close: Object.freeze([p('sine', 784, 523, 0, 0.16, 0.45, { attack: 0.015, sweep: 0.7 })]),
    }),
    glass: Object.freeze({
        page: Object.freeze([p('sine', 1568, 1568, 0, 0.18, 0.35, { attack: 0.002 }), p('sine', 3136, 3136, 0, 0.08, 0.1, { attack: 0.002 })]),
        hover: Object.freeze([p('sine', 2093, 2093, 0, 0.06, 0.18, { attack: 0.002 })]),
        confirm: Object.freeze([p('sine', 1318, 1318, 0, 0.2, 0.4, { attack: 0.002 }), p('sine', 1976, 1976, 0.06, 0.26, 0.35, { attack: 0.002 })]),
        open: Object.freeze([p('sine', 1046, 1568, 0, 0.2, 0.35, { attack: 0.004, sweep: 0.6 }), p('sine', 3136, 3136, 0.12, 0.1, 0.08, { attack: 0.002 })]),
        close: Object.freeze([p('sine', 1568, 1046, 0, 0.18, 0.35, { attack: 0.004, sweep: 0.6 })]),
    }),
});

const SKIN_FAMILIES = Object.freeze({
    'retro-japanese': 'wood',
    'adventure-journey': 'wood',
    'black-white-manga': 'paper',
    'warm-picturebook': 'paper',
    'plant-coffee': 'paper',
    'western-classic': 'paper',
    'cute-pink': 'soft',
    'day-minimal': 'soft',
    'elegant-european': 'glass',
    'gradient-veil': 'glass',
});

export function resolveUiSfxFamily(dialogSkin) {
    return SKIN_FAMILIES[dialogSkin] || 'glass';
}

export function normalizeUiSoundSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const volume = Number(source.volume);
    return {
        enabled: source.enabled === true,
        volume: source.volume !== null && source.volume !== '' && Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : UI_SOUND_DEFAULTS.volume,
    };
}

let lastHoverAt = -Infinity;

// readerSettings 取自当前阅读器；now 与 audioScheduler 供测试注入。
export function playUiSfx(kind, readerSettings, { audioScheduler, now = Date.now() } = {}) {
    const reader = readerSettings && typeof readerSettings === 'object' ? readerSettings : {};
    const settings = normalizeUiSoundSettings(reader.uiSound);
    if (!settings.enabled || !(settings.volume > 0) || !UI_SFX_KINDS.includes(kind)) return null;
    if (kind === 'hover') {
        if (now - lastHoverAt < HOVER_GAP_MS) return null;
        lastHoverAt = now;
    }
    const family = resolveUiSfxFamily(reader.dialogSkin);
    const partials = UI_SFX_FAMILIES[family][kind];
    if (typeof audioScheduler === 'function') {
        try { return audioScheduler({ kind, family, volume: settings.volume, partials }) || null; } catch { return null; }
    }
    return playSynthPartials(partials, { volume: settings.volume });
}
