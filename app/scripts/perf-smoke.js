import { performance } from 'node:perf_hooks';
import { matchBackgroundRule } from '../src/scene/background-rules.js';
import { createGenerationQueue } from '../src/generated-images/generation-queue.js';
import { getResponsiveLayout } from '../src/visual/responsive-layout.js';

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
console.log(`gate:perf ok ${elapsed.toFixed(2)}ms`);

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
