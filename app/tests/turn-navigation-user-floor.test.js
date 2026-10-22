import test from 'node:test';
import assert from 'node:assert/strict';

import { createTavernHelperAdapter } from '../src/host/tavern-helper-adapter.js';
import { isUserFloorNode } from '../src/host/chat-stream-observer.js';

function createHost(chat) {
    return {
        // 定时器不触发：模拟真机里缓存没按时作废的情况。
        setTimeout: () => 0,
        TavernHelper: {
            getLastMessageId: () => chat.length - 1,
            getChatMessages: (range, options = {}) => {
                const [start, end] = String(range).split('-').map(Number);
                return chat.slice(start, (end ?? start) + 1)
                    .filter((message) => (options.hide_state === 'hidden' ? message.is_hidden : true));
            },
        },
        SillyTavern: {
            getContext: () => ({
                chat: chat.map((message) => ({ is_user: message.role === 'user', mes: message.message })),
            }),
        },
    };
}

test('下一轮：新楼写入后缓存当场作废，用户楼不算下一轮', async () => {
    const chat = [
        { message_id: 0, role: 'assistant', is_hidden: false, message: '开场' },
        { message_id: 1, role: 'user', is_hidden: false, message: '你好' },
        { message_id: 2, role: 'assistant', is_hidden: false, message: '回复' },
    ];
    const adapter = createTavernHelperAdapter(createHost(chat));
    assert.equal(await adapter.getAdjacentMessage(2, 1), null);
    chat.push({ message_id: 3, role: 'user', is_hidden: false, message: '继续' });
    assert.equal(await adapter.getAdjacentMessage(2, 1), null, '只有用户楼时仍是没有下一轮');
    chat.push({ message_id: 4, role: 'assistant', is_hidden: false, message: '新回复' });
    assert.equal((await adapter.getAdjacentMessage(2, 1)).id, 4);
    assert.equal((await adapter.getAdjacentMessage(4, -1)).id, 2);
    assert.equal((await adapter.getAdjacentMessage(3, 1)).id, 4, '停在用户楼也能找到下一个 AI 楼');
});
