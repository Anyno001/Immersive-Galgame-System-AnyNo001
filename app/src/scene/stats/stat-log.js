// 数值存档的差分记录（v0.39 存储层）：楼层记录只存结算前后状态的路径差分，聊天级设置存成键值记录。
// 全部是纯函数：表读写由 core/stats-runtime.js 经 statsTables 完成，这里只负责「状态 ⇄ 记录」的互转与校验。
// 记录类型：init 初始状态；floor 楼层差分（锚点 = 楼号 + swipe + 正文标签哈希）；其余为聊天级键值（chat/skill/merge/sheet/base/queue/notified/learned）。
import { hash32 } from '../../combat/random.js';
import { BUILD_CHOICES, BUILD_MODES, abilityKeyOf } from '../../combat/abilities.js';
import { STATS_LOG_MAX, createStatsLedger, currentStatsState, ledgerKey } from './stat-ledger.js';
import { deserializeLedger, sanitizeCatalog, sanitizeLearned } from './stat-persist.js';

export { BUILD_CHOICES, BUILD_MODES };

export const STAT_LOG_CHARACTER = '主角';
// 正文里与数值相关的标签（igs-stat 与 igs-check）。标签变了，对应楼层记录就不再适用。
const TAG_PATTERN = /[\[【]\s*igs\s*-?\s*stat\s*[:：][^\]】]*[\]】]|\[igs-check:[^\]\n]*\]/gi;
const META_KEYS = Object.freeze(['check', 'checks', 'preroll', 'note', 'flags', 'pendingRoll', 'favorMode', 'manual']);
const TYPE_OF_PREFIX = Object.freeze({ chat: 'chat', skill: 'skill-def', merge: 'skill-merge', sheet: 'sheet', base: 'base', edit: 'base', hero: 'base', queue: 'queue', notified: 'notified', learned: 'learned' });
export const STAT_CHAT_RECORD_TYPES = Object.freeze(Object.values(TYPE_OF_PREFIX));
// 旧存档的六个属性名 → 战斗六维名（含原样保留的三项），用来从旧百分制属性反推六维倾向。
const LEGACY_SCORE_NAMES = Object.freeze({ 健康: '体质', 力量: '力量', 敏捷: '敏捷', 理智: '智力', 观察: '感知', 魅力: '魅力' });
const SIX = Object.freeze(['体质', '力量', '敏捷', '智力', '感知', '魅力']);
const SAN_NAME = '理智';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const short = (v) => hash32(v).toString(36);

export const normalizeBuildMode = (mode) => (BUILD_MODES.includes(mode) ? mode : null);

// 正文里数值标签的哈希：只看标签本身，改叙述文字不影响。
export function statTagHash(text) {
    const tags = (String(text ?? '').match(TAG_PATTERN) || []).map((t) => t.replace(/\s+/g, '').replace(/【/g, '[').replace(/】/g, ']').replace(/：/g, ':').replace(/｜/g, '|'));
    return `st${short(tags.join('\n'))}`;
}

// 取某楼某 swipe 的正文；用户楼、越界、没有该 swipe 返回 null。
export function swipeTextOf(chat, messageId, swipeId) {
    const message = Array.isArray(chat) ? chat[messageId] : null;
    if (!message || message.is_user) return null;
    const current = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    if (swipeId === current) return String(message.mes ?? '');
    return Array.isArray(message.swipes) && typeof message.swipes[swipeId] === 'string' ? message.swipes[swipeId] : null;
}

// 路径差分：前后同引用直接返回；删除的键只记路径，改动的记 { p, v }。
export function diffState(before, after, path = [], out = []) {
    if (before === after) return out;
    if (isObject(before) && isObject(after)) {
        for (const key of Object.keys(after)) if (after[key] !== undefined) diffState(before[key], after[key], [...path, key], out);
        for (const key of Object.keys(before)) if (before[key] !== undefined && after[key] === undefined) out.push({ p: [...path, key] });
        return out;
    }
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ p: path, v: after });
    return out;
}

function applyOne(node, path, op) {
    if (!path.length) return Object.hasOwn(op, 'v') ? op.v : undefined;
    const [head, ...rest] = path;
    const next = isObject(node) ? { ...node } : {};
    if (!rest.length && !Object.hasOwn(op, 'v')) delete next[head];
    else next[head] = applyOne(next[head], rest, op);
    return next;
}

// 把差分套到状态上（浅拷贝沿路径，不改入参）。
export function applyOps(state, ops) {
    let current = state;
    for (const op of Array.isArray(ops) ? ops : []) if (op && Array.isArray(op.p)) current = applyOne(current, op.p, op);
    return current;
}

function metaToStore(meta) {
    if (!isObject(meta)) return null;
    const out = {};
    for (const key of META_KEYS) if (meta[key]) out[key] = meta[key];
    return Object.keys(out).length ? out : null;
}

const changeText = (changes) => changes.slice(0, 4).map((c) => `${c.target ?? ''}${c.key ?? ''}${c.from ?? ''}→${c.to ?? ''}`).join('；').slice(0, 40);

export function floorRecord({ messageId, swipeId, tagHash, baseId = null, seed, before, after, changes = [], meta = null, createdAt = 0 }) {
    const payload = { base: baseId, seed, ops: diffState(before, after), changes: Array.isArray(changes) ? changes : [] };
    const kept = metaToStore(meta);
    if (kept) payload.meta = kept;
    return { id: `sf|${messageId}|${swipeId}|${tagHash}|${short(JSON.stringify(payload))}`, type: 'floor', character: STAT_LOG_CHARACTER, anchor: { messageId, swipeId, tagHash, occurrence: 0 }, createdAt, change: changeText(payload.changes), payload };
}

export function initRecord(state, { legacy = null, createdAt = 0 } = {}) {
    const payload = legacy ? { state, legacy } : { state };
    return { id: `si|${short(JSON.stringify(payload))}`, type: 'init', character: STAT_LOG_CHARACTER, anchor: null, createdAt, change: legacy ? '旧存档导入' : '建卡', payload };
}

export function normalizeBuildChoices(raw) {
    if (!isObject(raw)) return {};
    const rows = Object.entries(raw).filter(([key, value]) => key && key.length <= 40 && BUILD_CHOICES.includes(value));
    return Object.fromEntries(rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

// 聊天级设置 → 键值表（Map：键 → 值）。
export function chatEntries({ chatEnabled = false, catalog = null, learned = {}, buildMode = null, buildChoices = {} } = {}) {
    const clean = sanitizeCatalog(catalog);
    const map = new Map([['chat:enabled', Boolean(chatEnabled)]]);
    if (normalizeBuildMode(buildMode)) map.set('chat:buildMode', buildMode);
    const choices = normalizeBuildChoices(buildChoices);
    if (Object.keys(choices).length) map.set('chat:buildChoices', choices);
    for (const skill of clean.story) map.set(`skill:${skill.name}`, skill);
    for (const [from, to] of Object.entries(clean.merged)) map.set(`merge:${from}`, to);
    for (const [name, sheet] of Object.entries(clean.sheets)) map.set(`sheet:${name}`, sheet);
    for (const [name, value] of Object.entries(clean.protagonistBase)) map.set(`base:${name}`, value);
    for (const [name, value] of Object.entries(clean.protagonistEdit)) map.set(`edit:${name}`, value);
    if (clean.heroAssigned) map.set('hero:assigned', true);
    map.set('queue:skills', clean.queue.skills);
    map.set('queue:people', clean.queue.people);
    map.set('notified:all', clean.notified);
    for (const [word, skill] of Object.entries(sanitizeLearned(learned).learned)) map.set(`learned:${word}`, skill);
    return map;
}

// 键不在表里时的默认值：用来判断「删除」与「回到默认」是否等同，避免写出多余记录。
const CHAT_DEFAULTS = new Map([['chat:enabled', false], ['queue:skills', []], ['queue:people', []], ['notified:all', []]]);
const valueOrDefault = (map, key) => (map.has(key) ? map.get(key) : CHAT_DEFAULTS.get(key));

// 两份聊天级键值表的差异 → 聊天级记录（只含有变化的键）。
export function diffChatRecords(baseline, entries, { tag = '', createdAt = 0 } = {}) {
    const records = [];
    for (const key of new Set([...baseline.keys(), ...entries.keys()])) {
        const before = valueOrDefault(baseline, key);
        const after = valueOrDefault(entries, key);
        if (before === after || JSON.stringify(before) === JSON.stringify(after)) continue;
        const payload = after === undefined ? { key, removed: true } : { key, value: after };
        records.push({ id: `sc|${tag}|${short(`${key}\n${JSON.stringify(payload)}`)}`, type: TYPE_OF_PREFIX[key.slice(0, key.indexOf(':'))], character: STAT_LOG_CHARACTER, anchor: null, createdAt, change: key.slice(0, 40), payload });
    }
    return records;
}

// 键值表 → 聊天级设置对象（diffChatRecords 的逆过程）。
export function restoreChat(map) {
    const raw = { story: [], merged: {}, sheets: {}, protagonistBase: {}, protagonistEdit: {}, heroAssigned: false, queue: { skills: [], people: [] }, notified: [] };
    const learned = {};
    let chatEnabled = false;
    let buildMode = null;
    let buildChoices = {};
    for (const [key, value] of map) {
        const colon = key.indexOf(':');
        const prefix = key.slice(0, colon);
        const name = key.slice(colon + 1);
        if (prefix === 'chat' && name === 'enabled') chatEnabled = value === true;
        else if (prefix === 'chat' && name === 'buildMode') buildMode = normalizeBuildMode(value);
        else if (prefix === 'chat' && name === 'buildChoices') buildChoices = normalizeBuildChoices(value);
        else if (prefix === 'skill') raw.story.push(value);
        else if (prefix === 'merge') raw.merged[name] = value;
        else if (prefix === 'sheet') raw.sheets[name] = value;
        else if (prefix === 'base') raw.protagonistBase[name] = value;
        else if (prefix === 'edit') raw.protagonistEdit[name] = value;
        else if (prefix === 'hero' && name === 'assigned') raw.heroAssigned = value === true;
        else if (prefix === 'queue' && (name === 'skills' || name === 'people')) raw.queue[name] = value;
        else if (prefix === 'notified') raw.notified = value;
        else if (prefix === 'learned') learned[name] = value;
    }
    return { chatEnabled, buildMode, buildChoices, catalog: sanitizeCatalog(raw), learned: sanitizeLearned(learned).learned };
}

// 读取：init 记录 + 聊天级记录（表内顺序重放，后写覆盖先写）+ 与当前正文标签相符的楼层记录 → 账本。
// 返回的 stateOf(id) 沿 base 链从 init 往上套差分并记忆化。
export function mergeStatLog(records, { chatId = '', chat = [] } = {}) {
    const rows = Array.isArray(records) ? records.filter(Boolean) : [];
    const diagnostics = [];
    // 启用后、首楼结算前导入人物会追加新的 init，取最后一条。
    const init = rows.slice().reverse().find((r) => r.type === 'init' && isObject(r.payload) && isObject(r.payload.state)) || null;
    const chatMap = new Map();
    for (const r of rows) {
        if (!STAT_CHAT_RECORD_TYPES.includes(r.type) || !isObject(r.payload) || typeof r.payload.key !== 'string') continue;
        chatMap.delete(r.payload.key);
        if (!r.payload.removed) chatMap.set(r.payload.key, r.payload.value);
    }
    const restored = restoreChat(chatMap);
    const floors = new Map();
    for (const r of rows) if (r.type === 'floor' && isObject(r.anchor) && isObject(r.payload)) floors.set(r.id, r);
    const initState = init ? init.payload.state : undefined;
    const memo = new Map();
    const stateOf = (id) => {
        const path = [];
        const seen = new Set();
        let cursor = id ?? null;
        while (cursor !== null && !memo.has(cursor)) {
            const row = floors.get(cursor);
            if (!row || seen.has(cursor)) return undefined;
            seen.add(cursor);
            path.push(cursor);
            cursor = row.payload.base ?? null;
        }
        let state = cursor === null ? initState : memo.get(cursor);
        for (let i = path.length - 1; i >= 0; i -= 1) {
            state = state === undefined ? undefined : applyOps(state, floors.get(path[i]).payload.ops);
            memo.set(path[i], state);
        }
        return state;
    };
    const result = { ok: true, initId: init ? init.id : null, ...restored, baseline: chatEntries(restored), diagnostics, stateOf };
    if (!init) return { ...result, ledger: null };
    // 同楼同 swipe 只认表里最后一条正文标签仍匹配的记录。
    const live = new Map();
    for (const row of floors.values()) {
        const { messageId, swipeId, tagHash } = row.anchor;
        if (!Number.isInteger(messageId) || !Number.isInteger(swipeId)) continue;
        const text = swipeTextOf(chat, messageId, swipeId);
        if (text === null || statTagHash(text) !== tagHash) continue;
        const slot = `${messageId}|${swipeId}`;
        live.delete(slot);
        live.set(slot, row);
    }
    const ledger = createStatsLedger(chatId, initState);
    for (const row of live.values()) {
        const baseId = row.payload.base ?? null;
        const after = stateOf(row.id);
        const before = stateOf(baseId);
        const { messageId, swipeId } = row.anchor;
        if (after === undefined || before === undefined) { diagnostics.push({ code: 'stats-log-chain-broken', messageId }); continue; }
        ledger.entries.set(ledgerKey(ledger, messageId, swipeId), { messageId, swipeId, seed: row.payload.seed, before, after, changes: Array.isArray(row.payload.changes) ? row.payload.changes : [], meta: isObject(row.payload.meta) ? row.payload.meta : null, recordId: row.id, baseId });
    }
    for (const entry of ledger.entries.values()) {
        const message = chat[entry.messageId];
        if (message && (Number.isInteger(message.swipe_id) ? message.swipe_id : 0) === entry.swipeId) ledger.active.set(entry.messageId, entry.swipeId);
    }
    ledger.log = [...ledger.active].sort((a, b) => a[0] - b[0]).flatMap(([messageId, swipeId]) => {
        const floor = ledgerKey(ledger, messageId, swipeId);
        return ledger.entries.get(floor).changes.map((change) => ({ floor, ...change }));
    }).slice(-STATS_LOG_MAX);
    return { ...result, ledger };
}

// ---- 旧存档（igs_stats 整体快照）导入 ----

// 旧主角属性分（百分制）→ 战斗六维分数（÷5，夹到 3–18）；六项不齐返回 null。
export function legacyScores(state) {
    const skills = state && isObject(state.protagonist) && isObject(state.protagonist.skills) ? state.protagonist.skills : {};
    const scores = {};
    for (const [oldName, newName] of Object.entries(LEGACY_SCORE_NAMES)) {
        const value = Number(skills[oldName] && skills[oldName].value);
        if (Number.isFinite(value)) scores[newName] = Math.max(3, Math.min(18, Math.round(value / 5)));
    }
    return Object.keys(scores).length === SIX.length ? scores : null;
}

// 六维分数 → 倾向：最高为主擅长，次高为次擅长，其余里最低为短板（并列按六维顺序）。
export function prefsOfScores(scores) {
    const rows = SIX.map((name, index) => ({ key: abilityKeyOf(name), v: scores[name], i: index }));
    const sorted = [...rows].sort((a, b) => b.v - a.v || a.i - b.i);
    const major = sorted[0].key;
    const minor = sorted[1].key;
    const weak = rows.filter((r) => r.key !== major && r.key !== minor).sort((a, b) => a.v - b.v || b.i - a.i)[0].key;
    return { major, minor, weak };
}

// 旧状态 → 新结构：丢弃旧属性分与生命条，补 prefs。唯独主角「理智」保留（CoC 的理智值，成长打勾也在这里）。
export function normalizeLegacyState(state, prefs = null) {
    if (!isObject(state) || !isObject(state.protagonist)) return state;
    const protagonist = state.protagonist;
    const skills = {};
    for (const [name, entry] of Object.entries(isObject(protagonist.skills) ? protagonist.skills : {})) {
        if (name === SAN_NAME || (!Object.hasOwn(LEGACY_SCORE_NAMES, name) && !SIX.includes(name))) skills[name] = entry;
    }
    const { health, ...bars } = isObject(protagonist.bars) ? protagonist.bars : {};
    return { ...state, protagonist: { ...protagonist, skills, bars, prefs: isObject(protagonist.prefs) ? protagonist.prefs : prefs } };
}

// 该楼之前最近的存活楼层键（沿 active 找 messageId 更小的最新一楼）。
function activeKeyBefore(ledger, messageId) {
    let best = null;
    for (const [id, swipeId] of ledger.active) if (id < messageId && (!best || id > best.id)) best = { id, swipeId };
    return best ? ledgerKey(ledger, best.id, best.swipeId) : null;
}

// 旧存档 → 全部新记录（楼层差分 + 聊天级目录 + init）。每楼检定 meta 原样带过（含 check.ruleset，CoC 历史检定不变）。
// 旧 sheet.attributes 由 deserializeLedger → sanitizeCatalog 迁移成六维分数，不再丢弃。
export function importLegacyStats(raw, { chatId = '', chat = [], createdAt = 0 } = {}) {
    const loaded = deserializeLedger(raw, chatId);
    if (!loaded.ok) return loaded;
    const { ledger } = loaded;
    const scores = legacyScores(currentStatsState(ledger)) || legacyScores(ledger.initial);
    const prefs = scores ? prefsOfScores(scores) : null;
    const cache = new Map();
    const normalized = (state) => { if (!cache.has(state)) cache.set(state, normalizeLegacyState(state, prefs)); return cache.get(state); };
    const records = [];
    const expected = new Map();
    const recordIdOf = new Map();
    const skipped = [];
    const ordered = [...ledger.entries.values()].sort((a, b) => a.messageId - b.messageId || a.swipeId - b.swipeId);
    for (const entry of ordered) {
        const prevKey = activeKeyBefore(ledger, entry.messageId);
        const text = swipeTextOf(chat, entry.messageId, entry.swipeId);
        if ((prevKey && !recordIdOf.has(prevKey)) || text === null) { skipped.push(entry.messageId); continue; }
        const record = floorRecord({ messageId: entry.messageId, swipeId: entry.swipeId, tagHash: statTagHash(text), baseId: prevKey ? recordIdOf.get(prevKey) : null, seed: entry.seed, before: normalized(entry.before), after: normalized(entry.after), changes: entry.changes, meta: entry.meta, createdAt });
        recordIdOf.set(ledgerKey(ledger, entry.messageId, entry.swipeId), record.id);
        expected.set(record.id, normalized(entry.after));
        records.push(record);
    }
    const chatMap = chatEntries({ chatEnabled: loaded.chatEnabled, catalog: loaded.catalog, learned: loaded.learned });
    records.push(...diffChatRecords(new Map(), chatMap, { tag: 'import', createdAt }));
    const init = initRecord(normalized(ledger.initial), { legacy: { version: Number(raw.version), scores }, createdAt });
    records.push(init);
    return { ok: true, records, expected, chat: chatMap, initId: init.id, skipped, dropped: loaded.dropped, learnedDropped: loaded.learnedDropped };
}

// 键排序的稳定序列化，用于导入后的读回比对。
const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]` : isObject(v) ? `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v));

// 读回校验：init 对得上、每个楼层状态逐条一致、聊天级键值一致。
export function verifyStatImport(merged, plan) {
    if (!merged || merged.ok !== true || merged.initId !== plan.initId) return { ok: false, reason: 'stats-import-init-unverified' };
    for (const [id, state] of plan.expected) if (stable(merged.stateOf(id)) !== stable(state)) return { ok: false, reason: 'stats-import-floor-unverified', id };
    if (stable([...merged.baseline]) !== stable([...plan.chat])) return { ok: false, reason: 'stats-import-chat-unverified' };
    return { ok: true };
}
