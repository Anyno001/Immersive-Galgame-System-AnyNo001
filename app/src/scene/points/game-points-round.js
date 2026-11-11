const fail = reason => ({ ok: false, reason });
const copy = value => JSON.parse(JSON.stringify(value));

export function createGamePointsRound({ engine, start, valid = () => true }) {
    const safe = async task => {
        if (!valid()) return fail('request-stale');
        try {
            const result = await task();
            return valid() ? result : fail('request-stale');
        } catch { return fail('points-write-failed'); }
    };
    let opened;
    const opening = safe(start).then(result => { opened = result; return result; });
    let result;
    let confirmed;
    let flight;
    const run = recovering => {
        if (flight) return flight;
        flight = safe(async () => {
            await opening;
            if (confirmed) return confirmed;
            if (recovering) {
                const pending = engine.pending();
                if (!pending.ok) return pending;
                if (pending.record) {
                    if (!opened?.roundId || pending.record.payload.sourceId !== opened.roundId) return fail('points-intent-pending');
                    const restored = await engine.retry();
                    if (!restored.ok || restored.skipped) return restored;
                    opened = restored;
                } else if (!opened?.ok) {
                    opened = await start(opened?.roundId);
                }
            }
            if (!opened?.ok) return opened;
            if (!result) return opened;
            const written = await engine.award(opened.roundId, result);
            if (written.ok && !written.skipped) confirmed = written;
            return written;
        }).finally(() => { flight = null; });
        return flight;
    };
    return Object.freeze({
        finish(value) {
            if (result && JSON.stringify(value) !== JSON.stringify(result)) return Promise.resolve(fail('points-result-conflict'));
            result ||= copy(value);
            return run(false);
        },
        retry: () => run(true),
        stage: () => (typeof engine.stage === 'function' ? engine.stage() : ''),
    });
}
