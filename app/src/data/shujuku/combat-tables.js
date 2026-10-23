import { parseTables } from './table-parser.js';
import { createShujukuClient } from './client.js';

// 战斗扩展的两张固定表：档案与成长日志。combat-tables 是第二个受控写入方，只写这两张表，只追加不覆盖。
// 建表只调用宿主自带的模板导入：当前模板副本 + 战斗表，不参与自动填表，不注入世界书。
export const COMBAT_TABLE_REQUIRED_API = Object.freeze(['exportTableAsJson', 'insertRow', 'getTableTemplate', 'importTemplateFromData', 'refreshDataAndWorldbook']);
// 宿主单元格没有长度上限（见 docs/COMBAT_EXPANSION.md 第 1 步核查 #6），分段只是为了控制单行体积，上限可由调用方覆盖。
export const DEFAULT_COMBAT_CELL_MAX = 16000;
const SEGMENT_COLUMN = '分段';

const text = (value) => (value === undefined || value === null ? '' : String(value));
const num = (value) => (text(value).trim() === '' ? null : Number(value));

export const COMBAT_TABLE_SPECS = Object.freeze({
    profile: Object.freeze({
        name: 'IGS战斗·档案',
        uid: 'sheet_igscbprofile',
        columns: Object.freeze(['档案ID', '名称', '类型', '职业', '版本', '生成时间', SEGMENT_COLUMN, '定义JSON']),
        jsonColumn: '定义JSON',
        // 档案重新生成时追加新版本，行身份为 档案ID + 版本。
        keyOf: (cells) => `${cells['档案ID']}|${cells['版本']}`,
        toCells: (r) => ({ '档案ID': text(r.id), '名称': text(r.name), '类型': text(r.kind), '职业': text(r.className), '版本': text(r.version), '生成时间': text(r.createdAt) }),
        jsonOf: (r) => r.definition,
        fromCells: (c, json) => ({ id: c['档案ID'], name: c['名称'], kind: c['类型'], className: c['职业'], version: num(c['版本']), createdAt: num(c['生成时间']), definition: json }),
    }),
    ledger: Object.freeze({
        name: 'IGS战斗·日志',
        uid: 'sheet_igscbledger',
        columns: Object.freeze(['记录ID', '类型', '角色', '锚点', '时间', SEGMENT_COLUMN, '载荷JSON']),
        jsonColumn: '载荷JSON',
        keyOf: (cells) => cells['记录ID'],
        toCells: (r) => ({ '记录ID': text(r.id), '类型': text(r.type), '角色': text(r.character), '锚点': r.anchor ? JSON.stringify(r.anchor) : '', '时间': text(r.createdAt) }),
        jsonOf: (r) => r.payload,
        fromCells: (c, json) => ({ id: c['记录ID'], type: c['类型'], character: c['角色'], anchor: c['锚点'] ? JSON.parse(c['锚点']) : null, createdAt: num(c['时间']), payload: json }),
    }),
});

export function probeCombatTableSupport(api) {
    const missing = COMBAT_TABLE_REQUIRED_API.filter((name) => !api || typeof api[name] !== 'function');
    return missing.length ? { ok: false, reason: 'combat-table-host-unsupported', missing } : { ok: true, missing: [] };
}

const PLACEMENT = (order) => ({ position: 'at_depth_as_system', depth: 2, order });

// 战斗表定义：updateFrequency 0 不参与自动填表；exportConfig 关闭且 injectIntoWorldbook=false，不进世界书。
export function buildCombatSheet(kind, orderNo, uid = COMBAT_TABLE_SPECS[kind].uid) {
    const spec = COMBAT_TABLE_SPECS[kind];
    return {
        uid,
        name: spec.name,
        sourceData: {
            note: `IGS 战斗扩展的${kind === 'profile' ? '角色与职业档案' : '成长日志'}，由 IGS 程序维护。AI 不得填写、修改或删除此表。`,
            initNode: '禁止。',
            deleteNode: '禁止。',
            updateNode: '禁止。',
            insertNode: '禁止。',
        },
        content: [['row_id', ...spec.columns]],
        updateConfig: { uiSentinel: -1, contextDepth: -1, updateFrequency: 0, batchSize: -1, skipFloors: -1 },
        exportConfig: {
            enabled: false,
            splitByRow: false,
            entryName: spec.name,
            entryType: 'constant',
            keywords: '',
            preventRecursion: true,
            injectionTemplate: '',
            extraIndexEnabled: false,
            extraIndexEntryName: `${spec.name}-索引`,
            extraIndexColumns: [],
            extraIndexColumnModes: {},
            extraIndexInjectionTemplate: '',
            entryPlacement: PLACEMENT(10000),
            extraIndexPlacement: PLACEMENT(10010),
            fixedEntryPlacement: PLACEMENT(99990),
            fixedIndexPlacement: PLACEMENT(99991),
            injectIntoWorldbook: false,
        },
        orderNo,
    };
}

const sheetEntries = (template) => Object.entries(template || {}).filter(([, v]) => v && typeof v === 'object' && typeof v.uid === 'string');

// 在当前模板副本里追加缺少的战斗表；同名表已存在则不追加。返回 { template, added }，入参不被修改。
export function withCombatSheets(template) {
    const copy = JSON.parse(JSON.stringify(template || {}));
    const sheets = sheetEntries(copy);
    const names = new Set(sheets.map(([, s]) => s.name));
    let orderNo = sheets.reduce((max, [, s]) => Math.max(max, Number(s.orderNo) || 0), -1);
    const added = [];
    for (const kind of Object.keys(COMBAT_TABLE_SPECS)) {
        const spec = COMBAT_TABLE_SPECS[kind];
        if (names.has(spec.name)) continue;
        let uid = spec.uid;
        for (let n = 2; Object.hasOwn(copy, uid); n += 1) uid = `${spec.uid}${n}`;
        orderNo += 1;
        copy[uid] = buildCombatSheet(kind, orderNo, uid);
        added.push(kind);
    }
    // 导入迁移会把 updateFrequency 0 改成「沿用全局」，除非 mate.updateConfigUiSentinel 为 -1（见第 1 步核查 #3）。
    if (added.length) copy.mate = { ...(copy.mate && typeof copy.mate === 'object' ? copy.mate : {}), updateConfigUiSentinel: -1 };
    return { template: copy, added };
}

function findTable(tables, kind) {
    return tables.find((t) => t.name === COMBAT_TABLE_SPECS[kind].name) || null;
}

const SEGMENT_RE = /^(\d{1,4})\/(\d{1,4})$/;

function rowCells(table, row) {
    return Object.fromEntries(table.columns.map((col, i) => [col, text(row[i])]));
}

// 一张战斗表的行解码：按行身份归组、按「序号/总数」拼回 JSON。非法或不完整的行只记诊断，不当作有效数据。
// 表只追加，写入重试留下的行总在后面：同一序号重复出现时后写覆盖，分段总数变化时按新总数重新成组。
export function decodeCombatRows(kind, table) {
    const spec = COMBAT_TABLE_SPECS[kind];
    const groups = new Map();
    const diagnostics = [];
    table.rows.forEach((row, index) => {
        const cells = rowCells(table, Array.isArray(row) ? row : []);
        const key = spec.keyOf(cells);
        const seg = cells[SEGMENT_COLUMN].match(SEGMENT_RE);
        const [at, total] = seg ? [Number(seg[1]), Number(seg[2])] : [1, 1];
        if (!key || (seg === null && cells[SEGMENT_COLUMN]) || at < 1 || at > total) {
            diagnostics.push({ code: 'combat-row-invalid', kind, row: index });
            return;
        }
        let group = groups.get(key);
        if (group && group.total !== total) {
            diagnostics.push({ code: 'combat-row-segment-mismatch', kind, key, row: index });
            group = null;
        }
        if (!group) group = { cells, total, parts: new Map(), row: index };
        group.cells = cells;
        group.parts.set(at, cells[spec.jsonColumn]);
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
        } catch (error) {
            diagnostics.push({ code: 'combat-row-json-invalid', kind, key });
        }
    }
    return { records, diagnostics };
}

// 只读：读取失败返回 ok:false，不当作空表；表不存在记为 missing。
export function readCombatTables(client) {
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'combat-table-read-failed', detail: read.reason };
    const tables = parseTables(read.data);
    const out = { ok: true, missing: [], diagnostics: [] };
    for (const kind of Object.keys(COMBAT_TABLE_SPECS)) {
        const table = findTable(tables, kind);
        if (!table) {
            out.missing.push(kind);
            out[kind] = null;
            continue;
        }
        const decoded = decodeCombatRows(kind, table);
        out[kind] = decoded.records.map((r) => r.record);
        out.diagnostics.push(...decoded.diagnostics);
        out[`${kind}Raw`] = decoded.records;
    }
    return out;
}

// 一条记录拆成若干行：普通列每行相同，JSON 列按 cellMax 切段，分段列写「序号/总数」。
export function encodeCombatRecord(kind, record, cellMax = DEFAULT_COMBAT_CELL_MAX) {
    const spec = COMBAT_TABLE_SPECS[kind];
    const cells = spec.toCells(record);
    const raw = JSON.stringify(spec.jsonOf(record) ?? null);
    const size = Math.max(1, Math.floor(cellMax));
    const parts = [];
    for (let i = 0; i < raw.length; i += size) parts.push(raw.slice(i, i + size));
    if (!parts.length) parts.push(raw);
    return {
        key: spec.keyOf(cells),
        raw,
        cells,
        rows: parts.map((part, i) => ({ ...cells, [SEGMENT_COLUMN]: `${i + 1}/${parts.length}`, [spec.jsonColumn]: part })),
    };
}

function verifyRecord(client, kind, encoded) {
    const read = readCombatTables(client);
    if (!read.ok || !read[`${kind}Raw`]) return false;
    return read[`${kind}Raw`].some((r) => r.key === encoded.key && r.raw === encoded.raw);
}

// 受控写入方。api 为 window.AutoCardUpdaterAPI；一切写入排进同一条 FIFO 队列，逐条写入后读回核对。
// 写入期间 isWriting() 为真，供表格回调侧抑制自己触发的更新；批次写完后只调用一次 refresh。
export function createCombatTables({ api, cellMax = DEFAULT_COMBAT_CELL_MAX, client = createShujukuClient(api) } = {}) {
    const queue = [];
    let writing = false;
    let chain = Promise.resolve();
    const serial = (task) => {
        const run = chain.then(task, task);
        chain = run.catch(() => {});
        return run;
    };

    function probe() {
        return probeCombatTableSupport(api);
    }

    function read() {
        const support = probe();
        if (!support.ok) return support;
        const result = readCombatTables(client);
        if (!result.ok) return result;
        const { profileRaw, ledgerRaw, ...rest } = result;
        return rest;
    }

    // 建表需要用户确认：confirmed 由调用方在弹窗确认后传入。两张表都在时不导入（幂等）。
    function ensure({ confirmed = false } = {}) {
        return serial(async () => {
            const support = probe();
            if (!support.ok) return support;
            const before = readCombatTables(client);
            if (!before.ok) return before;
            if (!before.missing.length) return { ok: true, created: [] };
            if (confirmed !== true) return { ok: false, reason: 'combat-table-confirm-required', missing: before.missing };
            const template = client.getTableTemplate();
            if (!template.ok) return { ok: false, reason: 'combat-table-template-unavailable', detail: template.reason };
            const next = withCombatSheets(template.data);
            if (!next.added.length) return { ok: false, reason: 'combat-table-template-mismatch', missing: before.missing };
            writing = true;
            try {
                const imported = await client.importTemplate(next.template, { scope: 'chat', dataMode: 'seed' });
                if (!imported.ok) return { ok: false, reason: 'combat-table-create-failed', detail: imported.message || imported.reason };
            } finally {
                writing = false;
            }
            const after = readCombatTables(client);
            if (!after.ok || after.missing.length) return { ok: false, reason: 'combat-table-create-unverified', missing: after.ok ? after.missing : before.missing };
            return { ok: true, created: next.added };
        });
    }

    async function writeOne(item, tables) {
        const spec = COMBAT_TABLE_SPECS[item.kind];
        const encoded = encodeCombatRecord(item.kind, item.record, cellMax);
        const existing = (tables[`${item.kind}Raw`] || []).find((r) => r.key === encoded.key);
        if (existing) return existing.raw === encoded.raw ? { status: 'present', key: encoded.key, inserted: 0 } : { status: 'conflict', key: encoded.key, inserted: 0 };
        let inserted = 0;
        for (const row of encoded.rows) {
            const result = await client.insertRow(spec.name, row, { skipNotify: true });
            if (!result.ok) return { status: 'pending', key: encoded.key, reason: 'combat-ledger-insert-failed', inserted };
            inserted += 1;
        }
        return verifyRecord(client, item.kind, encoded)
            ? { status: 'written', key: encoded.key, inserted }
            : { status: 'pending', key: encoded.key, reason: 'combat-ledger-write-unverified', inserted };
    }

    // 依次处理队列；遇到未核实的条目即停，它和后续条目都留在队列里，等待下次 flush。
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
                    while (queue.length) {
                        const tables = readCombatTables(client);
                        if (!tables.ok) { failure = { reason: tables.reason, detail: tables.detail }; break; }
                        if (tables[queue[0].kind] === null) { failure = { reason: 'combat-table-missing', kind: queue[0].kind }; break; }
                        const outcome = await writeOne(queue[0], tables);
                        inserted += outcome.inserted;
                        if (outcome.status === 'pending') {
                            queue[0].reason = outcome.reason;
                            failure = { reason: outcome.reason, key: outcome.key };
                            break;
                        }
                        queue.shift();
                        if (outcome.status === 'written') written.push(outcome.key);
                        else if (outcome.status === 'present') present.push(outcome.key);
                        else rejected.push({ key: outcome.key, reason: 'combat-record-conflict' });
                    }
                    if (inserted > 0) {
                        try {
                            const refreshed = await client.refresh();
                            if (!refreshed.ok && !failure) failure = { reason: 'combat-table-refresh-failed' };
                        } catch (error) {
                            if (!failure) failure = { reason: 'combat-table-refresh-failed' };
                        }
                    }
                } finally {
                    writing = false;
                }
            }
            const result = { ok: !failure && !rejected.length, written, present, rejected, pending: pending() };
            return failure ? { ...result, ...failure } : result;
        });
    }

    function append(kind, records) {
        if (!Object.hasOwn(COMBAT_TABLE_SPECS, kind)) return Promise.resolve({ ok: false, reason: 'combat-table-unknown-kind' });
        for (const record of Array.isArray(records) ? records : [records]) queue.push({ kind, record, reason: 'queued' });
        return flush();
    }

    function pending() {
        return queue.map((item) => ({ kind: item.kind, key: encodeCombatRecord(item.kind, item.record, cellMax).key, reason: item.reason }));
    }

    return { probe, read, ensure, append, flush, pending, isWriting: () => writing };
}

