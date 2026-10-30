// 设置搜索索引：把设置项映射到「页面 → 折叠区 → 具体项」，输入关键词即可直接定位。
// 手写条目（口语别名）是静态的；自动索引在第一次输入搜索词时按页面渲染结果懒建一次，随设置状态缓存。
// 纯数据与纯函数，不读 DOM、不写设置；跳转由设置面板按 target（{ page, open, path }）切换页面并展开对应折叠区。
import { PERFORMANCE_FEATURES } from './performance-presets.js';
import { PERFORMANCE_GROUPS } from './performance-settings-layout.js';
import { PERFORMANCE_GROUP_PAGES, SETTINGS_PAGES, categoryLabel, pageLocation } from './settings-pages.js';

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
    漫画背景: ['花背景', '气场', '石化', '风化', '反转', '速度线', '漩涡'],
    人群氛围: ['人群', '路人', '围观', '剪影', '鼓掌'],
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
    直播间: ['直播', '字幕', '全屏台词', '旁白位置', '防挡脸', '挡脸', '弹幕避让', '超管', '警告', '封禁', '断播', '表情', '粉丝牌', '自定义弹幕', '路人弹幕'],
    手机社区: ['社区', '微博', '朋友圈', '表白墙', '小红书', '贴吧', '论坛', '刷手机', '平台写法'],
    观众弹幕: ['弹幕', '观众'],
    亲密演出: ['亲密', '暧昧', '恋爱', 'nsfw'],
    演出音效: ['音效', '声音'],
    环境音: ['鸟叫', '雨声', '背景声'],
    界面音效: ['点击音', '按钮声'],
    背景音乐: ['bgm', '音乐', '配乐', '歌'],
});

// 演出档位之外、藏在折叠区里的细项，和跨页的常用项：label 是界面上的原文，aliases 是用户可能输入的说法。
// 有 group 的按演出分组落到对应页（open 为所在折叠 key）；其余写 page / open / path。
// 旧叫法（皮肤、副LLM、清除素材缓存）留作别名，老用户照旧搜得到。
const EXTRA_ENTRIES = Object.freeze([
    { id: 'nai-sprite-transparent', label: '内置 NAI 立绘透明底', aliases: ['NAI', '透明底', 'V5', '抠图'], page: 'source', path: 'bridge.imageApi.naiSpriteTransparent' },
    { id: 'auto-matte', label: '自动抠图', aliases: ['抠图', '关闭抠图', '去底', '保留底色'], page: 'source', path: 'bridge.imageApi.autoMatte' },
    { id: 'sprite-matte-color', label: '抠图底色', aliases: ['抠图', '绿底', '紫底', '灰底', '白底', '绿幕'], page: 'source', path: 'bridge.imageApi.spriteMatteColor' },
    { id: 'external-sprite-dna', label: '外部生图前补齐角色 DNA', aliases: ['副API', '副 API', '备用模型', '外部立绘', 'dbgen', '建档'], page: 'source', path: 'bridge.imageApi.externalSpriteDna' },
    { id: 'image-prompt-presets', label: '提示词组', aliases: ['固定提示词组预设', '生图预设', '提示块', '导入预设', '编辑提示词'], page: 'llm', open: ['image-prompt-editor'] },
    { id: 'world-info-filter', label: '世界书筛选', aliases: ['世界书', '排除世界书', '屏蔽条目', '污染写词', '写词参考', 'lorebook'], page: 'llm', open: ['wi-filter-group'] },
    { id: 'artist-library', label: '画师串库', aliases: ['画师', '导入画师', '选择画师', '画师库'], page: 'kinds' },
    { id: 'consistency-strength', label: '一致性重绘强度', aliases: ['强度', '角色一致性', '重绘', 'strength'], page: 'source', path: 'bridge.autoIllustration.consistencyStrength' },
    { id: 'my-phone', label: '我的手机', group: 'special', open: ['perf-my-phone'], aliases: ['手机壳', '机型', '壁纸', '铃声', '手机外观', '壳色', '折叠屏', '刘海屏', '平板'] },
    { id: 'comic-mode', label: '漫画演出模式', group: 'stage', open: ['perf-comic-mode'], path: 'readerSettings.comicMode.enabled', aliases: ['漫画', '对话泡', '气泡', '竖排', '黑白', '漫画模式', '吹き出し'] },
    { id: 'cinema-bars', label: '电影黑边', group: 'stage', open: [], path: 'readerSettings.cinemaBars', aliases: ['黑边', '宽银幕', '上下黑条'] },
    { id: 'cg-hold', label: '日常CG停留', group: 'rhythm', open: [], path: 'readerSettings.cgHoldPages', aliases: ['cg', '插图', '停留', '几页'] },
    { id: 'render-quality', label: '画质 / 省电模式', aliases: ['卡', '卡顿', '发热', '耗电', '低画质', '省电', '掉帧'], page: 'dash' },
    { id: 'image-count', label: '检测图像数量', aliases: ['图片数量', '图不对', '少图', '多图'], page: 'parse', open: ['source-filter'], path: 'readerSettings.imageCountOverride' },
    { id: 'body-format', label: '正文格式化', aliases: ['正则', '格式', '分页不对', '乱码'], page: 'parse', open: ['body-format'], path: 'bridge.virtualRegex.enabled' },
    { id: 'shortcuts', label: '快捷键', aliases: ['键盘', '热键', '按键', '改键'], page: 'ui-reader' },
    { id: 'toolbar-dock', label: '工具栏位置', aliases: ['工具栏', '按钮', '顶部', '紧贴对话框'], page: 'ui-bar', path: 'readerSettings.toolbarDock' },
    { id: 'status-hud-position', label: '状态栏位置', aliases: ['状态栏', 'hud', '头像', '左上角', '挡住', '挪位置'], page: 'ui-bg' },
    { id: 'creature-system', label: '非人角色', aliases: ['怪物', '妖怪', '妖魔', '魔物', '兽人', '半人形', '体型缩放', '巨型', '自动建档', '战斗对手', '临时档案'], page: 'chars', open: ['creature-system'], path: 'readerSettings.creatureDisplay.enabled' },
    { id: 'clash-fx', label: '立绘碰撞', group: 'story', open: ['perf-clash-fx'], path: 'readerSettings.fxTags.clash', aliases: ['碰撞', '打', '推', '扑', '拥抱', '巴掌', '击掌', '撞'] },
    { id: 'inner-demon', label: '心魔黑影', group: 'stage', open: [], path: 'readerSettings.innerDemon.enabled', aliases: ['心魔', '另一个自己', '人格分裂', '第二人格', '黑影', '自我对话'] },
    { id: 'battle-dash', label: '出手冲刺', group: 'special', open: ['perf-battle-fx'], path: 'readerSettings.battleFx.dash', aliases: ['冲刺', '出手', '战斗'] },
    { id: 'creature-battle-fx', label: '非人演出', group: 'special', open: [], path: 'readerSettings.battleFx.creature', aliases: ['怪物演出', '威吓', '群怪', '收服', '狂暴', '战斗'] },
    { id: 'creature-framing', label: '非人角色取景与情绪档', aliases: ['半身', '全身', '半人形', '取景', '情绪档', '四档', '差分'], page: 'chars' },
    { id: 'creature-artist', label: '非人画师串', aliases: ['怪物画师', '分区画师', '画师'], page: 'kinds', open: ['prompt-kind-creature'] },
    { id: 'creature-prompt-rule', label: '非人写词规则', aliases: ['怪物写词', '写词规则', '姿态差分', '提示词预设'], page: 'llm', open: ['image-prompt-editor'] },
    { id: 'sprite-scale', label: '立绘缩放与高度', aliases: ['立绘太大', '立绘太小', '缩放', '高度', '人物大小'], page: 'chars', open: ['sprite-display'] },
    { id: 'panel-glass', label: '面板透明度', aliases: ['面板玻璃', '玻璃', '玻璃浓度', '毛玻璃', '半透明', '透明度'], page: 'style', open: ['dialog-glass'], path: 'readerSettings.glassOpacity' },
    { id: 'dialog-skin', label: '对话框风格', aliases: ['皮肤', '对话框样式', '换皮', '科幻', '末日', '全息', '废土', '武侠', '水墨', '江湖', '本卡皮肤', '主题'], page: 'style', path: 'readerSettings.dialogSkin' },
    { id: 'resume-prompt', label: '续读提示', aliases: ['继续阅读', '上次读到', '续读', '读档提示'], page: 'style', path: 'readerSettings.resumePrompt' },
    { id: 'title-screen', label: '开场先显示主界面', aliases: ['主界面', '标题画面', '开始菜单', '开场白', '第0层', '选择世界观'], page: 'style', path: 'readerSettings.titleScreen' },
    { id: 'page-number', label: '显示页码', aliases: ['显示对话框内状态行', '状态行', '页码', '本楼页码', '1/33'], page: 'style', path: 'readerSettings.showStatusLine' },
    { id: 'text-effect', label: '文字增强', aliases: ['描边', '看不清', '投影', '字看不清'], page: 'text', path: 'readerSettings.dialogTextEffect' },
    { id: 'camera-kenburns', label: '背景缓慢推镜', group: 'stage', open: ['perf-camera'], aliases: ['推镜', '背景移动', '镜头'] },
    { id: 'camera-parallax', label: '鼠标视差', group: 'stage', open: ['perf-camera'], aliases: ['视差', '镜头'] },
    { id: 'camera-closeup', label: '情绪特写', group: 'stage', open: ['perf-camera'], aliases: ['特写', '放大', '镜头'] },
    { id: 'camera-impact', label: '情绪冲击推近', group: 'stage', open: ['perf-camera'], aliases: ['冲击', '推近', '镜头', '音效'] },
    { id: 'kind-models', label: '按类型单独指定模型', aliases: ['模型', 'CG模型', '剧情CG', '立绘模型', '背景模型', '物品模型', '不同模型', '分类型模型'], page: 'kinds' },
    { id: 'nai-api-endpoint', label: 'NAI API 地址与中转', aliases: ['NAI地址', 'NAI中转', '自定义URL', '生图接口', 'NAI代理'], page: 'source', path: 'bridge.autoIllustration.nai.endpoint' },
    { id: 'dbgen-sprite-transparent', label: '立绘透明底', aliases: ['透明底', '透明背景', 'v4.5', '数据库生图', '白底', '白色背景'], page: 'source', path: 'bridge.imageApi.dbgenSpriteTransparent' },
    { id: 'purge-asset-cache', label: '清素材缓存', aliases: ['清除素材缓存', '清缓存', '缓存', '缩略图', '图片不更新', '占空间', '清空'], page: 'data' },
    { id: 'generate-assets', label: '生成立绘 / 背景 / 物品开关', aliases: ['不生成立绘', '不生成背景', '不生成物品', '关闭物品图', '素材补全', '生成立绘', '生成背景', '生成物品图'], page: 'kinds' },
    { id: 'auto-outfit-sprite', label: '新衣装自动入库并生成立绘', aliases: ['服装DNA', '新服装', '自动换装', '衣柜入库'], page: 'kinds', path: 'bridge.autoIllustration.assets.outfitAutoGenerate' },
    { id: 'prompt-rule-inject', label: '自动注入格式规则', aliases: ['格式规则', '规则提示词', '提示词', '注入', '关闭注入', '酒馆预设', '复制提示词', '复制到预设', '复制到酒馆预设', '复制预设'], page: 'rules', path: 'bridge.sceneAssets.promptRuleEnabled' },
    { id: 'fx-prompts', label: '演出写法', aliases: ['演出提示词', '提示词正文', '触发关键词', '关键词', '常驻', '注入位置', '插入深度', '深度', '世界书', '写法'], page: 'rules' },
    { id: 'backup-model', label: '备用模型', aliases: ['副llm', '副 llm', '副api', '副 api', '副模型', 'llm', 'openai', '规划模型'], page: 'llm' },
    { id: 'export-config', label: '导出 / 导入配置', aliases: ['备份', '导出素材', '导入素材', '导出本卡素材', '导入素材包', '导出配置', '导入配置', '迁移', '本页诊断', '诊断'], page: 'data' },
]);

function normalize(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, '');
}

function groupTitle(groupId) {
    const found = PERFORMANCE_GROUPS.find(([id]) => id === groupId);
    return found ? found[1] : '';
}

function makeEntry({ id, label, group, open = [], aliases = [], location = '', page = '', path = '', groupName = '' }) {
    const targetPage = page || PERFORMANCE_GROUP_PAGES[group] || 'dash';
    const title = groupName || (group === 'rhythm' ? '节奏' : groupTitle(group));
    return Object.freeze({
        id,
        label,
        location: location || pageLocation(targetPage),
        nameKey: normalize(label),
        aliasKeys: Object.freeze(aliases.map(normalize).filter(Boolean)),
        groupKey: normalize(title),
        target: Object.freeze({ page: targetPage, open: Object.freeze([...open]), ...(path ? { path } : {}) }),
    });
}

// 每个页面本身也可搜（「衣柜」「日志」直接跳到页）：名称是子页名，分类名当别名。
const PAGE_ENTRIES = SETTINGS_PAGES.filter(([id]) => id !== 'dash').map(([id, label, category]) => makeEntry({
    id: `page:${id}`, label, page: id, aliases: [categoryLabel(category)], location: `${pageLocation(id)} · 整页`,
}));

export const SETTINGS_SEARCH_INDEX = Object.freeze([
    ...PERFORMANCE_FEATURES
        .filter((feature) => feature && feature.label && groupTitle(feature.group))
        .map((feature) => makeEntry({ id: `perf:${feature.key}`, label: feature.label, group: feature.group, path: `readerSettings.${feature.key}.enabled`, aliases: FEATURE_ALIASES[feature.label] || [] })),
    ...EXTRA_ENTRIES.map(makeEntry),
    ...PAGE_ENTRIES,
]);

// ---------- 自动索引：从页面渲染出的 HTML 里提取字段、开关和标题 ----------

const HTML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decodeHtml = (value) => String(value || '').replace(/&(?:amp|lt|gt|quot|#39);/g, (match) => HTML_ENTITIES[match]).replace(/\s+/g, ' ').trim();
// 太短的标签（颜色、字体、来源）脱离上下文没法认，前面补上最近的小标题。
const GENERIC_LABEL_MAX = 2;

// 页面 HTML → 条目。open 记下条目所在的 data-advanced 折叠 key 与外层演出行的 perf-<key>。
export function extractPageEntries(page, html) {
    const source = String(html || '');
    const found = [];
    const push = (index, kind, label, path) => {
        const text = decodeHtml(label);
        if (text) found.push({ index, kind, label: text, path: path || '' });
    };
    const fieldRe = /<label class="igs-settings-field"><span>([^<]*)<\/span>([\s\S]*?)<\/label>/g;
    for (let m = fieldRe.exec(source); m; m = fieldRe.exec(source)) {
        const inner = /data-(?:path|segment-path)="([^"]+)"/.exec(m[2]);
        if (inner) push(m.index, 'field', m[1], decodeHtml(inner[1]));
    }
    const switchRe = /<button type="button" class="igs-switch[^"]*" data-(?:switch|segment-path)="([^"]+)"[^>]*><i><\/i><span>([^<]*)/g;
    for (let m = switchRe.exec(source); m; m = switchRe.exec(source)) push(m.index, 'switch', m[2], decodeHtml(m[1]));
    // 没包在字段里的分段控件：用它自己的 aria-label 当名字。
    const segmentRe = /<div class="igs-segmented"[^>]*aria-label="([^"]*)"[^>]*>((?:(?!<\/div>)[\s\S])*)<\/div>/g;
    for (let m = segmentRe.exec(source); m; m = segmentRe.exec(source)) {
        const inner = /data-segment-path="([^"]+)"/.exec(m[2]);
        if (inner) push(m.index, 'segment', m[1], decodeHtml(inner[1]));
    }
    const titleRe = /igs-source-filter-title">([^<]*)/g;
    for (let m = titleRe.exec(source); m; m = titleRe.exec(source)) push(m.index, 'title', m[1], '');
    const summaryRe = /<summary>(?:<b>([^<]*)<\/b>|([^<]+)<\/summary>)/g;
    for (let m = summaryRe.exec(source); m; m = summaryRe.exec(source)) push(m.index, 'title', m[1] || m[2], '');
    found.sort((a, b) => a.index - b.index);

    // 单遍扫描标签，维护「折叠 / 演出行」栈与最近的小标题。
    const tokenRe = /<div class="igs-(?:settings|perf-item)-subhead">([^<]*)|<details\b[^>]*>|<\/details>|<div\b[^>]*>|<\/div>|<button\b[^>]*data-action="ui-toggle-open:([^"]*)"/g;
    const stack = [];
    let subhead = '';
    let cursor = 0;
    const entries = [];
    const seen = new Set();
    let heading = '';
    const flush = (limit) => {
        while (cursor < found.length && found[cursor].index < limit) {
            const item = found[cursor++];
            const open = stack.map((frame) => frame.key).filter(Boolean);
            if (item.kind === 'title') heading = item.label;
            const generic = item.label.length <= GENERIC_LABEL_MAX && subhead && item.kind !== 'title';
            const label = generic ? `${subhead} ${item.label}` : item.label;
            const dedupe = `${item.kind === 'title' ? 'title' : 'item'}|${item.path || label}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            entries.push({ label, path: item.path, kind: item.kind, open, heading: item.kind === 'title' ? '' : heading });
        }
    };
    for (let m = tokenRe.exec(source); m; m = tokenRe.exec(source)) {
        flush(m.index);
        const tag = m[0];
        if (m[1] != null) {
            // 小标题自己是个 div：记下文字，同时入栈，让后面的 </div> 能配上。
            subhead = decodeHtml(m[1]);
            stack.push({ type: 'div', key: '', perf: false });
        } else if (tag.startsWith('<details')) {
            const key = /data-advanced="([^"]+)"/.exec(tag);
            stack.push({ type: 'details', key: key ? decodeHtml(key[1]) : '' });
        } else if (tag === '</details>') {
            for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].type === 'details') { stack.splice(i, 1); break; }
        } else if (tag.startsWith('<div')) {
            stack.push({ type: 'div', key: '', perf: /class="igs-perf-item"/.test(tag) });
        } else if (tag === '</div>') {
            for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].type === 'div') { stack.splice(i, 1); break; }
        } else if (m[2] != null) {
            // 演出行的 › 按钮：它所在的行从此带上 perf-<key>（行头里的开关在它之前，不受影响）。
            let key = m[2];
            try { key = decodeURIComponent(key); } catch { /* 保持原样 */ }
            for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].perf) { stack[i].key = key; break; }
        }
    }
    flush(Infinity);
    return entries.map((item) => ({ ...item, page }));
}

// 条目 → 搜索条目。同页同名的手写条目优先（带口语别名），自动条目只给它补上精确的 path 和折叠位置；
// 同页重名但 path 不同的（每条按需注入都有「方式」「关键词」）在名字前补上所在小节的标题。
export function mergeSearchEntries(base, auto) {
    const merged = [...base];
    const nameAt = new Map();
    const paths = new Set();
    merged.forEach((entry, i) => {
        if (!entry.id.startsWith('page:')) nameAt.set(`${entry.target.page}|${entry.nameKey}`, i);
        if (entry.target.path) paths.add(`${entry.target.page}|${entry.target.path}`);
    });
    const taken = new Set(merged.map((entry) => `${entry.target.page}|${entry.nameKey}`));
    for (const item of auto) {
        const nameKey = normalize(item.label);
        if (!nameKey) continue;
        const nameId = `${item.page}|${nameKey}`;
        if (item.path && paths.has(`${item.page}|${item.path}`)) continue;
        const at = nameAt.get(nameId);
        if (at != null) {
            const known = merged[at];
            // 手写条目没有 path 时，补上自动索引找到的 path 与折叠位置，跳转更准。
            if (item.path && !known.target.path) {
                merged[at] = Object.freeze({ ...known, target: Object.freeze({ ...known.target, open: Object.freeze([...(known.target.open.length ? known.target.open : item.open)]), path: item.path }) });
                paths.add(`${item.page}|${item.path}`);
            }
            continue;
        }
        if (!item.path && taken.has(nameId)) continue;
        const label = item.path && taken.has(nameId) && item.heading && normalize(item.heading) !== nameKey ? `${item.heading} ${item.label}` : item.label;
        const entry = makeEntry({
            id: `auto:${item.page}:${item.path || item.label}`,
            label,
            page: item.page,
            open: item.open,
            path: item.path,
        });
        taken.add(`${item.page}|${entry.nameKey}`);
        taken.add(nameId);
        if (item.path) paths.add(`${item.page}|${item.path}`);
        merged.push(entry);
    }
    return Object.freeze(merged);
}

// 对每个页面（仪表盘除外）以索引模式渲染一次并提取条目。renderPage(pageId) 返回 HTML。
export function buildSettingsSearchIndex(renderPage, base = SETTINGS_SEARCH_INDEX) {
    const auto = [];
    for (const [page] of SETTINGS_PAGES) {
        if (page === 'dash') continue;
        let html = '';
        try { html = renderPage(page); } catch { html = ''; }
        auto.push(...extractPageEntries(page, html));
    }
    return mergeSearchEntries(base, auto);
}

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

const attrEscape = (value) => String(value).replace(/["\\]/g, '\\$&');

// 跳转后在已渲染的设置页里找到这一项。有 path 时按 data-path / data-switch / data-segment-path 精确找，
// 取最近的字段、演出行或 label 闪烁；没有 path 时按界面原文找：先找文字完全相同的节点，再找包含它的最短节点，
// 「画质 / 省电模式」这类合写的名称拆开逐个找。都找不到时退回最后展开的折叠区按钮。
export function findSettingNode(body, entry) {
    if (!body || !entry || typeof body.querySelectorAll !== 'function') return null;
    const path = entry.target && entry.target.path;
    if (path && typeof body.querySelector === 'function') {
        for (const attr of ['data-path', 'data-switch', 'data-segment-path']) {
            const hit = body.querySelector(`[${attr}="${attrEscape(path)}"]`);
            if (hit) return (typeof hit.closest === 'function' && hit.closest('.igs-settings-field, .igs-perf-item, label')) || hit;
        }
    }
    const names = [entry.label, ...String(entry.label || '').split(/\s*\/\s*/)].map(normalize).filter(Boolean);
    const nodes = [...body.querySelectorAll('label, b, strong, span, small, summary, h3, h4, button, .igs-perf-item-head')];
    const texts = nodes.map((node) => normalize(node.textContent));
    for (const name of names) {
        let best = -1;
        for (let i = 0; i < nodes.length; i += 1) {
            if (!texts[i].includes(name)) continue;
            if (best < 0 || (texts[i] === name && texts[best] !== name) || (texts[best] !== name && texts[i].length < texts[best].length)) best = i;
        }
        if (best >= 0) {
            const node = nodes[best];
            return (typeof node.closest === 'function' && node.closest('.igs-perf-item, .igs-field, label')) || node;
        }
    }
    const open = entry.target && entry.target.open;
    for (let i = (open ? open.length : 0) - 1; i >= 0; i -= 1) {
        const fold = body.querySelector(`[data-action="ui-toggle-open:${encodeURIComponent(open[i])}"]`);
        if (fold) return fold;
    }
    return null;
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
    return '<div class="igs-settings-search-empty">未找到相关设置，可尝试换一种说法。</div>';
}
