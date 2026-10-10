// 校园环境音：教室、图书馆、操场三个常驻图层的合成。全部用滤波噪声与带非谐泛音的短音，不依赖音频文件。
// 合成原语（makeNoise / noiseBurst / blip 等）留在 scene-audio.js 里，由它在登记 VOICES 时传进来，这里只负责「怎么响」。
// 约定与其他环境音一致：包络起音后衰减到 FLOOR（不 ramp 到 0），一次性短音用完由原语断开，音高 / 声像 / 间隔都随机，单个峰值 0.01~0.09。
export function createCampusVoices(h) {
    const { rand, chain, makeNoise, makeFilter, makeGain, makeLfo, layerLater, noiseBurst, blip, footsteps, FLOOR } = h;

    // 教室：隔着走廊的低低人声底噪（带缓慢起伏）、偶尔黑板上一串粉笔的沙沙、翻书页、椅子吱呀、钟摆般的挂钟滴答。
    function voiceClassroom(layer) {
        const murmur = makeGain(layer, 0.05);
        chain(makeNoise(layer), makeFilter(layer, 'bandpass', 360, 0.6), murmur, layer.out);
        makeLfo(layer, rand(0.12, 0.26), 0.02, murmur.gain);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 160), makeGain(layer, 0.03), layer.out);
        const chalk = () => {
            const at = layer.ctx.currentTime + 0.05;
            const pan = rand(-0.4, 0.4);
            const strokes = 2 + Math.floor(Math.random() * 4);
            let t = at;
            for (let i = 0; i < strokes; i++) {
                const len = rand(0.08, 0.2);
                noiseBurst(layer, t, len, { type: 'highpass', frequency: rand(3400, 5600), q: 0.7, peak: rand(0.02, 0.045), attack: 0.012, pan });
                t += len + rand(0.05, 0.14);
            }
            noiseBurst(layer, t, 0.03, { type: 'bandpass', frequency: rand(2000, 2600), q: 2, peak: rand(0.03, 0.05), attack: 0.001, pan });
            layerLater(layer, chalk, rand(9000, 24000));
        };
        layerLater(layer, chalk, rand(3000, 8000));
        const page = () => {
            const at = layer.ctx.currentTime + 0.05;
            const pan = rand(-0.7, 0.7);
            noiseBurst(layer, at, 0.22, { type: 'bandpass', frequency: rand(1700, 2400), q: 0.8, peak: rand(0.03, 0.06), attack: 0.05, pan });
            noiseBurst(layer, at + 0.2, 0.04, { type: 'highpass', frequency: rand(3800, 5200), q: 0.7, peak: rand(0.02, 0.04), attack: 0.001, pan });
            layerLater(layer, page, rand(7000, 20000));
        };
        layerLater(layer, page, rand(2500, 9000));
        // 椅子吱呀：中低频带通噪声缓缓上滑，再带一点桌腿的闷响。
        const creak = () => {
            const at = layer.ctx.currentTime + 0.05;
            const pan = rand(-0.8, 0.8);
            const base = rand(520, 820);
            noiseBurst(layer, at, rand(0.22, 0.4), { type: 'bandpass', frequency: base, q: rand(3, 5), peak: rand(0.02, 0.04), attack: 0.06, pan });
            noiseBurst(layer, at + 0.02, 0.06, { type: 'lowpass', frequency: rand(240, 340), peak: rand(0.03, 0.05), attack: 0.003, pan });
            layerLater(layer, creak, rand(8000, 22000));
        };
        layerLater(layer, creak, rand(4000, 12000));
        // 挂钟：每秒一下，「嘀」「嗒」交替，很轻。
        let tock = false;
        const tick = () => {
            noiseBurst(layer, layer.ctx.currentTime + 0.02, 0.02, { type: 'bandpass', frequency: tock ? 2300 : 3200, q: 2.5, peak: rand(0.03, 0.045), attack: 0.001, pan: 0.5 });
            tock = !tock;
            layerLater(layer, tick, rand(960, 1040));
        };
        layerLater(layer, tick, rand(300, 900));
    }

    // 图书馆：几乎听不见的空调与房间底噪，偶尔一页纸翻过、笔尖沙沙、很远处的脚步和书本合上的轻响。
    function voiceLibrary(layer) {
        const room = makeGain(layer, 0.018);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 220), room, layer.out);
        makeLfo(layer, rand(0.04, 0.09), 0.006, room.gain);
        chain(makeNoise(layer), makeFilter(layer, 'bandpass', 1800, 0.5), makeGain(layer, 0.004), layer.out);
        // 翻页：一段由弱渐强的纸张摩擦，收在最后一下轻轻的「啪」。
        const flip = () => {
            const at = layer.ctx.currentTime + 0.05;
            const pan = rand(-0.8, 0.8);
            noiseBurst(layer, at, rand(0.26, 0.42), { type: 'bandpass', frequency: rand(1500, 2300), q: rand(0.6, 1), peak: rand(0.04, 0.075), attack: 0.1, pan });
            noiseBurst(layer, at + 0.12, 0.2, { type: 'highpass', frequency: rand(3600, 5200), q: 0.7, peak: rand(0.015, 0.03), attack: 0.06, pan });
            noiseBurst(layer, at + rand(0.3, 0.45), 0.035, { type: 'bandpass', frequency: rand(2200, 3000), q: 1.6, peak: rand(0.03, 0.055), attack: 0.001, pan });
            layerLater(layer, flip, rand(5000, 14000));
        };
        layerLater(layer, flip, rand(1500, 5000));
        // 笔尖沙沙：一小串短而轻的高频划动。
        const write = () => {
            const at = layer.ctx.currentTime + 0.05;
            const pan = rand(-0.6, 0.6);
            const n = 4 + Math.floor(Math.random() * 6);
            let t = at;
            for (let i = 0; i < n; i++) {
                noiseBurst(layer, t, rand(0.04, 0.09), { type: 'highpass', frequency: rand(4200, 6200), q: 0.7, peak: rand(0.012, 0.026), attack: 0.01, pan });
                t += rand(0.07, 0.16);
            }
            layerLater(layer, write, rand(12000, 30000));
        };
        layerLater(layer, write, rand(6000, 16000));
        // 远处走动与合书：脚步很轻，书本合上是一记闷响加一点纸页的气流。
        const far = () => {
            const at = layer.ctx.currentTime + 0.05;
            if (Math.random() < 0.6) {
                footsteps(layer, at, 3 + Math.floor(Math.random() * 3), rand(-0.9, 0.9));
            } else {
                const pan = rand(-0.8, 0.8);
                noiseBurst(layer, at, 0.12, { type: 'lowpass', frequency: rand(300, 480), peak: rand(0.04, 0.07), attack: 0.004, pan });
                noiseBurst(layer, at + 0.01, 0.1, { type: 'bandpass', frequency: rand(1200, 1800), q: 0.8, peak: rand(0.02, 0.035), attack: 0.004, pan });
            }
            layerLater(layer, far, rand(16000, 40000));
        };
        layerLater(layer, far, rand(9000, 22000));
    }

    // 哨声：两根略有失谐的振荡器（非谐拍频）+ 一缕气流噪声，用「弹珠」的颤动做幅度起伏；音量很小，是远处体育课的哨子。
    function whistle(layer, at, pan) {
        const base = rand(2500, 3000);
        const dur = rand(0.3, 0.7);
        const peak = rand(0.012, 0.022);
        const trill = rand(22, 30);
        for (const [mul, gain] of [[1, 1], [1.047, 0.6]]) {
            blip(layer, at, dur, (osc, amp) => {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(base * mul * 0.97, at);
                osc.frequency.exponentialRampToValueAtTime(base * mul, at + 0.04);
                amp.gain.setValueAtTime(FLOOR, at);
                amp.gain.exponentialRampToValueAtTime(peak * gain, at + 0.02);
                let t = at + 0.05;
                let high = false;
                while (t < at + dur - 0.05) {
                    amp.gain.exponentialRampToValueAtTime(peak * gain * (high ? 1 : 0.45), t);
                    high = !high;
                    t += 1 / trill / 2;
                }
                amp.gain.exponentialRampToValueAtTime(FLOOR, at + dur);
            }, pan);
        }
        noiseBurst(layer, at, dur, { type: 'bandpass', frequency: base * 1.05, q: 2.2, peak: peak * 1.4, attack: 0.03, pan });
    }

    // 操场：远处的人声与笑闹（带通噪声起伏）、偶尔一声很远的哨子、篮球的拍地声、间或一嗓子被风带走的呼喊。
    function voicePlayground(layer) {
        const crowd = makeGain(layer, 0.05);
        const formant = makeFilter(layer, 'bandpass', 760, 0.7);
        chain(makeNoise(layer), formant, crowd, layer.out);
        makeLfo(layer, rand(0.08, 0.16), 0.02, crowd.gain);
        makeLfo(layer, rand(0.1, 0.2), 220, formant.frequency);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 140), makeGain(layer, 0.025), layer.out);
        const blow = () => {
            const at = layer.ctx.currentTime + 0.05;
            whistle(layer, at, rand(-0.8, 0.8));
            if (Math.random() < 0.4) whistle(layer, at + rand(0.5, 0.9), rand(-0.8, 0.8));
            layerLater(layer, blow, rand(14000, 38000));
        };
        layerLater(layer, blow, rand(5000, 14000));
        // 拍球：间隔越来越短的一串闷响（球越弹越低），声像固定在一侧。
        const dribble = () => {
            const pan = rand(-0.7, 0.7);
            const count = 4 + Math.floor(Math.random() * 6);
            let t = layer.ctx.currentTime + 0.05;
            let gap = rand(0.4, 0.55);
            for (let i = 0; i < count; i++) {
                noiseBurst(layer, t, 0.09, { type: 'lowpass', frequency: rand(190, 280), peak: rand(0.05, 0.085), attack: 0.003, pan });
                noiseBurst(layer, t, 0.025, { type: 'bandpass', frequency: rand(1400, 1900), q: 1.2, peak: rand(0.015, 0.03), attack: 0.001, pan });
                t += gap;
                gap *= rand(0.9, 0.98);
            }
            layerLater(layer, dribble, rand(9000, 24000));
        };
        layerLater(layer, dribble, rand(4000, 12000));
        // 呼喊：一嗓子带共振峰的短噪声，被风带得很远。
        const shout = () => {
            const at = layer.ctx.currentTime + 0.05;
            const pan = rand(-0.9, 0.9);
            const f = rand(650, 1100);
            noiseBurst(layer, at, rand(0.25, 0.5), { type: 'bandpass', frequency: f, q: rand(2.5, 4), peak: rand(0.03, 0.055), attack: 0.06, pan });
            noiseBurst(layer, at + 0.02, rand(0.2, 0.4), { type: 'bandpass', frequency: f * 2.1, q: 3, peak: rand(0.012, 0.024), attack: 0.06, pan });
            layerLater(layer, shout, rand(6000, 18000));
        };
        layerLater(layer, shout, rand(2500, 8000));
    }

    return Object.freeze({ classroom: voiceClassroom, library: voiceLibrary, playground: voicePlayground });
}
