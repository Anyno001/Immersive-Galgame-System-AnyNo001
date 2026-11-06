// 规则 v5 P5b 卡牌刻印：附着在单张副本上的永久属性（账本 inscribe，每张最多一个、不可移除），开战时随卡组条目写进牌实例的 inscription。
// 牌面类刻印由 inscribedView 合并进 cardView，时机类刻印由本文件的钩子结算；只在 v5 战斗生效。本文件只引用 registry.js。
import { registerMechanic } from './registry.js';

// 数值为初版，待 P6 平衡复核。
export const INSCRIPTION_VALUES = Object.freeze({ deft: 3, sharp: 3, momentum: 2, nimble: 2, swift: 2, corrode: 2, ink: 1, sow: 1 });
export const INSCRIPTION_LABELS = Object.freeze({
    deft: '灵巧', sharp: '锋利', instinct: '本能', corrode: '蚀心', momentum: '动量', nimble: '灵动', flourish: '华彩', spiral: '螺旋', steady: '稳持',
    sovereign: '御准', swift: '迅思', sow: '播种', soul: '魂力', attune: '契合', float: '浮动', thrift: '渐省', kindle: '预燃', ink: '墨染',
});
export const INSCRIPTION_KEYS = Object.freeze(Object.keys(INSCRIPTION_LABELS));
export const isInscription = (key) => typeof key === 'string' && Object.hasOwn(INSCRIPTION_LABELS, key);

const hasOp = (card, op) => (card.effects || []).some((effect) => effect?.op === op);
const attack = (card) => hasOp(card, 'damage');
// 部分刻印另限牌面：伤害类要有伤害效果，灵动要有格挡，螺旋限基础牌，魂力要自带消耗，浮动、渐省要数字费用，预燃限技能牌。
const NEEDS = Object.freeze({
    sharp: attack, instinct: attack, corrode: attack, momentum: attack, ink: attack,
    nimble: (card) => hasOp(card, 'block'),
    spiral: (card) => card.rarity === 'basic',
    steady: (card) => !card.retain,
    sovereign: (card) => !(card.innate && card.retain),
    soul: (card) => hasOp(card, 'exhaust-self'),
    float: (card) => typeof card.cost === 'number',
    thrift: (card) => typeof card.cost === 'number' && card.cost > 0,
    kindle: (card) => card.type === 'skill',
});
// 能否给这张牌刻这种刻印：专属卡、不能打出的牌、状态牌一律不可刻。
export function inscribable(card, key) {
    if (!card || !isInscription(key) || card.rarity === 'signature' || card.unplayable || String(card.id ?? '').startsWith('status-')) return false;
    return NEEDS[key] ? NEEDS[key](card) : true;
}


const capped = (n) => Math.min(99, n);
const mapOp = (effects, op, fn) => effects.map((effect) => (effect?.op === op ? fn(effect) : effect));
// 牌面类刻印合并：只看顶层效果；蚀心伤害按 1.5 倍向上取整；墨染按第一个伤害效果的目标追加 1 层虚弱。
// entry.momentum（动量本场累计）、entry.floatCost（浮动本次抽到的费用）由下方钩子写入牌实例。cardView 只在规则 v5 调用。
export function inscribedView(view, entry) {
    const key = entry?.inscription;
    if (!isInscription(key)) return view;
    const out = { ...view, inscription: key };
    let effects = Array.isArray(view.effects) ? view.effects : [];
    const addDamage = (n) => { effects = mapOp(effects, 'damage', (e) => ({ ...e, amount: capped(e.amount + n) })); };
    switch (key) {
        case 'sharp': addDamage(INSCRIPTION_VALUES.sharp); break;
        case 'instinct': effects = mapOp(effects, 'damage', (e) => ({ ...e, amount: capped(e.amount * 2) })); break;
        case 'corrode': effects = mapOp(effects, 'damage', (e) => ({ ...e, amount: capped(Math.ceil(e.amount * 1.5)) })); break;
        case 'nimble': effects = mapOp(effects, 'block', (e) => ({ ...e, amount: capped(e.amount + INSCRIPTION_VALUES.nimble) })); break;
        case 'ink': {
            const hit = effects.find((e) => e?.op === 'damage');
            addDamage(INSCRIPTION_VALUES.ink);
            if (hit) effects = [...effects, { op: 'status', status: 'weak', stacks: INSCRIPTION_VALUES.ink, target: hit.target || 'enemy' }];
            break;
        }
        case 'steady': out.retain = true; break;
        case 'sovereign': out.innate = true; out.retain = true; break;
        case 'soul': effects = effects.filter((e) => e?.op !== 'exhaust-self'); break;
        case 'spiral': out.replay = (Number.isInteger(view.replay) ? view.replay : 0) + 1; break;
        case 'float': if (Number.isInteger(entry.floatCost) && typeof view.cost === 'number') out.cost = entry.floatCost; break;
        case 'thrift': if (entry.thrift > 0 && typeof view.cost === 'number') out.cost = Math.max(0, view.cost - entry.thrift); break;
        default: break;
    }
    if (key === 'momentum' && entry.momentum > 0) addDamage(entry.momentum);
    out.effects = effects;
    return out;
}

const V = INSCRIPTION_VALUES;
const keyAt = (ctx, inst) => ctx.state.cards[inst]?.inscription;
// 每场首次打出才生效的刻印；牌实例的 inscriptionUsed 记本场已打出过。
const FIRST_PLAY = new Set(['flourish', 'swift', 'sow']);

registerMechanic({
    key: 'inscription', family: 'general', archetypes: [], unitKinds: ['deck'],
    hooks: {
        // 华彩：本场首次打出时整张重演 1 次（执行次数翻倍，费用与出牌计数不变）。
        'play-before'(ctx, before) {
            const entry = ctx.state.cards[before.inst];
            if (before.unit.kind !== 'deck' || entry?.inscription !== 'flourish' || entry.inscriptionUsed) return;
            before.runs *= 2;
        },
        // 打出后：灵巧加格挡、蚀心失去生命、迅思抽牌、播种得能量（追加效果走内置算子，出牌限制照常生效）；动量累计本场伤害；渐省减费在打出后清零。
        'play-after'(ctx, { unit, inst, card }, kit) {
            const entry = ctx.state.cards[inst];
            const key = entry?.inscription;
            if (unit.kind !== 'deck' || !isInscription(key)) return;
            const first = !entry.inscriptionUsed;
            if (FIRST_PLAY.has(key) && first) kit.ownCard(ctx, inst).inscriptionUsed = true;
            if (key === 'momentum') kit.ownCard(ctx, inst).momentum = Math.min(99, (entry.momentum || 0) + V.momentum);
            if (key === 'thrift' && entry.thrift) delete kit.ownCard(ctx, inst).thrift;
            const add = [];
            if (key === 'deft') add.push({ op: 'block', amount: V.deft, target: 'self' });
            if (key === 'corrode') add.push({ op: 'self-damage', amount: V.corrode });
            if (key === 'swift' && first) add.push({ op: 'draw', amount: V.swift });
            if (key === 'sow' && first) add.push({ op: 'energy', amount: V.sow });
            if (add.length && unit.alive) kit.runEffects(ctx, unit, add, null, { unitId: unit.id, kind: 'card', id: card.id });
        },
        // 契合：弃牌堆洗回抽牌堆时放到最上面（抽牌从末尾取）。
        shuffle(ctx, { unit }) {
            if (unit.kind !== 'deck') return;
            const pile = ctx.state.piles[unit.id];
            const top = pile.draw.filter((inst) => keyAt(ctx, inst) === 'attune');
            if (top.length) pile.draw = [...pile.draw.filter((inst) => !top.includes(inst)), ...top];
        },
        // 浮动：每次抽到时费用在 0–3 随机。
        draw(ctx, { unit, insts }, kit) {
            if (unit.kind !== 'deck') return;
            for (const inst of insts) if (keyAt(ctx, inst) === 'float') kit.ownCard(ctx, inst).floatCost = kit.rollInt(ctx.state, 4);
        },
        // 渐省：回合结束仍在手中时费用 -1（最多 -3），持续到打出。
        'turn-end-before'(ctx, { unit }, kit) {
            if (unit.kind !== 'deck') return;
            for (const inst of ctx.state.piles[unit.id].hand) {
                if (keyAt(ctx, inst) !== 'thrift') continue;
                const own = kit.ownCard(ctx, inst);
                own.thrift = Math.min(3, (own.thrift || 0) + 1);
            }
        },
        // 预燃：首回合抽牌后，把抽牌堆与手牌里的预燃技能牌移入弃牌堆并免费打出（不付费、不计出牌数）。
        'battle-start'(ctx, _payload, kit) {
            for (const id of [...ctx.state.order]) {
                const unit = ctx.state.units[id];
                if (unit?.kind !== 'deck' || !unit.alive || ctx.state.outcome) continue;
                const pile = ctx.state.piles[unit.id];
                const lit = [...pile.hand, ...pile.draw].filter((inst) => keyAt(ctx, inst) === 'kindle');
                for (const inst of lit) {
                    if (!unit.alive || ctx.state.outcome) break;
                    pile.hand = pile.hand.filter((x) => x !== inst);
                    pile.draw = pile.draw.filter((x) => x !== inst);
                    pile.discard.push(inst);
                    kit.freePlay(ctx, unit, inst, kit.cardView(ctx.state, inst), 'kindle');
                }
            }
        },
    },
});

