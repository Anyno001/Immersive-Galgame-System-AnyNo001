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

// 领域之外的相关技能：技能值不低于 RELATED_MIN 时，最多两项各顶替一张领域牌。
export const RELATED_SKILLS = Object.freeze({
    烹饪: Object.freeze(['应变', '家务', '照顾']),
    话术: Object.freeze(['魅力', '应变', '学习']),
    学习: Object.freeze(['话术', '艺术', '应变']),
    应变: Object.freeze(['运动', '话术', '魅力']),
    魅力: Object.freeze(['话术', '艺术', '照顾']),
    照顾: Object.freeze(['家务', '魅力', '应变']),
    艺术: Object.freeze(['学习', '魅力', '应变']),
    运动: Object.freeze(['应变', '照顾', '家务']),
    家务: Object.freeze(['烹饪', '照顾', '应变']),
    [CHALLENGE_GENERAL_DOMAIN]: Object.freeze([]),
});
export const RELATED_MIN = 50;
export const RELATED_MAX = 2;
// 顶替的是领域的第几类牌位：第一项换掉一张进攻牌，第二项换掉一张防守牌，张数不变。
const RELATED_REPLACES = Object.freeze(['push', 'hold']);

function relatedPicks(key, otherSkills) {
    const picks = [];
    for (const name of RELATED_SKILLS[key] || []) {
        const value = Number(otherSkills?.[name]?.value ?? otherSkills?.[name]);
        if (Object.hasOwn(DOMAIN_CARDS, name) && value >= RELATED_MIN) picks.push({ name, value });
    }
    return picks.sort((a, b) => b.value - a.value).slice(0, RELATED_MAX);
}

// 领域不在映射表里时走通用牌组；技能值只决定稀有度档位与模板阶梯。
// otherSkills 为 { 技能名: 值 } 或 { 技能名: { value } }，相关技能高时用其应急牌顶替领域牌，总数仍是 20 张。
export function buildChallengeDeck({ domain, skillValue, otherSkills } = {}) {
    const key = domainKeyOf(domain);
    const def = DOMAIN_CARDS[key];
    const tier = challengeTierIndex(skillValue);
    const ladderAt = Math.min(tier, 2);
    const catalog = Object.fromEntries(Object.entries(BASIC_CARDS).map(([id, card]) => [id, JSON.parse(JSON.stringify(card))]));
    const deck = [...Array(COMBAT_RULES.starterDeckShape.basicAttack).fill(BASIC_STRIKE_ID), ...Array(COMBAT_RULES.starterDeckShape.basicDefend).fill(BASIC_DEFEND_ID)];
    const swaps = relatedPicks(key, otherSkills).map((pick, index) => ({ ...pick, slot: RELATED_REPLACES[index] }));
    for (const [slot, spec] of Object.entries(SLOTS)) {
        const rarity = slot === 'ace' && tier === 3 ? 'epic' : CHALLENGE_RARITIES[ladderAt];
        const card = buildCard(`ch-${slot}`, def[slot], (def.ladders[slot] || spec.ladder)[ladderAt], spec.cost, rarity);
        const swap = swaps.find((item) => item.slot === slot);
        catalog[card.id] = card;
        deck.push(...Array(spec.copies - (swap ? 1 : 0)).fill(card.id));
        if (!swap) continue;
        const other = DOMAIN_CARDS[swap.name];
        const swapAt = Math.min(challengeTierIndex(swap.value), 2);
        const swapCard = buildCard(`ch-rel-${slot}`, other.tempo, (other.ladders.tempo || SLOTS.tempo.ladder)[swapAt], SLOTS.tempo.cost, CHALLENGE_RARITIES[swapAt]);
        catalog[swapCard.id] = swapCard;
        deck.push(swapCard.id);
    }
    for (const life of LIFE_CARDS) {
        catalog[life.id] = buildCard(life.id, life.name, life.key, life.cost, 'common');
        deck.push(life.id);
    }
    return { domain: key, rarity: CHALLENGE_RARITIES[tier], deck, catalog, related: swaps.map((swap) => swap.name) };
}
