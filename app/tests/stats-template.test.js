import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATS_TEMPLATE_COLUMNS, STATS_TEMPLATE_EDITS, adaptStatsTemplate } from '../src/data/shujuku/stats-template-adapt.js';
import { parseTables } from '../src/data/shujuku/table-parser.js';
import { detectStatMappings } from '../src/data/shujuku/stats-push.js';
import { downloadStatsTemplate, statsTemplateUrl, fetchStatsTemplate, importStatsTemplate, statsTemplateChatDiff, STATS_TEMPLATE_PRESET_NAME } from '../src/visual/igs-ui/stats-template-link.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(here, '../../../参考文件/TavernDB_template_恋爱Gal_一键开关(1).json');
const hasBase = fs.existsSync(BASE);

function synthetic() {
    const t = {};
    for (const e of STATS_TEMPLATE_EDITS) {
        t[e.sheet] = t[e.sheet] || { uid: e.sheet, name: e.sheet, content: [['row_id']], sourceData: {} };
        const src = t[e.sheet].sourceData;
        src[e.field] = (src[e.field] || '原文') + (e.find || e.anchor || '');
    }
    for (const c of STATS_TEMPLATE_COLUMNS) t[c.sheet].content[0].push(c.after);
    return t;
}

test('适配版只改约定的规则字段；其余表、列、DDL、导出配置不变；不改入参；适配后仍零配置识别（§8C）', { skip: !hasBase && '基准模板不在工作区' }, () => {
    const raw = fs.readFileSync(BASE, 'utf8');
    const base = JSON.parse(raw);
    const out = adaptStatsTemplate(base);
    assert.equal(JSON.stringify(base), JSON.stringify(JSON.parse(raw)));
    const edited = new Set(STATS_TEMPLATE_EDITS.map((e) => `${e.sheet}|${e.field}`));
    // 数值表解耦改表结构的表：整体改动由 stats-skill-table.test.js 与下面的列断言覆盖；orderNo 因新增才艺技能表顺延。
    const DECOUPLED = new Set(['sheet_jue_se_shu_zhi_biao', 'sheet_zhu_jue_xin_xi_biao', 'sheet_zhong_yao_jue_se_biao', 'sheet_wu_pin_biao', 'sheet_jian_ding_jian_yi_biao', 'sheet_yi_jian_kai_guan_biao']);
    for (const key of Object.keys(base)) {
        const { sourceData: a, content: ca, ...restOut } = out[key] || {};
        const { sourceData: b, content: cb, ...restBase } = base[key] || {};
        if (!STATS_TEMPLATE_COLUMNS.some((c) => c.sheet === key) && !DECOUPLED.has(key)) assert.deepEqual(ca, cb, key + '.content');
        if (DECOUPLED.has(key)) { delete restOut.orderNo; delete restBase.orderNo; }
        assert.deepEqual(restOut, restBase, key);
        if (DECOUPLED.has(key)) continue;
        for (const field of Object.keys(b || {})) if (!edited.has(`${key}|${field}`)) assert.deepEqual(a[field], b[field], `${key}.${field}`);
    }
    const values = out.sheet_jue_se_shu_zhi_biao.sourceData;
    assert.doesNotMatch(values.updateNode, /单次事件变动/);
    assert.match(values.updateNode, /禁止修改/);
    assert.match(values.initNode, /一律填 0，体力填 100/);
    assert.doesNotMatch(out.sheet_jian_ding_jian_yi_biao.sourceData.note, /成长后属性|成长检定/);
    assert.doesNotMatch(out.sheet_zhu_jue_xin_xi_biao.sourceData.updateNode, /base_attributes/);
    assert.match(out.sheet_zhong_yao_jue_se_biao.sourceData.updateNode, /未知秘密查明后移入已知秘密/);
    assert.match(out.sheet_jian_ding_jian_yi_biao.sourceData.note, /才艺技能表按 角色姓名 \+ 技能|从才艺技能表按 角色姓名 \+ 技能/);
    assert.equal(out.sheet_cai_yi_ji_neng_biao.orderNo, out.sheet_jue_se_shu_zhi_biao.orderNo + 1);
    const mappings = detectStatMappings(parseTables(out)).mappings;
    assert.deepEqual(out.sheet_jue_se_shu_zhi_biao.content[0], ['row_id', '角色姓名', '好感度', '信任度', '了解程度', '芥蒂程度', '体力', '金钱', '压力']);
    assert.match(out.sheet_jue_se_shu_zhi_biao.sourceData.ddl, /understanding_level TEXT, -- 了解程度\n {2}grudge_level TEXT, -- 芥蒂程度/);
    for (const column of ['好感度', '信任度', '了解程度', '芥蒂程度']) assert.ok(mappings.some((m) => m.table === '角色数值表' && m.column === column), column);
    assert.throws(() => adaptStatsTemplate(out), /stats-template-already-adapted/);
});

test('锚点对不上（基准模板改版）时抛错，不生成半改版；非法输入可诊断', () => {
    // 合成模板只带规则字段的锚点，通过规则改写这一段后，在表结构改写（数值表解耦）处因缺列说明而报锚点缺失。
    assert.throws(() => adaptStatsTemplate(synthetic()), (e) => e.code === 'stats-template-anchor-missing' && e.sheet === 'sheet_zhu_jue_xin_xi_biao');
    const missing = synthetic();
    missing.sheet_jue_se_shu_zhi_biao.sourceData.updateNode = '改版后的规则';
    assert.throws(() => adaptStatsTemplate(missing), (e) => e.code === 'stats-template-anchor-missing' && e.field === 'updateNode');
    const twice = synthetic();
    twice.sheet_jian_ding_jian_yi_biao.sourceData.note += '普通检定、对抗检定和成长检定';
    assert.throws(() => adaptStatsTemplate(twice), (e) => e.code === 'stats-template-anchor-missing' && e.count === 2);
    const noField = synthetic();
    delete noField.sheet_zhu_jue_xin_xi_biao.sourceData.note;
    assert.throws(() => adaptStatsTemplate(noField), /stats-template-field-missing/);
    assert.throws(() => adaptStatsTemplate(null), /stats-template-invalid/);
});

test('下载入口：地址相对 bundle 指向 ./templates/，先取回内容转 blob 下载，取不到时退回直链；没有 document 时返回原因', async () => {
    const url = statsTemplateUrl('https://cdn.example/igs/dist/igs.bundle.js');
    assert.match(url, /^https:\/\/cdn\.example\/igs\/dist\/templates\/TavernDB_template_/);
    const clicks = [];
    const body = { children: [], appendChild(n) { this.children.push(n); }, removeChild(n) { this.children = this.children.filter((x) => x !== n); } };
    const doc = { body, createElement: () => ({ click() { clicks.push(this.href); } }) };
    const urlApi = { createObjectURL: () => 'blob:igs-template', revokeObjectURL() {} };
    const okFetch = async (u) => ({ ok: u === url, status: 200, blob: async () => ({}) });
    assert.equal((await downloadStatsTemplate(doc, url, { fetchImpl: okFetch, urlApi })).via, 'blob');
    const failFetch = async () => ({ ok: false, status: 404 });
    assert.equal((await downloadStatsTemplate(doc, url, { fetchImpl: failFetch, urlApi })).via, 'link');
    assert.deepEqual(clicks, ['blob:igs-template', url]);
    assert.equal(body.children.length, 0);
    assert.equal((await downloadStatsTemplate(null)).reason, 'stats-template-no-document');
});

test('直接导入：global 存预设库、chat 以 seed 替换并核对 runtimeReady；预检列出会被隐藏的表', async () => {
    const tpl = { mate: { type: 'chatSheets' }, sheet_a: { name: '角色数值表' }, sheet_b: { name: '主角信息表' } };
    const fetched = await fetchStatsTemplate('u', { fetchImpl: async () => ({ ok: true, json: async () => tpl }) });
    assert.equal(fetched.ok, true);
    assert.equal((await fetchStatsTemplate('u', { fetchImpl: async () => ({ ok: false, status: 404 }) })).reason, 'stats-template-fetch-failed');
    assert.equal((await fetchStatsTemplate('u', { fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })).reason, 'stats-template-invalid');

    const calls = [];
    const client = { importTemplate: async (t, o) => { calls.push(o); return { ok: true, result: { runtimeReady: o.scope !== 'chat' } }; } };
    assert.deepEqual(await importStatsTemplate(client, tpl), { ok: true, scope: 'global' });
    assert.equal((await importStatsTemplate(client, tpl, 'chat')).reason, 'stats-template-runtime-not-ready');
    assert.deepEqual(calls.map((o) => [o.scope, o.dataMode, o.presetName]), [['global', 'seed', STATS_TEMPLATE_PRESET_NAME], ['chat', 'seed', STATS_TEMPLATE_PRESET_NAME]]);
    assert.equal(STATS_TEMPLATE_PRESET_NAME, '恋爱Gal_IGS数值系统适配版');

    const current = { sheet_a: { name: '角色数值表' }, sheet_x: { name: '我的自定义表' } };
    assert.deepEqual(statsTemplateChatDiff(current, tpl).hidden, ['我的自定义表']);
});
