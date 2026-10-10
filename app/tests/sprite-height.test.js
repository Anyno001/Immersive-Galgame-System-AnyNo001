import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeSettingsValue,
    normalizeSpriteGenderScale,
    normalizeSpriteHeight,
    resolveSpriteLayout,
    spriteHeightLayoutKey,
} from '../src/visual/igs-ui/settings-normalize.js';
import { normalizeCharacterSpriteScales, resolveSpriteBaseScale } from '../src/visual/igs-ui/sprite-height.js';
import { hasCharacterSpriteLayout } from '../src/visual/igs-ui/sprite-key-migration.js';
import { legacyPresetToPack, presetFromAssets } from '../src/scene/legacy-preset.js';

const assets = (over = {}) => ({
    characters: { 爱丽: { 默认: '' }, 小林: { 默认: '' }, 路人: { 默认: '' } },
    characterAliases: { 爱丽: ['小爱'] },
    characterDna: { 爱丽: { identity: '1girl, 银发' }, 小林: { triggerWords: '1boy' } },
    ...over,
});

test('gate:sprite-height:normalize-clamps-rounds-and-falls-back', () => {
    assert.equal(normalizeSpriteHeight(''), null);
    assert.equal(normalizeSpriteHeight('  ', 100), 100);
    assert.equal(normalizeSpriteHeight(undefined, 95), 95);
    assert.equal(normalizeSpriteHeight('abc', 90), 90);
    assert.equal(normalizeSpriteHeight(40), 40);
    assert.equal(normalizeSpriteHeight('200'), 200);
    assert.equal(normalizeSpriteHeight(0), null);
    assert.equal(normalizeSpriteHeight(-30), -30);
    assert.equal(normalizeSpriteHeight(92.4), 92);
    assert.equal(normalizeSpriteHeight('117'), 117);
});

test('gate:sprite-height:gender-defaults-are-90-100-95-and-off', () => {
    assert.deepEqual(normalizeSpriteGenderScale(null), { enabled: false, female: 90, male: 100, other: 95 });
    assert.deepEqual(normalizeSpriteGenderScale({ enabled: false, female: '', male: 300, other: 'x' }), { enabled: false, female: 90, male: 300, other: 95 });
    assert.deepEqual(normalizeSpriteGenderScale({ female: 88 }), { enabled: false, female: 88, male: 100, other: 95 });
});

test('gate:sprite-height:settings-paths-normalize-to-range', () => {
    assert.equal(normalizeSettingsValue('readerSettings.spriteDefaultScale', '45'), 45);
    assert.equal(normalizeSettingsValue('readerSettings.spriteDefaultScale', '123'), 123);
    assert.equal(normalizeSettingsValue('readerSettings.spriteDefaultScale', ''), 100);
    assert.equal(normalizeSettingsValue('readerSettings.spriteGenderScale.male', ''), 100);
    assert.equal(normalizeSettingsValue('readerSettings.spriteGenderScale.female', '130'), 130);
    assert.equal(normalizeSettingsValue('readerSettings.spriteGenderScale.other', '999'), 999);
    assert.equal(normalizeSettingsValue('readerSettings.spriteGenderScale.enabled', 'false'), false);
    assert.equal(normalizeSettingsValue('readerSettings.spriteGenderScale.enabled', true), true);
    assert.equal(normalizeSettingsValue('readerSettings.spriteDisplayScale', '12'), 12);
    assert.equal(normalizeSettingsValue('readerSettings.spriteDisplayScale', '400'), 400);
    assert.equal(normalizeSettingsValue('readerSettings.spriteDisplayScale', '0'), 100);
    assert.equal(normalizeSettingsValue('readerSettings.spriteDisplayScale', '-20'), 100);
});

test('gate:sprite-height:character-scales-keep-only-valid-entries', () => {
    const raw = JSON.parse('{"爱丽":"120","小林":"","路人":"abc","__proto__":100,"  ":90,"阿强":30}');
    assert.deepEqual(normalizeCharacterSpriteScales(raw), { 爱丽: 120, 阿强: 30 });
    assert.deepEqual(normalizeCharacterSpriteScales(null), {});
});

test('gate:sprite-height:resolve-uses-dna-gender-then-base', () => {
    const reader = { spriteDefaultScale: 110, spriteGenderScale: { enabled: true } };
    assert.deepEqual(resolveSpriteBaseScale(assets(), reader, '爱丽'), { characterScale: null, defaultScale: 90, source: 'female' });
    assert.deepEqual(resolveSpriteBaseScale(assets(), reader, '小林'), { characterScale: null, defaultScale: 100, source: 'male' });
    // 没有 DNA 或看不出性别的算「其他」。
    assert.deepEqual(resolveSpriteBaseScale(assets(), reader, '路人'), { characterScale: null, defaultScale: 95, source: 'other' });
    // 别名按主名认。
    assert.equal(resolveSpriteBaseScale(assets(), reader, '小爱').source, 'female');
    // 没有角色名、或关掉性别区分时用基准高度。
    assert.deepEqual(resolveSpriteBaseScale(assets(), reader, ''), { characterScale: null, defaultScale: 110, source: 'base' });
    const off = { ...reader, spriteGenderScale: { enabled: false } };
    assert.deepEqual(resolveSpriteBaseScale(assets(), off, '爱丽'), { characterScale: null, defaultScale: 110, source: 'base' });
    // 旧存档两项都没有：性别默认照常生效。
    assert.equal(resolveSpriteBaseScale(assets(), {}, '小林').defaultScale, 100);
});

test('gate:sprite-height:resolve-prefers-character-setting', () => {
    const withManual = assets({ characterSpriteScales: { 爱丽: 123 } });
    assert.deepEqual(resolveSpriteBaseScale(withManual, {}, '爱丽'), { characterScale: 123, defaultScale: 100, source: 'manual' });
    assert.equal(resolveSpriteBaseScale(withManual, {}, '小爱').characterScale, 123, '别名也用主名的高度');
    assert.equal(resolveSpriteBaseScale(withManual, { spriteGenderScale: { enabled: false } }, '爱丽').characterScale, 123, '和性别开关无关');
});

test('gate:sprite-height:layout-priority-manual-then-character-then-mode-then-default', () => {
    const layouts = {
        pc: { posX: 40, posY: 95, scale: 110 },
        'pc::小林::平和': { posX: 70, posY: 30, scale: 180 },
    };
    // 「调整立绘」存下的位置压过角色自定义高度。
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林', '平和', '', 90, 120), { posX: 70, posY: 30, scale: 180 });
    // 角色自定义高度压过模式整体缩放，位置沿用模式整体位置。
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林', '害羞', '', 90, 120), { posX: 40, posY: 95, scale: 120 });
    // 模式整体缩放压过性别默认 / 基准高度（和原来一样）。
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '爱丽', '', '', 90, null), { posX: 40, posY: 95, scale: 110 });
    assert.deepEqual(resolveSpriteLayout(null, 'pc', '爱丽', '', '', 90, null), { posX: 50, posY: 100, scale: 90 });
    assert.deepEqual(resolveSpriteLayout(null, 'pc', '爱丽', '', '', 90, 120), { posX: 50, posY: 100, scale: 120 });
    // 没有角色名时不吃角色高度。
    assert.deepEqual(resolveSpriteLayout(null, 'pc', '', '', '', 100, 120), { posX: 50, posY: 100, scale: 100 });
});

test('gate:sprite-height:detects-manual-layouts-by-full-identity', () => {
    const layouts = { pc: {}, 'pc::小林::平和': {}, 'mobile::小林|泳装': {}, 'pc::小林海斗::平和': {} };
    assert.equal(hasCharacterSpriteLayout(layouts, '小林'), true);
    assert.equal(hasCharacterSpriteLayout(layouts, '小林海斗'), true);
    assert.equal(hasCharacterSpriteLayout(layouts, '小'), false);
    assert.equal(hasCharacterSpriteLayout(layouts, '爱丽'), false);
    assert.equal(hasCharacterSpriteLayout(null, '小林'), false);
});

test('gate:sprite-height:preset-export-and-import-carry-character-heights', () => {
    const preset = presetFromAssets(assets(), { root: { characterSpriteScales: { 爱丽: 120 } } });
    assert.deepEqual(preset.characterSpriteScales, { 爱丽: 120 });
    assert.deepEqual(legacyPresetToPack(preset).characterSpriteScales, { 爱丽: 120 });
    assert.deepEqual(legacyPresetToPack({}).characterSpriteScales, {});
});

test('gate:sprite-height:settings-row-saves-renames-and-clears', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const answers = [];
    const global = { prompt: () => answers.shift() ?? '', confirm: () => true };
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'reader', mode: 'pc' }).controller;
        controller.setValue('bridge.sceneAssets.characters', { 爱丽: { 默认: '' } });
        controller.setValue('bridge.sceneAssets.characterDna', { 爱丽: { identity: '1girl' } });
        controller.switchTab('scene');
        let html = controller.switchSceneSubTab('characters').html || controller.getSnapshot().html;
        assert.match(html, /data-path="readerSettings\.spriteDefaultScale" type="number" value="100"/);
        // 默认关：不打开就不改动老用户的立绘大小。
        assert.match(html, /data-switch="readerSettings\.spriteGenderScale\.enabled" aria-pressed="false"/);
        assert.doesNotMatch(html, /data-path="readerSettings\.spriteGenderScale\.female"/);
        controller.toggle('readerSettings.spriteGenderScale.enabled');
        html = controller.getSnapshot().html;
        assert.match(html, /data-switch="readerSettings\.spriteGenderScale\.enabled" aria-pressed="true"/);
        assert.match(html, /data-path="readerSettings\.spriteGenderScale\.female" type="number" value="90"/);
        assert.match(html, /data-path="readerSettings\.spriteGenderScale\.male" type="number" value="100"/);
        assert.match(html, /data-path="readerSettings\.spriteGenderScale\.other" type="number" value="95"/);

        const name = encodeURIComponent('爱丽');
        // 角色收起时、角色设定面板里都没有这一行；点名字展开后在立绘列表最上面。
        assert.doesNotMatch(html, /data-char-height=/);
        html = (await controller.invoke(`scene-toggle-dna:${name}`)).snapshot.html;
        assert.doesNotMatch(html, /data-char-height=/);
        html = (await controller.invoke(`ui-toggle-open:${encodeURIComponent('char-open:爱丽')}`)).snapshot.html;
        assert.match(html, /<div class="igs-char-body"><div class="igs-char-info-row igs-char-height-row">/);
        assert.match(html, /data-char-height="爱丽" value="" placeholder="90"/);
        assert.match(html, /<span class="igs-char-height-hint">默认 女性 90%<\/span>/);

        html = (await controller.invoke(`char-height:${name}:117`)).snapshot.html;
        assert.deepEqual(controller.getSnapshot().draft.bridge.sceneAssets.characterSpriteScales, { 爱丽: 117 });
        assert.match(html, /data-char-height="爱丽" value="117" placeholder="90"/);
        await controller.invoke(`char-height:${name}:999`);
        assert.deepEqual(controller.getSnapshot().draft.bridge.sceneAssets.characterSpriteScales, { 爱丽: 999 });

        // 「调整立绘」调过的角色提示调整结果优先。
        controller.setValue('readerSettings.spriteLayouts', { 'pc::爱丽::默认': { posX: 50, posY: 100, scale: 130 } });
        html = controller.switchSceneSubTab('characters').html || controller.getSnapshot().html;
        assert.match(html, /<span class="igs-char-height-hint" title="在「调整立绘」里单独调过的表情，按调整结果显示">默认 女性 90% · 已单独调整<\/span>/);

        // 关掉性别区分后，自动值回到基准高度，性别格子收起。
        controller.toggle('readerSettings.spriteGenderScale.enabled');
        html = controller.getSnapshot().html;
        assert.doesNotMatch(html, /data-path="readerSettings\.spriteGenderScale\.female"/);
        assert.match(html, /data-char-height="爱丽" value="999" placeholder="100"/);

        // 角色改名时高度跟着走。
        answers.push('爱丽丝');
        await controller.invoke(`scene-rename-char:${name}`);
        assert.deepEqual(controller.getSnapshot().draft.bridge.sceneAssets.characterSpriteScales, { 爱丽丝: 999 });

        // 留空就删掉，回到自动。
        const renamed = encodeURIComponent('爱丽丝');
        await controller.invoke(`char-height:${renamed}:`);
        assert.deepEqual(controller.getSnapshot().draft.bridge.sceneAssets.characterSpriteScales, {});

        // 删除角色时一起清掉。
        await controller.invoke(`char-height:${renamed}:80`);
        assert.deepEqual(controller.getSnapshot().draft.bridge.sceneAssets.characterSpriteScales, { 爱丽丝: 80 });
        await controller.invoke(`scene-remove-char:${renamed}`);
        assert.deepEqual(controller.getSnapshot().draft.bridge.sceneAssets.characterSpriteScales, {});
        controller.close();
    } finally {
        vn.destroy();
    }
});

test('gate:asset-batch-delete:select-pick-and-delete-characters', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const global = { prompt: () => '', confirm: () => true };
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'scene', mode: 'pc' }).controller;
        controller.setValue('bridge.sceneAssets.characters', { 甲: { 默认: '' }, 乙: { 默认: '' }, 丙: { 默认: '' } });
        let html = controller.switchSceneSubTab('characters').html || controller.getSnapshot().html;
        assert.match(html, /data-action="asset-select:characters"[^>]*>多选</);
        html = (await controller.invoke('asset-select:characters')).snapshot.html;
        assert.match(html, /已选 0 项/);
        assert.match(html, /data-action="asset-delete-picked:characters" disabled/);
        await controller.invoke(`asset-pick:characters:${encodeURIComponent('甲')}`);
        html = (await controller.invoke(`asset-pick:characters:${encodeURIComponent('丙')}`)).snapshot.html;
        assert.match(html, /已选 2 项/);
        await controller.invoke('asset-delete-picked:characters');
        assert.deepEqual(Object.keys(controller.getSnapshot().draft.bridge.sceneAssets.characters), ['乙']);
        assert.doesNotMatch(controller.getSnapshot().html, /已选/);
    } finally {
        vn.destroy();
    }
});

test('gate:sprite-height:preset-strips-expressionNotes-from-generated', () => {
    const source = {
        scenes: { 教室: { url: 'room.png' } },
        characters: { 冬月: { 默认: 'face.png' } },
        characterAliases: {},
        characterDna: {},
        characterOutfits: {},
        wardrobe: {},
        statusAvatars: {},
        generated: {
            scenes: { 工厂: { url: 'igs-gen:bg1' } },
            characters: { 冬月: { 默认: 'igs-gen:a' } },
            characterAliases: {},
            expressionNotes: { 冬月: { 喜悦: { positive: 'smile', negative: 'sad' } } },
        },
    };
    const preset = presetFromAssets(source, { root: {} });
    // expressionNotes 被裁剪
    assert.equal(preset.generated.expressionNotes, undefined,
        'expressionNotes stripped from preset');
    // 其他 generated 字段保留
    assert.equal(preset.generated.scenes.工厂.url, 'igs-gen:bg1');
    assert.equal(preset.generated.characters.冬月.默认, 'igs-gen:a');
    // 非 generated 字段不受影响
    assert.deepEqual(preset.scenes, { 教室: { url: 'room.png' } });
});

test('gate:sprite-height:cast zoom writes the layout that is already on screen', () => {
    const layouts = {
        'pc::乙': { posX: 10, posY: 20, scale: 70 },
        'pc::乙::smile': { posX: 11, posY: 21, scale: 75 },
        'pc::甲|校服': { posX: 12, posY: 22, scale: 80 },
    };
    assert.equal(spriteHeightLayoutKey(layouts, 'pc', '乙', 'smile'), 'pc::乙::smile');
    assert.equal(spriteHeightLayoutKey(layouts, 'pc', '乙', 'angry'), 'pc::乙');
    assert.equal(spriteHeightLayoutKey(layouts, 'pc', '甲', '', '校服'), 'pc::甲|校服');
    assert.equal(spriteHeightLayoutKey(layouts, 'pc', '甲', 'smile', '校服'), 'pc::甲|校服');
    assert.equal(spriteHeightLayoutKey({}, 'pc', '丙', 'smile'), 'pc::丙');
    assert.equal(spriteHeightLayoutKey({}, 'pc', '丙', 'smile', '校服'), 'pc::丙|校服');
    assert.equal(spriteHeightLayoutKey(layouts, 'pc', ''), '');
});

