import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { DAILY_FX_KINDS, dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { enabledDailyFxKinds, normalizeDailyFxSettings, planDailyFx } from '../src/visual/igs-ui/fx-daily-model.js';
import { resolveDailyFxPromptRule } from '../src/visual/igs-ui/fx-daily-prompt.js';
import { cancelDailyFx, renderDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { FX_SETTINGS_NORMALIZERS } from '../src/visual/igs-ui/fx-settings.js';
import { DAILY_SFX_KINDS } from '../src/visual/igs-ui/fx-daily-sfx.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';

function makeEl(doc, id = '') {
    const attrs = new Map();
    const el = {
        id, ownerDocument: doc, children: [], parentNode: null, className: '', innerHTML: '',
        style: { setProperty() {}, removeProperty() {} },
        classList: { add(name) { el.className = `${el.className} ${name}`.trim(); }, remove() {} },
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
        insertBefore(child, ref) {
            child.parentNode = el;
            const index = ref ? el.children.indexOf(ref) : -1;
            if (index < 0) el.children.push(child); else el.children.splice(index, 0, child);
            return child;
        },
        removeChild(child) { el.children.splice(el.children.indexOf(child), 1); child.parentNode = null; },
        get nextSibling() { const list = el.parentNode ? el.parentNode.children : []; return list[list.indexOf(el) + 1] || null; },
        querySelector(selector) {
            const want = selector.replace(/^#/, '');
            const walk = (node) => {
                for (const child of node.children) {
                    if (child.id === want) return child;
                    const found = walk(child);
                    if (found) return found;
                }
                return null;
            };
            return walk(el);
        },
    };
    return el;
}

function makeReader() {
    const doc = { createElement: () => makeEl(doc) };
    const root = makeEl(doc, 'igs-overlay');
    const motion = root.appendChild(makeEl(doc, 'igs-stage-motion'));
    motion.appendChild(makeEl(doc, 'igs-bg'));
    motion.appendChild(makeEl(doc, 'igs-sprite'));
    motion.appendChild(makeEl(doc, 'igs-dialog-layer'));
    const timers = [];
    return {
        root, motion,
        ctx: {
            reducedMotion: false,
            schedule(fn, delay) { const t = { fn, delay }; timers.push(t); return t; },
            clear(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
            playSfx: (kind) => sounds.push(kind),
        },
        flush() { while (timers.length) timers.shift().fn(); },
    };
}
const sounds = [];

function fxOf(text) {
    const directives = extractFxDirectives(text);
    return resolveFxAtPage(directives, text.length, -1);
}

function snap(fx, extra = {}, index = 0, dailyFx = { enabled: true }) {
    return { messageId: 'm1', readerSettings: { dailyFx }, content: { currentIndex: index, textType: 'dialogue', fx, ...extra } };
}

function cards(r) {
    const front = r.root.querySelector('#igs-fx-front');
    const stage = r.root.querySelector('#igs-fx-stage');
    return [...(front ? front.children : []), ...(stage ? stage.children : [])].filter((n) => String(n.className).includes('igs-dfx '));
}

test('gate: daily-fx parses every kind with lenient fields and rejects missing required text', () => {
    assert.deepEqual(parseDailyFxBody('timeskip', ['三小时后']), ['timeskip', '三小时后']);
    assert.equal(parseDailyFxBody('timeskip', []), null);
    assert.deepEqual(parseDailyFxBody('letter', ['只有内容']), ['letter', '', '只有内容']);
    assert.deepEqual(parseDailyFxBody('omikuji', ['超吉']), ['omikuji', '吉', '']);
    assert.deepEqual(dailyFxOf(['receipt', '可乐、薯条，汉堡', '¥38', '街角便利店']), { type: 'receipt', items: ['可乐', '薯条', '汉堡'], total: '¥38', shop: '街角便利店' });
    assert.deepEqual(dailyFxOf(['tv', '', '今日晴']), { type: 'tv', channel: '', text: '今日晴' });
    // 烟花走粒子层；进食由漫画符号分镜与物品卡演出，不建日常卡片。
    for (const kind of DAILY_FX_KINDS) assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`) || kind === 'fireworks' || kind === 'eat', kind);
});

test('gate: daily-fx tags attach to pages, stay out of text and keep one per type', () => {
    const text = '[igs-fx:timeskip|第二天]\n早上好。\n[igs-fx:note|记得吃早饭]\n[igs-fx:note|第二张]\n[igs-fx:photo|合影]';
    const fx = fxOf(text);
    assert.deepEqual(fx.daily.map((d) => d.type), ['timeskip', 'note']);
    assert.equal(stripMarkerDirectives(text).includes('igs-fx'), false);
    assert.deepEqual(fxOf('[igs-fx:timeskip-end]').daily, []);
    assert.deepEqual(fxOf('普通正文').daily, []);
});

test('gate: daily-fx settings default off, register in reader normalizers and gate the prompt', () => {
    const s = normalizeDailyFxSettings(null);
    assert.equal(s.enabled, false);
    assert.equal(s.photo, true);
    assert.equal(FX_SETTINGS_NORMALIZERS.dailyFx, normalizeDailyFxSettings);
    assert.equal(resolveDailyFxPromptRule(null), '');
    assert.deepEqual(enabledDailyFxKinds({ enabled: true, fireworks: false }).includes('fireworks'), false);
    const rule = resolveDailyFxPromptRule({ enabled: true, tv: false });
    assert.match(rule, /igs-fx:timeskip/);
    assert.doesNotMatch(rule, /igs-fx:tv/);
    const fx = { daily: [{ type: 'bell' }, { type: 'tv', text: 'x' }] };
    assert.deepEqual(planDailyFx(fx, { settings: { enabled: true, bell: false } }).map((d) => d.type), ['tv']);
    assert.deepEqual(planDailyFx(fx, { settings: { enabled: true }, nsfw: true }), []);
    assert.deepEqual(planDailyFx(fx, { settings: { enabled: true }, pageKind: 'chat' }), []);
});

test('gate: every daily card kind has a synthesized sound', () => {
    const needed = ['clock', 'shutter', 'paper', 'sticky', 'bell', 'broadcast', 'touch', 'alarm', 'vibrate', 'omikuji', 'receipt', 'tv-on', 'firework', 'firework-pop'];
    for (const kind of needed) assert.ok(DAILY_SFX_KINDS.includes(kind), kind);
});

test('gate: daily-fx renders cards once per page visit, escapes text and clears on page change', () => {
    sounds.length = 0;
    const r = makeReader();
    const fx = fxOf('[igs-fx:letter|<b>小林</b>|见字如面]\n[igs-fx:touch|牵手]');
    let result = renderDailyFx(r.root, snap(fx), r.ctx);
    assert.deepEqual(result.played, ['letter', 'touch']);
    assert.deepEqual(sounds, ['paper', 'touch']);
    const [letter] = cards(r);
    assert.match(letter.innerHTML, /&lt;b&gt;小林/);
    assert.equal(r.root.querySelector('#igs-fx-stage').children.some((n) => String(n.className).includes('igs-dfx-touch')), true);
    result = renderDailyFx(r.root, snap(fx), r.ctx);
    assert.deepEqual(result.played, []);
    renderDailyFx(r.root, snap({ daily: [] }, {}, 1), r.ctx);
    assert.equal(cards(r).length, 0);
    result = renderDailyFx(r.root, snap(fx), r.ctx);
    assert.deepEqual(result.played, [], 'returning to a seen page does not replay without fxStyle.replay');
});

test('gate: daily photo copies the stage into a polaroid and reports to the album hook', () => {
    const r = makeReader();
    const bg = r.root.querySelector('#igs-bg');
    bg.style.backgroundImage = 'url("park.png")';
    const sprite = r.root.querySelector('#igs-sprite');
    sprite.style.backgroundImage = 'url("alice.png")';
    sprite.style.display = 'block';
    const photos = [];
    renderDailyFx(r.root, snap(fxOf('[igs-fx:photo|樱花树下]'), {}, 0, { enabled: true }), { ...r.ctx, onPhoto: (p) => photos.push(p) });
    const [photo] = cards(r);
    assert.match(photo.innerHTML, /park\.png/);
    assert.match(photo.innerHTML, /alice\.png/);
    assert.match(photo.innerHTML, /樱花树下/);
    assert.equal(photos.length, 1);
    assert.equal(photos[0].caption, '樱花树下');
    const off = makeReader();
    const none = [];
    renderDailyFx(off.root, snap(fxOf('[igs-fx:photo|x]'), {}, 0, { enabled: true, photoAlbum: false }), { ...off.ctx, onPhoto: (p) => none.push(p) });
    assert.equal(none.length, 0);
});

test('gate: daily-fx lifetimes remove cards, disable and cancel clean everything', () => {
    const r = makeReader();
    renderDailyFx(r.root, snap(fxOf('[igs-fx:note|便签]')), r.ctx);
    assert.equal(cards(r).length, 1);
    r.flush();
    assert.equal(cards(r).length, 0);
    renderDailyFx(r.root, snap(fxOf('[igs-fx:bell]'), {}, 1), r.ctx);
    renderDailyFx(r.root, snap({ daily: [] }, {}, 1, { enabled: false }), r.ctx);
    assert.equal(cards(r).length, 0);
    assert.equal(cancelDailyFx(r.root), false);
    renderDailyFx(r.root, snap(fxOf('[igs-fx:tv|新闻台|今日晴]'), {}, 2), r.ctx);
    assert.equal(cancelDailyFx(r.root), true);
    assert.equal(cards(r).length, 0);
});

test('gate: daily-fx reduced motion marks cards static and nsfw pages play nothing', () => {
    const r = makeReader();
    renderDailyFx(r.root, snap(fxOf('[igs-fx:omikuji|大吉]')), { ...r.ctx, reducedMotion: true });
    const [kuji] = cards(r);
    assert.match(kuji.className, /is-reduced/);
    assert.match(kuji.className, /is-great/);
    const n = makeReader();
    assert.deepEqual(renderDailyFx(n.root, snap(fxOf('[igs-fx:note|x]'), { sceneNsfw: true }), n.ctx).played, []);
});

test('gate: daily-fx ancient era swaps clock, sticky note and letter for incense, paper slip and vertical letter', () => {
    sounds.length = 0;
    const r = makeReader();
    const ancient = (text, index) => ({ ...snap(fxOf(text), {}, index), readerSettings: { dailyFx: { enabled: true }, _ancientEra: true } });
    let result = renderDailyFx(r.root, ancient('[igs-fx:timeskip|一炷香后]\n[igs-fx:note|今夜子时，后山见]', 0), r.ctx);
    assert.deepEqual(result.played, ['timeskip', 'note']);
    assert.deepEqual(sounds, ['drum', 'paper']);
    const [skip, note] = cards(r);
    assert.match(skip.className, /is-ancient/);
    assert.match(skip.innerHTML, /igs-dfx-incense/);
    assert.doesNotMatch(skip.innerHTML, /igs-dfx-clock/);
    assert.match(note.innerHTML, /igs-dfx-scrap/);
    assert.doesNotMatch(note.innerHTML, /igs-dfx-tape/);
    result = renderDailyFx(r.root, ancient('[igs-fx:letter|沈清秋|见字如面]', 1), r.ctx);
    const [letter] = cards(r);
    assert.match(letter.className, /igs-dfx-letter is-ancient/);
    assert.match(letter.innerHTML, /igs-dfx-letter-sign">沈清秋</);
    assert.match(DAILY_FX_STYLE_TEXT, /\.igs-dfx-letter\.is-ancient \.igs-dfx-paper\{writing-mode:vertical-rl/);
    assert.match(DAILY_FX_STYLE_TEXT, /@keyframes igs-dfx-burn/);
    // 现代模式不受影响。
    sounds.length = 0;
    renderDailyFx(r.root, snap(fxOf('[igs-fx:timeskip|三小时后]'), {}, 2), r.ctx);
    assert.deepEqual(sounds, ['clock']);
    assert.match(cards(r)[0].innerHTML, /igs-dfx-clock/);
});

test('gate: daily-fx ancient era swaps omikuji for a bamboo lot tube with Chinese lots and fireworks for sky lanterns', () => {
    sounds.length = 0;
    const r = makeReader();
    const ancient = (text, index) => ({ ...snap(fxOf(text), {}, index), readerSettings: { dailyFx: { enabled: true }, _ancientEra: true } });
    renderDailyFx(r.root, ancient('[igs-fx:omikuji|大吉|枯木逢春，贵人自来]', 0), r.ctx);
    assert.deepEqual(sounds, ['omikuji']);
    const [kuji] = cards(r);
    assert.match(kuji.className, /igs-dfx-omikuji is-ancient is-great/);
    assert.match(kuji.innerHTML, /igs-dfx-qian-tube/);
    assert.match(kuji.innerHTML, /igs-dfx-qian-stick/);
    assert.match(kuji.innerHTML, /igs-dfx-slip-head">第[一二三四五六七八九十百]+签</);
    assert.match(kuji.innerHTML, /igs-dfx-slip-result">上上签</);
    assert.match(kuji.innerHTML, /igs-dfx-slip-text">枯木逢春，贵人自来</);
    assert.doesNotMatch(kuji.innerHTML, /御神籤|igs-dfx-kuji-box/);
    const lots = { 大吉: ['上上签', 'great'], 中吉: ['上签', 'good'], 吉: ['上签', 'good'], 小吉: ['中签', 'good'], 末吉: ['中签', 'good'], 凶: ['下签', 'bad'], 大凶: ['下下签', 'bad'] };
    Object.entries(lots).forEach(([result, [lot, tone]], i) => {
        renderDailyFx(r.root, ancient(`[igs-fx:omikuji|${result}]`, i + 1), r.ctx);
        const [node] = cards(r);
        assert.match(node.className, new RegExp(`is-${tone}`), result);
        assert.match(node.innerHTML, new RegExp(`igs-dfx-slip-result">${lot}<`), result);
        assert.doesNotMatch(node.innerHTML, /igs-dfx-slip-text/);
    });
    assert.match(DAILY_FX_STYLE_TEXT, /.igs-dfx-omikuji.is-ancient .igs-dfx-slip{writing-mode:vertical-rl/);
    // 烟花换孔明灯：暖色柔光、无爆炸声；现代模式仍是烟花闪光。
    const glowOf = (reader) => reader.root.querySelector('#igs-fx-stage').children.find((n) => String(n.className).includes('igs-dfx-sky-glow'));
    sounds.length = 0;
    const sky = makeReader();
    assert.deepEqual(renderDailyFx(sky.root, ancient('[igs-fx:fireworks]', 0), sky.ctx).played, ['fireworks']);
    assert.match(glowOf(sky).className, /is-warm/);
    assert.ok(!sounds.some((kind) => kind.startsWith('firework')));
    assert.match(DAILY_FX_STYLE_TEXT, /@keyframes igs-dfx-warm-glow/);
    const modern = makeReader();
    renderDailyFx(modern.root, snap(fxOf('[igs-fx:fireworks]')), modern.ctx);
    assert.doesNotMatch(glowOf(modern).className, /is-warm/);
    renderDailyFx(modern.root, snap(fxOf('[igs-fx:omikuji|大吉]'), {}, 1), modern.ctx);
    assert.match(cards(modern)[0].innerHTML, /igs-dfx-slip-result">大吉</);
});
