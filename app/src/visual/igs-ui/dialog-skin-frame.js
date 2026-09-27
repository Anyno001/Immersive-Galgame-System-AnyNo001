export const SKIN_DIALOG_SCALE_OPTIONS = Object.freeze([1, 0.9, 0.8, 0.7, 0.6]);
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

// 正文压在花纹上时用同底色的光晕描边托住字形，而不是把正文挤进花纹之间的空隙。
export function halo(color, blur = 4) {
    return `text-shadow:1px 0 0 ${color},-1px 0 0 ${color},0 1px 0 ${color},0 -1px 0 ${color},1px 1px 0 ${color},-1px -1px 0 ${color},1px -1px 0 ${color},-1px 1px 0 ${color},0 0 ${blur}px ${color};`;
}

// 素材/CSS 主题共用的对话框骨架：固定高度、正文安全区与悬浮姓名牌；外观由 frameCss/speakerCss 注入。
export function buildDialogFrameCss(skin, { height, text, rise, frameCss, speakerCss, textCss = '' }) {
    const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${skin}"]`;
    const padding = (top) => `padding:${sp(top)} ${sp(text.right)} ${sp(text.bottom)} ${sp(text.left)};`;
    return [
        `${scope}{box-sizing:border-box;height:${sp(height)};min-height:${sp(height)};max-height:${sp(height)};display:flex;flex-direction:column;overflow:visible;${padding(text.top)}${scalePx(frameCss)}}`,
        `${scope}[data-igs-has-speaker="1"]{${padding(text.speakerTop)}}`,
        `${scope} .igs-progress,${scope} .igs-speaker,${scope} .igs-divider,${scope} .igs-controls{flex-shrink:0;}`,
        `${scope} .igs-divider{display:none;}`,
        `${scope} .igs-text{min-height:0;margin:0;overflow-y:auto;flex:1 1 auto;text-shadow:none;${textCss}}`,
        `${scope} .igs-speaker{position:absolute;z-index:2;box-sizing:border-box;${scalePx(speakerCss)}}`,
        `#igs-overlay.igs-mode-embedded .igs-dialog[data-igs-dialog-skin="${skin}"]{height:min(${sp(height)},calc(100% - 28px));min-height:min(${sp(height)},calc(100% - 28px));max-height:calc(100% - 28px);}`,
        `#igs-overlay[data-igs-dialog-skin="${skin}"]{--igs-skin-plate-rise:${sp(rise)};}`,
    ].join('\n');
}
