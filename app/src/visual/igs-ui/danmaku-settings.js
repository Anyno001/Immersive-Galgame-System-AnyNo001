import { normalizeEmotionList } from './stage-shake-runtime.js';

// 弹幕三件套，各自一个顶层开关以便挂进演出档位：
// liveFx 直播间（掏出手机看 B 站直播）、audienceFx 观众弹幕（HUD 下方小手机，点开看）、innerFx 内心弹幕（情绪触发的纯演出）。
export const DANMAKU_FEATURE_KEYS = Object.freeze(['liveFx', 'audienceFx', 'innerFx']);
export const DANMAKU_PERSONAS = Object.freeze(['melon', 'cp', 'fan', 'roast', 'custom']);
export const DANMAKU_PERSONA_LABELS = Object.freeze({
    melon: '吃瓜群众', cp: 'CP 粉', fan: '老粉考据党', roast: '毒舌吐槽役', custom: '自定义',
});
export const DANMAKU_PERSONA_PROMPTS = Object.freeze({
    melon: '看热闹不嫌事大的吃瓜群众，爱起哄、玩梗、发“哈哈哈”和问号',
    cp: '嗑 CP 嗑疯了的 CP 粉，一点暧昧就尖叫“awsl”“好甜”“民政局我搬来了”',
    fan: '追了很久的老粉兼考据党，会翻前情、找伏笔、给角色说好话',
    roast: '嘴毒但不恶意的吐槽役，专挑剧情槽点和角色的迷惑行为吐槽',
});
export const DANMAKU_DENSITIES = Object.freeze(['sparse', 'medium', 'dense']);
export const DANMAKU_SPEEDS = Object.freeze(['slow', 'medium', 'fast']);
export const DANMAKU_ENTRY_SIZES = Object.freeze(['small', 'medium', 'large']);
// 滚动弹幕横穿视频窗的时长（秒），与 B 站一样按统一时长走，长弹幕自然更快。
export const DANMAKU_SPEED_SECONDS = Object.freeze({ slow: 9, medium: 7, fast: 5 });
export const INNER_DANMAKU_MOODS = Object.freeze(['love', 'panic', 'anger', 'guilty']);
export const INNER_DANMAKU_MOOD_LABELS = Object.freeze({ love: '心动', panic: '慌乱', anger: '生气', guilty: '心虚' });
// 内心弹幕样式：burst 在立绘头部周围冒出后一起碎掉（原样式，默认）；fly 沿轨道从右往左横飞穿过舞台上部。
export const INNER_DANMAKU_STYLES = Object.freeze(['burst', 'fly']);
export const INNER_DANMAKU_STYLE_LABELS = Object.freeze({ burst: '爆发', fly: '横飞' });
// 直播间形态：phone 掏出手机看竖屏直播（原样式，默认）；full 直接铺满舞台的全屏直播。
export const LIVE_LAYOUTS = Object.freeze(['phone', 'full']);
// 直播弹幕：roll 左下角列表向上翻滚（默认）；fly 沿轨道横飞穿过画面；both 两者同时。
export const LIVE_CHAT_MODES = Object.freeze(['roll', 'fly', 'both']);

const freezeList = (list) => Object.freeze(list.slice());

export const INNER_DANMAKU_DEFAULT_EMOTIONS = Object.freeze({
    love: freezeList(['心动', '害羞', '脸红', '羞涩', '心跳加速', '小鹿乱撞', '甜蜜']),
    panic: freezeList(['慌张', '慌乱', '紧张', '手足无措', '惊慌', '不知所措']),
    anger: freezeList(['生气', '恼火', '气愤', '炸毛', '不爽']),
    guilty: freezeList(['心虚', '尴尬', '窘迫', '局促', '做贼心虚']),
});

// 可编辑词表路径白名单，挂进 fx-word 设置动作。
export const DANMAKU_WORD_LIST_PATHS = Object.freeze(INNER_DANMAKU_MOODS.map((mood) => `innerFx.${mood}`));

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function pick(list, value, fallback) {
    return list.includes(value) ? value : fallback;
}

export function normalizeLiveFxSettings(value) {
    const src = plain(value);
    return {
        enabled: src.enabled === true,
        muteOnNsfw: src.muteOnNsfw !== false,
        layout: pick(LIVE_LAYOUTS, src.layout, 'phone'),
        chat: pick(LIVE_CHAT_MODES, src.chat, 'roll'),
        // 跟随对话框主题：沿用线上交流的主题色板（默认关，保持 B 站深色）。
        followTheme: src.followTheme === true,
    };
}

export function normalizeAudienceFxSettings(value) {
    const src = plain(value);
    return {
        enabled: src.enabled === true,
        persona: pick(DANMAKU_PERSONAS, src.persona, 'melon'),
        customPersona: String(src.customPersona || '').trim().slice(0, 120),
        density: pick(DANMAKU_DENSITIES, src.density, 'medium'),
        speed: pick(DANMAKU_SPEEDS, src.speed, 'medium'),
        entrySize: pick(DANMAKU_ENTRY_SIZES, src.entrySize, 'medium'),
        ambient: src.ambient !== false,
        muteOnNsfw: src.muteOnNsfw !== false,
    };
}

export function normalizeInnerFxSettings(value) {
    const src = plain(value);
    const out = {
        enabled: src.enabled === true,
        useThought: src.useThought !== false,
        style: pick(INNER_DANMAKU_STYLES, src.style, 'burst'),
    };
    for (const mood of INNER_DANMAKU_MOODS) out[mood] = normalizeEmotionList(src[mood], INNER_DANMAKU_DEFAULT_EMOTIONS[mood]);
    return out;
}

export const DANMAKU_SETTINGS_NORMALIZERS = Object.freeze({
    liveFx: normalizeLiveFxSettings,
    audienceFx: normalizeAudienceFxSettings,
    innerFx: normalizeInnerFxSettings,
});

// 从整份 readerSettings 取出弹幕三件套。
export function normalizeDanmakuSettings(reader) {
    const src = plain(reader);
    return {
        live: normalizeLiveFxSettings(src.liveFx),
        audience: normalizeAudienceFxSettings(src.audienceFx),
        inner: normalizeInnerFxSettings(src.innerFx),
    };
}

export function isDanmakuActive(settings) {
    return settings.live.enabled || settings.audience.enabled || settings.inner.enabled;
}

export function pickInnerMood(emotion, inner) {
    const target = String(emotion == null ? '' : emotion).trim();
    if (!inner.enabled || !target) return '';
    return INNER_DANMAKU_MOODS.find((mood) => inner[mood].includes(target)) || '';
}

export function resolveAudiencePersona(audience) {
    if (audience.persona === 'custom') return audience.customPersona || DANMAKU_PERSONA_PROMPTS.melon;
    return DANMAKU_PERSONA_PROMPTS[audience.persona] || DANMAKU_PERSONA_PROMPTS.melon;
}
