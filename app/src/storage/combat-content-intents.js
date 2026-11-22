// 战斗初始内容（职业、卡组、初始装备）可恢复提交意图存储：保存规范化结果、固定锚点与提交阶段，按聊天隔离。
import { writeCheckedStorage } from './checked-storage-write.js';

export const combatContentIntentKey = chatId => `igs:combat-content:pending:v1:${encodeURIComponent(chatId)}`;
export const COMBAT_CONTENT_STAGES = Object.freeze(['profile', 'gear']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validCombatContentIntent(value, chatId) {
    if (!isObject(value) || value.version !== 1 || value.chatId !== chatId || !chatId) return false;
    if (typeof value.operationId !== 'string' || !value.operationId.startsWith('cc-')) return false;
    if (typeof value.characterId !== 'string' || !value.characterId.trim()) return false;
    if (typeof value.name !== 'string' || !value.name.trim()) return false;
    if (!COMBAT_CONTENT_STAGES.includes(value.stage)) return false;
    if (!Array.isArray(value.profiles)) return false;
    if (!Array.isArray(value.gearAccepted)) return false;
    if (value.gearAnchor !== null && value.gearAnchor !== undefined) {
        if (!isObject(value.gearAnchor) || !Number.isInteger(value.gearAnchor.messageId) || !Number.isInteger(value.gearAnchor.swipeId)) return false;
    }
    if (!Number.isSafeInteger(value.createdAt) || value.createdAt < 0) return false;
    return true;
}

export function createCombatContentIntents(storage) {
    const memory = new Map();
    function read(chatId) {
        if (!chatId) return { ok: false, reason: 'combat-session-unavailable' };
        try {
            const raw = storage ? storage.getItem(combatContentIntentKey(chatId)) : memory.get(chatId) ?? null;
            if (raw === null) return { ok: true, intent: null };
            const intent = JSON.parse(raw);
            return validCombatContentIntent(intent, chatId)
                ? { ok: true, intent }
                : { ok: false, reason: 'combat-content-intent-invalid' };
        } catch {
            return { ok: false, reason: 'combat-content-intent-read-failed' };
        }
    }
    function save(chatId, intent, { allowUpdate = false } = {}) {
        const before = read(chatId);
        if (!before.ok) return before;
        if (intent !== null && !validCombatContentIntent(intent, chatId)) {
            return { ok: false, reason: 'combat-content-intent-invalid' };
        }
        if (intent && before.intent) {
            const sameOp = before.intent.operationId === intent.operationId;
            if (!sameOp && JSON.stringify(intent) !== JSON.stringify(before.intent)) {
                return { ok: false, reason: 'combat-content-save-pending' };
            }
            if (sameOp && !allowUpdate && JSON.stringify(intent) !== JSON.stringify(before.intent)) {
                return { ok: false, reason: 'combat-content-save-pending' };
            }
        }
        const raw = intent === null ? null : JSON.stringify(intent);
        if (!storage) {
            if (raw === null) memory.delete(chatId);
            else memory.set(chatId, raw);
            return { ok: true };
        }
        return writeCheckedStorage(storage, combatContentIntentKey(chatId), raw).ok
            ? { ok: true }
            : { ok: false, reason: 'combat-content-intent-save-failed' };
    }
    return { read, save };
}
