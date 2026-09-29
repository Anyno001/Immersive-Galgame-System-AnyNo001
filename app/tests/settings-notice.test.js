import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSettingsFailure, isQuotaError, markSettingsButtonBusy, remountSettingsNotice, settingsBusyLabel } from '../src/visual/igs-ui/settings-notice.js';
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

test('gate:settings-a11y:touch-targets-and-range-labels', async () => {
    const { getSettingsStyleText } = await import('../src/visual/igs-ui/settings-style.js');
    const { rangeInput } = await import('../src/visual/igs-ui/settings-fields.js');
    const css = getSettingsStyleText();
    const coarse = css.slice(css.indexOf('@media (pointer:coarse)'));
    assert.ok(coarse.length > 30, 'coarse pointer block exists');
    for (const cls of ['igs-settings-action', 'igs-settings-tab', 'igs-reader-subtab', 'igs-settings-close']) assert.ok(coarse.includes(`.${cls}`), cls);
    assert.match(coarse, /min-height:44px/);
    assert.match(rangeInput('a.volume', 0.5, '环境音量'), /aria-label="环境音量"/);
    assert.match(rangeInput('a.volume', 0.5), /aria-label="音量"/);
    assert.doesNotMatch(rangeInput('a.volume', 0.5, '总音量'), /打字音效音量/);
});
