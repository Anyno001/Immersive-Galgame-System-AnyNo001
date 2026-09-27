import { performance } from 'node:perf_hooks';
import { matchBackgroundRule } from '../src/scene/background-rules.js';
import { createGenerationQueue } from '../src/generated-images/generation-queue.js';
import { getResponsiveLayout } from '../src/visual/responsive-layout.js';
import { generateCityScene } from '../src/visual/map-gen/city.js';

const start = performance.now();
const rules = Array.from({ length: 2000 }, (_, index) => ({
    id: `rule-${index}`,
    priority: index,
    match: {
        location: index === 1999 ? ['library'] : ['street'],
        time: ['night'],
        weather: ['rain'],
    },
}));

const matched = matchBackgroundRule(
    { location: 'library', time: 'night', weather: 'rain' },
    rules,
);
assert(matched && matched.id === 'rule-1999', 'large background rule set did not match expected rule');

const queue = createGenerationQueue();
for (let index = 0; index < 10000; index += 1) {
    queue.enqueue({ id: index });
}
assert(queue.size() === 10000, 'generation queue size mismatch');
queue.clear();

for (let index = 0; index < 1000; index += 1) {
    getResponsiveLayout({ width: 844, height: 390 }, { mode: 'fullscreen', isMobile: true });
}

const elapsed = performance.now() - start;
assert(elapsed < 500, `perf smoke exceeded threshold: ${elapsed.toFixed(2)}ms`);

// 程序地图几何（不含 Canvas 绘制）：30 个地点的最坏层级也要留足主线程分片余量。
const mapStart = performance.now();
const places = Array.from({ length: 30 }, (_, index) => ({
    id: String(index), name: ['学校', '商店', '公园', '我家', '车站', '河边'][index % 6],
    x: (index % 6) / 6 + 0.05, y: Math.floor(index / 6) / 5 + 0.08,
}));
const scene = generateCityScene({ seed: 7, width: 1600, height: 900, points: places });
const mapElapsed = performance.now() - mapStart;
assert(scene.buildings.length > 100, 'generated city is unexpectedly empty');
assert(scene.buildings.length + scene.trees.length < 12000, `generated city draws too many shapes: ${scene.buildings.length + scene.trees.length}`);
assert(mapElapsed < 1500, `map generation exceeded threshold: ${mapElapsed.toFixed(2)}ms`);
console.log(`gate:perf ok ${elapsed.toFixed(2)}ms · map-gen ${mapElapsed.toFixed(0)}ms`);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
