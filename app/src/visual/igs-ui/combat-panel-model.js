import { canAfford, cardView, describeIntent, effectsNeedTarget, livingIds, opposite } from '../../combat/battle-state.js';
import { actionProgress, isWhipping, targetSpec, upcomingActors } from '../../combat/engine.js';
import { combatFeats } from '../../combat/feats.js';
import { COMBAT_RULES, cardCopyLimit } from '../../combat/rules.js';
import { hash32 } from '../../combat/random.js';
import { enemyArtKeyFor } from '../../combat/enemy-art.js';
import { AWAKEN_TYPE_NAMES, injuryLevel } from '../../combat/report.js';
import { CARD_TYPE_LABELS, cardArtSvg, describeEffectParts, describeEffects } from './combat-card-art.js';
import { scalingMarks } from '../../combat/card-scaling.js';
import { ABILITY_LABELS } from '../../combat/abilities.js';

// 卡牌属性性能显示：换算过的卡给出带增减标记的描述片段；固定卡与旧战斗不带字段，形状与旧版一致。
// 带标记的数字附 tip（要求属性、倍率与「原值 → 现值（差值）」，点数字由面板弹出）；scaleNote 是同样内容的整句，并入卡牌 aria-label 供读屏。
export function cardScalingView(card) {
    const s = card?.scaling;
    if (!s) return {};
    // 手牌经 cardView 后 upgraded 为布尔值；图鉴卡上的 upgraded 是升级形态对象，不代表当前是升级形态。
    const base = card.upgraded === true ? (s.baseUpgraded ?? s.base) : s.base;
    const label = ABILITY_LABELS[s.ability] || s.ability;
    const head = `${label}要求 ${s.required} · 倍率 ×${s.multiplier}`;
    const changes = [];
    const textParts = describeEffectParts(card.effects, scalingMarks(card.effects, base), base).map(({ base: from, ...p }) => {
        if (!p.mark) return p;
        if (!Number.isFinite(from)) return { ...p, tip: head };
        const delta = Number(p.text) - from;
        changes.push(`${from} 变为 ${p.text}`);
        return { ...p, tip: `${head}\n${from} → ${p.text}（${delta > 0 ? '+' : ''}${delta}）` };
    });
    return {
        textParts,
        scaleNote: `${label}要求 ${s.required}，倍率 ×${s.multiplier}${changes.length ? `，${changes.join('，')}` : ''}`,
    };
}

// 战斗面板的纯视图模型：会话快照 → 战前 / 对局 / 结算所需字段；不操作 DOM。
// 是否可出牌只以引擎 legalActions 为准，界面不另算规则。
export const COMBAT_STATUS_NAMES = Object.freeze({ vulnerable: '易伤', weak: '虚弱', strength: '力量', dexterity: '敏捷', poison: '中毒', regen: '再生', thorns: '荆棘', intangible: '无形', 'no-draw': '禁抽', endure: '不屈' });
export const COMBAT_INTENT_LABELS = Object.freeze({ attack: '攻击', defend: '防御', buff: '强化', debuff: '削弱', heal: '治疗', special: '特殊' });
export const COMBAT_OUTCOME_LABELS = Object.freeze({ victory: '胜利', defeat: '败北', escape: '撤退' });
// 战斗成就牌子：标题与台词（判定见 combat/feats.js）。
export const COMBAT_FEAT_LABELS = Object.freeze({
    'honor-kill': Object.freeze({ title: '荣誉击杀', line: '计划通り——最后一滴血，分毫不差。' }),
    overkill: Object.freeze({ title: '超杀', line: '堕落，忙死他卡多！' }),
});
export const COMBAT_REWARD_CARD_COUNT = 3;
export const COMBAT_ORDER_COUNT = 6;
const FX_HIT_LIMIT = 6;

const statusList = (statuses) => Object.entries(statuses || {}).filter(([, v]) => v > 0)
    .map(([key, stacks]) => ({ key, label: COMBAT_STATUS_NAMES[key] || key, stacks }));

// 不选目标的牌 / 技能的承受方：选中后高亮这些单位，点其中任一个（或再点一次牌）确认打出。只读推导，不参与结算。
function affectedIds(state, unit, effects) {
    const out = new Set();
    // 鞭尸时敌人已全灭：范围 / 随机攻击改打倒下的敌人（与引擎 targetsFor 一致），承受方为倒下的敌人。
    const alive = livingIds(state, opposite(unit.side));
    const foes = alive.length || !isWhipping(state, unit) ? alive : state.order.filter((id) => state.units[id].side === opposite(unit.side));
    const walk = (list) => {
        for (const e of list || []) {
            if (e.op === 'conditional' || e.op === 'each-turn') { walk(e.then); continue; }
            const spec = targetSpec(e);
            if (spec === 'self') { if (unit.alive) out.add(unit.id); }
            else if (spec === 'ally' || spec === 'all-allies') livingIds(state, unit.side).forEach((id) => out.add(id));
            else foes.forEach((id) => out.add(id));
        }
    };
    walk(effects);
    return [...out];
}

function intentView(state, id) {
    const intent = describeIntent(state, id);
    if (!intent) return null;
    return { name: intent.name, kind: intent.intent, label: COMBAT_INTENT_LABELS[intent.intent] || '', damage: intent.damage, targetName: intent.targetId ? state.units[intent.targetId]?.name || '' : '' };
}

export function unitView(state, id) {
    const u = state.units[id];
    return {
        id, name: u.name, side: u.side, kind: u.kind, hp: Math.max(0, u.hp), maxHp: u.maxHp, block: u.block, alive: u.alive,
        controlled: id === state.controlledId, statuses: statusList(u.statuses),
        intent: u.side === 'enemy' ? intentView(state, id) : null,
        // 敌人外观格位（setup 带 art 时）：面板据此在通用敌人图集里取图；我方与旧战斗不带该字段。
        ...(u.side === 'enemy' && typeof u.art === 'string' && u.art ? { art: u.art } : {}),
    };
}

export function battleView(state, legal = []) {
    const hero = state.units[state.controlledId];
    const pile = state.piles[hero.id] || { draw: [], hand: [], discard: [], exhaust: [] };
    const plays = legal.filter((a) => a.type === 'play');
    const hand = pile.hand.map((inst) => {
        const card = cardView(state, inst);
        if (!card) return null;
        const mine = plays.filter((a) => a.inst === inst);
        const targets = mine.map((a) => a.targetId).filter((t) => t !== undefined);
        return {
            inst, id: card.id, name: card.name, type: card.type, cost: card.cost, upgraded: card.upgraded, rarity: card.rarity || '',
            typeLabel: CARD_TYPE_LABELS[card.type] || '', text: describeEffects(card.effects), art: cardArtSvg(card),
            affordable: canAfford(card, hero.energy), needsTarget: effectsNeedTarget(card.effects),
            targets, affects: targets.length ? [] : affectedIds(state, hero, card.effects), playable: mine.length > 0,
            ...cardScalingView(card),
        };
    }).filter(Boolean);
    const side = (s) => state.order.filter((id) => state.units[id].side === s).map((id) => unitView(state, id));
    // 人物技能：可用与否只看 legal 里的 hero-skill 动作；旧档案没有技能时为 null。
    const skillActs = legal.filter((a) => a.type === 'hero-skill');
    const hs = hero.heroSkill;
    const skillTargets = skillActs.map((a) => a.targetId).filter((t) => t !== undefined);
    const heroSkill = hs ? {
        id: hs.id, name: hs.name, cost: COMBAT_RULES.heroSkillCost, text: describeEffects(hs.effects),
        used: hero.heroSkillUsed === true, needsTarget: effectsNeedTarget(hs.effects),
        targets: skillTargets, affects: skillTargets.length ? [] : affectedIds(state, hero, hs.effects), usable: skillActs.length > 0,
    } : null;
    // 觉醒：只在 setup 带觉醒时出现；可用与否只看 legal 里的 awaken 动作；旧战斗没有该字段时为 null。
    const aw = state.awaken;
    const awaken = aw ? {
        type: aw.type, label: AWAKEN_TYPE_NAMES[aw.type] || '', line: aw.line || '', used: aw.used === true,
        text: describeEffects(COMBAT_RULES.awakenEffects[aw.type]), usable: legal.some((a) => a.type === 'awaken'),
    } : null;
    return {
        turn: state.turn, phase: state.phase, outcome: state.outcome, energy: hero.energy, energyPerTurn: hero.energyPerTurn,
        piles: { draw: pile.draw.length, discard: pile.discard.length, exhaust: pile.exhaust.length },
        hand, allies: side('ally'), enemies: side('enemy'), heroId: hero.id, heroSkill, awaken,
        // 一次性道具：只在 setup 带道具时给出；可用与否只看 legal 里的 item 动作（每回合 1 次、余量 > 0）。
        items: state.items ? state.items.list.map((i) => ({ itemId: i.itemId, name: i.name, count: i.count, text: describeEffects(i.effects),
            usable: legal.some((a) => a.type === 'item' && a.itemId === i.itemId) })) : [],
        canEndTurn: legal.some((a) => a.type === 'end-turn'), canEscape: legal.some((a) => a.type === 'escape'),
        // 行动顺序槽：引擎按行动值推演的接下来几次出手（出牌阶段首位为操控角色），同一单位可出现多次。
        order: upcomingActors(state, COMBAT_ORDER_COUNT).map((id) => ({ id, name: state.units[id].name, side: state.units[id].side, controlled: id === state.controlledId })),
        // 行动条：每个存活单位沿线的进度（0 起点、1 出手点），面板按此定位头像；出牌阶段操控角色停在出手点。
        track: Object.entries(actionProgress(state)).map(([id, p]) => ({ id, p, name: state.units[id].name, side: state.units[id].side, controlled: id === state.controlledId })),
    };
}

// 选中标记：人物技能等待选目标时用这个值占 selected，与卡牌实例 ID（含 #）不会冲突。
export const HERO_SKILL_SELECTION = 'hero-skill';

// 道具请求 → 合法动作；只剩一个目标（或不需要目标）时直接选中。
export function resolveItem(legal, itemId, targetId) {
    const acts = (legal || []).filter((a) => a.type === 'item' && a.itemId === itemId);
    if (!acts.length) return { ok: false, reason: 'combat-item-unusable' };
    if (targetId === undefined || targetId === null || targetId === '') {
        return acts.length === 1 ? { ok: true, action: acts[0] } : { ok: false, reason: 'combat-target-required', targets: acts.map((a) => a.targetId) };
    }
    const hit = acts.find((a) => a.targetId === targetId);
    return hit ? { ok: true, action: hit } : { ok: false, reason: 'combat-target-invalid' };
}

// 人物技能请求 → 合法动作。规则同出牌：只剩一个目标时自动选中。
export function resolveHeroSkill(legal, targetId) {
    const acts = (legal || []).filter((a) => a.type === 'hero-skill');
    if (!acts.length) return { ok: false, reason: 'combat-hero-skill-unusable' };
    if (targetId === undefined || targetId === null || targetId === '') {
        return acts.length === 1 ? { ok: true, action: acts[0] } : { ok: false, reason: 'combat-target-required', targets: acts.map((a) => a.targetId) };
    }
    const hit = acts.find((a) => a.targetId === targetId);
    return hit ? { ok: true, action: hit } : { ok: false, reason: 'combat-target-invalid' };
}

// 出牌请求 → 合法动作。只剩一个可选目标时自动选中；不在 legal 里的一律拒绝（能量不足、非己方阶段等）。
export function resolvePlay(legal, inst, targetId) {
    const plays = (legal || []).filter((a) => a.type === 'play' && a.inst === inst);
    if (!plays.length) return { ok: false, reason: 'combat-card-unplayable' };
    if (targetId === undefined || targetId === null || targetId === '') {
        return plays.length === 1 ? { ok: true, action: plays[0] } : { ok: false, reason: 'combat-target-required', targets: plays.map((a) => a.targetId) };
    }
    const hit = plays.find((a) => a.targetId === targetId);
    return hit ? { ok: true, action: hit } : { ok: false, reason: 'combat-target-invalid' };
}

// 战前：可操控角色只来自 lobby.controllable（参战且卡组合规）；模板敌人与缺席队友如实列出。
export function lobbyView(session) {
    const lobby = session?.lobby;
    if (!lobby) return null;
    const allies = lobby.allies.map((v) => ({ id: v.id, name: v.name, level: v.level, kind: v.kind, className: v.className || '', controllable: lobby.controllable.includes(v.id) }));
    // 敌人外观格位：与开战后 session 的 enemyUnits 同一规则（档案 art 优先，否则按原名与档位推断）。
    const profileOf = (name) => (lobby.enemies instanceof Map ? lobby.enemies.get(name) : null);
    // 每个敌人带自己的档位（档案优先，否则取开战标签的档位）：战前首领档放大只看这一项。
    const enemies = (session.start?.enemies || []).map(({ name, count }) => {
        const tier = profileOf(name)?.tier || session.start?.tier || 'normal';
        return { name, count, templated: lobby.templated.includes(name), tier, art: enemyArtKeyFor({ art: profileOf(name)?.art, name, tier }) };
    });
    const encounterTier = session.start?.tier || 'normal';
    const tierLabel = Object.hasOwn(COMBAT_RULES.tiers, encounterTier) ? COMBAT_RULES.tiers[encounterTier].label : '';
    // 胜利奖励（会话 reward：ready / pending / failed）；没有时不加字段。
    const reward = session.reward ? { reward: { ...session.reward } } : {};
    return { encounter: session.start?.encounter || '', tier: encounterTier, tierLabel, heroId: lobby.heroId, allies, enemies, absent: [...lobby.absent], skipped: [...(session.skipped || [])], ...reward };
}

// events 为本场引擎事件：只用来推导成就，取到成就时才追加 feats（每项带标题与台词）。
export function endView(state, events = []) {
    if (!state?.outcome) return null;
    const allies = state.order.filter((id) => state.units[id].side === 'ally').map((id) => ({ name: state.units[id].name, injury: injuryLevel(state.units[id]) }));
    const feats = combatFeats(events, state).map((f) => ({ ...f, ...COMBAT_FEAT_LABELS[f.id] }));
    return { outcome: state.outcome, label: COMBAT_OUTCOME_LABELS[state.outcome] || state.outcome, turn: state.turn, allies, ...(feats.length ? { feats } : {}) };
}

// 升级三选一：新卡从图鉴里未满同名上限的非基础卡中按 seed 确定性抽 3 张；升级选有升级形态且还有未升级副本的卡；始终可跳过。
export function rewardChoices(view, level, seedKey = '') {
    if (!view || view.kind !== 'deck-character' || !view.pendingRewards?.includes(level)) return null;
    // 专属卡只靠剧情解锁与精进，不进新卡池，也不出现在升级选项里。
    const pool = [...view.catalog.values()].filter((c) => c.rarity !== 'basic' && c.rarity !== 'signature' && (view.owned.get(c.id) || 0) < cardCopyLimit(c.rarity))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    const cards = [];
    let h = hash32(`${seedKey}|${view.id}|${level}`);
    while (pool.length && cards.length < COMBAT_REWARD_CARD_COUNT) {
        h = hash32(`${h}`);
        const [card] = pool.splice(h % pool.length, 1);
        cards.push({ cardId: card.id, name: card.name, type: card.type, cost: card.cost });
    }
    const upgrades = [...view.owned.entries()].filter(([id, n]) => n > (view.upgraded.get(id) || 0) && view.catalog.get(id)?.upgraded && view.catalog.get(id).rarity !== 'signature')
        .map(([id]) => ({ targetId: id, name: view.catalog.get(id).name }));
    return { level, cards, upgrades };
}

// 引擎事件 → fx-battle 的标签形状。每次出手取对各目标的结果，只保留最后几招，避免托管与敌方阶段的演出过长。
// 攻击伤害带段号（strike）时，同一次出手的各段并成一招：中间只出一次招式，strikes 依次列出段号，面板按段落下（同一段的各目标同时、各段依次）；
// 这一招的结果取各段最重的（击倒 > 命中 > 全挡）。没有段号的变化（治疗、中毒致死等）仍按目标各出一招。
export function combatFxSource(events, state, { start = false, foe = '', title = '' } = {}) {
    const hits = [];
    let action = null;
    const units = state?.units || {};
    const rank = { ko: 3, hit: 2, guard: 1, heal: 0 };
    const raise = (h, result) => { if (rank[result] > rank[h.result]) h.result = result; };
    const entry = (target, result) => ({ owner: action, attacker: units[action.actor]?.name || '', target: units[target]?.name || '', skill: action.name, result });
    const push = (target, result) => {
        if (!action) return;
        const prev = hits.find((h) => h.owner === action && !h.strikes && h.id === target);
        if (prev) { raise(prev, result); return; }
        hits.push({ ...entry(target, result), id: target });
    };
    const volley = (target, result, strike) => {
        if (!action) return;
        const prev = hits.find((h) => h.owner === action && h.strikes);
        if (prev) {
            raise(prev, result);
            if (!prev.strikes.includes(strike)) prev.strikes.push(strike);
            prev.ids.add(target);
            return;
        }
        hits.push({ ...entry(target, result), strikes: [strike], ids: new Set([target]) });
    };
    for (const e of events || []) {
        if (e.type === 'card' || e.type === 'skill' || e.type === 'hero-skill' || e.type === 'item') action = { actor: e.unitId, name: e.name };
        else if (e.type === 'awaken') action = { actor: e.unitId, name: AWAKEN_TYPE_NAMES[e.awakenType] || '' };
        else if (e.type === 'turn-start') action = null;
        else if (e.type === 'damage' && e.kind === 'attack') {
            // 鞭尸 / 超杀打在倒下的敌人身上：不掉血，演出仍按命中。
            const result = e.hpLoss > 0 || e.overkill ? 'hit' : 'guard';
            if (e.strike) volley(e.target, result, e.strike); else push(e.target, result);
        } else if (e.type === 'defeated') {
            const struck = action ? hits.find((h) => h.owner === action && h.ids?.has(e.unitId)) : null;
            if (struck) raise(struck, 'ko'); else push(e.unitId, 'ko');
        }
        else if (e.type === 'heal' && e.amount > 0) push(e.target, 'heal');
    }
    const end = [...(events || [])].reverse().find((e) => e.type === 'battle-end');
    const battleEnd = end ? ({ victory: 'win', defeat: 'lose', escape: 'escape' })[end.outcome] || '' : '';
    return {
        battle: { foe, title }, battleStart: start === true, battleEnd,
        hits: hits.slice(-FX_HIT_LIMIT).map(({ owner, id, ids, strikes, ...h }) => (strikes ? { ...h, strikes } : h)),
        userName: units[state?.controlledId]?.name || '',
    };
}

// 多段攻击相邻两段落下的间隔（毫秒）；同一段的各目标同时落下。
export const COMBAT_VOLLEY_GAP_MS = 280;

// 命中落点时刻。fx 为 combatFxSource 的结果，plan 为它的演出计划（plan.events 里的 hit 与 fx.hits 按顺序一一对应），时刻从命中演出开始起算。
// strikes：段号 → { at, event, first }，这一招命中时刻起第 k 段再加 k 个段间隔；named：没有段号的招按目标名列出时刻，供其余变化按名字认领。
// last 为最后一次落下的时刻，extra 为它超出计划里最后一次命中的部分（面板据此加长这一段的停留）。
export function combatLandings(fx, plan, gap = COMBAT_VOLLEY_GAP_MS) {
    const strikes = new Map();
    const named = [];
    const planned = (plan?.events || []).filter((e) => e.type === 'hit');
    const top = Math.max(0, ...planned.map((e) => e.at || 0));
    let last = top;
    planned.forEach((event, i) => {
        const hit = fx?.hits?.[i];
        const at = event.at || 0;
        if (Array.isArray(hit?.strikes) && hit.strikes.length) {
            hit.strikes.forEach((strike, k) => {
                const t = at + k * gap;
                if (!strikes.has(strike)) strikes.set(strike, { at: t, event, first: k === 0 });
                last = Math.max(last, t);
            });
        } else named.push({ target: event.target, at, used: false });
    });
    return { strikes, named, last, extra: last - top };
}

// 多段攻击的弹道目标：按落下先后列出每一段打到（掉血或全挡）的单位（出手者除外）与该段相对第一段的错开时长，最多 limit 道。
// 只有一段时返回空列表（面板按受击单位各一道、同时到达）。
export function volleyTargets(marks, landing, actorId = '', limit = 6) {
    const strikes = landing?.strikes;
    if (!strikes || strikes.size < 2) return [];
    const base = Math.min(...[...strikes.values()].map((w) => w.at));
    const out = [];
    for (const { unitId, marks: list } of marks || []) {
        if (unitId === actorId) continue;
        for (const m of list || []) {
            if (!m.strike || (m.kind !== 'damage' && m.kind !== 'guard' && m.kind !== 'overkill')) continue;
            const wave = strikes.get(m.strike);
            if (wave && !out.some((o) => o.unitId === unitId && o.strike === m.strike)) out.push({ unitId, strike: m.strike, delay: wave.at - base });
        }
    }
    return out.sort((a, b) => a.delay - b.delay || a.strike - b.strike).slice(0, limit);
}

// 技能特写：我方的人物技能（hero-skill）与队友技能（skill）按出手顺序各取一次，最多 limit 个；敌方技能不播特写。
export function combatCutins(events, state, limit = 2) {
    const units = state?.units || {};
    const out = [];
    for (const e of events || []) {
        if (out.length >= limit) break;
        // 觉醒：单独一类特写（全屏 + 台词 + 情绪特效），不与同一单位的技能特写去重。
        if (e.type === 'awaken') {
            const u = units[e.unitId];
            if (u?.name) out.push({ unitId: e.unitId, name: u.name, skill: AWAKEN_TYPE_NAMES[e.awakenType] || '', kind: 'awaken', awakenType: e.awakenType, line: e.line || '' });
            continue;
        }
        if (e.type !== 'hero-skill' && e.type !== 'skill') continue;
        const u = units[e.unitId];
        if (u?.side !== 'ally' || !u.name || out.some((c) => c.unitId === e.unitId)) continue;
        out.push({ unitId: e.unitId, name: u.name, skill: e.name || '' });
    }
    return out;
}


// 打击感：引擎事件 → 各单位依次受到的变化（掉血 / 全挡 / 治疗 / 获得格挡 / 击倒），按首次出现的顺序分组。
// 只取事件里已有的数值，不另算规则；面板在命中落下时据此更新血条、飘字与受击反馈。
// 攻击伤害带段号时变化也带 strike；击倒取该单位上一次伤害的段号（中毒等没有段号的伤害致死则不带）。
export function combatHitMarks(events) {
    const groups = new Map();
    const lastStrike = new Map();
    const add = (id, mark, strike = 0) => {
        if (!id) return;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(strike ? { ...mark, strike } : mark);
    };
    for (const e of events || []) {
        if (e.type === 'damage') {
            lastStrike.set(e.target, e.strike || 0);
            // 鞭尸 / 超杀：不改血量，只出飘字与受击反馈。
            if (e.overkill) add(e.target, { kind: 'overkill', amount: e.amount }, e.strike);
            else if (e.hpLoss > 0) add(e.target, { kind: 'damage', amount: e.hpLoss }, e.strike);
            else if (e.blocked > 0) add(e.target, { kind: 'guard', amount: e.blocked }, e.strike);
        } else if (e.type === 'heal' && e.amount > 0) add(e.target, { kind: 'heal', amount: e.amount });
        else if (e.type === 'block' && e.amount > 0) add(e.target, { kind: 'block', amount: e.amount });
        else if (e.type === 'defeated') add(e.unitId, { kind: 'ko' }, lastStrike.get(e.unitId));
    }
    return [...groups].map(([unitId, marks]) => ({ unitId, marks }));
}
