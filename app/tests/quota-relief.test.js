import test from 'node:test';
import assert from 'node:assert/strict';
import { writeCheckedStorage } from '../src/storage/checked-storage-write.js';
import { relieveStorageQuota, isQuotaError } from '../src/storage/quota-relief.js';

function fakeStorage(init, { failWhile } = {}) {
    const m = new Map(Object.entries(init));
    return {
        m,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        removeItem: (k) => { m.delete(k); },
        setItem(k, v) {
            if (failWhile?.(m, k, v)) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
            m.set(k, String(v));
        },
    };
}
const log = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ at: i, message: 'm' + i })));
const others = { 'igs:preset-registry:v1': 'a', 'igs-media-journal': 'b', igs_bridge_config: 'c', 'igs-draft-x': 'd', 'other:key': 'e', 'igs-reader-settings-1': 'f' };

test('quota error: relief then retry succeeds, only whitelist touched', () => {
    const s = fakeStorage({ igs_image_job_log: log, 'igs:loader:latest-ref': 'v', ...others },
        { failWhile: (m, k) => k === 'target' && m.has('igs:loader:latest-ref') });
    const r = writeCheckedStorage(s, 'target', 'x');
    assert.equal(r.ok, true);
    assert.equal(s.m.has('igs:loader:latest-ref'), false);
    assert.equal(JSON.parse(s.m.get('igs_image_job_log')).length, 5);
    for (const [k, v] of Object.entries(others)) assert.equal(s.m.get(k), v);
});

test('still failing after relief: reports failure and rolls back', () => {
    const s = fakeStorage({ igs_image_job_log: log, target: 'old', ...others }, { failWhile: (m, k, v) => k === 'target' && v !== 'old' });
    const r = writeCheckedStorage(s, 'target', 'x');
    assert.equal(r.ok, false);
    assert.equal(isQuotaError(r.saveError), true);
    assert.equal(s.m.get('target'), 'old');
    for (const [k, v] of Object.entries(others)) assert.equal(s.m.get(k), v);
});

test('nothing to free: no retry, error surfaces; non-quota errors untouched', () => {
    const s = fakeStorage({ ...others }, { failWhile: () => true });
    assert.equal(writeCheckedStorage(s, 'target', 'x').ok, false);
    assert.deepEqual(relieveStorageQuota(s), []);
    const t = fakeStorage({ igs_image_job_log: log }, {});
    t.setItem = () => { throw new Error('boom'); };
    assert.equal(writeCheckedStorage(t, 'k', 'v').ok, false);
    assert.equal(t.m.has('igs_image_job_log'), true);
});

test('corrupt or tiny log is cleared', () => {
    const s = fakeStorage({ igs_image_job_log: '{bad' });
    assert.deepEqual(relieveStorageQuota(s), [{ key: 'igs_image_job_log', action: 'cleared' }]);
    assert.equal(s.m.has('igs_image_job_log'), false);
});
