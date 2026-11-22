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
    function run(task, { locked = false } = {}) {
        const held = lease();
        const exec = async () => {
            working += 1;
            try { return held.valid() ? await task(held) : fail('request-stale'); }
            finally { working -= 1; phase = ''; }
        };
        if (locked) return Promise.resolve().then(exec);
        waiting += 1;
        return lock(async () => {
            waiting -= 1;
            return exec();
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
        // 同一把锁里 fresh() 刚读过；任何写入都会作废共享缓存，写入队列判重另读新数据。
        const before = held.db.read({ intent: record });
        if (!before.ok) return before;
        const present = before.rows.some(row => row.id === record.id);
        const active = activePointsAnchor(record.payload.anchor, chat());
        const exchange = ['exchange', 'exchange-done'].includes(record.payload.kind);
        const operation = ['debit', 'debit-done'].includes(record.payload.kind);
        const finishing = (record.payload.kind === 'exchange-done'
            && before.exchanges.get(record.payload.sourceId)?.record.id === record.payload.parent)
            || (record.payload.kind === 'debit-done'
                && before.operations?.get(record.payload.sourceId)?.record.id === record.payload.parent);
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
        return exchange || operation || activePointsAnchor(record.payload.anchor, chat()) ? written : { ...written, skipped: true };
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
            || [...(state.operations?.values() || [])].some(op => op.chatId === chatId() && !op.done)
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
    async function resolveFloorAnchor(held, { messageId, anchor, shouldStart = () => true } = {}) {
        const path = chat();
        if (anchor && typeof anchor.floorId === 'string' && anchor.floorId && Number.isSafeInteger(anchor.swipeId) && anchor.swipeId >= 0) {
            return activePointsAnchor(anchor, path) ? { ok: true, anchor } : fail('request-stale');
        }
        const source = messageId === undefined ? pointFloors(path).at(-1) : pointFloors(path).find(f => f.messageId === messageId);
        const message = source && path[source.messageId];
        if (!message || !path.includes(message) || pointsSwipe(message) !== source.swipeId) return fail('points-floor-missing');
        if (source.floorId) return { ok: true, anchor: { floorId: source.floorId, swipeId: source.swipeId } };
        if (typeof floors?.ensure !== 'function') return fail('points-floor-unsupported');
        phase = 'points-floor-saving';
        const bound = await floors.ensure(path.indexOf(message));
        phase = '';
        if (!bound?.ok || !held.valid() || !shouldStart()) return bound?.ok ? fail('request-stale') : (bound || fail('points-floor-save-failed'));
        if (bound.anchor.swipeId !== source.swipeId || !activePointsAnchor(bound.anchor, path)) return fail('request-stale');
        return { ok: true, anchor: bound.anchor };
    }

    function ensure() {
        return run(async held => fresh(held));
    }

    function credit({ sourceId, domain, amount, messageId, anchor, meta = null, shouldStart = () => true, locked = false } = {}) {
        if (typeof sourceId !== 'string' || !sourceId || !['combat', 'origin'].includes(domain)
            || !Number.isSafeInteger(amount) || amount < 0) {
            return Promise.resolve(fail('points-credit-invalid'));
        }
        return run(async held => {
            if (!shouldStart()) return fail('request-stale');
            const state = await fresh(held);
            if (!state.ok) return state;
            const existing = state.credits?.get(sourceId);
            if (existing) {
                return existing.domain === domain && existing.amount === amount && existing.chatId === held.id
                    && (!anchor || same(existing.anchor, anchor))
                    ? { ok: true, present: true, sourceId, amount: existing.amount, balance: state.balance }
                    : fail('points-log-conflict');
            }
            const resolved = await resolveFloorAnchor(held, { messageId, anchor, shouldStart });
            if (!resolved.ok) return resolved;
            const record = pointsRecord({
                sourceId, chatId: held.id, anchor: resolved.anchor, parent: null,
                kind: 'credit', domain, amount, ...(meta ? { meta } : {}),
            });
            const written = await commit(held, record, { shouldStart });
            return written.ok ? { ok: true, sourceId, amount, balance: written.balance, record } : written;
        }, { locked });
    }

    async function finishOperation(held, op, { apply, shouldStart = () => true } = {}) {
        if (op.done) return { ok: true, present: true, sourceId: op.id, cost: op.cost, done: true };
        if (!held.valid() || !shouldStart()) return fail('request-stale');
        if (typeof apply !== 'function') return fail('points-operation-apply-missing');
        let applied;
        try { applied = await apply(op); }
        catch { applied = fail('points-operation-apply-failed'); }
        if (!held.valid() || !shouldStart()) return fail('request-stale');
        if (applied?.ok === false) return { ...applied, ok: false, stage: 'apply', sourceId: op.id, pendingOperation: op };
        const doneRecord = pointsRecord({
            sourceId: op.id, chatId: held.id, anchor: op.anchor,
            parent: op.record.id, kind: 'debit-done', amount: 0,
        });
        const done = await commit(held, doneRecord, { recovering: true, shouldStart });
        if (!done.ok) return { ...done, stage: 'receipt', sourceId: op.id, applied };
        return { ok: true, sourceId: op.id, cost: op.cost, balance: done.balance, done: true, applied };
    }

    function spend({ sourceId, domain, cost, action, messageId, anchor, meta = null, apply, shouldStart = () => true, locked = false } = {}) {
        if (typeof sourceId !== 'string' || !sourceId || !['combat', 'origin'].includes(domain)
            || !Number.isSafeInteger(cost) || cost <= 0 || typeof action !== 'string' || !action
            || typeof apply !== 'function') {
            return Promise.resolve(fail('points-debit-invalid'));
        }
        return run(async held => {
            if (!shouldStart()) return fail('request-stale');
            const state = await fresh(held);
            if (!state.ok) return state;
            const existing = state.operations?.get(sourceId);
            if (existing) {
                if (existing.domain !== domain || existing.cost !== cost || existing.action !== action
                    || existing.chatId !== held.id || (anchor && !same(existing.anchor, anchor))) {
                    return fail('points-log-conflict');
                }
                return finishOperation(held, existing, { apply, shouldStart });
            }
            if (blocked(state)) return fail('points-settlement-pending');
            const balance = await wallet();
            if (!held.valid() || !shouldStart()) return fail('request-stale');
            if (!balance?.ok) return balance || fail('points-wallet-unavailable');
            if (balance.balance < cost) return fail('points-insufficient');
            const resolved = await resolveFloorAnchor(held, { messageId, anchor, shouldStart });
            if (!resolved.ok) return resolved;
            const record = pointsRecord({
                sourceId, chatId: held.id, anchor: resolved.anchor, parent: null,
                kind: 'debit', domain, amount: -cost, balanceBefore: balance.balance,
                action, ...(meta ? { meta } : {}),
            });
            const written = await commit(held, record, { shouldStart });
            if (!written.ok) return { ...written, stage: 'debit', sourceId };
            const op = written.operations.get(sourceId);
            return finishOperation(held, op, { apply, shouldStart });
        }, { locked });
    }

    function recoverOperation(sourceId, { apply, shouldStart = () => true, locked = false } = {}) {
        if (typeof sourceId !== 'string' || !sourceId || typeof apply !== 'function') {
            return Promise.resolve(fail('points-debit-invalid'));
        }
        return run(async held => {
            if (!shouldStart()) return fail('request-stale');
            const saved = pending(held);
            if (!saved.ok) return saved;
            let state;
            if (saved.record && ['debit', 'debit-done'].includes(saved.record.payload.kind) && saved.record.payload.sourceId === sourceId) {
                state = await commit(held, saved.record, { recovering: true, shouldStart });
                if (!state.ok) return state;
            } else {
                state = await fresh(held);
                if (!state.ok) return state;
            }
            const op = state.operations?.get(sourceId);
            if (!op) return { ok: true, missing: true };
            return finishOperation(held, op, { apply, shouldStart });
        }, { locked });
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
            if (saved.record && ['credit', 'debit', 'debit-done'].includes(saved.record.payload.kind)) {
                return { ok: true, sourceId: saved.record.payload.sourceId, balance: state.balance };
            }
            return saved.record ? view(state, saved.record.payload.sourceId) : { ok: true, unchanged: true };
        });
    }
    function spendingGate() {
        const held = lease(), saved = pending(held);
        if (!saved.ok) return saved;
        if (saved.record) return fail('points-intent-pending');
        const state = held.db.read();
        if (!state.ok) {
            if (state.reason === 'points-table-missing') return { ok: true };
            return state;
        }
        return blocked(state) ? fail('points-settlement-pending') : { ok: true };
    }
    const exchange = createPointsExchange({ run, fresh, commit, blocked, wallet, chat, floors, pending });
    return { start, award, hand, settle, retry, spendingGate, stage, ensure, credit, spend, recoverOperation, ...exchange,
        read: () => store().read(), pending: () => intents.read(chatId()) };
}
