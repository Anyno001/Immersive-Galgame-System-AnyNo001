// 角色语气音：台词开头按情绪播放一条短语气声（「啊、嗯、哼」，不带词义，非 TTS）。
// 声线来自内置声音包（voice-packs.js）；每个角色可在角色设定里手动指定声线，未指定时按 DNA 判断性别、
// 再按名字固定分到同性别的一套声线，保证不同角色天然不同、同一角色始终同一个声音。
import { VOICE_PACKS } from '../../voice/voice-packs.js';
import { moodFallbackChain, resolvePresetGroup } from '../../scene/mood-groups.js';
import { busInput, resumeAudioBus } from './audio-bus.js';
import { duckSceneAudio } from './scene-audio.js';
import { spritePan, yieldTypewriterAudio } from './typewriter-audio.js';

export const VOICE_BARK_FREQUENCIES = Object.freeze([
    ['change', '换人或情绪变化时'],
    ['sometimes', '偶尔'],
    ['every', '每句台词'],
]);
export const VOICE_BARK_DEFAULTS = Object.freeze({ enabled: false, volume: 0.8, frequency: 'change' });
// 「偶尔」档：换人或情绪变化时再按这个概率播放。
const SOMETIMES_RATE = 0.35;
// 角色音高微调范围（半音）。playbackRate 会让音高和共振峰一起移动，±3 以内仍像同一类声音。
export const VOICE_PITCH_LIMIT = 3;
// 角色语速（倍）：和音高分开调，播放前做保留音高的时间伸缩。
export const VOICE_SPEED_RANGE = Object.freeze([0.8, 1.4]);
const BASE_MOOD = '平和';
// 力度：喊出来的情绪响一点，软下来的情绪轻一点；close 的不进房间混响（走 dry），像凑在耳边说。
const BARK_SHAPES = Object.freeze({
    愤怒: Object.freeze({ gain: 1.2 }), 惊讶: Object.freeze({ gain: 1.15 }), 大笑: Object.freeze({ gain: 1.15 }), 得意: Object.freeze({ gain: 1.05 }),
    害羞: Object.freeze({ gain: 0.7, close: true }), 心虚: Object.freeze({ gain: 0.7, close: true }),
    动情: Object.freeze({ gain: 0.65, close: true }), 爱恋: Object.freeze({ gain: 0.8, close: true }),
    思考: Object.freeze({ gain: 0.75 }), 委屈: Object.freeze({ gain: 0.8 }), 冷淡: Object.freeze({ gain: 0.8 }),
    悲伤: Object.freeze({ gain: 0.8 }), 无奈: Object.freeze({ gain: 0.85 }), 哭泣: Object.freeze({ gain: 0.9 }),
});
const WHISPER_SHAPE = Object.freeze({ gain: 0.6, close: true });
// 电话那头：听筒频段、单声道、不进房间混响。
const PHONE_GAIN = 0.85;
const PHONE_BAND = Object.freeze({ high: 380, low: 3200 });
const GAIN_CAP = 1.2;
// 语气音响着时 BGM 与环境音让一下（比提示音轻）；打字音整段静音到语气音念完。
const BARK_DUCK_RATIO = 0.7;
const BARK_TAIL_S = 0.05;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const PACK_BY_ID = new Map(VOICE_PACKS.map((pack) => [pack.id, pack]));

export function voicePackById(id) {
    return PACK_BY_ID.get(String(id || '')) || null;
}

export function voicePackOptions() {
    return VOICE_PACKS.map((pack) => [pack.id, pack.name, pack.gender]);
}

export function voicePackCredits() {
    return Array.from(new Set(VOICE_PACKS.map((pack) => pack.credit)));
}

export function normalizeVoiceBarkSettings(value) {
    const source = plainObject(value) || {};
    const volume = Number(source.volume);
    return {
        enabled: source.enabled === true,
        volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : VOICE_BARK_DEFAULTS.volume,
        frequency: VOICE_BARK_FREQUENCIES.some(([id]) => id === source.frequency) ? source.frequency : VOICE_BARK_DEFAULTS.frequency,
    };
}

// 单个角色的声线设置：pack 为空表示自动；'off' 表示这个角色不发语气音。tts 为台词朗读单独指定的声音名，空为自动。
export function normalizeCharacterVoice(value) {
    const source = plainObject(value) || {};
    const pack = source.pack === 'off' || voicePackById(source.pack) ? source.pack : '';
    const pitch = Number(source.pitch);
    return {
        pack,
        pitch: Number.isFinite(pitch) ? Math.max(-VOICE_PITCH_LIMIT, Math.min(VOICE_PITCH_LIMIT, Math.round(pitch * 2) / 2)) : 0,
        speed: normalizeVoiceSpeed(source.speed),
        tts: typeof source.tts === 'string' ? source.tts.trim().slice(0, 200) : '',
        ttsVolume: normalizeTtsVolume(source.ttsVolume),
    };
}

// 朗读音量（倍）：0～1，0 表示这个角色不朗读；缺省 1。
function normalizeTtsVolume(value) {
    const volume = Number(value);
    return value === undefined || value === null || value === '' || !Number.isFinite(volume) ? 1 : Math.max(0, Math.min(1, volume));
}

export function normalizeVoiceSpeed(value) {
    const speed = Number(value);
    if (!Number.isFinite(speed) || speed <= 0) return 1;
    return Math.round(Math.max(VOICE_SPEED_RANGE[0], Math.min(VOICE_SPEED_RANGE[1], speed)) * 10) / 10;
}

export function normalizeCharacterVoices(value) {
    const out = {};
    const source = plainObject(value);
    if (!source) return out;
    for (const [name, entry] of Object.entries(source)) {
        const key = String(name || '').trim();
        if (!key || FORBIDDEN_KEYS.has(key)) continue;
        const voice = normalizeCharacterVoice(entry);
        if (!voice.pack && !voice.pitch && voice.speed === 1 && !voice.tts && voice.ttsVolume === 1) continue;
        const { tts, ttsVolume, ...bark } = voice;
        out[key] = { ...bark, ...(tts ? { tts } : {}), ...(ttsVolume !== 1 ? { ttsVolume } : {}) };
    }
    return out;
}

// 说话人可能写的是别名；别名表以主名为键。
export function canonicalName(sceneAssets, name) {
    const target = String(name || '').trim();
    if (!target) return '';
    const maps = [sceneAssets.characterVoices, sceneAssets.characters, sceneAssets.characterDna].map(plainObject);
    if (maps.some((map) => map && hasOwn(map, target))) return target;
    const aliases = plainObject(sceneAssets.characterAliases) || {};
    for (const [key, values] of Object.entries(aliases)) {
        if (Array.isArray(values) && values.some((v) => String(v || '').trim() === target)) return key;
    }
    return target;
}

const MALE_RE = /\b(?:1boy|boy|male|man|shota|bishounen)\b|男|少年|青年|大叔|爷爷|老头|父亲|兄长|哥哥|弟弟|先生|王子|公子/gi;
const FEMALE_RE = /\b(?:1girl|girl|female|woman|loli)\b|女|姐姐|妹妹|阿姨|奶奶|母亲|小姐|公主|夫人/gi;
// 自动分配不用的声线：老人声只给手动指定，免得年轻角色随机分到。
const AUTO_EXCLUDE = new Set(['vv-chibijii']);

// DNA 里的性别：英文 tag 优先（1boy / 1girl 最可靠），其次比中文称呼的命中次数；打平时不判断。
export function detectVoiceGender(text) {
    const value = String(text || '');
    const tag = value.match(/\b1(boy|girl)\b/i);
    if (tag) return tag[1].toLowerCase() === 'boy' ? 'male' : 'female';
    const male = (value.match(MALE_RE) || []).length;
    const female = (value.match(FEMALE_RE) || []).length;
    if (male === female) return '';
    return male > female ? 'male' : 'female';
}

// 按主名查 DNA 判断性别（声线和立绘默认高度共用）；没有 DNA 或看不出时返回 ''。
export function characterDnaGender(sceneAssets, name) {
    const dnaMap = plainObject(sceneAssets && sceneAssets.characterDna) || {};
    const dna = name && hasOwn(dnaMap, name) ? plainObject(dnaMap[name]) : null;
    return dna ? detectVoiceGender(`${dna.triggerWords || ''}\n${dna.identity || ''}\n${dna.defaultAppearance || ''}`) : '';
}

function hashName(name) {
    let h = 2166136261;
    for (const ch of String(name)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
}

// 返回 { pack, pitch, speed, source }：source 为 manual / dna / off / ''（性别未知时不自动分配，避免男角色配到女声）。
export function resolveCharacterVoice(sceneAssets, speaker) {
    const assets = plainObject(sceneAssets) || {};
    const name = canonicalName(assets, speaker);
    if (!name) return { pack: null, pitch: 0, speed: 1, source: '' };
    const manualMap = plainObject(assets.characterVoices) || {};
    const manual = normalizeCharacterVoice(hasOwn(manualMap, name) ? manualMap[name] : null);
    const tune = { pitch: manual.pitch, speed: manual.speed };
    if (manual.pack === 'off') return { pack: null, pitch: 0, speed: 1, source: 'off' };
    if (manual.pack) return { pack: voicePackById(manual.pack), ...tune, source: 'manual' };
    const gender = characterDnaGender(assets, name);
    const pool = gender ? VOICE_PACKS.filter((pack) => pack.gender === gender && !AUTO_EXCLUDE.has(pack.id)) : [];
    if (!pool.length) return { pack: null, ...tune, source: '' };
    return { pack: pool[hashName(name) % pool.length], ...tune, source: 'dna' };
}

// 情绪词 → 20 个标签之一；默认 / 未知落到「平和」。
export function resolveBarkMood(word) {
    const label = resolvePresetGroup(word);
    return label && label !== '默认' ? label : BASE_MOOD;
}

// 同方向回退，最后落到「平和」；同一情绪有多条时避开上一条。
// ready：已解码好的音频；池里有现成的就先挑现成的，免得第一次开口要等下载。
export function pickBarkClip(pack, mood, { last = '', random = Math.random, ready = null } = {}) {
    if (!pack || !pack.clips) return '';
    for (const label of [mood, ...moodFallbackChain(mood), BASE_MOOD]) {
        const clips = pack.clips[label];
        if (!clips || !clips.length) continue;
        let pool = clips.length > 1 ? clips.filter((url) => url !== last) : clips;
        const warm = ready ? pool.filter((url) => ready.has(url)) : [];
        if (warm.length) pool = warm;
        return pool[Math.floor(random() * pool.length) % pool.length];
    }
    return '';
}

// 这一句的力度、声像与去向：耳语 > 情绪；电话那头一律听筒音色、居中。
export function resolveBarkShape(line, mood) {
    if (line.phone) return { gain: PHONE_GAIN, close: true, phone: true, pan: 0 };
    const shape = (line.whisper ? WHISPER_SHAPE : BARK_SHAPES[mood]) || { gain: 1 };
    return { gain: shape.gain, close: shape.close === true, phone: false, pan: spritePan(line.posX) };
}

// 这一句要不要发声（纯函数，便于测试）。state 跨句记忆：上一句的 key / 说话人 / 情绪 / 每套声线上一条。
export function decideVoiceBark(state, line, settings, { sceneAssets, random = Math.random, ready = null } = {}) {
    const config = normalizeVoiceBarkSettings(settings);
    const key = String(line.key || '');
    if (key && key === state.lastKey) return null;
    state.lastKey = key;
    if (!config.enabled || config.volume <= 0) return null;
    // 只给正常台词：旁白、心里话、NSFW 场景都不发声（会出戏）；电话那头的台词走听筒音色。
    if (line.textType !== 'dialogue' || line.nsfw) return null;
    const speaker = String(line.speaker || '').trim();
    if (!speaker) return null;
    const mood = resolveBarkMood(line.mood);
    const changed = speaker !== state.lastSpeaker || mood !== state.lastMood;
    state.lastSpeaker = speaker;
    state.lastMood = mood;
    if (config.frequency !== 'every' && !changed) return null;
    if (config.frequency === 'sometimes' && random() >= SOMETIMES_RATE) return null;
    const voice = resolveCharacterVoice(sceneAssets, speaker);
    if (!voice.pack) return null;
    const lastBy = state.lastClip || (state.lastClip = new Map());
    const slot = `${voice.pack.id}|${mood}`;
    const url = pickBarkClip(voice.pack, mood, { last: lastBy.get(slot) || '', random, ready });
    if (!url) return null;
    lastBy.set(slot, url);
    const shape = resolveBarkShape(line, mood);
    return {
        url, volume: Math.min(GAIN_CAP, config.volume * shape.gain), pitch: voice.pitch, speed: voice.speed, pack: voice.pack.id, mood,
        pan: shape.pan, close: shape.close, phone: shape.phone,
    };
}

const decoded = new Map();
const ready = new Set();
const stretched = new Map();
const warmedPacks = new Set();
const warmedMoods = new Set();
let active = null;

function loadBuffer(context, url) {
    if (!decoded.has(url)) {
        const job = fetch(url)
            .then((res) => (res.ok ? res.arrayBuffer() : null))
            .then((bytes) => (bytes ? context.decodeAudioData(bytes) : null))
            .catch(() => null);
        decoded.set(url, job);
        // 失败的不缓存，下次重试（网络抖动）。
        job.then((buffer) => {
            if (buffer) ready.add(url);
            else decoded.delete(url);
        });
    }
    return decoded.get(url);
}

// 预加载：场上角色的声线每种情绪先备一条（约 20 条、几十 KB），第一次开口就有现成的；
// 某种情绪真用到时再把这一情绪的其余几条备齐，换着播。
function warmUrls(urls) {
    const bus = busInput('voice');
    if (!bus) return;
    for (const url of urls) if (url) loadBuffer(bus.context, url);
}

export function warmVoicePack(pack) {
    if (!pack || !pack.clips || warmedPacks.has(pack.id)) return false;
    warmedPacks.add(pack.id);
    warmUrls(Object.values(pack.clips).map((clips) => clips[0]));
    return true;
}

function warmMood(packId, mood) {
    const pack = voicePackById(packId);
    const key = `${packId}|${mood}`;
    if (!pack || warmedMoods.has(key)) return;
    warmedMoods.add(key);
    warmUrls(pack.clips[mood] || []);
}

export function warmCastVoices(sceneAssets, names, settings) {
    if (!normalizeVoiceBarkSettings(settings).enabled || !Array.isArray(names)) return 0;
    let count = 0;
    for (const name of new Set(names.map((n) => String(n || '').trim()).filter(Boolean))) {
        const voice = resolveCharacterVoice(sceneAssets, name);
        if (voice.pack && warmVoicePack(voice.pack)) count += 1;
    }
    return count;
}

// 保留音高的时间伸缩（WSOLA）：把 samples 拉长到 ratio 倍。每段在 ±8ms 内找与上一段自然延续最像的位置，避免相位打架。
// 语气音不到 1.5 秒、单声道，几毫秒就算完。
export function stretchSamples(samples, sampleRate, ratio) {
    const length = samples.length;
    if (Math.abs(ratio - 1) < 0.01 || length < 64) return samples;
    const outLength = Math.max(1, Math.round(length * ratio));
    const win = Math.max(32, Math.round(sampleRate * 0.03));
    const hopOut = win >> 1;
    const hopIn = hopOut / ratio;
    const tol = Math.round(sampleRate * 0.008);
    const out = new Float32Array(outLength + win);
    const norm = new Float32Array(outLength + win);
    const hann = new Float32Array(win);
    for (let i = 0; i < win; i += 1) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1));
    let prev = -1;
    for (let k = 0, outPos = 0; outPos < outLength; k += 1, outPos += hopOut) {
        const target = Math.min(Math.round(k * hopIn), Math.max(0, length - win));
        let start = target;
        if (prev >= 0) {
            const natural = prev + hopOut;
            let best = -Infinity;
            for (let d = -tol; d <= tol; d += 2) {
                const s = target + d;
                if (s < 0 || s + win > length) continue;
                let score = 0;
                for (let i = 0; i < win; i += 4) score += samples[s + i] * (natural + i < length ? samples[natural + i] : 0);
                if (score > best) { best = score; start = s; }
            }
        }
        for (let i = 0; i < win && start + i < length; i += 1) {
            out[outPos + i] += samples[start + i] * hann[i];
            norm[outPos + i] += hann[i];
        }
        prev = start;
    }
    const result = new Float32Array(outLength);
    for (let i = 0; i < outLength; i += 1) result[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
    return result;
}

// 音高用 playbackRate（会同时变速），语速差额靠事先伸缩补齐：先拉长 rate / speed 倍，再按 rate 播放。
function tunedBuffer(context, url, buffer, rate, speed) {
    const ratio = rate / speed;
    if (Math.abs(ratio - 1) < 0.01) return buffer;
    const key = `${url}|${ratio.toFixed(3)}`;
    if (!stretched.has(key)) {
        try {
            const data = stretchSamples(buffer.getChannelData(0), buffer.sampleRate, ratio);
            const out = context.createBuffer(1, data.length, buffer.sampleRate);
            out.getChannelData(0).set(data);
            stretched.set(key, out);
        } catch {
            return buffer;
        }
    }
    return stretched.get(key);
}

function releaseJob(job) {
    if (job.releaseDuck) job.releaseDuck();
    job.releaseDuck = null;
    for (const node of job.nodes) {
        try { node.disconnect(); } catch { /* already disconnected */ }
    }
    job.nodes.length = 0;
}

export function stopVoiceBark() {
    if (!active) return;
    const current = active;
    active = null;
    current.cancelled = true;
    try { current.source && current.source.stop(); } catch { /* already stopped */ }
    releaseJob(current);
}

// gain →（听筒带通 / 声像）→ 总线；返回链头。
export function buildBarkChain(context, out, { volume, pan, phone }, nodes) {
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(GAIN_CAP, Number(volume) || 0));
    nodes.push(gain);
    let tail = gain;
    const link = (node) => {
        tail.connect(node);
        nodes.push(node);
        tail = node;
    };
    if (phone) {
        const high = context.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = PHONE_BAND.high;
        link(high);
        const low = context.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = PHONE_BAND.low;
        link(low);
    } else if (pan && typeof context.createStereoPanner === 'function') {
        const panner = context.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        link(panner);
    }
    tail.connect(out);
    return gain;
}

// 同一时间只有一条语气音：新的一句开始时掐掉上一条，避免翻页快时叠成一片。
// close / phone 走 dry（不进房间混响）；yieldTyping 为真时这一句的打字音让到语气音念完；duck 为真时 BGM 与环境音让一下。
export function playVoiceBark({ url, volume = 1, pitch = 0, speed = 1, pan = 0, close = false, phone = false, yieldTyping = false, duck = false } = {}) {
    if (!url) return null;
    const bus = busInput(close || phone ? 'dry' : 'voice');
    if (!bus) return null;
    stopVoiceBark();
    const context = bus.context;
    const job = { cancelled: false, source: null, nodes: [], releaseDuck: null };
    active = job;
    Promise.all([resumeAudioBus(), loadBuffer(context, url)]).then(([, buffer]) => {
        if (job.cancelled || !buffer || context.state !== 'running') return;
        try {
            const rate = 2 ** (Math.max(-VOICE_PITCH_LIMIT, Math.min(VOICE_PITCH_LIMIT, Number(pitch) || 0)) / 12);
            const source = context.createBufferSource();
            source.buffer = tunedBuffer(context, url, buffer, rate, normalizeVoiceSpeed(speed));
            source.playbackRate.value = rate;
            source.connect(buildBarkChain(context, bus, { volume, pan, phone }, job.nodes));
            source.onended = () => {
                releaseJob(job);
                if (active === job) active = null;
            };
            job.source = source;
            source.start();
            const seconds = (source.buffer.duration || 0) / rate + BARK_TAIL_S;
            if (yieldTyping) yieldTypewriterAudio(seconds);
            if (duck) job.releaseDuck = duckSceneAudio({ ratio: BARK_DUCK_RATIO, durationMs: seconds * 1000 + 150 });
        } catch {
            releaseJob(job);
            if (active === job) active = null;
        }
    });
    return job;
}

const states = new WeakMap();

// 阅读器每次渲染调用；同一句重复渲染（设置变化、窗口缩放）由 key 去重，不会重播。
// line.cast：场上角色名（说话人、立绘、同屏），先把他们的声线备好。
export function applyVoiceBark(root, line, settings, sceneAssets) {
    if (!root) return null;
    let state = states.get(root);
    if (!state) states.set(root, (state = {}));
    warmCastVoices(sceneAssets, line.cast, settings);
    const plan = decideVoiceBark(state, line, settings, { sceneAssets, ready });
    if (!plan) return null;
    warmMood(plan.pack, plan.mood);
    return playVoiceBark({ ...plan, yieldTyping: true, duck: true });
}

// 设置里的试听：同一声线依次播几种情绪。
export function previewVoicePack(packId, { pitch = 0, speed = 1, volume = 0.8 } = {}) {
    const pack = voicePackById(packId);
    if (!pack) return;
    const moods = ['喜悦', '惊讶', '害羞', '无奈', '大笑'];
    moods.forEach((mood, i) => {
        setTimeout(() => playVoiceBark({ url: pickBarkClip(pack, mood), volume, pitch, speed }), i * 900);
    });
}
