// 战斗服务装配：把战斗表、背包表、账本、会话、成长生成、主角档案、检定回放等装配成一组可注入的服务。
// 阅读器与设置页只通过这里取服务；总开关（combatExpansion.enabled）关闭时各入口返回 combat-disabled，不碰表。
// 性能约定（相对 v0.39）：
//   - 战斗表与背包表共用同一个带缓存的表客户端（createCachedTableClient），api 变化时重建并 dispose 旧客户端；
//   - refreshLife / refreshGrowth 连续触发合并成一次执行，只读场景在表版本与楼层未变时直接用缓存；
//   - 成长监听者只在有效状态签名变化时才被通知（内部缓存照常更新）；
//   - 同一事件内账本有效状态只取一次并传递。
import { createCachedTableClient, createCombatTables } from '../data/shujuku/combat-tables.js';
import { createCombatMaterialContext } from './combat-material-context.js';
import { createInventoryTables } from '../data/shujuku/inventory-tables.js';
import { PROTAGONIST_ALIASES, abilitiesForName, createCombatLedger, grantGeneratedGear, heroPointLog, signaturePending, vitalsForName } from '../combat/ledger.js';
import { createCombatSession, locateCombatStart, partyStatus } from '../combat/session.js';
import { combatBodyText } from '../scene/combat-directives.js';
import { withFloorNote } from '../combat/floor-note.js';
import {
    checkCorrections, checkRollPairsFor, floorCheckOrdinal, floorCheckSwipe, floorIndexOfOrdinal, replayChecks, upcomingCheckOrdinal, upcomingCheckSwipe,
} from '../scene/check-rolls.js';
import {
    classTierEntity, deckProfileEntities, generationWrites, growthEntity, profileGearEntity, profileRecord, resolveCombatLlm, respecClassEntity, traitEntity,
    withCharacterLore, withStoryContext,
} from '../combat/generation.js';
import { generateWithRetry } from '../combat/generation-retry.js';
import { itemIdFor, normalizeProfile, profileIdFor } from '../combat/schema.js';
import { COMBAT_RULES } from '../combat/rules.js';
import { ASCEND_TIERS, REBUILD_COST, RESPEC_COST, TRAIT_DRAW_COST } from '../combat/points.js';
import { TRAIT_BASE_SLOTS, keptInnateKinds, nextTraitSlot, planTrait, traitFits, traitSeed } from '../combat/traits.js';
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

// 建表失败里「表还没就绪/读失败」属于暂时性原因，不记成该聊天的建表失败
const TRANSIENT_TABLE_REASONS = new Set(['combat-table-not-ready', 'combat-table-read-failed']);
// 会话处于这些状态时牌组/装备只读
const BUSY_STATUSES = Object.freeze(['preparing', 'battle', 'ended', 'send-failed']);
// 自动备战要避让的会话状态 / 已有结果的状态
const PREPARE_BUSY_STATUSES = Object.freeze(['preparing', 'battle', 'ended', 'send-failed']);
const PREPARE_DONE_STATUSES = Object.freeze(['lobby', 'blocked', 'done', 'skipped']);
// 生命缓存（只读场景复用）的兜底有效期，防止楼层被外部改动却签名不变
const LIFE_CACHE_TTL_MS = 10000;
const EMPTY_POINT_LOG = Object.freeze([]);
const DIAGNOSTICS_MAX = 20;

// 楼层签名：楼数 + 每层（是否用户楼、swipe、正文长度）的滚动哈希，用来判断楼层有没有变
function chatSignature(chat) {
    let hash = 2166136261;
    for (const message of chat) {
        const swipe = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
        const length = String(message?.mes ?? '').length;
        hash = Math.imul(hash ^ ((message?.is_user ? 1 : 0) + swipe * 2 + length * 64), 16777619) >>> 0;
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
    let traitEpoch = 0;
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
    const getBuildMode = () => {
        try {
            return (typeof options.buildMode === 'function' && options.buildMode()) || null;
        } catch {
            return null;
        }
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
            task.promise = Promise.resolve().then(() => impl.ensure()).catch(() => ({ ok: false, reason: 'combat-table-create-failed' })).then((result) => {
                if (ensureTask === task) ensureTask = null;
                const stillCurrent = bundle?.impl === impl;
                if (result?.ok !== true) {
                    if (stillCurrent && !TRANSIENT_TABLE_REASONS.has(result?.reason)) ensureFailure = { key: chatKey, reason: result?.reason || 'combat-table-create-failed' };
                } else if (result.created?.length && stillCurrent && getChatId() === chatKey) {
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
        async function readWithEnsure() {
            const read = await raw.read();
            if (read?.ok !== true || !(read.missing?.length || read.optionalMissing?.length)) return read;
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
        counters.retiredExports += old.client.stats.exports;
        try { old.client.dispose(); } catch { /* */ }
    }

    // 取战斗表实现；宿主 api 变了就整套重建（共用同一个缓存客户端）
    function getTables() {
        const api = global.AutoCardUpdaterAPI || null;
        if (!bundle || bundle.api !== api) {
            retireBundle(bundle);
            const client = createCachedTableClient({ api });
            const raw = createCombatTables({ api, client });
            const inventory = createInventoryTables({ api, client, serial: raw.serial });
            bundleGeneration += 1;
            bundle = { api, client, raw, impl: wrapTables(raw), inventory, generation: bundleGeneration };
            ledger = createCombatLedger({
                tables: bundle.impl, chat: getChat, userName: getUserName, sourceFilter: getSourceFilter,
                difficulty: () => settings().difficulty, inventory,
                // 随身系统的原始积分并入主角余额（战斗积分与随身系统积分合成一个余额）。
                wallet: () => (typeof options.getWallet === 'function' ? options.getWallet() : 0),
            });
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
                buildMode: getBuildMode, difficulty: () => settings().difficulty, reportDetail: () => settings().reportDetail, retryDelays,
                awaitProtagonist: () => (protagonistTask && protagonistTask.key === protagonistKey() ? protagonistTask.promise : null),
                kinds,
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

    // 穿/卸装备；hint 可带入 setHeroGear 刚读过的状态
    function setGear(characterId, gearId, equip, hint = null) {
        return enqueue(async () => {
            const context = await ledgerContext(hint);
            if (!context.ok) return context;
            const character = context.state.characters.get(characterId);
            if (!character) return { ok: false, reason: 'combat-character-missing' };
            const gear = equip ? (character.gear?.bag || []).find((entry) => entry.gearId === gearId) : Object.values(character.gear?.slots || {}).find((slot) => slot?.gearId === gearId);
            return gear
                ? withNote(`（${character.name || ''}${equip ? '装上了' : '卸下了'}${gear.name}）`, () => context.ledgerImpl.setGear(characterId, gearId, equip === true))
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
    function sellHeroItem(kind, id) {
        return enqueue(async () => {
            if (isDeckBusy()) return { ok: false, reason: 'combat-deck-readonly' };
            const context = await ledgerContext();
            if (!context.ok) return context;
            const heroId = context.state.attributes?.heroId;
            if (!heroId || !context.state.characters.get(heroId)) return { ok: false, reason: 'combat-points-not-protagonist' };
            const write = kind === 'gear' ? context.ledgerImpl.sellGear : kind === 'keepsake' ? context.ledgerImpl.sellKeepsake : null;
            if (typeof write !== 'function') return { ok: false, reason: 'combat-sell-unavailable' };
            return write(String(id || ''));
        });
    }

    async function setHeroGear(gearId, equip) {
        const context = await ledgerContext();
        if (!context.ok) return context;
        const heroId = context.state.attributes?.heroId;
        if (!heroId || !context.state.characters.get(heroId)) return { ok: false, reason: 'combat-points-not-protagonist' };
        return setGear(heroId, gearId, equip === true, context);
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
            // NPC 属性档（数值系统）优先，没有再走账本与推导。
            readAbilities: (name, extra) => {
                let sheet = null;
                try { sheet = typeof options.npcAbilities === 'function' ? options.npcAbilities(name) : null; } catch { sheet = null; }
                return sheet || (state ? abilitiesForName(state, name, getUserName(), extra) : null);
            },
            readVitals: (name, extra) => (state ? vitalsForName(state, name, getUserName(), extra) : null),
            // 主角的战斗积分净流水（原始值，不含随身系统积分）；战斗数据没就绪时按 0。
            readPoints: () => { const heroId = state && state.attributes && state.attributes.heroId; const hero = heroId ? state.characters.get(heroId) : null; return hero ? Number(hero.points) || 0 : 0; },
            // 主角积分进出流水（原始值，按楼号），战斗数据没就绪时为空；同一状态返回同一数组。
            readPointLog: () => (state ? heroPointLog(state) : EMPTY_POINT_LOG),
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
    async function writeManualInit(name, value, { signal, replace = false } = {}) {
        const chatId = getChatId();
        if (!chatId) return { ok: false, reason: 'combat-generate-unavailable' };
        getTables();
        const ledgerImpl = ledger;
        const stillValid = () => getChatId() === chatId && ledger === ledgerImpl && !signal?.aborted;
        let written;
        try {
            written = await ledgerImpl.writeInit(name, value, { signal, shouldStart: stillValid, manual: true, replace });
        } catch {
            written = { ok: false, reason: 'combat-init-write-failed' };
        }
        if (written?.ok === true && stillValid()) {
            await refreshLife();
            if (settings().enabled) await refreshGrowth();
        }
        return written;
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
        getTables();
        const { raw, client, generation } = bundle;
        const probe = raw.probe();
        return probe.ok
            ? {
                ok: true,
                // 数值侧缓存同时跟随宿主接口替换和表更新，不能只认自己的写入次数。
                get version() { return `${generation}:${client.version()}`; },
                read: (readOptions) => raw.read(readOptions),
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

    async function ensureTables() {
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
    async function generateGrowth({ signal, messageIds = null, reuseSnapshot = false } = {}) {
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        if (!ledgerImpl) return { ok: false, reason: 'combat-generate-unavailable' };
        let scan;
        let state;
        if (reuseSnapshot && growthSnapshot && growthSnapshot.key === cacheKey()) {
            ({ scan, state } = growthSnapshot);
        } else {
            scan = await ledgerImpl.scan();
            if (!scan.ok) return { ok: false, reason: scan.reason || 'combat-ledger-scan-failed' };
            state = await ledgerImpl.effectiveState();
        }
        if (!scan.ok) return { ok: false, reason: scan.reason || 'combat-ledger-scan-failed' };
        if (!state.ok) return { ok: false, reason: state.reason };
        const entities = [];
        const entries = [];
        let skipped = 0;
        const wanted = Array.isArray(messageIds) ? new Set(messageIds.map(Number)) : null;
        // 专属卡到期项（v0.39.2）与成长标签同一套楼层范围：锚点是跨级的 EXP 记录。
        for (const pending of [...(scan.pendingGeneration || []), ...signaturePending(state)]) {
            if (wanted && !wanted.has(Number(pending.anchor?.messageId))) continue;
            const character = pending.characterId ? state.characters.get(pending.characterId) : null;
            const built = growthEntity(pending, character, { classes: state.classes, now: Date.now(), profileMeta: state.profileMeta });
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
            if (signal?.aborted) return { ok: false, reason: 'request-stale' };
            const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, classes: state.classes, now: Date.now(), context, retryDelays });
            if (generated.reason === 'request-stale' || signal?.aborted) return { ok: false, reason: 'request-stale' };
            if (generated.reason) return { ok: false, reason: generated.reason, ...(generated.missing ? { missing: generated.missing } : {}) };
            const writes = generationWrites(generated, { createdAt: Date.now() });
            profiles = writes.profiles;
            entries.push(...writes.entries);
            rejected = generated.rejected;
            requestFailed = !!generated.requestFailure;
        }
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        if (profiles.length) {
            const written = await getTables().append('profile', profiles);
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

    // 手动重试成长生成：先等自动成长跑完，再强制重新扫描
    let autoGrowthRun = null; // { key, queued: Set, controller, promise }
    async function retryGrowth({ signal } = {}) {
        const running = autoGrowthRun?.promise;
        if (running) {
            try { await running; } catch { /* 自动成长失败不影响手动重试 */ }
        }
        return generateGrowth({ signal });
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
    // 生成一个角色的牌组档案（盟友或主角）
    async function generateDeckProfileCore({ name, classRef = null, role = 'ally', signal, onStart, onRetry, generationHint, materialSelection, materialChatId } = {}) {
        const actionChatId = getChatId();
        if (!settings().enabled) return { ok: false, reason: 'combat-disabled' };
        const ledgerImpl = getLedger();
        const target = String(name || '').trim();
        if (!ledgerImpl || !target) return { ok: false, reason: 'combat-generate-unavailable' };
        if (typeof request !== 'function') return { ok: false, reason: 'combat-llm-unavailable' };
        const characterId = profileIdFor('deck-character', target);
        const tables = getTables();
        if (typeof tables.pending === 'function' && tables.pending().some((item) => item.kind === 'profile' && String(item.key).startsWith(`${characterId}|`))) {
            const flushed = await tables.flush();
            if (flushed?.ok !== true) return { ok: false, reason: 'combat-profile-write-pending', write: flushed };
        }
        const state = await ledgerImpl.effectiveState();
        if (!state.ok) return { ok: false, reason: state.reason };
        if (state.characters.get(characterId)?.kind === 'deck-character') return { ok: false, reason: 'combat-profile-exists', id: characterId };
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return { ok: false, reason: llm.reason, ...(llm.missing ? { missing: llm.missing } : {}) };
        if (getChatId() !== actionChatId || signal?.aborted) return { ok: false, reason: 'request-stale' };
        const material = await materialContext.load({ name: target, signal, generationHint, materialSelection, materialChatId });
        if (!material.ok) return material;
        const usableClass = classRef && state.classes.has(classRef) ? classRef : null;
        // 按剧情给初始装备：随卡组档案同批请求；可省略，失败不影响卡组档案。
        // 主角的初始装备至少 1 件（v0.39.2），队友剧情没写到可为空。
        const entities = await withCharacterLore([...deckProfileEntities({ name: target, id: characterId, role, classRef: usableClass, classes: state.classes }), profileGearEntity(target, { required: role === 'protagonist' })], readLore);
        if (signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        try { onStart?.(); } catch { /* */ }
        const context = await withStoryContext({ protagonist: getUserName(), ...material.context }, readStoryContext, { names: [target, getUserName()], signal, full: true, persona: target !== getUserName() });
        if (signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, classes: state.classes, now: Date.now(), context, retryDelays, onRetry });
        if (generated.reason === 'request-stale' || signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return { ok: false, reason: generated.reason, ...(generated.missing ? { missing: generated.missing } : {}), requested: true };
        const writes = generationWrites(generated, { createdAt: Date.now() });
        if (!writes.profiles.some((profile) => profile.id === characterId)) {
            return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-deck-generation-failed', rejected: generated.rejected, requested: true };
        }
        const written = await tables.append('profile', writes.profiles);
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written, requested: true };
        const after = await ledgerImpl.effectiveState();
        if (!after.ok) return { ok: false, reason: after.reason, requested: true };
        if (after.characters.get(characterId)?.kind !== 'deck-character') return { ok: false, reason: 'combat-profile-unverified', id: characterId, requested: true };
        // 初始装备：档案读回确认后锚定最新楼层写 equip；写失败只记诊断，卡组档案照常生效。
        const gearDiagnostics = [];
        if (!signal?.aborted && getChatId() === actionChatId) await grantGeneratedGear(ledgerImpl, generated, (owner) => (owner === target ? characterId : null), { diagnostics: gearDiagnostics });
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

    async function regenerateDeck({ signal, generationHint, materialSelection, materialChatId } = {}) {
        const actionChatId = getChatId();
        const context = await heroActionContext('rebuildDeck', 'rebuild');
        if (!context.ok) return context;
        if (getChatId() !== actionChatId || signal?.aborted) return { ok: false, reason: 'request-stale' };
        const { ledgerImpl, state, hero } = context;
        if ((hero.points || 0) < REBUILD_COST) return { ok: false, reason: 'combat-points-insufficient' };
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return llmFailure(llm);
        const material = await materialContext.load({ name: hero.name, generationHint, materialSelection, materialChatId, signal });
        if (!material.ok) return material;
        const entities = await withCharacterLore(deckProfileEntities({ name: hero.name, id: hero.id, role: 'protagonist', classRef: hero.classRef, classes: state.classes }), readLore);
        if (signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        const story = await withStoryContext({ protagonist: getUserName(), ...material.context }, readStoryContext, { names: [hero.name], signal, full: true });
        if (signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, classes: state.classes, now: Date.now(), context: story, retryDelays });
        if (generated.reason === 'request-stale' || signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const profile = (generated.accepted || []).find((item) => item.profile?.id === hero.id)?.profile;
        if (!profile?.personalPool || !profile.starterDeck) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-deck-generation-failed' };
        // 新牌池每张牌加后缀，避免和旧牌 id 冲突
        const suffix = `r${Date.now().toString(36)}`;
        const idMap = new Map(profile.personalPool.map((card) => [card.id, `${card.id}-${suffix}`]));
        const rebuilt = { personalPool: profile.personalPool.map((card) => ({ ...card, id: idMap.get(card.id) })), starterDeck: profile.starterDeck.map((id) => idMap.get(id) || id) };
        if (signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        const written = await ledgerImpl.rebuildDeck(hero.id, rebuilt);
        return written?.ok !== true ? { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' } : { ok: true, id: hero.id, cost: REBUILD_COST };
    }

    async function respecClass({ classRef = null, signal, generationHint, materialSelection, materialChatId } = {}) {
        const actionChatId = getChatId();
        const context = await heroActionContext('respecClass', 'respec', { needLlm: !classRef });
        if (!context.ok) return context;
        if (getChatId() !== actionChatId || signal?.aborted) return { ok: false, reason: 'request-stale' };
        const { ledgerImpl, state, hero } = context;
        if ((hero.points || 0) < RESPEC_COST) return { ok: false, reason: 'combat-points-insufficient' };
        if (classRef) {
            if (!state.classes.has(classRef)) return { ok: false, reason: 'combat-class-missing' };
            if (classRef === hero.classRef) return { ok: false, reason: 'combat-respec-same-class' };
            const switched = await ledgerImpl.respecClass(hero.id, classRef);
            return switched?.ok !== true ? { ok: false, reason: switched?.reason || 'combat-ledger-insert-failed' } : { ok: true, id: hero.id, classRef, cost: RESPEC_COST };
        }
        const llm = resolveCombatLlm(getLlm());
        if (!llm.ok) return llmFailure(llm);
        const material = await materialContext.load({ name: hero.name, generationHint, materialSelection, materialChatId, signal });
        if (!material.ok) return material;
        const story = await withStoryContext({ protagonist: getUserName(), ...material.context }, readStoryContext, { names: [hero.name], signal, full: true });
        if (signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry([respecClassEntity({ id: hero.id, name: hero.name })], { request, llm: getLlm(), signal, classes: state.classes, now: Date.now(), context: story, retryDelays });
        if (generated.reason === 'request-stale' || signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const profile = (generated.accepted || []).find((item) => item.profile?.kind === 'class')?.profile;
        if (!profile) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-class-generation-failed' };
        const written = await getTables().append('profile', [profileRecord(profile, { createdAt: Date.now() })]);
        if (written?.ok !== true) return { ok: false, reason: 'combat-profile-write-failed', write: written };
        if (getChatId() !== actionChatId || signal?.aborted) return { ok: false, reason: 'request-stale' };
        const switched = await ledgerImpl.respecClass(hero.id, profile.id);
        return switched?.ok !== true
            ? { ok: false, reason: switched?.reason || 'combat-ledger-insert-failed', classRef: profile.id }
            : { ok: true, id: hero.id, classRef: profile.id, cost: RESPEC_COST, created: true };
    }

    async function ascendClass({ signal, generationHint, materialSelection, materialChatId } = {}) {
        const actionChatId = getChatId();
        const context = await heroActionContext('ascendClass', 'ascend');
        if (!context.ok) return context;
        if (getChatId() !== actionChatId || signal?.aborted) return { ok: false, reason: 'request-stale' };
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
        const story = await withStoryContext({ protagonist: getUserName(), ...material.context }, readStoryContext, { names: [hero.name], signal, full: true });
        if (signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        const entity = classTierEntity({ character: hero, cls: hero.classProfile, tier, rarity: tierRule.rarity, tierName: hero.tierName, mark: Date.now().toString(36) });
        const generated = await generateWithRetry([entity], { request, llm: getLlm(), signal, classes: state.classes, now: Date.now(), context: story, retryDelays });
        if (generated.reason === 'request-stale' || signal?.aborted || getChatId() !== actionChatId) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const tierProfile = (generated.accepted || []).find((item) => item.kind === 'class-tier')?.tier;
        if (!tierProfile) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-ascend-generation-failed' };
        const written = await ledgerImpl.ascendClass(hero.id, tierProfile);
        return written?.ok !== true ? { ok: false, reason: written?.reason || 'combat-ledger-insert-failed' } : { ok: true, id: hero.id, tier, tierName: tierProfile.tierName, cost: tierRule.cost };
    }

    async function drawTrait({ signal, onPlan } = {}) {
        const actionChatId = getChatId();
        const actionEpoch = traitEpoch;
        const context = await heroActionContext('drawTrait', 'trait');
        if (!context.ok) return context;
        const { ledgerImpl, state, hero } = context;
        const alive = () => !signal?.aborted && actionEpoch === traitEpoch && getChatId() === actionChatId && settings().enabled && getLedger() === ledgerImpl;
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
        try { onPlan?.({ rarity }); } catch { /* 界面回调失败不改变抽取结果。 */ }
        const traitId = `tr-${Date.now().toString(36)}`;
        const kept = keptInnateKinds(hero);
        const innate = [kept.includes('active') ? hero.profile?.heroSkill : null, kept.includes('passive') ? hero.profile?.personalPassive : null].filter(Boolean);
        const entities = await withCharacterLore([traitEntity({ character: hero, rarity, traitId, shape, existing: [...innate, ...(hero.traits || [])] })], readLore);
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const story = await withStoryContext({ protagonist: getUserName() }, readStoryContext, { names: [hero.name], signal });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const generated = await generateWithRetry(entities, { request, llm: getLlm(), signal, classes: state.classes, now: Date.now(), context: story, retryDelays });
        if (generated.reason === 'request-stale' || !alive()) return { ok: false, reason: 'request-stale' };
        if (generated.reason) return generationFailure(generated);
        const trait = (generated.accepted || []).find((item) => item.kind === 'trait')?.trait;
        if (!trait) return { ok: false, reason: generated.requestFailure ? 'combat-llm-request-failed' : 'combat-trait-generation-failed' };
        const written = await ledgerImpl.drawTrait(hero.id, trait);
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

    // ---- 主角档案（进入聊天后自动准备，状态可订阅） ----
    let protagonistState = { key: '', status: 'idle', reason: '', attempt: 0, requested: false };
    let protagonistTask = null; // { key, controller, promise }
    const protagonistListeners = new Set();
    // 换聊天后数据库载入当前聊天需要时间：读表暂时失败（未载入 / 读失败）时每 1.5 秒重试，最多 8 次（约 12 秒）；测试可经 options 缩短。
    const protagonistReadRetries = Number.isInteger(options.protagonistReadRetries) ? options.protagonistReadRetries : 8;
    const protagonistReadDelayMs = Number.isFinite(options.protagonistReadDelayMs) ? options.protagonistReadDelayMs : 1500;
    // 主角键：聊天 + 用户名，缺一则无主角
    const protagonistKey = () => {
        const chatId = getChatId();
        const userName = getUserName().trim();
        return chatId && userName ? JSON.stringify([chatId, userName]) : '';
    };

    function getProtagonist() {
        const key = protagonistKey();
        return !settings().enabled || !key || protagonistState.key !== key ? null : { name: getUserName().trim(), status: protagonistState.status, reason: protagonistState.reason, attempt: protagonistState.attempt };
    }

    function setProtagonistState(patch) {
        protagonistState = { ...protagonistState, ...patch };
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

    function cancelProtagonist() {
        const task = protagonistTask;
        protagonistTask = null;
        if (task) {
            try { task.controller?.abort(); } catch { /* */ }
        }
        if (protagonistState.status === 'generating' || protagonistState.status === 'retrying') setProtagonistState({ status: 'idle', reason: '', attempt: 0 });
    }

    // 账本里是否已有该名字（或别名）的牌组角色
    const hasDeckCharacter = (state, name) => {
        for (const character of state.characters.values()) {
            if (character.kind === 'deck-character' && (character.name === name || (character.profile?.aliases || []).includes(name))) return true;
        }
        return false;
    };

    function prepareProtagonist({ manual = false, generationHint, materialSelection, materialChatId } = {}) {
        if (!combatBattleOn(settings())) {
            cancelProtagonist();
            return Promise.resolve({ ok: false, reason: 'combat-disabled' });
        }
        const key = protagonistKey();
        if (!key) return Promise.resolve({ ok: false, reason: 'combat-generate-unavailable' });
        if (protagonistTask) {
            if (protagonistTask.key === key) return protagonistTask.promise;
            cancelProtagonist();
        }
        const previous = protagonistState.key === key ? protagonistState : null;
        if (previous?.status === 'ready') return Promise.resolve({ ok: true, status: 'ready' });
        let preparing = false;
        try {
            preparing = !!(session && sessionChatId === getChatId() && session.state().status === 'preparing');
        } catch {
            preparing = false;
        }
        if (preparing) return Promise.resolve({ ok: false, reason: 'combat-busy' });
        // 上次请求过 LLM 但失败：自动触发不再重复请求，只有手动才重试
        const skipRetry = !manual && previous?.status === 'failed' && previous.requested === true;
        const task = { key, controller: typeof AbortController === 'function' ? new AbortController() : null, promise: null };
        protagonistTask = task;
        const alive = () => protagonistTask === task && protagonistKey() === key && settings().enabled;
        task.promise = (async () => {
            try {
                // 只要战斗开关开着，进聊天就开始准备（v0.39.2）：刚换聊天时数据库常未载入当前聊天，读表的暂时失败有限重试，不就此停在空闲。
                let state;
                for (let attempt = 0; ; attempt += 1) {
                    try {
                        state = await getLedger().effectiveState();
                    } catch {
                        state = { ok: false, reason: 'combat-ledger-read-failed' };
                    }
                    if (state?.ok || !TRANSIENT_TABLE_REASONS.has(state?.reason) || attempt >= protagonistReadRetries || !alive()) break;
                    await new Promise((resolve) => setTimeout(resolve, protagonistReadDelayMs));
                }
                if (!alive()) return { ok: false, reason: 'request-stale' };
                if (!state?.ok) {
                    const reason = state?.reason || 'combat-ledger-read-failed';
                    if (!skipRetry) setProtagonistState({ key, status: 'idle', reason, attempt: 0, requested: false });
                    return { ok: false, reason };
                }
                if (hasDeckCharacter(state, getUserName().trim())) {
                    setProtagonistState({ key, status: 'ready', reason: '', attempt: 0, requested: false });
                    return { ok: true, status: 'ready' };
                }
                if (skipRetry) return { ok: false, reason: previous.reason, status: 'failed' };
                const generated = await generateDeckProfileCore({
                    name: getUserName().trim(), role: 'protagonist', signal: task.controller?.signal, generationHint, materialSelection, materialChatId,
                    onStart: () => { if (alive()) setProtagonistState({ key, status: 'generating', reason: '', attempt: 0, requested: false }); },
                    onRetry: ({ attempt }) => { if (alive()) setProtagonistState({ key, status: 'retrying', attempt }); },
                });
                if (!alive()) return { ok: false, reason: 'request-stale' };
                if (generated.ok || generated.reason === 'combat-profile-exists') {
                    setProtagonistState({ key, status: 'ready', reason: '', attempt: 0, requested: false });
                    return { ok: true, status: 'ready' };
                }
                setProtagonistState({ key, status: 'failed', reason: generated.reason, attempt: 0, requested: generated.requested === true });
                return { ok: false, reason: generated.reason, status: 'failed' };
            } catch {
                if (alive()) setProtagonistState({ key, status: 'failed', reason: 'combat-action-threw', attempt: 0, requested: true });
                return { ok: false, reason: 'combat-action-threw' };
            } finally {
                if (protagonistTask === task) protagonistTask = null;
            }
        })();
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
        if (!combatBattleOn(settings())) return Promise.resolve({ ok: false, reason: 'combat-disabled' });
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
        traitEpoch += 1;
        retireSession();
        session = null;
        sessionChatId = null;
        growthCache = null;
        lifeCache = null;
        lifeStamp = null;
        growthSnapshot = null;
        ensureFailure = null;
        inventoryTakeover = null;
        for (const listener of growthListeners.keys()) growthListeners.set(listener, null);
        try { bundle?.client.invalidate(); } catch { /* */ }
        cancelProtagonist();
        cancelAutoGrowth();
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
        getSession, getLedger, ensureTables, statsTables, syncRegex, resetChat, settings, inspectGenerationMaterials: materialContext.inspect, generateDeckProfile, regenerateDeck, respecClass, ascendClass,
        drawTrait, pickTrait, unlockTraitSlot, refreshGrowth, getGrowth, onGrowthUpdated, retryGrowth, setAllyTier, lifeSource, refreshLife,
        prepareProtagonist, getProtagonist, onProtagonistUpdated, autoPrepare, challengePromptQuota, intimateGate, intimatePrepared, combatSinceStart, challengeHistory, autoGrowth, checkReplayFor, checkPromptInput, partyPromptInput,
        getDiagnostics: () => diagnostics.map((item) => ({ ...item })), captureCombatInit, writeManualInit, buildCandidates, useInventoryItem, setGear,
        heroInventory, setHeroGear, sellHeroItem, takeoverInventory,
        // 以下为新增：计数快照（不改既有导出）
        getStats,
    };
}
