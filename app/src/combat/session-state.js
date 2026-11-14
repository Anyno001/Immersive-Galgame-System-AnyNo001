import { reportIdOf } from './report.js';
import { parseChallengeReport } from './challenge-report.js';

export const COMBAT_UNFINISHED_STATUSES = Object.freeze(['battle', 'ended', 'send-failed']);
const messageText = message => String(message?.mes ?? message?.text ?? '');

export function findReportFloor(chat, afterIndex, reportId) {
    if (typeof reportId !== 'string' || !reportId) return -1;
    const floors = Array.isArray(chat) ? chat : [];
    for (let index = Number(afterIndex) + 1; index < floors.length; index += 1) {
        const message = floors[index];
        if (message?.is_user !== true) continue;
        const text = messageText(message);
        if ((reportIdOf(text) ?? parseChallengeReport(text)?.reportId) === reportId) return index;
    }
    return -1;
}

export function resumableCombat(state, chat) {
    if (!state?.anchor || !COMBAT_UNFINISHED_STATUSES.includes(state.status)) return false;
    const reportId = state.reportId || state.report?.reportId || state.final?.reportId;
    return findReportFloor(chat, state.anchor.messageId, reportId) < 0;
}
