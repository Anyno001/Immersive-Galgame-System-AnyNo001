// 直播超管警告：纯函数判断正文 / dm 里有没有「超管警告」，0 token，不改提示词。
// warn：警告整改（红色卡片 + 系统消息 + 横飞暂停 + 轻抖）；ban：直播间被封（马赛克灰度 -> 黑底「直播间已被关闭」）。

export const LIVE_WARN_COOLDOWN_MS = 60000;
export const LIVE_WARN_CARD_MS = 4500;
export const LIVE_WARN_FLY_PAUSE_MS = 2000;
export const LIVE_WARN_MEME_DELAY_MS = 1500;
export const LIVE_WARN_TITLE = '超管警告';
export const LIVE_WARN_BODY = '您的直播内容涉嫌违规，请立即整改，否则将被断播处理';
export const LIVE_BAN_TITLE = '直播间已被关闭';
export const LIVE_BAN_SUB = '该直播间因违反平台规定，已被关闭';

// 关键词表（短、按类分组）。
// 直播语境：普通对话里的「警告」必须同时有这些词之一才算。
const LIVE_CONTEXT = /直播|开播|下播|主播|超管|平台|断播/;
// 警告类：命中任意一个并且有直播语境才触发。
const WARN_WORDS = /警告|违规|整改|下播处理|被封|封禁|封号|断播|切断直播|直播间被关|关闭直播间|已被关闭/;
// 封号类：命中即升级成 ban。
const BAN_WORDS = /被封|封禁|封号|封了|封掉|断播|切断直播|关闭直播间|直播间被关|直播间已被关|关停/;
// dm 里这些用户名发的消息本身就是系统口吻。
const SYSTEM_USERS = Object.freeze(['超管', '系统', '平台']);

function clip(value, max = 40) {
    return Array.from(String(value || '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
}

// 取包含关键词的那一句（没有就空），给卡片拼成原因。
function sentenceWith(text, pattern) {
    const parts = String(text || '').split(/[。！？!?\n]/);
    const hit = parts.find((part) => pattern.test(part));
    return hit ? clip(hit) : '';
}

// 返回 null | { level: 'warn' | 'ban', reason }。plan.dms 是本页的直播弹幕标签。
export function detectLiveWarning(text, plan) {
    const dms = plan && Array.isArray(plan.dms) ? plan.dms : [];
    for (const dm of dms) {
        if (!dm) continue;
        const body = String(dm.text || '');
        const user = String(dm.user || '').trim();
        const fromAdmin = dm.type === 'admin' && body.includes('警告');
        const fromSystem = SYSTEM_USERS.includes(user) && body.trim();
        if (fromAdmin || fromSystem) {
            return { level: BAN_WORDS.test(body) ? 'ban' : 'warn', reason: clip(body) };
        }
    }
    const page = String(text || '');
    if (!page || !WARN_WORDS.test(page) || !LIVE_CONTEXT.test(page)) return null;
    const ban = BAN_WORDS.test(page);
    return { level: ban ? 'ban' : 'warn', reason: sentenceWith(page, ban ? BAN_WORDS : WARN_WORDS) };
}

// 同一场直播 60 秒内不重复弹警告。last 为 0 / 空表示还没弹过。
export function warningCooldownOk(last, now, ms = LIVE_WARN_COOLDOWN_MS) {
    return !(Number(last) > 0) || Number(now) - Number(last) >= ms;
}

// 卡片正文：固定提示语，reason 有内容时拼在后面。
export function warningCardText(reason) {
    const extra = clip(reason, 40);
    return extra ? `${LIVE_WARN_BODY}（${extra}）` : LIVE_WARN_BODY;
}
