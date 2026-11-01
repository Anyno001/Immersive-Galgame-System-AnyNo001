// 楼层备注：战斗中使用物品等动作，需要在最新 AI 楼层正文里留一行备注。
// insertFloorNote 负责把备注插到战斗标签之前（或正文最后一行之后）并校验战斗起点未被破坏；
// withFloorNote 在写楼层、执行动作、失败回滚之间做编排。
import { combatBodyText, extractCombatStart, scanCombatTags } from '../scene/combat-directives.js';

// 备注清洗：去掉方括号与换行，压缩空白，最长 120 字。
export const sanitizeFloorNote = (note) => String(note ?? '').replace(/[[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

// 标签的定位键：tagHash#出现序号
const anchorKey = (anchor) => (anchor ? `${anchor.tagHash}#${anchor.occurrence}` : '');
// 两个战斗起点是否一致（含 awaken 前置标签）
const sameStart = (a, b) => anchorKey(a) === anchorKey(b) && anchorKey(a?.awaken) === anchorKey(b?.awaken);

const UNSAFE = { ok: false, reason: 'floor-note-unsafe' };

// 取文本最后一个非空行（已 trim），没有则返回空串
function lastNonEmptyLine(text) {
    const lines = String(text || '').split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i].trim()) return lines[i].trim();
    }
    return '';
}

// 没有战斗起点标签：把备注追加到正文最后一行之后
function appendAfterBody(text, note, options) {
    const last = lastNonEmptyLine(combatBodyText(text, options));
    const at = last ? text.lastIndexOf(last) : -1;
    if (at >= 0) {
        const lineBreak = text.indexOf('\n', at + last.length);
        const end = lineBreak < 0 ? text.length : lineBreak;
        return `${text.slice(0, end)}\n${note}${text.slice(end)}`;
    }
    const trimmed = text.replace(/\s+$/, '');
    return `${trimmed}${trimmed ? '\n' : ''}${note}${text.slice(trimmed.length)}`;
}

// 有战斗起点标签：把备注插到起点标签所在行之前；定位失败返回 null
function insertBeforeStart(text, note, start, options) {
    const tags = scanCombatTags(combatBodyText(text, options));
    const findTag = (anchor) => tags.find((tag) => tag.tagHash === anchor.tagHash && tag.occurrence === anchor.occurrence);
    const startTag = findTag(start);
    let position = startTag ? text.lastIndexOf(startTag.raw) : -1;
    if (position < 0) return null;
    // 有 awaken 前置标签时，备注要放在它之前
    if (start.awaken) {
        const awakenTag = findTag(start.awaken);
        position = awakenTag && position > 0 ? text.lastIndexOf(awakenTag.raw, position - 1) : -1;
        if (position < 0) return null;
    }
    const lineStart = position > 0 ? text.lastIndexOf('\n', position - 1) + 1 : 0;
    return `${text.slice(0, lineStart)}${note}\n${text.slice(lineStart)}`;
}

// 向楼层文本插入一行备注。插入后必须仍能解析出同一个战斗起点，且备注落在可见正文里，
// 否则返回 floor-note-unsafe。
export function insertFloorNote(floorText, note, options = {}) {
    const text = String(floorText ?? '');
    const line = sanitizeFloorNote(note);
    if (!line) return { ok: false, reason: 'floor-note-empty' };
    const start = extractCombatStart(text, options).start;
    const next = start ? insertBeforeStart(text, line, start, options) : appendAfterBody(text, line, options);
    if (next === null) return UNSAFE;
    const nextStart = extractCombatStart(next, options).start;
    if (!sameStart(start, nextStart) || !combatBodyText(next, options).includes(line)) return UNSAFE;
    return { ok: true, text: next, line };
}

// 动作是否成功：整体 ok 且没有失败的库存条目
const actionSucceeded = (result) => result?.ok === true && !(result.stock || []).some((entry) => entry.ok === false);
// 动作失败原因：优先整体 reason，其次第一个失败库存条目的 reason
const actionFailureReason = (result) => result?.reason || (result?.stock || []).find((entry) => entry.ok === false)?.reason || 'combat-action-failed';
// 楼层快照是否仍指向同一聊天/楼层/滑页
const sameFloor = (a, b) => !!(a && b) && a.chatId === b.chatId && a.messageId === b.messageId && a.swipeId === b.swipeId;

// 先把备注写入最新 AI 楼层，再执行动作 action；动作失败或写入无法核实时，把楼层回滚到原文。
// 返回值里 floorRollback 为 done/failed，失败时附带 rollbackReason。
export async function withFloorNote({ readFloor, writeFloor, messageId, note, sourceFilter, action }) {
    const floor = readFloor(messageId);
    if (!floor || !floor.isAi || !floor.isLatest) return { ok: false, reason: 'combat-use-no-floor' };
    const inserted = insertFloorNote(floor.text, note, { sourceFilter });
    if (!inserted.ok) return inserted;

    let written;
    try {
        written = await writeFloor(messageId, inserted.text, floor);
    } catch {
        written = { ok: false, reason: 'floor-write-failed' };
    }
    if (written?.ok !== true) {
        return { ok: false, reason: written?.reason === 'stale' ? 'combat-floor-stale' : written?.reason || 'floor-write-failed' };
    }

    // 写完回读一次，用于核实与后续回滚
    const after = readFloor(messageId);
    const rollback = async () => {
        if (!sameFloor(after, floor)) return { floorRollback: 'failed', rollbackReason: 'stale' };
        let restored;
        try {
            restored = await writeFloor(messageId, floor.text, after);
        } catch {
            restored = { ok: false, reason: 'floor-write-failed' };
        }
        return restored?.ok === true ? { floorRollback: 'done' } : { floorRollback: 'failed', rollbackReason: restored?.reason || 'floor-write-failed' };
    };

    if (!sameFloor(after, floor) || after.text !== inserted.text) {
        return { ok: false, reason: 'combat-floor-unverified', ...(await rollback()) };
    }

    let result;
    try {
        result = await action();
    } catch {
        result = { ok: false, reason: 'combat-action-threw' };
    }
    if (actionSucceeded(result)) return { ...result, ok: true, note: inserted.line };
    return { ...result, ok: false, reason: actionFailureReason(result), ...(await rollback()) };
}
