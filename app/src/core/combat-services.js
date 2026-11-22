// 战斗服务装配：把战斗表、背包表、账本、会话、成长生成、主角档案、检定回放等装配成一组可注入的服务。
// 阅读器与设置页只通过这里取服务；总开关（combatExpansion.enabled）关闭时各入口返回 combat-disabled，不碰表。
// 性能约定（相对 v0.39）：
//   - 战斗表与背包表共用同一个带缓存的表客户端（createCachedTableClient），api 变化时重建并 dispose 旧客户端；
//   - refreshLife / refreshGrowth 连续触发合并成一次执行，只读场景在表版本与楼层未变时直接用缓存；
//   - 成长监听者只在有效状态签名变化时才被通知（内部缓存照常更新）；
//   - 同一事件内账本有效状态只取一次并传递。
import { createCachedTableClient, createCombatTables } from '../data/shujuku/combat-tables.js';
import { createTableReadiness } from '../data/shujuku/table-readiness.js';
import { createOriginStore } from '../data/shujuku/origin-store.js';
import { createPointsStore } from '../data/shujuku/points-store.js';
import { GAME_IDS, newPointsId, pointFloors, pointsFloorId, pointsSwipe } from '../scene/points/points-policy.js';
import { createPointsEngine } from '../scene/points/points-engine.js';
import { createGamePointsRound } from '../scene/points/game-points-round.js';
import { createMahjongPointsRound } from '../scene/points/mahjong-points-round.js';
import { createPointsIntents } from '../storage/points-intents.js';
import { createCombatContentIntents } from '../storage/combat-content-intents.js';
import { createCombatMaterialContext } from './combat-material-context.js';
import { createInventoryTables } from '../data/shujuku/inventory-tables.js';
import { PROTAGONIST_ALIASES, abilitiesForName, createCombatLedger, grantGeneratedGear, signaturePending, upgradableRows, vitalsForName } from '../combat/ledger.js';
import { createCombatSession, locateCombatStart, partyStatus } from '../combat/session.js';
import { combatBodyText } from '../scene/combat-directives.js';
import { withFloorNote } from '../combat/floor-note.js';
import {
    checkCorrections, checkRollPairsFor, floorCheckOrdinal, floorCheckSwipe, floorIndexOfOrdinal, replayChecks, upcomingCheckOrdinal, upcomingCheckSwipe,
} from '../scene/check-rolls.js';
import {
    classTierEntity, deckProfileEntities, drawCardEntity, generationWrites, growthEntity, profileGearEntity, profileRecord, resolveCombatLlm, respecClassEntity, traitEntity,
    withCharacterLore, withStoryContext,
} from '../combat/generation.js';
import { generateWithRetry } from '../combat/generation-retry.js';
import { itemIdFor, normalizeProfile, profileIdFor } from '../combat/schema.js';
import { COMBAT_RULES } from '../combat/rules.js';
import { equippedGear } from '../combat/gear-slots.js';
import { ASCEND_TIERS, CARD_DRAW_COST, REBUILD_COST, RESPEC_COST, TRAIT_DRAW_COST } from '../combat/points.js';
import { ownedRelicIds, planCardDraw } from '../combat/rewards.js';
import { planTraitRelic } from '../combat/relics/draw.js';
import { fixedCard } from '../combat/fixed-cards/index.js';
import { TRAIT_BASE_SLOTS, keptInnateKinds, nextTraitSlot, planTrait, planTraitLink, traitFits, traitSeed } from '../combat/traits.js';
import { planTraitShape } from '../combat/trait-pool.js';
import { ABILITY_KEYS, parseCombatInit, wantsAutoInit } from '../combat/abilities.js';
import { ensureChallengeReportRegex, ensureCombatReportRegex } from '../host/combat-report-regex.js';
import { challengeQuota } from '../scene/challenge-directives.js';
import { deriveChallengeHistory } from '../combat/challenge-history.js';
import { chatForCooldown, floorsSinceCombatStart } from '../scene/combat-prompt.js';
import { combatBattleOn, dailyChallengeOn, normalizeCombatExpansionSettings } from '../visual/igs-ui/combat-settings.js';
import { INTIMATE_FOUGHT_KEY, fallbackMechanic, getIntimateGate, intimateOn, readFoughtKeys, resolveIntimateGate } from '../scene/intimate-duel.js';
import { normalizeAutoIllustrationSettings } from '../generated-images/illustration/auto-illustration-settings.js';
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';
import { createCombatTraitSeed } from '../host/combat-trait-seed.js';
import { createModelRouteIdentity } from '../host/model-route-identity.js';
import { hash32 } from '../combat/random.js';
import { createGenerationTasks } from '../host/generation-tasks.js';

// 建表失败里「表还没就绪/读失败」属于暂时性原因，不记成该聊天的建表失败
const TRANSIENT_TABLE_REASONS = new Set(['combat-table-not-ready', 'combat-table-read-failed']);
// 会话处于这些状态时牌组/装备只读
const BUSY_STATUSES = Object.freeze(['preparing', 'battle', 'ended', 'send-failed']);
// 自动备战要避让的会话状态 / 已有结果的状态
const PREPARE_BUSY_STATUSES = Object.freeze(['preparing', 'battle', 'ended', 'send-failed']);
const PREPARE_DONE_STATUSES = Object.freeze(['lobby', 'blocked', 'done', 'skipped']);
// 生命缓存（只读场景复用）的兜底有效期，防止楼层被外部改动却签名不变
const LIFE_CACHE_TTL_MS = 10000;
const DIAGNOSTICS_MAX = 20;

// 楼层签名：楼数 + 每层（是否用户楼、swipe、正文长度）的滚动哈希，用来判断楼层有没有变
function chatSignature(chat) {
    let hash = 2166136261;
    for (const message of chat) {
        const swipe = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
        const length = String(message?.mes ?? '').length;
        hash = Math.imul(hash ^ ((message?.is_user ? 1 : 0) + swipe * 2 + length * 64), 16777619) >>> 0;
        const floorId = pointsFloorId(message);
        for (let at = 0; at < floorId.length; at += 1) hash = Math.imul(hash ^ floorId.charCodeAt(at), 16777619) >>> 0;
        if (message?.is_system) hash = Math.imul(hash ^ 31, 16777619) >>> 0;
    }
    return `${chat.length}:${hash}`;
}

// 状态签名：Map/Set 转成可序列化形态；序列化失败返回唯一值（视为一定变化）
let signatureFallback = 0;
function stableStringify(value) {
    try {
        return JSON.stringify(value, (key, inner) => {
            if (inner instanceof Map) return [...inner];
            if (inner instanceof Set) return [...inner];
            if (typeof inner === 'function') return undefined;
            return inner;
        });
    } catch {
        signatureFallback += 1;
        return `unserializable-${signatureFallback}`;
    }
}

export function createCombatServices(options = {}) {
    const { global = globalThis, storage, send, request } = options;
    const readerSettings = () => (typeof options.getReaderSettings === 'function' ? options.getReaderSettings() : {}) || {};
    const settings = () => normalizeCombatExpansionSettings(readerSettings().combatExpansion);
    // 当前对决类型认的标签：战斗与日常挑战各自独立，缺省只认战斗。
    const kinds = () => ({ combat: combatBattleOn(settings()), challenge: dailyChallengeOn(settings()), intimate: intimatePrepared() ? intimateGate : null });
    const autoIllustration = () => (typeof options.getAutoIllustration === 'function' ? options.getAutoIllustration() : {}) || {};
    const intimatePrepared = () => settings().enabled && intimateOn(readerSettings(), autoIllustration());
    const chatMetadataOf = () => { const context = getSillyTavernContext(global); return context && context.chatMetadata && typeof context.chatMetadata === 'object' ? { context, metadata: context.chatMetadata } : null; };
    function intimateGate(messageId) {
        const stored = getIntimateGate(getChatId(), messageId) || {};
        let snapshot = null;
        try { snapshot = typeof options.getChallengeSnapshot === 'function' ? options.getChallengeSnapshot() : null; } catch { snapshot = null; }
        const favor = Number(snapshot?.favors?.[stored.partner]) || 0;
        const trust = Number(snapshot?.trusts?.[stored.partner]) || 0;
        const grudge = Number(snapshot?.grudges?.[stored.partner]) || 0;
        const held = chatMetadataOf();
        const fought = stored.eventKey != null && readFoughtKeys(held && held.metadata).includes(String(stored.eventKey));
        const gate = { on: true, ageBlocked: stored.ageBlocked === true, newRise: stored.newRise === true, fought, eventKey: stored.eventKey ?? null, partner: stored.partner || '', favor, trust, grudge };
        return { ...gate, mechanic: fallbackMechanic(gate), launch: stored.launch === true && resolveIntimateGate(gate).ok };
    }
    function markIntimate(eventKey) {
        const held = chatMetadataOf();
        if (!held || eventKey == null) return;
        const list = readFoughtKeys(held.metadata);
        if (list.includes(String(eventKey))) return;
        held.metadata[INTIMATE_FOUGHT_KEY] = [...list, String(eventKey)].slice(-200);
        if (typeof held.context.saveMetadata === 'function') Promise.resolve(held.context.saveMetadata()).catch(() => null);
    }
    const getChatId = () => String((typeof options.getChatId === 'function' ? options.getChatId() : '') || '');
    const traitSeeds = createCombatTraitSeed(global, getChatId);
    const traitsOf = (name) => { try { return typeof options.traitNamesOf === 'function' ? options.traitNamesOf(name) : null; } catch { return null; } };
    let traitEpoch = 0;
    let traitDrawTask = null;
    const getChat = () => {
        const context = getSillyTavernContext(global);
        return context && Array.isArray(context.chat) ? context.chat : [];
    };
    const getUserName = () => String((typeof options.getUserName === 'function' ? options.getUserName() : '') || '');
    const getSourceFilter = () => (typeof options.getSourceFilter === 'function' ? options.getSourceFilter() : undefined);
    const getLlm = () => normalizeAutoIllustrationSettings(typeof options.getAutoIllustration === 'function' ? options.getAutoIllustration() : {}).llm;
    const readLore = typeof options.readLore === 'function' ? options.readLore : undefined;
    const materialContext = createCombatMaterialContext({ read: options.readGenerationMaterials, getChatId, getUserName });
    const readStoryContext = typeof options.readStoryContext === 'function' ? options.readStoryContext : undefined;
    const retryDelays = Array.isArray(options.retryDelays) ? options.retryDelays : undefined;
    const generationMaxRounds = Number.isInteger(options.generationMaxRounds) && options.generationMaxRounds >= 0 ? options.generationMaxRounds : undefined;
    const getBuildMode = () => {
        try {
            return (typeof options.buildMode === 'function' && options.buildMode()) || null;
        } catch {
            return null;
        }
    };
    const protagonistBuildPolicy = () => {
        if (typeof options.buildMode !== 'function') return { ready: true, mode: 'auto', choices: {} };
        const policy = getBuildMode();
        if (!policy || policy.ready === false || (policy.chatId && policy.chatId !== getChatId())) {
            return { ready: false, reason: policy?.reason || 'stats-build-policy-waiting' };
        }
        const mode = policy.mode;
        return ['auto', 'manual', 'relative'].includes(mode)
            ? { ready: true, mode, choices: policy.choices || {} }
            : { ready: false, reason: 'stats-build-mode-invalid' };
    };

    // ---- 统计（便于测试与诊断） ----
    const counters = {
        refreshLifeRuns: 0, refreshLifeCacheHits: 0, refreshLifeCoalesced: 0,
        refreshGrowthRuns: 0, refreshGrowthCoalesced: 0, refreshGrowthRerunSkipped: 0,
        notifies: 0, notifiesSuppressed: 0,
        retiredExports: 0, retiredSessionWrites: 0,
    };

    let bundle = null; // { api, client, raw, impl, inventory, generation }
    let bundleGeneration = 0;
    let chatEpoch = 0;
    let disposed = false;
    let ledger = null;
    let session = null;
    let sessionChatId = null;
    // 恢复时聊天还没载入到战斗楼：记下当时的楼数，楼数变了再恢复一次。
    let resumeWaitLength = -1;
    let regexState = null; // null / 'pending' / 'ok'
    let growthCache = null; // 成长缓存（getGrowth 读取）
    let growthRun = null; // 正在进行的成长刷新
    let growthSnapshot = null; // 最近一次成长刷新的 { key, at, scan, state }，供自动成长复用
    const growthListeners = new Map(); // 监听者 -> 它最近收到的状态签名
    const diagnostics = [];
    const modelRoute = createModelRouteIdentity({
        getContext: () => getSillyTavernContext(global),
        readConfig: () => ({ llm: getLlm(), combat: settings() }),
        owner: () => global.AutoCardUpdaterAPI || null,
    });
    function captureGenerationLease({ signal, shouldStart, requireApi = true } = {}) {
        getTables();
        const owner = bundle, epoch = chatEpoch, chatId = getChatId(), route = modelRoute.get();
        const floors = getChat();
        const prefix = floors.map(message => [message, message?.mes, message?.swipe_id]);
        let active = !!chatId && (!requireApi || !!owner?.api) && !!route;
        return () => {
            try {
                active = active && !disposed && !signal?.aborted && settings().enabled && epoch === chatEpoch
                    && getChatId() === chatId && bundle === owner && owner.api === (global.AutoCardUpdaterAPI || null)
                    && (!options.chatStore || options.chatStore.get() === owner.shared) && modelRoute.get() === route
                    && getChat() === floors && prefix.every(([message, text, swipe], index) =>
                        floors[index] === message && message?.mes === text && message?.swipe_id === swipe)
                    && (!shouldStart || shouldStart() === true);
            } catch { active = false; }
            return active;
        };
    }
    const generationTasks = createGenerationTasks({ capture: () => captureGenerationLease() });
    function runGeneration(key, args, run) {
        if (disposed) return Promise.resolve({ ok: false, reason: 'request-stale' });
        if (!settings().enabled) return Promise.resolve({ ok: false, reason: 'combat-disabled' });
        return generationTasks.start(key, job => {
            job.guard(() => !args.signal?.aborted && (!args.shouldStart || args.shouldStart() === true));
            const abort = () => job.controller.abort();
            args.signal?.addEventListener?.('abort', abort, { once: true });
            job.onFinish(() => args.signal?.removeEventListener?.('abort', abort));
            return run({ ...args, signal: job.signal, shouldStart: job.alive });
        });
    }
    const pushDiagnostic = (code, extra = {}) => {
        diagnostics.push({ code, at: Date.now(), ...extra });
        if (diagnostics.length > DIAGNOSTICS_MAX) diagnostics.shift();
    };

    // ---- 建表（缺表时按模板补建；同聊天同表只建一次，失败记住不反复重试） ----
    let ensureFailure = null; // { key, reason }
    let ensureTask = null; // { impl, key, promise }

    function ensureOnce(impl, chatKey) {
        if (!ensureTask || ensureTask.impl !== impl || ensureTask.key !== chatKey) {
            const task = { impl, key: chatKey, promise: null };
            const alive = () => !disposed && ensureTask === task && bundle?.impl === impl
                && bundle.api === (global.AutoCardUpdaterAPI || null) && getChatId() === chatKey && settings().enabled;
            task.promise = Promise.resolve().then(() => impl.ensure({ shouldStart: alive })).catch(() => ({ ok: false, reason: 'combat-table-create-failed' })).then((result) => {
                const stillCurrent = alive();
                if (ensureTask === task) ensureTask = null;
                if (!stillCurrent) return { ok: false, reason: 'request-stale' };
                if (result?.ok !== true) {
                    if (result?.reason !== 'request-stale' && !TRANSIENT_TABLE_REASONS.has(result?.reason)) ensureFailure = { key: chatKey, reason: result?.reason || 'combat-table-create-failed' };
                } else if (result.created?.length) {
                    prepareProtagonist();
                }
                return result;
            });
            ensureTask = task;
        }
        return ensureTask.promise;
    }

    const withMissing = (read, reason) => (read.missing?.length ? { ok: false, reason, missing: read.missing } : read);

    // 包一层：读到缺表时先补建再重读
    function wrapTables(raw) {
        const wrapped = { ...raw, read: readWithEnsure };
        async function readWithEnsure(readOptions) {
            if (readOptions?.recoveryRecords?.length) return raw.read(readOptions);
            const read = await raw.read();
            if (read?.ok !== true || !(read.layoutPending || read.missing?.length || read.optionalMissing?.length)) return read;
            const chatKey = getChatId();
            if (!chatKey) return read;
            if (ensureFailure && ensureFailure.key === chatKey) return withMissing(read, ensureFailure.reason);
            const ensured = await ensureOnce(wrapped, chatKey);
            return ensured?.ok !== true ? withMissing(read, ensured?.reason || 'combat-table-create-failed') : raw.read();
        }
        return wrapped;
    }

    // 把旧装配的统计并入累计值并释放缓存客户端
    function retireBundle(old) {
        if (!old) return;
        stopProtagonistTableWatch(old);
        counters.retiredExports += old.client.stats.exports;
        if (!old.shared) {
            old.readiness?.dispose();
            try { old.client.dispose(); } catch { /* */ }
        }
    }

    const sharedPoints = {
        isV2: () => bundle?.shared?.layout?.()?.layout === 'v2',
        readBalanceSync: () => {
            if (!bundle?.shared) return null;
            const layout = bundle.shared.layout();
            if (!layout?.ok) return { ok: false, reason: layout?.reason || 'points-read-failed' };
            if (layout.layout !== 'v2') return null;
            const held = points().pending();
            if (!held.ok) return held;
            const read = bundle.points.read();
            if (!read.ok) {
                if (read.reason === 'points-table-missing') return { ok: true, balance: 0, mode: 'shared' };
                return read;
            }
            return { ok: true, balance: read.balance, mode: 'shared' };
        },
        balance: () => readSharedPoints(),
        ensure: () => points().ensure(),
        credit: (args) => points().credit(args),
        spend: (args) => points().spend(args),
        recoverOperation: (sourceId, opts) => points().recoverOperation(sourceId, opts),
    };

    // 取战斗表实现；宿主 api 变了就整套重建（共用同一个缓存客户端）
    function getTables() {
        const api = global.AutoCardUpdaterAPI || null;
        const shared = options.chatStore?.get();
        if (!bundle || bundle.api !== api || bundle.shared !== shared) {
            retireBundle(bundle);
            const client = shared?.client || createCachedTableClient({ api });
            const raw = shared?.raw || createCombatTables({ api, client });
            const inventory = shared?.inventory || createInventoryTables({ api, client, serial: raw.serial });
            bundleGeneration += 1;
            bundle = { api, client, raw, impl: wrapTables(raw), inventory, shared,
                origin: shared?.origin || createOriginStore({ tables: raw }),
                points: shared?.points || createPointsStore({ tables: raw, chat: getChat, chatId: getChatId }), generation: bundleGeneration };
            ledger = createCombatLedger({
                tables: bundle.impl, chat: getChat, chatId: getChatId, userName: getUserName, sourceFilter: getSourceFilter,
                attributeStore: shared?.attributeStore,
                sharedPoints,
                difficulty: () => settings().difficulty, inventory,
                spendingGate: () => points().spendingGate(),
                // 旧 bars.money 是只读积分份额，剧情货币不进入此处。
                wallet: () => (typeof options.getWallet === 'function' ? options.getWallet() : 0),
            });
            if (shared) { retireSession(); session = null; sessionChatId = null; }
            ensureFailure = null;
            growthSnapshot = null;
        }
        return bundle.impl;
    }

    // 回收旧会话：先落盘待写记录，释放页面事件监听
    function retireSession() {
        if (!session) return;
        try {
            const stats = session.getPersistStats?.();
            if (stats) counters.retiredSessionWrites += stats.writes + stats.removes;
            session.dispose?.();
        } catch { /* */ }
    }

    function resumeSession() {
        let resumed;
        try {
            resumed = session.resume();
        } catch { /* 恢复失败当作没有会话 */ }
        resumeWaitLength = resumed?.reason === 'combat-chat-not-ready' ? getChat().length : -1;
    }

    function getSession() {
        if (!settings().enabled) return null;
        const chatId = getChatId();
        if (!chatId) return null;
        getTables();
        if (!session || sessionChatId !== chatId) {
            retireSession();
            sessionChatId = chatId;
            session = createCombatSession({
                ledger, tables: bundle.impl, request, send, storage, global, chat: getChat, getChatId, userName: getUserName,
                chatRecord: options.chatRecord, llm: getLlm, sourceFilter: getSourceFilter, readLore, readStoryContext, now: () => Date.now(),
                pointsSpendingGate,
                // 敌人模板 M7 盗金：开战时剧情货币余额快照（只读，不并入积分钱包）。
                purse: () => (typeof options.getCurrency === 'function' ? options.getCurrency() : null),
                pointsRecover: () => (points().pending().record ? points().retry() : null),
                sharedPoints,
                requireProtagonistAttributes: () => options.requireProtagonistAttributes !== false,
                difficulty: () => settings().difficulty, reportDetail: () => settings().reportDetail, retryDelays, generationMaxRounds,
                captureGenerationLease,
                awaitProtagonist: () => (protagonistTask && protagonistTask.key === protagonistKey() ? protagonistTask.promise : null),
                kinds,
                // 数值特质名单：主角与同场同伴（福星）；数值系统未启用时 traitsOf 返回 null，奖励照旧。
                statTraits: ({ hero, allies }) => {
                    const mine = traitsOf(hero);
                    return mine ? { hero: mine, allies: allies.flatMap((name) => traitsOf(name) || []) } : null;
                },
                onReportSettled: () => { Promise.resolve(refreshGrowth()).catch(() => null); },
                challenge: {
                    state: () => (typeof options.getChallengeSnapshot === 'function' ? options.getChallengeSnapshot() : null),
                    allowEscape: () => settings().daily.allowEscape,
                    stake: () => settings().daily.stake,
                    intimate: () => settings().intimate,
                    persona: (name) => (typeof options.getIntimatePersona === 'function' ? options.getIntimatePersona(name) : ''),
                    markIntimate,
                },
            });
            resumeWaitLength = -1;
            resumeSession();
        } else if (resumeWaitLength >= 0 && getChat().length !== resumeWaitLength && session.state().status === 'idle') {
            resumeSession();
        }
        // 开战楼之后已经接着玩（有更晚的楼层、没有战报楼）：没发战报的旧战斗作废，不再挂「返回战斗」。
        try { session.reconcileDelivered?.().catch(() => {}); } catch { /* 保留未确认结算供重试 */ }
        try { session.dropSuperseded?.(getChat().length - 1); } catch { /* 作废失败保留原状 */ }
        return session;
    }

    function getLedger() {
        if (!settings().enabled) return null;
        getTables();
        return ledger;
    }

    // 缓存键：聊天、表版本、装配代次、楼层签名任一变化即失效
    function cacheKey() {
        return [getChatId(), bundle ? bundle.client.version() : -1, bundleGeneration, chatSignature(getChat())].join('|');
    }

    // 动作串行队列：背包/装备等写操作依次执行
    let actionTail = Promise.resolve();
    function enqueue(task) {
        const run = actionTail.then(task);
        actionTail = run.catch(() => {});
        return run;
    }

    function isDeckBusy() {
        let status = '';
        try { status = getSession()?.state()?.status || ''; } catch { status = ''; }
        return BUSY_STATUSES.includes(status);
    }

    // 读账本有效状态；hint 是调用方刚取过且未过期的状态，可直接复用
    async function ledgerContext(hint = null) {
        const ledgerImpl = getLedger();
        if (!ledgerImpl) return { ok: false, reason: 'combat-disabled' };
        if (hint && hint.ledgerImpl === ledgerImpl && hint.key === cacheKey()) return { ok: true, ledgerImpl, state: hint.state, key: hint.key };
        const key = cacheKey();
        let state;
        try {
            state = await ledgerImpl.effectiveState({ raw: true });
        } catch {
            state = { ok: false, reason: 'combat-ledger-read-failed' };
        }
        return state?.ok ? { ok: true, ledgerImpl, state, key } : { ok: false, reason: state?.reason || 'combat-ledger-read-failed' };
    }

    // 在最新 AI 楼层正文里留备注并执行动作
    function withNote(note, action) {
        if (typeof options.readFloor !== 'function' || typeof options.writeFloor !== 'function') return { ok: false, reason: 'combat-use-unavailable' };
        if (isDeckBusy()) return { ok: false, reason: 'combat-deck-readonly' };
        const messageId = getChat().length - 1;
        if (messageId < 0) return { ok: false, reason: 'combat-use-no-floor' };
        return withFloorNote({ readFloor: options.readFloor, writeFloor: options.writeFloor, messageId, note, sourceFilter: getSourceFilter(), action: () => action(messageId) });
    }

    // 战斗外使用背包物品（只允许回血类，且主角有伤）
    function useInventoryItem(itemRef) {
        return enqueue(async () => {
            const context = await ledgerContext();
            if (!context.ok) return context.reason === 'combat-disabled' ? { ...context, draft: true } : context;
            const heroId = context.state.attributes?.heroId;
            const hero = heroId ? context.state.characters.get(heroId) : null;
            if (!hero) return { ok: false, reason: 'combat-points-not-protagonist', draft: true };
            if (hero.inventory?.ok !== true) return { ok: false, reason: hero.inventory?.reason || 'inventory-table-read-failed' };
            const itemId = itemIdFor(itemRef);
            const item = (hero.items || []).find((entry) => entry.itemId === itemId);
            if (!item) return { ok: false, reason: 'combat-use-not-item', draft: true };
            if (!(item.effects || []).some((effect) => effect.op === 'heal' && Number(effect.amount) > 0)) return { ok: false, reason: 'combat-use-battle-only' };
            if (!hero.wound) return { ok: false, reason: 'combat-use-full-hp' };
            const result = await withNote(`（${hero.name || getUserName()}使用了${item.name}）`, (messageId) => context.ledgerImpl.useItem(item.itemId, { messageId }));
            if (result.ok) refreshLife();
            return result;
        });
    }

    // 穿/卸装备；hint 可带入 setHeroGear 刚读过的状态；slotIndex（规则 v6，可选）为装宝物时替换的格位
    function setGear(characterId, gearId, equip, hint = null, slotIndex = undefined) {
        return enqueue(async () => {
            const context = await ledgerContext(hint);
            if (!context.ok) return context;
            const character = context.state.characters.get(characterId);
            if (!character) return { ok: false, reason: 'combat-character-missing' };
            const gear = equip ? (character.gear?.bag || []).find((entry) => entry.gearId === gearId) : equippedGear(character.gear?.slots).find((slot) => slot?.gearId === gearId);
            return gear
                ? withNote(`（${character.name || ''}${equip ? '装上了' : '卸下了'}${gear.name}）`, () => context.ledgerImpl.setGear(characterId, gearId, equip === true, slotIndex))
                : { ok: false, reason: 'combat-gear-missing' };
        });
    }

    // 主角背包视图（装备、物品、收藏、其他）
    async function heroInventory() {
        const ledgerImpl = getLedger();
        if (!ledgerImpl) return null;
        let state;
        try {
            state = await ledgerImpl.effectiveState();
        } catch {
            return null;
        }
        const heroId = state?.ok ? state.attributes?.heroId : null;
        const hero = heroId ? state.characters.get(heroId) : null;
        return !hero || hero.inventory?.ok !== true ? null : { ok: true, gear: hero.gear, items: hero.items || [], collection: hero.collection || [], others: hero.others || [], points: hero.points ?? 0 };
    }

    // 背包卖出（v0.39.2，人物状态面板的背包页取消后统一在阅读器背包卖）：只主角；装备须在背包里（穿戴中由账本拒收），杂物按 itemId。
    // 售价按稀有度由账本计算，积分记在主角名下；战斗进行中只读。返回的 price 为本次所得。
    function sellHeroItem(kind, id, count = 1) {
        return enqueue(async () => {
            if (isDeckBusy()) return { ok: false, reason: 'combat-deck-readonly' };
            const context = await ledgerContext();
            if (!context.ok) return context;
            const heroId = context.state.attributes?.heroId;
            if (!heroId || !context.state.characters.get(heroId)) return { ok: false, reason: 'combat-points-not-protagonist' };
            const write = kind === 'gear' ? context.ledgerImpl.sellGear : kind === 'keepsake' ? context.ledgerImpl.sellKeepsake : null;
            if (typeof write !== 'function') return { ok: false, reason: 'combat-sell-unavailable' };
            return write(String(id || ''), count);
        });
    }

    async function setHeroGear(gearId, equip, slotIndex = undefined) {
        const context = await ledgerContext();
        if (!context.ok) return context;
        const heroId = context.state.attributes?.heroId;
        if (!heroId || !context.state.characters.get(heroId)) return { ok: false, reason: 'combat-points-not-protagonist' };
        return setGear(heroId, gearId, equip === true, context, slotIndex);
    }

    // ---- 生命刷新（refreshLife）：排队合并 + 只读缓存 ----
    let lifeCache = null; // { chatId, state }，lifeSource 读取
    let lifeStamp = null; // { key, at }：lifeCache 对应的表版本/楼层签名
    let lifeTail = Promise.resolve();
    let lifeRunning = false;
    let lifeQueued = null; // 已排队未开始的任务 { params, promise }

    // 合并两次请求的参数：write 取或，messageIds 取并集（任一为 undefined 表示全量），其余取最新
    function mergeLifeParams(a, b) {
        let messageIds;
        if (a.messageIds !== undefined && b.messageIds !== undefined) messageIds = [...new Set([...a.messageIds, ...b.messageIds])];
        return {
            write: a.write || b.write,
            messageIds,
            battleHurts: b.battleHurts !== undefined ? b.battleHurts : a.battleHurts,
            heroPrefs: b.heroPrefs !== undefined ? b.heroPrefs : a.heroPrefs,
            naturalHeals: [...(a.naturalHeals || []), ...(b.naturalHeals || [])],
        };
    }

    const lifeCacheUsable = () => !!lifeStamp && lifeCache?.chatId === getChatId() && lifeCache.state?.ok === true
        && lifeStamp.key === cacheKey() && Date.now() - lifeStamp.at < LIFE_CACHE_TTL_MS;

    async function runLife(params) {
        const chatId = getChatId();
        if (!chatId) {
            lifeCache = null;
            lifeStamp = null;
            return { ok: false, reason: 'combat-generate-unavailable' };
        }
        if (!params.write && lifeCacheUsable()) {
            counters.refreshLifeCacheHits += 1;
            return { ok: true, scan: null, cached: true };
        }
        counters.refreshLifeRuns += 1;
        getTables();
        const ledgerImpl = ledger;
        let scan = null;
        if (params.write) {
            try {
                scan = await ledgerImpl.scanLife({ messageIds: params.messageIds, battleHurts: params.battleHurts, heroPrefs: params.heroPrefs, naturalHeals: params.naturalHeals });
            } catch {
                scan = { ok: false, reason: 'combat-ledger-scan-failed' };
            }
        }
        let state;
        try {
            state = await ledgerImpl.effectiveState({ raw: true });
        } catch {
            state = { ok: false, reason: 'combat-ledger-read-failed' };
        }
        if (getChatId() !== chatId) return { ok: false, reason: 'request-stale' };
        lifeCache = { chatId, state };
        lifeStamp = { key: cacheKey(), at: Date.now() };
        if (!state.ok) return { ok: false, reason: state.reason || 'combat-ledger-read-failed' };
        if (scan && scan.ok !== true) return { ok: false, reason: scan.reason || 'combat-life-write-failed', scan };
        return { ok: true, scan };
    }

    function refreshLife({ write = false, messageIds, battleHurts, heroPrefs, naturalHeals } = {}) {
        const params = { write, messageIds, battleHurts, heroPrefs, naturalHeals };
        // 空闲且缓存有效的只读请求：不排队，直接返回
        if (!write && !lifeRunning && !lifeQueued && lifeCacheUsable()) {
            counters.refreshLifeCacheHits += 1;
            return Promise.resolve({ ok: true, scan: null, cached: true });
        }
        if (lifeQueued) {
            // write 请求不能被只读请求吞掉：合并后参数取并集
            lifeQueued.params = mergeLifeParams(lifeQueued.params, params);
            counters.refreshLifeCoalesced += 1;
            return lifeQueued.promise;
        }
        const job = { params, promise: null };
        job.promise = lifeTail.then(async () => {
            lifeQueued = null;
            lifeRunning = true;
            try {
                return await runLife(job.params);
            } finally {
                lifeRunning = false;
            }
        });
        lifeQueued = job;
        lifeTail = job.promise.catch(() => {});
        return job.promise;
    }

    function lifeSource() {
        const chatId = getChatId();
        const state = lifeCache && lifeCache.chatId === chatId && lifeCache.state?.ok === true ? lifeCache.state : null;
        return {
            ready: !!state,
            reason: state ? '' : lifeCache && lifeCache.chatId === chatId ? lifeCache.state?.reason || 'combat-ledger-read-failed' : 'combat-life-cache-missing',
            readAbilities: (name, extra) => {
                if (options.chatStore) return options.chatStore.get().attributeAccess.source().readAbilities(name, extra);
                return state ? abilitiesForName(state, name, getUserName(), extra) : null;
            },
            readVitals: (name, extra) => (state ? vitalsForName(state, name, getUserName(), extra) : null),
            // 净流水不含旧 bars.money；共享积分不受战斗界面开关影响。
            readPoints: () => {
                const shared = pointsSnapshot();
                const hero = state?.characters.get(state.attributes?.heroId);
                return shared.ok ? shared.flow : (Number(hero?.points) || 0) + (state?.originPoints || 0);
            },
            names: () => (state ? [...state.characters.values()].map((character) => character.name).filter(Boolean) : []),
            refresh: refreshLife,
        };
    }

    // 写入主角的初始化数据（宿主 api 变化/聊天切换/中止时作废）
    function captureCombatInit() {
        if (!settings().enabled || !getChatId()) return null;
        const chatId = getChatId();
        const api = global.AutoCardUpdaterAPI;
        return {
            outputs: { roles: Object.keys(COMBAT_RULES.archetypes), abilities: [...ABILITY_KEYS] },
            parse: parseCombatInit,
            async write(name, value, { signal, shouldStart } = {}) {
                const valid = () => settings().enabled && getChatId() === chatId && global.AutoCardUpdaterAPI === api && !signal?.aborted && (!shouldStart || shouldStart() === true);
                if (!valid()) return { ok: false, reason: 'request-stale' };
                const target = String(name || '').trim();
                const buildMode = getBuildMode();
                if (typeof options.buildMode === 'function' && (!buildMode || buildMode.ready === false)) return { ok: false, reason: buildMode?.reason || 'stats-build-policy-waiting' };
                const protagonist = PROTAGONIST_ALIASES.includes(target) || (!!getUserName() && target === getUserName());
                if (!wantsAutoInit({ mode: buildMode?.mode ?? null, choice: buildMode?.choices?.[target] ?? null, protagonist })) return { ok: true, unchanged: true, skipped: 'build-mode' };
                const written = await getLedger().writeInit(name, value, { signal, shouldStart: valid });
                if (written.ok && valid()) await refreshGrowth();
                return written;
            },
        };
    }

    // 手动写入初始化（设置页）：写完刷新生命与成长
    // replace：已初始化的角色也覆盖（设置页「修改属性」）。
    async function writeManualInit(name, value, { signal, replace = false, expectedRevision, shouldStart } = {}) {
        const chatId = getChatId();
        if (!chatId) return { ok: false, reason: 'combat-generate-unavailable' };
        getTables();
        const ledgerImpl = ledger;
        const epoch = chatEpoch, owner = bundle;
        const stillValid = () => !disposed && chatEpoch === epoch && bundle === owner && owner.api === (global.AutoCardUpdaterAPI || null)
            && getChatId() === chatId && ledger === ledgerImpl && !signal?.aborted && (!shouldStart || shouldStart());
        if (!stillValid()) return { ok: false, reason: 'request-stale' };
        let written;
        try {
            written = await ledgerImpl.writeInit(name, value, { signal, shouldStart: stillValid, manual: true, replace, expectedRevision });
        } catch {
            written = { ok: false, reason: 'combat-init-write-failed' };
        }
        if (written?.ok === true && stillValid()) {
            await refreshLife();
            if (stillValid() && settings().enabled) await refreshGrowth();
            if (stillValid() && settings().enabled && protagonistState.status === 'waiting-attributes') {
                await prepareProtagonist();
            }
        }
        return stillValid() ? written : { ok: false, reason: 'request-stale' };
    }

    // 初始化候选：账本里尚未初始化的角色（主角只取一个）
    async function buildCandidates(extraNames = []) {
        const chatId = getChatId();
        if (!chatId) return { ok: false, reason: 'combat-generate-unavailable' };
        getTables();
        const ledgerImpl = ledger;
        let state;
        try {
            state = await ledgerImpl.effectiveState({ raw: true });
        } catch {
            state = { ok: false, reason: 'combat-ledger-read-failed' };
        }
        if (getChatId() !== chatId || ledger !== ledgerImpl) return { ok: false, reason: 'request-stale' };
        if (!state || state.ok !== true) return { ok: false, reason: state?.reason || 'combat-ledger-read-failed' };
        const userName = getUserName().trim();
        const list = [];
        const seen = new Set();
        let protagonistSeen = false;
        const consider = (rawName) => {
            const name = String(rawName || '').trim();
            if (!name || seen.has(name)) return;
            seen.add(name);
            const attributes = abilitiesForName(state, name, userName);
            if (!attributes) return;
            if (attributes.protagonist) {
                if (protagonistSeen) return;
                protagonistSeen = true;
            }
            if (!attributes.initialized) list.push({ name, protagonist: attributes.protagonist === true, attributes });
        };
        for (const character of state.characters.values()) consider(character.name);
        consider(userName || PROTAGONIST_ALIASES[2]);
        for (const name of Array.isArray(extraNames) ? extraNames : []) consider(name);
        return { ok: true, list, table: state.attributes?.table || 'missing' };
    }

    // 属性表对外入口（统计面板用）
    function statsTables() {
        if (options.chatStore) return options.chatStore.get().statsAccess;
        getTables();
        const { raw, client, generation } = bundle;
        const probe = raw.probe();
        return probe.ok
            ? {
                ok: true,
                // 数值侧缓存同时跟随宿主接口替换和表更新，不能只认自己的写入次数。
                get version() { return `${generation}:${client.version()}`; },
                read: (readOptions) => raw.read(readOptions),
                invalidate: () => client.invalidate(),
                matchesIncomplete: record => raw.matchesIncomplete('stats', record),
                append: (records, appendOptions) => raw.append('stats', records, appendOptions),
                ensure: () => {
                    const chatKey = getChatId();
                    if (!chatKey) return Promise.resolve({ ok: false, reason: 'stats-no-chat' });
                    ensureFailure = null;
                    return ensureOnce(bundle.impl, chatKey);
                },
            }
            : { ok: false, reason: probe.reason, missing: probe.missing };
    }

    // 物品表读写口（数值侧剧情货币用）：与战斗共用同一套背包写口与串行队列。
    function inventoryTables() {
        getTables();
        return bundle.inventory;
    }

    function databaseReadiness() {
        if (options.chatStore) return options.chatStore.get().readiness;
        getTables();
        const owner = bundle;
        const chatId = getChatId();
        const epoch = chatEpoch;
        if (!owner.readiness || owner.readinessChat !== chatId || owner.readinessEpoch !== epoch) {
            owner.readiness?.dispose();
            owner.readinessChat = chatId;
            owner.readinessEpoch = epoch;
            owner.readiness = createTableReadiness({
                client: owner.client, chatId, generation: owner.generation, serial: owner.raw.serial,
                isCurrent: () => !disposed && bundle === owner && chatEpoch === epoch && !!chatId
                    && getChatId() === chatId && owner.api === (global.AutoCardUpdaterAPI || null),
            });
        }
        return owner.readiness;
    }

    // 积分独立于战斗界面开关；原钱包份额与战斗净流水均只读。
    let pointsCache = null;
    function originStore() {
        getTables();
        return bundle.origin;
    }
    async function ensurePointsFloor(messageId) {
        if (typeof options.pointsFloorRecord?.ensure !== 'function') return { ok: false, reason: 'points-floor-unsupported' };
        return options.pointsFloorRecord.ensure(messageId);
    }
    let pointsEngine = null;
    function points() {
        if (!pointsEngine) pointsEngine = createPointsEngine({
            store: () => { getTables(); return bundle.points; },
            floors: options.pointsFloorRecord,
            chat: getChat, chatId: getChatId, lock: withPointsLock,
            wallet: readSharedPoints, intents: createPointsIntents(storage),
        });
        return pointsEngine;
    }
    function gamePointsRounds(game, messageId) {
        if (!GAME_IDS.includes(game) || game === 'mahjong') return undefined;
        const id = getChatId(), path = getChat();
        const source = Number.isInteger(messageId) && pointFloors(path).find(f => f.messageId === messageId);
        const message = source && path[source.messageId];
        const valid = () => Boolean(id && message && getChatId() === id && getChat() === path
            && path.includes(message) && pointsSwipe(message) === source.swipeId
            && pointFloors(path).some(f => path[f.messageId] === message));
        return () => {
            const engine = points();
            return createGamePointsRound({ engine, valid,
                start: roundId => valid()
                    ? engine.start({ game, messageId: path.indexOf(message), ...(roundId ? { roundId } : {}) })
                    : Promise.resolve({ ok: false, reason: 'points-floor-missing' }),
            });
        };
    }
    function mahjongPointsRounds(messageId) {
        const id = getChatId(), path = getChat();
        const source = pointFloors(path).find(f => f.messageId === messageId);
        const message = source && path[source.messageId];
        const sameChat = () => Boolean(id && getChatId() === id && getChat() === path);
        return async (saved, rules = saved?.rules || 'chengdu') => {
            if (!sameChat()) return { ok: false, reason: 'request-stale' };
            if (!['chengdu', 'riichi'].includes(rules)) return { ok: false, reason: 'points-rules-unavailable' };
            let identity = saved;
            if (saved) {
                if (saved.version !== 1 || saved.rules !== rules || saved.chatId !== id
                    || typeof saved.roundId !== 'string' || !saved.roundId || !saved.anchor?.floorId
                    || !Number.isSafeInteger(saved.anchor.swipeId) || saved.anchor.swipeId < 0) {
                    return { ok: false, reason: 'points-round-stale' };
                }
            } else {
                if (!message || !path.includes(message) || pointsSwipe(message) !== source.swipeId) return { ok: false, reason: 'points-floor-missing' };
                const bound = await ensurePointsFloor(path.indexOf(message));
                if (!bound.ok) return bound;
                if (!sameChat() || pointsSwipe(message) !== source.swipeId || bound.anchor.swipeId !== source.swipeId) return { ok: false, reason: 'request-stale' };
                identity = { version: 1, rules, chatId: id, roundId: newPointsId(), anchor: bound.anchor };
            }
            const locate = () => pointFloors(path).filter(f => f.floorId === identity.anchor.floorId && f.swipeId === identity.anchor.swipeId);
            const valid = () => sameChat() && locate().length === 1;
            return createMahjongPointsRound({ engine: points(), identity, valid, sameChat,
                start: () => valid() ? points().start({ game: 'mahjong', rules,
                    messageId: locate()[0].messageId, sourceId: identity.roundId, anchor: identity.anchor })
                    : Promise.resolve({ ok: false, reason: 'points-round-stale' }),
            });
        };
    }
    const pointsSpendingGate = () => points().spendingGate();
    function readV2PointsBalance(owner, chatId, { fresh = true } = {}) {
        const held = points().pending();
        if (!held.ok) { pointsCache = null; return held; }
        const read = owner.points.read({ fresh });
        if (!read.ok) {
            if (read.reason === 'points-table-missing') {
                const zero = { ok: true, mode: 'shared', balance: 0, combat: 0, origin: 0, games: 0, wallet: 0, flow: 0 };
                pointsCache = { chatId, owner, key: cacheKey(), value: zero };
                return zero;
            }
            pointsCache = null;
            return read;
        }
        if (!Number.isSafeInteger(read.balance)) { pointsCache = null; return { ok: false, reason: 'origin-points-invalid' }; }
        const value = { ok: true, mode: 'shared', balance: read.balance, combat: 0, origin: 0, games: read.balance, wallet: 0, flow: read.balance };
        pointsCache = { chatId, owner, key: cacheKey(), value };
        return value;
    }
    async function readSharedPoints() {
        getTables();
        const owner = bundle;
        const chatId = getChatId();
        if (!chatId) return { ok: false, reason: 'origin-no-chat' };
        if (owner.shared) {
            const layout = owner.shared.layout();
            if (!layout.ok) { pointsCache = null; return layout; }
            if (layout.layout === 'v2') return readV2PointsBalance(owner, chatId, { fresh: true });
        }
        const state = await ledger.effectiveState({ raw: true });
        if (bundle !== owner || getChatId() !== chatId) return { ok: false, reason: 'request-stale' };
        if (!state.ok) { pointsCache = null; return state; }
        lifeCache = { chatId, state };
        const hero = state.characters.get(state.attributes?.heroId);
        const combat = Number(hero?.points) || 0;
        const wallet = Number(typeof options.getWallet === 'function' ? options.getWallet() : 0) || 0;
        const origin = state.originPoints || 0;
        const games = state.gamePoints || 0;
        const balance = wallet + combat + origin + games;
        if (!Number.isSafeInteger(balance)) return { ok: false, reason: 'origin-points-invalid' };
        const value = { ok: true, mode: 'legacy', balance, combat, origin, games, wallet, flow: combat + origin + games };
        pointsCache = { chatId, owner, key: cacheKey(), value };
        return value;
    }
    async function readOriginWallet({ intent } = {}) {
        getTables();
        const owner = bundle;
        const chatId = getChatId();
        if (!chatId || !intent?.ok) return { ok: false, reason: 'origin-wallet-unavailable' };
        let isV2 = false;
        if (owner.shared) {
            const layout = owner.shared.layout();
            if (!layout.ok) return layout;
            isV2 = layout.layout === 'v2';
        }
        owner.client.invalidate();
        const checked = owner.origin.read({ intent });
        if (!checked.ok) return checked;
        if (checked.revision !== intent.revision && checked.revision !== intent.record?.payload.parent) {
            return { ok: false, reason: 'origin-database-conflict' };
        }
        if (isV2) return readV2PointsBalance(owner, chatId, { fresh: false });
        const external = await ledger.externalPoints();
        if (bundle !== owner || getChatId() !== chatId) return { ok: false, reason: 'request-stale' };
        if (!external.ok) return external;
        const balance = external.balance + (Number(typeof options.getWallet === 'function' ? options.getWallet() : 0) || 0);
        return Number.isSafeInteger(balance) ? { ok: true, mode: 'legacy', balance } : { ok: false, reason: 'origin-points-invalid' };
    }
    function pointsSnapshot() {
        if (bundle?.shared) {
            const layout = bundle.shared.layout();
            if (!layout.ok) return layout;
            if (layout.layout === 'v2') {
                if (pointsCache?.owner === bundle && pointsCache.chatId === getChatId() && pointsCache.key === cacheKey()) {
                    return { ...pointsCache.value };
                }
                return readV2PointsBalance(bundle, getChatId(), { fresh: false });
            }
        }
        if (pointsCache?.owner !== bundle || pointsCache.chatId !== getChatId() || pointsCache.key !== cacheKey()) {
            return { ok: false, reason: 'origin-wallet-unavailable' };
        }
        const wallet = Number(typeof options.getWallet === 'function' ? options.getWallet() : 0) || 0;
        const balance = pointsCache.value.flow + wallet;
        return Number.isSafeInteger(balance)
            ? { ...pointsCache.value, wallet, balance }
            : { ok: false, reason: 'origin-points-invalid' };
    }
    function withPointsLock(task) {
        getTables();
        return bundle?.shared?.withPointsLock ? bundle.shared.withPointsLock(task) : ledger.withPointsLock(task);
    }

    async function ensureTables() {
        if (disposed) return { ok: false, reason: 'request-stale' };
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const impl = getTables();
        const chatKey = getChatId();
        if (!chatKey) return { ok: false, reason: 'combat-session-unavailable' };
        ensureFailure = null;
        return ensureOnce(impl, chatKey);
    }

    // 同步战斗战报的正则（只成功一次）；开启日常挑战时一并同步挑战战报的折叠正则
    async function syncRegex() {
        if (!settings().enabled || regexState === 'ok' || regexState === 'pending') return regexState;
        regexState = 'pending';
        let result;
        try {
            result = await ensureCombatReportRegex(global);
            if (result.ok && dailyChallengeOn(settings())) result = await ensureChallengeReportRegex(global);
        } catch {
            result = { ok: false, reason: 'regex-write-failed' };
        }
        regexState = result.ok ? 'ok' : null;
        return result;
    }

    // ---- 成长刷新（refreshGrowth）：排队合并 + 签名去重通知 ----
    // 通知载荷里的内容都进签名；签名与该监听者上次收到的一致就不再通知，但内部缓存 growthCache 照常更新
    function growthSignature(payload) {
        if (!payload.ok) return stableStringify({ chatId: payload.chatId, ok: false, reason: payload.reason });
        let abilities = [];
        try {
            abilities = payload.names.map((name) => payload.readAbilities(name));
        } catch { /* 读不出来就不计入签名 */ }
        return stableStringify({
            chatId: payload.chatId, ok: true, growth: payload.growth, pending: payload.pending, names: payload.names,
            party: payload.party, partyReason: payload.partyReason || '', abilities,
        });
    }

    function notifyGrowth(payload) {
        const signature = growthSignature(payload);
        for (const [listener, seen] of [...growthListeners]) {
            if (seen === signature) {
                counters.notifiesSuppressed += 1;
                continue;
            }
            growthListeners.set(listener, signature);
            counters.notifies += 1;
            try { listener(payload); } catch { /* 监听者出错不影响刷新 */ }
        }
    }

    function onGrowthUpdated(listener) {
        if (typeof listener !== 'function') return () => {};
        growthListeners.set(listener, null); // 新监听者的第一次变化必然通知
        return () => growthListeners.delete(listener);
    }

    // 一轮成长刷新：扫描待生成条目 + 读有效状态 + 更新缓存
    async function growthPass() {
        const chatId = getChatId();
        const ledgerImpl = getLedger();
        if (!ledgerImpl || !chatId) return { ok: false, reason: 'combat-generate-unavailable', fatal: true };
        counters.refreshGrowthRuns += 1;
        let scan;
        try {
            scan = await ledgerImpl.scan();
        } catch {
            scan = { ok: false, reason: 'combat-ledger-scan-failed' };
        }
        let state;
        try {
            state = await ledgerImpl.effectiveState({ raw: true });
        } catch {
            state = { ok: false, reason: 'combat-ledger-read-failed' };
        }
        if (getChatId() !== chatId) return { ok: false, reason: 'request-stale' };
        lifeCache = { chatId, state };
        lifeStamp = { key: cacheKey(), at: Date.now() };
        growthSnapshot = { key: lifeStamp.key, scan, state };
        let party = null;
        let partyReason = '';
        if (state.ok) {
            try {
                party = partyStatus(state, getUserName());
            } catch {
                partyReason = 'combat-party-status-failed';
            }
        }
        growthCache = state.ok
            ? {
                // 待生成项：正文扫描的成长标签 + 账本里已到解锁等级、尚无专属卡的槽位（v0.39.2）。
                chatId, ok: true, growth: state.growth || [], pending: [...(scan.ok ? scan.pendingGeneration || [] : []), ...signaturePending(state)],
                names: [...state.characters.values()].map((character) => character.name).filter(Boolean),
                readAbilities: (name) => abilitiesForName(state, name, getUserName()), party, ...(partyReason && { partyReason }),
            }
            : { chatId, ok: false, reason: state.reason, growth: [], pending: [] };
        notifyGrowth(growthCache);
        return { ok: state.ok === true, scan, reason: state.reason };
    }

    async function refreshGrowth() {
        if (!settings().enabled) {
            growthCache = null;
            return { ok: false, reason: 'combat-disabled' };
        }
        if (growthRun) {
            growthRun.again = true;
            counters.refreshGrowthCoalesced += 1;
            return growthRun.promise;
        }
        const run = { again: false, promise: null };
        growthRun = run;
        run.promise = (async () => {
            let result;
            do {
                run.again = false;
                getTables();
                const startKey = cacheKey();
                const pass = await growthPass();
                if (pass.fatal) {
                    result = { ok: pass.ok, reason: pass.reason };
                    break;
                }
                result = pass.reason === 'request-stale' && !pass.scan ? { ok: false, reason: 'request-stale' } : { ok: pass.ok, scan: pass.scan, reason: pass.reason };
                // 重跑期间表与楼层都没变，再跑一遍得到的结果相同，直接略过
                if (run.again && cacheKey() === startKey && pass.reason !== 'request-stale') {
                    counters.refreshGrowthRerunSkipped += 1;
                    run.again = false;
                }
            } while (run.again);
            growthRun = null;
            return result;
        })();
        return run.promise;
    }

    // 当前聊天的成长缓存（未启用/聊天不符返回 null）
    function getGrowth() {
        return !settings().enabled || !growthCache || growthCache.chatId !== getChatId() ? null : growthCache;
    }

    // 注入提示词用的队伍状态
    function partyPromptInput(kind = null) {
        if (!settings().enabled || kind === 'impersonate' || kind === 'quiet') return null;
        const growth = getGrowth();
        if (!growth || growth.ok !== true || !Array.isArray(growth.party)) {
            pushDiagnostic('combat-party-status-unavailable', { reason: growth?.partyReason || growth?.reason || 'combat-growth-cache-missing' });
            return null;
        }
        return growth.party.length ? growth.party : null;
    }

    // 回放某楼的检定结果（需要预掷表与能力读取）
    function checkReplayFor(messageId, bodyOverride) {
        if (!settings().enabled) return null;
        const chatId = getChatId();
        const chat = getChat();
        const ordinal = floorCheckOrdinal(chat, messageId);
        const rolls = ordinal ? checkRollPairsFor(chatId, ordinal, floorCheckSwipe(chat, messageId)) : null;
        if (!rolls) return { ok: false, reason: 'check-floor-unavailable' };
        const growth = getGrowth();
        if (!growth || growth.ok !== true || typeof growth.readAbilities !== 'function') return { ok: false, reason: growth?.reason || 'check-abilities-unavailable' };
        const body = bodyOverride == null ? combatBodyText(String(chat[Number(messageId)]?.mes ?? ''), { sourceFilter: getSourceFilter() }) : String(bodyOverride);
        let replay;
        try {
            replay = replayChecks({ body, rolls, readAbilities: growth.readAbilities });
        } catch {
            return { ok: false, reason: 'check-replay-threw' };
        }
        return { ok: true, chatId, messageId: Number(messageId), ordinal, rolls, ...replay };
    }

    // 下一轮检定的提示词输入：本轮预掷表、在场角色能力、上一轮的更正
    function checkPromptInput(excludeMessageId = null) {
        if (!settings().enabled) return null;
        const chatId = getChatId();
        const chat = getChat();
        const ordinal = upcomingCheckOrdinal(chat, excludeMessageId);
        const rolls = ordinal ? checkRollPairsFor(chatId, ordinal, upcomingCheckSwipe(chat, excludeMessageId)) : null;
        if (!rolls) return null;
        const growth = getGrowth();
        const readAbilities = growth && growth.ok === true && typeof growth.readAbilities === 'function' ? growth.readAbilities : null;
        const actors = [];
        let corrections = [];
        if (readAbilities) {
            const userName = getUserName().trim();
            const recentText = chat.filter((message) => message && !message.is_user && !message.is_system).slice(-2).map((message) => String(message.mes ?? '')).join('\n');
            const names = [...new Set([userName, ...(growth.names || []).filter((name) => name && name !== userName && recentText.includes(name))].filter(Boolean))];
            for (const name of names) {
                let attr = null;
                try { attr = readAbilities(name); } catch { attr = null; }
                if (attr) actors.push({ name, attr });
            }
            const previous = ordinal > 1 ? floorIndexOfOrdinal(chat, ordinal - 1) : -1;
            const previousReplay = previous >= 0 ? checkReplayFor(previous) : null;
            if (previousReplay && previousReplay.ok) corrections = checkCorrections(previousReplay.results);
        }
        return { ordinal, rolls, actors, corrections };
    }

    // ---- 成长生成 ----
    // 为待生成的成长条目请求 LLM 并写入账本。reuseSnapshot：自动成长刚刷新过，表与楼层没变时复用那次的扫描与状态
    const generateGrowth = (args = {}) => runGeneration('growth', args, runGenerateGrowth);
    async function runGenerateGrowth({ signal, shouldStart, messageIds = null, reuseSnapshot = false, includeEquipment = true } = {}) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        if (!ledgerImpl) return { ok: false, reason: 'combat-generate-unavailable' };
        const tables = getTables();
        const alive = captureGenerationLease({ signal, shouldStart });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        let scan;
        let state;
        if (reuseSnapshot && growthSnapshot && growthSnapshot.key === cacheKey()) {
            ({ scan, state } = growthSnapshot);
        } else {
            scan = await ledgerImpl.scan();
            if (!alive()) return { ok: false, reason: 'request-stale' };
            if (!scan.ok) return { ok: false, reason: scan.reason || 'combat-ledger-scan-failed' };
            state = await ledgerImpl.effectiveState();
        }
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!scan.ok) return { ok: false, reason: scan.reason || 'combat-ledger-scan-failed' };
        if (!state.ok) return { ok: false, reason: state.reason };
        const entities = [];
        const entries = [];
        let skipped = 0;
        const wanted = Array.isArray(messageIds) ? new Set(messageIds.map(Number)) : null;
        // 专属卡到期项（v0.39.2）与成长标签同一套楼层范围：锚点是跨级的 EXP 记录。
        for (const pending of [...(scan.pendingGeneration || []), ...signaturePending(state)]) {
            if (!includeEquipment && pending.kind === 'equip') continue;
            if (wanted && !wanted.has(Number(pending.anchor?.messageId))) continue;
            const character = pending.characterId ? state.characters.get(pending.characterId) : null;
            const built = growthEntity(pending, character, { classes: state.classes, now: Date.now(), profileMeta: state.profileMeta, traits: traitsOf(character?.name) });
            if (built.entry) entries.push(built.entry);
            else if (built.entity) entities.push(built.entity);
            else skipped += 1;
        }
        let profiles = [];
        let rejected = [];
        let requestFailed = false;
        if (entities.length) {
            if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
            const names = [getUserName(), ...entities.map((entity) => state.characters.get(entity.owner)?.name)].filter(Boolean);
            const context = await withStoryContext({ protagonist: getUserName() }, readStoryContext, { names, signal });
            if (!alive()) return { ok: false, reason: 'request-stale' };
            const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, shouldStart: alive, classes: state.classes, now: Date.now(), context, retryDelays, maxRounds: generationMaxRounds });
            if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
            if (generated.reason) return { ok: false, reason: generated.reason, ...(generated.missing ? { missing: generated.missing } : {}) };
            const writes = generationWrites(generated, { createdAt: Date.now() });
            profiles = writes.profiles;
            entries.push(...writes.entries);
            rejected = generated.rejected;
            requestFailed = !!generated.requestFailure;
        }
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (profiles.length) {
            const written = await tables.append('profile', profiles, { signal, shouldStart: alive });
            if (!alive()) return { ok: false, reason: 'request-stale' };
            if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written };
        }
        if (entries.length) {
            const written = await ledgerImpl.append(entries, { signal, shouldStart: alive });
            if (!alive()) return { ok: false, reason: 'request-stale' };
            if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed', write: written };
        }
        await refreshGrowth();
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const complete = rejected.length === 0 && skipped === 0;
        return { ok: complete, written: entries.length, skipped, rejected, ...(complete ? {} : { reason: requestFailed ? 'combat-llm-request-failed' : 'combat-growth-incomplete' }) };
    }

    // 手动重试成长生成：先等自动成长跑完，再强制重新扫描
    let autoGrowthRun = null; // { key, queued: Set, controller, promise }
    async function retryGrowth({ signal } = {}) {
        const running = autoGrowthRun?.promise;
        if (running) {
            try { await running; } catch { /* 自动成长失败不影响手动重试 */ }
        }
        return generateGrowth({ signal, includeEquipment: false });
    }

    function cancelAutoGrowth() {
        const run = autoGrowthRun;
        autoGrowthRun = null;
        if (run) {
            try { run.controller?.abort(); } catch { /* */ }
        }
    }

    // 战报是用户楼，其中的 EXP（及由此到期的专属卡，v0.39.2）锚在用户楼：本楼之前紧邻的用户楼并入同一次处理。
    // 用户楼只在其后的 AI 楼生成后处理一次，失败项照旧留给「重试」。
    function withLeadingUserFloors(floors) {
        const chat = getChat();
        const result = new Set(floors);
        for (const floor of floors) {
            for (let i = floor - 1; i >= 0 && chat[i]?.is_user === true; i -= 1) result.add(i);
        }
        return [...result];
    }

    // 新楼出现后自动成长：同聊天的多次触发合并进同一个队列
    function autoGrowth(messageId) {
        if (!combatBattleOn(settings())) return Promise.resolve({ ok: false, reason: 'combat-disabled' });
        const floor = Number(messageId);
        if (!Number.isSafeInteger(floor) || floor < 0) return Promise.resolve({ ok: false, reason: 'combat-floor-missing' });
        const chatId = getChatId();
        if (!chatId) return Promise.resolve({ ok: false, reason: 'combat-session-unavailable' });
        if (autoGrowthRun && autoGrowthRun.key === chatId) {
            autoGrowthRun.queued.add(floor);
            return autoGrowthRun.promise;
        }
        if (autoGrowthRun) cancelAutoGrowth();
        const run = { key: chatId, queued: new Set([floor]), controller: typeof AbortController === 'function' ? new AbortController() : null, promise: null };
        autoGrowthRun = run;
        const alive = () => autoGrowthRun === run && getChatId() === chatId && settings().enabled && !run.controller?.signal.aborted;
        run.promise = (async () => {
            let result = { ok: true, unchanged: true };
            try {
                while (run.queued.size && alive()) {
                    const floors = withLeadingUserFloors([...run.queued]);
                    run.queued.clear();
                    await refreshGrowth();
                    if (!alive()) break;
                    const pendingHere = (getGrowth()?.pending || []).filter((item) => floors.includes(Number(item.anchor?.messageId)));
                    if (!pendingHere.length) continue;
                    const llm = resolveCombatLlm(getLlm());
                    if (typeof request !== 'function' || !llm.ok) {
                        result = { ok: false, reason: llm.ok ? 'combat-llm-unavailable' : llm.reason };
                        pushDiagnostic('combat-growth-auto-skipped', { reason: result.reason, messageIds: floors });
                        break;
                    }
                    result = await generateGrowth({ signal: run.controller?.signal, messageIds: floors, reuseSnapshot: true });
                    if (!result.ok && result.reason !== 'request-stale') pushDiagnostic('combat-growth-auto-failed', { reason: result.reason, messageIds: floors });
                }
                if (!alive() && result.ok) result = { ok: false, reason: 'request-stale' };
            } catch {
                result = { ok: false, reason: 'combat-action-threw' };
            } finally {
                if (autoGrowthRun === run) autoGrowthRun = null;
            }
            return result;
        })();
        return run.promise;
    }

    // ---- 牌组档案 ----
    const combatContentIntents = createCombatContentIntents(storage);
    // 生成一个角色的牌组档案（盟友或主角）：内容先行（职业、卡组、初始物品），不等待数值策略、不生成六维；支持分阶段断点恢复。
    const generateDeckProfileCore = (args = {}) => runGeneration(`deck:${String(args.name || '').trim()}`, args, runGenerateDeckProfile);
    async function runGenerateDeckProfile({ name, classRef = null, role = 'ally', signal, onStart, onRetry, generationHint, materialSelection, materialChatId, readState, shouldStart, prepareMissing = false } = {}) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        const target = String(name || '').trim();
        const chatId = getChatId();
        if (!ledgerImpl || !target || !chatId) return { ok: false, reason: 'combat-generate-unavailable' };
        const characterId = profileIdFor('deck-character', target);
        const tables = getTables();
        const alive = captureGenerationLease({ signal, shouldStart });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (typeof tables.pending === 'function' && tables.pending().some((item) => item.kind === 'profile' && String(item.key).startsWith(`${characterId}|`))) {
            const flushed = await tables.flush();
            if (flushed?.ok !== true) return { ok: false, reason: 'combat-profile-write-pending', write: flushed };
        }
        const commitContentIntent = async (initialIntent) => {
            let intent = initialIntent;
            let profileFailure = '';
            // 阶段 1：写入并读回确认职业与卡组档案
            if (intent.stage === 'profile') {
                const stateBefore = await (readState ? readState() : ledgerImpl.effectiveState());
                if (!alive()) return { ok: false, reason: 'request-stale' };
                if (!stateBefore.ok) return { ok: false, reason: stateBefore.reason };
                if (!hasDeckCharacter(stateBefore, target)) {
                    const written = await tables.append('profile', intent.profiles, { signal, shouldStart: alive });
                    if (!alive()) return { ok: false, reason: 'request-stale' };
                    if (written?.ok !== true) profileFailure = 'combat-profile-write-failed';
                }
                const after = await (readState ? readState() : ledgerImpl.effectiveState());
                if (!alive()) return { ok: false, reason: 'request-stale' };
                if (!after.ok) return { ok: false, reason: after.reason };
                if (!hasDeckCharacter(after, target)) profileFailure ||= 'combat-profile-unverified';
                if (profileFailure) return { ok: false, reason: profileFailure, id: characterId, contentStage: 'profile' };
                const advanced = { ...intent, stage: 'gear' };
                const saved = combatContentIntents.save(chatId, advanced, { allowUpdate: true });
                if (!saved.ok) return { ok: false, reason: saved.reason, id: characterId, contentStage: 'gear' };
                intent = advanced;
            }
            // 阶段 2：按固定锚点写入并确认初始装备（若失败则保留 gear 阶段意图，下次只补装备、不重调模型、不重写档案）
            const gearDiagnostics = [];
            if (intent.stage === 'gear' && intent.gearAccepted.length) {
                await grantGeneratedGear(ledgerImpl, { accepted: intent.gearAccepted }, (owner) => (owner === target ? characterId : null), {
                    anchor: intent.gearAnchor || null, diagnostics: gearDiagnostics, signal, shouldStart: alive,
                });
                if (!alive()) return { ok: false, reason: 'request-stale' };
                if (gearDiagnostics.length) {
                    const reason = gearDiagnostics[0]?.code || 'combat-gear-write-failed';
                    return { ok: false, reason, id: characterId, contentStage: 'gear', profileSaved: true, gearDiagnostics };
                }
            }
            const cleared = combatContentIntents.save(chatId, null);
            if (!cleared.ok) return { ok: false, reason: cleared.reason, id: characterId, contentStage: 'gear' };
            return { ok: true, id: characterId, contentReady: true };
        };

        // 先检查本聊天未完成的内容提交意图：有则直接恢复原结果，绝不重新请求模型！
        const pendingIntent = prepareMissing ? combatContentIntents.read(chatId) : { ok: true, intent: null };
        if (!pendingIntent.ok) return { ok: false, reason: pendingIntent.reason };
        if (pendingIntent.intent && pendingIntent.intent.characterId === characterId) {
            return commitContentIntent(pendingIntent.intent);
        }

        const state = await (readState ? readState() : ledgerImpl.effectiveState());
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!state.ok) return { ok: false, reason: state.reason };
        const deckReady = prepareMissing ? hasDeckCharacter(state, target) : state.characters.get(characterId)?.kind === 'deck-character';
        if (deckReady) return prepareMissing ? { ok: true, id: characterId, contentReady: true } : { ok: false, reason: 'combat-profile-exists', id: characterId };

        if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return { ok: false, reason: llm.reason, ...(llm.missing ? { missing: llm.missing } : {}) };
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const material = await materialContext.load({ name: target, signal, generationHint, materialSelection, materialChatId });
        if (!material.ok) return material;
        const usableClass = classRef && state.classes.has(classRef) ? classRef : null;
        // 按剧情给初始装备：随卡组档案同批请求；新运行请求不再附带六维初始化（六维由数值系统统一提供）。
        const profileEntities = [...deckProfileEntities({ name: target, id: characterId, role, classRef: usableClass, classes: state.classes }), profileGearEntity(target, { required: role === 'protagonist' })];
        const entities = await withCharacterLore(profileEntities, readLore);
        if (!alive()) return { ok: false, reason: 'request-stale' };
        try { onStart?.(); } catch { /* */ }
        const context = await withStoryContext({ protagonist: getUserName(), ...material.context }, readStoryContext, { names: [target, getUserName()], signal, persona: target !== getUserName() });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, shouldStart: alive, classes: state.classes, now: Date.now(), context, retryDelays, onRetry, maxRounds: generationMaxRounds });
        if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return { ok: false, reason: generated.reason, ...(generated.missing ? { missing: generated.missing } : {}), requested: true };
        const createdAt = Date.now();
        const writes = generationWrites(generated, { createdAt });
        if (!writes.profiles.some((profile) => profile.id === characterId)) {
            return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-deck-generation-failed', requested: true, id: characterId };
        }
        const gearAccepted = (generated.accepted || []).filter((item) => item.kind === 'profile-gear' && item.gear?.items?.length);
        const floors = getChat();
        const lastIdx = floors.length - 1;
        const gearAnchor = lastIdx >= 0 ? { messageId: lastIdx, swipeId: Number.isInteger(floors[lastIdx]?.swipe_id) ? floors[lastIdx].swipe_id : 0 } : null;
        if (prepareMissing) {
            const opId = `cc-${hash32(JSON.stringify({ chatId, characterId, createdAt, ids: writes.profiles.map(p => p.id) })).toString(36)}`;
            const intent = {
                version: 1, chatId, characterId, name: target, operationId: opId, stage: 'profile',
                profiles: writes.profiles, gearAccepted, gearAnchor, createdAt,
            };
            const savedIntent = combatContentIntents.save(chatId, intent);
            if (!savedIntent.ok) return { ok: false, reason: savedIntent.reason, requested: true, id: characterId };
            const committed = await commitContentIntent(intent);
            return committed.ok ? { ...committed, reusedClass: !!usableClass } : { ...committed, requested: true };
        }
        // 非主角助战单次生成：直接写入并确认
        const written = await tables.append('profile', writes.profiles, { signal, shouldStart: alive });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', requested: true, id: characterId };
        const after = await (readState ? readState() : ledgerImpl.effectiveState());
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!after.ok) return { ok: false, reason: after.reason, requested: true };
        if (!hasDeckCharacter(after, target)) return { ok: false, reason: 'combat-profile-unverified', requested: true, id: characterId };
        const gearDiagnostics = [];
        if (gearAccepted.length && alive()) {
            await grantGeneratedGear(ledgerImpl, { accepted: gearAccepted }, (owner) => (owner === target ? characterId : null), {
                anchor: gearAnchor, diagnostics: gearDiagnostics, signal, shouldStart: alive,
            });
        }
        if (!alive()) return { ok: false, reason: 'request-stale' };
        return { ok: true, id: characterId, reusedClass: !!usableClass, ...(gearDiagnostics.length ? { gearDiagnostics } : {}) };
    }

    // 对外版本：去掉内部用的 requested 标记
    async function generateDeckProfile({ name, classRef = null } = {}, { signal, generationHint, materialSelection, materialChatId } = {}) {
        const result = await generateDeckProfileCore({ name, classRef, role: 'ally', signal, generationHint, materialSelection, materialChatId });
        if (result.ok || !Object.hasOwn(result, 'requested')) return result;
        const copy = { ...result };
        delete copy.requested;
        return copy;
    }

    // ---- 主角成长动作（重建牌组、转职、进阶、抽特质等） ----
    // 公共前置：总开关、账本方法、LLM、牌组只读、主角必须是牌组角色；返回同一份状态供动作使用
    async function heroActionContext(method, label, { needLlm = true } = {}) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        if (!ledgerImpl || typeof ledgerImpl[method] !== 'function') return { ok: false, reason: `combat-${label}-unavailable` };
        if (needLlm && typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
        if (isDeckBusy()) return { ok: false, reason: 'combat-deck-readonly' };
        const state = await ledgerImpl.effectiveState();
        if (!state.ok) return { ok: false, reason: state.reason };
        const heroId = state.attributes?.heroId;
        const hero = heroId ? state.characters.get(heroId) : null;
        if (!hero) return { ok: false, reason: 'combat-points-not-protagonist' };
        if (hero.kind !== 'deck-character') return { ok: false, reason: `combat-${label}-kind-mismatch` };
        return { ok: true, ledgerImpl, state, hero };
    }
    const llmFailure = (llm) => ({ ok: false, reason: llm.reason, ...(llm.missing ? { missing: llm.missing } : {}) });
    const generationFailure = (generated) => ({ ok: false, reason: generated.reason, ...(generated.missing ? { missing: generated.missing } : {}) });

    const regenerateDeck = (args = {}) => runGeneration('rebuild', args, runRegenerateDeck);
    async function runRegenerateDeck({ signal, shouldStart, generationHint, materialSelection, materialChatId } = {}) {
        const alive = captureGenerationLease({ signal, shouldStart });
        const context = await heroActionContext('rebuildDeck', 'rebuild');
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!context.ok) return context;
        const { ledgerImpl, state, hero } = context;
        if ((hero.points || 0) < REBUILD_COST) return { ok: false, reason: 'combat-points-insufficient' };
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return llmFailure(llm);
        const material = await materialContext.load({ name: hero.name, generationHint, materialSelection, materialChatId, signal });
        if (!material.ok) return material;
        const entities = await withCharacterLore(deckProfileEntities({ name: hero.name, id: hero.id, role: 'protagonist', classRef: hero.classRef, classes: state.classes }), readLore);
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const story = await withStoryContext({ protagonist: getUserName(), ...material.context }, readStoryContext, { names: [hero.name], signal });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, shouldStart: alive, classes: state.classes, now: Date.now(), context: story, retryDelays, maxRounds: generationMaxRounds });
        if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const profile = (generated.accepted || []).find((item) => item.profile?.id === hero.id)?.profile;
        if (!profile?.personalPool || !profile.starterDeck) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-deck-generation-failed' };
        // 新牌池每张牌加后缀，避免和旧牌 id 冲突
        const suffix = `r${Date.now().toString(36)}`;
        const idMap = new Map(profile.personalPool.map((card) => [card.id, `${card.id}-${suffix}`]));
        const rebuilt = { personalPool: profile.personalPool.map((card) => ({ ...card, id: idMap.get(card.id) })), starterDeck: profile.starterDeck.map((id) => idMap.get(id) || id) };
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const written = await ledgerImpl.rebuildDeck(hero.id, rebuilt, { signal, shouldStart: alive });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        return written?.ok !== true ? { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' } : { ok: true, id: hero.id, cost: REBUILD_COST };
    }

    const respecClass = (args = {}) => runGeneration('respec', args, runRespecClass);
    async function runRespecClass({ classRef = null, signal, shouldStart, generationHint, materialSelection, materialChatId } = {}) {
        const alive = captureGenerationLease({ signal, shouldStart });
        const context = await heroActionContext('respecClass', 'respec', { needLlm: !classRef });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!context.ok) return context;
        const { ledgerImpl, state, hero } = context;
        if ((hero.points || 0) < RESPEC_COST) return { ok: false, reason: 'combat-points-insufficient' };
        if (classRef) {
            if (!state.classes.has(classRef)) return { ok: false, reason: 'combat-class-missing' };
            if (classRef === hero.classRef) return { ok: false, reason: 'combat-respec-same-class' };
            const switched = await ledgerImpl.respecClass(hero.id, classRef, { signal, shouldStart: alive });
            if (!alive()) return { ok: false, reason: 'request-stale' };
            return switched?.ok !== true ? { ok: false, reason: switched?.reason || 'combat-ledger-insert-failed' } : { ok: true, id: hero.id, classRef, cost: RESPEC_COST };
        }
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return llmFailure(llm);
        const material = await materialContext.load({ name: hero.name, generationHint, materialSelection, materialChatId, signal });
        if (!material.ok) return material;
        const story = await withStoryContext({ protagonist: getUserName(), ...material.context }, readStoryContext, { names: [hero.name], signal });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry([respecClassEntity({ id: hero.id, name: hero.name })], { request, llm: getLlm(), signal, shouldStart: alive, classes: state.classes, now: Date.now(), context: story, retryDelays, maxRounds: generationMaxRounds });
        if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const profile = (generated.accepted || []).find((item) => item.profile?.kind === 'class')?.profile;
        if (!profile) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-class-generation-failed' };
        const written = await getTables().append('profile', [profileRecord(profile, { createdAt: Date.now() })], { signal, shouldStart: alive });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written };
        const switched = await ledgerImpl.respecClass(hero.id, profile.id, { signal, shouldStart: alive });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        return switched?.ok !== true
            ? { ok: false, reason: switched?.reason || 'combat-ledger-insert-failed', classRef: profile.id }
            : { ok: true, id: hero.id, classRef: profile.id, cost: RESPEC_COST, created: true };
    }

    const ascendClass = (args = {}) => runGeneration('ascend', args, runAscendClass);
    async function runAscendClass({ signal, shouldStart, generationHint, materialSelection, materialChatId } = {}) {
        const alive = captureGenerationLease({ signal, shouldStart });
        const context = await heroActionContext('ascendClass', 'ascend');
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!context.ok) return context;
        const { ledgerImpl, state, hero } = context;
        const tier = (hero.classTier || 1) + 1;
        const tierRule = ASCEND_TIERS[tier];
        if (!tierRule) return { ok: false, reason: 'combat-ascend-max' };
        if ((hero.level || 1) < tierRule.level) return { ok: false, reason: 'combat-ascend-level-unreached' };
        if ((hero.points || 0) < tierRule.cost) return { ok: false, reason: 'combat-points-insufficient' };
        if (!hero.classProfile) return { ok: false, reason: 'combat-class-missing' };
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return llmFailure(llm);
        const material = await materialContext.load({ name: hero.name, generationHint, materialSelection, materialChatId, signal });
        if (!material.ok) return material;
        const story = await withStoryContext({ protagonist: getUserName(), ...material.context }, readStoryContext, { names: [hero.name], signal });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const entity = classTierEntity({ character: hero, cls: hero.classProfile, tier, rarity: tierRule.rarity, tierName: hero.tierName, mark: Date.now().toString(36) });
        const generated = await generateWithRetry([entity], { request, llm: getLlm(), signal, shouldStart: alive, classes: state.classes, now: Date.now(), context: story, retryDelays, maxRounds: generationMaxRounds });
        if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const tierProfile = (generated.accepted || []).find((item) => item.kind === 'class-tier')?.tier;
        if (!tierProfile) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-ascend-generation-failed' };
        const written = await ledgerImpl.ascendClass(hero.id, tierProfile, { signal, shouldStart: alive });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        return written?.ok !== true ? { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' } : { ok: true, id: hero.id, tier, tierName: tierProfile.tierName, cost: tierRule.cost };
    }

    function drawTrait(options = {}) {
        const chatId = getChatId();
        const epoch = traitEpoch;
        if (traitDrawTask?.chatId === chatId && traitDrawTask.epoch === epoch) return Promise.resolve({ ok: false, reason: 'combat-trait-busy' });
        const task = { chatId, epoch };
        traitDrawTask = task;
        return runDrawTrait(options).finally(() => { if (traitDrawTask === task) traitDrawTask = null; });
    }

    async function runDrawTrait({ signal, shouldStart, onPlan } = {}) {
        const alive = captureGenerationLease({ signal, shouldStart });
        const context = await heroActionContext('drawTrait', 'trait');
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!context.ok) return context;
        const { ledgerImpl, state, hero } = context;
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (hero.pendingTrait) return { ok: false, reason: 'combat-trait-pending' };
        if ((hero.points || 0) < TRAIT_DRAW_COST) return { ok: false, reason: 'combat-points-insufficient' };
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return llmFailure(llm);
        const savedSeed = await traitSeeds.ensure({ signal });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!savedSeed.ok) return savedSeed;
        const seed = traitSeed(hero.id, hero.traitDraws, savedSeed.seed);
        const { rarity } = planTrait(seed);
        const shape = planTraitShape(seed, rarity);
        const link = planTraitLink(seed, rarity);
        // 规则 v6 遗物特性（G5f）：是否出遗物、出哪件、原版或拆解都由程序按种子定，副 LLM 只写来历。
        const relic = planTraitRelic({ seed, rarity, archetype: hero.classProfile?.archetype, owned: ownedRelicIds(hero) });
        try { onPlan?.({ rarity }); } catch { /* 界面回调失败不改变抽取结果。 */ }
        const traitId = `tr-${Date.now().toString(36)}`;
        const kept = keptInnateKinds(hero);
        const innate = [kept.includes('active') ? hero.profile?.heroSkill : null, kept.includes('passive') ? hero.profile?.personalPassive : null].filter(Boolean);
        const entities = await withCharacterLore([traitEntity({ character: hero, rarity, traitId, shape, link, relic, existing: [...innate, ...(hero.traits || [])] })], readLore);
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const story = await withStoryContext({ protagonist: getUserName() }, readStoryContext, { names: [hero.name], signal });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, shouldStart: alive, classes: state.classes, now: Date.now(), context: story, retryDelays, maxRounds: generationMaxRounds });
        if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const trait = (generated.accepted || []).find((item) => item.kind === 'trait')?.trait;
        if (!trait) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-trait-generation-failed' };
        const written = await ledgerImpl.drawTrait(hero.id, trait, { expectedDraws: hero.traitDraws, signal, shouldStart: alive });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
        const pending = trait.kind ? !traitFits(hero, trait.kind) : (hero.traits || []).length >= TRAIT_BASE_SLOTS;
        return { ok: true, id: hero.id, trait, pending, cost: TRAIT_DRAW_COST };
    }

    async function pickTrait({ drop } = {}) {
        const context = await heroActionContext('pickTrait', 'trait', { needLlm: false });
        if (!context.ok) return context;
        const { ledgerImpl, hero } = context;
        const pending = hero.pendingTrait;
        if (!pending) return { ok: false, reason: 'combat-trait-pick-invalid' };
        const picked = await ledgerImpl.pickTrait(hero.id, pending.traitId, drop);
        return picked?.ok !== true
            ? { ok: false, reason: picked?.reason || 'combat-ledger-insert-failed' }
            : { ok: true, id: hero.id, traitId: pending.traitId, drop, discarded: drop === pending.traitId };
    }

    // 规则 v6 G5f-4d 御印：为挂起的遗物刻印选定一张卡组副本（copyId）；挂起项与可选副本由账本视图 relicInscribe 给出，重放复核。
    async function inscribeRelic({ relicId, model, copyId } = {}) {
        const context = await heroActionContext('inscribeRelic', 'relic-inscribe', { needLlm: false });
        if (!context.ok) return context;
        const { ledgerImpl, hero } = context;
        const due = (hero.relicInscribe || []).find((item) => item.relic.relicId === relicId && item.relic.model === model);
        if (!due) return { ok: false, reason: 'combat-relic-inscribe-unavailable' };
        if (!due.copies.includes(copyId)) return { ok: false, reason: 'combat-relic-inscribe-invalid' };
        const cardId = (hero.deckEntries || []).find((row) => row.copyId === copyId)?.cardId;
        if (!cardId) return { ok: false, reason: 'combat-relic-inscribe-copy-missing' };
        const written = await ledgerImpl.inscribeRelic(hero.id, { relicId, model, copyId, cardId, inscription: due.inscription });
        return written?.ok !== true ? { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' } : { ok: true, id: hero.id, relicId, copyId, cardId, inscription: due.inscription };
    }

    async function unlockTraitSlot() {
        const context = await heroActionContext('unlockTraitSlot', 'trait-slot', { needLlm: false });
        if (!context.ok) return context;
        const { ledgerImpl, hero } = context;
        const next = nextTraitSlot(hero);
        if (!next) return { ok: false, reason: 'combat-trait-slot-invalid' };
        if ((hero.points || 0) < next.cost) return { ok: false, reason: 'combat-points-insufficient' };
        const unlocked = await ledgerImpl.unlockTraitSlot(hero.id, next.slot);
        return unlocked?.ok !== true ? { ok: false, reason: unlocked?.reason || 'combat-ledger-insert-failed' } : { ok: true, id: hero.id, slot: next.slot, cost: next.cost };
    }

    // 规则 v6 积分抽卡：程序按种子定候选（本职业固定 2 + 随机 1），副 LLM 只给随机卡起名选模板；生成成功后才写 card-draw 扣费，失败或取消不扣费。
    const drawCard = (args = {}) => runGeneration('card-draw', args, runDrawCard);
    async function runDrawCard({ signal, shouldStart, free } = {}) {
        const alive = captureGenerationLease({ signal, shouldStart });
        const context = await heroActionContext('drawCard', 'card-draw');
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!context.ok) return context;
        const { ledgerImpl, state, hero } = context;
        if (hero.pendingDraw) return { ok: false, reason: 'combat-card-draw-pending' };
        if (free !== undefined && (!free || typeof free !== 'object' || Array.isArray(free)
            || Object.keys(free).some(key => key !== 'level') || !hero.freeDraws?.includes(free.level))) {
            return { ok: false, reason: 'combat-card-draw-free-unavailable' };
        }
        const freeDraw = free === undefined ? null : { level: free.level };
        if (!freeDraw && (hero.points || 0) < CARD_DRAW_COST) return { ok: false, reason: 'combat-points-insufficient' };
        const plan = planCardDraw(hero);
        if (!plan) return { ok: false, reason: 'combat-card-draw-pool-empty' };
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return llmFailure(llm);
        const entities = await withCharacterLore([drawCardEntity({ character: hero, plan })], readLore);
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const story = await withStoryContext({ protagonist: getUserName() }, readStoryContext, { names: [hero.name], signal });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, shouldStart: alive, classes: state.classes, now: Date.now(), context: story, retryDelays, maxRounds: generationMaxRounds });
        if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const card = (generated.accepted || []).find((item) => item.card)?.card;
        if (!card) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-card-draw-generation-failed' };
        const choices = plan.fixedIds.map((id) => JSON.parse(JSON.stringify(fixedCard(id))));
        choices.splice(plan.randomAt, 0, card);
        const written = await ledgerImpl.drawCard(hero.id, { drawId: plan.drawId, choices, ...(freeDraw ? { free: freeDraw } : {}) }, { signal, shouldStart: alive });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (written?.ok !== true) return { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
        return { ok: true, id: hero.id, drawId: plan.drawId, choices, cost: freeDraw ? 0 : CARD_DRAW_COST };
    }

    async function upgradeCard({ level, copyId } = {}) {
        const context = await heroActionContext('upgradeCard', 'card-upgrade', { needLlm: false });
        if (!context.ok) return context;
        const { ledgerImpl, hero } = context;
        if (!hero.freeUpgrades?.includes(level)) return { ok: false, reason: 'combat-card-upgrade-free-unavailable' };
        const row = upgradableRows(hero).find(item => item.copyId === copyId);
        if (!row) return { ok: false, reason: 'combat-card-upgrade-invalid' };
        const written = await ledgerImpl.upgradeCard(hero.id, { level, copyId, cardId: row.cardId });
        return written?.ok === true ? { ok: true, id: hero.id, level, copyId }
            : { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' };
    }

    // 翻牌：position 为背面朝上的位置 0–2，每抽只能翻一张；翻开后再决定加入卡组或放弃。
    async function flipCard({ position } = {}) {
        const context = await heroActionContext('flipCard', 'card-flip', { needLlm: false });
        if (!context.ok) return context;
        const { ledgerImpl, hero } = context;
        const pending = hero.pendingDraw;
        if (!pending) return { ok: false, reason: 'combat-card-flip-invalid' };
        if (pending.flipped !== undefined) return { ok: false, reason: 'combat-card-flip-done' };
        const at = Number(position);
        if (!(Number.isInteger(at) && at >= 0 && at < pending.choices.length)) return { ok: false, reason: 'combat-card-flip-invalid' };
        const flipped = await ledgerImpl.flipCard(hero.id, pending.drawId, at);
        return flipped?.ok !== true
            ? { ok: false, reason: flipped?.reason || 'combat-ledger-insert-failed' }
            : { ok: true, id: hero.id, drawId: pending.drawId, position: at, card: pending.choices[at] };
    }

    // pick：翻开的那张的位置（加入卡组）或 'skip'（翻前翻后都可放弃，不退款）。
    async function pickCard({ pick } = {}) {
        const context = await heroActionContext('pickCard', 'card-pick', { needLlm: false });
        if (!context.ok) return context;
        const { ledgerImpl, hero } = context;
        const pending = hero.pendingDraw;
        if (!pending) return { ok: false, reason: 'combat-card-pick-invalid' };
        const choice = pick === 'skip' ? 'skip' : Number(pick);
        if (choice !== 'skip' && !(Number.isInteger(choice) && choice >= 0 && choice < pending.choices.length)) return { ok: false, reason: 'combat-card-pick-invalid' };
        if (choice !== 'skip' && pending.flipped !== choice) return { ok: false, reason: 'combat-card-pick-unflipped' };
        const picked = await ledgerImpl.pickCard(hero.id, pending.drawId, choice);
        return picked?.ok !== true
            ? { ok: false, reason: picked?.reason || 'combat-ledger-insert-failed' }
            : { ok: true, id: hero.id, drawId: pending.drawId, pick: choice, card: choice === 'skip' ? null : pending.choices[choice] };
    }

    // ---- 主角档案（进入聊天后自动准备，状态可订阅） ----
    let protagonistState = { key: '', status: 'idle', reason: '', attempt: 0, requested: false };
    let protagonistTask = null; // { key, controller, promise }
    const protagonistListeners = new Set();
    let protagonistTableWatch = null;
    let protagonistRefresh = null;

    function stopProtagonistTableWatch(owner = null) {
        const watch = protagonistTableWatch;
        if (!watch || (owner && watch.owner !== owner)) return;
        protagonistTableWatch = null;
        protagonistRefresh = null;
        watch.off?.();
    }

    function watchProtagonistTables(owner) {
        if (protagonistTableWatch?.owner === owner) return;
        stopProtagonistTableWatch();
        const watch = { owner, callback: null, off: null };
        let initial = true;
        watch.callback = (value) => {
            if (initial || value?.status !== 'ready') return;
            if (protagonistTableWatch !== watch || protagonistRefresh || !settings().enabled) return;
            const key = protagonistKey();
            if (!key) return;
            const refresh = { watch, key };
            protagonistRefresh = refresh;
            Promise.resolve().then(async () => {
                const active = protagonistTask;
                if (active?.key === key) await active.promise;
                await owner.raw.serial(() => null);
                if (protagonistRefresh !== refresh || protagonistTableWatch !== watch || bundle !== owner
                    || protagonistKey() !== key || !settings().enabled) return;
                protagonistRefresh = null;
                await prepareProtagonist();
            }).catch(() => {}).finally(() => {
                if (protagonistRefresh === refresh) protagonistRefresh = null;
            });
        };
        protagonistTableWatch = watch;
        watch.off = databaseReadiness().subscribe(watch.callback);
        initial = false;
    }

    // 暂时读错统一按配置间隔有界重试；通知不跳过等待、不额外消耗次数。
    const protagonistReadRetries = Number.isInteger(options.protagonistReadRetries) ? options.protagonistReadRetries : 8;
    const protagonistReadDelayMs = Number.isFinite(options.protagonistReadDelayMs) ? options.protagonistReadDelayMs : 1500;
    // 主角键：聊天 + 用户名，缺一则无主角
    const protagonistKey = () => {
        const chatId = getChatId();
        const userName = getUserName().trim();
        return chatId && userName ? JSON.stringify([chatId, userName]) : '';
    };

    const protagonistGenerating = (state) => state.status === 'generating' || state.status === 'retrying';
    function currentProtagonistState() {
        if (!protagonistGenerating(protagonistState)
            || (protagonistTask?.state === protagonistState && protagonistTask.alive())) return protagonistState;
        return { ...protagonistState, status: 'failed', reason: 'request-stale', attempt: 0, requested: true };
    }

    function getProtagonist() {
        const key = protagonistKey();
        if (disposed || !settings().enabled || !key || protagonistState.key !== key) return null;
        const current = currentProtagonistState();
        return {
            name: getUserName().trim(), status: current.status, reason: current.reason, attempt: current.attempt,
            attributesReady: current.attributesReady === true, deckReady: current.deckReady === true,
            contentReady: current.contentReady === true,
        };
    }

    function setProtagonistState(patch) {
        protagonistState = { ...protagonistState, ...patch };
        if (protagonistTask && protagonistGenerating(protagonistState)) protagonistTask.state = protagonistState;
        const view = getProtagonist();
        for (const listener of protagonistListeners) {
            try { listener(view); } catch { /* */ }
        }
    }

    function onProtagonistUpdated(listener) {
        if (typeof listener !== 'function') return () => {};
        protagonistListeners.add(listener);
        return () => protagonistListeners.delete(listener);
    }

    function cancelProtagonist({ resetState = true } = {}) {
        const task = protagonistTask;
        protagonistTask = null;
        if (task) {
            try { task.controller?.abort(); } catch { /* */ }
        }
        if (resetState && protagonistGenerating(protagonistState)) setProtagonistState({ status: 'idle', reason: '', attempt: 0 });
    }

    // 账本里是否已有该名字（或别名）的牌组角色
    const hasDeckCharacter = (state, name) => {
        for (const character of state.characters.values()) {
            if (character.kind === 'deck-character' && (character.name === name || (character.profile?.aliases || []).includes(name))) return true;
        }
        return false;
    };

    async function readProtagonistState(task, alive) {
        for (let attempt = 0; ; attempt += 1) {
            if (!alive()) return { ok: false, reason: 'request-stale' };
            let state;
            let changed = false;
            try {
                const client = task.owner.client;
                const before = client.readTables();
                const version = client.version();
                state = await task.ledgerImpl.effectiveState();
                const after = client.readTables();
                changed = before.data !== after.data || version !== client.version();
                if (!after.ok) state = { ok: false, reason: 'combat-table-read-failed' };
                else if (changed) state = { ok: false, reason: 'combat-table-not-ready' };
            } catch {
                state = { ok: false, reason: 'combat-ledger-read-failed' };
            }
            if (!alive()) return { ok: false, reason: 'request-stale' };
            if (state?.ok || !TRANSIENT_TABLE_REASONS.has(state?.reason) || attempt >= protagonistReadRetries) return state;
            await databaseReadiness().delay(protagonistReadDelayMs, {
                signal: task.controller?.signal, shouldStart: alive,
            });
        }
    }

    function prepareProtagonist({ manual = false, generationHint, materialSelection, materialChatId } = {}) {
        if (disposed) return Promise.resolve({ ok: false, reason: 'request-stale' });
        if (!settings().enabled) {
            stopProtagonistTableWatch();
            cancelProtagonist();
            return Promise.resolve({ ok: false, reason: 'combat-disabled' });
        }
        const key = protagonistKey();
        if (!key) return Promise.resolve({ ok: false, reason: 'combat-generate-unavailable' });
        if (protagonistTask?.key === key && protagonistTask.alive()) return protagonistTask.promise;
        if (protagonistTask) cancelProtagonist({ resetState: false });
        const ledgerImpl = getLedger();
        watchProtagonistTables(bundle);
        const previous = protagonistState.key === key ? currentProtagonistState() : null;
        let preparing = false;
        try {
            preparing = !!(session && sessionChatId === getChatId() && session.state().status === 'preparing');
        } catch {
            preparing = false;
        }
        if (preparing) return Promise.resolve({ ok: false, reason: 'combat-busy' });
        // 上次请求过 LLM 但失败：自动触发不再重复请求，只有手动才重试
        const skipRetry = !manual && previous?.status === 'failed' && previous.requested === true;
        const task = { key, ledgerImpl, owner: bundle, controller: typeof AbortController === 'function' ? new AbortController() : null, promise: null };
        protagonistTask = task;
        const alive = task.alive = captureGenerationLease({
            signal: task.controller?.signal, requireApi: false,
            shouldStart: () => protagonistTask === task && protagonistKey() === key,
        });
        task.promise = Promise.resolve().then(async () => {
            try {
                const readState = () => readProtagonistState(task, alive);
                const state = await readState();
                if (!alive()) return { ok: false, reason: 'request-stale' };
                if (!state?.ok) {
                    const reason = state?.reason || 'combat-ledger-read-failed';
                    if (!skipRetry) setProtagonistState({ key, status: reason === 'combat-table-not-ready' ? 'waiting' : 'failed', reason, attempt: 0, requested: false, attributesReady: false, deckReady: false });
                    return { ok: false, reason };
                }
                const name = getUserName().trim();
                const chatId = getChatId();
                const pendingContent = combatContentIntents.read(chatId);
                if (!pendingContent.ok) {
                    setProtagonistState({ key, status: 'failed', reason: pendingContent.reason, attempt: 0, requested: false, attributesReady: false, deckReady: false, contentReady: false });
                    return { ok: false, status: 'failed', reason: pendingContent.reason };
                }
                const hasPendingContent = Boolean(pendingContent.intent);
                const facts = {
                    attributesReady: abilitiesForName(state, name, getUserName())?.initialized === true,
                    deckReady: hasDeckCharacter(state, name),
                    contentReady: hasDeckCharacter(state, name) && !hasPendingContent,
                };
                const publishReady = async () => {
                    lifeStamp = null;
                    const life = await refreshLife();
                    if (!alive()) return { ok: false, reason: 'request-stale' };
                    const growth = life?.ok === true ? await refreshGrowth() : life;
                    if (!alive()) return { ok: false, reason: 'request-stale' };
                    const cached = lifeCache?.chatId === getChatId() ? lifeCache.state : null;
                    const confirmed = {
                        attributesReady: cached?.ok === true && abilitiesForName(cached, name, getUserName())?.initialized === true,
                        deckReady: cached?.ok === true && hasDeckCharacter(cached, name),
                        contentReady: cached?.ok === true && hasDeckCharacter(cached, name) && !combatContentIntents.read(chatId).intent,
                    };
                    if (life?.ok !== true || growth?.ok !== true || !confirmed.attributesReady || !confirmed.contentReady) {
                        const reason = life?.reason || growth?.reason || (!confirmed.attributesReady ? 'combat-attributes-waiting' : 'combat-init-unverified');
                        const status = confirmed.contentReady && !confirmed.attributesReady ? 'waiting-attributes' : 'failed';
                        setProtagonistState({ key, status, reason, attempt: 0, requested: status === 'failed' && previous?.requested === true, ...confirmed });
                        return { ok: false, status, reason };
                    }
                    setProtagonistState({ key, status: 'ready', reason: '', attempt: 0, requested: false, attributesReady: true, deckReady: true, contentReady: true });
                    return { ok: true, status: 'ready' };
                };
                if (facts.contentReady && facts.attributesReady) return await publishReady();
                // 战斗内容先行：先独立准备职业、卡组与初始装备，不调用数值 build policy 阻断，不等待主角六维。
                if (facts.contentReady && !facts.attributesReady) {
                    setProtagonistState({ key, status: 'waiting-attributes', reason: 'combat-attributes-waiting', attempt: 0, requested: false, ...facts });
                    return { ok: false, status: 'waiting-attributes', reason: 'combat-attributes-waiting', contentReady: true, attributesReady: false };
                }
                if (skipRetry && !hasPendingContent) return { ok: false, reason: previous.reason, status: 'failed' };
                const generated = await generateDeckProfileCore({
                    readState, shouldStart: alive, prepareMissing: true,
                    name: getUserName().trim(), role: 'protagonist', signal: task.controller?.signal, generationHint, materialSelection, materialChatId,
                    onStart: () => { if (alive()) setProtagonistState({ key, status: 'generating', reason: '', attempt: 0, requested: false }); },
                    onRetry: ({ attempt }) => { if (alive()) setProtagonistState({ key, status: 'retrying', attempt }); },
                });
                if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
                const after = await readState();
                if (!alive()) return { ok: false, reason: 'request-stale' };
                const stillPending = Boolean(combatContentIntents.read(chatId).intent);
                const confirmed = {
                    attributesReady: after?.ok === true && abilitiesForName(after, name, getUserName())?.initialized === true,
                    deckReady: after?.ok === true && hasDeckCharacter(after, name),
                    contentReady: after?.ok === true && hasDeckCharacter(after, name) && !stillPending,
                };
                if (confirmed.contentReady && confirmed.attributesReady) return await publishReady();
                if (confirmed.contentReady && !confirmed.attributesReady) {
                    setProtagonistState({ key, status: 'waiting-attributes', reason: 'combat-attributes-waiting', attempt: 0, requested: false, ...confirmed });
                    return { ok: false, status: 'waiting-attributes', reason: 'combat-attributes-waiting', contentReady: true, attributesReady: false };
                }
                const reason = generated.reason || after?.reason || 'combat-init-unverified';
                setProtagonistState({ key, status: 'failed', reason, attempt: 0, requested: generated.requested === true, ...confirmed });
                return { ok: false, reason, status: 'failed' };
            } catch {
                if (!alive()) return { ok: false, reason: 'request-stale' };
                setProtagonistState({ key, status: 'failed', reason: 'combat-action-threw', attempt: 0, requested: true });
                return { ok: false, reason: 'combat-action-threw' };
            } finally {
                if (protagonistTask === task) protagonistTask = null;
            }
        });
        if (alive() && (!previous || previous.status === 'idle')) {
            setProtagonistState({ key, status: 'waiting', reason: 'combat-table-not-ready', attempt: 0, requested: false, attributesReady: false, deckReady: false });
        }
        return task.promise;
    }

    // 调整盟友阶位：写入新版本的技能角色档案
    async function setAllyTier(profileId, tier) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        if (!Object.hasOwn(COMBAT_RULES.allyTiers, tier)) return { ok: false, reason: 'combat-tier-invalid' };
        const ledgerImpl = getLedger();
        const tables = getTables();
        let read;
        try {
            read = await tables.read();
        } catch {
            read = { ok: false, reason: 'combat-ledger-read-failed' };
        }
        if (!read?.ok) return { ok: false, reason: read?.reason || 'combat-ledger-read-failed' };
        let latest = null;
        for (const record of read.profile || []) {
            if (record?.id !== profileId) continue;
            const version = Number.isInteger(record.version) ? record.version : 0;
            if (!latest || version > latest.version) latest = { version, record };
        }
        const normalized = latest ? normalizeProfile(latest.record.definition) : null;
        if (!normalized?.ok || normalized.value.kind !== 'skill-character') return { ok: false, reason: 'combat-character-missing' };
        if ((normalized.value.tier ?? COMBAT_RULES.defaultAllyTier) === tier) return { ok: true, id: profileId, tier, unchanged: true };
        const next = normalizeProfile({ ...normalized.value, tier });
        if (!next.ok) return { ok: false, reason: 'combat-profile-invalid' };
        const written = await tables.append('profile', [profileRecord(next.value, { version: latest.version + 1, createdAt: Date.now() })]);
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written };
        const state = await ledgerImpl.effectiveState();
        if (!state.ok) return { ok: false, reason: state.reason };
        return state.characters.get(profileId)?.profile?.tier !== tier ? { ok: false, reason: 'combat-profile-unverified', id: profileId } : { ok: true, id: profileId, tier };
    }

    // 日常挑战额度与冷却：floor 缺省取下一楼（提示词用），给定楼号时按该楼算（入口用）；没有启用日常挑战返回 null，数值系统未就绪时不设限。
    function challengePromptQuota(floor = getChat().length, generationType = null) {
        if (generationType) floor = chatForCooldown(getChat(), generationType).length;
        const cfg = settings();
        if (!dailyChallengeOn(cfg)) return null;
        let snapshot = null;
        try { snapshot = typeof options.getChallengeSnapshot === 'function' ? options.getChallengeSnapshot() : null; } catch { snapshot = null; }
        return challengeQuota(snapshot ? { clock: snapshot.clock } : null, { perDay: cfg.daily.perDay, cooldownFloors: cfg.daily.cooldownFloors, floor });
    }

    // 距离上一场战斗开战楼的楼数（下一层与该楼之差）；只在聊天末尾 window 层内扫描开战标签，没有返回 null。
    function combatSinceStart(window, generationType = null) {
        const chat = chatForCooldown(getChat(), generationType);
        const filter = getSourceFilter();
        return floorsSinceCombatStart(chat, window, (message, index) => locateCombatStart(chat, index, filter, { combat: true }).ok);
    }

    // 挑战历史：只读聊天里用户楼的战报，不写任何存储。
    function challengeHistory() {
        return deriveChallengeHistory(getChat().map((message, floor) => ({ floor, text: message && message.is_user === true ? String(message.mes ?? '') : '' })));
    }

    // 自动备战：给定楼层有战斗标签且会话空闲时开始备战
    function autoPrepare(messageId) {
        const activeSession = getSession();
        if (!activeSession) return Promise.resolve({ ok: false, reason: 'combat-disabled' });
        const floor = Number(messageId);
        if (!Number.isSafeInteger(floor) || floor < 0) return Promise.resolve({ ok: false, reason: 'combat-floor-missing' });
        let located;
        let state;
        try {
            located = locateCombatStart(getChat(), floor, getSourceFilter(), kinds());
            state = activeSession.state();
        } catch {
            return Promise.resolve({ ok: false, reason: 'combat-action-threw' });
        }
        if (!located.ok) return Promise.resolve({ ok: false, reason: located.reason });
        if (located.challenge === true && located.start?.intimate !== true && challengePromptQuota(floor)?.ok === false) return Promise.resolve({ ok: false, reason: 'challenge-quota' });
        if (PREPARE_BUSY_STATUSES.includes(state.status) && typeof activeSession.dropSuperseded === 'function' && activeSession.dropSuperseded(floor)) state = activeSession.state();
        if (PREPARE_BUSY_STATUSES.includes(state.status)) return Promise.resolve({ ok: false, reason: 'combat-busy' });
        if (state.combatId === located.combatId && PREPARE_DONE_STATUSES.includes(state.status)) return Promise.resolve({ ok: true, unchanged: true, session: state });
        let prepared;
        try {
            prepared = activeSession.prepare(floor);
        } catch {
            return Promise.resolve({ ok: false, reason: 'combat-action-threw' });
        }
        return Promise.resolve(prepared).catch(() => ({ ok: false, reason: 'combat-action-threw' }));
    }

    // 物品表接管（v0.39.2）：战斗扩展开启时，进入聊天、启动与设置变更即把当前聊天的物品表改为程序维护（inventory.ensure：
    // 关闭数据库自动填表），不再等到第一次写主角背包。数据库尚未载入当前聊天时有限重试；成功后本聊天不再重复；
    // 失败只记诊断、不改表，下次触发再试。
    const INVENTORY_TRANSIENT = new Set(['inventory-table-not-ready', 'inventory-table-read-failed', 'inventory-runtime-not-ready']);
    let inventoryTakeover = null; // { key, promise }
    function takeoverInventory({ attempts = 4, delayMs = 1500 } = {}) {
        // combat / daily / both 三模式均接管物品表；普通战斗遭遇门禁另由 combatBattleOn 控制。
        if (!settings().enabled) return Promise.resolve({ ok: false, reason: 'combat-disabled' });
        const chatId = getChatId();
        if (!chatId) return Promise.resolve({ ok: false, reason: 'combat-session-unavailable' });
        if (inventoryTakeover?.key === chatId) return inventoryTakeover.promise;
        const run = { key: chatId, promise: null };
        inventoryTakeover = run;
        const alive = () => inventoryTakeover === run && getChatId() === chatId && settings().enabled;
        run.promise = (async () => {
            let result = null;
            for (let attempt = 0; attempt < attempts; attempt += 1) {
                if (!alive()) return { ok: false, reason: 'request-stale' };
                getTables();
                try {
                    result = await bundle.inventory.ensure();
                } catch {
                    result = { ok: false, reason: 'inventory-ensure-failed' };
                }
                if (result?.ok === true || !INVENTORY_TRANSIENT.has(result?.reason) || attempt === attempts - 1) break;
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            if (result?.ok !== true) {
                pushDiagnostic('combat-inventory-takeover-failed', { reason: result?.reason || 'inventory-ensure-failed' });
                if (inventoryTakeover === run) inventoryTakeover = null;
            }
            return result || { ok: false, reason: 'inventory-ensure-failed' };
        })();
        return run.promise;
    }

    // 切换聊天：丢弃会话与缓存，取消进行中的后台任务，让表客户端缓存失效
    function resetChat() {
        chatEpoch += 1;
        generationTasks.invalidate();
        options.chatStore?.reset();
        ensureTask = null;
        stopProtagonistTableWatch();
        bundle?.readiness?.dispose();
        traitEpoch += 1;
        retireSession();
        session = null;
        sessionChatId = null;
        growthCache = null;
        lifeCache = null;
        lifeStamp = null;
        pointsCache = null;
        growthSnapshot = null;
        ensureFailure = null;
        inventoryTakeover = null;
        for (const listener of growthListeners.keys()) growthListeners.set(listener, null);
        try { bundle?.client.invalidate(); } catch { /* */ }
        cancelProtagonist();
        cancelAutoGrowth();
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        resetChat();
        retireBundle(bundle);
        modelRoute.dispose();
        protagonistListeners.clear();
    }

    // 计数快照，便于测试与诊断
    function getStats() {
        const live = session?.getPersistStats?.();
        return {
            tableExports: counters.retiredExports + (bundle ? bundle.client.stats.exports : 0),
            tableClientStats: bundle ? { ...bundle.client.stats } : null,
            refreshLifeRuns: counters.refreshLifeRuns,
            refreshLifeCacheHits: counters.refreshLifeCacheHits,
            refreshLifeCoalesced: counters.refreshLifeCoalesced,
            refreshGrowthRuns: counters.refreshGrowthRuns,
            refreshGrowthCoalesced: counters.refreshGrowthCoalesced,
            refreshGrowthRerunSkipped: counters.refreshGrowthRerunSkipped,
            notifies: counters.notifies,
            notifiesSuppressed: counters.notifiesSuppressed,
            sessionWrites: counters.retiredSessionWrites + (live ? live.writes + live.removes : 0),
        };
    }

    return {
        getSession, getLedger, ensureTables, statsTables, inventoryTables, syncRegex, resetChat, dispose, settings, inspectGenerationMaterials: materialContext.inspect, generateDeckProfile, regenerateDeck, respecClass, ascendClass,
        originStore, databaseReadiness, points, gamePointsRounds, mahjongPointsRounds, ensurePointsFloor, pointsSpendingGate, readSharedPoints, readOriginWallet, pointsSnapshot, withPointsLock,
        drawTrait, pickTrait, unlockTraitSlot, inscribeRelic, drawCard, flipCard, pickCard, upgradeCard, refreshGrowth, getGrowth, onGrowthUpdated, retryGrowth, setAllyTier, lifeSource, refreshLife,
        prepareProtagonist, getProtagonist, onProtagonistUpdated, autoPrepare, challengePromptQuota, intimateGate, intimatePrepared, combatSinceStart, challengeHistory, autoGrowth, checkReplayFor, checkPromptInput, partyPromptInput,
        getDiagnostics: () => diagnostics.map((item) => ({ ...item })), captureCombatInit, writeManualInit, buildCandidates, useInventoryItem, setGear,
        heroInventory, setHeroGear, sellHeroItem, takeoverInventory,
        // 以下为新增：计数快照（不改既有导出）
        getStats,
    };
}
