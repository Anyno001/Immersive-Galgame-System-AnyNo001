// 非人角色的语气音：低吼、嘶鸣、虫鸣、幽灵低语四组声线。
// 与人类的 23 套声线不同，没有录音素材，全部由 Web Audio 现场合成；按体型调音高与低频（小型尖、巨型低沉）。
// 本文件不依赖语气音主模块：选择与配方是纯函数，合成只吃传入的 AudioContext。
import { confirmedCreatureOf } from '../../scene/creature-profile.js';

export const CREATURE_VOICE_KINDS = Object.freeze([
    ['growl', '低吼'], ['hiss', '嘶鸣'], ['chitter', '虫鸣'], ['whisper', '幽灵低语'],
]);
export const CREATURE_VOICE_LABELS = Object.freeze(Object.fromEntries(CREATURE_VOICE_KINDS));
export const CREATURE_VOICE_DEFAULT = 'growl';

// 小映射表：形态关键词（来自 DNA 与名字）到声线；先到先得，不做大词库，未命中回落低吼。
const KIND_WORDS = Object.freeze([
    ['whisper', /ghost|spirit|wraith|phantom|spectre|specter|ethereal|translucent|poltergeist|幽灵|亡魂|怨灵|幽魂|鬼|魂/i],
    ['chitter', /insect|beetle|spider|arachnid|mantis|scorpion|centipede|wasp|\bbee\b|\bant\b|moth|chitin|compound eyes|虫|蛛|蚁|蝎|蜂|蜈蚣|甲壳/i],
    ['hiss', /snake|serpent|lamia|naga|cobra|basilisk|dragon|wyrm|lizard|reptile|gecko|蛇|龙|蜥|蛟|鳄/i],
    ['growl', /wolf|dog|bear|tiger|lion|panther|\bcat\b|boar|beast|fang|fur|狼|犬|熊|虎|狮|豹|猫|兽/i],
]);

export function creatureVoiceKind(text) {
    const source = String(text || '');
    for (const [kind, pattern] of KIND_WORDS) if (pattern.test(source)) return kind;
    return CREATURE_VOICE_DEFAULT;
}

// 取档案描述角色本身的文字：触发词、固定身份、各景别身份（不含负面词）与名字。
export function creatureVoiceText(name, dna) {
    const views = dna && dna.views && typeof dna.views === 'object' ? Object.values(dna.views) : [];
    return [name, dna && dna.triggerWords, dna && dna.identity, ...views.map((view) => view && view.subject)]
        .filter(Boolean).join('\n');
}

// 说话人是已登记的非人角色时返回 { kind, size, form }，否则 null（人类、没有档案）。
export function resolveCreatureVoice(name, dna) {
    const profile = confirmedCreatureOf(dna);
    if (!profile) return null;
    return { kind: creatureVoiceKind(creatureVoiceText(name, dna)), size: profile.size, form: profile.form };
}

// 体型：音高倍率（小型尖、巨型低沉）、时长倍率、低频补强。
export const CREATURE_VOICE_SIZES = Object.freeze({
    small: Object.freeze({ pitch: 1.7, length: 0.8, sub: 0 }),
    medium: Object.freeze({ pitch: 1, length: 1, sub: 0 }),
    large: Object.freeze({ pitch: 0.72, length: 1.2, sub: 0.18 }),
    giant: Object.freeze({ pitch: 0.5, length: 1.5, sub: 0.35 }),
});

// 每组声线的基础参数。f0 为基频（Hz），center 为噪声带中心。
const BASES = Object.freeze({
    growl: Object.freeze({ f0: 95, duration: 0.55, attack: 0.04, release: 0.22, glide: -0.18, rough: 26, lowpass: 520, noise: 0.18 }),
    hiss: Object.freeze({ f0: 640, duration: 0.6, attack: 0.05, release: 0.25, glide: -0.35, center: 5200, q: 1.1, noise: 1, tone: 0.22 }),
    chitter: Object.freeze({ f0: 2600, duration: 0.45, attack: 0.01, release: 0.08, glide: 0.05, pulses: 4, rate: 24, highpass: 1400 }),
    whisper: Object.freeze({ f0: 210, duration: 0.95, attack: 0.25, release: 0.45, glide: 0, formants: [520, 1480], vibrato: 5, noise: 1, tone: 0.16 }),
});

// 情绪：声音更凶、更急、更低落时的音高与力度修正。
const MOOD_TUNE = Object.freeze({
    愤怒: Object.freeze({ pitch: 1.08, drive: 1.25 }), 惊讶: Object.freeze({ pitch: 1.18, drive: 1.1 }), 大笑: Object.freeze({ pitch: 1.1, drive: 1.1 }),
    得意: Object.freeze({ pitch: 1.04, drive: 1.05 }), 悲伤: Object.freeze({ pitch: 0.9, drive: 0.85 }), 哭泣: Object.freeze({ pitch: 0.92, drive: 0.9 }),
    委屈: Object.freeze({ pitch: 0.94, drive: 0.85 }), 害羞: Object.freeze({ pitch: 1, drive: 0.7 }), 冷淡: Object.freeze({ pitch: 0.95, drive: 0.8 }),
});
const NEUTRAL = Object.freeze({ pitch: 1, drive: 1 });

// 配方：纯数字，便于测试。pitch 为用户微调（半音），speed 为语速倍数。
export function creatureVoiceRecipe({ kind = CREATURE_VOICE_DEFAULT, size = 'medium', mood = '', pitch = 0, speed = 1 } = {}) {
    const base = BASES[kind] || BASES[CREATURE_VOICE_DEFAULT];
    const body = CREATURE_VOICE_SIZES[size] || CREATURE_VOICE_SIZES.medium;
    const tune = MOOD_TUNE[mood] || NEUTRAL;
    const semitone = 2 ** ((Number(pitch) || 0) / 12);
    const ratio = body.pitch * tune.pitch * semitone;
    const rate = Number(speed) > 0 ? Number(speed) : 1;
    const recipe = { ...base, kind: BASES[kind] ? kind : CREATURE_VOICE_DEFAULT, f0: base.f0 * ratio,
        duration: Math.max(0.15, base.duration * body.length / rate), sub: body.sub, drive: tune.drive, size: CREATURE_VOICE_SIZES[size] ? size : 'medium' };
    if (base.center) recipe.center = base.center * Math.min(1.4, Math.max(0.6, ratio));
    if (base.lowpass) recipe.lowpass = base.lowpass * Math.min(1.5, Math.max(0.5, ratio));
    if (base.highpass) recipe.highpass = base.highpass * Math.min(1.5, Math.max(0.7, ratio));
    if (base.formants) recipe.formants = base.formants.map((f) => f * Math.min(1.4, Math.max(0.6, ratio)));
    if (base.rate) recipe.rate = base.rate * rate;
    return recipe;
}

function noiseSource(context, seconds) {
    const length = Math.max(1, Math.ceil(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    return source;
}

// 现场合成：节点接到 out，登记进 nodes 供播放方统一断开；返回 { stop, duration }。
export function synthCreatureBark(context, out, recipe, nodes = []) {
    const t0 = context.currentTime + 0.01;
    const end = t0 + recipe.duration;
    const sources = [];
    const add = (node) => { nodes.push(node); return node; };
    const env = add(context.createGain());
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.min(1.2, recipe.drive || 1), t0 + recipe.attack);
    env.gain.setValueAtTime(Math.min(1.2, recipe.drive || 1), Math.max(t0 + recipe.attack, end - recipe.release));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(out);
    const oscillator = (type, freq, glide = 0, level = 1, target = env) => {
        const osc = add(context.createOscillator());
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * (1 + glide)), end);
        const gain = add(context.createGain());
        gain.gain.value = level;
        osc.connect(gain);
        gain.connect(target);
        osc.start(t0);
        osc.stop(end + 0.05);
        sources.push(osc);
        return { osc, gain };
    };
    const noise = (level, filters) => {
        const source = noiseSource(context, recipe.duration + 0.1);
        const made = [];
        let tail = source;
        for (const [type, freq, q] of filters) {
            const filter = add(context.createBiquadFilter());
            made.push(filter);
            filter.type = type;
            filter.frequency.value = freq;
            if (q) filter.Q.value = q;
            tail.connect(filter);
            tail = filter;
        }
        const gain = add(context.createGain());
        gain.gain.value = level;
        tail.connect(gain);
        gain.connect(env);
        source.start(t0);
        source.stop(end + 0.05);
        sources.push(source);
        return made;
    };

    if (recipe.kind === 'growl') {
        // 锯齿波低频抖动出「呼噜」的粗糙感，再用低通压住高频。
        const lowpass = add(context.createBiquadFilter());
        lowpass.type = 'lowpass';
        lowpass.frequency.value = recipe.lowpass;
        lowpass.connect(env);
        const am = add(context.createGain());
        am.gain.value = 0.6;
        am.connect(lowpass);
        oscillator('sawtooth', recipe.f0, recipe.glide, 0.8, am);
        oscillator('sine', recipe.rough, 0, 0.4, am.gain);
        if (recipe.sub) oscillator('sine', recipe.f0 / 2, recipe.glide, recipe.sub, env);
        noise(recipe.noise, [['bandpass', recipe.f0 * 3, 0.8]]);
    } else if (recipe.kind === 'hiss') {
        noise(recipe.noise, [['bandpass', recipe.center, recipe.q]]);
        oscillator('sawtooth', recipe.f0, recipe.glide, recipe.tone);
        if (recipe.sub) oscillator('sine', recipe.f0 / 3, recipe.glide, recipe.sub, env);
    } else if (recipe.kind === 'chitter') {
        // 方波载频按脉冲速率开合，成串的短促咔嗒。
        const highpass = add(context.createBiquadFilter());
        highpass.type = 'highpass';
        highpass.frequency.value = recipe.highpass;
        highpass.connect(env);
        const gate = add(context.createGain());
        gate.gain.value = 0;
        gate.connect(highpass);
        const step = 1 / recipe.rate;
        for (let i = 0; i < recipe.pulses; i += 1) {
            const at = t0 + i * step;
            if (at >= end) break;
            gate.gain.setValueAtTime(0.0001, at);
            gate.gain.linearRampToValueAtTime(0.9, at + 0.006);
            gate.gain.linearRampToValueAtTime(0.0001, at + step * 0.7);
        }
        oscillator('square', recipe.f0, recipe.glide, 0.5, gate);
        if (recipe.sub) oscillator('sine', recipe.f0 / 4, 0, recipe.sub, env);
    } else {
        // 幽灵低语：气声过两个共振峰，中心频率缓慢颤动，起落都很长。
        for (const formant of recipe.formants) {
            const [filter] = noise(recipe.noise / recipe.formants.length, [['bandpass', formant, 6]]);
            oscillator('sine', recipe.vibrato, 0, formant * 0.06, filter.frequency);
        }
        oscillator('sine', recipe.f0, recipe.glide, recipe.tone);
        if (recipe.sub) oscillator('sine', recipe.f0 / 2, 0, recipe.sub, env);
    }
    return { duration: recipe.duration, stop() { for (const source of sources) { try { source.stop(); } catch { /* 已停止 */ } } } };
}
