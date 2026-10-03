import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsDialogs } from '../src/visual/igs-ui/settings-dialog.js';
import { captureSettingsFocus, restoreSettingsFocus, settingsFocusSelector } from '../src/visual/igs-ui/settings-focus.js';
import {
    SETTINGS_SECTIONS, buildSettingsExport, parseSettingsImport, renderSectionResetButton, resetSettingsSection, settingsSectionPaths,
} from '../src/visual/igs-ui/settings-sections.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { moodTierLabels } from '../src/scene/mood-groups.js';

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

test('gate:expression-set:fills-groups-that-have-no-image', async () => {
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const asks = [];
    const seen = [];
    const draft = {
        bridge: {
            sceneAssets: {
                characters: { 冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:old-joy', 愤怒: 'https://kept.example/a.png' } },
                characterOutfits: { 冬月: { 日常: { words: [], moods: { 喜悦: 'igs-gen:old-outfit' } } } },
            },
        },
        readerSettings: {},
    };
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: {
            global: { alert() {}, document: { getElementById() { return null; } } },
            generatedAssets: {
                getImagePrompt: async () => ({ positive: '1girl', negative: 'lowres', caption }),
                generateExpressionImage: async () => { throw new Error('整套不应走单张'); },
                generateExpressionSet: async (input) => {
                    seen.push(input.moods.slice());
                    return {
                        ok: true,
                        items: input.moods.map((mood) => ({ mood, ok: true, imageId: `new-${mood}` })),
                    };
                },
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: { confirm: async (message) => { asks.push(message); return true; } },
    };
    // 喜悦、愤怒已有图，剩下的才是这档要画的；组名和顺序都从预设取。
    const missingTier8 = moodTierLabels(8).filter((mood) => mood !== '喜悦' && mood !== '愤怒');
    const character = await handleSettingsAction('char-expression-set:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(character.ok, true);
    assert.match(asks[0], new RegExp(`这一档还有 ${missingTier8.length} 张没画：${missingTier8.join('、')}`));
    assert.match(asks[0], /已有的 2 张不动/);
    assert.deepEqual(seen[0], missingTier8);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['喜悦'], 'igs-gen:old-joy');
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['愤怒'], 'https://kept.example/a.png');
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['悲伤'], 'igs-gen:new-悲伤');
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['默认'], 'igs-gen:def');
    const again = await handleSettingsAction('char-expression-set:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(again.ok, true);
    assert.equal(seen.length, 1);
    const outfit = await handleSettingsAction('outfit-expression-set:%E5%86%AC%E6%9C%88:%E6%97%A5%E5%B8%B8', ctx);
    assert.equal(outfit.ok, true);
    const missingOutfit = moodTierLabels(8).filter((mood) => mood !== '喜悦');
    assert.match(asks[1], new RegExp(`这一档还有 ${missingOutfit.length} 张没画：${missingOutfit.join('、')}`));
    assert.equal(draft.bridge.sceneAssets.characterOutfits['冬月']['日常'].moods['喜悦'], 'igs-gen:old-outfit');
    assert.equal(draft.bridge.sceneAssets.characterOutfits['冬月']['日常'].moods['愤怒'], 'igs-gen:new-愤怒');
});

test('gate:expression-set:repaints-failed-slots-without-rewriting-prompts', async () => {
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const failed = {
        v4_prompt: { caption: { base_caption: 'angry face', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const asks = [];
    const painted = [];
    const written = [];
    // 档位 8 的组名从预设来，预设调整时这里跟着走，不再手抄一份。
    const moods = moodTierLabels(8);
    const notes = {};
    const slots = { 默认: 'igs-gen:def' };
    for (const mood of moods) {
        slots[mood] = '';
        notes[mood] = { error: '出图失败', caption: { ...failed, mood } };
    }
    const draft = {
        bridge: {
            sceneAssets: {
                characters: { 冬月: slots },
                generated: { expressionNotes: { 冬月: notes } },
            },
        },
        readerSettings: {},
    };
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: {
            global: { alert() {}, document: { getElementById() { return null; } } },
            generatedAssets: {
                getImagePrompt: async () => ({ positive: '1girl', negative: 'lowres', caption }),
                generateExpressionSet: async (input) => { written.push(input.moods.slice()); return { ok: true, items: [] }; },
                paintExpressionCaptions: async (input) => {
                    painted.push(input.items.map((item) => item.mood));
                    return { ok: true, items: input.items.map((item) => ({ mood: item.mood, ok: true, imageId: `paint-${item.mood}` })) };
                },
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: { confirm: async (message) => { asks.push(message); return true; } },
    };
    const allReady = await handleSettingsAction('char-expression-set:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(allReady.ok, true);
    assert.match(asks[0], /只补画这 8 张，不重写提示词/);
    assert.deepEqual(written, []);
    assert.deepEqual(painted[0], moods);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['愤怒'], 'igs-gen:paint-愤怒');

    // 喜悦已有图、愤怒有词没图，其余这一档的组都要现写词；组序从预设取。
    const mixedTier8 = moodTierLabels(8).filter((mood) => mood !== '喜悦' && mood !== '愤怒');
    draft.bridge.sceneAssets.characters['冬月'] = { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy', 愤怒: '' };
    draft.bridge.sceneAssets.generated = { expressionNotes: { 冬月: { 愤怒: { error: '出图失败', caption: failed } } } };
    const mixed = await handleSettingsAction('char-expression-set:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(mixed.ok, true);
    assert.match(asks[1], /只补画：愤怒/);
    assert.match(asks[1], new RegExp(`要先写提示词：${mixedTier8.join('、')}`));
    assert.deepEqual(painted[1], ['愤怒']);
    assert.deepEqual(written, [mixedTier8]);
});

test('gate:character-sprite:generates-default-from-the-character-page', async () => {
    const asks = [];
    const draft = {
        bridge: {
            sceneAssets: {
                characters: { 冬月: { 默认: '' } },
                characterDna: { 路人甲: { identity: '黑发', defaultAppearance: '', negative: '', triggerWords: '' } },
            },
        },
        readerSettings: {},
    };
    const seen = [];
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: {
            global: { alert() {}, document: { getElementById() { return null; } } },
            generatedAssets: {
                generateCharacterSprite: async (input) => {
                    seen.push(input);
                    return { ok: true, imageId: input.name === '冬月' ? 'made-1' : 'made-2' };
                },
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: { confirm: async (message) => { asks.push(message); return true; } },
    };
    const first = await handleSettingsAction('char-generate-sprite:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(first.ok, true);
    assert.match(asks[0], /生成「冬月」的默认立绘/);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['默认'], 'igs-gen:made-1');
    assert.deepEqual(draft.bridge.sceneAssets.characterDna['冬月'], undefined);
    assert.equal(seen[0].dna, null);

    draft.bridge.sceneAssets.characters['冬月']['默认'] = 'https://kept.example/a.png';
    const replaced = await handleSettingsAction('char-generate-sprite:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(replaced.ok, true);
    assert.match(asks[1], /现在这张会被换掉/);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['默认'], 'igs-gen:made-1');

    const dnaOnly = await handleSettingsAction('char-generate-sprite:%E8%B7%AF%E4%BA%BA%E7%94%B2', ctx);
    assert.equal(dnaOnly.ok, true);
    assert.equal(draft.bridge.sceneAssets.characters['路人甲']['默认'], 'igs-gen:made-2');
    assert.deepEqual(draft.bridge.sceneAssets.characterAliases['路人甲'], []);
    assert.equal(seen[2].dna.identity, '黑发');
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
        readerSettings: { fontSize: 18, spriteLayouts: { 'pc::小雪': { posX: 1, posY: 2, scale: 3 } } },
    };
    draft.bridge.sceneAssets = {
        enabled: true,
        promptRule: '规则',
        scenes: { 教室: { url: 'igs-gen:room' } },
        cards: { 'card:小雪': { characters: { 小雪: { 默认: 'igs-gen:snow' } } } },
    };
    const exported = buildSettingsExport(draft, { version: '0.30.0', now: new Date('2026-09-30T00:00:00Z') });
    assert.equal(exported.format, 'igs-settings');
    assert.equal(exported.version, '0.30.0');
    assert.doesNotMatch(JSON.stringify(exported), /local-(image|llm|nai)-key/);
    assert.equal(exported.bridge.autoIllustration.llm.model, 'm1');
    assert.equal(exported.bridge.sceneAssets.enabled, true);
    assert.equal(exported.bridge.sceneAssets.promptRule, '规则');
    assert.equal(exported.bridge.sceneAssets.scenes, undefined);
    assert.equal(exported.bridge.sceneAssets.cards, undefined);
    assert.equal(exported.readerSettings.spriteLayouts, undefined);
    assert.equal(draft.bridge.imageApi.apiKey, 'local-image-key', 'export does not mutate the draft');
    assert.equal(draft.bridge.sceneAssets.scenes.教室.url, 'igs-gen:room');

    const text = JSON.stringify({ ...exported, readerSettings: { fontSize: 24 }, bridge: { ...exported.bridge, openMode: 'mobile' } });
    const other = {
        bridge: {
            imageApi: { apiKey: 'other-device-key' },
            autoIllustration: { llm: { apiKey: 'other-llm' } },
            sceneAssets: { scenes: { 街道: { url: 'local' } }, cards: { 'card:林': { scenes: {} } } },
        },
        readerSettings: { spriteLayouts: { pc: { posX: 50, posY: 100, scale: 100 } } },
    };
    const imported = parseSettingsImport(text, other);
    assert.equal(imported.ok, true);
    assert.equal(imported.readerSettings.fontSize, 24);
    assert.equal(imported.bridge.openMode, 'mobile');
    assert.equal(imported.bridge.imageApi.apiKey, 'other-device-key', 'import keeps the secrets already on this device');
    assert.equal(imported.bridge.autoIllustration.llm.apiKey, 'other-llm');
    assert.equal(imported.bridge.autoIllustration.llm.model, 'm1');
    assert.equal(imported.bridge.sceneAssets.scenes.街道.url, 'local');
    assert.ok(imported.bridge.sceneAssets.cards['card:林']);
    assert.equal(imported.readerSettings.spriteLayouts.pc.scale, 100);

    const explicit = parseSettingsImport(JSON.stringify({ bridge: { imageApi: { apiKey: 'from-file' } } }), other);
    assert.equal(explicit.bridge.imageApi.apiKey, 'from-file', 'a key written into the file by hand wins');
    assert.deepEqual(explicit.readerSettings, other.readerSettings, 'missing half falls back to the current settings');

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
        getDefaultSettings: () => ({ bridge: { sourceFilter: { enabled: false, textIncludeTags: 'content' } }, readerSettings: { fontSize: 16, dialogFontWeight: null, dialogTextEffect: 'off', dialogTextEffectColor: '#000000', dialogTextEffectStrength: 20 } }),
        normalizeImportedSettings: (imported) => ({
            bridge: { ...imported.bridge, normalized: true },
            readerSettings: { ...imported.readerSettings, fontSize: Math.min(30, Number(imported.readerSettings.fontSize) || 16) },
        }),
        ...extra.ctx,
    };
    return { ctx, calls };
}

test('gate:settings-sections:reset-action-asks-first-and-only-touches-its-section', async () => {
    const draft = { bridge: { sourceFilter: { enabled: true, textIncludeTags: 'story' }, openMode: 'mobile' }, readerSettings: { fontSize: 24, dialogFontWeight: 700, dialogTextEffect: 'outline', dialogTextEffectColor: '#123456', dialogTextEffectStrength: 40, dialogWidth: 520 } };
    const { ctx, calls } = actionCtx(draft, [false, true, true]);

    await handleSettingsAction('settings-reset-section:reader-text-layout', ctx);
    assert.equal(draft.readerSettings.fontSize, 24, 'declining the confirm bar keeps the values');
    assert.equal(calls.persisted, 0);
    assert.match(calls.asked[0], /「排版」/);

    await handleSettingsAction('settings-reset-section:reader-text-layout', ctx);
    assert.equal(draft.readerSettings.fontSize, 16);
    assert.equal(draft.readerSettings.dialogFontWeight, null);
    assert.equal(draft.readerSettings.dialogTextEffect, 'off');
    assert.equal(draft.readerSettings.dialogTextEffectColor, '#000000');
    assert.equal(draft.readerSettings.dialogTextEffectStrength, 20);
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
            const input = { files: null, onchange: null, click() { input.files = [{ name: 'backup.json', bytes: new TextEncoder().encode(JSON.stringify(file)) }]; input.onchange(); } };
            return input;
        },
    };
    const prevReader = globalThis.FileReader;
    globalThis.FileReader = class {
        readAsArrayBuffer(blob) { queueMicrotask(() => this.onload({ target: { result: blob.bytes.buffer } })); }
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

// v0.34.8 起出图结果提示漏了 remountSettingsNotice 的引用：面板开着时一弹就 ReferenceError，重画半路中断。
test('gate:expression-retry:failed-paint-reports-without-throwing-while-panel-open', async () => {
    const makeEl = () => {
        const el = { className: '', textContent: '', parentNode: null, setAttribute() {}, getAttribute: () => null,
            querySelector: () => null, querySelectorAll: () => [], removeChild(c) { if (c) c.parentNode = null; },
            appendChild(c) { if (c) c.parentNode = el; }, addEventListener() {} };
        return el;
    };
    const host = makeEl();
    host.id = 'igs-unified-settings';
    host.ownerDocument = { createElement: makeEl };
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const draft = { bridge: { sceneAssets: { characters: { 冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy' } }, generated: {} } }, readerSettings: {} };
    const shown = [];
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: {
            global: { document: { getElementById: (id) => (id === 'igs-unified-settings' ? host : null) }, alert() {}, setTimeout: () => 0 },
            generatedAssets: {
                getImagePrompt: async () => ({ positive: '1girl', negative: 'lowres', caption }),
                generateExpressionSet: async () => ({ ok: true, items: [] }),
                generateExpressionImage: async () => ({ ok: true, items: [{ mood: '喜悦', ok: false, error: '出图超时（3 分钟）' }] }),
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: { confirm: async () => true, view: async (message) => { shown.push(message); }, isOpen: () => false },
    };
    const result = await handleSettingsAction('char-expression-retry:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6', ctx);
    assert.equal(result.ok, true);
    assert.match(shown[0], /「冬月」的「喜悦」没画出来：出图超时（3 分钟）/);
    assert.match(shown[0], /原来那张没动/);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['喜悦'], 'igs-gen:joy');

    // 别的弹窗正开着时改走底部提示条，这条路径要用到 remountSettingsNotice。
    const notices = [];
    host.appendChild = (child) => { if (child) { child.parentNode = host; notices.push(child); } };
    ctx.dialogs.isOpen = () => true;
    const barred = await handleSettingsAction('char-expression-retry:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6', ctx);
    assert.equal(barred.ok, true);
    assert.equal(shown.length, 1, 'no second dialog over the open one');
    assert.match(notices.map((el) => el.textContent).join(' '), /「冬月」的「喜悦」没画出来/);
});

test('gate:expression-set:custom-groups-only-when-asked', async () => {
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const run = async (takeCustom) => {
        const asks = [];
        const seen = [];
        const draft = {
            bridge: {
                sceneAssets: {
                    characters: { 冬月: { 默认: 'igs-gen:def', 旧组甲: 'igs-gen:has' } },
                    moodGroups: [{ label: '喜悦', words: [] }, { label: '旧组甲', words: [] }, { label: '旧组乙', words: [] }, { label: '旧组丙', words: [] }],
                },
            },
            readerSettings: {},
        };
        const ctx = {
            state: { activeSettings: { draft, asyncState: {} } },
            options: {
                global: { alert() {}, document: { getElementById() { return null; } } },
                generatedAssets: {
                    getImagePrompt: async () => ({ positive: '1girl', negative: 'lowres', caption }),
                    generateExpressionSet: async (input) => {
                        seen.push(input.moods.slice());
                        return { ok: true, items: input.moods.map((mood) => ({ mood, ok: true, imageId: `new-${mood}` })) };
                    },
                },
            },
            persistSettingsDraft: () => ({ ok: true }),
            rerenderSettings: () => ({ ok: true }),
            dialogs: {
                prompt: async () => '20',
                confirm: async (message) => { asks.push(message); return message.includes('自建') ? takeCustom : true; },
            },
        };
        await handleSettingsAction('char-expression-set:%E5%86%AC%E6%9C%88', ctx);
        return { asks, seen };
    };
    const skipped = await run(false);
    assert.match(skipped.asks[0], /另有 2 个自建情绪组还没图：旧组乙、旧组丙/);
    assert.match(skipped.asks[1], /生成「冬月」的 20 张表情差分/);
    assert.equal(skipped.seen[0].length, 20);
    const taken = await run(true);
    assert.equal(taken.seen[0].length, 22);
    assert.deepEqual(taken.seen[0].slice(-2), ['旧组乙', '旧组丙']);
});

test('gate:settings-dialog:choose-picks-a-button-and-highlights-current', async () => {
    const panel = makePanel();
    const dialogs = createSettingsDialogs({ getContainer: () => panel.container, fallback: () => { throw new Error('native dialog must not be used'); } });
    const choices = [{ value: '8', label: '8', note: '普通角色' }, { value: '12', label: '12', note: '重要配角' }, { value: '18', label: '18', note: '主角' }];
    const answer = dialogs.choose('「冬月」要画多少张表情差分？', choices, '12');
    const bar = panel.overlay.querySelector('.igs-settings-dialog');
    assert.match(bar.className, /is-choose/);
    assert.equal(bar.querySelector('.igs-settings-dialog-input'), null, 'no text input to type into');
    assert.equal(bar.querySelector('[data-settings-dialog="ok"]'), null);
    const current = bar.querySelector('.igs-settings-dialog-choice.is-current');
    assert.equal(current.getAttribute('data-settings-choice'), '12');
    assert.ok(panel.doc.activeElement === current);
    rebuildPanel(panel, () => {});
    dialogs.remount(panel.container);
    panel.overlay.querySelector('[data-settings-choice="18"]').dispatch('click');
    assert.equal(await answer, '18');
    const cancelled = dialogs.choose('再选一次', choices, '8');
    panel.overlay.querySelector('[data-settings-dialog="cancel"]').dispatch('click');
    assert.equal(await cancelled, null);
});

test('gate:status-avatar:generates-a-chibi-avatar-and-default-slot-can-regenerate', async () => {
    const { buildCharacterAvatarDescription } = await import('../src/generated-images/dbgen-prompt.js');
    const { renderCharacterAssetList } = await import('../src/visual/igs-ui/settings-fields.js');
    assert.match(buildCharacterAvatarDescription('冬月', null), /Q 版头像（chibi）/);
    const asks = [];
    const seen = [];
    const draft = {
        bridge: { sceneAssets: { characters: { 冬月: { 默认: 'igs-gen:def' } }, characterDna: { 冬月: { identity: 'black hair', defaultAppearance: '', negative: '', triggerWords: '' } } } },
        readerSettings: {},
    };
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: {
            global: { alert() {}, document: { getElementById() { return null; } } },
            generatedAssets: {
                generateCharacterAvatar: async (input) => { seen.push(input); return { ok: true, dataUrl: 'data:image/png;base64,QUJD' }; },
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: { confirm: async (message) => { asks.push(message); return true; } },
    };
    const made = await handleSettingsAction('status-avatar-generate:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(made.ok, true);
    assert.match(asks[0], /生成「冬月」的 Q 版头像/);
    assert.equal(seen[0].dna.identity, 'black hair');
    assert.equal(draft.bridge.sceneAssets.statusAvatars['冬月'], 'data:image/png;base64,QUJD');
    await handleSettingsAction('status-avatar-generate:%E5%86%AC%E6%9C%88', ctx);
    assert.match(asks[1], /现在的头像会被换掉/);
    const html = renderCharacterAssetList({ 冬月: { 默认: 'igs-gen:def', 喜悦: '' } }, { isOpen: () => true, statusAvatars: draft.bridge.sceneAssets.statusAvatars });
    assert.ok(html.includes('data-action="status-avatar-generate:%E5%86%AC%E6%9C%88"'));
    assert.ok(html.includes('重画Q版'));
    assert.match(html, /data-action="char-generate-sprite:%E5%86%AC%E6%9C%88"[^>]*>重新生成</);
});

test('gate:row-menu:flips-up-or-clamps-near-the-bottom-of-the-scroll-area', async () => {
    const { placeRowMenu } = await import('../src/visual/igs-ui/settings-outfit-fields.js');
    const make = (anchorTop, menuHeight) => {
        const classes = new Set();
        const scroller = { parentElement: null, getBoundingClientRect: () => ({ top: 100, bottom: 600 }), overflowY: 'auto' };
        const list = { style: {}, scrollHeight: menuHeight, getBoundingClientRect: () => ({ height: menuHeight }) };
        const details = {
            open: true, parentElement: scroller,
            classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
            querySelector: () => list,
            getBoundingClientRect: () => ({ top: anchorTop, bottom: anchorTop + 28 }),
        };
        const win = { innerHeight: 900, getComputedStyle: (el) => ({ overflowY: el.overflowY || 'visible' }) };
        placeRowMenu(details, win);
        return { up: classes.has('is-up'), max: list.style.maxHeight };
    };
    assert.deepEqual(make(150, 200), { up: false, max: '' }, 'room below: opens down');
    assert.deepEqual(make(520, 200), { up: true, max: '' }, 'near bottom: flips up');
    const tight = make(380, 400);
    assert.equal(tight.up, true);
    assert.equal(tight.max, '272px', 'no room either way: clamp and scroll inside');

    const placeX = (anchorLeft, menuWidth) => {
        const classes = new Set();
        const scroller = {
            parentElement: null,
            getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 40, right: 400 }),
            overflowY: 'auto', overflowX: 'hidden',
        };
        const list = {
            style: {}, scrollHeight: 120, scrollWidth: menuWidth,
            getBoundingClientRect: () => ({ height: 120, width: menuWidth }),
        };
        const details = {
            open: true, parentElement: scroller,
            classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
            querySelector: () => list,
            getBoundingClientRect: () => ({ top: 80, bottom: 108, left: anchorLeft, right: anchorLeft + 28 }),
        };
        const win = {
            innerHeight: 900, innerWidth: 800,
            getComputedStyle: (el) => ({ overflowY: el.overflowY || 'visible', overflowX: el.overflowX || 'visible' }),
        };
        placeRowMenu(details, win);
        return classes.has('is-flip-x');
    };
    assert.equal(placeX(340, 180), false, 'button on the right: menu still opens left');
    assert.equal(placeX(48, 180), true, 'button on the left: menu opens right so it stays inside');
});

test('gate:regenerate:failure-pops-a-panel-dialog-with-the-reason', async () => {
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const draft = { bridge: { sceneAssets: { characters: { 冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy' } } } }, readerSettings: {} };
    const views = [];
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: {
            global: { alert() { throw new Error('native alert must not be used'); }, document: { getElementById() { return null; } } },
            generatedAssets: {
                getImagePrompt: async () => ({ positive: '1girl', negative: 'lowres', caption }),
                generateExpressionSet: async () => { throw new Error('重画不该重写提示词'); },
                generateExpressionImage: async ({ mood }) => ({ ok: true, items: [{ mood, ok: false, error: '数据库生图插件出图超时（3 分钟）' }] }),
                generateCharacterSprite: async () => { throw new Error('插件没有响应'); },
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: { confirm: async () => true, view: async (message) => { views.push(message); return true; }, isOpen: () => false },
    };
    await handleSettingsAction('char-expression-retry:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6', ctx);
    assert.match(views[0], /「冬月」的「喜悦」没画出来/);
    assert.match(views[0], /出图超时（3 分钟）/);
    assert.match(views[0], /原来那张没动/);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['喜悦'], 'igs-gen:joy', 'old image is kept');

    const sprite = await handleSettingsAction('char-generate-sprite:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(sprite.ok, false);
    assert.match(views[1], /默认立绘没画出来：插件没有响应/);

    // 用户正在答别的对话框时不顶掉它，改走提示条（这里面板没开，退回 alert）。
    const alerts = [];
    ctx.options.global.alert = (message) => alerts.push(message);
    ctx.dialogs.isOpen = () => true;
    await handleSettingsAction('char-generate-sprite:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(views.length, 2);
    assert.match(alerts[0], /插件没有响应/);
});
