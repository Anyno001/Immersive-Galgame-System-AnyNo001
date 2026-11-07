import { BASIC_CARDS, BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES } from './rules.js';
import { solveCardTemplate } from './card-templates.js';
import { CHALLENGE_RARITIES, challengeTierIndex } from './challenge-cards.js';
import { INTIMATE_WATCH_SKILL } from './intimate-foes.js';
import { grudgeLevel, isShakyLoveHate } from '../scene/intimate-duel.js';

export const INTIMATE_DUEL_CARD_SLOTS = Object.freeze({ school: 10, relation: 4 });
export const INTIMATE_INTERRUPT_CARD = 'im-stay';
export const INTIMATE_DEFIANCE_CARD = 'im-defy';
export const INTIMATE_SHAKY_CARDS = Object.freeze([['眼神闪躲', 'cripple'], ['欲言又止', 'trip']]);

const school = (name, key, cost, copies) => Object.freeze({ name, key, cost, copies });

export const INTIMATE_SCHOOLS = Object.freeze({
    合拍: Object.freeze({
        receive: Object.freeze([
            school('回应', 'strike', 1, 2), school('主动示好', 'bash', 1, 1), school('害羞躲闪', 'fumble', 1, 1), school('牵手', 'mend', 1, 1),
            school('轻声表白', 'rend', 1, 1), school('置之不理', 'guard', 0, 1), school('深呼吸', 'brace', 1, 1), school('靠近一点', 'twin', 2, 1), school('相视而笑', 'prepare', 1, 1),
        ]),
        lead: Object.freeze([
            school('温柔', 'strike', 1, 2), school('安抚', 'mend', 1, 1), school('耐心', 'brace', 1, 2), school('情话', 'rend', 1, 1),
            school('确认心意', 'quick', 1, 1), school('置之不理', 'guard', 0, 1), school('轻抚', 'bash', 1, 1), school('十指相扣', 'twin', 2, 1),
        ]),
    }),
    主导: Object.freeze({
        receive: Object.freeze([
            school('欲拒还迎', 'counter', 1, 1), school('挑衅', 'cripple', 1, 1), school('故作示弱', 'lure', 1, 1), school('反将一军', 'execute', 2, 1),
            school('撒娇夺权', 'quick', 1, 1), school('咬唇忍住', 'guard', 1, 2), school('勾手指', 'rend', 1, 1), school('拉扯', 'tear', 1, 1), school('旧账', 'execute', 2, 1),
        ]),
        lead: Object.freeze([
            school('占先', 'bash', 1, 1), school('逼近', 'strike', 1, 2), school('扣住手腕', 'trip', 1, 1), school('低声命令', 'cripple', 1, 1),
            school('逼至角落', 'bash', 2, 1), school('不容闪避', 'rend', 1, 1), school('耐心磨', 'venom', 1, 1), school('拉扯', 'tear', 1, 1), school('旧账', 'execute', 2, 1),
        ]),
    }),
});

const RELATIONS = Object.freeze({
    合拍: Object.freeze([['默契', 'bash'], ['信赖', 'mend'], ['心跳同步', 'quick'], ['心照不宣', 'brace']]),
    主导: Object.freeze([['旧情', 'bash'], ['较劲', 'strike'], ['针锋相对', 'cripple'], ['不肯让步', 'guard']]),
});

const WORDS = Object.freeze({
    合拍: Object.freeze({ strike: '相迎', defend: '克制' }),
    主导: Object.freeze({ strike: '进逼', defend: '招架' }),
});

export function bondTierIndex(value) {
    const n = Number(value);
    if (!(n >= 30)) return 0;
    return n < 60 ? 1 : 2;
}

function solved(id, name, key, cost, rarity) {
    for (let r = CHALLENGE_RARITIES.indexOf(rarity); r >= 0; r -= 1) {
        const card = solveCardTemplate(key, cost, CHALLENGE_RARITIES[r]);
        if (card) return { id, name, cost, rarity: CHALLENGE_RARITIES[r], ...card };
    }
    return null;
}

export function intimateSkillValue(mechanic, skills) {
    const pick = (name) => Number(skills?.[name]?.value ?? skills?.[name]) || 0;
    const base = mechanic === '主导' ? Math.max(pick('魅力'), pick('话术')) : Math.max(pick('魅力'), pick('照顾'));
    return base || 50;
}

const withFizzle = (card) => {
    const patch = (effects) => effects.map((effect) => (effect.op === 'delayed-counter' ? { ...effect, fizzle: INTIMATE_WATCH_SKILL } : effect));
    return { ...card, effects: patch(card.effects), ...(card.upgraded ? { upgraded: { ...card.upgraded, effects: patch(card.upgraded.effects) } } : {}) };
};

export function buildIntimateDeck({ mechanic = '合拍', position = 'receive', skills = null, favor = 0, trust = 50, grudge = 0, mark = null } = {}) {
    const kind = mechanic === '主导' ? '主导' : '合拍';
    const side = position === 'lead' ? 'lead' : 'receive';
    const words = WORDS[kind];
    const catalog = Object.fromEntries(Object.entries(BASIC_CARDS).map(([id, card]) => [id, JSON.parse(JSON.stringify(card))]));
    catalog[BASIC_STRIKE_ID].name = words.strike;
    catalog[BASIC_STRIKE_ID].skillRef = words.strike;
    catalog[BASIC_DEFEND_ID].name = words.defend;
    catalog[BASIC_DEFEND_ID].skillRef = words.defend;
    const shape = COMBAT_RULES.starterDeckShape;
    const deck = [...Array(shape.basicAttack).fill(BASIC_STRIKE_ID), ...Array(shape.basicDefend).fill(BASIC_DEFEND_ID)];
    const rarity = CHALLENGE_RARITIES[Math.min(challengeTierIndex(intimateSkillValue(kind, skills)), 2)];
    const tier = grudgeLevel(grudge);
    const grudgeOpen = tier > 0;
    const oldRarity = CHALLENGE_RARITIES[Math.min(CHALLENGE_RARITIES.indexOf(rarity) + Math.max(0, tier - 1), CHALLENGE_RARITIES.length - 1)];
    INTIMATE_SCHOOLS[kind][side].forEach((spec, index) => {
        const plainOld = spec.name === '旧账' && !grudgeOpen;
        const id = spec.name === '置之不理' ? INTIMATE_INTERRUPT_CARD : `im-s${index}`;
        const card = solved(id, plainOld ? '步步紧逼' : spec.name, plainOld ? 'strike' : spec.key, plainOld ? 1 : spec.cost, spec.name === '旧账' && grudgeOpen ? oldRarity : rarity);
        if (!card) return;
        catalog[id] = spec.key === 'lure' ? withFizzle(card) : card;
        deck.push(...Array(spec.copies).fill(id));
    });
    const bond = kind === '主导' ? Math.max(Number(favor) || 0, Number(grudge) || 0) : Number(favor) || 0;
    const bondRarity = CHALLENGE_RARITIES[bondTierIndex(bond)];
    RELATIONS[kind].forEach(([name, key], index) => {
        const id = `im-r${index}`;
        const card = solved(id, name, key, 1, bondRarity);
        if (!card) return;
        catalog[id] = card;
        deck.push(id);
    });
    if (kind === '主导' && isShakyLoveHate({ favor, trust, grudge })) {
        INTIMATE_SHAKY_CARDS.forEach(([name, key], index) => {
            const id = `im-w${index}`;
            const card = solved(id, name, key, 1, rarity);
            if (!card) return;
            catalog[id] = card;
            deck.push(id);
        });
    }
    if (mark === 'defeated' && kind === '主导') {
        const card = solved(INTIMATE_DEFIANCE_CARD, '不服', 'rend', 1, rarity);
        if (card) {
            catalog[INTIMATE_DEFIANCE_CARD] = card;
            deck.push(INTIMATE_DEFIANCE_CARD);
        }
    }
    return { deck, catalog, rarity };
}
