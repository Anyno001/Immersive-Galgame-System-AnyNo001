import { statsGenerationKey, validStatsGenerationIntent } from './stats-generation-intents.js';
import { combatRewardIntentsKey, validCombatRewardIntents } from './combat-reward-intents.js';
import { combatContentIntentKey, validCombatContentIntent } from './combat-content-intents.js';
import { attributeIntentKey, validAttributeIntent } from './attribute-intent.js';
import { heroInitKey, validHeroInitIntent } from './hero-init-intents.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const metadataKeys = ['igs_stats', 'igs_stats_v1_backup', 'igs_stats_declined', 'igsCombatTraitSeed', 'origin_v2', 'origin'];
const floorKeys = ['igsCombat', 'originBlocks', 'originBase', 'igs_points_uid'];

export function readIgsChatEvidence({ context, chatId, storage }) {
    try {
        if (!chatId || !context || !Array.isArray(context.chat)) return { ok: false, status: 'waiting', reason: 'igs-chat-not-ready' };
        const currentId = typeof context.getCurrentChatId === 'function' ? context.getCurrentChatId() : context.chatId;
        if (String(currentId ?? '') !== chatId) return { ok: false, status: 'waiting', reason: 'igs-chat-identity-mismatch' };
        const metadata = context.chatMetadata ?? context.chat_metadata;
        if (!object(metadata)) return { ok: false, status: 'waiting', reason: 'igs-metadata-not-ready' };
        const exists = metadataKeys.some(key => Object.hasOwn(metadata, key) && metadata[key] != null)
            || context.chat.some(message => floorKeys.some(key => message?.extra?.[key] != null)
                || message?.swipe_info?.some?.(swipe => floorKeys.some(key => swipe?.extra?.[key] != null)));
        if (!storage || typeof storage.getItem !== 'function') return { ok: false, status: 'failed', reason: 'igs-recovery-storage-unavailable' };
        const keys = [
            `igs-combat:session:${chatId}`, `igs-combat:outbox:${chatId}`,
            `igs:points:pending:v1:${encodeURIComponent(chatId)}`,
            `igs:currency-edit:pending:v1:${encodeURIComponent(chatId)}`,
            statsGenerationKey(chatId), combatRewardIntentsKey(chatId), combatContentIntentKey(chatId), attributeIntentKey(chatId), heroInitKey(chatId),
        ];
        let recovery = false;
        for (const key of keys) {
            const raw = storage.getItem(key);
            if (raw == null) continue;
            const value = JSON.parse(raw);
            if (!object(value) || !Object.keys(value).length || (value.chatId !== undefined && value.chatId !== chatId)
                || (key === statsGenerationKey(chatId) && !validStatsGenerationIntent(value, chatId))
                || (key === combatRewardIntentsKey(chatId) && !validCombatRewardIntents(value, chatId))
                || (key === combatContentIntentKey(chatId) && !validCombatContentIntent(value, chatId))
                || (key === attributeIntentKey(chatId) && !validAttributeIntent(value, chatId))
                || (key === heroInitKey(chatId) && !validHeroInitIntent(value, chatId))) {
                return { ok: false, status: 'failed', reason: 'igs-recovery-record-invalid' };
            }
            recovery = true;
        }
        return { ok: true, exists: exists || recovery };
    } catch {
        return { ok: false, status: 'failed', reason: 'igs-legacy-evidence-read-failed' };
    }
}
