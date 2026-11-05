import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function setup({ people, register = 'auto' } = {}) {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
    };
    const ctx = {
        name1: '阿明', name2: '多人卡', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {},
        eventSource, eventTypes: T, getCurrentChatId: () => 'chat-t', setExtensionPrompt() {}, saveMetadata() {},
    };
    const rows = [];
    const tables = { ok: true, version: 0, read: () => ({ ok: true, stats: rows.slice() }), append(r) { rows.push(...r); this.version += 1; return Promise.resolve({ ok: true }); }, ensure: () => Promise.resolve({ ok: true }) };
    const rt = createStatsRuntime({ getContext: () => ctx, readSettings: () => ({ enabled: true, register }), statsTables: () => tables, tablePeople: () => people });
    rt.sync();
    rt.enableForChat();
    const say = (text) => {
        eventSource.emit('gs', 'normal', {}, false);
        ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
        eventSource.emit('ge', ctx.chat.length - 1);
        return ctx.chat.length - 1;
    };
    return { rt, say };
}

test('自动登记：表格里的人物正文没提到也建档，关系从 0 起不采用表格数字，主角与用户名除外', () => {
    const { rt, say } = setup({ people: ['雪乃', '小林', '阿明'] });
    say('旁白。');
    const chars = rt.getState().characters;
    assert.equal(chars.雪乃.dims.好感, 0);
    assert.equal(chars.小林.dims.好感, 0);
    assert.equal(chars.阿明, undefined);
});

test('自动登记：表格人物的好感标签直接生效，不当成路人丢掉', () => {
    const { rt, say } = setup({ people: ['小林'] });
    say('她笑了。[igs-stat:favor|小林|开心]');
    assert.ok(rt.getState().characters.小林.dims.好感 >= 1);
});

test('仅手动档不从表格登记', () => {
    const { rt, say } = setup({ people: ['小林'], register: 'manual' });
    say('她笑了。[igs-stat:favor|小林|开心]');
    assert.equal(rt.getState().characters.小林, undefined);
});
