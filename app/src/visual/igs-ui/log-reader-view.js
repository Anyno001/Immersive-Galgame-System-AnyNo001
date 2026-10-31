import { renderDialogueHtml, resolveActiveTheme } from './settings-normalize.js';
import { normalizeBilingualSettings, renderBilingualHtml, resolveBilingualDisplay } from './bilingual-text.js';
import { ITEM_FX_ACTION_LABELS, normalizeItemFxSettings } from './fx-item-model.js';
import { normalizeFxTagsSettings } from './fx-settings.js';
import { normalizeLogReaderSettings } from './log-reader-settings.js';
import { magicHouseFor } from './dialog-theme-css-skins.js';
import { LOG_READER_THEMES, resolveLogSkin } from './log-reader-theme.js';

const off = (value) => ({ ...(value && typeof value === 'object' ? value : {}), enabled: false });

// log 模式的渲染副本：不出立绘、同屏、漫画泡、运镜、立绘碰撞、物品大卡、来电大窗、换场景过场与地点标题卡（列表里有分隔线，背景直接切）；打字机不跑（出字交给 log 层）。
// 只换顶层与 readerSettings 的浅拷贝，不改共享的快照与设置。
export function logRenderSnapshot(snapshot) {
    const rs = snapshot.readerSettings || {};
    const fxTags = rs.fxTags && typeof rs.fxTags === 'object' ? { ...rs.fxTags, clash: false, call: false } : rs.fxTags;
    return {
        ...snapshot,
        content: {
            ...snapshot.content,
            spriteImage: null, spriteLive2d: null, pendingSpriteRef: '', castSprites: [], pendingCastRefs: [],
            giantSprite: null, creatureFoePin: '', nsfwCgPortrait: '', speakerCastOrder: null,
        },
        readerSettings: {
            ...rs,
            stageCast: off(rs.stageCast), comicMode: off(rs.comicMode), camera: off(rs.camera), cameraPackFx: off(rs.cameraPackFx),
            itemFx: off(rs.itemFx), sceneTransition: off(rs.sceneTransition), titleCard: off(rs.titleCard), typewriter: off(rs.typewriter), fxTags,
        },
    };
}

export function logSkinOf(readerSettings) {
    const rs = readerSettings || {};
    const base = resolveLogSkin(rs.dialogSkin);
    const skin = base === 'magic-academy' && magicHouseFor(rs.magicHouse, rs._worldview) === 'obsidian' ? 'magic-academy-obsidian' : base;
    return { skin, tone: LOG_READER_THEMES[skin].tone };
}

// 字体跟随主题；字号按阅读器字号缩到手机尺寸（默认 18 → 15）。
export function logFontsOf(snapshot) {
    const theme = resolveActiveTheme(snapshot);
    const font = (value) => (value && value !== 'inherit' ? value : '');
    const size = Number(snapshot.readerSettings && snapshot.readerSettings.fontSize) || 18;
    return { text: font(theme.textFont), name: font(theme.nameFont), narration: font(theme.narrationFont), size: `${Math.max(13, Math.min(20, Math.round(size * 0.84 * 2) / 2))}px` };
}

// 正文 HTML：与对话框同一套心里话样式和双语注音，不带文字演出与物品点亮（列表里只读）。
export function createLogHtml(snapshot) {
    const rs = snapshot.readerSettings || {};
    const theme = resolveActiveTheme(snapshot);
    const sceneAssetsOn = Boolean(rs._sceneAssets && rs._sceneAssets.enabled);
    const display = resolveBilingualDisplay(rs.bilingual, rs._bilingualDisplay);
    const layout = normalizeBilingualSettings(rs.bilingual).layout;
    return (row) => renderBilingualHtml(renderDialogueHtml(row.text, theme, sceneAssetsOn), display, layout);
}

// 物品与来电：列表里的小卡片，开关沿用原演出的设置。
export function logCardsOf(page, readerSettings) {
    const fx = page && page.fx;
    if (!fx) return [];
    const cards = [];
    if (normalizeItemFxSettings(readerSettings && readerSettings.itemFx).enabled) {
        for (const item of fx.items || []) {
            if (!item || !item.name) continue;
            cards.push({ head: ITEM_FX_ACTION_LABELS[item.action] || ITEM_FX_ACTION_LABELS.gain, name: item.name, note: item.description || '' });
        }
    }
    const tags = normalizeFxTagsSettings(readerSettings && readerSettings.fxTags);
    if (tags.enabled && tags.call) {
        for (const instant of fx.instants || []) {
            if (!instant || instant.kind !== 'call' || !instant.name) continue;
            const video = instant.mode === 'video';
            cards.push({ head: instant.dir === 'out' ? (video ? '视频通话' : '拨出电话') : (video ? '视频来电' : '来电'), name: instant.name, note: '' });
        }
    }
    return cards;
}

// 关了连续播放：每批只有一条。
export function logSettingsOf(readerSettings) {
    const s = normalizeLogReaderSettings(readerSettings && readerSettings.logReader);
    return s.chain ? s : { ...s, perTap: 1 };
}
