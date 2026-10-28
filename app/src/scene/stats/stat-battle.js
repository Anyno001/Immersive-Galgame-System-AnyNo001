// 战斗整场速算（§6A）与打工检定（§4.2 work）。胜负、伤势、战利品由脚本决定；逐招动作由 AI 正文决定。
import { rollStatCheck } from './stat-rng.js';
import { applyBarDirective, checkModifiers, workIncomeTier } from './stat-bars.js';
import { applyKeyEvent } from './stat-favor-events.js';
import { matchSkill } from './stat-skill-match.js';
import { DEFAULT_SPECIAL_SKILLS, clamp, withBars, withCharacter, withSkills } from './stat-state.js';

export const ENEMY_TABLE = Object.freeze({
    杂兵: Object.freeze({ value: 35, rounds: 1, hurt: '轻伤', loot: '少量' }),
    精英: Object.freeze({ value: 55, rounds: 2, hurt: '中伤', loot: '普通' }),
    头目: Object.freeze({ value: 75, rounds: 3, hurt: '重伤', loot: '昂贵' }),
});
export const COMBAT_SKILLS = Object.freeze(['格斗', '射击', '法术', '力量', '敏捷']);
export const DODGE_SKILLS = Object.freeze(['闪避', '敏捷']);
export const DEFEAT_MONEY_LOSS = 0.2;
const WIN_STAMINA = Object.freeze({ 大胜: -5, 胜: -10, 险胜: -15 });
const DEFEAT_STAMINA = -30;
const WORK_STAMINA = -15;

// 取清单里数值最高的一项；都没有时按 50 计（技能被卡配置删掉的情况）。
export function bestSkill(skills, names) {
    let best = null;
    for (const name of names) {
        const value = Number(skills && skills[name] && skills[name].value);
        if (Number.isFinite(value) && (!best || value > best.value)) best = { name, value };
    }
    return best || { name: names[0], value: 50 };
}

function target(value, shift) {
    return clamp(Math.round(value + shift), 1, 99);
}

// 一次对抗：双方各掷 d100 比成功等级，等级高者胜；同级判主角负（与 dice-check 默认平局规则一致）。
function contest(mine, foe, mods, random) {
    const me = rollStatCheck(mine, mods, random);
    const enemy = rollStatCheck(foe, {}, random);
    return { roll: me.roll, tier: me.tier, foeRoll: enemy.roll, foeTier: enemy.tier, win: me.level > enemy.level };
}

function outcomeOf(wins, rounds, dodged) {
    if (wins === rounds && dodged) return '大胜';
    if (wins === rounds || wins * 2 > rounds) return '胜';
    if (wins * 2 === rounds || (wins > 0 && dodged)) return '险胜';
    return '败';
}

// 杂兵掷 1 次、精英 2 次、头目 3 次对抗，闪避单独掷一次；数量每多一个给 1 颗惩罚骰（最多 2），队友参战给 1 颗奖励骰。
export function resolveBattle(state, { tier, count = 1, ally = null }, random) {
    const enemy = ENEMY_TABLE[tier];
    const skills = state.protagonist.skills;
    const attack = bestSkill(skills, COMBAT_SKILLS);
    const dodgeSkill = bestSkill(skills, DODGE_SKILLS);
    const base = checkModifiers(state.protagonist.bars);
    const mods = { bonus: ally ? 1 : 0, penalty: base.penalty + Math.min(2, Math.max(0, count - 1)) };
    const rounds = Array.from({ length: enemy.rounds }, () => contest(target(attack.value, base.targetShift), enemy.value, mods, random));
    const dodge = rollStatCheck(target(dodgeSkill.value, base.targetShift), mods, random);
    const wins = rounds.filter((r) => r.win).length;
    return { tier, count, ally, attack: attack.name, rounds, dodge: { roll: dodge.roll, success: dodge.success }, wins, outcome: outcomeOf(wins, rounds.length, dodge.success) };
}

function shiftBar(bars, key, delta, changes, note) {
    const from = Number(bars[key]) || 0;
    const to = key === 'money' ? Math.max(0, from + delta) : clamp(from + delta, 0, 100);
    if (to === from) return bars;
    changes.push({ source: 'battle', target: '主角', key, from, to, note });
    return { ...bars, [key]: to };
}

function applyBar(bars, directive, ctx, note) {
    const r = applyBarDirective(bars, directive, ctx.moneyTable);
    if (r.change) ctx.changes.push({ source: 'battle', target: '主角', key: r.change.key, from: r.change.from, to: r.change.to, note });
    return r.bars;
}

function markSkill(state, name) {
    const skill = state.protagonist.skills[name];
    return skill && !skill.marked ? withSkills(state, { ...state.protagonist.skills, [name]: { ...skill, marked: true } }) : state;
}

// 战败不会死亡：按敌人档受伤、体力 −30、丢失两成金钱；取胜按档消耗体力并拿战利品。并肩取胜算一次「共患难」关键事件。
export function applyBattle(state, directive, ctx) {
    const result = resolveBattle(state, directive, ctx.random);
    const enemy = ENEMY_TABLE[result.tier];
    const note = `战斗${result.outcome}`;
    let bars = state.protagonist.bars;
    if (result.outcome === '败') {
        bars = applyBar(bars, { kind: 'hurt', value: enemy.hurt }, ctx, note);
        bars = shiftBar(bars, 'stamina', DEFEAT_STAMINA, ctx.changes, note);
        bars = shiftBar(bars, 'money', -Math.floor((Number(bars.money) || 0) * DEFEAT_MONEY_LOSS), ctx.changes, note);
    } else {
        bars = shiftBar(bars, 'stamina', WIN_STAMINA[result.outcome], ctx.changes, note);
        if (result.outcome === '险胜') bars = applyBar(bars, { kind: 'hurt', value: '轻伤' }, ctx, note);
        bars = applyBar(bars, { kind: 'money', flow: '收入', value: enemy.loot }, ctx, `${note}战利品`);
    }
    let next = withBars(state, bars);
    if (result.outcome !== '败') next = markSkill(next, result.attack);
    if (result.ally && result.outcome !== '败' && next.characters[result.ally]) {
        const charm = Number(next.protagonist.skills.魅力?.value) || 50;
        const { character, result: ev } = applyKeyEvent(next.characters[result.ally], '共患难', { charm, random: ctx.random });
        if (ev.success) ctx.changes.push({ source: 'battle', target: result.ally, key: '好感', from: ev.gate, to: ev.gate + 1, note: '共患难突破' });
        ctx.events.push({ target: result.ally, ...ev });
        next = withCharacter(next, result.ally, character);
    }
    ctx.events.push({ kind: 'battle', ...result });
    ctx.flags.battle = { outcome: result.outcome, tier: result.tier, count: result.count, ally: result.ally };
    return next;
}

// 打工：按工作内容匹配技能，匹配不上用最高的特有属性；成功等级决定收入档，大失败没有收入。
export function applyWork(state, directive, ctx) {
    const skills = state.protagonist.skills;
    const matched = matchSkill(directive.value, { skills: Object.keys(skills) }).skill;
    const skill = matched || bestSkill(skills, DEFAULT_SPECIAL_SKILLS).name;
    const base = checkModifiers(state.protagonist.bars);
    const check = rollStatCheck(target(Number(skills[skill]?.value) || 50, base.targetShift), { penalty: base.penalty }, ctx.random);
    const income = workIncomeTier(check.tier);
    const note = `打工${check.tier}`;
    let bars = state.protagonist.bars;
    if (income) bars = applyBar(bars, { kind: 'money', flow: '收入', value: income }, ctx, note);
    bars = shiftBar(bars, 'stamina', WORK_STAMINA, ctx.changes, note);
    let next = withBars(state, bars);
    if (check.success) next = markSkill(next, skill);
    ctx.events.push({ kind: 'work', skill, roll: check.roll, target: check.target, tier: check.tier, income });
    ctx.flags.work = { skill, tier: check.tier, income };
    return next;
}

// 一楼最多一场战斗、一次打工。
export function settleCombat(state, directives, ctx) {
    let next = state;
    const battle = directives.find((d) => d.kind === 'battle');
    const work = directives.find((d) => d.kind === 'work');
    if (battle) next = applyBattle(next, battle, ctx);
    if (work) next = applyWork(next, work, ctx);
    return next;
}
