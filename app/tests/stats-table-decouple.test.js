import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { detectStatMappings, planStatsPush } from '../src/data/shujuku/stats-push.js';
import { parseTables } from '../src/data/shujuku/table-parser.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AFTER_DELAY = 1100;
const QUIET = 2700;

// ---- 标签与结算 ----

function stateWithXue(extra = {}) {
    const s = createStatsState({ money: 500 });
    return { ...s, characters: { 小雪: { ...createCharacter(1), ...extra } } };
}
const settle = (state, text, opts = {}) => settleFloorText(state, text, { random: () => 0.5, resolveCharacter: (n) => (n === '小雪' ? n : null), ...opts });

test('标签：可选角色名，不带角色名仍算主角', () => {
    const { directives } = parseStatDirectives('[igs-stat:stamina|中][igs-stat:stamina|小雪|重][igs-stat:money|收入|普通][igs-stat:money|小雪|花费|少量][igs-stat:stress|上升][igs-stat:stress|小雪|下降]');
    assert.deepEqual(directives, [
        { kind: 'stamina', value: '中' }, { kind: 'stamina', value: '重', target: '小雪' },
        { kind: 'money', flow: '收入', value: '普通' }, { kind: 'money', flow: '花费', value: '少量', target: '小雪' },
        { kind: 'stress', value: '上升' }, { kind: 'stress', value: '下降', target: '小雪' },
    ]);
});

test('NPC 生活条：按标签结算，主角不受影响，记录 target 为角色名', () => {
    const r = settle(stateWithXue(), '[igs-stat:stamina|小雪|重][igs-stat:stress|小雪|上升][igs-stat:money|小雪|收入|普通]');
    assert.deepEqual(r.state.characters.小雪.bars, { stamina: 70, money: 100, stress: 10 });
    assert.equal(r.state.protagonist.bars.stamina, 100);
    assert.ok(r.changes.some((c) => c.target === '小雪' && c.key === 'stamina' && c.from === 100 && c.to === 70));
});

test('NPC 金钱：花费超过余额时不扣；未登记的角色名丢弃并记诊断', () => {
    const r = settle(stateWithXue(), '[igs-stat:money|小雪|花费|昂贵][igs-stat:stamina|路人|轻]');
    assert.equal(r.state.characters.小雪.bars.money, 0);
    assert.ok(r.meta.diagnostics.some((d) => d.code === 'stat-unknown-character' && d.name === '路人'));
});

test('旧写法完全兼容：不带角色名只动主角', () => {
    const r = settle(stateWithXue(), '[igs-stat:stamina|中][igs-stat:money|花费|少量]');
    assert.equal(r.state.protagonist.bars.stamina, 85);
    assert.equal(r.state.protagonist.bars.money, 480);
    assert.equal(r.state.characters.小雪.bars.stamina, 100);
});

test('旧存档角色没有 bars：被点名时按初值补齐', () => {
    const s = stateWithXue();
    delete s.characters.小雪.bars;
    const r = settle(s, '[igs-stat:stamina|小雪|中]');
    assert.equal(r.state.characters.小雪.bars.stamina, 85);
    assert.equal(r.state.characters.小雪.bars.stress, 0);
});

test('日结算：角色体力回满、压力下降', () => {
    const s = stateWithXue({ bars: { stamina: 40, money: 0, stress: 30 } });
    const r = settle(s, '[igs-stat:sleep]');
    assert.equal(r.state.characters.小雪.bars.stamina, 100);
    assert.equal(r.state.characters.小雪.bars.stress, 20);
});

// ---- 写回三列 ----

function sheet(uid, name, content, orderNo = 0) { return { uid, name, content, orderNo }; }

function numericTable() {
    return { sheet_v: sheet('sheet_v', '角色数值表', [['角色姓名', '好感度', '信任度', '了解程度', '芥蒂程度', '体力', '金钱', '压力'], ['阿明', '', '', '', '', '1', '1', '1'], ['小雪', '1', '1', '1', '1', '1', '1', '1']], 1) };
}

test('写回三列：NPC 取自身生活条，主角金钱写合并余额', () => {
    const tables = parseTables(numericTable());
    const { mappings } = detectStatMappings(tables);
    const s = stateWithXue({ bars: { stamina: 60, money: 30, stress: 15 } });
    const plan = planStatsPush(s, tables, mappings, { walletExtra: 70, isHero: (n) => n === '阿明' });
    const cell = (row, column) => plan.writes.find((w) => w.rowIndex === row + 1 && w.column === column)?.value;
    assert.equal(cell(0, '金钱'), '570');
    assert.equal(cell(0, '体力'), '100');
    assert.equal(cell(1, '体力'), '60');
    assert.equal(cell(1, '金钱'), '30');
    assert.equal(cell(1, '压力'), '15');
});

// ---- 运行时：填表窗口与手改采纳 ----

function setup({ pushEnabled = true, tableData = numericTable() } = {}) {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
    };
    const ctx = { name1: '阿明', name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {}, eventSource, eventTypes: T, getCurrentChatId: () => 'chat-d', setExtensionPrompt() {}, saveMetadata() {} };
    const updateCbs = new Set();
    const fillCbs = new Set();
    const writes = [];
    const api = {
        exportTableAsJson: () => tableData,
        // 与真实接口一致，同时接受位置参数与对象参数。
        updateCell(a, i, c, v) {
            const [table, rowIndex, col, value] = a && typeof a === 'object'
                ? [a.tableName, a.rowIndex, a.colIdentifier, a.value] : [a, i, c, v];
            const s = Object.values(tableData).find((x) => x.name === table);
            s.content[rowIndex][s.content[0].indexOf(col)] = value;
            writes.push({ rowIndex, col, value });
            return true;
        },
        refreshDataAndWorldbook() { for (const cb of [...updateCbs]) cb({}, { persisted: true }); },
        registerTableUpdateCallback: (cb) => updateCbs.add(cb),
        unregisterTableUpdateCallback: (cb) => updateCbs.delete(cb),
        registerTableFillStartCallback: (cb) => fillCbs.add(cb),
    };
    const client = createShujukuClient(api);
    const rows = [];
    const tables = { ok: true, version: 0, read: () => ({ ok: true, stats: rows.slice() }), append(r) { rows.push(...r); this.version += 1; return Promise.resolve({ ok: true }); }, ensure: () => Promise.resolve({ ok: true }) };
    const rt = createStatsRuntime({
        getContext: () => ctx, readSettings: () => ({ enabled: true, register: 'auto', push: { enabled: pushEnabled } }),
        statsTables: () => tables, getPushClient: () => client, tablePeople: () => ['小雪'],
    });
    rt.sync();
    rt.enableForChat();
    const say = (text) => {
        eventSource.emit('gs', 'normal', {}, false);
        ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
        eventSource.emit('ge', ctx.chat.length - 1);
    };
    const row = (i) => tableData.sheet_v.content[i];
    const userEdit = (i, col, value) => { row(i)[tableData.sheet_v.content[0].indexOf(col)] = value; for (const cb of [...updateCbs]) cb({}, { persisted: true }); };
    return { rt, say, row, userEdit, fillStart: () => fillCbs.forEach((cb) => cb()), fireUpdate: () => updateCbs.forEach((cb) => cb({}, { persisted: true })), writes, fillCbs };
}

test('填表窗口内的更新：用 IGS 值盖回，不采纳', async () => {
    const t = setup();
    t.say('小雪笑了。');
    await t.rt.pushNow();
    assert.equal(t.row(2)[5], '100');
    t.fillStart();
    t.row(2)[5] = '5';
    t.row(2)[1] = '90';
    t.fireUpdate();
    await wait(AFTER_DELAY);
    assert.equal(t.row(2)[5], '100');
    assert.equal(t.rt.getState().characters.小雪.bars.stamina, 100);
    assert.equal(t.row(2)[1], '0');
});

test('窗口外的更新视为用户手改：关系与生活条被采纳', async () => {
    const t = setup();
    t.say('小雪笑了。');
    await t.rt.pushNow();
    await wait(QUIET);
    t.userEdit(2, '信任度', '33');
    t.row(2)[4] = '12';
    t.row(2)[5] = '40';
    t.fireUpdate();
    await wait(AFTER_DELAY);
    const c = t.rt.getState().characters.小雪;
    assert.equal(c.dims.信任, 33);
    assert.equal(c.dims.芥蒂, 12);
    assert.equal(c.bars.stamina, 40);
    assert.ok(t.rt.getDiagnostics().some((d) => d.code === 'stats-table-manual-adopted' && d.name === '小雪' && d.key === '信任' && d.to === 33));
});

test('主角金钱列手改不回写：金钱列是物品表剧情货币，不改数值侧积分份额', async () => {
    const t = setup();
    t.say('旁白。');
    await t.rt.pushNow();
    await wait(QUIET);
    const before = t.rt.getState().protagonist.bars.money;
    t.userEdit(1, '金钱', '250');
    await wait(AFTER_DELAY);
    assert.equal(t.rt.getState().protagonist.bars.money, before);
    assert.ok(!t.rt.getDiagnostics().some((d) => d.code === 'stats-table-manual-adopted' && d.key === 'money'));
});

test('自己写表触发的更新不会被当成手改', async () => {
    const t = setup();
    t.say('小雪笑了。');
    await t.rt.pushNow();
    await wait(QUIET);
    const before = t.rt.getDiagnostics().filter((d) => d.code === 'stats-table-manual-adopted').length;
    assert.equal(before, 0);
    assert.equal(t.rt.getState().characters.小雪.bars.stamina, 100);
});

test('手改后、处理前又进了填表窗口：改按 AI 填表盖回，不采纳写了一半的表', async () => {
    const t = setup();
    t.say('小雪笑了。');
    await t.rt.pushNow();
    await wait(QUIET);
    t.userEdit(2, '信任度', '33');
    t.fillStart();
    t.row(2)[1] = '90';
    await wait(AFTER_DELAY);
    const c = t.rt.getState().characters.小雪;
    assert.equal(c.dims.信任, 0);
    assert.equal(c.dims.好感, 0);
    t.fireUpdate();
    await wait(AFTER_DELAY);
    assert.equal(t.row(2)[1], '0', '填表结束的更新到来时盖回');
    assert.equal(t.rt.getState().characters.小雪.dims.好感, 0);
});

test('同步子开关关闭：不盖回也不采纳', async () => {
    const t = setup({ pushEnabled: false });
    t.say('小雪笑了。');
    t.userEdit(2, '信任度', '33');
    t.fillStart();
    t.row(2)[5] = '5';
    t.fireUpdate();
    await wait(AFTER_DELAY);
    assert.equal(t.rt.getState().characters.小雪.dims.信任, 0);
    assert.equal(t.row(2)[5], '5');
});

test('旧版数据库插件没有填表回调时不报错', () => {
    const client = createShujukuClient({});
    assert.doesNotThrow(() => { client.registerFillStartCallback(() => {}); client.unregisterFillStartCallback(() => {}); });
});
