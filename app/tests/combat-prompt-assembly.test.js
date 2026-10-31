import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTagGrammar, collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';
import { resolvePromptTriggers } from '../src/scene/prompt-triggers.js';
import { findPendingCombatReport, resolveCombatNarrationSegment } from '../src/scene/combat-prompt.js';
import { collectPromptContext } from '../src/host/prompt-context.js';
import { isPromptEntryKey } from '../src/scene/prompt-entries.js';

const BATTLE_ON = { battleFx: { enabled: true } };
const COMBAT_ON = { battleFx: { enabled: true }, combatExpansion: { enabled: true } };
const keys = (rs) => collectGrammarBlocks(rs).map((b) => b.key);
// 非人角色块随战斗演出一起出现（origin/main 合入），按自身条目设置驻留或索引，与卡牌战斗块的驻留规则无关。
const withoutCreature = (list) => list.filter((k) => k !== 'creature');
const report = (result) => `战斗结束\n<igs-combat-report id="c1" result="${result}" encounter="巷口">第1回合……</igs-combat-report>`;

test('扩展关闭时 battle 块的组装结果不变', () => {
    const expand = new Set(['battle']);
    const before = buildTagGrammar({ readerSettings: BATTLE_ON, expand });
    const off = buildTagGrammar({ readerSettings: { ...BATTLE_ON, combatExpansion: { enabled: false } }, expand });
    assert.deepEqual(off, before);
    assert.ok('battle' in before.sizes);
    assert.ok(!('combat' in before.sizes));
    assert.deepEqual(before.expanded, ['battle']);
});

test('扩展开启时出现 combat 块、没有 battle 块；缺省常驻，亲手切成按需后按触发展开', () => {
    assert.ok(keys(COMBAT_ON).includes('combat'));
    assert.ok(!keys(COMBAT_ON).includes('battle'));
    const resident = buildTagGrammar({ readerSettings: COMBAT_ON });
    assert.deepEqual([resident.expanded, withoutCreature(resident.indexed)], [[], []]);
    const quiet = resolvePromptTriggers({ userText: '', recentAiTexts: [] }).report;
    assert.deepEqual([quiet.combat.reason, quiet.battle.active], ['always', false]);
    // 旧存档里规范化补齐的 auto 不算用户选择，仍按缺省常驻；off 照旧整块去掉。
    assert.deepEqual(withoutCreature(buildTagGrammar({ readerSettings: COMBAT_ON, entries: { combat: { mode: 'auto' } } }).indexed), []);
    assert.ok(!('combat' in buildTagGrammar({ readerSettings: COMBAT_ON, entries: { combat: { mode: 'off' } } }).sizes));
    const auto = { combat: { mode: 'auto', modeChosen: true } };
    const idle = buildTagGrammar({ readerSettings: COMBAT_ON, entries: auto });
    assert.deepEqual([idle.expanded, withoutCreature(idle.indexed)], [[], ['combat']]);
    assert.notEqual(idle.system, resident.system);
    const hits = resolvePromptTriggers({ userText: '他们拔刀开战', recentAiTexts: [], entries: auto }).hits;
    assert.ok(hits.has('combat'));
    const shown = buildTagGrammar({ readerSettings: COMBAT_ON, expand: hits, entries: auto });
    assert.deepEqual(shown.expanded, ['combat']);
    assert.ok(shown.depth0.length > 0);
    assert.equal(idle.system, shown.system);
    for (const tag of ['exp|爱丽丝|10', 'awaken|我|怒火|到此为止', 'equip|我|铁剑|武器|旧剑', 'unequip|我|铁剑', 'item|我|药剂|1|回血', 'heal|我|20|包扎']) {
        const tagged = resolvePromptTriggers({ userText: '', recentAiTexts: [`正文[igs-combat:${tag}]`], entries: auto }).hits;
        assert.ok(tagged.has('combat'), tag);
    }
    assert.equal(isPromptEntryKey('combat'), true);
    // 心魔块（origin/main 合入）缺省开启，与卡牌战斗无关；关掉后只剩 combat 块。
    assert.deepEqual(keys({ combatExpansion: { enabled: true }, innerDemon: { enabled: false } }), ['combat']);
});

test('战报待续写时出现 narration 段，三种结果各自对应', () => {
    for (const result of ['win', 'lose', 'escape']) {
        const history = [{ user: false, text: '开战' }, { user: true, text: report(result) }];
        const seg = resolveCombatNarrationSegment(COMBAT_ON, history, { generationType: 'normal' });
        assert.equal(seg.result, result);
        assert.deepEqual([seg.position, seg.depth], ['depth0', 0]);
        assert.ok(seg.id && seg.content);
    }
    const contents = ['win', 'lose', 'escape'].map((r) => resolveCombatNarrationSegment(COMBAT_ON, [{ user: true, text: report(r) }]).content);
    assert.equal(new Set(contents).size, 3);
    assert.equal(resolveCombatNarrationSegment(BATTLE_ON, [{ user: true, text: report('win') }]), null);
});

test('AI 楼出现后 narration 段消失；重写续写楼时仍保留', () => {
    const history = [{ user: true, text: report('lose') }, { user: false, text: '剧情续写……' }];
    assert.equal(resolveCombatNarrationSegment(COMBAT_ON, history, { generationType: 'normal' }), null);
    assert.equal(resolveCombatNarrationSegment(COMBAT_ON, history), null);
    assert.equal(resolveCombatNarrationSegment(COMBAT_ON, history, { generationType: 'swipe' })?.result, 'lose');
    assert.equal(resolveCombatNarrationSegment(COMBAT_ON, history, { generationType: 'regenerate' })?.result, 'lose');
    assert.equal(resolveCombatNarrationSegment(COMBAT_ON, [{ user: true, text: '普通消息' }]), null);
});

test('普通发送时以输入框为准：战报尚未落入聊天也能识别', () => {
    const history = [{ user: true, text: report('win') }, { user: false, text: '已续写' }];
    assert.equal(findPendingCombatReport(history, { generationType: 'normal', inputText: report('escape') })?.result, 'escape');
    assert.equal(findPendingCombatReport([{ user: true, text: report('win') }], { generationType: 'normal', inputText: '继续赶路' }), null);
    const ctx = collectPromptContext({ chat: [{ is_user: true, mes: '旧消息' }] }, { document: { querySelector: () => ({ value: report('win') }) } });
    assert.equal(ctx.inputText, report('win'));
    const empty = collectPromptContext({ chat: [{ is_user: true, mes: report('lose') }] }, { document: { querySelector: () => ({ value: '' }) } });
    assert.deepEqual([empty.inputText, empty.userText], ['', report('lose')]);
    assert.equal(findPendingCombatReport(empty.history, { generationType: 'normal', inputText: empty.inputText })?.result, 'lose');
});


import { CHECK_ROLLS_SEGMENT_ID, checkCorrections, checkRollsFor, resolveCheckRollsSegment } from '../src/scene/check-rolls.js';

test('每楼骰序段只在战斗扩展开启且骰序完整时注入 depth0；更正与在场加值进入同一段', () => {
    const rolls = checkRollsFor('chat-1', 3);
    assert.equal(resolveCheckRollsSegment(BATTLE_ON, { rolls }), null);
    assert.equal(resolveCheckRollsSegment(COMBAT_ON, { rolls: null }), null);
    assert.equal(resolveCheckRollsSegment(COMBAT_ON, { rolls: rolls.slice(0, 9) }), null);
    const seg = resolveCheckRollsSegment(COMBAT_ON, { rolls });
    assert.deepEqual([seg.id, seg.position, seg.depth, seg.rolls], [CHECK_ROLLS_SEGMENT_ID, 'depth0', 0, rolls]);
    const hero = { scores: { str: 16, dex: 10, con: 12, int: 8, wis: 10, cha: 10 }, prefs: { major: 'str', minor: 'con' }, proficiency: 2 };
    const withActors = resolveCheckRollsSegment(COMBAT_ON, { rolls, actors: [{ name: '我', attr: hero }] });
    assert.notEqual(withActors.content, seg.content);
    // 属性视图不完整的人物不列加值，与没有在场人物时一致。
    assert.equal(resolveCheckRollsSegment(COMBAT_ON, { rolls, actors: [{ name: '路人', attr: { scores: { str: 10 } } }] }).content, seg.content);
    const corrections = checkCorrections([{ mismatch: true, actor: '我', label: '力量', dc: 12, die: 5, bonus: 5, total: 10, tier: '失败', written: '成功' }, { mismatch: false }]);
    assert.equal(corrections.length, 1);
    assert.notEqual(resolveCheckRollsSegment(COMBAT_ON, { rolls, corrections }).content, seg.content);
});

test('数值段接管注入时（combatMerged）combat 块仍在、只留装备与道具，索引随之收窄；未接管时与原组装一致', () => {
    const full = buildTagGrammar({ readerSettings: COMBAT_ON });
    const merged = buildTagGrammar({ readerSettings: { ...COMBAT_ON, combatMerged: true } });
    assert.ok('combat' in merged.sizes);
    assert.ok(merged.sizes.combat < full.sizes.combat);
    const block = collectGrammarBlocks({ ...COMBAT_ON, combatMerged: true }).find((b) => b.key === 'combat');
    assert.ok(!/igs-combat:start\|/.test(block.full));
    assert.ok(/igs-combat:equip\|/.test(block.full));
    assert.ok(!/start|heal/.test(block.index));
    assert.deepEqual(buildTagGrammar({ readerSettings: { ...COMBAT_ON, combatMerged: false } }), full);
});
