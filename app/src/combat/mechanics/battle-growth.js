// 规则 v5 G24 永久成长、G25 击杀奖励：本场累计记在出手单位的 res.battleGrowth（{ cards: { 卡牌ID: { damage, block } }, hpMax }），
// 战后由 session.js 随战报留档并写账本 battle-growth（按卡牌 ID 记，同名副本共享）。只在 v5 战斗、卡组单位上生效；临时牌不产生永久成长。
import { registerMechanic } from './registry.js';

export const GROWTH_STATS = Object.freeze(['damage', 'block']);
export const BOUNTY_REWARDS = Object.freeze(['damage', 'block', 'hp-max', 'upgrade']);
// 本场上限；跨战斗累计由账本归并按 schema.js 的 BATTLE_GROWTH_MAX 封顶，两处同为 20。
const GROWTH_MAX = 20;
const STAT_LABEL = Object.freeze({ damage: '伤害', block: '格挡' });
const REWARD_TEXT = Object.freeze({
    damage: (n) => `本牌伤害永久 +${n}`,
    block: (n) => `本牌格挡永久 +${n}`,
    'hp-max': (n) => `最大生命永久 +${n}`,
    upgrade: () => '本场升级本牌',
});

// 写入成长（替换 res 与其内部对象，不改旧状态共享的对象），返回实际增加量。
// 规则 v5 P5a：牌实例带 copyId 时记在 copies[副本 ID]（{ cardId, damage, block }），战后只写给那一张副本；没有时按卡牌 ID 记（同名共享）。
function addGrowth(ctx, unit, kit, stat, amount, cardId, copyId) {
    const res = kit.resOf(ctx, unit);
    if (!res || amount <= 0) return 0;
    const prev = res.battleGrowth || { cards: {}, hpMax: 0 };
    let gained;
    let next;
    if (stat === 'hp-max') {
        gained = Math.min(amount, GROWTH_MAX - prev.hpMax);
        next = { ...prev, hpMax: prev.hpMax + Math.max(0, gained) };
    } else if (copyId) {
        const copies = prev.copies || {};
        const card = copies[copyId] || { cardId, damage: 0, block: 0 };
        gained = Math.min(amount, GROWTH_MAX - card[stat]);
        next = { ...prev, copies: { ...copies, [copyId]: { ...card, [stat]: card[stat] + Math.max(0, gained) } } };
    } else {
        const card = prev.cards[cardId] || { damage: 0, block: 0 };
        gained = Math.min(amount, GROWTH_MAX - card[stat]);
        next = { ...prev, cards: { ...prev.cards, [cardId]: { ...card, [stat]: card[stat] + Math.max(0, gained) } } };
    }
    if (gained <= 0) return 0;
    unit.res = { ...res, battleGrowth: next };
    kit.emit(ctx, { type: 'battle-growth', unitId: unit.id, stat, amount: gained, ...(stat === 'hp-max' ? {} : { cardId }) });
    return gained;
}

const topLevelOnly = (path, state, kit) => (kit.scope === 'top' ? null : kit.addIssue(state, path, 'card-only'));

registerMechanic({
    key: 'battle-growth', family: 'general', archetypes: [], unitKinds: ['deck'],
    ops: {
        evolve: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'stat', 'amount'], path, state);
                if (kit.scope !== 'top') return topLevelOnly(path, state, kit);
                const at = (key) => kit.joinPath(path, key);
                return { op: 'evolve', stat: kit.enumField(effect.stat, at('stat'), state, GROWTH_STATS), amount: kit.intField(effect.amount, at('amount'), state, 1, 3) };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const entry = ctx.inst ? ctx.state.cards[ctx.inst] : null;
                // 重演时整张牌多执行几次，成长只算一次；临时牌不成长。
                if (unit.kind !== 'deck' || !entry || entry.temp || (ctx.state.play?.run || 0) > 0) return;
                addGrowth(ctx, unit, kit, effect.stat, effect.amount, entry.cardId, entry.copyId);
            },
            value: (e) => e.amount * 4,
            describe: (e) => `打出后本牌${STAT_LABEL[e.stat]}永久 +${e.amount}（跨战斗保留）`,
            brief: (e) => `成长${e.amount}`,
        },
        bounty: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'reward', 'amount'], path, state);
                if (kit.scope !== 'top') return topLevelOnly(path, state, kit);
                const at = (key) => kit.joinPath(path, key);
                const reward = kit.enumField(effect.reward, at('reward'), state, BOUNTY_REWARDS);
                if (reward === 'upgrade') {
                    if (effect.amount !== undefined) kit.addIssue(state, at('amount'), 'unknown-field');
                    return { op: 'bounty', reward };
                }
                return { op: 'bounty', reward, amount: kit.intField(effect.amount, at('amount'), state, 1, reward === 'hp-max' ? 5 : 3) };
            },
            // 只是标记：奖励在 defeated 钩子里按「本牌击倒」发放。
            apply() {},
            value: (e) => (e.reward === 'upgrade' ? 2 : e.amount * 2),
            describe: (e) => `本牌击倒非爪牙敌人时：${REWARD_TEXT[e.reward](e.amount)}`,
            brief: (e) => (e.reward === 'upgrade' ? '击杀升级' : `击杀+${e.amount}`),
        },
    },
    hooks: {
        // 本牌击倒非爪牙敌人：来源须是正在结算的这张牌（ctx.inst）；爪牙标记 minion 由 P4 E12/E13 写入，之前所有敌人都算非爪牙。
        defeated(ctx, { unit: target, source }, kit) {
            if (source?.kind !== 'card' || !ctx.inst || target.minion === true) return;
            const owner = ctx.state.units[source.unitId];
            const entry = ctx.state.cards[ctx.inst];
            if (!owner || owner.kind !== 'deck' || owner.side === target.side || !entry || entry.owner !== owner.id || entry.cardId !== source.id) return;
            const view = kit.cardView(ctx.state, ctx.inst);
            for (const effect of view?.effects || []) {
                if (effect.op !== 'bounty') continue;
                if (effect.reward === 'upgrade') {
                    const def = ctx.state.catalog[owner.id]?.[entry.cardId];
                    if (!def?.upgraded || ctx.state.cards[ctx.inst].upgraded) continue;
                    kit.ownCard(ctx, ctx.inst).upgraded = true;
                    kit.emit(ctx, { type: 'battle-growth', unitId: owner.id, stat: 'upgrade', amount: 1, cardId: entry.cardId });
                } else if (!entry.temp) {
                    addGrowth(ctx, owner, kit, effect.reward, effect.amount, entry.cardId, entry.copyId);
                }
            }
        },
    },
    report(event, kit) {
        if (event.type === 'battle-growth' && event.unitId === kit.actorId && REWARD_TEXT[event.stat]) kit.note(event.unitId, REWARD_TEXT[event.stat](event.amount));
    },
});

