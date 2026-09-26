import { startWeatherParticles } from './weather-fx-particles.js';

export const WEATHER_FX_INTENSITIES = Object.freeze(['weak', 'medium', 'strong']);
export const WEATHER_FX_INDOOR_WORDS = Object.freeze([
    '室内', '房间', '卧室', '客厅', '教室', '办公室', '图书馆', '厨房', '浴室',
    '车内', '商店', '餐厅', '咖啡馆', '大厅', '屋', '家', '店', '馆',
    '室', '厅', '宿舍', '走廊', '楼道', '电梯', '车厢', '病房', '医院', '酒吧', '影院',
]);
export const WEATHER_FX_OUTDOOR_WORDS = Object.freeze([
    '室外', '屋外', '户外', '野外', '露天', '屋顶', '天台', '阳台', '露台', '门口', '门前', '门外',
    '庭院', '院子', '街', '巷', '路', '广场', '公园', '操场', '花园', '河边', '湖边', '海边',
    '山', '森林', '树林', '田', '桥', '站台',
]);
export const WEATHER_FX_DEFAULTS = Object.freeze({
    enabled: false,
    intensity: 'medium',
    indoorWords: WEATHER_FX_INDOOR_WORDS,
    outdoorWords: WEATHER_FX_OUTDOOR_WORDS,
});
export const SUNBURST_DURATION_MS = 1500;
export const LIGHTNING_DURATION_MS = 900;

// 天气词 → 演出类型，按顺序子串匹配，先命中者为主类型（雨夹雪归雪、雾霾归雾、晴转多云归阴）。
const WEATHER_KIND_RULES = Object.freeze([
    Object.freeze(['snow', Object.freeze(['雪', '霰', 'snow', 'blizzard', 'sleet'])]),
    Object.freeze(['rain', Object.freeze(['雨', '雷', 'rain', 'drizzle', 'shower', 'thunder'])]),
    Object.freeze(['fog', Object.freeze(['雾', 'fog', 'mist'])]),
    Object.freeze(['sand', Object.freeze(['沙', '尘', '霾', 'sand', 'dust', 'haze', 'smog'])]),
    Object.freeze(['wind', Object.freeze(['风', 'wind', 'gale', 'breez'])]),
    Object.freeze(['cloud', Object.freeze(['阴', '云', 'cloud', 'overcast'])]),
    Object.freeze(['sun', Object.freeze(['晴', '阳', 'sun', 'clear'])]),
]);
const HEAVY_WORDS = Object.freeze(['暴', '大', '倾盆', '瓢泼', '狂', '猛', '强', '浓', '密', 'heavy', 'torrential', 'storm', 'blizzard', 'dense', 'thick']);
const LIGHT_WORDS = Object.freeze(['小', '细', '毛毛', '微', '薄', '零星', '轻', '淡', '疏', 'light', 'drizzle', 'slight', 'mist']);
const THUNDER_WORDS = Object.freeze(['雷', '闪电', 'thunder', 'lightning']);
const WIND_WORDS = Object.freeze(['风', 'wind', 'gale', 'blizzard']);

// 时段按子串匹配，深夜/黄昏/清晨须先于泛化的「夜」「晚」判定；无命中时尝试 HH:MM。
const TIME_RULES = Object.freeze([
    Object.freeze(['midnight', Object.freeze(['深夜', '午夜', '凌晨', '半夜', 'midnight'])]),
    Object.freeze(['dusk', Object.freeze(['黄昏', '傍晚', '日落', '夕', 'dusk', 'evening', 'sunset'])]),
    Object.freeze(['dawn', Object.freeze(['清晨', '黎明', '拂晓', '早晨', '早上', '日出', '晨', 'dawn', 'morning', 'sunrise'])]),
    Object.freeze(['night', Object.freeze(['夜', '晚', 'night'])]),
    Object.freeze(['day', Object.freeze(['白天', '白日', '日间', '上午', '中午', '正午', '下午', '午后', '午', 'day', 'noon', 'afternoon'])]),
]);
const PARTICLE_KINDS = Object.freeze(['rain', 'snow', 'wind', 'sand']);
const NIGHT_TIMES = Object.freeze(['night', 'midnight']);
const FX_ATTRS = Object.freeze([
    'data-igs-weather-fx', 'data-igs-weather-fx-intensity', 'data-igs-weather-fx-level', 'data-igs-weather-fx-scene',
    'data-igs-weather-fx-time', 'data-igs-weather-fx-thunder', 'data-igs-weather-fx-wind', 'data-igs-weather-fx-motion',
    'data-igs-weather-fx-flash',
]);
const FX_CLASSES = Object.freeze(['igs-fx-sunburst-active', 'igs-fx-lightning-active']);

const activeStates = new WeakMap();

export function normalizeWeatherFxSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        enabled: source.enabled === true,
        intensity: WEATHER_FX_INTENSITIES.includes(source.intensity) ? source.intensity : WEATHER_FX_DEFAULTS.intensity,
        indoorWords: normalizeWordList(source.indoorWords, WEATHER_FX_DEFAULTS.indoorWords),
        outdoorWords: normalizeWordList(source.outdoorWords, WEATHER_FX_DEFAULTS.outdoorWords),
    };
}

function normalizeWordList(value, fallback) {
    if (!Array.isArray(value)) return Array.from(fallback);
    const output = [];
    for (const item of value) {
        const word = String(item == null ? '' : item).trim();
        if (word && word.length <= 20 && !output.includes(word)) output.push(word);
    }
    return output;
}

function textOf(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
}

function includesAny(text, words) {
    return words.some((word) => text.includes(word));
}

// 中文地点短语中心语在后（「图书馆门口」是门口、「山间小屋」是屋），取结束位置最靠后的命中词；
// 同位置取更长词，再同则室内词优先。无命中或地点为空视为室外。
export function resolveWeatherFxScene(location, settings) {
    const text = String(location == null ? '' : location).trim();
    if (!text) return 'outdoor';
    const normalized = normalizeWeatherFxSettings(settings);
    let best = null;
    const consider = (words, scene) => {
        for (const word of words) {
            const index = text.lastIndexOf(word);
            if (index < 0) continue;
            const end = index + word.length;
            if (!best || end > best.end || (end === best.end && word.length > best.length)
                || (end === best.end && word.length === best.length && scene === 'indoor')) {
                best = { end, length: word.length, scene };
            }
        }
    };
    consider(normalized.outdoorWords, 'outdoor');
    consider(normalized.indoorWords, 'indoor');
    return best ? best.scene : 'outdoor';
}

export function isIndoorLocation(location, settings) {
    return resolveWeatherFxScene(location, settings) === 'indoor';
}

export function resolveWeatherFxKind(weather) {
    const text = textOf(weather);
    if (!text) return '';
    for (const [kind, words] of WEATHER_KIND_RULES) {
        if (includesAny(text, words)) return kind;
    }
    return '';
}

export function resolveWeatherFxTime(time) {
    const text = textOf(time);
    if (!text) return '';
    for (const [key, words] of TIME_RULES) {
        if (includesAny(text, words)) return key;
    }
    const clock = text.match(/(\d{1,2})\s*[:：点时]/);
    if (!clock) return '';
    const hour = Number(clock[1]);
    if (hour > 24) return '';
    if (hour < 5 || hour === 24) return 'midnight';
    if (hour < 8) return 'dawn';
    if (hour < 17) return 'day';
    if (hour < 19) return 'dusk';
    return 'night';
}

export function resolveWeatherFxPlan(options = {}) {
    const kind = resolveWeatherFxKind(options.weather);
    if (!kind) return null;
    const text = textOf(options.weather);
    const scene = resolveWeatherFxScene(options.location, options.settings);
    // 室内看不到风，直接不演出；其余天气在室内改为「隔窗」氛围。
    if (kind === 'wind' && scene === 'indoor') return null;
    const level = includesAny(text, HEAVY_WORDS) ? 'heavy' : includesAny(text, LIGHT_WORDS) ? 'light' : 'medium';
    return {
        kind,
        level,
        scene,
        time: resolveWeatherFxTime(options.time),
        thunder: kind === 'rain' && includesAny(text, THUNDER_WORDS),
        wind: (kind === 'rain' || kind === 'snow') && includesAny(text, WIND_WORDS),
        particles: scene === 'outdoor' && PARTICLE_KINDS.includes(kind),
    };
}

function hasReducedMotion(options = {}) {
    return options.reducedMotion === true
        || (options.reducedMotion !== false
            && typeof globalThis.matchMedia === 'function'
            && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function clearLayer(layer) {
    if (!layer) return;
    if (layer.removeAttribute) for (const name of FX_ATTRS) layer.removeAttribute(name);
    if (layer.classList && typeof layer.classList.remove === 'function') for (const name of FX_CLASSES) layer.classList.remove(name);
}

function clearState(layer, state) {
    if (!layer || !state) return;
    state.stopped = true;
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
    if (state.particles && typeof state.particles.stop === 'function') state.particles.stop();
    clearLayer(layer);
    if (state.front) clearLayer(state.front);
    activeStates.delete(layer);
}

export function cancelWeatherFx(layer, front) {
    const state = layer && activeStates.get(layer);
    if (state) clearState(layer, state);
    else if (layer) clearLayer(layer);
    if (front && (!state || state.front !== front)) clearLayer(front);
    return Boolean(state);
}

function setFxAttrs(el, plan, intensity, motion) {
    if (!el || !el.setAttribute) return;
    el.setAttribute('data-igs-weather-fx', plan.kind);
    el.setAttribute('data-igs-weather-fx-intensity', intensity);
    el.setAttribute('data-igs-weather-fx-level', plan.level);
    el.setAttribute('data-igs-weather-fx-scene', plan.scene);
    if (plan.time) el.setAttribute('data-igs-weather-fx-time', plan.time);
    if (plan.thunder) el.setAttribute('data-igs-weather-fx-thunder', '1');
    if (plan.wind) el.setAttribute('data-igs-weather-fx-wind', '1');
    if (!motion) el.setAttribute('data-igs-weather-fx-motion', 'off');
}

function later(state, fn, delay) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        if (!state.stopped) fn();
    }, delay);
    state.timers.add(timer);
}

function toggleClass(el, name, on) {
    if (!el || !el.classList) return;
    if (on && typeof el.classList.add === 'function') el.classList.add(name);
    if (!on && typeof el.classList.remove === 'function') el.classList.remove(name);
}

// 闪电：进场后 1.2~2.6s 先闪一次定调，之后随机间隔循环；阅读器被移除时停止排程。
function scheduleLightning(state, target, plan, first) {
    const [min, max] = first ? [1200, 2600] : plan.level === 'heavy' ? [4500, 9000] : [7000, 14000];
    later(state, () => {
        if (target.isConnected === false) return;
        const hidden = target.ownerDocument && target.ownerDocument.hidden === true;
        if (!hidden) {
            if (target.setAttribute) target.setAttribute('data-igs-weather-fx-flash', state.random() < 0.5 ? 'a' : 'b');
            toggleClass(target, 'igs-fx-lightning-active', true);
        }
        later(state, () => {
            toggleClass(target, 'igs-fx-lightning-active', false);
            scheduleLightning(state, target, plan, false);
        }, LIGHTNING_DURATION_MS);
    }, min + state.random() * (max - min));
}

function playSunburst(state, target) {
    toggleClass(target, 'igs-fx-sunburst-active', true);
    later(state, () => toggleClass(target, 'igs-fx-sunburst-active', false), SUNBURST_DURATION_MS + 80);
}

// 常驻演出同一方案重复调用幂等；方案（类型/分级/室内外/时段/强度）变化时整体重建。
// layer 为后景层（#igs-effect-layer），front 为前景层（#igs-effect-front-layer）；front 缺省时前景演出回落到后景层。
export function applyWeatherFx(layer, options = {}) {
    if (!layer) return { active: false, kind: '' };
    const settings = normalizeWeatherFxSettings(options.settings);
    const front = options.front || null;
    const plan = settings.enabled ? resolveWeatherFxPlan({ ...options, settings }) : null;
    if (!plan) {
        cancelWeatherFx(layer, front);
        return { active: false, kind: '' };
    }
    const motion = !hasReducedMotion(options);
    const signature = [plan.kind, plan.level, plan.scene, plan.time, plan.thunder, plan.wind, settings.intensity, motion].join('|');
    const result = (replayed) => ({ active: true, kind: plan.kind, intensity: settings.intensity, plan, replayed });
    const previous = activeStates.get(layer);
    if (previous && previous.signature === signature && previous.front === front) return result(false);
    if (previous) clearState(layer, previous);
    else { clearLayer(layer); if (front) clearLayer(front); }

    setFxAttrs(layer, plan, settings.intensity, motion);
    if (front) setFxAttrs(front, plan, settings.intensity, motion);
    const state = {
        signature,
        front,
        stopped: false,
        timers: new Set(),
        particles: null,
        schedule: typeof options.schedule === 'function' ? options.schedule : (fn, delay) => setTimeout(fn, delay),
        clear: typeof options.clear === 'function' ? options.clear : (timer) => clearTimeout(timer),
        random: typeof options.random === 'function' ? options.random : Math.random,
    };
    activeStates.set(layer, state);
    if (!motion) return result(false);

    const startParticles = options.particles === false ? null : typeof options.particles === 'function' ? options.particles : startWeatherParticles;
    if (plan.particles && startParticles) {
        state.particles = startParticles({ back: layer, front, plan, intensity: settings.intensity, random: state.random }) || null;
    }
    const target = front || layer;
    if (plan.thunder) scheduleLightning(state, target, plan, true);
    const sunburst = plan.kind === 'sun' && plan.scene === 'outdoor' && !NIGHT_TIMES.includes(plan.time);
    if (sunburst) playSunburst(state, target);
    return result(sunburst);
}
