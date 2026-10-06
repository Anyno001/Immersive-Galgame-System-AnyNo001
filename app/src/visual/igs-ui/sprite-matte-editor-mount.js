// 遮罩修复编辑器挂载：弹层 + 工具栏；关闭与取消不写任何资产字段。
import { MATTE_EDITOR_STYLE_TEXT } from './sprite-matte-editor-view.js';
import { mountEditControls } from './sprite-matte-editor-controls.js';
import { createIgsModal } from './igs-modal.js';

// editor：loadMatteEditor 的返回值；返回 { root, close }。
export function mountMatteEditor(doc, editor, { onClose, onSaved, confirm } = {}) {
    if (!doc.getElementById('igs-matte-editor-style')) {
        const style = doc.createElement('style');
        style.id = 'igs-matte-editor-style';
        style.textContent = MATTE_EDITOR_STYLE_TEXT;
        (doc.head || doc.body).appendChild(style);
    }
    const el = (tag, cls) => { const n = doc.createElement(tag); if (cls) n.className = cls; return n; };
    const root = el('div');
    root.id = 'igs-matte-editor';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '修复抠图');
    const bar = el('div', 'igs-matte-toolbar');
    const msg = el('div', 'igs-matte-message');
    msg.setAttribute('aria-live', 'polite');
    const stage = el('div', 'igs-matte-stage');
    root.append(bar, msg, stage);
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        if (root.parentNode) root.parentNode.removeChild(root);
        if (typeof onClose === 'function') onClose();
    };
    const btn = (label, fn) => {
        const b = el('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        bar.appendChild(b);
        return b;
    };
    // 焦点在编辑器内时按键不冒泡到阅读器（翻页 / 关闭）。
    root.addEventListener('keydown', (e) => e.stopPropagation());
    doc.body.appendChild(root);
    if (!editor || editor.mode !== 'edit') {
        msg.textContent = (editor && editor.message) || '当前图片无法编辑。';
        btn('关闭', close);
        return { root, close };
    }
    const ask = typeof confirm === 'function'
        ? confirm
        : (message) => createIgsModal({
            getHost: () => root,
            global: doc.defaultView || globalThis,
        }).confirm(message);
    mountEditControls({ doc, editor, el, btn, bar, msg, stage, close, onSaved, confirm: ask });
    return { root, close };
}
