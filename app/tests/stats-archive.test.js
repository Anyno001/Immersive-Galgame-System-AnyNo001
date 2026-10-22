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
