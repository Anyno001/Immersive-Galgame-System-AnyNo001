import { canPlay, cardView, computeBlock, computeDamage, describeIntent, effectsNeedTarget, livingIds, opposite } from '../../combat/battle-state.js';
import { actionProgress, isWhipping, targetSpec, upcomingActors } from '../../combat/engine.js';
import { combatFeats } from '../../combat/feats.js';
import { COMBAT_RULES, cardCopyLimit } from '../../combat/rules.js';
import { hash32 } from '../../combat/random.js';
import { enemyArtKeyFor } from '../../combat/enemy-art.js';
import { AWAKEN_TYPE_NAMES, injuryLevel } from '../../combat/report.js';
import { CARD_TYPE_LABELS, KEYWORD_TIPS, attributeNumberOptions, attributeScalingTip, cardArtSvg, describeEffectParts, describeEffects, describeKeywordParts, describeTrigger } from './combat-card-art.js';
import { INSCRIPTION_TIPS } from './combat-card-art.js';
import { INSCRIPTION_LABELS, isInscription } from '../../combat/mechanics/inscription.js';
import { cardMotifSvg } from './combat-card-motifs.js';
import { scalingMarks } from '../../combat/card-scaling.js';
import { ABILITY_LABELS } from '../../combat/abilities.js';
import { CHALLENGE_LABELS, challengeStatusName, intimateLabelsOf } from '../../combat/challenge-labels.js';
import { briefRegistered, statusLabel } from '../../combat/mechanics/registry.js';
import { CURSE_CHOICE_KIND, CURSE_LABELS, curseDetail } from '../../combat/mechanics/foe-curse.js';
import { powerName } from '../../combat/power-state.js';

// 卡牌属性性能显示：换算过的卡给出带增减标记的描述片段；固定卡与旧战斗不带字段，形状与旧版一致。
// 带标记的数字附 tip（要求属性、倍率与「原值 → 现值（差值）」，点数字由面板弹出）；scaleNote 是同样内容的整句，并入卡牌 aria-label 供读屏。
export function cardScalingView(card) {
    if (Array.isArray(card?.attributeScaling)) {
        const notes = [...new Set(card.attributeScaling.map(attributeScalingTip).filter(Boolean))];
        return {
            textParts: describeEffectParts(card.effects, undefined, undefined, attributeNumberOptions(card)),
            ...(notes.length ? { scaleNote: notes.join('；') } : {}),
        };
    }
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

// 卡面插槽（窄签与放大牌共用）：主效果数值、单位与加成明细。取第一个伤害 / 格挡 / 回复效果（条件与每回合效果里的不算主效果）；
// 没有这三类时取第一个对自身的攻击力 / 防御力状态（能力牌），数值为层数、单位为状态名。
// value 是含攻击力 / 防御力与虚弱 / 脆弱后的单次数值（不含目标易伤），baseValue 是牌面原值，两者不同时 bonusNote 给出明细（逗号分隔，不加句号）；
// 没有主效果的牌 value 为 null、unit 为空串。
// hits：主伤害段数，大于 1 时才写；extra：窄签最底一行的附加效果短写；fxText：放大牌去重后的说明（可为空串）。
const MINUS = '−';
const signed = (n) => `${n > 0 ? '+' : MINUS}${Math.abs(n)}`;
const SLOT_STATS = Object.freeze(['strength', 'dexterity']);
const TOTAL_UNITS = Object.freeze({ damage: '伤害', block: '格挡', heal: '回复' });
const effectAt = (effect, ...ops) => ops.includes(effect?.op);
const mainEffect = (effects) => effects.find((e) => effectAt(e, 'damage', 'block', 'heal') && Number.isFinite(e.amount))
    || effects.find((e) => e.op === 'status' && SLOT_STATS.includes(e.status) && Number.isFinite(e.stacks) && targetSpec(e) === 'self');

// 附加效果短写：状态「易伤2」、抽牌「抽1」、能量「能量1」、每回合触发「回合初挡4」；认不出的效果返回空串。
function effectBrief(e) {
    switch (e?.op) {
        case 'status': return `${statusName(e.status)}${e.stacks}`;
        case 'draw': return `抽${e.amount}`;
        case 'energy': return `能量${e.amount}`;
        case 'damage': return `伤${e.amount}`;
        case 'block': return `挡${e.amount}`;
        case 'heal': return `回${e.amount}`;
        case 'each-turn': { const t = effectBrief((e.then || [])[0]); return t ? `${e.at === 'turn-end' ? '回合末' : '回合初'}${t}` : ''; }
        case 'conditional': { const t = effectBrief((e.then || [])[0]); return t ? `条件${t}` : ''; }
        case 'next-turn': return e.gain === 'energy' ? `下回合能量${e.amount}` : e.gain === 'draw' ? `下回合抽${e.amount}` : `下回合${statusName(e.status)}${e.stacks}`;
        case 'self-damage': return `失血${e.amount}`;
        case 'delayed-counter': return `反击${e.amount * e.mult}`;
        case 'mutual-damage': return `同伤${e.amount}`;
        case 'random-branch': return '随机';
        case 'discard': return `弃${e.amount}`;
        case 'create': return `生成${e.amount}`;
        case 'copy': return '复制';
        case 'cleanse': return '净化';
        case 'heal-pct': return `回血${e.pct}%`;
        case 'grow': return `成长${e.amount}`;
        // 规则 v5 已登记机制的算子取其 brief；未登记的仍为空串。
        default: return briefRegistered(e, { statusName });
    }
}

// 说明里和大数值重复的主效果句：默认目标的主效果整句去掉（多段改写「N 段，共 T 点」，攻击力倍率另留一句）；换了目标的保留原句。
const defaultTarget = (e) => (e.op === 'damage' ? ['enemy', 'all-enemies'].includes(targetSpec(e)) : targetSpec(e) === 'self');
function slotFxText(effects, main, value, hits) {
    const out = [];
    for (const e of effects) {
        if (e.op === 'exhaust-self') continue;
        if (e !== main || !defaultTarget(e)) { out.push(describeEffects([e])); continue; }
        if (hits > 1) out.push(`${hits} 段，共 ${value * hits} 点`);
        else if (e.op === 'damage' && e.strengthScale > 1) out.push(`攻击力 ×${e.strengthScale} 生效`);
    }
    return out.filter(Boolean).join('，').replace(/：/g, '，');
}

// rulesVersion：战局规则版本，v5 时伤害预览与结算一样经过已登记的修正阶段（目标未定，target 为 null）。
export function cardSlotView(card, hero, rulesVersion) {
    const effects = Array.isArray(card?.effects) ? card.effects : [];
    const main = mainEffect(effects);
    const marked = Array.isArray(card?.attributeScaling);
    const options = attributeNumberOptions(card);
    const fxView = (value, hits) => {
        const fxText = slotFxText(effects, main, value, hits);
        if (!marked) return { fxText };
        const groups = effects.flatMap((effect, index) => {
            if (effect.op === 'exhaust-self') return [];
            if (effect !== main || !defaultTarget(effect)) return [describeEffectParts([effect], undefined, undefined, { ...options, offset: index })];
            if (hits > 1) return [[{ text: `${hits} 段，共 ${value * hits} 点` }]];
            return effect.op === 'damage' && effect.strengthScale > 1 ? [[{ text: `攻击力 ×${effect.strengthScale} 生效` }]] : [];
        });
        const discard = describeKeywordParts({ onDiscard: card.onDiscard }, options);
        if (discard.length) groups.push(discard);
        return { fxText, fxParts: groups.flatMap((parts, index) => [...(index ? [{ text: '，' }] : []), ...parts]) };
    };
    if (!main) return { value: null, unit: '', ...fxView(0, 1) };
    const briefs = effects.filter((e) => e !== main && e.op !== 'exhaust-self').map(effectBrief).filter(Boolean);
    const extra = briefs.length ? `${briefs[0]}${briefs.length > 1 ? '…' : ''}` : '';
    const st = hero?.statuses || {};
    const mainPath = `effects.${effects.indexOf(main)}.${main.op === 'status' ? 'stacks' : 'amount'}`;
    const attributeTip = attributeScalingTip(card.attributeScaling?.find(mark => mark.path === mainPath));
    const finish = (value, baseValue, unit, hits, parts) => {
        const bonusNote = value !== baseValue ? `${parts.join('，')}，合计 ${value} 点${TOTAL_UNITS[main.op]}` : '';
        const valueTip = [attributeTip, bonusNote].filter(Boolean).join('；');
        return { value, baseValue, unit, ...(hits > 1 ? { hits } : {}), ...(extra ? { extra } : {}), ...fxView(value, hits),
            ...(bonusNote ? { bonusNote } : {}), ...(attributeTip ? { valueTip } : {}) };
    };
    if (main.op === 'status') return { value: main.stacks, baseValue: main.stacks, unit: COMBAT_STATUS_NAMES[main.status] || statusLabel(main.status) || undefined,
        ...(extra ? { extra } : {}), ...fxView(main.stacks, 1), ...(attributeTip ? { valueTip: attributeTip } : {}) };
    if (main.op === 'heal') return finish(main.amount, main.amount, '回复', 1, []);
    const baseValue = main.amount;
    if (main.op === 'block') {
        const value = computeBlock(hero, baseValue, hero, rulesVersion, 'card');
        const parts = [`基础 ${baseValue}`];
        if (st.dexterity) parts.push(`防御力 ${signed(st.dexterity)}`);
        if (st.frail > 0) parts.push('脆弱 ×0.75');
        // 规则 v5 已登记的格挡修正（如防御力下降）合并为一项。
        const plainBlock = computeBlock(hero, baseValue);
        if (value !== plainBlock) parts.push(`其他修正 ${signed(value - plainBlock)}`);
        return finish(value, baseValue, '格挡', 1, parts);
    }
    // 规则 v6 G5c：牌面预览与结算一样把本牌交给出伤加值（牌名、升级、X 费、刻印过滤）。
    const value = computeDamage(hero, null, baseValue, main.strengthScale, rulesVersion, rulesVersion >= 6 ? card : undefined);
    const parts = [`基础 ${baseValue}`];
    const power = (st.strength || 0) * (main.strengthScale || 1);
    if (hero?.damageScale && hero.damageScale !== 1) parts.push(`伤害倍率 ×${hero.damageScale}`);
    if (power) parts.push(`攻击力 ${signed(power)}`);
    if (st.weak > 0) parts.push('虚弱 ×0.75');
    // 规则 v5 已登记的伤害修正（蓄势、倍伤、先手、攻击力下降等）合并为一项。
    const plainDamage = computeDamage(hero, null, baseValue, main.strengthScale);
    if (value !== plainDamage) parts.push(`其他修正 ${signed(value - plainDamage)}`);
    return finish(value, baseValue, main.target === 'all-enemies' ? '群伤' : '伤害', Number(main.hits) || 1, parts);
}

// 关键字单字（窄签印记用）与优先级：窄签只露一枚，不能打出 > 规则 v5 E19 牌面附着（绑定、痛刺、受创）> 规则 v5 P5b 刻印 > 消耗 > 虚无 > 保留 > 固有；临时已有虚线框，窄签不再标。
// 刻印单字互不重复，也不与其他关键字单字重复。
const INSCRIPTION_CHAR = Object.freeze({
    deft: '巧', sharp: '锋', instinct: '本', corrode: '蚀', momentum: '量', nimble: '动', flourish: '华', spiral: '旋', steady: '稳',
    sovereign: '御', swift: '迅', sow: '播', soul: '魂', attune: '契', float: '浮', thrift: '省', kindle: '燃', ink: '墨',
});
const INSCRIPTION_NAMES = Object.values(INSCRIPTION_LABELS);
export const KEYWORD_CHAR = Object.freeze({ 不能打出: '禁', 绑定: '绑', 痛刺: '刺', 受创: '创', 消耗: '耗', 虚无: '虚', 保留: '留', 固有: '固', 临时: '临',
    ...Object.fromEntries(Object.entries(INSCRIPTION_LABELS).map(([key, label]) => [label, INSCRIPTION_CHAR[key]])) });
export const KEYWORD_PRIORITY = Object.freeze(['不能打出', '绑定', '痛刺', '受创', ...INSCRIPTION_NAMES, '消耗', '虚无', '保留', '固有']);
// 关键字点开的解释（不带句号）；不能打出字面自明，这里仍给一句，供单字印记点开。
export const KEYWORD_NAME_TIPS = Object.freeze({
    不能打出: '不能打出：这张牌不能被打出', 消耗: KEYWORD_TIPS.exhaust, 虚无: KEYWORD_TIPS.ethereal, 保留: KEYWORD_TIPS.retain, 固有: KEYWORD_TIPS.innate, 临时: KEYWORD_TIPS.temp,
    狡黠: KEYWORD_TIPS.sly, 重演: KEYWORD_TIPS.replay, 圣辉: KEYWORD_TIPS.radiance,
    绑定: '绑定：每回合只能打出一张带绑定的牌', 痛刺: '痛刺：打出时失去 2 点生命', 受创: '受创：打出后到下一回合开始，每次受到的攻击伤害 +3',
    ...Object.fromEntries(Object.entries(INSCRIPTION_LABELS).map(([key, label]) => [label, INSCRIPTION_TIPS[key]])),
});
// 加成 / 减弱差值：value 与 baseValue 不同时给带符号的字符串（减号为 U+2212），否则空串；数字本身不转色，差值只做单位后的淡色小字。
export const cardValueDelta = (c) => (Number.isFinite(c?.value) && c.baseValue !== undefined && c.value !== c.baseValue ? signed(c.value - c.baseValue) : '');
export const cardMainKeyword = (names) => KEYWORD_PRIORITY.find((k) => (names || []).includes(k)) || '';

// 关键字全称（放大牌里的细框文字）：不能打出、固有、保留、虚无、临时与消耗；没有时为空数组。
export function cardKeywordNames(card) {
    const names = [];
    if (card?.unplayable) names.push('不能打出');
    for (const [flag, label] of [['innate', '固有'], ['retain', '保留'], ['ethereal', '虚无']]) if (card?.[flag]) names.push(label);
    if (card?.sly) names.push('狡黠');
    if (Number.isInteger(card?.replay) && card.replay > 0) names.push('重演');
    if (card?.radiance !== undefined) names.push('圣辉');
    if (card?.temp) names.push('临时');
    // 规则 v5 E19 牌面附着（加费体现在费用上，附加虚无已并入虚无）。
    for (const [mark, label] of [['bound', '绑定'], ['pain', '痛刺'], ['scar', '受创']]) if (card?.marks?.includes(mark)) names.push(label);
    // 规则 v5 P5b 刻印（cardView 在 v5 战斗里才带 inscription）。
    if (isInscription(card?.inscription)) names.push(INSCRIPTION_LABELS[card.inscription]);
    const exhaust = (list) => (list || []).some((e) => e.op === 'exhaust-self' || (Array.isArray(e.then) && exhaust(e.then)));
    if (exhaust(card?.effects)) names.push('消耗');
    return names;
}

// 战斗面板的纯视图模型：会话快照 → 战前 / 对局 / 结算所需字段；不操作 DOM。
// 是否可出牌只以引擎 legalActions 为准，界面不另算规则。
export const COMBAT_STATUS_NAMES = Object.freeze({ vulnerable: '易伤', weak: '虚弱', strength: '攻击力', dexterity: '防御力', poison: '中毒', regen: '再生', thorns: '荆棘', intangible: '无形', 'no-draw': '禁抽', endure: '不屈', artifact: '人工制品', frail: '脆弱' });
// 状态显示名：内置名表优先，其次规则 v5 登记的 label，最后回落到键名。
function statusName(key) {
    return COMBAT_STATUS_NAMES[key] || statusLabel(key) || key;
}
export const COMBAT_INTENT_LABELS = Object.freeze({
    attack: '攻击', defend: '防御', buff: '强化', debuff: '削弱', heal: '治疗', special: '特殊',
    'attack-debuff': '攻击削弱', 'attack-defend': '攻击防御', 'attack-buff': '攻击强化',
    'defend-debuff': '防御削弱', 'defend-buff': '防御强化',
    idle: '待机', escape: '逃跑', sleep: '睡眠', stun: '眩晕', unknown: '未知',
    summon: '召唤', explode: '自爆', status: '塞入状态牌', affliction: '附着',
});
export const COMBAT_OUTCOME_LABELS = Object.freeze({ victory: '胜利', defeat: '败北', escape: '撤退' });
// 日常挑战只换显示：结局名取自说法映射表，意图类别与剩余意志的描述在这里补全，内部字段与引擎不变。
export const CHALLENGE_OUTCOME_LABELS = Object.freeze({ victory: CHALLENGE_LABELS.victory, defeat: CHALLENGE_LABELS.defeat, escape: CHALLENGE_LABELS.escape });
export const CHALLENGE_INTENT_LABELS = Object.freeze({ attack: '施压', defend: '拖延', buff: '强化', debuff: '刁难', heal: '调整', special: '特殊' });
const CHALLENGE_WORDS = Object.freeze([
    ...Object.keys(COMBAT_STATUS_NAMES).filter((key) => challengeStatusName(key)).map((key) => [COMBAT_STATUS_NAMES[key], challengeStatusName(key)]),
    ['伤害', CHALLENGE_LABELS.damage], ['格挡', CHALLENGE_LABELS.block], ['生命', CHALLENGE_LABELS.hp], ['敌人', CHALLENGE_LABELS.enemy],
]);
const intimateWords = (labels) => [
    ...Object.entries({ weak: '虚弱', vulnerable: '易伤', poison: '中毒' }).map(([key, from]) => [from, labels.statuses[key]]),
    ['伤害', labels.damage], ['格挡', labels.block], ['生命', labels.hp], ['敌人', labels.enemy],
];
const challengeWordsOf = (text, mechanic = null) => {
    if (typeof text !== 'string') return text;
    const labels = intimateLabelsOf(mechanic);
    return (labels ? intimateWords(labels) : CHALLENGE_WORDS).reduce((out, [from, to]) => out.split(from).join(to), text);
};
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
    .map(([key, stacks]) => ({ key, label: (challenge && (intimateLabelsOf(challenge)?.statuses[key] || challengeStatusName(key))) || statusName(key), stacks }));

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
    const labels = intimateLabelsOf(challenge);
    const names = labels ? labels.intents : challenge ? CHALLENGE_INTENT_LABELS : COMBAT_INTENT_LABELS;
    const kinds = intent.kinds || [intent.intent];
    return {
        name: intent.name, kind: intent.intent, kinds,
        label: kinds.map((kind) => names[kind] || COMBAT_INTENT_LABELS[kind] || kind).join('、'),
        ...(challenge ? { unit: labels ? labels.damage : CHALLENGE_LABELS.damage } : {}),
        damage: intent.damage, attacks: intent.attacks,
        targetName: intent.targetId ? state.units[intent.targetId]?.name || '' : '',
    };
}

// 规则 v5 单位资源的面板视图：只挑可显示的键（法珠、专注、圣辉、心境与乐势、锻造、随从），unit.res 里的内部记账键不进视图；没有可显示资源时返回 null。
export const ORB_SLOT_MAX = 10;
const ORB_KINDS = new Set(['lightning', 'frost', 'dark', 'plasma', 'glass']);
const STANCES = new Set(['neutral', 'calm', 'wrath', 'divinity']);
const resCount = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : null);
export function resourceView(res) {
    if (!res || typeof res !== 'object') return null;
    const out = {};
    const slots = res.orbs && typeof res.orbs === 'object' ? resCount(res.orbs.slots, ORB_SLOT_MAX) : null;
    if (slots) {
        const list = (Array.isArray(res.orbs.list) ? res.orbs.list : []).filter((o) => ORB_KINDS.has(o?.kind)).slice(0, slots);
        out.orbs = { slots, list: list.map((o) => ({ kind: o.kind })) };
    }
    if (Number.isFinite(res.focus) && (out.orbs || res.focus)) out.focus = Math.trunc(res.focus);
    if (Number.isFinite(res.radiance)) out.radiance = resCount(res.radiance, 999);
    if (STANCES.has(res.stance) || Number.isFinite(res.momentum)) {
        out.stance = STANCES.has(res.stance) ? res.stance : 'neutral';
        if (Number.isFinite(res.momentum)) out.momentum = resCount(res.momentum, 10);
    }
    if (res.forge && typeof res.forge === 'object' && Number.isFinite(res.forge.value)) out.forge = resCount(res.forge.value, 999);
    const m = res.minion;
    if (m && typeof m === 'object' && Number.isFinite(m.maxHp) && m.maxHp > 0) out.minion = { hp: resCount(m.hp, m.maxHp) ?? 0, maxHp: Math.floor(m.maxHp) };
    return Object.keys(out).length ? out : null;
}

export function activePowers(state, unitId) {
    const unit = state.units[unitId];
    const grouped = new Map();
    const add = (ownerId, cardId, meta, effects, count = 1) => {
        const name = powerName(state, ownerId, cardId);
        const key = `${ownerId}|${name}`;
        const item = grouped.get(key) || { id: cardId, name, count: 0, details: [] };
        item.count += count;
        const text = describeEffects(effects);
        const detail = [meta, text].filter(Boolean).join('：');
        if (detail && !item.details.includes(detail)) item.details.push(detail);
        grouped.set(key, item);
    };
    for (const power of unit.powers || []) {
        add(unitId, power.id, power.at === 'turn-end' ? '回合结束' : '回合开始', power.effects);
    }
    for (const buff of unit.buffs || []) {
        if (!(buff.turns > 0)) continue;
        add(unitId, buff.id, `${describeTrigger(buff.trigger, buff.cardType, buff)} · 剩余 ${buff.turns} 回合`, buff.then);
    }
    for (const [status, sources] of Object.entries(unit.res?.powerStatuses || {})) {
        if (!(unit.statuses[status] > 0)) continue;
        const counts = new Map();
        for (const source of sources) {
            if (!source.cardId || !(source.stacks > 0)) continue;
            const key = `${source.ownerId}|${source.cardId}`;
            const entry = counts.get(key) || { ...source, stacks: 0 };
            entry.stacks += source.stacks;
            counts.set(key, entry);
        }
        for (const source of counts.values()) {
            const name = powerName(state, source.ownerId, source.cardId);
            const existing = grouped.get(`${source.ownerId}|${name}`);
            add(source.ownerId, source.cardId, '生效中', [{ op: 'apply-status', status, stacks: source.stacks, target: 'self' }], existing ? 0 : 1);
        }
    }
    return [...grouped.values()].map(({ details, ...item }) => ({ ...item, text: details.join('；') }));
}

export function unitView(state, id, challenge = false) {
    const u = state.units[id];
    const res = resourceView(u.res);
    const powers = activePowers(state, id);
    return {
        id, name: u.name, side: u.side, kind: u.kind, hp: Math.max(0, u.hp), maxHp: u.maxHp, block: u.block, alive: u.alive,
        controlled: id === state.controlledId, statuses: statusList(u.statuses, challenge),
        ...(powers.length ? { powers } : {}),
        intent: u.side === 'enemy' ? intentView(state, id, challenge) : null,
        // 敌人外观格位（setup 带 art 时）：面板据此在通用敌人图集里取图；我方与旧战斗不带该字段。
        ...(u.side === 'enemy' && typeof u.art === 'string' && u.art ? { art: u.art } : {}),
        ...(u.side === 'enemy' && (u.tier === 'elite' || u.tier === 'boss') ? { tier: u.tier } : {}),
        // v5 资源：只在有可显示资源时出现，v3/v4 与无资源单位的视图形状不变。
        ...(res ? { res } : {}),
    };
}

// v4 待选阶段：引擎 state.pending 属于操控角色时返回 { kind 用途, count 选几张, options 候选手牌实例 }，否则 null。
// M7 二选一诅咒（kind foe-curse）：options 是 'curse:<序号>'，另给 curses（每项 id / 名称 / 说明）供浮层显示；不对应任何手牌。
export function pendingChoice(state) {
    const p = state?.pending;
    if (!(p && p.unitId === state.controlledId && Array.isArray(p.options))) return null;
    const choice = { kind: p.kind, count: p.count, options: p.options.slice() };
    if (p.kind === CURSE_CHOICE_KIND && Array.isArray(p.offer)) choice.curses = p.offer.map((o, i) => ({ id: p.options[i], name: CURSE_LABELS[o.status] || o.status, text: curseDetail(o) }));
    if (p.kind === 'draw-play') choice.candidates = p.options.map(inst => {
        const card = cardView(state, inst);
        return { id: inst, name: card?.name || inst, text: describeEffects(card?.effects || []) };
    });
    return choice;
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
const passiveItem = (p, t) => ({ name: p.name || t?.name || '', meta: describeTrigger(p.trigger, p.cardType, p), text: describeEffects(p.effects),
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
    add('持续能力', activePowers(state, unitId).map(power => ({ name: power.name, meta: power.count > 1 ? `叠加 ${power.count} 份` : '', text: power.text })));
    const phases = (u.phases || []).slice(u.phasesApplied || 0);
    add('阶段', phases.map((ph) => ({ name: ph.hpAtMostPct !== undefined ? `生命不高于 ${ph.hpAtMostPct}%` : `生命低于 ${ph.hpBelowPct}%`, meta: '',
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
        const keywordParts = describeKeywordParts(card, attributeNumberOptions(card));
        const keywords = keywordParts.map((p) => p.text).join('');
        return {
            inst, id: card.id, name: card.name, type: card.type, cost: card.cost, upgraded: card.upgraded, rarity: card.rarity || '',
            typeLabel: CARD_TYPE_LABELS[card.type] || '', text: describeEffects(card.effects), art: cardArtSvg(card),
            // 规则 v5 出牌限制（E18 等）与引擎共用 canPlay；v3/v4 与原 canAfford 相同。
            affordable: canPlay(state, hero, card), needsTarget: effectsNeedTarget(card.effects),
            targets, affects: targets.length ? [] : affectedIds(state, hero, card.effects), playable: mine.length > 0,
            ...(keywords ? { keywords, keywordParts } : {}), ...(card.temp ? { temp: true } : {}),
            // 待选阶段的候选牌；不在待选阶段时不写字段。
            ...(choosable.has(inst) ? { choosable: true } : {}),
            // 费用确有变化时才给原费用（0 费牌被减费仍是 0，不显示）。
            ...(card.baseCost !== undefined && card.baseCost !== card.cost ? { baseCost: card.baseCost } : {}),
            ...cardTextView(card),
            // 卡面插槽：主效果数值与单位（风格化皮肤的窄签与放大牌用）、关键字全称；initial 皮肤不显示这些节点。
            ...cardSlotView(card, hero, state.rulesVersion), keywordNames: cardKeywordNames(card),
        };
    }).filter(Boolean);
    // 同名张数：手牌里同 id、同升级状态、同牌面附着（规则 v5 E19）、同刻印与同永久成长（规则 v5 P5）的张数，至少 2 张才给 stack。
    const sameCount = new Map();
    const stackKey = (c) => {
        const entry = state.cards[c.inst] || {};
        return `${c.id}|${c.upgraded ? 1 : 0}|${(entry.marks || []).join(',')}|${entry.inscription || ''}|${entry.bonus ? `${entry.bonus.damage || 0}/${entry.bonus.block || 0}` : ''}`;
    };
    for (const c of hand) { const k = stackKey(c); sameCount.set(k, (sameCount.get(k) || 0) + 1); }
    for (const c of hand) { const n = sameCount.get(stackKey(c)); if (n >= 2) c.stack = n; }
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
    return challenge ? challengeBattleView(view, challenge) : view;
}

// 日常挑战：牌面、技能与道具说明里的战斗词换成日常说法，只改文案字段。
function challengeBattleView(view, challenge = true) {
    const mechanic = typeof challenge === 'string' ? challenge : null;
    const challengeWords = (text) => challengeWordsOf(text, mechanic);
    const words = (obj, keys) => Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, keys.includes(key) ? challengeWords(value) : value]));
    return {
        ...view,
        hand: view.hand.map((card) => ({
            ...words(card, ['text', 'keywords', 'scaleNote', 'bonusNote', 'valueTip', 'fxText', 'extra']),
            ...(card.textParts ? { textParts: card.textParts.map((part) => ({ ...part, text: challengeWords(part.text), ...(part.tip ? { tip: challengeWords(part.tip) } : {}) })) } : {}),
            ...(card.fxParts ? { fxParts: card.fxParts.map((part) => ({ ...part, text: challengeWords(part.text), ...(part.tip ? { tip: challengeWords(part.tip) } : {}) })) } : {}),
            ...(card.keywordParts ? { keywordParts: card.keywordParts.map((part) => ({ ...part, text: challengeWords(part.text), ...(part.tip ? { tip: challengeWords(part.tip) } : {}) })) } : {}),
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
    const intimate = intimateLabelsOf(challenge);
    if (intimate) return { outcome: state.outcome, label: summary?.ending || { victory: intimate.victory, defeat: intimate.defeat, escape: intimate.escape }[state.outcome] || state.outcome, turn: state.turn, allies, ...(summary ? { challengeOutcome: summary.outcome } : {}) };
    if (challenge) return { outcome: state.outcome, label: CHALLENGE_OUTCOME_LABELS[state.outcome] || state.outcome, turn: state.turn, allies, ...(summary ? { challengeOutcome: summary.outcome, harvest: harvestView(summary) } : {}) };
    const feats = combatFeats(events, state).map((f) => ({ ...f, ...COMBAT_FEAT_LABELS[f.id] }));
    return { outcome: state.outcome, label: COMBAT_OUTCOME_LABELS[state.outcome] || state.outcome, turn: state.turn, allies, ...(feats.length ? { feats } : {}) };
}

// 圆满后的收获：奖金只写档位词，经验牌给名称与说明；没有收获时为 null。
function harvestView(summary) {
    if (!summary || (!summary.prize && !summary.card)) return null;
    return { prize: summary.prize || '', card: summary.card ? { name: summary.card.name, rarity: summary.card.rarity, cost: summary.card.cost, text: challengeWordsOf(describeEffects(summary.card.effects)) } : null };
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
        ...(challenge.intimate ? { intimate: { mechanic: challenge.intimate.mechanic, position: challenge.intimate.position } } : {}),
        heroId: hero.id,
        allies: [{ id: hero.id, name: hero.name, level: 0, kind: 'deck', className: '', controllable: true, hp: hero.maxHp, maxHp: hero.maxHp },
            ...setup.units.filter((unit) => unit.side === 'ally' && unit.id !== hero.id).map((unit) => ({ id: unit.id, name: unit.name, level: 0, kind: 'deck', className: '', controllable: false }))],
        candidates: (session.challengeCandidates || []).map((item) => ({ name: item.name, picked: challenge.allies.includes(item.name) })), maxAllies: 2,
        enemies: [{ name: foe.name, count: 1, templated: false, tier: 'normal', art: null }],
        absent: [], downed: [], skipped: [], canEscape: setup.canEscape !== false,
    };
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
        else if (e.type === 'power-trigger' || e.type === 'buff-trigger') action = { actor: e.unitId, name: e.name || powerName(state, e.unitId, e.cardId || e.buffId) };
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
        else if (e.type === 'power-trigger' || e.type === 'buff-trigger') add(e.unitId, { kind: 'power', text: e.name || e.cardId || e.buffId });
    }
    return [...groups].map(([unitId, marks]) => ({ unitId, marks }));
}

// 结算三选一的候选牌：转成与手牌同形的视图（无实例号用占位，视为可用，不出费用不足置灰），画布皮肤用手牌完整卡面渲染。
// card 是 rewardCardView 给出的升级 / 刻印后的牌；升级以 marks.upgraded 为准（定义里的 upgraded 是升级后字段，不是标记）。
export function rewardHandView(card, marks = {}) {
    const { upgraded: _def, ...base } = card || {};
    const face = { ...base, upgraded: marks.upgraded === true };
    const keywordParts = describeKeywordParts(face, attributeNumberOptions(face));
    const keywords = keywordParts.map((p) => p.text).join('');
    return {
        inst: 'reward', id: face.id, name: face.name, type: face.type, cost: face.cost, upgraded: face.upgraded, rarity: face.rarity || '',
        typeLabel: CARD_TYPE_LABELS[face.type] || '', text: describeEffects(face.effects), art: cardArtSvg(face),
        affordable: true, needsTarget: false, targets: [], affects: [], playable: true,
        ...(keywords ? { keywords, keywordParts } : {}), ...(face.temp ? { temp: true } : {}),
        ...cardTextView(face), ...cardSlotView(face, null, COMBAT_RULES.version), keywordNames: cardKeywordNames(face),
    };
}
