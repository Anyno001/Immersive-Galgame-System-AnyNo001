import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', MESSAGE_EDITED: 'edit', CHAT_CHANGED: 'cc' };

function setup() {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
    };
    const ctx = {
        name2: '旁白', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {},
        eventSource, eventTypes: T, getCurrentChatId: () => 'chat-1',
        setExtensionPrompt(key, value, position) { this.extensionPrompts[key] = { value, position }; },
        saveMetadata() {},
    };
    const t = { rows: [], version: 0 };
    const api = () => ({ ok: true, get version() { return t.version; }, read() { return { ok: true, stats: t.rows.slice() }; }, append(r) { t.rows.push(...r); t.version += 1; return Promise.resolve({ ok: true }); }, ensure() { return Promise.resolve({ ok: true }); } });
    const make = () => createStatsRuntime({ getContext: () => ctx, readSettings: () => ({ enabled: true }), statsTables: api, resolveCharacter: (name, state) => (['黑衣人', '沈砚'].includes(name) || Object.hasOwn(state.characters, name) ? name : null) });
    const rt = make();
    rt.sync();
    const say = (text) => { eventSource.emit('gs', 'normal', {}, false); ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 }); eventSource.emit('ge', ctx.chat.length - 1); };
    return { rt, say, make, eventSource };
}

const favorOf = (rt, name) => rt.getState().characters[name]?.dims.信任;

test('改名：档案换到新名下，之后正文写旧名仍记到此人；重新读档后保持', async () => {
    const { rt, say, make } = setup();
    rt.enableForChat();
    say('[igs-stat:trust|黑衣人|上升]');
    const before = favorOf(rt, '黑衣人');
    assert.ok(before > 0);
    rt.relationOp('note', '黑衣人', { text: '有点在意' });
    assert.equal(rt.relationOp('rename', '黑衣人', { to: '沈砚' }).ok, true);
    assert.equal(favorOf(rt, '黑衣人'), undefined);
    assert.equal(favorOf(rt, '沈砚'), before);
    assert.equal(rt.archive().heroNotes.沈砚, '有点在意');
    say('[igs-stat:trust|黑衣人|上升]');
    assert.equal(favorOf(rt, '黑衣人'), undefined);
    assert.ok(favorOf(rt, '沈砚') > before);
    await new Promise((r) => setTimeout(r, 10));
    const again = make();
    again.sync();
    assert.equal(favorOf(again, '黑衣人'), undefined);
    assert.equal(favorOf(again, '沈砚'), favorOf(rt, '沈砚'));
    assert.deepEqual(again.archive().renames, { 黑衣人: '沈砚' });
});

test('改名：新名已有档案时先拒绝，确认合并后两份并成一人；移除曾用名后旧名不再认', async () => {
    const { rt, say } = setup();
    rt.enableForChat();
    say('[igs-stat:trust|黑衣人|上升]');
    say('[igs-stat:trust|沈砚|上升]');
    const sum = favorOf(rt, '黑衣人') + favorOf(rt, '沈砚');
    assert.equal(rt.relationOp('rename', '黑衣人', { to: '沈砚' }).reason, 'stats-rename-exists');
    assert.equal(rt.relationOp('rename', '黑衣人', { to: '沈砚', merge: true }).ok, true);
    assert.equal(favorOf(rt, '沈砚'), sum);
    assert.equal(favorOf(rt, '黑衣人'), undefined);
    rt.relationOp('rename-drop', '黑衣人', {});
    say('[igs-stat:trust|黑衣人|上升]');
    assert.ok(favorOf(rt, '黑衣人') > 0);
});
