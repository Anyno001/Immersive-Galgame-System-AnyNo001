import { currencyEditRecord, currencyRevision, normalizeCurrencyEdit, normalizeCurrencyEditInput } from '../scene/stats/stat-currency-edit.js';
import { mergeStatLog } from '../scene/stats/stat-log.js';
import { currencyNameKey, normalizeCurrencyRecord } from '../scene/stats/stat-currency.js';

const fail = reason => ({ ok: false, stage: 'edit', reason });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const original = intent => intent && { ...intent, done: false };

export function createCurrencyEditor({ tables, inventory, intents, chatId, chat, adopt }) {
    function read(alive, intent = null) {
        if (!alive()) return fail('request-stale');
        const db = tables();
        if (!db.ok) return fail(db.reason);
        db.invalidate?.();
        const rows = db.read({ kinds: ['stats'] });
        if (!alive()) return fail('request-stale');
        if (!rows?.ok || !Array.isArray(rows.stats)) return fail(rows?.reason || 'stats-log-read-failed');
        const merged = mergeStatLog(rows.stats, { chatId: chatId(), chat: chat() });
        if (merged.currencyEditError) return fail(merged.currencyEditError);
        if (merged.currencyEdit && merged.currencyEdit.chatId !== chatId()) return fail('stats-currency-edit-conflict');
        const pending = intent || (merged.currencyEdit && !merged.currencyEdit.done ? original(merged.currencyEdit) : null);
        const expected = pending ? ['intent', 'config', 'done'].map(step => currencyEditRecord(pending, step)) : [];
        const broken = (rows.diagnostics || []).filter(d => d.kind === 'stats' && String(d.key || '').startsWith('sc|ce-'));
        for (const issue of broken) {
            const record = expected.find(item => item.id === issue.key);
            if (issue.code !== 'combat-row-segment-incomplete' || !record || db.matchesIncomplete?.(record) !== true)
                return fail('stats-currency-edit-log-conflict');
        }
        adopt(merged);
        return { ok: true, db, rows: rows.stats, merged };
    }

    function baseOf(state) {
        const row = state.rows.filter(item => item.payload?.key === 'chat:currency').at(-1);
        return JSON.stringify([chatId(), row?.id || '', currencyRevision(state.merged.currency)]);
    }

    async function append(intent, step, alive) {
        let state = read(alive, intent);
        if (!state.ok) return state;
        const record = currencyEditRecord(intent, step);
        const existing = state.rows.find(item => item.id === record.id);
        if (existing && !same(existing, record)) return fail('stats-currency-edit-log-conflict');
        if (!existing) {
            try { await state.db.append([record], { shouldStart: alive, retainOnFailure: false, refresh: false, recoverSegments: true }); }
            catch { /* 写入结果以权威读回为准 */ }
            state = read(alive, intent);
            if (!state.ok) return state;
            if (!state.rows.some(item => same(item, record))) return fail('stats-currency-save-unverified');
        }
        return state;
    }

    async function recover(alive) {
        const saved = intents ? intents.read(chatId()) : { ok: true, intent: null };
        if (!saved.ok) return fail(saved.reason);
        let state = read(alive, saved.intent);
        if (!state.ok) return state;
        const stored = state.merged.currencyEdit;
        const matching = stored?.id === saved.intent?.id;
        if (saved.intent && stored && (matching ? !same(saved.intent, original(stored)) : !stored.done)) return fail('stats-currency-edit-conflict');
        const intent = saved.intent || (stored && !stored.done ? original(stored) : null);
        if (!intent) return { ok: true, skipped: true };
        if (intent.chatId !== chatId()) return fail('stats-currency-edit-conflict');
        if (matching && stored.done) {
            if (currencyRevision(state.merged.currency) !== currencyRevision(intent.after)) return fail('stats-currency-edit-conflict');
            return clear(intent, alive);
        }
        const current = currencyRevision(state.merged.currency);
        if (![currencyRevision(intent.before), currencyRevision(intent.after)].includes(current)) return fail('stats-currency-edit-conflict');
        if (!stored || stored.id !== intent.id) {
            if (current !== currencyRevision(intent.before)) return fail('stats-currency-edit-conflict');
            state = await append(intent, 'intent', alive);
            if (!state.ok) return state;
        }
        const inv = inventory();
        if (typeof inv?.rename !== 'function') return fail('stats-currency-edit-unsupported');
        const renamed = await inv.rename(intent.guard, { shouldStart: alive });
        if (!alive()) return fail('request-stale');
        if (!renamed?.ok) return fail(renamed?.reason || 'inventory-write-unverified');
        state = read(alive, intent);
        if (!state.ok) return state;
        if (currencyRevision(state.merged.currency) === currencyRevision(intent.before)) {
            state = await append(intent, 'config', alive);
            if (!state.ok) return state;
        }
        if (currencyRevision(state.merged.currency) !== currencyRevision(intent.after)) return fail('stats-currency-edit-conflict');
        state = await append(intent, 'done', alive);
        if (!state.ok) return state;
        if (!same(state.merged.currencyEdit, { ...intent, done: true })) return fail('stats-currency-save-unverified');
        return clear(intent, alive);
    }

    function clear(intent, alive) {
        if (!alive()) return fail('request-stale');
        const cleared = intents ? intents.save(intent.chatId, null) : { ok: true };
        return cleared.ok ? { ok: true } : fail(cleared.reason);
    }

    async function start(raw, alive) {
        const input = normalizeCurrencyEditInput(raw);
        if (!input) return fail('stats-currency-config-invalid');
        let state = read(alive);
        if (!state.ok) return state;
        if (baseOf(state) !== input.base) return fail('stats-currency-edit-stale');
        const before = state.merged.currency;
        if (!before?.seeded) return fail('stats-currency-unset');
        const after = normalizeCurrencyRecord({ ...before, name: input.name, table: input.table, rate: input.rate });
        if (!after) return fail('stats-currency-config-invalid');
        if (currencyRevision(before) === currencyRevision(after)) return { ok: true, cancelled: true };
        if (!intents) return fail('stats-currency-edit-unsupported');
        const inv = inventory();
        if (typeof inv?.prepareRename !== 'function') return fail('stats-currency-edit-unsupported');
        const snapshot = inv.read();
        if (!snapshot.ok) return fail(snapshot.reason);
        const item = snapshot.inventory.items.find(row => row.key === currencyNameKey(before.name));
        const balance = item && !item.lost ? item.quantity : 0;
        const prepared = await inv.prepareRename({ from: before.name, to: after.name, balance }, { shouldStart: alive });
        if (!alive()) return fail('request-stale');
        if (!prepared?.ok) return fail(prepared?.reason || 'inventory-rename-conflict');
        state = read(alive);
        if (!state.ok) return state;
        if (baseOf(state) !== input.base) return fail('stats-currency-edit-stale');
        const createdAt = Date.now();
        const id = `ce-${globalThis.crypto?.randomUUID?.() || `${createdAt.toString(36)}-${Math.random().toString(36).slice(2)}`}`;
        const intent = normalizeCurrencyEdit({ version: 1, id, chatId: chatId(), createdAt,
            before, after, balance, fromKey: currencyNameKey(before.name), toKey: currencyNameKey(after.name), guard: prepared.guard, done: false });
        if (!intent) return fail('stats-currency-edit-invalid');
        const saved = intents.save(intent.chatId, intent);
        if (!saved.ok) return fail(saved.reason);
        return recover(alive);
    }

    return { read, baseOf, recover, start };
}
