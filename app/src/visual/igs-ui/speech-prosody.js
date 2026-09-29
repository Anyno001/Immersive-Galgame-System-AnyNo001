// 说话韵律：纯函数、不依赖 DOM。输入字素序列，输出逐字时间 / 音高 / 音量，
// 让经典打字机的揭字节奏与打字音随句型、情绪和文字演出起伏。
// 契约见 CONTRACT.md「打字机 · 说话韵律」。

// 旧版标点停顿（字速倍数，停在该标点之后）；韵律关闭时逐字节沿用。
const LEGACY_PAUSE = Object.freeze([
    [/^[，、,；;：:]$/u, 3],
    [/^[。！？!?]$/u, 7],
    [/^[…—～~]$/u, 4],
]);

export function punctuationPauseAfter(text, speed) {
    for (const [re, factor] of LEGACY_PAUSE) if (re.test(text)) return speed * factor;
    return 0;
}

// 情绪档：speed 为字距倍数，pitch / gain 为韵律模式下的音高、音量倍数，jitter 为逐音符音高抖动。
// legacyPitch 是「角色声线」一直使用的整页音高（只有开心 / 难过两档），韵律关闭时只用它。
const profile = (id, words, fields) => Object.freeze({
    id, words: Object.freeze(words), speed: 1, pitch: 1, gain: 1, legacyPitch: 1, jitter: 0.04, ...fields,
});
export const EMOTION_PROFILES = Object.freeze([
    profile('happy', ['开心', '高兴', '兴奋', '喜悦', '愉快', '欢喜', '雀跃', '得意', '期待'], { speed: 0.9, pitch: 1.06, legacyPitch: 1.06, tail: 1.04 }),
    profile('sad', ['难过', '伤心', '悲伤', '低落', '沮丧', '失落', '委屈', '哭', '忧郁', '消沉'], { speed: 1.2, pitch: 0.92, gain: 0.85, legacyPitch: 0.92, tail: 0.95 }),
    profile('angry', ['生气', '愤怒', '不满', '烦躁', '恼火', '气愤', '暴躁'], { speed: 0.85, pitch: 0.97, gain: 1.2, jitter: 0.02, tail: 0.93, hardAttack: true }),
    profile('shy', ['害羞', '脸红', '羞涩', '不好意思', '腼腆', '娇羞'], { speed: 1.1, pitch: 1.04, gain: 0.8, jitter: 0.05, minGapMs: 120 }),
    profile('nervous', ['紧张', '害怕', '慌张', '不安', '恐惧', '惊慌', '焦虑'], { pitch: 1.02, gain: 0.9, jitter: 0.09, rhythmJitter: 0.15 }),
    profile('lazy', ['困倦', '犯困', '慵懒', '疲惫', '无聊', '疲倦', '懒洋洋'], { speed: 1.2, pitch: 0.94, gain: 0.85, jitter: 0.03, flat: 0.5 }),
]);
const NEUTRAL = profile('neutral', [], {});

// 前面紧跟否定词的命中不算：「不开心」「没那么紧张」不应落到开心 / 紧张档。
const NEGATION_RE = /(?:不|没|没有|无|毫不|并不|不太|不怎么|不再|没那么|不那么)$/u;

function mentions(text, word) {
    for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) {
        if (!NEGATION_RE.test(text.slice(0, at))) return true;
    }
    return false;
}

// 按表序取第一个命中的情绪档；开心、难过排在最前，保证 emotionPitch 与旧词表命中顺序一致。
export function emotionProfile(emotion) {
    const text = String(emotion || '');
    if (!text) return NEUTRAL;
    return EMOTION_PROFILES.find((item) => item.words.some((word) => mentions(text, word))) || NEUTRAL;
}

export function emotionPitch(emotion) {
    return emotionProfile(emotion).legacyPitch;
}

// 文本哈希做种子：同一句每次播放完全一致，测试也稳定。
export function prosodySeed(text) {
    let hash = 2166136261;
    for (const char of String(text || '')) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
}

function createRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const LETTER_RE = /[\p{L}\p{N}]/u;
const SENTENCE_END_RE = /^[。！？!?…～~]$/u;
const DEFAULT_WORD_SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

export const isVoicedText = (text) => LETTER_RE.test(String(text || ''));

// 句型：statement / question / exclaim / exclaim-question / ellipsis / drawl。
export function sentenceKind(endRun) {
    const run = String(endRun || '');
    const question = /[？?]/u.test(run);
    const exclaim = /[！!]/u.test(run);
    if (question && exclaim) return 'exclaim-question';
    if (question) return 'question';
    if (exclaim) return 'exclaim';
    if (/[～~]/u.test(run)) return 'drawl';
    if (run.includes('…')) return 'ellipsis';
    return 'statement';
}

// 按句切分：句末标点及其连写（？！、……、！！）归入当前句；末尾没有标点视为陈述句。
// start..end 为整句下标范围，runStart 为句末标点连写的起点。
export function splitSentences(texts) {
    const sentences = [];
    let start = 0;
    for (let index = 0; index < texts.length; index += 1) {
        if (!SENTENCE_END_RE.test(texts[index])) continue;
        let end = index;
        while (end + 1 < texts.length && SENTENCE_END_RE.test(texts[end + 1])) end += 1;
        // 省略号后紧跟文字（我……我其实）是句中停顿，不断句。
        if (/^…+$/u.test(texts.slice(index, end + 1).join('')) && isVoicedText(texts[end + 1])) {
            index = end;
            continue;
        }
        sentences.push({ start, end, runStart: index, kind: sentenceKind(texts.slice(index, end + 1).join('')) });
        start = end + 1;
        index = end;
    }
    if (start < texts.length) sentences.push({ start, end: texts.length - 1, runStart: texts.length, kind: 'statement' });
    return sentences;
}

// 词首标记；segmenter 为 null（环境不支持分词）时每个字都算词首。
export function wordStarts(texts, segmenter = DEFAULT_WORD_SEGMENTER) {
    if (!segmenter) return texts.map(() => true);
    const boundaries = new Set();
    for (const part of segmenter.segment(texts.join(''))) boundaries.add(part.index);
    let offset = 0;
    return texts.map((text) => {
        const hit = boundaries.has(offset);
        offset += text.length;
        return hit;
    });
}

// 结巴：X、X 或 X……X，且前后是同一个字。gaps 为只停 1.5 倍的顿号下标，repeats 为重复字下标。
export function stutterMarks(texts) {
    const gaps = new Set();
    const repeats = new Set();
    for (let index = 1; index < texts.length; index += 1) {
        const mark = texts[index];
        if (mark !== '、' && mark !== '…') continue;
        let last = index;
        while (last + 1 < texts.length && texts[last + 1] === mark) last += 1;
        const before = texts[index - 1];
        if (!isVoicedText(before) || texts[last + 1] !== before) continue;
        if (mark === '、') for (let k = index; k <= last; k += 1) gaps.add(k);
        repeats.add(last + 1);
        index = last;
    }
    return { gaps, repeats };
}


// ---- 节奏与语调参数 ----
const TFX_RHYTHM = Object.freeze({ roar: 1.3, big: 1.3, strong: 1.15, small: 0.9, whisper: 0.9 });
const TFX_GAIN = Object.freeze({ roar: 1.4, big: 1.4, strong: 1.25, small: 0.6, whisper: 0.6 });
const TFX_FORCED = new Set(['roar', 'big', 'strong']);
// 语调幅度限制在 ±20% 以内，超出就像唱歌；整页揭字总时长限制在旧算法的 0.8～1.25 倍。
const PITCH_RANGE = Object.freeze([0.8, 1.2]);
const GAIN_RANGE = Object.freeze([0.3, 1.8]);
const DURATION_RANGE = Object.freeze([0.8, 1.25]);
const DRAWL_HOLD = 1.8;
const DRAWL_GLIDE = 0.1;
const STOP_RE = /^[。！？!?]$/u;
const clamp = (value, [low, high]) => Math.min(high, Math.max(low, value));

// 韵律模式下停在 texts[index] 之后的倍数（相对字速）。
function prosodyPauseAfter(texts, index, sentence, stutterGaps) {
    const text = texts[index];
    if (stutterGaps.has(index)) return 1.5;
    if (/^[，、,；;：:]$/u.test(text)) return 3;
    if (/^[～~]$/u.test(text)) return 2;
    if (text === '—') return 4;
    if (text === '…') {
        if (sentence && index >= sentence.runStart) return 4;
        let first = index;
        while (first > 0 && texts[first - 1] === '…') first -= 1;
        return sentence && first === sentence.start ? 5 : 3;
    }
    if (!STOP_RE.test(text)) return 0;
    // 连写（？！、！！）只在最后一个标点后停一次，按 8 计。
    if (STOP_RE.test(texts[index + 1] || '')) return 0;
    if (index > 0 && STOP_RE.test(texts[index - 1])) return 8;
    if (/[？?]/u.test(text)) return 8;
    return /[！!]/u.test(text) ? 5 : 7;
}


// 句型语调：只作用于句内发声字（不含句末标点）。flat 为慵懒档的起伏压缩系数。
function applyContour(notes, sentence, emotion) {
    const end = Math.min(sentence.runStart, sentence.end + 1);
    const idx = [];
    for (let i = sentence.start; i < end; i += 1) if (notes[i].voiced) idx.push(i);
    if (!idx.length) return;
    const flat = emotion.flat || 1;
    const bend = (i, ratio) => { notes[i].pitch *= 1 + (ratio - 1) * flat; };
    const n = idx.length;
    const last = idx[n - 1];
    const tail3 = idx.slice(-3);
    const step = (k) => k + 1 + 3 - tail3.length;
    const kind = sentence.kind;
    if (kind === 'statement') {
        idx.forEach((i, k) => bend(i, 1 - 0.05 * (n > 1 ? k / (n - 1) : 1)));
        notes[last].gain *= 0.85;
    }
    if (kind === 'exclaim' || kind === 'exclaim-question') {
        idx.forEach((i) => { bend(i, 1.04); notes[i].gain *= 1.2; });
        bend(last, 1.08);
        notes[last].gain *= 1.3 / 1.2;
    }
    if (kind === 'question' || kind === 'exclaim-question') tail3.forEach((i, k) => bend(i, 1 + 0.06 * step(k)));
    if (kind === 'ellipsis') {
        tail3.forEach((i, k) => {
            bend(i, 1 - 0.04 * step(k));
            notes[i].gain *= 1 - step(k) / 6;
        });
    }
    if (kind === 'drawl') {
        bend(last, 1 + DRAWL_GLIDE);
        notes[last].hold = DRAWL_HOLD;
        notes[last].glide = DRAWL_GLIDE;
    }
    if (emotion.tail) bend(last, emotion.tail);
    // 每句首音重读且必响。
    notes[idx[0]].gain *= 1.15;
    notes[idx[0]].accent = true;
    notes[idx[0]].force = true;
}

// 文字演出联动：相邻同类型字素视为一段。
function applyTextFx(notes, tfx) {
    for (let i = 0; i < notes.length;) {
        const kind = tfx[i];
        let j = i;
        while (j < notes.length && tfx[j] === kind) j += 1;
        if (kind) {
            const run = [];
            for (let k = i; k < j; k += 1) if (notes[k].voiced) run.push(k);
            run.forEach((k, order) => {
                const note = notes[k];
                note.gain *= TFX_GAIN[kind] || 1;
                if (kind === 'roar' || kind === 'big') note.pitch *= 1.05;
                if (TFX_FORCED.has(kind)) note.force = true;
                if (kind === 'shake') note.jitter = 0.15;
                if (kind === 'grow' || kind === 'fade') {
                    const t = run.length > 1 ? order / (run.length - 1) : 1;
                    note.gain *= kind === 'grow' ? 0.6 + 0.7 * t : 1.3 - 0.7 * t;
                }
            });
        }
        i = j;
    }
}

function legacyTimeline(texts, speed, pause) {
    const times = [];
    let elapsed = 0;
    for (let i = 0; i < texts.length; i += 1) {
        if (pause && i > 0) elapsed += punctuationPauseAfter(texts[i - 1], speed);
        elapsed += speed;
        times.push(elapsed);
    }
    return times;
}

// 节奏：返回每个字素出现的时刻；总时长限制在旧时间轴的 0.8～1.25 倍。
function rhythmTimeline(texts, notes, sentences, sentenceAt, tfx, emotion, options) {
    const { speed, pause, legacyTotal } = options;
    const random = createRandom(options.seed);
    const starts = options.starts;
    const { gaps, repeats } = stutterMarks(texts);
    const tail = new Map();
    for (const sentence of sentences) {
        const voiced = [];
        for (let i = sentence.start; i < Math.min(sentence.runStart, sentence.end + 1); i += 1) if (notes[i].voiced) voiced.push(i);
        if (voiced.length >= 2) tail.set(voiced[voiced.length - 2], 1.25);
        if (voiced.length) tail.set(voiced[voiced.length - 1], 1.5);
    }
    const spread = emotion.rhythmJitter || 0.08;
    const charGap = [];
    const pauseGap = [];
    for (let i = 0; i < texts.length; i += 1) {
        // 拿不到分词（环境不支持或每字成词）时不分拍，保持匀速。
        let factor = notes[i].voiced && options.grouped ? (i > 0 && starts[i] ? 1.2 : 0.8) : 1;
        factor *= tail.get(i) || 1;
        if (repeats.has(i)) factor *= 0.7;
        factor *= TFX_RHYTHM[tfx[i]] || 1;
        factor *= emotion.speed;
        factor *= 1 + (random() * 2 - 1) * spread;
        charGap.push(speed * factor);
        pauseGap.push(pause && i > 0 ? prosodyPauseAfter(texts, i - 1, sentenceAt[i - 1], gaps) * speed * emotion.speed : 0);
    }
    const chars = charGap.reduce((sum, value) => sum + value, 0);
    const pauses = pauseGap.reduce((sum, value) => sum + value, 0);
    const total = chars + pauses;
    let charScale = 1;
    let pauseScale = 1;
    if (legacyTotal > 0 && total > 0) {
        const target = clamp(total, [legacyTotal * DURATION_RANGE[0], legacyTotal * DURATION_RANGE[1]]);
        if (target !== total) {
            // 先只缩放非标点部分的字距；字距压到 0.3 倍仍不够时整体等比缩放。
            const scale = chars > 0 ? (target - pauses) / chars : 0;
            if (scale >= 0.3 && Number.isFinite(scale)) charScale = scale;
            else charScale = pauseScale = target / total;
        }
    }
    const times = [];
    let elapsed = 0;
    for (let i = 0; i < texts.length; i += 1) {
        elapsed += pauseGap[i] * pauseScale + charGap[i] * charScale;
        times.push(elapsed);
    }
    return times;
}

// steps: [{ text, tfx? }]，tfx 为所在文字演出类型（TEXT_FX_KINDS 的值）。
// 返回 [{ timeMs, pitch, gain, hold, glide, voiced, accent, force, jitter }]。
// rhythm、intonation 都关闭时 timeMs 与旧算法逐字节一致，pitch / gain / hold 均为 1。
export function buildProsody(steps, options = {}) {
    const list = Array.isArray(steps) ? steps : [];
    const texts = list.map((step) => String(step?.text ?? ''));
    const speed = Number(options.speed) > 0 ? Number(options.speed) : 0;
    const pause = options.punctuationPause === true;
    const rhythm = options.rhythm === true;
    const intonation = options.intonation === true;
    const emotion = emotionProfile(options.emotion);
    const notes = texts.map((text) => ({
        timeMs: 0, pitch: 1, gain: 1, hold: 1, glide: 0, voiced: isVoicedText(text), accent: false, force: false, jitter: 0,
    }));
    const legacy = legacyTimeline(texts, speed, pause);
    if (!rhythm && !intonation) {
        notes.forEach((note, i) => { note.timeMs = legacy[i]; });
        return notes;
    }
    const sentences = splitSentences(texts);
    const starts = wordStarts(texts, options.segmenter === undefined ? DEFAULT_WORD_SEGMENTER : options.segmenter);
    const grouped = notes.some((note, i) => note.voiced && !starts[i]);
    // 按词取音：词首字必响；没有分词信息时不强制，避免每字必响。
    if (grouped) notes.forEach((note, i) => { if (note.voiced && starts[i]) note.force = true; });
    const sentenceAt = new Array(texts.length);
    for (const sentence of sentences) for (let i = sentence.start; i <= sentence.end; i += 1) sentenceAt[i] = sentence;
    const tfx = list.map((step) => (typeof step?.tfx === 'string' ? step.tfx : ''));
    const times = rhythm
        ? rhythmTimeline(texts, notes, sentences, sentenceAt, tfx, emotion, {
            speed, pause, legacyTotal: legacy[legacy.length - 1] || 0,
            seed: options.seed ?? prosodySeed(texts.join('')),
            starts, grouped,
        })
        : legacy;
    notes.forEach((note, i) => { note.timeMs = times[i]; });
    if (intonation) {
        for (const note of notes) {
            if (note.voiced) {
                note.pitch = emotion.pitch;
                note.gain = emotion.gain;
            }
            note.jitter = emotion.jitter;
        }
        for (const sentence of sentences) applyContour(notes, sentence, emotion);
        applyTextFx(notes, tfx);
        for (const note of notes) {
            note.pitch = clamp(note.pitch, PITCH_RANGE);
            note.gain = clamp(note.gain, GAIN_RANGE);
        }
    }
    return notes;
}

