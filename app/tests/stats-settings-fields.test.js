import test from 'node:test';
import assert from 'node:assert/strict';
import { STATS_BUILD_MODE_ITEMS, renderStatsBuildFields, renderStatsBuildModeField, renderStatsPromptFields, renderStatsRulesetField, staleStatsPromptNames, statsBuildStatus } from '../src/visual/igs-ui/stats-settings-fields.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';

test('规则体系下拉：选项来自规则集登记表，当前值被选中', () => {
    const html = renderStatsRulesetField('coc7');
    assert.match(html, /data-path="bridge\.stats\.ruleset"/);
    assert.match(html, /<option value="coc7" selected>/);
    assert.match(html, /<option value="dnd5e">/);
});

test('建档方式三选一，只切界面状态；自动/相对数值选六维倾向，手动建档填职业与六维加点', () => {
    const modes = renderStatsBuildModeField('manual');
    assert.equal(STATS_BUILD_MODE_ITEMS.length, 3);
    assert.match(modes, /data-action="stats-build-mode:manual"/);
    const auto = renderStatsBuildFields({}, () => '', { worldview: 'modern' });
    assert.match(auto, /bridge\.stats\.build\.prefs\.major/);
    assert.doesNotMatch(auto, /bridge\.stats\.build\.base\./);
    const manual = renderStatsBuildFields({}, () => '', { worldview: 'modern', mode: 'manual' });
    assert.match(manual, /bridge\.stats\.build\.scores\.str/);
    assert.match(manual, /bridge\.stats\.build\.className/);
    assert.match(manual, /data-stats-mode="manual"/);
    assert.match(statsBuildStatus({}, 'modern', 'manual').pointNote, /总分 \d+\/72/);
});

test('提示词区：sheets、sheetGen 可编辑；失效提示只列被弃用的覆盖，点「知道了」后不再出', () => {
    const stats = normalizeStatsSettings({ enabled: true, prompts: { sheets: '自定义本事', sheetGen: '自定义生成' }, promptsVersion: 3, stalePrompts: { roll: '旧骰' } });
    const html = renderStatsPromptFields(stats);
    assert.match(html, /bridge\.stats\.prompts\.sheets/);
    assert.match(html, /bridge\.stats\.prompts\.sheetGen/);
    assert.match(html, /data-stats-prompt-stale/);
    assert.deepEqual(staleStatsPromptNames(stats), ['掷骰规则']);
    assert.doesNotMatch(renderStatsPromptFields({ ...stats, staleNoticeSeen: true }), /data-stats-prompt-stale/);
});

test('这些表单不写内联样式、不写十六进制色', () => {
    const all = renderStatsRulesetField('dnd5e') + renderStatsBuildModeField('auto') + renderStatsBuildFields({}) + renderStatsPromptFields(normalizeStatsSettings({ enabled: true }));
    assert.doesNotMatch(all.replace(/style="--igs-segment-count[^"]*"/g, ''), /style=|#[0-9a-fA-F]{3,8}\b/);
});
