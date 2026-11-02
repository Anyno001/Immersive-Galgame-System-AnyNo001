// 日常挑战卡组：领域与技能值 → 20 张牌与卡牌目录。只用既有模板和稀有度窗口，不发明新效果。
import { BASIC_CARDS, BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES } from './rules.js';
import { solveCardTemplate } from './card-templates.js';

export const CHALLENGE_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic']);
export const CHALLENGE_GENERAL_DOMAIN = '通用';

// 技能值 → 稀有度档位序号：0–29 / 30–59 / 60–79 / 80 以上。
export function challengeTierIndex(skillValue) {
    const value = Number(skillValue);
    if (!(value >= 30)) return 0;
    if (value < 60) return 1;
    return value < 80 ? 2 : 3;
}

// 五个领域牌位：张数、费用、各档模板键（稀有档沿用，epic 档只有 ace 升到 epic 稀有度）。
const SLOTS = Object.freeze({
    push: Object.freeze({ copies: 3, cost: 1, ladder: Object.freeze(['strike', 'quick', 'bash']) }),
    hold: Object.freeze({ copies: 3, cost: 1, ladder: Object.freeze(['guard', 'brace', 'mend']) }),
    combo: Object.freeze({ copies: 2, cost: 2, ladder: Object.freeze(['twin', 'cripple', 'venom']) }),
    tempo: Object.freeze({ copies: 1, cost: 1, ladder: Object.freeze(['prepare', 'brace', 'surge']) }),
    ace: Object.freeze({ copies: 1, cost: 2, ladder: Object.freeze(['bash', 'rend', 'shatter']) }),
});

const names = (push, hold, combo, tempo, ace, ladders = {}) => Object.freeze({ push, hold, combo, tempo, ace, ladders: Object.freeze(ladders) });

export const DOMAIN_CARDS = Object.freeze({
    烹饪: names('拿手菜', '火候', '摆盘', '备料', '招牌秘方', { push: ['strike', 'bash', 'bash'], combo: ['bash', 'bash', 'cripple'] }),
    话术: names('据理力争', '以退为进', '层层递进', '梳理要点', '抓住破绽', { hold: ['brace', 'brace', 'mend'], ace: ['rend', 'rend', 'shatter'] }),
    学习: names('融会贯通', '稳扎稳打', '一气呵成', '灵感闪现', '举一反三', { combo: ['twin', 'twin', 'flurry'], tempo: ['prepare', 'quick', 'quick'] }),
    应变: names('随机应变', '见招拆招', '连环对策', '急中生智', '绝处逢生'),
    魅力: names('真诚相待', '温柔以对', '软硬兼施', '恰到好处', '打动人心'),
    照顾: names('悉心安排', '耐心守候', '体贴入微', '细致周到', '无微不至', { hold: ['guard', 'mend', 'mend'] }),
    艺术: names('灵感挥洒', '沉心打磨', '笔走龙蛇', '即兴发挥', '神来之笔'),
    运动: names('全力以赴', '稳住节奏', '一鼓作气', '调整呼吸', '突破极限'),
    家务: names('手脚麻利', '有条不紊', '干净利落', '随手收拾', '焕然一新'),
    [CHALLENGE_GENERAL_DOMAIN]: names('全力应对', '沉着应对', '连续出击', '抓紧时机', '孤注一掷'),
});

export const DOMAIN_CARD_KEYS = Object.freeze(Object.fromEntries(Object.entries(DOMAIN_CARDS).map(([domain, def]) => [
    domain,
    Object.freeze([...new Set(Object.keys(SLOTS).flatMap((slot) => def.ladders[slot] || SLOTS[slot].ladder))]),
])));

// 与领域无关的生活牌，所有人都有。
export const LIFE_CARDS = Object.freeze([
    Object.freeze({ id: 'ch-life-1', name: '深呼吸', key: 'brace', cost: 1 }),
    Object.freeze({ id: 'ch-life-2', name: '喝口水', key: 'mend', cost: 1 }),
    Object.freeze({ id: 'ch-life-3', name: '回忆练习', key: 'prepare', cost: 1 }),
    Object.freeze({ id: 'ch-life-4', name: '整理思路', key: 'quick', cost: 1 }),
]);

const domainKeyOf = (domain) => (Object.hasOwn(DOMAIN_CARDS, domain) && domain !== CHALLENGE_GENERAL_DOMAIN ? domain : CHALLENGE_GENERAL_DOMAIN);

function buildCard(id, name, key, cost, rarity) {
    const solved = solveCardTemplate(key, cost, rarity);
    return solved ? { id, name, cost, rarity, ...solved } : null;
}

// 领域不在映射表里时走通用牌组；技能值只决定稀有度档位与模板阶梯。
export function buildChallengeDeck({ domain, skillValue } = {}) {
    const key = domainKeyOf(domain);
    const def = DOMAIN_CARDS[key];
    const tier = challengeTierIndex(skillValue);
    const ladderAt = Math.min(tier, 2);
    const catalog = Object.fromEntries(Object.entries(BASIC_CARDS).map(([id, card]) => [id, JSON.parse(JSON.stringify(card))]));
    const deck = [...Array(COMBAT_RULES.starterDeckShape.basicAttack).fill(BASIC_STRIKE_ID), ...Array(COMBAT_RULES.starterDeckShape.basicDefend).fill(BASIC_DEFEND_ID)];
    for (const [slot, spec] of Object.entries(SLOTS)) {
        const rarity = slot === 'ace' && tier === 3 ? 'epic' : CHALLENGE_RARITIES[ladderAt];
        const card = buildCard(`ch-${slot}`, def[slot], (def.ladders[slot] || spec.ladder)[ladderAt], spec.cost, rarity);
        catalog[card.id] = card;
        deck.push(...Array(spec.copies).fill(card.id));
    }
    for (const life of LIFE_CARDS) {
        catalog[life.id] = buildCard(life.id, life.name, life.key, life.cost, 'common');
        deck.push(life.id);
    }
    return { domain: key, rarity: CHALLENGE_RARITIES[tier], deck, catalog };
}
