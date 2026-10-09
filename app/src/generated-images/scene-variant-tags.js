// 场景时间/天气差分：不写词，拿场景原图的提示词，去掉里面原有的时间天气词，把目标时间天气的英文标签放最前。
// 中文名按子串命中，先具体后泛化；都不中就用原名，插件模型多少能认一些。

import { TIME_WORDS } from '../scene/time-bucket.js';
import { SCENE_DICTIONARY } from './prompt-registry.js';

const TIME_TAGS = SCENE_DICTIONARY.variantTime;

const TIME_RULES = TIME_WORDS.map(([key, , words]) => [words, TIME_TAGS[key]]);

const WEATHER_RULES = SCENE_DICTIONARY.variantWeather;

const STRIP = new Set([
    'day', 'daytime', 'daylight', 'night', 'nighttime', 'night sky', 'midnight', 'evening', 'morning', 'afternoon', 'noon',
    'dawn', 'dusk', 'sunset', 'sunrise', 'twilight', 'golden hour', 'moonlight', 'moon', 'starry sky', 'stars', 'blue sky',
    'orange sky', 'sunlight', 'sunbeam', 'light rays', 'bright', 'dark', 'dim lighting',
    'rain', 'raining', 'rainy', 'heavy rain', 'snow', 'snowing', 'snowflakes', 'fog', 'foggy', 'misty', 'mist', 'cloudy',
    'overcast', 'clear sky', 'sunny', 'thunderstorm', 'lightning', 'storm', 'wet ground', 'puddle', 'windy',
]);

// 原图提示词里第一个光照词定它属于哪档；差分把目标标签放在最前，所以差分图也认得准。都没有按白天算。
const PROMPT_TIME = [
    ['夜晚', ['night', 'nighttime', 'night sky', 'midnight', 'moonlight', 'starry sky']],
    ['黄昏', ['sunset', 'dusk', 'evening', 'twilight', 'golden hour', 'orange sky']],
    ['清晨', ['morning', 'sunrise', 'dawn']],
    ['白天', ['day', 'daytime', 'daylight', 'noon', 'afternoon', 'blue sky']],
];

function bareTag(item) {
    return item.replace(/^[\d.]+::|::$/g, '').replace(/^[{[(]+|[}\])]+$/g, '').trim().toLowerCase();
}

export function promptTimeBucket(text) {
    for (const item of String(text || '').split(',')) {
        const tag = bareTag(item.trim());
        const hit = tag && PROMPT_TIME.find(([, tags]) => tags.includes(tag));
        if (hit) return hit[0];
    }
    return '白天';
}

function ruleTags(rules, label) {
    const text = String(label || '').trim().toLowerCase();
    if (!text) return '';
    const hit = rules.find(([words]) => words.some((word) => text.includes(word)));
    return hit ? hit[1] : text;
}

export function sceneVariantTags(time, weather) {
    return [ruleTags(TIME_RULES, time), ruleTags(WEATHER_RULES, weather)].filter(Boolean).join(', ');
}

export function applySceneVariantTags(text, tags) {
    const kept = String(text || '').split(',').map((item) => item.trim()).filter((item) => {
        return item && !STRIP.has(bareTag(item));
    });
    return [tags, ...kept].filter(Boolean).join(', ');
}

// 存下的提示词有结构化 caption 就用它，没有就把正负文本当场景段。
export function sceneVariantCaption(stored, tags) {
    const source = stored && stored.caption && stored.caption.v4_prompt
        ? JSON.parse(JSON.stringify(stored.caption))
        : {
            v4_prompt: { caption: { base_caption: String((stored && stored.positive) || ''), char_captions: [] } },
            v4_negative_prompt: { caption: { base_caption: String((stored && stored.negative) || ''), char_captions: [] } },
        };
    const cap = source.v4_prompt.caption;
    if (!String(cap.base_caption || '').trim()) return null;
    cap.base_caption = applySceneVariantTags(cap.base_caption, tags);
    return source;
}
