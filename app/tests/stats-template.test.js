import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATS_TEMPLATE_EDITS, adaptStatsTemplate } from '../src/data/shujuku/stats-template-adapt.js';
import { parseTables } from '../src/data/shujuku/table-parser.js';
import { detectStatMappings } from '../src/data/shujuku/stats-push.js';
import { downloadStatsTemplate, statsTemplateUrl } from '../src/visual/igs-ui/stats-template-link.js';

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
    return t;
}

test('适配版只改约定的规则字段；其余表、列、DDL、导出配置不变；不改入参；适配后仍零配置识别（§8C）', { skip: !hasBase && '基准模板不在工作区' }, () => {
    const raw = fs.readFileSync(BASE, 'utf8');
    const base = JSON.parse(raw);
    const out = adaptStatsTemplate(base);
    assert.equal(JSON.stringify(base), JSON.stringify(JSON.parse(raw)));
    const edited = new Set(STATS_TEMPLATE_EDITS.map((e) => `${e.sheet}|${e.field}`));
    for (const key of Object.keys(base)) {
        const { sourceData: a, ...restOut } = out[key] || {};
        const { sourceData: b, ...restBase } = base[key] || {};
        assert.deepEqual(restOut, restBase, key);
        for (const field of Object.keys(b || {})) if (!edited.has(`${key}|${field}`)) assert.deepEqual(a[field], b[field], `${key}.${field}`);
    }
    const values = out.sheet_jue_se_shu_zhi_biao.sourceData;
    assert.doesNotMatch(values.updateNode, /单次事件变动/);
    assert.match(values.updateNode, /禁止修改/);
    assert.match(values.initNode, /一律填 0%/);
    assert.doesNotMatch(out.sheet_jian_ding_jian_yi_biao.sourceData.note, /成长后属性|成长检定/);
    assert.doesNotMatch(out.sheet_zhu_jue_xin_xi_biao.sourceData.updateNode, /base_attributes/);
    assert.match(out.sheet_zhong_yao_jue_se_biao.sourceData.updateNode, /只在登场建档时填写一次/);
    const mappings = detectStatMappings(parseTables(out)).mappings;
    for (const column of ['好感度', '信任度', '了解程度']) assert.ok(mappings.some((m) => m.table === '角色数值表' && m.column === column), column);
    assert.throws(() => adaptStatsTemplate(out), /stats-template-already-adapted/);
});

test('锚点对不上（基准模板改版）时抛错，不生成半改版；非法输入可诊断', () => {
    assert.ok(adaptStatsTemplate(synthetic()));
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

test('下载入口：地址相对 bundle 指向 ./templates/，触发一次下载后移除临时链接；没有 document 时返回原因', () => {
    const url = statsTemplateUrl('https://cdn.example/igs/dist/igs.bundle.js');
    assert.match(url, /^https:\/\/cdn\.example\/igs\/dist\/templates\/TavernDB_template_/);
    const clicks = [];
    const body = { children: [], appendChild(n) { this.children.push(n); }, removeChild(n) { this.children = this.children.filter((x) => x !== n); } };
    const doc = { body, createElement: () => ({ click() { clicks.push(this.href); } }) };
    assert.deepEqual(downloadStatsTemplate(doc, url), { ok: true, url });
    assert.deepEqual(clicks, [url]);
    assert.equal(body.children.length, 0);
    assert.equal(downloadStatsTemplate(null).reason, 'stats-template-no-document');
});
