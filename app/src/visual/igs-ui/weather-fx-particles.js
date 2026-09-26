// 天气粒子：远景画布挂后景层（立绘之后），近景画布挂前景层（立绘之前）。
// 能耗约束：锁 30fps、画布按 CSS 像素（不乘 devicePixelRatio）、同透明度档合批绘制、
// 图层隐藏（尺寸为 0）时停止请求帧、图层脱离文档时自行退出。
const FRAME_MS = 1000 / 30;
const MAX_DT = 0.05;
const REFERENCE_AREA = 1280 * 720;
const TAU = Math.PI * 2;
const MAX_SPLASHES = 80;
const LEVEL_DENSITY = Object.freeze({ light: 0.5, medium: 1, heavy: 1.7 });
const INTENSITY_DENSITY = Object.freeze({ weak: 0.6, medium: 1, strong: 1.35 });
const BASE_COUNTS = Object.freeze({
    rain: Object.freeze({ far: 120, near: 26 }),
    snow: Object.freeze({ far: 110, near: 16 }),
    wind: Object.freeze({ far: 7, near: 7 }),
    sand: Object.freeze({ far: 160, near: 20 }),
});
const BUCKET_ALPHAS = Object.freeze({
    rain: Object.freeze({ far: [0.16, 0.24, 0.32], near: [0.22, 0.32, 0.42] }),
    snow: Object.freeze({ far: [0.45, 0.62, 0.8], near: [0.16, 0.72] }),
    wind: Object.freeze({ far: [0.05, 0.08, 0.11], near: [] }),
    sand: Object.freeze({ far: [0.18, 0.28, 0.4], near: [0.12, 0.4] }),
});

function particleColor(kind, time) {
    const night = time === 'night' || time === 'midnight';
    if (kind === 'rain') return night ? '172,192,230' : time === 'dusk' ? '214,198,212' : '198,214,234';
    if (kind === 'snow') return night ? '214,226,255' : time === 'dusk' ? '255,236,228' : '255,255,255';
    if (kind === 'sand') return night ? '150,122,92' : '216,172,112';
    return night ? '150,160,150' : '206,196,150';
}

function createEngine(plan, random) {
    const r = (min, max) => min + random() * (max - min);
    const bucket = () => Math.floor(random() * 3);
    const heavy = plan.level === 'heavy';
    const color = particleColor(plan.kind, plan.time);

    const rain = {
        spawn(s, seed) {
            const near = s.depth === 'near';
            const speed = (near ? r(1050, 1350) : r(620, 820)) * (heavy ? 1.12 : plan.level === 'light' ? 0.85 : 1);
            const len = (near ? r(26, 42) : r(11, 19)) * (heavy ? 1.15 : 1);
            const angle = (plan.wind ? 0.36 : 0.13) + r(-0.03, 0.03);
            const vx = -Math.sin(angle) * speed;
            const vy = Math.cos(angle) * speed;
            const splash = near && plan.level !== 'light';
            return {
                x: r(-0.05 * s.w, s.w * 1.05 + s.h * Math.tan(angle)),
                y: seed ? r(-len, s.h) : r(-s.h * 0.25, -len),
                vx, vy, tx: (-vx / speed) * len, ty: (-vy / speed) * len,
                ground: splash ? s.h * r(0.8, 1) : s.h + len,
                splash, bucket: bucket(),
            };
        },
        step(s, item, dt) {
            item.x += item.vx * dt;
            item.y += item.vy * dt;
            if (item.y < item.ground) return;
            if (item.splash && s.splashes.length < MAX_SPLASHES && random() < 0.7) {
                s.splashes.push({ x: item.x, y: item.ground, age: 0, life: r(0.22, 0.34), size: r(3, 7) });
            }
            Object.assign(item, rain.spawn(s, false));
        },
        draw(s) {
            const { ctx } = s;
            ctx.strokeStyle = `rgb(${color})`;
            ctx.lineWidth = s.depth === 'near' ? 1.4 : 1;
            BUCKET_ALPHAS.rain[s.depth].forEach((alpha, index) => {
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                for (const item of s.items) {
                    if (item.bucket !== index) continue;
                    ctx.moveTo(item.x, item.y);
                    ctx.lineTo(item.x + item.tx, item.y + item.ty);
                }
                ctx.stroke();
            });
            if (!s.splashes.length) return;
            ctx.lineWidth = 1;
            for (const splash of s.splashes) {
                const progress = splash.age / splash.life;
                const radius = splash.size * (0.3 + progress);
                ctx.globalAlpha = 0.45 * (1 - progress);
                ctx.beginPath();
                ctx.ellipse(splash.x, splash.y, radius, radius * 0.28, 0, 0, TAU);
                ctx.stroke();
            }
        },
    };

    const snowGust = (t) => (plan.wind ? 0.75 + 0.35 * Math.sin(t * 0.4) : 1);
    const snow = {
        spawn(s, seed) {
            const near = s.depth === 'near';
            const radius = near ? r(2.2, 3.8) : r(0.7, 1.8);
            return {
                bx: plan.wind ? r(-0.4 * s.w, s.w) : r(-0.1 * s.w, 1.1 * s.w),
                x: 0,
                y: seed ? r(-radius, s.h) : r(-s.h * 0.1, -radius * 2),
                radius,
                vy: (near ? r(55, 90) : r(26, 54)) * (heavy ? 1.15 : 1),
                drift: plan.wind ? r(70, 150) * (near ? 1.3 : 1) : r(-10, 10),
                amp: near ? r(18, 36) : r(6, 16),
                freq: r(0.25, 0.6),
                phase: r(0, TAU),
                bucket: bucket(),
            };
        },
        step(s, item, dt, t) {
            item.y += item.vy * dt;
            item.bx += item.drift * snowGust(t) * dt;
            item.x = item.bx + Math.sin(t * item.freq * TAU + item.phase) * item.amp;
            if (item.y > s.h + item.radius * 2 || item.bx > s.w * 1.2 || item.bx < -s.w * 0.45) Object.assign(item, snow.spawn(s, false));
        },
        draw(s) {
            const { ctx } = s;
            ctx.fillStyle = `rgb(${color})`;
            if (s.depth === 'far') {
                BUCKET_ALPHAS.snow.far.forEach((alpha, index) => {
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    for (const item of s.items) {
                        if (item.bucket !== index) continue;
                        ctx.moveTo(item.x + item.radius, item.y);
                        ctx.arc(item.x, item.y, item.radius, 0, TAU);
                    }
                    ctx.fill();
                });
                return;
            }
            drawSoftDots(ctx, s.items, BUCKET_ALPHAS.snow.near);
        },
    };

    const windGust = (t) => 0.8 + 0.4 * Math.sin(t * 0.5);
    const wind = {
        spawn(s, seed) {
            if (s.depth === 'far') {
                const len = r(140, 280);
                return { x: seed ? r(0, s.w) : -r(0, s.w * 0.6), y: r(0.05 * s.h, 0.9 * s.h), len, speed: r(900, 1400), vy: r(-20, 20), curve: r(-18, 18), bucket: bucket() };
            }
            return {
                x: seed ? r(0, s.w) : -r(10, s.w * 0.5), y: r(0.05 * s.h, 0.85 * s.h),
                size: r(4, 7), vx: r(260, 480), vy: r(-10, 40), rot: r(0, TAU), vr: r(-6, 6), phase: r(0, TAU), alpha: r(0.4, 0.65),
            };
        },
        step(s, item, dt, t) {
            if (s.depth === 'far') {
                item.x += item.speed * dt;
                item.y += item.vy * dt;
                if (item.x - item.len > s.w) Object.assign(item, wind.spawn(s, false));
                return;
            }
            item.x += item.vx * windGust(t) * dt;
            item.y += (item.vy + Math.sin(t * 1.8 + item.phase) * 50) * dt;
            item.rot += item.vr * dt;
            if (item.x > s.w + 20 || item.y > s.h + 20 || item.y < -40) Object.assign(item, wind.spawn(s, false));
        },
        draw(s) {
            const { ctx } = s;
            if (s.depth === 'far') {
                ctx.strokeStyle = 'rgb(232,238,242)';
                ctx.lineWidth = 1;
                BUCKET_ALPHAS.wind.far.forEach((alpha, index) => {
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    for (const item of s.items) {
                        if (item.bucket !== index) continue;
                        ctx.moveTo(item.x - item.len, item.y);
                        ctx.quadraticCurveTo(item.x - item.len / 2, item.y + item.curve, item.x, item.y);
                    }
                    ctx.stroke();
                });
                return;
            }
            ctx.fillStyle = `rgb(${color})`;
            for (const item of s.items) {
                ctx.save();
                ctx.translate(item.x, item.y);
                ctx.rotate(item.rot);
                ctx.globalAlpha = item.alpha;
                ctx.beginPath();
                ctx.ellipse(0, 0, item.size, item.size * 0.42, 0, 0, TAU);
                ctx.fill();
                ctx.restore();
            }
        },
    };

    const sandGust = (t) => 0.85 + 0.3 * Math.sin(t * 0.6);
    const sand = {
        spawn(s, seed) {
            const near = s.depth === 'near';
            return {
                x: seed ? r(0, s.w) : -r(0, s.w * 0.3), y: r(0, s.h),
                radius: near ? r(1.6, 3) : r(0.5, 1.4),
                vx: near ? r(620, 950) : r(260, 520),
                amp: r(8, 26), phase: r(0, TAU), bucket: bucket(),
            };
        },
        step(s, item, dt, t) {
            item.x += item.vx * sandGust(t) * dt;
            item.y += Math.sin(t * 2.2 + item.phase) * item.amp * dt;
            if (item.x > s.w + 6) Object.assign(item, sand.spawn(s, false));
        },
        draw(s) {
            const { ctx } = s;
            ctx.fillStyle = `rgb(${color})`;
            if (s.depth === 'near') {
                drawSoftDots(ctx, s.items, BUCKET_ALPHAS.sand.near);
                return;
            }
            BUCKET_ALPHAS.sand.far.forEach((alpha, index) => {
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                for (const item of s.items) {
                    if (item.bucket === index) ctx.rect(item.x, item.y, item.radius * 1.6, item.radius);
                }
                ctx.fill();
            });
        },
    };

    return { rain, snow, wind, sand }[plan.kind] || null;
}

// 近景颗粒：外圈淡光晕 + 实心核，两次合批填充。
function drawSoftDots(ctx, items, [haloAlpha, coreAlpha]) {
    ctx.globalAlpha = haloAlpha;
    ctx.beginPath();
    for (const item of items) {
        ctx.moveTo(item.x + item.radius * 2, item.y);
        ctx.arc(item.x, item.y, item.radius * 2, 0, TAU);
    }
    ctx.fill();
    ctx.globalAlpha = coreAlpha;
    ctx.beginPath();
    for (const item of items) {
        ctx.moveTo(item.x + item.radius, item.y);
        ctx.arc(item.x, item.y, item.radius, 0, TAU);
    }
    ctx.fill();
}

function createSurface(doc, layer, depth) {
    if (!layer || typeof layer.appendChild !== 'function') return null;
    const canvas = doc.createElement('canvas');
    const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return null;
    canvas.className = 'igs-fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    layer.appendChild(canvas);
    return { layer, canvas, ctx, depth, w: 0, h: 0, items: [], splashes: [] };
}

export function startWeatherParticles(options = {}) {
    const { back, front, plan } = options;
    const doc = back && back.ownerDocument;
    const view = doc && doc.defaultView;
    if (!plan || !view || typeof view.requestAnimationFrame !== 'function' || typeof doc.createElement !== 'function') return null;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const engine = createEngine(plan, random);
    if (!engine) return null;
    const surfaces = [createSurface(doc, back, 'far'), front ? createSurface(doc, front, 'near') : null].filter(Boolean);
    if (!surfaces.length) return null;
    const density = (LEVEL_DENSITY[plan.level] || 1) * (INTENSITY_DENSITY[options.intensity] || 1);
    const base = BASE_COUNTS[plan.kind];

    const resize = (s, w, h) => {
        s.w = w;
        s.h = h;
        const scale = Math.min(view.devicePixelRatio || 1, 1);
        s.canvas.width = Math.max(1, Math.round(w * scale));
        s.canvas.height = Math.max(1, Math.round(h * scale));
        s.ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const areaScale = Math.min(1.6, Math.max(0.45, (w * h) / REFERENCE_AREA));
        const count = w && h ? Math.round(base[s.depth] * density * areaScale) : 0;
        s.items = Array.from({ length: count }, () => engine.spawn(s, true));
        s.splashes = [];
    };
    const measure = () => {
        let visible = false;
        for (const s of surfaces) {
            const w = s.layer.clientWidth || 0;
            const h = s.layer.clientHeight || 0;
            if (w !== s.w || h !== s.h) resize(s, w, h);
            if (w && h) visible = true;
        }
        return visible;
    };

    let rafId = 0;
    let lastTime = 0;
    let clock = 0;
    let frameCount = 0;
    let stopped = false;
    const observer = typeof view.ResizeObserver === 'function'
        ? new view.ResizeObserver(() => { if (measure()) { lastTime = 0; request(); } })
        : null;

    function request() {
        if (!rafId && !stopped) rafId = view.requestAnimationFrame(frame);
    }
    function frame(now) {
        rafId = 0;
        if (stopped) return;
        if (back.isConnected === false) { stop(); return; }
        const visible = observer ? surfaces.some((s) => s.w && s.h) : (++frameCount % 30 === 0 ? measure() : true);
        // 有 ResizeObserver 时隐藏即停帧，由尺寸恢复回调重新拉起。
        if (!visible && observer) { lastTime = 0; return; }
        request();
        if (lastTime && now - lastTime < FRAME_MS - 2) return;
        const dt = lastTime ? Math.min(MAX_DT, (now - lastTime) / 1000) : 0;
        lastTime = now;
        clock += dt;
        for (const s of surfaces) {
            if (!s.w || !s.h) continue;
            for (const item of s.items) engine.step(s, item, dt, clock);
            if (s.splashes.length) {
                for (const splash of s.splashes) splash.age += dt;
                s.splashes = s.splashes.filter((splash) => splash.age < splash.life);
            }
            s.ctx.globalAlpha = 1;
            s.ctx.clearRect(0, 0, s.w, s.h);
            engine.draw(s, clock);
        }
    }
    function stop() {
        if (stopped) return;
        stopped = true;
        if (rafId && typeof view.cancelAnimationFrame === 'function') view.cancelAnimationFrame(rafId);
        rafId = 0;
        if (observer) observer.disconnect();
        for (const s of surfaces) if (s.canvas.parentNode) s.canvas.parentNode.removeChild(s.canvas);
    }

    if (observer) for (const s of surfaces) observer.observe(s.layer);
    if (measure() || !observer) request();
    return { stop };
}
