// 战斗扩展在数据库插件（AutoCardUpdaterAPI）里的聊天级表：档案、日志、属性、数值日志（v0.39 战斗存储层，改写版）。
// 表结构、列名、记录格式、记录 ID 规则与 v0.39 完全一致，已存下的数据可以直接读回。
// 与 v0.39 的差别只在读写路径：表读取按版本号缓存、解码按 sheet 惰性进行、flush 一批只读一次表。
import { parseTables } from './table-parser.js';

// 数据库插件必须提供的 5 个函数，缺任何一个都不能启用战斗扩展。
export const COMBAT_TABLE_REQUIRED_API = Object.freeze([
    'exportTableAsJson', 'insertRow', 'getTableTemplate', 'importTemplateFromData', 'refreshDataAndWorldbook',
]);

// 单元格字符数上限，超长 JSON 按「分段 i/n」拆成多行。
export const DEFAULT_COMBAT_CELL_MAX = 16000;
const REFRESH_TIMEOUT_MS = 15000;
const SEGMENT_COLUMN = '分段';
// 没有插件事件可订阅时，缓存只在这个时间窗内复用（毫秒）。
export const TABLE_CACHE_TTL_MS = 1500;

const text = (value) => (value == null ? '' : String(value));
const numberOrNull = (value) => (text(value).trim() === '' ? null : Number(value));
const anchorText = (anchor) => (anchor ? JSON.stringify(anchor) : '');
const anchorOf = (cell) => (cell ? JSON.parse(cell) : null);

// 属性表与数值日志表的列、编码完全相同，只是名称与 uid 不同。
function logSheetSpec(name, uid) {
    return Object.freeze({
        name,
        uid,
        optional: true,
        columns: Object.freeze(['记录ID', '角色', '类型', '锚点', '时间', '变化', SEGMENT_COLUMN, '载荷JSON']),
        jsonColumn: '载荷JSON',
        keyOf: (cells) => cells.记录ID,
        toCells: (record) => ({
            记录ID: text(record.id), 角色: text(record.character), 类型: text(record.type),
            锚点: anchorText(record.anchor), 时间: text(record.createdAt), 变化: text(record.change),
        }),
        jsonOf: (record) => record.payload,
        fromCells: (cells, payload) => ({
            id: cells.记录ID, type: cells.类型, character: cells.角色, anchor: anchorOf(cells.锚点),
            createdAt: numberOrNull(cells.时间), change: cells.变化, payload,
        }),
    });
}

// 四种记录的表规格。keyOf 给出记录键（写入去重、读回核对都靠它），toCells 给出非 JSON 列。
export const COMBAT_TABLE_SPECS = Object.freeze({
    profile: Object.freeze({
        name: 'IGS战斗·档案',
        uid: 'sheet_igscbprofile',
        columns: Object.freeze(['档案ID', '名称', '类型', '职业', '版本', '生成时间', SEGMENT_COLUMN, '定义JSON']),
        jsonColumn: '定义JSON',
        keyOf: (cells) => `${cells.档案ID}|${cells.版本}`,
        toCells: (record) => ({
            档案ID: text(record.id), 名称: text(record.name), 类型: text(record.kind), 职业: text(record.className),
            版本: text(record.version), 生成时间: text(record.createdAt),
        }),
        jsonOf: (record) => record.definition,
        fromCells: (cells, definition) => ({
            id: cells.档案ID, name: cells.名称, kind: cells.类型, className: cells.职业,
            version: numberOrNull(cells.版本), createdAt: numberOrNull(cells.生成时间), definition,
        }),
    }),
    ledger: Object.freeze({
        name: 'IGS战斗·日志',
        uid: 'sheet_igscbledger',
        columns: Object.freeze(['记录ID', '类型', '角色', '锚点', '时间', SEGMENT_COLUMN, '载荷JSON']),
        jsonColumn: '载荷JSON',
        keyOf: (cells) => cells.记录ID,
        toCells: (record) => ({
            记录ID: text(record.id), 类型: text(record.type), 角色: text(record.character),
            锚点: anchorText(record.anchor), 时间: text(record.createdAt),
        }),
        jsonOf: (record) => record.payload,
        fromCells: (cells, payload) => ({
            id: cells.记录ID, type: cells.类型, character: cells.角色, anchor: anchorOf(cells.锚点),
            createdAt: numberOrNull(cells.时间), payload,
        }),
    }),
    // 属性表与数值日志表的列、编码相同，共用 logSheetSpec。
    attribute: logSheetSpec('IGS战斗·属性', 'sheet_igscbattr'),
    stats: logSheetSpec('IGS数值·日志', 'sheet_igsstatlog'),
});

// 各表在模板里的说明文字。
const TABLE_LABELS = Object.freeze({
    profile: '角色与职业档案', ledger: '成长日志', attribute: '属性记录', stats: '数值系统日志',
});

const SPEC_KINDS = Object.keys(COMBAT_TABLE_SPECS);
// 读取结果里不对外暴露 raw 的三种（数值日志的 raw 照旧保留，与 v0.39 一致）。
const RAW_KEYS_HIDDEN_FROM_READ = ['profileRaw', 'ledgerRaw', 'attributeRaw'];

// 检查宿主是否具备 5 个必需函数。
export function probeCombatTableSupport(api) {
    const missing = COMBAT_TABLE_REQUIRED_API.filter((name) => !api || typeof api[name] !== 'function');
    return missing.length
        ? { ok: false, reason: 'combat-table-host-unsupported', missing }
        : { ok: true, missing: [] };
}

const placement = (order) => ({ position: 'at_depth_as_system', depth: 2, order });

// 生成一张 IGS 受管表的模板（不注入世界书，AI 不得填写）。inventory-tables 也复用它。
export function buildIgsSheet({ name, columns, note }, orderNo, uid) {
    return {
        uid,
        name,
        sourceData: {
            note: `${note}，由 IGS 程序维护。AI 不得填写、修改或删除此表。`,
            initNode: '禁止。', deleteNode: '禁止。', updateNode: '禁止。', insertNode: '禁止。',
        },
        content: [['row_id', ...columns]],
        updateConfig: { uiSentinel: -1, contextDepth: -1, updateFrequency: 0, batchSize: -1, skipFloors: -1 },
        exportConfig: {
            enabled: false, splitByRow: false, entryName: name, entryType: 'constant', keywords: '',
            preventRecursion: true, injectionTemplate: '', extraIndexEnabled: false,
            extraIndexEntryName: `${name}-索引`, extraIndexColumns: [], extraIndexColumnModes: {},
            extraIndexInjectionTemplate: '',
            entryPlacement: placement(10000), extraIndexPlacement: placement(10010),
            fixedEntryPlacement: placement(99990), fixedIndexPlacement: placement(99991),
            injectIntoWorldbook: false,
        },
        orderNo,
    };
}

// 按种类生成战斗表模板。
export function buildCombatSheet(kind, orderNo, uid = COMBAT_TABLE_SPECS[kind].uid) {
    const spec = COMBAT_TABLE_SPECS[kind];
    return buildIgsSheet({ name: spec.name, columns: spec.columns, note: `IGS 战斗扩展的${TABLE_LABELS[kind]}` }, orderNo, uid);
}

const isSheetEntry = ([, value]) => value && typeof value === 'object' && typeof value.uid === 'string';

// 在用户当前模板上补齐缺的战斗表，返回新模板（不改入参）与新增的种类。
// 整体 JSON 克隆只在建表时跑一次，不在热路径上。
export function withCombatSheets(template) {
    const cloned = JSON.parse(JSON.stringify(template || {}));
    const sheets = Object.entries(cloned || {}).filter(isSheetEntry);
    const existingNames = new Set(sheets.map(([, sheet]) => sheet.name));
    let orderNo = sheets.reduce((max, [, sheet]) => Math.max(max, Number(sheet.orderNo) || 0), -1);
    const added = [];
    for (const kind of SPEC_KINDS) {
        const spec = COMBAT_TABLE_SPECS[kind];
        if (existingNames.has(spec.name)) continue;
        // uid 被占用时加数字后缀。
        let uid = spec.uid;
        for (let n = 2; Object.hasOwn(cloned, uid); n += 1) uid = `${spec.uid}${n}`;
        orderNo += 1;
        cloned[uid] = buildCombatSheet(kind, orderNo, uid);
        added.push(kind);
    }
    if (added.length) {
        cloned.mate = { ...(cloned.mate && typeof cloned.mate === 'object' ? cloned.mate : {}), updateConfigUiSentinel: -1 };
    }
    return { template: cloned, added };
}

const findSheet = (sheets, kind) => sheets.find((sheet) => sheet.name === COMBAT_TABLE_SPECS[kind].name) || null;
const SEGMENT_PATTERN = /^(\d{1,4})\/(\d{1,4})$/;
const rowToCells = (sheet, row) => Object.fromEntries(sheet.columns.map((column, i) => [column, text(row[i])]));

// 把一张表的行解码成记录：同键的分段行按 i/n 拼回 JSON。缺段、段数不符、JSON 非法只进诊断，不抛错。
export function decodeCombatRows(kind, sheet) {
    const spec = COMBAT_TABLE_SPECS[kind];
    const groups = new Map();
    const diagnostics = [];
    sheet.rows.forEach((row, rowIndex) => {
        const cells = rowToCells(sheet, Array.isArray(row) ? row : []);
        const key = spec.keyOf(cells);
        const match = cells[SEGMENT_COLUMN].match(SEGMENT_PATTERN);
        const [part, total] = match ? [Number(match[1]), Number(match[2])] : [1, 1];
        if (!key || (match === null && cells[SEGMENT_COLUMN]) || part < 1 || part > total) {
            diagnostics.push({ code: 'combat-row-invalid', kind, row: rowIndex });
            return;
        }
        let group = groups.get(key);
        if (group && group.total !== total) {
            diagnostics.push({ code: 'combat-row-segment-mismatch', kind, key, row: rowIndex });
            group = null;
        }
        if (!group) group = { cells, total, parts: new Map(), row: rowIndex };
        group.cells = cells;
        group.parts.set(part, cells[spec.jsonColumn]);
        groups.set(key, group);
    });
    const records = [];
    for (const [key, group] of groups) {
        if (group.parts.size !== group.total) {
            diagnostics.push({ code: 'combat-row-segment-incomplete', kind, key, have: group.parts.size, total: group.total });
            continue;
        }
        const raw = Array.from({ length: group.total }, (_, i) => group.parts.get(i + 1)).join('');
        try {
            records.push({ key, raw, record: spec.fromCells(group.cells, JSON.parse(raw)) });
        } catch {
            diagnostics.push({ code: 'combat-row-json-invalid', kind, key });
        }
    }
    return { records, diagnostics };
}

// ---------------------------------------------------------------------------
// 带缓存的表客户端。接口与 v0.39 的 createShujukuClient 一致，另加版本号与缓存控制：
//   - 自己每写一次（insertRow / updateRow / deleteRow / 导入模板）版本号 +1，缓存作废；
//   - 数据库插件触发表更新事件时版本号 +1；聊天切换时调用 invalidate()；
//   - 插件不支持事件订阅时，缓存只在 TTL_MS 内复用，过期自动重读。
// 缓存内容：exportTableAsJson 的结果、parseTables 的解析结果、按 sheet 惰性解码的记录。
// ---------------------------------------------------------------------------
const CALLBACK_SAFETY_TTL_MS = 60000;

// 同一宿主 api 上的所有缓存客户端共用一个版本号：任一客户端写入、导入或收到插件事件，其余客户端的缓存同时作废。
// 否则战斗表与其他持有独立客户端的模块并存时，一方写入后另一方在 TTL 窗口内读到旧数据。
const sharedStates = new WeakMap();
const detachedState = { version: 0 };
function sharedStateOf(api) {
    if (!api || typeof api !== 'object') return detachedState;
    let state = sharedStates.get(api);
    if (!state) { state = { version: 0 }; sharedStates.set(api, state); }
    return state;
}

// 导出结果是否可缓存：空对象表示数据库尚未载入，不缓存，载入后下一次读取立即生效。
const cacheable = (data) => Boolean(data) && typeof data === 'object' && Object.keys(data).length > 0;

function isSuccessful(result) {
    if (result == null || result === false || result === -1) return false;
    if (typeof result === 'object' && result.success === false) return false;
    return true;
}

export function createCachedTableClient({ api, now = Date.now, ttlMs = TABLE_CACHE_TTL_MS } = {}) {
    const shared = sharedStateOf(api);
    let entry = null; // { version, at, data, sheets, decoded: Map }
    let subscribed = false;
    const stats = { exports: 0, hits: 0, decodes: 0, invalidations: 0 };

    const bump = () => { shared.version += 1; entry = null; stats.invalidations += 1; };
    const onTableUpdated = () => bump();

    function subscribe() {
        if (subscribed || !api || typeof api.registerTableUpdateCallback !== 'function') return;
        try { api.registerTableUpdateCallback(onTableUpdated); subscribed = true; } catch { /* 订阅失败则退回 TTL 模式 */ }
    }

    const entryValid = () => entry && entry.version === shared.version
        && now() - entry.at < (subscribed ? CALLBACK_SAFETY_TTL_MS : ttlMs);

    // 读整表（带缓存）。失败结果不缓存。
    function readTables() {
        if (!api || typeof api.exportTableAsJson !== 'function') return { ok: false, reason: 'missing-api' };
        subscribe();
        if (entryValid()) { stats.hits += 1; return { ok: true, data: entry.data }; }
        let data;
        try {
            stats.exports += 1;
            data = api.exportTableAsJson();
        } catch (error) {
            return { ok: false, reason: String((error && error.message) || 'read-failed') };
        }
        entry = cacheable(data) ? { version: shared.version, at: now(), data, sheets: null, decoded: new Map() } : null;
        return { ok: true, data };
    }

    // 读并解析出各 sheet（同一版本只解析一次）。
    function readSheets() {
        const read = readTables();
        if (!read.ok) return read;
        const data = read.data;
        if (!data || typeof data !== 'object' || !Object.keys(data).length) return { ok: false, reason: 'not-ready' };
        if (!entry.sheets) entry.sheets = parseTables(data);
        return { ok: true, sheets: entry.sheets };
    }

    // 按 sheet 惰性解码：同一版本同一种类只解码一次。
    function decodeKind(kind, sheet) {
        const store = entry && entry.decoded;
        if (store && store.has(kind)) return store.get(kind);
        stats.decodes += 1;
        const decoded = decodeCombatRows(kind, sheet);
        if (store) store.set(kind, decoded);
        return decoded;
    }

    async function writeVia(method, objectArgs, positionalArgs, failReason, onOk) {
        if (!api || typeof api[method] !== 'function') return { ok: false, reason: 'missing-api' };
        const result = objectArgs ? await api[method](objectArgs) : await api[method](...positionalArgs);
        bump(); // 无论成败都作废缓存：插件可能已部分写入
        if (!isSuccessful(result)) return { ok: false, reason: failReason };
        return onOk(result);
    }

    return {
        stats,
        version: () => shared.version,
        invalidate: bump,
        readTables,
        readSheets,
        decodeKind,
        dispose() {
            if (subscribed && api && typeof api.unregisterTableUpdateCallback === 'function') {
                try { api.unregisterTableUpdateCallback(onTableUpdated); } catch { /* */ }
            }
            subscribed = false;
            entry = null;
        },
        async updateRowAndRefresh(tableName, rowIndex, patch) {
            if (!api || typeof api.updateRow !== 'function') return { ok: false, reason: 'missing-update-row' };
            const updated = await api.updateRow(tableName, rowIndex, patch);
            bump();
            if (!isSuccessful(updated)) return { ok: false, reason: 'update-row-failed', result: updated };
            if (typeof api.refreshDataAndWorldbook === 'function') {
                const refreshed = await api.refreshDataAndWorldbook();
                if (!isSuccessful(refreshed)) return { ok: false, reason: 'refresh-worldbook-failed', result: refreshed };
            }
            return { ok: true, tableName, rowIndex, patch };
        },
        async updateCell(tableName, rowIndex, columnName, value) {
            if (!api || typeof api.updateCell !== 'function') return { ok: false, reason: 'missing-api' };
            const result = await api.updateCell(tableName, rowIndex, columnName, String(value));
            bump();
            return isSuccessful(result) ? { ok: true } : { ok: false, reason: 'update-failed' };
        },
        insertRow(tableName, rowData, options) {
            const objectArgs = options && typeof options === 'object' ? { ...options, tableName, data: rowData } : null;
            return writeVia('insertRow', objectArgs, [tableName, rowData], 'insert-failed',
                (result) => (typeof result === 'number' ? { ok: true, rowIndex: result } : { ok: true }));
        },
        updateRow(tableName, rowIndex, patch, options) {
            const objectArgs = options && typeof options === 'object' ? { ...options, tableName, rowIndex, data: patch } : null;
            return writeVia('updateRow', objectArgs, [tableName, rowIndex, patch], 'update-failed', () => ({ ok: true }));
        },
        deleteRow(tableName, rowIndex, options) {
            const objectArgs = options && typeof options === 'object' ? { ...options, tableName, rowIndex } : null;
            return writeVia('deleteRow', objectArgs, [tableName, rowIndex], 'delete-failed', () => ({ ok: true }));
        },
        getTableTemplate() {
            if (!api || typeof api.getTableTemplate !== 'function') return { ok: false, reason: 'missing-api' };
            try {
                const raw = api.getTableTemplate({ scope: 'chat' });
                const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return data && typeof data === 'object' && !Array.isArray(data)
                    ? { ok: true, data }
                    : { ok: false, reason: 'template-unavailable' };
            } catch (error) {
                return { ok: false, reason: 'template-read-failed', message: String((error && error.message) || error) };
            }
        },
        async importTemplate(template, options = {}) {
            if (!api || typeof api.importTemplateFromData !== 'function') return { ok: false, reason: 'missing-api' };
            try {
                const result = await api.importTemplateFromData(template, options);
                bump();
                return result && typeof result === 'object' && result.success === true
                    ? { ok: true, result }
                    : { ok: false, reason: 'import-failed', message: String((result && (result.error || result.message)) || '') };
            } catch (error) {
                bump();
                return { ok: false, reason: 'import-failed', message: String((error && error.message) || error) };
            }
        },
        async refresh() {
            if (!api || typeof api.refreshDataAndWorldbook !== 'function') return { ok: false, reason: 'missing-api' };
            // 行已写入并核对过；插件刷新世界书迟迟不回应时不能一直占着写入队列。
            let timer;
            const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: true, slow: true }), REFRESH_TIMEOUT_MS); });
            try {
                return await Promise.race([Promise.resolve(api.refreshDataAndWorldbook()).then(() => ({ ok: true })), timeout]);
            } finally { clearTimeout(timer); }
        },
        registerCallback(callback) {
            if (api && typeof api.registerTableUpdateCallback === 'function') api.registerTableUpdateCallback(callback);
        },
        unregisterCallback(callback) {
            if (api && typeof api.unregisterTableUpdateCallback === 'function') api.unregisterTableUpdateCallback(callback);
        },
    };
}

// 读出各 sheet：客户端自带缓存解析时用缓存，否则退回 readTables + parseTables（与 v0.39 相同）。
function loadSheets(client) {
    if (typeof client.readSheets === 'function') {
        const loaded = client.readSheets();
        if (loaded.ok) return loaded;
        if (loaded.reason === 'not-ready') return { ok: false, reason: 'combat-table-not-ready' };
        return { ok: false, reason: 'combat-table-read-failed', detail: loaded.reason };
    }
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'combat-table-read-failed', detail: read.reason };
    const data = read.data;
    if (!data || typeof data !== 'object' || !Object.keys(data).length) return { ok: false, reason: 'combat-table-not-ready' };
    return { ok: true, sheets: parseTables(data) };
}

// 从 sheet 列表里整理出结果。kinds 为数组时只解码这些种类（其余只检查表是否存在）；
// 缺表情况始终按全部种类统计，所以只读 stats 也不会漏掉其他表缺失。
function summarizeSheets(client, sheets, kinds) {
    const result = { ok: true, missing: [], optionalMissing: [], diagnostics: [] };
    for (const kind of SPEC_KINDS) {
        const sheet = findSheet(sheets, kind);
        if (!sheet) {
            (COMBAT_TABLE_SPECS[kind].optional ? result.optionalMissing : result.missing).push(kind);
            result[kind] = null;
            continue;
        }
        if (Array.isArray(kinds) && !kinds.includes(kind)) continue;
        const decoded = typeof client.decodeKind === 'function' ? client.decodeKind(kind, sheet) : decodeCombatRows(kind, sheet);
        result[kind] = decoded.records.map((item) => item.record);
        result.diagnostics.push(...decoded.diagnostics);
        result[`${kind}Raw`] = decoded.records;
    }
    return result;
}

// 读取并解码战斗表。options.kinds 可限定只解码某几种（如数值侧只要 ['stats']）。
export function readCombatTables(client, { kinds } = {}) {
    const loaded = loadSheets(client);
    return loaded.ok ? summarizeSheets(client, loaded.sheets, kinds) : loaded;
}

// 把一条记录编码成待写入的行：JSON 超过 cellMax 时拆成多段，每段一行，分段列写 i/n。
export function encodeCombatRecord(kind, record, cellMax = DEFAULT_COMBAT_CELL_MAX) {
    const spec = COMBAT_TABLE_SPECS[kind];
    const cells = spec.toCells(record);
    const raw = JSON.stringify(spec.jsonOf(record) ?? null);
    const size = Math.max(1, Math.floor(cellMax));
    const segments = [];
    for (let at = 0; at < raw.length; at += size) segments.push(raw.slice(at, at + size));
    if (!segments.length) segments.push(raw);
    return {
        key: spec.keyOf(cells),
        raw,
        cells,
        rows: segments.map((segment, i) => ({ ...cells, [SEGMENT_COLUMN]: `${i + 1}/${segments.length}`, [spec.jsonColumn]: segment })),
    };
}

// 一条待写入请求是否还应该执行：已中止或 shouldStart 返回非 true 都算过期。
function requestStillValid(item) {
    try {
        return !item.options?.signal?.aborted && (!item.options?.shouldStart || item.options.shouldStart() === true);
    } catch {
        return false;
    }
}

// 战斗表读写入口。
//   probe()   检查宿主函数；read({kinds}) 读已解码的记录；ensure() 缺表时按模板补建；
//   append(kind, records, options) 入队并 flush；flush() 把队列写进表；pending() 查看未写完的请求。
// 所有写操作经 serial() 串行。可传入 client 复用同一份缓存（inventory-tables 与账本共用）。
export function createCombatTables({ api, cellMax = DEFAULT_COMBAT_CELL_MAX, client = createCachedTableClient({ api }) } = {}) {
    const queue = [];
    let writing = false;
    let tail = Promise.resolve();
    const serial = (task) => {
        const run = tail.then(task, task);
        tail = run.catch(() => {});
        return run;
    };

    const probe = () => probeCombatTableSupport(api);

    function read({ kinds } = {}) {
        const support = probe();
        if (!support.ok) return support;
        const result = readCombatTables(client, { kinds });
        if (!result.ok) return result;
        const visible = { ...result };
        for (const key of RAW_KEYS_HIDDEN_FROM_READ) delete visible[key];
        return visible;
    }

    function matchesIncomplete(kind, record) {
        const spec = COMBAT_TABLE_SPECS[kind];
        if (!spec) return false;
        const loaded = loadSheets(client);
        if (!loaded.ok) return false;
        const sheet = findSheet(loaded.sheets, kind);
        if (!sheet) return false;
        const expected = encodeCombatRecord(kind, record, cellMax);
        const parts = new Set();
        for (const row of sheet.rows) {
            const cells = rowToCells(sheet, Array.isArray(row) ? row : []);
            if (spec.keyOf(cells) !== expected.key) continue;
            const match = cells[SEGMENT_COLUMN].match(SEGMENT_PATTERN);
            const wanted = match && expected.rows[Number(match[1]) - 1];
            if (!wanted || Object.keys(wanted).some((key) => cells[key] !== wanted[key])) return false;
            parts.add(Number(match[1]));
        }
        return parts.size > 0 && parts.size < expected.rows.length;
    }

    // 缺表时在用户当前模板上补建，建完核对。
    function ensure() {
        return serial(async () => {
            const support = probe();
            if (!support.ok) return support;
            const loaded = loadSheets(client);
            if (!loaded.ok) return loaded;
            const summary = summarizeSheets(client, loaded.sheets, []);
            const wanted = [...summary.missing, ...summary.optionalMissing];
            if (!wanted.length) return { ok: true, created: [] };
            const templateRead = client.getTableTemplate();
            if (!templateRead.ok) return { ok: false, reason: 'combat-table-template-unavailable', detail: templateRead.reason };
            const planned = withCombatSheets(templateRead.data);
            if (!planned.added.length) return { ok: false, reason: 'combat-table-template-mismatch', missing: wanted };
            // 用户模板与已有表集合不一致时不导入，避免覆盖用户的表。
            const existingNames = new Set(loaded.sheets.map((sheet) => sheet.name));
            const addedNames = new Set(planned.added.map((kind) => COMBAT_TABLE_SPECS[kind].name));
            const templateNames = parseTables(planned.template).map((sheet) => sheet.name);
            const hidden = [...existingNames].filter((name) => !templateNames.includes(name));
            const extra = templateNames.filter((name) => !existingNames.has(name) && !addedNames.has(name));
            if (hidden.length || extra.length) {
                return {
                    ok: false, reason: 'combat-table-template-diverged', missing: wanted,
                    ...(hidden.length && { hidden }), ...(extra.length && { extra }),
                };
            }
            writing = true;
            let imported;
            try {
                imported = await client.importTemplate(planned.template, { scope: 'chat', dataMode: 'seed' });
            } finally {
                writing = false;
            }
            if (!imported.ok) return { ok: false, reason: 'combat-table-create-failed', detail: imported.message || imported.reason };
            if (imported.result?.runtimeReady === false) {
                return {
                    ok: false, reason: 'combat-table-runtime-not-ready', created: planned.added,
                    detail: String(imported.result.postCommitWarning || imported.result.message || ''),
                };
            }
            const after = readCombatTables(client, { kinds: [] });
            const stillMissing = after.ok ? [...after.missing, ...after.optionalMissing] : wanted;
            return !after.ok || stillMissing.length
                ? { ok: false, reason: 'combat-table-create-unverified', missing: stillMissing }
                : { ok: true, created: planned.added };
        });
    }

    const pending = () => queue.map((item) => ({
        kind: item.kind, key: encodeCombatRecord(item.kind, item.record, cellMax).key, reason: item.reason,
    }));

    // 一批记录只整表读取两次：写前读一次判重，全部写完后读一次核对。
    // 批内用本地集合记已插入的键，不再每条记录前后各读一次。
    function flush() {
        return serial(async () => {
            const written = [];
            const present = [];
            const rejected = [];
            let inserted = 0;
            let failure = null;
            if (queue.length) {
                const support = probe();
                if (!support.ok) return { ...support, pending: pending() };
                writing = true;
                try {
                    // 写前判重必须读新数据：缓存里的旧快照可能漏掉别处刚写入的同键记录，或掩盖当前的读取失败。
                    client.invalidate?.();
                    const finished = new Set(); // 处理完毕、应出队的请求
                    const batch = [];           // 已插入、等待核对的请求
                    const insertedRaw = new Map(); // `${kind}\u0000${key}` -> raw，批内已插入的键
                    let snapshot = null;
                    let snapshotIndex = new Map(); // kind -> Map(key -> raw)
                    const loadSnapshot = (kinds) => {
                        snapshot = readCombatTables(client, { kinds });
                        snapshotIndex = new Map();
                        return snapshot;
                    };
                    const rawIndexOf = (kind) => {
                        if (!snapshotIndex.has(kind)) {
                            snapshotIndex.set(kind, new Map((snapshot[`${kind}Raw`] || []).map((entry) => [entry.key, entry.raw])));
                        }
                        return snapshotIndex.get(kind);
                    };
                    for (let at = 0; at < queue.length; at += 1) {
                        const item = queue[at];
                        const encoded = encodeCombatRecord(item.kind, item.record, cellMax);
                        if (!requestStillValid(item)) {
                            finished.add(item);
                            rejected.push({ key: encoded.key, reason: 'request-stale' });
                            continue;
                        }
                        if (!snapshot || (snapshot.ok && snapshot[item.kind] === undefined)) {
                            loadSnapshot([...new Set(queue.map((queued) => queued.kind))]);
                        }
                        if (!snapshot.ok) { failure = { reason: snapshot.reason, detail: snapshot.detail }; break; }
                        if (snapshot[item.kind] === null) {
                            if (!COMBAT_TABLE_SPECS[item.kind].optional) { failure = { reason: 'combat-table-missing', kind: item.kind }; break; }
                            finished.add(item);
                            rejected.push({ key: encoded.key, kind: item.kind, reason: 'combat-table-missing' });
                            continue;
                        }
                        const knownRaw = insertedRaw.get(`${item.kind}\u0000${encoded.key}`) ?? rawIndexOf(item.kind).get(encoded.key);
                        if (knownRaw !== undefined) {
                            finished.add(item);
                            if (knownRaw === encoded.raw) present.push(encoded.key);
                            else rejected.push({ key: encoded.key, reason: 'combat-record-conflict' });
                            continue;
                        }
                        // 逐段插入；中途请求过期则停下，已插入的段数计入 inserted。
                        let insertedHere = 0;
                        let stale = false;
                        let insertFailed = false;
                        for (const row of encoded.rows) {
                            if (!requestStillValid(item)) { stale = true; break; }
                            const result = await client.insertRow(COMBAT_TABLE_SPECS[item.kind].name, row, { skipNotify: true });
                            if (!result.ok) { insertFailed = true; break; }
                            insertedHere += 1;
                        }
                        inserted += insertedHere;
                        if (stale) {
                            finished.add(item);
                            rejected.push({ key: encoded.key, reason: 'request-stale', inserted: insertedHere });
                            continue;
                        }
                        if (insertFailed) {
                            item.reason = 'combat-ledger-insert-failed';
                            failure = { reason: item.reason, key: encoded.key };
                            break;
                        }
                        insertedRaw.set(`${item.kind}\u0000${encoded.key}`, encoded.raw);
                        batch.push({ item, encoded });
                    }
                    // 全部写完后统一核对：作废缓存，整表只读一次。
                    if (batch.length) {
                        client.invalidate?.();
                        const verify = readCombatTables(client, { kinds: [...new Set(batch.map((entry) => entry.item.kind))] });
                        const verifiedIndex = new Map();
                        const verifiedRaw = (kind) => {
                            if (!verifiedIndex.has(kind)) {
                                verifiedIndex.set(kind, new Map(((verify.ok && verify[`${kind}Raw`]) || []).map((entry) => [entry.key, entry.raw])));
                            }
                            return verifiedIndex.get(kind);
                        };
                        for (const { item, encoded } of batch) {
                            if (verifiedRaw(item.kind).get(encoded.key) === encoded.raw) {
                                finished.add(item);
                                written.push(encoded.key);
                            } else {
                                // 只有第一条未核实的记录标明原因；其后的记录同样留在队列，等下一次 flush 重新判定，标 queued（与逐条写入时停在首个失败处一致）。
                                item.reason = failure ? 'queued' : 'combat-ledger-write-unverified';
                                failure ||= { reason: item.reason, key: encoded.key };
                            }
                        }
                    }
                    for (let at = queue.length - 1; at >= 0; at -= 1) if (finished.has(queue[at])) queue.splice(at, 1);
                    // 数据库插件的 insertRow 已自行刷新合并数据与世界书并保存聊天；不进世界书的积分 / Origin 记录不再整套重刷。
                    if (inserted > 0 && batch.some(({ item }) => item.options?.refresh !== false)) {
                        try {
                            if (!(await client.refresh()).ok && !failure) failure = { reason: 'combat-table-refresh-failed' };
                        } catch {
                            failure ||= { reason: 'combat-table-refresh-failed' };
                        }
                    }
                } finally {
                    writing = false;
                }
            }
            const summary = { ok: !failure && !rejected.length, written, present, rejected, pending: pending() };
            return failure ? { ...summary, ...failure } : summary;
        });
    }

    async function append(kind, records, options) {
        if (!Object.hasOwn(COMBAT_TABLE_SPECS, kind)) return Promise.resolve({ ok: false, reason: 'combat-table-unknown-kind' });
        const requests = (Array.isArray(records) ? records : [records]).map((record) => ({ kind, record, reason: 'queued', ...(options && { options }) }));
        queue.push(...requests);
        try {
            return await flush();
        } finally {
            if (options?.retainOnFailure === false) {
                const owned = new Set(requests);
                for (let at = queue.length - 1; at >= 0; at -= 1) {
                    if (owned.has(queue[at])) queue.splice(at, 1);
                }
            }
        }
    }

    return { probe, read, ensure, append, flush, pending, serial, matchesIncomplete, isWriting: () => writing, client };
}
