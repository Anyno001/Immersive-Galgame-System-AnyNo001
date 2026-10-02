// 亲密声画的纯逻辑：情事阶段、床的材质、节拍生成、晃动与心跳脉动曲线。只做氛围，不渲染任何画面。
export const INTIMATE_PHASES = Object.freeze(['rise', 'steady', 'climax', 'after']);

// 节拍：bpm 为目标速度，jitter 为逐拍时间偏差，skip / double 为漏一拍、连两下的概率，velocity 为力度区间。
export const PHASE_TEMPO = Object.freeze({
    rise: Object.freeze({ bpm: 50, jitter: 0.12, skip: 0.08, double: 0, velocity: Object.freeze([0.45, 0.75]) }),
    steady: Object.freeze({ bpm: 68, jitter: 0.07, skip: 0.04, double: 0.05, velocity: Object.freeze([0.65, 0.95]) }),
    climax: Object.freeze({ bpm: 90, jitter: 0.04, skip: 0, double: 0.03, velocity: Object.freeze([0.8, 1]) }),
});
// 越往后越快：中段按在情事段里的进度再提速，停在同一页上也缓慢加快；顶点页按停留时间持续加速，晃动随之放大。
const STEADY_SPAN_BONUS = 10;
const STEADY_TIME_BPM = 0.3;
const STEADY_TIME_MAX = 6;
const CLIMAX_TIME_BPM = 1;
const CLIMAX_MAX_BPM = 112;
const CLIMAX_SWELL_RATE = 0.015;
const CLIMAX_SWELL_MAX = 0.3;

// elapsed 为进入当前阶段后经过的秒数；返回带实时目标速度与晃动放大倍数 swell 的节拍参数。
export function resolveIntimateTempo(phase, span, elapsed = 0) {
    const base = PHASE_TEMPO[phase];
    if (!base) return null;
    const time = Math.max(0, Number(elapsed) || 0);
    let bpm = base.bpm;
    let swell = 1;
    if (phase === 'steady') {
        const progress = span && span.length > 1 ? Math.min(1, span.index / (span.length - 1)) : 0;
        bpm += STEADY_SPAN_BONUS * progress + Math.min(STEADY_TIME_MAX, time * STEADY_TIME_BPM);
    } else if (phase === 'climax') {
        bpm = Math.min(CLIMAX_MAX_BPM, bpm + time * CLIMAX_TIME_BPM);
        swell = 1 + Math.min(CLIMAX_SWELL_MAX, time * CLIMAX_SWELL_RATE);
    }
    return { ...base, bpm: Number(bpm.toFixed(2)), swell: Number(swell.toFixed(3)) };
}

// 每拍向目标速度靠拢的比例：换页后几拍内平滑加减速，不跳变。
const TEMPO_FOLLOW = 0.12;
const MIN_GAP_S = 0.22;

// 心率与呼吸周期（秒）；2 为亲密档，其余为情事各阶段。
export const HEART_BPM = Object.freeze({ 2: 66, rise: 74, steady: 84, climax: 100, after: 64 });
export const BREATH_PERIOD = Object.freeze({ 2: 5.6, rise: 4.8, steady: 4, climax: 3.2, after: 6.4 });
// 世界安静下来：场景 BGM 与环境声的压低比例。
export const DUCK_BY_LEVEL = Object.freeze({ 1: 0.75, 2: 0.55, 3: 0.4 });

// 晃动幅度：y 为下压像素，x 为左右像素，r 为摆动角度；背景按 BG_SWAY 缩小，做出纵深。
export const SWAY_AMPLITUDE = Object.freeze({
    weak: Object.freeze({ x: 0.6, y: 2.5, r: 0.08, shake: 0 }),
    medium: Object.freeze({ x: 1.4, y: 5, r: 0.25, shake: 0 }),
    strong: Object.freeze({ x: 2.2, y: 7, r: 0.45, shake: 1.6 }),
});
export const BG_SWAY = 0.45;
export const CAST_SWAY = 0.8;

const MATERIAL_WORDS = Object.freeze([
    ['metal', ['铁床', '病床', '医院', '病房', '医务室', '保健室', '监狱', '牢房', '囚室', '铁架']],
    ['leather', ['车内', '车里', '车上', '车厢', '轿车', '汽车', '驾驶', '后座']],
    ['sofa', ['沙发', '客厅', '休息室', '会客']],
    ['futon', ['榻榻米', '和室', '被褥', '地铺', '旅馆', '温泉', '浴室', '浴缸', '野外', '草地', '森林', '帐篷', '地板']],
]);
export const INTIMATE_MATERIALS = Object.freeze(['wood', ...MATERIAL_WORDS.map(([kind]) => kind)]);

// 按地点选床的材质；认不出来时是木床。
export function resolveIntimateMaterial(location) {
    const text = String(location || '');
    if (!text) return 'wood';
    const hit = MATERIAL_WORDS.find(([, words]) => words.some((word) => text.includes(word)));
    return hit ? hit[0] : 'wood';
}

// 情事阶段来自 NSFW 连续段位置（romance-settings.resolveNsfwSpan）：
// 段在本楼层内结束时，最后 2 页为余韵、再往前 1 页为顶点；开头 2 页（非延续）为升温。短段不硬拆顶点与余韵。
export function resolveIntimatePhase(span) {
    if (!span) return 'steady';
    const fromEnd = span.length - 1 - span.index;
    if (span.endsInFloor && span.length >= 3 && fromEnd <= 1) return 'after';
    if (span.endsInFloor && span.length >= 4 && fromEnd === 2) return 'climax';
    if (!span.continued && span.index < 2) return 'rise';
    return 'steady';
}

function between([min, max], rng) {
    return min + (max - min) * rng();
}

// 下一拍：prev 为 { t, index, bpm }，t 以秒计；返回的 gap 是到下一拍的预计间隔，供晃动曲线归一化。
export function nextBeat(prev, tempo, rng = Math.random) {
    const bpm = prev.bpm > 0 ? prev.bpm + (tempo.bpm - prev.bpm) * TEMPO_FOLLOW : tempo.bpm * 0.8;
    let gap = (60 / bpm) * (1 + (rng() * 2 - 1) * tempo.jitter);
    const roll = rng();
    if (roll < tempo.double) gap *= 0.5;
    else if (roll < tempo.double + tempo.skip) gap *= 2;
    gap = Math.max(MIN_GAP_S, gap);
    return {
        t: prev.t + gap,
        index: prev.index + 1,
        bpm,
        velocity: between(tempo.velocity, rng),
        swell: tempo.swell || 1,
        jx: rng() * 2 - 1,
        jy: rng() * 2 - 1,
    };
}

// 一拍内的下压曲线（0..1）：前 28% 快速压下，其余时间缓缓回弹。
export function beatPush(phase) {
    const p = Math.min(1, Math.max(0, phase));
    if (p < 0.28) return Math.sin((p / 0.28) * Math.PI / 2);
    return 0.5 * (1 + Math.cos(Math.PI * (p - 0.28) / 0.72));
}

// beat 为最近一次已到点的节拍，gap 为它到下一拍的间隔；返回舞台位移 { x, y, r }（像素 / 度）。
// 左右与摆动逐拍换向；强档叠加随拍衰减的随机抖动。fade 用于停下时平滑归零。
export function swayAt(beat, gap, now, amplitude, fade = 1) {
    if (!beat || !amplitude || !(gap > 0)) return { x: 0, y: 0, r: 0 };
    const dt = Math.max(0, now - beat.t);
    const push = beatPush(dt / gap) * beat.velocity * (beat.swell || 1) * fade;
    const side = beat.index % 2 ? 1 : -1;
    const shake = amplitude.shake ? amplitude.shake * Math.exp(-dt * 7) * (beat.swell || 1) * fade : 0;
    return {
        x: round(amplitude.x * push * side + shake * beat.jx),
        y: round(amplitude.y * push + shake * beat.jy),
        r: round(amplitude.r * push * side, 3),
    };
}

// 心跳两下（咚、咚）：第二下更轻，间隔随心率收窄。dt 为距本次心跳的秒数。
export function heartGap(bpm) {
    return Math.min(0.26, (0.32 * 60) / Math.max(40, bpm));
}

export function heartPulse(dt, bpm) {
    if (!(dt >= 0)) return 0;
    const bump = (x) => Math.exp(-((x / 0.07) ** 2));
    return round(Math.min(1, bump(dt) + 0.6 * bump(dt - heartGap(bpm))), 3);
}

function round(value, digits = 2) {
    return Number(value.toFixed(digits));
}
