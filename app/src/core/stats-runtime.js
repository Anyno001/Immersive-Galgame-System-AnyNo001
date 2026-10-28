// 数值系统运行时装配（§3、§4.2、§10A；易错点 A1–A6、B1–B3、H1/H2）。
// 只协调宿主事件、账本与注入；结算规则在 scene/stats，正文解析不在这里做。
// 总开关关闭时不挂任何监听（sync 解绑）；本聊天未启用时不注入、不结算，数值冻结。
import { createStatsLedger, currentStatsState, deleteFloorsFrom, ledgerKey, selectSwipe, stateBefore } from '../scene/stats/stat-ledger.js';
import { resettleFloor, settleFloor } from '../scene/stats/stat-ledger-settle.js';
import { settleFloorText } from '../scene/stats/stat-settle.js';
import { createChatStatsStore, deserializeLedger, serializeLedger } from '../scene/stats/stat-persist.js';
import { normalizeStatsSettings } from '../scene/stats/stat-settings.js';
import { createStatsState } from '../scene/stats/stat-state.js';
import { buildStatsPrompt, mandatesFromFlags } from '../scene/stats/stat-prompt.js';
import { pushStats, withTimeout } from '../data/shujuku/stats-push.js';
import { createStatsMetricsLookup } from '../scene/stats/stat-metrics.js';
import { statsArchiveModel } from '../scene/stats/stat-archive.js';
import { learnSkillWord, matchSkill } from '../scene/stats/stat-skill-match.js';
import { chooseSkillWithModel } from '../scene/stats/stat-skill-model.js';
import { cryptoRandom, rollStatCheck } from '../scene/stats/stat-rng.js';
import { checkModifiers } from '../scene/stats/stat-bars.js';
import { clamp, withSkills } from '../scene/stats/stat-state.js';

export const STATS_PROMPT_KEY = 'igs-stats-state';
const IN_CHAT = 1;
const NONE = -1;
const SKIP_TYPES = new Set(['quiet', 'impersonate']);
const DIAG_MAX = 50;
const DIFFICULTY_LEVEL = Object.freeze({ 普通: 0, 困难: 1, 极难: 2 });

function lastUserText(c) {
    const chat = c && Array.isArray(c.chat) ? c.chat : [];
    for (let i = chat.length - 1; i >= 0; i -= 1) if (chat[i] && chat[i].is_user) return String(chat[i].mes ?? '');
    return '';
}

// 先掷后写（§4.1）：脚本先掷，结果写进提示词，AI 按结果描写。显示的门槛已按难度折算（困难 1/2、极难 1/5）。
function rollCheck(state, skill, difficulty, random = cryptoRandom) {
    const mods = checkModifiers(state.protagonist.bars);
    const value = Number(state.protagonist.skills[skill] && state.protagonist.skills[skill].value) || 50;
    const target = clamp(Math.round(value + mods.targetShift), 1, 99);
    const level = DIFFICULTY_LEVEL[difficulty] ?? 0;
    const r = rollStatCheck(target, { penalty: mods.penalty, difficulty: level }, random);
    const threshold = level === 2 ? Math.floor(target / 5) : level === 1 ? Math.floor(target / 2) : target;
    const outcome = r.success ? r.tier : (String(r.tier).includes('大失败') ? '大失败' : '失败');
    return { skill, difficulty, roll: r.roll, threshold, tier: r.tier, success: r.success, outcome };
}

// 检定成功给技能打成长勾，并把检定记进本楼 meta（编辑正文重算时沿用）。
function withCheck(result, check) {
    if (!check || !result) return result;
    let state = result.state;
    const skill = state.protagonist.skills[check.skill];
    if (check.success && skill && !skill.marked) state = withSkills(state, { ...state.protagonist.skills, [check.skill]: { ...skill, marked: true } });
    return { ...result, state, meta: { ...(result.meta || {}), check } };
}

function chatIdOf(c) {
    try { if (c && typeof c.getCurrentChatId === 'function') return String(c.getCurrentChatId() ?? ''); } catch (error) { /* */ }
    return String((c && c.chatId) || '');
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

export function createStatsRuntime({ getContext, readSettings, resolveCharacter, isNsfw = () => false, presentOf = (state) => Object.keys(state.characters), onChange = () => {}, getPushClient = () => null, pushOptions = {}, getModelRequest = () => null } = {}) {
    const store = createChatStatsStore(getContext);
    let ledger = null;
    let chatEnabled = false;
    let learned = {};
    let blocked = '';
    let generating = null;
    let offs = [];
    let pushing = null;
    const diagnostics = [];

    const ctx = () => { try { return getContext(); } catch (error) { return null; } };
    const settings = () => normalizeStatsSettings(readSettings ? readSettings() : null);
    const active = () => Boolean(settings().enabled && chatEnabled && ledger);
    const diag = (code, extra = {}) => { diagnostics.push({ code, ...extra }); if (diagnostics.length > DIAG_MAX) diagnostics.shift(); };

    function load() {
        ledger = null; chatEnabled = false; blocked = ''; learned = {};
        const read = store.read();
        if (!read.ok) { diag('stats-read-failed', { reason: read.reason }); return; }
        if (!read.raw) return;
        const r = deserializeLedger(read.raw, chatIdOf(ctx()));
        // 读不懂的存档不覆盖：留给新版本或用户处理（持久化边界，拒绝须可诊断）。
        if (!r.ok) { blocked = r.reason; diag(r.reason); return; }
        if (r.dropped.length) diag('stats-save-entries-dropped', { count: r.dropped.length });
        if (r.learnedDropped) diag('stats-learned-dropped', { count: r.learnedDropped });
        ledger = r.ledger; chatEnabled = r.chatEnabled;
        learned = r.learned || {};
    }

    function persist() {
        if (!ledger || blocked) return;
        const r = store.write(serializeLedger(ledger, { chatEnabled, learned }));
        if (!r.ok) diag('stats-write-failed', { reason: r.reason });
    }

    // 单向推送到表格（§8A）：子开关关或没装表格插件时什么都不做；失败只记诊断，不影响结算。
    // 同一时间只跑一次推送，后到的请求排在当前这次之后。
    function push() {
        if (!active() || !settings().push.enabled) return Promise.resolve({ ok: true, skipped: true });
        let client = null;
        try { client = getPushClient(); } catch (error) { client = null; }
        if (!client) return Promise.resolve({ ok: false, reason: 'stats-push-no-client' });
        const run = () => pushStats(client, currentStatsState(ledger), { ...pushOptions, overridesByFingerprint: settings().push.mappings }).then((r) => {
            if (!r.ok) diag(r.reason || 'stats-push-partial', { failures: (r.failures || []).length });
            (r.diagnostics || []).forEach((d) => diag(d.code, d));
            return r;
        }, (error) => { diag('stats-push-threw', { error: String(error && error.message || error) }); return { ok: false, reason: 'stats-push-threw' }; });
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

    function inject(type, c, check = null) {
        const lastId = Array.isArray(c.chat) ? c.chat.length - 1 : -1;
        const state = type === 'continue' ? stateBefore(ledger, lastId) : currentStatsState(ledger);
        const last = latestEntry();
        const flags = (last && last.meta && last.meta.flags) || {};
        const s = settings();
        const built = buildStatsPrompt(state, {
            present: presentOf(state), shortfall: flags.shortfall, mandates: mandatesFromFlags(flags, state.protagonist.bars),
            nsfw: isNsfw(), intimacyGate: s.intimacyGate, prompts: s.prompts, check, stageText: s.stageText,
            disabled: Object.entries(s.segments || {}).filter(([, on]) => on === false).map(([id]) => id),
        });
        built.diagnostics.forEach((d) => diag(d.code, d));
        if (built.content && typeof c.setExtensionPrompt === 'function') {
            try { c.setExtensionPrompt(STATS_PROMPT_KEY, built.content, IN_CHAT, 0, false, 0); } catch (error) { diag('stats-inject-failed'); }
        }
    }

    function settleAt(messageId, { redo = false, check: given } = {}) {
        const c = ctx();
        const m = c && Array.isArray(c.chat) ? c.chat[messageId] : null;
        if (!m || m.is_user || m.is_system) return null;
        const floor = { messageId, swipeId: Number(m.swipe_id) || 0 };
        const resolve = resolveCharacter || defaultResolver(c, settings().register);
        const prior = ledger.entries.get(ledgerKey(ledger, messageId, floor.swipeId));
        const check = given !== undefined ? given : ((prior && prior.meta && prior.meta.check) || null);
        const settle = (before, random) => withCheck(settleFloorText(before, String(m.mes ?? ''), {
            random, nsfw: isNsfw(), resolveCharacter: (name) => resolve(name, before),
        }), check);
        const r = redo ? resettleFloor(ledger, floor, settle) : settleFloor(ledger, floor, settle);
        if (!r.reused) { persist(); onChange(currentStatsState(ledger), r.entry); push(); }
        return r;
    }

    // 只有正常发送、新 swipe、继续生成三种前台生成参与；dryRun、quiet、代写跳过（易错点 A1）。
    // 继续生成沿用本楼原检定；新发送与新 swipe 重新匹配并掷骰。返回 { check } 或 { needsModel }。
    function planCheck(type, c) {
        if (!settings().autoSkill) return { check: null };
        if (type === 'continue') {
            const last = latestEntry();
            return { check: (last && last.meta && last.meta.check) || null };
        }
        const text = lastUserText(c);
        if (!text) return { check: null };
        const state = currentStatsState(ledger);
        const skills = Object.keys(state.protagonist.skills);
        const hit = matchSkill(text, { skills, learned });
        if (hit.skill) return { check: rollCheck(state, hit.skill, hit.difficulty) };
        if (hit.reason !== 'conflict') return { check: null };
        let request = null;
        try { request = getModelRequest(); } catch (error) { request = null; }
        if (typeof request !== 'function') { diag('stats-skill-conflict-unresolved', { candidates: hit.candidates }); return { check: null }; }
        return { needsModel: { text, skills, candidates: hit.candidates, request, word: hit.word } };
    }

    function resolveWithModel(plan) {
        return chooseSkillWithModel(plan.text, plan).then((r) => {
            if (!r.ok) diag(r.reason || 'model-choice-invalid');
            // 模型裁决过的冲突词记进本聊天学习表，下次直接本地命中（§4.1A）。
            if (r.ok && r.skill && plan.word && ledger) {
                const next = learnSkillWord(learned, plan.word, r.skill, plan.skills);
                if (next !== learned && next[plan.word] === r.skill) { learned = next; persist(); }
            }
            if (!r.skill || r.difficulty === '无需检定' || !active()) return null;
            return rollCheck(currentStatsState(ledger), r.skill, r.difficulty);
        });
    }

    function onStarted(type, params, dryRun) {
        if (dryRun === true || SKIP_TYPES.has(type) || !active()) return;
        const c = ctx();
        if (!c) return;
        const g = { type: String(type || 'normal'), check: null };
        generating = g;
        clearPrompt();
        // 生成前把被表格插件改掉的数值补写回真值，最多等 3 秒（易错点 F4/F6）。宿主会等待返回的 Promise。
        const finish = (check) => {
            if (generating !== g) return undefined;
            g.check = check || null;
            inject(g.type, c, g.check);
            return settings().push.enabled ? withTimeout(push()) : undefined;
        };
        let plan;
        try { plan = planCheck(g.type, c); } catch (error) { diag('stats-check-failed', { error: String(error && error.message || error) }); plan = { check: null }; }
        if (plan.needsModel) return resolveWithModel(plan.needsModel).then(finish, () => finish(null));
        return finish(plan.check);
    }

    // 完整正文只在结束（或停止）时结算一次；注入只对本次生成有效（易错点 A3/A6）。
    function onFinished() {
        const g = generating;
        generating = null;
        clearPrompt();
        if (!g || !active()) return;
        const c = ctx();
        const lastId = c && Array.isArray(c.chat) ? c.chat.length - 1 : -1;
        if (lastId >= 0) settleAt(lastId, { redo: g.type === 'continue', check: g.check });
    }

    function onSwiped(messageId) {
        if (!ledger || !chatEnabled) return;
        const c = ctx();
        const id = Number(messageId);
        const m = c && Array.isArray(c.chat) ? c.chat[id] : null;
        if (!m) return;
        selectSwipe(ledger, id, Number(m.swipe_id) || 0);
        persist();
        onChange(currentStatsState(ledger), null);
        push();
    }

    function onDeleted() {
        if (!ledger || !chatEnabled) return;
        const c = ctx();
        if (!c || !Array.isArray(c.chat)) return;
        deleteFloorsFrom(ledger, c.chat.length);
        persist();
        onChange(currentStatsState(ledger), null);
        push();
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
        onChange(ledger ? currentStatsState(ledger) : null, null, { chatChanged: true });
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
        if (on && !offs.length) { if (attach()) load(); }
        else if (!on && offs.length) detach();
        return { attached: offs.length > 0 };
    }

    return {
        sync,
        destroy: detach,
        isActive: active,
        getState: () => (ledger ? currentStatsState(ledger) : null),
        getLedger: () => ledger,
        getDiagnostics: () => diagnostics.slice(),
        isChatEnabled: () => chatEnabled,
        pushNow: push,
        // 设置页「存档」区用；未挂监听时同样先从元数据重读。暂停的聊天也显示冻结的数值。
        archive() {
            if (!offs.length) load();
            return ledger ? statsArchiveModel(ledger) : null;
        },
        // 设置页「本聊天」区块用。未挂监听（总开关启动时关闭）时先从元数据重读，避免拿旧状态或空账本覆盖存档。
        chatStatus() {
            if (!offs.length) load();
            return { enabled: chatEnabled, blocked, hasChat: Boolean(chatIdOf(ctx())) };
        },
        // 状态栏 / 人际关系页的数据源：只有总开关与本聊天都启用时才接管，否则返回 null 让调用方读表格（易错点 H3）。
        metricsLookup() {
            if (!active()) return null;
            return createStatsMetricsLookup(currentStatsState(ledger), { hudLabel: settings().hudLabel, nsfw: isNsfw() });
        },
        // 本聊天启用（开场建卡的「快速开始」或分配点数后传入初始状态）。
        enableForChat({ initial } = {}) {
            if (!offs.length) load();
            if (blocked) return { ok: false, reason: blocked };
            if (!chatIdOf(ctx())) return { ok: false, reason: 'stats-no-chat' };
            if (!ledger) ledger = createStatsLedger(chatIdOf(ctx()), initial || createStatsState());
            chatEnabled = true;
            persist();
            onChange(currentStatsState(ledger), null);
            return { ok: true };
        },
        // 本聊天关闭：数值冻结，不清存档（§10A）。
        disableForChat() {
            if (!offs.length) load();
            if (blocked) return { ok: false, reason: blocked };
            chatEnabled = false;
            clearPrompt();
            persist();
            return { ok: true };
        },
    };
}
