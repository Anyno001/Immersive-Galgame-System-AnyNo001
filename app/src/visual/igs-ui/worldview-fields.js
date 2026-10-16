import { esc } from './reader-value-utils.js';
import { field } from './settings-fields.js';
import { WORLDVIEWS, resolveWorldview } from '../../scene/worldview.js';
import { canCarryPhone } from '../../scene/fx-era.js';
import { HORROR_GORE_LEVELS, HORROR_STYLES, normalizeHorrorGore, normalizeHorrorStyle } from '../../scene/horror.js';

// 「适配世界」下拉：挂在一键档位条（extraRows），首页与「阅读器 › 演出」共用。
// 不带 data-path：选择由设置页 change 事件转成 worldview:<id> 动作；未就绪的世界观显示「即将推出」且不可选。
export const WORLDVIEW_SELECT_ATTR = 'data-worldview-select';
// 恐怖世界观的两个子选项同样不带 data-path，转成 horror-style:<id> / horror-gore:<n> 动作写进同一份素材库。
export const HORROR_SELECT_ATTR = 'data-horror-select';
// 「随身带着现代手机」开关与提示词：同样不带 data-path，转成 carry-phone:<on|off> / carry-phone-prompt:<文字> 动作。
export const CARRY_PHONE_ATTR = 'data-carry-phone';
export const CARRY_PHONE_PROMPT_ATTR = 'data-carry-phone-prompt';

function carryPhoneBlock(source) {
    const on = source.carryPhone === true;
    const prompt = typeof source.carryPhonePrompt === 'string' ? source.carryPhonePrompt : '';
    // 开关用设置页统一的 igs-switch 外观，点击走 data-action（不写 data-switch，避免被当成路径开关）。
    const toggle = `<button type="button" class="igs-switch${on ? ' is-on' : ''}" data-action="carry-phone:${on ? 'off' : 'on'}" aria-pressed="${on ? 'true' : 'false'}"><i></i><span>随身带着现代手机</span></button>`;
    const detail = on
        ? field('', '随身手机提示词', `<textarea ${CARRY_PHONE_PROMPT_ATTR} rows="3" placeholder="留空用默认" aria-label="随身手机提示词">${esc(prompt)}</textarea>`)
        : '';
    return toggle + detail;
}

function horrorSelect(kind, label, items, current) {
    const options = items.map(({ id, label: text }) => `<option value="${esc(String(id))}"${String(current) === String(id) ? ' selected' : ''}>${esc(text)}</option>`).join('');
    return field('', label, `<select ${HORROR_SELECT_ATTR}="${kind}" aria-label="${esc(label)}">${options}</select>`);
}

export function renderWorldviewRow(sceneAssets) {
    const current = resolveWorldview(sceneAssets);
    const options = WORLDVIEWS.map(({ id, label, ready }) => {
        const text = ready ? label : `${label}（即将推出）`;
        return `<option value="${esc(id)}"${current === id ? ' selected' : ''}${ready ? '' : ' disabled'}>${esc(text)}</option>`;
    }).join('');
    const select = `<select ${WORLDVIEW_SELECT_ATTR} aria-label="适配世界">${options}</select>`;
    const source = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    const style = normalizeHorrorStyle(source.horrorStyle);
    const horror = current === 'horror'
        ? horrorSelect('style', '恐怖风格', HORROR_STYLES, style)
            + (style === 'psych' ? '' : horrorSelect('gore', '血腥尺度', HORROR_GORE_LEVELS, normalizeHorrorGore(source.horrorGore)))
        : '';
    const phone = canCarryPhone(current) ? carryPhoneBlock(source) : '';
    return `<div class="igs-perf-worldview">${field('', '适配世界', select)}${horror}${phone}</div>`;
}
