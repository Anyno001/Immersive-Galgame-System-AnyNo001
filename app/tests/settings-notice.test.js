import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_NOTICE_STYLE_TEXT, beginSettingsProgress, describeSettingsFailure, isQuotaError, markSettingsButtonBusy, remountSettingsNotice, remountSettingsProgress, settingsBusyLabel, showSettingsProgress } from '../src/visual/igs-ui/settings-notice.js';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { saveScenePresets } from '../src/scene/scene-preset-store.js';
import { clearMoodReview, removeMoodReview, recordMoodReview } from '../src/scene/mood-review-store.js';
import { clearOutfitReview, removeOutfitReview } from '../src/scene/outfit-review-store.js';

const quotaError = () => Object.assign(new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'k' exceeded the quota."), { name: 'QuotaExceededError' });

function fullStorage(seed = {}) {
    const data = new Map(Object.entries(seed));
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem() { throw quotaError(); } };
}

test('gate:settings-notice:only-real-save-failures-and-throws-are-reported', () => {
    assert.equal(describeSettingsFailure({ ok: true }), '');
    assert.equal(describeSettingsFailure({ ok: false, reason: 'already-first' }), '', 'ordinary refusals stay quiet');
    assert.equal(describeSettingsFailure({ ok: false, reason: 'settings-not-open' }), '');
    assert.match(describeSettingsFailure({ ok: false, reason: 'save-failed', saveError: quotaError() }), /^保存失败：浏览器本地存储已满/);
    assert.match(describeSettingsFailure({ ok: false, reason: 'save-failed', saveError: 'The quota has been exceeded.' }), /本地存储已满/);
    assert.equal(describeSettingsFailure({ ok: false, reason: 'save-failed', saveError: 'disk busy' }), '保存失败：disk busy');
    const partial = describeSettingsFailure({ ok: false, reason: 'save-failed', saveError: 'disk busy', rollbackFailed: true });
    assert.match(partial, /部分设置可能已写入.*检查后重试/);
    assert.equal(describeSettingsFailure({ ok: false, reason: 'save-failed' }), '保存失败：save-failed');
    assert.equal(describeSettingsFailure({ ok: false, reason: 'action-threw', thrown: new TypeError('x is undefined') }), '操作失败：x is undefined');
    assert.equal(isQuotaError({ code: 22 }), true);
    assert.equal(isQuotaError(new Error('network')), false);
});

test('gate:settings-notice:stores-return-write-errors-instead-of-swallowing', () => {
    const presets = saveScenePresets(fullStorage(), { a: {} });
    assert.equal(presets.ok, false);
    assert.equal(presets.reason, 'store-write-failed');
    assert.ok(isQuotaError(presets.saveError));
    assert.match(describeSettingsFailure(presets), /^保存失败：浏览器本地存储已满/);
    const seeded = fullStorage({ 'igs:mood-review:v1': JSON.stringify({ items: [{ word: '恍惚' }] }), 'igs:outfit-review:v1': JSON.stringify({ items: [{ character: 'A', word: '泳装' }] }) });
    assert.equal(removeMoodReview(seeded, '恍惚').ok, false);
    assert.equal(clearMoodReview(seeded).ok, false);
    assert.equal(removeOutfitReview(seeded, 'A', '泳装').ok, false);
    assert.equal(clearOutfitReview(seeded).ok, false);
    assert.equal(removeMoodReview(seeded, '不存在').ok, true, 'nothing to remove is not a failure');
    assert.doesNotThrow(() => recordMoodReview(seeded, { word: '新词' }), 'render-time recording stays quiet');
    const store = new Map();
    const ok = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    assert.deepEqual(saveScenePresets(ok, { a: {} }), { ok: true });
});

test('gate:settings-notice:notice-survives-panel-rerender-and-expires', () => {
    const doc = { createElement: () => makeNode() };
    function makeNode() {
        const attrs = {};
        return { children: [], parentNode: null, className: '', textContent: '', ownerDocument: doc,
            setAttribute(k, v) { attrs[k] = v; }, getAttribute: (k) => attrs[k],
            appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
            removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
            querySelector(sel) { return sel === '.igs-settings-notice' ? this.children.find((c) => c.className === 'igs-settings-notice') || null : null; } };
    }
    const container = makeNode();
    const notice = { message: '保存失败：x', until: 1000 };
    const el = remountSettingsNotice(container, notice, 0);
    assert.equal(el.textContent, '保存失败：x');
    assert.equal(el.getAttribute('role'), 'alert');
    assert.equal(remountSettingsNotice(container, notice, 10), el, 'reuses the node instead of stacking');
    assert.equal(container.children.length, 1);
    container.children.length = 0;
    assert.ok(remountSettingsNotice(container, notice, 10), 'rerender wipes the panel, notice is put back');
    assert.equal(remountSettingsNotice(container, notice, 1000), null);
    assert.equal(container.children.length, 0);
});

test('gate:settings-notice:slow-actions-show-busy-state-and-restore', () => {
    assert.equal(settingsBusyLabel('test-image'), '测试中…');
    assert.equal(settingsBusyLabel('fetch-llm-models'), '拉取中…');
    assert.equal(settingsBusyLabel('scene-add-bg'), '');
    assert.equal(settingsBusyLabel('outfit-expression-set:%E5%86%AC%E6%9C%88:%E6%97%A5%E5%B8%B8'), '');
    assert.equal(settingsBusyLabel('char-expression-retry:%E5%86%AC%E6%9C%88:%E6%84%A4%E6%80%92'), '生图中');
    assert.equal(settingsBusyLabel('char-generate-sprite:%E5%86%AC%E6%9C%88'), '生图中');
    assert.equal(settingsBusyLabel('outfit-generate-nude:%E5%86%AC%E6%9C%88:%E6%97%A5%E5%B8%B8'), '生图中');
    const attrs = new Map();
    const button = { textContent: '测试生图', disabled: false, isConnected: true, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) };
    const restore = markSettingsButtonBusy(button, '测试中…');
    assert.equal(button.textContent, '测试中…');
    assert.equal(button.disabled, true);
    assert.equal(attrs.get('aria-busy'), 'true');
    restore();
    assert.equal(button.textContent, '测试生图');
    assert.equal(button.disabled, false);
    assert.ok(!attrs.has('aria-busy'));
    const gone = { ...button, isConnected: false, textContent: 'x', setAttribute() {}, removeAttribute() {} };
    const restoreGone = markSettingsButtonBusy(gone, '拉取中…');
    gone.isConnected = false;
    restoreGone();
    assert.equal(gone.textContent, '拉取中…', 'a button replaced by a rerender is left alone');
});

test('gate:settings-notice:expression-progress-shows-write-then-each-image', () => {
    const doc = {};
    function matches(node, sel) {
        if (sel.startsWith('.')) return String(node.className || '').split(/\s+/).includes(sel.slice(1));
        if (sel.startsWith('#') ) return node.id === sel.slice(1);
        const attr = /^\[([^=]+)="([^"]+)"\]$/.exec(sel);
        return Boolean(attr) && node.getAttribute(attr[1]) === attr[2];
    }
    function find(node, sel) {
        for (const child of node.children || []) {
            if (matches(child, sel)) return child;
            const nested = find(child, sel);
            if (nested) return nested;
        }
        return null;
    }
    function makeNode() {
        const attrs = {};
        return {
            id: '', children: [], parentNode: null, className: '', textContent: '', style: {}, ownerDocument: doc,
            setAttribute(k, v) { attrs[k] = v; }, getAttribute: (k) => attrs[k],
            appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
            removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; },
            querySelector(sel) { return find(this, sel); },
        };
    }
    doc.createElement = () => makeNode();
    const host = makeNode();
    host.id = 'igs-unified-settings';
    const shell = makeNode();
    shell.className = 'igs-settings-shell';
    const button = makeNode();
    button.textContent = '表情差分';
    button.setAttribute('aria-busy', 'true');
    shell.appendChild(button);
    host.appendChild(shell);
    const writing = showSettingsProgress(host, { text: '正在写 8 份提示词…', indeterminate: true, ratio: 0, button: '写词…' });
    assert.equal(button.textContent, '写词…');
    assert.match(writing.className, /is-writing/);
    assert.equal(writing.querySelector('.igs-settings-progress-text').textContent, '正在写 8 份提示词…');
    assert.equal(writing.querySelector('.igs-settings-progress-fill').getAttribute('data-ratio'), '0');
    const painting = showSettingsProgress(host, { text: '正在画第 2/8 张：愤怒', ratio: 2 / 8, button: '2/8' });
    assert.equal(painting, writing, 'updates the same bar');
    assert.equal(painting.parentNode, shell, 'bar stays inside the settings panel');
    assert.equal(host.children.filter((child) => String(child.className).includes('igs-settings-progress')).length, 0);
    assert.equal(painting.className.includes('is-writing'), false);
    assert.equal(painting.querySelector('.igs-settings-progress-fill').style.width, '25%');
    assert.equal(button.textContent, '2/8');
    assert.equal(showSettingsProgress(host, null), null);
    assert.equal(host.querySelector('.igs-settings-progress'), null);
    assert.match(SETTINGS_NOTICE_STYLE_TEXT, /igs-settings-progress\{[^}]*background:var\(--igs-settings-raised\)/);
    assert.match(SETTINGS_NOTICE_STYLE_TEXT, /color:var\(--igs-settings-ink\)/);
    assert.equal(SETTINGS_NOTICE_STYLE_TEXT.includes('#2f5f78'), false);
});

test('gate:settings-notice:full-storage-keeps-panel-open-with-readable-reason', () => {
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    try {
        const controller = vn.openSettings({ tab: 'basic', mode: 'pc' }).controller;
        controller.toggle('bridge.showToasts');
        storage.setItem = () => { throw quotaError(); };
        const closed = controller.close();
        assert.equal(closed.ok, false);
        assert.equal(closed.reason, 'save-failed');
        assert.match(describeSettingsFailure(closed), /^保存失败：浏览器本地存储已满/);
        assert.ok(controller.getSnapshot(), 'panel stays open so the edit is not lost');
    } finally {
        vn.destroy();
    }
});

test('gate:settings-notice:failed-compensation-keeps-draft-open-and-warns-about-partial-write', () => {
    const storage = createMemoryStorage();
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    const originalSetItem = storage.setItem.bind(storage);
    try {
        assert.equal(vn.openSettings({ tab: 'basic' }).controller.close().ok, true);
        const oldBridge = storage.getItem('igs_bridge_config');
        const controller = vn.openSettings({ tab: 'basic' }).controller;
        const next = !controller.getSnapshot().draft.bridge.showToasts;
        controller.toggle('bridge.showToasts');
        storage.setItem = (key, value) => {
            if (key === 'igs_bridge_config') {
                if (value === oldBridge) throw new Error('rollback blocked');
                originalSetItem(key, value);
                throw new Error('write failed after mutation');
            }
            originalSetItem(key, value);
        };
        const closed = controller.close();
        assert.equal(closed.ok, false);
        assert.equal(closed.rollbackFailed, true);
        assert.match(describeSettingsFailure(closed), /部分设置可能已写入/);
        assert.equal(controller.getSnapshot().draft.bridge.showToasts, next, 'draft is retained for recovery');
        assert.notEqual(storage.getItem('igs_bridge_config'), oldBridge, 'the warning reflects a real partial write');
    } finally {
        storage.setItem = originalSetItem;
        vn.destroy();
    }
});

test('gate:settings-a11y:touch-targets-and-range-labels', async () => {
    const { getSettingsStyleText } = await import('../src/visual/igs-ui/settings-style.js');
    const { rangeInput } = await import('../src/visual/igs-ui/settings-fields.js');
    const css = getSettingsStyleText();
    const coarse = css.slice(css.indexOf('@media (pointer:coarse)'));
    assert.ok(coarse.length > 30, 'coarse pointer block exists');
    for (const cls of ['igs-settings-action', 'igs-settings-tab', 'igs-reader-subtab', 'igs-settings-close']) assert.ok(coarse.includes(`.${cls}`), cls);
    // 触屏只外扩透明点按区，按钮外观保持扁平，不再撑高按钮本身。
    assert.match(coarse, /::after\{content:"";position:absolute;[^}]*height:max\(100%,44px\)/);
    assert.doesNotMatch(coarse, /min-height:44px/);
    assert.match(rangeInput('a.volume', 0.5, '环境音量'), /aria-label="环境音量"/);
    assert.match(rangeInput('a.volume', 0.5), /aria-label="音量"/);
    assert.doesNotMatch(rangeInput('a.volume', 0.5, '总音量'), /打字音效音量/);
});

test('gate:settings-notice:sprite-regenerate-closes-menu-and-progress-waits-for-every-job', () => {
    assert.equal(settingsBusyLabel('char-generate-sprite:%E5%86%AC%E6%9C%88'), '生图中');
    assert.equal(settingsBusyLabel('status-avatar-generate:%E5%86%AC%E6%9C%88'), '生图中');
    const host = { id: 'igs-unified-settings', querySelector: () => null };
    const joy = beginSettingsProgress(() => host, '生图中：冬月·喜悦');
    const anger = beginSettingsProgress(() => host, '生图中：冬月·愤怒');
    // 已挂着的进度条：remount 时只改文字，读出来就是当前显示的那句。
    const peek = () => {
        let seen = '';
        const textEl = { set textContent(value) { seen = value; } };
        const fill = { setAttribute() {}, style: {} };
        const bar = { setAttribute() {}, querySelector: (sel) => (sel === '.igs-settings-progress-text' ? textEl : sel === '.igs-settings-progress-track' ? {} : fill) };
        const container = { id: 'igs-unified-settings', ownerDocument: {}, querySelector: (sel) => (sel === '.igs-settings-progress' ? bar : null) };
        bar.parentNode = container;
        remountSettingsProgress(container);
        return seen;
    };
    assert.match(peek(), /冬月·愤怒（共 2 项在画）/);
    joy.end();
    assert.equal(peek(), '生图中：冬月·愤怒', 'the job still running keeps its progress');
    anger.update('生图中：冬月·愤怒 1/1');
    assert.equal(peek(), '生图中：冬月·愤怒 1/1');
    anger.end();
    assert.equal(peek(), '', 'last job done clears the bar');
    joy.end();
    assert.equal(remountSettingsProgress({ id: 'igs-unified-settings', querySelector: () => null }), null);
});
