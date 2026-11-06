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

test('好感总览模型：好感从高到低，只含人际维度变动，排除主角，新的在前，带天数与楼号', async () => {
    const { statsFavorOverview } = await import('../src/scene/stats/stat-archive.js');
    const base = createStatsState();
    const mk = (favor) => ({ ...createCharacter(1), dims: { ...createCharacter(1).dims, 好感: favor } });
    const after = { ...base, clock: { ...base.clock, day: 3 }, characters: { 甲: mk(10), 乙: mk(40), 主角: mk(99) } };
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 1, 0), { messageId: 1, swipeId: 0, after, changes: [
        { source: 'tag', target: '乙', key: '好感', from: 0, to: 5, note: '感动' },
        { source: 'tag', target: '乙', key: 'stamina', from: 100, to: 90, note: '亲密' },
        { source: 'tag', target: '乙', key: '芥蒂', from: 0, to: 4, note: '吃醋' },
    ] });
    ledger.active.set(1, 0);
    const list = statsFavorOverview(ledger, { isHero: (name) => name === '主角' });
    assert.deepEqual(list.map((p) => p.name), ['乙', '甲']);
    assert.deepEqual(list[0].log.map((r) => r.key), ['芥蒂', '好感']);
    assert.deepEqual(list[0].log[1], { day: 3, messageId: 1, key: '好感', from: 0, to: 5, note: '感动' });
    assert.deepEqual(list[1].log, []);
    assert.deepEqual(statsFavorOverview(null), []);
});

test('日期捕捉诊断：只列有日期或整点的楼，最多取最近 20 楼', async () => {
    const { statsClockTrail, describeClockTrail } = await import('../src/scene/stats/stat-archive.js');
    const base = createStatsState();
    const ledger = createStatsLedger('chat', base);
    for (let id = 0; id < 30; id += 1) {
        const clock = id === 3 ? base.clock : { ...base.clock, lastDate: `3月${id}日`, lastHour: id % 24 };
        ledger.entries.set(ledgerKey(ledger, id, 0), { messageId: id, swipeId: 0, after: { ...base, clock }, changes: [] });
        ledger.active.set(id, 0);
    }
    const rows = statsClockTrail(ledger);
    assert.equal(rows.length, 20);
    assert.equal(rows[0].messageId, 10);
    assert.deepEqual(rows[19], { messageId: 29, date: '3月29日', hour: 5 });
    assert.ok(!statsClockTrail(ledger, 100).some((r) => r.messageId === 3));
    assert.match(describeClockTrail(rows), /^日期捕捉（最近 20 楼） #10 3月10日 10时 · /);
    assert.equal(describeClockTrail([]), '');
    assert.deepEqual(statsClockTrail(null), []);
});

test('楼号：变动记录与好感总览显示账本 messageId，与阅读器楼号（宿主 id，从 0 起）一致', async () => {
    const { statsFavorOverview } = await import('../src/scene/stats/stat-archive.js');
    const base = createStatsState();
    const ledger = createStatsLedger('chat', base);
    const after = { ...base, characters: { 甲: createCharacter(1) } };
    ledger.entries.set(ledgerKey(ledger, 0, 0), { messageId: 0, swipeId: 0, after, changes: [{ source: 'tag', target: '甲', key: '好感', from: 0, to: 2, note: '' }] });
    ledger.active.set(0, 0);
    assert.equal(statsFavorOverview(ledger)[0].log[0].messageId, 0);
    assert.match(renderStatsArchive(statsArchiveModel(ledger)), /#0 甲 好感 0→2/);
});

test('每日冷却扣好感：写入 note 为「冷却」的变动，好感总览与变动记录都能看到', async () => {
    const { settleDay } = await import('../src/scene/stats/stat-day.js');
    const { statsFavorOverview } = await import('../src/scene/stats/stat-archive.js');
    const base = createStatsState();
    const c = { ...createCharacter(1), dims: { ...createCharacter(1).dims, 好感: 40 }, lastSeenDay: 1 };
    const start = { ...base, clock: { ...base.clock, day: 5 }, characters: { 甲: c } };
    const changes = [];
    const after = settleDay(start, { random: () => 0.5, changes });
    const cool = changes.find((r) => r.note === '冷却');
    assert.deepEqual([cool.target, cool.key, cool.from, cool.to], ['甲', '好感', 40, 39]);
    assert.equal(after.characters.甲.dims.好感, 39);
    const ledger = createStatsLedger('chat', base);
    ledger.entries.set(ledgerKey(ledger, 4, 0), { messageId: 4, swipeId: 0, after, changes });
    ledger.active.set(4, 0);
    assert.equal(statsFavorOverview(ledger)[0].log.find((r) => r.note === '冷却').messageId, 4);
    assert.ok(statsArchiveModel(ledger).log.some((r) => r.note === '冷却'));
});
