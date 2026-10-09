import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeEl, makeTimers } from './helpers/fake-dom.js';
import { registerDlcSkin, resetDlcSkinsForTest, getDlcSkin } from '../src/visual/igs-ui/dlc-skin-registry.js';
import { guardDlcCss, rescopeSkinRules } from '../src/visual/igs-ui/dlc-css-guard.js';
import { getDialogSkinStyleText } from '../src/visual/igs-ui/dialog-skin-style.js';
import { normalizeDialogSkin, isMaterialDialogSkin } from '../src/visual/igs-ui/classic-dialog-skin.js';
import { getDialogSkinChoices, dialogSkinLabel } from '../src/visual/igs-ui/dialog-skin-catalog.js';
import { getReferenceDialogTypography } from '../src/visual/igs-ui/dialog-theme-typography.js';
import { worldviewDialogSkins } from '../src/visual/igs-ui/worldview-skins.js';
import { supportsDialogAutoHeight } from '../src/visual/igs-ui/dialog-theme-skins.js';
import { getTitleScreenStyleText } from '../src/visual/igs-ui/title-screen.js';
import { resolveChatTheme } from '../src/visual/igs-ui/chat-themes.js';
import { resolveUiSfxFamily } from '../src/visual/igs-ui/ui-sfx.js';
import { normalizeDlcFxSettings, registerDlcFx, resetDlcFxForTest } from '../src/scene/fx-registry.js';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { cancelDlcFx, resetDlcFxRuntimeForTest, syncDlcFx } from '../src/visual/igs-ui/dlc-fx-runtime.js';
import { dlcFxGrammarLines, resolveDlcFxPromptRule } from '../src/visual/igs-ui/fx-prompt.js';
import { createStageFxApi, createUiSkinsApi, drainDlcQueue } from '../src/api/dlc-api.js';
import { normalizeReaderSettings } from '../src/visual/igs-ui/settings-host-normalize.js';

const FRAME = {
    height: 200, image: 'https://example.com/d.png', slice: [120, 120], left: 110, right: 110,
    text: { top: 30, speakerTop: 38, right: 56, bottom: 26, left: 56 },
    plate: { image: 'https://example.com/n.png', slice: [40, 40], left: 36, right: 36, height: 50, x: 28, rise: 30, lineHeight: 50, padding: '0 40px', minWidth: 150 },
};
const quiet = (fn) => { const warn = console.warn; const error = console.error; console.warn = () => {}; console.error = () => {}; try { return fn(); } finally { console.warn = warn; console.error = error; } };

function reset() {
    resetDlcSkinsForTest();
    resetDlcFxForTest();
    resetDlcFxRuntimeForTest();
}

test('gate:dlc-skin:css-guard-keeps-own-scope-only', () => {
    const allow = (s) => s.startsWith('#igs-overlay') && s.includes('[data-igs-dialog-skin="dlc-a"]');
    const { css, warnings } = guardDlcCss(`
        #igs-overlay[data-igs-dialog-skin="dlc-a"] .igs-text{color:#333}
        body{display:none}
        #igs-overlay[data-igs-dialog-skin="dlc-a"] .igs-text, .mes{color:red}
        @import url(x.css);
        @media (max-width:640px){#igs-overlay[data-igs-dialog-skin="dlc-a"] .igs-speaker{font-size:14px}.mes{x:1}}
        @keyframes dlc-fall{to{opacity:0}}
        @keyframes bad{to{opacity:0}}
        #igs-overlay[data-igs-dialog-skin="dlc-a"] .igs-dialog{background:url(http://evil/x.png)}
        #igs-overlay[data-igs-dialog-skin="dlc-a"] .igs-dialog{background:url("https://ok/x.png")}`, { allow });
    assert.match(css, /\.igs-text\{color:#333\}/);
    assert.match(css, /@media \(max-width:640px\)\{#igs-overlay\[data-igs-dialog-skin="dlc-a"\] \.igs-speaker/);
    assert.match(css, /@keyframes dlc-fall/);
    assert.match(css, /https:\/\/ok\/x\.png/);
    assert.doesNotMatch(css, /body|\.mes|evil|@import|keyframes bad/);
    assert.ok(warnings.length >= 5);
    assert.equal(guardDlcCss('a{', { allow }).css, '');
});

test('gate:dlc-skin:rescope-copies-only-that-skin', () => {
    const src = '#igs-overlay[data-igs-dialog-skin="a"] .x,#igs-overlay[data-igs-dialog-skin="b"] .x{c:1}\n@media (x){#igs-overlay[data-igs-dialog-skin="a"] .y{c:2}}\n.z{c:3}';
    const out = rescopeSkinRules(src, 'a', 'dlc-q');
    assert.equal(out, '#igs-overlay[data-igs-dialog-skin="dlc-q"] .x{c:1}\n@media (x){#igs-overlay[data-igs-dialog-skin="dlc-q"] .y{c:2}}');
});

test('gate:dlc-skin:saved-dlc-skin-survives-when-not-loaded', () => {
    reset();
    assert.equal(normalizeDialogSkin('dlc-sakura'), 'dlc-sakura');
    assert.equal(normalizeDialogSkin('dlc-'), 'default');
    assert.equal(normalizeDialogSkin('DLC-X'), 'default');
    assert.equal(normalizeReaderSettings({ dialogSkin: 'dlc-sakura' }).dialogSkin, 'dlc-sakura');
    assert.equal(isMaterialDialogSkin({ dialogSkin: 'dlc-sakura' }), false, '没加载时按磨砂玻璃布局');
    assert.equal(getDialogSkinStyleText('dlc-sakura'), '');
    assert.equal(dialogSkinLabel('dlc-sakura'), 'dlc-sakura（DLC 未加载）');
    assert.deepEqual(getDialogSkinChoices('dlc-sakura').at(-1), ['dlc-sakura', 'dlc-sakura（DLC 未加载）']);
});

test('gate:dlc-skin:register-wires-every-skin-table', () => {
    reset();
    const result = quiet(() => registerDlcSkin({ id: 'dlc-sakura', label: '樱花信笺', inherit: 'cute-pink', worldviews: ['modern'], accent: '#e88aa8', sfx: 'paper', frame: FRAME,
        typography: { nameColor: '#fff', textColor: 'bad;' },
        css: '#igs-overlay[data-igs-dialog-skin="dlc-sakura"] .igs-text{color:#333} body{x:1}' }));
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((w) => w.includes('body')));
    assert.ok(result.warnings.some((w) => w.includes('textColor')));
    const css = getDialogSkinStyleText('dlc-sakura');
    assert.match(css, /border-image:url\("https:\/\/example\.com\/d\.png"\)/, '三片骨架');
    assert.match(css, /\.igs-text\{color:#333\}/, '作者 CSS');
    assert.match(css, /\[data-igs-dialog-skin="dlc-sakura"\] #igs-status-hud/, '借来的状态栏换了作用域');
    assert.doesNotMatch(css, /"cute-pink"/, '不漏内置皮肤 id');
    assert.ok(css.indexOf('.igs-text{color:#333}') > css.indexOf('#igs-status-hud'), '作者 CSS 排在借来的样式之后');
    assert.equal(isMaterialDialogSkin({ dialogSkin: 'dlc-sakura' }), true);
    assert.equal(supportsDialogAutoHeight('dlc-sakura'), true);
    assert.equal(dialogSkinLabel('dlc-sakura'), '樱花信笺');
    assert.deepEqual(getDialogSkinChoices().at(-1), ['dlc-sakura', '樱花信笺 · DLC']);
    assert.equal(getReferenceDialogTypography('dlc-sakura').nameColor, '#fff');
    assert.equal(getReferenceDialogTypography('dlc-sakura').textFont, getReferenceDialogTypography('cute-pink').textFont);
    assert.ok(worldviewDialogSkins('modern').includes('dlc-sakura'));
    assert.ok(!worldviewDialogSkins('horror').includes('dlc-sakura'));
    assert.ok(getTitleScreenStyleText().includes('[data-igs-title-skin="dlc-sakura"]{'));
    assert.ok(getTitleScreenStyleText().includes('--igs-ts-accent:#e88aa8'));
    assert.equal(resolveChatTheme('dlc-sakura').key, 'cute-pink');
    assert.equal(resolveUiSfxFamily('dlc-sakura'), 'paper');
});

test('gate:dlc-skin:rejects-bad-ids-and-glass-base-has-no-frame', () => {
    reset();
    for (const id of ['sakura', 'dlc-', 'dlc-A', 'dlc-x_y', `dlc-${'a'.repeat(41)}`]) {
        assert.equal(registerDlcSkin({ id, label: 'x' }).ok, false, id);
    }
    assert.equal(registerDlcSkin({ id: 'dlc-x' }).reason, 'missing-label');
    const glass = quiet(() => registerDlcSkin({ id: 'dlc-glass', label: '玻璃', frame: FRAME, base: 'glass' }));
    assert.equal(glass.ok, true);
    assert.equal(getDlcSkin('dlc-glass').hasFrame, false);
    assert.equal(isMaterialDialogSkin({ dialogSkin: 'dlc-glass' }), false);
    assert.doesNotMatch(getDialogSkinStyleText('dlc-glass'), /border-image/);
    const badFrame = quiet(() => registerDlcSkin({ id: 'dlc-bad', label: '坏框', frame: { ...FRAME, image: 'http://x/d.png' } }));
    assert.equal(badFrame.ok, true);
    assert.equal(getDlcSkin('dlc-bad').base, 'glass', '框不合格时退回玻璃');
});

test('gate:dlc-fx:parser-knows-only-registered-kinds', () => {
    reset();
    assert.equal(parseFxBody('dlc-petals|轻'), null, '没登记的 DLC 标签剥掉');
    registerDlcFx({ kind: 'dlc-petals', label: '花瓣', play() {} });
    registerDlcFx({ kind: 'dlc-rain', label: '红雨', mode: 'range', play() {} });
    assert.deepEqual(parseFxBody('dlc-petals|轻|快'), { kind: 'dlc-petals', end: false, args: ['轻', '快'], dlc: true });
    assert.equal(parseFxBody('dlc-petals-end'), null, '瞬时没有 -end');
    assert.deepEqual(parseFxBody('dlc-rain-end'), { kind: 'dlc-rain', end: true, args: [], dlc: true });
    const text = ['A', '[igs-fx:dlc-rain|浓]', '[igs-fx:dlc-petals|轻]', 'B', '[igs-fx:dlc-petals|重]', 'C', '[igs-fx:dlc-rain-end]', 'D'].join('\n');
    const d = extractFxDirectives(text);
    const at = (s) => text.indexOf(s);
    const b = resolveFxAtPage(d, at('B'), at('A'));
    assert.deepEqual(b.dlc, [{ kind: 'dlc-petals', args: ['轻'] }]);
    assert.deepEqual(b.dlcRanges, { 'dlc-rain': ['浓'] });
    const c = resolveFxAtPage(d, at('C'), at('B'));
    assert.deepEqual(c.dlc, [{ kind: 'dlc-petals', args: ['重'] }], '每页只收自己页的瞬时');
    assert.deepEqual(c.dlcRanges, { 'dlc-rain': ['浓'] });
    const dd = resolveFxAtPage(d, at('D'), at('C'));
    assert.deepEqual(dd.dlc, []);
    assert.deepEqual(dd.dlcRanges, {});
});

function fxStage() {
    const timers = makeTimers();
    const doc = { createElement: (tag) => new FakeEl(doc, tag), defaultView: { setTimeout: timers.schedule, clearTimeout: timers.clear, AbortController } };
    const root = new FakeEl(doc, 'div');
    const front = new FakeEl(doc, 'div');
    const stage = new FakeEl(doc, 'div');
    root.appendChild(stage); root.appendChild(front);
    return { root, layers: { front, stage, doc }, timers };
}
const snap = (fx, readerSettings = {}) => ({ content: { fx }, readerSettings });

test('gate:dlc-fx:runtime-plays-cleans-and-isolates', () => {
    reset();
    const calls = [];
    registerDlcFx({ kind: 'dlc-petals', label: '花瓣', lifeMs: 1000, play(ctx) {
        const el = ctx.doc.createElement('div');
        ctx.spawn(el);
        calls.push({ args: ctx.args, layer: ctx.layer, reduced: ctx.reduced });
        return () => calls.push('cleanup-petals');
    } });
    registerDlcFx({ kind: 'dlc-rain', label: '红雨', mode: 'range', layer: 'stage', play(ctx) {
        ctx.spawn(ctx.doc.createElement('i'));
        calls.push(`rain:${ctx.args[0]}`);
        ctx.signal.addEventListener('abort', () => calls.push('rain-aborted'));
    } });
    registerDlcFx({ kind: 'dlc-boom', label: '爆', play() { throw new Error('boom'); } });
    const { root, layers, timers } = fxStage();
    const fx = { dlc: [{ kind: 'dlc-petals', args: ['轻'] }, { kind: 'dlc-boom', args: [] }], dlcRanges: { 'dlc-rain': ['浓'] } };
    const played = quiet(() => syncDlcFx(root, snap(fx), layers, { pageKey: 'p1', reduced: true }));
    assert.deepEqual(played, ['dlc-petals', 'dlc-rain']);
    assert.equal(calls[0].layer, layers.front);
    assert.equal(calls[0].reduced, true);
    assert.equal(layers.front.children.length, 1);
    assert.equal(layers.stage.children.length, 1);
    // 同页重绘不重播；崩过的演出不再调用。
    assert.deepEqual(quiet(() => syncDlcFx(root, snap(fx), layers, { pageKey: 'p1' })), []);
    // 到期自动收。
    timers.advance(1000);
    assert.ok(calls.includes('cleanup-petals'));
    assert.equal(layers.front.children.length, 0);
    // 区间参数不变不重开；离开区间时清理。
    syncDlcFx(root, snap({ dlc: [], dlcRanges: { 'dlc-rain': ['浓'] } }), layers, { pageKey: 'p2' });
    assert.equal(calls.filter((c) => c === 'rain:浓').length, 1);
    syncDlcFx(root, snap({ dlc: [], dlcRanges: {} }), layers, { pageKey: 'p3' });
    assert.ok(calls.includes('rain-aborted'));
    assert.equal(layers.stage.children.length, 0);
    // 设置里关掉的不播；关阅读器全清。
    assert.deepEqual(syncDlcFx(root, snap({ dlc: [{ kind: 'dlc-petals', args: [] }], dlcRanges: {} }, { dlcFx: { 'dlc-petals': false } }), layers, { pageKey: 'p4' }), []);
    syncDlcFx(root, snap({ dlc: [], dlcRanges: { 'dlc-rain': ['淡'] } }), layers, { pageKey: 'p5' });
    assert.equal(cancelDlcFx(root), true);
    assert.equal(layers.stage.children.length, 0);
    assert.equal(timers.size(), 0, '没有残留计时器');
});

test('gate:dlc-fx:settings-and-prompt', () => {
    reset();
    assert.deepEqual(normalizeDlcFxSettings({ 'dlc-a': false, 'dlc-b': true, other: false }), { 'dlc-a': false });
    assert.deepEqual(normalizeReaderSettings({ dlcFx: { 'dlc-a': false, 'dlc-b': true } }).dlcFx, { 'dlc-a': false });
    registerDlcFx({ kind: 'dlc-petals', label: '花瓣', prompt: '浪漫或离别时撒花', play() {} });
    registerDlcFx({ kind: 'dlc-rain', label: '红雨', mode: 'range', prompt: '血色场面', play() {} });
    registerDlcFx({ kind: 'dlc-silent', label: '无说明', play() {} });
    assert.equal(dlcFxGrammarLines({}).length, 2, '没写说明的不告诉模型');
    assert.match(resolveDlcFxPromptRule({}), /dlc-rain … dlc-rain-end/);
    assert.equal(dlcFxGrammarLines({ 'dlc-petals': false, 'dlc-rain': false }).length, 0);
    assert.equal(resolveDlcFxPromptRule({ 'dlc-petals': false, 'dlc-rain': false }), '');
});

test('gate:dlc-api:queue-runs-before-and-after-start-and-guards-fx-css', () => {
    reset();
    const api = { api: { uiSkins: createUiSkinsApi(), stageFx: createStageFxApi(), version: 1 } };
    const seen = [];
    const global = { IGS_DLC: [(igs) => seen.push(['early', igs.api.version]), () => { throw new Error('bad dlc'); }] };
    assert.equal(quiet(() => drainDlcQueue(global, api)), 2);
    global.IGS_DLC.push((igs) => seen.push(['late', igs === api]));
    assert.deepEqual(seen, [['early', 1], ['late', true]]);
    const result = quiet(() => api.api.stageFx.register({ kind: 'dlc-petals', label: '花瓣', play() {}, css: '.dlc-petal{opacity:.5} .igs-dialog{display:none} @keyframes dlc-fall{to{opacity:0}}' }));
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((w) => w.includes('.igs-dialog')));
    assert.equal(api.api.stageFx.get('dlc-petals').mode, 'instant');
    assert.equal(typeof api.api.stageFx.get('dlc-petals').play, 'undefined', '只读快照不暴露函数');
    assert.equal(quiet(() => api.api.uiSkins.register({ id: 'dlc-q', label: 'Q' })).ok, true);
    assert.deepEqual(api.api.uiSkins.list().map((s) => s.id), ['dlc-q']);
    assert.equal(api.api.uiSkins.unregister('dlc-q').ok, true);
    assert.equal(api.api.uiSkins.get('dlc-q'), null);
});
