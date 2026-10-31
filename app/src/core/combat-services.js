import { createCombatTables } from '../data/shujuku/combat-tables.js';
import { createInventoryTables } from '../data/shujuku/inventory-tables.js';
import { abilitiesForName, createCombatLedger, vitalsForName } from '../combat/ledger.js';
import { createCombatSession, locateCombatStart, partyStatus } from '../combat/session.js';
import { combatBodyText } from '../scene/combat-directives.js';
import { checkCorrections, checkRollPairsFor, floorCheckOrdinal, floorCheckSwipe, floorIndexOfOrdinal, replayChecks, upcomingCheckOrdinal, upcomingCheckSwipe } from '../scene/check-rolls.js';
import { classTierEntity, deckProfileEntities, generationWrites, growthEntity, profileRecord, resolveCombatLlm, respecClassEntity, traitEntity, withCharacterLore, withStoryContext } from '../combat/generation.js';
import { generateWithRetry } from '../combat/generation-retry.js';
import { normalizeProfile, profileIdFor } from '../combat/schema.js';
import { COMBAT_RULES } from '../combat/rules.js';
import { ASCEND_TIERS, REBUILD_COST, RESPEC_COST, TRAIT_DRAW_COST } from '../combat/points.js';
import { TRAIT_BASE_SLOTS, keptInnateKinds, nextTraitSlot, planTrait, traitFits, traitSeed } from '../combat/traits.js';
import { planTraitShape } from '../combat/trait-pool.js';
import { ABILITY_KEYS, parseCombatInit } from '../combat/abilities.js';
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
    // 角色设定参考（用户人设 / 角色卡）由宿主读取后注入生成实体；未注入时生成请求与旧版一致。
    const readLore = typeof deps.readLore === 'function' ? deps.readLore : undefined;
    // 剧情与世界书参考（最近剧情节选 + 原生扫描触发的世界书条目）由宿主读取后放进生成请求的 context；未注入时与旧版一致。
    const readStoryContext = typeof deps.readStoryContext === 'function' ? deps.readStoryContext : undefined;
    // 生成请求的自动重试间隔（毫秒）；未注入时用 COMBAT_GENERATION_RETRY_DELAYS。
    const retryDelays = Array.isArray(deps.retryDelays) ? deps.retryDelays : undefined;
    let tables = null;
    let ledger = null;
    let session = null;
    let sessionChat = null;
    let regexState = null;
    // 成长演出缓存：按聊天保存最近一次归并得到的成长事件与待生成项；阅读器同步渲染时只读这份缓存。
    let growthCache = null;
    let growthRun = null;
    const growthListeners = new Set();
    // 服务层诊断（最近 20 条）：正文主角团状态读不到时记下原因，不注入。
    const diagnostics = [];
    const noteDiag = (code, extra = {}) => {
        diagnostics.push({ code, at: Date.now(), ...extra });
        if (diagnostics.length > 20) diagnostics.shift();
    };

    // 战斗表数据（档案 / 日志 / 属性）以 shujuku 为唯一合法的本地数据源：读表发现缺表时直接补建后重读，不经界面确认，也不改用其他存储。
    // 同一聊天、同一数据库实例同一时刻只建一次；建表失败按聊天记住原因，之后的读取直接返回该原因、不反复导入模板，
    // 直到 ensureTables()（面板「重试」）、换聊天或数据库实例变化。数据库未载入当前聊天（combat-table-not-ready）或读表失败时
    // read 本身就是 ok:false，不建表、不记失败；没有聊天 ID 时不建表。补建了表时在后台预生成主角卡组。
    let tableFailure = null;
    let tableCreating = null;
    // 数据库未载入当前聊天、读表失败是暂时状态，不记成建表失败：载入后读表照常补建。
    const TRANSIENT_TABLE_REASONS = new Set(['combat-table-not-ready', 'combat-table-read-failed']);
    function createMissingTables(impl, key) {
        if (!tableCreating || tableCreating.impl !== impl || tableCreating.key !== key) {
            const run = { impl, key, promise: null };
            run.promise = Promise.resolve().then(() => impl.ensure())
                .catch(() => ({ ok: false, reason: 'combat-table-create-failed' }))
                .then((r) => {
                    if (tableCreating === run) tableCreating = null;
                    const live = tables?.impl === impl;
                    if (r?.ok !== true) { if (live && !TRANSIENT_TABLE_REASONS.has(r?.reason)) tableFailure = { key, reason: r?.reason || 'combat-table-create-failed' }; }
                    else if (r.created?.length && live && chatId() === key) prepareProtagonist();
                    return r;
                });
            tableCreating = run;
        }
        return tableCreating.promise;
    }
    const tableFailed = (read, reason) => (read.missing?.length ? { ok: false, reason, missing: read.missing } : read);
    function autoCreating(impl) {
        const wrapped = { ...impl, read };
        async function read() {
            const first = await impl.read();
            if (first?.ok !== true || !(first.missing?.length || first.optionalMissing?.length)) return first;
            const key = chatId();
            if (!key) return first;
            if (tableFailure && tableFailure.key === key) return tableFailed(first, tableFailure.reason);
            const made = await createMissingTables(wrapped, key);
            if (made?.ok !== true) return tableFailed(first, made?.reason || 'combat-table-create-failed');
            return impl.read();
        }
        return wrapped;
    }

    function ensureBase() {
        const api = globalObject.AutoCardUpdaterAPI || null;
        if (!tables || tables.api !== api) {
            const raw = createCombatTables({ api });
            // 物品表与装配表（P7b）：主角背包的唯一来源，与战斗表共用写入队列。
            const inventory = createInventoryTables({ api, serial: raw.serial });
            tables = { api, raw, impl: autoCreating(raw), inventory };
            // difficulty 只用于扫描剧情回血标签时记下当时的回血倍率（噩梦减半）。
            ledger = createCombatLedger({ tables: tables.impl, chat, userName, sourceFilter, difficulty: () => settings().difficulty, inventory });
            tableFailure = null;
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
                chatRecord: deps.chatRecord,
                llm, sourceFilter, readLore, readStoryContext, now: () => Date.now(),
                difficulty: () => settings().difficulty, reportDetail: () => settings().reportDetail,
                retryDelays, awaitProtagonist: () => (protagonistRun && protagonistRun.key === protagonistKey() ? protagonistRun.promise : null),
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

    // 生命与六维来源（合并计划 Q1 / Q4）：数值系统用，战斗扩展关闭时同样可用（只读写战斗日志与属性表，缺表按需补建）。
    // 读取同步取本聊天最近一次归并的缓存；refresh 串行执行，write 时先补扫生命条目（剧情受伤、速算伤势、回血）再归并。
    let lifeCache = null;
    let lifeQueue = Promise.resolve();
    function refreshLife({ write = false, messageIds, battleHurts, heroPrefs } = {}) {
        const run = lifeQueue.then(async () => {
            const id = chatId();
            if (!id) { lifeCache = null; return { ok: false, reason: 'combat-generate-unavailable' }; }
            ensureBase();
            const impl = ledger;
            let scan = null;
            if (write) {
                try { scan = await impl.scanLife({ messageIds, battleHurts, heroPrefs }); } catch (error) { scan = { ok: false, reason: 'combat-ledger-scan-failed' }; }
            }
            let state;
            try { state = await impl.effectiveState(); } catch (error) { state = { ok: false, reason: 'combat-ledger-read-failed' }; }
            if (chatId() !== id) return { ok: false, reason: 'request-stale' };
            lifeCache = { chatId: id, state };
            if (!state.ok) return { ok: false, reason: state.reason || 'combat-ledger-read-failed' };
            return scan && scan.ok !== true ? { ok: false, reason: scan.reason || 'combat-life-write-failed', scan } : { ok: true, scan };
        });
        lifeQueue = run.catch(() => {});
        return run;
    }

    // 同步读取口：缓存不属于当前聊天或归并失败时 ready 为 false，读取返回 null（调用方不得当作满血或默认属性落账）。
    function lifeSource() {
        const id = chatId();
        const state = lifeCache && lifeCache.chatId === id && lifeCache.state?.ok === true ? lifeCache.state : null;
        return {
            ready: Boolean(state),
            reason: state ? '' : (lifeCache && lifeCache.chatId === id ? lifeCache.state?.reason || 'combat-ledger-read-failed' : 'combat-life-cache-missing'),
            readAbilities: (name, opts) => (state ? abilitiesForName(state, name, userName(), opts) : null),
            readVitals: (name, opts) => (state ? vitalsForName(state, name, userName(), opts) : null),
            refresh: refreshLife,
        };
    }

    // 资料请求捕获聊天身份；解析器留在本地，模型只接收可选字段的值域。
    function captureCombatInit() {
        if (!settings().enabled || !chatId()) return null;
        const id = chatId(), api = globalObject.AutoCardUpdaterAPI;
        return {
            outputs: { roles: Object.keys(COMBAT_RULES.archetypes), abilities: [...ABILITY_KEYS] },
            parse: parseCombatInit,
            async write(name, raw, { signal, shouldStart } = {}) {
                const current = () => settings().enabled && chatId() === id && globalObject.AutoCardUpdaterAPI === api
                    && !signal?.aborted && (!shouldStart || shouldStart() === true);
                if (!current()) return { ok: false, reason: 'request-stale' };
                const result = await getLedger().writeInit(name, raw, { signal, shouldStart: current });
                if (result.ok && current()) await refreshGrowth();
                return result;
            },
        };
    }

    // 数值日志表读写口（合并计划 P4）：与战斗表共用同一个受控写入方（同一条 FIFO 队列、逐条读回核对），战斗扩展关闭时同样可用。
    // read 同步且不补建；ensure 只在本聊天要写数值时调用（缺表补建，与战斗读表触发的补建共用同一次在途导入）。宿主表接口不全时 ok:false。
    function statsTables() {
        ensureBase();
        const raw = tables.raw;
        const support = raw.probe();
        if (!support.ok) return { ok: false, reason: support.reason, missing: support.missing };
        return {
            ok: true,
            read: () => raw.read(),
            append: (records, options) => raw.append('stats', records, options),
            ensure: () => {
                const key = chatId();
                if (!key) return Promise.resolve({ ok: false, reason: 'stats-no-chat' });
                tableFailure = null;
                return createMissingTables(tables.impl, key);
            },
        };
    }

    // 面板「重试」：清掉上次建表失败的记忆后再补建一次（与读表触发的补建共用同一次在途导入）；补建了表时在后台预生成主角卡组。
    // 与读表触发的补建同一边界：没有聊天 ID 时不导入模板。
    async function ensureTables() {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const impl = ensureBase();
        const key = chatId();
        if (!key) return { ok: false, reason: 'combat-session-unavailable' };
        tableFailure = null;
        return createMissingTables(impl, key);
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
        lifeCache = null;
        tableFailure = null;
        stopProtagonist();
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
                // 同一次归并也刷新数值系统读取的生命 / 六维缓存（战报写入的伤势、回血随之可见）。
                lifeCache = { chatId: id, state };
                // 同一次归并的属性读取（检定徽记与骰序提示同步使用）；names 为已登记角色名，用于挑在场人物。
                // party：正文注入的主角团状态（主角 + 最近一场参战的队友，计划 5.8）；算不出时记原因，提示词不注入。
                let party = null;
                let partyReason = '';
                if (state.ok) {
                    try { party = partyStatus(state, userName()); } catch (error) { partyReason = 'combat-party-status-failed'; }
                }
                growthCache = state.ok
                    ? { chatId: id, ok: true, growth: state.growth || [], pending: scan.ok ? scan.pendingGeneration || [] : [],
                        names: [...state.characters.values()].map((c) => c.name).filter(Boolean),
                        readAbilities: (name) => abilitiesForName(state, name, userName()), party, ...(partyReason && { partyReason }) }
                    : { chatId: id, ok: false, reason: state.reason, growth: [], pending: [] };
                result = { ok: state.ok === true, scan, reason: state.reason };
                for (const fn of growthListeners) { try { fn(growthCache); } catch (error) { /* 订阅者异常不影响其他订阅者 */ } }
            } while (run.again);
            growthRun = null;
            return result;
        })();
        return run.promise;
    }

    // 生成开始时同步调用（计划 5.8）：返回主角团状态行；扩展关闭、代写 / 静默生成或没有可列的人时返回 null。
    // 成长缓存不可用（未刷新、换了聊天、账本读取失败）或状态算不出时不注入，记诊断。
    function partyPromptInput(generationType = null) {
        if (!settings().enabled || generationType === 'impersonate' || generationType === 'quiet') return null;
        const cache = getGrowth();
        if (!cache || cache.ok !== true || !Array.isArray(cache.party)) {
            noteDiag('combat-party-status-unavailable', { reason: cache?.partyReason || cache?.reason || 'combat-growth-cache-missing' });
            return null;
        }
        return cache.party.length ? cache.party : null;
    }

    function getGrowth() {
        if (!settings().enabled || !growthCache || growthCache.chatId !== chatId()) return null;
        return growthCache;
    }

    // 楼层判定复算（v3 §3.9）：messageId 为 chat 下标；body 缺省时按与账本同源的正文取。
    // 属性只读成长缓存里同一次归并；缓存不可用时返回 ok:false，不当作没有判定。
    function checkReplayFor(messageId, body) {
        if (!settings().enabled) return null;
        const id = chatId();
        const list = chat();
        const ordinal = floorCheckOrdinal(list, messageId);
        const rolls = ordinal ? checkRollPairsFor(id, ordinal, floorCheckSwipe(list, messageId)) : null;
        if (!rolls) return { ok: false, reason: 'check-floor-unavailable' };
        const cache = getGrowth();
        if (!cache || cache.ok !== true || typeof cache.readAbilities !== 'function') return { ok: false, reason: cache?.reason || 'check-abilities-unavailable' };
        const text = body == null ? combatBodyText(String(list[Number(messageId)]?.mes ?? ''), { sourceFilter: sourceFilter() }) : String(body);
        let replay;
        try { replay = replayChecks({ body: text, rolls, readAbilities: cache.readAbilities }); } catch (error) { return { ok: false, reason: 'check-replay-threw' }; }
        return { ok: true, chatId: id, messageId: Number(messageId), ordinal, rolls, ...replay };
    }

    // 生成开始时同步调用：本楼骰序、在场人物加值（主角 + 最近两层 AI 正文提到的已登记角色）与上一楼更正。
    // 代写、静默生成、没有聊天 ID 或扩展关闭时返回 null；属性缓存不可用时仍给骰序，只是不列加值、不出更正。
    function checkPromptInput(generationType = null) {
        if (!settings().enabled) return null;
        const id = chatId();
        const list = chat();
        const ordinal = upcomingCheckOrdinal(list, generationType);
        const rolls = ordinal ? checkRollPairsFor(id, ordinal, upcomingCheckSwipe(list, generationType)) : null;
        if (!rolls) return null;
        const cache = getGrowth();
        const read = cache && cache.ok === true && typeof cache.readAbilities === 'function' ? cache.readAbilities : null;
        const actors = [];
        let corrections = [];
        if (read) {
            const user = userName().trim();
            const recent = list.filter((m) => m && !m.is_user && !m.is_system).slice(-2).map((m) => String(m.mes ?? '')).join('\n');
            const names = [...new Set([user, ...(cache.names || []).filter((n) => n && n !== user && recent.includes(n))].filter(Boolean))];
            for (const name of names) {
                let attr = null;
                try { attr = read(name); } catch (error) { attr = null; }
                if (attr) actors.push({ name, attr });
            }
            const prevIndex = ordinal > 1 ? floorIndexOfOrdinal(list, ordinal - 1) : -1;
            const prev = prevIndex >= 0 ? checkReplayFor(prevIndex) : null;
            if (prev && prev.ok) corrections = checkCorrections(prev.results);
        }
        return { ordinal, rolls, actors, corrections };
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
        let requestFailed = false;
        if (entities.length) {
            if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
            const names = [userName(), ...entities.map((e) => state.characters.get(e.owner)?.name)].filter(Boolean);
            const context = await withStoryContext({ protagonist: userName() }, readStoryContext, { names, signal });
            if (signal?.aborted) return { ok: false, reason: 'request-stale' };
            const result = await generateWithRetry(entities, { request, llm: llm(), signal, classes: state.classes, now: Date.now(), context, retryDelays });
            if (result.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
            if (result.reason) return { ok: false, reason: result.reason, ...(result.missing ? { missing: result.missing } : {}) };
            const writes = generationWrites(result, { createdAt: Date.now() });
            profiles = writes.profiles;
            entries.push(...writes.entries);
            rejected = result.rejected;
            requestFailed = Boolean(result.requestFailure);
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
        return { ok: complete, written: entries.length, skipped, rejected, ...(complete ? {} : { reason: requestFailed ? 'combat-llm-request-failed' : 'combat-growth-incomplete' }) };
    }

    // 为角色生成卡组档案（设计 A2）：classRef 指向已登记职业时沿用其职业特性，请求里不含职业部分。
    // 已有卡组档案时拒绝；取消或迟到结果返回 request-stale，不落表；写入后经账本读回确认档案已生效。
    // 同一档案已有未核实的写入留在队列里时先补写，不重新生成，避免同一 档案ID|版本 出现两份不同内容。
    // 失败结果的 requested 表示是否已发出过生成请求（供预生成判断能否自动再试），对外接口不带该字段。
    async function generateDeck({ name, classRef = null, role = 'ally', signal, onStart, onRetry } = {}) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        const characterName = String(name || '').trim();
        if (!ledgerImpl || !characterName) return { ok: false, reason: 'combat-generate-unavailable' };
        if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
        const id = profileIdFor('deck-character', characterName);
        const base = ensureBase();
        if (typeof base.pending === 'function' && base.pending().some((p) => p.kind === 'profile' && String(p.key).startsWith(`${id}|`))) {
            const flushed = await base.flush();
            if (flushed?.ok !== true) return { ok: false, reason: 'combat-profile-write-pending', write: flushed };
        }
        const state = await ledgerImpl.effectiveState();
        if (!state.ok) return { ok: false, reason: state.reason };
        if (state.characters.get(id)?.kind === 'deck-character') return { ok: false, reason: 'combat-profile-exists', id };
        const ready = resolveCombatLlm(llm());
        if (!ready.ok) return { ok: false, reason: ready.reason, ...(ready.missing ? { missing: ready.missing } : {}) };
        const ref = classRef && state.classes.has(classRef) ? classRef : null;
        const entities = await withCharacterLore(deckProfileEntities({ name: characterName, id, role, classRef: ref, classes: state.classes }), readLore);
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        try { onStart?.(); } catch (error) { /* 订阅者异常不影响生成 */ }
        const context = await withStoryContext({ protagonist: userName() }, readStoryContext, { names: [characterName, userName()], signal });
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const result = await generateWithRetry(entities, {
            request, llm: llm(), signal, classes: state.classes, now: Date.now(), context, retryDelays, onRetry,
        });
        if (result.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
        if (result.reason) return { ok: false, reason: result.reason, ...(result.missing ? { missing: result.missing } : {}), requested: true };
        const writes = generationWrites(result, { createdAt: Date.now() });
        if (!writes.profiles.some((p) => p.id === id)) {
            return { ok: false, reason: result.requestFailure ? 'combat-llm-request-failed' : 'combat-deck-generation-failed', rejected: result.rejected, requested: true };
        }
        const written = await base.append('profile', writes.profiles);
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written, requested: true };
        const after = await ledgerImpl.effectiveState();
        if (!after.ok) return { ok: false, reason: after.reason, requested: true };
        if (after.characters.get(id)?.kind !== 'deck-character') return { ok: false, reason: 'combat-profile-unverified', id, requested: true };
        return { ok: true, id, reusedClass: Boolean(ref) };
    }

    // 构筑面板手动生成（队友角色）：对外结果不带内部的 requested 字段。
    async function generateDeckProfile({ name, classRef = null } = {}, { signal } = {}) {
        const r = await generateDeck({ name, classRef, role: 'ally', signal });
        if (r.ok || !Object.hasOwn(r, 'requested')) return r;
        const out = { ...r };
        delete out.requested;
        return out;
    }

    // 主角付费面板操作（重新生成 / 转职 / 升阶）的共同前置：扩展开启、账本有该写口、needLlm 时注入了副 LLM 请求、战斗不在进行中、主角为卡组角色。
    const PANEL_BUSY = Object.freeze(['preparing', 'battle', 'ended', 'send-failed']);
    async function heroPanelReady(method, kind, { needLlm = true } = {}) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        if (!ledgerImpl || typeof ledgerImpl[method] !== 'function') return { ok: false, reason: `combat-${kind}-unavailable` };
        if (needLlm && typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
        let status = '';
        try { status = getSession()?.state()?.status || ''; } catch (error) { status = ''; }
        if (PANEL_BUSY.includes(status)) return { ok: false, reason: 'combat-deck-readonly' };
        const state = await ledgerImpl.effectiveState();
        if (!state.ok) return { ok: false, reason: state.reason };
        const heroId = state.attributes?.heroId;
        const hero = heroId ? state.characters.get(heroId) : null;
        if (!hero) return { ok: false, reason: 'combat-points-not-protagonist' };
        if (hero.kind !== 'deck-character') return { ok: false, reason: `combat-${kind}-kind-mismatch` };
        return { ok: true, ledgerImpl, state, hero };
    }

    // 重新生成主角基础卡组（P-b）：职业不变，只请副 LLM 重生个人卡池与起始卡组（新卡 ID 带本次标记，不与旧卡相撞），
    // 经账本写一条 rebuild（锚定最新楼层、扣 REBUILD_COST，随楼层回退）。战斗进行中、非主角或积分不足时不发请求；生成失败或取消不写、不扣。
    async function regenerateDeck({ signal } = {}) {
        const gate = await heroPanelReady('rebuildDeck', 'rebuild');
        if (!gate.ok) return gate;
        const { ledgerImpl, state, hero } = gate;
        if ((hero.points || 0) < REBUILD_COST) return { ok: false, reason: 'combat-points-insufficient' };
        const ready = resolveCombatLlm(llm());
        if (!ready.ok) return { ok: false, reason: ready.reason, ...(ready.missing ? { missing: ready.missing } : {}) };
        const entities = await withCharacterLore(deckProfileEntities({ name: hero.name, id: hero.id, role: 'protagonist', classRef: hero.classRef, classes: state.classes }), readLore);
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const context = await withStoryContext({ protagonist: userName() }, readStoryContext, { names: [hero.name], signal });
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const result = await generateWithRetry(entities, { request, llm: llm(), signal, classes: state.classes, now: Date.now(), context, retryDelays });
        if (result.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
        if (result.reason) return { ok: false, reason: result.reason, ...(result.missing ? { missing: result.missing } : {}) };
        const made = (result.accepted || []).find((item) => item.profile?.id === hero.id)?.profile;
        if (!made?.personalPool || !made.starterDeck) return { ok: false, reason: result.requestFailure ? 'combat-llm-request-failed' : 'combat-deck-generation-failed' };
        const mark = `r${Date.now().toString(36)}`;
        const ids = new Map(made.personalPool.map((card) => [card.id, `${card.id}-${mark}`]));
        const deck = {
            personalPool: made.personalPool.map((card) => ({ ...card, id: ids.get(card.id) })),
            starterDeck: made.starterDeck.map((id) => ids.get(id) || id),
        };
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const written = await ledgerImpl.rebuildDeck(hero.id, deck);
        if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
        return { ok: true, id: hero.id, cost: REBUILD_COST };
    }

    // 转职（P-c）：花 RESPEC_COST 换到另一个职业，阶数回到一阶，已有卡牌保留。给 classRef（已登记职业）时不请求副 LLM；
    // 不给时按剧情请副 LLM 新生成职业（不得与已登记职业同名），档案写入后再经账本写一条 respec。respec 被拒（积分变化、档案未读回等）时不扣分，已写入的新职业留作可选职业。
    async function respecClass({ classRef = null, signal } = {}) {
        const gate = await heroPanelReady('respecClass', 'respec', { needLlm: !classRef });
        if (!gate.ok) return gate;
        const { ledgerImpl, state, hero } = gate;
        if ((hero.points || 0) < RESPEC_COST) return { ok: false, reason: 'combat-points-insufficient' };
        if (classRef) {
            if (!state.classes.has(classRef)) return { ok: false, reason: 'combat-class-missing' };
            if (classRef === hero.classRef) return { ok: false, reason: 'combat-respec-same-class' };
            const written = await ledgerImpl.respecClass(hero.id, classRef);
            if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
            return { ok: true, id: hero.id, classRef, cost: RESPEC_COST };
        }
        const ready = resolveCombatLlm(llm());
        if (!ready.ok) return { ok: false, reason: ready.reason, ...(ready.missing ? { missing: ready.missing } : {}) };
        const context = await withStoryContext({ protagonist: userName() }, readStoryContext, { names: [hero.name], signal });
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const result = await generateWithRetry([respecClassEntity({ id: hero.id, name: hero.name })], { request, llm: llm(), signal, classes: state.classes, now: Date.now(), context, retryDelays });
        if (result.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
        if (result.reason) return { ok: false, reason: result.reason, ...(result.missing ? { missing: result.missing } : {}) };
        const made = (result.accepted || []).find((item) => item.profile?.kind === 'class')?.profile;
        if (!made) return { ok: false, reason: result.requestFailure ? 'combat-llm-request-failed' : 'combat-class-generation-failed' };
        const written = await ensureBase().append('profile', [profileRecord(made, { createdAt: Date.now() })]);
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written };
        const entry = await ledgerImpl.respecClass(hero.id, made.id);
        if (entry?.ok !== true) return { ok: false, reason: entry?.reason || 'combat-ledger-insert-failed', classRef: made.id };
        return { ok: true, id: hero.id, classRef: made.id, cost: RESPEC_COST, created: true };
    }

    // 职业升阶（P-c）：主角逐阶升到二阶 / 三阶（ASCEND_TIERS：花费、等级门槛与追加卡稀有度）。请副 LLM 按世界观生成阶名与 3 张追加职业卡，
    // 经账本写一条 ascend（锚定最新楼层、扣该阶花费，随楼层回退）。已到三阶、等级不够或积分不足时不发请求；生成失败或取消不写、不扣。
    async function ascendClass({ signal } = {}) {
        const gate = await heroPanelReady('ascendClass', 'ascend');
        if (!gate.ok) return gate;
        const { ledgerImpl, state, hero } = gate;
        const tier = (hero.classTier || 1) + 1;
        const rule = ASCEND_TIERS[tier];
        if (!rule) return { ok: false, reason: 'combat-ascend-max' };
        if ((hero.level || 1) < rule.level) return { ok: false, reason: 'combat-ascend-level-unreached' };
        if ((hero.points || 0) < rule.cost) return { ok: false, reason: 'combat-points-insufficient' };
        if (!hero.classProfile) return { ok: false, reason: 'combat-class-missing' };
        const ready = resolveCombatLlm(llm());
        if (!ready.ok) return { ok: false, reason: ready.reason, ...(ready.missing ? { missing: ready.missing } : {}) };
        const context = await withStoryContext({ protagonist: userName() }, readStoryContext, { names: [hero.name], signal });
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const entity = classTierEntity({ character: hero, cls: hero.classProfile, tier, rarity: rule.rarity, tierName: hero.tierName, mark: Date.now().toString(36) });
        const result = await generateWithRetry([entity], { request, llm: llm(), signal, classes: state.classes, now: Date.now(), context, retryDelays });
        if (result.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
        if (result.reason) return { ok: false, reason: result.reason, ...(result.missing ? { missing: result.missing } : {}) };
        const made = (result.accepted || []).find((item) => item.kind === 'class-tier')?.tier;
        if (!made) return { ok: false, reason: result.requestFailure ? 'combat-llm-request-failed' : 'combat-ascend-generation-failed' };
        const written = await ledgerImpl.ascendClass(hero.id, made);
        if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
        return { ok: true, id: hero.id, tier, tierName: made.tierName, cost: rule.cost };
    }

    // 人物特性（P-d）：主角花 TRAIT_DRAW_COST 抽一个。稀有度按主角 ID 与已生效抽取次数确定（traits.js），楼层回退后再抽得到同一稀有度；
    // 请副 LLM 按人设、剧情与世界书起名、选被动模板、写来历，经账本写一条 trait（锚定最新楼层、扣分，随楼层回退）。有待定特性或积分不足时不发请求；生成失败或取消不写、不扣。
    async function drawTrait({ signal } = {}) {
        const gate = await heroPanelReady('drawTrait', 'trait');
        if (!gate.ok) return gate;
        const { ledgerImpl, state, hero } = gate;
        if (hero.pendingTrait) return { ok: false, reason: 'combat-trait-pending' };
        if ((hero.points || 0) < TRAIT_DRAW_COST) return { ok: false, reason: 'combat-points-insufficient' };
        const ready = resolveCombatLlm(llm());
        if (!ready.ok) return { ok: false, reason: ready.reason, ...(ready.missing ? { missing: ready.missing } : {}) };
        // 稀有度与效果都按同一种子确定（v4 特性池，主动与被动同池）：楼层回退后再抽得到同一个特性效果，模型只起名、写来历。
        const seed = traitSeed(hero.id, hero.traitDraws);
        const { rarity } = planTrait(seed);
        const shape = planTraitShape(seed, rarity);
        const traitId = `tr-${Date.now().toString(36)}`;
        // 已有的特性（保留着的固有人物技能与个人被动 + 抽到的）都给模型避重名。
        const kept = keptInnateKinds(hero);
        const innate = [kept.includes('active') ? hero.profile?.heroSkill : null, kept.includes('passive') ? hero.profile?.personalPassive : null].filter(Boolean);
        const entities = await withCharacterLore([traitEntity({ character: hero, rarity, traitId, shape, existing: [...innate, ...(hero.traits || [])] })], readLore);
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const context = await withStoryContext({ protagonist: userName() }, readStoryContext, { names: [hero.name], signal });
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const result = await generateWithRetry(entities, { request, llm: llm(), signal, classes: state.classes, now: Date.now(), context, retryDelays });
        if (result.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
        if (result.reason) return { ok: false, reason: result.reason, ...(result.missing ? { missing: result.missing } : {}) };
        const made = (result.accepted || []).find((item) => item.kind === 'trait')?.trait;
        if (!made) return { ok: false, reason: result.requestFailure ? 'combat-llm-request-failed' : 'combat-trait-generation-failed' };
        const written = await ledgerImpl.drawTrait(hero.id, made);
        if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
        const pending = made.kind ? !traitFits(hero, made.kind) : (hero.traits || []).length >= TRAIT_BASE_SLOTS;
        return { ok: true, id: hero.id, trait: made, pending, cost: TRAIT_DRAW_COST };
    }

    // 已满时的决定（P-d）：drop 为被替换的已装特性 ID（新特性装上）或新特性自己的 ID（放弃）；被 drop 的永久消失，积分不退。不请求副 LLM。
    async function pickTrait({ drop } = {}) {
        const gate = await heroPanelReady('pickTrait', 'trait', { needLlm: false });
        if (!gate.ok) return gate;
        const { ledgerImpl, hero } = gate;
        const pending = hero.pendingTrait;
        if (!pending) return { ok: false, reason: 'combat-trait-pick-invalid' };
        const written = await ledgerImpl.pickTrait(hero.id, pending.traitId, drop);
        if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
        return { ok: true, id: hero.id, traitId: pending.traitId, drop, discarded: drop === pending.traitId };
    }

    // 解锁特性槽（v4，助手 10-28）：主角花积分按顺序永久解锁第 3 / 4 / 5 槽（traits.js 的 TRAIT_SLOT_COSTS），经账本写一条 trait-slot（锚定最新楼层、扣分，随楼层回退）。不请求副 LLM。
    async function unlockTraitSlot() {
        const gate = await heroPanelReady('unlockTraitSlot', 'trait-slot', { needLlm: false });
        if (!gate.ok) return gate;
        const { ledgerImpl, hero } = gate;
        const next = nextTraitSlot(hero);
        if (!next) return { ok: false, reason: 'combat-trait-slot-invalid' };
        if ((hero.points || 0) < next.cost) return { ok: false, reason: 'combat-points-insufficient' };
        const written = await ledgerImpl.unlockTraitSlot(hero.id, next.slot);
        if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
        return { ok: true, id: hero.id, slot: next.slot, cost: next.cost };
    }

    // 主角卡组预生成：扩展开启、启动、换聊天与建表成功后，在后台为当前主角生成一次卡组档案，开战与构筑不必等待。
    // 只在战斗表已存在且主角还没有卡组档案时请求；缺表由读表自动补建，读表或建表失败记为 idle（不当作没有档案）。
    // 已发出请求后失败（重试 / 修正耗尽、写入未核实）不再自动重发，避免反复计费，由构筑面板「重试」手动触发；
    // 请求发出前就失败（如副 LLM 配置不完整）下次触发时自动重查。状态按 聊天ID + 主角名 记录，换聊天或关闭扩展时中止在途请求。
    let protagonist = { key: '', status: 'idle', reason: '', attempt: 0, requested: false };
    let protagonistRun = null;
    const protagonistListeners = new Set();
    const protagonistKey = () => {
        const id = chatId();
        const name = userName().trim();
        return id && name ? JSON.stringify([id, name]) : '';
    };

    // 面板读取：只返回当前聊天、当前主角的状态；扩展关闭或没有聊天时为 null。
    function getProtagonist() {
        const key = protagonistKey();
        if (!settings().enabled || !key || protagonist.key !== key) return null;
        return { status: protagonist.status, reason: protagonist.reason, attempt: protagonist.attempt };
    }

    function setProtagonist(next) {
        protagonist = { ...protagonist, ...next };
        const view = getProtagonist();
        for (const fn of protagonistListeners) { try { fn(view); } catch (error) { /* 订阅者异常不影响其他订阅者 */ } }
    }

    function onProtagonistUpdated(handler) {
        if (typeof handler !== 'function') return () => {};
        protagonistListeners.add(handler);
        return () => protagonistListeners.delete(handler);
    }

    function stopProtagonist() {
        const run = protagonistRun;
        protagonistRun = null;
        if (run) { try { run.controller?.abort(); } catch (error) { /* 已结束 */ } }
        if (protagonist.status === 'generating' || protagonist.status === 'retrying') setProtagonist({ status: 'idle', reason: '', attempt: 0 });
    }

    // 主角已有卡组档案：按名字或称呼匹配卡组角色（同名技能档案不算，卡组档案生成后会让它让位）。
    const hasProtagonistDeck = (state, name) => {
        for (const c of state.characters.values()) {
            if (c.kind === 'deck-character' && (c.name === name || (c.profile?.aliases || []).includes(name))) return true;
        }
        return false;
    };

    // manual 为构筑面板「重试」：不受「已请求失败不自动重发」限制。开战准备进行中时不另起请求，由会话自行生成。
    function prepareProtagonist({ manual = false } = {}) {
        if (!settings().enabled) { stopProtagonist(); return Promise.resolve({ ok: false, reason: 'combat-disabled' }); }
        const key = protagonistKey();
        if (!key) return Promise.resolve({ ok: false, reason: 'combat-generate-unavailable' });
        if (protagonistRun) {
            if (protagonistRun.key === key) return protagonistRun.promise;
            stopProtagonist();
        }
        const known = protagonist.key === key ? protagonist : null;
        if (known?.status === 'ready') return Promise.resolve({ ok: true, status: 'ready' });
        let busy = false;
        try { busy = Boolean(session && sessionChat === chatId() && session.state().status === 'preparing'); } catch (error) { busy = false; }
        if (busy) return Promise.resolve({ ok: false, reason: 'combat-busy' });
        const hold = !manual && known?.status === 'failed' && known.requested === true;
        const run = { key, controller: typeof AbortController === 'function' ? new AbortController() : null, promise: null };
        protagonistRun = run;
        const live = () => protagonistRun === run && protagonistKey() === key && settings().enabled;
        run.promise = (async () => {
            try {
                let state;
                try { state = await getLedger().effectiveState(); } catch (error) { state = { ok: false, reason: 'combat-ledger-read-failed' }; }
                if (!live()) return { ok: false, reason: 'request-stale' };
                if (!state?.ok) {
                    const reason = state?.reason || 'combat-ledger-read-failed';
                    if (!hold) setProtagonist({ key, status: 'idle', reason, attempt: 0, requested: false });
                    return { ok: false, reason };
                }
                if (hasProtagonistDeck(state, userName().trim())) {
                    setProtagonist({ key, status: 'ready', reason: '', attempt: 0, requested: false });
                    return { ok: true, status: 'ready' };
                }
                if (hold) return { ok: false, reason: known.reason, status: 'failed' };
                const r = await generateDeck({
                    name: userName().trim(), role: 'protagonist', signal: run.controller?.signal,
                    onStart: () => { if (live()) setProtagonist({ key, status: 'generating', reason: '', attempt: 0, requested: false }); },
                    onRetry: ({ attempt }) => { if (live()) setProtagonist({ key, status: 'retrying', attempt }); },
                });
                if (!live()) return { ok: false, reason: 'request-stale' };
                if (r.ok || r.reason === 'combat-profile-exists') {
                    setProtagonist({ key, status: 'ready', reason: '', attempt: 0, requested: false });
                    return { ok: true, status: 'ready' };
                }
                setProtagonist({ key, status: 'failed', reason: r.reason, attempt: 0, requested: r.requested === true });
                return { ok: false, reason: r.reason, status: 'failed' };
            } catch (error) {
                if (live()) setProtagonist({ key, status: 'failed', reason: 'combat-action-threw', attempt: 0, requested: true });
                return { ok: false, reason: 'combat-action-threw' };
            } finally {
                if (protagonistRun === run) protagonistRun = null;
            }
        })();
        return run.promise;
    }

    // 技能角色强度档：追加同 ID 的新版本档案（档案表按 档案ID|版本 去重，读取时取最高版本），写后经账本读回确认。
    async function setAllyTier(id, tier) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        if (!Object.hasOwn(COMBAT_RULES.allyTiers, tier)) return { ok: false, reason: 'combat-tier-invalid' };
        const ledgerImpl = getLedger();
        const base = ensureBase();
        let read;
        try { read = await base.read(); } catch (error) { read = { ok: false, reason: 'combat-ledger-read-failed' }; }
        if (!read?.ok) return { ok: false, reason: read?.reason || 'combat-ledger-read-failed' };
        let latest = null;
        for (const rec of read.profile || []) {
            if (rec?.id !== id) continue;
            const v = Number.isInteger(rec.version) ? rec.version : 0;
            if (!latest || v > latest.version) latest = { version: v, rec };
        }
        const n = latest ? normalizeProfile(latest.rec.definition) : null;
        if (!n?.ok || n.value.kind !== 'skill-character') return { ok: false, reason: 'combat-character-missing' };
        if ((n.value.tier ?? COMBAT_RULES.defaultAllyTier) === tier) return { ok: true, id, tier, unchanged: true };
        const next = normalizeProfile({ ...n.value, tier });
        if (!next.ok) return { ok: false, reason: 'combat-profile-invalid' };
        const written = await base.append('profile', [profileRecord(next.value, { version: latest.version + 1, createdAt: Date.now() })]);
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written };
        const after = await ledgerImpl.effectiveState();
        if (!after.ok) return { ok: false, reason: after.reason };
        if (after.characters.get(id)?.profile?.tier !== tier) return { ok: false, reason: 'combat-profile-unverified', id };
        return { ok: true, id, tier };
    }

    // 后台自动准备：主生成结束后的最新 AI 楼（宿主经 onImageFloorReady 给出）正文末尾有开战标签时直接开始准备，不等面板打开。
    // 会话正在准备、对局中、待结算或待回传时不打断；同一场已到战前、阻断、已回传或已跳过时不重跑（阻断后的重试由面板手动触发，避免反复计费）。
    const AUTO_PREPARE_BUSY = Object.freeze(['preparing', 'battle', 'ended', 'send-failed']);
    const AUTO_PREPARE_SETTLED = Object.freeze(['lobby', 'blocked', 'done', 'skipped']);
    function autoPrepare(messageId) {
        const s = getSession();
        if (!s) return Promise.resolve({ ok: false, reason: 'combat-disabled' });
        const id = Number(messageId);
        if (!Number.isSafeInteger(id) || id < 0) return Promise.resolve({ ok: false, reason: 'combat-floor-missing' });
        let found;
        let st;
        try { found = locateCombatStart(chat(), id, sourceFilter()); st = s.state(); } catch (error) { return Promise.resolve({ ok: false, reason: 'combat-action-threw' }); }
        if (!found.ok) return Promise.resolve({ ok: false, reason: found.reason });
        if (AUTO_PREPARE_BUSY.includes(st.status)) return Promise.resolve({ ok: false, reason: 'combat-busy' });
        if (st.combatId === found.combatId && AUTO_PREPARE_SETTLED.includes(st.status)) return Promise.resolve({ ok: true, unchanged: true, session: st });
        let run;
        try { run = s.prepare(id); } catch (error) { return Promise.resolve({ ok: false, reason: 'combat-action-threw' }); }
        return Promise.resolve(run).catch(() => ({ ok: false, reason: 'combat-action-threw' }));
    }

    return { getSession, getLedger, ensureTables, statsTables, syncRegex, resetChat, settings, generateDeckProfile, regenerateDeck, respecClass, ascendClass, drawTrait, pickTrait, unlockTraitSlot, refreshGrowth, getGrowth, onGrowthUpdated, retryGrowth, setAllyTier, lifeSource, refreshLife,
        prepareProtagonist, getProtagonist, onProtagonistUpdated, autoPrepare, checkReplayFor, checkPromptInput, partyPromptInput, getDiagnostics: () => diagnostics.map((d) => ({ ...d })), captureCombatInit };
}
