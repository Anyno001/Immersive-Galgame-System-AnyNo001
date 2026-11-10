// 检定的特质奖惩骰：把 traitDice（特质）与 bondDice（欠你人情、结怨）折成一个 edge 修正（正为奖励骰、负为惩罚骰）。
// 只改检定骰数，不碰战斗与亲密对决规则；调用方把结果加进 resolveCheck 请求的 edge，最终仍由 modifiersOf 夹在规则体系的骰数上限内。
import { COMBAT_SKILLS } from './stat-registry.js';
import { bondDice, consumeFavorDice, hatesOpponent } from './stat-trait-rules-bond.js';
import { bondStrengthEdge } from './stat-trait-rules-e2b.js';
import { hasTrait, traitDice } from './stat-traits.js';

const TECH = new Set(['电脑', '开锁', '修理', '查资料', '伪造', '鉴定']);
const AGILE = new Set(['敏捷', '闪避', '攀爬', '潜行', '跳跃']);
const CRAFT = new Set(['手工', '烹饪', '修理', '化妆', '穿搭']);
const STUDY = new Set(['学习', '记忆', '查资料', '外语', '写作']);
const COMBAT = new Set(COMBAT_SKILLS);
// E2a 新增类别：医疗、认路、动物、灵异、术法。
const MEDICAL = new Set(['医术', '急救']);
const NAVIGATE = new Set(['认路', '追踪', '野外求生']);
const ANIMAL = new Set(['养宠物', '驯兽', '骑术']);
const SPIRIT = new Set(['占卜', '驱邪', '灵感']);
const ARCANE = new Set(['魔法', '魔药', '符咒', '法术']);
const STREET = new Set(['格斗', '恐吓', '力量', '敏捷', '闪避']);
const DATING = new Set(['魅惑', '安抚', '穿搭', '化妆', '唱歌']);
const CHARM = new Set(['魅力', '魅惑']);
// 万事通：任何检定中该技能值不低于此值。
export const ALL_ROUNDER_FLOOR = 30;

// 技能 → 检定类别（特质规则表里用的名字）。一个技能可属多类。
export function diceCategories(skill, { social = false, versus = false } = {}) {
    const out = [];
    if (social) out.push('社交');
    if (COMBAT.has(skill)) out.push('战斗');
    if (TECH.has(skill)) out.push('技术');
    if (AGILE.has(skill)) out.push('敏捷');
    if (CRAFT.has(skill)) out.push('手工');
    if (STUDY.has(skill)) out.push('学习');
    if (MEDICAL.has(skill)) out.push('医疗');
    if (NAVIGATE.has(skill)) out.push('认路');
    if (ANIMAL.has(skill)) out.push('动物');
    if (SPIRIT.has(skill)) out.push('灵异');
    if (ARCANE.has(skill)) out.push('术法');
    if (STREET.has(skill)) out.push('街头冲突');
    if (DATING.has(skill)) out.push('约会');
    if (CHARM.has(skill)) out.push('魅力');
    if (versus) out.push('对抗');
    return out;
}

// request：{ actor, skill, toward, social, skillValue }。返回 { edge, favorFrom }：
// favorFrom 为被求助时「欠你人情」的 NPC 名（本次检定用掉，由结算消耗）。
export function traitEdgeOf(state, cat, { actor = '主角', skill = '', toward = null, social = false, skillValue = 0, present = [], skillOf = null } = {}) {
    if (actor !== '主角' || !state) return { edge: 0, favorFrom: null, floor: 0 };
    const categories = diceCategories(skill, { social, versus: Boolean(toward) });
    const here = toward ? present.includes(toward) : false;
    // 睚眦必报、逆鳞：主角一侧由这里说明对手是否结怨对象。
    const hates = Boolean(toward && hatesOpponent(state, toward));
    let edge = 0;
    // 类别「通用」没有专属规则，只命中「全部」类规则；具体类别各算一次（traitDice 内「全部」规则对任何类别都生效，故只在通用里计一次）。
    edge += traitDice(state, cat, actor, '通用', { skillValue, here, hates });
    for (const category of categories) {
        edge += traitDice(state, cat, actor, category, { skillValue, here, hates }) - traitDice(state, cat, actor, '通用', { skillValue, here, hates });
        // 对方身上写的是「主角对其」的惩罚 / 奖励骰（腹黑、绿茶）。
        if (toward && state.characters && state.characters[toward]) edge += traitDice(state, cat, toward, category, { skillValue, here });
    }
    let favorFrom = null;
    if (toward && state.characters && state.characters[toward]) {
        const extra = bondDice(state, '主角', toward);
        edge += extra;
        if (social && bondDice(state, toward)) { edge += 1; favorFrom = toward; }
    }
    // 羁绊加成：恋人或信任满的在场 NPC 擅长该领域，多一个奖励骰（在场名单由调用方传入，没传则不生效）。
    const bond = bondStrengthEdge(state, { present, categories, has: (name, id) => hasTrait(state, cat, name, id), skillOf });
    if (bond) edge += bond.edge;
    return { edge: Math.max(-2, Math.min(2, edge)), favorFrom, floor: hasTrait(state, cat, actor, '万事通') ? ALL_ROUNDER_FLOOR : 0 };
}

// 用掉「欠你人情」的奖励骰：清除该 NPC 身上「欠你人情（ta）」的关系状态，返回新 state。
export const consumeFavor = (state, name) => (name ? consumeFavorDice(state, name) : state);

// 福星：主角的检定失败且当天未用过，自动重掷一次（redo 返回新检定）；用过的标记由结算按 check.reroll 写进 clock.luckyUsed。
export function luckyReroll(state, cat, check, redo) {
    if (!check || check.success || check.actor !== '主角' || !state || state.clock.luckyUsed || !hasTrait(state, cat, '主角', '福星')) return check;
    const again = redo();
    return { ...again, notes: [...(again.notes || []), '福星·重掷'], reroll: '福星·重掷' };
}
