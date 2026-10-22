// 数值存档随聊天文件走（§3、易错点 B2/B4）：写进聊天元数据 igs_stats。
// 只存结算后状态与种子；结算前状态加载时按上一楼重建。格式不合法或版本更新时拒收并返回原因，不覆盖原数据。
import { STATS_LOG_MAX, createStatsLedger, ledgerKey, stateBefore } from './stat-ledger.js';

export const STATS_METADATA_KEY = 'igs_stats';
export const STATS_SAVE_VERSION = 1;

// 学习表（§4.1A）：「动作词 → 技能」，可选字段，旧存档没有时按空表读取（版本号不变）。
const LEARNED_WORD = /^[^0-9０-９]{1,8}$/;

function sanitizeLearned(raw) {
    const learned = {};
    let dropped = 0;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { learned, dropped: raw == null ? 0 : 1 };
    for (const [word, skill] of Object.entries(raw)) {
        const w = String(word).trim();
        if (LEARNED_WORD.test(w) && typeof skill === 'string' && skill.trim() && skill.length <= 8) learned[w] = skill.trim();
        else dropped += 1;
    }
    return { learned, dropped };
}

export function serializeLedger(ledger, { chatEnabled = false, learned = {} } = {}) {
    const entries = [...ledger.entries.values()].map((e) => ({
        messageId: e.messageId, swipeId: e.swipeId, seed: e.seed, after: e.after, changes: e.changes,
    }));
    return {
        version: STATS_SAVE_VERSION,
        chatId: ledger.chatId,
        chatEnabled: Boolean(chatEnabled),
        initial: ledger.initial,
        entries,
        active: [...ledger.active.entries()],
        log: ledger.log.slice(-STATS_LOG_MAX),
        learned: sanitizeLearned(learned).learned,
    };
}

function validEntry(e) {
    return e && Number.isInteger(e.messageId) && Number.isInteger(e.swipeId) && Number.isFinite(e.seed) && e.after && typeof e.after === 'object';
}

export function deserializeLedger(raw, chatId) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'stats-save-invalid' };
    if (Number(raw.version) > STATS_SAVE_VERSION) return { ok: false, reason: 'stats-save-newer', version: raw.version };
    if (Number(raw.version) !== STATS_SAVE_VERSION || !raw.initial || !Array.isArray(raw.entries)) return { ok: false, reason: 'stats-save-invalid' };
    const ledger = createStatsLedger(chatId, raw.initial);
    const dropped = [];
    for (const e of raw.entries) {
        if (!validEntry(e)) { dropped.push(e && e.messageId); continue; }
        ledger.entries.set(ledgerKey(ledger, e.messageId, e.swipeId), { ...e, changes: Array.isArray(e.changes) ? e.changes : [], before: null, meta: null });
    }
    for (const pair of Array.isArray(raw.active) ? raw.active : []) {
        const [messageId, swipeId] = pair || [];
        if (ledger.entries.has(ledgerKey(ledger, messageId, swipeId))) ledger.active.set(messageId, swipeId);
    }
    for (const entry of ledger.entries.values()) entry.before = stateBefore(ledger, entry.messageId);
    ledger.log = Array.isArray(raw.log) ? raw.log.filter((row) => row && ledger.entries.has(row.floor)).slice(-STATS_LOG_MAX) : [];
    const { learned, dropped: learnedDropped } = sanitizeLearned(raw.learned);
    return { ok: true, ledger, chatEnabled: raw.chatEnabled === true, dropped, learned, learnedDropped };
}

// 宿主适配：getContext() 返回 SillyTavern 上下文。读写失败与「没有存档」分开报告（契约：失败不当空）。
export function createChatStatsStore(getContext) {
    function context() {
        try { return getContext(); } catch (error) { return null; }
    }
    return {
        read() {
            const ctx = context();
            if (!ctx || !ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') return { ok: false, reason: 'no-chat-metadata' };
            const raw = ctx.chatMetadata[STATS_METADATA_KEY];
            return { ok: true, raw: raw === undefined ? null : raw };
        },
        write(save) {
            const ctx = context();
            if (!ctx || !ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') return { ok: false, reason: 'no-chat-metadata' };
            ctx.chatMetadata[STATS_METADATA_KEY] = save;
            const persist = typeof ctx.saveMetadataDebounced === 'function' ? ctx.saveMetadataDebounced : ctx.saveMetadata;
            if (typeof persist !== 'function') return { ok: false, reason: 'no-save-metadata' };
            try { persist.call(ctx); } catch (error) { return { ok: false, reason: 'save-metadata-failed', error: String(error && error.message || error) }; }
            return { ok: true };
        },
    };
}
