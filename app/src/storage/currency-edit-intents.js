import { writeCheckedStorage } from './checked-storage-write.js';
import { normalizeCurrencyEdit } from '../scene/stats/stat-currency-edit.js';

export function createCurrencyEditIntents(storage) {
    const keyFor = chatId => `igs:currency-edit:pending:v1:${encodeURIComponent(chatId)}`;
    function read(chatId) {
        if (!chatId) return { ok: false, reason: 'stats-no-chat' };
        try {
            const raw = storage.getItem(keyFor(chatId));
            if (raw === null) return { ok: true, intent: null };
            const intent = normalizeCurrencyEdit(JSON.parse(raw));
            return intent && intent.chatId === chatId && !intent.done
                ? { ok: true, intent } : { ok: false, reason: 'stats-currency-edit-intent-invalid' };
        } catch { return { ok: false, reason: 'stats-currency-edit-intent-read-failed' }; }
    }
    function save(chatId, intent) {
        const before = read(chatId);
        if (!before.ok) return before;
        const next = intent === null ? null : normalizeCurrencyEdit(intent);
        if (intent !== null && (!next || next.chatId !== chatId || next.done))
            return { ok: false, reason: 'stats-currency-edit-intent-invalid' };
        if (next && before.intent && JSON.stringify(next) !== JSON.stringify(before.intent))
            return { ok: false, reason: 'stats-currency-edit-pending' };
        const result = writeCheckedStorage(storage, keyFor(chatId), next ? JSON.stringify(next) : null);
        return result.ok ? { ok: true, intent: next } : { ok: false, reason: 'stats-currency-edit-intent-save-failed' };
    }
    return { read, save };
}
