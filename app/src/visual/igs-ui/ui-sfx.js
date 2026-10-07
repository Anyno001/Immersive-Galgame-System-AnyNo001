// 界面音效：翻页、选项悬停/确认、菜单开合，音色族随对话框皮肤切换；默认关闭，全部实时合成。
import { createSynthPartial as p, playSynthPartials } from './chat-sfx.js';

export const UI_SFX_KINDS = Object.freeze(['page', 'hover', 'confirm', 'open', 'close']);
export const UI_SOUND_DEFAULTS = Object.freeze({ enabled: false, volume: 0.4 });
const HOVER_GAP_MS = 80;

const n = (from, to, start, duration, gain, extra = {}) => p('noise', from, to, start, duration, gain, extra);

// 每族五种声音：木质偏低沉敲击，纸张为滤波噪声，柔和为圆润正弦，玻璃为高频泛音，数码为短促方波提示音，金属为带噪声的铁皮敲击。
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
    // 恐怖两款共用：翻页是一下闷心跳，确认是低频闷响叠一组三全音，开合是两条略失谐、互相拍动的低音。
    dread: Object.freeze({
        page: Object.freeze([p('sine', 64, 46, 0, 0.14, 0.9, { attack: 0.004, sweep: 0.6 }), p('sine', 58, 42, 0.19, 0.16, 0.65, { attack: 0.004, sweep: 0.6 })]),
        hover: Object.freeze([p('sine', 196, 184, 0, 0.12, 0.14, { attack: 0.01 })]),
        confirm: Object.freeze([p('sine', 74, 52, 0, 0.33, 0.85, { attack: 0.003, sweep: 0.5 }), p('triangle', 311, 311, 0.02, 0.3, 0.1, { attack: 0.03 }), p('triangle', 440, 440, 0.02, 0.3, 0.08, { attack: 0.03 })]),
        open: Object.freeze([p('sine', 110, 165, 0, 0.34, 0.3, { attack: 0.1, sweep: 0.8 }), p('sine', 113, 169, 0, 0.34, 0.24, { attack: 0.1, sweep: 0.8 })]),
        close: Object.freeze([p('sine', 165, 98, 0, 0.34, 0.3, { attack: 0.04, sweep: 0.8 }), p('sine', 169, 101, 0, 0.34, 0.24, { attack: 0.04, sweep: 0.8 })]),
    }),
    glass: Object.freeze({
        page: Object.freeze([p('sine', 1568, 1568, 0, 0.18, 0.35, { attack: 0.002 }), p('sine', 3136, 3136, 0, 0.08, 0.1, { attack: 0.002 })]),
        hover: Object.freeze([p('sine', 2093, 2093, 0, 0.06, 0.18, { attack: 0.002 })]),
        confirm: Object.freeze([p('sine', 1318, 1318, 0, 0.2, 0.4, { attack: 0.002 }), p('sine', 1976, 1976, 0.06, 0.26, 0.35, { attack: 0.002 })]),
        open: Object.freeze([p('sine', 1046, 1568, 0, 0.2, 0.35, { attack: 0.004, sweep: 0.6 }), p('sine', 3136, 3136, 0.12, 0.1, 0.08, { attack: 0.002 })]),
        close: Object.freeze([p('sine', 1568, 1046, 0, 0.18, 0.35, { attack: 0.004, sweep: 0.6 })]),
    }),
    // 全息投影：翻页一声短促的方波「哔」，确认是上行两连音，开合是一道扫频。
    digital: Object.freeze({
        page: Object.freeze([p('square', 1760, 1760, 0, 0.035, 0.14, { attack: 0.001 }), p('sine', 3520, 3520, 0, 0.02, 0.06, { attack: 0.001 })]),
        hover: Object.freeze([p('square', 2637, 2637, 0, 0.018, 0.07, { attack: 0.001 })]),
        confirm: Object.freeze([p('square', 1319, 1319, 0, 0.05, 0.14, { attack: 0.001 }), p('square', 1976, 1976, 0.06, 0.07, 0.14, { attack: 0.001 })]),
        open: Object.freeze([p('sine', 660, 1760, 0, 0.14, 0.35, { attack: 0.004, sweep: 1 }), p('square', 1760, 1760, 0.13, 0.03, 0.1, { attack: 0.001 })]),
        close: Object.freeze([p('sine', 1760, 520, 0, 0.14, 0.35, { attack: 0.004, sweep: 1 })]),
    }),
    // 废土锈铁：翻页是指节敲铁皮，确认叠一下铁片回响，开合是生锈铰链的低沉摩擦。
    metal: Object.freeze({
        page: Object.freeze([p('triangle', 310, 260, 0, 0.09, 0.5, { attack: 0.001, sweep: 1 }), n(2600, 2600, 0, 0.04, 0.3, { filter: 'bandpass', q: 3, attack: 0.001 })]),
        hover: Object.freeze([n(3400, 3400, 0, 0.025, 0.2, { filter: 'bandpass', q: 4, attack: 0.001 })]),
        confirm: Object.freeze([p('triangle', 220, 196, 0, 0.14, 0.55, { attack: 0.001, sweep: 1 }), p('sine', 1240, 1180, 0.01, 0.22, 0.12, { attack: 0.001 }), n(1900, 1900, 0, 0.05, 0.3, { filter: 'bandpass', q: 2, attack: 0.001 })]),
        open: Object.freeze([n(500, 1400, 0, 0.22, 0.45, { filter: 'bandpass', q: 6, attack: 0.03, sweep: 1 }), p('triangle', 160, 150, 0.18, 0.08, 0.4, { attack: 0.001 })]),
        close: Object.freeze([n(1400, 500, 0, 0.2, 0.45, { filter: 'bandpass', q: 6, attack: 0.02, sweep: 1 }), p('triangle', 150, 130, 0.17, 0.1, 0.5, { attack: 0.001 })]),
    }),
});

const SKIN_FAMILIES = Object.freeze({
    'retro-japanese': 'wood',
    'adventure-journey': 'wood',
    'qinglv-shanshui': 'wood',
    'black-white-manga': 'paper',
    'warm-picturebook': 'paper',
    'fairy-tale': 'paper',
    'plant-coffee': 'paper',
    'western-classic': 'paper',
    'cute-pink': 'soft',
    'day-minimal': 'soft',
    'elegant-european': 'glass',
    'magic-academy': 'glass',
    'gradient-veil': 'glass',
    'horror-gore': 'dread',
    'horror-psych': 'soft',
    'scifi-holo': 'digital',
    'wasteland-rust': 'metal',
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
