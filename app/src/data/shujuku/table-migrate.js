// 旧聊天迁移到数值表解耦、精修后的新表结构（docs/STATS_TABLE_DECOUPLE_PLAN.md 第三节、docs/STATS_TABLE_REFINE_PLAN.md 第五节）。
// 做法：先备份旧表 JSON；用新模板替换本聊天模板（数据库插件按 seed 保留已有数据）；再按迁移前的快照把秘密、属性格搬到新位置。
// 已是解耦结构但仍用旧版适配模板的聊天（角色数值表、才艺技能表还不是 IGS 维护写法）只做精修：换两张 IGS 表的配置与 AI 填的表的说明。
// 纯函数部分（buildMigratedTemplate / planTableMigration）不碰数据库插件；migrateTables 负责串起流程。
import { parseTables } from './table-parser.js';
import { SHUJUKU_ROW_OFFSET } from './stats-push.js';
import { SKILL_TABLE_NAME, canonicalAttribute, findSkillTable, isSixAttribute } from './skill-table.js';
import { readAttributeCell } from '../../scene/stats/stat-cell-format.js';
import { igsManagedTablesReady } from './igs-managed.js';

export const MIGRATE_BACKUP_KEY = 'igs_table_migrate_backup_v1';
export const VALUES_TABLE = '角色数值表';
export const HERO_TABLE = '主角信息表';
export const NPC_TABLE = '重要角色表';
// 迁移时用新模板替换规则字段的表（重要角色表的表头也按新模板，旧列「交互选项」随之丢弃，其余旧行按列名搬）。
// 角色数值表、才艺技能表另外连更新配置、导出配置一起换成 IGS 记录表的写法。
const REPLACED_RULE_SHEETS = Object.freeze([VALUES_TABLE, HERO_TABLE, NPC_TABLE, '物品表', '检定建议表']);

const trim = (v) => String(v ?? '').trim();
const colOf = (table, name) => table.columns.map(trim).indexOf(name);
const byName = (tables, name) => tables.find((t) => t.name === name) || null;
const sheetEntries = (template) => Object.entries(template || {}).filter(([, s]) => s && typeof s === 'object' && typeof s.uid === 'string');

// 管辖的 IGS 记录表：迁移时换掉 updateConfig、exportConfig、sourceData，行与表头保持聊天里现有的。
const MANAGED_RECORD_SHEETS = Object.freeze([VALUES_TABLE, SKILL_TABLE_NAME]);

// 旧结构特征：没有才艺技能表。已迁移的聊天不再处理。
export function needsMigration(tables) {
    return !findSkillTable(tables) && Boolean(byName(tables, VALUES_TABLE));
}

// 已是解耦结构、但两张 IGS 表还不是 IGS 维护写法（旧版适配模板）：只需精修。raw 为数据库插件导出的整份表格 JSON。
export function needsRefine(tables, raw) {
    return Boolean(findSkillTable(tables)) && Boolean(byName(tables, VALUES_TABLE)) && !igsManagedTablesReady(raw);
}

// 在本聊天当前模板上套新模板：同名表换规则字段与表头（旧行按列名搬到新表头），缺的才艺技能表新建。
// 本聊天有而新模板没有的表原样保留。返回 { ok, template, added, replaced } 或带 reason 的失败。
export function buildMigratedTemplate(current, fetched) {
    const next = JSON.parse(JSON.stringify(current || {}));
    const entries = sheetEntries(next);
    const fresh = sheetEntries(fetched);
    if (!fresh.length) return { ok: false, reason: 'migrate-template-invalid' };
    const replaced = [];
    for (const name of REPLACED_RULE_SHEETS) {
        const target = entries.find(([, s]) => s.name === name);
        const source = fresh.find(([, s]) => s.name === name);
        if (!target || !source) continue;
        const sheet = target[1];
        const oldHeader = Array.isArray(sheet.content && sheet.content[0]) ? sheet.content[0].map(trim) : [];
        const newHeader = source[1].content[0].map(trim);
        const rows = (sheet.content || []).slice(1).map((row) => newHeader.map((h) => { const at = oldHeader.indexOf(h); return at >= 0 && at < row.length ? row[at] : ''; }));
        sheet.sourceData = JSON.parse(JSON.stringify(source[1].sourceData));
        sheet.content = [[...source[1].content[0]], ...rows];
        replaced.push(name);
    }
    if (!replaced.includes(VALUES_TABLE)) return { ok: false, reason: 'migrate-no-values-table' };
    // IGS 记录表：配置外壳换成新模板的（更新频率 0、不注入世界书、note 一句话），已有行不动。
    for (const name of MANAGED_RECORD_SHEETS) {
        const target = entries.find(([, s]) => s.name === name);
        const source = fresh.find(([, s]) => s.name === name);
        if (!target || !source) continue;
        for (const key of ['updateConfig', 'exportConfig']) if (source[1][key]) target[1][key] = JSON.parse(JSON.stringify(source[1][key]));
        target[1].sourceData = JSON.parse(JSON.stringify(source[1].sourceData));
        if (!replaced.includes(name)) replaced.push(name);
    }
    const added = [];
    if (!entries.some(([, s]) => s.name === SKILL_TABLE_NAME)) {
        const source = fresh.find(([, s]) => s.name === SKILL_TABLE_NAME);
        if (!source) return { ok: false, reason: 'migrate-template-no-skill-table' };
        let uid = source[1].uid;
        for (let n = 2; Object.hasOwn(next, uid); n += 1) uid = `${source[1].uid}${n}`;
        const orderNo = entries.reduce((max, [, s]) => Math.max(max, Number(s.orderNo) || 0), -1) + 1;
        next[uid] = { ...JSON.parse(JSON.stringify(source[1])), uid, orderNo };
        added.push(SKILL_TABLE_NAME);
    }
    next.mate = { ...(next.mate && typeof next.mate === 'object' ? next.mate : {}), updateConfigUiSentinel: -1 };
    return { ok: true, template: next, added, replaced };
}

// 按迁移前的旧表快照，算出新表里要补的格子与行。old / next 都是 parseTables 的结果。
// 返回 { writes, inserts, warnings, diagnostics }：writes 的 rowIndex 已含表头偏移。
export function planTableMigration(oldTables, newTables, { rowOffset = SHUJUKU_ROW_OFFSET } = {}) {
    const writes = [];
    const inserts = [];
    const warnings = [];
    const diagnostics = [];
    const oldValues = byName(oldTables, VALUES_TABLE);
    const oldHero = byName(oldTables, HERO_TABLE);
    const oldNpc = byName(oldTables, NPC_TABLE);
    const newValues = byName(newTables, VALUES_TABLE);
    const newNpc = byName(newTables, NPC_TABLE);
    const newHero = byName(newTables, HERO_TABLE);
    const skill = findSkillTable(newTables);
    if (!oldValues || !newValues) return { writes, inserts, warnings, diagnostics: [{ code: 'migrate-values-table-missing' }] };

    const heroName = oldHero && oldHero.rows[0] ? trim(oldHero.rows[0][colOf(oldHero, '姓名')]) : '';
    const fill = (table, rowIndex, column, value, current) => {
        if (!trim(value) || trim(current)) return;
        writes.push({ table: table.name, rowIndex: rowIndex + rowOffset, column, value: trim(value) });
    };

    // 1. 角色数值表：新表缺的角色行补进来，空格按旧表补；体力、金钱、压力留给 IGS 下次同步写入。
    const nameOld = colOf(oldValues, '角色姓名');
    const nameNew = colOf(newValues, '角色姓名');
    const carried = ['好感度', '信任度', '了解程度', '芥蒂程度'];
    const secrets = new Map();
    const secretCols = ['已知秘密', '未知秘密'].map((c) => colOf(oldValues, c));
    oldValues.rows.forEach((row) => {
        const name = trim(row[nameOld]);
        if (!name) return;
        secrets.set(name, { known: trim(row[secretCols[0]]), unknown: trim(row[secretCols[1]]) });
        const at = newValues.rows.findIndex((r) => trim(r[nameNew]) === name);
        if (at < 0) {
            const data = { 角色姓名: name };
            for (const c of carried) { const i = colOf(oldValues, c); if (i >= 0 && trim(row[i])) data[c] = trim(row[i]); }
            inserts.push({ table: newValues.name, data });
            return;
        }
        for (const c of carried) {
            const i = colOf(oldValues, c);
            const j = colOf(newValues, c);
            if (i >= 0 && j >= 0) fill(newValues, at, c, row[i], newValues.rows[at][j]);
        }
    });
    if (heroName && !newValues.rows.some((r) => trim(r[nameNew]) === heroName) && !oldValues.rows.some((r) => trim(r[nameOld]) === heroName)) {
        inserts.push({ table: newValues.name, data: { 角色姓名: heroName } });
    }

    // 2. 秘密：重要角色表按姓名接收；主角信息表没有旧来源。对不上的秘密只提示。
    if (newNpc) {
        const nameCol = colOf(newNpc, '姓名');
        const known = colOf(newNpc, '已知秘密');
        const unknown = colOf(newNpc, '未知秘密');
        for (const [name, s] of secrets) {
            if (!s.known && !s.unknown) continue;
            const at = newNpc.rows.findIndex((r) => trim(r[nameCol]) === name);
            if (at < 0 || known < 0 || unknown < 0) { warnings.push({ code: 'migrate-secret-unmatched', name }); continue; }
            fill(newNpc, at, '已知秘密', s.known, newNpc.rows[at][known]);
            fill(newNpc, at, '未知秘密', s.unknown, newNpc.rows[at][unknown]);
        }
    }

    // 3. 属性格：主角与重要角色的基础属性、特有属性搬进才艺技能表（一行一项）；表里已有的项不覆盖。
    if (!skill) {
        diagnostics.push({ code: 'migrate-skill-table-missing' });
    } else {
        const owners = [];
        if (oldHero && oldHero.rows[0] && heroName) owners.push({ name: heroName, table: oldHero, row: oldHero.rows[0] });
        if (oldNpc) {
            const nc = colOf(oldNpc, '姓名');
            for (const row of oldNpc.rows) if (trim(row[nc])) owners.push({ name: trim(row[nc]), table: oldNpc, row });
        }
        const have = new Set(skill.table.rows.map((r) => `${trim(r[skill.nameCol])}|${canonicalAttribute(r[skill.skillCol])}`));
        const columns = skill.table.columns.map(trim);
        for (const owner of owners) {
            for (const header of ['基础属性', '特有属性']) {
                const i = colOf(owner.table, header);
                if (i < 0) continue;
                for (const [rawName, value] of Object.entries(readAttributeCell(owner.row[i]))) {
                    const skillName = canonicalAttribute(rawName);
                    const key = `${owner.name}|${skillName}`;
                    if (have.has(key)) continue;
                    have.add(key);
                    inserts.push({ table: skill.table.name, data: { [columns[skill.nameCol]]: owner.name, [columns[skill.skillCol]]: skillName, [columns[skill.valueCol]]: String(Math.round(value)) } });
                    if (!isSixAttribute(skillName) && header === '基础属性') diagnostics.push({ code: 'migrate-base-attribute-unknown', name: owner.name, skill: skillName });
                }
            }
        }
    }

    // 4. 随身财物：钱不搬（金钱归角色数值表），物品拿不准，只提示用户自行处理。
    if (oldHero && oldHero.rows[0]) {
        const i = colOf(oldHero, '随身财物');
        const text = i >= 0 ? trim(oldHero.rows[0][i]) : '';
        if (text) warnings.push({ code: 'migrate-belongings-not-moved', text: text.slice(0, 200) });
    }
    return { writes, inserts, warnings, diagnostics, heroTableReady: Boolean(newHero) };
}

// 完整迁移流程。fetched：新模板 JSON；backup(text)：写入 chatMetadata 的回调，返回 { ok }。
// 失败的步骤带 reason，成功返回写入与新增的数量、提示与诊断；不自动重试。
export async function migrateTables(client, fetched, { backup } = {}) {
    const read = client.readTables();
    if (!read.ok) return { ok: false, reason: 'migrate-read-failed', detail: read.reason };
    const oldTables = parseTables(read.data);
    const refineOnly = !needsMigration(oldTables) && needsRefine(oldTables, read.data);
    if (!needsMigration(oldTables) && !refineOnly) return { ok: true, skipped: true, reason: findSkillTable(oldTables) ? 'migrate-already-new' : 'migrate-no-values-table' };
    const templateRead = client.getTableTemplate();
    if (!templateRead.ok) return { ok: false, reason: 'migrate-template-unavailable', detail: templateRead.reason };
    const built = buildMigratedTemplate(templateRead.data, fetched);
    if (!built.ok) return built;
    // 备份先于任何改动：模板与表内容整份存档，失败就不动表。
    let saved;
    try { saved = typeof backup === 'function' ? await backup(JSON.stringify({ at: Date.now(), template: templateRead.data, tables: read.data })) : { ok: false, reason: 'migrate-no-backup' }; } catch (error) { saved = { ok: false, reason: String(error && error.message || error) }; }
    if (!saved || !saved.ok) return { ok: false, reason: 'migrate-backup-failed', detail: saved && saved.reason };
    const imported = await client.importTemplate(built.template, { scope: 'chat', dataMode: 'seed' });
    if (!imported.ok) return { ok: false, reason: 'migrate-import-failed', detail: imported.message || imported.reason, backedUp: true };
    if (imported.result && imported.result.runtimeReady === false) return { ok: false, reason: 'migrate-runtime-not-ready', backedUp: true };
    const after = client.readTables();
    if (!after.ok) return { ok: false, reason: 'migrate-reread-failed', detail: after.reason, backedUp: true };
    const newTables = parseTables(after.data);
    if (!findSkillTable(newTables)) return { ok: false, reason: 'migrate-skill-table-not-created', backedUp: true };
    // 只精修时没有秘密与属性格要搬，不做补写。
    const plan = refineOnly ? { writes: [], inserts: [], warnings: [], diagnostics: [] } : planTableMigration(oldTables, newTables);
    const failures = [];
    let wrote = 0;
    let inserted = 0;
    for (const w of plan.writes) {
        let r;
        try { r = await client.updateCell(w.table, w.rowIndex, w.column, w.value); } catch (error) { r = { ok: false, reason: String(error && error.message || error) }; }
        if (r && r.ok) wrote += 1; else failures.push({ ...w, reason: r && r.reason });
    }
    for (const item of plan.inserts) {
        let r;
        try { r = await client.insertRow(item.table, item.data, { skipNotify: true }); } catch (error) { r = { ok: false, reason: String(error && error.message || error) }; }
        if (r && r.ok) inserted += 1; else failures.push({ table: item.table, data: item.data, reason: r && r.reason });
    }
    if (wrote || inserted) { try { await client.refresh(); } catch (error) { plan.diagnostics.push({ code: 'migrate-refresh-failed' }); } }
    return { ok: failures.length === 0, wrote, inserted, failures, warnings: plan.warnings, diagnostics: plan.diagnostics, added: built.added, replaced: built.replaced };
}
