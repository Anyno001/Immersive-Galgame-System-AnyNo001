import { busInput } from './audio-bus.js';

// 亲密声画的合成音色：全部现场合成，走 sfx 子总线（跟随房间混响），自带一路本地音量，便于顶点瞬间静音。
// 吱呀 = 摩擦「咬住—滑开」的脉冲串（锯齿波）经过几个窄带共振；频率随受力滑动，往返两声音高不同。
const CREAK = Object.freeze({
    wood: Object.freeze({ f0: [38, 62], bands: Object.freeze([430, 800]), q: 11, dur: 0.24, gain: 0.12, grain: 0.012 }),
    metal: Object.freeze({ f0: [90, 140], bands: Object.freeze([1150, 1950, 2800]), q: 22, dur: 0.15, gain: 0.06, grain: 0.006 }),
    leather: Object.freeze({ f0: [170, 240], bands: Object.freeze([900, 1600]), q: 9, dur: 0.1, gain: 0.055, grain: 0.008 }),
    sofa: Object.freeze({ f0: [30, 42], bands: Object.freeze([260, 520]), q: 7, dur: 0.2, gain: 0.1, grain: 0.008, thud: 0.06 }),
});
const FLOOR = 0.0001;

let noiseCache = null;

function noiseBuffer(ctx) {
    if (noiseCache && noiseCache.ctx === ctx) return noiseCache.buffer;
    const rate = ctx.sampleRate || 44100;
    const buffer = ctx.createBuffer(1, rate, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache = { ctx, buffer };
    return buffer;
}

export function createIntimateVoice(volume = 0.5) {
    const output = busInput('sfx');
    if (!output || !output.context) return null;
    const ctx = output.context;
    let master;
    try {
        master = ctx.createGain();
        master.gain.value = volume;
        master.connect(output);
    } catch {
        return null;
    }
    const live = new Set();
    let level = volume;
    let tinnitus = null;

    function track(source, nodes) {
        live.add(source);
        source.onended = () => {
            live.delete(source);
            for (const node of nodes) {
                try { node.disconnect(); } catch { /* ignore */ }
            }
        };
    }

    function envelope(t, peak, attack, duration) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + attack);
        gain.gain.exponentialRampToValueAtTime(FLOOR, t + duration);
        return gain;
    }

    function panned(node, pan) {
        if (!pan || typeof ctx.createStereoPanner !== 'function') {
            node.connect(master);
            return [];
        }
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        node.connect(panner);
        panner.connect(master);
        return [panner];
    }

    function tone(t, wave, from, to, duration, peak, { attack = 0.004, pan = 0, lowpass = 0 } = {}) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.setValueAtTime(from, t);
        if (from !== to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
        const gain = envelope(t, peak, attack, duration);
        const nodes = [osc, gain];
        if (lowpass) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = lowpass;
            osc.connect(filter);
            filter.connect(gain);
            nodes.push(filter);
        } else {
            osc.connect(gain);
        }
        nodes.push(...panned(gain, pan));
        track(osc, nodes);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    function noise(t, type, from, to, q, duration, peak, { attack = 0.004, pan = 0, lowpass = 0 } = {}) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx);
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(from, t);
        if (from !== to) filter.frequency.exponentialRampToValueAtTime(to, t + duration);
        const gain = envelope(t, peak, attack, duration);
        src.connect(filter);
        const nodes = [src, filter, gain];
        if (lowpass) {
            const soft = ctx.createBiquadFilter();
            soft.type = 'lowpass';
            soft.frequency.value = lowpass;
            filter.connect(soft);
            soft.connect(gain);
            nodes.push(soft);
        } else {
            filter.connect(gain);
        }
        nodes.push(...panned(gain, pan));
        track(src, nodes);
        src.start(t, Math.random() * 0.5);
        src.stop(t + duration + 0.02);
    }

    function safe(fn) {
        return (...args) => {
            try { fn(...args); } catch { /* 节点创建失败时这一下不出声 */ }
        };
    }

    // 闷在胸腔里的心跳：低频正弦下滑 + 低通噪声，第二下更轻。
    const heartbeat = safe((t, { bpm = 72, gain = 1 } = {}) => {
        const gap = Math.min(0.26, (0.32 * 60) / Math.max(40, bpm));
        for (const [at, k] of [[t, 1], [t + gap, 0.62]]) {
            tone(at, 'sine', 58, 38, 0.16, 0.3 * gain * k, { attack: 0.012 });
            noise(at, 'lowpass', 150, 90, 0.7, 0.09, 0.1 * gain * k, { attack: 0.004 });
        }
    });

    // 呼吸：带通噪声，吸气时滤波上扫、呼气时下扫。lowpass 压低时像捂着嘴（独处）。
    const breath = safe((t, { inhale = true, duration = 1, gain = 1, pan = 0, lowpass = 2400 } = {}) => {
        const [from, to] = inhale ? [650, 1300] : [1200, 560];
        noise(t, 'bandpass', from, to, 0.9, duration, 0.04 * gain, { attack: duration * (inhale ? 0.55 : 0.3), pan, lowpass });
    });

    // 独处的节律：被褥、床单的摩擦，只有沙沙声，没有床架的吱呀与闷响。
    const rustle = safe((t, velocity = 0.6) => {
        const length = 0.14 + Math.random() * 0.1;
        noise(t, 'bandpass', 1700 + Math.random() * 500, 1200, 0.8, length, 0.022 * velocity, { attack: length * 0.4, pan: (Math.random() - 0.5) * 0.3, lowpass: 3200 });
    });

    // 外面的动静（独处时怕被发现）：都放在偏右、隔着门的位置，低通让它听起来在门外。
    const outside = safe((kind, t, gain = 1) => {
        if (kind === 'steps') {
            [0.6, 0.75, 0.9, 1].forEach((k, i) => {
                const at = t + i * (0.46 + Math.random() * 0.06);
                noise(at, 'lowpass', 320, 160, 0.7, 0.09, 0.05 * k * gain, { attack: 0.004, pan: 0.55 });
                tone(at, 'sine', 72, 50, 0.08, 0.03 * k * gain, { attack: 0.004, pan: 0.55, lowpass: 200 });
            });
        } else if (kind === 'knock') {
            for (let i = 0; i < 3; i++) {
                const at = t + i * 0.24;
                tone(at, 'sine', 120, 70, 0.1, 0.09 * gain, { attack: 0.003, pan: 0.5, lowpass: 420 });
                noise(at, 'lowpass', 700, 420, 0.8, 0.04, 0.05 * gain, { attack: 0.002, pan: 0.5 });
            }
        } else if (kind === 'phone') {
            for (const at of [t, t + 0.62]) tone(at, 'square', 150, 148, 0.38, 0.03 * gain, { attack: 0.02, pan: 0.3, lowpass: 380 });
        } else if (kind === 'door') {
            noise(t, 'bandpass', 2600, 2400, 4, 0.03, 0.05 * gain, { attack: 0.001, pan: 0.5 });
            noise(t + 0.06, 'bandpass', 1900, 1700, 5, 0.025, 0.035 * gain, { attack: 0.001, pan: 0.5 });
            // 门轴：轻轻一声吱呀（creak 在下面定义，调用时已就绪）。
            creak(t + 0.2, { material: 'metal', velocity: 0.4 * gain, down: false, duration: 0.4 });
        }
    });

    // 布料窸窣：几下短促的高频噪声，间隔随机。
    const cloth = safe((t, gain = 1) => {
        let at = t;
        for (let i = 0; i < 3; i++) {
            const duration = 0.03 + Math.random() * 0.04;
            noise(at, 'bandpass', 3600 + Math.random() * 1400, 2600, 0.7, duration, (0.02 + Math.random() * 0.02) * gain, { attack: 0.006, pan: (Math.random() - 0.5) * 0.4 });
            at += duration + 0.02 + Math.random() * 0.07;
        }
    });

    function pulseTrain(t, spec, { velocity, down, duration, variant }) {
        const [lo, hi] = spec.f0;
        const [from, to] = down ? [lo, hi] : [hi * 0.92, lo * 1.05];
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(from * variant, t);
        osc.frequency.exponentialRampToValueAtTime(to * variant, t + duration);
        const peak = spec.gain * velocity * (down ? 1 : 0.6);
        const gain = envelope(t, peak, 0.025, duration);
        const nodes = [osc, gain];
        for (const band of spec.bands) {
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.Q.value = spec.q;
            const f = band * variant;
            filter.frequency.setValueAtTime(down ? f * 0.94 : f * 1.08, t);
            filter.frequency.exponentialRampToValueAtTime(down ? f * 1.08 : f * 0.94, t + duration);
            osc.connect(filter);
            filter.connect(gain);
            nodes.push(filter);
        }
        nodes.push(...panned(gain, 0));
        track(osc, nodes);
        osc.start(t);
        osc.stop(t + duration + 0.02);
    }

    // 床的吱呀：down 为下压（主声），否则为回弹（更轻、音高反向）。被褥 / 野外没有吱呀，只剩布料摩擦与闷响。
    const creak = safe((t, { material = 'wood', velocity = 0.8, down = true, duration } = {}) => {
        if (material === 'futon') {
            noise(t, 'bandpass', 1900, 1300, 0.8, 0.18, 0.03 * velocity, { attack: 0.03, lowpass: 3000 });
            if (down) tone(t, 'sine', 90, 58, 0.09, 0.04 * velocity, { attack: 0.004 });
            return;
        }
        const spec = CREAK[material] || CREAK.wood;
        const length = Math.max(0.06, Math.min(spec.dur, duration || spec.dur));
        const variant = 0.95 + Math.random() * 0.1;
        pulseTrain(t, spec, { velocity, down, duration: length, variant });
        noise(t, 'bandpass', 1500 * variant, 1300 * variant, 2, length, spec.grain * velocity, { attack: 0.02 });
        if (spec.thud && down) tone(t, 'sine', 70, 50, 0.12, spec.thud * velocity, { attack: 0.004, lowpass: 240 });
    });

    // 脱衣：布料顺着身体滑下（带通噪声由高往低扫，两层错开），最后衣物落地一声闷软的轻响。
    const undress = safe((t, gain = 1) => {
        noise(t, 'bandpass', 2800, 900, 1.1, 0.75, 0.03 * gain, { attack: 0.18, pan: -0.15, lowpass: 4200 });
        noise(t + 0.12, 'bandpass', 3600, 1400, 1.4, 0.5, 0.016 * gain, { attack: 0.1, pan: 0.2 });
        noise(t + 0.82, 'lowpass', 420, 180, 0.7, 0.2, 0.03 * gain, { attack: 0.01 });
        tone(t + 0.82, 'sine', 105, 66, 0.14, 0.022 * gain, { attack: 0.006, lowpass: 260 });
    });

    const spring = safe((t, gain = 1) => {
        tone(t, 'sine', 1850, 1790, 0.18, 0.025 * gain, { attack: 0.002 });
        tone(t, 'sine', 2620, 2560, 0.12, 0.012 * gain, { attack: 0.002 });
    });

    const knock = safe((t, gain = 1) => {
        tone(t, 'sine', 80, 48, 0.13, 0.1 * gain, { attack: 0.006, lowpass: 300 });
        noise(t, 'lowpass', 420, 300, 0.7, 0.05, 0.035 * gain, { attack: 0.002 });
    });

    const tick = safe((t, tock = false, gain = 1) => {
        noise(t, 'bandpass', tock ? 2600 : 3200, tock ? 2500 : 3100, 5, 0.025, 0.05 * gain, { attack: 0.001 });
        tone(t, 'sine', tock ? 1700 : 2100, tock ? 1650 : 2050, 0.018, 0.02 * gain, { attack: 0.001 });
    });

    // 耳鸣：两个相差很小的高频正弦慢慢浮起，拍频让它有点发颤；顶点时和其他声音一起被切断。
    const startTinnitus = safe((t, rise = 6, gain = 1) => {
        if (tinnitus) return;
        const out = ctx.createGain();
        out.gain.setValueAtTime(0, t);
        out.gain.linearRampToValueAtTime(0.01 * gain, t + rise);
        out.connect(master);
        const oscs = [7100, 7260].map((f) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = f;
            osc.connect(out);
            osc.start(t);
            return osc;
        });
        tinnitus = { out, oscs };
    });

    function stopTinnitus(t = ctx.currentTime, fade = 0.4) {
        if (!tinnitus) return;
        const { out, oscs } = tinnitus;
        tinnitus = null;
        try {
            out.gain.cancelScheduledValues(t);
            out.gain.setTargetAtTime(0, t, fade / 3);
            for (const osc of oscs) {
                osc.stop(t + fade + 0.05);
                osc.onended = () => { try { osc.disconnect(); out.disconnect(); } catch { /* ignore */ } };
            }
        } catch { /* ignore */ }
    }

    function stopAll() {
        stopTinnitus(ctx.currentTime, 0.02);
        for (const source of [...live]) {
            try { source.stop(); } catch { /* 尚未开始或已停 */ }
        }
    }

    // 顶点：本地音量瞬间收到 0、已排程的声音全部掐掉；restoreAt 之后慢慢回来。
    function silence(t, restoreAt) {
        stopAll();
        try {
            master.gain.cancelScheduledValues(t);
            master.gain.setTargetAtTime(0, t, 0.01);
            if (restoreAt > t) master.gain.setTargetAtTime(level, restoreAt, 0.5);
        } catch { /* ignore */ }
    }

    function setVolume(value) {
        level = value;
        try { master.gain.setTargetAtTime(value, ctx.currentTime, 0.1); } catch { /* ignore */ }
    }

    function dispose(fade = 0.35) {
        const t = ctx.currentTime;
        stopTinnitus(t, fade);
        try {
            master.gain.cancelScheduledValues(t);
            master.gain.setTargetAtTime(0, t, fade / 3);
        } catch { /* ignore */ }
        setTimeout(() => {
            for (const source of [...live]) {
                try { source.stop(); } catch { /* ignore */ }
            }
            try { master.disconnect(); } catch { /* ignore */ }
        }, (fade + 0.1) * 1000);
    }

    return {
        ctx, heartbeat, breath, rustle, outside, cloth, undress, creak, spring, knock, tick, startTinnitus, stopTinnitus, silence, setVolume, stopAll, dispose,
        get tinnitusOn() { return Boolean(tinnitus); },
    };
}
