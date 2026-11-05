// 规则 v5 P2b 牌堆操作（只用于卡组单位）：G08 检索、G09 回收、G10 置顶与回顶、G11 回手、G12 消耗他牌、
// G13 延迟复制、G14 三选一造牌、G15 本场变形与临时升级。
// 只从手牌选牌的效果可挂起玩家待选（choose，限卡牌顶层）；从抽牌堆、弃牌堆、消耗堆或候选里取牌时由程序按估值选。
import { registerMechanic } from './registry.js';

const CARD_TYPES = ['attack', 'skill', 'power'];
const pileOf = (ctx, unit) => ctx.state.piles[unit.id];
const PILE_NAME = Object.freeze({ draw: '抽牌堆', discard: '弃牌堆', exhaust: '消耗堆' });

// 选择模式：choose 只能在卡牌顶层，self 只能用于卡牌。
function modeField(effect, path, state, kit, allowed, fallback) {
    const at = kit.joinPath(path, 'mode');
    const mode = kit.enumField(effect.mode, at, state, allowed, fallback);
    if (mode === 'choose' && kit.scope !== 'top') return kit.addIssue(state, at, 'choose-not-top-level');
    if (mode === 'self' && !kit.scope) return kit.addIssue(state, at, 'card-only');
    return mode;
}
const typeField = (effect, path, state, kit) => (effect.cardType === undefined ? {} : { cardType: kit.enumField(effect.cardType, kit.joinPath(path, 'cardType'), state, CARD_TYPES) });

// 从某个牌堆移到手牌（手牌满时进弃牌堆）。
function moveToHand(ctx, unit, kit, inst, from) {
    const pile = pileOf(ctx, unit);
    const index = pile[from].indexOf(inst);
    if (index < 0) return;
    pile[from].splice(index, 1);
    const to = pile.hand.length >= kit.handLimit ? 'discard' : 'hand';
    pile[to].push(inst);
    kit.emit(ctx, { type: 'fetch', unitId: unit.id, inst, from, to });
}

// 可作候选的牌定义：本单位卡组目录里可打出的牌（状态牌、诅咒、内置临时牌除外）。
const catalogIds = (ctx, unit, filter) => Object.keys(ctx.state.catalog[unit.id] || {}).filter((id) => {
    const def = ctx.state.catalog[unit.id][id];
    return def && !def.unplayable && !/^(status-|curse-|token-)/.test(id) && (!filter || filter(def, id));
});
const handOptions = (state, unit, kit, keep) => state.piles[unit.id].hand.filter((inst) => {
    const card = kit.cardView(state, inst);
    return card && (!keep || keep(card, state.cards[inst], state));
});
const upgradable = (card, entry, state) => entry && entry.upgraded !== true && Boolean(state.catalog[entry.owner]?.[entry.cardId]?.upgraded);
const handChoice = (keep, count = (e) => e.amount) => (state, unit, effect, kit) => (effect.mode === 'choose' || effect.from === 'choose'
    ? { options: handOptions(state, unit, kit, keep), count: Math.min(count(effect), handOptions(state, unit, kit, keep).length) } : null);

registerMechanic({
    key: 'pile', family: 'general', archetypes: [], unitKinds: ['deck'],
    ops: {
        search: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'cardType'], path, state);
                return { op: 'search', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2, 1), ...typeField(effect, path, state, kit) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const options = pileOf(ctx, unit).draw.filter((inst) => {
                    const card = kit.cardView(ctx.state, inst);
                    return card && (!effect.cardType || card.type === effect.cardType);
                });
                for (const inst of kit.selectCards(ctx, 'choose', options, Math.min(effect.amount, options.length), 'pick')) moveToHand(ctx, unit, kit, inst, 'draw');
            },
            value: (e) => e.amount * 5,
            describe: (e, kit) => `从抽牌堆检索 ${e.amount} 张${kit.typed(e.cardType)}加入手牌`,
            brief: (e) => `检索${e.amount}`,
        },
        retrieve: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'from', 'cardType'], path, state);
                return {
                    op: 'retrieve',
                    amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2, 1),
                    from: kit.enumField(effect.from, kit.joinPath(path, 'from'), state, ['discard', 'exhaust'], 'discard'),
                    ...typeField(effect, path, state, kit),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const options = pileOf(ctx, unit)[effect.from].filter((inst) => {
                    const card = kit.cardView(ctx.state, inst);
                    return card && !card.unplayable && (!effect.cardType || card.type === effect.cardType);
                });
                for (const inst of kit.selectCards(ctx, 'choose', options, Math.min(effect.amount, options.length), 'pick')) moveToHand(ctx, unit, kit, inst, effect.from);
            },
            value: (e) => e.amount * (e.from === 'exhaust' ? 7 : 4.5),
            describe: (e, kit) => `从${PILE_NAME[e.from]}取回 ${e.amount} 张${kit.typed(e.cardType)}加入手牌`,
            brief: (e) => `取回${e.amount}`,
        },
        topdeck: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'mode'], path, state);
                return { op: 'topdeck', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2, 1), mode: modeField(effect, path, state, kit, ['choose', 'random'], 'random') };
            },
            choice: handChoice(),
            apply(ctx, unit, effect, aimId, source, kit) {
                const pile = pileOf(ctx, unit);
                for (const inst of kit.selectCards(ctx, effect.mode, pile.hand.slice(), Math.min(effect.amount, pile.hand.length), 'pick')) {
                    const index = pile.hand.indexOf(inst);
                    if (index < 0) continue;
                    pile.hand.splice(index, 1);
                    pile.draw.push(inst);
                    kit.emit(ctx, { type: 'topdeck', unitId: unit.id, inst });
                }
            },
            value: (e) => e.amount * (e.mode === 'choose' ? 1.5 : 0.5),
            describe: (e) => `${e.mode === 'choose' ? '选' : '随机'} ${e.amount} 张手牌放到抽牌堆顶`,
            brief: (e) => `置顶${e.amount}`,
        },
        recur: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'to'], path, state);
                if (!kit.scope) return kit.addIssue(state, path, 'card-only');
                return { op: 'recur', to: kit.enumField(effect.to, kit.joinPath(path, 'to'), state, ['hand', 'top']) };
            },
            apply(ctx, unit, effect, aimId, source) {
                if (source?.kind === 'card' && ctx.inst) ctx.recur = effect.to;
            },
            value: (e) => (e.to === 'hand' ? 5 : 2.5),
            describe: (e) => (e.to === 'hand' ? '打出后回到手牌' : '打出后放回抽牌堆顶'),
            brief: (e) => (e.to === 'hand' ? '回手' : '回顶'),
        },
        'exhaust-other': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'from', 'mode'], path, state);
                const from = kit.enumField(effect.from, kit.joinPath(path, 'from'), state, ['hand', 'draw'], 'hand');
                const mode = modeField(effect, path, state, kit, from === 'draw' ? ['random'] : ['choose', 'random'], 'random');
                return { op: 'exhaust-other', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 3, 1), from, mode };
            },
            choice: (state, unit, effect, kit) => (effect.from === 'hand' ? handChoice()(state, unit, effect, kit) : null),
            apply(ctx, unit, effect, aimId, source, kit) {
                const list = pileOf(ctx, unit)[effect.from];
                for (const inst of kit.selectCards(ctx, effect.mode, list.slice(), Math.min(effect.amount, list.length), 'discard')) {
                    const current = pileOf(ctx, unit)[effect.from];
                    const index = current.indexOf(inst);
                    if (index < 0) continue;
                    current.splice(index, 1);
                    kit.exhaustCard(ctx, unit, inst);
                }
            },
            value: (e) => e.amount * (e.from === 'draw' ? 0.5 : e.mode === 'choose' ? 1.5 : -2),
            describe: (e) => `${e.from === 'draw' ? '随机从抽牌堆' : e.mode === 'choose' ? '从手牌选' : '随机从手牌'}消耗 ${e.amount} 张牌`,
            brief: (e) => `耗他${e.amount}`,
        },
        'copy-next': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'from'], path, state);
                const at = kit.joinPath(path, 'from');
                const from = kit.enumField(effect.from, at, state, ['self', 'choose'], 'self');
                if (from === 'choose' && kit.scope !== 'top') return kit.addIssue(state, at, 'choose-not-top-level');
                if (from === 'self' && !kit.scope) return kit.addIssue(state, at, 'card-only');
                return { op: 'copy-next', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2, 1), from };
            },
            choice: handChoice(null, () => 1),
            apply(ctx, unit, effect, aimId, source, kit) {
                const picked = effect.from === 'self' ? (ctx.inst ? [ctx.inst] : []) : kit.selectCards(ctx, 'choose', pileOf(ctx, unit).hand.slice(), 1, 'pick');
                for (const inst of picked) {
                    const entry = ctx.state.cards[inst];
                    if (!entry) continue;
                    const res = kit.resOf(ctx, unit);
                    res.copyNext = [...(res.copyNext || []), { cardId: entry.cardId, upgraded: entry.upgraded === true, amount: effect.amount }];
                    kit.emit(ctx, { type: 'copy-next', unitId: unit.id, inst, amount: effect.amount });
                }
            },
            value: (e) => e.amount * (e.from === 'choose' ? 5 : 4),
            describe: (e) => (e.from === 'self' ? `下回合开始时，将本牌的 ${e.amount} 张临时副本加入手牌` : `选 1 张手牌，下回合开始时将它的 ${e.amount} 张临时副本加入手牌`),
            brief: (e) => `续${e.amount}`,
        },
        discover: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'cardType', 'free'], path, state);
                if (effect.free !== undefined && typeof effect.free !== 'boolean') return kit.addIssue(state, kit.joinPath(path, 'free'), 'expected-boolean');
                return { op: 'discover', ...typeField(effect, path, state, kit), ...(effect.free ? { free: true } : {}) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const pool = catalogIds(ctx, unit, (def) => !effect.cardType || def.type === effect.cardType);
                const options = [];
                while (pool.length && options.length < 3) options.push(pool.splice(kit.rollInt(ctx.state, pool.length), 1)[0]);
                if (!options.length) return;
                const defs = ctx.state.catalog[unit.id];
                const best = options.reduce((top, id) => (kit.cardValue(defs[id].effects) > kit.cardValue(defs[top].effects) ? id : top), options[0]);
                kit.emit(ctx, { type: 'discover', unitId: unit.id, options: options.slice(), cardId: best });
                const inst = kit.addTempCard(ctx, unit, { cardId: best, upgraded: false }, 'hand');
                if (inst && effect.free) {
                    if (!unit.turnCostMod) unit.turnCostMod = {};
                    unit.turnCostMod[inst] = -3;
                }
            },
            value: (e) => 6 + (e.free ? 3 : 0),
            describe: (e, kit) => `从卡组随机三张${kit.typed(e.cardType)}中挑 1 张，作为临时牌加入手牌${e.free ? '，本回合 0 费' : ''}`,
            brief: () => '三选一',
        },
        transmute: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'mode'], path, state);
                return { op: 'transmute', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2, 1), mode: modeField(effect, path, state, kit, ['choose', 'random'], 'random') };
            },
            choice: handChoice(),
            apply(ctx, unit, effect, aimId, source, kit) {
                const hand = pileOf(ctx, unit).hand;
                for (const inst of kit.selectCards(ctx, effect.mode, hand.slice(), Math.min(effect.amount, hand.length), 'discard')) {
                    const entry = ctx.state.cards[inst];
                    if (!entry) continue;
                    const pool = catalogIds(ctx, unit, (def, id) => id !== entry.cardId);
                    if (!pool.length) continue;
                    const cardId = pool[kit.rollInt(ctx.state, pool.length)];
                    const card = kit.ownCard(ctx, inst);
                    const from = card.cardId;
                    card.cardId = cardId;
                    card.upgraded = false;
                    delete card.grow;
                    delete card.costMod;
                    kit.emit(ctx, { type: 'transform', unitId: unit.id, inst, from, cardId });
                }
            },
            value: (e) => e.amount * (e.mode === 'choose' ? 2 : 1),
            describe: (e) => `本场把${e.mode === 'choose' ? '选中的' : '随机'} ${e.amount} 张手牌变成卡组里的另一张牌`,
            brief: (e) => `变形${e.amount}`,
        },
        'upgrade-card': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'mode'], path, state);
                return { op: 'upgrade-card', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2, 1), mode: modeField(effect, path, state, kit, ['self', 'choose', 'random'], 'random') };
            },
            choice: handChoice(upgradable),
            apply(ctx, unit, effect, aimId, source, kit) {
                const options = effect.mode === 'self' ? (ctx.inst ? [ctx.inst] : []) : handOptions(ctx.state, unit, kit, upgradable);
                const picked = effect.mode === 'self' ? options : kit.selectCards(ctx, effect.mode, options, Math.min(effect.amount, options.length), 'pick');
                for (const inst of picked) {
                    if (!upgradable(null, ctx.state.cards[inst], ctx.state)) continue;
                    kit.ownCard(ctx, inst).upgraded = true;
                    kit.emit(ctx, { type: 'upgrade-card', unitId: unit.id, inst });
                }
            },
            value: (e) => (e.mode === 'self' ? 3 : e.amount * (e.mode === 'choose' ? 4 : 3)),
            describe: (e) => (e.mode === 'self' ? '本场升级本牌' : `本场升级${e.mode === 'choose' ? '选中的' : '随机'} ${e.amount} 张手牌`),
            brief: (e) => `升级${e.mode === 'self' ? '' : e.amount}`,
        },
    },
    // 战报：牌堆操作只给当前出手者追加短句（事件不带来源，按单位归因）。
    report(event, kit) {
        if (event.unitId !== kit.actorId) return;
        const text = {
            fetch: event.from === 'draw' ? '检索出一张牌' : '取回一张牌',
            topdeck: '把一张牌放回牌堆顶',
            discover: '从三张候选中挑出一张牌',
            transform: '令一张手牌变形',
            'upgrade-card': '临时强化了一张牌',
            'copy-next': '为下回合留下一张副本',
        }[event.type];
        if (text) kit.note(event.unitId, text);
    },
    hooks: {
        // 延迟复制：下回合抽牌之后，把登记的临时副本加入手牌。
        'turn-start-after'(ctx, { unit }, kit) {
            const queued = unit.res?.copyNext;
            if (!queued) return;
            delete unit.res.copyNext;
            if (!Object.keys(unit.res).length) delete unit.res;
            for (const item of queued) for (let i = 0; i < item.amount; i += 1) kit.addTempCard(ctx, unit, { cardId: item.cardId, upgraded: item.upgraded }, 'hand');
        },
    },
});
