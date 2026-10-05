// 获得物品演出的渲染适配：reader-dom-render 每次渲染调用一次。
// 关闭时只清理曾挂过的演出；同一页重绘不重播，只把后到的物品图替换进占位。
// 音效沿用演出音效设置（fxSound），强调色沿用漫画演出的主题取色（pickFxAccent）；古代背景（_ancientEra）换宣纸朱印皮。
import { planItemFx, normalizeItemFxSettings } from './fx-item-model.js';
import { applyItemFxToDom, refreshItemFxImages, cancelItemFx, settleItemFx, showItemCard } from './fx-item.js';
import { normalizeFxSoundSettings } from './fx-settings.js';
import { playFxSfx } from './fx-sfx.js';
import { pickFxAccent } from './fx-symbols.js';
import { prefersReducedMotion } from './reduced-motion.js';

const mountedRoots = new WeakSet();
const EAT_ACTIONS = new Set(['eat', 'drink']);

function pageKindOf(content) {
    if (content.chatPage === true) return 'chat';
    if (content.htmlCardPage === true) return 'card';
    return 'text';
}

export function renderItemFx(root, snapshot, ctx = {}) {
    if (!root || !snapshot) return { played: false, reason: 'empty' };
    const readerSettings = snapshot.readerSettings || {};
    const content = snapshot.content || {};
    // 物品演出关着时，只有进食标签补来的吃掉 / 喝掉卡片照常显示（跟随日常演出里的「吃东西」）。
    const itemOn = normalizeItemFxSettings(readerSettings.itemFx).enabled;
    const eatOnly = !itemOn && content.fx && Array.isArray(content.fx.items) && content.fx.items.some((item) => EAT_ACTIONS.has(item && item.action));
    if (!itemOn && !eatOnly) {
        if (mountedRoots.has(root)) { cancelItemFx(root); mountedRoots.delete(root); }
        return { played: false, reason: 'disabled' };
    }
    const fx = eatOnly ? { ...content.fx, items: content.fx.items.filter((item) => EAT_ACTIONS.has(item && item.action)), itemOverflow: 0 } : content.fx;
    const resolveImage = typeof ctx.resolveItemImage === 'function' ? ctx.resolveItemImage : () => '';
    const identity = {
        chatId: snapshot.chatId || ctx.chatId || '',
        messageId: snapshot.messageId,
        swipeId: snapshot.swipeId || 0,
        page: content.currentIndex,
    };
    const plan = planItemFx(fx, {
        settings: eatOnly ? { enabled: true } : readerSettings.itemFx,
        identity,
        resolveImage,
        nsfw: content.sceneNsfw === true,
        pageKind: pageKindOf(content),
    });
    if (!plan.cards.length) {
        if (mountedRoots.has(root)) settleItemFx(root, identity);
        return { played: false, reason: 'no-items' };
    }
    let reducedMotion = false;
    try { reducedMotion = prefersReducedMotion(); } catch (error) { reducedMotion = false; }
    const sound = normalizeFxSoundSettings(readerSettings.fxSound);
    const play = typeof ctx.playSfx === 'function' ? ctx.playSfx : (kind) => playFxSfx(kind, sound, { audioScheduler: ctx.audioScheduler });
    let accent = '';
    try { accent = pickFxAccent(ctx.theme) || ''; } catch (error) { accent = ''; }
    const result = applyItemFxToDom(root, plan, {
        reducedMotion,
        schedule: ctx.schedule,
        clear: ctx.clear,
        accent,
        ancient: readerSettings._ancientEra === true,
        worldview: String(readerSettings._worldview || ''),
        onCard: (card) => play(EAT_ACTIONS.has(card.action) ? 'item-use' : `item-${card.action}`),
        onShowcase: () => play('item-rare'),
    });
    if (result.played) mountedRoots.add(root);
    else if (result.reason === 'same-page') refreshItemFxImages(root, identity, resolveImage);
    return result;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let mentionCache = { key: '', re: null };

// 正文点亮：已知物品名包一层可点的 span。只替换标签之间的文字（不进标签与属性），长名优先，不足 2 个字的名字不点亮。
export function applyItemMentionMarkup(html, mentions) {
    const source = String(html ?? '');
    const names = (Array.isArray(mentions) ? mentions : []).map((m) => String((m && m.name) || '').trim()).filter((name) => Array.from(name).length >= 2);
    if (!names.length) return source;
    const key = names.join('\u0000');
    if (mentionCache.key !== key) {
        const sorted = Array.from(new Set(names.map(escapeHtml))).sort((a, b) => b.length - a.length);
        mentionCache = { key, re: new RegExp(sorted.map(escapeRe).join('|'), 'g') };
    }
    const re = mentionCache.re;
    return source.split(/(<[^>]*>)/).map((part, index) => (index % 2 === 1 ? part
        : part.replace(re, (match) => `<span class="igs-item-mention" data-igs-item="${match}">${match}</span>`))).join('');
}

export function itemMentionsOf(snapshot) {
    const readerSettings = (snapshot && snapshot.readerSettings) || {};
    const settings = normalizeItemFxSettings(readerSettings.itemFx);
    const content = (snapshot && snapshot.content) || {};
    if (!settings.enabled || !settings.mention || content.chatPage === true || content.htmlCardPage === true) return null;
    return content.fx && Array.isArray(content.fx.itemMentions) ? content.fx.itemMentions : null;
}

// 点中点亮的物品名：右上角弹出这件物品的卡片（描述展开、不飞进背包）。
export function showItemMention(root, snapshot, name, ctx = {}) {
    const label = String(name || '').trim();
    const known = (itemMentionsOf(snapshot) || []).find((item) => item && item.name === label);
    if (!root || !known) return false;
    const readerSettings = (snapshot && snapshot.readerSettings) || {};
    const resolveImage = typeof ctx.resolveItemImage === 'function' ? ctx.resolveItemImage : () => '';
    let imageUrl = '';
    try { imageUrl = String(resolveImage(label) || ''); } catch (error) { imageUrl = ''; }
    let accent = '';
    try { accent = pickFxAccent(ctx.theme) || ''; } catch (error) { accent = ''; }
    return showItemCard(root, { name: label, description: known.description || '', imageUrl, placeholder: !imageUrl }, {
        schedule: ctx.schedule,
        clear: ctx.clear,
        accent,
        ancient: readerSettings._ancientEra === true,
        worldview: String(readerSettings._worldview || ''),
    });
}
