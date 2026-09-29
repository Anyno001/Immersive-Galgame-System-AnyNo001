// 获得物品演出的渲染适配：reader-dom-render 每次渲染调用一次。
// 关闭时只清理曾挂过的演出；同一页重绘不重播，只把后到的物品图替换进占位。
// 音效沿用演出音效设置（fxSound），强调色沿用漫画演出的主题取色（pickFxAccent）；古代背景（_ancientEra）换宣纸朱印皮。
import { planItemFx, normalizeItemFxSettings } from './fx-item-model.js';
import { applyItemFxToDom, refreshItemFxImages, cancelItemFx, settleItemFx } from './fx-item.js';
import { normalizeFxSoundSettings } from './fx-settings.js';
import { playFxSfx } from './fx-sfx.js';
import { pickFxAccent } from './fx-symbols.js';
import { prefersReducedMotion } from './reduced-motion.js';

const mountedRoots = new WeakSet();

function pageKindOf(content) {
    if (content.chatPage === true) return 'chat';
    if (content.htmlCardPage === true) return 'card';
    return 'text';
}

export function renderItemFx(root, snapshot, ctx = {}) {
    if (!root || !snapshot) return { played: false, reason: 'empty' };
    const readerSettings = snapshot.readerSettings || {};
    if (!normalizeItemFxSettings(readerSettings.itemFx).enabled) {
        if (mountedRoots.has(root)) { cancelItemFx(root); mountedRoots.delete(root); }
        return { played: false, reason: 'disabled' };
    }
    const content = snapshot.content || {};
    const resolveImage = typeof ctx.resolveItemImage === 'function' ? ctx.resolveItemImage : () => '';
    const identity = {
        chatId: snapshot.chatId || ctx.chatId || '',
        messageId: snapshot.messageId,
        swipeId: snapshot.swipeId || 0,
        page: content.currentIndex,
    };
    const plan = planItemFx(content.fx, {
        settings: readerSettings.itemFx,
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
        onCard: (card) => play(`item-${card.action}`),
        onShowcase: () => play('item-rare'),
    });
    if (result.played) mountedRoots.add(root);
    else if (result.reason === 'same-page') refreshItemFxImages(root, identity, resolveImage);
    return result;
}
