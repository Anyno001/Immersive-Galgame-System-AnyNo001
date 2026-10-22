import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/index.js';
import { releasedGeneratedImageIds, unreferencedGeneratedImageIds } from '../src/visual/igs-ui/settings-actions.js';

// 旧版预设还没找回之前，它引用的图要留着；全局和各角色卡引用的同样留着。
test('gate:assets:image-refs-keep-global-cards-and-legacy-presets', () => {
    const storage = createMemoryStorage();
    storage.setItem('igs:scene-presets:v1', JSON.stringify({
        version: 1,
        presets: { 卡A: { scenes: { 教室: { url: 'igs-gen:bg-a', words: [], times: {} } }, characters: { 雪乃: { 默认: 'igs-gen:sp-a' } } } },
    }));
    assert.deepEqual(unreferencedGeneratedImageIds(['bg-a', 'sp-a', 'z'], { scenes: {}, characters: {} }, storage), ['z'], '旧预设引用的图不删');
    assert.deepEqual(releasedGeneratedImageIds(['sp-a', 'bg-a'], { characters: {} }, null), ['sp-a', 'bg-a']);
    assert.deepEqual(releasedGeneratedImageIds(['sp-a'], { characters: {} }, null), ['sp-a']);
    assert.deepEqual(unreferencedGeneratedImageIds(['x'], { cards: { 'card:小雪': { characters: { 小雪: { 默认: 'igs-gen:x' } } } } }, null), []);
});
