// 按需展开的提示词块：最近几层出现过对应标签、用户输入命中触发词、或对应成对标签未闭合时才发完整写法。
export const ADAPTIVE_PROMPT_BLOCKS = Object.freeze(['chat', 'daily', 'battle', 'romance', 'live']);
export const DEFAULT_TRIGGER_LOOKBACK = 3;
// 成对标签可能跨很多层才闭合（一场战斗、一段书信），未闭合判断看更长的窗口。
export const PAIR_TRIGGER_LOOKBACK = 12;

const DAILY_KINDS = 'timeskip|photo|letter|note|bell|broadcast|fireworks|touch|alarm|omikuji|receipt|tv|rps|gacha|game|score|pat|poke|fever|cheers|cook|cat|guqin|go|poem|edict|tea|bow|spell|potion|owl|broom|howler|blackout|knock|murmur';

const BLOCK_TRIGGERS = Object.freeze({
    chat: {
        tag: /\[igs-(?:chat|msg)[:\]]/,
        words: /手机|消息|微信|短信|私信|群聊|聊天记录|发信息|回信息|QQ|LINE|书信|写信|回信|家书|来信/i,
        open: /\[igs-chat:/g,
        close: /\[igs-chat-end\]/g,
    },
    daily: {
        tag: new RegExp(`\\[igs-fx:(?:${DAILY_KINDS})[|\\]]`),
        words: /拍照|照片|合影|情书|便签|字条|留言条|上课铃|下课|放学|广播|烟花|花火|闹钟|神社|抽签|求签|结账|买单|小票|电视|新闻|牵手|摸头|第二天|翌日|几个小时后|三天后/,
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
});

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
    const hits = new Set();
    for (const [block, rule] of Object.entries(BLOCK_TRIGGERS)) {
        if (texts.some((t) => rule.tag.test(t)) || rule.words.test(user)) {
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
