// 目录面板（工具栏 turn-index）：照日记页排版——页头（返回 + 居中标题 + 配色）、左栏列表、右栏阅读面板。
// 「楼层」页：左栏快捷跳转 + 楼号输入 + 按章节（读过时记下的地点）分组的楼层列表（只渲染可见的行），
// 右栏是选中那楼的开头与「从这里读」；「存档」页：左栏快速存档 + 至多 10 个存档位，右栏是选中存档的缩略图与操作。
// 跳转只换阅读源（由 onJump 交给阅读器），不调用宿主跳楼。配色与日记、背包、设置器共用。
import { setStagePauseReason } from './stage-pause.js';
import { READING_SLOT_LIMIT } from './reading-progress.js';
import { RECORD_ICONS } from './record-icons.js';
import { recordPageHeadHtml, watchRecordPageLayout } from './record-page-shell.js';
import { RECORD_PAGE_SHELL_STYLE_TEXT } from './record-page-shell-style.js';
import { normalizeSettingsTheme, renderSettingsThemeSwitch } from './settings-theme.js';
import { IGS_HINT_THEME_STYLE_TEXT } from './igs-modal.js';
import { collectFeedPosts, feedPlatformById, isOwnPhone } from '../../scene/feed-platforms.js';
import { DIALOG_FONT_OPTIONS } from './reader-host-constants.js';
import { fontOptionsWith, loadCustomFonts, registerCustomFonts } from '../../media/custom-fonts.js';

const ROW_HEIGHT = 40;
const OVERSCAN = 8;
const ROW_SNIPPET = 40;
const DETAIL_SNIPPET = 360;
const FEED_LIST_MAX = 200;
const FEED_ROW_SNIPPET = 60;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STATE_LABEL = { read: '已读', partial: '读了一半', unread: '未读' };
const OPEN_CLASS = 'igs-turn-index-open';
const BOOKMARK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 3.5h11v17L12 16.5l-5.5 4Z"/></svg>';
const FEED_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5V16.5H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5Z"/></svg>';
const VOICE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
const MENU_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.5 7h15M4.5 12h15M4.5 17h9"/></svg>';
// 左缘右滑拉出抽屉的起点范围、开合判定距离（px）。
const SWIPE_EDGE = 28;
const SWIPE_MIN = 48;
const cssUrl = (url) => String(url || '').replace(/["\\\n\r]/g, (c) => encodeURIComponent(c));
// 目录自己的阅读设置（回想字号、楼层分组）；字体与日记共用一张表，各页分开记。
const TI_PREFS_KEY = 'igs_turn_index_prefs';
const RECORD_FONTS_KEY = 'igs_record_fonts';
const FONT_CATEGORY = 'turn-index';
const FONT_DEFAULT = 'inherit';
const LOG_FONT_SIZE = Object.freeze({ min: 13, max: 22, fallback: 15 });
const GROUPS = Object.freeze([['place', '按地点'], ['ten', '每 10 楼'], ['day', '按阅读日期'], ['none', '不分组']]);
const clampLogSize = (value) => {
    const size = Math.round(Number(value));
    return Number.isFinite(size) ? Math.min(LOG_FONT_SIZE.max, Math.max(LOG_FONT_SIZE.min, size)) : LOG_FONT_SIZE.fallback;
};
const normalizeGroup = (value) => (GROUPS.some(([key]) => key === value) ? value : 'place');

function dayLabel(day, today) {
    if (!day) return '更早';
    if (day === today) return '今天';
    const [y, m, d] = day.split('-').map(Number);
    const yesterday = new Date(today.replace(/-/g, '/'));
    yesterday.setDate(yesterday.getDate() - 1);
    if (yesterday.getFullYear() === y && yesterday.getMonth() + 1 === m && yesterday.getDate() === d) return '昨天';
    return today.slice(0, 4) === String(y) ? `${m} 月 ${d} 日` : `${y} 年 ${m} 月 ${d} 日`;
}

// 回想里的一句：去掉 HTML 与 IGS 指令、心声外层的星号。
function cleanLogText(text) {
    return String(text || '').replace(/<[^>]*>/g, '')
        .replace(/\[\/?igs-[^\]\n]*\]?/g, ' ')
        .replace(/^\s*\*+|\*+\s*$/g, '')
        .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function findAction(target) {
    let node = target;
    for (let depth = 0; node && depth < 6; depth += 1) {
        const act = typeof node.getAttribute === 'function' ? node.getAttribute('data-ti-act') : null;
        if (act) return { act, value: node.getAttribute('data-ti-value') || '' };
        node = node.parentNode;
    }
    return null;
}

function formatTime(at) {
    if (!at) return '';
    const d = new Date(at);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function positionLabel(pos) {
    return pos ? `${pos.id} 楼 · 第 ${pos.page + 1} 页` : '';
}

// options: progress, listTurns() → Promise<turn[]>, snippetOf(turn), rawOf(turn)（带 [igs-fx:...] 的原文，社区页解析帖子用）, currentId(), onJump({ id, page, pos }), onUnread(),
//          onSaveSlot(key?) → slot|null, onQuickSave(), confirm(message), prompt(message, value), tab, getTheme(), setTheme(theme)
//          回想：linesOf(turn) → [{ textType, speaker, text, page }]、avatarOf(name) → { url, crop? }|null、currentPage()、ttsOn()、speak(line) → { ok, error? }
export function createTurnIndexPanel(doc, options = {}) {
    const progress = options.progress;
    let root = null;
    let host = null;
    let turns = [];
    let ids = [];
    let rows = [];
    let tab = options.tab === 'slots' ? 'slots' : options.tab === 'feed' ? 'feed' : 'floors';
    let feedFilter = '';
    let feedKey = '';
    const feedCache = new Map();
    let collapsed = new Set();
    let previousFocus = null;
    let notice = '';
    let selectedId = null;
    let selectedSlot = '';
    let theme = '';
    // 手机窄屏：楼层列表收进左侧抽屉，回想占满全屏。
    let drawerOpen = false;
    let swipe = null;
    let unwatchLayout = () => { };
    let acting = Promise.resolve();
    const snippets = new Map();
    const logLines = new Map();
    const avatars = new Map();
    const win = doc && doc.defaultView;
    const storage = () => { try { return (win && win.localStorage) || null; } catch (_) { return null; } };
    const loadJson = (key, fallback) => { try { const raw = storage()?.getItem?.(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } };
    const saveJson = (key, value) => { try { storage()?.setItem?.(key, JSON.stringify(value)); } catch (_) { /* 存储满时只影响下次打开 */ } };
    const fontOptions = () => fontOptionsWith(DIALOG_FONT_OPTIONS, loadCustomFonts(win || globalThis));
    let prefs = { fontSize: LOG_FONT_SIZE.fallback, group: 'place' };
    let font = FONT_DEFAULT;

    const query = (selector) => (root && typeof root.querySelector === 'function' ? root.querySelector(selector) : null);
    const latestId = () => (ids.length ? ids[ids.length - 1] : null);
    // 最远读到的那楼起往后第一处没读完的楼。
    const nextUnreadId = () => {
        const far = progress.getFarthest();
        return ids.find((id) => id >= (far ? far.id : -1) && progress.floorState(id) !== 'read') ?? null;
    };

    function fullSnippet(turn) {
        const id = Number(turn && turn.id);
        if (!snippets.has(id)) {
            let text = '';
            try { text = String(options.snippetOf?.(turn) || ''); } catch (_) { text = ''; }
            snippets.set(id, text.replace(/<[^>]*>/g, '')
                // IGS 指令不进目录：台词/心声留「名字：话」，其余指令整条去掉。
                .replace(/\[igs-(?:char|thought):([^|\]\n]+)\|(?:[^|\]\n]*\|)?([^\]\n]+)\]?/g, '$1：$2')
                .replace(/\[\/?igs-[^\]\n]*\]?/g, ' ').replace(/\s+/g, ' ').trim().slice(0, DETAIL_SNIPPET));
        }
        return snippets.get(id);
    }
    const snippet = (turn) => fullSnippet(turn).slice(0, ROW_SNIPPET);

    // 回想：这一楼逐页的 { textType, speaker, text, page }，由宿主按阅读器分页拆好；按楼缓存。
    function linesFor(turn) {
        const id = Number(turn && turn.id);
        if (!logLines.has(id)) {
            let list = [];
            try { list = Array.isArray(options.linesOf?.(turn)) ? options.linesOf(turn) : []; } catch (_) { list = []; }
            logLines.set(id, list.map((line) => ({ ...line, text: cleanLogText(line.text) })).filter((line) => line.text));
        }
        return logLines.get(id);
    }

    function avatarFor(name) {
        if (!avatars.has(name)) {
            let found = null;
            try { found = options.avatarOf?.(name) || null; } catch (_) { found = null; }
            avatars.set(name, found);
        }
        return avatars.get(name);
    }

    function logFaceHtml(name) {
        const found = avatarFor(name);
        if (!found || !found.url) return `<span class="igs-ti-log-face is-initial" aria-hidden="true">${escapeHtml(Array.from(name)[0] || '')}</span>`;
        const crop = found.crop;
        const style = `background-image:url(&quot;${escapeHtml(cssUrl(found.url))}&quot;)` + (crop ? `;background-size:${crop.size}% auto;background-position:${crop.x}% ${crop.y}%` : '');
        return `<span class="igs-ti-log-face${crop ? '' : ' is-cover'}" style="${style}" aria-hidden="true"></span>`;
    }

    function logEntryHtml(line, voice, current) {
        const spoken = line.textType === 'dialogue' || line.textType === 'thought';
        const name = spoken ? String(line.speaker || '').trim() : '';
        return `<li class="igs-ti-log-entry is-${spoken ? line.textType : 'narration'}"${current ? ' aria-current="true"' : ''}>`
            + (name ? logFaceHtml(name) : '<span class="igs-ti-log-face is-empty" aria-hidden="true"></span>')
            + `<button type="button" class="igs-ti-log-copy" data-ti-act="log-jump" data-ti-value="${line.page}" title="从这一页读">`
            + (name ? `<strong class="igs-ti-log-name">${escapeHtml(name)}</strong>` : '')
            + `<span class="igs-ti-log-text">${escapeHtml(line.text)}</span></button>`
            + `<button type="button" class="igs-ti-log-voice" data-ti-act="log-voice" data-ti-value="${line.page}" aria-label="重播语音"${voice ? '' : ' disabled title="未开启朗读或这一句不朗读"'}>${VOICE_ICON}</button>`
            + '</li>';
    }

    function canSpeak(line) {
        if (!options.speak) return false;
        if (typeof options.canSpeak !== 'function') return true;
        try { return options.canSpeak(line) === true; } catch (_) { return false; }
    }

    function buildRows() {
        rows = [];
        let chapter = null;
        let chapterKey = '';
        const today = prefs.group === 'day' ? todayKey() : '';
        for (const turn of turns) {
            const id = Number(turn.id);
            const name = groupName(id, today);
            if (name && name !== chapter) {
                chapter = name;
                chapterKey = `${prefs.group}:${id}`;
                rows.push({ kind: 'chapter', name, key: chapterKey });
            }
            if (chapterKey && collapsed.has(chapterKey)) continue;
            rows.push({ kind: 'floor', id, turn });
        }
    }

    function todayKey() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function groupName(id, today) {
        if (prefs.group === 'none') return '';
        if (prefs.group === 'ten') {
            const from = Math.floor(id / 10) * 10;
            return `第 ${from}–${from + 9} 楼`;
        }
        if (prefs.group === 'day') {
            if (progress.floorState(id) === 'unread') return '未读';
            return dayLabel(typeof progress.dayAt === 'function' ? progress.dayAt(id) : '', today);
        }
        return progress.chapterAt(id);
    }

    function applyLogSize() { root?.style?.setProperty?.('--igs-ti-log-size', `${prefs.fontSize}px`); }

    function applyFont() {
        const style = root?.style;
        if (!style) return;
        if (font === FONT_DEFAULT) {
            style.removeProperty?.('--igs-rp-font-ui');
            style.removeProperty?.('--igs-rp-font-body');
            return;
        }
        style.setProperty?.('--igs-rp-font-ui', font);
        style.setProperty?.('--igs-rp-font-body', font);
    }

    function selectHtml(input, label, icon, choices, value) {
        return `<label class="igs-rp-font-select" title="${escapeHtml(label)}">${icon}<select data-ti-input="${input}" aria-label="${escapeHtml(label)}">`
            + choices.map(([key, text]) => `<option value="${escapeHtml(key)}"${key === value ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('')
            + '</select></label>';
    }

    function headHtml() {
        const themeSwitch = `<div class="igs-rp-theme-switch" role="radiogroup" aria-label="界面配色">${renderSettingsThemeSwitch(theme, {
            optionClass: 'igs-rp-theme-option', attrs: (value) => `data-ti-act="theme" data-ti-value="${value}"` })}</div>`;
        return recordPageHeadHtml('目录', { closeAttr: 'data-ti-act', backAriaLabel: '关闭目录', trailing: selectHtml('font', '目录字体', '<b aria-hidden="true">Aa</b>', fontOptions(), font) + (options.setTheme ? themeSwitch : '') })
            + `<div class="igs-ti-tabs"><div class="igs-rp-segment" role="tablist" aria-label="目录分页">`
            + `<button type="button" role="tab" data-ti-act="tab" data-ti-value="floors" aria-pressed="${tab === 'floors'}" aria-selected="${tab === 'floors'}">${RECORD_ICONS.book}<span>楼层</span></button>`
            + `<button type="button" role="tab" data-ti-act="tab" data-ti-value="slots" aria-pressed="${tab === 'slots'}" aria-selected="${tab === 'slots'}">${BOOKMARK_ICON}<span>存档</span></button>`
            + `<button type="button" role="tab" data-ti-act="tab" data-ti-value="feed" aria-pressed="${tab === 'feed'}" aria-selected="${tab === 'feed'}">${FEED_ICON}<span>社区</span></button>`
            + `</div></div>`;
    }

    function summaryText() {
        const last = progress.getLast();
        const far = progress.getFarthest();
        const latest = latestId();
        return [
            last ? `上次 ${positionLabel(last)}` : '还没有阅读记录',
            far ? `最远 ${far.id} 楼` : '',
            latest != null ? `最新 ${latest} 楼` : '',
        ].filter(Boolean).join(' · ');
    }

    function noticeHtml() {
        return `<p class="igs-rp-notice igs-ti-notice" role="status" data-ti-notice${notice ? '' : ' hidden'}>${escapeHtml(notice)}</p>`;
    }

    function rowHtml(row, index) {
        const top = index * ROW_HEIGHT;
        if (row.kind === 'chapter') {
            const closed = collapsed.has(row.key);
            return `<button type="button" class="igs-ti-row igs-ti-chapter" style="top:${top}px" data-ti-act="chapter" data-ti-value="${escapeHtml(row.key)}" aria-expanded="${!closed}">${escapeHtml(row.name)}<span aria-hidden="true">${closed ? '▸' : '▾'}</span></button>`;
        }
        const stateName = progress.floorState(row.id);
        const current = Number(options.currentId?.()) === row.id;
        const last = progress.getLast();
        const dot = stateName === 'read' ? '' : `<i class="igs-rp-dot is-${stateName}" aria-label="${STATE_LABEL[stateName]}"></i>`;
        const mark = current ? '<small class="igs-ti-mark">当前</small>' : last && last.id === row.id ? '<small class="igs-ti-mark">书签</small>' : '';
        return `<button type="button" class="igs-ti-row igs-ti-floor is-${stateName}" style="top:${top}px" data-ti-act="select" data-ti-value="${row.id}"${selectedId === row.id ? ' aria-current="true"' : ''}>`
            + `<span class="igs-ti-no">${row.id}</span><span class="igs-ti-text">${escapeHtml(snippet(row.turn)) || '（空）'}</span>${mark}${dot}</button>`;
    }

    function paintRows() {
        const list = query('[data-ti-list]');
        const inner = query('[data-ti-inner]');
        if (!list || !inner) return;
        const height = list.clientHeight || 480;
        const from = Math.max(0, Math.floor((list.scrollTop || 0) / ROW_HEIGHT) - OVERSCAN);
        const to = Math.min(rows.length, Math.ceil(((list.scrollTop || 0) + height) / ROW_HEIGHT) + OVERSCAN);
        // 滚动事件一秒几十次：可见范围没变就不重写整块行。
        const range = `${from}:${to}:${rows.length}`;
        if (inner.dataset && inner.dataset.tiRange === range) return;
        let html = '';
        for (let i = from; i < to; i += 1) html += rowHtml(rows[i], i);
        inner.innerHTML = html;
        if (inner.dataset) inner.dataset.tiRange = range;
    }

    function floorDetailHtml() {
        const index = selectedId == null ? -1 : ids.indexOf(selectedId);
        if (index < 0) {
            const read = ids.filter((id) => progress.floorState(id) === 'read').length;
            const ratio = ids.length ? Math.round((read / ids.length) * 100) : 0;
            return `<div class="igs-ti-detail igs-ti-overview">${drawerBtnHtml()}<p class="igs-ti-meta">阅读进度</p><h3>${read} / ${ids.length} 楼</h3>`
                + `<div class="igs-ti-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ratio}"><span style="width:${ratio}%"></span></div>`
                + `<p class="igs-ti-summary">${escapeHtml(summaryText())}</p>`
                + `<p class="igs-ti-hint">在左边选一楼，看开头再决定从哪读</p></div>`;
        }
        const turn = turns[index];
        const stateName = progress.floorState(selectedId);
        const last = progress.getLast();
        const place = progress.chapterAt(selectedId);
        const meta = [`第 ${selectedId} 楼`, place, STATE_LABEL[stateName]].filter(Boolean).map(escapeHtml).join('<i aria-hidden="true">·</i>');
        const resumeHere = last && last.id === selectedId && last.page > 0
            ? `<button type="button" class="igs-rp-chip" data-ti-act="resume">续读第 ${last.page + 1} 页</button>` : '';
        const actions = `<div class="igs-ti-detail-actions"><button type="button" class="igs-rp-btn" data-ti-act="floor" data-ti-value="${selectedId}">阅读</button><button type="button" class="igs-rp-btn is-quiet" data-ti-act="floor-rewind" data-ti-value="${selectedId}">重来</button>${resumeHere}</div>`;
        const lines = linesFor(turn);
        let body;
        let sizer = '';
        if (lines.length) {
            const ttsOn = options.ttsOn?.() === true;
            const currentPage = Number(options.currentId?.()) === selectedId ? Number(options.currentPage?.()) : -1;
            body = `<ol class="igs-ti-log" aria-label="回想">${lines.map((line) => logEntryHtml(line, ttsOn && canSpeak(line), line.page === currentPage)).join('')}</ol>`;
            sizer = `<span class="igs-ti-stepper" role="group" aria-label="回想字号"><button type="button" data-ti-act="log-size" data-ti-value="-1" aria-label="减小字号" ${prefs.fontSize <= LOG_FONT_SIZE.min ? 'disabled' : ''}>A−</button>`
                + `<output aria-live="polite">${prefs.fontSize}</output><button type="button" data-ti-act="log-size" data-ti-value="1" aria-label="增大字号" ${prefs.fontSize >= LOG_FONT_SIZE.max ? 'disabled' : ''}>A+</button></span>`;
        } else {
            const text = fullSnippet(turn);
            body = `<p class="igs-ti-body">${escapeHtml(text) || '（这楼没有可读的文字）'}${text.length >= DETAIL_SNIPPET ? '…' : ''}</p>`;
        }
        return `<article class="igs-ti-detail igs-ti-log-pane" data-ti-detail><header class="igs-ti-log-head">${drawerBtnHtml()}<p class="igs-ti-meta">${meta}</p>${sizer}${actions}</header>`
            + body
            + `<footer class="igs-ti-nav"><button type="button" data-ti-act="select-step" data-ti-value="-1" ${index <= 0 ? 'disabled' : ''}>← 上一楼</button>`
            + `<span>${String(index + 1).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}</span>`
            + `<button type="button" data-ti-act="select-step" data-ti-value="1" ${index >= ids.length - 1 ? 'disabled' : ''}>下一楼 →</button></footer></article>`;
    }

    function floorsHtml() {
        const last = progress.getLast();
        const unread = nextUnreadId();
        const quick = `<div class="igs-ti-quick" role="group" aria-label="快速跳转">`
            + `<button type="button" class="igs-rp-chip" data-ti-act="resume" ${last ? '' : 'disabled'}>续读</button>`
            + `<button type="button" class="igs-rp-chip" data-ti-act="first" ${ids.length ? '' : 'disabled'}>第 0 层</button>`
            + `<button type="button" class="igs-rp-chip" data-ti-act="unread" ${unread != null ? '' : 'disabled'}>最远未读</button>`
            + `<button type="button" class="igs-rp-chip" data-ti-act="latest" ${ids.length ? '' : 'disabled'}>最新</button></div>`;
        const goto = `<div class="igs-ti-tools"><form class="igs-rp-search igs-ti-goto" data-ti-goto>${RECORD_ICONS.search}<input type="number" inputmode="numeric" min="0" placeholder="输入楼号，回车跳转" aria-label="输入楼号跳转"></form>`
            + `${selectHtml('group', '楼层分组', `<span>${escapeHtml((GROUPS.find(([key]) => key === prefs.group) || GROUPS[0])[1])}</span><i aria-hidden="true">▾</i>`, GROUPS, prefs.group)}</div>`;
        const list = rows.length
            ? `<div class="igs-ti-list" data-ti-list><div class="igs-ti-inner" data-ti-inner style="height:${rows.length * ROW_HEIGHT}px"></div></div>`
            : '<p class="igs-ti-empty">没有可读的楼层</p>';
        return `<div class="igs-ti-layout is-floors"><aside class="igs-ti-side" aria-label="楼层列表"><p class="igs-ti-summary">${escapeHtml(summaryText())}</p>${quick}${goto}${noticeHtml()}${list}</aside><div class="igs-ti-scrim" data-ti-act="drawer-close" aria-hidden="true"></div>${floorDetailHtml()}</div>`;
    }

    // 抽屉开关只在窄屏显示：「≡ 18 楼」。
    function drawerBtnHtml() {
        return `<button type="button" class="igs-ti-drawer-btn" data-ti-act="drawer" aria-label="楼层列表" aria-expanded="${drawerOpen}">${MENU_ICON}<span>${selectedId == null ? '楼层' : `${selectedId} 楼`}</span></button>`;
    }

    function slotThumb(slot, cls) {
        return slot.thumb
            ? `<img class="${cls}" src="${escapeHtml(slot.thumb)}" alt="" decoding="async" loading="lazy">`
            : `<span class="${cls} is-blank" aria-hidden="true">${RECORD_ICONS.book}</span>`;
    }

    function slotsHtml() {
        const slots = progress.listSlots();
        const quick = progress.getQuick();
        const entries = [...(quick ? [{ ...quick, key: 'quick', name: quick.name || '快速存档', isQuick: true }] : []), ...slots];
        if (selectedSlot && !entries.some((slot) => slot.key === selectedSlot)) selectedSlot = '';
        const tools = `<div class="igs-ti-quick" role="group" aria-label="存档">`
            + `<button type="button" class="igs-rp-chip" data-ti-act="quick-save">快速存档</button>`
            + `<button type="button" class="igs-rp-chip" data-ti-act="slot-new" ${slots.length >= READING_SLOT_LIMIT ? 'disabled' : ''}>存到新档位<small>${slots.length}/${READING_SLOT_LIMIT}</small></button></div>`;
        const list = entries.length
            ? `<ol class="igs-ti-slots" aria-label="存档列表">${entries.map((slot) => `<li><button type="button" data-ti-act="slot-select" data-ti-value="${escapeHtml(slot.key)}"${slot.key === selectedSlot ? ' aria-current="true"' : ''}>`
                + `${slotThumb(slot, 'igs-ti-slot-thumb')}<span class="igs-ti-slot-copy"><strong>${escapeHtml(slot.name || positionLabel(slot))}</strong><small>${escapeHtml(positionLabel(slot))} · ${formatTime(slot.at)}</small></span></button></li>`).join('')}</ol>`
            : '<p class="igs-ti-empty">还没有存档</p>';
        const chosen = entries.find((slot) => slot.key === selectedSlot);
        let detail;
        if (!chosen) {
            detail = `<div class="igs-ti-detail igs-ti-empty-pane"><span aria-hidden="true">${RECORD_ICONS.book}</span><p>${entries.length ? '选择一个存档查看' : '读到想留的地方，点「快速存档」或「存到新档位」'}</p></div>`;
        } else {
            const meta = [positionLabel(chosen), chosen.place, formatTime(chosen.at)].filter(Boolean).map(escapeHtml).join('<i aria-hidden="true">·</i>');
            const manage = chosen.isQuick ? '' : `<button type="button" class="igs-rp-chip" data-ti-act="slot-rename" data-ti-value="${escapeHtml(chosen.key)}">改名</button>`
                + `<button type="button" class="igs-rp-chip" data-ti-act="slot-over" data-ti-value="${escapeHtml(chosen.key)}">用当前位置覆盖</button>`
                + `<button type="button" class="igs-rp-chip is-danger" data-ti-act="slot-delete" data-ti-value="${escapeHtml(chosen.key)}">删除</button>`;
            detail = `<article class="igs-ti-detail">${chosen.thumb ? slotThumb(chosen, 'igs-ti-detail-thumb') : ''}<p class="igs-ti-meta">${meta}</p><h3>${escapeHtml(chosen.name || positionLabel(chosen))}</h3>`
                + (chosen.head ? `<p class="igs-ti-body">${escapeHtml(chosen.head)}</p>` : '')
                + `<div class="igs-ti-detail-actions"><button type="button" class="igs-rp-btn" data-ti-act="${chosen.isQuick ? 'quick-load' : 'slot-load'}" data-ti-value="${escapeHtml(chosen.key)}">阅读</button><button type="button" class="igs-rp-btn is-quiet" data-ti-act="slot-rewind" data-ti-value="${escapeHtml(chosen.key)}">重来</button>${manage}</div></article>`;
        }
        return `<div class="igs-ti-layout"><aside class="igs-ti-side">${tools}${noticeHtml()}${list}</aside>${detail}</div>`;
    }

    // 社区页：打开该分页时才按楼解析原文，结果按楼号缓存；最新楼在前。
    function feedPosts() {
        const all = [];
        for (let i = turns.length - 1; i >= 0; i -= 1) {
            const turn = turns[i];
            const id = Number(turn && turn.id);
            if (!Number.isInteger(id)) continue;
            if (!feedCache.has(id)) {
                let raw = '';
                try { raw = String((options.rawOf || options.snippetOf)?.(turn) || ''); } catch (_) { raw = ''; }
                feedCache.set(id, collectFeedPosts(raw).map((post, n) => ({ ...post, id, key: `${id}:${n}` })));
            }
            all.push(...feedCache.get(id));
        }
        return all;
    }

    const feedPlatformName = (id) => (feedPlatformById(id) || {}).name || String(id);

    // 偷看别人手机的条目：平台名前加「X的手机」小标。
    const peekTag = (post) => (post.owner && !isOwnPhone(post.owner, options.userName) ? `<b class="igs-ti-peek">${escapeHtml(post.owner)}的手机</b>` : '');

    // 风暴评论的小标签：红（爆红）金色、黑（爆黑）红色，实色。
    const stormTag = (post) => (post.kind === 'storm' ? `<b class="igs-ti-storm" data-tone="${post.tone === 'black' ? 'black' : 'red'}">风暴</b>` : '');

    function feedRowHtml(post) {
        const accent = (feedPlatformById(post.platform) || {}).accent || '#888';
        return `<button type="button" class="igs-ti-feed-row" data-ti-act="feed-select" data-ti-value="${escapeHtml(post.key)}"${post.key === feedKey ? ' aria-current="true"' : ''}>`
            + `<i class="igs-ti-feed-dot" style="background:${escapeHtml(accent)}" aria-hidden="true"></i>`
            + `<span class="igs-ti-feed-copy"><small>${stormTag(post)}${peekTag(post)}${post.platform ? `${escapeHtml(feedPlatformName(post.platform))} · ` : ''}${escapeHtml(post.author)}</small>`
            + `<span class="igs-ti-feed-text">${escapeHtml(Array.from(post.text.replace(/\s+/g, ' ')).slice(0, FEED_ROW_SNIPPET).join(''))}</span></span>`
            + `<span class="igs-ti-no">${post.id}</span></button>`;
    }

    function feedHtml() {
        const all = feedPosts();
        if (feedFilter && !all.some((p) => p.platform === feedFilter)) feedFilter = '';
        const shown = feedFilter ? all.filter((p) => p.platform === feedFilter) : all;
        if (feedKey && !shown.some((p) => p.key === feedKey)) feedKey = '';
        const platforms = [...new Set(all.map((p) => p.platform))].filter(Boolean);
        const chips = platforms.length
            ? `<div class="igs-ti-quick" role="group" aria-label="平台筛选">`
                + `<button type="button" class="igs-rp-chip" data-ti-act="feed-filter" data-ti-value="" aria-pressed="${!feedFilter}">全部</button>`
                + platforms.map((id) => `<button type="button" class="igs-rp-chip" data-ti-act="feed-filter" data-ti-value="${escapeHtml(id)}" aria-pressed="${feedFilter === id}">${escapeHtml(feedPlatformName(id))}</button>`).join('')
                + `</div>` : '';
        const visible = shown.slice(0, FEED_LIST_MAX);
        const list = shown.length
            ? `<div class="igs-ti-feed-list" data-ti-feed-list>${visible.map(feedRowHtml).join('')}${shown.length > FEED_LIST_MAX ? `<p class="igs-ti-empty">仅显示最近 ${FEED_LIST_MAX} 条</p>` : ''}</div>`
            : '<p class="igs-ti-empty">还没有刷到过帖子</p>';
        const chosen = shown.find((p) => p.key === feedKey);
        let detail;
        if (!chosen) {
            detail = `<div class="igs-ti-detail igs-ti-empty-pane"><span aria-hidden="true">${FEED_ICON}</span><p>正文里刷到的帖子会收在这里</p></div>`;
        } else {
            const meta = [chosen.owner && !isOwnPhone(chosen.owner, options.userName) ? `${chosen.owner}的手机` : '', chosen.platform ? feedPlatformName(chosen.platform) : '', chosen.kind === 'storm' ? '风暴' : '', `第 ${chosen.id} 楼`, chosen.extra].filter(Boolean).map(escapeHtml).join('<i aria-hidden="true">·</i>');
            const replies = chosen.replies.length
                ? `<ul class="igs-ti-feed-replies" aria-label="回复">${chosen.replies.map((r) => `<li><strong>${escapeHtml(r.author)}</strong>：${escapeHtml(r.text)}</li>`).join('')}</ul>` : '';
            detail = `<article class="igs-ti-detail"><p class="igs-ti-meta">${meta}</p><h3>${escapeHtml(chosen.author)}</h3>`
                + `<p class="igs-ti-body">${escapeHtml(chosen.text)}</p>${replies}`
                + `<div class="igs-ti-detail-actions"><button type="button" class="igs-rp-btn" data-ti-act="floor" data-ti-value="${chosen.id}">跳到这一楼</button></div></article>`;
        }
        return `<div class="igs-ti-layout"><aside class="igs-ti-side">${chips}${list}</aside>${detail}</div>`;
    }

    function render() {
        if (!root) return;
        buildRows();
        const feedList = tab === 'feed' ? query('[data-ti-feed-list]') : null;
        const feedTop = feedList ? feedList.scrollTop : 0;
        root.innerHTML = `<div class="igs-rp-page">${headHtml()}<div class="igs-rp-body"><div class="igs-ti-scroll is-${tab}">${tab === 'slots' ? slotsHtml() : tab === 'feed' ? feedHtml() : floorsHtml()}</div></div></div>`;
        const nextFeed = feedTop ? query('[data-ti-feed-list]') : null;
        if (nextFeed) nextFeed.scrollTop = feedTop;
        const list = query('[data-ti-list]');
        if (list) {
            list.addEventListener('scroll', paintRows, { passive: true });
            paintRows();
        }
        // 回想停在当前读到的那一句。
        const detail = query('[data-ti-detail]');
        const here = detail && query('.igs-ti-log-entry[aria-current="true"]');
        if (here && detail.scrollHeight > detail.clientHeight) detail.scrollTop = Math.max(0, here.offsetTop - detail.clientHeight / 2);
    }

    function setNotice(text) {
        notice = String(text || '');
        const el = query('[data-ti-notice]');
        if (!el) return;
        el.textContent = notice;
        if (notice) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
    }

    function scrollToId(id) {
        const list = query('[data-ti-list]');
        const index = rows.findIndex((row) => row.kind === 'floor' && row.id === id);
        if (!list || index < 0) return;
        list.scrollTop = Math.max(0, index * ROW_HEIGHT - (list.clientHeight || 480) / 2);
        paintRows();
    }

    // 只重画右栏和列表可见行，列表滚动位置不动。
    function selectFloor(id) {
        selectedId = ids.includes(id) ? id : null;
        const list = query('[data-ti-list]');
        const top = list ? list.scrollTop : 0;
        render();
        const next = query('[data-ti-list]');
        if (next) { next.scrollTop = top; paintRows(); }
    }

    function jump(target) {
        close();
        return options.onJump?.(target);
    }

    async function handle(act, value) {
        if (act === 'close') return close();
        if (act === 'theme') {
            theme = normalizeSettingsTheme(value);
            root?.setAttribute('data-rp-theme', theme);
            render();
            if (tab === 'floors') scrollToId(selectedId ?? Number(options.currentId?.()));
            try { options.setTheme?.(theme); } catch (_) { /* 保存失败只影响下次打开 */ }
            return null;
        }
        if (act === 'feed-filter') { feedFilter = value; feedKey = ''; render(); return null; }
        if (act === 'feed-select') { feedKey = value; render(); return null; }
        if (act === 'tab') { tab = value === 'slots' ? 'slots' : value === 'feed' ? 'feed' : 'floors'; notice = ''; drawerOpen = false; root?.classList?.toggle('igs-ti-drawer-open', false); render(); if (tab === 'floors') scrollToId(selectedId ?? Number(options.currentId?.())); return null; }
        if (act === 'chapter') { if (collapsed.has(value)) collapsed.delete(value); else collapsed.add(value); selectFloor(selectedId); return null; }
        if (act === 'drawer') { setDrawer(!drawerOpen); return null; }
        if (act === 'drawer-close') { setDrawer(false); return null; }
        if (act === 'select') { drawerOpen = false; root?.classList?.toggle('igs-ti-drawer-open', false); selectFloor(Number(value)); return null; }
        if (act === 'select-step') {
            const index = ids.indexOf(selectedId) + Number(value);
            if (index >= 0 && index < ids.length) { selectedId = ids[index]; render(); scrollToId(selectedId); }
            return null;
        }
        if (act === 'slot-select') { selectedSlot = value; render(); return null; }
        if (act === 'resume') { const last = progress.getLast(); return last ? jump({ pos: last }) : null; }
        if (act === 'first') return ids.length ? jump({ id: ids[0], page: 0 }) : null;
        if (act === 'latest') return ids.length ? jump({ id: latestId(), page: 0 }) : null;
        if (act === 'unread') {
            if (nextUnreadId() == null) return null;
            close();
            return options.onUnread?.();
        }
        if (act === 'floor') return jump({ id: Number(value), page: 0 });
        if (act === 'log-size') {
            prefs.fontSize = clampLogSize(prefs.fontSize + Math.sign(Number(value) || 0));
            saveJson(TI_PREFS_KEY, prefs);
            applyLogSize();
            const out = query('.igs-ti-stepper output');
            if (out) out.textContent = String(prefs.fontSize);
            const [down, up] = root ? Array.from(root.querySelectorAll('.igs-ti-stepper button')) : [];
            down?.toggleAttribute?.('disabled', prefs.fontSize <= LOG_FONT_SIZE.min);
            up?.toggleAttribute?.('disabled', prefs.fontSize >= LOG_FONT_SIZE.max);
            return null;
        }
        if (act === 'log-jump') return selectedId == null ? null : jump({ id: selectedId, page: Math.max(0, Number(value) || 0) });
        if (act === 'log-voice') {
            const turn = turns[ids.indexOf(selectedId)];
            const line = turn ? linesFor(turn).find((item) => item.page === Number(value)) : null;
            const result = line ? options.speak?.(line) : null;
            setNotice(result && !result.ok ? result.error || '朗读失败' : '');
            return result || null;
        }
        if (act === 'quick-save') {
            const slot = await options.onQuickSave?.();
            notice = slot ? `已快速存档：${positionLabel(slot)}` : '存档失败';
            if (slot) selectedSlot = 'quick';
            render();
            return slot;
        }
        if (act === 'quick-load') { const quick = progress.getQuick(); return quick ? jump({ pos: quick }) : null; }
        if (act === 'slot-new' || act === 'slot-over') {
            if (act === 'slot-over' && options.confirm && !(await options.confirm('用当前位置覆盖这个存档？'))) return null;
            const result = await options.onSaveSlot?.(act === 'slot-over' ? value : undefined);
            notice = result && result.ok ? `已存档：${positionLabel(result.slot)}` : (result && result.reason === 'slots-full' ? `档位已满（${READING_SLOT_LIMIT} 个），请先删一个或覆盖` : '存档失败');
            if (result && result.ok && result.slot && result.slot.key) selectedSlot = result.slot.key;
            render();
            return result;
        }
        if (act === 'slot-load') { const slot = progress.listSlots().find((item) => item.key === value); return slot ? jump({ pos: slot }) : null; }
        if (act === 'slot-rewind' || act === 'floor-rewind') {
            const slot = act === 'slot-rewind' ? (value === 'quick' ? progress.getQuick() : progress.listSlots().find((item) => item.key === value)) : null;
            const pos = slot || (act === 'floor-rewind' && Number.isInteger(Number(value)) ? { id: Number(value), page: 0, head: '', hash: '' } : null);
            if (!pos || !options.onRewind) return null;
            if (options.confirm && !(await options.confirm('从这里开一个新分支继续写？这一楼之后的剧情不会带过去，原聊天完整保留。', { okLabel: '重来', cancelLabel: '取消' }))) return null;
            let result = await options.onRewind(pos);
            if (result && !result.ok && result.canUseCurrent && options.confirm) {
                const useCurrent = await options.confirm('存档之后，这一楼换过版本，无法还原成存档时的样子。要改用现在这一版开新分支吗？原聊天不会改动。', { okLabel: '当前版本', cancelLabel: '取消' });
                if (useCurrent) result = await options.onRewind({ ...pos, useCurrentSwipe: true });
            }
            if (result && result.ok) { close(); return result; }
            notice = (result && result.text) || '没有成功，未做任何修改';
            render();
            return result || null;
        }
        if (act === 'slot-rename') {
            const slot = progress.listSlots().find((item) => item.key === value);
            if (!slot || !options.prompt) return null;
            const name = await options.prompt('存档名字', slot.name || positionLabel(slot));
            if (name == null || name === false) return null;
            progress.renameSlot(value, name);
            render();
            return null;
        }
        if (act === 'slot-delete') {
            if (options.confirm && !(await options.confirm('删除这个存档？'))) return null;
            progress.removeSlot(value);
            selectedSlot = '';
            render();
            return null;
        }
        return null;
    }

    function onClick(event) {
        const hit = findAction(event && event.target);
        if (!hit) return;
        event.stopPropagation?.();
        acting = acting.then(() => handle(hit.act, hit.value)).catch(() => setNotice('操作失败'));
    }

    function onSubmit(event) {
        event.preventDefault?.();
        event.stopPropagation?.();
        const input = query('[data-ti-goto] input');
        const id = Number(input && input.value);
        if (!Number.isInteger(id)) return;
        if (!ids.includes(id)) {
            const next = ids.find((n) => n >= id);
            if (next != null) { tab = 'floors'; selectedId = next; render(); scrollToId(next); }
            setNotice(next != null ? `第 ${id} 楼不是 AI 楼层，已定位到第 ${next} 楼` : `没有第 ${id} 楼`);
            return;
        }
        jump({ id, page: 0 });
    }

    // 窄屏抽屉：开合只切根节点的类，不重画；打开时把列表滚到选中那楼。
    function setDrawer(open) {
        drawerOpen = Boolean(open);
        root?.classList?.toggle('igs-ti-drawer-open', drawerOpen);
        query('.igs-ti-drawer-btn')?.setAttribute('aria-expanded', String(drawerOpen));
        if (drawerOpen) scrollToId(selectedId ?? Number(options.currentId?.()));
    }

    const narrowFloors = () => Boolean(root && tab === 'floors' && root.classList?.contains('igs-rp-narrow'));

    function onTouchStart(event) {
        const touch = event.touches && event.touches[0];
        swipe = null;
        if (!touch || !narrowFloors()) return;
        const left = root.getBoundingClientRect ? root.getBoundingClientRect().left : 0;
        if (drawerOpen || touch.clientX - left <= SWIPE_EDGE) swipe = { x: touch.clientX, y: touch.clientY };
    }

    function onTouchEnd(event) {
        const touch = event.changedTouches && event.changedTouches[0];
        if (!swipe || !touch) return;
        const dx = touch.clientX - swipe.x;
        const dy = touch.clientY - swipe.y;
        swipe = null;
        if (Math.abs(dx) < SWIPE_MIN || Math.abs(dy) > Math.abs(dx)) return;
        if (dx > 0 && !drawerOpen) setDrawer(true);
        else if (dx < 0 && drawerOpen) setDrawer(false);
    }

    function onChange(event) {
        const input = event && event.target;
        const kind = input && typeof input.getAttribute === 'function' ? input.getAttribute('data-ti-input') : '';
        if (!root || !kind) return;
        event.stopPropagation?.();
        if (kind === 'font') {
            font = fontOptions().some(([value]) => value === input.value) ? input.value : FONT_DEFAULT;
            saveJson(RECORD_FONTS_KEY, { ...loadJson(RECORD_FONTS_KEY, {}), [FONT_CATEGORY]: font });
            applyFont();
        } else if (kind === 'group') {
            prefs.group = normalizeGroup(input.value);
            saveJson(TI_PREFS_KEY, prefs);
            collapsed = new Set();
            render();
            scrollToId(selectedId ?? Number(options.currentId?.()));
        }
    }

    // 焦点在面板内时，空格 / 回车 / 方向键不冒泡到阅读器的全局翻页处理器。
    function onKeydown(event) {
        const key = event && event.key;
        if (key === 'Escape') { if (drawerOpen) setDrawer(false); else close(); }
        if ([' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Escape'].includes(key)) event.stopPropagation?.();
    }

    async function open(container) {
        if (root) return { ok: true, reason: 'already-open' };
        if (!container || typeof container.appendChild !== 'function') return { ok: false, reason: 'no-container' };
        previousFocus = doc.activeElement || null;
        try { theme = normalizeSettingsTheme(options.getTheme?.() || ''); } catch (_) { theme = normalizeSettingsTheme(''); }
        const savedPrefs = loadJson(TI_PREFS_KEY, {}) || {};
        prefs = { fontSize: clampLogSize(savedPrefs.fontSize ?? LOG_FONT_SIZE.fallback), group: normalizeGroup(savedPrefs.group) };
        const savedFont = (loadJson(RECORD_FONTS_KEY, {}) || {})[FONT_CATEGORY];
        font = fontOptions().some(([value]) => value === savedFont) ? savedFont : FONT_DEFAULT;
        try { registerCustomFonts(doc, loadCustomFonts(win || globalThis)); } catch (_) { /* 上传字体注册失败时用默认字体 */ }
        root = doc.createElement('div');
        root.id = 'igs-turn-index';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '目录');
        root.setAttribute('data-rp-theme', theme);
        root.addEventListener('click', onClick);
        root.addEventListener('submit', onSubmit);
        root.addEventListener('keydown', onKeydown);
        root.addEventListener('change', onChange);
        root.addEventListener('touchstart', onTouchStart, { passive: true });
        root.addEventListener('touchend', onTouchEnd, { passive: true });
        applyLogSize();
        applyFont();
        container.appendChild(root);
        host = container;
        host.classList?.toggle(OPEN_CLASS, true);
        setStagePauseReason(host, 'panel:turn-index', true);
        unwatchLayout = watchRecordPageLayout(root, doc);
        root.innerHTML = '<p class="igs-ti-empty igs-ti-loading">正在读取楼层…</p>';
        try { turns = (await options.listTurns?.()) || []; } catch (_) { turns = []; }
        if (!root) return { ok: false, reason: 'closed' };
        ids = turns.map((turn) => Number(turn && turn.id)).filter(Number.isInteger);
        const currentId = Number(options.currentId?.());
        selectedId = ids.includes(currentId) ? currentId : null;
        render();
        if (tab === 'floors') scrollToId(currentId);
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        root.removeEventListener('click', onClick);
        root.removeEventListener('submit', onSubmit);
        root.removeEventListener('keydown', onKeydown);
        root.removeEventListener('change', onChange);
        root.removeEventListener('touchstart', onTouchStart);
        root.removeEventListener('touchend', onTouchEnd);
        drawerOpen = false;
        swipe = null;
        unwatchLayout();
        unwatchLayout = () => { };
        root.remove();
        root = null;
        host?.classList?.toggle(OPEN_CLASS, false);
        setStagePauseReason(host, 'panel:turn-index', false);
        host = null;
        previousFocus?.focus?.();
        previousFocus = null;
        return { ok: true };
    }

    return {
        open,
        close,
        isOpen: () => Boolean(root),
        whenIdle: () => acting,
        getState: () => ({ tab, rows: rows.length, ids: ids.slice(), notice, selectedId, selectedSlot, theme, feedFilter, feedKey }),
        act: (act, value) => (acting = acting.then(() => handle(act, value))),
    };
}

// 外壳（毛玻璃底、水纹、四套配色、页头、chip / 分段 / 主按钮）直接复用资料页的，只换选择器；地图页那半不要。
const SHELL_STYLE_TEXT = RECORD_PAGE_SHELL_STYLE_TEXT
    .replace(/#igs-map-panel[^,{]*,?/g, '')
    .replace(/,\s*{/g, '{')
    .replaceAll('#igs-record-panel', '#igs-turn-index')
    .replaceAll('.igs-record-screen-open', `.${OPEN_CLASS}`);
const T = '#igs-turn-index';

// 续读提示条与提示弹窗都走设置器配色（IGS_HINT_THEME_STYLE_TEXT）。
export const TURN_INDEX_STYLE_TEXT = `
${SHELL_STYLE_TEXT}
${IGS_HINT_THEME_STYLE_TEXT}
#igs-overlay.${OPEN_CLASS} #igs-click-layer,#igs-overlay.${OPEN_CLASS} #igs-sprite,#igs-overlay.${OPEN_CLASS} #igs-dialog-layer,#igs-overlay.${OPEN_CLASS} #igs-toolbar-layer,#igs-overlay.${OPEN_CLASS} #igs-option-layer,#igs-overlay.${OPEN_CLASS} #igs-status-hud,#igs-overlay.${OPEN_CLASS} #igs-sprite-edit-bar,#igs-overlay.${OPEN_CLASS} #igs-resume-bar{display:none!important;pointer-events:none!important;}
${T}{position:absolute;inset:0;z-index:30;pointer-events:auto;color:var(--igs-rp-text,#eceae6);}
${T} button{color:inherit;cursor:pointer;font-family:inherit;}
${T} svg{width:18px;height:18px;flex:none;}
${T} .igs-ti-loading{position:absolute;inset:0;display:grid;place-items:center;margin:0;background:var(--igs-rp-backdrop-solid,rgba(14,14,18,.94));}
${T} .igs-ti-tabs{position:relative;z-index:2;display:flex;justify-content:center;padding:0 16px 8px;flex:none;}
${T} .igs-ti-scroll{flex:1 1 auto;min-width:0;min-height:0;width:100%;overflow:auto;padding:8px clamp(18px,4vw,56px) 28px;overscroll-behavior:contain;box-sizing:border-box;}
${T} .igs-ti-layout{display:grid;grid-template-columns:minmax(260px,32%) minmax(0,1fr);gap:clamp(20px,3vw,40px);height:100%;min-height:0;}
${T} .igs-ti-side{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0;}
${T} .igs-ti-summary{margin:0;color:var(--igs-rp-text-faint);font-size:12px;letter-spacing:.06em;font-variant-numeric:tabular-nums;}
${T} .igs-ti-quick{display:flex;flex-wrap:wrap;gap:2px;margin:0 -6px;}
${T} .igs-rp-chip:disabled{opacity:.35;cursor:default;background:transparent;}
${T} .igs-rp-chip.is-danger:hover{color:var(--igs-rp-danger,#d96c6c);}
${T} .igs-ti-goto{margin:0;}
${T} .igs-ti-goto input{flex:1;min-width:0;height:100%;margin:0;padding:0;border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;color:var(--igs-rp-text);font:inherit;font-size:13px;-webkit-appearance:none;appearance:none;-moz-appearance:textfield;}
${T} .igs-ti-goto input::-webkit-outer-spin-button,${T} .igs-ti-goto input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
${T} .igs-ti-goto input::placeholder{color:var(--igs-rp-text-faint);}
${T} .igs-ti-notice{margin:0;}
${T} .igs-ti-empty{margin:16px 0;color:var(--igs-rp-text-faint);font-size:13px;text-align:center;}
${T} .igs-ti-list{flex:1 1 auto;min-height:160px;overflow:auto;position:relative;margin:0 -6px;}
${T} .igs-ti-inner{position:relative;}
${T} .igs-ti-row{position:absolute;left:0;right:0;height:${ROW_HEIGHT - 2}px;display:flex;align-items:center;gap:12px;padding:0 10px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${T} .igs-ti-row:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
${T} .igs-ti-floor[aria-current="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
${T} .igs-ti-chapter{justify-content:space-between;color:var(--igs-rp-text-faint);font-size:11px;font-weight:500;letter-spacing:.16em;}
${T} .igs-ti-chapter:hover{background:transparent;color:var(--igs-rp-text-soft);}
${T} .igs-ti-no{flex:0 0 3em;color:var(--igs-rp-text-faint);font-size:12px;font-variant-numeric:tabular-nums;}
${T} .igs-ti-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;}
${T} .igs-ti-floor.is-read .igs-ti-text{color:var(--igs-rp-text-faint);}
${T} .igs-ti-mark{flex:none;color:var(--igs-rp-accent,var(--igs-rp-text));font-size:11px;letter-spacing:.08em;}
${T} .igs-rp-dot{display:inline-block;flex:none;width:6px;height:6px;border-radius:50%;background:var(--igs-rp-warm);}
${T} .igs-rp-dot.is-partial{background:transparent;box-shadow:inset 0 0 0 1.5px var(--igs-rp-warm);}
${T} .igs-ti-detail{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:auto;box-sizing:border-box;padding:clamp(24px,3.4vw,44px) clamp(22px,4vw,56px) 16px;border-radius:var(--igs-rp-radius-l);background:var(--igs-rp-reading);box-shadow:var(--igs-rp-pane-edge);}
${T} .igs-ti-meta{display:flex;flex-wrap:wrap;align-items:center;margin:0;color:var(--igs-rp-text-faint);font-size:12px;font-weight:500;letter-spacing:.12em;}
${T} .igs-ti-meta i{margin:0 10px;font-style:normal;color:var(--igs-rp-text-ghost);}
${T} .igs-ti-detail h3{margin:12px 0 18px;font-family:var(--igs-rp-font-body);font-size:24px;font-weight:400;letter-spacing:.08em;line-height:1.4;overflow-wrap:anywhere;}
${T} .igs-ti-body{margin:18px 0 0;max-width:34em;font-family:var(--igs-rp-font-body);font-size:16px;line-height:1.95;letter-spacing:.03em;color:var(--igs-rp-text);white-space:pre-wrap;overflow-wrap:anywhere;}
${T} .igs-ti-detail h3 + .igs-ti-body{margin-top:0;color:var(--igs-rp-text-soft);}
${T} .igs-ti-detail-actions .igs-rp-btn.is-quiet{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
${T} .igs-ti-detail-actions{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;margin-top:28px;}
${T} .igs-ti-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;margin-top:auto;padding-top:28px;font-size:13px;}
${T} .igs-ti-nav button{min-height:36px;padding:7px 12px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);font-weight:500;letter-spacing:.06em;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${T} .igs-ti-nav button:hover:not([disabled]){background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
${T} .igs-ti-nav button:first-child{justify-self:start;}
${T} .igs-ti-nav button:last-child{justify-self:end;}
${T} .igs-ti-nav button[disabled]{opacity:.3;cursor:default;}
${T} .igs-ti-nav span{color:var(--igs-rp-text-faint);font-size:12px;font-variant-numeric:tabular-nums;letter-spacing:.16em;}
${T} .igs-ti-overview h3{font-variant-numeric:tabular-nums;}
${T} .igs-ti-log-pane{position:relative;padding-top:clamp(18px,2.4vw,30px);}
${T} .igs-ti-log-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding-bottom:16px;border-bottom:1px solid var(--igs-rp-text-ghost);}
${T} .igs-ti-log-head .igs-ti-detail-actions{flex:1 0 100%;margin:0;justify-content:center;gap:10px;}
${T} .igs-ti-log-head .igs-rp-btn{min-height:30px;padding:5px 22px;font-size:13px;font-weight:500;letter-spacing:.2em;}
${T} .igs-ti-log-head .igs-rp-btn.is-quiet{background:transparent;color:var(--igs-rp-text-soft);box-shadow:inset 0 0 0 1px var(--igs-rp-text-ghost);}
${T} .igs-ti-log-head .igs-rp-btn.is-quiet:hover{color:var(--igs-rp-text);opacity:1;}
${T} .igs-ti-log-head .igs-rp-chip{min-height:30px;padding:5px 12px;font-size:12px;color:var(--igs-rp-text-faint);}
${T} .igs-ti-log{list-style:none;margin:0;padding:0;max-width:44em;}
${T} .igs-ti-log-entry{position:relative;display:grid;grid-template-columns:40px minmax(0,1fr) 32px;align-items:start;gap:14px;padding:14px 8px;margin:0 -8px;border-radius:var(--igs-rp-radius-m);}
${T} .igs-ti-log-entry + .igs-ti-log-entry::before{content:"";position:absolute;top:0;left:8px;right:8px;border-top:1px dashed var(--igs-rp-text-ghost);pointer-events:none;}
${T} .igs-ti-log-entry[aria-current="true"]{background:var(--igs-rp-fill);}
${T} .igs-ti-log-entry[aria-current="true"]::before,${T} .igs-ti-log-entry[aria-current="true"] + .igs-ti-log-entry::before{display:none;}
${T} .igs-ti-log-face{width:40px;height:40px;border-radius:50%;background-color:var(--igs-rp-fill-active);background-repeat:no-repeat;}
${T} .igs-ti-log-face.is-cover{background-size:cover;background-position:center;}
${T} .igs-ti-log-face.is-initial{display:grid;place-items:center;color:var(--igs-rp-text-soft);font-family:var(--igs-rp-font-body);font-size:16px;}
${T} .igs-ti-log-face.is-empty{background:transparent;}
${T} .igs-ti-log-copy{display:flex;flex-direction:column;gap:4px;min-width:0;padding:0;border:0;background:transparent;text-align:left;}
${T} .igs-ti-log-name{color:var(--igs-rp-accent,var(--igs-rp-text));font-size:calc(var(--igs-ti-log-size,15px) - 2px);font-weight:500;letter-spacing:.1em;}
${T} .igs-ti-log-text{font-family:var(--igs-rp-font-body);font-size:var(--igs-ti-log-size,15px);line-height:1.85;letter-spacing:.03em;color:var(--igs-rp-text);white-space:pre-wrap;overflow-wrap:anywhere;transition:color .18s var(--igs-rp-ease);}
${T} .igs-ti-log-entry.is-narration .igs-ti-log-text{color:var(--igs-rp-text-soft);}
${T} .igs-ti-log-entry.is-thought .igs-ti-log-text{color:var(--igs-rp-text-soft);font-style:italic;}
${T} .igs-ti-log-copy:hover .igs-ti-log-text{color:var(--igs-rp-text);}
${T} .igs-ti-log-voice{display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--igs-rp-text-faint);transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${T} .igs-ti-log-voice:hover:not([disabled]){background:var(--igs-rp-fill-hover);color:var(--igs-rp-text);}
${T} .igs-ti-log-voice[disabled]{opacity:.3;cursor:default;}
${T} .igs-ti-log-voice svg{width:16px;height:16px;}
${T} .igs-ti-stepper{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);font-size:12px;}
${T} .igs-ti-stepper button{display:grid;place-items:center;min-width:30px;height:26px;padding:0 6px;border:0;border-radius:calc(var(--igs-rp-radius-m) - 2px);background:transparent;font-weight:600;line-height:1;}
${T} .igs-ti-stepper button:hover:not([disabled]){background:var(--igs-rp-fill-hover);}
${T} .igs-ti-stepper button[disabled]{opacity:.3;cursor:default;}
${T} .igs-ti-stepper output{min-width:2em;text-align:center;color:var(--igs-rp-text-soft);font-variant-numeric:tabular-nums;}
${T} .igs-ti-tools{display:flex;align-items:center;gap:8px;}
${T} .igs-ti-tools .igs-ti-goto{flex:1;min-width:0;}
${T} .igs-ti-tools .igs-rp-font-select{flex:none;height:auto;align-self:stretch;}
${T} .igs-ti-tools .igs-rp-font-select i{font-style:normal;font-size:10px;color:var(--igs-rp-text-faint);}
${T} .igs-ti-progress{height:3px;border-radius:2px;background:var(--igs-rp-fill-active);overflow:hidden;}
${T} .igs-ti-progress span{display:block;height:100%;background:var(--igs-rp-accent,var(--igs-rp-text));}
${T} .igs-ti-overview .igs-ti-summary{margin-top:14px;}
${T} .igs-ti-hint{margin:auto 0 0;padding-top:28px;color:var(--igs-rp-text-faint);font-size:13px;letter-spacing:.08em;}
${T} .igs-ti-empty-pane{align-items:center;justify-content:center;gap:12px;color:var(--igs-rp-text-faint);background:var(--igs-rp-pane);}
${T} .igs-ti-empty-pane p{margin:0;font-size:13px;letter-spacing:.08em;text-align:center;}
${T} .igs-ti-empty-pane svg{width:28px;height:28px;opacity:.6;}
${T} .igs-ti-slots{list-style:none;margin:0 -6px;padding:0;display:flex;flex-direction:column;gap:2px;overflow:auto;}
${T} .igs-ti-slots button{display:flex;align-items:center;gap:12px;width:100%;padding:7px 10px 7px 8px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${T} .igs-ti-slots button:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
${T} .igs-ti-slots button[aria-current="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
${T} .igs-ti-slot-thumb{flex:none;width:56px;height:36px;border-radius:var(--igs-rp-radius-s);object-fit:cover;background:var(--igs-rp-fill);}
${T} .igs-ti-slot-thumb.is-blank{display:grid;place-items:center;color:var(--igs-rp-text-ghost);}
${T} .igs-ti-slot-copy{display:flex;flex-direction:column;flex:1;min-width:0;}
${T} .igs-ti-slot-copy strong{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${T} .igs-ti-slot-copy small{color:var(--igs-rp-text-faint);font-size:11px;font-variant-numeric:tabular-nums;}
${T} .igs-ti-detail-thumb{display:block;width:100%;max-height:42%;margin:0 0 20px;border-radius:var(--igs-rp-radius-m);object-fit:cover;}
${T} .igs-ti-feed-list{flex:1 1 auto;min-height:160px;overflow:auto;margin:0 -6px;display:flex;flex-direction:column;gap:2px;}
${T} .igs-ti-feed-row{flex:none;display:flex;align-items:center;gap:10px;min-height:${ROW_HEIGHT + 8}px;padding:4px 10px;border:0;border-radius:var(--igs-rp-radius-m);background:transparent;color:var(--igs-rp-text-soft);text-align:left;transition:background .18s var(--igs-rp-ease),color .18s var(--igs-rp-ease);}
${T} .igs-ti-feed-row:hover{background:var(--igs-rp-fill);color:var(--igs-rp-text);}
${T} .igs-ti-feed-row[aria-current="true"]{background:var(--igs-rp-fill-active);color:var(--igs-rp-text);}
${T} .igs-ti-feed-dot{flex:none;width:8px;height:8px;border-radius:50%;}
${T} .igs-ti-feed-copy{display:flex;flex-direction:column;flex:1;min-width:0;}
${T} .igs-ti-feed-copy small{color:var(--igs-rp-text-faint);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${T} .igs-ti-storm{display:inline-block;margin-right:5px;padding:0 5px;border-radius:3px;font-size:10px;font-weight:600;line-height:15px;color:#fff;background:#b8860b;}
${T} .igs-ti-storm[data-tone="black"]{background:#c0392b;}
${T} .igs-ti-peek{display:inline-block;margin-right:5px;padding:0 5px;border-radius:3px;font-size:10px;font-weight:600;line-height:15px;color:#fff;background:#d6453d;}
${T} .igs-ti-feed-text{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${T} .igs-ti-feed-row .igs-ti-no{flex:none;text-align:right;}
${T} .igs-ti-feed-replies{list-style:none;margin:22px 0 0;padding:0 0 0 14px;max-width:34em;border-left:1px solid var(--igs-rp-text-ghost);display:flex;flex-direction:column;gap:8px;}
${T} .igs-ti-feed-replies li{font-size:13px;line-height:1.7;color:var(--igs-rp-text-soft);overflow-wrap:anywhere;}
${T} .igs-ti-feed-replies strong{font-weight:500;color:var(--igs-rp-text-faint);}
${T}.igs-rp-narrow .igs-ti-feed-list{flex:none;height:38vh;}
${T}.igs-rp-narrow .igs-ti-scroll{padding:4px 14px 20px;}
${T}.igs-rp-narrow .igs-ti-layout{display:flex;flex-direction:column;gap:14px;height:auto;min-height:100%;}
${T}.igs-rp-narrow .igs-ti-list{flex:none;height:38vh;}
${T}.igs-rp-narrow .igs-ti-slots{max-height:34vh;}
${T}.igs-rp-narrow .igs-ti-detail{flex:1 0 auto;min-height:260px;overflow:visible;padding:22px 18px 12px;}
${T}.igs-rp-narrow .igs-ti-detail h3{font-size:20px;margin:10px 0 14px;}
${T}.igs-rp-narrow .igs-ti-log-entry{grid-template-columns:32px minmax(0,1fr) 30px;gap:10px;padding:12px 6px;margin:0 -6px;}
${T}.igs-rp-narrow .igs-ti-log-face{width:32px;height:32px;}
${T}.igs-rp-narrow .igs-ti-log-face.is-initial{font-size:14px;}
${T}.igs-rp-narrow .igs-ti-log-voice{width:30px;height:30px;}
${T} .igs-ti-drawer-btn,${T} .igs-ti-scrim{display:none;}
${T}.igs-rp-narrow .igs-ti-scroll.is-floors{overflow:hidden;padding:4px 12px 12px;}
${T}.igs-rp-narrow .igs-ti-layout.is-floors{display:block;position:relative;height:100%;min-height:0;}
${T}.igs-rp-narrow .is-floors .igs-ti-detail{height:100%;min-height:0;overflow:auto;padding:16px 16px 0;}
${T}.igs-rp-narrow .is-floors .igs-ti-nav{position:sticky;bottom:0;margin:0 -16px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));background:var(--igs-rp-solid);box-shadow:inset 0 1px 0 var(--igs-rp-text-ghost);}
${T}.igs-rp-narrow .is-floors .igs-ti-drawer-btn{display:inline-flex;flex:none;align-items:center;gap:6px;height:30px;padding:0 10px 0 8px;border:0;border-radius:var(--igs-rp-radius-m);background:var(--igs-rp-fill);color:var(--igs-rp-text-soft);font-size:13px;letter-spacing:.06em;font-variant-numeric:tabular-nums;}
${T}.igs-rp-narrow .is-floors .igs-ti-drawer-btn svg{width:16px;height:16px;}
${T}.igs-rp-narrow .is-floors .igs-ti-log-head{flex-wrap:wrap;gap:12px 8px;}
${T}.igs-rp-narrow .is-floors .igs-ti-log-head .igs-ti-meta{display:block;flex:1 1 0;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;letter-spacing:.06em;}
${T}.igs-rp-narrow .is-floors .igs-ti-log-head .igs-ti-meta i{margin:0 6px;}
${T}.igs-rp-narrow .is-floors .igs-ti-stepper{flex:none;}
${T}.igs-rp-narrow .is-floors .igs-ti-stepper button{min-width:26px;padding:0 4px;}
${T}.igs-rp-narrow .is-floors .igs-ti-list{margin-top:4px;}
${T}.igs-rp-narrow .is-floors .igs-ti-overview .igs-ti-drawer-btn{align-self:flex-start;margin-bottom:14px;}
${T}.igs-rp-narrow .is-floors .igs-ti-side{position:absolute;top:-4px;bottom:-12px;left:-12px;z-index:3;width:min(84%,340px);padding:16px 14px 12px;box-sizing:border-box;border-radius:0 var(--igs-rp-radius-l) var(--igs-rp-radius-l) 0;background:var(--igs-rp-solid);box-shadow:var(--igs-rp-pane-edge);transform:translateX(-104%);visibility:hidden;transition:transform .26s var(--igs-rp-ease),visibility 0s linear .26s;}
${T}.igs-rp-narrow.igs-ti-drawer-open .is-floors .igs-ti-side{transform:none;visibility:visible;transition:transform .26s var(--igs-rp-ease);}
${T}.igs-rp-narrow .is-floors .igs-ti-list{flex:1 1 auto;height:auto;min-height:0;}
${T}.igs-rp-narrow .is-floors .igs-ti-scrim{display:block;position:absolute;inset:-4px -12px -12px;z-index:2;background:var(--igs-rp-backdrop);opacity:0;pointer-events:none;transition:opacity .26s var(--igs-rp-ease);}
${T}.igs-rp-narrow.igs-ti-drawer-open .is-floors .igs-ti-scrim{opacity:1;pointer-events:auto;}
@media (prefers-reduced-motion:reduce){${T} .igs-ti-side,${T} .igs-ti-scrim{transition:none!important;}}
`;
