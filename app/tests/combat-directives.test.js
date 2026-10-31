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
        '[igs-combat:mend|鲍勃|10]',
        '[igs-combat:start|伏击|狼]',
    ].join('\n');
    const { directives, diagnostics } = extractGrowthDirectives(text);
    assert.deepEqual(directives.map((d) => [d.kind, d.character, d.skill || d.className]), [
        ['learn', '爱丽丝', '冰棱术'], ['upgrade', '爱丽丝', '冰棱术'], ['class', '鲍勃', '圣骑士'],
    ]);
    assert.equal(directives[0].description, '从古籍中领悟');
    assert.equal(directives[1].description, '');
    assert.deepEqual(diagnostics.map((d) => `${d.code}:${d.kind}`), ['combat-tag-invalid:exp', 'combat-tag-unknown:mend']);
});

test('剧情回血标签：点数或百分比（全角数字与 ％ 都认），不设每楼上限；非法恢复量只记诊断', () => {
    const text = '[igs-combat:heal|我|20|包扎]正文[igs-combat:heal|鲍勃|５０％]\n[igs-combat:heal|我|9999]\n[igs-combat:heal|我|0]\n[igs-combat:heal|我|101%]\n[igs-combat:heal|我]';
    const { directives, diagnostics } = extractGrowthDirectives(text);
    assert.deepEqual(directives.map((d) => [d.kind, d.character, d.amount, d.mode, d.reason]), [
        ['heal', '我', 20, 'flat', '包扎'], ['heal', '鲍勃', 50, 'percent', ''], ['heal', '我', 9999, 'flat', ''],
    ]);
    assert.deepEqual(diagnostics.map((d) => `${d.code}:${d.field}:${d.problem}`), Array(3).fill('combat-tag-invalid:amount:invalid-amount'));
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

const AWAKEN = '[igs-combat:awaken|我|怒火|绝不让你们得逞！]';

test('觉醒标签紧邻开战标签上一行时并入 start，不改开战锚点、不进成长账本', () => {
    const plain = extractCombatStart(`正文。\n${START}`).start;
    const r = extractCombatStart(`正文。\n${AWAKEN}\n\n${START}\n`);
    assert.deepEqual(r.diagnostics, []);
    assert.deepEqual([r.start.awaken.character, r.start.awaken.type, r.start.awaken.line], ['我', 'rage', '绝不让你们得逞！']);
    assert.deepEqual([r.start.tagHash, r.start.occurrence, r.start.encounter], [plain.tagHash, plain.occurrence, plain.encounter]);
    assert.equal(plain.awaken, undefined);
    assert.equal(extractCombatStart(`正文。\n[igs-combat:awaken|我|rage]\n${START}`).start.awaken.line, '');
    assert.equal(extractCombatStart(`正文。\n【igs-combat：awaken｜我｜决意｜到此为止】\n${START}`).start.awaken.type, 'resolve');
    assert.deepEqual(extractGrowthDirectives(`${AWAKEN}\n${START}`), { directives: [], diagnostics: [] });
});

test('觉醒标签不紧邻、多写或栏位非法时不生效，只记诊断，开战照常', () => {
    const run = (text) => {
        const r = extractCombatStart(text);
        assert.ok(r.start, text);
        return [r.start.awaken?.type ?? null, r.diagnostics.map((d) => (d.field ? `${d.code}:${d.field}:${d.problem}` : d.code))];
    };
    assert.deepEqual(run(`${AWAKEN}\n正文。\n${START}`), [null, ['combat-awaken-misplaced']]);
    assert.deepEqual(run(`正文。${AWAKEN}\n${START}`), [null, ['combat-awaken-misplaced']]);
    assert.deepEqual(run(`[igs-combat:awaken|我|守护]\n${AWAKEN}\n${START}`), ['rage', ['combat-awaken-misplaced']]);
    assert.deepEqual(run(`[igs-combat:awaken|我|狂暴]\n${START}`), [null, ['combat-awaken-invalid:type:unknown-type']]);
    assert.deepEqual(run(`[igs-combat:awaken|我]\n${START}`), [null, ['combat-awaken-invalid:type:required']]);
    assert.deepEqual(run(`[igs-combat:awaken||怒火]\n${START}`), [null, ['combat-awaken-invalid:character:required']]);
    assert.deepEqual(run(`[igs-combat:awaken|我|怒火|${'喝'.repeat(31)}]\n${START}`), [null, ['combat-awaken-invalid:line:too-long']]);
    assert.deepEqual(run(`[igs-combat:awaken|我|怒火|喝|多余]\n${START}`), [null, ['combat-awaken-invalid:fields:too-many-fields']]);
    assert.equal(extractCombatStart(`${START}\n${AWAKEN}`).start, null);
});


test('标签上限与 COMBAT_RULES 保持一致', () => {
    assert.equal(COMBAT_TAG_LIMITS.maxEnemies, COMBAT_RULES.maxEnemies);
    assert.equal(COMBAT_TAG_LIMITS.maxAllies, COMBAT_RULES.maxAllies);
    assert.equal(COMBAT_TAG_LIMITS.storyExpCapPerFloor, COMBAT_RULES.storyExpCapPerFloor);
});

test('六维与相对档词表与 combat/abilities.js 一致', () => {
    for (const [word, key] of Object.entries(COMBAT_ABILITY_WORDS)) {
        if (key === 'free') continue;
        assert.equal(abilityKeyOf(word), key, word);
    }
    assert.deepEqual(new Set(Object.values(COMBAT_ABILITY_WORDS).filter((k) => k !== 'free')), new Set(ABILITY_KEYS));
    for (const [word, key] of Object.entries(COMBAT_REL_TIERS)) assert.equal(relTierOf(word), key, word);
    assert.deepEqual(new Set(Object.values(COMBAT_REL_TIERS)), new Set(Object.keys(REL_TIERS)));
});

test('rel 与 stat 标签：解析档位与属性，未知值只记诊断，stat 每楼每角色合计不超过 2', () => {
    const text = [
        '[igs-combat:rel|黑衣人|强敌]',
        '[igs-combat:rel|小贩|无敌]',
        '[igs-combat:stat|爱丽丝|力量|1|晨练]',
        '[igs-combat:stat|爱丽丝|体质|2|服药]',
        '[igs-combat:stat|爱丽丝|速度|1]',
        '[igs-combat:stat|鲍勃|自由|3]',
    ].join('\n');
    const { directives, diagnostics } = extractGrowthDirectives(text, { raw: true });
    assert.deepEqual(directives.map((d) => [d.kind, d.character, d.tier ?? d.ability, d.amount]), [
        ['rel', '黑衣人', 'formidable', undefined],
        ['stat', '爱丽丝', 'str', 1],
        ['stat', '爱丽丝', 'con', 1],
    ]);
    assert.equal(directives[1].reason, '晨练');
    assert.deepEqual(diagnostics.map((d) => [d.code, d.field ?? d.granted, d.problem ?? d.requested]), [
        ['combat-tag-invalid', 'tier', 'unknown-tier'],
        ['combat-stat-capped', 1, 2],
        ['combat-tag-invalid', 'ability', 'unknown-ability'],
        ['combat-tag-invalid', 'amount', 'invalid-amount'],
    ]);
});

import { COMBAT_ABILITY_WORDS, COMBAT_REL_TIERS } from '../src/scene/combat-directives.js';
import { ABILITY_KEYS, REL_TIERS, abilityKeyOf, relTierOf } from '../src/combat/abilities.js';


test('装备与道具标签：部位与数量解析，非法部位与超量只记诊断', () => {
    const text = [
        '[igs-combat:equip|我|青锋剑|武器|削铁如泥]',
        '[igs-combat:equip|爱丽丝|月环|accessory]',
        '[igs-combat:unequip|我|旧剑]',
        '[igs-combat:item|我|回春丹]',
        '[igs-combat:item|我|爆炎符|３|火]',
        '[igs-combat:equip|我|腰带|腰部]',
        '[igs-combat:item|我|毒针|4]',
        '[igs-combat:equip|我|剑]',
    ].join('\n');
    const { directives, diagnostics } = extractGrowthDirectives(text);
    assert.deepEqual(directives.map((d) => [d.kind, d.character, d.name, d.slot ?? d.count ?? null]), [
        ['equip', '我', '青锋剑', 'weapon'], ['equip', '爱丽丝', '月环', 'accessory'], ['unequip', '我', '旧剑', null], ['item', '我', '回春丹', 1], ['item', '我', '爆炎符', 3],
    ]);
    assert.equal(directives[0].description, '削铁如泥');
    assert.deepEqual(diagnostics.map((d) => `${d.code}:${d.kind}:${d.field}:${d.problem}`),
        ['combat-tag-invalid:equip:slot:unknown-slot', 'combat-tag-invalid:item:count:invalid-count', 'combat-tag-invalid:equip:slot:required']);
});
test('获得物稀有度末栏：equip / item / learn 可省略，中文与内部键都认；未登记稀有度与 upgrade 多栏只记诊断', () => {
    const text = [
        '[igs-combat:equip|我|龙鳞甲|防具|龙鳞所制|史诗]',
        '[igs-combat:equip|我|青锋剑|武器|削铁如泥]',
        '[igs-combat:item|我|回春丹|2|疗伤|rare]',
        '[igs-combat:item|我|爆炎符|1||]',
        '[igs-combat:learn|我|冰棱术|从古籍中领悟|神话]',
        '[igs-combat:learn|我|火球术|自学]',
        '[igs-combat:equip|我|腰带|饰品|旧物|传说]',
        '[igs-combat:upgrade|我|冰棱术|更冷|稀有]',
    ].join('\n');
    const { directives, diagnostics } = extractGrowthDirectives(text);
    assert.deepEqual(directives.map((d) => [d.kind, d.name ?? d.skill, d.rarity ?? null]), [
        ['equip', '龙鳞甲', 'epic'], ['equip', '青锋剑', null], ['item', '回春丹', 'rare'], ['item', '爆炎符', null], ['learn', '冰棱术', 'mythic'], ['learn', '火球术', null],
    ]);
    assert.equal(Object.hasOwn(directives[1], 'rarity'), false);
    assert.equal(Object.hasOwn(directives[5], 'rarity'), false);
    assert.deepEqual(diagnostics.map((d) => `${d.code}:${d.kind}:${d.field}:${d.problem}`),
        ['combat-tag-invalid:equip:rarity:unknown-rarity', 'combat-tag-invalid:upgrade:fields:too-many-fields']);
});

test('loot 标签：战报 ID、槽位与套别（缺省 main）；非法栏位只记诊断', () => {
    const text = [
        '[igs-combat:loot|我|r1a2b|0|main]', '[igs-combat:loot|我|r1a2b|3|reserve]', '[igs-combat:loot|我|r1a2b|1]',
        '[igs-combat:loot|我|c1|0]', '[igs-combat:loot|我|r1a2b|4]', '[igs-combat:loot|我|r1a2b|0|spare]',
    ].join('\n');
    const { directives, diagnostics } = extractGrowthDirectives(text, { raw: true, expCap: false });
    assert.deepEqual(directives.map((d) => [d.kind, d.character, d.reportId, d.slot, d.set]), [
        ['loot', '我', 'r1a2b', 0, 'main'], ['loot', '我', 'r1a2b', 3, 'reserve'], ['loot', '我', 'r1a2b', 1, 'main'],
    ]);
    assert.deepEqual(diagnostics.map((d) => `${d.code}:${d.field}:${d.problem}`),
        ['combat-tag-invalid:reportId:invalid-report-id', 'combat-tag-invalid:slot:invalid-slot', 'combat-tag-invalid:set:unknown-set']);
});




import { CHECK_ROLL_COUNT, checkRollsFor, floorCheckOrdinal, floorCheckSwipe, replayChecks, upcomingCheckOrdinal, upcomingCheckSwipe } from '../src/scene/check-rolls.js';
import { d20Outcome } from '../src/choices/dice-check.js';

test('正文判定楼号：同楼 swipe / 重新生成同号，新楼 +1，代写与静默不出骰序', () => {
    const chat = [{ is_user: false, mes: '开场' }, { is_user: true, mes: '出发' }, { is_user: false, mes: '前文', is_system: true }];
    assert.equal(upcomingCheckOrdinal(chat, 'normal'), 3);
    assert.equal(upcomingCheckOrdinal(chat, 'swipe'), 2);
    // 宿主在事件前后删除被重写楼两种情形都得到同一楼号。
    assert.equal(upcomingCheckOrdinal(chat, 'regenerate'), 2);
    assert.equal(upcomingCheckOrdinal(chat.slice(0, 2), 'regenerate'), 2);
    assert.equal(upcomingCheckOrdinal(chat, 'quiet'), null);
    assert.equal(upcomingCheckOrdinal(chat, 'impersonate'), null);
    assert.deepEqual([floorCheckOrdinal(chat, 2), floorCheckOrdinal(chat, 1), floorCheckOrdinal(chat, 9)], [2, null, null]);
    const rolls = checkRollsFor('chat-1', 2);
    assert.equal(rolls.length, CHECK_ROLL_COUNT);
    assert.ok(rolls.every((d) => Number.isInteger(d) && d >= 1 && d <= 20));
    assert.deepEqual(checkRollsFor('chat-1', 2), rolls);
    assert.notDeepEqual(checkRollsFor('chat-1', 3), rolls);
    assert.notDeepEqual(checkRollsFor('chat-2', 2), rolls);
    assert.deepEqual([checkRollsFor('', 2), checkRollsFor('chat-1', 0)], [null, null]);
});

test('骰序种子含 swipe（合并计划 Q3）：swipe 0 与旧版相同；换 swipe 换一组，继续生成沿用本 swipe', () => {
    const base = checkRollsFor('chat-1', 2);
    assert.deepEqual(checkRollsFor('chat-1', 2, 0), base);
    assert.notDeepEqual(checkRollsFor('chat-1', 2, 1), base);
    assert.deepEqual(checkRollsFor('chat-1', 2, 1), checkRollsFor('chat-1', 2, 1));
    const chat = [{ is_user: false, mes: '开场' }, { is_user: true, mes: '出发' }, { is_user: false, mes: '新 swipe', swipe_id: 2 }];
    assert.deepEqual([upcomingCheckSwipe(chat, 'swipe'), upcomingCheckSwipe(chat, 'continue'), upcomingCheckSwipe(chat, 'normal'), upcomingCheckSwipe(chat, 'regenerate'), upcomingCheckSwipe(chat, 'quiet')], [2, 2, 0, 0, null]);
    assert.deepEqual([floorCheckSwipe(chat, 2), floorCheckSwipe(chat, 0), floorCheckSwipe(chat, 1)], [2, 0, null]);
});

test('正文判定复算：按出现顺序取骰，非法标签占序号，第 11 次起不计，写法不符记诊断', () => {
    const rolls = checkRollsFor('chat-1', 2);
    const hero = { scores: { str: 16, dex: 10, con: 12, int: 8, wis: 10, cha: 10 }, prefs: { major: 'str', minor: 'con' }, proficiency: 2 };
    const tags = Array.from({ length: 11 }, (_, i) => (i === 1 ? '[igs-check:我|运气|12]' : `[igs-check:我|力量|${10 + i}]`));
    const body = `${tags[0]}成功推开石门。${tags.slice(1).join('。')}。[igs-check:路人|敏捷|10]`;
    const { results, diagnostics } = replayChecks({ body, rolls, readAbilities: (name) => (name === '我' ? hero : null) });
    assert.deepEqual(results.map((r) => [r.order, r.die, r.bonus, r.dc]), [1, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, rolls[n - 1], 5, 10 + n - 1]));
    const first = d20Outcome(rolls[0], 5, 10);
    assert.deepEqual([results[0].written, results[0].mismatch, results[0].tier], ['成功', !first.success, first.tier]);
    assert.deepEqual(diagnostics.filter((d) => d.code !== 'check-mismatch').map((d) => [d.code, d.order]), [
        ['check-tag-invalid', 2], ['check-over-limit', 11], ['check-over-limit', 12],
    ]);
    assert.equal(diagnostics.some((d) => d.code === 'check-mismatch'), !first.success);
    const unknown = replayChecks({ body: '[igs-check:路人|敏捷|10]', rolls, readAbilities: () => null });
    assert.deepEqual([unknown.results, unknown.diagnostics.map((d) => d.code)], [[], ['check-actor-unknown']]);
    assert.deepEqual(replayChecks({ body: tags[0], rolls: null }).diagnostics.map((d) => d.code), ['check-rolls-missing']);
    assert.deepEqual(replayChecks({ body: '没有判定', rolls }), { results: [], diagnostics: [] });
    assert.equal(stripMarkerDirectives(`他推门${tags[0]}成功了。`), '他推门成功了。');
    assert.equal(isMarkerDirectiveLine(tags[0]), true);
});

test('每楼 10 对 d20（合并计划 P3 选 B）：第一颗与旧骰序一致；第 4 栏优势取大、劣势取小，非法写法记诊断', async () => {
    const { checkRollPairsFor, pickDie, resolveCheckRollsSegment } = await import('../src/scene/check-rolls.js');
    const pairs = checkRollPairsFor('chat-1', 2);
    assert.deepEqual(pairs.map((p) => p[0]), checkRollsFor('chat-1', 2));
    assert.ok(pairs.every((p) => p.length === 2 && p.every((d) => Number.isInteger(d) && d >= 1 && d <= 20)));
    assert.deepEqual(checkRollPairsFor('chat-1', 2, 1), checkRollPairsFor('chat-1', 2, 1));
    assert.notDeepEqual(checkRollPairsFor('chat-1', 2, 1), pairs);
    assert.deepEqual([pickDie([3, 18], 1), pickDie([3, 18], -1), pickDie([3, 18], 0), pickDie(7, 1)], [18, 3, 3, 7]);
    const hero = { scores: { str: 16, dex: 10, con: 12, int: 8, wis: 10, cha: 10 }, prefs: { major: 'str', minor: 'con' }, proficiency: 2 };
    const { results, diagnostics } = replayChecks({ body: '[igs-check:我|力量|10|优势][igs-check:我|力量|10|劣势][igs-check:我|力量|10|很好]', rolls: pairs, readAbilities: () => hero });
    assert.deepEqual(results.map((r) => [r.edge, r.die]), [[1, Math.max(...pairs[0])], [-1, Math.min(...pairs[1])]]);
    assert.deepEqual(diagnostics.map((d) => [d.code, d.problem]), [['check-tag-invalid', 'invalid-edge']]);
    assert.equal(resolveCheckRollsSegment({}, { rolls: pairs }), null);
    const seg = resolveCheckRollsSegment({}, { rolls: pairs, statsActive: true, edges: [{ name: '我', edge: -1, reasons: ['状态不佳'] }] });
    assert.ok(seg.content.includes(`${pairs[0][0]}/${pairs[0][1]}`));
    assert.ok(seg.content.includes('我劣势（状态不佳）'));
});



test('统一获得物：带类别的获得标签解析为装备 / 道具 / 杂物并归主角；没有类别的旧写法与失去不入账；稀有度写错只记诊断', async () => {
    const { extractGainDirectives, scanGainTags } = await import('../src/scene/combat-directives.js');
    const text = [
        '[igs-fx:item|获得|青锋剑|削铁如泥|武器|稀有]',
        '[igs-fx:item|获得|回春丹|疗伤|道具]',
        '[igs-fx:item|获得|旧发绳|母亲留下的|杂物]',
        '[igs-fx:item|获得|黄铜钥匙|旧钥匙]',
        '[igs-fx:item|失去|青锋剑||武器]',
        '[igs-fx:item|获得|龙鳞甲||防具|传说]',
    ].join('\n');
    const { directives, diagnostics } = extractGainDirectives(text);
    assert.deepEqual(directives.map((d) => [d.kind, d.character, d.name, d.slot ?? d.count ?? d.origin, d.rarity ?? null]), [
        ['equip', '我', '青锋剑', 'weapon', 'rare'], ['item', '我', '回春丹', 1, null], ['keepsake', '我', '旧发绳', '母亲留下的', null],
    ]);
    assert.deepEqual(diagnostics.map((d) => [d.code, d.field]), [['combat-gain-invalid', 'rarity']]);
    const tags = scanGainTags(text);
    assert.equal(tags.length, 4);
    // 获得标签的锚点与 igs-combat 标签分属不同命名空间。
    assert.ok(!scanCombatTags(text).length);
    assert.equal(new Set(tags.map((t) => t.tagHash)).size, 4);
});
