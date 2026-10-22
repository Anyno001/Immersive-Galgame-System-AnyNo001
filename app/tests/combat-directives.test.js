import test from 'node:test';
import assert from 'node:assert/strict';
import {
    COMBAT_TAG_LIMITS, combatBodyText, extractCombatStart, extractGrowthDirectives, scanCombatTags,
} from '../src/scene/combat-directives.js';
import { hasIgsDirectiveTags, isMarkerDirectiveLine, stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { readerBodyText } from '../src/scene/message-source.js';
import { COMBAT_RULES } from '../src/combat/rules.js';
import { normalizeLedgerEntry } from '../src/combat/schema.js';

const START = '[igs-combat:start|巷口伏击|哥布林首领,哥布林*2|爱丽丝|精英]';
const codes = (result) => result.diagnostics.map((d) => d.code);

test('开战标签在末行时生效并解析全部栏位', () => {
    const { start, diagnostics } = extractCombatStart(`巷子里传来脚步声。\n\n${START}\n`);
    assert.deepEqual(diagnostics, []);
    assert.equal(start.encounter, '巷口伏击');
    assert.deepEqual(start.enemies, [{ name: '哥布林首领', count: 1 }, { name: '哥布林', count: 2 }]);
    assert.deepEqual(start.allies, ['爱丽丝']);
    assert.equal(start.tier, 'elite');
    assert.equal(start.occurrence, 0);
    const minimal = extractCombatStart('正文。\n[igs-combat:start|狭路|狼]').start;
    assert.deepEqual([minimal.allies, minimal.tier], [[], 'normal']);
});

test('开战标签不在末尾时不触发，记录 combat-start-not-tail', () => {
    const middle = extractCombatStart(`前文。\n${START}\n后面还有正文。`);
    assert.equal(middle.start, null);
    assert.deepEqual(codes(middle), ['combat-start-not-tail']);
    const inline = extractCombatStart(`他拔出刀。${START}`);
    assert.equal(inline.start, null);
    assert.deepEqual(codes(inline), ['combat-start-not-tail']);
});

test('末尾判定先剔除 HTML 卡片、生图标记与正文外的排除块', () => {
    const card = `正文。\n${START}\n<htm1fenge><div>状态卡</div></htm1fenge>`;
    assert.equal(extractCombatStart(card).start?.encounter, '巷口伏击');
    const image = `正文。\n${START}\n[igs-img:1]\n<IMG>2</IMG>`;
    assert.equal(extractCombatStart(image).start?.encounter, '巷口伏击');
    const tagged = `<thinking>[igs-combat:start|草稿|狼]</thinking><content>正文。\n${START}</content><Status_block>HP</Status_block>`;
    const result = extractCombatStart(tagged);
    assert.equal(result.start?.encounter, '巷口伏击');
    assert.deepEqual(result.diagnostics, []);
    const wide = extractCombatStart('正文。\n【igs-combat：start｜狭路｜狼】');
    assert.equal(wide.start?.encounter, '狭路');
});

test('同楼多个开战标签只认末行那一个', () => {
    const result = extractCombatStart(`[igs-combat:start|误写|狼]\n正文。\n${START}`);
    assert.equal(result.start.encounter, '巷口伏击');
    assert.deepEqual(codes(result), ['combat-start-not-tail']);
    assert.equal(result.diagnostics[0].index, 0);
});

test('开战栏位缺失或超限时拒收，并指出栏位', () => {
    const fail = (tag) => {
        const result = extractCombatStart(`正文。\n${tag}`);
        assert.equal(result.start, null, tag);
        const d = result.diagnostics.find((x) => x.code === 'combat-start-invalid');
        return d && `${d.field}:${d.problem}`;
    };
    assert.equal(fail('[igs-combat:start]'), 'encounter:required');
    assert.equal(fail('[igs-combat:start|伏击]'), 'enemies:required');
    assert.equal(fail('[igs-combat:start|伏击|狼*6]'), 'enemies:too-many');
    assert.equal(fail('[igs-combat:start|伏击|狼*3,熊*3]'), 'enemies:too-many');
    assert.equal(fail('[igs-combat:start|伏击|狼*0]'), 'enemies:invalid-count');
    assert.equal(fail('[igs-combat:start|伏击|狼|甲,乙,丙,丁]'), 'allies:too-many');
    assert.equal(fail('[igs-combat:start|伏击|狼||传说]'), 'tier:unknown-tier');
    assert.equal(fail('[igs-combat:start|伏击|狼||普通|多余]'), 'fields:too-many-fields');
    assert.equal(fail(`[igs-combat:start|${'长'.repeat(21)}|狼]`), 'encounter:too-long');
    assert.deepEqual(extractCombatStart('正文。\n[igs-combat:start|伏击|狼＊３]').start.enemies, [{ name: '狼', count: 3 }]);
});

test('成长标签解析各栏位，非法与未知标签只记诊断', () => {
    const text = [
        '[igs-combat:learn|爱丽丝|冰棱术|从古籍中领悟]',
        '中间的正文。[igs-combat:upgrade|爱丽丝|冰棱术]',
        '[igs-combat:class|鲍勃|圣骑士]',
        '[igs-combat:exp|鲍勃|很多]',
        '[igs-combat:heal|鲍勃|10]',
        '[igs-combat:start|伏击|狼]',
    ].join('\n');
    const { directives, diagnostics } = extractGrowthDirectives(text);
    assert.deepEqual(directives.map((d) => [d.kind, d.character, d.skill || d.className]), [
        ['learn', '爱丽丝', '冰棱术'], ['upgrade', '爱丽丝', '冰棱术'], ['class', '鲍勃', '圣骑士'],
    ]);
    assert.equal(directives[0].description, '从古籍中领悟');
    assert.equal(directives[1].description, '');
    assert.deepEqual(diagnostics.map((d) => `${d.code}:${d.kind}`), ['combat-tag-invalid:exp', 'combat-tag-unknown:heal']);
});

test('剧情 EXP 每楼每角色封顶截断，战报楼可跳过封顶', () => {
    const text = '[igs-combat:exp|爱丽丝|30|救人]正文[igs-combat:exp|爱丽丝|40|守门]\n[igs-combat:exp|爱丽丝|5]\n[igs-combat:exp|鲍勃|１０]';
    const { directives, diagnostics } = extractGrowthDirectives(text);
    assert.deepEqual(directives.map((d) => [d.character, d.amount]), [['爱丽丝', 30], ['爱丽丝', 20], ['鲍勃', 10]]);
    assert.deepEqual(diagnostics.map((d) => [d.code, d.requested, d.granted]), [['combat-exp-capped', 40, 20], ['combat-exp-capped', 5, 0]]);
    const report = extractGrowthDirectives('[igs-combat:exp|爱丽丝|120|战斗:c1]', { expCap: false });
    assert.deepEqual([report.directives[0].amount, report.diagnostics], [120, []]);
});

test('锚点稳定：反复解析一致，重复标签按 occurrence 区分，符合日志 ID 格式', () => {
    const text = '[igs-combat:exp|爱丽丝|10|帮忙]一段。[igs-combat:exp| 爱丽丝 |10| 帮忙 ]';
    const first = extractGrowthDirectives(text).directives;
    assert.deepEqual(extractGrowthDirectives(text).directives, first);
    assert.equal(first[0].tagHash, first[1].tagHash);
    assert.deepEqual(first.map((d) => d.occurrence), [0, 1]);
    const shifted = extractGrowthDirectives(`前面插入了一段新的正文。\n${text}`).directives;
    assert.deepEqual(shifted.map((d) => [d.tagHash, d.occurrence]), first.map((d) => [d.tagHash, d.occurrence]));
    assert.notEqual(extractGrowthDirectives('[igs-combat:exp|爱丽丝|11|帮忙]').directives[0].tagHash, first[0].tagHash);
    const entry = normalizeLedgerEntry({
        id: 'exp|pc-1|3|0|x|0', type: 'exp', character: 'pc-1', createdAt: 1,
        anchor: { messageId: 3, swipeId: 0, tagHash: first[1].tagHash, occurrence: first[1].occurrence },
        payload: { amount: first[1].amount, reason: first[1].reason },
    });
    assert.equal(entry.ok, true, JSON.stringify(entry.errors));
    assert.deepEqual(scanCombatTags(combatBodyText(text)).map((t) => t.kind), ['exp', 'exp']);
});

test('战斗标签从显示中剥离，不进入正文与场景指令', () => {
    assert.equal(hasIgsDirectiveTags('x[igs-combat:exp|a|1]'), true);
    assert.equal(stripMarkerDirectives('前[igs-combat:exp|爱丽丝|10]后').trim(), '前后');
    assert.equal(stripMarkerDirectives('前[igs-combat:start|伏击\n下一行'), '前\n下一行');
    assert.equal(isMarkerDirectiveLine(START), true);
    const scene = extractSceneDirectives(`[igs-combat:exp|爱丽丝|10][igs-char:爱丽丝|惊讶|啊！]\n${START}`);
    assert.deepEqual(scene.directives.map((d) => d.type), ['char']);
    assert.ok(readerBodyText('正文。\n【igs-combat：exp｜爱丽丝｜10】').includes('[igs-combat:exp|爱丽丝|10]'));
});

test('标签上限与 COMBAT_RULES 保持一致', () => {
    assert.equal(COMBAT_TAG_LIMITS.maxEnemies, COMBAT_RULES.maxEnemies);
    assert.equal(COMBAT_TAG_LIMITS.maxAllies, COMBAT_RULES.maxAllies);
    assert.equal(COMBAT_TAG_LIMITS.storyExpCapPerFloor, COMBAT_RULES.storyExpCapPerFloor);
});
