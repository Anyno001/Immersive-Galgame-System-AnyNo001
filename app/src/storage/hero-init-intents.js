// 主角统一初始化可恢复意图存储：保存规范化结果、稳定操作 ID 与已推进阶段，按聊天隔离。
import { writeCheckedStorage } from './checked-storage-write.js';
import { normalizeHeroScores } from '../scene/stats/ability-fields.js';
import { normalizeCurrencyConfig, normalizeCurrencyWrite } from '../scene/stats/stat-currency.js';

export const heroInitKey = chatId => `igs:hero-init:pending:v1:${encodeURIComponent(chatId)}`;
export const HERO_INIT_STAGES = Object.freeze(['result-saved', 'attributes', 'currency-config', 'currency-seed', 'done']);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validHeroInitIntent(value, chatId) {
    if (!isObject(value) || value.version !== 1 || value.chatId !== chatId || !chatId) return false;
    if (value.layout !== 'v2' && value.layout !== 'legacy') return false;
    if (typeof value.operationId !== 'string' || !value.operationId.startsWith('hi-')) return false;
    if (!HERO_INIT_STAGES.includes(value.stage)) return false;
    if (typeof value.needAttributes !== 'boolean' || typeof value.needCurrency !== 'boolean') return false;
    if (!value.needAttributes && !value.needCurrency) return false;
    if (!Number.isSafeInteger(value.createdAt) || value.createdAt < 0) return false;
    if (value.needAttributes) {
        if (!normalizeHeroScores(value.attributes)) return false;
        if (typeof value.attributeRecordId !== 'string' || !value.attributeRecordId.trim()) return false;
    } else if (value.attributes !== null && value.attributes !== undefined) return false;
    if (value.needCurrency) {
        if (!isObject(value.currency)) return false;
        const cfg = normalizeCurrencyConfig(value.currency);
        const initial = Number(value.currency.initial);
        if (!cfg || !Number.isSafeInteger(initial) || initial < 0) return false;
        if (value.seed !== null && value.seed !== undefined) {
            const seed = normalizeCurrencyWrite(value.seed);
            if (!seed || seed.after - seed.before !== initial) return false;
        }
    } else if (value.currency !== null && value.currency !== undefined) return false;
    return true;
}

export function createHeroInitIntents(storage) {
    const memory = new Map();
    function read(chatId) {
        if (!chatId) return { ok: false, reason: 'stats-no-chat' };
        try {
            const raw = storage ? storage.getItem(heroInitKey(chatId)) : memory.get(chatId) ?? null;
            if (raw === null) return { ok: true, intent: null };
            const intent = JSON.parse(raw);
            return validHeroInitIntent(intent, chatId)
                ? { ok: true, intent }
                : { ok: false, reason: 'stats-hero-init-intent-invalid' };
        } catch {
            return { ok: false, reason: 'stats-hero-init-intent-read-failed' };
        }
    }
    function save(chatId, intent, { allowUpdate = false } = {}) {
        const before = read(chatId);
        if (!before.ok) return before;
        if (intent !== null && !validHeroInitIntent(intent, chatId)) {
            return { ok: false, reason: 'stats-hero-init-intent-invalid' };
        }
        if (intent && before.intent) {
            const sameOp = before.intent.operationId === intent.operationId;
            if (!sameOp && JSON.stringify(intent) !== JSON.stringify(before.intent)) {
                return { ok: false, reason: 'stats-hero-init-pending' };
            }
            if (sameOp && !allowUpdate && JSON.stringify(intent) !== JSON.stringify(before.intent)) {
                return { ok: false, reason: 'stats-hero-init-pending' };
            }
        }
        const raw = intent === null ? null : JSON.stringify(intent);
        if (!storage) {
            if (raw === null) memory.delete(chatId);
            else memory.set(chatId, raw);
            return { ok: true };
        }
        return writeCheckedStorage(storage, heroInitKey(chatId), raw).ok
            ? { ok: true }
            : { ok: false, reason: 'stats-hero-init-intent-save-failed' };
    }
    return { read, save };
}
