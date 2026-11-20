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

const TAG_FORMAT = '[igs-forum:帖子标题|楼主=角色名、{{user}}或「路人:身份」|角色名=代号|{{user}}=代号]';
const TAG_FORMAT_LOCKED = '[igs-forum:帖子标题|角色名=代号|{{user}}=代号]';
const TAG_FORMAT_SHORT = '[igs-forum:标题|楼主=…|名=代号]';
const TAG_FORMAT_SHORT_LOCKED = '[igs-forum:标题|名=代号]';
const CODE_NOTE = '代号是楼主在帖子里对别人的称呼（如 A、学姐、红衣服那个）';

function posterLine(poster, data) {
    const po = data && data.po;
    if (poster === 'char') return `楼主是${po && po.kind === 'char' && po.key ? po.key : '剧中的角色本人'}，不要改`;
    if (poster === 'user') return '楼主是{{user}}，不要改';
    if (poster === 'witness') return `楼主是围观路人${po && po.kind === 'witness' && po.note ? `（${po.note}）` : ''}，不要改`;
    return '楼主是发这个帖子的人，从剧中角色本人、{{user}}、围观路人里挑最有戏的一个';
}

function describePo(po) {
    if (!po) return '';
    if (po.kind === 'user') return '{{user}}';
    if (po.kind === 'witness') return `路人${po.note ? `:${po.note}` : ''}`;
    return po.key || '';
}

// 已登记的事实一句话；什么都没有时返回空串。
export function forumFactsText(data) {
    if (!data) return '';
    const parts = [];
    if (data.title) parts.push(data.title);
    const po = describePo(data.po);
    if (po) parts.push(`楼主 ${po}`);
    const alias = Object.entries(data.alias || {}).map(([key, name]) => `${key}=${name}`);
    if (alias.length) parts.push(alias.join('、'));
    return parts.join('；');
}

// 登记齐了（标题与楼主都有）就可以折成一行索引。
export function forumRegistered(data) {
    return Boolean(data && data.title && data.po);
}

const REPLY_NOTE = '再在末尾另起几行写回帖，每行一条 [igs-reply:发言人|>回第几条|内容]：发言人写「楼主」或一个路人代称（同一代称视为同一个网友），「>回第几条」按回帖出现顺序编号、可省，内容是匿名网友口吻的一句话（不超过 40 字，吐槽、追问或接话）。让路人追问、楼主简短回应、路人之间互相接话，写 2–5 条，例：[igs-reply:路人甲|真的假的] [igs-reply:楼主|>1|真的，我亲眼看见的] [igs-reply:路人乙|>2|前排吃瓜]';
const replyLine = (settings) => (settings.replies === 'off' ? '' : REPLY_NOTE);

// 登记齐了：只留事实与改写入口，不再重复整段格式。
export function forumShortPromptText(settings, data) {
    return `【论坛体】正文以匿名论坛帖展示。已登记：${forumFactsText(data)}。仅需改动时在正文末尾写一行 ${settings.poster !== 'auto' ? TAG_FORMAT_SHORT_LOCKED : TAG_FORMAT_SHORT}，不写则沿用。${replyLine(settings) ? `每段正文${replyLine(settings)}。` : ''}`;
}

export function forumPromptText(settings, data) {
    const locked = settings.poster !== 'auto';
    const facts = forumFactsText(data);
    return [
        '【论坛体】本段正文会以匿名论坛帖的形式展示。仅在以下信息尚未确定或剧情需要改变时，在正文末尾写一行（不写则沿用已有）：',
        locked ? TAG_FORMAT_LOCKED : TAG_FORMAT,
        `${posterLine(settings.poster, data)}；标题用楼主口吻；${CODE_NOTE}。${facts ? `已登记：${facts}。` : ''}`,
        replyLine(settings) ? `每段正文${replyLine(settings)}。` : '',
    ].filter(Boolean).join('\n');
}
