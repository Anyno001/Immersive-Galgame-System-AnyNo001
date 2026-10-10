import test from 'node:test';
import assert from 'node:assert/strict';
import { COURTESY_FX_KINDS, dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { resolveDateAmbience, DATE_AMBIENCE_HTML } from '../src/scene/date-ambience.js';
import { resolvePlaceAmbience } from '../src/scene/place-ambience.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';

test('gate:courtesy-fx building blocks parse with lenient fields', () => {
    assert.deepEqual(parseDailyFxBody('stance', ['跪拜', '小红']), ['stance', 'kneel', '小红']);
    assert.equal(parseDailyFxBody('stance', ['乱写']), null);
    assert.deepEqual(parseDailyFxBody('candle', []), ['candle', 'candle', '']);
    assert.deepEqual(parseDailyFxBody('candle', ['宫灯', '皇后']), ['candle', 'lamp', '皇后']);
    assert.equal(parseDailyFxBody('pass', []), null);
    assert.deepEqual(dailyFxOf(['pass', '茶盏', '她']), { type: 'pass', item: '茶盏', who: '她' });
    assert.equal(parseDailyFxBody('opendoor', []), null);
    for (const kind of COURTESY_FX_KINDS) assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), kind);
});

test('gate:courtesy-fx palace ambience is ancient-only and cloudsea/cave/inn stay out of modern', () => {
    assert.deepEqual(resolveDateAmbience('养心殿寝宫', { worldview: 'ancient' }), { kind: 'palace', variant: '' });
    assert.equal(resolveDateAmbience('龙榻帐中', { worldview: 'ancient' }).variant, 'curtain');
    assert.equal(resolveDateAmbience('寝宫', { worldview: 'modern' }), null);
    assert.ok(DATE_AMBIENCE_HTML.palace.includes('igs-dfx-amb-lamps'));
    assert.equal(resolvePlaceAmbience('客栈大堂', { worldview: 'ancient' }).kind, 'inn');
    assert.equal(resolvePlaceAmbience('洞府', { worldview: 'ancient' }).kind, 'cave');
    assert.equal(resolvePlaceAmbience('客栈', { worldview: 'modern' }), null);
});
