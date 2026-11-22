// 六维存储键与显示名称。与建卡预算、等级和战斗规则无关。
export const ABILITY_LABELS = Object.freeze({ str: '力量', dex: '敏捷', con: '体质', int: '智力', wis: '感知', cha: '魅力' });
export const ABILITY_KEYS = Object.freeze(Object.keys(ABILITY_LABELS));
export const BASE_ATTRIBUTES = Object.freeze(Object.values(ABILITY_LABELS));
export const ABILITY_BY_LABEL = Object.freeze(Object.fromEntries(ABILITY_KEYS.map(key => [ABILITY_LABELS[key], key])));

export function normalizeNpcScores(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== ABILITY_KEYS.length) return null;
    const scores = {};
    for (const key of ABILITY_KEYS) {
        const value = input[key];
        if (!Object.hasOwn(input, key) || !Number.isInteger(value) || value < 1 || value > 30) return null;
        scores[key] = value;
    }
    return scores;
}

export function normalizeHeroScores(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== ABILITY_KEYS.length) return null;
    const scores = {};
    for (const key of ABILITY_KEYS) {
        const value = input[key];
        if (!Object.hasOwn(input, key) || !Number.isInteger(value) || value < 1 || value > 20) return null;
        scores[key] = value;
    }
    return scores;
}

// 正式角色卡分数可到 30；不要在这里套用主角手动建卡的总分限制。
export function sheetAbilityScores(sheet) {
    if (sheet?.scale !== 'score' || !sheet.attributes) return null;
    const scores = normalizeNpcScores(Object.fromEntries(ABILITY_KEYS.map(key => [key, sheet.attributes[ABILITY_LABELS[key]]])));
    return scores ? { scores } : null;
}
