import { audioBusContext, audioMasterVolume, busInput, normalizeAudioMasterSettings, resumeAudioBus, setAudioBusSpace, setAudioMasterVolume, watchPageAway } from './audio-bus.js';
import { WEATHER_FLASH_EVENT, resolveWeatherFxPlan, resolveWeatherFxScene, resolveWeatherFxTime, resolveWeatherFxKind } from './weather-fx-runtime.js';
import { resolvePlaceAmbience } from '../../scene/place-ambience.js';
import { bgmPackOfWorldview, inferBgmMood, normalizeBgmTags, resolveBgmMood, resolveBgmSilence, resolveBgmTransition, selectBgmTrack } from './bgm-library.js';

// 场景音频：BGM 用 HTMLAudio 按情绪 / 关键词选曲并交叉淡入淡出，能跨域读取的曲目接进混音总线；环境音全部 WebAudio 实时合成，不依赖音频文件。
export const AMBIENT_KINDS = Object.freeze([
    'birds', 'rain', 'wind', 'insects', 'waves', 'crowd', 'thunder', 'stream', 'fire', 'snow',
    'cicadas', 'frogs', 'chimes', 'bell', 'clock', 'drip', 'train', 'tavern', 'ship', 'traffic',
    'car', 'carriage', 'bath', 'underwater', 'space',
]);
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
    cicadas: '蝉鸣',
    frogs: '蛙鸣',
    chimes: '风铃',
    bell: '钟声',
    clock: '钟表',
    drip: '滴水',
    train: '列车',
    tavern: '酒馆',
    ship: '船只',
    traffic: '车流',
    car: '车内',
    carriage: '马车',
    bath: '浴室水声',
    underwater: '水下',
    space: '太空真空',
});
// moodTag：让 AI 在情绪转折时写 [igs-fx:bgm|情绪]，按情绪池选曲；关掉后只按演出与时段推断。
export const BGM_DEFAULTS = Object.freeze({ enabled: false, volume: 0.5, moodTag: true, tracks: Object.freeze([]) });
export const AMBIENT_SOUND_DEFAULTS = Object.freeze({
    enabled: false,
    volume: 0.4,
    ...Object.fromEntries(AMBIENT_KINDS.map((kind) => [kind, true])),
});
export const BGM_FADE_MS = 1600;
export const AMBIENT_FADE_IN_S = 1.5;
export const AMBIENT_FADE_OUT_S = 1.2;
// 提示音、演出音效期间 BGM 与环境音压到原音量的比例；打字音连续整页，只轻压，避免每页一次抽吸。
export const DUCK_RATIO = 0.55;
export const TYPING_DUCK_RATIO = 0.8;
// 演出色调下 BGM 的音量：不能跨域的外链进不了滤波链，只能压音量配合画面。
const BGM_TONE_GAIN = Object.freeze({ '': 1, dream: 0.85, flashback: 0.85, thought: 0.92, letterbox: 0.8 });
// 接进总线的曲目真正滤波：梦境发闷、回忆像旧收音机、心里话稍远一点。
const BGM_TONE_SHAPES = Object.freeze({
    '': Object.freeze({ low: 20000, high: 20, gain: 1 }),
    dream: Object.freeze({ low: 1400, high: 20, gain: 0.9 }),
    flashback: Object.freeze({ low: 2600, high: 300, gain: 0.85 }),
    underwater: Object.freeze({ low: 800, high: 20, gain: 0.85 }),
    thought: Object.freeze({ low: 5000, high: 20, gain: 0.92 }),
    letterbox: Object.freeze({ low: 20000, high: 20, gain: 0.8 }),
});
// 接进总线的前提是能跨域读取，否则整首无声：同源、data / blob，以及带 CORS 头的 jsDelivr（默认曲包从这里加载）。
// 认错了也不怕：加载报错时这首退回独立 HTMLAudio（corsBlocked 记住，之后直接走老路）。
const BGM_CORS_HOSTS = Object.freeze(['cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'gcore.jsdelivr.net', 'testingcf.jsdelivr.net']);
const corsBlocked = new Set();

// 默认曲目包约 60 首，再给用户自己的曲目留余量。
const MAX_TRACKS = 200;
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LENGTH = 20;
const MAX_NAME_LENGTH = 40;
const MAX_URL_LENGTH = 2048;
const MAX_LAYERS = 3;
const RAMP_STEP_MS = 50;
const VOLUME_RAMP_MS = 300;
const BGM_TONE_RAMP_MS = 1200;
const MUFFLE_HZ = 700;
const FLOOR = 0.0001;
// 用户上传的本地音频存在酒馆 user/files/ 下，与酒馆同源。
const URL_PATTERN = /^(https?:\/\/|data:audio\/|blob:|\/?user\/files\/igs-bgm-)/i;

const NATURE_WORDS = Object.freeze(['森林', '树林', '公园', '花园', '庭院', '院子', '山', '田', '河', '湖', '郊', '草', '林', '村', '校园', '操场']);
const INSECT_EXTRA_WORDS = Object.freeze(['草', '田', '夏']);
const WAVE_WORDS = Object.freeze(['海', '沙滩', '港', '码头', '岸', '礁']);
export const CROWD_WORDS = Object.freeze(['街', '市', '商场', '车站', '广场', '食堂', '餐厅', '集市', '教室', '咖啡', '酒吧']);
const STREAM_WORDS = Object.freeze(['溪', '泉', '瀑', '河', '江边', '水边', '水渠']);
const FIRE_WORDS = Object.freeze(['篝火', '营火', '壁炉', '火堆', '火炉', '炉边', '暖炉', '火塘']);
const SUMMER_WORDS = Object.freeze(['夏', '暑', '蝉', '七月', '八月', '7月', '8月']);
const FOREST_WORDS = Object.freeze(['森林', '树林', '林', '山']);
const FROG_WORDS = Object.freeze(['稻田', '水田', '田埂', '田野', '池塘', '荷塘', '水塘', '沼泽', '湿地', '蛙']);
const CHIME_WORDS = Object.freeze(['风铃', '屋檐', '檐下', '缘侧', '廊下', '和室']);
const BELL_WORDS = Object.freeze(['寺', '庙', '神社', '教堂', '钟楼', '修道院', '禅', '佛堂', '道观']);
const CHURCH_WORDS = Object.freeze(['教堂', '钟楼', '修道院']);
const CLOCK_WORDS = Object.freeze(['卧室', '书房', '房间', '客厅', '办公室', '图书馆', '病房', '宿舍', '自习室', '阁楼', '钟表']);
const DRIP_WORDS = Object.freeze(['洞', '地牢', '地下', '地窖', '遗迹', '下水道', '矿', '钟乳', '墓']);
const TRAIN_WORDS = Object.freeze(['电车', '列车', '火车', '地铁', '车厢', '新干线', '高铁', '轻轨']);
export const TAVERN_WORDS = Object.freeze(['酒馆', '旅店', '客栈', '酒楼', '茶馆', '茶楼', '酒肆', '酒家', '公会']);
const SHIP_WORDS = Object.freeze(['船', '甲板', '舰', '帆']);
const TRAFFIC_WORDS = Object.freeze(['马路', '公路', '路口', '高架', '停车场', '斑马线', '公交站', '车道', '路边']);
// thunder 只挂调度器、不常驻，不计入 MAX_LAYERS；顺序即 3 层名额的优先级。
const LAYER_ORDER = Object.freeze([
    'thunder', 'bath', 'rain', 'wind', 'snow', 'train', 'car', 'carriage', 'ship', 'waves', 'stream', 'drip', 'fire', 'tavern', 'crowd', 'traffic',
    'bell', 'cicadas', 'frogs', 'birds', 'insects', 'chimes', 'clock',
]);
const LEVEL_GAIN = Object.freeze({ light: 0.55, medium: 0.8, heavy: 1 });
const THUNDER_GAP_MS = Object.freeze({ heavy: Object.freeze([4500, 9000]), other: Object.freeze([7000, 14000]) });
// 演出色调：环境音总线上的高低通、混响湿声与增益，1.2s 内平滑过渡；多个同时生效时取优先级最高者。
const TONE_PRIORITY = Object.freeze(['dream', 'flashback', 'underwater', 'thought', 'letterbox']);
const TONE_SHAPES = Object.freeze({
    '': Object.freeze({ low: 20000, high: 20, wet: 0, gain: 1 }),
    dream: Object.freeze({ low: 1200, high: 20, wet: 0.45, gain: 1 }),
    flashback: Object.freeze({ low: 3000, high: 400, wet: 0.1, gain: 0.9 }),
    // 水下：配乐与环境音都隔着一层水，只剩低频。
    underwater: Object.freeze({ low: 650, high: 20, wet: 0.3, gain: 0.9 }),
    thought: Object.freeze({ low: 1800, high: 20, wet: 0, gain: 0.85 }),
    letterbox: Object.freeze({ low: 20000, high: 20, wet: 0, gain: 0.5 }),
});
const TONE_TC_S = 0.4;
// 空间混响：衰减噪声生成脉冲响应；梦境固定用长混响。
const IMPULSES = Object.freeze({ room: Object.freeze({ seconds: 0.4, wet: 0.18 }), hall: Object.freeze({ seconds: 1.8, wet: 0.3 }), long: Object.freeze({ seconds: 2.6, wet: 0 }) });
const HALL_WORDS = Object.freeze(['大厅', '大堂', '走廊', '教堂', '礼堂', '体育馆', '车站', '神殿', '洞', '隧道', '地下', '地牢', '地窖', '遗迹', '下水道']);
// 打字音与音效送进同一空间混响的湿声量；梦境用长混响。
const VOICE_SPACE_WET = Object.freeze({ room: 0.05, hall: 0.12, long: 0.15 });
const DUCK_MS = 150;
const UNDUCK_MS = 300;
const HIDE_FADE_MS = 300;

const states = new WeakMap();
const liveStates = new Set();
const noiseBuffers = new WeakMap();
const impulseBuffers = new WeakMap();
// 进行中的闪避比例（可嵌套），取最低者生效。
const duckRatios = [];
// 粉噪声循环长度：2s 循环在连续底噪（风、海、溪）里能听出规律。
const NOISE_SECONDS = 7;
let voiceSpace = '';

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
        const track = { id, name: name || `曲目${index}`, url, keywords: normalizeKeywords(item.keywords) };
        // 分类字段与署名只在有值时写出，旧曲目的存档形状不变。
        for (const [key, list] of Object.entries(normalizeBgmTags(item))) if (list.length) track[key] = list;
        const credit = typeof item.credit === 'string' ? item.credit.trim().slice(0, MAX_NAME_LENGTH) : '';
        if (credit) track.credit = credit;
        const page = typeof item.source === 'string' ? item.source.trim() : '';
        if (page && page.length <= MAX_URL_LENGTH && /^https?:\/\//i.test(page)) track.source = page;
        tracks.push(track);
    }
    return {
        enabled: source.enabled === true,
        volume: clamp01(source.volume, BGM_DEFAULTS.volume),
        moodTag: source.moodTag !== false,
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

function createBgmMemory() {
    return { sig: '', id: '', played: [], seed: Math.floor(Math.random() * 997), mood: '', moodScene: '' };
}

// 曲目带情绪分类（默认曲目包或用户勾过情绪）时走情绪池；全是旧式关键词曲目时保持原来的关键词打分。
// 返回 { track, mood }；只配了关键词曲目时 mood 为空。
function pickSceneBgm(bgm, context, memory, skip) {
    if (!bgm.tracks.some((track) => track.moods)) return { track: pickBgmTrack(bgm.tracks, context), mood: '' };
    const ctx = plainObject(context);
    // 关掉情绪标签后连记住的情绪也不用，只按演出与时段推断。
    const mood = bgm.moodTag ? resolveBgmMood({ ...ctx, mood: ctx.bgmMood }, memory) : inferBgmMood(ctx);
    return { track: selectBgmTrack(bgm.tracks, { ...ctx, mood, pack: bgmPackOfWorldview(ctx.worldview), skip }, memory), mood };
}

// 地点栏 ♪ 的「换一首」：在当前候选池里换下一首；返回 { root, track }，没有在放的音乐时返回 null。
export function skipBgmTrack() {
    for (const state of liveStates) {
        // 看选曲记录而不是音频对象：只有情绪池选曲才有「下一首」，关键词曲目没有。
        if (state.stopped || !state.lastOptions || !state.bgmMemory || !state.bgmMemory.id) continue;
        const result = applySceneAudio(state.root, { ...state.lastOptions, skip: true });
        return { root: state.root, track: result.track };
    }
    return null;
}

export function resolveAmbientTone(context = {}) {
    const ctx = plainObject(context);
    const ranges = plainObject(ctx.fxRanges);
    const place = resolvePlaceAmbience(ctx.location, { worldview: ctx.worldview });
    const active = { dream: ranges.dream, flashback: ranges.flashback, underwater: Boolean(place && place.kind === 'underwater'), thought: ctx.textType === 'thought', letterbox: ranges.letterbox };
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
    // 水底与真空里听不见雨、风、人声：只留自己这一层（关掉这一层就是全静）。
    const place = resolvePlaceAmbience(ctx.location, { worldview: ctx.worldview });
    if (place && (place.kind === 'underwater' || place.kind === 'space')) {
        return settings[place.kind] ? [{ kind: place.kind, level: 'medium', muffled: false }] : [];
    }
    const candidates = new Map();
    const add = (kind, level, muffled, variant = '') => {
        if (!candidates.has(kind)) candidates.set(kind, variant ? { kind, level, muffled, variant } : { kind, level, muffled });
    };
    const night = time === 'night' || time === 'midnight';
    const summer = includesAny(`${location} ${textOf(ctx.time)}`, SUMMER_WORDS);
    // 天气演出负责闪电时，雷声跟随闪屏事件；否则雷声自行排程。
    if (weather && weather.thunder) candidates.set('thunder', { kind: 'thunder', level: weather.level, muffled: indoor, synced: ctx.lightningSynced === true });
    if (rain) add('rain', rain, indoor);
    if (weather && (weather.kind === 'wind' || weather.wind)) add('wind', weather.level, indoor);
    if (snow && !weather.wind) add('snow', snow, indoor);
    // 车里、船上、浴室与日常演出的氛围层共用 place-ambience 的词表；古代与西幻的「车里」按马车出声。
    if (place && place.kind === 'ship') add('ship', rain === 'heavy' || weather?.wind ? 'heavy' : 'medium', false);
    else if (place && place.kind === 'bath') add('bath', 'medium', false, place.variant);
    else if (place) add(place.kind, night ? 'light' : 'medium', false);
    if (!indoor) {
        const nature = includesAny(location, NATURE_WORDS);
        if ((time === 'dawn' || time === 'day' || !time) && nature && rain !== 'heavy') {
            add('birds', rain ? 'light' : 'medium', false);
        }
        // 夜里的森林换成猫头鹰。
        if (night && includesAny(location, FOREST_WORDS) && rain !== 'heavy' && !snow) add('birds', 'light', false, 'owl');
        if (night || time === 'dusk') {
            if ((nature || summer || includesAny(`${location} ${textOf(ctx.time)}`, INSECT_EXTRA_WORDS)) && !rain && !snow) add('insects', 'medium', false);
            if (includesAny(location, FROG_WORDS) && !snow && rain !== 'heavy') add('frogs', rain ? 'heavy' : 'medium', false);
        }
        if (includesAny(location, WAVE_WORDS)) add('waves', rain === 'heavy' || weather?.wind ? 'heavy' : 'medium', false);
        if (includesAny(location, STREAM_WORDS)) add('stream', rain === 'heavy' ? 'heavy' : 'medium', false);
    }
    // 夏天白天的蝉鸣隔着窗也听得见（夏日教室）；傍晚换成茅蜩。
    if (summer && !rain && !snow && (time === 'dawn' || time === 'day' || time === 'dusk' || !time)) {
        add('cicadas', time === 'dusk' ? 'light' : 'medium', indoor, time === 'dusk' ? 'higurashi' : '');
    }
    if (includesAny(location, DRIP_WORDS)) add('drip', 'medium', false);
    if (includesAny(location, FIRE_WORDS)) add('fire', 'medium', false);
    const tavern = includesAny(location, TAVERN_WORDS);
    if (tavern) add('tavern', 'medium', false);
    else if (includesAny(location, CROWD_WORDS)) add('crowd', indoor ? 'medium' : 'light', false);
    if (includesAny(location, TRAFFIC_WORDS)) add('traffic', night ? 'light' : 'medium', indoor);
    if (includesAny(location, BELL_WORDS)) add('bell', 'medium', false, includesAny(location, CHURCH_WORDS) ? 'church' : 'temple');
    if (includesAny(location, CHIME_WORDS) && rain !== 'heavy') add('chimes', weather?.wind || weather?.kind === 'wind' ? 'heavy' : 'medium', false);
    // 钟表只在安静的室内听得见：有雨、风、人声时不加。
    if (includesAny(location, CLOCK_WORDS) && !candidates.size) add('clock', 'light', false);
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
    return `${layer.kind}:${layer.level}:${layer.muffled ? 1 : 0}${layer.synced ? ':sync' : ''}${layer.variant ? `:${layer.variant}` : ''}`;
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
        bgm: { current: null, fading: new Set(), volume: BGM_DEFAULTS.volume, tone: '', mood: '', silent: false, chain: null },
        ctx: null,
        master: null,
        layers: new Map(),
        retry: null,
        hidden: false,
        visibility: null,
    };
}

// 闪避与页面隐藏以乘数叠在设置音量上，不改写 bgm.volume / masterVolume 本身。
function duckFactor() {
    return duckRatios.length ? Math.min(...duckRatios) : 1;
}

function gainFactor(state) {
    if (state.hidden) return 0;
    return duckFactor();
}

// 独立 HTMLAudio 的 BGM 不经过混音总线，总音量与演出色调只能在这里按乘数补上；
// 接进总线的由总线 master 与 BGM 滤波链处理，这里只管闪避与隐藏。
function bgmFactor(state, entry = state.bgm.current) {
    if (entry && entry.routed) return gainFactor(state);
    return gainFactor(state) * audioMasterVolume() * (BGM_TONE_GAIN[state.bgm.tone] ?? 1);
}

function retarget(state, ms) {
    const factor = gainFactor(state);
    if (state.master && state.ctx) {
        try { state.master.gain.setTargetAtTime(state.masterVolume * factor, state.ctx.currentTime, ms / 3000); } catch { /* ignore */ }
    }
    if (state.bgm.current) rampEntry(state, state.bgm.current, state.bgm.volume * bgmFactor(state), ms);
}

// 隐藏时必须当场停：iOS 与部分安卓 WebView 切到后台后 JS 立即冻结，延时回调不会执行，
// HTMLAudio 却允许后台继续播；iOS 的 audio.volume 还是只读的，淡出也无效。
function silenceForHidden(state) {
    if (state.master && state.ctx) {
        try { state.master.gain.setTargetAtTime(0, state.ctx.currentTime, HIDE_FADE_MS / 3000); } catch { /* ignore */ }
    }
    for (const entry of state.bgm.fading) {
        clearTimer(state, entry.ramp);
        releaseEntry(entry);
    }
    state.bgm.fading.clear();
    const entry = state.bgm.current;
    if (entry) {
        clearTimer(state, entry.ramp);
        entry.ramp = null;
        setEntryLevel(entry, 0);
        try { entry.audio.pause(); } catch { /* ignore */ }
    }
    if (state.ctx && typeof state.ctx.suspend === 'function') {
        try { Promise.resolve(state.ctx.suspend()).catch(() => {}); } catch { /* ignore */ }
    }
}

// away：标签页隐藏或浏览器窗口失焦（切到别的程序），判定见 audio-bus.watchPageAway。
function onVisibility(state, away) {
    if (away === state.hidden) return;
    state.hidden = away;
    if (away) {
        silenceForHidden(state);
        return;
    }
    retarget(state, HIDE_FADE_MS);
    if (state.bgm.current) playAudio(state, state.bgm.current);
    // 共享 context 上还有打字音与提示音，可见即恢复，不看是否有环境音图层。
    if (state.ctx) resumeContext(state);
    resumeParkedLayers(state);
}

function watchVisibility(state) {
    const doc = state.root?.ownerDocument || globalThis.document;
    const watch = watchPageAway(doc, (away) => onVisibility(state, away));
    state.visibility = watch;
    state.hidden = watch ? watch.away() : false;
}

function unwatchVisibility(state) {
    if (!state.visibility) return;
    const watch = state.visibility;
    state.visibility = null;
    watch.stop();
}

// 打字音、聊天/演出提示音播放期间压低场景声音；返回幂等的释放函数，可嵌套。
export function duckSceneAudio({ durationMs, ratio = DUCK_RATIO } = {}) {
    const value = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : DUCK_RATIO;
    const before = duckFactor();
    duckRatios.push(value);
    if (duckFactor() !== before) for (const state of liveStates) retarget(state, DUCK_MS);
    let released = false;
    let timer = null;
    const release = () => {
        if (released) return;
        released = true;
        if (timer) clearTimeout(timer);
        const prior = duckFactor();
        duckRatios.splice(duckRatios.indexOf(value), 1);
        if (duckFactor() !== prior) for (const state of liveStates) retarget(state, duckRatios.length ? DUCK_MS : UNDUCK_MS);
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
    // 接进总线的曲目要 context 在跑才听得见；没手势被拒时同样等下一次点击。
    if (entry.routed) resumeAudioBus({ retry });
    try {
        const result = entry.audio.play();
        if (result && typeof result.catch === 'function') result.catch(fail);
    } catch {
        fail();
    }
}

function setEntryLevel(entry, value) {
    entry.level = value;
    if (!entry.routed) {
        setAudioVolume(entry.audio, value);
        return;
    }
    try {
        const param = entry.gain.gain;
        param.cancelScheduledValues(entry.gain.context.currentTime);
        param.value = value;
    } catch { /* ignore */ }
}

// 接进总线的曲目用 AudioParam 线性渐变（不靠 50ms 计时器，也不受 iOS 只读 volume 限制），到点再回调。
function rampRouted(state, entry, target, ms, done) {
    const param = entry.gain.gain;
    const ctx = entry.gain.context;
    try {
        const now = ctx.currentTime;
        param.cancelScheduledValues(now);
        param.setValueAtTime(entry.level, now);
        if (ms > 0) param.linearRampToValueAtTime(target, now + ms / 1000);
        else param.setValueAtTime(target, now);
    } catch { /* ignore */ }
    entry.level = target;
    if (done) entry.ramp = later(state, () => { entry.ramp = null; done(); }, Math.max(0, ms));
}

function rampEntry(state, entry, target, ms, done) {
    clearTimer(state, entry.ramp);
    entry.ramp = null;
    if (entry.routed) {
        rampRouted(state, entry, target, ms, done);
        return;
    }
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

function releaseEntry(entry) {
    releaseAudio(entry.audio);
    for (const node of [entry.source, entry.gain]) {
        if (!node) continue;
        try { node.disconnect(); } catch { /* ignore */ }
    }
}

function fadeOutEntry(state, entry, ms = BGM_FADE_MS) {
    state.bgm.fading.add(entry);
    rampEntry(state, entry, 0, ms, () => {
        state.bgm.fading.delete(entry);
        releaseEntry(entry);
    });
}

export function canRouteBgm(url, origin = globalThis.location && globalThis.location.origin) {
    const value = String(url || '');
    if (!value || corsBlocked.has(value)) return false;
    if (/^(data:|blob:)/i.test(value)) return true;
    let parsed = null;
    try { parsed = new URL(value, origin || undefined); } catch { return false; }
    if (origin && parsed.origin === origin) return true;
    return parsed.protocol === 'https:' && BGM_CORS_HOSTS.includes(parsed.hostname);
}

// BGM 滤波链：各曲目 → input → 高通 → 低通 → 色调增益 → bgm 子总线。每个阅读器一条，首次接入时才建。
function ensureBgmChain(state) {
    if (state.bgm.chain) return state.bgm.chain;
    const out = busInput('bgm');
    const ctx = out && out.context;
    if (!ctx || typeof ctx.createMediaElementSource !== 'function') return null;
    try {
        const input = ctx.createGain();
        const high = ctx.createBiquadFilter();
        const low = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        high.type = 'highpass';
        low.type = 'lowpass';
        const shape = BGM_TONE_SHAPES[state.bgm.tone] || BGM_TONE_SHAPES[''];
        high.frequency.value = shape.high;
        low.frequency.value = shape.low;
        gain.gain.value = shape.gain;
        input.connect(high);
        high.connect(low);
        low.connect(gain);
        gain.connect(out);
        state.bgm.chain = { ctx, input, high, low, gain, nodes: [input, high, low, gain] };
    } catch {
        return null;
    }
    return state.bgm.chain;
}

function syncBgmTone(state, tone) {
    const chain = state.bgm.chain;
    if (!chain) return;
    const shape = BGM_TONE_SHAPES[tone] || BGM_TONE_SHAPES[''];
    const now = chain.ctx.currentTime;
    const tc = BGM_TONE_RAMP_MS / 3000;
    try {
        chain.low.frequency.setTargetAtTime(shape.low, now, tc);
        chain.high.frequency.setTargetAtTime(shape.high, now, tc);
        chain.gain.gain.setTargetAtTime(shape.gain, now, tc);
    } catch { /* ignore */ }
}

// 新曲目：能跨域读取就接进滤波链（audio.volume 恒为 1，音量由 entry.gain 管），否则独立播放。
function createBgmEntry(state, track) {
    let audio = null;
    try { audio = state.audioFactory(track); } catch { audio = null; }
    if (!audio) return null;
    const url = track.url;
    const entry = { url, audio, level: 0, ramp: null, routed: false, source: null, gain: null };
    const chain = state.audioFactory === defaultAudioFactory && canRouteBgm(url) ? ensureBgmChain(state) : null;
    if (chain) {
        try {
            audio.crossOrigin = 'anonymous';
            const source = chain.ctx.createMediaElementSource(audio);
            const gain = chain.ctx.createGain();
            gain.gain.value = 0;
            source.connect(gain);
            gain.connect(chain.input);
            Object.assign(entry, { routed: true, source, gain });
        } catch { /* 接不上就按独立播放 */ }
    }
    try {
        audio.loop = true;
        if (!entry.routed) setAudioVolume(audio, 0);
        audio.src = url;
    } catch { /* ignore */ }
    if (entry.routed && typeof audio.addEventListener === 'function') {
        // 跨域被拒：这一首改回独立 HTMLAudio 重新起播，并记住不再尝试。
        audio.addEventListener('error', () => {
            if (state.stopped || state.bgm.current !== entry) return;
            corsBlocked.add(url);
            state.bgm.current = null;
            releaseEntry(entry);
            const retry = createBgmEntry(state, track);
            if (!retry) return;
            state.bgm.current = retry;
            playAudio(state, retry);
            rampEntry(state, retry, state.bgm.volume * bgmFactor(state, retry), BGM_FADE_MS);
        }, { once: true });
    }
    return entry;
}

// cue：{ mood, silent }——本页的配乐情绪与是否留白，决定换曲时淡出淡入的快慢。
function syncBgm(state, track, volume, tone = '', cue = {}) {
    const bgm = state.bgm;
    const current = bgm.current;
    const url = track ? track.url : '';
    const mood = cue.mood || '';
    const silent = cue.silent === true;
    if (current && current.url === url) {
        bgm.mood = mood;
        const toneOnly = bgm.volume === volume && bgm.master === audioMasterVolume();
        if (!toneOnly || bgm.tone !== tone) {
            bgm.volume = volume;
            bgm.master = audioMasterVolume();
            bgm.tone = tone;
            syncBgmTone(state, tone);
            // 进出回忆、梦境跟画面色调同速（约 1.2s），手动调音量仍然快跟。
            rampEntry(state, current, volume * bgmFactor(state), toneOnly ? BGM_TONE_RAMP_MS : VOLUME_RAMP_MS);
        }
        return;
    }
    const fade = resolveBgmTransition(bgm.mood, mood, { silence: silent && !url, resume: bgm.silent && !silent && !current });
    bgm.volume = volume;
    bgm.master = audioMasterVolume();
    bgm.tone = tone;
    bgm.mood = mood;
    bgm.silent = silent;
    syncBgmTone(state, tone);
    if (current) {
        bgm.current = null;
        fadeOutEntry(state, current, fade.out);
    }
    if (!url) {
        disarmRetry(state);
        return;
    }
    const entry = createBgmEntry(state, track);
    if (!entry) return;
    bgm.current = entry;
    playAudio(state, entry);
    rampEntry(state, entry, volume * bgmFactor(state, entry), fade.in || BGM_FADE_MS);
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
    const length = rate * NOISE_SECONDS;
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
    node.start(0, Math.random() * (NOISE_SECONDS - 0.1));
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
// out 缺省为图层入口（室内会经过闷声低通）；layer.clear 绕过闷声，给「雨打窗」这类贴近听者的声音。
function panTo(layer, pan, parts, out = layer.out) {
    if (!pan || typeof layer.ctx.createStereoPanner !== 'function') return out;
    const panner = layer.ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(out);
    parts.push(panner);
    return panner;
}

// filter：可选的一个滤波器（type / frequency / q），夹在振荡器与包络之间。
function blip(layer, at, duration, build, pan = 0, { out, filter } = {}) {
    const ctx = layer.ctx;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    amp.gain.value = 0;
    build(osc, amp);
    const parts = [osc, amp];
    if (filter) {
        const node = ctx.createBiquadFilter();
        node.type = filter.type;
        node.frequency.value = filter.frequency;
        node.Q.value = filter.q ?? 0.7;
        parts.push(node);
        osc.connect(node);
        node.connect(amp);
    } else {
        osc.connect(amp);
    }
    amp.connect(panTo(layer, pan, parts, out));
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
    if (layer.muffled) windowTaps(layer, heavy, light);
}

// 室内雨声：闷掉的雨幕之外，偶尔几滴清脆地打在窗玻璃上，走 clear 不被低通。
function windowTaps(layer, heavy, light) {
    const [minGap, maxGap] = heavy ? [90, 320] : light ? [500, 1600] : [220, 750];
    const tap = () => {
        const at = layer.ctx.currentTime + 0.02;
        noiseBurst(layer, at, rand(0.012, 0.03), {
            type: 'bandpass', frequency: rand(2600, 4800), q: rand(3, 6), peak: rand(0.03, 0.09), attack: 0.001, pan: rand(-0.5, 0.5), out: layer.clear,
        });
        layerLater(layer, tap, rand(minGap, maxGap));
    };
    layerLater(layer, tap, rand(minGap, maxGap));
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

// 猫头鹰：「呼——呼呼」，柔起音的低正弦加一点二次泛音。
function hoot(layer, at, duration, peak, pan) {
    const freq = rand(360, 420);
    for (const [ratio, gain] of [[1, 1], [2, 0.12]]) {
        blip(layer, at, duration, (osc, amp) => {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * ratio, at);
            osc.frequency.exponentialRampToValueAtTime(freq * ratio * 0.94, at + duration);
            amp.gain.setValueAtTime(FLOOR, at);
            amp.gain.exponentialRampToValueAtTime(peak * gain, at + duration * 0.3);
            amp.gain.exponentialRampToValueAtTime(FLOOR, at + duration);
        }, pan);
    }
}

function voiceOwl(layer) {
    const call = () => {
        const pan = rand(-0.6, 0.6);
        const peak = rand(0.07, 0.11);
        let at = layer.ctx.currentTime + 0.05;
        hoot(layer, at, rand(0.35, 0.5), peak, pan);
        at += rand(0.8, 1.1);
        const tail = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < tail; i++) {
            hoot(layer, at, rand(0.18, 0.26), peak * 0.8, pan);
            at += rand(0.3, 0.4);
        }
        layerLater(layer, call, rand(8000, 20000));
    };
    layerLater(layer, call, rand(1500, 5000));
}

function voiceBirds(layer) {
    if (layer.variant === 'owl') {
        voiceOwl(layer);
        return;
    }
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
        const peak = rand(0.024, 0.048);
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
    // 室内（食堂、咖啡店）偶尔杯碟相碰；街上只有路过的脚步。
    const indoor = layer.level === 'medium';
    const detail = () => {
        const at = layer.ctx.currentTime + 0.05;
        if (indoor && Math.random() < 0.55) clink(layer, at, rand(0.012, 0.028), rand(-0.7, 0.7));
        else footsteps(layer, at, 2 + Math.floor(Math.random() * 4), rand(-0.8, 0.8));
        layerLater(layer, detail, rand(1200, 4000));
    };
    layerLater(layer, detail, rand(600, 2000));
}

// 瓷杯、玻璃杯：非谐泛音的短促金属声，偶尔两下。
function clink(layer, at, peak, pan) {
    const base = rand(2400, 3600);
    const hits = Math.random() < 0.35 ? 2 : 1;
    for (let h = 0; h < hits; h++) {
        const t = at + h * rand(0.08, 0.16);
        for (const [ratio, gain, decay] of [[1, 1, 0.25], [2.43, 0.45, 0.12], [3.8, 0.2, 0.07]]) {
            blip(layer, t, decay, (osc, amp) => {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(base * ratio, t);
                amp.gain.setValueAtTime(FLOOR, t);
                amp.gain.exponentialRampToValueAtTime(peak * gain * (h ? 0.6 : 1), t + 0.002);
                amp.gain.exponentialRampToValueAtTime(FLOOR, t + decay);
            }, pan);
        }
    }
}

// 脚步：低频闷响 + 一点鞋底摩擦，步距 0.45~0.6s，声像缓慢移过。
function footsteps(layer, at, count, pan) {
    const gap = rand(0.45, 0.6);
    const drift = rand(-0.08, 0.08);
    const peak = rand(0.05, 0.1);
    for (let i = 0; i < count; i++) {
        const t = at + i * gap * rand(0.95, 1.05);
        const p = Math.max(-0.9, Math.min(0.9, pan + drift * i));
        noiseBurst(layer, t, 0.07, { type: 'lowpass', frequency: rand(500, 800), peak: peak * rand(0.8, 1), attack: 0.003, pan: p });
        noiseBurst(layer, t + 0.01, 0.04, { type: 'bandpass', frequency: rand(2000, 3000), q: 1.2, peak: peak * 0.25, attack: 0.002, pan: p });
    }
}

// 一次性滤波噪声：起音后按时间常数衰减，结束后自动断开；图层销毁时统一停掉。
function noiseBurst(layer, at, duration, { type, frequency, q = 0.7, peak, attack = 0.005, pan = 0, out }) {
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
    chain(src, filter, amp, panTo(layer, pan, parts, out));
    for (const node of parts) layer.transient.add(node);
    src.onended = () => {
        for (const node of parts) {
            layer.transient.delete(node);
            try { node.disconnect(); } catch { /* ignore */ }
        }
    };
    src.start(at, Math.random() * (NOISE_SECONDS - 0.1));
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
        // 滚雷：主雷之后再滚 1~3 下，越来越远、越来越闷。
        let tail = at + rand(0.7, 1.4);
        let peak = near ? 0.5 : 0.35;
        const rolls = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < rolls; i++) {
            noiseBurst(layer, tail, rand(1.6, 2.6), { pan, type: 'lowpass', frequency: rand(160, 230), peak, attack: rand(0.12, 0.3) });
            tail += rand(0.8, 1.6);
            peak *= rand(0.5, 0.7);
        }
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

// 蝉鸣：两三只错开的合唱。带通噪声经音频速率调幅成「嗞——」，一阵阵涨落。
function voiceCicadas(layer) {
    if (layer.variant === 'higurashi') {
        voiceHigurashi(layer);
        return;
    }
    const voices = 2 + Math.floor(Math.random() * 2);
    for (let v = 0; v < voices; v++) {
        const am = makeGain(layer, 0.5);
        const swell = makeGain(layer, 0);
        const parts = [];
        chain(makeNoise(layer), makeFilter(layer, 'bandpass', rand(4200, 6200), 5), am, swell, panTo(layer, rand(-0.7, 0.7), parts));
        for (const node of parts) own(layer, node);
        makeLfo(layer, rand(90, 160), 0.5, am.gain);
        const peak = rand(0.8, 1.3);
        const cycle = () => {
            const t = layer.ctx.currentTime + 0.05;
            const rise = rand(1.5, 3);
            const hold = rand(3, 8);
            const fall = rand(1.5, 3);
            swell.gain.cancelScheduledValues(t);
            swell.gain.setTargetAtTime(peak, t, rise / 3);
            swell.gain.setTargetAtTime(0, t + rise + hold, fall / 3);
            layerLater(layer, cycle, (rise + hold + fall + rand(1, 5)) * 1000);
        };
        layerLater(layer, cycle, rand(100, 3000));
    }
}

// 茅蜩（傍晚）：「卡那卡那卡那」一串逐渐降调、渐弱的短音。
function voiceHigurashi(layer) {
    const call = () => {
        const pan = rand(-0.7, 0.7);
        const count = 8 + Math.floor(Math.random() * 8);
        let freq = rand(4200, 4800);
        let peak = rand(0.03, 0.05);
        let at = layer.ctx.currentTime + 0.05;
        for (let i = 0; i < count; i++) {
            const duration = rand(0.1, 0.14);
            const f = freq;
            const p = peak;
            const t = at;
            blip(layer, t, duration, (osc, amp) => {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f * 1.04, t);
                osc.frequency.exponentialRampToValueAtTime(f, t + duration);
                amp.gain.setValueAtTime(FLOOR, t);
                amp.gain.exponentialRampToValueAtTime(p, t + 0.015);
                amp.gain.exponentialRampToValueAtTime(FLOOR, t + duration);
            }, pan);
            at += duration + rand(0.03, 0.05);
            freq *= 0.992;
            if (i > count * 0.4) peak *= 0.9;
        }
        layerLater(layer, call, rand(5000, 14000));
    };
    layerLater(layer, call, rand(500, 3000));
}

// 蛙鸣：锯齿波按 18~28Hz 脉冲、带通成「咕呱」；几只各自成串地叫，雨天更热闹。
function croak(layer, at, base, peak, pan) {
    const pulses = 3 + Math.floor(Math.random() * 4);
    const rate = rand(18, 28);
    const duration = pulses / rate;
    blip(layer, at, duration, (osc, amp) => {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(base, at);
        osc.frequency.linearRampToValueAtTime(base * rand(0.85, 0.95), at + duration);
        for (let i = 0; i < pulses; i++) {
            const t = at + i / rate;
            amp.gain.setValueAtTime(0, t);
            amp.gain.linearRampToValueAtTime(peak, t + 0.25 / rate);
            amp.gain.linearRampToValueAtTime(0, t + 0.8 / rate);
        }
    }, pan, { filter: { type: 'bandpass', frequency: base * rand(3, 4.5), q: 2.5 } });
}

function voiceFrogs(layer) {
    const count = layer.level === 'heavy' ? 4 : 2 + Math.floor(Math.random() * 2);
    for (let f = 0; f < count; f++) {
        const base = rand(140, 280);
        const pan = rand(-0.7, 0.7);
        const peak = rand(0.16, 0.26);
        const bout = () => {
            const now = layer.ctx.currentTime;
            const n = 2 + Math.floor(Math.random() * 4);
            let at = now + 0.05;
            for (let i = 0; i < n; i++) {
                croak(layer, at, base * rand(0.97, 1.03), peak, pan);
                at += rand(0.35, 0.6);
            }
            layerLater(layer, bout, (at - now) * 1000 + rand(1500, 5000));
        };
        layerLater(layer, bout, rand(200, 3000));
    }
}

// 风铃：五声音阶上的金属管（非谐泛音 1 : 2.76 : 5.4），风一阵就叮几下；有风时更密。
const CHIME_SCALE = Object.freeze([1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]);

function chimeStrike(layer, at, freq, peak, pan) {
    for (const [ratio, gain, decay] of [[1, 1, rand(1.8, 2.8)], [2.76, 0.35, 0.9], [5.4, 0.15, 0.4]]) {
        blip(layer, at, decay, (osc, amp) => {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * ratio, at);
            amp.gain.setValueAtTime(FLOOR, at);
            amp.gain.exponentialRampToValueAtTime(peak * gain, at + 0.002);
            amp.gain.exponentialRampToValueAtTime(FLOOR, at + decay);
        }, pan);
    }
}

function voiceChimes(layer) {
    const root = rand(1400, 1900);
    const notes = CHIME_SCALE.map((ratio) => root * ratio);
    const windy = layer.level === 'heavy';
    const pan = rand(-0.4, 0.4);
    const gust = () => {
        const hits = windy ? 2 + Math.floor(Math.random() * 5) : 1 + Math.floor(Math.random() * 3);
        let at = layer.ctx.currentTime + 0.05;
        for (let i = 0; i < hits; i++) {
            chimeStrike(layer, at, notes[Math.floor(Math.random() * notes.length)], rand(0.015, 0.035), pan + rand(-0.1, 0.1));
            at += rand(0.08, 0.35);
        }
        layerLater(layer, gust, windy ? rand(1200, 4000) : rand(3000, 10000));
    };
    layerLater(layer, gust, rand(500, 2500));
}

// 钟声：寺庙梵钟低沉、带拍频，一下余音十秒；教堂钟明亮，一次连敲数下。都隔很久才响一回。
const TEMPLE_PARTIALS = Object.freeze([[1, 1, 10], [1.004, 0.6, 10], [2.02, 0.4, 6], [2.7, 0.25, 4], [3.9, 0.12, 2.5], [5.4, 0.06, 1.5]]);
const CHURCH_PARTIALS = Object.freeze([[0.5, 0.5, 5], [1, 0.8, 4], [1.2, 0.5, 3], [1.5, 0.3, 2.5], [2, 0.6, 2]]);

function bellStrike(layer, at, base, partials, peak, pan) {
    noiseBurst(layer, at, 0.12, { type: 'lowpass', frequency: base * 6, peak: peak * 0.4, attack: 0.002, pan });
    for (const [ratio, gain, decay] of partials) {
        blip(layer, at, decay, (osc, amp) => {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(base * ratio, at);
            amp.gain.setValueAtTime(FLOOR, at);
            amp.gain.exponentialRampToValueAtTime(peak * gain, at + 0.004);
            amp.gain.exponentialRampToValueAtTime(FLOOR, at + decay);
        }, pan);
    }
}

function voiceBell(layer) {
    const church = layer.variant === 'church';
    const base = church ? rand(320, 420) : rand(110, 140);
    const pan = rand(-0.3, 0.3);
    const toll = () => {
        const at = layer.ctx.currentTime + 0.05;
        if (church) {
            const strokes = 2 + Math.floor(Math.random() * 4);
            for (let i = 0; i < strokes; i++) bellStrike(layer, at + i * rand(1.6, 2), base, CHURCH_PARTIALS, 0.05, pan);
            layerLater(layer, toll, rand(25000, 50000));
        } else {
            bellStrike(layer, at, base, TEMPLE_PARTIALS, 0.08, pan);
            layerLater(layer, toll, rand(20000, 40000));
        }
    };
    layerLater(layer, toll, rand(2000, 6000));
}

// 按音频时钟预排未来几秒的等间隔事件（钟表、列车），不受定时器抖动影响；隐藏后恢复从当前时刻续上。
function metronome(layer, period, strike) {
    let next = 0;
    const batch = () => {
        const now = layer.ctx.currentTime;
        if (next < now + 0.05) next = now + 0.05;
        while (next < now + 4) {
            strike(next);
            next += period();
        }
        layerLater(layer, batch, 3000);
    };
    batch();
}

// 钟表：一秒一下，「嘀」「嗒」交替，很轻。
function voiceClock(layer) {
    const period = rand(0.98, 1.02);
    const peak = rand(0.6, 0.85);
    const pan = rand(-0.5, 0.5);
    let tock = false;
    metronome(layer, () => period, (at) => {
        noiseBurst(layer, at, 0.02, { type: 'bandpass', frequency: tock ? 2400 : 3400, q: 2.5, peak: peak * (tock ? 0.8 : 1), attack: 0.001, pan });
        tock = !tock;
    });
}

// 洞穴滴水：上滑的「叮咚」，偶尔紧跟一滴小的；底下垫一层极低的空洞气流。空间混响由地点词决定。
function voiceDrip(layer) {
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 140), makeGain(layer, 0.12), layer.out);
    const plink = (at, freq, peak, pan) => blip(layer, at, 0.12, (osc, amp) => {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, at);
        osc.frequency.exponentialRampToValueAtTime(freq * rand(1.6, 2.2), at + 0.05);
        amp.gain.setValueAtTime(FLOOR, at);
        amp.gain.exponentialRampToValueAtTime(peak, at + 0.003);
        amp.gain.exponentialRampToValueAtTime(FLOOR, at + 0.12);
    }, pan);
    const drop = () => {
        const at = layer.ctx.currentTime + 0.03;
        const freq = rand(700, 1600);
        const peak = rand(0.04, 0.09);
        const pan = rand(-0.7, 0.7);
        plink(at, freq, peak, pan);
        if (Math.random() < 0.25) plink(at + rand(0.15, 0.4), freq * rand(0.9, 1.1), peak * 0.5, pan);
        layerLater(layer, drop, rand(500, 2600));
    };
    layerLater(layer, drop, rand(200, 1200));
}

// 列车：车厢里的低频轰鸣 + 「哐当、哐当」的轨缝节奏。
function voiceTrain(layer) {
    const rumble = makeGain(layer, 0.32);
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 170), rumble, layer.out);
    makeLfo(layer, rand(0.15, 0.3), 0.06, rumble.gain);
    chain(makeNoise(layer), makeFilter(layer, 'bandpass', 520, 0.9), makeGain(layer, 0.06), layer.out);
    const period = rand(1.05, 1.3);
    metronome(layer, () => period * rand(0.99, 1.01), (at) => {
        for (const offset of [0, 0.11]) {
            noiseBurst(layer, at + offset, 0.09, { type: 'lowpass', frequency: rand(700, 1000), peak: rand(0.14, 0.2), attack: 0.002 });
        }
    });
}

// 酒馆：比街市更暖更闷的人声，夹着碰杯、木杯落桌和偶尔一阵笑。
function mugThunk(layer, at, pan) {
    noiseBurst(layer, at, 0.1, { type: 'lowpass', frequency: 280, peak: rand(0.12, 0.2), attack: 0.002, pan });
    noiseBurst(layer, at, 0.05, { type: 'bandpass', frequency: rand(800, 1100), q: 2, peak: 0.04, attack: 0.001, pan });
}

function laugh(layer, at, pan) {
    const count = 3 + Math.floor(Math.random() * 4);
    const freq = rand(700, 1100);
    let peak = rand(0.03, 0.05);
    let t = at;
    for (let i = 0; i < count; i++) {
        noiseBurst(layer, t, 0.08, { type: 'bandpass', frequency: freq * rand(0.95, 1.08), q: 4, peak, attack: 0.01, pan });
        t += rand(0.13, 0.17);
        peak *= 0.85;
    }
}

function voiceTavern(layer) {
    const murmur = makeGain(layer, 0.24);
    chain(makeNoise(layer), makeFilter(layer, 'highpass', 180), makeFilter(layer, 'lowpass', 1100), murmur, layer.out);
    const formant = makeFilter(layer, 'bandpass', 550, 1.4);
    chain(makeNoise(layer), formant, makeGain(layer, 0.1), layer.out);
    makeLfo(layer, rand(0.15, 0.3), 200, formant.frequency);
    const wander = () => {
        murmur.gain.setTargetAtTime(rand(0.16, 0.32), layer.ctx.currentTime, 0.8);
        layerLater(layer, wander, rand(900, 2500));
    };
    wander();
    const detail = () => {
        const at = layer.ctx.currentTime + 0.05;
        const pan = rand(-0.8, 0.8);
        const roll = Math.random();
        if (roll < 0.45) clink(layer, at, rand(0.012, 0.025), pan);
        else if (roll < 0.8) mugThunk(layer, at, pan);
        else laugh(layer, at, pan);
        layerLater(layer, detail, rand(700, 2500));
    };
    layerLater(layer, detail, rand(300, 1200));
}

// 船只：船底随浪一涨一落的水声，船身跟着摇一下就「吱呀」一声。
function creak(layer, at, heavy) {
    const duration = rand(0.4, 1.1);
    const base = rand(70, 140);
    const peak = rand(0.04, 0.08) * (heavy ? 1.3 : 1);
    blip(layer, at, duration, (osc, amp) => {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(base, at);
        osc.frequency.linearRampToValueAtTime(base * rand(1.1, 1.35), at + duration * 0.6);
        osc.frequency.linearRampToValueAtTime(base * rand(0.9, 1.05), at + duration);
        amp.gain.setValueAtTime(FLOOR, at);
        amp.gain.exponentialRampToValueAtTime(peak, at + duration * 0.25);
        amp.gain.setValueAtTime(peak * 0.8, at + duration * 0.75);
        amp.gain.exponentialRampToValueAtTime(FLOOR, at + duration);
    }, rand(-0.6, 0.6), { filter: { type: 'bandpass', frequency: rand(500, 1100), q: 5 } });
}

function voiceShip(layer) {
    const heavy = layer.level === 'heavy';
    const wash = makeGain(layer, 0.1);
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 380, 0.5), wash, layer.out);
    const period = rand(5, 8);
    const sway = () => {
        const t = layer.ctx.currentTime + 0.05;
        wash.gain.cancelScheduledValues(t);
        wash.gain.setTargetAtTime(heavy ? 0.4 : 0.26, t, period * 0.15);
        wash.gain.setTargetAtTime(0.08, t + period * 0.5, period * 0.15);
        creak(layer, t + period * rand(0.3, 0.5), heavy);
        if (Math.random() < 0.4) creak(layer, t + period * rand(0.7, 0.9), heavy);
        layerLater(layer, sway, period * 1000);
    };
    sway();
}

// 车流：远处低沉的车河 + 一辆辆驶过（滤波上扬再回落模拟多普勒，声像从一侧扫到另一侧）；夜里车少。
function passBy(layer, at) {
    const ctx = layer.ctx;
    const duration = rand(3, 5);
    const mid = at + duration * rand(0.4, 0.6);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(350, at);
    filter.frequency.exponentialRampToValueAtTime(rand(800, 1100), mid);
    filter.frequency.exponentialRampToValueAtTime(300, at + duration);
    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.gain.setValueAtTime(FLOOR, at);
    amp.gain.exponentialRampToValueAtTime(rand(0.18, 0.32), mid);
    amp.gain.exponentialRampToValueAtTime(FLOOR, at + duration);
    const parts = [src, filter, amp];
    let tail = layer.out;
    if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        const dir = Math.random() < 0.5 ? -1 : 1;
        panner.pan.setValueAtTime(-0.8 * dir, at);
        panner.pan.linearRampToValueAtTime(0.8 * dir, at + duration);
        panner.connect(layer.out);
        parts.push(panner);
        tail = panner;
    }
    chain(src, filter, amp, tail);
    for (const node of parts) layer.transient.add(node);
    src.onended = () => {
        for (const node of parts) {
            layer.transient.delete(node);
            try { node.disconnect(); } catch { /* ignore */ }
        }
    };
    src.start(at, Math.random() * (NOISE_SECONDS - 0.1));
    src.stop(at + duration + 0.05);
}

function voiceTraffic(layer) {
    const light = layer.level === 'light';
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 220), makeGain(layer, light ? 0.1 : 0.16), layer.out);
    const [minGap, maxGap] = light ? [5000, 14000] : [1800, 6000];
    const pass = () => {
        passBy(layer, layer.ctx.currentTime + 0.05);
        layerLater(layer, pass, rand(minGap, maxGap));
    };
    layerLater(layer, pass, rand(500, 2500));
}

// 车内：发动机低频嗡鸣随转速缓慢起伏，加一层胎噪；隔一阵压过路面接缝「咚」一下。一路噪声分两条滤波，省一个音源。
function voiceCar(layer) {
    const noise = makeNoise(layer);
    const rumble = makeGain(layer, 0.22);
    chain(noise, makeFilter(layer, 'lowpass', 140), rumble, layer.out);
    makeLfo(layer, rand(0.06, 0.12), 0.05, rumble.gain);
    chain(noise, makeFilter(layer, 'bandpass', 420, 0.6), makeGain(layer, layer.level === 'light' ? 0.035 : 0.05), layer.out);
    const hum = own(layer, layer.ctx.createOscillator());
    hum.type = 'sine';
    hum.frequency.value = rand(44, 52);
    chain(hum, makeGain(layer, 0.05), layer.out);
    hum.start();
    const bump = () => {
        const at = layer.ctx.currentTime + 0.05;
        noiseBurst(layer, at, 0.18, { type: 'lowpass', frequency: 160, peak: rand(0.12, 0.2), attack: 0.004 });
        noiseBurst(layer, at + rand(0.18, 0.26), 0.14, { type: 'lowpass', frequency: 180, peak: rand(0.06, 0.1), attack: 0.004 });
        layerLater(layer, bump, rand(6000, 15000));
    };
    layerLater(layer, bump, rand(2000, 6000));
}

// 马车：「嘚、嘚」成对的蹄声踩着节拍，车轮滚过土路的低沉轰轰，车身偶尔「吱呀」。
function voiceCarriage(layer) {
    const wheels = makeGain(layer, 0.12);
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 240), wheels, layer.out);
    makeLfo(layer, rand(0.4, 0.7), 0.04, wheels.gain);
    const period = rand(0.52, 0.6);
    const pan = rand(-0.25, 0.25);
    metronome(layer, () => period * rand(0.97, 1.03), (at) => {
        for (const offset of [0, rand(0.1, 0.13)]) {
            noiseBurst(layer, at + offset, 0.06, { type: 'lowpass', frequency: rand(600, 800), peak: rand(0.1, 0.15), attack: 0.002, pan });
            noiseBurst(layer, at + offset, 0.03, { type: 'bandpass', frequency: rand(1600, 2100), q: 3, peak: 0.03, attack: 0.001, pan });
        }
    });
    const sway = () => {
        creak(layer, layer.ctx.currentTime + 0.05, false);
        layerLater(layer, sway, rand(3500, 8000));
    };
    layerLater(layer, sway, rand(1500, 4000));
}

// 浴室：淋浴是持续的细密水声；温泉是汩汩的泉水；浴缸只有很轻的水波声。都夹着从天花板滴下来的「叮咚」。
function bathDrop(layer, at, freq, peak, pan) {
    blip(layer, at, 0.14, (osc, amp) => {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, at);
        osc.frequency.exponentialRampToValueAtTime(freq * rand(1.5, 2), at + 0.06);
        amp.gain.setValueAtTime(FLOOR, at);
        amp.gain.exponentialRampToValueAtTime(peak, at + 0.003);
        amp.gain.exponentialRampToValueAtTime(FLOOR, at + 0.14);
    }, pan);
}

function voiceBath(layer) {
    const noise = makeNoise(layer);
    if (layer.variant === 'shower') {
        chain(noise, makeFilter(layer, 'bandpass', 3200, 0.5), makeGain(layer, 0.16), layer.out);
        chain(noise, makeFilter(layer, 'lowpass', 380), makeGain(layer, 0.08), layer.out);
    } else {
        const onsen = layer.variant === 'onsen';
        const water = makeGain(layer, onsen ? 0.12 : 0.05);
        chain(noise, makeFilter(layer, 'lowpass', onsen ? 520 : 320, 0.6), water, layer.out);
        makeLfo(layer, rand(0.12, 0.2), onsen ? 0.04 : 0.025, water.gain);
    }
    const [minGap, maxGap] = layer.variant === 'shower' ? [2500, 7000] : [1200, 4500];
    const drop = () => {
        bathDrop(layer, layer.ctx.currentTime + 0.03, rand(900, 1700), rand(0.03, 0.07), rand(-0.6, 0.6));
        layerLater(layer, drop, rand(minGap, maxGap));
    };
    layerLater(layer, drop, rand(400, 1500));
}

// 水下：深处的水压低鸣慢慢起伏，一簇簇气泡往上冒，很久才有一声远处的鲸歌。
function voiceUnderwater(layer) {
    const deep = makeGain(layer, 0.26);
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 200, 0.6), deep, layer.out);
    makeLfo(layer, rand(0.05, 0.09), 0.08, deep.gain);
    const bubbles = () => {
        const count = 2 + Math.floor(Math.random() * 4);
        const pan = rand(-0.7, 0.7);
        let at = layer.ctx.currentTime + 0.05;
        for (let i = 0; i < count; i++) {
            const freq = rand(240, 520);
            blip(layer, at, 0.08, (osc, amp) => {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, at);
                osc.frequency.exponentialRampToValueAtTime(freq * rand(2.4, 3.2), at + 0.07);
                amp.gain.setValueAtTime(FLOOR, at);
                amp.gain.exponentialRampToValueAtTime(rand(0.03, 0.06), at + 0.004);
                amp.gain.exponentialRampToValueAtTime(FLOOR, at + 0.08);
            }, pan);
            at += rand(0.06, 0.18);
        }
        layerLater(layer, bubbles, rand(1800, 6000));
    };
    layerLater(layer, bubbles, rand(600, 2000));
    const whale = () => {
        const at = layer.ctx.currentTime + 0.05;
        const from = rand(170, 230);
        const duration = rand(2.4, 3.6);
        blip(layer, at, duration, (osc, amp) => {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(from, at);
            osc.frequency.linearRampToValueAtTime(from * rand(1.25, 1.5), at + duration * 0.4);
            osc.frequency.linearRampToValueAtTime(from * rand(0.7, 0.85), at + duration);
            amp.gain.setValueAtTime(FLOOR, at);
            amp.gain.exponentialRampToValueAtTime(0.035, at + duration * 0.3);
            amp.gain.exponentialRampToValueAtTime(FLOOR, at + duration);
        }, rand(-0.5, 0.5));
        layerLater(layer, whale, rand(30000, 70000));
    };
    layerLater(layer, whale, rand(12000, 30000));
}

// 太空真空：外面什么声音都没有，只听得见自己——极轻的低鸣，和一吸一呼的呼吸。
function voiceVacuum(layer) {
    chain(makeNoise(layer), makeFilter(layer, 'lowpass', 90), makeGain(layer, 0.06), layer.out);
    const period = rand(4.2, 5.2);
    const breath = () => {
        const at = layer.ctx.currentTime + 0.05;
        noiseBurst(layer, at, 1.3, { type: 'bandpass', frequency: rand(1100, 1300), q: 0.8, peak: 0.035, attack: 0.9 });
        noiseBurst(layer, at + period * 0.45, 1.5, { type: 'bandpass', frequency: rand(700, 850), q: 0.8, peak: 0.03, attack: 0.5 });
        layerLater(layer, breath, period * 1000);
    };
    layerLater(layer, breath, rand(800, 2000));
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
    cicadas: voiceCicadas,
    frogs: voiceFrogs,
    chimes: voiceChimes,
    bell: voiceBell,
    clock: voiceClock,
    drip: voiceDrip,
    train: voiceTrain,
    tavern: voiceTavern,
    ship: voiceShip,
    traffic: voiceTraffic,
    car: voiceCar,
    carriage: voiceCarriage,
    bath: voiceBath,
    underwater: voiceUnderwater,
    space: voiceVacuum,
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
        muffled: spec.muffled === true,
        variant: spec.variant || '',
        ctx,
        state,
        nodes: [],
        transient: new Set(),
        parked: new Set(),
        timers: new Set(),
        cleanups: [],
        stopped: false,
        out: null,
        clear: null,
        fade: null,
    };
    try {
        // 声音 → out →（室内闷声低通）→ fade（淡入淡出）→ 色调链；clear 直接进 fade，不被闷掉。
        layer.fade = makeGain(layer, 0);
        layer.fade.connect(state.tone ? state.tone.input : state.master);
        layer.clear = layer.fade;
        layer.out = layer.fade;
        if (spec.muffled) {
            layer.out = makeGain(layer, 1);
            chain(layer.out, makeFilter(layer, 'lowpass', MUFFLE_HZ, 0.5), layer.fade);
        }
        VOICES[spec.kind](layer);
        const now = ctx.currentTime;
        layer.fade.gain.setValueAtTime(0, now);
        layer.fade.gain.linearRampToValueAtTime(LEVEL_GAIN[spec.level] || LEVEL_GAIN.medium, now + AMBIENT_FADE_IN_S);
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
        const gain = layer.fade.gain;
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
    const live = root && typeof root === 'object' ? states.get(root) : null;
    const memory = live ? live.bgmMemory : createBgmMemory();
    // 留白：告白或 AI 写了「无声」时音乐停几页；留白期间不选曲，「换一首」也不起播。
    const silent = active && bgm.enabled && resolveBgmSilence({
        mood: bgm.moodTag ? context.bgmMood : '', confess: context.confess === true, confessText: context.confessText === true,
        location: context.location, pageKey: context.pageKey,
    }, memory);
    const picked = active && bgm.enabled && !silent ? pickSceneBgm(bgm, context, memory, source.skip === true) : { track: null, mood: '' };
    const track = picked.track;
    const plan = active ? resolveAmbientPlan(context, ambient, source.weatherSettings) : [];
    const tone = plan.length ? resolveAmbientTone(context) : '';
    const space = plan.length ? resolveAmbientSpace(context.location, source.weatherSettings) : '';
    const bgmTone = track ? resolveAmbientTone(context) : '';
    const result = { track, ambient: plan, tone, space };
    if (!root || typeof root !== 'object') return result;
    // 打字音与音效的空间混响跟着「场景声音」开关走；测试注入的 context 不碰共享总线。
    if (typeof source.contextFactory !== 'function') {
        const voiceTone = active && ambient.enabled ? resolveAmbientTone(context) : '';
        syncVoiceSpace(voiceTone === 'dream' ? 'long' : active && ambient.enabled ? resolveAmbientSpace(context.location, source.weatherSettings) : '');
    }
    let state = states.get(root);
    if (!state) {
        if (!track && !plan.length) return result;
        state = createState(root);
        state.bgmMemory = memory;
        states.set(root, state);
        liveStates.add(state);
        watchVisibility(state);
    }
    if (typeof source.schedule === 'function') state.schedule = source.schedule;
    if (typeof source.clear === 'function') state.clear = source.clear;
    if (typeof source.audioFactory === 'function') state.audioFactory = source.audioFactory;
    if (typeof source.contextFactory === 'function') state.contextFactory = source.contextFactory;
    state.lastOptions = { ...source, skip: false };
    const key = [track ? track.url : '', bgm.volume, audioMasterVolume(), bgmTone, plan.map(layerKey).join(','), ambient.volume, tone, space].join('|');
    if (key === state.key) return result;
    state.key = key;
    syncBgm(state, track, bgm.volume, bgmTone, { mood: picked.mood, silent });
    syncAmbient(state, plan, ambient.volume, tone, space);
    return result;
}

function syncVoiceSpace(kind) {
    if (kind === voiceSpace) return;
    voiceSpace = kind;
    if (!kind) {
        setAudioBusSpace(null, 0);
        return;
    }
    const ctx = audioBusContext();
    if (!ctx) return;
    try { setAudioBusSpace(impulseBuffer(ctx, kind), VOICE_SPACE_WET[kind] || 0); } catch { /* ignore */ }
}

export function cancelSceneAudio(root) {
    syncVoiceSpace('');
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
    for (const entry of entries) releaseEntry(entry);
    state.bgm.fading.clear();
    state.bgm.current = null;
    for (const node of state.bgm.chain ? state.bgm.chain.nodes : []) {
        try { node.disconnect(); } catch { /* ignore */ }
    }
    state.bgm.chain = null;
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
