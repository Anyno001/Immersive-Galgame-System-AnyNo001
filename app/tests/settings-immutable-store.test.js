import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapIGS } from '../src/index.js';

// 存储里的配置（内部的 getUnifiedSettingsSnapshot 返回值、state.config、state.legacyIgs）是共享只读的：
// 读路径不再深拷，任何原地改写都会污染所有人。这里把它们深冻结后走一遍常用流程，原地改写会直接抛错。

function memoryStorage(seed = {}) {
    const m = new Map(Object.entries(seed));
    return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const item of Object.values(value)) deepFreeze(item);
    }
    return value;
}

const SEED = {
    igs_bridge_config: JSON.stringify({
        sceneAssets: {
            enabled: true,
            scenes: { 教室: 'a.png', 街道: { url: 'b.png', times: { 夜: { url: 'c.png', words: ['night'], weathers: { 雨: 'd.png' } } } } },
            characters: { 小雪: { 喜悦: 'x.png' } },
            characterAliases: { 小雪: ['雪'] },
            timeGroups: [{ label: '夜', words: ['dark'] }],
            generated: { characters: { 小雪: { 喜悦: 'igs-gen:1' } }, expressionNotes: { 小雪: { 喜悦: { positive: 'smile' } } } },
            cards: { 某卡: { characters: { 阿光: { 默认: 'y.png' } } } },
        },
    }),
    'igs-reader-settings-v9-default': JSON.stringify({ dialogSkin: 'gradient-veil' }),
};

function boot(storage = memoryStorage(SEED)) {
    return bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
}

test('immutable-store: 设置里点按钮后取消、重开，旧配置都没被改', () => {
    const vn = boot();
    try {
        const before = deepFreeze(vn.getUnifiedSettings({ mode: 'default' }));
        deepFreeze(vn.getState().config);
        deepFreeze(vn.getState().legacyIgs);
        for (let round = 0; round < 2; round += 1) {
            const ctl = vn.openSettings({ tab: 'scene', mode: 'pc' }).controller;
            assert.notEqual(ctl.toggle('bridge.sceneAssets.moodAutoClassify').ok, false);
            assert.notEqual(ctl.close().ok, false);
        }
        assert.equal(before.bridge.sceneAssets.moodAutoClassify, undefined);
        assert.equal(vn.getUnifiedSettings({ mode: 'default' }).bridge.sceneAssets.moodAutoClassify, false);
    } finally {
        vn.destroy();
    }
});
