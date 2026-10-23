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

export const COMBAT_GRAMMAR_INDEX = '战斗 igs-combat:start/exp/learn/upgrade/class';

export function resolveCombatPromptRule(readerSettings) {
    if (!combatExpansionEnabled(readerSettings)) return '';
    return `【战斗】战斗由前端卡牌系统结算，正文只负责引出遭遇和记录成长，标签写作 [igs-combat:类型|参数]：
- [igs-combat:start|遭遇名|敌方|友方|等级]：剧情真正进入交战的那一刻写在本层正文的最后一行，写完立即结束本层，不再写任何正文；敌方写 名称 或 名称*数量，逗号分隔，合计最多5个；友方写同行参战的角色名，逗号分隔，最多3人，主角不用写；等级只写 普通/精英/首领，可省略；每层最多一个
- [igs-combat:exp|角色|数值|原因]：剧情中获得历练时写，每层每个角色合计不超过50
- [igs-combat:learn|角色|技能名|简述]：剧情中习得新技能
- [igs-combat:upgrade|角色|技能名|简述]：已有技能得到精进
- [igs-combat:class|角色|职业]：转职或觉醒

语法要求：
1. 开战标签之后由前端接管，不要自行写出战斗过程和胜负；战斗结束后会以战报的形式发回，届时再按战报续写
2. 不写伤害数字或血量，不使用 [igs-fx:battle] 与 [igs-fx:hit]
3. 成长标签只在剧情确实发生时写，主角写「我」以外的名字时用角色名`;
}

const NARRATION_COMMON = `【战斗续写】上一条用户消息中的 <igs-combat-report> 是刚刚结束的战斗记录。按其中的回合进程，用小说笔法完整写出这场战斗：技能名可以作为招式名出现；不得出现卡牌、手牌、费用、能量、抽牌或具体的血量数值；不得改变胜负与击倒的先后顺序；本层不写开战标签，也不重复写战报里的 exp 标签。`;

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
