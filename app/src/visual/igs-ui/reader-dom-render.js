import { magicHouseVars } from './dialog-theme-css-skins.js';
import { resolveSpeakerMagicHouse } from './magic-house.js';
import { normalizeSkinDialogScale } from './dialog-skin-frame.js';
import { RECORD_ICONS } from './record-icons.js';
import {
    ORIGINAL_READER_ICONS,
    ORIGINAL_READER_TOOLBAR_BUTTONS,
} from './original-reader-source.js';
import { DIALOG_ONLY_BUTTONS, TOOLBAR_ACTIONS } from './reader-host-constants.js';
import { normalizeDialogBarAlign, normalizeDialogBarButtons, normalizeToolbarSplit } from './settings-normalize.js';
import {
    ensureImageLoadingSpinner,
    ensureImageEmptyPlaceholder,
    getOwnerWindow,
    readElementHeight,
    readElementWidth,
    removeImageEmptyPlaceholder,
    removeImageLoadingSpinner,
} from './reader-dom-utils.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';
import { resolveStatusHudScale, resolveStatusHudLocationScale, NSFW_VEIL_LEVEL_STYLE, normalizeStatusHudPosition, normalizeStatusHudSettings } from '../../data/shujuku/status-hud-model.js';
import { computeLineHeight, igsDebug } from './reader-value-utils.js';
import {
    applySpriteDisplayScale,
    renderDialogueHtml,
    resolveActiveTheme,
    resolveSpriteLayout,
} from './settings-normalize.js';
import { applyReaderModeRuntime } from './reader-runtime.js';
import { applyTypewriterEffect, cancelTypewriter } from './typewriter-runtime.js';
import { applyVoiceBark } from './voice-bark.js';
import { applyTts, normalizeTtsSettings } from './tts.js';
import { resolveSpriteBaseScale } from './sprite-height.js';
import { applyStageShakeEffect } from './stage-shake-runtime.js';
import { applyFxToDom, repositionFxSymbols } from './fx-runtime.js';
import { applyDanmakuToDom } from './danmaku-runtime.js';
import { applyItemMentionMarkup, itemMentionsOf, renderItemFx, showItemMention } from './fx-item-render.js';
import { renderBattleFx } from './fx-battle-render.js';
import { repositionBattleImpacts } from './fx-battle.js';
import { renderDailyFx } from './fx-daily.js';
import { peekSpriteHead, probeSpriteHead, resolveSpriteHead, spriteBackgroundSize, spriteWidthPercent } from './fx-anchor.js';
import { applyWeatherFx, resolveWeatherFxTime } from './weather-fx-runtime.js';
import { applySceneGrade } from './scene-grade.js';
import { applyStageDirection } from './stage-direction-runtime.js';
import { applyCastToDom, castRomanceAttr, castSlotKey, clearCastDom, isCastAlignEnabled, isCastCollapsed, isCastRomanceDuoEnabled, isStageCastEnabled, layoutCastSlots, resolveCastCapacity, resolveCastRomanceMode, resolveCastRomanceTarget, isCastLeanEnabled, markCalledCast, playCastBeats, resolveCastPosePlan, resolveCastReactPage, applySpeakerFlip, castStageEntrances } from './stage-cast-render.js';
import { applySavedCastSlot } from './cast-slot-edit.js';
import { spriteIdentity } from '../../scene/character-outfits.js';
import { planCastLayouts, playSpeakerCastMotion, playSpeakerMove, resolveCastHandoff } from './stage-cast-motion.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { applyRenderQualityToDom } from './render-quality.js';
import { applyRomanceToDom } from './romance-runtime.js';
import { applyMetaFx } from './meta-runtime.js';
import { applyCgPortrait } from './cg-portrait.js';
import { applySceneAudio } from './scene-audio.js';
import { applyBgmNoteToDom } from './bgm-note.js';
import { isConfessionLine } from './bgm-library.js';
import { applyTextFxMarkup, armTextFx, disarmTextFx } from './text-fx.js';
import { fitBilingualRuby, normalizeBilingualSettings, renderBilingualHtml, resolveBilingualDisplay } from './bilingual-text.js';
import { preloadDialogFonts, resolveDialogFontMetrics } from './dialog-theme-typography.js';
import { loadCustomFonts, registerCustomFonts } from '../../media/custom-fonts.js';
import { clearSpriteOutfitSwap, spriteLookOf } from './sprite-outfit-swap.js';
import { spriteEnhanceFilter } from './sprite-enhance.js';
import { cgSizeForMode, EMBEDDED_PHONE_MAX_WIDTH, isPortraitTouchWindow } from '../../generated-images/illustration/auto-illustration-service.js';
import { applyClickWaitMark } from './click-wait-mark.js';
import { applyHorrorDread, resolveHorrorDread } from './horror-dread.js';
import { resolveHorrorTypewriterLevel } from './typewriter-horror.js';
import { isUnderwaterScene } from './typewriter-underwater.js';
import { applyHtmlCardToDom } from './html-card-layer.js';
import { applyChatToDom } from './chat-layer.js';
import { comicContentKey, dialogRenderSettings, isComicModeActive } from './comic-settings.js';
import { applyMangaBack } from './manga-back.js';
import { applyCrowdFx } from './crowd-fx.js';
import { applyComicToDom, finishComicReveal, isComicGhostTarget, relayoutComic } from './comic-bubble.js';
import { normalizeSystemRoleSettings } from './system-role.js';
import {
    applyDialogSkinAssets,
    isClassicDialogSkin,
    isGradientVeilDialogSkin,
    isMaterialDialogSkin,
    normalizeClassicDialogWidthPercent,
} from './classic-dialog-skin.js';
import { syncDialogSkinStyle } from './dialog-skin-style.js';
import { gradientVeilColorToRgba, normalizeGradientVeil } from './gradient-veil-dialog-skin.js';

export function createReaderButton(doc, id, title, html) {
    const button = doc.createElement('button');
    button.id = `igs-btn-${id}`;
    button.className = 'igs-icon-btn';
    button.type = 'button';
    button.setAttribute('data-act', id);
    button.setAttribute('title', title);
    button.setAttribute('aria-label', title);
    button.innerHTML = html;
    return button;
}

function addClasses(element, classNames) {
    if (!element) return;
    const current = String(element.className || '').split(/\s+/).filter(Boolean);
    const next = new Set(current);
    for (const name of String(classNames || '').split(/\s+/).filter(Boolean)) next.add(name);
    element.className = Array.from(next).join(' ');
}

function ensureReaderLayer(doc, overlay, id, className, beforeNode = null) {
    if (!doc || !overlay || typeof doc.createElement !== 'function') return null;
    let layer = overlay.querySelector ? overlay.querySelector(`#${id}`) : null;
    if (!layer) {
        layer = doc.createElement('div');
        layer.id = id;
        layer.className = className;
        if (beforeNode && beforeNode.parentNode === overlay && typeof overlay.insertBefore === 'function') {
            overlay.insertBefore(layer, beforeNode);
        } else if (typeof overlay.appendChild === 'function') {
            overlay.appendChild(layer);
        }
    } else {
        addClasses(layer, className);
    }
    return layer;
}

export function normalizeReaderStableLayers(overlay) {
    if (!overlay || !overlay.ownerDocument) return overlay;
    const doc = overlay.ownerDocument;
    addClasses(overlay, 'igs-stage');

    let motionLayer = overlay.querySelector ? overlay.querySelector('#igs-stage-motion') : null;
    if (!motionLayer && typeof doc.createElement === 'function') {
        motionLayer = doc.createElement('div');
        motionLayer.id = 'igs-stage-motion';
        const firstChild = overlay.firstChild || null;
        if (firstChild && typeof overlay.insertBefore === 'function') overlay.insertBefore(motionLayer, firstChild);
        else if (typeof overlay.appendChild === 'function') overlay.appendChild(motionLayer);
        const movableIds = ['igs-bg-blur', 'igs-bg', 'igs-cast', 'igs-sprite', 'igs-effect-layer', 'igs-effect-front-layer', 'igs-click-layer', 'igs-option-layer', 'igs-dialog-layer', 'igs-toolbar-layer', 'igs-db-layer', 'igs-status-hud'];
        for (const id of movableIds) {
            const node = overlay.querySelector ? overlay.querySelector(`#${id}`) : null;
            if (node && node !== motionLayer && node.parentNode === overlay && typeof motionLayer.appendChild === 'function') motionLayer.appendChild(node);
        }
    }

    const bgBlur = overlay.querySelector ? overlay.querySelector('#igs-bg-blur') : null;
    const bg = overlay.querySelector ? overlay.querySelector('#igs-bg') : null;
    const sprite = overlay.querySelector ? overlay.querySelector('#igs-sprite') : null;
    addClasses(bgBlur, 'igs-background-layer igs-background-blur-layer');
    addClasses(bg, 'igs-background-layer');
    addClasses(sprite, 'igs-character-layer');
    // 天气演出双层：后景 #igs-effect-layer（背景之上、立绘之下）、前景 #igs-effect-front-layer（立绘之上、对话层之下），层级由 z-index 决定。
    const fxParent = motionLayer || overlay;
    const fxBefore = overlay.querySelector ? overlay.querySelector('#igs-click-layer') : null;
    ensureReaderLayer(doc, fxParent, 'igs-effect-layer', 'igs-effect-layer', fxBefore);
    ensureReaderLayer(doc, fxParent, 'igs-effect-front-layer', 'igs-effect-front-layer', fxBefore);

    if (motionLayer) {
        const movableIds =['igs-bg-blur', 'igs-bg', 'igs-cast', 'igs-sprite', 'igs-effect-layer', 'igs-effect-front-layer', 'igs-click-layer', 'igs-option-layer', 'igs-dialog-layer', 'igs-toolbar-layer', 'igs-db-layer', 'igs-status-hud'];
        for (const id of movableIds) {
            const node = overlay.querySelector ? overlay.querySelector(`#${id}`) : null;
            if (node && node !== motionLayer && node.parentNode === overlay && typeof motionLayer.appendChild === 'function') {
                motionLayer.appendChild(node);
            }
        }
    }
    if (sprite && sprite.parentNode) ensureReaderLayer(doc, sprite.parentNode, 'igs-cast', 'igs-cast-layer', sprite);

    const optionBubbles = overlay.querySelector ? overlay.querySelector('#igs-option-bubbles') : null;
    const dialog = overlay.querySelector ? overlay.querySelector('#igs-dialog') : null;
    const toolbar = overlay.querySelector ? overlay.querySelector('#igs-ctrl-bar') : null;
    addClasses(toolbar, 'igs-toolbar');
    const optionLayer = ensureReaderLayer(doc, overlay, 'igs-option-layer', 'igs-choice-layer', dialog || toolbar);
    const dialogLayer = ensureReaderLayer(doc, overlay, 'igs-dialog-layer', 'igs-dialogue-layer', toolbar);
    const toolbarLayer = ensureReaderLayer(doc, overlay, 'igs-toolbar-layer', 'igs-hud-layer');
    ensureReaderLayer(doc, overlay, 'igs-db-layer', 'igs-system-layer');
    if (overlay.querySelector && !overlay.querySelector('#igs-status-hud')) {
        const statusHud = doc.createElement('div');
        statusHud.id = 'igs-status-hud';
        statusHud.setAttribute('hidden', '');
        overlay.appendChild(statusHud);
    }

    if (optionBubbles && optionLayer && optionBubbles.parentNode !== optionLayer) optionLayer.appendChild(optionBubbles);
    if (dialog && dialogLayer && dialog.parentNode !== dialogLayer) dialogLayer.appendChild(dialog);
    const existingGradientVeil = overlay.querySelector ? overlay.querySelector('#igs-gradient-veil') : null;
    const gradientVeil = existingGradientVeil && existingGradientVeil.parentNode !== dialogLayer
        ? existingGradientVeil
        : ensureReaderLayer(doc, dialogLayer, 'igs-gradient-veil', 'igs-dialog-gradient-veil', dialog);
    if (gradientVeil && dialogLayer && gradientVeil.parentNode !== dialogLayer && typeof dialogLayer.appendChild === 'function') {
        dialogLayer.appendChild(gradientVeil);
    }
    if (gradientVeil && dialog && gradientVeil.parentNode === dialogLayer && typeof dialogLayer.insertBefore === 'function') {
        dialogLayer.insertBefore(gradientVeil, dialog);
    }
    if (toolbar && toolbarLayer && toolbar.parentNode !== toolbarLayer) toolbarLayer.appendChild(toolbar);
    return overlay;
}

function applyGradientVeilToDom(root, dialog, readerSettings) {
    const veil = root && root.querySelector ? root.querySelector('#igs-gradient-veil') : null;
    const active = isGradientVeilDialogSkin(readerSettings);
    if (!root || !dialog) return;
    if (!active) {
        root.classList && root.classList.remove('igs-gradient-veil-active');
        if (root.style && typeof root.style.removeProperty === 'function') {
            root.style.removeProperty('--igs-gradient-veil-height');
            root.style.removeProperty('--igs-gradient-veil-color');
        }
        dialog.removeAttribute && dialog.removeAttribute('data-igs-speaker-style');
        if (veil) {
            veil.hidden = true;
            veil.style.display = 'none';
        }
        return;
    }
    const normalized = normalizeGradientVeil(readerSettings.gradientVeil);
    const color = gradientVeilColorToRgba(normalized.color, normalized.opacity);
    root.classList && root.classList.add('igs-gradient-veil-active');
    if (root.style && typeof root.style.setProperty === 'function') {
        root.style.setProperty('--igs-gradient-veil-height', `${normalized.heightPercent}%`);
        root.style.setProperty('--igs-gradient-veil-color', color);
        // HUD 的 color-mix 仍要求这里是纯色，不能写入 linear-gradient。
        root.style.setProperty('--igs-dialog-bg', color);
    }
    dialog.setAttribute && dialog.setAttribute('data-igs-speaker-style', normalized.speakerStyle);
    if (veil) {
        veil.hidden = false;
        veil.style.display = 'block';
    }
}

export function buildFallbackReaderOverlay(doc) {
    if (!doc || typeof doc.createElement !== 'function') return null;
    const overlay = doc.createElement('div');
    overlay.id = 'igs-overlay';
    const motionLayer = doc.createElement('div');
    motionLayer.id = 'igs-stage-motion';
    overlay.appendChild(motionLayer);

    const bgBlur = doc.createElement('div');
    bgBlur.id = 'igs-bg-blur';
    overlay.appendChild(bgBlur);

    const bg = doc.createElement('div');
    bg.id = 'igs-bg';
    overlay.appendChild(bg);

    const sprite = doc.createElement('div');
    sprite.id = 'igs-sprite';
    overlay.appendChild(sprite);

    const effectLayer = doc.createElement('div');
    effectLayer.id = 'igs-effect-layer';
    effectLayer.className = 'igs-effect-layer';
    overlay.appendChild(effectLayer);

    const effectFrontLayer = doc.createElement('div');
    effectFrontLayer.id = 'igs-effect-front-layer';
    effectFrontLayer.className = 'igs-effect-front-layer';
    overlay.appendChild(effectFrontLayer);

    const clickLayer = doc.createElement('div');
    clickLayer.id = 'igs-click-layer';
    overlay.appendChild(clickLayer);

    const optionBubbles = doc.createElement('div');
    optionBubbles.id = 'igs-option-bubbles';
    optionBubbles.setAttribute('data-igs-pos', 'top-left');
    optionBubbles.setAttribute('data-igs-width', 'dialog');
    optionBubbles.setAttribute('hidden', '');
    overlay.appendChild(optionBubbles);

    const dialog = doc.createElement('div');
    dialog.id = 'igs-dialog';
    dialog.className = 'igs-dialog';
    overlay.appendChild(dialog);

    const gradientVeil = doc.createElement('div');
    gradientVeil.id = 'igs-gradient-veil';
    gradientVeil.className = 'igs-dialog-gradient-veil';
    gradientVeil.hidden = true;
    overlay.appendChild(gradientVeil);

    const ctrlBar = doc.createElement('div');
    ctrlBar.id = 'igs-ctrl-bar';
    ctrlBar.className = 'igs-ctrl-bar igs-toolbar';
    dialog.appendChild(ctrlBar);

    const barBtns = doc.createElement('div');
    barBtns.id = 'igs-bar-btns';
    ctrlBar.appendChild(barBtns);
    for (const button of ORIGINAL_READER_TOOLBAR_BUTTONS) {
        barBtns.appendChild(createReaderButton(doc, button.id, button.title, button.html));
    }

    const settings = doc.createElement('div');
    settings.id = 'igs-settings';
    settings.setAttribute('aria-hidden', 'true');
    ctrlBar.appendChild(settings);

    const pinned = doc.createElement('div');
    pinned.id = 'igs-bar-pinned';
    ctrlBar.appendChild(pinned);

    ctrlBar.appendChild(createReaderButton(doc, 'toggle-bar', '收起/展开工具栏', ORIGINAL_READER_ICONS.toggleBar));
    ctrlBar.appendChild(createReaderButton(doc, 'close', '退出', ORIGINAL_READER_ICONS.close));

    const progress = doc.createElement('div');
    progress.id = 'igs-progress';
    progress.className = 'igs-progress';
    dialog.appendChild(progress);

    const speakerEl = doc.createElement('div');
    speakerEl.id = 'igs-speaker';
    speakerEl.className = 'igs-speaker';
    dialog.appendChild(speakerEl);

    const dividerEl = doc.createElement('div');
    dividerEl.id = 'igs-divider';
    dividerEl.className = 'igs-divider';
    dialog.appendChild(dividerEl);

    const text = doc.createElement('div');
    text.id = 'igs-text';
    text.className = 'igs-text';
    dialog.appendChild(text);

    const controls = doc.createElement('div');
    controls.className = 'igs-controls';
    // id 含 shujuku_v120- 子串以命中 Veridis 关键词过滤插件的输入框豁免，
    // 避免其全局 input 监听器替换 #igs-input 里用户正在输入的文字。
    controls.id = 'igs-controls-shujuku_v120-guard';
    dialog.appendChild(controls);

    const sendStatus = doc.createElement('div');
    sendStatus.id = 'igs-send-status';
    sendStatus.setAttribute('aria-live', 'polite');
    controls.appendChild(sendStatus);

    for (let i = 0; i < 3; i += 1) {
        const dot = doc.createElement('span');
        dot.className = 'igs-send-status-dot';
        sendStatus.appendChild(dot);
    }

    const sendStatusText = doc.createElement('span');
    sendStatusText.id = 'igs-send-status-text';
    sendStatusText.textContent = '正在生成…';
    sendStatus.appendChild(sendStatusText);

    const input = doc.createElement('input');
    input.id = 'igs-input';
    input.className = 'igs-input';
    input.type = 'text';
    input.placeholder = '输入内容后按 Enter 发送';
    controls.appendChild(input);

    const sendButton = doc.createElement('button');
    sendButton.id = 'igs-send-btn';
    sendButton.className = 'igs-send-btn';
    sendButton.type = 'button';
    sendButton.textContent = '发送';
    controls.appendChild(sendButton);

    // 对话框底部快捷栏：按钮由 applyToolbarState 按「按钮分布」从工具栏挪进来。
    const dialogBar = doc.createElement('div');
    dialogBar.id = 'igs-dialog-bar';
    dialogBar.className = 'igs-dialog-bar';
    dialogBar.setAttribute('role', 'toolbar');
    dialogBar.setAttribute('aria-label', '快捷操作');
    dialogBar.setAttribute('hidden', '');
    dialog.appendChild(dialogBar);

    const toast = doc.createElement('div');
    toast.id = 'igs-toast';
    toast.setAttribute('aria-live', 'polite');
    overlay.appendChild(toast);

    const statusHud = doc.createElement('div');
    statusHud.id = 'igs-status-hud';
    statusHud.setAttribute('hidden', '');
    overlay.appendChild(statusHud);

    return normalizeReaderStableLayers(overlay);
}

export function buildFallbackSettingsOverlay(doc, snapshot, ctx = {}) {
    if (!doc || typeof doc.createElement !== 'function') return null;
    const overlay = doc.createElement('div');
    overlay.id = 'igs-unified-settings';
    overlay.setAttribute('data-igs-igs-ui', 'true');
    overlay.setAttribute('data-igs-settings-theme', snapshot.settingsTheme || 'cream');

    const shell = doc.createElement('div');
    shell.className = 'igs-settings-shell';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-modal', 'true');
    shell.setAttribute('aria-label', '设置');
    overlay.appendChild(shell);

    const head = doc.createElement('div');
    head.className = 'igs-settings-head';
    shell.appendChild(head);

    const title = doc.createElement('div');
    title.className = 'igs-settings-title';
    title.textContent = '设置';
    head.appendChild(title);

    const themeSwitch = doc.createElement('div');
    themeSwitch.className = 'igs-settings-theme-switch';
    themeSwitch.setAttribute('role', 'radiogroup');
    themeSwitch.setAttribute('aria-label', '设置配色');
    themeSwitch.innerHTML = snapshot.settingsThemeSwitch || '';
    head.appendChild(themeSwitch);

    const headSpacer = doc.createElement('div');
    headSpacer.className = 'igs-settings-head-spacer';
    head.appendChild(headSpacer);

    const badge = doc.createElement('div');
    badge.className = 'igs-settings-badge';
    badge.textContent = ctx.version || '0.5.4';
    head.appendChild(badge);

    const close = doc.createElement('button');
    close.className = 'igs-settings-close';
    close.type = 'button';
    close.setAttribute('data-action', 'close');
    close.setAttribute('aria-label', '关闭');
    close.textContent = '×';
    head.appendChild(close);

    const tabs = doc.createElement('div');
    tabs.className = 'igs-settings-tabs';
    shell.appendChild(tabs);
    for (const tab of snapshot.tabs || []) {
        const button = doc.createElement('button');
        button.className = `igs-settings-tab${tab.active ? ' is-active' : ''}`;
        button.type = 'button';
        button.setAttribute('data-tab', tab.id);
        button.textContent = tab.label;
        tabs.appendChild(button);
    }

    const body = doc.createElement('div');
    body.className = 'igs-settings-body';
    if (typeof ctx.renderSettingsBody === 'function') {
        body.innerHTML = ctx.renderSettingsBody(snapshot.tab, snapshot.draft, {
            readerSubTab: snapshot.readerSubTab,
            sceneSubTab: snapshot.sceneSubTab,
            promptRuleStatus: snapshot.resultText && snapshot.resultText.promptRule,
            promptRuleDraft: snapshot.resultText && snapshot.resultText.promptRuleDraft,
            imageResult: snapshot.resultText && snapshot.resultText.image,
            imageModelsMessage: snapshot.resultText && snapshot.resultText.imageModels,
            virtualRegexPreview: snapshot.resultText && snapshot.resultText.virtualRegex,
        });
    }
    shell.appendChild(body);
    return overlay;
}

export function applyToolbarState(root, current) {
    if (!root || !current) return;
    const collapsible = root.querySelector('#igs-bar-btns');
    const pinned = root.querySelector('#igs-bar-pinned');
    const dialogBar = root.querySelector('#igs-dialog-bar');
    const readerSettings = current.snapshot && current.snapshot.readerSettings || {};
    // 按钮分布：split 分两截（dialogBarBtns 放对话框底部快捷栏）/ top 只用顶栏 / dialog 除设置外全放对话框下。
    const split = normalizeToolbarSplit(readerSettings.toolbarSplit);
    const dialogIds = new Set(normalizeDialogBarButtons(readerSettings.dialogBarBtns));
    // 用户固定在顶栏的按钮优先留在顶栏。
    const toDialog = (id) => Boolean(dialogBar) && id !== 'settings' && !pins.has(id) && (split === 'dialog' || (split === 'split' && dialogIds.has(id)));
    const pins = new Set(Array.isArray(readerSettings.pinnedBtns) ? readerSettings.pinnedBtns : []);
    const hiddenSet = new Set(Array.isArray(readerSettings.hiddenBtns) ? readerSettings.hiddenBtns : []);
    // 「重听这句」只在开了台词朗读时显示。
    if (!normalizeTtsSettings(readerSettings.tts).enabled) hiddenSet.add('tts-replay');
    const embeddedMode = current.snapshot && current.snapshot.mode === 'embedded';
    const defaultChrome = Boolean(root.classList && root.classList.contains('igs-default-reader-chrome'));
    // 默认顶部固定：只有明确选了「紧贴对话框」才是 float。
    const dockTop = !embeddedMode && readerSettings.toolbarDock !== 'float';
    const compactChrome = embeddedMode || defaultChrome || dockTop;
    const toolbarExpanded = current.toolbarCollapsed === false;
    if (root.classList) {
        root.classList.toggle('igs-toolbar-expanded', toolbarExpanded);
    }
    // 旧存档的 btnOrder 可能缺少后来新增的按钮（如 CG 库）：补在末尾，否则这些按钮既不能隐藏也不进管理列表。
    const canonicalOrder = TOOLBAR_ACTIONS.map(([id]) => id);
    const savedOrder = Array.isArray(readerSettings.btnOrder) ? readerSettings.btnOrder.filter((id) => canonicalOrder.includes(id)) : [];
    const order = savedOrder.concat(canonicalOrder.filter((id) => !savedOrder.includes(id)));

    const contentForCg = current.snapshot && current.snapshot.content || {};
    const autoPlay = current.autoPlay || { enabled: false, speed: 'medium' };
    const playButton = root.querySelector('#igs-btn-auto-play');
    if (playButton) {
        const title = autoPlay.enabled ? '停止自动播放' : '自动播放';
        const icon = autoPlay.enabled ? ORIGINAL_READER_ICONS.stop : ORIGINAL_READER_ICONS.play;
        if (playButton.innerHTML !== icon) playButton.innerHTML = icon;
        playButton.setAttribute('title', title);
        playButton.setAttribute('aria-label', title);
        playButton.setAttribute('aria-pressed', String(autoPlay.enabled));
    }
    const currentCgShown = Boolean(contentForCg.illustrationActive && contentForCg.illustrationUrl);
    const currentCgSlot = Boolean(contentForCg.illustrationSlot);
    for (const id of ['clear-cg', 'reroll-cg']) {
        const button = root.querySelector(`#igs-btn-${id}`);
        if (!button) continue;
        // 没画出来的 CG 点没有图，清扫仍不可用；重画只认挂载点，失败的那张也能点。
        const enabled = id === 'reroll-cg' ? currentCgSlot : currentCgShown;
        button.disabled = !enabled;
        button.setAttribute('aria-disabled', String(!enabled));
    }

    for (const id of order) {
        const button = root.querySelector(`#igs-btn-${id}`);
        if (!button) continue;
        if (hiddenSet.has(id) || (split === 'top' && DIALOG_ONLY_BUTTONS.includes(id))) {
            button.style.display = 'none';
        } else {
            button.style.display = '';
            if (toDialog(id)) {
                dialogBar.appendChild(button);
            // 顶部固定模式下，按钮区横向滚动；设置键固定到右侧不随之滚动。
            } else if ((pins.has(id) || (dockTop && id === 'settings')) && pinned) {
                pinned.appendChild(button);
            } else if (collapsible) {
                collapsible.appendChild(button);
            }
        }
    }

    // 工具栏分组：按实际可见顺序在每组第一个按钮上标记分隔；用户重排、隐藏、固定后同样成立，不改按钮尺寸。
    const groupOf = new Map(ORIGINAL_READER_TOOLBAR_BUTTONS.map((item) => [item.id, item.group || '']));
    if (dialogBar) {
        const align = normalizeDialogBarAlign(readerSettings.dialogBarAlign);
        if (align === 'auto') dialogBar.removeAttribute('data-igs-align');
        else dialogBar.setAttribute('data-igs-align', align);
        const anyVisible = Array.from(dialogBar.children || []).some((button) => !(button.style && button.style.display === 'none'));
        if (anyVisible) dialogBar.removeAttribute('hidden');
        else dialogBar.setAttribute('hidden', '');
    }
    for (const container of [collapsible, pinned, dialogBar]) {
        if (!container) continue;
        let prevGroup = null;
        for (const button of Array.from(container.children || [])) {
            if (!button || !button.classList || typeof button.classList.toggle !== 'function') continue;
            const id = typeof button.getAttribute === 'function' ? button.getAttribute('data-act') : '';
            const visible = !(button.style && button.style.display === 'none');
            const group = visible && groupOf.has(id) ? groupOf.get(id) : null;
            button.classList.toggle('igs-group-start', group !== null && prevGroup !== null && group !== prevGroup);
            if (group !== null) prevGroup = group;
        }
    }

    if (collapsible) {
        collapsible.style.display = current.toolbarCollapsed ? 'none' : 'flex';
        collapsible.style.gap = compactChrome ? '2px' : '6px';
        collapsible.style.alignItems = 'center';
    }
    if (pinned) {
        pinned.style.display = 'flex';
        pinned.style.gap = compactChrome ? '2px' : '6px';
        pinned.style.alignItems = 'center';
    }

    const statusHud = root.querySelector('#igs-status-hud');
    if (statusHud) {
        const persistedCollapsed = Boolean(readerSettings.statusHud && readerSettings.statusHud.collapsed);
        statusHud.classList.toggle('igs-hud-collapsed', persistedCollapsed || toolbarExpanded);
    }

    // 顶部固定栏：按钮放得下时平均铺满（space-evenly），放不下时改左对齐以便横向滚动查看
    // （space-evenly 在溢出时会把首尾按钮推出可视区且滚不到，故溢出时切 flex-start）。
    if (collapsible && typeof collapsible.classList !== 'undefined') {
        const measureOverflow = () => {
            if (!dockTop) {
                collapsible.classList.remove('igs-bar-overflow');
                return;
            }
            const overflowing = collapsible.scrollWidth > collapsible.clientWidth + 1;
            collapsible.classList.toggle('igs-bar-overflow', overflowing);
        };
        const win = getOwnerWindow(root);
        if (win && typeof win.requestAnimationFrame === 'function') {
            win.requestAnimationFrame(measureOverflow);
        } else {
            measureOverflow();
        }
    }
}

function applyDialogBgOverride(root, snapshot, materialDialog) {
    if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
    if (materialDialog) {
        root.style.removeProperty('--igs-dialog-bg');
        return;
    }
    const value = resolveActiveTheme(snapshot).dialogBg;
    if (value) {
        const theme = resolveActiveTheme(snapshot);
        const explicit = Number(theme.bgOpacity);
        const opacity = theme.bgOpacity != null && Number.isFinite(explicit)
            ? Math.min(1, Math.max(0, explicit))
            : (snapshot.readerSettings && snapshot.readerSettings.glassOpacity);
        root.style.setProperty('--igs-dialog-bg', hexToRgba(value, opacity));
    } else {
        root.style.removeProperty('--igs-dialog-bg');
    }
}


function readPluginIframeHeight(win, fallback) {
    try {
        const viewport = win && win.__IGS_PLUGIN_VIEWPORT__;
        const bridged = viewport && typeof viewport.getHeight === 'function'
            ? Number(viewport.getHeight())
            : Number(viewport && viewport.initialHeight);
        if (bridged > 0) return bridged;
    } catch (error) {
        // Direct/local runs do not have the loader iframe bridge.
    }
    const innerHeight = Number(win && win.innerHeight);
    return innerHeight > 0 ? innerHeight : Number(fallback) || 680;
}

function resolveFrozenDialogHeight(current, snapshot, requestedHeight, win, overlayHeight) {
    const numeric = Number(requestedHeight);
    const ratioMode = Number.isFinite(numeric) && numeric > 0 && numeric <= 1;
    const cacheKey = `${snapshot.mode}:${numeric}`;
    const cached = current && current.dialogHeightFreeze;
    if (cached && cached.key === cacheKey && Number.isFinite(cached.px)) {
        return cached.px;
    }

    const iframeHeight = readPluginIframeHeight(win, overlayHeight);
    const target = ratioMode ? Math.round(iframeHeight * numeric) : numeric;
    const px = Math.max(ratioMode ? 1 : 60, Number.isFinite(target) ? target : 60);
    if (current) {
        current.dialogHeightFreeze = {
            key: cacheKey,
            px,
        };
    }
    return px;
}

function clearFrozenDialogHeight(current) {
    if (current) current.dialogHeightFreeze = null;
}

export function applyReaderSettingsToDom(root, snapshot, current, refs = {}) {
    const dialog = refs.dialog || root.querySelector('#igs-dialog');
    const textEl = refs.textEl || root.querySelector('#igs-text');
    const toolbar = refs.toolbar || root.querySelector('#igs-ctrl-bar');
    const controls = root.querySelector('.igs-controls');
    const bg = root.querySelector('#igs-bg');
    const bgBlur = root.querySelector('#igs-bg-blur');
    // 漫画模式下对话框本体按默认外观渲染（皮肤素材、九宫格都不挂），泡的配色由 comic-bubble 另取。
    const readerSettings = dialogRenderSettings(snapshot.readerSettings || {});
    const classicDialog = isClassicDialogSkin(readerSettings);
    const materialDialog = isMaterialDialogSkin(readerSettings);
    const inlineMode = snapshot.mode === 'pc' || snapshot.mode === 'mobile';
    const pcMode = snapshot.mode === 'pc';
    const embeddedMode = snapshot.mode === 'embedded';
    const win = getOwnerWindow(root);
    const overlayWidth = readElementWidth(root, win && win.innerWidth);
    const overlayHeight = readElementHeight(root, win && win.innerHeight);
    applyTransparentGlassMaterial(root, readerSettings.glassOpacity, {
        backdropFilter: readerSettings.glassBackdropFilter,
    });
    applyDialogBgOverride(root, snapshot, materialDialog);
    if (root.style) root.style.setProperty('--igs-skin-scale', String(normalizeSkinDialogScale(readerSettings.skinDialogScale)));
    if (root.style) {
        // 魔法世界观下魔法星夜随说话角色换学院色；旁白、系统台词、没学院的角色与其他世界观一律用全局配色。
        const content = snapshot.content || {};
        const byCharacter = readerSettings._worldview === 'magic' && content.textType !== 'narration' && content.textType !== 'system';
        const speaker = byCharacter ? (content.spriteCharacter || content.speaker) : '';
        const house = resolveSpeakerMagicHouse(readerSettings._sceneAssets, speaker, readerSettings.magicHouse);
        for (const [name, value] of Object.entries(magicHouseVars(house, readerSettings.magicAccent))) root.style.setProperty(name, value);
    }
    applyGradientVeilToDom(root, dialog, readerSettings);

    if (textEl) {
        applyDialogTextSize(textEl, readerSettings.fontSize);
        textEl.style.minHeight = '0';
    }

    if (dialog) {
        applyDialogSkinAssets(dialog, readerSettings);
        dialog.style.height = '';
        if (materialDialog) {
            clearFrozenDialogHeight(current);
            dialog.style.minHeight = '';
            dialog.style.maxHeight = '';
        } else {
            const viewportHeight = Number(win && win.visualViewport && win.visualViewport.height)
                || Number(win && win.innerHeight)
                || overlayHeight;
            const designHeight = snapshot.mode === 'pc' ? 540 : 680;
            const runtimeHeight = Math.min(designHeight, Math.max(180, viewportHeight - 32));
            const floatingMax = Math.max(140, Math.floor(runtimeHeight * 0.86));
            const availableHeight = embeddedMode
                ? overlayHeight - 28
                : inlineMode
                    ? floatingMax
                    : viewportHeight - 48;
            const maxDialogHeight = Math.max(60, Math.min(600, Math.floor(availableHeight)));
            if (readerSettings.dialogHeight == null) {
                clearFrozenDialogHeight(current);
                dialog.style.height = 'auto';
                dialog.style.minHeight = '0';
                dialog.style.maxHeight = `${maxDialogHeight}px`;
            } else {
                // 新档位按插件 iframe 高度计算一次并冻结；历史 px 设置保持原值。
                // 台词、分页、流式更新及宿主后续 resize 均只复用当前阅读器实例的冻结值。
                const target = resolveFrozenDialogHeight(current, snapshot, readerSettings.dialogHeight, win, overlayHeight);
                dialog.style.height = `${target}px`;
                dialog.style.minHeight = '0';
                dialog.style.maxHeight = 'none';
            }
            if (embeddedMode) dialog.style.width = '';
        }

        dialog.style.left = '';
        dialog.style.right = '';
        dialog.style.marginLeft = '';
        dialog.style.marginRight = '';
        const minimumDialogWidth = materialDialog ? 280 : (inlineMode ? 180 : 260);
        if (classicDialog && pcMode) {
            const widthPercent = normalizeClassicDialogWidthPercent(readerSettings.classicDialogWidthPercent);
            const horizontalGap = Math.round(24 * widthPercent) / 100;
            dialog.style.left = '0';
            dialog.style.right = '0';
            dialog.style.marginLeft = 'auto';
            dialog.style.marginRight = 'auto';
            dialog.style.width = `max(${minimumDialogWidth}px,calc(${widthPercent}% - ${horizontalGap}px))`;
        } else if (embeddedMode || materialDialog || readerSettings.dialogWidth == null) {
            dialog.style.width = '';
        } else if (inlineMode) {
            const clampedWidth = Math.max(minimumDialogWidth, Math.min(readerSettings.dialogWidth, Math.max(minimumDialogWidth, (overlayWidth || readerSettings.dialogWidth) - 24)));
            dialog.style.width = `${clampedWidth}px`;
        } else {
            const viewportWidth = Number(win && win.innerWidth) || readerSettings.dialogWidth;
            dialog.style.width = `${Math.max(minimumDialogWidth, Math.min(readerSettings.dialogWidth, Math.max(minimumDialogWidth, viewportWidth - 8)))}px`;
        }
        dialog.style.background = '';
    }

    const compactChrome = embeddedMode;
    const toolbarDock = embeddedMode ? 'float' : (readerSettings.toolbarDock === 'float' ? 'float' : 'top');
    if (root && root.classList) {
        root.classList.toggle('igs-toolbar-top', toolbarDock === 'top');
        root.classList.toggle('igs-cinema-bars', readerSettings.cinemaBars === true);
    }
    if (toolbar) {
        toolbar.setAttribute('data-igs-toolbar-dock', toolbarDock);
        // 顶部固定栏铺满整条，不做缩放（缩放是悬浮小条用的，全宽栏缩放会从角落缩成异形）。
        if (toolbarDock === 'top') {
            toolbar.style.transform = '';
            toolbar.style.transformOrigin = '';
        } else {
            toolbar.style.transform = `scale(${Number(readerSettings.toolbarScale || 100) / 100})`;
            toolbar.style.transformOrigin = compactChrome ? 'right top' : 'right bottom';
        }
        // The shared glass material is applied through CSS variables on the overlay.
        toolbar.style.background = '';
    }

    if (controls) {
        // 不用 zoom：zoom 会改变 .igs-controls 的实际占位高度并干扰 floating 对话框的 flex 计算，
        // 放大时把输入框/发送按钮挤出对话框。直接按比例设输入框与发送按钮高度（基准 32px）。
        controls.style.zoom = '';
        const inputScale = Number(readerSettings.inputScale || 100) / 100;
        const inputHeight = Math.max(20, Math.round(32 * inputScale));
        const inputEl = controls.querySelector('#igs-input');
        const sendBtn = controls.querySelector('#igs-send-btn');
        if (inputEl) inputEl.style.height = `${inputHeight}px`;
        if (sendBtn) sendBtn.style.height = `${inputHeight}px`;
    }

    if (bg) {
        const cg = Boolean(snapshot.content && (snapshot.content.cgActive || snapshot.content.illustrationActive));
        bg.style.backgroundSize = 'cover';
        bg.style.backgroundPosition = 'center';
        const brightness = Number(readerSettings.imgBrightness);
        const level = (Number.isFinite(brightness) ? brightness : 100) / 100;
        // 亮度、环境滤镜与回忆滤镜都由样式表按变量合成（见 scene-grade.js）。
        // CG 出场的先模糊再清晰写在行内 filter 上，这里不能清掉。
        if (!cg) bg.style.filter = '';
        if (typeof bg.style.setProperty === 'function') bg.style.setProperty('--igs-bg-brightness', String(level));
    }
    if (bgBlur) {
        bgBlur.style.backgroundSize = readerSettings.imgMode === 'contain' ? 'cover' : 'cover';
    }
}

function toggleCgOnly(root) {
    if (root.getAttribute('data-igs-cg-only') === '1') root.removeAttribute('data-igs-cg-only');
    else root.setAttribute('data-igs-cg-only', '1');
}

export function applyAlignStyle(element, align) {
    applyAlignStyleImpl(element, align);
}

// 字号仍由用户设置决定；皮肤只通过 --igs-skin-text-scale、字体只通过 --igs-font-optical/--igs-font-leading 按比例微调，不改变用户档位。
function applyDialogTextSize(textEl, fontSize) {
    textEl.style.fontSize = `calc(${fontSize}px * var(--igs-skin-text-scale, 1) * var(--igs-font-optical, 1))`;
    textEl.style.lineHeight = `calc(${computeLineHeight(fontSize)} * var(--igs-font-leading, 1))`;
}

function applyDialogFontMetrics(textEl, fontStack) {
    const metrics = resolveDialogFontMetrics(fontStack);
    if (typeof textEl.style.setProperty !== 'function') return;
    textEl.style.setProperty('--igs-font-optical', String(metrics.scale));
    textEl.style.setProperty('--igs-font-leading', String(metrics.leading));
}

const STATUS_HUD_PLACEHOLDER = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/></svg>';
const STATUS_HUD_TOGGLE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path class="igs-hud-icon-expand" d="M12 5v14M5 12h14"/></svg>';
const STATUS_HUD_LOCATION_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>';

const STATUS_HUD_COLOR_VARS = Object.freeze({
    trust: 'var(--igs-hud-bar-trust,#4ab3da)',
    like: 'var(--igs-hud-bar-like,#ee83b6)',
    know: 'var(--igs-hud-bar-know,#e8a355)',
    'slot-1': 'var(--igs-hud-bar-1,#57aaee)',
    'slot-2': 'var(--igs-hud-bar-2,#55c795)',
    'slot-3': 'var(--igs-hud-bar-3,#eec254)',
    'slot-4': 'var(--igs-hud-bar-4,#b57fe0)',
    'slot-5': 'var(--igs-hud-bar-5,#ea8a8a)',
    'slot-6': 'var(--igs-hud-bar-6,#8896ea)',
});

const STATUS_HUD_RADIUS = Object.freeze({ square: 0, soft: 6, small: 10, medium: 16, large: 24, circle: '50%' });

function findStatusHudHost(root) {
    if (!root) return null;
    const doc = root.ownerDocument;
    if (doc && typeof doc.getElementById === 'function') {
        const byId = doc.getElementById('igs-status-hud');
        if (byId) return byId;
    }
    return typeof root.querySelector === 'function' ? root.querySelector('#igs-status-hud') : null;
}

// 状态栏按输入内容签名跳过重建：图片轮询、素材加载等与 HUD 无关的重渲染不再销毁重建整块 DOM。
const statusHudKeys = new WeakMap();

function statusHudKey(root, snapshot, hud, radius) {
    const hudSettings = snapshot && snapshot.readerSettings && snapshot.readerSettings.statusHud;
    const optionsVisible = Boolean(root.classList && root.classList.contains('igs-options-visible'));
    try {
        return JSON.stringify([hud || null, hudSettings ? [hudSettings.collapsed, hudSettings.size] : null, optionsVisible, radius]);
    } catch {
        return '';
    }
}

// 位置只写 CSS 变量，不进重建签名：拖完位置不重建 HUD。两份都在默认左上角时不挂属性，样式与改版前完全一致。
const STATUS_HUD_POSITION_VARS = Object.freeze([['--igs-hud-x', 'pc', 'x'], ['--igs-hud-y', 'pc', 'y'], ['--igs-hud-mx', 'mobile', 'x'], ['--igs-hud-my', 'mobile', 'y']]);

export function applyStatusHudPosition(host, position) {
    if (!host || !host.style || typeof host.setAttribute !== 'function') return;
    const pos = normalizeStatusHudPosition(position);
    const custom = STATUS_HUD_POSITION_VARS.some(([, device, axis]) => pos[device][axis] !== 0);
    if (!custom) {
        if (!host.hasAttribute?.('data-igs-hud-pos')) return;
        host.removeAttribute('data-igs-hud-pos');
        for (const [name] of STATUS_HUD_POSITION_VARS) host.style.removeProperty?.(name);
        return;
    }
    host.setAttribute('data-igs-hud-pos', '');
    for (const [name, device, axis] of STATUS_HUD_POSITION_VARS) {
        const value = String(pos[device][axis]);
        if (host.style.getPropertyValue?.(name) !== value) host.style.setProperty(name, value);
    }
}

export function applyStatusHudToDom(root, snapshot) {
    const host = findStatusHudHost(root);
    if (!host) return;
    const hud = snapshot && snapshot.content && snapshot.content.statusHud;
    const doc = host.ownerDocument;
    const radius = STATUS_HUD_RADIUS[hud && hud.avatarRadius] != null ? STATUS_HUD_RADIUS[hud && hud.avatarRadius] : '50%';
    const scale = snapshot && snapshot.readerSettings && snapshot._statusHudScale;
    host.style.setProperty('--igs-hud-scale', String(Number(scale) > 0 ? Number(scale) : 1));
    applyStatusHudPosition(host, snapshot && snapshot.readerSettings && snapshot.readerSettings.statusHud && snapshot.readerSettings.statusHud.position);
    const key = statusHudKey(root, snapshot, hud, radius);
    if (key && statusHudKeys.get(host) === key && (host.firstChild || host.hasAttribute?.('hidden'))) return;
    statusHudKeys.set(host, key);
    const previousRecordEntry = host.querySelector?.('.igs-hud-entry-arrow');
    const previousRecordMenuOpen = previousRecordEntry?.getAttribute('aria-expanded') === 'true';
    const previousHadMetricsRecord = host.classList?.contains('igs-hud-character-emotion-with-metrics');
    const hudSettings = snapshot && snapshot.readerSettings && snapshot.readerSettings.statusHud;
    host.className = '';
    const hasEmotion = Boolean(hud && hud.emotion);
    const hasLocation = Boolean(hud && hud.location);
    const hasMetrics = Boolean(hud && Array.isArray(hud.metrics) && hud.metrics.length);
    const grayscaleBars = Boolean(hud && hud.barColor === 'grayscale');
    const shouldShow = Boolean(hud && hud.enabled && (hud.character || hasLocation));
    if (globalThis.__IGS_HUD_DEBUG__) {
        console.log('[HUD-PROBE]', JSON.stringify({ hud: hud ? { enabled: hud.enabled, character: hud.character, emotion: hud.emotion, location: hud.location, avatar: Boolean(hud.avatar), metrics: hud.metrics && hud.metrics.length } : null, hasEmotion, hasLocation, hasMetrics, shouldShow }));
    }
    if (!shouldShow) {
        host.setAttribute('hidden', '');
        while (host.firstChild) host.removeChild(host.firstChild);
        return;
    }
    host.removeAttribute('hidden');
    // 背景只在有 HUD 条时出现：只有头像/情绪/地点栏时不加背景，即使背景开关开着。
    if (hud.background === 'dialog' && hasMetrics) host.classList.add('igs-hud-bg-dialog');
    if (root.classList && root.classList.contains('igs-options-visible')) host.classList.add('igs-hud-suppressed');
    // 仅头像/情绪/地点、无 HUD 条时挂修饰类，anchor 恢复加菜单前的列式几何，情绪与头像间距回到旧值；有 HUD 条时保持现状。
    host.classList.toggle('igs-hud-no-metrics', !hasMetrics);
    host.classList.toggle('igs-hud-character-emotion-only', Boolean(hud && hud.character && hasEmotion && !hasLocation && !hasMetrics));
    host.classList.toggle('igs-hud-character-emotion-with-metrics', Boolean(hud && hud.character && hasEmotion && hasMetrics));
    if (hudSettings && hudSettings.collapsed) host.classList.add('igs-hud-collapsed');
    host.classList.toggle('igs-hud-size-large', hudSettings?.size === 'large');
    host.classList.toggle('igs-hud-bars-grayscale', grayscaleBars);
    while (host.firstChild) host.removeChild(host.firstChild);

    const identity = doc.createElement('div');
    identity.className = 'igs-hud-identity';
    if (hud.character) {
        const avatarFrame = doc.createElement('div');
        avatarFrame.className = 'igs-hud-avatar-frame';
        if (hud.avatar) {
            const img = doc.createElement('img');
            img.className = 'igs-hud-avatar';
            img.setAttribute('src', hud.avatar);
            img.setAttribute('alt', '');
            img.style.borderRadius = typeof radius === 'number' ? `calc(${radius}px * var(--igs-hud-scale,1))` : radius;
            avatarFrame.appendChild(img);
        } else {
            const placeholder = doc.createElement('div');
            placeholder.className = 'igs-hud-avatar igs-hud-avatar-empty';
            placeholder.innerHTML = STATUS_HUD_PLACEHOLDER;
            placeholder.style.borderRadius = typeof radius === 'number' ? `calc(${radius}px * var(--igs-hud-scale,1))` : radius;
            avatarFrame.appendChild(placeholder);
        }
        identity.appendChild(avatarFrame);
    }
    const entryAnchor = doc.createElement('div');
    entryAnchor.className = 'igs-hud-entry-anchor';
    if (hud.character && hasEmotion) {
        const chip = doc.createElement('span');
        chip.className = 'igs-hud-emotion';
        chip.textContent = hud.emotion;
        entryAnchor.appendChild(chip);
    }
    if (hasLocation) {
        const location = doc.createElement('div');
        location.className = 'igs-hud-location';
        const icon = doc.createElement('span');
        icon.className = 'igs-hud-location-icon';
        icon.innerHTML = RECORD_ICONS.pin;
        location.appendChild(icon);
        const chip = doc.createElement('span');
        chip.className = 'igs-hud-location-label';
        const context = [hud.weather, hud.time].filter(Boolean).join(' · ');
        chip.textContent = hud.showLocationDetails && context
            ? `${context} の ${hud.location}`
            : hud.location;
        location.appendChild(chip);
        entryAnchor.appendChild(location);
    }
    const arrow = doc.createElement('button');
    arrow.className = 'igs-hud-entry-arrow';
    arrow.type = 'button';
    arrow.setAttribute('data-act', 'toggle-record-menu');
    arrow.setAttribute('aria-label', '打开资料菜单');
    arrow.setAttribute('aria-haspopup', 'true');
    const hasCharacterEmotionMetrics = Boolean(hud && hud.character && hasEmotion && hasMetrics);
    const recordMenuOpen = hasCharacterEmotionMetrics
        && !hudSettings?.collapsed
        && !(root.classList && root.classList.contains('igs-options-visible'))
        && (!previousRecordEntry || !previousHadMetricsRecord || previousRecordMenuOpen);
    arrow.setAttribute('aria-expanded', String(recordMenuOpen));
    arrow.setAttribute('aria-controls', 'igs-hud-record-menu');
    arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 10 5 5 5-5"/></svg>';
    entryAnchor.appendChild(arrow);
    const menu = doc.createElement('div');
    menu.id = 'igs-hud-record-menu';
    menu.className = 'igs-hud-entry-menu';
    menu.setAttribute('aria-label', '资料入口');
    if (!recordMenuOpen) menu.setAttribute('hidden', '');
    // 好感总览入口只在当前 HUD 已有好感度条时出现；数据仍来自状态栏所选表。
    const hasFavorBar = hasMetrics && hud.metrics.some(metric => /好感/.test(String(metric?.label || '')));
    const items = ['map', 'diary', 'inventory', 'relationships', ...(hasFavorBar ? ['favor'] : [])];
    for (const [category, label] of items.map(name => [name, ({ map: '地图', diary: '日记', inventory: '物品', relationships: '人际关系', favor: '好感度' })[name]])) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'igs-hud-entry-item';
        button.setAttribute('data-act', category);
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        button.innerHTML = RECORD_ICONS[category];
        menu.appendChild(button);
    }
    entryAnchor.appendChild(menu);
    identity.appendChild(entryAnchor);
    host.appendChild(identity);

    const metrics = doc.createElement('div');
    metrics.className = 'igs-hud-metrics';
    const rows = hasMetrics ? hud.metrics.slice(0, 4) : [];
    for (const metric of rows) {
        const row = doc.createElement('div');
        row.className = 'igs-hud-metric';
        const label = doc.createElement('span');
        label.className = 'igs-hud-metric-label';
        label.textContent = metric.label;
        const track = doc.createElement('div');
        track.className = 'igs-hud-track';
        const fill = doc.createElement('div');
        fill.className = 'igs-hud-fill';
        const color = STATUS_HUD_COLOR_VARS[metric.colorKey] || STATUS_HUD_COLOR_VARS['slot-1'];
        fill.style.backgroundImage = grayscaleBars
            ? 'linear-gradient(90deg, rgba(255,255,255,.46), rgba(255,255,255,.86))'
            : `linear-gradient(90deg, color-mix(in srgb, ${color} 42%, #ffffff), ${color})`;
        fill.style.width = `${Math.max(0, Math.min(100, Number(metric.percent) || 0))}%`;
        // 主题 HUD 用这个变量重绘填充；灰白模式交给主题自己的中性色。
        fill.style.setProperty('--igs-hud-fill-color', grayscaleBars ? 'var(--igs-hud-fill-neutral,rgba(255,255,255,.8))' : color);
        track.appendChild(fill);
        const value = doc.createElement('span');
        value.className = 'igs-hud-metric-value';
        value.textContent = metric.display;
        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(value);
        metrics.appendChild(row);
    }
    host.appendChild(metrics);
    const toggle = doc.createElement('button');
    toggle.className = 'igs-icon-btn igs-hud-toggle';
    toggle.setAttribute('data-act', 'toggle-status-hud');
    toggle.setAttribute('title', '折叠/展开状态栏');
    toggle.setAttribute('type', 'button');
    toggle.innerHTML = STATUS_HUD_TOGGLE_ICON;
    host.appendChild(toggle);
    if (hasMetrics && Number(hud.hiddenCount) > 0) {
        const overflow = doc.createElement('span');
        overflow.className = 'igs-hud-overflow';
        overflow.textContent = `+${Number(hud.hiddenCount)}`;
        host.appendChild(overflow);
    }
}

export function applyStatusHudScale(root, snapshot) {
    const host = findStatusHudHost(root);
    if (!host) return;
    const settings = snapshot && snapshot.readerSettings;
    const hudSettings = settings && settings.statusHud;
    if (!hudSettings || !hudSettings.enabled) return;
    const overlayWidth = readElementWidth(root, 0);
    const overlayHeight = readElementHeight(root, 0);
    const scale = resolveStatusHudScale(hudSettings.size, overlayWidth, overlayHeight);
    snapshot._statusHudScale = scale;
    host.style.setProperty('--igs-hud-scale', String(scale));
    const locationScale = resolveStatusHudLocationScale(hudSettings.size);
    snapshot._statusHudLocationScale = locationScale;
    host.style.setProperty('--igs-hud-location-scale', String(locationScale));
}

function applyAlignStyleImpl(element, align) {
    if (!element) return;
    // align 取值：left / center / indent（首行缩进2字符）。indent 等价左对齐 + text-indent:2em。
    if (align === 'center') {
        element.style.textAlign = 'center';
        element.style.textIndent = '';
    } else if (align === 'indent') {
        element.style.textAlign = 'left';
        element.style.textIndent = '2em';
    } else if (align === 'left') {
        element.style.textAlign = 'left';
        element.style.textIndent = '';
    } else {
        element.style.textAlign = '';
        element.style.textIndent = '';
    }
}

// 背景与立绘图地址可能是数 MB 的 data: URL；同值重写仍要重新解析整段 CSS，所以只在变化时写入。
// 这三个节点的 backgroundImage 只由本文件写，记住上次写入值即可，不必回读样式。
// 同时记住是哪一个素材地址画上去的，避免 CG 还没解码时把上一张场景背景留在画面上。
const backgroundImageKeys = new WeakMap();
const backgroundImageSources = new WeakMap();

// 内嵌框只跟横竖尺寸走。横屏钉背景尺寸，竖屏钉对调后的尺寸。图的像素不参与。
export function syncEmbeddedHostFrame(root, sizeText) {
    if (!root || !String(root.className || '').includes('igs-mode-embedded')) return;
    const host = typeof root.closest === 'function' ? root.closest('.igs-embedded-host') : null;
    if (!host || !host.style) return;
    const match = String(sizeText || '').trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (!match) {
        host.style.aspectRatio = '';
        if (typeof host.removeAttribute === 'function') host.removeAttribute('data-igs-frame');
        return;
    }
    host.style.aspectRatio = `${match[1]} / ${match[2]}`;
    if (typeof host.setAttribute === 'function') host.setAttribute('data-igs-frame', 'size');
}

// 楼层被酒馆重绘或暂时隐藏时量到宽 0。这时不能按「不是手机」钉横屏，沿用上次钉好的比例；
// 还没钉过就按窗口宽度判断。
export function pinEmbeddedHostFrame(root, backgroundSize, mode) {
    const host = root && typeof root.closest === 'function' ? root.closest('.igs-embedded-host') : null;
    const rect = host && typeof host.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : null;
    const measured = Boolean(rect && rect.width > 0);
    const pinned = Boolean(host && typeof host.getAttribute === 'function' && host.getAttribute('data-igs-frame') === 'size');
    if (!measured && pinned) return;
    const win = root && root.ownerDocument && root.ownerDocument.defaultView;
    const portrait = isPortraitTouchWindow(win);
    const viewport = measured
        ? { width: rect.width, height: rect.height, portrait }
        : (win && win.innerWidth > 0 ? { width: win.innerWidth, height: win.innerHeight, portrait } : null);
    syncEmbeddedHostFrame(root, cgSizeForMode(backgroundSize, mode, viewport));
}

// 内嵌框横竖恢复：旋转屏幕只改宿主栏宽，渲染快照不会自动重跑，钉错的 aspect-ratio 会一直残留。
// 观察宿主宽度跨过手机阈值（EMBEDDED_PHONE_MAX_WIDTH）时按同一 cgSizeForMode 规则重钉一次，
// 只写宿主 aspect-ratio，不重绘阅读器。宿主断开或阅读器退出内嵌时解绑。
export function watchEmbeddedFrameResize(overlay, frameState) {
    if (!overlay || !frameState) return null;
    const host = typeof overlay.closest === 'function' ? overlay.closest('.igs-embedded-host') : null;
    const doc = overlay.ownerDocument || null;
    const win = (doc && doc.defaultView) || null;
    if (!host || !win || typeof win.ResizeObserver !== 'function') return null;
    const measure = () => {
        const rect = typeof host.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : null;
        return rect ? Number(rect.width) || 0 : 0;
    };
    const isPhoneWidth = (width) => (width > 0 && width <= EMBEDDED_PHONE_MAX_WIDTH) || isPortraitTouchWindow(win);
    let lastPhone = isPhoneWidth(measure());
    let observer = null;
    const unobserve = () => {
        if (!observer) return;
        try { observer.disconnect(); } catch (error) { /* best-effort */ }
        observer = null;
    };
    observer = new win.ResizeObserver(() => {
        if (host.isConnected === false) { unobserve(); return; }
        const width = measure();
        const phone = isPhoneWidth(width);
        if (phone === lastPhone) return;
        lastPhone = phone;
        const sizeText = cgSizeForMode(frameState.backgroundSize, frameState.mode, { width, height: 0, portrait: phone });
        const match = String(sizeText || '').match(/^(\d+)\s*[xX×]\s*(\d+)$/);
        if (!match) return;
        if (host.style && host.style.aspectRatio === `${match[1]} / ${match[2]}`) return;
        syncEmbeddedHostFrame(overlay, sizeText);
    });
    observer.observe(host);
    return unobserve;
}

function writeBackgroundImage(element, url, source = url) {
    const value = url ? `url("${url.replace(/"/g, '&quot;')}")` : '';
    if (backgroundImageKeys.get(element) === value && backgroundImageSources.get(element) === source) return;
    backgroundImageKeys.set(element, value);
    backgroundImageSources.set(element, source);
    element.style.backgroundImage = value;
}

const ROOT_TOGGLED_CLASSES = new Set(['igs-default-reader-chrome', 'igs-gradient-veil-active', 'igs-scene-nsfw']);

export function applyReaderSnapshotToDom(root, snapshot, current, ctx = {}) {
    const comicActive = isComicModeActive(snapshot.readerSettings);
    const dialogSettings = dialogRenderSettings(snapshot.readerSettings);
    const materialDialog = isMaterialDialogSkin(dialogSettings);
    const gradientVeilDialog = isGradientVeilDialogSkin(dialogSettings);
    const nsfwVeilActive = snapshot.content.sceneNsfw === true && snapshot.content.illustrationActive !== true;
    // 先算出最终类名再整串比较：覆盖后再 toggle 会让同一组类每次渲染都先删后加，反复触发样式失效。
    const rootClasses = snapshot.classes.filter((name) => !ROOT_TOGGLED_CLASSES.has(name));
    if (!materialDialog) rootClasses.push('igs-default-reader-chrome');
    if (gradientVeilDialog) rootClasses.push('igs-gradient-veil-active');
    if (nsfwVeilActive) rootClasses.push('igs-scene-nsfw');
    if (current && current.awaitingReply) rootClasses.push('igs-awaiting-reply');
    // applyReaderSettingsToDom 随后还会 toggle 这两个类：先按同样条件带上，免得每次翻页先删后加、整页样式失效。
    if (snapshot.mode !== 'embedded' && snapshot.readerSettings.toolbarDock !== 'float') rootClasses.push('igs-toolbar-top');
    if (snapshot.readerSettings.cinemaBars === true) rootClasses.push('igs-cinema-bars');
    const rootClassName = rootClasses.join(' ');
    if (root.className !== rootClassName) root.className = rootClassName;
    root.setAttribute('data-igs-igs-ui', 'true');
    // 粒子模块在本轮渲染里读取档位，必须先于天气、日常演出写入。
    applyRenderQualityToDom(root, snapshot.readerSettings && snapshot.readerSettings.performance && snapshot.readerSettings.performance.quality);
    const stageMotion = root.querySelector('#igs-stage-motion') || root;
    let typewriterTextType = '';
    let typewriterRenderKey = '';

    const bg = root.querySelector('#igs-bg');
    const bgBlur = root.querySelector('#igs-bg-blur');
    const textEl = root.querySelector('#igs-text');
    const input = root.querySelector('#igs-input');
    const send = root.querySelector('#igs-send-btn');
    const dialog = root.querySelector('#igs-dialog');
    // 根节点同步皮肤标记，供对话框之外的选项气泡跟随皮肤。
    applyDialogSkinAssets(root, dialogSettings);
    syncDialogSkinStyle(root, dialogSettings);
    const toolbar = root.querySelector('#igs-ctrl-bar');
    const clickLayer = root.querySelector('#igs-click-layer');
    const toast = root.querySelector('#igs-toast');
    const segmentsLen = snapshot.content && Array.isArray(snapshot.content.segments) ? snapshot.content.segments.length : 0;
    const isLastPage = segmentsLen <= 0 || (snapshot.content && snapshot.content.currentIndex >= segmentsLen - 1);
    const resolveAssetUrl = typeof ctx.resolveAssetUrl === 'function'
        ? ctx.resolveAssetUrl
        : (url) => String(url || '').trim();
    // NSFW 黑幕强度：档位写入 CSS 变量驱动 veil 与背景亮度；非 NSFW 场景清除，回落 CSS 内默认值。
    const nsfwVeilLevel = nsfwVeilActive
        ? (((snapshot.readerSettings || {}).statusHud) || {}).nsfwVeilLevel
        : '';
    const nsfwVeilStyle = nsfwVeilActive
        ? (NSFW_VEIL_LEVEL_STYLE[nsfwVeilLevel] || NSFW_VEIL_LEVEL_STYLE.medium)
        : null;
    if (root.style && typeof root.style.setProperty === 'function') {
        const nsfwVeilPairs = [['--igs-nsfw-veil-center', 'center'], ['--igs-nsfw-veil-edge', 'edge']];
        for (const [prop, key] of nsfwVeilPairs) {
            if (nsfwVeilStyle) root.style.setProperty(prop, nsfwVeilStyle[key]);
            else if (typeof root.style.removeProperty === 'function') root.style.removeProperty(prop);
        }
    }
    const backgroundSource = String(snapshot.content.backgroundImage || '');
    const backgroundAssetUrl = resolveAssetUrl(snapshot.content.backgroundImage);
    const cgActive = Boolean(snapshot.content && (snapshot.content.cgActive || snapshot.content.illustrationActive));
    if (stageMotion && stageMotion.setAttribute) {
        if (cgActive) stageMotion.setAttribute('data-igs-cg', '1');
        else stageMotion.removeAttribute('data-igs-cg');
    }
    if (current && typeof current === 'object') {
        // 渲染主路径每张快照刷新钉尺寸输入；宽度观察器跨阈值时按同一份输入重算。
        const frameState = current.embeddedFrame || (current.embeddedFrame = {});
        frameState.backgroundSize = snapshot.readerSettings ? snapshot.readerSettings._cgBackgroundSize : '';
        frameState.mode = snapshot.mode;
    }
    pinEmbeddedHostFrame(root, snapshot.readerSettings && snapshot.readerSettings._cgBackgroundSize, snapshot.mode);

    if (bg && backgroundAssetUrl) {
        writeBackgroundImage(bg, backgroundAssetUrl, backgroundSource);
        bg.setAttribute('data-igs-has-image', '1');
        removeImageLoadingSpinner(bg);
        removeImageEmptyPlaceholder(bg);
    } else if (bg && backgroundSource && backgroundImageSources.get(bg) === backgroundSource && backgroundImageKeys.get(bg)) {
        // 同一张还没解码出来：留着已经画上的这张。换了素材（比如场景背景换成 CG）就不能留。
    } else if (bg) {
        writeBackgroundImage(bg, '', backgroundSource);
        bg.removeAttribute('data-igs-has-image');
        const expectsImage = snapshot.content.imageExpectedCount > 0
            && snapshot.content.imageBoundCount < snapshot.content.imageExpectedCount;
        const sceneAssetLoading = Boolean(snapshot.content.backgroundImage) && !backgroundAssetUrl;
        if (sceneAssetLoading) {
            removeImageEmptyPlaceholder(bg);
            ensureImageLoadingSpinner(bg);
        } else if (expectsImage && snapshot.content.imageLoading) {
            removeImageEmptyPlaceholder(bg);
            ensureImageLoadingSpinner(bg);
        } else if (expectsImage) {
            ensureImageEmptyPlaceholder(bg, '图片未生成');
        } else {
            removeImageLoadingSpinner(bg);
            removeImageEmptyPlaceholder(bg);
        }
    }
    if (!cgActive && bg && bg.style && typeof bg.style.removeProperty === 'function') {
        bg.style.removeProperty('filter');
        bg.style.removeProperty('-webkit-filter');
    }
    if (bgBlur && backgroundAssetUrl && !cgActive) {
        writeBackgroundImage(bgBlur, backgroundAssetUrl);
        bgBlur.style.opacity = '0.72';
        bgBlur.style.display = '';
    } else if (bgBlur) {
        writeBackgroundImage(bgBlur, '');
        bgBlur.style.opacity = '0';
        if (cgActive) bgBlur.style.display = 'none';
    }
    const spriteEl = root.querySelector('#igs-sprite');
    const sceneAssets = snapshot.readerSettings && snapshot.readerSettings._sceneAssets;
    const spriteEnhance = current.spriteEditMode ? '' : spriteEnhanceFilter(sceneAssets && sceneAssets.enabled === true
        ? sceneAssets.spriteEnhance : null);
    let stageSprite = null;
    let fxSprite = null;
    const spriteSettings = (snapshot.readerSettings && snapshot.readerSettings.statusHud) || {};
    const hideSpriteNsfw = snapshot.content.sceneNsfw === true && normalizeStatusHudSettings(spriteSettings).nsfwSpriteMode === 'hide';
    const spriteAssetUrl = hideSpriteNsfw || snapshot.content.htmlCardPage === true
        ? null
        : resolveAssetUrl(snapshot.content.spriteImage);
    const castEnabled = isStageCastEnabled(snapshot);
    const castOn = castEnabled && !hideSpriteNsfw && !isCastCollapsed(snapshot, { spriteEditMode: Boolean(current.spriteEditMode) });
    // 恋爱演出同屏：暧昧档陪衬整层退到背景（recede），修罗场钉住并提亮恋爱对象（rival）。
    const castRomanceMode = castOn ? resolveCastRomanceMode(snapshot) : 'none';
    const castRomancePin = castRomanceMode === 'rival' ? resolveCastRomanceTarget(snapshot) : '';
    // 恋爱演出收成单人（romanceDuo 开启时）：记住说话人站位，进出单人时平移而不瞬移。
    const castRomanceCollapse = castEnabled && !hideSpriteNsfw && !current.spriteEditMode && isCastRomanceDuoEnabled(snapshot) && resolveCastRomanceMode(snapshot) === 'collapse';
    const castView = (root.ownerDocument && root.ownerDocument.defaultView) || {};
    const castLayout = layoutCastSlots({
        members: castOn && Array.isArray(snapshot.content.castSprites) ? snapshot.content.castSprites : [],
        pin: castRomancePin,
        speakerOrder: snapshot.content.speakerCastOrder,
        hasSpeaker: Boolean(spriteAssetUrl),
        capacity: resolveCastCapacity(snapshot.mode, {
            width: stageMotion.clientWidth || castView.innerWidth,
            height: stageMotion.clientHeight || castView.innerHeight,
        }),
    });
    const speakerSlotX = castLayout.multi && castLayout.speakerPosX != null ? castLayout.speakerPosX : null;
    const castSpeakerKey = snapshot.content.spriteCharacter || snapshot.content.speaker || '';
    const castSpeakerMood = snapshot.content.spriteMood || '';
    const castSpeakerOutfit = snapshot.content.spriteOutfit || '';
    const castSlotLayouts = snapshot.readerSettings.castSlotLayouts || {};
    const presentSpriteLayout = (character, mood, outfit) => {
        const height = resolveSpriteBaseScale(snapshot.readerSettings._sceneAssets, snapshot.readerSettings, character);
        return applySpriteDisplayScale(
            resolveSpriteLayout(snapshot.readerSettings.spriteLayouts, snapshot.mode, character, mood, outfit, height.defaultScale, height.characterScale),
            snapshot.readerSettings.spriteDisplayScale,
        );
    };
    const castBaseHeight = (character) => {
        const height = resolveSpriteBaseScale(snapshot.readerSettings._sceneAssets, snapshot.readerSettings, character);
        return height.characterScale ?? height.defaultScale;
    };
    const withCastSlot = (entry, character, outfit, slotIndex) => {
        const slotKey = slotIndex == null ? '' : castSlotKey(snapshot.mode, castLayout.count, slotIndex, spriteIdentity(character, outfit));
        const saved = slotKey ? castSlotLayouts[slotKey] : null;
        return { ...applySavedCastSlot(entry, saved, snapshot.readerSettings.spriteDisplayScale), slotKey };
    };
    const castPlanInput = castLayout.multi && !current.spriteEditMode ? {
        stageW: stageMotion.clientWidth,
        stageH: stageMotion.clientHeight,
        align: isCastAlignEnabled(snapshot),
        speaker: spriteAssetUrl ? withCastSlot({
            ...presentSpriteLayout(castSpeakerKey, castSpeakerMood, castSpeakerOutfit),
            ...(speakerSlotX != null ? { posX: speakerSlotX } : {}),
            character: castSpeakerKey,
            url: spriteAssetUrl,
            order: Number.isFinite(snapshot.content.speakerCastOrder) ? snapshot.content.speakerCastOrder : Number.MAX_SAFE_INTEGER,
            head: resolveSpriteHead(snapshot.readerSettings.spriteHeads, castSpeakerKey, castSpeakerMood, castSpeakerOutfit),
            baseHeight: castBaseHeight(castSpeakerKey),
        }, castSpeakerKey, castSpeakerOutfit, castLayout.speakerSlot) : null,
        members: castLayout.members.map((m) => {
            const layout = presentSpriteLayout(m.character, m.mood, m.outfit);
            return withCastSlot({
                character: m.character,
                url: resolveAssetUrl(m.image),
                order: m.order,
                posX: m.posX == null ? layout.posX : m.posX,
                posY: layout.posY,
                scale: layout.scale,
                head: resolveSpriteHead(snapshot.readerSettings.spriteHeads, m.character, m.mood, m.outfit),
                baseHeight: castBaseHeight(m.character),
            }, m.character, m.outfit, m.slotIndex);
        }).filter((m) => m.url),
        peek: peekSpriteHead,
    } : null;
    // 站位姿态（castStage）只作用于多人布局：收成单人或槽位编辑时 castPlanInput 为空，姿态自然暂停。
    const castPlan = castPlanInput ? resolveCastPosePlan(snapshot, planCastLayouts(castPlanInput), castSpeakerKey) : null;
    const castFocus = castRomancePin;
    const castFxTargets = castPlan ? castPlan.members.map((m) => ({ character: m.character, url: m.url, posX: m.posX, posY: m.posY, scale: m.scale, head: m.head, flip: m.flip === true })) : [];
    if (spriteEl && spriteAssetUrl) {
        if (spriteEnhance && !current.spriteEditMode) spriteEl.style.setProperty('--igs-sprite-enhance', spriteEnhance);
        else spriteEl.style.removeProperty('--igs-sprite-enhance');
        const spriteNarration = ['narration', 'chat', 'system'].includes(snapshot.content.textType) && spriteSettings.dimSpriteOnNarration !== false;
        // 旁白压暗由 .igs-sprite-narration 写入 --igs-sprite-dim，与环境滤镜在样式表里合成。
        spriteEl.classList.toggle('igs-sprite-narration', spriteNarration);
        current.spriteLook = spriteLookOf(snapshot.content, spriteAssetUrl);
        writeBackgroundImage(spriteEl, spriteAssetUrl);
        spriteEl.style.display = 'block';
        spriteEl.style.position = 'absolute';
        spriteEl.style.inset = '0';
        spriteEl.style.width = '100%';
        spriteEl.style.height = '100%';
        spriteEl.style.transform = 'none';
        // 立绘编辑时显示基础站位：先清翻转，非编辑时在下方按姿态重新写入。
        applySpeakerFlip(spriteEl, false);
        spriteEl.style.bottom = 'auto';
        spriteEl.style.left = 'auto';
        spriteEl.style.filter = '';
        spriteEl.style.setProperty('-webkit-filter', '');
        if (!current.spriteEditMode) {
            const spriteKey = snapshot.content.spriteCharacter || snapshot.content.speaker;
            const spriteMood = snapshot.content.spriteMood || '';
            const spriteOutfit = snapshot.content.spriteOutfit || '';
            const layout = { ...presentSpriteLayout(spriteKey, spriteMood, spriteOutfit) };
            if (castPlan && castPlan.speaker) Object.assign(layout, { posX: castPlan.speaker.posX, posY: castPlan.speaker.posY, scale: castPlan.speaker.scale });
            else if (speakerSlotX != null) layout.posX = speakerSlotX;
            spriteEl.style.backgroundSize = spriteBackgroundSize(layout.scale);
            spriteEl.style.backgroundPosition = `${layout.posX}% ${layout.posY}%`;
            stageSprite = { url: spriteAssetUrl, key: spriteKey, posX: Number(layout.posX) };
            fxSprite = { url: spriteAssetUrl, posX: Number(layout.posX), posY: Number(layout.posY), scale: Number(layout.scale), head: resolveSpriteHead(snapshot.readerSettings.spriteHeads, spriteKey, spriteMood, spriteOutfit), multi: Boolean(castPlan && castPlan.members.length), flip: Boolean(castPlan && castPlan.speaker && castPlan.speaker.flip) };
            const probed = peekSpriteHead(spriteAssetUrl);
            applySpeakerFlip(spriteEl, fxSprite.flip, layout.posX, spriteWidthPercent(stageMotion.clientWidth, stageMotion.clientHeight, { ...layout, naturalW: probed && probed.naturalW, naturalH: probed && probed.naturalH }));
            igsDebug('[DEBUG-sprite] apply-layout', { mode: snapshot.mode, speaker: spriteKey, mood: spriteMood, outfit: spriteOutfit, index: snapshot.content.currentIndex, layout: { ...layout } });
        }
    } else if (spriteEl) {
        spriteEl.style.removeProperty('--igs-sprite-enhance');
        current.spriteLook = null;
        clearSpriteOutfitSwap(spriteEl);
        applySpeakerFlip(spriteEl, false);
        spriteEl.classList.remove('igs-sprite-narration');
        applySpeakerFlip(spriteEl, false);

        writeBackgroundImage(spriteEl, '');
        spriteEl.style.display = 'none';
        spriteEl.style.filter = '';
        spriteEl.style.setProperty('-webkit-filter', '');
    }
    const castReduced = prefersReducedMotion();
    // 陪衬朝向说话人：减少动效、暧昧退场或开关关闭时不倾；旁白页（无说话人槽位）保持上一页朝向。
    const castLean = !castReduced && castRomanceMode !== 'recede' && isCastLeanEnabled(snapshot)
        ? { speakerX: speakerSlotX, keep: speakerSlotX == null }
        : null;
    let castSpeakerMotion = null;
    let castCollapseMove = null;
    let castReactMarks = [];
    current.castAlignToken = null;
    const castEditing = Boolean(current.spriteEditMode && current.spriteEditMode.kind === 'cast');
    if (!castEditing && castPlan && castPlan.members.length) {
        const collapsedFrom = current.castCollapsedFrom && current.castCollapsedFrom.messageId === snapshot.messageId ? current.castCollapsedFrom : null;
        const prevStage = current.castStage || (collapsedFrom ? { speaker: collapsedFrom.speaker, speakerX: collapsedFrom.speakerX, members: [], memberX: {} } : null);
        current.castCollapsedFrom = null;
        const speakerKey = stageSprite ? stageSprite.key : '';
        const handoff = resolveCastHandoff(prevStage, { speaker: speakerKey, members: castPlan.members.map((m) => m.character) });
        // 陪衬反应：点名提亮每次渲染都带上；动作只在进入新页时播一次，同页重绘不重播。
        const castReact = resolveCastReactPage(snapshot, castPlan.members);
        castReactMarks = castReact.marks;
        // 头部对齐探测未就绪时，新上台的陪衬等下方对齐重排完成再滑入（applyCastToDom 内有超时兜底）。
        let releaseCastAlign = () => {};
        const castAlignReady = castPlan.pending.length ? new Promise((resolve) => { releaseCastAlign = resolve; }) : null;
        applyCastToDom(root, markCalledCast(castPlan.members, castReact.called), { reduced: castReduced, handoff, focus: castFocus, lean: castLean, entrances: castStageEntrances(snapshot), ready: castAlignReady, spriteEnhance });
        const castReactKey = `${snapshot.messageId}:${snapshot.content.currentIndex}`;
        if (current.castReactKey !== castReactKey) {
            current.castReactKey = castReactKey;
            playCastBeats(root, castReact.beats, { reduced: castReduced });
        }
        if (stageSprite && fxSprite && prevStage && !castReduced) {
            castSpeakerMotion = { prevStage, handoff, speaker: { key: speakerKey, posX: stageSprite.posX, posY: fxSprite.posY } };
        }
        current.castStage = {
            speaker: speakerKey,
            speakerX: stageSprite ? stageSprite.posX : null,
            members: castPlan.members.map((m) => m.character),
            memberX: Object.fromEntries(castPlan.members.map((m) => [m.character, m.posX])),
            entries: [
                ...(castPlan.speaker && stageSprite ? [{ character: speakerKey, speaker: true, key: castPlan.speaker.slotKey, url: castPlan.speaker.url, posX: castPlan.speaker.posX, posY: castPlan.speaker.posY, scale: castPlan.speaker.scale, auto: castPlan.speaker.auto }] : []),
                ...castPlan.members.map((m) => ({ character: m.character, speaker: false, key: m.slotKey, url: m.url, posX: m.posX, posY: m.posY, scale: m.scale, auto: m.auto })),
            ],
        };
        if (castPlan.pending.length) {
            const token = {};
            current.castAlignToken = token;
            Promise.all(castPlan.pending.map((url) => probeSpriteHead(url, root.ownerDocument).catch(() => null))).then(() => {
                if (current.castAlignToken !== token || current.spriteEditMode) return;
                const again = resolveCastPosePlan(snapshot, planCastLayouts(castPlanInput), castSpeakerKey);
                if (again.speaker && spriteEl) {
                    spriteEl.style.backgroundSize = spriteBackgroundSize(again.speaker.scale);
                    spriteEl.style.backgroundPosition = `${again.speaker.posX}% ${again.speaker.posY}%`;
                    if (fxSprite) Object.assign(fxSprite, { posY: Number(again.speaker.posY), scale: Number(again.speaker.scale) });
                }
                applyCastToDom(root, markCalledCast(again.members, castReact.called), { reduced: true, focus: castFocus, lean: castLean, spriteEnhance });
                const fxTargetOf = new Map(castFxTargets.map((t) => [t.character, t]));
                for (const m of again.members) {
                    const t = fxTargetOf.get(m.character);
                    if (t) Object.assign(t, { posX: m.posX, posY: m.posY, scale: m.scale });
                }
                relayoutComic(root);
                repositionFxSymbols(root, { speaker: fxSprite, cast: castFxTargets });
                repositionBattleImpacts(root, { speaker: fxSprite, cast: castFxTargets });
                // 对齐改了大小和高度，槽位编辑的起点要跟着更新，否则拖动从旧值开始。
                if (current.castStage && Array.isArray(current.castStage.entries)) {
                    const byChar = new Map(again.members.map((m) => [m.character, m]));
                    current.castStage.entries = current.castStage.entries.map((e) => {
                        const next = e.speaker ? again.speaker : byChar.get(e.character);
                        return next ? { ...e, posX: next.posX, posY: next.posY, scale: next.scale, auto: next.auto || e.auto } : e;
                    });
                }
            }).finally(() => releaseCastAlign());
        }
    } else if (!castEditing) {
        const prevStage = current.castStage || null;
        if (castRomanceCollapse && prevStage && stageSprite && fxSprite && !castReduced && prevStage.speaker === stageSprite.key && prevStage.speakerX != null) {
            castCollapseMove = { fromX: prevStage.speakerX, toX: stageSprite.posX, posY: fxSprite.posY };
        }
        current.castCollapsedFrom = castRomanceCollapse && stageSprite
            ? { messageId: snapshot.messageId, speaker: stageSprite.key, speakerX: stageSprite.posX, posY: fxSprite ? fxSprite.posY : null }
            : null;
        current.castStage = null;
        if (castEnabled) applyCastToDom(root, [], { reduced: castReduced });
        else clearCastDom(root);
    }
    const castRomanceMark = !castEditing && castPlan && castPlan.members.length ? castRomanceAttr(snapshot.mode, castRomanceMode) : '';
    if (stageMotion && typeof stageMotion.setAttribute === 'function') {
        if (castRomanceMark) stageMotion.setAttribute('data-igs-cast-romance', castRomanceMark);
        else if (typeof stageMotion.removeAttribute === 'function') stageMotion.removeAttribute('data-igs-cast-romance');
    }
    if (textEl) {
        const theme = resolveActiveTheme(snapshot);
        const sceneAssetsEnabled = snapshot.readerSettings._sceneAssets && snapshot.readerSettings._sceneAssets.enabled;
        const textType = snapshot.content.textType || 'narration';
        const textFxOn = Boolean(snapshot.readerSettings.textFx && snapshot.readerSettings.textFx.enabled);
        const bilingualDisplay = resolveBilingualDisplay(snapshot.readerSettings.bilingual, snapshot.readerSettings._bilingualDisplay);
        const renderedHtml = applyItemMentionMarkup(applyTextFxMarkup(renderBilingualHtml(renderDialogueHtml(snapshot.content.displayText, theme, sceneAssetsEnabled), bilingualDisplay, normalizeBilingualSettings(snapshot.readerSettings.bilingual).layout), textFxOn), itemMentionsOf(snapshot));
        const textRenderKey = [snapshot.messageId, snapshot.content.currentIndex, textType, renderedHtml].join(':');

        typewriterTextType = textType === 'system' ? 'narration' : textType;
        typewriterRenderKey = textRenderKey;
        const sameTextRender = Boolean(textEl.dataset && textEl.dataset.igsTextRenderKey === textRenderKey);
        if (!sameTextRender) {
            cancelTypewriter(textEl, { finish: false });
            disarmTextFx(textEl);
            textEl.innerHTML = renderedHtml;
            if (textEl.dataset) textEl.dataset.igsTextRenderKey = textRenderKey;
        }
        applyDialogTextSize(textEl, snapshot.readerSettings.fontSize);
        textEl.style.fontWeight = snapshot.readerSettings.dialogFontWeight == null ? '' : String(snapshot.readerSettings.dialogFontWeight);
        const textEffect = snapshot.readerSettings.dialogTextEffect;
        const effectColor = snapshot.readerSettings.dialogTextEffectColor;
        const effectStrength = Number(snapshot.readerSettings.dialogTextEffectStrength);
        const effectSize = Number(snapshot.readerSettings.dialogTextEffectSize);
        if ((textEffect === 'outline' || textEffect === 'shadow')
            && /^#[0-9a-fA-F]{6}$/.test(effectColor)
            && Number.isFinite(effectStrength) && Number.isFinite(effectSize)) {
            const rgb = [1, 3, 5].map((index) => parseInt(effectColor.slice(index, index + 2), 16)).join(',');
            const ink = `rgba(${rgb},${Math.max(5, Math.min(50, effectStrength)) / 100})`;
            const size = Math.max(0.4, Math.min(2, effectSize));
            // 先绘制描边再绘制填充：内侧半圈由原字色盖住，描边只在字形外侧可见。
            textEl.style.paintOrder = textEffect === 'outline' ? 'stroke fill' : '';
            textEl.style.webkitTextStroke = textEffect === 'outline' ? `${size * 2}px ${ink}` : '';
            textEl.style.textShadow = textEffect === 'shadow' ? `0 ${size * 1.25}px ${size * 2.5}px ${ink}` : 'none';
        } else {
            textEl.style.paintOrder = '';
            textEl.style.webkitTextStroke = '';
            textEl.style.textShadow = '';
        }
        textEl.style.marginTop = '';
        textEl.style.paddingTop = '';
        const isNarration = textType === 'narration';
        const isThought = textType === 'thought';
        if (dialog) dialog.setAttribute('data-igs-text-type', textType);
        const systemRole = textType === 'system' ? normalizeSystemRoleSettings(snapshot.readerSettings.systemRole) : null;
        const segFont = systemRole ? systemRole.font || theme.narrationFont : isThought ? theme.thoughtFont : isNarration ? theme.narrationFont : theme.textFont;
        const segColor = systemRole ? systemRole.color || theme.narrationColor : isThought ? theme.thoughtColor : isNarration ? theme.narrationColor : theme.textColor;
        const segAlign = systemRole ? systemRole.align : isThought ? theme.thoughtAlign : isNarration ? theme.narrationAlign : theme.textAlign;
        const themeEnabled = sceneAssetsEnabled || materialDialog;
        applyAlignStyle(textEl, themeEnabled ? segAlign : '');
        if (themeEnabled && segFont && segFont !== 'inherit') {
            textEl.style.fontFamily = segFont;
            const themeFonts = [theme.nameFont, theme.textFont, theme.thoughtFont, theme.narrationFont];
            // 选了上传字体才读字体表注册，其余页面不碰 localStorage。
            if (themeFonts.some((stack) => String(stack || '').includes('IGSUserFont-'))) {
                const hostDoc = textEl.ownerDocument;
                registerCustomFonts(hostDoc, loadCustomFonts((hostDoc && hostDoc.defaultView) || globalThis));
            }
            preloadDialogFonts(textEl.ownerDocument, themeFonts);
        } else {
            textEl.style.fontFamily = '';
        }
        applyDialogFontMetrics(textEl, themeEnabled ? segFont : '');
        if (themeEnabled && segColor) {
            textEl.style.color = segColor;
        } else {
            textEl.style.color = '';
        }
        // 字体、字号定下后再量：放不下一行的注音改成译文单独成行，打字机随后按改好的排版测量。
        if (bilingualDisplay === 'ruby') fitBilingualRuby(textEl);
    }
    const stageShakeSettings = snapshot.readerSettings && snapshot.readerSettings.stageShake;
    const stageShakeKey = [
        snapshot.messageId,
        snapshot.content && snapshot.content.currentIndex,
        snapshot.content && snapshot.content.statusEmotion,
        snapshot.content && snapshot.content.displayText,
    ].join(':');
    const stageShake = applyStageShakeEffect(stageMotion, {
        settings: stageShakeSettings,
        emotion: snapshot.content && snapshot.content.statusEmotion,
        key: stageShakeKey,
    });
    const fxTheme = resolveActiveTheme(snapshot);
    const fxResult = applyFxToDom(root, snapshot, {
        sprite: fxSprite,
        cast: castFxTargets,
        castMarks: castReactMarks,
        resolveAssetUrl,
        theme: fxTheme,
    });
    // 获得物品演出：默认关闭；图片只读本聊天本地缓存，同页重绘不重播。
    renderItemFx(root, snapshot, { resolveItemImage: ctx.resolveItemImage, chatId: ctx.chatId, theme: fxTheme });
    // 战斗演出：默认关闭；只读 igs-fx:battle / hit 标签，不显示数值。
    renderBattleFx(root, snapshot, {
        chatId: ctx.chatId,
        theme: fxTheme,
        sprite: fxSprite,
        cast: castFxTargets,
        resolveAssetUrl,
    });
    renderDailyFx(root, snapshot, { onPhoto: ctx.onDailyPhoto });
    // 弹幕：直播间 / 观众弹幕 / 内心弹幕，默认全关，全关时不建层。
    // userName 为用户角色名：直播主播名与之相同时自动切主播视角。
    applyDanmakuToDom(root, snapshot, { sprite: fxSprite, resolveAssetUrl, userName: ctx.userName });
    applyHtmlCardToDom(root, snapshot.content, ctx);
    applyChatToDom(root, snapshot, ctx);
    const effectLayer = root.querySelector('#igs-effect-layer');
    const effectFrontLayer = root.querySelector('#igs-effect-front-layer');
    // NSFW 场景关闭天气粒子与天气调色，避免遮挡 NSFW 图与立绘；离开 NSFW 场景后按原设置恢复。
    const rawWeatherSettings = snapshot.readerSettings && snapshot.readerSettings.weatherFx;
    const nsfwScene = Boolean(snapshot.content && snapshot.content.sceneNsfw === true);
    const weatherSettings = nsfwScene && rawWeatherSettings && typeof rawWeatherSettings === 'object'
        ? { ...rawWeatherSettings, enabled: false }
        : rawWeatherSettings;
    const weatherFx = applyWeatherFx(effectLayer, {
        settings: weatherSettings,
        weather: snapshot.content && snapshot.content.sceneWeather,
        location: snapshot.content && snapshot.content.sceneLocation,
        time: snapshot.content && snapshot.content.sceneTime,
        front: effectFrontLayer,
    });
    applySceneGrade(root, {
        settings: snapshot.readerSettings && snapshot.readerSettings.timeTint,
        weatherSettings,
        weather: snapshot.content && snapshot.content.sceneWeather,
        location: snapshot.content && snapshot.content.sceneLocation,
        time: snapshot.content && snapshot.content.sceneTime,
        ranges: fxResult && fxResult.ranges,
        asset: Boolean(snapshot.content && snapshot.content.illustrationActive === true),
        // 背景是素材自带时段变体（如夜景图）时不再叠时段调色。
        timedAsset: Boolean(snapshot.content && snapshot.content.backgroundTimed === true && snapshot.content.illustrationActive !== true),
    });
    // 人群剪影与漫画背景：前者按地点铺在背景之后（随时段叠色），后者按情绪铺在立绘之前。
    applyCrowdFx(root, snapshot);
    applyMangaBack(root, snapshot, { sprite: fxSprite });
    // 场景时段挂到 overlay 上，供对话框等界面随昼夜调整明暗；不受天气/夜间调色开关影响，夜景底图本身就暗。
    const sceneTime = resolveWeatherFxTime(snapshot.content && snapshot.content.sceneTime);
    if (sceneTime) root.setAttribute('data-igs-scene-time', sceneTime);
    else root.removeAttribute('data-igs-scene-time');
    applyClickWaitMark(root, snapshot.readerSettings && snapshot.readerSettings.clickWaitMark);
    applyHorrorDread(root, { level: snapshot.content && snapshot.content.sceneDread, cap: snapshot.readerSettings && snapshot.readerSettings.horrorDreadCap });
    const stageDirection = applyStageDirection(root, snapshot, {
        bgUrl: backgroundAssetUrl,
        spriteUrl: stageSprite ? stageSprite.url : '',
        spriteKey: stageSprite ? stageSprite.key : '',
        spritePosX: stageSprite ? stageSprite.posX : 50,
        spriteEditMode: Boolean(current.spriteEditMode),
        // 同页演出预算：震动在播时冲击推近让位。
        stageShakeActive: Boolean(stageShake && (stageShake.played || stageShake.active)),
        castKeys: stageSprite && castPlan ? [stageSprite.key, ...castPlan.members.map((m) => m.character)] : [],
        // 有人说话但没有立绘（系统角色、只配头像）：舞台调度按换说话人处理，不播旧立绘退场。
        noSpriteSpeaker: !stageSprite && (Boolean(snapshot.content.speaker) || snapshot.content.textType === 'system'),
    });
    if (castCollapseMove) playSpeakerMove(spriteEl, castCollapseMove.fromX, castCollapseMove.toX, castCollapseMove.posY);
    if (castSpeakerMotion) {
        playSpeakerCastMotion(spriteEl, castSpeakerMotion.prevStage, castSpeakerMotion.speaker, castSpeakerMotion.handoff, {
            // 同场景内直接切回（旁白 / 系统页后回到说话人）也不播同屏上台淡入。
            skipEnter: stageDirection.directSprite === true || stageDirection.played.some((kind) => kind.startsWith('sprite:') && kind.includes('enter')),
        });
    }
    // 亲密演出与 NSFW 仅露脸剪影：复用 fxSprite（布局 + 手动头部标定），编辑立绘时 fxSprite 为 null、不逼近不剪影。
    const romanceResult = applyRomanceToDom(root, snapshot, { sprite: fxSprite, onMemory: ctx.onRomanceMemory, resolveAssetUrl, userName: ctx.userName });
    // Meta 互动：头部热区在亲密演出之后同步，心形快捷按钮已在前层时热区插到它下面。
    applyMetaFx(root, snapshot, { sprite: fxSprite, chatId: ctx.chatId, cast: castFxTargets });
    // NSFW 挂 CG 时对话框左侧的裸体头像（开关默认关，旁白页为空即撤下）。
    applyCgPortrait(root, snapshot, { resolveAssetUrl });
    const sceneAudio = applySceneAudio(root, {
        master: snapshot.readerSettings && snapshot.readerSettings.audioMaster,
        bgm: snapshot.readerSettings && snapshot.readerSettings.bgm,
        ambient: snapshot.readerSettings && snapshot.readerSettings.ambientSound,
        weatherSettings: snapshot.readerSettings && snapshot.readerSettings.weatherFx,
        context: {
            location: snapshot.content && snapshot.content.sceneLocation,
            time: snapshot.content && snapshot.content.sceneTime,
            weather: snapshot.content && snapshot.content.sceneWeather,
            emotion: snapshot.content && snapshot.content.statusEmotion,
            lightningSynced: Boolean(weatherFx && weatherFx.lightning),
            fxRanges: fxResult && fxResult.ranges,
            textType: typewriterTextType,
            // 选曲：本页的配乐情绪标签、战斗 / 亲密区间与世界观曲包。
            bgmMood: snapshot.content && snapshot.content.fx && snapshot.content.fx.bgmMood,
            battle: Boolean(snapshot.content && snapshot.content.fx && snapshot.content.fx.battle),
            romance: Boolean(snapshot.content && snapshot.content.fx && snapshot.content.fx.romance),
            worldview: snapshot.readerSettings && snapshot.readerSettings._worldview,
            // 留白：告白标签或说出口的告白台词让音乐停几页；按页计数，同一页重绘不重复算。
            confess: Boolean(snapshot.content && snapshot.content.fx && snapshot.content.fx.confess),
            confessText: typewriterTextType === 'dialogue' && isConfessionLine(snapshot.content && snapshot.content.text),
            pageKey: `${snapshot.messageId}:${snapshot.content && snapshot.content.currentIndex}`,
        },
        active: true,
    });
    const speakerEl = root.querySelector('#igs-speaker');
    if (speakerEl) {
        const theme = resolveActiveTheme(snapshot);
        const sceneAssetsEnabled = snapshot.readerSettings._sceneAssets && snapshot.readerSettings._sceneAssets.enabled;
        if (sceneAssetsEnabled && snapshot.content.speaker) {
            speakerEl.textContent = snapshot.content.speaker;
            speakerEl.style.display = 'block';
            applyAlignStyle(speakerEl, theme.nameAlign);
            speakerEl.style.fontFamily = theme.nameFont && theme.nameFont !== 'inherit' ? theme.nameFont : '';
            if (String(theme.nameFont || '').includes('IGSUserFont-')) {
                const hostDoc = speakerEl.ownerDocument;
                registerCustomFonts(hostDoc, loadCustomFonts((hostDoc && hostDoc.defaultView) || globalThis));
            }
            speakerEl.style.fontWeight = snapshot.readerSettings.dialogFontWeight == null ? '' : String(snapshot.readerSettings.dialogFontWeight);
            speakerEl.style.color = theme.nameColor || '';
        } else {
            speakerEl.style.display = 'none';
            speakerEl.style.fontWeight = '';
        }
    }
    const dividerEl = root.querySelector('#igs-divider');
    if (dividerEl) {
        const theme = resolveActiveTheme(snapshot);
        const sceneAssetsEnabled = snapshot.readerSettings._sceneAssets && snapshot.readerSettings._sceneAssets.enabled;
        if (!materialDialog && sceneAssetsEnabled && snapshot.content.speaker && theme.dividerSymbol !== 'none') {
            if (theme.dividerSymbol === 'gradient') {
                dividerEl.textContent = '';
                dividerEl.style.display = 'block';
                dividerEl.style.height = '1px';
                dividerEl.style.background = `linear-gradient(90deg, transparent, ${theme.dividerColor || 'rgba(255,255,255,.15)'}, transparent)`;
                dividerEl.style.color = '';
            } else {
                dividerEl.textContent = theme.dividerSymbol;
                dividerEl.style.display = 'block';
                dividerEl.style.height = '';
                dividerEl.style.background = '';
                dividerEl.style.color = theme.dividerColor || '';
            }
        } else {
            dividerEl.style.display = 'none';
        }
    }
    const controls = root.querySelector('.igs-controls');
    if (controls) {
        // 内嵌模式使用酒馆默认输入框；其它模式的 IGS 输入区只在最后一页显示。
        const comicSent = isComicModeActive(snapshot.readerSettings) && current.comicInputSent && current.comicInputSent === comicContentKey(snapshot);
        controls.style.display = snapshot.mode === 'embedded' ? 'none' : (isLastPage ? '' : 'none');
        if (comicSent) controls.setAttribute('data-igs-comic-sent', '1');
        else controls.removeAttribute('data-igs-comic-sent');
    }
    applyStatusHudToDom(root, snapshot);
    applyBgmNoteToDom(root, sceneAudio.track);
    applyStatusHudScale(root, snapshot);
    if (dialog) {
        applyDialogSkinAssets(dialog, dialogSettings);
        const sceneAssetsEnabled = snapshot.readerSettings._sceneAssets && snapshot.readerSettings._sceneAssets.enabled;
        if (materialDialog && sceneAssetsEnabled && snapshot.content.speaker) {
            dialog.setAttribute('data-igs-has-speaker', '1');
        } else {
            dialog.removeAttribute('data-igs-has-speaker');
        }
        if (!materialDialog && !snapshot.content.speaker) {
            dialog.setAttribute('data-igs-narration', '1');
        } else {
            dialog.removeAttribute('data-igs-narration');
        }
        dialog.style.paddingTop = '';
    }
    if (input) {
        input.placeholder = snapshot.input.placeholder;
        input.value = current.inputValue;
    }
    if (send && !(send.dataset && send.dataset.igsBound)) {
        if (send.dataset) send.dataset.igsBound = '1';
        send.addEventListener('click', async () => {
            await current.controller.submit(input ? input.value : current.inputValue);
        });
    }
    if (root && root.getAttribute && root.getAttribute('data-igs-cg-only-bound') !== '1') {
        root.setAttribute('data-igs-cg-only-bound', '1');
        // 隐藏对话框只留 CG：电脑右键，手机三击（见点击层）。只认对话框以外的画面。
        root.addEventListener('pointerdown', (event) => {
            current.lastPointerType = event.pointerType || '';
        }, true);
        root.addEventListener('contextmenu', (event) => {
            if (current.lastPointerType === 'touch') return;
            const target = event.target;
            if (target && typeof target.closest === 'function' && target.closest('button,input,textarea,select,a,#igs-settings,#igs-map-panel,#igs-record-panel,#igs-cg-gallery,#igs-turn-index,#igs-resume-bar,#igs-dialog,.igs-dialog')) return;
            const live = current.snapshot || snapshot;
            if (!(live && live.readerSettings && live.readerSettings.dblclickCgOnly === true)) return;
            event.preventDefault();
            toggleCgOnly(root);
        });
    }
    if (clickLayer && !(clickLayer.dataset && clickLayer.dataset.igsBound)) {
        if (clickLayer.dataset) clickLayer.dataset.igsBound = '1';
        const blankTap = () => {
            if (root && root.getAttribute && root.getAttribute('data-igs-cg-only') === '1') return;
            if (current.hidden) {
                current.controller.toggleHidden();
                return;
            }
            if (ctx.hasActiveSettings && ctx.hasActiveSettings()) {
                if (typeof ctx.closeSettings === 'function') ctx.closeSettings();
                return;
            }
            // 最后一页且启用选项气泡时，点击空白处切换气泡显隐（消费本次点击，不翻页）。
            if (typeof ctx.handleBlankClick === 'function' && ctx.handleBlankClick()) return;
            // 漫画模式没有对话框可点：点画面空白处翻页。
            if (current.snapshot && isComicModeActive(current.snapshot.readerSettings)) {
                if (finishComicReveal(root)) return;
                if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction('next');
                return;
            }
            // 单击对话框以外的画面（左右都算）推进到下一页；打字机没放完时 next 会先放完。
            if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction('next');
        };
        clickLayer.addEventListener('click', () => {
            if (current.dragSuppressClick || (current.runtime && current.runtime.dragSuppressClick)) {
                current.dragSuppressClick = false;
                if (current.runtime) current.runtime.dragSuppressClick = false;
                return;
            }
            const live = current.snapshot || snapshot;
            const tripleOn = current.lastPointerType === 'touch' && live && live.readerSettings && live.readerSettings.dblclickCgOnly === true;
            if (!tripleOn) {
                blankTap();
                return;
            }
            // 手机三击隐藏：开关打开时单击稍等一下排除连击；关掉时单击立即生效。
            current.blankTapCount = (current.blankTapCount || 0) + 1;
            clearTimeout(current.blankTapTimer);
            if (current.blankTapCount >= 3) {
                current.blankTapCount = 0;
                toggleCgOnly(root);
                return;
            }
            current.blankTapTimer = setTimeout(() => {
                const taps = current.blankTapCount;
                current.blankTapCount = 0;
                for (let i = 0; i < taps; i++) blankTap();
            }, 320);
        });
    }
    if (dialog && !(dialog.dataset && dialog.dataset.igsBound)) {
        if (dialog.dataset) dialog.dataset.igsBound = '1';
        dialog.addEventListener('click', (event) => {
            if (current.hidden) return;
            // 点亮的物品名：弹物品卡，不翻页、不跳过打字机。
            const mention = event.target && event.target.closest && event.target.closest('.igs-item-mention');
            if (mention && current.snapshot) {
                event.preventDefault();
                showItemMention(root, current.snapshot, mention.getAttribute('data-igs-item'), { resolveItemImage: ctx.resolveItemImage, theme: resolveActiveTheme(current.snapshot) });
                return;
            }
            if (event.target && event.target.closest && (
                event.target.closest('.igs-controls')
                || event.target.closest('#igs-dialog-bar')
                || event.target.closest('#igs-gen-strip')
                || event.target.closest('#igs-ctrl-bar')
                || event.target.closest('#igs-settings')
            )) {
                return;
            }
            if (current.snapshot && isComicModeActive(current.snapshot.readerSettings)) {
                // 漫画模式：先把还在弹出的泡放完；点淡化的上一句回上一页，点泡翻下一页。
                if (finishComicReveal(root)) {
                    event.preventDefault();
                    return;
                }
                if (root && root.getAttribute && root.getAttribute('data-igs-cg-only') === '1') return;
                if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction(isComicGhostTarget(event.target) ? 'prev' : 'next');
                return;
            }
            if (cancelTypewriter(textEl, { finish: true })) {
                event.preventDefault();
                return;
            }
            const rect = typeof dialog.getBoundingClientRect === 'function'
                ? dialog.getBoundingClientRect()
                : { left: 0, width: 0 };
            const clientX = Number(event.clientX);
            const action = !Number.isFinite(clientX) || clientX < rect.left + rect.width / 2 ? 'prev' : 'next';
            if (root && root.getAttribute && root.getAttribute('data-igs-cg-only') === '1') return;
            if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction(action);
        });
    }
    if (dialog) {
        dialog.classList.toggle('igs-hidden', current.hidden);
    }
    if (toolbar) {
        toolbar.classList.toggle('igs-hidden', current.hidden);
    }
    applyToolbarState(root, current);
    applyReaderSettingsToDom(root, snapshot, current, { dialog, textEl, toolbar });
    applyReaderModeRuntime(root, snapshot, current, {
        isActiveReader: (reader) => (typeof ctx.isActiveReader === 'function' ? ctx.isActiveReader(reader) : true),
        requestClose: () => { if (typeof ctx.closeReader === 'function') ctx.closeReader(); },
        watchEmbeddedFrame: () => watchEmbeddedFrameResize(root, current && current.embeddedFrame),
    });
    if (textEl && typewriterRenderKey) {
        const typewriterSettings = snapshot.readerSettings.typewriter || {};
        const typewriter = applyTypewriterEffect(textEl, {
            // 漫画模式的台词在对话泡里整句弹出，隐藏的源文字不跑打字机。
            enabled: typewriterSettings.enabled === true && !comicActive,
            // 告白段打字机降一档、回答页文字出现前停顿（romance-moments）。
            speed: (romanceResult.typewriter && romanceResult.typewriter.speed) || typewriterSettings.speed,
            delay: romanceResult.typewriter && romanceResult.typewriter.delay,
            mode: typewriterSettings.mode,
            punctuationPause: typewriterSettings.punctuationPause === true,
            prosody: typewriterSettings.prosody === true,
            sound: typewriterSettings.sound,
            textType: typewriterTextType,
            speaker: snapshot.content.speaker || '',
            // 角色声线：情绪微调音高；立绘就是说话人本人时才按其位置分声道。亲密 / 情事声画开启且没有情绪时压成耳语。
            emotion: snapshot.content.statusEmotion || (romanceResult.whisper ? '耳语' : ''),
            posX: stageSprite && (!snapshot.content.spriteCharacter || snapshot.content.spriteCharacter === snapshot.content.speaker) ? stageSprite.posX : undefined,
            key: typewriterRenderKey,
            phone: fxResult.phone === true,
            // 恐怖题材的打字机特化：随恐怖档位变闷、变低（非恐怖时为 null，打字机原样）。
            horror: resolveHorrorTypewriterLevel(snapshot.readerSettings, resolveHorrorDread(snapshot.content.sceneDread, snapshot.readerSettings.horrorDreadCap)),
            // 水下：打字音变闷、冒泡，文字逐行浮起（不分世界观）。
            underwater: isUnderwaterScene(snapshot.content, snapshot.readerSettings),
        });
        armTextFx(textEl, typewriter && typewriter.animated ? typewriter.revealDelay : null);
    }
    if (textEl && typewriterRenderKey) {
        // 台词朗读与角色语气音二选一，朗读优先。去重只看消息与句序号，换主题、调字号等重绘不重播。
        const content = snapshot.content;
        const posX = stageSprite && (!content.spriteCharacter || content.spriteCharacter === content.speaker) ? stageSprite.posX : undefined;
        const mood = content.statusEmotion || (content.spriteCharacter === content.speaker ? content.spriteMood : '') || '';
        if (normalizeTtsSettings(snapshot.readerSettings.tts).enabled) applyTts(root, {
            key: `${snapshot.messageId}:${content.currentIndex}`,
            textType: typewriterTextType,
            text: content.displayText,
            speaker: content.speaker || '',
            mood,
            phone: fxResult.phone === true,
            nsfw: Boolean(content.sceneNsfw),
            posX,
            whisper: romanceResult.whisper === true,
            next: Array.isArray(content.segments) ? content.segments[content.currentIndex + 1] : '',
        }, snapshot.readerSettings.tts, snapshot.readerSettings._sceneAssets);
        else applyVoiceBark(root, {
            key: `${snapshot.messageId}:${content.currentIndex}`,
            textType: typewriterTextType,
            speaker: content.speaker || '',
            mood,
            phone: fxResult.phone === true,
            nsfw: Boolean(content.sceneNsfw),
            // 声像与力度：立绘就是说话人时按其位置分左右；亲密演出压成耳语时轻声贴耳。
            posX,
            whisper: romanceResult.whisper === true,
            // 场上角色的声线提前备好，第一次开口不用等下载。
            cast: [content.speaker, content.spriteCharacter, ...(Array.isArray(content.castSprites) ? content.castSprites.map((m) => m && m.character) : [])],
        }, snapshot.readerSettings.voiceBark, snapshot.readerSettings._sceneAssets);
    }
    // 漫画演出模式：台词排进竖排对话泡，底部对话框整个收起。
    const comicOpts = {
        dialog,
        textEl,
        sprite: fxSprite,
        cast: castFxTargets,
        renderKey: typewriterRenderKey,
        textType: typewriterTextType,
        whisper: Boolean(fxResult && fxResult.whisper),
        phone: Boolean(fxResult && fxResult.phone),
        isLastPage,
        theme: resolveActiveTheme(snapshot),
    };
    applyComicToDom(root, snapshot, comicOpts);
    if (toast) {
        toast.textContent = current.toastMessage || '';
        toast.style.opacity = current.toastMessage ? '1' : '0';
    }
}
