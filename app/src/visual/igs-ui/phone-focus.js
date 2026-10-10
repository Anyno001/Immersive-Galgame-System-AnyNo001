// 手机焦点：社区 / 风暴 / 直播手机首次亮相时放大到全屏、对话框淡出，读者点一下才回到正常阅读；
// 在场时轻点手机也能放大。只存在运行时，不存盘。点击在根节点捕获阶段拦下，不触发翻页。
import { pauseTypewriter, resumeTypewriter } from './typewriter-runtime.js';

export const FOCUS_CLASS = 'igs-phone-focus';
export const TAP_MAX_MOVE = 8;
export const TAP_MAX_MS = 300;
export const AUTO_EXIT_MS = 1500;

// 位移 <8px 且时长 <300ms 才算轻点，其余（滑动、长按、多指）都不算。
export function classifyPointer(start, end) {
    if (!start || !end || start.multi) return 'swipe';
    const dx = Number(end.x) - Number(start.x);
    const dy = Number(end.y) - Number(start.y);
    const dt = Number(end.t) - Number(start.t);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dt)) return 'swipe';
    return Math.hypot(dx, dy) < TAP_MAX_MOVE && dt < TAP_MAX_MS ? 'tap' : 'swipe';
}

// 一台手机从不在场变成在场，或换了一台（换平台 / 换风暴 / 换一场直播）才算新亮相；连续几页同一台不算。
export function isNewAppearance(prevKey, nextKey) {
    return Boolean(nextKey) && nextKey !== (prevKey || '');
}

// 手机的身份：风暴 > 社区 > 直播（运行时本来就让位）；直播只认手机形态且没被关掉的。
export function phoneIdentity({ storm, feed, live, liveShown }) {
    if (storm) return `storm|${storm.platform || ''}|${storm.tone || ''}|${storm.topic == null ? '' : storm.topic}`;
    if (feed) return `feed|${feed.platform || ''}|${feed.owner || ''}`;
    if (live && liveShown) return `live|${live.name}|${live.title}`;
    return '';
}

// 点在手机上（不含沉进对话框、已淡出的那截）。
export function pointInPhone(rect, sink, x, y) {
    if (!rect) return false;
    const bottom = rect.bottom - Math.max(0, Number(sink) || 0);
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= bottom;
}

// 一次 click 怎么处理：pass 原样放行；swallow 拦下不翻页；enter / exit 进出焦点并拦下；exitPass 退出焦点但放行（点到工具栏之类）。
export function decideClick({ focus, inPhone, motion, phoneControl, otherControl, editing }) {
    if (editing || phoneControl) return 'pass';
    if (focus) {
        if (motion !== 'tap') return 'swallow';
        return otherControl ? 'exitPass' : 'exit';
    }
    if (!inPhone) return 'pass';
    return motion === 'tap' ? 'enter' : 'swallow';
}

const PHONE_UI = '.igs-live-phone,.igs-live-ctl,.igs-live-switch,#igs-sprite-edit-bar';
const CONTROL = 'button,input,textarea,select,a,[data-act],[data-view],[data-se]';

function closest(target, selector) {
    return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

function visiblePhone(host) {
    if (!host || typeof host.querySelectorAll !== 'function') return null;
    for (const phone of host.querySelectorAll('.igs-live-phone')) {
        if (!closest(phone, '[hidden]')) return phone;
    }
    return null;
}

function sinkOf(phone) {
    const style = phone.style;
    const read = (name) => (style && typeof style.getPropertyValue === 'function' ? parseFloat(style.getPropertyValue(name)) || 0 : 0);
    return Math.max(read('--igs-phone-sink'), read('--igs-live-under'));
}

export function focusOn(state) {
    return Boolean(state && state.focus && state.focus.on);
}

// hooks：{ host, textEl(), refit(), autoPlay, schedule, clear, editing() }，每次渲染更新。
export function setFocusHooks(state, root, hooks) {
    const focus = state.focus || (state.focus = { on: false, timer: null, hooks: null, bound: false, start: null, last: 'tap' });
    focus.hooks = hooks;
    if (!focus.bound) {
        focus.bound = true;
        bind(state, root, focus);
    }
}

function setClass(root, on) {
    const list = root.classList;
    if (!list) return;
    if (on && typeof list.add === 'function') list.add(FOCUS_CLASS);
    else if (!on && typeof list.remove === 'function') list.remove(FOCUS_CLASS);
}

export function enterFocus(state, root, { auto = false } = {}) {
    const focus = state.focus;
    if (!focus || focus.on || !focus.hooks) return false;
    focus.on = true;
    focus.pageKey = state.pageKey;
    setClass(root, true);
    const { hooks } = focus;
    pauseTypewriter(hooks.textEl && hooks.textEl());
    if (hooks.refit) hooks.refit();
    // 自动播放没人点屏幕：亮相 1.5 秒后自己退出。
    if (auto && hooks.autoPlay && typeof hooks.schedule === 'function') {
        focus.timer = hooks.schedule(() => {
            focus.timer = null;
            exitFocus(state, root);
        }, AUTO_EXIT_MS);
    }
    return true;
}

export function exitFocus(state, root) {
    const focus = state && state.focus;
    if (!focus || !focus.on) return false;
    focus.on = false;
    const hooks = focus.hooks;
    if (focus.timer != null && hooks && typeof hooks.clear === 'function') hooks.clear(focus.timer);
    focus.timer = null;
    setClass(root, false);
    if (hooks) {
        resumeTypewriter(hooks.textEl && hooks.textEl());
        if (hooks.refit) hooks.refit();
    }
    return true;
}

// 渲染收尾时调用：焦点中重绘出的新打字机任务也要停住。
export function holdFocusText(state) {
    const focus = state && state.focus;
    if (focus && focus.on && focus.hooks) pauseTypewriter(focus.hooks.textEl && focus.hooks.textEl());
}

function bind(state, root, focus) {
    const point = (event) => ({ x: Number(event.clientX), y: Number(event.clientY), t: Number(event.timeStamp) || 0 });
    root.addEventListener('pointerdown', (event) => {
        if (!focus.hooks) return;
        if (focus.start && event.isPrimary === false) focus.start.multi = true;
        else focus.start = { ...point(event), multi: false };
    }, true);
    root.addEventListener('pointerup', (event) => {
        if (!focus.start) return;
        focus.last = classifyPointer(focus.start, point(event));
        focus.start = null;
    }, true);
    root.addEventListener('pointercancel', () => { focus.start = null; }, true);
    root.addEventListener('click', (event) => {
        const hooks = focus.hooks;
        if (!hooks) return;
        const phone = visiblePhone(hooks.host);
        if (!phone && !focus.on) return;
        const target = event.target;
        const control = closest(target, CONTROL);
        const motion = focus.last;
        focus.last = 'tap';
        const rect = phone && typeof phone.getBoundingClientRect === 'function' ? phone.getBoundingClientRect() : null;
        const action = decideClick({
            focus: focus.on,
            inPhone: pointInPhone(rect, phone ? sinkOf(phone) : 0, Number(event.clientX), Number(event.clientY)),
            motion,
            phoneControl: Boolean(control && closest(target, PHONE_UI)),
            otherControl: Boolean(control),
            editing: typeof hooks.editing === 'function' && hooks.editing(),
        });
        if (action === 'pass') {
            // 点的是手机上的按钮（直播关闭 / 社区收起）：手机若随即消失，焦点跟着退出。
            if (focus.on) Promise.resolve().then(() => { if (focus.on && !visiblePhone(hooks.host)) exitFocus(state, root); });
            return;
        }
        if (action === 'enter') enterFocus(state, root);
        else if (action === 'exit' || action === 'exitPass') exitFocus(state, root);
        if (action === 'exitPass') return;
        event.stopPropagation();
        event.preventDefault();
    }, true);
}
