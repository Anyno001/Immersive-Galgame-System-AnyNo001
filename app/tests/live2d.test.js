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
test('live2d: storage is isolated per card, corrupt data is safe, failures surfaced', () => {
    const storage = createMemoryStorage(); saveLive2dConfig(storage, 'card:A', config);
    assert.equal(readLive2dConfig(storage, 'card:A').bindings['爱音'].url, url);
    assert.equal(Object.keys(readLive2dConfig(storage, 'card:B').bindings).length, 0);
    assert.equal(Object.keys(readLive2dConfig({ getItem: () => '{' }).bindings).length, 0);
    assert.throws(() => saveLive2dConfig(null, 'card:A', config));
});
function open(raw, { images = {}, enabled = true, bound = true, statusHud = {}, live2dEnabled = true, aliases = {}, moodGroups, stageCast, segmentIndex = 0, live2d = config } = {}) {
    const storage = createMemoryStorage(); if (bound) saveLive2dConfig(storage, '', { ...live2d, enabled: live2dEnabled });
    const host = createIgsReaderHost({ global: { localStorage: storage }, getUnifiedSettings: () => ({ bridge: { sceneAssets: { enabled, scenes: {}, characters: images, characterAliases: aliases, moodGroups } }, readerSettings: { statusHud, stageCast } }) });
    const result = host.openReader({ messageId: 1, message: { id: 1, text: raw }, raw }, { mode: 'pc' });
    for (let i = 0; i < segmentIndex; i++) result.controller.invokeAction('next');
    const snapshot = result.controller.getSnapshot(); host.destroy(); return snapshot;
}
test('live2d: reader resolves model even without any static sprite', () => {
    const s = open('[igs-char:爱音|开心|你好。]');
    assert.equal(s.content.spriteImage, null);
    assert.equal(s.content.spriteCharacter, '爱音');
    assert.equal(s.content.spriteLive2d.action.expression, 'smile');
});
test('live2d: enabled model suppresses static fallback and preserves raw mood', () => {
    const s = open('[igs-char:爱音|开心|你好。]', { images: { '爱音': { '默认': 'https://example.com/fallback.png' } } });
    assert.equal(s.content.spriteImage, null);
    assert.equal(s.content.spriteMatch, null);
    assert.equal(s.content.spriteMood, '开心');
    assert.equal(s.content.spriteLive2d.mood, '开心');
});
test('live2d: unconfigured reader preserves original image path', () => {
    const s = open('[igs-char:爱音|开心|你好。]', { bound: false, images: { '爱音': { '默认': 'https://example.com/fallback.png' } } });
    assert.equal(s.content.spriteLive2d, null); assert.equal(s.content.spriteMood, '默认');
});
test('live2d: scene-assets master switch still wins', () => {
    assert.equal(open('[igs-char:爱音|开心|你好。]', { enabled: false }).content.spriteLive2d, null);
});
test('live2d: nsfw hide does not resurrect the model', () => {
    const s = open('[igs-scene:房间|夜晚|晴|NSFW]\n[igs-char:爱音|开心|你好。]', { statusHud: { nsfwSpriteMode: 'hide' } });
    assert.equal(s.content.spriteLive2d, null);
});
test('live2d: sandbox document carries channel and runtime without external module imports', () => {
    const doc = live2dFrameDocument('test-channel');
    assert.match(doc, /test-channel/); assert.match(doc, /event.source !== parent/);
    assert.match(doc, /pixi.js@6.5.10/); assert.match(doc, /pixi-live2d-display@0.4.0/);
    assert.ok(doc.endsWith('</script>'));
});
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
test('live2d: runtime only accepts matching parent+channel', async () => {
    const h = runtimeHarness(); h.send({}, {}, 'channel'); h.send({}, undefined, 'wrong'); await settle();
    assert.equal(h.calls.loaded, undefined); h.send({}); await settle(); assert.equal(h.calls.loaded,1);
});
test('live2d: same-model updates reuse instance without adding duplicate tickers', async () => {
    const h = runtimeHarness(); h.send({action:{expression:'smile'}}); await settle();
    for(let i=0;i<8;i++)h.send({action:{expression:'smile'}});
    await settle(); assert.equal(h.calls.loaded,1); assert.equal(h.calls.tickers,1); assert.deepEqual(h.calls.expressions,['reset','smile']);
    assert.deepEqual(h.calls.position,[300,0]);
});
test('live2d: pause stops both render and model ticker; resume restores them', async () => {
    const h = runtimeHarness(); h.send({}); await settle(); h.send({paused:true});
    assert.equal(h.calls.running,false); assert.equal(h.calls.tickers,2);
    h.send({paused:true}); assert.equal(h.calls.tickers,2);
    h.send({paused:false}); assert.equal(h.calls.running,true); assert.equal(h.calls.tickers,3);
});
test('live2d: mood transitions reset stale expression, and unloading destroys model', async () => {
    const h = runtimeHarness(); h.send({action:{expression:'smile',motion:'TapBody',index:0}}); await settle();
    assert.deepEqual(h.calls.motions,[['TapBody',0]]);
    h.send({action:{}}); await settle(); assert.equal(h.calls.expressions.at(-1),'reset');
    h.events.pagehide(); assert.equal(h.calls.destroyed,1);
});

test('live2d: slow previous expression cannot overwrite latest mood', async () => {
    const h = runtimeHarness(); let release;
    h.model.expression = async (name) => { h.calls.expressions.push(name); if(name === 'slow') await new Promise(r => release = r); return true; };
    h.send({action:{expression:'slow'}}); await settle();
    h.send({action:{expression:'latest'}}); release(); await settle();
    assert.equal(h.calls.expressions.at(-1),'latest');
    assert.equal(h.reports.filter(r=>r.type==='action').at(-1).action.expression,'latest');
    assert.equal(h.reports.filter(r=>r.type==='action' && r.action.expression==='slow').length,0);
});
test('live2d: expression-default-same-expression is reapplied', async () => {
    const h = runtimeHarness(); h.send({action:{expression:'smile'}}); await settle();
    h.send({action:{}}); await settle(); h.send({action:{expression:'smile'}}); await settle();
    assert.equal(h.calls.expressions.filter(x=>x==='smile').length,2);
});

test('live2d: preset names resolve synonyms, explicit legacy mappings win', () => {
    const c = normalizeLive2dConfig({ bindings: { 爱音: { url, moods: { 喜悦: { expression: 'joy' }, 愤怒: { motion: 'angry', index: 0 }, 开心: { expression: 'legacy' }, '*': { expression: 'base' } } } } });
    assert.equal(resolveLive2dBinding(c, '爱音', '高兴').action.expression, 'joy');
    assert.equal(resolveLive2dBinding(c, '爱音', '开心').action.expression, 'legacy');
    assert.equal(resolveLive2dBinding(c, '爱音', '生气').action.motion, 'angry');
    assert.equal(resolveLive2dBinding(c, '爱音', '未识别').action.expression, 'base');
    const custom = [{ label: '自建组', words: ['雀跃'] }];
    const b = normalizeLive2dConfig({ bindings: { 爱音: { url, moods: { 自建组: { expression: 'custom' } } } } });
    assert.equal(resolveLive2dBinding(b, '爱音', '雀跃', '', custom).action.expression, 'custom');
});
test('live2d: disabling or removing model restores untouched static sprites', () => {
    const images = { 爱音: { 默认: 'https://example.com/base.png', 喜悦: 'https://example.com/joy.png' } };
    const before = JSON.stringify(images);
    assert.equal(open('[igs-char:爱音|喜悦|你好。]', { images }).content.spriteImage, null);
    const disabled = open('[igs-char:爱音|喜悦|你好。]', { images, live2dEnabled: false });
    assert.equal(disabled.content.spriteLive2d, null);
    assert.equal(disabled.content.spriteImage, images.爱音.喜悦);
    assert.equal(open('[igs-char:爱音|喜悦|你好。]', { images, bound: false }).content.spriteImage, images.爱音.喜悦);
    assert.equal(JSON.stringify(images), before);
});
test('live2d: only bound character pauses static sprites, aliases share model', () => {
    const images = { 爱音: { 默认: 'https://example.com/anon.png' }, 灯: { 默认: 'https://example.com/tomori.png' } };
    const alias = open('[igs-char:小爱|开心|你好。]', { images, aliases: { 爱音: ['小爱'] } });
    assert.equal(alias.content.spriteImage, null);
    assert.equal(alias.content.spriteLive2d.action.expression, 'smile');
    const other = open('[igs-char:灯|平和|你好。]', { images });
    assert.equal(other.content.spriteLive2d, null);
    assert.equal(other.content.spriteImage, images.灯.默认);
    assert.equal(resolveCharacterLive2dBinding(normalizeLive2dConfig(config), { characterAliases: { 爱音: ['小爱'] } }, '小爱', '开心').action.expression, 'smile');
});
test('live2d: reader maps original preset groups and user groups to model actions', () => {
    const live2d = { bindings: { 爱音: { url, moods: { 喜悦: { expression: 'joy' }, 自定义: { expression: 'special' } } } } };
    assert.equal(open('[igs-char:爱音|高兴|你好。]', { live2d }).content.spriteLive2d.action.expression, 'joy');
    assert.equal(open('[igs-char:爱音|雀跃|你好。]', { live2d, moodGroups: [{ label: '自定义', words: ['雀跃'] }] }).content.spriteLive2d.action.expression, 'special');
});
test('live2d: bound companions do not return as static cast sprites', () => {
    const raw = '[igs-char:爱音|开心|我先说。]\n[igs-char:灯|平和|我来接话。]';
    const images = { 爱音: { 默认: 'https://example.com/anon.png' }, 灯: { 默认: 'https://example.com/tomori.png' } };
    const opts = { images, stageCast: { enabled: true }, segmentIndex: 1 };
    const enabled = open(raw, opts);
    assert.equal(enabled.content.spriteCharacter, '灯');
    assert.equal(enabled.content.spriteImage, images.灯.默认);
    assert.ok(!enabled.content.castSprites.some(m => m.character === '爱音'));
    const disabled = open(raw, { ...opts, live2dEnabled: false });
    assert.ok(disabled.content.castSprites.some(m => m.character === '爱音' && m.image === images.爱音.默认));
});

test('live2d: legacy model binding on alias also disables canonical static sprite', () => {
    const images = { 爱音: { 默认: 'https://example.com/anon.png' } };
    const live2d = { bindings: { 小爱: { url, moods: { 喜悦: { expression: 'joy' } } } } };
    for (const name of ['小爱', '爱音']) {
        const s = open('[igs-char:' + name + '|高兴|你好。]', { images, live2d, aliases: { 爱音: ['小爱'] } });
        assert.equal(s.content.spriteImage, null);
        assert.equal(s.content.spriteLive2d.action.expression, 'joy');
    }
});
