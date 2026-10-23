import { createCombatTables } from '../data/shujuku/combat-tables.js';
import { createCombatLedger } from '../combat/ledger.js';
import { createCombatSession } from '../combat/session.js';
import { deckProfileEntities, generateEntities, generationWrites, growthEntity } from '../combat/generation.js';
import { profileIdFor } from '../combat/schema.js';
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
    // 成长演出缓存：按聊天保存最近一次归并得到的成长事件与待生成项；阅读器同步渲染时只读这份缓存。
    let growthCache = null;
    let growthRun = null;
    const growthListeners = new Set();

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
        growthCache = null;
    }

    // 补扫入库后刷新缓存：扫描按记录 ID 幂等；读表失败或缺表时不写、不清旧缓存以外的状态，缓存标记为不可用。
    // 同一时刻只跑一次，进行中再次触发时排在它之后补跑一次。
    async function refreshGrowth() {
        if (!settings().enabled) { growthCache = null; return { ok: false, reason: 'combat-disabled' }; }
        if (growthRun) { growthRun.again = true; return growthRun.promise; }
        const run = { again: false };
        growthRun = run;
        run.promise = (async () => {
            let result;
            do {
                run.again = false;
                const id = chatId();
                const ledgerImpl = getLedger();
                if (!ledgerImpl || !id) { result = { ok: false, reason: 'combat-generate-unavailable' }; break; }
                let scan;
                try { scan = await ledgerImpl.scan(); } catch (error) { scan = { ok: false, reason: 'combat-ledger-scan-failed' }; }
                let state;
                try { state = await ledgerImpl.effectiveState(); } catch (error) { state = { ok: false, reason: 'combat-ledger-read-failed' }; }
                if (chatId() !== id) { result = { ok: false, reason: 'request-stale' }; continue; }
                growthCache = state.ok
                    ? { chatId: id, ok: true, growth: state.growth || [], pending: scan.ok ? scan.pendingGeneration || [] : [] }
                    : { chatId: id, ok: false, reason: state.reason, growth: [], pending: [] };
                result = { ok: state.ok === true, scan, reason: state.reason };
                for (const fn of growthListeners) { try { fn(growthCache); } catch (error) { /* 订阅者异常不影响其他订阅者 */ } }
            } while (run.again);
            growthRun = null;
            return result;
        })();
        return run.promise;
    }

    function getGrowth() {
        if (!settings().enabled || !growthCache || growthCache.chatId !== chatId()) return null;
        return growthCache;
    }

    function onGrowthUpdated(handler) {
        if (typeof handler !== 'function') return () => {};
        growthListeners.add(handler);
        return () => growthListeners.delete(handler);
    }

    // 待整理的成长标签（learn / upgrade / class）重新扫描后交副 LLM 生成并落账；职业已登记的 class 标签直接落账。
    // 角色尚无档案的项跳过并计入 skipped；取消返回 request-stale，不落账；写入后刷新成长缓存。
    async function retryGrowth({ signal } = {}) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        if (!ledgerImpl) return { ok: false, reason: 'combat-generate-unavailable' };
        const scan = await ledgerImpl.scan();
        if (!scan.ok) return { ok: false, reason: scan.reason || 'combat-ledger-scan-failed' };
        const state = await ledgerImpl.effectiveState();
        if (!state.ok) return { ok: false, reason: state.reason };
        const entities = [];
        const entries = [];
        let skipped = 0;
        for (const p of scan.pendingGeneration || []) {
            const character = p.characterId ? state.characters.get(p.characterId) : null;
            const g = growthEntity(p, character, { classes: state.classes, now: Date.now() });
            if (g.entry) entries.push(g.entry);
            else if (g.entity) entities.push(g.entity);
            else skipped += 1;
        }
        let profiles = [];
        let rejected = [];
        if (entities.length) {
            if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
            const result = await generateEntities(entities, { request, llm: llm(), signal, classes: state.classes, now: Date.now(), context: { protagonist: userName() } });
            if (result.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
            if (result.reason) return { ok: false, reason: result.reason, ...(result.missing ? { missing: result.missing } : {}) };
            const writes = generationWrites(result, { createdAt: Date.now() });
            profiles = writes.profiles;
            entries.push(...writes.entries);
            rejected = result.rejected;
        }
        if (profiles.length) {
            const written = await ensureBase().append('profile', profiles);
            if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written };
        }
        if (entries.length) {
            const written = await ledgerImpl.append(entries);
            if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed', write: written };
        }
        await refreshGrowth();
        const complete = rejected.length === 0 && skipped === 0;
        return { ok: complete, written: entries.length, skipped, rejected, ...(complete ? {} : { reason: 'combat-growth-incomplete' }) };
    }

    // 手动为角色生成卡组档案（设计 A2）：classRef 指向已登记职业时沿用其职业特性，请求里不含职业部分。
    // 已有卡组档案时拒绝；取消或迟到结果返回 request-stale，不落表；写入后经账本读回确认档案已生效。
    async function generateDeckProfile({ name, classRef = null } = {}, { signal } = {}) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        const characterName = String(name || '').trim();
        if (!ledgerImpl || !characterName) return { ok: false, reason: 'combat-generate-unavailable' };
        if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
        const state = await ledgerImpl.effectiveState();
        if (!state.ok) return { ok: false, reason: state.reason };
        const id = profileIdFor('deck-character', characterName);
        if (state.characters.get(id)?.kind === 'deck-character') return { ok: false, reason: 'combat-profile-exists', id };
        const ref = classRef && state.classes.has(classRef) ? classRef : null;
        const entities = deckProfileEntities({ name: characterName, id, role: 'ally', classRef: ref, classes: state.classes });
        const result = await generateEntities(entities, {
            request, llm: llm(), signal, classes: state.classes, now: Date.now(), context: { protagonist: userName() },
        });
        if (result.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
        if (result.reason) return { ok: false, reason: result.reason, ...(result.missing ? { missing: result.missing } : {}) };
        const writes = generationWrites(result, { createdAt: Date.now() });
        if (!writes.profiles.some((p) => p.id === id)) return { ok: false, reason: 'combat-deck-generation-failed', rejected: result.rejected };
        const written = await ensureBase().append('profile', writes.profiles);
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written };
        const after = await ledgerImpl.effectiveState();
        if (!after.ok) return { ok: false, reason: after.reason };
        if (after.characters.get(id)?.kind !== 'deck-character') return { ok: false, reason: 'combat-profile-unverified', id };
        return { ok: true, id, reusedClass: Boolean(ref) };
    }

    return { getSession, getLedger, ensureTables, syncRegex, resetChat, settings, generateDeckProfile, refreshGrowth, getGrowth, onGrowthUpdated, retryGrowth };
}
