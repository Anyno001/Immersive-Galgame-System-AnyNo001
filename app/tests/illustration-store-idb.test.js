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

test('IDB 接受在同一读写事务内校验并提交，首次基线跨重开保留', async () => {
    const { indexedDB, store, before } = await setup();
    const count = indexedDB.transactions.length;
    const saved = await store.updateSlot(floor, 1, before.revision, { dataUrl: 'candidate' }, options(before));
    assert.equal(saved.ok, true);
    assert.equal(indexedDB.transactions.length, count + 1);
    assert.equal(indexedDB.transactions.at(-1).mode, 'readwrite');
    assert.equal(saved.record.revision, before.revision + 1);
    assert.notEqual(saved.record.revisionToken, before.revisionToken);
    const reopened = createIndexedDbIllustrationStore({ indexedDB });
    assert.deepEqual(await reopened.getSlotRecord(before.key), saved.record);
    const next = await reopened.updateSlot(floor, 1, saved.record.revision, { dataUrl: 'next' }, options(saved.record));
    assert.equal(next.record.consistencyBaselineDataUrl, 'original');
    assert.deepEqual(next.record.consistencyBaselineMeta.caption, before.caption);
    assert.equal(next.record.consistencyBaselineMeta.revision, before.revision);
});

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

test('IDB 写入失败或事务中止不会提交候选，重试仍使用原修订', async () => {
    const { indexedDB, store, before } = await setup();
    indexedDB.failNextPut(new Error('fixture-quota'));
    await assert.rejects(store.updateSlot(floor, 1, before.revision, { dataUrl: 'failed' }, options(before)), /fixture-quota/);
    assert.deepEqual(await store.getSlotRecord(before.key), before);
    await assert.rejects(store.updateSlot(floor, 1, before.revision, { dataUrl: 'aborted' }, {
        ...options(before), shouldCommit: () => { indexedDB.transactions.at(-1).abort(); return true; },
    }), /fixture-abort/);
    assert.deepEqual(await store.getSlotRecord(before.key), before);
    const retry = await store.updateSlot(floor, 1, before.revision, { dataUrl: 'retry' }, options(before));
    assert.equal(retry.ok, true);
    assert.equal(retry.record.consistencyBaselineDataUrl, 'original');
});

test('IDB 目标失效、同步写入错误和删除后重建均保留旧图', async () => {
    const { store, before } = await setup();
    assert.equal((await store.updateSlot(floor, 1, before.revision, { dataUrl: 'late' },
        { ...options(before), shouldCommit: () => false })).reason, 'stale-target');
    assert.equal((await store.updateSlot(floor, 1, before.revision, { dataUrl: 'bad', uncloneable() {} },
        options(before))).reason, 'update-failed');
    assert.deepEqual(await store.getSlotRecord(before.key), before);
    await store.deleteSlot(floor, 1);
    const rebuilt = await store.putSlot(floor, { slot: 1, dataUrl: 'rebuilt' });
    assert.equal(rebuilt.revision, before.revision);
    assert.notEqual(rebuilt.revisionToken, before.revisionToken);
    assert.equal((await store.updateSlot(floor, 1, before.revision, { dataUrl: 'late' }, options(before))).reason, 'stale-revision');
    assert.deepEqual(await store.getSlotRecord(before.key), rebuilt);
});

test('IDB 三阶段资料和首次 CG 基线从权威存储跨连接回读', async () => {
    const { provenanceFixture } = await import('./helpers/prompt-provenance.js');
    const { promptProvenance } = await import('../src/generated-images/generation-prompt.js');
    const indexedDB = createTransactionalIdb();
    const store = createIndexedDbIllustrationStore({ indexedDB });
    const fixture = provenanceFixture();
    const before = await store.putSlot(floor, { slot: 1, status: 'done', dataUrl: 'original',
        caption: fixture.caption, prompt: fixture.prompt, characterMeta: fixture.characterMeta,
        ...promptProvenance(fixture) });
    const saved = await store.updateSlot(floor, 1, before.revision, { dataUrl: 'candidate',
        caption: fixture.caption, sentPrompt: { ...fixture.sentPrompt, action: 'infill' } }, options(before));
    assert.equal(saved.ok, true);
    const read = await createIndexedDbIllustrationStore({ indexedDB }).getSlotRecord(before.key);
    assert.deepEqual(read.promptRecipe, fixture.promptRecipe);
    assert.deepEqual(read.dnaSnapshot, fixture.dnaSnapshot);
    assert.equal(read.sentPrompt.action, 'infill');
    for (const field of ['prompt', 'promptRecipe', 'dnaSnapshot', 'sentPrompt', 'captionMode'])
        assert.deepEqual(read.consistencyBaselineMeta[field], before[field], field);
});
