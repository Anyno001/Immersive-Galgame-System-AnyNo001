import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptStatsTemplate } from '../src/data/shujuku/stats-template-adapt.js';
import { igsManagedTablesReady, isIgsManagedSheet, statsPushActive } from '../src/data/shujuku/igs-managed.js';
import { parseDiceCommand } from '../src/choices/dice-check.js';
import { parseTables } from '../src/data/shujuku/table-parser.js';
import { detectStatMappings } from '../src/data/shujuku/stats-push.js';
import { downloadStatsTemplate, statsTemplateUrl, fetchStatsTemplate, importStatsTemplate, statsTemplateChatDiff, STATS_TEMPLATE_PRESET_NAME } from '../src/visual/igs-ui/stats-template-link.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.resolve(here, '../../../参考文件/TavernDB_template_恋爱Gal_一键开关(1).json');
const hasBase = fs.existsSync(BASE);

const IGS_WORDS = /IGS|前端|角色数值表|才艺技能表/;
const AI_SHEETS = ['sheet_quan_ju_zhuang_tai_biao', 'sheet_chang_jing_di_dian_biao', 'sheet_zhu_jue_xin_xi_biao', 'sheet_zhong_yao_jue_se_biao', 'sheet_lian_ai_ri_ji_biao', 'sheet_bei_wang_lu', 'sheet_ji_yao_biao', 'sheet_guan_xi_wang_luo_biao', 'sheet_wu_pin_biao', 'sheet_jian_ding_jian_yi_biao', 'sheet_yi_jian_kai_guan_biao'];
const REWRITTEN = new Set(['sheet_zhu_jue_xin_xi_biao', 'sheet_zhong_yao_jue_se_biao', 'sheet_jian_ding_jian_yi_biao']);

test('适配版：两张 IGS 表为记录表写法，AI 填的表不提 IGS，重要角色表无交互选项，检定建议表不涉及取值来源', { skip: !hasBase && '基准模板不在工作区' }, () => {
    const raw = fs.readFileSync(BASE, 'utf8');
    const base = JSON.parse(raw);
    const out = adaptStatsTemplate(base);
    assert.equal(JSON.stringify(base), JSON.stringify(JSON.parse(raw)), '不改入参');
    for (const uid of ['sheet_jue_se_shu_zhi_biao', 'sheet_cai_yi_ji_neng_biao']) {
        const s = out[uid];
        assert.equal(s.updateConfig.updateFrequency, 0, uid);
        assert.equal(s.exportConfig.injectIntoWorldbook, false, uid);
        assert.equal(s.exportConfig.enabled, false, uid);
        assert.equal(s.sourceData.note, s.name + '，由 IGS 程序维护。AI 不得填写、修改或删除此表。');
        for (const f of ['initNode', 'insertNode', 'updateNode', 'deleteNode']) assert.equal(s.sourceData[f], '禁止。', uid + '.' + f);
        assert.ok(isIgsManagedSheet(s));
    }
    assert.deepEqual(out.sheet_jue_se_shu_zhi_biao.content[0], ['row_id', '角色姓名', '好感度', '信任度', '了解程度', '芥蒂程度', '体力', '金钱', '压力']);
    assert.deepEqual(out.sheet_cai_yi_ji_neng_biao.content[0], ['row_id', '角色姓名', '技能', '数值']);
    assert.match(out.sheet_jue_se_shu_zhi_biao.sourceData.ddl, /understanding_level TEXT, -- 了解程度\n {2}grudge_level TEXT, -- 芥蒂程度/);
    assert.equal(out.sheet_cai_yi_ji_neng_biao.orderNo, out.sheet_jue_se_shu_zhi_biao.orderNo + 1);
    assert.ok(igsManagedTablesReady(out));
    assert.ok(!igsManagedTablesReady(base), '基准模板不算 IGS 维护');
    for (const uid of AI_SHEETS) {
        const s = out[uid];
        for (const [field, text] of Object.entries(s.sourceData)) if (typeof text === 'string') assert.doesNotMatch(text, IGS_WORDS, uid + '.' + field);
        const { sourceData: a, content: ca, ...restOut } = s;
        const { sourceData: b, content: cb, ...restBase } = base[uid];
        if (!REWRITTEN.has(uid)) {
            assert.deepEqual(ca, cb, uid + '.content');
            assert.deepEqual(a, b, uid + '.sourceData');
        }
        delete restOut.orderNo; delete restBase.orderNo;
        assert.deepEqual(restOut, restBase, uid);
    }
    const npc = out.sheet_zhong_yao_jue_se_biao;
    assert.ok(!npc.content[0].includes('交互选项') && !npc.sourceData.ddl.includes('interaction_options'));
    const check = out.sheet_jian_ding_jian_yi_biao.sourceData;
    assert.doesNotMatch(JSON.stringify(check), /才艺技能表|base_attributes|special_attributes|基础属性|特殊属性|数值一律|角色属性来源|六维规则|数值范围/);
    assert.match(check.note, /骰子命令只写角色名与技能名，不写任何数值/);
    const mappings = detectStatMappings(parseTables(out)).mappings;
    for (const column of ['好感度', '信任度', '了解程度', '芥蒂程度']) assert.ok(mappings.some((m) => m.table === '角色数值表' && m.column === column), column);
    assert.throws(() => adaptStatsTemplate(out), /stats-template-already-adapted/);
});

test('检定建议表说明里的骰子命令示例都能被解析，且不带数值', { skip: !hasBase && '基准模板不在工作区' }, () => {
    const out = adaptStatsTemplate(JSON.parse(fs.readFileSync(BASE, 'utf8')));
    const lines = out.sheet_jian_ding_jian_yi_biao.sourceData.note.split('\n');
    const commands = lines.filter((l) => /^\s+骰子命令：/.test(l)).map((l) => l.replace(/^\s+骰子命令：/, '').replace('<user>', '阿明').replace('角色名', '小雪'));
    assert.ok(commands.length >= 8);
    for (const c of commands) {
        assert.notEqual(parseDiceCommand(c).kind, 'invalid', c);
        assert.doesNotMatch(c.replace(/奖惩=\S+/, ''), /\d/, c);
    }
    const kinds = commands.map((c) => parseDiceCommand(c).kind);
    assert.ok(kinds.includes('check') && kinds.includes('contest'));
    assert.deepEqual(parseDiceCommand('检定 阿明 照顾'), { kind: 'check', name: '阿明', attribute: '照顾', difficulty: 0, bonus: 0, penalty: 0 });
});

test('锚点对不上（基准模板改版）时抛错，不生成半改版；非法输入可诊断', { skip: !hasBase && '基准模板不在工作区' }, () => {
    const base = () => JSON.parse(fs.readFileSync(BASE, 'utf8'));
    const changed = base();
    changed.sheet_zhong_yao_jue_se_biao.sourceData.note = changed.sheet_zhong_yao_jue_se_biao.sourceData.note.replace('- 当下想法', '- 想法');
    assert.throws(() => adaptStatsTemplate(changed), (e) => e.code === 'stats-template-anchor-missing' && e.sheet === 'sheet_zhong_yao_jue_se_biao');
    const noInteraction = base();
    noInteraction.sheet_zhong_yao_jue_se_biao.content[0] = noInteraction.sheet_zhong_yao_jue_se_biao.content[0].filter((c) => c !== '交互选项');
    assert.throws(() => adaptStatsTemplate(noInteraction), (e) => e.code === 'stats-template-anchor-missing');
    const noField = base();
    delete noField.sheet_zhu_jue_xin_xi_biao.sourceData.note;
    assert.throws(() => adaptStatsTemplate(noField), /stats-template-field-missing/);
    assert.throws(() => adaptStatsTemplate({}), /stats-template-field-missing/);
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

test('写回自动开启判定：适配版模板自动开启，手动开关照旧，旧模板或频率被改回非 0 不自动开启', () => {
    const ready = () => ({
        mate: {},
        a: { uid: 'sheet_a', name: '角色数值表', sourceData: { note: '角色数值表，由 IGS 程序维护。AI 不得填写、修改或删除此表。' }, updateConfig: { updateFrequency: 0 } },
        b: { uid: 'sheet_b', name: '才艺技能表', sourceData: { note: '才艺技能表，由 IGS 程序维护。AI 不得填写、修改或删除此表。' }, updateConfig: { updateFrequency: 0 } },
    });
    assert.equal(statsPushActive(false, ready()), true);
    assert.equal(statsPushActive(true, null), true, '手动开启不依赖读表');
    assert.equal(statsPushActive(false, null), false);
    assert.equal(statsPushActive(false, {}), false);
    const missingSkills = ready(); delete missingSkills.b;
    assert.equal(statsPushActive(false, missingSkills), false);
    const freq = ready(); freq.b.updateConfig.updateFrequency = 1;
    assert.equal(statsPushActive(false, freq), false);
    const oldNote = ready(); oldNote.a.sourceData.note = '记录各角色对主角的关系数值。';
    assert.equal(statsPushActive(false, oldNote), false);
    assert.equal(igsManagedTablesReady(ready()), true);
});
