// 论坛体的插件自带点缀回帖词库，与登记提示词的文案。

export const FORUM_LINES = Object.freeze({
    // 抢楼类只在帖子开头那一楼用，后面的楼不再出现。
    opening: Object.freeze(['前排', '沙发', '板凳已备好', '蹲', '新帖？先占个座', '这标题我进来了', '刚好刷到', '标题党吧', '进来看看', '先码再看']),
    base: Object.freeze([
        'PO主继续', 'mark', '后续呢', '坐等更新', '围观', '追到这里了', '每天来看一眼', '顶', '帮顶', '还有吗',
        '接着说', '然后呢然后呢', '就等这一楼', '看完这楼睡觉', '上班摸鱼看到这', '又更了', '楼主今天勤快', '默默点个赞',
        '我就看看不说话', '这帖要火', '别太监啊', '收藏了',
    ]),
    ellipsis: Object.freeze(['断在这里？？', 'PO主你出来', '就这？下文呢', '别断啊', '卡在这里我睡不着', '又断？', 'PO主是不是故意的', '吊胃口第一名', '剩下的呢', '急急急']),
    mood: Object.freeze(['这谁顶得住', '修罗场预定', '我先嗑为敬', '救命，好甜', '我开始紧张了', '气氛不对劲', '这都能忍？', '心疼一下', '磕到了', '我替PO主脸红', '太有画面感了', '我人麻了']),
    scene: Object.freeze(['时间跳得好快', '换场景了？', '中间发生了什么', '镜头一转', '这是第二天了？', '跳过了什么我没看到的吗', '地点换了', '时间线理一下']),
    long: Object.freeze(['好长，先码', '这楼层好厚', '一口气看完了', '这一楼够我看半天', '码字辛苦', '楼主手速可以', '信息量有点大', '看得我一愣一愣的']),
    image: Object.freeze(['有图有真相', '原图呢', 'PO主手别抖', '这角度……你在哪拍的', '糊了，重拍', '能放大吗', '存了', '图比字有说服力', '这光线绝了']),
    imageWitness: Object.freeze(['偷拍的吧', 'PO主危', '被发现你就完了', '你离得这么近？', '拍这么清楚不怕被认出来']),
    imageSelf: Object.freeze(['本人？', '晒图实锤', '楼主露脸了？', '自拍？', '这是能发的吗']),
});

// 匿名版颜文字：只挑中性的（围观、发呆、点头、疑惑），不带强烈喜怒。
// 内置回帖以颜文字为主：约六成整条只发颜文字，约两成半句末缀一个，其余只发句子。
export const FORUM_KAOMOJI = Object.freeze([
    '( ﾟ∀。)', '(´ﾟДﾟ`)', '( ´_ゝ`)', '(｀・ω・)', '( ・_・)', '( ˙-˙ )', '(・∀・)', '( ´ー`)',
    '(　ﾟдﾟ)', '(ﾟーﾟ)', '( ´・ω・)', '(・ω・)', '( ˘•ω•˘ )', '(ーー;)', '( ´∀｀)', '(・_・;)',
]);
export const FORUM_KAOMOJI_TAIL_RATE = 25;
export const FORUM_KAOMOJI_ONLY_RATE = 60;

// 带 >>No. 指回附图那一楼的回帖。
export const FORUM_IMAGE_REF_LINES = Object.freeze(['原图呢', '求原图']);

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

function fixedText(settings) {
    const raw = String(settings.posterFixed || '').trim();
    if (/^(user|\{\{\s*user\s*\}\})$/i.test(raw)) return '{{user}}';
    const witness = raw.match(/^路人\s*[:：]?\s*(.*)$/);
    if (witness) return `围观路人${witness[1].trim() ? `（${witness[1].trim()}）` : ''}`;
    return raw;
}

function posterLine(settings) {
    const poster = settings.poster;
    if (poster === 'fixed') return `楼主是${fixedText(settings)}，不要改`;
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

const REPLY_NOTE = '再在末尾另起几行写回帖，每行一条 [igs-reply:发言人|>回第几条|#正文片段|内容]：发言人写「楼主」或一个路人代称（同一代称视为同一个网友），「>回第几条」按回帖出现顺序编号、可省，「#正文片段」可省，回应正文里的某句时写那句原话（2–12 字），内容是匿名网友口吻的一句话（不超过 40 字，吐槽、追问或接话）。让路人追问、楼主简短回应、路人之间互相接话（路人可以提一句隔壁帖子，如「隔壁帖的楼主是不是就是你说的 A」，一条以内，不强求），写 2–5 条，例：[igs-reply:路人甲|真的假的] [igs-reply:楼主|>1|真的，我亲眼看见的] [igs-reply:路人乙|>2|前排吃瓜] [igs-reply:路人丙|#原话片段|这句我笑了]';
const replyLine = (settings) => (settings.replies === 'off' ? '' : REPLY_NOTE);

// 安科（安价）：开启后给 AI 的写法与常驻规则。mode 为 key（关键节点）或 every（每层），off 返回空串。
export function forumAnkePromptText(mode, rule = '') {
    if (mode !== 'key' && mode !== 'every') return '';
    if (rule) return rule;
    const when = mode === 'every' ? '每一层' : '只在剧情走到关键节点、值得让网友替楼主拿主意的那一层（由你判断，不必每层都写）';
    return `【安价】${when}，在楼主回复 {{user}} 之后、整段正文的最末尾另起一行写 [igs-anke:问题|选项1|选项2|选项3]：问题是楼主向网友提的一句话；选项 3–5 个，每个都是楼主本人此刻能立刻做出的具体行动；方向必须真正分叉，不能是同一件事的不同程度；必须有一个离谱选项（出格、作死或荒唐，但在这个世界里做得到），不要标明是哪一个；不写「其他」。{{user}} 的消息里出现【安价】的，本楼必须照此推进，不许绕开或改写结果。`;
}

const PREV_SHOWN = 8;

// 上一轮的回帖列给 AI，本轮可以用 >上N 回其中一条；同一代称就是同一个网友，可以回来接着说。
export function forumPrevPromptText(settings, prev) {
    if (settings.replies === 'off' || !Array.isArray(prev) || !prev.length) return '';
    const list = prev.slice(0, PREV_SHOWN).map((r, i) => `${i + 1}.${r.who.startsWith('#') ? '路人' : r.who}：${r.text}`).join(' ');
    return `上一轮回帖：${list}。本轮回帖可以接着上一轮聊：写 [igs-reply:发言人|>上第几条|内容] 回上一轮那条（如 [igs-reply:路人丙|>上2|你吃瓜就吃瓜别带节奏]），用同一个代称表示同一个网友回来了；不必每条都接，1–2 条即可。`;
}

// 登记齐了：只留事实与改写入口，不再重复整段格式。
export function forumShortPromptText(settings, data) {
    return `【论坛体】正文以匿名论坛帖展示。已登记：${forumFactsText(data)}。仅需改动时在正文末尾写一行 ${settings.poster === 'fixed' ? TAG_FORMAT_SHORT_LOCKED : TAG_FORMAT_SHORT}，不写则沿用。${settings.poster === 'auto' ? `${AUTO_NOTE}；${SWITCH_NOTE}。` : `${posterLine(settings)}。`}${replyLine(settings) ? `每段正文${replyLine(settings)}。` : ''}`;
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
    const locked = settings.poster === 'fixed';
    const facts = forumFactsText(data);
    return [
        '【论坛体】本段正文会以匿名论坛帖的形式展示。仅在以下信息尚未确定或剧情需要改变时，在正文末尾写一行（不写则沿用已有）：',
        locked ? TAG_FORMAT_LOCKED : TAG_FORMAT,
        `${posterLine(settings)}；标题用楼主口吻；${CODE_NOTE}。${facts ? `已登记：${facts}。` : ''}`,
        replyLine(settings) ? `每段正文${replyLine(settings)}。` : '',
    ].filter(Boolean).join('\n');
}
