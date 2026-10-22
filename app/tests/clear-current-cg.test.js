import { createAutoIllustrationService } from './helpers/media-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryIllustrationStore, floorKeyOf } from '../src/media/illustration-store.js';

import { clearCurrentCg } from '../src/generated-images/illustration/clear-current-cg.js';

const current = { identity: { chatId: 'chat-1', messageId: 8, swipeId: 2 }, slot: 1, url: 'blob:cg-1' };

test('gate:illustration:clear-current-cg-removes-only-current-and-forces-render', async () => {
    const images = new Map([['chat-1|8|2|1', 'blob:cg-1'], ['chat-1|8|2|2', 'blob:cg-2']]);
    const calls = [];
    const result = await clearCurrentCg({
        ...current,
        clear: async ({ chatId, messageId, swipeId, slot }) => {
            calls.push('clear');
            images.delete(`${chatId}|${messageId}|${swipeId}|${slot}`);
            return { ok: true };
        },
        forceRender: async (options) => { calls.push(['render', options]); },
    });
    assert.deepEqual(calls, ['clear', ['render', { force: true, reason: 'clear-current-cg' }]]);
    assert.equal(images.has('chat-1|8|2|1'), false);
    assert.equal(images.get('chat-1|8|2|2'), 'blob:cg-2');
    assert.deepEqual(result, { ok: true, reason: 'cleared', removed: true, rendered: true });
});

test('gate:illustration:clear-current-cg-no-current-is-stable', async () => {
    let calls = 0;
    const result = await clearCurrentCg({ identity: current.identity, slot: 1, url: '', clear: async () => { calls += 1; }, forceRender: async () => { calls += 1; } });
    assert.equal(calls, 0);
    assert.equal(result.reason, 'no-current-cg');
});
