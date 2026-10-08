import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createReadingProgress,
    decodeIdSet,
    encodeIdSet,
    mergeReadingData,
    resolvePositionFloor,
    resolvePositionPage,
    textHash,
    textHead,
    READING_SLOT_LIMIT,
} from '../src/visual/igs-ui/reading-progress.js';

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
        map,
    };
}

function makeProgress(store = memoryStorage(), chatId = 'chat-a') {
    let clock = 1000;
    let id = chatId;
    const progress = createReadingProgress({ getChatId: () => id, storage: () => store, now: () => (clock += 1) });
    return { progress, store, setChat: (next) => { id = next; } };
}

test('已读楼号压成区间串并能还原', () => {
    assert.equal(encodeIdSet([0, 1, 2, 4, 6, 7, 8, 12]), '0-2,4,6-8,12');
    assert.deepEqual([...decodeIdSet('0-2,4,6-8,12')], [0, 1, 2, 4, 6, 7, 8, 12]);
});

test('读到某页记上次位置、最远位置、读了一半与读完', () => {
    const { progress } = makeProgress();
    progress.notePage({ id: 15, page: 7, total: 10, text: '第八页开头的文字', floorText: 'floor15', place: '教室' });
    assert.deepEqual({ id: progress.getLast().id, page: progress.getLast().page }, { id: 15, page: 7 });
    assert.equal(progress.floorState(15), 'partial');
    assert.equal(progress.isPageRead(15, 7), true);
    assert.equal(progress.isPageRead(15, 8), false);
    progress.notePage({ id: 15, page: 9, total: 10, text: 'x' });
    assert.equal(progress.floorState(15), 'read');
    // 往回翻：上次位置跟着变，最远不倒退。
    progress.notePage({ id: 3, page: 0, total: 4, text: 'y' });
    assert.equal(progress.getLast().id, 3);
    assert.equal(progress.getFarthest().id, 15);
    assert.equal(progress.chapterAt(16), '教室');
    assert.equal(progress.chapterAt(14), '');
});

test('旧书签「楼号:页码」迁移进新进度并删旧键', () => {
    const store = memoryStorage({ 'igs-turn-bookmark:chat-a': '15:8' });
    const { progress } = makeProgress(store);
    assert.deepEqual({ id: progress.getLast().id, page: progress.getLast().page }, { id: 15, page: 8 });
    assert.equal(store.getItem('igs-turn-bookmark:chat-a'), null);
});

test('每个聊天各存一份', () => {
    const { progress, setChat } = makeProgress();
    progress.notePage({ id: 5, page: 1, total: 3, text: 'a' });
    setChat('chat-b');
    assert.equal(progress.getLast(), null);
    setChat('chat-a');
    assert.equal(progress.getLast().id, 5);
});

test('分页变了按页首指纹找回，楼内容变了退回第 1 页', () => {
    const segments = ['一二三', '四五六七', '八九十'];
    const pos = { id: 15, page: 1, head: textHead('四五六七'), hash: textHash('原文') };
    assert.deepEqual(resolvePositionPage(pos, segments, '原文'), { page: 1, reason: 'exact' });
    assert.deepEqual(resolvePositionPage(pos, ['零', '一二三', '四五六七'], '原文'), { page: 2, reason: 'head' });
    assert.deepEqual(resolvePositionPage({ ...pos, page: 7, head: '找不到' }, segments, '原文'), { page: 2, reason: 'clamped' });
    assert.deepEqual(resolvePositionPage({ ...pos, head: '找不到' }, segments, '改过的正文'), { page: 0, reason: 'changed' });
});

test('书签楼没了退到前一楼', () => {
    assert.deepEqual(resolvePositionFloor({ id: 15 }, [0, 13, 15, 17]), { index: 2, reason: 'exact' });
    assert.deepEqual(resolvePositionFloor({ id: 15 }, [0, 13, 17]), { index: 1, reason: 'missing' });
    assert.deepEqual(resolvePositionFloor({ id: 0 }, [2, 4]), { index: 0, reason: 'missing' });
});

test('存档位：新建、覆盖保留名字、改名、上限、删除、快速存档', () => {
    const { progress } = makeProgress();
    const first = progress.saveSlot({ id: 3, page: 2, head: 'abc', thumb: 'data:image/png;base64,xx' });
    assert.equal(first.ok, true);
    assert.equal(first.slot.thumb, '', '内联大图不进存档');
    progress.renameSlot(first.slot.key, '告白前');
    progress.saveSlot({ id: 9, page: 0 }, { key: first.slot.key });
    assert.equal(progress.listSlots()[0].name, '告白前');
    assert.equal(progress.listSlots()[0].id, 9);
    for (let i = 1; i < READING_SLOT_LIMIT; i += 1) assert.equal(progress.saveSlot({ id: i, page: 0 }).ok, true);
    assert.equal(progress.saveSlot({ id: 99, page: 0 }).reason, 'slots-full');
    progress.removeSlot(first.slot.key);
    assert.equal(progress.listSlots().length, READING_SLOT_LIMIT - 1);
    progress.quickSave({ id: 20, page: 4 });
    assert.equal(progress.getQuick().id, 20);
});

test('本机与聊天元数据合并：位置取更新的，已读取并集', () => {
    const merged = mergeReadingData(
        { last: { id: 15, page: 8, at: 10 }, far: { id: 18, page: 0, at: 5 }, read: '0-14', partial: { 15: 8 }, slots: [{ key: 's1', id: 3, page: 0, at: 1, name: '旧' }] },
        { last: { id: 20, page: 1, at: 20 }, far: { id: 20, page: 1, at: 20 }, read: '15-19', partial: {}, slots: [{ key: 's1', id: 4, page: 0, at: 2, name: '新' }] },
    );
    assert.equal(merged.last.id, 20);
    assert.equal(merged.far.id, 20);
    assert.equal(merged.read, '0-19');
    assert.deepEqual(merged.partial, {});
    assert.equal(merged.slots[0].name, '新');
});
