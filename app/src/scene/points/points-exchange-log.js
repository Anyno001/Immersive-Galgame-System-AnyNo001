import { currencyForPoints, normalizeCurrencyConfig, normalizeCurrencyWrite } from '../stats/stat-currency.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function applyPointsExchange(exchanges, rounds, row) {
    const p = row.payload;
    if (p.kind === 'exchange') {
        const config = normalizeCurrencyConfig(p.currency), write = normalizeCurrencyWrite(p.write);
        const points = -p.amount, amount = currencyForPoints(config, points);
        if (exchanges.has(p.sourceId) || rounds.has(p.sourceId) || p.parent !== null
            || !Number.isSafeInteger(points) || points <= 0 || !Number.isSafeInteger(amount) || amount <= 0
            || !config || !same(config, p.currency) || !write || !same(write, p.write)
            || write.after - write.before !== amount || !Number.isSafeInteger(p.balanceBefore) || p.balanceBefore < points) return false;
        exchanges.set(p.sourceId, { id: p.sourceId, record: row, chatId: p.chatId, anchor: p.anchor,
            points, amount, currency: config, write, done: false });
        return true;
    }
    const exchange = exchanges.get(p.sourceId);
    if (p.kind !== 'exchange-done' || !exchange || exchange.done || p.parent !== exchange.record.id
        || p.chatId !== exchange.chatId || !same(p.anchor, exchange.anchor) || p.amount !== 0) return false;
    exchange.done = true;
    return true;
}
