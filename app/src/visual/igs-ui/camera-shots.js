import { onStageIdleChange } from './stage-pause.js';

const text = (value) => String(value == null ? '' : value).trim();

const DIR = (cam) => (cam.target === 'left' ? 'left' : 'right');

export const HAND_PERIOD_MS = 2400;
export const WHIP_MS = 350;

// AI 镜头指令 [igs-fx:cam|…] 落到本页的镜头；返回值写进 data-igs-sd-cam。
// 特写写了别的角色、特写 / 拉远 / 虚化 / 升降 / 变焦时本页没有立绘都不推；摇镜、跟拍、甩镜在减少动态效果时不播，虚化在低画质档不做；主观与空镜不要求立绘。
export function resolveCameraShot(cam, { speakers = [], spriteUrl = '', reduced = false, lowQuality = false } = {}) {
    const shot = cam && typeof cam === 'object' ? text(cam.shot) : '';
    if (!shot || shot === 'reset') return '';
    if (shot === 'pan') return reduced ? '' : `pan-${DIR(cam)}`;
    if (shot === 'track' || shot === 'whip') return reduced ? '' : `${shot}-${DIR(cam)}`;
    if (shot === 'tilt') return 'tilt';
    if (shot === 'pov' || shot === 'empty' || shot === 'slow') return shot;
    if (!spriteUrl) return '';
    if (shot === 'focus') return lowQuality ? '' : (cam.target === 'front' ? 'focus-front' : 'focus');
    if (shot === 'vertigo') return `vertigo-${cam.target === 'near' ? 'near' : 'far'}`;
    if (shot === 'sink' || shot === 'rise' || shot === 'lookup') return shot;
    if (shot === 'closeup' && text(cam.target) && !speakers.map(text).includes(text(cam.target))) return '';
    return shot === 'closeup' || shot === 'wide' ? shot : '';
}

// 修饰词：手持晃动在低画质与减少动态效果下关；慢只改过渡与黑边，各档都可用。
export function resolveCameraMod(cam, { reduced = false, lowQuality = false } = {}) {
    const mod = cam && typeof cam === 'object' ? text(cam.mod) : '';
    if (mod === 'slow') return 'slow';
    if (mod === 'hand') return reduced || lowQuality ? '' : 'hand';
    return '';
}

function animate(el, frames, options) {
    if (!el || typeof el.animate !== 'function') return null;
    try { return el.animate(frames, options); } catch { return null; }
}

export const HAND_FRAMES = Object.freeze([
    { translate: '0 0', rotate: '0deg' },
    { translate: '3px -2px', rotate: '0.4deg' },
    { translate: '-2px 3px', rotate: '-0.3deg' },
    { translate: '2px 1px', rotate: '0.25deg' },
    { translate: '0 0', rotate: '0deg' },
]);

// 手持晃动与甩镜走 WAAPI 叠加（composite:add），不占用背景 / 立绘已有的 transform、animation 与 CSS 变量。
export function playCameraExtras(state, root, { key = '', shot = '', mod = '', lowQuality = false, newPage = false } = {}) {
    if (!state.camAnims) state.camAnims = new Set();
    const camKey = `${key}|${shot}|${mod}`;
    if (state.camKey === camKey) return [];
    for (const anim of state.camAnims) {
        try { anim.cancel(); } catch { /* 已结束 */ }
    }
    state.camAnims.clear();
    state.camOffIdle?.();
    state.camOffIdle = null;
    state.camKey = camKey;
    const played = [];
    if (!root || typeof root.querySelector !== 'function') return played;
    const bg = root.querySelector('#igs-bg');
    const sprite = root.querySelector('#igs-sprite');
    const keep = (anim, name) => {
        if (!anim) return;
        state.camAnims.add(anim);
        played.push(name);
    };
    if (mod === 'hand') {
        const options = { duration: HAND_PERIOD_MS, iterations: Infinity, easing: 'ease-in-out', composite: 'add' };
        keep(animate(bg, HAND_FRAMES, options), 'camera:hand-bg');
        keep(animate(sprite, HAND_FRAMES, options), 'camera:hand-sprite');
        // 无限循环的 WAAPI 不吃 CSS 暂停：舞台静置 / 暂停时跟着停，恢复时接着晃。
        if (state.camAnims.size) state.camOffIdle = onStageIdleChange(bg, (idle) => {
            for (const anim of state.camAnims) {
                try { if (idle) anim.pause(); else anim.play(); } catch { /* 已结束 */ }
            }
        });
    }
    if (newPage && shot.startsWith('whip-')) {
        const sign = shot.endsWith('left') ? 1 : -1;
        const frames = [
            { translate: `${sign * -6}% 0`, filter: lowQuality ? 'none' : 'blur(10px)' },
            { translate: `${sign * 5}% 0`, filter: lowQuality ? 'none' : 'blur(6px)', offset: 0.7 },
            { translate: '0 0', filter: 'none' },
        ];
        keep(animate(bg, frames, { duration: WHIP_MS, easing: 'cubic-bezier(.7,0,.2,1)', composite: 'add', fill: 'none' }), 'camera:whip-bg');
        const trail = [{ translate: `${sign * 2}% 0` }, { translate: `${sign * -1}% 0`, offset: 0.7 }, { translate: '0 0' }];
        keep(animate(sprite, trail, { duration: WHIP_MS + 120, easing: 'ease-out', composite: 'add', fill: 'none' }), 'camera:whip-sprite');
    }
    return played;
}

export function cancelCameraExtras(state) {
    if (!state || !state.camAnims) return;
    for (const anim of state.camAnims) {
        try { anim.cancel(); } catch { /* 已结束 */ }
    }
    state.camAnims.clear();
    state.camOffIdle?.();
    state.camOffIdle = null;
    state.camKey = '';
}
