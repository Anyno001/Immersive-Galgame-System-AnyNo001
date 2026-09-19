import { looksLikeHostUiHtml } from '../../scene/message-source.js';

export function igsDebugEnabled() {
    try {
        const root = (typeof window !== 'undefined' && window.parent && window.parent.IGS_DEBUG !== undefined)
            ? window.parent
            : (typeof window !== 'undefined' ? window : globalThis);
        return Boolean(root && root.IGS_DEBUG);
    } catch (error) {
        return Boolean(typeof globalThis !== 'undefined' && globalThis.IGS_DEBUG);
    }
}

export function igsDebug(tag, payload) {
    if (!igsDebugEnabled()) return;
    try {
        if (payload === undefined) console.log(tag);
        else console.log(tag, payload);
    } catch (error) {
        // Console may be unavailable in simulation.
    }
}

export function esc(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}

export function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null) return value;
    }
    return undefined;
}

export function firstNonEmptyString(...values) {
    for (const value of values) {
        const text = String(value || '').trim();
        if (text) return text;
    }
    return '';
}

export function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
        if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return fallback;
}

export function normalizeOpacity(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(1, Math.max(0, numeric));
}

export function normalizeFiniteNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeNullableNumber(value) {
    if (value === null || value === undefined || value === '' || value === 'null' || value === 'auto') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeFiniteIndex(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.floor(numeric);
}

export function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function toHex(color) {
    if (!color) return '#ffffff';
    if (color.startsWith('#') && (color.length === 7 || color.length === 4)) return color;
    const match = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
        const r = Math.min(255, Number(match[1]));
        const g = Math.min(255, Number(match[2]));
        const b = Math.min(255, Number(match[3]));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return '#ffffff';
}

export function computeLineHeight(fontSize) {
    if (fontSize <= 8) return '2.0';
    if (fontSize <= 11) return '1.9';
    if (fontSize <= 15) return '1.85';
    if (fontSize <= 18) return '1.7';
    return '1.6';
}

export function normalizeDisplayText(value) {
    const text = String(value || '').trim();
    return looksLikeHostUiHtml(text) ? '' : text;
}

export function firstRenderableText(...values) {
    for (const value of values) {
        const normalized = normalizeDisplayText(value);
        if (String(normalized || '').trim()) return normalized;
    }
    return '';
}

export function stripSpeakerPrefix(text, speaker) {
    if (!speaker || !text) return text;
    const escaped = speaker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^\\[?${escaped}\\]?\\s*[:：]\\s*`);
    return text.replace(pattern, '');
}
