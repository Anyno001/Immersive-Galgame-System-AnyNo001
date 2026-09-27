import { resolveWeatherFxKind, resolveWeatherFxTime } from '../igs-ui/weather-fx-runtime.js';

// 关键帧：[时, 压暗色, 压暗强度, 暖光色, 暖光强度, 亮度, 饱和度, 灯光]；相邻关键帧线性插值，24 点回到 0 点。
const KEYFRAMES = Object.freeze([
    [0, [18, 24, 60], 0.7, [0, 0, 0], 0, 0.8, 0.55, 1],
    [4.5, [26, 32, 72], 0.66, [0, 0, 0], 0, 0.82, 0.6, 1],
    [6, [110, 96, 160], 0.36, [255, 160, 110], 0.26, 0.92, 0.8, 0.5],
    [7.5, [150, 140, 170], 0.06, [255, 210, 160], 0.14, 1, 0.95, 0.08],
    [9, [0, 0, 0], 0, [255, 236, 200], 0.05, 1, 1, 0],
    [15.5, [0, 0, 0], 0, [255, 220, 170], 0.08, 1, 1, 0],
    [17.5, [120, 80, 110], 0.22, [255, 140, 70], 0.32, 0.96, 0.92, 0.3],
    [18.8, [60, 50, 100], 0.44, [255, 110, 70], 0.2, 0.88, 0.8, 0.75],
    [20, [22, 30, 72], 0.64, [0, 0, 0], 0, 0.83, 0.65, 1],
    [24, [18, 24, 60], 0.7, [0, 0, 0], 0, 0.8, 0.55, 1],
]);
const BUCKET_HOURS = Object.freeze({ dawn: 6.3, day: 12, dusk: 18, night: 21, midnight: 0.5 });
const LEVEL_SCALE = Object.freeze({ light: 0.6, medium: 1, heavy: 1.35 });
const HEAVY = /暴|大|倾盆|瓢泼|狂|猛|浓|密|heavy|storm|dense/i;
const LIGHT = /小|细|毛毛|微|薄|零星|轻|淡|light|drizzle|slight/i;

const lerp = (a, b, t) => a + (b - a) * t;
const rgba = (rgb, alpha) => `rgba(${rgb.map(Math.round).join(',')},${Math.round(alpha * 1000) / 1000})`;
const round = value => Math.round(value * 1000) / 1000;

// 未写时间时返回 null，由调用方决定默认时段；HH:MM 优先于“黄昏”等时段词，以便连续过渡。
export function resolveMapHour(time) {
    const text = String(time ?? '').trim();
    if (!text) return null;
    const clock = text.match(/(\d{1,2})\s*[:：点时]\s*(\d{1,2})?/);
    if (clock) {
        const hour = Number(clock[1]);
        const minute = Math.min(59, Number(clock[2] || 0));
        if (hour <= 24) {
            const pm = /下午|傍晚|晚上|夜里|pm/i.test(text) && hour < 12;
            return ((pm ? hour + 12 : hour) % 24) + minute / 60;
        }
    }
    const bucket = resolveWeatherFxTime(text);
    return bucket ? BUCKET_HOURS[bucket] : null;
}

export function resolveMapLighting(options = {}) {
    const hour = resolveMapHour(options.time) ?? options.defaultHour ?? 12;
    let k = 0;
    while (k < KEYFRAMES.length - 2 && KEYFRAMES[k + 1][0] <= hour) k++;
    const a = KEYFRAMES[k];
    const b = KEYFRAMES[k + 1];
    const t = (hour - a[0]) / (b[0] - a[0] || 1);
    const tint = a[1].map((c, i) => lerp(c, b[1][i], t));
    const warm = (a[4] ? a[3] : b[3]).map((c, i) => lerp(c, (b[4] ? b[3] : a[3])[i], t));
    const tintAlpha = lerp(a[2], b[2], t);
    const warmAlpha = lerp(a[4], b[4], t);
    let brightness = lerp(a[5], b[5], t);
    let saturate = lerp(a[6], b[6], t);
    let lights = lerp(a[7], b[7], t);

    const weatherText = String(options.weather ?? '');
    const kind = resolveWeatherFxKind(weatherText);
    const level = HEAVY.test(weatherText) ? 'heavy' : LIGHT.test(weatherText) ? 'light' : 'medium';
    const s = LEVEL_SCALE[level];
    let gray = 0;
    let clouds = 0;
    let fog = 0;
    let snow = 0;
    let dust = 0;
    if (kind === 'cloud') { saturate *= 1 - 0.18 * s; brightness *= 1 - 0.06 * s; gray = 0.18 * s; clouds = 0.32 * s; }
    if (kind === 'rain') { saturate *= 1 - 0.3 * s; brightness *= 1 - 0.12 * s; gray = 0.3 * s; clouds = 0.42 * s; if (lights > 0.05) lights = Math.min(1, lights + 0.2); }
    if (kind === 'snow') { saturate *= 1 - 0.3 * s; snow = 0.22 * s; clouds = 0.2 * s; }
    if (kind === 'fog') { saturate *= 1 - 0.25 * s; fog = 0.5 * s; }
    if (kind === 'sand') { saturate *= 1 - 0.2 * s; dust = 0.3 * s; fog = 0.25 * s; }
    if (kind === 'wind') clouds = 0.22 * s;
    if (kind === 'sun') saturate *= 1.06;
    return {
        hour: round(hour), kind, level,
        filter: `brightness(${round(brightness)}) saturate(${round(saturate)})`,
        tint: tintAlpha > 0.005 ? rgba(tint, tintAlpha) : '',
        warm: warmAlpha > 0.005 ? rgba(warm, warmAlpha) : '',
        gray: gray ? rgba([128, 132, 142], Math.min(0.5, gray)) : '',
        dust: dust ? rgba([214, 170, 110], Math.min(0.5, dust)) : '',
        lights: round(Math.min(1, lights)),
        clouds: round(Math.min(0.6, clouds)),
        fog: round(Math.min(0.7, fog)),
        snow: round(Math.min(0.4, snow)),
    };
}
