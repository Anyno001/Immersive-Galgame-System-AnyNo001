import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage } from '../src/index.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';
import { live2dUrl, normalizeLive2dConfig, readLive2dConfig, saveLive2dConfig, resolveLive2dBinding, resolveCharacterLive2dBinding } from '../src/visual/igs-ui/live2d-config.js';
import { live2dFrameDocument } from '../src/visual/igs-ui/live2d-frame.js';
const url = 'https://example.com/models/test.model3.json';
const config = { bindings: { '爱音': { url, moods: { '开心': { expression: 'smile', motion: 'TapBody', index: 1 }, '*': {} } } } };
test('live2d: configuration and mood fallback', () => {
    const c = normalizeLive2dConfig(config);
    assert.equal(resolveLive2dBinding(c, '爱音', '开心').action.expression, 'smile');
    assert.deepEqual(resolveLive2dBinding(c, '爱音', '未知').action, {});
    assert.equal(resolveLive2dBinding(c, '陌生人', '开心'), null);
    assert.equal(resolveLive2dBinding({ ...c, enabled: false }, '爱音', '开心'), null);
    assert.equal(resolveLive2dBinding(c, '昵称', '开心', '爱音').url, url);
});
test('live2d: rejects active URL schemes and embedded credentials', () => {
    for (const value of ['javascript:alert(1)', 'file:///secret', 'data:application/json,{}', 'https://user:pass@example.com/model.json']) assert.throws(() => live2dUrl(value));
    assert.equal(live2dUrl(url), url);
});
test('live2d: validates action indices and layout', () => {
    assert.throws(() => normalizeLive2dConfig({ bindings: { x: { url, moods: { a: { motion: 'idle', index: -1 } } } } }));
    assert.throws(() => normalizeLive2dConfig({ bindings: { x: { url, layout: { scale: 501 } } } }));
    assert.deepEqual(normalizeLive2dConfig({ bindings: { x: { url, layout: { scale: '120', posX: '' } } } }).bindings.x.layout, { scale: 120 });
});
function open(raw, { images = {}, enabled = true, bound = true, statusHud = {}, live2dEnabled = true, aliases = {}, moodGroups, stageCast, segmentIndex = 0, live2d = config } = {}) {
    const storage = createMemoryStorage(); if (bound) saveLive2dConfig(storage, '', { ...live2d, enabled: live2dEnabled });
    const host = createIgsReaderHost({ global: { localStorage: storage }, getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled, scenes: {}, characters: images, characterAliases: aliases, moodGroups } }, readerSettings: { statusHud, stageCast } }) });
    const result = host.openReader({ messageId: 1, message: { id: 1, text: raw }, raw }, { mode: 'pc' });
    for (let i = 0; i < segmentIndex; i++) result.controller.invokeAction('next');
    const snapshot = result.controller.getSnapshot(); host.destroy(); return snapshot;
}
import vm from 'node:vm';
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
function runtimeHarness() {
    const events = {}, reports = [], calls = { tickers: 0, motions: [], expressions: [], stopped: 0, destroyed: 0 };
    let ticking = false;
    const model = { internalModel: { width: 400, height: 800, motionManager: { stopAllMotions: () => calls.stopped++, expressionManager: { resetExpression() { calls.expressions.push('reset'); } } } }, scale: { set(v) { calls.scale = v; } }, position: { set(x,y) { calls.position = [x,y]; } }, get autoUpdate() { return ticking; }, set autoUpdate(v) { ticking = v; calls.tickers++; }, async expression(name) { calls.expressions.push(name); return true; }, async motion(group,index) { calls.motions.push([group,index]); return true; }, destroy() { calls.destroyed++; } };
    const parent = { postMessage: (message) => reports.push(message) };
    const context = { parent, console, innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1, addEventListener: (name, cb) => { events[name] = cb; }, requestAnimationFrame: (cb) => cb(), document: { createElement: () => ({}), head: { append: (el) => el.onload() }, body: { append() {} } }, fetch: async () => ({ ok: true, url, json: async () => ({ FileReferences: { Moc:'sample.moc3', Textures:[], Expressions:[{Name:'smile'}], Motions:{TapBody:[{}]} } }) }), PIXI: { Application: class { constructor() { this.view = {}; this.stage = { addChild() {} }; } start() { calls.running = true; } stop() { calls.running = false; } render() {} destroy() {} }, live2d: { Live2DModel: { async from() { calls.loaded = (calls.loaded || 0) + 1; return model; } } } } };
    context.window = context;
    const html = live2dFrameDocument('channel');
    vm.runInNewContext(html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), context);
    return { events, reports, calls, model, send(state, source = parent, channel = 'channel') { events.message({source,data:{channel,type:'update',state:{url,runtime:{core2:url,core4:url},layout:{scale:100,posX:50,posY:100},...state}}}); } };
}