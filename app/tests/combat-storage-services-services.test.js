// 战斗服务：refreshLife / refreshGrowth 合并、通知抑制、共享表客户端、统计，与 v0.39 原包同输入对比。
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import test from 'node:test';
import { loadV039 } from './helpers/combat-diff-fixtures.js';
import { createCountingStorage, createMockHost } from './helpers/combat-mock-host-services.js';

globalThis.window = globalThis.window || { IGS_AUTO_BOOTSTRAP: false };
globalThis.window.IGS_AUTO_BOOTSTRAP = false;

// combat-settings.js 由另一窗口交付；尚未落盘时用加载器钩子临时顶替，落盘后自动使用真实文件。
const settingsPath = new URL('../src/visual/igs-ui/combat-settings.js', import.meta.url);
if (!existsSync(settingsPath)) {
    const hooks = `export async function resolve(specifier, context, next) {
        if (specifier.endsWith('/visual/igs-ui/combat-settings.js')) return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
        return next(specifier, context);
    }
    export async function load(url, context, next) {
        if (url.endsWith('/visual/igs-ui/combat-settings.js')) {
            return { format: 'module', shortCircuit: true, source: 'export const normalizeCombatExpansionSettings = (raw) => ({ enabled: raw?.enabled === true, difficulty: raw?.difficulty || "normal", reportDetail: raw?.reportDetail || "normal" });' };
        }
        return next(url, context);
    }`;
    register(`data:text/javascript,${encodeURIComponent(hooks)}`);
}
const { createCombatServices } = await import('../src/core/combat-services.js');
const original = loadV039('src/core/combat-services.js');
const skip = original ? false : '原包不在本机';

const chat = [{ is_user: true, mes: '你好' }, { is_user: false, mes: '她笑了笑。', swipe_id: 0 }];

// 同一套输入构造新旧两个服务实例（各自独立的宿主与存储）
function build(factory, { chatId = 'chat-a' } = {}) {
    const host = createMockHost({ supportCallbacks: true });
    const storage = createCountingStorage();
    const state = { chatId };
    const global = { AutoCardUpdaterAPI: host.api, SillyTavern: { getContext: () => ({ chat }) } };
    const services = factory.createCombatServices({
        global, storage, getChatId: () => state.chatId, getUserName: () => '我',
        getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
        send: async () => ({ ok: true, messageId: 2 }),
    });
    return { host, storage, state, global, services };
}

async function ready(factory) {
    const env = build(factory);
    const ensured = await env.services.ensureTables();
    assert.equal(ensured.ok, true, JSON.stringify(ensured));
    return env;
}

test('refreshLife 连续写请求合并：表读取次数与实际执行次数少于原包，结果一致', { skip }, async () => {
    const oldEnv = await ready(original);
    const newEnv = await ready({ createCombatServices });
    const oldBase = oldEnv.host.calls.exportTableAsJson;
    const newBase = newEnv.host.calls.exportTableAsJson;
    const burst = 10;
    const run = (env) => Promise.all(Array.from({ length: burst }, (_, index) => env.services.refreshLife({ write: true, messageIds: [index] })));
    const oldResults = await run(oldEnv);
    const newResults = await run(newEnv);
    assert.deepEqual(newResults.map((item) => item.ok), oldResults.map((item) => item.ok));
    const oldReads = oldEnv.host.calls.exportTableAsJson - oldBase;
    const newReads = newEnv.host.calls.exportTableAsJson - newBase;
    const stats = newEnv.services.getStats();
    console.log('refreshLife 突发', burst, '次：表读取 原包/新实现', oldReads, newReads, '实际执行', burst, stats.refreshLifeRuns, '合并', stats.refreshLifeCoalesced);
    assert.ok(newReads < oldReads, `${newReads} < ${oldReads}`);
    assert.equal(stats.refreshLifeRuns, 1, '同步突发合并成一次执行');
    assert.equal(stats.refreshLifeCoalesced, burst - 1);
});

test('refreshLife 只读请求：表版本与楼层没变时直接用缓存；write 请求不被只读吞掉', { skip }, async () => {
    const env = await ready({ createCombatServices });
    await env.services.refreshLife({ write: true });
    const before = env.services.getStats();
    const exportsBefore = env.host.calls.exportTableAsJson;
    for (let i = 0; i < 5; i += 1) assert.equal((await env.services.refreshLife()).ok, true);
    const after = env.services.getStats();
    assert.equal(after.refreshLifeRuns, before.refreshLifeRuns, '缓存命中不执行');
    assert.equal(after.refreshLifeCacheHits - before.refreshLifeCacheHits, 5);
    assert.equal(env.host.calls.exportTableAsJson, exportsBefore);
    // 表更新事件 -> 版本变化 -> 只读请求重新执行
    env.host.fireTableUpdated();
    await env.services.refreshLife();
    assert.equal(env.services.getStats().refreshLifeRuns, before.refreshLifeRuns + 1);
    // 排队中的只读请求被后到的 write 请求升级为 write
    env.host.fireTableUpdated();
    const first = env.services.refreshLife();
    const readOnly = env.services.refreshLife();
    const writer = env.services.refreshLife({ write: true, messageIds: [1] });
    const merged = env.services.refreshLife({ write: false, messageIds: [2] });
    assert.equal(await writer, await readOnly);
    assert.equal(await merged, await writer);
    await first;
});

test('refreshGrowth 连续触发：执行次数合并，监听者只在状态变化时被通知', { skip }, async () => {
    const oldEnv = await ready(original);
    const newEnv = await ready({ createCombatServices });
    const oldNotices = [];
    const newNotices = [];
    oldEnv.services.onGrowthUpdated((payload) => oldNotices.push(payload));
    newEnv.services.onGrowthUpdated((payload) => newNotices.push(payload));
    const oldBase = oldEnv.host.calls.exportTableAsJson;
    const newBase = newEnv.host.calls.exportTableAsJson;
    const rounds = 6;
    for (let i = 0; i < rounds; i += 1) {
        await oldEnv.services.refreshGrowth();
        await newEnv.services.refreshGrowth();
    }
    assert.equal(oldNotices.length, rounds);
    assert.equal(newNotices.length, 1, '无变化只通知第一次');
    // 内部缓存仍然更新
    assert.deepEqual(newEnv.services.getGrowth().names, oldEnv.services.getGrowth().names);
    assert.deepEqual(newEnv.services.getGrowth().growth, oldEnv.services.getGrowth().growth);
    const stats = newEnv.services.getStats();
    assert.equal(stats.notifies, 1);
    assert.equal(stats.notifiesSuppressed, rounds - 1);
    // 同步突发：原包会多跑一轮，新实现不会比原包更多
    const oldBurstBase = oldEnv.host.calls.exportTableAsJson;
    const newBurstBase = newEnv.host.calls.exportTableAsJson;
    const burstOld = Array.from({ length: 8 }, () => oldEnv.services.refreshGrowth());
    const burstNew = Array.from({ length: 8 }, () => newEnv.services.refreshGrowth());
    await Promise.all([...burstOld, ...burstNew]);
    const oldReads = oldEnv.host.calls.exportTableAsJson - oldBurstBase;
    const newReads = newEnv.host.calls.exportTableAsJson - newBurstBase;
    console.log('refreshGrowth 先 6 次串行再 8 次并发：表读取 原包/新实现', oldEnv.host.calls.exportTableAsJson - oldBase, newEnv.host.calls.exportTableAsJson - newBase, '并发段', oldReads, newReads,
        '执行', stats.refreshGrowthRuns, '->', newEnv.services.getStats().refreshGrowthRuns, '通知', oldNotices.length, newNotices.length);
    assert.ok(newReads <= oldReads);
    // 切换聊天后签名重置，再次刷新要通知
    newEnv.services.resetChat();
    await newEnv.services.refreshGrowth();
    assert.equal(newNotices.length, 2);
});

test('共享表客户端：api 变化时重建并 dispose 旧客户端，resetChat 使缓存失效', { skip }, async () => {
    const env = await ready({ createCombatServices });
    await env.services.refreshGrowth();
    assert.ok(env.host.callbacks.size >= 1, '客户端订阅了表更新');
    const subscribed = env.host.callbacks.size;
    const exportsBefore = env.host.calls.exportTableAsJson;
    env.services.resetChat();
    await env.services.refreshLife();
    assert.ok(env.host.calls.exportTableAsJson > exportsBefore, 'resetChat 后缓存失效，必须重读');
    // 换一个新的宿主 api：旧客户端被释放（取消订阅）
    const another = createMockHost({ supportCallbacks: true });
    env.global.AutoCardUpdaterAPI = another.api;
    env.services.getLedger();
    assert.equal(env.host.callbacks.size, 0, `旧客户端取消订阅（原 ${subscribed}）`);
    assert.ok(env.services.getStats().tableExports >= 1, '累计导出次数含已释放的旧客户端');
});

test('getStats 字段齐全，既有导出名不变', { skip }, async () => {
    const env = await ready({ createCombatServices });
    const oldEnv = await ready(original);
    const oldNames = Object.keys(oldEnv.services).sort();
    const newNames = Object.keys(env.services).sort();
    assert.deepEqual(newNames.filter((name) => name !== 'getStats'), oldNames);
    const stats = env.services.getStats();
    for (const key of ['tableExports', 'refreshLifeRuns', 'refreshGrowthRuns', 'notifies', 'sessionWrites']) assert.equal(typeof stats[key], 'number', key);
});

test('写入表的行与原包一致（建表、主角档案之外不多写不少写）', { skip }, async () => {
    const oldEnv = await ready(original);
    const newEnv = await ready({ createCombatServices });
    await Promise.all([oldEnv.services.refreshLife({ write: true }), oldEnv.services.refreshGrowth()]);
    await Promise.all([newEnv.services.refreshLife({ write: true }), newEnv.services.refreshGrowth()]);
    assert.deepEqual(newEnv.host.sheets, oldEnv.host.sheets);
    assert.deepEqual(newEnv.host.calls.insertRow, oldEnv.host.calls.insertRow);
    assert.deepEqual(newEnv.storage.snapshot(), oldEnv.storage.snapshot());
});
