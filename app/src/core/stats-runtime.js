// 数值系统运行时装配（§3、§4.2、§10A；v2 §5、§6；易错点 A1–A6、B1–B3、H1/H2、N1/N2/N5–N7）。
// 只协调宿主事件、账本、注入与后台请求；结算规则在 scene/stats，正文解析不在这里做。
// 总开关关闭时不挂任何监听（sync 解绑）；本聊天未启用时不注入、不结算，数值冻结。
import { activeEntryBefore, createStatsLedger, currentStatsState, deleteFloorsFrom, ledgerKey, selectSwipe, stateBefore } from '../scene/stats/stat-ledger.js';
import { resettleFloor, settleFloor } from '../scene/stats/stat-ledger-settle.js';
import { settleFloorText } from '../scene/stats/stat-settle.js';
import { createChatStatsStore, emptyCatalog, sanitizeCatalog, sheetAbilityScores } from '../scene/stats/stat-persist.js';
import {
    BUILD_CHOICES, chatEntries, diffChatRecords, floorRecord, importLegacyStats, initRecord, mergeStatLog, normalizeBuildMode, statTagHash, verifyStatImport,
} from '../scene/stats/stat-log.js';
import { hash32 } from '../combat/random.js';
import { BUILD_MODES } from '../combat/abilities.js';
import { checkRollPairsFor, floorCheckOrdinal, floorCheckSwipe, floorIndexOfOrdinal, mergeCheckInputs, replayChecks, upcomingCheckOrdinal, upcomingCheckSwipe, checkCorrections } from '../scene/check-rolls.js';
import { cocCheckCorrections, cocCheckRollsFor, replayCocChecks } from '../scene/stats/stat-coc-checks.js';
import { combatPartyLines } from '../scene/combat-prompt.js';
import { ABILITY_LABELS, abilityKeyOf } from '../combat/abilities.js';
import { readStatsSettings } from '../scene/stats/stat-settings.js';
import { createStatsState } from '../scene/stats/stat-state.js';
import { buildStatsPrompt, mandatesFromFlags } from '../scene/stats/stat-prompt.js';
import { pushStats, withTimeout } from '../data/shujuku/stats-push.js';
import { createStatsMetricsLookup, protagonistStatMetrics } from '../scene/stats/stat-metrics.js';
import { statsArchiveModel } from '../scene/stats/stat-archive.js';
import { matchSkill } from '../scene/stats/stat-skill-match.js';
import { cryptoRandom } from '../scene/stats/stat-rng.js';
import { BUILTIN_SKILLS, CORE_SKILL_NAMES, editStorySkill, mergeStorySkill, registerStorySkill, removeStorySkill } from '../scene/stats/stat-registry.js';
import { DEFAULT_SPECIAL_SKILLS, BASE_ATTRIBUTES } from '../scene/stats/stat-state.js';
import {
    PROTAGONIST, SAN_ATTRIBUTE, attributeNamesOf, chanceOf, checkLine, checkFxDetail, contestCheck, contestFxDetail, contestLine, engineFor, isProtagonist,
    isSocialSkill, modifiersOf, profileOf, protagonistVitals, resolveCheck, resolveDiceRequest, withAbilityMemo,
} from '../scene/stats/stat-engine.js';
import {
    PROTAGONIST_BACKFILL_MAX, SHEET_BATCH_MAX, abilityLine, applyBackfillToSheet, buildBackfillRequest, buildSheetRequest, capSkillTier,
    parseBackfillReply, parseSheetReply, sheetAttributeInput, sheetFromTiers, skillTierOfValue, strongSkills, SKILL_TIERS, bandValue,
} from '../scene/stats/stat-sheets.js';
import { parseDiceCommand } from '../choices/dice-check.js';

export const STATS_PROMPT_KEY = 'igs-stats-state';
const IN_CHAT = 1;
const NONE = -1;
const SKIP_TYPES = new Set(['quiet', 'impersonate']);
const DIAG_MAX = 50;
const SKILLS_LINE_MAX = 12;
const PRESENT_MAX = 3;
const BACKGROUND_TIMEOUT_MS = 60000;

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

// 默认登记：已登记角色、当前角色卡名、群聊成员（§5.1B 条件 1/2）；仅手动档只认已登记角色。
function defaultResolver(c, register) {
    return (name, state) => {
        if (Object.hasOwn(state.characters, name)) return name;
        if (register === 'manual' || !c) return null;
        const names = [c.name2, ...(Array.isArray(c.groupMembers) ? c.groupMembers : [])].filter((n) => typeof n === 'string' && n.trim());
        return names.includes(name) ? name : null;
    };
}

const ATTRIBUTE_WORD = (v) => (v >= 75 ? '顶尖' : v >= 60 ? '出众' : v >= 45 ? '普通' : v >= 35 ? '偏弱' : '很弱');
const PERCEPTION_WORD = ['迟钝，常漏掉细节', '普通，明显的变化能注意到', '敏锐，能察觉异样', '很敏锐，能发现藏起来的线索', '极其敏锐，几乎不会漏掉什么'];
const signed = (n) => (n >= 0 ? `+${n}` : String(n));
const IS_COC = (engine) => engine.ruleset.ID === 'coc7';
// 属性所属体系的检定：战斗六维之外，主角技能表里只放 8 个特有技能与成长过的技能（含CoC的理智）。
const learnedSkills = (state) => Object.entries(state.protagonist.skills)
    .filter(([name]) => !BASE_ATTRIBUTES.includes(name) && name !== SAN_ATTRIBUTE)
    .map(([name, s]) => [name, Number(s && s.value) || 0]).filter(([, v]) => v >= 25)
    .sort((a, b) => b[1] - a[1]).slice(0, SKILLS_LINE_MAX);

// 主角技能一行（v2 §8 skills 段），按规则体系分流：D&D写检定修正（力量+2），CoC写百分制档位词；技能只列入门以上，不写数字。
function skillsLineOf(engine, state) {
    const coc = IS_COC(engine);
    const names = attributeNamesOf(engine);
    const attrs = names.map((name) => {
        const p = profileOf(engine, state, PROTAGONIST, name);
        return coc ? `${name}${ATTRIBUTE_WORD(Number(p.value) || 50)}` : `${name}${signed(engine.ruleset.bonusOf(p))}`;
    });
    const learned = learnedSkills(state).map(([name, v]) => `${name}${skillTierOfValue(v)}`);
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
    getPushClient = () => null, pushOptions = {}, isBackground = () => false, getBackgroundRequest = () => null,
    describePeople = null, sheetStore = null, onCheck = () => {}, onNotices = () => {}, resumeReply = null, worldviewOf = () => '',
    // v0.39 注入点：战斗侧生命/六维来源、数据库表读写通道、战斗提示词输入、战斗扩展是否开启。
    combatSource = () => null, statsTables = () => null, combatPrompt = () => null, combatEnabled = () => false,
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
    const heroPrefs = () => (ledger && currentStatsState(ledger).protagonist.prefs) || null;
    const userName = () => String((ctx() && ctx().name1) || '');
    // 钱包：战斗侧主角积分净流水（战斗扩展开着且战斗数据已就绪才有，否则 0）；与数值侧金钱相加即合并余额。
    const combatPoints = () => {
        if (!combatOn()) return 0;
        const s = life();
        try { return s && typeof s.readPoints === 'function' ? Number(s.readPoints()) || 0 : 0; } catch (error) { return 0; }
    };
    // 引擎读数闭包保持稳定（引用不变引擎缓存才命中）；每次调用时再取战斗源，userName 用 getter 随时取最新。
    const readers = {
        readAbilities: (name) => { const s = life(); return s && typeof s.readAbilities === 'function' ? s.readAbilities(name, { heroPrefs: heroPrefs() }) : null; },
        readVitals: (name) => { const s = life(); return s && typeof s.readVitals === 'function' ? s.readVitals(name, { heroPrefs: heroPrefs() }) : null; },
        get userName() { return userName(); },
    };
    const engineOf = (ruleset) => engineFor(catalog, settings(), ruleset === undefined ? settings().ruleset : ruleset, readers);
    // 一次注入或结算内用：读数按名字记忆化，避免同一名字反复折叠战斗账本。
    const memoEngineOf = (ruleset) => withAbilityMemo(engineOf(ruleset));
    const background = () => { try { return Boolean(isBackground()); } catch (error) { return false; } };
    const present = (state) => {
        const names = typeof presentOf === 'function' ? presentOf(state) : Object.keys(state.characters).sort((a, b) => (state.characters[b].lastSeenDay || 0) - (state.characters[a].lastSeenDay || 0));
        return names.filter((n) => state.characters[n]);
    };

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
        if (!t.ok) { unavailable = t.reason; diag(t.reason); loadedKey = cacheKey(null); return; }
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
        if (offs.length || (inflight > 0 && inflightChat === chatIdOf(ctx()))) return;
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
        if (!active() || !settings().push.enabled) return Promise.resolve({ ok: true, skipped: true });
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        if (!client) return Promise.resolve({ ok: false, reason: 'stats-push-no-client' });
        const run = () => {
            const state = currentStatsState(ledger);
            return pushStats(client, state, { ...pushOptions, overridesByFingerprint: settings().push.mappings, baseAttributes: baseAttributesOf(state) }).then((r) => {
                if (!r.ok) diag(r.reason || 'stats-push-partial', { failures: (r.failures || []).length });
                (r.diagnostics || []).forEach((d) => diag(d.code, d));
                return r;
            }, (error) => { diag('stats-push-threw', { error: String(error && error.message || error) }); return { ok: false, reason: 'stats-push-threw' }; });
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
    const isHero = (name) => isProtagonist(name) || (!!userName() && String(name || '').trim() === userName());

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
                const skills = name === PROTAGONIST ? learnedSkills(state) : Object.entries(catalog.sheets[name].skills || {});
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
                const check = resolveCheck(engine, state, { actor: PROTAGONIST, skill: hit.skill, difficulty: hit.difficulty, toward, source: 'input' }, cryptoRandom);
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
            walletExtra: combatPoints(), present: names, shortfall: flags.shortfall, mandates: mandatesFromFlags(flags, state.protagonist.bars), vitals,
            nsfw: isNsfw(), intimacyGate: s.intimacyGate, prompts: s.prompts, check: g.check || g.display || null, stageText: s.stageText,
            disabled: Object.entries(s.segments || {}).filter(([, on]) => on === false).map(([id]) => id),
            skillsLine: skillsLineOf(engine, state), perceptionLine: perceptionLineOf(engine, state),
            sheetLines: sheetNames.map((n) => ({ name: n, rank: catalog.sheets[n].rank, strong: strongSkills(catalog.sheets[n]), bonus: abilityLine(engine, state, n) })),
            manualRoll: Boolean(g.manual), dice, cocDice: coc ? own : null,
            combatOn: combatOnNow, partyLines: combatOnNow && combat.party ? combatPartyLines(combat.party) : [],
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

    function settleAt(messageId, { redo = false, plan = null } = {}) {
        const c = ctx();
        const m = messages(c)[messageId];
        if (!m || m.is_user || m.is_system) return null;
        const floor = { messageId, swipeId: Number(m.swipe_id) || 0 };
        const s = settings();
        const resolve = resolveCharacter || defaultResolver(c, s.register);
        const prior = ledger.entries.get(ledgerKey(ledger, messageId, floor.swipeId));
        const priorMeta = (prior && prior.meta) || {};
        const p = plan || { check: givenCheck(priorMeta), preroll: priorMeta.preroll || null, note: priorMeta.note || null, ruleset: (priorMeta.check && priorMeta.check.ruleset) || (priorMeta.preroll && priorMeta.preroll.ruleset) };
        const check = p.check !== undefined ? p.check : givenCheck(priorMeta);
        const ruleset = p.ruleset || (check && check.ruleset) || s.ruleset;
        const engine = memoEngineOf(ruleset);
        const chatId = chatIdOf(c);
        const body = String(m.mes ?? '');
        // 同一楼同一 swipe 的结算种子与骰序都由「聊天 + 楼序号 + swipe」决定（确定性）。
        const ordinal = floorCheckOrdinal(messages(c), messageId);
        const seed = settleSeed(chatId, ordinal, floor.swipeId);
        const rollPairs = ordinal ? rollsFor(IS_COC(engine), chatId, ordinal, floor.swipeId) : null;
        const settle = (before, random) => {
            let storyChecks = [];
            if (s.storyCheck === 'preroll' && /\[igs-check:/.test(body)) {
                const back = replayFloor(messageId, body, before, engine);
                if (back.ok) storyChecks = storyChecksOf(back.results, engine, before);
                else diag('stats-check-replay-unavailable', { messageId, reason: back.reason });
            }
            const r = settleFloorText(before, body, {
                random, nsfw: isNsfw(), resolveCharacter: (name) => resolve(name, before), engine,
                check, preroll: p.preroll || null, rollPairs, storyChecks, catalog, settings: s, floor: messageId, noBattle: combatOn(), walletExtra: combatPoints(),
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
        refreshLife({ write: true, messageIds: [messageId], battleHurts: new Map(hurt ? [[messageId, hurt]] : []) });
        if (meta.check && meta.check.source === 'roll' && !redo) playCheck(meta.check, messageId);
        if (meta.pendingRoll && s.storyCheck === 'manual') offerManualRoll(r.entry);
        detectNewCharacters();
        scheduleBackfill();
        return r;
    }

    // 剧情新技能：进注册表、进补全队列、提示一次（v2 §6.1）。
    function commitSkill(name, { attribute, floor } = {}) {
        const r = registerStorySkill(catalog, name, { attribute, floor });
        if (!r.created) return r.name;
        catalog = { ...r.catalog, queue: { ...catalog.queue, skills: [...new Set([...catalog.queue.skills, r.name])] } };
        setNotice(`skill:${r.name}`, { kind: 'info', text: `新技能：${r.name}（${r.entry.attribute}）`, ttl: true });
        return r.name;
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
        return settings().push.enabled ? withTimeout(push()) : undefined;
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
    function enableForChat({ initial, buildMode: pickedMode } = {}) {
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
                    return enableForChat({ initial, buildMode: pickedMode });
                }, () => ({ ok: false, reason: 'stats-log-create-failed' })).finally(() => { creating = false; });
            }
            ledger = createStatsLedger(chatId, initial || createStatsState());
            extra.push(initRecord(ledger.initial, { createdAt: Date.now() }));
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
        const fresh = Object.keys(state.characters).filter((n) => !catalog.sheets[n] && !catalog.notified.includes(n));
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
        const targets = (names && names.length ? names : catalog.queue.people).slice(0, SHEET_BATCH_MAX);
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
                sheets[name] = tidySheet(sheetFromTiers(name, tiers, { chatSeed }));
                if (sheetStore && card) sheetStore.put(card, name, sheets[name]);
            }
            const done = Object.keys(parsed.sheets);
            catalog = { ...catalog, sheets, queue: { ...catalog.queue, people: catalog.queue.people.filter((n) => !done.includes(n)) } };
            persist();
            setNotice('sheets', catalog.queue.people.length
                ? { kind: 'sheets', text: `还有 ${catalog.queue.people.length} 位角色没有数值`, actions: [['generate', '生成数值'], ['dismiss', '稍后']] }
                : { kind: 'info', text: `已生成数值：${done.join('、')}`, ttl: true });
            onChange(currentStatsState(ledger), null);
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
        const skills = catalog.queue.skills.slice(0, 6);
        if (!skills.length) return Promise.resolve({ ok: true, skipped: true });
        const npcs = Object.keys(catalog.sheets).slice(0, SHEET_BATCH_MAX - 1);
        const chatSeed = chatIdOf(ctx());
        const run = async () => {
            let people;
            try { people = typeof describePeople === 'function' ? await describePeople([...npcs, PROTAGONIST]) : [...npcs, PROTAGONIST].map((name) => ({ name, summary: '' })); }
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
            for (const name of npcs) if (parsed.fills[name]) sheets[name] = applyBackfillToSheet(sheets[name], parsed.fills[name], { name, chatSeed });
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
        const name = commitSkill(pr.skill, { attribute: pr.attribute, floor: entry.messageId }) || pr.skill;
        const check = resolveCheck(engineOf(), entry.before, { actor: PROTAGONIST, skill: name, difficulty: pr.difficulty, against: pr.against, opposedSkill: pr.opposedSkill, source: 'manual' }, cryptoRandom);
        manualCheck = { messageId: entry.messageId, check };
        setNotice('roll', null);
        playCheck(check, entry.messageId);
        if (typeof resumeReply === 'function') Promise.resolve().then(() => resumeReply()).catch(() => diag('stats-resume-failed'));
        return { ok: true, check };
    }

    // ---- 选项骰子（v2 §5.1） ----
    function resolveDice(raw, { userName: who = '' } = {}) {
        if (!active()) return null;
        const command = parseDiceCommand(raw);
        if (command.kind !== 'check' && command.kind !== 'contest') return null;
        const state = currentStatsState(ledger);
        const c = ctx();
        const resolve = resolveCharacter || defaultResolver(c, settings().register);
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
        const mine = isProtagonist(req.left.actor) ? { ...result.left, success: result.winner === 'left' } : isProtagonist(req.right.actor) ? { ...result.right, success: result.winner === 'right' } : null;
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
    function sheetOp(op, name, payload = {}) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        const sheets = { ...catalog.sheets };
        if (op === 'remove') { delete sheets[name]; catalog = { ...catalog, sheets, notified: catalog.notified.filter((n) => n !== name) }; }
        else if (op === 'regen') { delete sheets[name]; catalog = { ...catalog, sheets }; persist(); return generateSheets([name]); }
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

    function skillOp(op, name, payload = {}) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        if (op === 'edit') catalog = editStorySkill(catalog, name, payload);
        else if (op === 'merge') catalog = mergeStorySkill(catalog, name, engineOf().registry.resolve(payload.to) || payload.to);
        else if (op === 'remove') catalog = removeStorySkill(catalog, name);
        else return { ok: false, reason: 'stats-skill-op-unknown' };
        catalog = sanitizeCatalog(catalog);
        persist();
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

    // 对外接口的入口统一包一层 inEvent：同一次调用内战斗开关只取一次。
    const ev = inEvent;
    return {
        sync: ev(sync),
        destroy: detach,
        isActive: ev(active),
        refreshBuildAsk,
        getState: () => (ledger ? currentStatsState(ledger) : null),
        getLedger: () => ledger,
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
        skillOp: ev(skillOp),
        // 旧版备份已不再写入；这里只保留「删除旧版备份」按钮的清理入口。
        dropBackup: () => store.dropBackup(),
        // 设置页「存档」区用：只用缓存（总开关关闭时不读表），暂停的聊天也显示冻结的数值。
        archive: ev(() => {
            ensureLoaded();
            return ledger ? statsArchiveModel(ledger, { catalog, engine: memoEngineOf(), hasBackup: store.read().hasBackup }) : null;
        }),
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
            return createStatsMetricsLookup(currentStatsState(ledger), { hudLabel: settings().hudLabel, nsfw: isNsfw(), sheets: catalog.sheets, engine: memoEngineOf() });
        }),
        // 状态栏主角条（生命、体力、压力、金钱；金钱为合并余额）：只在总开关与本聊天都启用时返回 lookup，其余名字返回 null。
        protagonistLookup: ev(() => {
            if (!active()) return null;
            const s = settings();
            const metrics = protagonistStatMetrics(currentStatsState(ledger).protagonist.bars, { enabledBars: s.bars, vitals: combatOn() ? protagonistVitals(memoEngineOf()) : null, walletExtra: combatPoints() });
            return (name) => (isHero(name) && metrics.length ? { metrics, stages: [] } : null);
        }),
        // 合并余额里数值侧的那一份（战斗账本的主角余额用）；没启用时为 0。
        walletMoney: () => (active() ? Number(currentStatsState(ledger).protagonist.bars.money) || 0 : 0),
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
