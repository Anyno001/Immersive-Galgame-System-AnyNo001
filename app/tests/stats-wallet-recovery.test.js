import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { initRecord } from '../src/scene/stats/stat-log.js';
import { createMockHost } from './helpers/combat-mock-host-services.js';

async function fixture(t, { ready = false } = {}) {
    const db = createMockHost({ supportCallbacks: true });
    const table = createCombatTables({ api: db.api });
    assert.equal((await table.ensure()).ok, true);
    const records = [initRecord(createStatsState({ money: 3000 })),
        { id: 'chat-enabled', type: 'chat', character: '主角', anchor: null, createdAt: 1, change: '启用', payload: { key: 'chat:enabled', value: true } }];
    assert.equal((await table.append('stats', records)).ok, true);
    const callbacks = new Map();
    const ctx = { name1: '主角', chat: [], chatMetadata: {}, extensionPrompts: {}, getCurrentChatId: () => 'wallet-test',
        eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' },
        eventSource: { on(n, fn) { callbacks.set(n, fn); }, removeListener(n) { callbacks.delete(n); } } };
    const global = { SillyTavern: { getContext: () => ctx }, ...(ready ? { AutoCardUpdaterAPI: db.api } : {}) };
    const combat = createCombatServices({ global, getChatId: () => 'wallet-test', getUserName: () => '主角',
        getReaderSettings: () => ({ combatExpansion: { enabled: true } }) });
    const runtime = createStatsRuntime({ getContext: () => ctx, readSettings: () => ({ enabled: true }), statsTables: combat.statsTables });
    t.after(() => { runtime.destroy(); combat.resetChat(); });
    runtime.sync();
    return { db, global, runtime, combat, callbacks };
}

test('数据库比数值模块晚就绪：已挂聊天监听且曾报 unsupported，钱包读取仍能恢复原有 3000，不写存档', async (t) => {
    const f = await fixture(t);
    assert.ok(f.callbacks.size > 0);
    assert.equal(f.runtime.chatStatus().blocked, 'combat-table-host-unsupported');
    assert.equal(f.runtime.walletMoney(), 0);
    const before = f.db.calls.insertRow;
    f.global.AutoCardUpdaterAPI = f.db.api;
    assert.equal(f.runtime.walletMoney(), 3000);
    assert.equal(f.runtime.chatStatus().blocked, '');
    assert.equal(f.runtime.isChatEnabled(), true);
    assert.equal(f.db.calls.insertRow, before);
});

test('用户改表后版本更新：钱包重读新金额；未变化时继续复用缓存', async (t) => {
    const f = await fixture(t, { ready: true });
    assert.equal(f.runtime.walletMoney(), 3000);
    const version = f.combat.statsTables().version;
    const sheet = Object.values(f.db.sheets).find((s) => s.name === 'IGS数值·日志');
    const columns = sheet.content[0];
    const row = sheet.content.find((r) => r[columns.indexOf('类型')] === 'init');
    const jsonColumn = columns.indexOf('载荷JSON');
    const payload = JSON.parse(row[jsonColumn]);
    payload.state.protagonist.bars.money = 4500;
    row[jsonColumn] = JSON.stringify(payload);
    f.db.fireTableUpdated();
    assert.notEqual(f.combat.statsTables().version, version);
    assert.equal(f.runtime.walletMoney(), 4500);
    const reads = f.db.calls.exportTableAsJson;
    const state = f.runtime.getState();
    assert.equal(f.runtime.walletMoney(), 4500);
    assert.equal(f.runtime.getState(), state);
    assert.equal(f.db.calls.exportTableAsJson, reads);
});
