import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { createIllustrationMessageHost } from '../src/host/illustration-message-host.js';
import { createReadingProgress, normalizeReadingData, truncateReadingData, textHash } from '../src/visual/igs-ui/reading-progress.js';
import { createRewindController, REWIND_PENDING_KEY } from '../src/visual/igs-ui/rewind.js';

// 存档重来：存档位字段迁移、截断进度、走酒馆 /branch-create、失败不改动、新分支里定位存档页。
function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (key) => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: (key) => map.delete(key),
        map,
    };
}

function makeEnv({ run, chat, chatId = 'main-chat' } = {}) {
    const store = memoryStorage();
    const env = { chatId, calls: [] };
    const ctx = {
        chat: chat || [{ swipe_id: 0 }, { swipe_id: 0 }, { swipe_id: 1, swipes: ['a', 'b'] }, { swipe_id: 0 }],
        executeSlashCommandsWithOptions: run || (async (command) => { env.calls.push(command); env.chatId = 'main-chat - Branch #1'; return { pipe: 'main-chat - Branch #1' }; }),
    };
    const progress = createReadingProgress({ getChatId: () => env.chatId, storage: () => store });
    const controller = createRewindController({ getContext: () => ctx, getChatId: () => env.chatId, storage: () => store, progress });
    return { env, store, ctx, progress, controller };
}

test('存档位迁移：旧存档没有 swipe 也能读，新字段保留并过滤非法值', () => {
    const data = normalizeReadingData({
        slots: [
            { key: 'old', id: 3, page: 1, at: 5, name: '旧档', thumb: '/a.png', place: '教室' },
            { key: 'new', id: 6, page: 0, at: 9, swipe: 2, hash: 'h', thumb: 'user/images/x.png' },
            { key: 'bad', id: 7, page: 0, at: 9, swipe: -1 },
        ],
    });
    const by = Object.fromEntries(data.slots.map((slot) => [slot.key, slot]));
    assert.equal(by.old.swipe, null);
    assert.equal(by.old.place, '教室');
    assert.equal(by.new.swipe, 2);
    assert.equal(by.new.thumb, 'user/images/x.png');
    assert.equal(by.bad.swipe, null);
});

test('重来带 swipe：该楼当前版本一致才建分支，不一致不改动', async () => {
    const same = makeEnv();
    assert.equal((await same.controller.rewind({ id: 2, page: 0, swipe: 1 })).ok, true);
    assert.deepEqual(same.env.calls, ['/branch-create 2']);

    const diff = makeEnv();
    const result = await diff.controller.rewind({ id: 2, page: 0, swipe: 0 });
    assert.deepEqual([result.ok, result.reason], [false, 'swipe-changed']);
    assert.deepEqual(diff.env.calls, []);
    assert.equal(diff.store.getItem(REWIND_PENDING_KEY), null);
});

function withBranchApi(env, api) {
    const store = memoryStorage();
    const ctx = {
        chat: [{ swipe_id: 0 }, { swipe_id: 1, swipes: ['a', 'b', 'c'] }],
        executeSlashCommandsWithOptions: async (command) => { env.calls.push(command); env.chatId = 'main-chat - Branch #1'; return { pipe: 'main-chat - Branch #1' }; },
    };
    const progress = createReadingProgress({ getChatId: () => env.chatId, storage: () => store });
    const controller = createRewindController({ getContext: () => ctx, getChatId: () => env.chatId, storage: () => store, progress, loadBranchApi: api });
    return { store, progress, controller };
}
