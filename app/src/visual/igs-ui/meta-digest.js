import { buildMetaDigestRule, normalizeMetaFxSettings, summarizeMetaEvents } from './meta-settings.js';

// 交互摘要暂存：阅读器记录事件，bootstrap 注入提示词。生成开始时记下已送出的条数，结束后只清掉这部分，
// 生成过程中新发生的事件留给下一轮。只存在内存里，不写进聊天记录。
const EVENTS_MAX = 50;
const events = [];
let sentCount = 0;
const listeners = new Set();

function notify() {
    for (const listener of listeners) {
        try { listener(); } catch (error) { /* */ }
    }
}

export function recordMetaEvent(event) {
    if (!event || typeof event !== 'object') return;
    events.push({ ...event });
    while (events.length > EVENTS_MAX) {
        events.shift();
        sentCount = Math.max(0, sentCount - 1);
    }
    notify();
}

export function pendingMetaDigest() {
    return summarizeMetaEvents(events);
}

export function beginMetaDigestSend() {
    sentCount = events.length;
}

export function finishMetaDigestSend() {
    if (!sentCount) return;
    events.splice(0, sentCount);
    sentCount = 0;
    notify();
}

export function clearMetaDigest() {
    const had = events.length > 0;
    events.length = 0;
    sentCount = 0;
    if (had) notify();
}

export function onMetaDigestChange(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

// 总开关与摘要开关都开、且有待送出的事件时才返回规则。
export function resolveMetaDigestRule(settings) {
    const s = normalizeMetaFxSettings(settings);
    if (!s.enabled || !s.digest) return '';
    return buildMetaDigestRule(pendingMetaDigest());
}
