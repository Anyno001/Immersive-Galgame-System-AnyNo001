// 设置器「世界书筛选」：取消勾选的书或条目不参与生图写词，主聊天不受影响。排除名单存 bridge.imageApi.worldInfoExclude。
import { CARD_BOOK, countWorldInfoExclude, isWorldInfoExcluded, listActiveWorldInfoBooks, normalizeWorldInfoExclude,
    readWorldInfoBookEntries, toggleWorldInfoBook, toggleWorldInfoEntry } from '../../host/world-info-filter.js';
import { perfItem } from './fx-settings-fields.js';
import { esc } from './reader-value-utils.js';

export const WORLD_INFO_FILTER_GROUP = 'wi-filter-group';
const act = (verb, args = []) => `wi-filter:${verb}${args.map(v => ':' + encodeURIComponent(v)).join('')}`;
const button = (verb, label, args = [], disabled = false) => `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="${act(verb, args)}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
const bookLabel = name => name === CARD_BOOK ? '角色卡内嵌' : name;

function entryChips(exclude, name, loaded) {
    if (!loaded) return '<div class="igs-scene-empty">正在读取</div>';
    if (!loaded.ok) return '<div class="igs-scene-empty">读取失败</div>';
    const chip = (uid, title, missing) => {
        const on = !isWorldInfoExcluded(exclude, name, uid);
        return `<button type="button" class="igs-table-pick${on ? ' is-on' : ''}${missing ? ' is-missing' : ''}" data-action="${act('entry', [name, uid])}" aria-pressed="${on ? 'true' : 'false'}" title="${esc(title)}"><i></i><span>${esc(title)}</span></button>`;
    };
    const known = new Set(loaded.entries.map(entry => entry.uid));
    const chips = loaded.entries.map(entry => chip(entry.uid, entry.title, false))
        .concat((exclude.entries[name] || []).filter(uid => !known.has(uid)).map(uid => chip(uid, `条目 ${uid}（未找到）`, true)));
    return `<div class="igs-wi-entries">${chips.join('') || '<div class="igs-scene-empty">没有开启的条目</div>'}</div>`;
}

function bookRow(exclude, book, loaded, more) {
    const on = !exclude.books.includes(book.name);
    const off = (exclude.entries[book.name] || []).length;
    const hint = [book.missing ? '当前未启用' : book.sources.join('、'), off ? `已排除 ${off} 条` : ''].filter(Boolean).join(' · ');
    const head = `<button type="button" class="igs-switch${on ? ' is-on' : ''}" data-action="${act('book', [book.name])}" aria-pressed="${on ? 'true' : 'false'}"><i></i><span>${esc(bookLabel(book.name))}</span></button>`;
    return perfItem(more, `wi-${book.name}`, head, { on, hint, detail: entryChips(exclude, book.name, loaded) });
}

export function renderWorldInfoFilterPanel(imageApi, asyncState = {}) {
    const exclude = normalizeWorldInfoExclude(imageApi && imageApi.worldInfoExclude);
    const advancedOpen = asyncState.advancedOpen || {};
    const open = advancedOpen[WORLD_INFO_FILTER_GROUP] === true;
    const count = countWorldInfoExclude(exclude);
    const summary = `<summary><b>世界书筛选</b>${count ? `<span class="igs-perf-count is-on">已排除 ${count}</span>` : ''}</summary>`;
    let body = '';
    if (open) {
        const state = asyncState.worldInfoFilter || {};
        const more = { isOpen: key => advancedOpen['perf-' + key] === true };
        body = '<div class="igs-source-filter-note">取消勾选的书或条目不参与生图写词，不影响酒馆聊天。</div>'
            + `<div class="igs-image-prompt-actions">${button('load', state.books ? '重新读取' : '读取', [], state.loading)}${button('reset', '全部恢复', [], !count)}</div>`;
        if (!state.books) body += `<div class="igs-scene-empty">${state.loading ? '正在读取' : (state.error ? '世界书读取失败' : '尚未读取')}</div>`;
        else {
            const listed = new Set(state.books.map(book => book.name));
            const missing = [...exclude.books, ...Object.keys(exclude.entries)].filter(name => !listed.has(name));
            const books = state.books.concat([...new Set(missing)].map(name => ({ name, sources: [], missing: true })));
            body += books.map(book => bookRow(exclude, book, state.entries && state.entries[book.name], more)).join('')
                || '<div class="igs-scene-empty">当前没有启用的世界书</div>';
        }
    }
    return `<div class="igs-source-filter igs-perf-group" data-world-info-filter><details data-advanced="${WORLD_INFO_FILTER_GROUP}"${open ? ' open' : ''}>${summary}<div class="igs-perf-group-body">${body}</div></details></div>`;
}

async function loadCatalog(panel, ctx) {
    const state = panel.asyncState.worldInfoFilter ||= {};
    if (state.loading) return { ok: true };
    state.loading = true;
    state.error = '';
    ctx.rerenderSettings();
    try {
        const listed = listActiveWorldInfoBooks(ctx.global);
        if (!ctx.isCurrent()) return { ok: true, cancelled: true };
        if (!listed.ok) { state.error = listed.reason; state.books = null; return { ok: true }; }
        const exclude = normalizeWorldInfoExclude(panel.draft.bridge.imageApi.worldInfoExclude);
        const names = [...new Set([...listed.books.map(book => book.name), ...exclude.books, ...Object.keys(exclude.entries)])];
        const read = await Promise.all(names.map(name => readWorldInfoBookEntries(ctx.global, name)));
        if (!ctx.isCurrent()) return { ok: true, cancelled: true };
        state.books = listed.books;
        state.entries = Object.fromEntries(names.map((name, index) => [name, read[index]]));
        return { ok: true };
    } finally {
        state.loading = false;
    }
}

export async function handleWorldInfoFilterAction(action, ctx) {
    const { panel, persistSettingsDraft, rerenderSettings, isCurrent } = ctx;
    const [verb, ...args] = action.slice('wi-filter:'.length).split(':').map(decodeURIComponent);
    if (verb === 'open') {
        const state = panel.asyncState.worldInfoFilter ||= {};
        if (state.tried) return isCurrent() ? rerenderSettings() : { ok: true };
        state.tried = true;
    }
    if (verb === 'load' || verb === 'open') {
        const result = await loadCatalog(panel, ctx);
        if (isCurrent()) rerenderSettings();
        return result;
    }
    const imageApi = panel.draft.bridge.imageApi;
    let next;
    if (verb === 'book' && args[0]) next = toggleWorldInfoBook(imageApi.worldInfoExclude, args[0]);
    else if (verb === 'entry' && args[0] && args[1] != null) next = toggleWorldInfoEntry(imageApi.worldInfoExclude, args[0], args[1]);
    else if (verb === 'reset') next = { books: [], entries: {} };
    else return { ok: false, reason: 'unknown-world-info-filter-action' };
    panel.draft.bridge.imageApi = { ...imageApi, worldInfoExclude: next };
    const persisted = persistSettingsDraft();
    if (persisted.ok === false) return persisted;
    return rerenderSettings();
}
