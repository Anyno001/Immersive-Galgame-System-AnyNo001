import test from 'node:test';
import assert from 'node:assert/strict';
import { RANGE_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-range-style.js';
import { FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-style.js';
import { STAGE_CAST_STYLE_TEXT, castDuoAttr, castSideAttr } from '../src/visual/igs-ui/stage-cast-render.js';
import { ABO_STYLE_TEXT } from '../src/visual/igs-ui/fx-abo-style.js';
import { aboCastSinkRule } from '../src/visual/igs-ui/fx-abo-build.js';
import { applySceneAudio, cancelSceneAudio, resolveAmbientPlan } from '../src/visual/igs-ui/scene-audio.js';

// 撑伞区间（[igs-fx:umbrella] … [igs-fx:umbrella-end]）：不画伞，用声音、伞沿阴影、雨缺口与构图表现「在伞下」。

test('umbrella style: old SVG canopy and ellipse silhouette are gone', () => {
    const all = `${RANGE_FX_STYLE_TEXT}\n${FX_STYLE_TEXT}`;
    assert.doesNotMatch(all, /svg\+xml[^"]*viewBox='0 0 100 62'/);
    assert.doesNotMatch(all, /%232c4268|%238fbcff/);
    assert.doesNotMatch(all, /igs-fx-umbrella-open/);
    assert.doesNotMatch(all, /\[data-igs-fx-umbrella\] #igs-fx-stage::after/);
});

test('umbrella style: soft rim shade fades in and out, no outline', () => {
    assert.match(RANGE_FX_STYLE_TEXT, /\.igs-fx-umbrella-shade\{opacity:0;visibility:hidden;transition:opacity \.9s ease/);
    assert.match(RANGE_FX_STYLE_TEXT, /#igs-stage-motion\[data-igs-fx-umbrella\] \.igs-fx-umbrella-shade\{opacity:1;visibility:visible;/);
    const shade = RANGE_FX_STYLE_TEXT.match(/\.igs-fx-umbrella-shade\{[^}]*\}/)[0];
    assert.match(shade, /radial-gradient\(ellipse/);
    assert.doesNotMatch(shade, /border|box-shadow|clip-path|drop-shadow/);
    // 每层阴影的最深处叠起来不超过约 25%。
    const peaks = [...shade.matchAll(/gradient\([^,]+,rgba\(var\(--igs-umb-tint\),([\d.]+)\)/g)].map((m) => Number(m[1]));
    assert.ok(peaks.length >= 2);
    const darkest = 1 - peaks.reduce((keep, a) => keep * (1 - a), 1);
    assert.ok(darkest <= 0.25, `combined darkening ${darkest}`);
});

test('umbrella style: rain gap mask and rim drips only in outdoor rain, off in low quality and reduced motion', () => {
    const block = RANGE_FX_STYLE_TEXT.match(/@media \(prefers-reduced-motion: no-preference\)\{([\s\S]*?)\n\}/);
    assert.ok(block, 'gap and drips live under prefers-reduced-motion: no-preference');
    const inner = block[1];
    assert.match(inner, /#igs-overlay:not\(\[data-igs-quality="low"\]\) #igs-stage-motion\[data-igs-fx-umbrella\] :is\(#igs-effect-layer,#igs-effect-front-layer\)\[data-igs-weather-fx="rain"\]\[data-igs-weather-fx-scene="outdoor"\] \.igs-fx-canvas\{[^}]*mask-image:radial-gradient\(ellipse/);
    assert.match(inner, /-webkit-mask-image:radial-gradient/);
    // 进出对称：--igs-umb 过渡 .9s；收伞时遮罩以 allow-discrete 留到过渡走完（1.8s 离散过渡在一半处切换），撑伞时遮罩立即挂上。
    assert.match(inner, /#igs-stage-motion :is\(#igs-effect-layer,#igs-effect-front-layer\)\[data-igs-weather-fx="rain"\]\[data-igs-weather-fx-scene="outdoor"\] \.igs-fx-canvas\{--igs-umb:0;transition:--igs-umb \.9s ease,mask-image 1\.8s linear allow-discrete,-webkit-mask-image 1\.8s linear allow-discrete;\}/);
    assert.match(inner, /\[data-igs-fx-umbrella\] :is\([^)]*\)\[[^{]*\.igs-fx-canvas\{--igs-umb:1;[^}]*transition:--igs-umb \.9s ease;\}/);
    assert.match(RANGE_FX_STYLE_TEXT, /@property --igs-umb\{syntax:'<number>';inherits:false;initial-value:0;\}/);
    assert.doesNotMatch(RANGE_FX_STYLE_TEXT, /igs-fx-umb-in/);
    assert.match(inner, /:has\(#igs-effect-front-layer\[data-igs-weather-fx="rain"\]\[data-igs-weather-fx-scene="outdoor"\]:not\(\[data-igs-weather-fx-motion="off"\]\)\) \.igs-fx-umbrella-drip\{display:block;\}/);
    // 水线是细长渐变，不是圆点。
    const drip = RANGE_FX_STYLE_TEXT.match(/\.igs-fx-umbrella-drip::before,\.igs-fx-umbrella-drip::after\{[^}]*\}/)[0];
    assert.match(drip, /width:1px;/);
    assert.match(drip, /linear-gradient\(180deg/);
    assert.doesNotMatch(drip, /border-radius|circle/);
    assert.match(RANGE_FX_STYLE_TEXT, /\.igs-fx-umbrella-drip\{display:none;\}/);
    // 遮罩与水线规则不会漏到媒体查询外面。
    const outside = RANGE_FX_STYLE_TEXT.replace(block[0], '');
    assert.doesNotMatch(outside, /mask-image/);
    assert.doesNotMatch(outside, /\.igs-fx-umbrella-drip\{display:block/);
});

test('umbrella style: two on stage huddle slightly toward the middle with a smooth transition', () => {
    assert.match(RANGE_FX_STYLE_TEXT, /#igs-stage-motion\[data-igs-fx-umbrella\]\[data-igs-cast-duo\] #igs-cast \.igs-cast-sprite\[data-igs-cast-side="l"\]\{--igs-fx-huddle-dx:var\(--igs-fx-huddle\);\}/);
    assert.match(RANGE_FX_STYLE_TEXT, /\[data-igs-cast-side="r"\]\{--igs-fx-huddle-dx:calc\(var\(--igs-fx-huddle\) \* -1\);\}/);
    // 撑伞只写变量，不直接写 translate（否则会盖掉 ABO 下沉）。
    assert.doesNotMatch(RANGE_FX_STYLE_TEXT, /\.igs-cast-sprite[^{]*\{translate:/);
    assert.match(STAGE_CAST_STYLE_TEXT, /#igs-cast \.igs-cast-sprite\{[^}]*translate:var\(--igs-fx-huddle-dx,0%\) var\(--igs-cast-sink,0%\);/);
    assert.match(RANGE_FX_STYLE_TEXT, /\[data-igs-cast-duo="l"\] #igs-sprite\{--igs-fx-huddle-dx:var\(--igs-fx-huddle\);\}/);
    assert.match(STAGE_CAST_STYLE_TEXT, /\.igs-cast-sprite:not\(\[data-igs-cast-ghost\]\)\{transition:rotate \.6s ease,translate \.9s ease;\}/);
});

test('umbrella huddle stacks with ABO suppress sink instead of overriding it', () => {
    // 陪衬：ABO 只写纵向变量，撑伞只写横向变量，同屏样式把两者合进同一个 translate。
    const sink = aboCastSinkRule('小林');
    assert.match(sink, /\.igs-cast-sprite:not\(\[data-igs-cast-char="小林"\]\)\{--igs-cast-sink:var\(--igs-abo-sink,2\.4%\);\}/);
    assert.doesNotMatch(sink, /translate/);
    assert.doesNotMatch(aboCastSinkRule(''), /translate|:not/);
    // 说话人：ABO 的下沉 translate 保留横向靠拢变量。
    assert.match(ABO_STYLE_TEXT, /:has\(\.igs-abo-suppress:not\(\.is-main\)\) #igs-sprite\{translate:var\(--igs-fx-huddle-dx,0%\) var\(--igs-abo-sink,2\.4%\);/);
    assert.match(ABO_STYLE_TEXT, /:has\(\.igs-abo-suppress\.is-main\) #igs-sprite\{translate:var\(--igs-fx-huddle-dx,0%\) 0;\}/);
});

test('cast duo: only exactly two on stage get a side mark', () => {
    assert.equal(castSideAttr(18), 'l');
    assert.equal(castSideAttr(82), 'r');
    assert.equal(castSideAttr(50), '');
    assert.equal(castSideAttr(null), '');
    assert.equal(castDuoAttr({ speaker: { posX: 18 }, members: [{ posX: 82 }] }), 'l');
    assert.equal(castDuoAttr({ speaker: { posX: 82 }, members: [{ posX: 18 }] }), 'r');
    assert.equal(castDuoAttr({ speaker: null, members: [{ posX: 18 }, { posX: 82 }] }), 'n');
    assert.equal(castDuoAttr({ speaker: { posX: 50 }, members: [] }), '');
    assert.equal(castDuoAttr({ speaker: { posX: 6 }, members: [{ posX: 50 }, { posX: 94 }] }), '');
    assert.equal(castDuoAttr(null), '');
});

const AMBIENT_ON = { enabled: true };

test('umbrella audio plan: rain under the umbrella adds a rain-on-canopy layer; no rain, no canopy', () => {
    const rainy = { location: '街道', weather: '中雨', time: '白天' };
    const open = resolveAmbientPlan(rainy, AMBIENT_ON);
    assert.ok(open.some((l) => l.kind === 'rain'));
    assert.ok(!open.some((l) => l.kind === 'umbrella'));
    const covered = resolveAmbientPlan({ ...rainy, fxRanges: { umbrella: true } }, AMBIENT_ON);
    const canopy = covered.find((l) => l.kind === 'umbrella');
    assert.ok(canopy, 'umbrella layer present');
    assert.equal(canopy.level, covered.find((l) => l.kind === 'rain').level);
    assert.ok(canopy.fade > 0 && canopy.fade <= 1, 'short fade');
    const sunny = resolveAmbientPlan({ location: '街道', weather: '晴', time: '白天', fxRanges: { umbrella: true } }, AMBIENT_ON);
    assert.ok(!sunny.some((l) => l.kind === 'umbrella'));
    // 雨声层被用户关掉时，也不单独出雨打伞面。
    const noRain = resolveAmbientPlan({ ...rainy, fxRanges: { umbrella: true } }, { enabled: true, rain: false });
    assert.ok(!noRain.some((l) => l.kind === 'umbrella'));
    // 室内下雨时即便处在撑伞区间，也不出伞面声。
    for (const location of ['卧室', '教室']) {
        const inside = resolveAmbientPlan({ location, weather: '中雨', time: '白天', fxRanges: { umbrella: true } }, AMBIENT_ON);
        assert.ok(!inside.some((l) => l.kind === 'umbrella'), location);
    }
});

function param(value = 0) {
    const history = [];
    const record = (name) => (...args) => { history.push([name, ...args]); };
    return {
        value, history,
        setValueAtTime: record('set'), linearRampToValueAtTime: record('linear'),
        exponentialRampToValueAtTime: record('exp'), setTargetAtTime: record('target'),
        cancelScheduledValues: record('cancel'),
    };
}

function fakeContext() {
    const nodes = [];
    const ctx = {
        nodes, state: 'running', currentTime: 0, sampleRate: 8000, destination: { kind: 'destination' },
        resume() { return Promise.resolve(); },
        suspend() { return Promise.resolve(); },
    };
    const node = (kind, extra) => {
        const n = { kind, context: ctx, connected: [], connect(target) { this.connected.push(target); return target; }, disconnect() {}, ...extra };
        nodes.push(n);
        return n;
    };
    const source = (kind, extra) => node(kind, { start() {}, stop() {}, ...extra });
    Object.assign(ctx, {
        createGain: () => node('gain', { gain: param(1) }),
        createBiquadFilter: () => node('filter', { type: 'lowpass', frequency: param(350), Q: param(1) }),
        createOscillator: () => source('osc', { type: 'sine', frequency: param(440) }),
        createBufferSource: () => source('buffer', { buffer: null, loop: false, playbackRate: param(1) }),
        createBuffer: (channels, length, sampleRate) => { const data = new Float32Array(length); return { sampleRate, getChannelData: () => data }; },
    });
    return ctx;
}

function audioOptions(ctx, fxRanges) {
    return {
        ambient: { enabled: true, volume: 0.4 },
        context: { location: '街道', weather: '中雨', time: '白天', fxRanges },
        contextFactory: () => ctx,
        schedule: () => 0,
        clear: () => {},
    };
}

test('umbrella audio: outside rain is low-passed smoothly in and out, canopy layer fades in under a second', () => {
    const ctx = fakeContext();
    const root = { ownerDocument: null };
    try {
        const on = applySceneAudio(root, audioOptions(ctx, { umbrella: true }));
        assert.ok(on.ambient.some((l) => l.kind === 'umbrella'));
        const cover = ctx.nodes.find((n) => n.kind === 'filter' && n.type === 'lowpass' && n.frequency.value === 1500);
        assert.ok(cover, 'rain layer starts covered');
        // 伞面层的淡入在 1s 以内。
        const fadeRamps = ctx.nodes.filter((n) => n.kind === 'gain').flatMap((n) => n.gain.history.filter((h) => h[0] === 'linear'));
        assert.ok(fadeRamps.some((h) => h[2] > 0 && h[2] <= 1));
        const off = applySceneAudio(root, audioOptions(ctx, {}));
        assert.ok(!off.ambient.some((l) => l.kind === 'umbrella'));
        assert.ok(cover.frequency.history.some((h) => h[0] === 'target' && h[1] === 20000), 'cover opens with setTargetAtTime');
    } finally {
        cancelSceneAudio(root);
    }
});

test('umbrella audio: dry weather under the umbrella starts no audio layers', () => {
    const ctx = fakeContext();
    const root = { ownerDocument: null };
    try {
        const result = applySceneAudio(root, { ...audioOptions(ctx, { umbrella: true }), context: { location: '卧室', weather: '晴', time: '夜晚', fxRanges: { umbrella: true } } });
        assert.ok(!result.ambient.some((l) => l.kind === 'umbrella' || l.kind === 'rain'));
    } finally {
        cancelSceneAudio(root);
    }
});
