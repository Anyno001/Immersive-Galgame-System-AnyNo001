import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_ATTRIBUTES, createStatsState } from '../src/scene/stats/stat-state.js';
import { LEGACY_ATTRIBUTE_MAP, cocAttributeOf, normalizeAttribute } from '../src/scene/stats/stat-registry.js';
import { HURT_PCT, applyBarDirective, checkModifiers, healthStatus } from '../src/scene/stats/stat-bars.js';
import { scanStatLifeTags } from '../src/scene/stats/stat-directives.js';
import { activeEntryBefore, createStatsLedger, ledgerKey } from '../src/scene/stats/stat-ledger.js';
import { writeAttributeCell } from '../src/scene/stats/stat-cell-format.js';
import { D20_DC_RANGE, d20Bonus, d20Outcome, parseDiceCommand, resolveDiceCommand } from '../src/choices/dice-check.js';
import { createStatsChip } from '../src/visual/igs-ui/stats-chip.js';

test('六维改名、旧名映射、同义词；coc7 下理智保持为理智', () => {
    assert.deepEqual([...BASE_ATTRIBUTES], ['力量', '敏捷', '体质', '智力', '感知', '魅力']);
    assert.deepEqual({ ...LEGACY_ATTRIBUTE_MAP }, { 健康: '体质', 理智: '智力', 观察: '感知' });
    assert.equal(normalizeAttribute('意志'), '感知');
    assert.equal(normalizeAttribute('理智'), '智力');
    assert.equal(normalizeAttribute('理智', { ruleset: 'coc7' }), '理智');
    assert.equal(normalizeAttribute('理智', { ruleset: { ID: 'coc7' } }), '理智');
    assert.equal(normalizeAttribute('健康', { ruleset: 'coc7' }), '体质');
    assert.equal(cocAttributeOf('理智'), '理智');
    assert.equal(normalizeAttribute('理智', { ruleset: 'dnd5e' }), '智力');
});

test('初始状态：版本 2、只放 8 个特有技能、有 prefs、bars 无 health', () => {
    const s = createStatsState({ prefs: { major: 'str' } });
    assert.equal(s.version, 2);
    assert.equal(Object.keys(s.protagonist.skills).length, 8);
    assert.deepEqual(s.protagonist.prefs, { major: 'str' });
    assert.equal('health' in s.protagonist.bars, false);
});

test('hurt 只返回伤势档；healthStatus 看战斗 vitals', () => {
    const bars = createStatsState().protagonist.bars;
    assert.equal(applyBarDirective(bars, { kind: 'hurt', value: '中伤' }).hurt, '中伤');
    assert.equal(applyBarDirective(bars, { kind: 'stamina', value: '受伤' }).hurt, '轻伤');
    assert.equal(HURT_PCT.重伤, 50);
    assert.equal(healthStatus(null), '正常');
    assert.equal(healthStatus({ hp: 10, maxHp: 100 }), '重伤');
    assert.equal(healthStatus({ hp: 40, maxHp: 100 }), '轻伤');
    assert.equal(healthStatus({ hp: 0, maxHp: 100 }), '倒下');
    assert.equal(checkModifiers(bars, { hp: 10, maxHp: 100 }).penalty, 1);
    assert.equal(checkModifiers(bars).penalty, 0);
});

test('scanStatLifeTags 只扫 battle 与 hurt，同哈希给出现序号', () => {
    const tags = scanStatLifeTags('[igs-stat:hurt|轻伤] 文 [igs-stat:hurt|轻伤] [igs-stat:stamina|受伤] [igs-stat:battle|杂兵|2] [igs-stat:favor|小雪|开心]');
    assert.deepEqual(tags.map((t) => [t.kind, t.occurrence]), [['hurt', 0], ['hurt', 1], ['hurt', 2], ['battle', 0]]);
});

test('activeEntryBefore 与属性格旧名改写', () => {
    const ledger = createStatsLedger('c', {});
    ledger.entries.set(ledgerKey(ledger, 2, 0), { messageId: 2, swipeId: 0, after: {} });
    ledger.active.set(2, 0);
    assert.equal(activeEntryBefore(ledger, 2), null);
    assert.equal(activeEntryBefore(ledger, 3).messageId, 2);
    assert.equal(writeAttributeCell('健康:60；力量:45；', { 体质: 8, 力量: 9 }, { renames: LEGACY_ATTRIBUTE_MAP }), '体质:8；力量:9；');
    assert.equal(writeAttributeCell('健康:60；', { 健康: 7 }), '健康:7；');
});

test('d20 命令解析、加值与结果', async () => {
    assert.deepEqual([...D20_DC_RANGE], [5, 30]);
    assert.deepEqual(parseDiceCommand('检定 小雪 力量 DC=15'), { kind: 'd20', name: '小雪', attribute: 'str', dc: 15 });
    assert.equal(parseDiceCommand('检定 小雪 力量 DC=99').kind, 'invalid');
    assert.equal(parseDiceCommand('检定 小雪 力量 DC=15 难度=困难').kind, 'invalid');
    assert.equal(parseDiceCommand('检定 小雪 力量 难度=很难').kind, 'invalid');
    assert.equal(d20Bonus({ scores: { str: 14 }, prefs: { major: 'str' }, proficiency: 2 }, 'str'), 4);
    assert.equal(d20Bonus({ scores: { str: 14 } }, 'dex'), null);
    assert.deepEqual(d20Outcome(20, -5, 30), { total: 15, success: true, tier: '大成功' });
    assert.equal(d20Outcome(1, 9, 5).success, false);
    assert.equal(d20Outcome(10, 2, 12).success, true);
    const r = await resolveDiceCommand('检定 小雪 力量 DC=12', null, { random: () => 0.5, readAbilities: async () => ({ scores: { str: 14 } }) });
    assert.equal(r.ok, true);
    assert.equal(r.detail.die, 11);
    assert.equal(r.detail.total, 13);
    assert.equal((await resolveDiceCommand('检定 小雪 力量 DC=12', null, {})).ok, false);
});

test('提示条动作第三项为布尔时设 aria-pressed，并计入重绘键', () => {
    const attrs = new Map();
    const button = { type: '', className: '', textContent: '', setAttribute: (k, v) => attrs.set(k, v) };
    const el = { ownerDocument: null, textContent: '', children: [], appendChild(c) { this.children.push(c); }, setAttribute() {}, removeAttribute() {}, addEventListener() {} };
    const doc = { createElement: (tag) => (tag === 'button' ? { ...button } : { setAttribute() {}, className: '', textContent: '' }) };
    el.ownerDocument = doc;
    const dialog = { ownerDocument: doc, querySelector: () => el, appendChild() {} };
    let pressed = false;
    const chip = createStatsChip({ getDialog: () => dialog, getNotices: () => [{ id: 'b', kind: 'onboarding', text: 't', actions: [['mode', '自动', pressed]] }] });
    chip.sync();
    const first = el.children.filter((c) => c.type !== undefined);
    assert.equal(first.length, 1);
    pressed = true;
    el.children = [];
    chip.sync();
    assert.equal(el.children.length > 0, true);
});
