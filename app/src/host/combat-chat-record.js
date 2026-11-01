// 战斗记录的聊天存档读写。
// 记录挂在 AI 楼层（及其当前滑页）的 extra.igsCombat[key] 下；
// 读取时要求楼层存在、非用户楼且滑页号一致，写入后回读校验，保存失败则恢复原 extra。
import { getSillyTavernContext } from './tavern-helper-adapter.js';

export const COMBAT_CHAT_RECORD_KEY = 'igsCombat';
const EXTRA_KEY = COMBAT_CHAT_RECORD_KEY;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const deepClone = (value) => JSON.parse(JSON.stringify(value));
const swipeOf = (message) => (Number.isInteger(message?.swipe_id) ? message.swipe_id : 0);

// 创建聊天记录读写器。host 默认取全局对象，测试可注入。
export function createCombatChatRecord(host = globalThis) {
    const context = () => getSillyTavernContext(host);

    // 按锚点（messageId + swipeId）找到对应的 AI 楼层消息，找不到返回 null
    const findMessage = (anchor) => {
        const ctx = context();
        const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : null;
        const message = chat && Number.isInteger(anchor?.messageId) ? chat[anchor.messageId] : null;
        return isPlainObject(message) && message.is_user !== true && swipeOf(message) === anchor.swipeId ? message : null;
    };

    // 从消息 extra 里取出 key 对应的记录副本；结构异常返回 corrupt
    const readFromMessage = (message, key) => {
        const box = isPlainObject(message.extra) ? message.extra[EXTRA_KEY] : undefined;
        if (box === undefined) return { ok: true, value: null };
        if (!isPlainObject(box)) return { ok: false, reason: 'combat-record-corrupt' };
        const record = box[key];
        if (record === undefined) return { ok: true, value: null };
        return isPlainObject(record) ? { ok: true, value: deepClone(record) } : { ok: false, reason: 'combat-record-corrupt' };
    };

    function read(anchor, key) {
        try {
            const message = findMessage(anchor);
            return message ? readFromMessage(message, key) : { ok: true, value: null };
        } catch {
            return { ok: false, reason: 'combat-record-read-failed' };
        }
    }

    // 合并写入 patch 到记录，保存聊天；保存失败时逐个恢复被改动对象的 extra
    async function write(anchor, key, patch) {
        const ctx = context();
        if (!ctx || typeof ctx.saveChat !== 'function') return { ok: false, reason: 'combat-record-unsupported' };
        const message = findMessage(anchor);
        if (!message) return { ok: false, reason: 'combat-record-stale' };
        const existing = readFromMessage(message, key);
        if (!existing.ok) return existing;
        const merged = { ...(existing.value || {}), ...deepClone(patch) };

        // 消息本体与当前滑页（swipe_info）都要写，以便切换滑页后记录不丢
        const swipeInfo = Array.isArray(message.swipe_info) ? message.swipe_info[anchor.swipeId] : null;
        const backups = [];
        for (const target of isPlainObject(swipeInfo) ? [message, swipeInfo] : [message]) {
            const extra = isPlainObject(target.extra) ? target.extra : {};
            backups.push({
                target,
                hadExtra: Object.hasOwn(target, 'extra'),
                extra: target.extra,
                hadBox: Object.hasOwn(extra, EXTRA_KEY),
                box: extra[EXTRA_KEY],
            });
            extra[EXTRA_KEY] = { ...(isPlainObject(extra[EXTRA_KEY]) ? extra[EXTRA_KEY] : {}), [key]: deepClone(merged) };
            target.extra = extra;
        }
        try {
            await ctx.saveChat();
        } catch {
            for (const backup of backups.reverse()) {
                if (!backup.hadExtra) delete backup.target.extra;
                else if (backup.target.extra !== backup.extra) backup.target.extra = backup.extra;
                else if (backup.hadBox) backup.target.extra[EXTRA_KEY] = backup.box;
                else delete backup.target.extra[EXTRA_KEY];
            }
            return { ok: false, reason: 'combat-record-save-failed' };
        }
        // 保存后回读，内容必须与写入一致
        const verified = read(anchor, key);
        return verified.ok && verified.value && JSON.stringify(verified.value) === JSON.stringify(merged)
            ? { ok: true, value: verified.value }
            : { ok: false, reason: 'combat-record-unverified' };
    }

    return { read, write };
}
