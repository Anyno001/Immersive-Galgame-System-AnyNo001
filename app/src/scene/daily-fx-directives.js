// 日常演出标签 [igs-fx:timeskip|三小时后] 等：同属 igs-fx 标签族，但独立于 FX_TAG_KINDS，
// 由日常演出开关（readerSettings.dailyFx）控制；字段写错时按最宽松的合法形式处理，缺必填字段则整条忽略。
export const DAILY_FX_KINDS = Object.freeze([
    'timeskip', 'photo', 'letter', 'note', 'bell', 'broadcast', 'fireworks', 'touch', 'alarm', 'omikuji', 'receipt', 'tv', 'rps', 'gacha', 'game', 'score',
    'pat', 'poke', 'fever', 'cheers', 'cook', 'cat', 'eat',
    'guqin', 'go', 'poem', 'edict', 'tea', 'bow',
    'spell', 'potion', 'owl', 'broom', 'howler',
    'blackout', 'knock', 'murmur',
    'brake', 'depart', 'arrive', 'ticket',
    'steam', 'shower', 'splash', 'hairdry',
    'dive', 'bubble', 'vacuum',
]);
export const DAILY_OMIKUJI_RESULTS = Object.freeze(['大吉', '中吉', '小吉', '吉', '末吉', '凶', '大凶']);
// 同页日常演出上限：都是全屏或大卡片，连发只会互相遮挡。
export const DAILY_FX_PAGE_MAX = 2;
// 结果类日常演出：猜拳手势、游戏胜负词表；结果由标签字段决定，前端不掷骰、不编造。
export const DAILY_RPS_HANDS = Object.freeze({ 石头: 'rock', 拳头: 'rock', rock: 'rock', 剪刀: 'scissors', scissors: 'scissors', 布: 'paper', paper: 'paper' });
export const DAILY_GAME_RESULTS = Object.freeze({ win: 'win', 胜: 'win', 胜利: 'win', 赢: 'win', lose: 'lose', 败: 'lose', 输: 'lose', 失败: 'lose', draw: 'draw', 平: 'draw', 平局: 'draw' });
const RPS_BEATS = Object.freeze({ rock: 'scissors', scissors: 'paper', paper: 'rock' });

function lookup(map, key) {
    const k = String(key || '').toLowerCase();
    return Object.hasOwn(map, k) ? map[k] : '';
}

// 我方 / 对方手势 → win | lose | draw。
export function rpsOutcome(mine, theirs) {
    if (!RPS_BEATS[mine] || !RPS_BEATS[theirs]) return '';
    if (mine === theirs) return 'draw';
    return RPS_BEATS[mine] === theirs ? 'win' : 'lose';
}

const RECEIPT_ITEM_MAX = 6;

function text(value) {
    return String(value == null ? '' : value).trim();
}

// 返回 fx-directives 统一的 { kind:'daily', end:false, args:[type, ...] }；args 第二位起按类型固定顺序。
export function parseDailyFxBody(type, fields) {
    const [a = '', b = '', c = ''] = (fields || []).map(text);
    switch (type) {
    case 'timeskip': return a ? ['timeskip', a] : null;
    case 'photo': return ['photo', a];
    case 'letter':
        if (!a) return null;
        return b ? ['letter', a, b] : ['letter', '', a];
    case 'note': return a ? ['note', a] : null;
    case 'bell': return ['bell'];
    case 'broadcast': return a ? ['broadcast', a] : null;
    case 'fireworks': return ['fireworks'];
    case 'touch': return ['touch', a];
    case 'alarm': return ['alarm', a];
    case 'omikuji': return ['omikuji', DAILY_OMIKUJI_RESULTS.includes(a) ? a : '吉', b];
    case 'receipt': {
        if (!a) return null;
        return ['receipt', a, b, c];
    }
    case 'tv':
        if (!a) return null;
        return b ? ['tv', a, b] : ['tv', '', a];
    case 'rps': {
        const mine = lookup(DAILY_RPS_HANDS, a);
        const theirs = lookup(DAILY_RPS_HANDS, b);
        return mine && theirs ? ['rps', mine, theirs] : null;
    }
    case 'gacha': return a ? ['gacha', a] : null;
    case 'game': {
        const result = lookup(DAILY_GAME_RESULTS, a);
        return result ? ['game', result] : null;
    }
    case 'score': return a && b ? ['score', a, b] : null;
    case 'pat': return ['pat', a];
    case 'poke': return ['poke', a];
    // 体温只显示标签给出的读数，读数里必须有数字。
    case 'fever': return /\d/.test(a) ? ['fever', a] : null;
    case 'cheers': return ['cheers'];
    case 'cook': return a ? ['cook', a] : null;
    case 'cat': return ['cat'];
    // 进食：食物名必填，反应可省（好吃、辣、喂……由前端换算）。
    case 'eat': return a ? ['eat', a, b] : null;
    // 古风独有：对弈结果可省，写错按省略；题诗、告示内容必填。
    case 'guqin': return ['guqin'];
    case 'go': return ['go', lookup(DAILY_GAME_RESULTS, a)];
    case 'poem': return a ? ['poem', a] : null;
    case 'edict': return a ? ['edict', a] : null;
    case 'tea': return ['tea'];
    case 'bow': return ['bow', a];
    // 魔法世界独有：咒语、魔药名、寄件人均可省。
    case 'spell': return ['spell', a];
    case 'potion': return ['potion', a];
    case 'owl': return ['owl', a];
    case 'broom': return ['broom'];
    // 吼叫信同信件：只写一栏时视为内容。
    case 'howler':
        if (!a) return null;
        return b ? ['howler', a, b] : ['howler', '', a];
    // 恐怖世界独有：停电的旁白可省；敲门次数取 1–6，写错按 3 下；低语内容必填。
    case 'blackout': return ['blackout', a];
    case 'knock': {
        const count = Number.parseInt(a, 10);
        return ['knock', String(count >= 1 && count <= 6 ? count : 3)];
    }
    case 'murmur': return a ? ['murmur', a] : null;
    // 载具：目的地、站名均可省；车票只写一栏时视为终点。
    case 'brake': return ['brake'];
    case 'depart': return ['depart', a];
    case 'arrive': return ['arrive', a];
    case 'ticket':
        if (!a) return null;
        return b ? ['ticket', a, b, c] : ['ticket', '', a, ''];
    // 洗浴：都不带字段，吹头发的角色名留给多人同屏定位。
    case 'steam': return ['steam'];
    case 'shower': return ['shower'];
    case 'splash': return ['splash'];
    case 'hairdry': return ['hairdry', a];
    // 水下与真空：不分世界观，都不带字段。
    case 'dive': return ['dive'];
    case 'bubble': return ['bubble'];
    case 'vacuum': return ['vacuum'];
    default: return null;
    }
}

// 小票「物品」栏可用顿号、逗号分隔多件，每件可写「名称×数量」或「名称 价格」。
function receiptItems(value) {
    return text(value).split(/[、,，;；]/u).map(text).filter(Boolean).slice(0, RECEIPT_ITEM_MAX);
}

export function dailyFxOf(args) {
    const [type, a = '', b = '', c = ''] = args || [];
    switch (type) {
    case 'timeskip': return { type, text: a };
    case 'photo': return { type, caption: a };
    case 'letter': return { type, from: a, text: b };
    case 'note': return { type, text: a };
    case 'bell': return { type };
    case 'broadcast': return { type, text: a };
    case 'fireworks': return { type };
    case 'touch': return { type, what: a };
    case 'alarm': return { type, time: a };
    case 'omikuji': return { type, result: a, text: b };
    case 'receipt': return { type, items: receiptItems(a), total: b, shop: c };
    case 'tv': return { type, channel: a, text: b };
    case 'rps': return { type, mine: a, theirs: b, outcome: rpsOutcome(a, b) };
    case 'gacha': return { type, item: a };
    case 'game': return { type, result: a };
    case 'cheers': return { type };
    case 'cook': return { type, dish: a };
    case 'cat': return { type };
    case 'eat': return { type, food: a, reaction: b };
    case 'guqin': return { type };
    case 'go': return { type, result: a };
    case 'poem': return { type, text: a };
    case 'edict': return { type, text: a };
    case 'tea': return { type };
    case 'bow': return { type, who: a };
    case 'spell': return { type, words: a };
    case 'potion': return { type, name: a };
    case 'owl': return { type, from: a };
    case 'broom': return { type };
    case 'howler': return { type, from: a, text: b };
    case 'blackout': return { type, text: a };
    case 'knock': return { type, count: Number(a) || 3 };
    case 'murmur': return { type, text: a };
    case 'brake': return { type };
    case 'depart': return { type, to: a };
    case 'arrive': return { type, station: a };
    case 'ticket': return { type, from: a, to: b, note: c };
    case 'steam': return { type };
    case 'shower': return { type };
    case 'splash': return { type };
    case 'hairdry': return { type, who: a };
    case 'dive': return { type };
    case 'bubble': return { type };
    case 'vacuum': return { type };
    case 'pat': return { type, who: a };
    case 'poke': return { type, who: a };
    case 'fever': {
        const digits = String(a).match(/\d+(?:\.\d+)?/);
        return { type, temp: a, high: Boolean(digits) && Number(digits[0]) >= 37.5 };
    }
    case 'score': {
        // 只有分数栏里确实有数字时才判定及格线；「优」「A」等等级制不盖章。
        const digits = String(b).match(/\d+(?:\.\d+)?/);
        return { type, subject: a, score: b, fail: Boolean(digits) && Number(digits[0]) < 60 };
    }
    default: return null;
    }
}
