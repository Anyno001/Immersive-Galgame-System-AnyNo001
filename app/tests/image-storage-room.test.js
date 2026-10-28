import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetGenerationService } from './helpers/media-fixtures.js';
import { createMemoryGeneratedAssetStore } from '../src/media/generated-asset-store.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { spriteDataReply } from './helpers/prompt-provenance.js';
import {
    checkImageStorageRoom, plannedImageCount, IMAGE_STORAGE_ESTIMATE_BYTES, IMAGE_STORAGE_FULL_MESSAGE, SETTINGS_STORAGE_FULL_MESSAGE,
} from '../src/media/image-storage-room.js';

const MB = 1024 * 1024;
const withEstimate = (estimate) => ({ navigator: { storage: { estimate: async () => estimate } } });

test('预检：estimate 不可用、报错或数值不可信时放行', async () => {
    assert.equal((await checkImageStorageRoom({}, 8)).ok, true);
    assert.equal((await checkImageStorageRoom({ navigator: {} }, 8)).ok, true);
    assert.equal((await checkImageStorageRoom({ navigator: { storage: {} } }, 8)).ok, true);
    assert.equal((await checkImageStorageRoom({ navigator: { storage: { estimate: async () => { throw new Error('denied'); } } } }, 8)).ok, true);
    for (const bad of [{}, { usage: 1 }, { quota: 0, usage: 0 }, { quota: NaN, usage: 1 }, { quota: 100 * MB, usage: -1 }, { quota: 100 * MB, usage: 'x' }]) {
        assert.equal((await checkImageStorageRoom(withEstimate(bad), 8)).ok, true, JSON.stringify(bad));
    }
    assert.equal((await checkImageStorageRoom(withEstimate({ quota: 1, usage: 1 }), 0)).ok, true, '没有要出的图不检查');
});

test('预检：剩余空间小于「单张估算 × 张数」才拦，刚好够则放行', async () => {
    const need = IMAGE_STORAGE_ESTIMATE_BYTES * 8;
    assert.equal((await checkImageStorageRoom(withEstimate({ quota: 100 * MB + need, usage: 100 * MB }), 8)).ok, true);
    const blocked = await checkImageStorageRoom(withEstimate({ quota: 100 * MB + need - 1, usage: 100 * MB }), 8);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'image-storage-full');
    assert.equal(blocked.error, IMAGE_STORAGE_FULL_MESSAGE);
    assert.equal((await checkImageStorageRoom(withEstimate({ quota: 100 * MB, usage: 100 * MB }), 1)).ok, false);
    assert.equal((await checkImageStorageRoom(withEstimate({ quota: 100 * MB, usage: 200 * MB }), 1)).ok, false, 'usage 超过 quota 也算不够');
});

test('预检：本地设置存储写不进占位就先拦，不等出完图再整批回滚', async () => {
    const quotaError = Object.assign(new Error('exceeded the quota'), { name: 'QuotaExceededError' });
    const keys = new Map();
    const full = { localStorage: {
        setItem(key, value) { if (key === 'igs:storage-room-probe') throw quotaError; keys.set(key, value); },
        removeItem(key) { keys.delete(key); },
    } };
    const blocked = await checkImageStorageRoom(full, 8);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'image-storage-full');
    assert.equal(blocked.error, SETTINGS_STORAGE_FULL_MESSAGE);
    const roomy = { localStorage: { setItem(key, value) { keys.set(key, value); }, removeItem(key) { keys.delete(key); } } };
    assert.equal((await checkImageStorageRoom(roomy, 8)).ok, true);
    assert.equal(keys.has('igs:storage-room-probe'), false, '占位试写完就删');
    const denied = { localStorage: { setItem() { throw new Error('SecurityError'); }, removeItem() {} } };
    assert.equal((await checkImageStorageRoom(denied, 8)).ok, true, '非配额错误不误拦');
});

test('预检：本地存储已满时报出谁占得最多，手机上无需控制台也能定位', async () => {
    const quotaError = Object.assign(new Error('exceeded the quota'), { name: 'QuotaExceededError' });
    const data = new Map([['igs:scene-presets:v1', 'x'.repeat(1024 * 1024)], ['other-plugin', 'y'.repeat(2048)]]);
    const full = { localStorage: {
        get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: key => data.get(key) ?? null,
        setItem(key) { if (key === 'igs:storage-room-probe') throw quotaError; }, removeItem() {},
    } };
    const blocked = await checkImageStorageRoom(full, 8);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.error.startsWith(SETTINGS_STORAGE_FULL_MESSAGE));
    assert.match(blocked.error, /素材预设 2\.0 MB/);
    assert.match(blocked.error, /最大：igs:scene-presets:v1 2\.0 MB/);
});

test('预检：按入口估算本批张数', () => {
    assert.equal(plannedImageCount('generateExpressionSet', { moods: ['a', 'b', 'c'] }), 3);
    assert.equal(plannedImageCount('generateExpressionSet', {}), 1);
    assert.equal(plannedImageCount('paintExpressionCaptions', { items: [1, 2] }), 2);
    assert.equal(plannedImageCount('generateExpressionImage', {}), 1);
    assert.equal(plannedImageCount('generateCharacterSprite', {}), 1);
    assert.equal(plannedImageCount('generateCharacterAvatar', {}), 1);
    assert.equal(plannedImageCount('writeWardrobePrompt', {}), 0, '写词入口不占图片空间');
    assert.equal(plannedImageCount('readStoredImage', {}), 0);
});

const lizard = (task, row) => [`slotid: ${row.slotId}`, `character: ${task.characters.find(c => c.token === row.tokens[0]).characterKey}`,
    'personality: wary,', 'dna_full_body: no humans, 1.2::lizard::, four legs,', 'dna_uc_full_body: ',
    'dna_half_body: no humans, 1.2::lizard::,', 'dna_uc_half_body: ', 'dna_portrait: no humans, 1.2::lizard::,', 'dna_uc_portrait: ',
    'pose: all fours,', 'pose_uc: jumping,'].join('\n');
function reply(input) {
    if (!input.characterContext?.some(c => c.dna?.creature || c.creature)) return spriteDataReply(input, { outfitDescription: 'wears a white dress' });
    if (input.outputs.format === 'sprite-data') return input.promptTask.slots.map(slot => lizard(input.promptTask, slot)).join('\n---\n');
    return input.outputs.rows.map(row => `slotid: ${row.slotId}\ncharacter: ${row.characterKey}\nexpression: roaring,\nexpression_uc: sleeping`).join('\n---\n');
}

function fixture(assets, { global, store = createMemoryGeneratedAssetStore() } = {}) {
    const h = builtinImageHarness({ reply });
    let n = 0;
    const service = createAssetGenerationService({ nai: h.backend, store, llm: h.llm,
        messageHost: { getChatId: () => 'room' }, getSettings: () => ({ ...h.bridge, sceneAssets: assets }),
        matte: async url => url, report: () => {}, newId: () => `r${++n}`, global });
    return { h, service, store };
}

const creatureAssets = () => ({ characters: {}, characterDna: { 怪: { creature: { form: 'beast' } } }, scenes: {} });

test('立绘：空间明显不足时一个请求也不发，并给出书面提示', async t => {
    const assets = creatureAssets();
    const { h, service } = fixture(assets, { global: withEstimate({ quota: 50 * MB, usage: 49 * MB }) });
    t.after(() => h.dispose());
    const result = await service.generateCharacterSprite({ name: '怪', dna: assets.characterDna.怪 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'image-storage-full');
    assert.equal(result.error, '图片缓存空间不足，已暂停生成。请先在备份中清理缓存。');
    assert.equal(h.writes.length, 0, '没有写词请求');
    assert.equal(h.wires.length, 0, '没有绘图请求');
});

test('表情差分：按整批张数预检，装不下不写词不出图', async t => {
    const assets = creatureAssets();
    // 剩 7MB：单张可以，整批 4 张（12MB）不行。
    const { h, service } = fixture(assets, { global: withEstimate({ quota: 100 * MB, usage: 93 * MB }) });
    t.after(() => h.dispose());
    const set = await service.generateExpressionSet({ name: '怪', moods: ['微笑', '愤怒', '哭泣', '不满'], dna: assets.characterDna.怪 });
    assert.equal(set.ok, false);
    assert.equal(set.reason, 'image-storage-full');
    assert.equal(h.writes.length + h.wires.length, 0);
    const one = await service.generateCharacterSprite({ name: '怪', dna: assets.characterDna.怪 });
    assert.equal(one.ok, true, JSON.stringify(one));
});

test('空间充足或浏览器不报容量时照常出图', async t => {
    for (const global of [withEstimate({ quota: 500 * MB, usage: 1 * MB }), {}]) {
        const assets = creatureAssets();
        const { h, service } = fixture(assets, { global });
        const result = await service.generateCharacterSprite({ name: '怪', dna: assets.characterDna.怪 });
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(h.wires.length, 1);
        h.dispose();
    }
});

test('保存失败不再报成功，并停止本批剩余出图，词留给继续生图', async t => {
    const assets = creatureAssets();
    const store = createMemoryGeneratedAssetStore();
    const { h, service } = fixture(assets, { global: {}, store });
    t.after(() => h.dispose());
    const first = await service.generateCharacterSprite({ name: '怪', dna: assets.characterDna.怪 });
    assert.equal(first.ok, true, JSON.stringify(first));
    const image = await service.readStoredImage(first.imageId);
    assets.characterDna.怪 = { creature: { form: 'beast' }, version: 2, personality: 'wary,', views: image.dnaCandidates.characters[0].views, identityInitialized: true };
    const wiresBefore = h.wires.length;
    store.putImage = async () => { throw new Error('disk failure'); };
    const set = await service.generateExpressionSet({ name: '怪', moods: ['微笑'], dna: assets.characterDna.怪 });
    assert.equal(set.ok, true, JSON.stringify(set));
    assert.equal(h.wires.length - wiresBefore, 1, '第一张存不下之后不再继续出图');
    const [head, ...rest] = set.items;
    assert.equal(head.ok, false);
    assert.equal(head.imageId, undefined, '失败项不带 imageId，格子不会指向不存在的图');
    assert.equal(head.reason, 'image-save-failed');
    assert.match(head.error, /图片没存上/);
    assert.ok(head.caption, '提示词保留');
    assert.equal(rest.length > 0 && rest.every(item => item.ok === false && item.error === '已停止'), true, JSON.stringify(rest));
    assert.equal(set.stopped, true);
});
