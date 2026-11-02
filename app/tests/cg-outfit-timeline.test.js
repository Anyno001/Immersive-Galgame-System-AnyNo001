import test from 'node:test';
import assert from 'node:assert/strict';
import { cgCharacterState } from '../src/generated-images/illustration/cg-character-bindings.js';

const assets = () => ({
    characters: { 秦绯烟: { 平和: 'igs-gen:calm' } },
    characterOutfits: { 秦绯烟: {
        月白衫: { words: [], moods: { 平和: 'igs-gen:white' } },
    } },
    characterDefaultOutfits: { 秦绯烟: { version: 1, outfitName: '月白衫' } },
    wardrobe: { 月白衫: { prompt: 'white robe' } },
    characterDna: {},
});

test('同一套未入柜衣装连续出现只记第一次，换装后再记', () => {
    const text = [
        '[igs-char:秦绯烟|平和|桃红蹙金纱裙|第一句。]',
        '她走了几步。',
        '[igs-char:秦绯烟|害羞|桃红蹙金纱裙|第二句。]',
        '[igs-char:秦绯烟|平和|月白衫|换上了。]',
        '[igs-thought:秦绯烟|平和|月白衫|还是这件。]',
    ].join('\n');
    const { timeline } = cgCharacterState(text, ['秦绯烟'], assets());
    assert.deepEqual(timeline.map(item => item.outfit.name), ['桃红蹙金纱裙', '月白衫']);
    assert.equal(timeline[0].characterKey, '秦绯烟');
    assert.equal(timeline[0].outfit.description, '');
    assert.equal(timeline[1].outfit.description, 'white robe');
    assert.ok(timeline[1].offset > timeline[0].offset);
});
