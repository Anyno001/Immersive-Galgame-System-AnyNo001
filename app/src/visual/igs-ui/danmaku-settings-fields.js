import { checkbox, field, segmentedInput, textInput } from './settings-fields.js';
import { collapsible, renderWordListField } from './fx-settings-fields.js';
import {
    DANMAKU_PERSONAS,
    DANMAKU_PERSONA_LABELS,
    INNER_DANMAKU_MOODS,
    INNER_DANMAKU_MOOD_LABELS,
    normalizeDanmakuSettings,
} from './danmaku-settings.js';

function sub(body) {
    return `<div class="igs-settings-sub">${body}</div>`;
}

// 弹幕三件套的设置片段，由「演出」页编进对应分组：直播间、观众弹幕进「事件演出」，内心弹幕进「情绪反应」。
export function renderDanmakuFields(reader, more = collapsible) {
    const s = normalizeDanmakuSettings(reader);
    const p = 'readerSettings';
    const live = checkbox(`${p}.liveFx.enabled`, s.live.enabled, '直播间')
        + (s.live.enabled ? sub(checkbox(`${p}.liveFx.muteOnNsfw`, s.live.muteOnNsfw, 'NSFW 场景收起直播间')) : '');
    const aud = s.audience;
    const audience = checkbox(`${p}.audienceFx.enabled`, aud.enabled, '观众弹幕（小剧场）')
        + (aud.enabled ? sub(field(`${p}.audienceFx.persona`, '观众人设', segmentedInput(`${p}.audienceFx.persona`, aud.persona, DANMAKU_PERSONAS.map((key) => [key, DANMAKU_PERSONA_LABELS[key]]), '观众人设'))
            + field(`${p}.audienceFx.entrySize`, '入口大小', segmentedInput(`${p}.audienceFx.entrySize`, aud.entrySize, [['small', '小'], ['medium', '中'], ['large', '大']], '入口大小'))
            + (aud.persona === 'custom' ? field(`${p}.audienceFx.customPersona`, '自定义人设', textInput(`${p}.audienceFx.customPersona`, aud.customPersona, '例：一群沉迷推理的侦探迷，爱猜凶手')) : '')
            + more('audience-fx', '密度、速度与静音', `<div class="igs-source-filter-grid">`
                + field(`${p}.audienceFx.density`, '密度', segmentedInput(`${p}.audienceFx.density`, aud.density, [['sparse', '稀疏'], ['medium', '适中'], ['dense', '满屏']], '密度'))
                + field(`${p}.audienceFx.speed`, '速度', segmentedInput(`${p}.audienceFx.speed`, aud.speed, [['slow', '慢'], ['medium', '中'], ['fast', '快']], '速度'))
                + `</div>`
                + checkbox(`${p}.audienceFx.ambient`, aud.ambient, '本地氛围弹幕')
                + checkbox(`${p}.audienceFx.muteOnNsfw`, aud.muteOnNsfw, 'NSFW 场景静音观众弹幕'))) : '');
    const inner = checkbox(`${p}.innerFx.enabled`, s.inner.enabled, '内心弹幕')
        + (s.inner.enabled ? sub(checkbox(`${p}.innerFx.useThought`, s.inner.useThought, '心声页优先截取心声原文')
            + more('inner-words', '自定义触发情绪', INNER_DANMAKU_MOODS.map((mood) => renderWordListField(`innerFx.${mood}`, INNER_DANMAKU_MOOD_LABELS[mood], s.inner[mood])).join(''))) : '');
    return { live, audience, inner };
}
