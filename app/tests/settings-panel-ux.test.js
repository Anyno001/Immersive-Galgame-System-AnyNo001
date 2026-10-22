import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsDialogs } from '../src/visual/igs-ui/settings-dialog.js';
import { createIgsModal } from '../src/visual/igs-ui/igs-modal.js';
import { captureSettingsFocus, restoreSettingsFocus, settingsFocusSelector } from '../src/visual/igs-ui/settings-focus.js';
import {
    SETTINGS_SECTIONS, buildSettingsExport, parseSettingsImport, renderSectionResetButton, resetSettingsSection, settingsSectionPaths,
} from '../src/visual/igs-ui/settings-sections.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { moodTierLabels } from '../src/scene/mood-groups.js';
import { createRecoveryNotice } from '../src/visual/igs-ui/recovery-notice.js';
import { recoverOperation, wakeRecoveringOperations } from '../src/storage/automatic-recovery.js';

test('恢复提示：显示失败原因、点击对应设置、保存生效后自动续接且清除提示', { timeout: 3000 }, async () => {
    const doc = makeDoc(), global = { document: doc }, opened = [];
    const ui = createRecoveryNotice({ global, getDocument: () => doc, openSettings: input => opened.push(input) });
    let key = 'expired', captured = key, calls = 0, waiting;
    const entered = new Promise(resolve => { waiting = resolve; });
    try {
        const pending = recoverOperation(() => {
            calls++;
            return captured === 'fixed' ? { ok: true, image: 'original-task' } : { ok: false, status: 401 };
        }, { global, retryUnchanged: false,
            waitFor: { message: '副 API 凭据已失效（HTTP 401），保存备用模型配置后自动继续。', page: 'llm', actionLabel: '打开备用模型' },
            canResume() { if (captured === key) return false; captured = key; return true; },
            onRecover: () => waiting(),
        });
        await entered;
        assert.match(doc.body.textContent, /HTTP 401/);
        const button = doc.body.querySelector('button');
        assert.equal(button.textContent, '打开备用模型');
        button.dispatch('click');
        assert.deepEqual(opened, [{ page: 'llm' }]);
        wakeRecoveringOperations(global);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(calls, 1, '打开设置和无关保存不能重复请求');
        key = 'fixed'; wakeRecoveringOperations(global);
        assert.equal((await pending).image, 'original-task');
        assert.equal(calls, 2);
        assert.equal(doc.body.querySelector('.igs-recovery-notice'), null);
    } finally { ui.dispose(); }
});

function parseCompound(sel) {
    const tokens = [];
    const re = /#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="((?:[^"\\]|\\.)*)")?\]|^([a-z]+)/gi;
    let m;
    while ((m = re.exec(sel))) {
        const [, id, cls, name, raw, tag] = m;
        if (id) tokens.push((el) => el.id === id);
        else if (cls) tokens.push((el) => String(el.className).split(/\s+/).includes(cls));
        else if (name) {
            const value = raw == null ? null : raw.replace(/\\(.)/g, '$1');
            tokens.push((el) => (value == null ? el.getAttribute(name) != null : el.getAttribute(name) === value));
        } else if (tag) tokens.push((el) => el.tagName === tag.toUpperCase());
    }
    return (el) => tokens.every((fn) => fn(el));
}

function makeDoc() {
    const doc = { activeElement: null };
    doc.body = makeEl(doc, 'body');
    doc.createElement = (tag) => makeEl(doc, tag);
    doc.activeElement = doc.body;
    return doc;
}

function makeEl(doc, tag) {
    const attrs = new Map();
    const listeners = {};
    const el = {
        ownerDocument: doc, tagName: String(tag).toUpperCase(), children: [], parentNode: null, className: '', type: '', value: '', disabled: false,
        _text: '', selectionStart: null, selectionEnd: null, selectionDirection: 'none',
        get id() { return attrs.get('id') || ''; },
        set id(v) { attrs.set('id', String(v)); },
        get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
        set textContent(v) { this.children = []; this._text = String(v); },
        get lastChild() { return this.children[this.children.length - 1] || null; },
        setAttribute(k, v) { if (k === 'class') this.className = String(v); else attrs.set(k, String(v)); },
        getAttribute(k) { if (k === 'class') return this.className || null; return attrs.has(k) ? attrs.get(k) : null; },
        appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; },
        removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; },
        addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
        dispatch(type, init = {}) {
            const event = { type, target: this, stopped: false, defaultPrevented: false, ...init, stopPropagation() { this.stopped = true; }, preventDefault() { this.defaultPrevented = true; } };
            for (let node = this; node && !event.stopped; node = node.parentNode) {
                for (const fn of node._listeners[type] || []) fn(event);
            }
            return event;
        },
        _listeners: listeners,
        matches(sel) { return parseCompound(sel)(this); },
        closest(sel) { for (let n = this; n; n = n.parentNode) if (n.matches && n.matches(sel)) return n; return null; },
        descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); },
        querySelectorAll(sel) {
            const [parentSel, childSel] = sel.split(/\s*>\s*/);
            if (childSel) return this.descendants().filter((n) => n.matches(childSel) && n.parentNode && n.parentNode.matches(parentSel));
            return this.descendants().filter((n) => n.matches(sel));
        },
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
        contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; },
        focus() { doc.activeElement = this; },
        select() { this.selectionStart = 0; this.selectionEnd = String(this.value).length; },
        setSelectionRange(start, end, dir) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = dir; },
    };
    return el;
}

function add(parent, tag, attrs = {}) {
    const el = makeEl(parent.ownerDocument, tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'value') el.value = v;
        else el.setAttribute(k, v);
    }
    parent.appendChild(el);
    return el;
}

function makePanel() {
    const doc = makeDoc();
    const container = add(doc.body, 'div');
    const overlay = add(container, 'div', { id: 'igs-unified-settings' });
    return { doc, container, overlay };
}

function rebuildPanel(panel, build) {
    for (const child of [...panel.container.children]) panel.container.removeChild(child);
    panel.overlay = add(panel.container, 'div', { id: 'igs-unified-settings' });
    if (panel.doc.activeElement && !panel.container.contains(panel.doc.activeElement)) panel.doc.activeElement = panel.doc.body;
    build(panel.overlay);
}

test('gate:settings-dialog:prompt-keeps-typed-text-across-rerender-and-cancels-to-null', async () => {
    const panel = makePanel();
    const dialogs = createSettingsDialogs({ getContainer: () => panel.container, fallback: () => { throw new Error('native dialog must not be used'); } });
    const answer = dialogs.prompt('重命名场景「教室」为：', '教室');
    let input = panel.overlay.querySelector('.igs-settings-dialog-input');
    assert.equal(input.value, '教室');
    assert.ok(panel.doc.activeElement === input);
    assert.deepEqual([input.selectionStart, input.selectionEnd], [0, 2], 'default value is pre-selected');
    input.value = '天台';
    input.dispatch('input');

    rebuildPanel(panel, () => {});
    dialogs.remount();
    input = panel.overlay.querySelector('.igs-settings-dialog-input');
    assert.equal(input.value, '天台', 'typed text survives the re-render');
    input.dispatch('keydown', { key: 'Enter' });
    assert.equal(await answer, '天台');

    const composing = dialogs.prompt('新文件夹名称：');
    const field = panel.overlay.querySelector('.igs-settings-dialog-input');
    field.dispatch('keydown', { key: 'Enter', isComposing: true });
    assert.equal(dialogs.isOpen(), true, 'Enter while composing IME text does not submit');
    panel.overlay.querySelector('[data-settings-dialog="cancel"]').dispatch('click');
    assert.equal(await composing, null);

    const first = dialogs.prompt('第一个');
    const second = dialogs.confirm('第二个');
    assert.equal(await first, null, 'opening a new dialog cancels the pending one');
    dialogs.cancel();
    assert.equal(await second, false, 'closing the panel cancels the pending dialog');
});

test('gate:settings-dialog:edit-keeps-multiline-prompt-until-save', async () => {
    const panel = makePanel();
    const dialogs = createSettingsDialogs({ getContainer: () => panel.container, fallback: () => { throw new Error('native dialog must not be used'); } });
    const answer = dialogs.edit('这张立绘的提示词', 'scene: 1girl');
    const field = panel.overlay.querySelector('.igs-settings-dialog-text');
    assert.equal(field.tagName, 'TEXTAREA');
    assert.equal(field.value, 'scene: 1girl');
    assert.equal(panel.overlay.querySelector('[data-settings-dialog="ok"]').textContent, '保存');
    field.value = 'scene: 1girl\nstanding';
    field.dispatch('input');
    field.dispatch('keydown', { key: 'Enter' });
    assert.equal(dialogs.isOpen(), true, 'Enter inserts a line and does not save');
    panel.overlay.querySelector('[data-settings-dialog="ok"]').dispatch('click');
    assert.equal(await answer, 'scene: 1girl\nstanding');
});

test('gate:expression-prompt:edit-saves-caption-and-redraw-uses-it', async () => {
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [{ char_caption: 'silver hair', centers: [{ x: 0.5, y: 0.5 }] }] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [{ char_caption: '' }] } },
    };
    const images = new Map([
        ['def', { positive: 'base girl', negative: 'lowres', caption }],
        ['joy', { positive: '1girl', negative: 'lowres', caption }],
    ]);
    let saved = null;
    const painted = [];
    const ctx = {
        state: { activeSettings: { draft: { bridge: { sceneAssets: { characters: { 冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy' } } } }, readerSettings: {} }, asyncState: {} } },
        options: {
            global: { alert() {} },
            generatedAssets: {
                getImagePrompt: async (id) => images.get(id) || null,
                saveImagePrompt: async (id, prompt) => { saved = { id, prompt }; images.set(id, prompt); return { ok: true, prompt }; },
                generateExpressionSet: async () => { throw new Error('重画不该重写提示词'); },
                generateExpressionImage: async (input) => { painted.push(input.caption); return { ok: true, items: [] }; },
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: {
            edit: async (_title, text) => text.replace('silver hair', 'silver hair, smile'),
        },
    };
    const edited = await handleSettingsAction('char-expression-prompt:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6', ctx);
    assert.equal(edited.ok, true);
    assert.equal(saved.id, 'joy');
    assert.match(saved.prompt.caption.v4_prompt.caption.char_captions[0].char_caption, /smile/);
    const redraw = await handleSettingsAction('char-expression-retry:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6', ctx);
    assert.equal(redraw.ok, true);
    assert.equal(painted.length, 1);
    assert.match(painted[0].v4_prompt.caption.char_captions[0].char_caption, /smile/);
});

function actionCtx(draft, answers, extra = {}) {
    const calls = { persisted: 0, rerendered: 0, asked: [] };
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: {}, version: '0.30.0', ...extra.options },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { calls.persisted += 1; return { ok: true }; },
        rerenderSettings: () => { calls.rerendered += 1; return { ok: true }; },
        buildRegexPreview: () => '',
        dialogs: {
            confirm: async (message) => { calls.asked.push(message); return answers.shift(); },
            prompt: async (message) => { calls.asked.push(message); return answers.shift(); },
        },
        getDefaultSettings: () => ({ bridge: { sourceFilter: { enabled: false, textIncludeTags: 'content' } }, readerSettings: { fontSize: 16, dialogFontWeight: null, dialogTextEffect: 'off', dialogTextEffectColor: '#000000', dialogTextEffectStrength: 20, dialogTextEffectSize: 0.8 } }),
        normalizeImportedSettings: (imported) => ({
            bridge: { ...imported.bridge, normalized: true },
            readerSettings: { ...imported.readerSettings, fontSize: Math.min(30, Number(imported.readerSettings.fontSize) || 16) },
        }),
        ...extra.ctx,
    };
    return { ctx, calls };
}
