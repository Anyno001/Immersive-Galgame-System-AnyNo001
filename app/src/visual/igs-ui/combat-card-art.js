import { hash32 } from '../../combat/random.js';
import { RECORD_ICONS } from './record-icons.js';
import { LIVE_ICONS } from './danmaku-icons.js';

// 卡面与立绘占位的纯函数：效果说明文字、按主效果选取的本体线性图标、无立绘时的 SVG 剪影。
// SVG 只来自程序常量与数值，不含任何档案文本；同一张卡（效果相同）永远得到同一个图标。
const STATUS = Object.freeze({ vulnerable: '易伤', weak: '虚弱', strength: '力量', dexterity: '敏捷', poison: '中毒', regen: '再生', thorns: '荆棘', intangible: '无形', 'no-draw': '禁抽', endure: '不屈' });
const TARGET = Object.freeze({ enemy: '', 'all-enemies': '全体敌人', 'random-enemy': '随机敌人', self: '', ally: '一名队友', 'all-allies': '全体队友', 'other-allies': '其他队友' });
const DOUBLE_STAT = Object.freeze({ poison: '中毒层数', block: '格挡', strength: '力量' });
const WHEN = Object.freeze({
    'target-has': (v) => `目标有${STATUS[v] || v}时：`,
    'self-hp-below': (v) => `自身生命低于 ${v}% 时：`,
    'cards-played-gte': (v) => `本回合已出 ${v} 张牌时：`,
});
export const CARD_TYPE_LABELS = Object.freeze({ attack: '攻击', skill: '技能', power: '能力' });

const on = (target) => (TARGET[target] ? `对${TARGET[target]}` : '');

// fmt 只作用于可被属性换算的数值（伤害、格挡、治疗、状态层数），顺序与 card-scaling 的 effectNumbers 一致。
const plainNum = (n) => n;
function effectText(e, fmt = plainNum) {
    const sub = (list) => (list || []).map((t) => effectText(t, fmt)).join('，');
    switch (e?.op) {
        case 'damage': return `${on(e.target)}造成 ${fmt(e.amount)} 点伤害${e.hits > 1 ? ` ×${e.hits}` : ''}${e.strengthScale > 1 ? `，力量 ×${e.strengthScale} 生效` : ''}`;
        case 'block': return `${on(e.target)}获得 ${fmt(e.amount)} 点格挡`;
        case 'heal': return `${on(e.target)}回复 ${fmt(e.amount)} 点生命`;
        case 'draw': return `抽 ${e.amount} 张牌`;
        case 'energy': return `获得 ${e.amount} 点能量`;
        case 'status': return `${on(e.target)}施加 ${fmt(e.stacks)} 层${STATUS[e.status] || e.status}`;
        case 'exhaust-self': return '消耗';
        case 'conditional': return `${(WHEN[e.when?.kind] || (() => ''))(e.when?.value)}${sub(e.then)}`;
        case 'damage-from-block': return `${on(e.target)}造成等同当前格挡的伤害`;
        case 'self-damage': return `失去 ${e.amount} 点生命`;
        case 'double': return `${on(e.target)}${DOUBLE_STAT[e.stat] || e.stat}翻倍`;
        case 'next-turn':
            if (e.gain === 'energy') return `下回合获得 ${e.amount} 点能量`;
            if (e.gain === 'draw') return `下回合多抽 ${e.amount} 张牌`;
            return `下回合获得 ${e.stacks} 层${STATUS[e.status] || e.status}`;
        case 'each-turn': return `每回合开始时：${sub(e.then)}`;
        case 'hand-cost': return `本回合手牌费用 ${e.amount}`;
        case 'heal-pct': return `${on(e.target)}回复 ${e.pct}% 生命`;
        case 'cleanse': return `${on(e.target)}净化减益`;
        default: return '';
    }
}

export function describeEffects(effects) {
    return (Array.isArray(effects) ? effects : []).map((e) => effectText(e)).filter(Boolean).join('。');
}

// 带增减标记的描述片段：marks 为 'up' / 'down' / 'same' 列表（card-scaling 的 scalingMarks），base 为换算前数值（可选，与 marks 同序）；
// 返回 [{ text, mark?, base? }]，拼接后与 describeEffects 文本相同；带 mark 的数字在给了 base 时附换算前数值。渲染层只给带 mark 的数字着色。
export function describeEffectParts(effects, marks, base) {
    const tokens = [];
    const fmt = (n) => { tokens.push(n); return `\u0001${tokens.length - 1}\u0002`; };
    const text = (Array.isArray(effects) ? effects : []).map((e) => effectText(e, fmt)).filter(Boolean).join('。');
    const parts = [];
    for (const piece of text.split(/(\u0001\d+\u0002)/)) {
        if (!piece) continue;
        const m = piece.match(/^\u0001(\d+)\u0002$/);
        if (!m) { parts.push({ text: piece }); continue; }
        const i = Number(m[1]);
        const mark = Array.isArray(marks) ? marks[i] : undefined;
        if (mark !== 'up' && mark !== 'down') { parts.push({ text: String(tokens[i]) }); continue; }
        const from = Array.isArray(base) ? base[i] : undefined;
        parts.push(Number.isFinite(from) ? { text: String(tokens[i]), mark, base: from } : { text: String(tokens[i]), mark });
    }
    return parts;
}

// 卡图沿用 IGS 本体图标库（24 网格、细线描边、currentColor），颜色由样式层按卡牌类型着色。
const OP_ICON = Object.freeze({
    damage: RECORD_ICONS.weapon, block: RECORD_ICONS.armor, heal: RECORD_ICONS.potion,
    draw: RECORD_ICONS.layers, energy: RECORD_ICONS.sparkle, status: RECORD_ICONS.flame, guard: LIVE_ICONS.shield,
});

const mainOp = (effects) => {
    const list = Array.isArray(effects) ? effects : [];
    const flat = list.flatMap((e) => (e?.op === 'conditional' || e?.op === 'each-turn' ? e.then || [] : [e]));
    return (flat.find((e) => e && e.op !== 'exhaust-self') || {}).op || '';
};

export function cardArtSvg(card) {
    return OP_ICON[mainOp(card?.effects)] || RECORD_ICONS.card;
}

// 敌方意图图标：攻击 / 防御 / 治疗 / 特殊沿用本体图标库，强化 / 削弱用同一画法（24 网格、细线、currentColor）的上下箭头；颜色由样式层按意图着色。
const arrow = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
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
