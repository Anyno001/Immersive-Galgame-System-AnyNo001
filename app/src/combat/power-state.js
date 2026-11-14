// 持续能力的展示来源；不参与强度与触发判定。
export function powerName(state, unitId, id) {
    const unit = state.units?.[unitId];
    return state.catalog?.[unitId]?.[id]?.name
        || unit?.skills?.find(item => item.id === id)?.name
        || unit?.passives?.find(item => item.id === id)?.name || id;
}

export function powerCardSource(state, source) {
    if (!source || !['card', 'power', 'buff'].includes(source.kind)) return null;
    return state.catalog?.[source.unitId]?.[source.id]?.type === 'power'
        ? { ownerId: source.unitId, cardId: source.id } : null;
}

export function updatePowerStatuses(unit, status, previous, stacks, source) {
    const stored = unit.res?.powerStatuses?.[status];
    if (!stored && !(source && stacks > previous)) return;
    const groups = stored ? stored.map(group => ({ ...group })) : previous > 0 ? [{ stacks: previous }] : [];
    let delta = stacks - previous;
    if (delta > 0 && source === undefined && groups.length) {
        const originals = groups.slice();
        for (let index = 0; delta > 0; index += 1) {
            const group = originals[index % originals.length];
            const amount = Math.min(delta, group.stacks);
            groups.push({ ...group, stacks: amount });
            delta -= amount;
        }
    } else if (delta > 0) groups.push({ stacks: delta, ...(source || {}) });
    while (delta < 0 && groups.length) {
        const group = groups.at(-1);
        const removed = Math.min(group.stacks, -delta);
        group.stacks -= removed;
        delta += removed;
        if (!group.stacks) groups.pop();
    }
    unit.res ||= {};
    unit.res.powerStatuses ||= {};
    if (groups.some(group => group.cardId)) unit.res.powerStatuses[status] = groups;
    else delete unit.res.powerStatuses[status];
    if (!Object.keys(unit.res.powerStatuses).length) delete unit.res.powerStatuses;
    if (!Object.keys(unit.res).length) delete unit.res;
}
