import { checkbox, field, segmentedInput, textInput } from './settings-fields.js';
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

// 弹幕三件套的设置片段，由「演出」页编进「题材专属」分组。
export function renderDanmakuFields(reader, more = collapsible) {
    const s = normalizeDanmakuSettings(reader);
    const p = 'readerSettings';
    const live = featureRow(more, 'live-fx', `${p}.liveFx.enabled`, s.live.enabled, '直播间', '', field(`${p}.liveFx.layout`, '形态', segmentedInput(`${p}.liveFx.layout`, s.live.layout, [['phone', '手机'], ['full', '全屏']], '直播间形态'))
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
