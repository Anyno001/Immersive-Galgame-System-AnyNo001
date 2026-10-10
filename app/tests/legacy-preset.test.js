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

function makeCtx({ card = '小雪', confirms = [], prompts = [], sceneAssets = {} } = {}) {
    const storage = memoryStorage();
    const draft = { bridge: { sceneAssets: { enabled: true, ...sceneAssets } }, readerSettings: {} };
    const alerts = [];
    const global = {
        localStorage: storage,
        alert: (text) => alerts.push(text),
        SillyTavern: card ? { getContext: () => ({ characterId: 0, characters: [{ name: card }], name2: card }) } : undefined,
    };
    const answers = [...confirms];
    const typed = [...prompts];
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global },
        dialogs: { confirm: async () => (answers.length ? answers.shift() : true), prompt: async () => (typed.length ? typed.shift() : '') },
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

// 新增角色 / 场景先弹框问名字：默认填最小的空闲编号，取消不建，同名、别名冲突不覆盖。
test('gate:settings-actions:new-character-and-scene-ask-for-a-name', async () => {
    const { ctx, draft, alerts } = makeCtx({ card: '', sceneAssets: {
        characters: { 角色1: { 默认: '' }, 角色3: { 默认: 'keep.png' } },
        characterAliases: { 角色1: ['小林'] },
        scenes: { 场景2: { url: 'keep.png', times: {} } },
    } });
    const asked = [];
    const typed = ['小雪', '', '角色3', '小林', '天台', '场景2'];
    ctx.dialogs.prompt = async (message, value) => { asked.push(value); return typed.shift(); };
    for (let i = 0; i < 4; i += 1) await handleSettingsAction('scene-add-char', ctx);
    const assets = draft.bridge.sceneAssets;
    assert.deepEqual(Object.keys(assets.characters), ['角色1', '角色3', '小雪']);
    assert.equal(assets.characters.角色3.默认, 'keep.png', '同名不覆盖');
    assert.deepEqual(assets.characterAliases.小雪, []);
    assert.equal(asked[0], '角色2', '默认名取最小的空闲编号');
    assert.equal(ctx.state.activeSettings.asyncState.advancedOpen['char-open:小雪'], true, '新角色卡直接展开');
    await handleSettingsAction('scene-add-bg', ctx);
    await handleSettingsAction('scene-add-bg', ctx);
    assert.deepEqual(Object.keys(assets.scenes), ['场景2', '天台']);
    assert.equal(assets.scenes.场景2.url, 'keep.png');
    assert.equal(asked[4], '场景1');
    assert.equal(alerts.length, 3);
    assert.match(alerts[0], /角色「角色3」已存在/);
    assert.match(alerts[1], /「小林」已是角色「角色1」的别名/);
    assert.match(alerts[2], /场景「场景2」已存在/);
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

test('preset: 全局和存时那张卡分开记；套用各回各层，在别的卡套用也不会塞进别的卡', async () => {
    const { loadLegacyPresets } = await import('../src/scene/legacy-preset.js');
    const { ctx, draft, storage } = makeCtx({
        // 存预设不问；第一次套用先取消再确认；在 B 卡再套一次确认；删除确认。
        confirms: [false, true, true, true],
        prompts: ['学园', '新学园'],
        sceneAssets: {
            scenes: { 教室: { url: 'g-room' } },
            characters: { 林: { 默认: 'lin' } },
            cards: { 'card:小雪': { scenes: { 小雪的房间: { url: 'c-room' } }, characters: { 小雪: { 默认: 'snow' } } } },
        },
    });
    const root = draft.bridge.sceneAssets;
    await handleSettingsAction('preset-save', ctx);
    const saved = loadLegacyPresets(storage).学园;
    assert.deepEqual(Object.keys(saved.scenes), ['教室'], '顶层只记全局');
    assert.deepEqual(Object.keys(saved.scopeCards['card:小雪'].library.scenes), ['小雪的房间'], '本卡部分记在小雪名下');

    root.scenes = { 海边: { url: 'beach' } };
    root.cards['card:小雪'].scenes = {};
    await handleSettingsAction(`preset-apply:${encodeURIComponent('学园')}`, ctx);
    assert.deepEqual(Object.keys(root.scenes), ['海边'], '取消后不动');
    await handleSettingsAction(`preset-apply:${encodeURIComponent('学园')}`, ctx);
    assert.deepEqual(Object.keys(root.scenes), ['教室'], '全局回全局');
    assert.deepEqual(Object.keys(root.cards['card:小雪'].scenes), ['小雪的房间'], '本卡部分回小雪');
    assert.deepEqual(Object.keys(loadLegacyPresets(storage)['套用前备份 · 学园'].scenes), ['海边'], '原来那两层先存成备份');

    // 换到 B 卡再套用：小雪的东西回小雪，B 卡不变。
    ctx.options.global.SillyTavern = { getContext: () => ({ characterId: 0, characters: [{ name: '阿B' }], name2: '阿B' }) };
    root.cards['card:小雪'].scenes = {};
    root.cards['card:阿B'] = { scenes: { B的屋子: { url: 'b' } }, characters: {} };
    await handleSettingsAction(`preset-apply:${encodeURIComponent('学园')}`, ctx);
    assert.deepEqual(Object.keys(root.cards['card:小雪'].scenes), ['小雪的房间']);
    assert.deepEqual(Object.keys(root.cards['card:阿B'].scenes), ['B的屋子'], '别的卡不受影响');

    await handleSettingsAction(`preset-rename:${encodeURIComponent('学园')}`, ctx);
    assert.ok(loadLegacyPresets(storage).新学园);
    assert.equal(loadLegacyPresets(storage).学园, undefined);
    await handleSettingsAction(`preset-delete:${encodeURIComponent('新学园')}`, ctx);
    assert.equal(loadLegacyPresets(storage).新学园, undefined);
    assert.deepEqual(Object.keys(root.scenes), ['教室'], '删预设不动素材');
});

test('gate:preset:overwrite-confirmed-target-only-preserves-card-and-folder-snapshot', async () => {
    const { ctx, draft, storage } = makeCtx({
        confirms: [false, true],
        sceneAssets: {
            scenes: { 新场景: { url: 'new' } },
            cards: { 'card:小雪': { scenes: { 小雪房间: { url: 'snow' } }, characters: {} } },
        },
    });
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 旧预设: oldPreset(), 另一份: oldPreset() } }));
    saveAssetFolders(storage, '', normalizeAssetFolders({ scenes: { folders: ['新'], assign: { 新场景: '新' } } }));
    saveAssetFolders(storage, 'card:小雪', normalizeAssetFolders({ scenes: { folders: ['房间'], assign: { 小雪房间: '房间' } } }));
    const before = storage.getItem(LEGACY_PRESET_KEY);
    const command = `preset-overwrite:${encodeURIComponent('旧预设')}`;
    await handleSettingsAction(command, ctx);
    assert.equal(storage.getItem(LEGACY_PRESET_KEY), before, '取消时预设存储不变');
    await handleSettingsAction(command, ctx);
    const saved = loadLegacyPresets(storage);
    assert.deepEqual(Object.keys(saved).sort(), ['另一份', '旧预设'].sort());
    assert.deepEqual(saved.另一份, oldPreset(), '另一份不被覆盖');
    assert.deepEqual(Object.keys(saved.旧预设.scenes), ['新场景']);
    assert.deepEqual(Object.keys(saved.旧预设.scopeCards['card:小雪'].library.scenes), ['小雪房间']);
    assert.equal(loadAssetFolders(storage, '旧预设').scenes.assign.新场景, '新');
    assert.equal(loadAssetFolders(storage, '旧预设\u0001card:小雪').scenes.assign.小雪房间, '房间');
    assert.deepEqual(Object.keys(draft.bridge.sceneAssets.scenes), ['新场景'], '覆盖预设不套用到当前素材');
});


test('preset: 旧版不分层的预设仍然选套到本卡或全局，整层替换', async () => {
    const { ctx, draft, storage } = makeCtx({
        confirms: [true, true],
        sceneAssets: { scenes: { 海边: { url: 'beach' } }, cards: { 'card:小雪': { scenes: { 卧室: { url: 'bed' } }, characters: {} } } },
    });
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 现代: oldPreset() } }));
    const root = draft.bridge.sceneAssets;
    await handleSettingsAction(`preset-apply:${encodeURIComponent('现代')}:card`, ctx);
    assert.deepEqual(Object.keys(root.cards['card:小雪'].scenes).sort(), Object.keys(oldPreset().scenes).sort());
    assert.deepEqual(Object.keys(root.scenes), ['海边'], '套到本卡不动全局');
    await handleSettingsAction(`preset-apply:${encodeURIComponent('现代')}:global`, ctx);
    assert.deepEqual(Object.keys(root.scenes).sort(), Object.keys(oldPreset().scenes).sort());
});

test('preset: 导出把引用的生成图一起打进压缩包，清了本机再导入，图和预设都回来', async () => {
    const PNG = 'data:image/png;base64,iVBORw0KGgo=';
    const JPG = 'data:image/jpeg;base64,/9j/4AAQ';
    const { ctx, storage, alerts } = makeCtx({
        prompts: ['HP', 'HP'],
        sceneAssets: {
            scenes: { 对角巷: { url: 'igs-gen:alley', times: { 上午: { url: 'igs-gen:alley' } } }, 外链: { url: 'https://img/x' } },
            cards: { 'card:小雪': { characters: { 哪吒: { 默认: 'igs-gen:nezha', 丢了: 'igs-gen:gone' } } } },
        },
    });
    const images = new Map([
        ['alley', { id: 'alley', type: 'background', dataUrl: JPG, createdAt: 't' }],
        ['nezha', { id: 'nezha', type: 'sprite', dataUrl: PNG, originalDataUrl: PNG, revision: 2 }],
    ]);
    ctx.options.generatedAssets = {
        readStoredImage: async (id) => (images.has(id) ? structuredClone(images.get(id)) : null),
        writeStoredImage: async (record) => { images.set(record.id, structuredClone(record)); return { ok: true }; },
    };
    let downloaded = null;
    let picked = null;
    const global = ctx.options.global;
    global.Blob = Blob;
    global.URL = { createObjectURL: (blob) => { downloaded = blob; return 'blob:x'; }, revokeObjectURL() {} };
    global.document = {
        body: { appendChild() {}, removeChild() {} },
        createElement: (tag) => (tag === 'input'
            ? { click() { setTimeout(() => { this.files = [picked]; this.onchange(); }); } }
            : { click() {} }),
    };
    const RealFileReader = globalThis.FileReader;
    globalThis.FileReader = class {
        readAsArrayBuffer(file) { this.onload({ target: { result: file.bytes.buffer } }); }
    };
    try {
        await handleSettingsAction('preset-save', ctx);
        const result = await handleSettingsAction(`preset-export:${encodeURIComponent('HP')}`, ctx);
        assert.equal(result.fileName, 'HP.zip');
        assert.equal(result.images, 2);
        assert.equal(result.missing, 1);
        assert.match(alerts.at(-1), /1 张图片在本机未找到/);

        // 模拟清了浏览器数据：图和预设都没了。
        images.clear();
        storeLegacyPresets(storage, {});
        storage.removeItem(LEGACY_PRESET_KEY);
        picked = { name: 'HP.zip', bytes: new Uint8Array(await downloaded.arrayBuffer()) };
        await handleSettingsAction('preset-import', ctx);
        assert.equal(images.get('alley').dataUrl, JPG);
        assert.equal(images.get('nezha').originalDataUrl, PNG, '原图也带回来');
        assert.equal(images.get('nezha').revision, 2);
        const back = loadLegacyPresets(storage).HP;
        assert.equal(back.scenes.对角巷.url, 'igs-gen:alley');
        assert.equal(back.scopeCards['card:小雪'].library.characters.哪吒.默认, 'igs-gen:nezha');
    } finally {
        globalThis.FileReader = RealFileReader;
    }
});

test('asset scope: 角色可以在本卡和全局之间挪，别的卡的角色不动', async () => {
    const { ctx, draft } = makeCtx({ sceneAssets: { characters: { 莉莉: { 默认: 'global-lily' } }, characterAliases: { 莉莉: ['莉'] }, cards: { 'card:A': { characters: { 悟: { 默认: 'a' } } } } } });
    await handleSettingsAction('asset-move:characters:%E8%8E%89%E8%8E%89', ctx);
    const root = draft.bridge.sceneAssets;
    assert.equal(root.characters.莉莉, undefined);
    assert.equal(root.cards['card:小雪'].characters.莉莉.默认, 'global-lily');
    assert.deepEqual(root.cards['card:小雪'].characterAliases.莉莉, ['莉']);
    assert.equal(root.cards['card:A'].characters.悟.默认, 'a');
});

test('asset scope: 删除角色只问这一份，不提所有卡共用', async () => {
    const asked = [];
    const { ctx, draft } = makeCtx({ sceneAssets: { cards: { 'card:小雪': { characters: { 莉莉: { 默认: 'mine' } } }, 'card:A': { characters: { 悟: { 默认: 'a' } } } } } });
    ctx.dialogs.confirm = async (text) => { asked.push(text); return false; };
    await handleSettingsAction('scene-remove-char:%E8%8E%89%E8%8E%89', ctx);
    const text = asked.pop();
    assert.match(text, /删除角色「莉莉」/);
    assert.doesNotMatch(text, /其他角色卡也将无法使用/);
    assert.equal(draft.bridge.sceneAssets.cards['card:小雪'].characters.莉莉.默认, 'mine');
    assert.equal(draft.bridge.sceneAssets.cards['card:A'].characters.悟.默认, 'a');
});
