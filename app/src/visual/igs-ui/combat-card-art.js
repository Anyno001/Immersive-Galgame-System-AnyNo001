import { hash32 } from '../../combat/random.js';

// 卡面与立绘占位的纯函数：效果说明文字、按卡牌数据确定性绘制的 SVG 卡图、无立绘时的 SVG 剪影。
// SVG 只由程序常量和数值拼出，不含任何档案文本；同一张卡（ID、类型、效果）永远得到同一张图。
const STATUS = Object.freeze({ vulnerable: '易伤', weak: '虚弱', strength: '力量', dexterity: '敏捷', poison: '中毒', regen: '再生', thorns: '荆棘' });
const TARGET = Object.freeze({ enemy: '', 'all-enemies': '全体敌人', 'random-enemy': '随机敌人', self: '', ally: '一名队友', 'all-allies': '全体队友' });
const WHEN = Object.freeze({
    'target-has': (v) => `目标有${STATUS[v] || v}时：`,
    'self-hp-below': (v) => `自身生命低于 ${v}% 时：`,
    'cards-played-gte': (v) => `本回合已出 ${v} 张牌时：`,
});
export const CARD_TYPE_LABELS = Object.freeze({ attack: '攻击', skill: '技能', power: '能力' });

const on = (target) => (TARGET[target] ? `对${TARGET[target]}` : '');

function effectText(e) {
    switch (e?.op) {
        case 'damage': return `${on(e.target)}造成 ${e.amount} 点伤害${e.hits > 1 ? ` ×${e.hits}` : ''}`;
        case 'block': return `${on(e.target)}获得 ${e.amount} 点格挡`;
        case 'heal': return `${on(e.target)}回复 ${e.amount} 点生命`;
        case 'draw': return `抽 ${e.amount} 张牌`;
        case 'energy': return `获得 ${e.amount} 点能量`;
        case 'status': return `${on(e.target)}施加 ${e.stacks} 层${STATUS[e.status] || e.status}`;
        case 'exhaust-self': return '消耗';
        case 'conditional': return `${(WHEN[e.when?.kind] || (() => ''))(e.when?.value)}${(e.then || []).map(effectText).join('，')}`;
        default: return '';
    }
}

export function describeEffects(effects) {
    return (Array.isArray(effects) ? effects : []).map(effectText).filter(Boolean).join('。');
}

// 卡图配色按类型固定，纹样按主效果选择，细节（角度、数量、偏移）由卡牌 ID 的哈希决定。
const PALETTE = Object.freeze({
    attack: ['#5a1f1f', '#c4483d', '#ffb38a'],
    skill: ['#16324a', '#3d7fb8', '#9fd6ff'],
    power: ['#2e1d4f', '#7d5bd0', '#d8c4ff'],
});

const mainOp = (effects) => {
    const list = Array.isArray(effects) ? effects : [];
    const flat = list.flatMap((e) => (e?.op === 'conditional' ? e.then || [] : [e]));
    return (flat.find((e) => e && e.op !== 'exhaust-self') || {}).op || 'damage';
};

function motif(op, h, [, mid, light]) {
    const r = (n, m) => ((h >>> n) % m);
    switch (op) {
        case 'damage': {
            const n = 1 + r(3, 3);
            const tilt = -35 + r(6, 30);
            return Array.from({ length: n }, (_, i) => `<path d="M${18 + i * 14} 70 L${62 + i * 14} 14" stroke="${light}" stroke-width="${4 - i}" stroke-linecap="round" transform="rotate(${tilt} 50 42)"/>`).join('')
                + `<circle cx="${40 + r(9, 20)}" cy="${30 + r(12, 20)}" r="5" fill="${light}" opacity=".6"/>`;
        }
        case 'block': return `<path d="M50 12 L76 22 V44 C76 60 64 70 50 76 C36 70 24 60 24 44 V22 Z" fill="${mid}" stroke="${light}" stroke-width="3"/>`
            + `<path d="M50 ${24 + r(4, 6)} V64" stroke="${light}" stroke-width="2" opacity=".7"/>`;
        case 'heal': return `<path d="M44 22 H56 V36 H70 V48 H56 V62 H44 V48 H30 V36 H44 Z" fill="${light}" opacity=".9"/>`
            + `<circle cx="50" cy="42" r="${26 + r(5, 6)}" fill="none" stroke="${mid}" stroke-width="2"/>`;
        case 'draw': return [0, 1, 2].map((i) => `<rect x="${30 + i * 8}" y="${18 + i * 6}" width="26" height="36" rx="3" fill="${i === 2 ? light : mid}" opacity="${0.5 + i * 0.25}" transform="rotate(${-12 + i * 12 + r(i * 3, 6)} 50 42)"/>`).join('');
        case 'energy': return `<path d="M56 10 L32 46 H48 L42 74 L68 34 H52 Z" fill="${light}"/>`;
        case 'status': {
            const n = 5 + r(2, 4);
            return Array.from({ length: n }, (_, i) => {
                const a = (Math.PI * 2 * i) / n + r(8, 10) / 10;
                return `<circle cx="${(50 + Math.cos(a) * 22).toFixed(1)}" cy="${(42 + Math.sin(a) * 22).toFixed(1)}" r="${3 + (i % 2) * 2}" fill="${light}" opacity=".8"/>`;
            }).join('') + `<circle cx="50" cy="42" r="9" fill="${mid}"/>`;
        }
        default: return `<circle cx="50" cy="42" r="18" fill="${mid}"/>`;
    }
}

export function cardArtSvg(card) {
    const type = PALETTE[card?.type] ? card.type : 'skill';
    const colors = PALETTE[type];
    const h = hash32(`${card?.id || ''}|${type}|${JSON.stringify(card?.effects || [])}`);
    const glow = 20 + (h % 50);
    return `<svg viewBox="0 0 100 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">`
        + `<rect width="100" height="84" fill="${colors[0]}"/>`
        + `<circle cx="${glow}" cy="20" r="40" fill="${colors[1]}" opacity=".35"/>`
        + motif(mainOp(card?.effects), h, colors)
        + `</svg>`;
}

// 没有立绘时的剪影：我方暖色、敌方冷色，体态细节由名字哈希决定，名字本身不进入 SVG。
export function portraitSilhouetteSvg(name, side = 'ally') {
    const h = hash32(String(name || ''));
    const [bg, body] = side === 'enemy' ? ['#24161a', '#6b3a44'] : ['#1a2230', '#4d6a8f'];
    const head = 15 + (h % 4);
    const shoulder = 30 + ((h >>> 4) % 8);
    return `<svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">`
        + `<rect width="100" height="120" fill="${bg}"/>`
        + `<circle cx="50" cy="${38 + ((h >>> 8) % 4)}" r="${head}" fill="${body}"/>`
        + `<path d="M${50 - shoulder} 120 C${50 - shoulder} 78 ${50 - 12} 66 50 66 C${50 + 12} 66 ${50 + shoulder} 78 ${50 + shoulder} 120 Z" fill="${body}"/>`
        + `</svg>`;
}
