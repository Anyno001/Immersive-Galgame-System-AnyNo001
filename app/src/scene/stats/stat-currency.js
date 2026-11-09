// 剧情货币：物品表里固定一行（数量即余额）。货币名、四档价格与积分兑换比例由开局判定后固定在聊天级记录 chat:currency。
// 纯函数：只做校验、请求构造与回复解析，不读写宿主。
import { MONEY_TIERS } from './stat-vocab.js';

export const CURRENCY_NAME_MAX = 6;
export const CURRENCY_INITIAL_FACTOR = 10;
export const CURRENCY_RATE_MIN = 0.01;
export const CURRENCY_RATE_MAX = 100;
export const CURRENCY_ATTEMPTS = 3;
export const CURRENCY_CATEGORY = '货币';

const NAME_RE = /^[^\s|｜\[\]【】<>]+$/u;

const positiveInt = (value) => (Number.isSafeInteger(value) && value > 0 ? value : null);

// 四档价格：整数、逐档严格递增。
export function normalizeCurrencyTable(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const table = {};
    let previous = 0;
    for (const tier of MONEY_TIERS) {
        const value = positiveInt(Number(raw[tier]));
        if (!value || value <= previous) return null;
        table[tier] = value;
        previous = value;
    }
    return Object.freeze(table);
}

// 聊天级货币配置 { name, table, rate }；不合规返回 null。
export function normalizeCurrencyConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.name !== 'string') return null;
    const name = String(raw.name ?? '').trim();
    if (!name || name === '积分' || [...name].length > CURRENCY_NAME_MAX || !NAME_RE.test(name)) return null;
    const table = normalizeCurrencyTable(raw.table);
    const rate = Number(raw.rate);
    if (!table || !Number.isFinite(rate) || rate < CURRENCY_RATE_MIN || rate > CURRENCY_RATE_MAX) return null;
    return Object.freeze({ name, table, rate: Math.round(rate * 100) / 100 });
}

// 写入意图记录写前与目标数量；重试只接受这两个状态，不覆盖外部改动。
export function normalizeCurrencyWrite(raw) {
    if (!raw || !Number.isSafeInteger(raw.before) || raw.before < 0 || !Number.isSafeInteger(raw.after) || raw.after < 0) return null;
    return { before: raw.before, after: raw.after };
}

export function normalizeCurrencySettlement(raw) {
    if (!raw || !Number.isSafeInteger(raw.delta) || !Number.isSafeInteger(raw.balance) || raw.balance < 0) return null;
    const write = raw.write === undefined ? null : normalizeCurrencyWrite(raw.write);
    if (raw.write !== undefined && !write) return null;
    return { delta: raw.delta, balance: raw.balance, ...(write && { write }), applied: raw.applied === true };
}

// seeded 与物品行分开保存：已初始化的缺行代表余额 0。
export function normalizeCurrencyRecord(raw) {
    const config = normalizeCurrencyConfig(raw);
    if (!config) return null;
    const initial = Number(raw.initial);
    if (!Number.isSafeInteger(initial) || initial < 0 || initial > config.table.巨额 * CURRENCY_INITIAL_FACTOR) return null;
    const seed = raw.seed === undefined ? null : normalizeCurrencyWrite(raw.seed);
    if (raw.seed !== undefined && (!seed || seed.after - seed.before !== initial)) return null;
    return Object.freeze({ ...config, initial, seeded: raw.seeded === true, ...(seed && { seed }) });
}

export const currencyRecordValue = (record) => ({
    name: record.name, table: { ...record.table }, rate: record.rate, initial: record.initial, seeded: record.seeded,
    ...(record.seed && { seed: { ...record.seed } }),
});

export function currencyBalanceOf(snapshot, name) {
    if (snapshot?.ok !== true || !Array.isArray(snapshot.inventory?.items)) return { ok: false, reason: snapshot?.reason || 'inventory-table-read-failed' };
    const keyOf = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
    const key = keyOf(name);
    const issue = (snapshot.diagnostics || []).find((entry) => keyOf(entry.name) === key);
    if (issue) return { ok: false, reason: issue.code || 'stats-currency-balance-invalid' };
    const item = snapshot.inventory.items.find((row) => keyOf(row.name) === key && !row.lost);
    const balance = item ? item.quantity : 0;
    return Number.isSafeInteger(balance) && balance >= 0 ? { ok: true, balance, exists: Boolean(item) } : { ok: false, reason: 'stats-currency-balance-invalid' };
}

// 积分兑换：points 积分换多少货币（向下取整，至少要换得 1 单位）。
export function currencyForPoints(config, points) {
    const n = Number(points);
    if (!config || !Number.isSafeInteger(n) || n <= 0) return 0;
    return Math.floor(n * config.rate + 1e-9);
}

// 开局判定请求：剧情资料 + 世界观 → 货币名、初始金额、四档价格、兑换比例。
export function buildCurrencyRequest({ protagonist = '主角', worldview = '', story = '', people = [] } = {}, { prompt = '' } = {}) {
    const lines = [`主角：${protagonist}`];
    if (worldview) lines.push(`世界观：${worldview}`);
    if (story) lines.push(`剧情：${String(story).slice(0, 2000)}`);
    const intro = (Array.isArray(people) ? people : []).filter((p) => p && p.name).slice(0, 6).map((p) => `- ${p.name}：${String(p.summary || '').slice(0, 200)}`);
    if (intro.length) lines.push(`角色资料：\n${intro.join('\n')}`);
    return { system: prompt || DEFAULT_CURRENCY_PROMPT, user: lines.join('\n') };
}

export const DEFAULT_CURRENCY_PROMPT = [
    '你为一段角色扮演判定剧情里使用的货币。只输出一个 JSON 对象，不要解释。',
    '字段：name（货币名，1–6 字，如 铜钱、金币、信用点，不可使用「积分」）；initial（主角开局持有的数量，整数）；',
    'prices（对象，键为 少量、普通、昂贵、巨额，值为该档花费在这种货币下的整数价格，逐档递增）；',
    'rate（游戏积分兑换这种货币的比例：1 积分可换多少单位货币，0.01–100，按世界观物价判断）。',
    '依据主角身份与世界观给出合理的开局家底：开局数量不超过「巨额」价格的 10 倍。',
].join('\n');

// 解析判定回复；返回 { ok, config, initial } 或 { ok:false, reason }。
export function parseCurrencyReply(text) {
    const raw = String(text || '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return { ok: false, reason: 'stats-currency-invalid' };
    let data;
    try { data = JSON.parse(raw.slice(start, end + 1)); } catch { return { ok: false, reason: 'stats-currency-invalid' }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'stats-currency-invalid' };
    const config = normalizeCurrencyConfig({ name: data.name, table: data.prices, rate: data.rate });
    if (!config) return { ok: false, reason: 'stats-currency-invalid' };
    const initial = Number(data.initial);
    if (!Number.isSafeInteger(initial) || initial < 0 || initial > config.table.巨额 * CURRENCY_INITIAL_FACTOR) return { ok: false, reason: 'stats-currency-initial-invalid' };
    return { ok: true, config, initial };
}
