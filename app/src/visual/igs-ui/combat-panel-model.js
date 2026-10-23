import { canAfford, cardView, describeIntent, effectsNeedTarget } from '../../combat/battle-state.js';
import { COMBAT_RULES } from '../../combat/rules.js';
import { hash32 } from '../../combat/random.js';
import { injuryLevel } from '../../combat/report.js';
import { CARD_TYPE_LABELS, cardArtSvg, describeEffects } from './combat-card-art.js';

// 战斗面板的纯视图模型：会话快照 → 战前 / 对局 / 结算所需字段；不操作 DOM。
// 是否可出牌只以引擎 legalActions 为准，界面不另算规则。
export const COMBAT_STATUS_NAMES = Object.freeze({ vulnerable: '易伤', weak: '虚弱', strength: '力量', dexterity: '敏捷', poison: '中毒', regen: '再生', thorns: '荆棘' });
export const COMBAT_INTENT_LABELS = Object.freeze({ attack: '攻击', defend: '防御', buff: '强化', debuff: '削弱', heal: '治疗', special: '特殊' });
export const COMBAT_OUTCOME_LABELS = Object.freeze({ victory: '胜利', defeat: '败北', escape: '撤退' });
export const COMBAT_REWARD_CARD_COUNT = 3;
const FX_HIT_LIMIT = 6;

const statusList = (statuses) => Object.entries(statuses || {}).filter(([, v]) => v > 0)
    .map(([key, stacks]) => ({ key, label: COMBAT_STATUS_NAMES[key] || key, stacks }));

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
        return {
            inst, id: card.id, name: card.name, type: card.type, cost: card.cost, upgraded: card.upgraded,
            typeLabel: CARD_TYPE_LABELS[card.type] || '', text: describeEffects(card.effects), art: cardArtSvg(card),
            affordable: canAfford(card, hero.energy), needsTarget: effectsNeedTarget(card.effects),
            targets: mine.map((a) => a.targetId).filter((t) => t !== undefined), playable: mine.length > 0,
        };
    }).filter(Boolean);
    const side = (s) => state.order.filter((id) => state.units[id].side === s).map((id) => unitView(state, id));
    return {
        turn: state.turn, phase: state.phase, outcome: state.outcome, energy: hero.energy, energyPerTurn: hero.energyPerTurn,
        piles: { draw: pile.draw.length, discard: pile.discard.length, exhaust: pile.exhaust.length },
        hand, allies: side('ally'), enemies: side('enemy'),
        canEndTurn: legal.some((a) => a.type === 'end-turn'), canEscape: legal.some((a) => a.type === 'escape'),
    };
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
    const enemies = (session.start?.enemies || []).map(({ name, count }) => ({ name, count, templated: lobby.templated.includes(name) }));
    return { encounter: session.start?.encounter || '', tier: session.start?.tier || 'normal', heroId: lobby.heroId, allies, enemies, absent: [...lobby.absent], skipped: [...(session.skipped || [])] };
}

export function endView(state) {
    if (!state?.outcome) return null;
    const allies = state.order.filter((id) => state.units[id].side === 'ally').map((id) => ({ name: state.units[id].name, injury: injuryLevel(state.units[id]) }));
    return { outcome: state.outcome, label: COMBAT_OUTCOME_LABELS[state.outcome] || state.outcome, turn: state.turn, allies };
}

// 升级三选一：新卡从图鉴里未满同名上限的非基础卡中按 seed 确定性抽 3 张；升级选有升级形态且还有未升级副本的卡；始终可跳过。
export function rewardChoices(view, level, seedKey = '') {
    if (!view || view.kind !== 'deck-character' || !view.pendingRewards?.includes(level)) return null;
    const pool = [...view.catalog.values()].filter((c) => c.rarity !== 'basic' && (view.owned.get(c.id) || 0) < COMBAT_RULES.copyLimit)
        .sort((a, b) => (a.id < b.id ? -1 : 1));
    const cards = [];
    let h = hash32(`${seedKey}|${view.id}|${level}`);
    while (pool.length && cards.length < COMBAT_REWARD_CARD_COUNT) {
        h = hash32(`${h}`);
        const [card] = pool.splice(h % pool.length, 1);
        cards.push({ cardId: card.id, name: card.name, type: card.type, cost: card.cost });
    }
    const upgrades = [...view.owned.entries()].filter(([id, n]) => n > (view.upgraded.get(id) || 0) && view.catalog.get(id)?.upgraded)
        .map(([id]) => ({ targetId: id, name: view.catalog.get(id).name }));
    return { level, cards, upgrades };
}

// 引擎事件 → fx-battle 的标签形状。每次出手取对各目标的结果，只保留最后几招，避免托管与敌方阶段的演出过长。
export function combatFxSource(events, state, { start = false, foe = '', title = '' } = {}) {
    const hits = [];
    let action = null;
    const units = state?.units || {};
    const push = (target, result) => {
        if (!action) return;
        const prev = hits.find((h) => h.owner === action && h.target === target);
        const rank = { ko: 3, hit: 2, guard: 1, heal: 0 };
        if (prev) { if (rank[result] > rank[prev.result]) prev.result = result; return; }
        hits.push({ owner: action, attacker: units[action.actor]?.name || '', target: units[target]?.name || '', skill: action.name, result });
    };
    for (const e of events || []) {
        if (e.type === 'card' || e.type === 'skill') action = { actor: e.unitId, name: e.name };
        else if (e.type === 'turn-start') action = null;
        else if (e.type === 'damage' && e.kind === 'attack') push(e.target, e.hpLoss > 0 ? 'hit' : 'guard');
        else if (e.type === 'defeated') push(e.unitId, 'ko');
        else if (e.type === 'heal' && e.amount > 0) push(e.target, 'heal');
    }
    const end = [...(events || [])].reverse().find((e) => e.type === 'battle-end');
    const battleEnd = end ? ({ victory: 'win', defeat: 'lose', escape: 'escape' })[end.outcome] || '' : '';
    return {
        battle: { foe, title }, battleStart: start === true, battleEnd,
        hits: hits.slice(-FX_HIT_LIMIT).map(({ owner, ...h }) => h),
        userName: units[state?.controlledId]?.name || '',
    };
}
