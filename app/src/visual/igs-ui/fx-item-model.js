// 获得物品演出的纯模型：设置规范化、卡片规划与身份校验；不操作 DOM、不联网。
// 图片只经注入的 resolveImage(name) 同步读取本地缓存，未就绪时卡片标记占位。
import { normalizeItemName } from '../../data/shujuku/item-catalog.js';
import { FX_ITEM_PAGE_MAX } from '../../scene/fx-directives.js';

export const ITEM_FX_ACTION_LABELS = Object.freeze({ gain: '获得', lose: '失去', use: '使用', view: '持有', eat: '吃掉', drink: '喝掉' });
// 一页里最多两件物品走中央演出，其余进角落卡片。
const SHOWCASE_MAX = 2;

export function normalizeItemFxSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return { enabled: src.enabled === true, mention: src.mention !== false };
}

const identityPart = (value) => String(value == null ? '' : value);

// 演出身份：同一消息同一 swipe 同一页只播一次；图片后到时按此校验是否仍在该页。
export function itemFxIdentity({ chatId, messageId, swipeId, page } = {}) {
    return [chatId, messageId, Number(swipeId) || 0, page].map(identityPart).join('|');
}

export function isSameItemFxIdentity(a, b) {
    return Boolean(a) && Boolean(b) && itemFxIdentity(a) === itemFxIdentity(b);
}

// 停留时长随卡片数与描述长度伸缩：单件短描述约 2.4 秒，最长 6.5 秒；不含逐张弹出与退场。
const LIFE_BASE_MS = 2400;
const LIFE_PER_CARD_MS = 600;
const LIFE_PER_CHAR_MS = 45;
const LIFE_MAX_MS = 6500;

export function itemFxLifeMs(cards) {
    const list = Array.isArray(cards) ? cards : [];
    if (!list.length) return 0;
    const chars = list.reduce((sum, card) => sum + String(card && card.description || '').length, 0);
    return Math.min(LIFE_MAX_MS, LIFE_BASE_MS + LIFE_PER_CARD_MS * (list.length - 1) + LIFE_PER_CHAR_MS * chars);
}

export function itemOverflowText(count) {
    const n = Math.trunc(Number(count));
    return Number.isFinite(n) && n > 0 ? `等 ${n} 件` : '';
}

// fx 为 resolveFxAtPage / filterFxByKinds 的结果；未开启、NSFW、聊天页或卡片页时返回空计划。
export function planItemFx(fx, { settings, identity, resolveImage, nsfw = false, pageKind = 'text' } = {}) {
    const empty = { cards: [], overflowText: '', identity: null, showcase: null, lifeMs: 0 };
    if (!normalizeItemFxSettings(settings).enabled || nsfw || pageKind !== 'text') return empty;
    const items = fx && Array.isArray(fx.items) ? fx.items : [];
    if (!items.length) return empty;
    const lookup = typeof resolveImage === 'function' ? resolveImage : () => '';
    const cards = items.map((item) => {
        const name = String(item && item.name || '').trim();
        let imageUrl = '';
        try { imageUrl = String(lookup(name) || ''); } catch (error) { imageUrl = ''; }
        return {
            name,
            action: Object.hasOwn(ITEM_FX_ACTION_LABELS, item.action) ? item.action : 'gain',
            actionLabel: ITEM_FX_ACTION_LABELS[item.action] || ITEM_FX_ACTION_LABELS.gain,
            description: String(item && item.description || '').trim(),
            imageUrl,
            placeholder: !imageUrl,
            rare: item.rarity === 'rare',
            // 账本判定：true 为本楼初次获得，false 为再次提及，undefined 为没有账本（退回按「重要」判定）。
            first: typeof item.first === 'boolean' ? item.first : undefined,
        };
    }).filter((card) => card.name);
    if (!cards.length) return empty;
    // 初次获得的物品走中央完整演出；再次提及、失去、使用进右上角卡片。没有账本时沿用旧规则：只给「重要」物品做中央演出。
    const showcases = cards.filter((card) => card.action === 'gain' && (card.first === true || (card.first === undefined && card.rare))).slice(0, SHOWCASE_MAX);
    const stackCards = cards.filter((card) => !showcases.includes(card));
    return {
        cards,
        stackCards,
        overflowText: itemOverflowText(fx.itemOverflow),
        identity: identity ? { ...identity } : null,
        showcase: showcases[0] || null,
        showcases,
        lifeMs: itemFxLifeMs(stackCards),
    };
}

// 中央演出停留：随描述长度伸缩，点击可提前结束。
export function itemShowcaseHoldMs(card) {
    return Math.min(5200, 2800 + 40 * String(card && card.description || '').length);
}

// 物品表变动补成的事件：挂在正文首次提到该物品的页（找不到就挂第 1 页）。
// 表格常在翻过几页后才更新：目标页已翻过的事件在当前页补播一次（shown 记已播过的）。本楼 AI 已写标签的物品不重复。
export function mergeItemEvents(fx, { events, segments, index, tagNames, shown, floorKey = '' } = {}) {
    if (!fx || !Array.isArray(fx.items) || !Array.isArray(events) || !events.length) return fx;
    const pages = Array.isArray(segments) ? segments.map((segment) => String(segment || '')) : [];
    const skip = tagNames instanceof Set ? tagNames : new Set();
    const played = shown instanceof Set ? shown : new Set();
    for (const event of events) {
        const key = normalizeItemName(event && event.name);
        if (!key || skip.has(key)) continue;
        const found = pages.findIndex((text) => text.includes(event.name));
        const target = found >= 0 ? found : 0;
        const mark = `${floorKey}|${event.action}|${key}`;
        if (target > index || (target < index && played.has(mark))) continue;
        played.add(mark);
        if (fx.items.some((item) => normalizeItemName(item.name) === key)) continue;
        if (fx.items.length < FX_ITEM_PAGE_MAX) fx.items.push({ action: event.action, name: event.name, description: event.description || '' });
        else fx.itemOverflow = (fx.itemOverflow || 0) + 1;
    }
    return fx;
}
