import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDateAmbience, DATE_AMBIENCE_HTML, DATE_AMBIENCE_KINDS, DATE_STILL_KINDS } from '../src/scene/date-ambience.js';

test('gate:date-ambience resolves cafe, aquarium, cinema, beach, nightview from location words', () => {
    assert.deepEqual(resolveDateAmbience('星光咖啡厅'), { kind: 'cafe', variant: '' });
    assert.deepEqual(resolveDateAmbience('街角的西餐厅'), { kind: 'cafe', variant: '' });
    assert.deepEqual(resolveDateAmbience('海洋馆水母展区'), { kind: 'aquarium', variant: '' });
    assert.deepEqual(resolveDateAmbience('市中心电影院'), { kind: 'cinema', variant: '' });
    assert.deepEqual(resolveDateAmbience('黄昏的海边'), { kind: 'beach', variant: '' });
    assert.deepEqual(resolveDateAmbience('大厦天台'), { kind: 'nightview', variant: '' });
});

test('gate:date-ambience returns null for non-date places and defers underwater/vehicles to place-ambience', () => {
    for (const place of ['教室', '卧室', '游轮', '海底', '海中', '地铁车厢', '摩天轮', '', null, undefined]) {
        assert.equal(resolveDateAmbience(place), null, String(place));
    }
});

test('gate:date-ambience resolution order prefers the more specific venue', () => {
    // 「海边餐厅」命中海边优先于餐厅；「水族馆的咖啡厅」命中水族馆优先于咖啡厅。
    assert.deepEqual(resolveDateAmbience('海边餐厅'), { kind: 'beach', variant: '' });
    assert.deepEqual(resolveDateAmbience('水族馆里的咖啡厅'), { kind: 'aquarium', variant: '' });
    // 「海底餐厅」在 place-ambience 的 false-friends 里被判 null，交到这里应落在 cafe（餐厅）。
    assert.deepEqual(resolveDateAmbience('海底餐厅'), { kind: 'cafe', variant: '' });
});

test('gate:date-ambience every kind has an HTML entry and still-kind listing', () => {
    for (const kind of DATE_AMBIENCE_KINDS) {
        assert.ok(DATE_AMBIENCE_HTML[kind], `missing HTML for ${kind}`);
        assert.ok(DATE_STILL_KINDS.includes(kind), `missing still-kind for ${kind}`);
    }
    assert.equal(Object.keys(DATE_AMBIENCE_HTML).length, DATE_AMBIENCE_KINDS.length);
});
