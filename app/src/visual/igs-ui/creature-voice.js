// 非人角色的语气音：低吼、嘶鸣、虫鸣、幽灵低语四组声线。
// 与人类的 23 套声线不同，没有录音素材，全部由 Web Audio 现场合成；按体型调音高与低频（小型尖、巨型低沉）。
// 本文件不依赖语气音主模块：选择与配方是纯函数，合成只吃传入的 AudioContext。
import { confirmedCreatureOf } from '../../scene/creature-profile.js';

export const CREATURE_VOICE_KINDS = Object.freeze([
    ['growl', '低吼'], ['hiss', '嘶鸣'], ['chitter', '虫鸣'], ['whisper', '幽灵低语'],
    ['roar', '龙吟'], ['screech', '鸟类尖啸'], ['groan', '丧尸呻吟'], ['rattle', '骸骨咔哒'],
    ['gurgle', '史莱姆咕噜'], ['mech', '机械电子音'], ['demon', '恶魔重音'], ['abyss', '深海低鸣'],
]);
export const CREATURE_VOICE_LABELS = Object.freeze(Object.fromEntries(CREATURE_VOICE_KINDS));
export const CREATURE_VOICE_DEFAULT = 'growl';

// 小映射表：形态关键词（来自 DNA 与名字）到声线；先到先得，不做大词库，未命中回落低吼。
// 顺序有讲究：骷髅先于丧尸（都带「尸 / 骨」），丧尸先于幽灵（食尸鬼的「鬼」），机械先于虫（机械蜘蛛），龙先于蛇与深海（海龙）。
const KIND_WORDS = Object.freeze([
    ['rattle', /skeleton|skeletal|\blich\b|\bbones?\b|骷髅|骸骨|白骨|骨架|巫妖/i],
    ['groan', /zombie|undead|ghoul|corpse|mummy|revenant|丧尸|僵尸|活尸|尸|木乃伊|食尸/i],
    ['whisper', /ghost|spirit|wraith|phantom|spectre|specter|ethereal|translucent|poltergeist|幽灵|亡魂|怨灵|幽魂|鬼|魂/i],
    ['mech', /robot|android|mecha|\bmech\b|golem|automaton|cyborg|drone|machine|mechanical|机器人|机甲|机械|傀儡|人偶兵|无人机|魔像|自律/i],
    ['gurgle', /slime|\booze\b|jelly|gelatinous|\bblob\b|史莱姆|粘液|黏液|软泥|果冻|胶质/i],
    ['roar', /dragon|wyrm|wyvern|drake|dinosaur|\brex\b|龙|恐龙|飞龙|亚龙/i],
    ['demon', /demon|devil|fiend|\bimp\b|balrog|hellhound|恶魔|魔王|魔物|魔神|妖魔|地狱|恶鬼/i],
    ['abyss', /kraken|leviathan|octopus|squid|tentacle|cthulhu|sea monster|eldritch|海怪|克拉肯|利维坦|章鱼|乌贼|触手|深海|海兽/i],
    ['chitter', /insect|beetle|spider|arachnid|mantis|scorpion|centipede|wasp|\bbee\b|\bant\b|moth|chitin|compound eyes|虫|蛛|蚁|蝎|蜂|蜈蚣|甲壳/i],
    ['hiss', /snake|serpent|lamia|naga|cobra|basilisk|lizard|reptile|gecko|蛇|蜥|蛟|鳄/i],
    ['screech', /\bbird\b|eagle|hawk|falcon|\bcrow\b|raven|\bowl\b|harpy|griffin|gryphon|phoenix|\broc\b|feathered|鸟|鹰|隼|鸦|鸮|雕|鹫|凤凰|狮鹫|鹏|禽/i],
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
    roar: Object.freeze({ f0: 72, duration: 1.05, attack: 0.08, release: 0.4, glide: -0.22, rough: 18, lowpass: 900, center: 1800, q: 0.7, noise: 0.35 }),
    screech: Object.freeze({ f0: 1700, duration: 0.5, attack: 0.02, release: 0.2, glide: -0.4, center: 2600, q: 4, vibrato: 32 }),
    groan: Object.freeze({ f0: 115, duration: 1.1, attack: 0.2, release: 0.45, glide: -0.12, rough: 7, lowpass: 620, formants: [380, 900], noise: 0.25 }),
    rattle: Object.freeze({ f0: 1100, duration: 0.6, attack: 0.005, release: 0.08, glide: 0, pulses: 9, rate: 15, center: 1500, q: 3 }),
    gurgle: Object.freeze({ f0: 170, duration: 0.7, attack: 0.03, release: 0.2, glide: 0, pulses: 6, rate: 9, lowpass: 900 }),
    mech: Object.freeze({ f0: 220, duration: 0.6, attack: 0.01, release: 0.12, glide: 0, ring: 63, lowpass: 2600, highpass: 300 }),
    demon: Object.freeze({ f0: 140, duration: 0.85, attack: 0.06, release: 0.3, glide: -0.1, rough: 30, lowpass: 1400, formants: [700, 1900], noise: 0.4 }),
    abyss: Object.freeze({ f0: 48, duration: 1.6, attack: 0.35, release: 0.6, glide: 0.18, lowpass: 380, center: 220, q: 1.4, noise: 0.5, vibrato: 0.8 }),
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
    } else if (recipe.kind === 'roar') {
        // 龙吟：比兽吼低一个八度的粗糙锯齿波，叠一层喉咙里喷出来的气流嘶声，底下压着胸腔共鸣。
        const lowpass = add(context.createBiquadFilter());
        lowpass.type = 'lowpass';
        lowpass.frequency.value = recipe.lowpass;
        lowpass.connect(env);
        const am = add(context.createGain());
        am.gain.value = 0.6;
        am.connect(lowpass);
        oscillator('sawtooth', recipe.f0, recipe.glide, 0.8, am);
        oscillator('sawtooth', recipe.f0 * 1.5, recipe.glide, 0.35, am);
        oscillator('sine', recipe.rough, 0, 0.45, am.gain);
        oscillator('sine', recipe.f0 / 2, recipe.glide, 0.3 + recipe.sub, env);
        noise(recipe.noise, [['bandpass', recipe.center, recipe.q]]);
    } else if (recipe.kind === 'screech') {
        // 鸟类尖啸：锯齿波过窄带通，音高先冲上去再往下甩，带一点急促的颤音（鸦叫的「嘎」）。
        const band = add(context.createBiquadFilter());
        band.type = 'bandpass';
        band.frequency.value = recipe.center;
        band.Q.value = recipe.q;
        band.connect(env);
        const { osc } = oscillator('sawtooth', recipe.f0, 0, 0.9, band);
        osc.frequency.cancelScheduledValues(t0);
        osc.frequency.setValueAtTime(recipe.f0 * 0.8, t0);
        osc.frequency.exponentialRampToValueAtTime(recipe.f0 * 1.15, t0 + recipe.duration * 0.25);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, recipe.f0 * (1 + recipe.glide)), end);
        oscillator('sine', recipe.vibrato, 0, recipe.f0 * 0.04, osc.frequency);
        oscillator('square', recipe.f0 * 2, recipe.glide, 0.12, band);
        if (recipe.sub) oscillator('sine', recipe.f0 / 4, recipe.glide, recipe.sub * 0.6, env);
    } else if (recipe.kind === 'groan') {
        // 丧尸呻吟：慢而不稳的低音，声带像漏了气；喉咙里带着湿哑的共振峰，音高缓缓往下塌。
        const lowpass = add(context.createBiquadFilter());
        lowpass.type = 'lowpass';
        lowpass.frequency.value = recipe.lowpass;
        lowpass.connect(env);
        const am = add(context.createGain());
        am.gain.value = 0.55;
        am.connect(lowpass);
        const { osc } = oscillator('sawtooth', recipe.f0, recipe.glide, 0.7, am);
        oscillator('sine', recipe.rough, 0, 0.35, am.gain);
        oscillator('sine', 3.2, 0, recipe.f0 * 0.05, osc.frequency);
        for (const formant of recipe.formants) noise(recipe.noise / recipe.formants.length, [['bandpass', formant, 5]]);
        if (recipe.sub) oscillator('sine', recipe.f0 / 2, recipe.glide, recipe.sub, env);
    } else if (recipe.kind === 'rattle') {
        // 骸骨咔哒：一串快慢不齐的骨头相碰，每下是一记短促的木质敲击。
        const band = add(context.createBiquadFilter());
        band.type = 'bandpass';
        band.frequency.value = recipe.center;
        band.Q.value = recipe.q;
        band.connect(env);
        const gate = add(context.createGain());
        gate.gain.value = 0;
        gate.connect(band);
        let at = t0;
        for (let i = 0; i < recipe.pulses && at < end; i += 1) {
            gate.gain.setValueAtTime(0.0001, at);
            gate.gain.linearRampToValueAtTime(0.9 * (0.6 + Math.random() * 0.4), at + 0.002);
            gate.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
            at += (1 / recipe.rate) * (0.6 + Math.random() * 0.8);
        }
        const clack = noiseSource(context, recipe.duration + 0.1);
        clack.connect(gate);
        clack.start(t0);
        clack.stop(end + 0.05);
        sources.push(clack);
        oscillator('triangle', recipe.f0, 0, 0.25, gate);
        if (recipe.sub) oscillator('sine', recipe.f0 / 8, 0, recipe.sub * 0.5, env);
    } else if (recipe.kind === 'gurgle') {
        // 史莱姆咕噜：低沉的正弦一下下往上冒泡，像黏糊糊的东西在冒气，过低通去掉棱角。
        const lowpass = add(context.createBiquadFilter());
        lowpass.type = 'lowpass';
        lowpass.frequency.value = recipe.lowpass;
        lowpass.connect(env);
        const gate = add(context.createGain());
        gate.gain.value = 0;
        gate.connect(lowpass);
        const { osc } = oscillator('sine', recipe.f0, 0, 1, gate);
        osc.frequency.cancelScheduledValues(t0);
        let at = t0;
        for (let i = 0; i < recipe.pulses && at < end; i += 1) {
            const f = recipe.f0 * (0.8 + Math.random() * 0.5);
            const step = (1 / recipe.rate) * (0.7 + Math.random() * 0.6);
            osc.frequency.setValueAtTime(f, at);
            osc.frequency.exponentialRampToValueAtTime(f * 2.2, at + step * 0.8);
            gate.gain.setValueAtTime(0.0001, at);
            gate.gain.linearRampToValueAtTime(0.9, at + 0.01);
            gate.gain.exponentialRampToValueAtTime(0.0001, at + step * 0.9);
            at += step;
        }
        noise(0.12, [['lowpass', 300, 0.7]]);
        if (recipe.sub) oscillator('sine', recipe.f0 / 2, 0, recipe.sub, env);
    } else if (recipe.kind === 'mech') {
        // 机械电子音：方波乘上一个不成谐波的调制，出环形调制的金属电子感；起头一段伺服电机的扫频。
        const lowpass = add(context.createBiquadFilter());
        lowpass.type = 'lowpass';
        lowpass.frequency.value = recipe.lowpass;
        const highpass = add(context.createBiquadFilter());
        highpass.type = 'highpass';
        highpass.frequency.value = recipe.highpass;
        lowpass.connect(highpass);
        highpass.connect(env);
        const ring = add(context.createGain());
        ring.gain.value = 0;
        ring.connect(lowpass);
        const { osc } = oscillator('square', recipe.f0, 0, 0.6, ring);
        oscillator('sine', recipe.ring * (recipe.f0 / BASES.mech.f0), 0, 0.9, ring.gain);
        osc.frequency.cancelScheduledValues(t0);
        osc.frequency.setValueAtTime(recipe.f0 * 0.6, t0);
        osc.frequency.exponentialRampToValueAtTime(recipe.f0, t0 + Math.min(0.12, recipe.duration * 0.25));
        const steps = 3 + Math.floor(Math.random() * 3);
        for (let i = 1; i < steps; i += 1) osc.frequency.setValueAtTime(recipe.f0 * [1, 1.25, 0.84, 1.5][i % 4], t0 + (recipe.duration * i) / steps);
        oscillator('sawtooth', recipe.f0 * 4, 0, 0.08, lowpass);
        if (recipe.sub) oscillator('sine', recipe.f0 / 2, 0, recipe.sub, env);
    } else if (recipe.kind === 'demon') {
        // 恶魔重音：两个声音叠着说话，一个正常音高、一个低八度且略微走音，夹着嘶哑的气声和粗糙的颤动。
        const lowpass = add(context.createBiquadFilter());
        lowpass.type = 'lowpass';
        lowpass.frequency.value = recipe.lowpass;
        lowpass.connect(env);
        const am = add(context.createGain());
        am.gain.value = 0.6;
        am.connect(lowpass);
        oscillator('sawtooth', recipe.f0, recipe.glide, 0.55, am);
        const { osc: low } = oscillator('sawtooth', recipe.f0 / 2, recipe.glide, 0.6, am);
        low.detune.value = -18;
        oscillator('sine', recipe.rough, 0, 0.4, am.gain);
        for (const formant of recipe.formants) noise(recipe.noise / recipe.formants.length, [['bandpass', formant, 4]]);
        oscillator('sine', recipe.f0 / 4, recipe.glide, 0.2 + recipe.sub, env);
    } else if (recipe.kind === 'abyss') {
        // 深海低鸣：极低的长音缓缓往上升，像鲸歌又像隔着水的巨物；水压闷住高频，带缓慢的音高晃动。
        const lowpass = add(context.createBiquadFilter());
        lowpass.type = 'lowpass';
        lowpass.frequency.value = recipe.lowpass;
        lowpass.connect(env);
        const { osc } = oscillator('sawtooth', recipe.f0, recipe.glide, 0.6, lowpass);
        oscillator('sine', recipe.vibrato, 0, recipe.f0 * 0.04, osc.frequency);
        oscillator('sine', recipe.f0, recipe.glide, 0.5, env);
        oscillator('sine', recipe.f0 * 3.01, recipe.glide, 0.08, lowpass);
        noise(recipe.noise, [['bandpass', recipe.center, recipe.q], ['lowpass', recipe.lowpass, 0.7]]);
        oscillator('sine', recipe.f0 / 2, recipe.glide, 0.25 + recipe.sub, env);
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
