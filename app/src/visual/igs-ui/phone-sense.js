// 手机演出的「剧情感」：状态栏时间跟剧情、低电量、无服务，以及帖子数字跨楼增长。
// 全部是纯函数，不碰 DOM；文字内容一律来自正文，这里只出数字与界面状态。
import { feedStableCount } from '../../scene/feed-platforms.js';

// 只有时段时的代表时刻；先具体后泛化（深夜在夜之前，下午在午之前）。
const PERIODS = Object.freeze([
    [['深夜', '午夜', '半夜', '凌晨', 'midnight'], '01:48', true],
    [['黄昏', '傍晚', '日落', 'dusk', 'sunset', 'evening'], '18:20', false],
    [['清晨', '黎明', '拂晓', '早晨', '早上', '日出', '晨', 'dawn', 'morning', 'sunrise'], '07:12', false],
    [['上午'], '10:24', false],
    [['中午', '正午', 'noon'], '12:06', false],
    [['下午', '午后', '白天', '白日', '日间', 'afternoon', 'day'], '15:40', false],
    [['夜', '晚', 'night'], '21:35', true],
]);
const PM_WORDS = ['下午', '午后', '傍晚', '黄昏', '晚', 'pm', '夜'];
const AM_ZERO_WORDS = ['凌晨', '半夜', '深夜', '午夜'];
const NO_SERVICE_WORLDVIEWS = Object.freeze(['modern', 'horror', 'scifi']);
const LOW_BATTERY_RE = /没电|电量不足|快没电|只剩\s*(\d{1,2})\s*[%％]\s*(?:的)?电/;

const pad = (n) => String(n).padStart(2, '0');

// 剧情时间文本 → { time: 'HH:MM', night } 或 null。有钟点用钟点，只有时段用代表时刻。
export function storyClock(sceneTime) {
    const text = String(sceneTime == null ? '' : sceneTime).trim().toLowerCase();
    if (!text) return null;
    const clock = text.match(/(\d{1,2})\s*(?::|：|点|时)\s*(半|\d{1,2})?/);
    if (clock) {
        let hour = Number(clock[1]);
        const minute = clock[2] === '半' ? 30 : Number(clock[2] || 0);
        if (hour <= 24 && minute <= 59) {
            if (hour < 12 && PM_WORDS.some((w) => text.includes(w))) hour += 12;
            if (hour === 12 && AM_ZERO_WORDS.some((w) => text.includes(w))) hour = 0;
            hour %= 24;
            return { time: `${pad(hour)}:${pad(minute)}`, night: hour >= 19 || hour < 5 };
        }
    }
    const hit = PERIODS.find(([words]) => words.some((w) => text.includes(w)));
    return hit ? { time: hit[1], night: hit[2] } : null;
}

// 本页正文里的低电量：「没电 / 电量不足 / 快没电 / 只剩 N% 电」；百分比没写就是 5%。
export function lowBattery(pageText) {
    const m = String(pageText == null ? '' : pageText).match(LOW_BATTERY_RE);
    if (!m) return null;
    const pct = Number(m[1]);
    return { low: true, pct: pct >= 1 && pct <= 99 ? pct : 5 };
}

// 随身带着手机、却不在现代 / 恐怖 / 科幻世界时，没有信号。
export function noService(readerSettings) {
    const rs = readerSettings || {};
    const carry = Boolean(rs.feedFx && rs.feedFx.carryPhone === true);
    return carry && !NO_SERVICE_WORLDVIEWS.includes(String(rs._worldview || 'modern'));
}

export function phoneStatusFor(snapshot, now = Date.now) {
    const content = (snapshot && snapshot.content) || {};
    const story = storyClock(content.sceneTime);
    let time;
    if (story) time = story.time;
    else {
        const d = new Date(now());
        time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const battery = lowBattery(`${content.displayText || ''}\n${content.text || ''}`);
    return {
        time,
        night: Boolean(story && story.night),
        battery: battery || { low: false },
        signal: noService(snapshot && snapshot.readerSettings) ? 'none' : 'ok',
    };
}

// 帖子数字会记得：基数 + 增长。first = 首见楼层，now = 当前楼层（数字 id 才能算差，非数字视为同楼）。
export const GROWTH_FLOOR_CAP = 12;
export function grownCount(seed, base, firstFloor, nowFloor, cap = Number.MAX_SAFE_INTEGER) {
    const a = Number(firstFloor);
    const b = Number(nowFloor);
    const gap = Number.isFinite(a) && Number.isFinite(b) ? Math.min(GROWTH_FLOOR_CAP, Math.max(0, Math.floor(b - a))) : 0;
    let value = base;
    for (let i = 0; i < gap; i += 1) value *= 1 + feedStableCount(`${seed}#g${i}`, 8, 25) / 100;
    return Math.min(cap, Math.round(value));
}
