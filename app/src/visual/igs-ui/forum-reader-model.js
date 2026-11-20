import { storyClock } from './phone-sense.js';
import { feedStableCount } from '../../scene/feed-platforms.js';
import { FORUM_BOARDS, FORUM_BOARD_DEFAULT, FORUM_LINES } from './forum-reader-lines.js';
import { normalizeForumReaderSettings } from './forum-reader-settings.js';

export { normalizeForumReaderSettings } from './forum-reader-settings.js';

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

export function forumPoId(chatId) {
    return `${base36(`po|${chatId}`, 1).toUpperCase()}${base36(`po|${chatId}`, 7)}`;
}

// 路人 ID：同帖约 6 个身份轮换，同一个路人会再出现。
export function forumPasserId(chatId, slot) {
    return base36(`passer|${chatId}|${slot % PASSERS}`, 8);
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

export function emptyForum() {
    return { title: '', board: '', poId: '', po: null, alias: {}, seq: 0, manual: {} };
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

export function normalizeForum(value) {
    const src = plain(value);
    const alias = {};
    for (const [key, name] of Object.entries(plain(src.alias))) {
        const k = String(key || '').trim().slice(0, 80);
        const n = String(name || '').trim().slice(0, 24);
        if (k && n) alias[k] = n;
    }
    const manual = plain(src.manual);
    return {
        title: String(src.title || '').trim().slice(0, 80),
        board: String(src.board || '').trim().slice(0, 24),
        poId: String(src.poId || '').slice(0, 8),
        po: cleanPo(src.po),
        alias,
        seq: Math.max(0, Math.round(Number(src.seq) || 0)),
        manual: { title: manual.title === true, board: manual.board === true, po: manual.po === true, alias: { ...plain(manual.alias) }, asked: { ...plain(manual.asked) } },
    };
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

// AI 写的回帖 [igs-reply:谁|>N|内容]：谁 = 楼主 或 路人代称（同名即同一个 ID）；>N 可省，表示回第 N 条回帖；只写内容则当作一个新路人。
// 返回 [{ who, to, text }]，who 为空串表示匿名新路人（已按序号编成不重复的名字）。
export function forumRepliesOf(source) {
    const out = [];
    let anon = 0;
    for (const m of String(source || '').matchAll(/[\[【［]\s*igs\s*-?\s*reply\s*[:：]([^\]】］\n]*)[\]】］]/gi)) {
        const fields = m[1].split('|').map((f) => f.trim());
        let who = '';
        let to = 0;
        if (fields.length > 1) who = fields.shift();
        if (fields.length > 1 && /^[>＞]\s*\d+$/.test(fields[0])) to = Number(fields.shift().replace(/\D/g, ''));
        const text = Array.from(fields.join('|').trim()).slice(0, 60).join('');
        if (!text) continue;
        if (/^(楼主|po主?|lz)$/i.test(who)) who = '楼主';
        else if (!who) who = `#${anon++}`;
        out.push({ who, to, text });
    }
    return out;
}

export function forumTagsOf(source) {
    const found = [];
    for (const m of String(source || '').matchAll(/\[igs-forum[:：]([^\]\n]*)\]/gi)) found.push(parseForumTag(m[1]));
    return found;
}

// 把解析出的标签并进登记。known(name) 返回已建档的主名（认不出返回空串）；认不出的角色项丢弃并计入 dropped。
// poster 锁定（char / witness / user）时忽略 AI 写的楼主；manual 标过的字段不覆盖。
export function mergeForumTag(data, tag, { known = (n) => n, posterLock = 'auto', override = true, userNames = [] } = {}) {
    const next = normalizeForum(data);
    const dropped = [];
    const manual = next.manual;
    const keyOfName = (name) => {
        if (/^\{\{\s*user\s*\}\}$/i.test(name) || userNames.includes(name)) return FORUM_USER_KEY;
        return known(name) || '';
    };
    if (tag.title && !manual.title && (override || !next.title)) next.title = tag.title.slice(0, 80);
    if (tag.po && posterLock === 'auto' && !manual.po && (override || !next.po)) {
        if (tag.po.kind === 'char') {
            const key = keyOfName(tag.po.name);
            if (key === FORUM_USER_KEY) next.po = { kind: 'user' };
            else if (key) next.po = { kind: 'char', key };
            else dropped.push(tag.po.name);
        } else next.po = cleanPo(tag.po);
    }
    for (const [name, code] of tag.alias) {
        const key = keyOfName(name);
        if (!key) { dropped.push(name); continue; }
        if (manual.alias[key] || (!override && next.alias[key])) continue;
        next.alias[key] = code.slice(0, 24);
    }
    return { data: next, dropped };
}

// 楼主：设置锁定 > 登记 > 兜底（本卡主角，再到第一个非 User 说话人）。
export function resolvePoster({ data, settings, defaultChar = '', firstSpeaker = '' }) {
    const st = normalizeForumReaderSettings(settings);
    const stored = normalizeForum(data).po;
    const fallbackChar = defaultChar || firstSpeaker || '';
    if (st.poster === 'user') return { kind: 'user' };
    if (st.poster === 'witness') return { kind: 'witness', note: stored && stored.kind === 'witness' ? stored.note : '' };
    if (st.poster === 'char') return stored && stored.kind === 'char' ? stored : (fallbackChar ? { kind: 'char', key: fallbackChar } : { kind: 'witness', note: '' });
    if (stored) return stored;
    return fallbackChar ? { kind: 'char', key: fallbackChar } : { kind: 'witness', note: '' };
}

// 角色（含 User）第一次出现且没有代号：按出场顺序给 A / B / C…，并记下序号。楼主本人不需要。
export function ensureAliases(data, keys, posterKey = '') {
    const next = normalizeForum(data);
    let changed = false;
    for (const key of keys) {
        if (!key || key === posterKey || next.alias[key]) continue;
        next.alias[key] = String.fromCharCode(65 + (next.seq % 26)) + (next.seq >= 26 ? String(Math.floor(next.seq / 26)) : '');
        next.seq += 1;
        changed = true;
    }
    return { data: next, changed };
}

export function forumBoardOf(data, worldview = '') {
    return normalizeForum(data).board || FORUM_BOARDS[worldview] || FORUM_BOARD_DEFAULT;
}

export function forumTitleOf(data, poster, sceneName = '') {
    const title = normalizeForum(data).title;
    if (title) return title;
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

// 楼层计划：把行分成若干 PO 主楼（超过 perPost 行或换场景另起一楼），每楼之后排 0–2 条点缀回帖。
// 返回 posts[]：{ start, end, k, no, id, time, replies:[{ k, no, id, time, text, quote, ref }] }。纯函数，同输入同输出。
export function forumPlan(rows, ctx) {
    const { chatId = '', messageId = 0, settings, poId = '', sceneTime = '', sendDate = '', aiReplies = [] } = ctx;
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
                writtenNos.push(no);
                out.replies.push({ k, no, id: po ? poId : forumPasserId(chatId, passerSlots.get(item.who) || 0), po, time: clock(k), text: item.text, quote: '', ref: target });
                k += 1;
            }
            return out;
        }
        const count = perGap[1] === 0 ? 0 : feedStableCount(`${seedBase}:r${n}`, perGap[0], perGap[1]);
        for (let r = 0; r < count && k < FLOOR_SLOTS; r++) {
            const category = ELLIPSIS_TAIL.test(tail) ? 'ellipsis' : post.moods ? 'mood' : post.scene && n > 0 ? 'scene' : post.count >= st.perPost ? 'long' : 'base';
            const pool = [...FORUM_LINES[category], ...FORUM_LINES.base].filter((line) => !used.has(line));
            const line = pool.length ? pick(pool, `${seedBase}:l${n}:${r}`) : pick(FORUM_LINES.base, `${seedBase}:l${n}:${r}`);
            used.add(line);
            const roll = feedStableCount(`${seedBase}:q${n}:${r}`, 0, 2);
            const quote = roll === 0 && tail ? lastSentence(tail) : '';
            const ref = roll === 1 ? out.no : 0;
            out.replies.push({ k, no: forumNo(chatId, messageId, k), id: forumPasserId(chatId, forumHash(`${seedBase}:p${k}`)), time: clock(k), text: line, quote, ref });
            k += 1;
        }
        return out;
    });
}

export function forumSettingsOf(readerSettings) {
    const s = normalizeForumReaderSettings(readerSettings && readerSettings.forumReader);
    return s.chain ? s : { ...s, perTap: 1 };
}
