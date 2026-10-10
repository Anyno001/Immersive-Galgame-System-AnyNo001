// 直播全屏：整个屏幕就是直播画面。对话框的文字流照常跑，只是换成直播字幕的样子（样式全在 danmaku-style.js，
// 这里只负责挂标记）；系统状态栏隐藏，工具栏保留。收起、下播、切楼、切到手机形态时清掉所有标记。

export const LIVE_FULL_ATTR = 'data-igs-live-full';
export const LIVE_SUB_ATTR = 'data-igs-live-sub';
export const LIVE_NPOS_ATTR = 'data-igs-live-npos';
export const SUB_NAME_ATTR = 'data-igs-sub-name';
export const LIVE_SUBTITLE_MAX_LINES = 3;

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

// 字幕最多 3 行：高度除以行高四舍五入后超过就算超。
export function exceedsSubtitleLines(height, lineHeight, max = LIVE_SUBTITLE_MAX_LINES) {
    const h = Number(height);
    const lh = Number(lineHeight);
    if (!(h > 0) || !(lh > 0)) return false;
    return Math.round(h / lh) > max;
}

// 当前页用哪种样子：subtitle 字幕；minimal 极简对话框（半透明暗底条）；dialog 原样对话框。
export function resolveLiveFullMode({ fullText, narrationPos, kind, overflow }) {
    if (fullText === 'dialog') return 'dialog';
    if (kind === 'narration' && narrationPos === 'dialog') return 'minimal';
    return overflow ? 'minimal' : 'subtitle';
}

export function applyLiveFull(root, { fullText, narrationPos, kind, speaker, textEl }) {
    if (!root || typeof root.setAttribute !== 'function') return;
    const mode = resolveLiveFullMode({ fullText, narrationPos, kind, overflow: false });
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
    }
    if (textEl && typeof textEl.removeAttribute === 'function') textEl.removeAttribute(SUB_NAME_ATTR);
}

// 字幕样式下量一次文字高度，超过 3 行这一页退回极简对话框；翻页重新挂标记后恢复字幕。
export function refreshLiveFullOverflow(root, textEl) {
    if (!root || typeof root.getAttribute !== 'function' || root.getAttribute(LIVE_FULL_ATTR) !== 'subtitle') return false;
    if (!textEl || typeof textEl.getBoundingClientRect !== 'function') return false;
    const view = textEl.ownerDocument && textEl.ownerDocument.defaultView;
    const style = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(textEl) : null;
    const fontSize = style ? parseFloat(style.fontSize) : NaN;
    const lineHeight = style ? parseFloat(style.lineHeight) || fontSize * 1.45 : NaN;
    if (!exceedsSubtitleLines(textEl.getBoundingClientRect().height, lineHeight)) return false;
    root.setAttribute(LIVE_FULL_ATTR, 'minimal');
    return true;
}
