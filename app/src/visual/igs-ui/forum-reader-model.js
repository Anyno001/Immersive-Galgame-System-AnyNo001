import { storyClock } from './phone-sense.js';
import { feedStableCount } from '../../scene/feed-platforms.js';
import { FORUM_BOARDS, FORUM_BOARD_DEFAULT, FORUM_IMAGE_REF_LINES, FORUM_LINES } from './forum-reader-lines.js';
import { normalizeForumReaderSettings } from './forum-reader-settings.js';
import { describePo, samePo, threadAt, titleAt } from './forum-reader-threads.js';

export { normalizeForumReaderSettings } from './forum-reader-settings.js';
export { threadAt, titleAt } from './forum-reader-threads.js';

// 论坛体阅读模式的纯函数：楼号、时间、ID、点缀回帖、楼主与代号。不读 DOM、不碰存储。
export const FORUM_USER_KEY = '{{user}}';
const NO_BASE = 5500000;
const NO_STEP = 7;
const FLOOR_SLOTS = 10;
const REPLY_MINUTES = [2, 9];
const QUOTE_MAX = 18;
const PASSERS = 6;
const ELLIPSIS_TAIL = /(?:…+|\.{3,}|——|—|－|－－)\s*$/;
const MOOD_WORDS = /心动|害羞|脸红|羞|喜欢|甜|爱|暧昧|紧张|慌/;

export function forumHash(text) {
    let h = 2166136261;
    for (const ch of String(text == null ? '' : text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
}

function base36(seed, length = 8) {
    let out = '';
    let h = forumHash(seed);
    while (out.length < length) {
        out += (h % 36).toString(36);
        h = Math.imul(h ^ (h >>> 13), 2246822519) >>> 0;
        if (!h) h = 2654435761;
    }
    return out;
}

// 楼号：每个酒馆楼占 10 个序号，显示值单调递增，同一聊天重看不变。
export function forumSlot(messageId, k) {
    return (Math.max(0, Number(messageId) || 0)) * FLOOR_SLOTS + Math.min(FLOOR_SLOTS - 1, Math.max(0, k)) + 1;
}

export function forumNo(chatId, messageId, k) {
    return NO_BASE + forumSlot(messageId, k) * NO_STEP + (forumHash(chatId) % NO_STEP);
}

export function forumPoId(chatId, threadId = '') {
    const seed = `po|${chatId}${threadId}`;
    return `${base36(seed, 1).toUpperCase()}${base36(seed, 7)}`;
}

// 路人 ID：同帖约 6 个身份轮换，同一个路人会再出现；两个帖子各有一群追帖的人。
export function forumPasserId(chatId, slot, threadId = '') {
    return base36(`passer|${chatId}|${threadId}|${slot % PASSERS}`, 8);
}

const pad = (n) => String(n).padStart(2, '0');

// send_date 里取时分：兼容 17h42m、5:42pm、17:42 三种常见写法；取不到返回 null。
export function sendClock(sendDate) {
    const text = String(sendDate == null ? '' : sendDate);
    let m = text.match(/(\d{1,2})h(\d{2})m/);
    if (m) return `${pad(Number(m[1]) % 24)}:${m[2]}`;
    m = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?/i);
    if (!m) return null;
    let hour = Number(m[1]);
    const mer = (m[3] || '').toLowerCase();
    if (mer === 'pm' && hour < 12) hour += 12;
    if (mer === 'am' && hour === 12) hour = 0;
    return hour < 24 && Number(m[2]) < 60 ? `${pad(hour)}:${m[2]}` : null;
}

// 本条的时钟：剧情时间优先，其次发送时间，都没有就不显示。同楼第 k 条依次推后 2~9 分钟。
export function forumClock({ sceneTime, sendDate, seed = '', k = 0 }) {
    const story = storyClock(sceneTime);
    const base = story ? story.time : sendClock(sendDate);
    if (!base) return '';
    let minutes = Number(base.slice(0, 2)) * 60 + Number(base.slice(3, 5));
    for (let i = 1; i <= k; i++) minutes += feedStableCount(`${seed}:${i}`, REPLY_MINUTES[0], REPLY_MINUTES[1]);
    minutes %= 24 * 60;
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

// ---------- 登记 ----------
// chatMetadata.igs_forum = { board, manualBoard, threads:[{ id, po, poId, titles:[{from,title,fb?}], alias, seq, manual }], timeline:[{ from, thread }] }。
// 每个楼主一个帖子；from 是酒馆楼 messageId。第 N 楼用哪个帖子、哪个标题由 threadAt / titleAt 查表算出，不存排版结果。
const MAX_THREADS = 12;

export function emptyForum() {
    return { board: '', manualBoard: false, threads: [], timeline: [] };
}

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanPo(value) {
    const po = plain(value);
    if (po.kind === 'user') return { kind: 'user' };
    if (po.kind === 'witness') return { kind: 'witness', note: String(po.note || '').slice(0, 40) };
    if (po.kind === 'char' && po.key) return { kind: 'char', key: String(po.key).slice(0, 80) };
    return null;
}

const wholeFrom = (value) => Math.max(0, Math.round(Number(value) || 0));

export function cleanThread(value) {
    const src = plain(value);
    const alias = {};
    for (const [key, name] of Object.entries(plain(src.alias))) {
        const k = String(key || '').trim().slice(0, 80);
        const n = String(name || '').trim().slice(0, 24);
        if (k && n) alias[k] = n;
    }
    const manual = plain(src.manual);
    const titles = (Array.isArray(src.titles) ? src.titles : [])
        .map((t) => ({ from: wholeFrom(plain(t).from), title: String(plain(t).title || '').trim().slice(0, 80), ...(plain(t).fb === true ? { fb: true } : {}) }))
        .filter((t) => t.title)
        .sort((x, y) => x.from - y.from);
    return {
        id: String(src.id || ''),
        po: cleanPo(src.po),
        poId: String(src.poId || '').slice(0, 8),
        titles,
        alias,
        seq: Math.max(0, Math.round(Number(src.seq) || 0)),
        manual: { title: manual.title === true, alias: { ...plain(manual.alias) }, asked: { ...plain(manual.asked) } },
    };
}

export function normalizeForum(value) {
    const src = plain(value);
    const threads = [];
    for (const raw of Array.isArray(src.threads) ? src.threads : []) {
        const t = cleanThread(raw);
        if (/^t\d+$/.test(t.id) && !threads.some((x) => x.id === t.id) && threads.length < MAX_THREADS) threads.push(t);
    }
    const byFrom = new Map();
    for (const entry of Array.isArray(src.timeline) ? src.timeline : []) {
        const e = plain(entry);
        if (threads.some((t) => t.id === e.thread)) byFrom.set(wholeFrom(e.from), { from: wholeFrom(e.from), thread: e.thread });
    }
    return {
        board: String(src.board || '').trim().slice(0, 24),
        manualBoard: src.manualBoard === true,
        threads,
        timeline: [...byFrom.values()].sort((a, b) => a.from - b.from),
    };
}

export function forumThreadById(data, id) {
    return (data && Array.isArray(data.threads) ? data.threads : []).find((t) => t.id === id) || null;
}

// 写回一个改过的帖子，其余原样。
export function replaceForumThread(data, thread) {
    return { ...data, threads: data.threads.map((t) => (t.id === thread.id ? thread : t)) };
}

// [igs-forum:标题|楼主=…|角色名=代号|…] 的字段：楼主=角色名 / 楼主=路人:身份 / 楼主={{user}}。
export function parseForumTag(body) {
    const fields = String(body || '').split('|').map((f) => f.trim()).filter(Boolean);
    const out = { title: '', po: null, alias: [] };
    for (const field of fields) {
        const eq = field.search(/[=＝]/);
        if (eq < 0) { if (!out.title) out.title = field; continue; }
        const name = field.slice(0, eq).trim();
        const value = field.slice(eq + 1).trim();
        if (!name || !value) continue;
        if (name === '楼主') {
            const witness = value.match(/^路人\s*[:：]?\s*(.*)$/);
            if (witness) out.po = { kind: 'witness', note: witness[1].trim() };
            else if (/^\{\{\s*user\s*\}\}$/i.test(value)) out.po = { kind: 'user' };
            else out.po = { kind: 'char', name: value };
        } else out.alias.push([name, value]);
    }
    return out;
}

// AI 写的回帖 [igs-reply:谁|>N|内容]：谁 = 楼主 或 路人代称（同名即同一个 ID）；>N 可省，表示回本轮第 N 条回帖；>上N 表示回上一轮第 N 条回帖；只写内容则当作一个新路人。
// 返回 [{ who, to, prev, text }]，who 以 # 开头表示匿名新路人（已按序号编成不重复的名字）。
export function forumRepliesOf(source) {
    const out = [];
    let anon = 0;
    for (const m of String(source || '').matchAll(/[\[【［]\s*igs\s*-?\s*reply\s*[:：]([^\]】］\n]*)[\]】］]/gi)) {
        const fields = m[1].split('|').map((f) => f.trim());
        let who = '';
        let to = 0;
        let prev = 0;
        if (fields.length > 1) who = fields.shift();
        const ref = fields.length > 1 ? fields[0].match(/^[>＞]\s*(上)?\s*(\d+)$/) : null;
        if (ref) {
            fields.shift();
            if (ref[1]) prev = Number(ref[2]);
            else to = Number(ref[2]);
        }
        const text = Array.from(fields.join('|').trim()).slice(0, 60).join('');
        if (!text) continue;
        if (/^(楼主|po主?|lz)$/i.test(who)) who = '楼主';
        else if (!who) who = `#${anon++}`;
        out.push({ who, to, prev, text });
    }
    return out;
}

// 上一轮 AI 回帖：从当前楼往前找最近一个有 [igs-reply] 的 AI 楼。chat 为酒馆聊天数组。
export function forumPrevRepliesOf(chat, beforeId) {
    if (!Array.isArray(chat)) return [];
    for (let i = Math.min(chat.length, Math.round(Number(beforeId) || 0)) - 1; i >= 0; i--) {
        const m = chat[i];
        if (!m || m.is_user || m.is_system) continue;
        const found = forumRepliesOf(m.mes);
        if (found.length) return found;
    }
    return [];
}

export function forumReplyQuote(text) {
    const chars = Array.from(String(text || '').trim());
    return chars.length > QUOTE_MAX ? `${chars.slice(0, QUOTE_MAX).join('')}…` : chars.join('');
}

// 有名字的路人跨轮沿用同一个 ID；匿名路人按本轮出场顺序取轮换 ID。
function writtenPasserId(chatId, who, slot, threadId) {
    return who.startsWith('#') ? forumPasserId(chatId, slot, threadId) : base36(`passer|${chatId}|${threadId}|name:${who}`, 8);
}

export function forumTagsOf(source) {
    const found = [];
    for (const m of String(source || '').matchAll(/\[igs-forum[:：]([^\]\n]*)\]/gi)) found.push(parseForumTag(m[1]));
    return found;
}

// 设置里「双楼主」的两个人都填了才生效；每项写法同标签（角色名 / {{user}} / 路人:身份）。返回 [po, po] 或 null。
export function forumPairOf(settings, keyOfName = (n) => n) {
    const st = normalizeForumReaderSettings(settings);
    if (st.poster !== 'pair') return null;
    const list = st.posterPair.map((text) => {
        const po = text ? parseForumTag(`楼主=${text}`).po : null;
        return po ? resolveTagPo(po, keyOfName, true) : null;
    });
    return list[0] && list[1] ? list : null;
}

export function forumKeyResolver(known, userNames = []) {
    return (name) => {
        if (/^\{\{\s*user\s*\}\}$/i.test(name) || userNames.includes(name)) return FORUM_USER_KEY;
        return known(name) || '';
    };
}

function resolveTagPo(po, keyOfName, keepRaw = false) {
    if (!po) return null;
    if (po.kind !== 'char') return cleanPo(po);
    const key = keyOfName(po.name);
    if (key === FORUM_USER_KEY) return { kind: 'user' };
    if (key) return { kind: 'char', key };
    return keepRaw && po.name ? { kind: 'char', key: po.name } : null;
}

// 一楼自己的标签写进登记，写在本楼 messageId 上，与渲染顺序无关：先清掉本楼旧条目（swipe / 重写后重算，幂等），再按本楼标签重新登记。
// opts：chatId、known、userNames、posterLock、pair（[po,po] 或 null）、fallbackPo、firstFloor、fallbackTitle。返回 { data, dropped, threadId }。
export function applyFloorTags(data, messageId, tags, opts = {}) {
    const { known = (n) => n, userNames = [], posterLock = 'auto', pair = null, fallbackPo = null, firstFloor = messageId, fallbackTitle = '', chatId = '' } = opts;
    const id = wholeFrom(messageId);
    const next = normalizeForum(data);
    const dropped = [];
    const keyOfName = forumKeyResolver(known, userNames);
    next.timeline = next.timeline.filter((e) => e.from !== id);
    for (const t of next.threads) t.titles = t.titles.filter((e) => e.from !== id);
    next.threads = next.threads.filter((t) => next.timeline.some((e) => e.thread === t.id) || t.titles.length || t.manual.title || Object.keys(t.alias).length);

    let po = null;
    if (posterLock === 'auto' || pair) {
        for (const tag of tags) {
            const r = tag.po ? resolveTagPo(tag.po, keyOfName) : null;
            if (r) po = r;
            else if (tag.po && tag.po.kind === 'char') dropped.push(tag.po.name);
        }
        if (po && pair && !pair.some((p) => samePo(p, po))) { dropped.push(describePo(po)); po = null; }
    }
    const create = (who) => {
        let n = 1;
        while (next.threads.some((t) => t.id === `t${n}`)) n += 1;
        const t = cleanThread({ id: `t${n}`, po: who || { kind: 'witness', note: '' } });
        t.poId = forumPoId(chatId, t.id);
        next.threads.push(t);
        return t;
    };
    const cur = threadAt(next, id);
    let thread = cur;
    if (po && !(cur && samePo(cur.po, po))) {
        thread = next.threads.find((t) => samePo(t.po, po)) || create(po);
        next.timeline.push({ from: id, thread: thread.id });
    } else if (!thread) {
        thread = create(fallbackPo);
        next.timeline.push({ from: Math.min(wholeFrom(firstFloor), id), thread: thread.id });
    }
    if (!thread.poId) thread.poId = forumPoId(chatId, thread.id);

    let tagTitle = '';
    for (const tag of tags) if (tag.title) tagTitle = tag.title.slice(0, 80);
    if (tagTitle && !thread.manual.title && tagTitle !== titleAt(thread, id)) {
        if (thread.titles.length && thread.titles.every((e) => e.fb)) thread.titles = [{ from: thread.titles[0].from, title: tagTitle }];
        else thread.titles.push({ from: id, title: tagTitle });
    } else if (!thread.titles.length && fallbackTitle) {
        const first = next.timeline.filter((e) => e.thread === thread.id).map((e) => e.from);
        thread.titles.push({ from: first.length ? Math.min(...first) : id, title: fallbackTitle.slice(0, 80), fb: true });
    }
    for (const tag of tags) {
        for (const [name, code] of tag.alias) {
            const key = keyOfName(name);
            if (!key) { dropped.push(name); continue; }
            if (thread.manual.alias[key]) continue;
            thread.alias[key] = code.slice(0, 24);
        }
    }
    for (const t of next.threads) t.titles.sort((a, b) => a.from - b.from);
    next.timeline.sort((a, b) => a.from - b.from);
    return { data: next, dropped, threadId: thread.id };
}

// 第 N 楼的帖子标记：start = 要出完整帖子头（第一个楼或换帖子的楼）；retitle = 本楼改了标题（非帖子第一条，且不同时是帖子头）。
export function floorMarks(data, messageId) {
    const id = wholeFrom(messageId);
    const thread = threadAt(data, id);
    const timeline = (data && data.timeline) || [];
    const start = !timeline.length || id <= timeline[0].from || timeline.some((e) => e.from === id);
    const index = thread ? thread.titles.findIndex((e) => e.from === id && !e.fb) : -1;
    return { thread, start, retitle: !start && index > 0 ? thread.titles[index].title : '' };
}

// 楼主：设置锁定 > 本帖登记 > 兜底（双楼主取第一个人，再到本卡主角，再到第一个非 User 说话人）。
export function resolvePoster({ thread, settings, defaultChar = '', firstSpeaker = '', pair = null }) {
    const st = normalizeForumReaderSettings(settings);
    const stored = thread && thread.po;
    const fallbackChar = defaultChar || firstSpeaker || '';
    if (st.poster === 'user') return { kind: 'user' };
    if (st.poster === 'witness') return { kind: 'witness', note: stored && stored.kind === 'witness' ? stored.note : '' };
    if (st.poster === 'char') return stored && stored.kind === 'char' ? stored : (fallbackChar ? { kind: 'char', key: fallbackChar } : { kind: 'witness', note: '' });
    if (stored) return stored;
    if (pair) return pair[0];
    return fallbackChar ? { kind: 'char', key: fallbackChar } : { kind: 'witness', note: '' };
}

// 角色（含 User）第一次出现且没有代号：按出场顺序给 A / B / C…，并记下序号。楼主本人不需要。操作单个帖子。
export function ensureAliases(thread, keys, posterKey = '') {
    const next = cleanThread(thread);
    let changed = false;
    for (const key of keys) {
        if (!key || key === posterKey || next.alias[key]) continue;
        next.alias[key] = String.fromCharCode(65 + (next.seq % 26)) + (next.seq >= 26 ? String(Math.floor(next.seq / 26)) : '');
        next.seq += 1;
        changed = true;
    }
    return { thread: next, changed };
}

export function forumBoardOf(data, worldview = '') {
    return normalizeForum(data).board || FORUM_BOARDS[worldview] || FORUM_BOARD_DEFAULT;
}

export function forumFallbackTitle(poster, sceneName = '') {
    const lead = poster && poster.kind === 'witness' ? '【围观】' : '【连载】';
    return `${lead}${sceneName || '今天发生的事'}`;
}

// ---------- 行改写：代号、「我」、心里话 ----------

function escapeRe(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// names：[原名, 替换] 列表；长名优先，避免「小雪」先吃掉「小雪儿」。
export function replaceNames(text, pairs) {
    const list = pairs.filter(([from, to]) => from && to && from !== to).sort((a, b) => b[0].length - a[0].length);
    if (!list.length) return String(text == null ? '' : text);
    const re = new RegExp(list.map(([from]) => escapeRe(from)).join('|'), 'g');
    const map = new Map(list);
    return String(text == null ? '' : text).replace(re, (m) => map.get(m));
}

// 渲染用的行：楼主是角色 / User 时他的台词显示「我」；其余人用代号；心里话按设置处理。
// ctx：poster、alias（主名→代号）、userKey、userNames（User 的显示名）、namesOf(主名)→别名数组、settings。
export function forumRowsOf(rows, ctx) {
    const { poster, alias = {}, userKey = '', userNames = [], namesOf = () => [], settings } = ctx;
    const st = normalizeForumReaderSettings(settings);
    const posterKey = poster.kind === 'char' ? poster.key : poster.kind === 'user' ? FORUM_USER_KEY : '';
    const aliasOf = (key) => (key === posterKey ? '我' : alias[key] || '');
    const pairs = [];
    for (const [key, code] of Object.entries({ ...alias, ...(posterKey ? { [posterKey]: '我' } : {}) })) {
        const names = key === FORUM_USER_KEY ? userNames : [key, ...namesOf(key)];
        for (const name of names) pairs.push([String(name || '').trim(), code]);
    }
    return rows.map((row) => {
        const key = row.key && userKey && row.key === userKey ? FORUM_USER_KEY : row.key;
        const mine = Boolean(key) && key === posterKey;
        const code = key ? aliasOf(key) || row.speaker : '';
        // 说话人自己的名字（和「我」这类人称）留在他自己的台词里，只换别人的称呼。
        const own = new Set(key === FORUM_USER_KEY ? userNames : [key, ...namesOf(key)]);
        const text = replaceNames(row.text, row.kind === 'dialogue' || row.kind === 'thought' ? pairs.filter(([from]) => !own.has(from)) : pairs);
        const out = { ...row, text, forumKey: key, mine, who: code };
        if (row.kind === 'thought') {
            if (mine) return { ...out, kind: 'narr', thought: false, plain: true };
            if (st.othersThoughts === 'hide') return { ...out, hidden: true };
            return { ...out, who: code };
        }
        if (row.kind === 'dialogue') return { ...out, who: mine ? '我' : code };
        return out;
    });
}

// ---------- 分楼与点缀 ----------

function lastSentence(text) {
    const flat = String(text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const parts = flat.split(/(?<=[。！？!?…])/).map((s) => s.trim()).filter(Boolean);
    const last = parts.length ? parts[parts.length - 1] : flat;
    const chars = Array.from(last);
    return chars.length > QUOTE_MAX ? `${chars.slice(0, QUOTE_MAX).join('').replace(/[，、；：,;:\s]+$/, '')}…` : last;
}

function pick(list, seed) {
    return list[forumHash(seed) % list.length];
}

// 附图：换场景那一行附场景图（同一场景只附第一次），CG 在它第一次出现的那一行附上；同一行两者都有时只附 CG。
// pick(row) → { scene:{ url, key, nsfw }, cg:{ url, key, nsfw } }（各自可空）。返回 Map(行号 → { kind, url, key, nsfw, file })。
export function forumImagesOf(rows, pick, seed = '') {
    const out = new Map();
    const seenScene = new Set();
    let lastCg = '';
    rows.forEach((row, i) => {
        const got = (row && !row.solo ? pick(row) : null) || {};
        const cg = got.cg && got.cg.key ? got.cg : null;
        const cgKey = cg ? cg.key : '';
        const freshCg = cg && cgKey !== lastCg;
        lastCg = cgKey;
        if (!row || row.hidden || row.solo) return;
        const scene = got.scene && got.scene.key && (row.scene || i === 0) && !seenScene.has(got.scene.key) ? got.scene : null;
        if (scene) seenScene.add(scene.key);
        const hit = freshCg && cg.url ? { ...cg, kind: 'cg' } : scene && scene.url ? { ...scene, kind: 'scene' } : null;
        if (hit) out.set(row.index ?? i, { ...hit, nsfw: hit.nsfw === true, file: forumFileName(`${seed}|${hit.key}`) });
    });
    return out;
}

// 附图文件名与大小：按种子算，重看不变。
export function forumFileName(seed) {
    const h = forumHash(seed);
    return `IMG_${String(1000 + (h % 9000))}.jpg (${120 + ((h >>> 8) % 380)}KB)`;
}

// 楼层计划：把行分成若干 PO 主楼（超过 perPost 行或换场景另起一楼），每楼之后排 0–2 条点缀回帖。
// 返回 posts[]：{ start, end, k, no, id, time, replies:[{ k, no, id, time, text, quote, ref }] }。纯函数，同输入同输出。
export function forumPlan(rows, ctx) {
    const { chatId = '', messageId = 0, settings, poId = '', threadId = '', sceneTime = '', sendDate = '', aiReplies = [], images = null, posterKind = '', threadStart = false, prevReplies = [] } = ctx;
    const st = normalizeForumReaderSettings(settings);
    const seedBase = `${chatId}:${messageId}`;
    const shown = rows.map((row, i) => ({ row, i })).filter(({ row }) => !row.hidden);
    const posts = [];
    let cur = null;
    for (const { row, i } of shown) {
        if (!cur || (row.scene && i > cur.start) || cur.count >= st.perPost) {
            cur = { start: i, end: i, count: 0, scene: Boolean(row.scene), moods: false };
            posts.push(cur);
        }
        cur.end = i;
        cur.count += 1;
        if (images && images.has(row.index ?? i)) cur.image = true;
        if (row.mood && MOOD_WORDS.test(row.mood)) cur.moods = true;
    }
    const used = new Set();
    let k = 0;
    const perGap = { off: [0, 0], few: [0, 1], normal: [0, 2] }[st.replies];
    const clock = (n) => forumClock({ sceneTime, sendDate, seed: seedBase, k: n });
    // AI 写了回帖就用 AI 的（均摊到各楼之后，最多 FLOOR_SLOTS 条）；没写才用内置短句。
    const written = st.replies === 'off' ? [] : aiReplies.slice(0, Math.max(0, FLOOR_SLOTS - posts.length));
    const writtenAt = posts.map(() => []);
    const passerSlots = new Map();
    const writtenNos = [];
    written.forEach((text, i) => writtenAt[Math.max(0, Math.floor(((i + 1) * posts.length) / written.length) - 1)].push(text));
    return posts.map((post, n) => {
        const own = k;
        k += 1;
        const text = rows.slice(post.start, post.end + 1).filter((r) => !r.hidden).map((r) => r.text).filter(Boolean);
        const tail = text.length ? text[text.length - 1] : '';
        const out = { start: post.start, end: post.end, k: own, no: forumNo(chatId, messageId, own), id: poId, time: clock(own), replies: [] };
        if (written.length) {
            for (const item of writtenAt[n]) {
                const po = item.who === '楼主';
                if (!po && !passerSlots.has(item.who)) passerSlots.set(item.who, passerSlots.size);
                const no = forumNo(chatId, messageId, k);
                const target = item.to > 0 && item.to <= writtenNos.length ? writtenNos[item.to - 1] : 0;
                const earlier = item.prev > 0 ? prevReplies[item.prev - 1] : null;
                writtenNos.push(no);
                out.replies.push({ k, no, id: po ? poId : writtenPasserId(chatId, item.who, passerSlots.get(item.who) || 0, threadId), po, time: clock(k), text: item.text, quote: earlier ? forumReplyQuote(earlier.text) : '', ref: target });
                k += 1;
            }
            return out;
        }
        const count = perGap[1] === 0 ? 0 : feedStableCount(`${seedBase}:r${n}`, perGap[0], perGap[1]);
        for (let r = 0; r < count && k < FLOOR_SLOTS; r++) {
            if (post.image) {
                const own = posterKind === 'witness' ? FORUM_LINES.imageWitness : posterKind === 'char' ? FORUM_LINES.imageSelf : [];
                const pool = [...FORUM_LINES.image, ...own].filter((line) => !used.has(line));
                const line = pool.length ? pick(pool, `${seedBase}:i${n}:${r}`) : pick(FORUM_LINES.base, `${seedBase}:i${n}:${r}`);
                used.add(line);
                const ref = FORUM_IMAGE_REF_LINES.includes(line) ? out.no : 0;
                out.replies.push({ k, no: forumNo(chatId, messageId, k), id: forumPasserId(chatId, forumHash(`${seedBase}:p${k}`), threadId), time: clock(k), text: line, quote: '', ref });
                k += 1;
                continue;
            }
            const category = threadStart && n === 0 ? 'opening' : ELLIPSIS_TAIL.test(tail) ? 'ellipsis' : post.moods ? 'mood' : post.scene && n > 0 ? 'scene' : post.count >= st.perPost ? 'long' : 'base';
            const pool = [...FORUM_LINES[category], ...FORUM_LINES.base].filter((line) => !used.has(line));
            const line = pool.length ? pick(pool, `${seedBase}:l${n}:${r}`) : pick(FORUM_LINES.base, `${seedBase}:l${n}:${r}`);
            used.add(line);
            const roll = feedStableCount(`${seedBase}:q${n}:${r}`, 0, 2);
            const quote = roll === 0 && tail ? lastSentence(tail) : '';
            const ref = roll === 1 ? out.no : 0;
            out.replies.push({ k, no: forumNo(chatId, messageId, k), id: forumPasserId(chatId, forumHash(`${seedBase}:p${k}`), threadId), time: clock(k), text: line, quote, ref });
            k += 1;
        }
        return out;
    });
}

export function forumSettingsOf(readerSettings) {
    const s = normalizeForumReaderSettings(readerSettings && readerSettings.forumReader);
    return s.chain ? s : { ...s, perTap: 1 };
}
