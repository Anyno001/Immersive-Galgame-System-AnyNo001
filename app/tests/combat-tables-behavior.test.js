// 战斗表写入与读取的行为用例（v0.39.1 云端行为的增量对齐）：读回不一致留队列、读取失败不当空表、
// 可选属性表缺失、受控写队列、同一宿主 api 上多个缓存客户端共享失效、空导出不缓存。
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBAT_TABLE_SPECS, createCachedTableClient, createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createIgsChatStore } from '../src/data/shujuku/igs-chat-store.js';
import { IGS_LAYOUT_RECORD, IGS_TABLE_SPECS } from '../src/data/shujuku/igs-table-specs.js';
import { readIgsChatEvidence } from '../src/storage/igs-chat-evidence.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createLedger, serializeLedger } from '../src/scene/origin/origin-ledger.js';
import { pointsRecord } from '../src/scene/points/points-log.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { CARD_BUDGET_V1, evaluateCardBudget } from '../src/combat/rules.js';
import { abilitiesForName, createCombatLedger } from '../src/combat/ledger.js';
import { computeAttributes } from '../src/scene/stats/attribute-profile.js';
import { deckProfileEntities, generateEntities, generationWrites } from '../src/combat/generation.js';
import { ledgerEntryId, normalizeCard, normalizeLedgerEntry, normalizeProfile } from '../src/combat/schema.js';
import { locateCombatStart } from '../src/combat/session.js';
import { createCombatRewardIntents } from '../src/storage/combat-reward-intents.js';
import { createGenerationFixture, modelReply } from './helpers/combat-generation-fixture.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';
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
const clearProfileRows = (f) => {
    const sheet = f.db.sheets[COMBAT_TABLE_SPECS.profile.uid];
    if (sheet) sheet.content = sheet.content.slice(0, 1);
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
    clearProfileRows(f);
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
    assert.equal(f.requests.length, 0);
    clearProfileRows(f);
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
    for (const mode of ['http-503', 'invalid-json']) await t.test(mode, async t => {
        const f = await createGenerationFixture({ seedHero: false, seedAttributes: true, serviceOptions: { retryDelays: [], generationMaxRounds: 0 } });
        t.after(f.dispose);
        if (mode === 'http-503') f.setCallback(() => { throw Object.assign(new Error('模拟上游失败'), { reason: 'secondary-llm-http-failed', status: 503 }); });
        else f.setReply(() => '{');
        assert.equal((await f.services.prepareProtagonist()).ok, false);
        assert.equal(f.services.getProtagonist().status, 'failed');
        assert.equal(f.requests.length, 1);
        f.setCallback(null);
        f.setReply(modelReply);
        for (let i = 0; i < 5; i += 1) f.db.fireTableUpdated();
        await settle();
        assert.equal(f.requests.length, 1);
        assert.equal((await f.services.prepareProtagonist()).status, 'failed');
        assert.equal(f.requests.length, 1);
        const retry = f.services.prepareProtagonist({ manual: true });
        assert.equal(retry, f.services.prepareProtagonist({ manual: true }));
        assert.equal((await retry).ok, true);
        assert.equal(f.requests.length, 2);
        assert.equal((await f.services.getLedger().effectiveState()).characters.size, 1);
    });
});

test('数据库暂未加载时不生成，加载通知到达后补档且销毁后停止监听', async t => {
    const f = await createGenerationFixture({ seedHero: false, seedAttributes: true,
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

test('主角生成在途切聊天、换 API、重置、销毁或更换模型时拒绝迟到写入和通知', async t => {
    for (const mode of ['chat', 'api', 'reset', 'dispose', 'route-success', 'route-failure']) await t.test(mode, async t => {
        let model = 'fixture';
        const f = await createGenerationFixture({ seedHero: false, serviceOptions: { generationMaxRounds: 0,
            getAutoIllustration: () => ({ llm: { source: 'openai', endpoint: 'https://example.invalid/v1', model, apiKey: 'fixture' } }),
        } });
        t.after(f.dispose);
        const updates = [];
        f.services.onProtagonistUpdated(value => updates.push(value));
        let release;
        let entered;
        const started = new Promise(resolve => { entered = resolve; });
        f.setCallback(() => new Promise(resolve => { release = resolve; entered(); }));
        const pending = f.services.prepareProtagonist();
        await started;
        if (mode === 'chat') f.setChat('other-chat');
        else if (mode === 'api') f.host.AutoCardUpdaterAPI = fakeApi();
        else if (mode === 'reset') f.services.resetChat();
        else if (mode === 'dispose') f.services.dispose();
        else model = 'replacement';
        if (mode === 'route-failure') f.setFailure(true);
        const published = updates.length;
        release();
        assert.equal((await pending).reason, 'request-stale');
        assert.equal(f.db.sheets.sheet_igscbprofile.content.length, 1);
        assert.equal(f.requests.length, 1);
        assert.equal(updates.length, published);
        if (mode.startsWith('route')) assert.notEqual(f.services.getProtagonist()?.status, 'generating');
    });
});

test('手动检查会重读过期 ready，缺档案时生成且重复检查不重复生成', async t => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    assert.equal((await f.services.prepareProtagonist()).status, 'ready');
    assert.equal(f.requests.length, 0);
    clearProfileRows(f);
    f.services.resetChat();
    assert.equal((await f.services.prepareProtagonist({ manual: true })).ok, true);
    assert.equal((await f.services.getLedger().effectiveState()).characters.size, 1);
    assert.equal(f.requests.length, 1);
    assert.equal((await f.services.prepareProtagonist()).ok, true);
    assert.equal(f.requests.length, 1);
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
        const f = await createGenerationFixture({ seedHero: false, seedAttributes: true, serviceOptions: {
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
        if (mode === 'recover') assert.equal(f.requests[0].entities.some(e => e.kind === 'profile-deck'), true);
    });
});

test('三模式战斗内容先行且不受 buildMode 阻断，六维后到零请求转 ready 并保留手写分值', async t => {
    for (const kind of ['daily', 'combat', 'both']) await t.test(kind, async t => {
        const f = await createGenerationFixture({ seedHero: false, seedAttributes: false, serviceOptions: {
            getReaderSettings: () => ({ combatExpansion: { enabled: true, kind } }),
            buildMode: () => ({ ready: false, reason: 'stats-build-policy-waiting' }),
        } });
        t.after(f.dispose);
        const first = f.services.prepareProtagonist();
        assert.equal(first, f.services.prepareProtagonist());
        const waiting = await first;
        assert.equal(waiting.ok, false);
        assert.equal(waiting.status, 'waiting-attributes');
        assert.equal(waiting.reason, 'combat-attributes-waiting');
        assert.equal(waiting.contentReady, true);
        assert.equal(waiting.attributesReady, false);
        assert.equal(f.requests.length, 1);
        assert.equal(f.requests[0].entities.some(e => e.kind === 'profile-deck'), true);
        assert.equal(f.requests[0].entities.some(e => e.kind === 'profile-init' || e.input?.combatInit), false);
        // 内容已落库可查看，但未伪造主角六维；三模式都接管物品表。
        const beforeAttrs = await f.services.getLedger().effectiveState();
        assert.equal(beforeAttrs.characters.size, 1);
        assert.equal(abilitiesForName(beforeAttrs, '艾拉', '艾拉').initialized, false);
        assert.equal((await f.services.takeoverInventory()).ok, true);
        assert.equal(f.db.sheets.sheet_userbag.updateConfig.updateFrequency, 0);
        // 权威六维落账后零模型请求自动转 ready 且保留手写分值。
        const scores = { str: 15, dex: 12, con: 12, int: 12, wis: 12, cha: 9 };
        assert.equal((await f.services.writeManualInit('艾拉', { className: '自选', role: 'warrior', scores })).ok, true);
        f.db.fireTableUpdated();
        await settle();
        assert.equal(f.services.getProtagonist().status, 'ready');
        assert.deepEqual(f.services.lifeSource().readAbilities('艾拉').base, scores);
        assert.equal((await f.services.prepareProtagonist()).status, 'ready');
        assert.equal(f.requests.length, 1);
    });
});

test('战斗内容先完成时 session 阻止无六维开战，六维到达后零模型请求进大厅并冻结属性修订', async t => {
    const records = new Map();
    const f = await createGenerationFixture({
        seedHero: false, seedAttributes: false,
        serviceOptions: {
            generationMaxRounds: 0,
            chatRecord: {
                read: (anchor, combatId) => ({ ok: true, value: records.get(combatId) || null }),
                write: async (anchor, combatId, patch) => {
                    records.set(combatId, { ...(records.get(combatId) || {}), ...patch });
                    return { ok: true };
                },
            },
        },
    });
    t.after(f.dispose);
    f.setReply(prompt => {
        const payload = JSON.parse(prompt.user);
        const base = JSON.parse(modelReply(prompt));
        for (const item of base.entities) {
            const entity = payload.entities.find(e => e.key === item.key);
            if (entity?.kind === 'enemy-roster') {
                item.value = {
                    enemies: (entity.input?.enemies || []).map(enemy => ({
                        name: enemy.name,
                        role: 'brute',
                        skills: [
                            ['猛击', 'strike'],
                            ['重撞', 'heavy'],
                        ],
                    })),
                };
            } else if (entity?.kind === 'battle-reward') {
                item.value = {
                    slots: (entity.input?.slots || []).map(slot => (
                        slot.kind === 'keepsake'
                            ? { index: slot.index, name: `战利品${slot.index}`, origin: '战后所得' }
                            : { index: slot.index, name: `草药${slot.index}`, kind: 'heal' }
                    )),
                };
            } else if (entity?.kind === 'encounter-theme') {
                item.value = { theme: 'forest' };
            }
        }
        return JSON.stringify(base);
    });
    const chat = f.host.SillyTavern.getContext().chat;
    chat.splice(0, chat.length, { is_user: true, mes: '出发' }, { is_user: false, swipe_id: 0, mes: '[igs-combat:start|林间遭遇|史莱姆|我|normal]' });
    const session = f.services.getSession();
    const blocked = await session.prepare(1);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'combat-attributes-waiting');
    const requestsBefore = f.requests.length;
    assert.ok(requestsBefore >= 1);
    assert.equal(f.requests.some(req => req.entities.some(e => e.kind === 'profile-init' || e.input?.combatInit)), false);
    assert.equal((await f.services.getLedger().effectiveState()).characters.size, 1);
    const scores = { str: 16, dex: 11, con: 14, int: 10, wis: 10, cha: 11 };
    assert.equal((await f.services.writeManualInit('艾拉', { className: '自选', role: 'warrior', scores })).ok, true);
    const ready = await session.prepare(1);
    assert.equal(ready.ok, true, ready.reason);
    assert.equal(f.requests.length, requestsBefore, '六维到达后不再重发主角或战斗内容模型请求');
    assert.ok(session.state().lobby.attributesFrozen?.revision);
    const started = session.start();
    assert.equal(started.ok, true, started.reason);
    const frozenRevision = session.state().record.setup.attributesFrozen.revision;
    assert.ok(frozenRevision);
    assert.deepEqual(session.state().record.setup.attributesFrozen.allies[session.state().lobby.heroId].base, scores);
});

test('初始装备写失败时保留已保存档案与意图，冷恢复只补发原装备且不重复授予', async t => {
    const storage = createMemoryStorage();
    const f = await createGenerationFixture({ seedHero: false, seedAttributes: true, serviceOptions: { storage } });
    t.after(f.dispose);
    const insert = f.db.api.insertRow;
    let failBag = true;
    const bagName = f.db.sheets.sheet_userbag.name;
    f.db.api.insertRow = (first, second) => {
        const name = typeof first === 'object' ? first.tableName : first;
        if (failBag && name === bagName) return -1;
        return insert(first, second);
    };
    const first = await f.services.prepareProtagonist();
    assert.equal(first.ok, false);
    assert.equal(first.reason, 'inventory-write-failed');
    assert.equal(f.services.getProtagonist().deckReady, true);
    assert.equal(f.services.getProtagonist().contentReady, false);
    assert.equal(f.requests.length, 1);
    assert.equal((await f.services.getLedger().effectiveState()).characters.size, 1);
    const profileRowsBefore = f.db.sheets[COMBAT_TABLE_SPECS.profile.uid].content.length;
    // 模拟冷恢复：恢复背包写能力后显式重试，只补发原装备，不重调模型也不重写档案。
    failBag = false;
    f.services.resetChat();
    const recovered = await f.services.prepareProtagonist({ manual: true });
    assert.equal(recovered.ok, true, recovered.reason);
    assert.equal(recovered.status, 'ready');
    assert.equal(f.requests.length, 1, '冷恢复不得重新请求模型');
    assert.equal(f.db.sheets[COMBAT_TABLE_SPECS.profile.uid].content.length, profileRowsBefore, '不得重写已保存职业与卡组档案');
    const bag = f.services.inventoryTables().read();
    assert.equal(bag.ok, true);
    assert.equal(bag.inventory.items.filter(item => item.name === '长剑').reduce((sum, item) => sum + item.quantity, 0), 1);
    // 换楼或再次检查不重复授予初始装备。
    f.host.SillyTavern.getContext().chat.push({ is_user: false, swipe_id: 0, mes: '新的一楼。' });
    assert.equal((await f.services.prepareProtagonist({ manual: true })).status, 'ready');
    const bagAfter = f.services.inventoryTables().read();
    assert.equal(bagAfter.inventory.items.filter(item => item.name === '长剑').reduce((sum, item) => sum + item.quantity, 0), 1);
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

test('bootstrap 日常模式自动统一初始化主角六维与货币，战斗内容独立先行且骰子/正文/挑战同源冷复用', async t => {
    const { bootstrapIGS } = await import('../src/core/bootstrap.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { traitAttrsOf } = await import('../src/scene/stats/stat-traits.js');
    const { sessionKeyFor } = await import('../src/combat/session.js');
    const { cocCheckRollsFor, cocFaces } = await import('../src/scene/stats/stat-coc-checks.js');
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: 'https://igs.invalid/',
        beforeParse(window) {
            const create = window.document.createElement.bind(window.document);
            window.document.createElement = (...args) => {
                const node = create(...args);
                if (node.localName === 'style') node.type = 'text/plain';
                return node;
            };
        },
    });
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    db.sheets.sheet_options = { uid: 'sheet_options', name: '检定建议表', content: [
        ['row_id', '展示文本', '骰子命令'], ['1', '推开石门', '检定 主角 力量'],
    ] };
    const tables = createCombatTables({ api: db.api });
    assert.equal((await tables.ensure()).ok, true);
    assert.equal((await tables.append('stats', { id: 'sc|legacy|enabled', type: 'chat', character: '主角',
        anchor: null, createdAt: 0, change: 'chat:enabled', payload: { key: 'chat:enabled', value: true },
    })).ok, true);
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
            stats: { enabled: true, ruleset: 'coc7', checkFx: false, bars: { money: true }, autoSkill: false, sheetGen: 'off', backfill: 'off' } }),
        'igs-reader-settings-v9-default': JSON.stringify({ titleScreen: false, typewriter: { enabled: false }, combatExpansion: { enabled: true, kind: 'daily', skin: 'initial' } }),
    });
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '艾拉', chatId: context.getCurrentChatId });
    const requests = [];
    const heroInitTasks = [];
    let floorReady;
    const options = { global: { document: dom.window.document, localStorage: storage, AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => context },
        Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, dispatchEvent: dom.window.dispatchEvent.bind(dom.window), addEventListener: dom.window.addEventListener.bind(dom.window), removeEventListener: dom.window.removeEventListener.bind(dom.window) },
        autoAttachMagicWand: false, startupDelayMs: 0, secondaryLlm: { request: async (prompt, config) => {
            let entities;
            try { entities = JSON.parse(prompt.user).entities; } catch { /* 主角统一初始化请求不是战斗实体批次 */ }
            if (!Array.isArray(entities)) return new Promise(resolve => heroInitTasks.push({ resolve, config }));
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
    await waitFor(() => heroInitTasks.length === 1, '主角统一初始化请求未启动');
    // 战斗内容先行，不等待主角六维模型返回；六维未到时人物页停在等待六维状态。
    await waitFor(async () => (await ledger.effectiveState()).characters.size === 1, '战斗内容未在主角六维完成前落库');
    assert.equal(requests.length, 1);
    assert.match(dom.window.document.querySelector('#igs-combat-deck-panel').textContent, /等待六维|艾拉/);
    const originSettings = app.openSettings({ page: 'origin' });
    await waitFor(() => /本聊天正在运行/.test(dom.window.document.querySelector('#igs-unified-settings').textContent),
        'Origin 不应等待主角初始化模型完成');
    assert.equal(heroInitTasks.length, 1);
    originSettings.controller.close();
    const walletSettings = app.openSettings({ page: 'stats' });
    heroInitTasks[0].config.onSlow();
    await settle();
    assert.equal(dom.window.document.querySelector('[data-action="stats-op:currency-retry"]').disabled, true);
    assert.match(dom.window.document.querySelector('.igs-stats-wallets').textContent, /仍在处理/);
    heroInitTasks[0].resolve(JSON.stringify({
        attributes: { str: 14, dex: 12, con: 13, int: 11, wis: 10, cha: 15 },
        currency: { name: '铜钱', initial: 100, prices: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 }, rate: 0.25 },
    }));
    const attrs = await waitFor(async () => {
        const state = await ledger.effectiveState();
        const value = abilitiesForName(state, '艾拉', '艾拉');
        return state.attributes?.heroId && value?.initialized ? value : null;
    }, '主角属性未从权威表读回');
    await waitFor(() => /铜钱100/.test(dom.window.document.querySelector('.igs-stats-wallets').textContent),
        '统一初始化慢请求未完成余额读回');
    assert.equal(heroInitTasks.length, 1);
    assert.equal(requests.length, 1, '主角六维到达后战斗不再重发模型请求');
    walletSettings.controller.close();
    assert.deepEqual(traitAttrsOf({}, '主角'), Object.fromEntries(Object.entries({ str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' }).map(([key, label]) => [label, attrs.scores[key]])));
    dom.window.document.querySelector('[data-deck-act="close"]')?.click();
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
        assert.equal(heroInitTasks.length, 1, `${kind} 切换不重发主角初始化`);
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

function chatStorageFixture(t, { api = fakeApi(), cellMax, ...hooks } = {}) {
    const context = { chatId: 'chat-store-a', chat: [], chatMetadata: {} };
    const storage = createMemoryStorage();
    let currentApi = api;
    const store = createIgsChatStore({ ...hooks, api: () => currentApi, chatId: () => context.chatId,
        chat: () => context.chat, cellMax, storage,
        evidence: chatId => readIgsChatEvidence({ context, chatId, storage }),
    });
    t.after(() => store.dispose());
    return { api, context, storage, store, setApi(value) { currentApi = value; } };
}

test('聊天存储：有效空档按需建表，Origin 与积分独立往返且不建立战斗表', async t => {
    const f = chatStorageFixture(t);
    const owner = f.store.get();
    assert.equal(owner.layout().layout, 'v2');
    assert.equal((await owner.origin.load()).ok, true);
    const intent = owner.origin.prepare(owner.origin.read(), serializeLedger(createLedger(f.context.chatId)));
    assert.equal((await owner.origin.commit(intent)).ok, true);
    assert.deepEqual(owner.origin.read().raw, intent.raw);
    assert.equal((await owner.points.load()).balance, 0);
    const record = pointsRecord({ kind: 'start', sourceId: 'round-a', game: 'snake', chatId: f.context.chatId,
        anchor: { floorId: 'floor-a', swipeId: 0 }, parent: null });
    assert.equal((await owner.points.commit(record)).ok, true);
    assert.deepEqual(owner.points.read().rows, [{ ...record, change: '' }]);
    assert.deepEqual(Object.values(f.api.tables).filter(v => v?.uid && v.name.startsWith('IGS')).map(v => v.name).sort(),
        ['layout', 'origin', 'points'].map(k => IGS_TABLE_SPECS[k].name).sort());
    assert.equal(owner.raw.read().profile, null);
});

test('聊天存储：旧记录和本聊天恢复证据保持 legacy，不复制或覆盖历史', async t => {
    const f = chatStorageFixture(t);
    const legacy = await ready(f.api);
    t.after(() => legacy.client.dispose());
    assert.equal((await legacy.append('ledger', ledger('old'))).ok, true);
    const before = clone(f.api.tables);
    const owner = f.store.get();
    assert.equal(owner.layout().layout, 'legacy');
    assert.equal((await owner.raw.ensure()).ok, true);
    assert.deepEqual(owner.raw.read().ledger, [ledger('old')]);
    assert.deepEqual(f.api.tables, before);
    for (const kind of ['metadata', 'backup', 'floor', 'intent']) await t.test(kind, async t => {
        const h = chatStorageFixture(t);
        if (kind === 'metadata') h.context.chatMetadata.origin_v2 = { version: 2 };
        if (kind === 'backup') h.context.chatMetadata.igs_stats_v1_backup = { version: 1 };
        if (kind === 'floor') h.context.chat.push({ swipe_info: [{ extra: { igs_points_uid: 'old-floor' } }] });
        if (kind === 'intent') h.storage.setItem(`igs-combat:outbox:${h.context.chatId}`, JSON.stringify({ chatId: h.context.chatId, report: 'pending' }));
        const old = h.store.get();
        assert.equal(old.layout().layout, 'legacy');
        assert.equal((await old.stats.ensure()).ok, true);
        assert.equal(h.api.tables[IGS_TABLE_SPECS.layout.uid], undefined);
        assert.equal(h.api.tables[COMBAT_TABLE_SPECS.profile.uid], undefined);
    });
});

test('聊天存储：空导出、读错、未知身份及损坏资料均不创建空档', async t => {
    for (const kind of ['empty', 'read', 'identity', 'metadata', 'intent', 'segments', 'header', 'future', 'unmarked']) await t.test(kind, async t => {
        const f = chatStorageFixture(t);
        if (kind === 'empty') f.api.emptyExport = true;
        if (kind === 'read') f.api.failRead = true;
        if (kind === 'identity') f.context.chatId = '';
        if (kind === 'metadata') delete f.context.chatMetadata;
        if (kind === 'intent') f.storage.setItem(`igs-combat:outbox:${f.context.chatId}`, '{');
        if (['segments', 'header', 'future', 'unmarked'].includes(kind)) {
            const specs = kind === 'future' ? IGS_TABLE_SPECS : COMBAT_TABLE_SPECS;
            const tables = createCombatTables({ api: f.api, specs, cellMax: 10 });
            t.after(() => tables.client.dispose());
            const selected = kind === 'future' ? 'layout' : 'stats';
            assert.equal((await tables.ensure({ kinds: [selected] })).ok, true);
            if (kind === 'header') f.api.tables[specs.stats.uid].content[0].pop();
            else if (kind === 'future') assert.equal((await tables.append('layout', { ...IGS_LAYOUT_RECORD,
                payload: { version: 99, layout: 'future' } })).ok, true);
            else {
                assert.equal((await tables.append('stats', { ...attribute, id: 'legacy-corrupt' })).ok, true);
                if (kind === 'segments') f.api.tables[specs.stats.uid].content.pop();
                else {
                    const v2 = createCombatTables({ api: f.api, specs: IGS_TABLE_SPECS });
                    t.after(() => v2.client.dispose());
                    assert.equal((await v2.ensure({ kinds: ['attribute'] })).ok, true);
                    assert.equal((await v2.append('attribute', attribute)).ok, true);
                }
            }
        }
        const before = clone(f.api.tables), inserts = f.api.calls.insert.length, imports = f.api.calls.imports;
        const result = await f.store.get().stats.ensure();
        assert.equal(result.ok, false, kind);
        assert.equal(result.status, ['empty', 'metadata'].includes(kind) ? 'waiting' : 'failed');
        assert.deepEqual(f.api.tables, before);
        assert.equal(f.api.calls.insert.length, inserts);
        assert.equal(f.api.calls.imports, imports);
    });
});

test('聊天存储：标记保存状态不明和补表中断从权威记录恢复，不重复标记', async t => {
    for (const phase of ['marker', 'table']) await t.test(phase, async t => {
        const f = chatStorageFixture(t);
        const insert = f.api.insertRow, importTemplate = f.api.importTemplateFromData;
        if (phase === 'marker') f.api.insertRow = options => { insert(options); return -1; };
        else f.api.importTemplateFromData = async template => {
            if (template[IGS_TABLE_SPECS.stats.uid]) return { success: false };
            return importTemplate(template);
        };
        const first = await f.store.get().stats.ensure();
        assert.equal(first.ok, phase === 'marker');
        assert.equal(f.store.get().layout().marked, true);
        const mark = clone(f.api.tables[IGS_TABLE_SPECS.layout.uid]);
        f.api.insertRow = insert; f.api.importTemplateFromData = importTemplate;
        f.store.reset();
        assert.equal((await f.store.get().stats.ensure()).ok, true);
        assert.deepEqual(f.api.tables[IGS_TABLE_SPECS.layout.uid], mark);
        assert.equal(f.store.get().stats.read().stats.length, 0);
        assert.equal(f.api.tables[IGS_TABLE_SPECS.profile.uid], undefined);
    });
});

test('聊天存储：排队后切聊天或换 API 使旧句柄和通知失效', async t => {
    for (const change of ['chat', 'api', 'reset']) await t.test(change, async t => {
        const f = chatStorageFixture(t);
        const owner = f.store.get();
        assert.equal((await owner.stats.ensure()).ok, true);
        let release;
        const barrier = owner.raw.serial(() => new Promise(resolve => { release = resolve; }));
        await new Promise(resolve => setImmediate(resolve));
        const writing = owner.stats.append({ ...attribute, id: 'late' });
        const snapshot = clone(f.api.tables);
        if (change === 'chat') f.context.chatId = 'chat-store-b';
        if (change === 'api') f.setApi(fakeApi());
        if (change === 'reset') f.store.reset();
        const next = f.store.get();
        assert.notEqual(next, owner);
        release(); await barrier;
        assert.equal((await writing).ok, false);
        assert.deepEqual(f.api.tables, snapshot);
        assert.equal((await owner.inventory.ensure()).reason, 'request-stale');
        assert.equal(owner.stats.read().reason, 'request-stale');
        assert.equal((await next.stats.ensure()).ok, true);
    });
});

test('聊天存储：库存排队写入与订阅在切聊天、换 API、重置及销毁后失效', async t => {
    for (const change of ['chat', 'api', 'reset', 'dispose']) await t.test(change, async t => {
        const db = createLedgerMockHost({ supportCallbacks: true });
        db.sheets.sheet_userbag = userInventorySheet();
        const f = chatStorageFixture(t, { api: db.api });
        const owner = f.store.get();
        assert.equal((await owner.inventory.ensure()).ok, true);
        assert.equal((await owner.inventory.changeQuantities({ name: '金币', delta: 10 })).ok, true);
        const rename = await owner.inventory.prepareRename({ from: '金币', to: '银币', balance: 10 });
        assert.equal(rename.ok, true);
        let notifications = 0;
        const off = owner.stats.subscribe(() => { notifications += 1; });
        db.fireTableUpdated();
        assert.equal(notifications, 1);
        let release;
        const barrier = owner.raw.serial(() => new Promise(resolve => { release = resolve; }));
        await new Promise(resolve => setImmediate(resolve));
        const writing = [owner.inventory.ensure(),
            owner.inventory.changeQuantities({ name: '金币', delta: -1 }),
            owner.inventory.setGearRow('长剑', { definition: {}, equipped: false }),
            owner.inventory.prepareRename({ from: '金币', to: '银币', balance: 10 }),
            owner.inventory.rename(rename.guard)];
        await new Promise(resolve => setImmediate(resolve));
        const before = clone(db.sheets), calls = clone(db.calls);
        if (change === 'chat') f.context.chatId = 'chat-store-b';
        if (change === 'api') f.setApi(fakeApi());
        if (change === 'reset') f.store.reset();
        if (change === 'dispose') f.store.dispose();
        else f.store.get();
        release(); await barrier;
        for (const result of await Promise.all(writing)) assert.equal(result.reason, 'request-stale');
        assert.deepEqual(db.sheets, before);
        for (const key of ['insertRow', 'updateRow', 'deleteRow', 'importTemplateFromData', 'refreshDataAndWorldbook'])
            assert.equal(db.calls[key], calls[key], key);
        db.fireTableUpdated(); off(); off();
        assert.equal(notifications, 1);
    });
});

test('永久六维：手改分段中断后，冷恢复只补原记录；同键冲突保留原行', async t => {
    for (const legacy of [false, true]) for (const corrupt of [false, true]) await t.test(`${legacy ? 'legacy' : 'v2'}-${corrupt ? '冲突' : '续写'}`, async t => {
        const f = chatStorageFixture(t, { cellMax: 16 });
        if (legacy) f.context.chatMetadata.origin_v2 = { version: 2 };
        const make = () => createCombatLedger({ tables: f.store.get().raw, attributeStore: f.store.get().attributeStore,
            chat: f.context.chat, chatId: f.context.chatId, userName: '艾拉' });
        const owner = f.store.get();
        assert.equal((await owner.raw.ensure()).ok, true);
        const spec = (legacy ? COMBAT_TABLE_SPECS : IGS_TABLE_SPECS).attribute;
        const insert = f.api.insertRow;
        f.api.insertRow = opts => opts.tableName === spec.name && opts.data['分段'].startsWith('2/') ? -1 : insert(opts);
        const scores = { str: 12, dex: 11, con: 10, int: 9, wis: 8, cha: 7 };
        assert.equal((await make().writeInit('艾拉', { role: 'warrior', scores }, { manual: true })).ok, false);
        f.api.insertRow = insert;
        const rows = f.api.tables[spec.uid].content;
        assert.equal(rows.length, 2);
        if (corrupt) rows[1][rows[0].indexOf('载荷JSON')] += 'x';
        const original = clone(rows);
        f.store.reset();
        const cold = make();
        assert.equal((await cold.effectiveState()).ok, false);
        assert.deepEqual(rows, original);
        const recovered = await cold.recoverAttributes();
        assert.equal(recovered.ok, !corrupt, JSON.stringify(recovered));
        if (corrupt) { assert.deepEqual(rows, original); assert.equal((await cold.recoverAttributes()).ok, false); }
        else {
            assert.deepEqual(rows[1], original[1]);
            assert.deepEqual(abilitiesForName(await cold.effectiveState(), '艾拉', '艾拉').permanentScores, scores);
            const count = rows.length;
            assert.equal((await cold.recoverAttributes()).ok, true);
            assert.equal(rows.length, count);
        }
    });
});


test('永久六维：数值编辑保留旧卡，战斗冷读同一底数；战斗改变修订时拒绝旧草稿', async t => {
    const f = chatStorageFixture(t);
    const owner = () => f.store.get();
    const context = Object.assign(f.context, { name1: '艾拉', name2: '小雪', getCurrentChatId: () => f.context.chatId });
    assert.equal((await owner().raw.ensure()).ok, true);
    assert.equal((await owner().stats.ensure()).ok, true);
    const rt = createStatsRuntime({ getContext: () => context, readSettings: () => ({ enabled: true, sheetGen: 'off', backfill: 'off' }),
        generationIdentity: owner, statsTables: () => owner().statsAccess, attributeAccess: () => owner().attributeAccess });
    t.after(() => rt.destroy());
    assert.equal((await rt.enableForChat()).ok, true);
    await rt.whenSaved();
    const oldCard = { scale: 'score', attributes: { 力量: 22, 敏捷: 12, 体质: 11, 智力: 10, 感知: 9, 魅力: 8 } };
    assert.equal((await owner().statsAccess.append([{ id: 'sheet-xue', type: 'sheet', character: '主角', anchor: null,
        createdAt: 2, change: 'sheet:小雪', payload: { key: 'sheet:小雪', value: oldCard } }])).ok, true);
    assert.equal(rt.npcAbilities('小雪').initialScores.str, 22);
    const draft = () => rt.sheetOp('draft', '小雪');
    const edit = (stamp, tier) => rt.sheetOp('edit', '小雪', { ...stamp, skill: '力量', tier });
    assert.equal((await edit(draft(), '29')).ok, true);
    const stale = draft();
    const makeLedger = () => createCombatLedger({ tables: owner().raw, attributeStore: owner().attributeStore, userName: '艾拉', chat: context.chat });
    const l = makeLedger();
    context.chat.push({ is_user: false, mes: '[igs-combat:rel|小雪|稍弱]', swipe_id: 0 });
    assert.equal((await l.scanLife()).ok, true);
    assert.equal((await edit(stale, '20')).reason, 'stats-attribute-conflict');
    f.store.reset();
    const cold = abilitiesForName(await makeLedger().effectiveState(), '小雪', '艾拉');
    assert.deepEqual(cold.permanentScores, rt.npcAbilities('小雪').permanentScores);
    assert.equal(cold.initialScores.str, 29);
    assert.equal(cold.scores.str, 28);
    assert.equal(owner().statsAccess.read().stats.find(row => row.id === 'sheet-xue').payload.value.attributes.力量, 22);
    assert.deepEqual(owner().attributeStore.read().rows.map(row => row.type), ['npc-base', 'rel']);
});

async function editedSheetNpc(t, options = {}, fixture = {}) {
    const f = chatStorageFixture(t, fixture);
    const owner = () => f.store.get();
    const context = Object.assign(f.context, { name1: '艾拉', name2: '小雪', getCurrentChatId: () => f.context.chatId });
    assert.equal((await owner().raw.ensure()).ok, true);
    assert.equal((await owner().stats.ensure()).ok, true);
    const fail = { on: false };
    const make = (extra = {}) => {
        const rt = createStatsRuntime({ getContext: () => context, readSettings: () => ({ enabled: true, sheetGen: 'off', backfill: 'off' }),
            generationIdentity: owner, attributeAccess: () => owner().attributeAccess, currencyEditStorage: f.storage,
            statsTables: () => ({ ...owner().statsAccess, append: (rows, opts) => fail.on
                ? Promise.resolve({ ok: false, reason: 'fixture-write-failed' }) : owner().statsAccess.append(rows, opts) }),
            ...options, ...extra });
        t.after(() => rt.destroy());
        return rt;
    };
    const rt = make();
    assert.equal((await rt.enableForChat()).ok, true);
    await rt.whenSaved();
    const card = { scale: 'score', attributes: { 力量: 22, 敏捷: 12, 体质: 11, 智力: 10, 感知: 9, 魅力: 8 } };
    assert.equal((await owner().statsAccess.append([{ id: 'sheet-xue', type: 'sheet', character: '主角', anchor: null,
        createdAt: 2, change: 'sheet:小雪', payload: { key: 'sheet:小雪', value: card } }])).ok, true);
    const edit = async (runtime, tier) => runtime.sheetOp('edit', '小雪', { ...runtime.sheetOp('draft', '小雪'), skill: '力量', tier });
    assert.equal((await edit(rt, '29')).ok, true);
    assert.equal(rt.npcAbilities('小雪').initialScores.str, 29);
    const combatRead = async () => abilitiesForName(await createCombatLedger({ tables: owner().raw, attributeStore: owner().attributeStore,
        userName: '艾拉', chat: context.chat }).effectiveState(), '小雪', '艾拉');
    const drops = () => owner().statsAccess.read().stats.filter(row => row.payload?.key === 'drop:小雪');
    return { f, owner, context, fail, make, rt, edit, combatRead, drops };
}

test('永久六维：删除角色卡同撤手改底数，成长与历史保留；保存中断后冷恢复只补原记录', async t => {
    const s = await editedSheetNpc(t);
    s.context.chat.push({ is_user: false, mes: '[igs-combat:rel|小雪|稍弱]', swipe_id: 0 });
    assert.equal((await createCombatLedger({ tables: s.owner().raw, attributeStore: s.owner().attributeStore,
        userName: '艾拉', chat: s.context.chat }).scanLife()).ok, true);
    const before = s.rt.npcAbilities('小雪');
    assert.equal(before.initialScores.str, 29);
    s.fail.on = true;
    const failed = await s.rt.sheetOp('remove', '小雪');
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, 'stats-generation-save-unverified');
    assert.ok(s.rt.getCatalog().sheets.小雪, '未确认前不发布删除');
    assert.equal(s.rt.npcAbilities('小雪').initialScores.str, 29);
    assert.equal(s.drops().length, 0);
    s.rt.destroy();
    s.f.store.reset();
    s.fail.on = false;
    const cold = s.make({ getBackgroundRequest: () => () => assert.fail('恢复删除不得请求模型') });
    cold.buildPolicy();
    assert.ok(cold.notices().some(n => n.id === 'generation-save'));
    const recovered = await cold.noticeAction('generation-save', 'retry');
    assert.equal(recovered.ok, true, JSON.stringify(recovered));
    assert.equal(cold.getCatalog().sheets.小雪, undefined);
    const after = cold.npcAbilities('小雪');
    assert.equal(after.initialized, false);
    assert.equal(after.baseId, null);
    assert.equal(after.tier, before.tier, '关系成长保留');
    assert.notDeepEqual(after.permanentScores, before.permanentScores);
    assert.deepEqual(s.drops().map(row => row.payload.value), [before.baseId]);
    s.f.store.reset();
    const combat = await s.combatRead();
    assert.deepEqual(combat.permanentScores, cold.npcAbilities('小雪').permanentScores);
    assert.equal(combat.initialized, false);
    assert.deepEqual(s.owner().attributeStore.read().rows.map(row => row.type), ['npc-base', 'rel']);
});

test('永久六维：重生成取代发起时的手改，迟到结果不覆盖之后确认的新手改', async t => {
    for (const late of [false, true]) await t.test(late ? '迟到' : '覆盖', async t => {
        let resolve, calls = 0;
        const reply = new Promise(yes => { resolve = yes; });
        const s = await editedSheetNpc(t, { getBackgroundRequest: () => () => { calls += 1; return reply; } });
        const replaced = s.rt.npcAbilities('小雪').baseId;
        assert.equal(typeof replaced, 'string');
        const regen = s.rt.sheetOp('regen', '小雪');
        for (let i = 0; i < 20 && !calls; i += 1) await new Promise(next => setImmediate(next));
        assert.equal(calls, 1);
        if (late) assert.equal((await s.edit(s.rt, '25')).ok, true);
        resolve(JSON.stringify({ 小雪: { 属性: { 力量: '很弱' }, 技能: { 潜行: '熟练' } } }));
        assert.equal((await regen).ok, true);
        const view = s.rt.npcAbilities('小雪');
        if (late) {
            assert.equal(view.initialScores.str, 25);
            assert.notEqual(view.baseId, replaced);
        } else {
            assert.ok(view.initialScores.str >= 3 && view.initialScores.str <= 6, String(view.initialScores.str));
            assert.equal(view.baseId, null);
        }
        assert.deepEqual(s.drops().map(row => row.payload.value), [replaced]);
        s.f.store.reset();
        assert.deepEqual((await s.combatRead()).permanentScores, s.rt.npcAbilities('小雪').permanentScores);
        assert.equal(calls, 1);
    });
});

test('永久六维：属性保存中断后提示可恢复；换 owner、切聊与销毁后的旧动作无副作用，读回确认后才通知', async t => {
    const hooks = { confirmed: 0, runtime: null };
    const s = await editedSheetNpc(t, {}, { cellMax: 32, onAttributesConfirmed: () => { hooks.confirmed += 1; },
        onAttributesPending: () => hooks.runtime?.refreshAttributeRecovery() });
    hooks.runtime = s.rt;
    hooks.confirmed = 0;
    const spec = IGS_TABLE_SPECS.attribute, insert = s.f.api.insertRow;
    const inserts = () => s.f.api.calls.insert.filter(call => call.tableName === spec.name).length;
    const pending = () => s.owner().attributeStore.status().reason === 'stats-attribute-save-pending';
    const notice = runtime => runtime.notices().find(n => n.id === 'attribute-save');
    s.f.api.insertRow = opts => opts.tableName === spec.name && opts.data['分段'].startsWith('2/') ? -1 : insert(opts);
    assert.equal((await s.edit(s.rt, '25')).ok, false);
    s.f.api.insertRow = insert;
    assert.equal(hooks.confirmed, 0);
    assert.equal(notice(s.rt)?.kind, 'recovery');
    assert.deepEqual(notice(s.rt).actions.map(action => action[0]), ['retry']);
    let count = inserts();
    s.f.setApi(fakeApi());
    assert.equal((await s.rt.noticeAction('attribute-save', 'retry')).reason, 'request-stale');
    s.f.setApi(s.f.api);
    assert.equal((await s.rt.noticeAction('attribute-save', 'retry')).reason, 'request-stale', '旧 owner 的提示不能在新 owner 上执行');
    assert.equal(inserts(), count);
    s.rt.refreshAttributeRecovery();
    s.f.api.insertRow = opts => { if (opts.tableName === spec.name) s.context.chatId = 'chat-store-b'; return insert(opts); };
    assert.equal((await s.rt.noticeAction('attribute-save', 'retry')).reason, 'request-stale');
    s.f.api.insertRow = insert;
    s.context.chatId = 'chat-store-a';
    assert.equal(hooks.confirmed, 0, '切聊后的写入未确认，不通知');
    assert.equal(pending(), true);
    s.rt.refreshAttributeRecovery();
    assert.ok(notice(s.rt));
    s.rt.destroy();
    count = inserts();
    assert.equal((await s.rt.noticeAction('attribute-save', 'retry')).reason, 'request-stale');
    assert.equal(inserts(), count);
    assert.equal(pending(), true);
    const cold = s.make({ getBackgroundRequest: () => () => assert.fail('恢复属性不得请求模型') });
    hooks.runtime = cold;
    cold.buildPolicy();
    assert.equal(notice(cold)?.kind, 'recovery');
    const done = await cold.noticeAction('attribute-save', 'retry');
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(hooks.confirmed, 1);
    assert.equal(notice(cold), undefined);
    assert.equal(cold.npcAbilities('小雪').initialScores.str, 25);
    s.f.store.reset();
    assert.deepEqual((await s.combatRead()).permanentScores, cold.npcAbilities('小雪').permanentScores);
});

test('永久六维：装备与 Origin 只改生效值，永久分值、属性行与推表底数不变', async t => {
    const base = { str: 14, dex: 12, con: 11, int: 10, wis: 9, cha: 8 };
    const context = { fold: new Map(), heroLevel: 1, table: 'ok', sheetBases: new Map([['小雪', base]]) };
    const plain = computeAttributes({ key: 'npc-xue', name: '小雪' }, context);
    const geared = computeAttributes({ key: 'npc-xue', name: '小雪', gearBonuses: [{ ability: 'str', amount: 2 }] }, context);
    assert.equal(geared.scores.str, plain.scores.str + 2);
    assert.deepEqual(geared.permanentScores, plain.permanentScores);
    assert.equal(geared.revision, plain.revision);
    const s = await editedSheetNpc(t, {}, { userName: () => '艾拉' });
    const scores = { str: 12, dex: 11, con: 10, int: 9, wis: 8, cha: 7 };
    assert.equal((await createCombatLedger({ tables: s.owner().raw, attributeStore: s.owner().attributeStore, chat: s.context.chat,
        userName: '艾拉' }).writeInit('艾拉', { role: 'warrior', scores }, { manual: true })).ok, true);
    const rows = () => s.owner().attributeStore.read().rows.map(row => row.id);
    const before = rows();
    const boosted = s.make({ originStats: () => [{ name: '力量', val: 10 }] });
    for (const rt of [s.rt, boosted]) rt.buildPolicy();
    const str = rt => rt.archive().attributes.find(item => item.name === '力量').value;
    assert.equal(str(boosted) - str(s.rt), 10);
    for (const rt of [s.rt, boosted]) assert.deepEqual(rt.npcAbilities('艾拉').permanentScores, scores);
    assert.deepEqual(rows(), before);
});


test('永久六维：同一底数打开的两份草稿只接受第一份，旧档冷读仍是已确认的分值', async t => {
    const f = chatStorageFixture(t);
    f.context.chatMetadata.origin_v2 = { version: 2 };
    const make = () => createCombatLedger({ tables: f.store.get().raw, attributeStore: f.store.get().attributeStore,
        chat: f.context.chat, userName: '艾拉', now: () => 5 });
    assert.equal((await f.store.get().raw.ensure()).ok, true);
    const ledger = make();
    const build = str => ({ role: 'warrior', scores: { str, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } });
    assert.equal((await ledger.writeInit('艾拉', build(10), { manual: true })).ok, true);
    const view = async l => abilitiesForName(await l.effectiveState(), '艾拉', '艾拉');
    const draft = { manual: true, replace: true, expectedRevision: (await view(ledger)).revision };
    assert.equal(typeof draft.expectedRevision, 'string');
    const a = await ledger.writeInit('艾拉', build(12), draft);
    assert.equal(a.ok, true, a.reason);
    const count = f.api.calls.insert.length;
    const b = await ledger.writeInit('艾拉', build(15), draft);
    assert.equal(b.reason, 'stats-attribute-conflict');
    assert.equal(f.api.calls.insert.length, count);
    f.store.reset();
    const cold = await view(make());
    assert.equal(cold.base.str, 12);
    assert.notEqual(cold.revision, draft.expectedRevision);
});


test('永久六维：成长与生活并发扫描同一楼，冷读只有一条关系记录，换页和删楼不再生效', async t => {
    const f = chatStorageFixture(t);
    const chat = f.context.chat;
    chat.push({ is_user: false, mes: '[igs-combat:rel|史莱姆|远逊]', swipe_id: 0 });
    let clock = 0;
    const make = () => createCombatLedger({ tables: f.store.get().raw, attributeStore: f.store.get().attributeStore,
        chat, userName: '艾拉', now: () => ++clock });
    assert.equal((await f.store.get().raw.ensure()).ok, true);
    const ledger = make();
    const results = await Promise.all([ledger.scanLife(), ledger.scan()]);
    for (const result of results) assert.equal(result.ok, true, JSON.stringify(result.attributeWrite));
    const readTier = async () => abilitiesForName(await make().effectiveState(), '史莱姆', '艾拉').tier;
    f.store.reset();
    assert.equal((await make().read()).attributes.length, 1);
    assert.equal(await readTier(), 'outclassed');
    chat[0].swipe_id = 1;
    assert.equal(await readTier(), 'even');
    chat[0].swipe_id = 0;
    assert.equal(await readTier(), 'outclassed');
    chat.length = 0;
    assert.equal(await readTier(), 'even');
});


test('永久六维：正文关系标签在权威属性表缺失时报失败，不当成已结算', async () => {
    const chat = [{ is_user: false, mes: '[igs-combat:rel|史莱姆|远逊]', swipe_id: 0 }];
    let writes = 0;
    const ledger = createCombatLedger({
        chat, userName: '艾拉', tables: {
            read: () => ({ ok: true, profile: [], ledger: [], attribute: null }),
            append: async () => { writes += 1; return { ok: true }; },
        },
    });
    for (const scan of [ledger.scan, ledger.scanLife]) {
        const result = await scan({ messageIds: [0] });
        assert.equal(result.attributeWrite?.reason, 'combat-attribute-table-missing');
        assert.equal(result.ok, false);
    }
    assert.equal(writes, 0);
});


test('聊天存储：已派发库存写入迟到后不刷新新聊天，也不继续批次', async t => {
    const db = createLedgerMockHost();
    db.sheets.sheet_userbag = userInventorySheet();
    const f = chatStorageFixture(t, { api: db.api });
    const owner = f.store.get();
    assert.equal((await owner.inventory.ensure()).ok, true);
    const insert = db.api.insertRow;
    let release, started;
    const dispatched = new Promise(resolve => { started = resolve; });
    db.api.insertRow = options => new Promise(resolve => {
        const result = insert(options);
        release = () => resolve(result);
        started();
    });
    const writing = owner.inventory.changeQuantities([{ name: '金币', delta: 10 }, { name: '药水', delta: 1 }]);
    await dispatched;
    const calls = clone(db.calls);
    f.context.chatId = 'chat-store-b'; f.store.get();
    release();
    assert.equal((await writing).reason, 'request-stale');
    assert.equal(db.calls.insertRow, calls.insertRow);
    assert.equal(db.calls.refreshDataAndWorldbook, calls.refreshDataAndWorldbook);
});

test('聊天存储：标记缺段冷恢复只补原片段，冲突片段不写入', async t => {
    for (const corrupt of [false, true]) await t.test(corrupt ? '冲突' : '恢复', async t => {
        const f = chatStorageFixture(t, { cellMax: 16 });
        const insert = f.api.insertRow;
        f.api.insertRow = options => String(options.data['分段']).startsWith('2/') ? -1 : insert(options);
        assert.equal((await f.store.get().stats.ensure()).ok, false);
        const sheet = f.api.tables[IGS_TABLE_SPECS.layout.uid];
        assert.equal(sheet.content.length, 2);
        const part = clone(sheet.content[1]);
        if (corrupt) sheet.content[1][sheet.content[0].indexOf('载荷JSON')] += 'x';
        f.api.insertRow = insert;
        f.store.reset();
        const before = clone(f.api.tables), calls = f.api.calls.insert.length;
        const result = await f.store.get().stats.ensure();
        assert.equal(result.ok, !corrupt, JSON.stringify(result));
        if (corrupt) {
            assert.deepEqual(f.api.tables, before);
            assert.equal(f.api.calls.insert.length, calls);
        } else {
            assert.equal(f.store.get().layout().marked, true);
            assert.deepEqual(sheet.content[1], part);
            assert.equal(sheet.content.filter(row => row[sheet.content[0].indexOf('分段')] === '1/3').length, 1);
            assert.equal(f.api.tables[IGS_TABLE_SPECS.profile.uid], undefined);
        }
    });
});

test('聊天存储：旧 Origin 和积分残段仅凭原意图恢复，普通读取及冲突仍拒绝', async t => {
    for (const kind of ['origin', 'points']) for (const corrupt of [false, true])
        await t.test(`${kind}-${corrupt ? '冲突' : '恢复'}`, async t => {
            const f = chatStorageFixture(t, { cellMax: 64 });
            f.context.chatMetadata.origin_v2 = { version: 2 };
            const owner = f.store.get();
            let intent;
            if (kind === 'origin') {
                assert.equal((await owner.origin.load()).ok, true);
                const raw = serializeLedger(createLedger(f.context.chatId));
                raw.note = '恢复资料'.repeat(50);
                intent = owner.origin.prepare(owner.origin.read(), raw);
            } else {
                assert.equal((await owner.points.load()).ok, true);
                intent = pointsRecord({ kind: 'start', sourceId: 'recover-round', game: 'snake',
                    chatId: f.context.chatId, anchor: { floorId: 'recover-floor', swipeId: 0 }, parent: null });
            }
            const insert = f.api.insertRow;
            f.api.insertRow = options => String(options.data['分段']).startsWith('2/') ? -1 : insert(options);
            assert.equal((await owner[kind].commit(intent)).ok, false);
            const sheet = f.api.tables[COMBAT_TABLE_SPECS.ledger.uid];
            const part = sheet.content[1], idAt = sheet.content[0].indexOf('记录ID');
            assert.ok(part);
            if (corrupt) part[sheet.content[0].indexOf('载荷JSON')] += 'x';
            f.api.insertRow = insert;
            f.store.reset();
            const cold = f.store.get();
            assert.equal(cold[kind].read().ok, false);
            const before = clone(f.api.tables), count = f.api.calls.insert.length;
            const result = await cold[kind].commit(intent);
            assert.equal(result.ok, !corrupt, JSON.stringify(result));
            if (corrupt) {
                assert.deepEqual(f.api.tables, before);
                assert.equal(f.api.calls.insert.length, count);
            } else {
                assert.equal(cold.layout().layout, 'legacy');
                assert.equal(sheet.content.filter(row => row[idAt] === part[idAt]
                    && row[sheet.content[0].indexOf('分段')] === part[sheet.content[0].indexOf('分段')]).length, 1);
                const saved = f.api.calls.insert.length;
                assert.equal((await cold[kind].commit(intent)).ok, true);
                assert.equal(f.api.calls.insert.length, saved);
                assert.equal(f.api.tables[IGS_TABLE_SPECS.layout.uid], undefined);
            }
        });
});

test('奖励候选缺段：重建后只恢复原候选，冲突片段不补写也不重发', async t => {
    for (const corrupt of [false, true]) await t.test(corrupt ? '冲突' : '恢复', async t => {
        const f = chatStorageFixture(t, { cellMax: 64 });
        f.context.chat.push({ is_user: false, mes: '[igs-combat:start|林间遭遇|史莱姆|我|elite]', swipe_id: 0 });
        const { anchor, combatId } = locateCombatStart(f.context.chat, 0);
        f.context.chatMetadata.origin_v2 = { version: 2 };
        const owner = f.store.get();
        assert.equal((await owner.raw.ensure()).ok, true);
        const hero = await generateEntities(deckProfileEntities({ name: '艾拉', role: 'protagonist' }), { request: modelReply, llm: { source: 'tavern' } });
        assert.equal(hero.ok, true, JSON.stringify(hero.rejected));
        const { profiles } = generationWrites(hero, { createdAt: 1 });
        assert.equal((await owner.raw.append('profile', profiles)).ok, true);
        const character = profiles.find(profile => profile.kind === 'deck-character').id;
        assert.equal((await owner.raw.append('attribute', {
            id: 'hero-base|reward-fixture', type: 'hero-base', character, anchor: null, createdAt: 1,
            change: '初始化', payload: { scores: { str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 12 } },
        })).ok, true);
        const normalized = normalizeLedgerEntry({
            id: ledgerEntryId('offer', character, anchor), type: 'offer', character, anchor, createdAt: 5,
            payload: { combatId, tier: 'elite', exp: 45, reveal: 1, slots: ['布片', '碎石', '木扣'].map((name, index) => ({ index, name, kind: 'keepsake', rarity: 'common', origin: '捡到的旧物' })) },
        });
        assert.equal(normalized.ok, true, JSON.stringify(normalized.errors));
        const offer = normalized.value;
        const intents = createCombatRewardIntents(f.storage);
        assert.equal(intents.stage(f.context.chatId, offer).ok, true);
        const insert = f.api.insertRow;
        f.api.insertRow = options => String(options.data['分段']).startsWith('2/') ? -1 : insert(options);
        assert.equal((await owner.raw.append('ledger', [offer], { retainOnFailure: false })).ok, false);
        f.api.insertRow = insert;
        const sheet = f.api.tables[COMBAT_TABLE_SPECS.ledger.uid];
        const part = sheet.content[1];
        assert.ok(part);
        if (corrupt) part[sheet.content[0].indexOf('载荷JSON')] += 'x';
        f.store.reset();
        assert.equal(f.store.get().raw.read().ok, false);
        let requests = 0;
        const services = createCombatServices({
            global: { AutoCardUpdaterAPI: f.api, SillyTavern: { getContext: () => f.context } },
            chatStore: f.store, storage: f.storage, getChatId: () => f.context.chatId, getUserName: () => '艾拉',
            getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
            buildMode: () => ({ ready: false }),
            chatRecord: { read: () => ({ ok: true, value: { prepared: { at: 1 } } }) },
            retryDelays: [], generationMaxRounds: 0, request: async () => { requests += 1; return ''; },
        });
        t.after(services.dispose);
        const session = services.getSession();
        const before = clone(sheet.content), writes = f.api.calls.insert.length;
        assert.equal((await session.prepare(0)).ok, false);
        assert.equal(f.api.calls.insert.length, writes);
        const recovered = await session.prepare(0, { recoverReward: true });
        assert.equal(requests, 0);
        assert.equal(recovered.ok, !corrupt, recovered.reason);
        if (corrupt) {
            assert.deepEqual(sheet.content, before);
            assert.deepEqual(intents.read(f.context.chatId).offers, [offer]);
        } else {
            assert.deepEqual(sheet.content[1], before[1]);
            assert.equal(session.state().reward.status, 'ready');
            assert.deepEqual(await services.getLedger().readOfferCommit(offer), { ok: true, present: true });
            assert.deepEqual(intents.read(f.context.chatId).offers, []);
        }
    });
});

test('P10 生产 bootstrapIGS 端到端集成：v2 新聊天 3 秒缓冲、三系统独立表与共享积分、UI 订阅与冷重建复用', async t => {
    const { bootstrapIGS } = await import('../src/core/bootstrap.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { IGS_TABLE_SPECS } = await import('../src/data/shujuku/igs-table-specs.js');
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
        url: 'https://igs.invalid/',
        beforeParse(window) {
            const create = window.document.createElement.bind(window.document);
            window.document.createElement = (...args) => {
                const node = create(...args);
                if (node.localName === 'style') node.type = 'text/plain';
                return node;
            };
        },
    });
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const listeners = new Map();
    const emit = (k, ...args) => { for (const fn of [...(listeners.get(k) || [])]) fn(...args); };
    let chatId = 'p10-v2-chat-a';
    const chat = [
        { is_user: true, mes: '开局' },
        { is_user: false, mes: '<now_plot><content>微风吹过广场。</content></now_plot>', swipe_id: 0 },
    ];
    const ctx = {
        name1: '艾拉',
        name2: '小雪',
        chat,
        chatMetadata: {},
        extensionPrompts: {},
        saveMetadata() {},
        saveChat: async () => {},
        getCurrentChatId: () => chatId,
        eventTypes: {
            CHAT_CHANGED: 'cc',
            GENERATION_STARTED: 'gs',
            GENERATION_ENDED: 'ge',
            GENERATION_STOPPED: 'gx',
            MESSAGE_RECEIVED: 'mr',
            CHARACTER_MESSAGE_RENDERED: 'cmr',
            MESSAGE_UPDATED: 'mu',
        },
        eventSource: {
            on(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
            removeListener(k, fn) { listeners.get(k)?.delete(fn); },
        },
        setExtensionPrompt(k, value) { ctx.extensionPrompts[k] = { value }; },
    };
    const storage = createMemoryStorage({
        igs_bridge_config: JSON.stringify({
            autoIllustration: { llm: { source: 'custom', endpoint: 'https://example.invalid/v1', apiKey: 'fixture', model: 'fixture' } },
            origin: { enabled: true, taskSource: 'manual', achieveOn: false, mods: { stat: false, bag: true, shop: true, gacha: false, ach: false, chat: false } },
            // 故意关闭 stats.enabled，验证战斗开启自动启用数值系统
            stats: { enabled: false, ruleset: 'coc7', checkFx: false, bars: { money: true }, autoSkill: false, sheetGen: 'off', backfill: 'off' },
        }),
        'igs-reader-settings-v9-default': JSON.stringify({ titleScreen: false, typewriter: { enabled: false }, combatExpansion: { enabled: true, kind: 'both', skin: 'initial' } }),
    });
    const combatRequests = [];
    const heroInitTasks = [];
    const globalObj = {
        document: dom.window.document,
        localStorage: storage,
        AutoCardUpdaterAPI: db.api,
        SillyTavern: { getContext: () => ctx },
        Event: dom.window.Event,
        CustomEvent: dom.window.CustomEvent,
        dispatchEvent: dom.window.dispatchEvent.bind(dom.window),
        addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window),
    };
    const makeOptions = (startupDelayMs) => ({
        global: globalObj,
        autoAttachMagicWand: false,
        startupDelayMs,
        secondaryLlm: {
            request: async (prompt, config) => {
                let entities;
                try { entities = JSON.parse(prompt.user).entities; } catch { /* heroInit */ }
                if (!Array.isArray(entities)) return new Promise(resolve => heroInitTasks.push({ resolve, config }));
                combatRequests.push(prompt);
                return modelReply(prompt);
            },
        },
    });
    const waitImmediate = async () => {
        for (let i = 0; i < 24; i += 1) await new Promise(resolve => setImmediate(resolve));
    };

    t.mock.timers.enable({ apis: ['setTimeout'] });
    let app = bootstrapIGS(makeOptions(3000));
    t.after(async () => { await app.shutdown(); dom.window.close(); });
    assert.equal(app.getState().startupStatus, 'buffering');
    assert.equal(combatRequests.length, 0);
    assert.equal(heroInitTasks.length, 0);

    // 3 秒缓冲到期，独立启动三系统；三系统并发按需建表时读中表版本变化走有界重试恢复
    t.mock.timers.tick(3000);
    await waitImmediate();
    t.mock.timers.tick(1500);
    await waitImmediate();
    assert.equal(app.getState().startupStatus, 'ready');
    assert.equal(combatRequests.length, 1, '战斗内容先行准备，不等待数值六维');
    assert.equal(heroInitTasks.length, 1, '统一 heroInit 一次请求补齐六维与货币');

    // Origin 独立表与共享积分表已按需建立，Origin 在 heroInit 未回包时即可独立运行
    assert.ok(db.sheets[IGS_TABLE_SPECS.layout.uid], 'v2 布局标记表应已建立');
    assert.ok(db.sheets[IGS_TABLE_SPECS.origin.uid], 'v2 Origin 独立表应已建立');
    assert.ok(db.sheets[IGS_TABLE_SPECS.points.uid], 'v2 共享积分表应已建立');
    const originSettings = app.openSettings({ page: 'origin' });
    assert.equal(originSettings.ok, true);
    assert.match(dom.window.document.querySelector('#igs-unified-settings').textContent, /本聊天正在运行/);
    originSettings.controller.close();

    // 统一 heroInit 回包：落六维与铜钱 120；主角准备零额外模型请求自动转 ready
    heroInitTasks[0].resolve(JSON.stringify({
        attributes: { str: 15, dex: 12, con: 14, int: 11, wis: 10, cha: 13 },
        currency: { name: '铜钱', initial: 120, prices: { 少量: 8, 普通: 30, 昂贵: 100, 巨额: 350 }, rate: 0.25 },
    }));
    await waitImmediate();
    assert.equal(combatRequests.length, 1, '六维到达后战斗不重发模型请求');
    const statsSettings = app.openSettings({ page: 'stats' });
    assert.equal(statsSettings.ok, true);
    assert.match(dom.window.document.querySelector('.igs-stats-wallets').textContent, /铜钱120/);
    statsSettings.controller.close();

    // 冷重建：销毁并重新启动，零模型请求直接复用已落库权威数据
    await app.shutdown();
    app = bootstrapIGS(makeOptions(0));
    await waitImmediate();
    assert.equal(combatRequests.length, 1, '冷重建不得重新请求战斗模型');
    assert.equal(heroInitTasks.length, 1, '冷重建不得重新请求主角统一初始化模型');
    const reopenedStats = app.openSettings({ page: 'stats' });
    assert.match(dom.window.document.querySelector('.igs-stats-wallets').textContent, /铜钱120/);
    reopenedStats.controller.close();
});