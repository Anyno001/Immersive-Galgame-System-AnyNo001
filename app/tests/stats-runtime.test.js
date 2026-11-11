import { createStatsState } from '../src/scene/stats/stat-state.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATS_PROMPT_KEY, createStatsRuntime } from '../src/core/stats-runtime.js';
import { STATS_METADATA_KEY } from '../src/scene/stats/stat-persist.js';
import { serializeLedger } from '../src/scene/stats/stat-persist.js';
import { createStatsLedger } from '../src/scene/stats/stat-ledger.js';
import { ledgerKey } from '../src/scene/stats/stat-ledger.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function fakeHost() {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
        count() { let k = 0; for (const s of handlers.values()) k += s.size; return k; },
    };
    let saves = 0;
    const ctx = {
        name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {},
        eventSource, eventTypes: T, getCurrentChatId: () => 'chat-1',
        setExtensionPrompt(key, value, position) { this.extensionPrompts[key] = { value, position }; },
        saveMetadata() { saves += 1; },
    };
    return { ctx, eventSource, saves: () => saves };
}

// 内存版数值日志表：和宿主 statsTables 同形，read 返回 { ok, stats }，append 追加，version 随写入递增。
function fakeTables({ exists = true } = {}) {
    const t = { rows: exists ? [] : null, version: 0, reads: 0 };
    t.api = () => ({
        ok: true,
        get version() { return t.version; },
        read() { t.reads += 1; return { ok: true, stats: t.rows ? t.rows.slice() : undefined }; },
        append(records) { t.rows.push(...records); t.version += 1; return Promise.resolve({ ok: true }); },
        ensure() { t.rows = t.rows || []; return Promise.resolve({ ok: true }); },
    });
    return t;
}

function setup(enabled = true, extra = {}, tableOpts = {}) {
    const host = fakeHost();
    // 设置按引用缓存规范化结果，所以改设置要换新对象，不能原地改。
    const holder = { cur: { enabled, ...extra } };
    const set = (patch) => { holder.cur = { ...holder.cur, ...patch }; };
    const tables = fakeTables(tableOpts);
    const make = (over = {}) => createStatsRuntime({ getContext: () => host.ctx, readSettings: () => holder.cur, statsTables: tables.api, ...over });
    const rt = make();
    rt.sync();
    return { host, rt, set, tables, make };
}

function reply(host, text, swipeId = 0) {
    host.ctx.chat.push({ is_user: false, mes: text, swipe_id: swipeId });
    return host.ctx.chat.length - 1;
}

function generate(host, text, type = 'normal') {
    host.eventSource.emit('gs', type, {}, false);
    const injected = host.ctx.extensionPrompts[STATS_PROMPT_KEY]?.value || '';
    const id = type === 'continue' ? host.ctx.chat.length - 1 : reply(host, text);
    if (type === 'continue') host.ctx.chat[id].mes += text;
    host.eventSource.emit('ge', id);
    return { id, injected };
}

const favor = (rt) => rt.getState()?.characters.小雪?.dims.好感;

test('总开关关闭时不挂任何监听；打开后挂上，再关掉全部解绑（易错点 H1）', () => {
    const { host, rt, set } = setup(false);
    assert.equal(host.eventSource.count(), 0);
    set({ enabled: true });
    rt.sync();
    assert.ok(host.eventSource.count() > 0);
    set({ enabled: false });
    rt.sync();
    assert.equal(host.eventSource.count(), 0);
});

test('本聊天未启用时不注入、不结算（易错点 H2）', () => {
    const { host, rt, tables } = setup();
    const { injected } = generate(host, '[igs-stat:favor|小雪|开心]');
    assert.equal(injected, '');
    assert.equal(rt.getState(), null);
    assert.equal(host.ctx.chatMetadata[STATS_METADATA_KEY], undefined);
    assert.equal(tables.rows.length, 0);
});

test('正常发送：生成前注入、结束后清除并结算一次，差分写进数据库表（易错点 A3/A6/B2）', async () => {
    const { host, rt, tables } = setup(true, { favorMode: 'hard' });
    rt.enableForChat();
    const { injected } = generate(host, '她笑了。[igs-stat:favor|小雪|开心]');
    assert.match(injected, /主角状态/);
    assert.equal(host.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined);
    assert.ok(favor(rt) >= 1);
    await rt.whenSaved();
    assert.ok(tables.rows.some((r) => r.type === 'init'));
    assert.ok(tables.rows.some((r) => r.type === 'floor'));
    assert.ok(tables.rows.some((r) => r.payload.key === 'chat:enabled' && r.payload.value === true));
    assert.equal(host.ctx.chatMetadata[STATS_METADATA_KEY], undefined);
    const before = favor(rt);
    host.eventSource.emit('ge', 1);
    assert.equal(favor(rt), before);
});

test('dryRun、quiet、代写生成不注入、不结算（易错点 A1）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    for (const [type, dry] of [['normal', true], ['quiet', false], ['impersonate', false]]) {
        host.eventSource.emit('gs', type, {}, dry);
        assert.equal(host.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined, type);
        reply(host, '[igs-stat:favor|小雪|感动]');
        host.eventSource.emit('ge');
    }
    assert.equal(rt.getState().characters.小雪, undefined);
});

test('继续生成按原种子对全文重算，标签不重复计入（易错点 A2）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|感动]');
    const first = favor(rt);
    generate(host, '她又笑了。', 'continue');
    assert.equal(favor(rt), first);
});

test('新 swipe 从上一楼状态重掷；切回旧 swipe 读取已存结果；删楼回退（易错点 B1/B3）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    const { id } = generate(host, '[igs-stat:favor|小雪|受伤]');
    assert.equal(favor(rt), -15);
    host.ctx.chat[id] = { is_user: false, mes: '[igs-stat:favor|小雪|失望]', swipe_id: 1 };
    host.eventSource.emit('sw', id);
    host.eventSource.emit('gs', 'swipe', {}, false);
    host.eventSource.emit('ge', id);
    assert.equal(favor(rt), -3);
    host.ctx.chat[id] = { is_user: false, mes: '[igs-stat:favor|小雪|受伤]', swipe_id: 0 };
    host.eventSource.emit('sw', id);
    assert.equal(favor(rt), -15);
    host.ctx.chat.pop();
    host.eventSource.emit('del', id);
    assert.equal(rt.getState().characters.小雪, undefined);
});

test('编辑 AI 楼正文后只重算该楼（易错点 A5）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    const { id } = generate(host, '[igs-stat:favor|小雪|开心]');
    host.ctx.chat[id].mes = '[igs-stat:favor|小雪|受伤]';
    host.eventSource.emit('upd', id);
    assert.equal(favor(rt), -15);
});

test('换聊天后从表里读回；旧版存档来自更新版本时拒绝导入且不覆盖', async () => {
    const { host, rt, tables, make } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    await rt.whenSaved();
    host.eventSource.emit('chat');
    assert.equal(rt.isChatEnabled(), true);
    assert.equal(favor(rt), -15);
    const fresh = fakeTables();
    const other = make({ statsTables: fresh.api });
    host.ctx.chatMetadata[STATS_METADATA_KEY] = { version: 99 };
    other.sync();
    assert.equal(other.enableForChat().reason, 'stats-save-newer');
    assert.deepEqual(host.ctx.chatMetadata[STATS_METADATA_KEY], { version: 99 });
    assert.equal(fresh.rows.length, 0);
    assert.ok(other.getDiagnostics().some((d) => d.code === 'stats-save-newer'));
    assert.ok(tables.rows.length > 0);
});

test('旧存档没有 heroSlots：按已学的非剧情技能回填，值 ≥ 60 进擅长格，其余进比较擅长格', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(host, '好。');
    rt.heroOp('pick', '', { skills: { 烹饪: 60, 学习: 60, 唱歌: 30, 舞蹈: 30 } });
    assert.equal(rt.getCatalog().heroSlots.strong1 !== undefined, true);
    const slots = rt.archive().heroSlots;
    assert.deepEqual(Object.values(slots).sort(), ['唱歌', '学习', '烹饪', '舞蹈']);
    assert.ok(['烹饪', '学习'].includes(slots.strong1) && ['烹饪', '学习'].includes(slots.strong2));
    assert.ok(['唱歌', '舞蹈'].includes(slots.good1) && ['唱歌', '舞蹈'].includes(slots.good2));
});

test('旧存档没有 heroSlots：删除、降档后其余技能不换格', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(host, '好。');
    rt.heroOp('pick', '', { skills: { 烹饪: 60, 唱歌: 45, 舞蹈: 40, 学习: 30 } });
    rt.getCatalog().heroSlots = null;
    const before = { ...rt.archive().heroSlots };
    assert.equal(rt.skillOp('remove', '唱歌').ok, true);
    const after = rt.archive().heroSlots;
    for (const [slot, name] of Object.entries(before)) assert.equal(after[slot], name === '唱歌' ? undefined : name, slot);
    // 降档同理：烹饪降到入门后仍留在擅长格，不被回填挪到比较擅长格。
    rt.getCatalog().heroSlots = null;
    const kept = { ...rt.archive().heroSlots };
    assert.equal(rt.heroOp('edit', '烹饪', { tier: '入门' }).ok, true);
    assert.deepEqual(rt.archive().heroSlots, kept);
});

test('结算种子由聊天、楼序号、swipe 决定：两个独立运行得到同样的结算', () => {
    const run = () => {
        const { host, rt } = setup(true, { ruleset: 'dnd5e' });
        rt.enableForChat();
        host.ctx.chat.push({ is_user: true, mes: '我去晨跑' });
        const { id } = generate(host, '跑完了。[igs-stat:stamina|重]');
        return rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0)).seed;
    };
    assert.equal(run(), run());
});

