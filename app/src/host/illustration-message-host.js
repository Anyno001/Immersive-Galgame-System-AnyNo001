import { getTavernHelper, getSillyTavernContext } from './tavern-helper-adapter.js';
import { IGS_IMG_MARKER_SOURCE, stripIllustrationMarkers } from '../scene/scene-directives.js';

const REGEX_ID_DISPLAY = 'igs-illustration-marker-display';
const REGEX_ID_PROMPT = 'igs-illustration-marker-prompt';

export function createIllustrationMessageHost(globalObject = globalThis) {
    const cleanups = [];
    const context = () => getSillyTavernContext(globalObject);

    function getChatId() {
        const ctx = context();
        if (!ctx) return '';
        if (typeof ctx.getCurrentChatId === 'function') return String(ctx.getCurrentChatId() || '');
        return String(ctx.chatId || '');
    }

    function readFloor(messageId) {
        const ctx = context();
        const msg = ctx && Array.isArray(ctx.chat) ? ctx.chat[messageId] : null;
        if (!msg) return null;
        return {
            chatId: getChatId(),
            messageId: Number(messageId),
            swipeId: Number.isInteger(msg.swipe_id) ? msg.swipe_id : 0,
            isAi: !msg.is_user && !msg.is_system,
            isLatest: Number(messageId) === ctx.chat.length - 1,
            text: typeof msg.mes === 'string' ? msg.mes : '',
        };
    }

    function getUserName() {
        const ctx = context();
        return ctx && typeof ctx.name1 === 'string' ? ctx.name1 : '';
    }

    // 当前角色卡与群聊成员都是已登记角色，不该被当作路人生成立绘。
    function getCharacterNames() {
        const ctx = context();
        if (!ctx) return [];
        const names = [];
        if (typeof ctx.name2 === 'string') names.push(ctx.name2);
        const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
        const group = ctx.groupId != null && Array.isArray(ctx.groups)
            ? ctx.groups.find((g) => g && String(g.id) === String(ctx.groupId)) : null;
        for (const avatar of (group && Array.isArray(group.members) ? group.members : [])) {
            const hit = characters.find((c) => c && c.avatar === avatar);
            if (hit && hit.name) names.push(hit.name);
        }
        return Array.from(new Set(names.map((n) => String(n || '').trim()).filter(Boolean)));
    }

    function readPreviousAiTexts(messageId, count) {
        const ctx = context();
        const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : [];
        const out = [];
        for (let i = Number(messageId) - 1; i >= 0 && out.length < count; i -= 1) {
            const msg = chat[i];
            if (msg && !msg.is_user && !msg.is_system && typeof msg.mes === 'string') out.unshift(msg.mes);
        }
        return out;
    }

    function matchesExpectedFloor(messageId, expected) {
        if (!expected) return true;
        const current = readFloor(messageId);
        return current && current.chatId === expected.chatId
            && current.messageId === expected.messageId
            && current.swipeId === expected.swipeId
            && current.isAi && current.isLatest
            && current.text === expected.text;
    }

    async function writeFloor(messageId, text, expectedFloor = null) {
        const helper = getTavernHelper(globalObject);
        if (!matchesExpectedFloor(messageId, expectedFloor)) return { ok: false, reason: 'stale' };
        if (helper && typeof helper.setChatMessages === 'function') {
            await helper.setChatMessages([{ message_id: Number(messageId), message: text }], { refresh: 'affected' });
            return { ok: true };
        }
        const ctx = context();
        const msg = ctx && Array.isArray(ctx.chat) ? ctx.chat[messageId] : null;
        if (!msg) return { ok: false, reason: 'message-not-found' };
        if (!matchesExpectedFloor(messageId, expectedFloor)) return { ok: false, reason: 'stale' };
        msg.mes = text;
        if (Array.isArray(msg.swipes) && Number.isInteger(msg.swipe_id)) msg.swipes[msg.swipe_id] = text;
        if (typeof ctx.updateMessageBlock === 'function') ctx.updateMessageBlock(Number(messageId), msg, { rerenderMessage: true });
        if (typeof ctx.saveChat === 'function') await ctx.saveChat();
        return { ok: true };
    }

    function on(eventKey, handler) {
        const ctx = context();
        const source = ctx && ctx.eventSource;
        const types = ctx && (ctx.event_types || ctx.eventTypes);
        const name = types && types[eventKey];
        if (!source || !name || typeof source.on !== 'function') return () => {};
        source.on(name, handler);
        const off = () => {
            if (typeof source.removeListener === 'function') source.removeListener(name, handler);
            else if (typeof source.off === 'function') source.off(name, handler);
        };
        cleanups.push(off);
        return off;
    }

    function attachPromptStrip() {
        on('CHAT_COMPLETION_PROMPT_READY', (eventData) => {
            const chat = eventData && Array.isArray(eventData.chat) ? eventData.chat : [];
            for (const item of chat) {
                if (item && typeof item.content === 'string' && /(?:\[igs-img:|<IMG>)/i.test(item.content)) {
                    item.content = stripIllustrationMarkers(item.content);
                }
            }
        });
    }

    async function ensureMarkerRegexes() {
        const helper = getTavernHelper(globalObject);
        if (!helper || typeof helper.getTavernRegexes !== 'function' || typeof helper.replaceTavernRegexes !== 'function') {
            return { ok: false, reason: 'regex-api-missing' };
        }
        const find = `/${IGS_IMG_MARKER_SOURCE}\\n?/gi`;
        const make = (id, name, destination) => ({
            id,
            script_name: name,
            enabled: true,
            run_on_edit: true,
            scope: 'global',
            find_regex: find,
            replace_string: '',
            source: { user_input: false, ai_output: true, slash_command: false, world_info: false },
            destination,
            min_depth: null,
            max_depth: null,
        });
        const wanted = [
            make(REGEX_ID_DISPLAY, 'IGS 自动插图：界面隐藏标记', { display: true, prompt: false }),
            make(REGEX_ID_PROMPT, 'IGS 自动插图：发送时隐藏标记', { display: false, prompt: true }),
        ];
        const current = helper.getTavernRegexes({ scope: 'global' }) || [];
        const others = current.filter((r) => r && r.id !== REGEX_ID_DISPLAY && r.id !== REGEX_ID_PROMPT);
        await helper.replaceTavernRegexes([...others, ...wanted], { scope: 'global' });
        return { ok: true };
    }

    return {
        getChatId, getUserName, getCharacterNames, readFloor, readPreviousAiTexts, writeFloor, on, attachPromptStrip, ensureMarkerRegexes,
        destroy() { while (cleanups.length) cleanups.pop()(); },
    };
}
