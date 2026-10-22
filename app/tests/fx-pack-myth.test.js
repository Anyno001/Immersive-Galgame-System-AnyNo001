import '../src/visual/igs-ui/scene-audio.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { FX_PACK_BUILDERS, FX_PACK_SFX_DEFS, getPack, packOfKind, resolvePackAmbience, validatePacks, FX_PACKS, packAmbientCandidates, createPackVoices } from '../src/scene/fx-packs.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { MYTH_KINDS, MYTH_LABELS, MYTH_PROMPT_LINES, MYTH_TRIGGERS, mythFxOf, parseMythBody } from '../src/visual/igs-ui/fx-myth-model.js';
import { MYTH_BUILDERS } from '../src/visual/igs-ui/fx-myth.js';
import { MYTH_SFX_DEFS } from '../src/visual/igs-ui/fx-myth-sfx.js';
import { DAILY_FX_KINDS, dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { applyFxWorldview } from '../src/scene/fx-era.js';

const pack = getPack('myth');

function makeEl(doc) {
    const attrs = new Map();
    const el = {
        ownerDocument: doc, children: [], parentNode: null, className: '', innerHTML: '',
        style: {},
        classList: { contains: (n) => el.className.split(/\s+/).includes(n), add(n) { el.className = `${el.className} ${n}`.trim(); } },
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
    relic: { type: 'relic', who: '甲', name: '混元金斗', tone: 'gold' },
    clash: { type: 'clash', a: '乾坤圈', b: '混天绫' },
    mythroll: { type: 'mythroll', names: ['甲', '乙', '丙'] },
    formation: { type: 'formation', name: '十绝阵', mode: 'open' },
    flame: { type: 'flame', who: '甲' },
    thunder: { type: 'thunder', who: '甲' },
    aura: { type: 'aura', who: '甲', mode: 'yao' },
    charm: { type: 'charm', caster: '乙', target: '甲' },
    drain: { type: 'drain', from: '乙', to: '甲' },
    subdue: { type: 'subdue', mode: 'talisman', who: '甲' },
    barrier: { type: 'barrier', mode: 'open' },
    core: { type: 'core', name: '千年内丹' },
    pact: { type: 'pact', a: '甲', b: '乙' },
};

test('gate: myth pack registers every kind, default off, era ancient', () => {
    assert.equal(pack.id, 'myth');
    assert.equal(pack.era, 'ancient');
    assert.deepEqual([...pack.kinds].sort(), [...MYTH_KINDS].sort());
    assert.deepEqual(validatePacks(FX_PACKS).filter((p) => p.startsWith('myth')), []);
    const daily = normalizeDailyFxSettings({ enabled: true });
    for (const kind of MYTH_KINDS) {
        assert.equal(packOfKind(kind).id, 'myth', kind);
        assert.equal(daily[kind], false, `${kind} defaults off`);
        assert.ok(MYTH_LABELS[kind] && MYTH_PROMPT_LINES[kind], kind);
        const words = MYTH_TRIGGERS[kind];
        assert.ok(words.length >= 2 && words.length <= 4, kind);
        assert.ok(MYTH_PROMPT_LINES[kind].includes(`[igs-fx:${kind}`), kind);
        assert.equal(typeof FX_PACK_BUILDERS[kind], 'function', kind);
    }
    assert.equal(normalizeDailyFxSettings({ enabled: true }).packMyth, false);
});

test('gate:myth-roll-does-not-shadow-campus-rollcall', () => {
    assert.equal(new Set(DAILY_FX_KINDS).size, DAILY_FX_KINDS.length);
    assert.equal(packOfKind('rollcall'), null);
    assert.equal(packOfKind('mythroll').id, 'myth');
    assert.deepEqual(dailyFxOf(parseDailyFxBody('rollcall', ['小雨', '到'])), { type: 'rollcall', who: '小雨', reply: '到' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('mythroll', ['甲;乙'])), { type: 'mythroll', names: ['甲', '乙'] });
    const reader = { dailyFx: { enabled: true, packMyth: true, rollcall: true, mythroll: true } };
    const modern = applyFxWorldview(reader, 'modern');
    const ancient = applyFxWorldview(reader, 'ancient');
    assert.equal(modern.dailyFx.rollcall, true);
    assert.equal(modern.dailyFx.mythroll, false);
    assert.equal(ancient.dailyFx.rollcall, false);
    assert.equal(ancient.dailyFx.mythroll, true);
    assert.equal(reader.dailyFx.rollcall && reader.dailyFx.mythroll, true);
});

test('gate: myth parse yields the right fields and drops malformed tags', () => {
    assert.deepEqual(parseMythBody('relic', ['孙悟空', '金箍棒', '青']), ['relic', '孙悟空', '金箍棒', 'azure']);
    assert.deepEqual(parseMythBody('relic', ['金箍棒']), ['relic', '', '金箍棒', 'gold']);
    assert.equal(parseMythBody('relic', []), null);
    assert.equal(parseMythBody('clash', ['甲']), null);
    assert.deepEqual(parseMythBody('mythroll', ['甲;乙；丙、丁']), ['mythroll', '甲;乙;丙;丁']);
    assert.equal(parseMythBody('mythroll', ['1;2;3;4;5;6;7;8;9;10'])[1].split(';').length, 8);
    assert.deepEqual(parseMythBody('formation', ['诛仙阵', '破阵']), ['formation', '诛仙阵', 'break']);
    assert.deepEqual(parseMythBody('formation', ['诛仙阵', '乱写']), ['formation', '诛仙阵', 'open']);
    assert.deepEqual(parseMythBody('aura', ['妖王', '魔气']), ['aura', '妖王', 'mo']);
    assert.deepEqual(parseMythBody('charm', ['狐妖', '书生']), ['charm', '狐妖', '书生']);
    assert.deepEqual(parseMythBody('charm', ['书生']), ['charm', '', '书生']);
    assert.deepEqual(parseMythBody('subdue', ['葫芦', '蛇妖']), ['subdue', 'gourd', '蛇妖']);
    assert.deepEqual(parseMythBody('subdue', ['蛇妖']), ['subdue', 'talisman', '蛇妖']);
    assert.deepEqual(parseMythBody('barrier', ['破碎']), ['barrier', 'break']);
    assert.deepEqual(parseMythBody('barrier', []), ['barrier', 'open']);
    assert.equal(parseMythBody('core', ['']), null);
    assert.equal(parseMythBody('drain', ['甲']), null);
    assert.deepEqual(mythFxOf(parseMythBody('pact', ['甲', '乙'])), { type: 'pact', a: '甲', b: '乙' });
    assert.deepEqual(mythFxOf(parseMythBody('thunder', ['魔头'])), { type: 'thunder', who: '魔头' });
});

test('gate: myth builders return static nodes under reduced motion', () => {
    for (const kind of MYTH_KINDS) {
        const { env, animated } = makeEnv(true);
        const built = MYTH_BUILDERS[kind](SAMPLES[kind], env);
        assert.ok(built && built.node, kind);
        assert.match(built.node.className, /is-reduced/, kind);
        assert.ok(built.life > 0 && ['stage', 'front'].includes(built.layer), kind);
        assert.ok(built.sounds.every((s) => FX_PACK_SFX_DEFS[s]), `${kind} sounds defined`);
        assert.equal(animated.length, 0, `${kind} runs no WAAPI when reduced`);
    }
});

test('gate: myth life scales with env.hold and builders tolerate a missing sprite', () => {
    const a = makeEnv(false).env;
    const b = makeEnv(false).env;
    b.hold = 1.6;
    for (const kind of MYTH_KINDS.filter((k) => k !== 'mythroll')) {
        assert.ok(MYTH_BUILDERS[kind](SAMPLES[kind], b).life > MYTH_BUILDERS[kind](SAMPLES[kind], a).life, kind);
    }
    const bare = makeEnv(false).env;
    bare.root = { ownerDocument: bare.doc, querySelector: () => null, querySelectorAll: () => [] };
    for (const kind of MYTH_KINDS) assert.ok(MYTH_BUILDERS[kind](SAMPLES[kind], bare).node, kind);
});

test('gate: myth sfx defs are modest and finite', () => {
    for (const [name, def] of Object.entries(MYTH_SFX_DEFS)) {
        assert.equal(FX_PACK_SFX_DEFS[name], def, name);
        assert.ok(def.partials.length + def.noise.length > 0, name);
        let end = 0;
        for (const q of [...def.partials, ...def.noise]) {
            assert.ok(q.gain > 0 && q.gain <= 1 && q.start >= 0 && q.duration > 0, name);
            end = Math.max(end, q.start + q.duration);
        }
        assert.ok(end <= 5, `${name} stays short`);
    }
});

test('gate: myth ambience resolves four ancient places and four ambient voices', () => {
    const pick = (loc, worldview = 'ancient') => resolvePackAmbience(loc, { worldview, enabled: ['myth'] });
    assert.equal(pick('南天门').kind, 'mythsky');
    assert.equal(pick('鬼市').kind, 'mythbazaar');
    assert.equal(pick('黄泉路 彼岸花海').kind, 'mythhades');
    assert.equal(pick('盘丝洞').kind, 'mythcave');
    assert.equal(pick('鬼市', 'modern'), null);
    assert.equal(resolvePackAmbience('鬼市', { worldview: 'ancient', enabled: [] }), null);
    assert.deepEqual(packAmbientCandidates({ location: '忘川河畔', worldview: 'ancient', packs: ['myth'] }).map((c) => c.kind), ['mythriver']);
    assert.deepEqual(packAmbientCandidates({ location: '忘川河畔', worldview: 'modern', packs: ['myth'] }), []);
    const voices = createPackVoices({});
    for (const kind of pack.ambient.kinds) assert.equal(typeof voices[kind], 'function', kind);
    for (const kind of Object.keys(pack.ambience.html)) assert.ok(pack.ambience.html[kind], kind);
});

test('gate:myth-subdue four variants use four distinct sounds', () => {
    const { env } = makeEnv(true);
    const seen = new Set();
    for (const mode of ['talisman', 'bowl', 'gourd', 'chain']) {
        const built = MYTH_BUILDERS.subdue({ type: 'subdue', mode, who: '甲' }, env);
        assert.equal(built.sounds.length, 1);
        assert.ok(FX_PACK_SFX_DEFS[built.sounds[0]], mode);
        seen.add(built.sounds[0]);
    }
    assert.equal(seen.size, 4);
});
