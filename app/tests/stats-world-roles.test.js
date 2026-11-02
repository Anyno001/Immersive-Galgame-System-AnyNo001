import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createWorldRoles } from '../src/scene/stats/stat-world-roles.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function setup({ lookup, register = 'auto' } = {}) {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
    };
    const ctx = {
        name1: '阿明', name2: '多人世界书卡', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {},
        eventSource, eventTypes: T, getCurrentChatId: () => 'chat-w', setExtensionPrompt() {}, saveMetadata() {},
    };
    const asked = [];
    const worldRoles = createWorldRoles({ lookup: (name) => { asked.push(name); return lookup(name); } });
    const rows = [];
    const tables = { ok: true, version: 0, read: () => ({ ok: true, stats: rows.slice() }), append(r) { rows.push(...r); this.version += 1; return Promise.resolve({ ok: true }); }, ensure: () => Promise.resolve({ ok: true }) };
    const rt = createStatsRuntime({ getContext: () => ctx, readSettings: () => ({ enabled: true, register }), statsTables: () => tables, worldRoles });
    rt.sync();
    rt.enableForChat();
    const say = (text) => {
        eventSource.emit('gs', 'normal', {}, false);
        ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
        eventSource.emit('ge', ctx.chat.length - 1);
        return ctx.chat.length - 1;
    };
    return { rt, ctx, say, asked, worldRoles };
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 5));
const favorOf = (rt, name) => rt.getState().characters[name]?.dims.好感;

test('世界书缓存已确认的角色：同一楼直接登记，不再查询', async () => {
    const { rt, say, asked, worldRoles } = setup({ lookup: async () => true });
    await worldRoles.confirm(['雪乃'], { chatId: 'chat-w' });
    asked.length = 0;
    say('她笑了。[igs-stat:favor|雪乃|开心]');
    assert.ok(favorOf(rt, '雪乃') >= 1);
    await settled();
    assert.deepEqual(asked, []);
});

test('首次未命中：异步确认后补算最新楼，第一次出场的好感变化也记上；记一条登记诊断', async () => {
    const { rt, ctx, say, asked } = setup({ lookup: async (name) => name === '雪乃' });
    const id = say('她笑了。[igs-stat:favor|雪乃|开心]');
    assert.equal(favorOf(rt, '雪乃'), undefined);
    await settled();
    assert.ok(favorOf(rt, '雪乃') >= 1);
    assert.deepEqual(asked, ['雪乃']);
    assert.equal(ctx.chat.length - 1, id);
    assert.ok(rt.getDiagnostics().some((d) => d.code === 'stats-world-role-registered' && d.name === '雪乃'));
    say('她又笑了。[igs-stat:favor|雪乃|开心]');
    assert.deepEqual(asked, ['雪乃']);
});

test('查不到的名字只查一次，记一条查无诊断，好感不动', async () => {
    const { rt, say, asked } = setup({ lookup: async () => false });
    say('路人经过。[igs-stat:favor|路人乙|开心]');
    await settled();
    say('路人又经过。[igs-stat:favor|路人乙|开心]');
    await settled();
    assert.deepEqual(asked, ['路人乙']);
    assert.equal(favorOf(rt, '路人乙'), undefined);
    assert.ok(rt.getDiagnostics().some((d) => d.code === 'stats-world-role-missing' && d.name === '路人乙'));
});

test('仅手动档不登记，也不查询', async () => {
    const { rt, say, asked } = setup({ lookup: async () => true, register: 'manual' });
    say('她笑了。[igs-stat:favor|雪乃|开心]');
    await settled();
    assert.deepEqual(asked, []);
    assert.equal(favorOf(rt, '雪乃'), undefined);
});

test('主角、玩家名、系统与旁白不当作世界书角色', async () => {
    const { say, asked } = setup({ lookup: async () => true });
    say('[igs-stat:favor|系统|开心][igs-stat:favor|旁白|开心][igs-stat:favor|阿明|开心][igs-stat:favor|主角|开心][igs-stat:favor|<user>|开心]');
    await settled();
    assert.deepEqual(asked, []);
});

test('确认返回时已不是最新楼：只记缓存，不回溯旧楼，下一楼照常登记', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { rt, say } = setup({ lookup: async () => { await gate; return true; } });
    say('她笑了。[igs-stat:favor|雪乃|开心]');
    say('旁白。');
    release();
    await settled();
    assert.equal(favorOf(rt, '雪乃'), undefined);
    say('她又笑了。[igs-stat:favor|雪乃|开心]');
    assert.ok(favorOf(rt, '雪乃') >= 1);
});

test('读不到世界书（返回 null）时不记入已查，最多再试一次', async () => {
    const calls = [];
    const worldRoles = createWorldRoles({ lookup: async (name) => { calls.push(name); return null; } });
    assert.deepEqual(await worldRoles.confirm(['雪乃'], { chatId: 'a' }), { found: [], missing: [] });
    assert.deepEqual(await worldRoles.confirm(['雪乃'], { chatId: 'a' }), { found: [], missing: ['雪乃'] });
    await worldRoles.confirm(['雪乃'], { chatId: 'a' });
    assert.equal(calls.length, 2);
    await worldRoles.confirm(['雪乃'], { chatId: 'b' });
    assert.equal(calls.length, 3);
});
