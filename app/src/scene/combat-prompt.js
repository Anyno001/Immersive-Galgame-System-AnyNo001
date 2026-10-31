// 战斗扩展的主模型提示词：开战 / 成长标签写法（替代旧 battle 演出块），以及战报待续写时的 combat-narration 段。
// 只读设置与聊天历史，不写宿主；是否开启以 readerSettings.combatExpansion.enabled 为准，关闭时一律不产出。
export const COMBAT_BLOCK_KEY = 'combat';
export const COMBAT_NARRATION_SEGMENT_ID = 'igs-combat-narration';
export const COMBAT_REPORT_RESULTS = Object.freeze(['win', 'lose', 'escape']);

const REPORT_RE = /<igs-combat-report\b[^>]*\bresult\s*=\s*"(win|lose|escape)"[^>]*>/i;

const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function combatExpansionEnabled(readerSettings) {
    return plain(plain(readerSettings).combatExpansion).enabled === true;
}

export const COMBAT_GRAMMAR_INDEX = '战斗 igs-combat:start/awaken/exp/learn/upgrade/class/unequip/rel/stat/heal';

// 战斗开启时的统一获得物写法（合并计划 N5 / P7d）：装备、道具、杂物都写这一条，程序记入统一背包。
// 物品演出开着时由【物品】块给出（fx-prompt 的战斗写法），关着时放进战斗块，二者不重复。
export const COMBAT_GAIN_LINE = '- [igs-fx:item|获得|名称|描述|类别|稀有度]：剧情中主角真的得到一件具体物品时写；类别只写 武器/防具/饰品/宝物/道具/杂物 之一（武器、防具、饰品、宝物是可装备的装备，道具是能在战斗中用一次的药剂、符咒、暗器等，其余写杂物）；稀有度只写 普通/罕见/稀有/史诗/神话 之一，按物品品相写，可省略；对应部位空着时新装备会自动装上';

export function itemFxPromptEnabled(readerSettings) {
    return plain(plain(readerSettings).itemFx).enabled === true;
}

export function combatGainInCombatBlock(readerSettings) {
    return combatExpansionEnabled(readerSettings) && !itemFxPromptEnabled(readerSettings);
}

function fullCombatRule(gain = false) {
    return `【战斗】战斗由前端卡牌系统结算，正文只负责引出遭遇和记录成长，标签写作 [igs-combat:类型|参数]：
- [igs-combat:start|遭遇名|敌方|友方|等级]：剧情真正进入交战的那一刻写在本层正文的最后一行，写完立即结束本层，不再写任何正文；敌方写 名称 或 名称*数量，逗号分隔，合计最多5个；友方写同行参战的角色名，逗号分隔，最多3人，主角不用写；等级只写 普通/精英/首领，可省略；每层最多一个
- [igs-combat:awaken|角色|类型|台词]：只在重大情绪节点写（同伴在眼前倒下、立誓守护、绝境不退、宿敌当前等），平常战斗不写；必须紧挨在开战标签的上一行，开战标签仍是最后一行；角色写主角（「我」或主角名）；类型只写 怒火/守护/悲恸/决意/羁绊/极限/复仇/不屈 之一；台词是此刻喊出的一句话，不超过30字；每场最多一个
- [igs-combat:exp|角色|数值|原因]：剧情中获得历练时写，每层每个角色合计不超过50
- [igs-combat:learn|角色|技能名|简述|稀有度]：剧情中习得新技能；稀有度只写 普通/罕见/稀有/史诗/神话 之一，按这门技能在剧情中的分量写，可省略
- [igs-combat:upgrade|角色|技能名|简述]：已有技能得到精进
- [igs-combat:class|角色|职业]：转职或觉醒
- [igs-combat:unequip|角色|名称]：剧情中卸下、丢失或交出某件装备${gain ? `\n${COMBAT_GAIN_LINE}` : ''}
- [igs-combat:rel|角色|档]：每层给本层登场的非主角各写一个，主角不写；档只写 远逊/稍弱/相当/稍强/强敌/碾压 之一，表示此人此刻相对主角的强弱；强弱没变就照写原档
- [igs-combat:stat|角色|属性|点数|原因]：只在剧情确实让主角锻炼、领悟、服药等而提升某项属性时写，角色只写主角；属性只写 力量/敏捷/体质/智力/感知/魅力 之一；点数 1–2，每层合计不超过2
- [igs-combat:heal|角色|恢复量|原因]：战斗留下的伤势会带到下一场；剧情中角色休息、接受治疗、服药等恢复生命时写；恢复量写点数（如 20）或生命上限的百分比（如 50%）；倒下的同伴要靠它恢复后才能再参战

语法要求：
1. 开战标签之后由前端接管，不要自行写出战斗过程和胜负；战斗结束后会以战报的形式发回，届时再按战报续写
2. 不写伤害数字或血量，不使用 [igs-fx:battle] 与 [igs-fx:hit]
3. 成长标签只在剧情确实发生时写，主角写「我」以外的名字时用角色名`;
}

// 完整规则按标签类型拆行，供「数值与战斗」合并段复用；未合并时 combat 块仍输出完整原文。
const ruleLines = (kinds) => fullCombatRule().split('\n').filter((line) => kinds.some((k) => line.startsWith(`- [igs-combat:${k}|`)));
export const COMBAT_RULE_HEAD = fullCombatRule().split('\n')[0];
export const COMBAT_STORY_LINES = Object.freeze(ruleLines(['start', 'awaken', 'exp', 'learn', 'upgrade', 'class']));
export const COMBAT_GEAR_LINES = Object.freeze(ruleLines(['unequip']));
export const COMBAT_GROWTH_LINES = Object.freeze(ruleLines(['rel', 'stat', 'heal']));
export const COMBAT_SYNTAX_LINES = Object.freeze(fullCombatRule().split('\n').filter((line) => /^\d\. /.test(line)));
export const COMBAT_MERGED_GRAMMAR_INDEX = '战斗 igs-combat:unequip igs-fx:item获得';

// 数值系统本聊天接管注入时（bootstrap 写入 readerSettings.combatMerged），开战、成长与生命标签改由「数值与战斗」段给出，
// system 里的 combat 块只留装备与道具写法。
export function combatPromptMerged(readerSettings) {
    return plain(readerSettings).combatMerged === true;
}

export function resolveCombatPromptRule(readerSettings) {
    if (!combatExpansionEnabled(readerSettings)) return '';
    const gain = combatGainInCombatBlock(readerSettings);
    if (!combatPromptMerged(readerSettings)) return fullCombatRule(gain);
    return [
        '【战斗·装备与道具】标签写作 [igs-combat:类型|参数]：',
        ...COMBAT_GEAR_LINES,
        ...(gain ? [COMBAT_GAIN_LINE] : []),
        '',
        '语法要求：装备与道具标签只在剧情确实发生时写，主角写「我」以外的名字时用角色名',
    ].join('\n');
}


const NARRATION_COMMON = `【战斗续写】上一条用户消息中的 <igs-combat-report> 是刚刚结束的战斗记录。按其中的回合进程，用小说笔法完整写出这场战斗：技能名可以作为招式名出现；不得出现卡牌、手牌、费用、能量、抽牌、稀有度或具体的血量数值；不得改变胜负与击倒的先后顺序；本层不写任何 [igs-combat:…] 标签（开战、觉醒、exp、loot、learn、upgrade、class、rel、stat、heal 等一律不写）：这场战斗的历练与收获已由战报结算，战后的伤势会带到之后的剧情，续写只负责叙述。战报里有「战利品：」一行时，在结尾把这件收获自然写进剧情：新招式写领悟、装备写得到或缴获、道具写拾得、零碎小物写顺手捡到。`;

const NARRATION_BY_RESULT = Object.freeze({
    win: '结局是胜利：写到最后一个敌人倒下，结尾自然过渡到战后。',
    lose: '结局是战败：主角一方力竭倒下。照战报写出落败的经过，再按剧情写出战败带来的后果（被俘、被救、负伤撤离等），不要扭转为胜利。',
    escape: '结局是撤退：写主角一方脱离战斗的经过，敌人仍在，结尾交代撤离后的处境。',
});

const REWRITE_TYPES = new Set(['swipe', 'regenerate']);
const INPUT_TYPES = new Set(['normal']);

// 程序生成的战报块 <igs-combat-report result="win|lose|escape">；没有战报返回 null。
export function combatReportResult(text) {
    const match = String(text || '').match(REPORT_RE);
    return match ? { result: match[1].toLowerCase() } : null;
}
const reportResult = combatReportResult;

// history 为按时间顺序的可见消息 [{ user, text }]。最近一条是用户楼且带战报时返回结果。
// 宿主在 GENERATION_STARTED 之后才把输入框内容写成用户楼，所以普通发送时先看输入框（inputText）；
// swipe / regenerate 时末尾那条 AI 楼正是被重写的续写楼，先去掉再判断。
export function findPendingCombatReport(history, { generationType = null, inputText = '' } = {}) {
    if (INPUT_TYPES.has(generationType ?? 'normal') && String(inputText || '').trim()) return reportResult(inputText);
    const list = Array.isArray(history) ? history : [];
    const tail = REWRITE_TYPES.has(generationType) && list.length && !list.at(-1)?.user ? list.slice(0, -1) : list;
    const last = tail.at(-1);
    if (!last || !last.user) return null;
    return reportResult(last.text);
}

export function resolveCombatNarrationSegment(readerSettings, history, options = {}) {
    if (!combatExpansionEnabled(readerSettings)) return null;
    const pending = findPendingCombatReport(history, options);
    if (!pending) return null;
    return {
        id: COMBAT_NARRATION_SEGMENT_ID,
        position: 'depth0',
        depth: 0,
        content: `${NARRATION_COMMON}\n${NARRATION_BY_RESULT[pending.result]}`,
        keys: ['combat-narration'],
        result: pending.result,
    };
}

// 主角团状态（计划 5.8）：主角与最近一场并肩作战的同伴，每人一行：名字、等级、生命（当前 / 上限与伤势词）、六维；附剧情回血标签写法。
// party 由 combat-services 的成长缓存给出（session.js partyStatus）；扩展关闭或没有可列的人时为 null。
export const COMBAT_PARTY_SEGMENT_ID = 'igs-combat-party';
const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
function partyLine(p) {
    // 倒下：同伴回血前不能参战；主角仍会参战，只剩 1 点生命。
    const life = p.down ? `倒下（生命 0/${p.maxHp}），${p.hero ? '再遇战斗只剩 1 点生命' : '回血前不能参战'}` : `生命 ${p.hp}/${p.maxHp}（${oneLine(p.injury)}）`;
    const abilities = (Array.isArray(p.abilities) ? p.abilities : []).map(([label, value]) => `${oneLine(label)}${value}`).join(' ');
    return `- ${oneLine(p.name)} Lv${p.level} ${life}${abilities ? `；${abilities}` : ''}`;
}
// 主角团每人一行（与 combat-party 段同一写法），供「数值与战斗」合并段的 party 模板使用。
export function combatPartyLines(party) {
    return (Array.isArray(party) ? party : []).filter(Boolean).map(partyLine);
}
export function resolveCombatPartySegment(readerSettings, party) {
    if (!combatExpansionEnabled(readerSettings) || !Array.isArray(party) || !party.length) return null;
    const content = [
        '【主角团状态】主角与最近一场并肩作战的同伴此刻的状态，战斗留下的伤势会带到下一场。正文对伤势与体力的描写与此一致，不写具体数值：',
        ...party.map(partyLine),
        '剧情中有人休息、接受治疗、服药等恢复生命时写 [igs-combat:heal|角色|恢复量|原因]，恢复量写点数（如 20）或生命上限的百分比（如 50%）；没有恢复就不写。',
    ].join('\n');
    return { id: COMBAT_PARTY_SEGMENT_ID, position: 'depth0', depth: 0, content, keys: ['combat-party'] };
}
