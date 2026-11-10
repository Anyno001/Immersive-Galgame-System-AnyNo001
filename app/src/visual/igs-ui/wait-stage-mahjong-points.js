import { scmjPointsHand } from './scmj/points-settlement.js';

const fail = reason => ({ ok: false, reason });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createMahjongPointsSession({ factory, saved, evidence, terminal, persist, adapt = scmjPointsHand, changed = () => {} }) {
    const enabled = Boolean(saved?.points || saved?.version === 2 || (!saved && factory));
    const state = { enabled, identity: saved?.points || null, exitRequested: Boolean(saved?.pointsExit),
        busy: false, result: null, error: '', inactive: false };
    const confirmed = new Set();
    let round, flight, ready = false;
    const save = () => {
        try { return persist(); } catch { return fail('points-table-save-failed'); }
    };
    async function work(recovering) {
        if (!round) {
            if (typeof factory !== 'function') return fail('points-table-unavailable');
            const opened = await factory(state.identity || undefined);
            if (!opened?.identity || typeof opened.ready !== 'function') return opened?.ok === false ? opened : fail('points-table-unavailable');
            round = opened;
            state.identity = round.identity;
        }
        const savedBefore = save();
        if (!savedBefore?.ok) return savedBefore || fail('points-table-save-failed');
        let result = await (recovering ? round.retry() : round.ready());
        if (result?.ok && result.inactive) {
            state.inactive = true;
            state.result = result;
            ready = false;
            return result;
        }
        if (!result?.ok || result.skipped) return result || fail('points-write-failed');
        const hands = evidence().map(data => adapt(data));
        const invalid = hands.find(item => !item.ok);
        if (invalid) return invalid;
        for (const recorded of result.round?.hands || []) {
            const found = hands.find(item => item.hand.handId === recorded.handId)?.hand;
            if (!found || !same({ rules: found.rules, legs: found.legs, fan: found.fan, raw: found.raw },
                { rules: recorded.rules, legs: recorded.legs, fan: recorded.fan, raw: recorded.raw })) return fail('points-mahjong-save-conflict');
            confirmed.add(recorded.handId);
        }
        for (const { hand } of hands) {
            if (confirmed.has(hand.handId)) continue;
            if (result.settled) return fail('points-mahjong-save-conflict');
            result = await round.hand(hand);
            if (!result?.ok || result.skipped) return result || fail('points-write-failed');
            confirmed.add(hand.handId);
        }
        if ((state.exitRequested || terminal()) && !result.settled) {
            if (!hands.length) return fail('points-hand-unfinished');
            result = await round.settle();
            if (!result?.ok || result.skipped) return result || fail('points-write-failed');
        }
        state.result = result;
        ready = true;
        const savedAfter = save();
        return savedAfter?.ok ? result : savedAfter || fail('points-table-save-failed');
    }

    const run = recovering => {
        if (!enabled) return Promise.resolve({ ok: true, skipped: true });
        if (flight) return flight;
        state.busy = true;
        state.error = '';
        flight = Promise.resolve().then(() => work(recovering)).catch(() => fail('points-write-failed'))
            .then(result => {
                if (!result?.ok || (result.skipped && !result.inactive)) state.error = result?.reason || 'points-round-stale';
                return result;
            }).finally(() => { state.busy = false; flight = null; changed(); });
        return flight;
    };
    return {
        state,
        allowed() { return !enabled || (ready && !state.inactive && !state.busy && !state.error && !state.result?.settled
            && !state.exitRequested && evidence().length === confirmed.size); },
        checkpoint() {
            const result = state.inactive ? { ok: true, unchanged: true } : save();
            if (enabled && !result?.ok) {
                ready = false;
                state.error = result?.reason || 'points-table-save-failed';
            }
            return result;
        },
        sync: () => run(false),
        retry: () => run(true),
        async reconnect() {
            ready = false;
            if (flight) await flight;
            round = null;
            confirmed.clear();
            return run(true);
        },
        async exit() {
            if (!enabled) return { ok: true, skipped: true };
            if (flight) await flight;
            state.exitRequested = true;
            const written = save();
            if (!written?.ok) { state.error = written?.reason || 'points-table-save-failed'; changed(); return written; }
            return run(true);
        },
    };
}
