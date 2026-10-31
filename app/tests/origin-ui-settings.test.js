import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SETTINGS_CATEGORIES, SETTINGS_PAGES, categoryOfPage, defaultPageOfCategory, normalizeSettingsTab, resolveSettingsPage,
} from '../src/visual/igs-ui/settings-pages.js';
import { normalizeBridgeConfig } from '../src/visual/igs-ui/settings-host-normalize.js';
import {
    ORIGIN_SETTINGS_DEFAULTS, normalizeOriginSettings, originBoundRole, originPersona, visibleOriginMenuPages, visibleOriginTabs,
} from '../src/visual/igs-ui/origin-settings.js';
import { getPageTemplate } from '../src/visual/igs-ui/settings-tabs.js';

test('设置器分类：「随身系统」紧跟「数值系统」，页面指回自己的分类', () => {
    const ids = SETTINGS_CATEGORIES.map(([id]) => id);
    assert.equal(ids[ids.indexOf('stats') + 1], 'origin');
    assert.equal(SETTINGS_CATEGORIES.find(([id]) => id === 'origin')[1], '随身系统');
    assert.ok(SETTINGS_PAGES.some(([id, , category]) => id === 'origin' && category === 'origin'));
    assert.equal(categoryOfPage('origin'), 'origin');
    assert.equal(defaultPageOfCategory('origin'), 'origin');
    assert.equal(normalizeSettingsTab('origin'), 'origin');
    assert.equal(resolveSettingsPage({ tab: 'origin' }), 'origin');
});

test('随身系统设置：总开关默认关，所有项有默认值，非法值回落', () => {
    const d = normalizeOriginSettings(undefined);
    assert.equal(d.enabled, false);
    for (const key of Object.keys(ORIGIN_SETTINGS_DEFAULTS)) assert.ok(Object.hasOwn(d, key), key);
    assert.deepEqual(d.mods, { stat: true, bag: true, shop: true, gacha: true, ach: true, chat: true });
    const bad = normalizeOriginSettings({ enabled: 'yes', freq: 99, limitMin: -5, taskSource: 'x', rpChat: 7, personality: '未知', drawCost: 'abc', mods: { shop: false, bag: 'no' }, sysName: '   ' });
    assert.equal(bad.enabled, false);
    assert.equal(bad.freq, 10);
    assert.equal(bad.limitMin, 0);
    assert.equal(bad.taskSource, 'auto');
    assert.equal(bad.rpChat, 'auto');
    assert.equal(bad.personality, '冷澈');
    assert.equal(bad.drawCost, ORIGIN_SETTINGS_DEFAULTS.drawCost);
    assert.equal(bad.mods.shop, false);
    assert.equal(bad.mods.bag, true);
    assert.equal(bad.sysName, '随身系统');
    assert.equal(normalizeOriginSettings({}).sysName, '随身系统');
    // 不改入参：存储里的配置可能是共享只读对象。
    const frozen = Object.freeze({ enabled: true, mods: Object.freeze({ shop: false }) });
    assert.equal(normalizeOriginSettings(frozen).enabled, true);
});

test('设置存储路径 bridge.origin：整份 bridge 规范化会带上默认值，不碰入参', () => {
    const input = Object.freeze({ origin: Object.freeze({ enabled: true, freq: 5 }) });
    const out = normalizeBridgeConfig(input);
    assert.equal(out.origin.enabled, true);
    assert.equal(out.origin.freq, 5);
    assert.equal(out.origin.drawCost, 300);
    assert.equal(normalizeBridgeConfig({}).origin.enabled, false);
    assert.equal(input.origin.drawCost, undefined);
});

test('悬浮窗页签：首屏五个，属性 / 成就 / 记录在 ⋯ 里；模块关掉的不显示；绑定了角色时「对话」改称「私聊」', () => {
    assert.deepEqual(visibleOriginTabs({ enabled: true }).map((t) => t.id), ['task', 'bag', 'shop', 'gacha', 'chat']);
    assert.deepEqual(visibleOriginMenuPages({ enabled: true }).map((t) => t.id), ['stat', 'ach', 'log']);
    const off = { enabled: true, mods: { shop: false, gacha: false, chat: false, stat: false, ach: false } };
    assert.deepEqual(visibleOriginTabs(off).map((t) => t.id), ['task', 'bag']);
    assert.deepEqual(visibleOriginMenuPages(off).map((t) => t.id), ['log']);
    const rp = visibleOriginTabs({ enabled: true, bindTo: '林晚' }).find((t) => t.id === 'chat');
    assert.equal(rp.label, '私聊');
    assert.equal(originBoundRole({ bindTo: '宿主' }), '');
    assert.equal(originBoundRole({ bindTo: '林晚' }), '林晚');
    assert.match(originPersona({ personality: '傲娇' }), /别扭/);
    assert.equal(originPersona({ personaText: '  自定义  ' }), '自定义');
});

test('设置页模板：总开关、关闭时隐藏的整块、署名与链接', () => {
    const tpl = getPageTemplate('origin');
    assert.match(tpl, /\{\{originToggle\}\}/);
    assert.match(tpl, /<div class="igs-settings-sub"\{\{originHidden\}\}>/);
    assert.match(tpl, /\{\{originCredit\}\}/);
    // 原插件独立 API 的三项不带过来。
    assert.doesNotMatch(tpl, /apiUrl|apiKey|apiModel/);
});
