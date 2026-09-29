import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsDialogs } from '../src/visual/igs-ui/settings-dialog.js';
import { captureSettingsFocus, restoreSettingsFocus, settingsFocusSelector } from '../src/visual/igs-ui/settings-focus.js';
import {
    SETTINGS_SECTIONS, buildSettingsExport, parseSettingsImport, renderSectionResetButton, resetSettingsSection, settingsSectionPaths,
} from '../src/visual/igs-ui/settings-sections.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';

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

test('gate:settings-dialog:confirm-bar-resolves-promise-and-survives-rerender', async () => {
    const panel = makePanel();
    const dialogs = createSettingsDialogs({ getContainer: () => panel.container, fallback: () => { throw new Error('native dialog must not be used'); } });
    const answer = dialogs.confirm('删除预设「甲」？');
    const bar = panel.overlay.querySelector('.igs-settings-dialog');
    assert.ok(bar, 'confirm bar is mounted inside the panel');
    assert.equal(bar.getAttribute('role'), 'alertdialog');
    assert.match(bar.textContent, /删除预设「甲」？/);
    assert.equal(dialogs.isOpen(), true);

    rebuildPanel(panel, () => {});
    assert.ok(panel.overlay.querySelector('.igs-settings-dialog') === null);
    dialogs.remount(panel.container);
    const again = panel.overlay.querySelector('.igs-settings-dialog');
    assert.ok(again, 'pending confirm is restored after the panel re-renders');
    assert.ok(panel.doc.activeElement === again.querySelector('[data-settings-dialog="ok"]'));

    const click = again.querySelector('[data-settings-dialog="ok"]').dispatch('click');
    assert.equal(click.stopped, true, 'clicks inside the bar do not reach the panel action handler');
    assert.equal(await answer, true);
    assert.ok(panel.overlay.querySelector('.igs-settings-dialog') === null);
    assert.equal(dialogs.isOpen(), false);

    const cancelled = dialogs.confirm('再问一次');
    const esc = panel.overlay.querySelector('.igs-settings-dialog').dispatch('keydown', { key: 'Escape' });
    assert.equal(esc.stopped, true, 'Escape cancels the bar instead of closing the settings panel');
    assert.equal(await cancelled, false);
});

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

test('gate:settings-dialog:falls-back-to-native-dialogs-without-a-mounted-panel', async () => {
    const calls = [];
    const globalObj = {
        confirm: (msg) => { calls.push(['confirm', msg]); return false; },
        prompt: (msg, value) => { calls.push(['prompt', msg, value]); return '新名'; },
    };
    const dialogs = createSettingsDialogs({ getContainer: () => null, global: globalObj });
    assert.equal(await dialogs.confirm('删掉？'), false);
    assert.equal(await dialogs.prompt('名称：', '旧名'), '新名');
    assert.deepEqual(calls, [['confirm', '删掉？'], ['prompt', '名称：', '旧名']]);
    const bare = createSettingsDialogs({ getContainer: () => null, global: {} });
    assert.equal(await bare.confirm('删掉？'), true, 'no confirm available keeps the old proceed behaviour');
    assert.equal(await bare.prompt('名称：'), null);
});

test('gate:settings-focus:restores-focused-field-and-caret-after-innerhtml-rebuild', () => {
    const panel = makePanel();
    const build = (overlay) => {
        add(overlay, 'input', { 'data-path': 'readerSettings.fontSize', value: '16' });
        add(overlay, 'textarea', { 'data-prompt-rule-draft': '1', value: '规则文本' });
        add(overlay, 'button', { 'data-segment-path': 'readerSettings.statusHud.size', 'data-segment-value': 'small' });
        add(overlay, 'button', { 'data-segment-path': 'readerSettings.statusHud.size', 'data-segment-value': 'large' });
        add(overlay, 'input', { 'data-dna-char': '小"林', 'data-dna-field': 'hair', value: 'black hair' });
        const details = add(overlay, 'details', { 'data-advanced': 'status-hud-look' });
        add(details, 'summary');
    };
    build(panel.overlay);

    const draft = panel.overlay.querySelector('[data-prompt-rule-draft]');
    draft.focus();
    draft.setSelectionRange(1, 3, 'forward');
    const snap = captureSettingsFocus(panel.container);
    assert.deepEqual(snap, { selector: '[data-prompt-rule-draft="1"]', index: 0, selectionStart: 1, selectionEnd: 3, selectionDirection: 'forward' });
    rebuildPanel(panel, build);
    assert.ok(panel.doc.activeElement === panel.doc.body, 'innerHTML rebuild drops focus');
    const restored = restoreSettingsFocus(panel.container, snap);
    assert.ok(panel.doc.activeElement === restored);
    assert.equal(restored.getAttribute('data-prompt-rule-draft'), '1');
    assert.deepEqual([restored.selectionStart, restored.selectionEnd, restored.selectionDirection], [1, 3, 'forward']);

    const large = panel.overlay.querySelector('[data-segment-value="large"]');
    large.focus();
    const segSnap = captureSettingsFocus(panel.container);
    rebuildPanel(panel, build);
    assert.equal(restoreSettingsFocus(panel.container, segSnap).getAttribute('data-segment-value'), 'large', 'segmented buttons are told apart by value');

    const dna = panel.overlay.querySelector('[data-dna-field="hair"]');
    assert.equal(settingsFocusSelector(dna), '[data-dna-char="小\\"林"][data-dna-field="hair"]');
    dna.focus();
    const dnaSnap = captureSettingsFocus(panel.container);
    rebuildPanel(panel, build);
    assert.equal(restoreSettingsFocus(panel.container, dnaSnap).getAttribute('data-dna-char'), '小"林');

    panel.overlay.querySelector('summary').focus();
    const summarySnap = captureSettingsFocus(panel.container);
    assert.equal(summarySnap.selector, '[data-advanced="status-hud-look"] > summary');
    rebuildPanel(panel, build);
    assert.equal(restoreSettingsFocus(panel.container, summarySnap).tagName, 'SUMMARY');

    panel.doc.activeElement = panel.doc.body;
    assert.ok(captureSettingsFocus(panel.container) === null, 'nothing focused inside the panel means nothing to restore');
    assert.ok(restoreSettingsFocus(panel.container, { selector: '[data-path="gone"]', index: 0 }) === null, 'a field that disappeared is skipped');
});

test('gate:settings-sections:reset-section-restores-normalized-defaults-only-for-its-fields', () => {
    const defaults = {
        bridge: { optionBubble: { enabled: false, position: 'top-left', clickAction: 'send', widthFollowsText: false } },
        readerSettings: {
            dialogSkin: 'default', fontSize: 16, dialogWidth: null, inputScale: 100,
            statusHud: { enabled: true, showEmotion: true, size: 'medium', tables: [], nsfwSpriteMode: 'shade' },
            vnTheme: { nameColor: '#ffeeb8', dialogBg: '#1f2225', bgOpacity: null },
            classicVnTheme: { nameColor: '#3a2a1a', dialogBg: '#f4e8d0' },
        },
    };
    const draft = {
        bridge: { optionBubble: { enabled: true, position: 'top-right' }, sceneAssets: { enabled: true } },
        readerSettings: {
            dialogSkin: 'western-classic', fontSize: 22, dialogWidth: 520, inputScale: 60,
            statusHud: { enabled: false, size: 'large', tables: ['角色表'], nsfwSpriteMode: 'hide', legacyExtra: 1 },
            vnTheme: { nameColor: '#000000' },
            classicVnTheme: { nameColor: '#ff0000' },
        },
    };

    assert.equal(resetSettingsSection(draft, 'reader-dialog-size', defaults).ok, true);
    assert.equal(draft.readerSettings.dialogWidth, null);
    assert.equal(draft.readerSettings.inputScale, 100);
    assert.equal(draft.readerSettings.fontSize, 22, 'fields of other sections are untouched');

    resetSettingsSection(draft, 'reader-interface-status-hud', defaults);
    assert.equal(draft.readerSettings.statusHud.enabled, true);
    assert.equal(draft.readerSettings.statusHud.size, 'medium');
    assert.deepEqual(draft.readerSettings.statusHud.tables, []);
    assert.notEqual(draft.readerSettings.statusHud.tables, defaults.readerSettings.statusHud.tables, 'defaults are copied, not shared');
    assert.equal(draft.readerSettings.statusHud.nsfwSpriteMode, 'hide', 'status-bar reset keeps NSFW options that live on the performance page');

    resetSettingsSection(draft, 'reader-text-style', defaults);
    assert.equal(draft.readerSettings.classicVnTheme.nameColor, '#3a2a1a', 'classic skin resets the classic theme');
    assert.equal(draft.readerSettings.vnTheme.nameColor, '#000000');

    resetSettingsSection(draft, 'reader-interface-option-bubble', defaults);
    assert.deepEqual(draft.bridge.optionBubble, defaults.bridge.optionBubble);
    assert.deepEqual(draft.bridge.sceneAssets, { enabled: true });

    assert.equal(resetSettingsSection(draft, 'scene-assets', defaults).ok, false, 'user-data sections cannot be reset');
    assert.ok(Object.keys(SETTINGS_SECTIONS).every((id) => settingsSectionPaths(id, draft).length > 0));
    assert.match(renderSectionResetButton('reader-dialog-size'), /data-action="settings-reset-section:reader-dialog-size"[^>]*>重置本区</);
    assert.equal(renderSectionResetButton('nope'), '');
});

test('gate:settings-sections:export-omits-secrets-and-import-keeps-local-secrets', () => {
    const draft = {
        bridge: {
            openMode: 'pc',
            imageApi: { source: 'nai', apiKey: 'local-image-key' },
            autoIllustration: { llm: { apiKey: 'local-llm-key', model: 'm1' }, nai: { apiKey: 'local-nai-key' } },
        },
        readerSettings: { fontSize: 18 },
    };
    const exported = buildSettingsExport(draft, { version: '0.30.0', now: new Date('2026-09-30T00:00:00Z') });
    assert.equal(exported.format, 'igs-settings');
    assert.equal(exported.version, '0.30.0');
    assert.doesNotMatch(JSON.stringify(exported), /local-(image|llm|nai)-key/);
    assert.equal(exported.bridge.autoIllustration.llm.model, 'm1');
    assert.equal(draft.bridge.imageApi.apiKey, 'local-image-key', 'export does not mutate the draft');

    const text = JSON.stringify({ ...exported, readerSettings: { fontSize: 24 }, bridge: { ...exported.bridge, openMode: 'mobile' } });
    const other = { bridge: { imageApi: { apiKey: 'other-device-key' }, autoIllustration: { llm: { apiKey: 'other-llm' } } }, readerSettings: {} };
    const imported = parseSettingsImport(text, other);
    assert.equal(imported.ok, true);
    assert.equal(imported.readerSettings.fontSize, 24);
    assert.equal(imported.bridge.openMode, 'mobile');
    assert.equal(imported.bridge.imageApi.apiKey, 'other-device-key', 'import keeps the secrets already on this device');
    assert.equal(imported.bridge.autoIllustration.llm.apiKey, 'other-llm');
    assert.equal(imported.bridge.autoIllustration.llm.model, 'm1');

    const explicit = parseSettingsImport(JSON.stringify({ bridge: { imageApi: { apiKey: 'from-file' } } }), other);
    assert.equal(explicit.bridge.imageApi.apiKey, 'from-file', 'a key written into the file by hand wins');
    assert.deepEqual(explicit.readerSettings, {}, 'missing half falls back to the current settings');

    assert.equal(parseSettingsImport('{oops', {}).reason, 'invalid-json');
    assert.equal(parseSettingsImport('[1,2]', {}).reason, 'invalid-format');
    assert.equal(parseSettingsImport(JSON.stringify({ format: 'other', bridge: {} }), {}).reason, 'invalid-format');
    assert.equal(parseSettingsImport(JSON.stringify({ hello: 1 }), {}).reason, 'invalid-format');
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
        getDefaultSettings: () => ({ bridge: { sourceFilter: { enabled: false, textIncludeTags: 'content' } }, readerSettings: { fontSize: 16, dialogFontWeight: null } }),
        normalizeImportedSettings: (imported) => ({
            bridge: { ...imported.bridge, normalized: true },
            readerSettings: { ...imported.readerSettings, fontSize: Math.min(30, Number(imported.readerSettings.fontSize) || 16) },
        }),
        ...extra.ctx,
    };
    return { ctx, calls };
}

test('gate:settings-sections:reset-action-asks-first-and-only-touches-its-section', async () => {
    const draft = { bridge: { sourceFilter: { enabled: true, textIncludeTags: 'story' }, openMode: 'mobile' }, readerSettings: { fontSize: 24, dialogFontWeight: 700, dialogWidth: 520 } };
    const { ctx, calls } = actionCtx(draft, [false, true, true]);

    await handleSettingsAction('settings-reset-section:reader-text-layout', ctx);
    assert.equal(draft.readerSettings.fontSize, 24, 'declining the confirm bar keeps the values');
    assert.equal(calls.persisted, 0);
    assert.match(calls.asked[0], /「排版」/);

    await handleSettingsAction('settings-reset-section:reader-text-layout', ctx);
    assert.equal(draft.readerSettings.fontSize, 16);
    assert.equal(draft.readerSettings.dialogFontWeight, null);
    assert.equal(draft.readerSettings.dialogWidth, 520);
    assert.equal(calls.persisted, 1);

    await handleSettingsAction('settings-reset-section:basic-source-filter', ctx);
    assert.deepEqual(draft.bridge.sourceFilter, { enabled: false, textIncludeTags: 'content' });
    assert.equal(draft.bridge.openMode, 'mobile');

    assert.equal((await handleSettingsAction('settings-reset-section:scene-assets', ctx)).ok, false);
});

test('gate:settings-sections:import-action-confirms-and-runs-through-normalize', async () => {
    const draft = { bridge: { openMode: 'pc', imageApi: { apiKey: 'mine' } }, readerSettings: { fontSize: 16 } };
    const file = { format: 'igs-settings', bridge: { openMode: 'mobile', imageApi: {} }, readerSettings: { fontSize: 99 } };
    const doc = {
        body: { appendChild() {}, removeChild() {} },
        createElement() {
            const input = { files: null, onchange: null, click() { input.files = [{ name: 'backup.json', text: JSON.stringify(file) }]; input.onchange(); } };
            return input;
        },
    };
    const prevReader = globalThis.FileReader;
    globalThis.FileReader = class {
        readAsText(blob) { queueMicrotask(() => this.onload({ target: { result: blob.text } })); }
    };
    try {
        const declined = actionCtx(draft, [false], { options: { global: { document: doc } } });
        await handleSettingsAction('settings-import-all', declined.ctx);
        assert.equal(draft.bridge.openMode, 'pc', 'declining keeps the current settings');
        assert.match(declined.calls.asked[0], /backup/);

        const accepted = actionCtx(draft, [true], { options: { global: { document: doc } } });
        await handleSettingsAction('settings-import-all', accepted.ctx);
        assert.equal(draft.bridge.openMode, 'mobile');
        assert.equal(draft.bridge.normalized, true, 'imported settings go through normalize');
        assert.equal(draft.readerSettings.fontSize, 30);
        assert.equal(draft.bridge.imageApi.apiKey, 'mine', 'local key survives an import without keys');
        assert.equal(accepted.calls.persisted, 1);
    } finally {
        globalThis.FileReader = prevReader;
    }
});
