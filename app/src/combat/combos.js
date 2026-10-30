import { CARD_TEMPLATES } from './card-templates.js';

// 内部禁止组合名单（计划 3.4，v4-p5）：拦截会自我循环或收益失控的效果组合。
// 卡牌模板求解（generation-assembly.js buildCard）与人物特性抽取（trait-pool.js 的主动与被动）共用这一个判定。
// 判定对象是一个实体的效果形状 { cost?, effects, onDiscard?, trigger? }（卡牌、技能或被动）。
// 被动常驻在角色身上：「每次弃牌时 X」等同于给全部牌加上被弃时 X；withDeck 为真时另计卡牌模板目录里可能进卡组的同类效果（DECK_TAGS）。
const has = (effects, op) => (Array.isArray(effects) ? effects : []).some((e) => e?.op === op || has(e?.then, op));

function triggerTags(trigger, effects, tags) {
    if (trigger === 'card-played') {
        tags.add('play-trigger');
        if (has(effects, 'create')) tags.add('play-create');
    }
    if (trigger === 'discard') {
        if (has(effects, 'draw')) tags.add('discard-draw');
        if (has(effects, 'energy')) tags.add('on-discard-energy');
    }
}

function effectTags(effects, tags) {
    for (const e of Array.isArray(effects) ? effects : []) {
        if (!e) continue;
        if (e.op === 'copy') {
            tags.add('copy');
            if (e.from === 'self') tags.add('copy-self');
        } else if (e.op === 'create') tags.add('create');
        else if (e.op === 'repeat-last') tags.add('repeat-last');
        else if (e.op === 'grow') tags.add('grow');
        else if (e.op === 'discard-hand' && e.redraw) tags.add('redraw-hand');
        else if (e.op === 'buff') triggerTags(e.trigger, e.then, tags);
        effectTags(e.then, tags);
    }
}

function shapeTags(shape) {
    const tags = new Set();
    effectTags(shape?.effects, tags);
    effectTags(shape?.onDiscard, tags);
    if (has(shape?.onDiscard, 'draw')) tags.add('on-discard-draw');
    if (has(shape?.onDiscard, 'energy')) tags.add('on-discard-energy');
    if (shape?.trigger) triggerTags(shape.trigger, shape.effects, tags);
    return tags;
}

// 卡组里可能出现、会与常驻被动交叉成环的效果：被弃时抽牌 / 得能量、弃全手再抽。每个模板按最小取值求一次形状（效果种类与数值无关）。
const DECK_TAGS = new Set(['on-discard-draw', 'on-discard-energy', 'redraw-hand']);
let deckTagCache = null;
function deckTags() {
    if (deckTagCache) return deckTagCache;
    deckTagCache = new Set();
    for (const t of Object.values(CARD_TEMPLATES)) {
        const out = t.build(t.vars.map(([lo, hi]) => Math.min(hi, Math.max(1, lo))));
        const shape = Array.isArray(out) ? { effects: out, onDiscard: t.onDiscard } : out;
        for (const tag of shapeTags(shape)) if (DECK_TAGS.has(tag)) deckTagCache.add(tag);
    }
    return deckTagCache;
}

// 名单 7 条（计划 3.4）。出牌触发的被动与出牌触发的限时 BUFF 同等对待（被动是常驻版本）；「被弃时得能量」也包括常驻的「每次弃牌时得能量」。
export const FORBIDDEN_COMBOS = Object.freeze([
    Object.freeze({ id: 'copy-self-repeat', label: '同一张牌「复制本张」加「重复上一张」', hit: (t) => t.has('copy-self') && t.has('repeat-last') }),
    Object.freeze({ id: 'zero-cost-copy-self', label: '0 费「复制本张」', hit: (t, s) => s.cost === 0 && t.has('copy-self') }),
    Object.freeze({ id: 'discard-draw-loop', label: '被弃时抽牌加弃牌触发抽牌', hit: (t) => t.has('on-discard-draw') && t.has('discard-draw') }),
    Object.freeze({ id: 'play-create', label: '出牌触发生成 0 费牌', hit: (t) => t.has('play-create') }),
    Object.freeze({ id: 'grow-repeat', label: '本场成长加重复上一张', hit: (t) => t.has('grow') && t.has('repeat-last') }),
    Object.freeze({ id: 'redraw-discard-energy', label: '弃全手再抽加被弃时得能量', hit: (t) => t.has('redraw-hand') && t.has('on-discard-energy') }),
    Object.freeze({ id: 'play-buff-copy', label: '出牌触发的限时 BUFF 加复制或生成', hit: (t) => t.has('play-trigger') && (t.has('copy') || t.has('create')) }),
]);

// 命中的规则 ID 列表；空数组为合法。
export function forbiddenCombos(shape, { withDeck = false } = {}) {
    const tags = shapeTags(shape);
    if (withDeck) for (const tag of deckTags()) tags.add(tag);
    return FORBIDDEN_COMBOS.filter((rule) => rule.hit(tags, shape || {})).map((rule) => rule.id);
}
