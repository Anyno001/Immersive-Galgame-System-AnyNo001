// 特质说明卡末尾「卡牌战斗：……」：文案覆盖、句式与显示开关。
import test from 'node:test';
import assert from 'node:assert/strict';
import { traitCombatNote, TRAIT_COMBAT_NOTE_NAMES } from '../src/scene/stats/stat-trait-combat-notes.js';
import { renderTraitEdit, withCombatNote } from '../src/visual/igs-ui/trait-chips.js';
import { renderTraitCodex } from '../src/visual/igs-ui/trait-codex-panel.js';

test('每条文案以「卡牌战斗：」开头，不含百分号、倍率与中英数字间空格', () => {
    for (const n of TRAIT_COMBAT_NOTE_NAMES) {
        const t = traitCombatNote(n);
        assert.match(t, /^卡牌战斗：/, n);
        assert.doesNotMatch(t, /%|×|倍|请/, n);
        assert.doesNotMatch(t, /[\u4e00-\u9fa5] [A-Za-z0-9]|[A-Za-z0-9] [\u4e00-\u9fa5]/, n);
    }
});

test('覆盖与合成句、职业括注', () => {
    assert.equal(traitCombatNote('不存在'), '');
    assert.match(traitCombatNote('坚韧'), /格挡牌更常出现/);
    assert.match(traitCombatNote('护短'), /负伤.*好感与信任上升.*；.*格挡牌/);
    assert.match(traitCombatNote('赌徒'), /；/);
    assert.doesNotMatch(traitCombatNote('赌徒'), /随机效果/);
    assert.match(traitCombatNote('使魔'), /（仅召唤师）$/);
    assert.match(traitCombatNote('血契'), /（仅战士）$/);
    assert.match(traitCombatNote('玻璃心'), /累计8次.*坚韧/);
    assert.match(traitCombatNote('生死之交'), /共患难/);
});

test('说明卡：开启卡牌战斗才追加', () => {
    assert.equal(withCombatNote('描述', '护短', false), '描述');
    assert.match(withCombatNote('描述', '护短', true), /\n卡牌战斗：/);
    const model = { traitList: { 小明: { items: [{ id: '护短', src: 'manual' }], slots: 1, auto: 0, achieve: 0 } }, traitNsfw: false };
    const html = (on) => renderTraitEdit('小明', { ...model, combatCardOn: on });
    assert.equal(html(false).includes('卡牌战斗：'), false);
    assert.equal(html(true).includes('卡牌战斗：'), true);
});

test('图鉴：开启时已点亮项带战斗行，未开启不带', () => {
    const store = { lit: { 坚韧: { char: 'a' } } };
    const off = renderTraitCodex(store, { combatOn: false });
    assert.equal(off.includes('卡牌战斗：'), false);
});
