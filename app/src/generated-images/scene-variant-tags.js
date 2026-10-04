// 场景时间/天气差分：不写词，拿场景原图的提示词，去掉里面原有的时间天气词，把目标时间天气的英文标签放最前。
// 中文名按子串命中，先具体后泛化；都不中就用原名，插件模型多少能认一些。

const TIME_RULES = [
    [['深夜', '午夜', '凌晨', '半夜', 'midnight'], 'midnight, night, dark, moonlight, starry sky, dim lighting'],
    [['黄昏', '傍晚', '日落', '夕', 'dusk', 'evening', 'sunset'], 'sunset, dusk, orange sky, golden hour, long shadows'],
    [['清晨', '黎明', '拂晓', '早晨', '早上', '日出', '晨', 'dawn', 'morning', 'sunrise'], 'morning, sunrise, soft sunlight, pale sky, light mist'],
    [['夜', '晚', 'night'], 'night, night sky, moonlight, dark, artificial lighting'],
    [['白天', '白日', '日间', '上午', '中午', '正午', '下午', '午后', '午', 'day', 'noon', 'afternoon'], 'day, daylight, bright, blue sky'],
];

const WEATHER_RULES = [
    [['雷', '闪电', 'thunder', 'lightning'], 'thunderstorm, lightning, heavy rain, dark clouds'],
    [['暴雪', '雪', 'snow', 'blizzard'], 'snow, snowing, snowflakes, snow on ground'],
    [['雨', 'rain'], 'rain, raining, wet ground, overcast, puddle'],
    [['雾', 'fog', 'mist'], 'fog, misty, hazy, low visibility'],
    [['沙', '尘', 'sand', 'dust'], 'sandstorm, dust, hazy, yellow sky'],
    [['风', 'wind'], 'windy, wind, swaying trees, flying leaves'],
    [['阴', '云', 'cloud', 'overcast'], 'cloudy, overcast, grey sky'],
    [['晴', 'sun', 'clear'], 'sunny, clear sky, sunlight'],
];

const STRIP = new Set([
    'day', 'daytime', 'daylight', 'night', 'nighttime', 'night sky', 'midnight', 'evening', 'morning', 'afternoon', 'noon',
    'dawn', 'dusk', 'sunset', 'sunrise', 'twilight', 'golden hour', 'moonlight', 'moon', 'starry sky', 'stars', 'blue sky',
    'orange sky', 'sunlight', 'sunbeam', 'light rays', 'bright', 'dark', 'dim lighting',
    'rain', 'raining', 'rainy', 'heavy rain', 'snow', 'snowing', 'snowflakes', 'fog', 'foggy', 'misty', 'mist', 'cloudy',
    'overcast', 'clear sky', 'sunny', 'thunderstorm', 'lightning', 'storm', 'wet ground', 'puddle', 'windy',
]);

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
        const bare = item.replace(/^[\d.]+::|::$/g, '').replace(/^[{[(]+|[}\])]+$/g, '').trim().toLowerCase();
        return item && !STRIP.has(bare);
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
