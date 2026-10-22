import { esc } from './reader-value-utils.js';
import { collapsible, perfItem, renderFxFeatureFields } from './fx-settings-fields.js';
import { renderStageDirectionFields } from './stage-direction-fields.js';
import { renderPackFields, renderPackSoundField, renderPanelSkinField } from './fx-pack-fields.js';
import { renderRomanceFxFields } from './romance-fields.js';
import { renderDanmakuFields } from './danmaku-settings-fields.js';
import { renderMyPhoneFields } from './my-phone-fields.js';
import { renderMetaFxFields } from './meta-fields.js';
import { renderFeedFields } from './feed-settings-fields.js';
import { PERFORMANCE_FEATURES, PERFORMANCE_PRESETS, detectPerformancePreset, isPerformanceFeatureOn } from './performance-presets.js';
import { PROFILE_PATH, hasPerformanceProfile, profileDiff } from './performance-profile.js';
import { renderQualityRow } from './render-quality-fields.js';
import { FX_SETTINGS_NORMALIZERS } from './fx-settings.js';

// 六张卡：组内用小标题分段，不再一类一张卡。节奏单独渲染为最后一张。
export const PERFORMANCE_GROUPS = Object.freeze([
    Object.freeze(['text', '文字']),
    Object.freeze(['stage', '画面']),
    Object.freeze(['story', '情绪与提示']),
    Object.freeze(['special', '题材专属']),
    Object.freeze(['sound', '声音']),
]);

// 第五段「自定义」：当前开关与四档都不吻合时高亮；在仪表盘上点它去演出页，在演出页上不做事。
function customButton(active, home) {
    return `<button type="button" class="igs-perf-preset${active ? ' is-active' : ''}"${home ? ' data-cat="perf"' : ''} aria-pressed="${active ? 'true' : 'false'}">自定义</button>`;
}

// 首页与「阅读器 › 演出」共用同一档位条和 perf-preset 动作；extraRows 供其他档位（如画质档）挂在同一卡片里。
export function renderPerformancePresetBar(reader, { home = false, extraRows = '', canUndo = false, compact = false } = {}) {
    const src = reader && typeof reader === 'object' ? reader : {};
    // 有快速配置时，高亮的是配置记下的档位；手动改过的开关在下面列出差异。
    const profile = hasPerformanceProfile(src) ? src[PROFILE_PATH] : null;
    const diff = profileDiff(src);
    const changed = Boolean(diff && (diff.added.length || diff.removed.length));
    const current = profile ? (changed ? '' : profile.level) : detectPerformancePreset(src);
    const buttons = PERFORMANCE_PRESETS.map(([id, label]) => (
        `<button type="button" class="igs-perf-preset${current === id ? ' is-active' : ''}" data-action="perf-preset:${id}" aria-pressed="${current === id ? 'true' : 'false'}">${esc(label)}</button>`
    )).join('') + customButton(current === '', home);
    let state = '';
    if (changed) {
        state = [diff.added.length ? `比配置多开了：${diff.added.join('、')}` : '', diff.removed.length ? `关掉了：${diff.removed.join('、')}` : ''].filter(Boolean).join('；') + '。点档位会恢复。';
    } else if (!current) {
        state = '当前为自定义组合；点任一档位会覆盖各演出的开关，细项设置保留。';
    }
    const note = home ? `${state}细项在「演出」「声音」里调整。` : state;
    const undo = canUndo ? '<button type="button" class="igs-settings-action" data-action="perf-preset-undo">撤销档位切换</button>' : '';
    if (compact) {
        const undoSmall = canUndo ? '<button type="button" class="igs-perf-undo" data-action="perf-preset-undo">撤销档位切换</button>' : '';
        const tail = (note || undoSmall) ? `<div class="igs-perf-presets-note">${note ? `<span>${esc(note)}</span>` : ''}${undoSmall}</div>` : '';
        return `<div class="igs-perf-presets is-compact"><div class="igs-key-title">演出档位</div><div class="igs-perf-preset-row">${buttons}</div>${tail}</div>`;
    }
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
            ['漫画演出模式', on('comicMode')],
            ['双语台词', on('bilingual')],
            extras.sentencePaging ? ['旁白按句号分页', extras.sentencePagingOn === true] : null,
            extras.dialogueSentencePaging ? ['对白／心理话也按句分页', extras.dialogueSentencePagingOn === true] : null,
        ],
        stage: [
            ['多角色同屏', on('stageCast')],
            extras.narrationFilter ? ['旁白时压暗立绘', hud.dimSpriteOnNarration !== false] : null,
        ],
        story: [['选项检定掷骰', on('resultFx')]],
        sound: [extras.tts ? ['台词朗读', extras.ttsOn === true] : null, extras.voiceBark ? ['角色语气音', extras.voiceBarkOn === true] : null],
    };
}

// 组标题旁的固定概括（不再罗列已开启的功能名，开得多时会很长）。
const GROUP_BRIEFS = Object.freeze({
    text: '打字机 · 字效 · 双语',
    stage: '镜头 · 天气 · 立绘',
    story: '情绪 · 提示 · 事件',
    special: '日常 · 直播 · 社区 · 亲密 · Meta',
    sound: '音效 · 语气 · 配乐',
});

// 「全部关闭」时默认开着的演出音效单独无效果，摘要里一并按关闭显示，和档位高亮一致；档位不管的开关照实显示。
function groupCounts(reader, groupId, allOff, extra = []) {
    const features = PERFORMANCE_FEATURES.filter((feature) => feature.group === groupId);
    const switches = features.map((feature) => [feature.label, !allOff && isPerformanceFeatureOn(reader, feature.key)])
        .concat(extra.filter(Boolean));
    return { on: switches.filter(([, enabled]) => enabled === true).length, total: switches.length };
}

function groupSummary(reader, groupId, allOff, extra = []) {
    const { on, total } = groupCounts(reader, groupId, allOff, extra);
    return `<span class="igs-perf-count${on ? ' is-on' : ''}">${on}/${total}</span><span class="igs-perf-brief">${esc(GROUP_BRIEFS[groupId] || '')}</span>`;
}

// 演出子页条的小胶囊：每组「开着的数量/总数」，和折叠卡标题同一套计数（全部关闭档按关闭算）。
export function performanceGroupCounts(reader, extras = {}) {
    const src = reader && typeof reader === 'object' ? reader : {};
    const allOff = detectPerformancePreset(src) === 'off';
    const extra = extraSwitches(src, extras);
    return Object.fromEntries(PERFORMANCE_GROUPS.map(([id]) => [id, groupCounts(src, id, allOff, extra[id])]));
}

// 题材包小节顶部的说明；没有可列的包时整节不出现。
const packSection = (rows) => (rows ? `<div class="igs-source-filter-note">${esc(PACK_SECTION_NOTE)}</div>${rows}` : '');
const PACK_SECTION_NOTE = '按作品题材启用专属演出。';

const section = (title, parts) => {
    const body = parts.filter(Boolean).join('');
    return body ? `<div class="igs-settings-subhead">${esc(title)}</div>${body}` : '';
};

function groupCard(id, title, summaryHtml, body, open) {
    return `<div class="igs-source-filter igs-perf-group"><details data-advanced="perf-group-${id}"${open ? ' open' : ''}><summary><b>${esc(title)}</b>${summaryHtml}</summary><div class="igs-perf-group-body">${body}</div></details></div>`;
}

// extras 为阅读器宿主渲染的演出片段：[开关, 细项] 二元组或单个开关 / 字段，统一包成演出行。
function buildPerformanceBodies(src, extras, isOpen) {
    const more = (key, label, body) => collapsible(key, label, body, isOpen(`perf-${key}`));
    more.isOpen = (key) => isOpen(`perf-${key}`);
    const host = (key, value, hint = '') => {
        const [head, detail] = Array.isArray(value) ? value : [value || '', ''];
        return head ? perfItem(more, key, head, { hint, detail }) : '';
    };
    const fx = renderFxFeatureFields(src, more, extras.fontOptions);
    const stage = renderStageDirectionFields(src, more, { worldview: extras.worldviewId });
    const danmaku = renderDanmakuFields(src, more, { liveBlocked: extras.liveBlocked === true });
    return {
        more,
        fx,
        bodies: {
            text: [host('playback-speed', extras.playbackSpeed), host('typewriter', extras.typewriter, '逐字显示'), stage.waitStage, stage.clickWaitMark, stage.textFx, stage.bilingual, host('sentence-paging', extras.sentencePaging), host('dialogue-sentence-paging', extras.dialogueSentencePaging)],
            stage: [
                section('镜头与环境', [stage.transition, stage.cgEntrance, stage.tint, stage.camera, host('weather', extras.weatherFx, '雨雪雾粒子'), fx.crowd, host('stage-shake', extras.stageShake, '冲击时晃屏'), renderPackFields(src, more, { ids: ['camera'] }), renderPackFields(src, more, { ids: ['places'] }), host('cinema-bars', extras.cinemaBars, '只盖背景，CG时收起'), fx.comic, renderPanelSkinField(src, more)]),
                section('立绘', [stage.motion, stage.actions, stage.turn, stage.cast, renderPackFields(src, more, { ids: ['transform'] }), host('narration-filter', extras.narrationFilter)]),
            ],
            story: [
                section('情绪', [fx.manga, fx.mangaBack, fx.heartbeat]),
                section('剧情提示', [fx.title, fx.favor, fx.itemFx, fx.resultFx]),
                section('事件演出', [fx.tags, fx.dlc, renderPackFields(src, more, { ids: ['beats'] })].filter(Boolean)),
            ],
            special: [
                section('日常与冒险', [stage.daily, fx.battleFx, fx.flash]),
                section('题材包', [packSection(renderPackFields(src, more))]),
                section('Meta互动', [renderMetaFxFields(src, more)]),
                section('线上与直播', [renderMyPhoneFields(src, more), host('chat-show', extras.chatShow, '聊天页演出'), danmaku.live, renderFeedFields(src, more), danmaku.audience, danmaku.inner, fx.notifyCenter]),
                section('亲密', [renderRomanceFxFields(src, more), renderPackFields(src, more, { ids: ['nsfw'] }), host('nsfw-sprite', extras.nsfwSprite), host('nsfw-veil', extras.nsfwVeil), host('nsfw-cg-portrait', extras.nsfwCgPortrait)]),
            ],
            sound: [stage.master, fx.sound, host('tts', extras.tts, '朗读台词与旁白'), host('voice-bark', extras.voiceBark, '台词开头的语气声'), stage.ambient, renderPackSoundField(src, more), stage.ui, stage.bgm],
            rhythm: [section('节奏', [fx.style, host('cg-hold', extras.cgHold)])],
        },
    };
}

export function renderPerformanceSettings(reader, extras = {}, isOpen = () => false) {
    const src = reader && typeof reader === 'object' ? reader : {};
    const { bodies } = buildPerformanceBodies(src, extras, isOpen);
    const current = detectPerformancePreset(src);
    const extra = extraSwitches(src, extras);
    const groups = PERFORMANCE_GROUPS.map(([id, title]) => groupCard(id, title, groupSummary(src, id, current === 'off', extra[id]), bodies[id].filter(Boolean).join(''), isOpen(`perf-group-${id}`)));
    const rhythm = groupCard('rhythm', '节奏', '<span class="igs-perf-brief">风格 · CG停留时长</span>',
        bodies.rhythm.join(''), isOpen('perf-group-rhythm'));
    return renderPerformancePresetBar(src, { canUndo: extras.canUndo === true, extraRows: (extras.worldview || '') + renderQualityRow(src) }) + groups.join('') + rhythm;
}

// 演出 / 声音的单页：顶部只放档位按钮那一行，下面是该组的细项（组内不再套折叠卡，小标题分段保留）。
export function renderPerformancePage(groupId, reader, extras = {}, isOpen = () => false) {
    const src = reader && typeof reader === 'object' ? reader : {};
    const { bodies } = buildPerformanceBodies(src, extras, isOpen);
    const body = (bodies[groupId] || []).filter(Boolean).join('');
    // 档位条由页面分派放在子页条上方（作用于整个演出分类），这里只出该组细项。
    return `<div class="igs-source-filter igs-perf-group igs-perf-page" data-perf-page="${esc(groupId)}"><div class="igs-perf-group-body">${body}</div></div>`;
}

// 仪表盘用：演出（不含声音）与声音各开了几项，按 PERFORMANCE_FEATURES 数。
export function countEnabledPerformance(reader) {
    const src = reader && typeof reader === 'object' ? reader : {};
    let performance = 0;
    let sound = 0;
    for (const feature of PERFORMANCE_FEATURES) {
        if (!isPerformanceFeatureOn(src, feature.key)) continue;
        if (feature.group === 'sound') sound += 1;
        else performance += 1;
    }
    return { performance, sound };
}
