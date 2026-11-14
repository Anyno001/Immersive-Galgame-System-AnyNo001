// 数值系统单向推送到 shujuku（§8A、§8B；易错点 F2/F3/F7/F9/F10/F12/F13）。
// IGS 是唯一真值：只写目标单元格，不新建行列、不读回、不监听表格回调；找不到就跳过并记诊断。
import { BATCH_WRITE_OPTIONS } from './client.js';
import { parseTables } from './table-parser.js';
import { columnLooksTextual, formatNumberCell, readAttributeCell, scaleValue, suspectRange, writeAttributeCell } from '../../scene/stats/stat-cell-format.js';
import { stageOf } from '../../scene/stats/stat-favor.js';
import { walletBalance } from '../../scene/stats/stat-bars.js';
import { BASE_ATTRIBUTES, barsOf } from '../../scene/stats/stat-state.js';
import { LEGACY_ATTRIBUTE_MAP } from '../../scene/stats/stat-registry.js';
import { findSkillTable, planSkillAdoption, planSkillPush } from './skill-table.js';

export const PUSH_TIMEOUT_MS = 3000;
// updateCell 的行号含表头：数据行下标 + 1（与 shujuku-panel 的 toShujukuApiRowIndex、AcuDice 一致）。
export const SHUJUKU_ROW_OFFSET = 1;
const NAME_COLUMNS = new Set(['姓名', '角色姓名', '角色名', '角色真实姓名', '调查员姓名', 'name', '名称']);
const DIM_RULES = Object.freeze([['好感', /好感/], ['信任', /信任/], ['了解', /了解/], ['芥蒂', /芥蒂|仇怨|怨恨/]]);
// 生命不再由数值侧推送（生命取自战斗 vitals），所以这里没有 health 规则。
const BAR_RULES = Object.freeze([['stamina', /体力/], ['money', /^(?:金钱|金币|货币)(?:余额)?$/], ['points', /^积分$/], ['stress', /压力/]]);
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
export function detectStatMappings(tables, { overrides = {}, currencyName = '' } = {}) {
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
        const skillTable = findSkillTable([table]);
        if (skillTable) {
            // 才艺技能表：只有一条映射，六维与特有技能按「角色姓名 + 技能」逐行写回。
            add({ table: table.name, column: trim(table.columns[skillTable.valueCol]), col: skillTable.valueCol, kind: 'skills', form: 'number', nameCol: skillTable.nameCol, skillCol: skillTable.skillCol });
            continue;
        }
        table.columns.forEach((rawHeader, col) => {
            const header = trim(rawHeader);
            const base = { table: table.name, column: header, col };
            if (ATTR_COLUMNS[header] && mainRows.length) { add({ ...base, kind: 'attrs', group: ATTR_COLUMNS[header], form: 'attrs', rows: mainRows }); return; }
            if (isMain) {
                const bar = BAR_RULES.find(([, re]) => re.test(header)) || (currencyName && header === currencyName ? ['money'] : null);
                if (bar && mainRows.length) add({ ...base, kind: 'bar', key: bar[0], form: 'number', rows: mainRows, percent: cellsOf(table, col).some((c) => String(c).includes('%')) });
                return;
            }
            const dim = DIM_RULES.find(([, re]) => re.test(header));
            // 角色数值表里的体力、金钱、压力列：每行按姓名取该角色（含主角）的生活条。
            const barCol = !dim && nameCol >= 0 ? BAR_RULES.find(([, re]) => re.test(header)) : null;
            if (barCol) {
                const cells = cellsOf(table, col);
                if (columnLooksTextual(cells)) { diagnostics.push({ code: 'stats-push-text-column-skipped', table: table.name, column: header }); return; }
                add({ ...base, kind: 'barcol', key: barCol[0], form: 'number', nameCol, percent: barCol[0] !== 'money' && cells.some((c) => String(c).includes('%')) });
                return;
            }
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
    // 生活条只写整数：金钱不带百分号。
    if (m.form === 'stage') return stageOf(value).name;
    return formatNumberCell(current, scaleValue(value, m.range || {}), { percent: m.percent });
}

// 基础属性组取调用方给的六维（baseAttributes，战斗六维换算后的数值）；特有属性组取主角 skills 里非六维的技能。
function attrUpdates(skills, group, baseAttributes) {
    if (group === 'base') return baseAttributes && typeof baseAttributes === 'object' ? { ...baseAttributes } : {};
    const isBase = new Set(BASE_ATTRIBUTES);
    const out = {};
    for (const [name, skill] of Object.entries(skills || {})) {
        if (!isBase.has(name)) out[name] = skill.value;
    }
    return out;
}

// 才艺技能表的姓名 → IGS 角色键：主角行归「主角」，其余按解析器；换不出来返回空串。
export function skillKeyOf(name, characterKey, heroRow) {
    const text = trim(name);
    if (!text) return '';
    const key = characterKey(text);
    if (heroRow(text, key)) return '主角';
    return key || '';
}

// 只产出与当前单元格不同的写入；rowOffset = 数据行下标到 updateCell 行号的偏移。
export function planStatsPush(state, tables, mappings, { characterKey = (name) => name, rowOffset = SHUJUKU_ROW_OFFSET, baseAttributes = null, currency = null, walletExtra = 0, isHero = null, skillValues = null, heroName = '', skillCanon = null } = {}) {
    const heroRow = (name, key) => key === '主角' || name === '主角' || (typeof isHero === 'function' && Boolean(isHero(name)));
    const byName = new Map(tables.map((t) => [t.name, t]));
    const writes = [];
    const inserts = [];
    const diagnostics = [];
    const push = (m, rowIdx, from, value) => { if (value !== from) writes.push({ table: m.table, rowIndex: rowIdx + rowOffset, column: m.column, value, from }); };
    for (const m of mappings) {
        const table = byName.get(m.table);
        if (!table) { diagnostics.push({ code: 'stats-push-table-missing', table: m.table }); continue; }
        if (m.kind === 'skills') {
            const wanted = typeof skillValues === 'function' ? skillValues() : skillValues;
            if (!wanted) continue;
            const plan = planSkillPush({ table, nameCol: m.nameCol, skillCol: m.skillCol, valueCol: m.col }, wanted, { keyOf: (name) => skillKeyOf(name, characterKey, heroRow), rowOffset, heroName, ...(skillCanon ? { canon: skillCanon } : {}) });
            writes.push(...plan.writes);
            inserts.push(...plan.inserts);
            continue;
        }
        if (m.kind === 'dim') {
            // IGS 有这项就以 IGS 为准覆盖表格；角色身上没有这项（如旧档无芥蒂）就不碰该格。
            table.rows.forEach((row, i) => {
                const key = characterKey(trim(row[m.nameCol]));
                const c = key && state.characters[key];
                if (!c || !Object.hasOwn(c.dims || {}, m.key) || !Number.isFinite(Number(c.dims[m.key]))) return;
                const from = String(row[m.col] ?? '');
                push(m, i, from, cellValue(m, from, c.dims[m.key]));
            });
            continue;
        }
        if (m.kind === 'barcol') {
            table.rows.forEach((row, i) => {
                const name = trim(row[m.nameCol]);
                if (!name) return;
                const key = characterKey(name);
                const hero = heroRow(name, key);
                const bars = hero ? state.protagonist.bars : (key && state.characters[key] ? barsOf(state.characters[key]) : null);
                if (!bars) return;
                const value = m.key === 'money' ? walletBalance(bars, hero ? walletExtra : 0) : bars[m.key];
                if (!Number.isFinite(Number(value))) return;
                const from = String(row[m.col] ?? '');
                push(m, i, from, cellValue(m, from, value));
            });
            continue;
        }
        for (const i of m.rows) {
            const row = table.rows[i];
            if (!row) { diagnostics.push({ code: 'stats-push-row-missing', table: m.table, row: i }); continue; }
            const from = String(row[m.col] ?? '');
            if (m.kind === 'attrs') {
                const updates = attrUpdates(state.protagonist.skills, m.group, baseAttributes);
                const current = readAttributeCell(from);
                const changed = Object.keys(updates).some((k) => current[k] !== updates[k]);
                // 基础属性组写回时带旧名映射：格内的「健康/理智/观察」改写成新六维名。
                if (changed) push(m, i, from, writeAttributeCell(from, updates, m.group === 'base' ? { renames: LEGACY_ATTRIBUTE_MAP } : undefined));
            } else {
                if (m.key === 'money' && currency?.ready !== true) { diagnostics.push({ code: 'stats-push-currency-unready', table: m.table }); continue; }
                const value = m.key === 'money' ? currency.balance
                    : m.key === 'points' ? walletBalance(state.protagonist.bars, walletExtra) : state.protagonist.bars[m.key];
                if (!Number.isFinite(value)) continue;
                push(m, i, from, cellValue(m, from, value));
            }
        }
    }
    return { writes, inserts, diagnostics };
}

// client 为 createShujukuClient(api)。读失败与「没有可写的格子」分开报告（契约：失败不当空）；一批写完只刷新一次。
// overridesByFingerprint：按模板指纹保存的映射覆盖（§8B 第 5 条），切换模板时自动换成该模板的映射。
export async function pushStats(client, state, { overrides, overridesByFingerprint, characterKey, rowOffset = SHUJUKU_ROW_OFFSET, baseAttributes = null, currency = null, walletExtra = 0, isHero = null, skillValues = null, heroName = '', skillCanon = null, shouldStart = () => true } = {}) {
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'stats-push-read-failed', detail: read.reason, wrote: 0 };
    const tables = parseTables(read.data);
    const fingerprint = fingerprintTables(tables);
    const picked = overrides || (overridesByFingerprint && overridesByFingerprint[fingerprint]) || {};
    const detected = detectStatMappings(tables, { overrides: picked, currencyName: currency?.name });
    const plan = planStatsPush(state, tables, detected.mappings, { characterKey, rowOffset, baseAttributes, currency, walletExtra, isHero, skillValues, heroName, skillCanon });
    const failures = [];
    const diagnostics = [...detected.diagnostics, ...plan.diagnostics];
    let wrote = 0;
    for (const w of plan.writes) {
        let r;
        if (!shouldStart()) return { ok: false, reason: 'request-stale', wrote };
        try { r = await client.updateCell(w.table, w.rowIndex, w.column, w.value, BATCH_WRITE_OPTIONS); } catch (error) { r = { ok: false, reason: String(error && error.message || error) }; }
        if (r && r.ok) wrote += 1; else failures.push({ ...w, reason: r && r.reason });
    }
    // 才艺技能表里没有的行：用数据库插件的新增行接口补上；接口缺失或失败只记诊断，不算推送失败。
    let inserted = 0;
    for (const item of plan.inserts) {
        let r;
        try { r = await client.insertRow(item.table, item.data, BATCH_WRITE_OPTIONS); } catch (error) { r = { ok: false, reason: String(error && error.message || error) }; }
        if (r && r.ok) inserted += 1;
        else { diagnostics.push({ code: 'stats-skill-insert-failed', table: item.table, skill: Object.values(item.data)[1], reason: r && r.reason }); if (r && r.reason === 'missing-api') break; }
    }
    let refreshed = false;
    if (wrote || inserted) {
        try { refreshed = Boolean((await client.refresh()).ok); } catch (error) { refreshed = false; }
    }
    return {
        ok: failures.length === 0, wrote: wrote + inserted, inserted, refreshed, failures, fingerprint: detected.fingerprint,
        mappings: detected.mappings, diagnostics,
    };
}

const CELL_NUMBER = /-?\d+(?:\.\d+)?/;
const ADOPT_DIMS = new Set(['好感', '信任', '了解', '芥蒂']);

// 表格里的数值格 → IGS 数值（映射页配了换算范围时反向换算）；格内没有数字返回 null。
function readCellNumber(m, text) {
    const hit = String(text ?? '').match(CELL_NUMBER);
    if (!hit) return null;
    const v = Number(hit[0]);
    if (!Number.isFinite(v)) return null;
    return m.range && m.range.from && m.range.to ? scaleValue(v, { from: m.range.to, to: m.range.from }) : Math.round(v);
}

// 用户在表格里手改的 IGS 管辖格子（关系四项 + 体力、压力，主角与角色）与当前 IGS 值比较，返回不同的项。
// 金钱列是物品表剧情货币、积分列是只读积分份额，都不从表格回读。
// items：[{ name（角色名或「主角」）, kind: 'dim' | 'bar', key, from（IGS 显示值）, shown（表格显示值）, to（存回 IGS 的值）}]。
export function planTableAdoption(state, tables, mappings, { characterKey = (name) => name, walletExtra = 0, isHero = null } = {}) {
    const byName = new Map(tables.map((t) => [t.name, t]));
    const found = new Map();
    const heroRow = (name, key) => key === '主角' || name === '主角' || (typeof isHero === 'function' && Boolean(isHero(name)));
    // shown：表格显示值，与 from（IGS 显示值）比较；to：要存回 IGS 的值（主角金钱要扣掉 walletExtra）。
    const take = (name, kind, key, from, shown, to = shown) => {
        if (shown === from) { found.delete(`${name}|${key}`); return; }
        found.set(`${name}|${key}`, { name, kind, key, from, to, shown });
    };
    for (const m of mappings) {
        const table = byName.get(m.table);
        if (!table || m.form === 'stage') continue;
        if (m.kind === 'dim' && ADOPT_DIMS.has(m.key)) {
            table.rows.forEach((row) => {
                const key = characterKey(trim(row[m.nameCol]));
                const c = key && state.characters[key];
                if (!c || !Object.hasOwn(c.dims || {}, m.key)) return;
                const to = readCellNumber(m, row[m.col]);
                if (to !== null) take(key, 'dim', m.key, Math.round(Number(c.dims[m.key]) || 0), to);
            });
        } else if (m.kind === 'barcol' || m.kind === 'bar') {
            if (m.key === 'money' || m.key === 'points') continue;
            const rows = m.kind === 'bar' ? m.rows.map((i) => ({ row: table.rows[i], hero: true })) : table.rows.map((row) => ({ row, name: trim(row[m.nameCol]) }));
            for (const item of rows) {
                if (!item.row) continue;
                const key = item.hero ? '主角' : characterKey(item.name);
                const hero = item.hero || heroRow(item.name, key);
                const bars = hero ? state.protagonist.bars : (key && state.characters[key] ? barsOf(state.characters[key]) : null);
                if (!bars) continue;
                const shown = readCellNumber(m, item.row[m.col]);
                if (shown === null) continue;
                const extra = hero && m.key === 'money' ? Number(walletExtra) || 0 : 0;
                const from = Math.round(m.key === 'money' ? walletBalance(bars, extra) : Number(bars[m.key]) || 0);
                take(hero ? '主角' : key, 'bar', m.key, from, shown - extra, shown);
            }
        }
    }
    return [...found.values()];
}

// 读表后算出用户手改项；读失败与「没有差异」分开报告。
export function readTableAdoptions(client, state, { overrides, overridesByFingerprint, characterKey, walletExtra = 0, isHero = null } = {}) {
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'stats-adopt-read-failed', detail: read.reason, items: [] };
    const tables = parseTables(read.data);
    const picked = overrides || (overridesByFingerprint && overridesByFingerprint[fingerprintTables(tables)]) || {};
    const detected = detectStatMappings(tables, { overrides: picked });
    return { ok: true, items: planTableAdoption(state, tables, detected.mappings, { characterKey, walletExtra, isHero }) };
}

// 读才艺技能表，与 IGS 现有技能比较：fresh 为表里新增、IGS 没有的技能；changed 为用户手改了数值的已有技能。
// known：{ 角色键: { 技能: 值 } }；没有才艺技能表（旧模板）或映射页配了跳过时返回空。
export function readSkillAdoptions(client, known, { overrides, overridesByFingerprint, characterKey = (name) => name, isHero = null, canon } = {}) {
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'stats-adopt-read-failed', detail: read.reason, fresh: [], changed: [] };
    const tables = parseTables(read.data);
    const picked = overrides || (overridesByFingerprint && overridesByFingerprint[fingerprintTables(tables)]) || {};
    const mapping = detectStatMappings(tables, { overrides: picked }).mappings.find((m) => m.kind === 'skills');
    if (!mapping) return { ok: true, fresh: [], changed: [] };
    const table = tables.find((t) => t.name === mapping.table);
    const heroRow = (name, key) => key === '主角' || name === '主角' || (typeof isHero === 'function' && Boolean(isHero(name)));
    const plan = planSkillAdoption({ table, nameCol: mapping.nameCol, skillCol: mapping.skillCol, valueCol: mapping.col }, known, { keyOf: (name) => skillKeyOf(name, characterKey, heroRow), ...(canon ? { canon } : {}) });
    return { ok: true, ...plan };
}

// 映射页数据：自动识别结果 + 当前模板已保存的覆盖值；读失败与「没有可推送的列」分开报告（易错点 F7）。
export function describeStatMappings(readResult, overridesByFingerprint = {}, { currencyName = '' } = {}) {
    if (!readResult || readResult.ok === false) return { ok: false, reason: 'stats-push-read-failed', detail: readResult && readResult.reason };
    const detected = detectStatMappings(parseTables(readResult.data), { currencyName });
    const all = overridesByFingerprint && typeof overridesByFingerprint === 'object' ? overridesByFingerprint : {};
    const saved = all[detected.fingerprint] || {};
    const rows = detected.mappings.map((m) => {
        const key = mappingKey(m.table, m.column);
        return { key, table: m.table, column: m.column, kind: m.kind, target: m.key || m.group || (m.kind === 'skills' ? 'skills' : ''), form: m.form, value: saved[key] || 'auto', stageAllowed: m.kind === 'dim' && m.key === '好感' };
    });
    return { ok: true, fingerprint: detected.fingerprint, known: Object.hasOwn(all, detected.fingerprint), currencyName, rows, diagnostics: detected.diagnostics };
}

// 生成前补写最多等 3 秒，超时放行（易错点 F6）。
export function withTimeout(promise, ms = PUSH_TIMEOUT_MS) {
    let timer = null;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ ok: false, reason: 'stats-push-timeout' }), ms); });
    return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}
