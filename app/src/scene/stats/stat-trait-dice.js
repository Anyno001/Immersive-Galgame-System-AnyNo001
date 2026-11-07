// 检定的特质奖惩骰：把 traitDice（特质）与 bondDice（欠你人情、结怨）折成一个 edge 修正（正为奖励骰、负为惩罚骰）。
// 只改检定骰数，不碰战斗与亲密对决规则；调用方把结果加进 resolveCheck 请求的 edge，最终仍由 modifiersOf 夹在规则体系的骰数上限内。
import { COMBAT_SKILLS } from './stat-registry.js';
import { bondDice, consumeFavorDice } from './stat-trait-rules-bond.js';
import { traitDice } from './stat-traits.js';

const TECH = new Set(['电脑', '开锁', '修理', '查资料', '伪造', '鉴定']);
const AGILE = new Set(['敏捷', '闪避', '攀爬', '潜行', '跳跃']);
const CRAFT = new Set(['手工', '烹饪', '修理', '化妆', '穿搭']);
const STUDY = new Set(['学习', '记忆', '查资料', '外语', '写作']);
const COMBAT = new Set(COMBAT_SKILLS);

// 技能 → 检定类别（特质规则表里用的名字）。一个技能可属多类。
export function diceCategories(skill, { social = false, versus = false } = {}) {
    const out = [];
    if (social) out.push('社交');
    if (COMBAT.has(skill)) out.push('战斗');
    if (TECH.has(skill)) out.push('技术');
    if (AGILE.has(skill)) out.push('敏捷');
    if (CRAFT.has(skill)) out.push('手工');
    if (STUDY.has(skill)) out.push('学习');
    if (versus) out.push('对抗');
    return out;
}

// request：{ actor, skill, toward, social, skillValue }。返回 { edge, favorFrom }：
// favorFrom 为被求助时「欠你人情」的 NPC 名（本次检定用掉，由结算消耗）。
export function traitEdgeOf(state, cat, { actor = '主角', skill = '', toward = null, social = false, skillValue = 0, present = [] } = {}) {
    if (actor !== '主角' || !state) return { edge: 0, favorFrom: null };
    const categories = diceCategories(skill, { social, versus: Boolean(toward) });
    const here = toward ? present.includes(toward) : false;
    let edge = 0;
    // 类别「通用」没有专属规则，只命中「全部」类规则；具体类别各算一次（traitDice 内「全部」规则对任何类别都生效，故只在通用里计一次）。
    edge += traitDice(state, cat, actor, '通用', { skillValue, here });
    for (const category of categories) {
        edge += traitDice(state, cat, actor, category, { skillValue, here }) - traitDice(state, cat, actor, '通用', { skillValue, here });
        // 对方身上写的是「主角对其」的惩罚 / 奖励骰（腹黑、绿茶）。
        if (toward && state.characters && state.characters[toward]) edge += traitDice(state, cat, toward, category, { skillValue, here });
    }
    let favorFrom = null;
    if (toward && state.characters && state.characters[toward]) {
        const extra = bondDice(state, '主角', toward);
        edge += extra;
        if (social && bondDice(state, toward)) { edge += 1; favorFrom = toward; }
    }
    return { edge: Math.max(-2, Math.min(2, edge)), favorFrom };
}

// 用掉「欠你人情」的奖励骰：清除该 NPC 身上「欠你人情（ta）」的关系状态，返回新 state。
export const consumeFavor = (state, name) => (name ? consumeFavorDice(state, name) : state);
