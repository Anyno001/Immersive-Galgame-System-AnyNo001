import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_SEARCH_INDEX, searchSettings } from '../src/visual/igs-ui/settings-search.js';
import { PERFORMANCE_FEATURES } from '../src/visual/igs-ui/performance-presets.js';
import { PERFORMANCE_GROUPS } from '../src/visual/igs-ui/performance-settings-layout.js';

test('gate:settings-search:every-performance-feature-is-findable', () => {
    const ids = new Set(SETTINGS_SEARCH_INDEX.map((entry) => entry.id));
    const groups = new Set(PERFORMANCE_GROUPS.map(([id]) => id));
    for (const feature of PERFORMANCE_FEATURES) {
        if (!feature.label || !groups.has(feature.group)) continue;
        assert.ok(ids.has(`perf:${feature.key}`), `missing ${feature.key}`);
    }
    for (const entry of SETTINGS_SEARCH_INDEX) {
        assert.equal(entry.target.tab, 'reader');
        assert.equal(entry.target.readerSubTab, 'performance');
        assert.match(entry.target.open[0], /^perf-group-/);
        assert.ok(groups.has(entry.target.open[0].slice('perf-group-'.length)));
        assert.match(entry.location, /^阅读器 › 演出 › /);
    }
});

test('gate:settings-search:deep-camera-option-resolves-to-folded-section', () => {
    const [first] = searchSettings('冲击');
    assert.ok(first, 'impact option must be found');
    assert.equal(first.label, '情绪冲击推近');
    assert.deepEqual([...first.target.open], ['perf-group-stage', 'perf-camera']);
    assert.equal(first.location, '阅读器 › 演出 › 画面与镜头');
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
    assert.match(renderSettingsSearchResults('zzzz-no-such-setting'), /没有找到相关设置/);
    const html = renderSettingsSearchResults('冲击');
    assert.match(html, /data-setting-go="camera-impact"/);
    assert.match(html, /阅读器 › 演出 › 画面与镜头/);
    const evil = [{ id: '"><img>', label: '<b>x</b>', location: 'a&b', nameKey: 'x', aliasKeys: [], groupKey: '' }];
    const escaped = renderSettingsSearchResults('x', evil);
    assert.doesNotMatch(escaped, /<img>|<b>x<\/b>/);
    assert.match(escaped, /&quot;&gt;&lt;img&gt;/);
    assert.match(escaped, /a&amp;b/);
});

