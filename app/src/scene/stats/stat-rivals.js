// 修罗场情敌集合（§修罗场判定修正）：只读账本，算出「当下仍有情敌立场」的角色。纯函数，不改结算、不新增存档字段。
// 满足任一条即算：A. 最近 windowDays 个游戏日内有吃醋记录（任一路）；B. 芥蒂不低于阈值；C. 仍是恋爱对象（character.romance === true）。
import { currentStatsState, ledgerKey } from './stat-ledger.js';
import { PROTAGONIST } from './stat-engine.js';

export const RIVAL_WINDOW_DAYS = 7;
export const RIVAL_GRUDGE_MIN = 26;

function dayOf(entry) {
    const day = entry && entry.after && entry.after.clock ? Number(entry.after.clock.day) : NaN;
    return Number.isFinite(day) ? day : null;
}

export function statsRivalSet(ledger, { windowDays = RIVAL_WINDOW_DAYS } = {}) {
    const out = new Set();
    if (!ledger || !ledger.active || !ledger.entries) return out;
    const state = currentStatsState(ledger) || {};
    const nowDay = state.clock && Number.isFinite(Number(state.clock.day)) ? Number(state.clock.day) : null;
    // A. 吃醋记录：取各生效楼结算后的游戏日；日期缺失时无法判断远近，按仍在窗口内处理。
    for (const [messageId, swipeId] of ledger.active) {
        const entry = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
        for (const c of (entry && entry.changes) || []) {
            if (!c || c.note !== '吃醋' || !c.target || c.target === PROTAGONIST) continue;
            const day = dayOf(entry);
            if (day === null || nowDay === null || nowDay - day < windowDays) out.add(String(c.target));
        }
    }
    // B、C. 当前状态：芥蒂未解、仍是恋爱对象。
    for (const [name, c] of Object.entries(state.characters || {})) {
        if (!name || name === PROTAGONIST || !c) continue;
        if (Number(c.dims && c.dims.芥蒂) >= RIVAL_GRUDGE_MIN || c.romance === true) out.add(name);
    }
    return out;
}
