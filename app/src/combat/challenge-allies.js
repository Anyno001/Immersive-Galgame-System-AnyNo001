// 日常挑战的 NPC 协助：在场且好感达标的人物最多两名，以友军加入，每人给主角卡组一张专属牌。纯函数，人物数据由数值侧传入。
import { BASIC_CARDS, BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES } from './rules.js';
import { solveCardTemplate } from './card-templates.js';
import { hash32 } from './random.js';

export const CHALLENGE_ALLY_MAX = 2;
// 好感阶段「明确喜欢」的下限，即第一道关口（25）之上；数值侧阶段表变动时由测试提醒同步。
export const CHALLENGE_ALLY_MIN_FAVOR = 26;
export const CHALLENGE_ALLY_HP = 30;
export const CHALLENGE_ALLY_RARITY = 'uncommon';

// 专属牌从既有模板里按人名稳定挑选，不发明新效果；每项为 [模板键, 费用]。
export const ALLY_CARD_POOL = Object.freeze([
    Object.freeze(['bash', 2]), Object.freeze(['guard', 1]), Object.freeze(['mend', 1]), Object.freeze(['twin', 1]),
    Object.freeze(['cripple', 2]), Object.freeze(['brace', 1]), Object.freeze(['prepare', 1]), Object.freeze(['quick', 1]),
]);

const NAME_MAX = 16;

// present：在场人物名数组；favors：{ 人物名: 好感值 }。
export function eligibleChallengeAllies({ present, favors, exclude = [] } = {}) {
    const seen = new Set();
    const out = [];
    for (const name of Array.isArray(present) ? present : []) {
        if (typeof name !== 'string' || !name || seen.has(name) || exclude.includes(name)) continue;
        seen.add(name);
        const favor = Number(favors?.[name]);
        if (Number.isFinite(favor) && favor >= CHALLENGE_ALLY_MIN_FAVOR) out.push({ name, favor });
    }
    return out.sort((a, b) => b.favor - a.favor);
}

// 只拒收不修正：不在场、好感不足、重复、与难关对象相同、超出名额都记原因。
export function validateChallengeAllies(requested, { present, favors, exclude = [] } = {}) {
    const accepted = [];
    const rejected = [];
    const here = Array.isArray(present) ? present : [];
    for (const raw of Array.isArray(requested) ? requested : []) {
        const name = typeof raw === 'string' ? raw : raw?.name;
        const reject = (reason) => rejected.push({ name: String(name ?? '').slice(0, 20), reason });
        if (typeof name !== 'string' || !name) reject('invalid');
        else if (accepted.some((item) => item.name === name)) reject('duplicate');
        else if (exclude.includes(name)) reject('counterpart');
        else if (!here.includes(name)) reject('not-present');
        else if (!(Number(favors?.[name]) >= CHALLENGE_ALLY_MIN_FAVOR)) reject('favor-low');
        else if (accepted.length >= CHALLENGE_ALLY_MAX) reject('over-limit');
        else accepted.push({ name, favor: Number(favors[name]) });
    }
    return { accepted, rejected };
}

// 同一个人固定得到同一张专属牌；index 只用来区分卡牌编号。
export function allyExclusiveCard(name, index) {
    const [key, cost] = ALLY_CARD_POOL[hash32(`ally|${name}`) % ALLY_CARD_POOL.length];
    const solved = solveCardTemplate(key, cost, CHALLENGE_ALLY_RARITY);
    if (!solved) return null;
    return { id: `ch-ally-${index + 1}`, name: `${String(name).slice(0, NAME_MAX)}相助`, cost, rarity: CHALLENGE_ALLY_RARITY, ...solved };
}

// 友军单位：基础牌加两张自己的专属牌，由引擎按托管策略（chooseAllyPlay）自动出牌。
export function allyUnit(name, index, card) {
    const catalog = Object.fromEntries(Object.entries(BASIC_CARDS).map(([id, basic]) => [id, JSON.parse(JSON.stringify(basic))]));
    catalog[card.id] = card;
    const shape = COMBAT_RULES.starterDeckShape;
    const deck = [...Array(shape.basicAttack).fill(BASIC_STRIKE_ID), ...Array(shape.basicDefend).fill(BASIC_DEFEND_ID), card.id, card.id];
    return { id: `ally${index + 1}`, name, side: 'ally', kind: 'deck', maxHp: CHALLENGE_ALLY_HP, speed: COMBAT_RULES.defaultSpeed, deck, catalog };
}

// 返回 { cards, units }：cards 并入主角卡组与目录，units 加入 setup.units。
export function buildChallengeAllies(accepted) {
    const cards = [];
    const units = [];
    accepted.forEach((ally, index) => {
        const card = allyExclusiveCard(ally.name, index);
        if (!card) return;
        cards.push(card);
        units.push(allyUnit(ally.name, index, card));
    });
    return { cards, units };
}
