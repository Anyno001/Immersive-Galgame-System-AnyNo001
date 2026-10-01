import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ONBOARDING_STORAGE_KEY as KEY, readOnboardingState, writeOnboardingState,
    normalizeOnboardingState, shouldInviteOnboarding,
} from '../src/visual/igs-ui/onboarding-guide.js';

function memoryStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => { data.set(k, String(v)); } };
}
const NOW = new Date('2026-10-01T00:00:00.000Z');

test('onboarding state: 缺键视为未见过并邀请', () => {
    const read = readOnboardingState(memoryStorage());
    assert.equal(read.ok, true);
    assert.equal(read.state.status, 'unseen');
    assert.equal(read.state.step, 0);
    assert.equal(shouldInviteOnboarding(read, {}), true);
});

test('onboarding state: 坏 JSON、非对象、读取抛错、无存储都不邀请', () => {
    const cases = [
        [memoryStorage({ [KEY]: '{bad' }), 'invalid-json'],
        [memoryStorage({ [KEY]: '[]' }), 'invalid-shape'],
        [{ getItem() { throw new Error('denied'); } }, 'storage-read-failed'],
        [null, 'storage-unavailable'],
    ];
    for (const [storage, reason] of cases) {
        const read = readOnboardingState(storage);
        assert.equal(read.ok, false, reason);
        assert.equal(read.reason, reason);
        assert.equal(shouldInviteOnboarding(read, {}), false, reason);
    }
});

test('onboarding state: 未知版本不邀请也不覆盖', () => {
    const raw = JSON.stringify({ version: 2, status: 'unseen' });
    const storage = memoryStorage({ [KEY]: raw });
    assert.equal(readOnboardingState(storage).reason, 'unknown-version');
    const written = writeOnboardingState(storage, { status: 'done' }, NOW);
    assert.equal(written.ok, false);
    assert.equal(written.reason, 'unknown-version');
    assert.equal(storage.data.get(KEY), raw);
});

test('onboarding state: 非法状态与步骤归一化', () => {
    assert.deepEqual(normalizeOnboardingState({ status: 'weird', step: 99, updatedAt: 5 }),
        { version: 1, status: 'unseen', step: 0, updatedAt: '' });
    assert.equal(normalizeOnboardingState({ status: 'done', step: 2.5 }).step, 0);
    assert.equal(normalizeOnboardingState(null).status, 'unseen');
});

test('onboarding state: 写入 done / dismissed 后不再邀请，坏数据可被明确操作覆盖', () => {
    for (const status of ['done', 'dismissed']) {
        const storage = memoryStorage({ [KEY]: '{bad' });
        assert.equal(writeOnboardingState(storage, { status, step: 3 }, NOW).ok, true);
        assert.deepEqual(JSON.parse(storage.data.get(KEY)), { version: 1, status, step: 3, updatedAt: NOW.toISOString() });
        assert.equal(shouldInviteOnboarding(readOnboardingState(storage), {}), false, status);
    }
});

test('onboarding state: 写入失败带 saveError 返回', () => {
    const storage = { getItem: () => null, setItem() { throw new Error('quota'); } };
    const written = writeOnboardingState(storage, { status: 'done' }, NOW);
    assert.equal(written.ok, false);
    assert.equal(written.reason, 'storage-write-failed');
    assert.ok(written.saveError instanceof Error);
});

test('onboarding state: 本次会话回应过后不再邀请', () => {
    assert.equal(shouldInviteOnboarding(readOnboardingState(memoryStorage()), { answered: true }), false);
});
