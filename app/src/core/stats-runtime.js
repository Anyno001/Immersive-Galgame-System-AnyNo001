// 数值系统运行时装配（§3、§4.2、§10A；v2 §5、§6；易错点 A1–A6、B1–B3、H1/H2、N1/N2/N5–N7）。
// 只协调宿主事件、账本、注入与后台请求；结算规则在 scene/stats，正文解析不在这里做。
// 总开关关闭时不挂任何监听（sync 解绑）；本聊天未启用时不注入、不结算，数值冻结。
import { activeEntryBefore, createStatsLedger, currentStatsState, deleteFloorsFrom, ledgerKey, selectSwipe, stateBefore } from '../scene/stats/stat-ledger.js';
import { resettleFloor, settleFloor } from '../scene/stats/stat-ledger-settle.js';
import { hash32 } from '../combat/random.js';
import { checkCorrections, checkRollPairsFor, floorCheckOrdinal, floorCheckSwipe, floorIndexOfOrdinal, formatActorBonuses, mergeCheckInputs, replayChecks, upcomingCheckOrdinal, upcomingCheckSwipe } from '../scene/check-rolls.js';
import { combatPartyLines } from '../scene/combat-prompt.js';
import { ABILITY_LABELS, abilityKeyOf } from '../combat/abilities.js';
import { settleFloorText } from '../scene/stats/stat-settle.js';
import { createChatStatsStore, emptyCatalog, sanitizeCatalog } from '../scene/stats/stat-persist.js';
import { BUILD_CHOICES, chatEntries, diffChatRecords, floorRecord, importLegacyStats, initRecord, mergeStatLog, normalizeBuildMode, statTagHash, verifyStatImport } from '../scene/stats/stat-log.js';
import { normalizeStatsSettings } from '../scene/stats/stat-settings.js';
import { createStatsState } from '../scene/stats/stat-state.js';
import { buildStatsPrompt, mandatesFromFlags } from '../scene/stats/stat-prompt.js';
import { pushStats, withTimeout } from '../data/shujuku/stats-push.js';
import { createStatsMetricsLookup } from '../scene/stats/stat-metrics.js';
import { statsArchiveModel } from '../scene/stats/stat-archive.js';
import { matchSkill } from '../scene/stats/stat-skill-match.js';
import { cryptoRandom } from '../scene/stats/stat-rng.js';
import { BUILTIN_SKILLS, CORE_SKILL_NAMES, editStorySkill, mergeStorySkill, registerStorySkill, removeStorySkill } from '../scene/stats/stat-registry.js';
import { DEFAULT_SPECIAL_SKILLS, BASE_ATTRIBUTES } from '../scene/stats/stat-state.js';
import {
    PROTAGONIST, chanceOf, checkLine, checkFxDetail, contestCheck, contestFxDetail, contestLine, createEngine, isProtagonist,
    isSocialSkill, modifiersOf, profileOf, protagonistVitals, resolveCheck, resolveDiceRequest,
} from '../scene/stats/stat-engine.js';
import {
    PROTAGONIST_BACKFILL_MAX, SHEET_BATCH_MAX, ATTRIBUTE_TIERS, applyBackfillToSheet, buildBackfillRequest, buildSheetRequest, capSkillTier,
    parseBackfillReply, parseSheetReply, sheetFromTiers, skillTierOfValue, strongSkills, SKILL_TIERS, bandValue,
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

// 本楼种子（合并计划 P3）：聊天 ID + AI 楼序号 + swipe 序号；同一 swipe 重算、重开聊天结果不变，换 swipe 换一组。
// 没有聊天 ID 或楼号时返回 null（调用方退回加密随机）。
function floorSeedOf(chatId, ordinal, swipeId, kind = 'settle') {
    const id = String(chatId || '').trim();
    if (!id || !Number.isSafeInteger(ordinal) || ordinal < 1) return null;
    return hash32(`igs-stat-${kind}|${id}|${ordinal}|s${Number.isSafeInteger(swipeId) && swipeId > 0 ? swipeId : 0}`);
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

const PERCEPTION_WORD = ['迟钝，常漏掉细节', '普通，明显的变化能注意到', '敏锐，能察觉异样', '很敏锐，能发现藏起来的线索', '极其敏锐，几乎不会漏掉什么'];
// 属性加值：引擎内属性值 = 战斗分值 × 5，加值按 D&D 调整值 floor((分值 − 10) / 2)。
const signed = (n) => (n >= 0 ? `+${n}` : String(n));
const abilityModOfValue = (v) => Math.floor((Math.round((Number(v) || 50) / 5) - 10) / 2);

// 主角技能档位一行（v2 §8 skills 段）：六维写加值（战斗属性视图），技能只列入门以上。
function skillsLineOf(engine, state) {
    const skills = state.protagonist.skills;
    const attrs = BASE_ATTRIBUTES.map((name) => `${name}${signed(abilityModOfValue(profileOf(engine, state, PROTAGONIST, name).value))}`);
    const learned = Object.entries(skills).filter(([name]) => !BASE_ATTRIBUTES.includes(name))
        .map(([name, s]) => [name, Number(s && s.value) || 0]).filter(([, v]) => v >= 25)
        .sort((a, b) => b[1] - a[1]).slice(0, SKILLS_LINE_MAX).map(([name, v]) => `${name}${skillTierOfValue(v)}`);
    return `属性：${attrs.join('、')}${learned.length ? `；技能：${learned.join('、')}` : ''}`;
}

function perceptionLineOf(engine, state) {
    const p = profileOf(engine, state, PROTAGONIST, state.protagonist.skills.侦查 ? '侦查' : '感知');
    const passive = engine.ruleset.passiveValue(p);
    return PERCEPTION_WORD[passive >= 18 ? 4 : passive >= 15 ? 3 : passive >= 12 ? 2 : passive >= 9 ? 1 : 0];
}

export function createStatsRuntime({
    getContext, readSettings, resolveCharacter, isNsfw = () => false, presentOf = null, onChange = () => {},
    getPushClient = () => null, pushOptions = {}, isBackground = () => false, getBackgroundRequest = () => null,
    describePeople = null, sheetStore = null, onCheck = () => {}, onNotices = () => {}, resumeReply = null, worldviewOf = () => '',
    // 战斗账本提供的六维与生命（合并计划 Q1/Q4）：() → { ready, readAbilities(name, { heroPrefs }), readVitals(name, { heroPrefs }), refresh({ write, messageIds, battleHurts, heroPrefs }) } | null。
    combatSource = () => null,
    // 数值日志表（合并计划 P4 / Q7）：() → { ok, read(), append(records), ensure() } | { ok:false, reason }。缺失时数值系统不可用（fail-closed）。
    statsTables = () => null,
    // 卡牌战斗侧的提示词输入（合并计划 P5）：(generationType) → { enabled, check, party } | null；check 为战斗侧骰序输入，party 为主角团状态。
    combatPrompt = () => null,
    // 卡牌战斗是否开启（合并计划 P6）：开启时数值系统总开关与本聊天开关视为开启、本聊天不能单独关闭，新聊天直接启用，速算不结算。
    combatEnabled = () => false,
} = {}) {
    const store = createChatStatsStore(getContext);
    let ledger = null;
    let chatEnabled = false;
    // 建档方式（P8c）：按聊天保存在数值日志的聊天级键；null 为未选（按自动处理）。buildChoices：手动建档下逐角色的「自动」或「跳过」。
    let buildMode = null;
    let buildChoices = {};
    let learned = {};
    let catalog = emptyCatalog();
    let blocked = '';
    let declined = false;
    let generating = null;
    let offs = [];
    let pushing = null;
    let pendingOption = null;
    let manualCheck = null;
    // 日志表状态：blocked 为不可恢复的阻断（宿主不支持、存档版本更新、导入失败）；unready 为暂时不可读（数据库未载入、读表失败、导入中）。
    let unready = '';
    let baseline = new Map();
    let writeSeq = 0;
    let lastSave = Promise.resolve();
    let importJob = null;
    let importFailure = null;
    let sheetJob = null;
    let backfillJob = null;
    const notices = new Map();
    const diagnostics = [];

    const ctx = () => { try { return getContext(); } catch (error) { return null; } };
    const combatOn = () => { try { return combatEnabled() === true; } catch (error) { return false; } };
    const settings = () => {
        const s = normalizeStatsSettings(readSettings ? readSettings() : null);
        return combatOn() && !s.enabled ? { ...s, enabled: true } : s;
    };
    const active = () => Boolean(settings().enabled && chatEnabled && ledger);
    const source = () => { try { return combatSource() || null; } catch (error) { return null; } };
    const heroPrefs = () => (ledger ? currentStatsState(ledger).protagonist.prefs || null : null);
    const engineOf = (ruleset) => {
        const src = source();
        const read = (fn) => (src && typeof fn === 'function' ? (name) => fn(name, { heroPrefs: heroPrefs() }) : null);
        return createEngine(catalog, settings(), ruleset, {
            readAbilities: read(src && src.readAbilities), readVitals: read(src && src.readVitals),
            userName: (ctx() && ctx().name1) || '',
        });
    };
    // 生命条目同步（合并计划 N3）：结算后把本楼剧情受伤 / 速算伤势 / 回血写进战斗日志，换 swipe、删楼后只重新归并；完成后通知界面刷新。
    // 写入失败只记诊断，不改数值存档（伤势以战斗日志为准，下次结算或换聊天时补扫）。
    function syncLife(opts = {}) {
        const src = source();
        if (!src || typeof src.refresh !== 'function') { diag('stats-life-source-missing'); return Promise.resolve({ ok: false, reason: 'stats-life-source-missing' }); }
        return Promise.resolve().then(() => src.refresh({ ...opts, heroPrefs: heroPrefs() })).then((r) => {
            if (!r || r.ok !== true) diag('stats-life-sync-failed', { reason: r && r.reason });
            if (r && r.reason !== 'request-stale' && ledger) onChange(currentStatsState(ledger), null);
            return r;
        }, (error) => { diag('stats-life-sync-threw', { error: String(error && error.message || error) }); return { ok: false, reason: 'stats-life-sync-threw' }; });
    }
    const diag = (code, extra = {}) => { diagnostics.push({ code, ...extra }); if (diagnostics.length > DIAG_MAX) diagnostics.shift(); };
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

    const chatOf = (c) => (c && Array.isArray(c.chat) ? c.chat : []);
    const dbOf = () => {
        let db = null;
        try { db = statsTables(); } catch (error) { db = null; }
        return db && db.ok === true ? db : { ok: false, reason: (db && db.reason) || 'stats-db-missing' };
    };

    function adopt(merged) {
        ledger = merged.ledger;
        chatEnabled = merged.chatEnabled;
        buildMode = merged.buildMode ?? null;
        buildChoices = merged.buildChoices || {};
        catalog = merged.catalog;
        learned = merged.learned;
        baseline = merged.baseline;
    }

    // 读档（合并计划 P4）：真值在 IGS数值·日志。表里有 init 即按日志归并；没有 init 而聊天元数据留有旧 igs_stats 时一次性导入（异步，期间不可用）。
    // 读表失败、数据库未载入记为 unready（不当作没有存档）；宿主不支持、存档版本更新、导入失败记为 blocked，不写任何东西。
    function load() {
        ledger = null; chatEnabled = false; buildMode = null; buildChoices = {}; blocked = ''; unready = ''; learned = {}; catalog = emptyCatalog(); declined = false; baseline = new Map();
        pendingOption = null; manualCheck = null;
        notices.clear();
        const meta = store.read();
        if (!meta.ok) { unready = meta.reason; diag('stats-read-failed', { reason: meta.reason }); return; }
        declined = meta.declined === true;
        const db = dbOf();
        if (!db.ok) { blocked = db.reason; diag(db.reason); return; }
        const read = db.read();
        if (!read || read.ok !== true) { unready = (read && read.reason) || 'stats-log-read-failed'; diag('stats-log-read-failed', { reason: unready }); return; }
        const c = ctx();
        const id = chatIdOf(c);
        if (Array.isArray(read.stats)) {
            const merged = mergeStatLog(read.stats, { chatId: id, chat: chatOf(c) });
            merged.diagnostics.forEach((d) => diag(d.code, d));
            if (merged.ledger) { adopt(merged); return; }
        }
        if (!meta.raw) return;
        if (importFailure && importFailure.chatId === id) {
            blocked = importFailure.reason;
            setNotice('import', { kind: 'info', text: `旧数值存档导入失败：${importFailure.reason}` });
            return;
        }
        startImport(meta.raw, db, !Array.isArray(read.stats));
    }

    // 旧 igs_stats 导入：全部写入并逐条读回核对后才切换；原元数据不删除，失败时保持旧档不动并显示原因。
    function startImport(raw, db, missingTable) {
        const c = ctx();
        const id = chatIdOf(c);
        const plan = importLegacyStats(raw, { chatId: id, chat: chatOf(c), createdAt: Date.now() });
        // 读不懂的存档不覆盖：留给新版本或用户处理（持久化边界，拒绝须可诊断）。
        if (!plan.ok) { blocked = plan.reason; diag(plan.reason); return; }
        unready = 'stats-importing';
        if (importJob && importJob.chatId === id) return;
        const job = { chatId: id, promise: null };
        job.promise = (async () => {
            if (missingTable) {
                const made = await db.ensure();
                if (!made || made.ok !== true) return { ok: false, reason: (made && made.reason) || 'stats-log-create-failed' };
            }
            const w = await db.append(plan.records);
            if (!w || w.ok !== true || (w.pending || []).length) return { ok: false, reason: (w && (w.reason || (w.rejected && w.rejected[0] && w.rejected[0].reason))) || 'stats-import-write-failed' };
            const back = db.read();
            if (!back || back.ok !== true || !Array.isArray(back.stats)) return { ok: false, reason: (back && back.reason) || 'stats-import-readback-failed' };
            return verifyStatImport(mergeStatLog(back.stats, { chatId: id, chat: chatOf(ctx()) }), plan);
        })().catch(() => ({ ok: false, reason: 'stats-import-threw' })).then((r) => {
            if (importJob === job) importJob = null;
            if (chatIdOf(ctx()) !== id) return r;
            if (r.ok) {
                diag('stats-import-done', { skipped: plan.skipped.length });
                if (plan.dropped.length) diag('stats-save-entries-dropped', { count: plan.dropped.length });
                if (plan.learnedDropped) diag('stats-learned-dropped', { count: plan.learnedDropped });
            }
            else { importFailure = { chatId: id, reason: r.reason }; diag('stats-import-failed', { reason: r.reason }); }
            load();
            if (r.ok) setNotice('import', { kind: 'info', text: '已导入旧数值存档', ttl: true });
            onChange(ledger ? currentStatsState(ledger) : null, null);
            refreshOnboarding();
            if (active()) syncLife();
            return r;
        });
        importJob = job;
    }

    // 写入失败：记诊断并提示；聊天级基线按表里实际内容重建，下次写入补上缺的键。
    function failWrite(r) {
        const reason = (r && (r.reason || (r.rejected && r.rejected[0] && r.rejected[0].reason))) || 'stats-log-write-failed';
        diag('stats-log-write-failed', { reason });
        setNotice('save', { kind: 'info', text: `数值记录未写入数据库：${reason}` });
        const db = dbOf();
        const read = db.ok ? db.read() : null;
        if (read && read.ok === true && Array.isArray(read.stats)) baseline = mergeStatLog(read.stats, { chatId: chatIdOf(ctx()), chat: chatOf(ctx()) }).baseline;
    }

    // 追加本次变化：楼层 / init 记录（extra）+ 聊天级数据与基线的差异。写入排进数据库的受控队列，结果异步核对。
    function persist(extra = []) {
        if (!ledger || blocked || unready) return null;
        const db = dbOf();
        if (!db.ok) { failWrite({ reason: db.reason }); return null; }
        const next = chatEntries({ chatEnabled, catalog, learned, buildMode, buildChoices });
        writeSeq += 1;
        const records = [...extra, ...diffChatRecords(baseline, next, { tag: `${Date.now().toString(36)}${writeSeq}`, createdAt: Date.now() })];
        baseline = next;
        if (!records.length) return null;
        pendingWrites += 1;
        pendingChat = chatIdOf(ctx());
        const run = Promise.resolve().then(() => db.append(records)).then((r) => { if (!r || r.ok !== true) failWrite(r); return r; },
            () => { const r = { ok: false, reason: 'stats-log-write-threw' }; failWrite(r); return r; })
            .finally(() => { pendingWrites -= 1; });
        lastSave = Promise.all([lastSave, run]).then(() => undefined);
        return run;
    }

    // 未挂监听时（总开关关闭、设置页操作）每次调用前重读日志表；本运行时对同一聊天还有未完成的写入时沿用内存状态，不拿表里的旧内容覆盖。
    let pendingWrites = 0;
    let pendingChat = '';
    function reloadCold() {
        if (offs.length) return;
        if (pendingWrites > 0 && pendingChat === chatIdOf(ctx())) return;
        load();
    }

    // 单向推送到表格（§8A）：子开关关或没装表格插件时什么都不做；失败只记诊断，不影响结算。
    // 同一时间只跑一次推送，后到的请求排在当前这次之后。
    function push() {
        if (!active() || !settings().push.enabled) return Promise.resolve({ ok: true, skipped: true });
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        if (!client) return Promise.resolve({ ok: false, reason: 'stats-push-no-client' });
        // 基础属性只在属性视图已就绪时推送战斗六维分值；未就绪时不写，避免把默认推导值当真值写进表格。
        const baseAttributesOf = (state) => {
            const src = source();
            if (!src || src.ready !== true) return null;
            const engine = engineOf();
            return Object.fromEntries(BASE_ATTRIBUTES.map((name) => [name, Math.round((Number(profileOf(engine, state, PROTAGONIST, name).value) || 50) / 5)]));
        };
        const run = () => { const state = currentStatsState(ledger); return pushStats(client, state, { ...pushOptions, overridesByFingerprint: settings().push.mappings, baseAttributes: baseAttributesOf(state) }); };
        const runLogged = () => run().then((r) => {
            if (!r.ok) diag(r.reason || 'stats-push-partial', { failures: (r.failures || []).length });
            (r.diagnostics || []).forEach((d) => diag(d.code, d));
            return r;
        }, (error) => { diag('stats-push-threw', { error: String(error && error.message || error) }); return { ok: false, reason: 'stats-push-threw' }; });
        pushing = (pushing || Promise.resolve()).then(runLogged, runLogged);
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

    // 本楼检定计划（v2 §5 优先级）：继续生成沿用；选项骰子 > 手动掷骰 > 输入匹配 > 预掷 / 掷骰规则。
    function planCheck(type, c, ruleset) {
        const engine = engineOf(ruleset);
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
        // 自动档（合并计划 P3）：不再预掷，正文检定用每楼 10 对骰（checkPromptInput 注入、结算时复算）。
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
        const engine = engineOf(g.ruleset);
        const names = present(state);
        const vitals = protagonistVitals(engine);
        // 「数值与战斗」合并段（合并计划 P5）：本楼骰序、战斗标签与主角团状态由本段一并给出，bootstrap 不再另注入。
        let combat = null;
        try { combat = typeof combatPrompt === 'function' ? combatPrompt(g.type) : null; } catch (error) { combat = null; }
        const combatOn = Boolean(combat && combat.enabled);
        let own = null;
        try { own = checkPromptInput(g.type); } catch (error) { own = null; }
        const checkInput = mergeCheckInputs(own, combat && combat.check);
        const srcs = storyCheckSources(engine, state);
        const bonusOf = (name) => { if (!srcs.ok) return ''; try { return formatActorBonuses(srcs.readAbilities(name)); } catch (error) { return ''; } };
        const heroName = userNameNow() || PROTAGONIST;
        const sheetNames = names.filter((n) => catalog.sheets[n]);
        // 主角与有角色卡的在场人物已在 skills / sheets 写出加值，骰序段只列其余人物。
        const covered = new Set([heroName, PROTAGONIST, ...sheetNames]);
        const dice = checkInput ? { ...checkInput, actors: (checkInput.actors || []).filter((a) => a && !covered.has(a.name) && !isHero(a.name)) } : null;
        const built = buildStatsPrompt(state, {
            present: names, shortfall: flags.shortfall,mandates: mandatesFromFlags(flags, vitals), vitals,
            nsfw: isNsfw(), intimacyGate: s.intimacyGate, prompts: s.prompts, check: g.check || g.display || null, stageText: s.stageText,
            disabled: Object.entries(s.segments || {}).filter(([, on]) => on === false).map(([id]) => id),
            skillsLine: skillsLineOf(engine, state), perceptionLine: perceptionLineOf(engine, state),
            sheetLines: sheetNames.map((n) => ({ name: n, rank: catalog.sheets[n].rank, strong: strongSkills(catalog.sheets[n]), bonus: bonusOf(n) })),
            manualRoll: Boolean(g.manual),
            dice, combatOn, partyLines: combatOn ? combatPartyLines(combat.party) : [],
        });
        built.diagnostics.forEach((d) => diag(d.code, d));
        if (built.content && typeof c.setExtensionPrompt === 'function') {
            try { c.setExtensionPrompt(STATS_PROMPT_KEY, built.content, IN_CHAT, 0, false, 0); } catch (error) { diag('stats-inject-failed'); }
        }
    }

    // 已定检定（选项、输入、手动掷骰）原样沿用；来自 roll 标签的检定按标签与骰面重算（编辑正文后标签可能变）。
    const givenCheck = (meta) => (meta && meta.check && meta.check.source !== 'roll' ? meta.check : null);

    function playCheck(check, messageId) {
        if (!check || !settings().checkFx) return;
        const userName = (ctx() && ctx().name1) || '';
        const detail = check.left ? contestFxDetail(check, userName) : checkFxDetail(check, userName);
        try { onCheck({ detail, check, messageId }); } catch (error) { /* 演出出错不影响结算 */ }
    }

    // ---- 正文 d20 检定（合并计划 P3，助手选 B）：每楼 10 对骰；主角的优劣势与压力修正由程序给出，复算以此为准 ----
    const userNameNow = () => String((ctx() && ctx().name1) || '');
    const isHero = (name) => isProtagonist(name) || (Boolean(userNameNow()) && String(name || '').trim() === userNameNow());

    // 复算所需的读取口：属性视图来自战斗日志（未就绪时 fail-closed，不拿默认值冒充）；技能按所属属性 + 熟练换算。
    function storyCheckSources(engine, state) {
        const src = source();
        if (!src || src.ready !== true || typeof src.readAbilities !== 'function') return { ok: false, reason: (src && src.reason) || 'stats-life-source-missing' };
        const readAbilities = (name) => src.readAbilities(isHero(name) ? (userNameNow() || PROTAGONIST) : name, { heroPrefs: heroPrefs() });
        const skillOf = (raw) => engine.registry.resolve(raw) || String(raw || '').trim();
        const resolveSkill = (actor, skill) => {
            const p = profileOf(engine, state, isHero(actor) ? PROTAGONIST : actor, skillOf(skill));
            const ability = abilityKeyOf(p.entry && p.entry.attribute);
            return ability ? { ability, bonus: engine.ruleset.bonusOf(p) } : null;
        };
        const heroMods = (tag) => modifiersOf(engine, state, { actor: PROTAGONIST, skill: tag.skill ? skillOf(tag.skill) : ABILITY_LABELS[tag.ability], edge: tag.edge });
        const edgeOf = (actor, tag) => (isHero(actor) ? heroMods(tag).edge : null);
        const shiftOf = (actor, tag) => (isHero(actor) ? Math.round((heroMods(tag).shift || 0) / 5) : 0);
        return { ok: true, readAbilities, resolveSkill, edgeOf, shiftOf };
    }

    function storyReplay(messageId, body, state) {
        const c = ctx();
        const list = c && Array.isArray(c.chat) ? c.chat : [];
        const ordinal = floorCheckOrdinal(list, messageId);
        const rolls = ordinal ? checkRollPairsFor(chatIdOf(c), ordinal, floorCheckSwipe(list, messageId)) : null;
        if (!rolls) return { ok: false, reason: 'check-floor-unavailable' };
        const srcs = storyCheckSources(engineOf(), state);
        if (!srcs.ok) return srcs;
        let replay;
        try { replay = replayChecks({ body, rolls, readAbilities: srcs.readAbilities, resolveSkill: srcs.resolveSkill, edgeOf: srcs.edgeOf, shiftOf: srcs.shiftOf }); } catch (error) { return { ok: false, reason: 'check-replay-threw' }; }
        return { ok: true, chatId: chatIdOf(c), messageId: Number(messageId), ordinal, rolls, ...replay };
    }

    // 主角的复算结果转成数值检定（成长勾、好感约束、大成功加成用）；其他人物只出徽记，不进数值结算。
    function storyChecksOf(results, engine, state) {
        return (results || []).filter((r) => isHero(r.actor)).map((r) => {
            const skill = r.skill ? (engine.registry.resolve(r.skill) || r.skill) : ABILITY_LABELS[r.ability];
            const p = profileOf(engine, state, PROTAGONIST, skill);
            return {
                actor: PROTAGONIST, skill, kind: p.kind, value: p.value, learned: p.learned, dc: r.dc, roll: r.die, total: r.total, tier: r.tier, success: r.success,
                ladder: r.tier === '大成功' ? 'crit' : r.tier === '大失败' ? 'fumble' : r.success ? 'pass' : 'fail',
                social: isSocialSkill(engine, skill), toward: null, against: null, source: 'story',
            };
        });
    }

    // 生成开始时同步调用：本楼 10 对骰、主角加值、主角持续的优劣势与原因、上一楼更正。自动档以外、本聊天未启用或代写 / 静默时为 null。
    function checkPromptInput(generationType = null) {
        if (!active() || settings().storyCheck !== 'preroll' || SKIP_TYPES.has(generationType)) return null;
        const c = ctx();
        const list = c && Array.isArray(c.chat) ? c.chat : [];
        const ordinal = upcomingCheckOrdinal(list, generationType);
        const rolls = ordinal ? checkRollPairsFor(chatIdOf(c), ordinal, upcomingCheckSwipe(list, generationType)) : null;
        if (!rolls) return null;
        const state = generationType === 'continue' ? stateBefore(ledger, list.length - 1) : currentStatsState(ledger);
        const engine = engineOf();
        const srcs = storyCheckSources(engine, state);
        const actors = [];
        const edges = [];
        let corrections = [];
        if (srcs.ok) {
            const name = userNameNow() || PROTAGONIST;
            const mods = modifiersOf(engine, state, { actor: PROTAGONIST });
            const shift = Math.round((mods.shift || 0) / 5);
            if (mods.edge || shift) edges.push({ name, edge: mods.edge, shift, reasons: [...mods.notes, ...(shift < 0 ? ['压力很大'] : [])] });
            let attr = null;
            try { attr = srcs.readAbilities(name); } catch (error) { attr = null; }
            if (attr) actors.push({ name, attr });
            const prevIndex = ordinal > 1 ? floorIndexOfOrdinal(list, ordinal - 1) : -1;
            const prevText = prevIndex >= 0 ? String(list[prevIndex].mes ?? '') : '';
            if (/\[igs-check:/.test(prevText)) {
                const prev = storyReplay(prevIndex, prevText, stateBefore(ledger, prevIndex));
                if (prev.ok) corrections = checkCorrections(prev.results);
            }
        } else diag('stats-check-sources-unavailable', { reason: srcs.reason });
        return { ordinal, rolls, actors, edges, corrections, statsActive: true };
    }

    // 阅读器徽记用的复算（与结算同一套修正）；本聊天未启用或楼层不可用时返回 null / ok:false。
    function checkReplayFor(messageId, body) {
        if (!active()) return null;
        const c = ctx();
        const id = Number(messageId);
        const m = c && Array.isArray(c.chat) ? c.chat[id] : null;
        if (!m || m.is_user) return { ok: false, reason: 'check-floor-unavailable' };
        return storyReplay(id, body == null ? String(m.mes ?? '') : String(body), stateBefore(ledger, id));
    }

    function settleAt(messageId, { redo = false, plan = null } = {}) {
        const c = ctx();
        const m = c && Array.isArray(c.chat) ? c.chat[messageId] : null;
        if (!m || m.is_user || m.is_system) return null;
        const floor = { messageId, swipeId: Number(m.swipe_id) || 0 };
        const ordinal = floorCheckOrdinal(c.chat, messageId);
        const seed = floorSeedOf(chatIdOf(c), ordinal, floor.swipeId);
        const rollPairs = ordinal ? checkRollPairsFor(chatIdOf(c), ordinal, floor.swipeId) : null;
        const text = String(m.mes ?? '');
        const s = settings();
        const resolve = resolveCharacter || defaultResolver(c, s.register);
        const prior = ledger.entries.get(ledgerKey(ledger, messageId, floor.swipeId));
        const priorMeta = (prior && prior.meta) || {};
        const p = plan || { check: givenCheck(priorMeta), preroll: priorMeta.preroll || null, note: priorMeta.note || null, ruleset: (priorMeta.check && priorMeta.check.ruleset) || (priorMeta.preroll && priorMeta.preroll.ruleset) };
        const check = p.check !== undefined ? p.check : givenCheck(priorMeta);
        const ruleset = p.ruleset || (check && check.ruleset) || s.ruleset;
        const engine = engineOf(ruleset);
        const settle = (before, random) => {
            let storyChecks = [];
            if (s.storyCheck === 'preroll' && /\[igs-check:/.test(text)) {
                const rep = storyReplay(messageId, text, before);
                if (rep.ok) storyChecks = storyChecksOf(rep.results, engine, before);
                else diag('stats-check-replay-unavailable', { messageId, reason: rep.reason });
            }
            const r = settleFloorText(before, text, {
                random, nsfw: isNsfw(), resolveCharacter: (name) => resolve(name, before), engine,
                check, preroll: p.preroll || null, rollPairs, storyChecks, catalog, settings: s, floor: messageId,
                noBattle: combatOn(),
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
        if (r.entry.meta && r.entry.meta.note && r.entry.meta.note.reason === 'stats-roll-skipped') diag('stats-roll-skipped', { messageId });
        for (const entry of (r.entry.meta && r.entry.meta.newSkills) || []) commitSkill(entry.name, { attribute: entry.attribute, floor: messageId });
        // 本楼记录的基准：重算沿用原基准；新结算取下面最近的生效楼层（没有时为 init）。
        const below = activeEntryBefore(ledger, messageId);
        const baseId = prior && Object.hasOwn(prior, 'baseId') ? prior.baseId : (below ? below.recordId ?? null : null);
        const rec = floorRecord({ messageId, swipeId: floor.swipeId, tagHash: statTagHash(text), baseId, seed: r.entry.seed,
            before: r.entry.before, after: r.entry.after, changes: r.entry.changes, meta: r.entry.meta, createdAt: Date.now() });
        r.entry.recordId = rec.id;
        r.entry.baseId = baseId;
        persist([rec]);
        onChange(currentStatsState(ledger), r.entry);
        push();
        const meta = r.entry.meta || {};
        const battleHurt = meta.flags && meta.flags.battleHurt;
        syncLife({ write: true, messageIds: [messageId], battleHurts: new Map(battleHurt ? [[messageId, battleHurt]] : []) });
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
        // 换聊天时数据库尚未载入：生成前再读一次（导入中不重读）。
        if (!ledger && unready && unready !== 'stats-importing' && dryRun !== true) { load(); autoEnable(); }
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
        const lastId = c && Array.isArray(c.chat) ? c.chat.length - 1 : -1;
        if (lastId < 0) return;
        const plan = { check: g.check, preroll: g.preroll, note: g.note, ruleset: g.ruleset };
        settleAt(lastId, { redo: g.type === 'continue', plan });
    }

    function onSwiped(messageId) {
        if (!ledger || !chatEnabled) return;
        const c = ctx();
        const id = Number(messageId);
        const m = c && Array.isArray(c.chat) ? c.chat[id] : null;
        if (!m) return;
        selectSwipe(ledger, id, Number(m.swipe_id) || 0);
        onChange(currentStatsState(ledger), null);
        push();
        syncLife();
    }

    function onDeleted() {
        if (!ledger || !chatEnabled) return;
        const c = ctx();
        if (!c || !Array.isArray(c.chat)) return;
        deleteFloorsFrom(ledger, c.chat.length);
        onChange(currentStatsState(ledger), null);
        push();
        syncLife();
    }

    // 编辑正文：只重算这一楼，从本楼结算前快照出发，不级联（易错点 A5）。
    function onUpdated(messageId) {
        if (generating || !active()) return;
        const id = Number(messageId);
        const c = ctx();
        const m = c && Array.isArray(c.chat) ? c.chat[id] : null;
        if (m && ledger.entries.has(ledgerKey(ledger, id, Number(m.swipe_id) || 0))) settleAt(id, { redo: true });
    }

    function onChatChanged() {
        generating = null;
        clearPrompt();
        load();
        autoEnable();
        onChange(ledger ? currentStatsState(ledger) : null, null, { chatChanged: true });
        refreshOnboarding();
        if (active()) syncLife();
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
            source.on(name, handler);
            offs.push(() => (typeof source.removeListener === 'function' ? source.removeListener(name, handler) : source.off && source.off(name, handler)));
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

    // 设置变化后调用：总开关开就挂监听并读存档，关就全部解绑（易错点 H1）。
    function sync() {
        const on = settings().enabled;
        if (on && !offs.length) { if (attach()) { load(); autoEnable(); refreshOnboarding(); if (active()) syncLife(); } }
        // 已挂着监听时打开卡牌战斗：本聊天随之启用，收起「是否启用」询问。
        else if (on && offs.length && combatOn()) { autoEnable(); refreshOnboarding(); }
        else if (!on && offs.length) { detach(); notices.clear(); emitNotices(); }
        return { attached: offs.length > 0 };
    }

    // 启用本聊天：首次启用写 init（建卡初始状态）与聊天开关；数值日志表缺失时先补建再写（返回 Promise）。
    let enabling = false;
    // buildMode（P8c）：开局询问时一并选定的建档方式；本聊天已选过时不覆盖（之后改用 setBuildMode）。
    function enableForChat({ initial, buildMode: mode } = {}) {
        reloadCold();
        if (blocked) return { ok: false, reason: blocked };
        if (unready) return { ok: false, reason: unready };
        const id = chatIdOf(ctx());
        if (!id) return { ok: false, reason: 'stats-no-chat' };
        const extra = [];
        if (!ledger) {
            const db = dbOf();
            const read = db.ok ? db.read() : db;
            if (!read || read.ok !== true) return { ok: false, reason: (read && read.reason) || 'stats-log-read-failed' };
            if (!Array.isArray(read.stats)) {
                if (enabling) return { ok: false, reason: 'stats-log-create-unverified' };
                enabling = true;
                return Promise.resolve().then(() => db.ensure()).then((made) => {
                    if (!made || made.ok !== true) { diag('stats-log-create-failed', { reason: made && made.reason }); return { ok: false, reason: (made && made.reason) || 'stats-log-create-failed' }; }
                    load();
                    return enableForChat({ initial, buildMode: mode });
                }, () => ({ ok: false, reason: 'stats-log-create-failed' })).finally(() => { enabling = false; });
            }
            ledger = createStatsLedger(id, initial || createStatsState());
            extra.push(initRecord(ledger.initial, { createdAt: Date.now() }));
        }
        chatEnabled = true;
        if (!buildMode && normalizeBuildMode(mode)) buildMode = mode;
        if (declined) { store.setDeclined(false); declined = false; }
        persist(extra);
        onChange(currentStatsState(ledger), null);
        setNotice('onboarding', null);
        detectNewCharacters();
        return { ok: true };
    }

    // 新聊天「自动快速开始」：只对从未启用也未拒绝的聊天生效；暂停过的聊天不自动开（v2 §9.5）。
    function autoEnable() {
        const s = settings();
        if (!s.enabled || blocked || unready || !chatIdOf(ctx())) return;
        // 卡牌战斗开启时：新聊天、拒绝过或暂停过的聊天一律启用（合并计划 P6）。
        if (combatOn()) { if (!ledger || !chatEnabled) Promise.resolve(enableForChat()).catch(() => {}); return; }
        if (s.newChat !== 'auto' || ledger || declined) return;
        Promise.resolve(enableForChat()).catch(() => {});
    }

    function refreshOnboarding() {
        const s = settings();
        const show = s.enabled && !combatOn() && s.newChat === 'ask' && !ledger && !blocked && !unready && !declined && Boolean(chatIdOf(ctx()));
        setNotice('onboarding', show ? {
            kind: 'onboarding', text: '数值系统：本聊天是否启用？',
            actions: [['quick', '快速开始'], ['build', '建卡'], ['decline', '本聊天不用']],
        } : null);
    }

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
            if (kept) { sheets[name] = { ...kept, source: 'carried', provisional: {} }; carried.push(name); }
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
                sheets[name] = sheetFromTiers(name, tiers, { chatSeed });
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
        const engine = engineOf();
        const check = resolveCheck(engine, entry.before, { actor: PROTAGONIST, skill: name, difficulty: pr.difficulty, against: pr.against, opposedSkill: pr.opposedSkill, source: 'manual' }, cryptoRandom);
        manualCheck = { messageId: entry.messageId, check };
        setNotice('roll', null);
        playCheck(check, entry.messageId);
        if (typeof resumeReply === 'function') Promise.resolve().then(() => resumeReply()).catch(() => diag('stats-resume-failed'));
        return { ok: true, check };
    }

    // ---- 选项骰子（v2 §5.1） ----
    function resolveDice(raw, { userName = '' } = {}) {
        if (!active()) return null;
        const command = parseDiceCommand(raw);
        if (command.kind !== 'check' && command.kind !== 'contest') return null;
        const state = currentStatsState(ledger);
        const c = ctx();
        const resolve = resolveCharacter || defaultResolver(c, settings().register);
        const engine = engineOf();
        const req = resolveDiceRequest(engine, state, command, { resolveCharacter: (name) => resolve(name, state) });
        if (!req) return null;
        const ensure = (skill) => (BUILTIN_SKILLS[skill] || engine.registry.has(skill) ? skill : commitSkill(skill) || skill);
        if (req.kind === 'check') {
            const check = resolveCheck(engineOf(), state, { ...req, skill: ensure(req.skill), source: 'option' }, cryptoRandom);
            const line = checkLine(check, userName);
            if (isProtagonist(check.actor)) pendingOption = { line, check };
            return { ok: true, success: check.success, roll: check.roll, target: check.target, line, detail: checkFxDetail(check, userName), statsFx: true };
        }
        const result = contestCheck(engineOf(), state, { ...req.left, skill: ensure(req.left.skill) }, { ...req.right, skill: ensure(req.right.skill) }, cryptoRandom,
            { tieWinner: req.tieRule === 'initiator_win' ? 'left' : '' });
        const line = contestLine(result, userName);
        const mine = isProtagonist(req.left.actor) ? { ...result.left, success: result.winner === 'left' } : isProtagonist(req.right.actor) ? { ...result.right, success: result.winner === 'right' } : null;
        if (mine) pendingOption = { line, check: { ...mine, source: 'option' } };
        return { ok: true, success: result.winner === 'left', winner: result.winner, line, detail: contestFxDetail(result, userName), statsFx: true };
    }

    function diceChance(raw) {
        if (!active() || !settings().optionChance) return null;
        const command = parseDiceCommand(raw);
        if (command.kind !== 'check') return null;
        const state = currentStatsState(ledger);
        const engine = engineOf();
        const req = resolveDiceRequest(engine, state, command, {});
        if (!req || !isProtagonist(req.actor)) return null;
        try { return { skill: req.skill, difficulty: req.difficulty, chance: chanceOf(engine, state, req) }; } catch (error) { return null; }
    }

    // ---- 阅读器提示条的按钮（v2 §9.5、§6.4） ----
    function noticeAction(id, action) {
        const n = notices.get(id);
        if (!n) return { ok: false, reason: 'stats-notice-gone' };
        if (id === 'onboarding') {
            if (action === 'quick') return enableForChat();
            if (action === 'decline') { declined = true; store.setDeclined(true); setNotice('onboarding', null); return { ok: true }; }
            if (action === 'build') { setNotice('onboarding', null); return { ok: true, openSettings: 'stats' }; }
        }
        if (id === 'sheets' && action === 'generate') { setNotice('sheets', null); return generateSheets(); }
        if (id === 'roll' && action === 'roll') return manualRoll();
        setNotice(id, null);
        return { ok: true };
    }

    // ---- 诊断（v2 §9.4） ----
    const REASON_TEXT = Object.freeze({
        'no-match': '玩家输入没有命中技能词', excluded: '命中的词在否定句、引号台词、回忆或旁观里', conflict: '命中的词同时属于两项技能',
        'no-input': '没有找到玩家输入', 'auto-skill-off': '已关闭玩家输入匹配', 'story-check-off': '已关闭故事中检定',
        'stats-roll-skipped': 'AI 没有打 roll 标签', 'roll-unresolved': 'roll 标签里的技能无法识别',
    });
    const SOURCE_TEXT = Object.freeze({ option: '选项', input: '输入匹配', roll: '自动', story: '正文检定', manual: '手动掷骰', preroll: '自动', 'manual-rule': '手动掷骰', none: '无' });

    function diagnose(messageId) {
        const s = settings();
        if (!s.enabled) return '数值 总开关关闭';
        if (!chatEnabled || !ledger) return `数值 本聊天未启用${blocked ? `（存档无法读取：${blocked}）` : ''}`;
        const c = ctx();
        const id = Number(messageId);
        const m = c && Array.isArray(c.chat) ? c.chat[id] : null;
        const entry = m ? ledger.entries.get(ledgerKey(ledger, id, Number(m.swipe_id) || 0)) : null;
        const head = `数值 d20 · 故事中检定 ${{ preroll: '自动', manual: '手动掷骰', off: '关闭' }[s.storyCheck]}`;
        if (!entry) return `${head} · 本楼没有结算记录`;
        const meta = entry.meta || {};
        const note = meta.note || {};
        if (meta.check) {
            const ck = meta.check;
            return `${head} · 检定来源 ${SOURCE_TEXT[ck.source || note.source] || ck.source || '?'} · ${ck.skill}${ck.difficulty && ck.difficulty !== '普通' ? `（${ck.difficulty}）` : ''} ${ck.detail || ''} → ${ck.outcome}`;
        }
        const reason = REASON_TEXT[note.reason] || note.reason || '未知';
        return `${head} · 本楼无检定（${SOURCE_TEXT[note.source] || '无'}；原因：${reason}）`;
    }

    // ---- 设置页存档区操作 ----
    function sheetOp(op, name, payload = {}) {
        if (!ledger) return { ok: false, reason: 'stats-no-ledger' };
        const sheets = { ...catalog.sheets };
        if (op === 'remove') { delete sheets[name]; catalog = { ...catalog, sheets, notified: catalog.notified.filter((n) => n !== name) }; }
        else if (op === 'regen') { delete sheets[name]; catalog = { ...catalog, sheets }; persist(); return generateSheets([name]); }
        else if (op === 'edit') {
            const cur = sheets[name] || { rank: '普通人', attributes: {}, skills: {}, signature: [], provisional: {} };
            const skill = engineOf().registry.resolve(payload.skill) || String(payload.skill || '').trim();
            const tier = String(payload.tier || '').trim();
            const chatSeed = chatIdOf(ctx());
            // 六维以战斗属性视图为准（合并计划 P2），角色卡不再存属性。
            if (BASE_ATTRIBUTES.includes(skill)) return { ok: false, reason: 'stats-sheet-attribute-readonly' };
            else if (skill && Object.hasOwn(SKILL_TIERS, tier)) {
                const skills = { ...cur.skills };
                const v = bandValue(SKILL_TIERS[tier], `${chatSeed}|${name}|${skill}`);
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

    return {
        sync,
        destroy: detach,
        isActive: active,
        getState: () => (ledger ? currentStatsState(ledger) : null),
        getLedger: () => ledger,
        getCatalog: () => catalog,
        getDiagnostics: () => diagnostics.slice(),
        isChatEnabled: () => chatEnabled,
        // 建档方式（P8c）：按聊天保存；改动只影响之后新出现的角色，已建档的不变（init 首写为准）。
        getBuildMode: () => buildMode,
        getBuildChoices: () => ({ ...buildChoices }),
        setBuildMode(mode) {
            reloadCold();
            if (blocked) return { ok: false, reason: blocked };
            if (unready) return { ok: false, reason: unready };
            const m = normalizeBuildMode(mode);
            if (!m) return { ok: false, reason: 'stats-build-mode-invalid' };
            if (!ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
            buildMode = m;
            persist();
            return { ok: true };
        },
        // 手动建档下的逐角色选择：auto 改用自动生成，skip 本聊天不再询问；null 清除。
        setBuildChoice(name, choice) {
            reloadCold();
            if (blocked) return { ok: false, reason: blocked };
            if (unready) return { ok: false, reason: unready };
            const clean = String(name || '').trim();
            if (!clean || clean.length > 40) return { ok: false, reason: 'stats-build-choice-invalid' };
            if (choice !== null && !BUILD_CHOICES.includes(choice)) return { ok: false, reason: 'stats-build-choice-invalid' };
            if (!ledger) return { ok: false, reason: 'stats-chat-not-enabled' };
            const next = { ...buildChoices };
            if (choice === null) delete next[clean]; else next[clean] = choice;
            buildChoices = next;
            persist();
            return { ok: true };
        },
        pushNow: push,
        resolveDice,
        checkPromptInput,
        // 本次生成是否由「数值与战斗」段接管骰序、战斗标签与主角团状态（合并计划 P5）；与 onStarted 的跳过条件一致。
        promptActive: (generationType = null) => Boolean(active() && !SKIP_TYPES.has(generationType) && !background()),
        checkReplayFor,
        diceChance,
        notices: () => [...notices.values()],
        noticeAction,
        generateSheets,
        runBackfill,
        manualRoll,
        diagnose,
        sheetOp,
        skillOp,
        dropBackup: () => store.dropBackup(),
        // 设置页「存档」区用；未挂监听时同样先从元数据重读。暂停的聊天也显示冻结的数值。
        archive() {
            reloadCold();
            return ledger ? statsArchiveModel(ledger, { catalog, engine: engineOf(), hasBackup: store.read().hasBackup }) : null;
        },
        // 设置页「本聊天」区块用。未挂监听（总开关启动时关闭）时先从元数据重读，避免拿旧状态或空账本覆盖存档。
        chatStatus() {
            reloadCold();
            return { enabled: chatEnabled, blocked: blocked || unready, hasChat: Boolean(chatIdOf(ctx())) };
        },
        // 状态栏 / 人际关系页的数据源：只有总开关与本聊天都启用时才接管，否则返回 null 让调用方读表格（易错点 H3）。
        metricsLookup() {
            if (!active()) return null;
            return createStatsMetricsLookup(currentStatsState(ledger), { hudLabel: settings().hudLabel, nsfw: isNsfw(), sheets: catalog.sheets, engine: engineOf() });
        },
        // 本聊天启用（开场建卡的「快速开始」或分配点数后传入初始状态）。
        enableForChat,
        // 本聊天关闭：数值冻结，不清存档（§10A）。
        disableForChat() {
            reloadCold();
            if (combatOn()) return { ok: false, reason: 'stats-combat-locked' };
            if (blocked) return { ok: false, reason: blocked };
            if (unready) return { ok: false, reason: unready };
            chatEnabled = false;
            clearPrompt();
            persist();
            return { ok: true };
        },
        // 等待已排队的数值日志写入完成（设置页与测试用）；导入进行中时一并等待。
        whenSaved: () => Promise.all([lastSave, importJob ? importJob.promise : null]).then(() => undefined),
    };
}
