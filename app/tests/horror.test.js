import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHorrorPromptRule, findLastDreadLevel, horrorSkinForStyle, normalizeHorrorGore, normalizeHorrorStyle } from '../src/scene/horror.js';
import { applyFxWorldview, resolveWorldviewPromptRule } from '../src/scene/fx-era.js';
import { isReadyWorldview } from '../src/scene/worldview.js';
import { isMarkerDirectiveLine, stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { effectiveSceneAssets } from '../src/scene/asset-scope.js';
import { applyHorrorDread, resolveHorrorDread } from '../src/visual/igs-ui/horror-dread.js';
import { renderWorldviewRow } from '../src/visual/igs-ui/worldview-fields.js';

test('gate:horror:worldview-ready-and-filters-light-fx', () => {
    assert.equal(isReadyWorldview('horror'), true);
    const out = applyFxWorldview({ dailyFx: { fireworks: true, photo: true }, liveFx: { enabled: true } }, 'horror');
    assert.equal(out.dailyFx.fireworks, false);
    assert.equal(out.dailyFx.photo, true, '手机照片保留');
    assert.equal(out.liveFx.enabled, true, '直播保留');
});

test('gate:horror:prompt-rule-follows-style-and-gore-level', () => {
    const gore = resolveWorldviewPromptRule('horror', { horrorStyle: 'gore', horrorGore: 1 });
    assert.match(gore, /血腥恐怖/);
    assert.match(gore, /暗示/);
    assert.match(gore, /\[igs-dread:N\]/);
    const psych = buildHorrorPromptRule({ horrorStyle: 'psych', horrorGore: 3 });
    assert.match(psych, /心理恐怖/);
    assert.doesNotMatch(psych, /重口/, '纯心理恐怖不写血腥尺度');
    assert.equal(resolveWorldviewPromptRule('modern', {}), '');
    assert.equal(normalizeHorrorStyle('bogus'), 'mixed');
    assert.equal(normalizeHorrorGore('9'), 2);
    assert.equal(horrorSkinForStyle('psych'), 'horror-psych');
    assert.equal(horrorSkinForStyle('mixed'), 'horror-gore');
});

test('gate:horror:dread-tag-is-a-hidden-marker-and-latest-before-offset-wins', () => {
    const raw = '平静的午后。\n[igs-dread:1]\n门外有声音。\n[igs-dread:3]\n它进来了。';
    assert.equal(findLastDreadLevel(raw), 3);
    assert.equal(findLastDreadLevel(raw, raw.indexOf('门外')), 1);
    assert.equal(findLastDreadLevel(raw, 2), null);
    assert.equal(findLastDreadLevel('没有标签'), null);
    assert.equal(isMarkerDirectiveLine('[igs-dread:2]'), true);
    assert.equal(stripMarkerDirectives('她回头[igs-dread:2]了。'), '她回头了。');
});

test('gate:horror:style-and-gore-follow-card-scope', () => {
    const merged = effectiveSceneAssets({ worldview: 'modern', cards: { 'card:a': { worldview: 'horror', horrorStyle: 'psych' } } }, 'card:a');
    assert.equal(merged.worldview, 'horror');
    assert.equal(merged.horrorStyle, 'psych');
});

test('gate:horror:dread-level-capped-and-defaults-to-one', () => {
    assert.equal(resolveHorrorDread(null, 3), 1);
    assert.equal(resolveHorrorDread(3, 2), 2);
    assert.equal(resolveHorrorDread(0, 3), 0);
    const attrs = {};
    const root = { getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; } };
    applyHorrorDread(root, { level: 3, cap: 3 });
    assert.equal(attrs['data-igs-dread'], '3');
});

test('gate:horror:settings-row-shows-sub-options-only-for-horror', () => {
    assert.doesNotMatch(renderWorldviewRow({ worldview: 'magic' }), /data-horror-select/);
    const row = renderWorldviewRow({ worldview: 'horror', horrorStyle: 'gore' });
    assert.match(row, /data-horror-select="style"/);
    assert.match(row, /data-horror-select="gore"/);
    assert.doesNotMatch(renderWorldviewRow({ worldview: 'horror', horrorStyle: 'psych' }), /data-horror-select="gore"/);
});

test('gate:horror:typewriter-specialization-only-for-horror-and-escalates', async () => {
    const { resolveHorrorTypewriterLevel, shapeHorrorNotes, horrorTypewriterTier } = await import('../src/visual/igs-ui/typewriter-horror.js');
    assert.equal(resolveHorrorTypewriterLevel({ _worldview: 'modern', dialogSkin: 'default' }, 2), null, '非恐怖不特化');
    assert.equal(resolveHorrorTypewriterLevel({ _worldview: 'horror' }, 2), 2);
    assert.equal(resolveHorrorTypewriterLevel({ dialogSkin: 'horror-psych' }, 0), 0);
    assert.ok(horrorTypewriterTier(3).cutoff < horrorTypewriterTier(0).cutoff);
    const notes = Array.from({ length: 30 }, (_, i) => ({ timeMs: i * 90, pitch: 1, gain: 1, hold: 1, glide: 0, jitter: 0.04 }));
    assert.equal(shapeHorrorNotes(notes, null), notes);
    const calm = shapeHorrorNotes(notes, 0);
    assert.equal(calm.length, 30, '0 档不吞字');
    const burst = shapeHorrorNotes(notes, 3);
    assert.ok(burst.every((note) => note.pitch < 1));
    assert.equal(burst[0].timeMs, 0, '首个音符必响');
});
