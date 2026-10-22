// 时间跳跃天数：识别「7天」「三日」「一周后」「半个月」等写法，上限 30 天（易错点 D4）。
export const SKIP_DAYS_MAX = 30;

const CN_DIGIT = Object.freeze({ 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 });
const UNIT_DAYS = Object.freeze({ 天: 1, 日: 1, 周: 7, 星期: 7, 礼拜: 7, 月: 30, 年: 365 });
const SKIP_RE = /^(\d+|[零一二两三四五六七八九十半]+)?个?(天|日|周|星期|礼拜|月|年)(?:之?后)?$/;

function toAscii(text) {
    return text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

function cnNumber(text) {
    if (text === '半') return 0.5;
    if (!text.includes('十')) return text.length === 1 && text in CN_DIGIT ? CN_DIGIT[text] : NaN;
    const [tens, ones] = text.split('十');
    const t = tens ? CN_DIGIT[tens] : 1;
    const o = ones ? CN_DIGIT[ones] : 0;
    return t === undefined || o === undefined ? NaN : t * 10 + o;
}

// 返回 { days, capped }；识别不了或不足一天返回 null。
export function parseSkipDays(raw) {
    const text = toAscii(String(raw ?? '').replace(/\s+/g, ''));
    const match = text.match(SKIP_RE);
    if (!match) return null;
    const count = match[1] === undefined ? 1 : /^\d+$/.test(match[1]) ? Number(match[1]) : cnNumber(match[1]);
    const days = Math.floor(count * UNIT_DAYS[match[2]]);
    if (!Number.isFinite(days) || days < 1) return null;
    return { days: Math.min(SKIP_DAYS_MAX, days), capped: days > SKIP_DAYS_MAX };
}
