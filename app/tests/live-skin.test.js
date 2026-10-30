import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractFxDirectives, parseLivePlatform, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { liveFallbackOf, readLiveCarry, resolveLiveContextFromHistory, withLiveFallback } from '../src/scene/live-context.js';
import { normalizeLiveFxSettings } from '../src/visual/igs-ui/danmaku-settings.js';
import { danmakuGrammarBlocks, liveDetailedBlock } from '../src/visual/igs-ui/danmaku-prompt.js';
import {
    LIVE_PLATFORM_DEFAULT_PROMPT, auctionRaise, boardAdd, normalizeLiveSkinSettings, onionAddress, resolveLiveSkin, seedBoard, skinCode, skinFlavorLine, skinLabel, tipValue, withLiveSkin,
} from '../src/visual/igs-ui/live-skin.js';
import { LIVE_SKIN_LINES } from '../src/visual/igs-ui/live-skin-lines.js';
import { syncLivePhone, renderLiveMessage, stopLivePhone } from '../src/visual/igs-ui/danmaku-live.js';

const liveOf = (source) => resolveFxAtPage(extractFxDirectives(source), source.length).live;

test('live 标签第 4 栏：暗网与三个子风格', () => {
    assert.equal(liveOf('[igs-fx:live|灰鸦|深夜|观看|暗网]').platform, 'dark');
    assert.equal(liveOf('[igs-fx:live|灰鸦|深夜|观看|暗网·终端]').platform, 'terminal');
    assert.equal(liveOf('[igs-fx:live|灰鸦|深夜|观看|暗网·监控]').platform, 'cctv');
    assert.equal(liveOf('[igs-fx:live|灰鸦|深夜|观看|暗网·拍卖]').platform, 'auction');
    assert.equal(liveOf('[igs-fx:live|灰鸦|深夜|观看|暗网-拍卖]').platform, 'auction');
    assert.equal(liveOf('[igs-fx:live|灰鸦|深夜|观看|暗网终端]').platform, 'terminal');
});

test('live 标签：旧三栏不带平台字段，原有值不变', () => {
    assert.deepEqual(liveOf('[igs-fx:live|小雨|晚安直播|主播]'), { name: '小雨', title: '晚安直播', view: 'host' });
    assert.deepEqual(liveOf('[igs-fx:live|小雨|晚安直播]'), { name: '小雨', title: '晚安直播', view: 'watch' });
});

test('live 标签：乱写的平台当没写，写错的子风格退回暗网默认', () => {
    for (const bad of ['乱写', 'B站', '', '暗', '暗网络']) {
        const live = liveOf(`[igs-fx:live|小雨|标题|观看|${bad}]`);
        assert.ok(!('platform' in live) || bad === '暗网络', `${bad}`);
    }
    assert.equal(parseLivePlatform('暗网·不存在'), 'dark');
    assert.equal(parseLivePlatform(undefined), '');
    assert.equal(parseLivePlatform('  暗网 · 监控 '), 'cctv');
});

test('live 平台跨楼继承，兜底开播不带平台', () => {
    const carried = readLiveCarry('[igs-fx:live|灰鸦|深夜|观看|暗网·监控]\n正文', liveFallbackOf('我'));
    assert.deepEqual(carried.live, { name: '灰鸦', title: '深夜', view: 'watch', platform: 'cctv' });
    const next = '又过了一会，弹幕刷屏。';
    const directives = withLiveFallback(extractFxDirectives(next), next, carried.live, liveFallbackOf('我'));
    assert.equal(resolveFxAtPage(directives, next.length).live.platform, 'cctv');
    const history = resolveLiveContextFromHistory([{ isUser: false, text: '[igs-fx:live|灰鸦|深夜|观看|暗网]' }], liveFallbackOf('我'));
    assert.equal(history.platform, 'dark');
});

test('设置规范化：默认拍卖、绿色、固定暗网关、提示词留空', () => {
    assert.deepEqual(normalizeLiveSkinSettings(undefined), { darkSkin: 'auction', darkAll: false, terminalTone: 'green', platformPrompt: '' });
    const own = normalizeLiveSkinSettings({ darkSkin: 'cctv', darkAll: true, terminalTone: 'amber', platformPrompt: '  自己的写法  ' });
    assert.deepEqual(own, { darkSkin: 'cctv', darkAll: true, terminalTone: 'amber', platformPrompt: '自己的写法' });
    assert.equal(normalizeLiveSkinSettings({ darkSkin: '乱', terminalTone: 'x', darkAll: 'true' }).darkSkin, 'auction');
    assert.equal(normalizeLiveSkinSettings({ darkAll: 'true' }).darkAll, false);
    assert.equal(normalizeLiveSkinSettings({ platformPrompt: LIVE_PLATFORM_DEFAULT_PROMPT }).platformPrompt, '');
    const merged = normalizeLiveFxSettings({ enabled: true, darkAll: true, darkSkin: 'terminal' });
    assert.equal(merged.darkAll, true);
    assert.equal(merged.darkSkin, 'terminal');
    assert.equal(merged.enabled, true);
});

test('皮肤选择：标签直接指定、暗网用默认、固定暗网开关覆盖空平台', () => {
    assert.deepEqual(resolveLiveSkin('', {}), { skin: '', tone: '' });
    assert.deepEqual(resolveLiveSkin('dark', {}), { skin: 'auction', tone: '' });
    assert.deepEqual(resolveLiveSkin('dark', { darkSkin: 'terminal', terminalTone: 'amber' }), { skin: 'terminal', tone: 'amber' });
    assert.deepEqual(resolveLiveSkin('cctv', { darkSkin: 'terminal' }), { skin: 'cctv', tone: '' });
    assert.deepEqual(resolveLiveSkin('', { darkAll: true, darkSkin: 'cctv' }), { skin: 'cctv', tone: '' });
    assert.deepEqual(resolveLiveSkin('auction', { darkAll: true, darkSkin: 'cctv' }), { skin: 'auction', tone: '' });
});

test('withLiveSkin：不改原对象，无皮肤时去掉旧字段，结果稳定', () => {
    const live = Object.freeze({ name: 'a', title: 't', view: 'watch' });
    assert.equal(withLiveSkin(live, {}), live);
    const skinned = withLiveSkin(live, { darkAll: true, darkSkin: 'terminal', terminalTone: 'amber' });
    assert.deepEqual(skinned, { name: 'a', title: 't', view: 'watch', skin: 'terminal', tone: 'amber' });
    assert.equal(withLiveSkin(skinned, { darkAll: true, darkSkin: 'terminal', terminalTone: 'amber' }), skinned);
    assert.deepEqual(withLiveSkin(skinned, {}), live);
    assert.equal(withLiveSkin(null, {}), null);
});

test('观众代号：同名稳定、不同风格各有格式', () => {
    assert.equal(skinCode('terminal', '夜猫子'), skinCode('terminal', '夜猫子'));
    assert.match(skinCode('terminal', '夜猫子'), /^#[0-9a-f]{4}$/);
    assert.match(skinCode('cctv', '夜猫子'), /^V-\d{4}$/);
    assert.match(skinCode('auction', '夜猫子'), /^№\d{2}$/);
    assert.notEqual(skinCode('cctv', '甲'), skinCode('cctv', '乙'));
    assert.equal(skinLabel('terminal', { type: 'host', user: '灰鸦' }), '[主播]');
    assert.equal(skinLabel('cctv', { type: 'host', user: '灰鸦' }), '灰鸦');
    assert.equal(skinLabel('auction', { type: 'admin' }), '司仪');
    assert.equal(skinLabel('cctv', { type: 'text', user: '甲' }), skinCode('cctv', '甲'));
    assert.match(onionAddress('灰鸦|深夜'), /^[a-z2-7]{16}\.onion$/);
    assert.equal(onionAddress('灰鸦|深夜'), onionAddress('灰鸦|深夜'));
});

test('转账与竞价数字：稳定、榜单累加或取最高', () => {
    assert.equal(tipValue({ type: 'sc', extra: '100' }), 100);
    assert.equal(tipValue({ type: 'guard', extra: '提督' }), 5000);
    assert.equal(tipValue({ type: 'gift', text: '火箭', extra: '3' }), tipValue({ type: 'gift', text: '火箭', extra: '3' }));
    assert.equal(auctionRaise(100), 1000);
    assert.equal(auctionRaise(5000), 30000 > 50000 ? 30000 : 30000);
    assert.deepEqual(seedBoard('auction', 'k'), seedBoard('auction', 'k'));
    const add = boardAdd([{ code: 'a', value: 5 }, { code: 'b', value: 3 }], 'cctv', 'b', 4);
    assert.deepEqual(add.map((r) => [r.code, r.value]), [['b', 7], ['a', 5]]);
    const bid = boardAdd([{ code: 'a', value: 5 }, { code: 'b', value: 3 }], 'auction', 'b', 2);
    assert.deepEqual(bid.map((r) => [r.code, r.value]), [['a', 5], ['b', 3]]);
});

test('路人弹幕口吻：按概率出、屏蔽攻击性时只出日常、无 emoji', () => {
    let n = 0;
    const seq = [0.1, 0.9, 0.5];
    const rng = () => seq[n++ % seq.length];
    assert.ok(LIVE_SKIN_LINES.terminal.plain.includes(skinFlavorLine('terminal', rng, false)));
    assert.equal(skinFlavorLine('terminal', () => 0.99, false), '');
    assert.equal(skinFlavorLine('nope', () => 0, false), '');
    n = 0;
    const edgy = [0.1, 0.1, 0.5];
    const rng2 = () => edgy[n++ % edgy.length];
    assert.ok(LIVE_SKIN_LINES.cctv.edgy.includes(skinFlavorLine('cctv', rng2, false)));
    n = 0;
    assert.ok(LIVE_SKIN_LINES.cctv.plain.includes(skinFlavorLine('cctv', rng2, true)));
    for (const set of Object.values(LIVE_SKIN_LINES)) for (const line of [...set.plain, ...set.edgy]) assert.ok(!/\p{Extended_Pictographic}/u.test(line), line);
});

test('直播提示词：带平台栏，固定暗网时不再要这一栏，写法可改', () => {
    const fxBlock = (title, lines) => lines.join('\n');
    const block = (live) => danmakuGrammarBlocks({ liveFx: { enabled: true, ...live } }, fxBlock).find((b) => b.key === 'live').full;
    assert.match(block({}), /live\|主播名\|直播间标题\|视角\|平台/);
    assert.ok(block({}).includes(LIVE_PLATFORM_DEFAULT_PROMPT));
    assert.ok(block({ platformPrompt: '改过的写法' }).includes('改过的写法'));
    assert.ok(!block({ platformPrompt: '改过的写法' }).includes(LIVE_PLATFORM_DEFAULT_PROMPT));
    const fixed = block({ darkAll: true });
    assert.ok(!fixed.includes('|平台'));
    assert.ok(!fixed.includes(LIVE_PLATFORM_DEFAULT_PROMPT));
    assert.match(liveDetailedBlock({ liveFx: { enabled: true } }), /\[igs-fx:live\|主播名\|直播间标题\|视角\|平台/);
});

function makeHost() {
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"><div class="igs-dm-root"></div></div></body></html>', { pretendToBeVisual: true });
    const doc = dom.window.document;
    const timers = new Map();
    let id = 0;
    let clockMs = 1_000_000;
    const ctx = (live) => ({
        doc, schedule: (fn, ms) => { const t = ++id; timers.set(t, { fn, ms }); return t; }, clear: (t) => timers.delete(t),
        now: () => clockMs, rng: () => 0.5, layout: 'phone', visible: true, chat: 'roll', interact: false, live,
    });
    return { dom, doc, host: doc.querySelector('.igs-dm-root'), overlay: doc.getElementById('igs-overlay'), timers, ctx, tick: (ms) => { clockMs += ms; } };
}

test('直播手机：带皮肤时挂 data-live-skin 与额外节点，观众名改代号，打赏进转账记录', () => {
    const t = makeHost();
    const live = { name: '灰鸦', title: '深夜线路', view: 'watch', skin: 'terminal', tone: 'amber' };
    const state = syncLivePhone(t.host, live, t.ctx(live));
    const root = t.host.querySelector('.igs-live-stage');
    assert.equal(root.getAttribute('data-live-skin'), 'terminal');
    assert.equal(root.getAttribute('data-live-tone'), 'amber');
    assert.equal(t.overlay.getAttribute('data-ls-skin'), 'terminal');
    assert.equal(t.overlay.getAttribute('data-ls-tone'), 'amber');
    assert.ok(root.querySelector('.igs-ls-bar .igs-ls-addr').textContent.endsWith('.onion'));
    renderLiveMessage(state, { type: 'text', user: '夜猫子', text: '线路稳吗' });
    const name = root.querySelector('.igs-live-list .igs-live-name');
    assert.equal(name.textContent, skinCode('terminal', '夜猫子'));
    assert.ok(root.querySelector('.igs-live-list .igs-live-ts'));
    assert.equal(root.querySelector('.igs-live-list .igs-live-text').textContent, '线路稳吗');
    assert.equal(root.querySelector('.igs-ls-note').hidden, true);
    renderLiveMessage(state, { type: 'gift', user: '夜猫子', text: '火箭', extra: '2' });
    const note = root.querySelector('.igs-ls-note');
    assert.equal(note.hidden, false);
    assert.ok(note.textContent.includes('转账'));
    assert.ok(note.textContent.includes(skinCode('terminal', '夜猫子')));
    assert.equal(stopLivePhone(t.host), true);
    assert.equal(t.overlay.hasAttribute('data-ls-skin'), false);
});

test('直播手机：拍卖倒计时走 schedule，不建 setInterval，收起后计时清空', () => {
    const t = makeHost();
    const realSetInterval = t.dom.window.setInterval;
    let intervals = 0;
    t.dom.window.setInterval = (...args) => { intervals += 1; return realSetInterval.apply(t.dom.window, args); };
    const live = { name: '主持人', title: '今夜指名权', view: 'watch', skin: 'auction' };
    const state = syncLivePhone(t.host, live, t.ctx(live));
    const root = t.host.querySelector('.igs-live-stage');
    assert.equal(root.getAttribute('data-live-skin'), 'auction');
    assert.match(root.querySelector('.igs-ls-lot').textContent, /拍品№\d/);
    assert.ok(root.querySelector('.igs-ls-lot .cd b').textContent.length > 0);
    assert.equal(intervals, 0);
    renderLiveMessage(state, { type: 'sc', user: '甲', text: '加价', extra: '100' });
    assert.match(root.querySelector('.igs-ls-note').textContent, /加价/);
    assert.equal(root.querySelectorAll('.igs-ls-board .igs-ls-row').length, 3);
    // 主节拍跑一次后，倒计时的 1 秒链接上（走 schedule，记在 timers 里）。
    const [firstId, first] = [...t.timers.entries()][0];
    t.timers.delete(firstId);
    first.fn();
    assert.ok([...t.timers.values()].some((item) => item.ms === 1000));
    stopLivePhone(t.host);
    assert.equal(t.timers.size, 0);
});

test('偶发电波干扰：终端 / 监控隔 8 到 16 秒闪一次，拍卖不闪，收起后全部清空', () => {
    const run = (skin) => {
        const t = makeHost();
        const live = { name: '灰鸦', title: '线路', view: 'watch', skin };
        syncLivePhone(t.host, live, t.ctx(live));
        const root = t.host.querySelector('.igs-live-stage');
        const [firstId, first] = [...t.timers.entries()][0];
        t.timers.delete(firstId);
        first.fn();
        return { t, root };
    };
    const { t, root } = run('terminal');
    const glitch = [...t.timers.entries()].find(([, item]) => item.ms >= 8000 && item.ms <= 16000);
    assert.ok(glitch);
    assert.equal(root.hasAttribute('data-ls-glitch'), false);
    t.timers.delete(glitch[0]);
    glitch[1].fn();
    assert.equal(root.getAttribute('data-ls-glitch'), '1');
    const off = [...t.timers.entries()].find(([, item]) => item.ms === 300);
    assert.ok(off);
    t.timers.delete(off[0]);
    off[1].fn();
    assert.equal(root.hasAttribute('data-ls-glitch'), false);
    assert.ok([...t.timers.values()].some((item) => item.ms >= 8000 && item.ms <= 16000));
    stopLivePhone(t.host);
    assert.equal(t.timers.size, 0);
    const auction = run('auction');
    assert.ok(![...auction.t.timers.values()].some((item) => item.ms >= 8000 && item.ms <= 16000));
    stopLivePhone(auction.t.host);
    const cctv = run('cctv');
    assert.ok([...cctv.t.timers.values()].some((item) => item.ms >= 8000 && item.ms <= 16000));
    stopLivePhone(cctv.t.host);
});

test('直播手机：没有皮肤时不加任何皮肤节点与标记', () => {
    const t = makeHost();
    const live = { name: '小雨', title: '晚安', view: 'watch' };
    const state = syncLivePhone(t.host, live, t.ctx(live));
    const root = t.host.querySelector('.igs-live-stage');
    assert.equal(root.hasAttribute('data-live-skin'), false);
    assert.equal(t.overlay.hasAttribute('data-ls-skin'), false);
    assert.equal(root.querySelector('.igs-ls-fx'), null);
    renderLiveMessage(state, { type: 'text', user: '夜猫子', text: '晚上好' });
    assert.equal(root.querySelector('.igs-live-name').textContent, '夜猫子：');
    stopLivePhone(t.host);
});
