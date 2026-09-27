import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom, hashString } from '../src/visual/map-gen/seed-random.js';
import { classifyMapPlace, detectMapTheme, resolveMapScale } from '../src/visual/map-gen/place-semantics.js';
import { generateCityScene } from '../src/visual/map-gen/city.js';
import { nearestOnPolyline, pointInPolygon } from '../src/visual/map-gen/geometry.js';
import { renderCitySteps, renderLightSteps } from '../src/visual/map-gen/render-canvas.js';
import { buildMapGenInput, buildMarkerLightsInput, createMapBasemapGenerator } from '../src/visual/map-gen/index.js';
import { resolveMapHour, resolveMapLighting } from '../src/visual/map-gen/lighting.js';
import { mapBasemapFilter, mapLightLayersHtml } from '../src/visual/igs-ui/map-light-layers.js';

const W = 1600;
const H = 900;
const PRESETS = {
    campus: [
        { id: '1', name: '我家', x: 0.2, y: 0.7 }, { id: '2', name: '樱丘高中', x: 0.55, y: 0.3 }, { id: '3', name: '站前商店街', x: 0.4, y: 0.58 },
        { id: '4', name: '车站', x: 0.33, y: 0.42 }, { id: '5', name: '河边公园', x: 0.72, y: 0.66 }, { id: '6', name: '神社', x: 0.86, y: 0.2 },
    ],
    seaside: [
        { id: '1', name: '海滩', x: 0.5, y: 0.86 }, { id: '2', name: '渔港码头', x: 0.2, y: 0.8 }, { id: '3', name: '民宿', x: 0.4, y: 0.55 },
        { id: '4', name: '小镇学校', x: 0.62, y: 0.35 }, { id: '5', name: '山上神社', x: 0.2, y: 0.18 },
    ],
    lake: [{ id: '1', name: '湖', x: 0.7, y: 0.6 }, { id: '2', name: '公会', x: 0.3, y: 0.4 }],
};
const WATER_CATEGORIES = ['sea', 'lake', 'river'];

function isWet(scene, x, y) {
    if (scene.sea && pointInPolygon(x, y, scene.sea.polygon)) return true;
    if (scene.lakes.some(lake => pointInPolygon(x, y, lake.polygon))) return true;
    return scene.rivers.some(river => {
        const near = nearestOnPolyline(x, y, river.points);
        return near.distance < river.halfs[near.index];
    });
}

function fakeCanvas(width = 1, height = 1, calls = { count: 0 }) {
    const ctx = new Proxy({}, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (key === 'createPattern') return () => ({});
            return () => { calls.count++; };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    return { width, height, getContext: () => ctx, toDataURL: () => `data:image/png;base64,${width}x${height}` };
}

test('gate:map-gen:seeded-random-is-deterministic-and-forks-independent-streams', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    assert.deepEqual([a.next(), a.next(), a.int(1, 6)], [b.next(), b.next(), b.int(1, 6)]);
    assert.notEqual(createRandom(42).fork('roads').next(), createRandom(42).fork('water').next());
    assert.equal(createRandom(7).fork('x').next(), createRandom(7).fork('x').next());
    assert.equal(hashString('对话'), hashString('对话'));
    assert.notEqual(hashString('对话 A'), hashString('对话 B'));
});

test('gate:map-gen:place-semantics-classify-scale-and-theme', () => {
    assert.equal(classifyMapPlace('樱丘高中'), 'school');
    assert.equal(classifyMapPlace('图书馆'), 'public', 'longest word beats the generic 馆');
    assert.equal(classifyMapPlace('海边咖啡馆'), 'commercial');
    assert.equal(classifyMapPlace('山间小屋'), 'residential', 'head word at the end wins on equal length');
    assert.equal(classifyMapPlace('河边公园'), 'park');
    assert.equal(classifyMapPlace('某处', '一座古老的神社'), 'shrine', 'description is the fallback');
    assert.equal(classifyMapPlace('无名之地'), 'generic');
    assert.equal(resolveMapScale('我家', ['一楼', '二楼', '三楼']), 'interior');
    assert.equal(resolveMapScale('公寓', ['客厅', '卧室', '阳台']), 'interior');
    assert.equal(resolveMapScale('', ['车站', '学校', '公园']), 'city');
    assert.equal(detectMapTheme(['王城城堡', '冒险者公会', '骑士团']), 'fantasy');
    assert.equal(detectMapTheme(['车站', '学校']), 'modern');
});

test('gate:map-gen:city-scene-is-deterministic-plain-data', () => {
    const input = { seed: 123, width: W, height: H, points: PRESETS.campus };
    const a = generateCityScene(input);
    const b = generateCityScene(input);
    assert.deepEqual(a, b);
    assert.doesNotThrow(() => JSON.stringify(a));
    assert.notDeepEqual(generateCityScene({ ...input, seed: 124 }).buildings, a.buildings);
    assert.ok(a.buildings.length > 300 && a.streets.length > 50 && a.lights.length > 100);
});

test('gate:map-gen:pins-stay-dry-connected-and-clear-of-buildings', () => {
    for (const [name, points] of Object.entries(PRESETS)) {
        for (let seed = 1; seed <= 6; seed++) {
            const scene = generateCityScene({ seed, width: W, height: H, points });
            for (const point of points) {
                const x = point.x * W;
                const y = point.y * H;
                const category = classifyMapPlace(point.name);
                if (WATER_CATEGORIES.includes(category)) continue;
                assert.ok(!isWet(scene, x, y), `${name}#${seed} ${point.name} must not sit in water`);
                const road = Math.min(...scene.mainRoads.map(r => nearestOnPolyline(x, y, r.points).distance));
                assert.ok(road < 2, `${name}#${seed} ${point.name} must be on the main road network`);
                assert.ok(!scene.buildings.some(b => Math.hypot(b.x - x, b.y - y) < 14), `${name}#${seed} ${point.name} keeps a clear landmark area`);
            }
            for (const b of scene.buildings) assert.ok(!isWet(scene, b.x, b.y), `${name}#${seed} building in water at ${b.x},${b.y}`);
        }
    }
});

test('gate:map-gen:water-places-shape-the-terrain', () => {
    const sea = generateCityScene({ seed: 2, width: W, height: H, points: PRESETS.seaside });
    assert.ok(sea.sea, 'sea words create a coastline');
    assert.equal(sea.sea.side, 'bottom');
    assert.ok(sea.sea.beach);
    assert.ok(!isWet(sea, 0.2 * W, 0.8 * H), 'harbour pin stays on shore');
    assert.ok(sea.landmarks.some(l => l.kind === 'pier'));
    const lake = generateCityScene({ seed: 3, width: W, height: H, points: PRESETS.lake });
    assert.equal(lake.lakes.length, 1);
    assert.ok(isWet(lake, 0.7 * W, 0.6 * H), 'the lake pin sits on the lake');
});

test('gate:map-gen:adding-a-place-keeps-distant-roads-and-blocks', () => {
    const base = [{ id: '1', name: '我家', x: 0.2, y: 0.7 }, { id: '2', name: '樱丘高中', x: 0.55, y: 0.3 }, { id: '3', name: '咖啡馆', x: 0.4, y: 0.55 }];
    const key = b => `${b.x},${b.y},${b.w},${b.h}`;
    const a = generateCityScene({ seed: 1, width: W, height: H, points: base });
    const b = generateCityScene({ seed: 1, width: W, height: H, points: [...base, { id: '9', name: '书店', x: 0.9, y: 0.85 }] });
    const far = scene => new Set(scene.buildings.filter(item => Math.hypot(item.x - 1440, item.y - 765) > 600).map(key));
    const before = far(a);
    const after = far(b);
    const kept = [...before].filter(item => after.has(item)).length / before.size;
    assert.ok(kept > 0.95, `distant blocks should stay put (kept ${kept.toFixed(2)})`);
});

test('gate:map-gen:degenerate-inputs-still-produce-a-map', () => {
    const cases = [
        [],
        [{ id: 'a', name: '我家', x: 0.5, y: 0.5 }],
        [{ id: 'a', name: '', x: -3, y: 9 }, { id: 'b', name: '重复', x: 0.5, y: 0.5 }, { id: 'c', name: '重复', x: 0.5, y: 0.5 }],
        [{ id: 'a', name: '大海', x: 0.5, y: 0.9 }, { id: 'b', name: '湖', x: 0.2, y: 0.2 }, { id: 'c', name: '河', x: 0.8, y: 0.5 }],
        Array.from({ length: 30 }, (_, i) => ({ id: String(i), name: ['学校', '商店', '公园', '我家', '车站'][i % 5], x: (i % 6) / 6 + 0.05, y: Math.floor(i / 6) / 5 + 0.08 })),
    ];
    for (const points of cases) {
        const scene = generateCityScene({ seed: 9, width: W, height: H, points });
        assert.ok(scene.mainRoads.length >= 1, 'even an empty layer gets a road skeleton');
        assert.ok(scene.buildings.length > 50);
    }
});

test('gate:map-gen:renderer-yields-phases-and-lights-render-on-black', () => {
    const scene = generateCityScene({ seed: 5, width: W, height: H, points: PRESETS.campus });
    const calls = { count: 0 };
    const canvas = fakeCanvas(W, H, calls);
    const phases = [...renderCitySteps(canvas.getContext('2d'), scene, { scale: 1, seed: 5, createCanvas: (w, h) => fakeCanvas(w, h, calls) })];
    for (const phase of ['ground', 'water', 'roads', 'buildings', 'trees', 'landmarks', 'finish']) assert.ok(phases.includes(phase), phase);
    assert.ok(calls.count > 1000);
    const lights = fakeCanvas(W, H);
    const ctx = lights.getContext('2d');
    renderLightSteps(ctx, scene.lights, W, H, { createCanvas: (w, h) => fakeCanvas(w, h) });
    assert.equal(ctx.globalCompositeOperation, 'source-over', 'composite mode is restored');
});

test('gate:map-gen:inputs-key-by-chat-layer-salt-and-points', () => {
    const base = { chatId: 'chat-1', tableUid: 'sheet', parentId: '', points: PRESETS.campus };
    const a = buildMapGenInput(base);
    assert.equal(a.key, buildMapGenInput(base).key);
    assert.equal(a.scale, 'city');
    assert.notEqual(buildMapGenInput({ ...base, chatId: 'chat-2' }).seed, a.seed, 'each conversation gets its own city');
    assert.notEqual(buildMapGenInput({ ...base, salt: 1 }).key, a.key, 'reroll changes the map');
    assert.notEqual(buildMapGenInput({ ...base, points: PRESETS.campus.slice(1) }).key, a.key);
    assert.equal(buildMapGenInput({ ...base, parentName: '我家', points: [{ id: 'f', name: '一楼', x: 0.5, y: 0.5 }] }).scale, 'interior');
    const lights = buildMarkerLightsInput([{ x: 0.5, y: 0.5 }], W, H);
    assert.deepEqual(lights.lights, [{ x: 800, y: 450, r: 70, a: 0.75 }]);
});

test('gate:map-gen:generator-slices-work-caches-and-revokes', async () => {
    const queue = [];
    const revoked = [];
    const view = { URL: { revokeObjectURL: url => revoked.push(url) }, setTimeout: fn => queue.push(fn) };
    let clock = 0;
    const generator = createMapBasemapGenerator({
        doc: { defaultView: view }, cacheSize: 1, budgetMs: 5, now: () => (clock += 3),
        schedule: fn => queue.push(fn), createCanvas: (w, h) => fakeCanvas(w, h), scale: 1,
    });
    const input = buildMapGenInput({ chatId: 'c', tableUid: 't', points: PRESETS.campus });
    const entry = generator.request(input);
    assert.equal(entry.status, 'pending');
    assert.equal(generator.request(input), entry, 'the same job is shared, not restarted');
    let slices = 0;
    while (queue.length) { queue.shift()(); slices++; }
    await entry.promise;
    assert.ok(slices > 3, 'work is split across several host tasks');
    assert.equal(entry.status, 'ready');
    assert.match(entry.result.url, /^data:image\/png/);
    assert.ok(entry.result.lightsUrl);
    assert.equal(generator.peek(input.key), entry);

    const other = generator.request(buildMarkerLightsInput([{ x: 0.1, y: 0.1 }], W, H));
    while (queue.length) queue.shift()();
    await other.promise;
    assert.equal(generator.peek(input.key), null, 'LRU evicts the oldest finished entry');

    const broken = createMapBasemapGenerator({ doc: { defaultView: view }, schedule: fn => queue.push(fn), createCanvas: () => null });
    const failed = broken.request(input);
    while (queue.length) queue.shift()();
    await failed.promise;
    assert.equal(failed.status, 'failed');
    assert.equal(failed.error, 'canvas-unavailable');
    generator.dispose();
});

test('gate:map-gen:lighting-interpolates-time-and-weather', () => {
    assert.equal(resolveMapHour('17:40'), 17 + 40 / 60);
    assert.equal(resolveMapHour('下午3点'), 15);
    assert.equal(resolveMapHour('黄昏'), 18);
    assert.equal(resolveMapHour('深夜'), 0.5);
    assert.equal(resolveMapHour(''), null);
    const noon = resolveMapLighting({ time: '12:00' });
    assert.equal(noon.tint, '');
    assert.equal(noon.lights, 0);
    const midnight = resolveMapLighting({ time: '深夜' });
    assert.ok(midnight.tint && midnight.lights === 1);
    const dusk = resolveMapLighting({ time: '18:00' });
    assert.ok(dusk.warm && dusk.lights > 0 && dusk.lights < 1, 'dusk blends between day and night');
    assert.equal(resolveMapLighting({}).hour, 12, 'unknown time defaults to day');
    const storm = resolveMapLighting({ time: '12:00', weather: '暴雨' });
    const drizzle = resolveMapLighting({ time: '12:00', weather: '小雨' });
    assert.equal(storm.kind, 'rain');
    assert.ok(storm.clouds > drizzle.clouds && storm.gray && drizzle.gray);
    assert.ok(resolveMapLighting({ weather: '浓雾' }).fog > 0);
    assert.ok(resolveMapLighting({ weather: '大雪' }).snow > 0);
});

test('gate:map-gen:light-layers-respect-own-time-art', () => {
    const night = resolveMapLighting({ time: '22:00', weather: '多云' });
    const graded = mapLightLayersHtml(night, { lightsUrl: 'blob:lights' });
    assert.match(graded, /igs-map-light-tint/);
    assert.match(graded, /igs-map-light-lamps" src="blob:lights"/);
    assert.match(graded, /igs-map-light-clouds/);
    const art = mapLightLayersHtml(night, { lightsUrl: 'blob:lights', ownTimeArt: true });
    assert.doesNotMatch(art, /igs-map-light-tint|igs-map-light-lamps/);
    assert.match(art, /igs-map-light-clouds/, 'weather still shows over bundled art');
    assert.equal(mapBasemapFilter(night, { ownTimeArt: true }), '');
    assert.match(mapBasemapFilter(night), /brightness\([\d.]+\) saturate\([\d.]+\)/);
    assert.doesNotMatch(mapLightLayersHtml(night, { lightsUrl: '"><script>' }), /<script>/);
});

test('gate:map-gen:green-cover-and-restrained-housing', () => {
    for (let seed = 1; seed <= 4; seed++) {
        const scene = generateCityScene({ seed, width: W, height: H, points: PRESETS.campus });
        const green = scene.ground.zone.filter(z => z >= 3 && z <= 5).length / scene.ground.zone.length;
        assert.ok(green > 0.12, `#${seed} parks and woods cover a real share of the map (${green.toFixed(2)})`);
        assert.ok(scene.trees.length > scene.buildings.length * 3, `#${seed} trees outnumber buildings`);
        assert.ok(scene.buildings.length < 1400, `#${seed} the map is not wall-to-wall houses (${scene.buildings.length})`);
    }
});

test('gate:map-gen:parks-have-no-crop-circles', () => {
    for (let seed = 1; seed <= 6; seed++) {
        const scene = generateCityScene({ seed, width: W, height: H, points: PRESETS.campus });
        for (const path of scene.paths) {
            const [a, b] = [path.points[0], path.points[path.points.length - 1]];
            const length = path.points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path.points[i][0], p[1] - path.points[i][1]), 0);
            assert.ok(!(length > 60 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 12), `#${seed} park paths are not closed rings`);
        }
    }
});

test('gate:map-gen:nothing-spills-into-rivers', () => {
    for (let seed = 1; seed <= 8; seed++) {
        const scene = generateCityScene({ seed, width: W, height: H, points: PRESETS.campus });
        for (const river of scene.rivers) {
            for (const item of [...scene.buildings, ...scene.trees, ...scene.fields, ...scene.parking]) {
                const near = nearestOnPolyline(item.x, item.y, river.points);
                assert.ok(near.distance >= river.halfs[near.index] + 2, `#${seed} ${item.w ? 'lot' : 'tree'} at ${item.x},${item.y} sits in the river`);
            }
            for (let i = 1; i < river.halfs.length; i++) {
                assert.ok(Math.abs(river.halfs[i] - river.halfs[i - 1]) < 4, `#${seed} river width changes smoothly (no notches)`);
            }
        }
        for (const street of [...scene.streets, ...scene.lanes]) {
            for (const [x, y] of street.points) assert.ok(!isWet(scene, x, y), `#${seed} streets stop at the bank instead of running into water`);
        }
    }
});

test('gate:map-gen:streets-follow-one-coherent-grid', () => {
    const angle = (points, i) => Math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0]);
    for (let seed = 1; seed <= 4; seed++) {
        const scene = generateCityScene({ seed, width: W, height: H, points: PRESETS.campus });
        let sharp = 0;
        let turns = 0;
        for (const street of scene.streets) {
            assert.ok(street.points.length >= 5, `#${seed} no stubby street fragments`);
            for (let i = 1; i < street.points.length - 1; i++) {
                const d = Math.abs(Math.sin(angle(street.points, i) - angle(street.points, i - 1)));
                turns++;
                if (d > 0.5) sharp++;
            }
        }
        assert.ok(sharp / turns < 0.03, `#${seed} streets bend gently (${sharp}/${turns} sharp kinks)`);
        const lots = [...scene.buildings, ...scene.fields, ...scene.parking];
        for (let i = 0; i < lots.length; i++) {
            for (let j = i + 1; j < lots.length; j++) {
                const a = lots[i];
                const b = lots[j];
                if (Math.hypot(a.x - b.x, a.y - b.y) > 3) continue;
                assert.fail(`#${seed} two lots are stacked at ${a.x},${a.y}`);
            }
        }
    }
});

test('gate:map-gen:scene-carries-ground-zones-and-details', () => {
    const scene = generateCityScene({ seed: 4, width: W, height: H, points: PRESETS.seaside });
    assert.equal(scene.ground.zone.length, scene.ground.cols * scene.ground.rows);
    assert.ok(scene.boats.length > 0, 'boats on the sea');
    assert.ok(scene.cars.length > 20, 'traffic on the arterials');
    assert.ok(scene.buildings.some(b => b.kind === 'flat') && scene.buildings.some(b => b.kind === 'house'));
});
