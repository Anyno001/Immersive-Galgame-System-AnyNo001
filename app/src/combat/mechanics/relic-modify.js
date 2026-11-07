// 规则 v6 被动修正（G5c，原版遗物的出伤加值、易伤 / 虚弱倍率、失血减免与单回合上限、本场首次格挡翻倍）。
// relic-mod 算子只用在被动与技能效果里：结算时把一条修正记到 res.relicMods[`来源种类:来源ID:修正`]，同一来源重复触发不叠加；
// 修正在伤害、格挡、失去生命的结算中读取。只在规则 v6 登记与生效，v5 及更早的战斗与重放不受影响。
import { registerMechanic } from './registry.js';

export const RELIC_MODS = Object.freeze(['damage-add', 'vuln-up', 'vuln-down', 'weak-up', 'hp-loss-reduce', 'turn-hp-cap', 'first-block-double']);
// 各修正的数值范围；不在表中的修正不带 amount。百分比类为百分点。
const AMOUNT_RANGE = Object.freeze({
    'damage-add': [1, 20], 'vuln-up': [5, 100], 'vuln-down': [5, 50], 'weak-up': [5, 50], 'hp-loss-reduce': [1, 5], 'turn-hp-cap': [5, 99],
});
// 出伤加值的牌面过滤（只有 damage-add 可带）：牌名含关键字、已升级、X 费、带刻印；同时给出多项时须全部满足。
const CARD_FILTERS = Object.freeze(['name', 'upgraded', 'xcost', 'inscribed']);
const NAME_MAX = 6;

const modsOf = (unit) => Object.values(unit?.res?.relicMods || {});
const amountOf = (entry) => (Number.isInteger(entry?.amount) ? entry.amount : 0);
export const relicModSum = (unit, mod) => modsOf(unit).reduce((sum, entry) => (entry?.mod === mod ? sum + amountOf(entry) : sum), 0);
const relicModMin = (unit, mod) => modsOf(unit).reduce((low, entry) => (entry?.mod === mod && amountOf(entry) > 0 && (low === 0 || amountOf(entry) < low) ? amountOf(entry) : low), 0);
const hasMod = (unit, mod) => modsOf(unit).some((entry) => entry?.mod === mod);

// 牌面视图是否满足一条出伤加值的全部过滤；没有牌（被动、技能、状态等来源）一律不满足。
export function cardMatches(card, entry) {
    if (!card) return false;
    if (entry.name && !(typeof card.name === 'string' && card.name.includes(entry.name))) return false;
    if (entry.upgraded && card.upgraded !== true) return false;
    if (entry.xcost && card.cost !== 'X') return false;
    if (entry.inscribed && !card.inscription) return false;
    return true;
}
const cardBonus = (unit, card) => modsOf(unit).reduce((sum, entry) => (entry?.mod === 'damage-add' && cardMatches(card, entry) ? sum + amountOf(entry) : sum), 0);

// 虚弱、易伤的百分比（规则 v6，由 computeDamage 调用）：虚弱 75% 再减受击方的 weak-up；易伤 150% 加攻击方的 vuln-up、减受击方的 vuln-down。
export const weakPercent = (target) => Math.max(0, 75 - relicModSum(target, 'weak-up'));
export const vulnerablePercent = (attacker, target) => Math.max(100, 150 + relicModSum(attacker, 'vuln-up') - relicModSum(target, 'vuln-down'));

// 单回合失血按「玩家回合数 + 阶段」分段：玩家阶段与随后的敌方阶段各算一回合。
const turnKey = (state) => `${state.turn}|${state.phase}`;
const turnLoss = (state, unit) => (unit.res?.turnLoss?.key === turnKey(state) ? unit.res.turnLoss.sum : 0);

const filterText = (e) => `${e.upgraded ? '已升级的' : ''}${e.xcost ? 'X 费' : ''}${e.inscribed ? '带刻印的' : ''}${e.name ? `牌名含「${e.name}」的` : ''}`;
const DESCRIBE = Object.freeze({
    'damage-add': (e) => `本场${filterText(e)}牌造成的伤害 +${e.amount}`,
    'vuln-up': (e) => `易伤的敌人受到的伤害再 +${e.amount}%`,
    'vuln-down': (e) => `自身易伤时多受的伤害减少 ${e.amount}%`,
    'weak-up': (e) => `虚弱的敌人造成的伤害再 -${e.amount}%`,
    'hp-loss-reduce': (e) => `每次失去生命时少失去 ${e.amount} 点`,
    'turn-hp-cap': (e) => `每回合最多失去 ${e.amount} 点生命`,
    'first-block-double': () => '本场第一次获得格挡时翻倍',
});
const BRIEF = Object.freeze({
    'damage-add': (e) => `伤害+${e.amount}`, 'vuln-up': (e) => `易伤+${e.amount}%`, 'vuln-down': (e) => `易伤-${e.amount}%`, 'weak-up': (e) => `虚弱-${e.amount}%`,
    'hp-loss-reduce': (e) => `失血-${e.amount}`, 'turn-hp-cap': (e) => `失血≤${e.amount}`, 'first-block-double': () => '首盾翻倍',
});
// 估值：出伤加值按每场约 3 次攻击计（带过滤减为 1 次），百分比按每 5 点计 1，失血减免按每点 4，上限越低越值钱，首盾翻倍按 4。
const VALUE = Object.freeze({
    'damage-add': (e) => amountOf(e) * (CARD_FILTERS.some((key) => e[key]) ? 1 : 3),
    'vuln-up': (e) => amountOf(e) / 5, 'vuln-down': (e) => amountOf(e) / 5, 'weak-up': (e) => amountOf(e) / 5,
    'hp-loss-reduce': (e) => amountOf(e) * 4, 'turn-hp-cap': (e) => Math.max(1, (60 - amountOf(e)) / 5), 'first-block-double': () => 4,
});


function validateRelicMod(effect, path, state, kit) {
    kit.checkKnownFields(effect, ['op', 'mod', 'amount', ...CARD_FILTERS], path, state);
    if (kit.scope) return kit.addIssue(state, path, 'passive-only');
    const at = (key) => kit.joinPath(path, key);
    const mod = kit.enumField(effect.mod, at('mod'), state, RELIC_MODS);
    const range = AMOUNT_RANGE[mod];
    const out = { op: 'relic-mod', mod };
    if (range) out.amount = kit.intField(effect.amount, at('amount'), state, range[0], range[1]);
    else if (effect.amount !== undefined) kit.addIssue(state, at('amount'), 'unknown-field');
    for (const key of CARD_FILTERS) {
        if (effect[key] === undefined) continue;
        if (mod !== 'damage-add') kit.addIssue(state, at(key), 'unknown-field');
        else if (key === 'name') {
            const text = typeof effect.name === 'string' ? effect.name.trim() : '';
            if (!text || text.length > NAME_MAX) kit.addIssue(state, at(key), 'required-text', { max: NAME_MAX });
            else out.name = text;
        } else if (effect[key] !== true) kit.addIssue(state, at(key), 'invalid-enum', { allowed: [true] });
        else out[key] = true;
    }
    return out;
}

registerMechanic({
    key: 'relic-modify', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    ops: {
        'relic-mod': {
            validate: validateRelicMod,
            apply(ctx, unit, effect, aimId, source, kit) {
                if (!(ctx.state.rulesVersion >= 6)) return;
                const res = kit.resOf(ctx, unit);
                if (!res) return;
                if (!res.relicMods) res.relicMods = {};
                const key = `${source?.kind || 'effect'}:${source?.id || ''}:${effect.mod}`;
                if (res.relicMods[key]) return;
                const entry = { ...effect };
                delete entry.op;
                res.relicMods[key] = entry;
                kit.emit(ctx, { type: 'relic-mod', unitId: unit.id, mod: effect.mod });
            },
            value: (e) => (VALUE[e.mod] || (() => 0))(e),
            describe: (e) => (DESCRIBE[e.mod] || (() => ''))(e),
            brief: (e) => (BRIEF[e.mod] || (() => ''))(e),
        },
    },
    modifiers: {
        // 出伤加值：只加在牌的伤害上（computeDamage 第六个参数传入牌面视图），在攻击力之后、虚弱与易伤之前。
        'outgoing-add': (attacker, target, value, origin, info) => (info?.rulesVersion >= 6 && info.card ? value + cardBonus(attacker, info.card) : value),
    },
    hooks: {
        // 每次失去生命先减 hp-loss-reduce，再按单回合上限截断（多件上限取最低）。
        'hp-loss-before'(ctx, pre) {
            const { target } = pre;
            if (!(ctx.state.rulesVersion >= 6) || !target?.res?.relicMods) return;
            let loss = pre.hpLoss - relicModSum(target, 'hp-loss-reduce');
            const cap = relicModMin(target, 'turn-hp-cap');
            if (cap) loss = Math.min(loss, cap - turnLoss(ctx.state, target));
            pre.hpLoss = Math.max(0, loss);
        },
        'hp-loss-after'(ctx, { target, hpLoss }, kit) {
            if (!(ctx.state.rulesVersion >= 6) || !(hpLoss > 0) || !relicModMin(target, 'turn-hp-cap')) return;
            const res = kit.resOf(ctx, target);
            const key = turnKey(ctx.state);
            res.turnLoss = { key, sum: turnLoss(ctx.state, target) + hpLoss };
        },
        // 本场第一次获得格挡（大于 0）时再获得同样多的格挡；在壁垒的格挡倍增与共盾之后结算。
        'block-gained'(ctx, payload, kit) {
            const { target } = payload;
            if (!(ctx.state.rulesVersion >= 6) || !target.alive || !hasMod(target, 'first-block-double') || target.res.firstBlock) return;
            target.res.firstBlock = true;
            target.block += payload.amount;
            kit.emit(ctx, { type: 'block', source: payload.source, target: target.id, amount: payload.amount, relic: 'first-block-double' });
            payload.amount *= 2;
        },
    },
});
