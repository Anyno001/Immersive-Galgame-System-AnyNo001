// 日常挑战适配层：数值侧快照 → 引擎 setup，引擎结局 → 挑战结局。纯函数，不读写存储；引擎本身不改。
import { COMBAT_RULES, combatSpeedFor, scaleEnemyStats } from './rules.js';
import { skillFromTemplate } from './card-templates.js';
import { DOMAIN_CARDS, buildChallengeDeck } from './challenge-cards.js';
import { CHALLENGE_FOES, pickFoe } from './challenge-foes.js';
import { buildChallengeAllies, validateChallengeAllies } from './challenge-allies.js';

export const CHALLENGE_HERO_ID = 'hero';
export const CHALLENGE_FOE_ID = 'foe';

// 难度档 → 引擎档位、回合上限（一局 4–6 回合）与难关校准倍率；倍率按托管策略模拟取值，真人试玩后再调。
export const CHALLENGE_TIER_RULES = Object.freeze({
    轻松: Object.freeze({ engineTier: 'normal', rounds: 4, hp: 0.4, damage: 0.45 }),
    普通: Object.freeze({ engineTier: 'elite', rounds: 5, hp: 0.4, damage: 0.6 }),
    艰难: Object.freeze({ engineTier: 'boss', rounds: 6, hp: 0.45, damage: 0.85 }),
});

// 意志：基础值按体力、压力各降一档；阈值与 stat-bars.js 的 STAMINA_LOW / STRESS_HIGH 一致。
export const CHALLENGE_WILL = Object.freeze({ base: 60, step: 12, staminaLow: 30, stressHigh: 70 });
// 回合上限到时，进攻进度达到此比例判成功。
export const CHALLENGE_PROGRESS_WIN = 0.5;
// 成功时剩余意志不低于此比例为圆满。
export const CHALLENGE_WILL_FULL = 0.6;

export const challengeCombatIdFor = (anchor) => ['ch', anchor.messageId, anchor.swipeId, anchor.tagHash, anchor.occurrence].join('|');

export function willFor(bars) {
    const { base, step, staminaLow, stressHigh } = CHALLENGE_WILL;
    const lowStamina = Number(bars?.stamina) < staminaLow;
    const highStress = Number(bars?.stress) > stressHigh;
    return base - step * ((lowStamina ? 1 : 0) + (highStress ? 1 : 0));
}

export function foeThickness(tier) {
    const rule = CHALLENGE_TIER_RULES[tier] || CHALLENGE_TIER_RULES.普通;
    const scaled = scaleEnemyStats({ tier: rule.engineTier, base: { hp: COMBAT_RULES.tiers[rule.engineTier].hp } }, 1, 'normal');
    return {
        hp: Math.max(1, Math.round(scaled.hp * rule.hp)), damageScale: Math.round(scaled.damageScale * rule.damage * 100) / 100,
        engineTier: rule.engineTier, rounds: rule.rounds, damageCap: COMBAT_RULES.tiers[rule.engineTier].damageCap,
    };
}

// 领域留空或没有牌组时，取主角技能里最高的有牌组领域（同值按登记顺序）。
function resolveDomain(domain, skills) {
    if (domain) return domain;
    let best = null;
    for (const name of Object.keys(DOMAIN_CARDS)) {
        const value = Number(skills?.[name]?.value);
        if (Number.isFinite(value) && (!best || value > best.value)) best = { name, value };
    }
    return best ? best.name : '';
}

// state 为数值侧传入的主角快照 { bars: { stamina, stress }, skills: { 技能名: { value } }, present?: 在场人物名, favors?: { 人物名: 好感 } }，user 为 { name }。
// start.foe / start.foeName 来自副模型选难关（键不在登记表时忽略）；allies 为请求的协助者名，按在场与好感校验后最多取两名。
export function buildChallengeSetup({ start, state, user, allies = start?.allies } = {}) {
    if (!start?.event) return { ok: false, reason: 'challenge-start-missing' };
    const domain = resolveDomain(start.domain, state?.skills);
    const skillValue = Number(state?.skills?.[domain]?.value) || 0;
    const tier = Object.hasOwn(CHALLENGE_TIER_RULES, start.tier) ? start.tier : '普通';
    const foeKey = Object.hasOwn(CHALLENGE_FOES, start.foe) ? start.foe : pickFoe(start.event, domain);
    const foe = CHALLENGE_FOES[foeKey];
    const thick = foeThickness(tier);
    const { deck, catalog } = buildChallengeDeck({ domain, skillValue, otherSkills: state?.skills });
    const helpers = validateChallengeAllies(allies, { present: state?.present, favors: state?.favors, exclude: start.counterpart ? [start.counterpart] : [] });
    const extra = buildChallengeAllies(helpers.accepted);
    for (const card of extra.cards) {
        catalog[card.id] = card;
        deck.push(card.id);
    }
    const will = willFor(state?.bars);
    const setup = {
        controlledId: CHALLENGE_HERO_ID,
        canEscape: start.allowEscape !== false,
        units: [
            { id: CHALLENGE_HERO_ID, name: user?.name || '我', side: 'ally', kind: 'deck', maxHp: will, speed: COMBAT_RULES.defaultSpeed, deck, catalog },
            ...extra.units,
            {
                id: CHALLENGE_FOE_ID, name: start.counterpart || start.foeName || foe.name, side: 'enemy', kind: 'skill', maxHp: thick.hp, damageScale: thick.damageScale,
                speed: combatSpeedFor({ tier: thick.engineTier, id: foeKey }),
                skills: foe.skills.map(([name, template], index) => ({ id: `${foeKey}-s${index + 1}`, name, ...skillFromTemplate(template, thick.damageCap) })),
            },
        ],
        challenge: { event: start.event, domain, tier, stake: start.stake || '压力', foe: foeKey, rounds: thick.rounds, counterpart: start.counterpart || '', allies: helpers.accepted.map((ally) => ally.name) },
    };
    return { ok: true, setup, allies: helpers };
}

export function challengeProgress(state) {
    const foe = state?.units?.[CHALLENGE_FOE_ID];
    const hero = state?.units?.[CHALLENGE_HERO_ID];
    if (!foe || !hero) return null;
    return { progress: 1 - foe.hp / foe.maxHp, willRatio: hero.hp / hero.maxHp };
}

// 引擎结局到挑战结局；没有分出胜负时，达到回合上限按进展比例判定（byLimit），否则返回 null 继续打。
export function challengeResultOf(state, rounds) {
    const progress = challengeProgress(state);
    if (!progress) return null;
    const mapped = { victory: 'win', defeat: 'lose', escape: 'escape' }[state.outcome];
    if (mapped) return { result: mapped, byLimit: false, ...progress };
    if (state.turn > rounds) return { result: progress.progress >= CHALLENGE_PROGRESS_WIN ? 'win' : 'lose', byLimit: true, ...progress };
    return null;
}

// 圆满 / 勉强 / 失败 / 放弃；达到回合上限的成功最多算勉强。
export function challengeOutcomeOf(result, willRatio, { byLimit = false } = {}) {
    if (result === 'escape') return '放弃';
    if (result !== 'win') return '失败';
    return !byLimit && Number(willRatio) >= CHALLENGE_WILL_FULL ? '圆满' : '勉强';
}
