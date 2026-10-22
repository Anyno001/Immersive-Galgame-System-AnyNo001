import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapIGS } from '../src/index.js';
import { SETTINGS_PAGES, currentSettingsPage, openSettingsPage, resolveSettingsTarget } from '../src/visual/igs-ui/settings-pages.js';
import { SETTINGS_RECENT_KEY, SETTINGS_RECENT_MAX, loadSettingsRecent, recordSettingsRecent, settingsRecentLabel } from '../src/visual/igs-ui/settings-recent.js';
import { extractPageEntries, mergeSearchEntries, SETTINGS_SEARCH_INDEX, searchSettings } from '../src/visual/igs-ui/settings-search.js';

function memoryStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
}

function openApp(storage = memoryStorage(), options = {}) {
    const vn = bootstrapIGS({
        global: { localStorage: storage },
        autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    const opened = vn.openSettings({ mode: 'pc', ...options });
    return { vn, opened, controller: opened.controller, storage };
}

test('gate:settings-pages:dashboard-lists-categories-with-status-and-onboarding', () => {
    const { vn, controller } = openApp();
    try {
        const snap = controller.getSnapshot();
        assert.equal(snap.page, 'dash');
        assert.equal(snap.tab, 'dash');
        const html = snap.html;
        // 档位条在最上面，随后是分类行；没有最近改动时不出现「最近改过」。
        assert.ok(html.indexOf('igs-perf-presets') < html.indexOf('igs-dash-list'));
        for (const cat of ['style', 'text', 'ui', 'perf', 'sound', 'chars', 'scenes', 'ai', 'data']) {
            assert.match(html, new RegExp(`class="igs-dash-row" data-cat="${cat}"`), cat);
        }
        assert.doesNotMatch(html, /class="igs-dash-row" data-cat="dash"/);
        assert.match(html, /data-cat="perf"><span class="igs-dash-row-name">演出<\/span><span class="igs-dash-row-status">开\d+项</);
        assert.match(html, /data-cat="sound"><span class="igs-dash-row-name">声音<\/span><span class="igs-dash-row-status">开\d+项</);
        assert.match(html, /data-cat="ui"><span class="igs-dash-row-name">界面<\/span><span class="igs-dash-row-status">(顶部固定|紧贴对话框)</);
        assert.match(html, /data-cat="data"><span class="igs-dash-row-name">数据<\/span><span class="igs-dash-row-status">备份 · 日志</);
        assert.doesNotMatch(html, /最近改过/);
        assert.match(html, /data-action="onboarding-start"[^>]*>新手引导</);
        assert.match(html, /细项在「演出」「声音」里调整/);
        // 世界观、画质两行挂在档位条里。
        assert.match(html, /data-worldview-select|igs-quality-row|data-action="quality:/);
    } finally {
        vn.destroy();
    }
});

test('gate:settings-pages:dashboard-shows-recent-changes-newest-first', () => {
    const storage = memoryStorage();
    for (const [index, path] of ['readerSettings.fontSize', 'readerSettings.cinemaBars', 'readerSettings.toolbarDock'].entries()) {
        recordSettingsRecent(storage, { path, label: `项${index}`, page: 'ui' });
    }
    const { vn, controller } = openApp(storage);
    try {
        const html = controller.getSnapshot().html;
        assert.match(html, /最近改过/);
        assert.ok(html.indexOf('data-recent-path="readerSettings.toolbarDock"') < html.indexOf('data-recent-path="readerSettings.fontSize"'));
        assert.match(html, /data-recent-path="readerSettings.cinemaBars" data-recent-page="ui"/);
    } finally {
        vn.destroy();
    }
});

test('gate:settings-pages:recent-store-dedupes-caps-and-ignores-bad-data', () => {
    const storage = memoryStorage();
    for (let i = 0; i < 8; i += 1) recordSettingsRecent(storage, { path: `a.b${i}`, label: `项${i}`, page: 'ui' });
    recordSettingsRecent(storage, { path: 'a.b3', label: '项3', page: 'text' });
    const list = loadSettingsRecent(storage);
    assert.equal(list.length, SETTINGS_RECENT_MAX);
    assert.deepEqual(list.map((item) => item.path), ['a.b3', 'a.b7', 'a.b6', 'a.b5', 'a.b4']);
    assert.equal(list[0].page, 'text');
    assert.equal(recordSettingsRecent(storage, { path: '', label: 'x', page: 'ui' }), null);
    storage.setItem(SETTINGS_RECENT_KEY, '{broken');
    assert.deepEqual(loadSettingsRecent(storage), []);
    assert.deepEqual(loadSettingsRecent(null), []);
    // 就近取标签：字段的 span、开关自己的主文字。
    const span = { textContent: '字体大小' };
    assert.equal(settingsRecentLabel({ className: 'x', closest: () => ({ querySelector: () => span }) }), '字体大小');
    const small = { textContent: '备注' };
    const sw = { className: 'igs-switch is-on', querySelector: () => ({ textContent: '电影黑边备注', querySelector: () => small }) };
    assert.equal(settingsRecentLabel(sw), '电影黑边');
});

test('gate:settings-pages:category-click-remembers-page-and-legacy-switches-map', () => {
    const { vn, controller } = openApp();
    try {
        assert.equal(controller.switchTab('perf').snapshot.page, 'perf-text');
        const perf = controller.getSnapshot().html;
        // 演出五个子页一行放着（可横向滚动），不再套折叠卡。
        for (const page of ['perf-text', 'perf-stage', 'perf-story', 'perf-special', 'perf-rhythm']) assert.match(perf, new RegExp(`data-page="${page}"`));
        assert.doesNotMatch(perf, /data-advanced="perf-group-/);
        assert.match(perf, /class="igs-settings-title">演出</);
        assert.equal(controller.switchPage('perf-stage').snapshot.page, 'perf-stage');
        controller.switchTab('style');
        assert.equal(controller.switchTab('perf').snapshot.page, 'perf-stage', '回到分类时落在上次停留的那一页');
        assert.equal(controller.switchPage('sound').snapshot.tab, 'sound');
        // 只有一页的分类没有子页条。
        controller.switchTab('style');
        assert.doesNotMatch(controller.getSnapshot().html, /class="igs-page-tabs"/);
        // 旧的子页切换都映射到新页面。
        assert.equal(controller.switchReaderSubTab('performance').snapshot.page, 'perf-text');
        assert.equal(controller.switchReaderSubTab('interface').snapshot.page, 'ui-reader');
        // 旧页 id 'ui' 仍可打开，指到第一个子页。
        assert.equal(controller.switchPage('ui').snapshot.page, 'ui-reader');
        assert.equal(controller.switchTab('ui').snapshot.page, 'ui-reader');
        assert.equal(controller.switchSceneSubTab('rules').snapshot.page, 'rules');
        assert.equal(controller.switchSceneSubTab('characters').snapshot.page, 'chars');
        assert.equal(controller.switchImageSubTab('cg').snapshot.page, 'cglib');
        assert.equal(controller.switchImageSubTab('auto').snapshot.page, 'kinds');
        assert.equal(controller.switchTab('image').snapshot.page, 'source');
        assert.equal(controller.switchTab('basic').snapshot.page, 'dash');
    } finally {
        vn.destroy();
    }
});

test('gate:settings-pages:ui-page-leads-with-reader-card-and-ai-parse-page-keeps-cards', () => {
    const { vn, controller } = openApp();
    try {
        const ui = controller.switchPage('ui').snapshot.html;
        assert.ok(ui.indexOf('>阅读器</div>') > 0);
        assert.match(ui, /igs-key-block/);
        assert.doesNotMatch(ui, />背景图/);
        assert.match(controller.switchPage('ui-bg').snapshot.html, />背景图/);
        assert.match(ui, /data-segment-path="bridge.openMode"/);
        assert.match(ui, /data-switch="bridge.showToasts"/);
        const parse = controller.switchPage('parse').snapshot.html;
        assert.match(parse, /data-advanced="source-filter"/);
        assert.match(parse, /data-advanced="body-format"/);
        const backup = controller.switchPage('data').snapshot.html;
        assert.match(backup, /data-action="settings-export-all"/);
        assert.match(backup, /data-path="bridge.imageCache.maxCount"/);
        assert.match(backup, /data-action="purge-asset-cache"/);
        assert.match(backup, /配置不含素材图片和API Key/);
        assert.doesNotMatch(controller.switchPage('cglib').snapshot.html, /purge-asset-cache/);
    } finally {
        vn.destroy();
    }
});

test('gate:settings-pages:last-page-uses-new-format-and-reads-old-format', () => {
    const storage = memoryStorage();
    {
        const { vn, controller } = openApp(storage);
        controller.switchPage('wardrobe');
        assert.deepEqual(JSON.parse(storage.getItem('igs:settings-last-page:v1')), { tab: 'chars', page: 'wardrobe' });
        controller.close();
        vn.destroy();
    }
    {
        const { vn, controller } = openApp(storage, {});
        assert.equal(controller.getSnapshot().page, 'wardrobe');
        controller.close();
        vn.destroy();
    }
    storage.setItem('igs:settings-last-page:v1', JSON.stringify({ tab: 'scene', readerSubTab: 'dialog', sceneSubTab: 'review', imageSubTab: 'source' }));
    {
        const { vn, controller } = openApp(storage);
        assert.equal(controller.getSnapshot().page, 'review');
        controller.close();
        vn.destroy();
    }
    storage.setItem('igs:settings-last-page:v1', JSON.stringify({ tab: 'reader', readerSubTab: 'performance' }));
    {
        const { vn, controller } = openApp(storage);
        assert.equal(controller.getSnapshot().page, 'perf-text');
        controller.close();
        vn.destroy();
    }
});

test('gate:settings-pages:open-targets-accept-new-pages-and-legacy-tabs', () => {
    {
        const { vn, controller } = openApp(memoryStorage(), { page: 'review' });
        assert.equal(controller.getSnapshot().page, 'review');
        vn.destroy();
    }
    {
        const { vn, controller } = openApp(memoryStorage(), { tab: 'scene' });
        assert.equal(controller.getSnapshot().page, 'chars');
        vn.destroy();
    }
    {
        const { vn, controller } = openApp(memoryStorage({ 'igs:settings-last-page:v1': JSON.stringify({ tab: 'perf', page: 'perf-special' }) }), { tab: 'perf' });
        assert.equal(controller.getSnapshot().page, 'perf-special', '只给分类时回到上次停留的那一页');
        vn.destroy();
    }
    const fake = { tab: 'dash', asyncState: {} };
    assert.equal(openSettingsPage(fake, 'wardrobe'), 'wardrobe');
    assert.equal(fake.tab, 'chars');
    assert.equal(fake.asyncState.page, 'wardrobe');
    assert.equal(currentSettingsPage({ tab: 'scene', asyncState: { sceneSubTab: 'scenes' } }), 'scenes');
    assert.deepEqual(resolveSettingsTarget({ tab: 'reader', readerSubTab: 'performance', open: ['perf-group-stage', 'perf-camera'] }).open, ['perf-camera']);
});

// ---------- 自动索引 ----------

test('gate:settings-search:auto-index-extracts-fields-switches-titles-and-fold-keys', () => {
    const html = [
        '<div class="igs-source-filter-title">风格<button>x</button></div>',
        '<label class="igs-settings-field"><span>对话框&amp;风格</span><select data-path="readerSettings.dialogSkin"></select></label>',
        '<details data-advanced="outer"><summary><b>折叠卡</b></summary>',
        '<details data-advanced="inner"><summary>连接与采样</summary>',
        '<label class="igs-settings-field"><span>步数</span><input data-path="a.steps"></label>',
        '</details></details>',
        '<div class="igs-perf-item"><div class="igs-perf-item-head"><button type="button" class="igs-switch is-on" data-switch="a.on" aria-pressed="true"><i></i><span>某功能</span></button>',
        '<button type="button" class="igs-perf-item-more" data-action="ui-toggle-open:perf-feature"></button></div>',
        '<div class="igs-perf-item-body"><div class="igs-settings-subhead">角色名</div><label class="igs-settings-field"><span>颜色</span><input data-path="a.color"></label></div></div>',
        '<div class="igs-segmented" role="radiogroup" aria-label="朗读来源"><button data-segment-path="a.provider" data-segment-value="x"></button></div>',
        '<label class="igs-settings-field"><span>已在分段里</span><div class="igs-segmented" aria-label="x"><button data-segment-path="a.seg"></button></div></label>',
    ].join('');
    const entries = extractPageEntries('text', html);
    const by = (path) => entries.find((item) => item.path === path);
    assert.equal(by('readerSettings.dialogSkin').label, '对话框&风格');
    assert.deepEqual(by('a.steps').open, ['outer', 'inner']);
    assert.deepEqual(by('a.on').open, [], '行头里的开关不需要先展开');
    assert.deepEqual(by('a.color').open, ['perf-feature'], '细项要先展开所在演出行');
    assert.equal(by('a.color').label, '角色名 颜色', '太短的标签前面补上最近的小标题');
    assert.equal(by('a.provider').label, '朗读来源');
    assert.equal(entries.filter((item) => item.path === 'a.seg').length, 1, '同一个 path 只记一次');
    assert.ok(entries.some((item) => item.kind === 'title' && item.label === '风格'));
    assert.ok(entries.some((item) => item.kind === 'title' && item.label === '折叠卡' && item.open.length === 1));
    assert.ok(entries.every((item) => item.page === 'text'));
});

test('gate:settings-search:merge-prefers-handwritten-entries-on-same-page-and-name', () => {
    const merged = mergeSearchEntries(SETTINGS_SEARCH_INDEX, [
        { page: 'perf-text', label: '打字机', path: 'readerSettings.typewriter.enabled', open: [], kind: 'switch' },
        { page: 'text', label: '全新的项', path: 'a.b', open: ['x'], kind: 'field' },
    ]);
    assert.equal(merged.filter((entry) => entry.label === '打字机' && entry.target.page === 'perf-text').length, 1);
    const typewriter = merged.find((entry) => entry.label === '打字机');
    assert.ok(typewriter.aliasKeys.includes('打字音'), '保留手写条目的口语别名');
    const fresh = merged.find((entry) => entry.label === '全新的项');
    assert.deepEqual({ ...fresh.target, open: [...fresh.target.open] }, { page: 'text', open: ['x'], path: 'a.b' });
    assert.equal(fresh.location, '文字');
});

test('gate:settings-search:auto-index-is-lazy-cached-and-jumps-to-field', () => {
    const { vn, controller } = openApp();
    try {
        const index = controller.getSearchIndex();
        assert.ok(index.length > SETTINGS_SEARCH_INDEX.length, '自动条目并进了手写索引');
        assert.equal(controller.getSearchIndex(), index, '同一次打开只建一次');
        const field = index.find((entry) => entry.target.path === 'bridge.autoIllustration.nai.steps');
        assert.ok(field, '折叠里的字段也进了索引');
        assert.equal(field.target.page, 'source');
        assert.ok(field.target.open.includes('nai'));
        assert.equal(field.location, '生图与AI › 图像来源');
        // 口语别名和旧叫法还在。
        assert.equal(searchSettings('副api', index)[0].target.page, 'llm');
        assert.ok(searchSettings('皮肤', index).some((entry) => entry.id === 'dialog-skin'));
        // 点搜索结果：切到那一页并展开所在折叠。
        const jumped = controller.goToSetting(field.id);
        assert.equal(jumped.snapshot.page, 'source');
        assert.match(controller.getSnapshot().html, /data-advanced="nai" open/);
        // 回到仪表盘「最近改过」：按 path 找回页面。
        controller.switchTab('dash');
        assert.equal(controller.goToPath('readerSettings.fontSize', 'text').snapshot.page, 'text');
    } finally {
        vn.destroy();
    }
});

test('gate:settings-search:auto-index-covers-every-data-path-and-switch-on-every-page', () => {
    const { vn, controller } = openApp();
    try {
        const index = controller.getSearchIndex();
        const covered = new Set(index.map((entry) => entry.target.path).filter(Boolean));
        // 按角色、衣柜、预置CG 动态生成的字段不在索引里（这些列表不进索引模式）。
        const dynamic = /^bridge\.sceneAssets\.(characters|scenes|characterOutfits|characterDna|characterAliases|statusAvatars|wardrobe|eventCgs|characterVoices)\b/;
        const missing = [];
        let checked = 0;
        for (const [page] of SETTINGS_PAGES) {
            if (page === 'dash') continue;
            const html = controller.switchPage(page).snapshot.html;
            for (const match of html.matchAll(/data-(?:path|switch|segment-path)="([^"]+)"/g)) {
                const path = match[1];
                checked += 1;
                if (!covered.has(path) && !dynamic.test(path)) missing.push(`${page}:${path}`);
            }
        }
        assert.ok(checked > 200, `页面里带路径的项太少：${checked}`);
        assert.deepEqual(missing, [], '这些项没进自动索引');
    } finally {
        vn.destroy();
    }
});
