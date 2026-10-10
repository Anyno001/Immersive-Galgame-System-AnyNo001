import { checkbox, field, segmentedInput, textInput, textareaInput } from './settings-fields.js';
import { LIVE_ROLE_LINES } from './danmaku-pools.js';
import { collapsible, featureRow, perfSubhead, renderWordListField } from './fx-settings-fields.js';
import {
    DANMAKU_PERSONAS,
    DANMAKU_PERSONA_LABELS,
    INNER_DANMAKU_MOODS,
    INNER_DANMAKU_MOOD_LABELS,
    INNER_DANMAKU_STYLES,
    INNER_DANMAKU_STYLE_LABELS,
    normalizeDanmakuSettings,
} from './danmaku-settings.js';

// 自定义路人弹幕的分组：通用、主播回应、各场合、各身份（身份取词池里有的）。
const LIVE_SCENE_LABELS = Object.freeze([
    ['ambient', '通用'], ['host', '主播回应'], ['opening', '开播'], ['chat', '闲聊'], ['emotion', '情感电台'], ['sing', '唱歌才艺'], ['game', '游戏'],
    ['shop', '带货'], ['eat', '吃播'], ['study', '学习陪伴'], ['looks', '颜值换装'], ['outdoor', '户外旅行'], ['late', '深夜'], ['accident', '翻车'], ['ending', '下播'],
]);
const LIVE_ROLE_LABELS = Object.freeze({
    newcomer: '新人', regular: '老粉', fresh: '路人', asker: '提问', hurry: '催更', hater: '黑子', roaster: '吐槽', defender: '护主播',
    patron: '大哥', lurker: '潜水', leaving: '要走的人', pseudo: '伪专家', keeper: '房管', silly: '憨憨', selfish: '自说自话',
});
const LIVE_CUSTOM_GROUPS = Object.freeze([
    ...LIVE_SCENE_LABELS,
    ...Object.keys(LIVE_ROLE_LINES).map((key) => [key, `身份：${LIVE_ROLE_LABELS[key] || key}`]),
]);

// 弹幕三件套的设置片段，由「演出」页编进「题材专属」分组。
export function renderDanmakuFields(reader, more = collapsible, { liveBlocked = false } = {}) {
    const s = normalizeDanmakuSettings(reader);
    const p = 'readerSettings';
    const live = featureRow(more, 'live-fx', `${p}.liveFx.enabled`, s.live.enabled, '直播间', liveBlocked ? '此世界观需开随身手机' : '', field(`${p}.liveFx.layout`, '形态', segmentedInput(`${p}.liveFx.layout`, s.live.layout, [['phone', '手机'], ['full', '全屏']], '直播间形态'))
        + field(`${p}.liveFx.fullText`, '全屏台词', segmentedInput(`${p}.liveFx.fullText`, s.live.fullText, [['subtitle', '字幕'], ['dialog', '对话框']], '全屏直播台词'))
        + field(`${p}.liveFx.narrationPos`, '旁白位置', segmentedInput(`${p}.liveFx.narrationPos`, s.live.narrationPos, [['above', '字幕上方'], ['name', '名牌下方'], ['dialog', '对话框']], '全屏直播旁白位置'))
        + checkbox(`${p}.liveFx.faceGuard`, s.live.faceGuard, '弹幕防挡脸')
        + checkbox(`${p}.liveFx.adminWarn`, s.live.adminWarn, '超管警告演出')
        + checkbox(`${p}.liveFx.emoji`, s.live.emoji, '路人弹幕带表情')
        + field(`${p}.liveFx.fanMedals`, '粉丝牌名', textareaInput(`${p}.liveFx.fanMedals`, Object.entries(s.live.fanMedals).map(([name, medal]) => `${name}=${medal}`).join('\n'), '一行一个：主播=牌名；留空按剧情或自动取名'))
        + collapsible('live-custom-lines', '自定义路人弹幕', LIVE_CUSTOM_GROUPS.map(([key, label]) => field(`${p}.liveFx.customLines.${key}`, label, textareaInput(`${p}.liveFx.customLines.${key}`, (s.live.customLines[key] || []).join('\n'), '一行一条，与内置词合并'))).join(''))
        + field(`${p}.liveFx.chat`, '弹幕', segmentedInput(`${p}.liveFx.chat`, s.live.chat, [['roll', '翻滚'], ['fly', '横飞'], ['both', '同时']], '直播弹幕'))
        + checkbox(`${p}.liveFx.interact`, s.live.interact, '直播互动（发弹幕、打赏）')
        + checkbox(`${p}.liveFx.followTheme`, s.live.followTheme, '跟随对话框主题')
        + checkbox(`${p}.liveFx.muteOnNsfw`, s.live.muteOnNsfw, 'NSFW场景收起直播间'));
    const aud = s.audience;
    const audience = featureRow(more, 'audience-fx', `${p}.audienceFx.enabled`, aud.enabled, '观众弹幕', '小剧场', field(`${p}.audienceFx.persona`, '观众人设', segmentedInput(`${p}.audienceFx.persona`, aud.persona, DANMAKU_PERSONAS.map((key) => [key, DANMAKU_PERSONA_LABELS[key]]), '观众人设'))
        + (aud.persona === 'custom' ? field(`${p}.audienceFx.customPersona`, '自定义人设', textInput(`${p}.audienceFx.customPersona`, aud.customPersona, '例：一群沉迷推理的侦探迷，爱猜凶手')) : '')
        + `<div class="igs-source-filter-grid">`
        + field(`${p}.audienceFx.entrySize`, '入口大小', segmentedInput(`${p}.audienceFx.entrySize`, aud.entrySize, [['small', '小'], ['medium', '中'], ['large', '大']], '入口大小'))
        + field(`${p}.audienceFx.density`, '密度', segmentedInput(`${p}.audienceFx.density`, aud.density, [['sparse', '稀疏'], ['medium', '适中'], ['dense', '满屏']], '密度'))
        + field(`${p}.audienceFx.speed`, '速度', segmentedInput(`${p}.audienceFx.speed`, aud.speed, [['slow', '慢'], ['medium', '中'], ['fast', '快']], '速度'))
        + `</div>`
        + checkbox(`${p}.audienceFx.ambient`, aud.ambient, '本地氛围弹幕')
        + checkbox(`${p}.audienceFx.muteOnNsfw`, aud.muteOnNsfw, 'NSFW场景静音观众弹幕'));
    const inner = featureRow(more, 'inner-fx', `${p}.innerFx.enabled`, s.inner.enabled, '内心弹幕', '角色心声飘字', field(`${p}.innerFx.style`, '样式', segmentedInput(`${p}.innerFx.style`, s.inner.style, INNER_DANMAKU_STYLES.map((key) => [key, INNER_DANMAKU_STYLE_LABELS[key]]), '内心弹幕样式'))
        + checkbox(`${p}.innerFx.useThought`, s.inner.useThought, '心声页优先截取心声原文')
        + perfSubhead('触发情绪')
        + INNER_DANMAKU_MOODS.map((mood) => renderWordListField(`innerFx.${mood}`, INNER_DANMAKU_MOOD_LABELS[mood], s.inner[mood])).join(''));
    return { live, audience, inner };
}
