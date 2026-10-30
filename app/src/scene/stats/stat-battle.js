// 战斗整场速算（§6A、v2 §7.3）与打工检定（§4.2 work）。胜负、伤势、战利品由脚本决定；逐招动作由 AI 正文决定。
// 掷骰走检定引擎：CoC 为对抗（主角反击时同级攻击方胜），D&D 为攻击检定对 AC、闪避为敏捷豁免。
import { applyBarDirective, workIncomeTier } from './stat-bars.js';
import { applyKeyEvent } from './stat-favor-events.js';
import { matchSkill } from './stat-skill-match.js';
import { DEFAULT_SPECIAL_SKILLS, clamp, withBars, withCharacter, withSkills } from './stat-state.js';
import { COMBAT_SKILLS, DODGE_SKILLS } from './stat-registry.js';
import { PROTAGONIST, bestCombatSkill, createEngine, profileOf, resolveCheck } from './stat-engine.js';

export { COMBAT_SKILLS, DODGE_SKILLS };
export const ENEMY_TABLE = Object.freeze({
    杂兵: Object.freeze({ value: 35, rounds: 1, hurt: '轻伤', loot: '少量', attack: 3, ac: 12, save: 12 }),
    精英: Object.freeze({ value: 55, rounds: 2, hurt: '中伤', loot: '普通', attack: 5, ac: 14, save: 14 }),
    头目: Object.freeze({ value: 75, rounds: 3, hurt: '重伤', loot: '昂贵', attack: 7, ac: 16, save: 16 }),
});
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

function outcomeOf(wins, rounds, dodged) {
    if (wins === rounds && dodged) return '大胜';
    if (wins === rounds || wins * 2 > rounds) return '胜';
    if (wins * 2 === rounds || (wins > 0 && dodged)) return '险胜';
    return '败';
}

// 敌人一方：已有角色卡的 NPC 用卡里最高的战斗技能，AC 按卡里敏捷；否则按档位值。
function foeProfile(engine, state, enemy, foeName) {
    const sheet = foeName ? engine.sheets[foeName] : null;
    if (sheet) {
        const profile = ['格斗', '射击', '武艺', '剑术', '魔法', '力量'].map((skill) => profileOf(engine, state, foeName, skill)).sort((a, b) => b.value - a.value)[0];
        const dex = Number(sheet.attributes && sheet.attributes.敏捷) || 50;
        return { profile, ac: engine.ruleset.ID === 'dnd5e' ? 10 + engine.ruleset.modOf(dex) : enemy.ac, save: enemy.save };
    }
    return { profile: { kind: 'skill', value: enemy.value, learned: true, attributeValue: enemy.value, rank: '普通人', entry: { attribute: '力量' } }, ac: enemy.ac, save: enemy.save };
}

// CoC：每回合主角最佳战斗技能对敌人对抗，同级算主角（反击方）胜；闪避单独掷一次。
function cocRound(engine, state, attack, foe, mods, random) {
    const me = resolveCheck(engine, state, { actor: PROTAGONIST, skill: attack.name, edge: mods.edge, ally: mods.ally }, random);
    const enemy = engine.ruleset.resolve(foe.profile, { difficulty: '普通', edge: 0 }, engine.ruleset.rawRoll(random, 0));
    const winner = engine.ruleset.contest(me, enemy, { tieWinner: 'left' });
    return { roll: me.roll, tier: me.tier, foeRoll: enemy.roll, foeTier: enemy.tier, win: winner === 'left' };
}

// D&D：每回合主角攻击检定对敌人 AC；闪避为一次敏捷豁免，DC 按敌人档。
function dndRound(engine, state, attack, foe, mods, random) {
    const bonus = engine.ruleset.bonusOf(profileOf(engine, state, PROTAGONIST, attack.name));
    const net = Math.sign(mods.edge + (mods.ally ? 1 : 0));
    const r = engine.ruleset.attack(bonus, foe.ac, engine.ruleset.rawRoll(random), net);
    return { roll: r.roll, tier: r.hit ? (r.crit ? '大成功' : '命中') : '未命中', total: r.total, ac: foe.ac, win: r.hit };
}

// 杂兵 1 回合、精英 2 回合、头目 3 回合；敌人每多一个给 1 颗惩罚骰 / 劣势，队友参战给奖励骰 / 优势。
export function resolveBattle(state, { tier, count = 1, ally = null, foe: foeName = null }, random, engine = createEngine()) {
    const enemy = ENEMY_TABLE[tier];
    const attack = bestCombatSkill(engine, state);
    const dodgeSkill = bestCombatSkill(engine, state, DODGE_SKILLS);
    const mods = { edge: -Math.min(2, Math.max(0, count - 1)), ally: Boolean(ally) };
    const foe = foeProfile(engine, state, enemy, foeName);
    const dnd = engine.ruleset.ID === 'dnd5e';
    const rounds = Array.from({ length: enemy.rounds }, () => (dnd ? dndRound(engine, state, attack, foe, mods, random) : cocRound(engine, state, attack, foe, mods, random)));
    const dodge = resolveCheck(engine, state, { actor: PROTAGONIST, skill: dnd ? '敏捷' : dodgeSkill.name, edge: mods.edge, ally: mods.ally }, random);
    const dodged = dnd ? dodge.total >= foe.save : dodge.success;
    const wins = rounds.filter((r) => r.win).length;
    return { tier, count, ally, attack: attack.name, rounds, dodge: { roll: dodge.roll, success: dodged }, wins, outcome: outcomeOf(wins, rounds.length, dodged), ruleset: engine.ruleset.ID };
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
    const engine = ctx.engine || createEngine();
    const result = resolveBattle(state, directive, ctx.random, engine);
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
        const roll = () => resolveCheck(engine, next, { actor: PROTAGONIST, skill: '魅力', toward: result.ally }, ctx.random);
        const { character, result: ev } = applyKeyEvent(next.characters[result.ally], '共患难', { roll, random: ctx.random });
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
    const engine = ctx.engine || createEngine();
    const skills = state.protagonist.skills;
    const matched = matchSkill(directive.value, { skills: Object.keys(skills) }).skill;
    const skill = matched || bestSkill(skills, DEFAULT_SPECIAL_SKILLS).name;
    const check = resolveCheck(engine, state, { actor: PROTAGONIST, skill }, ctx.random);
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
