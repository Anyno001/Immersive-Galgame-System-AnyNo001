// 战斗会话：一场战斗从「定位战斗标签」到「回写战报」的状态机。
// 流程：prepare（备战，生成缺失档案）→ start（建战斗）→ act（出牌）→ finish（战报+翻牌奖励+发送）→ done。
// 会话记录整条存 localStorage（键 igs-combat:session:<chatId>），战报发件箱存 igs-combat:outbox:<chatId>；
// 键名与内容格式与 v0.39 完全一致，刷新页面后 resume 可按种子+动作序列重放出同一局。
// 写盘优化：会话记录每次出牌都整条重写，这里改为内存里始终保存最新值，实际 setItem 合并延后（默认 300ms）；
// 页面隐藏、卸载、会话结束、发件箱写入前立即落盘；读取时先看内存里尚未落盘的值。存储格式不变。
import { COMBAT_RULES, CURSE_CARD, SKILL_COUNT_MAX, combatSpeedFor, crowdScaleFor, difficultyRule, isCompatibleRulesVersion, scaleEnemyStats, skillTarget } from './rules.js';
import { applyAction, createBattle, legalActions, replayBattle, seedFor } from './engine.js';
import {
    deckProfileEntities, enemyEntities, enemyIdFor, generationWrites, rewardEntity, skillFillEntity, skillProfileEntity,
    templateEnemy, withCharacterLore, withStoryContext, withCombatInitialization, encounterThemeEntity, profileGearEntity,
} from './generation.js';
import { generateWithRetry } from './generation-retry.js';
import { attachLoot, attachPurge, buildCombatReport, COMBAT_SKIP_TEXT, hasLoot, injuryLevel, reportIdFor, reportIdOf } from './report.js';
import { BATTLE_GROWTH_TAG_HASH, BATTLE_POINTS_TAG_HASH, CHALLENGE_REWARD_TAG_HASH, CONSUME_TAG_HASH, PROTAGONIST_ALIASES, WOUND_TAG_HASH, attributeViewFor, abilitiesForName, grantGeneratedGear, purgeChance } from './ledger.js';
import { battlePoints, battleTierOf, weakBattlePoints } from './points.js';
import { heldOffCombat, winPointsBonus } from './relics/off-combat.js';
import { allyTierOf, applyAbilities, characterCombatStats, skillTierFor, vitalsOf } from './vitals.js';
import { ABILITY_KEYS, ABILITY_LABELS, wantsAutoInit } from './abilities.js';
import { scaleCatalog, scaleSkills } from './card-scaling.js';
import { ledgerEntryId, profileIdFor } from './schema.js';
import { cardUsesPool, fixedPoolsFor } from './fixed-cards/index.js';
import { defaultHeroSkill, itemEffectsForBattle, ultimateSkill } from './card-templates.js';
import { enemyArtKeyFor, isEnemyArtTheme } from './enemy-art.js';
import { enemyLoadout } from './enemy-loadout.js';
import { hash32 } from './random.js';
import { extractCombatStart } from '../scene/combat-directives.js';
import { parseChallengeStart } from '../scene/challenge-directives.js';
import { chooseAllyPlay } from './policy.js';
import { buildChallengeSetup, challengeCombatIdFor, challengeOutcomeOf, challengeResultOf } from './challenge-setup.js';
import { chooseChallengeFoe } from './challenge-foe-pick.js';
import { eligibleChallengeAllies } from './challenge-allies.js';
import { challengeHarvest } from './challenge-foes.js';
import { afterBattleMend } from './mechanics/sanctum.js';
import { baseMaxHp } from './mechanics/foe-seize.js';
import { planChallengeReward } from './challenge-reward.js';
import { buildChallengeReport, parseChallengeReport } from './challenge-report.js';
import { buildIntimateSetup, foldIntimateTrace, initIntimateTrace, replayIntimateTrace } from './intimate-setup.js';
import { INTIMATE_LEGACY_OUTCOME, intimateEnding, resolveIntimatePosition } from '../scene/intimate-duel.js';
import { chooseCard, emptyPick, flipCard, flipView, hasCardChoices, laterPick, lootOf, normalizePick, pickCardChoice, pickPurgeChoice, rerollPick } from './flip.js';
import { REROLL_COST } from './points.js';
import { keptInnateKinds, traitLinks, traitPassives } from './traits.js';
import { equippedGear } from './gear-slots.js';

export const SESSION_VERSION = 1;
export const sessionKeyFor = (chatId) => `igs-combat:session:${chatId}`;
export const outboxKeyFor = (chatId) => `igs-combat:outbox:${chatId}`;
// 同场多个同名敌人的编号后缀
const ENEMY_SUFFIXES = Object.freeze(['甲', '乙', '丙', '丁', '戊']);
// 会话记录写盘的合并间隔（毫秒）
const PERSIST_DELAY_MS = 300;

// 战斗标识：楼层 + 分支 + 标签哈希 + 同哈希出现序号
export const combatIdFor = (anchor) => ['cb', anchor.messageId, anchor.swipeId, anchor.tagHash, anchor.occurrence].join('|');
const messageText = (message) => String(message?.mes ?? message?.text ?? '');
const swipeIdOf = (message) => (Number.isInteger(message?.swipe_id) ? message.swipe_id : 0);
const sameAnchor = (a, b) => !!(a && b) && a.messageId === b.messageId && a.swipeId === b.swipeId && a.tagHash === b.tagHash && a.occurrence === b.occurrence;
// 选项值可以是函数（每次取最新）
const resolveOption = (value) => (typeof value === 'function' ? value() : value);

// 定位某楼里的战斗起点：该楼必须是非用户楼且含战斗标签；kinds.challenge 为真时，没有战斗标签再认日常挑战标签，kinds.combat 为假则不认战斗标签。
export function locateCombatStart(chat, messageId, sourceFilter, kinds = {}) {
    const message = Array.isArray(chat) ? chat[messageId] : null;
    if (!message || typeof message !== 'object' || message.is_user === true) return { ok: false, reason: 'combat-floor-missing' };
    const text = messageText(message);
    const { start } = kinds.combat === false ? { start: null } : extractCombatStart(text, { sourceFilter });
    if (start) {
        const anchor = { messageId, swipeId: swipeIdOf(message), tagHash: start.tagHash, occurrence: start.occurrence };
        return { ok: true, start, anchor, combatId: combatIdFor(anchor) };
    }
    const intimateOptions = typeof kinds.intimate === 'function' ? kinds.intimate(messageId) : null;
    let challenge = kinds.challenge === true || intimateOptions ? parseChallengeStart(text, { sourceFilter, intimate: intimateOptions || undefined }).start : null;
    if (challenge && challenge.intimate !== true && kinds.challenge !== true) challenge = null;
    if (!challenge && intimateOptions && intimateOptions.launch === true) {
        challenge = { event: '亲密', domain: '亲密', intimate: true, mechanic: intimateOptions.mechanic, eventKey: intimateOptions.eventKey, counterpart: intimateOptions.partner || '', tier: '普通', stake: '压力', tagHash: 'launch', occurrence: 0, launch: true };
    }
    if (!challenge) return { ok: false, reason: 'combat-start-missing' };
    const anchor = { messageId, swipeId: swipeIdOf(message), tagHash: challenge.tagHash, occurrence: challenge.occurrence };
    return { ok: true, challenge: true, start: challenge, anchor, combatId: challengeCombatIdFor(anchor) };
}

// 战报块里的标识：战斗战报与日常挑战战报都认。
const anyReportIdOf = (text) => reportIdOf(text) ?? parseChallengeReport(text)?.reportId ?? null;
const CHALLENGE_TIERS = Object.freeze(['轻松', '普通', '艰难']);
const AUTO_STEP_LIMIT = 400;

// 代价轻重设置（light / normal / heavy）：结算按难度档查表，轻与重各让代价所用的难度档低一档或高一档；难关厚度不变。
export function challengeCostTier(tier, stake) {
    const index = Math.max(0, CHALLENGE_TIERS.indexOf(tier));
    const shift = stake === 'light' ? -1 : stake === 'heavy' ? 1 : 0;
    return CHALLENGE_TIERS[Math.min(CHALLENGE_TIERS.length - 1, Math.max(0, index + shift))];
}

// 回合上限到时引擎仍无结局：在适配层补一个胜负，状态与事件都按引擎结束的形态补齐。
function challengeEnd(state, setup, events = [], trace = null) {
    let result = challengeResultOf(state, setup?.challenge?.rounds);
    const intimate = setup?.challenge?.intimate;
    if (result && intimate) result = { ...result, trace, ending: intimateEnding({ mechanic: intimate.mechanic, result: result.result, heroRatio: result.willRatio, trace: trace || {} }) };
    if (!result || state.outcome) return { state, events, result };
    const outcome = result.result === 'win' ? 'victory' : 'defeat';
    return { state: { ...state, outcome, phase: 'ended' }, events: [...events, { type: 'battle-end', outcome }], result };
}

// 在战斗楼之后找带有该战报标识的用户楼，找不到返回 -1
export function findReportFloor(chat, afterIndex, reportId) {
    const floors = Array.isArray(chat) ? chat : [];
    for (let index = afterIndex + 1; index < floors.length; index += 1) {
        if (floors[index]?.is_user === true && anyReportIdOf(messageText(floors[index])) === reportId) return index;
    }
    return -1;
}

// 直接读 storage 里的 JSON（不看内存里未落盘的值）
function readStorageJson(storage, key) {
    let raw;
    try {
        raw = storage?.getItem(key);
    } catch {
        return { ok: false, reason: 'combat-session-storage-unavailable' };
    }
    if (raw == null) return { ok: true, value: null };
    try {
        return { ok: true, value: JSON.parse(raw) };
    } catch {
        return { ok: false, reason: 'combat-session-corrupt' };
    }
}

// 按名字或别名找账本里的角色
function findCharacter(ledgerState, name) {
    for (const character of ledgerState.characters.values()) {
        if (character.name === name || (character.profile.aliases || []).includes(name)) return character;
    }
    return null;
}

const averageLevel = (characters) => (characters.length ? Math.max(1, Math.round(characters.reduce((sum, character) => sum + character.level, 0) / characters.length)) : 1);
const gearPassives = (character) => equippedGear(character.gear?.slots).map((gear) => gear.passive).filter(Boolean);

// 单位的特质清单：先天主动/被动 + 后天特质
function traitEntries(character, heroSkill, keptKinds) {
    const entries = [];
    if (heroSkill && keptKinds.includes('active')) entries.push({ id: heroSkill.id, kind: 'active', innate: true, name: heroSkill.name });
    const personal = character.profile.personalPassive;
    if (personal && keptKinds.includes('passive')) entries.push({ id: personal.id, kind: 'passive', innate: true, name: personal.name, passiveId: personal.id });
    for (const trait of Array.isArray(character.traits) ? character.traits : []) {
        const base = { id: trait.traitId, name: trait.name, rarity: trait.rarity, ...(trait.origin ? { origin: trait.origin } : {}) };
        if (trait.kind === 'active' && trait.skill) entries.push({ ...base, kind: 'active', skill: trait.skill });
        else if (trait.passive) entries.push({ ...base, kind: 'passive', passiveId: trait.passive.id });
    }
    return entries;
}

// 给被动标注来源（职业/个人/装备/特质）
const tagSource = (source) => (passive) => (passive ? { ...passive, source } : null);
const clampRound = (value, min, max) => Math.min(max, Math.max(min, Math.round(value)));
const abilityFields = (attributes) => (attributes?.scores ? { level: attributes.level, abilities: { ...attributes.scores } } : {});

// 规则 v5 G24 / G25：账本里的永久成长叠加到开战目录（伤害、格挡效果，含升级版；单个效果封顶 99）。没有成长时目录原样返回。
const growEffects = (effects, bonus) => (Array.isArray(effects) ? effects.map((effect) => {
    if (effect?.op === 'damage' && bonus.damage) return { ...effect, amount: Math.min(99, effect.amount + bonus.damage) };
    if (effect?.op === 'block' && bonus.block) return { ...effect, amount: Math.min(99, effect.amount + bonus.block) };
    return effect;
}) : effects);
function withBattleGrowth(catalog, growth) {
    const cards = growth?.cards;
    if (!cards) return catalog;
    const out = { ...catalog };
    for (const [cardId, bonus] of Object.entries(cards)) {
        const card = out[cardId];
        if (!card) continue;
        out[cardId] = { ...card, effects: growEffects(card.effects, bonus), ...(card.upgraded?.effects ? { upgraded: { ...card.upgraded, effects: growEffects(card.upgraded.effects, bonus) } } : {}) };
    }
    return out;
}

// 牌组角色 -> 战斗单位
// 规则 v6：目录里有牌用到本职业 / 无色造牌池（random-card 的 pool）时，开战快照带 pools；否则不写字段，旧快照形状不变。
function deckUnit(character) {
    const kept = keptInnateKinds(character);
    const heroSkill = kept.includes('active') ? character.profile.heroSkill || defaultHeroSkill(character.classProfile?.archetype, character.id) : null;
    const stats = characterCombatStats(character);
    const catalogCards = character.catalog instanceof Map ? [...character.catalog.values()] : Object.values(character.catalog || {});
    const pools = catalogCards.some(cardUsesPool) ? fixedPoolsFor(character.classProfile?.archetype) : null;
    return {
        id: character.id, name: character.name, side: 'ally', kind: 'deck', maxHp: stats.hp,
        energy: character.profile.base.energy, draw: character.profile.base.draw, speed: stats.speed,
        deck: character.deckEntries.map((entry) => ({ ...entry })),
        catalog: withBattleGrowth(character.attributes?.scores ? scaleCatalog(character.catalog, character.attributes) : Object.fromEntries(character.catalog), character.battleGrowth),
        passives: [
            tagSource('class')(character.classProfile?.classPassive),
            tagSource('personal')(kept.includes('passive') ? character.profile.personalPassive : null),
            ...gearPassives(character).map(tagSource('gear')),
            ...traitPassives(character).map(tagSource('trait')),
        ].filter(Boolean),
        ...(heroSkill ? { heroSkill } : {}),
        ...(pools ? { pools } : {}),
        traits: traitEntries(character, heroSkill, kept),
        ...abilityFields(character.attributes),
    };
}

// 技能效果按倍率缩放（伤害/护盾上限 99，治疗上限 60）
function scaleEffect(effect, factor) {
    if (effect.op === 'conditional') return { ...effect, then: effect.then.map((inner) => scaleEffect(inner, factor)) };
    if (effect.op === 'damage' || effect.op === 'block') return { ...effect, amount: clampRound(effect.amount * factor, 1, 99) };
    if (effect.op === 'heal') return { ...effect, amount: clampRound(effect.amount * factor, 1, 60) };
    return effect;
}

// 技能型角色 -> 战斗单位（含按阶位追加的终极技）
function skillUnit(character) {
    const tier = skillTierFor(character);
    const scaled = scaleSkills(character.skills, character.attributes);
    const skills = tier.skill === 1 ? scaled : scaled.map((skill) => ({ ...skill, effects: skill.effects.map((effect) => scaleEffect(effect, tier.skill)) }));
    const ultimates = tier.ultimateCooldown > 0 ? [ownUltimate(character.id, skills, tier)] : [];
    const stats = characterCombatStats(character);
    return {
        id: character.id, name: character.name, side: 'ally', kind: 'skill', maxHp: stats.hp, speed: stats.speed,
        // 助战两动：每次轮到出手连续使用两次技能，行动间隔不变；只进新建 setup，旧战斗按已存 setup 重放。
        actions: 2,
        skills: [...skills, ...ultimates], passives: [...(character.passives || []), ...gearPassives(character)],
        ...abilityFields(character.attributes),
    };
}

// 技能的总伤害（各伤害效果 数值 × 段数）
const skillDamage = (skill) => (skill.effects || []).reduce((sum, effect) => sum + (effect.op === 'damage' ? (Number(effect.amount) || 0) * (Number(effect.hits) || 1) : 0), 0);

// 强度档绝招（v0.39.2）：取角色自己伤害最高的技能（已按六维与档位换算），同名、数值 ×1.5、带冷却；
// 没有技能时才回落通用绝招。只进新建 setup，旧战斗按已存 setup 重放。
function ownUltimate(id, skills, tier) {
    const base = skills.reduce((best, skill) => (!best || skillDamage(skill) > skillDamage(best) ? skill : best), null);
    if (!base) return ultimateSkill(Math.round(COMBAT_RULES.allySkillDamageCap * tier.skill), { id: `${id}-u1`, cooldown: tier.ultimateCooldown });
    return { ...base, id: `${id}-u1`, effects: base.effects.map((effect) => scaleEffect(effect, 1.5)), cooldown: tier.ultimateCooldown, ultimate: true };
}

export { allyTierOf, characterCombatStats, vitalsOf };

// 首领的狂暴阈值随难度调整（默认 50%）
function bossPhases(template, difficulty) {
    const enrageAt = difficultyRule(difficulty).enrageAt;
    if (template.tier !== 'boss' || enrageAt === 50 || !Array.isArray(template.phases)) return template.phases;
    return template.phases.map((phase) => (phase?.hpBelowPct === 50 ? { ...phase, hpBelowPct: enrageAt } : phase));
}

// 敌方单位：按名字取模板，缩放数值，同名多只加编号后缀
function enemyUnits(start, templates, partyLevel, difficulty, enemyAttributes = new Map(), crowd = 1) {
    const units = [];
    const tiers = [];
    for (const { name, count } of start.enemies) {
        const template = templates.get(name);
        const attributes = enemyAttributes.get(name) || null;
        const scaled = scaleEnemyStats(template, attributes?.level ?? partyLevel, difficulty, { gap: attributes ? attributes.level - partyLevel : 0 });
        const phases = bossPhases(template, difficulty);
        const loadout = enemyLoadout(template, attributes?.level ?? partyLevel, difficulty);
        const skills = loadout.skills.length ? [...template.skills, ...loadout.skills] : template.skills;
        const passives = loadout.passives.length ? [...(template.passives || []), ...loadout.passives] : template.passives;
        const vitals = applyAbilities(scaled.hp, template.base?.speed ?? combatSpeedFor({ tier: template.tier, id: template.id }), attributes);
        // 生成敌人档位校准：生成敌人再乘 generatedScale，模板敌人（generated:false）不乘；乘积为 1 时字段不变。
        const factor = crowd * (template.generated !== false ? (COMBAT_RULES.generatedScale[template.tier] ?? 1) : 1);
        const maxHp = factor < 1 ? Math.max(1, Math.round(vitals.hp * factor)) : vitals.hp;
        const damageScale = factor < 1 ? Math.min(5, Math.round(scaled.damageScale * factor * 100) / 100) : scaled.damageScale;
        for (let index = 0; index < count; index += 1) {
            units.push({
                id: count > 1 ? `${template.id}-${index + 1}` : template.id,
                name: count > 1 ? `${name}${ENEMY_SUFFIXES[index] || index + 1}` : name,
                side: 'enemy', kind: 'skill', maxHp, damageScale, speed: vitals.speed,
                skills: scaleSkills(skills, attributes), passives, phases,
                art: enemyArtKeyFor({ art: template.art, name, tier: template.tier }),
                ...(template.tier === 'elite' || template.tier === 'boss' ? { tier: template.tier } : {}),
                ...abilityFields(attributes),
            });
            tiers.push(template.tier);
        }
    }
    return { units, tiers };
}

// 备战前需要补建的档案：主角牌组（缺则建）、盟友技能档案、敌人档案
function neededProfiles(ledgerState, start, userName, { heroOnly = false } = {}) {
    const entities = [];
    if (!findCharacter(ledgerState, userName)) {
        entities.push(...deckProfileEntities({ name: userName, id: profileIdFor('deck-character', userName), role: 'protagonist', classes: ledgerState.classes }));
    }
    if (heroOnly) return entities;
    for (const ally of start.allies) {
        if (PROTAGONIST_ALIASES.includes(ally) || ally === userName || findCharacter(ledgerState, ally)) continue;
        entities.push(skillProfileEntity({ name: ally, role: 'ally' }));
    }
    entities.push(...enemyEntities({ enemies: start.enemies, tier: start.tier, existing: ledgerState.enemies, partyLevel: 1 }).entities);
    return entities;
}

// 技能数不足的盟友/敌人：补技能到该等级应有的数量（skillFilled 记录已排入的档案 id，避免重复）
function skillFillEntities(ledgerState, start, userName, filledIds) {
    const entities = [];
    const addFill = (profile, have, want, existingNames, level) => {
        const missing = Math.min(SKILL_COUNT_MAX, want) - have;
        if (missing <= 0 || filledIds.has(profile.id)) return;
        filledIds.add(profile.id);
        const meta = ledgerState.profileMeta?.get(profile.id);
        entities.push(skillFillEntity({
            profile, count: missing, existing: existingNames, version: Math.max(1, (meta?.version ?? 0) + 1), createdAt: meta?.createdAt,
            ...(level !== undefined ? { level } : {}),
        }));
    };
    const hero = findCharacter(ledgerState, userName);
    const party = hero ? [hero] : [];
    for (const allyName of start.allies) {
        if (PROTAGONIST_ALIASES.includes(allyName) || allyName === userName) continue;
        const ally = findCharacter(ledgerState, allyName);
        if (!ally || party.includes(ally) || ally.wound?.down) continue;
        party.push(ally);
        if (ally.kind !== 'skill-character') continue;
        const skills = Array.isArray(ally.skills) ? ally.skills : ally.profile.skills;
        const level = ally.attributes?.level ?? ally.level;
        addFill(ally.profile, skills.length, skillTarget(level), skills.map((skill) => skill.name), level);
    }
    const partyLevel = averageLevel(party);
    for (const { name } of start.enemies) {
        const enemy = ledgerState.enemies.get(enemyIdFor(name, start.tier));
        if (!enemy || enemy.generated === false) continue;
        addFill(enemy, enemy.skills.length, skillTarget(attributeViewFor(ledgerState, name)?.level ?? partyLevel, enemy.tier));
    }
    return entities;
}

// 组装备战大厅：主角、在场盟友、缺席盟友、倒下盟友、敌人模板及可控角色
function buildLobby(ledgerState, start, userName, fallbackTemplates, weakFoes, battleWins) {
    const hero = findCharacter(ledgerState, userName);
    if (!hero || hero.kind !== 'deck-character') return { ok: false, reason: 'combat-protagonist-missing' };
    const allies = [hero];
    const absent = [];
    const downed = [];
    for (const allyName of start.allies) {
        if (PROTAGONIST_ALIASES.includes(allyName) || allyName === userName) continue;
        const ally = findCharacter(ledgerState, allyName);
        if (ally && ally !== hero && ally.wound?.down) {
            if (!downed.includes(ally.name)) downed.push(ally.name);
        } else if (ally && !allies.includes(ally)) {
            allies.push(ally);
        } else if (!ally) {
            absent.push(allyName);
        }
    }
    const enemies = new Map();
    const templated = [];
    for (const { name } of start.enemies) {
        const id = enemyIdFor(name, start.tier);
        const enemy = ledgerState.enemies.get(id) || fallbackTemplates.get(id);
        if (enemy) {
            enemies.set(name, enemy);
            if (enemy.generated === false) templated.push(name);
        } else {
            enemies.set(name, templateEnemy(name, start.tier));
            templated.push(name);
        }
    }
    const controllable = allies.filter((ally) => ally.kind === 'deck-character' && !ally.deckNeedsAdjust).map((ally) => ally.id);
    if (!controllable.includes(hero.id) && hero.deckNeedsAdjust) return { ok: false, reason: 'combat-deck-needs-adjust', characterId: hero.id };
    const enemyAttributes = new Map();
    for (const { name } of start.enemies) {
        const view = attributeViewFor(ledgerState, name);
        if (view) enemyAttributes.set(name, view);
    }
    return { ok: true, heroId: hero.id, allies, absent, downed, enemies, templated, controllable, enemyAttributes, battleWins, ...(weakFoes === true ? { weakFoes: true } : {}) };
}

// 规则 v6 G3d 弱敌战：开战标签里的敌人全部相对主角「远逊」时为真（防刷场次）；没有关系档的敌人按默认档「相当」计（D-23）。
// enemyAttributes 为 名字 -> 属性视图（attributeViewFor），缺项按默认档。
export function weakFoesOf(start, enemyAttributes) {
    const enemies = Array.isArray(start?.enemies) ? start.enemies : [];
    const tierOf = (name) => (enemyAttributes instanceof Map ? enemyAttributes.get(name)?.tier : null);
    return enemies.length > 0 && enemies.every((enemy) => tierOf(enemy?.name) === 'outclassed');
}

// 本场战斗的奖励计划（主角缺档案时按名字临时造一个角色引用）。规则 v5 的战斗可出刻印槽；已存的 v3 / v4 战斗不出。
// 规则 v6 的战斗卡牌槽是三选一；v5 及以前的战斗照旧只出一张。
function planReward(ledgerState, session, userName, difficulty) {
    const hero = findCharacter(ledgerState, userName);
    const character = hero || { kind: 'deck-character', id: profileIdFor('deck-character', userName), name: userName };
    const enemyTiers = session.start.enemies.flatMap((enemy) => Array(Math.max(1, Number(enemy.count) || 1)).fill(session.start.tier));
    const rulesVersion = session.record?.setup?.rulesVersion ?? COMBAT_RULES.version;
    // 已开战只认 setup；准备与重试共用开战楼冻结的判定。
    const weak = rulesVersion >= 6 && (session.record?.setup ? session.record.setup.weakFoes === true
        : session.weakFoes === true);
    return rewardEntity({
        combatId: session.combatId, anchor: session.anchor, tier: session.start.tier, enemyTiers, enemies: session.start.enemies,
        encounter: session.start.encounter, character, links: traitLinks(hero?.traits, hero?.gear?.slots), difficulty,
        inscribe: rulesVersion >= 5, candidates: rulesVersion >= 6, weak,
    });
}

// 生成失败也不拦战斗的实体类别
const SOFT_FAILURE_KINDS = new Set(['profile-init', 'battle-reward', 'skill-fill', 'encounter-theme', 'profile-gear']);
const rewardFailureReason = (result) => result?.reason || ((result?.rejected || []).some((item) => item.kind === 'battle-reward') ? 'combat-reward-generation-failed' : '');

// 奖励状态：账本里有该战斗的奖励 -> ready，否则 failed
function rewardStatus(ledgerState, combatId, plan, failureReason) {
    const offer = ledgerState?.ok ? ledgerState.offers?.get(combatId) : null;
    if (offer) return { status: 'ready', exp: offer.exp, slots: offer.slots.length };
    return { status: 'failed', exp: plan?.exp ?? 0, slots: plan?.slots.length ?? 0, reason: failureReason || 'combat-reward-missing' };
}

// 本场消耗的物品：开局背包数量 - 战后剩余数量
function usedItems(record, battle) {
    const left = new Map((battle?.items?.list || []).map((item) => [item.itemId, item.count]));
    return (record?.setup?.items || [])
        .map((item) => ({ itemId: item.itemId, count: item.count - (left.get(item.itemId) ?? item.count) }))
        .filter((item) => item.count > 0);
}

// 觉醒标签只对被点名的角色生效
function awakenFor(start, controlled, heroId, userName) {
    const awaken = start.awaken;
    if (!awaken || !controlled) return null;
    const names = [controlled.name, ...(controlled.profile?.aliases || [])];
    if (controlled.id === heroId) names.push(...PROTAGONIST_ALIASES, ...(userName ? [userName] : []));
    return names.includes(awaken.character) ? { type: awaken.type, line: awaken.line } : null;
}

// 受伤角色进战斗时的起始血量：倒下 -> 1，否则按已损失血量折算，满血返回 undefined
function woundedHp(unit, wound) {
    if (!wound) return undefined;
    if (wound.down) return 1;
    const hp = Math.max(1, unit.maxHp - Math.max(0, wound.maxHp - wound.hp));
    return hp < unit.maxHp ? hp : undefined;
}

// 队伍状态：主角 + 上次出战队伍的血量/伤势/能力，供阅读器展示
export function partyStatus(ledgerState, userName) {
    if (!ledgerState?.ok || !(ledgerState.characters instanceof Map)) return [];
    const hero = findCharacter(ledgerState, userName);
    const candidates = [hero, ...(ledgerState.lastParty?.ids || []).map((id) => ledgerState.characters.get(id))];
    const seen = new Set();
    const members = [];
    for (const character of candidates) {
        if (!character || seen.has(character.id)) continue;
        seen.add(character.id);
        const vitals = vitalsOf(characterCombatStats(character).hp, character.wound);
        const scores = character.attributes?.scores;
        members.push({
            id: character.id, name: character.name, hero: character === hero,
            level: character.attributes?.level ?? character.level,
            hp: vitals.hp, maxHp: vitals.maxHp, down: vitals.down,
            injury: injuryLevel({ alive: !vitals.down, hp: vitals.hp, maxHp: vitals.maxHp }),
            abilities: scores ? ABILITY_KEYS.map((key) => [ABILITY_LABELS[key], scores[key]]) : [],
        });
    }
    return members;
}

// 己方单位（按难度压低上限血量，并套上伤势）
function allyUnits(lobby, difficulty) {
    const hpPct = difficultyRule(difficulty).maxHpPct;
    const units = lobby.allies.map((ally) => (ally.kind === 'deck-character' ? deckUnit(ally) : skillUnit(ally))).map((unit) => {
        if (!(hpPct < 1)) return unit;
        const maxHp = Math.max(1, Math.round(unit.maxHp * hpPct));
        return { ...unit, maxHp, ...(unit.hp !== undefined ? { hp: Math.min(unit.hp, maxHp) } : {}) };
    });
    for (const unit of units) {
        const hp = woundedHp(unit, lobby.allies.find((ally) => ally.id === unit.id)?.wound);
        if (hp !== undefined) unit.hp = hp;
    }
    return units;
}

// 大厅里各己方单位的起始血量
export function lobbyVitals(lobby, difficulty = 'normal') {
    return Object.fromEntries(allyUnits(lobby, difficulty).map((unit) => [unit.id, { hp: unit.hp ?? unit.maxHp, maxHp: unit.maxHp }]));
}

// 敌人超出场上普通敌人上限（maxFoesOnField）时，按战斗标识确定性地排出后备队列（首领 → 精英 → 普通，同档内按种子；排不下的首领、精英先于普通怪补位）
function reserveQueue(enemyUnitList, tiers, combatId) {
    if (enemyUnitList.length <= COMBAT_RULES.maxFoesOnField) return null;
    const salt = `reserve:${combatId}`;
    const order = (units) => units
        .map((unit) => [unit.id, hash32(`${salt}|${unit.id}`)])
        .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
        .map(([id]) => id);
    const bosses = enemyUnitList.filter((unit, index) => tiers[index] === 'boss');
    const elites = enemyUnitList.filter((unit, index) => tiers[index] === 'elite');
    const others = enemyUnitList.filter((unit, index) => tiers[index] !== 'boss' && tiers[index] !== 'elite');
    return [...order(bosses), ...order(elites), ...order(others)].slice(COMBAT_RULES.maxFoesOnField);
}

// 由大厅 + 战斗起点 + 难度生成引擎的开局参数
export function buildSetup(lobby, start, { controlledId, difficulty = 'normal', userName, combatId = '' } = {}) {
    const controlled = controlledId ?? lobby.heroId;
    if (!lobby.controllable.includes(controlled)) return { ok: false, reason: 'combat-controlled-invalid' };
    const partyLevel = averageLevel(lobby.allies);
    const battleWins = lobby.battleWins ?? lobby.allies.find((ally) => ally.id === lobby.heroId)?.purge?.battle ?? 0;
    const totalFoes = start.enemies.reduce((sum, enemy) => sum + (Number(enemy.count) || 0), 0);
    const crowd = crowdScaleFor(totalFoes, battleWins);
    const { units: enemies, tiers } = enemyUnits(start, lobby.enemies, partyLevel, difficulty, lobby.enemyAttributes, crowd);
    const allies = allyUnits(lobby, difficulty);
    const curse = difficultyRule(difficulty).curse;
    const hero = curse > 0 ? allies.find((unit) => unit.id === lobby.heroId && unit.kind === 'deck') : null;
    if (hero) {
        hero.deck = [...hero.deck, ...Array.from({ length: curse }, () => ({ cardId: CURSE_CARD.id, upgraded: false }))];
        hero.catalog = { ...hero.catalog, [CURSE_CARD.id]: CURSE_CARD };
    }
    // openingCharged（v0.39.2）：开局先手计入操控角色的行动条，速度快的主角首轮不再连动两回合；
    // randomTargets（v0.39.2）：敌人在存活的我方单位中按种子随机选攻击对象。两者都只写进新建 setup，旧战斗按已存 setup 重放。
    // foeCap（规则 v6 敌方编制）：场上普通敌人最多 maxFoesOnField，空出的总位置只给爪牙；只写进新建 setup。
    const setup = {
        rulesVersion: COMBAT_RULES.version, controlledId: controlled, canEscape: start.tier !== 'boss', overkill: true, wipe: true,
        openingCharged: true, randomTargets: true, foeCap: COMBAT_RULES.maxFoesOnField, crowd, units: [...allies, ...enemies],
    };
    // 规则 v6 G3d：弱敌战标记只在为真时写进新建 setup，战报、奖励与账本重放只认已存值。
    if (lobby.weakFoes === true) setup.weakFoes = true;
    const reserve = reserveQueue(enemies, tiers, combatId);
    if (reserve) setup.reserve = reserve;
    const controlledAlly = lobby.allies.find((ally) => ally.id === controlled);
    const awaken = awakenFor(start, controlledAlly, lobby.heroId, userName);
    if (awaken) setup.awaken = awaken;
    const items = (lobby.allies.find((ally) => ally.id === lobby.heroId)?.items || [])
        .filter((item) => item.count > 0).slice(0, 12)
        .map((item) => ({ itemId: item.itemId, name: item.name, count: Math.min(99, item.count), effects: itemEffectsForBattle(item.effects) }));
    if (items.length) setup.items = items;
    const notes = start.awaken && !awaken ? { awakenDropped: 'combat-awaken-not-controlled' } : {};
    return { ok: true, setup, tiers, expTargets: lobby.allies.map((ally) => ally.name), ...(items.length ? { itemOwner: lobby.heroId } : {}), ...notes };
}

// 会话持久层：内存里的待写表 + 合并定时器。
// 待写表里始终是最新值（null 表示删除该键）；读取先看待写表；flush 把待写表一次性写进 storage。
function createPersistLayer({ storage, global, delayMs, setTimer, clearTimer }) {
    const pending = new Map();
    const stats = { writes: 0, removes: 0, flushes: 0, failures: 0, deferred: 0 };
    let timer = null;
    const storageUsable = () => !!storage && typeof storage.setItem === 'function' && typeof storage.removeItem === 'function';

    // 真正写 storage；失败（含配额）返回 false
    function writeRaw(key, value) {
        try {
            if (value === null) { storage.removeItem(key); stats.removes += 1; } else { storage.setItem(key, JSON.stringify(value)); stats.writes += 1; }
            return true;
        } catch {
            stats.failures += 1;
            return false;
        }
    }

    // 立即落盘全部待写项，返回 键 -> 是否成功
    function flush() {
        if (timer !== null) { clearTimer(timer); timer = null; }
        const results = new Map();
        if (!pending.size) return results;
        const batch = [...pending];
        pending.clear();
        stats.flushes += 1;
        for (const [key, value] of batch) results.set(key, writeRaw(key, value));
        return results;
    }

    // 读：未落盘的值优先（深拷贝一份，行为与从 storage 解析一致）
    function read(key) {
        if (pending.has(key)) {
            const value = pending.get(key);
            return { ok: true, value: value === null ? null : JSON.parse(JSON.stringify(value)) };
        }
        return readStorageJson(storage, key);
    }

    // 延后写：返回 false 表示 storage 根本不可用（与原来 setItem 抛错时一致）
    function writeDeferred(key, value) {
        if (!storageUsable()) return false;
        pending.set(key, value);
        stats.deferred += 1;
        if (timer === null) timer = setTimer(() => { timer = null; flush(); }, delayMs);
        return true;
    }

    // 立即写：用于发件箱等不能丢的记录
    function writeNow(key, value) {
        if (!storageUsable()) return false;
        pending.set(key, value);
        return flush().get(key) === true;
    }

    // 页面隐藏/卸载时落盘；global 不一定有 addEventListener，全程容错
    const onHide = () => { flush(); };
    const onVisibility = () => {
        const doc = global?.document;
        if (doc && (doc.visibilityState === 'hidden' || doc.hidden === true)) flush();
    };
    const targets = [];
    const listen = (target, type, handler) => {
        try {
            if (target && typeof target.addEventListener === 'function') {
                target.addEventListener(type, handler);
                targets.push([target, type, handler]);
            }
        } catch { /* 宿主不支持就算了 */ }
    };
    listen(global?.document, 'visibilitychange', onVisibility);
    listen(global, 'pagehide', onHide);
    listen(global, 'beforeunload', onHide);

    function dispose() {
        flush();
        for (const [target, type, handler] of targets.splice(0)) {
            try { target.removeEventListener?.(type, handler); } catch { /* */ }
        }
    }
    return { read, writeDeferred, writeNow, flush, dispose, stats, hasPending: () => pending.size > 0 };
}

// 战报条目里的消耗物品 / 伤势字段校验（读回聊天记录时防损坏）
const validUsed = (result) => result.used === undefined
    || (Array.isArray(result.used) && typeof result.character === 'string' && result.used.every((item) => typeof item?.itemId === 'string' && Number.isInteger(item?.count) && item.count > 0));
const validWounds = (result) => result.wounds === undefined
    || (Array.isArray(result.wounds) && result.wounds.every((wound) => typeof wound?.character === 'string' && wound.character
        && Number.isInteger(wound.maxHp) && wound.maxHp >= 1 && Number.isInteger(wound.hp) && wound.hp >= 0 && wound.hp <= wound.maxHp && typeof wound.down === 'boolean'));
const growthInt = (value) => Number.isInteger(value) && value >= 0 && value <= 20;
const validBattleGrowth = (result) => result.battleGrowth === undefined
    || (Array.isArray(result.battleGrowth) && result.battleGrowth.every((growth) => typeof growth?.character === 'string' && growth.character && growthInt(growth.hpMax)
        && Array.isArray(growth.cards) && growth.cards.every((card) => typeof card?.cardId === 'string' && card.cardId && growthInt(card.damage) && growthInt(card.block)
            && (card.copyId === undefined || (typeof card.copyId === 'string' && card.copyId)))));
// 永久成长的单张记录；规则 v5 P5a 带副本 ID 时一并保留。
const growthCard = (card) => ({ cardId: card.cardId, ...(card.copyId ? { copyId: card.copyId } : {}), damage: card.damage, block: card.block });

// 战报条目（发件箱与聊天记录共用的精简形态）
const reportItemOf = (report) => ({
    reportId: report.reportId, text: report.text, result: report.result, kind: 'report',
    // 规则 v5 E17 / D11：敌人限时撤离的胜利不给战利品。
    ...(report.noLoot === true ? { noLoot: true } : {}),
    ...(Array.isArray(report.used) && report.used.length && typeof report.character === 'string' && report.character
        ? { used: report.used.map((item) => ({ itemId: item.itemId, count: item.count })), character: report.character } : {}),
    ...(Array.isArray(report.wounds) && report.wounds.length
        ? { wounds: report.wounds.map((wound) => ({ character: wound.character, hp: wound.hp, maxHp: wound.maxHp, down: wound.down === true })) } : {}),
    ...(Array.isArray(report.battleGrowth) && report.battleGrowth.length
        ? { battleGrowth: report.battleGrowth.map((growth) => ({ character: growth.character, cards: growth.cards.map(growthCard), hpMax: growth.hpMax })) } : {}),
});

// 本场消耗物品字段
function usedPart(session) {
    if (session?.kind === 'challenge') return {};
    const used = usedItems(session.record, session.battle);
    const owner = session.record?.itemOwner || session.record?.setup?.controlledId;
    return used.length && owner ? { used, character: owner } : {};
}

// 本场各己方单位的最终伤势字段；规则 v5 P05：胜利时存活单位按「战后回复」层数回复（不超过最大生命），倒下者不回复。
// 规则 v5 E22 / D12：本场最大生命损伤不带出战斗，最大生命按 baseMaxHp 还原，当前生命照常写持续伤势。
function woundPart(session) {
    if (session?.kind === 'challenge') return {};
    const allies = Object.values(session.battle?.units || {}).filter((unit) => unit?.side === 'ally');
    if (!allies.length) return {};
    const won = session.battle?.outcome === 'victory' && session.battle?.rulesVersion >= 5;
    return { wounds: allies.map((unit) => {
        const mend = won ? afterBattleMend(unit) : 0;
        const maxHp = baseMaxHp(unit);
        return { character: unit.id, hp: Math.max(0, Math.min(maxHp, unit.alive ? unit.hp + mend : 0)), maxHp, down: !unit.alive };
    }) };
}

// 规则 v5 G24 / G25：本场各己方卡组单位的永久成长与击杀奖励（胜、败、撤退都记，与伤势一致）。
function battleGrowthPart(session) {
    if (session?.kind === 'challenge') return {};
    const list = Object.values(session.battle?.units || {})
        .filter((unit) => unit?.side === 'ally' && unit.kind === 'deck' && unit.res?.battleGrowth)
        .map((unit) => ({
            character: unit.id,
            cards: [
                ...Object.entries(unit.res.battleGrowth.cards || {}).map(([cardId, value]) => ({ cardId, damage: value.damage || 0, block: value.block || 0 })),
                ...Object.entries(unit.res.battleGrowth.copies || {}).map(([copyId, value]) => ({ cardId: value.cardId, copyId, damage: value.damage || 0, block: value.block || 0 })),
            ].filter((card) => card.damage || card.block),
            hpMax: unit.res.battleGrowth.hpMax || 0,
        }))
        .filter((growth) => growth.cards.length || growth.hpMax);
    return list.length ? { battleGrowth: list } : {};
}

export function createCombatSession(options = {}) {
    const { ledger, tables, request, send, storage } = options;
    const getChat = () => resolveOption(options.chat) || [];
    const getChatId = () => String(resolveOption(options.getChatId) ?? '');
    const getUserName = () => String(resolveOption(options.userName) || '').trim();
    const getSourceFilter = () => resolveOption(options.sourceFilter);
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const difficultyOf = () => resolveOption(options.difficulty) || 'normal';
    const challengeOptions = options.challenge || {};
    const kindsNow = () => ({ combat: resolveOption(options.kinds)?.combat !== false, challenge: resolveOption(options.kinds)?.challenge === true, intimate: resolveOption(options.kinds)?.intimate });
    const locate = (messageId, kinds = kindsNow()) => locateCombatStart(getChat(), messageId, getSourceFilter(), kinds);
    const isChallenge = (session) => session?.kind === 'challenge';

    // ---- 持久层（节流合并写盘） ----
    const globalObject = options.global || globalThis;
    const persist = createPersistLayer({
        storage,
        global: globalObject,
        delayMs: Number.isFinite(options.persistDelayMs) ? options.persistDelayMs : PERSIST_DELAY_MS,
        setTimer: typeof options.setTimer === 'function' ? options.setTimer : (fn, ms) => {
            const handle = setTimeout(fn, ms);
            if (handle && typeof handle.unref === 'function') handle.unref();
            return handle;
        },
        clearTimer: typeof options.clearTimer === 'function' ? options.clearTimer : (handle) => clearTimeout(handle),
    });

    let current = { status: 'idle' };
    let sending = false; // 战报/跳过消息发送中，防重入
    const resultsSaved = new Set(); // 已写进聊天记录的战斗结果
    let recordError = '';
    let finalWrite = null; // 战斗结束时写聊天记录的 Promise
    let prepareTask = null;
    let rewardRetryTask = null;
    let flipContext = null; // 翻牌的当前数据 { combatId, offer, pick, points, payer, character }
    let flipLoading = null; // 正在读取的翻牌 { combatId, promise }，同一战斗并发调用共用
    let flipWriteChain = Promise.resolve();
    let flipSaving = false;
    const listeners = new Set();

    const snapshot = () => ({ ...current, ...(isChallenge(current) && current.challengeResult ? { challengeSummary: challengeSummary(current) } : {}), ...(recordError ? { recordError } : {}), legal: current.status === 'battle' && current.battle ? legalActions(current.battle) : [] });
    const setState = (next) => { current = next; return snapshot(); };
    const ok = (extra = {}) => ({ ok: true, ...extra, session: snapshot() });
    const fail = (reason, extra = {}) => ({ ok: false, reason, ...extra, session: snapshot() });
    const sessionKey = () => sessionKeyFor(getChatId());
    const identityOf = (session) => ({ combatId: session.combatId, anchor: session.anchor, start: session.start, reportId: session.reportId, chatId: session.chatId, ...(typeof session.weakFoes === 'boolean' ? { weakFoes: session.weakFoes } : {}), ...(session.theme ? { theme: session.theme } : {}), ...(isChallenge(session) ? { kind: 'challenge' } : {}) });

    // 会话记录读写：写入走节流，读取先看内存
    const readSession = () => persist.read(sessionKey());
    const writeSession = (record) => persist.writeDeferred(sessionKey(), record);
    // 会话结束：清掉记录并立刻落盘
    const clearSession = () => { writeSession(null); persist.flush(); };
    const flushPersist = () => persist.flush();

    // 战斗楼还是当时那一版吗（楼层被改/重写则作废）
    const isCurrent = (session) => {
        if (session.chatId !== undefined && session.chatId !== getChatId()) return false;
        const located = locate(session.anchor?.messageId, isChallenge(session) ? { combat: false, challenge: resolveOption(options.kinds)?.challenge === true, intimate: resolveOption(options.kinds)?.intimate } : kindsNow());
        return located.ok && sameAnchor(located.anchor, session.anchor);
    };
    const floorChanged = () => {
        clearSession();
        setState({ ...identityOf(current), status: 'stale', reason: 'combat-floor-changed' });
        return fail('combat-floor-changed');
    };
    const blocked = (session, reason, extra = {}) => { setState({ ...session, status: 'blocked', reason, ...extra }); return fail(reason, extra); };
    const notify = () => {
        const state = snapshot();
        for (const listener of [...listeners]) {
            try { listener(state); } catch { /* 监听者出错不影响会话 */ }
        }
    };
    function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    function buildChallengeReportFor(session) {
        const challenge = session.record?.setup?.challenge;
        const end = session.challengeResult;
        if (!challenge || !end) return { ok: false, reason: 'challenge-report-invalid' };
        return buildChallengeReport({
            combatId: session.combatId, event: challenge.event, result: end.result, willRatio: end.willRatio, byLimit: end.byLimit,
            tier: challenge.tier, costTier: challengeCostTier(challenge.tier, resolveOption(challengeOptions.stake)), stake: challenge.stake, domain: challenge.domain,
            detail: resolveOption(options.reportDetail) || 'normal', foe: challenge.foe, counterpart: challenge.counterpart, allies: challenge.allies,
            ...(challenge.intimate && end.ending ? { ending: end.ending, mechanic: challenge.intimate.mechanic, outcome: INTIMATE_LEGACY_OUTCOME[end.ending] } : {}),
        });
    }

    // 结局、奖金与经验牌：与战报同一份难度档，面板结束页展示，结算由战报楼驱动；同一场只算一次。
    const summaryCache = new Map();
    function challengeSummary(session) {
        const challenge = session.record?.setup?.challenge;
        const end = session.challengeResult;
        if (!challenge || !end) return null;
        const cached = summaryCache.get(session.combatId);
        if (cached && cached.end === end) return cached.value;
        const tier = challengeCostTier(challenge.tier, resolveOption(challengeOptions.stake));
        const outcome = challenge.intimate && end.ending ? INTIMATE_LEGACY_OUTCOME[end.ending] : challengeOutcomeOf(end.result, end.willRatio, { byLimit: end.byLimit });
        const harvest = challenge.intimate ? { prize: null, card: false } : challengeHarvest(challenge.foe, outcome, tier);
        const reward = harvest.card ? planChallengeReward({ combatId: session.combatId, outcome, tier, foe: challenge.foe, domain: challenge.domain }) : null;
        const value = { outcome, prize: harvest.prize, card: reward?.ok ? reward.card : null, ...(challenge.intimate && end.ending ? { ending: end.ending } : {}) };
        summaryCache.set(session.combatId, { end, value });
        return value;
    }
    const buildReport = (session) => (isChallenge(session) ? buildChallengeReportFor(session) : buildCombatReport({
        combatId: session.combatId, encounter: session.record.encounter, state: session.battle, events: session.events,
        enemyTiers: session.record.tiers, expTargets: session.record.expTargets, detail: resolveOption(options.reportDetail) || 'normal',
        weak: session.record.setup?.weakFoes === true,
    }));

    // ---- 聊天记录（战斗结果、翻牌选择随聊天走） ----
    function readChatRecord(session) {
        const chatRecord = options.chatRecord;
        if (!chatRecord || typeof chatRecord.read !== 'function') return { ok: true, value: null };
        let read;
        try {
            read = chatRecord.read(session.anchor, session.combatId);
        } catch {
            return { ok: false, reason: 'combat-record-read-failed' };
        }
        if (read?.ok !== true) return { ok: false, reason: read?.reason || 'combat-record-read-failed' };
        const result = read.value?.result;
        // result 为 null：「重新开始」撤掉了上一局的结果，按没有结果处理。
        const corrupt = result !== undefined && result !== null && (typeof result?.reportId !== 'string' || typeof result?.text !== 'string' || typeof result?.result !== 'string' || !validUsed(result) || !validWounds(result) || !validBattleGrowth(result));
        return corrupt ? { ok: false, reason: 'combat-record-corrupt' } : { ok: true, value: read.value || null };
    }

    async function writeChatRecord(session, patch) {
        const chatRecord = options.chatRecord;
        if (!chatRecord || typeof chatRecord.write !== 'function') return { ok: true, skipped: true };
        if (!isCurrent(session)) {
            recordError = 'combat-record-stale';
            return { ok: false, reason: 'combat-record-stale' };
        }
        let written;
        try {
            written = await chatRecord.write(session.anchor, session.combatId, patch);
        } catch {
            written = null;
        }
        const result = written?.ok === true ? written : { ok: false, reason: written?.reason || 'combat-record-save-failed' };
        recordError = result.ok ? '' : result.reason;
        return result;
    }

    // 战斗结束：把战报写进聊天记录（结果只写一次）
    async function saveResult(session, report, battle) {
        const extra = { ...(report.used ? { used: report.used, character: report.character } : {}), ...(report.wounds ? { wounds: report.wounds } : {}), ...(report.battleGrowth ? { battleGrowth: report.battleGrowth } : {}) };
        const written = await writeChatRecord(session, {
            result: { reportId: report.reportId, result: report.result, text: report.text, outcome: battle?.outcome || '', turn: Number(battle?.turn) || 0, at: now(), ...extra },
        });
        if (written.ok) resultsSaved.add(session.combatId);
        notify();
        return written;
    }

    // ---- 发件箱（战报待发送，必须立即落盘） ----
    function readOutbox() {
        const outbox = persist.read(outboxKeyFor(getChatId()));
        return outbox.ok ? { ok: true, value: outbox.value && typeof outbox.value === 'object' ? outbox.value : {} } : outbox;
    }
    function setOutbox(combatId, report) {
        const outbox = readOutbox();
        if (!outbox.ok) return false;
        const next = { ...outbox.value };
        if (report) next[combatId] = report; else delete next[combatId];
        return persist.writeNow(outboxKeyFor(getChatId()), Object.keys(next).length ? next : null);
    }

    // ---- 翻牌奖励 ----
    const currentReport = () => current.final || current.report || null;
    const currentResult = () => currentReport()?.result ?? (current.battle?.outcome === 'victory' ? 'win' : null);
    const noLootNow = () => currentReport()?.noLoot === true || current.battle?.noLoot === true;
    const canFlip = () => !isChallenge(current) && (current.status === 'ended' || current.status === 'send-failed') && currentResult() === 'win' && !noLootNow();
    const viewOfFlip = (context) => flipView(context.offer, context.pick, { points: context.points, payer: context.payer, locked: hasLoot(currentReport()?.text) }, context.purge);

    // 规则 v6 删卡：本场普通胜利正好满 5 场时，结算页给主角一次删牌机会（可跳过）。没到场次时不给字段。
    // cards 按卡组副本逐张列出（同名牌不合并）：已升级的副本给升级后的费用与效果并带 upgraded，成长与刻印原样带出。
    // keywords 为牌面关键字（固有、保留等，只取定义里有的）。
    const PURGE_KEYWORD_KEYS = ['unplayable', 'innate', 'retain', 'ethereal', 'sly', 'replay', 'radiance', 'temp', 'onDiscard'];
    function purgeOfHero(hero, combatId, points) {
        if (hero?.kind !== 'deck-character') return null;
        const chance = purgeChance(hero, reportIdFor(combatId));
        if (chance.reason === 'combat-purge-not-due' || chance.reason === 'combat-purge-kind-mismatch') return null;
        const short = chance.available && points < chance.cost;
        const base = { battle: chance.battle, cost: chance.cost, available: chance.available && !short, ...(short ? { reason: 'combat-points-insufficient' } : chance.reason ? { reason: chance.reason } : {}) };
        if (!base.available) return base;
        const cards = (hero.deckEntries || []).filter((row) => row.copyId).map((row) => {
            const card = hero.catalog?.get?.(row.cardId) || {};
            const up = row.upgraded && card.upgraded ? card.upgraded : null;
            const keywords = Object.fromEntries(PURGE_KEYWORD_KEYS.filter((k) => card[k] !== undefined && card[k] !== false).map((k) => [k, card[k]]));
            return { copyId: row.copyId, cardId: row.cardId, name: card.name || row.cardId, type: card.type || '', cost: up?.cost ?? card.cost ?? '', rarity: card.rarity || '',
                effects: up?.effects || card.effects || [], ...(row.upgraded ? { upgraded: true } : {}), ...(row.bonus ? { bonus: row.bonus } : {}),
                ...(row.inscription ? { inscription: row.inscription } : {}), ...(Object.keys(keywords).length ? { keywords } : {}) };
        });
        return { ...base, cards };
    }

    // 读取奖励候选并合并三处来源（内存记录、本地会话、聊天记录）里的已翻结果；同一战斗并发调用共用同一次读取
    function loadFlip() {
        if (!canFlip()) return Promise.resolve(fail('combat-flip-unavailable'));
        if (flipLoading && flipLoading.combatId === current.combatId) return flipLoading.promise;
        const task = { combatId: current.combatId, promise: null };
        flipLoading = task;
        task.promise = loadFlipOnce().finally(() => { if (flipLoading === task) flipLoading = null; });
        return task.promise;
    }

    async function loadFlipOnce() {
        const identity = identityOf(current);
        if (!current.flip) setState({ ...current, flip: { status: 'loading' } });
        let ledgerState;
        try {
            ledgerState = await ledger.effectiveState();
        } catch {
            ledgerState = null;
        }
        if (current.combatId !== identity.combatId || !canFlip()) return fail('request-stale');
        const finishWith = (flip, context = null) => {
            flipContext = context;
            setState({ ...current, flip });
            notify();
            return flip.status === 'error' ? fail(flip.reason) : ok();
        };
        if (ledgerState?.ok !== true) return finishWith({ status: 'error', reason: ledgerState?.reason || 'combat-ledger-read-failed' });
        const offer = ledgerState.offers?.get(identity.combatId);
        if (!offer) return finishWith({ status: 'none' });
        const chatRecord = readChatRecord(identity);
        if (!chatRecord.ok) return finishWith({ status: 'error', reason: chatRecord.reason });
        const saved = readSession();
        const savedFlip = saved.ok && saved.value?.combatId === identity.combatId ? saved.value.flip : undefined;
        const picks = [current.record?.flip, savedFlip, chatRecord.value?.flip].filter((pick) => pick != null).map((pick) => normalizePick(pick, offer));
        if (picks.some((pick) => !pick)) return finishWith({ status: 'error', reason: 'combat-flip-corrupt' });
        const heroId = ledgerState.attributes?.heroId ?? null;
        // 删卡只在规则 v6 的战斗结算里出现（与奖励三选一同一门控）。
        const v6 = (current.record?.setup?.rulesVersion ?? COMBAT_RULES.version) >= 6;
        const points = (heroId && ledgerState.characters.get(heroId)?.points) || 0;
        const context = {
            combatId: identity.combatId, offer, pick: picks.reduce(laterPick, null) || emptyPick(),
            points, payer: !!heroId && offer.character === heroId,
            character: ledgerState.characters.get(offer.character)?.name || getUserName(),
            // 规则 v6 G3d：弱敌战不计场次，不给删卡机会。
            purge: heroId && v6 && current.record?.setup?.weakFoes !== true ? purgeOfHero(ledgerState.characters.get(heroId), identity.combatId, points) : null,
            heroName: (heroId && ledgerState.characters.get(heroId)?.name) || getUserName(),
        };
        return finishWith(viewOfFlip(context), context);
    }

    // 当前能否操作翻牌，不能则返回原因
    function flipBlockReason() {
        if (!canFlip()) return 'combat-flip-unavailable';
        if (!flipContext || flipContext.combatId !== current.combatId || current.flip?.status !== 'ready') return 'combat-flip-not-ready';
        return hasLoot(currentReport()?.text) ? 'combat-flip-locked' : null;
    }

    // 保存翻牌选择：战斗还在会话记录里就同时写会话记录（节流）+ 聊天记录；否则只写聊天记录
    async function saveFlipPick(pick) {
        const identity = identityOf(current);
        if (current.record) {
            const record = { ...current.record, flip: pick };
            if (!writeSession(record)) return fail('combat-session-save-failed');
            flipContext = { ...flipContext, pick };
            setState({ ...current, record, flip: viewOfFlip(flipContext) });
            const written = flipWriteChain.then(() => writeChatRecord(identity, { flip: pick }));
            flipWriteChain = written.catch(() => {});
            await written;
            notify();
            return ok();
        }
        if (flipSaving) return fail('combat-flip-busy');
        flipSaving = true;
        let written;
        try {
            written = await writeChatRecord(identity, { flip: pick });
        } finally {
            flipSaving = false;
        }
        if (written?.ok !== true || written.skipped) return fail('combat-flip-save-failed');
        if (current.combatId !== identity.combatId || flipBlockReason()) return fail('request-stale');
        flipContext = { ...flipContext, pick };
        setState({ ...current, flip: viewOfFlip(flipContext) });
        notify();
        return ok();
    }

    async function updateFlip(compute) {
        const reason = flipBlockReason();
        if (reason) return fail(reason);
        if (!isCurrent(current)) return floorChanged();
        const next = compute(flipContext);
        return next.ok ? saveFlipPick(next.pick) : fail(next.reason);
    }
    const flip = (index) => updateFlip((context) => flipCard(context.offer, context.pick, index));
    const choose = (index) => updateFlip((context) => chooseCard(context.offer, context.pick, index));
    // 规则 v6 卡牌槽：在候选里取第几张（0 起）或 'skip' 放弃
    const pickCard = (value) => updateFlip((context) => pickCardChoice(context.offer, context.pick, value));
    const reroll = () => updateFlip((context) => rerollPick(context.offer, context.pick, { points: context.points, payer: context.payer }));
    // 规则 v6 删卡：选一张卡组副本（copyId）或 'skip' 不删；发送前可改选。
    const pickPurge = (value) => updateFlip((context) => pickPurgeChoice(context.purge, context.pick, value));

    // 发送战报前确认翻牌奖励：胜利且未领奖时，把选中的奖励追加进战报文本
    async function resolveLoot(report) {
        if (report?.result !== 'win' || report.noLoot === true || current.battle?.noLoot === true || hasLoot(report.text)) return { ok: true, item: report };
        const loaded = await loadFlip();
        const flipState = current.flip;
        if (flipState?.status === 'none') return { ok: true, item: report };
        if (!loaded.ok || flipState?.status !== 'ready' || !flipContext) return { ok: false, reason: flipState?.reason || loaded.reason || 'combat-flip-not-ready' };
        const loot = lootOf(flipContext.offer, flipContext.pick);
        if (!loot) return { ok: false, reason: 'combat-flip-required' };
        if (hasCardChoices(loot.slot) && loot.pick === undefined) return { ok: false, reason: 'combat-flip-card-required' };
        if (loot.set === 'reserve' && flipContext.points < REROLL_COST) return { ok: false, reason: 'combat-points-insufficient' };
        const purge = flipContext.purge;
        const purgePick = flipContext.pick.purge;
        if (purge?.available && purgePick === undefined) return { ok: false, reason: 'combat-purge-required' };
        const purgeCard = purge?.available && purgePick !== 'skip' ? (purge.cards || []).find((c) => c.copyId === purgePick) : null;
        if (purge?.available && purgePick !== 'skip' && !purgeCard) return { ok: false, reason: 'combat-purge-copy-missing' };
        const spend = (loot.set === 'reserve' ? REROLL_COST : 0) + (purgeCard ? purge.cost : 0);
        if (purgeCard && flipContext.points < spend) return { ok: false, reason: 'combat-points-insufficient' };
        await flipWriteChain;
        const looted = attachLoot(report.text, { character: flipContext.character, reportId: report.reportId, ...loot });
        const text = purgeCard ? attachPurge(looted, { character: flipContext.heroName, reportId: report.reportId, copyId: purgeCard.copyId, name: purgeCard.name }) : looted;
        return { ok: true, item: { ...report, text } };
    }

    // ---- 备战 ----
    // 备战：同一战斗并发调用共用一次；结束后通知监听者
    async function prepare(messageId, prepareOptions = {}) {
        const located = locate(messageId);
        if (!located.ok) return fail(located.reason);
        if (prepareTask && prepareTask.combatId === located.combatId) return prepareTask.promise;
        const task = { combatId: located.combatId, promise: null };
        prepareTask = task;
        task.promise = runPrepare(located, messageId, prepareOptions);
        try {
            return await task.promise;
        } finally {
            if (prepareTask === task) prepareTask = null;
            notify();
        }
    }

    // 生成过程中产生的技能补全诊断
    function collectFillDiagnostics(result, entities, fillDiagnostics) {
        if (result.reason) for (const entity of entities) if (entity.kind === 'skill-fill') fillDiagnostics.push({ code: result.reason, owner: entity.owner });
        for (const rejected of result.rejected || []) {
            if (rejected.kind === 'skill-fill') {
                fillDiagnostics.push({ code: 'combat-skill-fill-failed', owner: rejected.owner, ...(rejected.errors?.[0]?.reason ? { reason: rejected.errors[0].reason } : {}) });
            }
        }
    }

    async function runPrepare(located, messageId, { signal } = {}) {
        const chat = getChat();
        const userName = getUserName();
        if (!userName) return fail('combat-user-name-missing');
        const session = { combatId: located.combatId, anchor: located.anchor, start: located.start, reportId: reportIdFor(located.combatId), chatId: getChatId(), ...(located.challenge ? { kind: 'challenge' } : {}) };
        if (findReportFloor(chat, messageId, session.reportId) >= 0) return ok({ session: setState({ ...session, status: 'done' }) });
        const chatRecord = readChatRecord(session);
        if (!chatRecord.ok) return blocked(session, chatRecord.reason);
        // 敌人图集题材留档（encounter-theme）：合法时带进会话；非法值忽略，面板按世界观选图。
        if (isEnemyArtTheme(chatRecord.value?.theme)) session.theme = chatRecord.value.theme;
        if (chatRecord.value?.result) {
            resultsSaved.add(session.combatId);
            setState({ ...session, status: 'send-failed', report: reportItemOf(chatRecord.value.result) });
            await loadFlip();
            return ok();
        }
        const outbox = readOutbox();
        if (!outbox.ok) return fail(outbox.reason);
        if (outbox.value[session.combatId]) {
            setState({ ...session, status: 'send-failed', report: outbox.value[session.combatId] });
            await loadFlip();
            return ok();
        }
        if (located.challenge) return prepareChallenge(session, signal);
        setState({ ...session, status: 'preparing' });
        const protagonistWait = typeof options.awaitProtagonist === 'function' ? options.awaitProtagonist() : null;
        if (protagonistWait) {
            try { await protagonistWait; } catch { /* 主角档案生成失败由后面的检查兜底 */ }
            if (signal?.aborted || !isCurrent(session)) { setState({ status: 'idle' }); return fail('request-stale'); }
        }
        // 账本状态：只在本函数确实写过表之后才重新读取，其余步骤传递同一份
        let ledgerState = await ledger.effectiveState({ throughMessageId: session.anchor.messageId });
        if (!ledgerState.ok) return blocked(session, ledgerState.reason, ledgerState.detail ? { detail: ledgerState.detail } : {});
        // 与删卡共用普通胜场；准备期间的生成与重读不能把开战楼之后的胜利算进本场。
        session.battleWins = findCharacter(ledgerState, userName)?.purge?.battle ?? 0;
        const alreadyPrepared = !!chatRecord.value?.prepared;
        session.weakFoes = COMBAT_RULES.version >= 6 && (alreadyPrepared
            ? chatRecord.value.prepared.weakFoes === true
            : weakFoesOf(session.start, new Map(session.start.enemies.map(({ name }) => [name, attributeViewFor(ledgerState, name)]))));
        let entities = neededProfiles(ledgerState, located.start, userName, { heroOnly: alreadyPrepared });
        const initNames = alreadyPrepared ? [userName] : [userName, ...located.start.allies, ...located.start.enemies.map((enemy) => enemy.name)];
        if (ledgerState.attributes?.table === 'ok') {
            const names = [...new Set(initNames.map((name) => (PROTAGONIST_ALIASES.includes(name) ? userName : findCharacter(ledgerState, name)?.name || name)))];
            const buildMode = resolveOption(options.buildMode) || null;
            const enemyNames = new Set(located.start.enemies.map((enemy) => enemy.name));
            const wantsInit = (name) => wantsAutoInit({ mode: buildMode?.mode ?? null, choice: buildMode?.choices?.[name] ?? null, protagonist: name === userName, enemy: enemyNames.has(name) });
            entities = withCombatInitialization(entities, names.filter((name) => !abilitiesForName(ledgerState, name, userName)?.initialized && wantsInit(name)));
        }
        const filledIds = new Set();
        if (!alreadyPrepared) entities = [...entities, ...skillFillEntities(ledgerState, located.start, userName, filledIds)];
        const rewardPlan = ledgerState.offers?.has(session.combatId) ? null : planReward(ledgerState, session, userName, difficultyOf());
        const wantsReward = !!rewardPlan?.entity && !alreadyPrepared;
        if (wantsReward) entities = [...entities, rewardPlan.entity];
        // 敌人图集题材：第一次准备时与同批实体一起请求一条；已准备过或留档已有题材的场次不再请求。
        const savedTheme = session.theme || '';
        const wantsTheme = !alreadyPrepared && !savedTheme;
        if (wantsTheme) entities = [...entities, encounterThemeEntity(located.start)];
        let theme = savedTheme;
        // 初始装备：只随主角卡组档案同批请求，主角至少 1 件（v0.39.2）；已有主角档案时不请求，助战在面板生成卡组时由服务层请求。
        const gearNames = entities.some((entity) => entity.kind === 'profile-deck') ? [userName] : [];
        if (gearNames.length) entities = [...entities, ...gearNames.map((name) => profileGearEntity(name, { required: true }))];
        const gearDiagnostics = [];
        let rewardFailure = '';
        const initDiagnostics = [];
        const fillDiagnostics = [];
        const stillWanted = () => !signal?.aborted && isCurrent(session);
        if (!stillWanted()) { setState({ status: 'idle' }); return fail('request-stale'); }
        const fallbackTemplates = new Map();
        let generated = null;
        if (entities.length) {
            const context = await withStoryContext(
                { encounter: located.start.encounter, tier: located.start.tier, protagonist: userName }, options.readStoryContext,
                { names: initNames, signal, full: entities.some((entity) => entity.kind === 'profile-deck') },
            );
            generated = await generateWithRetry(await withCharacterLore(entities, options.readLore), {
                request, llm: resolveOption(options.llm), signal, classes: ledgerState.classes, now: now(), context, retryDelays: options.retryDelays,
            });
            if (generated.reason === 'request-stale' || !stillWanted()) { setState({ status: 'idle' }); return fail('request-stale'); }
            if (generated.reason) {
                if (entities.some((entity) => !SOFT_FAILURE_KINDS.has(entity.kind))) return blocked(session, generated.reason, generated.missing ? { missing: generated.missing } : {});
                if (entities.some((entity) => entity.kind === 'profile-init')) initDiagnostics.push({ code: generated.reason });
            }
            initDiagnostics.push(...(generated.diagnostics || []).filter((item) => item.code === 'combat-init-invalid'));
            for (const rejected of generated.rejected || []) if (rejected.kind === 'profile-init') initDiagnostics.push({ code: 'combat-init-generation-failed', key: rejected.key });
            collectFillDiagnostics(generated, entities, fillDiagnostics);
            if (wantsTheme) theme = (generated.accepted || []).find((item) => item.kind === 'encounter-theme')?.theme || '';
            if (generated.reason && gearNames.length) gearDiagnostics.push({ code: generated.reason });
            for (const rejected of generated.rejected || []) if (rejected.kind === 'profile-gear') gearDiagnostics.push({ code: 'combat-gear-generation-failed', key: rejected.key });
            let wrote = false;
            const writes = generationWrites(generated, { createdAt: now() });
            if (writes.profiles.length) {
                wrote = true;
                const written = await tables.append('profile', writes.profiles);
                const onlySkillFill = (generated.accepted || []).every((item) => !item.profile || item.kind === 'skill-fill');
                if (written?.ok !== true && !onlySkillFill) return blocked(session, 'combat-profile-write-failed', { write: written });
                if (written?.ok !== true) fillDiagnostics.push({ code: 'combat-skill-fill-write-failed', owners: writes.profiles.map((profile) => profile.id) });
            }
            for (const rejected of generated.rejected) if (rejected.fallback?.kind === 'template-enemy') fallbackTemplates.set(rejected.owner, rejected.fallback.profile);
            if (generated.blocked) return blocked(session, 'combat-protagonist-generation-failed', { rejected: generated.rejected });
            if (wantsReward) {
                wrote = true;
                rewardFailure = rewardFailureReason(generated) || (await writeOffers(generated)).reason || '';
            }
            for (const accepted of generated.accepted || []) {
                if (!stillWanted()) { setState({ status: 'idle' }); return fail('request-stale'); }
                if (!accepted.init) continue;
                wrote = true;
                let initResult;
                try {
                    initResult = await ledger.writeInit(accepted.init.name, accepted.init.value, { signal, shouldStart: stillWanted });
                } catch {
                    initResult = { ok: false, reason: 'combat-init-write-failed' };
                }
                if (initResult?.ok !== true) initDiagnostics.push({ code: initResult?.reason || 'combat-init-write-failed', name: accepted.init.name });
            }
            if (wrote) {
                ledgerState = await ledger.effectiveState();
                if (!ledgerState.ok) return blocked(session, ledgerState.reason);
            }
            // 初始装备：档案落库并读回后按开战楼锚点写 equip；写失败只记诊断，不阻断开战。
            if (await grantGeneratedGear(ledger, generated, (name) => findCharacter(ledgerState, name)?.id, { anchor: session.anchor, diagnostics: gearDiagnostics })) {
                ledgerState = await ledger.effectiveState();
                if (!ledgerState.ok) return blocked(session, ledgerState.reason);
            }
            const fillAgain = alreadyPrepared ? [] : skillFillEntities(ledgerState, located.start, userName, filledIds);
            if (fillAgain.length) {
                const fillResult = await generateWithRetry(await withCharacterLore(fillAgain, options.readLore), {
                    request, llm: resolveOption(options.llm), signal, classes: ledgerState.classes, now: now(), context, retryDelays: options.retryDelays,
                });
                if (fillResult.reason === 'request-stale' || !stillWanted()) { setState({ status: 'idle' }); return fail('request-stale'); }
                collectFillDiagnostics(fillResult, fillAgain, fillDiagnostics);
                const fillWrites = generationWrites(fillResult, { createdAt: now() });
                if (fillWrites.profiles.length) {
                    if ((await tables.append('profile', fillWrites.profiles))?.ok !== true) {
                        fillDiagnostics.push({ code: 'combat-skill-fill-write-failed', owners: fillWrites.profiles.map((profile) => profile.id) });
                    } else {
                        ledgerState = await ledger.effectiveState();
                        if (!ledgerState.ok) return blocked(session, ledgerState.reason);
                    }
                }
            }
        }
        if (!stillWanted()) { setState({ status: 'idle' }); return fail('request-stale'); }
        const lobby = buildLobby(ledgerState, located.start, userName, fallbackTemplates, session.weakFoes, session.battleWins);
        if (!lobby.ok) return blocked(session, lobby.reason);
        lobby.vitals = lobbyVitals(lobby, difficultyOf());
        const skipped = (generated?.rejected || []).filter((item) => item.fallback?.kind === 'skip').map((item) => item.owner);
        const newTheme = theme && theme !== savedTheme ? { theme } : {};
        if (!chatRecord.value?.prepared || newTheme.theme) await writeChatRecord(session, { ...(chatRecord.value?.prepared ? {} : { prepared: { at: now(), weakFoes: session.weakFoes } }), ...newTheme });
        return ok({
            session: setState({
                ...session, ...(theme ? { theme } : {}), status: 'lobby', lobby, skipped, reward: rewardStatus(ledgerState, session.combatId, rewardPlan?.plan, rewardFailure),
                ...(initDiagnostics.length && { initDiagnostics }), ...(fillDiagnostics.length && { fillDiagnostics }), ...(gearDiagnostics.length && { gearDiagnostics }),
            }),
        });
    }

    // 日常挑战备战：不读账本、不调副 LLM，直接按数值侧快照建局；结果放进大厅状态供面板展示。
    // 难关先请副模型挑，不可用或被拒收时退回本地登记，失败不拦开局；协助者由玩家在大厅里挑，默认不带。
    function intimateBuild(start, challengeState, choice = {}) {
        const settings = resolveOption(challengeOptions.intimate) || {};
        const floorText = messageText(getChat()[start.messageId]);
        const position = choice.position || resolveIntimatePosition(settings.position, floorText, getUserName());
        const mechanic = choice.mechanic || start.mechanic;
        const persona = typeof challengeOptions.persona === 'function' ? challengeOptions.persona(start.counterpart) : '';
        return buildIntimateSetup({ start: { ...start, mechanic, allowEscape: resolveOption(challengeOptions.allowEscape) !== false }, state: challengeState, user: { name: getUserName() }, position, persona });
    }

    function prepareIntimate(session) {
        const challengeState = resolveOption(challengeOptions.state) || null;
        const start = { ...session.start, messageId: session.anchor?.messageId };
        const built = intimateBuild(start, challengeState);
        if (!built.ok) return blocked(session, built.reason);
        return ok({
            session: setState({
                ...session, status: 'lobby', challenge: built.setup.challenge, challengeSetup: built.setup, challengeStart: start, challengeState, challengeCandidates: [],
                lobby: { challenge: true, heroId: built.setup.controlledId, controllable: [built.setup.controlledId] }, skipped: [],
            }),
        });
    }

    function setIntimateOptions(choice = {}) {
        if (!isChallenge(current) || current.status !== 'lobby' || !current.challengeStart?.intimate) return fail('combat-session-not-ready');
        const mechanic = ['合拍', '主导'].includes(choice.mechanic) ? choice.mechanic : current.challenge.intimate.mechanic;
        const position = ['receive', 'lead'].includes(choice.position) ? choice.position : current.challenge.intimate.position;
        const built = intimateBuild(current.challengeStart, current.challengeState, { mechanic, position });
        if (!built.ok) return fail(built.reason);
        setState({ ...current, challenge: built.setup.challenge, challengeSetup: built.setup });
        notify();
        return ok();
    }

    async function prepareChallenge(session, signal) {
        if (session.start?.intimate === true) return prepareIntimate(session);
        setState({ ...session, status: 'preparing' });
        const challengeState = resolveOption(challengeOptions.state) || null;
        const start = { ...session.start, allowEscape: resolveOption(challengeOptions.allowEscape) !== false };
        let picked = { foe: '', name: '' };
        try {
            picked = await chooseChallengeFoe({ event: start.event, domain: start.domain, request, llm: resolveOption(options.llm), signal, retryDelays: [] });
        } catch { /* 副模型出错时沿用本地难关 */ }
        if (signal?.aborted || !isCurrent(session)) { setState({ status: 'idle' }); return fail('request-stale'); }
        const challengeStart = { ...start, ...(picked.source === 'llm' ? { foe: picked.foe, foeName: picked.name } : {}) };
        const built = buildChallengeSetup({ start: challengeStart, state: challengeState, user: { name: getUserName() }, allies: [] });
        if (!built.ok) return blocked(session, built.reason);
        const candidates = eligibleChallengeAllies({ present: challengeState?.present, favors: challengeState?.favors, exclude: challengeStart.counterpart ? [challengeStart.counterpart] : [] });
        return ok({
            session: setState({
                ...session, status: 'lobby', challenge: built.setup.challenge, challengeSetup: built.setup, challengeStart, challengeState, challengeCandidates: candidates,
                lobby: { challenge: true, heroId: built.setup.controlledId, controllable: [built.setup.controlledId] }, skipped: [],
            }),
        });
    }

    // 大厅里挑协助者：只拒收不修正，名单按在场与好感校验后重建建局；最多两名。
    function pickChallengeAllies(names) {
        if (!isChallenge(current) || current.status !== 'lobby' || !current.challengeStart) return fail('combat-session-not-ready');
        const built = buildChallengeSetup({ start: current.challengeStart, state: current.challengeState, user: { name: getUserName() }, allies: Array.isArray(names) ? names : [] });
        if (!built.ok) return fail(built.reason);
        setState({ ...current, challenge: built.setup.challenge, challengeSetup: built.setup });
        notify();
        return ok({ rejected: built.allies.rejected });
    }

    // 奖励候选写进账本（只写 offer 类条目）
    async function writeOffers(generated) {
        const offers = generationWrites(generated, { createdAt: now() }).entries.filter((entry) => entry.type === 'offer');
        if (!offers.length) return { ok: true };
        let written;
        try {
            written = await ledger.append(offers);
        } catch {
            written = null;
        }
        return written?.ok === true ? written : { ok: false, reason: 'combat-offer-write-failed' };
    }

    // 奖励生成失败时的重试（只在大厅阶段）
    async function retryReward({ signal } = {}) {
        if (current.status !== 'lobby' || current.reward?.status !== 'failed') return fail('combat-reward-not-retryable');
        if (rewardRetryTask) return rewardRetryTask;
        const task = runRewardRetry(identityOf(current), signal);
        rewardRetryTask = task;
        try {
            return await task;
        } finally {
            if (rewardRetryTask === task) rewardRetryTask = null;
            notify();
        }
    }

    async function runRewardRetry(session, signal) {
        const previous = current.reward;
        const applyReward = (reward) => {
            if (current.status !== 'lobby' || current.combatId !== session.combatId) return fail('request-stale');
            setState({ ...current, reward });
            return signal?.aborted || !isCurrent(session) ? fail('request-stale') : ok();
        };
        setState({ ...current, reward: { ...previous, status: 'pending' } });
        notify();
        let ledgerState = await ledger.effectiveState();
        if (!ledgerState.ok) return applyReward({ ...previous, reason: ledgerState.reason });
        const userName = getUserName();
        const rewardPlan = ledgerState.offers?.has(session.combatId) ? null : planReward(ledgerState, session, userName, difficultyOf());
        let failure = '';
        if (rewardPlan?.entity) {
            const names = [userName, ...session.start.allies, ...session.start.enemies.map((enemy) => enemy.name)];
            const context = await withStoryContext({ encounter: session.start.encounter, tier: session.start.tier, protagonist: userName }, options.readStoryContext, { names, signal });
            const generated = await generateWithRetry([rewardPlan.entity], {
                request, llm: resolveOption(options.llm), signal, classes: ledgerState.classes, now: now(), context, retryDelays: options.retryDelays,
            });
            if (generated.reason === 'request-stale' || signal?.aborted) return applyReward(previous);
            failure = rewardFailureReason(generated) || (await writeOffers(generated)).reason || '';
            // 只有写过奖励候选才需要重读
            ledgerState = await ledger.effectiveState();
        }
        return applyReward(ledgerState.ok ? rewardStatus(ledgerState, session.combatId, rewardPlan?.plan, failure) : { ...previous, reason: ledgerState.reason });
    }

    // ---- 开战与出牌 ----
    function startChallenge() {
        const setup = { rulesVersion: COMBAT_RULES.version, ...current.challengeSetup };
        const seed = seedFor(current.combatId);
        const battle = createBattle(setup, seed);
        if (!battle.ok) return fail('combat-setup-invalid', { error: battle.error });
        const record = { v: SESSION_VERSION, combatId: current.combatId, anchor: current.anchor, seed, setup, actions: [], encounter: current.start.event, tiers: [], expTargets: [] };
        if (!writeSession(record)) return fail('combat-session-save-failed');
        const intimateTrace = setup.challenge?.intimate ? foldIntimateTrace(initIntimateTrace(), battle.state, battle.events) : null;
        setState({ ...current, status: 'battle', record, battle: battle.state, events: battle.events, challengeResult: null, ...(intimateTrace ? { intimateTrace } : {}) });
        return ok({ events: battle.events });
    }

    function start({ controlledId } = {}) {
        if (current.status !== 'lobby') return fail('combat-session-not-ready');
        if (!isCurrent(current)) return floorChanged();
        if (isChallenge(current)) return startChallenge();
        const built = buildSetup(current.lobby, current.start, { controlledId, difficulty: difficultyOf(), userName: getUserName(), combatId: current.combatId });
        if (!built.ok) return fail(built.reason);
        const seed = seedFor(current.combatId);
        const battle = createBattle(built.setup, seed);
        if (!battle.ok) return fail('combat-setup-invalid', { error: battle.error });
        const record = {
            v: SESSION_VERSION, combatId: current.combatId, anchor: current.anchor, seed, setup: built.setup, actions: [],
            encounter: current.start.encounter, tiers: built.tiers, expTargets: built.expTargets,
            ...(current.theme ? { theme: current.theme } : {}), ...(built.itemOwner ? { itemOwner: built.itemOwner } : {}),
        };
        if (!writeSession(record)) return fail('combat-session-save-failed');
        setState({ ...current, status: 'battle', record, battle: battle.state, events: battle.events });
        return ok({ events: battle.events, ...(built.awakenDropped ? { awakenDropped: built.awakenDropped } : {}) });
    }

    function act(action, meta = {}) {
        if (current.status !== 'battle') return fail('combat-session-not-in-battle');
        if (!isCurrent(current)) return floorChanged();
        const applied = applyAction(current.battle, action);
        if (!applied.ok) return fail(applied.error.reason, { error: applied.error });
        const surrender = action.type === 'escape' && meta.stop !== true && current.record.setup.challenge?.intimate?.mechanic === '主导';
        const record = { ...current.record, actions: [...current.record.actions, action], ...(surrender || current.record.surrendered ? { surrendered: true } : {}) };
        if (!writeSession(record)) return fail('combat-session-save-failed');
        const intimateTrace = record.setup.challenge?.intimate
            ? { ...foldIntimateTrace(current.intimateTrace || initIntimateTrace(), applied.state, applied.events), surrendered: record.surrendered === true } : null;
        const end = isChallenge(current) ? challengeEnd(applied.state, record.setup, applied.events, intimateTrace) : { state: applied.state, events: applied.events, result: null };
        setState({ ...current, record, battle: end.state, events: [...current.events, ...end.events], status: end.state.outcome ? 'ended' : 'battle', ...(isChallenge(current) ? { challengeResult: end.result } : {}), ...(intimateTrace ? { intimateTrace } : {}) });
        if (end.state.outcome) {
            persist.flush(); // 战斗结束的记录马上落盘
            const report = buildReport(current);
            if (report.ok) {
                const final = { ...reportItemOf(report), ...usedPart(current), ...woundPart(current) };
                setState({ ...current, final });
                finalWrite = saveResult(identityOf(current), final, current.battle);
                if (final.result === 'win' && final.noLoot !== true && !isChallenge(current)) loadFlip().catch(() => {});
            }
        }
        return ok({ events: end.events });
    }

    // ---- 战报发送 ----
    // 战报已在聊天里（或刚发送成功）后的收尾：清发件箱与会话记录、扣物品、记伤势、扫描账本
    async function settleReport(report, reportMessageId) {
        const intimateDone = current.record?.setup?.challenge?.intimate || current.challenge?.intimate;
        if (intimateDone && typeof challengeOptions.markIntimate === 'function') { try { challengeOptions.markIntimate(intimateDone.eventKey); } catch { /* 记录失败不影响战报 */ } }
        setOutbox(current.combatId, null);
        clearSession();
        let consumeResult = null;
        const used = Array.isArray(report.used) ? report.used : usedItems(current.record, current.battle);
        const owner = report.character || current.record?.itemOwner || current.record?.setup?.controlledId;
        const reportSwipeId = () => swipeIdOf(getChat()[reportMessageId]);
        if (Number.isInteger(reportMessageId) && used.length && owner && ledger?.append) {
            const swipeId = reportSwipeId();
            const entries = used.map((item, index) => {
                const anchor = { messageId: reportMessageId, swipeId, tagHash: CONSUME_TAG_HASH, occurrence: index };
                return { id: ledgerEntryId('consume', owner, anchor), type: 'consume', character: owner, anchor, payload: { itemId: item.itemId, count: item.count, reportId: report.reportId }, createdAt: now() };
            });
            try {
                consumeResult = await ledger.append(entries);
            } catch {
                consumeResult = { ok: false, reason: 'combat-consume-write-failed' };
            }
        }
        let woundResult = null;
        const wounds = Array.isArray(report.wounds) ? report.wounds : woundPart(current).wounds || [];
        if (Number.isInteger(reportMessageId) && wounds.length && ledger?.append) {
            const swipeId = reportSwipeId();
            const entries = wounds.map((wound, index) => {
                const anchor = { messageId: reportMessageId, swipeId, tagHash: WOUND_TAG_HASH, occurrence: index };
                return { id: ledgerEntryId('wound', wound.character, anchor), type: 'wound', character: wound.character, anchor, payload: { hp: wound.hp, maxHp: wound.maxHp, down: wound.down === true, reportId: report.reportId }, createdAt: now() };
            });
            try {
                woundResult = await ledger.append(entries);
            } catch {
                woundResult = { ok: false, reason: 'combat-wound-write-failed' };
            }
        }
        let growthResult = null;
        const growths = Array.isArray(report.battleGrowth) ? report.battleGrowth : battleGrowthPart(current).battleGrowth || [];
        if (Number.isInteger(reportMessageId) && growths.length && ledger?.append) {
            const swipeId = reportSwipeId();
            const entries = growths.map((growth, index) => {
                const anchor = { messageId: reportMessageId, swipeId, tagHash: BATTLE_GROWTH_TAG_HASH, occurrence: index };
                return { id: ledgerEntryId('battle-growth', growth.character, anchor), type: 'battle-growth', character: growth.character, anchor, payload: { cards: growth.cards.map(growthCard), hpMax: growth.hpMax, reportId: report.reportId }, createdAt: now() };
            });
            try {
                growthResult = await ledger.append(entries);
            } catch {
                growthResult = { ok: false, reason: 'combat-battle-growth-write-failed' };
            }
        }
        // 规则 v6 G5g：普通战斗胜利发积分（挑战与亲密对决不发；敌人撤离的胜利照发），锚定胜利战报楼，随楼层回退撤销。
        // 记在本场受控单位（账本角色 ID）名下；不是主角时账本重放按 combat-points-not-protagonist 拒收。
        let pointsResult = null;
        const intimate = current.record?.setup?.challenge?.intimate || current.challenge?.intimate;
        const hero = current.record?.setup?.controlledId;
        const combatId = current.combatId;
        if (report.result === 'win' && !isChallenge(current) && !intimate && Number.isInteger(reportMessageId) && ledger?.append && typeof hero === 'string' && hero && typeof combatId === 'string' && combatId) {
            const tier = battleTierOf(current.record?.tiers);
            // 规则 v6 G3d：弱敌战积分为定额的 1/4，遗物加成不触发。
            const weak = current.record?.setup?.weakFoes === true;
            const amount = weak ? weakBattlePoints(tier, combatId) : battlePoints(tier, combatId);
            // G5f-4c：按写入此刻持有的加金币遗物特性记加成快照（规则 v6 战斗才有）；读不到账本时不带加成，定额照发。
            let bonus = null;
            if (!weak && (current.record?.setup?.rulesVersion ?? 0) >= 6 && typeof ledger.effectiveState === 'function') {
                try {
                    const owned = await ledger.effectiveState({ raw: true });
                    const traits = owned?.ok ? owned.characters?.get(hero)?.traits : null;
                    bonus = winPointsBonus(heldOffCombat(traits, 'win-points'), amount);
                } catch { bonus = null; }
            }
            const anchor = { messageId: reportMessageId, swipeId: reportSwipeId(), tagHash: BATTLE_POINTS_TAG_HASH, occurrence: 0 };
            const entry = { id: ledgerEntryId('battle-points', hero, anchor), type: 'battle-points', character: hero, anchor, payload: { amount, tier, combatId, reportId: report.reportId, ...(weak ? { weak: true } : {}), ...(bonus ? { bonus } : {}) }, createdAt: now() };
            try {
                pointsResult = await ledger.append([entry]);
            } catch {
                pointsResult = { ok: false, reason: 'combat-battle-points-write-failed' };
            }
        }
        if (isChallenge(current) && Number.isInteger(reportMessageId) && ledger?.append) {
            const card = challengeSummary(current)?.card;
            if (card) {
                const hero = profileIdFor('deck-character', getUserName());
                const anchor = { messageId: reportMessageId, swipeId: swipeIdOf(getChat()[reportMessageId]), tagHash: CHALLENGE_REWARD_TAG_HASH, occurrence: 0 };
                try { await ledger.append([{ id: ledgerEntryId('learn', hero, anchor), type: 'learn', character: hero, anchor, payload: { card, merge: true }, createdAt: now() }]); } catch { /* 经验牌入库失败不影响战报收尾 */ }
            }
        }
        let scan = null;
        if (Number.isInteger(reportMessageId) && ledger?.scan && !isChallenge(current)) {
            try {
                scan = await ledger.scan({ messageIds: [reportMessageId] });
            } catch {
                scan = { ok: false, reason: 'combat-ledger-scan-failed' };
            }
        }
        setState({ ...identityOf(current), status: 'done', report });
        return ok({ messageId: reportMessageId ?? null, scan, ...(consumeResult ? { consume: consumeResult } : {}), ...(woundResult ? { wound: woundResult } : {}), ...(growthResult ? { battleGrowth: growthResult } : {}), ...(pointsResult ? { battlePoints: pointsResult } : {}) });
    }

    // 把战报发进聊天：战报楼已存在则直接收尾；发送失败进入 send-failed 可重试
    async function deliverReport(report) {
        const existing = findReportFloor(getChat(), current.anchor.messageId, report.reportId);
        if (existing >= 0) return settleReport(report, existing);
        if (sending) return fail('combat-report-sending');
        if (typeof send !== 'function') {
            setState({ ...current, status: 'send-failed', report });
            return fail('combat-send-unavailable');
        }
        sending = true;
        let sent;
        try {
            // 回执按战报 ID 认领：酒馆落楼时正则 / 宏可能改写正文，全文相等会等不到回执
            sent = await send(report.text, { matches: (body) => reportIdOf(body) === report.reportId });
        } catch {
            sent = { ok: false, reason: 'combat-send-error' };
        } finally {
            sending = false;
        }
        if (sent?.ok === true) {
            const messageId = Number(sent.messageId);
            return settleReport(report, Number.isInteger(messageId) ? messageId : null);
        }
        setState({ ...current, status: 'send-failed', report });
        return fail('combat-report-send-failed', { detail: sent?.reason || null });
    }

    async function finish() {
        if (current.status !== 'ended') return fail('combat-session-not-ended');
        if (!isCurrent(current)) return floorChanged();
        let report = current.final;
        if (!report) {
            const built = buildReport(current);
            if (!built.ok) return fail(built.reason);
            report = { ...reportItemOf(built), ...usedPart(current), ...woundPart(current), ...battleGrowthPart(current) };
        }
        const combatId = current.combatId;
        if (finalWrite) await finalWrite;
        if (!resultsSaved.has(combatId) && current.combatId === combatId) await saveResult(identityOf(current), report, current.battle);
        if (current.status !== 'ended' || current.combatId !== combatId) return fail('combat-session-not-ended');
        const looted = isChallenge(current) ? { ok: true, item: report } : await resolveLoot(report);
        if (!looted.ok) return fail(looted.reason);
        if (current.status !== 'ended' || current.combatId !== combatId) return fail('combat-session-not-ended');
        report = looted.item;
        setState({ ...current, final: report });
        if (flipLoadedFor(combatId)) setState({ ...current, flip: viewOfFlip(flipContext) });
        return setOutbox(current.combatId, report) ? deliverReport(report) : fail('combat-outbox-save-failed');
    }
    const flipLoadedFor = (combatId) => flipContext?.combatId === combatId && current.flip?.status === 'ready';

    async function retrySend() {
        if (current.status !== 'send-failed' || !current.report) return fail('combat-nothing-to-send');
        if (!isCurrent(current)) return floorChanged();
        if (!resultsSaved.has(current.combatId)) await saveResult(identityOf(current), current.report, current.battle);
        if (current.status !== 'send-failed' || !current.report) return fail('combat-nothing-to-send');
        const combatId = current.combatId;
        const looted = isChallenge(current) ? { ok: true, item: current.report } : await resolveLoot(current.report);
        if (!looted.ok) return fail(looted.reason);
        if (current.status !== 'send-failed' || current.combatId !== combatId) return fail('combat-nothing-to-send');
        if (looted.item !== current.report) {
            if (!setOutbox(combatId, looted.item)) return fail('combat-outbox-save-failed');
            setState({ ...current, report: looted.item, ...(current.final ? { final: looted.item } : {}) });
            if (flipLoadedFor(combatId)) setState({ ...current, flip: viewOfFlip(flipContext) });
        }
        return deliverReport(current.report);
    }

    // 放弃战斗：发一条「跳过」消息并清掉会话记录（abandon）
    async function skip() {
        if (!['lobby', 'blocked'].includes(current.status) || isChallenge(current)) return fail('combat-session-not-skippable');
        if (!isCurrent(current)) return floorChanged();
        if (sending || typeof send !== 'function') return fail(sending ? 'combat-report-sending' : 'combat-send-unavailable');
        sending = true;
        let sent;
        try {
            sent = await send(COMBAT_SKIP_TEXT);
        } catch {
            sent = { ok: false };
        } finally {
            sending = false;
        }
        if (sent?.ok !== true) return fail('combat-skip-send-failed', { detail: sent?.reason || null });
        clearSession();
        setState({ ...identityOf(current), status: 'skipped' });
        return ok();
    }

    // 重新开始（v0.39.2）：对局中，或败北 / 撤退出结果后，用本场同一份 setup 换新种子从头打；胜利后不给（战利品已按本场生成）。
    // 开战楼聊天记录里已写的结果先撤掉（写成 null），撤不掉就不重开，免得续战时读到旧战报；新对局存档写入成功后才切换。
    async function restart() {
        const allowed = () => !isChallenge(current) && (current.status === 'battle' || (current.status === 'ended' && current.battle?.outcome !== 'victory'));
        if (!allowed()) return fail('combat-restart-unavailable');
        if (!isCurrent(current)) return floorChanged();
        const combatId = current.combatId;
        const unchanged = () => current.combatId === combatId && allowed();
        if (finalWrite) await finalWrite;
        if (!unchanged()) return fail('combat-restart-unavailable');
        const saved = readChatRecord(current);
        if (!saved.ok) return fail(saved.reason);
        if (saved.value?.result) {
            const written = await writeChatRecord(identityOf(current), { result: null });
            if (!written.ok) return fail('combat-restart-record-failed', { detail: written.reason });
            if (!unchanged()) return fail('combat-restart-unavailable');
        }
        resultsSaved.delete(combatId);
        const restarts = (Number.isInteger(current.record?.restarts) ? current.record.restarts : 0) + 1;
        const seed = seedFor(`${combatId}#${restarts}`);
        const battle = createBattle(current.record.setup, seed);
        if (!battle.ok) return fail('combat-setup-invalid', { error: battle.error });
        const { flip: _flip, ...kept } = current.record;
        const record = { ...kept, seed, actions: [], restarts };
        if (!writeSession(record)) return fail('combat-session-save-failed');
        persist.flush();
        flipContext = null;
        finalWrite = null;
        const { final: _final, flip: _flipView, report: _report, ...rest } = current;
        setState({ ...rest, status: 'battle', record, battle: battle.state, events: battle.events });
        return ok({ events: battle.events });
    }

    // 托管：沿用同伴出牌策略替主角出牌，没有可出的牌就结束回合；结算与手动完全相同。
    function autoPlay() {
        if (!isChallenge(current)) return fail('combat-auto-unavailable');
        if (current.status === 'lobby') {
            const started = start();
            if (!started.ok) return started;
        }
        for (let step = 0; step < AUTO_STEP_LIMIT && current.status === 'battle'; step += 1) {
            const pick = chooseAllyPlay(current.battle, current.battle.controlledId);
            let result = pick ? act({ type: 'play', ...pick }) : null;
            if (!result?.ok) result = act({ type: 'end-turn' });
            if (!result.ok) return result;
        }
        return current.status === 'ended' ? ok() : fail('combat-auto-stalled');
    }

    // 放弃：记为放弃结局并发出战报，代价由结算按半数处理。
    async function abandon() {
        if (!isChallenge(current) || !['lobby', 'battle'].includes(current.status)) return fail('combat-abandon-unavailable');
        if (current.status === 'lobby') {
            const started = start();
            if (!started.ok) return started;
        }
        const escaped = act({ type: 'escape' }, { stop: true });
        return escaped.ok ? finish() : escaped;
    }

    const afterResume = () => {
        if (canFlip()) loadFlip().catch(() => {});
        return ok();
    };

    // 恢复：按会话记录（种子+动作序列）重放战斗，或回到待发送/已完成状态
    function resume() {
        const outbox = readOutbox();
        const saved = readSession();
        if (!saved.ok) return fail(saved.reason);
        if (!saved.value) return outbox.ok ? ok({ session: setState({ status: 'idle' }), outbox: Object.keys(outbox.value) }) : fail(outbox.reason);
        const record = saved.value;
        if (record.v !== SESSION_VERSION || !isCompatibleRulesVersion(record.setup?.rulesVersion)) {
            setState({ combatId: record.combatId, anchor: record.anchor, status: 'stale', reason: 'combat-rules-version-mismatch' });
            return fail('combat-rules-version-mismatch');
        }
        const located = locate(record.anchor?.messageId, record.setup?.challenge ? { combat: false, challenge: true } : kindsNow());
        // 聊天还没载入到战斗楼（刷新、切聊天时楼层晚于聊天 id 到位）：不算楼层被改，保留存档，等聊天载入后再恢复。
        if (!located.ok && located.reason === 'combat-floor-missing' && getChat().length <= Number(record.anchor?.messageId)) {
            setState({ status: 'idle' });
            return fail('combat-chat-not-ready');
        }
        const session = {
            combatId: record.combatId, anchor: record.anchor, start: located.start, reportId: reportIdFor(record.combatId), chatId: getChatId(),
            ...(isEnemyArtTheme(record.theme) ? { theme: record.theme } : {}), ...(record.setup?.challenge ? { kind: 'challenge' } : {}),
        };
        if (!located.ok || !sameAnchor(located.anchor, record.anchor) || located.combatId !== record.combatId) {
            current = session;
            return floorChanged();
        }
        if (findReportFloor(getChat(), record.anchor.messageId, session.reportId) >= 0) {
            clearSession();
            if (outbox.ok && outbox.value[record.combatId]) setOutbox(record.combatId, null);
            return ok({ session: setState({ ...session, status: 'done' }) });
        }
        const chatRecord = readChatRecord(session);
        if (!chatRecord.ok) return blocked(session, chatRecord.reason);
        if (chatRecord.value?.result) {
            resultsSaved.add(record.combatId);
            setState({ ...session, status: 'send-failed', record, report: reportItemOf(chatRecord.value.result) });
            return afterResume();
        }
        if (outbox.ok && outbox.value[record.combatId]) {
            setState({ ...session, status: 'send-failed', record, report: outbox.value[record.combatId] });
            return afterResume();
        }
        const replayed = replayBattle(record.setup, record.seed, record.actions);
        if (replayed.ok) {
            const resumedTrace = record.setup?.challenge?.intimate ? replayIntimateTrace(record.setup, record.seed, record.actions, record.surrendered === true) : null;
            const end = isChallenge(session) ? challengeEnd(replayed.state, record.setup, replayed.events, resumedTrace) : { state: replayed.state, events: replayed.events, result: null };
            setState({
                ...session, status: end.state.outcome ? 'ended' : 'battle', record, battle: end.state, events: end.events, ...(resumedTrace ? { intimateTrace: resumedTrace } : {}),
                ...(isChallenge(session) ? { challenge: record.setup.challenge, challengeResult: end.result } : {}),
            });
            return afterResume();
        }
        setState({ ...session, status: 'stale', reason: 'combat-replay-failed', error: replayed.error });
        return fail('combat-replay-failed', { error: replayed.error });
    }

    // 复位到空闲（不动存储里的记录），顺手把待写的落盘
    function reset() {
        flipContext = null;
        persist.flush();
        setState({ status: 'idle' });
        return ok();
    }

    return {
        prepare, start, act, autoPlay, abandon, pickChallengeAllies, setIntimateOptions, finish, retrySend, retryReward, loadFlip, flip, choose, pickCard, pickPurge, reroll, skip, restart, resume, reset, subscribe, state: snapshot,
        // 以下为写盘节流新增：立即落盘、写盘统计、释放监听器
        flushPersist,
        getPersistStats: () => ({ ...persist.stats, pending: persist.hasPending() }),
        dispose: () => persist.dispose(),
    };
}
