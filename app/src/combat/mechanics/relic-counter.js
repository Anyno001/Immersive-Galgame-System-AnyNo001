// 规则 v6 计数被动（G5-1，原版遗物的「每 N 次」「每回合第一次」「每场第一次」）：counter 算子只用在被动与技能效果里，包住 then。
// 被动照常按自己的触发器触发，counter 按触发来源计数后决定是否结算 then：
//   every —— 本场每累计 per 次触发结算一次（跨回合累计，结算后从 0 重数）；
//   turn-first —— 每回合第一次触发时结算；battle-first —— 每场第一次触发时结算。
// 计数记在 res.counters[`来源种类:来源ID`]；只在规则 v6 战斗结算，v5 及更早的战斗与重放什么都不做。
import { registerMechanic } from './registry.js';

export const COUNTER_MODES = Object.freeze(['every', 'turn-first', 'battle-first']);
const COUNTER_TEXT = Object.freeze({
    every: (e) => `每第 ${e.per} 次`,
    'turn-first': () => '每回合第一次',
    'battle-first': () => '每场第一次',
});
// 估值折算：每 N 次按 1/N，每回合第一次按八成，每场第一次按半数。
const COUNTER_WEIGHT = Object.freeze({
    every: (e) => 1 / e.per,
    'turn-first': () => 0.8,
    'battle-first': () => 0.5,
});
const counterKey = (source) => `${source?.kind || 'effect'}:${source?.id || ''}`;

// 记一次触发，返回这一次是否结算 then。
function counterFires(ctx, entry, effect) {
    if (effect.mode === 'every') {
        entry.count += 1;
        if (entry.count < effect.per) return false;
        entry.count = 0;
        return true;
    }
    if (effect.mode === 'turn-first') {
        if (entry.turn === ctx.state.turn) return false;
        entry.turn = ctx.state.turn;
        return true;
    }
    if (entry.fired) return false;
    entry.fired = true;
    return true;
}

registerMechanic({
    key: 'relic-counter', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    ops: {
        counter: {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'mode', 'per', 'then'], path, state);
                if (kit.depth > 0) return kit.addIssue(state, path, 'nested-conditional');
                if (kit.scope) return kit.addIssue(state, path, 'passive-only');
                const at = (key) => kit.joinPath(path, key);
                const mode = kit.enumField(effect.mode, at('mode'), state, COUNTER_MODES);
                if (mode !== 'every' && effect.per !== undefined) kit.addIssue(state, at('per'), 'unknown-field');
                return {
                    op: 'counter',
                    mode,
                    ...(mode === 'every' ? { per: kit.intField(effect.per, at('per'), state, 2, 20) } : {}),
                    then: kit.arrayField(effect.then, at('then'), state, 1, 3, kit.nested),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                if (!(ctx.state.rulesVersion >= 6)) return;
                const res = kit.resOf(ctx, unit);
                if (!res) return;
                if (!res.counters) res.counters = {};
                const key = counterKey(source);
                const entry = res.counters[key] || (res.counters[key] = { count: 0, turn: null, fired: false });
                if (!counterFires(ctx, entry, effect)) return;
                kit.emit(ctx, { type: 'counter', unitId: unit.id, key, mode: effect.mode });
                kit.runEffects(ctx, unit, effect.then, aimId, source);
            },
            value: (e, sum) => (COUNTER_WEIGHT[e.mode] || (() => 0))(e) * sum(e.then),
            damage: (e, effectsDamage) => effectsDamage(e.then),
            describe: (e, kit) => `${(COUNTER_TEXT[e.mode] || (() => ''))(e)}：${kit.sub(e.then)}`,
            brief: (e) => (e.mode === 'every' ? `每${e.per}次` : e.mode === 'turn-first' ? '回合首次' : '每场首次'),
        },
    },
});
