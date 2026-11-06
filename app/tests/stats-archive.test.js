import test from 'node:test';
import assert from 'node:assert/strict';
import { statsArchiveModel } from '../src/scene/stats/stat-archive.js';
import { createStatsLedger, ledgerKey } from '../src/scene/stats/stat-ledger.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { renderStatsArchive } from '../src/visual/igs-ui/stats-settings-fields.js';

function fixture() {
    const base = createStatsState();
    const c = createCharacter(1);
    const after = { ...base, characters: { '小<雪>': { ...c, dims: { ...c.dims, 好感: 30 } } } };
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 1, 0), { messageId: 1, swipeId: 0, after, changes: [{ source: 'tag', target: '小<雪>', key: '好感', from: 0, to: 30, note: '感动' }] });
    ledger.entries.set(ledgerKey(ledger, 1, 1), { messageId: 1, swipeId: 1, after: base, changes: [{ source: 'tag', target: '小<雪>', key: '好感', from: 0, to: -6, note: '被丢弃的swipe' }] });
    ledger.active.set(1, 0);
    return ledger;
}

test('存档模型：取当前生效楼层的数值与变动，未生效的 swipe 不计入；没有账本返回 null（§10）', () => {
    const m = statsArchiveModel(fixture());
    assert.equal(m.characters[0].stage, '明确喜欢');
    assert.equal(m.characters[0].dims.好感, 30);
    assert.deepEqual(m.log.map((r) => r.note), ['感动']);
    assert.equal(m.total, 1);
    assert.ok(m.skills.length > 0);
    assert.equal(statsArchiveModel(null), null);
});

test('存档区渲染：转义角色名与备注；技能和变动记录默认折叠；没有存档时只出一行说明', () => {
    const html = renderStatsArchive(statsArchiveModel(fixture()));
    assert.match(html, /小&lt;雪&gt;/);
    assert.doesNotMatch(html, /小<雪>/);
    assert.doesNotMatch(html, /被丢弃/);
    assert.match(html, /data-advanced="stats-log">/);
    assert.match(html, /#1 小&lt;雪&gt; 好感 0→30（感动）/);
    assert.match(renderStatsArchive(null), /还没有数值存档/);
});

test('变动记录：生活条英文键显示为体力、压力、金钱', () => {
    const base = createStatsState();
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 2, 0), { messageId: 2, swipeId: 0, after: base, changes: [
        { source: 'tag', target: '主角', key: 'stamina', from: 100, to: 85, note: '中' },
        { source: 'tag', target: '主角', key: 'stress', from: 0, to: 10, note: '上升' },
        { source: 'challenge', target: '主角', key: 'money', from: 0, to: 100, note: '' },
    ] });
    ledger.active.set(2, 0);
    assert.deepEqual(statsArchiveModel(ledger).log.map((r) => r.key).sort(), ['体力', '压力', '金钱'].sort());
});

test('变动记录：主角写成「名字（主角）」，按角色分组时主角排最前，用户名与「主角」并成一组', () => {
    const base = createStatsState();
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 1, 0), { messageId: 1, swipeId: 0, after: base, changes: [{ target: '主角', key: 'stamina', from: 80, to: 70, note: '' }] });
    ledger.entries.set(ledgerKey(ledger, 2, 0), { messageId: 2, swipeId: 0, after: base, changes: [{ target: '小雪', key: '好感', from: 0, to: 3, note: '' }, { target: '阿明', key: '侦查', from: 40, to: 41, note: '成长' }] });
    ledger.active.set(1, 0);
    ledger.active.set(2, 0);
    const m = statsArchiveModel(ledger, { heroName: '阿明', isHero: (name) => name === '阿明' });
    assert.deepEqual(m.log.map((r) => r.target), ['阿明（主角）', '小雪', '阿明（主角）']);
    assert.deepEqual(m.logGroups.map((g) => [g.name, g.total]), [['阿明（主角）', 2], ['小雪', 1]]);
    assert.equal(statsArchiveModel(ledger).log[2].target, '主角');
    const html = renderStatsArchive(m, () => '', { logByRole: true });
    assert.match(html, /<summary>阿明（主角）（2 条）<\/summary>/);
    assert.match(html, /data-action="stats-log-view:time"/);
});
