// 设置搜索索引：把深层设置项映射到「分页 → 子页 → 分组 → 折叠区」，输入关键词即可直接定位。
// 纯数据与纯函数，不读 DOM、不写设置；跳转由设置面板按 target 切换分页并展开对应折叠区。
import { PERFORMANCE_FEATURES } from './performance-presets.js';
import { PERFORMANCE_GROUPS } from './performance-settings-layout.js';

const READER_TAB = Object.freeze({ tab: 'reader', tabLabel: '阅读器', readerSubTab: 'performance', subTabLabel: '演出' });
const MAX_RESULTS = 8;

// 演出档位之外、藏在折叠区里的细项：label 是界面上的原文，aliases 是用户可能输入的说法。
const EXTRA_ENTRIES = Object.freeze([
    { id: 'camera-kenburns', label: '背景缓慢推镜', group: 'stage', open: ['perf-camera'], aliases: ['推镜', '背景移动', '镜头'] },
    { id: 'camera-parallax', label: '鼠标视差', group: 'stage', open: ['perf-camera'], aliases: ['视差', '镜头'] },
    { id: 'camera-closeup', label: '情绪特写', group: 'stage', open: ['perf-camera'], aliases: ['特写', '放大', '镜头'] },
    { id: 'camera-impact', label: '情绪冲击推近', group: 'stage', open: ['perf-camera'], aliases: ['冲击', '推近', '镜头', '音效'] },
]);

function normalize(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, '');
}

function groupTitle(groupId) {
    const found = PERFORMANCE_GROUPS.find(([id]) => id === groupId);
    return found ? found[1] : '';
}

function makeEntry({ id, label, group, open = [], aliases = [] }) {
    const title = groupTitle(group);
    return Object.freeze({
        id,
        label,
        location: [READER_TAB.tabLabel, READER_TAB.subTabLabel, title].filter(Boolean).join(' › '),
        nameKey: normalize(label),
        aliasKeys: Object.freeze(aliases.map(normalize).filter(Boolean)),
        groupKey: normalize(title),
        target: Object.freeze({
            tab: READER_TAB.tab,
            readerSubTab: READER_TAB.readerSubTab,
            open: Object.freeze([`perf-group-${group}`, ...open]),
        }),
    });
}

export const SETTINGS_SEARCH_INDEX = Object.freeze([
    ...PERFORMANCE_FEATURES
        .filter((feature) => feature && feature.label && groupTitle(feature.group))
        .map((feature) => makeEntry({ id: `perf:${feature.key}`, label: feature.label, group: feature.group })),
    ...EXTRA_ENTRIES.map(makeEntry),
]);

// 返回按匹配程度排序的结果：名称开头命中 > 名称包含 > 别名命中 > 只命中分组名。
// 分组名命中排最后：搜「镜头」时，带「镜头」别名的细项不能被同组其他开关挤出前 8 条。
export function searchSettings(query, index = SETTINGS_SEARCH_INDEX) {
    const q = normalize(query);
    if (!q) return [];
    const scored = [];
    for (const entry of index) {
        let score = 0;
        if (entry.nameKey.startsWith(q)) score = 4;
        else if (entry.nameKey.includes(q)) score = 3;
        else if (entry.aliasKeys.some((word) => word.includes(q))) score = 2;
        else if (entry.groupKey.includes(q)) score = 1;
        if (score) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_RESULTS).map(({ entry }) => entry);
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// 搜索结果列表 HTML：空查询返回空串；无结果给一句提示。点击项带 data-setting-go，由设置面板跳转。
export function renderSettingsSearchResults(query, index = SETTINGS_SEARCH_INDEX) {
    if (!normalize(query)) return '';
    const results = searchSettings(query, index);
    if (!results.length) return '<div class="igs-settings-search-empty">没有找到相关设置，换个说法试试。</div>';
    return results.map((entry) => `<button type="button" class="igs-settings-search-item" data-setting-go="${escapeHtml(entry.id)}"><b>${escapeHtml(entry.label)}</b><span>${escapeHtml(entry.location)}</span></button>`).join('');
}
