// 直播全屏：整个屏幕就是直播画面。对话框的文字流照常跑，只是换成直播字幕的样子（样式全在 danmaku-style.js，
// 这里只负责挂标记）；系统状态栏隐藏，工具栏保留。收起、下播、切楼、切到手机形态时清掉所有标记。

export const LIVE_FULL_ATTR = 'data-igs-live-full';
export const LIVE_SUB_ATTR = 'data-igs-live-sub';
export const LIVE_NPOS_ATTR = 'data-igs-live-npos';
export const SUB_NAME_ATTR = 'data-igs-sub-name';
export const LIVE_SUBTITLE_MAX_LINES = 5;
export const LIVE_FIT_ATTR = 'data-igs-live-fit';

// 直播全屏状态：full 形态、手机还在（没被收起 / 不在回忆梦境里）。
export function isLiveFullActive({ layout, visible }) {
    return layout === 'full' && visible === true;
}

// 字幕分类：主播的话直接显示；其他角色前面加名字；旁白、系统和主角内心是画外字。
export function classifySubtitle({ speaker, textType, hostName, userName }) {
    const who = String(speaker == null ? '' : speaker).trim();
    if (!who || textType === 'narration' || textType === 'system' || textType === 'chat') return 'narration';
    if (textType === 'thought' && userName && who === String(userName).trim()) return 'narration';
    if (hostName && who === String(hostName).trim()) return 'host';
    return 'other';
}

// 字幕最多 5 行（底边固定、向上增高）：高度除以行高四舍五入后超过就算超。
export function exceedsSubtitleLines(height, lineHeight, max = LIVE_SUBTITLE_MAX_LINES) {
    const h = Number(height);
    const lh = Number(lineHeight);
    if (!(h > 0) || !(lh > 0)) return false;
    return Math.round(h / lh) > max;
}

// 当前页用哪种样子：subtitle 字幕；minimal 极简对话框（只有旁白位置选了「对话框」时）；dialog 原样对话框（设置里选了对话框时）。
// 长文本不再退回对话框：字幕自己增高、缩字、最后内部滚动（见 refreshLiveFullOverflow）。
export function resolveLiveFullMode({ fullText, narrationPos, kind }) {
    if (fullText === 'dialog') return 'dialog';
    if (kind === 'narration' && narrationPos === 'dialog') return 'minimal';
    return 'subtitle';
}

export function applyLiveFull(root, { fullText, narrationPos, kind, speaker, textEl, pageKey }) {
    if (!root || typeof root.setAttribute !== 'function') return;
    const mode = resolveLiveFullMode({ fullText, narrationPos, kind });
    root.setAttribute(LIVE_FULL_ATTR, mode);
    root.setAttribute(LIVE_SUB_ATTR, kind);
    root.setAttribute(LIVE_NPOS_ATTR, narrationPos === 'name' ? 'name' : 'above');
    if (!textEl || typeof textEl.setAttribute !== 'function') return;
    if (kind === 'other' && speaker) textEl.setAttribute(SUB_NAME_ATTR, String(speaker));
    else if (typeof textEl.removeAttribute === 'function') textEl.removeAttribute(SUB_NAME_ATTR);
}

export function clearLiveFull(root, textEl) {
    if (root && typeof root.removeAttribute === 'function') {
        root.removeAttribute(LIVE_FULL_ATTR);
        root.removeAttribute(LIVE_SUB_ATTR);
        root.removeAttribute(LIVE_NPOS_ATTR);
        root.removeAttribute(LIVE_FIT_ATTR);
    }
    if (textEl && typeof textEl.removeAttribute === 'function') textEl.removeAttribute(SUB_NAME_ATTR);
}

// 字幕样式下量文字高度：超过 5 行先逐级缩小字号（0.92 倍、0.85 倍），再不行字幕框内部滚动（level 3）；返回是否做了调整。
// 每次从原始字号重新量，翻页或重排都不会把上一页的缩放带过来；同一个同步任务内完成，不会闪。
export function refreshLiveFullOverflow(root, textEl) {
    if (!root || typeof root.getAttribute !== 'function') return false;
    if (root.getAttribute(LIVE_FULL_ATTR) !== 'subtitle') {
        if (typeof root.removeAttribute === 'function') root.removeAttribute(LIVE_FIT_ATTR);
        return false;
    }
    if (!textEl || typeof textEl.getBoundingClientRect !== 'function') return false;
    const view = textEl.ownerDocument && textEl.ownerDocument.defaultView;
    for (let level = 0; level < 3; level += 1) {
        if (level) root.setAttribute(LIVE_FIT_ATTR, String(level));
        else root.removeAttribute(LIVE_FIT_ATTR);
        const style = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(textEl) : null;
        const fontSize = style ? parseFloat(style.fontSize) : NaN;
        const lineHeight = style ? parseFloat(style.lineHeight) || fontSize * 1.45 : NaN;
        if (!exceedsSubtitleLines(textEl.getBoundingClientRect().height, lineHeight)) return level > 0;
    }
    root.setAttribute(LIVE_FIT_ATTR, '3');
    return true;
}
