// 日常粒子：烟花 / 孔明灯演出（一次性）与飘落花瓣/落叶（常驻氛围）。
// 能耗约束同天气粒子：锁 30fps（低画质档 20fps、密度减半、dprCap 1）、合批绘制、图层隐藏停帧、脱离文档自行退出。
import { prefersReducedMotion } from './reduced-motion.js';
import { resolveWeatherFxTime } from './weather-fx-runtime.js';
import { getQualityFactor } from './render-quality.js';
import { isStageIdle, onStageResume } from './stage-pause.js';

const FPS = 30;
const MAX_DT = 0.05;
const TAU = Math.PI * 2;
const ALPHA_BUCKETS = Object.freeze([0.3, 0.62, 1]);
const FLASH_S = 0.2;
const REDUCED_HOLD_MS = 350;
const REDUCED_FADE_MS = 600;

export const FIREWORK_PALETTES = Object.freeze({
    gold: Object.freeze(['255,212,118', '255,238,176', '255,176,72']),
    pink: Object.freeze(['255,136,190', '255,194,222', '255,96,158']),
    cyan: Object.freeze(['108,228,255', '184,246,255', '72,186,255']),
    violet: Object.freeze(['188,138,255', '222,194,255', '150,98,255']),
    green: Object.freeze(['128,255,160', '204,255,194', '80,222,132']),
});
export const BURST_TYPES = Object.freeze(['peony', 'willow', 'ring']);
const PALETTE_NAMES = Object.keys(FIREWORK_PALETTES);
const SPARK_PROFILE = Object.freeze({
    peony: { speed: 240, drag: 1.5, gravity: 1, life: [1.1, 1.7], trail: 4 },
    willow: { speed: 175, drag: 2.1, gravity: 0.5, life: [2.3, 3.1], trail: 14 },
    ring: { speed: 215, drag: 1.5, gravity: 0.9, life: [1.2, 1.6], trail: 3 },
});

const rangeOf = (random) => (min, max) => min + random() * (max - min);

function pickType(random) {
    const roll = random();
    return roll < 0.5 ? 'peony' : roll < 0.75 ? 'willow' : 'ring';
}

export function createBurst(options = {}) {
    const { x = 0, y = 0, scale = 1 } = options;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const r = rangeOf(random);
    const type = BURST_TYPES.includes(options.type) ? options.type : pickType(random);
    const palette = FIREWORK_PALETTES[options.palette]
        ? options.palette
        : type === 'willow' && random() < 0.6 ? 'gold' : PALETTE_NAMES[Math.floor(random() * PALETTE_NAMES.length)];
    const colors = FIREWORK_PALETTES[palette];
    const baseTotal = Number.isFinite(options.count) ? options.count : 60 + Math.floor(random() * 61);
    const total = Math.max(1, Math.round(baseTotal * (Number.isFinite(options.density) ? options.density : 1)));
    const profile = SPARK_PROFILE[type];
    const tilt = r(0.45, 1);
    const spin = r(0, TAU);
    const cosSpin = Math.cos(spin);
    const sinSpin = Math.sin(spin);
    const sparks = [];
    for (let i = 0; i < total; i += 1) {
        let angle;
        let speed;
        if (type === 'ring') {
            angle = (i / total) * TAU;
            speed = profile.speed * r(0.97, 1.03);
        } else {
            angle = r(0, TAU);
            // 牡丹多数火花落在外壳上，少量填充内部，避免均匀一团。
            speed = profile.speed * (random() < 0.8 ? r(0.82, 1) : r(0.3, 0.8));
        }
        speed *= scale;
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;
        if (type === 'ring') {
            vy *= tilt;
            [vx, vy] = [vx * cosSpin - vy * sinSpin, vx * sinSpin + vy * cosSpin];
        }
        sparks.push({
            x, y, vx, vy,
            age: 0,
            life: r(profile.life[0], profile.life[1]),
            drag: profile.drag,
            gravity: profile.gravity,
            colorIndex: Math.floor(random() * colors.length),
            alpha: 1,
            trail: [],
            trailMax: profile.trail,
        });
    }
    return {
        x, y, type, palette, colors,
        styles: colors.map((rgb) => `rgb(${rgb})`),
        color: `rgb(${colors[0]})`,
        sparks,
        flash: FLASH_S,
    };
}

export function stepSparks(sparks, dt, options = {}) {
    const gravity = Number.isFinite(options.gravity) ? options.gravity : 110;
    let alive = 0;
    for (let i = 0; i < sparks.length; i += 1) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.life) continue;
        if (s.trailMax) {
            s.trail.push(s.x, s.y);
            if (s.trail.length > s.trailMax * 2) s.trail.splice(0, 2);
        }
        const damp = Math.exp(-s.drag * dt);
        s.vx *= damp;
        s.vy = s.vy * damp + gravity * s.gravity * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.alpha = Math.min(1, (1 - s.age / s.life) * 1.6);
        sparks[alive] = s;
        alive += 1;
    }
    sparks.length = alive;
    return sparks;
}

export function planShow(options = {}) {
    const { width = 0, height = 0 } = options;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const r = rangeOf(random);
    const count = Math.max(1, Math.round(Number.isFinite(options.count) ? options.count : 5));
    const spread = ((Number.isFinite(options.duration) ? options.duration : 5000) / 1000) * 0.62;
    const plan = [];
    for (let i = 0; i < count; i += 1) {
        const x0 = r(0.15, 0.85) * width;
        plan.push({
            index: i,
            at: Math.max(0, (count > 1 ? (i / (count - 1)) * spread : 0) + r(-0.12, 0.12)),
            x0,
            tx: Math.min(width * 0.92, Math.max(width * 0.08, x0 + r(-0.08, 0.08) * width)),
            ty: r(0.14, 0.42) * height,
            rise: r(0.9, 1.3),
            phase: r(0, TAU),
        });
    }
    return plan.sort((a, b) => a.at - b.at);
}

function bucketOf(alpha) {
    return alpha > 0.66 ? 2 : alpha > 0.33 ? 1 : 0;
}

function traceSpark(ctx, s) {
    const t = s.trail;
    if (t.length) {
        ctx.moveTo(t[0], t[1]);
        for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k], t[k + 1]);
        ctx.lineTo(s.x, s.y);
    } else {
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + 0.1, s.y);
    }
}

// 每个 (透明度档, 颜色) 一条路径，先粗淡描一遍作辉光，再细亮描核心。
function drawSparkGroups(ctx, sparks, styles, scale) {
    for (let b = 0; b < ALPHA_BUCKETS.length; b += 1) {
        for (let c = 0; c < styles.length; c += 1) {
            let any = false;
            ctx.beginPath();
            for (const s of sparks) {
                if (s.colorIndex !== c || bucketOf(s.alpha) !== b) continue;
                any = true;
                traceSpark(ctx, s);
            }
            if (!any) continue;
            ctx.strokeStyle = styles[c];
            ctx.globalAlpha = ALPHA_BUCKETS[b] * 0.22;
            ctx.lineWidth = 3.4 * scale;
            ctx.stroke();
            ctx.globalAlpha = ALPHA_BUCKETS[b];
            ctx.lineWidth = 1.3 * scale;
            ctx.stroke();
        }
    }
}

function drawBurst(ctx, burst, scale) {
    if (burst.flash > 0) {
        const k = burst.flash / FLASH_S;
        ctx.globalAlpha = 0.45 * k;
        ctx.fillStyle = burst.styles[1] || burst.color;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, 30 * scale * (1.4 - 0.4 * k), 0, TAU);
        ctx.fill();
    }
    drawSparkGroups(ctx, burst.sparks, burst.styles, scale);
}

const EMBER_STYLES = Object.freeze(['rgb(255,206,140)']);

function drawRockets(ctx, rockets, scale) {
    if (!rockets.length) return;
    ctx.strokeStyle = 'rgb(255,222,170)';
    ctx.lineWidth = 1.6 * scale;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    for (const rocket of rockets) {
        const t = rocket.trail;
        if (t.length < 2) continue;
        ctx.moveTo(t[0], t[1]);
        for (let k = 2; k < t.length; k += 2) ctx.lineTo(t[k], t[k + 1]);
        ctx.lineTo(rocket.x, rocket.y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgb(255,246,220)';
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (const rocket of rockets) {
        ctx.moveTo(rocket.x + 2 * scale, rocket.y);
        ctx.arc(rocket.x, rocket.y, 2 * scale, 0, TAU);
    }
    ctx.fill();
}

function environmentOf(layer, options) {
    if (!layer || typeof layer.appendChild !== 'function') return null;
    const doc = layer.ownerDocument || globalThis.document;
    if (!doc || typeof doc.createElement !== 'function') return null;
    const view = doc.defaultView || null;
    const raf = typeof options.raf === 'function'
        ? options.raf
        : view && typeof view.requestAnimationFrame === 'function' ? view.requestAnimationFrame.bind(view) : null;
    if (!raf) return null;
    const cancel = typeof options.cancelRaf === 'function'
        ? options.cancelRaf
        : view && typeof view.cancelAnimationFrame === 'function' ? view.cancelAnimationFrame.bind(view) : () => {};
    const now = typeof options.now === 'function' ? options.now : null;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    return { doc, view, raf, cancel, now, random };
}

function mountCanvas(env, layer, className) {
    const canvas = env.doc.createElement('canvas');
    const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return null;
    canvas.className = className;
    if (typeof canvas.setAttribute === 'function') canvas.setAttribute('aria-hidden', 'true');
    const style = canvas.style;
    if (style) {
        style.position = 'absolute';
        style.inset = '0';
        style.left = '0';
        style.top = '0';
        style.width = '100%';
        style.height = '100%';
        style.pointerEvents = 'none';
    }
    layer.appendChild(canvas);
    return { canvas, ctx, w: 0, h: 0 };
}

function frameMsOf(quality) {
    return 1000 / Math.min(FPS, quality.fps ?? FPS);
}

function dprCapOf(quality, cap) {
    return Math.min(cap, quality.dprCap ?? cap);
}

function sizeSurface(env, surface, layer, dprCap) {
    const w = layer.clientWidth || 0;
    const h = layer.clientHeight || 0;
    if (w === surface.w && h === surface.h) return false;
    surface.w = w;
    surface.h = h;
    const scale = Math.max(0.5, Math.min((env.view && env.view.devicePixelRatio) || 1, dprCap));
    surface.canvas.width = Math.max(1, Math.round(w * scale));
    surface.canvas.height = Math.max(1, Math.round(h * scale));
    surface.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    return true;
}

function unmount(surface) {
    const parent = surface && surface.canvas.parentNode;
    if (parent && typeof parent.removeChild === 'function') parent.removeChild(surface.canvas);
}

function safeCall(fn, ...args) {
    if (typeof fn !== 'function') return;
    try {
        fn(...args);
    } catch {
        // 集成方回调出错不应打断演出。
    }
}

export function startFireworks(layer, options = {}) {
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const inert = () => {
        resolveDone({ completed: false });
        return { stop() {}, done };
    };
    const env = environmentOf(layer, options);
    if (!env) return inert();
    const surface = mountCanvas(env, layer, 'igs-fx-fireworks-canvas');
    if (!surface) return inert();
    const quality = getQualityFactor();
    sizeSurface(env, surface, layer, dprCapOf(quality, 2));
    if (!surface.w || !surface.h) {
        unmount(surface);
        return inert();
    }
    const { ctx } = surface;
    const random = env.random;
    const scale = Math.min(1.6, Math.max(0.6, Math.min(surface.w, surface.h) / 720));
    const count = Math.max(1, Math.round(Number.isFinite(options.count) ? options.count : 5));
    const reduced = typeof options.reducedMotion === 'boolean' ? options.reducedMotion : prefersReducedMotion();

    let rafId = 0;
    let finished = false;
    let lastTime = 0;
    let startTime = 0;
    let clock = 0;
    let nextLaunch = 0;
    const plan = reduced ? [] : planShow({ count, width: surface.w, height: surface.h, random, duration: options.duration });
    const safetyS = (plan.length ? plan[plan.length - 1].at : 0) + 6;
    const rockets = [];
    const embers = [];
    const bursts = [];

    const observer = env.view && typeof env.view.ResizeObserver === 'function'
        ? new env.view.ResizeObserver(() => sizeSurface(env, surface, layer, dprCapOf(quality, 2)))
        : null;
    if (observer) observer.observe(layer);

    function finish(completed) {
        if (finished) return;
        finished = true;
        if (rafId) env.cancel(rafId);
        rafId = 0;
        if (observer) observer.disconnect();
        unmount(surface);
        resolveDone({ completed });
    }
    function request() {
        if (!rafId && !finished) rafId = env.raf(frame);
    }
    function paint() {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, surface.w, surface.h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        drawRockets(ctx, rockets, scale);
        drawSparkGroups(ctx, embers, EMBER_STYLES, scale * 0.7);
        for (const burst of bursts) drawBurst(ctx, burst, scale);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }
    function launch(shot) {
        rockets.push({ ...shot, age: 0, x: shot.x0, y: surface.h + 4, trail: [] });
        safeCall(options.onLaunch, shot.index);
    }
    function explode(rocket) {
        const burst = createBurst({ x: rocket.x, y: rocket.y, random, scale, density: quality.density });
        bursts.push(burst);
        safeCall(options.onBurst, rocket.index, {
            x: burst.x, y: burst.y, rx: burst.x / surface.w, ry: burst.y / surface.h,
            color: burst.color, palette: burst.palette, type: burst.type,
        });
    }
    function stepShow(dt) {
        while (nextLaunch < plan.length && plan[nextLaunch].at <= clock) {
            launch(plan[nextLaunch]);
            nextLaunch += 1;
        }
        for (let i = rockets.length - 1; i >= 0; i -= 1) {
            const rocket = rockets[i];
            rocket.age += dt;
            rocket.trail.push(rocket.x, rocket.y);
            if (rocket.trail.length > 12) rocket.trail.splice(0, 2);
            const p = Math.min(1, rocket.age / rocket.rise);
            const eased = 1 - (1 - p) * (1 - p);
            const wobble = Math.sin(rocket.age * 16 + rocket.phase) * 1.6 * scale * (1 - p);
            rocket.x = rocket.x0 + (rocket.tx - rocket.x0) * eased + wobble;
            rocket.y = surface.h + 4 + (rocket.ty - surface.h - 4) * eased;
            if (dt > 0 && random() < 0.6) {
                embers.push({
                    x: rocket.x, y: rocket.y, vx: (random() - 0.5) * 30 * scale, vy: 20 * scale,
                    age: 0, life: 0.3 + random() * 0.25, drag: 3, gravity: 1, colorIndex: 0, alpha: 1, trail: [], trailMax: 0,
                });
            }
            if (p >= 1) {
                rockets.splice(i, 1);
                explode(rocket);
            }
        }
        stepSparks(embers, dt, { gravity: 60 * scale });
        for (let i = bursts.length - 1; i >= 0; i -= 1) {
            const burst = bursts[i];
            burst.flash = Math.max(0, burst.flash - dt);
            stepSparks(burst.sparks, dt, { gravity: 110 * scale });
            if (!burst.sparks.length && !burst.flash) bursts.splice(i, 1);
        }
    }
    function frame(ts) {
        rafId = 0;
        if (finished) return;
        if (layer.isConnected === false) { finish(false); return; }
        const t = env.now ? env.now() : ts;
        if (reduced) {
            if (!startTime) startTime = t;
            const elapsed = t - startTime;
            if (surface.canvas.style) surface.canvas.style.opacity = String(Math.max(0, Math.min(1, 1 - (elapsed - REDUCED_HOLD_MS) / REDUCED_FADE_MS)));
            if (elapsed >= REDUCED_HOLD_MS + REDUCED_FADE_MS) { finish(true); return; }
            request();
            return;
        }
        request();
        if (lastTime && t - lastTime < frameMsOf(quality) - 2) return;
        const dt = lastTime ? Math.min(MAX_DT, (t - lastTime) / 1000) : 0;
        lastTime = t;
        clock += dt;
        stepShow(dt);
        if (!surface.w || !surface.h) return;
        paint();
        const idle = nextLaunch >= plan.length && !rockets.length && !bursts.length && !embers.length;
        if (idle || clock > safetyS) finish(true);
    }

    if (reduced) {
        // 减少动态：只画一帧静态绽放，短暂停留后淡出，不触发发射/爆炸回调（避免闪屏）。
        const n = Math.min(3, count);
        for (let i = 0; i < n; i += 1) {
            const burst = createBurst({ x: surface.w * ((i + 1) / (n + 1)), y: surface.h * (0.28 + 0.06 * (i % 2)), random, scale, type: 'peony' });
            burst.flash = 0;
            for (let k = 0; k < 7; k += 1) stepSparks(burst.sparks, 0.05, { gravity: 110 * scale });
            bursts.push(burst);
        }
        paint();
        if (env.now) startTime = env.now() || 0.001;
    }
    request();
    return { stop: () => finish(false), done };
}

// 孔明灯（古代背景替代烟花）：暖橙纸灯从天空层下部错落放飞，缓缓上升、轻摆、烛光微闪，升到高处淡出。
// 生命周期与 startFireworks 相同：返回 { stop, done }，放飞时回调 onLaunch(index)，减少动态时只画静态几盏并快速淡出。
export function planLanterns(options = {}) {
    const { width = 0, height = 0 } = options;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const r = rangeOf(random);
    const count = Math.max(1, Math.round(Number.isFinite(options.count) ? options.count : 7));
    const total = (Number.isFinite(options.duration) ? options.duration : 5600) / 1000;
    const spread = total * 0.36;
    // 横向分槽后打乱，避免从左到右依次升起或挤成一团。
    const slots = Array.from({ length: count }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const plan = [];
    for (let i = 0; i < count; i += 1) {
        plan.push({
            index: i,
            at: Math.max(0, (count > 1 ? (i / (count - 1)) * spread : 0) + r(-0.1, 0.1)),
            life: total * r(0.58, 0.68),
            x0: (0.1 + 0.8 * ((slots[i] + r(0.2, 0.8)) / count)) * width,
            y0: r(0.66, 0.86) * height,
            rise: r(0.4, 0.55) * height,
            size: r(0.78, 1.18),
            drift: r(-10, 10),
            sway: r(5, 11),
            swayFreq: r(0.22, 0.4),
            phase: r(0, TAU),
        });
    }
    return plan.sort((a, b) => a.at - b.at);
}

function withStops(gradient, stops, fallback) {
    if (!gradient || typeof gradient.addColorStop !== 'function') return fallback;
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    return gradient;
}

// 由升空进度推出一盏灯当前帧的位置、倾角、尺寸、透明度与烛光强度。
function lanternPose(l, scale) {
    const p = Math.min(1, l.age / l.life);
    const fadeIn = Math.min(1, l.age / 0.7);
    const fadeOut = p > 0.55 ? Math.max(0, 1 - (p - 0.55) / 0.45) : 1;
    const flicker = 0.86 + 0.08 * Math.sin(l.age * 9.3 + l.phase) + 0.05 * Math.sin(l.age * 21.7 + l.phase * 2) + l.jitter;
    return {
        x: l.x0 + l.drift * l.age + Math.sin(l.age * l.swayFreq * TAU + l.phase) * l.sway * scale,
        y: l.y0 - l.rise * (p * 0.4 + p * p * 0.6),
        tilt: Math.cos(l.age * l.swayFreq * TAU + l.phase) * 0.07,
        k: l.size * scale * (1 - 0.32 * p),
        alpha: fadeIn * fadeOut * fadeOut,
        flicker: Math.max(0.6, Math.min(1.05, flicker)),
    };
}

function drawLantern(ctx, pose) {
    const { x, y, k, alpha, flicker } = pose;
    if (alpha <= 0.01 || k <= 0) return;
    const H = 44 * k;
    const wt = 32 * k;
    const wb = 22 * k;
    // 外层辉光：叠加混合，随烛光明暗呼吸。
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * flicker;
    ctx.fillStyle = withStops(ctx.createRadialGradient(x, y + H * 0.1, 0, x, y + H * 0.1, H * 2.2), [
        [0, 'rgba(255,176,86,0.42)'], [0.35, 'rgba(255,132,50,0.16)'], [1, 'rgba(255,110,40,0)'],
    ], 'rgba(255,150,70,0.12)');
    ctx.beginPath();
    ctx.arc(x, y + H * 0.1, H * 2.2, 0, TAU);
    ctx.fill();
    // 灯身：上宽下窄的纸罩，顶部微拱，底口透出烛光。
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pose.tilt);
    ctx.fillStyle = withStops(ctx.createLinearGradient(0, -H / 2, 0, H / 2), [
        [0, 'rgb(196,72,30)'], [0.45, `rgb(236,${Math.round(118 + 26 * flicker)},52)`], [1, `rgb(255,${Math.round(196 + 30 * flicker)},128)`],
    ], 'rgb(232,128,56)');
    ctx.beginPath();
    ctx.moveTo(-wt / 2, -H / 2);
    ctx.quadraticCurveTo(0, -H / 2 - H * 0.2, wt / 2, -H / 2);
    ctx.lineTo(wb / 2, H / 2);
    ctx.quadraticCurveTo(0, H / 2 + H * 0.07, -wb / 2, H / 2);
    ctx.closePath();
    ctx.fill();
    // 竹骨与纸缝：几道淡褐细线。
    ctx.globalAlpha = alpha * 0.22;
    ctx.strokeStyle = 'rgb(110,36,16)';
    ctx.lineWidth = Math.max(0.6, 0.8 * k);
    ctx.beginPath();
    for (const f of [-0.28, 0, 0.28]) {
        ctx.moveTo(f * wt, -H / 2 - (f ? H * 0.12 : H * 0.2));
        ctx.lineTo(f * wb, H / 2);
    }
    ctx.moveTo(-wt * 0.46, -H * 0.12);
    ctx.lineTo(wt * 0.46, -H * 0.12);
    ctx.stroke();
    // 底口烛火。
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * flicker;
    ctx.fillStyle = 'rgb(255,236,176)';
    ctx.beginPath();
    ctx.ellipse(0, H / 2 - 1.5 * k, 3.4 * k * flicker, 2.2 * k, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
}

export function startLanterns(layer, options = {}) {
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const inert = () => {
        resolveDone({ completed: false });
        return { stop() {}, done };
    };
    const env = environmentOf(layer, options);
    if (!env) return inert();
    const surface = mountCanvas(env, layer, 'igs-fx-lanterns-canvas');
    if (!surface) return inert();
    const quality = getQualityFactor();
    sizeSurface(env, surface, layer, dprCapOf(quality, 2));
    if (!surface.w || !surface.h) {
        unmount(surface);
        return inert();
    }
    const { ctx } = surface;
    const random = env.random;
    const scale = Math.min(1.6, Math.max(0.6, Math.min(surface.w, surface.h) / 720));
    const count = Math.max(1, Math.round((Number.isFinite(options.count) ? options.count : 7) * quality.density));
    const reduced = typeof options.reducedMotion === 'boolean' ? options.reducedMotion : prefersReducedMotion();

    let rafId = 0;
    let finished = false;
    let lastTime = 0;
    let startTime = 0;
    let clock = 0;
    let nextLaunch = 0;
    const plan = reduced ? [] : planLanterns({ count, width: surface.w, height: surface.h, random, duration: options.duration });
    const safetyS = plan.reduce((max, l) => Math.max(max, l.at + l.life), 0) + 2;
    const lanterns = [];

    const observer = env.view && typeof env.view.ResizeObserver === 'function'
        ? new env.view.ResizeObserver(() => sizeSurface(env, surface, layer, dprCapOf(quality, 2)))
        : null;
    if (observer) observer.observe(layer);

    function finish(completed) {
        if (finished) return;
        finished = true;
        if (rafId) env.cancel(rafId);
        rafId = 0;
        if (observer) observer.disconnect();
        unmount(surface);
        resolveDone({ completed });
    }
    function request() {
        if (!rafId && !finished) rafId = env.raf(frame);
    }
    function paint() {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, surface.w, surface.h);
        for (const l of lanterns) drawLantern(ctx, lanternPose(l, scale));
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }
    function frame(ts) {
        rafId = 0;
        if (finished) return;
        if (layer.isConnected === false) { finish(false); return; }
        const t = env.now ? env.now() : ts;
        if (reduced) {
            if (!startTime) startTime = t;
            const elapsed = t - startTime;
            if (surface.canvas.style) surface.canvas.style.opacity = String(Math.max(0, Math.min(1, 1 - (elapsed - REDUCED_HOLD_MS) / REDUCED_FADE_MS)));
            if (elapsed >= REDUCED_HOLD_MS + REDUCED_FADE_MS) { finish(true); return; }
            request();
            return;
        }
        request();
        if (lastTime && t - lastTime < frameMsOf(quality) - 2) return;
        const dt = lastTime ? Math.min(MAX_DT, (t - lastTime) / 1000) : 0;
        lastTime = t;
        clock += dt;
        while (nextLaunch < plan.length && plan[nextLaunch].at <= clock) {
            lanterns.push({ ...plan[nextLaunch], age: 0, jitter: 0 });
            safeCall(options.onLaunch, plan[nextLaunch].index);
            nextLaunch += 1;
        }
        for (let i = lanterns.length - 1; i >= 0; i -= 1) {
            const l = lanterns[i];
            l.age += dt;
            l.jitter = (random() - 0.5) * 0.06;
            if (l.age >= l.life) lanterns.splice(i, 1);
        }
        if (!surface.w || !surface.h) return;
        paint();
        if ((nextLaunch >= plan.length && !lanterns.length) || clock > safetyS) finish(true);
    }

    if (reduced) {
        // 减少动态：几盏灯静止悬在半空，短暂停留后淡出，不触发放飞回调（不出声）。
        const n = Math.min(4, count);
        for (let i = 0; i < n; i += 1) {
            lanterns.push({
                x0: surface.w * ((i + 1) / (n + 1)), y0: surface.h * (0.36 + 0.08 * (i % 2)), rise: 0, life: 10, age: 1.2,
                size: 1, drift: 0, sway: 0, swayFreq: 0, phase: 0, jitter: 0,
            });
        }
        paint();
        if (env.now) startTime = env.now() || 0.001;
    }
    request();
    return { stop: () => finish(false), done };
}

const PETAL_BASE_COUNT = Object.freeze({ light: 18, medium: 28 });
const PETAL_REF_AREA = 800 * 600;
const PETAL_KINDS = Object.freeze({
    sakura: Object.freeze({
        colors: ['255,198,215', '255,178,202', '255,224,234'],
        back: ['238,160,188', '232,146,176', '244,196,212'],
        size: [7, 11], fall: [22, 42], drift: [18, 40], flip: [1.6, 3.2], spin: [-1.2, 1.2],
        sway: [14, 30], swayFreq: [0.18, 0.36], alpha: 0.88, countScale: 1,
    }),
    leaves: Object.freeze({
        colors: ['232,122,48', '200,70,42', '240,170,58', '176,64,36'],
        back: ['196,98,40', '164,56,36', '206,140,48', '140,50,30'],
        size: [11, 17], fall: [40, 68], drift: [14, 30], flip: [0.7, 1.5], spin: [-0.6, 0.6],
        sway: [10, 22], swayFreq: [0.1, 0.22], alpha: 0.92, countScale: 0.7,
    }),
});
export const PETAL_KIND_NAMES = Object.freeze(Object.keys(PETAL_KINDS));

function normalizeWind(value) {
    if (value === 'left') return -0.7;
    if (value === 'right') return 0.7;
    if (value === 'none') return 0;
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(-1.5, Math.min(1.5, n)) : 0.6;
}

function spawnPetal(config, w, h, wind, random, seed) {
    const r = rangeOf(random);
    const size = r(config.size[0], config.size[1]);
    const xMin = wind > 0 ? -0.25 : -0.05;
    const xMax = wind < 0 ? 1.25 : 1.05;
    return {
        x: seed ? r(-0.05, 1.05) * w : r(xMin, xMax) * w,
        y: seed ? r(-0.1, 1) * h : -size * 2 - r(0, 0.15) * h,
        size,
        fall: r(config.fall[0], config.fall[1]),
        drift: r(config.drift[0], config.drift[1]),
        flip: r(0, TAU),
        flipSpeed: r(config.flip[0], config.flip[1]),
        rot: r(0, TAU),
        spin: r(config.spin[0], config.spin[1]),
        sway: r(config.sway[0], config.sway[1]),
        swayFreq: r(config.swayFreq[0], config.swayFreq[1]),
        swayPhase: r(0, TAU),
        colorIndex: Math.floor(random() * config.colors.length),
    };
}

// 翻转用 scaleX = cos(phase) 模拟 3D 翻面；逐点做变换，才能把同色花瓣并进一条路径。
function tracePetalShape(ctx, p, leaf) {
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    let sx = Math.cos(p.flip);
    if (Math.abs(sx) < 0.12) sx = sx < 0 ? -0.12 : 0.12;
    const X = (lx, ly) => p.x + lx * sx * c - ly * s;
    const Y = (lx, ly) => p.y + lx * sx * s + ly * c;
    const L = p.size;
    if (leaf) {
        const W = L * 0.62;
        ctx.moveTo(X(0, -L / 2), Y(0, -L / 2));
        ctx.bezierCurveTo(X(W / 2, -L / 4), Y(W / 2, -L / 4), X(W / 2, L / 4), Y(W / 2, L / 4), X(0, L / 2), Y(0, L / 2));
        ctx.bezierCurveTo(X(-W / 2, L / 4), Y(-W / 2, L / 4), X(-W / 2, -L / 4), Y(-W / 2, -L / 4), X(0, -L / 2), Y(0, -L / 2));
        ctx.closePath();
        return;
    }
    const W = L * 0.9;
    ctx.moveTo(X(0, 0.5 * L), Y(0, 0.5 * L));
    ctx.bezierCurveTo(X(-0.55 * W, 0.25 * L), Y(-0.55 * W, 0.25 * L), X(-0.6 * W, -0.35 * L), Y(-0.6 * W, -0.35 * L), X(-0.18 * W, -0.5 * L), Y(-0.18 * W, -0.5 * L));
    ctx.lineTo(X(0, -0.36 * L), Y(0, -0.36 * L));
    ctx.lineTo(X(0.18 * W, -0.5 * L), Y(0.18 * W, -0.5 * L));
    ctx.bezierCurveTo(X(0.6 * W, -0.35 * L), Y(0.6 * W, -0.35 * L), X(0.55 * W, 0.25 * L), Y(0.55 * W, 0.25 * L), X(0, 0.5 * L), Y(0, 0.5 * L));
    ctx.closePath();
}

function traceLeafRib(ctx, p) {
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    const L = p.size;
    ctx.moveTo(p.x + 0.45 * L * s, p.y - 0.45 * L * c);
    ctx.lineTo(p.x - 0.62 * L * s, p.y + 0.62 * L * c);
}

export function startPetals(layer, options = {}) {
    const noop = { stop() {}, setKind() {} };
    const reduced = typeof options.reducedMotion === 'boolean' ? options.reducedMotion : prefersReducedMotion();
    if (reduced) return noop;
    const env = environmentOf(layer, options);
    if (!env) return noop;
    const surface = mountCanvas(env, layer, 'igs-fx-petals-canvas');
    if (!surface) return noop;
    const { ctx } = surface;
    const { doc, view, random } = env;
    const wind = normalizeWind(options.wind);
    const baseCount = PETAL_BASE_COUNT[options.density] || PETAL_BASE_COUNT.light;
    const period = resolveWeatherFxTime(options.time);
    const dim = period === 'night' || period === 'midnight' ? 0.7 : 1;
    let kind = PETAL_KINDS[options.kind] ? options.kind : options.kind === undefined ? 'sakura' : '';
    let items = [];
    let quality = getQualityFactor();

    const populate = () => {
        const config = PETAL_KINDS[kind];
        if (!config || !surface.w || !surface.h) { items = []; return; }
        const areaScale = Math.min(2.2, Math.max(0.4, (surface.w * surface.h) / PETAL_REF_AREA));
        const total = Math.round(baseCount * config.countScale * quality.density * areaScale);
        items = Array.from({ length: total }, () => spawnPetal(config, surface.w, surface.h, wind, random, true));
    };
    const measure = () => {
        if (sizeSurface(env, surface, layer, dprCapOf(quality, 1))) populate();
        return Boolean(surface.w && surface.h);
    };

    let rafId = 0;
    let lastTime = 0;
    let clock = 0;
    let frameCount = 0;
    let stopped = false;
    const observer = view && typeof view.ResizeObserver === 'function'
        ? new view.ResizeObserver(() => { if (measure()) { lastTime = 0; request(); } })
        : null;
    const onVisibility = () => {
        lastTime = 0;
        if (!doc.hidden) request();
    };

    function request() {
        if (!rafId && !stopped && kind && !doc.hidden && !isStageIdle(layer)) rafId = env.raf(frame);
    }
    function step(config, dt) {
        const { w, h } = surface;
        for (let i = 0; i < items.length; i += 1) {
            const p = items[i];
            p.y += p.fall * dt;
            p.x += (wind * p.drift + Math.sin(clock * p.swayFreq * TAU + p.swayPhase) * p.sway) * dt;
            p.flip += p.flipSpeed * dt;
            p.rot += p.spin * dt;
            const margin = p.size * 3;
            const out = p.y > h + margin
                || (wind >= 0 && p.x > w + margin)
                || (wind <= 0 && p.x < -margin);
            if (out) items[i] = spawnPetal(config, w, h, wind, random, false);
        }
    }
    function draw(config) {
        const leaf = kind === 'leaves';
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, surface.w, surface.h);
        ctx.globalAlpha = config.alpha * dim;
        for (let side = 0; side < 2; side += 1) {
            const palette = side ? config.back : config.colors;
            for (let c = 0; c < palette.length; c += 1) {
                let any = false;
                ctx.beginPath();
                for (const p of items) {
                    if (p.colorIndex !== c || (Math.cos(p.flip) < 0 ? 1 : 0) !== side) continue;
                    any = true;
                    tracePetalShape(ctx, p, leaf);
                }
                if (!any) continue;
                ctx.fillStyle = `rgb(${palette[c]})`;
                ctx.fill();
            }
        }
        if (leaf && items.length) {
            ctx.globalAlpha = 0.35 * dim;
            ctx.strokeStyle = 'rgb(96,40,22)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            for (const p of items) traceLeafRib(ctx, p);
            ctx.stroke();
        }
    }
    function frame(ts) {
        rafId = 0;
        if (stopped) return;
        if (layer.isConnected === false) { stop(); return; }
        const config = PETAL_KINDS[kind];
        if (!config || doc.hidden) { lastTime = 0; return; }
        const visible = observer ? Boolean(surface.w && surface.h) : (++frameCount % 30 === 0 ? measure() : true);
        if (!visible && observer) { lastTime = 0; return; }
        request();
        const q = getQualityFactor();
        if (q !== quality) {
            quality = q;
            populate();
        }
        const t = env.now ? env.now() : ts;
        if (lastTime && t - lastTime < frameMsOf(quality) - 2) return;
        const dt = lastTime ? Math.min(MAX_DT, (t - lastTime) / 1000) : 0;
        lastTime = t;
        clock += dt;
        if (!surface.w || !surface.h) return;
        step(config, dt);
        draw(config);
    }
    function stop() {
        if (stopped) return;
        stopped = true;
        if (rafId) env.cancel(rafId);
        rafId = 0;
        if (observer) observer.disconnect();
        if (typeof doc.removeEventListener === 'function') doc.removeEventListener('visibilitychange', onVisibility);
        offResume();
        unmount(surface);
        items = [];
    }
    function setKind(next) {
        if (stopped) return;
        const normalized = PETAL_KINDS[next] ? next : '';
        if (normalized === kind) return;
        kind = normalized;
        populate();
        lastTime = 0;
        if (!kind) {
            ctx.globalAlpha = 1;
            ctx.clearRect(0, 0, surface.w, surface.h);
            return;
        }
        request();
    }

    if (observer) observer.observe(layer);
    if (typeof doc.addEventListener === 'function') doc.addEventListener('visibilitychange', onVisibility);
    const offResume = onStageResume(layer, onVisibility);
    if (measure() || !observer) request();
    return { stop, setKind };
}

const SAKURA_WORDS = Object.freeze(['樱', '春', '花见', 'sakura', 'spring', 'cherry blossom']);
const LEAF_WORDS = Object.freeze(['秋', '枫', '红叶', '落叶', 'autumn', 'maple', 'fall foliage']);
// 「青春」「秋叶原」只是字面含春/秋，不代表季节。
const FALSE_FRIENDS = /青春|秋叶原|秋葉原/g;

const textOfValue = (value) => (value === null || value === undefined ? '' : String(value)).toLowerCase();

export function resolvePetalKind(options = {}) {
    const weather = textOfValue(options.weather);
    if (/樱吹雪|花吹雪/.test(weather)) return 'sakura';
    if (/雨|雪|rain|snow|storm/.test(weather)) return '';
    const text = [options.location, options.time, options.season, options.weather]
        .map(textOfValue)
        .join(' ')
        .replace(FALSE_FRIENDS, '');
    if (!text.trim()) return '';
    if (SAKURA_WORDS.some((word) => text.includes(word))) return 'sakura';
    if (LEAF_WORDS.some((word) => text.includes(word))) return 'leaves';
    return '';
}
