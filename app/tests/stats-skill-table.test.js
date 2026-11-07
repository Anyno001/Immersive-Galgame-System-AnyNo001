import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTables } from '../src/data/shujuku/table-parser.js';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { detectStatMappings, describeStatMappings, planStatsPush, pushStats } from '../src/data/shujuku/stats-push.js';
import { findSkillTable, lookupSkillValue, planSkillAdoption, planSkillPush } from '../src/data/shujuku/skill-table.js';
import { buildMigratedTemplate, migrateTables, needsMigration, needsRefine, planTableMigration } from '../src/data/shujuku/table-migrate.js';
import { igsManagedTablesReady } from '../src/data/shujuku/igs-managed.js';
import { resolveDiceCommand } from '../src/choices/dice-check.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = JSON.parse(fs.readFileSync(path.resolve(here, '../../docs/templates/TavernDB_template_恋爱Gal_IGS数值系统适配版.json'), 'utf8'));

function sheet(uid, name, header, rows, extra = {}) {
    return { uid, name, content: [['row_id', ...header], ...rows.map((r, i) => [String(i + 1), ...r])], orderNo: extra.orderNo ?? 0, sourceData: extra.sourceData || { note: '旧' } };
}
const skillSheet = (rows) => sheet('sheet_skill', '才艺技能表', ['角色姓名', '技能', '数值'], rows, { orderNo: 3 });
const newValues = (rows) => sheet('sheet_v', '角色数值表', ['角色姓名', '好感度', '信任度', '了解程度', '芥蒂程度', '体力', '金钱', '压力'], rows, { orderNo: 2 });
const idOf = (name) => (name === '小雪' ? '小雪' : null);
const keyOf = (name) => (name === '阿明' || name === '主角' ? '主角' : idOf(name) || '');

test('模板：新表结构、列与 ddl 同步，旧列名全部清除，JSON 能被解析器读通', () => {
    const tables = parseTables(TEMPLATE);
    const byName = Object.fromEntries(tables.map((t) => [t.name, t]));
    assert.deepEqual(byName['角色数值表'].columns, ['row_id', '角色姓名', '好感度', '信任度', '了解程度', '芥蒂程度', '体力', '金钱', '压力']);
    assert.deepEqual(byName['才艺技能表'].columns, ['row_id', '角色姓名', '技能', '数值']);
    assert.ok(!byName['主角信息表'].columns.some((c) => ['基础属性', '特有属性', '随身财物'].includes(c)));
    assert.deepEqual(byName['主角信息表'].columns.slice(-2), ['已知秘密', '未知秘密']);
    assert.ok(byName['重要角色表'].columns.includes('已知秘密') && !byName['重要角色表'].columns.includes('基础属性'));
    const orders = Object.values(TEMPLATE).filter((s) => s && s.uid).map((s) => s.orderNo);
    assert.equal(new Set(orders).size, orders.length);
    assert.ok(byName['才艺技能表'] && tables.indexOf(byName['才艺技能表']) === tables.indexOf(byName['角色数值表']) + 1);
    const check = TEMPLATE.sheet_jian_ding_jian_yi_biao.sourceData;
    assert.doesNotMatch(check.note, /才艺技能表/);
    assert.ok(!byName['重要角色表'].columns.includes('交互选项'));
    for (const uid of ['sheet_jue_se_shu_zhi_biao', 'sheet_cai_yi_ji_neng_biao']) assert.equal(TEMPLATE[uid].updateConfig.updateFrequency, 0, uid);
    assert.doesNotMatch(check.note + check.initNode + check.updateNode, /base_attributes|special_attributes|基础属性|特殊属性/);
    assert.doesNotMatch(TEMPLATE.sheet_wu_pin_biao.sourceData.note, /角色数值表|金钱/);
    assert.match(TEMPLATE.sheet_jue_se_shu_zhi_biao.sourceData.ddl, /stamina TEXT, -- 体力/);
    assert.doesNotMatch(JSON.stringify(TEMPLATE.sheet_zhu_jue_xin_xi_biao.sourceData), /base_attributes|belongings/);
});

test('新表识别：才艺技能表一条 skills 映射，角色数值表里体力、金钱、压力走生活条列；旧模板识别不变', () => {
    const tables = parseTables(TEMPLATE);
    const maps = detectStatMappings(tables).mappings;
    assert.equal(maps.filter((m) => m.kind === 'skills').length, 1);
    for (const key of ['stamina', 'money', 'stress']) assert.ok(maps.some((m) => m.kind === 'barcol' && m.key === key), key);
    assert.ok(!maps.some((m) => m.kind === 'attrs'));
    const old = parseTables({
        a: sheet('sheet_a', '主角信息表', ['姓名', '基础属性', '特有属性'], [['阿明', '健康:60；', '烹饪:40；']]),
        b: sheet('sheet_b', '角色数值表', ['角色姓名', '好感度'], [['小雪', '10%']]),
    });
    const oldMaps = detectStatMappings(old).mappings;
    assert.deepEqual(oldMaps.map((m) => `${m.kind}:${m.column}`).sort(), ['attrs:基础属性', 'attrs:特有属性', 'dim:好感度']);
    const desc = describeStatMappings({ ok: true, data: TEMPLATE });
    assert.ok(desc.rows.some((r) => r.kind === 'skills'));
});

test('技能写回：已有行改值，缺的行走新增，旧名映射到现行名', () => {
    const found = findSkillTable(parseTables({ s: skillSheet([['阿明', '体质', '10'], ['小雪', '烹饪', '30']]) }));
    const plan = planSkillPush(found, { 主角: { 体质: 55, 园艺: 20 }, 小雪: { 烹饪: 30 } }, { keyOf, heroName: '阿明' });
    assert.deepEqual(plan.writes.map((w) => [w.rowIndex, w.column, w.value]), [[1, '数值', '55']]);
    assert.deepEqual(plan.inserts.map((i) => i.data), [{ 角色姓名: '阿明', 技能: '园艺', 数值: '20' }]);
    const legacy = planSkillPush(found, { 主角: { 体质: 56 } }, { keyOf, heroName: '阿明' });
    assert.equal(legacy.writes.length, 1);
    const old = findSkillTable(parseTables({ s: skillSheet([['阿明', '健康', '10']]) }));
    assert.equal(planSkillPush(old, { 主角: { 体质: 11 } }, { keyOf }).writes[0].value, '11');
});

test('pushStats：缺行时调用新增行接口；接口缺失只记诊断不算失败', async () => {
    const data = { v: newValues([['小雪', '0', '0', '0', '0', '100', '0', '0']]), s: skillSheet([]) };
    const state = { ...createStatsState({ money: 0 }), characters: { 小雪: createCharacter(1) } };
    const inserted = [];
    const api = { exportTableAsJson: () => data, updateCell: () => true, insertRow: (o) => { inserted.push(o); return true; }, refreshDataAndWorldbook: () => {} };
    const r = await pushStats(createShujukuClient(api), state, { characterKey: idOf, skillValues: () => ({ 小雪: { 烹饪: 30 } }), heroName: '阿明' });
    assert.equal(r.inserted, 1);
    assert.deepEqual(inserted[0].data, { 角色姓名: '小雪', 技能: '烹饪', 数值: '30' });
    const noApi = { exportTableAsJson: () => data, updateCell: () => true, refreshDataAndWorldbook: () => {} };
    const r2 = await pushStats(createShujukuClient(noApi), state, { characterKey: idOf, skillValues: () => ({ 小雪: { 烹饪: 30 } }) });
    assert.ok(r2.ok && r2.diagnostics.some((d) => d.code === 'stats-skill-insert-failed'));
});

test('技能采纳：表里新增的技能首次收进；数值不同视为手改；六维不采纳', () => {
    const found = findSkillTable(parseTables({ s: skillSheet([['小雪', '园艺', '35'], ['小雪', '烹饪', '50'], ['小雪', '体质', '9'], ['路人', '钓鱼', '20']]) }));
    const plan = planSkillAdoption(found, { 小雪: { 烹饪: 30 } }, { keyOf });
    assert.deepEqual(plan.fresh, [{ key: '小雪', skill: '园艺', value: 35 }]);
    assert.deepEqual(plan.changed, [{ key: '小雪', skill: '烹饪', from: 30, to: 50 }]);
});

test('检定取值走才艺技能表：普通与对抗检定，AcuDice 读不到时本地掷骰', async () => {
    const tables = parseTables({ s: skillSheet([['阿明', '魅力', '60'], ['小雪', '体质', '40'], ['小雪', '烹饪', '70']]) });
    const readSkillTable = (name, skill) => lookupSkillValue(tables, name, skill, { keyOf: (n) => (n === '阿明' || n === '<user>' ? '主角' : n) });
    assert.equal(readSkillTable('小雪', '健康'), 40);
    assert.equal(readSkillTable('<user>', '魅力'), 60);
    const emptyDice = { getAttributeValue: () => null, checkByCharacter: async () => { throw new Error('不应调用'); }, contest: async () => { throw new Error('不应调用'); } };
    const normal = await resolveDiceCommand('检定 <user> 魅力', emptyDice, { random: () => 0.1, userName: '阿明', readSkillTable });
    assert.equal(normal.ok, true);
    assert.equal(normal.success, true);
    const contest = await resolveDiceCommand('对抗 <user> 魅力 vs 小雪 烹饪', emptyDice, { random: () => 0.1, userName: '阿明', readSkillTable });
    assert.equal(contest.ok, true, contest.reason);
    const missing = await resolveDiceCommand('检定 小雪 钓鱼', emptyDice, { random: () => 0.1, userName: '阿明', readSkillTable });
    assert.equal(missing.ok, false);
});

// ---- 旧聊天迁移 ----

function oldChat() {
    return {
        h: sheet('sheet_h', '主角信息表', ['主角信息', '姓名', '基础属性', '特有属性', '随身财物'], [['主角信息', '阿明', '健康:60；力量:45；', '园艺:30；', '三百元']], { orderNo: 0 }),
        n: sheet('sheet_n', '重要角色表', ['姓名', '角色类型', '基础属性', '特有属性', '交互选项'], [['小雪', '恋爱对象', '健康:50；魅力:70；', '烹饪:65；', '送花']], { orderNo: 1 }),
        v: sheet('sheet_v', '角色数值表', ['角色姓名', '好感度', '信任度', '了解程度', '芥蒂程度', '已知秘密', '未知秘密'], [['小雪', '12%', '8%', '5%', '0%', '是画家', '为何转学']], { orderNo: 2 }),
    };
}

test('迁移：识别旧结构；换模板时旧行按列名搬到新表头，缺的才艺技能表新建，规则字段换新', () => {
    const data = oldChat();
    assert.equal(needsMigration(parseTables(data)), true);
    const built = buildMigratedTemplate(data, TEMPLATE);
    assert.equal(built.ok, true);
    assert.deepEqual(built.added, ['才艺技能表']);
    assert.deepEqual(built.template.v.content[0], TEMPLATE.sheet_jue_se_shu_zhi_biao.content[0]);
    assert.deepEqual(built.template.v.content[1].slice(0, 5), ['1', '小雪', '12%', '8%', '5%']);
    assert.equal(built.template.v.sourceData.note, '角色数值表，由 IGS 程序维护。AI 不得填写、修改或删除此表。');
    assert.equal(built.template.v.updateConfig.updateFrequency, 0);
    assert.equal(built.template.v.exportConfig.injectIntoWorldbook, false);
    assert.equal(built.template.n.content[0].includes('交互选项'), false);
    assert.equal(data.v.content[0].length, 8, '不改入参的表');
    assert.equal(needsMigration(parseTables(built.template)), false);
});

test('迁移：秘密按姓名搬进重要角色表，属性格进才艺技能表（旧名换现行名），随身财物只提示不搬', () => {
    const old = parseTables(oldChat());
    const next = parseTables({
        h: sheet('sheet_h', '主角信息表', ['主角信息', '姓名', '已知秘密', '未知秘密'], [['主角信息', '阿明', '', '']]),
        n: sheet('sheet_n', '重要角色表', ['姓名', '角色类型', '已知秘密', '未知秘密'], [['小雪', '恋爱对象', '', '']]),
        v: newValues([['小雪', '', '', '', '', '', '', '']]),
        s: skillSheet([]),
    });
    const plan = planTableMigration(old, next);
    assert.deepEqual(plan.writes.filter((w) => w.table === '重要角色表').map((w) => [w.column, w.value]), [['已知秘密', '是画家'], ['未知秘密', '为何转学']]);
    assert.deepEqual(plan.writes.filter((w) => w.table === '角色数值表').map((w) => [w.column, w.value]), [['好感度', '12%'], ['信任度', '8%'], ['了解程度', '5%'], ['芥蒂程度', '0%']]);
    const skills = plan.inserts.filter((i) => i.table === '才艺技能表').map((i) => `${i.data.角色姓名}|${i.data.技能}|${i.data.数值}`).sort();
    assert.deepEqual(skills, ['小雪|体质|50', '小雪|烹饪|65', '小雪|魅力|70', '阿明|力量|45', '阿明|园艺|30', '阿明|体质|60'].sort());
    assert.ok(plan.inserts.some((i) => i.table === '角色数值表' && i.data.角色姓名 === '阿明'));
    assert.ok(plan.warnings.some((w) => w.code === 'migrate-belongings-not-moved'));
});

test('迁移流程：先备份再导入；备份失败不动表；已是新结构直接跳过', async () => {
    let current = oldChat();
    const imported = [];
    const api = {
        exportTableAsJson: () => current,
        getTableTemplate: () => JSON.parse(JSON.stringify(current)),
        importTemplateFromData: async (template) => {
            imported.push(template);
            const carry = { ...template };
            current = carry;
            return { success: true, runtimeReady: true };
        },
        updateCell(table, rowIndex, col, value) {
            const s = Object.values(current).find((x) => x && x.name === table);
            s.content[rowIndex][s.content[0].indexOf(col)] = value;
            return true;
        },
        insertRow({ tableName, data }) {
            const s = Object.values(current).find((x) => x && x.name === tableName);
            s.content.push(['0', ...s.content[0].slice(1).map((c) => data[c] ?? '')]);
            return true;
        },
        refreshDataAndWorldbook() {},
    };
    const client = createShujukuClient(api);
    let saved = null;
    const failed = await migrateTables(client, TEMPLATE, { backup: () => ({ ok: false, reason: 'no-chat-metadata' }) });
    assert.equal(failed.reason, 'migrate-backup-failed');
    assert.equal(imported.length, 0);
    const done = await migrateTables(client, TEMPLATE, { backup: (text) => { saved = JSON.parse(text); return { ok: true }; } });
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.ok(saved && saved.tables.v.content[0].includes('已知秘密'), '备份是旧表');
    const after = parseTables(current);
    const npc = after.find((t) => t.name === '重要角色表');
    assert.equal(npc.rows[0][npc.columns.indexOf('已知秘密')], '是画家');
    assert.ok(findSkillTable(after).table.rows.some((r) => r.includes('烹饪') && r.includes('65')));
    const again = await migrateTables(client, TEMPLATE, { backup: () => ({ ok: true }) });
    assert.equal(again.skipped, true);
});

// 解耦后、精修前的聊天：已有才艺技能表，但两张 IGS 表还是旧版适配模板的写法，迁移只做精修。
function decoupledOldChat() {
    return {
        n: sheet('sheet_n', '重要角色表', ['姓名', '角色类型', '已知秘密', '未知秘密', '交互选项'], [['小雪', '恋爱对象', '是画家', '为何转学', '送花']], { orderNo: 1 }),
        v: sheet('sheet_v', '角色数值表', ['角色姓名', '好感度', '信任度', '了解程度', '芥蒂程度', '体力', '金钱', '压力'], [['小雪', '12%', '8%', '5%', '0%', '90', '30', '10']], { orderNo: 2, sourceData: { note: '旧的长说明【IGS 数值系统】' } }),
        s: sheet('sheet_s', '才艺技能表', ['角色姓名', '技能', '数值'], [['小雪', '烹饪', '65']], { orderNo: 3, sourceData: { note: '旧的长说明' } }),
    };
}

test('精修迁移：旧版适配模板换成 IGS 记录表写法，旧行不丢，重要角色表丢弃交互选项，已精修的聊天跳过', async () => {
    const data = decoupledOldChat();
    for (const key of ['v', 's']) data[key].updateConfig = { updateFrequency: 1, skipFloors: 0 };
    assert.equal(needsRefine(parseTables(data), data), true);
    assert.equal(needsMigration(parseTables(data)), false);
    const built = buildMigratedTemplate(data, TEMPLATE);
    assert.equal(built.ok, true);
    assert.deepEqual(built.added, []);
    for (const key of ['v', 's']) {
        const s = built.template[key];
        assert.equal(s.updateConfig.updateFrequency, 0, key);
        assert.equal(s.exportConfig.enabled, false, key);
        assert.equal(s.exportConfig.injectIntoWorldbook, false, key);
        assert.match(s.sourceData.note, /^(角色数值表|才艺技能表)，由 IGS 程序维护。AI 不得填写、修改或删除此表。$/, key);
    }
    assert.deepEqual(built.template.v.content[1].slice(0, 9), ['1', '小雪', '12%', '8%', '5%', '0%', '90', '30', '10']);
    assert.deepEqual(built.template.s.content[1], ['1', '小雪', '烹饪', '65']);
    assert.equal(built.template.n.content[0].includes('交互选项'), false);
    assert.equal(built.template.n.content[1][built.template.n.content[0].indexOf('已知秘密')], '是画家');
    assert.equal(built.template.n.content[1][built.template.n.content[0].indexOf('未知秘密')], '为何转学');
    assert.equal(needsRefine(parseTables(built.template), built.template), false);
    assert.equal(data.v.sourceData.note, '旧的长说明【IGS 数值系统】', '不改入参');

    // 流程：只精修时不补写、不新增行；精修后再迁移直接跳过。
    let current = decoupledOldChat();
    const api = {
        exportTableAsJson: () => current,
        getTableTemplate: () => JSON.parse(JSON.stringify(current)),
        importTemplateFromData: async (template) => { current = { ...template }; return { success: true, runtimeReady: true }; },
        updateCell() { throw new Error('精修不应补写'); },
        insertRow() { throw new Error('精修不应新增行'); },
        refreshDataAndWorldbook() {},
    };
    const client = createShujukuClient(api);
    const done = await migrateTables(client, TEMPLATE, { backup: () => ({ ok: true }) });
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(done.wrote, 0);
    assert.equal(done.inserted, 0);
    assert.equal(igsManagedTablesReady(current), true);
    const again = await migrateTables(client, TEMPLATE, { backup: () => ({ ok: true }) });
    assert.equal(again.skipped, true);
});
