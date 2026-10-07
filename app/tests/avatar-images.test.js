import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarHoldersOfPreset, avatarHoldersOfRoot, moveInlineAvatars, storeAvatarImage } from '../src/visual/igs-ui/avatar-images.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { loadLegacyPresets, LEGACY_PRESET_KEY } from '../src/scene/legacy-preset.js';
import { normalizeStatusAvatars, resolveStatusAvatar } from '../src/data/shujuku/status-hud-model.js';
import { describeLocalStorageUsage } from '../src/storage/storage-usage.js';

const bigAvatar = (seed, size = 400000) => `data:image/png;base64,${String(seed).repeat(Math.ceil(size / String(seed).length)).slice(0, size)}`;

function fakeService() {
    const images = new Map();
    let next = 0;
    return {
        images,
        async importAssetImage(dataUrl, type) { const id = `av${++next}`; images.set(id, { dataUrl, type }); return { ok: true, imageId: id }; },
        async deleteImages(ids) { for (const id of ids) images.delete(id); return { ok: true }; },
    };
}

// 浏览器本地存储按字符计额度；这里给 1,500,000 字符，写超了照浏览器的样子抛 QuotaExceededError。
function quotaStorage(limit = 1500000) {
    const m = new Map();
    const used = () => [...m].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
    return {
        get length() { return m.size; },
        key: (i) => [...m.keys()][i] ?? null,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem(k, v) {
            const before = m.get(k);
            m.set(k, String(v));
            if (used() > limit) {
                if (before === undefined) m.delete(k); else m.set(k, before);
                const error = new Error('exceeded the quota'); error.name = 'QuotaExceededError'; throw error;
            }
        },
        removeItem: (k) => m.delete(k),
    };
}

test('avatar-images: 头像地址认图库编号', () => {
    assert.equal(resolveStatusAvatar({ 林: 'igs-gen:abc' }, '林'), 'igs-gen:abc');
    assert.deepEqual(normalizeStatusAvatars({ 林: 'igs-gen:abc', 雪: 'https://x/y.png', 坏: 'javascript:alert(1)' }), { 林: 'igs-gen:abc', 雪: 'https://x/y.png' });
});

test('avatar-images: 整段 base64 的头像挪进图库，同一张只存一次，网址和图库地址不动', async () => {
    const service = fakeService();
    const same = bigAvatar('A');
    const root = {
        statusAvatars: { 林: same, 雪: 'https://img/snow.png', 旧: 'igs-gen:old' },
        cards: { 'card:小雪': { statusAvatars: { 小雪: same, 阿B: bigAvatar('B') } } },
    };
    const result = await moveInlineAvatars(avatarHoldersOfRoot(root), service);
    assert.deepEqual(result, { moved: 3, failed: 0 });
    assert.equal(service.images.size, 2, '两处同一张图只进图库一次');
    assert.match(root.statusAvatars.林, /^igs-gen:av\d$/);
    assert.equal(root.cards['card:小雪'].statusAvatars.小雪, root.statusAvatars.林);
    assert.equal(root.statusAvatars.雪, 'https://img/snow.png');
    assert.equal(root.statusAvatars.旧, 'igs-gen:old');
    assert.equal(service.images.get(root.statusAvatars.林.slice(8)).type, 'avatar');

    const preset = { scenes: {}, statusAvatars: { 林: bigAvatar('C') }, scopeCards: { 'card:小雪': { label: '小雪', library: { statusAvatars: { 小雪: bigAvatar('D') } } } } };
    assert.equal((await moveInlineAvatars(avatarHoldersOfPreset(preset), service)).moved, 2);
    assert.doesNotMatch(JSON.stringify(preset), /data:image/);
});

test('avatar-images: 图库存不进时头像保持原样；没有图库时新头像仍写进设置', async () => {
    const broken = { importAssetImage: async () => ({ ok: false, error: '图片存储空间不足' }) };
    const root = { statusAvatars: { 林: bigAvatar('A', 1000) } };
    assert.deepEqual(await moveInlineAvatars(avatarHoldersOfRoot(root), broken), { moved: 0, failed: 1 });
    assert.match(root.statusAvatars.林, /^data:image\/png;base64,/);
    const service = fakeService();
    assert.match(await storeAvatarImage({}, service, bigAvatar('E', 1000)), /^igs-gen:av1$/);
    assert.equal(await storeAvatarImage({}, null, 'data:image/png;base64,QUJD'), 'data:image/png;base64,QUJD');
});

// 用户报的现象：设置里有几张上传的头像（每张约 0.4M 字符），设置本身还写得下，一存预设就把本地存储撑爆。
test('avatar-images: 存预设先把头像挪进图库，预设只记地址，额度紧也存得下', async () => {
    const storage = quotaStorage();
    const service = fakeService();
    const avatars = { 林: bigAvatar('A'), 雪: bigAvatar('B') };
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: { 教室: { url: 'igs-gen:room' } }, characters: { 林: { 默认: 'igs-gen:lin' }, 雪: { 默认: 'igs-gen:snow' } }, statusAvatars: avatars } }, readerSettings: {} };
    const persist = () => { storage.setItem('igs_bridge_config', JSON.stringify(draft.bridge)); return { ok: true }; };
    persist();
    const before = storage.getItem('igs_bridge_config').length;
    // 旧版存下的一份预设里也带着整段头像。
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 旧档: { scenes: {}, characters: {}, statusAvatars: { 林: avatars.林 } } }, active: '' }));
    const alerts = [];
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: { localStorage: storage, alert: (text) => alerts.push(text) }, generatedAssets: service },
        dialogs: { confirm: async () => true, prompt: async () => '学园' },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: persist,
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    await handleSettingsAction('preset-save', ctx);
    const presets = loadLegacyPresets(storage);
    assert.ok(presets.学园, alerts.join('\n'));
    assert.doesNotMatch(storage.getItem(LEGACY_PRESET_KEY), /data:image/, '新预设和旧预设里都只剩图库地址');
    assert.equal(presets.学园.statusAvatars.林, presets.旧档.statusAvatars.林, '旧预设和设置里同一张头像共用一份图');
    assert.match(draft.bridge.sceneAssets.statusAvatars.雪, /^igs-gen:/);
    assert.ok(storage.getItem('igs_bridge_config').length < before / 100, '设置本身也瘦了');
    assert.equal(service.images.size, 2);
});

test('avatar-images: 预设真存不下时提示里说清本机存储被谁占了', async () => {
    const storage = quotaStorage(300000);
    storage.setItem(LEGACY_PRESET_KEY, JSON.stringify({ version: 1, presets: { 大档: { scenes: { 海边: { url: 'x'.repeat(200000) } }, characters: {} } }, active: '' }));
    const draft = { bridge: { sceneAssets: { enabled: true, scenes: { 教室: { url: 'y'.repeat(120000) } }, characters: {} } }, readerSettings: {} };
    const alerts = [];
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: { localStorage: storage, alert: (text) => alerts.push(text) } },
        dialogs: { confirm: async () => true, prompt: async () => '学园' },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    const result = await handleSettingsAction('preset-save', ctx);
    assert.equal(result.ok, false);
    assert.match(alerts.join('\n'), /预设未能保存：浏览器本地存储已满[\s\S]*本机存储已用 391 KB：素材预设 391 KB/);
    assert.equal(describeLocalStorageUsage(null), '');
});
