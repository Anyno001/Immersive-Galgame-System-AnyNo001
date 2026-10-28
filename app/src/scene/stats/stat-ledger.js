// 按楼快照账本（§3）。键与 media/illustration-store.js 的 floorKeyOf 同格式：chatId|messageId|swipeId。
// 每条只存结算前后状态的引用（共享只读）与随机种子；变动日志另存，最多 500 条（易错点 B4）。
export const STATS_LOG_MAX = 500;

export function statFloorKey({ chatId, messageId, swipeId }) {
    return `${chatId}|${messageId}|${Number(swipeId) || 0}`;
}

// mulberry32。种子由 crypto 生成，同一 swipe 重算时复用，掷骰序列不变。
export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function createStatsLedger(chatId, initial) {
    return { chatId, initial, entries: new Map(), active: new Map(), log: [] };
}

export function ledgerKey(ledger, messageId, swipeId) {
    return statFloorKey({ chatId: ledger.chatId, messageId, swipeId });
}

function latestActive(ledger, below = Infinity) {
    let best = null;
    for (const [messageId, swipeId] of ledger.active) {
        if (messageId < below && (!best || messageId > best.messageId)) best = { messageId, swipeId };
    }
    return best ? ledger.entries.get(ledgerKey(ledger, best.messageId, best.swipeId)) || null : null;
}

export function stateBefore(ledger, messageId) {
    const entry = latestActive(ledger, messageId);
    return entry ? entry.after : ledger.initial;
}

export function currentStatsState(ledger) {
    const entry = latestActive(ledger);
    return entry ? entry.after : ledger.initial;
}

// 切换到已有 swipe 只读取已存结果，不重掷；没结算过的 swipe 退回上一楼状态（易错点 B1）。
export function selectSwipe(ledger, messageId, swipeId) {
    const id = Number(messageId);
    const entry = ledger.entries.get(ledgerKey(ledger, id, Number(swipeId) || 0)) || null;
    if (entry) ledger.active.set(id, entry.swipeId);
    else ledger.active.delete(id);
    return entry;
}

// 删楼：移除该楼及之后楼层的快照，当前状态回到最后一个存活楼层（易错点 B3）。
export function deleteFloorsFrom(ledger, messageId) {
    const id = Number(messageId);
    for (const [key, entry] of ledger.entries) if (entry.messageId >= id) ledger.entries.delete(key);
    for (const mid of [...ledger.active.keys()]) if (mid >= id) ledger.active.delete(mid);
    ledger.log = ledger.log.filter((row) => ledger.entries.has(row.floor));
    return currentStatsState(ledger);
}
