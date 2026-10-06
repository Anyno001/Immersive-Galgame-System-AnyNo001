// 设置搜索索引：把深层设置项映射到「分页 → 子页 → 分组 → 折叠区」，输入关键词即可直接定位。
// 纯数据与纯函数，不读 DOM、不写设置；跳转由设置面板按 target 切换分页并展开对应折叠区。
import { PERFORMANCE_FEATURES } from './performance-presets.js';
import { PERFORMANCE_GROUPS } from './performance-settings-layout.js';

const READER_TAB = Object.freeze({ tab: 'reader', tabLabel: '阅读器', readerSubTab: 'performance', subTabLabel: '演出' });
const MAX_RESULTS = 8;

// 演出开关的口语说法：用户搜的往往不是界面原文（「打字音」「黑边」「卡」）。
const FEATURE_ALIASES = Object.freeze({
    打字机: ['打字', '逐字', '打字音', '一个字一个字'],
    句末等待符号: ['等待', '箭头', '翻页提示'],
    行内文字效果: ['字效', '抖动', '吼叫', '特效文字'],
    转场: ['过渡', '淡入', '换场'],
    环境滤镜: ['调色', '夜晚', '变暗', '滤镜'],
    镜头语言: ['镜头', '推镜', '特写'],
    天气: ['下雨', '下雪', '雾', '粒子'],
    震动: ['晃', '抖屏', '震屏'],
    立绘活动: ['呼吸', '动起来', '登场'],
    情绪动作: ['跳', '抖', '动作'],
    情绪符号: ['漫画', '集中线', '符号', '汗'],
    心跳脉动: ['心跳', '心动'],
    闪白耳鸣: ['闪白', '耳鸣', '震惊'],
    内心弹幕: ['心声', '弹幕'],
    标题卡: ['报幕', '地点', '时间'],
    数值提示: ['好感', '数值', '提示'],
    获得物品: ['物品', '道具', '背包'],
    演出标签: ['来电', '通知', '回忆', '电话'],
    日常演出: ['日常', '拍照', '做饭'],
    战斗: ['打架', '战斗', '血条'],
    线上交流: ['聊天', '手机', '短信', '微信'],
    直播间: ['直播'],
    观众弹幕: ['弹幕', '观众'],
    亲密演出: ['亲密', '暧昧', '恋爱', 'nsfw'],
    演出音效: ['音效', '声音'],
    环境音: ['鸟叫', '雨声', '背景声'],
    界面音效: ['点击音', '按钮声'],
    背景音乐: ['bgm', '音乐', '配乐', '歌'],
});

// 演出档位之外、藏在折叠区里的细项：label 是界面上的原文，aliases 是用户可能输入的说法。
// target 不写时在「阅读器 › 演出」；写了就按 target 跳到别的分页。
const EXTRA_ENTRIES = Object.freeze([
    { id: 'cinema-bars', label: '电影黑边', group: 'stage', open: [], aliases: ['黑边', '宽银幕', '上下黑条'] },
    { id: 'cg-hold', label: '日常CG停留', group: 'rhythm', open: [], aliases: ['cg', '插图', '停留', '几页'] },
    { id: 'render-quality', label: '画质 / 省电模式', aliases: ['卡', '卡顿', '发热', '耗电', '低画质', '省电', '掉帧'], location: '基础 › 一键档位', target: { tab: 'basic', open: [] } },
    { id: 'image-count', label: '检测图像数量', aliases: ['图片数量', '图不对', '少图', '多图'], location: '基础 › 标签解析', target: { tab: 'basic', open: ['source-filter'] } },
    { id: 'body-format', label: '正文格式化', aliases: ['正则', '格式', '分页不对', '乱码'], location: '基础 › 正文格式化', target: { tab: 'basic', open: ['body-format'] } },
    { id: 'toolbar-dock', label: '工具栏位置', aliases: ['工具栏', '按钮', '顶部', '紧贴对话框'], location: '阅读器 › 界面 › 工具栏', target: { tab: 'reader', readerSubTab: 'interface', open: [] } },
    { id: 'sprite-scale', label: '立绘缩放与高度', aliases: ['立绘太大', '立绘太小', '缩放', '高度', '人物大小'], location: '素材 › 角色 › 立绘设置', target: { tab: 'scene', sceneSubTab: 'characters', open: ['sprite-display'] } },
    { id: 'text-effect', label: '文字增强', aliases: ['描边', '看不清', '投影', '字看不清'], location: '阅读器 › 文字 › 排版', target: { tab: 'reader', readerSubTab: 'text', open: [] } },
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

function makeEntry({ id, label, group, open = [], aliases = [], location = '', target = null }) {
    const title = group === 'rhythm' ? '节奏与互动' : groupTitle(group);
    if (target) {
        return Object.freeze({
            id,
            label,
            location,
            nameKey: normalize(label),
            aliasKeys: Object.freeze(aliases.map(normalize).filter(Boolean)),
            groupKey: '',
            target: Object.freeze({ ...target, open: Object.freeze([...(target.open || [])]) }),
        });
    }
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
        .map((feature) => makeEntry({ id: `perf:${feature.key}`, label: feature.label, group: feature.group, aliases: FEATURE_ALIASES[feature.label] || [] })),
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

// 没有直接命中时的「你是否在找」：按查询里的字在名称和说法里出现的比例粗配，取最像的几条。
export function suggestSettings(query, index = SETTINGS_SEARCH_INDEX, limit = 3) {
    const q = normalize(query);
    if (!q) return [];
    const chars = [...new Set(q)];
    const scored = [];
    for (const entry of index) {
        const hay = entry.nameKey + entry.aliasKeys.join('');
        const hit = chars.filter((ch) => hay.includes(ch)).length;
        if (hit && hit / chars.length >= 0.5) scored.push({ entry, score: hit / chars.length });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ entry }) => entry);
}

function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// 搜索结果列表 HTML：空查询返回空串；无结果给一句提示。点击项带 data-setting-go，由设置面板跳转。
export function renderSettingsSearchResults(query, index = SETTINGS_SEARCH_INDEX) {
    if (!normalize(query)) return '';
    const item = (entry) => `<button type="button" class="igs-settings-search-item" data-setting-go="${escapeHtml(entry.id)}"><b>${escapeHtml(entry.label)}</b><span>${escapeHtml(entry.location)}</span></button>`;
    const results = searchSettings(query, index);
    if (results.length) return results.map(item).join('');
    const guesses = suggestSettings(query, index);
    if (guesses.length) return `<div class="igs-settings-search-hint">你是否在找：</div>${guesses.map(item).join('')}`;
    return '<div class="igs-settings-search-empty">没有找到相关设置，换个说法试试。</div>';
}
