import test from 'node:test';
import assert from 'node:assert/strict';
import { statsArchiveModel } from '../src/scene/stats/stat-archive.js';
import { createStatsLedger, ledgerKey } from '../src/scene/stats/stat-ledger.js';
import { BASE_ATTRIBUTES, createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';
import { renderStatsArchive, renderStatsHeroCard } from '../src/visual/igs-ui/stats-settings-fields.js';
import { renderStatsHeroDashboard } from '../src/visual/igs-ui/stats-hero-card.js';

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

test('六维雷达取引擎数值：切换骰制只改变标签，几何投影与生命、积分、货币均不改账', () => {
    const ledger = createStatsLedger('radar', createStatsState({ money: 500 }));
    const readers = { readAbilities: () => ({ scores: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 } }),
        readVitals: () => ({ hp: 41, maxHp: 82, down: false }) };
    const currency = { name: '铜钱', ready: true, balance: 240 };
    const before = JSON.stringify(ledger.initial);
    const models = ['coc7', 'dnd5e'].map((ruleset) => statsArchiveModel(ledger, {
        engine: createEngine({}, {}, ruleset, readers), currency, walletExtra: 25,
    }));
    for (const model of models) {
        assert.deepEqual(model.attributes.map((a) => a.name), [...BASE_ATTRIBUTES]);
        assert.deepEqual(model.attributes.map((a) => a.value), [75, 65, 70, 40, 60, 50]);
        assert.equal(model.wallet, 525);
        assert.equal(model.currency.balance, 240);
        assert.equal(model.vitals.hp, 41);
    }
    assert.equal(models[0].attributes[0].display, '75');
    assert.equal(models[1].attributes[0].display, '15（+2）');
    const html = models.map(renderStatsHeroDashboard);
    const points = (text) => text.match(/class="igs-stats-radar-fill" points="([^"]+)"/)[1];
    assert.equal(points(html[0]), points(html[1]));
    assert.equal(points(html[0]).split(' ').length, 6);
    assert.match(html[0], /aria-label="生命"[^>]*aria-valuemax="82"[^>]*aria-valuenow="41"/);
    assert.match(html[0], /style="width:50\.00%"/);
    assert.equal(JSON.stringify(ledger.initial), before);
});

test('角色分栏保留货币重试与技能编辑入口，缺生命不造零值，倒地生命归零', () => {
    const ledger = createStatsLedger('hero', createStatsState());
    const model = statsArchiveModel(ledger, { engine: createEngine({}, {}, 'coc7'), heroSkills: ['电脑'],
        currency: { name: '<铜钱>', ready: false, pending: true } });
    const html = renderStatsHeroCard(model, (key) => key === 'stats-hero-edit' ? ' open' : '');
    assert.doesNotMatch(html, /aria-label="生命"/);
    assert.match(html, /&lt;铜钱&gt;/);
    assert.doesNotMatch(html, /<铜钱>/);
    assert.match(html, /data-action="stats-op:currency-retry"[^>]*disabled/);
    assert.match(html, /data-advanced="stats-hero-edit" open/);
    assert.match(html, /data-stats-hero-skill="电脑"/);
    const down = renderStatsHeroDashboard({ ...model, vitals: { hp: 41, maxHp: 82, down: true } });
    assert.match(down, /aria-label="生命"[^>]*aria-valuenow="0"/);
});