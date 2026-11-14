// 规则 v6 固定卡汇总：各职业固定卡表与无色通用表的只读索引。
// 职业池只供本职业的奖励、积分抽卡、升级与升阶取牌；无色池只供「随机加入无色牌」一类卡牌效果造牌（D-15）。
import { WARRIOR_CARDS } from './warrior.js';
import { ASSASSIN_CARDS } from './assassin.js';
import { MAGE_CARDS } from './mage.js';
import { SUMMONER_CARDS } from './summoner.js';
import { PRIEST_CARDS } from './priest.js';
import { BARD_CARDS } from './bard.js';
import { GUARDIAN_CARDS } from './guardian.js';
import { RANGER_CARDS } from './ranger.js';
import { GENERAL_CARDS } from './general.js';
import { sourceFixedCard } from '../card-source-models.js';

const deepFreeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const key of Object.keys(value)) deepFreeze(value[key]);
    }
    return value;
};

export const LEGACY_FIXED_CLASS_CARDS = deepFreeze({
    warrior: [...WARRIOR_CARDS], assassin: [...ASSASSIN_CARDS], mage: [...MAGE_CARDS], summoner: [...SUMMONER_CARDS],
    priest: [...PRIEST_CARDS], bard: [...BARD_CARDS], guardian: [...GUARDIAN_CARDS], ranger: [...RANGER_CARDS],
});
export const LEGACY_FIXED_GENERAL_CARDS = deepFreeze([...GENERAL_CARDS]);
export const FIXED_CLASS_CARDS = deepFreeze(Object.fromEntries(Object.entries(LEGACY_FIXED_CLASS_CARDS)
    .map(([key, cards]) => [key, cards.map(sourceFixedCard)])));
export const FIXED_GENERAL_CARDS = deepFreeze(LEGACY_FIXED_GENERAL_CARDS.map(sourceFixedCard));

const BY_ID = new Map([...Object.values(LEGACY_FIXED_CLASS_CARDS).flat(), ...LEGACY_FIXED_GENERAL_CARDS,
    ...Object.values(FIXED_CLASS_CARDS).flat(), ...FIXED_GENERAL_CARDS].map((card) => [card.id, card]));
const FIXED_ID = /^fx-([a-z]+)-\d+(?:-s1)?$/;

// 按 ID 取固定卡定义；不是固定卡 ID 时为 null。
export const fixedCard = (id) => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);
export const isFixedCardId = (id) => fixedCard(id) !== null;
// 固定卡所属的表键（职业原型或 general）；不是固定卡 ID 时为 null。
export const fixedCardGroup = (id) => (isFixedCardId(id) ? FIXED_ID.exec(id)[1] : null);
// 本职业固定池（未知原型为空数组）。
export const fixedClassPool = (archetype) => (typeof archetype === 'string' && Object.hasOwn(FIXED_CLASS_CARDS, archetype) ? FIXED_CLASS_CARDS[archetype] : []);
// 历史起始卡组与待选记录仍允许旧 ID；新候选只从 fixedClassPool 取。
export const compatibleFixedClassPool = (archetype) => (typeof archetype === 'string' && Object.hasOwn(LEGACY_FIXED_CLASS_CARDS, archetype)
    ? [...new Map([...LEGACY_FIXED_CLASS_CARDS[archetype], ...fixedClassPool(archetype)].map(card => [card.id, card])).values()] : []);

const asDefs = (list) => Object.fromEntries(list.map((card) => [card.id, card]));
// 开战快照用的造牌池：class 为本职业固定池，general 为无色池（按 ID 索引的定义表）。
export function fixedPoolsFor(archetype) {
    const own = fixedClassPool(archetype);
    return { ...(own.length ? { class: asDefs(own) } : {}), general: asDefs(FIXED_GENERAL_CARDS) };
}

// 效果里是否用到 class / general 造牌池（含嵌套与升级版）。只有用到时开战快照才带 pools，旧快照形状不变。
const usesPool = (effects) => (Array.isArray(effects) ? effects : []).some((e) => (e?.op === 'random-card' && (e.pool === 'class' || e.pool === 'general'))
    || usesPool(e?.then) || usesPool(e?.a) || usesPool(e?.b));
export const cardUsesPool = (card) => usesPool(card?.effects) || usesPool(card?.upgraded?.effects);
