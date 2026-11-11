import { parseBattleReport } from './battle-report.js';
// 数值特质 -> 卡牌战斗奖励：B 类（战利品卡牌槽的候选牌类偏向）与 C 类（翻牌时多一次选择）。纯函数；combat/ 不依赖 scene/stats，
// 特质名单由宿主层读取后传入。只改候选的抽取权重与翻牌便利，不给稀有度、槽位、积分、经验，也不改牌面。

// ---- B：奖励牌类偏向 ----
export const BIAS_WEIGHT = 1.5;
// 本职业整池（不分稀有度）该类别少于这个张数时，该特质不生效，顺延到下一个特质；某稀有度恰好没有该类牌时加权自然无效。
export const BIAS_MIN_POOL = 6;

// 特质名 -> 偏向的牌类（分组参照 STATS_TRAITS_BALANCE_BACKLOG 第六节 B 表）。
const GROUPS = Object.freeze({
    attack: ['战斗狂', '好胜', '睚眦必报', '鹰系', '杀手', '魔王', 'Alpha', '哨兵', '龙族'],
    block: ['坚韧', '熊系', '保护欲', '护短', '守护', '铁人', '强健', '包容', '老好人', '贤惠'],
    draw: ['过目不忘', '学霸', '黑客', '现实派', '人间清醒', '向导', '灵觉'],
    debuff: ['毒舌', '蛇系', '蛇妖', '病娇', '小恶魔', '骗子', '惯偷', '狐系', '狐妖', '腹黑'],
    buff: ['感染力强', '元气', '团宠', 'e人', '讲义气', '恋爱军师', '镇定剂'],
    random: ['赌徒', '冒失鬼', '天然呆', '幸运儿', '倒霉蛋'],
    selfharm: ['抖M', '疯批', '吸血鬼', '血契'],
    summon: ['动物缘', '使魔', '式神', '契约者', '主从契约', '精神体'],
});
export const BIAS_CATEGORIES = Object.freeze(Object.keys(GROUPS));
const CATEGORY_OF_TRAIT = new Map(Object.entries(GROUPS).flatMap(([category, names]) => names.map((name) => [name, category])));
export const biasCategoryOf = (trait) => CATEGORY_OF_TRAIT.get(String(trait || '').trim()) ?? null;

const BUFF_STATUSES = new Set(['strength', 'dexterity', 'flex', 'poise', 'vigor', 'empower', 'empower-turns', 'overpower', 'first-strike']);
const ALLY_TARGETS = new Set(['ally', 'all-allies']);
const ENEMY_TARGETS = new Set(['enemy', 'all-enemies']);
// 判主效果时跳过的前置代价类效果（如「自伤 2 点，获得 16 格挡」的主效果是格挡）。
const COST_OPS = new Set(['self-damage', 'exhaust-self', 'requires']);

function flatten(effects, out = []) {
    for (const effect of Array.isArray(effects) ? effects : []) {
        if (!effect || typeof effect !== 'object') continue;
        out.push(effect);
        flatten(effect.then, out);
        flatten(effect.a, out);
        flatten(effect.b, out);
    }
    return out;
}

// 牌的类别集合：攻击、格挡按牌类型与主效果；其余按「任意效果含」（能力牌首效果是 each-turn / buff，按首效果会误判）。
export function cardCategories(card) {
    const categories = new Set();
    if (!card || typeof card !== 'object') return categories;
    const effects = Array.isArray(card.effects) ? card.effects : [];
    const main = effects.find((effect) => !COST_OPS.has(effect?.op));
    if (card.type === 'attack') categories.add('attack');
    if (card.type === 'skill' && main?.op === 'block') categories.add('block');
    for (const effect of flatten([...effects, ...(Array.isArray(card.onDiscard) ? card.onDiscard : [])])) {
        const { op, target } = effect;
        if (['draw', 'energy', 'search', 'retrieve'].includes(op)) categories.add('draw');
        if ((op === 'status' || op === 'apply-status') && ENEMY_TARGETS.has(target)) categories.add('debuff');
        if (ALLY_TARGETS.has(target) || op === 'buff' || ((op === 'status' || op === 'apply-status') && target === 'self' && BUFF_STATUSES.has(effect.status))) categories.add('buff');
        if (op === 'random-branch' || target === 'random-enemy') categories.add('random');
        if (['self-damage', 'mutual-damage', 'delayed-counter'].includes(op)) categories.add('selfharm');
        if (['summon', 'minion-strike', 'sacrifice', 'soul'].includes(op)) categories.add('summon');
    }
    return categories;
}

const categoryCache = new WeakMap();
const categoriesOf = (card) => {
    let set = categoryCache.get(card);
    if (!set) {
        set = cardCategories(card);
        categoryCache.set(card, set);
    }
    return set;
};

// 本职业整池里属于该类别的牌数（不分稀有度，不看已持有与同名上限）。
export const poolCategoryCount = (pool, category) => (Array.isArray(pool) ? pool : []).filter((card) => categoriesOf(card).has(category)).length;

// 主角特质名单 -> 生效的偏向 { trait, category }：按名单顺序取第一个有偏向、且本职业整池该类别不少于 BIAS_MIN_POOL 张的特质；没有返回 null。
export function pickBias(traits, pool) {
    for (const name of Array.isArray(traits) ? traits : []) {
        const category = biasCategoryOf(name);
        if (category && poolCategoryCount(pool, category) >= BIAS_MIN_POOL) return { trait: String(name).trim(), category };
    }
    return null;
}

// 偏向类别的抽取权重函数：属于该类别的牌 ×BIAS_WEIGHT，其余 ×1。
export const biasWeightOf = (category) => (card) => (categoriesOf(card).has(category) ? BIAS_WEIGHT : 1);

// ---- C：翻牌时多一次选择 ----
export const FLIP_EVERY = 3;
// 表序即优先级，同一场只生效 1 个。counter 为真的特质按胜场计数（键 trait:<特质名>，复用账本 flipWins）。
export const TRAIT_FLIPS = Object.freeze([
    Object.freeze({ trait: '幸运儿', effect: 'choices', counter: true }),
    Object.freeze({ trait: '福星', effect: 'choices', counter: true, ally: true }),
    Object.freeze({ trait: '灵觉', effect: 'reveal', counter: true }),
    Object.freeze({ trait: '鹰系', effect: 'reveal', counter: true }),
    Object.freeze({ trait: '好奇宝宝', effect: 'reveal', counter: true }),
    Object.freeze({ trait: '赌徒', effect: 'reroll', counter: true }),
    // 完美主义者：仅精英、首领战，战报全员无伤（allClean）时免费重抽（无伤到翻牌时才知道，计划里只记资格）。
    Object.freeze({ trait: '完美主义者', effect: 'reroll', noDamage: true, tiers: Object.freeze(['elite', 'boss']) }),
]);
export const traitWinKey = (trait) => `trait:${trait}`;

const namesOf = (list) => new Set((Array.isArray(list) ? list : []).map((name) => String(name || '').trim()).filter(Boolean));
const winsOf = (wins, key) => (wins instanceof Map ? wins.get(key) : wins?.[key]) || 0;
const heldBy = (spec, hero, allies) => hero.has(spec.trait) || (spec.ally === true && allies.has(spec.trait));
// 本场该计数特质是否轮到触发。
export const traitFlipDue = (wins, trait) => (winsOf(wins, traitWinKey(trait)) + 1) % FLIP_EVERY === 0;

// 持有的需按胜场计数的特质名（记在 offer 的 traitHeld，账本据此累计胜场）。statTraits：{ hero, allies }。
export function heldCounterTraits(statTraits) {
    const hero = namesOf(statTraits?.hero);
    const allies = namesOf(statTraits?.allies);
    return TRAIT_FLIPS.filter((spec) => spec.counter === true && heldBy(spec, hero, allies)).map((spec) => spec.trait);
}

// 本场生效的 C 类效果 { trait, effect, noDamage? }；没有返回 null。弱小战跳过；
// 已无增益的（透视已满、遗物已给多一个选项）不生效，让位给下一个特质。
export function pickTraitFlip(statTraits, { tier, weak = false, wins = {}, reveal = 0, relicChoices = 0 } = {}) {
    if (weak === true) return null;
    const hero = namesOf(statTraits?.hero);
    const allies = namesOf(statTraits?.allies);
    for (const spec of TRAIT_FLIPS) {
        if (!heldBy(spec, hero, allies)) continue;
        if (spec.tiers && !spec.tiers.includes(tier)) continue;
        if (spec.counter === true && !traitFlipDue(wins, spec.trait)) continue;
        if (spec.effect === 'choices' && relicChoices > 0) continue;
        if (spec.effect === 'reveal' && reveal >= 2) continue;
        return { trait: spec.trait, effect: spec.effect, ...(spec.noDamage === true ? { noDamage: true } : {}) };
    }
    return null;
}

// offer 里的 traitFlip 是否自洽（账本校验用）：特质与效果对得上、完美主义者只在精英首领、计数特质须在 traitHeld 里、弱小战不带。
export function traitFlipIssue(flip, { held = [], tier, weak = false } = {}) {
    const spec = TRAIT_FLIPS.find((item) => item.trait === flip?.trait);
    if (!spec || spec.effect !== flip.effect || (spec.noDamage === true) !== (flip.noDamage === true)) return 'invalid-trait-flip';
    if (weak === true || (spec.tiers && !spec.tiers.includes(tier))) return 'invalid-trait-flip';
    if (spec.counter === true && !(Array.isArray(held) ? held : []).includes(spec.trait)) return 'trait-flip-not-held';
    return null;
}

// 战报文本是否全员无伤（与数值侧 battleDirectiveOf 的 allClean 同一口径：我方一行里每个人都是「无伤」）；解析不出为 false。
export function allCleanOf(text) {
    const report = parseBattleReport(text);
    return !!report && report.party.length > 0 && report.party.every((member) => member.status === '无伤');
}

// 本场重抽是否免费：offer 带免费重抽来源，且完美主义者要求战报全员无伤（allClean；未知按不免费）。
export function freeRerollOf(offer, allClean) {
    const flip = offer?.traitFlip;
    if (flip?.effect !== 'reroll') return false;
    return flip.noDamage === true ? allClean === true : true;
}
