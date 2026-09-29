// 获得物品演出的纯模型：设置规范化、卡片规划与身份校验；不操作 DOM、不联网。
// 图片只经注入的 resolveImage(name) 同步读取本地缓存，未就绪时卡片标记占位。
export const ITEM_FX_ACTION_LABELS = Object.freeze({ gain: '获得', lose: '失去', use: '使用' });

export function normalizeItemFxSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return { enabled: src.enabled === true };
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
        };
    }).filter((card) => card.name);
    if (!cards.length) return empty;
    // 每页只给第一件「重要」的获得物品做中央大演出，其余重要物品只在卡片上加强调。
    const showcase = cards.find((card) => card.rare && card.action === 'gain') || null;
    return {
        cards,
        overflowText: itemOverflowText(fx.itemOverflow),
        identity: identity ? { ...identity } : null,
        showcase,
        lifeMs: itemFxLifeMs(cards),
    };
}
