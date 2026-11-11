import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { favorFromMoodGroup, resolveFavorWord } from '../src/scene/stats/stat-vocab.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createEngine, keyEventSkill } from '../src/scene/stats/stat-engine.js';
import { DEFAULT_STAGE_TEXT_PLATONIC, DEFAULT_STAT_PROMPTS, buildStatsPrompt, intimacyAllowed } from '../src/scene/stats/stat-prompt.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';

const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, favorTier: 'normal', strengthRev: 2, ...opts });
const withDims = (dims, extra = {}) => ({ ...createStatsState(), characters: { 小雪: { ...createCharacter(1, { nsfw: true }), dims: { ...createCharacter(1, { nsfw: true }).dims, ...dims }, ...extra } } });
const dim = (state, key) => state.characters.小雪.dims[key];
const diag = (r, code) => r.meta.diagnostics.some((d) => d.code === code);
function lcg(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

test('2.3 芥蒂每天 -1 止于 25：跳跃按天数一次算完，note 淡忘合成一条，旧楼不消退', () => {
    const r = floor(withDims({ 芥蒂: 40 }), '[igs-stat:skip|5天]');
    assert.equal(dim(r.state, '芥蒂'), 35);
    const rows = r.changes.filter((c) => c.key === '芥蒂');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].note, '淡忘');
    assert.equal(dim(floor(withDims({ 芥蒂: 40 }), '[igs-stat:skip|30天]').state, '芥蒂'), 25);
    assert.equal(dim(floor(withDims({ 芥蒂: 20 }), '[igs-stat:skip|30天]').state, '芥蒂'), 20);
    assert.equal(dim(floor(withDims({ 芥蒂: 40 }), '[igs-stat:skip|5天]', { strengthRev: 1 }).state, '芥蒂'), 40);
});

test('6 跳一年：新楼不截断、冷却与芥蒂消退一次算完；旧楼仍截 30 天', () => {
    const state = withDims({ 好感: 40, 芥蒂: 60 }, { lastSeenDay: 1 });
    const r = floor(state, '[igs-stat:skip|1年]');
    assert.equal(r.state.clock.day, 366);
    assert.equal(r.meta.flags.skipCapped, undefined);
    assert.equal(dim(r.state, '好感'), 26);
    assert.equal(dim(r.state, '芥蒂'), 25);
    const old = floor(state, '[igs-stat:skip|1年]', { strengthRev: 1 });
    assert.equal(old.state.clock.day, 31);
    assert.equal(old.meta.flags.skipCapped, true);
});

test('持久化：aptitude、traits、heroNotes、romanceSeen 经 sanitize 与键值往返保持', () => {
    const catalog = sanitizeCatalog({
        aptitude: { 主角: '天纵', 小雪: '平庸', 阿福: '出众' },
        traits: { 老爷爷: { companion: true, bodiless: true }, 小雪: { kin: true, x: true }, 空: {} },
        heroNotes: { 小雪: 'x'.repeat(60), 空: '  ' },
        romanceSeen: ['小雪', '小雪', 3],
    });
    assert.deepEqual(catalog.aptitude, { 主角: { v: '天纵', src: 'manual' }, 阿福: { v: '出众', src: 'manual' } });
    const on = { on: true, src: 'manual' };
    assert.deepEqual(catalog.traits, { 老爷爷: { companion: on, bodiless: on }, 小雪: { kin: on } });
    assert.equal(catalog.heroNotes.小雪.length, 40);
    assert.deepEqual(catalog.romanceSeen, ['小雪']);
    const back = restoreChat(chatEntries({ catalog })).catalog;
    assert.deepEqual(back.aptitude, catalog.aptitude);
    assert.deepEqual(back.traits, catalog.traits);
    assert.deepEqual(back.heroNotes, catalog.heroNotes);
    assert.deepEqual(back.romanceSeen, catalog.romanceSeen);
});

