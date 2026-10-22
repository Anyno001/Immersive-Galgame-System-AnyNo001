import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK } from '../src/visual/igs-ui/fx-pack-nsfw.js';
import { NSFW_KINDS, nsfwFxOf, parseNsfwBody, traitPartsOf } from '../src/visual/igs-ui/fx-nsfw-model.js';
import { NSFW_BUILDERS, traitPlacements } from '../src/visual/igs-ui/fx-nsfw-build.js';
import { NSFW_SFX_DEFS } from '../src/visual/igs-ui/fx-nsfw-sfx.js';
import { buildPackRegistry, validatePacks, normalizePack } from '../src/scene/fx-packs.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { normalizeRomanceFxSettings } from '../src/visual/igs-ui/romance-settings.js';
import { resolveCgPace, syncCgPan, cancelCgPan } from '../src/visual/igs-ui/romance-cg-pan.js';
import { planBreathTypewriter, breathPauseAfter } from '../src/visual/igs-ui/typewriter-breath.js';
import { getVoiceFilter, setVoiceFilter, resetVoiceFilterForTest, voiceFilterGain, insertVoiceFilter } from '../src/visual/igs-ui/voice-filter.js';
import { buildBarkChain } from '../src/visual/igs-ui/voice-bark.js';
import { resolveHeatTier, resolveScatter, resolveIntimatePlan } from '../src/visual/igs-ui/romance-intimate-runtime.js';
import { makeStage } from './helpers/fake-dom.js';


test('gate:nsfw-fx-default-off every kind is registered, labelled, triggered and off by default', () => {
    const pack = normalizePack(PACK);
    assert.deepEqual(validatePacks([pack]), []);
    const registry = buildPackRegistry([PACK]);
    assert.equal(registry.kinds.length, NSFW_KINDS.length);
    assert.equal(PACK.requires, 'romanceFx');
    assert.equal(PACK.allowNsfw, true);
    for (const kind of NSFW_KINDS) {
        assert.ok(PACK.labels[kind], kind);
        assert.ok(PACK.triggers[kind].length >= 2 && PACK.triggers[kind].length <= 4, kind);
        assert.ok(PACK.promptLines[kind].startsWith(`[igs-fx:${kind}`), kind);
        assert.equal(typeof PACK.builders[kind], 'function', kind);
    }
    const daily = normalizeDailyFxSettings({ enabled: true });
    for (const kind of NSFW_KINDS) assert.equal(daily[kind], false, kind);
    assert.equal(daily.packNsfw, false);
    const romance = normalizeRomanceFxSettings({ enabled: true });
    for (const key of ['cgCut', 'earVoice', 'breathText', 'scatterIcons', 'heatTiers', 'aftermath']) assert.equal(romance[key], false, key);
    assert.equal(romance.cgPace, 'off');
});

test('gate:nsfw-fx builders return nodes and use existing sfx names', () => {
    const root = makeStage({ waapi: true });
    const env = { root, doc: root.ownerDocument, reduced: true, hold: 1, speaker: 'A', ancient: false };
    const items = [
        { type: 'peak', tier: 3 }, { type: 'counter', count: 3, unit: '次' }, { type: 'aftermath', text: '' }, { type: 'bedcurtain', text: '' },
        { type: 'dualcult', from: 'A', to: 'B', delta: 12 }, { type: 'favortip', who: 'A', delta: 5, total: 60 }, { type: 'sigil', who: 'A', tier: 2 },
        { type: 'footfall', dir: 'near' }, { type: 'knotafter', target: '', text: '' }, { type: 'conceive', bpm: 150, text: '' }, { type: 'traits', who: 'A', parts: ['ear', 'tail'], color: '' },
    ];
    assert.equal(items.length, NSFW_KINDS.length);
    for (const item of items) {
        const built = NSFW_BUILDERS[item.type](item, env);
        assert.ok(built && built.node, item.type);
        assert.ok(built.life > 0, item.type);
        for (const name of built.sounds) assert.ok(NSFW_SFX_DEFS[name], name);
    }
});

test('gate:nsfw-fx parse fields', () => {
    assert.deepEqual(parseNsfwBody('peak', ['3', '啊']), ['peak', 3, '啊']);
    assert.deepEqual(parseNsfwBody('peak', []), ['peak', 2, '']);
    assert.equal(parseNsfwBody('counter', ['很多']), null);
    assert.deepEqual(nsfwFxOf(parseNsfwBody('counter', ['4'])), { type: 'counter', count: 4, unit: '次' });
    assert.deepEqual(parseNsfwBody('dualcult', ['甲', '乙', '+20']), ['dualcult', '甲', '乙', 20]);
    assert.equal(parseNsfwBody('dualcult', ['甲', '乙']), null);
    assert.deepEqual(parseNsfwBody('favortip', ['林晚', '+5', '60']), ['favortip', '林晚', 5, 60]);
    assert.equal(parseNsfwBody('favortip', ['林晚']), null);
    assert.deepEqual(parseNsfwBody('footfall', ['远去']), ['footfall', 'leave']);
    assert.deepEqual(parseNsfwBody('footfall', []), ['footfall', 'near']);
    assert.deepEqual(parseNsfwBody('conceive', ['150']), ['conceive', 150, '']);
    assert.deepEqual(traitPartsOf('狐耳、尾巴，角'), ['ear', 'tail', 'horn']);
    assert.equal(parseNsfwBody('traits', ['A', '无']), null);
    assert.deepEqual(nsfwFxOf(parseNsfwBody('traits', ['A', '耳,尾', '#ffaa00'])), { type: 'traits', who: 'A', parts: ['ear', 'tail'], color: '#ffaa00' });
});

test('gate:nsfw-fx peak reduced shows only the word, full adds flash and pulse', () => {
    const root = makeStage({ waapi: true });
    const env = { root, doc: root.ownerDocument, reduced: true, hold: 1, speaker: '' };
    const still = NSFW_BUILDERS.peak({ type: 'peak', tier: 3, word: '啊' }, env);
    assert.ok(still.node.innerHTML.includes('igs-nfx-word'));
    assert.ok(!still.node.innerHTML.includes('igs-nfx-flash'));
    assert.ok(!still.node.innerHTML.includes('igs-nfx-pulse'));
    const full = NSFW_BUILDERS.peak({ type: 'peak', tier: 3, word: '啊' }, { ...env, reduced: false, hold: 2 });
    assert.ok(full.node.innerHTML.includes('igs-nfx-flash'));
    assert.ok(full.node.innerHTML.includes('igs-nfx-pulse'));
    assert.equal(full.life, 8800);
    const motion = root.querySelector('#igs-stage-motion');
    assert.ok(motion.animations && motion.animations.length >= 1);
});

test('gate:nsfw-fx traits are placed from the head anchor and never use canvas or url masks', () => {
    const placed = traitPlacements({ x: 30, y: 25, d: 14 }, 1.78, ['ear', 'tail', 'horn', 'scale']);
    assert.equal(placed.filter((p) => p.part === 'ear').length, 2);
    assert.ok(placed.every((p) => p.x >= 2 && p.x <= 98 && p.y >= 2 && p.y <= 98));
    const tail = placed.find((p) => p.part === 'tail');
    assert.ok(tail.x < 30);
});

test('gate:nsfw-fx cg pace scales the pan duration and cut-in only fires on a swapped image', () => {
    assert.equal(resolveCgPace({ pace: 'off' }), '');
    assert.equal(resolveCgPace({ pace: 'fast' }), 'fast');
    assert.equal(resolveCgPace({ pace: 'auto', phase: 'climax' }), 'fast');
    assert.equal(resolveCgPace({ pace: 'auto', phase: 'rise' }), 'slow');
    assert.equal(resolveCgPace({ pace: 'auto', phase: 'steady', textLength: 12 }), 'fast');
    const root = makeStage({ waapi: true });
    const stage = root.querySelector('#igs-stage-motion');
    stage.hasAttribute = (name) => stage.attrs.has(name);
    const bg = root.ownerDocument.createElement('div');
    bg.id = 'igs-bg';
    stage.appendChild(bg);
    syncCgPan(stage, { url: 'a.png', shot: 'push', pace: 'medium' });
    assert.equal(stage.style.vars['--igs-cgp-dur'], '16s');
    syncCgPan(stage, { url: 'a.png', shot: 'push', pace: 'fast' });
    assert.equal(stage.style.vars['--igs-cgp-dur'], '8.8s');
    assert.equal(bg.animations, undefined);
    syncCgPan(stage, { url: 'b.png', shot: 'push', pace: 'fast', cut: true });
    assert.equal(bg.animations.length, 1);
    cancelCgPan(stage);
});

test('gate:nsfw-fx breath typewriter is opt-in, leaves the base typewriter untouched and skips reduced', () => {
    assert.equal(planBreathTypewriter({ enabled: false, level: 3 }), null);
    assert.equal(planBreathTypewriter({ enabled: true, level: 1 }), null);
    assert.equal(planBreathTypewriter({ enabled: true, level: 3, reduced: true }), null);
    assert.deepEqual(planBreathTypewriter({ enabled: true, level: 3, phase: 'climax', speed: 'fast' }), { speed: 'fast', punctuationPause: true, pauseScale: 1.35 });
    assert.ok(breathPauseAfter('，', 28) > 0);
    assert.equal(breathPauseAfter('字', 28), 0);
});

test('gate:nsfw-fx voice filter modes and bark chain', () => {
    resetVoiceFilterForTest();
    assert.equal(getVoiceFilter(), 'none');
    assert.equal(setVoiceFilter('ear', 'a'), 'ear');
    assert.equal(setVoiceFilter('muffled', 'b'), 'muffled');
    assert.equal(setVoiceFilter('none', 'b'), 'ear');
    assert.equal(setVoiceFilter('bogus', 'a'), 'none');
    assert.equal(voiceFilterGain('none'), 1);
    assert.ok(voiceFilterGain('muffled') < voiceFilterGain('ear'));
    const made = [];
    const context = {
        createGain: () => ({ gain: { value: 0 }, connect() {} }),
        createBiquadFilter: () => { const f = { type: '', frequency: { value: 0 }, Q: { value: 0 }, gain: { value: 0 }, connect() {} }; made.push(f); return f; },
        createStereoPanner: () => ({ pan: { value: 0 }, connect() {} }),
    };
    setVoiceFilter('muffled', 'x');
    const gain = buildBarkChain(context, { connect() {} }, { volume: 1, pan: 0, phone: false }, []);
    assert.ok(Math.abs(gain.gain.value - 0.6) < 1e-9);
    assert.equal(made.at(-1).frequency.value, 650);
    setVoiceFilter('none', 'x');
    made.length = 0;
    buildBarkChain(context, { connect() {} }, { volume: 1, pan: 0, phone: false }, []);
    assert.equal(made.length, 0);
    assert.equal(insertVoiceFilter(context, () => {}, 'none'), false);
    resetVoiceFilterForTest();
});

test('gate:aftermath-opt-in heat tiers, scatter icons and aftermath layer are opt-in plan fields', () => {
    assert.equal(resolveHeatTier({ level: 0 }), 0);
    assert.equal(resolveHeatTier({ level: 2 }), 2);
    assert.equal(resolveHeatTier({ level: 3, phase: 'rise', span: { index: 0, length: 9 } }), 1);
    assert.equal(resolveHeatTier({ level: 3, phase: 'steady', span: { index: 4, length: 9 } }), 2);
    assert.equal(resolveHeatTier({ level: 3, phase: 'steady', span: { index: 8, length: 9 } }), 3);
    assert.equal(resolveHeatTier({ level: 3, phase: 'after', span: { index: 8, length: 9 } }), 2);
    assert.deepEqual(resolveScatter(2), ['coat', 'top']);
    assert.deepEqual(resolveScatter(0, ['socks', 'nope']), ['socks']);
    const off = resolveIntimatePlan({ level: 3, phase: 'after', settings: normalizeRomanceFxSettings({ enabled: true }), sound: { enabled: false } });
    assert.ok(!off || (!off.heat && !off.afterglow && !off.scatter));
    const on = resolveIntimatePlan({ level: 3, phase: 'after', settings: normalizeRomanceFxSettings({ enabled: true, heatTiers: true, aftermath: true, scatterIcons: true }), sound: { enabled: false }, span: { index: 2, length: 3 } });
    assert.equal(on.heat, 2);
    assert.equal(on.afterglow, true);
    assert.equal(on.scatter, true);
});

test('gate:nsfw-fx counter tally, favortip anchor, aftermath and conceive glow', () => {
    const root = makeStage({ waapi: true });
    const env = { root, doc: root.ownerDocument, reduced: false, hold: 1, speaker: 'A', ancient: false };
    NSFW_BUILDERS.counter({ type: 'counter', count: 2, unit: '次' }, env);
    const next = NSFW_BUILDERS.counter({ type: 'counter', count: 7, unit: '次' }, env);
    assert.ok(next.node.innerHTML.includes('igs-nfx-tally'));
    assert.ok(next.node.innerHTML.includes('is-slash'));
    assert.ok(next.node.innerHTML.includes('is-new'));
    const still = NSFW_BUILDERS.counter({ type: 'counter', count: 7, unit: '次' }, { ...env, reduced: true });
    assert.ok(!still.node.innerHTML.includes('is-new'));
    const up = NSFW_BUILDERS.favortip({ type: 'favortip', who: 'A', delta: 5, total: 60 }, env);
    const down = NSFW_BUILDERS.favortip({ type: 'favortip', who: 'A', delta: -3, total: 40 }, env);
    assert.deepEqual([up.sounds, down.sounds], [['nsfw-tip'], ['nsfw-tip-down']]);
    assert.ok(NSFW_SFX_DEFS['nsfw-tip-down']);
    assert.ok(up.node.innerHTML.includes('igs-nfx-tip-title'));
    const after = NSFW_BUILDERS.aftermath({ type: 'aftermath', text: '' }, env);
    for (const cls of ['igs-nfx-sweat', 'igs-nfx-sheet', 'igs-nfx-after-time']) assert.ok(after.node.innerHTML.includes(cls), cls);
    const fetal = NSFW_BUILDERS.conceive({ type: 'conceive', bpm: 150, text: '' }, env);
    assert.ok(fetal.node.innerHTML.includes('igs-nfx-fetal-glow'));
});
