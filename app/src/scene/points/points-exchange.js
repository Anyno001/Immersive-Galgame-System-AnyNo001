import { activePointsAnchor, newPointsId, pointFloors, pointsSwipe } from './points-policy.js';
import { pointsRecord } from './points-log.js';
import { currencyForPoints, normalizeCurrencyConfig } from '../stats/stat-currency.js';

const fail = reason => ({ ok: false, reason });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exchangeKind = record => ['exchange', 'exchange-done'].includes(record?.payload?.kind);
const view = exchange => ({ ok: true, exchangeId: exchange.id, points: exchange.points,
    amount: exchange.amount, name: exchange.currency.name, done: exchange.done });

export function createPointsExchange({ run, fresh, commit, blocked, wallet, chat, floors, pending }) {
    function updateWallet(task) {
        return run(async held => {
            const result = await task(held);
            if (!held.valid()) return fail('request-stale');
            await wallet();
            return held.valid() ? result : fail('request-stale');
        });
    }
    function quoteExchange(points, currency) {
        const path = chat(), source = pointFloors(path).at(-1), message = source && path[source.messageId];
        const config = normalizeCurrencyConfig(currency), amount = currencyForPoints(config, points);
        if (!Number.isSafeInteger(points) || points <= 0) return Promise.resolve(fail('points-exchange-invalid'));
        if (!Number.isSafeInteger(amount) || amount <= 0) return Promise.resolve(fail('points-exchange-too-small'));
        return run(async held => {
            const state = await fresh(held);
            if (!state.ok) return state;
            if (blocked(state)) return fail('points-settlement-pending');
            const balance = await wallet();
            if (!held.valid()) return fail('request-stale');
            if (!balance.ok) return balance;
            if (balance.balance < points) return fail('points-insufficient');
            if (!message || !path.includes(message) || pointsSwipe(message) !== source.swipeId) return fail('points-floor-missing');
            if (typeof floors?.ensure !== 'function') return fail('points-floor-unsupported');
            const bound = await floors.ensure(path.indexOf(message));
            if (!bound.ok) return bound;
            if (!held.valid() || !activePointsAnchor(bound.anchor, path) || bound.anchor.swipeId !== source.swipeId) return fail('request-stale');
            return { ok: true, exchangeId: newPointsId(), chatId: held.id, anchor: bound.anchor, points, amount, currency: config };
        });
    }
    async function finish(held, exchange, { credit, shouldStart }) {
        if (exchange.done) return { ...view(exchange), present: true };
        if (!held.valid() || !shouldStart()) return fail('request-stale');
        const paid = await credit(exchange);
        if (!paid?.ok) return paid || fail('points-exchange-credit-failed');
        if (!held.valid() || !shouldStart()) return fail('request-stale');
        const record = pointsRecord({ sourceId: exchange.id, chatId: held.id, anchor: exchange.anchor,
            parent: exchange.record.id, kind: 'exchange-done', amount: 0 });
        const done = await commit(held, record, { recovering: true, shouldStart });
        return done.ok ? view(done.exchanges.get(exchange.id)) : done;
    }

    function exchange(quote, { prepare, credit, shouldStart = () => true } = {}) {
        const config = normalizeCurrencyConfig(quote?.currency);
        if (!quote || typeof quote.exchangeId !== 'string' || !quote.exchangeId || !config
            || !Number.isSafeInteger(quote.points) || quote.points <= 0
            || currencyForPoints(config, quote.points) !== quote.amount
            || !Number.isSafeInteger(quote.amount) || quote.amount <= 0
            || typeof prepare !== 'function' || typeof credit !== 'function') return Promise.resolve(fail('points-exchange-invalid'));
        return updateWallet(async held => {
            if (quote.chatId !== held.id || !shouldStart()) return fail('request-stale');
            const state = await fresh(held);
            if (!state.ok) return state;
            const existing = state.exchanges.get(quote.exchangeId);
            if (existing) {
                if (existing.points !== quote.points || !same(existing.currency, config)
                    || !same(existing.anchor, quote.anchor) || existing.chatId !== held.id) return fail('points-exchange-conflict');
                return finish(held, existing, { credit, shouldStart });
            }
            if (blocked(state)) return fail('points-settlement-pending');
            if (!activePointsAnchor(quote.anchor, chat())) return fail('request-stale');
            const balance = await wallet();
            if (!held.valid() || !shouldStart()) return fail('request-stale');
            if (!balance?.ok) return balance || fail('points-wallet-unavailable');
            if (balance.balance < quote.points) return fail('points-insufficient');
            const prepared = await prepare(quote);
            if (!prepared?.ok) return prepared || fail('points-exchange-currency-unavailable');
            const record = pointsRecord({ sourceId: quote.exchangeId, chatId: held.id, anchor: quote.anchor,
                parent: null, kind: 'exchange', amount: -quote.points, balanceBefore: balance.balance,
                currency: config, write: prepared.write });
            const written = await commit(held, record, { shouldStart: () => shouldStart() && activePointsAnchor(quote.anchor, chat()) });
            return written.ok ? finish(held, written.exchanges.get(quote.exchangeId), { credit, shouldStart }) : written;
        });
    }
    function recoverExchanges({ credit, shouldStart = () => true } = {}) {
        return updateWallet(async held => {
            if (!shouldStart() || typeof credit !== 'function') return fail('request-stale');
            const saved = pending(held);
            if (!saved.ok) return saved;
            if (saved.record && !exchangeKind(saved.record)) {
                const state = held.db.read({ fresh: true, intent: saved.record });
                if (!state.ok) return state;
                return [...state.exchanges.values()].some(item => item.chatId === held.id && !item.done)
                    ? fail('points-exchange-pending') : { ok: true, skipped: true };
            }
            const state = saved.record
                ? await commit(held, saved.record, { recovering: true, shouldStart }) : await fresh(held);
            if (!state.ok || state.skipped) return state;
            const recovered = [];
            for (const item of state.exchanges.values()) {
                if (item.chatId !== held.id || (item.done && item.id !== saved.record?.payload.sourceId)) continue;
                const result = await finish(held, item, { credit, shouldStart });
                if (!result.ok) return result;
                recovered.push(result);
            }
            return { ok: true, recovered };
        });
    }
    return { quoteExchange, exchange, recoverExchanges };
}
