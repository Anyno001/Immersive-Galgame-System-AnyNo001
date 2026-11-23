// 剧情货币：物品表里固定一行（数量即余额）；配置保存在 chat:currency，修改走可恢复意图。
// 纯函数：只做校验、请求构造与回复解析，不读写宿主。
import { MONEY_TIERS } from './stat-vocab.js';

export const CURRENCY_NAME_MAX = 6;
export const CURRENCY_INITIAL_FACTOR = 10;
export const CURRENCY_RATE_MIN = 0.01;
export const CURRENCY_RATE_MAX = 100;
export const CURRENCY_CATEGORY = '货币';
export const CURRENCY_DESCRIPTION = '剧情货币';

export const currencyNameKey = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
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
    const key = currencyNameKey(name);
    if (!key || key === '积分' || [...name].length > CURRENCY_NAME_MAX || !NAME_RE.test(name) || !NAME_RE.test(key)) return null;
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
    if (!Number.isSafeInteger(initial) || initial < 0) return null;
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
    const key = currencyNameKey(name);
    const issue = (snapshot.diagnostics || []).find((entry) => currencyNameKey(entry.name) === key);
    if (issue) return { ok: false, reason: issue.code || 'stats-currency-balance-invalid' };
    const item = snapshot.inventory.items.find((row) => currencyNameKey(row.name) === key && !row.lost);
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
    if (story) lines.push(`剧情：${String(story)}`);
    const intro = (Array.isArray(people) ? people : []).filter((p) => p && p.name).slice(0, 6).map((p) => `- ${p.name}：${String(p.summary || '')}`);
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
    if (start < 0 || end <= start) return { ok: false, reason: raw.trim() ? 'stats-currency-not-json' : 'stats-currency-reply-empty' };
    let data;
    try { data = JSON.parse(raw.slice(start, end + 1)); } catch { return { ok: false, reason: 'stats-currency-not-json' }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'stats-currency-config-invalid' };
    const config = normalizeCurrencyConfig({ name: data.name, table: data.prices, rate: data.rate });
    if (!config) return { ok: false, reason: 'stats-currency-config-invalid' };
    const initial = Number(data.initial);
    if (!Number.isSafeInteger(initial) || initial < 0 || initial > config.table.巨额 * CURRENCY_INITIAL_FACTOR) return { ok: false, reason: 'stats-currency-initial-invalid' };
    return { ok: true, config, initial };
}
const REQUEST_REASONS = new Set(['request-stale', 'request-timeout', 'stats-no-model', 'invalid-llm-messages',
    'ordered-messages-unsupported', 'secondary-llm-http-failed', 'secondary-llm-transport-failed', 'secondary-llm-backend-unreachable']);

export function currencyRequestFailure(error) {
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : null;
    return { ok: false, stage: 'request', reason: REQUEST_REASONS.has(error?.reason) ? error.reason : 'stats-currency-request-failed',
        ...(status && { status }) };
}

const CURRENCY_STAGES = Object.freeze({ request: '请求', parse: '解析', seed: '初始化', recover: '恢复', read: '余额读取', edit: '修改' });
const CURRENCY_FAILURES = Object.freeze({
    'stats-no-model': '辅助模型不可用',
    'stats-currency-request-failed': '请求失败，发送状态未知',
    'stats-hero-init-request-failed': '请求失败，发送状态未知',
    'secondary-llm-http-failed': '接口拒绝或服务端错误',
    'secondary-llm-transport-failed': '传输失败，发送状态未知',
    'secondary-llm-backend-unreachable': '酒馆后端未能连接上游',
    'request-timeout': '请求已结束但未收到成功回执，上游可能仍在执行',
    'invalid-llm-messages': '请求消息格式无效',
    'ordered-messages-unsupported': '当前宿主不支持请求消息顺序',
    'stats-currency-reply-empty': '回复为空',
    'stats-hero-init-reply-empty': '回复为空',
    'stats-currency-not-json': '回复不是有效 JSON',
    'stats-hero-init-not-json': '回复不是有效 JSON',
    'stats-hero-init-attributes-invalid': '主角六维不完整或超出合法范围',
    'stats-hero-init-intent-invalid': '本地主角初始化待恢复记录不合法',
    'stats-hero-init-intent-read-failed': '本地主角初始化待恢复记录读取失败',
    'stats-hero-init-intent-save-failed': '本地主角初始化待恢复记录保存未确认',
    'stats-currency-config-invalid': '货币名称、四档金额或兑换比例不合法',
    'stats-currency-initial-invalid': '初始金额不合法',
    'points-wallet-unavailable': '共享积分钱包暂不可读',
    'inventory-table-read-failed': '物品表读取失败',
    'inventory-table-ambiguous': '物品表不唯一',
    'inventory-quantity-invalid': '物品数量不合法',
    'inventory-quantity-conflict': '余额已变化，未覆盖外部修改',
    'inventory-write-unverified': '物品写入尚未确认',
    'stats-currency-edit-pending': '原货币修改尚未完成，请恢复原操作',
    'stats-currency-edit-stale': '聊天或货币配置已变化，请重新打开表单',
    'stats-currency-edit-conflict': '货币配置与原意图不一致，未覆盖现有数据',
    'stats-currency-edit-log-conflict': '货币修改记录残缺或不一致，已停止后续写入',
    'stats-currency-edit-invalid': '货币修改意图不合法',
    'stats-currency-edit-intent-invalid': '本地待提交意图不合法',
    'stats-currency-edit-intent-read-failed': '本地待提交意图读取失败',
    'stats-currency-edit-intent-save-failed': '本地待提交意图保存未确认',
    'inventory-rename-target-occupied': '目标名称已被物品占用',
    'inventory-rename-conflict': '原物品行已变化，未覆盖外部修改',
});

export function describeCurrencyFailure({ stage = 'recover', reason = '', status, done = false } = {}) {
    const code = /^[a-z][a-z0-9-]{0,79}$/.test(reason) ? reason : 'stats-currency-failed';
    const detail = CURRENCY_FAILURES[code] || code;
    const http = Number.isInteger(status) && status >= 400 && status <= 599 ? `（HTTP ${status}）` : '';
    if (done) return `兑换已完成，余额暂不可确认：${detail}${http}。可重试读取，请勿再次提交兑换`;
    return `剧情货币${CURRENCY_STAGES[stage] || '处理'}失败：${detail}${http}。可手动重试`;
}