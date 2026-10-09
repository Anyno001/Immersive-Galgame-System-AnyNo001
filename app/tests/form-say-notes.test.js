import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDailyFxBody, dailyFxOf } from '../src/scene/daily-fx-directives.js';
import { normalizeCharacterOutfits } from '../src/scene/character-outfits.js';
import { expressionPaintDna } from '../src/generated-images/dbgen-prompt.js';
import { fillExpressionNotes } from '../src/storage/expression-notes-file.js';
import { characterDnaGender, setActiveFormGenders } from '../src/visual/igs-ui/voice-bark.js';

test('gate:daily-say:who-and-text', () => {
    assert.deepEqual(dailyFxOf(parseDailyFxBody('say', ['小雪', '才不是呢'])), { type: 'say', who: '小雪', text: '才不是呢' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('say', ['嗯哼'])), { type: 'say', who: '', text: '嗯哼' });
    assert.equal(parseDailyFxBody('say', []), null);
});

test('gate:outfit-form:normalize-keeps-gender', () => {
    const out = normalizeCharacterOutfits({ 阿明: { 女体: { words: [], form: { gender: 'female' } }, 校服: { words: [] } } });
    assert.deepEqual(out.阿明.女体.form, { gender: 'female' });
    assert.equal(out.阿明.校服.form, undefined);
});

test('gate:outfit-form:paint-dna-replaces-body-tags', () => {
    const dna = { triggerWords: '1boy, ming_tag, adult', identity: 'male student', defaultAppearance: 'black hair' };
    const painted = expressionPaintDna(dna, { name: '女体', form: { gender: 'female' } });
    assert.equal(painted.identity, '');
    assert.equal(painted.defaultAppearance, '');
    assert.equal(painted.triggerWords, '1girl, ming_tag');
});

test('gate:outfit-form:active-gender-overrides-dna', () => {
    const assets = { characters: { 阿明: {} }, characterDna: { 阿明: { triggerWords: '1boy' } } };
    assert.equal(characterDnaGender(assets, '阿明'), 'male');
    setActiveFormGenders([['阿明', 'female']]);
    assert.equal(characterDnaGender(assets, '阿明'), 'female');
    setActiveFormGenders([]);
});

test('gate:expression-notes-file:fill-only-missing', () => {
    const notes = { 阿明: { 开心: { positive: 'mine' } } };
    const changed = fillExpressionNotes(notes, { 阿明: { 开心: { positive: 'file' }, 难过: { positive: 'f2' } }, 小雪: { 默认: { positive: 'f3' } } });
    assert.equal(changed, true);
    assert.equal(notes.阿明.开心.positive, 'mine');
    assert.equal(notes.阿明.难过.positive, 'f2');
    assert.equal(notes.小雪.默认.positive, 'f3');
});
