import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryOutfitService } from '../src/generated-images/illustration/story-outfit-service.js';

function memoryStorage() {
    const map = new Map();
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); },
    };
}

function harness(storage = memoryStorage()) {
    const state = {
        root: {
            characters: { Alice: {} },
            characterOutfits: { Alice: { 礼服: { words: [], moods: {} }, 校服: { words: [], moods: {} } } },
            characterDefaultOutfits: { Alice: { version: 1, outfitName: '校服' } },
        },
        floor: 1,
    };
    const context = () => ({ root: state.root, scopeKey: '', floorKey: `chat|${state.floor}|0`,
        messageId: state.floor, sourceHash: `h${state.floor}`, text: 'Alice 穿着红裙', autoGenerate: false });
    const make = () => createStoryOutfitService({
        storage,
        assets: { writeWardrobePrompt: async () => ({ ok: false }), tempSpriteForOutfit: () => null },
        getContext: context,
        commit(next) { state.root = next; return { ok: true }; },
    });
    const directives = [{ type: 'char', character: 'Alice', unknownOutfit: '红裙' }];
    return { state, storage, context, make, directives };
}

test('剧情衣装「稍后」：换楼与重开阅读器后仍不再提醒，候选保留在待确认', () => {
    const h = harness();
    let service = h.make();
    assert.equal(service.observe(h.directives, h.context()).ok, true);
    const [ask] = service.list({ context: h.context() });
    assert.ok(ask, '首次出现应提醒');
    service.defer(ask.id);
    assert.equal(service.list({ context: h.context() }).length, 0);

    // 下一楼再写同一件衣服：生成新候选，但不再弹。
    h.state.floor = 2;
    assert.equal(service.observe(h.directives, h.context()).ok, true);
    assert.equal(service.list({ context: h.context() }).length, 0);
    assert.equal(service.list({ includeDeferred: true, context: h.context() }).length, 1);

    // 重开阅读器（新实例 + resume）不清空「稍后」。
    service.dispose();
    service = h.make();
    service.resume();
    assert.equal(service.list({ context: h.context() }).length, 0);
    service.dispose();
});

test('剧情衣装：可归入已有衣装别名（含默认衣装），默认入库动作不变', async () => {
    const h = harness();
    const service = h.make();
    assert.equal(service.observe(h.directives, h.context()).ok, true);
    const [ask] = service.list({ context: h.context() });
    const values = ask.choices.map(choice => choice.value);
    assert.equal(values[0], 'save', '下拉默认项仍为仅入库衣柜');
    assert.deepEqual(values.slice(2), ['o:校服', 'o:礼服'], '默认衣装排在别名选项第一位');
    assert.match(ask.choices[2].label, /默认衣装「校服」/);

    const result = await service.alias(ask.id, '校服');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.aliased, '校服');
    assert.ok(h.state.root.characterOutfits.Alice.校服.words.includes('红裙'));
    assert.equal(service.list({ includeDeferred: true, context: h.context() }).length, 0, '归入后不再待确认');
    service.dispose();
});
