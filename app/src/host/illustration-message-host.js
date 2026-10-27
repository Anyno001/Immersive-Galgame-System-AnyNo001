import { getTavernHelper, getSillyTavernContext } from './tavern-helper-adapter.js';
import { IGS_IMG_MARKER_SOURCE, stripIllustrationMarkers } from '../scene/scene-directives.js';
import { isBackgroundGenerationActive } from './background-generation.js';
import { CARD_BOOK, isWorldInfoExcluded, normalizeWorldInfoExclude } from './world-info-filter.js';

const REGEX_ID_DISPLAY = 'igs-illustration-marker-display';
const REGEX_ID_PROMPT = 'igs-illustration-marker-prompt';

export function createIllustrationMessageHost(globalObject = globalThis, options = {}) {
    const cleanups = [];
    const context = () => getSillyTavernContext(globalObject);
    const pendingBindings = new Set();
    let bindingTimer = null, bindingDelay = 100, destroyed = false;
    const clearBindingTimer = () => {
        if (bindingTimer !== null) (globalObject.clearTimeout || clearTimeout)(bindingTimer);
        bindingTimer = null;
    };

    function getChatId() {
        const ctx = context();
        if (!ctx) return '';
        if (typeof ctx.getCurrentChatId === 'function') return String(ctx.getCurrentChatId() || '');
        return String(ctx.chatId || '');
    }

    // 「最新楼」= 后面还没有用户发言。平行事件、状态栏这类插件会在 AI 楼后面再插一条（常是隐藏的系统消息），
    // 按「最后一条」判断会让这楼的立绘、场景、CG 全部不生成。
    function isLatestTurn(chat, messageId) {
        for (let i = messageId + 1; i < chat.length; i += 1) {
            if (chat[i] && chat[i].is_user) return false;
        }
        return true;
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
            isLatest: isLatestTurn(ctx.chat, Number(messageId)),
            text: typeof msg.mes === 'string' ? msg.mes : '',
        };
    }

    function getUserName() {
        const ctx = context();
        return ctx && typeof ctx.name1 === 'string' ? ctx.name1 : '';
    }

    // 用户人设与角色卡参考；内置写词通过 includeWorldInfo:false 将世界书交给原生触发扫描。
    // 只收集本轮角色的完整参考，不按字符数丢弃角色或截断设定。
    async function readCharacterLore(names = [], options = {}) {
        const ctx = context();
        if (!ctx) return [];
        const flat = (text) => String(text || '').replace(/\s+/g, ' ').trim();
        const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
        const entries = options.includeWorldInfo === false ? [] : await readWorldInfoEntries(ctx, characters);
        const out = [];
        for (const name of new Set(names.map((n) => String(n || '').trim()).filter(Boolean))) {
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
            }
            const text = [...new Set(parts)].join('\n');
            if (!text) continue;
            out.push({ name, text });
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
        const exclude = normalizeWorldInfoExclude(typeof options.readWorldInfoExclude === 'function' ? options.readWorldInfoExclude() : null);
        const entries = [];
        const embedded = card && card.data && card.data.character_book && card.data.character_book.entries;
        if (Array.isArray(embedded)) entries.push(...embedded.map((e, index) => ({ key: e.keys, keysecondary: e.secondary_keys, comment: e.comment || e.name, content: e.content, disable: e.enabled === false,
            book: CARD_BOOK, uid: e.id != null ? e.id : index })));
        if (typeof ctx.loadWorldInfo === 'function') {
            for (const book of books) {
                if (exclude.books.includes(book)) continue;
                try {
                    const data = await ctx.loadWorldInfo(book);
                    if (data && data.entries) entries.push(...Object.entries(data.entries).map(([key, e]) => ({ ...e, book, uid: e && e.uid != null ? e.uid : key })));
                } catch (error) { /* 单本读取失败跳过 */ }
            }
        }
        return entries.filter((e) => e && !e.disable && String(e.content || '').trim() && !isWorldInfoExcluded(exclude, e.book, e.uid));
    }

    // 只读当前角色卡绑定的世界书（主世界书、附加世界书、卡内嵌世界书），不含聊天与全局世界书。
    // 每个名字只收开着的、条目名或关键字命中这个名字的条目。
    async function readCardWorldbook(names = []) {
        const ctx = context();
        const wanted = [...new Set(names.map((n) => String(n || '').trim()).filter(Boolean))];
        if (!ctx || !wanted.length) return [];
        const characters = Array.isArray(ctx.characters) ? ctx.characters : [];
        const card = ctx.characterId != null ? characters[ctx.characterId] : null;
        if (!card) return wanted.map((name) => ({ name, entries: [] }));
        const books = new Set();
        const add = (book) => { if (typeof book === 'string' && book.trim()) books.add(book.trim()); };
        add(card.data && card.data.extensions && card.data.extensions.world);
        const helper = getTavernHelper(globalObject);
        try {
            const bound = helper && typeof helper.getCharWorldbookNames === 'function' ? helper.getCharWorldbookNames('current') : null;
            if (bound) {
                add(bound.primary);
                (Array.isArray(bound.additional) ? bound.additional : []).forEach(add);
            }
        } catch (error) { /* 读不到附加世界书就只用主世界书 */ }
        const entries = [];
        if (typeof ctx.loadWorldInfo === 'function') {
            for (const book of books) {
                try {
                    const data = await ctx.loadWorldInfo(book);
                    if (data && data.entries) entries.push(...Object.values(data.entries));
                } catch (error) { /* 单本读取失败跳过 */ }
            }
        }
        // 卡内嵌的世界书导入后通常就是主世界书；没绑主世界书时才读内嵌的那份。
        const embedded = !books.size && card.data && card.data.character_book && card.data.character_book.entries;
        if (Array.isArray(embedded)) entries.push(...embedded.map((e) => ({ key: e.keys, keysecondary: e.secondary_keys, comment: e.comment || e.name, content: e.content, disable: e.enabled === false })));
        const open = entries.filter((e) => e && !e.disable && String(e.content || '').trim());
        return wanted.map((name) => ({
            name,
            entries: open.filter((entry) => entryMentions(entry, name))
                .map((entry) => ({ title: String(entry.comment || '').trim(), content: String(entry.content || '').trim() })),
        }));
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

    function reportListenerFailure(eventKey) {
        try { globalObject.console?.warn?.('[IGS] 宿主事件的内部处理失败', { eventKey }); }
        catch { /* 诊断失败不影响宿主派发。 */ }
    }

    function invokeListener(eventKey, handler, args) {
        try {
            const result = handler(...args);
            if (result && typeof result.then === 'function') {
                void Promise.resolve(result).catch(() => reportListenerFailure(eventKey));
            }
        } catch { reportListenerFailure(eventKey); }
    }

    // 只在宿主事件端口尚未出现时探测绑定；就绪后停表，不扫描正文或补跑历史楼层。
    function scheduleBindings() {
        if (destroyed || bindingTimer !== null || !pendingBindings.size) return;
        bindingTimer = (globalObject.setTimeout || setTimeout)(() => {
            bindingTimer = null;
            for (const bind of [...pendingBindings]) bind();
            bindingDelay = Math.min(2000, bindingDelay * 2);
            scheduleBindings();
        }, bindingDelay);
        bindingTimer?.unref?.();
    }

    function on(eventKey, handler) {
        if (destroyed) return () => {};
        let source = null, name = '', alive = true;
        // 直接接收并返回；内部 Promise 和异常不进入宿主派发链。
        const listener = (...args) => {
            if (alive && !destroyed) invokeListener(eventKey, handler, args);
        };
        const bind = () => {
            if (!alive || destroyed || source) return;
            const ctx = context();
            const nextSource = ctx?.eventSource;
            const types = ctx && (ctx.event_types || ctx.eventTypes);
            if (!nextSource || typeof nextSource.on !== 'function' || !types) return;
            // 已就绪但未提供的可选事件不持续重试。
            const nextName = types[eventKey];
            if (nextName) {
                nextSource.on(nextName, listener);
                source = nextSource;
                name = nextName;
            }
            pendingBindings.delete(bind);
            if (!pendingBindings.size) { clearBindingTimer(); bindingDelay = 100; }
        };
        const off = () => {
            if (!alive) return;
            alive = false;
            pendingBindings.delete(bind);
            if (!pendingBindings.size) clearBindingTimer();
            if (typeof source?.removeListener === 'function') source.removeListener(name, listener);
            else if (typeof source?.off === 'function') source.off(name, listener);
        };
        pendingBindings.add(bind);
        bind();
        scheduleBindings();
        cleanups.push(off);
        return off;
    }

    // 渲染可能发生在流式正文尚未落定时；主生成结束后补发本轮实际 AI 楼。
    // 只跟随正常主生成，不把后台 quiet 写词结束当成新的生图请求。
    function onImageFloorReady(handler) {
        let active = false, blocked = false, turnChat = '', epoch = 0, ignoredDepth = 0, pending = new Set(), alive = true;
        const deliver = (id, eventKey = 'CHARACTER_MESSAGE_RENDERED') => {
            const floor = readFloor(id);
            if (alive && !blocked && floor?.isAi && floor.isLatest && floor.chatId === turnChat)
                invokeListener(eventKey, handler, [Number(id)]);
        };
        const offs = [
            on('GENERATION_STARTED', (type, params, dryRun) => {
                if (dryRun === true) return;
                if ((type === 'quiet' && !params?.quietToLoud) || type === 'impersonate' || isBackgroundGenerationActive()) {
                    ignoredDepth++;
                    return;
                }
                epoch++; blocked = false;
                active = true; turnChat = getChatId(); pending.clear();
            }),
            on('CHARACTER_MESSAGE_RENDERED', id => {
                const number = Number(id);
                if (id == null || blocked || ignoredDepth || !Number.isSafeInteger(number) || number < 0) return;
                if (active) pending.add(number);
                else { turnChat = getChatId(); deliver(number); }
            }),
            on('GENERATION_ENDED', id => {
                if (ignoredDepth) { ignoredDepth--; return; }
                if (!active) return;
                active = false;
                if (getChatId() !== turnChat) { pending.clear(); return; }
                const number = Number(id);
                if (id != null && Number.isSafeInteger(number) && number >= 0) pending.add(number);
                const chat = context()?.chat || [];
                for (let i = chat.length - 1; i >= 0; i--) {
                    if (chat[i]?.is_user) break;
                    if (chat[i] && !chat[i].is_system) { pending.add(i); break; }
                }
                const ready = [...pending]; pending.clear();
                const endedEpoch = epoch;
                queueMicrotask(() => { if (alive && !active && epoch === endedEpoch)
                    ready.forEach(id => deliver(id, 'GENERATION_ENDED')); });
            }),
            on('GENERATION_STOPPED', () => { epoch++; active = false; blocked = true; ignoredDepth = 0; pending.clear(); }),
            on('CHAT_CHANGED', () => { epoch++; active = false; blocked = true; ignoredDepth = 0; pending.clear(); turnChat = ''; }),
        ];
        return () => { alive = false; pending.clear(); offs.forEach(off => off()); };
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
        getChatId, getUserName, readCharacterLore, readCardWorldbook, readFloor, readPreviousAiTexts, writeFloor, on, onImageFloorReady, attachPromptStrip, ensureMarkerRegexes,
        destroy() {
            destroyed = true;
            clearBindingTimer();
            while (cleanups.length) cleanups.pop()();
        },
    };
}
