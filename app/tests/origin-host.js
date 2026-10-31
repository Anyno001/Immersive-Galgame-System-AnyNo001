// 测试用假宿主：模拟酒馆上下文、事件总线、聊天数组。设置对象冻结，用来保证核心不原地改宿主设置。
import { createOriginEngine } from '../src/scene/origin/origin-engine.js';

const TYPES = {
    CHAT_COMPLETION_PROMPT_READY: 'prompt_ready', GENERATION_STARTED: 'gen_started', GENERATION_ENDED: 'gen_ended', GENERATION_STOPPED: 'gen_stopped',
    MESSAGE_RECEIVED: 'msg_received', MESSAGE_SWIPED: 'msg_swiped', MESSAGE_DELETED: 'msg_deleted', MESSAGE_UPDATED: 'msg_updated', MESSAGE_EDITED: 'msg_edited', CHAT_CHANGED: 'chat_changed',
};

export function makeMsg(mes, isUser = false) {
    return { name: isUser ? 'User' : 'Bot', is_user: isUser, is_system: false, mes, swipe_id: 0, swipes: [mes], extra: {} };
}

export function createHarness(settingsOver = {}) {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { if (handlers.has(n)) handlers.get(n).delete(f); },
    };
    const emit = (n, ...a) => { for (const f of [...(handlers.get(n) || [])]) f(...a); };
    const ctx = {
        chat: [], chatMetadata: {}, chatId: 'chat-a', eventSource, eventTypes: TYPES, characters: [{ description: '一位旅人' }], characterId: 0,
        updateMessageBlock() {}, saveChatCalls: 0, saveChat() { ctx.saveChatCalls += 1; },
    };
    const notes = [];
    const settings = Object.freeze({ enabled: true, ...settingsOver, mods: Object.freeze({ ...(settingsOver.mods || {}) }) });
    const h = {
        ctx, emit, notes, saves: 0, generateImpl: async () => '', settingsObj: settings,
        host: {
            getContext: () => ctx, settings: () => settings, saveSettings() { h.settingsSaved = true; },
            saveMetadata() { h.saves += 1; }, notify: (n) => notes.push(n),
            generate: (kind, prompt) => h.generateImpl(kind, prompt),
        },
    };
    h.engine = createOriginEngine(h.host);
    h.engine.start();
    // 一次生成：按顺序触发 GENERATION_STARTED → PROMPT_READY → GENERATION_ENDED，返回注入后的 prompt 数组
    h.prompt = (type = 'normal') => {
        emit(TYPES.GENERATION_STARTED, type, {}, false);
        const ev = { chat: [{ role: 'user', content: '你好' }], dryRun: false };
        emit(TYPES.CHAT_COMPLETION_PROMPT_READY, ev);
        emit(TYPES.GENERATION_ENDED);
        return ev.chat;
    };
    h.injected = (type) => { const c = h.prompt(type); const last = c[c.length - 1]; return last && last.role === 'system' && last.content.startsWith('【Origin') ? last.content : ''; };
    h.user = (text = '继续') => { ctx.chat.push(makeMsg(text, true)); return ctx.chat.length - 1; };
    h.ai = (text = '……') => { ctx.chat.push(makeMsg(text)); const i = ctx.chat.length - 1; emit(TYPES.MESSAGE_RECEIVED, i); return i; };
    // 滑动到一个新 swipe（正文先写好，再触发滑动与收到消息）
    h.newSwipe = (i, text) => { const m = ctx.chat[i]; m.swipes.push(text); m.swipe_id = m.swipes.length - 1; m.mes = text; emit(TYPES.MESSAGE_SWIPED, i); emit(TYPES.MESSAGE_RECEIVED, i); return m.swipe_id; };
    h.selectSwipe = (i, id) => { const m = ctx.chat[i]; m.swipe_id = id; m.mes = m.swipes[id]; emit(TYPES.MESSAGE_SWIPED, i); };
    h.removeLast = () => { ctx.chat.pop(); emit(TYPES.MESSAGE_DELETED, ctx.chat.length); };
    h.state = () => h.engine.getState();
    h.bag = () => Object.fromEntries(h.state().bag.map((b) => [b.name, b.count]));
    // 把聊天元数据按 JSON 存取一遍再起一个新引擎，模拟存档重开
    h.reopen = () => {
        h.engine.stop();
        ctx.chatMetadata = JSON.parse(JSON.stringify(ctx.chatMetadata));
        h.engine = createOriginEngine(h.host);
        h.engine.start();
        return h.engine;
    };
    return h;
}
export const blk = (...lines) => '<origin>\n' + lines.join('\n') + '\n</origin>';
