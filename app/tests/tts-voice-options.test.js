import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { normalizeTtsSettings, ttsApiVoiceGroups, ttsNarratorVoiceGroups } from '../src/visual/igs-ui/tts.js';
import { renderTtsVoiceOptions } from '../src/visual/igs-ui/tts-voice-options.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';

const api = {
    voices: 'plain#未标记,cn#中文声,jp#日文声', female: 'jp\nghost', male: 'cn', narrator: 'jp',
    voiceLibrary: { languages: { cn: 'zh', jp: 'ja' }, folders: {
        folders: ['日语', '常用', '空'], collapsed: ['日语'], assign: { jp: '日语', cn: '常用' },
    } },
};
const narratorApi = { voices: 'solo#旁白', voice: 'solo', voiceLibrary: {
    languages: { solo: 'en' }, folders: { folders: ['旁白专用'], assign: { solo: '旁白专用' } },
} };
const settings = () => normalizeTtsSettings({ enabled: true, provider: 'api', api, narratorApi });
const doc = html => new JSDOM(html).window.document;
const labels = select => [...select.querySelectorAll('optgroup')].map(group => group.label);

test('选声按文件夹顺序排列，未分类置后，折叠不隐藏声音，语言仅在设置后显示', () => {
    const groups = ttsApiVoiceGroups(settings());
    assert.deepEqual(groups, [
        { label: '日语', items: [['jp', '日文声 · 日文']] },
        { label: '常用', items: [['cn', '中文声 · 中文']] },
        { label: '未分类', items: [['plain', '未标记']] },
    ]);
    assert.deepEqual(ttsNarratorVoiceGroups(settings()), [{ label: '旁白专用', items: [['solo', '旁白 · 英文']] }]);
    assert.deepEqual(ttsApiVoiceGroups({ api: { voices: 'a#甲,b' } }), [{ label: '', items: [['a', '甲'], ['b', 'b']] }]);
});

test('原生选声保留自动项、库外选中值，并转义声音和文件夹内容', () => {
    const groups = [{ label: '<组&"名>', items: [['a"<>', '<声音> · 日文']] }];
    const select = doc(`<select>${renderTtsVoiceOptions(groups, 'a"<>', { leading: [['', '自动']] })}</select>`).querySelector('select');
    assert.equal(select.value, 'a"<>');
    assert.deepEqual(labels(select), ['<组&"名>']);
    assert.equal(select.options[0].textContent, '自动');
    assert.equal(select.options[1].textContent, '<声音> · 日文');
    assert.equal(select.querySelectorAll('声音').length, 0);
    const missing = doc(`<select>${renderTtsVoiceOptions(groups, '旧声音', { leading: [['', '同台词']] })}</select>`).querySelector('select');
    assert.equal(missing.value, '旧声音');
    assert.equal(missing.selectedOptions[0].textContent, '旧声音（不在声音库）');
});

test('角色实际台词与心里话控件均分组、显示语言，库外值与同台词项保留', () => {
    const sceneAssets = { characterVoices: { 小雪: { tts: 'jp', ttsThought: 'ghost' } } };
    const document = doc(renderCharacterAssetList({ 小雪: { 默认: 'x.png' } }, {
        voice: { sceneAssets, tts: settings() }, isOpen: key => key === 'char-dna:小雪' || key === 'char-setup:小雪=voice',
    }));
    for (const field of ['tts', 'ttsThought']) {
        const select = document.querySelector(`select[data-char-voice-${field}]`);
        assert.ok(select, `${field} 声音控件存在`);
        assert.deepEqual(labels(select), ['日语', '常用', '未分类']);
        assert.equal(select.querySelector('option[value="jp"]').textContent, '日文声 · 日文', '角色选声不显示声音 ID');
    }
    assert.equal(document.querySelector('[data-char-voice-tts]').value, 'jp');
    assert.equal(document.querySelector('[data-char-voice-ttsThought]').value, 'ghost');
    assert.equal(document.querySelector('[data-char-voice-ttsThought] option').textContent, '同台词');
});

test('实际设置页男女默认池、主库旁白与独立旁白均分组，点选仍保存原 ID', async t => {
    const storage = createMemoryStorage({ 'igs-reader-settings-v9-default': JSON.stringify({ tts: settings() }) });
    const vn = bootstrapIGS({ global: { localStorage: storage }, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    t.after(() => vn.destroy());
    const controller = vn.openSettings({ tab: 'sound', mode: 'pc' }).controller;
    controller.goToPath('readerSettings.tts.provider');
    const view = () => doc(controller.getSnapshot().html);
    // 默认声音收起时只显示已选的，展开后才列出全部。
    for (const role of ['female', 'male']) await controller.invoke(`ui-toggle-open:tts-pool-api-${role}`);
    let document = view();
    const main = document.querySelector('[data-path="readerSettings.tts.api.narrator"]');
    assert.deepEqual(labels(main), ['日语', '常用', '未分类']);
    assert.equal(main.value, 'jp');
    for (const role of ['female', 'male']) {
        const button = document.querySelector(`[data-action="tts-pool-toggle:api:${role}:jp"]`);
        const pool = button.closest('.igs-tts-pool-field');
        assert.deepEqual([...pool.querySelectorAll('.igs-asset-folder-name')].map(node => node.textContent),
            role === 'female' ? ['日语', '常用', '未分类', '不在声音库'] : ['日语', '常用', '未分类']);
        assert.equal(button.textContent, '日文声 · 日文');
        assert.equal(button.getAttribute('aria-pressed'), role === 'female' ? 'true' : 'false');
    }
    await controller.invoke('tts-pool-toggle:api:male:jp');
    assert.match(controller.getSnapshot().draft.readerSettings.tts.api.male, /jp/);
    assert.doesNotMatch(controller.getSnapshot().draft.readerSettings.tts.api.male, /日文/);
    controller.setValue('readerSettings.tts.narratorApi.enabled', true);
    document = view();
    const separate = document.querySelector('[data-path="readerSettings.tts.narratorApi.voice"]');
    assert.deepEqual(labels(separate), ['旁白专用']);
    assert.equal(separate.value, 'solo');
    assert.equal(separate.selectedOptions[0].textContent, '旁白 · 英文');
    assert.equal(separate.querySelector('option[value="jp"]'), null);
    await controller.invoke('tts-voice-folder-remove:api:' + encodeURIComponent('日语'));
    controller.setValue('readerSettings.tts.narratorApi.enabled', false);
    assert.equal(view().querySelector('[data-path="readerSettings.tts.api.narrator"]').value, 'jp');
    assert.deepEqual(labels(view().querySelector('[data-path="readerSettings.tts.api.narrator"]')), ['常用', '未分类']);
});
