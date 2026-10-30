// 数值存档随聊天文件走（§3、易错点 B2/B4）：写进聊天元数据 igs_stats。
// 只存结算后状态与种子；结算前状态加载时按上一楼重建。格式不合法或版本更新时拒收并返回原因，不覆盖原数据。
// v2（数值 v2 §3.5）：新增聊天级 catalog（剧情技能、NPC 角色卡、补全队列），每楼保存检定 meta；v1 读入时迁移。
import { STATS_LOG_MAX, createStatsLedger, ledgerKey, stateBefore } from './stat-ledger.js';
import { BASE_ATTRIBUTES } from './stat-state.js';
import { validSkillName } from './stat-registry.js';

export const STATS_METADATA_KEY = 'igs_stats';
export const STATS_BACKUP_KEY = 'igs_stats_v1_backup';
export const STATS_DECLINED_KEY = 'igs_stats_declined';
export const STATS_SAVE_VERSION = 2;
const SHEET_MAX = 60;
const QUEUE_MAX = 24;

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

const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : null);
const plainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function sanitizeSheet(raw) {
    if (!plainObject(raw)) return null;
    const attributes = {};
    for (const name of BASE_ATTRIBUTES) { const v = num(raw.attributes && raw.attributes[name], 1, 99); if (v) attributes[name] = v; }
    const skills = {};
    for (const [k, v] of Object.entries(plainObject(raw.skills) ? raw.skills : {})) { const name = validSkillName(k); const n = num(v, 1, 99); if (name && n) skills[name] = n; }
    const provisional = {};
    for (const [k, v] of Object.entries(plainObject(raw.provisional) ? raw.provisional : {})) if (v === true && skills[k]) provisional[k] = true;
    return {
        rank: typeof raw.rank === 'string' ? raw.rank.slice(0, 8) : '普通人', attributes, skills, provisional,
        signature: Array.isArray(raw.signature) ? raw.signature.filter((s) => typeof s === 'string').slice(0, 3) : [],
        source: ['llm', 'default', 'user', 'carried'].includes(raw.source) ? raw.source : 'default',
    };
}

export function emptyCatalog() {
    return { story: [], merged: {}, sheets: {}, protagonistBase: {}, queue: { skills: [], people: [] }, notified: [] };
}

export function sanitizeCatalog(raw) {
    const out = emptyCatalog();
    if (!plainObject(raw)) return out;
    for (const s of Array.isArray(raw.story) ? raw.story : []) {
        const name = s && validSkillName(s.name);
        if (!name || out.story.some((x) => x.name === name)) continue;
        out.story.push({ name, attribute: String(s.attribute || '').slice(0, 4), category: String(s.category || 'general').slice(0, 8), aliases: Array.isArray(s.aliases) ? s.aliases.filter((a) => typeof a === 'string').slice(0, 8) : [], createdAt: Number.isInteger(s.createdAt) ? s.createdAt : null, guessed: s.guessed === true });
    }
    for (const [from, to] of Object.entries(plainObject(raw.merged) ? raw.merged : {})) if (validSkillName(from) && validSkillName(to)) out.merged[from] = to;
    for (const [name, sheet] of Object.entries(plainObject(raw.sheets) ? raw.sheets : {}).slice(0, SHEET_MAX)) {
        const clean = sanitizeSheet(sheet);
        if (clean && name && name.length <= 20) out.sheets[name] = clean;
    }
    for (const [k, v] of Object.entries(plainObject(raw.protagonistBase) ? raw.protagonistBase : {})) { const name = validSkillName(k); const n = num(v, 1, 99); if (name && n) out.protagonistBase[name] = n; }
    const q = plainObject(raw.queue) ? raw.queue : {};
    out.queue.skills = (Array.isArray(q.skills) ? q.skills : []).map(validSkillName).filter(Boolean).slice(0, QUEUE_MAX);
    out.queue.people = (Array.isArray(q.people) ? q.people : []).filter((n) => typeof n === 'string' && n.length <= 20).slice(0, QUEUE_MAX);
    out.notified = (Array.isArray(raw.notified) ? raw.notified : []).filter((n) => typeof n === 'string' && n.length <= 20).slice(0, SHEET_MAX * 2);
    return out;
}

// 每楼只存检定相关的 meta（检定、预掷骰面、来源说明、强制事项标记），诊断与事件不落盘。
function metaToSave(meta) {
    if (!meta) return null;
    const out = {};
    for (const key of ['check', 'preroll', 'note', 'flags', 'pendingRoll']) if (meta[key]) out[key] = meta[key];
    return Object.keys(out).length ? out : null;
}

export function serializeLedger(ledger, { chatEnabled = false, learned = {}, catalog } = {}) {
    const entries = [...ledger.entries.values()].map((e) => {
        const meta = metaToSave(e.meta);
        return { messageId: e.messageId, swipeId: e.swipeId, seed: e.seed, after: e.after, changes: e.changes, ...(meta ? { meta } : {}) };
    });
    return {
        version: STATS_SAVE_VERSION,
        chatId: ledger.chatId,
        chatEnabled: Boolean(chatEnabled),
        initial: ledger.initial,
        entries,
        active: [...ledger.active.entries()],
        log: ledger.log.slice(-STATS_LOG_MAX),
        learned: sanitizeLearned(learned).learned,
        catalog: sanitizeCatalog(catalog),
    };
}

function validEntry(e) {
    return e && Number.isInteger(e.messageId) && Number.isInteger(e.swipeId) && Number.isFinite(e.seed) && e.after && typeof e.after === 'object';
}

// v1 → v2：底数不变，只补聊天级 catalog；migrated 为 true 时调用方在首次写回前留一份原样备份。
export function deserializeLedger(raw, chatId) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'stats-save-invalid' };
    const version = Number(raw.version);
    if (version > STATS_SAVE_VERSION) return { ok: false, reason: 'stats-save-newer', version: raw.version };
    if ((version !== 1 && version !== STATS_SAVE_VERSION) || !raw.initial || !Array.isArray(raw.entries)) return { ok: false, reason: 'stats-save-invalid' };
    const ledger = createStatsLedger(chatId, raw.initial);
    const dropped = [];
    for (const e of raw.entries) {
        if (!validEntry(e)) { dropped.push(e && e.messageId); continue; }
        const meta = plainObject(e.meta) ? e.meta : null;
        ledger.entries.set(ledgerKey(ledger, e.messageId, e.swipeId), { ...e, changes: Array.isArray(e.changes) ? e.changes : [], before: null, meta });
    }
    for (const pair of Array.isArray(raw.active) ? raw.active : []) {
        const [messageId, swipeId] = pair || [];
        if (ledger.entries.has(ledgerKey(ledger, messageId, swipeId))) ledger.active.set(messageId, swipeId);
    }
    for (const entry of ledger.entries.values()) entry.before = stateBefore(ledger, entry.messageId);
    ledger.log = Array.isArray(raw.log) ? raw.log.filter((row) => row && ledger.entries.has(row.floor)).slice(-STATS_LOG_MAX) : [];
    const { learned, dropped: learnedDropped } = sanitizeLearned(raw.learned);
    return { ok: true, ledger, chatEnabled: raw.chatEnabled === true, dropped, learned, learnedDropped, catalog: sanitizeCatalog(raw.catalog), migrated: version === 1 };
}

// 宿主适配：getContext() 返回 SillyTavern 上下文。读写失败与「没有存档」分开报告（契约：失败不当空）。
export function createChatStatsStore(getContext) {
    function context() {
        try { return getContext(); } catch (error) { return null; }
    }
    function save(ctx) {
        const persist = typeof ctx.saveMetadataDebounced === 'function' ? ctx.saveMetadataDebounced : ctx.saveMetadata;
        if (typeof persist !== 'function') return { ok: false, reason: 'no-save-metadata' };
        try { persist.call(ctx); } catch (error) { return { ok: false, reason: 'save-metadata-failed', error: String(error && error.message || error) }; }
        return { ok: true };
    }
    return {
        read() {
            const ctx = context();
            if (!ctx || !ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') return { ok: false, reason: 'no-chat-metadata' };
            const raw = ctx.chatMetadata[STATS_METADATA_KEY];
            return { ok: true, raw: raw === undefined ? null : raw, declined: ctx.chatMetadata[STATS_DECLINED_KEY] === true, hasBackup: ctx.chatMetadata[STATS_BACKUP_KEY] !== undefined };
        },
        write(saveData) {
            const ctx = context();
            if (!ctx || !ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') return { ok: false, reason: 'no-chat-metadata' };
            ctx.chatMetadata[STATS_METADATA_KEY] = saveData;
            return save(ctx);
        },
        // 迁移前一次性备份（§3.5 第 4 条）：已有备份时不重复写。
        backup(raw) {
            const ctx = context();
            if (!ctx || !ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') return { ok: false, reason: 'no-chat-metadata' };
            if (ctx.chatMetadata[STATS_BACKUP_KEY] !== undefined) return { ok: true, skipped: true };
            ctx.chatMetadata[STATS_BACKUP_KEY] = raw;
            return save(ctx);
        },
        dropBackup() {
            const ctx = context();
            if (!ctx || !ctx.chatMetadata || ctx.chatMetadata[STATS_BACKUP_KEY] === undefined) return { ok: true, skipped: true };
            delete ctx.chatMetadata[STATS_BACKUP_KEY];
            return save(ctx);
        },
        setDeclined(on) {
            const ctx = context();
            if (!ctx || !ctx.chatMetadata || typeof ctx.chatMetadata !== 'object') return { ok: false, reason: 'no-chat-metadata' };
            if (on) ctx.chatMetadata[STATS_DECLINED_KEY] = true;
            else delete ctx.chatMetadata[STATS_DECLINED_KEY];
            return save(ctx);
        },
    };
}
