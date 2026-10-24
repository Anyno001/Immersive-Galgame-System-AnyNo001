// 演出对立绘的轻反应：只叠 WAAPI（composite:add），不碰立绘 canvas；减少动态效果时一律不动。
import { resolveHeadAnchor, spriteElOf } from './stage-snapshot.js';

export const clampNum = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const roundTo = (n) => Math.round(n * 10) / 10;

export function lowQuality(env) {
    return Boolean(env && env.root && typeof env.root.getAttribute === 'function' && env.root.getAttribute('data-igs-quality') === 'low');
}

export function spriteShown(el) {
    return Boolean(el && el.style && el.style.backgroundImage && el.style.display !== 'none');
}

export function hasSprite(env, who) {
    return spriteShown(spriteElOf(env, who));
}

// frames 为 [{ offset, transform|filter }...]；iterations 为循环次数，低画质下只播一轮。返回动画对象或 null。
export function reactSprite(env, who, frames, { duration = 1200, iterations = 1, easing = 'ease-in-out', delay = 0 } = {}) {
    if (!env || env.reduced) return null;
    const el = spriteElOf(env, who);
    if (!spriteShown(el) || typeof el.animate !== 'function') return null;
    try {
        return el.animate(frames, { duration, iterations: lowQuality(env) ? 1 : iterations, easing, delay, composite: 'add', fill: 'none' });
    } catch {
        return null;
    }
}

export function headPoint(env, who) {
    try {
        const a = resolveHeadAnchor(env, who);
        return { x: clampNum(a.x, 6, 94), y: clampNum(a.y, 8, 80), d: clampNum(a.d, 6, 30) };
    } catch {
        return { x: 50, y: 26, d: 14 };
    }
}

export const at = (offset, transform) => ({ offset, transform });
export const atFilter = (offset, filter) => ({ offset, filter });

// 镜头轻推：舞台容器上叠一段缩放（叠加合成，结束自动还原）；减少动态效果与低画质不推。
export function pushStage(env, { scale = 1.03, duration = 2400, delay = 0, easing = 'ease-in-out' } = {}) {
    if (!env || env.reduced || lowQuality(env) || !env.root || typeof env.root.querySelector !== 'function') return null;
    const motion = env.root.querySelector('#igs-stage-motion');
    if (!motion || typeof motion.animate !== 'function') return null;
    try {
        return motion.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration, delay, easing, composite: 'add', fill: 'none' });
    } catch {
        return null;
    }
}

// 整台一次性位移：舞台容器上叠一段 transform 关键帧（叠加合成，结束自动还原）；减少动态效果与低画质不播。
export function moveStage(env, frames, { duration = 900, delay = 0, easing = 'ease-out' } = {}) {
    if (!env || env.reduced || lowQuality(env) || !env.root || typeof env.root.querySelector !== 'function') return null;
    const motion = env.root.querySelector('#igs-stage-motion');
    if (!motion || typeof motion.animate !== 'function') return null;
    try {
        return motion.animate(frames, { duration, delay, easing, composite: 'add', fill: 'none' });
    } catch {
        return null;
    }
}

// 背景一次侧向快移：走独立 translate 属性（与镜头甩镜同法），不加模糊；减少动态效果与低画质不播。
export function sweepBackground(env, sign = 1, { duration = 700, delay = 0 } = {}) {
    if (!env || env.reduced || lowQuality(env) || !env.root || typeof env.root.querySelector !== 'function') return null;
    const bg = env.root.querySelector('#igs-bg');
    if (!bg || typeof bg.animate !== 'function') return null;
    try {
        return bg.animate([{ translate: '0 0' }, { translate: `${sign * -3.5}% 0`, offset: 0.35 }, { translate: `${sign * 1}% 0`, offset: 0.75 }, { translate: '0 0' }], { duration, delay, easing: 'cubic-bezier(.6,0,.3,1)', composite: 'add', fill: 'none' });
    } catch {
        return null;
    }
}
