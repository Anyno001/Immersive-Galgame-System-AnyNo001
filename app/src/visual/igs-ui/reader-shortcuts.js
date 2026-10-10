import { TOOLBAR_ACTIONS } from './reader-host-constants.js';

const EXTRA_ACTIONS = Object.freeze([
    ['turn-first', '第一楼'],
    ['turn-latest', '最新楼'],
    ['bilingual-toggle', '切换双语'],
]);

export const SHORTCUT_ACTIONS = Object.freeze([
    ...TOOLBAR_ACTIONS.map(([id, label]) => [id, label]),
    ...EXTRA_ACTIONS,
]);

// 不使用 Ctrl/Alt/Meta、F1-F12 或浏览器常见组合；保留现有阅读器按键。
export const DEFAULT_SHORTCUTS = Object.freeze({
    'first-turn': ['KeyM'], 'prev-turn': ['BracketLeft'], 'first-page': ['Shift+ArrowLeft'],
    prev: ['ArrowLeft'], next: ['ArrowRight', 'Space'], 'last-page': ['Shift+ArrowRight'],
    'next-turn': ['BracketRight'], 'auto-play': ['KeyA'], 'tts-replay': ['KeyR'],
    'quick-save': ['KeyS'], 'quick-load': ['KeyL'], regen: ['KeyG'], 'reroll-cg': ['Shift+KeyG'],
    'clear-cg': ['KeyX'], 'clear-floor-cg': ['Shift+KeyX'], 'generate-assets': ['KeyB'],
    'cg-gallery': ['KeyC'], 'fill-item-images': ['KeyI'], save: ['KeyP'], hide: ['KeyH'],
    'sprite-edit': ['KeyE'], rescan: ['Shift+KeyR'], settings: ['KeyO'],
    'turn-first': ['Home'], 'turn-latest': ['End'], 'bilingual-toggle': ['KeyT'],
});

const ACTION_IDS = new Set(SHORTCUT_ACTIONS.map(([id]) => id));
const COMBO_RE = /^(?:(?:Shift|Ctrl|Alt|Meta)\+)*(?:Key[A-Z]|Digit[0-9]|Arrow(?:Left|Right|Up|Down)|Home|End|Page(?:Up|Down)|Space|Bracket(?:Left|Right)|Comma|Period|Slash|Backslash|Minus|Equal|Enter|Tab|Backspace|Delete)$/;
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

export function normalizeShortcutCombo(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parts = raw.split('+');
    const code = parts.pop();
    const mods = parts.filter((part) => part === 'Ctrl' || part === 'Control' || part === 'Alt' || part === 'Meta' || part === 'Shift')
        .map((part) => part === 'Control' ? 'Ctrl' : part);
    const ordered = ['Ctrl', 'Alt', 'Meta', 'Shift'].filter((mod) => mods.includes(mod));
    const combo = [...ordered, code].join('+');
    return COMBO_RE.test(combo.replace('Ctrl', 'Ctrl').replace('Alt', 'Alt')) ? combo : '';
}

export function normalizeShortcutOverrides(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const result = {};
    for (const [id, raw] of Object.entries(source)) {
        if (!ACTION_IDS.has(id) || !Array.isArray(raw)) continue;
        result[id] = raw.map(normalizeShortcutCombo).filter(Boolean).filter((item, index, all) => all.indexOf(item) === index);
    }
    return result;
}

export function resolveShortcuts(overrides) {
    const saved = normalizeShortcutOverrides(overrides);
    const result = {};
    for (const [id] of SHORTCUT_ACTIONS) result[id] = Object.prototype.hasOwnProperty.call(saved, id)
        ? saved[id].slice() : (DEFAULT_SHORTCUTS[id] || []).slice();
    return result;
}

export function findShortcutAction(shortcuts, combo) {
    const normalized = normalizeShortcutCombo(combo);
    if (!normalized) return '';
    return SHORTCUT_ACTIONS.map(([id]) => id).find((id) => Array.isArray(shortcuts && shortcuts[id]) && shortcuts[id].includes(normalized)) || '';
}

// 只检查快捷键栏目内部：返回 { [actionId]: [与之撞键的其他 actionId] }，没有冲突的动作不出现。
export function findShortcutConflicts(shortcuts) {
    const owners = new Map();
    for (const [id] of SHORTCUT_ACTIONS) {
        const keys = Array.isArray(shortcuts && shortcuts[id]) ? shortcuts[id] : [];
        for (const combo of keys) {
            const normalized = normalizeShortcutCombo(combo);
            if (!normalized) continue;
            if (!owners.has(normalized)) owners.set(normalized, []);
            if (!owners.get(normalized).includes(id)) owners.get(normalized).push(id);
        }
    }
    const result = {};
    for (const ids of owners.values()) {
        if (ids.length < 2) continue;
        for (const id of ids) {
            const others = ids.filter((other) => other !== id);
            result[id] = [...new Set([...(result[id] || []), ...others])];
        }
    }
    return result;
}

export function eventToShortcut(event) {
    if (!event || event.isComposing || !event.code || MODIFIERS.has(event.code)) return '';
    const mods = [];
    if (event.ctrlKey) mods.push('Ctrl');
    if (event.altKey) mods.push('Alt');
    if (event.metaKey) mods.push('Meta');
    if (event.shiftKey) mods.push('Shift');
    return normalizeShortcutCombo([...mods, event.code].join('+'));
}

export function shortcutLabel(combo) {
    const normalized = normalizeShortcutCombo(combo);
    if (!normalized) return '未设置';
    return normalized.split('+').map((part) => ({ ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: '空格', BracketLeft: '[', BracketRight: ']' }[part] || part.replace(/^Key/, ''))).join('+');
}
