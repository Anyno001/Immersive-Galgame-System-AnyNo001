import { normalizeDanmakuSettings, resolveAudiencePersona } from './danmaku-settings.js';

// 内心弹幕是纯本地演出，不向 AI 注入任何规则；直播间与观众弹幕各一块。
const LIVE_GRAMMAR_LINES = Object.freeze([
    'live|主播名|直播间标题|视角 … live-end：包住整段直播；视角写 观看（{{user}}在看别人直播，默认）或 主播（主播本人看到的后台）；{{user}}自己开播时主播名写{{user}}、视角写 主播，下播写 live-end',
    'dm|观众名|弹幕内容：一条直播弹幕，观众名你自己取（像弹幕网站的网名、口语化、每条尽量不重复，别用现实真名），弹幕内容你自己写，放在它出现时机的正文之前，可连续多行；主播说的话照常用[igs-char]',
    'dm|观众名|内容|类型|附加：特殊弹幕，类型写 醒目留言（附加写金额如30/100/1000）、礼物（内容写礼物名，附加写数量）、上舰（附加写 舰长/提督/总督）、进场（内容留空）、房管',
]);
const LIVE_INTRO = '，人气与点赞由前端自动生成；弹幕的观众名和内容都由你写（既写与剧情相关或有梗的关键弹幕，也写几条凑热闹的路人闲聊，前端会把它们和自带的路人弹幕混在一起播），每层 dm 不超过12条；弹幕要引用本层台词和情节里的具体词（人物的话、动作、道具、事件），别泛泛喊称呼、套情境；不在直播时不用 dm';

function audienceLine(audience) {
    return `danmaku|弹幕1/弹幕2|样式：屏幕外观众（${resolveAudiencePersona(audience)}）的吐槽，角色看不到，正文绝不提及观众或弹幕；放在被吐槽的正文之前，/ 分隔多条、每条不超过15字，样式可省或写 top（前方高能、名场面预警）/flood（刷屏）/color（彩色）；只在名场面、反转、心动、尴尬等时刻用，每层不超过3个`;
}

// 按需注入的语法块：直播间按需展开（出现直播相关词或标签时），观众弹幕常驻。
export function danmakuGrammarBlocks(readerSettings, fxBlock) {
    const s = normalizeDanmakuSettings(readerSettings);
    const blocks = [];
    if (s.live.enabled) {
        blocks.push({ key: 'live', adaptive: true, full: fxBlock('直播间', LIVE_GRAMMAR_LINES, LIVE_INTRO), index: '直播 igs-fx:live/live-end/dm' });
    }
    if (s.audience.enabled) {
        blocks.push({ key: 'audience', full: fxBlock('观众弹幕', [audienceLine(s.audience)]), index: '观众弹幕 igs-fx:danmaku' });
    }
    return blocks;
}

// 详细约束版（演出提示词选「详细」时用，每轮都发）：完整方括号写法 + 约束 + 示例。
export function liveDetailedBlock(readerSettings) {
    const s = normalizeDanmakuSettings(readerSettings);
    if (!s.live.enabled) return '';
    const lines = LIVE_GRAMMAR_LINES.map((line, i) => `${i + 1}. [igs-fx:${line.replace(' … ', '] … [igs-fx:').replace('：', ']：')}`);
    return `【直播间】角色开直播、或{{user}}在手机上看角色直播时，用以下标签写这一段，完整写法照抄方括号格式：
${lines.join('\n')}
使用约束：
1. live 写在直播开始的正文之前，直播结束、离开直播间或收起手机时写 live-end
2. ${LIVE_INTRO.slice(1)}
3. 剧情里有人开播、看直播时就主动用，不必等用户要求
示例：
[igs-fx:live|林小雨|深夜学习陪伴|观看]
[igs-char:林小雨|开心|睡衣|这道题我算了三遍还是不对，先把草稿纸翻一页。]
[igs-fx:dm|夜猫子|草稿纸都翻第三页了，这题有毒]
[igs-fx:dm|学霸本霸|第二步符号抄错了吧|醒目留言|30]
[igs-fx:live-end]`;
}

// 关闭按需注入时的旧行为：完整规则整段拼接。
// live / audience：演出提示词入口传入——false 不发该段，非空字符串替换该段。
export function resolveDanmakuPromptRule(readerSettings, { live = null, audience = null } = {}) {
    const s = normalizeDanmakuSettings(readerSettings);
    const pick = (override, builtin) => (override === false ? '' : (typeof override === 'string' && override.trim()) || builtin());
    const rules = [];
    if (s.live.enabled) {
        rules.push(pick(live, () => `【直播间】角色开直播、或{{user}}在手机上看角色直播时使用${LIVE_INTRO}：\n${LIVE_GRAMMAR_LINES.map((line, i) => `${i + 1}. [igs-fx:${line.replace(' … ', '] … [igs-fx:').replace('：', ']：')}`).join('\n')}`));
    }
    if (s.audience.enabled) {
        rules.push(pick(audience, () => `【观众弹幕】想象这段故事正被屏幕外的观众观看，写他们的弹幕时使用：\n[igs-fx:${audienceLine(s.audience).replace('：', ']：')}`));
    }
    return rules.filter(Boolean).join('\n\n');
}
