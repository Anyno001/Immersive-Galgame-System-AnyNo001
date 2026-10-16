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

test('gate:settings-dialog:preset-name-input-keeps-same-node-through-panel-refresh', async () => {
    const panel = makePanel();
    const dialogs = createSettingsDialogs({ getContainer: () => panel.container, fallback: () => { throw new Error('native dialog must not be used'); } });
    const answer = dialogs.prompt('存为预设，名字：', '全局');
    const input = panel.overlay.querySelector('.igs-settings-dialog-input');
    assert.equal(dialogs.hasTextInput(), true);
    input.value = '正在输入的预设名';
    input.dispatch('input');
    for (let i = 0; i < 3; i += 1) {
        if (!dialogs.hasTextInput()) rebuildPanel(panel, () => {});
        dialogs.remount();
        assert.ok(panel.overlay.querySelector('.igs-settings-dialog-input') === input, 'refresh does not replace the focused input');
        assert.ok(panel.doc.activeElement === input);
        assert.equal(input.value, '正在输入的预设名');
    }
    input.dispatch('keydown', { key: 'Enter' });
    assert.equal(await answer, '正在输入的预设名');
    assert.equal(dialogs.hasTextInput(), false);
    const confirm = dialogs.confirm('覆盖已有预设？');
    assert.equal(dialogs.hasTextInput(), false, 'confirmation still permits panel refresh');
    dialogs.cancel();
    assert.equal(await confirm, false);
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
    assert.match(asks[0], new RegExp(`这一档还有 ${missingTier8.length} 张尚未生成：${missingTier8.join('、')}`));
    assert.match(asks[0], /已有的 2 张保持不变/);
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
    assert.match(asks[1], new RegExp(`这一档还有 ${missingOutfit.length} 张尚未生成：${missingOutfit.join('、')}`));
    assert.equal(draft.bridge.sceneAssets.characterOutfits['冬月']['日常'].moods['喜悦'], 'igs-gen:old-outfit');
    assert.equal(draft.bridge.sceneAssets.characterOutfits['冬月']['日常'].moods['愤怒'], 'igs-gen:new-愤怒');
});

// 新衣服（睡衣这类）还没有自己的图：档位里多一项「1 张」，只画这套的「平和」，所有表情共用；整套差分之后照它画；不改角色记住的档位。
test('gate:expression-set:new-outfit-can-paint-one-default-first', async () => {
    const caption = {
        v4_prompt: { caption: { base_caption: '1girl', char_captions: [] } },
        v4_negative_prompt: { caption: { base_caption: 'lowres', char_captions: [] } },
    };
    const asks = [];
    const seen = [];
    const choose = [];
    const promptIds = [];
    let pick = '1';
    const draft = {
        bridge: {
            sceneAssets: {
                characters: { 冬月: { 默认: 'igs-gen:def' } },
                characterOutfits: { 冬月: { 泳装: { words: [], moods: {} } } },
                characterMoodTiers: { 冬月: 12 },
            },
        },
        readerSettings: {},
    };
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: {
            global: { alert() {}, document: { getElementById() { return null; } } },
            generatedAssets: {
                getImagePrompt: async (id) => { promptIds.push(id); return { positive: '1girl', negative: 'lowres', caption }; },
                generateExpressionSet: async (input) => {
                    seen.push(input.moods.slice());
                    return { ok: true, items: input.moods.map((mood) => ({ mood, ok: true, imageId: `new-${mood}` })) };
                },
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: {
            choose: async (title, choices, current) => { choose.push({ title, values: choices.map((c) => c.value), current }); return pick; },
            confirm: async (message) => { asks.push(message); return true; },
        },
    };
    const action = 'outfit-expression-set:%E5%86%AC%E6%9C%88:%E6%B3%B3%E8%A3%85';
    assert.equal((await handleSettingsAction(action, ctx)).ok, true);
    assert.deepEqual(choose[0].values, ['1', '8', '12', '16', '20', 'pick']);
    assert.equal(choose[0].current, '1', '新衣服默认选「1 张」');
    assert.deepEqual(seen[0], ['平和']);
    assert.match(asks[0], /给「冬月」的服装「泳装」画 1 张「平和」/);
    const outfit = draft.bridge.sceneAssets.characterOutfits['冬月']['泳装'];
    assert.equal(outfit.moods['平和'], 'igs-gen:new-平和');
    assert.deepEqual(Object.keys(outfit.moods), ['平和']);
    assert.equal(draft.bridge.sceneAssets.characterMoodTiers['冬月'], 12, '不改记住的档位');
    // 有了自己的图：不再出「1 张」，整套差分以这张为底图，已有的平和不重画。
    pick = '8';
    promptIds.length = 0;
    assert.equal((await handleSettingsAction(action, ctx)).ok, true);
    assert.deepEqual(choose[1].values, ['8', '12', '16', '20', 'pick']);
    assert.equal(promptIds[0], 'new-平和');
    assert.deepEqual(seen[1], moodTierLabels(8).filter((mood) => mood !== '平和'));
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
    assert.match(asks[1], /将直接补画：愤怒/);
    assert.match(asks[1], new RegExp(`需先编写提示词：${mixedTier8.join('、')}`));
    assert.deepEqual(painted[1], ['愤怒']);
    assert.deepEqual(written, [mixedTier8]);
});

test('gate:character-sprite:generates-default-from-the-character-page', async () => {
    const asks = [];
    const notes = [];
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
        dialogs: {
            confirm: async (message) => { asks.push(message); return true; },
            edit: async (message, current) => { notes.push([message, current]); return '银发红瞳，穿白裙'; },
        },
    };
    const first = await handleSettingsAction('char-generate-sprite:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(first.ok, true);
    assert.match(notes[0][0], /立绘有没有要注意的点/);
    assert.equal(notes[0][1], '');
    assert.match(asks[0], /生成「冬月」的默认立绘/);
    assert.equal(seen[0].note, '银发红瞳，穿白裙');
    assert.equal(draft.bridge.sceneAssets.characterSpriteNotes['冬月'], '银发红瞳，穿白裙');
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['默认'], 'igs-gen:made-1');
    assert.deepEqual(draft.bridge.sceneAssets.characterDna['冬月'], undefined);
    assert.equal(seen[0].dna, null);

    draft.bridge.sceneAssets.characters['冬月']['默认'] = 'https://kept.example/a.png';
    const replaced = await handleSettingsAction('char-generate-sprite:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(replaced.ok, true);
    assert.match(asks[1], /生成「冬月」的默认立绘/);
    assert.doesNotMatch(asks[1], /当前这张将被替换/);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['默认'], 'igs-gen:made-1');

    const dnaOnly = await handleSettingsAction('char-generate-sprite:%E8%B7%AF%E4%BA%BA%E7%94%B2', ctx);
    assert.equal(dnaOnly.ok, true);
    assert.equal(draft.bridge.sceneAssets.characters['路人甲']['默认'], 'igs-gen:made-2');
    assert.deepEqual(draft.bridge.sceneAssets.characterAliases['路人甲'], []);
    assert.equal(seen[2].dna.identity, '黑发');
});

test('gate:asset-upload:binds-scene-variants-and-sprite-and-restores-on-save-failure', async () => {
    const image = 'data:image/png;base64,QQ==';
    const draft = { bridge: { sceneAssets: {
        scenes: { 庭院: { url: 'old-bg', times: { 夜: { url: 'old-time', weathers: { 雨: { url: 'old-weather' } } } } } },
        characters: { 冬月: { 默认: 'old-sprite' } },
        characterOutfits: { 冬月: { 校服: { words: [], moods: { 平和: 'old-outfit' }, wardrobe: '校服' } } },
        characterDefaultOutfits: { 冬月: { version: 1, outfitName: '校服' } },
    } }, readerSettings: {} };
    const doc = makeDoc();
    doc.createElement = (tag) => {
        const el = makeEl(doc, tag);
        if (tag === 'input') el.click = () => {
            el.files = [{ type: 'image/png', size: 1 }];
            el.onchange();
        };
        return el;
    };
    class Reader { readAsDataURL() { this.onload({ target: { result: image } }); } }
    const stored = new Map();
    let next = 0;
    let fail = false;
    let readable = true;
    class Image {
        naturalWidth = 100; naturalHeight = 200;
        set src(value) { if (value) queueMicrotask(() => this.onload()); }
    }
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: { global: { document: doc, FileReader: Reader, Image }, generatedAssets: {
            async importAssetImage(data, type) { const id = `uploaded-${++next}`; stored.set(id, { data, type }); return { ok: true, imageId: id }; },
            async deleteImages(ids) { ids.forEach((id) => stored.delete(id)); return { ok: true }; },
            async readStoredImage(id) {
                const record = stored.get(id);
                return readable && record ? { id, type: record.type, dataUrl: record.data } : null;
            },
        } },
        persistSettingsDraft: () => fail ? { ok: false, reason: 'save-failed' } : { ok: true },
        rerenderSettings: () => ({ ok: true }),
        dialogs: { view() {} },
    };
    const cases = [
        ['scene-pick-bg:%E5%BA%AD%E9%99%A2', () => draft.bridge.sceneAssets.scenes.庭院.url, 'background'],
        ['scene-pick-time:%E5%BA%AD%E9%99%A2:%E5%A4%9C', () => draft.bridge.sceneAssets.scenes.庭院.times.夜.url, 'background'],
        ['scene-pick-weather:%E5%BA%AD%E9%99%A2:%E5%A4%9C:%E9%9B%A8', () => draft.bridge.sceneAssets.scenes.庭院.times.夜.weathers.雨.url, 'background'],
        ['scene-pick-mood:%E5%86%AC%E6%9C%88:%E9%BB%98%E8%AE%A4', () => draft.bridge.sceneAssets.characters.冬月.默认, 'sprite'],
        ['scene-pick-outfit-mood:冬月:校服:平和', () => draft.bridge.sceneAssets.characterOutfits.冬月.校服.moods.平和, 'sprite'],
    ];
    for (const [action, getUrl, type] of cases) {
        assert.equal((await handleSettingsAction(action, ctx)).ok, true);
        const id = getUrl().slice('igs-gen:'.length);
        assert.equal(stored.get(id).type, type);
        assert.equal(stored.get(id).data, image);
        const reopened = JSON.parse(JSON.stringify(draft));
        assert.match(JSON.stringify(reopened.bridge.sceneAssets), new RegExp(`igs-gen:${id}`));
    }
    const before = JSON.stringify(draft.bridge.sceneAssets);
    fail = true;
    const failed = await handleSettingsAction(cases[0][0], ctx);
    assert.equal(failed.ok, false);
    assert.equal(JSON.stringify(draft.bridge.sceneAssets), before);
    assert.equal(stored.size, 5);
    const outfitFailed = await handleSettingsAction(cases[4][0], ctx);
    assert.equal(outfitFailed.reason, 'save-failed');
    assert.equal(JSON.stringify(draft.bridge.sceneAssets), before);
    assert.equal(stored.size, 5);
    fail = false;
    readable = false;
    const unreadable = await handleSettingsAction(cases[4][0], ctx);
    assert.equal(unreadable.reason, 'default-outfit-protected');
    assert.equal(JSON.stringify(draft.bridge.sceneAssets), before);
    assert.equal(stored.size, 5);
    assert.equal((await handleSettingsAction('scene-pick-time:%E4%B8%8D%E5%AD%98%E5%9C%A8:%E5%A4%9C', ctx)).reason, 'invalid-asset-slot');
});

test('gate:asset-upload:closed-or-replaced-settings-never-bind-a-late-image', async () => {
    const draft = { bridge: { sceneAssets: { scenes: { 庭院: { url: 'old', times: {} } } } }, readerSettings: {} };
    const doc = makeDoc();
    let input;
    doc.createElement = (tag) => {
        const el = makeEl(doc, tag);
        if (tag === 'input') { input = el; el.click = () => {}; }
        return el;
    };
    class Reader { readAsDataURL() { this.onload({ target: { result: 'data:image/png;base64,QQ==' } }); } }
    let imported = 0;
    let removed = 0;
    let resolveImport;
    const settings = { draft, asyncState: {} };
    const ctx = {
        state: { activeSettings: settings },
        options: { global: { document: doc, FileReader: Reader }, generatedAssets: {
            importAssetImage: () => { imported++; return new Promise((resolve) => { resolveImport = resolve; }); },
            deleteImages: async (ids) => { removed += ids.length; return { ok: true }; },
        } },
        persistSettingsDraft: () => { throw new Error('must not persist stale settings'); },
        rerenderSettings: () => ({ ok: true }),
        dialogs: { view() {} },
    };
    const action = 'scene-pick-bg:%E5%BA%AD%E9%99%A2';
    const first = handleSettingsAction(action, ctx);
    ctx.state.activeSettings = null;
    input.files = [{ type: 'image/png', size: 1 }];
    input.onchange();
    assert.equal((await first).reason, 'settings-closed');
    assert.equal(imported, 0);
    assert.equal(draft.bridge.sceneAssets.scenes.庭院.url, 'old');

    ctx.state.activeSettings = settings;
    const second = handleSettingsAction(action, ctx);
    input.files = [{ type: 'image/png', size: 1 }];
    input.onchange();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(imported, 1);
    settings.draft = JSON.parse(JSON.stringify(draft));
    resolveImport({ ok: true, imageId: 'late-image' });
    assert.equal((await second).reason, 'settings-closed');
    assert.equal(removed, 1);
    assert.equal(draft.bridge.sceneAssets.scenes.庭院.url, 'old');
    assert.equal(settings.draft.bridge.sceneAssets.scenes.庭院.url, 'old');
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
    assert.equal(await dialogs.alert('看一下'), true);
    assert.deepEqual(calls, [['confirm', '删掉？'], ['prompt', '名称：', '旧名']]);
    globalObj.alert = (msg) => { calls.push(['alert', msg]); };
    assert.equal(await dialogs.alert('看一下'), true);
    assert.deepEqual(calls.at(-1), ['alert', '看一下']);
    const bare = createSettingsDialogs({ getContainer: () => null, global: {} });
    assert.equal(await bare.confirm('删掉？'), true, 'no confirm available keeps the old proceed behaviour');
    assert.equal(await bare.prompt('名称：'), null);
});

test('gate:settings-dialog:alert-stays-inside-the-panel', async () => {
    const panel = makePanel();
    const native = [];
    const dialogs = createSettingsDialogs({
        getContainer: () => panel.container,
        global: { alert: (message) => native.push(message), confirm: () => { throw new Error('native confirm'); }, prompt: () => { throw new Error('native prompt'); } },
    });
    const pending = dialogs.alert('文件夹已存在');
    const bar = panel.overlay.querySelector('.igs-settings-dialog');
    assert.equal(bar.getAttribute('role'), 'alertdialog');
    assert.equal(bar.querySelector('[data-settings-dialog="cancel"]'), null);
    bar.querySelector('[data-settings-dialog="ok"]').dispatch('click');
    assert.equal(await pending, true);
    assert.deepEqual(native, []);
});

test('gate:page-modal:confirm-and-alert-do-not-call-the-browser', async () => {
    const doc = makeDoc();
    doc.head = makeEl(doc, 'head');
    doc.getElementById = (id) => doc.head.querySelector(`#${id}`) || doc.body.querySelector(`#${id}`);
    const native = { alert() { throw new Error('alert'); }, confirm() { throw new Error('confirm'); }, prompt() { throw new Error('prompt'); }, document: doc };
    const modal = createIgsModal({ getHost: () => doc.body, global: native });
    const pending = modal.confirm('清扫当前这张 CG？');
    const box = doc.body.querySelector('.igs-page-modal');
    assert.ok(box);
    assert.equal(modal.isOpen(), true);
    box.querySelector('[data-igs-modal="cancel"]').dispatch('click');
    assert.equal(await pending, false);
    assert.equal(modal.isOpen(), false);

    const alerted = modal.alert('图片过大');
    doc.body.querySelector('[data-igs-modal="ok"]').dispatch('click');
    assert.equal(await alerted, true);
    assert.equal(doc.body.querySelector('.igs-page-modal'), null);
});

test('gate:page-modal:transformed-host-does-not-become-the-screen', async () => {
    const doc = makeDoc();
    doc.documentElement = makeEl(doc, 'html');
    doc.documentElement.appendChild(doc.body);
    doc.head = makeEl(doc, 'head');
    doc.documentElement.appendChild(doc.head);
    doc.getElementById = (id) => doc.documentElement.querySelector(`#${id}`);
    const host = makeEl(doc, 'div');
    host.style = { transform: 'translateX(-50%)' };
    doc.body.appendChild(host);
    const modal = createIgsModal({ getHost: () => host, global: { document: doc } });
    const pending = modal.confirm('确认？');
    assert.equal(host.querySelector('.igs-page-modal'), null);
    const box = doc.documentElement.querySelector('.igs-page-modal');
    assert.ok(box);
    assert.equal(box.parentNode, doc.documentElement);
    box.querySelector('[data-igs-modal="ok"]').dispatch('click');
    assert.equal(await pending, true);
});

test('gate:page-modal:一致性生成不弹框且进度透传后交接双图审核', async () => {
    const { runCgConsistencyAction } = await import('../src/visual/igs-ui/cg-consistency-action.js');
    for (const accept of [true, false]) {
        const doc = makeDoc();
        const modal = createIgsModal({ getHost: () => doc.body, global: { document: doc } });
        modal.confirm = () => { throw new Error('无衣装回退不额外确认'); };
        modal.progress = () => { throw new Error('生成期间不打开进度弹框'); };
        const accepted = [], discarded = [], progress = [];
        const service = {
            describeConsistency: () => ({ ok: true }),
            async redrawConsistency(_query, options) {
                assert.equal(modal.isOpen(), false);
                options.onProgress({ phase: 'paint', done: 1, total: 3 });
                assert.equal(modal.isOpen(), false);
                assert.deepEqual(progress, [{ phase: 'paint', done: 1, total: 3 }]);
                return { ok: true, candidateId: 'candidate', dataUrl: 'candidate-image', originalDataUrl: 'original-image' };
            },
            async acceptConsistency(id) { accepted.push(id); return { ok: true, reason: 'accepted' }; },
            cancelConsistency(id) { discarded.push(id); },
        };
        const pending = runCgConsistencyAction({ service, query: {}, modal,
            signal: new AbortController().signal, stillCurrent: () => true, onProgress: detail => progress.push(detail) });
        await new Promise((resolve) => setTimeout(resolve, 0));
        const comparison = doc.body.querySelector('.igs-page-modal-comparison');
        assert.ok(comparison);
        assert.deepEqual(comparison.querySelectorAll('img').map((i) => i.src), ['original-image', 'candidate-image']);
        assert.deepEqual(comparison.querySelectorAll('figcaption').map((i) => i.textContent), ['本次原图', '重绘候选（尚未保存）']);
        assert.ok(doc.body.querySelector('.igs-page-modal-card-comparison'));
        doc.body.querySelector(`[data-igs-modal="${accept ? 'ok' : 'cancel'}"]`).dispatch('click');
        assert.equal((await pending).reason, accept ? 'accepted' : 'cancelled');
        assert.deepEqual(accepted, accept ? ['candidate'] : []);
        assert.deepEqual(discarded, ['candidate']);
        assert.equal(modal.isOpen(), false);
    }
});

for (const confirm of [false, true]) test(`衣装预检：UI集中确认与释放-${confirm}`, async () => {
    const { runCgConsistencyAction } = await import('../src/visual/igs-ui/cg-consistency-action.js');
    const calls = [], confirms = [];
    const service = {
        describeConsistency: () => ({ ok: true }),
        async preflightConsistency() { return { ok: true, reason: 'needs-confirmation', preflightToken: 'preflight',
            confirmations: ['A', 'B'].map(characterKey => ({ characterKey, requestedOutfit: '冬装', effectiveOutfit: '夏装' })) }; },
        async redrawConsistency(_query, options) { calls.push(options); return { ok: true, candidateId: 'candidate',
            dataUrl: 'candidate-image', originalDataUrl: 'original-image' }; },
        async acceptConsistency() { throw new Error('候选未接受'); },
        cancelConsistency(id) { calls.push(id); },
    };
    const modal = { async confirm(message) { confirms.push(message); return confirm; },
        async confirmImage() { return false; }, cancel() {} };
    const result = await runCgConsistencyAction({ service, query: {}, modal,
        signal: new AbortController().signal, stillCurrent: () => true });
    assert.equal(result.reason, 'cancelled');
    assert.equal(confirms.length, 1);
    assert.ok(confirms[0].includes('A') && confirms[0].includes('B'));
    if (confirm) {
        assert.equal(calls[0].preflightToken, 'preflight'); assert.equal(calls[0].confirmed, true);
        assert.equal(calls[1], 'candidate');
    } else assert.deepEqual(calls, ['preflight']);
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
        getDefaultSettings: () => ({ bridge: { sourceFilter: { enabled: false, textIncludeTags: 'content' } }, readerSettings: { fontSize: 16, dialogFontWeight: null, dialogTextEffect: 'off', dialogTextEffectColor: '#000000', dialogTextEffectStrength: 20, dialogTextEffectSize: 0.8 } }),
        normalizeImportedSettings: (imported) => ({
            bridge: { ...imported.bridge, normalized: true },
            readerSettings: { ...imported.readerSettings, fontSize: Math.min(30, Number(imported.readerSettings.fontSize) || 16) },
        }),
        ...extra.ctx,
    };
    return { ctx, calls };
}

test('gate:settings-sections:reset-action-asks-first-and-only-touches-its-section', async () => {
    const draft = { bridge: { sourceFilter: { enabled: true, textIncludeTags: 'story' }, openMode: 'mobile' }, readerSettings: { fontSize: 24, dialogFontWeight: 700, dialogTextEffect: 'outline', dialogTextEffectColor: '#123456', dialogTextEffectStrength: 40, dialogTextEffectSize: 1.6, dialogWidth: 520 } };
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
    assert.equal(draft.readerSettings.dialogTextEffectSize, 0.8);
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
    assert.match(shown[0], /「冬月」的「喜悦」未能生成：出图超时（3 分钟）/);
    assert.match(shown[0], /原有图片保持不变/);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['喜悦'], 'igs-gen:joy');

    // 别的弹窗正开着时改走底部提示条，这条路径要用到 remountSettingsNotice。
    const notices = [];
    host.appendChild = (child) => { if (child) { child.parentNode = host; notices.push(child); } };
    ctx.dialogs.isOpen = () => true;
    const barred = await handleSettingsAction('char-expression-retry:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6', ctx);
    assert.equal(barred.ok, true);
    assert.equal(shown.length, 1, 'no second dialog over the open one');
    assert.match(notices.map((el) => el.textContent).join(' '), /「冬月」的「喜悦」未能生成/);
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
    assert.match(skipped.asks[0], /另有 2 个自建情绪组尚无图片：旧组乙、旧组丙/);
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

test('gate:status-avatar:generates-a-chibi-avatar-without-inferring-a-default-outfit', async () => {
    const { renderCharacterAssetList } = await import('../src/visual/igs-ui/settings-fields.js');
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
    assert.match(asks[1], /当前头像将被替换/);
    const html = renderCharacterAssetList({ 冬月: { 默认: 'igs-gen:def', 喜悦: '' } }, { isOpen: () => true, statusAvatars: draft.bridge.sceneAssets.statusAvatars });
    assert.ok(html.includes('data-action="status-avatar-generate:%E5%86%AC%E6%9C%88"'));
    assert.ok(html.includes('重画Q版'));
    assert.match(html, /data-action="char-generate-sprite:%E5%86%AC%E6%9C%88"[^>]*>生成立绘</);
    assert.ok(html.includes('尚未指定默认服装'));
    assert.equal(draft.bridge.sceneAssets.characterDefaultOutfits, undefined);
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
    assert.match(views[0], /「冬月」的「喜悦」未能生成/);
    assert.match(views[0], /出图超时（3 分钟）/);
    assert.match(views[0], /原有图片保持不变/);
    assert.equal(draft.bridge.sceneAssets.characters['冬月']['喜悦'], 'igs-gen:joy', 'old image is kept');

    const sprite = await handleSettingsAction('char-generate-sprite:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(sprite.ok, false);
    assert.match(views[1], /默认立绘未能生成：插件没有响应/);

    // 用户正在答别的对话框时不顶掉它，改走提示条（这里面板没开，退回 alert）。
    const alerts = [];
    ctx.options.global.alert = (message) => alerts.push(message);
    ctx.dialogs.isOpen = () => true;
    await handleSettingsAction('char-generate-sprite:%E5%86%AC%E6%9C%88', ctx);
    assert.equal(views.length, 2);
    assert.match(alerts[0], /插件没有响应/);
});

test('gate:character-sprite:one-click-user-protagonist-from-tavern-persona', async () => {
    const seen = [];
    const notes = [];
    const storage = new Map();
    const draft = { bridge: { sceneAssets: {} }, readerSettings: {} };
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: {
            global: {
                alert() {},
                localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, v) },
                SillyTavern: { getContext: () => ({ name1: '阿澈', powerUserSettings: { persona_description: '  银发蓝眼，\n二十岁，{{user}}是个怕生的大学生  ' } }) },
            },
            generatedAssets: {
                generateCharacterSprite: async (input) => { seen.push(input); return { ok: true, imageId: 'made-me' }; },
            },
        },
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        dialogs: {
            confirm: async () => true,
            edit: async (message, current) => { notes.push([message, current]); return current; },
        },
    };
    const result = await handleSettingsAction('scene-add-user-char', ctx);
    assert.equal(result.ok, true);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].name, '阿澈');
    assert.match(notes[0][1], /银发蓝眼/);
    assert.match(notes[0][1], /阿澈是个怕生的大学生/);
    assert.doesNotMatch(notes[0][1], /\{\{user\}\}/);
    assert.ok(draft.bridge.sceneAssets.characterDna['阿澈']);
    assert.equal(draft.bridge.sceneAssets.characters['阿澈']['默认'], 'igs-gen:made-me');
    assert.equal(draft.bridge.sceneAssets.characterSpriteNotes['阿澈'], notes[0][1]);
    const folders = JSON.parse(storage.get('igs-asset-folders-v1'));
    const scopeState = folders.scopes[''];
    assert.ok(scopeState.characters.folders.includes('主角'));
    assert.equal(scopeState.characters.assign['阿澈'], '主角');

    // 已经登记过的主角再点一次：不重复登记 DNA，沿用已有资料。
    draft.bridge.sceneAssets.characterDna['阿澈'] = { identity: '银发', defaultAppearance: '', negative: '', triggerWords: '' };
    const again = await handleSettingsAction('scene-add-user-char', ctx);
    assert.equal(again.ok, true);
    assert.equal(seen.length, 2);
    assert.equal(seen[1].dna.identity, '银发');

    // 酒馆没设用户名时停下，只提示不生成。
    const alerts = [];
    ctx.options.global.alert = (message) => alerts.push(message);
    ctx.options.global.SillyTavern = { getContext: () => ({ name1: '', powerUserSettings: {} }) };
    await handleSettingsAction('scene-add-user-char', ctx);
    assert.equal(seen.length, 2);
    assert.match(alerts[0], /没读到酒馆的用户名/);
});

test('gate:identity:default-sprite-adoption-rolls-back-on-save-failure', async () => {
    const assets = { characters: { Alice: { 默认: '' } }, characterSpriteNotes: { Alice: 'old note' },
        characterDna: {}, characterOutfits: {}, wardrobe: {} };
    const original = structuredClone(assets);
    const draft = { bridge: { sceneAssets: assets }, readerSettings: {} };
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: { global: { alert() {}, document: { getElementById() { return null; } } },
            generatedAssets: { async generateCharacterSprite() { return { ok: true, imageId: 'sprite-1',
                characterMeta: { version: 1, characters: [{ characterKey: 'Alice', identityAnchor: 'Silver hair.',
                    signatureDetails: 'A small mole.', outfit: { name: 'Coat', description: 'Blue coat.' } }] } }; } } },
        dialogs: { confirm: async () => true, edit: async () => 'new note' },
        persistSettingsDraft: () => ({ ok: false, reason: 'save-failed' }),
        rerenderSettings: () => ({ ok: true }),
    };
    const failed = await handleSettingsAction('char-generate-sprite:Alice', ctx);
    assert.equal(failed.ok, false);
    for (const key of Object.keys(original)) assert.deepEqual(assets[key], original[key], key);
    ctx.persistSettingsDraft = () => ({ ok: true });
    assert.equal((await handleSettingsAction('char-generate-sprite:Alice', ctx)).ok, true);
    assert.equal(assets.characterDna.Alice.identity, 'Silver hair. A small mole.');
    assets.characterDna.Alice.identity = '';
    assert.equal((await handleSettingsAction('char-generate-sprite:Alice', ctx)).ok, true);
    assert.equal(assets.characterDna.Alice.identity, '');
});

test('gate:dna-expression-ui:重画和续画保留模板绑定，手改只传定稿标记', async () => {
    const { characterViewsFixture, characterWriteFixture } = await import('./helpers/prompt-provenance.js');
    const { characterPromptTask } = await import('../src/generated-images/illustration/character-prompt-task.js');
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const { promptFromCaption } = await import('../src/generated-images/generation-prompt.js');
    const dna = { version: 2, views: characterViewsFixture() };
    const task = characterPromptTask([{ characterKey: '冬月', dna }], 'derived', 'half_body', [['冬月']]);
    const entry = characterWriteFixture(task).captions[0];
    const prepared = prepareCharacterCaption({ ...entry, ...task });
    assert.equal(prepared.ok, true, prepared.error);
    let saved = { ...promptFromCaption(prepared.caption), ...prepared, characterMeta: entry.characterMeta };
    const retries = [], resumes = [];
    const draft = { bridge: { sceneAssets: { characters: { 冬月: { 默认: 'igs-gen:def', 喜悦: 'igs-gen:joy' } },
        characterDna: { 冬月: dna }, generated: { expressionNotes: {} } } }, readerSettings: {} };
    const ctx = {
        state: { activeSettings: { draft, asyncState: {} } },
        options: { global: { alert() {} }, generatedAssets: {
            getImagePrompt: async () => saved,
            generateExpressionImage: async (input) => { retries.push(input); return { ok: true, items: [] }; },
            paintExpressionCaptions: async (input) => { resumes.push(input); return { ok: true, items: [] }; },
            generateExpressionSet: async () => { throw new Error('已有模板不得重写'); },
        } },
        persistSettingsDraft: () => ({ ok: true }), rerenderSettings: () => ({ ok: true }),
        dialogs: { confirm: async () => true },
    };
    assert.equal((await handleSettingsAction('char-expression-retry:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6', ctx)).ok, true);
    assert.deepEqual(retries[0].promptRecipe, saved.promptRecipe);
    assert.deepEqual(retries[0].characterMeta, saved.characterMeta);
    assert.equal(retries[0].exact, false);
    assert.deepEqual(retries[0].history, saved);
    const note = { ...entry, promptTask: task.promptTask, error: '已停止' };
    draft.bridge.sceneAssets.generated = { expressionNotes: { 冬月: { 愤怒: note } } };
    assert.equal((await handleSettingsAction('char-expression-resume:%E5%86%AC%E6%9C%88', ctx)).ok, true);
    assert.deepEqual(resumes[0].items[0].promptRecipe, note.promptRecipe);
    assert.deepEqual(resumes[0].items[0].characterMeta, note.characterMeta);
    assert.deepEqual(resumes[0].items[0].promptTask, task.promptTask);
    assert.equal(resumes[0].items[0].slotId, 1);
    saved = { ...saved, edited: true };
    assert.equal((await handleSettingsAction('char-expression-retry:%E5%86%AC%E6%9C%88:%E5%96%9C%E6%82%A6', ctx)).ok, true);
    assert.equal(retries[1].exact, true);
    assert.deepEqual(retries[1].history.promptRecipe, saved.promptRecipe);
});

test('gate:dna-adoption-ui:默认采用回读候选后保存 DNA，保存失败恢复', async () => {
    const { spriteAdoptionFixture } = await import('./helpers/prompt-provenance.js');
    const record = await spriteAdoptionFixture();
    for (const mode of ['success', 'save-failed', 'rollback-failed', 'missing', 'missing-candidate']) {
        const assets = { characters: { Alice: { 默认: 'old.png' } }, characterAliases: {},
            characterDna: {}, characterOutfits: {}, wardrobe: {}, characterSpriteNotes: { Alice: 'old' } };
        const original = structuredClone(assets), saves = [], events = [];
        const ctx = {
            state: { activeSettings: { draft: { bridge: { sceneAssets: assets }, readerSettings: {} }, asyncState: {} } },
            options: { global: { alert() {} }, generatedAssets: {
                async generateCharacterSprite() { events.push('generate'); assert.deepEqual(assets, original); return { ...record }; },
                async readStoredImage(id) {
                    events.push('read'); assert.equal(id, record.imageId); assert.deepEqual(assets, original);
                    if (mode === 'missing') return null;
                    const stored = structuredClone(record);
                    if (mode === 'missing-candidate') delete stored.dnaCandidates;
                    return stored;
                },
            } },
            dialogs: { confirm: async () => true, edit: async () => 'new', alert() {} },
            persistSettingsDraft() {
                events.push('save'); saves.push(structuredClone(assets));
                return mode === 'rollback-failed' || (mode === 'save-failed' && saves.length === 1)
                    ? { ok: false, reason: 'save-failed' } : { ok: true };
            },
            rerenderSettings: () => ({ ok: true }),
        };
        const result = await handleSettingsAction('char-generate-sprite:Alice', ctx);
        if (mode === 'success') {
            assert.equal(result.ok, true);
            assert.deepEqual(events, ['generate', 'read', 'save']);
            assert.deepEqual(saves[0].characterDna.Alice.views, record.dnaCandidates.characters[0].views);
            assert.equal(assets.characterDna.Alice.identitySource, record.imageId);
            assert.equal(assets.characters.Alice.默认, 'old.png');
            assert.equal(assets.characterDna.Alice.defaultAppearance || '', '');
            const clothing = record.outfitSnapshot.characters[0];
            assert.deepEqual(assets.characterDefaultOutfits.Alice, { version: 1, outfitName: clothing.name });
            const entry = assets.characterOutfits.Alice[clothing.name];
            assert.equal(entry.moods.平和, `igs-gen:${record.imageId}`);
            assert.equal(assets.wardrobe[entry.wardrobe].prompt, clothing.description);
        } else {
            assert.equal(result.ok, false, mode);
            assert.deepEqual(assets, original, mode);
            assert.equal(saves.length, mode.includes('failed') ? 2 : 0);
            if (saves.length) assert.deepEqual(saves[1], original);
            if (mode === 'rollback-failed') assert.equal(result.reason, 'generated-asset-accept-rollback-failed');
        }
    }
});

test('gate:dna-adoption-ui:迟到生成不能覆盖变化的 DNA、默认图或作用域', async () => {
    const { spriteAdoptionFixture } = await import('./helpers/prompt-provenance.js');
    for (const change of ['dna', 'image', 'scope']) {
        const record = await spriteAdoptionFixture();
        const assets = { characters: { Alice: { 默认: 'old.png' } }, characterDna: {},
            characterOutfits: {}, wardrobe: {}, characterAliases: {} };
        const state = { draft: { bridge: { sceneAssets: assets }, readerSettings: {} }, asyncState: {} };
        let expected, saves = 0;
        const result = await handleSettingsAction('char-generate-sprite:Alice', {
            state: { activeSettings: state },
            options: { global: { alert() {} }, generatedAssets: {
                async generateCharacterSprite() {
                    if (change === 'dna') assets.characterDna.Alice = { identity: '手工定稿', identityInitialized: true };
                    if (change === 'image') assets.characters.Alice.默认 = 'new.png';
                    if (change === 'scope') state.asyncState.assetScopeKey = 'card:other';
                    expected = structuredClone(assets);
                    return record;
                }, readStoredImage: async () => record,
            } },
            dialogs: { confirm: async () => true, edit: async () => '', alert() {} },
            persistSettingsDraft: () => { saves++; return { ok: true }; }, rerenderSettings: () => ({ ok: true }),
        });
        assert.equal(result.ok, false, change);
        assert.equal(saves, 0);
        // 作用域检查不能为了拒绝迟到结果而新建另一张卡的资料库。
        assert.deepEqual(assets, expected, change);
    }
});

test('gate:dna-adoption-ui:默认采用回读期间的身份变化同样拒绝', async () => {
    const { spriteAdoptionFixture } = await import('./helpers/prompt-provenance.js');
    const record = await spriteAdoptionFixture();
    const assets = { characters: { Alice: { 默认: 'old.png' } }, characterDna: {} };
    let saves = 0;
    const result = await handleSettingsAction('char-generate-sprite:Alice', {
        state: { activeSettings: { draft: { bridge: { sceneAssets: assets } }, asyncState: {} } },
        options: { global: { alert() {} }, generatedAssets: {
            generateCharacterSprite: async () => record,
            async readStoredImage() { assets.characterDna.Alice = { identity: '手工更新' }; return record; },
        } },
        dialogs: { confirm: async () => true, edit: async () => '', alert() {} },
        persistSettingsDraft: () => { saves++; return { ok: true }; }, rerenderSettings: () => ({ ok: true }),
    });
    assert.equal(result.ok, false);
    assert.equal(saves, 0);
    assert.equal(assets.characters.Alice.默认, 'old.png');
    assert.deepEqual(assets.characterDna.Alice, { identity: '手工更新' });
});

test('gate:image-prompt-ui:控制器新建保存激活与关闭草稿恢复，零 provider 调用', async () => {
    const { bootstrapIGS, createMemoryStorage, createPresetRegistry } = await import('../src/index.js');
    const storage = createMemoryStorage(), registry = createPresetRegistry({ storage });
    const answers = ['my-image-prompt', '我的框架'];
    let requests = 0;
    const vn = bootstrapIGS({
        global: { localStorage: storage, prompt: () => answers.shift(), confirm: () => true },
        presetRegistry: registry, autoAttachMagicWand: false,
        config: { imageApi: { mode: 'nai' } },
        secondaryLlm: { request: async () => { requests++; throw new Error('不得调用模型'); } },
        naiOfficialClient: { generate: async () => { requests++; throw new Error('不得生图'); } },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    const address = JSON.stringify(['prompts', 'igs-image-framework', 'content']);
    try {
        let controller = vn.openSettings({ tab: 'image' }).controller;
        controller.switchImageSubTab('llm');
        assert.match(controller.getSnapshot().html, /data-image-prompt-panel/);
        const original = registry.getCurrent('prompt-preset');
        assert.equal((await controller.invoke('image-prompt:new')).ok, true);
        assert.equal(registry.get('prompt-preset', 'my-image-prompt'), null);
        assert.equal(registry.getCurrent('prompt-preset').id, original.id);
        assert.equal(controller.setImagePromptField(address, '自定义共享正文').ok, true);
        assert.equal((await controller.invoke('image-prompt:save')).ok, true);
        assert.equal(registry.getPromptDraft('my-image-prompt'), null, '保存及清理草稿是一次提交');
        assert.equal((await controller.invoke('image-prompt:activate')).ok, true);
        assert.equal(registry.getCurrent('prompt-preset').id, 'my-image-prompt');
        controller.setImagePromptField(address, '未生效的编辑');
        assert.equal(controller.close().ok, true);
        controller = vn.openSettings({ tab: 'image' }).controller;
        assert.equal(controller.getSnapshot().imagePrompt.draftRevision, 1);
        assert.equal(registry.getCurrent('prompt-preset').data.prompts[0].content, '自定义共享正文');
        assert.equal((await controller.invoke('image-prompt:save')).ok, true);
        const reloaded = createPresetRegistry({ storage });
        assert.equal(reloaded.getCurrent('prompt-preset').data.prompts[0].content, '未生效的编辑');
        assert.equal(reloaded.getPromptDraft('my-image-prompt'), null);
        assert.equal(requests, 0);
    } finally { vn.destroy(); }
});

async function imagePromptUiFixture() {
    const { createMemoryStorage, createPresetRegistry } = await import('../src/index.js');
    const { createImagePromptEditor } = await import('../src/visual/igs-ui/settings-image-prompt-editor.js');
    const { handleImagePromptAction } = await import('../src/visual/igs-ui/settings-image-prompt-actions.js');
    const storage = createMemoryStorage(), registry = createPresetRegistry({ storage });
    const editor = createImagePromptEditor(registry);
    assert.equal(editor.initialize().ok, true);
    const ctx = { editor, dialogs: { confirm: async () => true }, isCurrent: () => true, global: {} };
    return { storage, registry, editor, ctx, invoke: action => handleImagePromptAction('image-prompt:' + action, ctx) };
}
const imagePromptAddress = (group, id, field) => JSON.stringify([group, id, field]);

test('gate:image-prompt-ui:角色排序启停与模块映射保存并激活', async () => {
    const { registry, editor, invoke } = await imagePromptUiFixture();
    assert.equal(editor.create('ordered-preset', '有序框架').ok, true);
    assert.equal(editor.blockAction('add', 'prompts', 'example').ok, true);
    editor.edit(imagePromptAddress('prompts', 'example', 'role'), 'assistant');
    editor.edit(imagePromptAddress('prompts', 'example', 'content'), '示例正文');
    assert.equal((await invoke('move:example:igs-image-protocol')).ok, true);
    assert.equal(editor.blockAction('order-enabled', 'prompts', 'igs-image-submit', false).ok, true);
    editor.edit(imagePromptAddress('prompts', 'igs-image-framework', 'enabled'), false);
    editor.edit(imagePromptAddress('modules', 'igs-task-sprite', 'content'), '自定义立绘任务');
    assert.equal(editor.save().ok, true);
    assert.equal((await invoke('activate')).ok, true);
    const saved = registry.getCurrent('prompt-preset');
    assert.equal(saved.id, 'ordered-preset');
    assert.equal(saved.data.prompts.find(b => b.identifier === 'example').role, 'assistant');
    assert.equal(saved.data.prompts.find(b => b.identifier === 'igs-image-framework').enabled, false);
    assert.equal(saved.data.prompt_order.find(b => b.identifier === 'igs-image-submit').enabled, false);
    assert.ok(saved.data.prompt_order.findIndex(b => b.identifier === 'example')
        < saved.data.prompt_order.findIndex(b => b.identifier === 'igs-image-protocol'));
});


test('gate:image-prompt-ui:导入预览保留旧格式，冲突默认跳过且明确覆盖才提交', async () => {
    const { registry, editor, invoke, ctx } = await imagePromptUiFixture();
    const current = registry.getCurrent('prompt-preset');
    const imported = structuredClone(current);
    imported.name = '导入版本';
    const old = { kind: 'imagegen', id: 'legacy-ui', name: '旧生图', prompts: [
        { identifier: 'legacy', role: 'assistant', content: '旧正文', enabled: true },
    ], prompt_order: [{ identifier: 'legacy', enabled: true }] };
    const raw = JSON.stringify({ items: [imported, old, { kind: 'recall', id: 'recall-ui' }] });
    ctx.readFile = async () => ({ ok: true, text: raw });
    const before = registry.snapshot();
    assert.equal((await invoke('import')).ok, true);
    assert.deepEqual(registry.snapshot(), before, '预览不写存储');
    assert.equal(editor.state.importChoices[current.id], 'skip');
    assert.equal(editor.state.importPreview.accepted.find(p => p.id === 'legacy-ui').activatable, false);
    assert.equal(editor.state.importPreview.skipped[0].reason, 'recall-not-executed');
    assert.equal((await invoke('import-commit')).ok, true);
    assert.deepEqual(registry.getCurrent('prompt-preset'), current);
    assert.deepEqual(registry.get('prompt-preset', old.id).data.compatibility.source, old);
    assert.equal(editor.select(old.id).ok, true);
    assert.equal((await invoke('activate')).reason, 'prompt-not-activatable');
    assert.equal(editor.previewImport(raw).ok, true);
    editor.state.importChoices[current.id] = 'replace';
    assert.equal((await invoke('import-commit')).ok, true);
    assert.equal(registry.getCurrent('prompt-preset').name, '导入版本');
    assert.equal(registry.getCurrent('prompt-preset').data.revision, current.data.revision+ 1);
    assert.equal(editor.previewImport('{"id":"a","id":"b"}').reason, 'duplicate-json-field');
    assert.equal(registry.getCurrent('prompt-preset').name, '导入版本');
});

test('gate:image-prompt-ui:写入失败保留磁盘与编辑，陈旧版本不能清理新草稿', async () => {
    const { storage, registry, editor } = await imagePromptUiFixture();
    const { createPresetRegistry } = await import('../src/index.js');
    const address = imagePromptAddress('prompts', 'igs-image-framework', 'content');
    editor.edit(address, '待保存正文');
    assert.equal(editor.saveDraft().ok, true);
    const disk = storage.dump(), memory = registry.snapshot();
    const write = storage.setItem.bind(storage);
    storage.setItem = () => { throw new Error('隔离写入失败'); };
    assert.equal(editor.save().reason, 'preset-store-write-failed');
    assert.deepEqual(storage.dump(), disk);
    assert.deepEqual(registry.snapshot(), memory);
    assert.equal(editor.state.preset.data.prompts[0].content, '待保存正文');
    assert.equal(editor.state.draftRevision, 1);
    storage.setItem = write;
    assert.equal(editor.save().ok, true);
    const stale = structuredClone(editor.state.preset);
    assert.equal(registry.savePromptDraft(stale.id, stale, { expectedRevision: editor.state.baseRevision }).ok, true);
    const before = registry.snapshot();
    assert.equal(editor.save().reason, 'preset-revision-conflict');
    assert.deepEqual(registry.snapshot(), before, '陈旧草稿 revision 不得清理新的草稿');
    assert.equal(editor.reload().ok, true);
    const external = createPresetRegistry({ storage });
    const next = external.getCurrent('prompt-preset');
    next.name = '另一编辑器保存';
    assert.equal(external.savePromptPreset(next, next.data.revision).ok, true);
    const externalDisk = storage.dump();
    editor.edit(address, '陈旧编辑');
    assert.equal(editor.save().reason, 'preset-revision-conflict');
    assert.deepEqual(storage.dump(), externalDisk);
    assert.equal(editor.state.preset.data.prompts[0].content, '陈旧编辑');
});

test('gate:image-prompt-ui:非法 JSON 草稿刷新保留原文且不可保存或激活', async () => {
    const { storage, registry, editor } = await imagePromptUiFixture();
    const { createPresetRegistry } = await import('../src/index.js');
    const { createImagePromptEditor } = await import('../src/visual/igs-ui/settings-image-prompt-editor.js');
    const address = imagePromptAddress('modules', 'igs-task-sprite', 'dataFields');
    const before = registry.getCurrent('prompt-preset');
    assert.equal(editor.edit(address, '[未完成').reason, 'invalid-json');
    assert.equal(editor.saveDraft().ok, true);
    const recovered = createImagePromptEditor(createPresetRegistry({ storage }));
    assert.equal(recovered.initialize().ok, true);
    assert.equal(recovered.state.rawFields[address], '[未完成');
    assert.equal(recovered.save().reason, 'invalid-prompt-fields');
    assert.equal(recovered.activate().reason, 'prompt-save-before-activate');
    assert.deepEqual(registry.getCurrent('prompt-preset'), before);
    recovered.edit(address, '["description","outputs"]');
    assert.equal(recovered.save().ok, true);
});


test('gate:image-prompt-ui:确认期间编辑或切换面板阻止迟到提交', async () => {
    for (const mode of ['edit', 'panel', 'choices']) {
        const { registry, editor, invoke, ctx } = await imagePromptUiFixture();
        assert.equal(editor.create('late-preset', '迟到候选').ok, true);
        assert.equal(editor.save().ok, true);
        const before = registry.snapshot();
        let answer;
        let panelCurrent = true;
        ctx.isCurrent = () => panelCurrent;
        ctx.dialogs.confirm = () => new Promise(resolve => { answer = resolve; });
        if (mode === 'choices') {
            assert.equal(editor.previewImport(JSON.stringify(editor.state.preset)).ok, true);
        }
        const pending = invoke(mode === 'choices' ? 'import-commit' : 'activate');
        assert.equal(typeof answer, 'function');
        if (mode === 'edit') editor.edit(imagePromptAddress('preset', '', 'name'), '新编辑');
        if (mode === 'panel') panelCurrent = false;
        if (mode === 'choices') editor.state.importChoices['late-preset'] = 'replace';
        answer(true);
        assert.equal((await pending).reason, 'prompt-editor-stale', mode);
        assert.deepEqual(registry.snapshot(), before, mode);
    }
});

test('gate:image-prompt-ui:关闭时草稿失败保留面板且配置保存与导出不触发 provider', async () => {
    const { bootstrapIGS, createMemoryStorage, createPresetRegistry, PRESET_STORE_KEY } = await import('../src/index.js');
    const storage = createMemoryStorage(), registry = createPresetRegistry({ storage });
    const write = storage.setItem.bind(storage);
    let calls = 0;
    const vn = bootstrapIGS({ global: { localStorage: storage }, presetRegistry: registry,
        config: { imageApi: { mode: 'nai' } },
        autoAttachMagicWand: false, secondaryLlm: { request: async () => { calls++; } },
        naiOfficialClient: { generate: async () => { calls++; } },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'image' }).controller;
        controller.switchImageSubTab('llm');
        controller.setImagePromptField(imagePromptAddress('prompts', 'igs-image-framework', 'content'), '未存档正文');
        const oldDisk = storage.getItem(PRESET_STORE_KEY), oldCurrent = registry.getCurrent('prompt-preset');
        storage.setItem = (key, value) => { if (key === PRESET_STORE_KEY) throw new Error('写入失败'); write(key, value); };
        assert.equal(controller.close().reason, 'preset-store-write-failed');
        assert.equal(controller.getSnapshot().imagePrompt.dirty, true);
        assert.equal(storage.getItem(PRESET_STORE_KEY), oldDisk);
        assert.deepEqual(registry.getCurrent('prompt-preset'), oldCurrent);
        storage.setItem = write;
        controller.setValue('bridge.autoIllustration.llm.source', 'openai');
        controller.setValue('bridge.autoIllustration.llm.apiKey', 'FAKE_LLM_SECRET');
        controller.setValue('bridge.autoIllustration.nai.apiKey', 'FAKE_NAI_SECRET');
        controller.setValue('bridge.autoIllustration.nai.artistPrefix', 'artist:manual');
        assert.equal(controller.close().ok, true);
        const config = vn.getUnifiedSettings({ mode: 'pc' }).bridge.autoIllustration;
        assert.equal(config.llm.apiKey, 'FAKE_LLM_SECRET');
        assert.equal(config.nai.apiKey, 'FAKE_NAI_SECRET');
        assert.equal(config.nai.artistPrefix, 'artist:manual');
        const exported = JSON.stringify(registry.exportPreset('prompt-preset', oldCurrent.id));
        assert.doesNotMatch(exported, /FAKE_LLM_SECRET|FAKE_NAI_SECRET|artist:manual/);
        assert.equal(calls, 0);
    } finally { storage.setItem = write; vn.destroy(); }
});

test('gate:image-prompt-ui:复制删除默认恢复及槽映射均使用保存版本门禁', async () => {
    const { registry, editor, invoke, ctx } = await imagePromptUiFixture();
    const original = registry.getCurrent('prompt-preset');
    const answers = ['copied-ui', '复制框架'];
    ctx.dialogs.prompt = async () => answers.shift();
    assert.equal((await invoke('copy')).ok, true);
    assert.equal(editor.state.preset.id, 'copied-ui');
    assert.equal(editor.state.preset.data.defaultState, undefined);
    assert.equal((await invoke('save')).ok, true);
    assert.equal((await invoke('delete')).ok, true);
    assert.equal(registry.get('prompt-preset', 'copied-ui'), null);
    assert.equal(registry.getPromptDraft('copied-ui'), null);
    assert.equal(editor.select(original.id).ok, true);
    assert.equal((await invoke('delete')).reason, 'prompt-current-delete-blocked');
    const address = imagePromptAddress('prompts', 'igs-image-framework', 'content');
    editor.edit(address, '自定义正文');
    assert.equal(editor.save().ok, true);
    assert.equal((await invoke('restore:prompts:igs-image-framework:baseline')).ok, true);
    assert.equal(registry.getCurrent('prompt-preset').data.prompts[0].content, original.data.prompts[0].content);
    const revision = editor.state.baseRevision;
    assert.equal((await invoke('restore:prompts:igs-image-framework:' + (revision - 1))).ok, true);
    assert.equal(registry.getCurrent('prompt-preset').data.prompts[0].content, '自定义正文');
    assert.equal(editor.create('mapped-ui', '槽映射').ok, true);
    assert.equal(editor.blockAction('add', 'prompts', 'task-slot-new').ok, true);
    editor.edit(imagePromptAddress('prompts', 'task-slot-new', 'kind'), 'task-slot');
    editor.edit(imagePromptAddress('prompts', 'igs-image-task', 'enabled'), false);
    assert.equal(editor.blockAction('move', 'prompts', 'task-slot-new', 'igs-image-data').ok, true);
    assert.equal(editor.blockAction('add', 'modules', 'sprite-new').ok, true);
    editor.edit(imagePromptAddress('modules', 'sprite-new', 'content'), '新立绘任务');
    editor.edit(imagePromptAddress('taskMap', '', 'sprite'), 'sprite-new');
    assert.equal(editor.save().ok, true);
    assert.equal(editor.activate().ok, true);
    const rendered = editor.preview();
    assert.equal(rendered.ok, true);
    assert.equal(rendered.blocks.find(b => b.identifier === 'task-slot-new').content, '新立绘任务');
    assert.equal(registry.getCurrent('prompt-preset').id, 'mapped-ui');
});

const libraryRow = { id: 'ui-ink', name: '墨色画师', positivePrompt: 'artist:ui_ink', negativePrompt: 'ui-lowres' };
const libraryNai = controller => controller.getSnapshot().draft.bridge.autoIllustration.nai;
async function libraryUi(storage, answers = []) {
    const { bootstrapIGS, createMemoryStorage } = await import('../src/index.js');
    storage ||= createMemoryStorage();
    let requests = 0;
    const vn = bootstrapIGS({ global: { localStorage: storage, prompt: () => answers.shift(), confirm: () => true },
        autoAttachMagicWand: false, secondaryLlm: { request: async () => { requests++; assert.fail('管理不应写词'); } },
        naiOfficialClient: { generate: async () => { requests++; assert.fail('管理不应绘图'); } },
        config: storage.getItem('igs_bridge_config') ? {} : { imageApi: { mode: 'nai' } },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    return { vn, storage, requests: () => requests, controller: vn.openSettings({ tab: 'image' }).controller };
}

test('gate:artist-library-ui:入口导入应用保存刷新回读走真实存储链', async () => {
    const f = await libraryUi(null, [JSON.stringify([libraryRow])]);
    try {
        const c = f.controller;
        c.switchImageSubTab('source');
        assert.match(c.getSnapshot().html, /data-setting-go="image-prompt-presets"/);
        assert.match(c.getSnapshot().html, /data-artist-library-panel/);
        assert.doesNotMatch(c.getSnapshot().html, /data-image-prompt-panel/);
        assert.equal(c.goToSetting('image-prompt-presets').ok, true);
        assert.equal(c.getSnapshot().imageSubTab, 'llm');
        assert.match(c.getSnapshot().html, /data-image-prompt-panel/);
        c.goToSetting('artist-library');
        c.setValue('bridge.autoIllustration.nai.artistPrefix', 'old-artist');
        assert.equal((await c.invoke('artist-library:import-text')).ok, true);
        assert.equal(libraryNai(c).artistPrefix, 'old-artist', '导入不自动应用');
        assert.equal(c.setArtistLibraryField('id', libraryRow.id).ok, true);
        c.setArtistLibraryField('target', 'global');
        assert.equal((await c.invoke('artist-library:apply')).ok, true);
        assert.equal((await c.invoke('artist-library:save')).ok, true);
        const saved = JSON.parse(f.storage.getItem('igs_bridge_config')).autoIllustration.nai;
        assert.deepEqual(saved.artistLibrary.entries, [libraryRow]);
        assert.equal(saved.artistPrefix, libraryRow.positivePrompt);
        assert.equal(saved.artistNegativePrefix, libraryRow.negativePrompt);
        c.setArtistLibraryField('target', 'sprite');
        assert.equal((await c.invoke('artist-library:apply')).ok, true);
        assert.equal(libraryNai(c).artistByKind.enabled, false);
        assert.match(c.getSnapshot().html, /分区开关当前关闭/);
        c.setValue('bridge.autoIllustration.nai.artistByKind.enabled', true);
        assert.equal(c.close().ok, true);
        assert.equal(f.requests(), 0);
    } finally { f.vn.destroy(); }
    const reopened = await libraryUi(f.storage);
    try {
        const nai = libraryNai(reopened.controller);
        assert.deepEqual(nai.artistLibrary.entries, [libraryRow]);
        assert.equal(nai.artistPrefix, libraryRow.positivePrompt);
        assert.equal(nai.artistNegativePrefix, libraryRow.negativePrompt);
        assert.equal(nai.artistByKind.enabled, true);
        assert.deepEqual(nai.artistByKind.kinds.sprite, { positive: libraryRow.positivePrompt, negative: libraryRow.negativePrompt });
        assert.equal(reopened.requests(), 0);
    } finally { reopened.vn.destroy(); }
});


test('gate:artist-library-ui:坏导入与保存失败不污染正式配置且可重试', async () => {
    const answers = [JSON.stringify([libraryRow]), '{', JSON.stringify([libraryRow])];
    const f = await libraryUi(null, answers);
    const write = f.storage.setItem.bind(f.storage);
    try {
        const c = f.controller;
        assert.equal((await c.invoke('artist-library:import-text')).ok, true);
        assert.equal((await c.invoke('artist-library:save')).ok, true);
        const stored = f.storage.getItem('igs_bridge_config');
        const original = f.vn.getUnifiedSettings().bridge.autoIllustration.nai;
        for (let i = 0; i < 2; i++) {
            assert.equal((await c.invoke('artist-library:import-text')).ok, false);
            assert.equal(f.storage.getItem('igs_bridge_config'), stored);
            assert.deepEqual(libraryNai(c).artistLibrary.entries, [libraryRow]);
        }
        c.setArtistLibraryField('id', libraryRow.id);
        assert.equal((await c.invoke('artist-library:apply')).ok, true);
        f.storage.setItem = () => { throw new Error('fixture-storage-full'); };
        const failed = await c.invoke('artist-library:save');
        assert.equal(failed.ok, false);
        assert.equal(failed.reason, 'save-failed');
        assert.equal(f.storage.getItem('igs_bridge_config'), stored);
        assert.deepEqual(f.vn.getUnifiedSettings().bridge.autoIllustration.nai, original);
        assert.equal(libraryNai(c).artistPrefix, libraryRow.positivePrompt, '失败保留草稿供重试');
        f.storage.setItem = write;
        assert.equal((await c.invoke('artist-library:save')).ok, true);
        assert.equal(c.close().ok, true);
        assert.equal(f.requests(), 0);
    } finally { f.storage.setItem = write; f.vn.destroy(); }
});

test('gate:artist-library-ui:文件读取取消失败与迟到确认不改草稿', async () => {
    const { handleArtistLibraryAction } = await import('../src/visual/igs-ui/settings-artist-library.js');
    const panel = { draft: { bridge: { autoIllustration: { nai: { artistPrefix: 'old' } } } }, asyncState: {} };
    let current = true;
    const ctx = { panel, dialogs: { confirm: async () => true }, isCurrent: () => current, global: {} };
    const before = structuredClone(panel.draft);
    for (const file of [{ ok: true, cancelled: true }, { ok: false, reason: 'fixture-read-failed' }]) {
        const result = await handleArtistLibraryAction('artist-library:import', { ...ctx, readFile: async () => file });
        assert.equal(result.ok, file.ok);
        assert.deepEqual(panel.draft, before);
    }
    let release;
    const pending = handleArtistLibraryAction('artist-library:import', { ...ctx, readFile: () => new Promise(resolve => { release = resolve; }) });
    current = false;
    release({ ok: true, text: JSON.stringify([libraryRow]) });
    assert.equal((await pending).ok, false);
    assert.deepEqual(panel.draft, before);
    current = true;
    ctx.readFile = async () => ({ ok: true, text: JSON.stringify([libraryRow]) });
    ctx.dialogs.confirm = async () => { panel.draft.bridge.autoIllustration.nai.artistPrefix = 'newer'; return true; };
    assert.equal((await handleArtistLibraryAction('artist-library:import', ctx)).ok, false);
    assert.equal(panel.draft.bridge.autoIllustration.nai.artistPrefix, 'newer');
    assert.equal(panel.draft.bridge.autoIllustration.nai.artistLibrary, undefined);
});

test('gate:artist-library-ui:库内增改删与分类选用保存重开', async () => {
    const answers = ['新画师', 'artist:new', 'new-uc', '改名画师', 'artist:edited', 'edited-uc'];
    const f = await libraryUi(null, answers);
    try {
        const c = f.controller;
        assert.equal((await c.invoke('artist-library:create')).ok, true);
        const id = libraryNai(c).artistLibrary.entries[0].id;
        assert.equal(libraryNai(c).artistPrefix, '', '新建不自动应用');
        assert.equal((await c.invoke('artist-library:edit')).ok, true);
        assert.deepEqual(libraryNai(c).artistLibrary.entries, [{ id, name: '改名画师', positivePrompt: 'artist:edited', negativePrompt: 'edited-uc' }]);
        c.switchImageSubTab('auto');
        assert.match(c.getSnapshot().html, /data-action="artist-library:target:sprite"/);
        assert.doesNotMatch(c.getSnapshot().html, /data-path="bridge\.autoIllustration\.nai\.artistByKind\.kinds\./);
        await c.invoke('artist-library:target:sprite');
        assert.equal(c.getSnapshot().imageSubTab, 'source');
        assert.match(c.getSnapshot().html, /value="sprite" selected/);
        assert.doesNotMatch(c.getSnapshot().html, /data-path="bridge\.autoIllustration\.nai\.(?:negativePrompt|artistPrefix|artistNegativePrefix)"/);
        assert.equal((await c.invoke('artist-library:apply')).ok, true);
        assert.equal(libraryNai(c).artistByKind.enabled, false);
        c.setValue('bridge.autoIllustration.nai.artistByKind.enabled', true);
        assert.equal((await c.invoke('artist-library:save')).ok, true);
        assert.equal((await c.invoke('artist-library:delete')).ok, true);
        assert.deepEqual(libraryNai(c).artistLibrary.entries, []);
        assert.deepEqual(libraryNai(c).artistByKind.kinds.sprite, { positive: 'artist:edited', negative: 'edited-uc' });
        assert.equal((await c.invoke('artist-library:save')).ok, true);
        assert.equal(c.close().ok, true);
        assert.equal(f.requests(), 0);
    } finally { f.vn.destroy(); }
    const reopened = await libraryUi(f.storage);
    try {
        assert.deepEqual(libraryNai(reopened.controller).artistLibrary.entries, [], '已删除条目不因存量归档而复活');
        assert.equal(libraryNai(reopened.controller).artistByKind.enabled, true);
        assert.deepEqual(libraryNai(reopened.controller).artistByKind.kinds.sprite, { positive: 'artist:edited', negative: 'edited-uc' });
        assert.equal(reopened.requests(), 0);
    } finally { reopened.vn.destroy(); }
});

test('gate:artist-library-ui:存量归档仅保存后持久化且重开不重复', async () => {
    const { createMemoryStorage } = await import('../src/index.js');
    const storage = createMemoryStorage();
    const legacy = { artistPrefix: ' old artist\n', artistNegativePrefix: ' old uc ', negativePrompt: ' legacy uc\n',
        artistByKind: { enabled: false, kinds: { sprite: { positive: 'sprite artist', negative: 'sprite uc' } } } };
    storage.setItem('igs_bridge_config', JSON.stringify({ imageApi: { mode: 'nai' }, autoIllustration: { nai: legacy } }));
    const original = storage.getItem('igs_bridge_config');
    const f = await libraryUi(storage);
    try {
        const c = f.controller, nai = libraryNai(c);
        assert.equal(storage.getItem('igs_bridge_config'), original, '打开只归档到草稿');
        assert.deepEqual(nai.artistLibrary.entries.map(row => [row.positivePrompt, row.negativePrompt]),
            [[legacy.artistPrefix, legacy.artistNegativePrefix], ['sprite artist', 'sprite uc'], ['', legacy.negativePrompt]]);
        assert.equal(nai.artistPrefix, legacy.artistPrefix);
        const write = storage.setItem.bind(storage);
        storage.setItem = () => { throw new Error('fixture-storage-full'); };
        try {
            assert.equal((await c.invoke('artist-library:save')).ok, false);
            assert.equal(storage.getItem('igs_bridge_config'), original);
            assert.equal(libraryNai(c).artistLibrary.entries.length, 3);
        } finally { storage.setItem = write; }
        assert.equal((await c.invoke('artist-library:save')).ok, true);
        assert.equal(JSON.parse(storage.getItem('igs_bridge_config')).autoIllustration.nai.artistLibraryArchived, true);
        c.close();
    } finally { f.vn.destroy(); }
    const reopened = await libraryUi(storage);
    try {
        assert.equal(libraryNai(reopened.controller).artistLibrary.entries.length, 3);
        assert.equal(libraryNai(reopened.controller).negativePrompt, legacy.negativePrompt);
        assert.equal(reopened.requests(), 0);
    } finally { reopened.vn.destroy(); }
});




test('gate:nai-settings:四来源可见性、管理权限与保存重开', async () => {
    const f = await libraryUi();
    const c = f.controller;
    const shown = (html, marker) => {
        const tag = html.match(new RegExp('<[^>]*' + marker + '[^>]*>'));
        assert.ok(tag, marker);
        return !/\shidden(?:\s|>)/.test(tag[0]);
    };
    try {
        assert.equal(c.getSnapshot().draft.bridge.imageApi.naiSpriteTransparent, true);
        c.setValue('bridge.imageApi.naiSpriteTransparent', false);
        c.setValue('bridge.imageApi.dbgenSpriteTransparent', true);
        c.setValue('bridge.autoIllustration.consistencyStrength', 0.4);
        c.setValue('bridge.autoIllustration.consistencyModel', 'nai-diffusion-4-5-full-inpainting');
        for (const mode of ['nai', 'dbgen', 'extension', 'baibai', 'nai']) {
            c.setValue('bridge.imageApi.mode', mode);
            c.switchImageSubTab('source');
            const html = c.getSnapshot().html, builtin = mode === 'nai';
            assert.equal(shown(html, 'data-image-source="nai"'), builtin, mode);
            assert.equal(shown(html, 'data-image-source="dbgen"'), mode === 'dbgen', mode);
            assert.equal(shown(html, 'data-image-feature="nai-transparency"'), builtin, mode);
            assert.equal(shown(html, 'data-image-feature="consistency"'), builtin || mode === 'dbgen', mode);
            assert.equal(shown(html, 'data-image-prompt-entry'), builtin, mode);
            assert.equal(html.includes('data-artist-library-panel'), builtin, mode);
            c.switchImageSubTab('llm');
            assert.equal(c.getSnapshot().html.includes('data-image-prompt-panel'), builtin, mode);
            if (!builtin) {
                assert.equal(c.goToSetting('artist-library').ok, false);
                assert.equal(c.goToSetting('image-prompt-presets').ok, false);
                assert.equal(c.setArtistLibraryField('target', 'global').ok, false);
                assert.equal(c.setImagePromptField('["prompts","igs-image-framework","content"]', '禁止修改').ok, false);
                assert.equal((await c.invoke('artist-library:save')).ok, false);
                assert.equal((await c.invoke('image-prompt:save')).ok, false);
            }
        }
        assert.equal(c.close().ok, true);
        assert.equal(f.requests(), 0);
    } finally { f.vn.destroy(); }
    const reopened = await libraryUi(f.storage);
    try {
        const bridge = reopened.controller.getSnapshot().draft.bridge;
        assert.equal(bridge.imageApi.naiSpriteTransparent, false);
        assert.equal(bridge.imageApi.dbgenSpriteTransparent, true);
        assert.equal(bridge.autoIllustration.consistencyStrength, 0.4);
        assert.equal(bridge.autoIllustration.consistencyModel, 'nai-diffusion-4-5-full-inpainting');
    } finally { reopened.vn.destroy(); }
});


test('gate:image-prompt-ui:分格式规则保存回读与非法草稿隔离', async () => {
    const { registry, editor, storage } = await imagePromptUiFixture();
    const { createPresetRegistry } = await import('../src/index.js');
    const { createImagePromptEditor } = await import('../src/visual/igs-ui/settings-image-prompt-editor.js');
    const address = imagePromptAddress('modules', 'igs-task-cg', 'contentByFormat');
    const formats = { 'dna-template': '合成模板规则', 'cg-plan': '合成规划规则' };
    assert.equal(editor.edit(address, JSON.stringify(formats)).ok, true);
    assert.equal(editor.save().ok, true);
    const reopenedRegistry = createPresetRegistry({ storage });
    assert.deepEqual(reopenedRegistry.getCurrent('prompt-preset').data.modules.find(m => m.task === 'cg').contentByFormat, formats);
    assert.equal(editor.edit(address, '{未完成').reason, 'invalid-json');
    assert.equal(editor.saveDraft().ok, true);
    const recovered = createImagePromptEditor(createPresetRegistry({ storage }));
    assert.equal(recovered.initialize().ok, true);
    assert.equal(recovered.state.rawFields[address], '{未完成');
    assert.equal(recovered.save().reason, 'invalid-prompt-fields');
    assert.deepEqual(registry.getCurrent('prompt-preset').data.modules.find(m => m.task === 'cg').contentByFormat, formats);
    assert.equal(recovered.edit(address, '').ok, true);
    assert.equal(recovered.save().ok, true);
    assert.equal(Object.hasOwn(recovered.state.preset.data.modules.find(m => m.task === 'cg'), 'contentByFormat'), false);
    assert.equal(recovered.restore('modules', 'igs-task-cg').ok, true);
    assert.deepEqual(recovered.state.preset.data.modules.find(m => m.task === 'cg').contentByFormat,
        recovered.state.preset.data.defaultState.baseline.modules.find(m => m.task === 'cg').contentByFormat);
});
