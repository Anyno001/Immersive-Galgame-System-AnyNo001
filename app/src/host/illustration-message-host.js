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

    // 立绘写词的外貌参考：用户角色读人设描述，角色卡读描述，世界书只取关键词或标题含该名字的条目。
    // 只在角色没登记 DNA 时调用，每人限字，不整本塞进副 LLM。
    async function readCharacterLore(names = [], limits = {}) {
        const ctx = context();
        if (!ctx) return [];
        const perName = Number(limits.perName) || 600;
        const total = Number(limits.total) || 1800;
        const flat = (text) => String(text || '').replace(/\s+/g, ' ').trim();
        const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
        const entries = await readWorldInfoEntries(ctx, characters);
        const out = [];
        let used = 0;
        for (const name of names.map((n) => String(n || '').trim()).filter(Boolean)) {
            const parts = [];
            if (name === ctx.name1) {
                const persona = flat(ctx.powerUserSettings && ctx.powerUserSettings.persona_description);
                if (persona) parts.push(`用户人设：${persona}`);
            }
            const card = characters.find((c) => c && c.name === name);
            const description = flat(card && (card.description || (card.data && card.data.description)));
            if (description) parts.push(`角色卡：${description}`);
            for (const entry of entries) {
                if (entryMentions(entry, name)) parts.push(`世界书：${flat(entry.content)}`);
                if (parts.join(' ').length >= perName) break;
            }
            const text = parts.join('\n').slice(0, Math.min(perName, total - used));
            if (!text) continue;
            used += text.length;
            out.push({ name, text });
            if (used >= total) break;
        }
        return out;
    }

    async function readWorldInfoEntries(ctx, characters) {
        const books = new Set();
        const add = (name) => { if (typeof name === 'string' && name.trim()) books.add(name.trim()); };
        add(ctx.chatMetadata && ctx.chatMetadata.world_info);
        const card = ctx.characterId != null ? characters[ctx.characterId] : null;
        add(card && card.data && card.data.extensions && card.data.extensions.world);
        const helper = getTavernHelper(globalObject);
        try {
            const globals = helper && typeof helper.getGlobalWorldbookNames === 'function'
                ? helper.getGlobalWorldbookNames()
                : (helper && typeof helper.getLorebookSettings === 'function' ? (helper.getLorebookSettings() || {}).selected_global_lorebooks : []);
            (Array.isArray(globals) ? globals : []).forEach(add);
        } catch (error) { /* 读不到全局世界书就只用聊天与角色绑定的 */ }
        const entries = [];
        const embedded = card && card.data && card.data.character_book && card.data.character_book.entries;
        if (Array.isArray(embedded)) entries.push(...embedded.map((e) => ({ key: e.keys, keysecondary: e.secondary_keys, comment: e.comment || e.name, content: e.content, disable: e.enabled === false })));
        if (typeof ctx.loadWorldInfo === 'function') {
            for (const book of books) {
                try {
                    const data = await ctx.loadWorldInfo(book);
                    if (data && data.entries) entries.push(...Object.values(data.entries));
                } catch (error) { /* 单本读取失败跳过 */ }
            }
        }
        return entries.filter((e) => e && !e.disable && String(e.content || '').trim());
    }

    function entryMentions(entry, name) {
        const keys = [].concat(entry.key || [], entry.keysecondary || []).map((k) => String(k || '').trim()).filter((k) => k.length >= 2 || k === name);
        if (keys.some((k) => k === name || k.includes(name) || name.includes(k))) return true;
        return String(entry.comment || '').includes(name);
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

    function matchesExpectedFloor(messageId, expected, options = {}) {
        if (!expected) return true;
        const requireLatest = !options || options.requireLatest !== false;
        const current = readFloor(messageId);
        return current && current.chatId === expected.chatId
            && current.messageId === expected.messageId
            && current.swipeId === expected.swipeId
            && current.isAi
            && (!requireLatest || current.isLatest)
            && current.text === expected.text;
    }

    async function writeFloor(messageId, text, expectedFloor = null, options = null) {
        const matchOptions = options && typeof options === 'object' ? options : {};
        const helper = getTavernHelper(globalObject);
        if (!matchesExpectedFloor(messageId, expectedFloor, matchOptions)) return { ok: false, reason: 'stale' };
        if (helper && typeof helper.setChatMessages === 'function') {
            await helper.setChatMessages([{ message_id: Number(messageId), message: text }], { refresh: 'affected' });
            return { ok: true };
        }
        const ctx = context();
        const msg = ctx && Array.isArray(ctx.chat) ? ctx.chat[messageId] : null;
        if (!msg) return { ok: false, reason: 'message-not-found' };
        if (!matchesExpectedFloor(messageId, expectedFloor, matchOptions)) return { ok: false, reason: 'stale' };
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
        getChatId, getUserName, getCharacterNames, readCharacterLore, readFloor, readPreviousAiTexts, writeFloor, on, attachPromptStrip, ensureMarkerRegexes,
        destroy() { while (cleanups.length) cleanups.pop()(); },
    };
}
