// 设置器的分类与页面表：纯数据和纯函数，不读 DOM、不碰设置值。
// settingsState.tab 是分类 id，asyncState.page 是当前页面 id（显示内容的唯一依据）；
// 旧的 tab / 子页 id 只在这里被映射成新页面，存储路径和 data-advanced key 不受影响。

export const SETTINGS_CATEGORIES = Object.freeze([
    Object.freeze(['dash', '仪表盘']),
    Object.freeze(['style', '对话框']),
    Object.freeze(['text', '文字']),
    Object.freeze(['ui', '界面']),
    Object.freeze(['perf', '演出']),
    Object.freeze(['sound', '声音']),
    Object.freeze(['chars', '角色']),
    Object.freeze(['scenes', '场景']),
    Object.freeze(['ai', '生图与AI']),
    Object.freeze(['stats', '数值系统']),
    Object.freeze(['data', '数据']),
]);

// [页面 id, 子页名, 所属分类]
export const SETTINGS_PAGES = Object.freeze([
    Object.freeze(['dash', '仪表盘', 'dash']),
    Object.freeze(['style', '对话框', 'style']),
    Object.freeze(['text', '文字', 'text']),
    Object.freeze(['ui-reader', '阅读器', 'ui']),
    Object.freeze(['ui-bg', '背景状态', 'ui']),
    Object.freeze(['ui-option', '选项', 'ui']),
    Object.freeze(['ui-bar', '工具栏', 'ui']),
    Object.freeze(['perf-text', '台词', 'perf']),
    Object.freeze(['perf-stage', '画面', 'perf']),
    Object.freeze(['perf-story', '情绪与提示', 'perf']),
    Object.freeze(['perf-special', '题材', 'perf']),
    Object.freeze(['perf-rhythm', '节奏', 'perf']),
    Object.freeze(['sound', '声音', 'sound']),
    Object.freeze(['chars', '角色', 'chars']),
    Object.freeze(['wardrobe', '衣柜与情绪', 'chars']),
    Object.freeze(['review', '待确认', 'chars']),
    Object.freeze(['scenes', '背景', 'scenes']),
    Object.freeze(['cglib', 'CG库', 'scenes']),
    Object.freeze(['scene-review', '待确认', 'scenes']),
    Object.freeze(['source', '图像来源', 'ai']),
    Object.freeze(['kinds', '画师与模型', 'ai']),
    Object.freeze(['llm', '备用模型', 'ai']),
    Object.freeze(['rules', '写法规则', 'ai']),
    Object.freeze(['parse', '正文解析', 'ai']),
    Object.freeze(['stats', '数值系统', 'stats']),
    Object.freeze(['data', '备份', 'data']),
    Object.freeze(['logs', '日志', 'data']),
]);

export const DEFAULT_SETTINGS_PAGE = 'dash';

// 旧页面 id → 现行页面 id（「界面」拆成四个子页后，'ui' 仍可打开，指到第一个子页）。
// 预置CG 并入 CG库 页底部的折叠；打开旧 id 时同时展开那个折叠（EVENT_CG_FOLD）。
const PAGE_ALIASES = Object.freeze({ ui: 'ui-reader', eventcg: 'cglib' });
const EVENT_CG_FOLD = 'event-cg';
const canon = (page) => {
    const id = String(page || '').trim();
    return PAGE_ALIASES[id] || id;
};

const PAGE_BY_ID = new Map(SETTINGS_PAGES.map((page) => [page[0], page]));
const CATEGORY_IDS = new Set(SETTINGS_CATEGORIES.map(([id]) => id));
const CATEGORY_LABELS = new Map(SETTINGS_CATEGORIES);

// 点分类时进入的页面（分类 id 与页面 id 相同的直接进同名页）。
const CATEGORY_DEFAULT_PAGE = Object.freeze({
    ui: 'ui-reader', perf: 'perf-text', chars: 'chars', scenes: 'scenes', ai: 'source', data: 'data',
});

// 演出组 id → 页面 id（旧 open key `perf-group-<g>` 用）。
export const PERFORMANCE_GROUP_PAGES = Object.freeze({
    text: 'perf-text', stage: 'perf-stage', story: 'perf-story', special: 'perf-special', rhythm: 'perf-rhythm', sound: 'sound',
});
export const PAGE_PERFORMANCE_GROUPS = Object.freeze(Object.fromEntries(Object.entries(PERFORMANCE_GROUP_PAGES).map(([group, page]) => [page, group])));

const LEGACY_READER_ALIASES = Object.freeze({ display: 'dialog', theme: 'text', toolbar: 'interface', visual: 'interface', options: 'interface' });
const LEGACY_SCENE_ALIASES = Object.freeze({ generated: 'scene-review' });
const LEGACY_IMAGE_PAGES = Object.freeze({ source: 'source', llm: 'llm', auto: 'kinds', prompts: 'kinds', content: 'kinds', logs: 'logs', cg: 'cglib', other: 'source' });
const LEGACY_READER_PAGES = Object.freeze({ dialog: 'style', text: 'text', interface: 'ui-reader', performance: 'perf-text' });

export function isSettingsPage(page) {
    return PAGE_BY_ID.has(canon(page));
}

export function isSettingsCategory(category) {
    return CATEGORY_IDS.has(String(category || '').trim());
}

export function normalizeSettingsPage(page) {
    const id = canon(page);
    return PAGE_BY_ID.has(id) ? id : DEFAULT_SETTINGS_PAGE;
}

export function categoryOfPage(page) {
    const found = PAGE_BY_ID.get(canon(page));
    return found ? found[2] : 'dash';
}

export function categoryLabel(category) {
    return CATEGORY_LABELS.get(category) || '';
}

export function pageLabel(page) {
    const found = PAGE_BY_ID.get(canon(page));
    return found ? found[1] : '';
}

export function pagesOfCategory(category) {
    return SETTINGS_PAGES.filter((page) => page[2] === category);
}

export function defaultPageOfCategory(category) {
    const id = String(category || '').trim();
    return CATEGORY_DEFAULT_PAGE[id] || (PAGE_BY_ID.has(canon(id)) ? canon(id) : DEFAULT_SETTINGS_PAGE);
}

// 「分类 › 子页」路径；分类只有一页时只写分类名。
export function pageLocation(page) {
    const id = normalizeSettingsPage(page);
    const category = categoryOfPage(id);
    const pages = pagesOfCategory(category);
    return pages.length > 1 ? `${categoryLabel(category)} › ${pageLabel(id)}` : categoryLabel(category);
}

function openList(open) {
    return Array.isArray(open) ? open.map(String) : [];
}

function legacyImagePage(sub) {
    return LEGACY_IMAGE_PAGES[String(sub || '').trim()] || 'source';
}

function legacyReaderPage(sub, open) {
    const raw = String(sub || 'dialog').trim();
    const id = LEGACY_READER_ALIASES[raw] || raw;
    const page = LEGACY_READER_PAGES[id] || 'style';
    if (page !== 'perf-text') return page;
    for (const key of open) {
        const match = /^perf-group-(\w+)$/.exec(key);
        if (match && PERFORMANCE_GROUP_PAGES[match[1]]) return PERFORMANCE_GROUP_PAGES[match[1]];
    }
    return page;
}

function legacyScenePage(sub, open, wardrobeFocus) {
    const raw = String(sub || 'characters').trim();
    const id = LEGACY_SCENE_ALIASES[raw] || raw;
    if (id === 'characters') return 'chars';
    if (id === 'scenes') return 'scenes';
    if (id === 'review') return 'review';
    if (id === 'scene-review') return 'scene-review';
    if (id === 'wardrobe') return 'wardrobe';
    if (id === 'rules') {
        if (wardrobeFocus || open.includes('rules-mood')) return 'wardrobe';
        if (open.includes('rules-event-cg')) return 'cglib';
        return 'rules';
    }
    return 'chars';
}

// 把「新页面 / 新分类 / 旧 tab + 旧子页」任一种说法解析成页面 id。
// spec 可含 page、tab、readerSubTab、sceneSubTab、imageSubTab、open（折叠 key 列表）、wardrobeFocus。
export function resolveSettingsPage(spec = {}) {
    const src = spec && typeof spec === 'object' ? spec : {};
    const open = openList(src.open);
    if (src.page != null && src.page !== '' && isSettingsPage(src.page)) return canon(src.page);
    const rawTab = String(src.tab || '').trim();
    const tab = rawTab;
    if (!tab) return DEFAULT_SETTINGS_PAGE;
    // 旧的 regex 页签是正文格式化那一节，现在是「正文解析」页。
    if (tab === 'regex') return 'parse';
    if (tab === 'basic') return open.some((key) => key === 'source-filter' || key === 'body-format' || key === 'virtual-regex') ? 'parse' : 'dash';
    if (tab === 'reader') return legacyReaderPage(src.readerSubTab, open);
    if (tab === 'scene') return legacyScenePage(src.sceneSubTab, open, src.wardrobeFocus);
    if (tab === 'image') return legacyImagePage(src.imageSubTab);
    if (CATEGORY_IDS.has(tab) || PAGE_BY_ID.has(canon(tab))) return defaultPageOfCategory(tab);
    return DEFAULT_SETTINGS_PAGE;
}

// 旧 target（搜索条目、引导步骤）→ { page, open }；新 target 原样规范化。
export function resolveSettingsTarget(target = {}) {
    const src = target && typeof target === 'object' ? target : {};
    const open = openList(src.open);
    const page = resolveSettingsPage({ ...src, open });
    const keys = open.filter((key) => !/^perf-group-\w+$/.test(key));
    // 旧的预置CG页（或旧的 rules-event-cg 折叠）现在是 CG库 页里的折叠，跳转时一并展开。
    if (page === 'cglib' && !keys.includes(EVENT_CG_FOLD) && (String(src.page || '').trim() === 'eventcg' || String(src.tab || '').trim() === 'eventcg' || open.includes('rules-event-cg'))) keys.push(EVENT_CG_FOLD);
    return { page, open: keys, path: typeof src.path === 'string' ? src.path : '' };
}

// settingsState.tab 只认分类 id，也接受旧 tab id。
export function normalizeSettingsTab(tab) {
    const raw = String(tab || '').trim();
    if (CATEGORY_IDS.has(raw)) return raw;
    return categoryOfPage(resolveSettingsPage({ tab: raw }));
}

// 当前显示的页面：优先 asyncState.page；没有时（旧调用方只写了 tab / 子页）按旧字段推。
export function currentSettingsPage(settingsState) {
    const state = settingsState || {};
    const asyncState = state.asyncState || {};
    if (isSettingsPage(asyncState.page)) return canon(asyncState.page);
    return resolveSettingsPage({
        tab: state.tab,
        readerSubTab: asyncState.readerSubTab,
        sceneSubTab: asyncState.sceneSubTab,
        imageSubTab: asyncState.imageSubTab,
        wardrobeFocus: asyncState.wardrobeFocus,
        open: Object.keys(asyncState.advancedOpen || {}).filter((key) => asyncState.advancedOpen[key]),
    });
}

// 所有「写旧字段跳页」的地方统一走这里：同时设 tab（分类）和 asyncState.page。
export function openSettingsPage(settingsState, page) {
    if (!settingsState) return DEFAULT_SETTINGS_PAGE;
    const id = isSettingsPage(page) ? canon(page) : resolveSettingsPage({ tab: page });
    settingsState.asyncState = settingsState.asyncState || {};
    settingsState.asyncState.page = id;
    if (String(page || '').trim() === 'eventcg') settingsState.asyncState.advancedOpen = { ...(settingsState.asyncState.advancedOpen || {}), [EVENT_CG_FOLD]: true };
    settingsState.tab = categoryOfPage(id);
    // 记下每个分类最近停留的子页：点回这个分类时回到那一页。
    settingsState.asyncState.pageByCategory = { ...(settingsState.asyncState.pageByCategory || {}), [settingsState.tab]: id };
    return id;
}
