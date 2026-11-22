import { writeCheckedStorage } from './checked-storage-write.js';

export const statsGenerationKey = chatId => `igs:stats-generation:pending:v1:${encodeURIComponent(chatId)}`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validStatsGenerationIntent(value, chatId) {
    return object(value) && value.version === 1 && value.chatId === chatId && Boolean(chatId)
        && typeof value.key === 'string' && typeof value.id === 'string' && value.id.startsWith('sg-')
        && Array.isArray(value.records) && value.records.length > 0
        && value.records.every(record => object(record) && typeof record.id === 'string' && record.id
            && typeof record.type === 'string' && object(record.payload))
        && new Set(value.records.map(record => record.id)).size === value.records.length
        && Array.isArray(value.bases) && value.bases.every(base => Array.isArray(base) && base.length === 2
            && typeof base[0] === 'string' && (base[1] === null || typeof base[1] === 'string'))
        && object(value.result);
}
export function createStatsGenerationIntents(storage) {
    const memory = new Map();
    function read(chatId) {
        if (!chatId) return { ok: false, reason: 'stats-no-chat' };
        try {
            const raw = storage ? storage.getItem(statsGenerationKey(chatId)) : memory.get(chatId) ?? null;
            if (raw === null) return { ok: true, intent: null };
            const intent = JSON.parse(raw);
            return validStatsGenerationIntent(intent, chatId) ? { ok: true, intent }
                : { ok: false, reason: 'stats-generation-intent-invalid' };
        } catch { return { ok: false, reason: 'stats-generation-intent-read-failed' }; }
    }
    function save(chatId, intent) {
        const before = read(chatId);
        if (!before.ok) return before;
        if (intent !== null && !validStatsGenerationIntent(intent, chatId)) return { ok: false, reason: 'stats-generation-intent-invalid' };
        if (intent && before.intent && JSON.stringify(intent) !== JSON.stringify(before.intent)) return { ok: false, reason: 'stats-generation-save-pending' };
        const raw = intent === null ? null : JSON.stringify(intent);
        if (!storage) { if (raw === null) memory.delete(chatId); else memory.set(chatId, raw); return { ok: true }; }
        return writeCheckedStorage(storage, statsGenerationKey(chatId), raw).ok
            ? { ok: true } : { ok: false, reason: 'stats-generation-intent-save-failed' };
    }
    return { read, save };
}
