// 规则 v5 P3 祈司「圣辉与守护」（sanctum 族，只给祈司）：P01 圣辉资源与圣辉牌、P02 圣辉联动、P04 不衰减回复、P05 战后回复。
// P03 净化、人工制品、护命与 P06 无实体、保命沿用 sanctum 族已有模板（absolution、sigil、phase、deathward）；P04 群体再生用内置 regen 对 all-allies 施加。
// 圣辉记在 res.radiance（0–10，跨回合保留，不自动回复）。卡牌字段 radiance 为第二费用：1–5 点，或 'X'（花光圣辉，每点结算一次）；
// 是否付得起由 battle-state.js 的 canAfford 判定，扣除在本文件的 play-before 钩子里进行。
import { registerMechanic } from './registry.js';

export const RADIANCE_MAX = 10;
const st = (unit, key) => unit?.statuses?.[key] || 0;
const statusSource = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
// 生命最低的存活敌人（同值取出手顺序靠前者）。
function weakestFoe(state, unit) {
    let best = null;
    for (const id of state.order) {
        const other = state.units[id];
        if (!other?.alive || other.side === unit.side) continue;
        if (!best || other.hp < best.hp) best = other;
    }
    return best;
}

// 增减圣辉并触发 P02 联动（每次变动触发一次，不按点数）；返回实际变动量。
function shiftRadiance(ctx, unit, delta, kit) {
    const res = kit.resOf(ctx, unit);
    if (!res) return 0;
    const prev = res.radiance || 0;
    const next = Math.max(0, Math.min(RADIANCE_MAX, prev + delta));
    const moved = next - prev;
    res.radiance = next;
    if (!moved) return 0;
    kit.emit(ctx, { type: 'radiance', unitId: unit.id, delta: moved, value: next });
    const strike = st(unit, 'halo-strike');
    const foe = strike ? weakestFoe(ctx.state, unit) : null;
    if (foe) kit.dealDamage(ctx, foe, strike, statusSource(unit, 'halo-strike'), 'halo', true);
    const mend = st(unit, 'halo-mend');
    if (mend && unit.alive && !ctx.state.outcome) kit.heal(ctx, unit, mend, statusSource(unit, 'halo-mend'));
    // 规则 v6 G5b：消耗圣辉后（每次消耗触发一次，不按点数）。
    if (moved < 0 && ctx.state.rulesVersion >= 6) kit.fireBus(ctx, unit, 'radiance-spent', null);
    kit.fireBus(ctx, unit, 'radiance-shift', null);
    return moved;
}

// P05：战斗胜利后的回复量（写进伤势归并，不在战斗内生效）；倒下的单位不回复。
export const afterBattleMend = (unit) => (unit?.alive ? st(unit, 'after-mend') : 0);

registerMechanic({
    key: 'sanctum', family: 'sanctum', archetypes: ['priest'], unitKinds: ['deck'],
    statuses: [
        { key: 'halo-strike', label: '辉击' },
        { key: 'halo-mend', label: '辉愈' },
        { key: 'steady-mend', label: '恒愈' },
        { key: 'after-mend', label: '战后回复' },
    ],
    ops: {
        radiance: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount'], path, state);
                return { op: 'radiance', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 5) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                shiftRadiance(ctx, unit, effect.amount, kit);
            },
            value: (e) => e.amount * 3,
            describe: (e) => `获得 ${e.amount} 点圣辉`,
            brief: (e) => `辉${e.amount}`,
        },
    },
    hooks: {
        'play-before'(ctx, before, kit) {
            const cost = before.card?.radiance;
            if (cost === undefined) return;
            const have = before.unit.res?.radiance || 0;
            const spend = cost === 'X' ? have : Math.min(have, cost);
            if (spend <= 0) return;
            if (cost === 'X') before.runs *= spend;
            shiftRadiance(ctx, before.unit, -spend, kit);
        },
        'turn-start-after'(ctx, { unit }, kit) {
            const mend = st(unit, 'steady-mend');
            if (mend && unit.alive) kit.heal(ctx, unit, mend, statusSource(unit, 'steady-mend'));
        },
    },
    report(event, kit) {
        if (event.type !== 'radiance' || event.unitId !== kit.actorId) return;
        kit.note(event.unitId, event.delta > 0 ? `获得 ${event.delta} 点圣辉` : `消耗 ${-event.delta} 点圣辉`);
    },
});
