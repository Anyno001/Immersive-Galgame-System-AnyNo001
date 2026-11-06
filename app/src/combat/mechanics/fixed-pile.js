// 规则 v6 固定卡缺口算子（G2）：自动打出、随机加牌、按条件消耗手牌、结束回合、赋予关键字、减益扩散、
// 洗回抽牌堆、自身减攻、改写本牌费用、抽到条件为止、溅射。只用于卡组单位，只出现在 v6 固定卡里；
// 牌堆读写只经 engineKit（选牌、消耗、临时牌、免费打出、写时复制），不引用其他战斗模块。
import { registerMechanic, statusDef } from './registry.js';
import { targetFactor } from './apply-status.js';

const CARD_TYPES = ['attack', 'skill', 'power'];
export const GRANT_FLAGS = Object.freeze(['sly', 'retain', 'ethereal']);
const FLAG_TEXT = Object.freeze({ sly: '狡黠', retain: '保留', ethereal: '虚无' });
const HAND_FILTERS = Object.freeze(['all', 'non-attack', 'status']);
const FILTER_TEXT = Object.freeze({ all: '全部手牌', 'non-attack': '手牌中所有非攻击牌', status: '手牌中所有状态牌' });
const EXHAUST_GAINS = Object.freeze(['none', 'block', 'damage', 'card']);
const BUILTIN_DEBUFFS = Object.freeze(['weak', 'vulnerable', 'poison', 'no-draw', 'frail']);
const GRANT_VALUE = Object.freeze({ sly: 1.5, retain: 2, ethereal: -1.5 });
const DRAW_UNTIL_MAX = 10;
const st = (unit, key) => unit?.statuses?.[key] || 0;
const pileOf = (ctx, unit) => ctx.state.piles[unit.id];
const isDebuff = (key) => BUILTIN_DEBUFFS.includes(key) || Boolean(statusDef(key)?.debuff);
const at = (path, kit) => (key) => kit.joinPath(path, key);
const typeField = (effect, path, state, kit) => (effect.cardType === undefined ? {} : { cardType: kit.enumField(effect.cardType, kit.joinPath(path, 'cardType'), state, CARD_TYPES) });
const boolField = (effect, key, path, state, kit) => {
    if (effect[key] === undefined) return {};
    if (typeof effect[key] !== 'boolean') return kit.addIssue(state, kit.joinPath(path, key), 'expected-boolean') ?? {};
    return effect[key] ? { [key]: true } : {};
};
// 本单位卡组目录里可打出的牌（基础牌、状态牌、诅咒、内置临时牌除外）。
const catalogIds = (ctx, unit, filter) => Object.keys(ctx.state.catalog[unit.id] || {}).filter((id) => {
    const def = ctx.state.catalog[unit.id][id];
    return def && !def.unplayable && def.rarity !== 'basic' && !/^(status-|curse-|token-)/.test(id) && (!filter || filter(def));
});

// 免费打出一张已在弃牌堆的牌；exhaust 时打完仍在弃牌堆的移进消耗堆。不可打出的牌只弃置。
function autoPlay(ctx, unit, kit, inst, exhaust) {
    const card = kit.cardView(ctx.state, inst);
    if (!card) return;
    pileOf(ctx, unit).discard.push(inst);
    if (!card.unplayable) kit.freePlay(ctx, unit, inst, card, 'autoplay');
    if (!exhaust) return;
    const discard = pileOf(ctx, unit).discard;
    const index = discard.indexOf(inst);
    if (index < 0) return;
    discard.splice(index, 1);
    kit.exhaustCard(ctx, unit, inst);
}


const REQUIRE_KINDS = Object.freeze(['draw-empty', 'hand-all-attack', 'hand-lte']);
const REQUIRE_TEXT = Object.freeze({ 'draw-empty': () => '抽牌堆为空时', 'hand-all-attack': () => '其余手牌全是攻击牌时', 'hand-lte': (v) => `其余手牌不多于 ${v} 张时` });
function requireHolds(ctx, unit, kit, effect) {
    const pile = pileOf(ctx, unit);
    if (effect.when === 'draw-empty') return pile.draw.length === 0;
    if (effect.when === 'hand-lte') return pile.hand.length <= effect.value;
    return pile.hand.every((inst) => inst === ctx.inst || kit.cardView(ctx.state, inst)?.type === 'attack');
}
const handOf = (ctx, unit, kit, keep) => pileOf(ctx, unit).hand.filter((inst) => {
    const card = kit.cardView(ctx.state, inst);
    return card && (!keep || keep(card, inst));
});
const exhaustKeep = (filter) => (card) => (filter === 'all' ? true : filter === 'status' ? /^status-/.test(card.id) : card.type !== 'attack');
const foesOf = (ctx, unit) => ctx.state.order.map((id) => ctx.state.units[id]).filter((other) => other?.alive && other.side !== unit.side);
// 规则 v6 随机加牌的来源：deck 为本单位卡组目录（缺省，旧行为）；class / general 为开战快照里的本职业 / 无色固定池（setup.units[].pools）。
// 快照没有对应池时退回卡组目录。取到的池牌定义写进本单位目录后再作临时牌。
export const RANDOM_CARD_POOLS = Object.freeze(['deck', 'class', 'general']);
const POOL_TEXT = Object.freeze({ deck: '', class: '本职业', general: '无色' });
const poolDefs = (ctx, unit, pool) => (pool && pool !== 'deck' ? ctx.state.pools?.[unit.id]?.[pool] || null : null);
const playableIn = (defs, filter) => Object.keys(defs).filter((id) => {
    const def = defs[id];
    return def && !def.unplayable && def.rarity !== 'basic' && !/^(status-|curse-|token-)/.test(id) && (!filter || filter(def));
});
const randomCards = (ctx, unit, kit, effect) => {
    const source = poolDefs(ctx, unit, effect.pool);
    const keep = (def) => !effect.cardType || def.type === effect.cardType;
    for (let i = 0; i < effect.amount; i += 1) {
        const pool = source ? playableIn(source, keep) : catalogIds(ctx, unit, keep);
        if (!pool.length) return;
        const cardId = pool[kit.rollInt(ctx.state, pool.length)];
        if (source) {
            const known = ctx.state.catalog[unit.id]?.[cardId];
            if (!known) kit.ownCatalog(ctx, unit.id)[cardId] = JSON.parse(JSON.stringify(source[cardId]));
            else if (known.name !== source[cardId].name) continue;
        }
        const def = ctx.state.catalog[unit.id][cardId];
        const inst = kit.addTempCard(ctx, unit, { cardId, upgraded: Boolean(effect.upgraded && def.upgraded) }, 'hand');
        if (inst && effect.free) {
            if (!unit.turnCostMod) unit.turnCostMod = {};
            unit.turnCostMod[inst] = -3;
        }
    }
};

// 自动打出：从抽牌堆顶或随机手牌取 N 张免费打出（不付费、不计出牌数），可选打出后消耗。嵌套过深时不结算。
const AUTOPLAY_DEPTH = 4;
const autoplayOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'from', 'amount', 'cardType', 'exhaust'], path, state);
        return {
            op: 'autoplay',
            from: kit.enumField(effect.from, kit.joinPath(path, 'from'), state, ['draw', 'hand'], 'draw'),
            amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 3, 1),
            ...typeField(effect, path, state, kit),
            ...boolField(effect, 'exhaust', path, state, kit),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if ((ctx.depth || 0) >= AUTOPLAY_DEPTH) return;
        for (let i = 0; i < effect.amount && unit.alive && !ctx.state.outcome; i += 1) {
            const pile = pileOf(ctx, unit);
            const list = effect.from === 'draw' ? pile.draw : pile.hand;
            const options = list.filter((inst) => inst !== ctx.inst && (!effect.cardType || kit.cardView(ctx.state, inst)?.type === effect.cardType));
            if (!options.length) return;
            const inst = effect.from === 'draw' ? options[options.length - 1] : options[kit.rollInt(ctx.state, options.length)];
            list.splice(list.indexOf(inst), 1);
            autoPlay(ctx, unit, kit, inst, effect.exhaust === true);
        }
    },
    value: (e) => (e.amount ?? 1) * ((e.from ?? 'draw') === 'draw' ? 6 : 7) - (e.exhaust ? (e.amount ?? 1) : 0),
    describe: (e, kit) => `${e.from === 'draw' ? '打出抽牌堆顶' : '随机打出手牌中'} ${e.amount} 张${kit.typed(e.cardType)}${e.exhaust ? '，并将其消耗' : ''}`,
    brief: (e) => `自动打出${e.amount}`,
};

// 随机加牌：从本单位卡组目录（或开战快照里的本职业 / 无色固定池）随机 N 张作临时牌入手，可限牌型、本回合 0 费、升级。
const randomCardOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'amount', 'cardType', 'free', 'upgraded', 'pool'], path, state);
        const pool = effect.pool === undefined ? 'deck' : kit.enumField(effect.pool, kit.joinPath(path, 'pool'), state, RANDOM_CARD_POOLS);
        return {
            op: 'random-card',
            amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 3, 1),
            ...typeField(effect, path, state, kit),
            ...boolField(effect, 'free', path, state, kit),
            ...boolField(effect, 'upgraded', path, state, kit),
            ...(pool && pool !== 'deck' ? { pool } : {}),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        randomCards(ctx, unit, kit, effect);
    },
    value: (e) => (e.amount ?? 1) * (4 + (e.free ? 3 : 0) + (e.upgraded ? 1 : 0)),
    describe: (e, kit) => `随机生成 ${e.amount ?? 1} 张${e.upgraded ? '升级过的' : ''}${POOL_TEXT[e.pool] || ''}${kit.typed(e.cardType)}作为临时牌加入手牌${e.free ? '，本回合 0 费' : ''}`,
    brief: (e) => `随机牌${e.amount}`,
};
// 按筛选消耗手牌（本牌除外）；每消耗 1 张按 gain 获得格挡、对随机敌人造成伤害或抽 1 张牌。
const exhaustHandOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'filter', 'gain', 'per'], path, state);
        const f = at(path, kit);
        const gain = kit.enumField(effect.gain, f('gain'), state, EXHAUST_GAINS, 'none');
        const counted = gain === 'block' || gain === 'damage';
        if (!counted && effect.per !== undefined) kit.addIssue(state, f('per'), 'unknown-field');
        return {
            op: 'exhaust-hand',
            filter: kit.enumField(effect.filter, f('filter'), state, HAND_FILTERS, 'all'),
            gain,
            ...(counted ? { per: kit.intField(effect.per, f('per'), state, 1, 10) } : {}),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        const pile = pileOf(ctx, unit);
        const list = handOf(ctx, unit, kit, exhaustKeep(effect.filter)).filter((inst) => inst !== ctx.inst);
        for (const inst of list) {
            pile.hand.splice(pile.hand.indexOf(inst), 1);
            kit.exhaustCard(ctx, unit, inst);
        }
        const n = list.length;
        if (!n || effect.gain === 'none' || !unit.alive || ctx.state.outcome) return;
        if (effect.gain === 'card') kit.drawCards(ctx, unit, n);
        else if (effect.gain === 'block') kit.gainBlock(ctx, unit, kit.computeBlock(unit, Math.min(99, effect.per * n), unit, ctx.state.rulesVersion, source?.kind), source);
        else for (let i = 0; i < n && unit.alive && !ctx.state.outcome; i += 1) kit.strike(ctx, unit, { op: 'damage', amount: effect.per, hits: 1, target: 'random-enemy' }, aimId, source);
    },
    value: (e) => (e.filter === 'status' ? 2 : -1) + (e.gain === 'block' ? e.per * 2 * 1.6 : e.gain === 'damage' ? e.per * 2 * (4 / 3) * 0.85 : e.gain === 'card' ? 8 : 0),
    describe: (e, kit) => `${kit.kw('exhaust', '消耗')}${FILTER_TEXT[e.filter]}${e.gain === 'block' ? `，每消耗 1 张获得 ${e.per} 点格挡` : e.gain === 'damage' ? `，每消耗 1 张对随机敌人造成 ${e.per} 点伤害` : e.gain === 'card' ? '，每消耗 1 张抽 1 张牌' : ''}`,
    brief: () => '消耗手牌',
};

// 结束回合：只对主控单位生效，由引擎在本次动作结算完后结束玩家回合。
const endTurnOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op'], path, state);
        return { op: 'end-turn' };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if (unit.id === ctx.state.controlledId) kit.requestEndTurn(ctx);
    },
    value: () => -4,
    describe: () => '结束你的回合',
    brief: () => '结束回合',
};

// 赋予关键字：本场给手牌（本牌除外）中全部或随机 1 张指定牌型的牌加狡黠 / 保留 / 虚无，记在 state.cards[inst].grants。
const grantFlagOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'flag', 'scope', 'cardType'], path, state);
        const f = at(path, kit);
        return {
            op: 'grant-flag',
            flag: kit.enumField(effect.flag, f('flag'), state, GRANT_FLAGS),
            scope: kit.enumField(effect.scope, f('scope'), state, ['hand', 'random'], 'hand'),
            ...typeField(effect, path, state, kit),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        const options = handOf(ctx, unit, kit, (card, inst) => inst !== ctx.inst && !card[effect.flag] && (!effect.cardType || card.type === effect.cardType));
        const picks = effect.scope === 'hand' ? options : options.length ? [options[kit.rollInt(ctx.state, options.length)]] : [];
        for (const inst of picks) {
            const entry = kit.ownCard(ctx, inst);
            entry.grants = [...(entry.grants || []), effect.flag];
            kit.emit(ctx, { type: 'card-granted', unitId: unit.id, inst, flag: effect.flag });
        }
    },
    value: (e) => (GRANT_VALUE[e.flag] || 0) * ((e.scope ?? 'hand') === 'hand' ? 3 : 1),
    describe: (e, kit) => `${e.scope === 'hand' ? `手牌中所有${kit.typed(e.cardType)}` : `随机 1 张手牌${e.cardType ? `中的${kit.typed(e.cardType)}` : ''}`}本场获得${kit.kw(e.flag, FLAG_TEXT[e.flag])}`,
    brief: (e) => `赋予${FLAG_TEXT[e.flag]}`,
};

// 减益扩散：把指定目标身上的每种减益按同样层数施加给其余存活敌人；strip-artifact 模式改为清空目标的人工制品。
const spreadDebuffOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'mode', 'target'], path, state);
        const f = at(path, kit);
        const mode = kit.enumField(effect.mode, f('mode'), state, ['spread', 'strip-artifact'], 'spread');
        return { op: 'spread-debuff', mode, target: kit.enumField(effect.target, f('target'), state, mode === 'spread' ? ['enemy'] : kit.OFFENSE_TARGETS, 'enemy') };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if (effect.mode === 'strip-artifact') {
            for (const target of kit.targets()) if (st(target, 'artifact')) kit.setStatus(target, 'artifact', 0);
            return;
        }
        const [aim] = kit.targets();
        if (!aim?.alive) return;
        const debuffs = Object.keys(aim.statuses).filter((key) => aim.statuses[key] > 0 && isDebuff(key)).map((key) => [key, aim.statuses[key]]);
        for (const foe of foesOf(ctx, unit)) {
            if (foe.id === aim.id) continue;
            for (const [key, stacks] of debuffs) if (foe.alive && !ctx.state.outcome) kit.addStatus(ctx, foe, key, stacks, source);
        }
    },
    value: (e) => (e.mode === 'spread' ? 7 : 4 * targetFactor(e.target)),
    describe: (e, kit) => (e.mode === 'spread' ? '把目标身上的所有减益以同样层数施加给其余敌人' : `${kit.on(e.target)}清除全部${kit.statusName('artifact')}`),
    brief: (e) => (e.mode === 'spread' ? '扩散减益' : '破除人工制品'),
};

// 洗回抽牌堆：把手牌（本牌除外）或弃牌堆全部洗进抽牌堆，可接着抽 N 张。
const reshuffleOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'from', 'draw'], path, state);
        const f = at(path, kit);
        const draw = effect.draw === undefined ? 0 : kit.intField(effect.draw, f('draw'), state, 1, 5);
        return { op: 'reshuffle', from: kit.enumField(effect.from, f('from'), state, ['hand', 'discard'], 'discard'), ...(draw ? { draw } : {}) };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        const pile = pileOf(ctx, unit);
        const moved = pile[effect.from].filter((inst) => inst !== ctx.inst);
        pile[effect.from] = pile[effect.from].filter((inst) => inst === ctx.inst);
        pile.draw.push(...moved);
        for (let i = pile.draw.length - 1; i > 0; i -= 1) {
            const j = kit.rollInt(ctx.state, i + 1);
            [pile.draw[i], pile.draw[j]] = [pile.draw[j], pile.draw[i]];
        }
        kit.emit(ctx, { type: 'reshuffle', unitId: unit.id, count: pile.draw.length, from: effect.from });
        if (moved.length) kit.fireBus(ctx, unit, 'shuffle', null);
        if (effect.draw && unit.alive && !ctx.state.outcome) kit.drawCards(ctx, unit, effect.draw);
    },
    value: (e) => (e.from === 'hand' ? -2 : 2) + (e.draw || 0) * 4,
    describe: (e) => `把${e.from === 'hand' ? '其余手牌' : '弃牌堆'}洗入抽牌堆${e.draw ? `，然后抽 ${e.draw} 张牌` : ''}`,
    brief: () => '洗回',
};

// 自身减攻（代价）：自己获得 N 层攻击力下降。
const selfWeakenOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'stacks'], path, state);
        return { op: 'self-weaken', stacks: kit.intField(effect.stacks, kit.joinPath(path, 'stacks'), state, 1, 5) };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        kit.addStatus(ctx, unit, 'atk-down', effect.stacks, source);
    },
    value: (e) => -3 * e.stacks,
    describe: (e, kit) => `自己获得 ${e.stacks} 层${kit.statusName('atk-down')}`,
    brief: (e) => `自身减攻${e.stacks}`,
};

// 改写本牌费用：本场本牌费用 ±N（内置 cost-mod 只能减）。只在由牌打出时生效。
const selfCostOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'amount'], path, state);
        const amount = kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, -3, 3);
        if (amount === 0) return kit.addIssue(state, kit.joinPath(path, 'amount'), 'out-of-range');
        return { op: 'self-cost', amount };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if (!ctx.inst || !ctx.state.cards[ctx.inst]) return;
        const entry = kit.ownCard(ctx, ctx.inst);
        entry.costMod = Math.max(-3, Math.min(3, (entry.costMod || 0) + effect.amount));
        kit.emit(ctx, { type: 'cost-mod', unitId: unit.id, inst: ctx.inst, amount: effect.amount, scope: 'combat' });
    },
    value: (e) => -e.amount * 3.75,
    describe: (e) => `本场本牌费用 ${e.amount > 0 ? '+' : ''}${e.amount}`,
    brief: (e) => `自身费用${e.amount > 0 ? '+' : ''}${e.amount}`,
};

// 抽到条件为止：hand 模式抽到手牌达到 value 张；non-type 模式逐张抽，抽到一张不是 cardType 的牌就停。单次最多 DRAW_UNTIL_MAX 张。
const drawUntilOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'until', 'value', 'cardType'], path, state);
        const f = at(path, kit);
        const until = kit.enumField(effect.until, f('until'), state, ['hand', 'non-type']);
        if (until === 'hand') {
            if (effect.cardType !== undefined) kit.addIssue(state, f('cardType'), 'unknown-field');
            return { op: 'draw-until', until, value: kit.intField(effect.value, f('value'), state, 2, DRAW_UNTIL_MAX) };
        }
        if (effect.value !== undefined) kit.addIssue(state, f('value'), 'unknown-field');
        return { op: 'draw-until', until, cardType: kit.enumField(effect.cardType, f('cardType'), state, CARD_TYPES) };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        const pile = pileOf(ctx, unit);
        if (effect.until === 'hand') {
            const need = Math.min(effect.value, kit.handLimit) - pile.hand.length;
            if (need > 0) kit.drawCards(ctx, unit, need);
            return;
        }
        for (let i = 0; i < DRAW_UNTIL_MAX && unit.alive && !ctx.state.outcome; i += 1) {
            const before = pile.hand.length;
            kit.drawCards(ctx, unit, 1);
            const now = pileOf(ctx, unit).hand;
            if (now.length <= before) return;
            if (kit.cardView(ctx.state, now[now.length - 1])?.type !== effect.cardType) return;
        }
    },
    value: (e) => (e.until === 'hand' ? Math.max(0, e.value - 3) * 4 : 9),
    describe: (e, kit) => (e.until === 'hand' ? `抽牌直到手牌有 ${e.value} 张` : `抽牌直到抽到一张不是${kit.typed(e.cardType)}的牌`),
    brief: () => '抽到为止',
};

// 打出条件：条件成立时才结算 then 里的效果（不改出牌门禁）。只用于卡牌顶层，不得嵌套。
const requiresOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'when', 'value', 'then'], path, state);
        if (kit.depth > 0) return kit.addIssue(state, path, 'nested-conditional');
        const f = at(path, kit);
        const when = kit.enumField(effect.when, f('when'), state, REQUIRE_KINDS);
        if (when !== 'hand-lte' && effect.value !== undefined) kit.addIssue(state, f('value'), 'unknown-field');
        return {
            op: 'requires',
            when,
            ...(when === 'hand-lte' ? { value: kit.intField(effect.value, f('value'), state, 0, 9) } : {}),
            then: kit.arrayField(effect.then, f('then'), state, 1, 3, kit.nested),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        if (requireHolds(ctx, unit, kit, effect)) kit.runEffects(ctx, unit, effect.then, aimId, source);
    },
    value: (e, sum) => 0.7 * sum(e.then),
    damage: (e, effectsDamage) => effectsDamage(e.then),
    estimateDamage: (e, kit) => kit.estimate(e.then),
    estimateBlock: (e, kit) => kit.estimate(e.then),
    describe: (e, kit) => `${(REQUIRE_TEXT[e.when] || (() => ''))(e.value)}：${kit.sub(e.then)}`,
    brief: () => '条件',
};

// 溅射：对指定目标造成伤害，再对其余存活敌人各造成一次与目标实际所受伤害相同的伤害。
const splashOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'amount', 'hits', 'target'], path, state);
        const f = at(path, kit);
        return {
            op: 'splash',
            amount: kit.intField(effect.amount, f('amount'), state, 1, 40),
            hits: kit.intField(effect.hits, f('hits'), state, 1, 3, 1),
            target: kit.enumField(effect.target, f('target'), state, ['enemy'], 'enemy'),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        const [aim] = kit.targets();
        if (!aim) return;
        const mark = ctx.events.length;
        kit.strike(ctx, unit, { op: 'damage', amount: effect.amount, hits: effect.hits, target: 'enemy' }, aimId, source);
        const dealt = ctx.events.slice(mark).filter((e) => e.type === 'damage' && e.target === aim.id && e.kind === 'attack' && !e.overkill && e.source?.unitId === unit.id)
            .reduce((sum, e) => sum + (e.amount || 0), 0);
        if (!dealt) return;
        for (const foe of foesOf(ctx, unit)) {
            if (foe.id === aim.id || !unit.alive || ctx.state.outcome) continue;
            kit.dealDamage(ctx, foe, dealt, source, 'attack', true);
        }
    },
    value: (e) => e.amount * (4 / 3) * (e.hits ?? 1) * 1.3,
    damage: (e) => e.amount * (e.hits ?? 1) * 2,
    estimateDamage: (e, kit) => kit.estimate([{ op: 'damage', amount: e.amount, hits: e.hits, target: 'all-enemies' }]),
    describe: (e, kit) => `造成 ${kit.fmt(e.amount)} 点伤害${e.hits > 1 ? ` ×${e.hits}` : ''}，其余敌人各受到等量伤害`,
    brief: () => '溅射',
    scale: { ability: 'phys', key: 'amount', max: 40 },
};

// 手牌变形：本场把手牌中（本牌除外）指定牌型的牌全部变成衍生牌「巨石」；本单位目录里没有时写入目录。
const BOULDER_ID = 'token-boulder';
const BOULDER = Object.freeze({
    id: BOULDER_ID, name: '巨石', type: 'attack', cost: 1, rarity: 'basic', skillRef: '巨石',
    effects: Object.freeze([Object.freeze({ op: 'damage', amount: 20, hits: 1, target: 'enemy' })]),
    upgraded: Object.freeze({ effects: Object.freeze([Object.freeze({ op: 'damage', amount: 24, hits: 1, target: 'enemy' })]) }),
});
const morphHandOp = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'cardType', 'upgraded'], path, state);
        return {
            op: 'morph-hand',
            cardType: kit.enumField(effect.cardType, kit.joinPath(path, 'cardType'), state, CARD_TYPES, 'attack'),
            ...boolField(effect, 'upgraded', path, state, kit),
        };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        const list = handOf(ctx, unit, kit, (card, inst) => inst !== ctx.inst && card.type === (effect.cardType ?? 'attack'));
        if (!list.length) return;
        if (!Object.hasOwn(ctx.state.catalog[unit.id] || {}, BOULDER_ID)) kit.ownCatalog(ctx, unit.id)[BOULDER_ID] = JSON.parse(JSON.stringify(BOULDER));
        for (const inst of list) {
            const card = kit.ownCard(ctx, inst);
            const from = card.cardId;
            card.cardId = BOULDER_ID;
            card.upgraded = effect.upgraded === true;
            delete card.grow;
            delete card.costMod;
            kit.emit(ctx, { type: 'transform', unitId: unit.id, inst, from, cardId: BOULDER_ID });
        }
    },
    value: (e) => 5 + (e.upgraded ? 1 : 0),
    describe: (e, kit) => `本场把手牌中所有${kit.typed(e.cardType ?? 'attack')}变成${e.upgraded ? '升级过的' : ''}「巨石」（1 费，造成 ${e.upgraded ? 24 : 20} 点伤害）`,
    brief: () => '化石',
};

registerMechanic({
    key: 'fixed-pile', family: 'general', archetypes: [], unitKinds: ['deck'],
    // 狱火：主控单位在玩家阶段抽到攻击牌时，立即免费打出（对最弱的敌人），嵌套过深时不结算。
    statuses: [{ key: 'draw-strike', label: '狱火' }],
    hooks: {
        draw(ctx, { unit, insts }, kit) {
            if (unit?.kind !== 'deck' || !st(unit, 'draw-strike') || !unit.alive || ctx.state.outcome) return;
            if (ctx.state.phase !== 'player' || unit.id !== ctx.state.controlledId || (ctx.depth || 0) >= AUTOPLAY_DEPTH) return;
            for (const inst of insts || []) {
                if (!unit.alive || ctx.state.outcome) return;
                const hand = pileOf(ctx, unit).hand;
                const index = hand.indexOf(inst);
                if (index < 0 || kit.cardView(ctx.state, inst)?.type !== 'attack') continue;
                hand.splice(index, 1);
                autoPlay(ctx, unit, kit, inst, false);
            }
        },
    },
    ops: {
        autoplay: autoplayOp,
        'random-card': randomCardOp,
        'exhaust-hand': exhaustHandOp,
        'end-turn': endTurnOp,
        'grant-flag': grantFlagOp,
        'spread-debuff': spreadDebuffOp,
        reshuffle: reshuffleOp,
        'self-weaken': selfWeakenOp,
        'self-cost': selfCostOp,
        'draw-until': drawUntilOp,
        requires: requiresOp,
        splash: splashOp,
        'morph-hand': morphHandOp,
    },
});


