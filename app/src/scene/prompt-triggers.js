import { DAILY_FX_KINDS } from './daily-fx-directives.js';
import { compileKeywordMatcher, joinPromptKeywords, normalizePromptEntries, parsePromptKeywords } from './prompt-entries.js';

// 按需展开的提示词块：最近几层出现过对应标签、用户输入或最近 AI 正文命中触发词、或对应成对标签未闭合时才发完整写法。
export const DEFAULT_TRIGGER_LOOKBACK = 3;
// 成对标签可能跨很多层才闭合（一场战斗、一段书信），未闭合判断看更长的窗口。
export const PAIR_TRIGGER_LOOKBACK = 12;
// AI 上一层自然写出了事件却漏了标签时，靠最近这几层正文补展开（默认扫描范围，可按块改）；窗口短，避免旧剧情反复撑大提示词。
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
    eat: ['吃', '喝', '尝', '喂', '咬了一口', '吃饭', '零食', '甜点', '便当'],
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
    brake: ['急刹车', '急刹', '踩刹车', '猛地停住'],
    depart: ['发车', '起步', '启程', '开动了'],
    arrive: ['到站', '靠岸', '下一站', '终点站'],
    ticket: ['车票', '船票', '机票', '登机牌'],
    steam: ['水汽', '蒸汽', '雾气氤氲'],
    shower: ['淋浴', '花洒', '冲澡'],
    splash: ['泼水', '打水仗', '水花'],
    hairdry: ['吹头发', '吹风机'],
    dive: ['潜入水', '跳进水', '潜水', '入水'],
    bubble: ['气泡', '吐泡泡'],
    vacuum: ['真空', '气闸', '泄压'],
    say: ['嘀咕', '小声', '吐槽', '心想', '暗想', '咕哝'],
});

// 每块：tag 最近几层出现即展开；words 为默认关键词（设置页可改）；open/close 为成对标签，未闭合时保持展开。
const BLOCK_TRIGGERS = Object.freeze({
    chat: {
        tag: /\[igs-(?:chat|msg)[:\]]/,
        words: ['手机', '消息', '微信', '短信', '私信', '群聊', '聊天记录', '发信息', '回信息', 'QQ', 'LINE', '书信', '写信', '回信', '家书', '来信'],
        open: /\[igs-chat:/g,
        close: /\[igs-chat-end\]/g,
    },
    daily: {
        tag: new RegExp(`\\[igs-fx:(?:${DAILY_FX_KINDS.join('|')})[|\\]]`),
        words: [...new Set(Object.values(DAILY_TRIGGER_WORDS).flat())],
    },
    battle: {
        tag: /\[igs-fx:(?:battle|battle-end|hit)[|\]]/,
        words: ['攻击', '战斗', '检定', '交战', '开战', '迎战', '出招', '对决', '拔剑', '拔刀', '敌人', '怪物', '魔物', '反击', '决斗'],
        open: /\[igs-fx:battle[|\]]/g,
        close: /\[igs-fx:battle-end[|\]]/g,
    },
    romance: {
        // 最近几层出现 NSFW 场景标签也展开：感官调度的写法要在情事段里用得上。
        tag: /\[igs-fx:(?:romance|romance-end|confess|memory|sense|sense-end|solo|solo-end|noise)[|\]]|\[igs-scene:[^\]\n]*\|\s*nsfw\s*\]/i,
        words: ['告白', '表白', '约会', '亲吻', '接吻', '拥抱', '心动', '暧昧', '喜欢你', '爱你'],
        open: /\[igs-fx:romance[|\]]/g,
        close: /\[igs-fx:romance-end\]/g,
    },
    live: {
        tag: /\[igs-fx:(?:live|live-end|dm)[|\]]/,
        words: ['直播', '开播', '下播', '主播', '直播间', '弹幕', '连麦'],
        open: /\[igs-fx:live[|\]]/g,
        close: /\[igs-fx:live-end\]/g,
    },
    feed: {
        tag: /\[igs-fx:(?:app|app-end|post|reply|storm|storm-end|mention)[|\]]/,
        words: ['微博', '朋友圈', '表白墙', '小红书', '贴吧', '豆瓣', '虎扑', '书评', '热搜', '刷手机', '帖子', '评论区', '动态', '告示', '榜文', '茶馆', '公会', '布告', '酒馆', '日报', '匿名信', '广播', '留言墙', '号外', '读者来信', '星网', '淘宝', '网购', '偷看', '/翻.{0,2}手机/', '/查.{0,2}手机/', '搜索记录', '备忘录', '草稿箱', '聊天列表', '网暴', '爆红', '挂了', '被骂', '塌房', '出圈', '社交媒体', '社交软件', '社交平台', '社媒', '网上', '上网', '论坛', '网友', '发帖', '发动态', '刷到', '点赞', '转发', '推特', '抖音', '知乎', '头条', '刷视频', '冲浪', '相册', '校园墙', '浏览记录'],
        open: /\[igs-fx:(?:app|storm)[|\]]/g,
        close: /\[igs-fx:(?:app|storm)-end\]/g,
    },
    camera: {
        tag: /\[igs-fx:cam[|\]]/,
        words: ['镜头', '特写', '拉远', '推近', '虚化', '摇镜', '运镜'],
    },
});

// 与 tag-grammar 里 adaptive:true 的块一一对应，测试校验两边一致。
export const ADAPTIVE_PROMPT_BLOCKS = Object.freeze(Object.keys(BLOCK_TRIGGERS));

// 设置页显示的默认关键词。
export function defaultPromptKeywords(block) {
    const rule = BLOCK_TRIGGERS[block];
    return rule ? joinPromptKeywords(rule.words) : '';
}

// 黏性与冷却从聊天记录往回推算，最多回看这么多轮，不另存状态（删楼、重 roll 后自然跟着变）。
export const TRIGGER_HISTORY_TURNS = 30;

function lastIndexOf(text, pattern) {
    let last = -1;
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) last = match.index;
    return last;
}

function compileEntry(block, entry) {
    const rule = BLOCK_TRIGGERS[block];
    const words = entry.keys ? parsePromptKeywords(entry.keys) : rule.words;
    const secondary = parsePromptKeywords(entry.secondary);
    const exclude = parsePromptKeywords(entry.exclude);
    return {
        rule,
        entry,
        primary: compileKeywordMatcher(words),
        secondary: secondary.length ? compileKeywordMatcher(secondary) : null,
        exclude: exclude.length ? compileKeywordMatcher(exclude) : null,
    };
}

// 一轮里这块是否被关键词或标签点亮：先看关键词（逐段判断次要词与排除词），再看最近几层的标签。
function rawTrigger(compiled, turn, lookback) {
    const { rule, entry } = compiled;
    const sources = [{ source: '你的输入', text: turn.user }];
    if (entry.scan > 0) turn.ai.slice(-entry.scan).reverse().forEach((text, i) => sources.push({ source: `AI上${i + 1}楼`, text }));
    for (const { source, text } of sources) {
        const word = compiled.primary(text);
        if (!word) continue;
        if (compiled.exclude && compiled.exclude(text)) continue;
        if (compiled.secondary) {
            const second = compiled.secondary(text);
            if (!second) continue;
            return { reason: 'word', word: `${word}+${second}`, source };
        }
        return { reason: 'word', word, source };
    }
    const texts = lookback > 0 ? turn.ai.slice(-lookback) : [];
    if (texts.some((t) => rule.tag.test(t))) return { reason: 'tag' };
    return null;
}

function pairOpen(rule, turn) {
    if (!rule.open) return false;
    const joined = turn.ai.join('\n');
    return lastIndexOf(joined, rule.open) > lastIndexOf(joined, rule.close);
}

// history 为可见消息（旧 → 新，{ user, text }），用来还原前几轮当时的输入与上文。
function buildTurns({ recentAiTexts, userText, history, pastTurns }) {
    const current = { ai: recentAiTexts, user: userText };
    if (!pastTurns || !Array.isArray(history) || !history.length) return [current];
    const turns = [];
    const ai = [];
    let user = '';
    for (const message of history) {
        const text = String(message && message.text || '');
        if (message && message.user) {
            user = text;
            continue;
        }
        turns.push({ ai: ai.slice(-PAIR_TRIGGER_LOOKBACK), user });
        ai.push(text);
        user = '';
    }
    return [...turns.slice(-pastTurns), current];
}

// 逐轮推算展开状态：新命中刷新黏性；成对标签未闭合时始终展开（不受冷却影响）；收起后冷却 N 楼内关键词与标签都不点亮。
function simulate(compiled, turns, lookback) {
    const { sticky, cooldown } = compiled.entry;
    let stickyUntil = -1;
    let coolUntil = -1;
    let prev = false;
    let result = { active: false };
    turns.forEach((turn, i) => {
        const raw = rawTrigger(compiled, turn, lookback);
        if (raw && i > coolUntil) {
            stickyUntil = i + sticky;
            result = { active: true, ...raw };
        } else if (pairOpen(compiled.rule, turn)) {
            result = { active: true, reason: 'pair' };
        } else if (i <= stickyUntil) {
            result = { active: true, reason: 'sticky', left: stickyUntil - i };
        } else {
            result = raw ? { active: false, reason: 'cooldown', left: coolUntil - i + 1 } : { active: false };
        }
        if (prev && !result.active && cooldown > 0) coolUntil = i + cooldown;
        prev = result.active;
    });
    return result;
}

// recentAiTexts 按时间顺序（旧 → 新）；标签出现只看最近 lookback 层，未闭合的成对标签看最近 PAIR_TRIGGER_LOOKBACK 层。
// entries 为设置里的条目（缺省即默认行为）；返回本轮该展开的块与每块的原因。
export function resolvePromptTriggers({ recentAiTexts = [], userText = '', history = null, lookback = DEFAULT_TRIGGER_LOOKBACK, entries = null } = {}) {
    const ai = (Array.isArray(recentAiTexts) ? recentAiTexts : []).map((t) => String(t || '')).slice(-PAIR_TRIGGER_LOOKBACK);
    const normalized = normalizePromptEntries(entries);
    const hits = new Set();
    const report = {};
    for (const block of Object.keys(BLOCK_TRIGGERS)) {
        const entry = normalized[block];
        if (entry.mode !== 'auto') {
            report[block] = { active: entry.mode === 'always', reason: entry.mode };
            continue;
        }
        const pastTurns = entry.sticky || entry.cooldown ? Math.min(TRIGGER_HISTORY_TURNS, 2 * (entry.sticky + entry.cooldown + 1)) : 0;
        const turns = buildTurns({ recentAiTexts: ai, userText: String(userText || ''), history, pastTurns });
        const result = simulate(compileEntry(block, entry), turns, lookback);
        report[block] = result;
        if (result.active) hits.add(block);
    }
    return { hits, report };
}

export function detectPromptTriggers(options = {}) {
    return resolvePromptTriggers(options).hits;
}

// 最近一次注入的按需块情况，供本页诊断与设置页显示。
let lastPromptReport = null;
export function setLastPromptReport(report) {
    lastPromptReport = report || null;
}
export function getLastPromptReport() {
    return lastPromptReport;
}

const REASON_TEXT = { word: '命中', tag: '上楼有标签', pair: '成对标签未闭合', sticky: '黏性保持', cooldown: '冷却中', always: '常驻', off: '已关闭' };

// 一块的原因写成一句话，如「命中「热搜」（AI上1楼）」「黏性保持（还剩 2 楼）」。
export function describePromptTrigger(item) {
    if (!item) return '未开启';
    if (!item.reason) return '未触发';
    if (item.reason === 'word') return `命中「${item.word}」（${item.source}）`;
    if (item.reason === 'sticky') return `${REASON_TEXT.sticky}（还剩 ${item.left} 楼）`;
    if (item.reason === 'cooldown') return `${REASON_TEXT.cooldown}（还剩 ${item.left} 楼）`;
    return REASON_TEXT[item.reason] || item.reason;
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
