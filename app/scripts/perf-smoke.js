import { performance } from 'node:perf_hooks';
import { matchBackgroundRule } from '../src/scene/background-rules.js';
import { createGenerationQueue } from '../src/generated-images/generation-queue.js';
import { getResponsiveLayout } from '../src/visual/responsive-layout.js';
import { generateCityScene } from '../src/visual/map-gen/city.js';
import { buildIgsTextPayload } from '../src/scene/message-source.js';
import { buildReaderSourceSignature, createReaderSourceCache, DEFAULT_SOURCE_CACHE_LIMIT } from '../src/visual/igs-ui/reader-source-cache.js';

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
// 阅读源缓存：同一楼层连续翻页只解析一次；宿主回写正文必须重新解析；LRU 不能无限增长。
const sourceStart = performance.now();
const sourceCache = createReaderSourceCache({
    parse: (input) => buildIgsTextPayload(input.liveMessage, input.parseOptions),
});
const longText = Array.from({ length: 400 }, (_, index) => `[igs-char:Alice|calm|第${index}句台词，长楼层正文。]`).join('\n');
const readSource = (messageId, text, visibleText = '') => {
    const liveMessage = { id: messageId, text };
    const parseOptions = { visibleText, sceneAssets: { enabled: true } };
    const signature = buildReaderSourceSignature({ messageId, rawText: text, visibleText, sceneAssetsEnabled: true });
    return sourceCache.get(signature, { liveMessage, parseOptions });
};
for (let page = 0; page < 200; page += 1) readSource(1, longText);
assert(sourceCache.getParseCount() === 1, `reader source reparsed on page turns: ${sourceCache.getParseCount()} parses`);
readSource(1, longText, '宿主回写后的正文');
assert(sourceCache.getParseCount() === 2, 'reader source cache missed a visible text rewrite');
for (let messageId = 2; messageId < 40; messageId += 1) readSource(messageId, `${longText}\n#${messageId}`);
assert(sourceCache.size() <= DEFAULT_SOURCE_CACHE_LIMIT, `reader source cache exceeded LRU limit: ${sourceCache.size()}`);
const sourceElapsed = performance.now() - sourceStart;
assert(sourceElapsed < 1500, `reader source cache smoke exceeded threshold: ${sourceElapsed.toFixed(2)}ms`);

console.log(`gate:perf ok ${elapsed.toFixed(2)}ms · map-gen ${mapElapsed.toFixed(0)}ms · reader-source ${sourceElapsed.toFixed(0)}ms`);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
