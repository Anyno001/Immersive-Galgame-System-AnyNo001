import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexedDbIllustrationStore } from '../src/media/illustration-store.js';
import { createTransactionalIdb } from './helpers/transactional-idb.js';

const floor = 'fixture|3|0';
async function setup() {
    const indexedDB = createTransactionalIdb();
    const store = createIndexedDbIllustrationStore({ indexedDB });
    const before = await store.putSlot(floor, { slot: 1, dataUrl: 'original', caption: { fixture: true }, originalSize: { width: 64, height: 64 } });
    return { indexedDB, store, before };
}
const options = (record) => ({ expectedToken: record.revisionToken, preserveBaseline: true });

test('IDB 两个连接并发接受同一候选，只有一次修订成功', async () => {
    const { indexedDB, store, before } = await setup();
    const other = createIndexedDbIllustrationStore({ indexedDB });
    const results = await Promise.all([store, other].map((s, i) => s.updateSlot(floor, 1, before.revision, { dataUrl: `candidate-${i}` }, options(before))));
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(results.find((r) => !r.ok).reason, 'stale-revision');
    const stored = await store.getSlotRecord(before.key);
    assert.equal(stored.revision, before.revision + 1);
    assert.deepEqual(stored, results.find((r) => r.ok).record);
});
