import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateOriginalOutfits, promoteOutfitToOriginal, migrationRowOf, splitMigrationWords } from '../src/scene/outfit-migration.js';
import { handleOutfitAction } from '../src/visual/igs-ui/settings-outfit-actions.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';
import { renderMigrateEntry, renderCharacterSlotTabs } from '../src/visual/igs-ui/settings-outfit-fields.js';
import { migrateSpriteSystem } from '../src/scene/sprite-system-migration.js';
import { resolveSpriteAsset } from '../src/scene/asset-match.js';
import { effectiveSceneAssets } from '../src/scene/asset-scope.js';
import { normalizeSceneAssets } from '../src/visual/igs-ui/settings-host-normalize.js';
import { collectImageReferences } from '../src/media/image-references.js';
import { bootstrapIGS } from '../src/index.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { singleCharacterContext } from '../src/generated-images/illustration/character-prompt-task.js';
import { createExpressionNotesFile } from '../src/storage/expression-notes-file.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { prepareSpriteMigration, SPRITE_MIGRATION_JOURNAL } from '../src/storage/sprite-migration-journal.js';
import { readLegacyIgsSettings } from '../src/storage/legacy-igs.js';
import { resolveSpriteOutfit } from '../src/scene/character-outfits.js';

const clone = value => structuredClone(value);
function memoryStorage(seed, fail = () => false) {
    const rows = new Map(Object.entries(seed)), writes = [];
    return { rows, writes, get length() { return rows.size; }, key: i => [...rows.keys()][i] ?? null,
        getItem: key => rows.get(key) ?? null, removeItem: key => rows.delete(key),
        setItem(key, value) { if (fail(key)) throw new Error('fixture quota'); rows.set(key, String(value)); writes.push(key); } };
}
const boot = storage => bootstrapIGS({ global: {}, storage, autoAttachMagicWand: false, tavernSettingsSync: false });

test('sprite-migration: 旧 DNA 衣装线索保持原显示，明确选新默认或升级后不再覆盖', () => {
    const assets = migrateSpriteSystem({ characters: { A: { 默认: 'igs-gen:old' } },
        characterDna: { A: { identity: 'old', defaultAppearance: 'wears 校服' } },
        characterOutfits: { A: { 校服: { words: [], moods: { 平和: 'igs-gen:school' } } } } }).sceneAssets;
    const read = () => resolveSpriteOutfit({ character: 'A', directives: [], sceneAssets: assets });
    assert.equal(read().outfit, '校服');
    assets.characterDefaultOutfits.A = { version: 1, outfitName: 'A·初始衣装' };
    assert.equal(read().outfit, '');
    assets.characterDefaultOutfits.A.migrated = true;
    assets.characterDna.A.version = 2;
    assert.equal(read().outfit, '');
});

test('sprite-migration: 只有衣柜图的角色也走新解析，不猜测用户的默认选择', () => {
    const assets = { characters: { A: {} }, characterOutfits: { A: {
        校服: { words: [], moods: {}, base: 'igs-gen:uniform' },
        睡衣: { words: [], moods: { 平和: 'igs-gen:night' } },
    } } };
    const hit = resolveSpriteAsset('A', '没命中', { sceneAssets: assets }, '校服');
    assert.equal(hit.url, 'igs-gen:uniform');
    assert.equal(hit.source, 'user-outfit');
    assert.equal(hit.selectionSource, 'requested');
    assert.equal(assets.characterDefaultOutfits, undefined);
});

test('sprite-migration: 中断留下半新配置时先回滚，恢复失败保留日志，之后可完整重迁', async () => {
    const bridge = JSON.stringify({ sceneAssets: { characters: { A: { 默认: 'igs-gen:old' } } } });
    const reader = JSON.stringify({ spriteLayouts: { 'pc::A::默认': { posX: 9 } } });
    let blocked = false;
    const storage = memoryStorage({ igs_bridge_config: bridge, 'igs-reader-settings-v9-default': reader },
        key => blocked && key === 'igs_bridge_config');
    prepareSpriteMigration(storage, [{ key: 'igs_bridge_config', previous: bridge },
        { key: 'igs-reader-settings-v9-default', previous: reader }]);
    storage.setItem('igs_bridge_config', JSON.stringify({ sceneAssets: migrateSpriteSystem(JSON.parse(bridge).sceneAssets).sceneAssets }));
    blocked = true;
    assert.equal(readLegacyIgsSettings(storage).ok, false);
    assert.ok(storage.getItem(SPRITE_MIGRATION_JOURNAL));
    blocked = false;
    const recovered = readLegacyIgsSettings(storage);
    assert.equal(recovered.bridge.sceneAssets.characters.A.默认, 'igs-gen:old');
    assert.equal(storage.getItem('igs-reader-settings-v9-default'), reader);
    assert.equal(storage.getItem(SPRITE_MIGRATION_JOURNAL), null);
    const api = boot(storage);
    try {
        const next = api.getUnifiedSettings();
        assert.equal(next.bridge.sceneAssets.characterOutfits.A['A·初始衣装'].base, 'igs-gen:old');
        assert.deepEqual(next.readerSettings.spriteLayouts['pc::A|A·初始衣装::默认'], { posX: 9 });
    } finally { await api.shutdown(); }
});

test('sprite-migration: 首次文件备份成功后才移除设置里的续画备份', async () => {
    const storage = memoryStorage({ igs_bridge_config: JSON.stringify({ sceneAssets: {
        characters: { A: { 默认: 'igs-gen:old' } }, generated: { expressionNotes: {
            A: { 喜悦: { positive: 'preserved' } } } } } }) });
    const uploaded = new Map();
    const global = { localStorage: storage,
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({}) }) },
        async fetch(url, init) {
            if (url === '/api/files/upload') {
                const payload = JSON.parse(init.body);
                uploaded.set(payload.name, JSON.parse(Buffer.from(payload.data, 'base64').toString()));
                return { ok: true, json: async () => ({ path: `/user/files/${payload.name}` }) };
            }
            assert.match(String(url), /^\/user\/files\//, '迁移不得访问生图接口');
            return { ok: false, status: 404 };
        },
    };
    const api = bootstrapIGS({ global, autoAttachMagicWand: false });
    try {
        assert.equal(JSON.parse(storage.getItem('igs_bridge_config')).sceneAssets.spriteMigrationNotesPending, true);
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline && !uploaded.has('igs-expression-notes.json'))
            await new Promise(resolve => setTimeout(resolve, 25));
        assert.equal(uploaded.get('igs-expression-notes.json')?.notes['A\u0001A·初始衣装'].喜悦.positive, 'preserved');
        await new Promise(resolve => setTimeout(resolve, 0));
        const saved = JSON.parse(storage.getItem('igs_bridge_config')).sceneAssets;
        assert.equal(saved.spriteMigrationNotesPending, false);
        assert.equal(saved.generated.expressionNotes, undefined);
        assert.equal(api.getUnifiedSettings().bridge.sceneAssets.generated.expressionNotes['A\u0001A·初始衣装'].喜悦.positive, 'preserved');
    } finally { await api.shutdown(); }
});

function createCtx(assets = {}) {
    const alerts = [];
    const state = {
        activeSettings: {
            tab: 'scene',
            asyncState: {},
            draft: {
                bridge: {
                    sceneAssets: {
                        characters: {},
                        characterAliases: {},
                        characterOutfits: {},
                        wardrobe: {},
                        moodGroups: [{ label: '平和', words: ['平和'] }],
                        generated: { characters: {}, expressionNotes: {} },
                        ...assets,
                    },
                },
                readerSettings: { spriteLayouts: {}, spriteHeads: {} },
            },
        },
    };
    let persisted = 0;
    const ctx = {
        state,
        settingsState: state.activeSettings,
        options: { global: { alert: (m) => alerts.push(m) } },
        persistSettingsDraft: () => { persisted++; return { ok: true }; },
        rerenderSettings: () => ({ ok: true, rerendered: true }),
    };
    return { ctx, state, alerts, persisted: () => persisted, sa: () => state.activeSettings.draft.bridge.sceneAssets, rs: () => state.activeSettings.draft.readerSettings };
}
