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
    // 情绪、剧情提示、事件演出合进「情绪与提示」一张卡，组内用小标题分段。
    // 组标题旁是固定概括 + 计数，不再罗列已开启的功能名。
    assert.match(html, /<b>情绪与提示<\/b><span class="igs-perf-count is-on">1\/8<\/span><span class="igs-perf-brief">情绪 · 提示 · 事件<\/span>/);
    assert.match(html, /<div class="igs-settings-subhead">情绪<\/div>[\s\S]*<div class="igs-settings-subhead">剧情提示<\/div>[\s\S]*<div class="igs-settings-subhead">事件演出<\/div>/);
    // 镜头环境与立绘合成「画面」：5 个画面开关 + 立绘活动、情绪动作、多角色同屏。
    assert.match(html, /<b>画面<\/b><span class="igs-perf-count">0\/9<\/span>/);
    // 战斗、直播、手机社区、线上交流、亲密这类只在特定剧情用的，收进「题材专属」，由用户自己勾；演出页不再有剧情题材胶囊。
    assert.match(html, /<b>题材专属<\/b><span class="igs-perf-count">0\/9<\/span>/);
    assert.doesNotMatch(html, /剧情题材|perf-type:/);
    assert.match(html, /<details data-advanced="perf-group-rhythm"><summary><b>节奏与互动<\/b>/);
    assert.equal(PERFORMANCE_GROUPS.length, 5);
    // 每项一行：开着且有细项时只露 › 按钮，细项默认收起，不再有「自定义触发情绪」之类的二级折叠。
    assert.match(html, /data-action="ui-toggle-open:perf-manga-words" aria-expanded="false"/);
    assert.doesNotMatch(html, /mangaFx\.speedLines/);
    assert.match(html, /<i data-shake><\/i><small class="igs-perf-item-hint">冲击时晃屏<\/small><button type="button" class="igs-perf-item-more" data-action="ui-toggle-open:perf-stage-shake"/);
    assert.doesNotMatch(html, /data-shake-detail/);
    assert.doesNotMatch(html, /igs-perf-more/);
    assert.match(html, /data-tw/);
});

// 胶囊数字按分组里实际摆出来的开关算：档位不管的双语、按句分页、同屏、压暗立绘、掷骰也要计入。
test('gate:performance-layout:capsule-counts-every-visible-switch', () => {
    const html = renderPerformanceSettings({ bilingual: { enabled: true }, resultFx: { enabled: true } }, {
        sentencePaging: '<i data-paging></i>', sentencePagingOn: true,
        narrationFilter: '<i data-dim></i>',
    });
    assert.match(html, /<b>文字<\/b><span class="igs-perf-count is-on">2\/6<\/span><span class="igs-perf-brief">打字机 · 字效 · 双语<\/span>/);
    assert.match(html, /<b>画面<\/b><span class="igs-perf-count is-on">1\/10<\/span><span class="igs-perf-brief">镜头 · 天气 · 立绘<\/span>/);
    assert.match(html, /<b>情绪与提示<\/b><span class="igs-perf-count is-on">1\/8<\/span>/);
});

// 角色语气音对所有角色生效，摆在「声音」卡并计入胶囊；不跟打字机挤在「文字」里。
test('gate:performance-layout:voice-bark-lives-in-sound-group', () => {
    const html = renderPerformanceSettings({}, {
        typewriter: '<i data-tw></i>',
        voiceBark: '<i data-voice-bark></i>', voiceBarkOn: true,
    });
    assert.match(html, /<b>声音<\/b><span class="igs-perf-count is-on">1\/5<\/span><span class="igs-perf-brief">音效 · 语气 · 配乐<\/span>/);
    const sound = html.slice(html.indexOf('data-advanced="perf-group-sound"'));
    assert.match(sound.slice(0, sound.indexOf('perf-group-rhythm')), /data-voice-bark/);
    const text = html.slice(html.indexOf('data-advanced="perf-group-text"'), html.indexOf('data-advanced="perf-group-stage"'));
    assert.doesNotMatch(text, /data-voice-bark/);
});

// 行头是横排的：NSFW 显示的几项要各占一行，整串塞进一个行头会把立绘三档挤成一条缝。
test('gate:performance-layout:nsfw-display-options-get-one-row-each', () => {
    const html = renderPerformanceSettings({}, {
        nsfwSprite: '<i data-nsfw-sprite></i>',
        nsfwVeil: '<i data-nsfw-veil></i>',
        nsfwCgPortrait: ['<i data-cg-portrait></i>', '<i data-cg-portrait-detail></i>'],
    }, (key) => key === 'perf-nsfw-cg-portrait');
    const romance = html.slice(html.indexOf('<div class="igs-settings-subhead">亲密</div>'));
    assert.match(romance, /<div class="igs-perf-item"><div class="igs-perf-item-head"><i data-nsfw-sprite><\/i><\/div><\/div><div class="igs-perf-item"><div class="igs-perf-item-head"><i data-nsfw-veil><\/i><\/div><\/div>/);
    assert.match(romance, /<div class="igs-perf-item"><div class="igs-perf-item-head"><i data-cg-portrait><\/i><button type="button" class="igs-perf-item-more is-open" data-action="ui-toggle-open:perf-nsfw-cg-portrait"[^>]*><\/button><\/div><div class="igs-perf-item-body"><i data-cg-portrait-detail><\/i><\/div><\/div>/);
});

// 挂在某个开关下的子项（如节律音效挂在节律演出下）要保留缩进；只有整段细项包在一层 sub 里时才去掉，免得双重缩进。
test('gate:performance-layout:nested-sub-options-keep-their-indent', async () => {
    const { getSettingsStyleText } = await import('../src/visual/igs-ui/settings-style.js');
    const css = getSettingsStyleText();
    assert.ok(css.includes('.igs-perf-item-body>.igs-settings-sub:only-child{margin-left:0;padding-left:0;border-left:0}'));
    assert.ok(!css.includes('.igs-perf-item-body>.igs-settings-sub{'));
    const { renderRomanceFxFields } = await import('../src/visual/igs-ui/romance-fields.js');
    const body = renderRomanceFxFields({ romanceFx: { enabled: true, rhythm: true } });
    assert.match(body, /<div class="igs-perf-item-body">[\s\S]*data-switch="readerSettings\.romanceFx\.rhythm"[^>]*>[\s\S]*?<\/button><div class="igs-settings-sub">[\s\S]*data-switch="readerSettings\.romanceFx\.rhythmSound"/);
});

test('gate:performance-layout:remembers-open-sections', () => {
    const html = renderPerformanceSettings({ mangaFx: { enabled: true } }, {}, (key) => key === 'perf-group-story' || key === 'perf-manga-words');
    assert.match(html, /data-advanced="perf-group-story" open/);
    assert.match(html, /data-action="ui-toggle-open:perf-manga-words" aria-expanded="true"/);
    assert.match(html, /mangaFx\.speedLines/);
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
    assert.match(home, /细项前往「阅读器 › 演出」调整。/);
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

// 档位条走的是 handleSettingsAction 的同步分支，这里按 legacy-preset.test.js 的写法直接注入 ctx.dialogs。
function presetCtx(reader) {
    const draft = { readerSettings: reader };
    const state = { activeSettings: { draft, readerMode: 'pc', asyncState: {} } };
    const ctx = {
        state,
        options: { global: {} },
        dialogs: { confirm: async () => true },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => ({ ok: true }),
        rerenderSettings: () => ({ ok: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, state, reader, asyncState: state.activeSettings.asyncState };
}

test('gate:perf-presets:confirm-only-covers-hand-tuned-combination', async () => {
    const { shouldConfirmPerformancePreset } = await import('../src/visual/igs-ui/performance-presets.js');
    assert.equal(shouldConfirmPerformancePreset({}, 'standard'), false, '全新设置不算自定义');
    const tuned = {};
    applyPerformancePreset(tuned, 'standard');
    tuned.typewriter = { ...tuned.typewriter, enabled: false };
    assert.equal(detectPerformancePreset(tuned), '');
    assert.equal(shouldConfirmPerformancePreset(tuned, 'full'), true, '手调过的组合切档要先确认');
    assert.equal(shouldConfirmPerformancePreset(tuned, 'off'), true, '全部关闭同样是覆盖');
    const exact = {};
    applyPerformancePreset(exact, 'standard');
    assert.equal(shouldConfirmPerformancePreset(exact, 'standard'), false, '同档位重按没有可丢的内容');
    assert.equal(shouldConfirmPerformancePreset(exact, 'full'), false, '档位之间切换没有细调');
    assert.equal(shouldConfirmPerformancePreset(tuned, 'bogus'), false, '未知档位不弹窗');
});

test('gate:perf-presets:cancel-keeps-custom-combination-and-confirm-overwrites', async () => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const reader = {};
    applyPerformancePreset(reader, 'standard');
    reader.typewriter = { ...reader.typewriter, enabled: false };
    const t = presetCtx(reader);
    const before = JSON.parse(JSON.stringify(reader));
    const asked = [];

    t.ctx.dialogs.confirm = async (message) => { asked.push(message); return false; };
    assert.notEqual((await handleSettingsAction('perf-preset:full', t.ctx)).ok, false);
    assert.deepEqual(reader, before, '取消后草稿原样');
    assert.equal(t.asyncState.perfPresetUndo, undefined, '取消不留下可撤销记录');
    assert.match(asked[0], /自定义/, '只在自定义时才问');

    t.ctx.dialogs.confirm = async () => true;
    await handleSettingsAction('perf-preset:full', t.ctx);
    assert.equal(detectPerformancePreset(reader), 'full');
    assert.ok(t.asyncState.perfPresetUndo, '确认覆盖后留下快照');
});

test('gate:perf-presets:exact-preset-click-skips-the-dialog', async () => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const reader = {};
    applyPerformancePreset(reader, 'light');
    const t = presetCtx(reader);
    let asked = 0;
    t.ctx.dialogs.confirm = async () => { asked += 1; return true; };
    await handleSettingsAction('perf-preset:light', t.ctx);
    assert.equal(asked, 0, '同档位重按不问');
    await handleSettingsAction('perf-preset:full', t.ctx);
    assert.equal(asked, 0, '档位之间切换不问');
    assert.equal(detectPerformancePreset(reader), 'full');
});

test('gate:perf-presets:unknown-preset-writes-nothing', async () => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const reader = {};
    applyPerformancePreset(reader, 'standard');
    const t = presetCtx(reader);
    const before = JSON.parse(JSON.stringify(reader));
    let asked = 0;
    t.ctx.dialogs.confirm = async () => { asked += 1; return true; };
    await handleSettingsAction('perf-preset:bogus', t.ctx);
    assert.equal(asked, 0, '未知档位不弹窗');
    assert.deepEqual(reader, before, '未知档位不写草稿');
});

test('gate:perf-presets:undo-restores-custom-combination', async () => {
    const { handleSettingsAction } = await import('../src/visual/igs-ui/settings-actions.js');
    const reader = {};
    applyPerformancePreset(reader, 'standard');
    reader.typewriter = { ...reader.typewriter, enabled: false };
    const custom = JSON.parse(JSON.stringify(reader));
    const t = presetCtx(reader);
    t.ctx.dialogs.confirm = async () => true;

    await handleSettingsAction('perf-preset:full', t.ctx);
    assert.notDeepEqual(reader, custom, '覆盖后确实变了');
    assert.equal(detectPerformancePreset(reader), 'full');

    assert.notEqual((await handleSettingsAction('perf-preset-undo', t.ctx)).ok, false);
    assert.deepEqual(reader, custom, '撤销回到自定义组合');
    assert.equal(detectPerformancePreset(reader), '');
    assert.equal(t.asyncState.perfPresetUndo, null, '撤销后入口收起');

    const afterUndo = JSON.parse(JSON.stringify(reader));
    await handleSettingsAction('perf-preset-undo', t.ctx);
    assert.deepEqual(reader, afterUndo, '没有快照时撤销不改草稿');
});

test('gate:perf-presets:snapshot-round-trips-every-feature-including-fx-sound', async () => {
    const { capturePerformancePreset, restorePerformancePreset } = await import('../src/visual/igs-ui/performance-presets.js');
    const reader = { fxSound: { enabled: false, volume: 42 }, mangaFx: { enabled: true, speedLines: ['震惊'] } };
    const snapshot = capturePerformancePreset(reader);
    assert.equal(Object.keys(snapshot).length, PERFORMANCE_FEATURES.length);
    assert.equal(snapshot.fxSound, false, '演出音效的默认开启特例也要记进快照');
    applyPerformancePreset(reader, 'full');
    assert.equal(restorePerformancePreset(reader, snapshot), true);
    assert.equal(isPerformanceFeatureOn(reader, 'fxSound'), false);
    assert.equal(isPerformanceFeatureOn(reader, 'mangaFx'), true);
    assert.deepEqual(reader.mangaFx.speedLines, ['震惊'], '还原只动开关，细项保持');
    assert.equal(reader.fxSound.volume, 42);
    assert.equal(restorePerformancePreset(reader, { typewriter: true }), false, '残缺快照整体拒绝');
    assert.equal(restorePerformancePreset(reader, null), false);
    assert.equal(restorePerformancePreset(null, snapshot), false);
});

test('gate:perf-presets:undo-entry-renders-only-when-a-snapshot-exists', async () => {
    const { renderPerformancePresetBar } = await import('../src/visual/igs-ui/performance-settings-layout.js');
    const reader = {};
    applyPerformancePreset(reader, 'standard');
    assert.doesNotMatch(renderPerformancePresetBar(reader, { home: true }), /perf-preset-undo/);
    assert.match(renderPerformancePresetBar(reader, { home: true, canUndo: true }), /data-action="perf-preset-undo"/);
    const { renderPerformanceSettings } = await import('../src/visual/igs-ui/performance-settings-layout.js');
    assert.match(renderPerformanceSettings(reader, { canUndo: true }), /data-action="perf-preset-undo"/);
    assert.doesNotMatch(renderPerformanceSettings(reader, {}), /perf-preset-undo/);
});
