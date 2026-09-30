import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PERFORMANCE_FEATURES,
    applyPerformancePreset,
    detectPerformancePreset,
    isPerformanceFeatureOn,
} from '../src/visual/igs-ui/performance-presets.js';
import { PERFORMANCE_GROUPS, renderPerformanceSettings } from '../src/visual/igs-ui/performance-settings-layout.js';
import { FX_SETTINGS_NORMALIZERS } from '../src/visual/igs-ui/fx-settings.js';

const EXTRA_KEYS = ['typewriter', 'stageShake', 'weatherFx', 'chatShow'];

test('gate:performance-presets:every-feature-is-a-real-reader-setting', () => {
    const known = new Set([...Object.keys(FX_SETTINGS_NORMALIZERS), ...EXTRA_KEYS]);
    const groups = new Set(PERFORMANCE_GROUPS.map(([id]) => id));
    for (const feature of PERFORMANCE_FEATURES) {
        assert.ok(known.has(feature.key), feature.key);
        assert.ok(groups.has(feature.group), feature.group);
    }
    assert.equal(new Set(PERFORMANCE_FEATURES.map((f) => f.key)).size, PERFORMANCE_FEATURES.length);
});

test('gate:performance-presets:apply-then-detect-round-trips-and-keeps-details', () => {
    for (const preset of ['off', 'light', 'standard', 'full']) {
        const reader = { mangaFx: { enabled: false, speedLines: ['震惊'] }, stageShake: { intensity: 'strong' } };
        assert.equal(applyPerformancePreset(reader, preset), true);
        assert.equal(detectPerformancePreset(reader), preset);
        assert.deepEqual(reader.mangaFx.speedLines, ['震惊']);
        assert.equal(reader.stageShake.intensity, 'strong');
    }
    const reader = {};
    applyPerformancePreset(reader, 'light');
    assert.equal(isPerformanceFeatureOn(reader, 'typewriter'), true);
    assert.equal(isPerformanceFeatureOn(reader, 'romanceFx'), false);
    assert.equal(applyPerformancePreset(reader, 'bogus'), false);
});

test('gate:performance-presets:fresh-settings-read-as-all-off', () => {
    assert.equal(detectPerformancePreset({}), 'off');
    assert.equal(detectPerformancePreset({ typewriter: { enabled: true } }), '');
});

test('gate:performance-layout:groups-collapsed-with-summary-and-word-lists-hidden', () => {
    const html = renderPerformanceSettings({ mangaFx: { enabled: true }, typewriter: { enabled: true } }, {
        typewriter: '<i data-tw></i>',
        stageShake: ['<i data-shake></i>', '<i data-shake-detail></i>'],
    });
    for (const [id] of PERFORMANCE_GROUPS) assert.match(html, new RegExp(`<details data-advanced="perf-group-${id}">`));
    assert.match(html, /data-action="perf-preset:standard"/);
    assert.match(html, /<b>情绪反应<\/b><span class="igs-perf-count is-on">1\/3<\/span><span class="igs-perf-brief">情绪符号<\/span>/);
    assert.match(html, /<b>立绘<\/b><span class="igs-perf-count">0\/2<\/span>/);
    assert.match(html, /<b>事件演出<\/b><span class="igs-perf-count">0\/4<\/span>/);
    assert.match(html, /<details class="igs-settings-advanced igs-perf-more" data-advanced="perf-manga-words"><summary>自定义触发情绪<\/summary>/);
    assert.match(html, /data-advanced="perf-stage-shake"><summary>强度与触发情绪<\/summary><i data-shake-detail><\/i>/);
    assert.match(html, /data-tw/);
});

test('gate:performance-layout:remembers-open-sections', () => {
    const html = renderPerformanceSettings({ mangaFx: { enabled: true } }, {}, (key) => key === 'perf-group-character' || key === 'perf-manga-words');
    assert.match(html, /data-advanced="perf-group-character" open/);
    assert.match(html, /data-advanced="perf-manga-words" open/);
    assert.doesNotMatch(html, /data-advanced="perf-group-text" open/);
});

test('gate:perf-presets:home-tab-shows-same-preset-bar-and-custom-state', async () => {
    const { renderPerformancePresetBar } = await import('../src/visual/igs-ui/performance-settings-layout.js');
    const { applyPerformancePreset } = await import('../src/visual/igs-ui/performance-presets.js');
    const reader = {};
    applyPerformancePreset(reader, 'standard');
    const home = renderPerformancePresetBar(reader, { home: true });
    assert.match(home, /演出档位/);
    assert.match(home, /data-action="perf-preset:standard" aria-pressed="true"/);
    assert.match(home, /细项在「阅读器 › 演出」里调/);
    reader.typewriter = { ...reader.typewriter, enabled: false };
    const custom = renderPerformancePresetBar(reader, { home: true });
    assert.doesNotMatch(custom, /aria-pressed="true"/);
    assert.match(custom, /当前为自定义组合/);
    assert.match(renderPerformancePresetBar(reader, { home: true, extraRows: '<div data-x></div>' }), /igs-perf-preset-row">.*<\/div><div data-x><\/div><div class="igs-source-filter-note"/);
});

test('gate:perf-presets:basic-tab-renders-preset-bar-first', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const vn = bootstrapIGS({ global: {}, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'basic', mode: 'pc' }).controller;
        const html = controller.getSnapshot().html;
        assert.ok(html.indexOf('igs-perf-presets') >= 0 && html.indexOf('igs-perf-presets') < html.indexOf('>通用<'));
        const applied = await controller.invoke('perf-preset:light');
        assert.notEqual(applied.ok, false);
        assert.match(controller.getSnapshot().html, /data-action="perf-preset:light" aria-pressed="true"/);
        controller.close();
    } finally {
        vn.destroy();
    }
});
