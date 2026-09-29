import { field, selectInput } from './settings-fields.js';
import { RENDER_QUALITY_OPTIONS, normalizeRenderQualitySetting, resolveRenderQuality } from './render-quality.js';

export const RENDER_QUALITY_PATH = 'readerSettings.performance.quality';

// 画质档挂在演出档位条里（extraRows），首页与「阅读器 › 演出」共用。
export function renderQualityRow(reader) {
    const src = reader && typeof reader === 'object' ? reader : {};
    const setting = normalizeRenderQualitySetting(src.performance && src.performance.quality);
    const note = setting === 'auto'
        ? `本机判定为${resolveRenderQuality('auto') === 'low' ? '低画质' : '标准'}。低画质停掉推镜与立绘呼吸，粒子减半、降到 20 帧。`
        : '低画质停掉推镜与立绘呼吸，粒子减半、降到 20 帧。';
    return `<div class="igs-perf-quality">${field(RENDER_QUALITY_PATH, '画质', selectInput(RENDER_QUALITY_PATH, setting, RENDER_QUALITY_OPTIONS), note)}</div>`;
}
