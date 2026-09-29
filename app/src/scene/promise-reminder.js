// 约定到期判定（纯函数）：剧情「今天」取数据库中表名含「全局」的表（如「全局状态表」）的当前时间列（YYYY-MM-DD HH:MM）；
// 约定时间只认能解析出具体日期的写法（2026-04-07、4月7日），「周六下午」「明天」等无法定位到日期的不提醒，不猜测。
import { parseLooseDate } from '../data/shujuku/record-model.js';
import { extractFxDirectives } from './fx-directives.js';

// 表名模糊匹配：含「全局」即可。
export const GLOBAL_TABLE_KEYWORD = '全局';
export const CURRENT_TIME_COLUMNS = Object.freeze(['当前时间']);
// 时间列回退时排除的列：上一轮时间、经过时长都不是「现在」。
const NON_CURRENT_TIME_WORDS = Object.freeze(['上轮', '上一', '经过', '经历']);
const DAY_SPAN_PER_YEAR = 13 * 32;

function clean(value) {
    return String(value == null ? '' : value).trim();
}

function findTimeColumn(columns) {
    const names = columns.map(clean);
    const exact = names.findIndex((c) => CURRENT_TIME_COLUMNS.includes(c));
    if (exact >= 0) return exact;
    const current = names.findIndex((c) => c.includes('当前') && c.includes('时间'));
    if (current >= 0) return current;
    return names.findIndex((c) => c.includes('时间') && !NON_CURRENT_TIME_WORDS.some((w) => c.includes(w)));
}

// 多张表含「全局」时，取第一张能读出带年份日期的表。
// tables 为 parseTables 结果 [{ name, columns, rows }]；取不到表、列或值时返回 null。
export function readStoryNow(tables) {
    const list = Array.isArray(tables) ? tables : [];
    for (const table of list) {
        if (!table || !clean(table.name).includes(GLOBAL_TABLE_KEYWORD)) continue;
        if (!Array.isArray(table.columns) || !Array.isArray(table.rows)) continue;
        const col = findTimeColumn(table.columns);
        if (col < 0) continue;
        const row = table.rows.find((r) => Array.isArray(r) && clean(r[col]));
        if (!row) continue;
        const raw = clean(row[col]);
        const parsed = parseLooseDate(raw);
        const year = /(\d{4})/.exec(raw);
        if (!parsed || !parsed.hasYear || !year) continue;
        return { raw, day: Math.floor(parsed.key / 1440), year: Number(year[1]), table: clean(table.name) };
    }
    return null;
}

// 约定日期换算成与 now 同基准的日序号；缺年份时沿用剧情当前年份。
export function promiseDay(time, now) {
    const parsed = parseLooseDate(time);
    if (!parsed || !now) return null;
    return Math.floor(parsed.key / 1440) + (parsed.hasYear ? 0 : now.year * DAY_SPAN_PER_YEAR);
}

// messages: [{ id, text }]，按楼层顺序；同一时间 + 地点只保留最早一条。
export function collectPromises(messages) {
    const out = [];
    const seen = new Set();
    for (const message of Array.isArray(messages) ? messages : []) {
        for (const d of extractFxDirectives(message && message.text)) {
            if (d.kind !== 'promise' || d.end) continue;
            const time = clean(d.args[0]);
            const place = clean(d.args[1]);
            const key = `${time}|${place}`;
            if (!time || seen.has(key)) continue;
            seen.add(key);
            out.push({ time, place, messageId: message.id });
        }
    }
    return out;
}

// 返回剧情当天到期的约定；now 不可用或约定日期无法解析时一律不提醒。
export function resolveDuePromises(promises, now) {
    if (!now) return [];
    return (Array.isArray(promises) ? promises : []).filter((p) => promiseDay(p.time, now) === now.day);
}
