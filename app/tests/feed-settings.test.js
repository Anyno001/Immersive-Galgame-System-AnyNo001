import test from 'node:test';
import assert from 'node:assert/strict';
import { FEED_PLATFORMS, FEED_SETTING_GROUPS, feedPlatformById } from '../src/scene/feed-platforms.js';
import { feedPlatformPrompt, normalizeFeedFxSettings } from '../src/visual/igs-ui/feed-settings.js';
import { renderFeedFields } from '../src/visual/igs-ui/feed-settings-fields.js';
import { FX_SETTINGS_NORMALIZERS } from '../src/visual/igs-ui/fx-settings.js';
import { applyPerformancePreset, isPerformanceFeatureOn } from '../src/visual/igs-ui/performance-presets.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { renderPerformanceSettings } from '../src/visual/igs-ui/performance-settings-layout.js';

test('feedFx:normalize:defaults', () => {
    const s = normalizeFeedFxSettings(undefined);
    assert.equal(s.enabled, false);
    assert.equal(s.muteOnNsfw, true);
    for (const p of FEED_PLATFORMS) assert.deepEqual(s.platforms[p.id], { enabled: true, prompt: '' });
    assert.equal(FX_SETTINGS_NORMALIZERS.feedFx, normalizeFeedFxSettings);
});

test('feedFx:normalize:prompt-equal-default-is-empty', () => {
    const weibo = feedPlatformById('weibo');
    const s = normalizeFeedFxSettings({ platforms: { weibo: { prompt: weibo.prompt }, tieba: { prompt: ' 我的写法 ', enabled: false } } });
    assert.equal(s.platforms.weibo.prompt, '');
    assert.equal(s.platforms.tieba.prompt, '我的写法');
    assert.equal(s.platforms.tieba.enabled, false);
    assert.equal(feedPlatformPrompt(s, 'tieba'), '我的写法');
    assert.equal(feedPlatformPrompt(s, 'weibo'), weibo.prompt);
});

test('feedFx:settings-paths:booleans-and-strings', () => {
    assert.equal(normalizeSettingsValue('readerSettings.feedFx.enabled', 'true'), true);
    assert.equal(normalizeSettingsValue('readerSettings.feedFx.muteOnNsfw', 'false'), false);
    assert.equal(normalizeSettingsValue('readerSettings.feedFx.platforms.weibo.enabled', '1'), true);
    assert.equal(normalizeSettingsValue('readerSettings.feedFx.platforms.weibo.enabled', 'false'), false);
    assert.equal(normalizeSettingsValue('readerSettings.feedFx.platforms.weibo.prompt', '写法'), '写法');
});

test('feedFx:render:groups-and-platforms', () => {
    const html = renderFeedFields({ feedFx: { enabled: true } });
    assert.match(html, /手机社区/);
    assert.match(html, /NSFW场景收起社区/);
    assert.match(html, /平台写法/);
    for (const [title, ids] of FEED_SETTING_GROUPS) {
        assert.ok(html.includes(`>${title}</summary>`), `分组 ${title}`);
        for (const id of ids) {
            assert.ok(html.includes(feedPlatformById(id).name), `平台 ${id}`);
            assert.ok(html.includes(`data-path="readerSettings.feedFx.platforms.${id}.prompt"`));
            assert.ok(html.includes(`data-switch="readerSettings.feedFx.platforms.${id}.enabled"`));
            assert.ok(html.includes(`data-action="feed-prompt-reset:${id}"`));
        }
    }
    assert.ok(html.includes(feedPlatformById('moments').prompt), '无自定义时显示默认写法');
    assert.match(html, /placeholder="留空恢复默认"/);
});

test('feedFx:render:placed-in-performance-special-group', () => {
    const html = renderPerformanceSettings({ feedFx: { enabled: true } }, {}, () => true);
    const live = html.indexOf('直播间');
    const feed = html.indexOf('手机社区');
    const audience = html.indexOf('观众弹幕', feed);
    assert.ok(live >= 0 && feed > live && audience > feed);
});

test('feedFx:reset-action:clears-custom-prompt', async () => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const reader = { feedFx: { enabled: true, platforms: { weibo: { enabled: false, prompt: '我的写法' } } } };
    const draft = { readerSettings: reader };
    let rerendered = 0;
    let saved = 0;
    const ctx = {
        state: { activeSettings: { draft, readerMode: 'pc', asyncState: {} } },
        options: { global: {} },
        dialogs: { confirm: async () => true },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { saved += 1; return { ok: true }; },
        rerenderSettings: () => { rerendered += 1; return { ok: true }; },
        buildRegexPreview: () => '',
    };
    await handleSettingsAction('feed-prompt-reset:weibo', ctx);
    assert.equal(draft.readerSettings.feedFx.platforms.weibo.prompt, '');
    assert.equal(draft.readerSettings.feedFx.platforms.weibo.enabled, false, '只清写法，不动开关');
    assert.equal(draft.readerSettings.feedFx.enabled, true);
    assert.equal(saved, 1);
    assert.equal(rerendered, 1);
    await handleSettingsAction('feed-prompt-reset:nope', ctx);
    assert.equal(saved, 1, '未知平台不保存');
});

test('feedFx:performance-preset:full-enables-and-off-disables', () => {
    const reader = {};
    applyPerformancePreset(reader, 'full');
    assert.equal(isPerformanceFeatureOn(reader, 'feedFx'), true);
    applyPerformancePreset(reader, 'standard');
    assert.equal(isPerformanceFeatureOn(reader, 'feedFx'), false);
});
