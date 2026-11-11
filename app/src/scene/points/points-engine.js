import { activePointsAnchor, GAME_IDS, gameAllowance, gameReward, mahjongHandAmount, newPointsId, pointFloors, pointsSwipe } from './points-policy.js';
import { foldPointsRecords, pointsRecord } from './points-log.js';
import { createPointsExchange } from './points-exchange.js';

const fail = reason => ({ ok: false, reason });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createPointsEngine({ store, floors, chat, chatId, lock, wallet, intents }) {
    function lease() {
        const id = chatId(), db = store(), path = chat();
        return { id, db, valid: () => chatId() === id && store() === db && chat() === path };
    }
    let waiting = 0, working = 0, phase = '';
    function run(task) {
        const held = lease();
        waiting += 1;
        return lock(async () => {
            waiting -= 1;
            working += 1;
            try { return held.valid() ? await task(held) : fail('request-stale'); }
            finally { working -= 1; phase = ''; }
        });
    }
    const stage = () => (working ? phase || 'points-writing' : waiting ? 'points-lock-busy' : '');
    function pending(held) { return intents.read(held.id); }
    function view(state, roundId) {
        const round = state.rounds.get(roundId);
        return round ? { ok: true, roundId, round, amount: round.total, settled: round.settled,
            approved: round.approved, limitReason: round.limitReason } : fail('points-round-missing');
    }
    async function commit(held, record, { recovering = false, shouldStart = () => true } = {}) {
        if (!held.valid() || !shouldStart()) return fail('request-stale');
        const before = held.db.read({ fresh: true, intent: record });
        if (!before.ok) return before;
        const present = before.rows.some(row => row.id === record.id);
        const active = activePointsAnchor(record.payload.anchor, chat());
        const exchange = ['exchange', 'exchange-done'].includes(record.payload.kind);
        const finishing = record.payload.kind === 'exchange-done'
            && before.exchanges.get(record.payload.sourceId)?.record.id === record.payload.parent;
        if (!active && !recovering && !finishing) return fail('request-stale');
        if (!active && !present && !before.incomplete && !finishing) {
            const cleared = intents.save(held.id, null);
            return cleared.ok ? { ...before, skipped: true } : cleared;
        }
        const trial = foldPointsRecords(present ? before.rows : [...before.rows, record], chat(), held.id);
        if (!trial.ok) return trial;
        const saved = intents.save(held.id, record);
        if (!saved.ok) return saved;
        const valid = () => held.valid() && shouldStart() && (recovering || finishing || activePointsAnchor(record.payload.anchor, chat()));
        const written = await held.db.commit(record, { shouldStart: valid });
        if (!written?.ok || !held.valid() || !shouldStart()) return written?.ok ? fail('request-stale') : written;
        const cleared = intents.save(held.id, null);
        if (!cleared.ok) return cleared;
        return exchange || activePointsAnchor(record.payload.anchor, chat()) ? written : { ...written, skipped: true };
    }
    async function fresh(held) {
        const heldIntent = pending(held);
        if (!heldIntent.ok) return heldIntent;
        if (heldIntent.record) return fail('points-intent-pending');
        const result = typeof held.db.load === 'function'
            ? await held.db.load({ shouldStart: held.valid })
            : held.db.read({ fresh: true });
        return held.valid() ? result : fail('request-stale');
    }
    function recordFor(held, round, payload) {
        return pointsRecord({ sourceId: round.id, chatId: held.id, anchor: round.anchor, parent: round.revision, ...payload });
    }
    function blocked(state) {
        return [...state.exchanges.values()].some(e => e.chatId === chatId() && !e.done)
            || [...state.rounds.values()].some(r => r.active && r.game === 'mahjong' && !r.settled
            && (r.closing || (r.hands.length && !r.checked)));
    }
    async function close(held, state, round, reason, balance) {
        if (!round.closing) {
            const result = await commit(held, recordFor(held, round, { kind: 'close', amount: round.total, reason,
                ...(reason === 'insufficient' && { balance }) }));
            if (!result.ok) return result;
            state = result; round = state.rounds.get(round.id);
        }
        const result = await commit(held, recordFor(held, round, { kind: 'settle', amount: round.total }));
        return result.ok ? view(result, round.id) : result;
    }
    async function checkHand(held, state, round) {
        if (round.settled || !round.hands.length) return view(state, round.id);
        if (round.closing) return close(held, state, round, round.closeReason);
        if (round.checked) return view(state, round.id);
        const balance = await wallet();
        if (!held.valid()) return fail('request-stale');
        if (!balance?.ok) return balance || fail('points-wallet-unavailable');
        if (round.total < 0 && -round.total > balance.balance) return close(held, state, round, 'insufficient', balance.balance);
        const result = await commit(held, recordFor(held, round, { kind: 'check', handId: round.hands.at(-1).handId,
            balance: balance.balance }));
        return result.ok ? view(result, round.id) : result;
    }

    function start({ game, messageId, roundId, sourceId, rules, anchor } = {}) {
        const path = chat();
        const floor = messageId === undefined ? pointFloors(path).at(-1) : pointFloors(path).find(f => f.messageId === messageId);
        const message = floor && path[floor.messageId];
        const swipeId = floor?.swipeId;
        return run(async held => {
            const state = await fresh(held);
            if (!state.ok) return state;
            const existingId = roundId || sourceId;
            if (roundId || (sourceId && state.rounds.has(sourceId))) {
                const round = state.rounds.get(existingId);
                if (!round?.active || round.game !== game || (game === 'mahjong' && round.rules !== rules)) return fail('points-round-stale');
                if (anchor && !same(round.anchor, anchor)) return fail('points-round-stale');
                return game === 'mahjong' ? checkHand(held, state, round) : view(state, existingId);
            }
            if (sourceId !== undefined && (typeof sourceId !== 'string' || !sourceId)) return fail('points-round-stale');
            if (!GAME_IDS.includes(game)) return fail('points-game-invalid');
            if (blocked(state)) return fail('points-settlement-pending');
            if (game === 'mahjong') {
                if (!['chengdu', 'riichi'].includes(rules)) return fail('points-rules-unavailable');
                if ([...state.rounds.values()].some(r => r.active && r.game === game && !r.settled)) return fail('points-table-open');
                const balance = await wallet();
                if (!balance.ok) return balance;
                if (balance.balance <= 0) return fail('points-insufficient');
            }
            if (typeof floors?.ensure !== 'function') return fail('points-floor-unsupported');
            if (!message) return fail('points-floor-missing');
            const at = path.indexOf(message);
            if (at < 0 || pointsSwipe(message) !== swipeId || !pointFloors(path).some(f => f.messageId === at)) return fail('request-stale');
            phase = 'points-floor-saving';
            const bound = await floors.ensure(at);
            phase = '';
            if (!bound.ok || !held.valid()) return bound.ok ? fail('request-stale') : bound;
            if (bound.anchor.swipeId !== swipeId) return fail('request-stale');
            if (anchor && !same(bound.anchor, anchor)) return fail('points-round-stale');
            const record = pointsRecord({ sourceId: sourceId || newPointsId(), chatId: held.id, anchor: bound.anchor,
                parent: null, kind: 'start', game, ...(game === 'mahjong' && { rules }) });
            const result = await commit(held, record);
            return result.ok ? view(result, record.payload.sourceId) : { ...result, roundId: record.payload.sourceId };
        });
    }
    function award(roundId, result) {
        if (!object(result)) return Promise.resolve(fail('points-result-invalid'));
        return run(async held => {
            const state = await fresh(held);
            if (!state.ok) return state;
            const round = state.rounds.get(roundId);
            if (!round?.active || round.game === 'mahjong') return fail('points-round-stale');
            if (round.settled) return same(round.result, result) ? { ...view(state, roundId), present: true } : fail('points-result-conflict');
            const approved = gameReward(round.game, result);
            const allowance = gameAllowance(chat(), state.grants, round.anchor, round.game);
            const amount = Math.min(approved, allowance);
            const record = recordFor(held, round, { kind: 'award', result, approved, amount,
                limitReason: amount < approved ? 'points-game-limit' : '' });
            const written = await commit(held, record);
            return written.ok ? view(written, roundId) : written;
        });
    }
    function hand(roundId, { handId, rules, legs, fan, raw } = {}) {
        if (typeof handId !== 'string' || !handId || !object(raw) || !['chengdu', 'riichi'].includes(rules)) {
            return Promise.resolve(fail('points-mahjong-invalid'));
        }
        return run(async held => {
            let state = await fresh(held);
            if (!state.ok) return state;
            let round = state.rounds.get(roundId);
            if (!round?.active || round.game !== 'mahjong') return fail('points-round-stale');
            const previous = round.hands.find(h => h.handId === handId);
            if (previous) {
                if (!same({ rules, legs, fan, raw }, { rules: previous.rules, legs: previous.legs, fan: previous.fan, raw: previous.raw })) return fail('points-result-conflict');
            } else {
                if (round.settled || round.closing || rules !== round.rules) return fail('points-round-closed');
                let amount;
                try { amount = mahjongHandAmount({ rules, legs, fan }); } catch { return fail('points-mahjong-invalid'); }
                const written = await commit(held, recordFor(held, round, { kind: 'hand', handId,
                    index: round.hands.length, rules, ...(rules === 'riichi' ? { fan } : { legs }), raw, amount }));
                if (!written.ok) return written;
                state = written;
                round = written.rounds.get(roundId);
            }
            if (round.settled) return { ...view(state, roundId), present: true };
            return checkHand(held, state, round);
        });
    }
    function settle(roundId) {
        return run(async held => {
            const state = await fresh(held);
            if (!state.ok) return state;
            const round = state.rounds.get(roundId);
            if (!round?.active || round.game !== 'mahjong' || !round.hands.length) return fail('points-round-stale');
            return round.settled ? { ...view(state, roundId), present: true } : close(held, state, round, 'manual');
        });
    }
    function retry() {
        return run(async held => {
            const saved = pending(held);
            if (!saved.ok) return saved;
            let state;
            if (saved.record) {
                if (['exchange', 'exchange-done'].includes(saved.record.payload.kind)) return fail('points-exchange-pending');
                state = await commit(held, saved.record, { recovering: true });
                if (!state.ok) return state;
            } else {
                state = await fresh(held);
                if (!state.ok) return state;
            }
            if (state.skipped) return { ok: true, skipped: true };
            const unchecked = [...state.rounds.values()].find(r => r.active && r.game === 'mahjong' && !r.settled
                && (r.closing || (r.hands.length && !r.checked)));
            if (unchecked) return checkHand(held, state, unchecked);
            return saved.record ? view(state, saved.record.payload.sourceId) : { ok: true, unchanged: true };
        });
    }
    function spendingGate() {
        const held = lease(), saved = pending(held);
        if (!saved.ok) return saved;
        if (saved.record) return fail('points-intent-pending');
        const state = held.db.read();
        return !state.ok ? state : blocked(state) ? fail('points-settlement-pending') : { ok: true };
    }
    const exchange = createPointsExchange({ run, fresh, commit, blocked, wallet, chat, floors, pending });
    return { start, award, hand, settle, retry, spendingGate, stage, ...exchange,
        read: () => store().read(), pending: () => intents.read(chatId()) };
}
