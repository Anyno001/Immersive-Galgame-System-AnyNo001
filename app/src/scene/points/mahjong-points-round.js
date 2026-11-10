const fail = reason => ({ ok: false, reason });
const copy = value => JSON.parse(JSON.stringify(value));

export function createMahjongPointsRound({ engine, identity, start, valid, sameChat = valid }) {
    let action = null, flight = null;
    const run = recovering => {
        if (flight) return flight;
        flight = (async () => {
            if (!sameChat()) return fail('request-stale');
            try {
                const pending = engine.pending();
                if (!pending.ok) return pending;
                if (pending.record) {
                    if (pending.record.payload.sourceId !== identity.roundId) return fail('points-intent-pending');
                    if (!recovering) return fail('points-intent-pending');
                    const restored = await engine.retry();
                    if (!restored.ok) return restored;
                    if (!sameChat()) return fail('request-stale');
                }
                if (!valid()) {
                    action = null;
                    return { ok: true, skipped: true, inactive: true, roundId: identity.roundId };
                }
                const opened = await start();
                if (!opened.ok || opened.skipped || !valid()) return valid() ? opened : fail('request-stale');
                const result = action?.kind === 'hand' ? await engine.hand(identity.roundId, action.value)
                    : action?.kind === 'settle' ? await engine.settle(identity.roundId) : opened;
                if (!valid()) return fail('request-stale');
                if (result.ok && !result.skipped) action = null;
                return result;
            } catch { return fail('points-write-failed'); }
        })().finally(() => { flight = null; });
        return flight;
    };
    const submit = next => {
        if (action && JSON.stringify(action) !== JSON.stringify(next)) return Promise.resolve(fail('points-settlement-pending'));
        if (flight) return Promise.resolve(fail('points-settlement-pending'));
        action = copy(next);
        return run(false);
    };
    return Object.freeze({
        identity: Object.freeze(copy(identity)),
        ready: () => run(true),
        hand: value => submit({ kind: 'hand', value }),
        settle: () => submit({ kind: 'settle' }),
        retry: () => run(true),
    });
}
