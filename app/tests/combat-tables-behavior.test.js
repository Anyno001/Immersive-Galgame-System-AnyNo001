// 战斗表写入与读取的行为用例（v0.39.1 云端行为的增量对齐）：读回不一致留队列、读取失败不当空表、
// 可选属性表缺失、受控写队列、同一宿主 api 上多个缓存客户端共享失效、空导出不缓存。
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_TABLE_SPECS, createCachedTableClient, createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { CARD_BUDGET_V1, evaluateCardBudget } from '../src/combat/rules.js';
import { createCombatLedger } from '../src/combat/ledger.js';
import { normalizeCard, normalizeLedgerEntry, normalizeProfile } from '../src/combat/schema.js';
import { createGenerationFixture } from './helpers/combat-generation-fixture.js';
import { JSDOM } from 'jsdom';

const clone = (value) => JSON.parse(JSON.stringify(value));

function fakeApi({ corrupt = null } = {}) {
    const tables = { mate: { type: 'chatSheets', version: 1, updateConfigUiSentinel: 2 }, sheet_user: { uid: 'sheet_user', name: '角色表', content: [['row_id', '姓名']], updateConfig: { updateFrequency: -1 }, exportConfig: {}, orderNo: 3 } };
    const calls = { insert: [], imports: 0 };
    const api = {
        calls, tables, corrupt, failRead: false, emptyExport: false,
        exportTableAsJson() {
            if (api.failRead) throw new Error('boom');
            return api.emptyExport ? {} : clone(tables);
        },
        insertRow(opts) {
            calls.insert.push(opts);
            const sheet = Object.values(tables).find((s) => s && s.name === opts.tableName);
            if (!sheet) return -1;
            const headers = sheet.content[0];
            const row = headers.map((h) => (h === 'row_id' ? String(sheet.content.length) : String(opts.data[h] ?? '')));
            if (api.corrupt) api.corrupt(row, headers);
            sheet.content.push(row);
            return sheet.content.length - 1;
        },
        getTableTemplate() {
            const copy = clone(tables);
            for (const v of Object.values(copy)) if (v && v.content) v.content = [v.content[0]];
            return copy;
        },
        async importTemplateFromData(template) {
            calls.imports += 1;
            for (const [key, sheet] of Object.entries(template)) {
                if (key === 'mate') { tables.mate = sheet; continue; }
                if (!tables[key]) tables[key] = clone(sheet);
            }
            return { success: true };
        },
        async refreshDataAndWorldbook() {},
    };
    return api;
}

const ledger = (id, payload = { amount: 10, reason: '帮忙' }) => ({
    id, type: 'exp', character: 'pc-1', createdAt: 5, payload,
    anchor: { messageId: 3, swipeId: 0, tagHash: 'abc', occurrence: 0 },
});
const attribute = {
    id: 'a1', type: 'story', character: 'pc-1', createdAt: 5, change: '力量+1', payload: { ability: 'str', amount: 1 },
    anchor: { messageId: 3, swipeId: 0, tagHash: 'abc', occurrence: 0 },
};

async function ready(api, options = {}) {
    const tables = createCombatTables({ api, ...options });
    assert.equal((await tables.ensure()).ok, true);
    return tables;
}

test('读回不一致：条目留在待写队列、不报成功，首条标明原因，其余标 queued；修复后重写成功', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    api.corrupt = (row, headers) => { const i = headers.indexOf('载荷JSON'); row[i] = row[i].slice(0, -1); };
    const bad = await tables.append('ledger', [ledger('e1'), ledger('e2')]);
    assert.deepEqual([bad.ok, bad.reason, bad.key], [false, 'combat-ledger-write-unverified', 'e1']);
    assert.deepEqual(bad.pending.map((p) => [p.key, p.reason]), [['e1', 'combat-ledger-write-unverified'], ['e2', 'queued']]);
    assert.equal(tables.read().ledger.length, 0);
    api.corrupt = null;
    const retried = await tables.flush();
    assert.deepEqual([retried.ok, retried.written, retried.pending], [true, ['e1', 'e2'], []]);
    assert.deepEqual(tables.read().ledger.map((r) => r.id), ['e1', 'e2']);
});

test('读取失败不当作空表：待写条目保留，不插行；ensure 同样报读取失败；恢复后重写成功', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    api.failRead = true;
    tables.client.invalidate();
    const read = tables.read();
    assert.deepEqual([read.ok, read.reason], [false, 'combat-table-read-failed']);
    assert.equal('ledger' in read, false);
    const appended = await tables.append('ledger', ledger('e1'));
    assert.deepEqual([appended.ok, appended.reason, appended.pending.length], [false, 'combat-table-read-failed', 1]);
    assert.equal(api.calls.insert.length, 0);
    assert.equal((await tables.ensure()).reason, 'combat-table-read-failed');
    api.failRead = false;
    const flushed = await tables.flush();
    assert.deepEqual([flushed.ok, flushed.written, flushed.pending], [true, ['e1'], []]);
});

test('空导出（数据库尚未载入）不进缓存：载入后的下一次读取立即生效', () => {
    const api = fakeApi();
    const client = createCachedTableClient({ api });
    api.emptyExport = true;
    assert.equal(client.readSheets().reason, 'not-ready');
    api.emptyExport = false;
    assert.equal(client.readSheets().ok, true);
    assert.equal(api.calls.insert.length, 0);
});

test('建表租约：排队期间或模板读取后目标失效，不向新聊天导入', async () => {
    const api = fakeApi();
    const tables = createCombatTables({ api });
    let release;
    const busy = tables.serial(() => new Promise(resolve => { release = resolve; }));
    await Promise.resolve();
    let active = true;
    const queued = tables.ensure({ shouldStart: () => active });
    active = false;
    release();
    await busy;
    assert.equal((await queued).reason, 'request-stale');
    assert.equal(api.calls.imports, 0);
    active = true;
    const getTemplate = api.getTableTemplate;
    api.getTableTemplate = () => {
        const template = getTemplate();
        active = false;
        return template;
    };
    assert.equal((await tables.ensure({ shouldStart: () => active })).reason, 'request-stale');
    assert.equal(api.calls.imports, 0);
    tables.client.dispose();
});

test('建档写入租约：排队后中止或目标失效，不插行且移除过期请求', async t => {
    for (const mode of ['signal', 'lease']) await t.test(mode, async t => {
        const api = fakeApi();
        const tables = await ready(api);
        t.after(() => tables.client.dispose());
        let release;
        const busy = tables.serial(() => new Promise(resolve => { release = resolve; }));
        await Promise.resolve();
        const controller = new AbortController();
        let active = true;
        const queued = tables.append('profile', { id: 'queued-hero', name: '艾拉', kind: 'deck-character',
            version: 1, createdAt: 1, definition: {} }, { signal: controller.signal, shouldStart: () => active });
        if (mode === 'signal') controller.abort();
        else active = false;
        release();
        await busy;
        const result = await queued;
        assert.equal(result.ok, false);
        assert.equal(result.rejected[0].reason, 'request-stale');
        assert.equal(api.calls.insert.length, 0);
        assert.deepEqual(tables.pending(), []);
    });
});

test('服务补表租约：模板读取后换聊天、重置、销毁或更换 API，不导入且不污染后续重试', async t => {
    for (const mode of ['chat', 'reset', 'dispose', 'api']) await t.test(mode, async t => {
        const api = fakeApi();
        const host = { AutoCardUpdaterAPI: api };
        let chatId = 'before';
        const services = createCombatServices({ global: host, getChatId: () => chatId,
            getReaderSettings: () => ({ combatExpansion: { enabled: true } }) });
        t.after(() => services.dispose());
        const getTemplate = api.getTableTemplate;
        api.getTableTemplate = () => {
            const template = getTemplate();
            api.getTableTemplate = getTemplate;
            if (mode === 'chat') chatId = 'after';
            else if (mode === 'reset') services.resetChat();
            else if (mode === 'dispose') services.dispose();
            else host.AutoCardUpdaterAPI = fakeApi();
            return template;
        };
        assert.equal((await services.ensureTables()).reason, 'request-stale');
        assert.equal(api.calls.imports, 0);
        if (mode === 'dispose') assert.equal((await services.ensureTables()).reason, 'request-stale');
        else {
            assert.equal((await services.ensureTables()).ok, true);
            assert.equal(host.AutoCardUpdaterAPI.calls.imports, 1);
        }
    });
});

test('D2 旧预算定义经表读回不改卡面，新写入仍严格校验且非法旧数据保留诊断', async () => {
    const api = fakeApi();
    const tables = await ready(api);
    const card = { id: 'legacy-conversion', name: '旧盾连击', type: 'attack', cost: 1, rarity: 'common', effects: [
        ...Array.from({ length: 3 }, () => ({ op: 'damage-from-block', target: 'enemy' })),
        { op: 'self-damage', amount: 10 },
    ] };
    assert.equal(evaluateCardBudget(card, CARD_BUDGET_V1).ok, true);
    assert.equal(evaluateCardBudget(card).reason, 'over-budget');
    assert.equal(normalizeCard(card).ok, false);
    const profile = { kind: 'class', v: 1, id: 'legacy-class', className: '旧盾士', archetype: 'warrior',
        classPassive: { id: 'legacy-passive', name: '护身', trigger: 'battle-start', effects: [{ op: 'block', amount: 3, target: 'self' }] },
        classPool: [card] };
    const oldProfile = normalizeProfile(profile, { stored: true });
    const entry = { ...ledger('legacy-learn'), type: 'learn', payload: { card } };
    const oldEntry = normalizeLedgerEntry(entry, { stored: true });
    assert.equal(oldProfile.ok, true, JSON.stringify(oldProfile.errors));
    assert.equal(oldEntry.ok, true, JSON.stringify(oldEntry.errors));
    assert.equal(normalizeProfile(profile).ok, false);
    assert.equal(normalizeLedgerEntry(entry).ok, false);
    assert.equal(normalizeProfile({ ...profile, unexpected: true }, { stored: true }).ok, false);
    assert.equal((await tables.append('profile', { id: profile.id, name: profile.className, kind: 'class',
        className: profile.className, version: 1, createdAt: 1, definition: oldProfile.value })).ok, true);
    assert.equal((await tables.append('ledger', oldEntry.value)).ok, true);
    const book = createCombatLedger({ tables, chat: [] });
    const before = JSON.stringify(api.tables);
    const snapshot = await book.read();
    assert.equal(snapshot.ok, true);
    assert.deepEqual(snapshot.profiles.get(profile.id).profile, oldProfile.value);
    assert.deepEqual(snapshot.entries.find(row => row.id === entry.id), oldEntry.value);
    assert.equal(snapshot.diagnostics.some(row => /combat-(profile|entry)-invalid/.test(row.code)), false);
    assert.equal(JSON.stringify(api.tables), before);
    const writes = api.calls.insert.length;
    const denied = await book.append({ ...entry, id: 'new-legacy-learn' });
    assert.equal(denied.ok, false);
    assert.equal(denied.rejected[0].errors.some(error => error.reason === 'over-budget'), true);
    assert.equal(api.calls.insert.length, writes);
    for (const [id, amount, reason] of [['under', 1, 'under-budget'], ['over', 99, 'over-budget']]) {
        const bad = { ...entry, id: `bad-${id}`, payload: { card: { ...card, effects: [{ op: 'damage', amount, target: 'enemy' }] } } };
        assert.equal(normalizeLedgerEntry(bad, { stored: true }).ok, false);
        assert.equal((await book.append(bad)).rejected[0].errors.some(error => error.reason === reason), true);
        assert.equal((await tables.append('ledger', bad)).ok, true);
    }
    const diagnosed = await createCombatLedger({ tables, chat: [] }).read();
    assert.deepEqual(diagnosed.entries.map(row => row.id), [entry.id]);
    assert.deepEqual(diagnosed.diagnostics.filter(row => row.code === 'combat-entry-invalid').map(row => row.id), ['bad-under', 'bad-over']);
    const current = { ...entry, id: 'current-learn', payload: { card: { ...card, id: 'current-card',
        effects: [{ op: 'damage', amount: 12, target: 'enemy' }] } } };
    assert.equal((await book.append(current)).ok, true);
});

const clearRows = (f) => {
    for (const sheet of Object.values(f.db.sheets)) sheet.content = sheet.content.slice(0, 1);
};
const settle = async () => {
    for (let i = 0; i < 12; i += 1) await new Promise(resolve => setImmediate(resolve));
};

test('新聊天读表期间切到空档案，拒用旧读取并合并为一次主角生成', async t => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    f.setChat('new-chat');
    f.services.resetChat();
    const first = f.services.prepareProtagonist();
    const second = f.services.prepareProtagonist();
    assert.equal(first, second);
    clearRows(f);
    f.db.fireTableUpdated();
    assert.equal((await first).ok, true);
    await settle();
    const state = await f.services.getLedger().effectiveState();
    assert.equal(state.ok, true);
    assert.equal(state.characters.size, 1);
    assert.equal(f.requests.filter(p => p.entities.some(e => e.kind === 'profile-deck')).length, 1);
});

test('新聊天空表晚于 ready 到达时自动补档，已打开的人物状态同步显示', async t => {
    const { createCombatDeckPanelController } = await import('../src/visual/igs-ui/combat-deck-panel.js');
    const f = await createGenerationFixture();
    const dom = new JSDOM('<div id="overlay"></div>');
    const panel = createCombatDeckPanelController(dom.window.document, {
        getLedger: f.services.getLedger,
        getProtagonist: f.services.getProtagonist,
        onProtagonistUpdated: f.services.onProtagonistUpdated,
    });
    t.after(() => { panel.dispose(); dom.window.close(); f.dispose(); });
    f.setChat('new-chat-late');
    f.services.resetChat();
    assert.equal((await f.services.prepareProtagonist()).status, 'ready');
    clearRows(f);
    assert.equal(panel.open(dom.window.document.querySelector('#overlay')).ok, true);
    f.db.fireTableUpdated();
    await settle();
    assert.equal(panel.view().status, 'ready');
    assert.equal(panel.view().roster.length, 1);
    assert.equal(panel.view().roster[0].name, '艾拉');
    assert.equal(f.requests.length, 1);
    for (let i = 0; i < 5; i += 1) f.db.fireTableUpdated();
    await settle();
    assert.equal(f.requests.length, 1);
    assert.equal((await f.services.prepareProtagonist({ manual: true })).ok, true);
    assert.equal(f.requests.length, 1);
});

test('主角生成失败后表更新不重复请求，手动重试仍可恢复', async t => {
    const f = await createGenerationFixture({ seedHero: false });
    t.after(f.dispose);
    f.setFailure(true);
    assert.equal((await f.services.prepareProtagonist()).ok, false);
    assert.equal(f.services.getProtagonist().status, 'failed');
    const requests = f.requests.length;
    assert.ok(requests > 0);
    f.setFailure(false);
    for (let i = 0; i < 5; i += 1) f.db.fireTableUpdated();
    await settle();
    assert.equal(f.requests.length, requests);
    assert.equal((await f.services.prepareProtagonist()).status, 'failed');
    assert.equal(f.requests.length, requests);
    assert.equal((await f.services.prepareProtagonist({ manual: true })).ok, true);
    assert.equal(f.requests.length, requests + 1);
    assert.equal((await f.services.getLedger().effectiveState()).characters.size, 1);
});

test('数据库暂未加载时不生成，加载通知到达后补档且销毁后停止监听', async t => {
    const f = await createGenerationFixture({ seedHero: false,
        serviceOptions: { protagonistReadRetries: 0 } });
    t.after(f.dispose);
    const exported = f.db.api.exportTableAsJson;
    let loaded = false;
    f.db.api.exportTableAsJson = () => loaded ? exported() : {};
    f.services.resetChat();
    assert.equal((await f.services.prepareProtagonist()).reason, 'combat-table-not-ready');
    assert.equal(f.requests.length, 0);
    loaded = true;
    f.db.fireTableUpdated();
    await settle();
    assert.equal(f.services.getProtagonist().status, 'ready');
    assert.equal((await f.services.getLedger().effectiveState()).characters.size, 1);
    assert.equal(f.requests.length, 1);
    f.services.dispose();
    clearRows(f);
    f.db.fireTableUpdated();
    await settle();
    assert.equal(f.requests.length, 1);
    assert.equal(f.db.sheets.sheet_igscbprofile.content.length, 1);
});

test('主角生成在途切聊天或重置时拒绝迟到写入', async t => {
    for (const mode of ['chat', 'reset']) await t.test(mode, async t => {
        const f = await createGenerationFixture({ seedHero: false });
        t.after(f.dispose);
        let release;
        let entered;
        const started = new Promise(resolve => { entered = resolve; });
        f.setCallback(() => new Promise(resolve => { release = resolve; entered(); }));
        const pending = f.services.prepareProtagonist();
        await started;
        if (mode === 'chat') f.setChat('other-chat');
        else f.services.resetChat();
        release();
        assert.equal((await pending).reason, 'request-stale');
        assert.equal(f.db.sheets.sheet_igscbprofile.content.length, 1);
    });
});

test('手动检查会重读过期 ready，缺档案时生成且重复检查不重复生成', async t => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    assert.equal((await f.services.prepareProtagonist()).status, 'ready');
    clearRows(f);
    f.services.resetChat();
    assert.equal((await f.services.prepareProtagonist({ manual: true })).ok, true);
    assert.equal((await f.services.getLedger().effectiveState()).characters.size, 1);
    assert.equal(f.requests.length, 1);
    assert.equal((await f.services.prepareProtagonist()).ok, true);
    assert.equal(f.requests.length, 1);
});
