// 电脑侧决策：同伴（AI 控制的卡牌单位）怎么出牌、敌人下回合出什么技能、「选牌」类效果的自动选择。
// 纯函数，不改 state。随机数由调用方给（chooseSkillIntent 的 roll）。
import { canPlay, cardView, conditionHolds, effectsNeedTarget, estimateBlock, estimateDamage, livingIds, opposite, weakestId } from './battle-state.js';
import { estimateBattleEffectsValue } from './rules.js';
import { isScriptCondition, scriptConditionHolds } from './script-conditions.js';

// 前几个回合优先打出能力牌。
export const POWER_TURNS = 2;
// 同一技能连续出现达到这个次数后，下次尽量换一个。
export const MAX_SKILL_REPEAT = 2;

// X 费牌按全部能量计费，并按能量次数结算；其余牌结算一次。规则 v5 的重演牌再乘 1 + 重演次数。
const spentCost = (card, energy) => (card.cost === 'X' ? energy : card.cost);
const runTimes = (card, energy, rulesVersion) => (card.cost === 'X' ? energy : 1) * (rulesVersion >= 5 && Number.isInteger(card.replay) && card.replay > 0 ? 1 + card.replay : 1);

// unitId 这一方的敌人按已定意图，预计这回合总共能打出多少伤害。
export function incomingDamage(state, unitId) {
    const unit = state.units[unitId];
    let total = 0;
    for (const foeId of livingIds(state, opposite(unit.side))) {
        const intent = state.intents?.[foeId];
        const skill = intent && state.units[foeId].skills?.find((item) => item.id === intent.skillId);
        if (skill) total += estimateDamage(state, state.units[foeId], unit, skill.effects, intent.targetId);
    }
    return total;
}

// 取评分最高且大于 0 的候选；全部不超过 0 返回 null。并列取先出现的。
function bestBy(items, score) {
    let best = null;
    let top = 0;
    for (const item of items) {
        const value = score(item);
        if (value > top) {
            best = item;
            top = value;
        }
    }
    return best;
}

// 把一张牌包成出牌动作；需要目标时没有目标则放弃（null）。
function playFor(state, unit, card, aimId) {
    if (!effectsNeedTarget(card.effects)) return { inst: card.inst };
    const targetId = aimId ?? weakestId(state, opposite(unit.side));
    return targetId ? { inst: card.inst, targetId } : null;
}

// 评估「重复上一张」「重放下一张」时，只保留此刻真的有对象可作用的效果。
function usableEffects(state, unit, card) {
    const others = (state.piles[unit.id]?.hand || []).filter((inst) => inst !== card.inst).map((inst) => cardView(state, inst)).filter(Boolean);
    return card.effects.filter((effect) => {
        if (effect.op === 'repeat-last') return !!unit.lastPlayed;
        if (effect.op === 'replay-next') return others.some((other) => !other.unplayable && (!effect.cardType || other.type === effect.cardType));
        return true;
    });
}

// 同伴这一步出哪张牌；不出了返回 null。优先级：
// 1. 来袭伤害超过当前格挡时，选单位费用收益最高的格挡牌。
// 2. 能斩杀某个敌人时，选费用最低的那张。
// 3. 前几个回合先打能力牌。
// 4. 对最弱敌人单位费用伤害最高的牌。
// 5. 规则版本 4 起，再按效果价值估算兜底；更早的版本直接出第一张。
export function chooseAllyPlay(state, unitId) {
    const unit = state.units[unitId];
    if (!unit?.alive || unit.kind !== 'deck' || state.outcome) return null;
    const foes = livingIds(state, opposite(unit.side));
    // 规则 v5 出牌限制（E18 等）与 validatePlay / legalActions 共用 canPlay；v3/v4 与 canAfford 相同。
    const playable = (state.piles[unitId]?.hand || []).map((inst) => cardView(state, inst)).filter((card) => card && canPlay(state, unit, card));
    if (!foes.length || !playable.length) return null;
    const perCost = (card, value) => (value * runTimes(card, unit.energy, state.rulesVersion)) / Math.max(0.5, spentCost(card, unit.energy));

    if (incomingDamage(state, unitId) > unit.block) {
        const guard = bestBy(playable, (card) => perCost(card, estimateBlock(unit, card.effects, state.rulesVersion, 'card', unit.attributePolicy ? state : undefined)));
        if (guard) return playFor(state, unit, guard);
    }

    let kill = null;
    for (const card of playable) {
        const cost = spentCost(card, unit.energy);
        for (const foeId of foes) {
            const foe = state.units[foeId];
            const damage = estimateDamage(state, unit, foe, card.effects, foeId, card) * runTimes(card, unit.energy, state.rulesVersion);
            if (damage > 0 && damage >= foe.hp + foe.block && (!kill || cost < kill.cost)) kill = { card, id: foeId, cost };
        }
    }
    if (kill) return playFor(state, unit, kill.card, kill.id);

    const power = state.turn <= POWER_TURNS && playable.find((card) => card.type === 'power');
    if (power) return playFor(state, unit, power);

    const weakest = weakestId(state, opposite(unit.side));
    const weakestUnit = state.units[weakest];
    const strike = bestBy(playable, (card) => perCost(card, estimateDamage(state, unit, weakestUnit, card.effects, weakest, card)));
    if (strike) return playFor(state, unit, strike, weakest);

    if (!(state.rulesVersion >= 4)) return playFor(state, unit, playable[0], weakest);
    const valued = bestBy(playable, (card) => perCost(card, estimateBattleEffectsValue(usableEffects(state, unit, card))));
    return valued ? playFor(state, unit, valued, weakest) : null;
}

// 「选牌」类效果的自动挑选：弃牌挑价值最低的，其他挑价值最高的；价值相同取手牌里靠前的。
export function pickCards(state, insts, count, mode) {
    const valueOf = (inst) => {
        const card = cardView(state, inst);
        if (!card) return 0;
        const value = card.unplayable ? -5 : estimateBattleEffectsValue(card.effects);
        return mode === 'discard' && card.onDiscard ? value - estimateBattleEffectsValue(card.onDiscard) : value;
    };
    return insts
        .map((inst, index) => ({ inst, index, value: valueOf(inst) }))
        .sort((a, b) => (mode === 'discard' ? a.value - b.value : b.value - a.value) || a.index - b.index)
        .slice(0, count)
        .map((item) => item.inst);
}

// 最近连续重复使用的技能 id：达到 maxRepeat（缺省 MAX_SKILL_REPEAT）时返回；0 不限制连用。
function repeatedSkill(history, skills) {
    const last = history[history.length - 1];
    if (last === undefined) return null;
    let run = 0;
    for (let i = history.length - 1; i >= 0 && history[i] === last; i -= 1) run += 1;
    const limit = skills.find((skill) => skill.id === last)?.maxRepeat ?? MAX_SKILL_REPEAT;
    return limit > 0 && run >= limit ? last : null;
}

// 次数限制优先于脚本、冷却回退与连用回退，已耗尽的技能不能再次入选。
export const skillHasUses = (unit, skill) => skill.maxUses === undefined || (unit.res?.skillUses?.[skill.id] || 0) < skill.maxUses;

// 加权抽取：roll 取 0~1，按 weightOf（缺省 weight，未写为 1）落点；池为空返回 null。
function pickWeighted(pool, roll, weightOf = (item) => item.weight || 1) {
    if (!pool.length) return null;
    const total = pool.reduce((sum, item) => sum + weightOf(item), 0);
    let remaining = Math.min(0.999999, Math.max(0, Number(roll) || 0)) * total;
    for (const item of pool) {
        remaining -= weightOf(item);
        if (remaining < 0) return item;
    }
    return pool[pool.length - 1];
}

// 脚本条件：随从数 / 同伴数走脚本专用判定，其余沿用效果条件；未写条件视为成立。
const scriptHolds = (state, unit, when) => when === undefined
    || (isScriptCondition(when) ? scriptConditionHolds(state, unit, when) : conditionHolds(state, unit, when, null));

// 行动脚本的下一步。首招：opener 固定，或 openers 按权重抽一次。之后：cycle 固定循环（跳过已移除或次数耗尽的技能，末尾回到 loopFrom）；
// 或 next 转移表，按上一次出手的技能取候选行，滤掉不在、耗尽、冷却中和连用达到上限的候选后按权重抽取。
// 加权候选可带 when，条件不成立的候选不入选。cycle 的随机节点同样避开冷却中与连用达到上限的候选，全被避开时退回仍可用的候选。
// 返回 { skillId, opener } / { skillId, index } / { skillId, next }；没有脚本、没有对应行或候选全被滤掉时返回 null（回到加权随机）。
export function scriptPlan(state, unitId, roll = 0, avoid = null) {
    const unit = state.units?.[unitId];
    const script = unit?.script;
    if (!script) return null;
    const has = (id) => unit.skills.some((skill) => skill.id === id && skillHasUses(unit, skill));
    const usable = (item) => has(item.skill) && item.skill !== avoid && scriptHolds(state, unit, item.when);
    const progress = state.scripts?.[unitId] || { opened: false, step: 0 };
    if (!progress.opened) {
        if (script.opener && has(script.opener)) return { skillId: script.opener, opener: true };
        const first = pickWeighted((script.openers || []).filter(usable), roll);
        if (first) return { skillId: first.skill, opener: true };
    }
    const history = state.history?.[unitId] || [];
    const cooldowns = state.cooldowns?.[unitId] || {};
    const repeated = repeatedSkill(history, unit.skills);
    const fresh = (item) => !(cooldowns[item.skill] > 0) && item.skill !== repeated;
    if (script.next) {
        const row = script.next[history[history.length - 1]];
        if (!row) return null;
        const pick = pickWeighted(row.filter((item) => usable(item) && fresh(item)), roll);
        return pick ? { skillId: pick.skill, next: true } : null;
    }
    const cycle = Array.isArray(script.cycle) ? script.cycle : [];
    let index = progress.step < cycle.length ? progress.step : 0;
    for (let k = 0; k < cycle.length; k += 1) {
        const node = cycle[index];
        if (Array.isArray(node)) {
            const open = node.filter(usable);
            const varied = open.filter(fresh);
            const pick = pickWeighted(varied.length ? varied : open, roll);
            if (pick) return { skillId: pick.skill, index };
        } else if (node && typeof node === 'object') {
            if (has(node.skill) && scriptHolds(state, unit, node.when)) return { skillId: node.skill, index };
        } else if (has(node)) return { skillId: node, index };
        index = nextScriptStep(script, index);
    }
    return null;
}

// cycle 的一步：技能 id（固定步）；[{ skill, weight }]（随机节点，到这一步时按权重抽一个）；
// { skill, when }（条件步，规划到这一步时条件成立才出，否则跳过）。
export const scriptNodeSkills = (node) => (Array.isArray(node) ? node.map((item) => item.skill)
    : node && typeof node === 'object' ? [node.skill] : node === undefined ? [] : [node]);

// 出手的技能是否为本脚本的首招（opener 或 openers 之一）。
export const isScriptOpener = (script, skillId) => script?.opener === skillId || Boolean(script?.openers?.some((item) => item.skill === skillId));

// cycle 中 index 的下一步：走到末尾回到 loopFrom（缺省 0）。
export function nextScriptStep(script, index) {
    return index + 1 < script.cycle.length ? index + 1 : (script.loopFrom ?? 0);
}

// 敌人下回合的意图。阶段改写的意图（pendingIntent，执行前一直保留）优先；其次带脚本且脚本有可用技能时按脚本，
// cycle 的步号随意图记下（step），出手时据此推进，不受规划后局面变化影响；否则按权重随机（roll 取 0~1），
// 避开冷却中的技能与连用达到上限的技能，大招可用时必出。
// opts.avoid：受击重掷（M4）时排除当前意图的技能（只在仍有其他可选技能时生效）；
// opts.chance：概率插招（M4 script.inserts）用的独立随机数，只在单位带插招时由引擎传入。
export function chooseSkillIntent(state, unitId, roll, opts = {}) {
    const unit = state.units[unitId];
    if (!unit?.alive || !unit.skills?.length) return null;
    const targetOf = (skill) => (effectsNeedTarget(skill.effects) ? weakestId(state, opposite(unit.side)) : null);
    // 睡眠（M4，规则 v5 起）：持有 asleep 期间只用睡眠技能。
    const sleepSkill = state.rulesVersion >= 5 && (unit.statuses?.asleep || 0) > 0 && unit.script?.sleep
        && unit.skills.find((skill) => skill.id === unit.script.sleep.skill);
    if (sleepSkill) return { skillId: sleepSkill.id, targetId: targetOf(sleepSkill) };
    // 打断（M4）：触发后的插入序列（res.interrupt）按位置依次出，优先于阶段改写的意图与脚本。
    const queue = unit.res?.interrupt;
    const seq = queue && unit.script?.interrupts?.[queue.rule]?.seq;
    const queued = seq && unit.skills.find((skill) => skill.id === seq[queue.pos]);
    if (queued && skillHasUses(unit, queued)) return { skillId: queued.id, targetId: targetOf(queued) };
    const forced = unit.pendingIntent && unit.skills.find((skill) => skill.id === unit.pendingIntent);
    if (forced && skillHasUses(unit, forced)) return { skillId: forced.id, targetId: targetOf(forced) };
    // 概率插招（M4）：脚本已开场（或没有首招）后，每次规划按序检查插招，技能仍有次数且 chance 落在 pct% 内时插入；插入的招不推进脚本。
    const inserts = unit.script?.inserts;
    const opened = state.scripts?.[unitId]?.opened || (!unit.script?.opener && !unit.script?.openers);
    if (inserts && opened && Number.isFinite(opts.chance)) {
        const index = inserts.findIndex((item) => opts.chance * 100 < item.pct
            && unit.skills.some((skill) => skill.id === item.skill && skillHasUses(unit, skill)));
        const inserted = index >= 0 && unit.skills.find((skill) => skill.id === inserts[index].skill);
        if (inserted) return { skillId: inserted.id, targetId: targetOf(inserted), insert: index };
    }
    const avoid = opts.avoid ?? null;
    const plan = scriptPlan(state, unitId, roll, avoid);
    const scripted = plan && unit.skills.find((skill) => skill.id === plan.skillId);
    if (scripted) return { skillId: scripted.id, targetId: targetOf(scripted), ...(Number.isInteger(plan.index) ? { step: plan.index } : {}) };
    const cooldowns = state.cooldowns?.[unitId] || {};
    const usableAll = unit.skills.filter((skill) => skillHasUses(unit, skill));
    const dodged = avoid ? usableAll.filter((skill) => skill.id !== avoid) : usableAll;
    const available = dodged.length ? dodged : usableAll;
    if (!available.length) return null;
    const repeated = repeatedSkill(state.history?.[unitId] || [], unit.skills);
    const ready = available.filter((skill) => !(cooldowns[skill.id] > 0));
    const ultimate = ready.find((skill) => skill.ultimate === true);
    const varied = ready.filter((skill) => skill.id !== repeated);
    const pool = varied.length ? varied : ready.length ? ready : available;
    const chosen = ultimate || pickWeighted(pool, roll);
    return { skillId: chosen.id, targetId: targetOf(chosen) };
}
