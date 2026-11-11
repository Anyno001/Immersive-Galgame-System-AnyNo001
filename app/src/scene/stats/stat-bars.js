// 主角生活条（§7）：档位换算成增减量；金钱不足时不扣钱并标记「买不起」。
import { clamp } from './stat-state.js';
import { HURT_PCT } from './stat-vocab.js';

export { HURT_PCT };

export const STAMINA_DELTA = Object.freeze({ 轻: -5, 中: -15, 重: -30, 熬夜: -20, 进食: 10, 小憩: 20 });
export const STRESS_DELTA = Object.freeze({ 上升: 10, 下降: -10 });
// 压力强度（新楼标签带强度时用，省略按「中」即 STRESS_DELTA）：小 ±5、中 ±10、大 ±20；上升另有「极大」+50（创伤性事件，rev ≥ 2，下降没有极大）。
export const STRESS_STRENGTH_DELTA = Object.freeze({ 上升: Object.freeze({ 小: 5, 中: 10, 大: 20, 极大: 50 }), 下降: Object.freeze({ 小: -5, 中: -10, 大: -20 }) });
export const DEFAULT_MONEY_TABLE = Object.freeze({ 少量: 20, 普通: 100, 昂贵: 500, 巨额: 3000 });
export const STAMINA_LOW = 30;
export const HEALTH_SEVERE_PCT = 20;
export const HEALTH_LIGHT_PCT = 50;
export const STRESS_HIGH = 70;

// 金钱与战斗积分合并成一个钱包：合并余额 = 数值侧金钱 + 战斗侧主角积分净流水（walletExtra，调用方传入，纯函数不读全局）。
export function walletBalance(bars, walletExtra = 0) {
    return (Number(bars && bars.money) || 0) + (Number(walletExtra) || 0);
}

// 剧情货币（物品表里固定的一行）：opts.currency = { ready, balance, table }。结算只改 ctx.currency，
// 由调用方按 delta 写物品表；未传时沿用旧的 bars.money 路径。
export function createCurrencyContext(currency, moneyTable = DEFAULT_MONEY_TABLE) {
    if (!currency || typeof currency !== 'object') return null;
    const table = currency.table && typeof currency.table === 'object' ? currency.table : moneyTable;
    return { ready: currency.ready === true, balance: Math.max(0, Math.floor(Number(currency.balance) || 0)), table, delta: 0 };
}

export const currencyTable = (ctx) => (ctx && ctx.currency ? ctx.currency.table : (ctx && ctx.moneyTable) || DEFAULT_MONEY_TABLE);

// 结算时可用的金钱余额：有剧情货币时取物品表余额，否则取旧合并余额。
export function moneyBalance(bars, ctx = {}) {
    return ctx.currency ? ctx.currency.balance : walletBalance(bars, ctx.walletExtra);
}

// 改剧情货币余额并记一条变化；货币未就绪时不改并记诊断。返回是否已入账。
export function shiftCurrency(ctx, delta, entry = {}) {
    const c = ctx.currency;
    const amount = Math.trunc(Number(delta) || 0);
    if (!amount) return true;
    if (!c.ready) { ctx.diagnostics.push({ code: 'stats-currency-unready', note: entry.note || '' }); return false; }
    const from = c.balance;
    const to = Math.max(0, from + amount);
    c.balance = to;
    c.delta += to - from;
    if (to !== from) ctx.changes.push({ source: entry.source || 'tag', target: '主角', key: 'money', from, to, note: entry.note || '' });
    return true;
}

// money 标签走剧情货币：写了具体数目（amount）按数目入账，否则按本聊天的四档价格换算；花费超过余额时不扣并返回 shortfall。
export function applyCurrencyDirective(ctx, directive, entry = {}) {
    const c = ctx.currency;
    const amount = directive.amount > 0 ? directive.amount : Number(c.table[directive.value]) || 0;
    if (!amount) return { shortfall: false };
    if (!c.ready) { ctx.diagnostics.push({ code: 'stats-currency-unready', note: entry.note || '' }); return { shortfall: false };}
    if (directive.flow === '花费' && amount > c.balance) return { shortfall: true };
    shiftCurrency(ctx, directive.flow === '花费' ? -amount : amount, entry);
    return { shortfall: false };
}

function shift(bars, key, delta, max = 100, min = 0) {
    const from = Number(bars[key]) || 0;
    const to = clamp(from + delta, min, max);
    return to === from ? { bars, change: null } : { bars: { ...bars, [key]: to }, change: { key, from, to } };
}

// 体力事件「受伤」按轻伤、hurt 标签按原档位，都只返回 hurt 档交给战斗账本，不再改数值侧生命；花费超过余额时不扣钱，返回 shortfall。
export function applyBarDirective(bars, directive, moneyTable = DEFAULT_MONEY_TABLE, walletExtra = 0) {
    switch (directive.kind) {
    case 'stamina':
        return directive.value === '受伤'
            ? { bars, change: null, hurt: '轻伤' }
            : shift(bars, 'stamina', STAMINA_DELTA[directive.value] || 0);
    case 'hurt': return Object.hasOwn(HURT_PCT, directive.value) ? { bars, change: null, hurt: directive.value } : { bars, change: null };
    case 'stress': {
        const table = STRESS_STRENGTH_DELTA[directive.value];
        return shift(bars, 'stress', (table && table[directive.strength]) || STRESS_DELTA[directive.value] || 0);
    }
    case 'money': {
        const amount = directive.amount > 0 ? directive.amount : Number(moneyTable[directive.value]) || 0;
        if (directive.flow === '花费' && amount > walletBalance(bars, walletExtra)) return { bars, change: null, shortfall: true };
        // 扣款记在数值侧金钱上；战斗积分垫付的部分会让它为负，合并余额仍不小于零。
        return shift(bars, 'money', directive.flow === '花费' ? -amount : amount, Infinity, -Infinity);
    }
    default: return { bars, change: null };
    }
}

// 生命状态取战斗 vitals（{hp, maxHp, down}）：无数据按「正常」；hp 为 0 或 down 为倒下。
export function healthStatus(vitals) {
    if (!vitals || !(Number(vitals.maxHp) > 0)) return '正常';
    if (vitals.down || Number(vitals.hp) <= 0) return '倒下';
    const pct = (Number(vitals.hp) / Number(vitals.maxHp)) * 100;
    if (pct < HEALTH_SEVERE_PCT) return '重伤';
    return pct < HEALTH_LIGHT_PCT ? '轻伤' : '正常';
}

// 检定修正：体力低于 30、生命处于重伤或倒下各给 1 颗惩罚骰；压力高于 70 时目标值 −10。
export function checkModifiers(bars, vitals = null) {
    const status = healthStatus(vitals);
    const penalty = (bars.stamina < STAMINA_LOW ? 1 : 0) + (status === '重伤' || status === '倒下' ? 1 : 0);
    return { penalty, targetShift: bars.stress > STRESS_HIGH ? -10 : 0 };
}

// 打工收入档：大成功、极难成功 → 昂贵；困难、普通成功 → 普通；失败 → 少量；大失败没有收入。
export function workIncomeTier(tier) {
    if (tier === '大成功' || tier === '极难成功') return '昂贵';
    if (tier === '困难成功' || tier === '普通成功') return '普通';
    return tier === '失败' ? '少量' : null;
}
