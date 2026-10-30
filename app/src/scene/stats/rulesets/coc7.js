// CoC 第七版（数值 v2 §4.1）：底数即目标值；困难 1/2、极难 1/5；奖惩骰净值最多 2 颗。
// 大成功 ≤5、大失败 ≥96（用户定，沿用 v1 与 AcuDice），成功等级直接复用 dice-check.successLevel。
import { successLevel } from '../../../choices/dice-check.js';

export const ID = 'coc7';
export const LABEL = 'CoC第七版（百分骰）';
export const EDGE_MAX = 2;
const DIVISOR = Object.freeze({ 普通: 1, 简单: 1, 困难: 2, 极难: 5, 对抗: 1 });
const REQUIRED = Object.freeze({ 普通: 0, 简单: 0, 对抗: 0, 困难: 1, 极难: 2 });
const TIER_LADDER = Object.freeze({ 大成功: 'crit', 极难成功: 'extreme', 困难成功: 'hard', 普通成功: 'pass' });
export const LADDER_RANK = Object.freeze({ fumble: -1, fail: -1, pass: 0, hard: 1, extreme: 2, crit: 3 });

const clampEdge = (n) => Math.max(-EDGE_MAX, Math.min(EDGE_MAX, Math.round(Number(n) || 0)));

export function targetOf(profile, shift = 0) {
    return Math.max(1, Math.min(99, Math.round((Number(profile.value) || 0) + (Number(shift) || 0))));
}

// 按需取十位骰：normal 检定与 v1 rollD100 的随机数消耗一致（个位 1 次 + 十位 1+n 次）。
export function rawRoll(random, extra = 0) {
    const die = () => Math.floor(random() * 10);
    const unit = die();
    const tens = Array.from({ length: 1 + Math.max(0, Math.min(EDGE_MAX, extra)) }, die);
    return { unit, tens };
}

function rollValue(raw, edge) {
    const n = Math.abs(edge);
    const tens = raw.tens.slice(0, 1 + n);
    while (tens.length < 1 + n) tens.push(raw.tens[0] ?? 0);
    const totals = tens.map((ten) => (ten === 0 && raw.unit === 0 ? 100 : ten * 10 + raw.unit));
    const value = edge > 0 ? Math.min(...totals) : edge < 0 ? Math.max(...totals) : totals[0];
    return { value, totals };
}

export function netEdge(difficulty, edge) {
    return clampEdge((Number(edge) || 0) + (difficulty === '简单' ? 1 : 0));
}

export function rawNeed(difficulty, edge) {
    return Math.abs(netEdge(difficulty, edge));
}

// opts：{ difficulty, edge, shift }。返回统一结果；raw 可来自预掷。
export function resolve(profile, opts = {}, raw) {
    const difficulty = Object.hasOwn(DIVISOR, opts.difficulty) ? opts.difficulty : '普通';
    const edge = netEdge(difficulty, opts.edge);
    const target = targetOf(profile, opts.shift);
    const { value, totals } = rollValue(raw, edge);
    const tier = successLevel(value, target);
    const success = tier.level >= REQUIRED[difficulty];
    const ladder = tier.name === '大失败' ? 'fumble' : !success ? 'fail' : TIER_LADDER[tier.name] || 'pass';
    const threshold = Math.floor(target / DIVISOR[difficulty]);
    const dice = edge > 0 ? `奖励骰${edge}` : edge < 0 ? `惩罚骰${-edge}` : '';
    return {
        ruleset: ID, die: 100, roll: value, totals, target, threshold, edge, difficulty,
        tier: tier.name, level: tier.level, success, ladder,
        outcome: success ? tier.name : (tier.name === '大失败' ? '大失败' : '失败'),
        detail: `1d100${dice ? `(${dice})` : ''}=${value}，需≤${threshold}`,
        sub: `需≤${threshold}`,
    };
}

// 对抗（§4.1）：比成功等级，同级时技能值高者胜；都失败或完全相同为僵持。tieWinner 用于战斗的官方平局规则。
export function contest(left, right, { tieWinner = '' } = {}) {
    const a = LADDER_RANK[left.ladder] ?? -1;
    const b = LADDER_RANK[right.ladder] ?? -1;
    if (a !== b) return a > b ? 'left' : 'right';
    if (a < 0) return 'tie';
    if (tieWinner === 'left' || tieWinner === 'right') return tieWinner;
    if (left.target !== right.target) return left.target > right.target ? 'left' : 'right';
    return 'tie';
}

// 对被动目标：对方技能 ≥90 定极难、≥50 定困难。
export function passiveOpposition(profile) {
    const v = Number(profile.value) || 0;
    return { difficulty: v >= 90 ? '极难' : v >= 50 ? '困难' : '普通' };
}

// 精确成功率：枚举个位与所需十位骰。
export function chance(profile, opts = {}) {
    const n = rawNeed(opts.difficulty, opts.edge);
    let pass = 0;
    let total = 0;
    const tens = (depth, acc, unit) => {
        if (depth === 1 + n) {
            total += 1;
            if (resolve(profile, opts, { unit, tens: acc }).success) pass += 1;
            return;
        }
        for (let t = 0; t < 10; t += 1) tens(depth + 1, [...acc, t], unit);
    };
    for (let unit = 0; unit < 10; unit += 1) tens(0, [], unit);
    return pass / total;
}
