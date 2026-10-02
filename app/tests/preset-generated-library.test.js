import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/index.js';
import { releasedGeneratedImageIds, unreferencedGeneratedImageIds } from '../src/visual/igs-ui/settings-actions.js';

test('gate:assets:image-refs-follow-global-and-cards-only', () => {
    const storage = createMemoryStorage();
    storage.setItem('igs:scene-presets:v1', JSON.stringify({
        version: 1,
        presets: { 卡A: { scenes: { 教室: { url: 'igs-gen:bg-a', words: [], times: {} } }, characters: { 雪乃: { 默认: 'igs-gen:sp-a' } } } },
    }));
    assert.deepEqual(unreferencedGeneratedImageIds(['bg-a', 'sp-a'], { scenes: {}, characters: {} }, storage), ['bg-a', 'sp-a'], '旧预设快照不再留住图片');
    assert.deepEqual(releasedGeneratedImageIds(['sp-a', 'bg-a'], { characters: { 雪乃: { 默认: 'igs-gen:sp-a' } } }, storage), ['bg-a']);
    assert.deepEqual(releasedGeneratedImageIds(['sp-a'], { characters: {} }, null), ['sp-a']);
    assert.deepEqual(unreferencedGeneratedImageIds(['x'], { cards: { 'card:小雪': { characters: { 小雪: { 默认: 'igs-gen:x' } } } } }, null), []);
});
