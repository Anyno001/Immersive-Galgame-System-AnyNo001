// 数值系统运行时装配（§3、§4.2、§10A；v2 §5、§6；易错点 A1–A6、B1–B3、H1/H2、N1/N2/N5–N7）。
// 只协调宿主事件、账本、注入与后台请求；结算规则在 scene/stats，正文解析不在这里做。
// 总开关关闭时不挂任何监听（sync 解绑）；本聊天未启用时不注入、不结算，数值冻结。
import { createGenerationTasks } from '../host/generation-tasks.js';
import { STATS_LOG_MAX, activeEntryBefore, createStatsLedger, currentStatsState, deleteFloorsFrom, ledgerKey, selectSwipe, stateBefore } from '../scene/stats/stat-ledger.js';
import { resettleFloor, settleFloor } from '../scene/stats/stat-ledger-settle.js';
import { MANUAL_DIMS, applyManualRelations, settleFloorText } from '../scene/stats/stat-settle.js';
import { FAVOR_TIERS, normalizeFavorTier, stageOf } from '../scene/stats/stat-favor.js';
import { START_DIMS, startFixOffsets } from '../scene/stats/stat-vocab.js';
import { APTITUDE_LEVELS, TRAIT_KEYS, createChatStatsStore, emptyCatalog, sanitizeCatalog, sheetAbilityScores } from '../scene/stats/stat-persist.js';
import {
    BUILD_CHOICES, chatEntries, diffChatRecords, floorRecord, importLegacyStats, initRecord, mergeStatLog, normalizeBuildMode, normalizeNpcChoice, normalizeNpcPolicy, statTagHash, verifyStatImport,
} from '../scene/stats/stat-log.js';
import { hash32 } from '../combat/random.js';
import { challengeDirectiveOf, parseChallengeReport } from '../combat/challenge-report.js';
import { battleDirectiveOf, parseBattleReport } from '../combat/battle-report.js';
import { ABILITY_KEYS, ABILITY_LABELS, BUILD_MODES, MANUAL_BUILD, MANUAL_TOTAL, abilityKeyOf } from '../combat/abilities.js';
import { normalizeHeroScores } from '../scene/stats/ability-fields.js';
import { checkRollPairsFor, floorCheckOrdinal, floorCheckSwipe, floorIndexOfOrdinal, mergeCheckInputs, replayChecks, upcomingCheckOrdinal, upcomingCheckSwipe, checkCorrections } from '../scene/check-rolls.js';
import { cocCheckCorrections, cocCheckRollsFor, replayCocChecks } from '../scene/stats/stat-coc-checks.js';
import { combatPartyLines } from '../scene/combat-prompt.js';
import { readStatsSettings } from '../scene/stats/stat-settings.js';
import { createStatsState, grudgeOfCharacter, heroDimsOf, investigatorView, isRomance } from '../scene/stats/stat-state.js';
import { applyEvolutions, evolveCandidates, evolveText } from '../scene/stats/stat-trait-evolve.js';
import { aptitudeLevel, applyTraitChange, getTraitDef, hasTrait, isComboKey, listTraits, setTraitAttrReader, slotUsage, traitCatalogOf, withAptitude } from '../scene/stats/stat-traits.js';
import { buildStatsPrompt, mandatesFromFlags } from '../scene/stats/stat-prompt.js';
import { pushStats, readSkillAdoptions, readTableAdoptions, withTimeout } from '../data/shujuku/stats-push.js';
import { statsPushActive } from '../data/shujuku/igs-managed.js';
import { canonicalAttribute, isSixAttribute } from '../data/shujuku/skill-table.js';
import { characterAttributeAxes, characterStatMetrics, createStatsMetricsLookup, protagonistSheetSummary, protagonistStatMetrics } from '../scene/stats/stat-metrics.js';
import { FAME_BAR_MAX, buildFameFillPrompt, fameDraftText, fameHudMetrics, famePairs, fameRows, fameTemplateBar, fameTier, fameValue, parseFameDraft, parseFameFill } from '../scene/stats/stat-fame.js';
import { stageLabel } from '../scene/stats/stat-relation-label.js';
import { swipeTextOf } from '../scene/stats/stat-log.js';
import { canonPersonName, removeChangeRows, removeFloorMeta, removeFromCatalog, removeInState, renameCatalog, renameChangeRows, renameFloorMeta, renameInState, validPersonName } from '../scene/stats/stat-rename.js';
import { statsRivalSet } from '../scene/stats/stat-rivals.js';
import { SKILL_TIER_ORDER, describeClockTrail, heroSkillCap, resolveHeroSlots, statsArchiveModel, statsClockTrail, statsFavorOverview, tierWordOfValue } from '../scene/stats/stat-archive.js';
import { BUILD_PICK_SLOTS, backfillHeroSlots, slotValue } from '../scene/stats/stat-build.js';
import { matchSkill } from '../scene/stats/stat-skill-match.js';
import { cryptoRandom } from '../scene/stats/stat-rng.js';
import { BUILTIN_SKILLS, CORE_SKILL_NAMES, editStorySkill, mergeStorySkill, registerStorySkill, removeStorySkill } from '../scene/stats/stat-registry.js';
import { worldSkillNames } from '../scene/stats/stat-world-skills.js';
import { applyTidy, buildTidyPrompt, parseTidyReply } from '../scene/stats/stat-story-tidy.js';
import { DEFAULT_SPECIAL_SKILLS, BASE_ATTRIBUTES } from '../scene/stats/stat-state.js';
import { COC_ATTRS, cocModeOf, cocSkillTotals, normalizeCocMode, sanitizeCocSheet } from '../scene/stats/coc-investigator.js';
import { NPC_COC_BATCH_MAX, buildNpcCocModuleRequest, buildNpcCocRequest, parseNpcCocReply } from '../scene/stats/stat-coc-npc.js';
import {
    PROTAGONIST, SAN_ATTRIBUTE, attributeNamesOf, chanceOf, heroBonusKey, heroBonusOf, heroBonusSkillNames, heroSkillLevel, cocSheetOf, checkLine, checkFxDetail, contestCheck, contestFxDetail, contestLine, engineFor, isProtagonist,
    gateAttributes, isSocialSkill, modifiersOf, profileOf, protagonistVitals, resolveCheck, resolveDiceRequest, withAbilityMemo, withoutHeroBonus,
} from '../scene/stats/stat-engine.js';
import {
    PROTAGONIST_BACKFILL_MAX, SHEET_BATCH_MAX, applyBackfillToSheet, buildBackfillRequest, buildSheetRequest, capSkillTier, sheetHistoryContext,
    buildHeroSkillRequest, buildStartRelationRequest, parseBackfillReply, parseHeroSkillReply, parseSheetReply, parseStartRelationReply, sheetAttributeInput, sheetFromTiers, SKILL_TIERS, bandValue,
} from '../scene/stats/stat-sheets.js';
import { parseDiceCommand } from '../choices/dice-check.js';
import { CURRENCY_CATEGORY, CURRENCY_DESCRIPTION, currencyBalanceOf, normalizeCurrencyConfig, normalizeCurrencyRecord, normalizeCurrencySettlement } from '../scene/stats/stat-currency.js';
import { buildHeroInitRequest, describeHeroInitFailure, heroInitRequestFailure, parseHeroInitReply } from '../scene/stats/stat-hero-init.js';
import { currencyEditRecord, normalizeCurrencyEditInput } from '../scene/stats/stat-currency-edit.js';
import { createCurrencyEditIntents } from '../storage/currency-edit-intents.js';
import { createHeroInitIntents } from '../storage/hero-init-intents.js';
import { createCurrencyEditor } from './stats-currency-edit.js';
import { createStatsGenerationIntents } from '../storage/stats-generation-intents.js';
import { createStatsGenerationSave } from './stats-generation-save.js';
import { WORLDVIEWS } from '../scene/worldview.js';
import { parseStatDirectives, stripStatDirectives } from '../scene/stats/stat-directives.js';
import { traitEnvOf } from '../scene/stats/stat-trait-env.js';
import { luckyReroll, traitEdgeOf } from '../scene/stats/stat-trait-dice.js';
import { EVENT_TYPES as BOND_EVENT_TYPES, repairLegacyStart } from '../scene/stats/stat-trait-rules-bond.js';
import { TRAIT_DEFS } from '../scene/stats/stat-traits.js';
import { applyReview, buildReviewPayload, judgedNames, reviewMemoryOf, reviewMemoryWrite, buildReviewPrompt, parseReviewEvents, parseReviewReply, scanFloorForReview, parseReviewStatuses, parseReviewWorlds, applyReviewStatuses } from './trait-review.js';
import { STATUS_DEFS, WORLD_GENRES, subInWorlds } from '../scene/stats/stat-status-defs.js';
import { applyStatusChange, setCycle, startCycleToday, statusesOf } from '../scene/stats/stat-status.js';
import { achievementPass, lightCodex, refreshCombos, comboNotices, traitNoticeText } from './stats-trait-runtime.js';

export const STATS_PROMPT_KEY = 'igs-stats-state';
const IN_CHAT = 1;
const NONE = -1;
const SKIP_TYPES = new Set(['quiet', 'impersonate']);
// 「按剧情拟写」读取最近楼层。
const HERO_NOTE_FLOORS = 12;
const DIAG_MAX = 50;
// 复核提示词里列的恩仇事件（短表；解析仍认全部 EVENT_TYPES）。
const TRAIT_REVIEW_PROMPT_EVENTS = Object.freeze(['救命', '帮忙', '报恩', '结怨', '和解', '复仇', '偷窃成功', '谎言揭穿', '猜忌']);
const SKILLS_LINE_MAX = 20;
const PRESENT_MAX = 3;
const BACKGROUND_TIMEOUT_MS = 60000;
// 起始关系一次带多人资料与世界书，提示词常过万 token，经反代时一分钟内回不来。
const START_TIMEOUT_MS = 180000;
// 补填起始关系时，好感、信任、了解都在这个范围内的角色视为还没定过初值。
const START_FILL_SPAN = 10;
// 起始关系只管这三项，芥蒂不参与补填。
const START_FILL_DIMS = Object.freeze(['好感', '信任', '了解']);
// AI 填表窗口的兜底时长：收到「开始填表」后一直没有表格更新就自动退出窗口。
const FILL_WINDOW_MAX = 120000;
// 自己写表后表格插件仍会触发更新回调，这段时间内的更新不当作用户手改。
const SELF_WRITE_QUIET = 2500;
// 填表窗口关闭后的余波时长：插件一轮填表可能连发几次更新，这段时间内的更新仍按 AI 填表处理。
const FILL_GRACE = 5000;
// 采纳遇到正在写表时最多顺延几次（每次 TABLE_PUSH_DELAY），超出就放弃本次，等下一次表格更新。
const TABLE_SYNC_RETRY_MAX = 5;

function lastUserText(c) {
    const chat = c && Array.isArray(c.chat) ? c.chat : [];
    for (let i = chat.length - 1; i >= 0; i -= 1) if (chat[i] && chat[i].is_user) return String(chat[i].mes ?? '');
    return '';
}

function chatIdOf(c) {
    try { if (c && typeof c.getCurrentChatId === 'function') return String(c.getCurrentChatId() ?? ''); } catch (error) { /* */ }
    return String((c && c.chatId) || '');
}

function cardOf(c) {
    if (!c) return '';
    const ch = Array.isArray(c.characters) && Number.isInteger(Number(c.characterId)) ? c.characters[Number(c.characterId)] : null;
    return String((ch && (ch.avatar || ch.name)) || c.name2 || '');
}

// 默认登记：已登记角色、当前角色卡名、群聊成员（§5.1B 条件 1/2）、世界书里确认过的角色、数据库表格里的人物；仅手动档只认已登记角色。
function defaultResolver(c, register, worldRoles = null, tableNames = null, isHero = null) {
    return (name, state) => {
        // 用户角色只有生活条，不按人际角色登记（表格或世界书里写了人设名也一样）。
        if (isHero && isHero(name)) return null;
        if (Object.hasOwn(state.characters, name)) return name;
        if (register === 'manual' || !c) return null;
        const names = [c.name2, ...(Array.isArray(c.groupMembers) ? c.groupMembers : [])].filter((n) => typeof n === 'string' && n.trim());
        if (names.includes(name)) return name;
        if (tableNames && tableNames.has(name)) return name;
        return worldRoles && worldRoles.has(name) ? name : null;
    };
}

// 表格人物名单的复用时长：连续结算多楼时只读一次表格。
const TABLE_PEOPLE_TTL = 3000;
// 表格更新后等这么久再写回：数据库插件一轮常连写多张表，合并成一次。
const TABLE_PUSH_DELAY = 800;

const ATTRIBUTE_WORD = (v) => (v >= 75 ? '顶尖' : v >= 60 ? '出众' : v >= 45 ? '普通' : v >= 35 ? '偏弱' : '很弱');
const PERCEPTION_WORD = ['迟钝，常漏掉细节', '普通，明显的变化能注意到', '敏锐，能察觉异样', '很敏锐，能发现藏起来的线索', '极其敏锐，几乎不会漏掉什么'];
const signed = (n) => (n >= 0 ? `+${n}` : String(n));
const IS_COC = (engine) => engine.ruleset.ID === 'coc7';
// 属性所属体系的检定：战斗六维之外，主角技能表里只放 8 个特有技能与成长过的技能（含CoC的理智）。
// CoC 下合并账本、批量分配的底数与玩家手改（取 heroSkillLevel 的生效值）；D&D 仍只读账本。
const learnedSkills = (state, engine = null) => {
    const owned = state.protagonist.skills;
    const merged = Boolean(engine);
    // 随身系统同名加成：带加成的技能一律列出，值取叠加后的生效值（profileOf）。
    const bonusNames = engine ? heroBonusSkillNames(engine) : new Set();
    const names = [...new Set([...(merged ? [...Object.keys(owned), ...Object.keys(engine.protagonistBase), ...Object.keys(engine.protagonistEdit)] : Object.keys(owned)), ...bonusNames])];
    return names.filter((name) => !BASE_ATTRIBUTES.includes(name) && name !== SAN_ATTRIBUTE)
        .map((name) => [name, bonusNames.has(name) ? Math.round(Number(profileOf(engine, state, PROTAGONIST, name).value) || 0) : merged ? heroSkillLevel(engine, owned[name], name) || 0 : Number(owned[name] && owned[name].value) || 0]).filter(([, v]) => v >= 25)
        .sort((a, b) => b[1] - a[1]).slice(0, SKILLS_LINE_MAX);
};

// 主角技能一行（v2 §8 skills 段），按规则体系分流：D&D写检定修正（力量+2），CoC写百分制档位词；技能只列入门以上，不写数字。
function perceptionLineOf(engine, state) {
    const skills = state.protagonist.skills;
    const spot = Number(skills.侦查 && skills.侦查.value) > 0;
    const p = profileOf(engine, state, PROTAGONIST, spot ? '侦查' : '感知');
    if (!IS_COC(engine)) {
        const passive = engine.ruleset.passiveValue(p);
        return PERCEPTION_WORD[passive >= 18 ? 4 : passive >= 15 ? 3 : passive >= 12 ? 2 : passive >= 9 ? 1 : 0];
    }
    const v = Number(p.value) || 0;
    return PERCEPTION_WORD[v >= 85 ? 4 : v >= 65 ? 3 : v >= 50 ? 2 : v >= 30 ? 1 : 0];
}

// 按楼序号取骰序：D&D 是 [主骰, 备骰] 对，CoC 是 { unit, tens }。
const rollsFor = (coc, chatId, ordinal, swipe) => (coc ? cocCheckRollsFor(chatId, ordinal, swipe) : checkRollPairsFor(chatId, ordinal, swipe));

// 确定性种子（规格 §6 / v0.39）：同聊天同楼同 swipe 永远得到同一个结算种子。
function settleSeed(chatId, ordinal, swipe, kind = 'settle') {
    const id = String(chatId || '').trim();
    if (!id || !Number.isSafeInteger(ordinal) || ordinal < 1) return null;
    return hash32(`igs-stat-${kind}|${id}|${ordinal}|s${Number.isSafeInteger(swipe) && swipe > 0 ? swipe : 0}`);
}

export function createStatsRuntime({
    getContext, readSettings, resolveCharacter, isNsfw = () => false, presentOf = null, onChange = () => {}, onBuildPolicyChange = () => {},
    worldRoles = null, getPushClient = () => null, pushOptions = {}, isBackground = () => false, getBackgroundRequest = () => null, generationIdentity = () => null, generationRoute = () => null,
    describePeople = null, readSheetContext = null, sheetStore = null, onCheck = () => {}, onNotices = () => {}, resumeReply = null, worldviewOf = () => '',
    attributeAccess = null, combatSource = () => null, statsTables = () => null, combatPrompt = () => null, combatEnabled = () => false,
    // 剧情货币所在的物品表读写口（createInventoryTables 的产物：read / changeQuantities）。
    currencyInventory = () => null, pointsExchange = () => null, currencyEditStorage = null,
    // 数据库表格里的人物名单（人际关系页同一套读法），供「从表格导入角色」登记。
    tablePeople = null, plotSetting = () => '',
    // 随身系统的原始属性 [{ name, val }]（只读，百分制加成）；随身系统读不到 IGS，这里不回写。
    originStats = () => null,
    // 场景素材里「设为User立绘」的角色名（可为空）。
    userCharacter = () => '',
    // 场景素材的角色别名表 { 角色名: [别名...] }，用于把用户角色的别名也认成主角。
    characterAliases = () => ({}),
    // 当前情绪分组 [{ label, words }]（场景素材 moodGroups），好感方向词的情绪组兜底识别用；缺省用默认分组。
    moodGroups = () => null,
    // 全局特质图鉴存储 { get(), set(next) }（跨聊天、跨角色卡）；缺省不记图鉴。
    traitCodexStore = null,
} = {}) {
    const store = createChatStatsStore(getContext);
    let ledger = null;
    let chatEnabled = false;
    let buildMode = null;
    let buildChoices = {};
    let npcPolicy = null;
    let npcChoices = {};
    let baseline = new Map();
    let learned = {};
    let catalog = emptyCatalog();
    let blocked = '';
    let unavailable = '';
    let declined = false;
    let generating = null;
    let offs = [];
    let pushing = null;
    let pendingOption = null;
    let manualCheck = null;
    let generationStage = null;
    const generationFailures = new Set();
    let currency = null;
    let currencyEdit = null;
    let currencyEditError = '';
    let currencyEditJob = null;
    const editIntents = currencyEditStorage ? createCurrencyEditIntents(currencyEditStorage) : null;
    const generationIntents = createStatsGenerationIntents(currencyEditStorage);
    const heroInitIntents = createHeroInitIntents(currencyEditStorage);
    let currencyJob = null;
    let currencyProgress = null;
    let currencyNoticeLease = null;
    const currencyAsked = new Set();
    const startAsked = { chatId: '', names: new Set() };
    let tail = Promise.resolve();
    let writes = 0;
    let writeSeq = 0;
    let inflight = 0;
    let inflightChat = '';
    let importJob = null;
    let importFailure = null;
    let creating = false;
    let loadedKey = '';
    let loadedChat = '';
    let eventCombat = null;
    let modeDefault = 'auto';
    let modePending = false;
    let modeChat = null;
    const askedFill = new Set();
    const heroAsked = new Set();
    const heroPickAsked = new Set();
    const notices = new Map();
    const diagnostics = [];
    const forcedSettings = new WeakMap();

    const ctx = () => { try { return getContext(); } catch (error) { return null; } };
    const messages = (c) => (c && Array.isArray(c.chat) ? c.chat : []);
    const diag = (code, extra = {}) => { diagnostics.push({ code, ...extra }); if (diagnostics.length > DIAG_MAX) diagnostics.shift(); };
    // 同一事件内战斗开关只取一次（规格 §6）：事件入口 inEvent() 记下，出口清掉；事件之外每次现取。
    const combatOn = () => {
        if (eventCombat !== null) return eventCombat;
        try { return combatEnabled() === true; } catch (error) { return false; }
    };
    const inEvent = (fn) => (...args) => {
        const outer = eventCombat;
        if (outer === null) { try { eventCombat = combatEnabled() === true; } catch (error) { eventCombat = false; } }
        try { return fn(...args); } finally { if (outer === null) eventCombat = null; }
    };
    // 战斗开启时强制数值总开关为开。强制后的对象按原设置引用缓存，引擎缓存才能命中。
    const settings = () => {
        const base = readStatsSettings(readSettings ? readSettings() : null);
        if (!combatOn() || base.enabled) return base;
        let forced = forcedSettings.get(base);
        if (!forced) { forced = { ...base, enabled: true }; forcedSettings.set(base, forced); }
        return forced;
    };
    const active = () => Boolean(settings().enabled && chatEnabled && ledger);
    const VISIBLE_BUSY_TASKS = new Set(['sheets', 'hero-skills', 'start-relations', 'npc-coc']);
    const generationTasks = createGenerationTasks({
        capture: () => {
            const owner = ctx();
            const id = chatIdOf(owner);
            const identity = generationIdentity();
            return () => Boolean(id) && settings().enabled && chatIdOf(ctx()) === id && generationIdentity() === identity;
        },
        onSlow: job => {
            if (VISIBLE_BUSY_TASKS.has(job.key)) {
                setNotice(job.key, { kind: 'busy', text: '仍在等待同一次模型请求，请勿重复提交', slow: true });
            } else {
                diag('stats-generation-slow', { key: job.key });
            }
        },
        slowMs: BACKGROUND_TIMEOUT_MS,
    });
    function invalidateGenerations() {
        generationTasks.invalidate();
        generationFailures.clear();
        reviewing = false;
    }
    const generationFailureKey = key => `${chatIdOf(ctx())}|${key}`;
    const generationRevision = () => JSON.stringify({ catalog, learned, chatEnabled, buildMode, buildChoices, npcPolicy, npcChoices,
        currency, currencyEdit, initial: ledger?.initial, entries: ledger ? [...ledger.entries] : [],
        active: ledger ? [...ledger.active] : [] });
    function checkGeneration(job) {
        job.check();
        if (!active()) throw Object.assign(new Error('request-stale'), { reason: 'request-stale' });
        if (typeof job.conflictCheck === 'function') {
            if (!job.conflictCheck()) throw Object.assign(new Error('stats-generation-conflict'), { reason: 'stats-generation-conflict' });
            return;
        }
        if (job.revision !== undefined && job.revision !== JSON.stringify(catalog)) throw Object.assign(new Error('stats-generation-conflict'), { reason: 'stats-generation-conflict' });
        if (job.sourceRevision !== undefined && job.sourceRevision !== generationRevision())
            throw Object.assign(new Error('stats-generation-conflict'), { reason: 'stats-generation-conflict' });
    }
    const generationSave = createStatsGenerationSave({
        intents: generationIntents, tables: () => tables(), chatId: () => chatIdOf(ctx()),
    });
    // 生成类提交队列：只串行极短的落库临界区，不阻塞主角/NPC 并发模型请求，也不会因另一方正在提交而误报 pending。
    let generationCommitTail = Promise.resolve();
    let generationCommitActive = 0;
    let sheetsDeferredByGenerating = false;
    function enqueueGenerationCommit(fn) {
        generationCommitActive += 1;
        const run = generationCommitTail.then(fn, fn);
        generationCommitTail = run.then(() => {}, () => {});
        return run.finally(() => { generationCommitActive -= 1; });
    }
    const life = () => { try { return combatSource() || null; } catch (error) { return null; } };
    // 未注入聊天档案的旧嵌入端仍使用其自带的读取口；生产读取失败不退回旧卡。
    const attributes = () => attributeAccess ? attributeAccess().source() : life();
    const heroSkillValue = (skill) => {
        const own = ledger && currentStatsState(ledger).protagonist.skills[skill];
        const v = heroSkillLevel(dailyEngineOf(), own, skill);
        return v > 0 ? v : null;
    };
    const heroPrefs = () => (ledger && currentStatsState(ledger).protagonist.prefs) || null;
    const userName = () => String((ctx() && ctx().name1) || '');
    // 共享净流水不含 bars.money，与旧钱包份额相加一次；不受战斗界面开关影响。
    const combatPoints = () => {
        const s = life();
        try { return s && typeof s.readPoints === 'function' ? Number(s.readPoints()) || 0 : 0; } catch (error) { return 0; }
    };

    // ---- 剧情货币：物品表固定一行（数量即余额），按数据库写法每楼写本楼增量 ----
    const inventoryOf = () => {
        let inv = null;
        try { inv = currencyInventory(); } catch (error) { inv = null; }
        return inv && typeof inv.read === 'function' && typeof inv.changeQuantities === 'function' ? inv : null;
    };
    let currencyTail = Promise.resolve();
    let currencyEpoch = 0;
    let disposed = false;
    let currencyBusy = 0;

    function currencyEditPending() {
        if (currencyEditError) return currencyEditError;
        const saved = editIntents ? editIntents.read(chatIdOf(ctx())) : { ok: true, intent: null };
        if (!saved.ok) return saved.reason;
        return saved.intent || (currencyEdit && !currencyEdit.done) ? 'stats-currency-edit-pending' : '';
    }

    function readCurrency(config = currency) {
        const pending = currencyEditPending();
        if (pending) return { ok: false, stage: 'edit', reason: pending };
        const inv = inventoryOf();
        if (!inv) return { ok: false, reason: 'stats-currency-no-inventory' };
        if (!config) return { ok: false, reason: 'stats-currency-unset' };
        try { return currencyBalanceOf(inv.read(), config.name); } catch { return { ok: false, reason: 'inventory-table-read-failed' }; }
    }

    function currencyLease(messageId = null) {
        const chatId = chatIdOf(ctx());
        const epoch = currencyEpoch;
        const client = inventoryOf()?.client;
        const owner = generationIdentity();
        const message = messageId === null ? null : messages(ctx())[messageId];
        const swipeId = Number(message?.swipe_id) || 0;
        const tagHash = message ? statTagHash(message.mes) : null;
        return () => !disposed && active() && epoch === currencyEpoch && chatIdOf(ctx()) === chatId
            && generationIdentity() === owner
            && (!client || inventoryOf()?.client === client)
            && (messageId === null || (messages(ctx())[messageId] === message
                && (Number(message?.swipe_id) || 0) === swipeId && statTagHash(message.mes) === tagHash));
    }

    function invalidateCurrencyJob() {
        currencyEpoch += 1;
        currencyJob?.controller.abort();
        currencyJob = null;
        currencyProgress = null;
        currencyNoticeLease = null;
        if (notices.has('currency')) setNotice('currency', null);
    }

    function currencyChanged() {
        if (ledger) onChange(currentStatsState(ledger), null);
    }

    function queueCurrency(task) {
        currencyBusy += 1;
        const run = currencyTail.then(task, task).catch(() => ({ ok: false, reason: 'stats-currency-threw' }))
            .finally(() => { currencyBusy -= 1; });
        currencyTail = run;
        return run;
    }

    function currencyContext() {
        if (!currency || !currency.seeded) return { ready: false, balance: 0, table: currency ? currency.table : undefined };
        const r = readCurrency();
        if (!r.ok) { diag('stats-currency-read-failed', { reason: r.reason }); return { ready: false, balance: 0, table: currency.table }; }
        return { ready: true, balance: r.balance, table: currency.table };
    }

    async function currencySaved(saved, record, alive) {
        if (saved) await saved;
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const t = tables();
        const read = t.ok ? t.read({ kinds: ['stats'] }) : t;
        if (!read?.ok || !Array.isArray(read.stats)) return { ok: false, reason: 'stats-currency-save-unverified' };
        if (record) return read.stats.some((row) => row.id === record.id && JSON.stringify(row.payload) === JSON.stringify(record.payload))
            ? { ok: true } : { ok: false, reason: 'stats-currency-save-unverified' };
        const restored = mergeStatLog(read.stats, { chatId: chatIdOf(ctx()), chat: messages(ctx()) });
        return JSON.stringify(restored.currency) === JSON.stringify(currency)
            ? { ok: true } : { ok: false, reason: 'stats-currency-save-unverified' };
    }

    async function ensureCurrencyInventory(alive) {
        const inv = inventoryOf();
        if (!inv) return { ok: false, reason: 'stats-currency-no-inventory' };
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (typeof inv.ensure === 'function') {
            const combat = combatOn();
            let made;
            try { made = await inv.ensure({ shouldStart: alive, includeGear: combat, manageInventory: combat }); } catch (error) { made = null; }
            if (!made || made.ok !== true) return { ok: false, reason: (made && made.reason) || 'inventory-ensure-failed' };
        }
        if (!alive()) return { ok: false, reason: 'request-stale' };
        inv.client?.invalidate?.();
        return { ok: true, inventory: inv };
    }

    async function confirmCurrencyBalance(alive) {
        if (!currency?.seeded) return { ok: false, stage: 'read', reason: 'stats-currency-unset' };
        const ready = await ensureCurrencyInventory(alive);
        if (!ready.ok) return { ...ready, stage: 'read' };
        const read = readCurrency();
        if (!alive()) return { ok: false, reason: 'request-stale', stage: 'read' };
        return { ...read, stage: 'read' };
    }

    async function applyCurrencyDelta(config, write, alive) {
        const ready = await ensureCurrencyInventory(alive);
        if (!ready.ok) return ready;
        const inv = ready.inventory;
        const read = readCurrency(config);
        if (!read.ok) return read;
        if (read.balance === write.after) return { ok: true, reused: true };
        if (read.balance !== write.before) return { ok: false, reason: 'inventory-quantity-conflict' };
        let result;
        try {
            result = await inv.changeQuantities([{ name: config.name, delta: write.after - write.before, expectedBefore: write.before, description: CURRENCY_DESCRIPTION, category: CURRENCY_CATEGORY }], { shouldStart: alive });
        } catch { result = { ok: false, reason: 'inventory-write-failed' }; }
        if (!alive()) return { ok: false, reason: 'request-stale' };
        inv.client?.invalidate?.();
        const verified = readCurrency(config);
        if (verified.ok && verified.balance === write.after) {
            if (result?.reason === 'inventory-refresh-failed') diag('stats-currency-refresh-failed');
            return { ok: true };
        }
        return { ok: false, reason: result?.reason || verified.reason || 'inventory-write-unverified' };
    }

    function currencyFailed(config, reason) {
        if (reason === 'request-stale') return;
        settleCurrencyNotice({ ok: false, stage: 'recover', reason });
    }

    function currencyFloorRecord(entry) {
        const m = messages(ctx())[entry.messageId];
        return floorRecord({ messageId: entry.messageId, swipeId: entry.swipeId, tagHash: statTagHash(m?.mes), baseId: entry.baseId ?? null,
            seed: entry.seed, before: entry.before, after: entry.after, changes: entry.changes, meta: entry.meta, createdAt: Date.now() });
    }

    async function writeCurrency(entry, record, saved, alive) {
        const money = normalizeCurrencySettlement(entry.meta?.currency);
        if (!money?.write || money.applied) return { ok: true, skipped: true };
        const stored = await currencySaved(saved, record, alive);
        if (!stored.ok) { currencyFailed(currency, stored.reason); return stored; }
        const written = await applyCurrencyDelta(currency, money.write, alive);
        if (!written.ok) { currencyFailed(currency, written.reason); return written; }
        entry.meta = { ...entry.meta, currency: { ...money, applied: true } };
        const confirmed = currencyFloorRecord(entry);
        entry.recordId = confirmed.id;
        const done = await currencySaved(persist([confirmed], { shouldStart: alive }), confirmed, alive);
        if (!done.ok) {
            entry.meta = { ...entry.meta, currency: money };
            entry.recordId = record.id;
            currencyFailed(currency, done.reason);
        }
        if (alive()) push();
        return done;
    }

    const exchangeOf = () => {
        try { return pointsExchange() || null; } catch { return null; }
    };
    const sameCurrency = value => JSON.stringify(normalizeCurrencyConfig(value)) === JSON.stringify(normalizeCurrencyConfig(currency));

    async function creditExchange(exchange, alive) {
        if (!currency?.seeded || !sameCurrency(exchange.currency)) return { ok: false, reason: 'points-exchange-currency-conflict' };
        return applyCurrencyDelta(currency, exchange.write, alive);
    }

    async function recoverExchanges(alive) {
        const service = exchangeOf();
        if (!service) return { ok: true, skipped: true };
        return service.recoverExchanges({ credit: exchange => creditExchange(exchange, alive), shouldStart: alive });
    }

    function runExchange(task) {
        ensureLoaded();
        const alive = currencyLease();
        return queueCurrency(async () => {
            if (!alive()) return { ok: false, reason: 'stats-chat-not-enabled' };
            if (!currency?.seeded) return { ok: false, reason: 'stats-currency-unset' };
            const service = exchangeOf();
            if (!service) return { ok: false, reason: 'points-exchange-unavailable' };
            const recovered = await recoverCurrencyWrites(alive);
            let result = recovered.ok ? await task(service, alive) : recovered;
            if (!alive()) return { ok: false, reason: 'request-stale' };
            if (result?.ok) {
                const confirmed = await confirmCurrencyBalance(alive);
                result = { ...result, ...confirmed };
            }
            if (alive()) {
                settleCurrencyNotice(result);
                onChange(currentStatsState(ledger), null);
                if (result?.ok) push();
            }
            return result;
        });
    }

    function exchangeInfo() {
        if (loadedChat !== chatIdOf(ctx()) || !active()) return { ok: false, reason: 'stats-chat-not-enabled' };
        const pending = currencyEditPending();
        if (pending || currencyEditJob?.alive()) return { ok: false, stage: 'edit', reason: pending || 'busy' };
        if (!currency?.seeded) return { ok: false, reason: 'stats-currency-unset' };
        return { ok: true, name: currency.name, rate: currency.rate };
    }

    function quoteExchange(points) {
        return runExchange(service => service.quoteExchange(points, currency));
    }

    function exchangePoints(quote) {
        return runExchange((service, alive) => service.exchange(quote, {
            shouldStart: alive,
            credit: exchange => creditExchange(exchange, alive),
            prepare: async () => {
                if (!sameCurrency(quote?.currency)) return { ok: false, reason: 'points-exchange-currency-conflict' };
                const ready = await ensureCurrencyInventory(alive);
                if (!ready.ok) return ready;
                const read = readCurrency();
                if (!read.ok) return read;
                return { ok: true, write: { before: read.balance, after: read.balance + quote.amount } };
            },
        }));
    }

    async function recoverCurrencyWrites(alive, through = Infinity) {
        await tail;
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (currencyEditPending()) {
            const edited = await currencyEditor.recover(alive);
            if (!edited.ok) return edited;
        }
        const exchanges = await recoverExchanges(alive);
        if (!exchanges.ok) return exchanges;
        for (const [messageId, swipeId] of [...ledger.active].sort(([a], [b]) => a - b)) {
            if (messageId > through) continue;
            if (!alive()) return { ok: false, reason: 'request-stale' };
            const entry = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
            const money = normalizeCurrencySettlement(entry?.meta?.currency);
            if (!money?.write || money.applied) continue;
            const record = currencyFloorRecord(entry);
            const current = currencyLease(messageId);
            const shouldStart = () => alive() && current();
            const recovered = await writeCurrency(entry, record, persist([record], { shouldStart }), shouldStart);
            if (!recovered.ok) return recovered;
        }
        return currency?.seeded ? confirmCurrencyBalance(alive) : { ok: true, skipped: true };
    }

    async function seedCurrency(alive, persistedSeed = null, onSeedRecorded = null) {
        if (!currency || currency.seeded || !ledger) return { ok: true, skipped: true };
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (currency.initial === 0) {
            const ready = await ensureCurrencyInventory(alive);
            if (!ready.ok) return ready;
            const read = readCurrency();
            if (!read.ok) return read;
            const prev = currency;
            currency = normalizeCurrencyRecord({ ...prev, seeded: true });
            const done = await currencySaved(persist([], { shouldStart: alive }), null, alive);
            if (!done.ok) { if (alive()) currency = prev; return done; }
            return { ok: true };
        }
        if (!currency.seed) {
            let nextSeed = persistedSeed || null;
            if (!nextSeed) {
                const ready = await ensureCurrencyInventory(alive);
                if (!ready.ok) return ready;
                const read = readCurrency();
                if (!read.ok) return read;
                nextSeed = { before: read.balance, after: read.balance + currency.initial };
            }
            currency = normalizeCurrencyRecord({ ...currency, seed: nextSeed });
            if (!currency) return { ok: false, reason: 'stats-currency-balance-invalid' };
            if (typeof onSeedRecorded === 'function') {
                const marked = onSeedRecorded(currency.seed);
                if (marked && marked.ok === false) return marked;
            }
        }
        const stored = await currencySaved(persist([], { shouldStart: alive }), null, alive);
        if (!stored.ok) return stored;
        const config = currency;
        const written = await applyCurrencyDelta(config, config.seed, alive);
        if (!written.ok) return written;
        currency = normalizeCurrencyRecord({ ...config, seeded: true });
        const done = await currencySaved(persist([], { shouldStart: alive }), null, alive);
        if (!done.ok) { if (alive()) currency = config; return done; }
        return { ok: true };
    }

    function currencyStoryText() {
        const chat = messages(ctx()).filter((m) => m && !m.is_system && typeof m.mes === 'string' && m.mes.trim());
        const picked = [...new Set([...chat.slice(0, 3), ...chat.slice(-3)])];
        return picked.map((m) => `${m.is_user ? '用户' : '剧情'}：${m.mes.trim()}`).join('\n');
    }

    function heroBasicReady() {
        if (!active()) return false;
        const chatId = chatIdOf(ctx());
        const saved = heroInitIntents.read(chatId);
        if (!saved.ok || saved.intent) return false;
        if (attributeAccess) {
            const src = attributes();
            const hero = src?.ready ? src.readAbilities(userName() || PROTAGONIST, { heroPrefs: heroPrefs() }) : null;
            if (!hero || hero.initialized !== true) return false;
        }
        if (inventoryOf()) {
            if (!currency || currency.seeded !== true) return false;
        }
        return true;
    }

    function readAuthoritativeStatsCurrency(alive) {
        if (!alive()) return { ok: false, stage: 'read', reason: 'request-stale' };
        const t = tables();
        if (!t.ok) return { ok: false, stage: 'read', reason: t.reason || 'stats-log-read-failed' };
        t.invalidate?.();
        const rows = t.read({ kinds: ['stats'] });
        if (!alive()) return { ok: false, stage: 'read', reason: 'request-stale' };
        if (!rows || rows.ok !== true || !Array.isArray(rows.stats)) {
            return { ok: false, stage: 'read', reason: (rows && rows.reason) || 'stats-log-read-failed' };
        }
        const merged = mergeStatLog(rows.stats, { chatId: chatIdOf(ctx()), chat: messages(ctx()) });
        if (merged.currencyEditError) return { ok: false, stage: 'edit', reason: merged.currencyEditError };
        currency = merged.currency || null;
        currencyEdit = merged.currencyEdit || null;
        currencyEditError = merged.currencyEditError || '';
        for (const key of ['chat:currency', 'chat:currencyEdit']) {
            if (merged.baseline.has(key)) baseline.set(key, merged.baseline.get(key));
            else baseline.delete(key);
        }
        return { ok: true, layout: rows.layout === 'v2' ? 'v2' : 'legacy', currency };
    }

    async function ensureHeroAttributeReadable(access, heroName, alive) {
        if (!alive()) return { ok: false, stage: 'read', reason: 'request-stale' };
        const st = access.status();
        if (!st.ok) return { ...st, stage: 'read' };
        let read = access.readHero(heroName);
        if (!read.ok && (read.reason === 'combat-attribute-table-missing' || read.reason === 'igs-layout-unconfirmed')) {
            const ensured = await access.ensure({ shouldStart: alive });
            if (!alive()) return { ok: false, stage: 'read', reason: 'request-stale' };
            if (!ensured?.ok) return { ok: false, stage: 'read', reason: ensured?.reason || 'combat-attribute-table-missing' };
            read = access.readHero(heroName);
        }
        if (!alive()) return { ok: false, stage: 'read', reason: 'request-stale' };
        return read.ok ? read : { ...read, stage: 'read' };
    }

    function heroAttributesInitialized() {
        if (!attributeAccess) return true;
        const src = attributes();
        const hero = src?.ready ? src.readAbilities(userName() || PROTAGONIST, { heroPrefs: heroPrefs() }) : null;
        return Boolean(hero && hero.initialized === true);
    }

    function needsHeroInitChoice() {
        if (!active() || !attributeAccess) return false;
        const chatId = chatIdOf(ctx());
        if (!chatId) return false;
        if (catalog.heroInitChoice === 'auto' || catalog.heroInitChoice === 'manual') return false;
        const saved = heroInitIntents.read(chatId);
        if (!saved.ok || saved.intent) return false;
        return !heroAttributesInitialized();
    }

    // 主角统一初始化（P4）：先恢复未完成意图；若未决定自动/手填则等待玩家选择；否则读取权威六维与货币判定缺项，全缺一次请求、部分已有只补缺项，分阶段保存并读回确认。
    function ensureHeroInit({ force = false, requireBio = false } = {}) {
        const hasAttr = Boolean(attributeAccess);
        const hasInv = Boolean(inventoryOf());
        if (!active() || (!hasAttr && !hasInv)) return null;
        const chatId = chatIdOf(ctx());
        if (currencyJob?.chatId === chatId && currencyJob.epoch === currencyEpoch && currencyJob.alive()) return currencyJob.promise;
        if (currencyJob) invalidateCurrencyJob();
        const heldIntent = heroInitIntents.read(chatId);
        const hasPendingIntent = !heldIntent.ok || Boolean(heldIntent.intent);
        let attrReady = !hasAttr;
        if (hasAttr) attrReady = heroAttributesInitialized();
        if (!force && !hasPendingIntent && !attrReady && !catalog.heroInitChoice) {
            refreshHeroInitMode();
            return Promise.resolve({ ok: true, skipped: 'hero-init-awaiting-choice' });
        }
        const currencyReady = !hasInv || Boolean(currency?.seeded);
        const bioReady = !requireBio || Boolean(String(catalog.heroBio || '').trim());
        if (!hasPendingIntent && attrReady && currencyReady && bioReady && !force && !exchangeOf() && !currencyEditPending()) return null;
        if (!force && !hasPendingIntent && currencyAsked.has(chatId)) return null;
        const ownerAlive = currencyLease();
        const route = generationRoute();
        const alive = () => ownerAlive();
        const requestAlive = () => ownerAlive() && generationRoute() === route;
        currencyAsked.add(chatId);
        const job = { chatId, epoch: currencyEpoch, alive, controller: new AbortController(), stage: 'read', slow: false, promise: null };
        currencyJob = job;
        const progress = (stage, slow = false) => {
            if (!alive() || currencyJob !== job) return;
            job.stage = stage;
            job.slow = slow;
            currencyProgress = { stage, reason: '', slow };
            const text = stage === 'request'
                ? (slow ? '主角初始化仍在处理中，正在等待同一次请求' : '正在初始化主角六维与剧情货币')
                : stage === 'attributes' ? '正在保存主角六维'
                : stage === 'recover' ? '正在恢复主角初始化'
                : '正在确认剧情货币';
            setNotice('currency', { kind: 'busy', ...currencyProgress, text });
            currencyChanged();
        };
        const commitIntent = async (initialIntent) => {
            let intent = initialIntent;
            const saveStage = (patch) => {
                const next = { ...intent, ...patch };
                const res = heroInitIntents.save(chatId, next, { allowUpdate: true });
                if (!res.ok) return { ok: false, stage: patch.stage || intent.stage, reason: res.reason };
                intent = next;
                return { ok: true };
            };
            const heroName = userName() || PROTAGONIST;
            // 阶段 2：六维写入/确认
            if (intent.needAttributes && intent.stage !== 'currency-config' && intent.stage !== 'currency-seed' && intent.stage !== 'done') {
                progress('attributes');
                const access = attributeAccess ? attributeAccess() : null;
                if (!access) return { ok: false, stage: 'attributes', reason: 'combat-attribute-table-missing' };
                if (access.status().reason === 'stats-attribute-save-pending') {
                    const rec = await access.recover({ shouldStart: alive });
                    if (!alive()) return { ok: false, stage: 'attributes', reason: 'request-stale' };
                    if (!rec?.ok) return { ok: false, stage: 'attributes', reason: rec?.reason || 'stats-attribute-save-pending' };
                }
                const read = await ensureHeroAttributeReadable(access, heroName, alive);
                if (!read.ok) return { ...read, stage: 'attributes' };
                const sameRow = read.rows.find(row => row.id === intent.attributeRecordId);
                if (sameRow) {
                    if (JSON.stringify(sameRow.payload?.scores) !== JSON.stringify(intent.attributes)) {
                        return { ok: false, stage: 'attributes', reason: 'stats-attribute-conflict' };
                    }
                } else if (!read.view.initialized) {
                    const written = await access.initHero(heroName, intent.attributes, {
                        recordId: intent.attributeRecordId,
                        createdAt: intent.createdAt,
                        shouldStart: alive,
                        signal: job.controller.signal,
                    });
                    if (!alive()) return { ok: false, stage: 'attributes', reason: 'request-stale' };
                    if (!written?.ok) return { ok: false, stage: 'attributes', reason: written?.reason || 'stats-attribute-write-unverified' };
                }
                gateMemo = null;
                const adv = saveStage({ stage: intent.needCurrency ? 'currency-config' : 'done' });
                if (!adv.ok) return adv;
                if (alive()) currencyChanged();
            }
            // 阶段 3：货币定义写入/确认
            if (intent.needCurrency && intent.stage !== 'currency-seed' && intent.stage !== 'done') {
                progress('currency-config');
                const statsRead = readAuthoritativeStatsCurrency(alive);
                if (!statsRead.ok) return { ...statsRead, stage: 'currency-config' };
                const existing = statsRead.currency;
                const wantCfg = normalizeCurrencyConfig(intent.currency);
                if (existing) {
                    const sameCfg = JSON.stringify(normalizeCurrencyConfig(existing)) === JSON.stringify(wantCfg)
                        && existing.initial === intent.currency.initial;
                    if (!sameCfg || existing.seeded) {
                        const adv = saveStage({ stage: 'done' });
                        if (!adv.ok) return adv;
                    } else {
                        const adv = saveStage({ stage: 'currency-seed' });
                        if (!adv.ok) return adv;
                    }
                } else {
                    const prevCurrency = currency;
                    currency = normalizeCurrencyRecord({ ...intent.currency, seeded: false, ...(intent.seed ? { seed: intent.seed } : {}) });
                    const stored = await currencySaved(persist([], { shouldStart: alive }), null, alive);
                    if (!stored.ok) { if (alive()) currency = prevCurrency; return { ...stored, stage: 'currency-config' }; }
                    const adv = saveStage({ stage: 'currency-seed' });
                    if (!adv.ok) return adv;
                }
            }
            // 阶段 4：初始金额入账/确认
            if (intent.needCurrency && intent.stage === 'currency-seed') {
                progress('currency-seed');
                const statsRead = readAuthoritativeStatsCurrency(alive);
                if (!statsRead.ok) return { ...statsRead, stage: 'currency-seed' };
                if (currency && !currency.seeded) {
                    const seeded = await seedCurrency(alive, intent.seed || null, (seed) => saveStage({ seed }));
                    if (!seeded.ok) return { ...seeded, stage: 'currency-seed' };
                }
                const adv = saveStage({ stage: 'done' });
                if (!adv.ok) return adv;
            }
            // 阶段 4.5：写入主角简介（不覆盖已有简介，独立键值不锁 NPC 或技能写入）
            if (intent.bio && !String(catalog.heroBio || '').trim() && alive()) {
                catalog = sanitizeCatalog({ ...catalog, heroBio: intent.bio });
                persist([], { shouldStart: alive });
                await tail;
            }
            // 阶段 5：清除意图并恢复其余待完成写口
            const cleared = heroInitIntents.save(chatId, null);
            if (!cleared.ok) return { ok: false, stage: 'recover', reason: cleared.reason };
            progress('recover');
            return hasInv ? recoverCurrencyWrites(alive) : { ok: true };
        };

        const run = async () => {
            if (!alive()) return { ok: false, reason: 'request-stale' };
            if (currencyEditPending()) {
                const edited = await currencyEditor.recover(alive);
                if (!edited.ok) return edited;
            }
            // 先读未完成主角初始化意图；有则直接恢复，绝不重发模型！
            const pending = heroInitIntents.read(chatId);
            if (!pending.ok) return { ok: false, stage: 'recover', reason: pending.reason };
            if (pending.intent) return commitIntent(pending.intent);

            // 读取权威六维与货币状态，捕获修订，判断缺项；读取失败不请求模型。
            const heroName = userName() || PROTAGONIST;
            let layout = 'legacy';
            let attrRead = null;
            if (hasAttr) {
                const access = attributeAccess();
                attrRead = await ensureHeroAttributeReadable(access, heroName, alive);
                if (!attrRead.ok) return attrRead;
                if (attrRead.layout === 'v2' || attrRead.layout === 'legacy') layout = attrRead.layout;
            }
            let statsRead = null;
            if (hasInv) {
                statsRead = readAuthoritativeStatsCurrency(alive);
                if (!statsRead.ok) return statsRead;
                if (statsRead.layout === 'v2' || statsRead.layout === 'legacy') layout = statsRead.layout;
            }
            const needAttributes = Boolean(hasAttr && !attrRead.view.initialized);
            const needCurrency = Boolean(hasInv && !currency);
            const needBio = !String(catalog.heroBio || '').trim();
            if (!needAttributes && !needCurrency && !(requireBio && needBio)) {
                if (hasInv && currency && !currency.seeded) {
                    progress('currency-seed');
                    const seeded = await seedCurrency(alive);
                    if (!seeded.ok) return { ...seeded, stage: 'currency-seed' };
                }
                if (hasInv) {
                    progress('recover');
                    return recoverCurrencyWrites(alive);
                }
                return { ok: true };
            }
            const request = requester();
            if (!request) return { ok: false, stage: 'request', reason: 'stats-no-model' };

            // 收集角色、世界观、剧情与人设上下文
            const names = [PROTAGONIST, ...present(currentStatsState(ledger)).slice(0, 5)];
            const view = WORLDVIEWS.find((w) => w.id === worldviewOf());
            let people = [];
            try { people = typeof describePeople === 'function' ? await describePeople(names) : []; } catch { /* 仅使用现有剧情 */ }
            if (!requestAlive()) return { ok: false, stage: 'request', reason: 'request-stale' };
            let extraCtx = {};
            try {
                if (typeof readSheetContext === 'function') {
                    const c = ctx();
                    let picked = '';
                    try { picked = String(userCharacter() || '').trim(); } catch { picked = ''; }
                    const protagonistCards = [...new Set([picked, c?.name2, ...(Array.isArray(c?.groupMembers) ? c.groupMembers : [])]
                        .map((name) => String(name || '').trim()).filter((name) => name && isHero(name)))];
                    extraCtx = (await readSheetContext({ names: [heroName], protagonists: [heroName], protagonistCards })) || {};
                }
            } catch { extraCtx = {}; }
            if (!requestAlive()) return { ok: false, stage: 'request', reason: 'request-stale' };
            const prompt = buildHeroInitRequest({
                protagonist: heroName,
                worldview: view?.label || '',
                worldInfo: extraCtx.worldInfo || '',
                userPersona: extraCtx.userPersona || '',
                story: currencyStoryText(),
                people,
                needAttributes,
                needCurrency,
                needBio,
                existingCurrency: currency,
            }, { prompt: settings().prompts.heroInit });
            progress('request');
            let reply;
            const signal = job.controller.signal;
            let abort;
            const stopped = new Promise((_, reject) => {
                abort = () => reject(Object.assign(new Error('request-stale'), { reason: 'request-stale' }));
                signal.addEventListener('abort', abort, { once: true });
            });
            try {
                reply = await Promise.race([stopped, Promise.resolve().then(() => {
                    if (!requestAlive() || signal.aborted) throw Object.assign(new Error('request-stale'), { reason: 'request-stale' });
                    return request(prompt, {
                        signal,
                        shouldStart: requestAlive,
                        onSlow: () => progress('request', true),
                        onRetry: ({ attempt, maxRetries }) => {
                            if (!requestAlive() || currencyJob !== job) return;
                            setNotice('currency', { kind: 'busy', ...currencyProgress, text: `正在重试主角初始化（第 ${attempt}/${maxRetries} 次）` });
                        },
                    });
                })]);
            } catch (error) {
                return heroInitRequestFailure(error);
            } finally {
                signal.removeEventListener('abort', abort);
            }
            if (!requestAlive()) return { ok: false, stage: 'request', reason: 'request-stale' };
            job.stage = 'parse';
            const parsed = parseHeroInitReply(reply, { needAttributes, needCurrency, chatSeed: chatId });
            if (!parsed.ok) return { ...parsed, stage: 'parse' };

            // 回包前再次核对权威状态：若期间手改已补足，绝不覆盖！
            let finalNeedAttributes = needAttributes;
            let finalNeedCurrency = needCurrency;
            let heroKey = attrRead?.view?.key || '';
            if (finalNeedAttributes) {
                const access = attributeAccess();
                const latestAttr = await ensureHeroAttributeReadable(access, heroName, alive);
                if (!latestAttr.ok) return latestAttr;
                if (latestAttr.view.initialized) finalNeedAttributes = false;
                else heroKey = latestAttr.view.key;
            }
            if (finalNeedCurrency) {
                const latestStats = readAuthoritativeStatsCurrency(alive);
                if (!latestStats.ok) return latestStats;
                if (latestStats.currency) finalNeedCurrency = false;
            }
            if (!finalNeedAttributes && !finalNeedCurrency && !(needBio && parsed.bio)) {
                if (hasInv && currency && !currency.seeded) {
                    progress('currency-seed');
                    const seeded = await seedCurrency(alive);
                    if (!seeded.ok) return { ...seeded, stage: 'currency-seed' };
                }
                return hasInv ? recoverCurrencyWrites(alive) : { ok: true, skipped: true };
            }

            // 阶段 1：保存规范化结果与稳定操作 ID
            const createdAt = Date.now();
            const opSeed = JSON.stringify({
                chatId,
                createdAt,
                attributes: finalNeedAttributes ? parsed.attributes : null,
                currency: finalNeedCurrency ? parsed.currency : null,
            });
            const operationId = `hi-${hash32(opSeed).toString(36)}`;
            const intent = {
                version: 1,
                chatId,
                layout,
                operationId,
                stage: 'result-saved',
                needAttributes: finalNeedAttributes,
                needCurrency: finalNeedCurrency,
                attributes: finalNeedAttributes ? parsed.attributes : null,
                attributeRecordId: finalNeedAttributes ? `hero-base|${heroKey}|${operationId}` : null,
                currency: finalNeedCurrency ? { ...parsed.currency.config, initial: parsed.currency.initial } : null,
                bio: parsed.bio || '',
                seed: null,
                createdAt,
            };
            const savedIntent = heroInitIntents.save(chatId, intent);
            if (!savedIntent.ok) return { ok: false, stage: 'result-saved', reason: savedIntent.reason };
            return commitIntent(intent);
        };

        job.promise = queueCurrency(run).then((result) => {
            const current = alive() && currencyJob === job;
            if (currencyJob === job) currencyJob = null;
            const outcome = current ? { ...result, stage: result?.stage || job.stage } : { ok: false, reason: 'request-stale', stage: job.stage };
            if (current) {
                if (outcome.ok && inflight === 0 && loadedChat === chatId) loadedKey = cacheKey(tables());
                settleCurrencyNotice(outcome);
                currencyChanged();
                if (outcome.ok) {
                    refreshOnboarding();
                    onBuildPolicyChange();
                    detectNewCharacters();
                    push();
                }
            }
            return outcome;
        }).finally(() => {
            if (currencyJob === job) {
                currencyJob = null;
                if (notices.get('currency')?.kind === 'busy') setNotice('currency', null);
            }
        });
        return job.promise;
    }

    // 兼容调用名：自动初始化复用统一主角建档结果，不再另发单独货币模型请求。
    function ensureCurrency(options = {}) {
        return ensureHeroInit(options);
    }

    function settleCurrencyNotice(r) {
        if (r?.reason === 'request-stale') return;
        currencyProgress = { stage: r?.stage || 'recover', reason: r?.reason || '', slow: false, ...(r?.status && { status: r.status }) };
        if (r?.done) currencyProgress.done = true;
        currencyNoticeLease = r?.ok ? null : currencyLease();
        if (r?.ok) { currencyProgress.stage = 'ready'; setNotice('currency', null); return; }
        diag('stats-currency-failed', currencyProgress);
        setNotice('currency', { kind: 'onboarding', ...currencyProgress, text: describeHeroInitFailure(currencyProgress), actions: [['retry', '重试'], ['later', '稍后']] });
    }

    function currencySnapshot() {
        const progress = { ...currencyProgress, pending: Boolean((currencyJob?.chatId === chatIdOf(ctx()) && currencyJob.epoch === currencyEpoch) || currencyEditJob?.alive()) };
        const editReason = currencyEditPending();
        if (editReason || currencyEditJob?.alive()) return { ready: false, name: currency?.name || '', balance: null, ...progress,
            stage: 'edit', reason: currencyEditError || editReason || 'busy', editing: true };
        if (!currency) return { ready: false, name: '', balance: null, ...progress };
        const read = currency.seeded ? readCurrency() : { ok: false };
        return { name: currency.name, table: currency.table, rate: currency.rate,
            ...progress, ready: read.ok === true, balance: read.ok ? read.balance : null,
            ...(!read.ok && currency.seeded ? { stage: 'read', reason: read.reason } : {}) };
    }
    // 引擎读数闭包保持稳定（引用不变引擎缓存才命中）；每次调用时再取战斗源，userName 用 getter 随时取最新。
    const readers = {
        readAbilities: (name) => attributes()?.readAbilities?.(name, { heroPrefs: heroPrefs() }) ?? null,
        authoritativeAttributes: !!attributeAccess,
        readVitals: (name) => { const s = life(); return s && typeof s.readVitals === 'function' ? s.readVitals(name, { heroPrefs: heroPrefs() }) : null; },
        // 随身系统属性加成（只读，按名字与 IGS 同名属性、技能相加）；没有随身系统或没有数据为 null。
        readBonus: () => { try { const list = originStats(); return Array.isArray(list) && list.length ? list : null; } catch (error) { return null; } },
        get userName() { return userName(); },
    };
    const engineOf = (ruleset) => engineFor(catalog, settings(), ruleset === undefined ? settings().ruleset : ruleset, readers);
    // 一次注入或结算内用：读数按名字记忆化，避免同一名字反复折叠战斗账本。
    const memoEngineOf = (ruleset) => withAbilityMemo(engineOf(ruleset));
    // 调查员模式下主角技能读 state.investigator 分支，日常技能不参与。
    const heroView = (state, engine = engineOf()) => (cocSheetOf(engine) ? investigatorView(state) : state);
    // 日常引擎：关掉调查员档，我的角色页与日常数值只读它。
    let dailyCatalogOf = null;
    const dailyEngineOf = () => {
        if (!dailyCatalogOf || dailyCatalogOf.src !== catalog) dailyCatalogOf = { src: catalog, cat: { ...catalog, cocMode: 'daily' } };
        return engineFor(dailyCatalogOf.cat, settings(), settings().ruleset, readers);
    };
    // 特质门槛读六维：同一同步段内按名字记忆化，下一个微任务清空，hasTrait 高频调用不重算。
    let gateMemo = null;
    let gateCatalog = null;
    const gateAttrsOf = (name) => {
        if (!ledger) return null;
        if (!gateMemo || gateCatalog !== catalog) { gateMemo = new Map(); gateCatalog = catalog; queueMicrotask(() => { gateMemo = null; }); }
        if (!gateMemo.has(name)) gateMemo.set(name, gateAttributes(engineOf(), currentStatsState(ledger), name));
        return gateMemo.get(name);
    };
    setTraitAttrReader(gateAttrsOf);
    const background = () => { try { return Boolean(isBackground()); } catch (error) { return false; } };
    // 界面开关沿用旧布尔式（键 → true）；新格式只在存档与结算里使用，界面改版后换读 listTraits。
    const traitSwitchModel = (traits) => Object.fromEntries(Object.entries(traits).map(([n, marks]) => [n, Object.fromEntries(Object.entries(marks).filter(([, e]) => e && e.on === true).map(([k]) => [k, true]))]));
    // 默认在场判定：用户输入与最近两条 AI 回复里点到名字（含场景素材别名）的已建档角色。
    const PRESENT_SCAN_AI = 2;
    // 先按改名表归名，再把场景素材别名（精确匹配）归到主名，「哪吒」与「李哪吒」按同一人处理。
    const canonName = (name) => {
        const base = canonPersonName(catalog.renames, name);
        if (!base) return base;
        let aliases = {};
        try { aliases = characterAliases() || {}; } catch (error) { aliases = {}; }
        if (Array.isArray(aliases[base])) return base;
        for (const main of Object.keys(aliases)) {
            if (Array.isArray(aliases[main]) && aliases[main].includes(base)) return canonPersonName(catalog.renames, main);
        }
        return base;
    };
    const mentionedRecently = (state) => {
        const chat = messages(ctx());
        const ai = chat.filter((m) => m && !m.is_user && !m.is_system).slice(-PRESENT_SCAN_AI).map((m) => String(m.mes ?? ''));
        const text = [...ai, lastUserText(ctx())].join(' ');
        let aliases = {};
        try { aliases = characterAliases() || {}; } catch (error) { aliases = {}; }
        return Object.keys(state.characters).filter((name) => {
            const alt = Array.isArray(aliases[name]) ? aliases[name] : [];
            return [name, ...alt].some((n) => n && text.includes(String(n)));
        });
    };
    const present = (state) => {
        const names = typeof presentOf === 'function' ? presentOf(state) : mentionedRecently(state);
        // 随身角色（档案标记或聊天级勾选）正文不点名也在场。
        const companions = Object.keys(state.characters).filter((n) => hasTrait(state, traitCatalogOf(catalog.traits), n, 'companion') && !names.includes(n));
        return [...names, ...companions].filter((n) => state.characters[n] && !isHero(n));
    };
    // 写回是否生效：设置里手动开启，或本聊天用了 IGS 适配版模板（角色数值表、才艺技能表由 IGS 维护）时自动开启。读表结果短暂缓存。
    let managedCache = null;
    const pushOn = () => {
        if (settings().push.enabled) return true;
        if (managedCache && Date.now() - managedCache.at < TABLE_PEOPLE_TTL) return managedCache.on;
        let on = false;
        try {
            const client = getPushClient();
            const read = client ? client.readTables() : null;
            on = statsPushActive(false, read && read.ok ? read.data : null);
        } catch (error) { on = false; }
        managedCache = { at: Date.now(), on };
        return on;
    };
    // 数据库表格里的人物名单，主角与用户除外；读失败当没有。只取名字：数值以 IGS 为准，表格里 AI 填的数字不采用。
    let tableCache = null;
    const tableNames = ({ fresh = false } = {}) => {
        if (typeof tablePeople !== 'function') return [];
        if (!fresh && tableCache && Date.now() - tableCache.at < TABLE_PEOPLE_TTL) return tableCache.names;
        let rows = [];
        try { rows = tablePeople() || []; } catch (error) { rows = []; }
        const c = ctx();
        const skip = new Set([userName(), c && c.name1, PROTAGONIST].filter(Boolean));
        const names = [...new Set(rows.map((row) => canonName(String((row && typeof row === 'object' ? row.name : row) || '').trim())))]
            .filter((name) => name && !skip.has(name) && !isHero(name));
        tableCache = { at: Date.now(), names };
        return names;
    };
    const tableNameSet = () => new Set(tableNames());
    // 本楼要新建档的表格人物：{ 角色: {} }，关系从 0 起，初值交给「补全初始关系」；已登记的跳过。
    // 角色卡名与群聊成员：正文里出现过名字就建档，不必等 AI 写好感标签；多人卡的卡名多半不是人名，正文没提到就不建。
    const rosterNames = (upTo = Infinity) => {
        const c = ctx();
        if (!c) return [];
        const names = [c.name2, ...(Array.isArray(c.groupMembers) ? c.groupMembers : [])]
            .map((n) => String(n || '').trim()).filter((n) => n && !isHero(n) && n !== PROTAGONIST);
        if (!names.length) return [];
        const text = messages(c).slice(0, upTo === Infinity ? undefined : upTo + 1).map((m) => String((m && m.mes) || '')).join('\n');
        return [...new Set(names)].filter((n) => text.includes(n)).map((n) => canonName(n)).filter((n, i, all) => n && all.indexOf(n) === i);
    };
    const tableSeedOf = (state, upTo = Infinity) => {
        const fresh = [...new Set([...tableNames(), ...rosterNames(upTo)])].filter((name) => !state.characters[name] && !Object.hasOwn(catalog.renames, name));
        return fresh.length ? Object.fromEntries(fresh.map((name) => [name, {}])) : null;
    };
    // 表格被数据库插件改过后分两种来源：
    // 1. AI 填表（「开始填表」回调到下一次表格更新之间）：用 IGS 数值盖回去；
    // 2. 窗口外的更新视为用户手改：IGS 管的格子与当前值不同就采纳，记为最近一楼的手动修改。
    // 同步子开关关闭时两边都不通。
    let tablePushTimer = null;
    let fillTimer = null;
    let fillOpen = false;
    let writingTable = false;
    let selfWriteUntil = 0;
    let fillGraceUntil = 0;
    const closeFillWindow = () => {
        fillOpen = false;
        if (fillTimer) { clearTimeout(fillTimer); fillTimer = null; }
    };
    const onTableFillStart = () => {
        closeFillWindow();
        fillOpen = true;
        // 兜底超时也留余波：慢填表在超时后才到的更新仍按 AI 填表处理（宁可盖回，不误采纳）。
        fillTimer = setTimeout(() => { fillTimer = null; fillOpen = false; fillGraceUntil = Date.now() + FILL_GRACE; }, FILL_WINDOW_MAX);
    };
    // 读表并采纳用户手改；有改动时由 commitManualRelations 写账本、刷新设置器并写回表格，没有差异也补一次盖回。
    function adoptTableEdits() {
        if (generating || !ledger || !active() || !pushOn()) return { ok: false, skipped: true };
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        if (!client) return { ok: false, reason: 'stats-push-no-client' };
        const state = currentStatsState(ledger);
        const read = readTableAdoptions(client, state, { overridesByFingerprint: settings().push.mappings, characterKey: pushOptions.characterKey, walletExtra: combatPoints(), isHero });
        if (!read.ok) { diag(read.reason, { detail: read.detail }); return read; }
        const skills = adoptSkillRows({ includeChanged: true });
        if (!read.items.length) { push(); return { ok: true, adopted: [], skills }; }
        const entry = activeEntryBefore(ledger, Infinity);
        if (!entry) return { ok: false, reason: 'stats-relation-missing' };
        const manual = {};
        for (const item of read.items) {
            const slot = manual[item.name] || (manual[item.name] = {});
            if (item.kind === 'dim') slot[item.key] = item.to;
            else slot.bars = { ...(slot.bars || {}), [item.key]: item.to };
        }
        const result = commitManualRelations(entry, manual);
        if (!result.ok) { diag(result.reason || 'stats-table-adopt-failed'); return result; }
        for (const item of read.items) diag('stats-table-manual-adopted', { name: item.name, key: item.key, from: item.from, to: item.shown });
        return { ok: true, adopted: read.items, skills };
    }
    const onTableUpdated = () => {
        tableCache = null;
        managedCache = null;
        if (settings().enabled && !ledger
            && ['combat-table-not-ready', 'combat-table-runtime-not-ready', 'not-ready', 'missing-api'].includes(blocked || unavailable)) {
            load();
            autoEnable();
            refreshOnboarding();
            if (active()) refreshLife();
            ensureCurrency();
        }
        // 填表窗口内、或窗口刚关后的余波（插件一轮填表可能连发几次更新）都按 AI 填表处理：只盖回，不采纳。
        const covered = fillOpen || Date.now() < fillGraceUntil;
        if (fillOpen) fillGraceUntil = Date.now() + FILL_GRACE;
        closeFillWindow();
        if (!covered && (writingTable || Date.now() < selfWriteUntil)) return;
        if (active() && npcPolicy && !generating) detectNewCharacters({ syncTables: true });
        scheduleTableSync(covered);
    };
    // 延迟处理表格更新。到点时若正在写表、刚写完或又进了填表窗口，采纳会读到写了一半的表：顺延，并改按 AI 填表处理。
    function scheduleTableSync(covered, tries = 0) {
        if (tablePushTimer) clearTimeout(tablePushTimer);
        tablePushTimer = setTimeout(() => {
            tablePushTimer = null;
            if (generating || !active() || !pushOn()) return;
            const busy = writingTable || Date.now() < selfWriteUntil || fillOpen;
            if (!covered && busy) { if (tries < TABLE_SYNC_RETRY_MAX) scheduleTableSync(false, tries + 1); return; }
            if (covered || fillOpen) { adoptSkillRows({ includeChanged: false }); push(); } else adoptTableEdits();
        }, TABLE_PUSH_DELAY);
    }

    function emitNotices() {
        try { onNotices([...notices.values()]); } catch (error) { /* 提示出错不影响结算 */ }
    }
    function setNotice(id, notice) {
        if (generationStage) { generationStage.notices.push([id, notice]); return; }
        if (notice) notices.set(id, { id, ...notice });
        else notices.delete(id);
        emitNotices();
    }

    // 刷新战斗侧生命数据（v0.39 Pt）：结算时 write:true 让战斗侧扫本楼的 battle/hurt 标签；其余场景只读。
    function refreshLife(opts = {}) {
        const source = life();
        if (!source || typeof source.refresh !== 'function') { diag('stats-life-source-missing'); return Promise.resolve({ ok: false, reason: 'stats-life-source-missing' }); }
        return Promise.resolve().then(() => source.refresh({ ...opts, heroPrefs: heroPrefs() })).then((r) => {
            if (!r || r.ok !== true) diag('stats-life-sync-failed', { reason: r && r.reason });
            if (r && r.reason !== 'request-stale') { if (ledger) onChange(currentStatsState(ledger), null); refreshBuildAsk(); }
            return r;
        }, (error) => { diag('stats-life-sync-threw', { error: String(error && error.message || error) }); return { ok: false, reason: 'stats-life-sync-threw' }; });
    }

    // ---- 存储：差分写数据库表（statsTables），读取按「聊天 id + 表版本」缓存 ----
    const tables = () => {
        let t = null;
        try { t = statsTables(); } catch (error) { t = null; }
        return t && t.ok === true ? t : { ok: false, reason: (t && t.reason) || 'stats-db-missing' };
    };
    // 缓存键：聊天 id + 表版本（statsTables().version 若有）；没有版本号时用自己的写入计数。
    const cacheKey = (t) => `${chatIdOf(ctx())}|${t && t.version !== undefined ? `v${t.version}` : `w${writes}`}`;

    const currencyEditor = createCurrencyEditor({
        tables: () => tables(), inventory: inventoryOf, intents: editIntents,
        chatId: () => chatIdOf(ctx()), chat: () => messages(ctx()),
        adopt: merged => {
            currency = merged.currency || null;
            currencyEdit = merged.currencyEdit || null;
            currencyEditError = merged.currencyEditError || '';
            for (const key of ['chat:currency', 'chat:currencyEdit']) {
                if (merged.baseline.has(key)) baseline.set(key, merged.baseline.get(key));
                else baseline.delete(key);
            }
        },
    });

    function adopt(merged) {
        ledger = merged.ledger; chatEnabled = merged.chatEnabled; buildMode = merged.buildMode ?? null; buildChoices = merged.buildChoices || {};
        npcPolicy = merged.npcPolicy ?? null; npcChoices = merged.npcChoices || {};
        catalog = merged.catalog; learned = merged.learned; baseline = merged.baseline; currency = merged.currency || null;
        currencyEdit = merged.currencyEdit || null; currencyEditError = merged.currencyEditError || '';
    }

    function resetLoaded() {
        const sameChat = Boolean(loadedChat && loadedChat === chatIdOf(ctx()));
        const currencyNotice = (currencyNoticeLease?.() || (sameChat && currencyJob?.alive?.())) ? notices.get('currency') : null;
        const preservedBusy = [];
        if (sameChat) {
            for (const key of VISIBLE_BUSY_TASKS) {
                const notice = notices.get(key);
                if (notice?.kind === 'busy' && generationTasks.get(key)) preservedBusy.push([key, notice]);
            }
        }
        ledger = null; chatEnabled = false; buildMode = null; buildChoices = {}; npcPolicy = null; npcChoices = {}; blocked = ''; unavailable = ''; learned = {}; catalog = emptyCatalog(); declined = false; currency = null;
        currencyEdit = null; currencyEditError = '';
        baseline = new Map(); pendingOption = null; manualCheck = null; notices.clear();
        if (currencyNotice) notices.set('currency', currencyNotice);
        for (const [key, notice] of preservedBusy) notices.set(key, notice);
    }

    function load() {
        resetLoaded();
        const chatId = chatIdOf(ctx());
        loadedChat = chatId;
        refreshAttributeRecovery();
        const read = store.read();
        if (!read.ok) { blocked = read.reason; diag('stats-read-failed', { reason: read.reason }); loadedKey = ''; return; }
        declined = read.declined === true;
        const t = tables();
        if (!t.ok) { unavailable = t.reason; diag(t.reason); loadedKey = ''; return; }
        const savedEdit = editIntents ? editIntents.read(chatId) : { ok: true, intent: null };
        if (!savedEdit.ok) { blocked = savedEdit.reason; diag(savedEdit.reason); loadedKey = ''; return; }
        const savedHeroInit = heroInitIntents.read(chatId);
        if (!savedHeroInit.ok) { blocked = savedHeroInit.reason; diag(savedHeroInit.reason); loadedKey = ''; return; }
        const savedGeneration = generationSave.pending();
        if (!savedGeneration.ok) { blocked = savedGeneration.reason; generationSaveNotice(savedGeneration); loadedKey = ''; return; }
        const recoveryRecords = savedEdit.intent ? ['intent', 'config', 'done']
            .map(step => ({ kind: 'stats', record: currencyEditRecord(savedEdit.intent, step) })) : [];
        recoveryRecords.push(...(savedGeneration.intent?.records || []).map(record => ({ kind: 'stats', record })));
        const rows = t.read({ kinds: ['stats'], recoveryRecords });
        if (!rows || rows.ok !== true) { blocked = (rows && rows.reason) || 'stats-log-read-failed'; diag('stats-log-read-failed', { reason: blocked }); loadedKey = ''; return; }
        if (savedGeneration.intent) generationSaveNotice({ ok: false, reason: 'stats-generation-save-pending' });
        loadedKey = cacheKey(t);
        const c = ctx();
        if (Array.isArray(rows.stats)) {
            const merged = mergeStatLog(rows.stats, { chatId, chat: messages(c) });
            merged.diagnostics.forEach((d) => diag(d.code, d));
            if (merged.ledger) { adopt(merged); return; }
        }
        // 表里没有本聊天的记录：旧版整体快照（igs_stats）只在这里导入一次。
        if (read.raw) {
            if (importFailure && importFailure.chatId === chatId) { unavailable = importFailure.reason; setNotice('import', { kind: 'info', text: `旧数值存档导入失败：${importFailure.reason}` }); return; }
            importLegacy(read.raw, t, !Array.isArray(rows.stats));
        }
    }

    // 总开关关闭时不读表（规格 §6）：只有缓存键变了才重读；写入进行中以内存为准。
    // explicit 为真时（用户在设置页主动操作本聊天）不看总开关，保证操作建立在真实存档上而不是空账本上。
    function ensureLoaded(explicit = false) {
        // 挂着聊天监听不代表数据库已就绪；失败后和表版本变化后仍需恢复读取。
        if (inflight > 0 && inflightChat === chatIdOf(ctx())) return;
        if (currencyBusy > 0 && loadedChat === chatIdOf(ctx())) return;
        if (generationCommitActive > 0 && loadedChat === chatIdOf(ctx())) return;
        const chatId = chatIdOf(ctx());
        if (!explicit && !settings().enabled) { if (loadedChat !== chatId) { resetLoaded(); loadedKey = ''; loadedChat = chatId; } return; }
        if (loadedKey && loadedKey === cacheKey(tables())) return;
        load();
        if (ledger && chatEnabled) refreshOnboarding();
    }

    // 旧存档导入（v0.39 Ls）：先转成记录，建表后追加，读回逐条校验；成功后重新加载。失败只记一次，本聊天不再重试。
    function importLegacy(raw, t, needCreate) {
        const c = ctx();
        const chatId = chatIdOf(c);
        const plan = importLegacyStats(raw, { chatId, chat: messages(c), createdAt: Date.now() });
        if (!plan.ok) { unavailable = plan.reason; diag(plan.reason); return; }
        blocked = 'stats-importing';
        loadedKey = '';
        if (importJob && importJob.chatId === chatId) return;
        const job = { chatId, promise: null };
        job.promise = (async () => {
            if (needCreate) {
                const made = await t.ensure();
                if (!made || made.ok !== true) return { ok: false, reason: (made && made.reason) || 'stats-log-create-failed' };
            }
            const wrote = await t.append(plan.records);
            if (!wrote || wrote.ok !== true || (wrote.pending || []).length) return { ok: false, reason: (wrote && (wrote.reason || (wrote.rejected && wrote.rejected[0] && wrote.rejected[0].reason))) || 'stats-import-write-failed' };
            const back = t.read({ kinds: ['stats'] });
            if (!back || back.ok !== true || !Array.isArray(back.stats)) return { ok: false, reason: (back && back.reason) || 'stats-import-readback-failed' };
            return verifyStatImport(mergeStatLog(back.stats, { chatId, chat: messages(ctx()) }), plan);
        })().catch(() => ({ ok: false, reason: 'stats-import-threw' })).then((result) => {
            if (importJob === job) importJob = null;
            if (chatIdOf(ctx()) !== chatId) return result;
            if (result.ok) {
                diag('stats-import-done', { skipped: plan.skipped.length });
                if (plan.dropped.length) diag('stats-save-entries-dropped', { count: plan.dropped.length });
                if (plan.learnedDropped) diag('stats-learned-dropped', { count: plan.learnedDropped });
            } else { importFailure = { chatId, reason: result.reason }; diag('stats-import-failed', { reason: result.reason }); }
            writes += 1;
            load();
            if (result.ok) setNotice('import', { kind: 'info', text: '已导入旧数值存档', ttl: true });
            onChange(ledger ? currentStatsState(ledger) : null, null);
            refreshOnboarding();
            if (active()) refreshLife();
            return result;
        });
        importJob = job;
    }

    function writeFailed(result) {
        const reason = (result && (result.reason || (result.rejected && result.rejected[0] && result.rejected[0].reason))) || 'stats-log-write-failed';
        diag('stats-log-write-failed', { reason });
        setNotice('save', { kind: 'info', text: `数值记录未写入数据库：${reason}` });
        // 失败后以表里实际内容为准，下次差分才不会漏记。
        const t = tables();
        const rows = t.ok ? t.read({ kinds: ['stats'] }) : null;
        if (rows && rows.ok === true && Array.isArray(rows.stats)) baseline = mergeStatLog(rows.stats, { chatId: chatIdOf(ctx()), chat: messages(ctx()) }).baseline;
    }

    // 持久化（v0.39 ms）：算聊天级差分、附上楼层记录，一次追加；追加串行排队。
    function persist(extra = [], options = {}) {
        if (!ledger || blocked || unavailable) return options.generation
            ? Promise.resolve({ ok: false, reason: blocked || unavailable || 'stats-no-ledger' }) : null;
        const held = generationSave.pending();
        if (!held.ok || (held.intent && options.generation)) return Promise.resolve(held.ok
            ? { ok: false, reason: 'stats-generation-save-pending' } : held);
        const t = tables();
        if (!t.ok) {
            if (options.generation) return Promise.resolve({ ok: false, reason: t.reason });
            writeFailed({ reason: t.reason }); return null;
        }
        const next = chatEntries({ chatEnabled, catalog, learned, buildMode, buildChoices, npcPolicy, npcChoices, currency, currencyEdit });
        writeSeq += 1;
        const records = [...extra, ...diffChatRecords(options.generation?.beforeEntries || baseline, next, { tag: `${Date.now().toString(36)}${writeSeq}`, createdAt: Date.now() })];
        if (options.generation) {
            const task = options.generation;
            task.check();
            if (!records.length) return Promise.resolve({ ...options.result, ok: true });
            const prepared = records.length ? generationSave.prepare(task.key, records, options.result || { ok: true }, task.alive, task.beforeRows) : { ok: true };
            if (!prepared.ok) return Promise.resolve(prepared);
            return Promise.resolve().then(() => finishGenerationSave(task));
        }
        baseline = next;
        if (!records.length) return null;
        inflight += 1;
        inflightChat = chatIdOf(ctx());
        const chatId = inflightChat;
        const ownerAlive = generationTasks.lease();
        let started;
        const shouldStart = () => ownerAlive() && (!options.shouldStart || options.shouldStart() === true);
        try { started = t.append(records, { ...options, shouldStart }); } catch (error) { started = Promise.reject(error); }
        const job = Promise.resolve(started).then((r) => {
            if (!shouldStart()) return { ok: false, reason: 'request-stale' };
            if (!r || r.ok !== true) writeFailed(r);
            return r;
        }, () => {
            const r = { ok: false, reason: 'stats-log-write-threw' };
            if (shouldStart()) writeFailed(r);
            return shouldStart() ? r : { ok: false, reason: 'request-stale' };
        }).finally(() => {
            inflight -= 1;
            writes += 1;
            // 自己的写入完成后，缓存键跟着更新：内存状态已是最新，不必再整表读一遍。
            if (inflight === 0 && loadedChat === chatId && shouldStart()) loadedKey = cacheKey(tables());
        });
        tail = Promise.all([tail, job]).then(() => {});
        return job;
    }

    function refreshAttributeRecovery(failure = '') {
        if (!attributeAccess || !settings().enabled) return;
        const held = attributeAccess().status();
        if (held.reason === 'stats-attribute-save-pending') {
            const owner = generationIdentity();
            setNotice('attribute-save', { kind: 'recovery', chatId: chatIdOf(ctx()), generation: owner?.generation,
                text: failure ? `属性尚未恢复：${failure}` : '上次属性修改尚未确认。',
                actions: [['retry', '核对并恢复原修改']], operation: held.operation });
        } else if (notices.has('attribute-save')) setNotice('attribute-save', null);
    }

    function generationSaveNotice(result) {
        if (result?.reason === 'request-stale') return;
        const conflict = ['stats-generation-conflict', 'stats-generation-log-conflict', 'stats-generation-record-conflict'].includes(result?.reason);
        const held = generationSave.pending();
        const retained = held.ok && Boolean(held.intent);
        setNotice('generation-save', result?.ok ? null : { kind: 'recovery',
            text: result?.stage === 'read' ? `数值日志读取失败，已停止本次操作：${result.reason}`
                : conflict ? `生成结果与当前档案冲突，已停止写入${retained ? '并保留原结果' : ''}：${result.reason}`
                : `生成结果保存未完成：${result?.reason || 'stats-generation-save-unverified'}`,
            actions: retained ? [['retry', conflict ? '重新核对原结果' : '重试保存']]
                : [['dismiss', '知道了']] });
    }
    function stageGeneration(task, apply) {
        return enqueueGenerationCommit(async () => {
            await tail;
            checkGeneration(task);
            if (typeof task.conflictCheck === 'function') {
                const latest = generationSave.read(null, task.alive);
                if (!latest.ok) {
                    task.check();
                    if (notices.get(task.key)?.kind === 'busy') setNotice(task.key, null);
                    generationSaveNotice(latest);
                    return latest;
                }
                task.beforeRows = latest.rows;
                task.saveRevision = generationRevision();
            }
            const previous = { catalog, ledger, learned };
            const effects = { notices: [], codex: false, push: false };
            task.beforeEntries = chatEntries({ chatEnabled, catalog, learned, buildMode, buildChoices, npcPolicy, npcChoices, currency, currencyEdit });
            let saved;
            try {
                catalog = structuredClone(catalog);
                ledger = structuredClone(ledger);
                learned = structuredClone(learned);
                generationStage = effects;
                const { extra = [], result = { ok: true } } = apply();
                saved = persist(extra, { generation: task, result: { ...result, effects } });
            } finally {
                generationStage = null;
                ({ catalog, ledger, learned } = previous);
            }
            const result = await Promise.resolve(saved);
            task.check();
            if (result?.ok && !result.recovered) publishGeneration(task, result);
            if (!result?.ok) {
                if (notices.get(task.key)?.kind === 'busy') setNotice(task.key, null);
                generationSaveNotice(result);
            }
            return result;
        });
    }
    function publishGeneration(task, result) {
        task.check();
        const effects = result.effects || {};
        if (effects.heroAssigned) heroAsked.add(chatIdOf(ctx()));
        for (const [id, notice] of effects.notices || []) { task.check(); setNotice(id, notice); }
        task.check();
        if (effects.events) pendingEvents = { bond: [...pendingEvents.bond, ...effects.events.bond], review: [...pendingEvents.review, ...effects.events.review] };
        if (effects.codex && ledger) { task.check(); lightGlobalCodex(currentStatsState(ledger)); }
        if (effects.push) { task.check(); push(task.alive); }
        task.check();
        if (ledger) onChange(currentStatsState(ledger), null);
    }
    async function finishGenerationSave(task) {
        task.check();
        task.stage = 'save';
        const revision = task.saveRevision ?? task.sourceRevision ?? generationRevision();
        const stillMatches = () => (typeof task.conflictCheck === 'function'
            ? task.conflictCheck()
            : generationRevision() === revision);
        const alive = () => task.alive() && stillMatches();
        inflight += 1;
        inflightChat = chatIdOf(ctx());
        const run = async () => {
            try {
                // 并发非生成写口（如 setNpcPolicy、heroInit 的 heroBio/currency、detectNewCharacters 的 notified/queue）
                // 可能在 recover 等待 DB I/O 期间刚更新内存并入队 persist()；adopt(merged) 不得将其回滚成旧快照。
                const beforeSnap = {
                    npcPolicy,
                    npcChoices: JSON.stringify(npcChoices),
                    buildMode,
                    buildChoices: JSON.stringify(buildChoices),
                    currency: JSON.stringify(currency),
                    currencyEdit: JSON.stringify(currencyEdit),
                    heroBio: catalog.heroBio || '',
                    notified: JSON.stringify(catalog.notified || []),
                    queue: JSON.stringify(catalog.queue || {}),
                };
                let result = await generationSave.recover(alive);
                task.check();
                if (!stillMatches()) result = { ok: false, reason: 'stats-generation-conflict' };
                if (result.ok && result.rows) {
                    const liveNow = {
                        npcPolicy, npcChoices, buildMode, buildChoices, currency, currencyEdit,
                        heroBio: catalog.heroBio || '', notified: catalog.notified || [], queue: catalog.queue || {},
                        baseline: new Map(baseline),
                    };
                    const merged = mergeStatLog(result.rows, { chatId: chatIdOf(ctx()), chat: messages(ctx()) });
                    task.check();
                    adopt(merged);
                    const restoreKey = (key) => {
                        if (liveNow.baseline.has(key)) baseline.set(key, liveNow.baseline.get(key));
                        else baseline.delete(key);
                    };
                    if (liveNow.npcPolicy !== beforeSnap.npcPolicy && npcPolicy !== liveNow.npcPolicy) {
                        npcPolicy = liveNow.npcPolicy;
                        restoreKey('chat:npcPolicy');
                    }
                    if (JSON.stringify(liveNow.npcChoices) !== beforeSnap.npcChoices && JSON.stringify(npcChoices) !== JSON.stringify(liveNow.npcChoices)) {
                        npcChoices = liveNow.npcChoices;
                        restoreKey('chat:npcChoices');
                    }
                    if (liveNow.buildMode !== beforeSnap.buildMode && buildMode !== liveNow.buildMode) {
                        buildMode = liveNow.buildMode;
                        restoreKey('chat:buildMode');
                    }
                    if (JSON.stringify(liveNow.buildChoices) !== beforeSnap.buildChoices && JSON.stringify(buildChoices) !== JSON.stringify(liveNow.buildChoices)) {
                        buildChoices = liveNow.buildChoices;
                        restoreKey('chat:buildChoices');
                    }
                    if (JSON.stringify(liveNow.currency) !== beforeSnap.currency && JSON.stringify(currency) !== JSON.stringify(liveNow.currency)) {
                        currency = liveNow.currency;
                        restoreKey('chat:currency');
                    }
                    if (JSON.stringify(liveNow.currencyEdit) !== beforeSnap.currencyEdit && JSON.stringify(currencyEdit) !== JSON.stringify(liveNow.currencyEdit)) {
                        currencyEdit = liveNow.currencyEdit;
                        restoreKey('chat:currencyEdit');
                    }
                    let nextCat = catalog;
                    if (liveNow.heroBio !== beforeSnap.heroBio && (nextCat.heroBio || '') !== liveNow.heroBio) {
                        nextCat = { ...nextCat, heroBio: liveNow.heroBio };
                        restoreKey('hero:bio');
                    }
                    if (JSON.stringify(liveNow.notified) !== beforeSnap.notified && JSON.stringify(nextCat.notified || []) !== JSON.stringify(liveNow.notified)) {
                        nextCat = { ...nextCat, notified: [...new Set([...(nextCat.notified || []), ...liveNow.notified])] };
                        restoreKey('queue:notified');
                    }
                    if (JSON.stringify(liveNow.queue) !== beforeSnap.queue && JSON.stringify(nextCat.queue || {}) !== JSON.stringify(liveNow.queue)) {
                        const livePeople = Array.isArray(liveNow.queue.people) ? liveNow.queue.people : [];
                        const mergedPeople = Array.isArray(nextCat.queue?.people) ? nextCat.queue.people : [];
                        const mergedSkills = Array.isArray(nextCat.queue?.skills) ? nextCat.queue.skills : [];
                        const liveSkills = Array.isArray(liveNow.queue.skills) ? liveNow.queue.skills : [];
                        nextCat = {
                            ...nextCat,
                            queue: {
                                people: [...new Set([...mergedPeople, ...livePeople.filter((n) => !nextCat.sheets?.[n])])],
                                skills: [...new Set([...mergedSkills, ...liveSkills])],
                            },
                        };
                        restoreKey('queue:people');
                        restoreKey('queue:skills');
                    }
                    if (nextCat !== catalog) catalog = sanitizeCatalog(nextCat);
                    loadedKey = cacheKey(tables());
                    publishGeneration(task, result);
                }
                generationSaveNotice(result);
                const { rows, ...outcome } = result;
                return outcome;
            } finally { inflight -= 1; writes += 1; }
        };
        const job = run();
        tail = Promise.all([tail, job]).then(() => {}, () => {});
        return job;
    }
    function retryGenerationSave() {
        return generationTasks.start('generation-save', async task => {
            const result = await finishGenerationSave(task);
            task.check();
            return result;
        });
    }
    function pendingGenerationSave(forKey = '', onRecovered = null) {
        if (generationCommitActive > 0) return null;
        const held = generationSave.pending();
        if (!held.ok) return Promise.resolve(held);
        if (!held.intent) return null;
        const recovery = retryGenerationSave();
        if (forKey && held.intent.key && held.intent.key !== forKey && typeof onRecovered === 'function') {
            return recovery.then((res) => (res?.ok ? onRecovered() : res));
        }
        return recovery;
    }

    // 才艺技能表里的技能名：旧六维名换成现行名，别名换成注册表里的正式名。
    function skillCanon(raw) {
        const name = canonicalAttribute(raw);
        if (isSixAttribute(name)) return name;
        try { return memoEngineOf().registry.resolve(name) || name; } catch (error) { return name; }
    }

    // IGS 现有的六维与技能：{ 主角 | 角色名: { 名称: 值 } }，写进才艺技能表。
    // 六维用百分制（与技能同一量纲，供 1d100 检定直接取用），战斗源没就绪时主角六维不写；NPC 只写已有角色卡的角色。
    // 主角在才艺技能表里已有的技能行（IGS 认得的名字）：这些行一律按当前生效值写回，随身系统关闭后加成为 0，表格回到底数。
    function heroTableSkills(engine) {
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        if (!client) return [];
        try {
            const read = readSkillAdoptions(client, { 主角: {} }, { overridesByFingerprint: settings().push.mappings, characterKey: pushOptions.characterKey, isHero, canon: skillCanon });
            if (!read.ok) return [];
            return read.fresh.filter((r) => r.key === '主角' && (BUILTIN_SKILLS[r.skill] || engine.registry.has(r.skill))).map((r) => r.skill);
        } catch (error) { return []; }
    }

    function skillValuesOf(state) {
        const engine = memoEngineOf();
        state = heroView(state, engine);
        const out = {};
        const hero = {};
        const source = attributes();
        const sheet = cocSheetOf(engine);
        // 调查员档的属性直接取档，不依赖战斗属性表是否就绪。
        if (sheet || (source && source.ready === true)) {
            for (const name of (sheet ? [...COC_ATTRS, '幸运'] : BASE_ATTRIBUTES)) hero[name] = Math.round(Number(profileOf(engine, state, PROTAGONIST, name).value) || 0);
        }
        const owned = state.protagonist.skills || {};
        const bonusNames = heroBonusSkillNames(engine);
        const names = new Set([...Object.keys(owned), ...Object.keys(engine.protagonistBase || {}), ...Object.keys(engine.protagonistEdit || {}), ...(sheet ? Object.keys(cocSkillTotals(sheet)) : []), ...bonusNames]);
        for (const name of names) {
            if (isSixAttribute(name)) continue;
            // 写回表格的是生效值（含随身系统加成）。
            const level = bonusNames.has(name) ? Math.round(Number(profileOf(engine, state, PROTAGONIST, name).value) || 0) : heroSkillLevel(engine, owned[name], name);
            if (level > 0) hero[name] = Math.round(level);
        }
        for (const name of heroTableSkills(engine)) {
            if (isSixAttribute(name) || Object.hasOwn(hero, name)) continue;
            const value = Math.round(Number(profileOf(engine, state, PROTAGONIST, name).value) || 0);
            if (value > 0) hero[name] = value;
        }
        out['主角'] = hero;
        for (const [name, sheet] of Object.entries(catalog.sheets || {})) {
            if (!state.characters[name]) continue;
            const row = {};
            if (attributeAccess ? engine.readAbilities(name)?.initialized : sheetAbilityScores(sheet)) for (const attr of BASE_ATTRIBUTES) row[attr] = Math.round(Number(profileOf(engine, state, name, attr).value) || 0);
            for (const skill of Object.keys(sheet.skills || {})) {
                const value = Math.round(Number(profileOf(engine, state, name, skill).value) || 0);
                if (value > 0) row[skill] = value;
            }
            out[name] = row;
        }
        return out;
    }

    // 才艺技能表的采纳：表里 IGS 没有的技能首次读到时按表值收进 IGS（之后归 IGS 管）；
    // includeChanged 为真时，IGS 已有的技能表值与 IGS 不同视为用户手改并采纳（AI 填表窗口内不采纳，由推送盖回）。
    // 主角技能走手改覆盖层（setHeroSkill）或底数；NPC 写角色卡技能值（扣掉成长加成后存底数）。
    function adoptSkillRows({ includeChanged = false } = {}) {
        const none = { fresh: [], changed: [] };
        if (!ledger || !active() || !pushOn()) return none;
        collectOriginSkills();
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        if (!client) return none;
        const state = currentStatsState(ledger);
        const read = readSkillAdoptions(client, skillValuesOf(state), { overridesByFingerprint: settings().push.mappings, characterKey: pushOptions.characterKey, isHero, canon: skillCanon });
        if (!read.ok) { diag(read.reason, { detail: read.detail }); return none; }
        // 调查员模式下主角行写的是调查员值，不能当成日常手改采纳。
        if (cocSheetOf(memoEngineOf())) { read.fresh = read.fresh.filter((i) => i.key !== '主角'); read.changed = read.changed.filter((i) => i.key !== '主角'); }
        if (!read.fresh.length && !read.changed.length) return none;
        const done = { fresh: [], changed: [] };
        for (const item of read.fresh) {
            const skill = BUILTIN_SKILLS[item.skill] || memoEngineOf().registry.has(item.skill) ? item.skill : commitSkill(item.skill);
            if (!skill) { diag('stats-skill-adopt-rejected', { name: item.key, skill: item.skill }); continue; }
            if (item.key === '主角') catalog = sanitizeCatalog({ ...catalog, protagonistBase: { ...catalog.protagonistBase, [skill]: withoutHeroBonus(memoEngineOf(), skill, item.value) } });
            else setSheetSkill(item.key, skill, item.value, state);
            done.fresh.push({ ...item, skill });
            diag('stats-skill-adopted', { name: item.key, skill, to: item.value });
        }
        if (includeChanged) {
            for (const item of read.changed) {
                if (item.key === '主角' && Object.hasOwn(pushedHeroSkills, item.skill) && pushedHeroSkills[item.skill] === item.to) continue;
                if (item.key === '主角') {
                    const own = state.protagonist.skills[item.skill];
                    const fromBase = !(own && Number(own.value) > 0) && !(catalog.protagonistEdit && catalog.protagonistEdit[item.skill]);
                    if (fromBase) catalog = sanitizeCatalog({ ...catalog, protagonistBase: { ...catalog.protagonistBase, [item.skill]: withoutHeroBonus(memoEngineOf(), item.skill, item.to) } });
                    else if (!setHeroSkill(item.skill, String(item.to)).ok) { diag('stats-skill-adopt-unsupported', { name: item.key, skill: item.skill }); continue; }
                } else setSheetSkill(item.key, item.skill, item.to, state);
                done.changed.push(item);
                diag('stats-skill-manual-adopted', { name: item.key, skill: item.skill, from: item.from, to: item.to });
            }
        }
        if (done.fresh.length || done.changed.length) {
            persist();
            onChange(currentStatsState(ledger), null);
        }
        return done;
    }

    // 把 NPC 技能的显示值写成角色卡底数（显示值 = 底数 + 成长加成）。
    function setSheetSkill(name, skill, shown, state) {
        const cur = catalog.sheets[name];
        if (!cur) return;
        const growth = state && state.characters[name] && state.characters[name].skillGrowth && state.characters[name].skillGrowth[skill];
        const base = Math.max(1, Math.round(shown - (Number(growth && growth.bonus) || 0)));
        const provisional = { ...(cur.provisional || {}) };
        delete provisional[skill];
        catalog = sanitizeCatalog({ ...catalog, sheets: { ...catalog.sheets, [name]: { ...cur, skills: { ...(cur.skills || {}), [skill]: base }, provisional } } });
    }

    // 基础属性列只推永久分值；装备与随身加成只出现在生效值列。
    function baseAttributesOf(state) {
        const source = attributes();
        if (!source || source.ready !== true) return null;
        if (attributeAccess) {
            const scores = source.readAbilities(userName() || PROTAGONIST, { heroPrefs: heroPrefs() })?.permanentScores;
            return scores ? Object.fromEntries(Object.entries(scores).map(([key, value]) => [ABILITY_LABELS[key], value])) : null;
        }
        const engine = memoEngineOf();
        return Object.fromEntries(BASE_ATTRIBUTES.map((name) => [name, Math.round((Number(profileOf(engine, state, PROTAGONIST, name).value) || 50) / 5)]));
    }

    // 单向推送到表格（§8A）：子开关关或没装表格插件时什么都不做；失败只记诊断，不影响结算。
    // 同一时间只跑一次推送，后到的请求排在当前这次之后。
    function push(ownerAlive = null) {
        if (generationStage) { generationStage.push = true; return Promise.resolve({ ok: true, staged: true }); }
        if (!active() || !pushOn()) return Promise.resolve({ ok: true, skipped: true });
        const current = currencyLease();
        const alive = () => current() && (!ownerAlive || ownerAlive());
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        if (!client) return Promise.resolve({ ok: false, reason: 'stats-push-no-client' });
        const run = () => {
            if (!alive()) return { ok: false, reason: 'request-stale', wrote: 0 };
            collectOriginSkills();
            const state = heroView(currentStatsState(ledger));
            writingTable = true;
            const heroAtPush = { ...(skillValuesOf(state)['主角'] || {}) };
            return pushStats(client, state, { ...pushOptions, overridesByFingerprint: settings().push.mappings, baseAttributes: baseAttributesOf(state), currency: currencySnapshot(), walletExtra: combatPoints(), isHero, skillValues: () => skillValuesOf(state), heroName: userName(), skillCanon, shouldStart: alive }).then((r) => {
                writingTable = false;
                selfWriteUntil = r && r.wrote ? Date.now() + SELF_WRITE_QUIET : 0;
                if (r && r.ok) pushedHeroSkills = heroAtPush;
                if (!r.ok) diag(r.reason || 'stats-push-partial', { failures: (r.failures || []).length });
                (r.diagnostics || []).forEach((d) => diag(d.code, d));
                return r;
            }, (error) => { writingTable = false; diag('stats-push-threw', { error: String(error && error.message || error) }); return { ok: false, reason: 'stats-push-threw' }; });
        };
        pushing = (pushing || Promise.resolve()).then(run, run);
        return pushing;
    }

    function clearPrompt() {
        const c = ctx();
        if (!c) return;
        if (c.extensionPrompts && c.extensionPrompts[STATS_PROMPT_KEY]) {
            try { delete c.extensionPrompts[STATS_PROMPT_KEY]; } catch (error) { /* */ }
        }
        if (typeof c.setExtensionPrompt === 'function' && c.extensionPrompts && c.extensionPrompts[STATS_PROMPT_KEY]) {
            try { c.setExtensionPrompt(STATS_PROMPT_KEY, '', NONE, 0, false, 0); } catch (error) { /* */ }
        }
    }

    function latestEntry() {
        let best = null;
        for (const [messageId, swipeId] of ledger.active) {
            if (!best || messageId > best.messageId) best = ledger.entries.get(ledgerKey(ledger, messageId, swipeId)) || best;
        }
        return best;
    }

    // 本聊天可匹配的技能（v2 §5.3）：基础属性、默认特有技能、核心技能、已有技能与剧情技能；世界观技能只在已有时匹配。
    function matchable(state) {
        return [...new Set([...BASE_ATTRIBUTES, ...DEFAULT_SPECIAL_SKILLS, ...CORE_SKILL_NAMES, ...Object.keys(heroView(state).protagonist.skills), ...catalog.story.map((s) => s.name)])];
    }
    function storyLexicon() {
        return Object.fromEntries(catalog.story.map((s) => [s.name, { solo: [s.name, ...(s.aliases || [])] }]));
    }
    function mentionedCharacter(text, state) {
        const clean = String(text || '').replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g, ' ');
        return Object.keys(state.characters).find((name) => clean.includes(name)) || null;
    }

    // ---- 正文检定（check-rolls / stat-coc-checks）：骰序按「聊天 + 楼序号 + swipe」预生成，AI 能看到，回放时逐条核对 ----
    // 「设为User立绘」的角色与酒馆用户名一样按主角处理：不记人际数值，状态栏显示生活条。
    // 场景素材别名同组的名字（含用户名被登记成某角色别名的情况）一并算主角。
    const isHero = (name) => {
        const n = String(name || '').trim();
        if (isProtagonist(name)) return true;
        let picked = '';
        let aliases = {};
        try { picked = String(userCharacter() || '').trim(); } catch (error) { picked = ''; }
        try { aliases = characterAliases() || {}; } catch (error) { aliases = {}; }
        const heroes = [userName().trim(), picked].filter(Boolean);
        if (!n || !heroes.length) return false;
        if (heroes.includes(n)) return true;
        return Object.entries(aliases).some(([key, list]) => {
            const group = [key, ...(Array.isArray(list) ? list : [])].map((v) => String(v || '').trim());
            return group.includes(n) && heroes.some((h) => group.includes(h));
        });
    };

    // 后台请求里的「主角」资料：User 设定之外，再拼上被认作主角的角色卡人设（卡名、群聊成员、设为User立绘的角色）。
    // 主角人设写在角色卡里时（如卡名「李哪吒」是主角本人），补全与分配才能按人设给档。
    const describeWithHero = async (names) => {
        const list = typeof describePeople === 'function' ? await describePeople(names) : names.map((name) => ({ name, summary: '' }));
        if (!names.includes(PROTAGONIST) || typeof describePeople !== 'function') return list;
        const c = ctx();
        let picked = '';
        try { picked = String(userCharacter() || '').trim(); } catch (error) { picked = ''; }
        const own = new Set([userName().trim(), PROTAGONIST]);
        const cards = [...new Set([picked, c && c.name2, ...((c && Array.isArray(c.groupMembers)) ? c.groupMembers : [])]
            .map((n) => String(n || '').trim()))].filter((n) => n && !own.has(n) && isHero(n));
        if (!cards.length) return list;
        let extra = [];
        try { extra = await describePeople(cards); } catch (error) { extra = []; }
        const more = extra.map((p) => String((p && p.summary) || '').trim()).filter(Boolean).join(' ');
        if (!more) return list;
        const ownMore = extra.map((p) => String((p && (p.own ?? p.summary)) || '').trim()).filter(Boolean).join('\n');
        const worldMore = extra.map((p) => String((p && p.world) || '').trim()).filter(Boolean).join('\n');
        return list.map((p) => (p && p.name === PROTAGONIST ? {
            ...p, summary: `${String(p.summary || '').trim()} ${more}`.trim(),
            own: `${String((p.own ?? p.summary) || '').trim()}\n${ownMore}`.trim(), world: `${String(p.world || '').trim()}\n${worldMore}`.trim(),
        } : p));
    };

    // 回放需要的取数回调。D&D 与 CoC 共用同一份 profile，百分制 = 六维分数 × 5。
    // 战斗源未就绪时 D&D 回放没有六维可用，返回 { ok:false }（CoC 直接走引擎 profile，不依赖战斗源）。
    function replaySources(engine, state) {
        const source = attributes();
        if (attributeAccess && !source?.ready) return { ok: false, reason: source?.reason || 'stats-attribute-read-failed' };
        const coc = IS_COC(engine);
        state = heroView(state, engine);
        const resolveName = (raw) => engine.registry.resolve(raw) || String(raw || '').trim();
        const modsFor = (skill, ability) => modifiersOf(engine, state, { actor: PROTAGONIST, skill: skill ? resolveName(skill) : ABILITY_LABELS[ability] });
        if (coc) {
            return {
                ok: true,
                profileOf: (actor, name) => profileOf(engine, state, isHero(actor) ? PROTAGONIST : actor, name),
                edgeOf: (actor, tag) => (isHero(actor) ? modsFor(tag.skill, tag.ability).edge : null),
                shiftOf: (actor, tag) => (isHero(actor) ? modsFor(tag.skill, tag.ability).shift : 0),
            };
        }
        if (!source || source.ready !== true || typeof source.readAbilities !== 'function') return { ok: false, reason: (source && source.reason) || 'stats-life-source-missing' };
        return {
            ok: true,
            readAbilities: (actor) => {
                if (isHero(actor)) return engine.readAbilities(userName() || PROTAGONIST);
                return attributeAccess ? engine.readAbilities(actor) : npcAbilities(actor) || engine.readAbilities(actor);
            },
            resolveSkill: (actor, skill) => {
                const p = profileOf(engine, state, isHero(actor) ? PROTAGONIST : actor, resolveName(skill));
                const ability = abilityKeyOf(p.entry && p.entry.attribute);
                return ability ? { ability, bonus: engine.ruleset.bonusOf(p) } : null;
            },
            edgeOf: (actor, tag) => (isHero(actor) ? modsFor(tag.skill, tag.ability).edge : null),
            shiftOf: (actor, tag) => (isHero(actor) ? Math.round((modsFor(tag.skill, tag.ability).shift || 0) / 5) : 0),
        };
    }

    // 回放某一楼正文里的 igs-check 标签。state 是该楼结算前状态。
    function replayFloor(messageId, body, state, engine = memoEngineOf()) {
        const c = ctx();
        const list = messages(c);
        const ordinal = floorCheckOrdinal(list, messageId);
        const coc = IS_COC(engine);
        const rolls = ordinal ? rollsFor(coc, chatIdOf(c), ordinal, floorCheckSwipe(list, messageId)) : null;
        if (!rolls) return { ok: false, reason: 'check-floor-unavailable' };
        const src = replaySources(engine, state);
        if (!src.ok) return src;
        let replay;
        try { replay = coc ? replayCocChecks({ body, rolls, ruleset: engine.ruleset, profileOf: src.profileOf, edgeOf: src.edgeOf, shiftOf: src.shiftOf }) : replayChecks({ body, rolls, ...src }); }
        catch (error) { return { ok: false, reason: 'check-replay-threw' }; }
        return { ok: true, chatId: chatIdOf(c), messageId: Number(messageId), ordinal, rolls, ruleset: engine.ruleset.ID, ...replay };
    }

    // 对外：战斗侧（徽章回放）按楼取回放结果；正文缺省时取当前楼正文。
    function checkReplayFor(messageId, body) {
        if (!active()) return null;
        const id = Number(messageId);
        const m = messages(ctx())[id];
        if (!m || m.is_user) return { ok: false, reason: 'check-floor-unavailable' };
        return replayFloor(id, body == null ? String(m.mes ?? '') : String(body), stateBefore(ledger, id));
    }

    // 正文检定结果 → 结算用的 storyChecks（只收主角的，用于成长打勾与社交暴击）。
    function storyChecksOf(results, engine, rawState) {
        const state = heroView(rawState, engine);
        return (results || []).filter((r) => isHero(r.actor)).map((r) => {
            const skill = r.skill ? engine.registry.resolve(r.skill) || r.skill : ABILITY_LABELS[r.ability];
            const p = profileOf(engine, state, PROTAGONIST, skill);
            return {
                ruleset: r.ruleset || engine.ruleset.ID, actor: PROTAGONIST, skill, kind: p.kind, value: p.value, learned: p.learned, dc: r.dc, difficulty: r.difficulty,
                roll: r.die, total: r.total, tier: r.tier, success: r.success, ladder: r.tier === '大成功' ? 'crit' : r.tier === '大失败' ? 'fumble' : r.success ? 'pass' : 'fail',
                social: isSocialSkill(engine, skill), toward: null, against: null, source: 'story',
            };
        });
    }

    // 正文检定里 NPC 作为一方的记录（用到的技能给 NPC 打成长勾）。
    function npcChecksOf(results, engine) {
        return (results || []).filter((r) => r && r.actor && !isHero(r.actor)).map((r) => ({
            actor: r.actor, skill: r.skill ? engine.registry.resolve(r.skill) || r.skill : ABILITY_LABELS[r.ability],
        }));
    }

    // 注入「骰序」段的输入（check-rolls 的 checkRollsVars 入参）；生成类型决定取哪一楼的骰序。
    // D&D：actors 是各人六维加值；CoC：actors 是百分制属性与高技能。
    function checkPromptInput(type = null) {
        if (!active() || settings().storyCheck !== 'preroll' || SKIP_TYPES.has(type)) return null;
        if (attributeAccess && !attributes().ready) return null;
        const c = ctx();
        const list = messages(c);
        const ordinal = upcomingCheckOrdinal(list, type);
        if (!ordinal) return null;
        const engine = memoEngineOf();
        const state = heroView(type === 'continue' ? stateBefore(ledger, list.length - 1) : currentStatsState(ledger), engine);
        const coc = IS_COC(engine);
        const rolls = rollsFor(coc, chatIdOf(c), ordinal, upcomingCheckSwipe(list, type));
        if (!rolls) return null;
        const hero = userName() || PROTAGONIST;
        const names = present(state).filter((n) => catalog.sheets[n]);
        const edges = [];
        const mods = modifiersOf(engine, state, { actor: PROTAGONIST });
        const shift = coc ? Math.round(mods.shift || 0) : Math.round((mods.shift || 0) / 5);
        if (mods.edge || shift) edges.push({ name: hero, edge: mods.edge, shift, reasons: [...mods.notes, ...(shift < 0 && !mods.notes.length ? ['压力很大'] : [])] });
        const actors = [];
        if (coc) {
            for (const name of [PROTAGONIST, ...names].slice(0, 1 + PRESENT_MAX)) {
                const attrs = Object.fromEntries(attributeNamesOf(engine).map((a) => [a, Math.round(Number(profileOf(engine, state, name, a).value) || 0)]));
                const skills = name === PROTAGONIST ? learnedSkills(state, engine) : Object.entries(catalog.sheets[name].skills || {});
                actors.push({ name: name === PROTAGONIST ? hero : name, attrs, skills });
            }
        } else {
            const src = attributes();
            if (src && src.ready === true) {
                const heroAbilities = engine.readAbilities(hero);
                if (heroAbilities) actors.push({ name: hero, attr: heroAbilities });
            } else diag('stats-check-sources-unavailable', { reason: (src && src.reason) || 'stats-life-source-missing' });
        }
        // 上一层有 igs-check 标签：回放它，写反的更正带给 AI。
        let corrections = [];
        const prev = ordinal > 1 ? floorIndexOfOrdinal(list, ordinal - 1) : -1;
        if (prev >= 0 && /\[igs-check:/.test(String(list[prev].mes ?? ''))) {
            const back = replayFloor(prev, String(list[prev].mes ?? ''), stateBefore(ledger, prev), engine);
            if (back.ok) corrections = coc ? cocCheckCorrections(back.results) : checkCorrections(back.results);
        }
        return { ordinal, rolls, actors, edges, corrections, statsActive: true, ruleset: engine.ruleset.ID };
    }

    // 合并战斗侧与数值侧的检定输入后，主角与带角色卡的人物已由数值侧写入技能/角色卡行，不再重复列。
    function mergedCheckInput(type) {
        let own = null;
        try { own = checkPromptInput(type); } catch (error) { own = null; }
        let combat = null;
        try { combat = typeof combatPrompt === 'function' ? combatPrompt(type) : null; } catch (error) { combat = null; }
        return { own, combat };
    }

    // 本楼检定计划（v2 §5 优先级）：继续生成沿用；选项骰子 > 手动掷骰 > 输入匹配 > roll 标签 / 手动掷骰规则。
    function planCheck(type, c, ruleset) {
        collectOriginSkills();
        const engine = memoEngineOf(ruleset);
        const s = settings();
        if (type === 'continue') {
            const last = latestEntry();
            const meta = (last && last.meta) || {};
            if (manualCheck && last && manualCheck.messageId === last.messageId) {
                const check = manualCheck.check;
                manualCheck = null;
                return { check, note: { source: 'manual' } };
            }
            // roll 标签得出的检定：续写时把结果告诉 AI（display），结算仍按骰面 + 标签重算；其余来源原样沿用。
            const fixed = givenCheck(meta);
            return { check: fixed, preroll: meta.preroll || null, note: meta.note || null, display: fixed ? null : (meta.check || null) };
        }
        manualCheck = null;
        setNotice('roll', null);
        const text = lastUserText(c);
        const state = currentStatsState(ledger);
        if (pendingOption && text && text.includes(pendingOption.line)) {
            const check = pendingOption.check;
            pendingOption = null;
            return { check, note: { source: 'option' } };
        }
        pendingOption = null;
        let reason = text ? 'no-match' : 'no-input';
        if (s.autoSkill && text) {
            const hit = matchSkill(text, { skills: matchable(state), learned, extra: storyLexicon() });
            if (hit.skill) {
                const toward = isSocialSkill(engine, hit.skill) ? mentionedCharacter(text, state) : null;
                const check = resolveHeroCheck(engine, state, { actor: PROTAGONIST, skill: hit.skill, difficulty: hit.difficulty, toward, source: 'input' });
                return { check, note: { source: 'input', word: hit.word } };
            }
            reason = hit.reason || reason;
        } else if (!s.autoSkill) reason = 'auto-skill-off';
        // roll 标签的骰面来自本楼骰序（确定性），不再预掷：preroll 档只留一条来源说明。
        if (s.storyCheck === 'preroll') return { note: { source: 'preroll', reason } };
        if (s.storyCheck === 'manual') return { manual: true, note: { source: 'manual-rule', reason } };
        return { note: { source: 'none', reason: reason === 'no-match' ? 'story-check-off' : reason } };
    }

    function inject(g, c) {
        collectOriginSkills();
        const lastId = Array.isArray(c.chat) ? c.chat.length - 1 : -1;
        const state = g.type === 'continue' ? stateBefore(ledger, lastId) : currentStatsState(ledger);
        const last = latestEntry();
        const flags = (last && last.meta && last.meta.flags) || {};
        const s = settings();
        const engine = memoEngineOf(g.ruleset);
        const coc = IS_COC(engine);
        const vitals = protagonistVitals(engine);
        const names = present(state);
        const { own, combat } = mergedCheckInput(g.type);
        const combatOnNow = Boolean(combatPrompt && combat && combat.enabled);
        const sheetNames = names.filter((n) => catalog.sheets[n]);
        // 战斗侧给出的角色里，主角与带角色卡的人物已由数值侧列出，去掉避免重复。
        const skip = new Set([userName() || PROTAGONIST, PROTAGONIST, ...sheetNames]);
        const fromCombat = combat && combat.check ? { ...combat.check, actors: (combat.check.actors || []).filter((a) => a && !skip.has(a.name) && !isHero(a.name)) } : null;
        const dice = coc ? null : mergeCheckInputs(own, fromCombat);
        const prompt = buildStatsPrompt(state, {
            walletExtra: combatPoints(), currency: currencySnapshot(), present: names, shortfall: flags.shortfall, dateRegex: s.dateRegex, mandates: mandatesFromFlags(flags, state.protagonist.bars, { fame: catalog.fameBars.length > 0 }), vitals, fameBars: catalog.fameBars, statusCat: { statuses: catalog.statuses },
            worlds: worldsNow(), nsfw: isNsfw(), intimacyGate: s.intimacyGate, intimateCost: s.intimateCost, forcedNames: catalog.intimacyForced, prompts: s.prompts, check: g.check || g.display || null, stageText: s.stageText, stageTextPlatonic: s.stageTextPlatonic, traits: catalog.traits, romanceSeen: catalog.romanceSeen,
            heroNotes: s.heroNotePrompt && !s.heroFeelings ? catalog.heroNotes : null, heroFeelings: s.heroFeelings === true,
            disabled: Object.entries(s.segments || {}).filter(([, on]) => on === false).map(([id]) => id),
            perceptionLine: perceptionLineOf(engine, heroView(state, engine)),
            manualRoll: Boolean(g.manual), dice, cocDice: coc ? own : null,
            combatOn: combatOnNow, partyLines: combatOnNow && combat.party ? combatPartyLines(combat.party) : [], combatRule: combatOnNow ? combat.rule || null : null,
        });
        prompt.diagnostics.forEach((d) => diag(d.code, d));
        if (prompt.content && typeof c.setExtensionPrompt === 'function') {
            try { c.setExtensionPrompt(STATS_PROMPT_KEY, prompt.content, IN_CHAT, 0, false, 0); } catch (error) { diag('stats-inject-failed'); }
        }
    }

    // 已定检定（选项、输入、手动掷骰）原样沿用；来自 roll 标签的检定按标签与骰面重算（编辑正文后标签可能变）。
    const givenCheck = (meta) => (meta && meta.check && meta.check.source !== 'roll' ? meta.check : null);

    function playCheck(check, messageId) {
        if (!check || !settings().checkFx) return;
        const name = userName();
        const detail = check.left ? contestFxDetail(check, name) : checkFxDetail(check, name);
        try { onCheck({ detail, check, messageId }); } catch (error) { /* 演出出错不影响结算 */ }
    }

    // 日常挑战战报与卡牌战斗战报都是用户楼：由紧随其后的 AI 楼结算，回退或重新生成该楼时一并撤销。
    // 卡牌战报只合成战斗事件与伤势（经验、战利品、生命已由战斗账本结算），不受 noBattle 影响。
    function challengeDirectivesBefore(list, messageId) {
        const found = [];
        for (let index = messageId - 1; index >= 0 && list[index] && list[index].is_user; index -= 1) {
            const text = String(list[index].mes ?? '');
            const directive = challengeDirectiveOf(parseChallengeReport(text), index) || battleDirectiveOf(parseBattleReport(text), { isHero, floor: index });
            if (directive) found.unshift(directive);
        }
        return found;
    }

    // ---- 特质接线 ----
    // 本楼之前几楼 AI 正文（由近到远），本楼没写场景标签时沿用最近的地点与天气。
    const previousBodies = (c, messageId) => messages(c).slice(0, messageId).reverse().filter((m) => m && !m.is_user && !m.is_system).slice(0, 6).map((m) => String(m.mes ?? ''));
    // 副模型复核识别的事件：下一次新结算的楼消费一次（写进该楼 meta，重算同一楼沿用）。
    let pendingEvents = { bond: [], review: [] };
    const takeBondEvents = () => { const out = pendingEvents.bond; pendingEvents = { ...pendingEvents, bond: [] }; return out; };
    const takeReviewEvents = () => { const out = pendingEvents.review; pendingEvents = { ...pendingEvents, review: [] }; return out; };
    let reviewTouched = new Set();
    const TRAIT_IDS = TRAIT_DEFS.map((d) => d.id);
    let reviewing = false;
    // 检定的特质与恩仇奖惩骰（只对主角发起的检定；rev ≥ 2 的楼才用）。
    function traitEdgeFor(state, { skill, toward = null, engine = null, viewed = false } = {}) {
        const eng = engine || memoEngineOf();
        const cat = traitCatalogOf(catalog.traits, isNsfw());
        const view = viewed ? state : heroView(state, eng);
        return traitEdgeOf(state, cat, { actor: PROTAGONIST, skill, toward, social: isSocialSkill(eng, skill), skillValue: Number(profileOf(eng, view, PROTAGONIST, skill).value) || 0, present: present(state), heroSide: settings().heroFeelings === true, skillOf: (name) => { const p = profileOf(eng, view, name, skill); return p && p.kind === 'skill' && p.learned && !p.provisional ? Number(p.value) || 0 : 0; } });
    }
    // 主角检定带特质：万事通技能下限、贵人相助失败重掷；favorFrom 随结果一并带上。
    function resolveHeroCheck(engine, state, request) {
        const te = traitEdgeFor(state, { skill: request.skill, toward: request.toward || request.against || null, engine });
        const req = { ...request, edge: te.edge, floor: te.floor };
        const view = heroView(state, engine);
        const check = luckyReroll(state, traitCatalogOf(catalog.traits, isNsfw()), resolveCheck(engine, view, req, cryptoRandom), () => resolveCheck(engine, view, req, cryptoRandom));
        return { ...check, ...(te.favorFrom ? { favorFrom: te.favorFrom } : {}) };
    }
    const applyCatalog = (next) => { catalog = sanitizeCatalog({ ...next, intimacyForced: [] }); };
    function announceTraits(notices, texts = []) {
        const lines = [...notices.map(traitNoticeText), ...texts];
        lines.forEach((text, i) => setNotice(`trait:${Date.now()}:${i}`, { kind: 'info', text, ttl: true }));
    }
    // 合成刷新：所有挂了特质的角色各算一次。
    function refreshAllCombos(state, prevCatalog, prevState) {
        const texts = [];
        for (const name of Object.keys(catalog.traits || {})) {
            const r = refreshCombos(catalog, state, name, { catalog: prevCatalog, state: prevState });
            if (r.catalog !== catalog) applyCatalog(r.catalog);
            texts.push(...comboNotices(r.notices));
        }
        return texts;
    }
    function lightGlobalCodex(state) {
        if (generationStage) { generationStage.codex = true; return; }
        if (!traitCodexStore) return;
        try {
            const next = lightCodex(traitCodexStore.get(), catalog, state, { cardName: cardOf(ctx()), nsfwOn: isNsfw() });
            if (next) traitCodexStore.set(next);
        } catch (error) { diag('stats-trait-codex-failed'); }
    }
    // 每楼结算后的特质收尾：初体验摘下、成就计数与授予、合成刷新、图鉴点亮、复核触发。只对新结算的 rev ≥ 2 楼。
    function traitPass(entry, messageId, body) {
        const meta = entry.meta || {};
        if (!(Number(meta.strengthRev) >= 2)) return;
        const state = entry.after;
        const prevCatalog = catalog;
        const notices = [];
        for (const drop of (meta.flags && meta.flags.traitDrops) || []) {
            const r = applyTraitChange(state, catalog, drop.name, drop.id, false, 'story');
            if (r.notices.length) { applyCatalog(r.catalog); notices.push(...r.notices); }
        }
        // 进化：原地替换特质，来源沿用原条目。
        const evolved = Array.isArray(meta.evolve) ? evolveCandidates(state, catalog.traits).filter((c) => meta.evolve.some((m) => m.name === c.name && m.from === c.from)) : [];
        if (evolved.length) {
            applyCatalog({ ...catalog, traits: applyEvolutions(catalog.traits, evolved) });
            announceTraits([], evolved.map(evolveText));
        }
        const ach = achievementPass(catalog, state, entry, catalog.romanceSeen);
        if (ach.catalog !== catalog) applyCatalog(ach.catalog);
        notices.push(...ach.notices);
        const texts = refreshAllCombos(state, prevCatalog, entry.before);
        if (JSON.stringify(catalog.traits) !== JSON.stringify(prevCatalog.traits) || JSON.stringify(catalog.counters) !== JSON.stringify(prevCatalog.counters)) {
            announceTraits(notices, texts);
            lightGlobalCodex(state);
            persist();
            push();
        }
        scheduleTraitReview(messageId, body);
    }
    function scheduleTraitReview(messageId, body) {
        const s = settings();
        const directives = parseStatDirectives(body, { rev: 2 }).directives;
        for (const d of directives) reviewTouched.add(d.target || PROTAGONIST);
        if (!heroBasicReady() || reviewing || generating || !requester()) return;
        if (pendingInitial().length) { runInitialTraits(); return; }
        const last = Number(catalog.counters.reviewFloor) || 0;
        const scan = scanFloorForReview(directives, messageId, last, s.traitReviewN, { recentChars: [...reviewTouched], text: stripStatDirectives(body), protagonist: PROTAGONIST });
        if (!scan.send) return;
        reviewTouched = new Set();
        applyCatalog({ ...catalog, counters: { ...catalog.counters, reviewFloor: messageId } });
        persist();
        runTraitReview(scan.chars, messageId);
    }
    // 评定诊断：每个角色送去的人设字数、对不上的特质名、标签与依据、被跳过的结果。
    const personaReport = new Map();
    const logReviewParse = (dropped, tags) => {
        if (dropped.length) diag('stats-trait-review-dropped', { words: dropped.map((d) => `${d.charName}:${d.word}`) });
        for (const [name, t] of Object.entries(tags)) if (t.tags.length) diag('stats-trait-review-tags', { name, tags: t.tags, basis: t.basis });
    };
    const logReviewSkipped = (skipped) => {
        const kept = (skipped || []).filter((s) => s.why !== 'no-change');
        if (kept.length) diag('stats-trait-review-skipped', { items: kept.map((s) => `${s.charName}:${s.id}:${s.why}`) });
    };
    // 初始特质：主角与已建档角色各评一次（每人最多 3 项，src=auto），按 SHEET_BATCH_MAX 人一批依次发给备用模型。
    // 失败保留待评名单，仅手动操作可重试。
    // manual：设置页「补全角色特质」，已评过但仍没有任何特质的角色也再评一次。
    const pendingInitial = (manual = false) => {
        if (!ledger) return [];
        const done = new Set(catalog.traitInit || []);
        const npcs = [...new Set([...Object.keys(currentStatsState(ledger).characters || {}), ...Object.keys(catalog.sheets || {})])].filter((n) => n !== PROTAGONIST && !isHero(n));
        const bare = (n) => !listTraits(catalog, n).some((t) => t.src !== 'achieve');
        return [PROTAGONIST, ...npcs].filter((n) => !done.has(n) || (manual && bare(n)));
    };
    function runInitialTraits({ manual = false } = {}) {
        const pending = generationTasks.get('initial-traits');
        if (pending) return pending.promise;
        const recovery = manual ? pendingGenerationSave() : null;
        if (recovery) return recovery;
        if (!active() || !ledger) return Promise.resolve({ ok: false, reason: ledger ? 'stats-inactive' : 'stats-no-ledger' });
        const failureKey = generationFailureKey('initial-traits');
        if (!manual && generationFailures.has(failureKey)) return Promise.resolve({ ok: false, reason: 'stats-trait-retry-required' });
        if (manual && generating) return Promise.resolve({ ok: false, reason: 'stats-generating' });
        if (reviewing) return Promise.resolve({ ok: false, reason: 'stats-trait-busy' });
        const request = requester();
        if (!request) return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        const filled = [];
        return generationTasks.start('initial-traits', async job => {
            reviewing = job;
            try {
            let total = 0;
            const names = pendingInitial(manual);
            if (!names.length) return { ok: true, applied: 0, filled, asked: 0 };
            for (let i = 0; i < names.length; i += SHEET_BATCH_MAX) {
                job.check();
                job.revision = JSON.stringify(catalog);
                const batch = names.slice(i, i + SHEET_BATCH_MAX);
                let people;
                try { people = await describeWithHero(batch); } catch (error) { people = batch.map((name) => ({ name, summary: '' })); }
                checkGeneration(job);
                const persona = new Map((Array.isArray(people) ? people : []).filter(Boolean).map((p) => [p.name, String(p.summary || '')]));
                for (const p of Array.isArray(people) ? people : []) {
                    if (!p) continue;
                    personaReport.set(p.name, { len: String((p.own ?? p.summary) || '').length, world: String(p.world || '').length, from: p.from || '' });
                    if (Array.isArray(p.errors) && p.errors.length) diag('stats-trait-persona-read-failed', { name: p.name, reasons: p.errors });
                }
                // 角色自己的资料逐人发送；世界观资料整批只发一份，按行去重（各人扫到的常驻条目相同）。
                const ownOf = new Map((Array.isArray(people) ? people : []).filter(Boolean).map((p) => [p.name, String((p.own ?? p.summary) || '')]));
                const seenLines = new Set();
                const world = (Array.isArray(people) ? people : []).filter(Boolean).flatMap((p) => String(p.world || '').split('\n'))
                    .map((line) => line.trim()).filter((line) => line && !seenLines.has(line) && seenLines.add(line)).join('\n');
                const c = ctx();
                const state = currentStatsState(ledger);
                const nsfw = isNsfw();
                const defs = TRAIT_DEFS.filter((d) => d.candidate !== false && (nsfw || !d.nsfw) && subInWorlds(d.sub, worldsNow()));
                const floors = messages(c).filter((m) => m && !m.is_system).slice(-6)
                    .map((m) => ({ role: m.is_user ? 'user' : 'ai', text: stripStatDirectives(String(m.mes ?? '')) }));
                let client = null;
                try { client = getPushClient(); } catch (error) { client = null; }
                let aliases = {};
                try { aliases = characterAliases() || {}; } catch (error) { aliases = {}; }
                const chars = batch.map((n) => ({
                    name: n, aliases: aliases[n] || [], protagonist: n === PROTAGONIST, persona: ownOf.get(n) || '', note: catalog.traitNotes[n] || '',
                    relation: state.characters[n] ? stageLabel(Number(state.characters[n].dims.好感) || 0, isRomance(state.characters[n], n, catalog.romanceSeen)) : '',
                    traits: listTraits(catalog, n).filter((t) => !t.id.startsWith('combo:')).map((t) => ({ id: t.id, src: t.src })),
                    attrs: gateAttrsOf(n),
                }));
                const payload = buildReviewPayload({ floors, tables: client ? () => client.readTables() : null, chars, catalog, defs, N: settings().traitReviewN, nsfw, world });
                const prompt = { system: '你是角色设定评定助手，只依据人设与正文作答，只输出指定的 JSON。', user: buildReviewPrompt(payload, defs, 'initial', [], null, WORLD_GENRES) };
                let text;
                try {
                    const reply = await ask(request, prompt, BACKGROUND_TIMEOUT_MS, job);
                    text = reply && typeof reply === 'object' ? reply.text : reply;
                } catch (error) {
                    job.check();
                    if (error?.stage) throw error;
                    diag('stats-trait-initial-failed');
                    generationFailures.add(failureKey);
                    return { ok: false, reason: 'stats-trait-initial-failed', applied: total, filled };
                }
                checkGeneration(job);
                const dropped = [];
                const tags = {};
                const results = parseReviewReply(text, defs, { chars: batch, dropped, tags }).filter((r) => r.on);
                logReviewParse(dropped, tags);
                const saved = await stageGeneration(job, () => {
                    const now = currentStatsState(ledger);
                    const prevCatalog = catalog;
                    storeWorlds(parseReviewWorlds(text, WORLD_GENRES));
                    const applied = applyReview(results, catalog, applyTraitChange, { state: now, mode: 'initial' });
                    logReviewSkipped(applied.skipped);
                    const judged = judgedNames(batch, persona, results);
                    applyCatalog({ ...applied.catalog, traitInit: [...new Set([...(catalog.traitInit || []), ...judged])] });
                    if (applied.applied.length) {
                        const texts = refreshAllCombos(now, prevCatalog, now);
                        announceTraits(applied.notices, texts);
                        lightGlobalCodex(now);
                    }
                    push();
                    return { result: { ok: true, applied: applied.applied.length,
                        filled: [...new Set(applied.applied.map(r => r.charName))] } };
                });
                job.check();
                if (!saved?.ok) return saved;
                total += saved.applied || 0;
                for (const name of saved.filled || []) if (!filled.includes(name)) filled.push(name);
            }
            generationFailures.delete(failureKey);
            return { ok: true, applied: total, filled, asked: names.length };
            } finally { if (reviewing === job) reviewing = false; }
        });
    }
    // 复核：6 楼正文 + 纪要表 + 恋爱日记表 + 当前特质 → 副模型（现有后台请求通道）→ 解析 → applyTraitChange，并记下识别出的事件。
    // 人多时按 SHEET_BATCH_MAX 人一批依次发送，避免一次请求过长被截断或超时。
    function runTraitReview(names, messageId) {
        const all = [...new Set(names)];
        return generationTasks.start('trait-review', async job => {
            let applied = 0;
            let events = 0;
            let ok = false;
            reviewing = job;
            try {
            for (let i = 0; i < all.length; i += SHEET_BATCH_MAX) {
                job.check();
                const r = await runTraitReviewBatch(all.slice(i, i + SHEET_BATCH_MAX), messageId, job);
                job.check();
                if (!r?.ok) return r;
                ok = true; applied += r.applied || 0;
                events += r.events || 0;
            }
            return { ok, applied, events };
            } finally { if (reviewing === job) reviewing = false; }
        });
    }
    function runTraitReviewBatch(names, messageId, job) {
        const request = requester();
        if (!request || !ledger) return Promise.resolve({ ok: false });
        const c = ctx();
        job.revision = JSON.stringify(catalog);
        const state = currentStatsState(ledger);
        const nsfw = isNsfw();
        const defs = TRAIT_DEFS.filter((d) => d.candidate !== false && (nsfw || !d.nsfw) && subInWorlds(d.sub, worldsNow()));
        const floors = messages(c).slice(0, messageId + 1).filter((m) => m && !m.is_system).slice(-6)
            .map((m) => ({ role: m.is_user ? 'user' : 'ai', text: stripStatDirectives(String(m.mes ?? '')) }));
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        let aliases = {};
        try { aliases = characterAliases() || {}; } catch (error) { aliases = {}; }
        const chars = [...new Set(names)].filter((n) => n === PROTAGONIST || state.characters[n]).map((n) => {
            const own = state.characters[n];
            return {
                name: n, aliases: aliases[n] || [], protagonist: n === PROTAGONIST,
                relation: own ? stageLabel(Number(own.dims.好感) || 0, isRomance(own, n, catalog.romanceSeen)) : '',
                traits: listTraits(catalog, n).filter((t) => !t.id.startsWith('combo:')).map((t) => ({ id: t.id, src: t.src })),
                attrs: gateAttrsOf(n),
                note: catalog.traitNotes[n] || '',
                recent: reviewMemoryOf(catalog.counters, [], [n], TRAIT_IDS, state.clock.day).recent[n] || [],
            };
        });
        if (!chars.length) return Promise.resolve({ ok: false });
        const payload = buildReviewPayload({ floors, tables: client ? () => client.readTables() : null, chars, catalog, defs, N: settings().traitReviewN, nsfw });
        const prompt = { system: '你是剧情评定助手，只依据正文与资料作答，只输出指定的 JSON。', user: buildReviewPrompt(payload, defs, 'story', TRAIT_REVIEW_PROMPT_EVENTS, STATUS_DEFS.filter((d) => subInWorlds(d.sub, worldsNow())), WORLD_GENRES) };
        return ask(request, prompt, BACKGROUND_TIMEOUT_MS, job).then((reply) => {
            checkGeneration(job);
            const text = reply && typeof reply === 'object' ? reply.text : reply;
            const only = chars.map((x) => x.name);
            const dropped = [];
            const tags = {};
            const results = parseReviewReply(text, defs, { chars: only, dropped, tags });
            logReviewParse(dropped, tags);
            const events = parseReviewEvents(text, { bondTypes: BOND_EVENT_TYPES, chars: only });
            return stageGeneration(job, () => {
                storeWorlds(parseReviewWorlds(text, WORLD_GENRES));
                const now = currentStatsState(ledger);
                const prevCatalog = catalog;
                const memory = reviewMemoryOf(catalog.counters, results, [...new Set(results.map(r => r.charName))], TRAIT_IDS, now.clock.day);
                const applied = applyReview(results, catalog, applyTraitChange, { state: now, mode: 'story', day: now.clock.day, changeLog: memory.changeLog, recent: memory.recent });
                logReviewSkipped(applied.skipped);
                if (applied.applied.length) {
                    applyCatalog({ ...applied.catalog, counters: reviewMemoryWrite(applied.catalog.counters, applied.applied, TRAIT_IDS, now.clock.day) });
                }
                const statusRes = applyReviewStatuses(parseReviewStatuses(text, STATUS_DEFS, { chars: only }), { statuses: catalog.statuses }, applyStatusChange, { day: now.clock.day });
                if (statusRes.applied.length) catalog = sanitizeCatalog({ ...catalog, statuses: statusRes.catalog.statuses });
                if (applied.applied.length) {
                    announceTraits(applied.notices, refreshAllCombos(now, prevCatalog, now));
                    lightGlobalCodex(now);
                }
                if (statusRes.applied.length || applied.applied.length) push();
                generationStage.events = events;
                return { result: { ok: true, applied: applied.applied.length, events: events.bond.length + events.review.length } };
            });
        }).catch(error => {
            job.check();
            if (error?.stage) throw error;
            diag('stats-trait-review-failed');
            return { ok: false, reason: error?.reason || 'stats-trait-review-failed' };
        });
    }

    function settleAt(messageId, options = {}) {
        if (!inventoryOf()) return settleAtNow(messageId, options);
        const alive = currencyLease(messageId);
        return queueCurrency(async () => {
            if (!alive()) return { ok: false, reason: 'request-stale' };
            const recovered = await recoverCurrencyWrites(alive, messageId);
            if (!recovered.ok) return recovered;
            const result = settleAtNow(messageId, { ...options, alive });
            if (result?.saved) await result.saved;
            if (result?.currencySaved) await result.currencySaved;
            return result;
        });
    }

    function settleAtNow(messageId, { redo = false, plan = null, alive = currencyLease(messageId) } = {}) {
        const c = ctx();
        const m = messages(c)[messageId];
        if (!m || m.is_user || m.is_system) return null;
        const floor = { messageId, swipeId: Number(m.swipe_id) || 0 };
        const s = settings();
        if (worldRoles) worldRoles.sync(chatIdOf(c));
        const autoTable = !resolveCharacter && s.register !== 'manual';
        const resolve = resolveCharacter || defaultResolver(c, s.register, worldRoles, autoTable ? tableNameSet() : null, isHero);
        const prior = ledger.entries.get(ledgerKey(ledger, messageId, floor.swipeId));
        const priorMeta = (prior && prior.meta) || {};
        const p = plan || { check: givenCheck(priorMeta), preroll: priorMeta.preroll || null, note: priorMeta.note || null, ruleset: (priorMeta.check && priorMeta.check.ruleset) || (priorMeta.preroll && priorMeta.preroll.ruleset) };
        const check = p.check !== undefined ? p.check : givenCheck(priorMeta);
        const ruleset = p.ruleset || (check && check.ruleset) || s.ruleset;
        const engine = memoEngineOf(ruleset);
        const chatId = chatIdOf(c);
        const body = String(m.mes ?? '');
        // 重算同一楼沿用当时结算的好感档，改档只影响之后的楼；旧楼没有 favorTier 时按旧 favorMode 还原（缺省旧普通，'hard' 旧困难）。
        const favorTier = prior ? (FAVOR_TIERS.includes(priorMeta.favorTier) ? priorMeta.favorTier : null) : normalizeFavorTier(s.favorMode);
        // 好感强度规则版本：新楼写 1；重算同一楼沿用 meta.strengthRev，没有则按旧规则（改档或升级只影响之后的楼）。
        // rev 2：悟性、顿悟、交心、误会解除、离体、随身与无实体、恋爱判定、十年跳跃上限等；新楼写 2，重算沿用 meta 值（旧楼 0、1 不变）。
        const strengthRev = prior ? (Number(priorMeta.strengthRev) >= 3 ? 3 : Number(priorMeta.strengthRev) >= 2 ? 2 : Number(priorMeta.strengthRev) >= 1 ? 1 : 0) : 3;
        const favorMode = prior && !favorTier ? (priorMeta.favorMode === 'hard' ? 'hard' : 'normal') : undefined;
        // 亲密体力：重算旧楼按当时写进 meta 的档位，旧楼没有该字段就不结算；新楼（含新 swipe）取当前设置。
        const intimateCost = prior ? priorMeta.intimateCost : s.intimateCost;
        const heroSide = prior ? priorMeta.heroSide === true : s.heroFeelings === true;
        // 手改关系挂在楼上：重算、重 roll 同一楼都沿用，否则一重 roll 就丢。
        const manual = priorMeta.manual || manualOfFloor(messageId);
        // 同一楼同一 swipe 的结算种子与骰序都由「聊天 + 楼序号 + swipe」决定（确定性）。
        const ordinal = floorCheckOrdinal(messages(c), messageId);
        const seed = settleSeed(chatId, ordinal, floor.swipeId);
        const rollPairs = ordinal ? rollsFor(IS_COC(engine), chatId, ordinal, floor.swipeId) : null;
        // 重算先排除本楼旧增量；写入意图始终锚定物品表实余额，不从截断后的模拟余额反推。
        const priorCurrency = Math.trunc(Number(priorMeta.currency && priorMeta.currency.delta) || 0);
        const money = currencyContext();
        const available = { ...money, balance: Math.max(0, money.balance - priorCurrency) };
        let currencyFailure = '';
        const settle = (before0, random) => {
            // 旧档修复：起始关系·恋人漏记的恋爱对象、开局猜忌 / 心结没有关系状态、吃醋记录，按账本里的变动记录补上。
            const before = repairLegacyStart(before0, legacyStartInfo());
            let storyChecks = [];
            let npcChecks = [];
            if (s.storyCheck === 'preroll' && /\[igs-check:/.test(body)) {
                const back = replayFloor(messageId, body, before, engine);
                if (back.ok) { storyChecks = storyChecksOf(back.results, engine, before); npcChecks = npcChecksOf(back.results, engine); }
                else diag('stats-check-replay-unavailable', { messageId, reason: back.reason });
            }
            const r = settleFloorText(before, body, {
                env: traitEnvOf(body, previousBodies(c, messageId)), bondEvents: priorMeta.bondEvents || takeBondEvents(), reviewEvents: priorMeta.reviewEvents || takeReviewEvents(),
                traitEdge: strengthRev >= 2 ? (st, req) => traitEdgeFor(st, { ...req, engine, viewed: true }) : null,
                check, preroll: p.preroll || null, rollPairs, storyChecks, npcChecks, favorTier, favorMode, strengthRev, aptitudeOf: (name) => aptitudeLevel(catalog, name), traits: catalog.traits, romanceSeen: catalog.romanceSeen, moodGroups: moodGroups(), intimateCost, dateRegex: s.dateRegex, timeRegex: s.timeRegex, manual, catalog, settings: s, floor: messageId, noBattle: combatOn(), currency: available, extraDirectives: challengeDirectivesBefore(messages(c), messageId), present: present(before),
                random, nsfw: isNsfw(), resolveCharacter: (name) => resolve(canonName(name), before), engine,
                expenses: catalog.expenses, heroSide,
                seedCharacters: autoTable ? tableSeedOf(before, messageId) : null, fameBars: catalog.fameBars,
            });
            const meta = { ...r.meta };
            let changes = r.changes;
            if (p.preroll) meta.preroll = p.preroll;
            const note = { ...(p.note || {}) };
            if (meta.check && !check) note.source = 'roll';
            if (!meta.check && !storyChecks.length && (p.preroll || note.source === 'preroll')) note.reason = r.meta.rollTag ? 'roll-unresolved' : 'stats-roll-skipped';
            if (Object.keys(note).length) meta.note = note;
            if (money.ready && meta.currency) {
                const delta = meta.currency.delta - priorCurrency;
                const after = money.balance + delta;
                if (!Number.isSafeInteger(after) || after < 0) {
                    currencyFailure = after < 0 ? 'stats-currency-resettle-insufficient' : 'stats-currency-balance-invalid';
                    if (priorMeta.currency) meta.currency = priorMeta.currency;
                    else delete meta.currency;
                    changes = [...changes.filter((row) => row.key !== 'money'), ...(prior?.changes || []).filter((row) => row.key === 'money')];
                    meta.diagnostics = [...(meta.diagnostics || []), { code: currencyFailure }];
                } else {
                    meta.currency = { ...meta.currency, write: { before: money.balance, after }, applied: delta === 0 };
                }
            } else if (priorMeta.currency) {
                meta.currency = priorMeta.currency;
            }
            return { ...r, changes, meta };
        };
        const r = redo ? resettleFloor(ledger, floor, settle) : settleFloor(ledger, floor, settle, seed === null ? undefined : seed);
        if (r.reused) return r;
        const meta = r.entry.meta || {};
        if (currencyFailure) currencyFailed(currency, currencyFailure);
        if (meta.note && meta.note.reason === 'stats-roll-skipped') diag('stats-roll-skipped', { messageId });
        // 状态（B 批）：本楼标签与日推进改动经 meta.statuses 带回，写回聊天级目录。
        if ((meta.statuses && typeof meta.statuses === 'object') || (meta.cycles && typeof meta.cycles === 'object')) catalog = sanitizeCatalog({ ...catalog, ...(meta.statuses && typeof meta.statuses === 'object' ? { statuses: meta.statuses } : {}), ...(meta.cycles && typeof meta.cycles === 'object' ? { cycles: meta.cycles } : {}) });
        // E1：成瘾最近接触日（counters 里 瘾:角色名 → 游戏日）。
        if (meta.touch && typeof meta.touch === 'object') catalog = sanitizeCatalog({ ...catalog, counters: { ...catalog.counters, ...meta.touch } });
        // 已知雷点：先撤掉首次记在本楼的（重新生成、编辑后本楼可能不再踩雷），再记本楼新踩的。
        const prevKnown = catalog.landmineKnown || {};
        const stale = Object.values(prevKnown).some((own) => Object.values(own).some((at) => Number(at) === Number(messageId)));
        const mines = Array.isArray(meta.landmines) ? meta.landmines : [];
        if (stale || mines.length) {
            const known = {};
            for (const [name, own] of Object.entries(prevKnown)) {
                const kept = Object.fromEntries(Object.entries(own).filter(([, at]) => Number(at) !== Number(messageId)));
                if (Object.keys(kept).length) known[name] = kept;
            }
            for (const { name, key } of mines) if (!(known[name] && Object.hasOwn(known[name], key))) known[name] = { ...(known[name] || {}), [key]: messageId };
            catalog = sanitizeCatalog({ ...catalog, landmineKnown: known });
        }
        // 已知软肋：写法同已知雷点。
        const prevSoft = catalog.softKnown || {};
        const softStale = Object.values(prevSoft).some((own) => Object.values(own).some((at) => Number(at) === Number(messageId)));
        const softs = Array.isArray(meta.softspots) ? meta.softspots : [];
        if (softStale || softs.length) {
            const known = {};
            for (const [name, own] of Object.entries(prevSoft)) {
                const kept = Object.fromEntries(Object.entries(own).filter(([, at]) => Number(at) !== Number(messageId)));
                if (Object.keys(kept).length) known[name] = kept;
            }
            for (const { name, key } of softs) if (!(known[name] && Object.hasOwn(known[name], key))) known[name] = { ...(known[name] || {}), [key]: messageId };
            catalog = sanitizeCatalog({ ...catalog, softKnown: known });
        }
        for (const entry of meta.newSkills || []) commitSkill(entry.name, { attribute: entry.attribute, floor: messageId });
        // 楼层记录接在上一条存活记录之后；重算同一楼时沿用原来的上游。
        const before = activeEntryBefore(ledger, messageId);
        const baseId = prior && Object.hasOwn(prior, 'baseId') ? prior.baseId : before ? before.recordId ?? null : null;
        const record = floorRecord({ messageId, swipeId: floor.swipeId, tagHash: statTagHash(body), baseId, seed: r.entry.seed, before: r.entry.before, after: r.entry.after, changes: r.entry.changes, meta: r.entry.meta, createdAt: Date.now() });
        r.entry.recordId = record.id;
        r.entry.baseId = baseId;
        const saved = persist([record], { shouldStart: alive });
        r.saved = saved;
        if (meta.currency?.write && !meta.currency.applied) r.currencySaved = writeCurrency(r.entry, record, saved, alive);
        onChange(currentStatsState(ledger), r.entry);
        push();
        const hurt = meta.flags && meta.flags.battleHurt;
        // 主角离体的楼不记伤势：生命类标签（hurt、battle）不写进战斗账本；写入只在这里发生，其他刷新都是只读。
        if (!(meta.flags && meta.flags.detached)) refreshLife({ write: true, messageIds: [messageId], battleHurts: new Map(hurt ? [[messageId, hurt]] : []), naturalHeals: (meta.heal || []).map((h) => ({ messageId, name: h.name, amount: h.amount, reason: h.reason })) });
        if (meta.check && meta.check.source === 'roll' && !redo) playCheck(meta.check, messageId);
        if (meta.pendingRoll && s.storyCheck === 'manual') offerManualRoll(r.entry);
        detectNewCharacters();
        scheduleBackfill();
        confirmWorldRoles(meta.diagnostics, messageId);
        if (!redo) traitPass(r.entry, messageId, body);
        return r;
    }

    // 世界书角色登记：本楼被丢弃的陌生名字异步查一次世界书；查到后只补算最新楼，旧楼不回溯。
    function confirmWorldRoles(diagnostics, messageId) {
        if (!worldRoles || resolveCharacter || settings().register === 'manual') return;
        const names = (diagnostics || []).filter((d) => d && d.code === 'stat-unknown-character' && d.name).map((d) => d.name);
        if (!names.length) return;
        const c = ctx();
        const chatId = chatIdOf(c);
        const exclude = [userName(), c && c.name1, PROTAGONIST].filter(Boolean);
        Promise.resolve().then(() => worldRoles.confirm(names, { chatId, exclude })).then((res) => {
            for (const name of res.found) diag('stats-world-role-registered', { name });
            for (const name of res.missing) diag('stats-world-role-missing', { name });
            if (!res.found.length || generating || !active() || chatIdOf(ctx()) !== chatId) return;
            if (messages(ctx()).length - 1 !== messageId) return;
            settleAt(messageId, { redo: true });
        }).catch(() => diag('stats-world-role-failed'));
    }

    // 剧情新技能：进注册表、进补全队列、提示一次（v2 §6.1）。
    function commitSkill(name, { attribute, floor, exact = false } = {}) {
        const r = registerStorySkill(catalog, name, { attribute, floor, exact });
        if (!r.created) return r.name;
        catalog = { ...r.catalog, queue: { ...catalog.queue, skills: [...new Set([...catalog.queue.skills, r.name])] } };
        setNotice(`skill:${r.name}`, { kind: 'info', text: `新技能：${r.name}（${r.entry.attribute}）`, ttl: true });
        return r.name;
    }

    // 随身系统里 IGS 没有的属性名（如「神识」）收进 IGS 技能，每个名字只收一次；收不进的（非法名、数量上限）记下，不再重试。
    // 只在检定、注入、推送、采纳这些入口前调用，不放在读数函数里（登记会改目录）。加成本身不写进 IGS，仍由 readBonus 叠加。
    const originMissed = new Set();
    // 上次写表成功时写进去的主角技能生效值 { 技能: 值 }。表里某行仍等于它、而 IGS 当前值已变（如关闭随身系统后加成没了），
    // 说明是还没刷新的旧值，不是用户手改：跳过采纳，等下次写表刷新，免得把旧加成固化成底数。
    let pushedHeroSkills = {};
    function collectOriginSkills() {
        if (!ledger || !active()) return false;
        let list = null;
        try { list = originStats(); } catch (error) { list = null; }
        if (!Array.isArray(list) || !list.length) return false;
        const engine = engineOf();
        let added = false;
        for (const item of list) {
            const name = String((item && item.name) ?? '').trim();
            if (!name || originMissed.has(name) || heroBonusKey(engine, name)) continue;
            const got = commitSkill(name);
            if (got) added = true; else originMissed.add(name);
        }
        if (added) persist();
        return added;
    }

    function onStarted(type, params, dryRun) {
        // 上次读取失败（不含导入中）时，新一轮生成前再试一次。
        if (!ledger && blocked && blocked !== 'stats-importing' && dryRun !== true) { load(); autoEnable(); }
        if (dryRun === true || SKIP_TYPES.has(type) || background() || !active()) return;
        const c = ctx();
        if (!c) return;
        const g = { type: String(type || 'normal'), ruleset: settings().ruleset };
        generating = g;
        clearPrompt();
        let plan;
        try { plan = planCheck(g.type, c, g.ruleset); } catch (error) { diag('stats-check-failed', { error: String(error && error.message || error) }); plan = {}; }
        Object.assign(g, { check: plan.check || null, preroll: plan.preroll || null, note: plan.note || null, display: plan.display || null, manual: Boolean(plan.manual) });
        if (g.check && g.check.ruleset) g.ruleset = g.check.ruleset;
        if (g.preroll && g.preroll.ruleset) g.ruleset = g.preroll.ruleset;
        inject(g, c);
        if (g.check && g.type !== 'continue' && g.check.source === 'input') playCheck(g.check, null);
        // 生成前把被表格插件改掉的数值补写回真值，最多等 3 秒（易错点 F4/F6）。宿主会等待返回的 Promise。
        return pushOn() ? withTimeout(push()) : undefined;
    }

    // 完整正文只在结束（或停止）时结算一次；注入只对本次生成有效（易错点 A3/A6）。
    function onFinished() {
        if (background()) return;
        const g = generating;
        generating = null;
        clearPrompt();
        if (!g || !active()) {
            if (sheetsDeferredByGenerating && active() && npcPolicy === 'auto') detectNewCharacters();
            return;
        }
        const c = ctx();
        const lastId = messages(c).length - 1;
        if (lastId < 0) {
            if (sheetsDeferredByGenerating && npcPolicy === 'auto') detectNewCharacters();
            return;
        }
        const plan = { check: g.check, preroll: g.preroll, note: g.note, ruleset: g.ruleset };
        const settled = settleAt(lastId, { redo: g.type === 'continue', plan });
        if (sheetsDeferredByGenerating && npcPolicy === 'auto' && (!settled || settled.reused)) detectNewCharacters();
    }

    function onSwiped(messageId) {
        if (!ledger || !chatEnabled) return;
        const id = Number(messageId);
        const m = messages(ctx())[id];
        if (!m) return;
        selectSwipe(ledger, id, Number(m.swipe_id) || 0);
        onChange(currentStatsState(ledger), null);
        push();
        refreshLife();
    }

    function onDeleted() {
        if (!ledger || !chatEnabled) return;
        const c = ctx();
        if (!c || !Array.isArray(c.chat)) return;
        deleteFloorsFrom(ledger, c.chat.length);
        onChange(currentStatsState(ledger), null);
        push();
        refreshLife();
    }

    // 编辑正文：只重算这一楼，从本楼结算前快照出发，不级联（易错点 A5）。
    function onUpdated(messageId) {
        if (generating || !active()) return;
        const id = Number(messageId);
        const m = messages(ctx())[id];
        if (m && ledger.entries.has(ledgerKey(ledger, id, Number(m.swipe_id) || 0))) settleAt(id, { redo: true });
    }

    function onChatChanged() {
        invalidateGenerations();
        invalidateCurrencyJob();
        sheetsDeferredByGenerating = false;
        currencyAsked.delete(chatIdOf(ctx()));
        managedCache = null;
        pushedHeroSkills = {};
        generating = null;
        clearPrompt();
        load();
        autoEnable();
        onChange(ledger ? currentStatsState(ledger) : null, null, { chatChanged: true });
        refreshOnboarding();
        if (active()) refreshLife();
        ensureCurrency();
    }

    function detach() {
        invalidateGenerations();
        invalidateCurrencyJob();
        sheetsDeferredByGenerating = false;
        for (const off of offs) { try { off(); } catch (error) { /* */ } }
        offs = [];
        generating = null;
        clearPrompt();
    }

    function attach() {
        const c = ctx();
        const source = c && c.eventSource;
        const types = (c && (c.eventTypes || c.event_types)) || {};
        if (!source || typeof source.on !== 'function') { diag('stats-no-event-source'); return false; }
        const bind = (name, handler) => {
            if (!name) return;
            const wrapped = inEvent(handler);
            source.on(name, wrapped);
            offs.push(() => (typeof source.removeListener === 'function' ? source.removeListener(name, wrapped) : source.off && source.off(name, wrapped)));
        };
        bind(types.GENERATION_STARTED, onStarted);
        bind(types.GENERATION_ENDED, onFinished);
        bind(types.GENERATION_STOPPED, onFinished);
        bind(types.MESSAGE_SWIPED, onSwiped);
        bind(types.MESSAGE_DELETED, onDeleted);
        bind(types.MESSAGE_UPDATED, onUpdated);
        bind(types.MESSAGE_EDITED, onUpdated);
        bind(types.CHAT_CHANGED, onChatChanged);
        // 数据库插件改表后的回调：表格人物名单作废，开了同步就用 IGS 数值盖回。
        let tableClient = null;
        try { tableClient = getPushClient(); } catch (error) { tableClient = null; }
        if (tableClient && typeof tableClient.registerCallback === 'function') {
            try {
                tableClient.registerCallback(onTableUpdated);
                if (typeof tableClient.registerFillStartCallback === 'function') tableClient.registerFillStartCallback(onTableFillStart);
                offs.push(() => {
                    if (tablePushTimer) { clearTimeout(tablePushTimer); tablePushTimer = null; }
                    closeFillWindow();
                    if (typeof tableClient.unregisterFillStartCallback === 'function') tableClient.unregisterFillStartCallback(onTableFillStart);
                    if (typeof tableClient.unregisterCallback === 'function') tableClient.unregisterCallback(onTableUpdated);
                });
            } catch (error) { diag('stats-table-callback-failed'); }
        }
        return true;
    }

    // 设置变化后调用：总开关开就挂监听并读存档，关就全部解绑（易错点 H1）。战斗开启时总开关强制为开。
    function sync() {
        const on = settings().enabled;
        if (on && !offs.length) { if (attach()) { load(); autoEnable(); refreshOnboarding(); if (active()) refreshLife(); ensureCurrency(); } }
        else if (on && offs.length) { if (combatOn()) autoEnable(); refreshOnboarding(); }
        else if (!on && offs.length) { detach(); notices.clear(); emitNotices(); }
        return { attached: offs.length > 0 };
    }

    // 本聊天启用。数据库里还没有数值表时先建表再重试一次（creating 防重入）。
    function enableForChat({ initial, buildMode: pickedMode, skillAttributes } = {}) {
        ensureLoaded(true);
        if (unavailable) return { ok: false, reason: unavailable };
        if (blocked) return { ok: false, reason: blocked };
        const chatId = chatIdOf(ctx());
        if (!chatId) return { ok: false, reason: 'stats-no-chat' };
        const extra = [];
        if (!ledger) {
            const t = tables();
            const rows = t.ok ? t.read({ kinds: ['stats'] }) : t;
            if (!rows || rows.ok !== true) return { ok: false, reason: (rows && rows.reason) || 'stats-log-read-failed' };
            if (!Array.isArray(rows.stats)) {
                if (creating) return { ok: false, reason: 'stats-log-create-unverified' };
                creating = true;
                return Promise.resolve().then(() => t.ensure()).then((made) => {
                    if (!made || made.ok !== true) { diag('stats-log-create-failed', { reason: made && made.reason }); return { ok: false, reason: (made && made.reason) || 'stats-log-create-failed' }; }
                    load();
                    return enableForChat({ initial, buildMode: pickedMode, skillAttributes });
                }, () => ({ ok: false, reason: 'stats-log-create-failed' })).finally(() => { creating = false; });
            }
            // 直接启用（快速开始、自动启用）不送技能，「我的角色」里提示选擅长技能（3+5）。
            ledger = createStatsLedger(chatId, initial || createStatsState({ skills: [] }));
            extra.push(initRecord(ledger.initial, { createdAt: Date.now() }));
            registerCustomSkills(skillAttributes);
        }
        chatEnabled = true;
        const mode = normalizeBuildMode(pickedMode) || (modePending && modeChat === chatId ? modeDefault : null);
        if (!buildMode && mode) buildMode = mode;
        modePending = false;
        if (declined) { store.setDeclined(false); declined = false; }
        persist(extra);
        onChange(currentStatsState(ledger), null);
        refreshOnboarding();
        onBuildPolicyChange();
        detectNewCharacters();
        ensureCurrency();
        return { ok: true };
    }

    // 自动启用：数值总开关开启后本聊天直接开始启用并初始化主角；历史未启用/旧 declined 不阻断自动启动。
    // 已有账本且显式暂停过的聊天保持暂停；战斗开启时一律确保启用。
    function autoEnable() {
        const s = settings();
        if (!s.enabled || unavailable || blocked || !chatIdOf(ctx())) return;
        if (combatOn()) { if (!ledger || !chatEnabled) Promise.resolve(enableForChat()).catch(() => {}); return; }
        if (ledger) return;
        Promise.resolve(enableForChat()).catch(() => {});
    }

    function refreshHeroInitMode() {
        const offer = needsHeroInitChoice();
        setNotice('hero-init-mode', offer ? {
            kind: 'onboarding',
            order: 0,
            text: '主角六维属性与擅长项尚未设定：自行填写还是自动生成？',
            actions: [['manual', '自行填写'], ['auto', '自动生成']],
        } : null);
    }

    // 主角基础初始化：先询问自行填写或自动生成；确认后再展示技能选择与 NPC 策略/首次询问。
    function refreshOnboarding() {
        const chatId = chatIdOf(ctx()) || null;
        if (chatId !== modeChat) { modeChat = chatId; modeDefault = 'auto'; modePending = false; askedFill.clear(); }
        if (notices.has('onboarding')) setNotice('onboarding', null);
        if (notices.has('build-mode')) setNotice('build-mode', null);
        refreshHeroInitMode();
        refreshHeroPick();
        refreshHeroOffer();
        refreshNpcPolicy();
        refreshNpcAsk();
        refreshBuildAsk();
    }

    function refreshNpcPolicy() {
        const offer = active() && settings().sheetGen !== 'off' && !npcPolicy;
        setNotice('npc-policy', offer ? {
            kind: 'onboarding',
            order: 3,
            text: 'NPC 建档策略：新角色出场时如何处理？',
            actions: [['auto', '自动生成'], ['per-npc', '逐个询问']],
        } : null);
    }

    function pendingNpcAskName() {
        if (!active() || settings().sheetGen === 'off' || npcPolicy !== 'per-npc') return null;
        const state = currentStatsState(ledger);
        for (const rawName of Object.keys(state.characters || {})) {
            const name = canonName(rawName);
            if (!name || isHero(name)) continue;
            if (catalog.sheets[name] || Object.hasOwn(npcChoices, name)) continue;
            return name;
        }
        return null;
    }

    function refreshNpcAsk() {
        const name = pendingNpcAskName();
        setNotice('npc-ask', name ? {
            kind: 'onboarding',
            order: 4,
            name,
            text: `新角色「${name}」：是否现在生成数值档案？`,
            actions: [['generate', '现在生成'], ['defer', '暂不建档']],
        } : null);
    }

    // 主角还没有任何已学（生效值 ≥ 25）的内置技能、也没选过擅长格时，需要选或按人设生成擅长技能。
    // 注意：BUILTIN_SKILLS 包含六维属性（kind: 'attribute'），不能把六维、CoC 未学基础值或未学技能检定记录（< 25）误判为已选技能。
    function hasLearnedHeroSkill() {
        if (!ledger) return false;
        const state = currentStatsState(ledger);
        const engine = dailyEngineOf();
        const own = state.protagonist.skills || {};
        const names = [...new Set([...Object.keys(own), ...Object.keys(catalog.protagonistBase), ...Object.keys(catalog.protagonistEdit)])];
        return names.some((name) => {
            const entry = BUILTIN_SKILLS[name];
            if (!entry || entry.kind !== 'skill') return false;
            return Math.round(Number(heroSkillLevel(engine, own[name], name)) || 0) >= 25;
        });
    }

    function needsHeroPick() {
        if (!ledger || catalog.heroPicked || cocSheetOf(engineOf())) return false;
        if (catalog.heroSlots && Object.values(catalog.heroSlots).some(Boolean)) return false;
        return !hasLearnedHeroSkill();
    }

    function refreshHeroPick() {
        const chatId = chatIdOf(ctx());
        const offer = Boolean(chatId) && active() && !needsHeroInitChoice() && !heroPickAsked.has(chatId) && needsHeroPick();
        const canAssign = Boolean(requester());
        const actions = canAssign ? [['open', '手动选择'], ['assign', '按人设生成'], ['later', '稍后']] : [['open', '去选择'], ['later', '稍后']];
        setNotice('hero-pick', offer ? { kind: 'onboarding', order: 1, text: '主角擅长技能：请选3项擅长、5项比较擅长，或按人设生成', actions } : null);
    }

    // 主角开局手动提交六维与擅长项：超出上限时若未确认开挂（uncapped）返回 stats-build-over-cap；
    // 写入成功后自动补齐简介、初始货币，并唤醒卡片战斗（若开启）生成职业/卡组/初始装备。
    async function submitManualHero({ scores, uncapped = false, skills, attributes: skillAttrs, slots } = {}) {
        if (!active()) return { ok: false, reason: 'stats-chat-not-enabled' };
        const cleanScores = normalizeHeroScores(scores, { uncapped: true });
        if (!cleanScores) return { ok: false, reason: 'stats-hero-init-attributes-invalid' };
        if (uncapped !== true) {
            const total = ABILITY_KEYS.reduce((sum, key) => sum + cleanScores[key], 0);
            const overSingle = ABILITY_KEYS.some((key) => cleanScores[key] < MANUAL_BUILD.min || cleanScores[key] > MANUAL_BUILD.max);
            if (overSingle || total > MANUAL_TOTAL) return { ok: false, reason: 'stats-build-over-cap', total, max: MANUAL_TOTAL };
        }
        const access = attributeAccess ? attributeAccess() : null;
        if (!access) return { ok: false, reason: 'combat-attribute-table-missing' };
        const heroName = userName() || PROTAGONIST;
        const alive = currencyLease();
        const read = await ensureHeroAttributeReadable(access, heroName, alive);
        if (!read.ok) return read;
        const written = read.view.initialized
            ? await access.editHero(heroName, cleanScores, { expectedRevision: read.view.revision, uncapped: uncapped === true, shouldStart: alive })
            : await access.initHero(heroName, cleanScores, { expectedRevision: read.view.revision, uncapped: uncapped === true, shouldStart: alive });
        if (!written?.ok) return written || { ok: false, reason: 'stats-attribute-write-unverified' };
        gateMemo = null;
        if (skills && typeof skills === 'object' && Object.keys(skills).length) {
            const picked = pickHeroSkills(skills, skillAttrs, slots);
            if (!picked?.ok) return picked;
        }
        catalog = sanitizeCatalog({ ...catalog, heroInitChoice: 'manual' });
        setNotice('hero-init-mode', null);
        setNotice('hero-pick', null);
        persist();
        onChange(currentStatsState(ledger), null);
        refreshOnboarding();
        onBuildPolicyChange();
        // 简介与初始货币仍然自动生成（六维已就绪，本次请求只补简介与货币）
        void ensureHeroInit({ force: true, requireBio: true });
        return { ok: true, uncapped: uncapped === true, scores: cleanScores };
    }

    // 建卡里玩家自定义的技能：注册表认不得的名字按所选六维登记成剧情技能；已认得的（内置或已登记）沿用原条目。
    function registerCustomSkills(attributes) {
        for (const [name, attribute] of Object.entries(attributes && typeof attributes === 'object' ? attributes : {})) {
            if (!engineOf().registry.has(name)) commitSkill(name, { attribute, exact: true });
        }
    }

    // 选擅长技能：skills 为 { 技能: 起始值 }（pickSummary 的结果），写进底数层；之后成长、手改照常叠加。attributes 为自定义技能所选六维。
    function pickHeroSkills(skills, attributes, slots) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        registerCustomSkills(attributes);
        const engine = dailyEngineOf();
        // 自定义技能（带所属六维的）只认同名，不按别名落到内置技能上。
        const own = (name) => (attributes && Object.hasOwn(attributes, name) && engine.registry.has(name) ? name : null);
        // 只收注册表里认得的技能（内置或自定义已登记的）；自定义新名先登记成剧情技能。
        const entries = Object.entries(skills || {}).filter(([, v]) => Number(v) > 0)
            .map(([name, v]) => [own(name) || engine.registry.resolve(name) || commitSkill(name), Number(v)]).filter(([name]) => Boolean(name));
        if (!entries.length) return { ok: false, reason: 'stats-hero-pick-empty' };
        const base = { ...catalog.protagonistBase };
        for (const [name, value] of entries) base[name] = withoutHeroBonus(engine, name, value);

        // 每格占的技能随聊天保存：界面给了格位就用，没给（旧调用）按起始值回填。
        const picked = new Set(entries.map(([name]) => name));
        const given = {};
        for (const [slot, raw] of Object.entries(slots && typeof slots === 'object' ? slots : {})) {
            const name = BUILD_PICK_SLOTS.includes(slot) ? engine.registry.resolve(raw) : null;
            if (name && picked.has(name)) given[slot] = name;
        }
        const heroSlots = Object.keys(given).length ? given : backfillHeroSlots(entries);
        catalog = sanitizeCatalog({ ...catalog, protagonistBase: base, heroPicked: true, heroSlots });
        setNotice('hero-pick', null);
        persist();
        onChange(currentStatsState(ledger), null);
        refreshOnboarding();
        return { ok: true };
    }

    // 调查员档存在聊天数值存档里，检定只读它；与日常数值二选一生效（catalog.cocMode），不再同步战斗六维。
    const cocSheet = () => catalog.protagonistCoc || null;
    function commitCocCatalog(patch) {
        catalog = sanitizeCatalog({ ...catalog, ...patch });
        gateMemo = null;
        persist();
        onChange(currentStatsState(ledger), null);
        refreshHeroPick();
        refreshHeroOffer();
    }
    async function applyCocSheet(raw) {
        if (!IS_COC(engineOf())) return { ok: false, reason: 'ruleset' };
        const clean = sanitizeCocSheet(raw);
        if (!clean) return { ok: false, reason: 'invalid' };
        const id = chatIdOf(ctx());
        if (!id || loadedChat !== id) return { ok: false, reason: 'request-stale' };
        commitCocCatalog({ protagonistCoc: clean, cocMode: 'investigator' });
        return { ok: true };
    }
    function clearCocSheet() {
        commitCocCatalog({ protagonistCoc: null, cocMode: 'daily' });
        return Promise.resolve({ ok: true });
    }
    function setCocMode(mode) {
        const next = normalizeCocMode(mode);
        if (!next) return { ok: false, reason: 'invalid' };
        if (!IS_COC(engineOf())) return { ok: false, reason: 'ruleset' };
        if (next === 'investigator' && !catalog.protagonistCoc) return { ok: false, reason: 'no-sheet' };
        if (cocModeOf(catalog) === next) return { ok: true };
        commitCocCatalog({ cocMode: next });
        return { ok: true };
    }
    // 调查员页的当前值：理智与各技能（档内合计并上调查员账本），带成长勾。
    function cocLive() {
        if (!ledger) return null;
        const engine = engineOf();
        const sheet = cocSheetOf(engine);
        if (!sheet) return null;
        const state = investigatorView(currentStatsState(ledger));
        const owned = state.protagonist.skills;
        const skip = new Set([...COC_ATTRS, '幸运', SAN_ATTRIBUTE]);
        const names = [...new Set([...Object.keys(cocSkillTotals(sheet)), ...Object.keys(owned)])].filter((n) => !skip.has(n));
        const skills = names.map((name) => ({ name, value: Number(profileOf(engine, state, PROTAGONIST, name).value) || 0, marked: Boolean(owned[name] && owned[name].marked) }))
            .filter((row) => row.value > 0).sort((x, y) => y.value - x.value);
        const mythos = Number(profileOf(engine, state, PROTAGONIST, '克苏鲁神话').value) || 0;
        return { san: { value: Number(profileOf(engine, state, PROTAGONIST, SAN_ATTRIBUTE).value) || 0, max: Math.max(1, 99 - mythos) }, skills };
    }
    // 论坛安科用：coc7 有档才返回主角该技能的生效值。
    function cocSkillOf(skill) {
        const engine = engineOf();
        if (!cocSheetOf(engine)) return null;
        const v = Number(profileOf(engine, investigatorView(currentStatsState(ledger)), PROTAGONIST, String(skill || '')).value);
        return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
    }

    // ---- NPC 调查员档：调查员模式下 NPC 读它；没有档的 NPC 由引擎按日常数值临时换算 ----
    const npcCocNames = () => (ledger ? Object.keys(currentStatsState(ledger).characters || {}).filter((n) => n !== PROTAGONIST && !isHero(n)) : []);
    function npcCocSnapshot(name) {
        const sheet = catalog.npcCoc && catalog.npcCoc[String(name || '').trim()];
        if (!sheet) return null;
        return { ...structuredClone(sheet), totals: cocSkillTotals(sheet) };
    }
    function applyNpcCoc(name, raw) {
        if (!IS_COC(engineOf())) return { ok: false, reason: 'ruleset' };
        const key = String(name || '').trim();
        const clean = sanitizeCocSheet(raw, { npc: true });
        if (!key || key.length > 20 || !clean || clean.source === 'roll') return { ok: false, reason: 'invalid' };
        const id = chatIdOf(ctx());
        if (!id || loadedChat !== id) return { ok: false, reason: 'request-stale' };
        commitCocCatalog({ npcCoc: { ...catalog.npcCoc, [key]: clean } });
        return { ok: true };
    }
    function clearNpcCoc(name) {
        const key = String(name || '').trim();
        if (!catalog.npcCoc || !catalog.npcCoc[key]) return { ok: true };
        const next = { ...catalog.npcCoc };
        delete next[key];
        commitCocCatalog({ npcCoc: next });
        return { ok: true };
    }
    // 其他角色页用：调查员模式下每个角色的属性、理智与技能（有档读档，没档为临时换算）。
    function npcCocModel() {
        if (!ledger) return null;
        const engine = engineOf();
        if (!cocSheetOf(engine)) return null;
        const state = currentStatsState(ledger);
        const roster = new Set(npcCocNames());
        const rows = [...new Set([...roster, ...Object.keys(catalog.npcCoc || {})])].map((name) => {
            const own = catalog.npcCoc[name] || null;
            const read = (skill) => Math.round(Number(profileOf(engine, state, name, skill).value) || 0);
            const attrs = Object.fromEntries(COC_ATTRS.map((k) => [k, read(k)]));
            const daily = catalog.sheets[name] || null;
            const skillNames = own ? Object.keys(cocSkillTotals(own)) : Object.keys((daily && daily.skills) || {});
            const skills = skillNames.map((skill) => ({ name: skill, value: read(skill) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 12);
            return { name, inRoster: roster.has(name), source: own ? own.source : 'temp', occupation: own ? own.occupation : '', attrs, luck: own ? own.luck : 50, san: read(SAN_ATTRIBUTE), skills };
        });
        return { rows, canGenerate: Boolean(requester()), busy: Boolean(generationTasks.get('npc-coc')) };
    }
    // AI 生成与模组导入共用：分批请求、解析、逐批落库。batch = { names: 名单或 null, prompt: async () => ({ ok, value|reason }) }。
    // sameJob：同一请求（同名单或同文本）并发时复用进行中的任务；内容不同则回 busy，不能把模组文本悄悄并进别的任务。
    let npcCocJobKey = '';
    function runNpcCocJob({ batches, source, label, sameJob = '' }) {
        const pending = generationTasks.get('npc-coc');
        if (pending) return npcCocJobKey === sameJob ? pending.promise : Promise.resolve({ ok: false, reason: 'busy', created: [], skipped: [] });
        const recovery = pendingGenerationSave('npc-coc', () => runNpcCocJob({ batches, source, label, sameJob }));
        if (recovery) return recovery;
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive', created: [], skipped: [] });
        if (!IS_COC(engineOf())) return Promise.resolve({ ok: false, reason: 'ruleset', created: [], skipped: [] });
        const request = requester();
        if (!request) {
            setNotice('npc-coc', { kind: 'sheets', text: '生成调查员档需要可用的辅助模型（自动插图设置里的写词模型）', actions: [['dismiss', '知道了']] });
            return Promise.resolve({ ok: false, reason: 'no-model', created: [], skipped: [] });
        }
        setNotice('npc-coc', { kind: 'busy', text: `正在${label}` });
        npcCocJobKey = sameJob;
        return generationTasks.start('npc-coc', async (job) => {
            const created = [];
            const skipped = [];
            let failure = '';
            const fail = (reason) => {
                failure = reason;
                diag(reason);
                setNotice('npc-coc', { kind: 'sheets', text: `${label}失败（${reason}），可重试`, actions: [['dismiss', '知道了']] });
                return { ok: false, reason, created, skipped };
            };
            job.onFinish(() => {
                if (job.alive() && notices.get('npc-coc')?.kind === 'busy') {
                    const code = failure || 'stats-npc-coc-unfinished';
                    diag(code);
                    setNotice('npc-coc', { kind: 'sheets', text: `${label}未完成（${code}），可重试`, actions: [['dismiss', '知道了']] });
                }
            });
            try {
                await tail;
                job.check();
                for (const batch of batches) {
                    const known = () => JSON.stringify(batch.names ? batch.names.map((n) => catalog.npcCoc[n] || null) : Object.keys(catalog.npcCoc));
                    job.conflictSnapshot = known();
                    job.conflictCheck = () => known() === job.conflictSnapshot;
                    const prompt = await batch.prompt();
                    checkGeneration(job);
                    if (!prompt.ok) return fail(prompt.reason);
                    let parsed;
                    try { parsed = parseNpcCocReply(await ask(request, prompt.value, BACKGROUND_TIMEOUT_MS * 2, job), { names: batch.names, source, at: Date.now() }); }
                    catch (error) { job.check(); if (error?.stage) throw error; parsed = { ok: false, reason: error?.reason || 'stats-npc-coc-request-failed', skipped: [] }; }
                    checkGeneration(job);
                    skipped.push(...(parsed.skipped || []));
                    if (!parsed.ok) return fail(parsed.reason);
                    const saved = await stageGeneration(job, () => {
                        catalog = { ...catalog, npcCoc: { ...catalog.npcCoc, ...parsed.sheets } };
                        return { result: { ok: true } };
                    });
                    if (!saved?.ok) return { ...saved, created, skipped };
                    created.push(...Object.keys(parsed.sheets));
                }
                setNotice('npc-coc', { kind: 'info', text: `已生成调查员档：${created.join('、')}`, ttl: true });
                return { ok: true, created, skipped };
            } catch (error) {
                failure = error?.reason || error?.message || 'stats-npc-coc-threw';
                throw error;
            }
        });
    }
    function generateNpcCoc(names = null) {
        const targets = [...new Set((Array.isArray(names) && names.length ? names : npcCocNames().filter((n) => !catalog.npcCoc[n])).map((n) => String(n || '').trim()).filter(Boolean))];
        if (!targets.length) return Promise.resolve({ ok: true, created: [], skipped: [] });
        const batches = [];
        for (let i = 0; i < targets.length; i += NPC_COC_BATCH_MAX) {
            const group = targets.slice(i, i + NPC_COC_BATCH_MAX);
            batches.push({
                names: group,
                prompt: async () => {
                    let context = { people: group.map((name) => ({ name, summary: '' })), history: '' };
                    if (typeof readSheetContext === 'function') {
                        let resolved;
                        try { resolved = await readSheetContext({ names: group, protagonists: [], protagonistCards: [] }); }
                        catch (error) { resolved = { ok: false, reason: 'stats-sheet-context-failed' }; }
                        if (!resolved || resolved.ok === false) return { ok: false, reason: resolved?.reason || 'stats-sheet-context-failed' };
                        context = { ...context, ...resolved };
                    }
                    return { ok: true, value: buildNpcCocRequest(context.people, { worldview: worldviewOf(), history: context.history, settings: [context.settings, context.worldInfo].filter(Boolean).join('\n\n') }) };
                },
            });
        }
        return runNpcCocJob({ batches, source: 'ai', label: `生成调查员档：${targets.join('、')}`, sameJob: `ai:${targets.join('|')}` });
    }
    // 模组文本提取：回复里的全部人物都收，不要求已在 characters 里。
    function importNpcCocText(text) {
        if (!IS_COC(engineOf())) return Promise.resolve({ ok: false, reason: 'ruleset', created: [], skipped: [] });
        const body = String(text || '').trim().slice(0, 60000);
        if (!body) return Promise.resolve({ ok: false, reason: 'empty', created: [], skipped: [] });
        if (!requester()) return Promise.resolve({ ok: false, reason: 'no-model', created: [], skipped: [] });
        return runNpcCocJob({ batches: [{ names: null, prompt: async () => ({ ok: true, value: buildNpcCocModuleRequest(body) }) }], source: 'module', label: '导入模组人物', sameJob: `module:${body}` });
    }

    // CoC 且主角已跳过/无需 3+5 选格但尚未分配过技能时，每个聊天提示一次（避免与 hero-pick 重复打扰）。
    function refreshHeroOffer() {
        const chatId = chatIdOf(ctx());
        const offer = Boolean(chatId) && !cocSheetOf(engineOf()) && heroBasicReady() && !heroAsked.has(chatId) && !catalog.heroAssigned && !catalog.heroPicked && !needsHeroPick() && IS_COC(engineOf()) && Boolean(requester());
        const current = notices.get('hero-skills');
        if (!offer && current && (current.kind === 'busy' || current.kind === 'info' || current.retry === true)) return;
        setNotice('hero-skills', offer ? { kind: 'onboarding', order: 2, text: '主角技能：按人设分配一次？', actions: [['assign', '分配'], ['later', '稍后']] } : null);
    }

    // 手动建档模式下，仅对非主角角色逐个询问（主角统一走自动初始化，不再走旧手动建档门禁）。
    function pendingBuildName() {
        if (!heroBasicReady() || buildMode !== 'manual') return null;
        const source = attributes();
        if (!source || source.ready !== true || typeof source.readAbilities !== 'function') return null;
        const state = currentStatsState(ledger);
        let known = [];
        try { known = typeof source.names === 'function' ? source.names() || [] : []; } catch (error) { known = []; }
        for (const name of [...new Set([...known, ...Object.keys(state.characters || {})])]) {
            if (!name || isHero(name) || askedFill.has(name) || Object.hasOwn(buildChoices, name)) continue;
            let abilities = null;
            try { abilities = source.readAbilities(name, { heroPrefs: heroPrefs() }); } catch (error) { abilities = null; }
            if (abilities && abilities.initialized === false) return name;
        }
        return null;
    }

    function refreshBuildAsk() {
        const name = pendingBuildName();
        setNotice('build-ask', name ? { kind: 'onboarding', text: `${name}：建档`, name, actions: [['fill', '填写'], ['auto', '自动'], ['skip', '跳过']] } : null);
    }

    // 角色卡入库前过一遍 sanitizeCatalog 的同一套规整（旧格式属性迁成六维分数），内存与存档保持一致。
    const tidySheet = (sheet) => sanitizeCatalog({ sheets: { x: sheet } }).sheets.x || sheet;

    // ---- 新角色与角色卡（v2 §6.4 / P5）：按本聊天 NPC 策略运行；同步重要角色表 / 开场名单，停止跨聊天 NPC 缓存读取 ----
    function detectNewCharacters({ triggerExisting = false, syncTables = false } = {}) {
        if (!active()) return;
        const s = settings();
        if (s.sheetGen === 'off') return;
        if (syncTables && npcPolicy && s.register !== 'manual' && !generating) syncTablePeopleIntoLedger();
        const state = currentStatsState(ledger);
        const rawNames = [
            ...Object.keys(state.characters || {}),
            ...(triggerExisting || sheetsDeferredByGenerating ? (catalog.queue.people || []) : []),
        ];
        const candidates = [...new Set(rawNames.map((n) => canonName(n)))]
            .filter((n) => n && !isHero(n) && !catalog.sheets[n] && npcChoices[n] !== 'defer');
        if (!candidates.length) { refreshNpcAsk(); return; }
        if (!npcPolicy) {
            refreshNpcPolicy();
            return;
        }
        if (npcPolicy === 'auto') {
            const fresh = triggerExisting
                ? candidates
                : candidates.filter((n) => !catalog.notified.includes(n));
            const deferred = !fresh.length && sheetsDeferredByGenerating && !generating
                ? (catalog.queue.people || []).map((n) => canonName(n)).filter((n) => candidates.includes(n))
                : [];
            const targets = fresh.length ? fresh : deferred;
            if (!targets.length) return;
            const addedNotified = targets.filter((n) => !catalog.notified.includes(n));
            const nextQueue = [...new Set([...catalog.queue.people, ...targets])];
            if (addedNotified.length || nextQueue.length !== catalog.queue.people.length) {
                catalog = {
                    ...catalog,
                    notified: addedNotified.length ? [...catalog.notified, ...addedNotified] : catalog.notified,
                    queue: { ...catalog.queue, people: nextQueue },
                };
                persist();
            }
            generateSheets(targets);
            return;
        }
        // per-npc：只对无正式档案且无已记录决定者进入首次询问；未建档角色自动由相对算法提供带来源标记的派生值。
        refreshNpcAsk();
    }

    function requester() {
        const route = generationRoute();
        let request = null;
        try { request = getBackgroundRequest(); } catch (error) { request = null; }
        if (typeof request !== 'function') return null;
        return (prompt, task = {}) => {
            const current = () => generationRoute() === route;
            task.guard?.(current);
            if (!current() || task.signal?.aborted || task.shouldStart?.() === false)
                throw Object.assign(new Error('request-stale'), { reason: 'request-stale' });
            return request(prompt, task);
        };
    }

    async function ask(request, prompt, ms = BACKGROUND_TIMEOUT_MS, job, options = {}) {
        if (job) {
            const route = generationRoute();
            job.guard(() => generationRoute() === route);
            const held = generationCommitActive > 0 ? { ok: true, intent: null } : generationSave.pending();
            const source = !held.ok || held.intent
                ? { ok: false, reason: held.reason || 'stats-generation-save-pending', stage: 'save' }
                : generationSave.read(null, job.alive);
            if (!source.ok) {
                job.check();
                generationFailures.add(generationFailureKey(job.key));
                diag(source.reason);
                setNotice(job.key, null);
                generationSaveNotice(source);
                throw Object.assign(new Error(source.reason), { reason: source.reason, stage: source.stage });
            }
            job.beforeRows = source.rows;
            job.sourceRevision = generationRevision();
            return job.request(request, prompt, ms, options);
        }
        return generationTasks.start('supplement', async task => {
            const route = generationRoute();
            task.guard(() => generationRoute() === route);
            return { reply: await task.request(request, prompt, ms, options) };
        })
            .then(result => {
                if (result?.reason === 'request-stale') throw Object.assign(new Error('request-stale'), { reason: 'request-stale' });
                return result.reply;
            });
    }

    // 生成角色卡：单次动作只请求一次，失败保留旧卡；慢请求继续等待原回包。
    // 角色卡含六维属性档、资历与技能；专属宿主入口装配历史、角色卡及原生触发世界书。
    // 本聊天已确认的 NPC 手改底数 ID（{ 名 → ID }）。读不到属性档时报原因，不当作没有手改。
    function manualBaseIds(names) {
        if (!attributeAccess) return { ok: true, ids: {} };
        const source = attributes();
        if (!source?.ready) return source?.reason === 'combat-attribute-table-missing'
            ? { ok: true, ids: {} } : { ok: false, reason: source?.reason || 'stats-attribute-read-failed' };
        const ids = {};
        for (const name of names) {
            const id = source.readAbilities(name)?.baseId;
            if (id) ids[name] = id;
        }
        return { ok: true, ids };
    }

    function generateSheets(names = null, { supersede = false } = {}) {
        const pending = generationTasks.get('sheets');
        if (pending) return !supersede || (pending.supersede || []).includes(names?.[0])
            ? pending.promise : Promise.resolve({ ok: false, reason: 'stats-sheet-busy' });
        const recovery = pendingGenerationSave('sheets', () => generateSheets(names, { supersede }));
        if (recovery) return recovery;
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive' });
        const request = requester();
        if (!request) {
            setNotice('sheets', { kind: 'sheets', text: '生成数值需要可用的辅助模型（自动插图设置里的写词模型）', actions: [['dismiss', '知道了']] });
            return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        }
        if (generating) {
            sheetsDeferredByGenerating = true;
            return Promise.resolve({ ok: false, reason: 'stats-generating', queued: true });
        }
        sheetsDeferredByGenerating = false;
        // 不点名时：待生成队列，加上有人际档却没有角色卡的角色（角色卡被删或生成失败丢失）。
        const orphans = () => !ledger ? [] : Object.keys(currentStatsState(ledger).characters || {})
            .filter((n) => n !== PROTAGONIST && !isHero(n) && !catalog.sheets[n]);
        const targets = (names && names.length ? names : [...new Set([...catalog.queue.people, ...orphans()])]).slice(0, SHEET_BATCH_MAX);
        if (!targets.length) return Promise.resolve({ ok: true, skipped: true });
        setNotice('sheets', { kind: 'busy', text: `正在生成数值：${targets.join('、')}` });
        const chatSeed = chatIdOf(ctx());
        const sheetTargetSnapshot = () => JSON.stringify(targets.map((name) => [name, catalog.sheets[name] || null, catalog.sheetDrops[name] || null]));
        const started = generationTasks.start('sheets', async job => {
            let failureReason = '';
            job.onFinish(() => {
                if (job.alive() && notices.get('sheets')?.kind === 'busy') {
                    const code = failureReason || 'stats-sheet-unfinished';
                    diag(code);
                    try { console.warn('[IGS 数值] 角色卡生成未完成：', code); } catch { /* */ }
                    setNotice('sheets', { kind: 'sheets', text: `生成数值未完成（${code}），可重试`, actions: [['generate', '重试'], ['dismiss', '稍后']] });
                }
            });
            try {
            await tail;
            job.check();
            job.conflictSnapshot = sheetTargetSnapshot();
            job.conflictCheck = () => sheetTargetSnapshot() === job.conflictSnapshot;
            // 重新生成只取代发起时已确认的手改；之后保存的手改 ID 不同，不会被迟到结果撤掉。
            const replaced = supersede ? manualBaseIds(targets) : { ok: true, ids: {} };
            if (!replaced.ok) {
                setNotice('sheets', { kind: 'sheets', text: `属性档读取失败（${replaced.reason || 'unknown'}），未发送请求，可重试`, actions: [['generate', '重试'], ['dismiss', '稍后']] });
                return replaced;
            }
            const protagonists = targets.filter(isHero);
            let context = {
                people: targets.map((name) => ({ name, summary: '' })), protagonists,
                history: sheetHistoryContext(messages(ctx()).filter((m) => m && !m.is_system)
                    .map((m) => ({ user: Boolean(m.is_user), text: m.mes }))),
                userPersona: protagonists.length ? String(ctx()?.powerUserSettings?.persona_description || '') : '',
            };
            if (typeof readSheetContext === 'function') {
                const c = ctx();
                let picked = '';
                try { picked = String(userCharacter() || '').trim(); } catch (error) { picked = ''; }
                const protagonistCards = [...new Set([picked, c?.name2, ...(Array.isArray(c?.groupMembers) ? c.groupMembers : [])]
                    .map((name) => String(name || '').trim()).filter((name) => name && isHero(name)))];
                let resolved;
                try { resolved = await readSheetContext({ names: targets, protagonists, protagonistCards }); }
                catch (error) { resolved = { ok: false, reason: 'stats-sheet-context-failed' }; }
                checkGeneration(job);
                if (!resolved || resolved.ok === false) {
                    const reason = resolved?.reason || 'stats-sheet-context-failed';
                    diag(reason);
                    setNotice('sheets', { kind: 'sheets', text: `生成数值所需的上下文读取失败（${reason}），未发送请求，可重试`, actions: [['generate', '重试'], ['dismiss', '稍后']] });
                    return { ok: false, reason };
                }
                context = { ...context, ...resolved };
            }
            const engine = engineOf();
            const skills = engine.registry.entries().filter(([, e]) => e.kind === 'skill' && (e.origin !== 'world')).map(([n, e]) => [n, e.attribute]);
            const prompt = buildSheetRequest(context.people, { ...context, worldview: worldviewOf(), skills, prompt: settings().prompts.sheetGen });
            let parsed = null;
            try {
                parsed = parseSheetReply(await ask(request, prompt, BACKGROUND_TIMEOUT_MS, job, {
                    onRetry: ({ attempt, maxRetries }) => {
                        if (job.alive()) setNotice('sheets', { kind: 'busy', text: `正在重试生成数值（第 ${attempt}/${maxRetries} 次）：${targets.join('、')}` });
                    },
                }), { names: targets, registry: engine.registry });
            }
            catch (error) { job.check(); if (error?.stage) throw error; parsed = { ok: false, reason: error?.reason || 'stats-sheet-request-failed' }; }
            checkGeneration(job);
            if (!parsed || !parsed.ok) {
                const reason = parsed ? parsed.reason : 'stats-sheet-request-failed';
                diag(reason);
                setNotice('sheets', { kind: 'sheets', text: `生成数值失败（${reason}），可重试`, actions: [['generate', '重试'], ['dismiss', '稍后']] });
                return { ok: false, reason };
            }
            (parsed.diagnostics || []).forEach((d) => diag(d.code, d));
            const done = Object.keys(parsed.sheets);
            return await stageGeneration(job, () => {
                const sheets = { ...catalog.sheets };
                const sheetDrops = { ...catalog.sheetDrops };
                for (const [name, tiers] of Object.entries(parsed.sheets)) {
                    for (const sig of tiers.signature) commitSkill(sig.name, { attribute: sig.attribute });
                    sheets[name] = tidySheet(sheetFromTiers(name, tiers, { chatSeed, heroSkill: heroSkillValue }));
                    if (replaced.ids[name]) sheetDrops[name] = replaced.ids[name];
                }
                catalog = { ...catalog, sheets, sheetDrops, queue: { ...catalog.queue, people: catalog.queue.people.filter((n) => !done.includes(n)) } };
                generationStage.sheetWrites = { card: cardOf(ctx()), names: done };
                setNotice('sheets', catalog.queue.people.length
                    ? { kind: 'sheets', text: `还有 ${catalog.queue.people.length} 位角色没有数值`, actions: [['generate', '生成数值'], ['dismiss', '稍后']] }
                    : { kind: 'info', text: `已生成数值：${done.join('、')}`, ttl: true });
                return { result: { ok: true, names: done } };
            });
            } catch (error) {
                failureReason = error?.reason || error?.message || 'stats-sheet-threw';
                throw error;
            }
        });
        const job = generationTasks.get('sheets');
        if (job) job.supersede = supersede ? targets : [];
        return started;
    }

    // ---- 批量补全（v2 §6.2 第二、三层） ----
    function scheduleBackfill() {
        if (settings().backfill !== 'auto' || !catalog.queue.skills.length || generationTasks.get('backfill') || !requester()
            || generationFailures.has(generationFailureKey('backfill'))) return;
        const owner = generationIdentity();
        const id = chatIdOf(ctx());
        setTimeout(() => { if (!generating && chatIdOf(ctx()) === id && generationIdentity() === owner) runBackfill({ manual: false }); }, 0);
    }

    function runBackfill({ manual = true } = {}) {
        const pending = generationTasks.get('backfill');
        if (pending) return pending.promise;
        const recovery = manual ? pendingGenerationSave() : null;
        if (recovery) return recovery;
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive' });
        const failureKey = generationFailureKey('backfill');
        if (!manual && generationFailures.has(failureKey)) return Promise.resolve({ ok: false, reason: 'stats-backfill-retry-required' });
        const request = requester();
        if (!request) return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        // 队列空时（手动点「补全角色数值」）改补主角还没有数值的剧情技能；自动补全只在队列非空时触发，不会走到这里。
        const heroLacks = () => {
            const own = currentStatsState(ledger).protagonist.skills;
            return (catalog.story || []).map((s) => s.name).filter((n) => !own[n] && !catalog.protagonistBase[n] && !catalog.protagonistEdit[n]);
        };
        const skills = (catalog.queue.skills.length ? catalog.queue.skills : heroLacks()).slice(0, 6);
        if (!skills.length) return Promise.resolve({ ok: true, skipped: true });
        const npcs = Object.keys(catalog.sheets).filter((n) => !isHero(n)).slice(0, SHEET_BATCH_MAX - 1);
        const chatSeed = chatIdOf(ctx());
        return generationTasks.start('backfill', async job => {
            job.revision = JSON.stringify(catalog);
            let people;
            try { people = typeof describePeople === 'function' ? await describeWithHero([...npcs, PROTAGONIST]) : [...npcs, PROTAGONIST].map((name) => ({ name, summary: '' })); }
            catch (error) { people = [...npcs, PROTAGONIST].map((name) => ({ name, summary: '' })); }
            checkGeneration(job);
            const prompt = buildBackfillRequest(people, skills, { prompt: settings().prompts.backfill });
            let parsed = null;
            try { parsed = parseBackfillReply(await ask(request, prompt, BACKGROUND_TIMEOUT_MS, job), { names: [...npcs, PROTAGONIST], skills }); }
            catch (error) { job.check(); if (error?.stage) throw error; parsed = { ok: false, reason: error?.reason || 'stats-backfill-request-failed' }; }
            checkGeneration(job);
            if (!parsed || !parsed.ok) {
                generationFailures.add(failureKey);
                diag(parsed?.reason || 'stats-backfill-request-failed');
                return { ok: false, reason: parsed?.reason || 'stats-backfill-request-failed' };
            }
            generationFailures.delete(failureKey);
            return stageGeneration(job, () => {
                catalog = { ...catalog, queue: { ...catalog.queue, skills: catalog.queue.skills.filter((s) => !skills.includes(s)) } };
                const sheets = { ...catalog.sheets };
                for (const name of npcs) if (parsed.fills[name]) sheets[name] = applyBackfillToSheet(sheets[name], parsed.fills[name], { name, chatSeed, heroSkill: heroSkillValue });
                const base = { ...catalog.protagonistBase };
                const own = currentStatsState(ledger).protagonist.skills;
                const filled = [];
                for (const [skill, tier] of Object.entries(parsed.fills[PROTAGONIST] || {})) {
                    const capped = capSkillTier(tier, PROTAGONIST_BACKFILL_MAX);
                    if (own[skill] || base[skill] || catalog.protagonistEdit[skill] || !SKILL_TIERS[capped]) continue;
                    base[skill] = bandValue(SKILL_TIERS[capped], `${chatSeed}|${PROTAGONIST}|${skill}`);
                    filled.push(`${skill} ${capped}`);
                }
                catalog = { ...catalog, sheets, protagonistBase: base };
                if (filled.length) setNotice('backfill', { kind: 'info', text: `按人设补全：${filled.join('、')}`, ttl: true });
                return { result: { ok: true, filled } };
            });
        });
    }

    // ---- 主角技能（CoC）：按人设一次分配 + 玩家手改 ----
    // 可分配技能：核心（含默认特有）与当前世界观的附加技能；不含六维与理智、剧情技能。
    // 「修改属性」预填：主角六维底数（剧情、升级加点之前，3–18）。战斗属性表没就绪时为 null，不显示按钮。
    function heroAttrs() {
        const source = attributes();
        if (!source || source.ready !== true || typeof source.readAbilities !== 'function') return null;
        let view = null;
        try { view = source.readAbilities(userName() || PROTAGONIST, { heroPrefs: heroPrefs() }); } catch (error) { view = null; }
        if (!view || !view.base || view.table !== 'ok') return null;
        return { base: { ...view.base }, className: view.className || '', role: view.role || '', hasCombatInit: Boolean(view.className), source: view.source || 'default', revision: view.revision,
            chatId: chatIdOf(ctx()), ownerGeneration: generationIdentity()?.generation };
    }

    function heroSkillNames() {
        const world = new Set(worldSkillNames(worldviewOf()));
        return engineOf().registry.entries()
            .filter(([name, e]) => e.kind === 'skill' && (e.origin === 'builtin' || e.origin === 'core' || (e.origin === 'world' && world.has(name))))
            .map(([name]) => name);
    }

    // 按人设一次分配主角擅长技能（CoC 与 D&D5e 通用）。已分配过且仍有已学技能、未传 overwrite 时返回 needs-confirm，由设置页确认后再覆盖。
    // 账本里已有的已学技能（>= 25）以账本为准，不参与覆盖；重新分配会清掉本次名单内的旧底数与手改，并自动回填擅长格。
    function assignHeroSkills({ overwrite = false } = {}) {
        const pending = generationTasks.get('hero-skills');
        if (pending) return pending.promise;
        const recovery = pendingGenerationSave('hero-skills', () => assignHeroSkills({ overwrite }));
        if (recovery) return recovery;
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive' });
        if (hasLearnedHeroSkill() && !overwrite) return Promise.resolve({ ok: false, reason: 'needs-confirm' });
        const request = requester();
        if (!request) {
            setNotice('hero-skills', { kind: 'onboarding', order: 2, retry: true, text: '生成主角擅长技能需要可用的辅助模型（自动插图设置里的写词模型）', actions: [['later', '知道了']] });
            return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        }
        const chatId = chatIdOf(ctx());
        const owned = currentStatsState(ledger).protagonist.skills;
        const skills = heroSkillNames().filter((name) => !(owned[name] && Number(owned[name].value) >= 25));
        if (!skills.length) {
            // 全部技能已在账本里：记为已分配，开局提示不再出现。
            catalog = sanitizeCatalog({ ...catalog, heroAssigned: true, heroPicked: true });
            heroAsked.add(chatId);
            heroPickAsked.add(chatId);
            persist();
            setNotice('hero-skills', null);
            setNotice('hero-pick', null);
            refreshOnboarding();
            return Promise.resolve({ ok: true, skipped: true });
        }
        setNotice('hero-skills', { kind: 'busy', text: '正在按人设生成主角擅长技能' });
        const heroSkillSnapshot = () => JSON.stringify([catalog.protagonistBase, catalog.protagonistEdit, catalog.heroSlots, catalog.heroAssigned]);
        return generationTasks.start('hero-skills', async job => {
            let failureReason = '';
            job.onFinish(() => {
                if (job.alive() && notices.get('hero-skills')?.kind === 'busy') {
                    const code = failureReason || 'stats-hero-skills-unfinished';
                    diag(code);
                    try { console.warn('[IGS 数值] 主角擅长技能生成未完成：', code); } catch { /* */ }
                    setNotice('hero-skills', { kind: 'onboarding', order: 2, retry: true, text: `主角擅长技能生成未完成（${code}），可重试`, actions: [['assign', '重试'], ['later', '稍后']] });
                }
            });
            try {
            await tail;
            job.check();
            job.conflictSnapshot = heroSkillSnapshot();
            job.conflictCheck = () => heroSkillSnapshot() === job.conflictSnapshot;
            let people;
            try { people = typeof describePeople === 'function' ? await describeWithHero([PROTAGONIST]) : [{ name: PROTAGONIST, summary: '' }]; }
            catch (error) { people = [{ name: PROTAGONIST, summary: '' }]; }
            checkGeneration(job);
            const prompt = buildHeroSkillRequest(people, skills, { prompt: settings().prompts.heroSkills });
            let parsed = null;
            try {
                parsed = parseHeroSkillReply(await ask(request, prompt, BACKGROUND_TIMEOUT_MS, job, {
                    onRetry: ({ attempt, maxRetries }) => {
                        if (job.alive()) setNotice('hero-skills', { kind: 'busy', text: `正在重试生成主角擅长技能（第 ${attempt}/${maxRetries} 次）` });
                    },
                }), { skills });
            }
            catch (error) { job.check(); if (error?.stage) throw error; parsed = { ok: false, reason: error?.reason || 'stats-hero-skills-request-failed' }; }
            checkGeneration(job);
            if (!parsed || !parsed.ok) {
                const reason = parsed ? parsed.reason : 'stats-hero-skills-request-failed';
                diag(reason);
                try { console.warn('[IGS 数值] 主角擅长技能生成失败：', reason); } catch { /* */ }
                setNotice('hero-skills', { kind: 'onboarding', order: 2, retry: true, text: `主角擅长技能生成失败（${reason}），可重试`, actions: [['assign', '重试'], ['later', '稍后']] });
                return { ok: false, reason };
            }
            const res = await stageGeneration(job, () => {
                const base = { ...catalog.protagonistBase };
                const edit = { ...catalog.protagonistEdit };
                for (const name of skills) { delete base[name]; delete edit[name]; }
                const done = [];
                const entries = [];
                for (const [skill, tier] of Object.entries(parsed.tiers)) {
                    const val = bandValue(SKILL_TIERS[tier], `${chatId}|${PROTAGONIST}|${skill}`);
                    base[skill] = val;
                    entries.push([skill, val]);
                    done.push(`${skill} ${tier}`);
                }
                const heroSlots = backfillHeroSlots(entries);
                catalog = sanitizeCatalog({ ...catalog, protagonistBase: base, protagonistEdit: edit, heroAssigned: true, heroPicked: true, heroSlots });
                generationStage.heroAssigned = true;
                heroAsked.add(chatId);
                heroPickAsked.add(chatId);
                setNotice('hero-pick', null);
                setNotice('hero-skills', { kind: 'info', text: `已生成主角擅长技能：${done.join('、')}`, ttl: true });
                return { result: { ok: true, assigned: done } };
            });
            if (res?.ok && job.alive()) refreshOnboarding();
            return res;
            } catch (error) {
                failureReason = error?.reason || error?.message || 'stats-hero-skills-threw';
                throw error;
            }
        });
    }

    // 玩家手改一项技能值（1–99；空值清除手改）。覆盖层规则见 stat-engine.js 的 heroSkillLevel：
    // 记下改动当时账本里的值作为 from，之后的成长叠加在手改值上。
    function setHeroSkill(name, raw) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        const engine = dailyEngineOf();
        const skill = engine.registry.resolve(name);
        const entry = skill ? engine.registry.get(skill) : null;
        if (!entry || entry.kind !== 'skill') return { ok: false, reason: 'stats-hero-skill-unknown' };
        currentSlots();
        const edit = { ...catalog.protagonistEdit };
        const text = String(raw ?? '').trim();
        if (!text) delete edit[skill];
        else {
            const value = Number(text);
            if (!/^\d+$/.test(text) || value < 1 || value > 99) return { ok: false, reason: 'stats-hero-skill-invalid' };
            if (overCap(engine, skill, text, currentSlots())) return { ok: false, reason: 'stats-hero-tier-over-cap' };
            // from 取不含手改的值（已学取账本值，未学取底数或基础值），与 markGrowth 登记的值一致。
            const own = currentStatsState(ledger).protagonist.skills[skill];
            const seed = own ? Number(own.value) || 0 : Number(profileOf(engine, currentStatsState(ledger), PROTAGONIST, skill).seed) || 0;
            // 界面和表格里看到的是含随身系统加成的生效值，存回 IGS 的要先减掉加成。
            edit[skill] = { value: withoutHeroBonus(engine, skill, value), from: seed };
        }
        catalog = sanitizeCatalog({ ...catalog, protagonistEdit: edit });
        persist();
        onChange(currentStatsState(ledger), null);
        return { ok: true };
    }

    // 旧存档（v0.39.60 前选过技能）没有 heroSlots，每次按数值回填，删掉或改动一项后其余技能会换格。
    // 第一次读到时把回填结果固定进目录，之后增删都在这份格位上做；随下一次保存写入存档。
    const currentSlots = () => {
        const slots = resolveHeroSlots(dailyEngineOf(), currentStatsState(ledger), catalog);
        if (!catalog.heroSlots) catalog = { ...catalog, heroSlots: slots };
        return slots;
    };
    // 熟练度封顶：返回是否越过封顶档（剧情技能且不占格的不限）。target 为档位词或数值。
    function overCap(engine, skill, target, slots) {
        const cap = heroSkillCap(engine, currentStatsState(ledger), catalog, skill, slots);
        if (!cap.capped) return false;
        const word = /^[0-9]+$/.test(String(target)) ? tierWordOfValue(Number(target)) : String(target);
        return SKILL_TIER_ORDER.indexOf(word) > cap.rank;
    }

    // 3+5 换格：选新技能占格，原占格技能回到未学（剧情技能一并删除），新技能得该格起步值。已学且值不低于起步值的保持原值。
    // 技能名不认识时需要 attribute 才登记成自定义技能，缺了返回 stats-slot-needs-attribute 由界面补问。
    function setHeroSlot(slot, payload = {}) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        if (!BUILD_PICK_SLOTS.includes(slot)) return { ok: false, reason: 'stats-hero-edit-invalid' };
        const typed = String(payload.skill || '').trim();
        if (!typed) return { ok: false, reason: 'stats-hero-edit-invalid' };
        const engine = dailyEngineOf();
        // custom：玩家自定义的技能名，只认同名，不按别名归并到内置技能。
        const custom = payload.custom === true;
        let name = custom ? (engine.registry.has(typed) ? typed : null) : engine.registry.resolve(typed);
        const entry = name ? engine.registry.get(name) : null;
        if (entry && entry.kind !== 'skill') return { ok: false, reason: 'stats-hero-edit-attribute' };
        if (!name) {
            if (!payload.attribute) return { ok: false, reason: 'stats-slot-needs-attribute' };
            name = commitSkill(typed, { attribute: payload.attribute, exact: custom });
            if (!name) return { ok: false, reason: 'stats-hero-edit-invalid' };
        }
        const slots = { ...currentSlots() };
        const old = slots[slot] || '';
        if (old === name) return { ok: true, cancelled: true };
        if (Object.values(slots).includes(name)) return { ok: false, reason: 'stats-build-pick-duplicate' };
        const owned = currentStatsState(ledger).protagonist.skills;
        const base = { ...catalog.protagonistBase };
        const edit = { ...catalog.protagonistEdit };
        if (old) {
            delete base[old];
            if (owned[old] && Number(owned[old].value) > 0) edit[old] = { value: 1, from: Number(owned[old].value) || 0 }; else delete edit[old];
        }
        const start = slotValue(slot);
        delete base[name];
        delete edit[name];
        if (owned[name] && Number(owned[name].value) > 0) {
            if (Number(owned[name].value) < start) edit[name] = { value: withoutHeroBonus(engine, name, start), from: Number(owned[name].value) || 0 };
        } else base[name] = withoutHeroBonus(engine, name, start);
        slots[slot] = name;
        let next = { ...catalog, protagonistBase: base, protagonistEdit: edit, heroSlots: slots, queue: { ...catalog.queue, skills: catalog.queue.skills.filter((x) => x !== name && x !== old) } };
        if (old) next = removeStorySkill(next, old);
        catalog = sanitizeCatalog(next);
        persist();
        onChange(currentStatsState(ledger), null);
        return { ok: true };
    }

    // 「编辑技能」：「技能 档位」或「技能 数值」，两种骰子通用。不认识的技能名登记成剧情技能。
    // 已在账本里的（建卡、成长过的）走手改层，成长继续叠加；其余写底数。填「未学」：清掉底数与手改，账本里的降到 1（列表不再显示）。
    function editHeroSkill(rawName, rawTier) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        const typed = String(rawName || '').trim();
        const tier = String(rawTier || '').trim();
        if (!typed || !tier) return { ok: false, reason: 'stats-hero-edit-invalid' };
        const engine = dailyEngineOf();
        let skill = engine.registry.resolve(typed);
        const entry = skill ? engine.registry.get(skill) : null;
        if (entry && entry.kind !== 'skill') return { ok: false, reason: 'stats-hero-edit-attribute' };
        const numeric = /^\d+$/.test(tier) ? Number(tier) : null;
        if (numeric !== null && (numeric < 1 || numeric > 99)) return { ok: false, reason: 'stats-hero-skill-invalid' };
        if (numeric === null && !Object.hasOwn(SKILL_TIERS, tier)) return { ok: false, reason: 'stats-hero-edit-invalid' };
        // 不认识的技能名不在这里登记（新技能只能走 3+5 换格，剧情里出现的由剧情登记）。
        if (!skill) return tier === '未学' ? { ok: true, cancelled: true } : { ok: false, reason: 'stats-hero-edit-unknown' };
        const slots = currentSlots();
        if (overCap(engine, skill, tier, slots)) return { ok: false, reason: 'stats-hero-tier-over-cap' };
        const value = numeric !== null ? numeric : SKILL_TIERS[tier] ? bandValue(SKILL_TIERS[tier], `${chatIdOf(ctx())}|${PROTAGONIST}|${skill}`) : null;
        const owned = currentStatsState(ledger).protagonist.skills[skill];
        const base = { ...catalog.protagonistBase };
        const edit = { ...catalog.protagonistEdit };
        if (owned && Number(owned.value) > 0) {
            delete base[skill];
            edit[skill] = { value: value ? withoutHeroBonus(engine, skill, value) : 1, from: Number(owned.value) || 0 };
        } else {
            delete edit[skill];
            if (value) base[skill] = withoutHeroBonus(engine, skill, value); else delete base[skill];
        }
        // 编辑过的技能不再进补全队列。
        // 改为未学即腾出所占的格。
        let heroSlots = slots;
        if (tier === '未学' && Object.values(slots).includes(skill)) heroSlots = Object.fromEntries(Object.entries(slots).filter(([, v]) => v !== skill));
        catalog = sanitizeCatalog({ ...catalog, protagonistBase: base, protagonistEdit: edit, heroSlots, queue: { ...catalog.queue, skills: catalog.queue.skills.filter((s) => s !== skill) } });
        persist();
        onChange(currentStatsState(ledger), null);
        return { ok: true };
    }

    function heroOp(op, name, payload = {}) {
        if (op === 'set') return setHeroSkill(name, payload.value);
        if (op === 'edit') return editHeroSkill(name, payload.tier);
        if (op === 'pick') return pickHeroSkills(payload.skills, payload.attributes, payload.slots);
        if (op === 'slot') return setHeroSlot(name, payload);
        if (op === 'attrs') return { ok: true, attrs: heroAttrs() };
        if (op === 'manual-init') return submitManualHero(payload);
        if (op === 'assign') return assignHeroSkills({ overwrite: payload.overwrite === true });
        return { ok: false, reason: 'stats-hero-op-unknown' };
    }

    // ---- 手动掷骰（v2 §5.2 可选档） ----
    function offerManualRoll(entry) {
        const pr = entry.meta.pendingRoll;
        const engine = engineOf();
        const skill = engine.registry.resolve(pr.skill) || pr.skill;
        let pct = '';
        try { pct = ` 约 ${Math.round(chanceOf(engine, heroView(entry.before, engine), { actor: PROTAGONIST, skill, difficulty: pr.difficulty, against: pr.against }) * 100)}%`; } catch (error) { pct = ''; }
        setNotice('roll', { kind: 'roll', messageId: entry.messageId, text: `${skill}·${pr.difficulty}${pct}`, actions: [['roll', '掷骰']] });
    }

    function manualRoll() {
        const n = notices.get('roll');
        if (!n || !active()) return { ok: false, reason: 'stats-no-pending-roll' };
        const entry = latestEntry();
        if (!entry || entry.messageId !== n.messageId || !entry.meta || !entry.meta.pendingRoll) { setNotice('roll', null); return { ok: false, reason: 'stats-roll-stale' }; }
        const pr = entry.meta.pendingRoll;
        collectOriginSkills();
        const name = commitSkill(pr.skill, { attribute: pr.attribute, floor: entry.messageId }) || pr.skill;
        const check = resolveHeroCheck(engineOf(), entry.before, { actor: PROTAGONIST, skill: name, difficulty: pr.difficulty, against: pr.against, opposedSkill: pr.opposedSkill, source: 'manual' });
        manualCheck = { messageId: entry.messageId, check };
        setNotice('roll', null);
        playCheck(check, entry.messageId);
        if (typeof resumeReply === 'function') Promise.resolve().then(() => resumeReply()).catch(() => diag('stats-resume-failed'));
        return { ok: true, check };
    }

    // ---- 选项骰子（v2 §5.1） ----
    function resolveDice(raw, { userName: who = '' } = {}) {
        if (!active()) return null;
        collectOriginSkills();
        const command = parseDiceCommand(raw);
        if (command.kind !== 'check' && command.kind !== 'contest') return null;
        const engine = memoEngineOf();
        const state = heroView(currentStatsState(ledger), engine);
        const c = ctx();
        const resolve = resolveCharacter || defaultResolver(c, settings().register, worldRoles, tableNameSet(), isHero);
        const req = resolveDiceRequest(engine, state, command, { resolveCharacter: (name) => resolve(canonName(name), state) });
        if (!req) return null;
        const ensure = (skill) => (BUILTIN_SKILLS[skill] || engine.registry.has(skill) ? skill : commitSkill(skill) || skill);
        if (req.kind === 'check') {
            const check = resolveCheck(engine, state, { ...req, skill: ensure(req.skill), source: 'option' }, cryptoRandom);
            const line = checkLine(check, who);
            if (isProtagonist(check.actor)) pendingOption = { line, check };
            return { ok: true, success: check.success, roll: check.roll, target: check.target, line, detail: checkFxDetail(check, who), statsFx: true };
        }
        const result = contestCheck(engine, state, { ...req.left, skill: ensure(req.left.skill) }, { ...req.right, skill: ensure(req.right.skill) }, cryptoRandom,
            { tieWinner: req.tieRule === 'initiator_win' ? 'left' : '' });
        const line = contestLine(result, who);
        const opponent = (other) => ({ actor: other.actor, skill: other.skill, value: other.value });
        const mine = isProtagonist(req.left.actor) ? { ...result.left, success: result.winner === 'left', opposed: opponent(result.right) } : isProtagonist(req.right.actor) ? { ...result.right, success: result.winner === 'right', opposed: opponent(result.left) } : null;
        if (mine) pendingOption = { line, check: { ...mine, source: 'option' } };
        return { ok: true, success: result.winner === 'left', winner: result.winner, line, detail: contestFxDetail(result, who), statsFx: true };
    }

    function diceChance(raw) {
        if (!active() || !settings().optionChance) return null;
        const command = parseDiceCommand(raw);
        if (command.kind !== 'check') return null;
        const engine = memoEngineOf();
        const state = heroView(currentStatsState(ledger), engine);
        const req = resolveDiceRequest(engine, state, command, {});
        if (!req || !isProtagonist(req.actor)) return null;
        try { return { skill: req.skill, difficulty: req.difficulty, chance: chanceOf(engine, state, req) }; } catch (error) { return null; }
    }

    // ---- 阅读器提示条的按钮（v2 §9.5、§6.4） ----
    function noticeAction(id, action) {
        if (disposed) return { ok: false, reason: 'request-stale' };
        const n = notices.get(id);
        if (!n) return { ok: false, reason: 'stats-notice-gone' };
        if (id === 'attribute-save' && action === 'retry') {
            const owner = generationIdentity(), access = attributeAccess(), epoch = currencyEpoch;
            const alive = () => !disposed && settings().enabled && epoch === currencyEpoch && n.chatId === chatIdOf(ctx()) && n.generation === owner?.generation && owner === generationIdentity();
            if (!alive()) return { ok: false, reason: 'request-stale' };
            return access.recover({ operation: n.operation, shouldStart: alive }).then(result => {
                if (!alive()) return { ok: false, reason: 'request-stale' };
                if (result.ok) { gateMemo = null; ensureLoaded(true); }
                refreshAttributeRecovery(result.ok ? '' : result.reason);
               return result;
            });
        }
        if (id === 'generation-save' && action === 'retry') return retryGenerationSave();
        if (id === 'npc-policy' && (action === 'auto' || action === 'per-npc')) return setNpcPolicy(action);
        if (id === 'npc-ask' && (action === 'generate' || action === 'defer')) {
            const name = String(n.name || '');
            if (!name || !ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
            return setNpcChoice(name, action);
        }
        if (id === 'build-ask' && (action === 'fill' || action === 'auto' || action === 'skip')) {
            const name = String(n.name || '');
            if (!name || !ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
            if (action === 'fill') { askedFill.add(name); refreshBuildAsk(); return { ok: true, openPanel: 'build', name }; }
            buildChoices = { ...buildChoices, [name]: action };
            persist();
            refreshBuildAsk();
            onBuildPolicyChange();
            return { ok: true, choice: action };
        }
        if (id === 'hero-init-mode') {
            if (action === 'manual') return { ok: true, openPanel: 'hero-manual-setup' };
            if (action === 'auto') {
                catalog = sanitizeCatalog({ ...catalog, heroInitChoice: 'auto' });
                setNotice('hero-init-mode', null);
                persist();
                refreshOnboarding();
                const initPromise = ensureHeroInit({ force: true });
                return Promise.resolve(initPromise || { ok: true }).then((res) => {
                    if (res?.ok !== false && needsHeroPick() && requester()) void assignHeroSkills({ overwrite: true });
                    return { ok: res?.ok !== false, choice: 'auto', result: res };
                });
            }
            return { ok: false, reason: 'stats-notice-action-unknown' };
        }
        if (id === 'hero-pick') {
            heroPickAsked.add(chatIdOf(ctx()));
            setNotice('hero-pick', null);
            if (action === 'assign') return assignHeroSkills({ overwrite: true });
            refreshOnboarding();
            return action === 'open' ? { ok: true, openSettings: 'stats' } : { ok: true };
        }
        if (id === 'hero-skills') {
            heroAsked.add(chatIdOf(ctx()));
            setNotice('hero-skills', null);
            return action === 'assign' ? assignHeroSkills({ overwrite: true }) : { ok: true };
        }
        if (id === 'sheets' && action === 'generate') { setNotice('sheets', null); return generateSheets(); }
        if (id === 'roll' && action === 'roll') return manualRoll();
        if ((id === 'currency' || id === 'hero-init') && action === 'retry') return ensureHeroInit({ force: true });
        setNotice(id, null);
        return { ok: true };
    }

    // ---- 诊断（v2 §9.4）：来源与规则体系名按体系分流，CoC 沿用工作区原文案，D&D 照 v0.39 ----
    const REASON_TEXT = Object.freeze({
        'no-match': '玩家输入没有命中技能词', excluded: '命中的词在否定句、引号台词、回忆或旁观里', conflict: '命中的词同时属于两项技能',
        'no-input': '没有找到玩家输入', 'auto-skill-off': '已关闭玩家输入匹配', 'story-check-off': '已关闭故事中检定',
        'stats-roll-skipped': 'AI 没有打 roll 标签', 'roll-unresolved': 'roll 标签里的技能无法识别',
    });
    const SOURCE_TEXT = Object.freeze({
        dnd5e: { option: '选项', input: '输入匹配', roll: '自动', story: '正文检定', manual: '手动掷骰', preroll: '自动', 'manual-rule': '手动掷骰', none: '无' },
        coc7: { option: '选项', input: '输入匹配', roll: '预掷', story: '正文检定', manual: '手动掷骰', preroll: '预掷', 'manual-rule': '手动掷骰', none: '无' },
    });
    const STORY_CHECK_TEXT = Object.freeze({
        dnd5e: { preroll: '自动', manual: '手动掷骰', off: '关闭' },
        coc7: { preroll: '预掷', manual: '手动掷骰', off: '关闭' },
    });

    function diagnose(messageId) {
        const text = diagnoseFloor(messageId);
        const trail = ledger && chatEnabled && settings().enabled ? describeClockTrail(statsClockTrail(ledger)) : '';
        const persona = personaReport.size ? `特质评定人设字数：${[...personaReport].map(([n, r]) => `${n} ${r.len}${r.world ? `+世界书${r.world}` : ''}${r.from === 'floors' ? '（取自正文）' : ''}`).join('、')}` : '';
        const money = currencyProgress ? `剧情货币：stage=${currencyProgress.stage} reason=${currencyProgress.reason || '-'}${currencyProgress.status ? ` HTTP=${currencyProgress.status}` : ''}${currencyProgress.slow ? ' slow=true' : ''}` : '';
        return [text, trail, persona, money].filter(Boolean).join('\n');
    }

    // 数值存档诊断：直接读一次数据库原表（不走缓存），列出表里实际存了什么、合并结果、内存状态与 archive 是否抛错。只读，不写。
    function storageReport() {
        const lines = [];
        const add = (k, v) => lines.push(`${k}：${v}`);
        const safe = (fn) => { try { return fn(); } catch (error) { return `抛错 ${String((error && (error.stack || error.message)) || error).split('\n').slice(0, 4).join(' | ')}`; } };
        const c = ctx();
        const chatId = chatIdOf(c);
        add('时间', new Date().toISOString());
        add('聊天ID', chatId || '（无）');
        add('楼层数', messages(c).length);
        const s = settings();
        add('总开关', `${s.enabled}（战斗开启 ${safe(() => combatOn())}）`);
        add('内存', `loadedChat=${loadedChat} loadedKey=${loadedKey} chatEnabled=${chatEnabled} ledger=${ledger ? `有（楼层记录 ${ledger.entries.size}，生效 ${ledger.active.size}）` : '无'} blocked=${blocked || '-'} unavailable=${unavailable || '-'} declined=${declined} buildMode=${buildMode || '-'} inflight=${inflight}`);
        const read = safe(() => store.read());
        add('聊天元数据', typeof read === 'string' ? read : `ok=${read.ok} 旧整体存档igs_stats=${read.raw ? '有' : '无'} declined=${read.declined === true} 旧备份=${read.hasBackup === true}`);
        const t = tables();
        add('数据库接口', t.ok ? `可用 version=${safe(() => t.version)}` : `不可用 ${t.reason}`);
        add('数据库原表', safe(() => {
            const api = globalThis.AutoCardUpdaterAPI;
            if (!api) return '未找到 AutoCardUpdaterAPI';
            if (typeof api.exportTableAsJson !== 'function') return '缺 exportTableAsJson';
            const data = api.exportTableAsJson();
            if (!data || typeof data !== 'object') return `导出结果 ${data === null ? 'null' : typeof data}`;
            const names = Object.entries(data).map(([k, v]) => (v && typeof v === 'object' && v.name) || k);
            return names.length ? `${names.length} 张：${names.join('、')}` : '导出为空对象（数据库插件当前没有本聊天的表）';
        }));
        if (t.ok) {
            const rows = safe(() => t.read({ kinds: ['stats'] }));
            if (typeof rows === 'string') add('读表', rows);
            else if (!rows || rows.ok !== true) add('读表', `失败 ${(rows && rows.reason) || '?'}`);
            else {
                add('缺表', `${(rows.missing || []).join('、') || '无'}；可选缺 ${(rows.optionalMissing || []).join('、') || '无'}`);
                if (!Array.isArray(rows.stats)) add('数值日志表', '不存在（IGS数值·日志 表没有）');
                else {
                    const list = rows.stats;
                    const byType = {};
                    for (const r of list) byType[(r && r.type) || '?'] = (byType[(r && r.type) || '?'] || 0) + 1;
                    add('数值日志表记录数', `${list.length}（${Object.entries(byType).map(([k, n]) => `${k} ${n}`).join('，')}）`);
                    const inits = list.filter((r) => r && r.type === 'init');
                    add('建档记录', inits.length ? inits.map((r) => `${r.id} 有state=${Boolean(r.payload && r.payload.state)} 时间=${r.createdAt}`).join('；') : '无');
                    const floors = list.filter((r) => r && r.type === 'floor');
                    if (floors.length) {
                        const ids = floors.map((r) => r.anchor && r.anchor.messageId).filter(Number.isInteger);
                        add('楼层记录楼号范围', `${Math.min(...ids)}–${Math.max(...ids)}`);
                        let matched = 0, missing = 0, mismatch = 0;
                        for (const r of floors) {
                            const a = r.anchor || {};
                            const m = messages(c)[a.messageId];
                            if (!m) { missing += 1; continue; }
                            const text = Array.isArray(m.swipes) && m.swipes[a.swipeId] !== undefined ? m.swipes[a.swipeId] : (Number(m.swipe_id) || 0) === a.swipeId ? m.mes : null;
                            if (text === null || text === undefined) { missing += 1; continue; }
                            if (statTagHash(String(text)) === a.tagHash) matched += 1; else mismatch += 1;
                        }
                        add('楼层记录与正文核对', `标签相符 ${matched}，楼/swipe 不存在 ${missing}，正文标签已变 ${mismatch}`);
                    }
                    const keys = list.filter((r) => r && r.payload && typeof r.payload.key === 'string').map((r) => r.payload.key.split(':')[0]);
                    const kc = {};
                    for (const k of keys) kc[k] = (kc[k] || 0) + 1;
                    add('聊天级记录键', Object.entries(kc).map(([k, n]) => `${k} ${n}`).join('，') || '无');
                    const merged = safe(() => mergeStatLog(list, { chatId, chat: messages(c) }));
                    if (typeof merged === 'string') add('合并', merged);
                    else add('合并结果', `ledger=${merged.ledger ? `有（楼层 ${merged.ledger.entries.size}）` : '无'} chatEnabled=${merged.chatEnabled} 角色卡 ${Object.keys(merged.catalog.sheets || {}).length} 特质 ${Object.keys(merged.catalog.traits || {}).length} 诊断 ${merged.diagnostics.map((d) => d.code).join('、') || '无'}`);
                    if (rows.diagnostics && rows.diagnostics.length) add('解码诊断', rows.diagnostics.slice(0, 10).map((d) => `${d.code}${d.key ? `(${String(d.key).slice(0, 30)})` : ''}`).join('、'));
                }
            }
        }
        const arch = safe(() => { ensureLoaded(true); const a = archiveModel(); return a ? `正常（角色 ${a.characters.length}，角色卡 ${a.sheets.length}，变动 ${a.total}）` : '返回空'; });
        add('存档区模型', arch);
        add('最近诊断', diagnostics.slice(-8).map((d) => d.code || d).join('、') || '无');
        return `IGS 数值诊断\n${lines.join('\n')}`;
    }

    function diagnoseFloor(messageId) {
        const s = settings();
        if (!s.enabled) return '数值 总开关关闭';
        if (!chatEnabled || !ledger) return `数值 本聊天未启用${blocked || unavailable ? `（存档无法读取：${blocked || unavailable}）` : ''}`;
        const c = ctx();
        const id = Number(messageId);
        const m = messages(c)[id];
        const entry = m ? ledger.entries.get(ledgerKey(ledger, id, Number(m.swipe_id) || 0)) : null;
        const ruleset = s.ruleset === 'coc7' ? 'coc7' : 'dnd5e';
        const sources = SOURCE_TEXT[ruleset];
        const head = `数值 ${ruleset === 'dnd5e' ? 'D&D第五版' : 'CoC第七版'} · 故事中检定 ${STORY_CHECK_TEXT[ruleset][s.storyCheck]}`;
        if (!entry) return `${head} · 本楼没有结算记录`;
        const meta = entry.meta || {};
        const note = meta.note || {};
        if (meta.check) {
            const ck = meta.check;
            return `${head} · 检定来源 ${sources[ck.source || note.source] || ck.source || '?'} · ${ck.skill}${ck.difficulty && ck.difficulty !== '普通' ? `（${ck.difficulty}）` : ''} ${ck.detail || ''} → ${ck.outcome}`;
        }
        const reason = REASON_TEXT[note.reason] || note.reason || '未知';
        return `${head} · 本楼无检定（${sources[note.source] || '无'}；原因：${reason}）`;
    }

    // ---- 设置页存档区操作 ----
    // 角色（非主角）的体力条：由设置「显示角色的体力与压力」控制，默认不显示。
    const npcStaminaShown = () => settings().npcBars === true;

    // 扫生效楼的变动记录：起始关系变动的备注与吃醋记录（旧档修复用，只读）。
    function legacyStartInfo() {
        const notes = {};
        const jealous = new Set();
        for (const [messageId, swipeId] of ledger.active) {
            const entry = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
            for (const c of (entry && entry.changes) || []) {
                if (!c || !c.target || c.target === PROTAGONIST) continue;
                if (typeof c.note === 'string' && c.note.startsWith('起始关系·')) notes[c.target] = c.note;
                else if (c.note === '吃醋') jealous.add(String(c.target));
            }
        }
        return { notes, jealous: [...jealous] };
    }

    function manualOfFloor(messageId) {
        for (const entry of ledger.entries.values()) if (entry.messageId === messageId && entry.meta && entry.meta.manual) return entry.meta.manual;
        return null;
    }

    // 角色改名（路人揭晓真名）：账本各楼状态、变动记录、手改记录与聊天级目录一并换名；旧名记进改名表，之后正文写旧名仍记到此人身上。
    // 新名已有档案时须带 merge：两份并成一人。存档按差分链重写受影响的楼层记录。
    function renamePerson(from, rawTo, merge) {
        if (generating) return { ok: false, reason: 'stats-generating' };
        const to = String(rawTo || '').trim();
        if (!knownPerson(from)) return { ok: false, reason: 'stats-relation-missing' };
        if (to === from) return { ok: true, cancelled: true };
        if (!validPersonName(to)) return { ok: false, reason: 'stats-rename-invalid' };
        if (to === PROTAGONIST || isHero(to)) return { ok: false, reason: 'stats-rename-hero' };
        const exists = knownPerson(to);
        if (exists && !merge) return { ok: false, reason: 'stats-rename-exists' };
        const records = rewriteLedgerPeople({ state: (s) => renameInState(s, from, to), rows: (r) => renameChangeRows(r, from, to), meta: (m) => renameFloorMeta(m, from, to) });
        catalog = sanitizeCatalog(renameCatalog(catalog, from, to));
        persist(records);
        onChange(currentStatsState(ledger), null);
        push();
        return { ok: true, merged: exists };
    }

    // 改名与删除共用：把账本里每楼的状态、变动记录、手改记录按给定函数重写，返回需要补写的存档记录（差分链随之改接）。
    function rewriteLedgerPeople({ state: mapState, rows: mapRows, meta: mapMeta }) {
        const memo = new Map();
        const moved = (state) => { if (!memo.has(state)) memo.set(state, mapState(state)); return memo.get(state); };
        const chat = messages(ctx());
        const records = [];
        const idMap = new Map();
        const initial = moved(ledger.initial);
        if (initial !== ledger.initial) { ledger.initial = initial; records.push(initRecord(initial, { createdAt: Date.now() })); }
        const ordered = [...ledger.entries.entries()].sort((a, b) => a[1].messageId - b[1].messageId || a[1].swipeId - b[1].swipeId);
        for (const [key, entry] of ordered) {
            const next = { ...entry, before: moved(entry.before), after: moved(entry.after), changes: mapRows(entry.changes), meta: mapMeta(entry.meta) };
            const baseId = entry.baseId != null && idMap.has(entry.baseId) ? idMap.get(entry.baseId) : entry.baseId ?? null;
            const text = swipeTextOf(chat, entry.messageId, entry.swipeId);
            if (text !== null && entry.recordId) {
                const record = floorRecord({ messageId: entry.messageId, swipeId: entry.swipeId, tagHash: statTagHash(text), baseId, seed: entry.seed, before: next.before, after: next.after, changes: next.changes, meta: next.meta, createdAt: Date.now() });
                if (record.id !== entry.recordId) { records.push(record); idMap.set(entry.recordId, record.id); next.recordId = record.id; }
            }
            next.baseId = baseId;
            ledger.entries.set(key, next);
        }
        ledger.log = mapRows(ledger.log);
        return records;
    }

    // 删除其他角色：账本、手改记录与聊天级目录里这个人的数据一并去掉。之后正文若再用标签写到此名，会重新建档。
    function removePerson(name) {
        if (generating) return { ok: false, reason: 'stats-generating' };
        if (!knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        if (name === PROTAGONIST || isHero(name)) return { ok: false, reason: 'stats-rename-hero' };
        const records = rewriteLedgerPeople({ state: (s) => removeInState(s, name), rows: (r) => removeChangeRows(r, name), meta: (m) => removeFloorMeta(m, name) });
        catalog = sanitizeCatalog(removeFromCatalog(catalog, name));
        persist(records);
        onChange(currentStatsState(ledger), null);
        push();
        return { ok: true };
    }

    // 移除曾用名：之后正文再写这个名字不再记到现用名身上，已结算的楼不变。
    function dropAlias(alias) {
        if (!Object.hasOwn(catalog.renames, alias)) return { ok: true, cancelled: true };
        const { [alias]: gone, ...renames } = catalog.renames;
        catalog = sanitizeCatalog({ ...catalog, renames });
        persist();
        return { ok: true };
    }

    // 手改关系数值：写进最近一楼的结算结果，并记在该楼 meta.manual 上，之后重算或重 roll 这一楼仍保留。
    function relationOp(op, name, payload = {}) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        if (op === 'fill-start') return fillStartRelations();
        if (op === 'fill-traits') return runInitialTraits({ manual: true });
        if (op === 'import-table') return importTablePeople();
        if (op === 'forced') return setIntimacyForced(name, payload && payload.forced === true);
        if (op === 'trait') return setTrait(name, payload && payload.key, payload && payload.on === true);
        if (op === 'trait-id') return setTraitById(name, payload && payload.id, payload && payload.on === true);
        if (op === 'aptitude') return setAptitude(name, payload && payload.level);
        if (op === 'rename') return renamePerson(name, payload && payload.to, payload && payload.merge === true);
        if (op === 'rename-drop') return dropAlias(name);
        if (op === 'remove') return removePerson(name);
        if (op === 'note') return setHeroNote(name, payload && payload.text);
        if (op === 'note-prompt') return heroNotePrompt(name);
        if (op === 'hero-prompt') return heroNotePrompt(name, true);
        if (op === 'trait-note') return setTraitNote(name, payload && payload.text);
        if (op === 'set-worlds') return setWorlds(payload && payload.worlds);
        if (op === 'money-config-read') return readCurrencyConfig();
        if (op === 'money-config') return setCurrencyConfig(payload);
        if (op === 'expenses-read') return { ok: true, expenses: catalog.expenses.map((e) => ({ ...e })) };
        if (op === 'expenses-set') { catalog = sanitizeCatalog({ ...catalog, expenses: payload && payload.expenses }); persist(); return { ok: true }; }
        if (op === 'money-set') return setMoneyBalance(name, payload && payload.value);
        if (op === 'address-set') return setAddress(name, payload || {});
        if (op.startsWith('status-') || op.startsWith('cycle-')) return statusEditOp(op, name, payload || {});
        if (op === 'fame-context') {
            const entry = ledger ? activeEntryBefore(ledger, Infinity) : null;
            const chars = ledger ? Object.keys((entry ? entry.after : ledger.initial).characters || {}) : [];
            return { ok: true, people: [...new Set([...chars, ...Object.keys(catalog.sheets || {})])], names: catalog.fameBars.map((b) => b.name) };
        }
        if (op === 'fame-add') return addFameBar(payload || {});
        if (op === 'fame-fill') return fameFill(payload && payload.sentence);
        if (op === 'fame-draft') { const bar = payload && payload.template ? fameTemplateBar(payload.template, null, payload.owner || '主角') : catalog.fameBars.find((b) => b.name === name); return bar ? { ok: true, draft: fameDraftText(bar) } : { ok: false, reason: 'stats-fame-kind' }; }
        if (op === 'fame-remove') return removeFameBar(name);
        if (op !== 'set' && op !== 'set-hero') return { ok: false, reason: 'stats-relation-op-unknown' };
        if (generating) return { ok: false, reason: 'stats-generating' };
        const entry = activeEntryBefore(ledger, Infinity);
        if (!(entry ? entry.after : ledger.initial).characters[name]) return { ok: false, reason: 'stats-relation-missing' };
        const dims = {};
        for (const key of MANUAL_DIMS) {
            const v = Number(payload[key]);
            if (Object.hasOwn(payload, key) && (!Number.isInteger(v) || v < -100 || v > 100)) return { ok: false, reason: 'stats-relation-invalid' };
            if (Object.hasOwn(payload, key)) dims[key] = v;
        }
        if (!Object.keys(dims).length) return { ok: true, cancelled: true };
        const manual = { [name]: op === 'set-hero' ? { hero: dims } : dims };
        return entry ? commitManualRelations(entry, manual) : commitInitialRelations(manual);
    }

    // 亲密门槛豁免（剧情需要）：记在聊天级目录里，与楼层无关，swipe、删楼不丢。
    function setIntimacyForced(name, on) {
        const entry = activeEntryBefore(ledger, Infinity);
        if (!(entry ? entry.after : ledger.initial).characters[name]) return { ok: false, reason: 'stats-relation-missing' };
        catalog = sanitizeCatalog({ ...applyTraitChange(null, catalog, name, 'forced', on, 'manual').catalog, intimacyForced: [] });
        persist();
        push();
        return { ok: true };
    }

    // 角色标记勾选（随身、无实体、亲人）、悟性档、「我对TA」备注：都记在聊天级目录里，写法同亲密门槛豁免。
    const knownPerson = (name) => {
        const entry = activeEntryBefore(ledger, Infinity);
        return Boolean(name && ((entry ? entry.after : ledger.initial).characters[name] || catalog.sheets[name]));
    };

    function setTrait(name, key, on) {
        if (!TRAIT_KEYS.includes(key)) return { ok: false, reason: 'stats-relation-op-unknown' };
        if (!(key === 'fragile' && name === PROTAGONIST) && !knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        const changed = applyTraitChange(null, catalog, name, key, on, 'manual');
        if (changed.reason && changed.reason !== 'absent') return { ok: false, reason: 'stats-relation-op-unknown' };
        catalog = sanitizeCatalog({ ...changed.catalog, intimacyForced: [] });
        persist();
        push();
        return { ok: true };
    }

    // 角色卡胶囊：按登记表键挂上、摘下（来源手动）；被拒绝（满格、互斥受保护等）时返回原因，目录不变。
    function setTraitById(name, id, on) {
        if (!getTraitDef(id)) return { ok: false, reason: 'stats-relation-op-unknown' };
        if (name !== PROTAGONIST && !knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        const changed = applyTraitChange(null, catalog, name, id, on, 'manual');
        if (changed.reason && changed.reason !== 'absent') return { ok: false, reason: changed.reason === 'full' || changed.reason === 'achieve-full' ? 'stats-trait-full' : 'stats-trait-refused' };
        const prevCatalog = catalog;
        catalog = sanitizeCatalog({ ...changed.catalog, intimacyForced: [] });
        const after = activeEntryBefore(ledger, Infinity);
        const nowState = after ? after.after : ledger.initial;
        announceTraits(changed.notices, refreshAllCombos(nowState, prevCatalog, nowState));
        lightGlobalCodex(nowState);
        persist();
        push();
        return { ok: true };
    }

    // 主角的悟性键为「主角」；平庸即删除记录。
    function setAptitude(name, level) {
        if (name !== PROTAGONIST && !knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        catalog = sanitizeCatalog(withAptitude(catalog, name, APTITUDE_LEVELS.includes(level) ? level : '平庸', 'manual'));
        persist();
        return { ok: true };
    }

    function setHeroNote(name, text) {
        if (!knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        const next = { ...catalog.heroNotes, [name]: String(text || '').trim() };
        catalog = sanitizeCatalog({ ...catalog, heroNotes: next });
        persist();
        return { ok: true, text: catalog.heroNotes[name] || '' };
    }

    // 题材（E5）：手动多选优先，否则取副模型判定；为空表示不过滤。setWorlds(list) 设手动覆盖（空数组清除，回到自动）。
    function worldsNow() { return (catalog.worldsManual && catalog.worldsManual.length ? catalog.worldsManual : catalog.worlds) || []; }
    function storeWorlds(list) {
        if (!Array.isArray(list) || !list.length || JSON.stringify(list) === JSON.stringify(catalog.worlds)) return;
        catalog = sanitizeCatalog({ ...catalog, worlds: list });
        if (!generationStage) persist();
    }
    function readCurrencyConfig() {
        ensureLoaded(true);
        const alive = currencyLease();
        return queueCurrency(async () => {
            if (!alive()) return { ok: false, stage: 'edit', reason: 'stats-chat-not-enabled' };
            const recovered = await recoverCurrencyWrites(alive);
            if (!recovered.ok) { if (alive()) settleCurrencyNotice(recovered); return recovered; }
            const state = currencyEditor.read(alive);
            if (!state.ok) return state;
            if (!currency?.seeded) return { ok: false, stage: 'edit', reason: 'stats-currency-unset' };
            return { ok: true, config: { name: currency.name, table: { ...currency.table }, rate: currency.rate }, base: currencyEditor.baseOf(state) };
        });
    }

    function setCurrencyConfig(payload) {
        const input = normalizeCurrencyEditInput(payload);
        if (!input) return { ok: false, stage: 'edit', reason: 'stats-currency-config-invalid' };
        if (generating) return { ok: false, stage: 'edit', reason: 'stats-generating' };
        if (currencyEditJob) return { ok: false, stage: 'edit', reason: 'busy' };
        const alive = currencyLease();
        const job = { alive, promise: null };
        currencyEditJob = job;
        currencyChanged();
        job.promise = queueCurrency(async () => {
            if (!alive()) return { ok: false, reason: 'request-stale' };
            const recovered = await recoverCurrencyWrites(alive);
            if (!recovered.ok) return recovered;
            const edited = await currencyEditor.start(input, alive);
            return edited.ok && !edited.cancelled ? confirmCurrencyBalance(alive) : edited;
        }).then(result => {
            if (!alive()) return { ok: false, reason: 'request-stale' };
            if (currencyEditJob === job) currencyEditJob = null;
            if (!result.cancelled) settleCurrencyNotice(result);
            currencyChanged();
            if (result.ok && !result.cancelled) push();
            return result;
        }).finally(() => { if (currencyEditJob === job) currencyEditJob = null; });
        return job.promise;
    }
    // 手改金钱余额：主角改的是剧情货币，按填入的新余额直接写物品表（等同在表里改数量，不随楼层回退）；其他角色改各自的数值侧金钱并记一条手动修改。
    function setMoneyBalance(name, value) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        if (generating) return { ok: false, reason: 'stats-generating' };
        // 只收非负整数；空值与 null 不当作 0。
        const v = typeof value === 'number' ? value : NaN;
        if (!Number.isSafeInteger(v) || v < 0) return { ok: false, reason: 'stats-relation-invalid' };
        const who = name || PROTAGONIST;
        if (who === PROTAGONIST) return setCurrencyBalance(v);
        const entry = activeEntryBefore(ledger, Infinity);
        const state = entry ? entry.after : ledger.initial;
        if (!state.characters[who]) return { ok: false, reason: 'stats-relation-missing' };
        if (v === (Number((state.characters[who].bars || {}).money) || 0)) return { ok: true, cancelled: true };
        const manual = { [who]: { bars: { money: v } } };
        return entry ? commitManualRelations(entry, manual) : commitInitialRelations(manual);
    }
    // 主角的剧情货币余额：先补完未落账的楼层写入，再按「当前余额 → 新余额」写物品表。
    function setCurrencyBalance(value) {
        const alive = currencyLease();
        return queueCurrency(async () => {
            if (!alive()) return { ok: false, reason: 'stats-chat-not-enabled' };
            if (!currency?.seeded) return { ok: false, reason: 'stats-currency-unset' };
            const recovered = await recoverCurrencyWrites(alive);
            if (!recovered.ok) return recovered;
            const read = readCurrency();
            if (!read.ok) return read;
            if (read.balance === value) return { ok: true, cancelled: true };
            const written = await applyCurrencyDelta(currency, { before: read.balance, after: value }, alive);
            if (!written.ok) { currencyFailed(currency, written.reason); return written; }
            onChange(currentStatsState(ledger), null);
            push();
            return { ok: true };
        });
    }
    // 手改称呼：payload = { private?, public? }，空串删除；走手动修改通道并留记录。
    function setAddress(name, payload) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        if (generating) return { ok: false, reason: 'stats-generating' };
        const entry = activeEntryBefore(ledger, Infinity);
        const state = entry ? entry.after : ledger.initial;
        if (!name || !state.characters[name]) return { ok: false, reason: 'stats-relation-missing' };
        const address = {};
        for (const key of ['private', 'public']) if (typeof payload[key] === 'string') address[key] = payload[key];
        const manual = { [name]: { address } };
        return entry ? commitManualRelations(entry, manual) : commitInitialRelations(manual);
    }
    function setWorlds(list) {
        catalog = sanitizeCatalog({ ...catalog, worldsManual: Array.isArray(list) ? list : [] });
        persist();
        return { ok: true, worlds: worldsNow() };
    }
    // 角色卡「编辑」里的状态与周期：手动改过的写 src:'manual'、manualLock:true；注入开关只动该条的 inject 字段。
    function statusEditOp(op, name, payload) {
        if (name !== PROTAGONIST && !knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        const day = Number(currentStatsState(ledger).clock && currentStatsState(ledger).clock.day) || 0;
        const floor = Math.max(0, messages(ctx()).length - 1);
        const key = String(payload.key || payload.id || '');
        let next = null;
        if (op === 'status-add' || op === 'status-drop') {
            const r = applyStatusChange(catalog, name, key, { on: op === 'status-add', src: 'manual', days: payload.days, toward: payload.toward, day, floor });
            if (r.reason && r.reason !== 'absent') return { ok: false, reason: 'stats-status-refused' };
            next = r.catalog;
        } else if (op === 'status-days') {
            const own = statusesOf(catalog, name)[key];
            const days = Math.round(Number(payload.days));
            if (!own || !(days >= 1 && days <= 3650)) return { ok: false, reason: 'stats-status-refused' };
            next = { ...catalog, statuses: { ...catalog.statuses, [name]: { ...catalog.statuses[name], [key]: { ...own, until: day + days, src: 'manual', manualLock: true } } } };
        } else if (op === 'status-inject') {
            const own = statusesOf(catalog, name)[key];
            if (!own) return { ok: false, reason: 'stats-status-refused' };
            const { inject, ...rest } = own;
            next = { ...catalog, statuses: { ...catalog.statuses, [name]: { ...catalog.statuses[name], [key]: payload.on === true ? { ...rest, manualLock: true } : { ...rest, inject: false, manualLock: true } } } };
        } else if (op === 'cycle-set') {
            next = setCycle(catalog, name, key, { period: payload.period, length: payload.length, last: payload.last, on: true });
        } else if (op === 'cycle-start') {
            next = startCycleToday(catalog, name, key, day, { floor }).catalog;
        } else return { ok: false, reason: 'stats-relation-op-unknown' };
        catalog = sanitizeCatalog(next);
        persist();
        push();
        return { ok: true };
    }
    // 特质「评定注意」：用户自写，只用于特质评定，不进正文提示词。
    function setTraitNote(name, text) {
        if (name !== PROTAGONIST && !knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        catalog = sanitizeCatalog({ ...catalog, traitNotes: { ...catalog.traitNotes, [name]: String(text || '').trim() } });
        persist();
        return { ok: true, text: catalog.traitNotes[name] || '' };
    }

    // 声望条（聊天级，最多 FAME_BAR_MAX 条）：开条与改条都走确认过的草稿文本（模板、一句话补全、已有条各自生成）；replace 为被改条的条名（条名不变，数值按条名记）。
    // 关条只从目录移除，已记的数值留在存档里，重开同名条时接着用。
    function addFameBar({ draft, replace = '' }) {
        const parsed = parseFameDraft(draft);
        if (!parsed.ok) return { ok: false, reason: 'stats-fame-draft', field: parsed.field };
        const bar = replace ? { ...parsed.bar, name: replace } : parsed.bar;
        if (replace ? !catalog.fameBars.some((b) => b.name === replace) : catalog.fameBars.some((b) => b.name === bar.name)) return { ok: false, reason: replace ? 'stats-fame-missing' : 'stats-fame-dup' };
        if (!replace && catalog.fameBars.length >= FAME_BAR_MAX) return { ok: false, reason: 'stats-fame-max' };
        catalog = sanitizeCatalog({ ...catalog, fameBars: replace ? catalog.fameBars.map((b) => (b.name === replace ? bar : b)) : [...catalog.fameBars, bar] });
        persist();
        push();
        return { ok: true };
    }

    // 一句话补全声望：副模型读该句与世界书，返回待确认的草稿文本（不建条）；返回不合格 JSON 时给出原因。
    async function fameFill(sentence) {
        const text = String(sentence || '').trim().slice(0, 100);
        if (!text) return { ok: false, reason: 'stats-fame-sentence' };
        const request = requester();
        if (!request) return { ok: false, reason: 'stats-no-model' };
        return generationTasks.start('fame-fill', async job => {
        job.revision = JSON.stringify(catalog);
        let people = [];
        try { people = typeof describePeople === 'function' ? await describePeople([text]) : []; } catch (error) { people = []; }
        checkGeneration(job);
        try {
            const reply = await ask(request, buildFameFillPrompt(text, { worldview: worldviewOf(), people }), BACKGROUND_TIMEOUT_MS, job);
            checkGeneration(job);
            const parsed = parseFameFill(reply && typeof reply === 'object' ? reply.text : reply);
            if (!parsed.ok) return { ok: false, reason: 'stats-fame-fill-bad', field: parsed.field };
            return { ok: true, draft: fameDraftText(parsed.bar) };
        } catch (error) { job.check(); if (error?.stage) throw error; return { ok: false, reason: error?.reason || 'stats-fame-fill-failed' }; }
        });
    }

    function removeFameBar(name) {
        if (!catalog.fameBars.some((b) => b.name === name)) return { ok: true, skipped: true };
        catalog = sanitizeCatalog({ ...catalog, fameBars: catalog.fameBars.filter((b) => b.name !== name) });
        persist();
        push();
        return { ok: true };
    }

    // 状态栏主角区的声望条：设置「状态栏显示声望」开着且本聊天开了声望才出；「显示细项」决定汇总一行还是逐条。
    const heroFameMetrics = (s) => (s.hudFame && catalog.fameBars.length ? fameHudMetrics(currentStatsState(ledger), catalog.fameBars, { detail: s.hudFameDetail === true }) : []);

    // 「按剧情拟写」的请求内容：最近若干楼正文（去掉数值标签与网页标签），由设置页交给副模型。
    function heroNotePrompt(name, estimate = false) {
        if (!knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        const hero = userName() || PROTAGONIST;
        const lines = messages(ctx()).filter((m) => m && !m.is_system && typeof m.mes === 'string').slice(-HERO_NOTE_FLOORS)
            .map((m) => `${m.is_user ? hero : (m.name || '旁白')}：${m.mes.replace(/\[igs-[^\]]*\]/g, '').replace(/<[^>]+>/g, '').trim()}`)
            .filter((line) => line.length > 2);
        if (!lines.length) return { ok: false, reason: 'stats-note-no-text' };
        const user = lines.join('\n');
        const system = `根据下面的剧情正文，用一句话写出${hero}（主角）对${name}的态度，以及两人之间已经发生的事。只写正文里明确出现的内容，不推测，不按身份套路补写。不超过四十字，只输出这句话。`;
        if (!estimate) return { ok: true, system, user };
        const desire = isNsfw() ? '、欲望' : '';
        return { ok: true, user, system: `根据下面的剧情正文，估算${hero}（主角）对${name}的态度。只依据正文里明确写出的主角心理、选择与言行，不推测，不按身份套路补写，看不出的项填0。好感、信任、了解取-100到100的整数，芥蒂${desire}取0到100的整数。好感的参考：0为无感，1到25为初步好感，26到50为明确喜欢，51到75为强烈在意，76以上为深爱，负数为反感。只输出一行，格式为：好感=数值，信任=数值，了解=数值，芥蒂=数值${desire ? '，欲望=数值' : ''}` };
    }

    // 演出层 romance 第 3 栏出现过的对象：names 为候选写法（场景素材键、原文），取已登记的那个；都未登记时记第一个。去重后存聊天级目录。
    function noteRomanceSeen(names) {
        if (!active()) return { ok: false, reason: 'stats-inactive' };
        const list = (Array.isArray(names) ? names : [names]).map((n) => String(n || '').trim()).filter((n) => n && !isHero(n));
        if (!list.length) return { ok: true, skipped: true };
        const known = currentStatsState(ledger).characters;
        const name = list.find((n) => known[n]) || list[0];
        if (catalog.romanceSeen.includes(name)) return { ok: true, skipped: true };
        if (settings().heroFeelings === true && known[name] && (Number(heroDimsOf(known[name], { nsfw: isNsfw() }).好感) || 0) <= 25) return { ok: true, skipped: true };
        catalog = sanitizeCatalog({ ...catalog, romanceSeen: [...catalog.romanceSeen, name] });
        persist();
        return { ok: true };
    }

    // 把数据库表格与开场卡名单里尚未登记的人物写入数值账本（不递归调用 detectNewCharacters）。
    function syncTablePeopleIntoLedger() {
        if (!ledger || generating) return { ok: false, reason: !ledger ? 'stats-no-ledger' : 'stats-generating' };
        const entry = activeEntryBefore(ledger, Infinity);
        const known = entry ? entry.after.characters : ledger.initial.characters;
        const fresh = [...new Set([...tableNames({ fresh: true }), ...rosterNames()])].filter((name) => !known[name] && !Object.hasOwn(catalog.renames, name));
        if (!fresh.length) return { ok: false, reason: 'stats-table-none' };
        const manual = Object.fromEntries(fresh.map((name) => [name, {}]));
        const result = entry ? commitManualRelations(entry, manual) : commitInitialRelations(manual);
        if (!result.ok) return result;
        return { ok: true, imported: fresh };
    }

    // 把数据库表格里的人物登记进数值账本：关系一律从 0 起，表格里的数字不采用（以 IGS 为准）。
    // 记在最近一楼的 meta.manual 上（空对象只建档不改值），重算本楼也保留。
    function importTablePeople() {
        const result = syncTablePeopleIntoLedger();
        if (!result.ok) return result;
        detectNewCharacters();
        return result;
    }

    // 按人设补填起始关系：只处理好感、信任、了解都还在 ±START_FILL_SPAN 以内的已登记角色（视为没定过初值）。
    // 辅助模型只给关系档，初值查 START_DIMS 后叠加到当前值上，开局以来的小幅涨跌保留；判为「陌生」的不改。
    function fillStartRelations() {
        const running = generationTasks.get('start-relations');
        if (running) return running.promise;
        const recovery = pendingGenerationSave();
        if (recovery) return recovery;
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive' });
        if (generating) return Promise.resolve({ ok: false, reason: 'stats-generating' });
        // 表格里有、账本还没有的人物先登记，补填时一并算上。
        importTablePeople();
        const entry = activeEntryBefore(ledger, Infinity);
        // 数值在小范围内但剧情里已有过关系变动的角色不算空白，避免在已有进展上再叠一次初值。
        const touched = () => {
            const names = new Set();
            for (const [messageId, swipeId] of ledger.active) {
                const e = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
                for (const c of (e && e.changes) || []) {
                    if (c && c.target && (START_FILL_DIMS.includes(c.key) || (typeof c.note === 'string' && c.note.startsWith('起始关系·')))) names.add(String(c.target));
                }
            }
            return names;
        };
        const moved = touched();
        const blank = (c, name) => !moved.has(name) && START_FILL_DIMS.every((key) => Math.abs(Number(c.dims && c.dims[key]) || 0) <= START_FILL_SPAN);
        const pending = Object.entries((entry ? entry.after : ledger.initial).characters).filter(([name, c]) => !isHero(name) && blank(c, name)).map(([name]) => name);
        if (!pending.length) return Promise.resolve({ ok: false, reason: 'stats-start-none' });
        const request = requester();
        if (!request) return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        const chatId = chatIdOf(ctx());
        // 每次只补一批（每人资料最多 3000 字）；本聊天已问过的（判为陌生的仍是空白）排到后面，再点一次补下一批。
        if (startAsked.chatId !== chatId) { startAsked.chatId = chatId; startAsked.names = new Set(); }
        const ordered = [...pending.filter((n) => !startAsked.names.has(n)), ...pending.filter((n) => startAsked.names.has(n))];
        const names = ordered.slice(0, SHEET_BATCH_MAX);
        const left = pending.filter((n) => !startAsked.names.has(n) && !names.includes(n)).length;
        const run = async job => {
            const relations = {};
            const mods = {};
            let failDetail = '';
            // 主角资料（用户人设）只取一次，每批都带上。
            let hero = '';
            try { if (typeof describePeople === 'function') { const h = (await describeWithHero([PROTAGONIST]))[0] || {}; hero = String((h.own ?? h.summary) || ''); } }
            catch (error) { hero = ''; }
            job.check();
            let plot = '';
            try { plot = String(plotSetting() || ''); } catch (error) { plot = ''; }
            for (let i = 0; i < names.length; i += SHEET_BATCH_MAX) {
                const batch = names.slice(i, i + SHEET_BATCH_MAX);
                let people;
                try { people = typeof describePeople === 'function' ? await describePeople(batch) : batch.map((n) => ({ name: n, summary: '' })); }
                catch (error) { people = batch.map((n) => ({ name: n, summary: '' })); }
                job.check();
                const prompt = buildStartRelationRequest(people, { prompt: settings().prompts.startRelations, hero, plot });
                let parsed = null;
                try { parsed = parseStartRelationReply(await ask(request, prompt, START_TIMEOUT_MS, job), { names: batch }); }
                catch (error) { job.check(); if (error?.stage) throw error; parsed = { ok: false, reason: 'stats-start-request-failed', detail: String(error?.message || error).slice(0, 120) }; }
                job.check();
                if (parsed?.reason === 'stats-start-empty') parsed.detail = `模型回复的角色：${(parsed.keys || []).join('、') || '无'}；本批角色：${batch.join('、')}`;
                if (parsed && parsed.ok) {
                    Object.assign(relations, parsed.relations);
                    Object.assign(mods, parsed.mods || {});
                    for (const n of batch) startAsked.names.add(n);
                } else { diag(parsed ? parsed.reason : 'stats-start-request-failed', parsed && parsed.detail ? { detail: parsed.detail } : { names: batch.join('、') }); failDetail = (parsed && parsed.detail) || failDetail; }
            }
            job.check();
            if (generating) return { ok: false, reason: 'stats-generating' };
            if (!Object.keys(relations).length) return { ok: false, reason: 'stats-start-failed', detail: failDetail };
            // 等回复期间可能又结算了新楼，按最新一楼重新取当前值。
            const latest = activeEntryBefore(ledger, Infinity);
            for (const n of touched()) moved.add(n);
            const manual = {};
            for (const [name, tier] of Object.entries(relations)) {
                const cur = (latest ? latest.after : ledger.initial).characters[name];
                const fix = startFixOffsets(mods[name]);
                if (!cur || !blank(cur, name) || (tier === '陌生' && !Object.keys(fix).length)) continue;
                const dims = {};
                for (const key of START_FILL_DIMS) dims[key] = Math.max(-100, Math.min(100, (Number(cur.dims[key]) || 0) + (START_DIMS[tier][key] || 0) + (fix[key] || 0)));
                if (fix.芥蒂) dims.芥蒂 = Math.max(-100, Math.min(100, (Number(cur.dims.芥蒂) || 0) + fix.芥蒂));
                if (isNsfw() && START_DIMS[tier].欲望) dims.欲望 = Math.max(0, Math.min(100, (Number(cur.dims.欲望) || 0) + START_DIMS[tier].欲望));
                if (tier === '恋人') dims.romance = true;
                manual[name] = dims;
            }
            const label = (name) => [relations[name], ...(mods[name] || [])].join('+');
            const filled = Object.keys(manual).map((name) => `${name} ${label(name)}`);
            if (!filled.length) return { ok: true, filled: [], relations, left };
            const result = await (latest ? commitManualRelations(latest, manual, (name) => `起始关系·${label(name)}`, job)
                : commitInitialRelations(manual, job));
            return result.ok ? { ok: true, filled, relations, left } : result;
        };
        setNotice('start-relations', { kind: 'busy', text: `正在按人设计算初始关系：${names.join('、')}` });
        return generationTasks.start('start-relations', async job => {
            job.onFinish(() => {
                if (job.alive() && notices.get('start-relations')?.kind === 'busy') setNotice('start-relations', null);
            });
            await tail;
            job.check();
            const result = await run(job);
            job.check();
            const more = result && result.ok && result.left ? `；还有 ${result.left} 个角色，再点一次继续` : '';
            setNotice('start-relations', result && result.ok && (result.filled.length || more) ? { kind: 'info', text: `${result.filled.length ? `已补填初始关系：${result.filled.join('、')}` : '本批没有需要改动的角色'}${more}`, ttl: true } : null);
            return result;
        });
    }

    // 把 manual（{ 角色: { 好感, 信任, 了解 } }）写进该楼结算结果并记到 meta.manual，重算或重 roll 这一楼仍保留。
    function commitManualRelations(entry, manual, noteOf = null, task = null) {
        if (task) return stageGeneration(task, () => {
            const stagedEntry = ledger.entries.get(ledgerKey(ledger, entry.messageId, entry.swipeId));
            if (!stagedEntry || stagedEntry.recordId !== entry.recordId) throw Object.assign(new Error('stats-generation-conflict'), { reason: 'stats-generation-conflict' });
            const result = commitManualRelations(stagedEntry, manual, noteOf);
            return { extra: generationStage.extra || [], result };
        });
        const changes = [];
        const after = applyManualRelations(entry.after, manual, changes, { nsfw: isNsfw() });
        if (after === entry.after) return { ok: true };
        if (noteOf) for (const row of changes) row.note = noteOf(row.target) || row.note;
        const prev = (entry.meta && entry.meta.manual) || {};
        const merged = { ...prev };
        for (const [name, dims] of Object.entries(manual)) {
            merged[name] = { ...(prev[name] || {}), ...dims };
            if (dims && dims.bars) merged[name].bars = { ...((prev[name] && prev[name].bars) || {}), ...dims.bars };
            if (dims && dims.hero) merged[name].hero = { ...((prev[name] && prev[name].hero) || {}), ...dims.hero };
            if (dims && dims.address) merged[name].address = { ...((prev[name] && prev[name].address) || {}), ...dims.address };
        }
        const meta = { ...(entry.meta || {}), manual: merged };
        const m = messages(ctx())[entry.messageId];
        if (!m) return { ok: false, reason: 'stats-relation-missing' };
        const all = [...entry.changes, ...changes];
        const record = floorRecord({ messageId: entry.messageId, swipeId: entry.swipeId, tagHash: statTagHash(String(m.mes ?? '')), baseId: entry.baseId ?? null, seed: entry.seed, before: entry.before, after, changes: all, meta, createdAt: Date.now() });
        const key = ledgerKey(ledger, entry.messageId, entry.swipeId);
        ledger.entries.set(key, { ...entry, after, meta, changes: all, recordId: record.id });
        ledger.log = ledger.log.concat(changes.map((row) => ({ floor: key, ...row }))).slice(-STATS_LOG_MAX);
        if (generationStage) { generationStage.extra = [record]; push(); return { ok: true }; }
        persist([record]);
        onChange(currentStatsState(ledger), null);
        push();
        return { ok: true };
    }

    // 还没有结算楼层时，改动写进初始状态并重存 init 记录，之后各楼都从这里往下结算。
    function commitInitialRelations(manual, task = null) {
        if (task) return stageGeneration(task, () => {
            const result = commitInitialRelations(manual);
            return { extra: generationStage.extra || [], result };
        });
        const next = applyManualRelations(ledger.initial, manual, [], { nsfw: isNsfw() });
        if (next === ledger.initial) return { ok: true };
        ledger.initial = next;
        if (generationStage) { generationStage.extra = [initRecord(next, { createdAt: Date.now() })]; push(); return { ok: true }; }
        persist([initRecord(next, { createdAt: Date.now() })]);
        onChange(currentStatsState(ledger), null);
        push();
        return { ok: true };
    }

    // 删除角色卡：卡与它取代的手改底数在同一次数值日志提交里，读回确认后才发布；中断后由原保存意图恢复同一批记录。
    function removeSheet(name) {
        ensureLoaded(true);
        if (unavailable || blocked) return Promise.resolve({ ok: false, reason: unavailable || blocked });
        const held = generationSave.pending();
        if (!held.ok || held.intent) return Promise.resolve(held.ok ? { ok: false, reason: 'stats-generation-save-pending' } : held);
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive' });
        return generationTasks.start(`sheet-remove:${name}`, async job => {
            checkGeneration(job);
            const replaced = manualBaseIds([name]);
            if (!replaced.ok) return replaced;
            const source = generationSave.read(null, job.alive);
            if (!source.ok) { generationSaveNotice(source); return source; }
            job.beforeRows = source.rows;
            job.sourceRevision = generationRevision();
            return stageGeneration(job, () => {
                const sheets = { ...catalog.sheets };
                delete sheets[name];
                const sheetDrops = { ...catalog.sheetDrops };
                if (replaced.ids[name]) sheetDrops[name] = replaced.ids[name];
                catalog = { ...catalog, sheets, sheetDrops, notified: catalog.notified.filter((n) => n !== name) };
                return { result: { ok: true, removed: name } };
            });
        });
    }

    function sheetOp(op, name, payload = {}) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        const owner = generationIdentity(), id = chatIdOf(ctx());
        if (op === 'draft') {
            const source = attributes();
            const view = source?.readAbilities?.(name);
            return { ok: true, chatId: id, ownerGeneration: owner?.generation, expectedRevision: view?.revision, reason: source?.reason };
        }
        if (op === 'edit' && payload.chatId !== undefined && (id !== payload.chatId || owner?.generation !== payload.ownerGeneration || payload.signal?.aborted)) return { ok: false, reason: 'request-stale' };
        const sheets = { ...catalog.sheets };
        if (op === 'remove') return removeSheet(name);
        // 重新生成不先删旧卡：成功后整张覆盖并取代发起时已确认的手改，失败时旧卡与手改都保留。
        if (op === 'regen') { ensureLoaded(true); return generateSheets([name], { supersede: true }); }
        if (op === 'edit') {
            const cur = sheets[name] || { rank: '普通人', attributes: {}, skills: {}, signature: [], provisional: {} };
            // 「理智」在注册表里会被映射成智力，属性档要先按原名认。
            const typed = String(payload.skill || '').trim();
            const skill = typed === SAN_ATTRIBUTE ? typed : engineOf().registry.resolve(typed) || typed;
            const tier = String(payload.tier || '').trim();
            const seed = `${chatIdOf(ctx())}|${name}|${skill}`;
            if (BASE_ATTRIBUTES.includes(skill) || skill === SAN_ATTRIBUTE) {
                // 属性：六维收档位词或 1–30 整数，理智收档位词或 1–99 整数；认不出时不改。
                const value = sheetAttributeInput(skill, tier, seed);
                if (value === null) return { ok: false, reason: 'stats-sheet-edit-invalid' };
                if (attributeAccess && skill !== SAN_ATTRIBUTE) {
                    if (isHero(name) || payload.chatId !== id || owner?.generation !== payload.ownerGeneration) return { ok: false, reason: 'request-stale' };
                    const access = attributeAccess(), source = access.source();
                    if (!source.ready) return { ok: false, reason: source.reason };
                    const view = source.readAbilities(name);
                    if (!view || typeof payload.expectedRevision !== 'string' || view.revision !== payload.expectedRevision) return { ok: false, reason: 'stats-attribute-conflict' };
                    const alive = () => loadedChat === id && chatIdOf(ctx()) === id && generationIdentity() === owner && !payload.signal?.aborted;
                    return access.editNpc(name, { ...view.initialScores, [abilityKeyOf(skill)]: value }, {
                        expectedRevision: view.revision, signal: payload.signal, shouldStart: alive,
                    }).then(result => {
                        if (!alive()) return { ok: false, reason: 'request-stale' };
                        if (result.ok) { gateMemo = null; onChange(currentStatsState(ledger), null); }
                        return result;
                    });
                }
                sheets[name] = skill === SAN_ATTRIBUTE
                    ? { ...cur, san: value, source: 'user' }
                    : { ...cur, attributes: { ...cur.attributes, [skill]: value }, scale: 'score', source: 'user' };
            } else if (skill && Object.hasOwn(SKILL_TIERS, tier)) {
                const skills = { ...cur.skills };
                const v = bandValue(SKILL_TIERS[tier], seed);
                if (v) skills[skill] = v; else delete skills[skill];
                const provisional = { ...(cur.provisional || {}) };
                delete provisional[skill];
                sheets[name] = { ...cur, skills, provisional, source: 'user' };
            } else return { ok: false, reason: 'stats-sheet-edit-invalid' };
            catalog = { ...catalog, sheets };
        } else return { ok: false, reason: 'stats-sheet-op-unknown' };
        persist();
        onChange(currentStatsState(ledger), null);
        return { ok: true };
    }

    // 整理剧情技能：向辅助模型（与角色卡生成同一个 requester / ask 通道）要合并与改名建议，不写入；勾选后由 tidy-apply 写入。
    async function tidySuggest() {
        const request = requester();
        if (!request) return { ok: false, reason: 'stats-no-model' };
        if (generating) return { ok: false, reason: 'stats-generating' };
        const state = currentStatsState(ledger);
        const engine = engineOf();
        const rows = (catalog.story || []).map((s) => ({ name: s.name, attribute: s.attribute, value: Math.round(Number(profileOf(engine, state, PROTAGONIST, s.name).value) || 0) }));
        if (rows.length < 2) return { ok: true, items: [] };
        return generationTasks.start('tidy', async job => {
        job.revision = JSON.stringify(catalog);
        let reply;
        try { reply = await ask(request, buildTidyPrompt(rows), BACKGROUND_TIMEOUT_MS, job); }
        catch (error) { job.check(); if (error?.stage) throw error; diag('stats-tidy-request-failed'); return { ok: false, reason: 'stats-tidy-failed' }; }
        checkGeneration(job);
        return { ok: true, items: parseTidyReply(reply, catalog) };
        });
    }

    function skillOp(op, name, payload = {}) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        if (op === 'tidy-suggest') return tidySuggest();
        if (op === 'tidy-apply') {
            const done = applyTidy(catalog, Array.isArray(payload.items) ? payload.items : []);
            catalog = sanitizeCatalog(done.catalog);
            persist();
            onChange(currentStatsState(ledger), null);
            return { ok: true, applied: done.applied };
        }
        const isStory = (catalog.story || []).some((s) => s.name === name);
        if (op === 'edit' && payload.attribute !== undefined && !isStory) {
            // 内置技能改所属属性：记在 catalog.attributes，注册表读取时覆盖。
            const entry = engineOf().registry.get(name);
            if (!entry || entry.kind !== 'skill' || !BASE_ATTRIBUTES.includes(payload.attribute)) return { ok: false, reason: 'stats-skill-op-unknown' };
            catalog = { ...catalog, attributes: { ...(catalog.attributes || {}), [name]: payload.attribute } };
        }
        else if (op === 'edit') {
            const slots = currentSlots();
            catalog = editStorySkill(catalog, name, payload);
            const renamed = catalog.story.find((x) => x.name === payload.name);
            if (renamed && payload.name !== name && Object.values(slots).includes(name)) catalog = { ...catalog, heroSlots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, v === name ? payload.name : v])) };
        }
        else if (op === 'merge') {
            const slots = currentSlots();
            const to = engineOf().registry.resolve(payload.to) || payload.to;
            catalog = mergeStorySkill(catalog, name, to);
            if (Object.values(slots).includes(name)) catalog = { ...catalog, heroSlots: Object.fromEntries(Object.entries(slots).filter(([, v]) => v !== name || !Object.values(slots).includes(to)).map(([k, v]) => [k, v === name ? to : v])) };
        }
        else if (op === 'remove') {
            // 删除技能：先把主角这项降为未学（不然数值格里还在），剧情技能再从登记表里移除。
            editHeroSkill(name, '未学');
            catalog = removeStorySkill(catalog, name);
        }
        else return { ok: false, reason: 'stats-skill-op-unknown' };
        catalog = sanitizeCatalog(catalog);
        persist();
        onChange(currentStatsState(ledger), null);
        return { ok: true };
    }

    function npcAbilities(name) {
        if (attributeAccess) return readers.readAbilities(name);
        return sheetAbilityScores(catalog.sheets[String(name || '').trim()]);
    }

    async function verifyNpcPolicyWrite(expectedPolicy, expectedChoices, alive) {
        await tail;
        if (!alive()) return { ok: false, reason: 'request-stale' };
        const t = tables();
        if (!t.ok) return { ok: false, reason: t.reason || 'stats-log-read-failed' };
        t.invalidate?.();
        const rows = t.read({ kinds: ['stats'] });
        if (!alive()) return { ok: false, reason: 'request-stale' };
        if (!rows?.ok || !Array.isArray(rows.stats)) return { ok: false, reason: rows?.reason || 'stats-log-read-failed' };
        const restored = mergeStatLog(rows.stats, { chatId: chatIdOf(ctx()), chat: messages(ctx()) });
        const policyOk = restored.npcPolicy === expectedPolicy;
        const choicesOk = JSON.stringify(restored.npcChoices) === JSON.stringify(expectedChoices);
        return policyOk && choicesOk ? { ok: true } : { ok: false, reason: 'stats-npc-policy-save-unverified' };
    }

    // NPC 策略设置（自动 / 逐个）：写当前聊天 DB 并读回确认，失败回滚不假报成功；变更绝不覆盖已有角色卡。
    async function setNpcPolicy(policy) {
        ensureLoaded(true);
        if (unavailable) return { ok: false, reason: unavailable };
        if (blocked) return { ok: false, reason: blocked };
        const normalized = normalizeNpcPolicy(policy);
        if (!normalized) return { ok: false, reason: 'stats-npc-policy-invalid' };
        if (!ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
        const owner = generationIdentity(), chatId = chatIdOf(ctx());
        const alive = () => !disposed && loadedChat === chatId && chatIdOf(ctx()) === chatId && generationIdentity() === owner;
        const prevPolicy = npcPolicy;
        const prevBaseline = new Map(baseline);
        npcPolicy = normalized;
        persist([], { shouldStart: alive });
        const verified = await verifyNpcPolicyWrite(npcPolicy, npcChoices, alive);
        if (!verified.ok) {
            if (alive()) { npcPolicy = prevPolicy; baseline = prevBaseline; }
            try { console.warn('[IGS 数值] NPC 建档策略保存失败：', verified.reason); } catch { /* */ }
            return verified;
        }
        npcPolicy = normalized;
        refreshOnboarding();
        onBuildPolicyChange();
        onChange(currentStatsState(ledger), null);
        detectNewCharacters({ triggerExisting: normalized === 'auto', syncTables: true });
        return { ok: true, npcPolicy };
    }

    // 逐角色决定（generate / defer / null）：按本聊天规范角色键写入 DB 并读回确认，失败回滚；generate 触发单角色生成。
    async function setNpcChoice(name, choice) {
        ensureLoaded(true);
        if (unavailable) return { ok: false, reason: unavailable };
        if (blocked) return { ok: false, reason: blocked };
        if (!ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
        const key = canonName(String(name || '').trim());
        if (!key || key.length > 40 || isHero(key)) return { ok: false, reason: 'stats-npc-choice-invalid' };
        const normalized = choice === null ? null : normalizeNpcChoice(choice);
        if (choice !== null && !normalized) return { ok: false, reason: 'stats-npc-choice-invalid' };
        const owner = generationIdentity(), chatId = chatIdOf(ctx());
        const alive = () => !disposed && loadedChat === chatId && chatIdOf(ctx()) === chatId && generationIdentity() === owner;
        const prevChoices = npcChoices;
        const prevBaseline = new Map(baseline);
        const next = { ...npcChoices };
        if (normalized === null) delete next[key];
        else next[key] = normalized;
        npcChoices = next;
        persist([], { shouldStart: alive });
        const verified = await verifyNpcPolicyWrite(npcPolicy, npcChoices, alive);
        if (!verified.ok) {
            if (alive()) { npcChoices = prevChoices; baseline = prevBaseline; }
            try { console.warn('[IGS 数值] NPC 建档选择保存失败：', verified.reason); } catch { /* */ }
            return verified;
        }
        npcChoices = next;
        refreshOnboarding();
        onBuildPolicyChange();
        onChange(currentStatsState(ledger), null);
        if (normalized === 'generate' && !catalog.sheets[key]) {
            const generated = await generateSheets([key]);
            return { ok: true, choice: normalized, name: key, generation: generated };
        }
        return { ok: true, choice: normalized, name: key };
    }

    function setBuildMode(mode) {
        ensureLoaded(true);
        if (unavailable) return { ok: false, reason: unavailable };
        if (blocked) return { ok: false, reason: blocked };
        const picked = normalizeBuildMode(mode);
        if (!picked) return { ok: false, reason: 'stats-build-mode-invalid' };
        if (ledger) { buildMode = picked; npcPolicy = normalizeNpcPolicy(picked); persist(); refreshOnboarding(); onBuildPolicyChange(); return { ok: true }; }
        if (!chatIdOf(ctx())) return { ok: false, reason: 'stats-no-chat' };
        refreshOnboarding();
        modeDefault = picked;
        modePending = true;
        refreshOnboarding();
        return { ok: true, pending: true };
    }

    function setBuildChoice(name, choice) {
        ensureLoaded(true);
        if (unavailable) return { ok: false, reason: unavailable };
        if (blocked) return { ok: false, reason: blocked };
        const key = canonName(String(name || '').trim());
        if (!key || key.length > 40) return { ok: false, reason: 'stats-build-choice-invalid' };
        if (choice !== null && !BUILD_CHOICES.includes(choice)) return { ok: false, reason: 'stats-build-choice-invalid' };
        if (!ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
        const next = { ...buildChoices };
        const nextNpc = { ...npcChoices };
        if (choice === null) { delete next[key]; delete nextNpc[key]; }
        else { next[key] = choice; nextNpc[key] = normalizeNpcChoice(choice); }
        buildChoices = next;
        npcChoices = nextNpc;
        persist();
        onBuildPolicyChange();
        return { ok: true };
    }

    // 设置页「存档」区用：只用缓存（总开关关闭时不读表），暂停的聊天也显示冻结的数值。
    function archiveModel() {
        ensureLoaded();
        const model = ledger ? statsArchiveModel(ledger, { catalog, engine: withAbilityMemo(dailyEngineOf()), heroSkills: heroSkillNames(), hasBackup: store.read().hasBackup, walletExtra: combatPoints(), currency: currencySnapshot(), isHero, heroName: userName() }) : null;
        const npcRelative = {};
        if (model) {
            const attrSrc = attributes();
            for (const c of model.characters || []) {
                if (catalog.sheets[c.name]) continue;
                const ab = attrSrc?.ready ? attrSrc.readAbilities(c.name, { heroPrefs: heroPrefs() }) : null;
                if (ab && !ab.initialized) npcRelative[c.name] = { source: ab.source || 'relative', initialized: false, scores: { ...ab.scores }, tier: ab.tier };
            }
        }
        return model ? { ...model, heroBio: catalog.heroBio || '', npcPolicy, npcChoices: { ...npcChoices }, npcRelative, expenses: catalog.expenses, needsPick: needsHeroPick(), heroAttrs: heroAttrs(), aptitude: Object.fromEntries(Object.entries(catalog.aptitude).map(([n, v]) => [n, v.v])), traits: traitSwitchModel(catalog.traits), traitList: Object.fromEntries(Object.keys(catalog.traits).map((n) => [n, { items: listTraits(catalog, n), ...slotUsage(catalog, n) }])), traitNsfw: isNsfw(), combatCardOn: combatOn(), statusMap: catalog.statuses || {}, relMap: Object.fromEntries(Object.entries(currentStatsState(ledger).characters || {}).map(([n, c]) => [n, Array.isArray(c.relStates) ? c.relStates : []])), traitAttrs: Object.fromEntries([PROTAGONIST, ...Object.keys(currentStatsState(ledger).characters || {}), ...Object.keys(catalog.sheets || {})].map((n) => [n, gateAttrsOf(n)])), traitCodex: traitCodexStore ? traitCodexStore.get() : null, heroNotes: { ...catalog.heroNotes }, renames: { ...catalog.renames }, heroFeelings: settings().heroFeelings === true, confessed: Object.fromEntries(Object.entries(currentStatsState(ledger).characters || {}).filter(([, c]) => c.confessed === true).map(([n]) => [n, true])), heroDims: Object.fromEntries(Object.entries(currentStatsState(ledger).characters || {}).map(([n, c]) => [n, { ...heroDimsOf(c, { nsfw: isNsfw() }) }])), traitNotes: { ...catalog.traitNotes }, landmineKnown: { ...(catalog.landmineKnown || {}) }, softKnown: { ...(catalog.softKnown || {}) }, fame: fameRows(currentStatsState(ledger), catalog.fameBars), cycleMap: catalog.cycles || {}, statusDay: Number(currentStatsState(ledger).clock && currentStatsState(ledger).clock.day) || 0, worlds: [...(catalog.worlds || [])], worldsManual: [...(catalog.worldsManual || [])] } : null;
    }
    // 对外接口的入口统一包一层 inEvent：同一次调用内战斗开关只取一次。
    const ev = inEvent;
    return {
        sync: ev(sync),
        cocSheet,
        applyCocSheet,
        clearCocSheet,
        setCocMode,
        cocLive,
        cocMode: () => cocModeOf(catalog),
        cocSkillOf,
        npcCocSnapshot,
        npcCocModel,
        applyNpcCoc,
        clearNpcCoc,
        generateNpcCoc,
        importNpcCocText,
        // 只读：调查员快照；没开数值、规则不是 coc7 返回 null，每次全新对象。
        investigatorSnapshot() {
            try {
                if (!ledger) return null;
                const engine = engineOf();
                if (!IS_COC(engine)) return null;
                const state = heroView(currentStatsState(ledger), engine);
                const hero = skillValuesOf(state)['主角'] || {};
                const attrs = {};
                for (const name of COC_ATTRS) attrs[name] = Math.round(Number(profileOf(engine, state, PROTAGONIST, name).value) || 0);
                const skills = {};
                for (const [name, value] of Object.entries(hero)) {
                    if (COC_ATTRS.includes(name) || name === '幸运' || name === SAN_ATTRIBUTE) continue;
                    if (Number.isFinite(value) && value > 0) skills[name] = value;
                }
                return {
                    ruleset: 'coc7',
                    name: userName() || PROTAGONIST,
                    sheet: Boolean(cocSheetOf(engine)),
                    attrs,
                    luck: Math.round(Number(profileOf(engine, state, PROTAGONIST, '幸运').value) || 0),
                    san: Math.round(Number(profileOf(engine, state, PROTAGONIST, SAN_ATTRIBUTE).value) || 0),
                    skills,
                };
            } catch (error) { return null; }
        },
        destroy:() => { disposed = true; detach(); },
        isActive: ev(active),
        refreshBuildAsk,
        getState: () => (ledger ? currentStatsState(ledger) : null),
        getLedger: () => ledger,
        // 公开接口 IGS.stats.favor：已登记角色对主角的好感/信任/了解/芥蒂/欲望、别名与关系阶段；未启用返回 []。
        favorSnapshot() {
            try {
                const overview = this.favorOverview();
                if (!overview || !Array.isArray(overview.people)) return [];
                let aliases = {};
                try { aliases = characterAliases() || {}; } catch (error) { aliases = {}; }
                const dim = (p, key) => Number(p.dims && p.dims[key]) || 0;
                return overview.people.map(p => ({ name: p.name, aliases: Array.isArray(aliases[p.name]) ? aliases[p.name].map(String) : [], value: dim(p, '好感'), dims: { 好感: dim(p, '好感'), 信任: dim(p, '信任'), 了解: dim(p, '了解'), 芥蒂: dim(p, '芥蒂'), 欲望: dim(p, '欲望') }, stage: p.stage, romance: Boolean(p.romance) }));
            } catch (error) { return []; }
        },
        // 只读：声望快照 [{ name, owner, cls, value, tier, pairs? }]；未开声望、无账本、无聊天都返回 []，每次全新对象。
        fameSnapshot() {
            try {
                if (!ledger) return [];
                const bars = catalog.fameBars;
                if (!Array.isArray(bars) || !bars.length) return [];
                const state = currentStatsState(ledger);
                return bars.map((bar) => {
                    const head = { name: bar.name, owner: bar.owner, cls: bar.cls };
                    if (!bar.pair) { const value = fameValue(state, bar); return { ...head, value, tier: fameTier(bar, value) }; }
                    const pairs = famePairs(state, bar).map((p) => ({ partner: p.partner, value: p.value, tier: fameTier(bar, p.value) }));
                    const top = pairs.length ? pairs[0].value : 0;
                    return { ...head, value: top, tier: fameTier(bar, top), pairs };
                });
            } catch (error) { return []; }
        },
        getCatalog: () => catalog,
        getDiagnostics: () => diagnostics.slice(),
        isChatEnabled: () => chatEnabled,
        buildPolicy: ev(() => {
            ensureLoaded(true);
            const chatId = chatIdOf(ctx());
            const loaded = Boolean(chatId && loadedChat === chatId && loadedKey && !blocked && !unavailable);
            const ready = Boolean(loaded && chatEnabled && ledger && normalizeBuildMode(buildMode));
            return {
                ready, chatId,
                reason: ready ? '' : blocked || unavailable || 'stats-build-policy-waiting',
                mode: ready ? buildMode : null,
                choices: ready ? { ...buildChoices } : {},
            };
        }),
        getBuildMode: () => buildMode,
        getBuildChoices: () => ({ ...buildChoices }),
        setBuildMode: ev(setBuildMode),
        setBuildChoice: ev(setBuildChoice),
        getNpcPolicy: () => npcPolicy,
        getNpcChoices: () => ({ ...npcChoices }),
        setNpcPolicy: ev(setNpcPolicy),
        setNpcChoice: ev(setNpcChoice),
        pushNow: ev(push),
        resolveDice: ev(resolveDice),
        diceChance: ev(diceChance),
        // 战斗侧合并用：注入「骰序」段的输入，以及按楼取正文检定的回放结果。
        checkPromptInput: ev(checkPromptInput),
        checkReplayFor: ev(checkReplayFor),
        promptActive: ev((type = null) => Boolean(active() && !SKIP_TYPES.has(type) && !background())),
        npcAbilities,
        refreshAttributeRecovery,
        abilitiesOf: ev((name) => {
            if (!active()) return null;
            try { const engine = memoEngineOf(); return (isHero(name) ? engine.readAbilities(userName() || PROTAGONIST) : npcAbilities(name) || engine.readAbilities(name)) || null; } catch (error) { return null; }
        }),
        notices: () => [...notices.values()],
        noticeAction: ev(noticeAction),
        generateSheets: ev(generateSheets),
        runBackfill: ev(runBackfill),
        manualRoll: ev(manualRoll),
        diagnose: ev(diagnose),
        sheetOp: ev(sheetOp),
        relationOp: ev(relationOp),
        retryCurrency: ev(() => { ensureLoaded(true); return ensureHeroInit({ force: true }) || Promise.resolve({ ok: false, reason: 'stats-chat-not-enabled' }); }),
        ensureHeroInit: ev((opts) => { ensureLoaded(true); return ensureHeroInit(opts); }),
        heroBasicReady: ev(heroBasicReady),
        exchangeInfo: ev(exchangeInfo),
        quoteExchange: ev(quoteExchange),
        exchangePoints: ev(exchangePoints),
        retryExchange: ev(() => runExchange(() => ({ ok: true }))),
        noteRomanceSeen: ev(noteRomanceSeen),
        skillOp: ev(skillOp),
        heroOp: ev(heroOp),
        // 旧版备份已不再写入；这里只保留「删除旧版备份」按钮的清理入口。
        dropBackup: () => store.dropBackup(),
        // 设置页「存档」区用：只用缓存（总开关关闭时不读表），暂停的聊天也显示冻结的数值。
        archive: ev(() => archiveModel()),
        storageReport: ev(storageReport),
        // 设置页「本聊天」区块用。
        chatStatus: ev(() => {
            ensureLoaded();
            const status = { enabled: chatEnabled, blocked: blocked || unavailable, hasChat: Boolean(chatIdOf(ctx())) };
            if (buildMode) status.buildMode = buildMode;
            if (modePending && modeChat === chatIdOf(ctx())) status.pendingMode = modeDefault;
            return status;
        }),
        // 状态栏 / 人际关系页的数据源：只有总开关与本聊天都启用时才接管，否则返回 null 让调用方读表格（易错点 H3）。
        metricsLookup: ev(() => {
            if (!active()) return null;
            const lookup = createStatsMetricsLookup(currentStatsState(ledger), { hudLabel: settings().hudLabel, nsfw: isNsfw(), stamina: npcStaminaShown(), favorTier: normalizeFavorTier(settings().favorMode), sheets: catalog.sheets, engine: memoEngineOf(), isRomanceOf: (c, n) => isRomance(c, n, catalog.romanceSeen) });
            return (name) => (isHero(name) ? { metrics: [], stages: [] } : lookup(name));
        }),
        // 修罗场情敌（ROMANCE_RIVAL_FIX_PLAN）：近 7 天吃过醋、芥蒂不低于 26、或仍是恋爱对象；未启用时返回 null，演出层退回旧规则。
        rivalSet: ev(() => (active() ? statsRivalSet(ledger) : null)),
        // 好感总览：总开关与本聊天都启用时返回已登记角色（好感从高到低）及其数值条、关系阶段、变动记录和 nsfw 状态；否则 null，页面照旧读表格。
        favorOverview: ev(() => {
            if (!active()) return null;
            const s = settings();
            const nsfw = isNsfw();
            const state = currentStatsState(ledger);
            // 恋爱与亲人判定统一走 isRomance / hasMark：演出层记录（romanceSeen）与档案勾选（traits）同样算数。
            const people = statsFavorOverview(ledger, { isHero }).map((p) => {
                const c = state.characters[p.name];
                const romance = isRomance(c, p.name, catalog.romanceSeen);
                return {
                    ...p,
                    romance,
                    hero: s.heroFeelings === true ? { ...heroDimsOf(c, { nsfw }) } : null,
                    kin: hasTrait(state, traitCatalogOf(catalog.traits), p.name, 'kin'),
                    metrics: characterStatMetrics(c, { hudLabel: s.hudLabel, nsfw, stamina: npcStaminaShown(), favorTier: normalizeFavorTier(s.favorMode) }),
                    stage: stageLabel(Number(p.dims.好感) || 0, romance),
                };
            });
            return { nsfw, people };
        }),
        // 状态栏与人际关系页主角数据：积分沿用原余额，剧情货币单独读取物品表；附主角擅长技能与六维属性供人际关系卡显示。
        protagonistLookup: ev(() => {
            if (!active()) return null;
            const s = settings();
            const state = currentStatsState(ledger);
            const engine = memoEngineOf();
            const metrics = protagonistStatMetrics(state.protagonist.bars, { enabledBars: s.bars, vitals: combatOn() ? protagonistVitals(engine) : null, walletExtra: combatPoints(), currency: currencySnapshot() }).concat(heroFameMetrics(s));
            const sheet = protagonistSheetSummary(engine, state);
            const attributes = characterAttributeAxes(engine, state, PROTAGONIST);
            return (name) => (isHero(name) && (metrics.length || attributes.length || sheet.strong.length || catalog.heroBio)
                ? { metrics, stages: [], sheet, ...(catalog.heroBio ? { bio: catalog.heroBio } : {}), ...(attributes.length === BASE_ATTRIBUTES.length ? { attributes } : {}) } : null);
        }),
        // 角色当前挂的特质名（含主角；不含合成占位与成就），供战斗生成按人设偏向模板；没有启用时为 null。
        traitNamesOf: (name) => {
            if (!active()) return null;
            const key = isHero(name) ? '主角' : String(name || '').trim();
            return listTraits(catalog, key).filter((t) => !isComboKey(t.id) && t.src !== 'achieve').map((t) => t.id);
        },
        // 好战者名单：主角与在场角色里挂有「战斗狂」的名字；没有启用数值系统或没有人时为 null。
        combatEager: () => {
            if (!active()) return null;
            const state = currentStatsState(ledger);
            const cat = traitCatalogOf(catalog.traits, isNsfw());
            const names = [];
            if (hasTrait(state, cat, '主角', '战斗狂')) names.push(userName() || '主角');
            for (const name of present(state)) if (hasTrait(state, cat, name, '战斗狂')) names.push(name);
            return names.length ? { names } : null;
        },
        // 日常挑战建局与额度门禁用的只读快照：生活条、技能值与时钟；没有启用时为 null。
        challengeSnapshot: () => {
            if (!active()) return null;
            const engine = memoEngineOf();
            const state = heroView(currentStatsState(ledger), engine);
            const names = present(state);
            const skills = Object.fromEntries([...new Set([...BASE_ATTRIBUTES, ...DEFAULT_SPECIAL_SKILLS, ...CORE_SKILL_NAMES,
                ...Object.keys(state.protagonist.skills), ...Object.keys(engine.protagonistBase), ...Object.keys(engine.protagonistEdit)])]
                .map((name) => [name, { ...state.protagonist.skills[name], value: profileOf(engine, state, PROTAGONIST, name).value }]));
            return {
                bars: state.protagonist.bars, skills, clock: state.clock, present: names,
                favors: Object.fromEntries(names.map((name) => [name, Number(state.characters[name].dims && state.characters[name].dims['好感']) || 0])),
                trusts: Object.fromEntries(names.map((name) => [name, Number(state.characters[name].dims && state.characters[name].dims['信任']) || 0])),
                grudges: Object.fromEntries(names.map((name) => [name, grudgeOfCharacter(state, name)])),
                intimate: Object.fromEntries(Object.entries(state.characters).filter(([, character]) => character.intimate).map(([name, character]) => [name, character.intimate])),
            };
        },
        // 状态栏常驻主角区：与 protagonistLookup 同一份条目，名字取玩家名；没启用或没有可显示的条时为 null。
        protagonistBlock: ev(() => {
            if (!active()) return null;
            const s = settings();
            const metrics = protagonistStatMetrics(currentStatsState(ledger).protagonist.bars, { enabledBars: s.bars, vitals: combatOn() ? protagonistVitals(memoEngineOf()) : null, walletExtra: combatPoints(), currency: currencySnapshot() }).concat(heroFameMetrics(s));
            return metrics.length ? { name: userName() || PROTAGONIST, metrics } : null;
        }),
        // 积分中的旧数值侧份额保留原存储；战斗账本按需合并，未启用时为 0。
        walletMoney: () => {
            ensureLoaded();
            return active() ? Number(currentStatsState(ledger).protagonist.bars.money) || 0 : 0;
        },
        // 敌人模板 M7 盗金：开战时快照的剧情货币余额（物品表）；未启用、未设定或读不到时为 null（战斗不设可偷金币）。
        currencyBalance: () => {
            ensureLoaded();
            if (!active()) return null;
            const snap = currencySnapshot();
            return snap.ready && Number.isSafeInteger(snap.balance) && snap.balance >= 0 ? snap.balance : null;
        },
        enableForChat: ev(enableForChat),
        submitManualHero: ev(submitManualHero),
        // 本聊天关闭：数值冻结，不清存档（§10A）。战斗开启时锁定为启用。
        disableForChat: ev(() => {
            ensureLoaded(true);
            if (combatOn()) return { ok: false, reason: 'stats-combat-locked' };
            if (unavailable) return { ok: false, reason: unavailable };
            if (blocked) return { ok: false, reason: blocked };
            chatEnabled = false;
            invalidateGenerations();
            invalidateCurrencyJob();
            clearPrompt();
            persist();
            return { ok: true };
        }),
        // 等写库与旧存档导入落完，再限时等待当前推送（测试与导出前用）。
        whenSaved: async () => {
            let pending;
            do {
                pending = [tail, currencyTail, currencyJob?.promise, importJob?.promise, currencyEditJob?.promise];
                await Promise.all(pending);
            } while (pending[0] !== tail || pending[1] !== currencyTail);
            if (pushing) await withTimeout(pushing);
        },
    };
}
