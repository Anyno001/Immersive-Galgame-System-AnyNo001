// 设置面板整体重绘（innerHTML）前后保住键盘焦点与光标选区，避免每次改值后焦点掉回 body。
const FOCUS_KEY_ATTRS = Object.freeze([
    ['data-path', 'data-segment-value'],
    ['data-segment-path', 'data-segment-value'],
    ['data-dna-char', 'data-dna-field'],
    ['data-switch'],
    ['data-action'],
    ['data-tab'],
    ['data-image-subtab'],
    ['data-reader-subtab'],
    ['data-scene-settings-subtab'],
    ['data-scene-subtab'],
    ['data-model-sync'],
    ['data-prompt-rule-draft'],
    ['data-chat-prompt-draft'],
    ['data-asset-folder-move', 'data-asset-name'],
    ['data-gen-transfer', 'data-gen-name'],
    ['data-preset-select'],
    ['data-advanced'],
    ['id'],
]);

function attrSelector(name, value) {
    return `[${name}="${String(value).replace(/["\\]/g, '\\$&')}"]`;
}

export function settingsFocusSelector(el) {
    if (!el || typeof el.getAttribute !== 'function') return '';
    if (String(el.tagName || '').toUpperCase() === 'SUMMARY' && el.parentNode && typeof el.parentNode.getAttribute === 'function') {
        const key = el.parentNode.getAttribute('data-advanced');
        return key ? `${attrSelector('data-advanced', key)} > summary` : '';
    }
    for (const [primary, secondary] of FOCUS_KEY_ATTRS) {
        const value = el.getAttribute(primary);
        if (value == null) continue;
        const extra = secondary ? el.getAttribute(secondary) : null;
        return attrSelector(primary, value) + (extra == null ? '' : attrSelector(secondary, extra));
    }
    return '';
}

function contains(container, el) {
    if (typeof container.contains === 'function') return container.contains(el);
    for (let node = el; node; node = node.parentNode) if (node === container) return true;
    return false;
}

export function captureSettingsFocus(container) {
    const doc = container && container.ownerDocument;
    const el = doc && doc.activeElement;
    if (!el || el === doc.body || !contains(container, el)) return null;
    const selector = settingsFocusSelector(el);
    if (!selector || typeof container.querySelectorAll !== 'function') return null;
    const index = Math.max(0, Array.prototype.indexOf.call(container.querySelectorAll(selector), el));
    const snap = { selector, index };
    try {
        if (typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
            snap.selectionStart = el.selectionStart;
            snap.selectionEnd = el.selectionEnd;
            snap.selectionDirection = el.selectionDirection || 'none';
        }
    } catch (error) {
        // number / range 等输入框读 selectionStart 会抛错，只恢复焦点即可。
    }
    return snap;
}

export function restoreSettingsFocus(container, snap) {
    if (!snap || !container || typeof container.querySelectorAll !== 'function') return null;
    let matches;
    try { matches = container.querySelectorAll(snap.selector); } catch (error) { return null; }
    const el = matches[snap.index] || matches[0];
    if (!el || typeof el.focus !== 'function' || el.disabled) return null;
    try { el.focus({ preventScroll: true }); } catch (error) { el.focus(); }
    if (typeof snap.selectionStart === 'number' && typeof el.setSelectionRange === 'function') {
        const length = String(el.value == null ? '' : el.value).length;
        try { el.setSelectionRange(Math.min(snap.selectionStart, length), Math.min(snap.selectionEnd, length), snap.selectionDirection); } catch (error) { /* 输入类型不支持选区 */ }
    }
    return el;
}
