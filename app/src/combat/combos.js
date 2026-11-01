// 禁用联动检测：从卡牌效果提取「联动特征」，命中禁用组合则该牌不得生成。纯函数。
import { CARD_TEMPLATES } from './card-templates.js';

// 效果树（含 then 子树）里是否出现某个 op。
const hasOp = (effects, op) => (Array.isArray(effects) ? effects : []).some((effect) => effect?.op === op || hasOp(effect?.then, op));

// 限时 BUFF 的触发器带来的特征：出牌触发、弃牌触发。
function addTriggerFeatures(trigger, then, features) {
    if (trigger === 'card-played') {
        features.add('play-trigger');
        if (hasOp(then, 'create')) features.add('play-create');
    }
    if (trigger === 'discard') {
        if (hasOp(then, 'draw')) features.add('discard-draw');
        if (hasOp(then, 'energy')) features.add('on-discard-energy');
    }
}

// 递归扫描效果列表，把特征加入 features。
function scanEffects(effects, features) {
    for (const effect of Array.isArray(effects) ? effects : []) {
        if (!effect) continue;
        if (effect.op === 'copy') {
            features.add('copy');
            if (effect.from === 'self') features.add('copy-self');
        } else if (effect.op === 'create') features.add('create');
        else if (effect.op === 'repeat-last') features.add('repeat-last');
        else if (effect.op === 'grow') features.add('grow');
        else if (effect.op === 'discard-hand' && effect.redraw) features.add('redraw-hand');
        else if (effect.op === 'buff') addTriggerFeatures(effect.trigger, effect.then, features);
        scanEffects(effect.then, features);
    }
}

// 一张牌的联动特征集合。
function featuresOf(card) {
    const features = new Set();
    scanEffects(card?.effects, features);
    scanEffects(card?.onDiscard, features);
    if (hasOp(card?.onDiscard, 'draw')) features.add('on-discard-draw');
    if (hasOp(card?.onDiscard, 'energy')) features.add('on-discard-energy');
    if (card?.trigger) addTriggerFeatures(card.trigger, card.effects, features);
    return features;
}

// 牌库里「被弃时」类特征会与新牌产生联动，需要纳入检测。
const DECK_WIDE_FEATURES = new Set(['on-discard-draw', 'on-discard-energy', 'redraw-hand']);
let deckFeaturesCache = null;

// 模板库里所有模板（取变量最小可用值构建）带有的牌库级特征，惰性计算并缓存。
function deckFeatures() {
    if (deckFeaturesCache) return deckFeaturesCache;
    deckFeaturesCache = new Set();
    for (const template of Object.values(CARD_TEMPLATES)) {
        const built = template.build(template.vars.map(([min, max]) => Math.min(max, Math.max(1, min))));
        const card = Array.isArray(built) ? { effects: built, onDiscard: template.onDiscard } : built;
        for (const feature of featuresOf(card)) if (DECK_WIDE_FEATURES.has(feature)) deckFeaturesCache.add(feature);
    }
    return deckFeaturesCache;
}

export const FORBIDDEN_COMBOS = Object.freeze([
    Object.freeze({ id: 'copy-self-repeat', label: '同一张牌「复制本张」加「重复上一张」', hit: (features) => features.has('copy-self') && features.has('repeat-last') }),
    Object.freeze({ id: 'zero-cost-copy-self', label: '0 费「复制本张」', hit: (features, card) => card.cost === 0 && features.has('copy-self') }),
    Object.freeze({ id: 'discard-draw-loop', label: '被弃时抽牌加弃牌触发抽牌', hit: (features) => features.has('on-discard-draw') && features.has('discard-draw') }),
    Object.freeze({ id: 'play-create', label: '出牌触发生成 0 费牌', hit: (features) => features.has('play-create') }),
    Object.freeze({ id: 'grow-repeat', label: '本场成长加重复上一张', hit: (features) => features.has('grow') && features.has('repeat-last') }),
    Object.freeze({ id: 'redraw-discard-energy', label: '弃全手再抽加被弃时得能量', hit: (features) => features.has('redraw-hand') && features.has('on-discard-energy') }),
    Object.freeze({ id: 'play-buff-copy', label: '出牌触发的限时 BUFF 加复制或生成', hit: (features) => features.has('play-trigger') && (features.has('copy') || features.has('create')) }),
]);

// 返回命中的禁用组合 id 列表。withDeck 为真时把整个模板库的牌库级特征也算进来。
export function forbiddenCombos(card, { withDeck = false } = {}) {
    const features = featuresOf(card);
    if (withDeck) for (const feature of deckFeatures()) features.add(feature);
    return FORBIDDEN_COMBOS.filter((combo) => combo.hit(features, card || {})).map((combo) => combo.id);
}
