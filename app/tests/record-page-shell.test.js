import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { igsUiLiquidRule } from '../src/styles/ui-material.js';
import { recordPageHeadHtml, recordPageLayoutClass } from '../src/visual/igs-ui/record-page-shell.js';

test('record-page-shell:layout-class-follows-container-breakpoints', () => {
    // 宽屏：无附加类
    assert.equal(recordPageLayoutClass(1440, 900), '');
    assert.equal(recordPageLayoutClass(1100, 900), '');
    // 中间宽度 768–1100
    assert.equal(recordPageLayoutClass(1024, 768), 'igs-rp-mid');
    assert.equal(recordPageLayoutClass(768, 800), 'igs-rp-mid');
    // 窄屏 <768
    assert.equal(recordPageLayoutClass(767, 800), 'igs-rp-narrow');
    assert.equal(recordPageLayoutClass(390, 844), 'igs-rp-narrow');
    assert.equal(recordPageLayoutClass(320, 640), 'igs-rp-narrow');
    // 短容器 H<600 叠加，与宽度规则共存
    assert.equal(recordPageLayoutClass(390, 500), 'igs-rp-narrow igs-rp-short');
    assert.equal(recordPageLayoutClass(1440, 500), 'igs-rp-short');
    assert.equal(recordPageLayoutClass(1024, 599), 'igs-rp-mid igs-rp-short');
    // 边界：600 不算短
    assert.equal(recordPageLayoutClass(390, 600), 'igs-rp-narrow');
});

test('record-page-shell:head-html-escapes-nothing-but-keeps-back-hit-target', async () => {
    const { recordPageHeadHtml } = await import('../src/visual/igs-ui/record-page-shell.js');
    const html = recordPageHeadHtml('珍藏心事');
    assert.match(html, /class="igs-rp-head"/);
    assert.match(html, /class="igs-rp-back"/);
    assert.match(html, /data-record-act="close"/);
    assert.match(html, /aria-label="返回"/);
    assert.match(html, /<h2 class="igs-rp-title">珍藏心事<\/h2>/);
    const mapHtml = recordPageHeadHtml('地点地图', { closeAttr: 'data-map-act', backAriaLabel: '关闭地图' });
    assert.match(mapHtml, /data-map-act="close"/);
    assert.match(mapHtml, /aria-label="关闭地图"/);
});

test('record-page-shell:caustic-tiles-only-in-settings', () => {
    const pageRule = igsUiLiquidRule('.record-page::after', 0.5);
    assert.match(pageRule, /background-position:left top/);
    assert.match(pageRule, /background-repeat:no-repeat/);
    assert.match(pageRule, /mask-image:linear-gradient\(135deg/);

    const settingsRule = igsUiLiquidRule('.settings::before', 0.45, { tile: true });
    assert.match(settingsRule, /background-position:left top/);
    assert.match(settingsRule, /background-repeat:repeat/);
    assert.doesNotMatch(settingsRule, /mask-image:/);

    const settingsSource = readFileSync(
        new URL('../src/visual/igs-ui/settings-style.js', import.meta.url),
        'utf8',
    );
    const recordSource = readFileSync(
        new URL('../src/visual/igs-ui/record-page-shell-style.js', import.meta.url),
        'utf8',
    );
    assert.match(settingsSource, /igsUiLiquidRule\('#igs-unified-settings::before', \.2, \{ tile: true, tint: 'var\(--igs-settings-ripple\)' \}\)/);
    // 电脑设备（精确指针 + 悬停）不铺设置器水波纹大背景，触屏保留。
    assert.match(settingsSource, /@media \(hover:hover\) and \(pointer:fine\)\{#igs-unified-settings::before\{content:none\}\}/);

    const tintedRule = igsUiLiquidRule('.settings::before', 0.26, { tile: true, tint: 'var(--ripple)' });
    assert.match(tintedRule, /background-color:var\(--ripple\)/);
    assert.match(tintedRule, /mask-image:url\(/);
    assert.match(tintedRule, /mask-repeat:repeat/);
    assert.doesNotMatch(tintedRule, /background-image:/);
    // 资料页照搬设置器的后景：同一套主题色平铺水纹，浓度随配色走。
    assert.match(recordSource, /igsUiLiquidRule\('#igs-record-panel \.igs-rp-page::after', \.2, \{ tile: true, tint: 'var\(--igs-rp-ripple\)' \}\)/);
    assert.doesNotMatch(recordSource, /BLUR_VIVID/);
    // 资料页后景叠柔光提亮，回退分支同样叠加。
    assert.equal((recordSource.match(/background:var\(--igs-rp-lift\),var\(--igs-rp-backdrop(-solid)?\)/g) || []).length, 3);
});

test('record-page-shell:record-pages-share-settings-palettes', async () => {
    const { RECORD_PAGE_SHELL_STYLE_TEXT } = await import('../src/visual/igs-ui/record-page-shell-style.js');
    const { SETTINGS_THEME_OPTIONS, getSettingsThemePalette } = await import('../src/visual/igs-ui/settings-theme.js');
    for (const { value } of SETTINGS_THEME_OPTIONS) {
        const palette = getSettingsThemePalette(value);
        const selector = value === 'landmine' ? '#igs-record-panel\\{' : `#igs-record-panel\\[data-rp-theme="${value}"\\]\\{`;
        const rule = new RegExp(`${selector}[^}]*--igs-rp-accent:${palette.tokens.accent.replace(/[().]/g, '\\$&')};[^}]*--igs-rp-backdrop:${palette.backdrop.replace(/[().]/g, '\\$&')};`);
        assert.match(RECORD_PAGE_SHELL_STYLE_TEXT, rule, value);
    }
    const html = recordPageHeadHtml('你的背包', { trailing: '<i>swatch</i>' });
    assert.match(html, /<h2 class="igs-rp-title">你的背包<\/h2><div class="igs-rp-head-end"><i>swatch<\/i><\/div>/);
    assert.doesNotMatch(recordPageHeadHtml('地点地图'), /igs-rp-head-end/);
});
