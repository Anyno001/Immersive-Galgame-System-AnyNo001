import { esc } from './reader-value-utils.js';
import { collapsible, renderFxFeatureFields } from './fx-settings-fields.js';
import { renderStageDirectionFields } from './stage-direction-fields.js';
import { renderRomanceFxFields } from './romance-fields.js';
import { renderDanmakuFields } from './danmaku-settings-fields.js';
import { renderMetaFxFields } from './meta-fields.js';
import { PERFORMANCE_FEATURES, PERFORMANCE_PRESETS, detectPerformancePreset, isPerformanceFeatureOn } from './performance-presets.js';
import { renderQualityRow } from './render-quality-fields.js';

export const PERFORMANCE_GROUPS = Object.freeze([
    Object.freeze(['text', '文字']),
    Object.freeze(['stage', '画面与镜头']),
    Object.freeze(['character', '立绘']),
    Object.freeze(['emotion', '情绪反应']),
    Object.freeze(['story', '剧情提示']),
    Object.freeze(['event', '事件演出']),
    Object.freeze(['romance', '亲密']),
    Object.freeze(['sound', '声音']),
]);

// 首页与「阅读器 › 演出」共用同一档位条和 perf-preset 动作；extraRows 供其他档位（如画质档）挂在同一卡片里。
export function renderPerformancePresetBar(reader, { home = false, extraRows = '' } = {}) {
    const current = detectPerformancePreset(reader && typeof reader === 'object' ? reader : {});
    const buttons = PERFORMANCE_PRESETS.map(([id, label]) => (
        `<button type="button" class="igs-perf-preset${current === id ? ' is-active' : ''}" data-action="perf-preset:${id}" aria-pressed="${current === id ? 'true' : 'false'}">${esc(label)}</button>`
    )).join('');
    const custom = '当前为自定义组合；点任一档位会覆盖各演出的开关，细项设置保留。';
    const note = home
        ? `${current ? '' : custom}细项前往「阅读器 › 演出」调整。`
        : (current ? '' : custom);
    const title = home ? '演出档位' : '一键档位';
    return `<div class="igs-source-filter igs-perf-presets"><div class="igs-source-filter-title">${title}</div><div class="igs-perf-preset-row">${buttons}</div>${extraRows}${note ? `<div class="igs-source-filter-note">${esc(note)}</div>` : ''}</div>`;
}

// 「全部关闭」时默认开着的演出音效单独无效果，摘要里一并按关闭显示，和档位高亮一致。
function groupSummary(reader, groupId, allOff) {
    const features = PERFORMANCE_FEATURES.filter((feature) => feature.group === groupId);
    const on = allOff ? [] : features.filter((feature) => isPerformanceFeatureOn(reader, feature.key));
    const brief = on.length ? on.map((feature) => feature.label).join('、') : '未开启';
    return `<span class="igs-perf-count${on.length ? ' is-on' : ''}">${on.length}/${features.length}</span><span class="igs-perf-brief">${esc(brief)}</span>`;
}

function groupCard(id, title, summaryHtml, body, open) {
    return `<div class="igs-source-filter igs-perf-group"><details data-advanced="perf-group-${id}"${open ? ' open' : ''}><summary><b>${esc(title)}</b>${summaryHtml}</summary><div class="igs-perf-group-body">${body}</div></details></div>`;
}

// extras 为阅读器宿主渲染的旧演出片段：[开关, 细项] 二元组的细项收进折叠区。
export function renderPerformanceSettings(reader, extras = {}, isOpen = () => false) {
    const src = reader && typeof reader === 'object' ? reader : {};
    const more = (key, label, body) => collapsible(key, label, body, isOpen(`perf-${key}`));
    const pair = (key, label, value) => {
        const [toggle, detail] = Array.isArray(value) ? value : [value || '', ''];
        return toggle + (detail ? `<div class="igs-settings-sub">${more(key, label, detail)}</div>` : '');
    };
    const current = detectPerformancePreset(src);
    const fx = renderFxFeatureFields(src, more);
    const stage = renderStageDirectionFields(src, more);
    const danmaku = renderDanmakuFields(src, more);
    const bodies = {
        text: [extras.typewriter, stage.clickWaitMark, stage.textFx, extras.sentencePaging],
        stage: [stage.transition, stage.tint, stage.camera, pair('weather', '强度与室内外地点词', extras.weatherFx), pair('stage-shake', '强度与触发情绪', extras.stageShake)],
        character: [stage.motion, stage.actions, stage.cast, extras.narrationFilter],
        emotion: [fx.manga, fx.heartbeat, fx.flash, danmaku.inner],
        story: [fx.title, fx.favor, fx.itemFx, fx.resultFx],
        event: [fx.tags, stage.daily, fx.battleFx, pair('chat-show', '线上交流详细设置', extras.chatShow), danmaku.live, danmaku.audience],
        romance: [renderRomanceFxFields(src, more), extras.nsfw || ''],
        sound: [stage.master, fx.sound, stage.ambient, stage.ui, stage.bgm],
    };
    const groups = PERFORMANCE_GROUPS.map(([id, title]) => groupCard(id, title, groupSummary(src, id, current === 'off'), bodies[id].filter(Boolean).join(''), isOpen(`perf-group-${id}`)));
    const metaOn = Boolean(src.metaFx && src.metaFx.enabled === true);
    const meta = groupCard('meta', 'Meta 互动', `<span class="igs-perf-count${metaOn ? ' is-on' : ''}">${metaOn ? '开' : '关'}</span><span class="igs-perf-brief">TA在注视着你</span>`, renderMetaFxFields(src, more), isOpen('perf-group-meta'));
    const rhythm = groupCard('rhythm', '节奏', '<span class="igs-perf-brief">演出风格、停留时间与重播</span>', fx.style, isOpen('perf-group-rhythm'));
    return renderPerformancePresetBar(src, { extraRows: (extras.worldview || '') + renderQualityRow(src) }) + groups.join('') + meta + rhythm;
}
