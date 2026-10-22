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

test('正文缓存超出八楼后批量释放解析和准备结果，最近阅读楼复用且下一楼不再清理', () => {
    const cache = createReaderSourceCache({ parse: input => ({ text: input }) });
    for (let index = 0; index < 8; index++) {
        cache.get(`floor-${index}`, `${index}`);
        cache.prepare(`floor-${index}`, [], () => ({ floor: index }));
    }
    const current = cache.prepare('floor-0', [], () => assert.fail('must reuse preparation'));
    cache.get('floor-8', '8'); assert.equal(cache.size(), 6);
    const prepared = []; cache.visitPrepared(value => prepared.push(value));
    assert.equal(prepared.includes(current), true);
    assert.equal(prepared.some(value => [1, 2, 3].includes(value.floor)), false);
    assert.equal(cache.get('floor-0', '0').hit, true);
    assert.equal(cache.prepare('floor-0', [], () => null), current);
    cache.get('floor-9', '9'); assert.equal(cache.size(), 7);
    assert.equal(cache.get('floor-4', '4').hit, true);
    assert.equal(cache.getParseCount(), 10); cache.invalidate(); assert.equal(cache.size(), 0);
});

test('读图失败匹配只检查当前角色，原装未命中仍走同角色图库与别名兜底', () => {
    const characters = { 白墨: { 喜悦: 'igs-gen:lost', 平和: 'igs-gen:calm' } };
    for (let i = 0; i < 1000; i++) characters[`其他${i}`] = { 平和: `igs-gen:other-${i}` };
    const checks = [];
    const ctx = { sceneAssets: { characters, characterAliases: { 白墨: ['阿墨'] } },
        isUnavailableImage(url) { checks.push(url); return url === 'igs-gen:lost'; } };
    assert.equal(resolveSpriteAsset('阿墨', '喜悦', ctx).url, 'igs-gen:calm');
    assert.ok(checks.length < 12);
    assert.equal(checks.some(url => url.includes('other-')), false);
    ctx.sceneAssets.characters.白墨 = {};
    ctx.generatedAssets = { characters: { 白墨: { 平和: 'igs-gen:library' } } };
    assert.equal(resolveSpriteAsset('阿墨', '惊艳', ctx).url, 'igs-gen:library');
});

test('单图丢失与恢复只补受影响的匹配，其他角色不重查', async t => {
    const missing = new Set(), checks = [];
    const generatedAssets = { hasUnavailableImages: () => true,
        isUnavailableImage(url) { checks.push(url); return missing.has(url); },
        resolveUrl: ref => missing.has(ref) ? '' : `blob:fixture/${ref.slice(8)}` };
    const sceneAssets = { enabled: true, characters: { 白墨: { 喜悦: 'igs-gen:joy', 平和: 'igs-gen:calm' }, 小林: { 平和: 'igs-gen:lin' } } };
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
