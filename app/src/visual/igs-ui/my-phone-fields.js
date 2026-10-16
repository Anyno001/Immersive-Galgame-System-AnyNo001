import { colorInput, field, segmentedInput, textInput } from './settings-fields.js';
import { collapsible, perfItem } from './fx-settings-fields.js';
import { esc } from './reader-value-utils.js';
import {
    PHONE_CASE_PRESETS,
    PHONE_MODELS,
    PHONE_MODEL_LABELS,
    PHONE_RINGTONES,
    PHONE_RINGTONE_LABELS,
    myPhoneOf,
} from './my-phone.js';

const swatch = (path, hex, name, active) => `<button type="button" class="igs-phone-swatch${active ? ' is-active' : ''}" data-segment-path="${esc(path)}" data-segment-value="${esc(hex)}" role="radio" aria-checked="${active ? 'true' : 'false'}" aria-label="${esc(name)}" title="${esc(name)}" style="width:26px;height:26px;margin:2px 4px 2px 0;padding:0;border-radius:50%;background:${esc(hex)};border:2px solid ${active ? '#fff' : 'rgba(128,128,128,.45)'};box-shadow:${active ? '0 0 0 2px var(--igs-settings-accent)' : 'none'};cursor:pointer"></button>`;

// 「线上与直播」最前面的一行：一台手机的外观，直播、社区、风暴与聊天共用。
export function renderMyPhoneFields(reader, more = collapsible) {
    const p = 'readerSettings.myPhone';
    const s = myPhoneOf(reader);
    const known = PHONE_CASE_PRESETS.some(([hex]) => hex === s.caseColor);
    const wallMode = s.wallpaper === 'scene' || s.wallpaper === 'none' ? s.wallpaper : 'custom';
    const colors = `<div class="igs-settings-field"><span>手机壳</span><div role="radiogroup" aria-label="手机壳颜色" style="display:flex;flex-wrap:wrap;align-items:center">`
        + PHONE_CASE_PRESETS.map(([hex, name]) => swatch(`${p}.caseColor`, hex, name, hex === s.caseColor)).join('')
        + `${colorInput(`${p}.caseColor`, s.caseColor)}</div></div>`;
    const detail = field(`${p}.model`, '机型', segmentedInput(`${p}.model`, s.model, PHONE_MODELS.map((key) => [key, PHONE_MODEL_LABELS[key]]), '手机机型'))
        + field(`${p}.size`, '大小', segmentedInput(`${p}.size`, s.size, [['large', '放大'], ['fit', '避开对话框']], '手机大小'))
        + colors
        + field(`${p}.wallpaper`, '壁纸', segmentedInput(`${p}.wallpaper`, wallMode, [['scene', '当前场景'], ['none', '纯色'], ['custom', '自定义']], '手机壁纸'))
        + (wallMode === 'custom' ? field(`${p}.wallpaper`, '图片地址', textInput(`${p}.wallpaper`, s.wallpaper === 'custom' ? '' : s.wallpaper, 'https://…')) : '')
        + field(`${p}.ringtone`, '铃声', segmentedInput(`${p}.ringtone`, s.ringtone, PHONE_RINGTONES.map((key) => [key, PHONE_RINGTONE_LABELS[key]]), '铃声风格'));
    return perfItem(more, 'my-phone', '<span class="igs-perf-item-label">我的手机</span>', { on: true, hint: known ? '' : '自定义壳色', detail });
}
