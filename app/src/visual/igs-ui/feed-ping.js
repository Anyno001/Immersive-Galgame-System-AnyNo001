import { createSynthPartial as p, playSynthPartials } from './chat-sfx.js';
import { normalizeFxSoundSettings } from './fx-settings.js';
import { isStageIdle } from './stage-pause.js';

// 社区手机提示音：手机首次亮出、或本页出现新帖时一声短音，按平台分四类音色（合成，不仿真实品牌）。
// 走演出音效的开关与音量（fxSound），再压低一档；快翻、静置暂停、偷看别人手机时不响，两次之间至少隔 FEED_PING_GAP_MS。
export const FEED_PING_GAP_MS = 1500;
const VOLUME_SCALE = 0.6;

export const FEED_PING_KINDS = Object.freeze(['soft', 'blip', 'wood', 'bell']);

// 平台 → 音色：私聊圈子轻柔，短帖信息流清脆，论坛类木质，新闻与购物明亮。偷看专用平台与纸面皮肤不响。
export const FEED_PING_BY_PLATFORM = Object.freeze({
    moments: 'soft', confess: 'soft',
    weibo: 'blip', xhs: 'blip', starnet: 'blip',
    tieba: 'wood', douban: 'wood', hupu: 'wood', zhihu: 'wood', review: 'wood',
    news: 'bell', shop: 'bell',
});

export const FEED_PING_PARTIALS = Object.freeze({
    soft: Object.freeze([
        p('sine', 784, 784, 0, 0.12, 0.5, { attack: 0.004 }),
        p('sine', 1175, 1175, 0.09, 0.2, 0.45, { attack: 0.004 }),
    ]),
    blip: Object.freeze([
        p('triangle', 1318, 1568, 0, 0.09, 0.45, { attack: 0.002, sweep: 1 }),
    ]),
    wood: Object.freeze([
        p('triangle', 880, 640, 0, 0.07, 0.55, { attack: 0.001, sweep: 1 }),
        p('sine', 440, 400, 0, 0.09, 0.3, { attack: 0.001, sweep: 1 }),
    ]),
    bell: Object.freeze([
        p('sine', 1046, 1046, 0, 0.1, 0.4, { attack: 0.003 }),
        p('sine', 1318, 1318, 0.08, 0.1, 0.4, { attack: 0.003 }),
        p('sine', 1568, 1568, 0.16, 0.2, 0.4, { attack: 0.003 }),
    ]),
});

export function feedPingKind(platformId) {
    return FEED_PING_BY_PLATFORM[platformId] || '';
}

// 纯函数：这一刻要不要响。appeared = 手机刚亮出，fresh = 本页有新帖，newPage = 换了一页。
export function shouldFeedPing({ kind, appeared, fresh, newPage, skipping, idle, last, now, gap = FEED_PING_GAP_MS } = {}) {
    if (!kind || skipping === true || idle === true) return false;
    if (!(appeared || (fresh && newPage))) return false;
    return !(Number.isFinite(last) && Number.isFinite(now) && now - last >= 0 && now - last < gap);
}

// 播一声，返回是否真的响了（开关关、音量 0、无音频环境都返回 false）。
export function playFeedPing(kind, soundSettings) {
    const partials = FEED_PING_PARTIALS[kind];
    const sound = normalizeFxSoundSettings(soundSettings);
    if (!partials || sound.enabled === false || !(sound.volume > 0)) return false;
    try {
        return Boolean(playSynthPartials(partials, { volume: sound.volume * VOLUME_SCALE }));
    } catch {
        return false;
    }
}

export function feedStageIdle(target) {
    return isStageIdle(target);
}
