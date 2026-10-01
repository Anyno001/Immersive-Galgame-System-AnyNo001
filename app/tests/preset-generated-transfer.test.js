import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/index.js';
import { handleSettingsAction, unreferencedGeneratedImageIds } from '../src/visual/igs-ui/settings-actions.js';
import { renderGeneratedAssetPane } from '../src/visual/igs-ui/settings-fields.js';
import { normalizeGeneratedLibrary, transferGeneratedLibraryEntry } from '../src/scene/asset-match.js';

const PRESET_KEY = 'igs:scene-presets:v1';
const enc = encodeURIComponent;
const libA = () => ({ scenes: { 教室: { url: 'igs-gen:bg-a', words: ['课室'], times: {} } }, characters: { 雪乃: { 默认: 'igs-gen:sp-a' } }, characterAliases: { 雪乃: ['雪之下'] } });
const libB = () => ({ scenes: {}, characters: { 塞拉菲娜: { 默认: 'igs-gen:sp-b' } }, characterAliases: { 塞拉菲娜: [] } });

function createCtx() {
    const storage = createMemoryStorage();
    storage.setItem(PRESET_KEY, JSON.stringify({ version: 1, active: '卡A', presets: {
        卡A: { scenes: {}, characters: {}, characterAliases: {}, generated: libA() },
        卡B: { scenes: {}, characters: {}, characterAliases: {}, generated: libB() },
        旧预设: { scenes: {}, characters: {}, characterAliases: {} },
    } }));
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: {}, characters: {}, characterAliases: {}, moodGroups: [], generated: libA() } }, readerSettings: {} };
    const alerts = [];
    let persistOk = true;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: { scenePresetName: '卡A', expandedSpriteSlots: new Set() } } },
        options: { global: { localStorage: storage, confirm: () => true, prompt: () => '', alert: (m) => alerts.push(m) } },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => (persistOk ? { ok: true } : { ok: false, reason: 'boom' }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, storage, alerts, sa: () => draft.bridge.sceneAssets, presets: () => JSON.parse(storage.getItem(PRESET_KEY)).presets, failPersist: () => { persistOk = false; } };
}

test('gate:preset:transfer-pure-function-copies-with-aliases-and-blocks-duplicates', () => {
    const copied = transferGeneratedLibraryEntry(libA(), libB(), 'sprite', '雪乃');
    assert.equal(copied.ok, true);
    assert.deepEqual(copied.target.characters.雪乃, { 默认: 'igs-gen:sp-a' });
    assert.deepEqual(copied.target.characterAliases.雪乃, ['雪之下']);
    assert.deepEqual(copied.source, normalizeGeneratedLibrary(libA()), '复制不改来源');
    const moved = transferGeneratedLibraryEntry(libA(), undefined, 'background', '教室', { move: true });
    assert.deepEqual(Object.keys(moved.source.scenes), []);
    assert.deepEqual(moved.target.scenes.教室.words, ['课室']);
    assert.equal(transferGeneratedLibraryEntry(libA(), libA(), 'sprite', '雪乃').reason, 'name-exists');
    assert.equal(transferGeneratedLibraryEntry(libA(), libB(), 'sprite', '不存在').reason, 'not-found');
});

test('gate:preset:copy-generated-to-other-preset-keeps-current-library', async () => {
    const t = createCtx();
    await handleSettingsAction(`gen-lib-transfer:copy:sprite:${enc('雪乃')}:${enc('卡B')}`, t.ctx);
    assert.deepEqual(Object.keys(t.presets().卡B.generated.characters).sort(), ['塞拉菲娜', '雪乃']);
    assert.deepEqual(t.presets().卡B.generated.characterAliases.雪乃, ['雪之下']);
    assert.ok(t.sa().generated.characters.雪乃, '复制后当前库仍保留');

    await handleSettingsAction(`gen-lib-transfer:copy:sprite:${enc('雪乃')}:${enc('卡B')}`, t.ctx);
    assert.equal(t.alerts.length, 1, '目标已有同名条目时阻止并提示');

    await handleSettingsAction(`gen-lib-transfer:move:sprite:${enc('雪乃')}:${enc('卡A')}`, t.ctx);
    assert.ok(t.sa().generated.characters.雪乃, '不能移到当前预设自身');
});

test('gate:preset:move-generated-to-legacy-preset-creates-library-and-keeps-image', async () => {
    const t = createCtx();
    await handleSettingsAction(`gen-lib-transfer:move:background:${enc('教室')}:${enc('旧预设')}`, t.ctx);
    assert.deepEqual(Object.keys(t.presets().旧预设.generated.scenes), ['教室'], '旧预设先建空库再写入');
    assert.equal(t.sa().generated.scenes.教室, undefined, '当前库移除');
    assert.equal(t.presets().卡A.generated.scenes.教室, undefined, '当前预设已存的库同步移除');
    assert.deepEqual(unreferencedGeneratedImageIds(['bg-a'], t.sa(), t.storage), [], '图片仍被目标预设引用，不会被删');
});

test('gate:preset:move-generated-rolls-back-current-library-when-persist-fails', async () => {
    const t = createCtx();
    t.failPersist();
    await handleSettingsAction(`gen-lib-transfer:move:sprite:${enc('雪乃')}:${enc('卡B')}`, t.ctx);
    assert.ok(t.sa().generated.characters.雪乃, '持久化失败时恢复当前库');
    assert.ok(t.presets().卡B.generated.characters.雪乃, '目标预设保留副本，不丢素材');
});

test('gate:preset:generated-pane-renders-transfer-select-for-other-presets-only', () => {
    const html = renderGeneratedAssetPane({ library: libA(), presetNames: ['卡A', '卡B'], currentPreset: '卡A' });
    assert.match(html, /data-gen-transfer="sprite" data-gen-name="雪乃"/);
    assert.match(html, new RegExp(`value="move:${enc('卡B')}"`));
    assert.match(html, new RegExp(`value="copy:${enc('卡B')}"`));
    assert.doesNotMatch(html, new RegExp(`:${enc('卡A')}"`));
    assert.doesNotMatch(renderGeneratedAssetPane({ library: libA(), presetNames: ['卡A'], currentPreset: '卡A' }), /data-gen-transfer/);
});
