import { normalizeDanmakuSettings, resolveAudiencePersona } from './danmaku-settings.js';

// 内心弹幕是纯本地演出，不向 AI 注入任何规则；直播间与观众弹幕各一块。
const LIVE_GRAMMAR_LINES = Object.freeze([
    'live|主播名|直播间标题|视角 … live-end：包住整段直播；视角写 观看（{{user}}在看别人直播，默认）或 主播（主播本人看到的后台）',
    'dm|观众名|弹幕内容：一条直播弹幕，放在它出现时机的正文之前，可连续多行；主播说的话照常用[igs-char]',
    'dm|观众名|内容|类型|附加：特殊弹幕，类型写 醒目留言（附加写金额如30/100/1000）、礼物（内容写礼物名，附加写数量）、上舰（附加写 舰长/提督/总督）、进场（内容留空）、房管',
]);
const LIVE_INTRO = '，路人弹幕、人气与点赞由前端自动生成，只写与剧情相关或有梗的关键弹幕，每层 dm 不超过12条，不在直播时不用 dm';

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

// 关闭按需注入时的旧行为：完整规则整段拼接。
export function resolveDanmakuPromptRule(readerSettings) {
    const s = normalizeDanmakuSettings(readerSettings);
    const rules = [];
    if (s.live.enabled) {
        rules.push(`[igs直播间标签]\n角色开直播、或{{user}}在手机上看角色直播时使用以下标签（属于允许使用的igs标签，每条独立成行，字段不换行、不含 | 或 ]）${LIVE_INTRO}：\n${LIVE_GRAMMAR_LINES.map((line, i) => `${i + 1}. [igs-fx:${line.replace(' … ', '] … [igs-fx:').replace('：', ']：')}`).join('\n')}`);
    }
    if (s.audience.enabled) {
        rules.push(`[igs观众弹幕]\n想象这段故事正被屏幕外的观众观看，用以下标签写他们的弹幕（属于允许使用的igs标签，独立成行，字段不换行、不含 | 或 ]）：\n[igs-fx:${audienceLine(s.audience).replace('：', ']：')}`);
    }
    return rules.join('\n\n');
}
