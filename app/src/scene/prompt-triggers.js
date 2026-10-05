import { DAILY_FX_KINDS } from './daily-fx-directives.js';

// 按需展开的提示词块：最近几层出现过对应标签、用户输入或最近 AI 正文命中触发词、或对应成对标签未闭合时才发完整写法。
export const DEFAULT_TRIGGER_LOOKBACK = 3;
// 成对标签可能跨很多层才闭合（一场战斗、一段书信），未闭合判断看更长的窗口。
export const PAIR_TRIGGER_LOOKBACK = 12;
// AI 上一层自然写出了事件却漏了标签时，靠最近这几层正文补展开；窗口短，避免旧剧情反复撑大提示词。
export const AI_WORDS_LOOKBACK = 1;

// 每种日常演出各自的中文触发词，新加类型必须在这里补词（测试会逐个检查）。
export const DAILY_TRIGGER_WORDS = Object.freeze({
    timeskip: ['第二天', '翌日', '次日', '几个小时后', '三天后', '一周后'],
    photo: ['拍照', '照片', '合影', '自拍'],
    letter: ['情书', '信封'],
    note: ['便签', '字条', '纸条', '留言条'],
    bell: ['上课铃', '下课', '放学'],
    broadcast: ['广播'],
    fireworks: ['烟花', '花火'],
    touch: ['牵手', '十指相扣'],
    alarm: ['闹钟'],
    omikuji: ['神社', '抽签', '求签'],
    receipt: ['结账', '买单', '小票'],
    tv: ['电视', '新闻'],
    rps: ['猜拳', '石头剪刀布'],
    gacha: ['扭蛋', '抽卡', '夹娃娃', '娃娃机'],
    game: ['打游戏', '玩游戏', '游戏机', '手柄'],
    score: ['成绩单', '考试成绩', '发成绩', '出成绩'],
    pat: ['摸头', '摸摸头', '揉头发'],
    poke: ['捏脸', '戳脸'],
    fever: ['测体温', '量体温', '体温计', '发烧'],
    cheers: ['碰杯', '干杯'],
    cook: ['做饭', '下厨', '煮饭', '做菜'],
    cat: ['撸猫', '摸猫', '猫咪', '小猫'],
    guqin: ['抚琴', '古琴', '弹琴'],
    go: ['对弈', '下棋', '围棋'],
    poem: ['题诗', '作诗', '吟诗'],
    edict: ['圣旨', '告示', '诏书', '榜文'],
    tea: ['敬茶', '奉茶', '沏茶', '品茶'],
    bow: ['行礼', '作揖', '拱手', '叩拜'],
    spell: ['施咒', '咒语', '念咒', '施法'],
    potion: ['魔药', '坩埚'],
    owl: ['猫头鹰'],
    broom: ['扫帚'],
    howler: ['吼叫信'],
    blackout: ['停电', '断电'],
    knock: ['敲门', '敲窗', '叩门'],
    murmur: ['低语', '耳语', '耳边'],
});

const BLOCK_TRIGGERS = Object.freeze({
    chat: {
        tag: /\[igs-(?:chat|msg)[:\]]/,
        words: /手机|消息|微信|短信|私信|群聊|聊天记录|发信息|回信息|QQ|LINE|书信|写信|回信|家书|来信/i,
        open: /\[igs-chat:/g,
        close: /\[igs-chat-end\]/g,
    },
    daily: {
        tag: new RegExp(`\\[igs-fx:(?:${DAILY_FX_KINDS.join('|')})[|\\]]`),
        words: new RegExp(Object.values(DAILY_TRIGGER_WORDS).flat().join('|')),
    },
    battle: {
        tag: /\[igs-fx:(?:battle|battle-end|hit)[|\]]/,
        words: /攻击|战斗|检定|交战|开战|迎战|出招|对决|拔剑|拔刀|敌人|怪物|魔物|反击|决斗/,
        open: /\[igs-fx:battle[|\]]/g,
        close: /\[igs-fx:battle-end[|\]]/g,
    },
    romance: {
        // 最近几层出现 NSFW 场景标签也展开：感官调度的写法要在情事段里用得上。
        tag: /\[igs-fx:(?:romance|romance-end|confess|memory|sense|sense-end|solo|solo-end|noise)[|\]]|\[igs-scene:[^\]\n]*\|\s*nsfw\s*\]/i,
        words: /告白|表白|约会|亲吻|接吻|拥抱|心动|暧昧|喜欢你|爱你/,
        open: /\[igs-fx:romance[|\]]/g,
        close: /\[igs-fx:romance-end\]/g,
    },
    live: {
        tag: /\[igs-fx:(?:live|live-end|dm)[|\]]/,
        words: /直播|开播|下播|主播|直播间|弹幕|连麦/,
        open: /\[igs-fx:live[|\]]/g,
        close: /\[igs-fx:live-end\]/g,
    },
    camera: {
        tag: /\[igs-fx:cam[|\]]/,
        words: /镜头|特写|拉远|推近|虚化|摇镜|运镜/,
    },
});

// 与 tag-grammar 里 adaptive:true 的块一一对应，测试校验两边一致。
export const ADAPTIVE_PROMPT_BLOCKS = Object.freeze(Object.keys(BLOCK_TRIGGERS));

function lastIndexOf(text, pattern) {
    let last = -1;
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) last = match.index;
    return last;
}

// recentAiTexts 按时间顺序（旧 → 新）；标签出现只看最近 lookback 层，未闭合的成对标签看最近 PAIR_TRIGGER_LOOKBACK 层。
export function detectPromptTriggers({ recentAiTexts = [], userText = '', lookback = DEFAULT_TRIGGER_LOOKBACK } = {}) {
    const all = (Array.isArray(recentAiTexts) ? recentAiTexts : []).map((t) => String(t || '')).slice(-PAIR_TRIGGER_LOOKBACK);
    const texts = lookback > 0 ? all.slice(-lookback) : [];
    const joined = all.join('\n');
    const user = String(userText || '');
    const aiWords = all.slice(-AI_WORDS_LOOKBACK);
    const hits = new Set();
    for (const [block, rule] of Object.entries(BLOCK_TRIGGERS)) {
        if (texts.some((t) => rule.tag.test(t)) || rule.words.test(user) || aiWords.some((t) => rule.words.test(t))) {
            hits.add(block);
            continue;
        }
        if (rule.open && lastIndexOf(joined, rule.open) > lastIndexOf(joined, rule.close)) hits.add(block);
    }
    return hits;
}

// 粗估 token：中日韩字符约 1 token/字，其余约 3.5 字符/token。
export function estimatePromptTokens(text) {
    let cjk = 0;
    let other = 0;
    for (const ch of String(text || '')) {
        if (/[　-鿿豈-﫿＀-￯]/.test(ch)) cjk += 1;
        else other += 1;
    }
    return cjk + Math.ceil(other / 3.5);
}
