// 主角生活条（§7）：档位换算成增减量；金钱不足时不扣钱并标记「买不起」。
// 生命不再是生活条（合并计划 Q4）：剧情受伤只给出伤势档位，由运行时按生命上限的百分比写战斗伤势记录（N3）。
import { clamp } from './stat-state.js';
import { HURT_PCT } from './stat-vocab.js';

export { HURT_PCT };
export const STAMINA_DELTA = Object.freeze({ 轻: -5, 中: -15, 重: -30, 熬夜: -20, 进食: 10, 小憩: 20 });
export const STRESS_DELTA = Object.freeze({ 上升: 10, 下降: -10 });
export const DEFAULT_MONEY_TABLE = Object.freeze({ 少量: 20, 普通: 100, 昂贵: 500, 巨额: 3000 });
export const STAMINA_LOW = 30;
// 生命比例阈值：低于 20% 为重伤（检定劣势），低于 50% 为轻伤。
export const HEALTH_SEVERE_PCT = 20;
export const HEALTH_LIGHT_PCT = 50;
export const STRESS_HIGH = 70;

function shift(bars, key, delta, max = 100) {
    const from = Number(bars[key]) || 0;
    const to = clamp(from + delta, 0, max);
    return to === from ? { bars, change: null } : { bars: { ...bars, [key]: to }, change: { key, from, to } };
}

// 体力事件「受伤」按轻伤处理；花费超过余额时不扣钱，返回 shortfall。受伤返回 hurt 档位，不改生活条。
export function applyBarDirective(bars, directive, moneyTable = DEFAULT_MONEY_TABLE) {
    switch (directive.kind) {
    case 'stamina':
        return directive.value === '受伤'
            ? { bars, change: null, hurt: '轻伤' }
            : shift(bars, 'stamina', STAMINA_DELTA[directive.value] || 0);
    case 'hurt': return Object.hasOwn(HURT_PCT, directive.value) ? { bars, change: null, hurt: directive.value } : { bars, change: null };
    case 'stress': return shift(bars, 'stress', STRESS_DELTA[directive.value] || 0);
    case 'money': {
        const amount = Number(moneyTable[directive.value]) || 0;
        if (directive.flow === '花费' && amount > (Number(bars.money) || 0)) return { bars, change: null, shortfall: true };
        return shift(bars, 'money', directive.flow === '花费' ? -amount : amount, Infinity);
    }
    default: return { bars, change: null };
    }
}

// vitals：{ hp, maxHp, down }（战斗生命视图）；缺省按满血。
export function healthStatus(vitals) {
    if (!vitals || !(Number(vitals.maxHp) > 0)) return '正常';
    if (vitals.down || Number(vitals.hp) <= 0) return '倒下';
    const pct = (Number(vitals.hp) / Number(vitals.maxHp)) * 100;
    if (pct < HEALTH_SEVERE_PCT) return '重伤';
    return pct < HEALTH_LIGHT_PCT ? '轻伤' : '正常';
}

// 检定修正：体力低于 30、重伤或倒下各给 1 次劣势（d20 下劣势不叠加）；压力高于 70 时加值 −2。
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
