import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createMemoryStorage } from '../src/index.js';
import {
    addAssetFolder, forgetAssetItem, groupAssetsByFolder, loadAssetFolders, moveAssetToFolder,
    removeAssetFolder, renameAssetFolder, renameAssetItem, saveAssetFolders, setAssetView, toggleAssetFolder,
} from '../src/visual/igs-ui/asset-folders.js';
import { renderAssetFolderView, renderAssetFolderSelect } from '../src/visual/igs-ui/asset-folder-view.js';

test('asset-folders: group, move, rename and remove without losing items', () => {
    let s = addAssetFolder(null, 'scenes', '学校');
    s = addAssetFolder(s, 'scenes', '学校');
    assert.deepEqual(s.scenes.folders, ['学校']);
    s = moveAssetToFolder(s, 'scenes', '教室', '学校');
    s = moveAssetToFolder(s, 'scenes', '走廊', '不存在');
    assert.equal(s.scenes.assign['教室'], '学校');
    assert.equal(Object.prototype.hasOwnProperty.call(s.scenes.assign, '走廊'), false);

    const groups = groupAssetsByFolder(s, 'scenes', ['教室', '走廊', '海边']);
    assert.deepEqual(groups, [{ folder: '学校', items: ['教室'] }, { folder: '', items: ['走廊', '海边'] }]);

    s = renameAssetFolder(s, 'scenes', '学校', '校园');
    assert.equal(s.scenes.assign['教室'], '校园');
    s = renameAssetItem(s, 'scenes', '教室', '一年级教室');
    assert.equal(s.scenes.assign['一年级教室'], '校园');
    s = toggleAssetFolder(s, 'scenes', '校园');
    assert.deepEqual(s.scenes.collapsed, ['校园']);
    s = removeAssetFolder(s, 'scenes', '校园');
    assert.deepEqual(s.scenes.folders, []);
    assert.deepEqual(Object.keys(s.scenes.assign), []);
    assert.deepEqual(s.scenes.collapsed, []);
    assert.deepEqual(s.characters.folders, []);
});

test('asset-folders: stored per preset and tolerant of broken storage', () => {
    const storage = createMemoryStorage();
    let a = moveAssetToFolder(addAssetFolder(null, 'characters', '主角'), 'characters', '爱丽丝', '主角');
    a = setAssetView(a, 'characters', 'grid');
    assert.equal(saveAssetFolders(storage, '预设A', a), true);
    assert.equal(saveAssetFolders(storage, '预设B', addAssetFolder(null, 'scenes', '户外')), true);

    const loadedA = loadAssetFolders(storage, '预设A');
    assert.equal(loadedA.characters.assign['爱丽丝'], '主角');
    assert.equal(loadedA.characters.view, 'grid');
    assert.deepEqual(loadAssetFolders(storage, '预设B').scenes.folders, ['户外']);
    assert.deepEqual(loadAssetFolders(storage, '其他').characters.folders, []);
    assert.deepEqual(Object.keys(forgetAssetItem(loadedA, 'characters', '爱丽丝').characters.assign), []);

    storage.setItem('igs-asset-folders-v1', '{broken');
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        assert.deepEqual(loadAssetFolders(storage, '预设A').characters.folders, []);
    } finally {
        console.warn = originalWarn;
    }
});

test('asset-folder-view: list keeps original renderer, grid shows thumbnails', () => {
    const entries = { 教室: 'https://example.com/a.png', 海边: '' };
    const seen = [];
    const renderList = (subset) => { seen.push(Object.keys(subset)); return `<ul>${Object.keys(subset).join(',')}</ul>`; };

    const plain = renderAssetFolderView('scenes', entries, { state: null, renderList, thumbOf: (n, v) => v });
    assert.match(plain, /新建文件夹/);
    assert.match(plain, /<ul>教室,海边<\/ul>/);
    assert.equal(renderAssetFolderSelect('scenes', '教室', null), '');

    let state = moveAssetToFolder(addAssetFolder(null, 'scenes', '学校'), 'scenes', '教室', '学校');
    const grouped = renderAssetFolderView('scenes', entries, { state, renderList, thumbOf: (n, v) => v });
    assert.match(grouped, /学校/);
    assert.match(grouped, /未分类/);
    assert.deepEqual(seen.slice(-2), [['教室'], ['海边']]);

    state = setAssetView(state, 'scenes', 'grid');
    const grid = renderAssetFolderView('scenes', entries, { state, renderList, thumbOf: (n, v) => v });
    assert.match(grid, /class="igs-asset-grid is-scenes"/);
    assert.match(grid, /igs-asset-tile-thumb" src="https:\/\/example\.com\/a\.png"/);
    assert.match(grid, /未配置/);
    assert.match(grid, /data-asset-folder-move="scenes" data-asset-name="教室"/);
    // 缩略图卡片等大：修改 / 下载 / 移到文件夹都收进 ⋯，列表模式不重复渲染。
    assert.match(grid, /class="igs-asset-grid is-scenes"/);
    assert.match(grid, /<details class="igs-add-menu igs-row-menu"><summary class="igs-btn-mgr-icon" title="「教室」的操作"/);
    assert.match(grid, /data-action="asset-edit:scenes:%E6%95%99%E5%AE%A4" role="menuitem">修改<\/button>/);
    assert.match(grid, /class="igs-add-menu-item igs-folder-pick-item"/);
    assert.doesNotMatch(grid, /class="igs-folder-pick( is-set)?"/);
    assert.doesNotMatch(plain, /asset-edit:/);
    const withRaw = renderAssetFolderView('scenes', { 教室: 'igs-gen:abc' }, { state, renderList, thumbOf: () => 'blob:x', rawOf: (n, v) => v });
    assert.match(withRaw, /data-action="gen-asset-download:abc:%E6%95%99%E5%AE%A4-%E8%83%8C%E6%99%AF\.png" role="menuitem">下载<\/button>/);


    const collapsed = renderAssetFolderView('scenes', entries, { state: toggleAssetFolder(state, 'scenes', '学校'), renderList, thumbOf: (n, v) => v });
    assert.doesNotMatch(collapsed, /src="https:\/\/example\.com\/a\.png"/);

    assert.equal(renderAssetFolderView('scenes', {}, { state, renderList: () => '暂无' }), '暂无');
});

test('asset-folder-view: touch menu leaves the folder selector clickable', () => {
    const state = addAssetFolder(null, 'scenes', '学校');
    const menu = renderAssetFolderSelect('scenes', '教室', state.scenes, { menu: true });
    assert.match(menu, /class="igs-add-menu-item igs-folder-pick-item"/);
    assert.match(menu, /<select class="igs-folder-pick-select" data-asset-folder-move="scenes" data-asset-name="教室"/);
    assert.match(menu, /<option value="学校">学校<\/option>/);
    const moved = moveAssetToFolder(state, 'scenes', '教室', '学校');
    assert.match(renderAssetFolderSelect('scenes', '教室', moved.scenes, { menu: true }), /<option value="学校" selected>学校<\/option>/);
    const css = readFileSync(new URL('../src/visual/igs-ui/settings-style.js', import.meta.url), 'utf8');
    assert.match(css, /\.igs-add-menu-item:not\(\.igs-folder-pick-item\)::after\{content:/);
    assert.doesNotMatch(css, /\.igs-add-menu-item::after\{content:/);
});
