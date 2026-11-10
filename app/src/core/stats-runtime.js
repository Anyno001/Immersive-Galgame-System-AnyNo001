// 数值系统运行时装配（§3、§4.2、§10A；v2 §5、§6；易错点 A1–A6、B1–B3、H1/H2、N1/N2/N5–N7）。
// 只协调宿主事件、账本、注入与后台请求；结算规则在 scene/stats，正文解析不在这里做。
// 总开关关闭时不挂任何监听（sync 解绑）；本聊天未启用时不注入、不结算，数值冻结。
import { STATS_LOG_MAX, activeEntryBefore, createStatsLedger, currentStatsState, deleteFloorsFrom, ledgerKey, selectSwipe, stateBefore } from '../scene/stats/stat-ledger.js';
import { resettleFloor, settleFloor } from '../scene/stats/stat-ledger-settle.js';
import { MANUAL_DIMS, applyManualRelations, settleFloorText } from '../scene/stats/stat-settle.js';
import { FAVOR_TIERS, normalizeFavorTier, stageOf } from '../scene/stats/stat-favor.js';
import { START_DIMS, startFixOffsets } from '../scene/stats/stat-vocab.js';
import { APTITUDE_LEVELS, TRAIT_KEYS, createChatStatsStore, emptyCatalog, sanitizeCatalog, sheetAbilityScores } from '../scene/stats/stat-persist.js';
import {
    BUILD_CHOICES, chatEntries, diffChatRecords, floorRecord, importLegacyStats, initRecord, mergeStatLog, normalizeBuildMode, statTagHash, verifyStatImport,
} from '../scene/stats/stat-log.js';
import { hash32 } from '../combat/random.js';
import { challengeDirectiveOf, parseChallengeReport } from '../combat/challenge-report.js';
import { battleDirectiveOf, parseBattleReport } from '../combat/battle-report.js';
import { BUILD_MODES } from '../combat/abilities.js';
import { checkRollPairsFor, floorCheckOrdinal, floorCheckSwipe, floorIndexOfOrdinal, mergeCheckInputs, replayChecks, upcomingCheckOrdinal, upcomingCheckSwipe, checkCorrections } from '../scene/check-rolls.js';
import { cocCheckCorrections, cocCheckRollsFor, replayCocChecks } from '../scene/stats/stat-coc-checks.js';
import { combatPartyLines } from '../scene/combat-prompt.js';
import { ABILITY_LABELS, abilityKeyOf } from '../combat/abilities.js';
import { readStatsSettings } from '../scene/stats/stat-settings.js';
import { createStatsState, grudgeOfCharacter, isRomance } from '../scene/stats/stat-state.js';
import { aptitudeLevel, applyTraitChange, getTraitDef, hasTrait, listTraits, setTraitAttrReader, slotUsage, traitCatalogOf, withAptitude } from '../scene/stats/stat-traits.js';
import { buildStatsPrompt, mandatesFromFlags } from '../scene/stats/stat-prompt.js';
import { pushStats, readSkillAdoptions, readTableAdoptions, withTimeout } from '../data/shujuku/stats-push.js';
import { statsPushActive } from '../data/shujuku/igs-managed.js';
import { canonicalAttribute, isSixAttribute } from '../data/shujuku/skill-table.js';
import { characterStatMetrics, createStatsMetricsLookup, protagonistStatMetrics } from '../scene/stats/stat-metrics.js';
import { FAME_BAR_MAX, buildFameFillPrompt, fameDraftText, fameHudMetrics, famePairs, fameRows, fameTemplateBar, fameTier, fameValue, parseFameDraft, parseFameFill } from '../scene/stats/stat-fame.js';
import { stageLabel } from '../scene/stats/stat-relation-label.js';
import { statsRivalSet } from '../scene/stats/stat-rivals.js';
import { SKILL_TIER_ORDER, describeClockTrail, heroSkillCap, resolveHeroSlots, statsArchiveModel, statsClockTrail, statsFavorOverview, tierWordOfValue } from '../scene/stats/stat-archive.js';
import { BUILD_PICK_SLOTS, backfillHeroSlots, slotValue } from '../scene/stats/stat-build.js';
import { matchSkill } from '../scene/stats/stat-skill-match.js';
import { cryptoRandom } from '../scene/stats/stat-rng.js';
import { BUILTIN_SKILLS, CORE_SKILL_NAMES, editStorySkill, mergeStorySkill, registerStorySkill, removeStorySkill } from '../scene/stats/stat-registry.js';
import { worldSkillNames } from '../scene/stats/stat-world-skills.js';
import { applyTidy, buildTidyPrompt, parseTidyReply } from '../scene/stats/stat-story-tidy.js';
import { DEFAULT_SPECIAL_SKILLS, BASE_ATTRIBUTES } from '../scene/stats/stat-state.js';
import {
    PROTAGONIST, SAN_ATTRIBUTE, attributeNamesOf, chanceOf, heroBonusKey, heroBonusOf, heroBonusSkillNames, heroSkillLevel, checkLine, checkFxDetail, contestCheck, contestFxDetail, contestLine, engineFor, isProtagonist,
    gateAttributes, isSocialSkill, modifiersOf, profileOf, protagonistVitals, resolveCheck, resolveDiceRequest, withAbilityMemo, withoutHeroBonus,
} from '../scene/stats/stat-engine.js';
import {
    PROTAGONIST_BACKFILL_MAX, SHEET_BATCH_MAX, abilityLine, applyBackfillToSheet, buildBackfillRequest, buildSheetRequest, capSkillTier,
    buildHeroSkillRequest, buildStartRelationRequest, parseBackfillReply, parseHeroSkillReply, parseSheetReply, parseStartRelationReply, sheetAttributeInput, sheetFromTiers, skillTierOfValue, strongSkills, SKILL_TIERS, bandValue,
} from '../scene/stats/stat-sheets.js';
import { parseDiceCommand } from '../choices/dice-check.js';
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
// 「按剧情拟写」读最近多少楼、正文最多多少字。
const HERO_NOTE_FLOORS = 12;
const HERO_NOTE_CHARS = 6000;
const DIAG_MAX = 50;
// 复核提示词里列的恩仇事件（短表；解析仍认全部 EVENT_TYPES）。
const TRAIT_REVIEW_PROMPT_EVENTS = Object.freeze(['救命', '帮忙', '报恩', '结怨', '和解', '复仇', '偷窃成功', '谎言揭穿', '猜忌']);
const SKILLS_LINE_MAX = 20;
const PRESENT_MAX = 3;
const BACKGROUND_TIMEOUT_MS = 60000;
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
function skillsLineOf(engine, state) {
    const coc = IS_COC(engine);
    const names = attributeNamesOf(engine);
    const attrs = names.map((name) => {
        const p = profileOf(engine, state, PROTAGONIST, name);
        return coc ? `${name}${ATTRIBUTE_WORD(Number(p.value) || 50)}` : `${name}${signed(engine.ruleset.bonusOf(p))}`;
    });
    const learned = learnedSkills(state, engine).map(([name, v]) => `${name}${skillTierOfValue(v)}`);
    return `属性：${attrs.join('、')}${learned.length ? `；技能：${learned.join('、')}` : ''}`;
}

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
    getContext, readSettings, resolveCharacter, isNsfw = () => false, presentOf = null, onChange = () => {},
    worldRoles = null, getPushClient = () => null, pushOptions = {}, isBackground = () => false, getBackgroundRequest = () => null,
    describePeople = null, sheetStore = null, onCheck = () => {}, onNotices = () => {}, resumeReply = null, worldviewOf = () => '',
    // v0.39 注入点：战斗侧生命/六维来源、数据库表读写通道、战斗提示词输入、战斗扩展是否开启。
    combatSource = () => null, statsTables = () => null, combatPrompt = () => null, combatEnabled = () => false,
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
    let sheetJob = null;
    let backfillJob = null;
    let heroJob = null;
    let startJob = null;
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
    const life = () => { try { return combatSource() || null; } catch (error) { return null; } };
    const heroSkillValue = (skill) => {
        const own = ledger && currentStatsState(ledger).protagonist.skills[skill];
        const v = heroSkillLevel(engineOf(), own, skill);
        return v > 0 ? v : null;
    };
    const heroPrefs = () => (ledger && currentStatsState(ledger).protagonist.prefs) || null;
    const userName = () => String((ctx() && ctx().name1) || '');
    // 积分与金钱分开计算（2026-11-05 用户定）：数值侧金钱不再并入战斗积分，各处 walletExtra 一律为 0。
    const combatPoints = () => 0;
    // 引擎读数闭包保持稳定（引用不变引擎缓存才命中）；每次调用时再取战斗源，userName 用 getter 随时取最新。
    const readers = {
        readAbilities: (name) => { const s = life(); return s && typeof s.readAbilities === 'function' ? s.readAbilities(name, { heroPrefs: heroPrefs() }) : null; },
        readVitals: (name) => { const s = life(); return s && typeof s.readVitals === 'function' ? s.readVitals(name, { heroPrefs: heroPrefs() }) : null; },
        // 随身系统属性加成（只读，按名字与 IGS 同名属性、技能相加）；没有随身系统或没有数据为 null。
        readBonus: () => { try { const list = originStats(); return Array.isArray(list) && list.length ? list : null; } catch (error) { return null; } },
        get userName() { return userName(); },
    };
    const engineOf = (ruleset) => engineFor(catalog, settings(), ruleset === undefined ? settings().ruleset : ruleset, readers);
    // 一次注入或结算内用：读数按名字记忆化，避免同一名字反复折叠战斗账本。
    const memoEngineOf = (ruleset) => withAbilityMemo(engineOf(ruleset));
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
    const present = (state) => {
        const names = typeof presentOf === 'function' ? presentOf(state) : Object.keys(state.characters).sort((a, b) => (state.characters[b].lastSeenDay || 0) - (state.characters[a].lastSeenDay || 0));
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
        const names = [...new Set(rows.map((row) => String((row && typeof row === 'object' ? row.name : row) || '').trim()))]
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
        return [...new Set(names)].filter((n) => text.includes(n));
    };
    const tableSeedOf = (state, upTo = Infinity) => {
        const fresh = [...new Set([...tableNames(), ...rosterNames(upTo)])].filter((name) => !state.characters[name]);
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
        // 填表窗口内、或窗口刚关后的余波（插件一轮填表可能连发几次更新）都按 AI 填表处理：只盖回，不采纳。
        const covered = fillOpen || Date.now() < fillGraceUntil;
        if (fillOpen) fillGraceUntil = Date.now() + FILL_GRACE;
        closeFillWindow();
        if (!covered && (writingTable || Date.now() < selfWriteUntil)) return;
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

    function adopt(merged) {
        ledger = merged.ledger; chatEnabled = merged.chatEnabled; buildMode = merged.buildMode ?? null; buildChoices = merged.buildChoices || {};
        catalog = merged.catalog; learned = merged.learned; baseline = merged.baseline;
    }

    function resetLoaded() {
        ledger = null; chatEnabled = false; buildMode = null; buildChoices = {}; blocked = ''; unavailable = ''; learned = {}; catalog = emptyCatalog(); declined = false;
        baseline = new Map(); pendingOption = null; manualCheck = null; notices.clear();
    }

    function load() {
        resetLoaded();
        const chatId = chatIdOf(ctx());
        loadedChat = chatId;
        const read = store.read();
        if (!read.ok) { blocked = read.reason; diag('stats-read-failed', { reason: read.reason }); loadedKey = ''; return; }
        declined = read.declined === true;
        const t = tables();
        if (!t.ok) { unavailable = t.reason; diag(t.reason); loadedKey = ''; return; }
        const rows = t.read({ kinds: ['stats'] });
        if (!rows || rows.ok !== true) { blocked = (rows && rows.reason) || 'stats-log-read-failed'; diag('stats-log-read-failed', { reason: blocked }); loadedKey = ''; return; }
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
        const chatId = chatIdOf(ctx());
        if (!explicit && !settings().enabled) { if (loadedChat !== chatId) { resetLoaded(); loadedKey = ''; loadedChat = chatId; } return; }
        if (loadedKey && loadedKey === cacheKey(tables())) return;
        load();
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
    function persist(extra = []) {
        if (!ledger || blocked || unavailable) return null;
        const t = tables();
        if (!t.ok) { writeFailed({ reason: t.reason }); return null; }
        const next = chatEntries({ chatEnabled, catalog, learned, buildMode, buildChoices });
        writeSeq += 1;
        const records = [...extra, ...diffChatRecords(baseline, next, { tag: `${Date.now().toString(36)}${writeSeq}`, createdAt: Date.now() })];
        baseline = next;
        if (!records.length) return null;
        inflight += 1;
        inflightChat = chatIdOf(ctx());
        const chatId = inflightChat;
        let started;
        try { started = t.append(records); } catch (error) { started = Promise.reject(error); }
        const job = Promise.resolve(started).then((r) => { if (!r || r.ok !== true) writeFailed(r); return r; }, () => {
            const r = { ok: false, reason: 'stats-log-write-threw' };
            writeFailed(r);
            return r;
        }).finally(() => {
            inflight -= 1;
            writes += 1;
            // 自己的写入完成后，缓存键跟着更新：内存状态已是最新，不必再整表读一遍。
            if (inflight === 0 && loadedChat === chatId && chatIdOf(ctx()) === chatId) loadedKey = cacheKey(tables());
        });
        tail = Promise.all([tail, job]).then(() => {});
        return job;
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
        const out = {};
        const hero = {};
        const source = life();
        if (source && source.ready === true) {
            for (const name of BASE_ATTRIBUTES) hero[name] = Math.round(Number(profileOf(engine, state, PROTAGONIST, name).value) || 0);
        }
        const owned = state.protagonist.skills || {};
        const bonusNames = heroBonusSkillNames(engine);
        const names = new Set([...Object.keys(owned), ...Object.keys(engine.protagonistBase || {}), ...Object.keys(engine.protagonistEdit || {}), ...bonusNames]);
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
            if (sheetAbilityScores(sheet)) for (const attr of BASE_ATTRIBUTES) row[attr] = Math.round(Number(profileOf(engine, state, name, attr).value) || 0);
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

    // 推送给表格的基础属性：战斗六维 ÷5（战斗源就绪时才有，否则不推）。
    function baseAttributesOf(state) {
        const source = life();
        if (!source || source.ready !== true) return null;
        const engine = memoEngineOf();
        return Object.fromEntries(BASE_ATTRIBUTES.map((name) => [name, Math.round((Number(profileOf(engine, state, PROTAGONIST, name).value) || 50) / 5)]));
    }

    // 单向推送到表格（§8A）：子开关关或没装表格插件时什么都不做；失败只记诊断，不影响结算。
    // 同一时间只跑一次推送，后到的请求排在当前这次之后。
    function push() {
        if (!active() || !pushOn()) return Promise.resolve({ ok: true, skipped: true });
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        if (!client) return Promise.resolve({ ok: false, reason: 'stats-push-no-client' });
        const run = () => {
            collectOriginSkills();
            const state = currentStatsState(ledger);
            writingTable = true;
            const heroAtPush = { ...(skillValuesOf(state)['主角'] || {}) };
            return pushStats(client, state, { ...pushOptions, overridesByFingerprint: settings().push.mappings, baseAttributes: baseAttributesOf(state), walletExtra: combatPoints(), isHero, skillValues: () => skillValuesOf(state), heroName: userName(), skillCanon }).then((r) => {
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
        return [...new Set([...BASE_ATTRIBUTES, ...DEFAULT_SPECIAL_SKILLS, ...CORE_SKILL_NAMES, ...Object.keys(state.protagonist.skills), ...catalog.story.map((s) => s.name)])];
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
        return list.map((p) => (p && p.name === PROTAGONIST ? { ...p, summary: `${String(p.summary || '').trim()} ${more}`.trim() } : p));
    };

    // 回放需要的取数回调。D&D 与 CoC 共用同一份 profile，百分制 = 六维分数 × 5。
    // 战斗源未就绪时 D&D 回放没有六维可用，返回 { ok:false }（CoC 直接走引擎 profile，不依赖战斗源）。
    function replaySources(engine, state) {
        const coc = IS_COC(engine);
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
        const source = life();
        if (!source || source.ready !== true || typeof source.readAbilities !== 'function') return { ok: false, reason: (source && source.reason) || 'stats-life-source-missing' };
        return {
            ok: true,
            readAbilities: (actor) => {
                if (isHero(actor)) return engine.readAbilities(userName() || PROTAGONIST);
                return npcAbilities(actor) || engine.readAbilities(actor);
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
    function storyChecksOf(results, engine, state) {
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
        const c = ctx();
        const list = messages(c);
        const ordinal = upcomingCheckOrdinal(list, type);
        if (!ordinal) return null;
        const state = type === 'continue' ? stateBefore(ledger, list.length - 1) : currentStatsState(ledger);
        const engine = memoEngineOf();
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
            const src = life();
            if (src && src.ready === true) {
                const read = (name) => { try { return isHero(name) ? engine.readAbilities(hero) : (npcAbilities(name) || engine.readAbilities(name)); } catch (error) { return null; } };
                const heroAbilities = read(hero);
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
            walletExtra: combatPoints(), present: names, shortfall: flags.shortfall, dateRegex: s.dateRegex, mandates: mandatesFromFlags(flags, state.protagonist.bars, { fame: catalog.fameBars.length > 0 }), vitals, fameBars: catalog.fameBars, statusCat: { statuses: catalog.statuses },
            worlds: worldsNow(), nsfw: isNsfw(), intimacyGate: s.intimacyGate, intimateCost: s.intimateCost, forcedNames: catalog.intimacyForced, prompts: s.prompts, check: g.check || g.display || null, stageText: s.stageText, stageTextPlatonic: s.stageTextPlatonic, traits: catalog.traits, romanceSeen: catalog.romanceSeen,
            heroNotes: s.heroNotePrompt ? catalog.heroNotes : null,
            disabled: Object.entries(s.segments || {}).filter(([, on]) => on === false).map(([id]) => id),
            skillsLine: skillsLineOf(engine, state), perceptionLine: perceptionLineOf(engine, state),
            sheetLines: sheetNames.map((n) => ({ name: n, rank: catalog.sheets[n].rank, strong: strongSkills(catalog.sheets[n], state.characters[n] && state.characters[n].skillGrowth), bonus: abilityLine(engine, state, n) })),
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
    function traitEdgeFor(state, { skill, toward = null, engine = null } = {}) {
        const eng = engine || memoEngineOf();
        const cat = traitCatalogOf(catalog.traits, isNsfw());
        return traitEdgeOf(state, cat, { actor: PROTAGONIST, skill, toward, social: isSocialSkill(eng, skill), skillValue: Number(profileOf(eng, state, PROTAGONIST, skill).value) || 0, present: present(state), skillOf: (name) => { const p = profileOf(eng, state, name, skill); return p && p.kind === 'skill' && p.learned && !p.provisional ? Number(p.value) || 0 : 0; } });
    }
    // 主角检定带特质：万事通技能下限、贵人相助失败重掷；favorFrom 随结果一并带上。
    function resolveHeroCheck(engine, state, request) {
        const te = traitEdgeFor(state, { skill: request.skill, toward: request.toward || request.against || null, engine });
        const req = { ...request, edge: te.edge, floor: te.floor };
        const check = luckyReroll(state, traitCatalogOf(catalog.traits, isNsfw()), resolveCheck(engine, state, req, cryptoRandom), () => resolveCheck(engine, state, req, cryptoRandom));
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
        if (reviewing || generating || !requester()) return;
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
    // 只有拿到回复的批次才记为已评；失败的 10 分钟内不重发。
    let initialJob = null;
    let initialRetryAt = 0;
    // manual：设置页「补全角色特质」，已评过但仍没有任何特质的角色也再评一次。
    const pendingInitial = (manual = false) => {
        if (!ledger) return [];
        const done = new Set(catalog.traitInit || []);
        const npcs = [...new Set([...Object.keys(currentStatsState(ledger).characters || {}), ...Object.keys(catalog.sheets || {})])].filter((n) => n !== PROTAGONIST && !isHero(n));
        const bare = (n) => !listTraits(catalog, n).some((t) => t.src !== 'achieve');
        return [PROTAGONIST, ...npcs].filter((n) => !done.has(n) || (manual && bare(n)));
    };
    function runInitialTraits({ manual = false } = {}) {
        if (initialJob) return initialJob;
        if (!active() || !ledger) return Promise.resolve({ ok: false, reason: ledger ? 'stats-inactive' : 'stats-no-ledger' });
        if (!manual && Date.now() < initialRetryAt) return Promise.resolve({ ok: false });
        if (manual && generating) return Promise.resolve({ ok: false, reason: 'stats-generating' });
        if (reviewing) return Promise.resolve({ ok: false, reason: 'stats-trait-busy' });
        const request = requester();
        if (!request) return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        const chatId = chatIdOf(ctx());
        const filled = [];
        const run = async () => {
            let total = 0;
            const names = pendingInitial(manual);
            if (!names.length) return { ok: true, applied: 0, filled, asked: 0 };
            for (let i = 0; i < names.length; i += SHEET_BATCH_MAX) {
                if (!ledger || chatIdOf(ctx()) !== chatId) return { ok: false };
                const batch = names.slice(i, i + SHEET_BATCH_MAX);
                let people;
                try { people = await describeWithHero(batch); } catch (error) { people = batch.map((name) => ({ name, summary: '' })); }
                const persona = new Map((Array.isArray(people) ? people : []).filter(Boolean).map((p) => [p.name, String(p.summary || '')]));
                for (const p of Array.isArray(people) ? people : []) {
                    if (!p) continue;
                    personaReport.set(p.name, { len: String(p.summary || '').length, from: p.from || '' });
                    if (Array.isArray(p.errors) && p.errors.length) diag('stats-trait-persona-read-failed', { name: p.name, reasons: p.errors });
                }
                const c = ctx();
                const state = currentStatsState(ledger);
                const nsfw = isNsfw();
                const defs = TRAIT_DEFS.filter((d) => d.candidate !== false && (nsfw || !d.nsfw) && subInWorlds(d.sub, worldsNow()));
                const floors = messages(c).filter((m) => m && !m.is_system).slice(-6)
                    .map((m) => ({ role: m.is_user ? 'user' : 'ai', text: stripStatDirectives(String(m.mes ?? '')).slice(0, 1500) }));
                let client = null;
                try { client = getPushClient(); } catch (error) { client = null; }
                let aliases = {};
                try { aliases = characterAliases() || {}; } catch (error) { aliases = {}; }
                const chars = batch.map((n) => ({
                    name: n, aliases: aliases[n] || [], protagonist: n === PROTAGONIST, persona: persona.get(n) || '', note: catalog.traitNotes[n] || '',
                    relation: state.characters[n] ? stageLabel(Number(state.characters[n].dims.好感) || 0, isRomance(state.characters[n], n, catalog.romanceSeen)) : '',
                    traits: listTraits(catalog, n).filter((t) => !t.id.startsWith('combo:')).map((t) => ({ id: t.id, src: t.src })),
                    attrs: gateAttrsOf(n),
                }));
                const payload = buildReviewPayload({ floors, tables: client ? () => client.readTables() : null, chars, catalog, defs, N: settings().traitReviewN, nsfw });
                const prompt = { system: '你是角色设定评定助手，只依据人设与正文作答，只输出指定的 JSON。', user: buildReviewPrompt(payload, defs, 'initial', [], null, WORLD_GENRES) };
                let text;
                try {
                    const reply = await ask(request, prompt);
                    text = reply && typeof reply === 'object' ? reply.text : reply;
                } catch (error) {
                    diag('stats-trait-initial-failed');
                    initialRetryAt = Date.now() + 10 * 60 * 1000;
                    return { ok: false, reason: 'stats-trait-initial-failed', applied: total, filled };
                }
                if (!ledger || chatIdOf(ctx()) !== chatId) return { ok: false };
                const now = currentStatsState(ledger);
                const prevCatalog = catalog;
                const dropped = [];
                const tags = {};
                const results = parseReviewReply(text, defs, { chars: batch, dropped, tags }).filter((r) => r.on);
                storeWorlds(parseReviewWorlds(text, WORLD_GENRES));
                logReviewParse(dropped, tags);
                const applied = applyReview(results, catalog, applyTraitChange, { state: now, mode: 'initial' });
                logReviewSkipped(applied.skipped);
                // 人设为空且本批没有结果的角色不记已评，下次自动重评。
                const judged = judgedNames(batch, persona, results);
                applyCatalog({ ...applied.catalog, traitInit: [...new Set([...(catalog.traitInit || []), ...judged])] });
                if (applied.applied.length) {
                    total += applied.applied.length;
                    for (const r of applied.applied) if (!filled.includes(r.charName)) filled.push(r.charName);
                    const texts = refreshAllCombos(now, prevCatalog, now);
                    announceTraits(applied.notices, texts);
                    lightGlobalCodex(now);
                }
                persist();
                push();
            }
            if (manual) onChange(currentStatsState(ledger), null);
            return { ok: true, applied: total, filled, asked: names.length };
        };
        reviewing = true;
        initialJob = run().catch(() => { diag('stats-trait-initial-failed'); return { ok: false }; })
            .finally(() => { reviewing = false; initialJob = null; });
        return initialJob;
    }
    // 复核：6 楼正文 + 纪要表 + 恋爱日记表 + 当前特质 → 副模型（现有后台请求通道）→ 解析 → applyTraitChange，并记下识别出的事件。
    // 人多时按 SHEET_BATCH_MAX 人一批依次发送，避免一次请求过长被截断或超时。
    function runTraitReview(names, messageId) {
        const all = [...new Set(names)];
        if (all.length <= SHEET_BATCH_MAX) return runTraitReviewBatch(all, messageId);
        const bond = [];
        const review = [];
        let applied = 0;
        let ok = false;
        let chain = Promise.resolve();
        for (let i = 0; i < all.length; i += SHEET_BATCH_MAX) {
            const batch = all.slice(i, i + SHEET_BATCH_MAX);
            chain = chain.then(() => runTraitReviewBatch(batch, messageId)).then((r) => {
                if (r && r.ok) { ok = true; applied += r.applied || 0; }
                bond.push(...pendingEvents.bond);
                review.push(...pendingEvents.review);
                pendingEvents = { bond: [], review: [] };
            });
        }
        return chain.then(() => {
            pendingEvents = { bond, review };
            return { ok, applied, events: bond.length + review.length };
        });
    }
    function runTraitReviewBatch(names, messageId) {
        const request = requester();
        if (!request || !ledger) return Promise.resolve({ ok: false });
        const c = ctx();
        const chatId = chatIdOf(c);
        const state = currentStatsState(ledger);
        const nsfw = isNsfw();
        const defs = TRAIT_DEFS.filter((d) => d.candidate !== false && (nsfw || !d.nsfw) && subInWorlds(d.sub, worldsNow()));
        const floors = messages(c).slice(0, messageId + 1).filter((m) => m && !m.is_system).slice(-6)
            .map((m) => ({ role: m.is_user ? 'user' : 'ai', text: stripStatDirectives(String(m.mes ?? '')).slice(0, 1500) }));
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
        reviewing = true;
        return ask(request, prompt).then((reply) => {
            if (!ledger || chatIdOf(ctx()) !== chatId) return { ok: false };
            const text = reply && typeof reply === 'object' ? reply.text : reply;
            const only = chars.map((x) => x.name);
            const dropped = [];
            const tags = {};
            const results = parseReviewReply(text, defs, { chars: only, dropped, tags });
            logReviewParse(dropped, tags);
            const events = parseReviewEvents(text, { bondTypes: BOND_EVENT_TYPES, chars: only });
            storeWorlds(parseReviewWorlds(text, WORLD_GENRES));
            const now = currentStatsState(ledger);
            const prevCatalog = catalog;
            const memory = reviewMemoryOf(catalog.counters, results, [...new Set(results.map((r) => r.charName))], TRAIT_IDS, now.clock.day);
            const applied = applyReview(results, catalog, applyTraitChange, { state: now, mode: 'story', day: now.clock.day, changeLog: memory.changeLog, recent: memory.recent });
            logReviewSkipped(applied.skipped);
            // 状态补漏：副模型给出的状态挂摘，来源只升不降。
            const statusRes = applyReviewStatuses(parseReviewStatuses(text, STATUS_DEFS, { chars: only }), { statuses: catalog.statuses }, applyStatusChange, { day: now.clock.day });
            if (statusRes.applied.length) { catalog = sanitizeCatalog({ ...catalog, statuses: statusRes.catalog.statuses }); persist(); push(); }
            pendingEvents = { bond: events.bond, review: events.review };
            if (applied.applied.length) {
                applyCatalog({ ...applied.catalog, counters: reviewMemoryWrite(applied.catalog.counters, applied.applied, TRAIT_IDS, now.clock.day) });
                const texts = refreshAllCombos(now, prevCatalog, now);
                announceTraits(applied.notices, texts);
                lightGlobalCodex(now);
                persist();
                push();
            }
            return { ok: true, applied: applied.applied.length, events: events.bond.length + events.review.length };
        }).catch(() => { diag('stats-trait-review-failed'); return { ok: false }; }).finally(() => { reviewing = false; });
    }

    function settleAt(messageId, { redo = false, plan = null } = {}) {
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
        const strengthRev = prior ? (Number(priorMeta.strengthRev) >= 2 ? 2 : Number(priorMeta.strengthRev) >= 1 ? 1 : 0) : 2;
        const favorMode = prior && !favorTier ? (priorMeta.favorMode === 'hard' ? 'hard' : 'normal') : undefined;
        // 亲密体力：重算旧楼按当时写进 meta 的档位，旧楼没有该字段就不结算；新楼（含新 swipe）取当前设置。
        const intimateCost = prior ? priorMeta.intimateCost : s.intimateCost;
        // 手改关系挂在楼上：重算、重 roll 同一楼都沿用，否则一重 roll 就丢。
        const manual = priorMeta.manual || manualOfFloor(messageId);
        // 同一楼同一 swipe 的结算种子与骰序都由「聊天 + 楼序号 + swipe」决定（确定性）。
        const ordinal = floorCheckOrdinal(messages(c), messageId);
        const seed = settleSeed(chatId, ordinal, floor.swipeId);
        const rollPairs = ordinal ? rollsFor(IS_COC(engine), chatId, ordinal, floor.swipeId) : null;
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
                traitEdge: strengthRev >= 2 ? (st, req) => traitEdgeFor(st, { ...req, engine }) : null,
                random, nsfw: isNsfw(), resolveCharacter: (name) => resolve(name, before), engine,
                check, preroll: p.preroll || null, rollPairs, storyChecks, npcChecks, favorTier, favorMode, strengthRev, aptitudeOf: (name) => aptitudeLevel(catalog, name), traits: catalog.traits, romanceSeen: catalog.romanceSeen, moodGroups: moodGroups(), intimateCost, dateRegex: s.dateRegex, timeRegex: s.timeRegex, manual, catalog, settings: s, floor: messageId, noBattle: combatOn(), walletExtra: combatPoints(), extraDirectives: challengeDirectivesBefore(messages(c), messageId), present: present(before),
                seedCharacters: autoTable ? tableSeedOf(before, messageId) : null, fameBars: catalog.fameBars,
            });
            const meta = { ...r.meta };
            if (p.preroll) meta.preroll = p.preroll;
            const note = { ...(p.note || {}) };
            if (meta.check && !check) note.source = 'roll';
            if (!meta.check && !storyChecks.length && (p.preroll || note.source === 'preroll')) note.reason = r.meta.rollTag ? 'roll-unresolved' : 'stats-roll-skipped';
            if (Object.keys(note).length) meta.note = note;
            return { ...r, meta };
        };
        const r = redo ? resettleFloor(ledger, floor, settle) : settleFloor(ledger, floor, settle, seed === null ? undefined : seed);
        if (r.reused) return r;
        const meta = r.entry.meta || {};
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
        for (const entry of meta.newSkills || []) commitSkill(entry.name, { attribute: entry.attribute, floor: messageId });
        // 楼层记录接在上一条存活记录之后；重算同一楼时沿用原来的上游。
        const before = activeEntryBefore(ledger, messageId);
        const baseId = prior && Object.hasOwn(prior, 'baseId') ? prior.baseId : before ? before.recordId ?? null : null;
        const record = floorRecord({ messageId, swipeId: floor.swipeId, tagHash: statTagHash(body), baseId, seed: r.entry.seed, before: r.entry.before, after: r.entry.after, changes: r.entry.changes, meta: r.entry.meta, createdAt: Date.now() });
        r.entry.recordId = record.id;
        r.entry.baseId = baseId;
        persist([record]);
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
        if (!g || !active()) return;
        const c = ctx();
        const lastId = messages(c).length - 1;
        if (lastId < 0) return;
        const plan = { check: g.check, preroll: g.preroll, note: g.note, ruleset: g.ruleset };
        settleAt(lastId, { redo: g.type === 'continue', plan });
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
        managedCache = null;
        pushedHeroSkills = {};
        generating = null;
        clearPrompt();
        load();
        autoEnable();
        onChange(ledger ? currentStatsState(ledger) : null, null, { chatChanged: true });
        refreshOnboarding();
        if (active()) refreshLife();
    }

    function detach() {
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
        if (on && !offs.length) { if (attach()) { load(); autoEnable(); refreshOnboarding(); if (active()) refreshLife(); } }
        else if (on && offs.length && combatOn()) { autoEnable(); refreshOnboarding(); }
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
        const mode = normalizeBuildMode(pickedMode) || (modePending ? modeDefault : null);
        if (!buildMode && mode) buildMode = mode;
        modePending = false;
        if (declined) { store.setDeclined(false); declined = false; }
        persist(extra);
        onChange(currentStatsState(ledger), null);
        refreshOnboarding();
        detectNewCharacters();
        return { ok: true };
    }

    // 自动启用：战斗开启时一律启用；否则只对从未启用也未拒绝的聊天按「自动快速开始」生效，暂停过的聊天不自动开（v2 §9.5）。
    function autoEnable() {
        const s = settings();
        if (!s.enabled || unavailable || blocked || !chatIdOf(ctx())) return;
        if (combatOn()) { if (!ledger || !chatEnabled) Promise.resolve(enableForChat()).catch(() => {}); return; }
        if (s.newChat !== 'auto' || ledger || declined) return;
        Promise.resolve(enableForChat()).catch(() => {});
    }

    const MODE_TEXT = Object.freeze({ auto: '自动生成', manual: '手动建档', relative: '相对数值' });

    // 引导提示：未启用时问是否启用并选建档方式；已启用但没选建档方式时单独问一次。
    function refreshOnboarding() {
        const s = settings();
        const chatId = chatIdOf(ctx()) || null;
        if (chatId !== modeChat) { modeChat = chatId; modeDefault = 'auto'; modePending = false; askedFill.clear(); }
        const ready = s.enabled && !unavailable && !blocked && Boolean(chatId);
        const ask = ready && !combatOn() && s.newChat === 'ask' && !ledger && !declined;
        setNotice('onboarding', ask ? {
            kind: 'onboarding', text: '数值系统：本聊天是否启用？',
            actions: [...BUILD_MODES.map((mode) => [`mode:${mode}`, MODE_TEXT[mode], mode === modeDefault]), ['quick', '快速开始'], ['build', '建卡'], ['decline', '本聊天不用']],
        } : null);
        setNotice('build-mode', ready && Boolean(ledger) && chatEnabled && !buildMode ? {
            kind: 'onboarding', text: '本聊天的建档方式', actions: BUILD_MODES.map((mode) => [`pick:${mode}`, MODE_TEXT[mode]]),
        } : null);
        refreshBuildAsk();
        refreshHeroOffer();
        refreshHeroPick();
    }

    // 主角还没有任何内置技能、也没选过时，需要选擅长技能。剧情技能、世界观技能不算（补全出来的不顶替这一步）。
    function needsHeroPick() {
        if (!ledger || catalog.heroPicked) return false;
        const own = currentStatsState(ledger).protagonist.skills || {};
        const builtin = (name) => Object.hasOwn(BUILTIN_SKILLS, name);
        return ![...Object.keys(own), ...Object.keys(catalog.protagonistBase), ...Object.keys(catalog.protagonistEdit)].some(builtin);
    }

    function refreshHeroPick() {
        const chatId = chatIdOf(ctx());
        const offer = Boolean(chatId) && active() && !heroPickAsked.has(chatId) && needsHeroPick();
        setNotice('hero-pick', offer ? { kind: 'onboarding', text: '主角技能：请选3项擅长、5项比较擅长', actions: [['open', '去选择'], ['later', '稍后']] } : null);
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
        const engine = engineOf();
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
        return { ok: true };
    }

    // CoC 且主角还没分配过技能时，每个聊天提示一次。
    function refreshHeroOffer() {
        const chatId = chatIdOf(ctx());
        const offer = Boolean(chatId) && active() && !heroAsked.has(chatId) && !catalog.heroAssigned && IS_COC(engineOf()) && Boolean(requester());
        if (!offer && notices.has('hero-skills') && notices.get('hero-skills').kind === 'busy') return;
        setNotice('hero-skills', offer ? { kind: 'onboarding', text: '主角技能：按人设分配一次？', actions: [['assign', '分配'], ['later', '稍后']] } : null);
    }

    // 手动建档模式下，还没有六维初始档案的角色（主角优先）逐个询问：填写 / 自动 / 跳过。
    function pendingBuildName() {
        if (!active() || buildMode !== 'manual') return null;
        const source = life();
        if (!source || source.ready !== true || typeof source.readAbilities !== 'function') return null;
        const state = currentStatsState(ledger);
        let known = [];
        try { known = typeof source.names === 'function' ? source.names() || [] : []; } catch (error) { known = []; }
        for (const name of [...new Set([userName() || PROTAGONIST, ...known, ...Object.keys(state.characters || {})])]) {
            if (!name || askedFill.has(name) || Object.hasOwn(buildChoices, name)) continue;
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

    // ---- 新角色与角色卡（v2 §6.4） ----
    function detectNewCharacters() {
        if (!active()) return;
        const s = settings();
        if (s.sheetGen === 'off') return;
        const state = currentStatsState(ledger);
        // 主角（含别名同组、设为User立绘的角色卡）不生成 NPC 角色卡。
        const fresh = Object.keys(state.characters).filter((n) => !catalog.sheets[n] && !catalog.notified.includes(n) && !isHero(n));
        if (!fresh.length) return;
        const card = cardOf(ctx());
        const carried = [];
        const sheets = { ...catalog.sheets };
        for (const name of fresh) {
            const kept = sheetStore && card ? sheetStore.get(card, name) : null;
            if (kept) { sheets[name] = tidySheet({ ...kept, source: 'carried', provisional: {} }); carried.push(name); }
        }
        catalog = { ...catalog, sheets, notified: [...catalog.notified, ...fresh] };
        persist();
        if (carried.length) setNotice('carried', { kind: 'info', text: `沿用已有角色卡：${carried.join('、')}`, ttl: true });
        const rest = fresh.filter((n) => !carried.includes(n));
        if (!rest.length) return;
        catalog = { ...catalog, queue: { ...catalog.queue, people: [...new Set([...catalog.queue.people, ...rest])] } };
        persist();
        if (s.sheetGen === 'auto') { generateSheets(); return; }
        const pending = catalog.queue.people;
        setNotice('sheets', {
            kind: 'sheets', text: pending.length > 1 ? `新角色 ${pending.length} 位` : `新角色：${pending[0]}`,
            actions: [['generate', '生成数值'], ['dismiss', '稍后']],
        });
    }

    function requester() {
        let request = null;
        try { request = getBackgroundRequest(); } catch (error) { request = null; }
        return typeof request === 'function' ? request : null;
    }

    async function ask(request, prompt) {
        let timer = null;
        const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ timedOut: true }), BACKGROUND_TIMEOUT_MS); });
        try {
            const reply = await Promise.race([Promise.resolve().then(() => request(prompt)), timeout]);
            if (reply && reply.timedOut) throw new Error('timeout');
            return reply;
        } finally { clearTimeout(timer); }
    }

    // 生成角色卡：生成进行中时排到结束后（N1）；失败最多自动重试 1 次（N13），整份失败不写半份（N3）。
    // 角色卡含六维属性档（LLM 只给档位词）、资历、技能与招牌技能；世界书读取与筛选由注入的 describePeople 完成。
    function generateSheets(names = null) {
        if (sheetJob) return sheetJob;
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive' });
        const request = requester();
        if (!request) {
            setNotice('sheets', { kind: 'sheets', text: '生成数值需要可用的辅助模型（自动插图设置里的写词模型）', actions: [['dismiss', '知道了']] });
            return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        }
        if (generating) return Promise.resolve({ ok: false, reason: 'stats-generating', queued: true });
        // 不点名时：待生成队列，加上有人际档却没有角色卡的角色（角色卡被删或生成失败丢失）。
        const orphans = () => !ledger ? [] : Object.keys(currentStatsState(ledger).characters || {})
            .filter((n) => n !== PROTAGONIST && !isHero(n) && !catalog.sheets[n]);
        const targets = (names && names.length ? names : [...new Set([...catalog.queue.people, ...orphans()])]).slice(0, SHEET_BATCH_MAX);
        if (!targets.length) return Promise.resolve({ ok: true, skipped: true });
        setNotice('sheets', { kind: 'busy', text: `正在生成数值：${targets.join('、')}` });
        const chatSeed = chatIdOf(ctx());
        const run = async () => {
            let people;
            try { people = typeof describePeople === 'function' ? await describePeople(targets) : targets.map((name) => ({ name, summary: '' })); }
            catch (error) { people = targets.map((name) => ({ name, summary: '' })); }
            const engine = engineOf();
            const skills = engine.registry.entries().filter(([, e]) => e.kind === 'skill' && (e.origin !== 'world')).map(([n, e]) => [n, e.attribute]);
            const prompt = buildSheetRequest(people, { worldview: worldviewOf(), skills, prompt: settings().prompts.sheetGen });
            let parsed = null;
            for (let attempt = 0; attempt < 2 && !(parsed && parsed.ok); attempt += 1) {
                try { parsed = parseSheetReply(await ask(request, prompt), { names: targets, registry: engine.registry }); }
                catch (error) { parsed = { ok: false, reason: 'stats-sheet-request-failed' }; }
            }
            if (!parsed || !parsed.ok) {
                diag(parsed ? parsed.reason : 'stats-sheet-request-failed');
                setNotice('sheets', { kind: 'sheets', text: '生成数值失败，可重试', actions: [['generate', '重试'], ['dismiss', '稍后']] });
                return { ok: false, reason: parsed ? parsed.reason : 'stats-sheet-request-failed' };
            }
            (parsed.diagnostics || []).forEach((d) => diag(d.code, d));
            const sheets = { ...catalog.sheets };
            const card = cardOf(ctx());
            for (const [name, tiers] of Object.entries(parsed.sheets)) {
                for (const sig of tiers.signature) commitSkill(sig.name, { attribute: sig.attribute });
                sheets[name] = tidySheet(sheetFromTiers(name, tiers, { chatSeed, heroSkill: heroSkillValue }));
                if (sheetStore && card) sheetStore.put(card, name, sheets[name]);
            }
            const done = Object.keys(parsed.sheets);
            catalog = { ...catalog, sheets, queue: { ...catalog.queue, people: catalog.queue.people.filter((n) => !done.includes(n)) } };
            persist();
            setNotice('sheets', catalog.queue.people.length
                ? { kind: 'sheets', text: `还有 ${catalog.queue.people.length} 位角色没有数值`, actions: [['generate', '生成数值'], ['dismiss', '稍后']] }
                : { kind: 'info', text: `已生成数值：${done.join('、')}`, ttl: true });
            onChange(currentStatsState(ledger), null);
            // 新角色卡生成后接着评初始特质（与角色卡分开请求，失败不影响角色卡）。
            setTimeout(() => { if (!generating && !reviewing && pendingInitial().length) runInitialTraits(); }, 0);
            return { ok: true, names: done };
        };
        sheetJob = run().finally(() => { sheetJob = null; });
        return sheetJob;
    }

    // ---- 批量补全（v2 §6.2 第二、三层） ----
    function scheduleBackfill() {
        if (settings().backfill !== 'auto' || !catalog.queue.skills.length || backfillJob || !requester()) return;
        setTimeout(() => { if (!generating) runBackfill(); }, 0);
    }

    function runBackfill() {
        if (backfillJob) return backfillJob;
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive' });
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
        const run = async () => {
            let people;
            try { people = typeof describePeople === 'function' ? await describeWithHero([...npcs, PROTAGONIST]) : [...npcs, PROTAGONIST].map((name) => ({ name, summary: '' })); }
            catch (error) { people = [...npcs, PROTAGONIST].map((name) => ({ name, summary: '' })); }
            const prompt = buildBackfillRequest(people, skills, { prompt: settings().prompts.backfill });
            let parsed = null;
            for (let attempt = 0; attempt < 2 && !(parsed && parsed.ok); attempt += 1) {
                try { parsed = parseBackfillReply(await ask(request, prompt), { names: [...npcs, PROTAGONIST], skills }); }
                catch (error) { parsed = { ok: false, reason: 'stats-backfill-request-failed' }; }
            }
            // 失败也出队，避免每楼反复请求；面板里可手动再补。
            catalog = { ...catalog, queue: { ...catalog.queue, skills: catalog.queue.skills.filter((s) => !skills.includes(s)) } };
            if (!parsed || !parsed.ok) { diag(parsed ? parsed.reason : 'stats-backfill-request-failed'); persist(); return { ok: false }; }
            const sheets = { ...catalog.sheets };
            for (const name of npcs) if (parsed.fills[name]) sheets[name] = applyBackfillToSheet(sheets[name], parsed.fills[name], { name, chatSeed, heroSkill: heroSkillValue });
            const base = { ...catalog.protagonistBase };
            const own = currentStatsState(ledger).protagonist.skills;
            const filled = [];
            for (const [skill, tier] of Object.entries(parsed.fills[PROTAGONIST] || {})) {
                const capped = capSkillTier(tier, PROTAGONIST_BACKFILL_MAX);
                if (own[skill] || base[skill] || !SKILL_TIERS[capped]) continue;
                base[skill] = bandValue(SKILL_TIERS[capped], `${chatSeed}|${PROTAGONIST}|${skill}`);
                filled.push(`${skill} ${capped}`);
            }
            catalog = { ...catalog, sheets, protagonistBase: base };
            persist();
            if (filled.length) setNotice('backfill', { kind: 'info', text: `按人设补全：${filled.join('、')}`, ttl: true });
            return { ok: true };
        };
        backfillJob = run().finally(() => { backfillJob = null; });
        return backfillJob;
    }

    // ---- 主角技能（CoC）：按人设一次分配 + 玩家手改 ----
    // 可分配技能：核心（含默认特有）与当前世界观的附加技能；不含六维与理智、剧情技能。
    // 「修改属性」预填：主角六维底数（剧情、升级加点之前，3–18）。战斗属性表没就绪时为 null，不显示按钮。
    function heroAttrs() {
        const source = life();
        if (!source || source.ready !== true || typeof source.readAbilities !== 'function') return null;
        let view = null;
        try { view = source.readAbilities(userName() || PROTAGONIST, { heroPrefs: heroPrefs() }); } catch (error) { view = null; }
        if (!view || !view.base || view.table !== 'ok') return null;
        return { base: { ...view.base }, className: view.className || '', role: view.role || '' };
    }

    function heroSkillNames() {
        const world = new Set(worldSkillNames(worldviewOf()));
        return engineOf().registry.entries()
            .filter(([name, e]) => e.kind === 'skill' && (e.origin === 'builtin' || e.origin === 'core' || (e.origin === 'world' && world.has(name))))
            .map(([name]) => name);
    }

    // 只在 CoC 下提供。已分配过且未传 overwrite 时返回 needs-confirm，由设置页确认后再带 overwrite 调用。
    // 账本里已有的技能（建卡与成长）以账本为准，不参与分配；重新分配会清掉本次名单内的旧底数与手改。
    function assignHeroSkills({ overwrite = false } = {}) {
        if (heroJob) return heroJob.chatId === chatIdOf(ctx()) ? heroJob.promise : Promise.resolve({ ok: false, reason: 'stats-hero-skills-busy' });
        if (!active()) return Promise.resolve({ ok: false, reason: 'stats-inactive' });
        if (!IS_COC(engineOf())) return Promise.resolve({ ok: false, reason: 'stats-hero-skills-coc-only' });
        if (catalog.heroAssigned && !overwrite) return Promise.resolve({ ok: false, reason: 'needs-confirm' });
        const request = requester();
        if (!request) return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        const chatId = chatIdOf(ctx());
        const owned = currentStatsState(ledger).protagonist.skills;
        const skills = heroSkillNames().filter((name) => !owned[name]);
        if (!skills.length) {
            // 全部技能已在账本里：记为已分配，开局提示不再出现。
            catalog = sanitizeCatalog({ ...catalog, heroAssigned: true });
            heroAsked.add(chatId);
            persist();
            setNotice('hero-skills', null);
            return Promise.resolve({ ok: true, skipped: true });
        }
        setNotice('hero-skills', { kind: 'busy', text: '正在按人设分配主角技能' });
        const run = async () => {
            let people;
            try { people = typeof describePeople === 'function' ? await describeWithHero([PROTAGONIST]) : [{ name: PROTAGONIST, summary: '' }]; }
            catch (error) { people = [{ name: PROTAGONIST, summary: '' }]; }
            const prompt = buildHeroSkillRequest(people, skills, { prompt: settings().prompts.heroSkills });
            let parsed = null;
            for (let attempt = 0; attempt < 2 && !(parsed && parsed.ok); attempt += 1) {
                try { parsed = parseHeroSkillReply(await ask(request, prompt), { skills }); }
                catch (error) { parsed = { ok: false, reason: 'stats-hero-skills-request-failed' }; }
            }
            if (!ledger || chatIdOf(ctx()) !== chatId) { setNotice('hero-skills', null); return { ok: false, reason: 'stats-chat-changed' }; }
            if (!parsed || !parsed.ok) {
                diag(parsed ? parsed.reason : 'stats-hero-skills-request-failed');
                setNotice('hero-skills', { kind: 'onboarding', text: '主角技能分配失败', actions: [['assign', '重试'], ['later', '稍后']] });
                return { ok: false, reason: parsed ? parsed.reason : 'stats-hero-skills-request-failed' };
            }
            const base = { ...catalog.protagonistBase };
            const edit = { ...catalog.protagonistEdit };
            for (const name of skills) { delete base[name]; delete edit[name]; }
            const done = [];
            for (const [skill, tier] of Object.entries(parsed.tiers)) {
                base[skill] = bandValue(SKILL_TIERS[tier], `${chatId}|${PROTAGONIST}|${skill}`);
                done.push(`${skill} ${tier}`);
            }
            catalog = sanitizeCatalog({ ...catalog, protagonistBase: base, protagonistEdit: edit, heroAssigned: true });
            heroAsked.add(chatId);
            persist();
            setNotice('hero-skills', { kind: 'info', text: `已分配主角技能：${done.join('、')}`, ttl: true });
            onChange(currentStatsState(ledger), null);
            return { ok: true, assigned: done };
        };
        const promise = run().finally(() => { heroJob = null; });
        heroJob = { chatId, promise };
        return promise;
    }

    // 玩家手改一项技能值（1–99；空值清除手改）。覆盖层规则见 stat-engine.js 的 heroSkillLevel：
    // 记下改动当时账本里的值作为 from，之后的成长叠加在手改值上。
    function setHeroSkill(name, raw) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        const engine = engineOf();
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
        const slots = resolveHeroSlots(engineOf(), currentStatsState(ledger), catalog);
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
        const engine = engineOf();
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
        const engine = engineOf();
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
        if (op === 'assign') return assignHeroSkills({ overwrite: payload.overwrite === true });
        return { ok: false, reason: 'stats-hero-op-unknown' };
    }

    // ---- 手动掷骰（v2 §5.2 可选档） ----
    function offerManualRoll(entry) {
        const pr = entry.meta.pendingRoll;
        const engine = engineOf();
        const skill = engine.registry.resolve(pr.skill) || pr.skill;
        let pct = '';
        try { pct = ` 约 ${Math.round(chanceOf(engine, entry.before, { actor: PROTAGONIST, skill, difficulty: pr.difficulty, against: pr.against }) * 100)}%`; } catch (error) { pct = ''; }
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
        const state = currentStatsState(ledger);
        const c = ctx();
        const resolve = resolveCharacter || defaultResolver(c, settings().register, worldRoles, tableNameSet(), isHero);
        const engine = memoEngineOf();
        const req = resolveDiceRequest(engine, state, command, { resolveCharacter: (name) => resolve(name, state) });
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
        const state = currentStatsState(ledger);
        const engine = memoEngineOf();
        const req = resolveDiceRequest(engine, state, command, {});
        if (!req || !isProtagonist(req.actor)) return null;
        try { return { skill: req.skill, difficulty: req.difficulty, chance: chanceOf(engine, state, req) }; } catch (error) { return null; }
    }

    // ---- 阅读器提示条的按钮（v2 §9.5、§6.4） ----
    function noticeAction(id, action) {
        const n = notices.get(id);
        if (!n) return { ok: false, reason: 'stats-notice-gone' };
        if (id === 'onboarding') {
            if (action.startsWith('mode:')) {
                const mode = normalizeBuildMode(action.slice(5));
                if (!mode) return { ok: false, reason: 'stats-build-mode-invalid' };
                modeDefault = mode;
                refreshOnboarding();
                return { ok: true };
            }
            if (action === 'quick') return enableForChat({ buildMode: modeDefault });
            if (action === 'decline') { declined = true; store.setDeclined(true); setNotice('onboarding', null); return { ok: true }; }
            if (action === 'build') { modePending = true; setNotice('onboarding', null); return { ok: true, openSettings: 'stats' }; }
        }
        if (id === 'build-mode' && action.startsWith('pick:')) {
            const mode = normalizeBuildMode(action.slice(5));
            if (!mode) return { ok: false, reason: 'stats-build-mode-invalid' };
            if (!ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
            buildMode = mode;
            persist();
            refreshOnboarding();
            return { ok: true, buildMode: mode };
        }
        if (id === 'build-ask' && (action === 'fill' || action === 'auto' || action === 'skip')) {
            const name = String(n.name || '');
            if (!name || !ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
            if (action === 'fill') { askedFill.add(name); refreshBuildAsk(); return { ok: true, openPanel: 'build', name }; }
            buildChoices = { ...buildChoices, [name]: action };
            persist();
            refreshBuildAsk();
            return { ok: true, choice: action };
        }
        if (id === 'hero-pick') {
            heroPickAsked.add(chatIdOf(ctx()));
            setNotice('hero-pick', null);
            return action === 'open' ? { ok: true, openSettings: 'stats' } : { ok: true };
        }
        if (id === 'hero-skills') {
            heroAsked.add(chatIdOf(ctx()));
            setNotice('hero-skills', null);
            return action === 'assign' ? assignHeroSkills({ overwrite: true }) : { ok: true };
        }
        if (id === 'sheets' && action === 'generate') { setNotice('sheets', null); return generateSheets(); }
        if (id === 'roll' && action === 'roll') return manualRoll();
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
        const persona = personaReport.size ? `特质评定人设字数：${[...personaReport].map(([n, r]) => `${n} ${r.len}${r.from === 'floors' ? '（取自正文）' : ''}`).join('、')}` : '';
        return [text, trail, persona].filter(Boolean).join('\n');
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
        if (op === 'note') return setHeroNote(name, payload && payload.text);
        if (op === 'note-prompt') return heroNotePrompt(name);
        if (op === 'trait-note') return setTraitNote(name, payload && payload.text);
        if (op === 'set-worlds') return setWorlds(payload && payload.worlds);
        if (op.startsWith('status-') || op.startsWith('cycle-')) return statusEditOp(op, name, payload || {});
        if (op === 'fame-add') return addFameBar(payload || {});
        if (op === 'fame-fill') return fameFill(payload && payload.sentence);
        if (op === 'fame-draft') { const bar = payload && payload.template ? fameTemplateBar(payload.template) : catalog.fameBars.find((b) => b.name === name); return bar ? { ok: true, draft: fameDraftText(bar) } : { ok: false, reason: 'stats-fame-kind' }; }
        if (op === 'fame-remove') return removeFameBar(name);
        if (op !== 'set') return { ok: false, reason: 'stats-relation-op-unknown' };
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
        return entry ? commitManualRelations(entry, { [name]: dims }) : commitInitialRelations({ [name]: dims });
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
        persist();
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
        let people = [];
        try { people = typeof describePeople === 'function' ? await describePeople([text]) : []; } catch (error) { people = []; }
        try {
            const reply = await ask(request, buildFameFillPrompt(text, { worldview: worldviewOf(), people }));
            const parsed = parseFameFill(reply && typeof reply === 'object' ? reply.text : reply);
            if (!parsed.ok) return { ok: false, reason: 'stats-fame-fill-bad', field: parsed.field };
            return { ok: true, draft: fameDraftText(parsed.bar) };
        } catch (error) { return { ok: false, reason: 'stats-fame-fill-failed' }; }
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
    function heroNotePrompt(name) {
        if (!knownPerson(name)) return { ok: false, reason: 'stats-relation-missing' };
        const hero = userName() || PROTAGONIST;
        const lines = messages(ctx()).filter((m) => m && !m.is_system && typeof m.mes === 'string').slice(-HERO_NOTE_FLOORS)
            .map((m) => `${m.is_user ? hero : (m.name || '旁白')}：${m.mes.replace(/\[igs-[^\]]*\]/g, '').replace(/<[^>]+>/g, '').trim()}`)
            .filter((line) => line.length > 2);
        if (!lines.length) return { ok: false, reason: 'stats-note-no-text' };
        const user = lines.join('\n').slice(-HERO_NOTE_CHARS);
        const system = `根据下面的剧情正文，用一句话写出${hero}（主角）对${name}的态度，以及两人之间已经发生的事。只写正文里明确出现的内容，不推测，不按身份套路补写。不超过四十字，只输出这句话。`;
        return { ok: true, system, user };
    }

    // 演出层 romance 第 3 栏出现过的对象：names 为候选写法（场景素材键、原文），取已登记的那个；都未登记时记第一个。去重后存聊天级目录。
    function noteRomanceSeen(names) {
        if (!active()) return { ok: false, reason: 'stats-inactive' };
        const list = (Array.isArray(names) ? names : [names]).map((n) => String(n || '').trim()).filter((n) => n && !isHero(n));
        if (!list.length) return { ok: true, skipped: true };
        const known = currentStatsState(ledger).characters;
        const name = list.find((n) => known[n]) || list[0];
        if (catalog.romanceSeen.includes(name)) return { ok: true, skipped: true };
        catalog = sanitizeCatalog({ ...catalog, romanceSeen: [...catalog.romanceSeen, name] });
        persist();
        return { ok: true };
    }

    // 把数据库表格里的人物登记进数值账本：关系一律从 0 起，表格里的数字不采用（以 IGS 为准）。
    // 记在最近一楼的 meta.manual 上（空对象只建档不改值），重算本楼也保留。
    function importTablePeople() {
        if (generating) return { ok: false, reason: 'stats-generating' };
        const entry = activeEntryBefore(ledger, Infinity);
        const known = entry ? entry.after.characters : ledger.initial.characters;
        const fresh = [...new Set([...tableNames({ fresh: true }), ...rosterNames()])].filter((name) => !known[name]);
        if (!fresh.length) return { ok: false, reason: 'stats-table-none' };
        const manual = Object.fromEntries(fresh.map((name) => [name, {}]));
        const result = entry ? commitManualRelations(entry, manual) : commitInitialRelations(manual);
        if (!result.ok) return result;
        detectNewCharacters();
        return { ok: true, imported: fresh };
    }

    // 按人设补填起始关系：只处理好感、信任、了解都还在 ±START_FILL_SPAN 以内的已登记角色（视为没定过初值）。
    // 辅助模型只给关系档，初值查 START_DIMS 后叠加到当前值上，开局以来的小幅涨跌保留；判为「陌生」的不改。
    function fillStartRelations() {
        if (startJob) return startJob;
        if (generating) return Promise.resolve({ ok: false, reason: 'stats-generating' });
        // 表格里有、账本还没有的人物先登记，补填时一并算上。
        importTablePeople();
        const entry = activeEntryBefore(ledger, Infinity);
        const blank =(c) => START_FILL_DIMS.every((key) => Math.abs(Number(c.dims && c.dims[key]) || 0) <= START_FILL_SPAN);
        const pending = Object.entries((entry ? entry.after : ledger.initial).characters).filter(([name, c]) => !isHero(name) && blank(c)).map(([name]) => name);
        if (!pending.length) return Promise.resolve({ ok: false, reason: 'stats-start-none' });
        const request = requester();
        if (!request) return Promise.resolve({ ok: false, reason: 'stats-no-model' });
        const chatId = chatIdOf(ctx());
        // 每次只补一批（每人资料最多 3000 字）；本聊天已问过的（判为陌生的仍是空白）排到后面，再点一次补下一批。
        if (startAsked.chatId !== chatId) { startAsked.chatId = chatId; startAsked.names = new Set(); }
        const ordered = [...pending.filter((n) => !startAsked.names.has(n)), ...pending.filter((n) => startAsked.names.has(n))];
        const names = ordered.slice(0, SHEET_BATCH_MAX);
        const left = pending.filter((n) => !startAsked.names.has(n) && !names.includes(n)).length;
        const run = async () => {
            const relations = {};
            const mods = {};
            // 主角资料（用户人设）只取一次，每批都带上。
            let hero = '';
            try { if (typeof describePeople === 'function') hero = String(((await describeWithHero([PROTAGONIST]))[0] || {}).summary || ''); }
            catch (error) { hero = ''; }
            let plot = '';
            try { plot = String(plotSetting() || ''); } catch (error) { plot = ''; }
            for (let i = 0; i < names.length; i += SHEET_BATCH_MAX) {
                const batch = names.slice(i, i + SHEET_BATCH_MAX);
                let people;
                try { people = typeof describePeople === 'function' ? await describePeople(batch) : batch.map((n) => ({ name: n, summary: '' })); }
                catch (error) { people = batch.map((n) => ({ name: n, summary: '' })); }
                const prompt = buildStartRelationRequest(people, { prompt: settings().prompts.startRelations, hero, plot });
                let parsed = null;
                for (let attempt = 0; attempt < 2 && !(parsed && parsed.ok); attempt += 1) {
                    try { parsed = parseStartRelationReply(await ask(request, prompt), { names: batch }); }
                    catch (error) { parsed = { ok: false, reason: 'stats-start-request-failed' }; }
                }
                if (parsed && parsed.ok) {
                    Object.assign(relations, parsed.relations);
                    Object.assign(mods, parsed.mods || {});
                    for (const n of batch) startAsked.names.add(n);
                } else diag(parsed ? parsed.reason : 'stats-start-request-failed');
            }
            if (!ledger || chatIdOf(ctx()) !== chatId) return { ok: false, reason: 'stats-chat-changed' };
            if (generating) return { ok: false, reason: 'stats-generating' };
            if (!Object.keys(relations).length) return { ok: false, reason: 'stats-start-failed' };
            // 等回复期间可能又结算了新楼，按最新一楼重新取当前值。
            const latest = activeEntryBefore(ledger, Infinity);
            const manual = {};
            for (const [name, tier] of Object.entries(relations)) {
                const cur = (latest ? latest.after : ledger.initial).characters[name];
                const fix = startFixOffsets(mods[name]);
                if (!cur || !blank(cur) || (tier === '陌生' && !Object.keys(fix).length)) continue;
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
            const result = latest ? commitManualRelations(latest, manual, (name) => `起始关系·${label(name)}`) : commitInitialRelations(manual);
            return result.ok ? { ok: true, filled, relations, left } : result;
        };
        setNotice('start-relations', { kind: 'busy', text: `正在按人设计算初始关系：${names.join('、')}` });
        startJob = run().then((result) => {
            const more = result && result.ok && result.left ? `；还有 ${result.left} 个角色，再点一次继续` : '';
            setNotice('start-relations', result && result.ok && (result.filled.length || more) ? { kind: 'info', text: `${result.filled.length ? `已补填初始关系：${result.filled.join('、')}` : '本批没有需要改动的角色'}${more}`, ttl: true } : null);
            return result;
        }, (error) => { setNotice('start-relations', null); throw error; }).finally(() => { startJob = null; });
        return startJob;
    }

    // 把 manual（{ 角色: { 好感, 信任, 了解 } }）写进该楼结算结果并记到 meta.manual，重算或重 roll 这一楼仍保留。
    function commitManualRelations(entry, manual, noteOf = null) {
        const changes = [];
        const after = applyManualRelations(entry.after, manual, changes, { nsfw: isNsfw() });
        if (after === entry.after) return { ok: true };
        if (noteOf) for (const row of changes) row.note = noteOf(row.target) || row.note;
        const prev = (entry.meta && entry.meta.manual) || {};
        const merged = { ...prev };
        for (const [name, dims] of Object.entries(manual)) {
            merged[name] = { ...(prev[name] || {}), ...dims };
            if (dims && dims.bars) merged[name].bars = { ...((prev[name] && prev[name].bars) || {}), ...dims.bars };
        }
        const meta = { ...(entry.meta || {}), manual: merged };
        const m = messages(ctx())[entry.messageId];
        if (!m) return { ok: false, reason: 'stats-relation-missing' };
        const all = [...entry.changes, ...changes];
        const record = floorRecord({ messageId: entry.messageId, swipeId: entry.swipeId, tagHash: statTagHash(String(m.mes ?? '')), baseId: entry.baseId ?? null, seed: entry.seed, before: entry.before, after, changes: all, meta, createdAt: Date.now() });
        const key = ledgerKey(ledger, entry.messageId, entry.swipeId);
        ledger.entries.set(key, { ...entry, after, meta, changes: all, recordId: record.id });
        ledger.log = ledger.log.concat(changes.map((row) => ({ floor: key, ...row }))).slice(-STATS_LOG_MAX);
        persist([record]);
        onChange(currentStatsState(ledger), null);
        push();
        return { ok: true };
    }

    // 还没有结算楼层时，改动写进初始状态并重存 init 记录，之后各楼都从这里往下结算。
    function commitInitialRelations(manual) {
        const next = applyManualRelations(ledger.initial, manual, [], { nsfw: isNsfw() });
        if (next === ledger.initial) return { ok: true };
        ledger.initial = next;
        persist([initRecord(next, { createdAt: Date.now() })]);
        onChange(currentStatsState(ledger), null);
        push();
        return { ok: true };
    }

    function sheetOp(op, name, payload = {}) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        const sheets = { ...catalog.sheets };
        if (op === 'remove') { delete sheets[name]; catalog = { ...catalog, sheets, notified: catalog.notified.filter((n) => n !== name) }; }
        // 重新生成不先删旧卡：成功后整张覆盖，失败时旧卡保留。
        else if (op === 'regen') return generateSheets([name]);
        else if (op === 'edit') {
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
        const chatId = chatIdOf(ctx());
        const state = currentStatsState(ledger);
        const engine = engineOf();
        const rows = (catalog.story || []).map((s) => ({ name: s.name, attribute: s.attribute, value: Math.round(Number(profileOf(engine, state, PROTAGONIST, s.name).value) || 0) }));
        if (rows.length < 2) return { ok: true, items: [] };
        let reply;
        try { reply = await ask(request, buildTidyPrompt(rows)); }
        catch (error) { diag('stats-tidy-request-failed'); return { ok: false, reason: 'stats-tidy-failed' }; }
        if (!ledger || chatIdOf(ctx()) !== chatId) return { ok: false, reason: 'stats-chat-changed' };
        return { ok: true, items: parseTidyReply(reply, catalog) };
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

    // NPC 属性档 → 战斗六维 { scores: { str..cha } }。只有新格式（scale:'score'）且六维齐全才有，否则 null；
    // 战斗侧 lifeSource().readAbilities 应先问这里，再回落到战斗账本与推导（规格 §2）。
    function npcAbilities(name) {
        return sheetAbilityScores(catalog.sheets[String(name || '').trim()]);
    }

    function setBuildMode(mode) {
        ensureLoaded(true);
        if (unavailable) return { ok: false, reason: unavailable };
        if (blocked) return { ok: false, reason: blocked };
        const picked = normalizeBuildMode(mode);
        if (!picked) return { ok: false, reason: 'stats-build-mode-invalid' };
        if (ledger) { buildMode = picked; persist(); refreshOnboarding(); return { ok: true }; }
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
        const key = String(name || '').trim();
        if (!key || key.length > 40) return { ok: false, reason: 'stats-build-choice-invalid' };
        if (choice !== null && !BUILD_CHOICES.includes(choice)) return { ok: false, reason: 'stats-build-choice-invalid' };
        if (!ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
        const next = { ...buildChoices };
        if (choice === null) delete next[key]; else next[key] = choice;
        buildChoices = next;
        persist();
        return { ok: true };
    }

    // 设置页「存档」区用：只用缓存（总开关关闭时不读表），暂停的聊天也显示冻结的数值。
    function archiveModel() {
        ensureLoaded();
        const model = ledger ? statsArchiveModel(ledger, { catalog, engine: memoEngineOf(), heroSkills: heroSkillNames(), hasBackup: store.read().hasBackup, walletExtra: combatPoints(), isHero, heroName: userName() }) : null;
        return model ? { ...model, needsPick: needsHeroPick(), heroAttrs: heroAttrs(), aptitude: Object.fromEntries(Object.entries(catalog.aptitude).map(([n, v]) => [n, v.v])), traits: traitSwitchModel(catalog.traits), traitList: Object.fromEntries(Object.keys(catalog.traits).map((n) => [n, { items: listTraits(catalog, n), ...slotUsage(catalog, n) }])), traitNsfw: isNsfw(), statusMap: catalog.statuses || {}, relMap: Object.fromEntries(Object.entries(currentStatsState(ledger).characters || {}).map(([n, c]) => [n, Array.isArray(c.relStates) ? c.relStates : []])), traitAttrs: Object.fromEntries([PROTAGONIST, ...Object.keys(currentStatsState(ledger).characters || {}), ...Object.keys(catalog.sheets || {})].map((n) => [n, gateAttrsOf(n)])), traitCodex: traitCodexStore ? traitCodexStore.get() : null, heroNotes: { ...catalog.heroNotes }, traitNotes: { ...catalog.traitNotes }, landmineKnown: { ...(catalog.landmineKnown || {}) }, fame: fameRows(currentStatsState(ledger), catalog.fameBars), cycleMap: catalog.cycles || {}, statusDay: Number(currentStatsState(ledger).clock && currentStatsState(ledger).clock.day) || 0, worlds: [...(catalog.worlds || [])], worldsManual: [...(catalog.worldsManual || [])] } : null;
    }
    // 对外接口的入口统一包一层 inEvent：同一次调用内战斗开关只取一次。
    const ev = inEvent;
    return {
        sync: ev(sync),
        destroy: detach,
        isActive: ev(active),
        refreshBuildAsk,
        getState: () => (ledger ? currentStatsState(ledger) : null),
        getLedger: () => ledger,
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
        getBuildMode: () => buildMode,
        getBuildChoices: () => ({ ...buildChoices }),
        setBuildMode: ev(setBuildMode),
        setBuildChoice: ev(setBuildChoice),
        pushNow: ev(push),
        resolveDice: ev(resolveDice),
        diceChance: ev(diceChance),
        // 战斗侧合并用：注入「骰序」段的输入，以及按楼取正文检定的回放结果。
        checkPromptInput: ev(checkPromptInput),
        checkReplayFor: ev(checkReplayFor),
        promptActive: ev((type = null) => Boolean(active() && !SKIP_TYPES.has(type) && !background())),
        npcAbilities,
        notices: () => [...notices.values()],
        noticeAction: ev(noticeAction),
        generateSheets: ev(generateSheets),
        runBackfill: ev(runBackfill),
        manualRoll: ev(manualRoll),
        diagnose: ev(diagnose),
        sheetOp: ev(sheetOp),
        relationOp: ev(relationOp),
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
            if (modePending && modeDefault) status.pendingMode = modeDefault;
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
                    kin: hasTrait(state, traitCatalogOf(catalog.traits), p.name, 'kin'),
                    metrics: characterStatMetrics(c, { hudLabel: s.hudLabel, nsfw, stamina: npcStaminaShown(), favorTier: normalizeFavorTier(s.favorMode) }),
                    stage: stageLabel(Number(p.dims.好感) || 0, romance),
                };
            });
            return { nsfw, people };
        }),
        // 状态栏主角条（生命、体力、压力、金钱；金钱为合并余额）：只在总开关与本聊天都启用时返回 lookup，其余名字返回 null。
        protagonistLookup: ev(() => {
            if (!active()) return null;
            const s = settings();
            const metrics = protagonistStatMetrics(currentStatsState(ledger).protagonist.bars, { enabledBars: s.bars, vitals: combatOn() ? protagonistVitals(memoEngineOf()) : null, walletExtra: combatPoints() }).concat(heroFameMetrics(s));
            return (name) => (isHero(name) && metrics.length ? { metrics, stages: [] } : null);
        }),
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
            const state = currentStatsState(ledger);
            const names = present(state);
            return {
                bars: state.protagonist.bars, skills: state.protagonist.skills, clock: state.clock, present: names,
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
            const metrics = protagonistStatMetrics(currentStatsState(ledger).protagonist.bars, { enabledBars: s.bars, vitals: combatOn() ? protagonistVitals(memoEngineOf()) : null, walletExtra: combatPoints() }).concat(heroFameMetrics(s));
            return metrics.length ? { name: userName() || PROTAGONIST, metrics } : null;
        }),
        // 合并余额里数值侧的那一份（战斗账本的主角余额用）；没启用时为 0。
        walletMoney: () => {
            ensureLoaded();
            return active() ? Number(currentStatsState(ledger).protagonist.bars.money) || 0 : 0;
        },
        enableForChat: ev(enableForChat),
        // 本聊天关闭：数值冻结，不清存档（§10A）。战斗开启时锁定为启用。
        disableForChat: ev(() => {
            ensureLoaded(true);
            if (combatOn()) return { ok: false, reason: 'stats-combat-locked' };
            if (unavailable) return { ok: false, reason: unavailable };
            if (blocked) return { ok: false, reason: blocked };
            chatEnabled = false;
            clearPrompt();
            persist();
            return { ok: true };
        }),
        // 等写库与旧存档导入都落完（测试与导出前用）。
        whenSaved: () => Promise.all([tail, importJob ? importJob.promise : null]).then(() => {}),
    };
}
