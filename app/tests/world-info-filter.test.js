import test from 'node:test';
import assert from 'node:assert/strict';
import { attachWorldInfoExclude, normalizeWorldInfoExclude, toggleWorldInfoBook, toggleWorldInfoEntry } from '../src/host/world-info-filter.js';
import { createImageWorldInfoSource } from '../src/host/image-world-info.js';
import { createIllustrationMessageHost } from '../src/host/illustration-message-host.js';
import { renderWorldInfoFilterPanel } from '../src/visual/igs-ui/settings-world-info-filter.js';

function fakeEvents() {
    const handlers = new Map();
    return {
        on(name, fn) { handlers.set(name, (handlers.get(name) || []).concat([fn])); },
        removeListener(name, fn) { handlers.set(name, (handlers.get(name) || []).filter(h => h !== fn)); },
        emit(name, arg) { for (const fn of handlers.get(name) || []) fn(arg); },
        count(name) { return (handlers.get(name) || []).length; },
    };
}

test('排除名单去重、丢空值，切换后可恢复', () => {
    assert.deepEqual(normalizeWorldInfoExclude({ books: ['A', 'A', ' ', null], entries: { B: [1, '1', ''], C: [] } }),
        { books: ['A'], entries: { B: ['1'] } });
    const once = toggleWorldInfoEntry(toggleWorldInfoBook(null, 'A'), 'B', 3);
    assert.deepEqual(once, { books: ['A'], entries: { B: ['3'] } });
    assert.deepEqual(toggleWorldInfoEntry(toggleWorldInfoBook(once, 'A'), 'B', '3'), { books: [], entries: {} });
});

test('原生扫描只删本次被排除的书与条目，扫描后解绑', async () => {
    const eventSource = fakeEvents();
    const lore = {
        globalLore: [{ world: 'G', uid: 1 }, { world: 'G', uid: 2 }],
        characterLore: [{ world: 'Card', uid: 0 }],
        chatLore: [], personaLore: [{ world: 'P', uid: 5 }],
    };
    let seen = null;
    const ctx = {
        eventSource, eventTypes: { WORLDINFO_ENTRIES_LOADED: 'wi_loaded' }, name2: 'Bot', extensionPrompts: {},
        async getWorldInfoPrompt() {
            eventSource.emit('wi_loaded', lore);
            seen = JSON.parse(JSON.stringify(lore));
            return { worldInfoString: 'ok' };
        },
    };
    const resolve = createImageWorldInfoSource({ SillyTavern: { getContext: () => ctx } }, {
        readIncludeNames: () => true,
        readExclude: () => ({ books: ['Card'], entries: { G: ['2'] } }),
    });
    const result = await resolve({ description: '正文' });
    assert.equal(result.ok, true);
    assert.deepEqual(seen.globalLore, [{ world: 'G', uid: 1 }]);
    assert.deepEqual(seen.characterLore, []);
    assert.deepEqual(seen.personaLore, [{ world: 'P', uid: 5 }]);
    assert.equal(eventSource.count('wi_loaded'), 0);
});

test('没有排除项时不挂监听，主聊天扫描不受影响', () => {
    const eventSource = fakeEvents();
    const detach = attachWorldInfoExclude({ eventSource, eventTypes: { WORLDINFO_ENTRIES_LOADED: 'wi_loaded' } }, { books: [] });
    assert.equal(eventSource.count('wi_loaded'), 0);
    detach();
});

test('只拦第一次扫描：写词之后紧跟的主聊天扫描保留全部条目', () => {
    const eventSource = fakeEvents();
    attachWorldInfoExclude({ eventSource, eventTypes: { WORLDINFO_ENTRIES_LOADED: 'wi_loaded' } }, { books: ['G'] });
    const first = { globalLore: [{ world: 'G', uid: 1 }] };
    const second = { globalLore: [{ world: 'G', uid: 1 }] };
    eventSource.emit('wi_loaded', first);
    eventSource.emit('wi_loaded', second);
    assert.equal(first.globalLore.length, 0);
    assert.equal(second.globalLore.length, 1);
});

test('角色参考跳过被排除的书、条目与卡内嵌条目', async () => {
    const books = {
        Main: { entries: { 0: { uid: 0, key: ['小雪'], content: '小雪是银发' }, 1: { uid: 1, key: ['小雪'], content: '小雪的污染设定' } } },
        Global: { entries: { 0: { uid: 0, key: ['小雪'], content: '全局里的小雪' } } },
    };
    const ctx = {
        characterId: 0, name1: 'User',
        characters: [{ name: '小雪', description: '', data: { extensions: { world: 'Main' },
            character_book: { entries: [{ keys: ['小雪'], content: '卡内嵌小雪', enabled: true }] } } }],
        loadWorldInfo: async name => books[name],
    };
    const root = { SillyTavern: { getContext: () => ctx }, TavernHelper: { getGlobalWorldbookNames: () => ['Global'] } };
    let exclude = null;
    const host = createIllustrationMessageHost(root, { readWorldInfoExclude: () => exclude });
    const all = (await host.readCharacterLore(['小雪']))[0].text;
    for (const text of ['小雪是银发', '小雪的污染设定', '全局里的小雪', '卡内嵌小雪']) assert.ok(all.includes(text), text);
    exclude = { books: ['Global'], entries: { Main: ['1'], '@card': ['0'] } };
    const filtered = (await host.readCharacterLore(['小雪']))[0].text;
    assert.ok(filtered.includes('小雪是银发'));
    for (const text of ['小雪的污染设定', '全局里的小雪', '卡内嵌小雪']) assert.ok(!filtered.includes(text), text);
});

test('设置面板：展开的书列出条目勾选，排除过但未启用的书仍可恢复', () => {
    const html = renderWorldInfoFilterPanel({ worldInfoExclude: { books: ['Old'], entries: { Main: ['1'] } } }, {
        advancedOpen: { 'wi-filter-group': true, 'perf-wi-Main': true },
        worldInfoFilter: { books: [{ name: 'Main', sources: ['角色主世界书'] }],
            entries: { Main: { ok: true, entries: [{ uid: '0', title: '外貌' }, { uid: '1', title: '旧设定' }] }, Old: { ok: false, entries: [] } } },
    });
    assert.match(html, /已排除 2/);
    assert.match(html, /data-action="wi-filter:entry:Main:0" aria-pressed="true"/);
    assert.match(html, /data-action="wi-filter:entry:Main:1" aria-pressed="false"/);
    assert.match(html, /data-action="wi-filter:book:Old" aria-pressed="false"/);
    assert.match(html, /当前未启用/);
});
