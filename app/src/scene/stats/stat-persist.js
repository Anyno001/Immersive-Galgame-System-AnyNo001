// 数值存档随聊天文件走（§3、易错点 B2/B4）：写进聊天元数据 igs_stats。
// 只存结算后状态与种子；结算前状态加载时按上一楼重建。格式不合法或版本更新时拒收并返回原因，不覆盖原数据。
// v2（数值 v2 §3.5）：新增聊天级 catalog（剧情技能、NPC 角色卡、补全队列），每楼保存检定 meta；v1 读入时迁移。
import { STATS_LOG_MAX, createStatsLedger, ledgerKey, stateBefore } from './stat-ledger.js';
import { BASE_ATTRIBUTES } from './stat-state.js';
import * as registry from './stat-registry.js';

const { validSkillName, canonicalSkillName, mergeLegacyValue } = registry;
// 旧技能名（妙手、急救等）读入时落到新名；几个旧名同时有值时数值取大，字符串以新名自己的为准。
function putSkill(target, rawName, value) {
    const name = canonicalSkillName(rawName);
    target[name] = Object.hasOwn(target, name) ? mergeLegacyValue(target[name], value, name === rawName) : value;
}
// 旧属性名 → 战斗六维名。优先用注册表导出的 LEGACY_ATTRIBUTE_MAP（并行改造期间可能尚未导出，退回本地等价表）。
const LEGACY_NAMES = registry.LEGACY_ATTRIBUTE_MAP || Object.freeze({ 健康: '体质', 理智: '智力', 观察: '感知' });
const SAN_NAME = '理智';

export const STATS_METADATA_KEY = 'igs_stats';
export const STATS_BACKUP_KEY = 'igs_stats_v1_backup';
export const STATS_DECLINED_KEY = 'igs_stats_declined';
export const STATS_SAVE_VERSION = 2;
const SHEET_MAX = 60;
const QUEUE_MAX = 24;

// 学习表（§4.1A）：「动作词 → 技能」，可选字段，旧存档没有时按空表读取（版本号不变）。
const LEARNED_WORD = /^[^0-9０-９]{1,8}$/;

export function sanitizeLearned(raw) {
    const learned = {};
    let dropped = 0;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { learned, dropped: raw == null ? 0 : 1 };
    for (const [word, skill] of Object.entries(raw)) {
        const w = String(word).trim();
        if (LEARNED_WORD.test(w) && typeof skill === 'string' && skill.trim() && skill.length <= 8) learned[w] = canonicalSkillName(skill.trim());
        else dropped += 1;
    }
    return { learned, dropped };
}

const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : null);
const plainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

// NPC 角色卡（规格 §2）：attributes 为战斗六维分数（1–30，scale:'score'）；san 为百分制。
// 没有 scale 标记的旧卡（百分制旧名）在这里迁移：旧名经映射改名，值 ÷5 四舍五入夹到 1–30，旧「理智」原值同时写进 san。
function sanitizeSheet(raw) {
    if (!plainObject(raw)) return null;
    const attributes = {};
    let san = num(raw.san, 1, 99);
    const source = plainObject(raw.attributes) ? raw.attributes : {};
    if (raw.scale === 'score') {
        for (const name of BASE_ATTRIBUTES) { const v = num(source[name], 1, 30); if (v) attributes[name] = v; }
    } else {
        for (const [k, v] of Object.entries(source)) {
            const name = LEGACY_NAMES[k] || (BASE_ATTRIBUTES.includes(k) ? k : null);
            const n = num(v, 1, 99);
            if (!name || !n) continue;
            if (k === SAN_NAME && !san) san = n;
            attributes[name] = num(Math.round(n / 5), 1, 30);
        }
    }
    const skills = {};
    for (const [k, v] of Object.entries(plainObject(raw.skills) ? raw.skills : {})) { const name = validSkillName(k); const n = num(v, 1, 99); if (name && n) putSkill(skills, name, n); }
    const provisional = {};
    for (const [k, v] of Object.entries(plainObject(raw.provisional) ? raw.provisional : {})) if (v === true && skills[canonicalSkillName(k)]) provisional[canonicalSkillName(k)] = true;
    const hasAttributes = Object.keys(attributes).length > 0;
    return {
        rank: typeof raw.rank === 'string' ? raw.rank.slice(0, 8) : '普通人', attributes, ...(san ? { san } : {}), ...(hasAttributes ? { scale: 'score' } : {}), skills, provisional,
        signature: Array.isArray(raw.signature) ? raw.signature.filter((s) => typeof s === 'string').slice(0, 3) : [],
        source: ['llm', 'default', 'user', 'carried'].includes(raw.source) ? raw.source : 'default',
    };
}

// NPC 属性档 → 战斗六维 { scores:{str..cha} }；仅新格式且六维齐全时返回，否则 null（战斗侧继续推导）。
export function sheetAbilityScores(sheet) {
    if (!plainObject(sheet) || sheet.scale !== 'score' || !plainObject(sheet.attributes)) return null;
    const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    const scores = {};
    for (let i = 0; i < keys.length; i += 1) {
        const v = Number(sheet.attributes[BASE_ATTRIBUTES[i]]);
        if (!Number.isFinite(v) || v < 1) return null;
        scores[keys[i]] = v;
    }
    return { scores };
}

export function emptyCatalog() {
    return { story: [], merged: {}, attributes: {}, sheets: {}, protagonistBase: {}, protagonistEdit: {}, heroAssigned: false, heroPicked: false, intimacyForced: [], queue: { skills: [], people: [] }, notified: [] };
}

export function sanitizeCatalog(raw) {
    const out = emptyCatalog();
    if (!plainObject(raw)) return out;
    for (const s of Array.isArray(raw.story) ? raw.story : []) {
        const name = s && validSkillName(s.name);
        if (!name || out.story.some((x) => x.name === name)) continue;
        out.story.push({ name, attribute: String(s.attribute || '').slice(0, 4), category: String(s.category || 'general').slice(0, 8), aliases: Array.isArray(s.aliases) ? s.aliases.filter((a) => typeof a === 'string').slice(0, 8) : [], createdAt: Number.isInteger(s.createdAt) ? s.createdAt : null, guessed: s.guessed === true });
    }
    for (const [from, to] of Object.entries(plainObject(raw.merged) ? raw.merged : {})) if (validSkillName(from) && validSkillName(to)) out.merged[from] = canonicalSkillName(to);
    // 内置技能的所属属性改动：{ 技能: 六维之一 }。
    for (const [k, v] of Object.entries(plainObject(raw.attributes) ? raw.attributes : {})) { const name = validSkillName(k); if (name && BASE_ATTRIBUTES.includes(v)) putSkill(out.attributes, name, v); }
    for (const [name, sheet] of Object.entries(plainObject(raw.sheets) ? raw.sheets : {}).slice(0, SHEET_MAX)) {
        const clean = sanitizeSheet(sheet);
        if (clean && name && name.length <= 20) out.sheets[name] = clean;
    }
    for (const [k, v] of Object.entries(plainObject(raw.protagonistBase) ? raw.protagonistBase : {})) { const name = validSkillName(k); const n = num(v, 1, 99); if (name && n) putSkill(out.protagonistBase, name, n); }
    // 玩家手改覆盖层：{ 技能: { value, from } }，规则见 stat-engine.js 的 heroSkillLevel。
    for (const [k, v] of Object.entries(plainObject(raw.protagonistEdit) ? raw.protagonistEdit : {})) {
        const name = validSkillName(k);
        const value = plainObject(v) && Number(v.value) >= 1 ? num(v.value, 1, 99) : null;
        if (name && value) putSkill(out.protagonistEdit, name, { value, from: plainObject(v) ? num(v.from, 0, 99) || 0 : 0 });
    }
    out.heroAssigned = raw.heroAssigned === true;
    // 新聊天选过擅长技能（3+5）后为真，「我的角色」不再显示选择区。
    out.heroPicked = raw.heroPicked === true;
    // 亲密门槛豁免：聊天级角色名单，不随楼层快照，swipe、删楼不丢。
    out.intimacyForced = [...new Set((Array.isArray(raw.intimacyForced) ? raw.intimacyForced : []).filter((n) => typeof n === 'string' && n && n.length <= 20))].slice(0, SHEET_MAX);
    const q = plainObject(raw.queue) ? raw.queue : {};
    out.queue.skills = [...new Set((Array.isArray(q.skills) ? q.skills : []).map(validSkillName).filter(Boolean).map(canonicalSkillName))].slice(0, QUEUE_MAX);
    out.queue.people = (Array.isArray(q.people) ? q.people : []).filter((n) => typeof n === 'string' && n.length <= 20).slice(0, QUEUE_MAX);
    out.notified = (Array.isArray(raw.notified) ? raw.notified : []).filter((n) => typeof n === 'string' && n.length <= 20).slice(0, SHEET_MAX * 2);
    return out;
}

// 每楼只存检定相关的 meta（检定、预掷骰面、来源说明、强制事项标记），诊断与事件不落盘。
function metaToSave(meta) {
    if (!meta) return null;
    const out = {};
    for (const key of ['check', 'checks', 'preroll', 'note', 'flags', 'pendingRoll']) if (meta[key]) out[key] = meta[key];
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
