// 论坛体的插件自带点缀回帖词库，与登记提示词的文案。

export const FORUM_LINES = Object.freeze({
    base: Object.freeze(['前排', '蹲', 'PO主继续', 'mark', '后续呢', '坐等更新', '板凳已备好', '围观']),
    ellipsis: Object.freeze(['断在这里？？', 'PO主你出来', '就这？下文呢', '别断啊']),
    mood: Object.freeze(['这谁顶得住', '修罗场预定', '我先嗑为敬', '救命，好甜']),
    scene: Object.freeze(['时间跳得好快', '换场景了？', '中间发生了什么']),
    long: Object.freeze(['好长，先码', '这楼层好厚', '一口气看完了']),
});

// 板块名：按世界观取一个像样的，用户可在设置里改。
export const FORUM_BOARDS = Object.freeze({
    modern: '综合版1',
    ancient: '茶馆闲谈',
    fantasy: '酒馆告示板',
    scifi: '星网频道',
    horror: '怪谈版',
});
export const FORUM_BOARD_DEFAULT = '综合版1';

import { describePo, threadAt, titleAt } from './forum-reader-threads.js';

const TAG_FORMAT = '[igs-forum:帖子标题|楼主=角色名、{{user}}或「路人:身份」|角色名=代号|{{user}}=代号]';
const TAG_FORMAT_LOCKED = '[igs-forum:帖子标题|角色名=代号|{{user}}=代号]';
const TAG_FORMAT_SHORT = '[igs-forum:标题|楼主=…|名=代号]';
const TAG_FORMAT_SHORT_LOCKED = '[igs-forum:标题|名=代号]';
const CODE_NOTE = '代号是楼主在帖子里对别人的称呼（如 A、学姐、红衣服那个）';
const SWITCH_NOTE = '换人发帖时写 楼主=新的人；同一楼主只改标题时只写新标题';
const AUTO_NOTE = '可以按剧情换成另一个当事人发帖，两人交替讲述';

function pairText(settings) {
    const [a, b] = settings.posterPair || [];
    return a && b ? `${a}、${b}` : '两位当事人';
}

function posterLine(settings, data) {
    const poster = settings.poster;
    const thread = threadAt(data, Infinity);
    const po = thread && thread.po;
    if (poster === 'char') return `楼主是${po && po.kind === 'char' && po.key ? po.key : '剧中的角色本人'}，不要改`;
    if (poster === 'user') return '楼主是{{user}}，不要改';
    if (poster === 'witness') return `楼主是围观路人${po && po.kind === 'witness' && po.note ? `（${po.note}）` : ''}，不要改`;
    if (poster === 'pair') return `楼主只在 ${pairText(settings)} 之间交替，${SWITCH_NOTE}`;
    return `楼主是发这个帖子的人，从剧中角色本人、{{user}}、围观路人里挑最有戏的一个；${AUTO_NOTE}；${SWITCH_NOTE}`;
}

// 已登记的事实一句话：当前帖（最近生效的帖子）；还有别的帖子就补一句。什么都没有时返回空串。
export function forumFactsText(data) {
    const current = threadAt(data, Infinity);
    if (!current) return '';
    const parts = [];
    const title = titleAt(current, Infinity);
    const po = describePo(current.po);
    parts.push(`当前帖：${po ? `楼主 ${po}` : '楼主未定'}${title ? `《${title}》` : ''}`);
    const alias = Object.entries(current.alias || {}).map(([key, name]) => `${key}=${name}`);
    if (alias.length) parts.push(`代号 ${alias.join('、')}`);
    const others = data.threads.filter((t) => t.id !== current.id).map((t) => `${describePo(t.po) || '楼主未定'}${titleAt(t, Infinity) ? `《${titleAt(t, Infinity)}》` : ''}`);
    if (others.length) parts.push(`另有帖子：${others.join('、')}`);
    return parts.join('；');
}

// 登记齐了（当前帖有标题和楼主）就可以折成一行索引。
export function forumRegistered(data) {
    const t = threadAt(data, Infinity);
    return Boolean(t && t.po && t.titles.length);
}

const REPLY_NOTE = '再在末尾另起几行写回帖，每行一条 [igs-reply:发言人|>回第几条|内容]：发言人写「楼主」或一个路人代称（同一代称视为同一个网友），「>回第几条」按回帖出现顺序编号、可省，内容是匿名网友口吻的一句话（不超过 40 字，吐槽、追问或接话）。让路人追问、楼主简短回应、路人之间互相接话（路人可以提一句隔壁帖子，如「隔壁帖的楼主是不是就是你说的 A」，一条以内，不强求），写 2–5 条，例：[igs-reply:路人甲|真的假的] [igs-reply:楼主|>1|真的，我亲眼看见的] [igs-reply:路人乙|>2|前排吃瓜]';
const replyLine = (settings) => (settings.replies === 'off' ? '' : REPLY_NOTE);

// 登记齐了：只留事实与改写入口，不再重复整段格式。
export function forumShortPromptText(settings, data) {
    return `【论坛体】正文以匿名论坛帖展示。已登记：${forumFactsText(data)}。仅需改动时在正文末尾写一行 ${settings.poster === 'char' || settings.poster === 'user' || settings.poster === 'witness' ? TAG_FORMAT_SHORT_LOCKED : TAG_FORMAT_SHORT}，不写则沿用。${settings.poster === 'auto' ? `${AUTO_NOTE}；${SWITCH_NOTE}。` : settings.poster === 'pair' ? `楼主只在 ${pairText(settings)} 之间交替；${SWITCH_NOTE}。` : ''}${replyLine(settings) ? `每段正文${replyLine(settings)}。` : ''}`;
}

// 设置里自填的提示词（非空）整段替换内置写法，登记前后都用它；留空用内置。
export function forumPromptFor(settings, data, registered) {
    if (settings.promptRule) return settings.promptRule;
    return registered ? forumShortPromptText(settings, data) : forumPromptText(settings, data);
}

export function forumDefaultPromptText(settings) {
    return forumPromptText({ ...settings, promptRule: '' }, null);
}

export function forumPromptText(settings, data) {
    const locked = ['char', 'user', 'witness'].includes(settings.poster);
    const facts = forumFactsText(data);
    return [
        '【论坛体】本段正文会以匿名论坛帖的形式展示。仅在以下信息尚未确定或剧情需要改变时，在正文末尾写一行（不写则沿用已有）：',
        locked ? TAG_FORMAT_LOCKED : TAG_FORMAT,
        `${posterLine(settings, data)}；标题用楼主口吻；${CODE_NOTE}。${facts ? `已登记：${facts}。` : ''}`,
        replyLine(settings) ? `每段正文${replyLine(settings)}。` : '',
    ].filter(Boolean).join('\n');
}
