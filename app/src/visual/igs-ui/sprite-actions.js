// 立绘小动作：说话人（#igs-sprite）与陪衬（.igs-cast-sprite）共用。
// 一律 composite:'add' 叠加，与 CSS 呼吸动画同时作用在 transform 上而不互相覆盖；返回动画对象，由调用方负责取消。
export const SPRITE_ACTION_FRAMES = Object.freeze({
    hop: { duration: 720, easing: 'ease-out', frames: ['translate(0,0)', 'translate(0,-2.4%)', 'translate(0,0)', 'translate(0,-1.4%)', 'translate(0,0)'] },
    recoil: { duration: 560, easing: 'cubic-bezier(.2,.8,.3,1)', frames: ['translate(0,0) rotate(0deg)', 'translate(0,-0.8%) rotate(-1.6deg) scale(.985)', 'translate(0,0) rotate(0deg)'] },
    sink: { duration: 760, easing: 'cubic-bezier(.3,.6,.3,1)', frames: ['translate(0,0)', 'translate(0,1.8%)'], fill: 'forwards' },
    sway: { duration: 1300, easing: 'ease-in-out', frames: ['rotate(0deg)', 'rotate(-1.6deg)', 'rotate(1.5deg)', 'rotate(-0.8deg)', 'rotate(0deg)'] },
    lunge: { duration: 460, easing: 'cubic-bezier(.3,.9,.3,1)', frames: ['translate(0,0) scale(1)', 'translate(0,1%) scale(1.045)', 'translate(0,0) scale(1)'] },
    nod: { duration: 700, easing: 'ease-in-out', frames: ['translate(0,0)', 'translate(0,0.9%)', 'translate(0,0)', 'translate(0,0.55%)', 'translate(0,0)'] },
    shake: { duration: 700, easing: 'ease-in-out', frames: ['rotate(0deg)', 'rotate(-1.2deg)', 'rotate(1.2deg)', 'rotate(-0.6deg)', 'rotate(0deg)'] },
    tremble: {
        duration: 520,
        easing: 'linear',
        frames: ['translate(0,0)', 'translate(0.3%,0)', 'translate(-0.3%,0)', 'translate(0.3%,0)', 'translate(-0.3%,0)', 'translate(0.3%,0)', 'translate(-0.3%,0)', 'translate(0,0)'],
    },
    retreat: { duration: 620, easing: 'ease-out', frames: ['translate(0,0) scale(1)', 'translate(0,0.6%) scale(.97)', 'translate(0,0) scale(1)'] },
});

export const SPEAK_BOUNCE = Object.freeze({ duration: 280, easing: 'ease-out', frames: ['translate(0,0)', 'translate(0,-1.1%)', 'translate(0,0)'] });

// 按帧规格播放；减少动态效果、元素不支持 WAAPI 或播放抛错时返回 null。
export function playSpriteSpec(el, spec, { reduced = false } = {}) {
    if (!el || !spec || reduced || typeof el.animate !== 'function') return null;
    try {
        return el.animate(spec.frames.map((transform) => ({ transform })), {
            duration: spec.duration, easing: spec.easing, composite: 'add', fill: spec.fill || 'none',
        });
    } catch {
        return null;
    }
}

export function playSpriteAction(el, kind, options) {
    return playSpriteSpec(el, SPRITE_ACTION_FRAMES[kind], options);
}
