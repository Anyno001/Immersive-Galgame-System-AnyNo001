// 状态栏位置：两根拉杆 + 小舞台示意。拖动只改小舞台上的 CSS 变量（不写草稿、不重绘），松手才写进草稿。
// 小舞台按参考尺寸（电脑 1280×720、手机 390×844）用和阅读器同一套公式摆放，状态栏宽高按当前「大小」档换算。
import { esc } from './reader-value-utils.js';
import { segmentedInput } from './settings-fields.js';
import {
    STATUS_HUD_PHONE_MEDIA, STATUS_HUD_POSITION_DEVICES, normalizeStatusHudPercent, normalizeStatusHudPosition, resolveStatusHudScale,
} from '../../data/shujuku/status-hud-model.js';

const STAGES = Object.freeze({ pc: { w: 1280, h: 720 }, mobile: { w: 390, h: 844 } });
// 未缩放时的状态栏尺寸：带 HUD 条时宽 340、三条约高 120；只有头像和情绪时按内容收窄，约 128 × 62。
const HUD_SIZE_METRICS = Object.freeze({ w: 340, h: 120 });
const HUD_SIZE_PLAIN = Object.freeze({ w: 128, h: 62 });
const HUD_EDGE = 14;
const DEVICE_LABELS = Object.freeze({ pc: '电脑', mobile: '手机' });
const AXIS_WORDS = Object.freeze({ x: ['最左', '居中', '最右'], y: ['最上', '居中', '最下'] });

export function isStatusHudPhone(win) {
    try {
        return Boolean(win && typeof win.matchMedia === 'function' && win.matchMedia(STATUS_HUD_PHONE_MEDIA).matches);
    } catch (error) {
        return false;
    }
}

export function statusHudPositionDevice(asyncState, win) {
    const chosen = asyncState && asyncState.statusHudPosDevice;
    if (STATUS_HUD_POSITION_DEVICES.includes(chosen)) return chosen;
    return isStatusHudPhone(win) ? 'mobile' : 'pc';
}

export function describeStatusHudAxis(axis, value) {
    const percent = normalizeStatusHudPercent(value);
    const [start, middle, end] = AXIS_WORDS[axis] || AXIS_WORDS.x;
    if (percent === 0) return start;
    if (percent === 100) return end;
    return percent === 50 ? middle : `${percent}%`;
}

const share = (part, whole) => `${Math.round((part / whole) * 10000) / 100}%`;

export function renderStatusHudPositionField(statusHud, device, currentDevice) {
    const hud = statusHud && typeof statusHud === 'object' ? statusHud : {};
    const point = normalizeStatusHudPosition(hud.position)[device];
    const stage = STAGES[device];
    const scale = resolveStatusHudScale(hud.size, stage.w, stage.h);
    const size = Array.isArray(hud.tables) && hud.tables.length ? HUD_SIZE_METRICS : HUD_SIZE_PLAIN;
    const vars = [
        `--igs-hp-x:${point.x}`, `--igs-hp-y:${point.y}`,
        `--igs-hp-w:${share(size.w * scale, stage.w)}`, `--igs-hp-h:${share(size.h * scale, stage.h)}`,
        `--igs-hp-ex:${share(HUD_EDGE, stage.w)}`, `--igs-hp-ey:${share(HUD_EDGE, stage.h)}`,
    ].join(';');
    const base = `readerSettings.statusHud.position.${device}`;
    const axis = (key, label) => `<label class="igs-hud-pos-axis"><span>${label}</span><span class="igs-settings-range"><input type="range" data-path="${base}.${key}" data-hud-pos-axis="${key}" min="0" max="100" step="1" value="${point[key]}" aria-label="状态栏${label}位置"><output data-hud-pos-value="${key}">${esc(describeStatusHudAxis(key, point[key]))}</output></span></label>`;
    const devices = STATUS_HUD_POSITION_DEVICES.map((id) => [id, DEVICE_LABELS[id]]);
    const atDefault = !point.x && !point.y;
    const note = `电脑和手机各存一份。窗口宽度不超过 640 像素，或竖向使用的触屏设备，按「手机」这份显示；当前设备按「${DEVICE_LABELS[currentDevice] || DEVICE_LABELS.pc}」这份显示。`;
    return `<div class="igs-settings-field igs-hud-pos" data-hud-pos="${device}">`
        + '<span>位置</span>'
        + `<div class="igs-hud-pos-head">${segmentedInput('', device, devices, '状态栏位置对应的设备', { action: 'status-hud-pos-device' })}`
        + `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="status-hud-pos-reset:${device}" data-hud-pos-reset${atDefault ? ' disabled' : ''}>回到左上角</button></div>`
        + `<div class="igs-hud-pos-stage" data-hud-pos-stage data-device="${device}" style="${vars}" aria-hidden="true"><i class="igs-hud-pos-bar"></i><i class="igs-hud-pos-dialog"></i><i class="igs-hud-pos-hud"></i></div>`
        + axis('x', '左右') + axis('y', '上下')
        + `<em>${esc(note)}</em>`
        + '</div>';
}

// 拖动中的就地预览：只改小舞台的变量和读数，「回到左上角」随位置启用 / 停用。
export function previewStatusHudPosition(input) {
    const axis = input && typeof input.getAttribute === 'function' ? input.getAttribute('data-hud-pos-axis') : '';
    const block = axis && typeof input.closest === 'function' ? input.closest('[data-hud-pos]') : null;
    if (!block || (axis !== 'x' && axis !== 'y')) return false;
    const value = normalizeStatusHudPercent(input.value);
    const stage = block.querySelector('[data-hud-pos-stage]');
    if (stage) stage.style.setProperty(`--igs-hp-${axis}`, String(value));
    const output = block.querySelector(`[data-hud-pos-value="${axis}"]`);
    if (output) output.textContent = describeStatusHudAxis(axis, value);
    const reset = block.querySelector('[data-hud-pos-reset]');
    if (reset) {
        const other = block.querySelector(`[data-hud-pos-axis="${axis === 'x' ? 'y' : 'x'}"]`);
        reset.disabled = !value && !normalizeStatusHudPercent(other ? other.value : 0);
    }
    return true;
}

// 小舞台里的工具栏 / 对话框只是参照轮廓，尺寸取默认外观的大致比例。
export const STATUS_HUD_POSITION_STYLE_TEXT = `
#igs-unified-settings .igs-hud-pos-head{display:flex;align-items:center;gap:8px;min-width:0}
#igs-unified-settings .igs-hud-pos-head>.igs-segmented{flex:1 1 auto;min-width:0}
#igs-unified-settings .igs-hud-pos-head>.igs-settings-inline-action{flex:0 0 auto}
#igs-unified-settings .igs-hud-pos-stage{position:relative;display:block;box-sizing:border-box;margin:4px auto;border:1px solid var(--igs-settings-line);border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field);overflow:hidden}
#igs-unified-settings .igs-hud-pos-stage[data-device="pc"]{width:min(100%,320px);aspect-ratio:16/9}
#igs-unified-settings .igs-hud-pos-stage[data-device="mobile"]{height:216px;aspect-ratio:390/844}
#igs-unified-settings .igs-hud-pos-stage>i{position:absolute;display:block;box-sizing:border-box;pointer-events:none}
#igs-unified-settings .igs-hud-pos-bar{top:var(--igs-hp-ey);right:var(--igs-hp-ex);width:8%;height:4.5%;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-line-strong)}
#igs-unified-settings .igs-hud-pos-stage[data-device="mobile"] .igs-hud-pos-bar{width:25%;height:3.8%}
#igs-unified-settings .igs-hud-pos-dialog{left:6%;right:6%;bottom:var(--igs-hp-ey);height:22%;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-line)}
#igs-unified-settings .igs-hud-pos-stage[data-device="mobile"] .igs-hud-pos-dialog{left:var(--igs-hp-ex);right:var(--igs-hp-ex);height:17%}
#igs-unified-settings .igs-hud-pos-hud{left:calc(var(--igs-hp-ex) + (100% - var(--igs-hp-ex) * 2) * var(--igs-hp-x) / 100);top:calc(var(--igs-hp-ey) + (100% - var(--igs-hp-ey) * 2) * var(--igs-hp-y) / 100);width:var(--igs-hp-w);height:var(--igs-hp-h);transform:translate(calc(var(--igs-hp-x) * -1%),calc(var(--igs-hp-y) * -1%));border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-accent)}
#igs-unified-settings .igs-hud-pos-hud::before{content:"";position:absolute;left:5%;top:50%;height:min(70%,24px);aspect-ratio:1;transform:translateY(-50%);border-radius:50%;background:var(--igs-settings-on-accent);opacity:.8}
#igs-unified-settings .igs-hud-pos-axis{display:flex;align-items:center;gap:10px;min-width:0}
#igs-unified-settings .igs-hud-pos-axis>span:first-child{flex:0 0 auto;color:var(--igs-settings-ink-3)}
`;
