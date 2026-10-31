// 前层入口坞：观众弹幕、社区回看、通知、随身系统四个浮钮共用同一个定位容器，容器里 flex 纵向排列、间距固定，互相不会盖住。
// 容器只有一个锚点（左边距由 --igs-entry-left 给、顶边由 --igs-dock-top 给），入口自己不再各算各的 left / top。
// 顶边只在变化时写一次（随状态栏高度），没有轮询也没有逐帧计算。
// 入口尺寸、线宽与留白统一在本文件的样式里：电脑 28px、手机（≤640px）24px，小 / 大档同比例；各入口样式文件不再写尺寸。
// 手机上同时出现 3 个及以上入口时收成一个按钮，点开在旁边横向展开，点外面收起（syncEntryFold）。
const DOCK_CLASS = 'igs-entry-dock';
const FOLD_CLASS = 'igs-dock-fold';
const tops = new WeakMap();

export const DOCK_WIDTH = 38;
export const DOCK_GAP = 6;
export const FOLD_MIN = 3;
export const MOBILE_QUERY = '(max-width:640px)';
// 坞内入口的类名（顺序即 CSS 里 order 的依据）。
export const ENTRY_CLASSES = Object.freeze(['igs-aud-entry', 'igs-feed-entry', 'igs-nc-entry', 'igs-or-entry']);
export const ENTRY_SELECTOR = ENTRY_CLASSES.map((name) => `.${name}`).join(',');

const STOP_EVENTS = Object.freeze(['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'wheel', 'contextmenu']);
const FOLD_ICON = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="16" r="1.4"/><circle cx="16" cy="16" r="1.4"/><circle cx="23.5" cy="16" r="1.4"/></svg>';

export function ensureEntryDock(front) {
    let dock = front.querySelector(`:scope > .${DOCK_CLASS}`);
    if (!dock) {
        dock = front.ownerDocument.createElement('div');
        dock.className = DOCK_CLASS;
        front.insertBefore(dock, front.firstChild);
    }
    return dock;
}

// 入口挂进坞里（已经在坞里就不动）。
export function mountEntry(front, entry) {
    const dock = ensureEntryDock(front);
    if (entry.parentNode !== dock) dock.appendChild(entry);
}

// 坞里除收拢按钮以外的子节点。
function dockEntries(dock) {
    return Array.from(dock.children).filter((node) => !(node.classList && node.classList.contains(FOLD_CLASS)));
}

// 摘掉入口；坞里没有入口了就一起拆掉，不留空节点（收拢按钮不算入口）。
export function unmountEntry(front, entry) {
    entry.remove();
    const dock = front && front.querySelector ? front.querySelector(`:scope > .${DOCK_CLASS}`) : null;
    if (dock && !dockEntries(dock).length) {
        closeFold(dock);
        folds.delete(dock);
        dock.remove();
    }
}

// 独占面板：同一个前层同时只开一个面板（回看弹窗、通知栏、随身系统窗）。打开前 claim，会先关掉已开的另一个；关闭时 release。
// close 要传同一个函数引用，release 只在登记的还是它自己时才清，不会误删后开的那个。
const openPanels = new WeakMap();

export function claimPanel(front, close) {
    const prev = openPanels.get(front);
    openPanels.set(front, close);
    if (prev && prev !== close) prev();
}

export function releasePanel(front, close) {
    if (openPanels.get(front) === close) openPanels.delete(front);
}

// 社区 / 风暴手机在场标记：CSS 据此让通知入口让位。值没变不写。
export function setPhoneOn(front, on) {
    const has = front.hasAttribute('data-igs-phone-on');
    if (on && !has) front.setAttribute('data-igs-phone-on', '1');
    else if (!on && has) front.removeAttribute('data-igs-phone-on');
}

// 坞顶边（舞台像素）；没变化不写。
export function placeEntryDock(front, top) {
    const value = `${Math.round(top)}px`;
    if (tops.get(front) === value) return;
    tops.set(front, value);
    front.style.setProperty('--igs-dock-top', value);
}

// ---- 手机收拢 ----

// 纯函数：只有手机、非全屏直播、可见入口 ≥ 3 个才收拢。
export function shouldFold({ count, mobile, full }) {
    return Boolean(mobile) && !full && Number(count) >= FOLD_MIN;
}

// 当前占位的入口：未隐藏；社区 / 风暴手机在场时通知入口被样式隐藏，不计数。
export function visibleDockEntries(front, dock) {
    const phoneOn = front.hasAttribute('data-igs-phone-on');
    return dockEntries(dock).filter((node) => !node.hidden && !(phoneOn && node.classList.contains('igs-nc-entry')));
}

const folds = new WeakMap();

function foldState(dock) {
    return folds.get(dock) || null;
}

function openFold(dock) {
    const state = foldState(dock);
    if (!state || state.open) return;
    state.open = true;
    dock.setAttribute('data-fold', 'open');
    state.btn.setAttribute('aria-expanded', 'true');
    const doc = dock.ownerDocument;
    // 捕获阶段监听：阅读器里的元素会拦截冒泡，用冒泡监听收不到「点外面」。
    state.onOutside = (event) => {
        if (!dock.contains(event.target)) closeFold(dock);
    };
    // 点坞内的入口：入口自己的处理照常执行（监听不拦截），事件结束后收起。
    state.onInside = (event) => {
        const target = event.target;
        if (state.btn.contains(target)) return;
        if (target && target.closest && target.closest(ENTRY_SELECTOR)) closeFold(dock);
    };
    doc.addEventListener('pointerdown', state.onOutside, true);
    dock.addEventListener('click', state.onInside, true);
}

export function closeFold(dock) {
    const state = foldState(dock);
    if (!state || !state.open) return;
    state.open = false;
    if (dock.getAttribute('data-fold') === 'open') dock.setAttribute('data-fold', 'closed');
    state.btn.setAttribute('aria-expanded', 'false');
    const doc = dock.ownerDocument;
    if (state.onOutside) doc.removeEventListener('pointerdown', state.onOutside, true);
    if (state.onInside) dock.removeEventListener('click', state.onInside, true);
    state.onOutside = null;
    state.onInside = null;
}

export function isFoldOpen(front) {
    const dock = front && front.querySelector ? front.querySelector(`:scope > .${DOCK_CLASS}`) : null;
    const state = dock && foldState(dock);
    return Boolean(state && state.open);
}

function buildFoldButton(doc, dock) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = FOLD_CLASS;
    btn.setAttribute('aria-label', '更多入口');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = '更多入口';
    btn.innerHTML = FOLD_ICON;
    const dot = doc.createElement('i');
    dot.className = 'igs-dock-fold-dot';
    dot.hidden = true;
    btn.appendChild(dot);
    for (const name of STOP_EVENTS) {
        btn.addEventListener(name, (event) => {
            event.stopPropagation();
            if (name !== 'click') return;
            const state = foldState(dock);
            if (state && state.open) closeFold(dock);
            else openFold(dock);
        });
    }
    return { btn, dot };
}

function viewportIsMobile(front) {
    const win = front.ownerDocument && front.ownerDocument.defaultView;
    return Boolean(win && typeof win.matchMedia === 'function' && win.matchMedia(MOBILE_QUERY).matches);
}

// 每次入口增减后调用：按可见入口数决定收拢；返回 { folded, count, unread }。
// opts.mobile 缺省时读视口。红点合并：任一入口 data-unread="1" 时收拢按钮亮点。
export function syncEntryFold(front, opts = {}) {
    const dock = front && front.querySelector ? front.querySelector(`:scope > .${DOCK_CLASS}`) : null;
    if (!dock) return { folded: false, count: 0, unread: false };
    const entries = visibleDockEntries(front, dock);
    const unread = entries.some((node) => node.getAttribute('data-unread') === '1');
    const full = front.hasAttribute('data-entry-full');
    const mobile = typeof opts.mobile === 'boolean' ? opts.mobile : viewportIsMobile(front);
    const folded = shouldFold({ count: entries.length, mobile, full });
    let state = foldState(dock);
    if (folded) {
        if (!state) {
            const built = buildFoldButton(dock.ownerDocument, dock);
            state = { btn: built.btn, dot: built.dot, open: false, onOutside: null, onInside: null };
            folds.set(dock, state);
        }
        if (state.btn.parentNode !== dock) dock.insertBefore(state.btn, dock.firstChild);
        if (!dock.hasAttribute('data-fold')) dock.setAttribute('data-fold', state.open ? 'open' : 'closed');
        if (state.dot.hidden === unread) state.dot.hidden = !unread;
    } else if (state) {
        closeFold(dock);
        dock.removeAttribute('data-fold');
        if (state.btn.parentNode === dock) state.btn.remove();
    }
    return { folded, count: entries.length, unread };
}

// ---- 样式 ----
const E = (suffix = '') => ENTRY_CLASSES.map((name) => `.${DOCK_CLASS}>.${name}${suffix}`).join(',');
const F = (suffix = '') => `.${DOCK_CLASS}>.${FOLD_CLASS}${suffix}`;
const ALL = (suffix = '') => `${E(suffix)},${F(suffix)}`;

// 左上原位：坞宽固定 38px（与状态栏折叠按钮同宽），入口按中线居中，小 / 大档入口也与折叠按钮同一条竖线。
// 全屏直播挪到名次卡上方时按右缘对齐计算 left，坞改回随内容宽、左对齐。
// 入口尺寸只由 --igs-entry-px 决定：电脑 28 / 24 / 34，手机 24 / 20 / 29。
// 入口坞的兜底色集中在这里：入口浮在背景图上，不随对话框皮肤换色（与改动前的各入口一致）。
export const ENTRY_DOCK_CSS = `.${DOCK_CLASS}{position:absolute;z-index:1;left:var(--igs-entry-left,14px);top:var(--igs-dock-top,14px);width:${DOCK_WIDTH}px;display:flex;flex-direction:column;align-items:center;gap:${DOCK_GAP}px;pointer-events:none;--igs-entry-ink:#f4f1ec;--igs-entry-dot:#e5484d;--igs-entry-dot-ring:#14161a;}
[data-entry-full]>.${DOCK_CLASS}{width:auto;align-items:flex-start;}
.${DOCK_CLASS}>*{position:relative;flex:none;}
${ALL()}{--igs-entry-px:28px;width:var(--igs-entry-px);height:var(--igs-entry-px);padding:0;box-sizing:border-box;border:0;background:transparent;color:var(--igs-entry-ink);opacity:.55;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));transition:opacity .2s ease;}
${ALL('[data-size="small"]')}{--igs-entry-px:24px;}
${ALL('[data-size="large"]')}{--igs-entry-px:34px;}
@media ${MOBILE_QUERY}{${ALL()}{--igs-entry-px:24px;}${ALL('[data-size="small"]')}{--igs-entry-px:20px;}${ALL('[data-size="large"]')}{--igs-entry-px:29px;}}
${E('[hidden]')}{display:none;}
${ALL(' svg')}{display:block;width:100%;height:100%;}
${ALL(':hover')},${ALL(':focus-visible')}{opacity:1;}
${ALL(':focus-visible')}{outline:2px solid #f4e3ad;outline-offset:2px;border-radius:8px;}
@media (pointer:coarse){${ALL('::after')}{content:"";position:absolute;inset:-3px;}}
${F()}{display:none;order:-1;}
.${FOLD_CLASS}-dot{position:absolute;top:-1px;right:-2px;width:9px;height:9px;border-radius:50%;background:var(--igs-entry-dot);box-shadow:0 0 0 1.5px var(--igs-entry-dot-ring);}
.${FOLD_CLASS}-dot[hidden]{display:none;}
@media ${MOBILE_QUERY}{
.${DOCK_CLASS}[data-fold]>.${FOLD_CLASS}{display:block;opacity:1;}
.${DOCK_CLASS}[data-fold="closed"]>:not(.${FOLD_CLASS}){display:none;}
.${DOCK_CLASS}[data-fold="open"]{width:auto;flex-direction:row;align-items:center;}
.${DOCK_CLASS}[data-fold="open"]>.${FOLD_CLASS}{margin-inline-start:calc((${DOCK_WIDTH}px - var(--igs-entry-px)) / 2);}
}`;
