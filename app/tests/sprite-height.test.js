import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeSettingsValue,
    normalizeSpriteGenderScale,
    normalizeSpriteHeight,
    resolveSpriteLayout,
    spriteHeightLayoutKey,
} from '../src/visual/igs-ui/settings-normalize.js';
import { detectSpriteAge, normalizeCharacterSpriteScales, resolveSpriteBaseScale } from '../src/visual/igs-ui/sprite-height.js';
import { hasCharacterSpriteLayout } from '../src/visual/igs-ui/sprite-key-migration.js';
import { legacyPresetToPack, presetFromAssets } from '../src/scene/legacy-preset.js';

const assets = (over = {}) => ({
    characters: { 爱丽: { 默认: '' }, 小林: { 默认: '' }, 路人: { 默认: '' } },
    characterAliases: { 爱丽: ['小爱'] },
    characterDna: { 爱丽: { identity: '1girl, 银发' }, 小林: { triggerWords: '1boy' } },
    ...over,
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
        assert.match(html, /老人比同性别矮<\/span><input data-path="readerSettings\.spriteGenderScale\.elderShorter" type="number" value="5"/);
        assert.match(html, /儿童比同性别矮<\/span><input data-path="readerSettings\.spriteGenderScale\.childShorter" type="number" value="20"/);

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
