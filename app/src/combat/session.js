import { COMBAT_RULES, scaleEnemyStats } from './rules.js';
import { applyAction, createBattle, legalActions, replayBattle, seedFor } from './engine.js';
import { deckProfileEntities, enemyEntities, enemyIdFor, generateEntities, generationWrites, skillProfileEntity, templateEnemy } from './generation.js';
import { buildCombatReport, COMBAT_SKIP_TEXT, reportIdFor, reportIdOf } from './report.js';
import { PROTAGONIST_ALIASES } from './ledger.js';
import { profileIdFor } from './schema.js';
import { extractCombatStart } from '../scene/combat-directives.js';

// 战斗会话：idle → preparing → lobby / blocked → battle → ended → done（或 send-failed / skipped / stale）。
// 宿主能力全部注入：ledger（账本）、tables（战斗表）、request / llm（副 LLM）、send（typeAndSend）、storage（localStorage 形状）、
// getChatId、chat（消息快照）。断点续战只保存 { combatId, anchor, seed, setup, actions }，恢复时核对锚点与规则版本后重放。
export const SESSION_VERSION = 1;
export const sessionKeyFor = (chatId) => `igs-combat:session:${chatId}`;
export const outboxKeyFor = (chatId) => `igs-combat:outbox:${chatId}`;
const ENEMY_SUFFIX = Object.freeze(['甲', '乙', '丙', '丁', '戊']);

// 战斗 ID 由开战标签锚点推导，不含 chatId：回溯分支复制的楼层仍指向同一场战斗，已回传的不能再打。
export const combatIdFor = (anchor) => ['cb', anchor.messageId, anchor.swipeId, anchor.tagHash, anchor.occurrence].join('|');
const messageText = (m) => String(m?.mes ?? m?.text ?? '');
const swipeOf = (m) => (Number.isInteger(m?.swipe_id) ? m.swipe_id : 0);
const sameAnchor = (a, b) => Boolean(a && b) && a.messageId === b.messageId && a.swipeId === b.swipeId && a.tagHash === b.tagHash && a.occurrence === b.occurrence;
const valueOf = (v) => (typeof v === 'function' ? v() : v);

export function locateCombatStart(chat, messageId, sourceFilter) {
    const m = Array.isArray(chat) ? chat[messageId] : null;
    if (!m || typeof m !== 'object' || m.is_user === true) return { ok: false, reason: 'combat-floor-missing' };
    const { start } = extractCombatStart(messageText(m), { sourceFilter });
    if (!start) return { ok: false, reason: 'combat-start-missing' };
    const anchor = { messageId, swipeId: swipeOf(m), tagHash: start.tagHash, occurrence: start.occurrence };
    return { ok: true, start, anchor, combatId: combatIdFor(anchor) };
}

// 开战楼之后带同一战报 ID 的用户楼；没有返回 -1。
export function findReportFloor(chat, afterId, reportId) {
    const list = Array.isArray(chat) ? chat : [];
    for (let i = afterId + 1; i < list.length; i += 1) {
        if (list[i]?.is_user === true && reportIdOf(messageText(list[i])) === reportId) return i;
    }
    return -1;
}

function readJson(storage, key) {
    let raw;
    try { raw = storage?.getItem(key); } catch { return { ok: false, reason: 'combat-session-storage-unavailable' }; }
    if (raw === null || raw === undefined) return { ok: true, value: null };
    try { return { ok: true, value: JSON.parse(raw) }; } catch { return { ok: false, reason: 'combat-session-corrupt' }; }
}

function writeJson(storage, key, value) {
    try {
        if (value === null) storage.removeItem(key);
        else storage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

function findCharacter(state, name) {
    for (const c of state.characters.values()) if (c.name === name || (c.profile.aliases || []).includes(name)) return c;
    return null;
}

const averageLevel = (views) => (views.length ? Math.max(1, Math.round(views.reduce((s, v) => s + v.level, 0) / views.length)) : 1);

// 账本视图 → 引擎单位。图鉴转成普通对象，保证 setup 可以 JSON 持久化后原样重放。
function deckUnit(view) {
    return {
        id: view.id, name: view.name, side: 'ally', kind: 'deck', maxHp: view.hpMax,
        energy: view.profile.base.energy, draw: view.profile.base.draw,
        deck: view.deckEntries.map((e) => ({ ...e })), catalog: Object.fromEntries(view.catalog),
        passives: [view.classProfile?.classPassive, view.profile.personalPassive].filter(Boolean),
    };
}

function skillUnit(view) {
    return { id: view.id, name: view.name, side: 'ally', kind: 'skill', maxHp: view.profile.base.hp, skills: view.skills, passives: view.passives };
}

// 同名敌人共享一份档案，多只时按「甲乙丙」区分；数值按我方平均等级与难度缩放。
function enemyUnits(start, profiles, partyLevel, difficulty) {
    const units = [];
    const tiers = [];
    for (const { name, count } of start.enemies) {
        const profile = profiles.get(name);
        const scaled = scaleEnemyStats(profile, partyLevel, difficulty);
        for (let i = 0; i < count; i += 1) {
            units.push({
                id: count > 1 ? `${profile.id}-${i + 1}` : profile.id,
                name: count > 1 ? `${name}${ENEMY_SUFFIX[i] || i + 1}` : name,
                side: 'enemy', kind: 'skill', maxHp: scaled.hp, damageScale: scaled.damageScale,
                skills: profile.skills, passives: profile.passives, phases: profile.phases,
            });
            tiers.push(profile.tier);
        }
    }
    return { units, tiers };
}

// 缺档案的参战者：主角自动生成卡组档案；队友没有档案时生成技能档案（卡组档案只在面板里手动生成）；敌人同名同档复用。
function missingEntities(state, start, userName) {
    const entities = [];
    if (!findCharacter(state, userName)) {
        entities.push(...deckProfileEntities({ name: userName, id: profileIdFor('deck-character', userName), role: 'protagonist', classes: state.classes }));
    }
    for (const name of start.allies) {
        if (PROTAGONIST_ALIASES.includes(name) || name === userName || findCharacter(state, name)) continue;
        entities.push(skillProfileEntity({ name, role: 'ally' }));
    }
    entities.push(...enemyEntities({ enemies: start.enemies, tier: start.tier, existing: state.enemies, partyLevel: 1 }).entities);
    return entities;
}
// 战前阵容：主角必在；队友有档案才参战（生成失败的本次不参战）；敌人缺档案时用模板敌人。
function buildLobby(state, start, userName, templates) {
    const hero = findCharacter(state, userName);
    if (!hero || hero.kind !== 'deck-character') return { ok: false, reason: 'combat-protagonist-missing' };
    const allies = [hero];
    const absent = [];
    for (const name of start.allies) {
        if (PROTAGONIST_ALIASES.includes(name) || name === userName) continue;
        const view = findCharacter(state, name);
        if (view && !allies.includes(view)) allies.push(view);
        else if (!view) absent.push(name);
    }
    const enemies = new Map();
    const templated = [];
    for (const { name } of start.enemies) {
        const id = enemyIdFor(name, start.tier);
        const profile = state.enemies.get(id) || templates.get(id);
        if (!profile) {
            enemies.set(name, templateEnemy(name, start.tier));
            templated.push(name);
        } else {
            enemies.set(name, profile);
            if (profile.generated === false) templated.push(name);
        }
    }
    const controllable = allies.filter((v) => v.kind === 'deck-character' && !v.deckNeedsAdjust).map((v) => v.id);
    if (!controllable.includes(hero.id) && hero.deckNeedsAdjust) return { ok: false, reason: 'combat-deck-needs-adjust', characterId: hero.id };
    return { ok: true, heroId: hero.id, allies, absent, enemies, templated, controllable };
}

export function buildSetup(lobby, start, { controlledId, difficulty = 'normal' } = {}) {
    const id = controlledId ?? lobby.heroId;
    if (!lobby.controllable.includes(id)) return { ok: false, reason: 'combat-controlled-invalid' };
    const partyLevel = averageLevel(lobby.allies);
    const { units: foes, tiers } = enemyUnits(start, lobby.enemies, partyLevel, difficulty);
    const allies = lobby.allies.map((v) => (v.kind === 'deck-character' ? deckUnit(v) : skillUnit(v)));
    const setup = { rulesVersion: COMBAT_RULES.version, controlledId: id, canEscape: start.tier !== 'boss', units: [...allies, ...foes] };
    return { ok: true, setup, tiers, expTargets: lobby.allies.map((v) => v.name) };
}
// 会话门面。每个对外方法返回 { ok, session, reason? }；session 为当前状态快照，带可用动作 legal。
export function createCombatSession(deps = {}) {
    const { ledger, tables, request, send, storage } = deps;
    const chatOf = () => valueOf(deps.chat) || [];
    const chatIdOf = () => String(valueOf(deps.getChatId) ?? '');
    const userOf = () => String(valueOf(deps.userName) || '').trim();
    const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
    let cur = { status: 'idle' };
    let sending = false;

    const view = () => ({ ...cur, legal: cur.status === 'battle' && cur.battle ? legalActions(cur.battle) : [] });
    const set = (next) => { cur = next; return view(); };
    const done = (extra = {}) => ({ ok: true, ...extra, session: view() });
    const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra, session: view() });
    const sessionKey = () => sessionKeyFor(chatIdOf());
    const base = (s) => ({ combatId: s.combatId, anchor: s.anchor, start: s.start, reportId: s.reportId, chatId: s.chatId });

    // 开战楼仍在、swipe 未变、末尾标签未变，且仍是同一聊天。
    const anchorValid = (s) => {
        if (s.chatId !== undefined && s.chatId !== chatIdOf()) return false;
        const found = locateCombatStart(chatOf(), s.anchor?.messageId, deps.sourceFilter);
        return found.ok && sameAnchor(found.anchor, s.anchor);
    };
    const invalidate = () => {
        writeJson(storage, sessionKey(), null);
        set({ ...base(cur), status: 'stale', reason: 'combat-floor-changed' });
        return fail('combat-floor-changed');
    };
    const block = (b, reason, extra = {}) => {
        set({ ...b, status: 'blocked', reason, ...extra });
        return fail(reason, extra);
    };

    function readOutbox() {
        const box = readJson(storage, outboxKeyFor(chatIdOf()));
        return box.ok ? { ok: true, value: box.value && typeof box.value === 'object' ? box.value : {} } : box;
    }
    function writeOutbox(combatId, item) {
        const box = readOutbox();
        if (!box.ok) return false;
        const next = { ...box.value };
        if (item) next[combatId] = item;
        else delete next[combatId];
        return writeJson(storage, outboxKeyFor(chatIdOf()), Object.keys(next).length ? next : null);
    }

    // 开战楼 messageId 由调用方确认为最新 AI 楼。已回传的只回顾，待回传的只能重试发送，不再重打。
    async function prepare(messageId, { signal } = {}) {
        const chat = chatOf();
        const found = locateCombatStart(chat, messageId, deps.sourceFilter);
        if (!found.ok) return fail(found.reason);
        const userName = userOf();
        if (!userName) return fail('combat-user-name-missing');
        const b = { combatId: found.combatId, anchor: found.anchor, start: found.start, reportId: reportIdFor(found.combatId), chatId: chatIdOf() };
        if (findReportFloor(chat, messageId, b.reportId) >= 0) return done({ session: set({ ...b, status: 'done' }) });
        const box = readOutbox();
        if (!box.ok) return fail(box.reason);
        if (box.value[b.combatId]) return done({ session: set({ ...b, status: 'send-failed', report: box.value[b.combatId] }) });
        set({ ...b, status: 'preparing' });
        let state = await ledger.effectiveState();
        if (!state.ok) return block(b, state.reason, state.detail ? { detail: state.detail } : {});
        const entities = missingEntities(state, found.start, userName);
        const templates = new Map();
        let generation = null;
        if (entities.length) {
            generation = await generateEntities(entities, {
                request, llm: valueOf(deps.llm), signal, classes: state.classes, now: now(),
                context: { encounter: found.start.encounter, tier: found.start.tier, protagonist: userName },
            });
            if (generation.reason === 'request-stale' || !anchorValid(b)) {
                set({ status: 'idle' });
                return fail('request-stale');
            }
            if (generation.reason) return block(b, generation.reason, generation.missing ? { missing: generation.missing } : {});
            const writes = generationWrites(generation, { createdAt: now() });
            if (writes.profiles.length) {
                const written = await tables.append('profile', writes.profiles);
                if (written?.ok !== true) return block(b, 'combat-profile-write-failed', { write: written });
            }
            for (const r of generation.rejected) if (r.fallback?.kind === 'template-enemy') templates.set(r.owner, r.fallback.profile);
            if (generation.blocked) return block(b, 'combat-protagonist-generation-failed', { rejected: generation.rejected });
            state = await ledger.effectiveState();
            if (!state.ok) return block(b, state.reason);
        }
        const lobby = buildLobby(state, found.start, userName, templates);
        if (!lobby.ok) return block(b, lobby.reason);
        const skipped = (generation?.rejected || []).filter((r) => r.fallback?.kind === 'skip').map((r) => r.owner);
        return done({ session: set({ ...b, status: 'lobby', lobby, skipped }) });
    }

    function start({ controlledId } = {}) {
        if (cur.status !== 'lobby') return fail('combat-session-not-ready');
        if (!anchorValid(cur)) return invalidate();
        const built = buildSetup(cur.lobby, cur.start, { controlledId, difficulty: valueOf(deps.difficulty) || 'normal' });
        if (!built.ok) return fail(built.reason);
        const seed = seedFor(cur.combatId);
        const created = createBattle(built.setup, seed);
        if (!created.ok) return fail('combat-setup-invalid', { error: created.error });
        const record = {
            v: SESSION_VERSION, combatId: cur.combatId, anchor: cur.anchor, seed, setup: built.setup, actions: [],
            encounter: cur.start.encounter, tiers: built.tiers, expTargets: built.expTargets,
        };
        if (!writeJson(storage, sessionKey(), record)) return fail('combat-session-save-failed');
        set({ ...cur, status: 'battle', record, battle: created.state, events: created.events });
        return done({ events: created.events });
    }

    // 动作先在副本上结算，持久化成功后才推进；保存失败时状态不变。
    function act(action) {
        if (cur.status !== 'battle') return fail('combat-session-not-in-battle');
        if (!anchorValid(cur)) return invalidate();
        const r = applyAction(cur.battle, action);
        if (!r.ok) return fail(r.error.reason, { error: r.error });
        const record = { ...cur.record, actions: [...cur.record.actions, action] };
        if (!writeJson(storage, sessionKey(), record)) return fail('combat-session-save-failed');
        set({ ...cur, record, battle: r.state, events: [...cur.events, ...r.events], status: r.state.outcome ? 'ended' : 'battle' });
        return done({ events: r.events });
    }
    // 发送待回传战报：发送前若聊天里已有同一战报（上次已送达但未清理）直接完成，不重复发送；失败保留待回传，不自动重发。
    async function deliver(item) {
        const settle = async (messageId) => {
            writeOutbox(cur.combatId, null);
            writeJson(storage, sessionKey(), null);
            let scan = null;
            if (Number.isInteger(messageId) && ledger?.scan) {
                try { scan = await ledger.scan({ messageIds: [messageId] }); } catch (error) { scan = { ok: false, reason: 'combat-ledger-scan-failed' }; }
            }
            set({ ...base(cur), status: 'done', report: item });
            return done({ messageId: messageId ?? null, scan });
        };
        const existing = findReportFloor(chatOf(), cur.anchor.messageId, item.reportId);
        if (existing >= 0) return settle(existing);
        if (sending) return fail('combat-report-sending');
        if (typeof send !== 'function') {
            set({ ...cur, status: 'send-failed', report: item });
            return fail('combat-send-unavailable');
        }
        sending = true;
        let result;
        try { result = await send(item.text); } catch (error) { result = { ok: false, reason: 'combat-send-error' }; } finally { sending = false; }
        if (result?.ok === true) {
            const id = Number(result.messageId);
            return settle(Number.isInteger(id) ? id : null);
        }
        set({ ...cur, status: 'send-failed', report: item });
        return fail('combat-report-send-failed', { detail: result?.reason || null });
    }

    // 结算：构造战报，先写「待回传」再发送。胜利的 EXP 以战报楼里的标签为准，由账本扫描入库。
    async function finish() {
        if (cur.status !== 'ended') return fail('combat-session-not-ended');
        if (!anchorValid(cur)) return invalidate();
        const report = buildCombatReport({
            combatId: cur.combatId, encounter: cur.record.encounter, state: cur.battle, events: cur.events,
            enemyTiers: cur.record.tiers, expTargets: cur.record.expTargets, detail: valueOf(deps.reportDetail) || 'normal',
        });
        if (!report.ok) return fail(report.reason);
        const item = { reportId: report.reportId, text: report.text, result: report.result, kind: 'report' };
        if (!writeOutbox(cur.combatId, item)) return fail('combat-outbox-save-failed');
        return deliver(item);
    }

    // 只在用户点击重试时调用。
    async function retrySend() {
        if (cur.status !== 'send-failed' || !cur.report) return fail('combat-nothing-to-send');
        if (!anchorValid(cur)) return invalidate();
        return deliver(cur.report);
    }

    // 跳过卡牌战斗：发送固定文本，不产生成长条目，也不走待回传。
    async function skip() {
        if (!['lobby', 'blocked'].includes(cur.status)) return fail('combat-session-not-skippable');
        if (!anchorValid(cur)) return invalidate();
        if (sending || typeof send !== 'function') return fail(sending ? 'combat-report-sending' : 'combat-send-unavailable');
        sending = true;
        let result;
        try { result = await send(COMBAT_SKIP_TEXT); } catch (error) { result = { ok: false }; } finally { sending = false; }
        if (result?.ok !== true) return fail('combat-skip-send-failed', { detail: result?.reason || null });
        writeJson(storage, sessionKey(), null);
        set({ ...base(cur), status: 'skipped' });
        return done();
    }

    // 断点续战：核对版本与开战楼锚点后用同一 seed 重放全部动作。不一致时作废并给出原因，不就地修补。
    function resume() {
        const box = readOutbox();
        const saved = readJson(storage, sessionKey());
        if (!saved.ok) return fail(saved.reason);
        if (!saved.value) {
            if (!box.ok) return fail(box.reason);
            return done({ session: set({ status: 'idle' }), outbox: Object.keys(box.value) });
        }
        const rec = saved.value;
        if (rec.v !== SESSION_VERSION || rec.setup?.rulesVersion !== COMBAT_RULES.version) {
            set({ combatId: rec.combatId, anchor: rec.anchor, status: 'stale', reason: 'combat-rules-version-mismatch' });
            return fail('combat-rules-version-mismatch');
        }
        const found = locateCombatStart(chatOf(), rec.anchor?.messageId, deps.sourceFilter);
        const b = { combatId: rec.combatId, anchor: rec.anchor, start: found.start, reportId: reportIdFor(rec.combatId), chatId: chatIdOf() };
        if (!found.ok || !sameAnchor(found.anchor, rec.anchor) || found.combatId !== rec.combatId) {
            cur = b;
            return invalidate();
        }
        if (findReportFloor(chatOf(), rec.anchor.messageId, b.reportId) >= 0) {
            writeJson(storage, sessionKey(), null);
            return done({ session: set({ ...b, status: 'done' }) });
        }
        if (box.ok && box.value[rec.combatId]) return done({ session: set({ ...b, status: 'send-failed', record: rec, report: box.value[rec.combatId] }) });
        const replay = replayBattle(rec.setup, rec.seed, rec.actions);
        if (!replay.ok) {
            set({ ...b, status: 'stale', reason: 'combat-replay-failed', error: replay.error });
            return fail('combat-replay-failed', { error: replay.error });
        }
        return done({ session: set({ ...b, status: replay.state.outcome ? 'ended' : 'battle', record: rec, battle: replay.state, events: replay.events }) });
    }

    function reset() {
        set({ status: 'idle' });
        return done();
    }

    return { prepare, start, act, finish, retrySend, skip, resume, reset, state: view };
}




