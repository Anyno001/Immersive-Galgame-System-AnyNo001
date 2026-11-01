// 背包物品表与装备定义表的读写（v0.39 战斗存储层，改写版）。
// 物品数量的唯一来源是用户模板里的「背包物品表」；战斗扩展额外维护一张「IGS战斗·装配」表，
// 存装备/道具的效果定义与穿戴状态。表结构、列名、记录格式与 v0.39 完全一致，已存数据可直接读回。
// 与 v0.39 的差别只在读取路径：
//   - createInventoryTables 可传入与 combat-tables 共用的缓存 client，读表不再各自整表导出；
//   - parseTables 与 locateInventoryTable 的结果按「同一份导出数据对象」记忆，同一份数据只解析一次。
// 记忆化的前提：导出数据视为不可变快照（缓存 client 在每次写入后换新快照，旧快照不会被原地修改）。
import { parseTables } from './table-parser.js';
import { createCachedTableClient, buildIgsSheet } from './combat-tables.js';
import { normalizeItemName } from './item-catalog.js';

// 数据库插件必须提供的函数，缺任何一个都不能启用背包写入。
export const INVENTORY_REQUIRED_API = Object.freeze([
    'exportTableAsJson', 'insertRow', 'updateRow', 'deleteRow',
    'getTableTemplate', 'importTemplateFromData', 'refreshDataAndWorldbook',
]);

export const INVENTORY_DEFAULT_NAME = '背包物品表';

// 背包表各字段可接受的列名别名。
export const INVENTORY_FIELDS = Object.freeze({
    name: Object.freeze(['物品名称', '名称', '物品', '道具名称']),
    quantity: Object.freeze(['数量', '数目', '个数']),
    description: Object.freeze(['描述/效果', '描述', '物品描述', '效果', '说明']),
    category: Object.freeze(['类别', '分类', '类型', '物品类别']),
});

// 用户的旧背包表缺这两列时，由 ensure 补列（同时改 DDL 与表头）。
export const INVENTORY_ADDED_COLUMNS = Object.freeze({
    description: Object.freeze({ header: '描述/效果', sql: 'description' }),
    category: Object.freeze({ header: '类别', sql: 'category' }),
});

// 表名里含这些词才可能是背包表。
const INVENTORY_NAME_HINTS = Object.freeze(['物品', '背包', '道具']);

// 装备定义表（IGS 自建）。
export const GEAR_TABLE = Object.freeze({
    name: 'IGS战斗·装配',
    uid: 'sheet_igscbgear',
    columns: Object.freeze(['物品名称', '类别', '稀有度', '部位', '六维加成', '被动', '效果', '是否装备', '定义JSON']),
});

// 新建背包表时用的列与 uid 前缀。
const NEW_INVENTORY_COLUMNS = Object.freeze(['物品名称', '数量', '描述/效果', '类别']);
const NEW_INVENTORY_UID = 'sheet_in05z9vz';

// 背包表由 IGS 独占写入：关掉插件自己的 AI 更新，并在提示里禁止它改动。
const MANAGED_UPDATE_CONFIG = Object.freeze({
    uiSentinel: -1, contextDepth: -1, updateFrequency: 0, batchSize: -1, skipFloors: -1,
});
const MANAGED_SOURCE_DATA = Object.freeze({
    initNode: '禁止。', deleteNode: '禁止。', updateNode: '禁止。', insertNode: '禁止。',
});

const trimmed = (value) => (value == null ? '' : String(value).trim());
// 在列名数组里找第一个命中别名的下标，找不到为 -1。
const columnIndex = (columns, aliases) => (Array.isArray(columns) ? columns : []).findIndex((name) => aliases.includes(trimmed(name)));

export function probeInventorySupport(api) {
    const missing = INVENTORY_REQUIRED_API.filter((name) => !api || typeof api[name] !== 'function');
    return missing.length ? { ok: false, reason: 'inventory-host-unsupported', missing } : { ok: true, missing: [] };
}

// ---------------------------------------------------------------------------
// 记忆化：同一份导出数据对象（引用相同）只解析、只定位一次。
// WeakMap 以数据对象为键，数据被缓存 client 换掉后自动回收。
// ---------------------------------------------------------------------------
const parsedByData = new WeakMap();   // 导出数据 -> parseTables 结果
const locatedByTables = new WeakMap(); // parseTables 结果数组 -> locateInventoryTable 结果

function parseTablesMemo(data) {
    if (!data || typeof data !== 'object') return parseTables(data);
    let parsed = parsedByData.get(data);
    if (!parsed) {
        parsed = parseTables(data);
        parsedByData.set(data, parsed);
    }
    return parsed;
}

// 在解析后的表里找背包表。恰好一张才算成功；0 张和多张分别给出不同原因。
export function locateInventoryTable(tables) {
    const memoizable = Array.isArray(tables);
    if (memoizable && locatedByTables.has(tables)) return locatedByTables.get(tables);
    const located = locateUncached(tables);
    if (memoizable) locatedByTables.set(tables, located);
    return located;
}

function locateUncached(tables) {
    const candidates = (Array.isArray(tables) ? tables : []).filter((table) => !String(table.name).startsWith('IGS')
        && INVENTORY_NAME_HINTS.some((hint) => String(table.name).includes(hint))
        && columnIndex(table.columns, INVENTORY_FIELDS.name) >= 0
        && columnIndex(table.columns, INVENTORY_FIELDS.quantity) >= 0);
    if (!candidates.length) return { ok: false, reason: 'inventory-table-missing' };
    if (candidates.length > 1) return { ok: false, reason: 'inventory-table-ambiguous', names: candidates.map((table) => table.name) };
    const table = candidates[0];
    const index = Object.fromEntries(Object.keys(INVENTORY_FIELDS).map((field) => [field, columnIndex(table.columns, INVENTORY_FIELDS[field])]));
    return { ok: true, table, index };
}

// ---------------------------------------------------------------------------
// DDL 补列：在 CREATE TABLE 的最后一列后面追加新列，遇到无法安全处理的写法一律返回 null。
// ---------------------------------------------------------------------------

// 找出一行文本里 `--` 注释的起点，引号内的 `--` 不算；没有注释返回 -1。
function commentStart(line) {
    let quote = '';
    for (let at = 0; at < line.length; at += 1) {
        const char = line[at];
        if (quote) {
            if (char === quote) quote = '';
            continue;
        }
        if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
        if (char === '-' && line[at + 1] === '-') return at;
    }
    return -1;
}

const stripComment = (line) => {
    const start = commentStart(line);
    return start < 0 ? line : line.slice(0, start);
};

// 以表级约束开头的行（主键/外键/唯一/检查/命名约束）。
const TABLE_CONSTRAINT = /^(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT)\b/i;

export function appendDdlColumns(ddl, columns) {
    const source = String(ddl || '');
    if (!columns.length) return source;
    if (source.includes('/*')) return null; // 块注释不处理
    const open = source.indexOf('(');
    const close = source.lastIndexOf(')');
    if (open < 0 || close <= open) return null;
    // 收尾括号所在行里不能有注释，否则无法判断括号是否被注释掉
    const closeLineStart = source.lastIndexOf('\n', close) + 1;
    if (commentStart(source.slice(closeLineStart, close + 1)) >= 0) return null;
    const lines = source.slice(open + 1, close).split('\n');
    let last = lines.length - 1;
    while (last >= 0 && !stripComment(lines[last]).trim()) last -= 1; // 跳过尾部空行与纯注释行
    if (last < 0) return null;
    const lastComment = commentStart(lines[last]);
    const lastBody = stripComment(lines[last]).replace(/\s+$/, '');
    const lastTail = lastComment < 0 ? '' : ` ${lines[last].slice(lastComment)}`;
    // 最后一行已带逗号，或是表级约束，说明末尾不是普通列，放弃
    if (lastBody.trim().endsWith(',') || TABLE_CONSTRAINT.test(lastBody.trim())) return null;
    const existing = new Set(lines.map((line) => stripComment(line).trim().match(/^([^\s,()]+)/)?.[1]?.toLowerCase()).filter(Boolean));
    if (columns.some((column) => existing.has(column.sql.toLowerCase()))) return null;
    const indent = (lastBody.match(/^\s*/) || [''])[0] || '  ';
    lines[last] = `${lastBody},${lastTail}`;
    const added = columns.map((column, at) => `${indent}${column.sql} TEXT${at < columns.length - 1 ? ',' : ''} -- ${column.header}`);
    lines.splice(last + 1, 0, ...added);
    return `${source.slice(0, open + 1)}${lines.join('\n')}${source.slice(close)}`;
}

// 新建背包表时写进 sourceData.ddl 的建表语句。
const inventoryDdl = (uid) => `CREATE TABLE ${uid} ( -- ${INVENTORY_DEFAULT_NAME}
  row_id INTEGER PRIMARY KEY, -- 行号
  item_name TEXT NOT NULL UNIQUE, -- 物品名称
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0), -- 数量
  description TEXT, -- 描述/效果
  category TEXT -- 类别
);`;

// 两个表名是否相同（全角半角、首尾空白归一）。
const sameTableName = (a, b) => String(a ?? '').normalize('NFKC').trim() === String(b ?? '').normalize('NFKC').trim();
// 模板里带 uid 的表项 [key, sheet]。
const sheetEntries = (template) => Object.entries(template || {}).filter(([, sheet]) => sheet && typeof sheet === 'object' && typeof sheet.uid === 'string');
// 背包表是否已经处于 IGS 独占状态。
const isManaged = (sheet) => sheet.updateConfig?.updateFrequency === 0 && sheet.sourceData?.insertNode === MANAGED_SOURCE_DATA.insertNode;

// 在用户模板上规划需要的改动：补背包表的描述/类别列、接管背包表、缺表时新建背包表与装备定义表。
// 返回 { ok, template, changes }；无法安全改动时返回带 reason 的失败结果。
export function planInventoryTemplate(template, tables) {
    const next = JSON.parse(JSON.stringify(template || {}));
    const entries = sheetEntries(next);
    let orderNo = entries.reduce((max, [, sheet]) => Math.max(max, Number(sheet.orderNo) || 0), -1);
    const changes = [];
    const located = locateInventoryTable(tables);
    if (!located.ok && located.reason !== 'inventory-table-missing') return located;
    if (located.ok) {
        const matches = entries.filter(([, sheet]) => sheet.name === located.table.name);
        if (matches.length !== 1) return { ok: false, reason: 'inventory-template-mismatch', name: located.table.name };
        const sheet = matches[0][1];
        // 模板表头必须与当前已有数据的表头一致，否则说明模板与实际表不同步
        const templateHeader = Array.isArray(sheet.content?.[0]) ? sheet.content[0].map(trimmed) : [];
        if (templateHeader.join('') !== located.table.columns.map(trimmed).join('')) {
            return { ok: false, reason: 'inventory-template-mismatch', name: located.table.name };
        }
        const missingColumns = Object.keys(INVENTORY_ADDED_COLUMNS).filter((field) => located.index[field] < 0).map((field) => INVENTORY_ADDED_COLUMNS[field]);
        if (missingColumns.length) {
            const ddl = String(sheet.sourceData?.ddl || '').trim();
            if (ddl) {
                const patched = appendDdlColumns(ddl, missingColumns);
                if (patched === null) return { ok: false, reason: 'inventory-ddl-unsupported', name: located.table.name };
                sheet.sourceData.ddl = patched;
            }
            sheet.content = [
                [...sheet.content[0], ...missingColumns.map((column) => column.header)],
                ...sheet.content.slice(1).map((row) => [...row, ...missingColumns.map(() => '')]),
            ];
            changes.push({ kind: 'inventory-columns', added: missingColumns.map((column) => column.header) });
        }
        if (!isManaged(sheet)) {
            sheet.updateConfig = { ...MANAGED_UPDATE_CONFIG };
            sheet.sourceData = { ...(sheet.sourceData || {}), ...MANAGED_SOURCE_DATA };
            changes.push({ kind: 'inventory-managed' });
        }
    } else {
        // 没有背包表：同名但缺列的表不能覆盖，只有彻底没有才新建
        const sameName = [...(Array.isArray(tables) ? tables : []).map((table) => table.name), ...entries.map(([, sheet]) => sheet.name)]
            .find((name) => sameTableName(name, INVENTORY_DEFAULT_NAME));
        if (sameName !== undefined) return { ok: false, reason: 'inventory-table-incomplete', name: sameName };
        let uid = NEW_INVENTORY_UID;
        for (let suffix = 2; Object.hasOwn(next, uid); suffix += 1) uid = `${NEW_INVENTORY_UID}${suffix}`;
        orderNo += 1;
        const sheet = buildIgsSheet({ name: INVENTORY_DEFAULT_NAME, columns: NEW_INVENTORY_COLUMNS, note: '主角背包，物品数量的唯一来源' }, orderNo, uid);
        sheet.sourceData.ddl = inventoryDdl(uid);
        next[uid] = sheet;
        changes.push({ kind: 'inventory-created' });
    }
    const hasGearTable = (Array.isArray(tables) ? tables : []).some((table) => table.name === GEAR_TABLE.name)
        || entries.some(([, sheet]) => sheet.name === GEAR_TABLE.name);
    if (!hasGearTable) {
        let uid = GEAR_TABLE.uid;
        for (let suffix = 2; Object.hasOwn(next, uid); suffix += 1) uid = `${GEAR_TABLE.uid}${suffix}`;
        orderNo += 1;
        next[uid] = buildIgsSheet({ name: GEAR_TABLE.name, columns: GEAR_TABLE.columns, note: 'IGS 战斗扩展的装备与道具效果、穿戴状态' }, orderNo, uid);
        changes.push({ kind: 'gear-created' });
    }
    if (changes.length) next.mate = { ...(next.mate && typeof next.mate === 'object' ? next.mate : {}), updateConfigUiSentinel: -1 };
    return { ok: true, template: next, changes };
}

// 解析装备定义表：列缺失时整表标为 invalid；同名行、定义 JSON 损坏的行记入 diagnostics 并跳过。
function readGearTable(table, diagnostics) {
    const index = Object.fromEntries(GEAR_TABLE.columns.map((column) => [column, table.columns.indexOf(column)]));
    if (Object.values(index).some((at) => at < 0)) {
        diagnostics.push({ code: 'gear-table-columns-invalid' });
        return { name: table.name, rows: [], invalid: true };
    }
    const rows = [];
    const seen = new Set();
    table.rows.forEach((row, at) => {
        const name = trimmed(row[index.物品名称]);
        const key = normalizeItemName(name);
        if (!key) return;
        if (seen.has(key)) { diagnostics.push({ code: 'gear-name-duplicate', name }); return; }
        let definition = null;
        try {
            definition = JSON.parse(trimmed(row[index.定义JSON]) || 'null');
        } catch {
            diagnostics.push({ code: 'gear-definition-invalid', name });
            return;
        }
        seen.add(key);
        rows.push({
            rowIndex: at + 1, name, key, category: trimmed(row[index.类别]), rarity: trimmed(row[index.稀有度]),
            slot: trimmed(row[index.部位]), equipped: trimmed(row[index.是否装备]) === '是', definition,
        });
    });
    return { name: table.name, rows };
}

// 从已解析的表里整理出背包与装备视图。
function buildInventorySnapshot(tables) {
    const located = locateInventoryTable(tables);
    if (!located.ok) return { ...located, tables };
    const { table, index } = located;
    const diagnostics = [];
    const items = [];
    const seen = new Set();
    table.rows.forEach((row, at) => {
        const name = trimmed(row[index.name]);
        const key = normalizeItemName(name);
        if (!key) return;
        const quantityText = trimmed(row[index.quantity]);
        const quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : NaN;
        if (!(quantity > 0)) { diagnostics.push({ code: 'inventory-quantity-invalid', name, value: quantityText }); return; }
        if (seen.has(key)) { diagnostics.push({ code: 'inventory-name-duplicate', name }); return; }
        seen.add(key);
        items.push({
            rowIndex: at + 1, name, key, quantity,
            description: index.description >= 0 ? trimmed(row[index.description]) : '',
            category: index.category >= 0 ? trimmed(row[index.category]) : '',
        });
    });
    const gearTable = tables.find((candidate) => candidate.name === GEAR_TABLE.name) || null;
    const gear = gearTable ? readGearTable(gearTable, diagnostics) : null;
    return { ok: true, tables, inventory: { name: table.name, columns: table.columns, index, items }, gear, diagnostics };
}

// 用 client 读一次背包快照。同一份导出数据的 parseTables 与表定位走记忆；
// 条目数组每次重新生成，调用方拿到的对象互不共享。
export function readInventoryTables(client) {
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'inventory-table-read-failed', detail: read.reason };
    const data = read.data;
    if (!data || typeof data !== 'object' || !Object.keys(data).length) return { ok: false, reason: 'inventory-table-not-ready' };
    return buildInventorySnapshot(parseTablesMemo(data));
}

// 装备定义行 -> 表格单元格。
const gearCells = (record) => ({
    物品名称: trimmed(record.name), 类别: trimmed(record.category), 稀有度: trimmed(record.rarity), 部位: trimmed(record.slot),
    六维加成: trimmed(record.bonusText), 被动: trimmed(record.passiveText), 效果: trimmed(record.effectText),
    是否装备: record.equipped ? '是' : '否', 定义JSON: JSON.stringify(record.definition ?? null),
});

// 背包与装备表的读写入口。
//   probe() 检查宿主函数；read() 读快照；ensure() 缺表缺列时按模板补建；
//   changeQuantities(changes) 批量改物品数量；setGearRow(name, record) 新增/更新/删除装备定义行；
//   isWriting() 写入进行中（供上层屏蔽表更新事件）。
// client 可与 combat-tables 共用同一个缓存 client，这样两边的读取共享同一份导出数据；
// serial 可传入外部串行器，让背包写入与账本写入排在同一条队列里。
// 暴露 client，账本据此取表版本号来做记忆化。
export function createInventoryTables({ api, client = createCachedTableClient({ api }), serial = null } = {}) {
    let writing = false;
    let tail = Promise.resolve();
    const runSerial = serial || ((task) => {
        const run = tail.then(task, task);
        tail = run.catch(() => {});
        return run;
    });

    const probe = () => probeInventorySupport(api);
    const read = () => {
        const support = probe();
        return support.ok ? readInventoryTables(client) : support;
    };

    // 缺表缺列时在用户当前模板上补建，建完核对。
    function ensure() {
        return runSerial(async () => {
            const support = probe();
            if (!support.ok) return support;
            const current = client.readTables();
            if (!current.ok) return { ok: false, reason: 'inventory-table-read-failed', detail: current.reason };
            if (!current.data || typeof current.data !== 'object' || !Object.keys(current.data).length) return { ok: false, reason: 'inventory-table-not-ready' };
            const tables = parseTablesMemo(current.data);
            const templateRead = client.getTableTemplate();
            if (!templateRead.ok) return { ok: false, reason: 'inventory-template-unavailable', detail: templateRead.reason };
            const plan = planInventoryTemplate(templateRead.data, tables);
            if (!plan.ok) return plan;
            if (!plan.changes.length) return { ok: true, changes: [] };
            // 用户模板与已有表集合不一致时不导入，避免覆盖用户的表
            const existingNames = new Set(tables.map((table) => table.name));
            const plannedNames = parseTables(plan.template).map((table) => table.name);
            const createdNames = new Set([
                ...(plan.changes.some((change) => change.kind === 'inventory-created') ? [INVENTORY_DEFAULT_NAME] : []),
                ...(plan.changes.some((change) => change.kind === 'gear-created') ? [GEAR_TABLE.name] : []),
            ]);
            const hidden = [...existingNames].filter((name) => !plannedNames.includes(name));
            const extra = plannedNames.filter((name) => !existingNames.has(name) && !createdNames.has(name));
            if (hidden.length || extra.length) {
                return { ok: false, reason: 'inventory-template-diverged', ...(hidden.length && { hidden }), ...(extra.length && { extra }) };
            }
            writing = true;
            let imported;
            try {
                imported = await client.importTemplate(plan.template, { scope: 'chat', dataMode: 'seed' });
            } finally {
                writing = false;
            }
            if (!imported.ok) return { ok: false, reason: 'inventory-template-import-failed', detail: imported.message || imported.reason };
            if (imported.result?.runtimeReady === false) return { ok: false, reason: 'inventory-runtime-not-ready', changes: plan.changes };
            // 导入后重新读取核对：装备表要有效，背包表要补齐新增的列
            const verified = readInventoryTables(client);
            if (!verified.ok || !verified.gear || verified.gear.invalid) return { ok: false, reason: 'inventory-ensure-unverified', detail: verified.reason || '' };
            const stillMissing = Object.keys(INVENTORY_ADDED_COLUMNS).filter((field) => verified.inventory.index[field] < 0);
            return stillMissing.length ? { ok: false, reason: 'inventory-ensure-unverified', missing: stillMissing } : { ok: true, changes: plan.changes };
        });
    }

    // 写入后刷新世界书；失败不抛错，只返回原因。
    async function refreshAfterWrite(didWrite) {
        if (!didWrite) return null;
        try {
            return (await client.refresh()).ok ? null : 'inventory-refresh-failed';
        } catch {
            return 'inventory-refresh-failed';
        }
    }

    // 对一条物品变化：写表后立即重读核对。snapshot 是写前的快照。
    async function applyQuantityChange(snapshot, { name, delta, description = '', category = '' }) {
        const key = normalizeItemName(name);
        const amount = Number(delta);
        if (!key || !Number.isInteger(amount) || amount === 0) return { ok: false, reason: 'inventory-change-invalid', name };
        const { inventory } = snapshot;
        const { columns } = inventory;
        const existing = inventory.items.find((item) => item.key === key);
        const before = existing ? existing.quantity : 0;
        const after = before + amount;
        if (after < 0 || (amount < 0 && !existing)) {
            return { ok: false, reason: existing ? 'inventory-quantity-insufficient' : 'inventory-item-missing', name, have: before };
        }
        let result;
        if (existing) {
            result = after === 0
                ? await client.deleteRow(inventory.name, existing.rowIndex, { skipNotify: true })
                : await client.updateRow(inventory.name, existing.rowIndex, { [columns[inventory.index.quantity]]: String(after) }, { skipNotify: true });
        } else {
            const row = { [columns[inventory.index.name]]: String(name).trim(), [columns[inventory.index.quantity]]: String(after) };
            if (description && inventory.index.description >= 0) row[columns[inventory.index.description]] = String(description);
            if (category && inventory.index.category >= 0) row[columns[inventory.index.category]] = String(category);
            result = await client.insertRow(inventory.name, row, { skipNotify: true });
        }
        if (!result.ok) return { ok: false, reason: 'inventory-write-failed', name, detail: result.reason };
        // 写操作已使缓存作废，这里读到的是最新数据
        const verified = readInventoryTables(client);
        const found = verified.ok ? verified.inventory.items.find((item) => item.key === key) : null;
        const confirmed = verified.ok && (after === 0 ? !found : found?.quantity === after);
        return confirmed
            ? { ok: true, name: existing?.name || String(name).trim(), before, after, snapshot: verified }
            : { ok: false, reason: 'inventory-write-unverified', name };
    }

    // 批量改物品数量：按顺序逐条执行，遇到失败停下，已完成的列入 applied。
    function changeQuantities(changes) {
        return runSerial(async () => {
            const support = probe();
            if (!support.ok) return support;
            let snapshot = readInventoryTables(client);
            if (!snapshot.ok) return snapshot;
            const applied = [];
            let failure = null;
            writing = true;
            try {
                for (const change of Array.isArray(changes) ? changes : [changes]) {
                    const result = await applyQuantityChange(snapshot, change);
                    if (!result.ok) { failure = result; break; }
                    applied.push({ name: result.name, before: result.before, after: result.after });
                    snapshot = result.snapshot;
                }
            } finally {
                writing = false;
            }
            const refreshFailure = await refreshAfterWrite(applied.length > 0);
            if (failure) return { ...failure, applied };
            return refreshFailure ? { ok: false, reason: refreshFailure, applied } : { ok: true, applied };
        });
    }

    // 新增/更新/删除一行装备定义（record 为 null 表示删除）。写后重读核对定义与穿戴状态。
    function setGearRow(name, record) {
        return runSerial(async () => {
            const support = probe();
            if (!support.ok) return support;
            const snapshot = readInventoryTables(client);
            if (!snapshot.ok) return snapshot;
            if (!snapshot.gear || snapshot.gear.invalid) return { ok: false, reason: 'gear-table-missing' };
            const key = normalizeItemName(name);
            if (!key) return { ok: false, reason: 'gear-change-invalid' };
            const existing = snapshot.gear.rows.find((row) => row.key === key);
            if (!record && !existing) return { ok: true, changed: false };
            const cells = record ? gearCells({ ...record, name: existing?.name || name }) : null;
            let result;
            writing = true;
            try {
                if (record) {
                    result = existing
                        ? await client.updateRow(GEAR_TABLE.name, existing.rowIndex, cells, { skipNotify: true })
                        : await client.insertRow(GEAR_TABLE.name, cells, { skipNotify: true });
                } else {
                    result = await client.deleteRow(GEAR_TABLE.name, existing.rowIndex, { skipNotify: true });
                }
            } finally {
                writing = false;
            }
            if (!result.ok) return { ok: false, reason: 'gear-write-failed', detail: result.reason };
            const verified = readInventoryTables(client);
            const found = verified.ok && verified.gear ? verified.gear.rows.find((row) => row.key === key) : null;
            const confirmed = verified.ok && (record
                ? !!found && found.equipped === !!record.equipped && JSON.stringify(found.definition) === cells.定义JSON
                : !found);
            const refreshFailure = await refreshAfterWrite(true);
            if (!confirmed) return { ok: false, reason: 'gear-write-unverified' };
            return refreshFailure ? { ok: false, reason: refreshFailure } : { ok: true, changed: true, snapshot: verified };
        });
    }

    return { probe, read, ensure, changeQuantities, setGearRow, isWriting: () => writing, client };
}
