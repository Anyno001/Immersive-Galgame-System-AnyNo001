import { cloneData, esc } from './reader-value-utils.js';
import { getPath, setPath } from './settings-normalize.js';

// 「重置本区」的分区表：只列面板上该分区真正展示的字段，重置时从 normalize 后的默认设置里逐项取回。
// 场景素材、生图来源等含用户数据或密钥的分区不提供重置。
const THEME_STYLE_KEYS = Object.freeze([
    'nameFont', 'nameColor', 'nameAlign', 'textFont', 'textColor', 'textAlign',
    'narrationFont', 'narrationColor', 'narrationAlign', 'thoughtFont', 'thoughtColor', 'thoughtAlign',
    'dividerSymbol', 'dividerColor',
]);

function themePath(draft) {
    return getPath(draft, 'readerSettings.dialogSkin') === 'western-classic' ? 'readerSettings.classicVnTheme' : 'readerSettings.vnTheme';
}

const reader = (...keys) => keys.map((key) => `readerSettings.${key}`);

export const SETTINGS_SECTIONS = Object.freeze({
    'basic-source-filter': {
        label: '标签解析',
        paths: () => ['enabled', 'stripHtmlComments', 'allowUntaggedFallback', 'textIncludeTags', 'textExcludeTags', 'htmlCardTags', 'imageIncludeTags'].map((key) => `bridge.sourceFilter.${key}`),
    },
    'reader-dialog-style': { label: '风格', paths: () => reader('dialogSkin', 'gradientVeil', 'magicHouse', 'magicAccent', 'showStatusLine', 'dblclickHideUi') },
    'reader-dialog-size': { label: '尺寸', paths: () => reader('dialogWidth', 'classicDialogWidthPercent', 'skinDialogScale', 'dialogHeight', 'inputScale') },
    'reader-dialog-background': { label: '面板玻璃', paths: (draft) => [...reader('glassOpacity', 'glassBackdropFilter'), `${themePath(draft)}.bgOpacity`, `${themePath(draft)}.dialogBg`] },
    'reader-text-layout': { label: '排版', paths: () => reader('fontSize', 'dialogFontWeight', 'dialogTextEffect', 'dialogTextEffectColor', 'dialogTextEffectStrength', 'dialogTextEffectSize') },
    'reader-text-style': { label: '文字样式', paths: (draft) => [...THEME_STYLE_KEYS.map((key) => `${themePath(draft)}.${key}`), 'readerSettings.systemRole'] },
    'reader-interface-background': { label: '背景图', paths: () => reader('imgMode', 'imgBrightness', 'imageCountOverride') },
    'reader-interface-status-hud': {
        label: '状态栏',
        paths: () => ['enabled', 'showEmotion', 'showLocation', 'showLocationDetails', 'avatarRadius', 'size', 'background', 'barColor', 'tables'].map((key) => `readerSettings.statusHud.${key}`),
    },
    'reader-interface-option-bubble': { label: '选项气泡', paths: () => ['bridge.optionBubble', 'readerSettings.optionFontSize'] },
    'reader-interface-toolbar': { label: '工具栏', paths: () => reader('toolbarScale', 'toolbarDock', 'pinnedBtns', 'hiddenBtns', 'btnOrder') },
});

export function settingsSectionPaths(sectionId, draft) {
    const section = SETTINGS_SECTIONS[sectionId];
    return section ? section.paths(draft || {}) : [];
}

export function renderSectionResetButton(sectionId) {
    const section = SETTINGS_SECTIONS[sectionId];
    if (!section) return '';
    return `<button type="button" class="igs-settings-section-reset" data-action="settings-reset-section:${esc(sectionId)}" title="把「${esc(section.label)}」恢复为默认值">重置本区</button>`;
}

// 模板占位名：reader-dialog-style → resetReaderDialogStyle。
export function sectionResetPlaceholders() {
    const out = {};
    for (const id of Object.keys(SETTINGS_SECTIONS)) {
        out[`reset${id.replace(/(?:^|-)([a-z])/g, (_, c) => c.toUpperCase())}`] = renderSectionResetButton(id);
    }
    return out;
}

function deleteLeaf(target, path) {
    const parts = path.split('.');
    const parent = getPath(target, parts.slice(0, -1).join('.'));
    if (parent && typeof parent === 'object') delete parent[parts[parts.length - 1]];
}

// defaults 必须是宿主 normalize 空设置得到的完整默认值；默认里没有的字段直接删掉，交给下次 normalize 补齐。
export function resetSettingsSection(draft, sectionId, defaults) {
    const paths = settingsSectionPaths(sectionId, draft);
    if (!paths.length) return { ok: false, reason: 'unknown-section' };
    for (const path of paths) {
        const value = getPath(defaults, path);
        if (value === undefined) deleteLeaf(draft, path);
        else setPath(draft, path, cloneData(value));
    }
    return { ok: true, paths };
}

export const SETTINGS_EXPORT_FORMAT = 'igs-settings';
const SECRET_KEY = /^(?:api[-_]?key|apikey|token|secret|password|authorization)$/i;
// 素材内容：场景、角色、衣柜、生成图、各角色卡。全局配置不带走这些，导入也不覆盖本机已有的。
const ASSET_CONTENT_KEYS = Object.freeze([
    'scenes', 'characters', 'characterAliases', 'characterDna', 'characterOutfits',
    'wardrobe', 'generated', 'statusAvatars', 'cards',
]);
const READER_CONTENT_KEYS = Object.freeze(['spriteLayouts', 'spriteHeads']);

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripSecrets(value) {
    if (Array.isArray(value)) return value.map(stripSecrets);
    if (!isPlainObject(value)) return value;
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        if (SECRET_KEY.test(key)) continue;
        out[key] = stripSecrets(item);
    }
    return out;
}

// 导出文件可能被分享，密钥一律不写出；导入时这些字段沿用本机当前值。
function keepLocalSecrets(imported, current) {
    if (!isPlainObject(imported) || !isPlainObject(current)) return imported;
    for (const [key, value] of Object.entries(current)) {
        if (SECRET_KEY.test(key)) {
            if (!(key in imported) && value !== undefined) imported[key] = cloneData(value);
        } else if (isPlainObject(value) && isPlainObject(imported[key])) {
            keepLocalSecrets(imported[key], value);
        }
    }
    return imported;
}

function stripAssetContent(bridge) {
    if (!isPlainObject(bridge) || !isPlainObject(bridge.sceneAssets)) return bridge;
    for (const key of ASSET_CONTENT_KEYS) delete bridge.sceneAssets[key];
    return bridge;
}

function stripReaderContent(readerSettings) {
    if (!isPlainObject(readerSettings)) return readerSettings;
    for (const key of READER_CONTENT_KEYS) delete readerSettings[key];
    return readerSettings;
}

function keepLocalAssetContent(imported, current) {
    const currentAssets = isPlainObject(current) ? current.sceneAssets : null;
    if (!isPlainObject(imported && imported.sceneAssets) || !isPlainObject(currentAssets)) return imported;
    for (const key of ASSET_CONTENT_KEYS) {
        if (currentAssets[key] !== undefined) imported.sceneAssets[key] = cloneData(currentAssets[key]);
    }
    return imported;
}

function keepLocalReaderContent(imported, current) {
    if (!isPlainObject(imported) || !isPlainObject(current)) return imported;
    for (const key of READER_CONTENT_KEYS) {
        if (current[key] !== undefined) imported[key] = cloneData(current[key]);
    }
    return imported;
}

export function buildSettingsExport(draft, { version = '', now = new Date() } = {}) {
    const src = draft || {};
    return {
        format: SETTINGS_EXPORT_FORMAT,
        formatVersion: 1,
        version: String(version || ''),
        exportedAt: now.toISOString(),
        secretsOmitted: true,
        bridge: stripAssetContent(stripSecrets(cloneData(src.bridge || {}))),
        readerSettings: stripReaderContent(stripSecrets(cloneData(src.readerSettings || {}))),
    };
}

export function settingsExportFileName(version, now = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `igs-settings${version ? `-v${version}` : ''}-${stamp}.json`;
}

// 只做格式校验与密钥回填；字段合法性交给宿主 normalizeUnifiedSettings。
export function parseSettingsImport(text, current = {}) {
    let data;
    try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch (error) { return { ok: false, reason: 'invalid-json', message: '文件不是有效的 JSON' }; }
    if (!isPlainObject(data)) return { ok: false, reason: 'invalid-format', message: '文件内容不是设置对象' };
    if (data.format != null && data.format !== SETTINGS_EXPORT_FORMAT) return { ok: false, reason: 'invalid-format', message: '这不是 IGS 设置文件' };
    const hasBridge = isPlainObject(data.bridge);
    const hasReader = isPlainObject(data.readerSettings);
    if (!hasBridge && !hasReader) return { ok: false, reason: 'invalid-format', message: '文件里没有可导入的设置' };
    const bridge = hasBridge ? keepLocalAssetContent(keepLocalSecrets(cloneData(data.bridge), (current && current.bridge) || {}), (current && current.bridge) || {}) : cloneData((current && current.bridge) || {});
    const readerSettings = hasReader ? keepLocalReaderContent(keepLocalSecrets(cloneData(data.readerSettings), (current && current.readerSettings) || {}), (current && current.readerSettings) || {}) : cloneData((current && current.readerSettings) || {});
    return { ok: true, bridge, readerSettings, version: String(data.version || '') };
}
