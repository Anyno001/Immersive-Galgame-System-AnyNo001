// 日常挑战适配层：数值侧快照 → 引擎 setup，引擎结局 → 挑战结局。纯函数，不读写存储。
// 支持：
// 1. 领域固定牌库 + 首次挑战时按本领域专属池拼合并套用 LLM 世界观起名；
// 2. 专精属性（领域技能值）实时加减值（domainScaling：50 分基准 1.00×，范围 0.70×~1.50×）；
// 3. 敌人按与战斗模式一致的 enemyPool（原版 + 程序缝合项）物化并校准到日常挑战血量/伤害档位。
import { COMBAT_RULES, combatSpeedFor, enemySpeedFor, scaleEnemyStats } from './rules.js';
import { skillFromTemplate } from './card-templates.js';
import { enemyArtKeyFor } from './enemy-art.js';
import { KIN_FIELDS } from './kin.js';
import { enemyPool, fallbackChoice, materializeChoice } from './enemies/pool.js';
import {
    DOMAIN_CARDS,
    buildChallengeDeck,
    buildFixedChallengeDeck,
    createDomainScaling,
    initialDailyDeckSnapshot,
    normalizeChallengeDomain,
} from './challenge-cards.js';
import { CHALLENGE_FOES, pickFoe } from './challenge-foes.js';
import { buildChallengeAllies, validateChallengeAllies } from './challenge-allies.js';

export const CHALLENGE_HERO_ID = 'hero';
export const CHALLENGE_FOE_ID = 'foe';

// 难度档 → 引擎档位、难关校准倍率与回合数（4–6）；采用方案 B 偏硬核挑战曲线，略高于普通战斗但保持可攻略。
// 新建的日常挑战与亲密对决都不写回合数、不设回合上限，只按胜负结算（D16）；回合数只留给带 rounds 的旧记录判定。
export const CHALLENGE_TIER_RULES = Object.freeze({
    轻松: Object.freeze({ engineTier: 'normal', rounds: 4, hp: 0.9, damage: 0.75 }),
    普通: Object.freeze({ engineTier: 'elite', rounds: 5, hp: 0.82, damage: 0.88 }),
    艰难: Object.freeze({ engineTier: 'boss', rounds: 6, hp: 0.55, damage: 0.95 }),
});

// 意志：基础值按体力、压力各降一档；阈值与 stat-bars.js 的 STAMINA_LOW / STRESS_HIGH 一致。
export const CHALLENGE_WILL = Object.freeze({ base: 60, step: 12, staminaLow: 30, stressHigh: 70 });
// 带回合上限的旧记录（旧挑战、旧亲密对决）到时，进攻进度达到此比例判成功。
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
export function resolveChallengeDomain(domain, skills) {
    if (domain) return domain;
    let best = null;
    for (const name of Object.keys(DOMAIN_CARDS)) {
        const value = Number(skills?.[name]?.value);
        if (Number.isFinite(value) && (!best || value > best.value)) best = { name, value };
    }
    return best ? best.name : '';
}

function buildChallengeEnemyUnit({ enemyProfile, tier, foeKey, foe, foeName, counterpart, seed = '' }) {
    const rule = CHALLENGE_TIER_RULES[tier] || CHALLENGE_TIER_RULES.普通;
    const thick = foeThickness(tier);
    const displayName = counterpart || foeName || foe.name;
    let profile = enemyProfile || null;
    if (!profile && seed) {
        const pool = enemyPool({ tier: rule.engineTier, seed });
        const picked = fallbackChoice(pool, seed);
        if (picked) profile = materializeChoice(picked, { id: `${foeKey}-${tier}`, name: displayName });
    }
    if (profile && Array.isArray(profile.skills) && profile.skills.length) {
        const scaled = scaleEnemyStats(profile, 1, 'normal');
        const maxHp = Math.max(1, Math.min(9999, Math.round(scaled.hp * rule.hp)));
        const damageScale = Math.min(5, Math.max(0.05, Math.round(scaled.damageScale * rule.damage * 100) / 100));
        const speed = enemySpeedFor(profile.base?.speed ?? combatSpeedFor({ tier: thick.engineTier, id: foeKey }));
        const kinFields = Object.fromEntries(KIN_FIELDS.filter((key) => profile[key] !== undefined).map((key) => [key, profile[key]]));
        if (kinFields.kin) {
            kinFields.kinScale = Math.max(0.1, Math.min(5, Math.round((profile.kinScale ?? 1) * rule.hp * 100) / 100));
        }
        return {
            id: CHALLENGE_FOE_ID,
            name: displayName,
            side: 'enemy',
            kind: 'skill',
            maxHp,
            damageScale,
            speed,
            skills: profile.skills,
            passives: profile.passives || [],
            phases: profile.phases || [],
            ...(profile.template ? { template: profile.template } : {}),
            ...(profile.script ? { script: profile.script } : {}),
            ...kinFields,
            art: enemyArtKeyFor({ art: profile.art, name: displayName, tier: rule.engineTier }),
            ...(rule.engineTier === 'elite' || rule.engineTier === 'boss' ? { tier: rule.engineTier } : {}),
        };
    }
    return {
        id: CHALLENGE_FOE_ID,
        name: displayName,
        side: 'enemy',
        kind: 'skill',
        maxHp: thick.hp,
        damageScale: thick.damageScale,
        speed: enemySpeedFor(combatSpeedFor({ tier: thick.engineTier, id: foeKey })),
        skills: foe.skills.map(([name, template], index) => ({ id: `${foeKey}-s${index + 1}`, name, ...skillFromTemplate(template, thick.damageCap) })),
    };
}

// state 为数值侧传入的主角快照 { bars: { stamina, stress }, skills: { 技能名: { value } }, present?: 在场人物名, favors?: { 人物名: 好感 } }，user 为 { name }。
// start.foe / start.foeName 来自副模型选难关（键不在登记表时忽略）；allies 为请求的协助者名，按在场与好感校验后最多取两名。
// fixedDeck 为该领域在首次挑战完成后固定的持久化牌组视图；传入时沿用固定牌组，未传入时按当前技能值与专属池生成并附 initialDeck 供首次完成后固定。
// enemyProfile 为从 enemyPool 挑选并物化好的敌人档案（原版或程序缝合项）；cardNames 为准备期 LLM 按模板起好的初始牌名称与来历。
export function buildChallengeSetup({
    start, state, user, allies = start?.allies, fixedDeck = null,
    enemyProfile = null, deckSeed = '', enemySeed = '', cardNames = null,
} = {}) {
    if (!start?.event) return { ok: false, reason: 'challenge-start-missing' };
    const domain = resolveChallengeDomain(start.domain, state?.skills);
    const domainKey = normalizeChallengeDomain(domain);
    const rawSkill = state?.skills?.[domain]?.value ?? state?.skills?.[domainKey]?.value;
    const skillValue = Number.isFinite(Number(rawSkill)) ? Number(rawSkill) : 50;
    const domainScaling = createDomainScaling(domainKey, skillValue);
    const tier = Object.hasOwn(CHALLENGE_TIER_RULES, start.tier) ? start.tier : '普通';
    const foeKey = Object.hasOwn(CHALLENGE_FOES, start.foe) ? start.foe : pickFoe(start.event, domain);
    const foe = CHALLENGE_FOES[foeKey];
    const hasFixed = Boolean(fixedDeck && Array.isArray(fixedDeck.deckEntries) && fixedDeck.deckEntries.length);
    const builtDeck = hasFixed
        ? buildFixedChallengeDeck({ ...fixedDeck, domain: domainKey })
        : buildChallengeDeck({ domain, skillValue, otherSkills: state?.skills, seed: deckSeed, cardNames });
    const initialDeck = hasFixed ? null : initialDailyDeckSnapshot(builtDeck);
    const deck = [...builtDeck.deck];
    const catalog = { ...builtDeck.catalog };
    const helpers = validateChallengeAllies(allies, { present: state?.present, favors: state?.favors, exclude: start.counterpart ? [start.counterpart] : [] });
    const extra = buildChallengeAllies(helpers.accepted);
    for (const card of extra.cards) {
        catalog[card.id] = card;
        deck.push(card.id);
    }
    const will = willFor(state?.bars);
    const foeUnit = buildChallengeEnemyUnit({
        enemyProfile, tier, foeKey, foe,
        foeName: start.foeName, counterpart: start.counterpart, seed: enemySeed,
    });
    const setup = {
        controlledId: CHALLENGE_HERO_ID,
        canEscape: start.allowEscape !== false,
        units: [
            {
                id: CHALLENGE_HERO_ID, name: user?.name || '我', side: 'ally', kind: 'deck',
                maxHp: will, speed: COMBAT_RULES.defaultSpeed, deck, catalog, domainScaling,
            },
            ...extra.units,
            foeUnit,
        ],
        challenge: {
            event: start.event, domain, tier, stake: start.stake || '压力', foe: foeKey,
            counterpart: start.counterpart || '', allies: helpers.accepted.map((ally) => ally.name),
            skillValue: domainScaling.skillValue, domainMultiplier: domainScaling.multiplier,
            ...(foeUnit.template ? { enemyTemplate: foeUnit.template } : {}),
        },
    };
    return { ok: true, setup, allies: helpers, initialDeck };
}

export function challengeProgress(state) {
    const foe = state?.units?.[CHALLENGE_FOE_ID];
    const hero = state?.units?.[CHALLENGE_HERO_ID];
    if (!foe || !hero) return null;
    return { progress: 1 - foe.hp / foe.maxHp, willRatio: hero.hp / hero.maxHp };
}

// 引擎结局到挑战结局；没有分出胜负时，rounds 为正整数（旧挑战、旧亲密对决记录）且达到回合上限按进展比例判定（byLimit），否则返回 null 继续打。
// 新建的日常挑战与亲密对决不写 rounds，只按引擎胜负结算。
export function challengeResultOf(state, rounds) {
    const progress = challengeProgress(state);
    if (!progress) return null;
    const mapped = { victory: 'win', defeat: 'lose', escape: 'escape' }[state.outcome];
    if (mapped) return { result: mapped, byLimit: false, ...progress };
    if (Number.isInteger(rounds) && rounds > 0 && state.turn > rounds) return { result: progress.progress >= CHALLENGE_PROGRESS_WIN ? 'win' : 'lose', byLimit: true, ...progress };
    return null;
}

// 圆满 / 勉强 / 失败 / 放弃；达到回合上限的成功最多算勉强。
export function challengeOutcomeOf(result, willRatio, { byLimit = false } = {}) {
    if (result === 'escape') return '放弃';
    if (result !== 'win') return '失败';
    return !byLimit && Number(willRatio) >= CHALLENGE_WILL_FULL ? '圆满' : '勉强';
}
