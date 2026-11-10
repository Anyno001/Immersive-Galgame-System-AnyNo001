import { activePointsAnchor, GAME_IDS, gameReward, mahjongHandAmount, POINTS_POLICY_VERSION, pointsHash } from './points-policy.js';
import { applyPointsExchange } from './points-exchange-log.js';

export const isPointsRecord = row => row?.type === 'points' || String(row?.id || '').startsWith('pt|');
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function pointsRecord(payload, now = Date.now()) {
    const value = JSON.parse(JSON.stringify({ version: POINTS_POLICY_VERSION, ...payload }));
    return { id: `pt|${pointsHash(value)}`, type: 'points', character: 'Points', anchor: null, createdAt: now, payload: value };
}

export function foldPointsRecords(rows, chat, chatId = '') {
    const rounds = new Map(), exchanges = new Map(), seen = new Map();
    let balance = 0;
    const grants = [];
    const invalid = () => ({ ok: false, reason: 'points-log-invalid' });
    if (!Array.isArray(rows)) return invalid();
    for (const row of (rows || []).filter(isPointsRecord)) {
        const p = row.payload;
        if (row.type !== 'points' || row.character !== 'Points' || row.anchor !== null || !object(p) || p.version !== POINTS_POLICY_VERSION || row.id !== `pt|${pointsHash(p)}`
            || typeof p.sourceId !== 'string' || !p.sourceId || typeof p.chatId !== 'string' || !p.chatId
            || !object(p.anchor) || typeof p.anchor.floorId !== 'string' || !p.anchor.floorId
            || !Number.isSafeInteger(p.anchor.swipeId) || p.anchor.swipeId < 0) return invalid();
        if (seen.has(row.id)) { if (!same(seen.get(row.id), p)) return invalid(); else continue; }
        seen.set(row.id, p);
        if (p.kind === 'exchange' || p.kind === 'exchange-done') {
            if (!applyPointsExchange(exchanges, rounds, row)) return invalid();
            continue;
        }
        let r = rounds.get(p.sourceId);
        if (p.kind === 'start') {
            if (r || exchanges.has(p.sourceId) || p.parent !== null || !GAME_IDS.includes(p.game)) return invalid();
            if (p.game === 'mahjong' && !['chengdu', 'riichi'].includes(p.rules)) return invalid();
            r = { id: p.sourceId, game: p.game, rules: p.rules, anchor: p.anchor, chatId: p.chatId,
                hands: [], total: 0, settled: false, award: null, revision: row.id, start: row.id };
            rounds.set(p.sourceId, r);
        } else {
            if (!r || p.parent !== r.revision || r.settled || !same(r.anchor, p.anchor) || r.chatId !== p.chatId) return invalid();
            if (p.kind === 'award') {
                const wanted = gameReward(r.game, p.result);
                if (r.game === 'mahjong' || !object(p.result) || p.approved !== wanted
                    || !Number.isSafeInteger(p.amount) || p.amount < 0 || p.amount > wanted
                    || typeof p.limitReason !== 'string') return invalid();
                r.award = { anchor: r.anchor, amount: p.amount, sourceId: r.id, game: r.game };
                r.result = p.result; r.limitReason = p.limitReason; r.approved = p.approved;
                r.total = p.amount; r.settled = true;
            } else if (p.kind === 'hand') {
                if (r.game !== 'mahjong' || p.index !== r.hands.length || p.rules !== r.rules
                    || typeof p.handId !== 'string' || !p.handId || r.hands.some(h => h.handId === p.handId)
                    || !object(p.raw)) return invalid();
                try { if (mahjongHandAmount(p) !== p.amount) return invalid(); } catch { return invalid(); }
                if (r.closing || (r.hands.length && !r.checked)) return invalid();
                r.hands.push(p); r.total += p.amount;
                r.checked = false;
            } else if (p.kind === 'check') {
                if (r.game !== 'mahjong' || r.closing || r.checked || !r.hands.length
                    || p.handId !== r.hands.at(-1).handId || !Number.isSafeInteger(p.balance)
                    || (r.total < 0 && -r.total > p.balance)) return invalid();
                r.checked = true;
            } else if (p.kind === 'close') {
                if (r.game !== 'mahjong' || r.closing || !r.hands.length || p.amount !== r.total
                    || !['manual', 'insufficient'].includes(p.reason)) return invalid();
                if (p.reason === 'insufficient' && (!Number.isSafeInteger(p.balance)
                    || r.total >= 0 || -r.total <= p.balance)) return invalid();
                r.closing = true;
                r.closeReason = p.reason;
            } else if (p.kind === 'settle') {
                if (r.game !== 'mahjong' || !r.closing || p.amount !== r.total || !r.hands.length) return invalid();
                r.settled = true;
            } else return invalid();
            r.revision = row.id;
        }
        if (!Number.isSafeInteger(r.total)) return invalid();
    }
    for (const r of rounds.values()) {
        r.active = (!chatId || r.chatId === chatId) && activePointsAnchor(r.anchor, chat);
        if (!r.active || !r.settled) continue;
        balance += r.total;
        if (r.award?.amount > 0) grants.push(r.award);
    }
    for (const exchange of exchanges.values()) {
        if (!chatId || exchange.chatId === chatId) balance -= exchange.points;
    }
    return Number.isSafeInteger(balance) ? { ok: true, balance, rounds, grants, exchanges } : invalid();
}
