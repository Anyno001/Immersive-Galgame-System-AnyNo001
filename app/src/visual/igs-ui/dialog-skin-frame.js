export const SKIN_DIALOG_SCALE_OPTIONS = Object.freeze([1.3, 1.2, 1.1, 1, 0.9, 0.8, 0.7, 0.6]);
export const SKIN_DIALOG_SCALE_DEFAULT = 1;

export function normalizeSkinDialogScale(value) {
    const numeric = Number(value);
    return SKIN_DIALOG_SCALE_OPTIONS.includes(numeric) ? numeric : SKIN_DIALOG_SCALE_DEFAULT;
}

// 主题几何统一乘 --igs-skin-scale：降低高度时花纹等比缩小而不变形，中段照常横向伸缩。
export function sp(value) {
    return `calc(${value}px * var(--igs-skin-scale,1))`;
}

// 字号不跟随缩放：框变矮时姓名仍需保持可读。
export function scalePx(css) {
    return css.replace(/(^|[^\w.#-])(-?\d+(?:\.\d+)?)px/g, (match, lead, value, offset, source) => (
        source.slice(Math.max(0, offset - 9), offset + lead.length) === 'font-size:' ? match : `${lead}${sp(value)}`
    ));
}

// 正文压在花纹上时用同底色的 1px 实描边托住字形，而不是把正文挤进花纹之间的空隙。
// 不叠模糊光晕：光晕会让字边发虚、框内文字朦胧。第二个参数保留只为兼容旧调用。
export function halo(color) {
    return `text-shadow:${stroke(color)};`;
}

// 八向 1px 实描边（不含 text-shadow 属性名），可再拼接投影。
export function stroke(color) {
    return `1px 0 0 ${color},-1px 0 0 ${color},0 1px 0 ${color},0 -1px 0 ${color},1px 1px 0 ${color},-1px -1px 0 ${color},1px -1px 0 ${color},-1px 1px 0 ${color}`;
}

// 素材/CSS 主题共用的对话框骨架：固定高度、正文安全区与悬浮姓名牌；外观由 frameCss/speakerCss 注入。
// flush 主题是横贯画面的通栏，全部阅读模式都贴合阅读器左右与底边，不按卡片留边距。
export function buildDialogFrameCss(skin, { height, text, rise, frameCss, speakerCss, textCss = '', flush = false, autoHeight = true, mobilePlate = 0.82 }) {
    const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${skin}"]`;
    const embeddedMax = flush ? '100%' : 'calc(100% - 28px)';
    const padding = (top) => `padding:${sp(top)} ${sp(text.right)} ${sp(text.bottom)} ${sp(text.left)};`;
    return [
        `${scope}{box-sizing:border-box;height:${sp(height)};min-height:${sp(height)};max-height:${sp(height)};display:flex;flex-direction:column;overflow:visible;${padding(text.top)}${scalePx(frameCss)}}`,
        `${scope}[data-igs-has-speaker="1"]{${padding(text.speakerTop)}}`,
        `${scope} .igs-progress,${scope} .igs-speaker,${scope} .igs-divider,${scope} .igs-controls{flex-shrink:0;}`,
        `${scope} .igs-divider{display:none;}`,
        `${scope} .igs-text{min-height:0;margin:0;overflow-y:auto;flex:1 1 auto;text-shadow:none;${textCss}}`,
        // 姓名牌字体多是只有一个字重的展示字体：禁止浏览器硬描粗/硬斜，没有粗体就用原字重，避免笔画糊成一团。
        `${scope} .igs-speaker{position:absolute;z-index:2;box-sizing:border-box;font-synthesis:none;${scalePx(speakerCss)}}`,
        `#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${skin}"]{height:min(${sp(height)},${embeddedMax});min-height:min(${sp(height)},${embeddedMax});max-height:${embeddedMax};}`,
        `#igs-overlay[data-igs-dialog-skin="${skin}"]{--igs-skin-plate-rise:${sp(rise)};}`,
        // 高度自适应（开关在设置里，全部主题共用）：字少压矮到六成，字多不超过原高度、超出照旧滚动。
        ...(autoHeight ? [`${scope}[data-igs-auto-h]{height:auto;min-height:min(${sp(Math.round(height * 0.6))},${embeddedMax});max-height:min(${sp(height)},${embeddedMax});}`] : []),
        // 手机窄屏姓名牌整体缩小（zoom 连同位置偏移一起缩，贴边关系不变）；自带窄屏几何的主题传 1。
        ...(mobilePlate !== 1 ? [`@media (max-width:640px){${scope} .igs-speaker{zoom:${mobilePlate};}}`] : []),
        ...(flush ? [
            `${scope},#igs-overlay.igs-floating .igs-dialog[data-igs-dialog-skin="${skin}"],#igs-overlay.igs-floating-mobile .igs-dialog[data-igs-dialog-skin="${skin}"],#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${skin}"]{left:0;right:0;bottom:0;width:auto;margin:0;transform:none;}`,
            `${scope}.igs-hidden{transform:translateY(20px);}`,
        ] : []),
    ].join('\n');
}

// 三片素材预先横向拼成一张图，用 border-image 一次绘制：分三层背景时各层独立取整，缩放后接缝会漏缝或叠出亮线。
// slice 是素材原始像素中的两端宽度，left/right 是渲染宽度；高度随框拉伸，框被压矮时不会裁掉底边。
// border 简写会重置 border-image，调用方不得在其后再写 border。
// factor：两端宽度再乘的系数（CSS 值）。对话框本体传 var(--igs-slice-k,1)，框高偏离设计高（自适应压矮、内嵌封顶、长文本撑高）时两端随实际高度等比缩放，不被纵向拉伸。
export function threeSliceCss(image, [sliceLeft, sliceRight], left, right, factor = '') {
    const w = (value) => (factor ? `calc(${value}px * ${factor})` : `${value}px`);
    return `background:none;border:0 solid transparent;border-image:url("${image}") 0 ${sliceRight} 0 ${sliceLeft} fill / 0 ${w(right)} 0 ${w(left)} / 0 stretch;`;
}

// 九宫格素材：花纹整块落在四角切片内，框拉高拉宽时只伸缩直边与纸面，花纹不变形也不随框变大。
// slice 为素材像素（上右下左），width 为渲染宽，outset 为探出边框的距离；都写成 px 交给 scalePx 统一缩放。
export function nineSliceCss(image, { slice, width, outset }) {
    const list = (values) => values.map((v) => `${v}px`).join(' ');
    return `background:none;border:0 solid transparent;border-image:url("${image}") ${slice.join(' ')} fill / ${list(width)} / ${list(outset)} stretch;`;
}

function px(value) {
    return `${value}px`;
}

// 两端系数相关变量：三片素材写设计高与两端宽之和；九宫格写 0，watchSliceScale 据此恒取 1。
function dialogFrameCss(dialog, assets) {
    if (dialog.nine) return `--igs-slice-h:0;--igs-slice-w:0;${nineSliceCss(assets[dialog.nine.asset], dialog.nine)}`;
    return `--igs-slice-h:${dialog.height};--igs-slice-w:${dialog.left + dialog.right};${threeSliceCss(assets.dialog, dialog.slice, dialog.left, dialog.right, 'var(--igs-slice-k,1)')}`;
}

export function buildSlicedDialogSkinCss(skin, spec, assets, { mobilePlate } = {}) {
    const { dialog, text, plate } = spec;
    return buildDialogFrameCss(skin, {
        height: dialog.height,
        text,
        rise: Math.max(plate.rise, dialog.nine ? dialog.nine.outset[0] : 0),
        frameCss: `${dialogFrameCss(dialog, assets)}border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:${px(plate.x)};top:${px(-plate.rise)};width:max-content;min-width:${px(plate.minWidth)};max-width:calc(100% - ${px(plate.x * 2)});height:${px(plate.height)};line-height:${px(plate.lineHeight)};margin:0;padding:${plate.padding};${threeSliceCss(assets.name, plate.slice, plate.left, plate.right)}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${spec.nameCss || ''}`,
        textCss: spec.textCss || '',
        autoHeight: true,
        mobilePlate,
    });
}
