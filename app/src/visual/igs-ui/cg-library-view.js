// CG 库界面状态（不碰 DOM），工具栏面板和设置页共用。
// 打开：先读目录（每张一条轻记录）马上出列表；随后后台对账，只有真有新图 / 删图时才动列表。
// 翻页：只为当前页取缩略图，最多 3 张同时读；每张单独通知（onChange('thumb', key)），界面只换那一格。
// 状态文字永远说清楚在做哪一步、做到第几张、哪张失败了为什么。
import { CG_PAGE_SIZE, cgPageSlice, cgReasonText, filterCgEntries } from '../../media/cg-library.js';

const THUMB_MEMORY = 240;
const THUMB_WORKERS = 3;

export function createCgLibraryView(library, options = {}) {
    const pageSize = Number(options.pageSize) > 0 ? Number(options.pageSize) : CG_PAGE_SIZE;
    let onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    const state = {
        phase: 'idle',
        sync: null,
        syncNote: '',
        notice: '',
        error: '',
        filters: { favoritesOnly: false, showHidden: false, chatId: '' },
        all: [],
        list: [],
        page: 0,
        pages: 1,
        entries: [],
    };
    const thumbs = new Map();
    const thumbState = new Map();
    const thumbReason = new Map();
    let openGen = 0;
    let pageGen = 0;
    let queue = [];
    let active = 0;
    let opening = null;
    let reading = 0;
    let waiters = [];

    const emit = (type, key) => { try { onChange(type, key); } catch { /* 界面刷新出错不打断读取 */ } };
    const busy = () => Boolean(opening) || reading > 0 || active > 0 || queue.length > 0;
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

    function remember(key, url) {
        thumbs.delete(key);
        thumbs.set(key, url);
        thumbState.set(key, 'ok');
        thumbReason.delete(key);
        if (thumbs.size <= THUMB_MEMORY) return;
        const keep = new Set(state.entries.map((e) => e.key));
        for (const old of thumbs.keys()) {
            if (thumbs.size <= THUMB_MEMORY) break;
            if (!keep.has(old)) { thumbs.delete(old); thumbState.delete(old); }
        }
    }

    function dropEntry(key) {
        state.all = state.all.map((e) => (e.key === key ? { ...e, ready: false } : e));
        const before = pageKeys();
        recompute();
        if (before !== pageKeys()) { emit('list'); loadPageThumbs(); }
    }

    function pump() {
        while (active < THUMB_WORKERS && queue.length) {
            const entry = queue.shift();
            const gen = pageGen;
            active += 1;
            Promise.resolve()
                .then(() => library.makeThumb(entry))
                .catch(() => ({ ok: false, reason: 'thumb-failed' }))
                .then((result) => {
                    active -= 1;
                    if (result && result.ok) remember(entry.key, result.dataUrl);
                    else {
                        const reason = (result && result.reason) || 'thumb-failed';
                        thumbState.set(entry.key, 'failed');
                        thumbReason.set(entry.key, reason);
                        if (reason === 'missing') dropEntry(entry.key);
                    }
                    if (gen === pageGen) emit('thumb', entry.key);
                    pump();
                    wake();
                });
        }
    }

    async function loadPageThumbs() {
        const gen = ++pageGen;
        for (const e of queue) if (thumbState.get(e.key) === 'loading') thumbState.delete(e.key);
        queue = [];
        const need = state.entries.filter((e) => !thumbs.has(e.key) && thumbState.get(e.key) !== 'loading');
        if (!need.length) { emit('status'); wake(); return; }
        for (const e of need) thumbState.set(e.key, 'loading');
        emit('status');
        let cached = new Map();
        reading += 1;
        try { cached = await library.readThumbs(need); } catch { cached = new Map(); } finally { reading -= 1; }
        if (gen !== pageGen) { for (const e of need) if (thumbState.get(e.key) === 'loading') thumbState.delete(e.key); wake(); return; }
        for (const [key, url] of cached) { remember(key, url); emit('thumb', key); }
        queue = need.filter((e) => !thumbs.has(e.key));
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
        state.page = 0;
        recompute();
        emit('list');
        loadPageThumbs();
    }

    function retry(key) {
        const entry = state.entries.find((e) => e.key === key);
        if (!entry || thumbState.get(key) === 'loading') return;
        thumbs.delete(key);
        thumbReason.delete(key);
        thumbState.set(key, 'loading');
        queue.push(entry);
        emit('thumb', key);
        pump();
    }

    function removeKeys(keys) {
        const gone = new Set(keys || []);
        if (!gone.size) return;
        state.all = state.all.filter((e) => !gone.has(e.key));
        for (const key of gone) { thumbs.delete(key); thumbState.delete(key); thumbReason.delete(key); }
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
        let ok = 0;
        let loading = 0;
        let failed = 0;
        for (const e of state.entries) {
            const s = thumbs.has(e.key) ? 'ok' : thumbState.get(e.key);
            if (s === 'ok') ok += 1;
            else if (s === 'failed') failed += 1;
            else loading += 1;
        }
        return { ok, loading, failed };
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
        const s = thumbState.get(key);
        if (s === 'failed') return { state: 'failed', url: '', reason: cgReasonText(thumbReason.get(key)) };
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
            pageGen += 1;
            queue = [];
            onChange = () => {};
        },
    };
}
