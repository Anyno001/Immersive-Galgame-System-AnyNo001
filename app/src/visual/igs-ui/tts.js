// 台词朗读（TTS）：逐页朗读台词、心里话，旁白可选。和角色语气音二选一，开了朗读就不播语气音。
// 两种来源：系统语音（浏览器 speechSynthesis，零配置；Windows 上 Edge 有晓晓、云希等在线自然声）
// 和 OpenAI 兼容的 /audio/speech 接口（网站 API，或本地 GPT-SoVITS / CosyVoice 等兼容服务）。
// 系统语音不经过 Web Audio，只能调音量、语速、音高；接口返回的音频走总线，声像、听筒、贴耳与语气音一致。
import { audioMasterVolume, busInput, resumeAudioBus, watchPageAway } from './audio-bus.js';
import { duckSceneAudio } from './scene-audio.js';
import { stripTextFxMarkup } from './text-fx.js';
import { yieldTypewriterAudio } from './typewriter-audio.js';
import { buildBarkChain, canonicalName, characterDnaGender, normalizeCharacterVoice, resolveBarkMood, resolveBarkShape } from './voice-bark.js';

export const TTS_PROVIDERS = Object.freeze([
    ['system', '系统语音'],
    ['api', '接口（网站 / 本地）'],
]);
export const TTS_TRANSPORTS = Object.freeze([
    ['direct', '浏览器直连'],
    ['st-proxy', '酒馆 CORS 代理'],
]);
export const TTS_RATES = Object.freeze([0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5]);
export const TTS_BILINGUAL_MODES = Object.freeze([
    ['translation', '读译文'],
    ['original', '读原文'],
]);
// 角色单独音量：0 为这个角色不朗读。
export const TTS_CHARACTER_VOLUMES = Object.freeze([[1, '100%'], [0.75, '75%'], [0.5, '50%'], [0.25, '25%'], [0, '不朗读']]);
const ROLE_KEYS = ['female', 'male', 'narrator'];
const TTS_DEFAULTS = Object.freeze({ enabled: false, provider: 'system', volume: 0.9, rate: 1, narration: true, nsfw: false });
// 朗读时 BGM 与环境音让得比语气音多一点，台词要听清。
const TTS_DUCK_RATIO = 0.55;
// 心里话轻一点，像在脑子里说。
const THOUGHT_GAIN = 0.8;
// Chrome 一条朗读超过约 15 秒会被掐断，按句切成短段排队念。
const CHUNK_MAX = 120;
// 系统语音拿不到时长，按每秒约 4.5 个字估算，用于让打字音静音。
const CHARS_PER_SECOND = 4.5;
// 内存里留 60 条（一条 mp3 约 30–80KB）；另存一份到浏览器 Cache Storage，重开阅读器、回看旧楼层也能直接用。
const API_CACHE_MAX = 60;
const PERSIST_MAX = 300;
const PERSIST_NAME = 'igs-tts-v1';
// 在一页停够这么久才提前生成下一页；两次翻页间隔短于 FAST_FLIP_MS 视为快速点击，当前页也推迟 FLIP_DEFER_MS 再请求。
const PREFETCH_DWELL_MS = 1500;
const FAST_FLIP_MS = 700;
const FLIP_DEFER_MS = 400;
// 情绪对语速的微调在 0.88～1.08 之间，提前生成的那条按平和语速请求，差这么多以内照用。
const RATE_TOLERANCE = 0.15;
const MAX_FIELD = 300;
const LEXICON_MAX = 4000;
// 系统语音偶尔漏发 onend：按估算时长的 2 倍再加 5 秒兜底收尾，免得自动播放和「翻页不打断」一直等。
const SYSTEM_WATCHDOG_PAD_S = 5;
// 同一条错误提示 30 秒内只弹一次。
const ERROR_REPEAT_MS = 30000;
const LANG_TAGS = Object.freeze({ zh: 'zh-CN', ja: 'ja-JP', en: 'en-US' });

// 情绪对语速、音高的微调（系统语音两项都用，接口只用语速）。
const MOOD_PROSODY = Object.freeze({
    愤怒: { rate: 1.08, pitch: 1.04 }, 惊讶: { rate: 1.06, pitch: 1.08 }, 大笑: { rate: 1.05, pitch: 1.06 },
    喜悦: { rate: 1.03, pitch: 1.04 }, 得意: { rate: 1.02, pitch: 1.02 },
    悲伤: { rate: 0.9, pitch: 0.95 }, 哭泣: { rate: 0.88, pitch: 0.97 }, 委屈: { rate: 0.93, pitch: 0.98 },
    害羞: { rate: 0.94, pitch: 1.03 }, 心虚: { rate: 0.95 }, 思考: { rate: 0.92 }, 冷淡: { rate: 0.96, pitch: 0.96 },
    无奈: { rate: 0.94, pitch: 0.97 }, 动情: { rate: 0.9 }, 爱恋: { rate: 0.94, pitch: 1.02 },
});
const WHISPER_PROSODY = Object.freeze({ rate: 0.92 });

const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const field = (v) => String(v ?? '').trim().slice(0, MAX_FIELD);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function normalizeTtsSettings(value) {
    const source = plainObject(value) || {};
    const system = plainObject(source.system) || {};
    const api = plainObject(source.api) || {};
    const volume = Number(source.volume);
    const rate = Number(source.rate);
    const roles = (src) => Object.fromEntries(ROLE_KEYS.map((key) => [key, field(src[key])]));
    return {
        enabled: source.enabled === true,
        provider: TTS_PROVIDERS.some(([id]) => id === source.provider) ? source.provider : TTS_DEFAULTS.provider,
        volume: Number.isFinite(volume) ? clamp(volume, 0, 1) : TTS_DEFAULTS.volume,
        rate: TTS_RATES.includes(rate) ? rate : TTS_DEFAULTS.rate,
        narration: source.narration !== false,
        nsfw: source.nsfw === true,
        // 翻页不打断：上一句念完再念这一句（快速翻页时只排最新的一句）。
        sustain: source.sustain === true,
        bilingual: source.bilingual === 'original' ? 'original' : 'translation',
        // 读音替换：每行「原词=读法」。
        lexicon: String(source.lexicon ?? '').slice(0, LEXICON_MAX),
        system: roles(system),
        api: {
            transport: api.transport === 'st-proxy' ? 'st-proxy' : 'direct',
            endpoint: field(api.endpoint),
            apiKey: field(api.apiKey),
            model: field(api.model),
            // 可选声音：逗号或换行分隔，给角色单独指定时做下拉。
            voices: field(api.voices),
            // 提前生成下一页：在一页停够 PREFETCH_DWELL_MS 才生成，快速点过的页不花钱。
            prefetch: api.prefetch !== false,
            ...roles(api),
        },
    };
}

export function ttsApiVoiceList(settings) {
    return Array.from(new Set(String(normalizeTtsSettings(settings).api.voices).split(/[,，\n]/).map((v) => v.trim()).filter(Boolean)));
}

// 页面文字 → 要念的纯文本。双语「原文〖译文〗」默认念译文，original 为真时念原文；去掉字效与心里话星号，
// 再过滤念出来会很怪的东西：网址、emoji 与装饰符号、颜文字、括号里的短动作（「（笑）」「(小声)」），连写的～！… 收成一个。
export function ttsPlainText(text, { original = false } = {}) {
    const lines = String(text ?? '').split('\n').map((line) => {
        if (!line.includes('〖')) return line;
        if (original) return line.replace(/〖[^〖〗]*〗/g, ' ');
        const pairs = Array.from(line.matchAll(/〖([^〖〗]*)〗/g), (m) => m[1]);
        return pairs.join('') + line.slice(line.lastIndexOf('〗') + 1);
    });
    return stripTextFxMarkup(lines.join('\n'))
        .replace(/\*/g, '')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '')
        .replace(/[♥♡☆★♪♫♬※→←↑↓■□●○◆◇▲△▼▽◎✧✦❀✿]/g, '')
        .replace(/[（(]([^（）()\n]*)[）)]/g, (match, inner) => (inner.length <= 6 || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/u.test(inner) ? ' ' : match))
        .replace(/([～~ー—！!？?…])\1+/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

// 读音替换表：每行「原词=读法」（也认 ＝ → ->），长词先换，免得短词把长词拆坏。
export function parseTtsLexicon(text) {
    const pairs = [];
    for (const line of String(text || '').split('\n')) {
        const match = line.match(/^\s*(.+?)\s*(?:=|＝|->|→)\s*(.*?)\s*$/);
        if (match && match[1]) pairs.push([match[1], match[2]]);
    }
    return pairs.sort((a, b) => b[0].length - a[0].length).slice(0, 200);
}

export function applyTtsLexicon(text, pairs) {
    let out = String(text || '');
    for (const [from, to] of pairs) out = out.split(from).join(to);
    return out;
}

// 文字是哪种语言，用来挑系统声音：有两个以上假名算日文；拉丁字母比汉字多一倍以上算英文；其余中文。
export function detectTtsLang(text) {
    const value = String(text || '');
    if ((value.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length >= 2) return 'ja';
    const latin = (value.match(/[A-Za-z]/g) || []).length;
    const han = (value.match(/\p{Script=Han}/gu) || []).length;
    return latin > 0 && latin > han * 2 ? 'en' : 'zh';
}

// 心里话页的原文是「*[名字]：……*」，未开素材模式时台词前面是「名字: 」；名字不念，也让前后两页的缓存键一致。
export function stripSpeakerPrefix(text, speaker = '') {
    let value = String(text ?? '').replace(/^(\s*\*?\s*)\[[^\]\n]+\]\s*[:：]\s*/, '$1');
    const name = String(speaker || '').trim();
    if (name && value.startsWith(name)) {
        const rest = value.slice(name.length).match(/^\s*[:：]\s*/);
        if (rest) value = value.slice(name.length + rest[0].length);
    }
    return value;
}

// 按句切段，每段不超过 max 字；单句过长时硬切。
export function splitTtsChunks(text, max = CHUNK_MAX) {
    const sentences = String(text || '').match(/[^。！？!?…\n]+[。！？!?…」』”’）)]*|[。！？!?…]+/g) || [];
    const chunks = [];
    let buf = '';
    for (const sentence of sentences) {
        if (buf && buf.length + sentence.length > max) {
            chunks.push(buf);
            buf = '';
        }
        buf += sentence;
        while (buf.length > max) {
            chunks.push(buf.slice(0, max));
            buf = buf.slice(max);
        }
    }
    if (buf.trim()) chunks.push(buf);
    return chunks.map((c) => c.trim()).filter(Boolean);
}

// —— 系统声音 ——
// Windows：云希 / 云健 / 云扬 / 康康 / 志伟等是男声；macOS：Li-Mu。其余按女声算。
const MALE_VOICE_RE = /\b(?:yun[a-z]*|kangkang|zhiwei|wanlung|danny|li-?mu)\b|男/i;
// 方言声音不参与自动分配，免得普通角色突然一口东北话；手动选仍可用。
const DIALECT_RE = /liaoning|shaanxi|henan|shandong|sichuan|guangxi|anhui|hunan|jilin|cantonese|粤|wuu|yue/i;
const NATURAL_RE = /natural|online|neural|premium|enhanced/i;

export function systemVoiceGender(name) {
    return MALE_VOICE_RE.test(String(name || '')) ? 'male' : 'female';
}

export function listSystemVoices(synth = globalThis.speechSynthesis) {
    try {
        const voices = synth && typeof synth.getVoices === 'function' ? synth.getVoices() : [];
        return Array.from(voices || []).filter((v) => v && v.name);
    } catch {
        return [];
    }
}

// 设置下拉用：中文、日文声音在前（自然声优先），其余语言不列，免得 Edge 几百个在线声音刷屏。
export function systemVoiceOptions(voices = listSystemVoices()) {
    const rank = (v) => (/^zh/i.test(v.lang) ? 0 : 2) + (NATURAL_RE.test(v.name) ? 0 : 1);
    return voices.filter((v) => /^(zh|ja)/i.test(v.lang || ''))
        .sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)))
        .map((v) => [v.name, `${v.name.replace(/^Microsoft\s+/i, '')}`]);
}

// 自动分配的候选：这种语言的声音（中文排除方言、优先普通话）；按性别筛；有自然声就只用自然声。
export function systemVoicePool(voices, gender = '', lang = 'zh') {
    const inLang = voices.filter((v) => String(v.lang || '').toLowerCase().startsWith(lang) && !(lang === 'zh' && DIALECT_RE.test(`${v.name} ${v.lang}`)));
    const base = inLang.length ? inLang : voices;
    const regional = lang === 'zh' ? base.filter((v) => /^zh[-_]CN/i.test(v.lang || '')) : base;
    const scope = regional.length ? regional : base;
    const sexed = gender ? scope.filter((v) => systemVoiceGender(v.name) === gender) : scope;
    const pool = sexed.length ? sexed : scope;
    const natural = pool.filter((v) => NATURAL_RE.test(v.name));
    return natural.length ? natural : pool;
}

function hashName(name) {
    let h = 2166136261;
    for (const ch of String(name)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
}

// 这一页由谁念、用什么声音（纯函数，便于测试）。voices 是系统声音列表（接口来源时不用）。
// line.lang：这一页文字的语言（zh / ja / en），系统声音按它挑；接口来源不管语言。
// 返回 { voice, role, gender, pitch, rate, volume }；voice 为 '' 表示系统默认声音，volume 为 0 表示这个角色不朗读。
export function resolveTtsVoice(line, settings, sceneAssets, voices = []) {
    const config = normalizeTtsSettings(settings);
    const assets = plainObject(sceneAssets) || {};
    const narrator = line.textType !== 'dialogue' && line.textType !== 'thought';
    const name = narrator ? '' : canonicalName(assets, line.speaker);
    const manualMap = plainObject(assets.characterVoices) || {};
    const manual = name ? normalizeCharacterVoice(hasOwn(manualMap, name) ? manualMap[name] : null) : normalizeCharacterVoice(null);
    const gender = name ? characterDnaGender(assets, name) : '';
    const role = narrator ? 'narrator' : (gender || 'female');
    // 角色在「角色设定」里调的音高、语速，朗读也跟着用。
    let pitch = 2 ** (manual.pitch / 12);
    const rate = manual.speed;
    const volume = manual.ttsVolume;
    if (config.provider === 'api') {
        const api = config.api;
        const voice = manual.tts || api[role] || (narrator ? api.female : '') || api.female || api.male || '';
        return { voice, role, gender, pitch: 1, rate, volume };
    }
    const lang = line.lang || 'zh';
    const byName = new Map(voices.map((v) => [v.name, v]));
    const fits = (voiceName) => byName.has(voiceName) && String(byName.get(voiceName).lang || '').toLowerCase().startsWith(lang);
    // 角色单独指定的声音照用；旁白 / 女声 / 男声的预设只在语言对得上时用（读日文原文时不拿中文声音念）。
    if (manual.tts && byName.has(manual.tts)) return { voice: manual.tts, role, gender, pitch, rate, volume };
    const preset = config.system[role];
    if (preset && fits(preset)) return { voice: preset, role, gender, pitch, rate, volume };
    const pool = systemVoicePool(voices, narrator ? '' : gender, lang);
    if (!pool.length) return { voice: '', role, gender, pitch, rate, volume };
    const key = narrator ? '旁白' : name;
    // 同性别只有一个声音时，按名字给一点音高差，几个角色不至于完全同一个声音。
    if (!narrator && pool.length < 2 && !manual.pitch) pitch *= 1 + ((hashName(key) % 5) - 2) * 0.04;
    return { voice: pool[hashName(key) % pool.length].name, role, gender, pitch, rate, volume };
}

// 这一页要不要念、怎么念（纯函数）。state 跨页记忆上一页的 key，同一页重绘不重念。
export function decideTts(state, line, settings, { sceneAssets, voices = [] } = {}) {
    const config = normalizeTtsSettings(settings);
    const key = String(line.key || '');
    if (key && key === state.lastKey) return { skip: true };
    state.lastKey = key;
    if (!config.enabled || config.volume <= 0) return null;
    if (line.nsfw && !config.nsfw) return null;
    const type = line.textType;
    const spoken = type === 'dialogue' || type === 'thought';
    if (!spoken && type !== 'narration') return null;
    if (!spoken && !config.narration) return null;
    const plain = ttsPlainText(stripSpeakerPrefix(line.text, line.speaker), { original: config.bilingual === 'original' });
    const text = applyTtsLexicon(plain, parseTtsLexicon(config.lexicon)).replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(text)) return null;
    const lang = detectTtsLang(plain);
    const voice = resolveTtsVoice({ ...line, lang }, config, sceneAssets, voices);
    if (voice.volume <= 0) return null;
    const mood = spoken ? resolveBarkMood(line.mood) : '';
    const prosody = (spoken && line.whisper ? WHISPER_PROSODY : MOOD_PROSODY[mood]) || {};
    const shape = spoken ? resolveBarkShape(line, mood) : { gain: 1, close: false, phone: false, pan: 0 };
    const gain = type === 'thought' ? Math.min(shape.gain, THOUGHT_GAIN) : shape.gain;
    return {
        provider: config.provider,
        text,
        voice: voice.voice,
        role: voice.role,
        lang,
        volume: clamp(config.volume * gain * voice.volume, 0, 1),
        rate: clamp(config.rate * voice.rate * (prosody.rate || 1), 0.5, 2),
        pitch: clamp(voice.pitch * (prosody.pitch || 1), 0.5, 2),
        pan: shape.pan, close: shape.close, phone: shape.phone,
    };
}

// —— 播放 ——
let active = null;
// 「翻页不打断」时排队的下一句（只留最新一句）。
let queued = null;
// 最近念过的一句，给「重听」用。
let lastPlayed = null;
const apiCache = new Map();
const inflight = new Map();
let lastError = '';
let errorHandler = null;
let lastReported = { message: '', at: 0 };
const watchedDocs = new WeakSet();

export function ttsLastError() {
    return lastError;
}

// 阅读器注册：阅读中朗读出错时弹提示（同一条 30 秒内不重复）。试听的错误由设置页自己显示，不走这里。
export function setTtsErrorHandler(handler) {
    errorHandler = typeof handler === 'function' ? handler : null;
}

function reportError(message, job) {
    lastError = message;
    if (!errorHandler || (job && job.preview)) return;
    const now = Date.now();
    if (lastReported.message === message && now - lastReported.at < ERROR_REPEAT_MS) return;
    lastReported = { message, at: now };
    try { errorHandler(`朗读：${message}`); } catch { /* ignore */ }
}

const SYSTEM_ERRORS = Object.freeze({
    'not-allowed': '浏览器拦住了自动朗读，点一下画面后再翻页',
    'voice-unavailable': '选的系统声音不可用，换一个声音试试',
    'language-unavailable': '本机没有这种语言的声音',
    'synthesis-unavailable': '系统语音不可用',
    'synthesis-failed': '系统语音合成失败（Edge 的在线声音需要联网）',
    'network': '系统语音需要联网（Edge 的在线声音）',
    'audio-busy': '音频设备被占用',
});

export function isTtsSpeaking() {
    return Boolean(active && !active.done);
}

function finish(job) {
    if (job.done) return;
    job.done = true;
    if (job.releaseDuck) job.releaseDuck();
    job.releaseDuck = null;
    for (const node of job.nodes) {
        try { node.disconnect(); } catch { /* already disconnected */ }
    }
    job.nodes.length = 0;
    if (job.watchdog) clearTimeout(job.watchdog);
    if (active === job) active = null;
    if (!active && queued) {
        const next = queued;
        queued = null;
        next();
    }
}

export function stopTts() {
    queued = null;
    if (!active) return;
    const job = active;
    active = null;
    job.cancelled = true;
    if (job.synth) {
        try { job.synth.cancel(); } catch { /* ignore */ }
    }
    try { job.source && job.source.stop(); } catch { /* already stopped */ }
    finish(job);
}

function startJob(plan) {
    stopTts();
    const job = { plan, done: false, cancelled: false, preview: plan.preview === true, nodes: [], releaseDuck: null, fetched: null, synth: null, source: null, utterances: [], watchdog: null };
    active = job;
    return job;
}

function speakSystem(job, { text, voice, volume, rate, pitch, lang }, synth = globalThis.speechSynthesis) {
    const Utterance = globalThis.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance !== 'function') {
        reportError('这个浏览器不支持系统语音', job);
        finish(job);
        return job;
    }
    const target = listSystemVoices(synth).find((v) => v.name === voice) || null;
    const chunks = splitTtsChunks(text);
    job.synth = synth;
    try { synth.cancel(); } catch { /* ignore */ }
    chunks.forEach((chunk, i) => {
        const u = new Utterance(chunk);
        if (target) {
            u.voice = target;
            u.lang = target.lang;
        } else {
            u.lang = LANG_TAGS[lang] || LANG_TAGS.zh;
        }
        u.volume = clamp(volume * audioMasterVolume(), 0, 1);
        u.rate = rate;
        u.pitch = pitch;
        if (i === 0) {
            u.onstart = () => {
                if (job.cancelled) return;
                const seconds = text.length / (CHARS_PER_SECOND * rate);
                yieldTypewriterAudio(seconds);
                // 念完时释放；兜底时长防止某些浏览器漏发 onend 让配乐一直压着。
                job.releaseDuck = duckSceneAudio({ ratio: TTS_DUCK_RATIO, durationMs: seconds * 1500 + 3000 });
            };
        }
        if (i === chunks.length - 1) u.onend = () => finish(job);
        u.onerror = (event) => {
            if (job.cancelled) return;
            const reason = event && event.error;
            if (reason && reason !== 'interrupted' && reason !== 'canceled') reportError(SYSTEM_ERRORS[reason] || `系统语音出错：${reason}`, job);
            finish(job);
        };
        // 留住引用：Chrome 会回收没人引用的 utterance，导致 onend 不触发。
        job.utterances.push(u);
        synth.speak(u);
    });
    if (!chunks.length) finish(job);
    else job.watchdog = setTimeout(() => finish(job), ((text.length / (CHARS_PER_SECOND * rate)) * 2 + SYSTEM_WATCHDOG_PAD_S) * 1000);
    return job;
}

export function ttsSpeechUrl(endpoint, transport = 'direct') {
    let url = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/\/audio\/speech$/i.test(url)) url += '/audio/speech';
    return transport === 'st-proxy' ? `/proxy/${url}` : url;
}

async function postSpeech(url, api, { text, voice, rate }) {
    const headers = { 'Content-Type': 'application/json' };
    if (api.apiKey) headers.Authorization = `Bearer ${api.apiKey}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'POST', headers,
            body: JSON.stringify({ model: api.model || 'tts-1', input: text, voice: voice || 'alloy', response_format: 'mp3', speed: rate }),
        });
    } catch {
        throw new Error(api.transport === 'st-proxy'
            ? '连不上接口（酒馆 CORS 代理需在 config.yaml 打开 enableCorsProxy）'
            : '连不上接口（网络不通或不允许跨域，可改用「酒馆 CORS 代理」）');
    }
    if (!res.ok) {
        let detail = '';
        try { detail = (await res.text()).slice(0, 160); } catch { /* ignore */ }
        throw new Error(`接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
    }
    return res.arrayBuffer();
}

// 缓存键不含语速与首尾引号：提前生成时还不知道下一页的情绪，语速差在 RATE_TOLERANCE 内就算同一条。
export function ttsCacheKey(url, api, voice, text) {
    const body = String(text || '').replace(/^[\s「『“"'‘]+|[\s」』”"'’]+$/g, '').replace(/\s+/g, ' ');
    return [url, api.model, voice, body].join('|');
}

const closeRate = (a, b) => Math.abs(a - b) <= RATE_TOLERANCE;

// 持久缓存：Cache Storage 只在 https / localhost 下可用，不可用时静默只用内存。
function persistentStore() {
    const store = globalThis.caches;
    return store && typeof store.open === 'function' ? store.open(PERSIST_NAME).catch(() => null) : Promise.resolve(null);
}

const persistUrl = (key) => `https://igs-tts.invalid/?k=${encodeURIComponent(key)}`;

async function persistentGet(key, rate) {
    try {
        const cache = await persistentStore();
        const res = cache ? await cache.match(persistUrl(key)) : null;
        if (!res || !closeRate(Number(res.headers.get('x-igs-rate')) || 1, rate)) return null;
        return await res.arrayBuffer();
    } catch {
        return null;
    }
}

async function persistentPut(key, bytes, rate) {
    try {
        const cache = await persistentStore();
        if (!cache || typeof Response !== 'function') return;
        await cache.put(persistUrl(key), new Response(bytes.slice(0), { headers: { 'Content-Type': 'audio/mpeg', 'x-igs-rate': String(rate) } }));
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - PERSIST_MAX))) await cache.delete(old);
    } catch { /* 存不下就算了 */ }
}

export async function clearTtsCache() {
    apiCache.clear();
    try {
        if (globalThis.caches && typeof globalThis.caches.delete === 'function') await globalThis.caches.delete(PERSIST_NAME);
    } catch { /* ignore */ }
}

function remember(key, bytes, rate) {
    apiCache.set(key, { bytes, rate });
    while (apiCache.size > API_CACHE_MAX) apiCache.delete(apiCache.keys().next().value);
}

// 同一句只请求一次：缓存里有就直接用，正在生成就等那一条（翻页、提前生成共用），不跟着页面取消。
// decodeAudioData 会占用传入的数据，所以每次交出去的都是副本。
function requestSpeech(api, plan) {
    const url = ttsSpeechUrl(api.endpoint, api.transport);
    if (!url) return Promise.reject(new Error('还没有填写接口地址'));
    const key = ttsCacheKey(url, api, plan.voice, plan.text);
    const hit = apiCache.get(key);
    if (hit && closeRate(hit.rate, plan.rate)) {
        apiCache.delete(key);
        apiCache.set(key, hit);
        return Promise.resolve(hit.bytes.slice(0));
    }
    const pending = inflight.get(key);
    if (pending && closeRate(pending.rate, plan.rate)) return pending.promise.then((bytes) => bytes.slice(0));
    const promise = persistentGet(key, plan.rate).then((stored) => {
        if (stored) {
            remember(key, stored, plan.rate);
            return stored;
        }
        return postSpeech(url, api, plan).then((bytes) => {
            remember(key, bytes, plan.rate);
            persistentPut(key, bytes, plan.rate);
            return bytes;
        });
    }).finally(() => {
        if (inflight.get(key) && inflight.get(key).promise === promise) inflight.delete(key);
    });
    inflight.set(key, { promise, rate: plan.rate });
    return promise.then((bytes) => bytes.slice(0));
}

function speakApi(job, plan, api) {
    const bus = busInput(plan.close || plan.phone ? 'dry' : 'voice');
    if (!bus) {
        reportError('浏览器音频不可用', job);
        finish(job);
        return job;
    }
    const context = bus.context;
    const request = requestSpeech(api, plan);
    // 这一页的音频拿到后再去生成下一页，两条请求不抢带宽。
    job.fetched = request.then(() => null, () => null);
    Promise.all([resumeAudioBus(), request])
        .then(([, bytes]) => (job.cancelled ? null : context.decodeAudioData(bytes)))
        .then((buffer) => {
            if (job.cancelled || !buffer) return finish(job);
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(buildBarkChain(context, bus, plan, job.nodes));
            source.onended = () => finish(job);
            job.source = source;
            source.start();
            lastError = '';
            yieldTypewriterAudio(buffer.duration || 0);
            job.releaseDuck = duckSceneAudio({ ratio: TTS_DUCK_RATIO });
            return null;
        })
        .catch((error) => {
            if (job.cancelled) return;
            reportError((error && error.message) || '朗读失败', job);
            finish(job);
        });
    return job;
}

// 同一时间只念一页：新的一页开始时掐掉上一页。
export function playTts(plan, settings) {
    if (!plan || !plan.text) return null;
    if (!plan.preview) lastPlayed = { plan, settings };
    const job = startJob(plan);
    if (plan.provider === 'api') return speakApi(job, plan, normalizeTtsSettings(settings).api);
    return speakSystem(job, plan);
}

const states = new WeakMap();

// 阅读器每次渲染调用；换页就停掉上一页，同一页重绘（设置变化、窗口缩放）不重念。
// line.next：下一页的原文（本条消息最后一页时为空）。接口来源：在这一页停够 PREFETCH_DWELL_MS 且这一页音频到手后，
// 提前生成下一页；连续快速翻页时当前页也推迟一点再请求，还在翻就不请求。系统语音免费，照常立即念。
export function applyTts(root, line, settings, sceneAssets, { now = Date.now, timers = globalThis } = {}) {
    if (!root) return null;
    let state = states.get(root);
    if (!state) states.set(root, (state = {}));
    const plan = decideTts(state, line, settings, { sceneAssets, voices: listSystemVoices() });
    if (plan && plan.skip) return null;
    const token = (state.token || 0) + 1;
    state.token = token;
    for (const timer of [state.deferTimer, state.prefetchTimer]) if (timer) timers.clearTimeout(timer);
    state.deferTimer = null;
    state.prefetchTimer = null;
    const shownAt = now();
    const fastFlip = state.shownAt != null && shownAt - state.shownAt < FAST_FLIP_MS;
    state.shownAt = shownAt;
    const config = normalizeTtsSettings(settings);
    const api = config.provider === 'api';
    watchAway(root);
    const prefetchNext = (fetched) => {
        if (!api || !config.api.prefetch || !line.next) return;
        Promise.resolve(fetched).then(() => {
            if (state.token !== token) return;
            const wait = Math.max(0, PREFETCH_DWELL_MS - (now() - shownAt));
            state.prefetchTimer = timers.setTimeout(() => {
                state.prefetchTimer = null;
                if (state.token === token) prefetchTts(line.next, settings, sceneAssets, { nsfw: line.nsfw });
            }, wait);
        });
    };
    // 翻页不打断：上一句还在念就让它念完，这一句排在后面（只留最新一句）；否则立刻掐掉上一句。
    const sustain = config.sustain && isTtsSpeaking();
    if (sustain) queued = null;
    else stopTts();
    if (!plan) {
        // 这一页不念（旁白关了、角色不朗读等）：重听不该念回上一页。
        lastPlayed = null;
        prefetchNext(null);
        return null;
    }
    const start = () => {
        if (state.token !== token) return null;
        const job = playTts(plan, settings);
        prefetchNext(job && job.fetched);
        return job;
    };
    if (sustain) {
        queued = start;
        return null;
    }
    if (api && fastFlip) {
        state.deferTimer = timers.setTimeout(() => {
            state.deferTimer = null;
            start();
        }, FLIP_DEFER_MS);
        return null;
    }
    return start();
}

// 切到别的标签页或程序时停下（和 BGM 一致）；系统语音不经过音频总线，要单独停。
function watchAway(root) {
    const doc = root && root.ownerDocument;
    if (!doc || watchedDocs.has(doc)) return;
    watchedDocs.add(doc);
    watchPageAway(doc, (away) => {
        if (away) stopTts();
    });
}

// 重听：再念一遍最近念过的那句（从头念，掐掉正在念的）。
export function replayTts() {
    if (!lastPlayed) return { ok: false, error: '这一页没有可重听的朗读' };
    const job = playTts(lastPlayed.plan, lastPlayed.settings);
    return job ? { ok: true } : { ok: false, error: '朗读失败' };
}

// 下一页的文字外形 → 朗读用的一行，与阅读器分页同一套写法：「[名字]：台词」「*[名字]：心里话*」，其余按旁白。
// 只用于提前生成，猜错了只是缓存没命中，翻过去时照常现生成。
export function guessTtsLine(segment) {
    const seg = String(segment || '');
    const thought = seg.match(/^\s*\*\s*(?:\[([^\]]+)\]\s*[:：]\s*)?([\s\S]*?)\s*\*\s*$/);
    if (thought && thought[1]) return { textType: 'thought', speaker: thought[1].trim(), text: thought[2] };
    const dialogue = seg.match(/^\s*\[([^\]]+)\]\s*[:：]\s*([\s\S]*)$/);
    if (dialogue) return { textType: 'dialogue', speaker: dialogue[1].trim(), text: dialogue[2] };
    return { textType: 'narration', speaker: '', text: seg };
}

// 提前生成下一页（只对接口来源；系统语音本地合成，不用等）。
export function prefetchTts(segment, settings, sceneAssets, { nsfw = false } = {}) {
    const config = normalizeTtsSettings(settings);
    if (!config.enabled || config.provider !== 'api' || !segment) return null;
    const plan = decideTts({}, { ...guessTtsLine(segment), nsfw }, config, { sceneAssets });
    if (!plan || plan.skip) return null;
    return requestSpeech(config.api, plan).catch(() => null);
}

// 设置里的试听：按当前来源念一句。接口来源会等结果，失败时返回原因。
export function previewTts(settings, { role = 'female', voice = '' } = {}) {
    const config = normalizeTtsSettings(settings);
    const voices = listSystemVoices();
    const picked = voice || (config.provider === 'api'
        ? config.api[role] || config.api.female
        : config.system[role] || (systemVoicePool(voices, role === 'narrator' ? '' : role)[0] || {}).name || '');
    const plan = {
        provider: config.provider, text: '你好，这是台词朗读的试听。今天也请多指教。', voice: picked, role, lang: 'zh',
        volume: config.volume, rate: config.rate, pitch: 1, pan: 0, close: false, phone: false, preview: true,
    };
    lastError = '';
    const job = playTts(plan, config);
    if (config.provider !== 'api') return Promise.resolve(lastError ? { ok: false, error: lastError } : { ok: true });
    return new Promise((resolve) => {
        const check = () => {
            if (job.done || job.source) resolve(lastError ? { ok: false, error: lastError } : { ok: true });
            else setTimeout(check, 100);
        };
        check();
    });
}
