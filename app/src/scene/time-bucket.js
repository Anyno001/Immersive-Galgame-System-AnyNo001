// 场景时段四档：清晨 / 白天 / 黄昏 / 夜晚。深夜、午夜并入夜晚，一个场景最多补四张时段图。
// 中文名按子串命中，先具体后泛化；key 供场景差分挑英文光照标签用。
// 兜底：十二时辰、更次、口语时段都并进这四档；写成钟点（14:30、下午两点、2:30pm）的按小时归档。

export const TIME_WORDS = [
    ['midnight', '夜晚', ['深夜', '午夜', '凌晨', '半夜', '夜半', '深更', '三更', '四更', '五更', '二更', '子时', '丑时', '寅时', 'midnight', 'late night']],
    ['dusk', '黄昏', ['黄昏', '傍晚', '日落', '落日', '日暮', '薄暮', '暮色', '向晚', '晚霞', '酉时', '夕', 'dusk', 'twilight', 'evening', 'sunset']],
    ['morning', '清晨', ['清晨', '黎明', '拂晓', '破晓', '天亮', '早晨', '早上', '清早', '大早', '一早', '早间', '日出', '卯时', '辰时', '晨', 'dawn', 'daybreak', 'morning', 'sunrise']],
    ['night', '夜晚', ['入夜', '戌时', '亥时', '夜', '晚', 'night']],
    ['day', '白天', ['白天', '白日', '日间', '上午', '中午', '正午', '晌午', '下午', '午后', '巳时', '午时', '未时', '申时', '午', 'day', 'noon', 'midday', 'forenoon', 'afternoon']],
];

const BUCKET_KEY = { midnight: 'midnight', night: 'night', dusk: 'dusk', morning: 'morning', day: 'day' };

// 小时 -> 档：5–8 清晨，9–16 白天，17–18 黄昏，19–22 夜晚，23–4 深夜（也归夜晚）。
function keyOfHour(hour) {
    if (hour >= 23 || hour < 5) return 'midnight';
    if (hour < 9) return 'morning';
    if (hour < 17) return 'day';
    if (hour < 19) return 'dusk';
    return 'night';
}

const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const POINT_RE = /(\d{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*点(钟|半|整|\s*\d{1,2}\s*分|[零〇一二两三四五六七八九十]{1,3}分)?/;
const POINT_ONLY_RE = /^(\d{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*点$/;

function cnNumber(text) {
    if (/^\d+$/.test(text)) return Number(text);
    const ten = text.indexOf('十');
    if (ten < 0) return text.length === 1 ? CN_DIGIT[text] : NaN;
    const head = ten === 0 ? 1 : CN_DIGIT[text.slice(0, ten)];
    const tail = ten === text.length - 1 ? 0 : CN_DIGIT[text.slice(ten + 1)];
    return head === undefined || tail === undefined ? NaN : head * 10 + tail;
}

// 时段修饰词 -> 12 小时制转 24 小时制。顺序：更具体的在前。
const MERIDIEM = [
    { words: ['凌晨', '三更', '四更', '五更'], to: (h) => (h === 12 ? 0 : h) },
    { words: ['深夜', '半夜', '午夜', '夜里', '夜间', '夜半'], to: (h) => (h === 12 ? 0 : h >= 6 && h < 12 ? h + 12 : h) },
    { words: ['傍晚', '黄昏', '晚上', '晚间', '今晚', '夜晚', '晚'], to: (h) => (h === 12 ? 0 : h < 12 ? h + 12 : h) },
    { words: ['下午', '午后'], to: (h) => (h < 12 ? h + 12 : h) },
    { words: ['中午', '正午', '晌午'], to: (h) => (h <= 4 ? h + 12 : h) },
    { words: ['清晨', '早晨', '早上', '清早', '上午', '早间', '一早', '大早', '拂晓', '黎明'], to: (h) => h },
];

function applyMeridiem(text, hour) {
    const rule = MERIDIEM.find(({ words }) => words.some((word) => text.includes(word)));
    if (rule) return rule.to(hour);
    return null;
}

// 从标签里读出小时（0–23），读不出返回 -1。
export function hourOfTimeLabel(label) {
    const text = String(label || '').trim().toLowerCase();
    if (!text) return -1;
    // 2:30pm / 7am / 7 a.m.
    let m = text.match(/(?:^|[^\d])(\d{1,2})(?:[:：]\d{2})?\s*([ap])\.?m\b\.?/);
    if (m) {
        const h = Number(m[1]);
        if (h < 1 || h > 12) return -1;
        return m[2] === 'p' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
    }
    // 14:30 / 14：30：24 小时制照写；前面带上下午等修饰词时按 12 小时制折算
    m = text.match(/(?:^|[^\d:：])(\d{1,2})[:：]([0-5]\d)(?![\d])/);
    if (m) {
        const h = Number(m[1]);
        if (h > 23) return -1;
        const shifted = h <= 12 ? applyMeridiem(text, h) : null;
        return shifted === null ? h : shifted;
    }
    // 14时 / 14时30分
    m = text.match(/(?:^|[^\d])(\d{1,2})\s*时(?![候间代刻常而光期分段])/);
    if (m && Number(m[1]) <= 23) {
        const h = Number(m[1]);
        const shifted = h <= 12 ? applyMeridiem(text, h) : null;
        return shifted === null ? h : shifted;
    }
    // 下午两点 / 十点整 / 三点半 / 8点
    m = text.match(POINT_RE);
    if (m) {
        const h = cnNumber(m[1]);
        if (!(h >= 0 && h <= 24)) return -1;
        const hour = h === 24 ? 0 : h;
        const shifted = hour <= 12 ? applyMeridiem(text, hour) : null;
        if (shifted !== null) return shifted;
        // 「有一点冷」「一点点」不是钟点：无修饰词时必须带 钟/半/整/分，或整段就是「N点」。
        if (!m[2] && !POINT_ONLY_RE.test(text)) return -1;
        // 无修饰词的 1–5 点按下午算（白天活动远多于凌晨），6–12 点原样，13 点以上按 24 小时制。
        return hour >= 1 && hour <= 5 ? hour + 12 : hour;
    }
    return -1;
}

// 返回 TIME_WORDS 的 key（midnight/dusk/morning/night/day）；认不出返回 ''。钟点优先于文字。
export function sceneTimeKey(label) {
    const text = String(label || '').trim().toLowerCase();
    if (!text) return '';
    const hour = hourOfTimeLabel(text);
    if (hour >= 0) return BUCKET_KEY[keyOfHour(hour)];
    const hit = TIME_WORDS.find(([, , words]) => words.some((word) => text.includes(word)));
    return hit ? hit[0] : '';
}

export function sceneTimeBucket(label) {
    const key = sceneTimeKey(label);
    const hit = key && TIME_WORDS.find(([k]) => k === key);
    return hit ? hit[1] : '';
}
