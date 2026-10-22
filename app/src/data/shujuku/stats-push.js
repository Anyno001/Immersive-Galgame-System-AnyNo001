// 数值系统单向推送到 shujuku（§8A、§8B；易错点 F2/F3/F7/F9/F10/F12/F13）。
// IGS 是唯一真值：只写目标单元格，不新建行列、不读回、不监听表格回调；找不到就跳过并记诊断。
import { parseTables } from './table-parser.js';
import { columnLooksTextual, formatNumberCell, readAttributeCell, scaleValue, suspectRange, writeAttributeCell } from '../../scene/stats/stat-cell-format.js';
import { stageOf } from '../../scene/stats/stat-favor.js';
import { BASE_ATTRIBUTES } from '../../scene/stats/stat-state.js';

export const PUSH_TIMEOUT_MS = 3000;
// updateCell 的行号含表头：数据行下标 + 1（与 shujuku-panel 的 toShujukuApiRowIndex、AcuDice 一致）。
export const SHUJUKU_ROW_OFFSET = 1;
const NAME_COLUMNS = new Set(['姓名', '角色姓名', '角色名', '角色真实姓名', '调查员姓名', 'name', '名称']);
const DIM_RULES = Object.freeze([['好感', /好感/], ['信任', /信任/], ['了解', /了解/]]);
const BAR_RULES = Object.freeze([['health', /生命|^HP$|血量/i], ['stamina', /体力/], ['money', /^(?:金钱|金币|货币)$/], ['stress', /压力/]]);
const ATTR_COLUMNS = Object.freeze({ 基础属性: 'base', 特有属性: 'special' });
const TYPE_COLUMN = '角色类型';

const trim = (v) => String(v ?? '').trim();
const cellsOf = (table, col) => table.rows.map((row) => (Array.isArray(row) ? row[col] : ''));

// 映射覆盖的存储键：表名|列名 编码后不含「.」，可安全放进设置路径（§8B 第 2 条映射页）。
export function mappingKey(table, column) {
    return encodeURIComponent(`${table}|${column}`).replace(/\./g, '%2E');
}

// 覆盖值：'skip' 不推送；'number' / 'stage' 改写入形式（阶段名只用于好感）；'auto' 或缺省按自动识别。
function overrideOf(overrides, m) {
    const o = overrides[mappingKey(m.table, m.column)] ?? overrides[`${m.table}|${m.column}`];
    if (o === 'skip') return 'skip';
    if (o === 'number' && m.kind === 'dim') return { form: 'number' };
    if (o === 'stage' && m.kind === 'dim' && m.key === '好感') return { form: 'stage' };
    return o && typeof o === 'object' ? o : null;
}

// 模板指纹：表名 + 表头。切换模板后换用该模板的映射（§8B 第 5 条）。
export function fingerprintTables(tables) {
    const text = tables.map((t) => `${t.name}:${t.columns.map(trim).join(',')}`).join('|');
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return `tpl-${h.toString(16)}`;
}

function protagonistRows(table, nameCol) {
    if (/主角/.test(table.name)) return table.rows.length ? [0] : [];
    const typeCol = table.columns.findIndex((c) => trim(c) === TYPE_COLUMN);
    if (typeCol < 0 || nameCol < 0) return [];
    return table.rows.map((row, i) => (trim(row[typeCol]) === '主角' ? i : -1)).filter((i) => i >= 0);
}

function dimForm(table, col, header) {
    if (/阶段|状态/.test(header)) return 'stage';
    const cells = cellsOf(table, col);
    return columnLooksTextual(cells) ? 'stage' : 'number';
}

// overrides：{ '表名|列名': 'skip' | { form, range } }，来自映射页。
export function detectStatMappings(tables, { overrides = {} } = {}) {
    const mappings = [];
    const diagnostics = [];
    const add = (m) => {
        const o = overrideOf(overrides, m);
        if (o === 'skip') return;
        mappings.push(o ? { ...m, ...(o.form ? { form: o.form } : {}), ...(o.range ? { range: o.range } : {}) } : m);
    };
    for (const table of tables) {
        const nameCol = table.columns.findIndex((c) => NAME_COLUMNS.has(trim(c)));
        const isMain = /主角/.test(table.name);
        const mainRows = protagonistRows(table, nameCol);
        table.columns.forEach((rawHeader, col) => {
            const header = trim(rawHeader);
            const base = { table: table.name, column: header, col };
            if (ATTR_COLUMNS[header] && mainRows.length) { add({ ...base, kind: 'attrs', group: ATTR_COLUMNS[header], form: 'attrs', rows: mainRows }); return; }
            if (isMain) {
                const bar = BAR_RULES.find(([, re]) => re.test(header));
                if (bar && mainRows.length) add({ ...base, kind: 'bar', key: bar[0], form: 'number', rows: mainRows, percent: cellsOf(table, col).some((c) => String(c).includes('%')) });
                return;
            }
            const dim = DIM_RULES.find(([, re]) => re.test(header));
            if (!dim || nameCol < 0) return;
            const form = dimForm(table, col, header);
            if (form === 'stage' && dim[0] !== '好感') { diagnostics.push({ code: 'stats-push-text-column-skipped', table: table.name, column: header }); return; }
            const cells = cellsOf(table, col);
            const percent = cells.some((c) => String(c).includes('%')) || /数值/.test(table.name);
            if (form === 'number' && suspectRange(cells)) diagnostics.push({ code: 'stats-push-range-suspect', table: table.name, column: header });
            add({ ...base, kind: 'dim', key: dim[0], form, nameCol, percent });
        });
    }
    return { mappings, diagnostics, fingerprint: fingerprintTables(tables) };
}

function cellValue(m, current, value) {
    if (m.form === 'stage') return stageOf(value).name;
    return formatNumberCell(current, scaleValue(value, m.range || {}), { percent: m.percent });
}

function attrUpdates(skills, group) {
    const isBase = new Set(BASE_ATTRIBUTES);
    const out = {};
    for (const [name, skill] of Object.entries(skills || {})) {
        if ((group === 'base') === isBase.has(name)) out[name] = skill.value;
    }
    return out;
}

// 只产出与当前单元格不同的写入；rowOffset = 数据行下标到 updateCell 行号的偏移。
export function planStatsPush(state, tables, mappings, { characterKey = (name) => name, rowOffset = SHUJUKU_ROW_OFFSET } = {}) {
    const byName = new Map(tables.map((t) => [t.name, t]));
    const writes = [];
    const diagnostics = [];
    const push = (m, rowIdx, from, value) => { if (value !== from) writes.push({ table: m.table, rowIndex: rowIdx + rowOffset, column: m.column, value, from }); };
    for (const m of mappings) {
        const table = byName.get(m.table);
        if (!table) { diagnostics.push({ code: 'stats-push-table-missing', table: m.table }); continue; }
        if (m.kind === 'dim') {
            table.rows.forEach((row, i) => {
                const key = characterKey(trim(row[m.nameCol]));
                const c = key && state.characters[key];
                if (!c || !Number.isFinite(Number(c.dims[m.key]))) return;
                const from = String(row[m.col] ?? '');
                push(m, i, from, cellValue(m, from, c.dims[m.key]));
            });
            continue;
        }
        for (const i of m.rows) {
            const row = table.rows[i];
            if (!row) { diagnostics.push({ code: 'stats-push-row-missing', table: m.table, row: i }); continue; }
            const from = String(row[m.col] ?? '');
            if (m.kind === 'attrs') {
                const updates = attrUpdates(state.protagonist.skills, m.group);
                const current = readAttributeCell(from);
                const changed = Object.keys(updates).some((k) => current[k] !== updates[k]);
                if (changed) push(m, i, from, writeAttributeCell(from, updates));
            } else {
                push(m, i, from, cellValue(m, from, state.protagonist.bars[m.key]));
            }
        }
    }
    return { writes, diagnostics };
}

// client 为 createShujukuClient(api)。读失败与「没有可写的格子」分开报告（契约：失败不当空）；一批写完只刷新一次。
// overridesByFingerprint：按模板指纹保存的映射覆盖（§8B 第 5 条），切换模板时自动换成该模板的映射。
export async function pushStats(client, state, { overrides, overridesByFingerprint, characterKey, rowOffset = SHUJUKU_ROW_OFFSET } = {}) {
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'stats-push-read-failed', detail: read.reason, wrote: 0 };
    const tables = parseTables(read.data);
    const fingerprint = fingerprintTables(tables);
    const picked = overrides || (overridesByFingerprint && overridesByFingerprint[fingerprint]) || {};
    const detected = detectStatMappings(tables, { overrides: picked });
    const plan = planStatsPush(state, tables, detected.mappings, { characterKey, rowOffset });
    const failures = [];
    let wrote = 0;
    for (const w of plan.writes) {
        let r;
        try { r = await client.updateCell(w.table, w.rowIndex, w.column, w.value); } catch (error) { r = { ok: false, reason: String(error && error.message || error) }; }
        if (r && r.ok) wrote += 1; else failures.push({ ...w, reason: r && r.reason });
    }
    let refreshed = false;
    if (wrote) {
        try { refreshed = Boolean((await client.refresh()).ok); } catch (error) { refreshed = false; }
    }
    return {
        ok: failures.length === 0, wrote, refreshed, failures, fingerprint: detected.fingerprint,
        mappings: detected.mappings, diagnostics: [...detected.diagnostics, ...plan.diagnostics],
    };
}

// 映射页数据：自动识别结果 + 当前模板已保存的覆盖值；读失败与「没有可推送的列」分开报告（易错点 F7）。
export function describeStatMappings(readResult, overridesByFingerprint = {}) {
    if (!readResult || readResult.ok === false) return { ok: false, reason: 'stats-push-read-failed', detail: readResult && readResult.reason };
    const detected = detectStatMappings(parseTables(readResult.data));
    const all = overridesByFingerprint && typeof overridesByFingerprint === 'object' ? overridesByFingerprint : {};
    const saved = all[detected.fingerprint] || {};
    const rows = detected.mappings.map((m) => {
        const key = mappingKey(m.table, m.column);
        return { key, table: m.table, column: m.column, kind: m.kind, target: m.key || m.group || '', form: m.form, value: saved[key] || 'auto', stageAllowed: m.kind === 'dim' && m.key === '好感' };
    });
    return { ok: true, fingerprint: detected.fingerprint, known: Object.hasOwn(all, detected.fingerprint), rows, diagnostics: detected.diagnostics };
}

// 生成前补写最多等 3 秒，超时放行（易错点 F6）。
export function withTimeout(promise, ms = PUSH_TIMEOUT_MS) {
    let timer = null;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, reason: 'stats-push-timeout' }), ms); });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
