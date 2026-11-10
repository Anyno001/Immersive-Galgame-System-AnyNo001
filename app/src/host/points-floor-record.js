import { getSillyTavernContext } from './tavern-helper-adapter.js';
import { newPointsId, POINTS_FLOOR_KEY, pointFloors, pointsFloorId, pointsSwipe } from '../scene/points/points-policy.js';

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createPointsFloorRecord(host = globalThis) {
    async function ensure(messageId) {
        const ctx = getSillyTavernContext(host);
        const chat = ctx?.chat;
        const floors = pointFloors(chat);
        const floor = messageId === undefined ? floors.at(-1) : floors.find(f => f.messageId === messageId);
        const message = floor && chat[floor.messageId];
        if (!message) return { ok: false, reason: 'points-floor-missing' };
        const swipeId = pointsSwipe(message);
        const targets = [message, ...(Array.isArray(message.swipe_info) ? message.swipe_info.filter(object) : [])];
        const values = targets.map(t => t.extra?.[POINTS_FLOOR_KEY]).filter(v => v !== undefined);
        if (values.length && !pointsFloorId(message)) return { ok: false, reason: 'points-floor-conflict' };
        const floorId = pointsFloorId(message) || newPointsId();
        if (floors.some(f => f.messageId !== floor.messageId && f.floorId === floorId)) return { ok: false, reason: 'points-floor-conflict' };
        const anchor = { floorId, swipeId };
        if (targets.every(t => t.extra?.[POINTS_FLOOR_KEY] === floorId)) return { ok: true, anchor };
        if (typeof ctx.saveChat !== 'function') return { ok: false, reason: 'points-floor-unsupported' };
        const backups = targets.map(target => ({ target, had: Object.hasOwn(target, 'extra'), extra: target.extra }));
        for (const target of targets) target.extra = { ...(object(target.extra) ? target.extra : {}), [POINTS_FLOOR_KEY]: floorId };
        try {
            if (await ctx.saveChat() === false) throw new Error('save-failed');
        } catch {
            for (const b of backups) {
                if (b.target.extra?.[POINTS_FLOOR_KEY] !== floorId) continue;
                if (b.had) b.target.extra = b.extra; else delete b.target.extra;
            }
            return { ok: false, reason: 'points-floor-save-failed' };
        }
        const current = getSillyTavernContext(host);
        return current?.chat === chat && chat.includes(message) && pointsSwipe(message) === swipeId && pointsFloorId(message) === floorId
            ? { ok: true, anchor } : { ok: false, reason: 'request-stale' };
    }
    return { ensure };
}
