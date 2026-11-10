import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { buildTtsRequest, normalizeTtsSettings, ttsVoiceEntries } from '../src/visual/igs-ui/tts.js';
import { editTtsVoiceLibrary, normalizeTtsVoiceLibrary } from '../src/visual/igs-ui/tts-voice-library.js';
import { renderTtsVoiceLibrary } from '../src/visual/igs-ui/tts-voice-library-view.js';
import { handleTtsVoiceLibraryAction } from '../src/visual/igs-ui/tts-voice-library-actions.js';
import { addAssetFolder, groupAssetsByFolder, moveAssetToFolder, renameAssetFolder, toggleAssetFolder } from '../src/visual/igs-ui/asset-folders.js';
import { buildSettingsExport, parseSettingsImport } from '../src/visual/igs-ui/settings-sections.js';
import { createTtsFloorPreloader } from '../src/visual/igs-ui/tts-floor-preloader.js';

function fixture(t) {
    const answers = [], alerts = [], storage = createMemoryStorage();
    const vn = bootstrapIGS({ global: { localStorage: storage, prompt: () => answers.shift(), confirm: () => true, alert: text => alerts.push(text) },
        autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    const controller = vn.openSettings({ tab: 'sound', mode: 'pc' }).controller;
    controller.setValue('readerSettings.tts.enabled', true);
    controller.setValue('readerSettings.tts.provider', 'api');
    controller.setValue('readerSettings.tts.api.voices', 'voice-a#甲, voice-b#乙');
    controller.setValue('readerSettings.tts.narratorApi.voices', 'voice-a#旁白');
    t.after(() => vn.destroy());
    return { vn, controller, answers, alerts, storage,
        api: () => controller.getSnapshot().draft.readerSettings.tts.api,
        narrator: () => controller.getSnapshot().draft.readerSettings.tts.narratorApi };
}

test('旧声音库不改写，语言及文件夹只作分类，不改变合成请求', () => {
    const base = { provider: 'api', api: { format: 'fish', voices: 'abc#甲, def#乙', model: 's2.1-pro-free' } };
    const before = normalizeTtsSettings(base);
    const after = normalizeTtsSettings({ ...base, api: { ...base.api, voiceLibrary: {
        languages: { abc: 'ja', def: 'invalid', ghost: 'en' }, folders: { folders: ['常用'], assign: { abc: '常用', ghost: '常用' } },
    } } });
    assert.equal(after.api.voices, base.api.voices);
    assert.deepEqual(Object.entries(after.api.voiceLibrary.languages), [['abc', 'ja']]);
    assert.deepEqual(Object.entries(after.api.voiceLibrary.folders.assign), [['abc', '常用']]);
    assert.deepEqual(ttsVoiceEntries(after.api.voices), [['abc', '甲'], ['def', '乙']]);
    assert.deepEqual(buildTtsRequest(before.api, { text: '你好', voice: 'abc' }), buildTtsRequest(after.api, { text: '你好', voice: 'abc' }));
});

test('共用文件夹编辑保持旧素材分组、折叠与改名语义，危险键不污染原型', () => {
    let assets = addAssetFolder({}, 'characters', '甲组');
    assets = moveAssetToFolder(assets, 'characters', '人物甲', '甲组');
    assets = toggleAssetFolder(assets, 'characters', '甲组');
    assets = renameAssetFolder(assets, 'characters', '甲组', '乙组');
    assert.deepEqual(assets.characters.collapsed, ['乙组']);
    assert.deepEqual(groupAssetsByFolder(assets, 'characters', ['人物甲', '人物乙']), [
        { folder: '乙组', items: ['人物甲'] }, { folder: '', items: ['人物乙'] },
    ]);
    const library = normalizeTtsVoiceLibrary(JSON.parse('{"languages":{"__proto__":"en"},"folders":{"folders":["常用"],"assign":{"__proto__":"常用"}}}'), ['__proto__']);
    assert.equal(library.languages.__proto__, 'en');
    assert.equal(library.folders.assign.__proto__, '常用');
    assert.equal({}.language, undefined);
    assert.equal(Object.getPrototypeOf(library.languages), null);
});

test('语言选择保存后重开仍在，主库与旁白库互不覆盖，并能随设置导入导出', async t => {
    const f = fixture(t);
    await f.controller.invoke('tts-voice-edit:api:1:language:ja');
    await f.controller.invoke('tts-voice-edit:narratorApi:0:language:en');
    assert.equal(f.api().voiceLibrary.languages['voice-b'], 'ja');
    assert.equal(f.narrator().voiceLibrary.languages['voice-a'], 'en');
    f.controller.close();
    const reopened = f.vn.openSettings({ tab: 'sound', mode: 'mobile' }).controller;
    assert.equal(reopened.getSnapshot().draft.readerSettings.tts.api.voiceLibrary.languages['voice-b'], 'ja');
    const exported = buildSettingsExport(reopened.getSnapshot().draft);
    const imported = parseSettingsImport(JSON.stringify(exported));
    const normalized = normalizeTtsSettings(imported.readerSettings.tts);
    assert.equal(normalized.api.voiceLibrary.languages['voice-b'], 'ja');
    assert.equal(normalized.narratorApi.voiceLibrary.languages['voice-a'], 'en');
    await reopened.invoke('tts-voice-edit:api:1:language:');
    assert.equal(reopened.getSnapshot().draft.readerSettings.tts.api.voiceLibrary.languages['voice-b'], undefined);
});

test('文件夹新建、移动、折叠、重命名与删除使用实际设置动作，删除不删声音', async t => {
    const f = fixture(t);
    f.answers.push('日文'); await f.controller.invoke('tts-voice-folder-add:api');
    await f.controller.invoke('tts-voice-folder-move:api:voice-b:' + encodeURIComponent('日文'));
    await f.controller.invoke('tts-voice-folder-toggle:api:' + encodeURIComponent('日文'));
    assert.deepEqual(f.api().voiceLibrary.folders.collapsed, ['日文']);
    f.answers.push('日语'); await f.controller.invoke('tts-voice-folder-rename:api:' + encodeURIComponent('日文'));
    assert.equal(f.api().voiceLibrary.folders.assign['voice-b'], '日语');
    assert.deepEqual(f.api().voiceLibrary.folders.collapsed, ['日语']);
    f.answers.push('日语'); await f.controller.invoke('tts-voice-folder-add:api');
    assert.equal(f.alerts.length, 1, '重名文件夹反馈，不重复创建');
    assert.deepEqual(f.api().voiceLibrary.folders.folders, ['日语']);
    assert.deepEqual(f.narrator().voiceLibrary.folders.folders, []);
    await f.controller.invoke('tts-voice-folder-remove:api:' + encodeURIComponent('日语'));
    assert.deepEqual(ttsVoiceEntries(f.api().voices), [['voice-a', '甲'], ['voice-b', '乙']]);
    assert.deepEqual(Object.keys(f.api().voiceLibrary.folders.assign), []);
    assert.deepEqual(f.api().voiceLibrary.folders.collapsed, []);
});

test('修改声音 ID 沿用语言及文件夹，删除声音只清理该 ID 的分类', async t => {
    const f = fixture(t);
    f.answers.push('收藏'); await f.controller.invoke('tts-voice-folder-add:api');
    await f.controller.invoke('tts-voice-folder-move:api:voice-b:' + encodeURIComponent('收藏'));
    await f.controller.invoke('tts-voice-edit:api:1:language:zh');
    await f.controller.invoke('tts-voice-edit:api:1:id:voice-new');
    assert.equal(f.api().voiceLibrary.languages['voice-new'], 'zh');
    assert.equal(f.api().voiceLibrary.folders.assign['voice-new'], '收藏');
    assert.equal(f.api().voiceLibrary.languages['voice-b'], undefined);
    assert.equal(f.api().voiceLibrary.folders.assign['voice-b'], undefined);
    await f.controller.invoke('tts-voice-remove:api:1');
    assert.deepEqual(Object.keys(f.api().voiceLibrary.languages), []);
    assert.deepEqual(Object.keys(f.api().voiceLibrary.folders.assign), []);
    assert.deepEqual(f.api().voiceLibrary.folders.folders, ['收藏'], '空文件夹仍保留');
    assert.equal(f.narrator().voices, 'voice-a#旁白');
});

test('分组后每行仍编辑原条目，名称和 ID 被转义，空库也能新建文件夹', () => {
    let library = editTtsVoiceLibrary(null, 'add', { name: '收藏' });
    library = editTtsVoiceLibrary(library, 'move', { item: 'voice-b', to: '收藏' });
    library = editTtsVoiceLibrary(library, 'language', { item: 'voice-b', language: 'ja' });
    const html = renderTtsVoiceLibrary('api', { voices: 'voice-a#<img src=x>, voice-b#乙', voiceLibrary: library }, { isOpen: () => true });
    assert.ok(html.indexOf('value="乙"') < html.indexOf('value="&lt;img src=x&gt;"'));
    assert.match(html, /data-voice-index="1" data-voice-part="language"/);
    assert.match(html, /value="ja" selected/);
    assert.match(html, /data-tts-folder-move="api"/);
    assert.doesNotMatch(html, /<img src=x>/);
    assert.match(renderTtsVoiceLibrary('api', { voices: '' }), /data-action="tts-voice-folder-add:api"/);
});

test('分类保存失败回退草稿，异步输入期间关闭设置不写回', async () => {
    const original = { enabled: true, api: { voices: 'a#甲' } };
    const settingsState = { draft: { readerSettings: { tts: original } } };
    const context = { settingsState, dialogs: { alert: async () => {} }, persistSettingsDraft: () => ({ ok: false, reason: 'save-failed' }), rerenderSettings: () => ({ ok: true }) };
    const result = await handleTtsVoiceLibraryAction('tts-voice-edit:api:0:language:ja', context);
    assert.equal(result.ok, false); assert.equal(settingsState.draft.readerSettings.tts, original);
    let finish;
    const pending = handleTtsVoiceLibraryAction('tts-voice-folder-add:api', { ...context,
        dialogs: { prompt: () => new Promise(resolve => { finish = resolve; }) },
        isCurrent: () => false, persistSettingsDraft: () => assert.fail('关闭的面板不保存'),
    });
    finish('收藏');
    assert.equal((await pending).reason, 'settings-not-open');
});

test('只改语言和分类不会重启正在预载的楼层', () => {
    let calls = 0;
    const preload = createTtsFloorPreloader({ prefetch() { calls++; return Promise.resolve(0); } });
    const prepared = { source: '原文', text: '正文', segments: ['正文'], pages: [{ textType: 'narration', segmentBody: '正文' }] };
    const tts = { enabled: true, provider: 'api', api: { voices: 'a#甲', prefetchFloor: true } };
    preload.startPrepared(prepared, { tts }, { identity: 'chat|1|0' });
    preload.startPrepared(prepared, { tts: { ...tts, api: { ...tts.api, voiceLibrary: { languages: { a: 'ja' }, folders: { folders: ['收藏'], assign: { a: '收藏' } } } } } }, { identity: 'chat|1|0' });
    assert.equal(calls, 1);
    preload.dispose();
});

test('多选后可一起设语言、移进文件夹、删除，取消多选不改声音库', async t => {
    const f = fixture(t);
    f.controller.setValue('readerSettings.tts.api.voices', 'voice-a#甲, voice-b#乙, voice-c#丙');
    f.answers.push('收藏'); await f.controller.invoke('tts-voice-folder-add:api');
    f.controller.goToPath('readerSettings.tts.provider');
    await f.controller.invoke('tts-voice-select:api');
    assert.match(f.controller.getSnapshot().html, /data-action="tts-voice-pick:api:voice-a"/);
    await f.controller.invoke('tts-voice-pick:api:voice-a');
    await f.controller.invoke('tts-voice-pick:api:voice-c');
    f.answers.push('ja'); await f.controller.invoke('tts-voice-bulk-language:api');
    assert.deepEqual(f.api().voiceLibrary.languages, { 'voice-a': 'ja', 'voice-c': 'ja' });
    await f.controller.invoke('tts-voice-select:api');
    await f.controller.invoke('tts-voice-pick-all:api');
    await f.controller.invoke('tts-voice-pick:api:voice-b');
    f.answers.push('收藏'); await f.controller.invoke('tts-voice-bulk-move:api');
    assert.deepEqual(f.api().voiceLibrary.folders.assign, { 'voice-a': '收藏', 'voice-c': '收藏' });
    await f.controller.invoke('tts-voice-select:api');
    await f.controller.invoke('tts-voice-pick:api:voice-a');
    await f.controller.invoke('tts-voice-pick:api:voice-b');
    await f.controller.invoke('tts-voice-bulk-delete:api');
    assert.deepEqual(ttsVoiceEntries(f.api().voices).map(([id]) => id), ['voice-c']);
    assert.deepEqual(Object.keys(f.api().voiceLibrary.languages), ['voice-c']);
    assert.doesNotMatch(f.controller.getSnapshot().html, /tts-voice-pick:api/);
    assert.equal(f.narrator().voices, 'voice-a#旁白');
});
