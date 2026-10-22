import '../src/visual/igs-ui/scene-audio.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FX_PACK_BUILDERS, FX_PACK_SFX_DEFS, FX_PACKS, getPack, packOfKind, validatePacks } from '../src/scene/fx-packs.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { WUXIA_KINDS, WUXIA_PROMPT_LINES, WUXIA_TRIGGERS, parseWuxiaBody, wuxiaFxOf } from '../src/visual/igs-ui/fx-wuxia-model.js';
import { WUXIA_BUILDERS } from '../src/visual/igs-ui/fx-wuxia.js';
import { WUXIA_SFX_DEFS } from '../src/visual/igs-ui/fx-wuxia-sfx.js';
import { applyFxWorldview } from '../src/scene/fx-era.js';
import { WUXIA_BATTLE_STYLE_TEXT } from '../src/visual/igs-ui/fx-battle-wuxia-style.js';
import { WUXIA_STYLE_TEXT } from '../src/visual/igs-ui/fx-wuxia-style.js';
import { WUXIA_HUD_THEME } from '../src/visual/igs-ui/dialog-theme-wuxia.js';

const pack = getPack('wuxia');

function makeEl(doc) {
    const attrs = new Map();
    const el = {
        ownerDocument: doc, children: [], parentNode: null, className: '', innerHTML: '', style: {},
        setAttribute(k, v) { attrs.set(k, String(v)); },
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
        appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
    };
    return el;
}

function makeEnv(reduced) {
    const doc = { createElement: () => makeEl(doc) };
    const animated = [];
    const sprite = makeEl(doc);
    sprite.animate = (...a) => { animated.push(a); return { cancel() {} }; };
    const root = { ownerDocument: doc, querySelector: (s) => (s === '#igs-sprite' ? sprite : null), querySelectorAll: () => [] };
    const motion = makeEl(doc);
    motion.animate = (...a) => { animated.push(a); return { cancel() {} }; };
    return { env: { root, doc, reduced, hold: 1, speaker: '甲', ancient: true, worldview: 'ancient', layers: { motion, stage: makeEl(doc), front: makeEl(doc) }, play() {} }, animated };
}

const SAMPLES = {
    wxname: { type: 'wxname', title: '玉面郎君', name: '沈舟' },
    wxpalm: { type: 'wxpalm', a: '甲', b: '乙', winner: '甲' },
    wxdart: { type: 'wxdart', name: '袖箭' },
    wxmanual: { type: 'wxmanual', name: '易筋经', note: '一页残卷' },
    wxtoken: { type: 'wxtoken', name: '武林盟主令' },
    wxoath: { type: 'wxoath', mode: 'oath', a: '甲', b: '乙' },
    wxmad: { type: 'wxmad', who: '甲' },
};

test('gate: wuxia pack registers seven kinds, default off, ancient worldview only', () => {
    assert.equal(pack.id, 'wuxia');
    assert.equal(pack.era, 'ancient');
    assert.equal(pack.defaultOn, false);
    assert.deepEqual(validatePacks(FX_PACKS).filter((p) => p.startsWith('wuxia')), []);
    const daily = normalizeDailyFxSettings({ enabled: true });
    assert.equal(daily.packWuxia, false);
    for (const kind of WUXIA_KINDS) {
        assert.equal(packOfKind(kind).id, 'wuxia', kind);
        assert.equal(daily[kind], false, kind);
        assert.ok(WUXIA_PROMPT_LINES[kind].includes(`[igs-fx:${kind}`), kind);
        assert.ok(WUXIA_TRIGGERS[kind].length >= 2, kind);
        assert.equal(typeof FX_PACK_BUILDERS[kind], 'function', kind);
    }
    const on = { dailyFx: { enabled: true, packWuxia: true, ...Object.fromEntries(WUXIA_KINDS.map((k) => [k, true])) } };
    for (const worldview of ['modern', 'fantasy', 'scifi', 'magic']) {
        for (const kind of WUXIA_KINDS) assert.equal(applyFxWorldview(on, worldview).dailyFx[kind], false, `${worldview} ${kind}`);
    }
    for (const kind of WUXIA_KINDS) assert.equal(applyFxWorldview(on, 'ancient').dailyFx[kind], true, kind);
});

test('gate: wuxia parse fills defaults and drops malformed tags', () => {
    assert.deepEqual(parseWuxiaBody('wxname', ['玉面郎君', '沈舟']), ['wxname', '玉面郎君', '沈舟']);
    assert.deepEqual(parseWuxiaBody('wxname', ['沈舟']), ['wxname', '', '沈舟']);
    assert.equal(parseWuxiaBody('wxname', []), null);
    assert.deepEqual(parseWuxiaBody('wxpalm', ['甲', '乙', '丙']), ['wxpalm', '甲', '乙', '']);
    assert.equal(parseWuxiaBody('wxpalm', ['甲']), null);
    assert.deepEqual(parseWuxiaBody('wxdart', []), ['wxdart', '暗器']);
    assert.deepEqual(parseWuxiaBody('wxoath', ['拜师', '甲', '乙']), ['wxoath', 'master', '甲', '乙']);
    assert.deepEqual(parseWuxiaBody('wxoath', ['甲', '乙']), ['wxoath', 'oath', '甲', '乙']);
    assert.equal(parseWuxiaBody('wxtoken', ['']), null);
    assert.deepEqual(wuxiaFxOf(parseWuxiaBody('wxmanual', ['易筋经'])), { type: 'wxmanual', name: '易筋经', note: '' });
    assert.deepEqual(wuxiaFxOf(parseWuxiaBody('wxmad', [])), { type: 'wxmad', who: '' });
});

test('gate: wuxia builders stay static when reduced, escape text and keep 走火入魔 under the dialog', () => {
    for (const kind of WUXIA_KINDS) {
        const { env, animated } = makeEnv(true);
        const built = WUXIA_BUILDERS[kind](SAMPLES[kind], env);
        assert.match(built.node.className, /is-reduced/, kind);
        assert.ok(built.life > 0, kind);
        assert.equal(built.layer, kind === 'wxmad' ? 'stage' : 'front', kind);
        assert.ok(built.sounds.every((s) => FX_PACK_SFX_DEFS[s]), `${kind} sounds defined`);
        assert.equal(animated.length, 0, `${kind} runs no WAAPI when reduced`);
    }
    const full = WUXIA_KINDS.filter((kind) => /is-full/.test(WUXIA_BUILDERS[kind](SAMPLES[kind], makeEnv(true).env).node.className));
    assert.deepEqual(full, ['wxname', 'wxmanual', 'wxtoken', 'wxoath']);
    const evil = WUXIA_BUILDERS.wxmanual({ type: 'wxmanual', name: '<img src=x>', note: '<script>' }, makeEnv(true).env).node.innerHTML;
    assert.doesNotMatch(evil, /<img|<script/);
    const { env, animated } = makeEnv(false);
    WUXIA_BUILDERS.wxpalm(SAMPLES.wxpalm, env);
    assert.ok(animated.length > 0, 'palm clash shakes the stage');
});

test('gate: wuxia sfx defs are modest and finite', () => {
    for (const [name, def] of Object.entries(WUXIA_SFX_DEFS)) {
        assert.equal(FX_PACK_SFX_DEFS[name], def, name);
        let end = 0;
        for (const q of [...def.partials, ...def.noise]) {
            assert.ok(q.gain > 0 && q.gain <= 0.4 && q.start >= 0 && q.duration > 0, name);
            end = Math.max(end, q.start + q.duration);
        }
        assert.ok(end <= 5, `${name} stays short`);
    }
});

test('gate: wuxia shared tag/seal rules stay low-specificity, phone result line is horizontal, HUD keeps user avatar shape', () => {
    for (const [label, css] of [['battle', WUXIA_BATTLE_STYLE_TEXT], ['pack', WUXIA_STYLE_TEXT]]) {
        assert.match(css, /:where\(\.wx-tag\.v\)\{/, label);
        assert.doesNotMatch(css, /[^(]\.wx-tag\.v\{/, `${label}: 共享 .wx-tag.v 须包在 :where() 里，否则压过 .wx-r-line`);
        assert.match(css, /[^(]\.wx-seal\{[^}]*display:grid;place-items:center/, `${label}: 印须压过 .wx{display:block}，字居中`);
        assert.doesNotMatch(css, /:where\(\.wx-seal\)/, `${label}: .wx-seal 降到 :where 会被 .wx 压过，字偏到左上角`);
    }
    assert.match(WUXIA_BATTLE_STYLE_TEXT, /\.wx-r-line\{[^}]*writing-mode:horizontal-tb/, '手机结算行横排');
    assert.match(WUXIA_BATTLE_STYLE_TEXT, /\.igs-fx-battle-plate-mark\{[^}]*mask:/, '战斗名牌【战】钤毛边朱砂印');
    assert.match(WUXIA_BATTLE_STYLE_TEXT, /\.wx-h-who\{[^}]*IGS-MaShanZheng/, '出招人名用毛笔字');
    assert.doesNotMatch(WUXIA_HUD_THEME.avatar, /border-radius|clip-path/, '头像圆形/方形/圆角随用户设置');
    assert.match(WUXIA_HUD_THEME.emotion, /background:#a8382a/, '情绪词钤朱砂印');
    assert.match(WUXIA_HUD_THEME.emotion, /preserveAspectRatio='none'/, '情绪印毛边随字数横向拉伸，不只在正中留一方');
    assert.match(WUXIA_HUD_THEME.panel, /^padding:(calc\([^)]*\)\) ){3}calc\(28px/, '左内距 28，干笔不挤内容');
    assert.match(WUXIA_HUD_THEME.panel, /\) calc\(8px \* var\(--igs-hud-scale,1\)\) calc\(8px/, '干笔离面板左缘 8px，不贴边');
});

