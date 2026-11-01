// 战斗成就：根据事件日志判定「荣誉击杀」与「过量击杀」。纯函数。

// 击杀之后算作「后续动作」的事件类型：出现这些事件会让过量击杀的分组计数加一。
const ACTION_EVENTS = new Set(['card', 'hero-skill', 'item', 'skill', 'awaken']);
// 过量击杀成就所需的最少不同命中数。
export const COMBAT_OVERKILL_HITS = 5;

// events：战斗事件日志；summary：{ outcome, units, controlledId }。
// 返回成就数组：{ id: 'honor-kill' } 与 { id: 'overkill', hits }。
export function combatFeats(events, summary) {
    if (summary?.outcome !== 'victory' || !Array.isArray(events)) return [];
    const units = summary.units || {};
    const controlledId = summary.controlledId;
    // 最后一个敌方单位被击败的事件位置。
    let lastDefeat = -1;
    events.forEach((event, index) => {
        if (event?.type === 'defeated' && units[event.unitId]?.side === 'enemy') lastDefeat = index;
    });
    if (lastDefeat < 0) return [];
    const feats = [];
    const victimId = events[lastDefeat].unitId;
    // 向前找致命一击：对该目标的、非过量的伤害事件。
    let killingBlow = null;
    for (let i = lastDefeat - 1; i >= 0 && !killingBlow; i -= 1) {
        const event = events[i];
        if (event?.type === 'damage' && event.target === victimId && !event.overkill) killingBlow = event;
    }
    // 荣誉击杀：受控单位以普通攻击击杀，且伤害完全落到生命上（未被格挡抵掉）。
    if (killingBlow && killingBlow.kind === 'attack' && killingBlow.source?.unitId === controlledId && killingBlow.hpLoss > 0 && killingBlow.amount - (killingBlow.blocked || 0) === killingBlow.hpLoss) {
        feats.push({ id: 'honor-kill' });
    }
    // 过量击杀：击杀之后，受控单位的过量伤害按「第几个动作 + 打击编号」去重计数。
    const overkillHits = new Set();
    let actionCount = 0;
    for (let i = lastDefeat + 1; i < events.length; i += 1) {
        const event = events[i];
        if (ACTION_EVENTS.has(event?.type)) actionCount += 1;
        else if (event?.type === 'damage' && event.overkill && event.source?.unitId === controlledId) overkillHits.add(`${actionCount}:${event.strike || `e${i}`}`);
    }
    if (overkillHits.size >= COMBAT_OVERKILL_HITS) feats.push({ id: 'overkill', hits: overkillHits.size });
    return feats;
}
