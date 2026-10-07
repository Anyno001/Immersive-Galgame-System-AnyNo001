// CG 库界面状态（不碰 DOM），工具栏面板和设置页共用。
// 打开：先读目录（每张一条轻记录）马上出列表；随后后台对账，只有真有新图 / 删图时才动列表。
// 翻页：只为当前页取缩略图，最多 3 张同时读；每张单独通知（onChange('thumb', key)），界面只换那一格。
// 状态文字永远说清楚在做哪一步、做到第几张、哪张失败了为什么。
import { CG_PAGE_SIZE, cgPageSlice, cgReasonText, filterCgEntries } from '../../media/cg-library.js';

const THUMB_MEMORY = 240;
const THUMB_WORKERS = 3;
const ORDER_KEY = 'igs:cg-order:v1';

// 排序偏好工具栏面板和设置页共用（options.storage）；读写失败按默认的最新在前。
function readOldestFirst(storage) {
    try { return Boolean(storage && storage.getItem(ORDER_KEY) === 'oldest'); } catch { return false; }
}

function writeOldestFirst(storage, on) {
    try { if (storage) storage.setItem(ORDER_KEY, on ? 'oldest' : 'newest'); } catch { /* 存不下就只在这次打开里生效 */ }
}

export function createCgLibraryView(library, options = {}) {
    const pageSize = Number(options.pageSize) > 0 ? Number(options.pageSize) : CG_PAGE_SIZE;
    let onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    const state = {
        phase: 'idle',
        sync: null,
        syncNote: '',
        notice: '',
        error: '',
        filters: { favoritesOnly: false, showHidden: false, chatId: '', oldestFirst: readOldestFirst(options.storage) },
        all: [],
        list: [],
        page: 0,
        pages: 1,
        entries: [],
    };
    // 每张图只在一处：thumbs = 已显示，failed = 失败，batching = 正在查已存缩略图，queue = 排队现做，working = 正在现做。
    // 读到的结果一律记下并通知界面，不按「第几轮」丢弃；界面自己判断那一格还在不在本页。
    const thumbs = new Map();
    const failed = new Map();
    const batching = new Set();
    const working = new Set();
    let openGen = 0;
    let queue = [];
    let opening = null;
    let disposed = false;
    let waiters = [];

    const emit = (type, key) => {
        try { onChange(type, key); } catch (error) { console.warn('[IGS] CG 库界面刷新失败', type, error); }
    };
    const busy = () => Boolean(opening) || batching.size > 0 || working.size > 0 || queue.length > 0;
    const wake = () => {
        if (busy()) return;
        const list = waiters;
        waiters = [];
        for (const resolve of list) resolve();
    };

    function recompute() {
        state.list = filterCgEntries(state.all, state.filters);
        const sliced = cgPageSlice(state.list, state.page, pageSize);
        state.page = sliced.page;
        state.pages = sliced.pages;
        state.entries = sliced.items;
    }

    const pageKeys = () => state.entries.map((e) => e.key).join('\n');

    const onPage = (key) => state.entries.some((e) => e.key === key);
    const pending = (key) => batching.has(key) || working.has(key) || queue.some((e) => e.key === key);

    function remember(key, url) {
        thumbs.delete(key);
        thumbs.set(key, url);
        failed.delete(key);
        if (thumbs.size <= THUMB_MEMORY) return;
        for (const old of thumbs.keys()) {
            if (thumbs.size <= THUMB_MEMORY) break;
            if (!onPage(old)) thumbs.delete(old);
        }
    }

    function dropEntry(key) {
        state.all = state.all.map((e) => (e.key === key ? { ...e, ready: false } : e));
        const before = pageKeys();
        recompute();
        if (before !== pageKeys()) { emit('list'); loadPageThumbs(); }
    }

    function finish(key) {
        working.delete(key);
        emit('thumb', key);
        pump();
        wake();
    }

    function pump() {
        if (disposed) return;
        while (working.size < THUMB_WORKERS && queue.length) {
            const entry = queue.shift();
            working.add(entry.key);
            Promise.resolve()
                .then(() => library.makeThumb(entry))
                .catch(() => ({ ok: false, reason: 'thumb-failed' }))
                .then((result) => {
                    if (result && result.ok) remember(entry.key, result.dataUrl);
                    else {
                        const reason = (result && result.reason) || 'thumb-failed';
                        failed.set(entry.key, reason);
                        if (reason === 'missing') dropEntry(entry.key);
                    }
                    finish(entry.key);
                });
        }
    }

    // 已存缩略图按批读（一次事务），读不到的再排队现做；排队只留本页的格子。
    async function loadPageThumbs() {
        if (disposed) return;
        queue = queue.filter((e) => onPage(e.key));
        const need = state.entries.filter((e) => !thumbs.has(e.key) && !failed.has(e.key) && !pending(e.key));
        if (!need.length) { emit('status'); wake(); return; }
        for (const e of need) batching.add(e.key);
        emit('status');
        let cached = new Map();
        try { cached = await library.readThumbs(need); } catch { cached = new Map(); }
        for (const e of need) batching.delete(e.key);
        if (disposed) { wake(); return; }
        for (const e of need) {
            const url = cached.get(e.key);
            if (url) { remember(e.key, url); emit('thumb', e.key); }
            else if (onPage(e.key) && !pending(e.key) && !thumbs.has(e.key)) queue.push(state.entries.find((x) => x.key === e.key) || e);
        }
        pump();
        emit('status');
        wake();
    }

    async function runOpen(gen) {
        state.phase = 'loading';
        state.error = '';
        state.syncNote = '';
        state.sync = null;
        emit('list');
        if (!library) { state.phase = 'error'; state.error = 'CG 库不可用'; emit('list'); return; }
        const index = await library.readIndex();
        if (gen !== openGen) return;
        const fromIndex = index.ok && index.entries.length > 0;
        if (fromIndex) {
            state.all = index.entries;
            recompute();
            state.phase = 'ready';
            emit('list');
            loadPageThumbs();
        }
        state.sync = { phase: 'keys', done: 0, total: 0, first: !fromIndex };
        emit('status');
        const synced = await library.syncIndex((progress) => {
            if (gen !== openGen) return;
            state.sync = { ...state.sync, ...progress };
            emit('status');
        });
        if (gen !== openGen) return;
        state.sync = null;
        if (!synced.ok && !synced.entries.length && !fromIndex) {
            state.phase = 'error';
            state.error = `CG 库读取失败：${cgReasonText(synced.reason)}。点「刷新」重试。`;
            emit('list');
            return;
        }
        state.syncNote = synced.ok ? '' : `有一部分没读到：${cgReasonText(synced.reason)}。已显示能读到的，点「刷新」重试。`;
        const before = pageKeys();
        const total = state.list.length;
        state.all = synced.entries;
        recompute();
        if (!fromIndex || before !== pageKeys() || total !== state.list.length) {
            state.phase = 'ready';
            emit('list');
            loadPageThumbs();
        } else {
            state.phase = 'ready';
            emit('status');
        }
    }

    function open(filters) {
        if (filters) state.filters = { ...state.filters, ...filters };
        const gen = ++openGen;
        state.notice = '';
        const job = runOpen(gen).catch(() => {
            if (gen !== openGen) return;
            state.phase = 'error';
            state.error = 'CG 库读取失败，点「刷新」重试。';
            emit('list');
        }).finally(() => {
            if (opening === job) opening = null;
            wake();
        });
        opening = job;
        return job;
    }

    function goto(page) {
        state.page = Math.max(0, Number(page) || 0);
        recompute();
        emit('list');
        loadPageThumbs();
    }

    function setFilters(patch) {
        state.filters = { ...state.filters, ...patch };
        if (patch && Object.hasOwn(patch, 'oldestFirst')) writeOldestFirst(options.storage, state.filters.oldestFirst);
        state.page = 0;
        recompute();
        emit('list');
        loadPageThumbs();
    }

    function retry(key) {
        const entry = state.entries.find((e) => e.key === key);
        if (!entry || pending(key)) return;
        thumbs.delete(key);
        failed.delete(key);
        queue.push(entry);
        emit('thumb', key);
        pump();
    }

    function removeKeys(keys) {
        const gone = new Set(keys || []);
        if (!gone.size) return;
        state.all = state.all.filter((e) => !gone.has(e.key));
        for (const key of gone) { thumbs.delete(key); failed.delete(key); }
        queue = queue.filter((e) => !gone.has(e.key));
        recompute();
        emit('list');
        loadPageThumbs();
    }

    function patchEntry(key, fields) {
        state.all = state.all.map((e) => (e.key === key ? { ...e, ...fields } : e));
        recompute();
        emit('list');
        loadPageThumbs();
    }

    function thumbCounts() {
        const c = { ok: 0, loading: 0, failed: 0 };
        for (const e of state.entries) c[tileOf(e.key).state] += 1;
        return c;
    }

    function statusText() {
        if (state.phase === 'error') return state.error;
        const parts = [];
        const sync = state.sync;
        if (sync && sync.phase === 'index' && sync.total) {
            parts.push(`${sync.first ? '第一次打开，正在建立 CG 目录（以后打开直接读目录）' : '正在登记新图'}：${sync.done} / ${sync.total} 条`);
        } else if (sync) {
            parts.push(state.phase === 'ready' ? '正在核对有没有新图' : '正在读取插图库和相册的编号');
        } else if (state.phase === 'loading') {
            parts.push('正在读取 CG 目录');
        }
        if (state.phase === 'ready' && state.entries.length) {
            const c = thumbCounts();
            if (c.loading) parts.push(`本页缩略图：已显示 ${c.ok} / ${state.entries.length}，正在读取 ${c.loading} 张${c.failed ? `，${c.failed} 张失败` : ''}`);
            else if (c.failed) parts.push(`本页有 ${c.failed} 张读取失败，点那一格重试`);
        }
        if (state.syncNote) parts.push(state.syncNote);
        if (state.notice) parts.push(state.notice);
        return parts.join(' · ');
    }

    function tileOf(key) {
        const url = thumbs.get(key) || '';
        if (url) return { state: 'ok', url, reason: '' };
        if (failed.has(key)) return { state: 'failed', url: '', reason: cgReasonText(failed.get(key)) };
        return { state: 'loading', url: '', reason: '' };
    }

    return {
        state,
        open,
        goto,
        setFilters,
        retry,
        removeKeys,
        patchEntry,
        tileOf,
        statusText,
        setNotice(text) { state.notice = String(text || ''); emit('status'); },
        find: (key) => state.entries.find((e) => e.key === key) || null,
        readFull: (entry) => library.readFull(entry),
        whenIdle: () => (busy() ? new Promise((resolve) => { waiters.push(resolve); }) : Promise.resolve()),
        dispose() {
            openGen += 1;
            disposed = true;
            queue = [];
            onChange = () => {};
        },
    };
}
