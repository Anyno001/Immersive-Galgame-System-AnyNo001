// 出牌命中的形态与元素：按卡名、风味文字与效果说明做关键词模糊匹配；纯函数，只决定命中演出的形状与配色，不影响结算。
// 形态：slash 斩击 / blunt 钝击（物理）、gun 枪击、blast 爆炸、curse 咒术、arcane 法术。元素只换配色，不换形状。
// 同一段文字命中多个词时取结束位置最靠后的词（招式名多以末字定性：「火焰拳」是拳、「爆裂斩」是斩），结束位置相同取更长的词（「红缨枪」是长兵、「导弹」是爆炸）。
// 名称优先，其次风味文字，最后效果说明（如「施加中毒」）。都没有形态词时：要求属性为智力 / 感知按法术、魅力按咒术；
// 有元素按法术；否则按要求属性（力量、体质钝击，敏捷斩击），没有要求属性按斩击。
// 出手方式 delivery：枪击、爆炸与弓箭暗器类为远程（ranged），咒术、法术为施法（spell），其余为近战（melee）；aoe 为效果打全体敌人（含条件分支）。
// 战斗面板据此决定画面中间有无前摇：单体近战没有前摇，命中特效只落在受击单位身上；远程、施法与范围攻击先在中间出射击 / 吟唱 / 全场特效。
import { describeEffects } from './combat-card-art.js';

const FORM_WORDS = Object.freeze({
    slash: ['斩', '剑', '刀', '砍', '劈', '刃', '居合', '拔刀', '横扫', '爪', '牙', '撕', '咬', '镰', '斧', '刺', '矛', '戟', '长枪', '枪法', '枪术', '红缨枪', '弓', '箭', '矢', '弩', '飞镖', '飞刀', '暗器', '针'],
    blunt: ['拳', '掌', '腿', '脚', '踢', '踹', '肘', '膝', '撞', '锤', '棍', '棒', '杖击', '砸', '捶', '碎', '崩', '震', '盾击', '重击', '冲击波', '反弹', '摔'],
    gun: ['枪', '铳', '弹', '射击', '狙', '扫射', '连射', '速射', '霰弹', '子弹', '开火'],
    blast: ['爆', '炸', '轰', '炮', '雷管', '手雷', '榴弹', '炸弹', '导弹', '火箭', '陨石', '流星'],
    curse: ['咒', '诅', '蛊', '巫', '怨', '厄', '邪', '魇', '献祭', '血祭', '凋零', '凶兆'],
    arcane: ['法术', '魔法', '秘术', '奥术', '飞弹', '魔弹', '法弹', '法阵', '魔力', '星辰', '咒文', '弹奏', '弹琴', '琴', '歌'],
});

const ELEMENT_WORDS = Object.freeze({
    fire: ['火', '炎', '焰', '焚', '灼', '燃', '熔', '烈日'],
    ice: ['冰', '霜', '雪', '寒', '冻', '凛'],
    thunder: ['雷', '电', '霆', '霹雳'],
    wind: ['风', '岚', '飓', '旋风', '气旋'],
    water: ['水', '潮', '浪', '涛', '海', '雨', '漩涡'],
    earth: ['岩', '石', '土', '沙', '大地', '山崩', '地裂'],
    poison: ['毒', '蛇', '蝎', '瘴', '腐', '酸'],
    holy: ['圣', '光', '辉', '曙', '晨曦', '天使', '审判', '祝福', '净化'],
    shadow: ['暗', '影', '夜', '冥', '幽', '魂', '虚空', '深渊'],
});
// 带元素字却不表示元素的词：找元素前先从文字里去掉（「手雷」不是雷电，「暗器」不是暗影）。
const ELEMENT_IGNORE = Object.freeze(['雷管', '手雷', '暗器', '暗算', '无影', '光速', '灵光']);
export const STRIKE_ELEMENT_COLORS = Object.freeze({
    fire: '#ff7a3d', ice: '#8fd8ff', thunder: '#ffe066', wind: '#9fe6c2', water: '#4fa8ff',
    earth: '#c9a46a', poison: '#9be15d', holy: '#fff1a8', shadow: '#a37cff',
});
export const STRIKE_FORM_COLORS = Object.freeze({
    slash: '#e8f1ff', blunt: '#ffc880', gun: '#ffe9a8', blast: '#ff9a4a', curse: '#b06cff', arcane: '#7ec8ff',
});
const ABILITY_FORM = Object.freeze({ str: 'blunt', con: 'blunt', dex: 'slash', int: 'arcane', wis: 'arcane', cha: 'curse' });
const CASTER = new Set(['int', 'wis', 'cha']);
const SPELL_FORMS = new Set(['curse', 'arcane']);
const RANGED_FORMS = new Set(['gun', 'blast']);
// 画斩击形态、但从远处出手的词：弓弩、投掷与暗器。
const RANGED_WORDS = Object.freeze(['弓', '箭', '矢', '弩', '飞镖', '飞刀', '暗器', '针']);

// 一段文字里最贴切的词：结束位置最靠后者胜，结束位置相同取更长的词；返回 { key, word }，都没有返回 null。
function lastWord(text, table) {
    let best = null;
    for (const [key, words] of Object.entries(table)) {
        for (const word of words) {
            const at = text.lastIndexOf(word);
            if (at < 0) continue;
            const end = at + word.length;
            if (!best || end > best.end || (end === best.end && word.length > best.word.length)) best = { key, word, end };
        }
    }
    return best;
}

// 效果里有打全体敌人的伤害或状态（含条件分支里的），算范围攻击。
const hitsAll = (effects) => (Array.isArray(effects) ? effects : []).some((e) => (e?.op === 'conditional'
    ? hitsAll(e.then) : (e?.op === 'damage' || e?.op === 'status') && e.target === 'all-enemies'));

// card：战斗快照里的卡牌对象（name / flavor / effects / scaling）；技能、人物技能与道具同形，没有 scaling 时只按名字与效果判断。
// 返回 { form, element, color, delivery, aoe }；element 为空串时配色取形态色。
export function cardStrike(card) {
    const sources = [String(card?.name || ''), String(card?.flavor || ''), describeEffects(card?.effects)];
    const pick = (table, ignore = []) => {
        for (const raw of sources) {
            const text = ignore.reduce((t, w) => t.split(w).join(''), raw);
            const hit = text ? lastWord(text, table) : null;
            if (hit) return hit;
        }
        return null;
    };
    const element = pick(ELEMENT_WORDS, ELEMENT_IGNORE)?.key || '';
    const ability = String(card?.scaling?.ability || '');
    const word = pick(FORM_WORDS);
    const form = word?.key || (CASTER.has(ability) ? ABILITY_FORM[ability] : element ? 'arcane' : ABILITY_FORM[ability] || 'slash');
    const delivery = SPELL_FORMS.has(form) ? 'spell' : RANGED_FORMS.has(form) || RANGED_WORDS.includes(word?.word) ? 'ranged' : 'melee';
    return { form, element, color: STRIKE_ELEMENT_COLORS[element] || STRIKE_FORM_COLORS[form], delivery, aoe: hitsAll(card?.effects) };
}

