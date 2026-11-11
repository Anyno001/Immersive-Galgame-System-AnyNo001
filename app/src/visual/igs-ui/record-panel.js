import { createShujukuClient } from '../../data/shujuku/client.js';
import { buildRecordModel, buildRelationshipModel, parseLooseDate } from '../../data/shujuku/record-model.js';
import { buildFavorOverviewModel } from '../../data/shujuku/favor-overview-model.js';
import { createCharacterMetricsLookup } from '../../data/shujuku/character-metrics.js';
import { resolveStatusHudPicks } from '../../data/shujuku/status-hud-model.js';
import { dropUserFavor, isUserName, preferStatsLookup } from '../../scene/stats/stat-metrics.js';
import { relationLabel, stageLabel } from '../../scene/stats/stat-relation-label.js';
import { characterDnaGender } from './voice-bark.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';
import { INVENTORY_GROUP_ORDER, RECORD_ICONS, inventoryGroupLabel, inventoryIconKey } from './record-icons.js';
import { recordPageHeadHtml, watchRecordPageLayout } from './record-page-shell.js';
import { setStagePauseReason } from './stage-pause.js';
import { DIALOG_FONT_OPTIONS } from './reader-host-constants.js';
import { fontOptionsWith, loadCustomFonts, registerCustomFonts } from '../../media/custom-fonts.js';
import { normalizeSettingsTheme, renderSettingsThemeSwitch } from './settings-theme.js';
import { applyTypewriterEffect, cancelTypewriter } from './typewriter-runtime.js';
import { inventoryIconHtml, resolveInventoryImage } from './inventory-slot-image.js';
import { openItemImageViewer, closeItemImageViewer } from './item-image-viewer.js';
import { recoverMediaOperation } from '../../media/tavern-media-http.js';
import { deckReasonText } from './combat-deck-panel-render.js';
import { gearBonusText } from './combat-deck-panel-model.js';
import { STOCK_RARITY_LABELS, STOCK_SLOT_LABELS } from '../../combat/inventory-writes.js';
import { sellPrice } from '../../combat/points.js';
import { equippedGear, slotGearList } from '../../combat/gear-slots.js';
import { createIgsModal } from './igs-modal.js';

const labels = Object.freeze({ diary: '日记', inventory: '物品', relationships: '人际关系', favor: '好感度' });
const pageTitles = Object.freeze({ diary: '珍藏心事', inventory: '你的背包', relationships: '人际关系', favor: '好感总览' });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const cellsHtml = cells => cells.length ? `<dl class="igs-record-fields">${cells.map(cell => `<div><dt>${escapeHtml(cell.label)}</dt><dd>${escapeHtml(cell.value)}</dd></div>`).join('')}</dl>` : '';
const personInitial = value => escapeHtml(String(value ?? '').trim().charAt(0) || '·');
const INVENTORY_SORTS = Object.freeze([['default', '默认'], ['name', '名称'], ['quantity', '数量']]);
const FAVOR_SORT_KEYS = Object.freeze(['好感', '了解', '信任', '芥蒂', '名字']);
// 战斗开启时背包按装配定义分组：装备 / 道具 / 杂物，物品表里没有装配定义的剧情物品归「其他」。
const HERO_KIND_LABELS = Object.freeze({ gear: '装备', item: '道具', keepsake: '杂物', other: '其他' });
const HERO_GROUP_ORDER = Object.freeze(Object.values(HERO_KIND_LABELS));
// 主角背包投影（与 combat/inventory-view.js 的 heroInventoryView 同形）→ 物品名 → 类别、部位、稀有度、是否穿着。
function indexHeroInventory(view) {
    const index = new Map();
    if (!view) return index;
    const put = (list, kind, extra = {}) => {
        for (const it of list || []) {
            if (!it?.name) continue;
            // 同名装备穿着一件、背包还有余量时，背包里的那件可以卖。
            if (index.has(it.name)) { if (kind === 'gear' && !extra.equipped) index.get(it.name).spare = true; continue; }
            index.set(it.name, { kind, slot: it.slot || '', rarity: it.rarity || '', gearId: kind === 'gear' ? String(it.gearId || '') : '', itemId: kind === 'keepsake' ? String(it.itemId || '') : '',
                ...(kind === 'keepsake' && it.junk === true ? { junk: true } : {}),
                ...(kind === 'gear' && it.bonus ? { bonus: it.bonus } : {}), ...(kind === 'gear' && it.passive ? { passive: it.passive } : {}), ...extra });
        }
    };
    put(equippedGear(view.gear?.slots), 'gear', { equipped: true });
    put(view.gear?.bag, 'gear'); put(view.items, 'item'); put(view.collection, 'keepsake'); put(view.others, 'other');
    return index;
}
// 可卖出：杂物，以及背包里（未穿着或有余量）的装备；道具与没有装配定义的剧情物品不可卖。售价按稀有度与物品身份确定。
const sellKeyOf = meta => (meta?.kind === 'keepsake' ? meta.itemId : meta?.kind === 'gear' && (!meta.equipped || meta.spare) ? meta.gearId : '');
const sellPriceOf = meta => sellPrice(meta?.rarity || 'common', sellKeyOf(meta), { junk: meta?.junk === true });
// 不可售出标记：道具与没有装配定义的剧情物品；装备穿着时卸下即可卖，只显示「已装备」，不标不可售。
const unsellableOf = meta => Boolean(meta) && meta.kind !== 'gear' && !sellKeyOf(meta);
const DIARY_PREFS_KEY = 'igs_record_diary_prefs';
const DIARY_READ_KEY = 'igs_record_diary_read';
const DIARY_READ_LIMIT = 2000;
// 三页各自记一种字体；“默认”即沿用外壳的黑体界面 + 宋体正文。
const RECORD_FONTS_KEY = 'igs_record_fonts';
const RECORD_FONT_DEFAULT = 'inherit';
// 用户上传的字体也算合法选项（见 media/custom-fonts.js）。
const normalizeRecordFont = (value, options = DIALOG_FONT_OPTIONS) => options.some(([font]) => font === value) ? value : RECORD_FONT_DEFAULT;
const DIARY_PREFS = Object.freeze([
    ['pageTurn', '翻页动画', '切换篇章时轻翻入场'],
    ['typewriter', '打字机', '打开篇章时逐字浮现，点击正文立即显示'],
    ['unread', '未读标记', '新写入的日记显示小圆点'],
    ['scroll', '连续阅读', '同一列表的篇章上下连成长卷'],
]);
const DIARY_FONT_SIZE = Object.freeze({ min: 14, max: 24, fallback: 17 });
const DIARY_PREF_DEFAULTS = Object.freeze({ pageTurn: true, typewriter: false, unread: true, scroll: false, fontSize: DIARY_FONT_SIZE.fallback });
const clampDiaryFontSize = value => {
    const size = Math.round(Number(value));
    return Number.isFinite(size) ? Math.min(DIARY_FONT_SIZE.max, Math.max(DIARY_FONT_SIZE.min, size)) : DIARY_FONT_SIZE.fallback;
};

// 心事视图日期：只有整册均为合法 YYYY-MM-DD 才按最新在前排序，否则保留原表顺序。
const isCanonicalDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
// 首句：首个非空行里到句末标点（含随后的收引号）为止；没有句末标点就取整行。
const SENTENCE_END = /^(.*?[。！？!?…]+[”」』"'’）)]*)\s*/;
const splitFirstSentence = text => {
    const trimmed = String(text || '').trim();
    const lineEnd = trimmed.indexOf('\n');
    const line = lineEnd >= 0 ? trimmed.slice(0, lineEnd) : trimmed;
    const match = SENTENCE_END.exec(line);
    return { lead: (match ? match[1] : line).trim(), rest: trimmed.slice(match ? match[0].length : line.length).trim() };
};
const stripEndPunctuation = text => text.replace(/[。！？!?…,，、；;：:]+[”」』"'’）)]*$/, '');
const excerpt = (text, max) => {
    const chars = Array.from(stripEndPunctuation(splitFirstSentence(text).lead));
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
};
const chapterTitle = entry => entry.chapterTitle || excerpt(entry.body, 16) || entry.title || '未命名篇章';
// 无篇名时首句升为标题、正文从第二句接着读，避免标题和正文首句重复；
// 首句过长或全篇只有一句时不另起标题，整段按正文排。
const DIARY_LEAD_MAX = 24;
function diaryHeading(entry) {
    const body = String(entry.body || '').trim();
    if (entry.chapterTitle || !body) return { title: chapterTitle(entry), body };
    const { lead, rest } = splitFirstSentence(body);
    const title = stripEndPunctuation(lead);
    if (!rest || !title || Array.from(title).length > DIARY_LEAD_MAX) return { title: '', body };
    return { title, body: rest };
}
const dateLabel = value => parseLooseDate(value)?.label || String(value || '');
const hashText = text => { let hash = 5381; for (const char of String(text)) hash = ((hash * 33) ^ char.codePointAt(0)) >>> 0; return hash.toString(36); };
const entryReadKey = entry => `${entry.uid}|${entry.author || ''}|${entry.date || ''}|${hashText(entry.body || entry.cells?.map(cell => cell.value).join('|'))}`;

// 按日期新→旧；只要有一篇无法识别日期，就退回表内追加顺序的倒序（最新写入在前），不猜日期。
function newestFirst(list) {
    const keyed = list.map((entry, index) => ({ entry, index, date: parseLooseDate(entry.date) }));
    if (keyed.length && keyed.every(item => item.date)) return keyed.sort((a, b) => b.date.key - a.date.key || b.index - a.index).map(item => item.entry);
    return list.slice().reverse();
}

// Only names that appear in labels are ever rendered as SVG; sheet contents remain escaped text.
export function createRecordPanelController(doc, global, fillDraft, options = {}) {
    let tableReadController = null;
    let root = null;
    let theme = normalizeSettingsTheme('');
    let client = null;
    let category = '';
    let model = null;
    let settings = null;
    let pageOverlay = null;
    let activeUid = '';
    let selectedId = '';
    let relationshipPersonId = '';
    let diaryBook = '';
    let diaryView = 'books';
    let prefsOpen = false;
    let turn = '';
    let typedId = '';
    let invGroup = '';
    let invSort = 'default';
    let invQuery = '';
    let favorSort = '好感';
    let favorAsc = false;
    let favorQuery = '';
    let message = '';
    let heroInv = null;
    let heroMeta = new Map();
    // 回收请求绑定本次物品；关闭、重读或切换物品时取消确认。
    let recyclePending = null;
    const recycleModal = createIgsModal({ getHost: () => root, getTheme: () => theme, global: { document: doc } });
    let metricsOf = () => ({ metrics: [], stages: [] });
    // 好感总览的数值系统数据（statsFavorOverview 的结果）；为 null 时按表格读取。展开状态按角色名记。
    let favorLive = null;
    let relationLive = new Map();
    const favorOpen = new Set();
    const favorAll = new Set();
    const favorDesc = new Set();
    const readFavorLive = () => { try { return typeof options.statsFavorOverview === 'function' ? options.statsFavorOverview() : null; } catch (_) { return null; } };
    let readKeys = new Set();
    let previousFocus = null;
    let unwatchLayout = null;
    const callback = () => { if (root) reload(); };
    const storage = () => { try { return (global || globalThis).localStorage || null; } catch (_) { return null; } };
    const loadJson = (key, fallback) => { try { const raw = storage()?.getItem?.(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } };
    const writes = new Map();
    const saveJson = (key, value) => {
        const text = JSON.stringify(value);
        const pending = (writes.get(key) || Promise.resolve()).catch(() => {}).then(() => recoverMediaOperation(global || globalThis, () => {
            const store = storage();
            if (!store) throw new Error('record-storage-unavailable');
            store.setItem(key, text);
            return store.getItem(key) === text;
        }));
        writes.set(key, pending);
        void pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); }).catch(() => {});
        return pending;
    };
    let prefs = { ...DIARY_PREF_DEFAULTS };
    let font = RECORD_FONT_DEFAULT;
    const fontOptions = () => fontOptionsWith(DIALOG_FONT_OPTIONS, loadCustomFonts(global || globalThis));
    const table = () => model?.tables?.find(item => item.uid === activeUid);
    const relationshipPeople = () => model?.people?.filter(item => item.uid === activeUid) || [];
    // 背包格位与详情头图标：设置为「生图」且本聊天已有物品图时显示图片，否则保留 SVG。
    let unsubscribeItemImages = null;
    const readItemIconMode = () => { try { return options.getItemIconMode?.() || 'image'; } catch (_) { return 'image'; } };
    const itemIcon = name => inventoryIconHtml(name, RECORD_ICONS[inventoryIconKey(name)], options.resolveItemImage, readItemIconMode());
    // 详情头的物品图可点开大图：只在设置为「生图」且本聊天已有物品图时给按钮；点击时按物品名现取地址，不读 DOM 里的 src。
    const zoomUrl = name => (readItemIconMode() === 'svg' ? '' : resolveInventoryImage(options.resolveItemImage, name));
    const detailIconHtml = name => (zoomUrl(name)
        ? `<button type="button" class="igs-record-item-detail-icon" data-record-zoom="${escapeHtml(name)}" aria-label="放大查看${escapeHtml(name)}">${itemIcon(name)}</button>`
        : `<div class="igs-record-item-detail-icon" aria-hidden="true">${itemIcon(name)}</div>`);
    const onItemImagesChanged = () => {
        if (!root || category !== 'inventory') return;
        // 正在输入搜索词时不重绘，避免打断输入；图片在下一次渲染时出现。
        const active = doc.activeElement;
        if (active && String(active.tagName || '').toUpperCase() === 'INPUT' && root.contains?.(active)) return;
        const scroller = root.querySelector?.('.igs-record-scroll');
        const top = scroller ? scroller.scrollTop : 0;
        render();
        const next = root.querySelector?.('.igs-record-scroll');
        if (next) next.scrollTop = top;
    };
    const relationshipEdges = () => model?.edges?.filter(item => item.uid === activeUid) || [];
    const entries = () => category === 'diary' || category === 'inventory'
        ? (model?.entries || [])
        : category === 'relationships' ? relationshipPeople() : (model?.entries?.filter(item => item.uid === activeUid) || []);
    const isUnread = entry => prefs.unread && !readKeys.has(entryReadKey(entry));

    // 心事分册：同一来源 UID 内按明确作者分册；未署名归入中性“未署名册”，不默认归为“我”。
    const diaryBooks = () => {
        const books = new Map();
        for (const entry of model?.entries || []) {
            const key = `${entry.uid}::${entry.author || ''}`;
            if (!books.has(key)) books.set(key, { key, uid: entry.uid, author: entry.author || '', label: entry.author || '未署名册', entries: [] });
            books.get(key).entries.push(entry);
        }
        for (const book of books.values()) {
            if (book.entries.length && book.entries.every(item => isCanonicalDate(item.date)))
                book.entries.sort((a, b) => b.date.localeCompare(a.date) || a.rowIndex - b.rowIndex);
        }
        return [...books.values()];
    };
    const currentBook = () => { const books = diaryBooks(); return books.find(item => item.key === diaryBook) || books[0] || null; };
    const diaryList = () => diaryView === 'timeline' ? newestFirst(model?.entries || []) : (currentBook()?.entries || []);

    const heroOf = item => heroMeta.get(String(item?.title ?? '').trim());
    const itemGroup = item => heroInv ? HERO_KIND_LABELS[heroOf(item)?.kind || 'other'] : (item.category || inventoryGroupLabel(item.title));
    const inventoryGroups = () => {
        if (heroInv) return [...HERO_GROUP_ORDER];
        const present = new Set((model?.entries || []).map(itemGroup));
        const ordered = INVENTORY_GROUP_ORDER.filter(label => present.has(label));
        return [...ordered, ...[...present].filter(label => !ordered.includes(label))];
    };
    const visibleItems = () => {
        const query = invQuery.trim().toLowerCase();
        const list = (model?.entries || []).filter(item => (!invGroup || itemGroup(item) === invGroup)
            && (!query || String(item.title || '').toLowerCase().includes(query)
                || item.detailCells?.some(cell => String(cell.value).toLowerCase().includes(query))));
        if (invSort === 'name') return list.slice().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'));
        if (invSort === 'quantity') {
            const qty = item => { const value = Number(String(item.quantity ?? '').trim()); return String(item.quantity ?? '').trim() && Number.isFinite(value) ? value : -Infinity; };
            return list.slice().sort((a, b) => qty(b) - qty(a) || a.rowIndex - b.rowIndex);
        }
        return list;
    };
    const itemKicker = item => {
        const meta = heroInv ? heroOf(item) : null;
        return [itemGroup(item), meta?.slot && STOCK_SLOT_LABELS[meta.slot], meta?.rarity && STOCK_RARITY_LABELS[meta.rarity]].filter(Boolean).join(' · ');
    };
    const wornTag = item => heroInv && heroOf(item)?.equipped ? '<span class="igs-record-tag">已装备</span>' : '';
    function setHeroInventory(value) {
        heroInv = value?.ok === true ? value : null;
        heroMeta = indexHeroInventory(heroInv);
    }
    // 战斗开启时由宿主注入主角背包投影；未注入或读取失败时退回按名称分组，不显示装备映射。
    function refreshHeroInventory() {
        if (typeof options.getHeroInventory !== 'function') { setHeroInventory(null); return; }
        const target = root;
        let value;
        try { value = options.getHeroInventory(); } catch (_) { value = null; }
        if (value && typeof value.then === 'function') {
            value.then(next => { if (root !== target) return; setHeroInventory(next); if (model) render(); }, () => {});
            return;
        }
        setHeroInventory(value);
    }

    function open(overlay, readerSettings, type) {
        if (root) return { ok: false, reason: 'already-open' };
        if (!labels[type] || !overlay || !doc?.createElement) return { ok: false, reason: 'invalid-record-view' };
        category = type;
        settings = readerSettings || null;
        activeUid = '';
        selectedId = '';
        relationshipPersonId = '';
        diaryBook = '';
        prefsOpen = false;
        turn = '';
        typedId = '';
        invGroup = '';
        invSort = 'default';
        invQuery = '';
        favorSort = '好感';
        favorAsc = false;
        favorQuery = '';
        message = '';
        cancelRecycle();
        setHeroInventory(null);
        prefs = { ...DIARY_PREF_DEFAULTS, ...loadJson(DIARY_PREFS_KEY, {}) };
        prefs.fontSize = clampDiaryFontSize(prefs.fontSize);
        diaryView = loadJson(DIARY_PREFS_KEY, {})?.view === 'timeline' ? 'timeline' : 'books';
        font = normalizeRecordFont(loadJson(RECORD_FONTS_KEY, {})?.[type], fontOptions());
        registerCustomFonts(doc, loadCustomFonts(global || globalThis));
        theme = normalizeSettingsTheme(readTheme());
        pageOverlay = overlay;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = 'igs-record-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', labels[type]);
        root.setAttribute('data-record-category', type);
        root.setAttribute('data-rp-theme', theme);
        root.addEventListener('click', onClick);
        root.addEventListener('input', onInput);
        root.addEventListener('change', onChange);
        overlay.classList?.toggle('igs-record-screen-open', true);
        setStagePauseReason(overlay, 'panel:record', true);
        (overlay.querySelector?.('#igs-db-layer') || overlay).appendChild(root);
        unwatchLayout = watchRecordPageLayout(root, doc);
        applyDiaryFontSize();
        applyRecordFont();
        applyTransparentGlassMaterial(root, settings?.glassOpacity, { backdropFilter: settings?.glassBackdropFilter });
        client = createShujukuClient((global || globalThis).AutoCardUpdaterAPI || null);
        try { client.registerCallback(callback); } catch (_) { /* Optional subscription. */ }
        try { unsubscribeItemImages = options.subscribeItemImages?.(onItemImagesChanged) || null; } catch (_) { unsubscribeItemImages = null; }
        reload();
        root.querySelector?.('[data-record-act="close"]')?.focus?.();
        return { ok: true };
    }

    function close() {
        tableReadController?.abort(); tableReadController = null;
        cancelRecycle();
        if (!root) return { ok: true, reason: 'not-open' };
        closeItemImageViewer(doc);
        unwatchLayout?.();
        unwatchLayout = null;
        const body = root.querySelector?.('.igs-record-diary-detail .igs-record-body');
        if (body) cancelTypewriter(body);
        root.removeEventListener('click', onClick);
        root.removeEventListener('input', onInput);
        root.removeEventListener('change', onChange);
        unsubscribeItemImages?.();
        unsubscribeItemImages = null;
        root.remove();
        root = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        setStagePauseReason(pageOverlay, 'panel:record', false);
        pageOverlay = null;
        try { client?.unregisterCallback(callback); } catch (_) { /* Host may have disappeared. */ }
        client = null;
        settings = null;
        previousFocus?.focus?.();
        previousFocus = null;
        return { ok: true };
    }

    function reload() {
        tableReadController?.abort();
        cancelRecycle();
        if (category === 'inventory') refreshHeroInventory();
        // 数值系统开启：好感总览直接取 IGS 数值，不读表格。
        favorLive = category === 'favor' ? readFavorLive() : null;
        if (favorLive) {
            model = { status: favorLive.people.length ? 'ready' : 'empty', tables: [], people: favorLive.people, edges: [] };
            render();
            return;
        }
        const read = () => {
            const readResult = client.readTables();
            const next = category === 'relationships' ? buildRelationshipModel(readResult)
                : category === 'favor' ? buildFavorOverviewModel(readResult, resolveStatusHudPicks(settings?.statusHud, readResult), { skipName: (name) => isUserName(name, getSillyTavernContext()?.name1) })
                    : buildRecordModel(readResult, category);
            if (next.status === 'read-error') throw new Error(next.reason);
            return { model: next, readResult };
        };
        try { applyModel(read()); }
        catch (error) {
            if (model?.status !== 'ready') model = category === 'relationships' || category === 'favor'
                ? { status: 'read-error', reason: String(error?.message || '读取失败'), tables: [], people: [], edges: [] }
                : { status: 'read-error', reason: String(error?.message || '读取失败'), tables: [], entries: [] };
            message = '正在恢复资料读取'; render();
            const target = root, controller = tableReadController = new AbortController();
            void recoverMediaOperation(global || globalThis, read, { signal: controller.signal, isActive: () => Boolean(root) && root === target,
                observe: async () => ({ completed: true, value: await read() }) })
                .then(next => { if (!next?.cancelled && root === target) { message = ''; applyModel(next); } });
        }
    }

    function applyModel({ model: next, readResult }) {
        model = next;
        if (!table()) activeUid = model.tables[0]?.uid || '';
        if (category === 'relationships') {
            const live = readFavorLive();
            relationLive = new Map(live ? live.people.map(person => [person.name, { dims: person.dims, nsfw: live.nsfw, romance: Boolean(person.romance), kin: Boolean(person.kin), hero: person.hero || null }]) : []);
            let tableLookup = null;
            try {
                tableLookup = createCharacterMetricsLookup(readResult, {
                    selectedTables: resolveStatusHudPicks(settings?.statusHud, readResult),
                    characterAliases: (settings?._sceneAssets || settings?.sceneAssets)?.characterAliases,
                });
            } catch (_) { tableLookup = null; }
            // 数值系统开启且本聊天启用时，已登记角色以 IGS 数值为准，其余人仍读表格（易错点 H3）。
            let statsLookup = null;
            try { statsLookup = typeof options.statsLookup === 'function' ? options.statsLookup() : null; } catch (_) { statsLookup = null; }
            let heroLookup = null;
            try { heroLookup = typeof options.statsProtagonistLookup === 'function' ? options.statsProtagonistLookup() : null; } catch (_) { heroLookup = null; }
            const others = preferStatsLookup(statsLookup, tableLookup);
            // 用户本人与「设为User立绘」的角色都没有人际数值：显示主角生活条（压力、体力等），表格里的好感、信任、芥蒂等列不显示。
            const userCharacter = String(((settings?._sceneAssets || settings?.sceneAssets) || {}).userCharacter || '').trim();
            metricsOf = (name) => {
                const userName = getSillyTavernContext()?.name1;
                const picked = Boolean(userCharacter) && String(name || '').trim() === userCharacter;
                if (!picked && !isUserName(name, userName)) return others(name);
                const own = heroLookup ? heroLookup(name) : null;
                if (own && own.metrics && own.metrics.length) return own;
                let fromTable = null;
                try { fromTable = tableLookup ? tableLookup(name) : null; } catch (_) { fromTable = null; }
                return { ...dropUserFavor({ metrics: (fromTable && fromTable.metrics) || [] }, picked ? '主角' : name, userName), stages: [] };
            };
            if (!relationshipPeople().some(person => person.id === relationshipPersonId)) relationshipPersonId = relationshipPeople()[0]?.id || '';
            selectedId = '';
        } else if (selectedId && !entries().some(entry => entry.id === selectedId)) selectedId = '';
        if (category === 'diary') syncReadKeys();
        render();
    }

    // 首次使用把现有篇章记为已读，之后新写入的日记才显示未读圆点。
    function syncReadKeys() {
        const stored = loadJson(DIARY_READ_KEY, null);
        if (!Array.isArray(stored)) {
            readKeys = new Set((model?.entries || []).map(entryReadKey));
            saveJson(DIARY_READ_KEY, [...readKeys]);
        } else readKeys = new Set(stored);
        const chosen = (model?.entries || []).find(entry => entry.id === selectedId);
        if (chosen) markRead(chosen);
    }

    function markRead(entry) {
        const key = entryReadKey(entry);
        if (readKeys.has(key)) return;
        readKeys.add(key);
        saveJson(DIARY_READ_KEY, [...readKeys].slice(-DIARY_READ_LIMIT));
    }

    function readTheme() { try { return options.getTheme?.() || ''; } catch (_) { return ''; } }
    // 与设置器共用同一个配色：这里切换即写回设置；保存失败只影响持久化，不影响当前页面。
    function applyTheme(value) {
        theme = normalizeSettingsTheme(value);
        root?.setAttribute('data-rp-theme', theme);
        if (options.setTheme) void recoverMediaOperation(global || globalThis, () => options.setTheme(theme));
    }

    function savePrefs() { saveJson(DIARY_PREFS_KEY, { ...prefs, view: diaryView }); }
    function applyDiaryFontSize() { root?.style?.setProperty?.('--igs-rp-diary-size', `${prefs.fontSize}px`); }

    function applyRecordFont() {
        const style = root?.style;
        if (!style) return;
        if (font === RECORD_FONT_DEFAULT) {
            style.removeProperty?.('--igs-rp-font-ui');
            style.removeProperty?.('--igs-rp-font-body');
            return;
        }
        style.setProperty?.('--igs-rp-font-ui', font);
        style.setProperty?.('--igs-rp-font-body', font);
    }

    function onChange(event) {
        const input = event.target;
        if (!root || input?.getAttribute?.('data-record-input') !== 'font') return;
        font = normalizeRecordFont(String(input.value ?? ''), fontOptions());
        saveJson(RECORD_FONTS_KEY, { ...loadJson(RECORD_FONTS_KEY, {}), [category]: font });
        applyRecordFont();
    }

    function onInput(event) {
        const input = event.target;
        if (root && input?.getAttribute?.('data-record-input') === 'favor-query') {
            favorQuery = String(input.value ?? '');
            const list = root.querySelector?.('.igs-record-favor');
            if (list) list.innerHTML = favorRowsHtml();
            else render();
            return;
        }
        if (!root || input?.getAttribute?.('data-record-input') !== 'query') return;
        invQuery = String(input.value ?? '');
        const grid = root.querySelector?.('.igs-record-slots');
        if (grid) grid.innerHTML = slotsHtml(visibleItems());
        else render();
    }

    async function useItem() {
        const item = (model?.entries || []).find(entry => entry.id === selectedId);
        if (!item?.title) return;
        const target = root;
        // 有装配定义的回复道具走场外使用（数量减一、恢复伤势，先写最新 AI 楼说明）；服务返回 draft 时照旧填「使用X」草稿。
        if (typeof options.useInventoryItem === 'function') {
            message = '正在使用'; render();
            let result;
            try { result = await options.useInventoryItem(item.title); } catch (_) { result = { ok: false, reason: 'combat-action-threw' }; }
            if (root !== target) return;
            if (!result?.draft) {
                const ok = result?.ok === true;
                if (ok) reload();
                message = ok ? `已使用${item.title}` : `${deckReasonText(result?.reason)}${result?.floorRollback === 'failed' ? '；正文说明未能撤回，请检查最新楼层' : ''}`;
                render();
                return;
            }
        }
        if (typeof fillDraft !== 'function') { message = ''; render(); return; }
        message = '正在填入草稿'; render();
        const result = await recoverMediaOperation(global || globalThis, () => fillDraft(`使用${item.title}`), {
            signal: controller.signal, isActive: () => root === target });
        if (result?.cancelled) return;
        message = '已填入草稿，尚未发送';
        render();
    }

    // 战斗开启时的换装（P7e）：经宿主注入的 setHeroGear 改装配表穿戴状态（先写最新 AI 楼说明）；同部位已有装备时由服务顶替。
    async function wearItem(equip) {
        const item = (model?.entries || []).find(entry => entry.id === selectedId);
        const meta = item && heroInv ? heroOf(item) : null;
        if (!meta?.gearId || typeof options.setHeroGear !== 'function') return;
        const target = root;
        message = equip ? '正在装上' : '正在卸下'; render();
        let result;
        try { result = await options.setHeroGear(meta.gearId, equip); } catch (_) { result = { ok: false, reason: 'combat-action-threw' }; }
        if (root !== target) return;
        const ok = result?.ok === true;
        if (ok) reload();
        message = ok ? `${equip ? '已装上' : '已卸下'}${item.title}` : `${deckReasonText(result?.reason)}${result?.floorRollback === 'failed' ? '；正文说明未能撤回，请检查最新楼层' : ''}`;
        render();
    }

    function cancelRecycle() {
        const pending = recyclePending;
        recyclePending = null;
        pending?.confirmation?.cancel();
    }

    async function sellItem() {
        if (recyclePending) return;
        const item = (model?.entries || []).find(entry => entry.id === selectedId);
        const meta = item && heroInv ? heroOf(item) : null;
        const key = sellKeyOf(meta);
        if (!key || typeof options.sellHeroItem !== 'function') return;
        const stock = meta.kind === 'keepsake' ? heroInv.collection : heroInv.gear?.bag;
        const available = stock?.find(entry => (meta.kind === 'keepsake' ? entry.itemId : entry.gearId) === key)?.count;
        if (!Number.isSafeInteger(available) || available < 1) return;
        const unitPrice = sellPriceOf(meta);
        const target = root;
        const pending = { target, itemId: item.id, confirmation: null };
        recyclePending = pending;
        pending.confirmation = recycleModal.quantity(`是否回收「${item.title}」？`, 1, {
            min: 1, max: available, inputLabel: `回收数量（最多 ${available} 件）`,
            formatQuantity: count => `总计 ${unitPrice * count} 积分`,
            okLabel: '确认', cancelLabel: '取消',
        });
        const count = await pending.confirmation;
        if (recyclePending !== pending) return;
        if (count === null || root !== target || selectedId !== pending.itemId) {
            recyclePending = null;
            if (root === target) root.querySelector('[data-record-act="sell"]')?.focus?.({ preventScroll: true });
            return;
        }
        message = '正在回收'; render();
        let result;
        try { result = await options.sellHeroItem(meta.kind, key, count); } catch (_) { result = { ok: false, reason: 'combat-action-threw' }; }
        if (recyclePending !== pending || root !== target) return;
        recyclePending = null;
        const ok = result?.ok === true;
        if (ok) reload();
        message = ok ? `已回收${item.title} × ${count}，获得 ${result.price ?? unitPrice * count} 积分` : deckReasonText(result?.reason);
        render();
        root.querySelector('[data-record-act="sell"]')?.focus?.({ preventScroll: true });
    }

    function onClick(event) {
        event.stopPropagation?.();
        if (event.target === root) return close();
        const typing = event.target?.closest?.('.igs-record-body[data-igs-typewriter="running"]');
        if (typing) { cancelTypewriter(typing); return; }
        const zoom = event.target?.closest?.('[data-record-zoom]');
        if (zoom && root?.contains(zoom)) {
            event.preventDefault?.();
            const name = zoom.getAttribute('data-record-zoom') || '';
            openItemImageViewer(doc, pageOverlay, { src: zoomUrl(name), name });
            return;
        }
        const button = event.target?.closest?.('[data-record-act]');
        if (!button || !root?.contains(button)) return;
        event.preventDefault?.();
        const action = button.getAttribute('data-record-act');
        if (action === 'close') return close();
        const id = button.getAttribute('data-record-id');
        const previousSelected = selectedId;
        turn = '';
        if (action === 'use') { useItem(); return; }
        if (action === 'equip' || action === 'unequip') { wearItem(action === 'equip'); return; }
        if (action === 'sell') { sellItem(); return; }
        if (action === 'select' && id !== selectedId) cancelRecycle();
        if (action === 'theme') applyTheme(id);
        if (action !== 'toggle-prefs' && action !== 'pref' && action !== 'font-size') message = '';
        if (action === 'table' && model.tables.some(item => item.uid === id)) {
            activeUid = id;
            if (category === 'relationships') relationshipPersonId = relationshipPeople()[0]?.id || '';
            selectedId = '';
        }
        if (action === 'book' && category === 'diary') {
            // 选册：清空篇章选择，等待用户点篇；不自动替用户决定读哪一篇。
            if (diaryBooks().some(book => book.key === id)) { diaryBook = id; selectedId = ''; }
        }
        if (action === 'diary-view' && (id === 'books' || id === 'timeline')) { diaryView = id; savePrefs(); }
        if (action === 'toggle-prefs') prefsOpen = !prefsOpen;
        if (action === 'pref' && typeof DIARY_PREF_DEFAULTS[id] === 'boolean') { prefs[id] = !prefs[id]; savePrefs(); }
        if (action === 'font-size' && (id === 'up' || id === 'down')) {
            prefs.fontSize = clampDiaryFontSize(prefs.fontSize + (id === 'up' ? 1 : -1));
            savePrefs();
            applyDiaryFontSize();
        }
        if (action === 'select') {
            const entry = entries().find(item => item.id === id);
            if (entry) {
                if (category === 'diary') {
                    const list = diaryList();
                    const from = list.findIndex(item => item.id === selectedId);
                    const to = list.findIndex(item => item.id === id);
                    turn = from >= 0 && to >= 0 && to < from ? 'prev' : 'next';
                    if (diaryView === 'books') diaryBook = `${entry.uid}::${entry.author || ''}`;
                    markRead(entry);
                }
                selectedId = id;
            }
        }
        if (action === 'favor-log' && category === 'favor') { if (!favorOpen.delete(id)) favorOpen.add(id); }
        if (action === 'favor-log-all' && category === 'favor') favorAll.add(id);
        if (action === 'favor-desc' && category === 'favor') { if (!favorDesc.delete(id)) favorDesc.add(id); }
        if (action === 'favor-sort' && category === 'favor') {
            const keys = favorSortKeys();
            favorSort = keys[(keys.indexOf(favorSort) + 1) % keys.length];
            favorAsc = favorSort === '名字';
        }
        if (action === 'favor-dir' && category === 'favor') favorAsc = !favorAsc;
        if (action === 'group' && category === 'inventory') invGroup = inventoryGroups().includes(id) ? id : '';
        if (action === 'sort' && category === 'inventory') {
            const index = INVENTORY_SORTS.findIndex(([key]) => key === invSort);
            invSort = INVENTORY_SORTS[(index + 1) % INVENTORY_SORTS.length][0];
        }
        if (action === 'stats-sheet' && category === 'relationships' && typeof options.statsGenerate === 'function') {
            button.disabled = true;
            button.textContent = '生成中…';
            Promise.resolve(options.statsGenerate(id)).catch(() => null).finally(() => { if (root) reload(); });
            return;
        }
        if (action === 'person' && category === 'relationships') {
            const person = relationshipPeople().find(item => item.id === id);
            if (person) relationshipPersonId = person.id;
        }
        if ((action === 'prev-entry' || action === 'next-entry') && category === 'diary') {
            const list = diaryList();
            const index = list.findIndex(item => item.id === selectedId);
            const next = index + (action === 'next-entry' ? 1 : -1);
            if (index >= 0 && next >= 0 && next < list.length) {
                selectedId = list[next].id;
                turn = action === 'next-entry' ? 'next' : 'prev';
                markRead(list[next]);
            }
        }
        if (selectedId === previousSelected) turn = '';
        const scroller = action.startsWith('favor-') ? root?.querySelector?.('.igs-record-scroll') : null;
        const scrollTop = scroller ? scroller.scrollTop : 0;
        render();
        if (scroller) { const next = root?.querySelector?.('.igs-record-scroll'); if (next) next.scrollTop = scrollTop; }
        // Rerender replaces the activated button. Return focus to its replacement,
        // without interpolating untrusted sheet IDs into a CSS selector.
        const replacement = Array.from(root?.querySelectorAll?.('[data-record-act]') || [])
            .find(item => item.getAttribute('data-record-act') === action && item.getAttribute('data-record-id') === id);
        replacement?.focus?.();
    }

    function slotsHtml(items) {
        if (!items.length) return '<p class="igs-record-slots-empty">没有符合条件的物品</p>';
        return items.map(item => {
            // 数量语义：'0' 如实显示 ×0；缺失不补 ×1、不显示角标，详情写“数量未记录”；
            // 单件是常态，格位上的 ×1 只是噪音，数量仍在详情头完整呈现。
            const quantity = String(item.quantity ?? '').trim();
            const badge = quantity && quantity !== '1';
            const selected = item.id === selectedId;
            const meta = heroInv ? heroOf(item) : null;
            const unsellable = meta && unsellableOf(meta) ? '<small class="igs-record-slot-unsellable">(不可回收)</small>' : '';
            return `<button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="查看${escapeHtml(item.title)}${meta?.equipped ? '（已装备）' : ''}${unsellable ? '（不可回收）' : ''}" ${selected ? 'aria-current="true"' : ''}>${meta?.equipped ? '<small class="igs-record-slot-worn" aria-hidden="true">已装备</small>' : ''}<span class="igs-record-slot-icon" aria-hidden="true">${itemIcon(item.title)}</span><span class="igs-record-slot-name">${escapeHtml(item.title || '未命名')}${unsellable}</span>${badge ? `<small class="igs-record-slot-quantity">×${escapeHtml(quantity)}</small>` : ''}</button>`;
        }).join('');
    }

    function renderInventory() {
        const items = visibleItems();
        const chosen = (model?.entries || []).find(item => item.id === selectedId);
        const groups = inventoryGroups();
        const total = (model?.entries || []).length;
        const chips = groups.length > 1 ? `<div class="igs-record-groups" role="group" aria-label="物品分类"><button type="button" class="igs-rp-chip" data-record-act="group" data-record-id="" aria-pressed="${invGroup ? 'false' : 'true'}">全部<small>${total}</small></button>${groups.map(label =>
            `<button type="button" class="igs-rp-chip" data-record-act="group" data-record-id="${escapeHtml(label)}" aria-pressed="${label === invGroup ? 'true' : 'false'}">${escapeHtml(label)}<small>${(model?.entries || []).filter(item => itemGroup(item) === label).length}</small></button>`).join('')}</div>` : '';
        const sortLabel = INVENTORY_SORTS.find(([key]) => key === invSort)?.[1] || '默认';
        const points = heroInv && Number.isFinite(Number(heroInv.points)) ? `<span class="igs-record-points" role="status">金钱 ${escapeHtml(heroInv.points)}</span>` : '';
        const tools = total || points ? `<div class="igs-record-inventory-tools">${chips}<div class="igs-record-inventory-actions">${points}<label class="igs-rp-search">${RECORD_ICONS.search}<input type="search" data-record-input="query" value="${escapeHtml(invQuery)}" placeholder="搜索物品" aria-label="搜索物品" autocomplete="off"></label><button type="button" class="igs-rp-chip igs-rp-chip-icon" data-record-act="sort" aria-label="排序：${sortLabel}">${RECORD_ICONS.sort}<span>${sortLabel}</span></button></div></div>` : '';
        let detail = '';
        if (chosen) {
            const descriptionCell = (chosen.detailCells || []).find(cell => ['描述', '说明', '内容', '详情'].includes(String(cell.label || '').trim()));
            const extraCells = (chosen.detailCells || []).filter(cell => cell !== descriptionCell);
            const quantity = String(chosen.quantity ?? '').trim();
            const useService = typeof options.useInventoryItem === 'function';
            const chosenMeta = heroInv ? heroOf(chosen) : null;
            const sellKey = sellKeyOf(chosenMeta);
            const canRecycle = Boolean(sellKey) && typeof options.sellHeroItem === 'function';
            const quality = chosenMeta?.junk === true ? '劣等' : STOCK_RARITY_LABELS[chosenMeta?.rarity] || '普通';
            const bonusText = chosenMeta?.kind === 'gear' ? gearBonusText(chosenMeta) : '';
            const passiveText = chosenMeta?.kind === 'gear' ? (chosenMeta.passive?.description || chosenMeta.passive?.name || '') : '';
            const gearCells = [...(chosenMeta?.junk === true || canRecycle ? [{ label: '品质', value: canRecycle ? `${quality} · ${sellPriceOf(chosenMeta)} 积分` : quality }] : []), ...(bonusText ? [{ label: '加成', value: bonusText }] : []), ...(passiveText ? [{ label: '被动', value: passiveText }] : [])];
            // 战斗开启时装备不给「使用」：穿着的给「卸下」，背包里的给「装上」。
            const wearButton = chosenMeta?.gearId && typeof options.setHeroGear === 'function'
                ? `<div class="igs-record-item-actions"><button type="button" class="igs-rp-btn" data-record-act="${chosenMeta.equipped ? 'unequip' : 'equip'}">${chosenMeta.equipped ? '卸下' : '装上'}</button></div>` : '';
            const sellButton = canRecycle
                ? `<button type="button" class="igs-rp-btn" data-record-act="sell">回收</button>` : '';
            const baseButton = chosenMeta?.kind === 'gear' ? wearButton
                : ((useService || typeof fillDraft === 'function') && quantity !== '0'
                    ? `<div class="igs-record-item-actions"><button type="button" class="igs-rp-btn" data-record-act="use">使用</button>${useService ? '' : `<small>把「使用${escapeHtml(chosen.title || '')}」填入输入框，不会自动发送</small>`}</div>` : '');
            const useButton = !sellButton ? baseButton
                : baseButton ? baseButton.replace(/<\/div>$/, `${sellButton}</div>`) : `<div class="igs-record-item-actions">${sellButton}</div>`;
            detail = `<section class="igs-record-item-detail"><header class="igs-record-item-head">${detailIconHtml(chosen.title)}<div class="igs-record-item-title"><p class="igs-record-item-kicker">${escapeHtml(itemKicker(chosen))}</p><h3>${escapeHtml(chosen.title || '未命名')}</h3><p class="igs-record-item-quantity"><span>${quantity ? `数量：×${escapeHtml(quantity)}` : '数量未记录'}</span>${wornTag(chosen)}${chosen.status ? `<span class="igs-record-tag">${escapeHtml(chosen.status)}</span>` : ''}</p></div></header><div class="igs-record-item-detail-copy">${descriptionCell ? `<p class="igs-record-item-description">${escapeHtml(descriptionCell.value)}</p>` : ''}${cellsHtml([...extraCells, ...gearCells])}${useButton}<p class="igs-record-feedback" role="status" aria-live="polite">${escapeHtml(message)}</p></div></section>`;
        }
        // 未选物品且战斗未开启时不留右栏；战斗开启时右栏常驻当前装备映射。
        const pane = detail + (heroInv ? gearMapHtml() : '');
        return `<div class="igs-record-inventory${pane ? '' : ' is-solo'}"><section class="igs-record-inventory-main">${tools}<div class="igs-record-slots" aria-label="物品栏">${slotsHtml(items)}</div></section>${pane ? `<aside class="igs-record-item-pane">${pane}</aside>` : ''}</div>`;
    }

    function gearMapHtml() {
        const slots = heroInv?.gear?.slots || {};
        // 宝物部位可装多件（规则 v6）：每件一行，没有时留一行空位。
        const rows = Object.entries(STOCK_SLOT_LABELS).flatMap(([slot, label]) => {
            const list = slotGearList(slots[slot]);
            return (list.length ? list : [null]).map((worn) => {
            const entry = worn ? (model?.entries || []).find(item => String(item.title ?? '').trim() === worn.name) : null;
            const rarity = worn?.rarity ? STOCK_RARITY_LABELS[worn.rarity] || '' : '';
            const tier = rarity ? `<small data-rarity="${escapeHtml(worn.rarity)}">${escapeHtml(rarity)}</small>` : '';
            const body = !worn ? '<span class="igs-record-gear-empty">空</span>'
                : entry ? `<button type="button" data-record-act="select" data-record-id="${escapeHtml(entry.id)}" aria-label="查看${escapeHtml(worn.name)}" ${entry.id === selectedId ? 'aria-current="true"' : ''}><span class="igs-record-gear-icon" aria-hidden="true">${itemIcon(worn.name)}</span><span class="igs-record-gear-name">${escapeHtml(worn.name)}</span>${tier}</button>`
                    : `<span class="igs-record-gear-name">${escapeHtml(worn.name)}</span>`;
            return `<li><span class="igs-record-gear-slot">${escapeHtml(label)}</span>${body}</li>`;
            });
        }).join('');
        return `<section class="igs-record-gear-map" aria-label="当前装备"><h3>当前装备</h3><ul>${rows}</ul></section>`;
    }

    function diaryPageHtml(entry, { heading = 'h3' } = {}) {
        const meta = [escapeHtml(entry.author || '未署名'), entry.date ? escapeHtml(entry.date) : '', entry.related ? `关于 ${escapeHtml(entry.related)}` : ''].filter(Boolean).join('<i aria-hidden="true">·</i>');
        const { title, body } = diaryHeading(entry);
        return `<p class="igs-record-diary-meta">${meta}</p>${title ? `<${heading}>${escapeHtml(title)}</${heading}>` : ''}` +
            (body ? `<p class="igs-record-body${title ? '' : ' is-lead'}">${escapeHtml(body)}</p>` : cellsHtml(entry.detailCells || []));
    }

    function renderDiary() {
        const books = diaryBooks();
        const book = currentBook();
        if (book) diaryBook = book.key;
        const list = diaryList();
        const chosen = list.find(item => item.id === selectedId) || null;
        const index = chosen ? list.indexOf(chosen) : -1;
        const dot = entry => isUnread(entry) ? '<i class="igs-rp-dot" aria-label="未读"></i>' : '';
        const viewSwitch = `<div class="igs-rp-segment" role="group" aria-label="浏览方式"><button type="button" data-record-act="diary-view" data-record-id="books" aria-pressed="${diaryView === 'books'}">${RECORD_ICONS.people}<span>按人物</span></button><button type="button" data-record-act="diary-view" data-record-id="timeline" aria-pressed="${diaryView === 'timeline'}">${RECORD_ICONS.timeline}<span>时间线</span></button></div>`;
        const prefsButton = `<button type="button" class="igs-rp-icon-btn" data-record-act="toggle-prefs" aria-expanded="${prefsOpen}" aria-label="阅读设置">${RECORD_ICONS.sliders}</button>`;
        const fontSizeRow = `<div class="igs-record-font-size"><span><strong>正文字号</strong><small>日记正文与篇名，${DIARY_FONT_SIZE.min}–${DIARY_FONT_SIZE.max}</small></span><span class="igs-record-stepper" role="group" aria-label="正文字号"><button type="button" data-record-act="font-size" data-record-id="down" aria-label="减小字号" ${prefs.fontSize <= DIARY_FONT_SIZE.min ? 'disabled' : ''}>−</button><output aria-live="polite">${prefs.fontSize}</output><button type="button" data-record-act="font-size" data-record-id="up" aria-label="增大字号" ${prefs.fontSize >= DIARY_FONT_SIZE.max ? 'disabled' : ''}>+</button></span></div>`;
        const prefsPanel = prefsOpen ? `<div class="igs-record-prefs" role="group" aria-label="阅读设置">${fontSizeRow}${DIARY_PREFS.map(([key, label, hint]) =>
            `<button type="button" data-record-act="pref" data-record-id="${key}" aria-pressed="${prefs[key] ? 'true' : 'false'}"><span class="igs-rp-switch" aria-hidden="true"></span><span><strong>${label}</strong><small>${hint}</small></span></button>`).join('')}</div>` : '';
        let nav = '';
        if (diaryView === 'books') {
            nav = `<div class="igs-record-bookshelf" aria-label="选册">${books.map(item => {
                const unread = item.entries.filter(isUnread).length;
                return `<button type="button" class="igs-record-book" data-record-act="book" data-record-id="${escapeHtml(item.key)}" aria-label="阅读${escapeHtml(item.label)}的日记" ${item.key === diaryBook ? 'aria-current="true"' : ''}><span class="igs-record-book-avatar" aria-hidden="true">${personInitial(item.author || '?')}</span><span class="igs-record-book-meta"><span>${escapeHtml(item.label)}</span><small>${item.entries.length} 篇${unread ? ` · ${unread} 未读` : ''}</small></span>${unread ? '<i class="igs-rp-dot" aria-hidden="true"></i>' : ''}</button>`;
            }).join('')}</div>` + (list.length ? `<ol class="igs-record-chapters" aria-label="篇章列表">${list.map(item =>
                `<li><button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="阅读${escapeHtml(chapterTitle(item))}" ${item.id === selectedId ? 'aria-current="true"' : ''}>${item.date ? `<span class="igs-record-chapter-date">${escapeHtml(dateLabel(item.date))}</span>` : ''}<span class="igs-record-chapter-title">${escapeHtml(chapterTitle(item))}</span>${dot(item)}</button></li>`).join('')}</ol>` : '');
        } else {
            let lastDate = null;
            nav = list.length ? `<ol class="igs-record-timeline" aria-label="时间线">${list.map(item => {
                const label = item.date ? dateLabel(item.date) : '';
                const header = label !== lastDate && label ? `<li class="igs-record-timeline-date" aria-hidden="true">${escapeHtml(label)}</li>` : '';
                lastDate = label;
                return `${header}<li><button type="button" data-record-act="select" data-record-id="${escapeHtml(item.id)}" aria-label="阅读${escapeHtml(item.author || '未署名')}的${escapeHtml(chapterTitle(item))}" ${item.id === selectedId ? 'aria-current="true"' : ''}><span class="igs-record-timeline-avatar" aria-hidden="true">${personInitial(item.author || '?')}</span><span class="igs-record-timeline-copy"><strong>${escapeHtml(chapterTitle(item))}</strong></span>${dot(item)}</button></li>`;
            }).join('')}</ol>` : '';
        }
        let reading;
        if (prefs.scroll && list.length) {
            reading = `<div class="igs-record-diary-detail is-scroll" aria-label="连续阅读">${list.map(item =>
                `<section class="igs-record-diary-page${item.id === selectedId ? ' is-current' : ''}" data-record-page="${escapeHtml(item.id)}">${diaryPageHtml(item)}</section>`).join('')}</div>`;
        } else if (chosen) {
            const turnClass = prefs.pageTurn && turn ? ` igs-rp-turn-${turn}` : '';
            reading = `<article class="igs-record-diary-detail${turnClass}">${diaryPageHtml(chosen)}` +
                `<footer class="igs-record-diary-nav"><button type="button" data-record-act="prev-entry" ${index <= 0 ? 'disabled' : ''}>← 上一则</button><span>${index >= 0 ? `${String(index + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}` : ''}</span><button type="button" data-record-act="next-entry" ${index < 0 || index >= list.length - 1 ? 'disabled' : ''}>下一则 →</button></footer></article>`;
        } else reading = `<div class="igs-record-diary-empty"><span aria-hidden="true">${RECORD_ICONS.book}</span><p>${diaryView === 'books' ? '选择一册与一篇开始阅读' : '在时间线中选择一篇开始阅读'}</p></div>`;
        return `<div class="igs-record-diary" data-view="${diaryView}"><aside class="igs-record-diary-side"><div class="igs-record-diary-tools">${viewSwitch}${prefsButton}</div>${prefsPanel}${nav}</aside>${reading}</div>`;
    }

    function renderRelationships() {
        const people = relationshipPeople();
        const chosen = people.find(item => item.id === relationshipPersonId) || people[0] || null;
        if (chosen && chosen.id !== relationshipPersonId) relationshipPersonId = chosen.id;
        const localEdges = chosen ? relationshipEdges().filter(edge => edge.from === chosen.name || edge.to === chosen.name) : [];
        // 同一对人物的多条关系合并成一条线、一个标签（如「同学·旧识」），不再上下叠放。
        const neighbors = [];
        const linkLabels = new Map();
        for (const edge of localEdges) {
            const name = edge.from === chosen?.name ? edge.to : edge.from;
            const person = people.find(item => item.name === name) || { id: `${activeUid}:edge-name:${name}`, uid: activeUid, name, role: '', description: '', synthetic: true };
            if (!neighbors.some(item => item.id === person.id)) neighbors.push(person);
            const labels = linkLabels.get(name) || [];
            if (edge.label && !labels.includes(edge.label)) labels.push(edge.label);
            linkLabels.set(name, labels);
        }
        const neighborX = neighbors.length <= 1 ? [50] : neighbors.map((_, index) =>
            Math.round((18 + (64 * index) / (neighbors.length - 1)) * 10) / 10);
        const graphNodes = [{ person: chosen, x: 50, y: neighbors.length ? 24 : 50 }, ...neighbors.map((person, index) =>
            ({ person, x: neighborX[index], y: neighbors.length > 4 && index % 2 ? 80 : 72 }))].filter(item => item.person);
        const nodeByName = new Map(graphNodes.map(item => [item.person.name, item]));
        const lineHtml = [...linkLabels.keys()].map(name => {
            const target = nodeByName.get(name);
            if (!target) return '';
            const startY = neighbors.length ? 34 : 50;
            const endY = neighbors.length ? target.y - 9 : target.y;
            const controlX = Math.round(((50 + target.x) / 2) * 10) / 10;
            return `<path d="M 50 ${startY} C 50 ${startY + 14}, ${controlX} ${endY - 14}, ${target.x} ${endY}"></path>`;
        }).join('');
        const labelHtml = [...linkLabels].map(([name, labels], index) => {
            const target = nodeByName.get(name);
            if (!target) return '';
            const left = Math.round(((50 + target.x) / 2) * 10) / 10;
            const top = neighbors.length > 4 ? 50 + (index % 2) * 5 : 50;
            return `<span class="igs-record-relationship-label" style="left:${left}%;top:${top}%">${escapeHtml(labels.join('·') || '关系未标注')}</span>`;
        }).join('');
        const graphHtml = chosen ? `<div class="igs-record-relationship-graph" aria-label="${escapeHtml(chosen.name)}的局部关系图"><svg class="igs-record-relationship-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lineHtml}</svg>${labelHtml}${graphNodes.map(node =>
            `<button type="button" class="igs-record-relationship-node${node.person.id === chosen.id ? ' is-current' : ''}" style="left:${node.x}%;top:${node.y}%" data-record-act="person" data-record-id="${escapeHtml(node.person.id)}" aria-label="查看${escapeHtml(node.person.name)}" ${node.person.id === relationshipPersonId ? 'aria-current="true"' : ''}><span class="igs-record-node-avatar" aria-hidden="true">${personInitial(node.person.name)}</span><span class="igs-record-node-name">${escapeHtml(node.person.name)}</span></button>`).join('')}</div>` : '<p class="igs-record-relationship-empty">当前来源没有可识别的人物记录。</p>';
        const { metrics, stages, sheet } = chosen ? metricsOf(chosen.name) : { metrics: [], stages: [] };
        const stageLive = chosen ? relationLive.get(chosen.name) : null;
        // 数值系统的角色卡（v2 §9.3）：资历与擅长项；没有卡时给「生成数值」。
        const sheetHtml = !sheet ? '' : sheet.missing
            ? `<p class="igs-record-stage"><span>角色数值</span><strong>未生成</strong></p><button type="button" class="igs-rp-btn" data-record-act="stats-sheet" data-record-id="${escapeHtml(sheet.name)}">生成数值</button>`
            : `<p class="igs-record-stage"><span>资历</span><strong>${escapeHtml(sheet.rank)}${sheet.provisional ? '（部分待定）' : ''}</strong></p>${sheet.strong.length ? `<p class="igs-record-stage"><span>擅长</span><strong>${escapeHtml(sheet.strong.join('、'))}</strong></p>` : ''}`;
        const metricsHtml = metrics.length || stages.length ? `<section class="igs-record-metrics" aria-label="${escapeHtml(chosen.name)}的数值">${stages.map(stage =>
            `<p class="igs-record-stage"><span>${escapeHtml(stage.label)}</span><strong>${escapeHtml(stage.label === '关系阶段' && stageLive ? stageLabel(stageLive.dims?.好感, stageLive.romance) : stage.value)}</strong></p>`).join('')}${sheetHtml}${metrics.map(metric =>
            `<div class="igs-record-metric"><span>${escapeHtml(metric.label)}</span><i role="img" aria-label="${escapeHtml(metric.label)} ${escapeHtml(metric.display)}"><b style="width:${Math.max(0, Math.min(100, Number(metric.percent) || 0))}%"></b></i><em>${escapeHtml(metric.display)}</em></div>`).join('')}</section>` : '';
        const age = chosen?.profile?.find(field => field.key === 'age')?.value || '';
        const tags = [chosen?.role, age && (/^\d+$/.test(age) ? `${age}岁` : age)].filter(Boolean);
        const thought = chosen?.profile?.find(field => field.key === 'thought')?.value || '';
        const live = chosen ? relationLive.get(chosen.name) : null;
        const relation = live ? relationLabel(live.dims, { nsfw: live.nsfw, romance: live.romance, kin: live.kin, hero: live.hero }) : null;
        const headHtml = chosen ? `<header class="igs-record-person-head"><h2>${escapeHtml(chosen.name)}</h2>${tags.map(tag => `<span class="igs-record-tag">${escapeHtml(tag)}</span>`).join('')}${relation ? `<span class="igs-record-tag igs-record-relation-tag" title="${escapeHtml(`${towardYou(chosen.name)}：${relation.desc}`)}">${escapeHtml(relation.name)}</span>` : ''}</header>${thought ? `<p class="igs-record-thought" aria-label="当下想法">${escapeHtml(thought)}</p>` : ''}` : '';
        // 档案表只展示外貌/打扮/过往经历（年龄进标题标签、当下想法做名下引语）；旧表没有这些列时才回退为描述 + 原始字段。
        const profile = (chosen?.profile || []).filter(field => field.key !== 'age' && field.key !== 'thought');
        const profileHtml = !chosen ? '' : chosen.hasProfile
            ? (profile.length ? `<dl class="igs-record-profile">${profile.map(field => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)}</dd></div>`).join('')}</dl>` : '<p class="igs-record-relationship-note">暂无外貌与经历记录。</p>')
            : `<p class="igs-record-relationship-description">${chosen.description ? escapeHtml(chosen.description) : '暂无人物描述。'}</p>${cellsHtml(chosen.detailCells || [])}${chosen.synthetic ? '<p class="igs-record-relationship-note">仅记录了姓名，未提供身份或描述。</p>' : ''}`;
        return `<div class="igs-record-relationships">` +
            `<section class="igs-record-relationship-stage">${graphHtml}</section>` +
            `<section class="igs-record-people" aria-label="人物索引"><div class="igs-record-people-list">${people.map(person =>
                `<button type="button" data-record-act="person" data-record-id="${escapeHtml(person.id)}" aria-label="查看${escapeHtml(person.name)}" ${person.id === relationshipPersonId ? 'aria-current="true"' : ''}><span class="igs-record-person-avatar" aria-hidden="true">${personInitial(person.name)}</span><span class="igs-record-person-copy"><strong>${escapeHtml(person.name)}</strong></span></button>`).join('')}</div></section>` +
            `<article class="igs-record-relationship-detail">${chosen ? `${headHtml}${metricsHtml}<section class="igs-record-relationship-section">${profileHtml}</section>` : '<p>请选择人物。</p>'}</article></div>`;
    }

    // 变动记录一行：「第N天 · 第M楼　好感 +5　感动」；增为暖色、减为冷色。
    function favorLogLine(entry) {
        const delta = (Number(entry.to) || 0) - (Number(entry.from) || 0);
        const when = [entry.day === null || entry.day === undefined ? '' : `第${entry.day}天`, `第${entry.messageId}楼`].filter(Boolean).join(' · ');
        const tone = delta >= 0 ? 'up' : 'down';
        return `<li class="igs-record-favor-log-item" data-tone="${tone}"><span>${escapeHtml(when)}</span><strong>${escapeHtml(entry.key)} ${delta > 0 ? '+' : ''}${delta}</strong><em>${escapeHtml(entry.note)}</em></li>`;
    }

    const FAVOR_LOG_RECENT = 5;

    // 关系名是单向的：按角色性别写「他对你 / 她对你」，取不到性别写「TA对你」。性别取自该角色 DNA（与语气音、立绘高度同源）。
    function towardYou(name) {
        let gender = '';
        try { gender = characterDnaGender(settings?._sceneAssets || settings?.sceneAssets, name); } catch (_) { gender = ''; }
        return `${gender === 'male' ? '他' : gender === 'female' ? '她' : 'TA'}对你`;
    }

    // 数值系统读维度原值；表格模式只有标签含该字的数值条可比，取其百分比。取不到返回 null。
    function favorDimValue(person, key) {
        if (favorLive) {
            const value = Number(person.dims?.[key]);
            return Number.isFinite(value) ? value : null;
        }
        const metric = (person.metrics || []).find(item => String(item.label || '').includes(key)) || (key === '好感' ? person.metrics?.[0] : null);
        const value = Number(metric?.percent);
        return metric && Number.isFinite(value) ? value : null;
    }

    function favorPeople() {
        return favorLive ? favorLive.people : favorTableOrdered();
    }

    // 只列出至少一位角色有数值的维度；好感与名字始终可选。
    function favorSortKeys() {
        const people = favorPeople();
        return FAVOR_SORT_KEYS.filter(key => key === '好感' || key === '名字' || people.some(person => favorDimValue(person, key) !== null));
    }

    // 搜索名字 + 排序；好感从高到低保留底序（表格模式按所选表分组），其余整体重排，缺值的排最后。
    function favorVisible(list) {
        const query = favorQuery.trim().toLowerCase();
        const hit = query ? list.filter(person => String(person.name).toLowerCase().includes(query)) : list.slice();
        const dir = favorAsc ? 1 : -1;
        if (favorSort === '名字') return hit.sort((a, b) => dir * String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
        if (favorSort === '好感' && !favorAsc) return hit;
        return hit.sort((a, b) => {
            const va = favorDimValue(a, favorSort);
            const vb = favorDimValue(b, favorSort);
            if (va === null || vb === null) return (va === null) - (vb === null);
            return dir * (va - vb);
        });
    }

    function favorRowsHtml() {
        const rows = favorLive ? favorLiveRows() : favorTableRows();
        return rows || '<p class="igs-record-slots-empty">没有符合条件的角色</p>';
    }

    function favorToolsHtml(total) {
        if (total < 2) return '';
        if (!favorSortKeys().includes(favorSort)) favorSort = '好感';
        const dirLabel = favorSort === '名字' ? (favorAsc ? '正序' : '倒序') : (favorAsc ? '从低到高' : '从高到低');
        return `<div class="igs-record-inventory-tools"><div class="igs-record-inventory-actions"><label class="igs-rp-search">${RECORD_ICONS.search}<input type="search" data-record-input="favor-query" value="${escapeHtml(favorQuery)}" placeholder="搜索名字" aria-label="搜索名字" autocomplete="off"></label>`
            + `<button type="button" class="igs-rp-chip igs-rp-chip-icon" data-record-act="favor-sort" aria-label="排序依据：${favorSort}">${RECORD_ICONS.sort}<span>${favorSort}</span></button>`
            + `<button type="button" class="igs-rp-chip" data-record-act="favor-dir" aria-label="排序方向：${dirLabel}">${dirLabel}</button></div></div>`;
    }

    function favorLiveRows() {
        const { nsfw } = favorLive;
        return favorVisible(favorLive.people).map(person => {
            const label = relationLabel(person.dims, { nsfw, romance: person.romance, kin: person.kin, hero: person.hero });
            const toward = towardYou(person.name);
            const open = favorOpen.has(person.name);
            const all = favorAll.has(person.name);
            const shown = all ? person.log : person.log.slice(0, FAVOR_LOG_RECENT);
            const logBody = !open ? '' : person.log.length
                ? `<ol class="igs-record-favor-log-list">${shown.map(favorLogLine).join('')}</ol>${!all && person.log.length > FAVOR_LOG_RECENT ? `<button type="button" class="igs-record-favor-log-more" data-record-act="favor-log-all" data-record-id="${escapeHtml(person.name)}">查看全部</button>` : ''}`
                : '<p class="igs-record-favor-log-empty">暂无变动。</p>';
            return `<div class="igs-record-favor-row" role="listitem"><span class="igs-record-favor-avatar" aria-hidden="true">${personInitial(person.name)}</span>` +
                `<span class="igs-record-favor-who"><strong>${escapeHtml(person.name)}</strong><button type="button" class="igs-record-relation" data-record-act="favor-desc" data-record-id="${escapeHtml(person.name)}" aria-expanded="${favorDesc.has(person.name) ? 'true' : 'false'}" title="${escapeHtml(`${toward}：${label.desc}`)}">${escapeHtml(label.name)}</button></span>` +
                `<div class="igs-record-favor-bars">${person.metrics.map(metric =>
                    `<div class="igs-record-metric"><span>${escapeHtml(metric.label)}</span><i role="img" aria-label="${escapeHtml(metric.label)} ${escapeHtml(metric.display)}"><b data-tone="${escapeHtml(metric.colorKey || '')}" style="width:${Math.max(0, Math.min(100, Number(metric.percent) || 0))}%"></b></i><em>${escapeHtml(metric.display)}</em></div>`).join('')}</div>` +
                (favorDesc.has(person.name) ? `<p class="igs-record-favor-desc">${escapeHtml(`${toward}：${label.desc}`)}</p>` : '') +
                `<div class="igs-record-favor-log"><button type="button" class="igs-record-favor-log-toggle" data-record-act="favor-log" data-record-id="${escapeHtml(person.name)}" aria-expanded="${open ? 'true' : 'false'}">最近变动</button>${logBody}</div></div>`;
        }).join('');
    }

    function favorTableOrdered() {
        const people = model?.people || [];
        return (model?.tables || []).flatMap(source => people.filter(person => person.uid === source.uid)
            .sort((a, b) => (Number(b.metrics[0]?.percent) || 0) - (Number(a.metrics[0]?.percent) || 0)));
    }

    function favorTableRows() {
        const showSource = (model?.tables || []).length > 1;
        return favorVisible(favorTableOrdered()).map(person =>
            `<div class="igs-record-favor-row" role="listitem"><span class="igs-record-favor-avatar" aria-hidden="true">${personInitial(person.name)}</span>` +
            `<span class="igs-record-favor-who"><strong>${escapeHtml(person.name)}</strong>${showSource ? `<small>${escapeHtml(person.source)}</small>` : ''}</span>` +
            `<div class="igs-record-favor-bars">${person.metrics.map(metric =>
                `<div class="igs-record-metric"><span>${escapeHtml(metric.label)}</span><i role="img" aria-label="${escapeHtml(metric.label)} ${escapeHtml(metric.display)}"><b style="width:${Math.max(0, Math.min(100, Number(metric.percent) || 0))}%"></b></i><em>${escapeHtml(metric.display)}</em></div>`).join('')}</div></div>`).join('');
    }

    // 好感总览：按状态栏所选表的顺序分组，组内按好感从高到低；数值只来自表格，不推断、不写回。
    function renderFavor() {
        const total = favorPeople().length;
        if (!total) return '';
        return favorToolsHtml(total) + `<div class="igs-record-favor" role="list" aria-label="全部角色好感度">${favorRowsHtml()}</div>`;
    }

    function render() {
        if (!root) return;
        const current = table();
        const items = entries();
        const tabs = category === 'relationships' && model.tables.length > 1 ? `<nav class="igs-record-tabs" aria-label="选择资料来源">${model.tables.map(item =>
            `<button type="button" class="igs-rp-chip" data-record-act="table" data-record-id="${escapeHtml(item.uid)}" aria-pressed="${item.uid === activeUid ? 'true' : 'false'}" ${item.uid === activeUid ? 'aria-current="true"' : ''}>${escapeHtml(item.name)}</button>`).join('')}</nav>` : '';
        const error = model.status === 'read-error' ? `${labels[category]}读取失败：${model.reason}`
            : model.status === 'no-selection' && !favorLive ? '状态栏还没有选择读取表格，请在「界面 › 状态栏」里选择含好感度的表'
            : model.status === 'no-tables' ? `未找到匹配的${labels[category]}表`
                : model.status === 'empty' ? (favorLive ? '数值系统还没有登记的角色' : '匹配表没有可阅读的记录') : '';
        const diagnostics = category === 'relationships'
            ? (current?.diagnostics || [])
            : (model.tables || []).flatMap(item => item.diagnostics || []);
        let content = '';
        if (category === 'diary') content = renderDiary();
        else if (category === 'inventory') content = renderInventory();
        else if (category === 'relationships') content = renderRelationships();
        else if (category === 'favor') content = renderFavor();
        else if (current && items.length) {
            content = `<div class="igs-record-table-scroll"><table><caption>${escapeHtml(current.name)}</caption><thead><tr>${current.columns.map((column, index) => `<th scope="col">${escapeHtml(column || `第${index + 1}列`)}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr>${current.columns.map((_, index) => `<td>${escapeHtml(current.rows[item.rowIndex]?.[index])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        }
        const themeSwitch = `<div class="igs-rp-theme-switch" role="radiogroup" aria-label="界面配色">${renderSettingsThemeSwitch(theme, {
            optionClass: 'igs-rp-theme-option', attrs: value => `data-record-act="theme" data-record-id="${value}"` })}</div>`;
        const fontSelect = `<label class="igs-rp-font-select" title="字体"><b aria-hidden="true">Aa</b><select data-record-input="font" aria-label="${labels[category]}字体">${fontOptions().map(([value, label]) =>
            `<option value="${escapeHtml(value)}"${value === font ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
        root.innerHTML = `<div class="igs-rp-page igs-record-window">${recordPageHeadHtml(pageTitles[category], { trailing: fontSelect + themeSwitch })}` +
            tabs + `<div class="igs-rp-body"><div class="igs-record-scroll">` +
            (error ? `<p class="igs-rp-notice" role="status">${escapeHtml(error)}</p>` : '') +
            (diagnostics.length ? `<p class="igs-rp-notice" role="status">${escapeHtml(diagnostics.join('；'))}</p>` : '') +
            content + '</div></div></div>';
        if (category === 'diary') afterDiaryRender();
        turn = '';
    }

    function afterDiaryRender() {
        if (prefs.scroll) {
            const pages = Array.from(root.querySelectorAll?.('[data-record-page]') || []);
            pages.find(page => page.getAttribute('data-record-page') === selectedId)?.scrollIntoView?.({ block: 'start' });
            typedId = '';
            return;
        }
        const body = root.querySelector?.('.igs-record-diary-detail .igs-record-body');
        if (!body || !selectedId || !prefs.typewriter || typedId === selectedId) { if (!selectedId) typedId = ''; return; }
        typedId = selectedId;
        const typewriter = settings?.typewriter && typeof settings.typewriter === 'object' ? settings.typewriter : {};
        applyTypewriterEffect(body, { enabled: true, mode: 'classic', speed: typewriter.speed, sound: { enabled: false }, key: `diary:${selectedId}` });
    }

    return { open, close, reload, isOpen: () => Boolean(root), getState: () => ({ category, model, activeUid, selectedId, relationshipPersonId, diaryView, prefs: { ...prefs }, font, invGroup, invSort, invQuery, favorSort, favorAsc, favorQuery, message }) };
}
