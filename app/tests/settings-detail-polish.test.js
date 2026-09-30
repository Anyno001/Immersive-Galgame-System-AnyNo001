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
    // 生图内容页模板保持完整，且不再重复放 CG 库按钮。
    const auto = getImageSubTabTemplate('auto');
    assert.match(auto, /data-image-pane="auto"/);
    assert.match(auto, /\{\{autoNsfwField\}\}/);
    assert.doesNotMatch(auto, /open-cg-gallery/);
});

test('gate:settings-polish:mood-review-actions-sit-outside-chip', () => {
    const html = renderMoodReviewList([{ word: '嘲弄', character: '爱丽丝' }]);
    const chip = html.match(/<span class="igs-mood-review-chip">[\s\S]*?<\/span><\/span>/)[0];
    assert.doesNotMatch(chip, /<button/);
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
