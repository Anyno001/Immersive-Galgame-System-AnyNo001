import test from 'node:test';
import assert from 'node:assert/strict';
import {
    UI_SFX_FAMILIES,
    UI_SFX_KINDS,
    UI_SOUND_DEFAULTS,
    normalizeUiSoundSettings,
    playUiSfx,
    resolveUiSfxFamily,
} from '../src/visual/igs-ui/ui-sfx.js';

const ON = { uiSound: { enabled: true, volume: 0.5 } };
function recorder() {
    const jobs = [];
    return { jobs, audioScheduler: (job) => { jobs.push(job); return { stop() {} }; } };
}

test('gate: ui sound defaults off and clamps volume', () => {
    assert.deepEqual(normalizeUiSoundSettings(undefined), { enabled: false, volume: 0.4 });
    assert.deepEqual(UI_SOUND_DEFAULTS, { enabled: false, volume: 0.4 });
    assert.deepEqual(normalizeUiSoundSettings({ enabled: true, volume: 3 }), { enabled: true, volume: 1 });
    assert.equal(normalizeUiSoundSettings({ enabled: 'yes', volume: 'x' }).enabled, false);
    assert.equal(normalizeUiSoundSettings({ volume: null }).volume, 0.4);
});

test('gate: every dialog skin maps to a ui sound family', () => {
    const expected = {
        'retro-japanese': 'wood', 'adventure-journey': 'wood',
        'black-white-manga': 'paper', 'warm-picturebook': 'paper', 'plant-coffee': 'paper', 'western-classic': 'paper',
        'cute-pink': 'soft', 'day-minimal': 'soft',
        'elegant-european': 'glass', 'gradient-veil': 'glass', default: 'glass',
    };
    for (const [skin, family] of Object.entries(expected)) assert.equal(resolveUiSfxFamily(skin), family, skin);
    assert.equal(resolveUiSfxFamily(undefined), 'glass');
    assert.equal(resolveUiSfxFamily('unknown-skin'), 'glass');
});

test('gate: every ui family defines all kinds with short, bounded partials', () => {
    for (const [family, table] of Object.entries(UI_SFX_FAMILIES)) {
        assert.deepEqual(Object.keys(table).sort(), [...UI_SFX_KINDS].sort(), family);
        for (const [kind, partials] of Object.entries(table)) {
            assert.ok(partials.length > 0, `${family}.${kind}`);
            const end = Math.max(...partials.map((q) => q.start + q.duration));
            assert.ok(end <= 0.35, `${family}.${kind} lasts ${end}s`);
            for (const q of partials) assert.ok(q.gain > 0 && q.gain <= 1 && q.from > 0 && q.to > 0, `${family}.${kind}`);
        }
    }
});

test('gate: ui sfx plays the skin family and stays silent when off, muted or unknown', () => {
    const rec = recorder();
    playUiSfx('page', { ...ON, dialogSkin: 'retro-japanese' }, { audioScheduler: rec.audioScheduler, now: 0 });
    assert.equal(rec.jobs[0].family, 'wood');
    assert.equal(rec.jobs[0].partials, UI_SFX_FAMILIES.wood.page);
    assert.equal(rec.jobs[0].volume, 0.5);
    assert.equal(playUiSfx('page', { dialogSkin: 'cute-pink' }, { audioScheduler: rec.audioScheduler }), null);
    assert.equal(playUiSfx('page', { uiSound: { enabled: true, volume: 0 } }, { audioScheduler: rec.audioScheduler }), null);
    assert.equal(playUiSfx('explode', ON, { audioScheduler: rec.audioScheduler }), null);
    assert.equal(playUiSfx('page', null, { audioScheduler: rec.audioScheduler }), null);
    assert.equal(rec.jobs.length, 1);
});

test('gate: ui hover sounds are rate limited', () => {
    const rec = recorder();
    const base = 1_000_000;
    playUiSfx('hover', ON, { audioScheduler: rec.audioScheduler, now: base });
    playUiSfx('hover', ON, { audioScheduler: rec.audioScheduler, now: base + 30 });
    playUiSfx('hover', ON, { audioScheduler: rec.audioScheduler, now: base + 90 });
    playUiSfx('confirm', ON, { audioScheduler: rec.audioScheduler, now: base + 91 });
    assert.deepEqual(rec.jobs.map((job) => job.kind), ['hover', 'hover', 'confirm']);
});
