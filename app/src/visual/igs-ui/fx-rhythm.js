// 演出节奏规格：各演出模块共用的命名时长与缓动，避免每个模块各写一套手感。
// impact：瞬间冲击（推近回弹）；enter：中速入场（与视差 .6s 同手感）；ambient：慢速氛围（与立绘位移 1.2s 同手感）。
// 新演出优先取这里的规格；既有模块迁移时必须保持原时长与缓动不变。
export const FX_RHYTHM = Object.freeze({
    impact: Object.freeze({ duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' }),
    enter: Object.freeze({ duration: 600, easing: 'cubic-bezier(.2,.7,.3,1)' }),
    ambient: Object.freeze({ duration: 1200, easing: 'cubic-bezier(.3,.7,.2,1)' }),
});

export function fxRhythm(name) {
    return Object.hasOwn(FX_RHYTHM, name) ? FX_RHYTHM[name] : FX_RHYTHM.enter;
}
