// 为按需注入收集本轮上下文：最近几层 AI 正文、本轮用户输入、在场角色线索。只读宿主，不写。
import { PAIR_TRIGGER_LOOKBACK } from '../scene/prompt-triggers.js';

const PRESENT_LOOKBACK = 6;

function messageText(message) {
    return String(message && (message.mes != null ? message.mes : message.text) || '');
}

export function collectPromptContext(context, { document: doc = null, lookback = PAIR_TRIGGER_LOOKBACK } = {}) {
    const chat = context && Array.isArray(context.chat) ? context.chat : null;
    if (!chat) return { recentAiTexts: [], userText: '', inputText: '', presentText: null, history: [], previousAiTexts: null };
    const visible = chat.filter((m) => m && !m.is_system);
    const previousAiTexts = visible.filter((m) => !m.is_user).map(messageText);
    const recentAiTexts = previousAiTexts.slice(-lookback);
    let userText = '';
    try {
        const box = doc && typeof doc.querySelector === 'function' ? doc.querySelector('#send_textarea') : null;
        userText = box && typeof box.value === 'string' ? box.value : '';
    } catch (error) { /* */ }
    // 输入框原文：宿主在生成开始事件之后才把它写成用户楼，需要区分「正要发送」与「已发送」时用这个字段。
    const inputText = userText;
    if (!userText.trim()) {
        const lastUser = [...visible].reverse().find((m) => m.is_user);
        userText = messageText(lastUser);
    }
    const names = [context.name2];
    try {
        const groupId = context.groupId;
        const group = groupId != null && Array.isArray(context.groups) ? context.groups.find((g) => g && g.id === groupId) : null;
        const members = group && Array.isArray(group.members) ? group.members : [];
        const characters = Array.isArray(context.characters) ? context.characters : [];
        for (const avatar of members) {
            const card = characters.find((c) => c && c.avatar === avatar);
            if (card && card.name) names.push(card.name);
        }
    } catch (error) { /* */ }
    const presentText = [...names.filter(Boolean), ...visible.slice(-PRESENT_LOOKBACK).map(messageText), userText].join('\n');
    const history = visible.map((m) => ({ user: Boolean(m.is_user), text: messageText(m) }));
    return { recentAiTexts, userText, inputText, presentText, history, previousAiTexts };
}
