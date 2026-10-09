import { FEED_PLATFORMS, FEED_PLATFORM_IDS, STORM_DEFAULT_PROMPT, feedPlatformById, feedPlatformsForWorldview } from '../../scene/feed-platforms.js';

// 手机社区设置 readerSettings.feedFx：
// enabled 总开关（默认关，演出档位第 3 档打开）；muteOnNsfw NSFW 场景收起；
// platforms[id] = { enabled, prompt }：平台开关（默认全开）与自定义写法（留空或与默认相同即用默认）；
// worldview 由 applyFxWorldview 按当前世界观写入（只在快照里，不存档）。
const PROMPT_MAX = 400;

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalizeFeedFxSettings(value) {
    const src = plain(value);
    const raw = plain(src.platforms);
    const platforms = {};
    for (const p of FEED_PLATFORMS) {
        const one = plain(raw[p.id]);
        const prompt = String(one.prompt || '').trim().slice(0, PROMPT_MAX);
        platforms[p.id] = { enabled: one.enabled !== false, prompt: prompt === p.prompt ? '' : prompt };
    }
    const storm = plain(src.storm);
    const stormPrompt = String(storm.prompt || '').trim().slice(0, PROMPT_MAX);
    const out = {
        enabled: src.enabled === true,
        muteOnNsfw: src.muteOnNsfw !== false,
        storm: { enabled: storm.enabled !== false, prompt: stormPrompt === STORM_DEFAULT_PROMPT ? '' : stormPrompt },
        platforms,
    };
    if (typeof src.worldview === 'string' && src.worldview) out.worldview = src.worldview;
    // 随身手机：由 applyFxWorldview 按角色卡设置写入（只在快照里，不存档）。
    if (src.carryPhone === true) out.carryPhone = true;
    return out;
}

// 平台当前生效的写法：自定义优先，否则默认。
export function feedPlatformPrompt(settings, id) {
    const p = feedPlatformById(id);
    if (!p) return '';
    const own = settings && settings.platforms && settings.platforms[id];
    return (own && own.prompt) || p.prompt;
}

// 舆论风暴当前生效的写法：自定义优先，否则默认。
export function stormPromptOf(settings) {
    return (settings && settings.storm && settings.storm.prompt) || STORM_DEFAULT_PROMPT;
}

// 当前世界观下开着的平台。
export function activeFeedPlatforms(settings) {
    const s = settings && settings.platforms ? settings : normalizeFeedFxSettings(settings);
    return feedPlatformsForWorldview(s.worldview, s.carryPhone === true).filter((p) => s.platforms[p.id] && s.platforms[p.id].enabled);
}

export function isFeedPlatformId(id) {
    return FEED_PLATFORM_IDS.includes(String(id || ''));
}
