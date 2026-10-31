import { parseTables } from './table-parser.js';
import { createShujukuClient } from './client.js';
import { normalizeItemName } from './item-catalog.js';
import { buildIgsSheet } from './combat-tables.js';

// 单一背包：数据库物品表是物品数量的唯一来源；「IGS战斗·装配」只记装备与道具的效果和穿戴状态，不设数量。
// 表结构经宿主模板导入调整；数量与穿戴状态逐行 insertRow / updateRow / deleteRow 后读回核对，缺接口、找不到或找到多张物品表时不写。
export const INVENTORY_REQUIRED_API = Object.freeze(['exportTableAsJson', 'insertRow', 'updateRow', 'deleteRow', 'getTableTemplate', 'importTemplateFromData', 'refreshDataAndWorldbook']);
export const INVENTORY_DEFAULT_NAME = '背包物品表';
export const INVENTORY_FIELDS = Object.freeze({
    name: Object.freeze(['物品名称', '名称', '物品', '道具名称']),
    quantity: Object.freeze(['数量', '数目', '个数']),
    description: Object.freeze(['描述/效果', '描述', '物品描述', '效果', '说明']),
    category: Object.freeze(['类别', '分类', '类型', '物品类别']),
});
// 缺列时追加的列；缺物品名称或数量列的表不认作物品表，不追加。
export const INVENTORY_ADDED_COLUMNS = Object.freeze({
    description: Object.freeze({ header: '描述/效果', sql: 'description' }),
    category: Object.freeze({ header: '类别', sql: 'category' }),
});
const NAME_KEYWORDS = Object.freeze(['物品', '背包', '道具']);

// 装配表：一行对应物品表里的一件装备或道具（按物品名称关联）；定义JSON 存程序用的部位、加成、被动与道具效果。
export const GEAR_TABLE = Object.freeze({
    name: 'IGS战斗·装配',
    uid: 'sheet_igscbgear',
    columns: Object.freeze(['物品名称', '类别', '稀有度', '部位', '六维加成', '被动', '效果', '是否装备', '定义JSON']),
});

const cell = (value) => (value === undefined || value === null ? '' : String(value).trim());
const fieldOf = (columns, names) => (Array.isArray(columns) ? columns : []).findIndex((c) => names.includes(cell(c)));

function probe(api) {
    const missing = INVENTORY_REQUIRED_API.filter((name) => !api || typeof api[name] !== 'function');
    return missing.length ? { ok: false, reason: 'inventory-host-unsupported', missing } : { ok: true, missing: [] };
}
export { probe as probeInventorySupport };

// 当前聊天里唯一的物品表：表名含「物品／背包／道具」、有物品名称列与数量列、不是 IGS 自己的表。找不到或多于一张都不猜。
export function locateInventoryTable(tables) {
    const hits = (Array.isArray(tables) ? tables : []).filter((t) => !String(t.name).startsWith('IGS')
        && NAME_KEYWORDS.some((w) => String(t.name).includes(w))
        && fieldOf(t.columns, INVENTORY_FIELDS.name) >= 0 && fieldOf(t.columns, INVENTORY_FIELDS.quantity) >= 0);
    if (!hits.length) return { ok: false, reason: 'inventory-table-missing' };
    if (hits.length > 1) return { ok: false, reason: 'inventory-table-ambiguous', names: hits.map((t) => t.name) };
    const table = hits[0];
    const index = Object.fromEntries(Object.keys(INVENTORY_FIELDS).map((k) => [k, fieldOf(table.columns, INVENTORY_FIELDS[k])]));
    return { ok: true, table, index };
}

// 一行里不在 SQL 字面量内的「--」位置（行注释起点）；没有时为 -1。
function commentStart(line) {
    let quote = '';
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (quote) { if (ch === quote) quote = ''; continue; }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
        if (ch === '-' && line[i + 1] === '-') return i;
    }
    return -1;
}
const codeOf = (line) => { const at = commentStart(line); return at < 0 ? line : line.slice(0, at); };
const CONSTRAINT_RE = /^(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i;

// 在 CREATE TABLE 末尾追加 TEXT 列：上一条定义的代码段后补逗号（行尾注释留在逗号之后），新列写成「sql TEXT, -- 表头」，宿主按行尾注释认中文表头。
// 只处理最后一条是列定义的 DDL；含块注释、收尾括号在注释里、以表级约束收尾或物理列名已存在时返回 null，由调用方 fail-closed。
export function appendDdlColumns(ddl, columns) {
    const text = String(ddl || '');
    if (!columns.length) return text;
    if (text.includes('/*')) return null;
    const open = text.indexOf('(');
    const close = text.lastIndexOf(')');
    if (open < 0 || close <= open) return null;
    const lineStart = text.lastIndexOf('\n', close) + 1;
    const closeAt = commentStart(text.slice(lineStart, close + 1));
    if (closeAt >= 0) return null;
    const lines = text.slice(open + 1, close).split('\n');
    let last = lines.length - 1;
    while (last >= 0 && !codeOf(lines[last]).trim()) last -= 1;
    if (last < 0) return null;
    const at = commentStart(lines[last]);
    const code = codeOf(lines[last]).replace(/\s+$/, '');
    const comment = at < 0 ? '' : ` ${lines[last].slice(at)}`;
    if (code.trim().endsWith(',') || CONSTRAINT_RE.test(code.trim())) return null;
    const existing = new Set(lines.map((l) => codeOf(l).trim().match(/^([^\s,()]+)/)?.[1]?.toLowerCase()).filter(Boolean));
    if (columns.some((c) => existing.has(c.sql.toLowerCase()))) return null;
    const indent = (code.match(/^\s*/) || [''])[0] || '  ';
    lines[last] = `${code},${comment}`;
    const added = columns.map((c, i) => `${indent}${c.sql} TEXT${i < columns.length - 1 ? ',' : ''} -- ${c.header}`);
    lines.splice(last + 1, 0, ...added);
    return `${text.slice(0, open + 1)}${lines.join('\n')}${text.slice(close)}`;
}

const IGS_UPDATE_CONFIG = Object.freeze({ uiSentinel: -1, contextDepth: -1, updateFrequency: 0, batchSize: -1, skipFloors: -1 });
const PROGRAM_NODES = Object.freeze({ initNode: '禁止。', deleteNode: '禁止。', updateNode: '禁止。', insertNode: '禁止。' });
const DEFAULT_INVENTORY_COLUMNS = Object.freeze(['物品名称', '数量', '描述/效果', '类别']);
// 新建物品表沿用宿主默认「背包物品表」的 DDL（名称唯一、数量 > 0）；物理表名取新表 uid，避免与其他表的物理名相撞。模板缺 DDL 时宿主只按表头生成全 TEXT 列，会丢掉这两条约束。
const defaultInventoryDdl = (uid) => `CREATE TABLE ${uid} ( -- ${INVENTORY_DEFAULT_NAME}
  row_id INTEGER PRIMARY KEY, -- 行号
  item_name TEXT NOT NULL UNIQUE, -- 物品名称
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0), -- 数量
  description TEXT, -- 描述/效果
  category TEXT -- 类别
);`;
const sameName = (a, b) => String(a ?? '').normalize('NFKC').trim() === String(b ?? '').normalize('NFKC').trim();
const templateSheets = (template) => Object.entries(template || {}).filter(([, v]) => v && typeof v === 'object' && typeof v.uid === 'string');
const managed = (sheet) => sheet.updateConfig?.updateFrequency === 0 && sheet.sourceData?.insertNode === PROGRAM_NODES.insertNode;

// 规划导入模板（纯函数，不碰宿主）：tables 为当前聊天解析后的表，template 为当前模板。
// 物品表在：缺「描述/效果」「类别」列时补表头与 DDL，并改为程序维护（关闭自动更新、禁止 AI 改写）；不在：按默认「背包物品表」结构（含 DDL 约束）新建。缺装配表时追加。
// 已有同名「背包物品表」但缺物品名称或数量列时不新建第二张（宿主按表名认表），返回 inventory-table-incomplete。
// 物品表在模板里不是唯一一张、或表头与当前聊天不同、或 DDL 无法安全追加列时不规划。返回 { ok, template, changes }，changes 为空表示无需导入。
export function planInventoryTemplate(template, tables) {
    const copy = JSON.parse(JSON.stringify(template || {}));
    const sheets = templateSheets(copy);
    let orderNo = sheets.reduce((max, [, s]) => Math.max(max, Number(s.orderNo) || 0), -1);
    const changes = [];
    const located = locateInventoryTable(tables);
    if (!located.ok && located.reason !== 'inventory-table-missing') return located;
    if (located.ok) {
        const hit = sheets.filter(([, s]) => s.name === located.table.name);
        if (hit.length !== 1) return { ok: false, reason: 'inventory-template-mismatch', name: located.table.name };
        const sheet = hit[0][1];
        const header = Array.isArray(sheet.content?.[0]) ? sheet.content[0].map(cell) : [];
        if (header.join('\u0001') !== located.table.columns.map(cell).join('\u0001')) return { ok: false, reason: 'inventory-template-mismatch', name: located.table.name };
        const add = Object.keys(INVENTORY_ADDED_COLUMNS).filter((k) => located.index[k] < 0).map((k) => INVENTORY_ADDED_COLUMNS[k]);
        if (add.length) {
            const ddl = String(sheet.sourceData?.ddl || '').trim();
            if (ddl) {
                const next = appendDdlColumns(ddl, add);
                if (next === null) return { ok: false, reason: 'inventory-ddl-unsupported', name: located.table.name };
                sheet.sourceData.ddl = next;
            }
            sheet.content = [[...sheet.content[0], ...add.map((c) => c.header)], ...sheet.content.slice(1).map((r) => [...r, ...add.map(() => '')])];
            changes.push({ kind: 'inventory-columns', added: add.map((c) => c.header) });
        }
        if (!managed(sheet)) {
            sheet.updateConfig = { ...IGS_UPDATE_CONFIG };
            sheet.sourceData = { ...(sheet.sourceData || {}), ...PROGRAM_NODES };
            changes.push({ kind: 'inventory-managed' });
        }
    } else {
        const clash = [...(Array.isArray(tables) ? tables : []).map((t) => t.name), ...sheets.map(([, s]) => s.name)].find((n) => sameName(n, INVENTORY_DEFAULT_NAME));
        if (clash !== undefined) return { ok: false, reason: 'inventory-table-incomplete', name: clash };
        let uid = 'sheet_in05z9vz';
        for (let n = 2; Object.hasOwn(copy, uid); n += 1) uid = `sheet_in05z9vz${n}`;
        orderNo += 1;
        const created = buildIgsSheet({ name: INVENTORY_DEFAULT_NAME, columns: DEFAULT_INVENTORY_COLUMNS, note: '主角背包，物品数量的唯一来源' }, orderNo, uid);
        created.sourceData.ddl = defaultInventoryDdl(uid);
        copy[uid] = created;
        changes.push({ kind: 'inventory-created' });
    }
    const hasGear = (Array.isArray(tables) ? tables : []).some((t) => t.name === GEAR_TABLE.name) || sheets.some(([, s]) => s.name === GEAR_TABLE.name);
    if (!hasGear) {
        let uid = GEAR_TABLE.uid;
        for (let n = 2; Object.hasOwn(copy, uid); n += 1) uid = `${GEAR_TABLE.uid}${n}`;
        orderNo += 1;
        copy[uid] = buildIgsSheet({ name: GEAR_TABLE.name, columns: GEAR_TABLE.columns, note: 'IGS 战斗扩展的装备与道具效果、穿戴状态' }, orderNo, uid);
        changes.push({ kind: 'gear-created' });
    }
    if (changes.length) copy.mate = { ...(copy.mate && typeof copy.mate === 'object' ? copy.mate : {}), updateConfigUiSentinel: -1 };
    return { ok: true, template: copy, changes };
}


// 当前聊天的物品表与装配表快照。rowIndex 为宿主表内容下标（表头 0，首条数据 1），每次写入前重新读取，不跨写入复用。
// 数量非正整数的行记诊断、不参与计数（宿主 CHECK(quantity > 0)，不会合法出现 0）；同名行多于一条时记诊断，按首条为准。
export function readInventoryTables(client) {
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'inventory-table-read-failed', detail: read.reason };
    const data = read.data;
    if (!data || typeof data !== 'object' || !Object.keys(data).length) return { ok: false, reason: 'inventory-table-not-ready' };
    const tables = parseTables(data);
    const located = locateInventoryTable(tables);
    if (!located.ok) return { ...located, tables };
    const { table, index } = located;
    const diagnostics = [];
    const items = [];
    const seen = new Set();
    table.rows.forEach((row, i) => {
        const name = cell(row[index.name]);
        const key = normalizeItemName(name);
        if (!key) return;
        const raw = cell(row[index.quantity]);
        const quantity = /^\d+$/.test(raw) ? Number(raw) : NaN;
        if (!(quantity > 0)) { diagnostics.push({ code: 'inventory-quantity-invalid', name, value: raw }); return; }
        if (seen.has(key)) { diagnostics.push({ code: 'inventory-name-duplicate', name }); return; }
        seen.add(key);
        items.push({ rowIndex: i + 1, name, key, quantity, description: index.description >= 0 ? cell(row[index.description]) : '', category: index.category >= 0 ? cell(row[index.category]) : '' });
    });
    const gearTable = tables.find((t) => t.name === GEAR_TABLE.name) || null;
    const gear = gearTable ? readGearRows(gearTable, diagnostics) : null;
    return { ok: true, tables, inventory: { name: table.name, columns: table.columns, index, items }, gear, diagnostics };
}

function readGearRows(table, diagnostics) {
    const col = Object.fromEntries(GEAR_TABLE.columns.map((c) => [c, table.columns.indexOf(c)]));
    if (Object.values(col).some((i) => i < 0)) { diagnostics.push({ code: 'gear-table-columns-invalid' }); return { name: table.name, rows: [], invalid: true }; }
    const rows = [];
    const seen = new Set();
    table.rows.forEach((row, i) => {
        const name = cell(row[col['物品名称']]);
        const key = normalizeItemName(name);
        if (!key) return;
        if (seen.has(key)) { diagnostics.push({ code: 'gear-name-duplicate', name }); return; }
        let definition = null;
        try { definition = JSON.parse(cell(row[col['定义JSON']]) || 'null'); } catch { diagnostics.push({ code: 'gear-definition-invalid', name }); return; }
        seen.add(key);
        rows.push({ rowIndex: i + 1, name, key, category: cell(row[col['类别']]), rarity: cell(row[col['稀有度']]), slot: cell(row[col['部位']]),
            equipped: cell(row[col['是否装备']]) === '是', definition });
    });
    return { name: table.name, rows };
}

const GEAR_CELLS = (r) => ({
    '物品名称': cell(r.name), '类别': cell(r.category), '稀有度': cell(r.rarity), '部位': cell(r.slot), '六维加成': cell(r.bonusText),
    '被动': cell(r.passiveText), '效果': cell(r.effectText), '是否装备': r.equipped ? '是' : '否', '定义JSON': JSON.stringify(r.definition ?? null),
});

// 受控写入方。api 为 window.AutoCardUpdaterAPI；serial 可与战斗表共用，避免两路模板导入交错。
// 每次写入前重新读表定位行，写后读回核对；批次有写入时只刷新一次世界书；写入期间 isWriting() 为真，供表格回调侧抑制自激。
export function createInventoryTables({ api, client = createShujukuClient(api), serial: sharedSerial = null } = {}) {
    let writing = false;
    let chain = Promise.resolve();
    const serial = sharedSerial || ((task) => {
        const run = chain.then(task, task);
        chain = run.catch(() => {});
        return run;
    });
    const support = () => probe(api);
    const read = () => {
        const s = support();
        return s.ok ? readInventoryTables(client) : s;
    };

    // 建表与补列：模板与当前聊天的表名集合必须一致（导入是整份快照，模板缺的表会被隐藏、多的表会被加进聊天），否则不导入。
    function ensure() {
        return serial(async () => {
            const s = support();
            if (!s.ok) return s;
            const live = client.readTables();
            if (!live.ok) return { ok: false, reason: 'inventory-table-read-failed', detail: live.reason };
            if (!live.data || typeof live.data !== 'object' || !Object.keys(live.data).length) return { ok: false, reason: 'inventory-table-not-ready' };
            const tables = parseTables(live.data);
            const template = client.getTableTemplate();
            if (!template.ok) return { ok: false, reason: 'inventory-template-unavailable', detail: template.reason };
            const plan = planInventoryTemplate(template.data, tables);
            if (!plan.ok) return plan;
            if (!plan.changes.length) return { ok: true, changes: [] };
            const names = new Set(tables.map((t) => t.name));
            const planned = parseTables(plan.template).map((t) => t.name);
            const added = new Set([...(plan.changes.some((c) => c.kind === 'inventory-created') ? [INVENTORY_DEFAULT_NAME] : []), ...(plan.changes.some((c) => c.kind === 'gear-created') ? [GEAR_TABLE.name] : [])]);
            const hidden = [...names].filter((n) => !planned.includes(n));
            const extra = planned.filter((n) => !names.has(n) && !added.has(n));
            if (hidden.length || extra.length) return { ok: false, reason: 'inventory-template-diverged', ...(hidden.length && { hidden }), ...(extra.length && { extra }) };
            writing = true;
            let imported;
            try { imported = await client.importTemplate(plan.template, { scope: 'chat', dataMode: 'seed' }); } finally { writing = false; }
            if (!imported.ok) return { ok: false, reason: 'inventory-template-import-failed', detail: imported.message || imported.reason };
            if (imported.result?.runtimeReady === false) return { ok: false, reason: 'inventory-runtime-not-ready', changes: plan.changes };
            const after = readInventoryTables(client);
            if (!after.ok || !after.gear || after.gear.invalid) return { ok: false, reason: 'inventory-ensure-unverified', detail: after.reason || '' };
            const missingCols = Object.keys(INVENTORY_ADDED_COLUMNS).filter((k) => after.inventory.index[k] < 0);
            if (missingCols.length) return { ok: false, reason: 'inventory-ensure-unverified', missing: missingCols };
            return { ok: true, changes: plan.changes };
        });
    }

    async function refreshOnce(changed) {
        if (!changed) return null;
        try {
            const r = await client.refresh();
            return r.ok ? null : 'inventory-refresh-failed';
        } catch { return 'inventory-refresh-failed'; }
    }

    // 数量增减：delta > 0 已有则加、没有则新建（带描述与类别）；delta < 0 不足时拒收，正好用完时删行（宿主数量列 CHECK > 0）。
    async function applyQuantity(snapshot, { name, delta, description = '', category = '' }) {
        const key = normalizeItemName(name);
        const n = Number(delta);
        if (!key || !Number.isInteger(n) || n === 0) return { ok: false, reason: 'inventory-change-invalid', name };
        const inv = snapshot.inventory;
        const cols = inv.columns;
        const item = inv.items.find((i) => i.key === key);
        const before = item ? item.quantity : 0;
        const next = before + n;
        if (next < 0 || (n < 0 && !item)) return { ok: false, reason: item ? 'inventory-quantity-insufficient' : 'inventory-item-missing', name, have: before };
        let result;
        if (!item) {
            const row = { [cols[inv.index.name]]: String(name).trim(), [cols[inv.index.quantity]]: String(next) };
            if (description && inv.index.description >= 0) row[cols[inv.index.description]] = String(description);
            if (category && inv.index.category >= 0) row[cols[inv.index.category]] = String(category);
            result = await client.insertRow(inv.name, row, { skipNotify: true });
        } else if (next === 0) {
            result = await client.deleteRow(inv.name, item.rowIndex, { skipNotify: true });
        } else {
            result = await client.updateRow(inv.name, item.rowIndex, { [cols[inv.index.quantity]]: String(next) }, { skipNotify: true });
        }
        if (!result.ok) return { ok: false, reason: 'inventory-write-failed', name, detail: result.reason };
        const after = readInventoryTables(client);
        const now = after.ok ? after.inventory.items.find((i) => i.key === key) : null;
        const verified = after.ok && (next === 0 ? !now : now?.quantity === next);
        return verified ? { ok: true, name: item?.name || String(name).trim(), before, after: next, snapshot: after } : { ok: false, reason: 'inventory-write-unverified', name };
    }

    // changes 依次处理；遇到失败即停，已写入的项不回滚（报告 applied 供调用方说明）。
    function changeQuantities(changes) {
        return serial(async () => {
            const s = support();
            if (!s.ok) return s;
            let snapshot = readInventoryTables(client);
            if (!snapshot.ok) return snapshot;
            const applied = [];
            let failure = null;
            writing = true;
            try {
                for (const change of Array.isArray(changes) ? changes : [changes]) {
                    const r = await applyQuantity(snapshot, change);
                    if (!r.ok) { failure = r; break; }
                    applied.push({ name: r.name, before: r.before, after: r.after });
                    snapshot = r.snapshot;
                }
            } finally { writing = false; }
            const refreshFailed = await refreshOnce(applied.length > 0);
            if (failure) return { ...failure, applied };
            return refreshFailed ? { ok: false, reason: refreshFailed, applied } : { ok: true, applied };
        });
    }

    // 装配表行：按物品名称有则整行更新、无则插入；record 为 null 时删行。写后读回核对单元格。
    function setGearRow(name, record) {
        return serial(async () => {
            const s = support();
            if (!s.ok) return s;
            const snapshot = readInventoryTables(client);
            if (!snapshot.ok) return snapshot;
            if (!snapshot.gear || snapshot.gear.invalid) return { ok: false, reason: 'gear-table-missing' };
            const key = normalizeItemName(name);
            if (!key) return { ok: false, reason: 'gear-change-invalid' };
            const row = snapshot.gear.rows.find((r) => r.key === key);
            if (!record && !row) return { ok: true, changed: false };
            const cells = record ? GEAR_CELLS({ ...record, name: row?.name || name }) : null;
            let result;
            writing = true;
            try {
                if (!record) result = await client.deleteRow(GEAR_TABLE.name, row.rowIndex, { skipNotify: true });
                else if (row) result = await client.updateRow(GEAR_TABLE.name, row.rowIndex, cells, { skipNotify: true });
                else result = await client.insertRow(GEAR_TABLE.name, cells, { skipNotify: true });
            } finally { writing = false; }
            if (!result.ok) return { ok: false, reason: 'gear-write-failed', detail: result.reason };
            const after = readInventoryTables(client);
            const now = after.ok && after.gear ? after.gear.rows.find((r) => r.key === key) : null;
            const verified = after.ok && (record ? Boolean(now) && now.equipped === Boolean(record.equipped) && JSON.stringify(now.definition) === cells['定义JSON'] : !now);
            const refreshFailed = await refreshOnce(true);
            if (!verified) return { ok: false, reason: 'gear-write-unverified' };
            return refreshFailed ? { ok: false, reason: refreshFailed } : { ok: true, changed: true, snapshot: after };
        });
    }

    return { probe: support, read, ensure, changeQuantities, setGearRow, isWriting: () => writing };
}

