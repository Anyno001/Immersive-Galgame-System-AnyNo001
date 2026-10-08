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
export function buildDialogFrameCss(skin, { height, text, rise, frameCss, speakerCss, textCss = '', flush = false, autoHeight = false }) {
    const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${skin}"]`;
    const embeddedMax = flush ? '100%' : 'calc(100% - 28px)';
    const padding = (top) => `padding:${sp(top)} ${sp(text.right)} ${sp(text.bottom)} ${sp(text.left)};`;
    return [
        `${scope}{box-sizing:border-box;height:${sp(height)};min-height:${sp(height)};max-height:${sp(height)};display:flex;flex-direction:column;overflow:visible;${padding(text.top)}${scalePx(frameCss)}}`,
        `${scope}[data-igs-has-speaker="1"]{${padding(text.speakerTop)}}`,
        `${scope} .igs-progress,${scope} .igs-speaker,${scope} .igs-divider,${scope} .igs-controls{flex-shrink:0;}`,
        `${scope} .igs-divider{display:none;}`,
        `${scope} .igs-text{min-height:0;margin:0;overflow-y:auto;flex:1 1 auto;text-shadow:none;${textCss}}`,
        `${scope} .igs-speaker{position:absolute;z-index:2;box-sizing:border-box;${scalePx(speakerCss)}}`,
        `#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${skin}"]{height:min(${sp(height)},${embeddedMax});min-height:min(${sp(height)},${embeddedMax});max-height:${embeddedMax};}`,
        `#igs-overlay[data-igs-dialog-skin="${skin}"]{--igs-skin-plate-rise:${sp(rise)};}`,
        // 高度自适应（开关在设置里，只开放给边框只拉伸左右的主题）：字少压矮到六成，字多不超过原高度、超出照旧滚动。
        ...(autoHeight ? [`${scope}[data-igs-auto-h]{height:auto;min-height:min(${sp(Math.round(height * 0.6))},${embeddedMax});max-height:min(${sp(height)},${embeddedMax});}`] : []),
        ...(flush ? [
            `${scope},#igs-overlay.igs-floating .igs-dialog[data-igs-dialog-skin="${skin}"],#igs-overlay.igs-floating-mobile .igs-dialog[data-igs-dialog-skin="${skin}"],#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${skin}"]{left:0;right:0;bottom:0;width:auto;margin:0;transform:none;}`,
            `${scope}.igs-hidden{transform:translateY(20px);}`,
        ] : []),
    ].join('\n');
}

// 三片素材预先横向拼成一张图，用 border-image 一次绘制：分三层背景时各层独立取整，缩放后接缝会漏缝或叠出亮线。
// slice 是素材原始像素中的两端宽度，left/right 是渲染宽度；高度随框拉伸，框被压矮时不会裁掉底边。
// border 简写会重置 border-image，调用方不得在其后再写 border。
export function threeSliceCss(image, [sliceLeft, sliceRight], left, right) {
    return `background:none;border:0 solid transparent;border-image:url("${image}") 0 ${sliceRight} 0 ${sliceLeft} fill / 0 ${right}px 0 ${left}px / 0 stretch;`;
}
