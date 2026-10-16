import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_SEARCH_INDEX, searchSettings } from '../src/visual/igs-ui/settings-search.js';
import { PERFORMANCE_FEATURES } from '../src/visual/igs-ui/performance-presets.js';
import { PERFORMANCE_GROUPS } from '../src/visual/igs-ui/performance-settings-layout.js';
import { PERFORMANCE_GROUP_PAGES } from '../src/visual/igs-ui/settings-pages.js';

test('gate:settings-search:every-performance-feature-is-findable', () => {
    const ids = new Set(SETTINGS_SEARCH_INDEX.map((entry) => entry.id));
    const groups = new Set(PERFORMANCE_GROUPS.map(([id]) => id));
    for (const feature of PERFORMANCE_FEATURES) {
        if (!feature.label || !groups.has(feature.group)) continue;
        assert.ok(ids.has(`perf:${feature.key}`), `missing ${feature.key}`);
    }
    // 演出开关都跳到各自的页面（台词 / 画面 / 情绪与提示 / 题材 / 节奏 / 声音）；位置写成「演出 › 画面」，声音只写「声音」。
    for (const entry of SETTINGS_SEARCH_INDEX.filter((item) => item.id.startsWith('perf:'))) {
        assert.ok(Object.values(PERFORMANCE_GROUP_PAGES).includes(entry.target.page), entry.id);
        assert.ok(!entry.target.open.some((key) => /^perf-group-/.test(key)), entry.id);
        assert.match(entry.location, /^(演出 › |声音$)/);
    }
});

test('gate:settings-search:deep-camera-option-resolves-to-folded-section', () => {
    const [first] = searchSettings('冲击');
    assert.ok(first, 'impact option must be found');
    assert.equal(first.label, '情绪冲击推近');
    assert.deepEqual([...first.target.open], ['perf-camera']);
    assert.equal(first.target.page, 'perf-stage');
    assert.equal(first.location, '演出 › 画面');
});

test('gate:settings-search:ranking-empty-and-no-match', () => {
    assert.deepEqual(searchSettings(''), []);
    assert.deepEqual(searchSettings('   '), []);
    assert.deepEqual(searchSettings('zzzz-no-such-setting'), []);
    const results = searchSettings('镜头');
    assert.ok(results.length > 0 && results.length <= 8);
    assert.ok(results.some((entry) => entry.id === 'camera-impact'));
    assert.equal(searchSettings(' 特 写 ')[0].label, '情绪特写');
});

test('gate:settings-search:results-html-empty-hint-and-escaping', async () => {
    const { renderSettingsSearchResults } = await import('../src/visual/igs-ui/settings-search.js');
    assert.equal(renderSettingsSearchResults(''), '');
    assert.match(renderSettingsSearchResults('zzzz-qqqq-xxxx'), /未找到相关设置/);
    const html = renderSettingsSearchResults('冲击');
    assert.match(html, /data-setting-go="camera-impact"/);
    assert.match(html, /演出 › 画面/);
    const evil = [{ id: '"><img>', label: '<b>x</b>', location: 'a&b', nameKey: 'x', aliasKeys: [], groupKey: '' }];
    const escaped = renderSettingsSearchResults('x', evil);
    assert.doesNotMatch(escaped, /<img>|<b>x<\/b>/);
    assert.match(escaped, /&quot;&gt;&lt;img&gt;/);
    assert.match(escaped, /a&amp;b/);
});


test('gate:settings-search:colloquial-words-and-did-you-mean', async () => {
    const { searchSettings, renderSettingsSearchResults } = await import('../src/visual/igs-ui/settings-search.js');
    // 口语说法能直接命中：「打字音」→ 打字机，「卡顿」→ 画质，「黑边」→ 电影黑边。
    assert.equal(searchSettings('打字音')[0].label, '打字机');
    assert.equal(searchSettings('卡顿')[0].id, 'render-quality');
    assert.equal(searchSettings('黑边')[0].id, 'cinema-bars');
    assert.equal(searchSettings('立绘太大')[0].target.page, 'chars');
    const strength = searchSettings('strength')[0];
    assert.equal(strength.id, 'consistency-strength');
    assert.deepEqual(strength.target, { page: 'source', open: [] });
    // 直接搜不到时给「你是否在找」。
    assert.match(renderSettingsSearchResults('下雨天'), /你是否在找[\s\S]*data-setting-go="perf:/);
});
