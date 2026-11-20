import { hash32 } from '../../combat/random.js';
import { currencyNameKey, currencyRecordValue, normalizeCurrencyConfig, normalizeCurrencyRecord } from './stat-currency.js';
import { MONEY_TIERS } from './stat-vocab.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const currencyRevision = record => record ? JSON.stringify(currencyRecordValue(record)) : '';

export function normalizeCurrencyEditInput(raw) {
    if (!object(raw) || Object.keys(raw).some(key => !['name', 'table', 'rate', 'base'].includes(key))
        || typeof raw.base !== 'string' || !raw.base || !object(raw.table)
        || Object.keys(raw.table).length !== MONEY_TIERS.length
        || Object.keys(raw.table).some(key => !MONEY_TIERS.includes(key))
        || MONEY_TIERS.some(key => !Number.isSafeInteger(raw.table[key]) || raw.table[key] <= 0)
        || typeof raw.rate !== 'number' || !Number.isFinite(raw.rate)
        || Math.abs(raw.rate * 100 - Math.round(raw.rate * 100)) > 1e-8) return null;
    const config = normalizeCurrencyConfig(raw);
    return config ? { ...config, base: raw.base } : null;
}

export function normalizeCurrencyEdit(raw) {
    if (!object(raw) || raw.version !== 1 || typeof raw.id !== 'string' || !/^ce-[a-z0-9-]+$/.test(raw.id)
        || typeof raw.chatId !== 'string' || !raw.chatId || !Number.isSafeInteger(raw.createdAt) || raw.createdAt < 0) return null;
    const before = normalizeCurrencyRecord(raw.before), after = normalizeCurrencyRecord(raw.after);
    if (!before?.seeded || !after?.seeded || before.initial !== after.initial || !same(before.seed, after.seed)
        || !Number.isSafeInteger(raw.balance) || raw.balance < 0 || !object(raw.guard)
        || raw.guard.from !== before.name || raw.guard.to !== after.name || raw.guard.balance !== raw.balance
        || raw.fromKey !== currencyNameKey(before.name) || raw.toKey !== currencyNameKey(after.name)
        || raw.guard.version !== 1 || typeof raw.guard.exists !== 'boolean'
        || typeof raw.guard.sourceName !== 'string' || typeof raw.guard.tableName !== 'string' || !raw.guard.tableName
        || !Array.isArray(raw.guard.columns) || !raw.guard.columns.length
        || raw.guard.columns.some(column => typeof column !== 'string')
        || (raw.guard.exists ? !raw.guard.sourceName || !Array.isArray(raw.guard.cells)
            || raw.guard.cells.length !== raw.guard.columns.length
            || raw.guard.cells.some(cell => cell !== null && typeof cell !== 'string')
            : raw.balance !== 0 || raw.guard.cells !== null || raw.guard.sourceName !== '')) return null;
    return { version: 1, id: raw.id, chatId: raw.chatId, createdAt: raw.createdAt,
        before: currencyRecordValue(before), after: currencyRecordValue(after), balance: raw.balance,
        fromKey: raw.fromKey, toKey: raw.toKey, guard: JSON.parse(JSON.stringify(raw.guard)), done: raw.done === true };
}

export function currencyEditRecord(intent, step) {
    const value = step === 'config' ? intent.after : { ...intent, done: step === 'done' };
    const key = step === 'config' ? 'chat:currency' : 'chat:currencyEdit';
    const payload = { key, value };
    return { id: `sc|${intent.id}-${step}|${hash32(JSON.stringify(payload)).toString(36)}`,
        type: 'chat', character: '主角', anchor: null, createdAt: intent.createdAt, change: key, payload };
}
