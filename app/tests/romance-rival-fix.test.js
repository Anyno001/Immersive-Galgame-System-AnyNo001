import test from 'node:test';
import assert from 'node:assert/strict';
import { createStatsLedger, ledgerKey } from '../src/scene/stats/stat-ledger.js';
import { statsRivalSet } from '../src/scene/stats/stat-rivals.js';
import { resolveRomanceRivalSpeaker, setStatsRivalProvider } from '../src/visual/igs-ui/romance-runtime.js';

const state = (day, characters = {}) => ({ clock: { day }, characters });
// 按楼追加账本：每楼给出结算后的状态与变动。
function ledgerOf(floors, initial = state(1)) {
    const ledger = createStatsLedger('c1', initial);
    floors.forEach(([after, changes], i) => {
        ledger.entries.set(ledgerKey(ledger, i, 0), { messageId: i, swipeId: 0, after, changes });
        ledger.active.set(i, 0);
    });
    return ledger;
}
const jealous = (target, key = '好感') => ({ source: 'tag', key, target, from: 10, to: 9, note: '吃醋' });

test('7 天内吃醋（低路芥蒂、高路好感）算情敌，第 8 天不算', () => {
    const chars = { 阿澄: { dims: {} }, 小雪: { dims: {} } };
    const at = (day) => ledgerOf([[state(3, chars), [jealous('阿澄'), jealous('小雪', '芥蒂')]], [state(day, chars), []]]);
    assert.deepEqual([...statsRivalSet(at(9))].sort(), ['小雪', '阿澄'].sort());
    assert.equal(statsRivalSet(at(10)).size, 0);
});

test('芥蒂 26 算、25 不算', () => {
    const set = statsRivalSet(ledgerOf([[state(1, { 甲: { dims: { 芥蒂: 26 } }, 乙: { dims: { 芥蒂: 25 } } }), []]]));
    assert.equal(set.has('甲'), true);
    assert.equal(set.has('乙'), false);
});

test('romance 为真算，结束后不算；主角不入集合', () => {
    const on = ledgerOf([[state(1, { 甲: { dims: {}, romance: true }, 主角: { dims: { 芥蒂: 50 }, romance: true } }), []]]);
    assert.deepEqual([...statsRivalSet(on)], ['甲']);
    const off = ledgerOf([[state(1, { 甲: { dims: {}, romance: false } }), []]]);
    assert.equal(statsRivalSet(off).size, 0);
});

const sceneAssets = { characters: { 小雪: {}, 阿澄: {}, 阿哲: {} }, characterAliases: { 阿澄: ['澄'] } };
const page = (speaker, fx = { romance: 'ambiguous', romanceAt: 0, romanceTarget: '小雪' }) => ({ fx, spriteCharacter: speaker, speaker });

test('provider 返回 null 沿用 romanceTargets；返回 Set 时只认该集合', () => {
    setStatsRivalProvider(null);
    // 先让阿哲成为另一区间的恋爱对象，写入 romanceTargets。
    resolveRomanceRivalSpeaker(page('阿哲'), sceneAssets, '主角');
    setStatsRivalProvider(() => null);
    // 渲染路径才会记录对象，这里只验证 null 时不报错且不凭空判定。
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), false);
    setStatsRivalProvider(() => new Set(['澄']));
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), true);
    setStatsRivalProvider(() => new Set());
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), false);
    setStatsRivalProvider(() => { throw new Error('x'); });
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄'), sceneAssets, '主角'), false);
    setStatsRivalProvider(null);
});

test('主角与本区间对象永远不算情敌', () => {
    setStatsRivalProvider(() => new Set(['小雪', '主角', '阿澄']));
    assert.equal(resolveRomanceRivalSpeaker(page('小雪'), sceneAssets, '主角'), false);
    assert.equal(resolveRomanceRivalSpeaker(page('主角'), sceneAssets, '主角'), false);
    assert.equal(resolveRomanceRivalSpeaker(page('阿澄', { romance: 'ambiguous', romanceAt: 0, romanceTarget: '' }), sceneAssets, '主角'), false);
    setStatsRivalProvider(null);
});
