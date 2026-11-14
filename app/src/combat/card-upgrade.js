// 卡牌升级覆盖字段；不依赖规则表、卡池或机制登记，供校验与视图共用。
export const UPGRADE_FLAGS = Object.freeze(['innate', 'ethereal', 'retain', 'sly']);
export const UPGRADE_FIELDS = Object.freeze(['cost', 'effects', ...UPGRADE_FLAGS, 'onDiscard']);
export const CARD_UPGRADE_RULES = 1;
const LEGACY_FIELDS = Object.freeze(['cost', 'effects']);

// 只合并升级契约允许的字段。false 必须保留，以表达移除虚无等升级。
export function upgradedCardFace(card, rules = CARD_UPGRADE_RULES) {
    if (!card?.upgraded || typeof card.upgraded !== 'object') return card;
    const fields = rules === CARD_UPGRADE_RULES ? UPGRADE_FIELDS : LEGACY_FIELDS;
    const patch = Object.fromEntries(fields.filter(key => card.upgraded[key] !== undefined)
        .map(key => [key, card.upgraded[key]]));
    return { ...card, ...patch };
}
