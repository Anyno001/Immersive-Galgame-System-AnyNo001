import { createCombatTables } from '../data/shujuku/combat-tables.js';
import { createCombatLedger } from '../combat/ledger.js';
import { createCombatSession } from '../combat/session.js';
import { ensureCombatReportRegex } from '../host/combat-report-regex.js';
import { normalizeCombatExpansionSettings } from '../visual/igs-ui/combat-settings.js';
import { normalizeAutoIllustrationSettings } from '../generated-images/illustration/auto-illustration-settings.js';
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';

// 卡牌战斗的宿主装配：按当前聊天创建会话，设置关闭时不创建任何对象、不注册正则。
// 换聊天时旧会话丢弃，新会话按本聊天的存档续战（resume）。聊天快照每次调用时从宿主重读。
export function createCombatServices(deps = {}) {
    const { global: globalObject = globalThis, storage, send, request } = deps;
    const readerSettings = () => (typeof deps.getReaderSettings === 'function' ? deps.getReaderSettings() : {}) || {};
    const settings = () => normalizeCombatExpansionSettings(readerSettings().combatExpansion);
    const chatId = () => String((typeof deps.getChatId === 'function' ? deps.getChatId() : '') || '');
    const chat = () => {
        const ctx = getSillyTavernContext(globalObject);
        return ctx && Array.isArray(ctx.chat) ? ctx.chat : [];
    };
    const userName = () => String((typeof deps.getUserName === 'function' ? deps.getUserName() : '') || '');
    const sourceFilter = () => (typeof deps.getSourceFilter === 'function' ? deps.getSourceFilter() : undefined);
    const llm = () => normalizeAutoIllustrationSettings(typeof deps.getAutoIllustration === 'function' ? deps.getAutoIllustration() : {}).llm;
    let tables = null;
    let ledger = null;
    let session = null;
    let sessionChat = null;
    let regexState = null;

    function ensureBase() {
        const api = globalObject.AutoCardUpdaterAPI || null;
        if (!tables || tables.api !== api) {
            tables = { api, impl: createCombatTables({ api }) };
            ledger = createCombatLedger({ tables: tables.impl, chat, userName, sourceFilter });
        }
        return tables.impl;
    }

    function getSession() {
        if (!settings().enabled) return null;
        const id = chatId();
        if (!id) return null;
        ensureBase();
        if (!session || sessionChat !== id) {
            sessionChat = id;
            session = createCombatSession({
                ledger, tables: tables.impl, request, send, storage, chat, getChatId: chatId, userName,
                llm, sourceFilter, now: () => Date.now(),
                difficulty: () => settings().difficulty, reportDetail: () => settings().reportDetail,
            });
            try { session.resume(); } catch (error) { /* 存档不可读时保持 idle，面板显示原因 */ }
        }
        return session;
    }

    function getLedger() {
        if (!settings().enabled) return null;
        ensureBase();
        return ledger;
    }

    // 建表只在用户于面板内确认后调用。
    function ensureTables() {
        if (!settings().enabled) return Promise.resolve({ ok: false, reason: 'combat-disabled' });
        return ensureBase().ensure({ confirmed: true });
    }

    // 战报折叠正则：扩展开启后注册一次（幂等）；关闭时保留已注册的正则，历史战报仍折叠。
    async function syncRegex() {
        if (!settings().enabled || regexState === 'ok' || regexState === 'pending') return regexState;
        regexState = 'pending';
        let r;
        try { r = await ensureCombatReportRegex(globalObject); } catch (error) { r = { ok: false, reason: 'regex-write-failed' }; }
        regexState = r.ok ? 'ok' : null;
        return r;
    }

    function resetChat() {
        session = null;
        sessionChat = null;
    }

    return { getSession, getLedger, ensureTables, syncRegex, resetChat, settings };
}
