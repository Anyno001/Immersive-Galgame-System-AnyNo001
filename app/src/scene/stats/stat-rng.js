// 数值系统掷骰：随机源默认 crypto.getRandomValues，测试可注入返回 [0,1) 的函数。
// 成功等级与奖惩骰规则直接复用 choices/dice-check.js，不另写一套。
import { rollD100, successLevel } from '../../choices/dice-check.js';

const UINT32_RANGE = 4294967296;

export function cryptoRandom() {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / UINT32_RANGE;
}

// 奖励骰与惩罚骰相互抵消，净值最多 2 颗；difficulty：0 普通 / 1 困难 / 2 极难。
export function rollStatCheck(target, { bonus = 0, penalty = 0, difficulty = 0 } = {}, random = cryptoRandom) {
    const net = (bonus || 0) - (penalty || 0);
    const dice = { bonus: Math.min(2, Math.max(0, net)), penalty: Math.min(2, Math.max(0, -net)) };
    const { value, totals } = rollD100(dice, random);
    const tier = successLevel(value, target);
    return { roll: value, totals, target, tier: tier.name, level: tier.level, success: tier.level >= difficulty };
}

// 越高越难涨与成长掷骰：d100 点数大于当前值（负值按 0 算）才算通过。
export function rollOver(current, random = cryptoRandom) {
    const roll = rollD100({}, random).value;
    return { roll, passed: roll > Math.max(0, Number(current) || 0) };
}

export function rollDie(sides, random = cryptoRandom) {
    return 1 + Math.floor(random() * sides);
}
