import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { igsUiLiquidRule } from '../src/styles/ui-material.js';
import { recordPageLayoutClass } from '../src/visual/igs-ui/record-page-shell.js';

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

    const tintedRule = igsUiLiquidRule('.settings::before', 0.26, { tile: true, tint: 'var(--ripple)' });
    assert.match(tintedRule, /background-color:var\(--ripple\)/);
    assert.match(tintedRule, /mask-image:url\(/);
    assert.match(tintedRule, /mask-repeat:repeat/);
    assert.doesNotMatch(tintedRule, /background-image:/);
    assert.match(recordSource, /igsUiLiquidRule\('#igs-record-panel \.igs-rp-page::after', \.25\)/);
    assert.doesNotMatch(recordSource, /tile: true/);
});
