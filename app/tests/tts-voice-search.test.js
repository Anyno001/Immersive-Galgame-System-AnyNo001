import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { ttsVoiceSelectInput } from '../src/visual/igs-ui/tts-voice-options.js';
import { applyTtsVoiceSearch, matchesTtsVoiceSearch, restoreTtsVoiceSearch } from '../src/visual/igs-ui/tts-voice-search.js';

const groups = [
    { label: '常用', items: [['ABC123', '少女（ABC123） · 日文'], ['cn-id', '少女（cn-id） · 中文']] },
    { label: '收藏', items: [['en-id', '旁白（en-id） · 英文']] },
];
function search(document, query) {
    const input = document.querySelector('[data-tts-voice-search]');
    input.value = query;
    applyTtsVoiceSearch(input);
    return document.querySelector('select');
}

test('名称、ID、语言支持部分及大小写匹配，空格组合取交集，语言支持常用别名', () => {
    for (const query of ['少女', 'aBc1', '日', '日语', 'ja', 'japanese', '日文 少女', 'ＡＢＣ']) {
        assert.equal(matchesTtsVoiceSearch('少女（ABC123） · 日文', query), true, query);
    }
    assert.equal(matchesTtsVoiceSearch('少女（ABC123） · 日文', '日文 旁白'), false);
    assert.equal(matchesTtsVoiceSearch('英文老师（id）', 'english'), false, '未设语言不能由声音名猜语言');
});

test('下拉筛选保留分组和自动项，不改当前声音；清空恢复全部，无匹配有提示', () => {
    const document = new JSDOM(ttsVoiceSelectInput('voice', 'en-id', groups, { leading: [['', '同女声']] })).window.document;
    let select = search(document, 'abc');
    assert.equal(select.value, 'en-id');
    assert.deepEqual([...select.options].map(option => option.value), ['', 'ABC123', 'en-id']);
    assert.equal(select.querySelector('optgroup:last-child').label, '当前已选（不符合筛选）');
    assert.equal(select.options[0].textContent, '同女声');
    select.value = 'ABC123';
    select = search(document, '不存在');
    assert.equal(select.value, 'ABC123', '选择匹配项后再筛选仍保留新选择');
    assert.equal(document.querySelector('[data-tts-voice-search-empty]').hidden, false);
    select = search(document, '');
    assert.equal(select.value, 'ABC123');
    assert.equal(select.options.length, 4);
    assert.deepEqual([...select.querySelectorAll('optgroup')].map(group => group.label), ['常用', '收藏']);
});

test('重绘使用新库和新语言重新筛选，不残留上次缓存的旧选项', () => {
    const document = new JSDOM(ttsVoiceSelectInput('voice', 'en-id', groups)).window.document;
    search(document, '中文');
    document.body.innerHTML = ttsVoiceSelectInput('voice', 'en-id', [{ label: '新库', items: [['new-id', '新声音 · 中文'], ['en-id', '旁白 · 英文']] }]);
    restoreTtsVoiceSearch(document.body, { voice: '中文' });
    assert.deepEqual([...document.querySelector('select').options].map(node => node.value), ['new-id', 'en-id']);
    assert.equal(document.querySelector('[data-tts-voice-search]').value, '中文');
});

test('局部重绘短暂自动选中首项时，仍以最新设置的 selected 标记恢复声音', () => {
    const document = new JSDOM(ttsVoiceSelectInput('voice', 'en-id', groups, { leading: [['', '同女声']] })).window.document;
    document.querySelector('select').value = '';
    restoreTtsVoiceSearch(document.body, { voice: '日文' });
    assert.equal(document.querySelector('select').value, 'en-id');
    assert.equal(document.querySelector('option[value="en-id"]').selected, true);
    search(document, '');
    assert.equal(document.querySelector('select').value, 'en-id');
});

test('实际设置的搜索输入不保存、不失焦，旁白与默认池搜索隔离，重绘后继续筛选', async t => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://fixture.test', pretendToBeVisual: true });
    const tts = { enabled: true, provider: 'api', api: {
        voices: 'ABC123#少女,cn-id#少女,en-id#旁白', male: 'en-id', female: 'ABC123', narrator: 'en-id',
        voiceLibrary: { languages: { ABC123: 'ja', 'cn-id': 'zh', 'en-id': 'en' }, folders: { folders: ['常用'], assign: { ABC123: '常用' } } },
    } };
    const storage = createMemoryStorage({ 'igs-reader-settings-v9-default': JSON.stringify({ tts }) });
    Object.defineProperty(dom.window, 'localStorage', { value: storage });
    const vn = bootstrapIGS({ global: dom.window, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    t.after(() => { vn.destroy(); dom.window.close(); });
    const controller = vn.openSettings({ tab: 'sound', mode: 'pc' }).controller;
    controller.goToPath('readerSettings.tts.provider');
    const document = dom.window.document;
    const inputFor = key => [...document.querySelectorAll('[data-tts-voice-search]')].find(node => node.dataset.ttsVoiceSearch === key);
    const input = inputFor('readerSettings.tts.api.narrator');
    assert.ok(input, '实际挂载产生搜索控件');
    const before = storage.getItem('igs-reader-settings-v9-default');
    input.focus(); input.value = 'ja 少女';
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(document.activeElement, input);
    assert.equal(storage.getItem('igs-reader-settings-v9-default'), before);
    assert.equal(document.querySelector('[data-path="readerSettings.tts.api.narrator"]').value, 'en-id');
    assert.equal(inputFor('pool:api:male').value, '');
    const poolSearch = inputFor('pool:api:male');
    poolSearch.value = '日'; poolSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const pool = poolSearch.closest('[data-tts-voice-search-scope]');
    assert.deepEqual([...pool.querySelectorAll('button:not([hidden])')].map(node => node.textContent), ['少女（ABC123） · 日文']);
    assert.equal(controller.getSnapshot().draft.readerSettings.tts.api.male, 'en-id');
    await controller.invoke('tts-pool-toggle:api:male:ABC123');
    controller.goToPath('readerSettings.tts.provider');
    assert.equal(inputFor('pool:api:male').value, '日');
    const selected = document.querySelector('[data-action="tts-pool-toggle:api:male:ABC123"]');
    assert.equal(selected.hidden, false);
    assert.equal(selected.getAttribute('aria-pressed'), 'true');
    assert.equal(inputFor('readerSettings.tts.api.narrator').value, 'ja 少女');
    const focus = inputFor('readerSettings.tts.api.narrator');
    focus.focus(); focus.setSelectionRange(1, 3);
    controller.setValue('readerSettings.tts.narratorRate', 1.1);
    assert.equal(document.activeElement, inputFor('readerSettings.tts.api.narrator'));
    assert.equal(document.activeElement.selectionStart, 1);
    assert.equal(document.activeElement.selectionEnd, 3);
});
