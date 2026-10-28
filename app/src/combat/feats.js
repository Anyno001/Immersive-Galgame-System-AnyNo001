// 战斗成就（只读推导）：从本场引擎事件与终局状态算出，不写存档、不进战报；面板结算画面据此显示成就牌子。
// 荣誉击杀：胜利时最后一名倒下的敌人由操控角色的攻击击倒，且这一击扣除格挡后的伤害恰好等于它剩余的生命（没有一点溢出）。
// 超杀：敌人全灭后，操控角色的攻击又打中倒下的敌人至少 COMBAT_OVERKILL_HITS 段（同一段同时打到几名倒下的敌人只算一段）。
export const COMBAT_OVERKILL_HITS = 5;
const ACTION_EVENTS = new Set(['card', 'hero-skill', 'item', 'skill', 'awaken']);

export function combatFeats(events, state) {
    if (state?.outcome !== 'victory' || !Array.isArray(events)) return [];
    const units = state.units || {};
    const heroId = state.controlledId;
    let last = -1;
    events.forEach((e, i) => { if (e?.type === 'defeated' && units[e.unitId]?.side === 'enemy') last = i; });
    if (last < 0) return [];
    const out = [];
    const foeId = events[last].unitId;
    let blow = null;
    for (let i = last - 1; i >= 0 && !blow; i -= 1) {
        const e = events[i];
        if (e?.type === 'damage' && e.target === foeId && !e.overkill) blow = e;
    }
    if (blow && blow.kind === 'attack' && blow.source?.unitId === heroId && blow.hpLoss > 0 && blow.amount - (blow.blocked || 0) === blow.hpLoss) out.push({ id: 'honor-kill' });
    // 段号只在一次动作内递增：按动作序号 + 段号去重。
    const strikes = new Set();
    let action = 0;
    for (let i = last + 1; i < events.length; i += 1) {
        const e = events[i];
        if (ACTION_EVENTS.has(e?.type)) action += 1;
        else if (e?.type === 'damage' && e.overkill && e.source?.unitId === heroId) strikes.add(`${action}:${e.strike || `e${i}`}`);
    }
    if (strikes.size >= COMBAT_OVERKILL_HITS) out.push({ id: 'overkill', hits: strikes.size });
    return out;
}
