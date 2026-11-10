// 自然回血（计划 docs/STATS_STATUS_TIME_PLAN.md D 批）：按楼或按天推进伤势，时间跳跃按天数一次算完。
// 纯计算：伤势本身存在战斗账本（wound），这里只读 engine.readVitals，算出每个受伤角色应回复的生命百分比，
// 交给调用方经战斗账本现有的 heal 记录写回（meta.heal → refreshLife 的 naturalHeals → ledger heal 条目，锚定楼与 swipe，重新生成不重复计）。
import { SKIP_FULL_DAYS } from './stat-status-defs.js';
import { clearRecoverStatuses } from './stat-status.js';
import { hasTrait } from './stat-traits.js';
import { PROTAGONIST } from './stat-engine.js';

export const HEAL_DAY_PCT = 10;
export const HEAL_FLOOR_PCT = 3;
// 按楼换算每天：每天 = 每楼比例 × 10。
export const FLOOR_PER_DAY = 10;
export const HEAVY_WOUND_PCT = 20;
export const HEAL_HELPER_BONUS = 1.25;

export const healConfigOf = (settings) => ({
    mode: settings && settings.healMode === 'floor' ? 'floor' : 'day',
    day: Number(settings && settings.healDay) > 0 ? Number(settings.healDay) : HEAL_DAY_PCT,
    floor: Number(settings && settings.healFloor) > 0 ? Number(settings.healFloor) : HEAL_FLOOR_PCT,
});

const pctOf = (vitals) => (vitals.down || Number(vitals.hp) <= 0 ? 0 : Math.min(100, (Number(vitals.hp) / Number(vitals.maxHp)) * 100));
const wounded = (vitals) => Boolean(vitals) && Number(vitals.maxHp) > 0 && (vitals.down === true || Number(vitals.hp) < Number(vitals.maxHp));

// 本次要回的基础百分比（尚未乘特质倍率）；null 表示本次不回血。full 为跳过 7 天以上回满。
export function healBase(cfg, days) {
    if (days >= SKIP_FULL_DAYS) return { full: true, raw: 100, perDay: cfg.mode === 'day' ? cfg.day : cfg.floor * FLOOR_PER_DAY, label: `跳过${days}天，回满` };
    const perDay = cfg.mode === 'day' ? cfg.day : cfg.floor * FLOOR_PER_DAY;
    if (days >= 1 && (cfg.mode === 'day' || days > 1)) return { full: false, raw: days * perDay, perDay, label: days > 1 ? `每天${perDay}%×${days}天` : `每天${perDay}%` };
    if (cfg.mode === 'floor') return { full: false, raw: cfg.floor, perDay, label: `每楼${cfg.floor}%` };
    return null;
}

// 计算本楼各角色的回血。ctx：{ settings, engine, traitCat, present, days, detached, statusBox, changes }。
// 返回 [{ name, amount, reason }]，amount 为最大生命的百分比（1–100）；同时往 changes 写「生命」变动（带 calc）并在回满时清恢复型状态。
export function settleNaturalHeal(state, ctx) {
    const { engine, changes, statusBox } = ctx;
    const out = [];
    if (!engine || typeof engine.readVitals !== 'function') return out;
    const cfg = healConfigOf(ctx.settings);
    const days = Math.max(0, Number(ctx.days) || 0);
    const base = healBase(cfg, days);
    if (!base) return out;
    const cat = ctx.traitCat;
    const present = Array.isArray(ctx.present) ? ctx.present : [];
    // 贤惠 / 医术在场略快（医术是将来的新特质，按名字判断；没有定义时 hasTrait 为假）。
    const helper = present.some((n) => hasTrait(state, cat, n, '贤惠') || hasTrait(state, cat, n, '医术')) || hasTrait(state, cat, PROTAGONIST, '医术');
    const names = [{ name: PROTAGONIST, read: engine.userName || PROTAGONIST, skip: ctx.detached === true }, ...Object.keys(state.characters).map((n) => ({ name: n, read: n, skip: hasTrait(state, cat, n, '已故') }))];
    for (const { name, read, skip } of names) {
        if (skip) continue;
        let vitals = null;
        try { vitals = engine.readVitals(read) || null; } catch { vitals = null; }
        if (!wounded(vitals)) continue;
        const from = pctOf(vitals);
        const calc = [{ label: `回血：${base.label}`, value: Math.round(base.raw) }];
        let mult = 1;
        if (!base.full) {
            if (from < HEAVY_WOUND_PCT) { mult *= 0.5; calc.push({ label: '重伤减半', value: 0.5 }); }
            if (hasTrait(state, cat, name, '自愈')) { mult *= 2; calc.push({ label: '自愈', value: 2 }); }
            if (hasTrait(state, cat, name, '伤口难愈')) { mult *= 0.5; calc.push({ label: '伤口难愈', value: 0.5 }); }
            if (helper) { mult *= HEAL_HELPER_BONUS; calc.push({ label: '贤惠/医术在场', value: HEAL_HELPER_BONUS }); }
        }
        const amount = Math.min(100, Math.max(1, Math.ceil(base.raw * mult - 1e-9)));
        const to = Math.min(100, Math.round(from + amount));
        const full = base.full || to >= 100;
        calc.push({ label: '结果', value: full ? '回满' : `+${amount}%` });
        changes.push({ source: 'daily', target: name, key: '生命', from: Math.round(from), to: full ? 100 : to, note: '自然回血', calc: calc.map((r) => ({ label: String(r.label), value: r.value })) });
        out.push({ name, amount: full ? 100 : amount, reason: base.full ? `跳过${days}天回满` : '自然回血' });
        if (full && statusBox && statusBox.cat) {
            const r = clearRecoverStatuses(statusBox.cat, name);
            statusBox.cat = r.catalog;
            changes.push(...r.changes);
        }
    }
    return out;
}
