// 台词朗读（TTS）：逐页朗读台词、心里话，旁白可选。和角色语气音二选一，开了朗读就不播语气音。
// 两种来源：系统语音（浏览器 speechSynthesis，零配置；Windows 上 Edge 有晓晓、云希等在线自然声）
// 和接口：OpenAI 兼容的 /audio/speech（网站 API，或本地 GPT-SoVITS / CosyVoice 等兼容服务），
// 或 Fish Audio 原生的 /v1/tts（text + reference_id，模型放请求头）。
// 系统语音不经过 Web Audio，只能调音量、语速、音高；接口返回的音频走总线，声像、听筒、贴耳与语气音一致。
import { trimCacheEntries } from '../../media/cache-eviction.js';
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
export const TTS_THOUGHT_BILINGUAL_MODES = Object.freeze([
    ['same', '同台词'],
    ['translation', '读译文'],
    ['original', '读原文'],
]);
// 角色单独音量：0 为这个角色不朗读。
export const TTS_CHARACTER_VOLUMES = Object.freeze([[2, '200%'], [1.5, '150%'], [1.25, '125%'], [1, '100%'], [0.75, '75%'], [0.5, '50%'], [0.25, '25%'], [0, '不朗读']]);
// 角色音量可放大到 200%：接口音频走增益节点的上限（系统语音浏览器最高 100%）。
export const TTS_GAIN_CAP = 2;
const ROLE_KEYS = ['female', 'male', 'narrator'];
const TTS_DEFAULTS = Object.freeze({ enabled: false, provider: 'system', volume: 0.9, rate: 1, narration: true, nsfw: false, narratorRate: 1, cacheMax: 300 });
// 朗读时 BGM 与环境音让得比语气音多一点，台词要听清。
const TTS_DUCK_RATIO = 0.55;
// 读完后场景声再压低这么久才回升，连续朗读时不一起一伏。
const TTS_DUCK_HOLD_MS = 800;
// 人声净化（向下扩展）：阈值取最大 10 ms 窗 RMS 以下 26 dB，低于阈值按 1:2 扩展，最多压 18 dB。
const CLEANUP_WINDOW_MS = 10;
const CLEANUP_THRESHOLD_DB = 26;
const CLEANUP_RATIO = 2;
const CLEANUP_FLOOR_DB = 18;
const CLEANUP_ATTACK_MS = 5;
const CLEANUP_RELEASE_MS = 80;
// 单段超过这个时长不做净化，只做响度统一。
const CLEANUP_MAX_S = 30;
// 响度统一：目标 RMS、静音门限（最大窗以下 40 dB 不计）、增益范围、峰值上限。
const LOUD_TARGET_DB = -20;
const LOUD_GATE_DB = 40;
const LOUD_GAIN_MIN = 0.5;
const LOUD_GAIN_MAX = 2.5;
const LOUD_PEAK_DB = -1;
const THOUGHT_VOLUME_DEFAULT = 0.8;
// Chrome 一条朗读超过约 15 秒会被掐断，按句切成短段排队念。
const CHUNK_MAX = 120;
// 系统语音拿不到时长，按每秒约 4.5 个字估算，用于让打字音静音。
const CHARS_PER_SECOND = 4.5;
// 内存里留 60 条（一条 mp3 约 30–80KB）；另存一份到浏览器 Cache Storage，重开阅读器、回看旧楼层也能直接用。
const API_CACHE_MAX = 60;
// 持久缓存条数的可设范围；默认值见 TTS_DEFAULTS.cacheMax。
export const TTS_CACHE_LIMIT = 2000;
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
const API_SEGMENT_THRESHOLD = 40;
const API_SEGMENT_MIN = 12;
const LEXICON_MAX = 4000;
// 声音库最多存这么多个；Fish / MiniMax 的声音 ID 连标题一项可达百来字，字数上限按个数留足。
export const TTS_VOICE_MAX = 200;
const VOICES_TEXT_MAX = TTS_VOICE_MAX * 160;
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
// 情绪写进风格描述时用的短语；平和不写。
const MOOD_STYLE_TEXT = Object.freeze({
    喜悦: '语气愉快', 愤怒: '语气愤怒', 悲伤: '语气悲伤低落', 惊讶: '语气惊讶', 害羞: '语气羞涩', 紧张: '语气紧张', 思考: '语气若有所思',
    爱恋: '语气温柔含情', 嫌弃: '语气嫌弃', 得意: '语气得意', 冷淡: '语气冷淡', 大笑: '带着笑意', 哭泣: '带着哭腔', 不满: '语气不满',
    无奈: '语气无奈', 心虚: '语气心虚', 委屈: '语气委屈', 怀疑: '语气带着怀疑', 动情: '声音轻柔动情',
});
const WHISPER_STYLE_TEXT = '压低声音耳语';
// 音频标签（Fish s2 系列）：中文情绪 → 句首英文描述标签；平和与未知不加。
const MOOD_FISH_TAG = Object.freeze({
    喜悦: '[happy]', 愤怒: '[angry]', 悲伤: '[sad]', 惊讶: '[surprised]', 害羞: '[shy, soft voice]', 紧张: '[nervous]',
    思考: '[thoughtful]', 爱恋: '[tender]', 嫌弃: '[disgusted]', 得意: '[smug]', 冷淡: '[cold, flat]', 大笑: '[laughing]',
    哭泣: '[sobbing]', 不满: '[dissatisfied]', 无奈: '[helpless, resigned]', 心虚: '[guilty, hesitant]',
    委屈: '[aggrieved, on the verge of tears]', 怀疑: '[doubtful]', 动情: '[breathy, tender]',
});
const WHISPER_FISH_TAG = '[whisper]';
const THOUGHT_FISH_TAG = '[soft inner voice]';
// 疑惑类情绪词归在「思考」组，朗读要的是上扬的疑问语气，不是若有所思。
const CONFUSED_RE = /疑惑|困惑|不解|纳闷|迷茫|疑问/;
const CONFUSED_FISH_TAG = '[confused, questioning]';
// 旁白不带标签时 Fish 会照着文字起伏去演。
const NARRATOR_FISH_TAG = '[calm, steady narration]';
// 括号短动作 → 内联标签：按包含关系从上往下匹配，第一项命中即用；空串表示该家没有对应标签（删掉）。
const ACTION_TAGS = Object.freeze([
    [/微笑/, '', ''],
    [/大笑|哈哈|狂笑/, '[laugh]', '(laughs)'],
    [/轻笑|偷笑|苦笑|冷笑|窃笑|浅笑|低笑/, '[chuckle]', '(chuckle)'],
    [/笑/, '[laugh]', '(laughs)'],
    [/叹/, '[sigh]', '(sighs)'],
    [/倒吸|惊呼|惊/, '[gasp]', '(gasps)'],
    [/吸气|深呼吸/, '[inhale]', '(inhale)'],
    [/呼气|吐气/, '[exhale]', '(exhale)'],
    [/喘/, '[panting]', '(pant)'],
    [/抽泣|呜咽|吸鼻/, '[sobbing]', '(sniffs)'],
    [/哭/, '[sobbing]', '(sniffs)'],
    [/小声|低声|耳语|悄声|轻声/, '[whisper]', ''],
    [/停顿|沉默|顿/, '[pause]', ''],
    [/呻吟/, '[moan]', '(groans)'],
    [/咳/, '[cough]', '(coughs)'],
    [/哼/, '[scoff]', ''],
    [/害羞|脸红/, '[shy]', ''],
]);
const TAG_SPLIT_RE = /(\[[^\]\n]*\]|\((?:laughs|chuckle|breath|pant|inhale|exhale|gasps|sighs|sniffs|groans|coughs|emm)\))/;
// 这一套接口是否插音频标签：'fish' | 'minimax' | ''。
const ttsTagMode = (api) => (api && api.audioTags !== false && (api.format === 'fish' || api.format === 'minimax') ? api.format : '');
// 去掉标签后的文字（判空、判语言用）。
const stripTtsTags = (text) => String(text || '').split(TAG_SPLIT_RE).filter((_, i) => i % 2 === 0).join(' ');
// 读音替换只作用在标签之外的文字。
function applyLexiconOutsideTags(text, pairs) {
    if (!pairs.length) return text;
    return text.split(TAG_SPLIT_RE).map((part, i) => (i % 2 ? part : applyTtsLexicon(part, pairs))).join('');
}
// 情绪标签 → MiniMax voice_setting.emotion；映射不到的不发。
const MINIMAX_EMOTIONS = Object.freeze(['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm']);
const MOOD_EMOTION = Object.freeze({
    喜悦: 'happy', 得意: 'happy', 大笑: 'happy', 悲伤: 'sad', 哭泣: 'sad', 委屈: 'sad', 愤怒: 'angry', 不满: 'angry',
    紧张: 'fearful', 心虚: 'fearful', 嫌弃: 'disgusted', 惊讶: 'surprised', 冷淡: 'calm', 思考: 'calm', 无奈: 'calm',
});

const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const field = (v) => String(v ?? '').trim().slice(0, MAX_FIELD);
const template = (v) => String(v ?? '').trim().slice(0, MAX_TEMPLATE);
const pick = (list, v, fallback) => (list.some(([id]) => id === v) ? v : fallback);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 一套接口的连接项：台词接口与旁白独立接口共用。
function normalizeTtsApi(api) {
    return {
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
        // MiniMax：把情绪标签映射为 voice_setting.emotion 发送。
        sendEmotion: api.sendEmotion !== false,
        // Fish / MiniMax：在文字里插入语气与情绪标签（情绪句首标签、括号动作转内联标签）。
        audioTags: api.audioTags !== false,
    };
}

export function normalizeTtsSettings(value) {
    const source = plainObject(value) || {};
    const system = plainObject(source.system) || {};
    const api = plainObject(source.api) || {};
    const narratorApi = plainObject(source.narratorApi) || {};
    const volume = Number(source.volume);
    const rate = Number(source.rate);
    const thoughtVolume = Number(source.thoughtVolume);
    const narratorRate = Number(source.narratorRate);
    const cacheMax = Number(source.cacheMax);
    const roles = (src) => Object.fromEntries(ROLE_KEYS.map((key) => [key, field(src[key])]));
    return {
        enabled: source.enabled === true,
        provider: TTS_PROVIDERS.some(([id]) => id === source.provider) ? source.provider : TTS_DEFAULTS.provider,
        volume: Number.isFinite(volume) ? clamp(volume, 0, 1) : TTS_DEFAULTS.volume,
        rate: TTS_RATES.includes(rate) ? rate : TTS_DEFAULTS.rate,
        narration: source.narration !== false,
        // 旁白页在全局语速上再乘的倍数。
        narratorRate: TTS_RATES.includes(narratorRate) ? narratorRate : TTS_DEFAULTS.narratorRate,
        // 接口朗读的持久缓存最多保留条数，超出按先进先出清理。
        cacheMax: source.cacheMax !== undefined && source.cacheMax !== '' && Number.isFinite(cacheMax) ? clamp(Math.round(cacheMax), 0, TTS_CACHE_LIMIT) : TTS_DEFAULTS.cacheMax,
        nsfw: source.nsfw === true,
        // 人声净化：接口音频滤掉低频嗡声与高频嘶声，并压低字间与句尾的弱信号。
        cleanup: source.cleanup !== false,
        // 翻页不打断：上一句念完再念这一句（快速翻页时只排最新的一句）。
        sustain: source.sustain === true,
        bilingual: source.bilingual === 'original' ? 'original' : 'translation',
        // 心里话页的双语读法：same 跟台词，其余只作用于心里话。
        thoughtBilingual: source.thoughtBilingual === 'original' || source.thoughtBilingual === 'translation' ? source.thoughtBilingual : 'same',
        // 读音替换：每行「原词=读法」。
        lexicon: String(source.lexicon ?? '').slice(0, LEXICON_MAX),
        // 系统声音下拉列出全部语言；关掉时只列中文、日文。
        allVoices: source.allVoices === true,
        // 旁白风格：一段文字描述，OpenAI 兼容接口作为 instructions 发送，自定义请求用 {{style}}。
        narratorStyle: field(source.narratorStyle),
        // 心里话页的风格描述与音量；风格与角色风格、情绪描述一起拼进 style。
        thoughtStyle: field(source.thoughtStyle),
        thoughtVolume: source.thoughtVolume !== undefined && source.thoughtVolume !== null && source.thoughtVolume !== '' && Number.isFinite(thoughtVolume) ? clamp(thoughtVolume, 0, 1) : THOUGHT_VOLUME_DEFAULT,
        // 台词、心里话按情绪与耳语拼一句中文描述写进风格（仅支持风格的格式有意义）。
        moodStyle: source.moodStyle === true,
        system: roles(system),
        // 旁白独立接口：开启后旁白不论主来源是什么，都用这一套接口与声音。
        narratorApi: { enabled: narratorApi.enabled === true, ...normalizeTtsApi(narratorApi), voice: field(narratorApi.voice), voices: limitVoiceText(String(narratorApi.voices ?? '').trim().slice(0, VOICES_TEXT_MAX)) },
        api: {
            ...normalizeTtsApi(api),
            // 声音库：逗号或换行分隔，给角色单独指定时做下拉；最多 TTS_VOICE_MAX 个。
            voices: limitVoiceText(String(api.voices ?? '').trim().slice(0, VOICES_TEXT_MAX)),
            // 提前生成下一页：在一页停够 PREFETCH_DWELL_MS 才生成，快速点过的页不花钱。
            prefetch: api.prefetch !== false,
            ...roles(api),
        },
    };
}

// 声音库每项写「声音名」或「声音名#标题」，标题只用于下拉显示。
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

const joinVoiceEntries = (entries) => entries.map(([id, title]) => (title ? `${id}#${title}` : id)).join(', ');

// 声音库的增删改：按条目编辑后写回同一份文本存储。title 里的分隔符换成空格，id 带分隔符时视为无效。
export function editTtsVoices(text, { index = -1, id, title, remove = false } = {}) {
    const entries = parseVoiceEntries(text);
    const cleanTitle = (v) => String(v ?? '').replace(/[,，\n#\s]+/g, ' ').trim();
    const cleanId = (v) => String(v ?? '').trim();
    if (remove) {
        if (index >= 0 && index < entries.length) entries.splice(index, 1);
        return { ok: true, text: joinVoiceEntries(entries) };
    }
    const nextId = id === undefined ? (entries[index] || [])[0] : cleanId(id);
    if (!nextId || /[,，\n#]/.test(nextId)) return { ok: false, error: '声音 ID 不能为空，也不能包含逗号或 #' };
    if (entries.some(([other], i) => other === nextId && i !== index)) return { ok: false, error: `声音库里已有「${nextId}」` };
    if (index >= 0 && index < entries.length) {
        entries[index] = [nextId, title === undefined ? entries[index][1] : cleanTitle(title)];
    } else {
        if (entries.length >= TTS_VOICE_MAX) return { ok: false, error: `声音库最多 ${TTS_VOICE_MAX} 个` };
        entries.push([nextId, cleanTitle(title)]);
    }
    return { ok: true, text: joinVoiceEntries(entries) };
}

export const ttsVoiceEntries = (text) => parseVoiceEntries(text);

// 超过 TTS_VOICE_MAX 个时只留前面的；没超时原样保留（不改用户的分隔写法）。
function limitVoiceText(text) {
    const entries = parseVoiceEntries(text);
    return entries.length > TTS_VOICE_MAX ? joinVoiceEntries(entries.slice(0, TTS_VOICE_MAX)) : text;
}

export function ttsApiVoiceList(settings) {
    return parseVoiceEntries(normalizeTtsSettings(settings).api.voices).map(([id]) => id);
}

const voiceOptionsOf = (voices) => parseVoiceEntries(voices).map(([id, title]) => [id, title ? `${title}（${id}）` : id]);

export function ttsApiVoiceOptions(settings) {
    return voiceOptionsOf(normalizeTtsSettings(settings).api.voices);
}

// 旁白独立接口的声音库（没有拉取过时为空数组）。
export function ttsNarratorVoiceOptions(settings) {
    return voiceOptionsOf(normalizeTtsSettings(settings).narratorApi.voices);
}

// 把拉取到的声音并进已有的声音库：按声音名去重，已有的在前；满 TTS_VOICE_MAX 个后其余不加，dropped 为没加进去的个数。
export function mergeTtsVoices(existing, fetched) {
    const entries = parseVoiceEntries(existing).slice(0, TTS_VOICE_MAX);
    const seen = new Set(entries.map(([id]) => id));
    let added = 0;
    let dropped = 0;
    for (const [id, title] of fetched) {
        const key = String(id || '').trim();
        if (!key || seen.has(key) || /[,，\n#]/.test(key)) continue;
        seen.add(key);
        if (entries.length >= TTS_VOICE_MAX) {
            dropped += 1;
            continue;
        }
        added += 1;
        const label = String(title || '').replace(/[,，\n#]+/g, ' ').trim();
        entries.push([key, label && label !== key ? label : '']);
    }
    return { text: joinVoiceEntries(entries), added, dropped, total: entries.length };
}

// —— 批量识别：把粘贴的一段文字（JSON、列表、Fish 网址）解析成 [声音 ID, 名称] ——
const BATCH_JSON_LISTS = ['items', 'data', 'voices', 'list', 'system_voice', 'voice_cloning', 'voice_generation'];
const BATCH_ID_KEYS = ['reference_id', 'voice_id', '_id', 'id', 'name'];
const BATCH_NAME_KEYS = ['title', 'voice_name', 'name', 'description'];
const HEX32_RE = /(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/;
const ID_TOKEN_RE = /^[A-Za-z0-9_-]{3,}$/;
const BATCH_SEPARATOR_RE = /[:：|,，\t#]/;
const cleanBatchName = (v) => String(v ?? '')
    .replace(/\(\s*\)|\[\s*\]|（\s*）/g, ' ')
    .replace(/[,，\n#\s]+/g, ' ')
    .replace(/^[\s:：|\-–—"'“”‘’「」\[\]]+|[\s:：|\-–—"'“”‘’「」\[\]]+$/g, '');
const batchIdScore = (token) => (/[0-9_-]/.test(token) || token.length >= 16 ? 1 : 0);

function batchJsonItems(data) {
    if (Array.isArray(data)) return data;
    const obj = plainObject(data);
    if (!obj) return null;
    const lists = BATCH_JSON_LISTS.map((key) => obj[key]).filter(Array.isArray);
    return lists.length ? lists.flat() : null;
}

function batchJsonEntry(item) {
    if (typeof item === 'string' || typeof item === 'number') return batchLineEntry(String(item));
    const obj = plainObject(item);
    if (!obj) return null;
    const text = (key) => (typeof obj[key] === 'string' || typeof obj[key] === 'number' ? String(obj[key]).trim() : '');
    const idKey = BATCH_ID_KEYS.find((key) => text(key));
    if (!idKey) return null;
    const id = text(idKey);
    if (/[,，\n#]/.test(id)) return null;
    const nameKey = BATCH_NAME_KEYS.find((key) => key !== idKey && text(key) && text(key) !== id);
    return [id, nameKey ? cleanBatchName(text(nameKey)) : ''];
}

// 一行文字：返回 [id, name]，认不出 ID 返回 null。
function batchLineEntry(raw) {
    let line = String(raw).trim();
    if (!line) return null;
    const url = line.match(/(?:https?:\/\/)?(?:[\w-]+\.)*fish\.audio\/\S*|https?:\/\/\S+/i);
    if (url) {
        const link = url[0].replace(/[)\]】」,，;；。]+$/, '');
        const rest = line.replace(url[0], ' ').replace(/[(（]\s*$/, '');
        const hex = link.match(HEX32_RE);
        const slug = link.match(/\/m\/([A-Za-z0-9_-]{3,})/);
        const id = hex ? hex[0] : slug ? slug[1] : '';
        return id ? [id, cleanBatchName(rest)] : null;
    }
    const hex = line.match(HEX32_RE);
    if (hex) return [hex[0], cleanBatchName(line.replace(hex[0], ' '))];
    const sepMatch = line.match(BATCH_SEPARATOR_RE);
    if (sepMatch) {
        const cut = line.indexOf(sepMatch[0]);
        const left = line.slice(0, cut).trim();
        const right = line.slice(cut + 1).trim();
        const leftOk = ID_TOKEN_RE.test(left);
        const rightOk = ID_TOKEN_RE.test(right);
        if (leftOk || rightOk) {
            // 只有一侧像 ID 时取那一侧；两侧都像时，「ID#名称」是声音库自己的写法取左侧，其余分隔符看哪侧更像（含数字、下划线、连字符或很长），相同取右侧。
            const leftScore = batchIdScore(left);
            const rightScore = batchIdScore(right);
            const useLeft = leftOk && (!rightOk || sepMatch[0] === '#' || leftScore > rightScore);
            return useLeft ? [left, cleanBatchName(right)] : [right, cleanBatchName(left)];
        }
        line = line.replace(sepMatch[0], ' ');
    }
    const words = line.split(/\s+/).filter(Boolean);
    // 没有分隔符时，单独一个词算 ID；多个词时只认含字母且带数字、下划线或连字符的词。
    const tokens = words.length === 1 ? words.filter((t) => ID_TOKEN_RE.test(t)) : words.filter((t) => ID_TOKEN_RE.test(t) && /[A-Za-z]/.test(t) && /[0-9_-]/.test(t));
    if (!tokens.length) return null;
    const best = tokens.reduce((a, b) => (batchIdScore(b) > batchIdScore(a) || (batchIdScore(b) === batchIdScore(a) && b.length > a.length) ? b : a));
    return [best, cleanBatchName(line.replace(best, ' '))];
}

// 一行里的多条：有 # 时按逗号、顿号、分号切开（声音库存储就是这样）；没有 # 时只按顿号、分号切，三段以上的逗号列表也切，两段逗号视为「名称,ID」。
function splitBatchLine(line) {
    if (/https?:\/\/|fish\.audio/i.test(line)) return [line];
    if (line.includes('#')) return line.split(/[,，、;；]/);
    return line.split(/[、;；]/).flatMap((part) => {
        const commas = part.split(/[,，]/);
        return commas.length >= 3 ? commas : [part];
    });
}

export function parseTtsVoiceBatch(text) {
    const source = String(text ?? '').trim();
    const voices = [];
    const seen = new Set();
    let unrecognized = 0;
    const push = (entry) => {
        if (!entry) {
            unrecognized += 1;
            return;
        }
        const [id, name] = entry;
        if (seen.has(id)) return;
        seen.add(id);
        voices.push([id, name]);
    };
    let items = null;
    if (/^[[{]/.test(source)) {
        try { items = batchJsonItems(JSON.parse(source)); } catch { items = null; }
    }
    if (items) items.forEach((item) => push(batchJsonEntry(item)));
    else source.split(/\r?\n/).forEach((line) => splitBatchLine(line).forEach((part) => { if (part.trim()) push(batchLineEntry(part)); }));
    return { voices, unrecognized };
}

// 页面文字 → 要念的纯文本。双语「原文〖译文〗」默认念译文，original 为真时念原文；去掉字效与心里话星号，
// 再过滤念出来会很怪的东西：网址、emoji 与装饰符号、颜文字、括号里的短动作（「（笑）」「(小声)」），连写的～！… 收成一个。
// tags 为 'fish' 或 'minimax' 时，词表里认得的括号动作换成该家的内联标签，认不得的照旧删掉。
export function ttsPlainText(text, { original = false, tags = '' } = {}) {
    const actionTag = (inner) => {
        if (tags !== 'fish' && tags !== 'minimax') return ' ';
        const hit = ACTION_TAGS.find(([re]) => re.test(inner));
        const tag = hit ? hit[tags === 'fish' ? 1 : 2] : '';
        return tag ? ` ${tag} ` : ' ';
    };
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
        .replace(/[（(]([^（）()\n]*)[）)]/g, (match, inner) => (inner.length <= 6 || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z]/u.test(inner) ? actionTag(inner) : match))
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

// 批量识别出的声音按名称对上角色：先认主名与别名，认不到再看名称包含角色名（两字以上）且唯一命中；已指定台词声音的角色不覆盖，一个角色只取第一条。
export function matchBatchVoicesToCharacters(voices, sceneAssets, { skip = [] } = {}) {
    const assets = plainObject(sceneAssets) || {};
    const names = new Set();
    for (const map of [assets.characters, assets.characterVoices, assets.characterDna, assets.characterAliases]) {
        const obj = plainObject(map);
        if (obj) Object.keys(obj).forEach((key) => names.add(key));
    }
    for (const bad of skip) names.delete(bad);
    const aliases = plainObject(assets.characterAliases) || {};
    const labels = [];
    for (const name of names) {
        labels.push([name, name]);
        if (Array.isArray(aliases[name])) for (const alias of aliases[name]) if (String(alias || '').trim()) labels.push([String(alias).trim(), name]);
    }
    const existing = plainObject(assets.characterVoices) || {};
    const taken = new Set();
    const out = [];
    const claim = (character, id) => {
        if (!character || taken.has(character)) return;
        const entry = plainObject(existing[character]);
        if (entry && typeof entry.tts === 'string' && entry.tts.trim()) return;
        taken.add(character);
        out.push([character, id]);
    };
    const rest = [];
    for (const [id, title] of voices) {
        const label = String(title || '').trim();
        if (!label) continue;
        const exact = canonicalName(assets, label);
        if (names.has(exact)) claim(exact, id);
        else rest.push([id, label]);
    }
    for (const [id, label] of rest) {
        const hits = new Set(labels.filter(([alias]) => alias.length >= 2 && label.includes(alias)).map(([, name]) => name));
        if (hits.size === 1) claim([...hits][0], id);
    }
    return out;
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

export const hasNaturalSystemVoice = (voices) => voices.some((v) => NATURAL_RE.test(v.name) || /自然/.test(v.name));

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

// 说话人的主名：阅读器给了 speakerKey（已按别名、酒馆用户名解析好）就以它为准，否则按别名表查。
const speakerMainName = (assets, line) => canonicalName(assets, line.speakerKey || line.speaker);

// 台词、心里话这一页的风格描述：心里话风格、角色风格、情绪与耳语描述（开了 moodStyle 才写）用「；」连接。
function spokenStyle(config, sceneAssets, line, mood) {
    const assets = plainObject(sceneAssets) || {};
    const map = plainObject(assets.characterVoices) || {};
    const name = speakerMainName(assets, line);
    const character = name && hasOwn(map, name) ? normalizeCharacterVoice(map[name]).ttsStyle : '';
    const emotion = config.moodStyle ? [line.whisper ? WHISPER_STYLE_TEXT : '', MOOD_STYLE_TEXT[mood] || ''].filter(Boolean).join('，') : '';
    return [line.textType === 'thought' ? config.thoughtStyle : '', character, emotion].filter(Boolean).join('；');
}

const ROLE_SOURCE = Object.freeze({ female: '女角色默认', male: '男角色默认', narrator: '旁白默认' });

// 这一页由谁念、用什么声音（纯函数，便于测试）。voices 是系统声音列表（接口来源时不用）。
// line.lang：这一页文字的语言（zh / ja / en），系统声音按它挑；接口来源不管语言。
// 返回 { voice, role, gender, name, source, pitch, rate, volume }；name 是实际查表用的主名，source 说明声音从哪来（诊断用）；voice 为 '' 表示系统默认声音，volume 为 0 表示这个角色不朗读。
export function resolveTtsVoice(line, settings, sceneAssets, voices = []) {
    const config = normalizeTtsSettings(settings);
    const assets = plainObject(sceneAssets) || {};
    const narrator = line.textType !== 'dialogue' && line.textType !== 'thought';
    const name = narrator ? '' : speakerMainName(assets, line);
    const manualMap = plainObject(assets.characterVoices) || {};
    const manual = name ? normalizeCharacterVoice(hasOwn(manualMap, name) ? manualMap[name] : null) : normalizeCharacterVoice(null);
    const gender = name ? characterDnaGender(assets, name) : '';
    const role = narrator ? 'narrator' : (gender || 'female');
    // 角色在「角色设定」里调的音高、语速，朗读也跟着用。
    let pitch = 2 ** (manual.pitch / 12);
    // 台词语速：单独设了用它，没设跟随原语速；心里话再往前一层：心里话语速 → 台词语速 → 原语速。
    const thought = line.textType === 'thought';
    const rate = narrator ? manual.speed : (thought && manual.ttsThoughtSpeed) || manual.ttsSpeed || manual.speed;
    // 心里话音量：单独设了（含 0 不朗读）用它，没设跟随台词音量。
    const volume = thought && manual.ttsThoughtVolume >= 0 ? manual.ttsThoughtVolume : manual.ttsVolume;
    // 心里话可以单独配一个声音，没配时和台词同一个。
    const manualId = thought && manual.ttsThought ? manual.ttsThought : manual.tts;
    const manualSource = thought && manual.ttsThought ? '角色指定心里话声音' : '角色指定台词声音';
    const roleSource = ROLE_SOURCE[role];
    const found = (extra) => ({ role, gender, name, ...extra });
    // 旁白独立接口：不看主来源，声音只取这套接口里填的。
    if (narrator && config.narratorApi.enabled) {
        const voice = config.narratorApi.voice;
        return found({ voice, pitch: 1, rate, volume: voice ? volume : 0, provider: 'api', apiSource: 'narrator', source: '旁白独立接口' });
    }
    if (config.provider === 'api') {
        const api = config.api;
        const voice = manualId || api[role] || (narrator ? api.female : '') || api.female || api.male || '';
        // 三个声音框都留空、角色也没单独指定时就是「不添加声音」：volume 0 让 decideTts 直接返回 null，不发合成请求。
        const source = manualId ? manualSource : api[role] ? roleSource : (api.female || api.male) ? `${narrator ? '旁白未设，回落' : ''}${api.female ? ROLE_SOURCE.female : ROLE_SOURCE.male}` : '';
        return found({ voice, pitch: 1, rate, volume: voice ? volume : 0, source });
    }
    const lang = line.lang || 'zh';
    const fits = (voiceName) => {
        const found = findSystemVoice(voices, voiceName);
        return Boolean(found) && String(found.lang || '').toLowerCase().startsWith(lang);
    };
    // 角色单独指定的声音照用；旁白 / 女声 / 男声的预设只在语言对得上时用（读日文原文时不拿中文声音念）。
    const manualVoice = findSystemVoice(voices, manualId);
    if (manualVoice) return found({ voice: manualVoice.name, pitch, rate, volume, source: manualSource });
    const preset = config.system[role];
    if (preset && fits(preset)) return found({ voice: findSystemVoice(voices, preset).name, pitch, rate, volume, source: roleSource });
    const pool = systemVoicePool(voices, narrator ? '' : gender, lang);
    if (!pool.length) return found({ voice: '', pitch, rate, volume, source: '系统默认声音' });
    const key = narrator ? '旁白' : name;
    // 同性别只有一个声音时，按名字给一点音高差，几个角色不至于完全同一个声音。
    if (!narrator && pool.length < 2 && !manual.pitch) pitch *= 1 + ((hashName(key) % 5) - 2) * 0.04;
    return found({ voice: pool[hashName(key) % pool.length].name, pitch, rate, volume, source: '按性别自动分配' });
}

// 声音库里查得到名称就返回名称；系统声音本身就是名称。
function ttsVoiceLabel(config, voice) {
    if (!voice.voice) return '';
    const list = voice.apiSource === 'narrator' ? config.narratorApi.voices : config.provider === 'api' ? config.api.voices : '';
    const entry = list ? parseVoiceEntries(list).find(([id]) => id === voice.voice) : null;
    return entry && entry[1] ? entry[1] : '';
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
    // 「[名字]：*心里话*」整句包在星号里：阅读器按台词分页、渲染成心里话，朗读也按心里话算。
    if (line.textType === 'dialogue' && /^\s*\*[^*]+\*\s*$/.test(stripSpeakerPrefix(line.text, line.speaker))) line = { ...line, textType: 'thought' };
    const type = line.textType;
    const spoken = type === 'dialogue' || type === 'thought';
    if (!spoken && type !== 'narration') return skipWith('这一页不是台词或旁白');
    if (!spoken && !config.narration) return skipWith('旁白朗读已关');
    const tagMode = ttsTagMode(!spoken && config.narratorApi.enabled ? config.narratorApi : (config.provider === 'api' ? config.api : null));
    const bilingualMode = type === 'thought' && config.thoughtBilingual !== 'same' ? config.thoughtBilingual : config.bilingual;
    const plain = ttsPlainText(stripSpeakerPrefix(line.text, line.speaker), { original: bilingualMode === 'original', tags: tagMode });
    const lexiconPairs = parseTtsLexicon(config.lexicon);
    let text = (tagMode ? applyLexiconOutsideTags(plain, lexiconPairs) : applyTtsLexicon(plain, lexiconPairs)).replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(tagMode ? stripTtsTags(text) : text)) return skipWith('这一页没有可读的文字');
    const lang = detectTtsLang(tagMode ? stripTtsTags(plain) : plain);
    const voice = resolveTtsVoice({ ...line, lang }, config, sceneAssets, voices);
    if (voice.volume <= 0) return skipWith(voice.apiSource === 'narrator' ? '旁白独立接口没有填写声音' : '这个角色设为不朗读');
    if (record) lastSkip = null;
    const mood = spoken ? resolveBarkMood(line.mood) : '';
    const confused = spoken && CONFUSED_RE.test(String(line.mood || ''));
    // Fish 句首标签：台词按耳语、心里话、情绪依次叠加；旁白固定平稳叙述。
    let head = '';
    if (tagMode === 'fish') {
        head = spoken
            ? [line.whisper ? WHISPER_FISH_TAG : '', type === 'thought' ? THOUGHT_FISH_TAG : '', confused ? CONFUSED_FISH_TAG : MOOD_FISH_TAG[mood] || ''].filter(Boolean).join(' ')
            : NARRATOR_FISH_TAG;
        if (head) text = `${head} ${text}`;
    }
    const prosody = (spoken && line.whisper ? WHISPER_PROSODY : !confused && MOOD_PROSODY[mood]) || {};
    const shape = spoken ? resolveBarkShape(line, mood) : { gain: 1, close: false, phone: false, pan: 0 };
    const gain = type === 'thought' ? shape.gain * config.thoughtVolume : shape.gain;
    const rate = clamp(config.rate * (spoken ? 1 : config.narratorRate) * voice.rate * (prosody.rate || 1), 0.5, 2);
    if (record) lastDecision = { key, speaker: String(line.speaker || ''), name: voice.name, gender: voice.gender, role: voice.role, voice: voice.voice, voiceLabel: ttsVoiceLabel(config, voice), source: voice.source, rate };
    return {
        voiceSource: voice.source, voiceName: voice.name, speaker: String(line.speaker || ''),
        provider: voice.provider || config.provider,
        apiSource: voice.apiSource || 'main',
        style: spoken ? spokenStyle(config, sceneAssets, line, mood) : config.narratorStyle,
        // 耳语没有情绪标签时按平静发送；平和与映射不到的不发。
        emotion: spoken ? (line.whisper ? MOOD_EMOTION[mood] || 'calm' : MOOD_EMOTION[mood] || '') : '',
        text,
        tagHead: head,
        voice: voice.voice,
        role: voice.role,
        lang,
        volume: clamp(config.volume * gain * voice.volume, 0, TTS_GAIN_CAP),
        gainCap: TTS_GAIN_CAP,
        rate,
        pitch: clamp(voice.pitch * (prosody.pitch || 1), 0.5, 2),
        pan: shape.pan, close: shape.close, phone: shape.phone,
        cleanup: config.cleanup,
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
// 最近一次决定朗读的声音来源（页面诊断用）。
let lastDecision = null;
const apiCache = new Map();
const inflight = new Map();
let persistentWrites = Promise.resolve(), cacheEpoch = 0;
// 持久缓存最多保留的条数，每次播放 / 预取时按设置刷新。
let persistLimit = TTS_DEFAULTS.cacheMax;
let lastError = '';
let errorHandler = null;
let lastReported = { message: '', at: 0 };
const watchedDocs = new WeakSet();

export function ttsLastError() {
    return lastError;
}

// 这一页没读的原因：{ key, reason }，读了或还没判断过时为 null。
export function getTtsLastDecision() {
    return lastDecision ? { ...lastDecision } : null;
}

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

// 读完后保持压低一小会儿：下一句在保持期内开口就接手，stopTts 则立即回升。
let heldDuck = null;

function releaseHeldDuck() {
    if (!heldDuck) return;
    const held = heldDuck;
    heldDuck = null;
    clearTimeout(held.timer);
    held.release();
}

function holdDuck(release) {
    releaseHeldDuck();
    const held = { release, timer: null };
    held.timer = setTimeout(releaseHeldDuck, TTS_DUCK_HOLD_MS);
    heldDuck = held;
}

function takeHeldDuck() {
    if (!heldDuck) return null;
    const { release, timer } = heldDuck;
    heldDuck = null;
    clearTimeout(timer);
    return release;
}

// 新任务自己压低之后，才放掉接手来的保持。
function duckJob(job, options) {
    if (!job.done) job.releaseDuck = duckSceneAudio({ ratio: TTS_DUCK_RATIO, ...options });
    if (job.inheritedDuck) {
        job.inheritedDuck();
        job.inheritedDuck = null;
    }
}

function finish(job) {
    if (job.done) return;
    job.done = true;
    if (job.releaseDuck) {
        if (job.cancelled && !job.handoff) job.releaseDuck();
        else holdDuck(job.releaseDuck);
    }
    job.releaseDuck = null;
    if (job.inheritedDuck) {
        if (job.handoff && !heldDuck) holdDuck(job.inheritedDuck);
        else job.inheritedDuck();
    }
    job.inheritedDuck = null;
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

// 翻页换句（handoff）时被掐掉的一句也保持压低，交给下一句接手。
function haltActive({ handoff = false } = {}) {
    queued = null;
    if (!active) return;
    const job = active;
    active = null;
    job.handoff = handoff;
    haltJob(job);
    finish(job);
}

export function stopTts() {
    releaseHeldDuck();
    haltActive();
}

function startJob(plan) {
    haltActive({ handoff: true });
    const inheritedDuck = takeHeldDuck();
    const job = { plan, done: false, cancelled: false, preview: plan.preview === true, nodes: [], releaseDuck: null, inheritedDuck, fetched: null, synth: null, source: null, sources: [], utterances: [], watchdog: null, startTimer: null, releases: [] };
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
                    duckJob(job, { durationMs: seconds * 1500 + 3000 });
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
    return String(text || '').replace(/\{\{(text|voice|speed|lang|model|key|style)\}\}/g, (_, key) => {
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
export function buildTtsRequest(api, { text, voice, rate = 1, lang = 'zh', style = '', emotion = '' }) {
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
            body: JSON.stringify({ text, reference_id: voice || undefined, format: 'mp3', latency: 'balanced', ...(api.sendSpeed && speedOf(rate) !== 1 ? { prosody: { speed: speedOf(rate) } } : {}) }),
        };
    }
    if (format === 'minimax') {
        return {
            url: formatUrl(api, FORMAT_PATHS.minimax, { fallback: FORMAT_DEFAULT_ENDPOINTS.minimax }), method: 'POST', headers,
            body: JSON.stringify({
                model: api.model || MINIMAX_DEFAULT_MODEL, text, stream: false, output_format: 'hex',
                voice_setting: { voice_id: voice || '', ...(api.sendSpeed ? { speed: speedOf(rate) } : {}), ...(api.sendEmotion !== false && MINIMAX_EMOTIONS.includes(emotion) ? { emotion } : {}) },
                audio_setting: { format: 'mp3' },
            }),
        };
    }
    if (format === 'custom') {
        const values = { text, voice: voice || '', speed: speedOf(rate), lang, model: api.model || '', key: api.apiKey || '', style: style || '' };
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
                body = fillTemplate(api.customBody, values, { raw: ['text', 'voice', 'speed', 'lang', 'model', 'key', 'style'] });
            }
        }
        return { url: url ? proxied(url, api.transport) : '', method, headers: merged, body: body || undefined };
    }
    const body = { model: api.model || 'tts-1', input: text, voice: voice || 'alloy' };
    if (api.responseFormat !== 'none') body.response_format = api.responseFormat || 'mp3';
    if (api.sendSpeed !== false) body.speed = rate;
    // 风格描述：gpt-4o-mini-tts 等支持 instructions 的模型生效。
    if (style) body.instructions = style;
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

// 返回 { ok, voices: [[id, 标题]], builtin?, error? }；失败不抛。narrator 为真时按旁白独立接口拉取。
export async function fetchTtsVoices(settings, { narrator = false } = {}) {
    const config = normalizeTtsSettings(settings);
    const api = narrator ? config.narratorApi : config.api;
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
export function ttsCacheKey(url, api, voice, text, style = '', emotion = '') {
    const body = String(text || '').replace(/^[\s「『“"'‘]+|[\s」』”"'’]+$/g, '').replace(/\s+/g, ' ');
    const format = api.format || 'openai';
    const noSpeed = api.sendSpeed === false ? 'nospeed' : '';
    const variant = format === 'openai' ? `${api.responseFormat || 'mp3'}${noSpeed}`
        : format === 'custom' ? hashName([api.customMethod, api.customUrl, api.customHeaders, api.customBody, api.customResponse, api.customPath].join('\n')).toString(36) + noSpeed : noSpeed;
    // 风格只在填了时进键，没填风格的旧缓存照常命中。
    // 情绪同理：没有情绪时与旧键一致。
    return [url, format, variant, api.model, voice, body, ...(style ? [style] : []), ...(emotion ? [`emotion:${emotion}`] : [])].join('|');
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

function persistentPut(key, bytes, rate, epoch, fresh = false) {
    const work = persistentWrites.then(async () => {
        if (epoch !== cacheEpoch || persistLimit <= 0) return;
        const cache = await persistentStore();
        if (!cache || typeof Response !== 'function') return;
        // 重新生成：先删旧条目，新条目按写入顺序排到最后。
        if (fresh) await cache.delete(persistUrl(key));
        await cache.put(persistUrl(key), new Response(bytes.slice(0), { headers: { 'Content-Type': 'application/octet-stream', 'x-igs-rate': String(rate) } }));
        const keys = await cache.keys();
        if (keys.length > persistLimit) await Promise.all(keys.slice(0, keys.length - persistLimit).map(old => cache.delete(old)));
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

// 只保留最近写入的 max 条（内存与 Cache Storage 都处理），返回删掉的条数。
export async function trimTtsCache(max) {
    const limit = clamp(Math.round(Number(max)) || 0, 0, TTS_CACHE_LIMIT);
    let removed = 0, dropped = 0;
    for (const key of [...apiCache.keys()]) {
        if (apiCache.size <= limit) break;
        apiCache.delete(key); dropped++;
    }
    const work = persistentWrites.then(async () => {
        const cache = await persistentStore();
        if (!cache) return;
        const keys = await cache.keys();
        const extra = keys.slice(0, Math.max(0, keys.length - limit));
        await Promise.all(extra.map((old) => cache.delete(old)));
        removed = extra.length;
    });
    persistentWrites = work.catch(() => {});
    await persistentWrites;
    return Math.max(removed, dropped);
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

// 句首标签每段都带上，不然只有第一段有情绪。
function apiSegments(api, text, head = '') {
    if (api.chunk === false) return [text];
    if (!head || !text.startsWith(head)) return splitTtsSegments(text);
    return splitTtsSegments(text.slice(head.length)).map((part) => `${head} ${part}`);
}
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
    // 只有支持风格 / 情绪的格式才把它们算进缓存键，其余格式换风格不会白白重新生成。
    const styled = (api.format || 'openai') === 'openai' || api.format === 'custom';
    const emotional = api.format === 'minimax' && api.sendEmotion !== false;
    const key = ttsCacheKey(url, api, plan.voice, plan.text, styled ? plan.style : '', emotional ? plan.emotion : '');
    const epoch = cacheEpoch;
    // 重新生成：丢掉这一条的内存缓存，不合并在途请求，也不读持久缓存。
    const fresh = plan.fresh === true;
    if (fresh) apiCache.delete(key);
    const hit = fresh ? null : apiCache.get(key);
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
    if (!fresh && pending && closeRate(pending.rate, plan.rate)) return join(pending);
    const entry = { rate: plan.rate, refs: 0, settled: false, promise: null, controller: typeof AbortController === 'function' ? new AbortController() : null };
    entry.promise = (fresh ? Promise.resolve(null) : persistentGet(key, plan.rate)).then((stored) => {
        if (stored) {
            if (epoch === cacheEpoch) remember(key, stored, plan.rate);
            return stored;
        }
        return postSpeech(api, plan, entry.controller && entry.controller.signal).then((bytes) => {
            if (epoch === cacheEpoch) {
                remember(key, bytes, plan.rate);
                void persistentPut(key, bytes, plan.rate, epoch, fresh);
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

const dbToGain = (db) => 10 ** (db / 20);

function windowMeanSquares(samples, win) {
    const count = Math.ceil(samples.length / win);
    const out = new Float64Array(count);
    for (let w = 0; w < count; w += 1) {
        const start = w * win;
        const end = Math.min(samples.length, start + win);
        let sum = 0;
        for (let i = start; i < end; i += 1) sum += samples[i] * samples[i];
        out[w] = sum / (end - start);
    }
    return out;
}

// 向下扩展：压低字间与句尾的弱信号（残响、底噪），不做硬门限，增益曲线平滑过渡。
export function cleanupSamples(samples, sampleRate, options = {}) {
    const {
        thresholdDb = CLEANUP_THRESHOLD_DB, ratio = CLEANUP_RATIO, floorDb = CLEANUP_FLOOR_DB,
        windowMs = CLEANUP_WINDOW_MS, attackMs = CLEANUP_ATTACK_MS, releaseMs = CLEANUP_RELEASE_MS,
    } = options;
    const length = samples.length;
    const out = new Float32Array(length);
    const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
    const rms = windowMeanSquares(samples, win).map(Math.sqrt);
    const count = rms.length;
    let top = 0;
    for (let w = 0; w < count; w += 1) if (rms[w] > top) top = rms[w];
    if (top < 1e-9) {
        out.set(samples);
        return out;
    }
    const threshold = top * dbToGain(-thresholdDb);
    // 包络取相邻三窗的最大值：开口略早、收口略晚，字头字尾不被切。
    const targets = new Float64Array(count);
    for (let w = 0; w < count; w += 1) {
        const env = Math.max(rms[w], w > 0 ? rms[w - 1] : 0, w + 1 < count ? rms[w + 1] : 0);
        const cut = env >= threshold ? 0 : Math.min(floorDb, (ratio - 1) * 20 * Math.log10(threshold / Math.max(env, 1e-9)));
        targets[w] = dbToGain(-cut);
    }
    // 时间常数按「走完 90%」的时长算。
    const coef = (ms) => 1 - Math.exp(-Math.LN10 / Math.max(1, (ms * sampleRate) / 1000));
    const attack = coef(attackMs);
    const release = coef(releaseMs);
    let gain = targets[0];
    for (let i = 0; i < length; i += 1) {
        const pos = (i - win / 2) / win;
        const w0 = Math.min(count - 1, Math.max(0, Math.floor(pos)));
        const w1 = Math.min(count - 1, w0 + 1);
        const frac = Math.min(1, Math.max(0, pos - w0));
        const target = targets[w0] * (1 - frac) + targets[w1] * frac;
        gain += (target - gain) * (target > gain ? attack : release);
        out[i] = samples[i] * gain;
    }
    return out;
}

function peakOf(channels) {
    let peak = 0;
    for (const data of channels) {
        for (let i = 0; i < data.length; i += 1) {
            const v = Math.abs(data[i]);
            if (v > peak) peak = v;
        }
    }
    return peak;
}

// 整段接近目标响度的增益：只统计非静音窗，峰值上限优先。
export function loudnessGain(channels, sampleRate) {
    const win = Math.max(1, Math.round((sampleRate * CLEANUP_WINDOW_MS) / 1000));
    const per = channels.map((data) => windowMeanSquares(data, win));
    const count = per.length ? per[0].length : 0;
    const power = new Float64Array(count);
    let top = 0;
    for (let w = 0; w < count; w += 1) {
        for (const list of per) power[w] += list[w] / per.length;
        if (power[w] > top) top = power[w];
    }
    if (top <= 0) return 1;
    const gate = top * dbToGain(-LOUD_GATE_DB) ** 2;
    let sum = 0;
    let used = 0;
    for (let w = 0; w < count; w += 1) {
        if (power[w] < gate) continue;
        sum += power[w];
        used += 1;
    }
    const rms = Math.sqrt(sum / Math.max(1, used));
    let gain = Math.min(LOUD_GAIN_MAX, Math.max(LOUD_GAIN_MIN, dbToGain(LOUD_TARGET_DB) / rms));
    const peak = peakOf(channels);
    if (peak > 0) gain = Math.min(gain, dbToGain(LOUD_PEAK_DB) / peak);
    return gain;
}

// 解码后的整理：净化（可选）+ 响度统一。ref.gain 由同一句的第一段算出，后续段沿用。出任何问题都原样返回。
export function conditionVoiceBuffer(context, buffer, { cleanup = false, ref = {} } = {}) {
    try {
        if (!buffer || typeof buffer.getChannelData !== 'function' || typeof context.createBuffer !== 'function') return buffer;
        const rate = buffer.sampleRate;
        const tidy = cleanup && buffer.length / rate <= CLEANUP_MAX_S;
        const channels = [];
        for (let c = 0; c < buffer.numberOfChannels; c += 1) {
            const data = buffer.getChannelData(c);
            channels.push(tidy ? cleanupSamples(data, rate) : data);
        }
        if (!channels.length) return buffer;
        let gain = ref.gain;
        if (!Number.isFinite(gain)) {
            gain = loudnessGain(channels, rate);
            ref.gain = gain;
        } else {
            const peak = peakOf(channels);
            if (gain * peak > 1) gain = 1 / peak;
        }
        const out = context.createBuffer(channels.length, buffer.length, rate);
        channels.forEach((data, c) => {
            const target = out.getChannelData(c);
            for (let i = 0; i < data.length; i += 1) target[i] = data[i] * gain;
        });
        return out;
    } catch {
        return buffer;
    }
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
    const texts = apiSegments(api, plan.text, plan.tagHead);
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
        const loudness = {};
        const settle = () => {
            if (scheduled && !job.cancelled && sources.every((source) => source.igsEnded)) finish(job);
        };
        try {
            for (const item of decoded) {
                const buffer = await item;
                if (job.cancelled) return;
                if (!buffer) throw new Error('音频解码失败');
                const voice = conditionVoiceBuffer(context, buffer, { cleanup: plan.cleanup === true, ref: loudness });
                const source = context.createBufferSource();
                source.buffer = voice;
                chain = chain || buildBarkChain(context, bus, plan, job.nodes);
                source.connect(chain);
                source.onended = () => {
                    source.igsEnded = true;
                    settle();
                };
                const startAt = Math.max(when, context.currentTime + 0.02);
                source.start(startAt);
                when = startAt + (voice.duration || 0);
                if (!sources.length) {
                    job.source = source;
                    lastError = '';
                    duckJob(job);
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

// 这一句用哪套接口：旁白开了独立接口时用旁白那套，其余用台词接口。
const planApi = (config, plan) => (plan.apiSource === 'narrator' ? config.narratorApi : config.api);
const usesApi = (config) => config.provider === 'api' || config.narratorApi.enabled;

// 同一时间只念一页：新的一页开始时掐掉上一页。
export function playTts(plan, settings) {
    if (!plan || !plan.text) return null;
    if (!plan.preview) lastPlayed = { plan, settings };
    const job = startJob(plan);
    if (plan.provider === 'api') {
        const config = normalizeTtsSettings(settings);
        persistLimit = config.cacheMax;
        return speakApi(job, plan, planApi(config, plan));
    }
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
    // 这一页走不走接口（旁白独立接口时与主来源不同）；没有要念的就按主来源算。
    const api = plan && !plan.skip ? plan.provider === 'api' : config.provider === 'api';
    watchAway(root);
    const prefetchNext = (fetched) => {
        if (!usesApi(config) || !config.api.prefetch || !line.next) return;
        Promise.resolve(fetched).then(() => {
            if (state.token !== token) return;
            const wait = Math.max(0, PREFETCH_DWELL_MS - (now() - shownAt));
            state.prefetchTimer = timers.setTimeout(() => {
                state.prefetchTimer = null;
                if (state.token === token) prefetchTts(line.next, settings, sceneAssets, { nsfw: line.nsfw, hint: line.nextHint });
            }, wait);
        });
    };
    // 翻页不打断：上一句还在念就让它念完，这一句排在后面（只留最新一句）；否则立刻掐掉上一句。
    const sustain = config.sustain && isTtsSpeaking();
    if (sustain) queued = null;
    else haltActive({ handoff: true });
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

// 重听、重新生成共用：取最近念过的那一句；这一页翻过来时没念（比如那时朗读还没开）就按现在的设置再判断一次，能念就补上。
function lastPlayedOrError() {
    if (!lastPlayed && lastLine) {
        const plan = decideTts({}, lastLine.line, lastLine.settings, { sceneAssets: lastLine.sceneAssets, voices: listSystemVoices() });
        if (plan && !plan.skip) lastPlayed = { plan, settings: lastLine.settings };
        else if (lastSkip) return { ok: false, error: '本页未朗读：' + lastSkip.reason };
    }
    return lastPlayed ? null : { ok: false, error: '这一页没有可重听的朗读' };
}

// 重听：再念一遍最近念过的那句（从头念，掐掉正在念的）。
export function replayTts() {
    const problem = lastPlayedOrError();
    if (problem) return problem;
    const job = playTts(lastPlayed.plan, lastPlayed.settings);
    return job ? { ok: true } : { ok: false, error: '朗读失败' };
}

// 重新生成这一句：接口来源丢掉这一句的缓存（内存与持久）后重新请求并覆盖；系统语音没有缓存，等同重听。
export function rerollTts() {
    const problem = lastPlayedOrError();
    if (problem) return problem;
    const keep = lastPlayed;
    if (keep.plan.provider !== 'api') return replayTts();
    const job = playTts({ ...keep.plan, fresh: true }, keep.settings);
    lastPlayed = keep;
    return job ? { ok: true } : { ok: false, error: '朗读失败' };
}

// 回想里重播某一句：按现在的设置念，不占用阅读页的「重听」。
export function speakTtsLine(line, settings, sceneAssets) {
    const state = {};
    const plan = decideTts(state, line, settings, { sceneAssets, voices: listSystemVoices(), record: false });
    if (!plan || plan.skip) return { ok: false, error: normalizeTtsSettings(settings).enabled ? '这一句不朗读' : '台词朗读没开' };
    const keep = lastPlayed;
    const job = playTts(plan, settings);
    lastPlayed = keep;
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

// 提前生成下一页（只对走接口的句子；系统语音本地合成，不用等）。
// hint：阅读器给的下一页提示 { textType, speaker, mood }，有它时按实际朗读同一条路径构造（情绪、心里话一致，缓存键相同），台词页也预取。
export function prefetchTts(segment, settings, sceneAssets, { nsfw = false, hint = null } = {}) {
    const config = normalizeTtsSettings(settings);
    if (!config.enabled || !usesApi(config) || !segment) return null;
    persistLimit = config.cacheMax;
    const guessed = guessTtsLine(segment);
    const hinted = hint && (hint.textType === 'dialogue' || hint.textType === 'thought') && guessed.textType === hint.textType;
    const plan = decideTts({}, { ...guessed, ...(hinted ? { mood: String(hint.mood || ''), speakerKey: String(hint.speakerKey || '') } : {}), nsfw }, config, { sceneAssets, record: false });
    if (!plan || plan.skip || plan.provider !== 'api') return null;
    const api = planApi(config, plan);
    // 情绪会进请求时（MiniMax 发情绪、风格写入情绪、Fish 句首标签），没有情绪提示的台词页预取多半用不上，只预取旁白页。
    const moodKeyed = (api.format === 'minimax' && api.sendEmotion !== false)
        || (api.format === 'fish' && api.audioTags !== false)
        || (config.moodStyle && ((api.format || 'openai') === 'openai' || api.format === 'custom'));
    if (moodKeyed && plan.role !== 'narrator' && !hinted) return null;
    const jobs = requestSegments(api, plan, apiSegments(api, plan.text, plan.tagHead));
    return Promise.all(jobs).then((list) => list[0], () => null);
}

// 设置里的试听：按当前来源念一句。接口来源会等结果，失败时返回原因。
// 试听旁白（role 为 narrator）时带上旁白风格；开了旁白独立接口就用那套接口。带 speaker 时试听该角色，附上角色风格。
export function previewTts(settings, { role = 'female', voice = '', speaker = '', sceneAssets = null, thought = false } = {}) {
    const config = normalizeTtsSettings(settings);
    const voices = listSystemVoices();
    const narrator = role === 'narrator';
    const separate = narrator && config.narratorApi.enabled;
    const provider = separate ? 'api' : config.provider;
    const picked = voice || (separate ? config.narratorApi.voice : config.provider === 'api'
        ? config.api[role] || config.api.female
        : config.system[role] || (systemVoicePool(voices, narrator ? '' : role)[0] || {}).name || '');
    // 接口来源三个框全空时不发请求，直接说明原因，免得服务端拿默认音色念。
    if (separate && !picked) return Promise.resolve({ ok: false, error: '旁白独立接口还没有填写声音' });
    if (provider === 'api' && !picked) return Promise.resolve({ ok: false, error: '默认声音均未选择，请先选择声音再试听' });
    // 试听角色时按这个角色的台词 / 心里话语速与音量念。
    const own = speaker && !narrator ? resolveTtsVoice({ textType: thought ? 'thought' : 'dialogue', speaker }, config, sceneAssets, voices) : null;
    if (own && own.volume <= 0) return Promise.resolve({ ok: false, error: '这个角色设为不朗读' });
    const volume = own ? clamp(config.volume * (thought ? config.thoughtVolume : 1) * own.volume, 0, TTS_GAIN_CAP) : config.volume;
    const rate = own ? clamp(config.rate * own.rate, 0.5, 2) : config.rate;
    const plan = {
        provider, apiSource: separate ? 'narrator' : 'main', style: narrator ? config.narratorStyle : speaker ? spokenStyle(config, sceneAssets, { textType: thought ? 'thought' : 'dialogue', speaker }, '') : '',
        text: narrator ? '夜色渐深，街角的灯一盏接一盏亮了起来。' : thought ? '这家伙，到底在想些什么呢。' : '你好，这是台词朗读的试听。今天也请多指教。', voice: picked, role, lang: 'zh',
        volume, gainCap: TTS_GAIN_CAP, rate, pitch: 1, pan: 0, close: false, phone: false, preview: true, cleanup: config.cleanup,
    };
    lastError = '';
    const job = playTts(plan, config);
    if (provider !== 'api') return Promise.resolve(lastError ? { ok: false, error: lastError } : { ok: true });
    return new Promise((resolve) => {
        const check = () => {
            if (job.done || job.source) resolve(lastError ? { ok: false, error: lastError } : { ok: true });
            else setTimeout(check, 100);
        };
        check();
    });
}

// 线上聊天气泡的朗读：一条气泡一段声音。返回 { done, cancel }；不朗读（没开、音量 0、角色设为不朗读等）或失败时返回 null。
// done 在这一条念完、被掐掉或出错时 resolve（不会 reject）；cancel() 只停这一条自己的声音。
export function speakTtsBubble(line, settings, sceneAssets, { poll = 80 } = {}) {
    const plan = decideTts({}, line, settings, { sceneAssets, voices: listSystemVoices(), record: false });
    if (!plan || plan.skip) return null;
    const job = playTts(plan, settings);
    if (!job) return null;
    const done = new Promise((resolve) => {
        const check = () => {
            if (job.done || job.cancelled) resolve();
            else setTimeout(check, poll);
        };
        check();
    });
    const cancel = () => {
        if (job.done) return;
        haltJob(job);
        finish(job);
    };
    return { done, cancel };
}

// 提前生成下一条气泡的音频（只对走接口的句子）；气泡的情绪、耳语都为空，请求与真正朗读时一致，能命中缓存。
export function prefetchTtsBubble(line, settings, sceneAssets) {
    const config = normalizeTtsSettings(settings);
    if (!config.enabled || !usesApi(config) || !config.api.prefetch || !line) return null;
    persistLimit = config.cacheMax;
    const plan = decideTts({}, line, config, { sceneAssets, record: false });
    if (!plan || plan.skip || plan.provider !== 'api') return null;
    const jobs = requestSegments(planApi(config, plan), plan, apiSegments(planApi(config, plan), plan.text, plan.tagHead));
    return Promise.all(jobs).then((list) => list[0], () => null);
}

// 聊天页接管朗读前调用：作废这个根节点上一页 applyTts 留下的延后播放、预取定时器与排队，免得上一页台词在聊天页里响起。
// forget：同时忘掉已念过的句子，之后同一页重新渲染时照常朗读（续读提示盖住正文时用）。
export function cancelPendingTts(root, timers = globalThis, { forget = false } = {}) {
    const state = root && states.get(root);
    if (!state) return;
    for (const timer of [state.deferTimer, state.prefetchTimer]) if (timer) timers.clearTimeout(timer);
    state.deferTimer = null;
    state.prefetchTimer = null;
    state.token = (state.token || 0) + 1;
    if (forget) state.lastKey = null;
}
