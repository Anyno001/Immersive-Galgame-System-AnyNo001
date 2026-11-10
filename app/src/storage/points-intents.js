import { writeCheckedStorage } from './checked-storage-write.js';
import { isPointsRecord } from '../scene/points/points-log.js';
import { pointsHash } from '../scene/points/points-policy.js';

export function createPointsIntents(storage) {
    const keyFor = chatId => `igs:points:pending:v1:${encodeURIComponent(chatId)}`;
    function read(chatId) {
        if (!chatId) return { ok: false, reason: 'points-no-chat' };
        try {
            const raw = storage.getItem(keyFor(chatId));
            if (raw === null) return { ok: true, record: null };
            const record = JSON.parse(raw);
            if (!isPointsRecord(record) || record.payload?.chatId !== chatId
                || record.id !== `pt|${pointsHash(record.payload)}`) return { ok: false, reason: 'points-intent-invalid' };
            return { ok: true, record };
        } catch { return { ok: false, reason: 'points-intent-read-failed' }; }
    }
    function save(chatId, record) {
        const before = read(chatId);
        if (!before.ok) return before;
        if (record && before.record && JSON.stringify(record) !== JSON.stringify(before.record)) {
            return { ok: false, reason: 'points-intent-pending' };
        }
        const result = writeCheckedStorage(storage, keyFor(chatId), record ? JSON.stringify(record) : null);
        return result.ok ? { ok: true, record } : { ok: false, reason: 'points-intent-save-failed' };
    }
    return { read, save };
}
