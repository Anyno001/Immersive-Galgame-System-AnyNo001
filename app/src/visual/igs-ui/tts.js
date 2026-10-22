// 台词朗读（TTS）：逐页朗读台词、心里话，旁白可选。和角色语气音二选一，开了朗读就不播语气音。
// 两种来源：系统语音（浏览器 speechSynthesis，零配置；Windows 上 Edge 有晓晓、云希等在线自然声）
// 和接口：OpenAI 兼容的 /audio/speech（网站 API，或本地 GPT-SoVITS / CosyVoice 等兼容服务），
// 或 Fish Audio 原生的 /v1/tts（text + reference_id，模型放请求头）。
// 系统语音不经过 Web Audio，只能调音量、语速、音高；接口返回的音频走总线，声像、听筒、贴耳与语气音一致。
import { cacheLowWater, trimCacheEntries } from '../../media/cache-eviction.js';
import { armAudioBusRetry, audioMasterVolume, busInput, resumeAudioBus, watchPageAway } from './audio-bus.js';
import { duckSceneAudio } from './scene-audio.js';
import { stripTextFxMarkup } from './text-fx.js';
import { yieldTypewriterAudio } from './typewriter-audio.js';
import { voiceFilterGain, voiceFilterUsesDry } from './voice-filter.js';
import { buildBarkChain, canonicalName, characterDnaGender, normalizeCharacterVoice, resolveBarkMood, resolveBarkShape } from './voice-bark.js';

export const TTS_PROVIDERS = Object.freeze([
    ['system', '系统语音'],
    ['api', '接口（网站 / 本地）'],
]);
export const TTS_TRANSPORTS = Object.freeze([
    ['direct', '浏览器直连'],
    ['st-proxy', '酒馆 CORS 代理'],
]);
export const TTS_API_FORMATS = Object.freeze([
    ['openai', 'OpenAI 兼容（/audio/speech）'],
    ['gpt-sovits', 'GPT-SoVITS（api_v2）'],
    ['fish', 'Fish Audio'],
    ['minimax', 'MiniMax'],
    ['custom', '自定义请求'],
]);
export const TTS_RESPONSE_FORMATS = Object.freeze([
    ['mp3', 'mp3（默认）'],
    ['wav', 'wav'],
    ['opus', 'opus'],
    ['none', '不发送'],
]);
export const TTS_CUSTOM_RESPONSES = Object.freeze([
    ['audio', '直接返回音频'],
    ['json-base64', 'JSON 里的 base64'],
    ['json-hex', 'JSON 里的 hex'],
    ['json-url', 'JSON 里的音频地址'],
]);
export const TTS_CUSTOM_METHODS = Object.freeze([['POST', 'POST'], ['GET', 'GET']]);
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
const MAX_TEMPLATE = 2000;
// 接口请求最长等这么久（含读响应体）；音频总线 resume 最长等这么久。
const API_TIMEOUT_MS = 25000;
const RESUME_TIMEOUT_MS = 1200;
// 接口模式下超过这么多字才分段；每段至少这么多字，免得切得太碎。
const API_SEGMENT_THRESHOLD = 60;
const API_SEGMENT_MIN = 15;
const LEXICON_MAX = 4000;
// 系统语音偶尔漏发 onend：按估算时长的 2 倍再加 5 秒兜底收尾，免得自动播放和「翻页不打断」一直等。
const SYSTEM_WATCHDOG_PAD_S = 5;
// 清掉卡住的上一句后等这么久再开口。
const SYSTEM_SPEAK_DELAY_MS = 60;
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
const template = (v) => String(v ?? '').trim().slice(0, MAX_TEMPLATE);
const pick = (list, v, fallback) => (list.some(([id]) => id === v) ? v : fallback);
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
        // 系统声音下拉列出全部语言；关掉时只列中文、日文。
        allVoices: source.allVoices === true,
        system: roles(system),
        api: {
            // 接口格式：按各家文档的字段构造请求；旧版保存的 auto 或无效值按地址判断（含 fish.audio 为 Fish Audio，否则 OpenAI 兼容）。
            format: pick(TTS_API_FORMATS, api.format, resolveTtsApiFormat(api.endpoint)),
            responseFormat: pick(TTS_RESPONSE_FORMATS, api.responseFormat, 'mp3'),
            sendSpeed: api.sendSpeed !== false,
            // 长句按句末标点切段：第一段先请求先播，其余并行请求、按顺序接着播。
            chunk: api.chunk !== false,
            customMethod: pick(TTS_CUSTOM_METHODS, api.customMethod, 'POST'),
            customUrl: field(api.customUrl),
            customHeaders: template(api.customHeaders),
            customBody: template(api.customBody),
            customResponse: pick(TTS_CUSTOM_RESPONSES, api.customResponse, 'audio'),
            customPath: field(api.customPath),
            transport: api.transport === 'st-proxy' ? 'st-proxy' : 'direct',
            endpoint: field(api.endpoint),
            apiKey: field(api.apiKey),
            model: field(api.model),
            // 可选声音：逗号或换行分隔，给角色单独指定时做下拉。
            voices: String(api.voices ?? '').trim().slice(0, MAX_FIELD * 10),
            // 提前生成下一页：在一页停够 PREFETCH_DWELL_MS 才生成，快速点过的页不花钱。
            prefetch: api.prefetch !== false,
            ...roles(api),
        },
    };
}

// 可选声音每项写「声音名」或「声音名#标题」，标题只用于下拉显示。
function parseVoiceEntries(text) {
    const seen = new Set();
    const out = [];
    for (const raw of String(text || '').split(/[,，\n]/)) {
        const entry = raw.trim();
        if (!entry) continue;
        const cut = entry.indexOf('#');
        const id = (cut > 0 ? entry.slice(0, cut) : entry).trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push([id, cut > 0 ? entry.slice(cut + 1).trim() : '']);
    }
    return out;
}

export function ttsApiVoiceList(settings) {
    return parseVoiceEntries(normalizeTtsSettings(settings).api.voices).map(([id]) => id);
}

export function ttsApiVoiceOptions(settings) {
    return parseVoiceEntries(normalizeTtsSettings(settings).api.voices).map(([id, title]) => [id, title ? `${title}（${id}）` : id]);
}

// 把拉取到的声音并进已有的可选声音：按声音名去重，已有的在前。
export function mergeTtsVoices(existing, fetched) {
    const entries = parseVoiceEntries(existing);
    const seen = new Set(entries.map(([id]) => id));
    let added = 0;
    for (const [id, title] of fetched) {
        const key = String(id || '').trim();
        if (!key || seen.has(key) || /[,，\n#]/.test(key)) continue;
        seen.add(key);
        added += 1;
        const label = String(title || '').replace(/[,，\n#]+/g, ' ').trim();
        entries.push([key, label && label !== key ? label : '']);
    }
    return { text: entries.map(([id, title]) => (title ? `${id}#${title}` : id)).join(', ').slice(0, MAX_FIELD * 10), added, total: entries.length };
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
// 按名字判断性别：只认认得的名字，认不出的算「未知」，不硬当女声。覆盖 Windows / macOS / Google 常见声音。
const MALE_VOICE_RE = /\b(?:yun[a-z]*|kangkang|zhiwei|wanlung|danny|li-?mu|keita|ichiro|otoya|hattori|takumi|david|mark|guy|ryan|christopher|eric|george|james|richard|roger|steffan|brian|andrew|davis|jason|tony|alex|aaron|daniel|fred|ralph|rishi|thomas|oliver|arthur|gordon|albert|bruce|junior|reed|eddy|rocko|grandpa|evan|nathan|jorge|diego|juan|male)\b|男/i;
const FEMALE_VOICE_RE = /\b(?:xiao[a-z]+|huihui|yaoyao|hanhan|tracy|hiumaan|hsiao[a-z]+|tingting|sinji|meijia|nanami|haruka|ayumi|sayaka|kyoko|mizuki|shiori|aoi|mayu|narumi|aria|jenny|michelle|ana|emma|ava|sara|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|allison|amelie|kate|serena|vicki|nicky|flo|sandy|shelley|grandma|helena|laura|monica|paulina|female)\b|女/i;
// 方言声音不参与自动分配，免得普通角色突然一口东北话；手动选仍可用。
const DIALECT_RE = /liaoning|shaanxi|henan|shandong|sichuan|guangxi|anhui|hunan|jilin|cantonese|粤|wuu|yue/i;
const NATURAL_RE = /natural|online|neural|premium|enhanced/i;

// 返回 male / female / unknown。「Google UK English Female」这类名字里直接写了性别的优先。
export function systemVoiceGender(name) {
    const value = String(name || '').replace(/^(?:Microsoft|Google|Apple)\s+/i, '');
    const head = value.split(/\s+-\s+/)[0];
    if (/\bfemale\b|女/i.test(head)) return 'female';
    if (/\bmale\b|男/i.test(head)) return 'male';
    if (MALE_VOICE_RE.test(head)) return 'male';
    if (FEMALE_VOICE_RE.test(head)) return 'female';
    return 'unknown';
}

export function listSystemVoices(synth = globalThis.speechSynthesis) {
    try {
        const voices = synth && typeof synth.getVoices === 'function' ? synth.getVoices() : [];
        return Array.from(voices || []).filter((v) => v && v.name);
    } catch {
        return [];
    }
}

// Chrome 等浏览器的声音列表是异步加载的，第一次读常常为空；加载好会发 voiceschanged。返回取消订阅函数。
export function onSystemVoicesChanged(callback, synth = globalThis.speechSynthesis) {
    if (!synth || typeof synth.addEventListener !== 'function' || typeof callback !== 'function') return () => {};
    const handler = () => { try { callback(); } catch { /* 回调出错不影响朗读 */ } };
    synth.addEventListener('voiceschanged', handler);
    return () => {
        try { synth.removeEventListener('voiceschanged', handler); } catch { /* ignore */ }
    };
}

// 首次朗读时声音列表还是空的：等 voiceschanged，最多等 timeoutMs 毫秒（没有事件可等就不等）。
export function waitForSystemVoices(timeoutMs = 800, synth = globalThis.speechSynthesis) {
    if (listSystemVoices(synth).length) return Promise.resolve(true);
    if (!synth || typeof synth.addEventListener !== 'function') return Promise.resolve(false);
    return new Promise((resolve) => {
        let timer = null;
        const stop = onSystemVoicesChanged(() => {
            if (!listSystemVoices(synth).length) return;
            clearTimeout(timer);
            stop();
            resolve(true);
        }, synth);
        timer = setTimeout(() => {
            stop();
            resolve(false);
        }, timeoutMs);
    });
}

// 已保存的声音名找不到时，再按 voiceURI 找（保存仍存 name，向后兼容）。
export function findSystemVoice(voices, id) {
    const key = String(id || '');
    if (!key) return null;
    return voices.find((v) => v.name === key) || voices.find((v) => v.voiceURI && v.voiceURI === key) || null;
}

// 设置下拉用：默认只列中文、日文声音（自然声优先），免得 Edge 几百个在线声音刷屏；allVoices 为真时全部列出，名字后标语言。
export function systemVoiceOptions(voices = listSystemVoices(), { all = false } = {}) {
    const rank = (v) => (/^zh/i.test(v.lang) ? 0 : 2) + (NATURAL_RE.test(v.name) ? 0 : 1);
    const label = (v) => {
        const base = v.name.replace(/^Microsoft\s+/i, '');
        const tags = [all && v.lang ? v.lang : '', systemVoiceGender(v.name) === 'unknown' ? '性别未知' : ''].filter(Boolean);
        return tags.length ? `${base} · ${tags.join(' · ')}` : base;
    };
    const langOrder = (v) => (/^zh/i.test(v.lang || '') ? 0 : /^ja/i.test(v.lang || '') ? 1 : 2);
    const list = all ? voices : voices.filter((v) => /^(zh|ja)/i.test(v.lang || ''));
    return list.slice()
        .sort((a, b) => (all ? langOrder(a) - langOrder(b) || String(a.lang).localeCompare(String(b.lang)) : 0) || rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)))
        .map((v) => [v.name, label(v)]);
}

// 自动分配的候选：这种语言的声音（中文排除方言、优先普通话）；按性别筛；有自然声就只用自然声。
export function systemVoicePool(voices, gender = '', lang = 'zh') {
    const inLang = voices.filter((v) => String(v.lang || '').toLowerCase().startsWith(lang) && !(lang === 'zh' && DIALECT_RE.test(`${v.name} ${v.lang}`)));
    const base = inLang.length ? inLang : voices;
    const regional = lang === 'zh' ? base.filter((v) => /^zh[-_]CN/i.test(v.lang || '')) : base;
    const scope = regional.length ? regional : base;
    // 认得出同性别的优先；全是认不出名字的（Google 等）再用「未知」；都没有才不分性别。
    const known = gender ? scope.filter((v) => systemVoiceGender(v.name) === gender) : scope;
    const unknown = gender ? scope.filter((v) => systemVoiceGender(v.name) === 'unknown') : [];
    const pool = known.length ? known : (unknown.length ? unknown : scope);
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
        // 三个声音框都留空、角色也没单独指定时就是「不添加声音」：volume 0 让 decideTts 直接返回 null，不发合成请求。
        return { voice, role, gender, pitch: 1, rate, volume: voice ? volume : 0 };
    }
    const lang = line.lang || 'zh';
    const fits = (voiceName) => {
        const found = findSystemVoice(voices, voiceName);
        return Boolean(found) && String(found.lang || '').toLowerCase().startsWith(lang);
    };
    // 角色单独指定的声音照用；旁白 / 女声 / 男声的预设只在语言对得上时用（读日文原文时不拿中文声音念）。
    const manualVoice = findSystemVoice(voices, manual.tts);
    if (manualVoice) return { voice: manualVoice.name, role, gender, pitch, rate, volume };
    const preset = config.system[role];
    if (preset && fits(preset)) return { voice: findSystemVoice(voices, preset).name, role, gender, pitch, rate, volume };
    const pool = systemVoicePool(voices, narrator ? '' : gender, lang);
    if (!pool.length) return { voice: '', role, gender, pitch, rate, volume };
    const key = narrator ? '旁白' : name;
    // 同性别只有一个声音时，按名字给一点音高差，几个角色不至于完全同一个声音。
    if (!narrator && pool.length < 2 && !manual.pitch) pitch *= 1 + ((hashName(key) % 5) - 2) * 0.04;
    return { voice: pool[hashName(key) % pool.length].name, role, gender, pitch, rate, volume };
}

// 这一页要不要念、怎么念（纯函数）。state 跨页记忆上一页的 key，同一页重绘不重念。
export function decideTts(state, line, settings, { sceneAssets, voices = [], record = true } = {}) {
    const config = normalizeTtsSettings(settings);
    const key = String(line.key || '');
    // 先看开关再记页：没开朗读时翻过的页不算「念过」，本页打开开关后重听或翻页就能补读。
    const skipWith = (reason) => {
        if (record) lastSkip = { key, reason };
        return null;
    };
    if (!config.enabled) return skipWith('台词朗读没开');
    if (key && key === state.lastKey) return { skip: true };
    state.lastKey = key;
    if (config.volume <= 0) return skipWith('朗读音量是 0');
    if (line.nsfw && !config.nsfw) return skipWith('NSFW 场景的朗读没开');
    const type = line.textType;
    const spoken = type === 'dialogue' || type === 'thought';
    if (!spoken && type !== 'narration') return skipWith('这一页不是台词或旁白');
    if (!spoken && !config.narration) return skipWith('旁白朗读已关');
    const plain = ttsPlainText(stripSpeakerPrefix(line.text, line.speaker), { original: config.bilingual === 'original' });
    const text = applyTtsLexicon(plain, parseTtsLexicon(config.lexicon)).replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(text)) return skipWith('这一页没有可读的文字');
    const lang = detectTtsLang(plain);
    const voice = resolveTtsVoice({ ...line, lang }, config, sceneAssets, voices);
    if (voice.volume <= 0) return skipWith('这个角色设为不朗读');
    if (record) lastSkip = null;
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
// 最近一页的台词与设置：这一页因为开关没开等原因没念时，重听可以按现在的设置补念。
let lastLine = null;
// 最近一次「为什么没念」：{ key: 页面 key, reason }；念了就清空。
let lastSkip = null;
const apiCache = new Map();
const inflight = new Map();
let persistentWrites = Promise.resolve(), cacheEpoch = 0;
let lastError = '';
let errorHandler = null;
let lastReported = { message: '', at: 0 };
const watchedDocs = new WeakSet();

export function ttsLastError() {
    return lastError;
}

// 这一页没读的原因：{ key, reason }，读了或还没判断过时为 null。
export function getTtsSkipReason() {
    return lastSkip ? { ...lastSkip } : null;
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
    if (job.startTimer) clearTimeout(job.startTimer);
    job.startTimer = null;
    // 这个任务不再等的请求：没有别人（预取、另一个任务）共享的才会真正中止。
    for (const release of job.releases.splice(0)) release();
    if (active === job) active = null;
    if (!active && queued) {
        const next = queued;
        queued = null;
        next();
    }
}

// 停掉一个任务的所有声音（系统语音与接口音频），不收尾。
function haltJob(job) {
    job.cancelled = true;
    if (job.synth) {
        try { job.synth.cancel(); } catch { /* ignore */ }
    }
    for (const source of job.sources) {
        try { source.stop(); } catch { /* already stopped */ }
    }
}

export function stopTts() {
    queued = null;
    if (!active) return;
    const job = active;
    active = null;
    haltJob(job);
    finish(job);
}

function startJob(plan) {
    stopTts();
    const job = { plan, done: false, cancelled: false, preview: plan.preview === true, nodes: [], releaseDuck: null, fetched: null, synth: null, source: null, sources: [], utterances: [], watchdog: null, startTimer: null, releases: [] };
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
    const target = findSystemVoice(listSystemVoices(synth), voice);
    const chunks = splitTtsChunks(text);
    job.synth = synth;
    // 上一句还卡在队列里（paused、speaking、pending）时先清掉，再等一小会儿开口，否则 Chrome 常把新一句也吞掉。
    try { if (synth.paused && typeof synth.resume === 'function') synth.resume(); } catch { /* ignore */ }
    let busy = false;
    try { busy = Boolean(synth.speaking || synth.pending); } catch { /* ignore */ }
    if (busy) {
        try { synth.cancel(); } catch { /* ignore */ }
    }
    const speakAll = () => {
        // 延迟期间已经停了或换了新任务，就不再开口。
        if (job.done || job.cancelled || active !== job) return;
        chunks.forEach((chunk, i) => {
            const u = new Utterance(chunk);
            if (target) {
                u.voice = target;
                u.lang = target.lang;
            } else {
                u.lang = LANG_TAGS[lang] || LANG_TAGS.zh;
            }
            u.volume = clamp(volume * audioMasterVolume() * voiceFilterGain(), 0, 1);
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
                // 旧句收尾后才迟到的 onerror 不能再去 cancel 新的一句。
                if (job.cancelled || job.done) return;
                const reason = event && event.error;
                if (reason && reason !== 'interrupted' && reason !== 'canceled') reportError(SYSTEM_ERRORS[reason] || `系统语音出错：${reason}`, job);
                // 出错时先清掉队列里剩下的几段，免得它们接着念或把后面的页卡住。
                try { synth.cancel(); } catch { /* ignore */ }
                finish(job);
            };
            // 留住引用：Chrome 会回收没人引用的 utterance，导致 onend 不触发。
            job.utterances.push(u);
            synth.speak(u);
        });
    };
    if (!chunks.length) {
        finish(job);
        return job;
    }
    job.watchdog = setTimeout(() => {
        haltJob(job);
        finish(job);
    }, ((text.length / (CHARS_PER_SECOND * rate)) * 2 + SYSTEM_WATCHDOG_PAD_S) * 1000 + (busy ? SYSTEM_SPEAK_DELAY_MS : 0));
    if (busy) job.startTimer = setTimeout(speakAll, SYSTEM_SPEAK_DELAY_MS);
    else speakAll();
    return job;
}

// 实际使用的接口格式：auto 时按地址判断，地址含 fish.audio 视为 Fish Audio。
export function resolveTtsApiFormat(endpoint, format = 'auto') {
    if (format === 'openai' || format === 'fish') return format;
    return /(^|[/.])fish\.audio(?=[/:]|$)/i.test(String(endpoint || '').trim()) ? 'fish' : 'openai';
}

// 报错里的网页（如酒馆的 Forbidden 页）只留文字，不把整段 HTML 塞给用户。
const errorDetail = (raw) => String(raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);

// 酒馆没开 CORS 代理时：POST /proxy/… 被 CSRF 拦下回 403 Forbidden，或直接回 404「CORS proxy is disabled」。
export function ttsErrorMessage(status, raw, api) {
    const detail = errorDetail(raw);
    if (api.transport === 'st-proxy' && (/CORS proxy is disabled/i.test(detail) || (status === 403 && /^(Error )?Forbidden$/i.test(detail)))) {
        return `接口返回 ${status}：酒馆没有打开 CORS 代理。请在酒馆 config.yaml 里把 enableCorsProxy 改为 true 并重启酒馆。`;
    }
    return `接口返回 ${status}${detail ? `：${detail}` : ''}`;
}

const proxied = (url, transport) => (transport === 'st-proxy' ? `/proxy/${url}` : url);

export function ttsSpeechUrl(endpoint, transport = 'direct') {
    let url = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    if (!/\/audio\/speech$/i.test(url)) url += '/audio/speech';
    return proxied(url, transport);
}

const FORMAT_DEFAULT_ENDPOINTS = Object.freeze({ fish: 'https://api.fish.audio', minimax: 'https://api.minimaxi.com' });
const FORMAT_PATHS = Object.freeze({ 'gpt-sovits': '/tts', fish: '/v1/tts', minimax: '/v1/t2a_v2' });
const FISH_DEFAULT_MODEL = 's2.1-pro';
const MINIMAX_DEFAULT_MODEL = 'speech-2.8-hd';

// 各家接口的地址：用户填的是根地址，末尾已经带了路径就不重复加。
function formatUrl(api, path, { fallback = '' } = {}) {
    const base = String(api.endpoint || fallback || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    const full = base.toLowerCase().endsWith(path.toLowerCase()) ? base : base + path;
    return proxied(full, api.transport);
}

// GPT-SoVITS 的角色音色写成「参考音频路径|参考文本|参考语言」，后两段可省。
export function parseGptSovitsVoice(voice) {
    const [path = '', promptText = '', promptLang = ''] = String(voice || '').split(/[|｜]/).map((part) => part.trim());
    return { path, promptText, promptLang };
}

const speedOf = (rate) => clamp(Number(rate) || 1, 0.5, 2);

function fillTemplate(text, values, { raw = [], uri = false } = {}) {
    return String(text || '').replace(/\{\{(text|voice|speed|lang|model|key)\}\}/g, (_, key) => {
        const value = String(values[key] ?? '');
        if (raw.includes(key)) return value;
        if (uri) return encodeURIComponent(value);
        return JSON.stringify(value).slice(1, -1);
    });
}

function parseJsonText(text, label) {
    const value = String(text || '').trim();
    if (!value) return null;
    try {
        return JSON.parse(value);
    } catch {
        throw new Error(`${label}不是合法的 JSON`);
    }
}

// 按接口格式构造请求（纯函数，不联网）：返回 { url, method, headers, body }，body 是字符串或 undefined。
export function buildTtsRequest(api, { text, voice, rate = 1, lang = 'zh' }) {
    const format = api.format || 'openai';
    const headers = { 'Content-Type': 'application/json' };
    if (api.apiKey) headers.Authorization = `Bearer ${api.apiKey}`;
    if (format === 'gpt-sovits') {
        const parts = parseGptSovitsVoice(voice);
        return {
            url: formatUrl(api, FORMAT_PATHS['gpt-sovits']), method: 'POST', headers,
            body: JSON.stringify({
                text, text_lang: lang, ref_audio_path: parts.path, prompt_text: parts.promptText, prompt_lang: parts.promptLang || lang,
                media_type: 'wav', speed_factor: speedOf(rate), streaming_mode: false,
            }),
        };
    }
    if (format === 'fish') {
        return {
            url: formatUrl(api, FORMAT_PATHS.fish, { fallback: FORMAT_DEFAULT_ENDPOINTS.fish }), method: 'POST',
            headers: { ...headers, model: api.model || FISH_DEFAULT_MODEL },
            body: JSON.stringify({ text, reference_id: voice || undefined, format: 'mp3', ...(api.sendSpeed && speedOf(rate) !== 1 ? { prosody: { speed: speedOf(rate) } } : {}) }),
        };
    }
    if (format === 'minimax') {
        return {
            url: formatUrl(api, FORMAT_PATHS.minimax, { fallback: FORMAT_DEFAULT_ENDPOINTS.minimax }), method: 'POST', headers,
            body: JSON.stringify({
                model: api.model || MINIMAX_DEFAULT_MODEL, text, stream: false, output_format: 'hex',
                voice_setting: { voice_id: voice || '', ...(api.sendSpeed ? { speed: speedOf(rate) } : {}) },
                audio_setting: { format: 'mp3' },
            }),
        };
    }
    if (format === 'custom') {
        const values = { text, voice: voice || '', speed: speedOf(rate), lang, model: api.model || '', key: api.apiKey || '' };
        const method = api.customMethod === 'GET' ? 'GET' : 'POST';
        const url = fillTemplate(api.customUrl, values, { uri: true });
        const custom = parseJsonText(fillTemplate(api.customHeaders, values), '自定义请求头') || {};
        const usesKey = /\{\{key\}\}/.test(`${api.customUrl}${api.customHeaders}${api.customBody}`);
        const merged = {};
        for (const [name, value] of Object.entries(plainObject(custom) || {})) merged[name] = String(value);
        const has = (name) => Object.keys(merged).some((k) => k.toLowerCase() === name);
        if (api.apiKey && !usesKey && !has('authorization')) merged.Authorization = `Bearer ${api.apiKey}`;
        if (method === 'POST' && !has('content-type')) merged['Content-Type'] = 'application/json';
        let body;
        if (method === 'POST') {
            // 只有请求体是 JSON（没写 Content-Type 或写了 json）才转义并校验；否则按纯文本原样替换。
            const contentType = Object.entries(merged).find(([name]) => name.toLowerCase() === 'content-type');
            if (!contentType || /json/i.test(contentType[1])) {
                body = fillTemplate(api.customBody, values, { raw: ['speed'] });
                if (body.trim()) parseJsonText(body, '自定义请求体');
            } else {
                body = fillTemplate(api.customBody, values, { raw: ['text', 'voice', 'speed', 'lang', 'model', 'key'] });
            }
        }
        return { url: url ? proxied(url, api.transport) : '', method, headers: merged, body: body || undefined };
    }
    const body = { model: api.model || 'tts-1', input: text, voice: voice || 'alloy' };
    if (api.responseFormat !== 'none') body.response_format = api.responseFormat || 'mp3';
    if (api.sendSpeed !== false) body.speed = rate;
    return { url: ttsSpeechUrl(api.endpoint, api.transport), method: 'POST', headers, body: JSON.stringify(body) };
}

function decodeHex(value) {
    const hex = String(value || '').trim().replace(/^0x/i, '');
    if (!hex || hex.length % 2 || /[^0-9a-f]/i.test(hex)) throw new Error('接口返回的音频不是合法的 hex');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return bytes.buffer;
}

function decodeBase64(value) {
    const raw = String(value || '').trim().replace(/^data:[^,]*,/, '');
    let binary;
    try {
        binary = globalThis.atob(raw);
    } catch {
        throw new Error('接口返回的音频不是合法的 base64');
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

// 按 a.b[0].c 取 JSON 里的字段。
export function jsonPathGet(data, path) {
    const keys = String(path || '').replace(/\[(\d+)\]/g, '.$1').split('.').map((k) => k.trim()).filter(Boolean);
    let node = data;
    for (const key of keys) {
        if (node === null || typeof node !== 'object' || !hasOwn(node, key)) return undefined;
        node = node[key];
    }
    return node;
}

// 把响应变成音频字节（ArrayBuffer）；json 类响应按格式取字段。
export async function parseTtsResponse(api, res, guard = null) {
    const format = api.format || 'openai';
    let mode = 'audio';
    let path = '';
    if (format === 'minimax') { mode = 'json-hex'; path = 'data.audio'; }
    if (format === 'custom') { mode = api.customResponse || 'audio'; path = api.customPath; }
    if (mode === 'audio') {
        // 接口出错时常常返回 200 加 JSON / 文本：先看 content-type，别把它当音频缓存起来。
        const type = res.headers && typeof res.headers.get === 'function' ? String(res.headers.get('content-type') || '') : '';
        if (/json|text|html|xml/i.test(type)) throw new Error(`接口返回的不是音频：${String(await res.text()).replace(/\s+/g, ' ').trim().slice(0, 80)}`);
        return res.arrayBuffer();
    }
    let data;
    try {
        data = JSON.parse(await res.text());
    } catch {
        throw new Error('接口返回的不是 JSON');
    }
    if (format === 'minimax' && data && data.base_resp && Number(data.base_resp.status_code) !== 0) {
        throw new Error(`接口返回错误 ${data.base_resp.status_code}：${String(data.base_resp.status_msg || '').slice(0, 120)}`);
    }
    const value = jsonPathGet(data, path);
    if (typeof value !== 'string' || !value) throw new Error(`响应里没有找到音频（字段路径：${path || '未填写'}）`);
    if (mode === 'json-hex') return decodeHex(value);
    if (mode === 'json-base64') return decodeBase64(value);
    let audio;
    try {
        audio = await fetch(proxied(value, api.transport), guard && guard.signal ? { signal: guard.signal } : undefined);
    } catch {
        throw new Error('下载接口返回的音频地址失败');
    }
    if (!audio.ok) throw new Error(`下载音频失败 ${audio.status}`);
    return audio.arrayBuffer();
}

// 页面是 https、接口是 http 的非本机地址时，浏览器会直接拦掉请求（混合内容）；走酒馆转发时请求发往酒馆自己，不受影响。
export function ttsMixedContentRisk(api, protocol = globalThis.location && globalThis.location.protocol) {
    if (protocol !== 'https:' || api.transport === 'st-proxy') return false;
    const target = String((api.format === 'custom' ? api.customUrl : api.endpoint) || '').trim();
    const match = target.match(/^http:\/\/([^/:?#]+|\[[^\]]*\])/i);
    if (!match) return false;
    return !/^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i.test(match[1]);
}

const MIXED_CONTENT_MESSAGE = '浏览器拦截了 http 接口，请改用酒馆转发或 https';

function connectErrorMessage(api, error) {
    if (error && error.name === 'TypeError' && ttsMixedContentRisk(api)) return MIXED_CONTENT_MESSAGE;
    return api.transport === 'st-proxy'
        ? '连不上接口（酒馆转发需在 config.yaml 打开 enableCorsProxy，也可能是接口本身不可达）'
        : '连不上接口（网络不通或不允许跨域，可以试试「酒馆转发」）';
}

// 每个请求一个守卫：到点（默认 25 秒）或外部中止就 abort；用完必须 dispose 清掉计时器。
function createRequestGuard(external) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const guard = { signal: controller ? controller.signal : undefined, timedOut: false, timer: null, dispose() { clearTimeout(this.timer); } };
    if (!controller) return guard;
    guard.timer = setTimeout(() => {
        guard.timedOut = true;
        controller.abort();
    }, API_TIMEOUT_MS);
    if (external) {
        const onAbort = () => controller.abort();
        if (external.aborted) onAbort();
        else external.addEventListener('abort', onAbort, { once: true });
    }
    return guard;
}

// 发请求并统一处理「连不上」「超时」「非 2xx」，所有格式、拉取音色共用。
async function sendTtsRequest(api, request, guard = null) {
    let res;
    try {
        res = await fetch(request.url, {
            method: request.method, headers: request.headers,
            ...(request.body === undefined ? {} : { body: request.body }),
            ...(guard && guard.signal ? { signal: guard.signal } : {}),
        });
    } catch (error) {
        if (guard && !guard.timedOut && guard.signal && guard.signal.aborted) throw new Error('已取消');
        throw new Error(connectErrorMessage(api, error));
    }
    if (!res.ok) {
        if (api.transport === 'st-proxy' && res.status === 404) throw new Error('酒馆的转发没开：请在酒馆 config.yaml 里设 enableCorsProxy: true 后重启');
        let raw = '';
        try { raw = await res.text(); } catch { /* ignore */ }
        throw new Error(ttsErrorMessage(res.status, raw, api));
    }
    return res;
}

async function postSpeech(api, plan, external = null) {
    const guard = createRequestGuard(external);
    try {
        const request = buildTtsRequest(api, plan);
        if (!request.url) throw new Error(api.format === 'custom' ? '还没有填写请求地址' : '还没有填写接口地址');
        return await parseTtsResponse(api, await sendTtsRequest(api, request, guard), guard);
    } catch (error) {
        // 读响应体时被超时 / 中止打断：按同样的口径报。
        if (guard.timedOut) throw new Error('接口 25 秒没有响应，可能是合成太慢或服务卡住了');
        if (guard.signal && guard.signal.aborted) throw new Error('已取消');
        throw error;
    } finally {
        guard.dispose();
    }
}

// —— 拉取音色列表 ——
const OPENAI_VOICES = Object.freeze(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse']);
const SILICONFLOW_VOICES = Object.freeze(['alex', 'benjamin', 'charles', 'david', 'anna', 'bella', 'claire', 'diana']);

function voiceListBase(api) {
    return String(api.endpoint || '').trim().replace(/\/+$/, '').replace(/\/audio\/speech$/i, '');
}

export function builtinOpenAiVoices(endpoint) {
    const list = OPENAI_VOICES.map((id) => [id, '']);
    if (/siliconflow/i.test(String(endpoint || ''))) for (const id of SILICONFLOW_VOICES) list.push([`FunAudioLLM/CosyVoice2-0.5B:${id}`, '']);
    return list;
}

// 返回 { ok, voices: [[id, 标题]], builtin?, error? }；失败不抛。
export async function fetchTtsVoices(settings) {
    const api = normalizeTtsSettings(settings).api;
    const authHeaders = api.apiKey ? { Authorization: `Bearer ${api.apiKey}` } : {};
    const getJson = async (url, init = {}) => {
        const guard = createRequestGuard();
        try {
            const res = await sendTtsRequest(api, { url: proxied(url, api.transport), method: init.method || 'GET', headers: { ...authHeaders, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, body: init.body }, guard);
            return await res.json();
        } finally {
            guard.dispose();
        }
    };
    try {
        if (api.format === 'fish') {
            const base = (voiceListBase(api) || FORMAT_DEFAULT_ENDPOINTS.fish).replace(/\/v1\/tts$/i, '');
            const data = await getJson(`${base}/model?self=true&page_size=100`);
            const voices = (Array.isArray(data && data.items) ? data.items : []).map((item) => [String(item._id || ''), String(item.title || '')]);
            return { ok: true, voices };
        }
        if (api.format === 'minimax') {
            const base = (voiceListBase(api) || FORMAT_DEFAULT_ENDPOINTS.minimax).replace(/\/v1\/t2a_v2$/i, '');
            const data = await getJson(`${base}/v1/get_voice`, { method: 'POST', body: JSON.stringify({ voice_type: 'all' }) });
            if (data && data.base_resp && Number(data.base_resp.status_code) !== 0) throw new Error(String(data.base_resp.status_msg || '获取失败'));
            const voices = [];
            for (const key of ['system_voice', 'voice_cloning', 'voice_generation']) {
                for (const item of Array.isArray(data && data[key]) ? data[key] : []) voices.push([String(item.voice_id || ''), String(item.voice_name || '')]);
            }
            return { ok: true, voices };
        }
        if (api.format !== 'openai') return { ok: false, voices: [], error: '这种接口格式不支持获取音色列表' };
    } catch (error) {
        return { ok: false, voices: [], error: (error && error.message) || '获取音色列表失败' };
    }
    const base = voiceListBase(api);
    if (base) {
        try {
            const data = await getJson(`${base}/audio/voice/list`);
            const voices = (Array.isArray(data && (data.results || data.result)) ? (data.results || data.result) : []).map((item) => [String(item.uri || ''), String(item.customName || '')]).filter(([id]) => id);
            if (voices.length) return { ok: true, voices };
        } catch { /* 不是 SiliconFlow 之类的接口：用内置列表 */ }
    }
    return { ok: true, voices: builtinOpenAiVoices(api.endpoint), builtin: true };
}

// 缓存键不含语速与首尾引号：提前生成时还不知道下一页的情绪，语速差在 RATE_TOLERANCE 内就算同一条。
// 键里带接口格式与会影响音频的格式项，换格式 / 换请求模板后不会读到旧音频。
export function ttsCacheKey(url, api, voice, text) {
    const body = String(text || '').replace(/^[\s「『“"'‘]+|[\s」』”"'’]+$/g, '').replace(/\s+/g, ' ');
    const format = api.format || 'openai';
    const noSpeed = api.sendSpeed === false ? 'nospeed' : '';
    const variant = format === 'openai' ? `${api.responseFormat || 'mp3'}${noSpeed}`
        : format === 'custom' ? hashName([api.customMethod, api.customUrl, api.customHeaders, api.customBody, api.customResponse, api.customPath].join('\n')).toString(36) + noSpeed : noSpeed;
    return [url, format, variant, api.model, voice, body].join('|');
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
        await persistentWrites;
        const cache = await persistentStore();
        const res = cache ? await cache.match(persistUrl(key)) : null;
        if (!res || !closeRate(Number(res.headers.get('x-igs-rate')) || 1, rate)) return null;
        return await res.arrayBuffer();
    } catch {
        return null;
    }
}

function persistentPut(key, bytes, rate, epoch) {
    const work = persistentWrites.then(async () => {
        if (epoch !== cacheEpoch) return;
        const cache = await persistentStore();
        if (!cache || typeof Response !== 'function') return;
        await cache.put(persistUrl(key), new Response(bytes.slice(0), { headers: { 'Content-Type': 'application/octet-stream', 'x-igs-rate': String(rate) } }));
        const keys = await cache.keys();
        if (keys.length > PERSIST_MAX) await Promise.all(keys.slice(0, keys.length - cacheLowWater(PERSIST_MAX)).map(old => cache.delete(old)));
    });
    persistentWrites = work.catch(() => {});
    return persistentWrites;
}

export async function clearTtsCache() {
    cacheEpoch++; apiCache.clear(); inflight.clear();
    const work = persistentWrites.then(async () => {
        if (globalThis.caches && typeof globalThis.caches.delete === 'function') await globalThis.caches.delete(PERSIST_NAME);
    });
    persistentWrites = work.catch(() => {});
    return persistentWrites;
}

function remember(key, bytes, rate) {
    apiCache.delete(key);
    apiCache.set(key, { bytes, rate });
    trimCacheEntries(apiCache, API_CACHE_MAX);
}

// 接口模式的长句分段：超过阈值才切，按句末标点切，每段不少于 API_SEGMENT_MIN 字，末尾过短的并进上一段。
export function splitTtsSegments(text, { threshold = API_SEGMENT_THRESHOLD, min = API_SEGMENT_MIN } = {}) {
    const value = String(text || '').trim();
    if (value.length <= threshold) return value ? [value] : [];
    const sentences = value.match(/[^。！？!?…\n]+[。！？!?…」』”’）)]*|[。！？!?…]+/g) || [value];
    const out = [];
    let buf = '';
    for (const sentence of sentences) {
        buf += sentence;
        if (buf.trim().length >= min) {
            out.push(buf.trim());
            buf = '';
        }
    }
    if (buf.trim()) {
        if (out.length) out[out.length - 1] += buf.trim();
        else out.push(buf.trim());
    }
    return out;
}

const apiSegments = (api, text) => (api.chunk === false ? [text] : splitTtsSegments(text));
// 第一段立即请求；其余段同时在途最多 SEGMENT_CONCURRENCY 个，按顺序补位。isCancelled 为真时不再发起还没开始的段。
const SEGMENT_CONCURRENCY = 2;
function requestSegments(api, plan, texts, isCancelled = () => false, job = null) {
    const first = requestSpeech(api, { ...plan, text: texts[0] }, job);
    const queue = [];
    const rest = texts.slice(1).map((text) => new Promise((resolve, reject) => queue.push({ text, resolve, reject })));
    let running = 0;
    const pump = () => {
        while (running < SEGMENT_CONCURRENCY && queue.length) {
            const item = queue.shift();
            if (isCancelled()) {
                item.reject(new Error('已取消'));
                continue;
            }
            running += 1;
            requestSpeech(api, { ...plan, text: item.text }, job).then(item.resolve, item.reject).finally(() => {
                running -= 1;
                pump();
            });
        }
    };
    pump();
    return [first, ...rest];
}

// 同一句只请求一次：缓存里有就直接用，正在生成就等那一条（翻页、提前生成共用）。
// job 传进来表示这条请求是某个播放任务在等：任务停掉时，只有没人共享（没被预取、没被别的任务等）的请求才会真正中止。
// decodeAudioData 会占用传入的数据，所以每次交出去的都是副本。
function requestSpeech(api, plan, job = null) {
    let request;
    try {
        request = buildTtsRequest(api, plan);
    } catch (error) {
        return Promise.reject(error);
    }
    const url = request.url;
    if (!url) return Promise.reject(new Error(api.format === 'custom' ? '还没有填写请求地址' : '还没有填写接口地址'));
    const key = ttsCacheKey(url, api, plan.voice, plan.text);
    const epoch = cacheEpoch;
    const hit = apiCache.get(key);
    if (hit && closeRate(hit.rate, plan.rate)) {
        apiCache.delete(key);
        apiCache.set(key, hit);
        return Promise.resolve(hit.bytes.slice(0));
    }
    // 每个等这条请求的人记一次；预取没有任务，记了不归还，所以预取过的请求不会被某个任务的停止中止掉。
    const join = (entry) => {
        entry.refs += 1;
        if (job) {
            let released = false;
            job.releases.push(() => {
                if (released) return;
                released = true;
                entry.refs -= 1;
                if (entry.refs <= 0 && !entry.settled && entry.controller) {
                    if (inflight.get(key) === entry) inflight.delete(key);
                    entry.controller.abort();
                }
            });
        }
        return entry.promise.then((bytes) => bytes.slice(0));
    };
    const pending = inflight.get(key);
    if (pending && closeRate(pending.rate, plan.rate)) return join(pending);
    const entry = { rate: plan.rate, refs: 0, settled: false, promise: null, controller: typeof AbortController === 'function' ? new AbortController() : null };
    entry.promise = persistentGet(key, plan.rate).then((stored) => {
        if (stored) {
            if (epoch === cacheEpoch) remember(key, stored, plan.rate);
            return stored;
        }
        return postSpeech(api, plan, entry.controller && entry.controller.signal).then((bytes) => {
            if (epoch === cacheEpoch) {
                remember(key, bytes, plan.rate);
                void persistentPut(key, bytes, plan.rate, epoch);
            }
            return bytes;
        });
    }).finally(() => {
        entry.settled = true;
        if (inflight.get(key) === entry) inflight.delete(key);
    });
    inflight.set(key, entry);
    return join(entry);
}

// 解码音频：新浏览器返回 Promise，旧 Safari 只认回调，两种写法都接。
function decodeAudio(context, bytes) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const ok = (buffer) => {
            if (settled) return;
            settled = true;
            resolve(buffer);
        };
        const bad = () => {
            if (settled) return;
            settled = true;
            reject(new Error('音频解码失败'));
        };
        try {
            const result = context.decodeAudioData(bytes, ok, bad);
            if (result && typeof result.then === 'function') result.then(ok, bad);
        } catch {
            bad();
        }
    });
}

const SIGNATURES = [[0x49, 0x44, 0x33], [0x52, 0x49, 0x46, 0x46], [0x4f, 0x67, 0x67, 0x53], [0x66, 0x4c, 0x61, 0x43], [0x1a, 0x45, 0xdf, 0xa3]];

// 接口出错时常返回 JSON 或一段文字：解码前看一眼开头几个字节，像文本就把前 80 字报给用户，免得只说「解码失败」。
// 认得出的音频头（ID3、RIFF、Ogg、fLaC、MP3 帧同步）直接放行。
export function describeNonAudio(bytes) {
    const size = bytes ? bytes.byteLength : 0;
    if (!size) return '接口返回了空音频';
    const head = new Uint8Array(bytes, 0, Math.min(size, 80));
    if (SIGNATURES.some((sig) => sig.every((b, i) => head[i] === b)) || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return '';
    for (const byte of head) {
        if (!(byte === 9 || byte === 10 || byte === 13 || byte >= 32)) return '';
    }
    let text = '';
    try {
        text = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(size, 240)));
    } catch { /* ignore */ }
    text = text.replace(/\s+/g, ' ').trim().slice(0, 80);
    return text ? `接口返回的不是音频：${text}` : '';
}

// 报给用户的必须是中文：自己抛的带中文原样用，其余（浏览器的英文原文）统一成通用文案。
const userMessage = (error, fallback = '朗读失败') => {
    const message = error && error.message ? String(error.message) : '';
    return /[一-鿿]/.test(message) ? message : fallback;
};

// 到点还没念完（卡在请求、解码或播放上）就整个收掉：停掉所有声音、报错、收尾，让自动播放和排队的下一句能继续。
function expireJob(job, message) {
    if (job.done) return;
    haltJob(job);
    reportError(message, job);
    finish(job);
}

function speakApi(job, plan, api) {
    const bus = busInput(plan.close || plan.phone || voiceFilterUsesDry() ? 'dry' : 'voice');
    if (!bus) {
        reportError('浏览器音频不可用', job);
        finish(job);
        return job;
    }
    const context = bus.context;
    // 长句切成几段：第一段先请求先播，其余最多两条并行请求、解码好就按顺序接在后面播（每段各自走缓存）。
    const texts = apiSegments(api, plan.text);
    const requests = requestSegments(api, plan, texts, () => job.cancelled || job.done, job);
    // 这一页的音频全部拿到后再去生成下一页，两条请求不抢带宽。
    job.fetched = Promise.all(requests.map((request) => request.then(() => null, () => null))).then(() => null);
    const decoded = requests.map((request) => request.then((bytes) => {
        if (job.cancelled) return null;
        const problem = describeNonAudio(bytes);
        if (problem) throw new Error(problem);
        return decodeAudio(context, bytes);
    }));
    for (const item of decoded) item.catch(() => {});
    // 总看门狗：估算朗读时长的两倍，加上请求的最长等待与总线解锁等待。
    const spoken = (plan.text.length / (CHARS_PER_SECOND * (plan.rate || 1))) * 2 * 1000;
    job.watchdog = setTimeout(() => expireJob(job, '朗读超时，已停止'), spoken + API_TIMEOUT_MS * Math.ceil(texts.length / (SEGMENT_CONCURRENCY + 1)) + RESUME_TIMEOUT_MS);
    const play = async () => {
        // 浏览器没放行声音（自动播放策略）时 resume 可能一直不返回：最多等一小会儿，然后提示点一下画面。
        let timer = null;
        await Promise.race([resumeAudioBus(), new Promise((resolve) => { timer = setTimeout(resolve, RESUME_TIMEOUT_MS); })]);
        clearTimeout(timer);
        if (job.cancelled) return;
        if (context.state !== 'running') {
            armAudioBusRetry();
            reportError('浏览器拦住了声音，点一下画面就能播放', job);
            finish(job);
            return;
        }
        const sources = [];
        let scheduled = false;
        let chain = null;
        let when = 0;
        const settle = () => {
            if (scheduled && !job.cancelled && sources.every((source) => source.igsEnded)) finish(job);
        };
        try {
            for (const item of decoded) {
                const buffer = await item;
                if (job.cancelled) return;
                if (!buffer) throw new Error('音频解码失败');
                const source = context.createBufferSource();
                source.buffer = buffer;
                chain = chain || buildBarkChain(context, bus, plan, job.nodes);
                source.connect(chain);
                source.onended = () => {
                    source.igsEnded = true;
                    settle();
                };
                const startAt = Math.max(when, context.currentTime + 0.02);
                source.start(startAt);
                when = startAt + (buffer.duration || 0);
                if (!sources.length) {
                    job.source = source;
                    lastError = '';
                    job.releaseDuck = duckSceneAudio({ ratio: TTS_DUCK_RATIO });
                }
                sources.push(source);
                job.sources.push(source);
                yieldTypewriterAudio(Math.max(0, when - context.currentTime));
            }
        } catch (error) {
            if (job.cancelled) return;
            reportError(userMessage(error), job);
        }
        scheduled = true;
        if (!sources.length) finish(job);
        else settle();
    };
    play().catch((error) => {
        if (job.cancelled) return;
        reportError(userMessage(error), job);
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

// 首次朗读等过 voiceschanged 之后不再等。
let voicesWaited = false;

// 仅供测试：清掉模块里的一次性状态。
export function resetTtsForTest() {
    voicesWaited = false;
}

const states = new WeakMap();

// 工具栏「重听这句」的提示：这一页没念时写明原因。
function syncReplayTitle(root, page) {
    try {
        const button = typeof root.querySelector === 'function' ? root.querySelector('#igs-btn-tts-replay') : null;
        if (!button) return;
        const title = lastSkip && lastSkip.key === page ? `本页未朗读：${lastSkip.reason}` : '重听这句';
        button.setAttribute('title', title);
        button.setAttribute('aria-label', title);
    } catch { /* ignore */ }
}

// 阅读器每次渲染调用；换页就停掉上一页，同一页重绘（设置变化、窗口缩放）不重念。
// line.next：下一页的原文（本条消息最后一页时为空）。接口来源：在这一页停够 PREFETCH_DWELL_MS 且这一页音频到手后，
// 提前生成下一页；连续快速翻页时当前页也推迟一点再请求，还在翻就不请求。系统语音免费，照常立即念。
export function applyTts(root, line, settings, sceneAssets, { now = Date.now, timers = globalThis } = {}) {
    if (!root) return null;
    let state = states.get(root);
    if (!state) states.set(root, (state = {}));
    lastLine = { line, settings, sceneAssets };
    const plan = decideTts(state, line, settings, { sceneAssets, voices: listSystemVoices() });
    syncReplayTitle(root, String(line.key || ''));
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
    // 系统声音列表第一次读常常是空的：先等 voiceschanged（最多 800ms）再选声音，免得同一个角色前后换声。
    const awaitVoices = !api && !voicesWaited && !listSystemVoices().length;
    const start = () => {
        if (state.token !== token) return null;
        if (awaitVoices && !voicesWaited) {
            // 只等这一次：等过之后即使声音一直是空的，也不再让每一页都晚 800ms。
            voicesWaited = true;
            waitForSystemVoices().then(() => {
                if (state.token !== token) return;
                const again = decideTts({}, line, settings, { sceneAssets, voices: listSystemVoices(), record: false });
                if (again && !again.skip) playTts(again, settings);
            });
            return null;
        }
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
    if (!lastPlayed && lastLine) {
        // 这一页翻过来时没念（比如那时朗读还没开）：按现在的设置再判断一次，能念就补念。
        const plan = decideTts({}, lastLine.line, lastLine.settings, { sceneAssets: lastLine.sceneAssets, voices: listSystemVoices() });
        if (plan && !plan.skip) lastPlayed = { plan, settings: lastLine.settings };
        else if (lastSkip) return { ok: false, error: '本页未朗读：' + lastSkip.reason };
    }
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
    const plan = decideTts({}, { ...guessTtsLine(segment), nsfw }, config, { sceneAssets, record: false });
    if (!plan || plan.skip) return null;
    const jobs = requestSegments(config.api, plan, apiSegments(config.api, plan.text));
    return Promise.all(jobs).then((list) => list[0], () => null);
}

// 设置里的试听：按当前来源念一句。接口来源会等结果，失败时返回原因。
export function previewTts(settings, { role = 'female', voice = '' } = {}) {
    const config = normalizeTtsSettings(settings);
    const voices = listSystemVoices();
    const picked = voice || (config.provider === 'api'
        ? config.api[role] || config.api.female
        : config.system[role] || (systemVoicePool(voices, role === 'narrator' ? '' : role)[0] || {}).name || '');
    // 接口来源三个框全空时不发请求，直接说明原因，免得服务端拿默认音色念。
    if (config.provider === 'api' && !picked) return Promise.resolve({ ok: false, error: '三个声音都留空了，填一个声音 ID 再试听' });
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
