import { hashString } from './random.js';

// 场次 ID 继续用于旧战报和账本引用，随机域单独区分聊天。
export function battleRandomKeyFor(chatId, combatId) {
    return chatId ? `battle-v2:${hashString(JSON.stringify([chatId, combatId]))}` : undefined;
}

export function resolveBattleRandomKey({ chatId, combatId, record, offer, prepared }) {
    // 已有记录缺少 randomKey 就是旧随机域，不能在重开或补奖励时重新洗牌。
    const saved = [record, offer, prepared].find((value) => value != null);
    return saved ? saved.randomKey : battleRandomKeyFor(chatId, combatId);
}

export const battleRandomFields = (session) => session.randomKey === undefined ? {} : { randomKey: session.randomKey };
