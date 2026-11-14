// 奖励副本标记：不修改卡定义；战前定刻印，战后仅按已知失血兑现升级。
import { hash32, randomInt } from './random.js';
import { INSCRIPTION_KEYS, inscribable, inscribedView } from './mechanics/inscription.js';
import { upgradedCardFace } from './card-upgrade.js';

export const rewardUpgradable = (card) => !!card && card.rarity !== 'signature' && !!card.upgraded;
const cardsOf = (slot) => Array.isArray(slot.choices) ? slot.choices : [slot.card];
const upgradedView = (card, upgraded) => upgraded ? upgradedCardFace(card) : card;

export function planRewardMarks(cards, seed, count) {
    const marks = cards.map(() => ({}));
    const pool = cards.map((card, index) => ({ index, keys: INSCRIPTION_KEYS.filter((key) =>
        inscribable(card, key) && inscribable(upgradedView(card, true), key)) })).filter((item) => item.keys.length);
    let rng = hash32(`reward-inscribe|${seed}`);
    for (let n = 0; n < count && pool.length; n += 1) {
        const roll = randomInt(rng, pool.length);
        const item = pool.splice(roll.value, 1)[0];
        const key = randomInt(roll.state, item.keys.length);
        rng = key.state;
        marks[item.index] = { inscription: item.keys[key.value] };
    }
    return marks;
}

export function rewardCardMarks(slot, index, hpLost = null) {
    const marks = { ...(slot?.marks?.[index] || {}) };
    if (slot?.upgradeNoDamage === true && hpLost === 0 && rewardUpgradable(cardsOf(slot)[index])) marks.upgraded = true;
    return marks;
}

export function rewardCardView(slot, index) {
    const card = cardsOf(slot)[index];
    const marks = rewardCardMarks(slot, index);
    return inscribedView(upgradedView(card, marks.upgraded), marks);
}

export function settleRewardOffer(offer, hpLost = null) {
    const settle = (slots) => slots.map((slot) => slot.kind === 'card' && slot.upgradeNoDamage === true && hpLost === 0
        ? { ...slot, marks: cardsOf(slot).map((_, index) => rewardCardMarks(slot, index, hpLost)) } : slot);
    return { ...offer, slots: settle(offer.slots), ...(offer.reserve ? { reserve: settle(offer.reserve) } : {}) };
}
