// 数值特质 -> 卡牌模板偏向：生成人物战斗技能时，贴人设的模板在候选同分定序里多拿签。
// 只影响候选的排序，不改任何数值、稀有度与费用；不带特质时与原结果逐位一致。combat/ 不依赖 scene/stats，特质名单由宿主层传入。
import { CARD_TEMPLATES } from './card-templates.js';

export const TRAIT_TEMPLATE_WEIGHT = 2;

// 特质名 -> 偏向的模板类别（分组参照计划六 B 表）。
const GROUPS = {
    attack: ['战斗狂', '好胜', '睚眦必报', '鹰系', '杀手', '魔王', 'Alpha', '哨兵', '龙族'],
    block: ['坚韧', '熊系', '保护欲', '护短', '守护', '铁人', '强健', '包容', '老好人', '贤惠'],
    draw: ['过目不忘', '学霸', '黑客', '现实派', '人间清醒', '向导', '灵觉'],
    debuff: ['毒舌', '蛇系', '蛇妖', '病娇', '小恶魔', '骗子', '惯偷', '狐系', '狐妖', '腹黑'],
    buff: ['感染力强', '元气', '团宠', 'e人', '讲义气', '恋爱军师', '镇定剂'],
    random: ['赌徒', '冒失鬼', '天然呆', '幸运儿', '倒霉蛋'],
    selfharm: ['抖M', '疯批', '吸血鬼', '血契'],
    summon: ['动物缘', '使魔', '式神', '契约者', '主从契约', '精神体'],
};
const CATEGORY_OF_TRAIT = new Map(Object.entries(GROUPS).flatMap(([category, names]) => names.map((name) => [name, category])));

const BUFF_STATUSES = new Set(['strength', 'dexterity', 'flex', 'poise', 'vigor', 'empower', 'empower-turns', 'overpower', 'first-strike']);
const ALLY_TARGETS = new Set(['ally', 'all-allies']);
const ENEMY_TARGETS = new Set(['enemy', 'all-enemies']);

// 展开嵌套效果（条件、随机分支、回合触发里的子效果）。
function flatten(effects, out = []) {
    for (const effect of effects || []) {
        out.push(effect);
        flatten(effect.then, out);
        flatten(effect.a, out);
        flatten(effect.b, out);
    }
    return out;
}

// 模板的类别集合：攻击、格挡按牌类型与主效果；其余按「任意效果含」。
function classify(key) {
    const tpl = CARD_TEMPLATES[key];
    const categories = new Set();
    if (!tpl) return categories;
    const built = tpl.build(tpl.vars.map((range) => range[0]));
    const main = Array.isArray(built) ? built : built.effects;
    const all = flatten([...(main || []), ...(Array.isArray(built) ? [] : built.onDiscard || [])]);
    if (tpl.type === 'attack') categories.add('attack');
    if (tpl.type === 'skill' && main?.[0]?.op === 'block') categories.add('block');
    for (const effect of all) {
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

const categoryCache = new Map();
const categoriesOf = (key) => {
    if (!categoryCache.has(key)) categoryCache.set(key, classify(key));
    return categoryCache.get(key);
};

// 特质名单 -> 偏向类别集合。
export function biasCategories(traits) {
    const set = new Set();
    for (const name of Array.isArray(traits) ? traits : []) {
        const category = CATEGORY_OF_TRAIT.get(String(name || '').trim());
        if (category) set.add(category);
    }
    return set;
}

// 返回模板权重函数（签数）；没有命中任何偏向类别时返回 null，调用方走原逻辑。
export function traitTemplateWeightOf(traits) {
    const wanted = biasCategories(traits);
    if (!wanted.size) return null;
    return (key) => ([...categoriesOf(key)].some((category) => wanted.has(category)) ? TRAIT_TEMPLATE_WEIGHT : 1);
}
