import { hash32 } from '../../combat/random.js';
import { TOKEN_CARDS } from '../../combat/rules.js';
import { LOW_HP_RATIO } from '../../combat/battle-state.js';
import { RECORD_ICONS, lineIconSvg } from './record-icons.js';
import { cardMotifSvg } from './combat-card-motifs.js';
import { describeRegistered, statusLabel } from '../../combat/mechanics/registry.js';
import { ABILITY_LABELS } from '../../combat/abilities.js';
import { STATUS_CARD_TEXT } from '../../combat/mechanics/status-cards.js';
import { INSCRIPTION_LABELS, INSCRIPTION_VALUES as IV, isInscription } from '../../combat/mechanics/inscription.js';

// 卡面与立绘占位的纯函数：效果与关键字说明（含可点注释的片段）、卡图纹样（combat-card-motifs.js）、无立绘时的 SVG 剪影。
// SVG 只来自程序常量与数值，不含任何档案文本；同一张卡永远得到同一张图。
const STATUS = Object.freeze({ vulnerable: '易伤', weak: '虚弱', strength: '攻击力', dexterity: '防御力', poison: '中毒', regen: '再生', thorns: '荆棘', intangible: '无形', 'no-draw': '禁抽', endure: '不屈', artifact: '人工制品', frail: '脆弱' });
const TARGET = Object.freeze({ enemy: '', 'all-enemies': '全体敌人', 'random-enemy': '随机敌人', self: '', ally: '一名队友', 'all-allies': '全体队友', 'other-allies': '其他队友' });
const DOUBLE_STAT = Object.freeze({ poison: '中毒层数', block: '格挡', strength: '攻击力' });
const WHEN = Object.freeze({
    'target-has': (v) => `目标有${STATUS[v] || v}时：`,
    'self-has': (v) => `自身有${STATUS[v] || v}时：`,
    'self-hp-below': (v) => `自身生命低于 ${v}% 时：`,
    'cards-played-gte': (v) => `本回合已出 ${v} 张牌时：`,
    'attacks-played-gte': (v) => `本回合已出 ${v} 张攻击牌时：`,
    'skills-played-gte': (v) => `本回合已出 ${v} 张技能牌时：`,
    'same-card-gte': (v) => `本回合已打出过 ${v} 次同名牌时：`,
    'discarded-gte': (v) => `本回合已弃 ${v} 张牌时：`,
    'target-intent-attack': () => '目标意图为攻击时：',
    'target-hp-below': (v) => `目标生命低于 ${v}% 时：`,
    'hand-gte': (v) => `手牌不少于 ${v} 张时：`,
    'exhausted-gte': (v) => `本场已消耗 ${v} 张牌时：`,
    // 规则 v6 G5a。
    'cards-played-lte': (v) => (v === 0 ? '本回合未出牌时：' : `本回合出牌不超过 ${v} 张时：`),
    'attacks-played-lte': (v) => (v === 0 ? '本回合未出攻击牌时：' : `本回合攻击牌不超过 ${v} 张时：`),
    'skills-played-lte': (v) => (v === 0 ? '本回合未出技能牌时：' : `本回合技能牌不超过 ${v} 张时：`),
    'discarded-lte': (v) => (v === 0 ? '本回合未弃牌时：' : `本回合弃牌不超过 ${v} 张时：`),
    'hand-lte': (v) => (v === 0 ? '手牌为空时：' : `手牌不超过 ${v} 张时：`),
    'turn-eq': (v) => `第 ${v} 回合：`,
    'turn-gte': (v) => `第 ${v} 回合起：`,
    'self-block-gte': (v) => `自身格挡不少于 ${v} 时：`,
    'self-block-lte': (v) => (v === 0 ? '自身没有格挡时：' : `自身格挡不超过 ${v} 时：`),
    'battle-tier': (v) => (v === 'boss' ? '首领战中：' : '精英战中：'),
    'target-doom-gte': (v) => `目标灾厄不少于 ${v} 层时：`,
    'target-doom-hp': () => '目标灾厄不低于其生命时：',
});
export const CARD_TYPE_LABELS = Object.freeze({ attack: '攻击', skill: '技能', power: '能力' });
const PILE = Object.freeze({ hand: '手牌', discard: '弃牌堆', draw: '抽牌堆' });
const PICK = Object.freeze({ self: '本牌', choose: '1 张手牌', random: '随机 1 张手牌' });
const BUFF_WHEN = Object.freeze({ discard: '弃牌', exhaust: '消耗牌', kill: '击杀敌人', 'hp-loss': '失去生命', 'block-gain': '获得格挡', 'turn-start': '回合开始', 'turn-end': '回合结束' });
const typed = (cardType) => (cardType ? `${CARD_TYPE_LABELS[cardType] || cardType}牌` : '牌');
const times = (n) => (n > 1 ? ` ${n} 次` : '一次');
// 关键字注释：牌面上的关键字可点，由面板弹出（与牌面数字的加成详情同一套 data-scale-tip）；「不能打出」「被丢弃时」字面已自明，不带注释（助手 10-28）。
export const KEYWORD_TIPS = Object.freeze({
    innate: '固有：开战时一定在第一手牌里',
    retain: '保留：回合结束时不被弃掉，留到下回合',
    ethereal: '虚无：回合结束时还在手里就被消耗',
    temp: '临时：本场战斗中生成或复制的牌，战斗结束后消失，不进卡组',
    exhaust: '消耗：打出后移出本场战斗，本场不会再抽到',
    sly: '狡黠：被效果弃掉时免费打出；回合结束时自然弃掉不触发',
    replay: '重演：打出时整张额外执行，只付一次费、只计一次出牌',
    radiance: '圣辉：打出时另需消耗的圣辉；X 表示花光圣辉，每点结算一次',
});
// 规则 v5 P5b 刻印的解释（放大牌关键字与牌组面板副本标签点开时显示），数值取 INSCRIPTION_VALUES。
const INSCRIPTION_TEXT = Object.freeze({
    deft: `打出后额外获得 ${IV.deft} 点格挡`, sharp: `牌面伤害 +${IV.sharp}`, instinct: '牌面伤害翻倍，攻击力等加成不翻倍',
    corrode: `牌面伤害 +50%，打出后失去 ${IV.corrode} 点生命`, momentum: `每次打出，本场这张牌的伤害 +${IV.momentum}`, nimble: `牌面格挡 +${IV.nimble}`,
    flourish: '每场第一次打出时整张重演 1 次', spiral: '重演 1 次', steady: '获得保留', sovereign: '获得固有与保留',
    swift: `每场第一次打出时抽 ${IV.swift} 张牌`, sow: `每场第一次打出时获得 ${IV.sow} 点能量`, soul: '打出后不再消耗',
    attune: '洗牌时放到抽牌堆顶', float: '每次抽到时费用随机变为 0–3', thrift: '回合结束时仍在手中，费用 -1，持续到打出',
    kindle: '开战时自动免费打出', ink: `伤害 +${IV.ink}，并施加 ${IV.ink} 层虚弱`,
});
export const INSCRIPTION_TIPS = Object.freeze(Object.fromEntries(Object.entries(INSCRIPTION_LABELS).map(([key, label]) => [key, `刻印·${label}：${INSCRIPTION_TEXT[key]}`])));
export const inscriptionLabel = (key) => (isInscription(key) ? INSCRIPTION_LABELS[key] : '');

const on = (target) => (TARGET[target] ? `对${TARGET[target]}` : '');

// 旧标记沿用 effectNumbers 顺序；新标记按效果字段路径匹配。
const plainNum = (n) => n;
const plainWord = (key, word) => word;
function effectText(e, fmt = plainNum, kw = plainWord, path = '') {
    const num = (key, value = e?.[key], legacy = true) => fmt(value, `${path}.${key}`, legacy);
    const sub = (list, key = 'then') => (list || []).map((t, index) => effectText(t, fmt, kw, `${path}.${key}.${index}`)).join('，');
    switch (e?.op) {
        case 'damage': return `${on(e.target)}造成 ${num('amount')} 点伤害${e.hits > 1 ? ` ×${e.hits}` : ''}${e.strengthScale > 1 ? `，攻击力 ×${e.strengthScale} 生效` : ''}`;
        case 'block': return `${on(e.target)}获得 ${num('amount')} 点格挡`;
        case 'heal': return `${on(e.target)}回复 ${num('amount')} 点生命`;
        case 'draw': return `抽 ${e.amount} 张牌`;
        case 'energy': return `获得 ${e.amount} 点能量`;
        case 'status': return `${on(e.target)}施加 ${num('stacks')} 层${STATUS[e.status] || e.status}`;
        case 'exhaust-self': return kw('exhaust', '消耗');
        case 'conditional': return `${(WHEN[e.when?.kind] || (() => ''))(e.when?.value)}${sub(e.then)}`;
        case 'damage-from-block': return `${on(e.target)}造成等同当前格挡的伤害`;
        case 'self-damage': return `失去 ${e.amount} 点生命`;
        case 'delayed-counter': return `失去 ${e.amount} 点生命，下回合对目标造成所失生命 ${e.mult} 倍的伤害${e.fizzle ? '；对方观望时落空' : ''}`;
        case 'mutual-damage': return `对目标造成 ${e.amount} 点伤害，自己同时失去 ${e.selfAmount ?? e.amount} 点生命`;
        case 'random-branch': return `随机其一：${sub(e.a, 'a') || '无效果'}；${sub(e.b, 'b') || '无效果'}`;
        case 'double': return `${on(e.target)}${DOUBLE_STAT[e.stat] || e.stat}翻倍`;
        case 'next-turn':
            if (e.gain === 'energy') return `下回合获得 ${e.amount} 点能量`;
            if (e.gain === 'draw') return `下回合多抽 ${e.amount} 张牌`;
            return `下回合获得 ${num('stacks', e.stacks, false)} 层${STATUS[e.status] || e.status}`;
        case 'each-turn': return `${e.at === 'turn-end' ? '每回合结束时' : '每回合开始时'}：${sub(e.then)}`;
        case 'hand-cost': return `本回合手牌费用 ${e.amount}`;
        case 'heal-pct': return `${on(e.target)}回复 ${e.pct}% 生命`;
        case 'cleanse': return `${on(e.target)}净化减益`;
        case 'discard': return `${e.mode === 'random' ? '随机' : ''}弃 ${e.amount} 张牌`;
        case 'discard-hand': return e.redraw ? '弃掉全部手牌，再抽同样张数' : '弃掉全部手牌';
        case 'copy': {
            const count = e.amount > 1 ? ` ${e.amount} 张` : '';
            const pile = PILE[e.to] || PILE.hand;
            if (e.from === 'self') return `将本牌复制${count}加入${pile}`;
            return `${e.from === 'random' ? '随机选' : '选'} 1 张手牌，复制${count}加入${pile}`;
        }
        case 'create': return `生成 ${e.amount} 张「${TOKEN_CARDS[e.card]?.name || e.card}」加入${PILE[e.to] || PILE.hand}`;
        case 'repeat-last': return `再结算${times(e.amount)}本回合上一张牌的效果`;
        case 'replay-next': return `本回合下一张${typed(e.cardType)}多结算${times(e.amount)}`;
        case 'grow': return `本场本牌伤害 +${e.amount}`;
        case 'cost-mod': {
            const when = e.scope === 'combat' ? '本场' : '本回合';
            return e.mode === 'choose' ? `选 1 张手牌，${when}费用 ${e.amount}` : `${when}${PICK[e.mode] || e.mode}费用 ${e.amount}`;
        }
        case 'buff': {
            const when = e.trigger === 'card-played' ? `打出${typed(e.cardType)}` : BUFF_WHEN[e.trigger] || e.trigger;
            return `${e.turns} 回合内，每次${when}：${sub(e.then)}`;
        }
        // 规则 v5 已登记机制的算子：交给其 describe（同一套数值格式化与关键字标记）；未登记的仍为空串。
        default: return describeRegistered(e, {
            fmt: (value, key = 'amount', legacy = true) => num(key, value, legacy), kw, sub, on, typed, times,
            statusName: (key) => STATUS[key] || statusLabel(key) || key, pileName: (pile) => PILE[pile] || PILE.hand,
        });
    }
}

export function describeEffects(effects) {
    return (Array.isArray(effects) ? effects : []).map((e) => effectText(e)).filter(Boolean).join('。');
}

// 被动的触发时机说明（人物特性详情用）；未知时机原样返回。
const PASSIVE_WHEN = Object.freeze({
    'battle-start': '开战时', 'turn-start': '回合开始时', 'turn-end': '回合结束时', 'on-hit': '受到攻击后',
    'on-low-hp': `生命首次低于 ${Math.round(LOW_HP_RATIO * 100)}% 时`, discard: '每次弃牌时', exhaust: '每次消耗牌时', kill: '每次击杀敌人时',
    shuffle: '每次洗牌时', 'hp-loss': '每次失去生命时', 'block-gain': '每次获得格挡时',
    draw: '每次抽牌后', create: '每次生成临时牌后', 'debuff-applied': '每次使敌人陷入减益后', 'block-broken': '格挡被打破时',
    // 规则 v6 G5b。
    defeated: '每有敌人倒下时', 'status-gained': '每次获得状态后', 'item-used': '每次使用道具后', foresee: '每次预知后',
    'orb-channel': '每次凝结法珠后', 'radiance-spent': '每次消耗圣辉后', 'minion-act': '随从每次出手后',
});
const ORB_LABEL = Object.freeze({ lightning: '雷珠', frost: '霜珠', dark: '蚀珠', plasma: '源珠', glass: '晶珠' });
const CAUSE_LABEL = Object.freeze({ attack: '被攻击击倒', poison: '因中毒倒下', doom: '因灾厄倒下', orb: '被法珠击倒', minion: '被随从击倒', thorns: '被荆棘击倒', self: '自损倒下' });
const statusText = (key) => STATUS[key] || statusLabel(key) || key;
export function describeTrigger(trigger, cardType, filters = {}) {
    if (trigger === 'card-played') return `每次打出${typed(cardType)}时`;
    if (trigger === 'foe-card-played') return `对方每次打出${typed(cardType)}时`;
    if (trigger === 'status-gained' && filters.status) return `每次获得${statusText(filters.status)}后`;
    if (trigger === 'debuff-applied' && filters.status) return `每次使敌人陷入${statusText(filters.status)}后`;
    if (trigger === 'orb-channel' && filters.orb) return `每次凝结${ORB_LABEL[filters.orb] || filters.orb}后`;
    if (trigger === 'defeated' && filters.cause) return `每有敌人${CAUSE_LABEL[filters.cause] || '倒下'}时`;
    return PASSIVE_WHEN[trigger] || String(trigger || '');
}

// 卡牌关键字与被丢弃时效果的说明片段（排在效果说明前）：[{ text, tip? }]，有注释的关键字带 tip；没有关键字时为空数组。
export function describeKeywordParts(card, numberOptions) {
    const groups = [];
    const word = (key, text) => groups.push([KEYWORD_TIPS[key] ? { text, tip: KEYWORD_TIPS[key] } : { text }]);
    if (card?.unplayable) word('unplayable', '不能打出');
    if (STATUS_CARD_TEXT[card?.id]) groups.push([{ text: STATUS_CARD_TEXT[card.id] }]);
    for (const [flag, label] of [['innate', '固有'], ['retain', '保留'], ['ethereal', '虚无']]) if (card?.[flag]) word(flag, label);
    if (card?.sly) word('sly', '狡黠');
    if (Number.isInteger(card?.replay) && card.replay > 0) word('replay', `重演 ${card.replay}`);
    if (card?.radiance !== undefined) word('radiance', `圣辉 ${card.radiance}`);
    if (card?.temp) word('temp', '临时');
    if (isInscription(card?.inscription)) groups.push([{ text: INSCRIPTION_LABELS[card.inscription], tip: INSCRIPTION_TIPS[card.inscription] }]);
    if (Array.isArray(card?.onDiscard) && card.onDiscard.length) groups.push([{ text: '被丢弃时：' }, ...describeEffectParts(card.onDiscard, undefined, undefined, { ...numberOptions, root: 'onDiscard' })]);
    return groups.flatMap((g, i) => (i ? [{ text: '。' }, ...g] : g));
}

// 关键字说明整句（读屏与旧调用方）；没有关键字时为空串。
export function describeKeywords(card) {
    return describeKeywordParts(card).map((p) => p.text).join('');
}

export function attributeScalingTip(mark) {
    if (!mark) return '';
    const head = `${ABILITY_LABELS[mark.ability] || mark.ability} ×${mark.multiplier}${mark.tier === 'support' ? '（保守）' : ''}`;
    if (mark.timing === 'deferred') return `${head}，最终效能合计后换算`;
    if (!(mark.base > 0) || !Number.isFinite(mark.value)) return '';
    const delta = mark.value - mark.base;
    return `${head}，${mark.base}→${mark.value}（${delta > 0 ? '+' : ''}${delta}）`;
}

export function attributeNumberOptions(card) {
    const marks = new Map((card?.attributeScaling || []).map(mark => [mark.path, mark]));
    return { numberPart: ({ path }) => {
        const mark = marks.get(path);
        const tip = attributeScalingTip(mark);
        if (!tip) return null;
        if (mark.timing === 'deferred') return { tip };
        const delta = mark.value - mark.base;
        return { tip, mark: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same' };
    } };
}

// numberPart 接收字段路径与显示值；marks/base 仅服务历史整牌缩放。
export function describeEffectParts(effects, marks, base, { root = 'effects', offset = 0, numberPart } = {}) {
    const tokens = [];
    const words = [];
    let legacyIndex = 0;
    const fmt = (value, path, legacy = true) => {
        tokens.push({ value, path, index: legacy ? legacyIndex++ : null });
        return `\u0001${tokens.length - 1}\u0002`;
    };
    const kw = (key, word) => { words.push([key, word]); return `\u0003${words.length - 1}\u0004`; };
    const text = (Array.isArray(effects) ? effects : []).map((e, index) => effectText(e, fmt, kw, `${root}.${index + offset}`)).filter(Boolean).join('。');
    const parts = [];
    for (const piece of text.split(/(\u0001\d+\u0002|\u0003\d+\u0004)/)) {
        if (!piece) continue;
        const w = piece.match(/^\u0003(\d+)\u0004$/);
        if (w) { const [key, word] = words[Number(w[1])]; parts.push({ text: word, tip: KEYWORD_TIPS[key] }); continue; }
        const m = piece.match(/^\u0001(\d+)\u0002$/);
        if (!m) { parts.push({ text: piece }); continue; }
        const token = tokens[Number(m[1])];
        const part = typeof numberPart === 'function' ? numberPart(token) : null;
        if (part) { parts.push({ text: String(token.value), ...part }); continue; }
        const mark = token.index !== null && Array.isArray(marks) ? marks[token.index] : undefined;
        if (mark !== 'up' && mark !== 'down') { parts.push({ text: String(token.value) }); continue; }
        const from = Array.isArray(base) ? base[token.index] : undefined;
        parts.push(Number.isFinite(from) ? { text: String(token.value), mark, base: from } : { text: String(token.value), mark });
    }
    return parts;
}

// 卡图：按卡牌类型与「卡名关键字 + 效果结构」选纹样，本场临时牌加残影；颜色由样式层按卡牌类型着色。
export function cardArtSvg(card) {
    return cardMotifSvg(card);
}

// 敌方意图图标：攻击 / 防御 / 治疗 / 特殊沿用本体图标库，强化 / 削弱用同一画法（24 网格、细线、currentColor）的上下箭头；颜色由样式层按意图着色。
const arrow = (d) => lineIconSvg(`<path d="${d}"/>`);
const INTENT_ICON = Object.freeze({
    attack: RECORD_ICONS.weapon, defend: RECORD_ICONS.armor, heal: RECORD_ICONS.potion, special: RECORD_ICONS.sparkle,
    buff: arrow('M12 20.5V7.5M6.5 13 12 7.5l5.5 5.5M5 3.5h14'),
    debuff: arrow('M12 3.5v13M6.5 11 12 16.5l5.5-5.5M5 20.5h14'),
});

export function intentIconSvg(kind) {
    return INTENT_ICON[kind] || RECORD_ICONS.sparkle;
}

// 没有立绘时的剪影：透明底、只有人形，填充随 currentColor（由样式层按阵营着色）；体态细节由名字哈希决定，名字本身不进入 SVG。
export function portraitSilhouetteSvg(name) {
    const h = hash32(String(name || ''));
    const head = 15 + (h % 4);
    const shoulder = 30 + ((h >>> 4) % 8);
    return `<svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMax meet" fill="currentColor" aria-hidden="true" focusable="false">`
        + `<circle cx="50" cy="${38 + ((h >>> 8) % 4)}" r="${head}"/>`
        + `<path d="M${50 - shoulder} 120 C${50 - shoulder} 78 ${50 - 12} 66 50 66 C${50 + 12} 66 ${50 + shoulder} 78 ${50 + shoulder} 120 Z"/>`
        + `</svg>`;
}
