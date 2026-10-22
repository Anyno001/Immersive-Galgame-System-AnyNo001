import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCharacterCardPack, buildSettingsArchive, mergeLabelGroups, parseCharacterCardPack, parseSettingsArchive, spriteEntriesForNames } from '../src/scene/card-pack.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('角色卡素材包按名字往返，立绘像素和提示词都在', () => {
    const bytes = buildCharacterCardPack({
        characterName: '小雪',
        library: {
            scenes: { 教室: { url: 'igs-gen:room' } },
            characters: { 小雪: { 默认: 'igs-gen:snow' } },
            wardrobe: { 校服: { prompt: 'uniform', reference: 'igs-gen:snow' } },
        },
        images: [{
            id: 'snow',
            type: 'sprite',
            dataUrl: PNG,
            originalDataUrl: PNG,
            prompt: { positive: '1girl, uniform', negative: '' },
            revision: 2,
        }],
        spriteLayouts: { 'pc::小雪::默认': { posX: 40, posY: 100, scale: 80 }, 'pc::林::默认': { posX: 1 } },
        spriteHeads: { '小雪::默认': { x: 1 } },
        moodGroups: [{ label: '喜悦', words: ['开心', '笑'] }],
        worldview: 'ancient',
    });
    const pack = parseCharacterCardPack(bytes);
    assert.equal(pack.characterName, '小雪');
    assert.equal(pack.library.scenes.教室.url, 'igs-gen:room');
    assert.equal(pack.library.wardrobe.校服.prompt, 'uniform');
    assert.equal(pack.images.length, 1);
    assert.equal(pack.images[0].id, 'snow');
    assert.equal(pack.images[0].dataUrl, PNG);
    assert.equal(pack.images[0].originalDataUrl, PNG);
    assert.equal(pack.images[0].prompt.positive, '1girl, uniform');
    assert.equal(pack.images[0].revision, 2);
    assert.equal(pack.spriteLayouts['pc::小雪::默认'].posX, 40);
    assert.deepEqual(pack.moodGroups, [{ label: '喜悦', words: ['开心', '笑'] }]);
    assert.equal(pack.worldview, 'ancient');
    assert.equal(parseCharacterCardPack(new Uint8Array([1, 2, 3])), null);
});
