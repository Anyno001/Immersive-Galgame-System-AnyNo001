// 规则 v5 P3 战士「锻刃」（blade 族，只给战士）：W04 焚身与余烬、W05 锻刃资源、W06 嗜血（吸取的战士版本，限攻击牌）。
// 锻造值记在 res.forge（{ value, aoe?, replay?, guard?, made? }）；专属武器牌「锻刃」的定义写进本单位 catalog，每次锻造或强化整体改写，手中实例随之变化。
import { registerMechanic } from './registry.js';

export const BLADE_ID = 'forge-blade';
export const BLADE_NAME = '锻刃';
export const BLADE_BASE = 10;
const BLADE_COST = 2;
const FORGE_MAX = 30;
const GUARD_MAX = 30;
const HONE_MODES = Object.freeze(['aoe', 'replay', 'guard']);
const HONE_TEXT = Object.freeze({ aoe: '锻刃改为攻击全体敌人', replay: '锻刃获得重演 1', guard: (n) => `锻刃打出时另获得 ${n} 点格挡` });
const HONE_VALUE = Object.freeze({ aoe: 6, replay: 10 });
const st = (unit, key) => unit?.statuses?.[key] || 0;
const statusSource = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
const bladeDamage = (forge) => Math.min(99, BLADE_BASE + forge.value);

function bladeCard(forge) {
    return {
        id: BLADE_ID, name: BLADE_NAME, type: 'attack', cost: BLADE_COST, rarity: 'basic', retain: true, skillRef: BLADE_NAME,
        ...(forge.replay ? { replay: 1 } : {}),
        effects: [
            { op: 'damage', amount: bladeDamage(forge), hits: 1, target: forge.aoe ? 'all-enemies' : 'enemy' },
            ...(forge.guard ? [{ op: 'block', amount: forge.guard, target: 'self' }] : []),
        ],
    };
}

// 锻造或强化：改写 res.forge 与锻刃定义；本场首次成功时把一张锻刃临时牌加入手牌（临时牌张数到上限时下次再补）。
function forge(ctx, unit, kit, patch) {
    if (unit.kind !== 'deck') return;
    const res = kit.resOf(ctx, unit);
    if (!res) return;
    const known = ctx.state.catalog[unit.id]?.[BLADE_ID];
    if (known && known.name !== BLADE_NAME) return;
    const prev = res.forge || { value: 0 };
    const next = { ...prev, ...patch(prev) };
    kit.ownCatalog(ctx, unit.id)[BLADE_ID] = bladeCard(next);
    if (!prev.made && kit.addTempCard(ctx, unit, { cardId: BLADE_ID, upgraded: false }, 'hand')) next.made = true;
    res.forge = next;
    kit.emit(ctx, { type: 'forge', unitId: unit.id, value: next.value, damage: bladeDamage(next) });
}

registerMechanic({
    key: 'blade', family: 'blade', archetypes: ['warrior'], unitKinds: ['deck'],
    statuses: [
        { key: 'pyre', label: '焚身' },
        { key: 'ember', label: '余烬' },
        { key: 'bloodthirst', label: '嗜血' },
    ],
    ops: {
        smith: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount'], path, state);
                return { op: 'smith', amount: kit.intField(effect.amount, kit.joinPath(path, 'amount'), state, 1, 14) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                forge(ctx, unit, kit, (prev) => ({ value: Math.min(FORGE_MAX, prev.value + effect.amount) }));
            },
            value: (e) => 8 + e.amount * 2,
            describe: (e) => `锻造 ${e.amount}：锻刃伤害 +${e.amount}（本场首次锻造把锻刃加入手牌）`,
            brief: (e) => `锻${e.amount}`,
        },
        'blade-double': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'target'], path, state);
                return { op: 'blade-double', target: kit.enumField(effect.target, kit.joinPath(path, 'target'), state, ['enemy'], 'enemy') };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const [target] = kit.targets();
                if (!target?.alive) return;
                const res = kit.resOf(ctx, unit);
                res.bladeDouble = [...new Set([...(res.bladeDouble || []), target.id])];
            },
            value: () => 8,
            describe: () => '本回合锻刃对指定敌人造成的攻击伤害翻倍', brief: () => '锻刃倍伤',
        },
        'hone-blade': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'mode', 'amount'], path, state);
                const at = (key) => kit.joinPath(path, key);
                const mode = kit.enumField(effect.mode, at('mode'), state, HONE_MODES);
                if (mode !== 'guard') {
                    if (effect.amount !== undefined) kit.addIssue(state, at('amount'), 'unknown-field');
                    return { op: 'hone-blade', mode };
                }
                return { op: 'hone-blade', mode, amount: kit.intField(effect.amount, at('amount'), state, 1, 20) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                forge(ctx, unit, kit, (prev) => (effect.mode === 'guard' ? { guard: Math.min(GUARD_MAX, (prev.guard || 0) + effect.amount) } : { [effect.mode]: true }));
            },
            value: (e) => (e.mode === 'guard' ? 4 + e.amount * 1.6 : HONE_VALUE[e.mode] || 0),
            describe: (e) => `${e.mode === 'guard' ? HONE_TEXT.guard(e.amount) : HONE_TEXT[e.mode]}（本场首次锻造把锻刃加入手牌）`,
            brief: (e) => (e.mode === 'guard' ? `锻盾${e.amount}` : e.mode === 'aoe' ? '锻群' : '锻重'),
        },
    },
    modifiers: {
        'outgoing-mult': (attacker, target, value, origin, info) =>
            info?.card?.id === BLADE_ID && attacker?.res?.bladeDouble?.includes(target?.id) ? value * 2 : value,
        // W04 焚身：技能牌 0 费（X 费牌不受影响）。
        'card-cost': (state, owner, view) => (st(owner, 'pyre') && view.type === 'skill' ? 0 : view.cost),
    },
    hooks: {
        // W04 焚身：数字费用的技能牌打出后消耗。
        'play-before'(ctx, payload) {
            const { unit, card } = payload;
            if (st(unit, 'pyre') && card.type === 'skill' && typeof card.cost === 'number') payload.exhaust = true;
        },
        // 真实消耗按原因触发；无标记旧局保留排除能力牌的历史规则。
        exhaust(ctx, { unit, inst }, kit) {
            const stacks = st(unit, 'ember');
            if (!stacks || !unit.alive || (ctx.state.exhaustRules !== 1 && kit.cardView(ctx.state, inst)?.type === 'power')) return;
            kit.gainBlock(ctx, unit, stacks, statusSource(unit, 'ember'));
        },
        // W06 嗜血：本回合攻击牌对敌方造成的实际失血按同量回复出手者。
        'damage-after'(ctx, { target, source, kind, hpLoss }, kit) {
            if (kind !== 'attack' || !(hpLoss > 0) || source?.kind !== 'card' || !ctx.inst) return;
            const attacker = ctx.state.units[source.unitId];
            if (!st(attacker, 'bloodthirst') || !attacker.alive || attacker.side === target.side) return;
            if (kit.cardView(ctx.state, ctx.inst)?.type !== 'attack') return;
            kit.heal(ctx, attacker, hpLoss, statusSource(attacker, 'bloodthirst'));
        },
        'turn-end-after'(ctx, { unit }, kit) {
            if (st(unit, 'bloodthirst')) kit.setStatus(unit, 'bloodthirst', 0);
            if (unit.res?.bladeDouble) delete unit.res.bladeDouble;
        },
    },
    report(event, kit) {
        if (event.type === 'forge' && event.unitId === kit.actorId) kit.note(event.unitId, `锻刃升至 ${event.damage} 点伤害`);
    },
});
