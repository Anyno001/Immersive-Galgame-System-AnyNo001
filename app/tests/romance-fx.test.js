import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import {
    computeRomanceApproach,
    computeShadeNeck,
    normalizeRomanceFxSettings,
    resolveRomanceLevel,
    resolveRomanceParams,
} from '../src/visual/igs-ui/romance-settings.js';
import { applyRomanceToDom, cancelRomanceFx } from '../src/visual/igs-ui/romance-runtime.js';
import { ROMANCE_STYLE_TEXT } from '../src/visual/igs-ui/romance-style.js';
import { STAGE_DIRECTION_STYLE_TEXT } from '../src/visual/igs-ui/stage-direction-style.js';
import { resolveRomanceFxPromptRule } from '../src/visual/igs-ui/fx-prompt.js';
import { FX_SETTINGS_NORMALIZERS } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeStatusHudSettings, STATUS_HUD_DEFAULTS } from '../src/data/shujuku/status-hud-model.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';

function makeStyle() {
    const vars = new Map();
    return {
        setProperty(name, value) { vars.set(name, String(value)); },
        removeProperty(name) { vars.delete(name); },
        getPropertyValue(name) { return vars.get(name) || ''; },
        vars,
    };
}

function makeEl(doc, id = '') {
    const attrs = new Map();
    const el = {
        id, ownerDocument: doc, children: [], parentNode: null, className: '', style: makeStyle(), clientWidth: 0, clientHeight: 0,
        setAttribute(name, value) { attrs.set(name, String(value)); },
        getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
        hasAttribute(name) { return attrs.has(name); },
        removeAttribute(name) { attrs.delete(name); },
        attrNames() { return [...attrs.keys()]; },
        appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
        insertBefore(child, ref) {
            child.parentNode = el;
            const index = ref ? el.children.indexOf(ref) : -1;
            if (index < 0) el.children.push(child);
            else el.children.splice(index, 0, child);
            return child;
        },
        removeChild(child) { el.children.splice(el.children.indexOf(child), 1); child.parentNode = null; },
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

// 假 Image：异步 onload，给出原图尺寸；画布读不到像素时 fx-anchor 按默认头位记录尺寸。
class FakeImage {
    constructor() { this.naturalWidth = 0; this.naturalHeight = 0; }
    set src(url) {
        this._src = url;
        setTimeout(() => { this.naturalWidth = 400; this.naturalHeight = 1000; this.onload && this.onload(); }, 0);
    }
    get src() { return this._src; }
}

function makeReader() {
    const doc = { defaultView: { Image: FakeImage }, createElement: () => makeEl(doc) };
    const root = makeEl(doc, 'igs-overlay');
    const stage = root.appendChild(makeEl(doc, 'igs-stage-motion'));
    stage.clientWidth = 1000;
    stage.clientHeight = 600;
    stage.appendChild(makeEl(doc, 'igs-bg'));
    const sprite = stage.appendChild(makeEl(doc, 'igs-sprite'));
    return { root, stage, sprite };
}

let urlSeq = 0;
function snapshotOf({ romance = {}, fx = {}, nsfw = false, statusHud = {}, textType = 'dialogue', time = '' } = {}) {
    return {
        readerSettings: { romanceFx: romance, statusHud },
        content: { fx: { romance: '', ...fx }, sceneNsfw: nsfw, textType, sceneTime: time },
    };
}
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('gate:romance:tag-parses-levels-and-carries-across-pages', () => {
    const src = '开头\n[igs-fx:romance|暧昧]\n靠近\n[igs-fx:romance|亲密]\n拥抱\n[igs-fx:romance-end]\n结束\n[igs-fx:romance|心动]\n乱写';
    const list = extractFxDirectives(src);
    assert.deepEqual(list.map((d) => [d.kind, d.end, d.args[0] || '']), [
        ['romance', false, 'ambiguous'], ['romance', false, 'intimate'], ['romance', true, ''],
    ]);
    const at = (word) => src.indexOf(word);
    assert.equal(resolveFxAtPage(list, at('开头'), -1).romance, '');
    assert.equal(resolveFxAtPage(list, at('靠近'), at('开头')).romance, 'ambiguous');
    assert.equal(resolveFxAtPage(list, at('拥抱'), at('靠近')).romance, 'intimate');
    assert.equal(resolveFxAtPage(list, at('结束'), at('拥抱')).romance, '');
    // 翻回旧页直接得到该页状态；romance 不产生瞬时演出。
    const back = resolveFxAtPage(list, at('拥抱'), -1);
    assert.equal(back.romance, 'intimate');
    assert.deepEqual(back.instants, []);
    // 非法档位的标签同样从正文剥离。
    assert.equal(stripMarkerDirectives('[igs-fx:romance|心动]\n正文').trim(), '正文');
});

test('gate:romance:settings-default-off-and-registered', () => {
    const d = normalizeRomanceFxSettings(undefined);
    assert.deepEqual({ enabled: d.enabled, strength: d.strength, approach: d.approach, glow: d.glow, bokeh: d.bokeh, backlight: d.backlight }, {
        enabled: false, strength: 'medium', approach: true, glow: true, bokeh: true, backlight: true,
    });
    assert.equal(normalizeRomanceFxSettings({ enabled: 'true', strength: 'max' }).enabled, false);
    assert.equal(normalizeRomanceFxSettings({ strength: 'max' }).strength, 'medium');
    assert.equal(normalizeRomanceFxSettings({ glow: false }).glow, false);
    assert.equal(FX_SETTINGS_NORMALIZERS.romanceFx, normalizeRomanceFxSettings);
});

test('gate:romance:level-resolution-nsfw-first-and-text-pages-only', () => {
    const on = { enabled: true };
    assert.equal(resolveRomanceLevel({ settings: {}, fx: { romance: 'intimate' }, nsfw: true }), 0);
    assert.equal(resolveRomanceLevel({ settings: on, fx: { romance: '' } }), 0);
    assert.equal(resolveRomanceLevel({ settings: on, fx: { romance: 'ambiguous' } }), 1);
    assert.equal(resolveRomanceLevel({ settings: on, fx: { romance: 'intimate' } }), 2);
    assert.equal(resolveRomanceLevel({ settings: on, fx: { romance: 'ambiguous' }, nsfw: true }), 3);
    assert.equal(resolveRomanceLevel({ settings: on, fx: { romance: 'intimate' }, pageKind: 'chat' }), 0);
    assert.equal(resolveRomanceLevel({ settings: on, nsfw: true, pageKind: 'card' }), 0);
});

test('gate:romance:strength-scales-and-caps-params', () => {
    assert.equal(resolveRomanceParams(0, 'medium'), null);
    const mid = resolveRomanceParams(2, 'medium');
    assert.deepEqual(mid, { pull: 0.65, zoom: 1.1, bgBlur: 2.5, glow: 0.8, bokeh: 0.7, backlight: 0.45 });
    const weak = resolveRomanceParams(2, 'weak');
    assert.equal(weak.zoom, 1.06);
    assert.equal(weak.pull, 0.39);
    const strong = resolveRomanceParams(3, 'strong');
    assert.equal(strong.backlight, 1);
    assert.equal(strong.pull, 1);
    assert.ok(strong.zoom > resolveRomanceParams(3, 'medium').zoom);
});

test('gate:romance:approach-pulls-toward-center-and-zooms-around-head', () => {
    const params = { pull: 0.65, zoom: 1.1 };
    const left = computeRomanceApproach({ sprite: { posX: 20, scale: 40 }, params });
    assert.equal(left.dx, 11.7); // (1 - .4) × (50 - 20) × .65
    assert.equal(computeRomanceApproach({ sprite: { posX: 50, scale: 40 }, params }).dx, 0);
    assert.equal(computeRomanceApproach({ sprite: { posX: 80, scale: 40 }, params }).dx, -11.7);
    // 无头部：原点退回立绘水平位置 / 28%。
    assert.deepEqual([left.originX, left.originY], [20, 28]);
    // 有头部与原图尺寸：原点落在头部中心。舞台 1000×600，比例 40 时图高 240、宽 96，posX 50 / posY 100 → left 452、top 360。
    const sprite = { posX: 50, posY: 100, scale: 40, naturalW: 400, naturalH: 1000 };
    const head = { x: 0.5, top: 0.45, w: 0.3 };
    const r = computeRomanceApproach({ stageW: 1000, stageH: 600, sprite, head, params });
    assert.equal(r.originX, 50);
    // 头顶 = 360 + .45 × 240 = 468；头宽 28.8、头高 31.68 → 中心 483.84 → 80.64%。
    assert.equal(r.originY, 80.64);
    assert.equal(computeRomanceApproach({ sprite: null, params }), null);
});

test('gate:romance:shade-neck-below-chin-and-null-without-head', () => {
    const sprite = { posX: 50, posY: 100, scale: 40, naturalW: 400, naturalH: 1000 };
    const neck = computeShadeNeck({ stageW: 1000, stageH: 600, sprite, head: { x: 0.5, top: 0.45, w: 0.3 } });
    // 头顶 468、头高 31.68：颈线 468 + 31.68 × 1.25 = 507.6 → 84.6%；过渡带再 15.84px → 87.24%。
    assert.deepEqual(neck, { neck: 84.6, end: 87.24 });
    assert.equal(computeShadeNeck({ stageW: 1000, stageH: 600, sprite, head: null }), null);
    assert.equal(computeShadeNeck({ stageW: 1000, stageH: 600, sprite: { posX: 50, scale: 40 }, head: { x: 0.5, top: 0.1, w: 0.3 } }), null);
    assert.equal(computeShadeNeck({ stageW: 0, stageH: 0, sprite, head: { x: 0.5, top: 0.1, w: 0.3 } }), null);
});

test('gate:romance:nsfw-sprite-mode-migrates-legacy-boolean', () => {
    assert.equal(STATUS_HUD_DEFAULTS.nsfwSpriteMode, 'show');
    assert.equal(normalizeStatusHudSettings({}).nsfwSpriteMode, 'show');
    assert.equal(normalizeStatusHudSettings({ showSpriteOnNsfw: true }).nsfwSpriteMode, 'show');
    assert.equal(normalizeStatusHudSettings({ nsfwSpriteMode: 'shade' }).nsfwSpriteMode, 'shade');
    const hidden = normalizeStatusHudSettings({ showSpriteOnNsfw: false });
    assert.equal(hidden.nsfwSpriteMode, 'hide');
    assert.equal(hidden.showSpriteOnNsfw, false);
    // 新字段优先于旧布尔；showSpriteOnNsfw 只由档位派生。
    const shown = normalizeStatusHudSettings({ showSpriteOnNsfw: false, nsfwSpriteMode: 'show' });
    assert.equal(shown.nsfwSpriteMode, 'show');
    assert.equal(shown.showSpriteOnNsfw, true);
    assert.equal(normalizeStatusHudSettings({ nsfwSpriteMode: 'bad', showSpriteOnNsfw: false }).nsfwSpriteMode, 'hide');
});

test('gate:romance:dom-disabled-leaves-stage-untouched', () => {
    const { root, stage } = makeReader();
    const result = applyRomanceToDom(root, snapshotOf({ fx: { romance: 'intimate' }, statusHud: { nsfwSpriteMode: 'show' } }), {
        sprite: { url: `a${urlSeq += 1}.png`, posX: 30, posY: 100, scale: 40 }, reducedMotion: false,
    });
    assert.equal(result.level, 0);
    assert.deepEqual(stage.attrNames(), []);
    assert.equal(stage.children.some((c) => c.className === 'igs-rm-back'), false);
});

test('gate:romance:dom-level-drives-attrs-vars-and-back-layer', () => {
    const { root, stage, sprite } = makeReader();
    const snap = snapshotOf({ romance: { enabled: true }, fx: { romance: 'intimate' }, time: '深夜' });
    const result = applyRomanceToDom(root, snap, { sprite: { url: `b${urlSeq += 1}.png`, posX: 20, posY: 100, scale: 40 }, reducedMotion: false });
    assert.equal(result.level, 2);
    assert.equal(stage.getAttribute('data-igs-rm-level'), '2');
    assert.equal(stage.getAttribute('data-igs-rm-tone'), 'moon');
    assert.equal(stage.getAttribute('data-igs-rm-approach'), '1');
    assert.equal(stage.getAttribute('data-igs-rm-breathe'), '1');
    assert.equal(stage.style.getPropertyValue('--igs-rm-dx'), '11.7%');
    assert.equal(stage.style.getPropertyValue('--igs-rm-scale'), '1.1');
    assert.equal(stage.style.getPropertyValue('--igs-rm-bg-blur'), '2.5px');
    assert.equal(stage.getAttribute('data-igs-rm-shade'), null);
    // 环境层插在立绘之前（背景之上、立绘之下）。
    const back = stage.children[stage.children.indexOf(sprite) - 1];
    assert.equal(back.className, 'igs-rm-back');
    assert.deepEqual(back.children.map((c) => c.className), ['igs-rm-glow', 'igs-rm-bokeh', 'igs-rm-backlight']);
    // 回落到 0 档：属性、变量、环境层全部清掉。
    applyRomanceToDom(root, snapshotOf({ romance: { enabled: true } }), { sprite: { url: 'x.png', posX: 20, scale: 40 } });
    assert.deepEqual(stage.attrNames(), []);
    assert.equal(stage.style.vars.size, 0);
    assert.equal(stage.children.includes(back), false);
});

test('gate:romance:reduced-motion-keeps-final-state-without-breathing', () => {
    const { root, stage } = makeReader();
    applyRomanceToDom(root, snapshotOf({ romance: { enabled: true }, fx: { romance: 'intimate' } }), {
        sprite: { url: `c${urlSeq += 1}.png`, posX: 20, scale: 40 }, reducedMotion: true,
    });
    assert.equal(stage.getAttribute('data-igs-rm-approach'), '1');
    assert.equal(stage.getAttribute('data-igs-rm-breathe'), null);
    cancelRomanceFx(root);
    assert.deepEqual(stage.attrNames(), []);
});

test('gate:romance:nsfw-shade-full-silhouette-until-calibrated-head-is-sized', async () => {
    const { root, stage } = makeReader();
    const url = `d${urlSeq += 1}.png`;
    const head = { x: 0.5, top: 0.45, w: 0.3 };
    const ctx = { sprite: { url, posX: 50, posY: 100, scale: 40, head }, reducedMotion: false };
    // 亲密演出关闭时剪影照常生效，并带一层逆光保证轮廓可读。
    const snap = snapshotOf({ nsfw: true, statusHud: { nsfwSpriteMode: 'shade' } });
    const first = applyRomanceToDom(root, snap, ctx);
    assert.equal(first.level, 0);
    assert.equal(stage.getAttribute('data-igs-rm-shade'), '1');
    assert.equal(stage.getAttribute('data-igs-rm-face'), null);
    assert.equal(stage.getAttribute('data-igs-rm-backlight'), '1');
    assert.equal(stage.getAttribute('data-igs-rm-approach'), null);
    // 原图尺寸探测完成后重算：手动标定的头部露脸。
    await nextTick();
    assert.equal(stage.getAttribute('data-igs-rm-face'), '1');
    assert.equal(stage.style.getPropertyValue('--igs-rm-neck'), '84.6%');
    assert.equal(stage.style.getPropertyValue('--igs-rm-shade-end'), '87.24%');
    // 没有手动标定：即便尺寸已知也整张剪影。
    applyRomanceToDom(root, snap, { ...ctx, sprite: { ...ctx.sprite, head: null } });
    assert.equal(stage.getAttribute('data-igs-rm-shade'), '1');
    assert.equal(stage.getAttribute('data-igs-rm-face'), null);
    // 显示 / 隐藏档与非 NSFW 场景都不剪影。
    for (const statusHud of [{ nsfwSpriteMode: 'show' }, { nsfwSpriteMode: 'hide' }]) {
        applyRomanceToDom(root, snapshotOf({ nsfw: true, statusHud }), ctx);
        assert.equal(stage.getAttribute('data-igs-rm-shade'), null);
    }
    applyRomanceToDom(root, snapshotOf({ nsfw: false }), ctx);
    assert.equal(stage.getAttribute('data-igs-rm-shade'), null);
    // 无立绘（编辑中或隐藏）时不剪影。
    applyRomanceToDom(root, snap, { sprite: null });
    assert.equal(stage.getAttribute('data-igs-rm-shade'), null);
});

test('gate:romance:nsfw-with-romance-enabled-is-level-three', () => {
    const { root, stage } = makeReader();
    const result = applyRomanceToDom(root, snapshotOf({ romance: { enabled: true }, nsfw: true, statusHud: { nsfwSpriteMode: 'shade' } }), {
        sprite: { url: `e${urlSeq += 1}.png`, posX: 50, scale: 40 }, reducedMotion: false,
    });
    assert.equal(result.level, 3);
    assert.equal(result.shade, true);
    assert.equal(stage.style.getPropertyValue('--igs-rm-backlight'), '1');
});

test('gate:romance:css-composes-sprite-transform-and-avoids-mask-url', () => {
    assert.match(STAGE_DIRECTION_STYLE_TEXT, /#igs-stage-motion\[data-igs-cg\] \.igs-dialog\{[^}]*backdrop-filter:none!important;transition:none!important/);
    assert.match(STAGE_DIRECTION_STYLE_TEXT, /#igs-stage-motion\[data-igs-cg\] #igs-dialog-layer\{isolation:isolate;transform:translateZ\(0\)/);
    assert.match(STAGE_DIRECTION_STYLE_TEXT, /scale:min\(1\.3,calc\(var\(--igs-sd-closeup-scale,1\) \* var\(--igs-rm-scale,1\)\)\)/);
    assert.match(STAGE_DIRECTION_STYLE_TEXT, /translate:calc\(var\(--igs-sd-tx,0px\) \+ var\(--igs-rm-dx,0%\)\)/);
    assert.doesNotMatch(STAGE_DIRECTION_STYLE_TEXT, /\{scale:1\.12;/);
    // 剪影继承立绘背景图压黑，遮罩只用渐变，不引用立绘地址。
    assert.match(ROMANCE_STYLE_TEXT, /#igs-sprite::after\{[^}]*background-image:inherit[^}]*filter:brightness\(0\)/);
    assert.doesNotMatch(ROMANCE_STYLE_TEXT, /mask-image:[^;]*url\(/);
    assert.match(ROMANCE_STYLE_TEXT, /\.igs-sd-sprite-ghost,#igs-stage-motion\[data-igs-rm-shade\] #igs-sprite-ghost\{filter:brightness\(0\)!important/);
    assert.match(ROMANCE_STYLE_TEXT, /prefers-reduced-motion: reduce/);
});

test('gate:romance:prompt-only-when-enabled', () => {
    assert.equal(resolveRomanceFxPromptRule(false), '');
    const rule = resolveRomanceFxPromptRule(true);
    assert.match(rule, /\[igs-fx:romance\|暧昧\]/);
    assert.match(rule, /\[igs-fx:romance-end\]/);
    assert.match(rule, /nsfw/);
});

// ---- 阶段 A：好感常驻氛围与关系变化卡 ----
import { pickFavorPercent } from '../src/visual/igs-ui/romance-settings.js';
import { closeRomanceFx } from '../src/visual/igs-ui/romance-runtime.js';
import { diffRelation } from '../src/visual/igs-ui/romance-moments.js';
import { extractStatusHudRelation } from '../src/data/shujuku/status-hud-model.js';

function hudSnapshot({ romance = {}, character = '', metrics = [], relation = '', spriteCharacter = '', nsfw = false, fx = {} } = {}) {
    return {
        messageId: 1,
        readerSettings: { romanceFx: { enabled: true, ...romance }, statusHud: {} },
        content: { fx: { romance: '', ...fx }, sceneNsfw: nsfw, textType: 'dialogue', spriteCharacter, statusHud: { character, metrics, relation } },
    };
}

test('gate:romance:favor-settings-and-exact-metric-match', () => {
    const s = normalizeRomanceFxSettings({});
    assert.equal(s.favorAmbience, false);
    assert.equal(s.relationCard, false);
    assert.equal(s.favorThreshold, 60);
    assert.deepEqual(s.favorWords, ['好感', '好感度', '爱意', '心动']);
    assert.equal(normalizeRomanceFxSettings({ favorThreshold: '80' }).favorThreshold, 80);
    assert.equal(normalizeRomanceFxSettings({ favorThreshold: 55 }).favorThreshold, 60);
    assert.deepEqual(normalizeRomanceFxSettings({ favorWords: [] }).favorWords, []);
    const metrics = [{ label: '好感', percent: 40 }, { label: '爱意', percent: 72 }, { label: '好感值上限', percent: 99 }, { label: '体力', percent: 90 }];
    assert.equal(pickFavorPercent(metrics, s.favorWords), 72);
    assert.equal(pickFavorPercent([{ label: '体力', percent: 90 }], s.favorWords), null);
    assert.equal(resolveRomanceParams('favor', 'medium').glow, 0.3);
    assert.equal(resolveRomanceParams('favor', 'medium').bgBlur, 0);
});

test('gate:romance:favor-ambience-cached-across-narration-and-threshold', () => {
    const { root, stage } = makeReader();
    const ctx = { sprite: { url: `f${urlSeq += 1}.png`, posX: 50, scale: 40 }, reducedMotion: false };
    const romance = { favorAmbience: true, favorThreshold: 60 };
    closeRomanceFx(root);
    // 说话人页读到好感 75：进入 0.5 档，只有暖光与光斑，不逼近、不带整数档位。
    const r1 = applyRomanceToDom(root, hudSnapshot({ romance, character: '爱丽丝', spriteCharacter: '爱丽丝', metrics: [{ label: '好感', percent: 75 }] }), ctx);
    assert.equal(r1.favor, true);
    assert.equal(stage.getAttribute('data-igs-rm-favor'), '1');
    assert.equal(stage.getAttribute('data-igs-rm-level'), null);
    assert.equal(stage.getAttribute('data-igs-rm-approach'), null);
    assert.equal(stage.getAttribute('data-igs-rm-backlight'), null);
    assert.equal(stage.style.getPropertyValue('--igs-rm-glow'), '0.3');
    // 旁白页状态栏无角色：沿用缓存，氛围不闪断。
    assert.equal(applyRomanceToDom(root, hudSnapshot({ romance, spriteCharacter: '爱丽丝' }), ctx).favor, true);
    // 换成好感未达标的角色 / 没有立绘 / NSFW：不生效。
    applyRomanceToDom(root, hudSnapshot({ romance, character: '贝拉', spriteCharacter: '贝拉', metrics: [{ label: '好感', percent: 30 }] }), ctx);
    assert.equal(stage.getAttribute('data-igs-rm-favor'), null);
    assert.equal(applyRomanceToDom(root, hudSnapshot({ romance, spriteCharacter: '爱丽丝' }), { sprite: null }).favor, false);
    assert.equal(applyRomanceToDom(root, hudSnapshot({ romance, spriteCharacter: '爱丽丝', nsfw: true, statusHud: {} }), ctx).favor, false);
    // 有 romance 标签时按整数档位，不叠 0.5 档。
    const tagged = applyRomanceToDom(root, hudSnapshot({ romance, spriteCharacter: '爱丽丝', fx: { romance: 'ambiguous' } }), ctx);
    assert.equal(tagged.level, 1);
    assert.equal(stage.getAttribute('data-igs-rm-favor'), null);
    // 关闭阅读器清空缓存。
    closeRomanceFx(root);
    assert.equal(applyRomanceToDom(root, hudSnapshot({ romance, spriteCharacter: '爱丽丝' }), ctx).favor, false);
    // 子开关关闭时不生效。
    applyRomanceToDom(root, hudSnapshot({ character: '爱丽丝', spriteCharacter: '爱丽丝', metrics: [{ label: '好感', percent: 95 }] }), ctx);
    assert.equal(stage.getAttribute('data-igs-rm-favor'), null);
});

test('gate:romance:relation-column-extraction', () => {
    const table = {
        columns: ['角色名', '好感', '关系', '与主角关系备注'],
        rows: [['爱丽丝', '80', '恋人', ''], ['贝拉', '20', '42', '']],
    };
    assert.equal(extractStatusHudRelation(table, '爱丽丝', {}), '恋人');
    // 纯数字不算关系名；找不到角色返回空。
    assert.equal(extractStatusHudRelation(table, '贝拉', {}), '');
    assert.equal(extractStatusHudRelation(table, '路人', {}), '');
    assert.equal(extractStatusHudRelation({ columns: ['角色名', '好感'], rows: [['爱丽丝', '80']] }, '爱丽丝', {}), '');
});

test('gate:romance:relation-diff-baseline-first-then-change', () => {
    const baseline = new Map();
    assert.equal(diffRelation(baseline, '爱丽丝', '朋友'), null);
    assert.equal(diffRelation(baseline, '爱丽丝', '朋友'), null);
    assert.deepEqual(diffRelation(baseline, '爱丽丝', '恋人'), { character: '爱丽丝', from: '朋友', to: '恋人' });
    assert.equal(diffRelation(baseline, '爱丽丝', ''), null);
    assert.equal(diffRelation(baseline, '', '恋人'), null);
});

test('gate:romance:relation-card-shows-once-dismisses-and-clears-on-close', () => {
    const { root, stage } = makeReader();
    closeRomanceFx(root);
    const timers = [];
    const ctx = { sprite: null, reducedMotion: false, schedule: (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; }, clear: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); } };
    const romance = { relationCard: true };
    const front = () => stage.querySelector('#igs-fx-front');
    const cards = () => (front() ? front().children.filter((c) => c.className === 'igs-rm-relation-card') : []);
    applyRomanceToDom(root, hudSnapshot({ romance, character: '爱丽丝', relation: '朋友' }), ctx);
    assert.equal(cards().length, 0);
    applyRomanceToDom(root, hudSnapshot({ romance, character: '爱丽丝', relation: '恋人' }), ctx);
    assert.equal(cards().length, 1);
    assert.deepEqual(cards()[0].children.map((c) => c.textContent), ['关系变化', '爱丽丝', '朋友 → 恋人']);
    // 同页重绘不重播；关系卡不受普通页 cancelRomanceFx 影响。
    applyRomanceToDom(root, hudSnapshot({ romance, character: '爱丽丝', relation: '恋人' }), ctx);
    assert.equal(cards().length, 1);
    assert.equal(timers.length, 1);
    timers.shift().fn();
    assert.equal(cards().length, 0);
    // 关闭阅读器后基线清空：重新打开首次读到只记录。
    applyRomanceToDom(root, hudSnapshot({ romance, character: '爱丽丝', relation: '挚爱' }), ctx);
    assert.equal(cards().length, 1);
    closeRomanceFx(root);
    assert.equal(cards().length, 0);
    applyRomanceToDom(root, hudSnapshot({ romance, character: '爱丽丝', relation: '朋友' }), ctx);
    assert.equal(cards().length, 0);
    // 子开关关闭时不追踪。
    applyRomanceToDom(root, hudSnapshot({ character: '爱丽丝', relation: '恋人' }), ctx);
    assert.equal(cards().length, 0);
});

// ---- 阶段 B：修罗场、告白、恋爱回忆 ----
import { planConfess, slowerTypewriterSpeed, CONFESS_ANSWER_PAUSE_MS } from '../src/visual/igs-ui/romance-moments.js';
import { applyTypewriterEffect } from '../src/visual/igs-ui/typewriter-runtime.js';

function storySnapshot({ romance = {}, fx = {}, index = 0, speaker = '', spriteCharacter = '', nsfw = false, messageId = 7, characters = {} } = {}) {
    return {
        messageId,
        readerSettings: { romanceFx: { enabled: true, ...romance }, statusHud: {}, typewriter: { speed: 'fast' }, _sceneAssets: { characters, characterAliases: { 爱丽丝: ['小爱'] } } },
        content: { fx: { romance: '', romanceAt: -1, ...fx }, sceneNsfw: nsfw, textType: 'dialogue', currentIndex: index, speaker, spriteCharacter, statusHud: {} },
    };
}

test('gate:romance:tags-target-confess-memory', () => {
    const src = '[igs-fx:romance|暧昧|爱丽丝]\n甲\n[igs-fx:romance|亲密]\n乙\n[igs-fx:confess]\n丙\n[igs-fx:memory|初次约会]\n丁\n[igs-fx:memory|]\n[igs-fx:confess-end]\n[igs-fx:romance-end]\n戊';
    const list = extractFxDirectives(src);
    const at = (w) => src.indexOf(w);
    const p1 = resolveFxAtPage(list, at('甲'), -1);
    assert.equal(p1.romanceTarget, '爱丽丝');
    assert.equal(p1.romanceAt, 0);
    // 升档不换对象、不换区间起点。
    const p2 = resolveFxAtPage(list, at('乙'), at('甲'));
    assert.deepEqual([p2.romance, p2.romanceTarget, p2.romanceAt], ['intimate', '爱丽丝', 0]);
    const p3 = resolveFxAtPage(list, at('丙'), at('乙'));
    assert.equal(p3.confess, true);
    assert.equal(p3.memory, '');
    const p4 = resolveFxAtPage(list, at('丁'), at('丙'));
    assert.deepEqual([p4.confess, p4.memory], [false, '初次约会']);
    const p5 = resolveFxAtPage(list, at('戊'), at('丁'));
    assert.deepEqual([p5.romance, p5.romanceTarget, p5.romanceAt], ['', '', -1]);
    // 空回忆名与 confess-end 均丢弃，并从正文剥离。
    assert.equal(list.filter((d) => d.kind === 'memory').length, 1);
    assert.equal(list.filter((d) => d.kind === 'confess').length, 1);
    assert.equal(stripMarkerDirectives('[igs-fx:confess]\n[igs-fx:memory|初次约会]\n正文').trim(), '正文');
});

test('gate:romance:confess-span-and-answer-plan', () => {
    const memory = { confess: null };
    const plan = (index, speaker, confess = false, messageId = 1) => planConfess(memory, { messageId, index, speaker, confess });
    assert.equal(plan(0, '爱丽丝'), '');
    assert.equal(plan(1, '爱丽丝', true), 'confess');
    assert.equal(plan(2, '爱丽丝'), 'confess');
    assert.equal(plan(3, '爱丽丝'), 'confess');
    // 最多 3 页：第 4 页同一说话人也视为回答。
    assert.equal(plan(4, '爱丽丝'), 'answer');
    assert.equal(plan(2, '爱丽丝'), 'confess');
    assert.equal(plan(6, '我'), '');
    // 换说话人即结束告白段，下一页为回答。
    const m2 = { confess: null };
    assert.equal(planConfess(m2, { messageId: 1, index: 5, speaker: '爱丽丝', confess: true }), 'confess');
    assert.equal(planConfess(m2, { messageId: 1, index: 6, speaker: '我' }), 'answer');
    assert.equal(planConfess(m2, { messageId: 2, index: 6, speaker: '我' }), '');
    assert.deepEqual(['fast', 'medium', 'slow', 'x'].map(slowerTypewriterSpeed), ['medium', 'slow', 'slow', 'slow']);
});

test('gate:romance:confess-dom-letterbox-slower-and-answer-pause', () => {
    const { root, stage } = makeReader();
    closeRomanceFx(root);
    const ctx = { sprite: null, reducedMotion: false };
    const romance = { confess: true };
    const r1 = applyRomanceToDom(root, storySnapshot({ romance, fx: { confess: true }, index: 3, speaker: '爱丽丝' }), ctx);
    assert.equal(stage.getAttribute('data-igs-rm-confess'), '1');
    assert.deepEqual(r1.typewriter, { speed: 'medium' });
    const r2 = applyRomanceToDom(root, storySnapshot({ romance, index: 4, speaker: '我' }), ctx);
    assert.equal(stage.getAttribute('data-igs-rm-confess'), null);
    assert.deepEqual(r2.typewriter, { delay: CONFESS_ANSWER_PAUSE_MS });
    // 减少动态效果：保留黑边，不停顿。
    closeRomanceFx(root);
    applyRomanceToDom(root, storySnapshot({ romance, fx: { confess: true }, index: 3, speaker: '爱丽丝' }), { ...ctx, reducedMotion: true });
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, index: 4, speaker: '我' }), { ...ctx, reducedMotion: true }).typewriter, null);
    // 子开关关闭 / NSFW：不告白。
    closeRomanceFx(root);
    assert.equal(applyRomanceToDom(root, storySnapshot({ fx: { confess: true }, index: 3 }), ctx).typewriter, null);
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: { confess: true }, index: 3, nsfw: true }), ctx).typewriter, null);
    assert.equal(stage.getAttribute('data-igs-rm-confess'), null);
});

test('gate:romance:confess-heartbeat-plays-once-on-entering-the-span', () => {
    const { root } = makeReader();
    closeRomanceFx(root);
    const calls = [];
    const ctx = { sprite: null, reducedMotion: false, audioScheduler: (job) => { calls.push(job.kind); return { stop() {} }; } };
    const withSound = (snapshot, fxSound = { enabled: true, volume: 0.5 }) => ({ ...snapshot, readerSettings: { ...snapshot.readerSettings, fxSound } });
    const page = (index, extra = {}) => withSound(storySnapshot({ romance: { confess: true }, index, speaker: '爱丽丝', ...extra }));
    applyRomanceToDom(root, page(3, { fx: { confess: true } }), ctx);
    applyRomanceToDom(root, page(3, { fx: { confess: true } }), ctx);
    applyRomanceToDom(root, page(4), ctx);
    assert.deepEqual(calls, ['heartbeat']);
    closeRomanceFx(root);
    applyRomanceToDom(root, withSound(storySnapshot({ romance: { confess: true }, fx: { confess: true }, index: 3, speaker: '爱丽丝' }), { enabled: false, volume: 0.5 }), ctx);
    assert.deepEqual(calls, ['heartbeat'], '演出音效关闭时不响');
});

test('gate:romance:typewriter-delay-shifts-animation-and-reveal', () => {
    const calls = [];
    const makeTarget = () => ({
        childNodes: [{ nodeType: 3, nodeValue: '你愿意吗' }], dataset: {}, classList: { toggle() {}, add() {}, remove() {} },
        setAttribute() {}, removeAttribute() {}, getBoundingClientRect: () => ({ left: 0, width: 100 }),
    });
    const animate = (el, frames, timing) => { calls.push(timing); return { cancel() {}, addEventListener() {} }; };
    const result = applyTypewriterEffect(makeTarget(), { enabled: true, speed: 'medium', mode: 'soft', key: 'k1', reducedMotion: false, delay: 600, animate });
    assert.equal(result.animated, true);
    assert.equal(calls[0].delay, 600);
    assert.ok(result.revealDelay({ getBoundingClientRect: () => ({ left: 0 }) }) >= 600);
    const plain = applyTypewriterEffect(makeTarget(), { enabled: true, speed: 'medium', mode: 'soft', key: 'k2', reducedMotion: false, animate });
    assert.equal(plain.animated, true);
    assert.equal('delay' in calls[1], false);
});

test('gate:romance:memory-captures-once-and-never-in-nsfw', () => {
    const { root, stage } = makeReader();
    closeRomanceFx(root);
    const shots = [];
    const ctx = { sprite: null, reducedMotion: false, onMemory: (shot) => shots.push(shot) };
    const romance = { memories: true };
    const toasts = () => (stage.querySelector('#igs-fx-front') || { children: [] }).children.filter((c) => c.className === 'igs-rm-memory-toast');
    applyRomanceToDom(root, storySnapshot({ romance, fx: { memory: '初次约会' }, index: 2 }), ctx);
    assert.equal(shots.length, 1);
    assert.equal(shots[0].caption, '初次约会');
    assert.equal(shots[0].messageId, 7);
    assert.equal(toasts()[0].textContent, '已记下回忆：初次约会');
    // 同页重绘、翻回再来：同一楼层同一名称只存一次；NSFW 与子开关关闭时不拍。
    applyRomanceToDom(root, storySnapshot({ romance, fx: { memory: '初次约会' }, index: 2 }), ctx);
    assert.equal(shots.length, 1);
    applyRomanceToDom(root, storySnapshot({ romance, fx: { memory: '初次约会' }, index: 2, nsfw: true, messageId: 8 }), ctx);
    assert.equal(shots.length, 1);
    applyRomanceToDom(root, storySnapshot({ fx: { memory: '第一次牵手' }, index: 3 }), ctx);
    assert.equal(shots.length, 1);
});

test('gate:romance:rival-tone-for-other-registered-character', () => {
    const { root, stage } = makeReader();
    closeRomanceFx(root);
    const characters = { 爱丽丝: {}, 贝拉: {}, 系统: {}, 林舟: {} };
    const ctx = { sprite: { url: `g${urlSeq += 1}.png`, posX: 50, scale: 40 }, reducedMotion: false, userName: '林舟' };
    const romance = { rival: true };
    // 好感不等于爱情：系统、主角都有好感数据，也不因此算情敌。
    for (const character of ['系统', '林舟']) applyRomanceToDom(root, hudSnapshot({ romance, character, spriteCharacter: character, metrics: [{ label: '好感', percent: 80 }] }), ctx);
    const fx = { romance: 'ambiguous', romanceAt: 12 };
    // 未写对象：不猜对象，谁出场都不触发（以前按第一个出场的人猜，换人说话就频繁弹心碎）。
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx, spriteCharacter: '爱丽丝', characters }), ctx).rival, false);
    assert.equal(stage.getAttribute('data-igs-rm-tone'), 'warm');
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx, spriteCharacter: '贝拉', characters }), ctx).rival, false);
    assert.equal(stage.getAttribute('data-igs-rm-tone'), 'warm');
    // 标签写明对象：对象本人（含别名）不触发，另一位已登记角色触发；未登记的路人不算。
    const named = { romance: 'ambiguous', romanceAt: 40, romanceTarget: '贝拉' };
    // 爱丽丝还没当过对象：只是同场的人，不算情敌。
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: named, spriteCharacter: '爱丽丝', characters }), ctx).rival, false);
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: { ...named, romanceTarget: '爱丽丝' }, spriteCharacter: '小爱', characters }), ctx).rival, false);
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: named, spriteCharacter: '路人', characters }), ctx).rival, false);
    // 爱丽丝当过对象（上面那页写的别名「小爱」也归到她），之后在贝拉的段落出场才算情敌。
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: named, spriteCharacter: '爱丽丝', characters }), ctx).rival, true);
    assert.equal(stage.getAttribute('data-igs-rm-tone'), 'rival');
    // 男女主 + 系统角色：系统插话（无好感数据）、主角本人出场、对象写成主角，都不触发。
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: named, spriteCharacter: '系统', characters }), ctx).rival, false);
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: named, spriteCharacter: '林舟', characters }), ctx).rival, false);
    for (const romanceTarget of ['林舟', '主角']) {
        assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: { ...named, romanceTarget }, spriteCharacter: '爱丽丝', characters }), ctx).rival, false);
    }
    // 子开关关闭、NSFW 时不触发。
    assert.equal(applyRomanceToDom(root, storySnapshot({ fx: named, spriteCharacter: '爱丽丝', characters }), ctx).rival, false);
    assert.equal(applyRomanceToDom(root, storySnapshot({ romance, fx: named, spriteCharacter: '爱丽丝', characters, nsfw: true }), ctx).rival, false);
});

test('gate:romance:prompt-lists-only-enabled-extras', () => {
    const base = resolveRomanceFxPromptRule({ enabled: true });
    assert.doesNotMatch(base, /confess|memory|对象角色名/);
    const full = resolveRomanceFxPromptRule({ enabled: true, rival: true, confess: true, memories: true });
    assert.match(full, /\[igs-fx:romance\|暧昧\|对象角色名\]/);
    assert.match(full, /\[igs-fx:confess\]/);
    assert.match(full, /\[igs-fx:memory\|初次约会\]/);
    assert.match(full, /合计最多1个/);
    assert.equal(resolveRomanceFxPromptRule({ enabled: false, confess: true }), '');
});

// ---- 阶段 C：立绘快捷动作 ----
import { fillRomanceAction, normalizeRomanceActions, ROMANCE_ACTION_DEFAULTS } from '../src/visual/igs-ui/romance-settings.js';
import { deliverRomanceAction } from '../src/visual/igs-ui/romance-actions.js';

function withListeners(el) {
    const listeners = new Map();
    el.addEventListener = (name, fn) => listeners.set(name, fn);
    el.fire = (name) => { const fn = listeners.get(name); if (fn) fn({ stopPropagation() {}, preventDefault() {} }); };
    return el;
}

function makeActionReader(inputShown = true) {
    const reader = makeReader();
    const doc = reader.root.ownerDocument;
    const baseCreate = doc.createElement;
    doc.createElement = (tag) => withListeners(baseCreate(tag));
    const input = reader.stage.appendChild(makeEl(doc, 'igs-input'));
    input.value = '';
    input.focused = 0;
    input.focus = () => { input.focused += 1; };
    input.getClientRects = () => (inputShown ? [{}] : []);
    return { ...reader, input, doc };
}

test('gate:romance:action-settings-and-template', () => {
    assert.equal(normalizeRomanceFxSettings({}).quickActions, false);
    assert.deepEqual(normalizeRomanceFxSettings({}).actions.map((a) => a.name), ROMANCE_ACTION_DEFAULTS.map((a) => a.name));
    assert.deepEqual(normalizeRomanceActions([]), []);
    const many = Array.from({ length: 12 }, (_, i) => ({ name: `动作${i}名称超过八个字啊`, text: 'x'.repeat(80) }));
    const list = normalizeRomanceActions(many);
    assert.equal(list.length, 8);
    assert.equal(list[0].name.length, 8);
    assert.equal(list[0].text.length, 60);
    assert.equal(fillRomanceAction('（轻轻牵起{角色}的手，{角色}笑了）', '爱丽丝'), '（轻轻牵起爱丽丝的手，爱丽丝笑了）');
    assert.equal(fillRomanceAction('（摸摸{角色}）', ''), '（摸摸对方）');
});

test('gate:romance:action-deliver-appends-or-copies', () => {
    const { root, input, doc } = makeActionReader(true);
    assert.equal(deliverRomanceAction(root, '（牵手）', doc), 'input');
    assert.equal(input.value, '（牵手）');
    assert.equal(input.focused, 1);
    input.value = '你好';
    deliverRomanceAction(root, '（牵手）', doc);
    assert.equal(input.value, '你好 （牵手）');
    const hidden = makeActionReader(false);
    const copied = [];
    hidden.doc.defaultView.navigator = { clipboard: { writeText: (v) => { copied.push(v); return Promise.resolve(); } } };
    assert.equal(deliverRomanceAction(hidden.root, '（拥抱）', hidden.doc), 'clipboard');
    assert.deepEqual(copied, ['（拥抱）']);
    assert.equal(hidden.input.value, '');
    assert.equal(deliverRomanceAction(hidden.root, '', hidden.doc), '');
});

test('gate:romance:action-button-shows-in-ambient-levels-only-and-writes-input', () => {
    const { root, stage, input } = makeActionReader(true);
    closeRomanceFx(root);
    const ctx = { sprite: { url: `h${urlSeq += 1}.png`, posX: 30, scale: 40 }, reducedMotion: false };
    const romance = { quickActions: true };
    const front = () => stage.querySelector('#igs-fx-front');
    const find = (cls) => (front() ? front().children.filter((c) => c.className === cls) : []);
    applyRomanceToDom(root, storySnapshot({ romance, fx: { romance: 'ambiguous', romanceAt: 1 }, spriteCharacter: '爱丽丝', index: 1 }), ctx);
    const [button] = find('igs-rm-action-btn');
    assert.ok(button);
    // 原图尺寸未知：贴在立绘上方中间（posX 30、宽 40% → 中心 (100-40)×30% + 20% = 38%）。
    assert.equal(button.style.left, '380px');
    assert.equal(button.style.top, '108px');
    button.fire('click');
    const [menu] = find('igs-rm-action-menu');
    assert.deepEqual(menu.children.map((c) => c.textContent), ['牵手', '摸头', '拥抱', '凝视', '搭话']);
    menu.children[0].fire('click');
    assert.equal(input.value, '（轻轻牵起爱丽丝的手）');
    assert.equal(find('igs-rm-action-menu').length, 0);
    // 翻页收起菜单，按钮保留。
    button.fire('click');
    applyRomanceToDom(root, storySnapshot({ romance, fx: { romance: 'ambiguous', romanceAt: 1 }, spriteCharacter: '爱丽丝', index: 2 }), ctx);
    assert.equal(find('igs-rm-action-menu').length, 0);
    assert.equal(find('igs-rm-action-btn').length, 1);
    // NSFW、离开区间、没有立绘、子开关关闭：按钮移除。
    applyRomanceToDom(root, storySnapshot({ romance, nsfw: true, spriteCharacter: '爱丽丝', index: 3 }), ctx);
    assert.equal(find('igs-rm-action-btn').length, 0);
    applyRomanceToDom(root, storySnapshot({ romance, fx: { romance: 'intimate', romanceAt: 1 }, spriteCharacter: '爱丽丝', index: 4 }), ctx);
    assert.equal(find('igs-rm-action-btn').length, 1);
    applyRomanceToDom(root, storySnapshot({ romance, spriteCharacter: '爱丽丝', index: 5 }), ctx);
    assert.equal(find('igs-rm-action-btn').length, 0);
    applyRomanceToDom(root, storySnapshot({ romance, fx: { romance: 'intimate', romanceAt: 1 }, index: 6 }), { sprite: null });
    assert.equal(find('igs-rm-action-btn').length, 0);
    applyRomanceToDom(root, storySnapshot({ fx: { romance: 'intimate', romanceAt: 1 }, spriteCharacter: '爱丽丝', index: 7 }), ctx);
    assert.equal(find('igs-rm-action-btn').length, 0);
    // 关闭阅读器清理。
    applyRomanceToDom(root, storySnapshot({ romance, fx: { romance: 'intimate', romanceAt: 1 }, spriteCharacter: '爱丽丝', index: 8 }), ctx);
    closeRomanceFx(root);
    assert.equal(find('igs-rm-action-btn').length, 0);
});

// ---- 阶段 D：NSFW 场景内强度曲线 ----
import { nsfwCurveFactor, resolveNsfwSpan, scaleRomanceParams } from '../src/visual/igs-ui/romance-settings.js';

test('gate:romance:nsfw-span-and-curve-factor', () => {
    const T = true;
    const F = false;
    // 单楼层完整段：页 1..6 为 NSFW，第 7 页结束。
    const flags = [F, T, T, T, T, T, T, F];
    const factors = [1, 2, 3, 4, 5, 6].map((i) => nsfwCurveFactor(resolveNsfwSpan(flags, i)));
    assert.deepEqual(factors, [0.55, 0.8, 1, 1, 0.8, 0.6]);
    assert.deepEqual(resolveNsfwSpan(flags, 3), { index: 2, length: 6, continued: false, endsInFloor: true });
    assert.equal(resolveNsfwSpan(flags, 0), null);
    // 从楼层开头延续上一楼层：不渐强；延续到楼层末尾：不回落。
    const whole = [T, T, T, T];
    assert.deepEqual([0, 1, 2, 3].map((i) => nsfwCurveFactor(resolveNsfwSpan(whole, i, true))), [1, 1, 1, 1]);
    // 本楼第一页新开的 NSFW（上一楼不是）照常渐强。
    assert.deepEqual([0, 1, 2].map((i) => nsfwCurveFactor(resolveNsfwSpan(whole, i, false))), [0.55, 0.8, 1]);
    // 只有 1 页、且在本楼结束：渐强与回落取较小值。
    assert.equal(nsfwCurveFactor(resolveNsfwSpan([F, T, F], 1)), 0.55);
    assert.equal(nsfwCurveFactor(null), 1);
    // 系数缩放氛围参数。
    const p = resolveRomanceParams(3, 'medium');
    assert.equal(scaleRomanceParams(p, 1), p);
    const half = scaleRomanceParams(p, 0.5);
    assert.equal(half.backlight, 0.5);
    assert.equal(half.zoom, 1.08);
    assert.equal(half.pull, 0.425);
});

test('gate:romance:nsfw-curve-applies-to-level-three-only-when-enabled', () => {
    const { root, stage } = makeReader();
    closeRomanceFx(root);
    const ctx = { sprite: { url: `i${urlSeq += 1}.png`, posX: 50, scale: 40 }, reducedMotion: false };
    const snap = (romance, span) => {
        const s = snapshotOf({ romance: { enabled: true, ...romance }, nsfw: true, statusHud: { nsfwSpriteMode: 'show' } });
        s.content.nsfwSpan = span;
        return s;
    };
    const first = { index: 0, length: 5, continued: false, endsInFloor: true };
    const r = applyRomanceToDom(root, snap({}, first), ctx);
    assert.equal(r.curve, 0.55);
    assert.equal(stage.style.getPropertyValue('--igs-rm-backlight'), '0.55');
    assert.equal(applyRomanceToDom(root, snap({ nsfwCurve: false }, first), ctx).curve, 1);
    assert.equal(stage.style.getPropertyValue('--igs-rm-backlight'), '1');
    assert.equal(applyRomanceToDom(root, snap({}, null), ctx).curve, 1);
});
