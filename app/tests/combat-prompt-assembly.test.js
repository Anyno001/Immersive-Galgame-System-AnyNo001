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

test('扩展开启时出现 combat 块、没有 battle 块，按需展开', () => {
    assert.ok(keys(COMBAT_ON).includes('combat'));
    assert.ok(!keys(COMBAT_ON).includes('battle'));
    const idle = buildTagGrammar({ readerSettings: COMBAT_ON });
    assert.deepEqual([idle.expanded, idle.indexed], [[], ['combat']]);
    const hits = resolvePromptTriggers({ userText: '他们拔刀开战', recentAiTexts: [] }).hits;
    assert.ok(hits.has('combat'));
    const shown = buildTagGrammar({ readerSettings: COMBAT_ON, expand: hits });
    assert.deepEqual(shown.expanded, ['combat']);
    assert.ok(shown.depth0.length > 0);
    assert.equal(idle.system, shown.system);
    const tagged = resolvePromptTriggers({ userText: '', recentAiTexts: ['正文[igs-combat:exp|爱丽丝|10]'] }).hits;
    assert.ok(tagged.has('combat'));
    assert.equal(isPromptEntryKey('combat'), true);
    assert.deepEqual(keys({ combatExpansion: { enabled: true } }), ['combat']);
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
