import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_SUBTAB_DEFS, getImageSubTabTemplate } from '../src/visual/igs-ui/settings-tabs.js';
import { renderMoodReviewList } from '../src/visual/igs-ui/settings-fields.js';
import { renderStageDirectionFields } from '../src/visual/igs-ui/stage-direction-fields.js';

test('gate:settings-polish:image-tab-has-cg-gallery-pane', () => {
    assert.deepEqual(IMAGE_SUBTAB_DEFS.map(([id]) => id), ['source', 'auto', 'logs', 'cg']);
    const cg = getImageSubTabTemplate('cg');
    assert.match(cg, /data-image-pane="cg"/);
    assert.match(cg, /\{\{imageCgList\}\}/);
    assert.match(cg, /data-action="image-cg-refresh"/);
    assert.match(cg, /data-action="image-cg-delete-selected"/);
    assert.match(cg, /data-action="image-cg-delete-all"/);
    // 生图内容页模板保持完整，且不再重复放 CG 库按钮。
    const auto = getImageSubTabTemplate('auto');
    assert.match(auto, /data-image-pane="auto"/);
    assert.match(auto, /\{\{autoNsfwField\}\}/);
    assert.doesNotMatch(auto, /open-cg-gallery/);
});

test('gate:settings-polish:mood-review-actions-sit-outside-chip', () => {
    const html = renderMoodReviewList([{ word: '嘲弄', character: '爱丽丝' }]);
    const chip = html.match(/<span class="igs-mood-review-chip">[\s\S]*?<\/span>/)[0];
    assert.doesNotMatch(chip, /<button/);
    assert.doesNotMatch(html, /爱丽丝/, '标签不带所属角色');
    assert.match(html, /<\/span><button type="button" class="igs-review-link is-primary" data-action="mood-review-assign:[^"]+"[^>]*>加入<\/button>/);
    assert.match(html, /data-action="mood-review-dismiss:[^"]+"[^>]*>忽略<\/button>/);
    assert.doesNotMatch(html, />×</);
});

test('gate:settings-polish:daily-petals-share-the-kind-grid', () => {
    const reader = { dailyFx: { enabled: true, petals: true, photoAlbum: true } };
    const { daily } = renderStageDirectionFields(reader, (key, label, body) => body);
    const grid = daily.match(/<div class="igs-source-filter-grid">([\s\S]*?)<\/div>/)[1];
    assert.match(grid, /樱花、落叶飘落/);
    assert.match(grid, /拍照存入 CG 库/);
});


test('gate:settings-polish:asset-review-buttons-are-grouped-and-aligned', async () => {
    const { renderAssetReviewPanel, ASSET_REVIEW_STYLE_TEXT } = await import('../src/visual/igs-ui/asset-review-panel.js');
    const mk = () => ({
        children: [], attrs: {}, className: '', textContent: '',
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return this.attrs[k]; },
        removeAttribute(k) { delete this.attrs[k]; },
        addEventListener() {},
        appendChild(c) { this.children.push(c); return c; },
        append(...cs) { this.children.push(...cs); },
        removeChild(c) { this.children = this.children.filter((x) => x !== c); },
        get firstChild() { return this.children[0] || null; },
    });
    const container = mk();
    container.ownerDocument = { createElement: mk };
    renderAssetReviewPanel(container, [{ key: 'a', type: 'sprite', name: '爱丽丝', previewUrl: '' }]);
    const buttons = [];
    const walk = (el) => { if (el.attrs && el.attrs['data-asset-review-act']) buttons.push(el); (el.children || []).forEach(walk); };
    walk(container);
    assert.deepEqual(buttons.map((b) => b.attrs['data-asset-review-act']), ['library', 'library-dna', 'chat', 'discarded']);
    assert.deepEqual(buttons.map((b) => b.className), ['is-primary', 'is-primary', '', '']);
    assert.ok(ASSET_REVIEW_STYLE_TEXT.includes('.igs-asset-review-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
    assert.ok(ASSET_REVIEW_STYLE_TEXT.includes('.igs-asset-review-actions button.is-primary{grid-column:1/-1'));
    // 仍保持无描边（v0.32.13），但有底色与键盘焦点外框。
    assert.ok(/\.igs-asset-review-actions button\{[^}]*border:0;[^}]*min-height:28px|\.igs-asset-review-actions button\{[^}]*min-height:28px[^}]*border:0;/.test(ASSET_REVIEW_STYLE_TEXT));
    assert.ok(ASSET_REVIEW_STYLE_TEXT.includes('.igs-asset-review-actions button:focus-visible{'));
});

test('gate:settings-polish:toast-follows-dialog-skin', async () => {
    const { getDialogSkinStyleText } = await import('../src/visual/igs-ui/dialog-skin-style.js');
    const base = { base: 'https://cdn.example/dist/skins/' };
    const pink = getDialogSkinStyleText('cute-pink', base);
    assert.ok(pink.includes('#igs-overlay[data-igs-dialog-skin="cute-pink"] #igs-toast{background:#fff;'));
    assert.ok(/#igs-toast\{[^}]*color:#6b4454;/.test(pink));
    assert.ok(getDialogSkinStyleText('gradient-veil', base).includes('#igs-overlay[data-igs-dialog-skin="gradient-veil"] #igs-toast{background:rgba(0,0,0,.62);'));
    assert.ok(getDialogSkinStyleText('elegant-european', base).includes('#igs-overlay[data-igs-dialog-skin="elegant-european"] #igs-toast{background:rgba(6,6,12,.82);'));
    // 只注入当前皮肤；无专属主题的默认皮肤仍走设置器配色兜底。
    assert.ok(!pink.includes('data-igs-dialog-skin="plant-coffee"] #igs-toast'));
    assert.equal(getDialogSkinStyleText('default'), '');
});

test('gate:settings-polish:mood-review-rows-align-buttons', async () => {
    const mod = await import('../src/visual/igs-ui/settings-style.js');
    const css = Object.values(mod).filter((v) => typeof v === 'string').join('\n')
        || (typeof mod.getSettingsStyleText === 'function' ? mod.getSettingsStyleText() : '');
    assert.ok(css.includes('.igs-mood-review-list{display:flex;flex-direction:column;'));
    assert.ok(css.includes('.igs-mood-review-item{display:grid;grid-template-columns:minmax(0,1fr) auto auto;'));
    assert.ok(css.includes('.igs-mood-review-item .igs-review-link{min-width:52px;min-height:28px;'));
});
