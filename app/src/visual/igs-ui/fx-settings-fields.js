import { esc } from './reader-value-utils.js';
import { checkbox, rangeInput, field } from './settings-fields.js';
import { FX_TAG_KINDS } from '../../scene/fx-directives.js';
import { FX_TAG_LABELS, MANGA_SYMBOL_KINDS, MANGA_SYMBOL_LABELS, normalizeFxReaderSettings } from './fx-settings.js';

const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

export function renderWordListField(path, label, words) {
    const list = Array.isArray(words) ? words : [];
    const tags = list.map((word) => `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="fx-word-remove:${encSeg(path)}:${encSeg(word)}" title="删除">×</button></span>`).join('');
    return `<div class="igs-settings-field"><span>${esc(label)}</span><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无触发情绪</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="fx-word-add:${encSeg(path)}" title="添加触发情绪">+</button></div></div>`;
}

function section(title, body) {
    return `<div class="igs-source-filter"><div class="igs-source-filter-title">${esc(title)}</div>${body}</div>`;
}

function sub(body) {
    return `<div class="igs-settings-sub">${body}</div>`;
}

export function renderFxPerformanceSections(reader) {
    const s = normalizeFxReaderSettings(reader);
    const p = 'readerSettings';
    const title = checkbox(`${p}.titleCard.enabled`, s.titleCard.enabled, '启用地点/时间标题卡')
        + (s.titleCard.enabled ? sub(checkbox(`${p}.titleCard.onLocation`, s.titleCard.onLocation, '切换地点时显示')
            + checkbox(`${p}.titleCard.onTime`, s.titleCard.onTime, '时间变化时显示')) : '');
    const manga = checkbox(`${p}.mangaFx.enabled`, s.mangaFx.enabled, '启用漫画情绪符号与集中线')
        + (s.mangaFx.enabled ? sub(MANGA_SYMBOL_KINDS.map((kind) => renderWordListField(`mangaFx.symbols.${kind}`, MANGA_SYMBOL_LABELS[kind], s.mangaFx.symbols[kind])).join('')
            + renderWordListField('mangaFx.speedLines', '集中线', s.mangaFx.speedLines)) : '');
    const heartbeat = checkbox(`${p}.heartbeatFx.enabled`, s.heartbeatFx.enabled, '启用心跳脉动')
        + (s.heartbeatFx.enabled ? sub(renderWordListField('heartbeatFx.love', '心动（粉色）', s.heartbeatFx.love)
            + renderWordListField('heartbeatFx.tense', '紧张（暗红）', s.heartbeatFx.tense)) : '');
    const flash = checkbox(`${p}.flashFx.enabled`, s.flashFx.enabled, '启用闪白与耳鸣')
        + (s.flashFx.enabled ? sub(renderWordListField('flashFx.emotions', '触发情绪', s.flashFx.emotions)) : '');
    const favor = checkbox(`${p}.favorToast.enabled`, s.favorToast.enabled, '数值变化时提示（读取状态栏已选表格）');
    const tags = checkbox(`${p}.fxTags.enabled`, s.fxTags.enabled, '启用演出标签（开启后向 AI 注入 igs-fx 语法）')
        + (s.fxTags.enabled ? sub(`<div class="igs-source-filter-grid">${FX_TAG_KINDS.map((kind) => checkbox(`${p}.fxTags.${kind}`, s.fxTags[kind], FX_TAG_LABELS[kind])).join('')}</div>`) : '');
    const soundOn = s.heartbeatFx.enabled || s.flashFx.enabled || s.fxTags.enabled;
    const sound = soundOn ? section('演出音效', checkbox(`${p}.fxSound.enabled`, s.fxSound.enabled, '启用演出音效（铃声、心跳、耳鸣等）')
        + (s.fxSound.enabled ? sub(field(`${p}.fxSound.volume`, '音量', rangeInput(`${p}.fxSound.volume`, s.fxSound.volume))) : '')) : '';
    return [
        section('标题卡', title),
        section('漫画特效', manga),
        section('心跳', heartbeat),
        section('闪白', flash),
        section('数值提示', favor),
        section('标签演出', tags),
        sound,
    ].join('');
}
