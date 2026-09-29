import { ensureFxLayers, findFxLayers } from './fx-layer.js';
import { fillRomanceAction } from './romance-settings.js';

// 立绘快捷动作：头部右上方的心形按钮，点开是动作菜单；选中后把动作文字写进 #igs-input（不自动发送），
// 输入框不可见（内嵌模式）时复制到剪贴板。按钮挂在 #igs-fx-front（对话层之上），翻页点击层收不到它的点击。
const BUTTON_CLASS = 'igs-rm-action-btn';
const MENU_CLASS = 'igs-rm-action-menu';
const HINT_LIFE_MS = 1800;
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.6 13a4.7 4.7 0 0 1 6.6-6.7l.8.8.8-.8A4.7 4.7 0 0 1 19.4 13Z"/></svg>';

const states = new WeakMap();

function stop(event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
}

function inputVisible(input) {
    if (!input) return false;
    if (typeof input.getClientRects === 'function') return input.getClientRects().length > 0;
    return input.style ? input.style.display !== 'none' : true;
}

// 写入输入框：已有内容时追加在末尾；返回 'input' / 'clipboard' / ''。
export function deliverRomanceAction(root, textValue, doc) {
    const value = String(textValue || '');
    if (!value) return '';
    const input = root && typeof root.querySelector === 'function' ? root.querySelector('#igs-input') : null;
    if (inputVisible(input)) {
        const current = String(input.value || '');
        input.value = current ? `${current}${/\s$/.test(current) ? '' : ' '}${value}` : value;
        const view = doc && doc.defaultView;
        if (view && typeof view.Event === 'function' && typeof input.dispatchEvent === 'function') input.dispatchEvent(new view.Event('input', { bubbles: true }));
        if (typeof input.focus === 'function') input.focus();
        return 'input';
    }
    const clipboard = doc && doc.defaultView && doc.defaultView.navigator && doc.defaultView.navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
        Promise.resolve(clipboard.writeText(value)).catch(() => null);
        return 'clipboard';
    }
    return '';
}

function removeNode(node) {
    if (node && typeof node.remove === 'function') node.remove();
    else if (node && node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

function make(doc, tag, className, textValue) {
    const el = doc.createElement(tag);
    el.className = className;
    if (textValue != null) el.textContent = textValue;
    return el;
}

function getState(motion) {
    let state = states.get(motion);
    if (!state) {
        state = { button: null, menu: null, hint: null, hintTimer: null, pageKey: '', actions: [], character: '' };
        states.set(motion, state);
    }
    return state;
}

function closeMenu(state) {
    if (state.menu) removeNode(state.menu);
    state.menu = null;
    if (state.button) state.button.setAttribute('aria-expanded', 'false');
}

function showHint(state, layers, message) {
    if (state.hint) removeNode(state.hint);
    if (state.hintTimer != null) clearTimeout(state.hintTimer);
    const hint = make(layers.doc, 'div', 'igs-rm-memory-toast igs-rm-action-hint', message);
    layers.front.appendChild(hint);
    state.hint = hint;
    state.hintTimer = setTimeout(() => {
        removeNode(hint);
        if (state.hint === hint) state.hint = null;
        state.hintTimer = null;
    }, HINT_LIFE_MS);
}

function openMenu(state, layers, root) {
    closeMenu(state);
    const usable = state.actions.filter((item) => item.name && item.text);
    if (!usable.length) return;
    const menu = make(layers.doc, 'div', MENU_CLASS);
    menu.setAttribute('role', 'menu');
    for (const item of usable) {
        const btn = make(layers.doc, 'button', 'igs-rm-action-item', item.name);
        btn.type = 'button';
        btn.setAttribute('role', 'menuitem');
        btn.addEventListener('pointerdown', (event) => event.stopPropagation());
        btn.addEventListener('click', (event) => {
            stop(event);
            const how = deliverRomanceAction(root, fillRomanceAction(item.text, state.character), layers.doc);
            closeMenu(state);
            if (how === 'clipboard') showHint(state, layers, '已复制动作，粘贴到输入框发送');
        });
        menu.appendChild(btn);
    }
    const box = state.button.style;
    menu.style.left = box.left;
    menu.style.top = box.top;
    layers.front.appendChild(menu);
    state.menu = menu;
    state.button.setAttribute('aria-expanded', 'true');
}

function ensureButton(state, layers, root) {
    if (state.button && state.button.parentNode === layers.front) return state.button;
    const button = make(layers.doc, 'button', BUTTON_CLASS);
    button.type = 'button';
    button.innerHTML = HEART_SVG;
    button.setAttribute('aria-label', '互动');
    button.setAttribute('title', '互动');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
        stop(event);
        if (state.menu) closeMenu(state);
        else openMenu(state, layers, root);
    });
    layers.front.appendChild(button);
    state.button = button;
    return button;
}

// placement 为舞台像素 { x, y }（romance-runtime 按头部算好）；show=false 时收起按钮与菜单。
export function syncRomanceActions(root, { show, placement, actions, character, pageKey }) {
    const layers = show ? ensureFxLayers(root) : findFxLayers(root);
    if (!layers || !layers.motion) return false;
    const state = getState(layers.motion);
    if (!show || !placement) {
        closeRomanceActions(root);
        return false;
    }
    state.actions = actions || [];
    state.character = character || '';
    const button = ensureButton(state, layers, root);
    button.style.left = `${Math.round(placement.x)}px`;
    button.style.top = `${Math.round(placement.y)}px`;
    // 翻页收起菜单。
    if (state.pageKey !== pageKey) closeMenu(state);
    state.pageKey = pageKey;
    return true;
}

export function closeRomanceActions(root) {
    const layers = findFxLayers(root);
    const state = layers && layers.motion ? states.get(layers.motion) : null;
    if (!state) return;
    closeMenu(state);
    if (state.button) removeNode(state.button);
    if (state.hint) removeNode(state.hint);
    if (state.hintTimer != null) clearTimeout(state.hintTimer);
    states.delete(layers.motion);
}
