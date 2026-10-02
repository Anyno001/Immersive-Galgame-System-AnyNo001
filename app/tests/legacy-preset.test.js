import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSettingsAction, assetEditTarget } from '../src/visual/igs-ui/settings-actions.js';
import { assetOwnerKey, draftAssetLibrary, effectiveSceneAssets } from '../src/scene/asset-scope.js';
import { LEGACY_PRESET_KEY, isLegacyPresetData, legacyPresetToPack, loadLegacyPresets, mergeLegacyLibrary, storeLegacyPresets } from '../src/scene/legacy-preset.js';
import { loadAssetFolders, saveAssetFolders, normalizeAssetFolders } from '../src/visual/igs-ui/asset-folders.js';

function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// 和旧版「现代」预设导出文件同样的结构（字段取自用户的 现代(6).json）。
function oldPreset() {
    return {
        scenes: { 卧室: { url: 'https://img/bedroom', times: {}, words: ['家中主卧'] }, 拉面馆: { url: 'https://img/ramen', times: {} } },
        characters: { 敖丙: { 默认: 'https://img/ao', 自信: 'https://img/ao-proud' }, 洛斯莉: { 默认: 'https://img/ros' } },
        characterAliases: { 敖丙: ['丙'], 洛斯莉: [] },
        characterDna: {},
        characterOutfits: { 敖丙: { 校服: { words: ['制服'], moods: { 默认: '', 自信: 'https://img/ao-uniform' } } } },
        moodGroups: [{ label: '自信', words: ['自信', '得意'] }],
        timeGroups: [{ label: '夜晚', words: ['夜晚', '深夜'] }],
        weatherGroups: [],
        ancient: false,
        spriteLayouts: { 'embedded::敖丙::默认': { x: 10 } },
        spriteHeads: { 洛斯莉: { y: 0.2 } },
        statusAvatars: { 洛斯莉: 'https://img/ros-avatar' },
    };
}

function makeCtx({ card = '小雪', confirms = [], sceneAssets = {} } = {}) {
    const storage = memoryStorage();
    const draft = { bridge: { sceneAssets: { enabled: true, ...sceneAssets } }, readerSettings: {} };
    const alerts = [];
    const global = {
        localStorage: storage,
        alert: (text) => alerts.push(text),
        SillyTavern: card ? { getContext: () => ({ characterId: 0, characters: [{ name: card }], name2: card }) } : undefined,
    };
    const answers = [...confirms];
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global },
        dialogs: { confirm: async () => (answers.length ? answers.shift() : true), prompt: async () => '' },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, draft, storage, alerts };
}

test('legacy preset: 旧版预设文件能认出来，转换后一样不少', () => {
    const data = oldPreset();
    assert.equal(isLegacyPresetData(data), true);
    assert.equal(isLegacyPresetData({ format: 'igs-card-pack', scenes: {} }), false);
    assert.equal(isLegacyPresetData([]), false);
    const pack = legacyPresetToPack(data);
    assert.deepEqual(pack.library.scenes, data.scenes);
    assert.deepEqual(pack.library.characters, data.characters);
    assert.deepEqual(pack.library.characterAliases, data.characterAliases);
    assert.deepEqual(pack.library.statusAvatars, data.statusAvatars);
    assert.equal(pack.library.characterOutfits.敖丙.校服.moods.自信, 'https://img/ao-uniform');
    assert.deepEqual(pack.spriteLayouts, data.spriteLayouts);
    assert.equal(pack.worldview, 'modern', '只有 ancient:false 的旧文件按现代');
});

test('legacy preset: 合并只换同名，原有其他条目保留', () => {
    const target = { scenes: { 教室: { url: 'mine' }, 卧室: { url: 'old' } }, characters: { 林: { 默认: 'lin' } } };
    mergeLegacyLibrary(target, legacyPresetToPack(oldPreset()));
    assert.equal(target.scenes.教室.url, 'mine');
    assert.equal(target.scenes.卧室.url, 'https://img/bedroom');
    assert.deepEqual(Object.keys(target.characters).sort(), ['林', '敖丙', '洛斯莉'].sort());
});

test('legacy preset: 浏览器里留着的旧预设能读出来，旧配置带的预设能存回去', () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 现代: oldPreset(), 坏的: 5 }, active: '现代' }));
    assert.deepEqual(Object.keys(loadLegacyPresets(storage)), ['现代']);
    assert.deepEqual(storeLegacyPresets(storage, { 古风: { scenes: { 庭院: { url: 'y' } } } }), { ok: true, count: 1 });
    assert.deepEqual(Object.keys(loadLegacyPresets(storage)).sort(), ['古风', '现代'].sort());
    assert.equal(JSON.parse(storage.getItem(LEGACY_PRESET_KEY)).active, '现代');
});

test('legacy preset: 从素材页找回旧预设，放进本卡，词库、立绘位置、文件夹都跟过来', async () => {
    const { ctx, draft, storage } = makeCtx({ confirms: [true, true], sceneAssets: { scenes: { 教室: { url: 'global' } } } });
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 现代: oldPreset() }, active: '现代' }));
    saveAssetFolders(storage, '现代', normalizeAssetFolders({ scenes: { folders: ['家'], assign: { 卧室: '家' } } }));
    await handleSettingsAction(`legacy-preset-restore:${encodeURIComponent('现代')}`, ctx);
    const root = draft.bridge.sceneAssets;
    const card = root.cards['card:小雪'];
    assert.equal(card.scenes.卧室.url, 'https://img/bedroom');
    assert.equal(card.characters.敖丙.自信, 'https://img/ao-proud');
    assert.equal(card.worldview, 'modern');
    assert.equal(root.scenes.教室.url, 'global', '全局没被动');
    assert.equal(draft.readerSettings.spriteLayouts['embedded::敖丙::默认'].x, 10);
    assert.ok(root.timeGroups.some((group) => group.label === '夜晚'));
    assert.equal(loadAssetFolders(storage, 'card:小雪').scenes.assign.卧室, '家');
    const effective = effectiveSceneAssets(root, 'card:小雪');
    assert.deepEqual(Object.keys(effective.scenes).sort(), ['卧室', '拉面馆', '教室'].sort());
});

test('legacy preset: 选「放进全局」后再取消，什么都不写', async () => {
    const { ctx, draft } = makeCtx({ confirms: [false, false] });
    const { storage } = { storage: ctx.options.global.localStorage };
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 现代: oldPreset() } }));
    await handleSettingsAction(`legacy-preset-restore:${encodeURIComponent('现代')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.scenes, undefined);
    assert.equal(draft.bridge.sceneAssets.cards, undefined);
});

test('legacy preset: 没打开角色卡时直接进全局', async () => {
    const { ctx, draft, storage } = makeCtx({ card: '', confirms: [true] });
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 现代: oldPreset() } }));
    await handleSettingsAction(`legacy-preset-restore:${encodeURIComponent('现代')}`, ctx);
    assert.equal(draft.bridge.sceneAssets.scenes.拉面馆.url, 'https://img/ramen');
    assert.equal(draft.bridge.sceneAssets.cards, undefined);
});

test('asset scope: 改哪条写回它所在的一边，新建进本卡', () => {
    const root = { scenes: { 教室: {} }, characters: { 林: {} }, cards: { 'card:小雪': { scenes: { 天台: {} }, characters: {} } } };
    assert.equal(assetOwnerKey(root, 'card:小雪', ['scenes'], '教室'), '');
    assert.equal(assetOwnerKey(root, 'card:小雪', ['scenes'], '天台'), 'card:小雪');
    assert.equal(assetOwnerKey(root, 'card:小雪', ['scenes'], '新场景'), 'card:小雪');
    assert.equal(assetOwnerKey(root, '', ['scenes'], '天台'), '');
    const settingsState = { draft: { bridge: { sceneAssets: root } }, asyncState: { assetScopeKey: 'card:小雪' } };
    assert.equal(draftAssetLibrary(settingsState, { collections: ['scenes'], name: '教室' }), root);
    assert.equal(draftAssetLibrary(settingsState, { collections: ['scenes'], name: '天台' }), root.cards['card:小雪']);
    assert.equal(draftAssetLibrary(settingsState), root.cards['card:小雪']);
});

test('asset scope: 从 action 认出改的是哪个场景、角色或生成素材', () => {
    assert.deepEqual(assetEditTarget('scene-set-bg-url:%E6%95%99%E5%AE%A4:https://x'), { collections: ['scenes'], name: '教室' });
    assert.deepEqual(assetEditTarget('scene-add-mood:%E6%9E%97').name, '林');
    assert.ok(assetEditTarget('status-avatar-clear:%E6%9E%97').collections.includes('statusAvatars'));
    assert.deepEqual(assetEditTarget('gen-lib-remove:background:%E5%A4%A9%E5%8F%B0'), { collections: ['generated.scenes'], name: '天台' });
    assert.equal(assetEditTarget('scene-add-bg'), null);
});

test('asset scope: 改全局里的场景不会在本卡多出一份', async () => {
    const { ctx, draft } = makeCtx({ sceneAssets: { scenes: { 教室: { url: 'old', times: {} } } } });
    await handleSettingsAction('scene-set-bg-url:%E6%95%99%E5%AE%A4:https://new', ctx);
    const root = draft.bridge.sceneAssets;
    assert.equal(root.scenes.教室.url, 'https://new');
    assert.ok(!root.cards || !root.cards['card:小雪'] || !root.cards['card:小雪'].scenes || !root.cards['card:小雪'].scenes.教室);
});

test('asset scope: 点标签在本卡和全局之间挪，挪回全局遇到同名先问', async () => {
    const { ctx, draft } = makeCtx({ confirms: [false, true], sceneAssets: { scenes: { 教室: { url: 'global' } } } });
    await handleSettingsAction('asset-move:scenes:%E6%95%99%E5%AE%A4', ctx);
    const root = draft.bridge.sceneAssets;
    assert.equal(root.cards['card:小雪'].scenes.教室.url, 'global');
    assert.equal(root.scenes.教室, undefined);
    root.scenes.教室 = { url: 'other' };
    await handleSettingsAction('asset-move:scenes:%E6%95%99%E5%AE%A4', ctx);
    assert.equal(root.scenes.教室.url, 'other', '取消后不覆盖');
    await handleSettingsAction('asset-move:scenes:%E6%95%99%E5%AE%A4', ctx);
    assert.equal(root.scenes.教室.url, 'global');
    assert.equal(root.cards['card:小雪'].scenes.教室, undefined);
});

test('legacy preset: 旧预设引用的生成图不会被当成没人用删掉', async () => {
    const { unreferencedGeneratedImageIds } = await import('../src/visual/igs-ui/settings-actions.js');
    const storage = memoryStorage();
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 现代: { scenes: { 卧室: { url: 'igs-gen:keep', times: {} } } } } }));
    assert.deepEqual(unreferencedGeneratedImageIds(['keep', 'drop'], {}, storage), ['drop']);
});

test('asset scope: 一键把本卡全部放到全局，同名先问；再一键全收回本卡', async () => {
    const { ctx, draft } = makeCtx({
        confirms: [false, true, true],
        sceneAssets: {
            scenes: { 教室: { url: 'global' }, 天台: { url: 'global-roof' } },
            characters: { 林: { 默认: 'lin' } },
            cards: { 'card:小雪': { scenes: { 天台: { url: 'card-roof' }, 小雪的房间: { url: 'room' } }, characters: { 小雪: { 默认: 'snow' } }, characterOutfits: { 小雪: { 校服: { words: [], moods: {} } } } } },
        },
    });
    const root = draft.bridge.sceneAssets;
    await handleSettingsAction('asset-move-all:scenes:global', ctx);
    assert.equal(root.scenes.天台.url, 'global-roof', '取消后不动');
    await handleSettingsAction('asset-move-all:scenes:global', ctx);
    assert.equal(root.scenes.天台.url, 'card-roof');
    assert.equal(root.scenes.小雪的房间.url, 'room');
    assert.deepEqual(Object.keys(root.cards['card:小雪'].scenes), []);
    await handleSettingsAction('asset-move-all:characters:card', ctx);
    const card = root.cards['card:小雪'];
    assert.deepEqual(Object.keys(card.characters).sort(), ['小雪', '林'].sort());
    assert.deepEqual(Object.keys(root.characters), []);
    assert.ok(card.characterOutfits.小雪.校服, '本来在卡里的服装还在');
});

test('asset scope: 筛选只记在界面状态里，不写设置', async () => {
    const { ctx, draft } = makeCtx();
    const before = JSON.stringify(draft);
    await handleSettingsAction('asset-filter:scenes:card', ctx);
    assert.equal(ctx.state.activeSettings.asyncState.assetScopeFilter.scenes, 'card');
    await handleSettingsAction('asset-filter:characters:bogus', ctx);
    assert.equal(ctx.state.activeSettings.asyncState.assetScopeFilter.characters, 'all');
    assert.equal(JSON.stringify(draft), before);
});

test('asset scope: 衣柜提示词也能按本卡 / 全局筛选，并整批迁移', async () => {
    const { ctx, draft } = makeCtx({
        confirms: [true, true],
        sceneAssets: {
            wardrobe: { 校服: { prompt: 'uniform' } },
            cards: { 'card:小雪': { wardrobe: { 睡衣: { prompt: 'pajamas' } } } },
        },
    });
    const root = draft.bridge.sceneAssets;
    await handleSettingsAction('asset-filter:wardrobe:card', ctx);
    assert.equal(ctx.state.activeSettings.asyncState.assetScopeFilter.wardrobe, 'card');
    await handleSettingsAction('asset-move-all:wardrobe:global', ctx);
    assert.deepEqual(Object.keys(root.wardrobe).sort(), ['校服', '睡衣'].sort());
    assert.deepEqual(Object.keys(root.cards['card:小雪'].wardrobe), []);
    await handleSettingsAction('asset-move-all:wardrobe:card', ctx);
    assert.deepEqual(Object.keys(root.cards['card:小雪'].wardrobe).sort(), ['校服', '睡衣'].sort());
    assert.deepEqual(Object.keys(root.wardrobe), []);
});

test('asset scope: 角色名旁的 DNA 画笔只开合编辑区，不写设置', async () => {
    const { ctx, draft } = makeCtx();
    const before = JSON.stringify(draft);
    await handleSettingsAction('scene-toggle-dna:%E5%B0%8F%E9%9B%AA', ctx);
    assert.equal(ctx.state.activeSettings.asyncState.advancedOpen['char-dna:小雪'], true);
    await handleSettingsAction('scene-toggle-dna:%E5%B0%8F%E9%9B%AA', ctx);
    assert.equal(ctx.state.activeSettings.asyncState.advancedOpen['char-dna:小雪'], false);
    assert.equal(JSON.stringify(draft), before);
});

test('asset scope: 打开角色卡时筛选旁一直有一键迁移，两个方向都在，没东西的那项不能点', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const global = { SillyTavern: { getContext: () => ({ name2: '小雪', characters: [] }) } };
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'scene', mode: 'pc' }).controller;
        controller.setValue('bridge.sceneAssets.enabled', true);
        controller.setValue('bridge.sceneAssets.scenes', { 教室: { url: '', times: {} } });
        const html = controller.switchSceneSubTab('scenes').html || controller.getSnapshot().html;
        assert.match(html, /data-asset-bulk="scenes"[\s\S]*?data-action="asset-move-all:scenes:global"[^>]*disabled[^>]*>本卡的 0 个全部放到全局</);
        assert.match(html, /data-action="asset-move-all:scenes:card" role="menuitem">全局的 1 个全部收进本卡</);
        assert.doesNotMatch(html, /列表里是这张卡实际会用的素材/);
        controller.close();
    } finally {
        vn.destroy();
    }
});
