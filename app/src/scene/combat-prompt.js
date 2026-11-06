// 战斗提示词：给 AI 的「战斗」规则段、战报后的续写段、主角团状态段。
import { INTIMATE_GRAMMAR_LINE, INTIMATE_LINES_LINE, normalizeIntimateSettings } from './intimate-duel.js';
import { INSCRIPTION_LABELS } from '../combat/mechanics/inscription.js';
// 规则文本按开关拼装：合并模式下装备/道具标签单独成段，物品演出开启时道具获得行并入物品演出。
export const COMBAT_BLOCK_KEY = 'combat';
export const COMBAT_NARRATION_SEGMENT_ID = 'igs-combat-narration';
export const COMBAT_PARTY_SEGMENT_ID = 'igs-combat-party';
export const COMBAT_REPORT_RESULTS = Object.freeze(['win', 'lose', 'escape']);

const REPORT_TAG = /<igs-combat-report\b[^>]*\bresult\s*=\s*"(win|lose|escape)"[^>]*>/i;
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function combatExpansionEnabled(settings) {
    return asObject(asObject(settings).combatExpansion).enabled === true;
}

// 对决类型：combat 只有战斗，daily 仅日常挑战，both 两者；缺省 combat，旧存档行为不变。
export const COMBAT_KINDS = Object.freeze(['combat', 'daily', 'both']);
export function combatKindOf(settings) {
    const kind = asObject(asObject(settings).combatExpansion).kind;
    return COMBAT_KINDS.includes(kind) ? kind : 'combat';
}
export const combatGrammarEnabled = (settings) => combatExpansionEnabled(settings) && combatKindOf(settings) !== 'daily';
export const dailyChallengeEnabled = (settings) => combatExpansionEnabled(settings) && combatKindOf(settings) !== 'combat';

export const CHALLENGE_SEGMENT_ID = 'igs-challenge-rule';
export const CHALLENGE_GRAMMAR_LINE = '【日常挑战】[igs-challenge:事件名|领域|难度|代价|对方]：剧情走到一件成败攸关、值得认真对待的事时，在该楼正文最后一行写一次，随后停笔，不写结果；领域写技能名，难度写 轻松/普通/艰难，代价写 压力/体力/金钱/关系，对方写在场人物名（代价为关系时必须写），后三项可省略';

export const COMBAT_FREQUENCIES = Object.freeze(['low', 'normal', 'high']);
// 战斗与日常挑战共用的两场间隔楼数选项。
export const COMBAT_COOLDOWN_CHOICES = Object.freeze([0, 1, 2, 4, 8, 12, 16, 24]);
const CHALLENGE_FREQUENCY_LINES = Object.freeze({
    low: '挑战频率：只在成败确实悬而未决、值得认真对待的事上写挑战标签，日常小事用剧情带过。',
    high: '挑战频率：剧情中出现考验、较量、交涉或冒险时，积极安排挑战，可以主动引出。',
});
const ONLY_ONE_DUEL_LINE = '同一层的对决标签（战斗或日常挑战）最多写一个，写了一个就不再写另一个。';

// 重新生成或滑动换页时，末尾那层 AI 楼正在被替换，冷却扫描与楼号都不把它算进去。
export function chatForCooldown(messages, generationType) {
    const list = Array.isArray(messages) ? messages : [];
    return (generationType === 'swipe' || generationType === 'regenerate') && list.length && list.at(-1)?.is_user !== true ? list.slice(0, -1) : list;
}

// quota 为 challengeQuota 的结果；额度用完或冷却中时不放语法行。
// 两者模式下战斗没有冷却时，追加同层只写一个对决的提示（settings.combatSinceStart 与冷却判断见 resolveCombatPromptRule）。
export function resolveChallengePromptSegment(settings, quota) {
    const intimateLine = combatExpansionEnabled(settings) && normalizeIntimateSettings(asObject(asObject(settings).combatExpansion).intimate).enabled && asObject(settings).intimateOn === true ? `${INTIMATE_GRAMMAR_LINE}\n${INTIMATE_LINES_LINE}` : '';
    const dailyOpen = dailyChallengeEnabled(settings) && Boolean(quota) && quota.ok === true;
    if (!dailyOpen && !intimateLine) return null;
    const daily = asObject(asObject(asObject(settings).combatExpansion).daily);
    const bothOpen = dailyOpen && combatKindOf(settings) === 'both' && !combatOnCooldown(asObject(settings).combatSinceStart, combatCooldownFloorsOf(settings));
    const content = [dailyOpen ? CHALLENGE_GRAMMAR_LINE : '', intimateLine, dailyOpen ? CHALLENGE_FREQUENCY_LINES[daily.frequency] : '', bothOpen ? ONLY_ONE_DUEL_LINE : ''].filter(Boolean).join('\n');
    return { id: CHALLENGE_SEGMENT_ID, position: 'depth0', depth: 0, content, keys: ['challenge'] };
}

export const COMBAT_GRAMMAR_INDEX = '战斗 igs-combat:start/awaken/exp/learn/upgrade/class/unequip/rel/stat/heal';
export const COMBAT_GAIN_LINE = '- [igs-fx:item|获得|名称|描述|类别|稀有度]：剧情中主角真的得到一件具体物品时写；类别只写 武器/防具/饰品/宝物/道具/杂物 之一（武器、防具、饰品、宝物是可装备的装备，道具是能在战斗中用一次的药剂、符咒、暗器等，其余写杂物）；稀有度只写 普通/罕见/稀有/史诗/神话 之一，按物品品相写，可省略；对应部位空着时新装备会自动装上';
export const COMBAT_LOSE_LINE = '- [igs-fx:item|失去|名称|描述|数量|角色]：剧情中物品真的离开持有者时写（被缴械、被夺走、损毁、交出、遗失），程序会从背包里扣掉；数量写数字，省略为 1，写「全部」表示持有的全部；角色是失去物品的人，主角写「我」或省略，同伴写角色名；只是收起或换下装备不写';

export function itemFxPromptEnabled(settings) {
    return asObject(asObject(settings).itemFx).enabled === true;
}

// 战斗开启而物品演出关闭时，「获得」行放进战斗段里。
export function combatGainInCombatBlock(settings) {
    return combatExpansionEnabled(settings) && !itemFxPromptEnabled(settings);
}

// 完整的战斗规则段；includeGain 为真时附带物品获得行。
function buildRuleText(includeGain = false) {
    return `【战斗】战斗由前端卡牌系统结算，正文只负责引出遭遇和记录成长，标签写作 [igs-combat:类型|参数]：
- [igs-combat:start|遭遇名|敌方|友方|等级]：剧情真正进入交战的那一刻写在本层正文的最后一行，写完立即结束本层，不再写任何正文；本层要写的其他标签（rel、stat 等）都写在它之前；敌方写 名称 或 名称*数量，逗号分隔，合计最多50个（场上同时最多5个，其余在场外依次补上）；友方写同行参战的角色名，逗号分隔，最多3人，主角不用写；等级只写 普通/精英/首领，可省略；每层最多一个
- [igs-combat:awaken|角色|类型|台词]：只在重大情绪节点写（同伴在眼前倒下、立誓守护、绝境不退、宿敌当前等），平常战斗不写；必须紧挨在开战标签的上一行，开战标签仍是最后一行；角色写主角（「我」或主角名）；类型只写 怒火/守护/悲恸/决意/羁绊/极限/复仇/不屈 之一；台词是此刻喊出的一句话，不超过30字；每场最多一个
- [igs-combat:lines|角色|开场|出招|受击|倒下]：只给有名有姓、已登记的参战角色写（敌我都可），与觉醒标签、开战标签一起放进正文末尾单独的战斗块里，块内依次是 lines 行、awaken 行、开战标签，写法：第一行 <igs-combat>，最后一行 </igs-combat>，块写完立即结束本层；每个角色一条，一场最多6条；四段各写一到两句，多句用「/」隔开，每句不超过15字，受击写短促的语气词（如 唔！/呃……/啧）；无名杂兵不写
- [igs-combat:exp|角色|数值|原因]：剧情中获得历练时写，每层每个角色合计不超过50
- [igs-combat:learn|角色|技能名|简述|稀有度]：剧情中习得新技能；稀有度只写 普通/罕见/稀有/史诗/神话 之一，按这门技能在剧情中的分量写，可省略
- [igs-combat:upgrade|角色|技能名|简述]：已有技能得到精进
- [igs-combat:inscribe|角色|牌名|刻印名|原因]：剧情让角色已有的某个招式留下永久的印记时写；牌名写该角色卡组里已有的招式名；刻印名只写 ${Object.values(INSCRIPTION_LABELS).join('/')} 之一；每个招式只能刻一次，不可移除，平常剧情不写
- [igs-combat:class|角色|职业]：转职或觉醒
- [igs-combat:unequip|角色|名称]：剧情中卸下某件装备，装备仍归此人所有；被夺走、损毁或交出时改写失去标签${includeGain ? `
${COMBAT_GAIN_LINE}
${COMBAT_LOSE_LINE}` : ''}
- [igs-combat:rel|角色|档]：每层给本层登场的非主角各写一个，主角不写；档只写 远逊/稍弱/相当/稍强/强敌/碾压 之一，表示此人此刻相对主角的强弱；强弱没变就照写原档
- [igs-combat:stat|角色|属性|点数|原因]：只在剧情确实让主角锻炼、领悟、服药等而提升某项属性时写，角色只写主角；属性只写 力量/敏捷/体质/智力/感知/魅力 之一；点数 1–2，每层合计不超过2
- [igs-combat:heal|角色|恢复量|原因]：战斗留下的伤势会带到下一场；剧情中角色休息、接受治疗、服药等恢复生命时写；恢复量写点数（如 20）或生命上限的百分比（如 50%）；倒下的同伴要靠它恢复后才能再参战

语法要求：
1. 开战标签之后由前端接管，不要自行写出战斗过程和胜负；战斗结束后会以战报的形式发回，届时再按战报续写
2. 不写伤害数字或血量，不使用 [igs-fx:battle] 与 [igs-fx:hit]
3. 成长标签只在剧情确实发生时写，主角写「我」以外的名字时用角色名`;
}

// 按标签类型从规则段里摘出对应的行。
function ruleLinesOf(kinds) {
    return buildRuleText().split('\n').filter((line) => kinds.some((kind) => line.startsWith(`- [igs-combat:${kind}|`)));
}

export const COMBAT_RULE_HEAD = buildRuleText().split('\n')[0];
export const COMBAT_STORY_LINES = Object.freeze(ruleLinesOf(['start', 'awaken', 'lines', 'exp', 'learn', 'upgrade', 'inscribe', 'class']));
export const COMBAT_GEAR_LINES = Object.freeze(ruleLinesOf(['unequip']));
export const COMBAT_GROWTH_LINES = Object.freeze(ruleLinesOf(['rel', 'stat', 'heal']));
export const COMBAT_SYNTAX_LINES = Object.freeze(buildRuleText().split('\n').filter((line) => /^\d\. /.test(line)));
export const COMBAT_MERGED_GRAMMAR_INDEX = '战斗 igs-combat:unequip igs-fx:item获得/失去';

// 合并模式：剧情类标签并入别处，这里只剩装备与道具。
export function combatPromptMerged(settings) {
    return asObject(settings).combatMerged === true;
}

export const COMBAT_RULE_PROMPT_MAX = 8000;
const FREQUENCY_LINES = Object.freeze({
    low: '战斗频率：只在冲突无法回避时才写开战标签，平常的摩擦用剧情解决。',
    high: '战斗频率：剧情中出现敌意、挑衅、拦路、切磋或危险时，积极安排交战，可以主动引出遭遇。',
});
const COOLDOWN_TAG_LINE = /^\s*(?:[-*•]\s*)?\[igs-combat[:：]\s*(?:start|awaken|lines)\b/i;
const COOLDOWN_TAG_MENTION = /\[igs-combat[:：]\s*(?:start|awaken|lines)\b/i;
const COOLDOWN_BLOCKED_TAGS = ['start', 'awaken', 'lines'];

// 设置页展示与归一化比较用：当前设置下不自定义时实际生效的规则全文。
export function defaultCombatRuleText(settings) {
    return buildRuleText(combatGainInCombatBlock(settings));
}
export function isDefaultCombatRuleText(text) {
    const value = String(text ?? '').trim();
    return value === buildRuleText(false).trim() || value === buildRuleText(true).trim();
}

export function combatFrequencyOf(settings) {
    const value = asObject(asObject(settings).combatExpansion).frequency;
    return COMBAT_FREQUENCIES.includes(value) ? value : 'normal';
}
export function combatCooldownFloorsOf(settings) {
    const value = Math.floor(Number(asObject(asObject(settings).combatExpansion).cooldownFloors));
    return Number.isFinite(value) && value > 0 ? value : 0;
}

// 从聊天末尾往前最多扫 window 层，找最近一层含开战标签的非用户楼；返回它与下一层的楼数距离，window 内没有返回 null。
export function floorsSinceCombatStart(messages, window, hasStart) {
    const list = Array.isArray(messages) ? messages : [];
    const stop = Math.max(0, list.length - Math.max(0, Math.floor(Number(window)) || 0));
    for (let index = list.length - 1; index >= stop; index -= 1) {
        const message = list[index];
        if (message && message.is_user !== true && hasStart(message, index)) return list.length - index;
    }
    return null;
}
export function combatOnCooldown(distance, cooldownFloors) {
    return Number.isFinite(distance) && cooldownFloors > 0 && distance < cooldownFloors;
}

// 在规则文本后追加战斗频率行或冷却提示；冷却内去掉以 [igs-combat:start / awaken 开头的行。
// 去行后文本里仍有这两个标签的写法（自由格式，去行不可靠）时保留原文，只追加「本层不安排开战」。
// 两者模式下挑战可开且战斗没有冷却时，再追加同层只写一个对决的提示。
export function applyCombatRuleModifiers(text, settings) {
    const source = String(text ?? '');
    const cooldown = combatCooldownFloorsOf(settings);
    if (combatOnCooldown(asObject(settings).combatSinceStart, cooldown)) {
        const stripped = source.split('\n').filter((line) => !COOLDOWN_TAG_LINE.test(line)).join('\n');
        return `${COOLDOWN_TAG_MENTION.test(stripped) ? source : stripped}\n距离上一场战斗不足${cooldown}楼，本层不安排开战。`;
    }
    const bothOpen = combatKindOf(settings) === 'both' && asObject(settings).challengeOpen === true;
    return [source, FREQUENCY_LINES[combatFrequencyOf(settings)], bothOpen ? ONLY_ONE_DUEL_LINE : ''].filter(Boolean).join('\n');
}

// 战斗规则段正文；战斗未开启返回空串。
// 自定义文本（combatExpansion.rulePrompt）只替换非合并模式的规则文本；战斗频率行与冷却提示照常追加在其后。
// settings.combatSinceStart 由调用方按聊天算出（楼数距离），用于冷却内去掉开战与觉醒行。
export function resolveCombatPromptRule(settings) {
    if (!combatGrammarEnabled(settings)) return '';
    const gainHere = combatGainInCombatBlock(settings);
    if (!combatPromptMerged(settings)) {
        const custom = asObject(asObject(settings).combatExpansion).rulePrompt;
        return applyCombatRuleModifiers(typeof custom === 'string' && custom.trim() ? custom : buildRuleText(gainHere), settings);
    }
    return [
        '【战斗·装备与道具】标签写作 [igs-combat:类型|参数]：',
        ...COMBAT_GEAR_LINES,
        ...(gainHere ? [COMBAT_GAIN_LINE, COMBAT_LOSE_LINE] : []),
        '',
        '语法要求：装备与道具标签只在剧情确实发生时写，主角写「我」以外的名字时用角色名',
    ].join('\n');
}

const NARRATION_HEAD = '【战斗续写】上一条用户消息中的 <igs-combat-report> 是刚刚结束的战斗记录。按其中的回合进程，用小说笔法完整写出这场战斗：技能名可以作为招式名出现；不得出现卡牌、手牌、费用、能量、抽牌、稀有度或具体的血量数值；不得改变胜负与击倒的先后顺序；本层不写任何 [igs-combat:…] 标签（开战、觉醒、exp、loot、learn、upgrade、class、rel、stat、heal 等一律不写）：这场战斗的历练与收获已由战报结算，战后的伤势会带到之后的剧情，续写只负责叙述。战报里有「战利品：」一行时，在结尾把这件收获自然写进剧情：新招式写领悟、装备写得到或缴获、道具写拾得、零碎小物写顺手捡到、刻印写招式上留下了新的印记。';
const NARRATION_BY_RESULT = Object.freeze({
    win: '结局是胜利：写到最后一个敌人倒下，结尾自然过渡到战后。',
    lose: '结局是战败：主角一方力竭倒下。照战报写出落败的经过，再按剧情写出战败带来的后果（被俘、被救、负伤撤离等），不要扭转为胜利。',
    escape: '结局是撤退：写主角一方脱离战斗的经过，敌人仍在，结尾交代撤离后的处境。',
});
// 重新生成类的生成方式：最后一条是 AI 楼时，往前一条找战报。
const REGENERATE_TYPES = new Set(['swipe', 'regenerate']);
const INPUT_TYPES = new Set(['normal']);

// 从文本里取战报结果，没有战报返回 null。
export function combatReportResult(text) {
    const match = String(text || '').match(REPORT_TAG);
    return match ? { result: match[1].toLowerCase() } : null;
}

// 找「待续写」的战报：本次输入里的，或最后一条用户楼里的。
export function findPendingCombatReport(messages, { generationType = null, inputText = '' } = {}) {
    if (INPUT_TYPES.has(generationType ?? 'normal') && String(inputText || '').trim()) return combatReportResult(inputText);
    const list = Array.isArray(messages) ? messages : [];
    const last = (REGENERATE_TYPES.has(generationType) && list.length && !list.at(-1)?.user ? list.slice(0, -1) : list).at(-1);
    return !last || !last.user ? null : combatReportResult(last.text);
}

export function resolveCombatNarrationSegment(settings, messages, options = {}) {
    if (!combatGrammarEnabled(settings)) return null;
    const report = findPendingCombatReport(messages, options);
    return report
        ? { id: COMBAT_NARRATION_SEGMENT_ID, position: 'depth0', depth: 0, content: `${NARRATION_HEAD}\n${NARRATION_BY_RESULT[report.result]}`, keys: ['combat-narration'], result: report.result }
        : null;
}

const squash = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

// 单个角色一行：等级、生命或倒下、能力值。
function partyLine(member) {
    const state = member.down
        ? `倒下（生命 0/${member.maxHp}），${member.hero ? '再遇战斗只剩 1 点生命' : '回血前不能参战'}`
        : `生命 ${member.hp}/${member.maxHp}（${squash(member.injury)}）`;
    const abilities = (Array.isArray(member.abilities) ? member.abilities : []).map(([label, value]) => `${squash(label)}${value}`).join(' ');
    return `- ${squash(member.name)} Lv${member.level} ${state}${abilities ? `；${abilities}` : ''}`;
}

export function combatPartyLines(members) {
    return (Array.isArray(members) ? members : []).filter(Boolean).map(partyLine);
}

export function resolveCombatPartySegment(settings, members) {
    if (!combatGrammarEnabled(settings) || !Array.isArray(members) || !members.length) return null;
    const content = [
        '【主角团状态】主角与最近一场并肩作战的同伴此刻的状态，战斗留下的伤势会带到下一场。正文对伤势与体力的描写与此一致，不写具体数值：',
        ...members.map(partyLine),
        '剧情中有人休息、接受治疗、服药等恢复生命时写 [igs-combat:heal|角色|恢复量|原因]，恢复量写点数（如 20）或生命上限的百分比（如 50%）；没有恢复就不写。',
    ].join('\n');
    return { id: COMBAT_PARTY_SEGMENT_ID, position: 'depth0', depth: 0, content, keys: ['combat-party'] };
}
