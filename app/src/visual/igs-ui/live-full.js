// 直播全屏：整个屏幕就是直播画面。对话框的文字流照常跑，只是换成平台自动字幕（CC）的样子（样式全在 danmaku-style.js，
// 这里只负责挂标记）；系统状态栏隐藏，工具栏保留。收起、下播、切楼、切到手机形态时清掉所有标记。

export const LIVE_FULL_ATTR = 'data-igs-live-full';
export const LIVE_SUB_ATTR = 'data-igs-live-sub';
export const LIVE_NPOS_ATTR = 'data-igs-live-npos';
export const SUB_NAME_ATTR = 'data-igs-sub-name';
// 换人说话：自动字幕行首的「>>」。
export const SUB_TURN_ATTR = 'data-igs-sub-turn';
// 自动字幕的版式：wide 横屏（字幕偏右，评论在左下）；tall 竖屏（字幕居中、压在评论区上方）。
export const LIVE_CC_ATTR = 'data-igs-live-cc';
export const LIVE_SUBTITLE_MAX_LINES = 3;
export const LIVE_FIT_ATTR = 'data-igs-live-fit';
const CC_WIDE_RATIO = 1.15;
const CC_GAP = 12;
const CC_PAD_Y = 6;

// 自动字幕几何：横竖屏版式、字号（px）、字幕底边与评论区下沿。纯函数，由每页唯一一次几何读取后的舞台尺寸算出。
// floor：评论区与输入行的下沿离舞台底边的距离；ccBottom：字幕底边离舞台底边的距离；ccClear：字幕顶边离舞台底边的距离。
export function liveCcGeometry(stage, { interact = false } = {}) {
    const w = Math.max(1, Number(stage && stage.stageW) || 0);
    const h = Math.max(1, Number(stage && stage.stageH) || 0);
    const wide = w / h >= CC_WIDE_RATIO;
    const fs = Math.round(Math.max(14, Math.min(22, w * (wide ? 0.022 : 0.042))));
    const floor = 12;
    // 按常见的两行估字幕高度，用来把右下角名次卡和点赞抬到字幕之上。
    const ccH = Math.round(2 * 1.5 * fs + CC_PAD_Y * 2);
    const listTop = floor + (interact ? 56 : 0) + Math.round(h * 0.22);
    const ccBottom = wide ? floor + (interact ? 56 : 0) + 10 : listTop + CC_GAP;
    return { mode: wide ? 'wide' : 'tall', fs, floor, ccBottom, ccClear: ccBottom + ccH };
}

export function applyLiveCcGeometry(root, geo) {
    if (!root || !root.style || !geo) return;
    root.setAttribute(LIVE_CC_ATTR, geo.mode);
    root.style.setProperty('--igs-cc-fs', `${geo.fs}px`);
    root.style.setProperty('--igs-cc-bottom', `${geo.ccBottom}px`);
}

// 换人判定：同一页重渲染不改结果；只有翻到新的一页、说话人与上一页不同时才算换人。
export function nextSubtitleTurn(prev, { pageKey, speaker }) {
    const who = String(speaker == null ? '' : speaker).trim();
    if (prev && prev.pageKey === pageKey) return prev;
    const last = (prev && prev.speaker) || '';
    // 旁白页不算说话人，记住上一个开口的人，旁白前后同一人说话不算换人。
    if (!who) return { pageKey, speaker: last, turn: false };
    return { pageKey, speaker: who, turn: Boolean(last && last !== who) };
}

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

// 字幕最多 3 行（底边固定、向上增高）：高度除以行高四舍五入后超过就算超。
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

// narrationPos 为 chat 时旁白进评论区（字幕位置留空，文字流照常跑以保持翻页与打字节奏）。turn：本页换人说话。
export function applyLiveFull(root, { fullText, narrationPos, kind, speaker, textEl, turn = false }) {
    if (!root || typeof root.setAttribute !== 'function') return;
    const mode = resolveLiveFullMode({ fullText, narrationPos, kind });
    root.setAttribute(LIVE_FULL_ATTR, mode);
    root.setAttribute(LIVE_SUB_ATTR, kind);
    root.setAttribute(LIVE_NPOS_ATTR, narrationPos === 'name' || narrationPos === 'chat' ? narrationPos : 'above');
    if (!textEl || typeof textEl.setAttribute !== 'function') return;
    if (kind === 'other' && speaker) textEl.setAttribute(SUB_NAME_ATTR, String(speaker));
    else if (typeof textEl.removeAttribute === 'function') textEl.removeAttribute(SUB_NAME_ATTR);
    if (turn && kind !== 'narration') textEl.setAttribute(SUB_TURN_ATTR, '1');
    else if (typeof textEl.removeAttribute === 'function') textEl.removeAttribute(SUB_TURN_ATTR);
}

export function clearLiveFull(root, textEl) {
    if (root && typeof root.removeAttribute === 'function') {
        root.removeAttribute(LIVE_FULL_ATTR);
        root.removeAttribute(LIVE_SUB_ATTR);
        root.removeAttribute(LIVE_NPOS_ATTR);
        root.removeAttribute(LIVE_FIT_ATTR);
        root.removeAttribute(LIVE_CC_ATTR);
    }
    if (textEl && typeof textEl.removeAttribute === 'function') {
        textEl.removeAttribute(SUB_NAME_ATTR);
        textEl.removeAttribute(SUB_TURN_ATTR);
    }
}

// 字幕样式下量文字高度：超过 3 行先逐级缩小字号（0.92 倍、0.85 倍），再不行字幕框内部滚动（level 3）；返回是否做了调整。
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
