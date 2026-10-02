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

test('整份设置包带着基础、阅读器、素材预设和图片往返', () => {
    const bytes = buildSettingsArchive({
        settings: {
            format: 'igs-settings',
            bridge: { openMode: 'pc', sceneAssets: { scenes: { 教室: { url: 'igs-gen:room' } } } },
            readerSettings: { fontSize: 18 },
        },
        scenePresets: { presets: { 日常: { scenes: {} } }, active: '日常' },
        images: [{ id: 'room', dataUrl: PNG, prompt: { positive: 'classroom' } }],
    });
    const pack = parseSettingsArchive(bytes);
    assert.equal(pack.settings.bridge.openMode, 'pc');
    assert.equal(pack.settings.readerSettings.fontSize, 18);
    assert.equal(pack.scenePresets.active, '日常');
    assert.equal(pack.images[0].dataUrl, PNG);
    assert.equal(pack.images[0].prompt.positive, 'classroom');
    assert.equal(parseSettingsArchive(buildCharacterCardPack({ characterName: '小雪', library: {} })), null);
});

test('立绘位置只带走这张卡的角色，情绪组合并而不是覆盖', () => {
    const layouts = spriteEntriesForNames({
        'pc::小雪::默认': { posX: 1 },
        'pc::林::默认': { posX: 2 },
        'pc::小雪|校服': { posX: 3 },
    }, ['小雪'], true);
    assert.deepEqual(Object.keys(layouts).sort(), ['pc::小雪::默认', 'pc::小雪|校服']);
    const groups = mergeLabelGroups(
        [{ label: '喜悦', words: ['开心'] }],
        [{ label: '喜悦', words: ['笑'] }, { label: '害羞', words: ['脸红'] }],
    );
    assert.deepEqual(groups, [
        { label: '喜悦', words: ['开心', '笑'] },
        { label: '害羞', words: ['脸红'] },
    ]);
});
