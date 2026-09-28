import { esc } from './reader-value-utils.js';
import { checkbox, rangeInput, field, segmentedInput } from './settings-fields.js';
import { FX_TAG_KINDS } from '../../scene/fx-directives.js';
import { FX_TAG_LABELS, MANGA_SYMBOL_KINDS, MANGA_SYMBOL_LABELS, normalizeFxReaderSettings } from './fx-settings.js';

const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

export function renderWordListField(path, label, words) {
    const list = Array.isArray(words) ? words : [];
    const tags = list.map((word) => `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="fx-word-remove:${encSeg(path)}:${encSeg(word)}" title="删除">×</button></span>`).join('');
    return `<div class="igs-settings-field"><span>${esc(label)}</span><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无触发情绪</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="fx-word-add:${encSeg(path)}" title="添加触发情绪">+</button></div></div>`;
}

function group(title, body) {
    return `<div class="igs-settings-group"><div class="igs-settings-subhead">${esc(title)}</div>${body}</div>`;
}

function sub(body) {
    return `<div class="igs-settings-sub">${body}</div>`;
}

// 「演出」页里的漫画演出整合卡：通用风格 → 情绪特效 → 剧情提示 → 音效，只移动展示位置，持久化路径不变。
export function renderFxPerformanceSections(reader) {
    const s = normalizeFxReaderSettings(reader);
    const p = 'readerSettings';
    const style = `<div class="igs-source-filter-grid">`
        + field(`${p}.fxStyle.motion`, '演出风格', segmentedInput(`${p}.fxStyle.motion`, s.fxStyle.motion, [['smooth', '渐变演出'], ['snappy', '灵动演出']], '演出风格'))
        + field(`${p}.fxStyle.hold`, '停留时间', segmentedInput(`${p}.fxStyle.hold`, s.fxStyle.hold, [['short', '短'], ['medium', '中'], ['long', '长']], '停留时间'))
        + `</div>`
        + checkbox(`${p}.fxStyle.replay`, s.fxStyle.replay, '翻回已看过的页时重播演出')
        + `<div class="igs-source-filter-note">渐变演出为柔和缓动；灵动演出按关键帧定格，更有漫画分镜的一拍一拍卡顿感。</div>`;
    const manga = checkbox(`${p}.mangaFx.enabled`, s.mangaFx.enabled, '情绪符号与集中线')
        + (s.mangaFx.enabled ? sub(MANGA_SYMBOL_KINDS.map((kind) => renderWordListField(`mangaFx.symbols.${kind}`, MANGA_SYMBOL_LABELS[kind], s.mangaFx.symbols[kind])).join('')
            + renderWordListField('mangaFx.speedLines', '集中线', s.mangaFx.speedLines)) : '');
    const heartbeat = checkbox(`${p}.heartbeatFx.enabled`, s.heartbeatFx.enabled, '心跳脉动')
        + (s.heartbeatFx.enabled ? sub(renderWordListField('heartbeatFx.love', '心动（粉色）', s.heartbeatFx.love)
            + renderWordListField('heartbeatFx.tense', '紧张（暗红）', s.heartbeatFx.tense)) : '');
    const flash = checkbox(`${p}.flashFx.enabled`, s.flashFx.enabled, '闪白与耳鸣')
        + (s.flashFx.enabled ? sub(renderWordListField('flashFx.emotions', '触发情绪', s.flashFx.emotions)) : '');
    const title = checkbox(`${p}.titleCard.enabled`, s.titleCard.enabled, '地点/时间标题卡')
        + (s.titleCard.enabled ? sub(checkbox(`${p}.titleCard.onLocation`, s.titleCard.onLocation, '切换地点时显示')
            + checkbox(`${p}.titleCard.onTime`, s.titleCard.onTime, '时间变化时显示')) : '');
    const favor = checkbox(`${p}.favorToast.enabled`, s.favorToast.enabled, '数值变化提示（读取状态栏已选表格）');
    const tags = checkbox(`${p}.fxTags.enabled`, s.fxTags.enabled, '演出标签（开启后向 AI 注入 igs-fx 语法）')
        + (s.fxTags.enabled ? sub(`<div class="igs-source-filter-grid">${FX_TAG_KINDS.map((kind) => checkbox(`${p}.fxTags.${kind}`, s.fxTags[kind], FX_TAG_LABELS[kind])).join('')}</div>`) : '');
    const soundOn = s.heartbeatFx.enabled || s.flashFx.enabled || s.fxTags.enabled;
    const sound = soundOn ? group('音效', checkbox(`${p}.fxSound.enabled`, s.fxSound.enabled, '启用演出音效（铃声、心跳、耳鸣等）')
        + (s.fxSound.enabled ? sub(field(`${p}.fxSound.volume`, '音量', rangeInput(`${p}.fxSound.volume`, s.fxSound.volume))) : '')) : '';
    // 先选要哪些效果，再调整体风格；一个效果都没开时不显示风格设置。
    const anyOn = s.mangaFx.enabled || s.heartbeatFx.enabled || s.flashFx.enabled || s.titleCard.enabled || s.favorToast.enabled || s.fxTags.enabled;
    return `<div class="igs-source-filter igs-fx-settings"><div class="igs-source-filter-title">漫画演出</div>${[
        group('情绪特效', manga + heartbeat + flash),
        group('剧情提示', title + favor + tags),
        anyOn ? group('演出风格', style) : '',
        sound,
    ].join('')}</div>`;
}
