// 账本结算入口：幂等结算、同 swipe 重算（易错点 A2/A4/A5）。
// settle(before, random) => { state, changes }，random 由本楼种子生成。
import { cryptoRandom } from './stat-rng.js';
import { STATS_LOG_MAX, ledgerKey, seededRandom, stateBefore } from './stat-ledger.js';

function newSeed() {
    return Math.floor(cryptoRandom() * 4294967296);
}

function commit(ledger, messageId, swipeId, seed, before, settle) {
    const key = ledgerKey(ledger, messageId, swipeId);
    const result = settle(before, seededRandom(seed));
    const entry = { messageId, swipeId, seed, before, after: result.state, changes: result.changes || [], meta: result.meta || null };
    ledger.entries.set(key, entry);
    ledger.active.set(messageId, swipeId);
    const rows = entry.changes.map((row) => ({ floor: key, ...row }));
    ledger.log = ledger.log.filter((row) => row.floor !== key).concat(rows).slice(-STATS_LOG_MAX);
    return entry;
}

function floorIds(floor) {
    return { messageId: Number(floor.messageId), swipeId: Number(floor.swipeId) || 0 };
}

// 同一楼同一 swipe 只结算一次；键已存在时只读（重绘、翻页、切回聊天）。新 swipe 用新种子，即重 roll 重掷。
export function settleFloor(ledger, floor, settle, seed = newSeed()) {
    const { messageId, swipeId } = floorIds(floor);
    const existing = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
    if (existing) {
        ledger.active.set(messageId, swipeId);
        return { reused: true, entry: existing };
    }
    return { reused: false, entry: commit(ledger, messageId, swipeId, seed, stateBefore(ledger, messageId), settle) };
}

// 继续生成、编辑正文：从本楼结算前快照重算，复用种子；不级联重算后续楼层。
export function resettleFloor(ledger, floor, settle) {
    const { messageId, swipeId } = floorIds(floor);
    const existing = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
    if (!existing) return settleFloor(ledger, floor, settle);
    return { reused: false, entry: commit(ledger, messageId, swipeId, existing.seed, existing.before, settle) };
}
