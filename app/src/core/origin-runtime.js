// 随身系统宿主层（Origin 系统 原作 vicliaaa，经授权移植）：把 scene/origin 的核心接到 IGS。
// 只做四件事：给核心提供 host（上下文、设置、存盘、生成、通知）、按总开关挂/卸监听、登记到界面接入点、设置变化时同步。
// 设置只读；生产操作经共用积分服务持久化，旧 chatMetadata.origin_v2 仅在数据库无记录时导入。
import { getSharedOriginEngine } from '../scene/origin/origin-engine.js';
import { attachOriginEngine } from '../visual/igs-ui/origin-attach.js';
import { normalizeOriginSettings, originRequestRoute } from '../visual/igs-ui/origin-settings.js';
import { runBackgroundGeneration, isBackgroundGenerationActive } from '../host/background-generation.js';
import { createModelRouteIdentity } from '../host/model-route-identity.js';
import { createPointsEngine } from '../scene/points/points-engine.js';
import { createPointsIntents } from '../storage/points-intents.js';

// 核心的通知类别 → 阅读器细线的级别。
const NOTICE_LEVEL = Object.freeze({ warn: 'warn', info: 'info' });

function externalPoints(value) {
    if (!value?.ok) return value || { ok: false, reason: 'origin-wallet-unavailable' };
    if (value.mode === 'shared') {
        return Number.isSafeInteger(value.balance)
            ? { ok: true, balance: value.balance, mode: 'shared' }
            : { ok: false, reason: 'origin-points-invalid' };
    }
    const balance = value.balance - value.origin;
    return Number.isSafeInteger(balance) ? { ok: true, balance, mode: 'legacy' } : { ok: false, reason: 'origin-points-invalid' };
}

export function createOriginRuntime({ getContext, readSettings, readLlm, readProfiles, secondaryLlm, notice, openSettings, saveSetting, legacyActive, combatServices, chatStore, storage = null, pointsFloorRecord = null, statsRuntime, readRuleset }) {
    const ctx = () => { try { return getContext() || null; } catch (error) { return null; } };
    const chatIdOf = () => {
        const c = ctx();
        if (!c) return '';
        if (c.chatId) return String(c.chatId);
        try { return typeof c.getCurrentChatId === 'function' ? String(c.getCurrentChatId() || '') : ''; } catch { return ''; }
    };
    const chatOf = () => (Array.isArray(ctx()?.chat) ? ctx().chat : []);
    let standalonePoints = null;
    const readStandalonePoints = () => {
        if (!chatStore || !storage) return { ok: false, reason: 'igs-points-not-integrated' };
        const owner = chatStore.get();
        const layout = owner.layout();
        if (!layout.ok) return layout;
        if (layout.layout !== 'v2') return { ok: false, reason: 'origin-wallet-unavailable' };
        const engine = pointsEngineOf();
        const held = engine.pending();
        if (!held.ok) return held;
        const read = owner.points.read({ fresh: true });
        if (!read.ok) {
            if (read.reason === 'points-table-missing') return { ok: true, balance: 0, mode: 'shared' };
            return read;
        }
        return Number.isSafeInteger(read.balance) ? { ok: true, balance: read.balance, mode: 'shared' } : { ok: false, reason: 'origin-points-invalid' };
    };
    function pointsEngineOf() {
        if (combatServices?.points) return combatServices.points();
        if (!chatStore || !storage) return null;
        if (!standalonePoints) {
            standalonePoints = createPointsEngine({
                store: () => chatStore.get().points,
                floors: pointsFloorRecord,
                chat: chatOf,
                chatId: chatIdOf,
                lock: task => chatStore.get().withPointsLock(task),
                wallet: async () => readStandalonePoints(),
                intents: createPointsIntents(storage),
            });
        }
        return standalonePoints;
    }

    let profilesSnapshot = null;
    const modelRoute = createModelRouteIdentity({ getContext: ctx, readConfig: () => {
        const s = normalizeOriginSettings(readSettings());
        const route = originRequestRoute(s, readLlm(), profilesSnapshot);
        return { route: s.route, profile: s.llmProfile, model: s.model,
            llm: route.via === 'llm' ? route.llm : { source: 'tavern' } };
    } });
    const stale = () => Object.assign(new Error('request-stale'), { reason: 'request-stale' });
    const check = task => {
        if (task.signal?.aborted || task.shouldStart?.() === false) throw stale();
    };

    async function viaTavern(prompt, task) {
        const c = ctx();
        if (!c) throw new Error('酒馆上下文不可用');
        if (task.signal?.aborted || task.shouldStart?.() === false) throw Object.assign(new Error('request-stale'), { reason: 'request-stale' });
        if (typeof c.generateQuietPrompt === 'function') {
            return String(await c.generateQuietPrompt({ quietPrompt: prompt }) || '');
        }
        if (typeof c.generateRaw === 'function') return String(await c.generateRaw({ prompt }) || '');
        throw new Error('当前酒馆不支持后台生成');
    }

    // 设置快照引用不变就复用上次规范化的结果：核心按引用缓存 fillSettings，每次给新对象会让它每次都重新序列化比对。
    let lastRaw;
    let lastNorm = null;
    const hasDatabase = Boolean(chatStore || combatServices);
    const hasPoints = Boolean(combatServices || (chatStore && storage));
    const host = {
        getContext: ctx,
        generationIdentity: () => chatStore ? chatStore.get() : combatServices?.originStore() || null,
        ...(hasDatabase ? {
            database: () => chatStore ? chatStore.get().origin : combatServices.originStore(),
            databaseReadiness: () => chatStore ? chatStore.get().readiness : combatServices.databaseReadiness(),
            wallet: async (options) => {
                if (combatServices) {
                    return options?.intent
                        ? combatServices.readOriginWallet(options)
                        : externalPoints(await combatServices.readSharedPoints());
                }
                if (chatStore && storage) {
                    if (options?.intent) {
                        const owner = chatStore.get();
                        owner.client.invalidate();
                        const checked = owner.origin.read({ intent: options.intent });
                        if (!checked.ok) return checked;
                        if (checked.revision !== options.intent.revision && checked.revision !== options.intent.record?.payload.parent) {
                            return { ok: false, reason: 'origin-database-conflict' };
                        }
                    }
                    return readStandalonePoints();
                }
                return { ok: false, reason: 'igs-points-not-integrated' };
            },
            walletSnapshot: () => {
                if (combatServices) return externalPoints(combatServices.pointsSnapshot());
                if (chatStore && storage) return readStandalonePoints();
                return { ok: false, reason: 'igs-points-not-integrated' };
            },
            pointsEconomy: () => hasPoints,
            ensurePointsFloor: messageId => {
                if (combatServices) return combatServices.ensurePointsFloor(messageId);
                if (typeof pointsFloorRecord?.ensure === 'function') return pointsFloorRecord.ensure(messageId);
                return Promise.resolve({ ok: false, reason: 'points-floor-unsupported' });
            },
            spendingGate: () => {
                if (combatServices) return combatServices.pointsSpendingGate();
                const engine = pointsEngineOf();
                return engine ? engine.spendingGate() : { ok: false, reason: 'igs-points-not-integrated' };
            },
            withPointsLock: (task) => {
                if (combatServices) return combatServices.withPointsLock(task);
                if (chatStore) return chatStore.get().withPointsLock(task);
                return task();
            },
            creditSharedPoints: (args) => {
                const engine = pointsEngineOf();
                return engine ? engine.credit(args) : Promise.resolve({ ok: false, reason: 'igs-points-not-integrated' });
            },
            spendSharedPoints: (args) => {
                const engine = pointsEngineOf();
                return engine ? engine.spend(args) : Promise.resolve({ ok: false, reason: 'igs-points-not-integrated' });
            },
            recoverSharedPointsOp: (sourceId, opts) => {
                const engine = pointsEngineOf();
                return engine ? engine.recoverOperation(sourceId, opts) : Promise.resolve({ ok: false, reason: 'igs-points-not-integrated' });
            },
        } : {}),
        // 核心内部 fillSettings 会返回新对象，不会改这里给出的快照。
        settings: () => {
            const raw = readSettings();
            if (!lastNorm || raw !== lastRaw) { lastRaw = raw; lastNorm = Object.freeze(normalizeOriginSettings(raw)); }
            return lastNorm;
        },
        saveMetadata: () => {
            const c = ctx();
            const save = c && (c.saveMetadataDebounced || c.saveMetadata);
            if (typeof save === 'function') save.call(c);
        },
        // 经酒馆发起的后台请求会触发全局生成事件；包在 runBackgroundGeneration 里，核心据 isBackground 跳过。
        generate: async (kind, prompt, task = {}) => {
            const s = normalizeOriginSettings(readSettings());
            const llm = { ...readLlm() };
            const before = modelRoute.get();
            check(task);
            // 选了副 LLM 预设才读预设文件；读失败按没选处理（回落「备用模型」页当前连接）。
            let profiles = null;
            if (s.route === 'llm' && s.llmProfile && typeof readProfiles === 'function') {
                try { profiles = await readProfiles(); } catch (error) { profiles = null; }
            }
            check(task);
            if (modelRoute.get() !== before) throw stale();
            profilesSnapshot = profiles;
            const route = originRequestRoute(s, llm, profiles);
            const identity = modelRoute.get();
            task.guard?.(() => modelRoute.get() === identity);
            const verify = async () => {
                if (s.route === 'llm' && s.llmProfile && typeof readProfiles === 'function') {
                    try { profilesSnapshot = await readProfiles(); } catch { throw stale(); }
                }
                check(task);
                if (modelRoute.get() !== identity) throw stale();
            };
            // 备用模型直接发请求，不触发酒馆生成事件，不必标后台；标了反而会让这期间用户正常发的消息漏掉注入。
            try {
                const reply = route.via === 'llm' && secondaryLlm
                    ? await secondaryLlm.request({ system: '', user: prompt }, { ...route.llm, signal: task.signal, onSlow: task.onSlow })
                    : await runBackgroundGeneration(() => viaTavern(prompt, task));
                await verify();
                return reply;
            } catch (error) { await verify(); throw error; }
        },
        isBackground: () => isBackgroundGenerationActive(),
        notify: ({ kind, text }) => {
            if (!text || typeof notice !== 'function') return;
            try { notice(NOTICE_LEVEL[kind] || 'info', String(text)); } catch (error) { /* 细线出错不影响结算 */ }
        },
        legacyActive: () => { try { return Boolean(legacyActive && legacyActive()); } catch (error) { return false; } },
        // 当前体系（coc7 / dnd5e），随身系统按它换算属性奖励。
        readRuleset: () => { try { return typeof readRuleset === 'function' ? readRuleset() : 'coc7'; } catch (error) { return 'coc7'; } },
    };

    const engine = getSharedOriginEngine(host);
    const detach = attachOriginEngine(engine, {
        settings: readSettings,
        notice: (level, text) => host.notify({ kind: level, text }),
        openSettings,
        saveSetting,
        ...(statsRuntime ? { exchange: {
            info: () => statsRuntime.exchangeInfo(),
            quote: points => statsRuntime.quoteExchange(points),
            confirm: quote => statsRuntime.exchangePoints(quote),
            retry: () => statsRuntime.retryExchange(),
        } } : {}),
    });

    return {
        engine,
        // 总开关或其他设置变化后调用：开就挂监听并读存档，关就解绑。
        sync: () => engine.sync(),
        // 随身系统自己的属性加成 [{ name, val }]（只读）；IGS 数值系统按同名叠加。
        rawStats: () => engine.rawStats(),
        destroy: () => { modelRoute.dispose(); try { engine.release(); } catch (error) { /* */ } detach(); },
    };
}

// 原版 Origin 扩展在页面里时会挂 #origin-root 悬浮层并在 extension_settings.origin 里开着。
export function originLegacyActive(globalObject) {
    try {
        const doc = globalObject && globalObject.document;
        if (!doc || !doc.getElementById('origin-root')) return false;
        const ext = globalObject.extension_settings || (globalObject.SillyTavern && globalObject.SillyTavern.getContext && globalObject.SillyTavern.getContext().extensionSettings);
        return !ext || !ext.origin || ext.origin.enabled !== false;
    } catch (error) {
        return false;
    }
}
