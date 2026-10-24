// 地点环境音：警局、厨房、医院、便利店、洋馆、霓虹夜街、祭典、体育馆、地下城。全部 WebAudio 合成，原语由 scene-audio 通过题材包登记表传入。
import { resolvePlaceKind } from './fx-places-model.js';

// 数组顺序即环境音名额的优先级（越靠前越先占 3 层名额）：声音辨识度高的地点在前。
export const PLACES_AMBIENT_KINDS = Object.freeze(['plhospital', 'plkonbini', 'plpolice', 'pldungeon', 'plshrine', 'plgym', 'plkitchen', 'plmansion', 'plneonrain']);
export const PLACES_AMBIENT_LABELS = Object.freeze({
    plhospital: '医院监护', plkonbini: '便利店', plpolice: '警局', pldungeon: '地下城', plshrine: '祭典神社', plgym: '体育馆', plkitchen: '厨房', plmansion: '洋馆', plneonrain: '霓虹夜街',
});

const FESTIVAL_WORDS = Object.freeze(['祭典', '夏祭', '祭礼', '庙会']);

export function placesAmbientPlan(ctx, { night = false } = {}) {
    const hit = resolvePlaceKind(ctx && ctx.location, ctx && ctx.worldview);
    const kind = hit ? hit.kind : '';
    if (!PLACES_AMBIENT_KINDS.includes(kind)) return [];
    // 神社没有祭典时只留风铃与树声：变体写 quiet（神社层不分古风 / 魔法外形）。
    const variant = kind === 'plshrine' && !FESTIVAL_WORDS.some((word) => String(ctx.location).includes(word)) ? 'quiet' : hit.variant;
    return [{ kind, level: night ? 'light' : 'medium', variant }];
}

export function createPlacesVoices(h) {
    const { rand, chain, makeNoise, makeFilter, makeGain, makeLfo, layerLater, noiseBurst, blip, footsteps, FLOOR } = h;
    const now = (layer) => layer.ctx.currentTime + 0.03;
    const tone = (layer, at, freq, dur, peak, { type = 'sine', to = 0, pan = 0 } = {}) => blip(layer, at, dur, (osc, amp) => {
        osc.type = type;
        osc.frequency.setValueAtTime(freq, at);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur * 0.8);
        amp.gain.setValueAtTime(FLOOR, at);
        amp.gain.exponentialRampToValueAtTime(peak, at + 0.004);
        amp.gain.exponentialRampToValueAtTime(FLOOR, at + dur);
    }, pan);
    const every = (layer, fn, min, max, first = [200, 1200]) => {
        const loop = () => {
            fn(now(layer));
            layerLater(layer, loop, rand(min, max));
        };
        layerLater(layer, loop, rand(first[0], first[1]));
    };

    function voiceHospital(layer) {
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 150), makeGain(layer, 0.02), layer.out);
        const period = rand(860, 1000);
        const beat = () => {
            tone(layer, now(layer), 980, 0.11, 0.05, { pan: 0.35 });
            layerLater(layer, beat, period);
        };
        layerLater(layer, beat, 400);
        every(layer, (at) => {
            tone(layer, at, 660, 0.5, 0.025, { pan: -0.4 });
            tone(layer, at + 0.42, 523, 0.7, 0.025, { pan: -0.4 });
        }, 22000, 48000, [9000, 20000]);
        every(layer, (at) => footsteps(layer, at, 3 + Math.floor(Math.random() * 3), rand(-0.8, 0.8)), 14000, 34000, [6000, 16000]);
        // 走廊低语：远处两三个人压低声音交谈。
        every(layer, (at) => {
            const pan = rand(-0.8, 0.8);
            for (let i = 0; i < 3; i++) noiseBurst(layer, at + i * rand(0.5, 0.9), rand(0.5, 0.9), { type: 'bandpass', frequency: rand(380, 620), q: 0.9, peak: 0.012, attack: 0.18, pan });
        }, 16000, 38000, [7000, 18000]);
    }

    function voiceKonbini(layer) {
        const hum = makeGain(layer, 0.03);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 130), hum, layer.out);
        chain(makeNoise(layer), makeFilter(layer, 'bandpass', 240, 6), makeGain(layer, 0.012), layer.out);
        makeLfo(layer, rand(0.2, 0.4), 0.004, hum.gain);
        every(layer, (at) => {
            tone(layer, at, 1318.5, 0.5, 0.05, { pan: -0.2 });
            tone(layer, at + 0.32, 987.8, 0.7, 0.05, { pan: -0.2 });
        }, 9000, 26000, [2000, 6000]);
        every(layer, (at) => {
            const count = 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) tone(layer, at + i * 0.32, 2600, 0.07, 0.03, { type: 'square', pan: 0.5 });
        }, 6000, 18000, [3000, 9000]);
    }

    function voicePolice(layer) {
        const room = makeGain(layer, 0.014);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 180), room, layer.out);
        makeLfo(layer, rand(0.06, 0.12), 0.006, room.gain);
        // 远处警笛：隔着街区，一次起伏两个来回，低音量、间歇出现。
        every(layer, (at) => {
            const pan = rand(-0.8, 0.8);
            for (let i = 0; i < 2; i++) {
                tone(layer, at + i * 1.6, 620, 0.8, 0.012, { type: 'triangle', to: 900, pan });
                tone(layer, at + i * 1.6 + 0.8, 900, 0.8, 0.012, { type: 'triangle', to: 620, pan });
            }
        }, 18000, 46000, [6000, 20000]);
        // 对讲机杂音：按键的咔哒、一阵电流声，偶尔夹一声短提示音。
        every(layer, (at) => {
            const pan = rand(-0.5, 0.5);
            noiseBurst(layer, at, 0.03, { type: 'highpass', frequency: 3200, q: 0.7, peak: 0.03, attack: 0.001, pan });
            noiseBurst(layer, at + 0.05, rand(0.4, 0.9), { type: 'bandpass', frequency: rand(1400, 2200), q: 2.2, peak: 0.018, attack: 0.02, pan });
            noiseBurst(layer, at + 0.6, 0.03, { type: 'highpass', frequency: 3200, q: 0.7, peak: 0.025, attack: 0.001, pan });
            if (Math.random() < 0.4) tone(layer, at + 1.1, 1760, 0.12, 0.015, { pan });
        }, 8000, 24000, [3000, 9000]);
    }

    function voiceKitchen(layer) {
        const simmer = makeGain(layer, 0.035);
        chain(makeNoise(layer), makeFilter(layer, 'bandpass', 900, 0.7), simmer, layer.out);
        makeLfo(layer, rand(0.15, 0.3), 0.012, simmer.gain);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 170), makeGain(layer, 0.03), layer.out);
        every(layer, (at) => {
            const pan = rand(-0.5, 0.5);
            let t = at;
            const count = 3 + Math.floor(Math.random() * 5);
            for (let i = 0; i < count; i++) {
                noiseBurst(layer, t, 0.05, { type: 'bandpass', frequency: rand(1500, 2100), q: 1.4, peak: rand(0.04, 0.07), attack: 0.002, pan });
                noiseBurst(layer, t + 0.005, 0.05, { type: 'lowpass', frequency: 420, peak: 0.05, attack: 0.002, pan });
                t += rand(0.12, 0.2);
            }
        }, 8000, 20000, [2500, 7000]);
        every(layer, (at) => tone(layer, at, rand(2200, 3000), 0.35, 0.025, { pan: rand(-0.6, 0.6) }), 12000, 32000, [6000, 14000]);
    }

    function voiceMansion(layer) {
        const wind = makeGain(layer, 0.02);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 260), wind, layer.out);
        makeLfo(layer, rand(0.05, 0.1), 0.012, wind.gain);
        let tock = false;
        const tick = () => {
            const at = now(layer);
            noiseBurst(layer, at, 0.05, { type: 'bandpass', frequency: tock ? 900 : 1300, q: 2, peak: 0.05, attack: 0.002, pan: 0.4 });
            tone(layer, at, tock ? 150 : 190, 0.12, 0.03, { pan: 0.4 });
            tock = !tock;
            layerLater(layer, tick, rand(1090, 1110));
        };
        layerLater(layer, tick, 500);
        every(layer, (at) => noiseBurst(layer, at, rand(0.4, 0.8), { type: 'bandpass', frequency: rand(380, 560), q: 4, peak: rand(0.02, 0.04), attack: 0.2, pan: rand(-0.8, 0.8) }), 10000, 30000, [5000, 14000]);
        every(layer, (at) => {
            for (let i = 0; i < 4; i++) tone(layer, at + i * 1.4, 130.8, 2.2, 0.03, { pan: 0.4 });
        }, 70000, 120000, [30000, 60000]);
    }

    function voiceNeon(layer) {
        const hiss = makeGain(layer, 0.006);
        chain(makeNoise(layer), makeFilter(layer, 'highpass', 6500), hiss, layer.out);
        makeLfo(layer, rand(2, 5), 0.003, hiss.gain);
        chain(makeNoise(layer), makeFilter(layer, 'bandpass', 120, 9), makeGain(layer, 0.05), layer.out);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 210), makeGain(layer, 0.05), layer.out);
        every(layer, (at) => {
            const count = 2 + Math.floor(Math.random() * 4);
            for (let i = 0; i < count; i++) {
                noiseBurst(layer, at + i * rand(0.04, 0.1), 0.03, { type: 'highpass', frequency: rand(3000, 5000), q: 0.7, peak: rand(0.03, 0.06), attack: 0.001, pan: 0.6 });
            }
        }, 4000, 14000, [1500, 5000]);
        every(layer, (at) => noiseBurst(layer, at, rand(1.2, 2.2), { type: 'bandpass', frequency: rand(500, 900), q: 0.8, peak: 0.035, attack: 0.5, pan: rand(-0.9, 0.9) }), 6000, 16000, [3000, 8000]);
    }

    // 没有祭典的神社：只有树叶间的风与偶尔的风铃。
    function voiceShrineQuiet(layer) {
        const leaves = makeGain(layer, 0.02);
        chain(makeNoise(layer), makeFilter(layer, 'bandpass', 650, 0.5), leaves, layer.out);
        makeLfo(layer, rand(0.06, 0.12), 0.012, leaves.gain);
        every(layer, (at) => {
            for (let i = 0; i < 4; i++) tone(layer, at + i * rand(0.1, 0.22), rand(3400, 4400), 0.14, 0.014, { pan: 0.6 });
        }, 7000, 16000, [2500, 6000]);
    }

    function voiceShrine(layer) {
        if (layer.variant === 'quiet') {
            voiceShrineQuiet(layer);
            return;
        }
        const crowd = makeGain(layer, 0.02);
        chain(makeNoise(layer), makeFilter(layer, 'bandpass', 480, 0.6), crowd, layer.out);
        makeLfo(layer, rand(0.1, 0.2), 0.008, crowd.gain);
        const don = (at, peak) => {
            tone(layer, at, 110, 0.35, peak, { to: 62, pan: -0.3 });
            noiseBurst(layer, at, 0.12, { type: 'lowpass', frequency: 300, peak: peak * 0.8, attack: 0.003, pan: -0.3 });
        };
        const ka = (at) => noiseBurst(layer, at, 0.04, { type: 'bandpass', frequency: 1800, q: 1.6, peak: 0.03, attack: 0.001, pan: -0.3 });
        every(layer, (at) => {
            don(at, 0.08);
            ka(at + 0.3);
            don(at + 0.6, 0.06);
            don(at + 0.9, 0.08);
            ka(at + 1.2);
        }, 3200, 4400, [800, 2000]);
        every(layer, (at) => {
            for (let i = 0; i < 5; i++) tone(layer, at + i * 0.09, rand(3400, 4400), 0.1, 0.012, { pan: 0.6 });
        }, 14000, 30000, [6000, 12000]);
    }

    function voiceGym(layer) {
        const room = makeGain(layer, 0.025);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 320), room, layer.out);
        makeLfo(layer, rand(0.08, 0.16), 0.01, room.gain);
        every(layer, (at) => {
            const pan = rand(-0.6, 0.6);
            let gap = rand(0.42, 0.52);
            let t = at;
            const count = 4 + Math.floor(Math.random() * 4);
            for (let i = 0; i < count; i++) {
                tone(layer, t, rand(120, 150), 0.14, 0.09, { to: 80, pan });
                noiseBurst(layer, t, 0.06, { type: 'lowpass', frequency: 500, peak: 0.05, attack: 0.002, pan });
                t += gap;
                gap *= 0.88;
            }
        }, 9000, 22000, [2000, 6000]);
        every(layer, (at) => {
            const pan = rand(-0.8, 0.8);
            const count = 2 + Math.floor(Math.random() * 2);
            for (let i = 0; i < count; i++) tone(layer, at + i * 0.14, rand(1500, 2200), 0.09, 0.025, { to: rand(2600, 3400), type: 'triangle', pan });
        }, 5000, 16000, [3000, 9000]);
        every(layer, (at) => {
            tone(layer, at, 2850, 0.35, 0.02, { pan: -0.3 });
            tone(layer, at + 0.46, 2850, 0.2, 0.02, { pan: -0.3 });
        }, 40000, 90000, [20000, 40000]);
    }

    function voiceDungeon(layer) {
        const rumble = makeGain(layer, 0.06);
        chain(makeNoise(layer), makeFilter(layer, 'lowpass', 90), rumble, layer.out);
        makeLfo(layer, rand(0.04, 0.09), 0.02, rumble.gain);
        every(layer, (at) => {
            const freq = rand(500, 1100);
            const pan = rand(-0.7, 0.7);
            tone(layer, at, freq, 0.14, rand(0.05, 0.09), { to: freq * 1.7, pan });
            tone(layer, at + rand(0.22, 0.4), freq, 0.2, 0.025, { to: freq * 1.6, pan });
            tone(layer, at + rand(0.55, 0.8), freq, 0.3, 0.012, { to: freq * 1.5, pan });
        }, 1800, 6500, [400, 2000]);
        every(layer, (at) => {
            const pan = rand(-0.9, 0.9);
            for (let i = 0; i < 3; i++) noiseBurst(layer, at + i * 0.07, 0.1, { type: 'bandpass', frequency: rand(2400, 3600), q: 5, peak: 0.03, attack: 0.001, pan });
        }, 18000, 50000, [9000, 24000]);
        every(layer, (at) => footsteps(layer, at, 4 + Math.floor(Math.random() * 4), rand(-0.9, 0.9)), 22000, 60000, [12000, 30000]);
        if (layer.variant === 'ancient') {
            every(layer, (at) => {
                for (let i = 0; i < 5; i++) noiseBurst(layer, at + i * rand(0.03, 0.12), 0.02, { type: 'highpass', frequency: rand(3000, 5200), peak: rand(0.015, 0.035), attack: 0.001, pan: rand(-0.5, 0.5) });
            }, 1500, 5000, [500, 2000]);
        }
    }

    return { plhospital: voiceHospital, plkonbini: voiceKonbini, plpolice: voicePolice, plkitchen: voiceKitchen, plmansion: voiceMansion, plneonrain: voiceNeon, plshrine: voiceShrine, plgym: voiceGym, pldungeon: voiceDungeon };
}
