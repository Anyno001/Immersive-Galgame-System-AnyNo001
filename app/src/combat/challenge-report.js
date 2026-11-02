// 日常挑战战报：只写结局词与相对描述，不含数值；过程句由结局与剩余意志挑模板拼，不由 AI 写。
import { reportIdFor } from './report.js';
import { challengeOutcomeOf } from './challenge-setup.js';
import { challengeHarvest } from './challenge-foes.js';

export const CHALLENGE_OUTCOMES = Object.freeze(['圆满', '勉强', '失败', '放弃']);
export const CHALLENGE_REPORT_DETAIL = Object.freeze({ brief: 'brief', normal: 'normal' });
export const CHALLENGE_SKIP_TEXT = '（本次挑战不使用卡牌结算，请直接用文字描写这次挑战的经过与结果。）';

const RESULT_OF = Object.freeze({ 圆满: 'win', 勉强: 'win', 失败: 'lose', 放弃: 'escape' });
const OUTCOME_WORDS = Object.freeze({ 圆满: '圆满完成', 勉强: '勉强通过', 失败: '没有成功', 放弃: '中途放弃' });
const STAKE_COST_TEXT = Object.freeze({
    失败: Object.freeze({ 压力: '压力明显上升', 体力: '体力消耗很大', 金钱: '钱财损失不小', 关系: '两人之间多了一道裂痕' }),
    放弃: Object.freeze({ 压力: '压力略有上升', 体力: '体力略有消耗', 金钱: '钱财略有损失', 关系: '两人之间略有隔阂' }),
});
const WIN_RELIEF_TEXT = '压力有所缓解';
const PRIZE_TEXT = '还拿到了一笔奖金';
const NAME_LIST_SEPARATOR = '、';
const REPORT_OPEN = /<igs-challenge-report\s+([^>]*)>/;
const REPORT_ID_PATTERN = /^r[0-9a-z]{1,13}$/;

// 去掉会破坏标记结构的字符。
const sanitize = (value) => String(value ?? '').replace(/["<>\[\]|\n]/g, '').trim();

function processSentences(outcome, willRatio, byLimit) {
    if (outcome === '放弃') return ['中途选择了退出', '这件事就此搁下'];
    const first = willRatio >= 0.6 ? '全程应对从容' : willRatio >= 0.3 ? '中途几次被逼得手忙脚乱' : '多次被逼到极限';
    if (byLimit) return [first, outcome === '勉强' ? '时限将至，总算勉强过关' : '时限已到，事情没有着落'];
    return [first, { 圆满: '最终稳稳拿下了局面', 勉强: '最后靠平时的积累稳住了局面', 失败: '最终没能撑到最后' }[outcome]];
}

function costSentence(outcome, stake, prize) {
    if (outcome === '圆满' || outcome === '勉强') return prize ? `${WIN_RELIEF_TEXT}，${PRIZE_TEXT}` : WIN_RELIEF_TEXT;
    return STAKE_COST_TEXT[outcome]?.[stake] || STAKE_COST_TEXT[outcome]?.压力 || '';
}

// outcome 为 CHALLENGE_OUTCOMES 之一，也可以只给引擎 result 与 willRatio 由此处换算；willRatio 为剩余意志比例，byLimit 表示回合上限到时按进展判定。
export function buildChallengeReport({ combatId, event = '', result, outcome, willRatio = 0, byLimit = false, tier = '普通', costTier = tier, stake = '压力', domain = '', detail = 'normal', foe = '', counterpart = '', allies = [] } = {}) {
    const word = outcome || (result ? challengeOutcomeOf(result, willRatio, { byLimit }) : null);
    if (!combatId || !Object.hasOwn(RESULT_OF, word)) return { ok: false, reason: 'challenge-report-invalid' };
    const reportId = reportIdFor(combatId);
    const helpers = (Array.isArray(allies) ? allies : []).map(sanitize).filter(Boolean);
    const parts = [`挑战：${sanitize(event) || '这次挑战'}`, `结果：${OUTCOME_WORDS[word]}`];
    if (detail !== CHALLENGE_REPORT_DETAIL.brief) {
        if (helpers.length) parts.push(`${helpers.join(NAME_LIST_SEPARATOR)}在一旁相助`);
        parts.push(...processSentences(word, Number(willRatio) || 0, byLimit === true), costSentence(word, stake, challengeHarvest(foe, word, costTier).prize));
    }
    const head = `<igs-challenge-report id="${reportId}" result="${RESULT_OF[word]}" outcome="${word}" tier="${sanitize(tier)}" cost="${sanitize(costTier)}" stake="${sanitize(stake)}" domain="${sanitize(domain)}" foe="${sanitize(foe)}" counterpart="${sanitize(counterpart)}" allies="${helpers.join(NAME_LIST_SEPARATOR)}">`;
    return { ok: true, text: `${head}\n（${parts.filter(Boolean).join('。')}。）\n</igs-challenge-report>`, result: RESULT_OF[word], reportId };
}

export function parseChallengeReport(text) {
    const match = REPORT_OPEN.exec(String(text || ''));
    if (!match) return null;
    const attrs = Object.fromEntries([...match[1].matchAll(/([a-z]+)="([^"]*)"/g)].map((pair) => [pair[1], pair[2]]));
    if (!REPORT_ID_PATTERN.test(attrs.id || '') || !CHALLENGE_OUTCOMES.includes(attrs.outcome)) return null;
    return { reportId: attrs.id, result: RESULT_OF[attrs.outcome], outcome: attrs.outcome, tier: attrs.tier || '普通', costTier: attrs.cost || attrs.tier || '普通', stake: attrs.stake || '压力', domain: attrs.domain || '', foe: attrs.foe || '', counterpart: attrs.counterpart || '', allies: (attrs.allies || '').split(NAME_LIST_SEPARATOR).filter(Boolean) };
}

// 数值侧读到战报楼后合成的 challenge 指令；floor 为战报所在楼层号。
export function challengeDirectiveOf(report, floor = null) {
    return report ? {
        kind: 'challenge', reportId: report.reportId, outcome: report.outcome, tier: report.costTier, stake: report.stake, domain: report.domain, floor,
        counterpart: report.counterpart || '', prize: challengeHarvest(report.foe, report.outcome, report.costTier).prize,
    } : null;
}
