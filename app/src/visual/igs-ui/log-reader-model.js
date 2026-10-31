import { stripWrappingQuotes } from './reader-floor-plan.js';
import { FALLBACK_HEAD } from './fx-anchor.js';
import { normalizeLogReaderSettings } from './log-reader-settings.js';

export { LOG_AVATAR_SHAPES, LOG_EMOTIONS, LOG_PER_TAP_MAX, LOG_PER_TAP_MIN, LOG_PERCENTS, LOG_REVEALS, clampLogAdjust, normalizeLogReaderSettings } from './log-reader-settings.js';

// 窄屏阅读模式：窄屏或楼层内嵌的长屏上，对话框换成自下而上的 log 列表（头颈肩头像 + 台词），点一下出 3~5 条。
// 窄屏判断与状态栏同一口径（宽 ≤640）；内嵌楼层按阅读器高宽比判断长屏。
export const LOG_NARROW_WIDTH = 640;
export const LOG_EMBED_TALL_RATIO = 1.2;
// 情绪符号循环最多给最新的两枚。
export const LOG_LOOP_LIMIT = 2;

// 头像取景框（px）：样式与裁切共用。faceY 是脸中心离框顶的距离；破框的底板只占框底 plate 高，头顶伸出底板。
export const LOG_AVATAR_BOX = Object.freeze({
    card: Object.freeze({ w: 56, h: 56, faceY: 24 }),
    break: Object.freeze({ w: 56, h: 80, faceY: 44, plate: 44 }),
});
// 头颈肩取景宽度（头宽的倍数）。头位探测会把长发、帽子、武器算进头宽，算缩放前先封顶。
export const LOG_BUST_SPAN = 2.3;
const HEAD_W_MAX = 0.24;
const HEAD_W_MIN = 0.1;
// 脸中心离头顶约为取景宽度的 0.36（大头发型偏下、写实比例偏上，取中间）。
const FACE_DROP = 0.36;

// mode：阅读器模式；rect：阅读器根节点尺寸；phone：是否命中手机媒体查询；comic：漫画演出模式开着时让给漫画。
export function isLogReaderActive({ settings, mode = '', embedded = false, width = 0, height = 0, phone = false, comic = false } = {}) {
    if (!normalizeLogReaderSettings(settings).enabled || comic) return false;
    if (!(width > 0) || !(height > 0)) return false;
    if (embedded || mode === 'embedded') return height / width >= LOG_EMBED_TALL_RATIO;
    return phone || width <= LOG_NARROW_WIDTH;
}

// 一页在 log 里显示的正文：台词去成对引号，心里话去星号和「[名字]：」，旁白原样（行内 *…* 交给渲染）。
export function logTextOf(page) {
    const body = String(page && page.segmentBody != null ? page.segmentBody : '').trim();
    const type = page && page.textType;
    if (type === 'dialogue' || type === 'system') return stripWrappingQuotes(body);
    if (type === 'thought') {
        const inner = body.replace(/^\s*\*+\s*/, '').replace(/\s*\*+\s*$/, '').replace(/^\s*\[[^\]\n]+\]\s*[:：]\s*/, '');
        return stripWrappingQuotes(inner.trim());
    }
    return body;
}

// 换场景分隔线的文字：「十分钟后 · 街角奶茶店」。与上一页（楼首比上一楼）地点或时段相同时返回空串。
export function sceneLabelOf(state, prev) {
    const scene = String((state && state.scene) || '').trim();
    const time = String((state && state.time) || '').trim();
    if (!scene && !time) return '';
    const prevScene = String((prev && prev.scene) || '').trim();
    const prevTime = String((prev && prev.time) || '').trim();
    if (scene === prevScene && time === prevTime) return '';
    return [time !== prevTime ? time : '', scene].filter(Boolean).join(' · ');
}

// 分页计划 → log 行。ctx：keyOf（名字 → 主名）、userKey、showSystemName、solo(i)（聊天页 / HTML 卡片页由原渲染接管）、inherited（上一楼场景）。
// kind：dialogue / thought / narr；scene 为本行前要插的换场景分隔线文字。
export function logRowsOf(pages, ctx = {}) {
    const keyOf = typeof ctx.keyOf === 'function' ? ctx.keyOf : (name) => name;
    const solo = typeof ctx.solo === 'function' ? ctx.solo : () => false;
    const rows = [];
    let prevState = ctx.inherited || null;
    for (let i = 0; i < (pages || []).length; i++) {
        const page = pages[i] || {};
        const state = page.sceneStateForBg || null;
        const scene = state ? sceneLabelOf(state, prevState) : '';
        if (state) prevState = state;
        const type = page.textType;
        const speaker = type === 'dialogue' || type === 'thought' ? String(page.bubbleSpeaker || '') : '';
        const kind = speaker ? type : 'narr';
        const key = speaker ? String(keyOf(speaker) || speaker) : '';
        rows.push({
            index: i,
            kind,
            thought: type === 'thought',
            system: type === 'system',
            speaker,
            key,
            // 系统角色按旁白样式；设置要求显示名字时名字放在段首。
            label: type === 'system' && ctx.showSystemName ? String(page.systemSpeaker || '') : '',
            mood: speaker ? String(page.bubbleMood || '') : '',
            user: Boolean(key && ctx.userKey && key === ctx.userKey),
            text: logTextOf(page),
            scene: i === 0 && !ctx.inherited ? '' : scene,
            solo: Boolean(solo(i)),
            nsfw: Boolean(state && state.nsfw),
        });
    }
    return rows;
}

// 连着同一人、同一情绪说话：只有组头显示头像与名字。换情绪另起一组，头像换成该情绪的差分；没写情绪的行沿用上一行。
export function isContinuation(rows, i) {
    const row = rows[i];
    const prev = rows[i - 1];
    return Boolean(row && prev && row.key && !row.scene && !row.solo && !prev.solo
        && prev.key === row.key && prev.kind !== 'narr' && row.kind !== 'narr'
        && (!row.mood || row.mood === groupMoodOf(rows, i - 1)));
}

// 一组的情绪：从 i 往前找到组里最近写了情绪的一行。
function groupMoodOf(rows, i) {
    for (let at = i; at >= 0; at--) {
        if (rows[at].mood) return rows[at].mood;
        if (!isContinuation(rows, at)) return '';
    }
    return '';
}

// 一批的结束（不含）：最多 per 条；下一行要换场景、或遇到聊天 / 卡片页时提前收批。单独成批的聊天 / 卡片页自己算一批。
export function nextBatchEnd(rows, from, per) {
    const total = (rows || []).length;
    if (from >= total) return total;
    if (rows[from].solo) return from + 1;
    let end = from + 1;
    while (end < total && end - from < per && !rows[end].scene && !rows[end].solo) end++;
    return end;
}

// 从楼首起每一批的起点，直到 upto（含）所在的那一批。
export function batchStartsUpTo(rows, upto, per) {
    const starts = [];
    for (let at = 0; at <= upto && at < (rows || []).length; at = nextBatchEnd(rows, at, per)) starts.push(at);
    return starts.length ? starts : [0];
}

// 名字色：按主名稳定取色（同一人每次同色），渲染时浅色皮肤再压暗一档。
export const LOG_NAME_HUES = Object.freeze(['#ff8a7a', '#8fb4ff', '#f2b85b', '#7fd1b0', '#d59cff', '#ff9ec7']);
export function logNameHue(key) {
    let hash = 0;
    for (const ch of String(key || '')) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
    return LOG_NAME_HUES[hash % LOG_NAME_HUES.length];
}

// 头颈肩裁切：head 为头位探测结果（0–1，相对原图宽），aspect 为原图高宽比；box 取 LOG_AVATAR_BOX 某项。
// adjust 是「调整立绘」存下的偏移（头像宽为单位）与缩放倍率。返回 background-size 宽度与 background-position（px）。
export function logAvatarCrop(head, aspect, box, adjust = null) {
    const h = head && Number(head.w) > 0 ? head : FALLBACK_HEAD;
    const span = Math.max(HEAD_W_MIN, Math.min(HEAD_W_MAX, Number(h.w))) * LOG_BUST_SPAN;
    const a = Number(aspect) > 0 ? Number(aspect) : 1.6;
    const z = adjust && Number(adjust.z) > 0 ? Number(adjust.z) : 1;
    const imgW = (box.w / span) * z;
    const faceX = Number(h.x) * imgW;
    const faceY = (Number(h.top) * a + FACE_DROP * span) * imgW;
    const dx = adjust ? Number(adjust.x) || 0 : 0;
    const dy = adjust ? Number(adjust.y) || 0 : 0;
    const round = (n) => Math.round(n * 10) / 10;
    return { size: round(imgW), x: round(box.w / 2 - faceX + dx * box.w), y: round(box.faceY - faceY + dy * box.w) };
}
