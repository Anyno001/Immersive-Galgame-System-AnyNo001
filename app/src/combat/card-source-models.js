// 来源：wiki.gg Cargo 2026-11-06 快照；Game 与卡名共同标识来源，不按名称猜测模板归属。
import { TEMPLATE_UPGRADE_POLICIES, TEMPLATE_UPGRADE_PREFIX, templateBaseMatches,
    templateUpgradeDecision, templateUpgradeModel, templateUpgradePolicy } from './card-template-upgrades.js';
const damage = amount => ({ op: 'damage', amount, hits: 1, target: 'enemy' });
const block = amount => ({ op: 'block', amount, target: 'self' });
const draw = amount => ({ op: 'draw', amount });
const energy = amount => ({ op: 'energy', amount });
const exhaust = { op: 'exhaust-self' };
const retrieve = { op: 'retrieve', amount: 1, from: 'discard' };
const discard = { op: 'discard', amount: 1, mode: 'choose' };
const status = (status, stacks) => ({ op: 'apply-status', status, stacks });
const other = mode => ({ op: 'exhaust-other', amount: 1, from: 'hand', mode });
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
};
const model = (game, name, type, cost, rarity, effects, upgraded, fixed = [], flags = {}) =>
    ({ game, name, fixed, face: { type, cost, rarity, effects, ...flags, upgraded } });

export const SOURCE_CARD_MODELS = freeze({
    'g2-strike': model(2, 'Strike (Ironclad)', 'attack', 1, 'basic', [damage(6)], { effects: [damage(9)] }),
    'g2-defend': model(2, 'Defend (Ironclad)', 'skill', 1, 'basic', [block(5)], { effects: [block(8)] }),
    'g2-bloodletting': model(2, 'Bloodletting', 'skill', 0, 'uncommon', [{ op: 'self-damage', amount: 3 }, energy(2)],
        { effects: [{ op: 'self-damage', amount: 3 }, energy(3)] }, ['warrior-08']),
    'g2-body-slam': model(2, 'Body Slam', 'attack', 1, 'common', [{ op: 'damage-from-block' }], { cost: 0 }, ['warrior-10']),
    'g2-burning-pact': model(2, 'Burning Pact', 'skill', 1, 'uncommon', [other('choose'), draw(2)],
        { effects: [other('choose'), draw(3)] }, ['warrior-14']),
    'g2-headbutt': model(2, 'Headbutt', 'attack', 1, 'common', [damage(9), { ...retrieve, to: 'top' }],
        { effects: [damage(12), { ...retrieve, to: 'top' }] }, ['warrior-35']),
    'g2-pommel-strike': model(2, 'Pommel Strike', 'attack', 1, 'common', [damage(9), draw(1)],
        { effects: [damage(10), draw(2)] }, ['warrior-54']),
    'g2-true-grit': model(2, 'True Grit', 'skill', 1, 'common', [block(7), other('random')],
        { effects: [block(9), other('choose')] }, ['warrior-74']),
    'g2-barricade': model(2, 'Barricade', 'power', 3, 'rare', [status('barricade', 1)], { cost: 2 }, ['warrior-05']),
    'g2-accuracy': model(2, 'Accuracy', 'power', 1, 'uncommon', [{ op: 'hone-shiv', mode: 'edge', amount: 4 }],
        { effects: [{ op: 'hone-shiv', mode: 'edge', amount: 6 }] }, ['assassin-03']),
    'g2-acrobatics': model(2, 'Acrobatics', 'skill', 1, 'uncommon', [draw(3), discard],
        { effects: [draw(4), discard] }, ['assassin-04']),
    'g2-adrenaline': model(2, 'Adrenaline', 'skill', 0, 'rare', [energy(1), draw(2), exhaust],
        { effects: [energy(2), draw(2), exhaust] }, ['assassin-05']),
    'g2-backflip': model(2, 'Backflip', 'skill', 1, 'common', [block(5), draw(2)],
        { effects: [block(8), draw(2)] }, ['assassin-09']),
    'g2-calculated-gamble': model(2, 'Calculated Gamble', 'skill', 0, 'uncommon', [{ op: 'discard-hand', redraw: true }, exhaust],
        { retain: true }, ['assassin-18']),
    'g2-double-energy': model(2, 'Double Energy', 'skill', 1, 'uncommon', [{ op: 'energy-double' }, exhaust],
        { cost: 0 }, ['mage-24']),
    'g2-echo-form': model(2, 'Echo Form', 'power', 3, 'rare', [status('echo-play', 1)],
        { ethereal: false }, ['mage-25'], { ethereal: true }),
    'g2-hologram': model(2, 'Hologram', 'skill', 1, 'common', [block(3), retrieve, exhaust],
        { effects: [block(5), retrieve] }, ['mage-39']),
    'g2-machine-learning': model(2, 'Machine Learning', 'power', 1, 'rare', [{ op: 'each-turn', then: [draw(1)] }],
        { innate: true }, ['mage-47']),
    'g1-rushdown': model(1, 'Rushdown', 'power', 1, 'uncommon', [status('wrath-draw', 2)],
        { cost: 0 }, ['bard-49']),
    'g2-entrench': model(2, 'Entrench', 'skill', 2, 'event', [{ op: 'double', stat: 'block', target: 'self' }],
        { cost: 1 }),
});

export const SOURCE_FACE_FIELDS = Object.freeze(['type', 'cost', 'rarity', 'effects', 'upgraded',
    'innate', 'ethereal', 'retain', 'sly', 'unplayable', 'onDiscard', 'replay', 'radiance']);

// 与 schema 的缺省表达对齐；对象键顺序不参与来源身份。
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    const next = { ...value };
    if (next.op === 'damage') { next.hits ??= 1; next.target ??= 'enemy'; }
    if (next.op === 'damage-from-block') next.target ??= 'enemy';
    if (next.op === 'block' || next.op === 'heal') next.target ??= 'self';
    if (next.op === 'apply-status') next.target ??= 'self';
    if (next.op === 'retrieve') next.to ??= 'hand';
    return Object.fromEntries(Object.keys(next).filter(key => next[key] !== undefined).sort().map(key => [key, canonical(next[key])]));
}
export const sameSourceValue = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const faceShape = card => Object.fromEntries(SOURCE_FACE_FIELDS.filter(key => card?.[key] !== undefined
    && !(typeof card[key] === 'boolean' && card[key] === false)).map(key => [key, card[key]]));

export function sourceCardMatches(card) {
    const source = Object.hasOwn(SOURCE_CARD_MODELS, card?.sourceModel) ? SOURCE_CARD_MODELS[card.sourceModel] : null;
    return !!source && sameSourceValue(faceShape(card), faceShape(source.face));
}

export function sourceFixedCard(legacy) {
    const slot = legacy.id.replace(/^fx-/, '');
    const entry = Object.entries(SOURCE_CARD_MODELS).find(([, source]) => source.fixed.includes(slot));
    if (!entry) return legacy;
    const [sourceModel, source] = entry;
    return { id: `${legacy.id}-s1`, name: legacy.name, model: 'fixed', sourceModel, ...clone(source.face) };
}

// 显式组件策略不是旧模板的历史身份断言；只继承列出的原效果升级，其他组件原样保留。
export const TEMPLATE_UPGRADE_MODELS = freeze({
    strike: { source: 'g2-strike', kind: 'delta', path: ['effects', 0, 'amount'], delta: 3 },
    guard: { source: 'g2-defend', kind: 'delta', path: ['effects', 0, 'amount'], delta: 3 },
    headbutt: { source: 'g2-headbutt', kind: 'delta', path: ['effects', 0, 'amount'], delta: 3 },
    cull: { source: 'g2-acrobatics', kind: 'delta', path: ['effects', 0, 'amount'], delta: 1 },
    brace: { source: 'g2-backflip', kind: 'delta', path: ['effects', 0, 'amount'], delta: 3 },
    adrenal: { source: 'g2-adrenaline', kind: 'delta', path: ['effects', 0, 'amount'], delta: 1 },
    bloodrush: { source: 'g2-bloodletting', kind: 'delta', path: ['effects', 0, 'amount'], delta: 1 },
    'shiv-edge': { source: 'g2-accuracy', kind: 'delta', path: ['effects', 0, 'amount'], delta: 2 },
    'rage-flow': { source: 'g1-rushdown', kind: 'cost', from: 1, to: 0 },
    entrench: { source: 'g2-entrench', kind: 'cost', from: 2, to: 1 },
    slam: { source: 'g2-body-slam', kind: 'cost', from: 1, to: 0 },
    barricade: { source: 'g2-barricade', kind: 'cost', from: 3, to: 2 },
    overcharge: { source: 'g2-double-energy', kind: 'cost', from: 1, to: 0 },
});

export function templateSourceUpgrade(key, card) {
    const rule = Object.hasOwn(TEMPLATE_UPGRADE_MODELS, key) ? TEMPLATE_UPGRADE_MODELS[key] : null;
    if (!rule || card.unplayable) return null;
    if (rule.kind === 'cost') return card.cost === rule.from ? { cost: rule.to } : null;
    if (rule.kind === 'flag') return card[rule.flag] === rule.from ? { [rule.flag]: rule.to } : null;
    const face = clone(card);
    const parent = rule.path.slice(0, -1).reduce((value, field) => value?.[field], face);
    const field = rule.path.at(-1);
    if (!parent || !Number.isInteger(parent[field])) return null;
    parent[field] += rule.delta;
    return { [rule.path[0]]: face[rule.path[0]] };
}

const variable = (min, max) => ({ variable: [min, max] });
const templateShape = (type, effects, flags = {}) => ({ type, effects, ...flags });
const guardShape = max => ({ ...block(0), amount: variable(1, max) });
const strikeShape = max => ({ ...damage(0), amount: variable(1, max) });
const optionalBlock = { ...block(0), amount: variable(0, 20) };
const TEMPLATE_COMPONENT_SHAPES = freeze({
    strike: templateShape('attack', [strikeShape(40)]),
    guard: templateShape('skill', [guardShape(40)]),
    headbutt: templateShape('attack', [strikeShape(30), { ...retrieve, to: 'top' }]),
    cull: templateShape('skill', [{ op: 'draw', amount: variable(1, 3) }, discard, guardShape(20)]),
    brace: templateShape('skill', [guardShape(30), draw(1)]),
    adrenal: templateShape('skill', [{ op: 'energy', amount: variable(1, 2) }, { op: 'draw', amount: variable(1, 2) }, exhaust]),
    bloodrush: templateShape('skill', [{ op: 'energy', amount: variable(1, 2) }, { op: 'self-damage', amount: variable(1, 8) }]),
    'shiv-edge': templateShape('skill', [{ op: 'hone-shiv', mode: 'edge', amount: variable(1, 4) }, optionalBlock]),
    'rage-flow': templateShape('power', [{ ...status('wrath-draw', 0), stacks: variable(1, 2) }]),
    entrench: templateShape('skill', [guardShape(20), { op: 'double', stat: 'block', target: 'self' }]),
    slam: templateShape('attack', [guardShape(20), { op: 'damage-from-block' }]),
    barricade: templateShape('power', [status('barricade', 1), { ...optionalBlock, amount: variable(0, 30) }]),
    overcharge: templateShape('skill', [{ op: 'energy-double' }, optionalBlock, exhaust]),
});

function matchTemplateShape(pattern, actual) {
    if (pattern?.variable) return Number.isInteger(actual) && actual >= pattern.variable[0] && actual <= pattern.variable[1];
    if (Array.isArray(pattern)) {
        if (!Array.isArray(actual)) return false;
        let index = 0;
        for (const item of pattern) {
            if (item?.amount?.variable?.[0] === 0 && actual[index]?.op !== item.op) continue;
            if (!matchTemplateShape(item, actual[index++])) return false;
        }
        return index === actual.length;
    }
    if (!pattern || typeof pattern !== 'object') return pattern === actual;
    return !!actual && typeof actual === 'object' && !Array.isArray(actual)
        && Object.keys(pattern).length === Object.keys(actual).length
        && Object.entries(pattern).every(([key, value]) => matchTemplateShape(value, actual[key]));
}

export function templateComponentMatches(key, card) {
    if (!Object.hasOwn(TEMPLATE_COMPONENT_SHAPES, key)) return false;
    const { cost, rarity, upgraded, ...shape } = faceShape(card);
    return matchTemplateShape(canonical(TEMPLATE_COMPONENT_SHAPES[key]), canonical(shape));
}

export const TEMPLATE_UPGRADE_MODEL_KEYS = Object.freeze([
    ...Object.keys(TEMPLATE_UPGRADE_MODELS), ...Object.keys(TEMPLATE_UPGRADE_POLICIES).map(templateUpgradeModel),
]);
const templateFaceKey = card => {
    const { cost, rarity, upgraded, ...shape } = faceShape(card);
    return JSON.stringify(canonical(shape));
};
export function templateUpgradeHasSource(model) {
    return Object.hasOwn(TEMPLATE_UPGRADE_MODELS, model) || templateUpgradePolicy(model)?.origin === 'source-component';
}

export function templateUpgradeMatches(card) {
    const key = card?.upgradeModel;
    if (typeof key === 'string' && key.startsWith(TEMPLATE_UPGRADE_PREFIX)) {
        const template = key.slice(TEMPLATE_UPGRADE_PREFIX.length);
        if (!templateUpgradePolicy(key) || !templateBaseMatches(template, card, templateFaceKey)) return false;
        const expected = templateUpgradeDecision(template, card);
        return !expected.error && sameSourceValue(card.upgraded, expected.upgraded)
            && card.upgradeReason === expected.reason;
    }
    if (typeof key !== 'string' || !Object.hasOwn(TEMPLATE_UPGRADE_MODELS, key)) return false;
    if (card.upgradeReason !== undefined || !templateComponentMatches(key, card)) return false;
    const expected = templateSourceUpgrade(key, card);
    return !!expected && sameSourceValue(card.upgraded, expected);
}
