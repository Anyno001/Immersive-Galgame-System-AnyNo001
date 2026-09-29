import { audioBusContext, audioMasterVolume, busInput, normalizeAudioMasterSettings, setAudioMasterVolume } from './audio-bus.js';
import { WEATHER_FLASH_EVENT, resolveWeatherFxPlan, resolveWeatherFxScene, resolveWeatherFxTime, resolveWeatherFxKind } from './weather-fx-runtime.js';

// 场景音频：BGM 用 HTMLAudio 按关键词选曲并交叉淡入淡出；环境音全部 WebAudio 实时合成，不依赖音频文件。
export const AMBIENT_KINDS = Object.freeze(['birds', 'rain', 'wind', 'insects', 'waves', 'crowd', 'thunder', 'stream', 'fire', 'snow']);
export const AMBIENT_LABELS = Object.freeze({
    birds: '鸟鸣',
    rain: '雨声',
    wind: '风声',
    insects: '虫鸣',
    waves: '海浪',
    crowd: '人声',
    thunder: '雷声',
    stream: '溪流',
    fire: '篝火',
    snow: '雪夜',
});
export const BGM_DEFAULTS = Object.freeze({ enabled: false, volume: 0.5, tracks: Object.freeze([]) });
export const AMBIENT_SOUND_DEFAULTS = Object.freeze({
    enabled: false,
    volume: 0.4,
    birds: true,
    rain: true,
    wind: true,
    insects: true,
    waves: true,
    crowd: true,
    thunder: true,
    stream: true,
    fire: true,
    snow: true,
});
export const BGM_FADE_MS = 1600;
export const AMBIENT_FADE_IN_S = 1.5;
export const AMBIENT_FADE_OUT_S = 1.2;
// 打字音/提示音期间 BGM 与环境音压到原音量的比例。
export const DUCK_RATIO = 0.55;

const MAX_TRACKS = 50;
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 20;
const MAX_NAME_LENGTH = 40;
const MAX_URL_LENGTH = 2048;
const MAX_LAYERS = 3;
const RAMP_STEP_MS = 50;
const VOLUME_RAMP_MS = 300;
const MUFFLE_HZ = 700;
const FLOOR = 0.0001;
const URL_PATTERN = /^(https?:\/\/|data:audio\/|blob:)/i;

const NATURE_WORDS = Object.freeze(['森林', '树林', '公园', '花园', '庭院', '院子', '山', '田', '河', '湖', '郊', '草', '林', '村', '校园', '操场']);
const INSECT_EXTRA_WORDS = Object.freeze(['草', '田', '夏']);
const WAVE_WORDS = Object.freeze(['海', '沙滩', '港', '码头', '岸', '礁']);
const CROWD_WORDS = Object.freeze(['街', '市', '商场', '车站', '广场', '食堂', '餐厅', '集市', '教室', '咖啡', '酒吧']);
const STREAM_WORDS = Object.freeze(['溪', '泉', '瀑', '河', '江边', '水边', '水渠']);
const FIRE_WORDS = Object.freeze(['篝火', '营火', '壁炉', '火堆', '火炉', '炉边', '暖炉', '火塘']);
// thunder 只挂调度器、不常驻，不计入 MAX_LAYERS。
const LAYER_ORDER = Object.freeze(['thunder', 'rain', 'wind', 'snow', 'waves', 'stream', 'fire', 'crowd', 'birds', 'insects']);
const LEVEL_GAIN = Object.freeze({ light: 0.55, medium: 0.8, heavy: 1 });
const THUNDER_GAP_MS = Object.freeze({ heavy: Object.freeze([4500, 9000]), other: Object.freeze([7000, 14000]) });
// 演出色调：环境音总线上的高低通、混响湿声与增益，1.2s 内平滑过渡；多个同时生效时取优先级最高者。
const TONE_PRIORITY = Object.freeze(['dream', 'flashback', 'thought', 'letterbox']);
const TONE_SHAPES = Object.freeze({
    '': Object.freeze({ low: 20000, high: 20, wet: 0, gain: 1 }),
    dream: Object.freeze({ low: 1200, high: 20, wet: 0.45, gain: 1 }),
    flashback: Object.freeze({ low: 3000, high: 400, wet: 0.1, gain: 0.9 }),
    thought: Object.freeze({ low: 1800, high: 20, wet: 0, gain: 0.85 }),
    letterbox: Object.freeze({ low: 20000, high: 20, wet: 0, gain: 0.5 }),
});
const TONE_TC_S = 0.4;
// 空间混响：衰减噪声生成脉冲响应；梦境固定用长混响。
const IMPULSES = Object.freeze({ room: Object.freeze({ seconds: 0.4, wet: 0.18 }), hall: Object.freeze({ seconds: 1.8, wet: 0.3 }), long: Object.freeze({ seconds: 2.6, wet: 0 }) });
const HALL_WORDS = Object.freeze(['大厅', '大堂', '走廊', '教堂', '礼堂', '体育馆', '车站', '神殿', '洞', '隧道', '地下']);
const DUCK_MS = 150;
const UNDUCK_MS = 300;
const HIDE_FADE_MS = 300;

const states = new WeakMap();
const liveStates = new Set();
const noiseBuffers = new WeakMap();
const impulseBuffers = new WeakMap();
let duckCount = 0;

function plainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clamp01(value, fallback) {
    const n = Number(value);
    if (value === null || value === '' || !Number.isFinite(n)) return fallback;
    return Math.min(1, Math.max(0, n));
}

function textOf(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function includesAny(text, words) {
    return words.some((word) => text.includes(word));
}

function normalizeKeywords(value) {
    const output = [];
    if (!Array.isArray(value)) return output;
    for (const item of value) {
        if (output.length >= MAX_KEYWORDS) break;
        const word = String(item == null ? '' : item).trim();
        if (word && word.length <= MAX_KEYWORD_LENGTH && !output.includes(word)) output.push(word);
    }
    return output;
}

export function normalizeBgmSettings(value) {
    const source = plainObject(value);
    const tracks = [];
    const ids = new Set();
    for (const item of Array.isArray(source.tracks) ? source.tracks : []) {
        if (tracks.length >= MAX_TRACKS) break;
        if (!item || typeof item !== 'object') continue;
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        if (!url || url.length > MAX_URL_LENGTH || !URL_PATTERN.test(url)) continue;
        const index = tracks.length + 1;
        let id = typeof item.id === 'string' ? item.id.trim().slice(0, 64) : '';
        if (!id || ids.has(id)) {
            id = `t${index}`;
            while (ids.has(id)) id = `${id}_`;
        }
        ids.add(id);
        const name = typeof item.name === 'string' ? item.name.trim().slice(0, MAX_NAME_LENGTH) : '';
        tracks.push({ id, name: name || `曲目${index}`, url, keywords: normalizeKeywords(item.keywords) });
    }
    return {
        enabled: source.enabled === true,
        volume: clamp01(source.volume, BGM_DEFAULTS.volume),
        tracks,
    };
}

export function normalizeAmbientSoundSettings(value) {
    const source = plainObject(value);
    const output = {
        enabled: source.enabled === true,
        volume: clamp01(source.volume, AMBIENT_SOUND_DEFAULTS.volume),
    };
    for (const kind of AMBIENT_KINDS) output[kind] = source[kind] !== false;
    return output;
}

export function pickBgmTrack(tracks, context = {}) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    const ctx = plainObject(context);
    const location = textOf(ctx.location);
    // 附带归一化的时段/天气键，关键词写 night / rain 也能命中中文描述。
    const others = [
        `${textOf(ctx.time)} ${resolveWeatherFxTime(ctx.time)}`,
        `${textOf(ctx.weather)} ${resolveWeatherFxKind(ctx.weather)}`,
        textOf(ctx.emotion),
    ];
    let best = null;
    let bestScore = 0;
    for (const track of tracks) {
        if (!track || !Array.isArray(track.keywords)) continue;
        let score = 0;
        for (const raw of track.keywords) {
            const word = textOf(raw);
            if (!word) continue;
            if (location.includes(word)) score += 2;
            else if (others.some((text) => text.includes(word))) score += 1;
        }
        if (score > bestScore) {
            best = track;
            bestScore = score;
        }
    }
    if (best) return best;
    return tracks.find((track) => track && Array.isArray(track.keywords) && !track.keywords.some((word) => textOf(word))) || null;
}

export function resolveAmbientTone(context = {}) {
    const ctx = plainObject(context);
    const ranges = plainObject(ctx.fxRanges);
    const active = { dream: ranges.dream, flashback: ranges.flashback, thought: ctx.textType === 'thought', letterbox: ranges.letterbox };
    return TONE_PRIORITY.find((tone) => active[tone] === true) || '';
}

export function resolveAmbientSpace(location, weatherSettings) {
    const text = textOf(location);
    if (!text) return '';
    if (includesAny(text, HALL_WORDS)) return 'hall';
    return resolveWeatherFxScene(location, weatherSettings) === 'indoor' ? 'room' : '';
}

export function resolveAmbientPlan(context = {}, ambientSettings, weatherSettings) {
    const settings = normalizeAmbientSoundSettings(ambientSettings);
    if (!settings.enabled) return [];
    const ctx = plainObject(context);
    const location = textOf(ctx.location);
    const time = resolveWeatherFxTime(ctx.time);
    const indoor = resolveWeatherFxScene(ctx.location, weatherSettings) === 'indoor';
    // 不传地点，天气计划恒按室外解析，只取天气类型与强度。
    const weather = resolveWeatherFxPlan({ weather: ctx.weather });
    const rain = weather && weather.kind === 'rain' ? weather.level : '';
    const snow = weather && weather.kind === 'snow' ? weather.level : '';
    const candidates = new Map();
    const add = (kind, level, muffled) => {
        if (!candidates.has(kind)) candidates.set(kind, { kind, level, muffled });
    };
    // 天气演出负责闪电时，雷声跟随闪屏事件；否则雷声自行排程。
    if (weather && weather.thunder) candidates.set('thunder', { kind: 'thunder', level: weather.level, muffled: indoor, synced: ctx.lightningSynced === true });
    if (rain) add('rain', rain, indoor);
    if (weather && (weather.kind === 'wind' || weather.wind)) add('wind', weather.level, indoor);
    if (snow && !weather.wind) add('snow', snow, indoor);
    if (!indoor) {
        const nature = includesAny(location, NATURE_WORDS);
        if ((time === 'dawn' || time === 'day' || !time) && nature && rain !== 'heavy') {
            add('birds', rain ? 'light' : 'medium', false);
        }
        const summer = includesAny(`${location} ${textOf(ctx.time)}`, INSECT_EXTRA_WORDS);
        if ((time === 'night' || time === 'dusk' || time === 'midnight') && (nature || summer) && !rain && !snow) {
            add('insects', 'medium', false);
        }
        if (includesAny(location, WAVE_WORDS)) add('waves', rain === 'heavy' || weather?.wind ? 'heavy' : 'medium', false);
        if (includesAny(location, STREAM_WORDS)) add('stream', rain === 'heavy' ? 'heavy' : 'medium', false);
    }
    if (includesAny(location, FIRE_WORDS)) add('fire', 'medium', false);
    if (includesAny(location, CROWD_WORDS)) add('crowd', indoor ? 'medium' : 'light', false);
    const plan = [];
    let steady = 0;
    for (const kind of LAYER_ORDER) {
        const layer = candidates.get(kind);
        if (!layer || !settings[kind]) continue;
        if (kind !== 'thunder') {
            if (steady >= MAX_LAYERS) continue;
            steady += 1;
        }
        plan.push(layer);
    }
    // 回忆段落叠一层唱片沙沙声，不占层数、不单独设开关。
    if (resolveAmbientTone(ctx) === 'flashback') plan.push({ kind: 'vinyl', level: 'light', muffled: false });
    return plan;
}

function layerKey(layer) {
    return `${layer.kind}:${layer.level}:${layer.muffled ? 1 : 0}${layer.synced ? ':sync' : ''}`;
}

function defaultAudioFactory() {
    const Audio = globalThis.Audio;
    return typeof Audio === 'function' ? new Audio() : null;
}

// 默认接统一混音总线的 ambient 子总线；测试注入的 context 仍直连 destination。
function defaultContextFactory() {
    return audioBusContext();
}

function later(state, fn, delay, bucket = state.timers) {
    const timer = state.schedule(() => {
        bucket.delete(timer);
        if (!state.stopped) fn();
    }, delay);
    bucket.add(timer);
    return timer;
}

function clearTimer(state, timer, bucket = state.timers) {
    if (!timer) return;
    try { state.clear(timer); } catch { /* ignore */ }
    bucket.delete(timer);
}

function createState(root) {
    return {
        root,
        stopped: false,
        key: '',
        timers: new Set(),
        schedule: (fn, delay) => setTimeout(fn, delay),
        clear: (timer) => clearTimeout(timer),
        audioFactory: defaultAudioFactory,
        contextFactory: defaultContextFactory,
        bgm: { current: null, fading: new Set(), volume: BGM_DEFAULTS.volume },
        ctx: null,
        master: null,
        layers: new Map(),
        retry: null,
        hidden: false,
        visibility: null,
    };
}

// 闪避与页面隐藏以乘数叠在设置音量上，不改写 bgm.volume / masterVolume 本身。
function gainFactor(state) {
    if (state.hidden) return 0;
    return duckCount > 0 ? DUCK_RATIO : 1;
}

// BGM 是 HTMLAudio、不经过混音总线，总音量只能在这里按乘数补上；环境音已由总线 master 处理。
function bgmFactor(state) {
    return gainFactor(state) * audioMasterVolume();
}

function retarget(state, ms) {
    const factor = gainFactor(state);
    if (state.master && state.ctx) {
        try { state.master.gain.setTargetAtTime(state.masterVolume * factor, state.ctx.currentTime, ms / 3000); } catch { /* ignore */ }
    }
    if (state.bgm.current) rampEntry(state, state.bgm.current, state.bgm.volume * factor * audioMasterVolume(), ms);
}

function onVisibility(state) {
    const doc = state.visibility && state.visibility.doc;
    const hidden = Boolean(doc && doc.hidden === true);
    if (hidden === state.hidden) return;
    state.hidden = hidden;
    retarget(state, HIDE_FADE_MS);
    if (hidden) {
        later(state, () => {
            if (!state.hidden) return;
            if (state.bgm.current) {
                try { state.bgm.current.audio.pause(); } catch { /* ignore */ }
            }
            if (state.ctx && typeof state.ctx.suspend === 'function') {
                try { Promise.resolve(state.ctx.suspend()).catch(() => {}); } catch { /* ignore */ }
            }
        }, HIDE_FADE_MS + 100);
        return;
    }
    if (state.bgm.current) playAudio(state, state.bgm.current);
    // 共享 context 上还有打字音与提示音，可见即恢复，不看是否有环境音图层。
    if (state.ctx) resumeContext(state);
    resumeParkedLayers(state);
}

function watchVisibility(state) {
    const doc = state.root?.ownerDocument || globalThis.document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    const handler = () => onVisibility(state);
    state.visibility = { doc, handler };
    state.hidden = doc.hidden === true;
    doc.addEventListener('visibilitychange', handler);
}

function unwatchVisibility(state) {
    if (!state.visibility) return;
    const { doc, handler } = state.visibility;
    state.visibility = null;
    try { doc.removeEventListener('visibilitychange', handler); } catch { /* ignore */ }
}

// 打字音、聊天/演出提示音播放期间压低场景声音；返回幂等的释放函数，可嵌套。
export function duckSceneAudio({ durationMs } = {}) {
    duckCount += 1;
    if (duckCount === 1) for (const state of liveStates) retarget(state, DUCK_MS);
    let released = false;
    let timer = null;
    const release = () => {
        if (released) return;
        released = true;
        if (timer) clearTimeout(timer);
        duckCount = Math.max(0, duckCount - 1);
        if (duckCount === 0) for (const state of liveStates) retarget(state, UNDUCK_MS);
    };
    if (Number.isFinite(durationMs) && durationMs > 0) timer = setTimeout(release, durationMs);
    return release;
}

function setAudioVolume(audio, value) {
    try { audio.volume = Math.min(1, Math.max(0, value)); } catch { /* ignore */ }
}

function disarmRetry(state) {
    if (!state.retry) return;
    const { doc, handler } = state.retry;
    state.retry = null;
    try { doc.removeEventListener('pointerdown', handler, true); } catch { /* ignore */ }
}

// 自动播放策略会拒绝无手势的 play()/resume()，等下一次点击再试一次。
function armRetry(state) {
    if (state.retry || state.stopped) return;
    const doc = state.root?.ownerDocument || globalThis.document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    const handler = () => {
        disarmRetry(state);
        if (state.stopped) return;
        if (state.bgm.current) playAudio(state, state.bgm.current, false);
        if (state.ctx && state.layers.size) resumeContext(state, false);
    };
    state.retry = { doc, handler };
    doc.addEventListener('pointerdown', handler, true);
}

function playAudio(state, entry, retry = true) {
    if (state.hidden) return;
    const fail = () => {
        if (retry && state.bgm.current === entry) armRetry(state);
    };
    try {
        const result = entry.audio.play();
        if (result && typeof result.catch === 'function') result.catch(fail);
    } catch {
        fail();
    }
}

function rampEntry(state, entry, target, ms, done) {
    clearTimer(state, entry.ramp);
    entry.ramp = null;
    const from = entry.level;
    const steps = Math.max(1, Math.round(ms / RAMP_STEP_MS));
    let step = 0;
    const tick = () => {
        entry.ramp = null;
        step += 1;
        entry.level = from + (target - from) * Math.min(1, step / steps);
        setAudioVolume(entry.audio, entry.level);
        if (step >= steps) {
            if (done) done();
            return;
        }
        entry.ramp = later(state, tick, RAMP_STEP_MS);
    };
    entry.ramp = later(state, tick, RAMP_STEP_MS);
}

function releaseAudio(audio) {
    try { audio.pause(); } catch { /* ignore */ }
    try {
        if (typeof audio.removeAttribute === 'function') {
            audio.removeAttribute('src');
            if (typeof audio.load === 'function') audio.load();
        } else {
            audio.src = '';
        }
    } catch { /* ignore */ }
}

function fadeOutEntry(state, entry) {
    state.bgm.fading.add(entry);
    rampEntry(state, entry, 0, BGM_FADE_MS, () => {
        state.bgm.fading.delete(entry);
        releaseAudio(entry.audio);
    });
}

function syncBgm(state, track, volume) {
    const bgm = state.bgm;
    const current = bgm.current;
    const url = track ? track.url : '';
    if (current && current.url === url) {
        if (bgm.volume !== volume || bgm.master !== audioMasterVolume()) {
            bgm.volume = volume;
            bgm.master = audioMasterVolume();
            rampEntry(state, current, volume * bgmFactor(state), VOLUME_RAMP_MS);
        }
        return;
    }
    bgm.volume = volume;
    bgm.master = audioMasterVolume();
    if (current) {
        bgm.current = null;
        fadeOutEntry(state, current);
    }
    if (!url) {
        disarmRetry(state);
        return;
    }
    let audio = null;
    try { audio = state.audioFactory(track); } catch { audio = null; }
    if (!audio) return;
    const entry = { url, audio, level: 0, ramp: null };
    try {
        audio.loop = true;
        setAudioVolume(audio, 0);
        audio.src = url;
    } catch { /* ignore */ }
    bgm.current = entry;
    playAudio(state, entry);
    rampEntry(state, entry, volume * bgmFactor(state), BGM_FADE_MS);
}

function resumeContext(state, retry = true) {
    const ctx = state.ctx;
    if (!ctx || state.hidden || typeof ctx.resume !== 'function' || ctx.state === 'running') return;
    try {
        Promise.resolve(ctx.resume()).then(() => {
            if (retry && ctx.state !== 'running') armRetry(state);
        }, () => {
            if (retry) armRetry(state);
        });
    } catch { /* ignore */ }
}

function ensureContext(state) {
    if (state.ctx && state.master) return state.ctx;
    let ctx = null;
    try { ctx = state.contextFactory(); } catch { ctx = null; }
    if (!ctx) return null;
    try {
        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect((state.contextFactory === defaultContextFactory && busInput('ambient')) || ctx.destination);
        state.ctx = ctx;
        state.master = master;
        state.masterVolume = 0;
        state.tone = buildToneChain(ctx, master);
    } catch {
        return null;
    }
    return ctx;
}

// 图层 → input → 高通 → 低通 →（干声 + 卷积混响）→ 色调增益 → master。
function buildToneChain(ctx, master) {
    const input = ctx.createGain();
    const high = ctx.createBiquadFilter();
    const low = ctx.createBiquadFilter();
    const dry = ctx.createGain();
    const gain = ctx.createGain();
    high.type = 'highpass';
    high.frequency.value = TONE_SHAPES[''].high;
    low.type = 'lowpass';
    low.frequency.value = TONE_SHAPES[''].low;
    gain.gain.value = 1;
    chain(input, high, low, dry, gain, master);
    const tone = { input, high, low, dry, gain, convolver: null, wet: null, nodes: [input, high, low, dry, gain], key: '', impulse: '' };
    if (typeof ctx.createConvolver === 'function') {
        try {
            const convolver = ctx.createConvolver();
            const wet = ctx.createGain();
            wet.gain.value = 0;
            chain(low, convolver, wet, gain);
            tone.convolver = convolver;
            tone.wet = wet;
            tone.nodes.push(convolver, wet);
        } catch { /* 无混响时只保留滤波 */ }
    }
    return tone;
}

function impulseBuffer(ctx, kind) {
    let cache = impulseBuffers.get(ctx);
    if (!cache) {
        cache = new Map();
        impulseBuffers.set(ctx, cache);
    }
    if (cache.has(kind)) return cache.get(kind);
    const rate = ctx.sampleRate || 44100;
    const length = Math.max(1, Math.floor(rate * IMPULSES[kind].seconds));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    cache.set(kind, buffer);
    return buffer;
}

function syncTone(state, toneKey, spaceKey) {
    const tone = state.tone;
    if (!tone || !state.ctx) return;
    const key = `${toneKey}|${spaceKey}`;
    if (tone.key === key) return;
    tone.key = key;
    const shape = TONE_SHAPES[toneKey] || TONE_SHAPES[''];
    const impulse = toneKey === 'dream' ? 'long' : spaceKey;
    const wet = impulse && tone.convolver ? Math.max(shape.wet, IMPULSES[spaceKey]?.wet || 0) : 0;
    try {
        if (impulse && tone.convolver && tone.impulse !== impulse) {
            tone.convolver.buffer = impulseBuffer(state.ctx, impulse);
            tone.impulse = impulse;
        }
        const now = state.ctx.currentTime;
        tone.high.frequency.setTargetAtTime(shape.high, now, TONE_TC_S);
        tone.low.frequency.setTargetAtTime(shape.low, now, TONE_TC_S);
        tone.gain.gain.setTargetAtTime(shape.gain, now, TONE_TC_S);
        if (tone.wet) tone.wet.gain.setTargetAtTime(wet, now, TONE_TC_S);
    } catch { /* ignore */ }
}

function rand(min, max) {
    return min + Math.random() * (max - min);
}

function noiseBuffer(ctx) {
    let buffer = noiseBuffers.get(ctx);
    if (buffer) return buffer;
    const rate = ctx.sampleRate || 44100;
    const length = rate * 2;
    const fade = Math.floor(rate * 0.05);
    const raw = new Float32Array(length + fade);
    let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
    // Paul Kellet 粉噪声近似，比白噪声柔和。
    for (let i = 0; i < raw.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
    }
    // 尾部交叉淡化到开头，循环接缝无爆音。
    for (let i = 0; i < fade; i++) {
        const k = i / fade;
        raw[i] = raw[i] * k + raw[length + i] * (1 - k);
    }
    buffer = ctx.createBuffer(1, length, rate);
    buffer.getChannelData(0).set(raw.subarray(0, length));
    noiseBuffers.set(ctx, buffer);
    return buffer;
}

function own(layer, node) {
    layer.nodes.push(node);
    return node;
}

function chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
}

function makeGain(layer, value) {
    const node = own(layer, layer.ctx.createGain());
    node.gain.value = value;
    return node;
}

function makeFilter(layer, type, frequency, q = 0.7) {
    const node = own(layer, layer.ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
}

function makeNoise(layer) {
    const node = own(layer, layer.ctx.createBufferSource());
    node.buffer = noiseBuffer(layer.ctx);
    node.loop = true;
    node.start(0, Math.random() * 1.9);
    return node;
}

function makeLfo(layer, rate, depth, param) {
    const osc = own(layer, layer.ctx.createOscillator());
    osc.type = 'sine';
    osc.frequency.value = rate;
    const amount = makeGain(layer, depth);
    chain(osc, amount, param);
    osc.start();
    return osc;
}

// 页面隐藏时 context 已挂起、currentTime 不走，照常排程会把一次性短音攒在 transient 里、恢复时一起爆发；
// 所以隐藏期间把循环暂存，可见后由 resumeParkedLayers 重新拉起。
function layerLater(layer, fn, delayMs) {
    later(layer.state, () => {
        if (layer.stopped) return;
        if (layer.state.hidden) {
            layer.parked.add(fn);
            return;
        }
        fn();
    }, delayMs, layer.timers);
}

function resumeParkedLayers(state) {
    for (const layer of state.layers.values()) {
        if (!layer.parked || !layer.parked.size) continue;
        const parked = [...layer.parked];
        layer.parked.clear();
        for (const fn of parked) layerLater(layer, fn, rand(0, 300));
    }
}

// 一次性短音：结束后自动断开；图层销毁时统一停掉。
// 随机声像：鸟鸣每句、雷声每次、虫鸣每只各取一个位置；环境不支持 StereoPanner 时直连。
function panTo(layer, pan, parts) {
    if (!pan || typeof layer.ctx.createStereoPanner !== 'function') return layer.out;
    const panner = layer.ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(layer.out);
    parts.push(panner);
    return panner;
}

function blip(layer, at, duration, build, pan = 0) {
    const ctx = layer.ctx;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    amp.gain.value = 0;
    build(osc, amp);
    const parts = [osc, amp];
    osc.connect(amp);
    amp.connect(panTo(layer, pan, parts));
    for (const node of parts) layer.transient.add(node);
    osc.onended = () => {
        for (const node of parts) {
            layer.transient.delete(node);
            try { node.disconnect(); } catch { /* ignore */ }
        }
    };
    osc.start(at);
    osc.stop(at + duration + 0.03);
}

function voiceRain(layer) {
    const heavy = layer.level === 'heavy';
    const light = layer.level === 'light';
    chain(makeNoise(layer), makeFilter(layer, 'highpass', 400), makeFilter(layer, 'lowpass', heavy ? 7000 : 5500), makeGain(layer, 0.42), layer.out);
    if (heavy) chain(makeNoise(layer), makeFilter(layer, 'lowpass', 350), makeGain(layer, 0.25), layer.out);
    const [minGap, maxGap] = heavy ? [50, 180] : light ? [260, 900] : [120, 420];
    const drop = () => {
        const at = layer.ctx.currentTime + 0.03;
        const freq = rand(2000, 4000);
        const peak = rand(0.012, 0.035);
        blip(layer, at, 0.05, (osc, amp) => {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * 0.85, at);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.25, at + 0.025);
            amp.gain.setValueAtTime(FLOOR, at);
            amp.gain.exponentialRampToValueAtTime(peak, at + 0.003);
            amp.gain.exponentialRampToValueAtTime(FLOOR, at + 0.05);
        });
        layerLater(layer, drop, rand(minGap, maxGap));
    };
    layerLater(layer, drop, rand(minGap, maxGap));
}

function voiceWind(layer) {
    const band = makeFilter(layer, 'bandpass', 550, 1);
    const swell = makeGain(layer, layer.level === 'heavy' ? 0.7 : 0.5);
    chain(makeNoise(layer), band, swell, layer.out);
    makeLfo(layer, rand(0.07, 0.15), 350, band.frequency);
    makeLfo(layer, rand(0.05, 0.11), 0.2, swell.gain);
    const low = makeGain(layer, 0.18);
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 180), low, layer.out);
    makeLfo(layer, rand(0.04, 0.08), 0.1, low.gain);
}

function chirp(layer, at, base, duration, peak, pan) {
    blip(layer, at, duration, (osc, amp) => {
        osc.type = 'sine';
        const top = base * rand(1.5, 1.8);
        osc.frequency.setValueAtTime(base, at);
        osc.frequency.exponentialRampToValueAtTime(top, at + duration * 0.45);
        osc.frequency.exponentialRampToValueAtTime(base * rand(1, 1.15), at + duration);
        amp.gain.setValueAtTime(FLOOR, at);
        amp.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.012, duration * 0.3));
        amp.gain.exponentialRampToValueAtTime(FLOOR, at + duration);
    }, pan);
}

function phrase(layer, start, base) {
    const count = 2 + Math.floor(Math.random() * 5);
    const peak = rand(0.025, 0.055);
    const pan = rand(-0.6, 0.6);
    let at = start;
    for (let i = 0; i < count; i++) {
        const duration = rand(0.04, 0.12);
        chirp(layer, at, base * rand(0.96, 1.04), duration, peak * rand(0.7, 1), pan);
        at += duration + rand(0.03, 0.09);
    }
    return at;
}

function voiceBirds(layer) {
    const birds = [rand(2300, 2700), rand(2800, 3300), rand(2000, 2400)];
    const sing = () => {
        const bird = birds[Math.floor(Math.random() * birds.length)];
        const end = phrase(layer, layer.ctx.currentTime + 0.05, bird);
        if (Math.random() < 0.3) {
            const other = birds.find((b) => b !== bird) || bird * 1.2;
            phrase(layer, end + rand(0.2, 0.5), other);
        }
        layerLater(layer, sing, rand(1500, 6000));
    };
    layerLater(layer, sing, rand(300, 1500));
}

function voiceInsects(layer) {
    const voices = 2 + Math.floor(Math.random() * 2);
    for (let v = 0; v < voices; v++) {
        const osc = own(layer, layer.ctx.createOscillator());
        osc.type = 'sine';
        osc.frequency.value = rand(4000, 5000);
        const amp = makeGain(layer, 0);
        const parts = [];
        chain(osc, amp, panTo(layer, rand(-0.6, 0.6), parts));
        for (const node of parts) own(layer, node);
        osc.start();
        const rate = rand(26, 34);
        const peak = rand(0.012, 0.024);
        const trill = () => {
            const start = layer.ctx.currentTime + 0.05;
            const end = start + rand(0.3, 0.6);
            const pulse = 1 / rate;
            for (let t = start; t < end; t += pulse) {
                amp.gain.setValueAtTime(0, t);
                amp.gain.linearRampToValueAtTime(peak, t + pulse * 0.2);
                amp.gain.linearRampToValueAtTime(0, t + pulse * 0.65);
            }
            layerLater(layer, trill, (end - start) * 1000 + rand(400, 2200));
        };
        layerLater(layer, trill, rand(100, 1500));
    }
}

function voiceWaves(layer) {
    const body = makeGain(layer, 0.08);
    const foam = makeGain(layer, 0.02);
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', rand(500, 900), 0.5), body, layer.out);
    chain(makeNoise(layer), makeFilter(layer, 'bandpass', 2400, 0.6), foam, layer.out);
    const heavy = layer.level === 'heavy' ? 1.3 : 1;
    const swell = () => {
        const period = rand(6, 10);
        const t = layer.ctx.currentTime + 0.05;
        body.gain.cancelScheduledValues(t);
        body.gain.setTargetAtTime(rand(0.35, 0.5) * heavy, t, period * 0.13);
        body.gain.setTargetAtTime(0.07, t + period * 0.45, period * 0.18);
        foam.gain.cancelScheduledValues(t);
        foam.gain.setTargetAtTime(rand(0.06, 0.1) * heavy, t + period * 0.3, period * 0.06);
        foam.gain.setTargetAtTime(0.01, t + period * 0.5, period * 0.15);
        layerLater(layer, swell, period * 1000);
    };
    swell();
}

function voiceCrowd(layer) {
    const murmur = makeGain(layer, 0.2);
    chain(makeNoise(layer), makeFilter(layer, 'highpass', 300), makeFilter(layer, 'lowpass', 1500), murmur, layer.out);
    const formant = makeFilter(layer, 'bandpass', 700, 1.2);
    chain(makeNoise(layer), formant, makeGain(layer, 0.12), layer.out);
    makeLfo(layer, rand(0.2, 0.4), 250, formant.frequency);
    const wander = () => {
        murmur.gain.setTargetAtTime(rand(0.12, 0.28), layer.ctx.currentTime, 0.6);
        layerLater(layer, wander, rand(700, 2000));
    };
    wander();
}

// 一次性滤波噪声：起音后按时间常数衰减，结束后自动断开；图层销毁时统一停掉。
function noiseBurst(layer, at, duration, { type, frequency, q = 0.7, peak, attack = 0.005, pan = 0 }) {
    const ctx = layer.ctx;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    amp.gain.value = 0;
    amp.gain.setValueAtTime(FLOOR, at);
    amp.gain.exponentialRampToValueAtTime(peak, at + attack);
    amp.gain.setTargetAtTime(0, at + attack, Math.max(0.01, (duration - attack) / 4));
    const parts = [src, filter, amp];
    chain(src, filter, amp, panTo(layer, pan, parts));
    for (const node of parts) layer.transient.add(node);
    src.onended = () => {
        for (const node of parts) {
            layer.transient.delete(node);
            try { node.disconnect(); } catch { /* ignore */ }
        }
    };
    src.start(at, Math.random() * 1.9);
    src.stop(at + duration + 0.05);
}

function listen(layer, target, type, handler) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler);
    layer.cleanups.push(() => target.removeEventListener(type, handler));
}

// 雷声：heavy 时多为近雷（先一声噼啪再滚雷），其余为远处闷雷。
function voiceThunder(layer) {
    const heavy = layer.level === 'heavy';
    const rumble = () => {
        const at = layer.ctx.currentTime + 0.03;
        const near = heavy && Math.random() < 0.6;
        const pan = rand(-0.4, 0.4);
        if (near) noiseBurst(layer, at, 0.35, { type: 'bandpass', frequency: 1800, q: 0.6, peak: 0.5, attack: 0.003, pan });
        noiseBurst(layer, at + (near ? 0.04 : 0), rand(2.5, 4), {
            pan,
            type: 'lowpass',
            frequency: near ? 420 : 260,
            peak: near ? 0.9 : 0.6,
            attack: near ? 0.02 : rand(0.15, 0.35),
        });
    };
    if (layer.synced) {
        // 光比声快：闪屏后 0.3~2s 再响。
        listen(layer, layer.state.root, WEATHER_FLASH_EVENT, () => layerLater(layer, rumble, rand(300, 2000)));
        return;
    }
    const [minGap, maxGap] = heavy ? THUNDER_GAP_MS.heavy : THUNDER_GAP_MS.other;
    const loop = () => {
        rumble();
        layerLater(layer, loop, rand(minGap, maxGap));
    };
    layerLater(layer, loop, rand(1500, 3500));
}

function voiceStream(layer) {
    const band = makeFilter(layer, 'bandpass', 1600, 0.8);
    chain(makeNoise(layer), band, makeGain(layer, layer.level === 'heavy' ? 0.4 : 0.28), layer.out);
    makeLfo(layer, rand(0.3, 0.6), 400, band.frequency);
    chain(makeNoise(layer), makeFilter(layer, 'highpass', 3500), makeGain(layer, 0.05), layer.out);
    const bubble = () => {
        const at = layer.ctx.currentTime + 0.03;
        const freq = rand(500, 1300);
        const peak = rand(0.015, 0.04);
        blip(layer, at, 0.04, (osc, amp) => {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, at);
            osc.frequency.exponentialRampToValueAtTime(freq * rand(1.4, 2), at + 0.035);
            amp.gain.setValueAtTime(FLOOR, at);
            amp.gain.exponentialRampToValueAtTime(peak, at + 0.004);
            amp.gain.exponentialRampToValueAtTime(FLOOR, at + 0.04);
        });
        layerLater(layer, bubble, rand(60, 260));
    };
    layerLater(layer, bubble, rand(100, 400));
}

function voiceFire(layer) {
    const roar = makeGain(layer, 0.22);
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 220), roar, layer.out);
    makeLfo(layer, rand(0.15, 0.3), 0.08, roar.gain);
    // 噼啪成簇出现：一簇 1~4 声，簇间隔较长。
    const crackle = () => {
        const count = 1 + Math.floor(Math.random() * 4);
        let at = layer.ctx.currentTime + 0.03;
        for (let i = 0; i < count; i++) {
            noiseBurst(layer, at, rand(0.01, 0.035), { type: 'highpass', frequency: rand(1500, 3500), peak: rand(0.15, 0.4), attack: 0.001 });
            at += rand(0.02, 0.09);
        }
        layerLater(layer, crackle, rand(120, 900));
    };
    layerLater(layer, crackle, rand(100, 500));
}

// 雪夜：极轻的低频气流 + 缓慢起伏的空旷感，刻意压低，只做「安静」的底色。
function voiceSnow(layer) {
    const hush = makeGain(layer, 0.12);
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 380), hush, layer.out);
    makeLfo(layer, rand(0.03, 0.06), 0.06, hush.gain);
    const air = makeFilter(layer, 'bandpass', 900, 2);
    chain(makeNoise(layer), air, makeGain(layer, 0.03), layer.out);
    makeLfo(layer, rand(0.02, 0.05), 250, air.frequency);
}

// 唱片底噪：细密嘶声 + 随机噼啪，偶尔一声较重的爆点。
function voiceVinyl(layer) {
    chain(makeNoise(layer), makeFilter(layer, 'highpass', 5000), makeGain(layer, 0.04), layer.out);
    const pop = () => {
        const heavy = Math.random() < 0.08;
        noiseBurst(layer, layer.ctx.currentTime + 0.02, heavy ? 0.03 : rand(0.004, 0.012), {
            type: 'bandpass', frequency: rand(1500, 4500), q: 0.8, peak: heavy ? 0.35 : rand(0.05, 0.16), attack: 0.001,
        });
        layerLater(layer, pop, rand(60, 700));
    };
    layerLater(layer, pop, rand(50, 300));
}

const VOICES = Object.freeze({
    rain: voiceRain,
    wind: voiceWind,
    birds: voiceBirds,
    insects: voiceInsects,
    waves: voiceWaves,
    crowd: voiceCrowd,
    thunder: voiceThunder,
    stream: voiceStream,
    fire: voiceFire,
    snow: voiceSnow,
    vinyl: voiceVinyl,
});

function disposeLayer(state, layer) {
    layer.stopped = true;
    for (const cleanup of layer.cleanups.splice(0)) {
        try { cleanup(); } catch { /* ignore */ }
    }
    for (const timer of layer.timers) {
        try { state.clear(timer); } catch { /* ignore */ }
    }
    layer.timers.clear();
    for (const node of [...layer.nodes, ...layer.transient]) {
        try { node.stop?.(); } catch { /* not started or already stopped */ }
        try { node.disconnect(); } catch { /* ignore */ }
    }
    layer.nodes.length = 0;
    layer.transient.clear();
    layer.parked.clear();
}

function startLayer(state, spec) {
    const ctx = state.ctx;
    const layer = {
        key: layerKey(spec),
        kind: spec.kind,
        level: spec.level,
        synced: spec.synced === true,
        ctx,
        state,
        nodes: [],
        transient: new Set(),
        parked: new Set(),
        timers: new Set(),
        cleanups: [],
        stopped: false,
        out: null,
    };
    try {
        layer.out = makeGain(layer, 0);
        let tail = layer.out;
        if (spec.muffled) tail = chain(tail, makeFilter(layer, 'lowpass', MUFFLE_HZ, 0.5));
        tail.connect(state.tone ? state.tone.input : state.master);
        VOICES[spec.kind](layer);
        const now = ctx.currentTime;
        layer.out.gain.setValueAtTime(0, now);
        layer.out.gain.linearRampToValueAtTime(LEVEL_GAIN[spec.level] || LEVEL_GAIN.medium, now + AMBIENT_FADE_IN_S);
    } catch {
        disposeLayer(state, layer);
        return null;
    }
    return layer;
}

function fadeOutLayer(state, layer) {
    const ctx = state.ctx;
    try {
        const now = ctx.currentTime;
        const gain = layer.out.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + AMBIENT_FADE_OUT_S);
    } catch { /* ignore */ }
    later(state, () => disposeLayer(state, layer), AMBIENT_FADE_OUT_S * 1000 + 100);
}

function syncAmbient(state, plan, volume, toneKey = '', spaceKey = '') {
    const wanted = new Map(plan.map((spec) => [layerKey(spec), spec]));
    for (const [key, layer] of state.layers) {
        if (wanted.has(key)) continue;
        state.layers.delete(key);
        fadeOutLayer(state, layer);
    }
    if (!wanted.size) return;
    if (!ensureContext(state)) return;
    resumeContext(state);
    syncTone(state, toneKey, spaceKey);
    if (state.masterVolume !== volume) {
        state.masterVolume = volume;
        try { state.master.gain.setTargetAtTime(volume * gainFactor(state), state.ctx.currentTime, 0.15); } catch { /* ignore */ }
    }
    for (const [key, spec] of wanted) {
        if (state.layers.has(key)) continue;
        const layer = startLayer(state, spec);
        if (layer) state.layers.set(key, layer);
    }
}

export function applySceneAudio(root, options = {}) {
    const source = plainObject(options);
    const context = plainObject(source.context);
    const active = source.active !== false;
    // 总音量（readerSettings.audioMaster）作用于整条混音总线；未传时保持现值。
    if (source.master !== undefined) setAudioMasterVolume(normalizeAudioMasterSettings(source.master).volume);
    const bgm = normalizeBgmSettings(source.bgm);
    const ambient = normalizeAmbientSoundSettings(source.ambient);
    const track = active && bgm.enabled ? pickBgmTrack(bgm.tracks, context) : null;
    const plan = active ? resolveAmbientPlan(context, ambient, source.weatherSettings) : [];
    const tone = plan.length ? resolveAmbientTone(context) : '';
    const space = plan.length ? resolveAmbientSpace(context.location, source.weatherSettings) : '';
    const result = { track, ambient: plan, tone, space };
    if (!root || typeof root !== 'object') return result;
    let state = states.get(root);
    if (!state) {
        if (!track && !plan.length) return result;
        state = createState(root);
        states.set(root, state);
        liveStates.add(state);
        watchVisibility(state);
    }
    if (typeof source.schedule === 'function') state.schedule = source.schedule;
    if (typeof source.clear === 'function') state.clear = source.clear;
    if (typeof source.audioFactory === 'function') state.audioFactory = source.audioFactory;
    if (typeof source.contextFactory === 'function') state.contextFactory = source.contextFactory;
    const key = [track ? track.url : '', bgm.volume, audioMasterVolume(), plan.map(layerKey).join(','), ambient.volume, tone, space].join('|');
    if (key === state.key) return result;
    state.key = key;
    syncBgm(state, track, bgm.volume);
    syncAmbient(state, plan, ambient.volume, tone, space);
    return result;
}

export function cancelSceneAudio(root) {
    const state = root && states.get(root);
    if (!state) return false;
    state.stopped = true;
    states.delete(root);
    liveStates.delete(state);
    disarmRetry(state);
    unwatchVisibility(state);
    for (const timer of state.timers) {
        try { state.clear(timer); } catch { /* ignore */ }
    }
    state.timers.clear();
    const entries = [...state.bgm.fading];
    if (state.bgm.current) entries.push(state.bgm.current);
    for (const entry of entries) releaseAudio(entry.audio);
    state.bgm.fading.clear();
    state.bgm.current = null;
    for (const layer of state.layers.values()) disposeLayer(state, layer);
    state.layers.clear();
    for (const node of state.tone ? state.tone.nodes : []) {
        try { node.disconnect(); } catch { /* ignore */ }
    }
    state.tone = null;
    if (state.master) {
        try { state.master.disconnect(); } catch { /* ignore */ }
    }
    state.master = null;
    state.ctx = null;
    return true;
}
