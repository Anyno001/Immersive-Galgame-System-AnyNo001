// 规则 v6 固定卡缺口算子（G2）：按计数加伤或加段（tally-strike）、按计数加格挡（tally-guard），
// 以及「本回合失去攻击力」状态 shackle（持有者自己的回合结束时清零）、juggle（每回合第 3 张攻击牌打出后复制进手牌）、
// rend-draw（每对敌人施加一次易伤抽牌）。
// 「本场 / 本回合失血次数」「本回合失血量」「本回合消耗张数」记在 res.tally，只在开战时给目录或被动里用到这些计数的卡组单位开启；
// v3–v5 已存战斗没有这些算子，单位形状与重放不变。
// 规则 v6 G5e 动态数量：按计数回复（tally-heal，只在 v6 结算）；计数源新增本回合失血量 hp-lost-turn（按点数计，上限至多 30）。
import { registerMechanic, statusDef } from './registry.js';
import { targetFactor } from './apply-status.js';

export const TALLY_SOURCES = Object.freeze([
    'exhausted', 'exhausted-turn', 'hp-losses', 'hp-losses-turn', 'played', 'attacks', 'skills',
    'discards', 'hand', 'target-debuffs', 'strength', 'deck-attacks', 'foe-poison', 'orbs', 'orb-kinds', 'target-doom',
    'hp-lost-turn',
]);
const TRACKED = new Set(['exhausted-turn', 'hp-losses', 'hp-losses-turn', 'hp-lost-turn']);
const TALLY_OPS = new Set(['tally-strike', 'tally-guard', 'tally-heal']);
const BUILTIN_DEBUFFS = Object.freeze(['weak', 'vulnerable', 'poison', 'frail', 'no-draw']);
// 估值按计数 2 计（不超过 max）。
const EXPECTED = 2;
const COUNT_MAX = 10;
// 按点数计的计数源（失血量）上限放宽到 30。
const AMOUNT_MAX = 30;
const AMOUNT_SOURCES = new Set(['hp-lost-turn']);
const HEAL_MAX = 60;
const SOURCE_TEXT = Object.freeze({
    exhausted: '消耗堆里每有 1 张牌', 'exhausted-turn': '本回合每消耗过 1 张牌', 'hp-losses': '本场每失去过一次生命',
    'hp-losses-turn': '本回合每失去过一次生命', played: '本回合每已打出 1 张牌', attacks: '本回合每已打出 1 张攻击牌',
    skills: '本回合每已打出 1 张技能牌', discards: '本回合每弃过 1 张牌', hand: '手牌每有 1 张', 'target-debuffs': '目标每有 1 种减益',
    strength: '每有 1 点攻击力', 'deck-attacks': '本场牌堆里每有 1 张攻击牌', 'foe-poison': '敌方每有 1 层中毒',
    orbs: '每有 1 颗法珠', 'orb-kinds': '每有 1 种法珠', 'target-doom': '目标每有 1 层灾厄',
    'hp-lost-turn': '本回合每失去 1 点生命',
});
const st = (unit, key) => unit?.statuses?.[key] || 0;
const isDebuff = (key) => BUILTIN_DEBUFFS.includes(key) || Boolean(statusDef(key)?.debuff);
const typeOf = (state, inst) => {
    const entry = state.cards?.[inst];
    return entry ? state.catalog?.[entry.owner]?.[entry.cardId]?.type : undefined;
};
// 结算与估算按校验缺省补齐字段：目录里的定义不一定经过 normalizeCard（静态表、测试夹具）。
const limitOf = (source) => (AMOUNT_SOURCES.has(source) ? AMOUNT_MAX : COUNT_MAX);
const maxOf = (e) => e.max ?? limitOf(e.source);
const capped = (e) => Math.min(maxOf(e), EXPECTED);

// 某计数源的当前值（只读）。
export function tallyOf(state, unit, source, targetId) {
    const pile = state?.piles?.[unit?.id];
    const stats = unit?.turnStats;
    const tally = unit?.res?.tally;
    switch (source) {
        case 'exhausted': return (pile?.exhaust || []).filter((inst) => typeOf(state, inst) !== 'power').length;
        case 'exhausted-turn': return tally?.turnExhausts || 0;
        case 'hp-losses': return tally?.hpLosses || 0;
        case 'hp-losses-turn': return tally?.turnHpLosses || 0;
        case 'played': return unit?.cardsPlayed || 0;
        case 'attacks': return stats?.attack || 0;
        case 'skills': return stats?.skill || 0;
        case 'discards': return stats?.discards || 0;
        case 'hand': return pile?.hand?.length || 0;
        case 'target-debuffs': {
            const foe = state?.units?.[targetId];
            return foe ? Object.keys(foe.statuses || {}).filter((key) => foe.statuses[key] > 0 && isDebuff(key)).length : 0;
        }
        case 'strength': return Math.max(0, st(unit, 'strength'));
        case 'deck-attacks': return ['draw', 'hand', 'discard', 'exhaust'].reduce((sum, key) => sum + (pile?.[key] || []).filter((inst) => typeOf(state, inst) === 'attack').length, 0);
        case 'foe-poison': return (state?.order || []).map((id) => state.units[id])
            .filter((other) => other?.alive && other.side !== unit?.side).reduce((sum, other) => sum + st(other, 'poison'), 0);
        case 'orbs': return unit?.res?.orbs?.list?.length || 0;
        case 'orb-kinds': return new Set((unit?.res?.orbs?.list || []).map((orb) => orb.kind)).size;
        case 'target-doom': return st(state?.units?.[targetId], 'doom');
        case 'hp-lost-turn': return tally?.turnHpLost || 0;
        default: return 0;
    }
}

// 效果列表里是否用到需要引擎外计数的源（含嵌套与升级版）。
function usesTracked(effects) {
    return (Array.isArray(effects) ? effects : []).some((e) => (TALLY_OPS.has(e?.op) && TRACKED.has(e.source))
        || usesTracked(e?.then) || usesTracked(e?.a) || usesTracked(e?.b));
}
const catalogTracks = (defs) => Object.values(defs || {}).some((def) => usesTracked(def?.effects) || usesTracked(def?.upgraded?.effects));
// 被动（含阶段被动）里用到需要计数的源：遗物与人物特性。
const passivesTrack = (unit) => [...(unit?.passives || []), ...(unit?.phases || []).flatMap((phase) => phase?.passives || [])].some((p) => usesTracked(p?.effects));

function countFields(effect, path, state, kit) {
    const at = (key) => kit.joinPath(path, key);
    const source = kit.enumField(effect.source, at('source'), state, TALLY_SOURCES);
    const limit = limitOf(source);
    return {
        source,
        per: kit.intField(effect.per, at('per'), state, 1, 10),
        max: kit.intField(effect.max, at('max'), state, 1, limit, limit),
    };
}
const countText = (e) => `${SOURCE_TEXT[e.source] || e.source}`;
const limitText = (e) => (maxOf(e) < limitOf(e.source) ? `（至多计 ${e.max} 次）` : '');
const countOf = (state, unit, e, aimId) => Math.min(maxOf(e), tallyOf(state, unit, e.source, aimId));
const strikeOf = (e, count, amountOf = (_effect, value) => value) => {
    const hitsMode = e.mode === 'hits';
    return {
        op: 'damage',
        amount: amountOf(e, Math.min(99, e.amount + (hitsMode ? 0 : e.per * count))),
        hits: Math.min(COUNT_MAX, (e.hits ?? 1) + (hitsMode ? e.per * count : 0)),
        target: e.target ?? 'enemy',
    };
};

registerMechanic({
    key: 'fixed-tally', family: 'general', archetypes: [], unitKinds: ['deck'],
    statuses: [
        { key: 'shackle', label: '本回合减攻', debuff: true },
        { key: 'juggle', label: '连环' },
        { key: 'rend-draw', label: '乘隙' },
    ],
    ops: {
        // 按计数加伤（mode damage）或加段（mode hits）。
        'tally-strike': {
            attribute: { ability: 'damage', key: 'amount', tier: 'normal', timing: 'deferred' },
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'hits', 'mode', 'source', 'per', 'max', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'tally-strike',
                    amount: kit.intField(effect.amount, at('amount'), state, 1, 40),
                    hits: kit.intField(effect.hits, at('hits'), state, 1, 5, 1),
                    mode: kit.enumField(effect.mode, at('mode'), state, ['damage', 'hits'], 'damage'),
                    ...countFields(effect, path, state, kit),
                    target: kit.enumField(effect.target, at('target'), state, kit.OFFENSE_TARGETS, 'enemy'),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                kit.strike(ctx, unit, strikeOf(effect, countOf(ctx.state, unit, effect, aimId), kit.attributeAmount), aimId, source);
            },
            value: (e) => {
                const s = strikeOf(e, capped(e));
                return s.amount * (4 / 3) * s.hits * targetFactor(e.target);
            },
            damage: (e) => {
                const s = strikeOf(e, maxOf(e));
                return s.amount * s.hits;
            },
            estimateDamage: (e, kit) => kit.estimate([strikeOf(e, countOf(kit.state, kit.attacker, e, kit.aimId), kit.attributeAmount)]),
            describe: (e, kit) => `${kit.on(e.target)}造成 ${kit.fmt(e.amount)} 点伤害${e.hits > 1 ? ` ×${e.hits}` : ''}；${countText(e)}，${e.mode === 'hits' ? `多打 ${e.per} 段` : `伤害 +${e.per}`}${limitText(e)}`,
            brief: (e) => `计数${e.mode === 'hits' ? '连击' : '加伤'}`,
            scale: { ability: 'phys', key: 'amount', max: 40 },
        },
        // 按计数加格挡：amount 为基础格挡（可为 0），每计数 +per。
        'tally-guard': {
            attribute: { ability: 'block', key: 'amount', tier: 'normal', timing: 'deferred' },
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'source', 'per', 'max', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'tally-guard',
                    amount: kit.intField(effect.amount, at('amount'), state, 0, 40, 0),
                    ...countFields(effect, path, state, kit),
                    target: kit.enumField(effect.target, at('target'), state, kit.SUPPORT_TARGETS, 'self'),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                const amount = kit.attributeAmount(effect, Math.min(99, (effect.amount || 0) + effect.per * countOf(ctx.state, unit, effect, aimId)));
                for (const target of kit.targets()) kit.gainBlock(ctx, target, kit.computeBlock(unit, amount, target, ctx.state.rulesVersion, source?.kind), source);
            },
            value: (e) => ((e.amount || 0) + e.per * capped(e)) * 1.6 * targetFactor(e.target),
            estimateBlock: (e, kit) => kit.computeBlock(kit.unit, kit.attributeAmount(e, Math.min(99, (e.amount || 0) + e.per * countOf(kit.state, kit.unit, e, kit.aimId))), kit.unit, kit.rulesVersion),
            describe: (e, kit) => `${kit.on(e.target)}获得 ${kit.fmt(e.amount, 'amount', false)} 点格挡；${countText(e)}，再 +${e.per}${limitText(e)}`,
            brief: () => '计数格挡',
        },
        // 规则 v6 G5e 按计数回复：amount 为基础回复（可为 0），每计数 +per，单次至多 HEAL_MAX；v5 及更早不结算。
        'tally-heal': {
            attribute: { ability: 'heal', key: 'amount', tier: 'normal', timing: 'deferred', max: HEAL_MAX },
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'amount', 'source', 'per', 'max', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                return {
                    op: 'tally-heal',
                    amount: kit.intField(effect.amount, at('amount'), state, 0, 20, 0),
                    ...countFields(effect, path, state, kit),
                    target: kit.enumField(effect.target, at('target'), state, kit.SUPPORT_TARGETS, 'self'),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                if (!(ctx.state.rulesVersion >= 6)) return;
                const amount = kit.attributeAmount(effect, Math.min(HEAL_MAX, (effect.amount || 0) + (effect.per ?? 1) * countOf(ctx.state, unit, effect, aimId)));
                if (amount <= 0) return;
                for (const target of kit.targets()) kit.heal(ctx, target, amount, source);
            },
            // 估值按计数上限（G5e：动态数量的估值与预算按上限算），回复每点 2，单次封顶 HEAL_MAX。
            value: (e) => Math.min(HEAL_MAX, (e.amount || 0) + (e.per ?? 1) * maxOf(e)) * 2 * targetFactor(e.target),
            describe: (e, kit) => `${kit.on(e.target)}回复 ${kit.fmt(e.amount || 0, 'amount', false)} 点生命；${countText(e)}，再 +${e.per ?? 1}${limitText(e)}`,
            brief: () => '计数回复',
        },
    },
    modifiers: {
        'outgoing-add': (attacker, target, value) => value - st(attacker, 'shackle'),
    },
    hooks: {
        // 开战：目录（或规则 v6 起被动）里用到失血 / 本回合消耗计数的卡组单位才开启 res.tally。
        'battle-start'(ctx, payload, kit) {
            for (const id of ctx.state.order) {
                const unit = ctx.state.units[id];
                const tracks = catalogTracks(ctx.state.catalog?.[id]) || (ctx.state.rulesVersion >= 6 && passivesTrack(unit));
                if (unit?.kind === 'deck' && tracks) kit.resOf(ctx, unit).tally = { hpLosses: 0, turnHpLosses: 0, turnExhausts: 0 };
            }
        },
        'hp-loss-after'(ctx, { target, hpLoss }) {
            const tally = target?.res?.tally;
            if (!tally) return;
            tally.hpLosses += 1;
            tally.turnHpLosses += 1;
            // 规则 v6 G5e：本回合失血量（按点数，懒创建，旧战局形状不变）。
            if (ctx.state.rulesVersion >= 6 && hpLoss > 0) tally.turnHpLost = (tally.turnHpLost || 0) + hpLoss;
        },
        exhaust(ctx, { unit, inst }) {
            const tally = unit?.res?.tally;
            if (tally && typeOf(ctx.state, inst) !== 'power') tally.turnExhausts += 1;
        },
        'turn-start-before'(ctx, { unit }) {
            const tally = unit?.res?.tally;
            if (!tally) return;
            tally.turnHpLosses = 0;
            tally.turnExhausts = 0;
            if (tally.turnHpLost) tally.turnHpLost = 0;
        },
        // 本回合减攻：持有者自己的回合结束时清零。
        'turn-end-after'(ctx, { unit }, kit) {
            if (st(unit, 'shackle')) kit.setStatus(unit, 'shackle', 0);
        },
        // 连环：每回合打出的第 3 张攻击牌结算完后，按层数把它的临时副本加入手牌。
        'play-after'(ctx, { unit, inst, card }, kit) {
            const stacks = st(unit, 'juggle');
            if (!stacks || unit.kind !== 'deck' || card?.type !== 'attack' || unit.turnStats?.attack !== 3) return;
            for (let i = 0; i < stacks; i += 1) kit.copyCard(ctx, unit, inst, 'hand');
        },
        // 乘隙：持有者每对敌人成功施加一次易伤，抽层数张牌。
        'debuff-applied'(ctx, { target, status, source }, kit) {
            if (status !== 'vulnerable' || source?.unitId == null) return;
            const applier = ctx.state.units[source.unitId];
            const stacks = st(applier, 'rend-draw');
            if (!stacks || applier.kind !== 'deck' || !applier.alive || applier.side === target?.side) return;
            kit.drawCards(ctx, applier, stacks);
        },
    },
});

