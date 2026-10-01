import { esc } from './reader-value-utils.js';
import { field } from './settings-fields.js';
import { WORLDVIEWS, resolveWorldview } from '../../scene/worldview.js';

// 「适配世界」下拉：挂在一键档位条（extraRows），首页与「阅读器 › 演出」共用。
// 不带 data-path：选择由设置页 change 事件转成 worldview:<id> 动作；未就绪的世界观显示「即将推出」且不可选。
export const WORLDVIEW_SELECT_ATTR = 'data-worldview-select';

export function renderWorldviewRow(sceneAssets) {
    const current = resolveWorldview(sceneAssets);
    const options = WORLDVIEWS.map(({ id, label, ready }) => {
        const text = ready ? label : `${label}（即将推出）`;
        return `<option value="${esc(id)}"${current === id ? ' selected' : ''}${ready ? '' : ' disabled'}>${esc(text)}</option>`;
    }).join('');
    const select = `<select ${WORLDVIEW_SELECT_ATTR} aria-label="适配世界">${options}</select>`;
    return `<div class="igs-perf-worldview">${field('', '适配世界', select)}</div>`;
}
