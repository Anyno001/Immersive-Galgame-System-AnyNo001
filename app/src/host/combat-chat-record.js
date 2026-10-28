import { getSillyTavernContext } from './tavern-helper-adapter.js';

// 卡牌战斗聊天记录留档：按 combatId 读写开战楼的 extra.igsCombat，并同步写当前 swipe 的 swipe_info[swipeId].extra
// （宿主换 swipe 时用它恢复 extra）。不改正文 mes、不重绘；宿主没有 saveChat 时不写，保存失败时撤回内存改动。
export const COMBAT_CHAT_RECORD_KEY = 'igsCombat';

const KEY = COMBAT_CHAT_RECORD_KEY;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const swipeOf = (m) => (Number.isInteger(m?.swipe_id) ? m.swipe_id : 0);

export function createCombatChatRecord(globalObject = globalThis) {
    const context = () => getSillyTavernContext(globalObject);
    // 开战楼仍在、不是用户楼且仍在锚点 swipe 上时返回该楼，否则 null。
    const floorAt = (anchor) => {
        const ctx = context();
        const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : null;
        const m = chat && Number.isInteger(anchor?.messageId) ? chat[anchor.messageId] : null;
        return isObj(m) && m.is_user !== true && swipeOf(m) === anchor.swipeId ? m : null;
    };
    const entryOf = (m, combatId) => {
        const box = isObj(m.extra) ? m.extra[KEY] : undefined;
        if (box === undefined) return { ok: true, value: null };
        if (!isObj(box)) return { ok: false, reason: 'combat-record-corrupt' };
        const value = box[combatId];
        if (value === undefined) return { ok: true, value: null };
        return isObj(value) ? { ok: true, value: clone(value) } : { ok: false, reason: 'combat-record-corrupt' };
    };

    // 楼层不在或已换 swipe 返回 value:null（那是另一场）；格式不对返回 combat-record-corrupt，不当作没有记录。
    function read(anchor, combatId) {
        try {
            const m = floorAt(anchor);
            return m ? entryOf(m, combatId) : { ok: true, value: null };
        } catch (error) {
            return { ok: false, reason: 'combat-record-read-failed' };
        }
    }

    // patch 浅合并进该场记录，保存后读回核对。
    async function write(anchor, combatId, patch) {
        const ctx = context();
        if (!ctx || typeof ctx.saveChat !== 'function') return { ok: false, reason: 'combat-record-unsupported' };
        const m = floorAt(anchor);
        if (!m) return { ok: false, reason: 'combat-record-stale' };
        const cur = entryOf(m, combatId);
        if (!cur.ok) return cur;
        const next = { ...(cur.value || {}), ...clone(patch) };
        const info = Array.isArray(m.swipe_info) ? m.swipe_info[anchor.swipeId] : null;
        const undo = [];
        for (const t of isObj(info) ? [m, info] : [m]) {
            const extra = isObj(t.extra) ? t.extra : {};
            undo.push({ t, had: Object.hasOwn(t, 'extra'), extra: t.extra, hadBox: Object.hasOwn(extra, KEY), box: extra[KEY] });
            extra[KEY] = { ...(isObj(extra[KEY]) ? extra[KEY] : {}), [combatId]: clone(next) };
            t.extra = extra;
        }
        try {
            await ctx.saveChat();
        } catch (error) {
            for (const u of undo.reverse()) {
                if (!u.had) delete u.t.extra;
                else if (u.t.extra !== u.extra) u.t.extra = u.extra;
                else if (u.hadBox) u.t.extra[KEY] = u.box;
                else delete u.t.extra[KEY];
            }
            return { ok: false, reason: 'combat-record-save-failed' };
        }
        const back = read(anchor, combatId);
        return back.ok && back.value && JSON.stringify(back.value) === JSON.stringify(next)
            ? { ok: true, value: back.value } : { ok: false, reason: 'combat-record-unverified' };
    }

    return { read, write };
}
