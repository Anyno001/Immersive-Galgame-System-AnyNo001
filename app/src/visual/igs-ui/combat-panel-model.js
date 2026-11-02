import { canAfford, cardView, computeBlock, computeDamage, describeIntent, effectsNeedTarget, livingIds, opposite } from '../../combat/battle-state.js';
import { actionProgress, isWhipping, targetSpec, upcomingActors } from '../../combat/engine.js';
import { combatFeats } from '../../combat/feats.js';
import { COMBAT_RULES, cardCopyLimit } from '../../combat/rules.js';
import { hash32 } from '../../combat/random.js';
import { enemyArtKeyFor } from '../../combat/enemy-art.js';
import { AWAKEN_TYPE_NAMES, injuryLevel } from '../../combat/report.js';
import { CARD_TYPE_LABELS, cardArtSvg, describeEffectParts, describeEffects, describeKeywordParts, describeTrigger } from './combat-card-art.js';
import { cardMotifSvg } from './combat-card-motifs.js';
import { scalingMarks } from '../../combat/card-scaling.js';
import { ABILITY_LABELS } from '../../combat/abilities.js';
import { CHALLENGE_LABELS, challengeStatusName } from '../../combat/challenge-labels.js';

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

// 牌面效果说明片段：换算过的卡沿用 cardScalingView；未换算的卡只在说明里有带注释的关键字（消耗）时给 textParts，其余卡手牌视图形状不变。
export function cardTextView(card) {
    const scaled = cardScalingView(card);
    if (scaled.textParts) return scaled;
    const parts = describeEffectParts(card?.effects);
    return parts.some((p) => p.tip) ? { textParts: parts } : {};
}

// 卡面插槽（窄签与放大牌共用）：主效果数值、单位与加成明细。取第一个伤害 / 格挡 / 回复效果（条件与每回合效果里的不算主效果）。
// value 是含攻击力 / 防御力与虚弱 / 脆弱后的单次数值（不含目标易伤），baseValue 是牌面原值，两者不同时 bonusNote 给出明细；
// 没有这三类效果的牌 value 为 null、unit 为空串。
export function cardSlotView(card, hero) {
    const effects = Array.isArray(card?.effects) ? card.effects : [];
    const main = effects.find((e) => (e.op === 'damage' || e.op === 'block' || e.op === 'heal') && Number.isFinite(e.amount));
    if (!main) return { value: null, unit: '' };
    const baseValue = main.amount;
    const st = hero?.statuses || {};
    if (main.op === 'heal') return { value: baseValue, baseValue, unit: '回复' };
    if (main.op === 'block') {
        const value = computeBlock(hero, baseValue);
        const parts = [`基础 ${baseValue}`];
        if (st.dexterity) parts.push(`${st.dexterity > 0 ? '+' : '-'} 防御力 ${Math.abs(st.dexterity)}`);
        if (st.frail > 0) parts.push('· 脆弱 ×0.75');
        return { value, baseValue, unit: '格挡', ...(value !== baseValue ? { bonusNote: parts.join(' ') } : {}) };
    }
    const value = computeDamage(hero, null, baseValue, main.strengthScale);
    const parts = [`基础 ${baseValue}`];
    const power = (st.strength || 0) * (main.strengthScale || 1);
    if (hero?.damageScale && hero.damageScale !== 1) parts.push(`· 伤害倍率 ×${hero.damageScale}`);
    if (power) parts.push(`${power > 0 ? '+' : '-'} 攻击力 ${Math.abs(power)}`);
    if (st.weak > 0) parts.push('· 虚弱 ×0.75');
    return { value, baseValue, unit: main.target === 'all-enemies' ? '群伤' : '伤害', ...(value !== baseValue ? { bonusNote: parts.join(' ') } : {}) };
}

// 关键字全称（放大牌里的细框文字）：不能打出、固有、保留、虚无、临时与消耗；没有时为空数组。
export function cardKeywordNames(card) {
    const names = [];
    if (card?.unplayable) names.push('不能打出');
    for (const [flag, label] of [['innate', '固有'], ['retain', '保留'], ['ethereal', '虚无']]) if (card?.[flag]) names.push(label);
    if (card?.temp) names.push('临时');
    const exhaust = (list) => (list || []).some((e) => e.op === 'exhaust-self' || (Array.isArray(e.then) && exhaust(e.then)));
    if (exhaust(card?.effects)) names.push('消耗');
    return names;
}

// 战斗面板的纯视图模型：会话快照 → 战前 / 对局 / 结算所需字段；不操作 DOM。
// 是否可出牌只以引擎 legalActions 为准，界面不另算规则。
export const COMBAT_STATUS_NAMES = Object.freeze({ vulnerable: '易伤', weak: '虚弱', strength: '攻击力', dexterity: '防御力', poison: '中毒', regen: '再生', thorns: '荆棘', intangible: '无形', 'no-draw': '禁抽', endure: '不屈', artifact: '人工制品', frail: '脆弱' });
export const COMBAT_INTENT_LABELS = Object.freeze({ attack: '攻击', defend: '防御', buff: '强化', debuff: '削弱', heal: '治疗', special: '特殊' });
export const COMBAT_OUTCOME_LABELS = Object.freeze({ victory: '胜利', defeat: '败北', escape: '撤退' });
// 日常挑战只换显示：结局名取自说法映射表，意图类别与剩余意志的描述在这里补全，内部字段与引擎不变。
export const CHALLENGE_OUTCOME_LABELS = Object.freeze({ victory: CHALLENGE_LABELS.victory, defeat: CHALLENGE_LABELS.defeat, escape: CHALLENGE_LABELS.escape });
export const CHALLENGE_INTENT_LABELS = Object.freeze({ attack: '施压', defend: '拖延', buff: '强化', debuff: '刁难', heal: '调整', special: '特殊' });
const CHALLENGE_WORDS = Object.freeze([
    ...Object.keys(COMBAT_STATUS_NAMES).filter((key) => challengeStatusName(key)).map((key) => [COMBAT_STATUS_NAMES[key], challengeStatusName(key)]),
    ['伤害', CHALLENGE_LABELS.damage], ['格挡', CHALLENGE_LABELS.block], ['生命', CHALLENGE_LABELS.hp], ['敌人', CHALLENGE_LABELS.enemy],
]);
const challengeWords = (text) => (typeof text === 'string' ? CHALLENGE_WORDS.reduce((out, [from, to]) => out.split(from).join(to), text) : text);
const willWords = (unit) => {
    const ratio = unit.maxHp ? unit.hp / unit.maxHp : 0;
    return ratio >= 0.6 ? '从容' : ratio >= 0.3 ? '吃力' : '力竭';
};
// 战斗成就牌子：标题与台词（判定见 combat/feats.js）。
export const COMBAT_FEAT_LABELS = Object.freeze({
    'honor-kill': Object.freeze({ title: '荣誉击杀', line: '计划通り——最后一滴血，分毫不差。' }),
    overkill: Object.freeze({ title: '超杀', line: '堕落，忙死他卡多！' }),
});
export const COMBAT_REWARD_CARD_COUNT = 3;
export const COMBAT_ORDER_COUNT = 6;
const FX_HIT_LIMIT = 6;

const statusList = (statuses, challenge = false) => Object.entries(statuses || {}).filter(([, v]) => v > 0)
    .map(([key, stacks]) => ({ key, label: (challenge && challengeStatusName(key)) || COMBAT_STATUS_NAMES[key] || key, stacks }));

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

function intentView(state, id, challenge = false) {
    const intent = describeIntent(state, id);
    if (!intent) return null;
    return { name: intent.name, kind: intent.intent, label: (challenge ? CHALLENGE_INTENT_LABELS : COMBAT_INTENT_LABELS)[intent.intent] || '', ...(challenge ? { unit: CHALLENGE_LABELS.damage } : {}), damage: intent.damage, targetName: intent.targetId ? state.units[intent.targetId]?.name || '' : '' };
}

export function unitView(state, id, challenge = false) {
    const u = state.units[id];
    return {
        id, name: u.name, side: u.side, kind: u.kind, hp: Math.max(0, u.hp), maxHp: u.maxHp, block: u.block, alive: u.alive,
        controlled: id === state.controlledId, statuses: statusList(u.statuses, challenge),
        intent: u.side === 'enemy' ? intentView(state, id, challenge) : null,
        // 敌人外观格位（setup 带 art 时）：面板据此在通用敌人图集里取图；我方与旧战斗不带该字段。
        ...(u.side === 'enemy' && typeof u.art === 'string' && u.art ? { art: u.art } : {}),
    };
}

// v4 待选阶段：引擎 state.pending 属于操控角色时返回 { kind 用途, count 选几张, options 候选手牌实例 }，否则 null。
export function pendingChoice(state) {
    const p = state?.pending;
    return p && p.unitId === state.controlledId && Array.isArray(p.options)
        ? { kind: p.kind, count: p.count, options: p.options.slice() } : null;
}

// v4 人物特性圆球（助手 10-28）：只放操控角色的主动特性（固有人物技能与抽到的主动，最多 2 个），固有在前；旧战斗没有 traits 时只有人物技能一颗。
// 费用、本回合已用、可用（来自 legal，抽到的带 skillId）与选目标信息，与人物技能同口径；icon 按名称与效果模糊匹配卡面纹样。被动等其他技能在头像详情里（unitDetailView）。
function traitOrbs(state, hero, legal) {
    const list = Array.isArray(hero.traits) ? hero.traits
        : hero.heroSkill ? [{ id: hero.heroSkill.id, kind: 'active', innate: true, name: hero.heroSkill.name }] : [];
    return list.filter((t) => t.kind === 'active').map((t) => {
        const base = { id: t.id, kind: t.kind, name: t.name || '', rarity: t.rarity || '', innate: t.innate === true, origin: t.origin || '' };
        const skill = t.skill || hero.heroSkill;
        if (!skill) return null;
        const skillId = t.skill ? t.skill.id : undefined;
        const acts = legal.filter((a) => a.type === 'hero-skill' && a.skillId === skillId);
        const targets = acts.map((a) => a.targetId).filter((x) => x !== undefined);
        return {
            ...base, ...(skillId ? { skillId } : {}), cost: t.skill ? t.skill.cost : COMBAT_RULES.heroSkillCost, text: describeEffects(skill.effects),
            used: t.skill ? (hero.traitSkillsUsed || []).includes(skillId) : hero.heroSkillUsed === true, needsTarget: effectsNeedTarget(skill.effects),
            targets, affects: targets.length ? [] : affectedIds(state, hero, skill.effects), usable: acts.length > 0,
            icon: cardMotifSvg({ id: skill.id, name: base.name || skill.name, type: 'skill', effects: skill.effects }),
        };
    }).filter(Boolean);
}

// 单位详情（助手 10-28：点头像阅读）：卡组角色的被动按人物特性（个人被动与抽到的被动特性）/ 职业 / 装备分组（setup 的被动带 source；旧战斗没有时归入「被动」），
// 非操控的卡组角色另列主动；技能角色与敌人列技能（意图、绝招、冷却）、被动与常驻效果（source 为 affix），另列尚未触发的阶段。rarity 为 innate（固有）或特性稀有度。
const PASSIVE_SOURCES = Object.freeze(['personal', 'trait', 'class', 'gear']);
const passiveItem = (p, t) => ({ name: p.name || t?.name || '', meta: describeTrigger(p.trigger, p.cardType), text: describeEffects(p.effects),
    ...(t ? { rarity: t.innate ? 'innate' : t.rarity || '' } : {}) });
const skillItem = (s) => ({ name: s.name || '', text: describeEffects(s.effects),
    meta: [COMBAT_INTENT_LABELS[s.intent] || '', s.ultimate ? '绝招' : '', s.cooldown ? `冷却 ${s.cooldown} 回合` : ''].filter(Boolean).join(' · ') });
export function unitDetailView(state, unitId) {
    const u = state?.units?.[unitId];
    if (!u) return null;
    const groups = [];
    const add = (label, items) => { if (items.length) groups.push({ label, items }); };
    const traitOf = new Map((u.traits || []).filter((t) => t.passiveId).map((t) => [t.passiveId, t]));
    const sourceOf = (p) => p.source || (traitOf.has(p.id) ? (traitOf.get(p.id).innate ? 'personal' : 'trait') : 'other');
    const passives = u.passives || [];
    if (u.kind === 'deck') {
        if (unitId !== state.controlledId) {
            add('主动', traitOrbs(state, u, []).map((t) => ({ name: t.name, meta: `消耗 ${t.cost} 点能量`, text: t.text, rarity: t.innate ? 'innate' : t.rarity })));
        }
        const of = (...sources) => passives.filter((p) => sources.includes(sourceOf(p)));
        add('人物特性', of('personal', 'trait').map((p) => passiveItem(p, traitOf.get(p.id))));
        add('职业', of('class').map((p) => passiveItem(p)));
        add('装备', of('gear').map((p) => passiveItem(p)));
        add('被动', passives.filter((p) => !PASSIVE_SOURCES.includes(sourceOf(p))).map((p) => passiveItem(p)));
    } else {
        add('技能', (u.skills || []).map(skillItem));
        add('被动', passives.filter((p) => p.source !== 'affix').map((p) => passiveItem(p)));
        add('常驻效果', passives.filter((p) => p.source === 'affix').map((p) => passiveItem(p)));
    }
    const phases = (u.phases || []).slice(u.phasesApplied || 0);
    add('阶段', phases.map((ph) => ({ name: `生命低于 ${ph.hpBelowPct}%`, meta: '',
        text: [...(ph.addSkills || []), ...(ph.passives || [])].map((x) => x.name).filter(Boolean).join('、') })));
    return { id: u.id, name: u.name, side: u.side, groups };
}

export function battleView(state, legal = [], { challenge = false } = {}) {
    const hero = state.units[state.controlledId];
    const pile = state.piles[hero.id] || { draw: [], hand: [], discard: [], exhaust: [] };
    const plays = legal.filter((a) => a.type === 'play');
    const choice = pendingChoice(state);
    const choosable = new Set(choice ? choice.options : []);
    const hand = pile.hand.map((inst) => {
        const card = cardView(state, inst);
        if (!card) return null;
        const mine = plays.filter((a) => a.inst === inst);
        const targets = mine.map((a) => a.targetId).filter((t) => t !== undefined);
        // v4：关键字与被弃时说明（keywordParts 带可点注释）、临时牌标记、减费前的原费用；没有时不写字段，旧手牌视图形状不变。
        const keywordParts = describeKeywordParts(card);
        const keywords = keywordParts.map((p) => p.text).join('');
        return {
            inst, id: card.id, name: card.name, type: card.type, cost: card.cost, upgraded: card.upgraded, rarity: card.rarity || '',
            typeLabel: CARD_TYPE_LABELS[card.type] || '', text: describeEffects(card.effects), art: cardArtSvg(card),
            affordable: canAfford(card, hero.energy), needsTarget: effectsNeedTarget(card.effects),
            targets, affects: targets.length ? [] : affectedIds(state, hero, card.effects), playable: mine.length > 0,
            ...(keywords ? { keywords, keywordParts } : {}), ...(card.temp ? { temp: true } : {}),
            // 待选阶段的候选牌；不在待选阶段时不写字段。
            ...(choosable.has(inst) ? { choosable: true } : {}),
            // 费用确有变化时才给原费用（0 费牌被减费仍是 0，不显示）。
            ...(card.baseCost !== undefined && card.baseCost !== card.cost ? { baseCost: card.baseCost } : {}),
            ...cardTextView(card),
            // 卡面插槽：主效果数值与单位（风格化皮肤的窄签与放大牌用）、关键字全称；initial 皮肤不显示这些节点。
            ...cardSlotView(card, hero), keywordNames: cardKeywordNames(card),
        };
    }).filter(Boolean);
    // 同名张数：手牌里同 id 且同升级状态的张数，至少 2 张才给 stack。
    const sameCount = new Map();
    for (const c of hand) { const k = `${c.id}|${c.upgraded ? 1 : 0}`; sameCount.set(k, (sameCount.get(k) || 0) + 1); }
    for (const c of hand) { const n = sameCount.get(`${c.id}|${c.upgraded ? 1 : 0}`); if (n >= 2) c.stack = n; }
    const side = (s) => state.order.filter((id) => state.units[id].side === s).map((id) => unitView(state, id, challenge));
    // 人物技能：可用与否只看 legal 里的 hero-skill 动作；旧档案没有技能时为 null。
    const skillActs = legal.filter((a) => a.type === 'hero-skill' && a.skillId === undefined);
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
    const view = {
        turn: state.turn, phase: state.phase, outcome: state.outcome, energy: hero.energy, energyPerTurn: hero.energyPerTurn,
        piles: { draw: pile.draw.length, discard: pile.discard.length, exhaust: pile.exhaust.length },
        hand, allies: side('ally'), enemies: side('enemy'), heroId: hero.id, heroSkill, awaken,
        // v4 人物特性圆球：操控角色的主动与被动特性（固有在前）。
        traits: traitOrbs(state, hero, legal),
        // 一次性道具：只在 setup 带道具时给出；可用与否只看 legal 里的 item 动作（每回合 1 次、余量 > 0）。
        // targets 为可选目标（对敌方的单体道具为敌人，回复 / 格挡 / 净化为存活的己方单位）；没有可选目标时 affects 为承受方。
        items: state.items ? state.items.list.map((i) => {
            const acts = legal.filter((a) => a.type === 'item' && a.itemId === i.itemId);
            const targets = acts.map((a) => a.targetId).filter((x) => x !== undefined);
            return { itemId: i.itemId, name: i.name, count: i.count, text: describeEffects(i.effects),
                targets, affects: targets.length ? [] : affectedIds(state, hero, i.effects), usable: acts.length > 0 };
        }) : [],
        canEndTurn: legal.some((a) => a.type === 'end-turn'), canEscape: legal.some((a) => a.type === 'escape'),
        // 待选阶段（打出弃牌 / 复制 / 减费且要玩家选牌时）：没有待选时不写字段，旧视图形状不变。
        ...(choice ? { choice } : {}),
        // 行动顺序槽：引擎按行动值推演的接下来几次出手（出牌阶段首位为操控角色），同一单位可出现多次。
        order: upcomingActors(state, COMBAT_ORDER_COUNT).map((id) => ({ id, name: state.units[id].name, side: state.units[id].side, controlled: id === state.controlledId })),
        // 行动条：每个存活单位沿线的进度（0 起点、1 出手点），面板按此定位头像；出牌阶段操控角色停在出手点。
        track: Object.entries(actionProgress(state)).map(([id, p]) => ({ id, p, name: state.units[id].name, side: state.units[id].side, controlled: id === state.controlledId })),
    };
    return challenge ? challengeBattleView(view) : view;
}

// 日常挑战：牌面、技能与道具说明里的战斗词换成日常说法，只改文案字段。
function challengeBattleView(view) {
    const words = (obj, keys) => Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, keys.includes(key) ? challengeWords(value) : value]));
    return {
        ...view,
        hand: view.hand.map((card) => ({
            ...words(card, ['text', 'keywords', 'scaleNote', 'bonusNote']),
            ...(card.textParts ? { textParts: card.textParts.map((part) => ({ ...part, text: challengeWords(part.text), ...(part.tip ? { tip: challengeWords(part.tip) } : {}) })) } : {}),
        })),
        heroSkill: view.heroSkill ? words(view.heroSkill, ['text']) : null,
        items: view.items.map((item) => words(item, ['text'])),
    };
}

// 选中标记：人物技能等待选目标时用这个值占 selected，与卡牌实例 ID（含 #）不会冲突；抽到的主动特性为 `hero-skill:<skillId>`。
export const HERO_SKILL_SELECTION = 'hero-skill';
export const skillSelection = (skillId) => (skillId ? `${HERO_SKILL_SELECTION}:${skillId}` : HERO_SKILL_SELECTION);
export const isSkillSelection = (sel) => sel === HERO_SKILL_SELECTION || (typeof sel === 'string' && sel.startsWith(`${HERO_SKILL_SELECTION}:`));
export const selectionSkillId = (sel) => (isSkillSelection(sel) && sel !== HERO_SKILL_SELECTION ? sel.slice(HERO_SKILL_SELECTION.length + 1) : undefined);

// 选中的主动特性的视图（含 targets 与 affects）：固有人物技能没有 traits 圆球时回落到 heroSkill。
export function selectedSkillView(battle, sel) {
    if (!isSkillSelection(sel)) return null;
    const skillId = selectionSkillId(sel);
    return (battle?.traits || []).find((t) => t.kind === 'active' && t.skillId === skillId)
        || (skillId === undefined ? battle?.heroSkill || null : null);
}

// 道具等待选目标时的选中标记 `item:<itemId>`（与卡牌实例 ID、人物技能标记不冲突）。
export const ITEM_SELECTION = 'item';
export const itemSelection = (itemId) => `${ITEM_SELECTION}:${itemId}`;
export const isItemSelection = (sel) => typeof sel === 'string' && sel.startsWith(`${ITEM_SELECTION}:`);
export const selectionItemId = (sel) => (isItemSelection(sel) ? sel.slice(ITEM_SELECTION.length + 1) : undefined);
// 选中的道具的视图（含 targets 与 affects）。
export function selectedItemView(battle, sel) {
    const itemId = selectionItemId(sel);
    return itemId === undefined ? null : (battle?.items || []).find((i) => i.itemId === itemId) || null;
}

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

// 人物技能 / 主动特性请求 → 合法动作（skillId 缺省为固有人物技能）。规则同出牌：只剩一个目标时自动选中。
export function resolveHeroSkill(legal, targetId, skillId) {
    const acts = (legal || []).filter((a) => a.type === 'hero-skill' && a.skillId === skillId);
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
    // 开战生命（持续伤势与难度上限已计入）：会话没有 vitals（旧会话）时不带字段。
    const vitalsOf = (id) => { const x = lobby.vitals?.[id]; return x ? { hp: x.hp, maxHp: x.maxHp } : {}; };
    const allies = lobby.allies.map((v) => ({ id: v.id, name: v.name, level: v.level, kind: v.kind, className: v.className || '', controllable: lobby.controllable.includes(v.id), ...vitalsOf(v.id) }));
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
    return { encounter: session.start?.encounter || '', tier: encounterTier, tierLabel, heroId: lobby.heroId, allies, enemies, absent: [...lobby.absent], downed: [...(lobby.downed || [])], skipped: [...(session.skipped || [])], ...reward };
}

// events 为本场引擎事件：只用来推导成就，取到成就时才追加 feats（每项带标题与台词）。
export function endView(state, events = [], { challenge = false, summary = null } = {}) {
    if (!state?.outcome) return null;
    const allies = state.order.filter((id) => state.units[id].side === 'ally').map((id) => ({ name: state.units[id].name, injury: challenge ? willWords(state.units[id]) : injuryLevel(state.units[id]) }));
    if (challenge) return { outcome: state.outcome, label: CHALLENGE_OUTCOME_LABELS[state.outcome] || state.outcome, turn: state.turn, allies, ...(summary ? { challengeOutcome: summary.outcome, harvest: harvestView(summary) } : {}) };
    const feats = combatFeats(events, state).map((f) => ({ ...f, ...COMBAT_FEAT_LABELS[f.id] }));
    return { outcome: state.outcome, label: COMBAT_OUTCOME_LABELS[state.outcome] || state.outcome, turn: state.turn, allies, ...(feats.length ? { feats } : {}) };
}

// 圆满后的收获：奖金只写档位词，经验牌给名称与说明；没有收获时为 null。
function harvestView(summary) {
    if (!summary || (!summary.prize && !summary.card)) return null;
    return { prize: summary.prize || '', card: summary.card ? { name: summary.card.name, rarity: summary.card.rarity, cost: summary.card.cost, text: challengeWords(describeEffects(summary.card.effects)) } : null };
}

// 日常挑战的战前视图：主角与难关各一名，结构与 lobbyView 对齐（面板复用同一套对阵画面）；难关不用敌人图集，只显示名称与难度。
export function challengeLobbyView(session) {
    const challenge = session?.challenge;
    const setup = session?.challengeSetup;
    const hero = setup?.units?.find((unit) => unit.side === 'ally');
    const foe = setup?.units?.find((unit) => unit.side === 'enemy');
    if (!challenge || !hero || !foe) return null;
    return {
        challenge: true, encounter: challenge.event, tier: challenge.tier, tierLabel: challenge.tier, domain: challenge.domain, stake: challenge.stake,
        heroId: hero.id,
        allies: [{ id: hero.id, name: hero.name, level: 0, kind: 'deck', className: '', controllable: true, hp: hero.maxHp, maxHp: hero.maxHp },
            ...setup.units.filter((unit) => unit.side === 'ally' && unit.id !== hero.id).map((unit) => ({ id: unit.id, name: unit.name, level: 0, kind: 'deck', className: '', controllable: false }))],
        candidates: (session.challengeCandidates || []).map((item) => ({ name: item.name, picked: challenge.allies.includes(item.name) })), maxAllies: 2,
        enemies: [{ name: foe.name, count: 1, templated: false, tier: 'normal', art: null }],
        absent: [], downed: [], skipped: [], canEscape: setup.canEscape !== false,
    };
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
