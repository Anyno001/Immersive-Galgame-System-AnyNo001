import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

import { bootstrapIGS } from '../src/index.js';
import { dispatchImportBundle } from '../src/registry/import-dispatcher.js';
import {
    IGS_FROSTED_GLASS_BACKDROP_FILTER,
    IGS_TRANSPARENT_GLASS_BACKDROP_FILTER,
    IGS_TRANSPARENT_GLASS_BG,
    applyTransparentGlassMaterial,
} from '../src/styles/glass-material.js';
import { checkStyleContract } from '../src/styles/style-contract.js';
import { readLegacyIgsSettings } from '../src/storage/legacy-igs.js';
import { createReaderState } from '../src/visual/reader-state.js';
import { createStageModel } from '../src/visual/stage-model.js';
import { getOriginalReaderSource } from '../src/visual/igs-ui/original-reader-source.js';
import { getSettingsShellTemplate } from '../src/visual/igs-ui/settings-shell.js';
import { getSettingsStyleText } from '../src/visual/igs-ui/settings-style.js';
import { getSettingsTabTemplate, SETTINGS_TAB_DEFS } from '../src/visual/igs-ui/settings-tabs.js';

const appRoot = path.resolve(import.meta.dirname, '..');
const projectRoot = path.resolve(appRoot, '..');

test('gate:import-contract:dispatches allowed types and rejects forbidden types', () => {
    const bundle = readJson('fixtures/imports/sample-bundle.json');
    const handled = [];
    const result = dispatchImportBundle(bundle, {
        'background-pack': (item) => handled.push(item.id),
    });

    assert.equal(result.ok, false);
    assert.deepEqual(handled, ['pack.library']);
    assert.equal(result.accepted.length, 1);
    assert.equal(result.rejected[0].item.type, 'hotkey-preset');
});

test('gate:import-contract:text-presets', () => {
    const bundle = readJson('fixtures/imports/text-presets-bundle.json');
    const handled = [];
    const result = dispatchImportBundle(bundle, {
        'text-filter-preset': (item) => handled.push(item.type),
        'text-format-preset': (item) => handled.push(item.type),
        'scene-regex-preset': (item) => handled.push(item.type),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(handled, ['text-filter-preset', 'text-format-preset', 'scene-regex-preset']);
    assert.equal(result.accepted.length, 3);
    assert.deepEqual(result.rejected, []);
});

test('gate:style-contract:requires stable slots and reader bridge attributes', () => {
    const skin = readJson('fixtures/styles/skin-contract.json');
    const result = checkStyleContract(skin);

    assert.equal(result.ok, true);
    assert.deepEqual(result.missingSlots, []);
    assert.deepEqual(result.missingData, []);
});

test('gate:style-contract:transparent glass material applies neutral density to foreground surfaces', () => {
    const applied = new Map();
    applyTransparentGlassMaterial({
        style: {
            setProperty(name, value) {
                applied.set(name, value);
            },
        },
    }, 0.62);

    assert.equal(applied.get('--igs-glass-opacity'), '0.62');
    assert.equal(applied.get('--igs-glass-density'), '0.62');
    assert.equal(applied.get('--igs-glass-fill-alpha'), '0.62');
    assert.equal(applied.get('--igs-transparent-glass-bg'), IGS_TRANSPARENT_GLASS_BG);
    assert.equal(applied.get('--igs-glass-bg'), IGS_TRANSPARENT_GLASS_BG);
    assert.equal(applied.get('--igs-dialog-bg'), IGS_TRANSPARENT_GLASS_BG);
    assert.equal(applied.get('--igs-toolbar-bg'), IGS_TRANSPARENT_GLASS_BG);
    assert.equal(applied.get('--igs-choice-bg'), IGS_TRANSPARENT_GLASS_BG);
    assert.equal(applied.get('--igs-db-bg'), IGS_TRANSPARENT_GLASS_BG);
    assert.equal(applied.get('--igs-glass-blur'), IGS_TRANSPARENT_GLASS_BACKDROP_FILTER);
    assert.equal(applied.get('--igs-dialog-blur'), IGS_TRANSPARENT_GLASS_BACKDROP_FILTER);
    assert.equal(applied.get('--igs-toolbar-blur'), IGS_TRANSPARENT_GLASS_BACKDROP_FILTER);
    assert.equal(applied.get('--igs-choice-blur'), IGS_TRANSPARENT_GLASS_BACKDROP_FILTER);
    assert.equal(applied.get('--igs-db-blur'), IGS_TRANSPARENT_GLASS_BACKDROP_FILTER);
    assert.equal(applied.get('--igs-db-head-bg'), IGS_TRANSPARENT_GLASS_BG);
    assert.equal(applied.get('--igs-db-head-blur'), IGS_TRANSPARENT_GLASS_BACKDROP_FILTER);

    applyTransparentGlassMaterial({
        style: {
            setProperty(name, value) {
                applied.set(name, value);
            },
        },
    }, 0.62, { backdropFilter: true });

    assert.equal(applied.get('--igs-glass-blur'), IGS_FROSTED_GLASS_BACKDROP_FILTER);
    assert.equal(applied.get('--igs-db-head-blur'), IGS_FROSTED_GLASS_BACKDROP_FILTER);
});

test('gate:visual-slots-contract:stage-model', () => {
    const fixture = readJson('fixtures/visual/stage-model.json');
    const readerState = createReaderState(fixture.standard.readerStateInput);
    const stage = createStageModel(fixture.standard.scene, readerState);
    const result = checkStyleContract(stage);

    assert.equal(result.ok, true);
    assert.deepEqual(result.missingSlots, []);
    assert.deepEqual(result.missingData, []);
    assert.equal(stage.layers.hud.toolbar.attributes['data-placement'], 'top-right');
});

test('gate:loader-json:matches loader source and references public bundle', () => {
    const loaderSource = fs.readFileSync(path.join(projectRoot, 'loader', 'igs-loader.js'), 'utf8');
    const loaderJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'loader', 'igs-loader.json'), 'utf8'));

    assert.equal(loaderJson.type, 'script');
    assert.equal(loaderJson.name, '沉浸式Galgame系统（自动更新）');
    assert.equal(loaderJson.content, loaderSource);
    assert.match(loaderJson.content, /igs\.bundle\.js/);
    assert.match(loaderJson.content, /igs\.bundle\.css/);
    assert.match(loaderJson.content, /DEFAULT_REF = 'main'/);
    assert.doesNotMatch(loaderJson.content, /DEFAULT_REF = 'v\d+\.\d+\.\d+'/);
    assert.match(loaderJson.content, /MAIN_BRANCH_URL/);
    assert.match(loaderJson.content, /fetchLatestRef/);
    assert.doesNotMatch(loaderJson.content, /notifyDuplicateLoadBlocked/);
    assert.match(loaderJson.content, /reconcileExistingRuntime/);
    assert.match(loaderJson.content, /ensureMagicWandEntry/);
    assert.doesNotMatch(loaderJson.content, /yuzi-phone/i);
    assert.equal(loaderJson.button.enabled, false);
    assert.deepEqual(loaderJson.button.buttons, []);

    // 固定版 loader：锁定具体 tag、注入 IGS_LOADER_REF、不自动更新。按需生成（--pin），
    // 不随升号自动产出，故校验已发布的 v0.23.21 固定版格式正确。
    const pinnedRef = 'v0.23.21';
    const pinnedJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'loader', `沉浸式Galgame系统 ${pinnedRef}.json`), 'utf8'));
    assert.equal(pinnedJson.name, `沉浸式Galgame系统 ${pinnedRef}`);
    assert.match(pinnedJson.content, new RegExp(`IGS_LOADER_REF=["']${pinnedRef.replace(/\./g, '\\.')}["']`));
    assert.ok(pinnedJson.content.includes(loaderSource), '固定版 loader 应包含完整 loader 源');
    assert.match(pinnedJson.content, /igs\.bundle\.js/);
});

test('gate:dist-bundle:is-self-contained-for-loader-cache-bust', () => {
    const bundle = fs.readFileSync(path.join(appRoot, 'dist', 'igs.bundle.js'), 'utf8');
    const manifest = readJson('dist/manifest.json');
    const pkgVersion = readJson('package.json').version;

    assert.doesNotMatch(bundle, /^\s*import\s/m);
    assert.doesNotMatch(bundle, /\.\.\/src\/index\.js/);
    assert.match(bundle, new RegExp(`IGS version: ${pkgVersion.replace(/\./g, '\\.')}`));
    assert.match(bundle, /resolveSegmentImageIndex/);
    assert.match(bundle, /message-scope-not-found/);
    assert.equal(manifest.name, 'Immersive Galgame System');
    assert.equal(manifest.version, pkgVersion);
});

test('gate:dist-bundle:loads-as-esm-entry', async () => {
    const bundleUrl = `${pathToFileURL(path.join(appRoot, 'dist', 'igs.bundle.js')).href}?gate=${Date.now()}`;
    globalThis.IGS_AUTO_BOOTSTRAP = false;
    try {
        const bundle = await import(bundleUrl);
        assert.equal(typeof bundle.bootstrapIGS, 'function');
        assert.equal(typeof bundle.createIgsReaderHost, 'function');
    } finally {
        delete globalThis.IGS_AUTO_BOOTSTRAP;
    }
});

test('gate:loader-json:repeated enable rescans magic wand without alerting', () => {
    const loaderJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'loader', 'igs-loader.json'), 'utf8'));
    const documentLike = createLoaderDocumentLike();
    const alerts = [];
    let ensureCalls = 0;
    const root = {
        document: documentLike,
        alert: (message) => alerts.push(message),
        console,
        setTimeout: (callback) => {
            callback();
            return 1;
        },
        IGS: {
            ensureMagicWandEntry() {
                ensureCalls += 1;
                return { ok: true, entries: 1 };
            },
        },
    };
    root.parent = root;

    const context = vm.createContext({
        window: root,
        document: documentLike,
        console,
        setTimeout: root.setTimeout,
    });

    vm.runInContext(loaderJson.content, context);

    assert.equal(alerts.length, 0);
    assert.ok(ensureCalls >= 1);
    assert.equal(documentLike.head.children.length, 0);
    assert.equal(root.__IGS_AUTO_UPDATE_LOADER__.status, 'ready');
    assert.equal(root.__IGS_AUTO_UPDATE_LOADER__.reused, true);
});

test('gate:loader-json:adds-temporary-magic-wand-entry-before-remote-bundle-loads', () => {
    const loaderJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'loader', 'igs-loader.json'), 'utf8'));
    const documentLike = createLoaderDocumentLike({ magicMenu: true });
    const alerts = [];
    const root = {
        document: documentLike,
        parent: null,
        alert: (message) => alerts.push(message),
        console,
        setTimeout: (callback) => {
            callback();
            return 1;
        },
        fetch: async () => ({ ok: true, status: 200 }),
    };
    root.parent = root;
    root.top = root;

    const context = vm.createContext({
        window: root,
        document: documentLike,
        console,
        setTimeout: root.setTimeout,
        fetch: root.fetch,
    });
    vm.runInContext(loaderJson.content, context);

    const entry = documentLike.magicMenu.querySelector('[data-igs-loader-entry="1"]');
    assert.ok(entry);
    assert.equal(entry.getAttribute('data-igs-magic-entry'), '1');
    assert.equal(entry.getAttribute('data-igs-version'), 'loader');
    assert.match(entry.innerHTML, /沉浸式Galgame系统/);
    assert.deepEqual(alerts, []);
});

test('gate:loader-json:loads-main-commit-by-default-with-main-fallback', async () => {
    const loaderJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'loader', 'igs-loader.json'), 'utf8'));
    const scripts = [];
    const alerts = [];
    const fetched = [];
    const documentLike = createLoaderDocumentLike({
        onAppend(element) {
            if (element.tagName !== 'SCRIPT') return;
            scripts.push(element.src);
            setTimeout(() => element.onload(), 0);
        },
    });
    const root = {
        document: documentLike,
        parent: null,
        alert: (message) => alerts.push(message),
        console,
        setTimeout,
        fetch: async (url, options = {}) => {
            const text = String(url);
            fetched.push(text);
            if (text.includes('/branches/main')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ commit: { sha: '1234567890abcdef1234567890abcdef12345678' } }),
                };
            }
            return { ok: true, status: 200 };
        },
    };
    root.parent = root;

    const context = vm.createContext({
        window: root,
        document: documentLike,
        console,
        setTimeout,
        fetch: root.fetch,
    });
    vm.runInContext(loaderJson.content, context);
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(alerts, []);
    assert.equal(scripts.length, 1);
    assert.match(scripts[0], /@1234567890abcdef1234567890abcdef12345678\/app\/dist\/igs\.bundle\.js/);
    assert.ok(fetched.some((url) => url.includes('/branches/main')));
    assert.ok(fetched.some((url) => url.includes('@1234567890abcdef1234567890abcdef12345678/app/dist/igs.bundle.js')));
});

test('gate:loader-json:explicit-fixed-ref-falls-back-to-main-when-cdn-is-missing', async () => {
    const loaderJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'loader', 'igs-loader.json'), 'utf8'));
    const scripts = [];
    const alerts = [];
    const fetched = [];
    const documentLike = createLoaderDocumentLike({
        onAppend(element) {
            if (element.tagName !== 'SCRIPT') return;
            scripts.push(element.src);
            setTimeout(() => element.onload(), 0);
        },
    });
    const root = {
        document: documentLike,
        parent: null,
        IGS_LOADER_REF: 'v9.9.9',
        alert: (message) => alerts.push(message),
        console,
        setTimeout,
        fetch: async (url) => {
            const text = String(url);
            fetched.push(text);
            return {
                ok: !text.includes('@v9.9.9/'),
                status: text.includes('@v9.9.9/') ? 404 : 200,
            };
        },
    };
    root.parent = root;

    const context = vm.createContext({
        window: root,
        document: documentLike,
        console,
        setTimeout,
        fetch: root.fetch,
    });
    vm.runInContext(loaderJson.content, context);
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(alerts, []);
    assert.ok(fetched.some((url) => url.includes('@v9.9.9/app/dist/igs.bundle.js')));
    assert.equal(scripts.length, 1);
    assert.match(scripts[0], /@main\/app\/dist\/igs\.bundle\.js/);
});

test('gate:igs-compat:legacy-storage', () => {
    const fixture = readJson('fixtures/igs/legacy-storage.json');
    const storageLike = {
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(fixture, key) ? fixture[key] : null;
        },
    };

    const result = readLegacyIgsSettings(storageLike, 'mobile');
    assert.equal(result.ok, true);
    assert.equal(result.readerMode, 'mobile');
    assert.equal(result.displayMode, 'pc');
    assert.equal(result.bridge.showToasts, true);
    assert.equal(result.readerSettingsByMode.pc.toolbarDirection, 'horizontal');
    assert.equal(result.readerSettingsByMode.mobile.toolbarDirection, 'vertical');

    const invalidResult = readLegacyIgsSettings({
        getItem(key) {
            if (key === 'igs_bridge_config') return '{bad json';
            return null;
        },
    });
    assert.equal(invalidResult.ok, false);
    assert.equal(invalidResult.reason, 'invalid-legacy-json');
});

test('gate:igs-compat:api-shape', async () => {
    const contract = readJson('fixtures/igs/api-contract.json');
    const legacyStorage = readJson('fixtures/igs/legacy-storage.json');
    const globalObject = {
        localStorage: {
            getItem(key) {
                return Object.prototype.hasOwnProperty.call(legacyStorage, key) ? legacyStorage[key] : null;
            },
        },
    };
    const vn = bootstrapIGS({
        global: globalObject,
        hostAdapter: {
            getCurrentMessage: async () => null,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    for (const method of contract.methods) {
        assert.equal(typeof vn[method], 'function');
    }

    const unifiedSettings = vn.getUnifiedSettings({ mode: 'pc' });
    for (const field of contract.unifiedSettingsFields) {
        assert.ok(Object.prototype.hasOwnProperty.call(unifiedSettings, field));
    }
    assert.equal(unifiedSettings.bridge.imageApi.mode, 'nai');
    try {
        const settingsResult = vn.openSettings({ tab: 'basic' });
        assert.equal(settingsResult.ok, true);
        assert.equal(settingsResult.snapshot.tabs.length, 5);
        assert.equal(settingsResult.snapshot.tabs[0].label, '基础');
        const generated = await vn.generateImage({ prompt: 'moon' });
        assert.equal(generated.ok, false);
        assert.equal(generated.reason, '请先在设置中填写图像 API 地址');
    } finally {
        vn.destroy();
    }
});

test('gate:igs-ui:reader-source-keeps-original-selectors', () => {
    const fixture = readJson('fixtures/igs-ui/original-reader-snapshot.json');
    const source = getOriginalReaderSource('0.3.20');

    for (const selector of fixture.requiredSelectors) {
        assert.ok(source.selectors.includes(selector));
        if (selector !== '#igs-overlay') {
            assert.match(source.html, new RegExp(selectorToken(selector)));
        }
    }

    assert.equal(source.styleContract.overlayZIndex, fixture.styles['#igs-overlay'].zIndex);
    assert.equal(source.styleContract.dialogWidth, fixture.styles['.igs-dialog'].width);
    assert.equal(source.styleContract.inputHeight, fixture.styles['.igs-input'].height);
    assert.equal(source.styleContract.sendButtonMinWidth, fixture.styles['.igs-send-btn'].minWidth);
    assert.equal(source.styleContract.toolbarButtonSize, fixture.styles['.igs-icon-btn'].width);
    assert.match(source.html, /data-act="toggle-bar"/);
    assert.match(source.html, /data-act="close"/);
    assert.match(source.html, /viewBox="0 0 24 24"/);
    const toolbarLayerIndex = source.html.indexOf('id="igs-toolbar-layer"');
    const toolbarIndex = source.html.indexOf('id="igs-ctrl-bar"');
    assert.ok(toolbarLayerIndex >= 0);
    assert.ok(toolbarIndex > toolbarLayerIndex);
    assert.match(source.styleText, /#igs-dialog-layer,#igs-toolbar-layer,#igs-option-layer,#igs-db-layer\{position:absolute;inset:0;pointer-events:none;\}/);
    assert.match(source.styleText, /--igs-glass-fill-alpha:\.62/);
    assert.match(source.styleText, /--igs-glass-density:\.62/);
    assert.match(source.styleText, /--igs-transparent-glass-bg:rgba\(20,20,22,\.62\)/);
    assert.match(source.styleText, /--igs-glass-bg:var\(--igs-transparent-glass-bg\)/);
    assert.match(source.styleText, /--igs-glass-blur:none/);
    assert.match(source.styleText, /--igs-dialog-bg:var\(--igs-glass-bg\)/);
    assert.match(source.styleText, /--igs-dialog-blur:var\(--igs-glass-blur\)/);
    assert.match(source.styleText, /--igs-toolbar-bg:var\(--igs-glass-bg\)/);
    assert.match(source.styleText, /--igs-toolbar-blur:var\(--igs-glass-blur\)/);
    assert.match(source.styleText, /--igs-choice-bg:var\(--igs-glass-bg\)/);
    assert.match(source.styleText, /--igs-choice-blur:var\(--igs-glass-blur\)/);
    assert.match(source.styleText, /--igs-choice-soft-shadow:0 2px 10px rgba\(0,0,0,\.14\)/);
    assert.match(source.styleText, /--igs-choice-shadow:var\(--igs-choice-soft-shadow\)/);
    assert.match(source.styleText, /\.igs-option-bubble\{[^}]*backdrop-filter:var\(--igs-choice-blur,none\)/);
    assert.match(source.styleText, /\.igs-option-bubble\{[^}]*box-shadow:var\(--igs-choice-shadow,0 2px 10px rgba\(0,0,0,\.14\)\)/);
    assert.doesNotMatch(source.styleText, /\.igs-option-bubble\{[^}]*box-shadow:var\(--igs-choice-shadow,0 4px 24px/);
    assert.match(source.styleText, /\.igs-dialog\{[^}]*pointer-events:auto/);
    assert.match(source.styleText, /\.igs-dialog\{[^}]*backdrop-filter:var\(--igs-dialog-blur,none\)/);
    assert.match(source.styleText, /--igs-db-bg:var\(--igs-glass-bg\)/);
    assert.match(source.styleText, /--igs-db-head-bg:var\(--igs-db-bg\)/);
    assert.match(source.styleText, /--igs-db-head-blur:var\(--igs-db-blur\)/);
    assert.match(source.styleText, /#igs-overlay\.igs-floating\.is-dragging #igs-click-layer\{cursor:grabbing;\}/);
    assert.match(source.styleText, /#igs-overlay\.igs-floating #igs-click-layer\{cursor:grab;touch-action:none;\}/);
    assert.match(source.styleText, /#igs-overlay\.igs-floating \.igs-progress\{flex-shrink:0;\}/);
    assert.match(source.styleText, /#igs-overlay\.igs-floating \.igs-text\{min-height:0;overflow-y:auto;margin-bottom:12px;flex:1 1 auto;\}/);
    assert.match(source.styleText, /#igs-overlay\.igs-floating \.igs-controls\{flex-shrink:0;\}/);
    assert.doesNotMatch(source.styleText, /transition:all/);
    assert.doesNotMatch(source.html, />‹</);
    assert.doesNotMatch(source.html, />⚙</);
    assert.match(source.html, /id="igs-controls-shujuku_v120-guard"/);

    const rendererText = readText('src/visual/igs-ui/reader-dom-render.js');
    const dbControllerText = readText('src/shujuku-panel/panel-controller.js');
    assert.match(rendererText, /applyTransparentGlassMaterial\(root, readerSettings\.glassOpacity, \{\s+backdropFilter: readerSettings\.glassBackdropFilter,\s+\}\)/);
    assert.doesNotMatch(rendererText, /setProperty\('--igs-glass-bg'/);
    assert.match(dbControllerText, /applyTransparentGlassMaterial\(root, readerSettings && readerSettings\.glassOpacity, \{\s+backdropFilter: readerSettings && readerSettings\.glassBackdropFilter,\s+\}\)/);
    assert.doesNotMatch(dbControllerText, /setProperty\('--igs-glass-bg'/);
});

test('gate:igs-ui:settings-shell-keeps-original-tabs', () => {
    const fixture = readJson('fixtures/igs-ui/settings-panel-snapshot.json');
    const shell = getSettingsShellTemplate();

    assert.match(shell, /igs-settings-shell/);
    assert.match(shell, /igs-settings-tabs/);
    assert.match(shell, /igs-settings-body/);

    for (const tab of fixture.tabs) {
        const defined = SETTINGS_TAB_DEFS.find(([id]) => id === tab.id);
        assert.ok(defined);
        assert.equal(defined[1], tab.label);
        assert.ok(getSettingsTabTemplate(tab.id).length > 0);
    }
});

test('gate:igs-ui:settings-style-keeps-original-geometry', () => {
    const fixture = readJson('fixtures/igs-ui/settings-panel-snapshot.json');
    const styleText = getSettingsStyleText();

    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.viewportLeft)));
    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.viewportTop)));
    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.viewportWidth)));
    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.viewportHeight)));
    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.shellWidth)));
    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.headerHeight)));
    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.segmentedHeight)));
    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.switchHeight)));
    assert.match(styleText, new RegExp(escapeRegExp(fixture.styleChecks.mobileMedia)));
    assert.match(styleText, /\.igs-segmented-btn\{[^}]*min-width:0;[^}]*overflow:hidden/);
    assert.match(styleText, /\.igs-segmented-btn-label\{[^}]*display:block;[^}]*max-width:100%;[^}]*overflow:hidden;[^}]*text-overflow:ellipsis;[^}]*white-space:nowrap/);
});

test('gate:api:public-api-exposes-text-preset-groups', () => {
    const vn = bootstrapIGS({
        global: {},
        hostAdapter: {
            getCurrentMessage: async () => null,
            typeAndSend: async () => ({ ok: true }),
        },
    });

    assert.equal(typeof vn.api.textFilterPresets.register, 'function');
    assert.equal(typeof vn.api.textFormatPresets.register, 'function');
    assert.equal(typeof vn.api.sceneRegexPresets.register, 'function');
    assert.equal(typeof vn.api.textFilterPresets.setCurrent, 'function');
    assert.equal(typeof vn.api.textFormatPresets.getCurrent, 'function');
    assert.equal(typeof vn.api.sceneRegexPresets.exportAll, 'function');

    vn.destroy();
});

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(appRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function createLoaderDocumentLike(options = {}) {
    const magicMenu = options.magicMenu ? createLoaderElement('div') : null;
    if (magicMenu) magicMenu.id = 'extensionsMenu';
    const head = {
        children: [],
        appendChild(element) {
            this.children.push(element);
            if (typeof options.onAppend === 'function') options.onAppend(element);
            return element;
        },
    };
    return {
        head,
        body: createLoaderElement('body'),
        magicMenu,
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            const normalized = String(selector || '');
            if (normalized === '#extensionsMenu') return magicMenu && !magicMenu.removed ? [magicMenu] : [];
            const idMatch = normalized.match(/^#(.+)$/);
            if (!idMatch) return [];
            const headMatch = head.children.find((element) => element.id === idMatch[1] && !element.removed);
            return headMatch ? [headMatch] : [];
        },
        createElement(tagName) {
            return createLoaderElement(tagName);
        },
    };
}

function createLoaderElement(tagName) {
    const attributes = new Map();
    return {
        tagName: String(tagName || '').toUpperCase(),
        children: [],
        parentNode: null,
        innerHTML: '',
        className: '',
        href: '',
        set id(value) {
            this._id = value;
            attributes.set('id', String(value));
        },
        get id() {
            return this._id;
        },
        setAttribute(name, value) {
            attributes.set(String(name), String(value));
            if (name === 'id') this._id = String(value);
        },
        getAttribute(name) {
            return attributes.has(String(name)) ? attributes.get(String(name)) : null;
        },
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        addEventListener() {},
        removeEventListener() {},
        querySelector(selector) {
            return this.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector) {
            const normalized = String(selector || '');
            const dataMatch = normalized.match(/^\[([^=]+)="([^"]+)"\]$/);
            if (!dataMatch) return [];
            return this.children.filter((child) => child.getAttribute && child.getAttribute(dataMatch[1]) === dataMatch[2] && !child.removed);
        },
        remove() {
            this.removed = true;
        },
    };
}

function selectorToken(selector) {
    if (selector.startsWith('#')) {
        return `id="${selector.slice(1)}"`;
    }
    if (selector.startsWith('.')) {
        return selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
