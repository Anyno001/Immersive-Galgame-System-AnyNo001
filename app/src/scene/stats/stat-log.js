// 数值日志（合并计划 P4）：IGS数值·日志 的记录模型与归并。纯函数，不读写存储。
// 记录类型：init（建卡初始状态，不锚定，最早一条为准）；floor（一楼一条，锚定该 AI 楼：messageId + swipeId + 本楼数值 / 检定标签摘要，
// 载荷为相对基准记录的状态差量 ops 与检定 meta）；聊天级 chat / skill-def / skill-merge / sheet / base / queue / notified / learned（不锚定，同键取最后一条）。
// 归并：每楼取锚点仍有效的最后一条 floor，按基准链还原状态；删楼、换 swipe、编辑改了标签后该条不计，状态回到更早的有效楼层。
import { hash32 } from '../../combat/random.js';
import { BUILD_CHOICES, BUILD_MODES, abilityKeyOf } from '../../combat/abilities.js';
import { STATS_LOG_MAX, activeEntryBefore, createStatsLedger, currentStatsState, ledgerKey } from './stat-ledger.js';
import { deserializeLedger, sanitizeCatalog, sanitizeLearned } from './stat-persist.js';
import { LEGACY_ATTRIBUTE_MAP } from './stat-registry.js';

export const STAT_LOG_CHARACTER = '主角';
const TAG_RE = /[\[【]\s*igs\s*-?\s*stat\s*[:：][^\]】]*[\]】]|\[igs-check:[^\]\n]*\]/gi;
const FLOOR_META_KEYS = Object.freeze(['check', 'checks', 'preroll', 'note', 'flags', 'pendingRoll']);
const CHAT_TYPES = Object.freeze({ chat: 'chat', skill: 'skill-def', merge: 'skill-merge', sheet: 'sheet', base: 'base', queue: 'queue', notified: 'notified', learned: 'learned' });
export const STAT_CHAT_RECORD_TYPES = Object.freeze(Object.values(CHAT_TYPES));
// 旧六维在新六维里的先后（Q1 映射顺序），旧存档推导主擅长 / 次擅长 / 短板时同分按此序。
const LEGACY_ORDER = Object.freeze(['体质', '力量', '敏捷', '智力', '感知', '魅力']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const short = (text) => hash32(text).toString(36);

// 本楼数值标签与检定标签的摘要：标签被删改后锚点失效；正文其余文字改动不影响。
export function statTagHash(text) {
    const tags = (String(text ?? '').match(TAG_RE) || []).map((t) => t.replace(/\s+/g, '').replace(/【/g, '[').replace(/】/g, ']').replace(/：/g, ':').replace(/｜/g, '|'));
    return `st${short(tags.join('\n'))}`;
}

// 某楼某 swipe 的正文：当前 swipe 读 mes，其他 swipe 读 swipes[]；楼层不存在、是用户楼或读不到正文时返回 null。
export function swipeTextOf(chat, messageId, swipeId) {
    const m = Array.isArray(chat) ? chat[messageId] : null;
    if (!m || m.is_user) return null;
    const current = Number.isInteger(m.swipe_id) ? m.swipe_id : 0;
    if (swipeId === current) return String(m.mes ?? '');
    return Array.isArray(m.swipes) && typeof m.swipes[swipeId] === 'string' ? m.swipes[swipeId] : null;
}

// 状态差量：对象逐键比较，数组与标量整值替换；值为 undefined 视同不存在（与 JSON 往返一致）。
export function diffState(before, after, path = [], ops = []) {
    if (before === after) return ops;
    if (isObj(before) && isObj(after)) {
        for (const k of Object.keys(after)) if (after[k] !== undefined) diffState(before[k], after[k], [...path, k], ops);
        for (const k of Object.keys(before)) if (before[k] !== undefined && after[k] === undefined) ops.push({ p: [...path, k] });
        return ops;
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) ops.push({ p: path, v: after });
    return ops;
}

function setIn(node, path, op) {
    if (!path.length) return Object.hasOwn(op, 'v') ? op.v : undefined;
    const [k, ...rest] = path;
    const next = isObj(node) ? { ...node } : {};
    if (!rest.length && !Object.hasOwn(op, 'v')) delete next[k];
    else next[k] = setIn(next[k], rest, op);
    return next;
}

// 写时复制：不改基准状态（状态对象共享只读）。
export function applyOps(base, ops) {
    let root = base;
    for (const op of Array.isArray(ops) ? ops : []) if (op && Array.isArray(op.p)) root = setIn(root, op.p, op);
    return root;
}


function pickMeta(meta) {
    if (!isObj(meta)) return null;
    const out = {};
    for (const k of FLOOR_META_KEYS) if (meta[k]) out[k] = meta[k];
    return Object.keys(out).length ? out : null;
}

const changeSummary = (changes) => changes.slice(0, 4).map((c) => `${c.target ?? ''}${c.key ?? ''}${c.from ?? ''}→${c.to ?? ''}`).join('；').slice(0, 40);

// 一楼一条：载荷 { base, seed, ops, changes, meta }。ID 由锚点与载荷摘要推导：同一结果重算得到同一 ID（幂等），结果变了得到新 ID（追加，后写为准）。
export function floorRecord({ messageId, swipeId, tagHash, baseId = null, seed, before, after, changes = [], meta = null, createdAt = 0 }) {
    const payload = { base: baseId, seed, ops: diffState(before, after), changes: Array.isArray(changes) ? changes : [] };
    const m = pickMeta(meta);
    if (m) payload.meta = m;
    const id = `sf|${messageId}|${swipeId}|${tagHash}|${short(JSON.stringify(payload))}`;
    return { id, type: 'floor', character: STAT_LOG_CHARACTER, anchor: { messageId, swipeId, tagHash, occurrence: 0 }, createdAt, change: changeSummary(payload.changes), payload };
}

// 建卡初始状态；旧存档导入时另记来源版本与换算后的主角六维分值（legacy）。
export function initRecord(state, { legacy = null, createdAt = 0 } = {}) {
    const payload = legacy ? { state, legacy } : { state };
    return { id: `si|${short(JSON.stringify(payload))}`, type: 'init', character: STAT_LOG_CHARACTER, anchor: null, createdAt, change: legacy ? '旧存档导入' : '建卡', payload };
}

// 建档方式（P8c）：自动生成 / 手动建档 / 相对数值；未选时为 null（按自动处理，界面询问一次）。
// 建档选择：手动建档下逐角色的「改用自动生成」或「跳过」（跳过后本聊天不再询问该角色）。
export { BUILD_CHOICES, BUILD_MODES };
export const normalizeBuildMode = (v) => (BUILD_MODES.includes(v) ? v : null);
export function normalizeBuildChoices(raw) {
    if (!isObj(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter(([n, v]) => n && n.length <= 40 && BUILD_CHOICES.includes(v)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// 聊天级数据展开成键值：chat:enabled、chat:buildMode、chat:buildChoices、skill:技能、merge:旧名、sheet:角色、base:技能、queue:skills|people、notified:all、learned:动作词。
export function chatEntries({ chatEnabled = false, catalog = null, learned = {}, buildMode = null, buildChoices = {} } = {}) {
    const cat = sanitizeCatalog(catalog);
    const out = new Map([['chat:enabled', Boolean(chatEnabled)]]);
    if (normalizeBuildMode(buildMode)) out.set('chat:buildMode', buildMode);
    const choices = normalizeBuildChoices(buildChoices);
    if (Object.keys(choices).length) out.set('chat:buildChoices', choices);
    for (const s of cat.story) out.set(`skill:${s.name}`, s);
    for (const [from, to] of Object.entries(cat.merged)) out.set(`merge:${from}`, to);
    for (const [name, sheet] of Object.entries(cat.sheets)) out.set(`sheet:${name}`, sheet);
    for (const [k, v] of Object.entries(cat.protagonistBase)) out.set(`base:${k}`, v);
    out.set('queue:skills', cat.queue.skills);
    out.set('queue:people', cat.queue.people);
    out.set('notified:all', cat.notified);
    for (const [w, s] of Object.entries(sanitizeLearned(learned).learned)) out.set(`learned:${w}`, s);
    return out;
}

const CHAT_DEFAULT = new Map([['chat:enabled', false], ['queue:skills', []], ['queue:people', []], ['notified:all', []]]);
const valueOf = (map, key) => (map.has(key) ? map.get(key) : CHAT_DEFAULT.get(key));

// 与基线比较，只为变化的键写记录；删除写 { key, removed:true }。tag 区分同键先后两次相同的写入（运行时传递增序号，导入用固定值保证幂等）。
export function diffChatRecords(baseline, next, { tag = '', createdAt = 0 } = {}) {
    const records = [];
    for (const key of new Set([...baseline.keys(), ...next.keys()])) {
        const a = valueOf(baseline, key);
        const b = valueOf(next, key);
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        const payload = b === undefined ? { key, removed: true } : { key, value: b };
        records.push({ id: `sc|${tag}|${short(`${key}\n${JSON.stringify(payload)}`)}`, type: CHAT_TYPES[key.slice(0, key.indexOf(':'))], character: STAT_LOG_CHARACTER, anchor: null, createdAt, change: key.slice(0, 40), payload });
    }
    return records;
}

export function restoreChat(map) {
    const raw = { story: [], merged: {}, sheets: {}, protagonistBase: {}, queue: { skills: [], people: [] }, notified: [] };
    const learned = {};
    let chatEnabled = false;
    let buildMode = null;
    let buildChoices = {};
    for (const [key, value] of map) {
        const at = key.indexOf(':');
        const kind = key.slice(0, at);
        const name = key.slice(at + 1);
        if (kind === 'chat' && name === 'enabled') chatEnabled = value === true;
        else if (kind === 'chat' && name === 'buildMode') buildMode = normalizeBuildMode(value);
        else if (kind === 'chat' && name === 'buildChoices') buildChoices = normalizeBuildChoices(value);
        else if (kind === 'skill') raw.story.push(value);
        else if (kind === 'merge') raw.merged[name] = value;
        else if (kind === 'sheet') raw.sheets[name] = value;
        else if (kind === 'base') raw.protagonistBase[name] = value;
        else if (kind === 'queue' && (name === 'skills' || name === 'people')) raw.queue[name] = value;
        else if (kind === 'notified') raw.notified = value;
        else if (kind === 'learned') learned[name] = value;
    }
    return { chatEnabled, buildMode, buildChoices, catalog: sanitizeCatalog(raw), learned: sanitizeLearned(learned).learned };
}

// 归并：records 为表里的数值记录（表内顺序），chat 为当前聊天楼层（判锚点与当前 swipe）。
// 没有 init 时 ledger 为 null（本聊天未建卡或导入未完成）。stateOf(recordId) 供导入读回核对。
export function mergeStatLog(records, { chatId = '', chat = [] } = {}) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    const diagnostics = [];
    const init = list.find((r) => r.type === 'init' && isObj(r.payload) && isObj(r.payload.state)) || null;
    const chatMap = new Map();
    for (const r of list) {
        if (!STAT_CHAT_RECORD_TYPES.includes(r.type) || !isObj(r.payload) || typeof r.payload.key !== 'string') continue;
        chatMap.delete(r.payload.key);
        if (!r.payload.removed) chatMap.set(r.payload.key, r.payload.value);
    }
    const restored = restoreChat(chatMap);
    const floors = new Map();
    for (const r of list) if (r.type === 'floor' && isObj(r.anchor) && isObj(r.payload)) floors.set(r.id, r);
    const initial = init ? init.payload.state : undefined;
    const memo = new Map();
    // 按基准链还原（迭代，不递归）；链断或成环返回 undefined。
    const stateOf = (id) => {
        const chain = [];
        const seen = new Set();
        let cur = id ?? null;
        while (cur !== null && !memo.has(cur)) {
            const rec = floors.get(cur);
            if (!rec || seen.has(cur)) return undefined;
            seen.add(cur);
            chain.push(cur);
            cur = rec.payload.base ?? null;
        }
        let state = cur === null ? initial : memo.get(cur);
        for (let i = chain.length - 1; i >= 0; i -= 1) {
            state = state === undefined ? undefined : applyOps(state, floors.get(chain[i]).payload.ops);
            memo.set(chain[i], state);
        }
        return state;
    };
    const base = { ok: true, initId: init ? init.id : null, ...restored, baseline: chatEntries(restored), diagnostics, stateOf };
    if (!init) return { ...base, ledger: null };
    // 每楼每 swipe 取锚点仍有效的最后一条（后写为准）。
    const chosen = new Map();
    for (const rec of floors.values()) {
        const { messageId, swipeId, tagHash } = rec.anchor;
        if (!Number.isInteger(messageId) || !Number.isInteger(swipeId)) continue;
        const text = swipeTextOf(chat, messageId, swipeId);
        if (text === null || statTagHash(text) !== tagHash) continue;
        const key = `${messageId}|${swipeId}`;
        chosen.delete(key);
        chosen.set(key, rec);
    }
    const ledger = createStatsLedger(chatId, initial);
    for (const rec of chosen.values()) {
        const baseId = rec.payload.base ?? null;
        const after = stateOf(rec.id);
        const before = stateOf(baseId);
        const { messageId, swipeId } = rec.anchor;
        if (after === undefined || before === undefined) { diagnostics.push({ code: 'stats-log-chain-broken', messageId }); continue; }
        ledger.entries.set(ledgerKey(ledger, messageId, swipeId), {
            messageId, swipeId, seed: rec.payload.seed, before, after,
            changes: Array.isArray(rec.payload.changes) ? rec.payload.changes : [], meta: isObj(rec.payload.meta) ? rec.payload.meta : null,
            recordId: rec.id, baseId,
        });
    }
    for (const entry of ledger.entries.values()) {
        const m = chat[entry.messageId];
        if (m && (Number.isInteger(m.swipe_id) ? m.swipe_id : 0) === entry.swipeId) ledger.active.set(entry.messageId, entry.swipeId);
    }
    ledger.log = [...ledger.active].sort((a, b) => a[0] - b[0]).flatMap(([mid, sid]) => {
        const key = ledgerKey(ledger, mid, sid);
        return ledger.entries.get(key).changes.map((row) => ({ floor: key, ...row }));
    }).slice(-STATS_LOG_MAX);
    return { ...base, ledger };
}

// 旧存档（v1/v2）主角六维：旧名按 Q1 换成战斗六维，分值 round(值/5) 限 3–18；六项读不全时返回 null。
export function legacyScores(state) {
    const skills = state && isObj(state.protagonist) && isObj(state.protagonist.skills) ? state.protagonist.skills : {};
    const out = {};
    for (const [old, label] of Object.entries(LEGACY_ATTRIBUTE_MAP)) {
        const v = Number(skills[old] && skills[old].value);
        if (Number.isFinite(v)) out[label] = Math.max(3, Math.min(18, Math.round(v / 5)));
    }
    return Object.keys(out).length === LEGACY_ORDER.length ? out : null;
}

// 分值最高为主擅长、次高为次擅长、其余最低为短板；同分按 Q1 映射顺序（主 / 次取靠前，短板取靠后）。
export function prefsOfScores(scores) {
    const ranked = LEGACY_ORDER.map((label, i) => ({ key: abilityKeyOf(label), v: scores[label], i }));
    const desc = [...ranked].sort((a, b) => b.v - a.v || a.i - b.i);
    const major = desc[0].key;
    const minor = desc[1].key;
    const weak = ranked.filter((r) => r.key !== major && r.key !== minor).sort((a, b) => a.v - b.v || b.i - a.i)[0].key;
    return { major, minor, weak };
}

// 旧状态换成当前形状：去掉旧六维技能项与 bars.health；没有建卡倾向时用 prefs（由旧六维推导）。
export function normalizeLegacyState(state, prefs = null) {
    if (!isObj(state) || !isObj(state.protagonist)) return state;
    const p = state.protagonist;
    const skills = {};
    for (const [k, v] of Object.entries(isObj(p.skills) ? p.skills : {})) if (!Object.hasOwn(LEGACY_ATTRIBUTE_MAP, k) && !LEGACY_ORDER.includes(k)) skills[k] = v;
    const { health: _health, ...bars } = isObj(p.bars) ? p.bars : {};
    return { ...state, protagonist: { ...p, skills, bars, prefs: isObj(p.prefs) ? p.prefs : prefs } };
}

// 旧 igs_stats 一次性导入：按楼 entries → floor（锚点取该楼该 swipe 当前正文的标签摘要），catalog / learned / chatEnabled → 聊天级记录，
// initial → init（写在最后：读到 init 即导入完成；中途失败重试时同一内容得到同一 ID，不重复）。楼层已不存在的条目及以它为基准的条目不导入。
export function importLegacyStats(raw, { chatId = '', chat = [], createdAt = 0 } = {}) {
    const r = deserializeLedger(raw, chatId);
    if (!r.ok) return r;
    const { ledger } = r;
    const scores = legacyScores(currentStatsState(ledger)) || legacyScores(ledger.initial);
    const prefs = scores ? prefsOfScores(scores) : null;
    const memo = new Map();
    const norm = (s) => { if (!memo.has(s)) memo.set(s, normalizeLegacyState(s, prefs)); return memo.get(s); };
    const records = [];
    const expected = new Map();
    const idOf = new Map();
    const skipped = [];
    for (const e of [...ledger.entries.values()].sort((a, b) => a.messageId - b.messageId || a.swipeId - b.swipeId)) {
        const baseEntry = activeEntryBefore(ledger, e.messageId);
        const baseKey = baseEntry ? ledgerKey(ledger, baseEntry.messageId, baseEntry.swipeId) : null;
        const text = swipeTextOf(chat, e.messageId, e.swipeId);
        if ((baseKey && !idOf.has(baseKey)) || text === null) { skipped.push(e.messageId); continue; }
        const rec = floorRecord({
            messageId: e.messageId, swipeId: e.swipeId, tagHash: statTagHash(text), baseId: baseKey ? idOf.get(baseKey) : null,
            seed: e.seed, before: norm(e.before), after: norm(e.after), changes: e.changes, meta: e.meta, createdAt,
        });
        idOf.set(ledgerKey(ledger, e.messageId, e.swipeId), rec.id);
        expected.set(rec.id, norm(e.after));
        records.push(rec);
    }
    const chatMap = chatEntries({ chatEnabled: r.chatEnabled, catalog: r.catalog, learned: r.learned });
    records.push(...diffChatRecords(new Map(), chatMap, { tag: 'import', createdAt }));
    const init = initRecord(norm(ledger.initial), { legacy: { version: Number(raw.version), scores }, createdAt });
    records.push(init);
    return { ok: true, records, expected, chat: chatMap, initId: init.id, skipped, dropped: r.dropped, learnedDropped: r.learnedDropped };
}

const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
    : isObj(v) ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
        : JSON.stringify(v));

// 导入读回核对：从表里归并出的 init、每条楼层状态与聊天级数据须与旧存档一致。
export function verifyStatImport(merged, imported) {
    if (!merged || merged.ok !== true || merged.initId !== imported.initId) return { ok: false, reason: 'stats-import-init-unverified' };
    for (const [id, state] of imported.expected) {
        if (stable(merged.stateOf(id)) !== stable(state)) return { ok: false, reason: 'stats-import-floor-unverified', id };
    }
    if (stable([...merged.baseline]) !== stable([...imported.chat])) return { ok: false, reason: 'stats-import-chat-unverified' };
    return { ok: true };
}


