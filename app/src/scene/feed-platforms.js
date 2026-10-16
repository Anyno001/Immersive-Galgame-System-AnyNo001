// 手机社区（纯数据 + 纯函数）：平台登记表、世界观换皮、标签解析、从原文收帖子（目录用）。
// 标签：[igs-fx:app|平台|主人(可省)] … [igs-fx:app-end] 包住看社区的一段；[igs-fx:post|作者|内容|附加] 一条帖子；[igs-fx:reply|作者|内容] 上一条帖子下的评论。
// 内容全部来自正文，前端不补任何本地文字；点赞、转发等数字由前端按内容稳定生成。

// skin：phone 在手机里显示（现代 / 科幻），paper 显示成纸面 / 布告（其他世界观）。
// prompt 是给 AI 的平台写法（用户可改，留空用这里的默认）。
export const FEED_PLATFORMS = Object.freeze([
    { id: 'moments', name: '朋友圈', aliases: ['朋友圈', '微信朋友圈', 'moments'], skin: 'phone', accent: '#07c160', extraLabel: '定位',
        prompt: '熟人圈子。作者是角色本人或共同好友，内容是生活碎片的配文，口吻私人；附加写定位或「仅部分可见」；reply 是好友评论，可以互相回复，谁给谁评论本身就是剧情。' },
    { id: 'weibo', name: '微博', aliases: ['微博', '新浪微博', 'weibo'], skin: 'phone', accent: '#ff8200', extraLabel: '话题',
        prompt: '公开广场。短句，常带 #话题# 与 @某人；附加写话题或热搜词；reply 是路人网友，站队、阴阳怪气、玩梗。' },
    { id: 'confess', name: '表白墙', aliases: ['表白墙', '校园墙', '万能墙'], skin: 'phone', accent: '#ff6f91', extraLabel: '墙',
        prompt: '校园匿名墙。作者写「匿名」或「墙墙代发」，内容以「捞人」「表白」「吐槽」开头，描述外貌、地点、时间但不点名；附加写学校或墙名；reply 是同学猜人、起哄、@当事人。' },
    { id: 'xhs', name: '小红书', aliases: ['小红书', '红书', 'xhs'], skin: 'phone', accent: '#ff2442', extraLabel: '标题',
        prompt: '分享笔记。附加写一个吸睛标题；内容是经验分享、探店、穿搭、晒礼物，语气热情；reply 是「求链接」「蹲后续」「姐妹好甜」之类。' },
    { id: 'tieba', name: '贴吧', aliases: ['贴吧', '百度贴吧', 'tieba'], skin: 'phone', accent: '#3385ff', extraLabel: '吧名',
        prompt: '兴趣吧。附加写吧名；内容像楼主开帖，口语、直白；reply 是楼层回复，常见「前排」「楼主好人」「图呢」之类的接梗。' },
    { id: 'douban', name: '豆瓣', aliases: ['豆瓣', '豆瓣小组', 'douban'], skin: 'phone', accent: '#2e963d', extraLabel: '小组',
        prompt: '小组帖。附加写小组名；文艺又八卦，内容讲一段亲身经历，可以长一点；reply 是「码」「楼主后续呢」「抱抱楼主」。' },
    { id: 'hupu', name: '虎扑', aliases: ['虎扑', '步行街', 'hupu'], skin: 'phone', accent: '#c60100', extraLabel: '板块',
        prompt: '步行街。附加写板块；直白、爱玩梗、爱评价；reply 是神回复，一针见血或离谱。' },
    { id: 'review', name: '书评影评', aliases: ['书评影评', '书评', '书评区', '影评', '影评区', '剧评', '评分', '起点', '晋江', '猫眼'], skin: 'phone', accent: '#e0a43a', extraLabel: '作品名与1~5星',
        prompt: '书、电影、剧的评分评论。附加写作品名与星级，如「《某书》4星」，星级只写1到5的整数；内容是长评或短评，有观点；reply 是其他读者观众的讨论或反驳。' },
    { id: 'zhihu', name: '知乎', aliases: ['知乎', 'zhihu'], skin: 'phone', accent: '#1772f6', extraLabel: '问题',
        prompt: '问答社区。附加写问题，如「如何评价……」「有个……是什么体验」；作者写答主（可带一句身份介绍，用逗号隔开）；内容是回答开头，常用「谢邀」「利益相关」「先说结论」；reply 是评论区，抬杠或追问。' },
    { id: 'news', name: '新闻', aliases: ['新闻', '新闻app', '今日头条', '头条', '新闻客户端', 'news'], skin: 'phone', accent: '#d7263d', extraLabel: '栏目与媒体',
        prompt: '新闻客户端。作者写媒体名（如某某日报、某某晚报、本地新闻），内容是新闻标题加一句导语，客观、公事公办；附加写栏目（社会/娱乐/本地/突发）；reply 是评论区网友，立场各异，热评有梗。' },
    { id: 'shop', name: '淘宝', aliases: ['淘宝', '购物', '网购', '拼多多', '京东', '闲鱼', 'shop'], skin: 'phone', accent: '#ff5000', extraLabel: '价格与店铺',
        prompt: '购物 App。每条 post 是一件商品：作者写店铺名，内容写商品标题（可以浮夸、离谱、带关键词堆砌），附加写价格与销量，如「¥9.9 月销1万+」；reply 是买家评价，可带「追评」。' },
    { id: 'search', name: '搜索记录', aliases: ['搜索记录', '搜索历史', '浏览记录'], skin: 'phone', accent: '#4e6ef2', extraLabel: '时间',
        prompt: '只在偷看别人手机时用。每条 post 是一条搜索词（作者可写时间），最新在前，搜索词要暴露心事。' },
    { id: 'memo', name: '备忘录', aliases: ['备忘录', '草稿箱', '备忘'], skin: 'phone', accent: '#f0b400', extraLabel: '标题',
        prompt: '只在偷看别人手机时用。附加写标题，内容是备忘或没发出去的话，附加含「草稿」则标未发送。' },
    { id: 'album', name: '相册', aliases: ['相册', '手机相册'], skin: 'phone', accent: '#8e8e93', extraLabel: '地点或时间',
        prompt: '只在偷看别人手机时用。每条 post 描述一张照片，附加写地点或时间；只显示灰色占位。' },
    { id: 'chats', name: '聊天列表', aliases: ['聊天列表', '聊天记录'], skin: 'phone', accent: '#07c160', extraLabel: '时间或置顶',
        prompt: '只在偷看别人手机时用。作者写对方备注名，内容是最后一条消息，附加写时间或「置顶」；reply 是点开会话后的几条消息。' },
    { id: 'starnet', name: '星网论坛', aliases: ['星网', '星网论坛', '星际论坛'], skin: 'phone', accent: '#38bdf8', extraLabel: '星区',
        prompt: '星际网络论坛。附加写星区或频道；内容带科幻世界的设定词；reply 是各星球网友的回复。' },
    { id: 'notice', name: '告示', aliases: ['告示', '告示栏', '榜文', '布告'], skin: 'paper', accent: '#8a3b2a', extraLabel: '张贴处',
        prompt: '城门或街口的告示、寻人启事、悬赏榜文，文言白话夹杂；作者写张贴者（官府、某府、某人）；附加写张贴地点；reply 是围观百姓的议论。' },
    { id: 'teahouse', name: '茶馆闲话', aliases: ['茶馆', '茶馆闲话', '说书', '坊间传闻'], skin: 'paper', accent: '#6b4f2a', extraLabel: '茶馆',
        prompt: '茶馆里流传的小道消息与说书段子；作者写说书人或茶客；附加写茶馆名；reply 是茶客插话、拍桌、起哄。' },
    { id: 'guild', name: '公会布告板', aliases: ['公会', '布告板', '委托板', '公会布告板'], skin: 'paper', accent: '#7a5a2b', extraLabel: '委托等级',
        prompt: '冒险者公会的委托、悬赏与组队招募；作者写委托人；附加写委托等级或报酬；reply 是冒险者的留言与揭榜。' },
    { id: 'tavern', name: '酒馆传闻', aliases: ['酒馆', '酒馆传闻', '吟游诗人'], skin: 'paper', accent: '#7c3f1d', extraLabel: '酒馆',
        prompt: '酒馆里吟游诗人传唱、酒客口耳相传的消息；作者写传话的人；附加写酒馆名；reply 是酒客附和、抬杠。' },
    { id: 'gazette', name: '魔法日报', aliases: ['日报', '魔法日报', '校报', '学院报'], skin: 'paper', accent: '#4b3a6b', extraLabel: '版面',
        prompt: '魔法世界的报纸或学院校报；作者写记者或专栏名；附加写版面；内容是标题加导语，夸张耸动；reply 是读者来信。' },
    { id: 'owl', name: '匿名信', aliases: ['匿名信', '猫头鹰信', '纸条'], skin: 'paper', accent: '#5b4b8a', extraLabel: '寄自',
        prompt: '匿名纸条或猫头鹰送来的信；作者写「匿名」或落款；附加写寄自何处；reply 是回信。' },
    { id: 'radio', name: '幸存者广播', aliases: ['广播', '幸存者广播', '电台', '频段'], skin: 'paper', accent: '#5a6b3a', extraLabel: '频段',
        prompt: '末日里断续的无线电广播；作者写呼号；附加写频段；内容简短、夹杂杂音描述；reply 是其他幸存者的回呼。' },
    { id: 'wall', name: '营地留言墙', aliases: ['留言墙', '营地留言墙', '寻人墙'], skin: 'paper', accent: '#6b5a3a', extraLabel: '营地',
        prompt: '营地墙上用炭笔写的留言、寻人、交易；作者写署名；附加写营地；reply 是后来者的补写。' },
    { id: 'extra', name: '号外', aliases: ['号外', '报纸', '新闻号外'], skin: 'paper', accent: '#3a3a3a', extraLabel: '报社',
        prompt: '大正时代的报纸号外，标题醒目、文风半文半白；作者写报社记者；附加写报社名；reply 是读者投书。' },
    { id: 'letters', name: '读者来信', aliases: ['读者来信', '投书', '杂志'], skin: 'paper', accent: '#7a4b5a', extraLabel: '杂志',
        prompt: '文艺杂志的读者来信栏；作者写笔名；附加写杂志名；内容是情感倾诉或评论；reply 是编辑或其他读者的回应。' },
]);

const BY_ID = new Map(FEED_PLATFORMS.map((p) => [p.id, p]));
export const FEED_PLATFORM_IDS = Object.freeze(FEED_PLATFORMS.map((p) => p.id));
const MODERN = Object.freeze(['news', 'moments', 'weibo', 'confess', 'xhs', 'zhihu', 'tieba', 'douban', 'hupu', 'review', 'shop', 'search', 'memo', 'album', 'chats']);

// 世界观 → 可用平台（顺序即提示词与设置里的顺序）。没列出的世界观（现代、恐怖等）用现代平台。
export const FEED_WORLDVIEW_PLATFORMS = Object.freeze({
    modern: MODERN,
    horror: MODERN,
    scifi: Object.freeze(['starnet', ...MODERN]),
    ancient: Object.freeze(['notice', 'teahouse']),
    fantasy: Object.freeze(['guild', 'tavern']),
    magic: Object.freeze(['gazette', 'owl']),
    apocalypse: Object.freeze(['radio', 'wall']),
    taisho: Object.freeze(['extra', 'letters']),
});

// 设置页分组：[标题, 平台 id 列表]。
export const FEED_SETTING_GROUPS = Object.freeze([
    ['现代', MODERN],
    ['科幻', Object.freeze(['starnet'])],
    ['古代', FEED_WORLDVIEW_PLATFORMS.ancient],
    ['西幻', FEED_WORLDVIEW_PLATFORMS.fantasy],
    ['魔法', FEED_WORLDVIEW_PLATFORMS.magic],
    ['末日', FEED_WORLDVIEW_PLATFORMS.apocalypse],
    ['大正', FEED_WORLDVIEW_PLATFORMS.taisho],
]);

export function feedPlatformById(id) {
    return BY_ID.get(String(id || '')) || null;
}

// carryPhone：随身带着现代手机（非现代世界观），本世界的消息来源之外再加上现代平台。
export function feedPlatformsForWorldview(worldview, carryPhone = false) {
    const own = FEED_WORLDVIEW_PLATFORMS[String(worldview || '')] || MODERN;
    const ids = carryPhone && own !== MODERN && own !== FEED_WORLDVIEW_PLATFORMS.horror ? [...own, ...MODERN.filter((id) => !own.includes(id))] : own;
    return ids.map((id) => BY_ID.get(id));
}

// AI 写的平台名（中文名、别名、id）→ 平台；认不出返回 null。
export function resolveFeedPlatform(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    return FEED_PLATFORMS.find((p) => p.id === key || p.name.toLowerCase() === key || p.aliases.some((a) => a.toLowerCase() === key)) || null;
}

// 手机主人：空、{{user}}、我、玩家名都是玩家自己的手机；其余是角色名（偷看别人的手机）。
export function isOwnPhone(owner, userName = '') {
    const name = String(owner || '').trim();
    if (!name) return true;
    const user = String(userName || '').trim();
    return /^(?:\{\{user\}\}|我|玩家|自己|user)$/i.test(name) || (Boolean(user) && name === user);
}

export const FEED_TAG_KINDS = Object.freeze(['app', 'post', 'reply', 'storm', 'mention']);
export const STORM_MENTION_MAX = 12;
// 舆论风暴的默认写法（用户可改，留空用这里的默认）。
export const STORM_DEFAULT_PROMPT = '{{user}}爆红或被骂上热搜才用；每层3~6条，红夸黑骂，平息写storm-end';
export const FEED_VIEW_MAX = 3;
export const FEED_REPLY_MAX = 3;
const NAME_MAX = 24;
const TEXT_MAX = 140;
const EXTRA_MAX = 40;

function cut(value, max) {
    return Array.from(String(value == null ? '' : value).trim()).slice(0, max).join('');
}

// 解析社区标签体（不含 [igs-fx: 与 ]）。不是社区标签返回 undefined，是但写坏了返回 null。
// 内容栏比其他演出标签长，所以不走通用 60 字截断。
export function parseFeedBody(body) {
    const parts = String(body || '').split('|');
    const head = String(parts[0] || '').trim().toLowerCase();
    if (head === 'app-end') return { kind: 'app', end: true, args: [] };
    if (head === 'app') {
        const platform = resolveFeedPlatform(parts[1]);
        // 第 3 栏手机主人（偷看角色的手机）；省略时不带，沿用旧结构。
        const owner = cut(parts[2], NAME_MAX);
        return platform ? { kind: 'app', end: false, args: owner ? [platform.id, owner] : [platform.id] } : null;
    }
    if (head === 'post') {
        const text = cut(parts[2], TEXT_MAX);
        return text ? { kind: 'post', end: false, args: [cut(parts[1], NAME_MAX) || '匿名', text, cut(parts[3], EXTRA_MAX)] } : null;
    }
    if (head === 'reply') {
        const text = cut(parts[2], TEXT_MAX);
        return text ? { kind: 'reply', end: false, args: [cut(parts[1], NAME_MAX) || '匿名', text] } : null;
    }
    // 舆论风暴：storm|平台|红或黑|热搜词；写错红黑按红，认不出平台留空。
    if (head === 'storm-end') return { kind: 'storm', end: true, args: [] };
    if (head === 'storm') {
        const platform = resolveFeedPlatform(parts[1]);
        const tone = /黑|black/i.test(String(parts[2] || '')) ? 'black' : 'red';
        return { kind: 'storm', end: false, args: [platform ? platform.id : '', tone, cut(parts[3], EXTRA_MAX)] };
    }
    if (head === 'mention') {
        const text = cut(parts[2], TEXT_MAX);
        return text ? { kind: 'mention', end: false, args: [cut(parts[1], NAME_MAX) || '匿名', text] } : null;
    }
    return undefined;
}

// 风暴区间：storm 开区间并清空评论，mention 累积，storm-end 关闭。
// 返回 { platform, tone, topic, mentions }（mentions 最多留最新 12 条，fresh 为本页新出现），区间外返回 null。
export function foldStormDirectives(directives, offset = Infinity, from = -1) {
    let storm = null;
    for (const d of Array.isArray(directives) ? directives : []) {
        if (d.offset > offset) break;
        if (d.kind === 'storm') storm = d.end ? null : { platform: d.args[0], tone: d.args[1], topic: d.args[2], mentions: [] };
        else if (d.kind === 'mention' && storm) storm.mentions.push({ author: d.args[0], text: d.args[1], fresh: d.offset > from });
    }
    if (storm) storm.mentions = storm.mentions.slice(-STORM_MENTION_MAX);
    return storm;
}

// 按指令顺序累积：app 开区间时清空，post 进当前平台，reply 挂到上一条帖子。
// 返回 { platform, owner, posts }（owner 为空是玩家自己的手机；posts 为该区间到 offset 为止的全部帖子），区间外返回 null。
export function foldFeedDirectives(directives, offset = Infinity) {
    let feed = null;
    for (const d of Array.isArray(directives) ? directives : []) {
        if (d.offset > offset) break;
        if (d.kind === 'app') feed = d.end ? null : { platform: d.args[0], owner: d.args[1] || '', posts: [] };
        else if (d.kind === 'post' && feed) feed.posts.push({ author: d.args[0], text: d.args[1], extra: d.args[2], replies: [], offset: d.offset });
        else if (d.kind === 'reply' && feed && feed.posts.length) {
            const last = feed.posts[feed.posts.length - 1];
            if (last.replies.length < FEED_REPLY_MAX) last.replies.push({ author: d.args[0], text: d.args[1] });
        }
    }
    return feed;
}

const FEED_TAG_RE = /\[igs-fx:([^\]\n]*)(?:\]|$)/gm;

// 目录用：从一楼原文收出全部帖子 [{ platform, author, text, extra, replies, offset }]（不限条数）。
export function collectFeedPosts(source) {
    const text = String(source || '');
    if (!text.includes('[igs-fx:')) return [];
    const out = [];
    let platform = '';
    let owner = '';
    let storm = null;
    for (const m of text.matchAll(FEED_TAG_RE)) {
        const d = parseFeedBody(m[1]);
        if (!d) continue;
        if (d.kind === 'storm') { storm = d.end ? null : { platform: d.args[0], tone: d.args[1], topic: d.args[2] }; continue; }
        if (d.kind === 'mention') {
            if (storm) out.push({ platform: storm.platform, author: d.args[0], text: d.args[1], extra: storm.topic, kind: 'storm', tone: storm.tone, replies: [], offset: m.index });
            continue;
        }
        if (d.kind === 'app') { platform = d.end ? '' : d.args[0]; owner = d.end ? '' : d.args[1] || ''; }
        else if (d.kind === 'post' && platform) out.push({ platform, owner, author: d.args[0], text: d.args[1], extra: d.args[2], replies: [], offset: m.index });
        else if (d.kind === 'reply' && platform && out.length && out[out.length - 1].kind !== 'storm' && out[out.length - 1].replies.length < FEED_REPLY_MAX) out[out.length - 1].replies.push({ author: d.args[0], text: d.args[1] });
    }
    return out;
}

// 数字由内容稳定生成：同一条帖子每次看到的点赞数一样。
export function feedStableCount(seed, min, max) {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return min + (h % Math.max(1, max - min + 1));
}

// 提示词按需：最近正文或玩家的话里提到的平台（名字、别名或 app 标签），只这些平台展开写法。
export function mentionedFeedPlatforms(texts) {
    const joined = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || '')).join('\n').toLowerCase();
    if (!joined) return [];
    return FEED_PLATFORMS.filter((p) => [p.name, ...p.aliases].some((name) => joined.includes(name.toLowerCase()))).map((p) => p.id);
}
