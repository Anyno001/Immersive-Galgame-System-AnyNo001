import { combatBodyText, extractCombatStart, scanCombatTags } from '../scene/combat-directives.js';

// 最新 AI 楼的使用 / 换装说明（P7c，助手 1.A）：正文末尾有开战标签时插在开战（及紧贴其上的觉醒）标签所在行之前，否则接在正文最后一个非空行之后。
// 纯函数，只改字符串。插入后复核：开战与觉醒标签的锚点不变、说明行进入正文（与阅读器同一过滤口径）；不满足返回 floor-note-unsafe，调用方不写。
export const sanitizeFloorNote = (note) => String(note ?? '').replace(/[[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

const anchorKey = (a) => (a ? `${a.tagHash}#${a.occurrence}` : '');
const sameStart = (a, b) => anchorKey(a) === anchorKey(b) && anchorKey(a?.awaken) === anchorKey(b?.awaken);
const unsafe = { ok: false, reason: 'floor-note-unsafe' };

function lastNonEmpty(body) {
    const lines = String(body || '').split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i].trim()) return lines[i].trim();
    return '';
}

// 没有开战标签：接在原文里正文最后一个非空行的行尾；找不到时接在原文末尾（去掉尾部空白后）。
function appendAfterBody(text, line, options) {
    const tail = lastNonEmpty(combatBodyText(text, options));
    const at = tail ? text.lastIndexOf(tail) : -1;
    if (at >= 0) {
        const nl = text.indexOf('\n', at + tail.length);
        const end = nl < 0 ? text.length : nl;
        return `${text.slice(0, end)}\n${line}${text.slice(end)}`;
    }
    const body = text.replace(/\s+$/, '');
    return `${body}${body ? '\n' : ''}${line}${text.slice(body.length)}`;
}

// 有开战标签：在原文里找到开战标签（有觉醒时取它上方紧贴的觉醒标签），在那一行行首插入说明行。
function insertBeforeStart(text, line, start, options) {
    const tags = scanCombatTags(combatBodyText(text, options));
    const find = (a) => tags.find((t) => t.tagHash === a.tagHash && t.occurrence === a.occurrence);
    const startTag = find(start);
    let at = startTag ? text.lastIndexOf(startTag.raw) : -1;
    if (at < 0) return null;
    if (start.awaken) {
        const aw = find(start.awaken);
        at = aw && at > 0 ? text.lastIndexOf(aw.raw, at - 1) : -1;
        if (at < 0) return null;
    }
    const lineStart = at > 0 ? text.lastIndexOf('\n', at - 1) + 1 : 0;
    return `${text.slice(0, lineStart)}${line}\n${text.slice(lineStart)}`;
}

export function insertFloorNote(raw, note, options = {}) {
    const text = String(raw ?? '');
    const line = sanitizeFloorNote(note);
    if (!line) return { ok: false, reason: 'floor-note-empty' };
    const before = extractCombatStart(text, options).start;
    const next = before ? insertBeforeStart(text, line, before, options) : appendAfterBody(text, line, options);
    if (next === null) return unsafe;
    const after = extractCombatStart(next, options).start;
    if (!sameStart(before, after) || !combatBodyText(next, options).includes(line)) return unsafe;
    return { ok: true, text: next, line };
}


// 正文说明与表格写入的一致性协议（P7c）：宿主正文与数据库没有跨系统事务。
// 先按原楼层（expected）写入说明，stale 时不执行 action；读回写后楼层确认是本次写入，再执行 action（写日志与表格）。
// action 失败时以读回的楼层为 expected 写回原文；回滚 stale 或失败时返回 floorRollback:'failed'，调用方须提示检查正文，不得当作已撤回。
const actionOk = (r) => r?.ok === true && !(r.stock || []).some((s) => s.ok === false);
const actionReason = (r) => r?.reason || (r?.stock || []).find((s) => s.ok === false)?.reason || 'combat-action-failed';
const sameFloor = (a, b) => Boolean(a && b) && a.chatId === b.chatId && a.messageId === b.messageId && a.swipeId === b.swipeId;

export async function withFloorNote({ readFloor, writeFloor, messageId, note, sourceFilter, action }) {
    const floor = readFloor(messageId);
    if (!floor || !floor.isAi || !floor.isLatest) return { ok: false, reason: 'combat-use-no-floor' };
    const next = insertFloorNote(floor.text, note, { sourceFilter });
    if (!next.ok) return next;
    let w;
    try { w = await writeFloor(messageId, next.text, floor); } catch { w = { ok: false, reason: 'floor-write-failed' }; }
    if (w?.ok !== true) return { ok: false, reason: w?.reason === 'stale' ? 'combat-floor-stale' : (w?.reason || 'floor-write-failed') };
    const written = readFloor(messageId);
    const rollback = async () => {
        // 只在同一聊天、同一楼、同一 swipe 上撤回；用户已换 swipe 或换聊天时不写，免得覆盖别的正文。
        if (!sameFloor(written, floor)) return { floorRollback: 'failed', rollbackReason: 'stale' };
        let back;
        try { back = await writeFloor(messageId, floor.text, written); } catch { back = { ok: false, reason: 'floor-write-failed' }; }
        return back?.ok === true ? { floorRollback: 'done' } : { floorRollback: 'failed', rollbackReason: back?.reason || 'floor-write-failed' };
    };
    if (!sameFloor(written, floor) || written.text !== next.text) return { ok: false, reason: 'combat-floor-unverified', ...(await rollback()) };
    let result;
    try { result = await action(); } catch { result = { ok: false, reason: 'combat-action-threw' }; }
    if (actionOk(result)) return { ...result, ok: true, note: next.line };
    return { ...result, ok: false, reason: actionReason(result), ...(await rollback()) };
}
