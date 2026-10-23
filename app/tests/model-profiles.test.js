import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelProfilesStore } from '../src/storage/model-profiles-file.js';
import { applyProfileValues, collectProfileValues, handleModelProfileAction, isImmediateSavePath } from '../src/visual/igs-ui/settings-model-profiles.js';

function makeGlobal() {
    const files = { text: null }, uploads = [];
    const global = {
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
        fetch: async (url, init = {}) => {
            if (String(url).startsWith('/user/files/igs-model-profiles.json')) {
                if (files.text == null) return { ok: false, status: 404 };
                return { ok: true, status: 200, json: async () => JSON.parse(files.text) };
            }
            assert.equal(url, '/api/files/upload');
            const body = JSON.parse(init.body);
            uploads.push(body.name);
            files.text = Buffer.from(body.data, 'base64').toString('utf8');
            return { ok: true, status: 200 };
        },
    };
    return { global, files, uploads };
}

test('模型预设文件：404 视为空，同名覆盖，删除后写回 UTF-8 文件', async () => {
    const { global, files, uploads } = makeGlobal();
    const store = createModelProfilesStore(global);
    assert.deepEqual(await store.read(), []);
    await store.save({ name: '中转甲', kind: 'image', values: { 'bridge.autoIllustration.nai.endpoint': 'https://a' } });
    await store.save({ name: '中转甲', kind: 'image', values: { 'bridge.autoIllustration.nai.endpoint': 'https://b' } });
    await store.save({ name: '中转甲', kind: 'llm', values: {} });
    const list = await store.read();
    assert.equal(list.length, 2);
    assert.equal(list.find((item) => item.kind === 'image').values['bridge.autoIllustration.nai.endpoint'], 'https://b');
    assert.equal(JSON.parse(files.text).version, 1);
    await store.remove(list[0].id);
    assert.equal((await store.read()).length, 1);
    assert.ok(uploads.every((name) => name === 'igs-model-profiles.json'));
});

test('模型预设文件：读取失败抛出简短错误，不写文件', async () => {
    const store = createModelProfilesStore({ fetch: async () => ({ ok: false, status: 500 }) });
    await assert.rejects(store.read());
});

test('关键字段白名单：只对接口地址、密钥、传输、模型字段即时落盘', () => {
    for (const path of ['bridge.autoIllustration.nai.endpoint', 'bridge.autoIllustration.nai.apiKey', 'bridge.autoIllustration.nai.transport',
        'bridge.autoIllustration.llm.model', 'bridge.imageApi.mode', 'bridge.imageApi.spriteModel']) assert.equal(isImmediateSavePath(path), true, path);
    for (const path of ['bridge.autoIllustration.nai.steps', 'bridge.autoIllustration.llm.prompts.asset', 'readerSettings.skin']) assert.equal(isImmediateSavePath(path), false, path);
});

test('模型预设动作：存为预设后应用会写入草稿并立即落盘', async () => {
    const { global } = makeGlobal();
    const draft = { bridge: { autoIllustration: { llm: { endpoint: 'https://x/v1', apiKey: 'k', model: 'm' } } } };
    const panel = { draft, asyncState: {} };
    let persisted = 0, rendered = 0;
    const ctx = { panel, global, dialogs: { prompt: async () => '甲', confirm: async () => true },
        persistSettingsDraft: () => { persisted++; return { ok: true }; }, rerenderSettings: () => { rendered++; }, isCurrent: () => true };
    assert.equal((await handleModelProfileAction('model-profile:save:llm', ctx)).ok, true);
    const profiles = panel.asyncState.modelProfiles;
    assert.equal(profiles.list.length, 1);
    assert.equal(profiles.sel.llm, profiles.list[0].id);
    draft.bridge.autoIllustration.llm.endpoint = 'https://changed/v1';
    await handleModelProfileAction('model-profile:apply:llm', ctx);
    assert.equal(draft.bridge.autoIllustration.llm.endpoint, 'https://x/v1');
    assert.equal(persisted, 1);
    assert.ok(rendered >= 2);
    assert.deepEqual(Object.keys(collectProfileValues('llm', draft)).length, 3);
    applyProfileValues('llm', {}, draft);
    await handleModelProfileAction('model-profile:delete:llm', ctx);
    assert.equal(profiles.list.length, 0);
});
