// 状态栏日期、时间捕捉（纯函数）：正则直接对楼层原文执行，日期按字符串变化判定过天，时间折算为整点。
// 不内置预设：正则留空即不捕捉；非法正则当作未填写，由调用方记诊断。
import { SKIP_DAYS_MAX } from './stat-duration.js';

export const DATE_REGEX_INVALID = 'stat-date-regex-invalid';
export const TIME_REGEX_INVALID = 'stat-time-regex-invalid';
const REGEX_MAX = 300;
const TAG = /<[^<>]*>/g;
const MONTH_DAYS = 30;

// 把设置里的正则文本编译为 RegExp；空文本返回 { regex: null }，非法返回 { regex: null, invalid: true }。
// 兼容 /pattern/flags 写法；不带写法时按普通正则、无标志处理。
export function compileCaptureRegex(source) {
    const text = String(source ?? '').trim().slice(0, REGEX_MAX);
    if (!text) return { regex: null, invalid: false };
    const literal = text.match(/^\/(.+)\/([a-z]*)$/s);
    try {
        const flags = literal ? literal[2].replace(/[gy]/g, '') : '';
        return { regex: new RegExp(literal ? literal[1] : text, flags), invalid: false };
    } catch (error) {
        return { regex: null, invalid: true };
    }
}

// 对原文取第一个匹配：有捕获组取第 1 组，否则取整段；去掉残留标签与首尾空白。取不到返回 ''。
export function captureFirst(text, regex) {
    if (!regex) return '';
    const match = String(text ?? '').match(regex);
    if (!match) return '';
    const raw = match[1] !== undefined ? match[1] : match[0];
    return String(raw ?? '').replace(TAG, '').trim();
}

const DIGIT = Object.freeze({ 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 });

function toAscii(text) {
    return String(text ?? '').replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

// 中文数字（一至九十九）转整数；识别不了返回 null。
function cnInt(raw) {
    const text = String(raw ?? '');
    if (!text) return null;
    if (/^\d+$/.test(text)) return Number(text);
    if (text === '十') return 10;
    const ten = text.match(/^([一二两三四五六七八九])?十([一二三四五六七八九])?$/);
    if (ten) return (ten[1] ? DIGIT[ten[1]] : 1) * 10 + (ten[2] ? DIGIT[ten[2]] : 0);
    if (text.length === 1 && Object.hasOwn(DIGIT, text)) return DIGIT[text];
    return null;
}

const LUNAR_MONTH_NAME = Object.freeze({ 正: 1, 冬: 11, 腊: 12, 臘: 12 });

function lunarMonth(raw) {
    if (Object.hasOwn(LUNAR_MONTH_NAME, raw)) return LUNAR_MONTH_NAME[raw];
    const n = cnInt(raw);
    return n >= 1 && n <= 12 ? n : null;
}

function lunarDay(raw) {
    const text = String(raw ?? '');
    const first = text.match(/^初([一二三四五六七八九十])$/);
    if (first) return cnInt(first[1]);
    if (text === '廿') return 20;
    if (text === '卅') return 30;
    const twenty = text.match(/^廿([一二三四五六七八九])$/);
    if (twenty) return 20 + DIGIT[twenty[1]];
    const thirty = text.match(/^卅([一二三四五六七八九])?$/);
    if (thirty) return 30 + (thirty[1] ? DIGIT[thirty[1]] : 0);
    const n = cnInt(text);
    return n >= 1 && n <= 30 ? n : null;
}

// 解析日期文本为 { kind: 'solar' | 'lunar', year, month, day }；解析不出返回 null。year 可为 null。
export function parseDate(raw) {
    const text = toAscii(String(raw ?? '').replace(/\s+/g, ''));
    if (!text) return null;
    const iso = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (iso) return solar(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    const cnSolar = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]?/);
    if (cnSolar) return solar(cnSolar[1] ? Number(cnSolar[1]) : null, Number(cnSolar[2]), Number(cnSolar[3]));
    const cnLunar = text.match(/(?:[^月]*年)?(正|冬|腊|臘|十[一二]?|[一二三四五六七八九])月(初[一二三四五六七八九十]|十[一二三四五六七八九]?|廿[一二三四五六七八九]?|卅[一二三四五六七八九]?|二十[一二三四五六七八九]?|[一二三四五六七八九])/);
    if (cnLunar) {
        const month = lunarMonth(cnLunar[1]);
        const day = lunarDay(cnLunar[2]);
        if (month && day) return { kind: 'lunar', year: null, month, day };
    }
    return null;
}

function solar(year, month, day) {
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
    return { kind: 'solar', year, month, day };
}

function solarOrdinal(date) {
    return Date.UTC(date.year, date.month - 1, date.day) / 86400000;
}

// 两个日期相差的天数（后者减前者）。公历有年份时按真实日历；无年份、农历按「月×30＋日」近似，负差视为跨年，按一天计。
// 种类不同或无法比较返回 null。
export function dayDifference(prev, next) {
    if (!prev || !next || prev.kind !== next.kind) return null;
    if (prev.kind === 'solar' && prev.year !== null && next.year !== null) return solarOrdinal(next) - solarOrdinal(prev);
    if (prev.kind === 'solar' && (prev.year === null) !== (next.year === null)) return null;
    const flat = (d) => (d.month - 1) * MONTH_DAYS + d.day;
    const diff = flat(next) - flat(prev);
    return diff < 0 ? 1 : diff;
}

// 日期判定：返回 { advance, days, capped }。
// 没有上一个日期只记录；字符串相同不过天；能解析按差值（封顶），差值为零或为负的真实回退不过天；解析不出但字符串变了过一天。
export function judgeDateAdvance(lastDate, dateKey) {
    const last = String(lastDate ?? '');
    const key = String(dateKey ?? '');
    if (!key || !last || last === key) return { advance: false, days: 0, capped: false };
    const diff = dayDifference(parseDate(last), parseDate(key));
    if (diff === null) return { advance: true, days: 1, capped: false };
    if (diff <= 0) return { advance: false, days: 0, capped: false };
    return { advance: true, days: Math.min(SKIP_DAYS_MAX, diff), capped: diff > SKIP_DAYS_MAX };
}

const BRANCH_HOUR = Object.freeze({ 子: 23, 丑: 1, 寅: 3, 卯: 5, 辰: 7, 巳: 9, 午: 11, 未: 13, 申: 15, 酉: 17, 戌: 19, 亥: 21 });
const AFTERNOON = /下午|午后|傍晚|晚上|晚间|夜里|夜间|深夜|半夜|黄昏|入夜/;
const MORNING = /凌晨|清晨|早晨|早上|上午|拂晓|清早|黎明/;

// 时间文本折算为整点（0 至 23）；解析不出返回 null。
export function parseHour(raw) {
    const text = toAscii(String(raw ?? '').replace(/\s+/g, ''));
    if (!text) return null;
    const clock = text.match(/(\d{1,2})[:：](\d{2})/) || text.match(/(\d{1,2})[时點点]/);
    let hour = clock ? Number(clock[1]) : null;
    if (hour === null) {
        const cn = text.match(/([零〇一二两三四五六七八九十]{1,3})[点點时]/);
        if (cn) hour = cnInt(cn[1]);
    }
    if (hour === null) {
        const branch = text.match(/([子丑寅卯辰巳午未申酉戌亥])[时時]/);
        return branch ? BRANCH_HOUR[branch[1]] : null;
    }
    if (!Number.isInteger(hour) || hour < 0 || hour > 24) return null;
    if (hour === 24) return 0;
    if (AFTERNOON.test(text)) return hour === 12 ? 0 : hour < 12 ? hour + 12 : hour;
    if (MORNING.test(text) && hour === 12) return 0;
    if (/中午|正午/.test(text) && hour <= 6) return hour + 12;
    return hour;
}
