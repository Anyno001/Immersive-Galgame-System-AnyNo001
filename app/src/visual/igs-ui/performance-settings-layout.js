import { esc } from './reader-value-utils.js';
import { collapsible, perfItem, renderFxFeatureFields } from './fx-settings-fields.js';
import { renderStageDirectionFields } from './stage-direction-fields.js';
import { renderRomanceFxFields } from './romance-fields.js';
import { renderDanmakuFields } from './danmaku-settings-fields.js';
import { renderMetaFxFields } from './meta-fields.js';
import { PERFORMANCE_FEATURES, PERFORMANCE_PRESETS, detectPerformancePreset, isPerformanceFeatureOn } from './performance-presets.js';
import { PROFILE_PATH, hasPerformanceProfile, profileDiff } from './performance-profile.js';
import { renderQualityRow } from './render-quality-fields.js';
import { FX_SETTINGS_NORMALIZERS } from './fx-settings.js';

// 六张卡：组内用小标题分段，不再一类一张卡。节奏与 Meta 互动合成最后一张，单独渲染。
export const PERFORMANCE_GROUPS = Object.freeze([
    Object.freeze(['text', '文字']),
    Object.freeze(['stage', '画面']),
    Object.freeze(['story', '情绪与提示']),
    Object.freeze(['special', '题材专属']),
    Object.freeze(['sound', '声音']),
]);

// 首页与「阅读器 › 演出」共用同一档位条和 perf-preset 动作；extraRows 供其他档位（如画质档）挂在同一卡片里。
export function renderPerformancePresetBar(reader, { home = false, extraRows = '', canUndo = false } = {}) {
    const src = reader && typeof reader === 'object' ? reader : {};
    // 有快速配置时，高亮的是配置记下的档位；手动改过的开关在下面列出差异。
    const profile = hasPerformanceProfile(src) ? src[PROFILE_PATH] : null;
    const diff = profileDiff(src);
    const changed = Boolean(diff && (diff.added.length || diff.removed.length));
    const current = profile ? (changed ? '' : profile.level) : detectPerformancePreset(src);
    const buttons = PERFORMANCE_PRESETS.map(([id, label]) => (
        `<button type="button" class="igs-perf-preset${current === id ? ' is-active' : ''}" data-action="perf-preset:${id}" aria-pressed="${current === id ? 'true' : 'false'}">${esc(label)}</button>`
    )).join('');
    let state = '';
    if (changed) {
        state = [diff.added.length ? `比配置多开了：${diff.added.join('、')}` : '', diff.removed.length ? `关掉了：${diff.removed.join('、')}` : ''].filter(Boolean).join('；') + '。点档位会恢复。';
    } else if (!current) {
        state = '当前为自定义组合；点任一档位会覆盖各演出的开关，细项设置保留。';
    }
    const note = home ? `${state}细项前往「阅读器 › 演出」调整。` : state;
    const undo = canUndo ? '<button type="button" class="igs-settings-action" data-action="perf-preset-undo">撤销档位切换</button>' : '';
    const title = home ? '演出档位' : '一键档位';
    return `<div class="igs-source-filter igs-perf-presets"><div class="igs-source-filter-title">${title}</div><div class="igs-perf-preset-row">${buttons}</div>${undo}${extraRows}${note ? `<div class="igs-source-filter-note">${esc(note)}</div>` : ''}</div>`;
}

// 档位不切换、但也摆在分组里的开关（改 AI 输出格式、实验功能、玩法或非演出设置）：
// 胶囊要按页面上实际能看到的开关数计，否则「0/2」底下却有 4 个开关。没传进来的片段不计。
function extraSwitches(reader, extras) {
    const on = (key) => FX_SETTINGS_NORMALIZERS[key](reader[key]).enabled === true;
    const hud = reader.statusHud && typeof reader.statusHud === 'object' ? reader.statusHud : {};
    return {
        text: [
            ['双语台词', on('bilingual')],
            extras.sentencePaging ? ['旁白按句号分页', extras.sentencePagingOn === true] : null,
        ],
        stage: [
            ['多角色同屏', on('stageCast')],
            extras.narrationFilter ? ['旁白时压暗立绘', hud.dimSpriteOnNarration !== false] : null,
        ],
        story: [['选项检定掷骰', on('resultFx')]],
        sound: [extras.voiceBark ? ['角色语气音', extras.voiceBarkOn === true] : null],
    };
}

// 组标题旁的固定概括（不再罗列已开启的功能名，开得多时会很长）。
const GROUP_BRIEFS = Object.freeze({
    text: '打字机 · 字效 · 双语',
    stage: '镜头 · 天气 · 立绘',
    story: '情绪 · 提示 · 事件',
    special: '日常 · 直播 · 亲密',
    sound: '音效 · 语气 · 配乐',
});

// 「全部关闭」时默认开着的演出音效单独无效果，摘要里一并按关闭显示，和档位高亮一致；档位不管的开关照实显示。
function groupSummary(reader, groupId, allOff, extra = []) {
    const features = PERFORMANCE_FEATURES.filter((feature) => feature.group === groupId);
    const switches = features.map((feature) => [feature.label, !allOff && isPerformanceFeatureOn(reader, feature.key)])
        .concat(extra.filter(Boolean));
    const on = switches.filter(([, enabled]) => enabled === true);
    return `<span class="igs-perf-count${on.length ? ' is-on' : ''}">${on.length}/${switches.length}</span><span class="igs-perf-brief">${esc(GROUP_BRIEFS[groupId] || '')}</span>`;
}

const section = (title, parts) => {
    const body = parts.filter(Boolean).join('');
    return body ? `<div class="igs-settings-subhead">${esc(title)}</div>${body}` : '';
};

function groupCard(id, title, summaryHtml, body, open) {
    return `<div class="igs-source-filter igs-perf-group"><details data-advanced="perf-group-${id}"${open ? ' open' : ''}><summary><b>${esc(title)}</b>${summaryHtml}</summary><div class="igs-perf-group-body">${body}</div></details></div>`;
}

// extras 为阅读器宿主渲染的演出片段：[开关, 细项] 二元组或单个开关 / 字段，统一包成演出行。
export function renderPerformanceSettings(reader, extras = {}, isOpen = () => false) {
    const src = reader && typeof reader === 'object' ? reader : {};
    const more = (key, label, body) => collapsible(key, label, body, isOpen(`perf-${key}`));
    more.isOpen = (key) => isOpen(`perf-${key}`);
    const host = (key, value, hint = '') => {
        const [head, detail] = Array.isArray(value) ? value : [value || '', ''];
        return head ? perfItem(more, key, head, { hint, detail }) : '';
    };
    const current = detectPerformancePreset(src);
    const fx = renderFxFeatureFields(src, more);
    const stage = renderStageDirectionFields(src, more, { worldview: extras.worldviewId });
    const danmaku = renderDanmakuFields(src, more);
    const bodies = {
        text: [host('playback-speed', extras.playbackSpeed), host('typewriter', extras.typewriter, '逐字显示'), stage.clickWaitMark, stage.textFx, stage.bilingual, host('sentence-paging', extras.sentencePaging)],
        stage: [
            section('镜头与环境', [stage.transition, stage.tint, stage.camera, host('weather', extras.weatherFx, '雨雪雾粒子'), host('stage-shake', extras.stageShake, '冲击时晃屏'), host('cinema-bars', extras.cinemaBars, '只盖背景，CG时收起')]),
            section('立绘', [stage.motion, stage.actions, stage.cast, host('narration-filter', extras.narrationFilter)]),
        ],
        story: [
            section('情绪', [fx.manga, fx.heartbeat]),
            section('剧情提示', [fx.title, fx.favor, fx.itemFx, fx.resultFx]),
            section('事件演出', [fx.tags]),
        ],
        special: [
            section('日常与冒险', [stage.daily, fx.battleFx, fx.flash]),
            section('线上与直播', [host('chat-show', extras.chatShow, '聊天页演出'), danmaku.live, danmaku.audience, danmaku.inner]),
            section('亲密', [renderRomanceFxFields(src, more), host('nsfw-sprite', extras.nsfwSprite), host('nsfw-veil', extras.nsfwVeil), host('nsfw-cg-portrait', extras.nsfwCgPortrait)]),
        ],
        sound: [stage.master, fx.sound, host('voice-bark', extras.voiceBark, '台词开头的语气声'), stage.ambient, stage.ui, stage.bgm],
    };
    const extra = extraSwitches(src, extras);
    const groups = PERFORMANCE_GROUPS.map(([id, title]) => groupCard(id, title, groupSummary(src, id, current === 'off', extra[id]), bodies[id].filter(Boolean).join(''), isOpen(`perf-group-${id}`)));
    const rhythm = groupCard('rhythm', '节奏与互动', '<span class="igs-perf-brief">风格 · Meta · CG停留时长</span>',
        section('节奏', [fx.style, host('cg-hold', extras.cgHold)]) + section('Meta互动', [renderMetaFxFields(src, more)]), isOpen('perf-group-rhythm'));
    return renderPerformancePresetBar(src, { canUndo: extras.canUndo === true, extraRows: (extras.worldview || '') + renderQualityRow(src) }) + groups.join('') + rhythm;
}
