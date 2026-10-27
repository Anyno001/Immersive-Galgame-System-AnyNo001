import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOutfitAdoption } from '../src/scene/outfit-identity.js';

const record = (description, sent) => ({
    promptRecipe: { outfitMode: 'template' },
    sentPrompt: { version: 1, caption: { v4_prompt: { caption: { base_caption: 'masterpiece',
        char_captions: [{ char_caption: sent, centers: [{ x: 0.5, y: 0.5 }] }] } } } },
    outfitSnapshot: { version: 1, characters: [{ characterKey: '小雪', captionIndex: 0, token: 'c0',
        name: '白裙', description, source: 'candidate' }] },
});

test('衣装入库只核对衣装词画进了图，身份正文怎么变都不拦', () => {
    // 发送正文里身份、性格、姿态与重拼结果不同，衣装词照样在：应能入库。
    const ok = prepareOutfitAdoption({}, '小雪', 'img1',
        record('white dress, Red Ribbon', '1girl, silver hair, hand on own chest, white dress, red ribbon'), { defaultOutfit: true });
    assert.equal(ok.ok, true);
    assert.equal(ok.outfitName, '白裙');
    assert.match(Object.values(ok.patch.wardrobe)[0].prompt, /white dress/);
});

test('衣装词不在实际发送正文里时拒绝入库', () => {
    const bad = prepareOutfitAdoption({}, '小雪', 'img1',
        record('blue coat', '1girl, silver hair, white dress'), { defaultOutfit: true });
    assert.equal(bad.ok, false);
    assert.equal(bad.diagnostic.issue, 'wire-outfit');
});
