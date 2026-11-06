// 规则 v5 P4c 敌方夺取与上限：E14 夺牌、E15 夺力、E16 无敌上限（每回合 / 单次失去生命上限）、E22 最大生命损伤（D12 只在本场有效）。
// 夺走的牌与攻防记在持有者 res.seized / res.seizedStats；持有者倒下时立即归还，分裂、退场、撤离（不发 defeated）则在主角下一回合开始时归还。
import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;
const SEIZE_STATUS = Object.freeze({ strength: 'seized-atk', dexterity: 'seized-def' });
const STAT_TEXT = Object.freeze({ strength: '攻击力', dexterity: '防御力' });
// 上限 = 层数 × 10% 最大生命（向上取整，至少 1）。
export const capOf = (unit, key) => (st(unit, key) ? Math.max(1, Math.ceil((unit.maxHp * st(unit, key)) / 10)) : 0);
// E22 / D12：本场最大生命损伤不带出战斗，战后伤势按原最大生命（本场值 + 摧魄损失量）写。
export const baseMaxHp = (unit) => unit.maxHp + (Number.isInteger(unit?.res?.maimed) && unit.res.maimed > 0 ? unit.res.maimed : 0);
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}

function giveBack(ctx, holder, kit) {
    const res = holder.res;
    if (!res?.seized && !res?.seizedStats) return;
    for (const item of res.seized || []) {
        const pile = ctx.state.piles[item.owner];
        if (!pile) continue;
        const to = pile.hand.length < kit.handLimit ? 'hand' : 'discard';
        pile[to].push(item.inst);
        kit.emit(ctx, { type: 'card-returned', unitId: holder.id, owner: item.owner, inst: item.inst, cardId: ctx.state.cards[item.inst]?.cardId ?? null, to });
    }
    for (const item of res.seizedStats || []) {
        const victim = ctx.state.units[item.victim];
        if (!victim) continue;
        kit.setStatus(victim, item.status, Math.max(0, st(victim, item.status) - item.amount));
        kit.emit(ctx, { type: 'might-returned', unitId: holder.id, victim: item.victim, stat: item.stat, amount: item.amount });
    }
    tidyRes(holder, 'seized');
    tidyRes(holder, 'seizedStats');
}

registerMechanic({
    key: 'foe-seize', family: 'general', archetypes: [], unitKinds: ['skill'],
    statuses: [
        { key: 'seized-atk', label: '被夺攻击力', debuff: true },
        { key: 'seized-def', label: '被夺防御力', debuff: true },
    ],
    modifiers: {
        'outgoing-add': (attacker, target, value) => value - st(attacker, 'seized-atk'),
        'block-add': (source, target, value) => value - st(source, 'seized-def'),
    },
    ops: {
        // E14：从对方卡组单位的手牌里按种子随机封存 amount 张；手牌为空时（敌人出手时主角手牌已在回合结束弃掉）改从抽牌堆取。
        'seize-card': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'target'], path, state);
                return { op: 'seize-card', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 2), target: 'enemy' };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                for (const target of kit.targets()) {
                    const pile = ctx.state.piles[target.id];
                    if (target.kind !== 'deck' || !target.alive || !pile) continue;
                    for (let i = 0; i < effect.amount; i += 1) {
                        const from = pile.hand.length ? 'hand' : 'draw';
                        const list = pile[from];
                        if (!list.length) break;
                        const [inst] = list.splice(kit.rollInt(ctx.state, list.length), 1);
                        const res = kit.resOf(ctx, unit);
                        if (!res.seized) res.seized = [];
                        res.seized.push({ inst, owner: target.id });
                        kit.emit(ctx, { type: 'card-seized', unitId: unit.id, owner: target.id, inst, from, cardId: ctx.state.cards[inst]?.cardId ?? null });
                    }
                }
            },
            value: (e) => e.amount * 6,
            describe: (e) => `夺走对方 ${e.amount} 张手牌封存，倒下后归还`,
            brief: (e) => `夺牌${e.amount}`,
        },
        // E15：对方陷入「被夺攻击力 / 防御力」，自身获得等量攻击力 / 防御力（被人工制品抵消时不获得）。
        'seize-might': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'stat', 'amount', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                const stat = kit.enumField(effect.stat, at('stat'), state, ['strength', 'dexterity']);
                return stat ? { op: 'seize-might', stat, amount: kit.intField(effect.amount, at('amount'), state, 1, 3), target: 'enemy' } : undefined;
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const key = SEIZE_STATUS[effect.stat];
                for (const target of kit.targets()) {
                    if (!target.alive) continue;
                    const before = st(target, key);
                    kit.addStatus(ctx, target, key, effect.amount, source);
                    const got = st(target, key) - before;
                    if (got <= 0) continue;
                    kit.addStatus(ctx, unit, effect.stat, got, source);
                    const res = kit.resOf(ctx, unit);
                    if (!res.seizedStats) res.seizedStats = [];
                    res.seizedStats.push({ victim: target.id, status: key, stat: effect.stat, amount: got });
                    kit.emit(ctx, { type: 'might-seized', unitId: unit.id, victim: target.id, stat: effect.stat, amount: got });
                }
            },
            value: (e) => e.amount * 5,
            describe: (e) => `夺走对方 ${e.amount} 点${STAT_TEXT[e.stat]}，倒下后归还`,
            brief: (e) => `夺${STAT_TEXT[e.stat]}${e.amount}`,
        },
    },
    hooks: {
        defeated(ctx, { unit }, kit) {
            giveBack(ctx, unit, kit);
        },
        // 分裂、退场、撤离不发 defeated：主角回合开始时归还已不在场者手里的东西。
        'turn-start-after'(ctx, { unit }, kit) {
            if (unit.id !== ctx.state.controlledId) return;
            for (const id of [...ctx.state.order]) {
                const other = ctx.state.units[id];
                if (other && !other.alive && (other.res?.seized || other.res?.seizedStats)) giveBack(ctx, other, kit);
            }
        },
    },
    report(event, kit) {
        if (event.type === 'card-seized') kit.note(event.owner, '一张手牌被夺走封存');
        else if (event.type === 'might-seized') kit.note(event.victim, `被夺走 ${event.amount} 点${STAT_TEXT[event.stat]}`);
    },
});

registerMechanic({
    key: 'foe-cap', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'invincible', label: '无敌' },
        { key: 'hit-cap', label: '坚韧' },
        { key: 'maim', label: '摧魄' },
    ],
    hooks: {
        // E16：单次失去生命不超过 hit-cap 上限；同一回合（state.turn）累计不超过 invincible 上限。
        'hp-loss-before'(ctx, pre, kit) {
            const { target } = pre;
            const from = pre.hpLoss;
            const hitCap = capOf(target, 'hit-cap');
            if (hitCap && pre.hpLoss > hitCap) pre.hpLoss = hitCap;
            const roundCap = capOf(target, 'invincible');
            if (roundCap) {
                const lost = target.res?.lostTurn === ctx.state.turn ? target.res.lost || 0 : 0;
                pre.hpLoss = Math.min(pre.hpLoss, Math.max(0, roundCap - lost));
            }
            if (pre.hpLoss < from) kit.emit(ctx, { type: 'hp-capped', unitId: target.id, from, to: pre.hpLoss });
        },
        'hp-loss-after'(ctx, { target, hpLoss }, kit) {
            if (!st(target, 'invincible')) return;
            const res = kit.resOf(ctx, target);
            if (res.lostTurn !== ctx.state.turn) {
                res.lostTurn = ctx.state.turn;
                res.lost = 0;
            }
            res.lost += hpLoss;
        },
        // E22：带摧魄的攻击者每次造成未格挡的攻击伤害，目标本场最大生命下降层数（不低于 1），记 res.maimed；战后伤势按原最大生命写（D12）。
        'damage-after'(ctx, { target, source, kind, hpLoss }, kit) {
            if (kind !== 'attack' || !(hpLoss > 0) || !target.alive) return;
            const attacker = source?.unitId != null ? ctx.state.units[source.unitId] : null;
            const n = st(attacker, 'maim');
            if (!n || attacker.side === target.side) return;
            const cut = Math.min(n, target.maxHp - 1);
            if (cut <= 0) return;
            target.maxHp -= cut;
            if (target.hp > target.maxHp) target.hp = target.maxHp;
            const res = kit.resOf(ctx, target);
            res.maimed = (res.maimed || 0) + cut;
            kit.emit(ctx, { type: 'maim', unitId: target.id, by: attacker.id, amount: cut, maxHp: target.maxHp });
        },
    },
    report(event, kit) {
        if (event.type === 'maim') kit.note(event.unitId, `本场最大生命 -${event.amount}`);
        else if (event.type === 'hp-capped') kit.note(event.unitId, '伤害被上限挡下一部分');
    },
});
