// 战斗表写入与读取的行为用例（v0.39.1 云端行为的增量对齐）：读回不一致留队列、读取失败不当空表、
// 可选属性表缺失、受控写队列、同一宿主 api 上多个缓存客户端共享失效、空导出不缓存。
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_TABLE_SPECS, createCachedTableClient, createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { CARD_BUDGET_V1, evaluateCardBudget } from '../src/combat/rules.js';
import { abilitiesForName, createCombatLedger } from '../src/combat/ledger.js';
import { normalizeCard, normalizeLedgerEntry, normalizeProfile } from '../src/combat/schema.js';
import { createGenerationFixture, modelReply } from './helpers/combat-generation-fixture.js';
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
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.requests[0].entities.map(e => e.kind), ['profile-init']);
    clearRows(f);
    assert.equal(panel.open(dom.window.document.querySelector('#overlay')).ok, true);
    f.db.fireTableUpdated();
    await settle();
    assert.equal(panel.view().status, 'ready');
    assert.equal(panel.view().roster.length, 1);
    assert.equal(panel.view().roster[0].name, '艾拉');
    assert.equal(f.requests.length, 2);
    for (let i = 0; i < 5; i += 1) f.db.fireTableUpdated();
    await settle();
    assert.equal(f.requests.length, 2);
    assert.equal((await f.services.prepareProtagonist({ manual: true })).ok, true);
    assert.equal(f.requests.length, 2);
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
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.requests[0].entities.map(e => e.kind), ['profile-init']);
    clearRows(f);
    f.services.resetChat();
    assert.equal((await f.services.prepareProtagonist({ manual: true })).ok, true);
    assert.equal((await f.services.getLedger().effectiveState()).characters.size, 1);
    assert.equal(f.requests.length, 2);
    assert.equal((await f.services.prepareProtagonist()).ok, true);
    assert.equal(f.requests.length, 2);
});
test('共享就绪：先订阅再检查、突发通知合并，旧聊天与 API 不发布', async t => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    const seen = [];
    const port = f.services.databaseReadiness();
    const off = port.subscribe(value => seen.push(value));
    assert.equal(seen[0].status, 'ready');
    assert.equal(seen[0].chatId, 'fixture-chat');
    assert.equal(seen[0].notifications, true);
    for (let i = 0; i < 5; i += 1) f.db.fireTableUpdated();
    await settle();
    assert.equal(seen.length, 2);
    f.db.fireTableUpdated();
    f.setChat('new-owner');
    f.services.resetChat();
    await settle();
    assert.equal(seen.length, 2);
    assert.equal(port.read().reason, 'request-stale');
    off(); off();
    const next = f.services.databaseReadiness();
    const pending = next.delay(10000);
    f.host.AutoCardUpdaterAPI = fakeApi();
    f.services.databaseReadiness();
    assert.equal(await pending, false);
    assert.equal(next.read().reason, 'request-stale');
});

test('主角暂时读取的 changed 与 unchanged 分支均按次数等待，空导出不建表或请求', async t => {
    for (const kind of ['changed', 'unchanged']) await t.test(kind, async t => {
        const f = await createGenerationFixture({ serviceOptions: { protagonistReadRetries: 2, protagonistReadDelayMs: 100 } });
        t.after(f.dispose);
        const book = f.services.getLedger();
        let reads = 0;
        if (kind === 'changed') f.db.api.exportTableAsJson = () => { reads += 1; return {}; };
        else book.effectiveState = async () => { reads += 1; return { ok: false, reason: 'combat-table-read-failed' }; };
        f.services.resetChat();
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const imports = f.db.calls.importTemplateFromData;
        let finished = false;
        const job = f.services.prepareProtagonist().then(value => { finished = true; return value; });
        await settle();
        const firstReads = reads;
        assert.equal(finished, false);
        t.mock.timers.tick(99);
        await settle();
        assert.equal(reads, firstReads);
        t.mock.timers.tick(1);
        await settle();
        assert.ok(reads > firstReads);
        assert.equal(finished, false);
        t.mock.timers.tick(100);
        assert.equal((await job).ok, false);
        assert.equal(f.requests.length, 0);
        assert.equal(f.db.calls.importTemplateFromData, imports);
    });
});
test('共享就绪：空或非法导出等待，读取异常失败，读中版本变化不发布 ready', async t => {
    const api = fakeApi();
    const host = { AutoCardUpdaterAPI: api };
    const services = createCombatServices({ global: host, getChatId: () => 'readiness-chat' });
    t.after(services.dispose);
    const port = services.databaseReadiness();
    const exported = api.exportTableAsJson;
    for (const raw of [{}, null, 'loading', ['loading']]) {
        api.exportTableAsJson = () => raw;
        assert.equal(port.read().status, 'waiting');
    }
    api.exportTableAsJson = () => { throw Error('fixture-read-error'); };
    assert.equal(port.read().status, 'failed');
    api.exportTableAsJson = exported;
    const values = [];
    const off = port.subscribe(value => values.push(value));
    assert.equal(values[0].notifications, false);
    assert.equal(values[0].status, 'ready');
    off();
    services.resetChat();
    const live = services.databaseReadiness();
    // 用同一共享 API 的客户端制造读中版本变化。
    const peer = createCachedTableClient({ api });
    t.after(() => peer.dispose());
    api.exportTableAsJson = () => { peer.invalidate(); return exported(); };
    assert.equal(live.read().status, 'waiting');
    api.exportTableAsJson = exported;
    assert.equal(live.read().status, 'ready');
});

test('无通知宿主延迟就绪仍按有界等待恢复，关闭或销毁释放等待器', async t => {
    for (const mode of ['recover', 'close', 'dispose']) await t.test(mode, async t => {
        let enabled = true;
        const f = await createGenerationFixture({ serviceOptions: {
            protagonistReadRetries: 2, protagonistReadDelayMs: 100,
            getReaderSettings: () => ({ combatExpansion: { enabled } }),
        } });
        t.after(f.dispose);
        const api = { ...f.db.api };
        delete api.registerTableUpdateCallback;
        delete api.unregisterTableUpdateCallback;
        const exported = api.exportTableAsJson;
        let loaded = false;
        api.exportTableAsJson = () => loaded ? exported() : {};
        f.host.AutoCardUpdaterAPI = api;
        f.services.resetChat();
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const job = f.services.prepareProtagonist();
        await settle();
        if (mode === 'recover') { loaded = true; t.mock.timers.tick(100); }
        else if (mode === 'close') { enabled = false; await f.services.prepareProtagonist(); }
        else f.services.dispose();
        const result = await job;
        assert.equal(result.ok, mode === 'recover');
        if (mode !== 'recover') assert.equal(result.reason, 'request-stale');
        assert.equal(f.requests.length, mode === 'recover' ? 1 : 0);
        if (mode === 'recover') assert.deepEqual(f.requests[0].entities.map(e => e.kind), ['profile-init']);
    });
});

test('三模式主角补齐属性与卡组，只补缺项并保留已有手动分值', async t => {
    for (const kind of ['daily', 'combat', 'both']) await t.test(kind, async t => {
        const f = await createGenerationFixture({ seedHero: false, serviceOptions: {
            getReaderSettings: () => ({ combatExpansion: { enabled: true, kind } }),
        } });
        t.after(f.dispose);
        const first = f.services.prepareProtagonist();
        assert.equal(first, f.services.prepareProtagonist());
        assert.equal((await first).status, 'ready');
        const init = f.requests[0].entities.find(e => e.kind === 'profile-deck');
        assert.equal(init.input.combatInit, true);
        assert.equal(f.requests.length, 1);
        const state = await f.services.getLedger().effectiveState();
        assert.equal(abilitiesForName(state, '艾拉', '艾拉').initialized, true);
        assert.equal(f.services.lifeSource().readAbilities('艾拉').initialized, true);
        assert.equal((await f.services.prepareProtagonist()).status, 'ready');
        assert.equal(f.requests.length, 1);
    });
    await t.test('手动策略等待，写入后仅补卡组且不改分值', async t => {
        let policy = { ready: false, reason: 'stats-build-policy-waiting' };
        const f = await createGenerationFixture({ seedHero: false, serviceOptions: { buildMode: () => policy } });
        t.after(f.dispose);
        assert.equal((await f.services.prepareProtagonist()).status, 'waiting');
        policy = { ready: true, mode: 'manual', choices: {} };
        assert.equal((await f.services.prepareProtagonist()).status, 'manual');
        assert.equal(f.requests.length, 0);
        const scores = { str: 15, dex: 12, con: 12, int: 12, wis: 12, cha: 9 };
        assert.equal((await f.services.writeManualInit('艾拉', { className: '自选', role: 'warrior', scores })).ok, true);
        assert.equal((await f.services.prepareProtagonist()).status, 'ready');
        assert.equal(f.requests[0].entities.some(e => e.input?.combatInit), false);
        assert.deepEqual(f.services.lifeSource().readAbilities('艾拉').base, scores);
    });
});

test('初始化缺失或非法不报 ready，档案成功后手动重试只请求属性', async t => {
    for (const invalid of [undefined, { major: 'str' }]) await t.test(String(invalid), async t => {
        const f = await createGenerationFixture({ seedHero: false });
        t.after(f.dispose);
        f.setReply(prompt => {
            const reply = JSON.parse(modelReply(prompt));
            for (const e of reply.entities) { if (e.value) e.value.init = invalid; }
            return JSON.stringify(reply);
        });
        assert.equal((await f.services.prepareProtagonist()).reason, 'combat-init-invalid');
        assert.equal(f.services.getProtagonist().deckReady, true);
        assert.equal(f.services.getProtagonist().attributesReady, false);
        f.setReply(modelReply);
        f.db.fireTableUpdated();
        await settle();
        assert.equal(f.requests.length, 1);
        assert.equal((await f.services.prepareProtagonist({ manual: true })).status, 'ready');
        assert.deepEqual(f.requests[1].entities.map(e => e.kind), ['profile-init']);
        assert.equal(f.requests.length, 2);
    });
});

test('属性写失败后保留卡组，显式重试不再生成已有档案', async t => {
    const f = await createGenerationFixture({ seedHero: false });
    t.after(f.dispose);
    const insert = f.db.api.insertRow;
    let fail = true;
    const table = Object.values(f.db.sheets).find(s => s.uid === COMBAT_TABLE_SPECS.attribute.uid);
    assert.ok(table);
    f.db.api.insertRow = (first, second) => {
        const name = typeof first === 'object' ? first.tableName : first;
        if (fail && name === table.name) return false;
        return insert(first, second);
    };
    assert.equal((await f.services.prepareProtagonist()).ok, false);
    assert.equal(f.services.getProtagonist().deckReady, true);
    fail = false;
    assert.equal((await f.services.prepareProtagonist({ manual: true })).status, 'ready');
    assert.deepEqual(f.requests[1].entities.map(e => e.kind), ['profile-init']);
});


test('人物页准备通知保留加点草稿和生成确认，安全后重读，关闭后旧通知失效', async t => {
    const { createCombatDeckPanelController } = await import('../src/visual/igs-ui/combat-deck-panel.js');
    const f = await createGenerationFixture();
    await f.services.prepareProtagonist();
    const dom = new JSDOM('<div id="overlay"></div>');
    const listeners = new Set();
    const ledger = f.services.getLedger();
    let reads = 0;
    const panel = createCombatDeckPanelController(dom.window.document, {
        getLedger: () => ({ effectiveState: () => { reads += 1; return ledger.effectiveState(); } }),
        getProtagonist: f.services.getProtagonist,
        onProtagonistUpdated: fn => { listeners.add(fn); return () => listeners.delete(fn); },
        regenerateDeck: async () => ({ ok: true }),
    });
    t.after(() => { panel.dispose(); dom.window.close(); f.dispose(); });
    const emit = () => { for (const fn of listeners) fn({ status: 'ready' }); };
    panel.open(dom.window.document.querySelector('#overlay'));
    await settle();
    assert.equal(panel.view().status, 'ready');
    assert.equal(panel.invoke('alloc-add', 'str').ok, true);
    const draft = structuredClone(panel.view().alloc);
    const before = reads;
    emit();
    await settle();
    assert.equal(reads, before);
    assert.deepEqual(panel.view().alloc, draft);
    panel.invoke('alloc-reset');
    await settle();
    assert.equal(reads, before + 1);
    assert.equal(panel.view().alloc.dirty, false);
    assert.equal(panel.invoke('rebuild-open').ok, true);
    const form = panel.view().generationForm;
    assert.ok(form);
    const confirmedReads = reads;
    emit();
    await settle();
    assert.equal(reads, confirmedReads);
    assert.deepEqual(panel.view().generationForm, form);
    panel.invoke('rebuild-cancel');
    await settle();
    assert.equal(reads, confirmedReads + 1);
    const old = [...listeners][0];
    panel.close();
    assert.equal(listeners.size, 0);
    old({ status: 'ready' });
    await settle();
    assert.equal(reads, confirmedReads + 1);
    panel.open(dom.window.document.querySelector('#overlay'));
    await settle();
    assert.equal(listeners.size, 1);
    assert.equal(panel.view().status, 'ready');
});

test('bootstrap 日常模式等待显式策略，主角落账后骰子、正文、挑战与门槛同源且冷启动复用', async t => {
    const { bootstrapIGS } = await import('../src/core/bootstrap.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { traitAttrsOf } = await import('../src/scene/stats/stat-traits.js');
    const { sessionKeyFor } = await import('../src/combat/session.js');
    const { cocCheckRollsFor, cocFaces } = await import('../src/scene/stats/stat-coc-checks.js');
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://igs.invalid/' });
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    db.sheets.sheet_options = { uid: 'sheet_options', name: '检定建议表', content: [
        ['row_id', '展示文本', '骰子命令'], ['1', '推开石门', '检定 主角 力量'],
    ] };
    const tables = createCombatTables({ api: db.api });
    assert.equal((await tables.ensure()).ok, true);
    const listeners = new Map();
    const chat = [{ is_user: true, mes: '出发' }, { is_user: false, mes: '<now_plot><content>你来到石门前。</content></now_plot>', swipe_id: 0 }];
    const context = { name1: '艾拉', name2: '小雪', chat, chatMetadata: {}, extensionPrompts: {}, saveMetadata() {},
        getCurrentChatId: () => 'bootstrap-daily', eventTypes: { CHAT_CHANGED: 'chat', GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge' },
        eventSource: { on(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); }, removeListener(k, fn) { listeners.get(k)?.delete(fn); } },
        setExtensionPrompt(k, value) { context.extensionPrompts[k] = { value }; } };
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({ optionBubble: { enabled: true, clickAction: 'fill' },
            autoIllustration: { llm: { source: 'custom', endpoint: 'https://example.invalid/v1',
                apiKey: 'fixture', model: 'fixture' } },
            origin: { enabled: true, taskSource: 'manual', achieveOn: false,
                mods: { stat: false, bag: false, shop: false, gacha: false, ach: false, chat: false } },
            stats: { enabled: true, newChat: 'ask', ruleset: 'coc7', checkFx: false, bars: { money: true }, autoSkill: false, sheetGen: 'off', backfill: 'off' } }),
        'igs-reader-settings-v9-default': JSON.stringify({ titleScreen: false, typewriter: { enabled: false }, combatExpansion: { enabled: true, kind: 'daily', skin: 'initial' } }),
    });
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '艾拉', chatId: context.getCurrentChatId });
    const requests = [];
    const currencyTasks = [];
    let floorReady;
    const options = { global: { document: dom.window.document, localStorage: storage, AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => context },
        Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, dispatchEvent: dom.window.dispatchEvent.bind(dom.window), addEventListener: dom.window.addEventListener.bind(dom.window), removeEventListener: dom.window.removeEventListener.bind(dom.window) },
        autoAttachMagicWand: false, secondaryLlm: { request: async (prompt, config) => {
            let entities;
            try { entities = JSON.parse(prompt.user).entities; } catch { /* 货币请求不是实体批次 */ }
            if (!Array.isArray(entities)) return new Promise(resolve => currencyTasks.push({ resolve, config }));
            if (entities.every(entity => entity.kind === 'challenge-foe')) return JSON.stringify({ entities: entities.map(entity => ({
                key: entity.key, value: { foe: entity.input.foes[0].key, name: '考验' },
            })) });
            requests.push(prompt); return modelReply(prompt);
        } },
        illustrationMessageHost: { getChatId: context.getCurrentChatId, getUserName: () => '艾拉',
            readFloor: id => ({ text: chat[id]?.mes || '', chatId: context.getCurrentChatId(), messageId: id, swipeId: chat[id]?.swipe_id || 0, isAi: chat[id]?.is_user === false, isLatest: id === chat.length - 1 }),
            readPreviousAiTexts: () => [], readCharacterLore: async () => [], on: () => () => {}, onImageFloorReady: fn => { floorReady = fn; return () => { floorReady = null; }; },
            attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }), destroy() {} },
        hostAdapter: { getCurrentMessage: async () => null, getMessageById: async id => ({ id, text: chat[id]?.mes || '' }), typeAndSend: async () => ({ ok: true }) } };
    let app = bootstrapIGS(options);
    t.after(async () => { await app.shutdown(); tables.client.dispose(); dom.window.close(); });
    const waitFor = async (read, message) => {
        for (let i = 0; i < 80; i += 1) { const value = await read(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 25)); }
        assert.fail(typeof message === 'function' ? message() : message);
    };
    const open = async id => {
        const result = await app.openViewerFromMessage(id, 'pc', { skipTitle: true, skipImageCollection: true });
        assert.equal(result.ok, true, result.reason);
        return result.reader.controller;
    };
    let reader = await open(1);
    assert.equal((await reader.invokeAction('combat-status')).ok, true);
    await settle();
    assert.match(dom.window.document.querySelector('#igs-combat-deck-panel').textContent, /等待数据库|等待建档方式/);
    await waitFor(() => /等待建档方式/.test(dom.window.document.querySelector('#igs-combat-deck-panel').textContent),
        '数据库稳定后未进入建档方式等待');
    assert.equal(requests.length, 0);
    const settings = app.openSettings({ tab: 'stats' });
    assert.equal(settings.ok, true);
    assert.equal((await settings.controller.invoke('stats-build-mode:auto')).ok, true);
    assert.equal(settings.controller.close().ok, true);
    const attrs = await waitFor(async () => {
        const state = await ledger.effectiveState();
        const value = abilitiesForName(state, '艾拉', '艾拉');
        return state.attributes?.heroId && value?.initialized ? value : null;
    }, '主角属性与卡组未从权威表读回');
    await settle();
    assert.equal(requests.length, 1);
    await waitFor(() => currencyTasks.length === 1, '货币请求未启动');
    assert.match(dom.window.document.querySelector('#igs-combat-deck-panel').textContent, /艾拉/);
    assert.deepEqual(traitAttrsOf({}, '主角'), Object.fromEntries(Object.entries({ str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }).map(([key, label]) => [label, attrs.scores[key]])));
    dom.window.document.querySelector('[data-deck-act="close"]').click();
    const originSettings = app.openSettings({ page: 'origin' });
    await waitFor(() => /本聊天正在运行/.test(dom.window.document.querySelector('#igs-unified-settings').textContent),
        'Origin 不应等待货币模型完成');
    assert.equal(currencyTasks.length, 1);
    originSettings.controller.close();
    const walletSettings = app.openSettings({ page: 'stats' });
    currencyTasks[0].config.onSlow();
    await settle();
    assert.equal(dom.window.document.querySelector('[data-action="stats-op:currency-retry"]').disabled, true);
    assert.match(dom.window.document.querySelector('.igs-stats-wallets').textContent, /仍在处理/);
    currencyTasks[0].resolve(JSON.stringify({ name: '铜钱', initial: 100,
        prices: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 }, rate: 0.25 }));
    await waitFor(() => /铜钱100/.test(dom.window.document.querySelector('.igs-stats-wallets').textContent),
        '同一货币慢请求未完成余额读回');
    assert.equal(currencyTasks.length, 1);
    walletSettings.controller.close();
    await reader.invokeAction('next');
    const option = dom.window.document.querySelector('.igs-option-bubble');
    assert.ok(option, '公开阅读器显示检定选项');
    option.click();
    await waitFor(() => app.getState().igsUi.activeReader.inputValue.includes('检定结果'), '选项检定未完成');
    const input = app.getState().igsUi.activeReader.inputValue;
    assert.match(input, /力量/);
    assert.ok(input.includes(String(attrs.scores.str * 5)), input);
    chat.push({ is_user: false, mes: '<now_plot><content>你试着推门。[igs-check:主角|力量|普通]</content></now_plot>', swipe_id: 0 });
    reader = await open(2);
    const checks = reader.getSnapshot().content.fx.checks.items;
    assert.equal(checks[0].value, attrs.scores.str * 5);
    assert.equal(checks[0].die, cocFaces(cocCheckRollsFor(context.getCurrentChatId(), 2)[0]).base);
    chat.push({ is_user: false, mes: '<now_plot><content>敌人出现。[igs-combat:start|伏击|强盗|我|normal]</content></now_plot>', swipe_id: 0 });
    floorReady(3);
    reader = await open(3);
    await settle();
    assert.equal(dom.window.document.querySelector('#igs-combat-panel'), null);
    assert.equal(requests.length, 1);
    chat.push({ is_user: false, mes: '<now_plot><content>面试开始。\n[igs-challenge:终面|魅力|普通|压力]\n</content></now_plot>', swipe_id: 0 });
    floorReady(4);
    reader = await open(4);
    assert.equal((await reader.invokeAction('last-page')).ok, true);
    const page = reader.getSnapshot().content;
    assert.equal(page.currentIndex, page.segments.length - 1);
    const start = await waitFor(() => dom.window.document.querySelector('[data-combat-act="start"]'),
        () => `日常挑战未进入大厅：${dom.window.document.querySelector('#igs-combat-panel')?.textContent || app.getState().igsUi.activeReader.toastMessage}`);
    start.click();
    const saved = await waitFor(() => JSON.parse(storage.getItem(sessionKeyFor(context.getCurrentChatId())) || 'null'), '挑战未保存正式建局快照');
    assert.equal(saved.setup.challenge.domain, '魅力');
    assert.equal(saved.setup.units[0].catalog['ch-ace'].rarity, attrs.scores.cha * 5 >= 80 ? 'epic' : attrs.scores.cha * 5 >= 60 ? 'rare' : attrs.scores.cha * 5 >= 30 ? 'uncommon' : 'common');
    const attributesBefore = clone(tables.read({ kinds: ['attribute'] }).attribute);
    await app.shutdown();
    const before = requests.length;
    app = bootstrapIGS(options);
    await settle();
    assert.equal(requests.length, before);
    assert.deepEqual(tables.read({ kinds: ['attribute'] }).attribute, attributesBefore);
    reader = await open(2);
    assert.equal(reader.getSnapshot().content.fx.checks.items[0].value, attrs.scores.str * 5);
    assert.deepEqual(traitAttrsOf({}, '主角'), Object.fromEntries(Object.entries({ str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }).map(([key, label]) => [label, attrs.scores[key]])));
    const persisted = clone(tables.read({ kinds: ['profile', 'attribute', 'stats'] }));
    for (const kind of ['combat', 'both', 'daily']) {
        const settings = app.openSettings({ page: 'combat' });
        assert.equal(settings.controller.setValue('readerSettings.combatExpansion.kind', kind).ok, true);
        assert.equal(settings.controller.close().ok, true);
        await settle();
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).combatExpansion.kind, kind);
        assert.equal(requests.length, before, `${kind} 切换不重新生成已有主角`);
        assert.equal(currencyTasks.length, 1, `${kind} 切换不重发货币`);
    }
    for (const enabled of [false, true]) {
        const settings = app.openSettings({ page: 'combat' });
        assert.equal(settings.controller.setValue('readerSettings.combatExpansion.enabled', enabled).ok, true);
        assert.equal(settings.controller.close().ok, true);
        await settle();
        assert.equal(JSON.parse(storage.getItem('igs-reader-settings-v9-default')).combatExpansion.enabled, enabled);
        assert.equal(requests.length, before, '关闭与重开复用持久化主角');
    }
    assert.deepEqual(tables.read({ kinds: ['profile', 'attribute', 'stats'] }), persisted);
});


test('人物页装备整理：隐藏装备手动入口，保留其他重试及自动装备读回', async t => {
    const { createCombatDeckPanelController } = await import('../src/visual/igs-ui/combat-deck-panel.js');
    const f = await createGenerationFixture();
    const chat = f.host.SillyTavern.getContext().chat;
    chat.splice(0, chat.length, { is_user: true, mes: '出发' }, { is_user: false, swipe_id: 0,
        mes: '获得战甲并确认职业。\n[igs-combat:equip|艾拉|测试战甲|armor|用于防护|common]\n[igs-combat:class|艾拉|剑士]' });
    assert.equal((await f.services.prepareProtagonist()).ok, true);
    await f.services.refreshGrowth();
    assert.deepEqual(f.services.getGrowth().pending.map(p => p.kind).sort(), ['class', 'equip']);
    f.requests.length = 0;
    f.setReply(prompt => JSON.stringify({ entities: JSON.parse(prompt.user).entities.map(e => ({ key: e.key,
        value: { ability: 'str', ...(e.input.templates?.length ? { template: e.input.templates[0] } : {}) } })) }));
    const dom = new JSDOM('<div id="overlay"></div>');
    let heroRetries = 0, sends = 0, sessionState = null;
    const panel = createCombatDeckPanelController(dom.window.document, {
        getLedger: f.services.getLedger, getGrowth: f.services.getGrowth,
        retryGrowth: () => f.services.retryGrowth(),
        getProtagonist: () => ({ status: 'failed', reason: 'combat-llm-request-failed' }),
        retryProtagonist: async () => { heroRetries += 1; return { ok: true }; },
        getSession: () => ({ state: () => sessionState,
            retrySend: async () => { sends += 1; sessionState = null; return { ok: true }; } }),
    });
    t.after(() => { panel.dispose(); dom.window.close(); f.dispose(); });
    assert.equal(panel.open(dom.window.document.querySelector('#overlay')).ok, true);
    await settle();
    const doc = dom.window.document;
    assert.equal(panel.view().status, 'ready');
    assert.doesNotMatch(doc.querySelector('.igs-deck-pending').textContent, /equip|测试战甲/);
    assert.ok(doc.querySelector('[data-deck-act="retry-growth"]'));
    assert.equal((await panel.invoke('retry-growth')).ok, true);
    assert.equal(f.requests.length, 0, '手动重试只处理无需模型的非装备职业项');
    assert.deepEqual(f.services.getGrowth().pending.map(p => p.kind), ['equip']);
    assert.equal(doc.querySelector('[data-deck-act="retry-growth"]'), null);
    assert.equal((await panel.invoke('retry-growth')).unchanged, true);
    assert.equal((await panel.invoke('retry-protagonist')).ok, true);
    assert.equal(heroRetries, 1);
    sessionState = { status: 'send-failed', reportDelivered: false };
    await panel.invoke('reload');
    assert.ok(doc.querySelector('[data-deck-act="retry-send"]'));
    assert.equal((await panel.invoke('retry-send')).ok, true);
    assert.equal(sends, 1);
    assert.equal((await f.services.autoGrowth(1)).ok, true);
    assert.equal(f.requests.length, 1);
    assert.ok(f.requests[0].entities.some(e => e.kind === 'equip-to-passive'));
    const bag = f.services.inventoryTables().read();
    assert.equal(bag.ok, true);
    assert.equal(bag.inventory.items.find(item => item.name === '测试战甲')?.quantity, 1);
    assert.equal(f.services.getGrowth().pending.some(p => p.kind === 'equip'), false);
    assert.equal((await f.services.autoGrowth(1)).ok, true);
    assert.equal(f.requests.length, 1, '已确认装备不重新生成');
});
