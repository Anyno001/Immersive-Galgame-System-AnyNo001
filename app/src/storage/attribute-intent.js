import { writeCheckedStorage } from './checked-storage-write.js';
import { normalizeAttributeRecord } from '../combat/schema.js';

export const attributeIntentKey = chatId => `igs:attributes:pending:v1:${encodeURIComponent(chatId)}`;
export function validAttributeIntent(value, chatId) {
    return !!chatId && value?.version === 1 && value.chatId === chatId && ['legacy', 'v2'].includes(value.layout)
        && Array.isArray(value.records) && value.records.length > 0
        && value.records.every(row => normalizeAttributeRecord(row).ok)
        && new Set(value.records.map(row => row.id)).size === value.records.length
        && Array.isArray(value.base) && value.base.every(id => typeof id === 'string');
}

export function createAttributeIntent(storage, chatId) {
    const key = attributeIntentKey(chatId);
    function read() {
        try {
            const raw = storage.getItem(key);
            if (raw === null) return { ok: true, intent: null };
            const intent = JSON.parse(raw);
            return validAttributeIntent(intent, chatId) ? { ok: true, intent } : { ok: false, reason: 'stats-attribute-intent-invalid' };
        } catch { return { ok: false, reason: 'stats-attribute-intent-read-failed' }; }
    }
    function replace(expected, value) {
        const held = read();
        if (!held.ok) return held;
        if (JSON.stringify(held.intent) !== JSON.stringify(expected)) return { ok: false, reason: 'stats-attribute-save-pending' };
        if (value && !validAttributeIntent(value, chatId)) return { ok: false, reason: 'stats-attribute-intent-invalid' };
        return writeCheckedStorage(storage, key, value ? JSON.stringify(value) : null).ok ? { ok: true } : { ok: false, reason: 'stats-attribute-intent-write-failed' };
    }
    return { read, replace };
}
