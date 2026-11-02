import test from 'node:test';
import assert from 'node:assert/strict';
import { battleModeOf, planBattleMode } from '../src/visual/igs-ui/combat-settings.js';
import { SETTINGS_PAGES, SETTINGS_CATEGORIES } from '../src/visual/igs-ui/settings-pages.js';
import { SETTINGS_SEARCH_INDEX, searchSettings } from '../src/visual/igs-ui/settings-search.js';

test('三选一由两个字段推出：卡牌战斗优先，其次剧情演出，否则关闭', () => {
    assert.equal(battleModeOf({ combatExpansion: { enabled: true }, battleFx: { enabled: true } }), 'card');
    assert.equal(battleModeOf({ combatExpansion: { enabled: false }, battleFx: { enabled: true } }), 'story');
    assert.equal(battleModeOf({ battleFx: { enabled: false } }), 'off');
    assert.equal(battleModeOf(undefined), 'off');
});

test('三选一写入映射：路径不变，卡牌战斗不动 battleFx 并强制开数值系统', () => {
    assert.deepEqual(planBattleMode('off').writes, [['readerSettings.battleFx.enabled', false], ['readerSettings.combatExpansion.enabled', false]]);
    assert.deepEqual(planBattleMode('story').writes, [['readerSettings.battleFx.enabled', true], ['readerSettings.combatExpansion.enabled', false]]);
    const card = planBattleMode('card', { ok: true });
    assert.deepEqual(card.writes, [['readerSettings.combatExpansion.enabled', true], ['bridge.stats.enabled', true]]);
    assert.ok(!card.writes.some(([path]) => path.includes('battleFx')));
});

test('开启前检查失败：退回原选项，不停在卡牌战斗', () => {
    const plan = planBattleMode('card', { ok: false, reason: 'no-db', missing: [], message: '未检测到数据库（shujuku），无法开启卡牌战斗' });
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.writes, [['readerSettings.combatExpansion.enabled', false]]);
    assert.equal(battleModeOf({ battleFx: { enabled: true }, combatExpansion: { enabled: false } }), 'story');
    assert.match(plan.message, /无法开启卡牌战斗/);
});

test('战斗分类紧挨数值系统，搜索能找到', () => {
    assert.ok(SETTINGS_CATEGORIES.some(([id, label]) => id === 'combat' && label === '战斗'));
    assert.ok(SETTINGS_PAGES.some(([id, , cat]) => id === 'combat' && cat === 'combat'));
    const idx = SETTINGS_CATEGORIES.findIndex(([id]) => id === 'combat');
    assert.equal(SETTINGS_CATEGORIES[idx - 1][0], 'stats');
    for (const q of ['战斗', '卡牌战斗', '战斗演出']) assert.ok(searchSettings(q, SETTINGS_SEARCH_INDEX).some((e) => e.target.page === 'combat'), q);
});

test('卡牌战斗开启时，保留的 battleFx.enabled 不计入演出数量', async () => {
    const { countEnabledPerformance } = await import('../src/visual/igs-ui/performance-settings-layout.js');
    const base = { battleFx: { enabled: true } };
    const story = countEnabledPerformance(base).performance;
    assert.equal(countEnabledPerformance({ ...base, combatExpansion: { enabled: true } }).performance, story - 1);
    assert.equal(countEnabledPerformance({ ...base, combatExpansion: { enabled: false } }).performance, story);
});
