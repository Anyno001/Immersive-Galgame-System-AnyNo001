import { COMBAT_RULES, combatSpeedFor, scaleEnemyStats } from './rules.js';
import { applyAction, createBattle, legalActions, replayBattle, seedFor } from './engine.js';
import { deckProfileEntities, enemyEntities, enemyIdFor, generationWrites, rewardEntity, skillProfileEntity, templateEnemy, withCharacterLore, withStoryContext, withCombatInitialization } from './generation.js';
import { generateWithRetry } from './generation-retry.js';
import { attachLoot, buildCombatReport, COMBAT_SKIP_TEXT, hasLoot, reportIdFor, reportIdOf } from './report.js';
import { CONSUME_TAG_HASH, PROTAGONIST_ALIASES, attributeViewFor, abilitiesForName } from './ledger.js';
import { REL_TIERS } from './abilities.js';
import { scaleCatalog, scaleSkills } from './card-scaling.js';
import { ledgerEntryId, profileIdFor } from './schema.js';
import { defaultHeroSkill, ultimateSkill } from './card-templates.js';
import { enemyArtKeyFor } from './enemy-art.js';
import { extractCombatStart } from '../scene/combat-directives.js';
import { chooseCard, emptyPick, flipCard, flipView, laterPick, lootOf, normalizePick, rerollPick } from './flip.js';
import { REROLL_COST } from './points.js';
import { traitLinks, traitPassives } from './traits.js';

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
// 人物技能：档案里有就用，旧档案没有时按职业原型回落默认技能。速度同理：档案 base.speed 优先，旧档案按职业原型 / 档位回落。
// 已装备的装备被动（武器 / 防具 / 饰品 / 宝物各 1 件）随角色进入 setup；旧档案没有装备时为空。
// 装着的人物特性被动（traits.js，只主角有）同样随角色进入 setup；待定特性不生效。
const gearPassives = (view) => Object.values(view.gear?.slots || {}).filter(Boolean).map((g) => g.passive).filter(Boolean);

function deckUnit(view) {
    const heroSkill = view.profile.heroSkill || defaultHeroSkill(view.classProfile?.archetype, view.id);
    const fit = characterCombatStats(view);
    return {
        id: view.id, name: view.name, side: 'ally', kind: 'deck', maxHp: fit.hp,
        energy: view.profile.base.energy, draw: view.profile.base.draw,
        speed: fit.speed,
        // 卡牌属性性能：开战时按持有者六维换算图鉴，产出新对象，不改档案与图鉴；没有属性视图时与旧版一致。
        deck: view.deckEntries.map((e) => ({ ...e })), catalog: view.attributes?.scores ? scaleCatalog(view.catalog, view.attributes) : Object.fromEntries(view.catalog),
        passives: [view.classProfile?.classPassive, view.profile.personalPassive, ...gearPassives(view), ...traitPassives(view)].filter(Boolean),
        ...(heroSkill ? { heroSkill } : {}),
        ...abilitySnapshot(view.attributes),
    };
}

// 强度档：缺省 defaultAllyTier；倍率为 1 时沿用原技能对象，peer 档的 setup 形状与旧版一致。
const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));
// 六维开战换算：生命 + 体质调整值 × 等级（不低于原生命一半），速度 + 敏捷调整值 × 2（夹 40–200）。没有属性视图时原样返回。
function applyAbilities(hp, speed, attr) {
    if (!attr?.mods) return { hp, speed };
    const level = Math.max(1, Number(attr.level) || 1);
    return {
        hp: clampInt(Math.max(Math.ceil(hp / 2), hp + attr.mods.con * level), 1, 9999),
        speed: clampInt(speed + attr.mods.dex * 2, 40, 200),
    };
}
// 等级与六维快照进 setup，断点续战按快照重放，不随之后的账本变化。
const abilitySnapshot = (attr) => (attr?.scores ? { level: attr.level, abilities: { ...attr.scores } } : {});
function scaleEffect(e, k) {
    if (e.op === 'conditional') return { ...e, then: e.then.map((t) => scaleEffect(t, k)) };
    if (e.op === 'damage' || e.op === 'block') return { ...e, amount: clampInt(e.amount * k, 1, 99) };
    if (e.op === 'heal') return { ...e, amount: clampInt(e.amount * k, 1, 60) };
    return e;
}
export function allyTierOf(profile) {
    const key = Object.hasOwn(COMBAT_RULES.allyTiers, profile?.tier) ? profile.tier : COMBAT_RULES.defaultAllyTier;
    return { key, ...COMBAT_RULES.allyTiers[key] };
}

// 人物状态与开战共享生命、速度换算，不读宿主也不修改档案。
export function characterCombatStats(view) {
    const deck = view.kind === 'deck-character';
    const tier = deck ? null : skillTierFor(view);
    const baseHp = deck ? view.hpMax : tier.hp === 1 ? view.profile.base.hp : clampInt(view.profile.base.hp * tier.hp, 1, 999);
    const speed = view.profile.base.speed ?? combatSpeedFor({ ...(deck && { archetype: view.classProfile?.archetype }), id: view.id });
    return applyAbilities(baseHp, speed, view.attributes);
}

function skillTierFor(view) {
    const relAlly = view.attributes?.relTagged ? REL_TIERS[view.attributes.tier]?.ally : null;
    return relAlly && COMBAT_RULES.allyTiers[relAlly] ? { key: relAlly, ...COMBAT_RULES.allyTiers[relAlly] } : allyTierOf(view.profile);
}

function skillUnit(view) {
    // 强度档：正文打过相对档时由档位推导；没有相对档时沿用档案 tier。
    const tier = skillTierFor(view);
    // 先按六维换算技能数值，强度档倍率乘在换算后的数值上。
    const own = scaleSkills(view.skills, view.attributes);
    const skills = tier.skill === 1 ? own : own.map((s) => ({ ...s, effects: s.effects.map((e) => scaleEffect(e, tier.skill)) }));
    const extra = tier.ultimateCooldown > 0
        ? [ultimateSkill(Math.round(COMBAT_RULES.allySkillDamageCap * tier.skill), { id: `${view.id}-u1`, cooldown: tier.ultimateCooldown })] : [];
    const fit = characterCombatStats(view);
    return {
        id: view.id, name: view.name, side: 'ally', kind: 'skill',
        maxHp: fit.hp,
        speed: fit.speed, skills: [...skills, ...extra], passives: [...(view.passives || []), ...gearPassives(view)],
        ...abilitySnapshot(view.attributes),
    };
}

// 同名敌人共享一份档案，多只时按「甲乙丙」区分；数值按敌人推导等级（相对档；没有属性视图时用我方平均等级）与难度缩放。
function enemyUnits(start, profiles, partyLevel, difficulty, attributes = new Map()) {
    const units = [];
    const tiers = [];
    for (const { name, count } of start.enemies) {
        const profile = profiles.get(name);
        const attr = attributes.get(name) || null;
        const scaled = scaleEnemyStats(profile, attr?.level ?? partyLevel, difficulty);
        const fit = applyAbilities(scaled.hp, profile.base?.speed ?? combatSpeedFor({ tier: profile.tier, id: profile.id }), attr);
        for (let i = 0; i < count; i += 1) {
            units.push({
                id: count > 1 ? `${profile.id}-${i + 1}` : profile.id,
                name: count > 1 ? `${name}${ENEMY_SUFFIX[i] || i + 1}` : name,
                side: 'enemy', kind: 'skill', maxHp: fit.hp, damageScale: scaled.damageScale,
                speed: fit.speed,
                skills: scaleSkills(profile.skills, attr), passives: profile.passives, phases: profile.phases,
                // 外观格位：档案 art 优先，模板敌人与旧档案按原名推断；同名多只共用一格。
                art: enemyArtKeyFor({ art: profile.art, name, tier: profile.tier }),
                ...abilitySnapshot(attr),
            });
            tiers.push(profile.tier);
        }
    }
    return { units, tiers };
}

// 缺档案的参战者：主角自动生成卡组档案；队友没有档案时生成技能档案（卡组档案只在面板里手动生成）；敌人同名同档复用。
// heroOnly：已准备过的场次只补主角（缺主角无法开战），队友与敌人不再生成。
function missingEntities(state, start, userName, { heroOnly = false } = {}) {
    const entities = [];
    if (!findCharacter(state, userName)) {
        entities.push(...deckProfileEntities({ name: userName, id: profileIdFor('deck-character', userName), role: 'protagonist', classes: state.classes }));
    }
    if (heroOnly) return entities;
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
    // 敌人属性按名字键取（相对档与六维）；账本未提供属性视图时为空，开战按旧规则缩放。
    const enemyAttributes = new Map();
    for (const { name } of start.enemies) {
        const attr = attributeViewFor(state, name);
        if (attr) enemyAttributes.set(name, attr);
    }
    return { ok: true, heroId: hero.id, allies, absent, enemies, templated, controllable, enemyAttributes };
}

// 本场胜利奖励（v3 §5.1）：领取者为主角（尚无档案时用将要生成的主角 ID）；EXP 与战报同口径，按敌人只数 × 遭遇档位求和。
// 翻牌联动按准备时主角装着的人物特性汇总（traitLinks），开战后换特性不影响本场。
function rewardFor(state, b, userName) {
    const hero = findCharacter(state, userName);
    const character = hero || { kind: 'deck-character', id: profileIdFor('deck-character', userName), name: userName };
    const enemyTiers = b.start.enemies.flatMap((e) => Array(Math.max(1, Number(e.count) || 1)).fill(b.start.tier));
    return rewardEntity({ combatId: b.combatId, anchor: b.anchor, tier: b.start.tier, enemyTiers, enemies: b.start.enemies, encounter: b.start.encounter, character, links: traitLinks(hero?.traits) });
}
// 只有这两类实体时请求失败不阻断开战：初始化记诊断，奖励在大厅显示原因与重试。
const NONBLOCKING_KINDS = new Set(['profile-init', 'battle-reward']);
const rewardReason = (generation) => generation?.reason || ((generation?.rejected || []).some((r) => r.kind === 'battle-reward') ? 'combat-reward-generation-failed' : '');
// 大厅奖励状态：日志表已有本场 offer 为 ready（EXP 与翻牌数取 offer）；否则 failed（EXP 与翻牌数按计划，reason 只供诊断，大厅只显示「奖励生成失败」与重试）。
function rewardView(state, combatId, plan, reason) {
    const offer = state?.ok ? state.offers?.get(combatId) : null;
    if (offer) return { status: 'ready', exp: offer.exp, slots: offer.slots.length };
    return { status: 'failed', exp: plan?.exp ?? 0, slots: plan?.slots.length ?? 0, reason: reason || 'combat-reward-missing' };
}

// 觉醒只给本场主战者：标签点名的角色须是被操控的那位（主角可写「我」/主角名）；点名别人或换人操控时不带入 setup。
// 本场用掉的道具：setup 带入数量 − 结束时剩余数量；没有带道具或没用时为空。
function consumedItems(record, battle) {
    const left = new Map((battle?.items?.list || []).map((i) => [i.itemId, i.count]));
    return (record?.setup?.items || []).map((i) => ({ itemId: i.itemId, count: i.count - (left.get(i.itemId) ?? i.count) })).filter((u) => u.count > 0);
}

function awakenFor(start, view, heroId, userName) {
    const a = start.awaken;
    if (!a || !view) return null;
    const names = [view.name, ...(view.profile?.aliases || [])];
    if (view.id === heroId) names.push(...PROTAGONIST_ALIASES, ...(userName ? [userName] : []));
    return names.includes(a.character) ? { type: a.type, line: a.line } : null;
}

export function buildSetup(lobby, start, { controlledId, difficulty = 'normal', userName } = {}) {
    const id = controlledId ?? lobby.heroId;
    if (!lobby.controllable.includes(id)) return { ok: false, reason: 'combat-controlled-invalid' };
    const partyLevel = averageLevel(lobby.allies);
    const { units: foes, tiers } = enemyUnits(start, lobby.enemies, partyLevel, difficulty, lobby.enemyAttributes);
    const allies = lobby.allies.map((v) => (v.kind === 'deck-character' ? deckUnit(v) : skillUnit(v)));
    // overkill：新开的战斗允许鞭尸与超杀（打空最后一名敌人后到结束回合才判胜）；旧记录的 setup 不带该字段，重放规则不变。
    const setup = { rulesVersion: COMBAT_RULES.version, controlledId: id, canEscape: start.tier !== 'boss', overkill: true, units: [...allies, ...foes] };
    const controlled = lobby.allies.find((v) => v.id === id);
    const awaken = awakenFor(start, controlled, lobby.heroId, userName);
    if (awaken) setup.awaken = awaken;
    // 一次性道具：被操控者当前持有的道具带入本场；没有道具时不写字段，setup 形状与旧版一致。
    const items = (controlled?.items || []).filter((i) => i.count > 0).slice(0, 12)
        .map((i) => ({ itemId: i.itemId, name: i.name, count: Math.min(99, i.count), effects: i.effects }));
    if (items.length) setup.items = items;
    const dropped = start.awaken && !awaken ? { awakenDropped: 'combat-awaken-not-controlled' } : {};
    return { ok: true, setup, tiers, expTargets: lobby.allies.map((v) => v.name), ...dropped };
}
// 会话门面。每个对外方法返回 { ok, session, reason? }；session 为当前状态快照，带可用动作 legal。
export function createCombatSession(deps = {}) {
    const { ledger, tables, request, send, storage } = deps;
    const chatOf = () => valueOf(deps.chat) || [];
    const chatIdOf = () => String(valueOf(deps.getChatId) ?? '');
    const userOf = () => String(valueOf(deps.userName) || '').trim();
    const filterOf = () => valueOf(deps.sourceFilter);
    const now = typeof deps.now === 'function' ? deps.now : () => Date.now();
    let cur = { status: 'idle' };
    let sending = false;
    // 聊天记录留档（deps.chatRecord：read(anchor, combatId) / write(anchor, combatId, patch)）：结果已写入的场次、最近一次写入失败的原因、在途的结果写入。
    const recordSaved = new Set();
    let recordError = '';
    let resultWrite = null;
    // 同一场的准备只跑一次：后台自动准备与面板打开时的准备共用同一个进行中的请求。
    let preparing = null;
    // 大厅奖励重试：同一时刻只跑一次。
    let rewardRun = null;
    // 胜利翻牌：flipCtx 为已读到的本场上下文 { combatId, offer, pick, points, payer, character }；flipWrite 串起聊天记录里的进度写入。
    let flipCtx = null;
    let flipWrite = Promise.resolve();
    let flipBusy = false;
    const listeners = new Set();

    const view = () => ({ ...cur, ...(recordError ? { recordError } : {}), legal: cur.status === 'battle' && cur.battle ? legalActions(cur.battle) : [] });
    const set = (next) => { cur = next; return view(); };
    const done = (extra = {}) => ({ ok: true, ...extra, session: view() });
    const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra, session: view() });
    const sessionKey = () => sessionKeyFor(chatIdOf());
    const base = (s) => ({ combatId: s.combatId, anchor: s.anchor, start: s.start, reportId: s.reportId, chatId: s.chatId });

    // 开战楼仍在、swipe 未变、末尾标签未变，且仍是同一聊天。
    const anchorValid = (s) => {
        if (s.chatId !== undefined && s.chatId !== chatIdOf()) return false;
        const found = locateCombatStart(chatOf(), s.anchor?.messageId, filterOf());
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

    // 异步变化（准备结束、记录写入）通知订阅者；同步动作的结果由调用方直接拿到。
    const emit = () => {
        const v = view();
        for (const fn of [...listeners]) { try { fn(v); } catch (error) { /* 订阅者异常不影响会话 */ } }
    };
    function subscribe(fn) {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn);
        return () => listeners.delete(fn);
    }
    const itemOf = (r) => ({ reportId: r.reportId, text: r.text, result: r.result, kind: 'report',
        ...(Array.isArray(r.used) && r.used.length && typeof r.character === 'string' && r.character ? { used: r.used.map((u) => ({ itemId: u.itemId, count: u.count })), character: r.character } : {}) });
    // 本场道具用量与操控角色：随战报一起留档，重发同一份战报时照样扣除，删战报楼后重发不会退回道具。
    const usageOf = (c) => {
        const used = consumedItems(c.record, c.battle);
        const character = c.record?.setup?.controlledId;
        return used.length && character ? { used, character } : {};
    };
    const usedOk = (r) => r.used === undefined || (Array.isArray(r.used) && typeof r.character === 'string'
        && r.used.every((u) => typeof u?.itemId === 'string' && Number.isInteger(u?.count) && u.count > 0));
    const buildReport = (c) => buildCombatReport({
        combatId: c.combatId, encounter: c.record.encounter, state: c.battle, events: c.events,
        enemyTiers: c.record.tiers, expTargets: c.record.expTargets, detail: valueOf(deps.reportDetail) || 'normal',
    });
    // 没注入时视为没有记录；读取失败或格式不对时 fail-closed，不当作没有记录。
    function readRecord(b) {
        const rec = deps.chatRecord;
        if (!rec || typeof rec.read !== 'function') return { ok: true, value: null };
        let r;
        try { r = rec.read(b.anchor, b.combatId); } catch (error) { return { ok: false, reason: 'combat-record-read-failed' }; }
        if (r?.ok !== true) return { ok: false, reason: r?.reason || 'combat-record-read-failed' };
        const result = r.value?.result;
        if (result !== undefined && (typeof result?.reportId !== 'string' || typeof result?.text !== 'string' || typeof result?.result !== 'string' || !usedOk(result))) return { ok: false, reason: 'combat-record-corrupt' };
        return { ok: true, value: r.value || null };
    }
    async function writeRecord(b, patch) {
        const rec = deps.chatRecord;
        if (!rec || typeof rec.write !== 'function') return { ok: true, skipped: true };
        // 写前核对聊天、开战楼、swipe 与开战标签都没变；write 在第一次 await 之前完成楼层核对与内存改动，与这里的核对在同一个同步段内。
        if (!anchorValid(b)) { recordError = 'combat-record-stale'; return { ok: false, reason: 'combat-record-stale' }; }
        let r;
        try { r = await rec.write(b.anchor, b.combatId, patch); } catch (error) { r = null; }
        const out = r?.ok === true ? r : { ok: false, reason: r?.reason || 'combat-record-save-failed' };
        recordError = out.ok ? '' : out.reason;
        return out;
    }
    // 战斗结果写进开战楼聊天记录（胜负、回合数、战报 ID 与正文）；写失败不阻断发送，结算或重发时补写。
    async function saveResult(b, item, battle) {
        const usage = item.used ? { used: item.used, character: item.character } : {};
        const w = await writeRecord(b, { result: { reportId: item.reportId, result: item.result, text: item.text, outcome: battle?.outcome || '', turn: Number(battle?.turn) || 0, at: now(), ...usage } });
        if (w.ok) recordSaved.add(b.combatId);
        emit();
        return w;
    }

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

    // ---- 胜利翻牌（v3 §5.3，助手反馈 3） ----
    // 会话 flip：loading / none（本场没有 offer，照发不带战利品）/ error（读不到账本或进度损坏，不能发）/ ready（flip.js 的 flipView）。
    // 进度 { set, flipped, choice } 存会话存档 record.flip 与开战楼聊天记录的 flip 字段，几份不一致时取进度更靠后的；聊天记录 result 不改。
    const finalItem = () => cur.final || cur.report || null;
    const resultOf = () => finalItem()?.result ?? (cur.battle?.outcome === 'victory' ? 'win' : null);
    const flipOpen = () => (cur.status === 'ended' || cur.status === 'send-failed') && resultOf() === 'win';
    const flipOf = (ctx) => flipView(ctx.offer, ctx.pick, { points: ctx.points, payer: ctx.payer, locked: hasLoot(finalItem()?.text) });

    async function loadFlip() {
        if (!flipOpen()) return fail('combat-flip-unavailable');
        const b = base(cur);
        if (!cur.flip) set({ ...cur, flip: { status: 'loading' } });
        let state;
        try { state = await ledger.effectiveState(); } catch (error) { state = null; }
        if (cur.combatId !== b.combatId || !flipOpen()) return fail('request-stale');
        const settle = (flip, ctx = null) => {
            flipCtx = ctx;
            set({ ...cur, flip });
            emit();
            return flip.status === 'error' ? fail(flip.reason) : done();
        };
        if (state?.ok !== true) return settle({ status: 'error', reason: state?.reason || 'combat-ledger-read-failed' });
        const offer = state.offers?.get(b.combatId);
        if (!offer) return settle({ status: 'none' });
        const record = readRecord(b);
        if (!record.ok) return settle({ status: 'error', reason: record.reason });
        const saved = readJson(storage, sessionKey());
        const savedFlip = saved.ok && saved.value?.combatId === b.combatId ? saved.value.flip : undefined;
        const picks = [cur.record?.flip, savedFlip, record.value?.flip].filter((raw) => raw !== undefined && raw !== null).map((raw) => normalizePick(raw, offer));
        if (picks.some((p) => !p)) return settle({ status: 'error', reason: 'combat-flip-corrupt' });
        const heroId = state.attributes?.heroId ?? null;
        const ctx = {
            combatId: b.combatId, offer, pick: picks.reduce(laterPick, null) || emptyPick(),
            points: heroId ? state.characters.get(heroId)?.points || 0 : 0, payer: Boolean(heroId) && offer.character === heroId,
            character: state.characters.get(offer.character)?.name || userOf(),
        };
        return settle(flipOf(ctx), ctx);
    }

    // 翻牌动作的公共前置：已读到本场 offer、战利品还没附进战报。
    function flipProblem() {
        if (!flipOpen()) return 'combat-flip-unavailable';
        if (!flipCtx || flipCtx.combatId !== cur.combatId || cur.flip?.status !== 'ready') return 'combat-flip-not-ready';
        return hasLoot(finalItem()?.text) ? 'combat-flip-locked' : null;
    }
    // 有会话存档时先存存档再写聊天记录（写失败只记 recordError）；没有会话存档时写进聊天记录才推进，避免重开后重翻。
    async function commitPick(next) {
        const b = base(cur);
        if (cur.record) {
            const record = { ...cur.record, flip: next };
            if (!writeJson(storage, sessionKey(), record)) return fail('combat-session-save-failed');
            flipCtx = { ...flipCtx, pick: next };
            set({ ...cur, record, flip: flipOf(flipCtx) });
            const run = flipWrite.then(() => writeRecord(b, { flip: next }));
            flipWrite = run.catch(() => {});
            await run;
            emit();
            return done();
        }
        if (flipBusy) return fail('combat-flip-busy');
        flipBusy = true;
        let w;
        try { w = await writeRecord(b, { flip: next }); } finally { flipBusy = false; }
        if (w?.ok !== true || w.skipped) return fail('combat-flip-save-failed');
        if (cur.combatId !== b.combatId || flipProblem()) return fail('request-stale');
        flipCtx = { ...flipCtx, pick: next };
        set({ ...cur, flip: flipOf(flipCtx) });
        emit();
        return done();
    }
    async function runFlip(step) {
        const problem = flipProblem();
        if (problem) return fail(problem);
        if (!anchorValid(cur)) return invalidate();
        const r = step(flipCtx);
        return r.ok ? commitPick(r.pick) : fail(r.reason);
    }
    // 翻开一张（再翻时翻两张）；再翻的两张翻开后用 choose 二选一；重抽花积分换上备用套重新翻，每场一次（积分在战报楼 loot 条目里扣，这里只核对余额）。
    const flipAt = (position) => runFlip((c) => flipCard(c.offer, c.pick, position));
    const chooseAt = (position) => runFlip((c) => chooseCard(c.offer, c.pick, position));
    const reroll = () => runFlip((c) => rerollPick(c.offer, c.pick, { points: c.points, payer: c.payer }));

    // 胜利战报发出前附战利品：本场有 offer 时必须已选定；没有 offer（奖励生成失败）照发不带战利品；账本读不到或进度损坏时不发。
    async function withLoot(item) {
        if (item?.result !== 'win' || hasLoot(item.text)) return { ok: true, item };
        const loaded = await loadFlip();
        const flip = cur.flip;
        if (flip?.status === 'none') return { ok: true, item };
        if (!loaded.ok || flip?.status !== 'ready' || !flipCtx) return { ok: false, reason: flip?.reason || loaded.reason || 'combat-flip-not-ready' };
        const loot = lootOf(flipCtx.offer, flipCtx.pick);
        if (!loot) return { ok: false, reason: 'combat-flip-required' };
        if (loot.set === 'reserve' && flipCtx.points < REROLL_COST) return { ok: false, reason: 'combat-points-insufficient' };
        await flipWrite;
        return { ok: true, item: { ...item, text: attachLoot(item.text, { character: flipCtx.character, reportId: item.reportId, ...loot }) } };
    }

    // 开战楼 messageId 由调用方确认为最新 AI 楼。已回传的只回顾；已出结果（聊天记录或待回传里有战报）的只能重发同一份战报，不再重打。
    // 同一场正在准备时直接等那一次的结果；准备结束（成功、阻断或作废）后通知订阅者。
    async function prepare(messageId, opts = {}) {
        const found = locateCombatStart(chatOf(), messageId, filterOf());
        if (!found.ok) return fail(found.reason);
        if (preparing && preparing.combatId === found.combatId) return preparing.promise;
        const run = { combatId: found.combatId, promise: null };
        preparing = run;
        run.promise = runPrepare(found, messageId, opts);
        try { return await run.promise; } finally {
            if (preparing === run) preparing = null;
            emit();
        }
    }

    async function runPrepare(found, messageId, { signal } = {}) {
        const chat = chatOf();
        const userName = userOf();
        if (!userName) return fail('combat-user-name-missing');
        const b = { combatId: found.combatId, anchor: found.anchor, start: found.start, reportId: reportIdFor(found.combatId), chatId: chatIdOf() };
        if (findReportFloor(chat, messageId, b.reportId) >= 0) return done({ session: set({ ...b, status: 'done' }) });
        const record = readRecord(b);
        if (!record.ok) return block(b, record.reason);
        if (record.value?.result) {
            recordSaved.add(b.combatId);
            set({ ...b, status: 'send-failed', report: itemOf(record.value.result) });
            await loadFlip();
            return done();
        }
        const box = readOutbox();
        if (!box.ok) return fail(box.reason);
        if (box.value[b.combatId]) {
            set({ ...b, status: 'send-failed', report: box.value[b.combatId] });
            await loadFlip();
            return done();
        }
        set({ ...b, status: 'preparing' });
        // 后台主角卡组预生成进行中时先等它结束，不重复请求、不为同一档案写两份。
        const pregen = typeof deps.awaitProtagonist === 'function' ? deps.awaitProtagonist() : null;
        if (pregen) {
            try { await pregen; } catch (error) { /* 预生成失败时下方按缺档案处理 */ }
            if (signal?.aborted || !anchorValid(b)) { set({ status: 'idle' }); return fail('request-stale'); }
        }
        let state = await ledger.effectiveState();
        if (!state.ok) return block(b, state.reason, state.detail ? { detail: state.detail } : {});
        const heroOnly = Boolean(record.value?.prepared);
        let entities = missingEntities(state, found.start, userName, { heroOnly });
        const names = heroOnly ? [userName] : [userName, ...found.start.allies, ...found.start.enemies.map(e => e.name)];
        if (state.attributes?.table === 'ok') {
            const canonical = [...new Set(names.map(name => PROTAGONIST_ALIASES.includes(name) ? userName : findCharacter(state, name)?.name || name))];
            entities = withCombatInitialization(entities, canonical.filter(name => !abilitiesForName(state, name, userName)?.initialized));
        }
        // 本场奖励：日志表还没有本场 offer 时与缺档案实体同批请求；已有的不再请求。
        // 已准备过的场次（重开面板、重新准备）不自动请求，大厅显示「奖励生成失败」与重试。
        const reward = state.offers?.has(b.combatId) ? null : rewardFor(state, b, userName);
        const askReward = Boolean(reward?.entity) && !heroOnly;
        if (askReward) entities = [...entities, reward.entity];
        let rewardError = '';
        const initDiagnostics = [];
        const current = () => !signal?.aborted && anchorValid(b);
        if (!current()) { set({ status: 'idle' }); return fail('request-stale'); }
        const templates = new Map();
        let generation = null;
        if (entities.length) {
            // 剧情与世界书参考按参战者名字触发；未注入读取器或读不到时 context 与旧版一致。
            const context = await withStoryContext({ encounter: found.start.encounter, tier: found.start.tier, protagonist: userName }, deps.readStoryContext, { names, signal });
            generation = await generateWithRetry(await withCharacterLore(entities, deps.readLore), {
                request, llm: valueOf(deps.llm), signal, classes: state.classes, now: now(),
                context, retryDelays: deps.retryDelays,
            });
            if (generation.reason === 'request-stale' || !current()) {
                set({ status: 'idle' });
                return fail('request-stale');
            }
            if (generation.reason) {
                if (entities.some(entity => !NONBLOCKING_KINDS.has(entity.kind))) return block(b, generation.reason, generation.missing ? { missing: generation.missing } : {});
                if (entities.some(entity => entity.kind === 'profile-init')) initDiagnostics.push({ code: generation.reason });
            }
            initDiagnostics.push(...(generation.diagnostics || []).filter(d => d.code === 'combat-init-invalid'));
            for (const rejected of generation.rejected || []) if (rejected.kind === 'profile-init')
                initDiagnostics.push({ code: 'combat-init-generation-failed', key: rejected.key });
            const writes = generationWrites(generation, { createdAt: now() });
            if (writes.profiles.length) {
                const written = await tables.append('profile', writes.profiles);
                if (written?.ok !== true) return block(b, 'combat-profile-write-failed', { write: written });
            }
            for (const r of generation.rejected) if (r.fallback?.kind === 'template-enemy') templates.set(r.owner, r.fallback.profile);
            if (generation.blocked) return block(b, 'combat-protagonist-generation-failed', { rejected: generation.rejected });
            if (askReward) rewardError = rewardReason(generation) || (await saveOffer(generation)).reason || '';
            for (const item of generation.accepted || []) {
                if (!current()) { set({ status: 'idle' }); return fail('request-stale'); }
                if (!item.init) continue;
                let result;
                try { result = await ledger.writeInit(item.init.name, item.init.value, { signal, shouldStart: current }); }
                catch { result = { ok: false, reason: 'combat-init-write-failed' }; }
                if (result?.ok !== true) initDiagnostics.push({ code: result?.reason || 'combat-init-write-failed', name: item.init.name });
            }
            state = await ledger.effectiveState();
            if (!state.ok) return block(b, state.reason);
        }
        if (!current()) { set({ status: 'idle' }); return fail('request-stale'); }
        const lobby = buildLobby(state, found.start, userName, templates);
        if (!lobby.ok) return block(b, lobby.reason);
        const skipped = (generation?.rejected || []).filter((r) => r.fallback?.kind === 'skip').map((r) => r.owner);
        // 第一次准备完成时留档；写失败不阻断开战，面板提示原因，下次准备时再写。
        if (!record.value?.prepared) await writeRecord(b, { prepared: { at: now() } });
        return done({ session: set({ ...b, status: 'lobby', lobby, skipped, reward: rewardView(state, b.combatId, reward?.plan, rewardError), ...(initDiagnostics.length && { initDiagnostics }) }) });
    }

    // offer 写日志表；写失败不阻断开战，大厅显示原因与重试。
    async function saveOffer(generation) {
        const offers = generationWrites(generation, { createdAt: now() }).entries.filter((e) => e.type === 'offer');
        if (!offers.length) return { ok: true };
        let r;
        try { r = await ledger.append(offers); } catch (error) { r = null; }
        return r?.ok === true ? r : { ok: false, reason: 'combat-offer-write-failed' };
    }

    // 大厅「重试」：只重新请求本场奖励（沿用自动重试分类），写入日志表并读回后更新大厅；开战后或已有奖励时不再请求。
    async function retryReward({ signal } = {}) {
        if (cur.status !== 'lobby' || cur.reward?.status !== 'failed') return fail('combat-reward-not-retryable');
        if (rewardRun) return rewardRun;
        const run = runReward(base(cur), signal);
        rewardRun = run;
        try { return await run; } finally {
            if (rewardRun === run) rewardRun = null;
            emit();
        }
    }

    async function runReward(b, signal) {
        const failed = cur.reward;
        const settle = (reward) => {
            if (cur.status !== 'lobby' || cur.combatId !== b.combatId) return fail('request-stale');
            set({ ...cur, reward });
            return signal?.aborted || !anchorValid(b) ? fail('request-stale') : done();
        };
        set({ ...cur, reward: { ...failed, status: 'pending' } });
        emit();
        const state = await ledger.effectiveState();
        if (!state.ok) return settle({ ...failed, reason: state.reason });
        const userName = userOf();
        const reward = state.offers?.has(b.combatId) ? null : rewardFor(state, b, userName);
        let error = '';
        if (reward?.entity) {
            const names = [userName, ...b.start.allies, ...b.start.enemies.map(e => e.name)];
            const context = await withStoryContext({ encounter: b.start.encounter, tier: b.start.tier, protagonist: userName }, deps.readStoryContext, { names, signal });
            const generation = await generateWithRetry([reward.entity], {
                request, llm: valueOf(deps.llm), signal, classes: state.classes, now: now(),
                context, retryDelays: deps.retryDelays,
            });
            if (generation.reason === 'request-stale' || signal?.aborted) return settle(failed);
            error = rewardReason(generation) || (await saveOffer(generation)).reason || '';
        }
        const after = reward?.entity ? await ledger.effectiveState() : state;
        return settle(after.ok ? rewardView(after, b.combatId, reward?.plan, error) : { ...failed, reason: after.reason });
    }

    function start({ controlledId } = {}) {
        if (cur.status !== 'lobby') return fail('combat-session-not-ready');
        if (!anchorValid(cur)) return invalidate();
        const built = buildSetup(cur.lobby, cur.start, { controlledId, difficulty: valueOf(deps.difficulty) || 'normal', userName: userOf() });
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
        return done({ events: created.events, ...(built.awakenDropped ? { awakenDropped: built.awakenDropped } : {}) });
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
        // 出结果即生成战报并写进聊天记录，不等发送；结算与重发都用这一份。
        if (r.state.outcome) {
            const report = buildReport(cur);
            if (report.ok) {
                const item = { ...itemOf(report), ...usageOf(cur) };
                set({ ...cur, final: item });
                resultWrite = saveResult(base(cur), item, cur.battle);
                // 胜利后读本场 offer 建翻牌状态（异步，读完通知订阅者）。
                if (item.result === 'win') loadFlip().catch(() => {});
            }
        }
        return done({ events: r.events });
    }
    // 发送待回传战报：发送前若聊天里已有同一战报（上次已送达但未清理）直接完成，不重复发送；失败保留待回传，不自动重发。
    async function deliver(item) {
        const settle = async (messageId) => {
            writeOutbox(cur.combatId, null);
            writeJson(storage, sessionKey(), null);
            // 道具消耗：战报楼落楼后按本场实际用量写 consume，锚定战报用户楼；条目 ID 确定，重复落账幂等。
            let consume = null;
            // 用量与操控角色优先取战报自带的（出结果时记下、随聊天记录留档），没有时按本场记录计算。
            const used = Array.isArray(item.used) ? item.used : consumedItems(cur.record, cur.battle);
            const character = item.character || cur.record?.setup?.controlledId;
            if (Number.isInteger(messageId) && used.length && character && ledger?.append) {
                const m = chatOf()[messageId];
                const swipeId = Number.isInteger(m?.swipe_id) ? m.swipe_id : 0;
                const entries = used.map((u, occurrence) => {
                    const anchor = { messageId, swipeId, tagHash: CONSUME_TAG_HASH, occurrence };
                    return { id: ledgerEntryId('consume', character, anchor), type: 'consume', character, anchor, payload: { itemId: u.itemId, count: u.count, reportId: item.reportId }, createdAt: now() };
                });
                try { consume = await ledger.append(entries); } catch (error) { consume = { ok: false, reason: 'combat-consume-write-failed' }; }
            }
            let scan = null;
            if (Number.isInteger(messageId) && ledger?.scan) {
                try { scan = await ledger.scan({ messageIds: [messageId] }); } catch (error) { scan = { ok: false, reason: 'combat-ledger-scan-failed' }; }
            }
            set({ ...base(cur), status: 'done', report: item });
            return done({ messageId: messageId ?? null, scan, ...(consume ? { consume } : {}) });
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
        let item = cur.final;
        if (!item) {
            const report = buildReport(cur);
            if (!report.ok) return fail(report.reason);
            item = { ...itemOf(report), ...usageOf(cur) };
        }
        const combatId = cur.combatId;
        if (resultWrite) await resultWrite;
        if (!recordSaved.has(combatId) && cur.combatId === combatId) await saveResult(base(cur), item, cur.battle);
        if (cur.status !== 'ended' || cur.combatId !== combatId) return fail('combat-session-not-ended');
        // 胜利且本场有 offer 时必须先翻牌；战利品附进战报后才写待回传并发送。
        const looted = await withLoot(item);
        if (!looted.ok) return fail(looted.reason);
        if (cur.status !== 'ended' || cur.combatId !== combatId) return fail('combat-session-not-ended');
        item = looted.item;
        set({ ...cur, final: item });
        if (flipCtx?.combatId === combatId && cur.flip?.status === 'ready') set({ ...cur, flip: flipOf(flipCtx) });
        if (!writeOutbox(cur.combatId, item)) return fail('combat-outbox-save-failed');
        return deliver(item);
    }

    // 只在用户点击重试时调用。
    async function retrySend() {
        if (cur.status !== 'send-failed' || !cur.report) return fail('combat-nothing-to-send');
        if (!anchorValid(cur)) return invalidate();
        if (!recordSaved.has(cur.combatId)) await saveResult(base(cur), cur.report, cur.battle);
        if (cur.status !== 'send-failed' || !cur.report) return fail('combat-nothing-to-send');
        const combatId = cur.combatId;
        const looted = await withLoot(cur.report);
        if (!looted.ok) return fail(looted.reason);
        if (cur.status !== 'send-failed' || cur.combatId !== combatId) return fail('combat-nothing-to-send');
        if (looted.item !== cur.report) {
            if (!writeOutbox(combatId, looted.item)) return fail('combat-outbox-save-failed');
            set({ ...cur, report: looted.item, ...(cur.final ? { final: looted.item } : {}) });
            if (flipCtx?.combatId === combatId && cur.flip?.status === 'ready') set({ ...cur, flip: flipOf(flipCtx) });
        }
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

    // 续战与重开落到「已出结果」时补读翻牌状态（异步，读完通知订阅者）。
    const resumed = () => {
        if (flipOpen()) loadFlip().catch(() => {});
        return done();
    };
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
        const found = locateCombatStart(chatOf(), rec.anchor?.messageId, filterOf());
        const b = { combatId: rec.combatId, anchor: rec.anchor, start: found.start, reportId: reportIdFor(rec.combatId), chatId: chatIdOf() };
        if (!found.ok || !sameAnchor(found.anchor, rec.anchor) || found.combatId !== rec.combatId) {
            cur = b;
            return invalidate();
        }
        if (findReportFloor(chatOf(), rec.anchor.messageId, b.reportId) >= 0) {
            // 战报楼已在聊天里（上次已送达但回执未确认）：会话存档与同场待回传一起清掉，不再显示发送中 / 重试。
            writeJson(storage, sessionKey(), null);
            if (box.ok && box.value[rec.combatId]) writeOutbox(rec.combatId, null);
            return done({ session: set({ ...b, status: 'done' }) });
        }
        // 聊天记录里已有结果（本机存档丢失、换设备或战报楼被删）：只能重发同一份战报，不重放、不重打。
        const chatRecord = readRecord(b);
        if (!chatRecord.ok) return block(b, chatRecord.reason);
        if (chatRecord.value?.result) {
            recordSaved.add(rec.combatId);
            set({ ...b, status: 'send-failed', record: rec, report: itemOf(chatRecord.value.result) });
            return resumed();
        }
        if (box.ok && box.value[rec.combatId]) {
            set({ ...b, status: 'send-failed', record: rec, report: box.value[rec.combatId] });
            return resumed();
        }
        const replay = replayBattle(rec.setup, rec.seed, rec.actions);
        if (!replay.ok) {
            set({ ...b, status: 'stale', reason: 'combat-replay-failed', error: replay.error });
            return fail('combat-replay-failed', { error: replay.error });
        }
        set({ ...b, status: replay.state.outcome ? 'ended' : 'battle', record: rec, battle: replay.state, events: replay.events });
        return resumed();
    }

    function reset() {
        flipCtx = null;
        set({ status: 'idle' });
        return done();
    }

    return { prepare, start, act, finish, retrySend, retryReward, loadFlip, flip: flipAt, choose: chooseAt, reroll, skip, resume, reset, subscribe, state: view };
}




