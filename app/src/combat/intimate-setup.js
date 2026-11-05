import { COMBAT_RULES, combatSpeedFor } from './rules.js';
import { createBattle, applyAction } from './engine.js';
import { CHALLENGE_FOE_ID, CHALLENGE_HERO_ID, foeThickness, willFor } from './challenge-setup.js';
import { buildIntimateDeck } from './intimate-cards.js';
import { INTIMATE_FOE_ID, INTIMATE_INTERRUPT_SKILL, buildIntimateFoeSkills } from './intimate-foes.js';
import { INTIMATE_INTERRUPT_CARD } from './intimate-cards.js';
import { INTIMATE_TENSION_START } from '../scene/intimate-duel.js';

export function buildIntimateSetup({ start, state, user, position = 'receive', persona = '' } = {}) {
    if (!start?.event || start.intimate !== true) return { ok: false, reason: 'challenge-start-missing' };
    const mechanic = start.mechanic === '主导' ? '主导' : '合拍';
    const partner = start.counterpart || '';
    const favor = Number(state?.favors?.[partner]) || 0;
    const trust = Number(state?.trusts?.[partner]);
    const grudge = Number(state?.grudges?.[partner]) || 0;
    const profile = state?.intimate?.[partner] || {};
    const tension = Number.isFinite(Number(profile.tension)) ? Math.max(0, Number(profile.tension)) : INTIMATE_TENSION_START;
    const mark = profile.mark || null;
    const tier = Object.hasOwn({ 轻松: 1, 普通: 1, 艰难: 1 }, start.tier) ? start.tier : '普通';
    const thick = foeThickness(tier);
    const { deck, catalog } = buildIntimateDeck({ mechanic, position, skills: state?.skills, favor, trust: Number.isFinite(trust) ? trust : 50, grudge, mark });
    const foeSkills = buildIntimateFoeSkills({ mechanic, damageCap: thick.damageCap, tension, mark, persona });
    const setup = {
        controlledId: CHALLENGE_HERO_ID,
        canEscape: start.allowEscape !== false,
        units: [
            { id: CHALLENGE_HERO_ID, name: user?.name || '我', side: 'ally', kind: 'deck', maxHp: willFor(state?.bars), speed: COMBAT_RULES.defaultSpeed, deck, catalog },
            {
                id: CHALLENGE_FOE_ID, name: partner || '对方', side: 'enemy', kind: 'skill', maxHp: thick.hp, damageScale: thick.damageScale,
                speed: combatSpeedFor({ tier: thick.engineTier, id: 'intimate' }), skills: foeSkills,
            },
        ],
        challenge: {
            event: start.event, domain: start.domain, tier, stake: '压力', foe: '', rounds: thick.rounds, counterpart: partner, allies: [],
            intimate: { mechanic, position, eventKey: start.eventKey ?? null, tension, mark },
        },
    };
    return { ok: true, setup, allies: { accepted: [], rejected: [] } };
}

export const initIntimateTrace = () => ({
    swaps: 0, rapport: 0, interruptPending: false, interruptHit: false, surrendered: false, bothZero: false, lead: null, turn: 1, foeLoss: 0, heroLoss: 0,
});

const ratioOf = (unit) => (unit && unit.maxHp ? Math.max(0, unit.hp) / unit.maxHp : 0);

export function foldIntimateTrace(trace, state, events = []) {
    const next = { ...trace };
    for (const event of events) {
        if (event.type === 'intent') next.interruptPending = event.skillId === INTIMATE_INTERRUPT_SKILL;
        else if (event.type === 'card' && event.cardId === INTIMATE_INTERRUPT_CARD) next.interruptPending = false;
        else if (event.type === 'skill' && event.skillId === INTIMATE_INTERRUPT_SKILL && next.interruptPending) {
            next.interruptHit = true;
            next.interruptPending = false;
        } else if (event.type === 'damage') {
            if (event.target === INTIMATE_FOE_ID) next.foeLoss += Number(event.hpLoss) || 0;
            else if (event.target === CHALLENGE_HERO_ID) next.heroLoss += Number(event.hpLoss) || 0;
        }
    }
    const hero = state?.units?.[CHALLENGE_HERO_ID];
    const foe = state?.units?.[CHALLENGE_FOE_ID];
    if (state && state.turn !== next.turn) {
        if (next.foeLoss > 0 && next.heroLoss === 0) next.rapport += 1;
        const heroRatio = ratioOf(hero);
        const foeRatio = ratioOf(foe);
        if (heroRatio !== foeRatio) {
            const heroLeads = heroRatio > foeRatio;
            if (next.lead !== null && next.lead !== heroLeads) next.swaps += 1;
            next.lead = heroLeads;
        }
        next.turn = state.turn;
        next.foeLoss = 0;
        next.heroLoss = 0;
    }
    if (hero && foe && hero.hp <= 0 && foe.hp <= 0) next.bothZero = true;
    return next;
}

export function replayIntimateTrace(setup, seed, actions = [], surrendered = false) {
    const created = createBattle(setup, seed);
    if (!created.ok) return initIntimateTrace();
    let state = created.state;
    let trace = foldIntimateTrace(initIntimateTrace(), state, created.events);
    for (const action of actions) {
        const applied = applyAction(state, action);
        if (!applied.ok) break;
        state = applied.state;
        trace = foldIntimateTrace(trace, state, applied.events);
    }
    return surrendered ? { ...trace, surrendered: true } : trace;
}
