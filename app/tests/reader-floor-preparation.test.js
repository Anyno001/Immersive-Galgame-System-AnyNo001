import test from 'node:test';
import assert from 'node:assert/strict';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { createReaderSourceCache } from '../src/visual/igs-ui/reader-source-cache.js';
import { createFloorSourceLocator, prepareReaderFloor } from '../src/visual/igs-ui/reader-floor-plan.js';
import { createMemoryStorage } from '../src/index.js';
import { createLocalImageCache } from '../src/media/tavern-image-cache.js';
import { resolveSpriteAsset } from '../src/scene/asset-match.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { prepareIllustrationPages, resolveIllustrationForPage } from '../src/scene/scene-directives.js';
import { createFxPageResolver, extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { mergeItemEvents } from '../src/visual/igs-ui/fx-item-model.js';
import { createStatusHudRowLookup, findStatusHudRow } from '../src/data/shujuku/status-hud-model.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function reader(t, { raw, sceneAssets, statusHud, table, generatedAssets } = {}) {
    let tables = table || {};
    let exports = 0, revision = 1;
    const callbacks = new Set();
    let imageEvent, settingsEvent;
    let bridge = { sceneAssets: sceneAssets || { enabled: true, characters: { 白墨: { 平和: 'calm.png' } } } };
    const g = { localStorage: createMemoryStorage(), AutoCardUpdaterAPI: {
        exportTableAsJson() { exports++; return structuredClone(tables); },
        registerTableUpdateCallback(fn) { callbacks.add(fn); },
        unregisterTableUpdateCallback(fn) { callbacks.delete(fn); },
    } };
    const cache = createLocalImageCache(g);
    const host = createIgsReaderHost({ global: g, media: { cache }, generatedAssets, pageRenderGapMs: 0,
        getUnifiedSettings: () => ({ bridge, readerSettings: { titleScreen: false, typewriter: { enabled: false }, statusHud } }),
        getSettingsRevision: () => revision, getCurrentChatId: () => 'floor-preparation-fixture',
        onGeneratedAssetUpdated(fn) { imageEvent = fn; return () => { imageEvent = null; }; },
        onSettingsUpdated(fn) { settingsEvent = fn; return () => { settingsEvent = null; }; },
    });
    t.after(async () => { host.destroy(); await cache.destroy(); });
    const opened = host.openReader({ messageId: 40, raw }, { mode: 'pc', skipTitle: true });
    assert.equal(opened.ok, true);
    return { host, opened, callbacks, get exports() { return exports; },
        content: () => host.getState().activeReader.snapshot.content,
        next: () => opened.controller.invokeAction('next'),
        image: detail => imageEvent(detail),
        tables(value) { tables = value; for (const callback of callbacks) callback(); },
        settings(value) { bridge = { sceneAssets: value }; revision++; settingsEvent(); },
    };
}

test('整楼准备沿用原有有界正文缓存，普通翻页不重准备，修改和淘汰同步失效', () => {
    const cache = createReaderSourceCache({ limit: 2, parse: input => ({ text: input }) });
    cache.get('a', '正文');
    let builds = 0;
    const prepare = () => ({ index: ++builds });
    const original = cache.prepare('a', ['正文'], prepare);
    for (let i = 0; i < 80; i++) assert.equal(cache.prepare('a', ['正文'], prepare), original);
    assert.equal(cache.getPrepareCount(), 1);
    assert.notEqual(cache.prepare('a', ['修改'], prepare), original);
    cache.get('b', '另一楼'); cache.get('c', '第三楼');
    assert.equal(cache.size(), 2);
    let count = 0; cache.visitPrepared(() => count++);
    assert.equal(count, 0, '被淘汰楼的准备结果也已释放');
    cache.invalidate(); assert.equal(cache.size(), 0);
});

test('正文位置一次建图并顺序匹配，重复句子不退回上一场景，提示词中的同句不认领', () => {
    const source = '<prompt>你好。门外下雨。</prompt><content>[igs-char:白墨|平和|你好。]\n门 外*下雨*。\n[igs-scene:殿外|晚上|雨]\n[igs-char:白墨|喜悦|你好。]</content>';
    const locator = createFloorSourceLocator(source);
    const first = locator.segment('[白墨]：你好。');
    const second = locator.segment('[白墨]：你好。', first + 1);
    assert.ok(first > source.indexOf('<content>'));
    assert.ok(second > source.indexOf('[igs-scene:殿外'));
    assert.equal(locator.segment('门外下雨。'), source.indexOf('门 外'));
    for (let i = 0; i < 20; i++) locator.segment('门外下雨。');
    assert.equal(locator.looseBuilds, 1);
});

test('整楼预备未来角色素材，翻页时不再逐槽检查或重查素材库', async t => {
    const checks = [];
    const generatedAssets = { hasUnavailableImages: () => true, isUnavailableImage(url) { checks.push(url); return false; },
        imageAvailability(url) { checks.push(url); return { status: 'available' }; },
        resolveUrl: ref => `blob:fixture/${ref.slice(8)}` };
    const sceneAssets = { enabled: true, characters: { 白墨: {}, 小林: {} },
        characterDefaultOutfits: { 白墨: { version: 1, outfitName: '常服' }, 小林: { version: 1, outfitName: '常服' } },
        characterOutfits: {
            白墨: { 常服: { moods: { 平和: 'igs-gen:bai' } } },
            小林: { 常服: { moods: { 平和: 'igs-gen:lin' } } },
        } };
    const r = reader(t, { sceneAssets, generatedAssets, raw: '[igs-char:白墨|平和|第一句。]\n[igs-char:小林|平和|第二句。]\n[igs-char:白墨|平和|第三句。]' });
    assert.ok(checks.includes('igs-gen:lin'), '第一张页面显示前已经匹配下一位角色');
    checks.length = 0;
    await r.next(); await r.next();
    assert.equal(checks.length, 0);
    assert.equal(r.content().spriteImage, 'blob:fixture/bai');
});

test('命名默认衣装的缺图匹配只检查当前角色，别名复用同套可用槽', () => {
    const characterOutfits = { 白墨: { 常服: { moods: { 喜悦: 'igs-gen:lost', 平和: 'igs-gen:calm' } } } };
    for (let i = 0; i < 1000; i++) characterOutfits[`其他${i}`] = { 常服: { moods: { 平和: `igs-gen:other-${i}` } } };
    const checks = [];
    const ctx = { sceneAssets: { characterOutfits, characterAliases: { 白墨: ['阿墨'] },
        characterDefaultOutfits: { 白墨: { version: 1, outfitName: '常服' } } },
        imageAvailability(url) { checks.push(url); return { status: url === 'igs-gen:lost' ? 'missing' : 'available' }; } };
    assert.equal(resolveSpriteAsset('阿墨', '喜悦', ctx).url, 'igs-gen:calm');
    assert.ok(checks.length < 12);
    assert.equal(checks.some(url => url.includes('other-')), false);
});

test('单图丢失与恢复只补受影响的匹配，其他角色不重查', async t => {
    const missing = new Set(), checks = [];
    const generatedAssets = { hasUnavailableImages: () => true,
        imageAvailability(url) { checks.push(url); return { status: missing.has(url) ? 'missing' : 'available' }; },
        isUnavailableImage(url) { checks.push(url); return missing.has(url); },
        resolveUrl: ref => missing.has(ref) ? '' : `blob:fixture/${ref.slice(8)}` };
    const sceneAssets = { enabled: true, characters: { 白墨: {}, 小林: {} },
        characterDefaultOutfits: { 白墨: { version: 1, outfitName: '常服' }, 小林: { version: 1, outfitName: '常服' } },
        characterOutfits: {
            白墨: { 常服: { moods: { 喜悦: 'igs-gen:joy', 平和: 'igs-gen:calm' } } },
            小林: { 常服: { moods: { 平和: 'igs-gen:lin' } } },
        } };
    const r = reader(t, { sceneAssets, generatedAssets, raw: '[igs-char:白墨|喜悦|第一句。]\n[igs-char:小林|平和|第二句。]' });
    checks.length = 0; missing.add('igs-gen:joy'); r.image({ reason: 'image-lost', imageId: 'joy' });
    await pause(150);
    assert.equal(r.content().spriteImage, 'blob:fixture/calm');
    assert.equal(checks.includes('igs-gen:lin'), false);
    checks.length = 0; missing.clear(); r.image({ reason: 'image-loaded', imageId: 'joy' });
    await pause(150);
    assert.equal(r.content().spriteImage, 'blob:fixture/joy');
    assert.equal(checks.includes('igs-gen:lin'), false);
});

test('状态栏、服装共用一次整表导出，更新事件后只重新准备一次', async t => {
    const table = outfit => ({ sheet_role: { uid: 'sheet_role', name: '重要角色表', content: [['姓名', '好感度', '穿着打扮'], ['白墨', '60/100', outfit]] } });
    const sceneAssets = { enabled: true, characters: { 白墨: { 平和: 'base.png' } }, characterOutfits: { 白墨: {
        红裙: { moods: { 平和: 'red.png' } }, 蓝裙: { moods: { 平和: 'blue.png' } },
    } } };
    const r = reader(t, { sceneAssets, table: table('红裙'), statusHud: { enabled: true, tables: [{ uid: 'sheet_role' }] },
        raw: Array.from({ length: 20 }, (_, i) => `[igs-char:白墨|平和|第${i + 1}句话。]`).join('\n') });
    assert.equal(r.content().spriteImage, 'red.png');
    assert.equal(r.exports, 1);
    for (let i = 0; i < 10; i++) await r.next();
    assert.equal(r.exports, 1);
    r.tables(table('蓝裙')); r.tables(table('蓝裙')); r.tables(table('蓝裙'));
    await pause(280);
    assert.equal(r.exports, 2);
    assert.equal(r.content().spriteImage, 'blue.png');
    assert.equal(r.content().statusHud.metrics[0].percent, 60);
    await r.next(); assert.equal(r.exports, 2);
});

test('状态栏关闭也订阅服装线索更新，切楼重新读取当前表格', async t => {
    const makeTable = outfit => ({ sheet_role: { uid: 'sheet_role', name: '重要角色表', content: [['姓名', '穿着打扮'], ['白墨', outfit]] } });
    const sceneAssets = { enabled: true, characters: { 白墨: { 平和: 'base.png' } }, characterOutfits: { 白墨: {
        红裙: { moods: { 平和: 'red.png' } }, 蓝裙: { moods: { 平和: 'blue.png' } },
    } } };
    const r = reader(t, { sceneAssets, table: makeTable('红裙'), statusHud: { enabled: false }, raw: '[igs-char:白墨|平和|你好。]\n下一页。' });
    assert.equal(r.callbacks.size, 1);
    r.tables(makeTable('蓝裙')); await pause(280);
    assert.equal(r.content().spriteImage, 'blue.png');
    const before = r.exports;
    r.host.replaceReader({ messageId: 42, raw: '[igs-char:白墨|平和|第二楼。]' });
    assert.equal(r.exports, before + 1);
    r.host.closeReader(); assert.equal(r.callbacks.size, 0);
});

test('跨行对白、重复短对白、换场与换装均按预先定位的本页原文解析', async t => {
    const sceneAssets = { enabled: true, scenes: { 室内: { url: 'inside.png' }, 室外: { url: 'outside.png' } },
        characters: { 白墨: { 平和: 'calm.png', 喜悦: 'joy.png' } }, characterOutfits: { 白墨: { 红裙: { moods: { 喜悦: 'red-joy.png' } } } } };
    const r = reader(t, { sceneAssets, raw: '[igs-scene:室内|上午|晴]\n[igs-char:白墨|平和|你好。\n\n]\n[igs-scene:室外|晚上|雨]\n[igs-char:白墨|喜悦|红裙|你好。]' });
    assert.equal(r.content().displayText, '你好。'); assert.equal(r.content().backgroundImage, 'inside.png');
    await r.next();
    assert.equal(r.content().displayText, '你好。'); assert.equal(r.content().sceneLocation, '室外');
    assert.equal(r.content().spriteImage, 'red-joy.png');
    assert.equal(r.content().backgroundImage, 'outside.png');
});

test('正文和素材配置改变后丢弃旧计划，同长度的新正文也重新准备', async t => {
    const sceneAssets = { enabled: true, characters: { 白墨: {} },
        characterDefaultOutfits: { 白墨: { version: 1, outfitName: '常服' } },
        characterOutfits: { 白墨: { 常服: { moods: { 平和: 'first.png' } } } } };
    const r = reader(t, { sceneAssets, raw: '[igs-char:白墨|平和|你好。]\n下一页。' });
    r.settings({ ...sceneAssets, characterOutfits: { 白墨: { 常服: { moods: { 平和: 'second.png' } } } } }); await pause(150);
    assert.equal(r.content().spriteImage, 'second.png');
    r.host.replaceReader({ messageId: 40, raw: '[igs-char:白墨|平和|再见。]\n下二页。' });
    assert.equal(r.content().displayText, '再见。');
    await r.next(); assert.equal(r.content().text, '下二页。');
});

test('预先准备的 CG 页计划保持现有 SFW/NSFW、换场、停留与新角色退场规则', () => {
    const segments = ['[白墨]：甲。', '乙。', '[小林]：丙。', '丁。', '[白墨]：戊。', '己。', '庚。'];
    for (const mode of ['sfw', 'nsfw', 'switch']) for (const holdPages of [1, 2, 4]) {
        let source = `[igs-scene:室内|上午|晴${mode === 'nsfw' ? '|nsfw' : ''}]\n`;
        const offsets = [];
        for (let i = 0; i < segments.length; i++) {
            if (mode === 'switch' && i === 3) source += '[igs-scene:室外|晚上|晴|nsfw]\n';
            offsets.push(source.length); source += segments[i] + '\n';
            if (i === 0 || i === 4) source += `[igs-img:${i + 1}]\n`;
        }
        const input = { source, offsets, segments, holdPages };
        assert.deepEqual(prepareIllustrationPages(input), segments.map((_, index) => resolveIllustrationForPage({ ...input, index })));
    }
});

test('演出与 NSFW 连续段在整楼准备时完成，翻页只取当前页的状态', () => {
    const raw = '[igs-scene:室内|晚上|晴|nsfw]\n[igs-fx:letterbox]\n[igs-char:白墨|平和|你好。]\n[igs-fx:letterbox-end]\n[igs-char:白墨|喜悦|再见。]';
    const sceneAssets = { enabled: true, characters: { 白墨: { 平和: 'calm.png' } } };
    const extracted = buildIgsTextPayload(raw, { sceneAssets });
    const floor = prepareReaderFloor({ text: extracted.formattedText, segments: extracted.textSegments, extracted,
        payload: { raw }, scene: {}, readerSettings: { _sceneAssets: sceneAssets } });
    assert.equal(floor.pages.length, 2);
    assert.deepEqual(floor.pages.map(p => p.fx), floor.pages.map((p, i) => resolveFxAtPage(floor.fxDirectives, p.fxOffset, i ? floor.offsets[i - 1] : -1)));
    assert.equal(floor.pages[0].fx.letterbox, true); assert.equal(floor.pages[1].fx.letterbox, false);
    assert.equal(floor.pages[1].nsfwSpan.length, 2); assert.equal(floor.pages[1].nsfwSpan.index, 1);
});

test('表格行索引保持姓名首列、标准 row_id、别名和旧格式标题的查找顺序', () => {
    const aliases = { 白墨: ['阿墨'] };
    for (const table of [
        { columns: ['姓名', '好感度'], rows: [['阿墨', '30/100'], ['白墨', '60/100']] },
        { columns: ['row_id', '姓名', '好感度'], rows: [[1, '阿墨', '30/100'], [2, '白墨', '60/100']] },
        { columns: ['row_id', '内容'], rows: [[1, '阿墨 好感度:30/100'], [2, '白墨 好感度:60/100']] },
    ]) {
        const lookup = createStatusHudRowLookup(table);
        for (const name of ['白墨', '阿墨', '不存在']) assert.deepEqual(lookup(name, aliases), findStatusHudRow(table, name, aliases));
    }
});

test('新生成素材按原有素材键补齐，只更新依赖该角色的匹配', t => {
    const checks = [];
    let temp = '';
    const generatedAssets = { hasUnavailableImages: () => true,
        isUnavailableImage(url) { checks.push(url); return false; }, tempSprite: name => name === '白墨' ? temp : '',
        resolveUrl: ref => `blob:fixture/${ref.slice(8)}` };
    const sceneAssets = { enabled: true, characters: { 白墨: {}, 小林: { 平和: 'igs-gen:lin' } } };
    const r = reader(t, { sceneAssets, generatedAssets, raw: '[igs-char:白墨|平和|第一句话。]\n[igs-char:小林|平和|第二句话。]' });
    checks.length = 0;
    temp = 'igs-gen:new-bai';
    r.image({ reason: 'generated', chatId: 'floor-preparation-fixture', key: 'floor-preparation-fixture|char|白墨' });
    assert.equal(r.content().spriteImage, 'blob:fixture/new-bai');
    assert.equal(checks.includes('igs-gen:lin'), false);
});

test('演出顺序准备与独立逐页解析一致，区间状态不回写已经准备好的页', () => {
    const source = ['[igs-fx:call|白墨|in|video]', '[igs-fx:stage|back|白墨]', '[igs-fx:react|白墨|喜悦]',
        '[igs-fx:letterbox]', '[igs-fx:romance|close|白墨]', '[igs-fx:stage|leave|白墨]',
        '[igs-fx:call-end|missed]', '[igs-fx:stage|reset]', '[igs-fx:letterbox-end]', '[igs-fx:romance-end]'].join('\n正文。\n');
    const directives = extractFxDirectives(source);
    const resolve = createFxPageResolver(directives);
    let previous = -1;
    const saved = [];
    for (const d of directives) {
        const at = d.offset + 1;
        const result = resolve(at, previous);
        assert.deepEqual(result, resolveFxAtPage(directives, at, previous));
        saved.push({ result, copy: structuredClone(result) });
        previous = at;
    }
    for (const item of saved) assert.deepEqual(item.result, item.copy);
});

test('后到的物品事件只定位新物品，不在每一页重新扫描整楼', () => {
    const raw = '[igs-char:白墨|平和|第一句话。]\n门口放着一本书。\n[igs-char:小林|平和|第二句话。]';
    const sceneAssets = { enabled: true };
    const extracted = buildIgsTextPayload(raw, { sceneAssets });
    const floor = prepareReaderFloor({ text: extracted.formattedText, segments: extracted.textSegments, extracted,
        payload: { raw }, scene: {}, readerSettings: { _sceneAssets: sceneAssets } });
    const events = [{ action: 'gain', name: '书' }];
    const fx = () => ({ items: [], itemOverflow: 0 });
    assert.equal(mergeItemEvents(fx(), { events, index: 0, pageFor: floor.itemPageFor }).items.length, 0);
    assert.equal(mergeItemEvents(fx(), { events, index: 1, pageFor: floor.itemPageFor }).items.length, 1);
    assert.equal(floor.itemPageFor('书'), 1);
    assert.equal(floor.itemPageFor('后到物品'), 0);
});
