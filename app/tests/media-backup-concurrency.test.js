import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaRecordJournal, stopMediaJournals } from '../src/media/media-record-journal.js';
import { mediaStateStoreFor } from '../src/media/media-state-store.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';
import { withTavernIllustrationFiles } from '../src/media/tavern-illustrations.js';
import { mediaFileGcFor } from '../src/media/media-file-gc.js';
import { disposeLocalImageCache } from '../src/media/tavern-image-cache.js';
import { fakeMediaServer, pixel, settleMedia } from './helpers/fake-media-server.js';

const fileName = 'igs-cg-records.json';
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};

function pauseFirstBackup(host, t) {
    const arrived = deferred(), release = deferred(), fetch = host.fetch;
    let paused = false, requests = 0;
    host.fetch = async (url, options = {}) => {
        if (url === '/api/files/upload' && JSON.parse(options.body).name === fileName) {
            requests++;
            if (!paused) {
                paused = true;
                arrived.resolve();
                await release.promise;
            }
        }
        return fetch(url, options);
    };
    t.after(() => release.resolve());
    return { arrived: arrived.promise, release: release.resolve, get requests() { return requests; } };
}

function journalFixture(host) {
    const rows = new Map();
    const journal = createMediaRecordJournal(host, {
        fileName, legacyField: 'slots',
        list: async () => [...rows], get: async key => rows.get(key),
        put: async (key, value) => rows.set(key, value), remove: async key => rows.delete(key),
    });
    const write = (key, value) => journal.write(key, value, () => {
        if (value) rows.set(key, value); else rows.delete(key);
    });
    return { rows, journal, write };
}

test('历史备份上传未结束时，新 CG 仍能上传原图并提交本机记录', { timeout: 3000 }, async t => {
    const server = fakeMediaServer(), host = server.host();
    const raw = createMemoryIllustrationStore(), store = withTavernIllustrationFiles(raw, host);
    const floor = 'fixture-chat|2|0';
    await store.putSlot(floor, { slot: 1, status: 'done', dataUrl: pixel('first') });
    const gate = pauseFirstBackup(host, t);
    const upload = store.flush();
    await gate.arrived;
    let saved = false;
    const next = store.putSlot(floor, { slot: 2, status: 'done', dataUrl: pixel('second') })
        .then(value => { saved = true; return value; });
    try {
        await settleMedia();
        assert.equal(saved, true, '慢备份不能占住原图上传和本机提交需要的锁');
        assert.equal(server.images.size, 2);
        assert.equal((await raw.getSlotRecord(`${floor}|2`)).status, 'done');
    } finally {
        gate.release();
        await Promise.allSettled([upload, next]);
        await stopMediaJournals(host);
        await mediaFileGcFor(host).stop();
        await disposeLocalImageCache(host);
    }
});

for (const deleted of [false, true]) {
    test(`上传期间${deleted ? '删除' : '修改'}的记录不被旧快照覆盖，下一轮同步最新版本`, { timeout: 3000 }, async t => {
        const server = fakeMediaServer(), host = server.host();
        const { rows, journal, write } = journalFixture(host);
        await write('one', { description: 'original' });
        const gate = pauseFirstBackup(host, t);
        const uploading = journal.flush();
        await gate.arrived;
        let committed = false;
        const next = write('one', deleted ? null : { description: 'edited' }).then(() => { committed = true; });
        try {
            await settleMedia();
            assert.equal(committed, true, '本机修改不等待备份网络响应');
            gate.release();
            const result = await uploading;
            assert.equal(result.ok, false, '新版本尚未同步时不能宣称备份全部完成');
            assert.equal(result.reason, 'media-backup-pending');
            assert.deepEqual(rows.get('one'), deleted ? undefined : { description: 'edited' });
            const wal = await mediaStateStoreFor(host).get(`${fileName}:one`);
            assert.equal(wal.dirty, true);
            assert.equal(wal.deleted, deleted);
            assert.equal((await journal.flush()).ok, true);
            const backedUp = server.files.get(fileName);
            assert.equal(backedUp.records.one.deleted, deleted);
            assert.deepEqual(backedUp.records.one.value, deleted ? null : { description: 'edited' });
            assert.deepEqual(backedUp.slots.one, deleted ? undefined : { description: 'edited' });
            assert.equal((await journal.diagnostics()).dirty, 0);
        } finally {
            gate.release();
            await Promise.allSettled([uploading, next]);
            await stopMediaJournals(host);
        }
    });
}

test('两个标签页的同名备份串行合并，不让较旧上传覆盖后续记录', { timeout: 3000 }, async t => {
    const server = fakeMediaServer(), host = server.host();
    const otherHost = server.host(host.indexedDB), locks = new Map();
    // 模拟同源 Web Locks；两个页面各有自己的模块内队列。
    host.navigator = otherHost.navigator = { locks: { request(name, callback) {
        const previous = locks.get(name) || Promise.resolve();
        const job = previous.catch(() => {}).then(callback);
        locks.set(name, job);
        return job;
    } } };
    const first = journalFixture(host), second = journalFixture(otherHost);
    await Promise.all([first.journal.restore(), second.journal.restore()]);
    await first.write('first', { description: 'first record' });
    const gate = pauseFirstBackup(host, t);
    const uploading = first.journal.flush();
    await gate.arrived;
    let committed = false;
    const next = second.write('second', { description: 'second record' }).then(() => { committed = true; });
    const followup = next.then(() => second.journal.flush());
    try {
        await settleMedia();
        assert.equal(committed, true, '另一个标签页的本机写入也不被上传阻塞');
        assert.equal(server.uploads.length, 0, '第二份快照须等前一份备份完成后再读取和合并');
        gate.release();
        await Promise.all([uploading, followup]);
        const snapshot = server.files.get(fileName);
        assert.deepEqual(Object.keys(snapshot.slots).sort(), ['first', 'second']);
        assert.equal(snapshot.slots.first.description, 'first record');
        assert.equal(snapshot.slots.second.description, 'second record');
    } finally {
        gate.release();
        await Promise.allSettled([uploading, next, followup]);
        await Promise.all([stopMediaJournals(host), stopMediaJournals(otherHost)]);
    }
});

test('重复同步共用在途上传；网络失败后仍保留最新修改供重试', { timeout: 3000 }, async t => {
    const server = fakeMediaServer(), host = server.host();
    const { journal, write } = journalFixture(host);
    await write('one', { description: 'original' });
    const gate = pauseFirstBackup(host, t);
    const uploading = journal.flush();
    await gate.arrived;
    const duplicate = journal.flush();
    let committed = false;
    const next = write('one', { description: 'edited' }).then(() => { committed = true; });
    try {
        await settleMedia();
        assert.equal(committed, true);
        assert.equal(gate.requests, 1, '重复同步不能另发一份相同快照');
        server.failBackup = true;
        gate.release();
        const results = await Promise.allSettled([uploading, duplicate]);
        assert.equal(results.every(result => result.status === 'rejected'), true);
        assert.equal(gate.requests, 1);
        assert.equal((await journal.diagnostics()).dirty, 1);
        server.failBackup = false;
        assert.equal((await journal.flush()).ok, true);
        assert.equal(server.uploads.length, 1, '失败的同一次上传不能在并发调用间复制重放');
        assert.equal(server.files.get(fileName).slots.one.description, 'edited');
    } finally {
        gate.release();
        await Promise.allSettled([uploading, duplicate, next]);
        await stopMediaJournals(host);
    }
});

test('上传期间的新引用尚未备份时，GC 不删除文件；下一轮核验后才回收旧图', { timeout: 3000 }, async t => {
    const server = fakeMediaServer(), host = server.host();
    const raw = createMemoryIllustrationStore(), store = withTavernIllustrationFiles(raw, host);
    const floor = 'fixture-chat|2|0';
    await store.putSlot(floor, { slot: 1, status: 'done', dataUrl: pixel('original') });
    await store.flush();
    await store.putSlot(floor, { slot: 1, status: 'done', dataUrl: pixel('replacement') });
    const gate = pauseFirstBackup(host, t);
    const uploading = store.flush();
    await gate.arrived;
    let committed = false;
    const next = store.putSlot(floor, { slot: 1, status: 'done', dataUrl: pixel('latest') })
        .then(() => { committed = true; });
    let collecting;
    try {
        await settleMedia();
        assert.equal(committed, true);
        collecting = mediaFileGcFor(host).drain();
        await settleMedia();
        assert.equal(server.deletions.length, 0);
        gate.release();
        assert.equal((await uploading).reason, 'media-backup-pending');
        await assert.rejects(collecting, /media-backup-pending/);
        assert.equal(server.deletions.length, 0, '没有完整备份不能回收旧图');
        assert.equal((await store.flush()).ok, true);
        assert.equal((await mediaFileGcFor(host).drain()).ok, true);
        const record = await raw.getSlotRecord(`${floor}|1`);
        assert.equal(server.images.size, 1);
        assert.equal(server.images.has(record.dataUrl), true);
        assert.equal(server.files.get(fileName).slots[`${floor}|1`].dataUrl, record.dataUrl);
    } finally {
        gate.release();
        await Promise.allSettled([uploading, next, collecting]);
        await stopMediaJournals(host);
        await mediaFileGcFor(host).stop();
        await disposeLocalImageCache(host);
    }
});
