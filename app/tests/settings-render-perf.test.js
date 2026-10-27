import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapIGS } from '../src/index.js';

function memoryStorage(seed = {}) {
    const m = new Map(Object.entries(seed));
    return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}

function boot(seed, extraGlobal = {}) {
    return bootstrapIGS({
        global: { localStorage: memoryStorage(seed), ...extraGlobal },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
}

test('设置重绘：草稿没动时复用整理结果，改过设置后立即看到新值', () => {
    const vn = boot({});
    try {
        const ctl = vn.openSettings({ tab: 'scene', mode: 'pc' }).controller;
        const first = ctl.switchPage('style').snapshot.draft;
        const second = ctl.switchPage('text').snapshot.draft;
        assert.equal(second, first, '换页不碰草稿，复用同一份整理结果');
        const before = Boolean(first.bridge.sceneAssets.moodAutoClassify);
        ctl.toggle('bridge.sceneAssets.moodAutoClassify');
        const afterToggle = ctl.switchPage('style').snapshot.draft;
        assert.notEqual(afterToggle, second, '写过草稿后重新整理');
        assert.equal(Boolean(afterToggle.bridge.sceneAssets.moodAutoClassify), !before);
        const again = ctl.switchPage('text').snapshot.draft;
        assert.equal(again, afterToggle);
        ctl.setValue('readerSettings.fontSize', 22, { liveInput: true });
        const afterLive = ctl.switchPage('style').snapshot.draft;
        assert.equal(afterLive.readerSettings.fontSize, 22, '实时输入后换页不会显示旧值');
        ctl.close();
    } finally {
        vn.destroy();
    }
});

test('演出页重绘不再生成样式/文字页控件（TTS 声音列表读取次数为 0）', () => {
    const calls = { n: 0 };
    const original = globalThis.speechSynthesis;
    globalThis.speechSynthesis = { getVoices() { calls.n += 1; return []; }, addEventListener() {}, removeEventListener() {} };
    const vn = boot({ 'igs-reader-settings-v9-default': JSON.stringify({ tts: { enabled: true } }) });
    try {
        const ctl = vn.openSettings({ tab: 'scene', mode: 'pc' }).controller;
        ctl.switchPage('perf-stage');
        const base = calls.n;
        ctl.switchPage('perf-story');
        ctl.switchPage('perf-text');
        assert.equal(calls.n, base, '演出页重绘不读系统声音列表');
        ctl.switchPage('sound');
        assert.ok(calls.n > base, '声音页仍会渲染朗读控件');
        ctl.close();
    } finally {
        vn.destroy();
        if (original === undefined) delete globalThis.speechSynthesis; else globalThis.speechSynthesis = original;
    }
});

test('搜索索引在空闲回调里预建，关闭设置时取消', () => {
    const idle = { next: 1, pending: new Map(), cancelled: [] };
    const host = {
        requestIdleCallback: (fn) => { const id = idle.next++; idle.pending.set(id, fn); return id; },
        cancelIdleCallback: (id) => { idle.cancelled.push(id); idle.pending.delete(id); },
    };
    // 建索引要把全部页面渲染一遍（含朗读控件，会读系统声音列表），用读取次数判断索引何时建好。
    const calls = { n: 0 };
    const original = globalThis.speechSynthesis;
    globalThis.speechSynthesis = { getVoices() { calls.n += 1; return []; }, addEventListener() {}, removeEventListener() {} };
    const vn = boot({ 'igs-reader-settings-v9-default': JSON.stringify({ tts: { enabled: true } }) }, host);
    try {
        const ctl = vn.openSettings({ tab: 'scene', mode: 'pc' }).controller;
        assert.equal(idle.pending.size, 1, '打开设置只登记空闲回调');
        const afterOpen = calls.n;
        const [[, run]] = [...idle.pending];
        idle.pending.clear();
        run();
        assert.ok(calls.n > afterOpen, '空闲回调里渲染全部页面建好索引');
        const built = calls.n;
        assert.ok(Array.isArray(ctl.getSearchIndex()));
        assert.equal(calls.n, built, '索引已预建，首次取不再渲染');
        ctl.close();

        const ctl2 = vn.openSettings({ tab: 'scene', mode: 'pc' }).controller;
        const pendingId = [...idle.pending.keys()][0];
        assert.ok(pendingId);
        ctl2.close();
        assert.deepEqual(idle.cancelled, [pendingId], '关闭设置取消未执行的预建');

        const ctl3 = vn.openSettings({ tab: 'scene', mode: 'pc' }).controller;
        const before = calls.n;
        assert.ok(Array.isArray(ctl3.getSearchIndex()));
        assert.ok(calls.n > before, '预建前搜索仍同步建索引');
        ctl3.close();
    } finally {
        vn.destroy();
        if (original === undefined) delete globalThis.speechSynthesis; else globalThis.speechSynthesis = original;
    }
});
