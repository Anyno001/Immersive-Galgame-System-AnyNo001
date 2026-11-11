// 特质合成：配方表与纯逻辑（不接结算，独有效果只作数据描述）。
// 配方按特质名写；组成项可以是关系状态（恩情 / 仇怨 / 题材双向状态），状态名见 RELATION_PART_NAMES。
// 不直接依赖 stat-traits.js：需要 id 与名称互转时由调用方传入 defs（TRAIT_DEFS 数组）。

// 配方简写：[合成名, [组成项...], 独有效果键, 独有效果说明]
const RAW = [
  // 动物系与恋爱人设
  ['大型犬', ['犬系', '黏人', '撒娇精'], 'noGrudgeOnNeglect', '主角冷落多久都不对主角记芥蒂。'],
  ['高冷猫猫', ['猫系', '傲娇', '冰山'], 'noCoolAfterLike', '好感过「喜欢」后不再冷却。'],
  ['千年狐狸', ['狐系', '腹黑', '小恶魔'], 'knowCapHalfDesireHold', '主角对其了解永远不超过一半；其对主角欲望不自然消退。'],
  ['孤狼', ['狼系', '无口', '偏执狂'], 'trustNoDropOverHalf', '信任一旦过半，不再下降。'],
  ['受惊小兔', ['兔系', '社恐', '害羞鬼'], 'noStressWithHero', '主角在场时其压力不上升。'],
  ['独占', ['病娇', '占有狂', '醋坛子'], 'possessiveDesireSurge', '主角与他人亲近那一楼，其欲望上升一大档；豁免亲密门槛。'],
  ['笨蛋美人', ['小笨蛋', '天然呆', '冒失鬼'], 'failCharmsOthers', '其检定失败时，在场所有角色对其好感小升。'],
  ['意难平', ['白月光', '高岭之花', '青梅竹马'], 'heldByAbsentOne', '其不在场时，其他角色对主角好感上升打折扣（心里一直有人）。'],
  ['温柔刀', ['温柔疏离', '腹黑'], 'seeThroughAndFall', '主角对其了解过半那一楼，主角压力上升一大档、其好感上升一大档（看清了，也陷进去了）。'],
  ['霸总', ['强势', '控制狂', '财迷'], 'coverHeroSpending', '主角花钱时由其承担（主角金钱不减），每天最多一次。'],
  ['追妻火葬场', ['追悔', '强势', '冷血'], 'chaseWifeCrematorium', '芥蒂达到「明显」起，主角每次拒绝其好感不降、压力上升；芥蒂清零那一楼好感上升一大档。'],
  ['守护者', ['护短', '包容'], 'pullBackFromLimit', '主角压力满时，其在场可把主角从极限状态拉回。'],
  ['小太阳', ['元气', '乐天派', '社牛'], 'sunshineStressRelief', '其在场的日子，在场所有角色压力每天额外下降。'],
  ['万人迷', ['团宠', '社牛', '话痨'], 'newcomerHigherStart', '新登场角色起始关系高一档（主角可合成）。'],
  ['干饭王', ['贪吃鬼', '大胃王', '易饿'], 'mealStressRelief', '一起吃饭那一楼，主角与其压力都下降一大档。'],
  ['病美人', ['病秧子', '伤口难愈', '玻璃心'], 'careGainsFavorTrust', '主角照顾其的那一楼，其好感、信任各小升。'],
  ['金丝雀', ['兔系', '贤惠', '纯爱战士'], 'noStressWithHeroAwayRush', '主角在场时其压力不上升，离开主角多日压力加速上升。'],
  // 养成与性格
  ['战神', ['战斗狂', '强健', '睚眦必报'], 'battleStaminaFloor', '战斗结束后体力不低于一成；战斗那一楼压力不上升。'],
  ['天才', ['学霸', '过目不忘', '努力家'], 'noDailyGrowthLimit', '技能成长不受每日次数限制。'],
  ['卷王', ['工作狂', '好胜', '完美主义者'], 'growOnFailHalf', '技能成长检定失败时仍有一半机会成长；可透支体力：体力为零仍能行动，但次日体力上限减一档，持续一天。'],
  ['咸鱼', ['懒虫', '佛系', '瞌睡虫'], 'idleStressDownLowIncome', '压力每天下降一大档；打工收入低一档。'],
  ['天选之子', ['幸运儿', '福星'], 'fumbleToFail', '每天第一次大失败自动改为普通失败。'],
  ['赌神', ['赌徒', '幸运儿'], 'betWinBonusLossShield', '押注成功额外收入一档；每天第一次押注失败不扣钱。'],
  ['铁公鸡', ['吝啬鬼', '持家能手'], 'dailyInterest', '每天少量利息收入（与「小有积蓄」不叠加，取高）。'],
  ['江湖豪客', ['酒仙', '夜猫子', '讲义气'], 'drinkTrustUp', '一起喝酒那一楼双方信任小升。'],
  // 极端性格
  ['大恶魔', ['小恶魔', '抖S', '疯批'], 'stressFeedsDemon', '主角压力越高，其对主角好感与欲望上升越快；主角压力满那一楼，其欲望直接拉满。'],
  ['天使', ['包容', '傻白甜', '老好人'], 'angelNoGrudge', '在场所有角色对其不记芥蒂；主角做出背叛或伤害类事件时，其好感不降、只降信任。'],
  ['暴君', ['疯批', '抖S', '控制狂'], 'tyrantDesireHold', '亲密对决胜利后，其对主角欲望不消退。'],
  ['百炼成钢', ['坚韧', '旧伤'], 'noBreakdown', '不再进入压力转换「崩溃」（主角可合成）。'],
  // 罪犯（合成补充）
  ['亡命鸳鸯', ['杀手', '共犯', '纯爱战士'], 'fugitivePairNoStress', '两人同在一楼时，双方压力不上升。'],
  ['金牌骗子', ['骗子', '话痨', '幸运儿'], 'lieExposeShield', '谎言被揭穿每天第一次不结算。'],
  ['网络幽灵', ['黑客', '学霸', '社恐'], 'ghostInTheNet', '被追查那一楼不加压力；技术类检定大失败改为普通失败。'],
  // 床上专属（合成补充，nsfw）
  ['永动机', ['体力怪物', '夜夜笙歌', '秒回血'], 'intimateNoStamina', '亲密不消耗体力。'],
  ['一撩就倒', ['敏感体质', '一碰就软', '声控'], 'desireDailyRegrow', '主角在场的日子，其欲望每天自然回升一档。'],
  ['禁欲系破戒', ['反差萌', '禁欲', '口嫌体正直'], 'desireNoDecayOverHalf', '欲望过半后不再自然消退。'],
  ['女王様', ['女王', '抖S'], 'queenSubmitSurge', '主角顺从那一楼其欲望上升一大档；主角违逆改为欲望小升、不记芥蒂。'],
  ['主宰', ['抖S', '控制狂', '体力怪物'], 'partnerDesireFloor', '亲密那一楼，对方欲望下限提到一半。'],
  ['专属宠物', ['抖M', '事后黏人', '调教中'], 'afterglowClearGrudge', '亲密后其对主角芥蒂清零。'],
  // 恩情 / 仇怨 / 题材（含关系状态组成项）
  ['以身相许', ['知恩图报', '救命之恩'], 'gratitudeToHeartbeat', '好感直接升到「心动」（救命之恩取 TA 欠你一侧）。'],
  ['相爱相杀', ['结怨', '爱恨交织', '睚眦必报'], 'rivalWinBothFavor', '亲密对决与战斗中胜过对方，双方好感都上升。'],
  ['灵魂伴侣', ['永久标记', '信息素契合'], 'soulmateStressShare', '一方压力上升「大」及以上时，另一方在场可抵消一半。'],
  ['唯一向导', ['哨兵', '精神结合', '纯爱战士'], 'noMindscapeCollapse', '不再发生精神图景崩溃。'],
  ['命定之味', ['叉子', '守护', '纯爱战士'], 'tasteRestored', '叉子进食回复体力恢复正常（尝到了味道）。'],
  ['永夜伴侣', ['吸血鬼', '血契', '长生'], 'noDaylightPenalty', '吸血鬼白天的体力惩罚取消，长时间未吸血也不再增加压力。'],
  ['深海之心', ['人鱼', '人鱼之歌', '纯爱战士'], 'noLandPenalty', '主角在场时离水惩罚取消。'],
  ['生死之交', ['护短', '讲义气'], 'comradeKeyEdge', '并肩作战时，主角对其做出的共患难相关检定多一个奖励骰。'],
  ['生死契阔', ['契约者', '主从契约', '讲义气'], 'shareStaminaAtZero', '主从任一方体力归零时，另一方可分出体力使其不倒下（每天一次）。'],
  ['狼王之选', ['兽人', '伴侣印记', '犬系'], 'grudgeOnOtherNotHero', '伴侣被他人亲近时，其芥蒂只记在对方身上，不记在主角身上。'],
];

// 作为组成项的关系状态名（不是特质，不占格；由调用方通过 opts.states 传入）。
export const RELATION_PART_NAMES = Object.freeze([
  '救命之恩', '结怨', '爱恨交织', '永久标记', '信息素契合', '精神结合', '守护', '血契', '伴侣印记', '主从契约',
]);

// 含 nsfw 组成项的配方（图鉴在 NSFW 关闭时隐藏）；组成项全部来自「床上专属」。
const NSFW_RECIPES = new Set(['女王様', '永动机', '一撩就倒', '禁欲系破戒', '主宰', '专属宠物']);

export const TRAIT_RECIPES = Object.freeze(RAW.map(([name, parts, key, text], i) => Object.freeze({
  id: name,
  name,
  parts: Object.freeze(parts.slice()),
  effect: Object.freeze({ key, text }),
  nsfw: NSFW_RECIPES.has(name),
  order: i,
})));

// 关系状态 → 合成用的状态名列表。「救命之恩」只在「TA 欠你」（dir 为 ta）一侧成立，你欠 TA 一侧不参与合成（以身相许）。
// rels：character.relStates 数组 [{ id, dir }]。
export function relationStateNames(rels) {
  const out = [];
  for (const r of Array.isArray(rels) ? rels : []) {
    if (!r || !r.id) continue;
    if (r.id === '救命之恩' && r.dir !== 'ta') continue;
    if (!out.includes(r.id)) out.push(r.id);
  }
  return out;
}

// 是否关系状态组成项
export function isRelationPart(name) {
  return RELATION_PART_NAMES.includes(name);
}

// 把 id 或名称统一成名称。defs 为 TRAIT_DEFS 数组（缺省时按名称处理）。
export function toTraitName(x, defs) {
  const s = String(x ?? '');
  if (!s || !Array.isArray(defs)) return s;
  const byId = defs.find((d) => d.id === s);
  return byId ? byId.name : s;
}

function uniq(list) {
  return [...new Set(list)];
}

// 配方优先序：组成项多的在前，同数按表序（稳定排序）
function sortedRecipes(recipes) {
  return recipes
    .map((r, i) => [r, i])
    .sort((a, b) => (b[0].parts.length - a[0].parts.length) || (a[1] - b[1]))
    .map((x) => x[0]);
}

/**
 * 按规则合成。
 * @param {string[]} traits 角色当前特质（名称或 id；传 id 时需 opts.defs）
 * @param {object} [opts] { states: 关系状态名[], defs, recipes, protagonist: 是否主角 }
 * @returns {{combos:{id,name,parts,effect}[], slotsUsed:number}}
 *   slotsUsed：未参与合成的特质数 + 合成数（关系状态不占格）。
 */
export function resolveCombos(traits, opts = {}) {
  const { defs, states = [], protagonist = false } = opts;
  const recipes = opts.recipes || TRAIT_RECIPES;
  const traitNames = uniq((traits || []).map((t) => toTraitName(t, defs)).filter(Boolean));
  const stateNames = uniq((states || []).map(String).filter(Boolean));
  const pool = new Set([...traitNames, ...stateNames]);
  const defByName = new Map((defs || []).map((d) => [d.name, d]));
  const used = new Set();
  const combos = [];
  for (const r of sortedRecipes(recipes)) {
    // 主角只能合成「主角可用」项组成的配方
    if (protagonist && r.parts.some((p) => !isRelationPart(p) && defByName.get(p)?.protagonist === false)) continue;
    if (!r.parts.every((p) => pool.has(p) && !used.has(p))) continue;
    r.parts.forEach((p) => used.add(p));
    combos.push({ id: r.id, name: r.name, parts: r.parts.slice(), effect: r.effect });
  }
  const loose = traitNames.filter((n) => !used.has(n)).length;
  return { combos, slotsUsed: loose + combos.length };
}

function normSide(x) {
  if (Array.isArray(x)) return { traits: x, states: [] };
  return { traits: x?.traits || [], states: x?.states || [] };
}

/**
 * 对比前后两个状态，生成合成 / 拆分通知。
 * before / after：名称数组，或 { traits, states }。
 * opts：{ charName, defs, recipes, protagonist }
 * 拆分通知的 parts 为拆开后仍在身上的组成项。
 * @returns {{type:'combo'|'split', charName, name, parts}[]}
 */
export function diffCombos(before, after, opts = {}) {
  const { charName = '' } = opts;
  const b = normSide(before);
  const a = normSide(after);
  const rb = resolveCombos(b.traits, { ...opts, states: b.states });
  const ra = resolveCombos(a.traits, { ...opts, states: a.states });
  const bIds = new Set(rb.combos.map((c) => c.id));
  const aIds = new Set(ra.combos.map((c) => c.id));
  const aNames = new Set([...a.traits.map((t) => toTraitName(t, opts.defs)), ...a.states]);
  const out = [];
  for (const c of ra.combos) {
    if (!bIds.has(c.id)) out.push({ type: 'combo', charName, name: c.name, parts: c.parts.slice() });
  }
  for (const c of rb.combos) {
    if (!aIds.has(c.id)) out.push({ type: 'split', charName, name: c.name, parts: c.parts.filter((p) => aNames.has(p)) });
  }
  return out;
}

const quote = (list) => list.map((n) => `「${n}」`).join('');

// 通知文案（书面语）
export function comboNoticeText(n) {
  if (n.type === 'combo') return `${n.charName}的${quote(n.parts)}合成为「${n.name}」！`;
  return `${n.charName}的「${n.name}」拆回${quote(n.parts)}。`;
}
