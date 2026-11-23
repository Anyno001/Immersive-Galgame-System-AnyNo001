import test from 'node:test';
import assert from 'node:assert/strict';
import { blockImageBackend, forumBlocksImages, withImagesBlocked } from '../src/generated-images/image-block.js';
import { normalizeForumReaderSettings } from '../src/visual/igs-ui/forum-reader-settings.js';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';

test('论坛体屏蔽生图：只在论坛体开着且勾选时生效，默认不勾', () => {
    assert.equal(normalizeForumReaderSettings({}).noImages, false);
    assert.equal(normalizeForumReaderSettings({ noImages: true }).noImages, true);
    assert.equal(normalizeFxReaderSettings({ forumReader: { on: true, noImages: true } }).forumReader.noImages, true);
    assert.equal(normalizeSettingsValue('readerSettings.forumReader.noImages', 'true'), true);
    assert.equal(forumBlocksImages({ forumReader: { on: true, noImages: true } }), true);
    assert.equal(forumBlocksImages({ forumReader: { on: false, noImages: true } }), false);
    assert.equal(forumBlocksImages({ forumReader: { on: true } }), false);
    assert.equal(forumBlocksImages(undefined), false);
});

test('屏蔽时自动开关视为关，原配置不被改动', () => {
    const bridge = { autoIllustration: { nsfwEnabled: true, interludeEnabled: true, backfillOldFloors: true, nai: { model: 'x' },
        assets: { spriteEnabled: true, backgroundEnabled: true, outfitAutoGenerate: true, maxPerFloor: 3 } }, itemImages: { enabled: true, size: '512x512' } };
    const out = withImagesBlocked(bridge);
    assert.equal(out.imagesBlocked, true);
    assert.deepEqual([out.autoIllustration.nsfwEnabled, out.autoIllustration.interludeEnabled, out.autoIllustration.backfillOldFloors], [false, false, false]);
    assert.deepEqual([out.autoIllustration.assets.spriteEnabled, out.autoIllustration.assets.backgroundEnabled, out.autoIllustration.assets.outfitAutoGenerate], [false, false, false]);
    assert.equal(out.autoIllustration.assets.maxPerFloor, 3);
    assert.equal(out.autoIllustration.nai.model, 'x');
    assert.deepEqual(out.itemImages, { enabled: false, size: '512x512' });
    assert.equal(bridge.autoIllustration.nsfwEnabled, true);
    assert.equal(bridge.itemImages.enabled, true);
});

test('屏蔽时后端出图入口直接拒绝，取消后照常出图', async () => {
    let blocked = true, calls = 0;
    const backend = blockImageBackend({ generate: async () => { calls += 1; return { ok: true }; }, edit: async () => { calls += 1; return { ok: true }; }, other: () => 'kept' }, () => blocked);
    const refused = await backend.generate('p', {}, {});
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'images-blocked');
    assert.equal((await backend.edit()).ok, false);
    assert.equal(calls, 0);
    assert.equal(backend.other(), 'kept');
    blocked = false;
    assert.equal((await backend.generate('p', {}, {})).ok, true);
    assert.equal(calls, 1);
});

test('论坛体屏蔽演出：默认保留文字演出、检定、好感提示，其余视为关；提示词不再发对应写法', async () => {
    const { applyForumFxBlock, forumBlocksFx, normalizeForumFxKeep } = await import('../src/visual/igs-ui/forum-fx-block.js');
    const { collectGrammarBlocks } = await import('../src/visual/igs-ui/tag-grammar.js');
    const keep = normalizeForumFxKeep(undefined);
    assert.equal(keep.text && keep.result && keep.favor, true);
    assert.equal(keep.sound || keep.battle || keep.phone || keep.daily, false);
    assert.equal(normalizeForumReaderSettings({ noFx: true, keepFx: { sound: true } }).keepFx.sound, true);
    assert.equal(normalizeSettingsValue('readerSettings.forumReader.keepFx.sound', 'true'), true);
    const raw = normalizeFxReaderSettings({ fxTags: { enabled: true }, dailyFx: { enabled: true }, bgm: { enabled: true, moodTag: true }, textFx: { enabled: true }, favorToast: { enabled: true }, tts: { enabled: true },
        forumReader: { on: true, noFx: true } });
    assert.equal(forumBlocksFx(raw), true);
    const out = applyForumFxBlock(raw);
    assert.equal(out.fxTags.enabled, false);
    assert.equal(out.dailyFx.enabled, false);
    assert.equal(out.bgm.enabled, false);
    assert.equal(out.tts.enabled, false);
    assert.equal(out.textFx.enabled, true);
    assert.equal(out.favorToast.enabled, true);
    assert.equal(raw.fxTags.enabled, true);
    const keysOf = (rs) => collectGrammarBlocks(rs).map((b) => b.key);
    assert.ok(keysOf(raw).includes('fx'));
    assert.ok(!keysOf(out).includes('fx'));
    assert.ok(!keysOf(out).includes('bgm'));
    assert.ok(keysOf(out).includes('forum'));
    // 没勾屏蔽或论坛体没开时原样返回。
    assert.equal(applyForumFxBlock({ ...raw, forumReader: { ...raw.forumReader, noFx: false } }).fxTags.enabled, true);
});
