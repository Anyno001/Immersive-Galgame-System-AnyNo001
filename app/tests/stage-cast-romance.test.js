import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCastMembers } from '../src/scene/stage-cast.js';
import { castRomanceAttr, isCastCollapsed, layoutCastSlots, resolveCastRomanceMode, resolveCastRomanceTarget } from '../src/visual/igs-ui/stage-cast-render.js';
import { resolveRomanceRivalTarget } from '../src/visual/igs-ui/romance-settings.js';

const snap = ({ romance = 'ambiguous', target = '', duo = true, nsfw = false, cast = ['乙'], speaker = '甲' } = {}) => ({
    mode: 'pc',
    content: {
        textType: 'dialogue',
        sceneNsfw: nsfw,
        spriteCharacter: speaker,
        castSprites: cast.map((character) => ({ character })),
        fx: { romance, romanceAt: romance ? 0 : -1, romanceTarget: target },
    },
    readerSettings: { romanceFx: { enabled: true }, stageCast: { enabled: true, romanceDuo: duo } },
});

test('gate: cast romance mode by level and rival', () => {
    assert.equal(resolveCastRomanceMode(snap({ romance: '' })), 'none');
    assert.equal(resolveCastRomanceMode(snap({ duo: false })), 'collapse');
    assert.equal(isCastCollapsed(snap({ duo: false })), true);
    assert.equal(resolveCastRomanceMode(snap()), 'recede');
    assert.equal(isCastCollapsed(snap()), false);
    assert.equal(resolveCastRomanceMode(snap({ romance: 'intimate' })), 'collapse');
    assert.equal(resolveCastRomanceMode(snap({ target: '乙' })), 'rival');
    assert.equal(resolveCastRomanceMode(snap({ romance: 'intimate', target: '乙' })), 'rival');
    assert.equal(resolveCastRomanceTarget(snap({ target: '乙' })), '乙');
    assert.equal(resolveCastRomanceMode(snap({ target: '甲' })), 'recede');
    assert.equal(resolveCastRomanceMode(snap({ target: '丙' })), 'recede');
    assert.equal(resolveCastRomanceTarget(snap({ target: '丙' })), '');
    assert.equal(resolveCastRomanceMode(snap({ nsfw: true, target: '乙' })), 'collapse');
    assert.equal(isCastCollapsed(snap({ nsfw: true })), true);
});

test('gate: cast romance attr degrades to dim-only on narrow modes', () => {
    assert.equal(castRomanceAttr('pc', 'recede'), 'recede');
    assert.equal(castRomanceAttr('mobile', 'recede'), 'recede-lite');
    assert.equal(castRomanceAttr('embedded', 'recede'), 'recede-lite');
    assert.equal(castRomanceAttr('pc', 'rival'), 'rival');
    assert.equal(castRomanceAttr('pc', 'collapse'), '');
    assert.equal(castRomanceAttr('pc', 'none'), '');
});

test('gate: cast layout pins romance target', () => {
    const members = [{ character: '丙', order: 2 }, { character: '乙', order: 1 }];
    const base = { members, speakerOrder: 0, hasSpeaker: true, capacity: 2 };
    assert.deepEqual(layoutCastSlots(base).members.map((m) => m.character), ['丙']);
    assert.deepEqual(layoutCastSlots({ ...base, pin: '乙' }).members.map((m) => [m.character, m.posX]), [['乙', 82]]);
    assert.deepEqual(layoutCastSlots({ ...base, pin: '丁' }).members.map((m) => m.character), ['丙']);
    const wide = layoutCastSlots({ ...base, capacity: 3, pin: '乙' });
    assert.deepEqual(wide.members.map((m) => m.character), ['乙', '丙']);
});

test('gate: cast picker pins romance target before capping', () => {
    const cast = [{ character: '丁', order: 3 }, { character: '丙', order: 2 }, { character: '乙', order: 1 }, { character: '甲', order: 0 }];
    const resolve = (m) => ({ character: m.character, image: `${m.character}.png` });
    assert.deepEqual(pickCastMembers(cast, { speakerKey: '丁', seats: 1, resolve }).members.map((m) => m.character), ['丙']);
    const pinned = pickCastMembers(cast, { speakerKey: '丁', seats: 1, resolve, pin: '甲' });
    assert.deepEqual(pinned.members.map((m) => [m.character, m.order]), [['甲', 0]]);
    assert.equal(pinned.speakerOrder, 3);
    assert.deepEqual(pickCastMembers(cast, { speakerKey: '丁', seats: 1, resolve, pin: '丁' }).members.map((m) => m.character), ['丙']);
});

test('gate: romance rival target reads target column only', () => {
    const alias = (name) => (name === '雪乃' ? '雪之下雪乃' : name);
    assert.equal(resolveRomanceRivalTarget({ romance: 'ambiguous', romanceAt: 5, romanceTarget: '雪乃' }, '甲', alias), '雪之下雪乃');
    assert.equal(resolveRomanceRivalTarget({ romance: 'ambiguous', romanceAt: 5, romanceTarget: '雪乃' }, '雪之下雪乃', alias), '');
    assert.equal(resolveRomanceRivalTarget({ romance: 'ambiguous', romanceAt: 5, romanceTarget: '' }, '甲', alias), '');
    assert.equal(resolveRomanceRivalTarget({ romance: 'ambiguous', romanceAt: -1, romanceTarget: '乙' }, '甲'), '');
    assert.equal(resolveRomanceRivalTarget({ romance: '', romanceAt: 5, romanceTarget: '乙' }, '甲'), '');
    assert.equal(resolveRomanceRivalTarget({ romance: 'intimate', romanceAt: 0, romanceTarget: '乙' }, ''), '');
});
