import {
    ORIGINAL_READER_ICONS,
    ORIGINAL_READER_TOOLBAR_BUTTONS,
} from './original-reader-source.js';
import { TOOLBAR_ACTIONS } from './reader-host-constants.js';
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
import { computeLineHeight, igsDebug } from './reader-value-utils.js';
import {
    renderDialogueHtml,
    resolveActiveTheme,
    resolveSpriteLayout,
} from './settings-normalize.js';
import { applyReaderModeRuntime } from './reader-runtime.js';

export function createReaderButton(doc, id, title, html) {
    const button = doc.createElement('button');
    button.id = `igs-btn-${id}`;
    button.className = 'igs-icon-btn';
    button.type = 'button';
    button.setAttribute('data-act', id);
    button.setAttribute('title', title);
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

    const bgBlur = overlay.querySelector ? overlay.querySelector('#igs-bg-blur') : null;
    const bg = overlay.querySelector ? overlay.querySelector('#igs-bg') : null;
    const sprite = overlay.querySelector ? overlay.querySelector('#igs-sprite') : null;
    addClasses(bgBlur, 'igs-background-layer igs-background-blur-layer');
    addClasses(bg, 'igs-background-layer');
    addClasses(sprite, 'igs-character-layer');

    const optionBubbles = overlay.querySelector ? overlay.querySelector('#igs-option-bubbles') : null;
    const dialog = overlay.querySelector ? overlay.querySelector('#igs-dialog') : null;
    const toolbar = overlay.querySelector ? overlay.querySelector('#igs-ctrl-bar') : null;
    addClasses(toolbar, 'igs-toolbar');
    const optionLayer = ensureReaderLayer(doc, overlay, 'igs-option-layer', 'igs-choice-layer', dialog || toolbar);
    const dialogLayer = ensureReaderLayer(doc, overlay, 'igs-dialog-layer', 'igs-dialogue-layer', toolbar);
    const toolbarLayer = ensureReaderLayer(doc, overlay, 'igs-toolbar-layer', 'igs-hud-layer');
    ensureReaderLayer(doc, overlay, 'igs-db-layer', 'igs-system-layer');

    if (optionBubbles && optionLayer && optionBubbles.parentNode !== optionLayer) optionLayer.appendChild(optionBubbles);
    if (dialog && dialogLayer && dialog.parentNode !== dialogLayer) dialogLayer.appendChild(dialog);
    if (toolbar && toolbarLayer && toolbar.parentNode !== toolbarLayer) toolbarLayer.appendChild(toolbar);
    return overlay;
}

export function buildFallbackReaderOverlay(doc) {
    if (!doc || typeof doc.createElement !== 'function') return null;
    const overlay = doc.createElement('div');
    overlay.id = 'igs-overlay';

    const bgBlur = doc.createElement('div');
    bgBlur.id = 'igs-bg-blur';
    overlay.appendChild(bgBlur);

    const bg = doc.createElement('div');
    bg.id = 'igs-bg';
    overlay.appendChild(bg);

    const sprite = doc.createElement('div');
    sprite.id = 'igs-sprite';
    overlay.appendChild(sprite);

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

    ctrlBar.appendChild(createReaderButton(doc, 'toggle-bar', '收纳/展开按钮', ORIGINAL_READER_ICONS.toggleBar));
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

    const statusLine = doc.createElement('div');
    statusLine.id = 'igs-status-line';
    statusLine.className = 'igs-status-line';
    dialog.appendChild(statusLine);

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

    const spinner = doc.createElement('span');
    spinner.className = 'igs-spinner';
    sendStatus.appendChild(spinner);

    const sendStatusText = doc.createElement('span');
    sendStatusText.id = 'igs-send-status-text';
    sendStatusText.textContent = '已发送，等待 AI 回复…';
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

    const toast = doc.createElement('div');
    toast.id = 'igs-toast';
    toast.setAttribute('aria-live', 'polite');
    dialog.appendChild(toast);

    return normalizeReaderStableLayers(overlay);
}

export function buildFallbackSettingsOverlay(doc, snapshot, ctx = {}) {
    if (!doc || typeof doc.createElement !== 'function') return null;
    const overlay = doc.createElement('div');
    overlay.id = 'igs-unified-settings';
    overlay.setAttribute('data-igs-igs-ui', 'true');

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
    const readerSettings = current.snapshot && current.snapshot.readerSettings || {};
    const pins = new Set(Array.isArray(readerSettings.pinnedBtns) ? readerSettings.pinnedBtns : []);
    const hiddenSet = new Set(Array.isArray(readerSettings.hiddenBtns) ? readerSettings.hiddenBtns : []);
    const dockTop = readerSettings.toolbarDock === 'top';
    const order = Array.isArray(readerSettings.btnOrder) && readerSettings.btnOrder.length
        ? readerSettings.btnOrder
        : TOOLBAR_ACTIONS.map(([id]) => id);

    for (const id of order) {
        const button = root.querySelector(`#igs-btn-${id}`);
        if (!button) continue;
        if (hiddenSet.has(id)) {
            button.style.display = 'none';
        } else {
            button.style.display = '';
            // 顶部固定模式下，按钮区横向滚动；设置键固定到右侧不随之滚动。
            if ((pins.has(id) || (dockTop && id === 'settings')) && pinned) {
                pinned.appendChild(button);
            } else if (collapsible) {
                collapsible.appendChild(button);
            }
        }
    }

    if (collapsible) {
        collapsible.style.display = (current.toolbarCollapsed && !dockTop) ? 'none' : 'flex';
        collapsible.style.gap = '6px';
        collapsible.style.alignItems = 'center';
    }
    if (pinned) {
        pinned.style.display = 'flex';
        pinned.style.gap = '6px';
        pinned.style.alignItems = 'center';
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

export function applyReaderSettingsToDom(root, snapshot, current, refs = {}) {
    const dialog = refs.dialog || root.querySelector('#igs-dialog');
    const textEl = refs.textEl || root.querySelector('#igs-text');
    const toolbar = refs.toolbar || root.querySelector('#igs-ctrl-bar');
    const controls = root.querySelector('.igs-controls');
    const bg = root.querySelector('#igs-bg');
    const bgBlur = root.querySelector('#igs-bg-blur');
    const readerSettings = snapshot.readerSettings || {};
    const inlineMode = snapshot.mode === 'pc' || snapshot.mode === 'mobile';
    const win = getOwnerWindow(root);
    const overlayWidth = readElementWidth(root, win && win.innerWidth);
    const overlayHeight = readElementHeight(root, win && win.innerHeight);
    applyTransparentGlassMaterial(root, readerSettings.glassOpacity, {
        backdropFilter: readerSettings.glassBackdropFilter,
    });

    if (textEl) {
        textEl.style.fontSize = `${readerSettings.fontSize}px`;
        textEl.style.lineHeight = computeLineHeight(readerSettings.fontSize);
        // floating（pc/mobile）：正文恒交给 CSS 的 flex:1 1 auto + min-height:0 填充/滚动，
        // 对话框高度由下方 dialog.style.height 控制气泡盒本身（输入框留在变高后气泡底部）。
        // 非 floating（web/fullscreen）：对话框无固定上限，dialogHeight 直接撑正文 min-height。
        if (inlineMode || readerSettings.dialogHeight == null) {
            textEl.style.minHeight = '0';
        } else {
            textEl.style.minHeight = `${readerSettings.dialogHeight}px`;
        }
    }

    if (dialog) {
        if (inlineMode) {
            if (readerSettings.dialogHeight == null) {
                dialog.style.minHeight = '';
                dialog.style.maxHeight = '';
            } else {
                // floating 气泡：用 min-height 把气泡撑到 dialogHeight（内容更多时自然增长），
                // 再用 max-height clamp 到浮窗可用高度。不强制 height——固定 height 比内容还小时
                // 会把输入框挤出气泡。这样既能调高对话框，输入框又始终留在气泡底部。
                const maxBubble = Math.max(140, Math.floor((overlayHeight || 0) * 0.86) || readerSettings.dialogHeight);
                const target = Math.min(readerSettings.dialogHeight, maxBubble);
                dialog.style.minHeight = `${target}px`;
                dialog.style.maxHeight = `${maxBubble}px`;
            }
        } else {
            dialog.style.minHeight = '';
            dialog.style.maxHeight = '';
        }

        if (readerSettings.dialogWidth == null) {
            dialog.style.width = '';
        } else if (inlineMode) {
            const clampedWidth = Math.max(180, Math.min(readerSettings.dialogWidth, Math.max(180, (overlayWidth || readerSettings.dialogWidth) - 24)));
            dialog.style.width = `${clampedWidth}px`;
        } else {
            const viewportWidth = Number(win && win.innerWidth) || readerSettings.dialogWidth;
            dialog.style.width = `${Math.max(260, Math.min(readerSettings.dialogWidth, Math.max(260, viewportWidth - 8)))}px`;
        }
        dialog.style.background = '';
    }

    const toolbarDock = readerSettings.toolbarDock === 'top' ? 'top' : 'float';
    if (root && root.classList) {
        root.classList.toggle('igs-toolbar-top', toolbarDock === 'top');
    }
    if (toolbar) {
        toolbar.setAttribute('data-igs-toolbar-dock', toolbarDock);
        // 顶部固定栏铺满整条，不做缩放（缩放是悬浮小条用的，全宽栏缩放会从角落缩成异形）。
        if (toolbarDock === 'top') {
            toolbar.style.transform = '';
            toolbar.style.transformOrigin = '';
        } else {
            toolbar.style.transform = `scale(${Number(readerSettings.toolbarScale || 100) / 100})`;
            toolbar.style.transformOrigin = 'right bottom';
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
        bg.style.backgroundSize = readerSettings.imgMode === 'contain' ? 'contain' : 'cover';
        bg.style.backgroundColor = '#000';
        const brightness = Number(readerSettings.imgBrightness);
        bg.style.filter = `brightness(${(Number.isFinite(brightness) ? brightness : 88) / 100})`;
    }
    if (bgBlur) {
        bgBlur.style.backgroundSize = readerSettings.imgMode === 'contain' ? 'cover' : 'cover';
    }
}

export function applyAlignStyle(element, align) {
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

export function applyReaderSnapshotToDom(root, snapshot, current, ctx = {}) {
    root.className = snapshot.classes.join(' ');
    root.setAttribute('data-igs-igs-ui', 'true');

    const bg = root.querySelector('#igs-bg');
    const bgBlur = root.querySelector('#igs-bg-blur');
    const textEl = root.querySelector('#igs-text');
    const input = root.querySelector('#igs-input');
    const send = root.querySelector('#igs-send-btn');
    const dialog = root.querySelector('#igs-dialog');
    const toolbar = root.querySelector('#igs-ctrl-bar');
    const clickLayer = root.querySelector('#igs-click-layer');
    const toast = root.querySelector('#igs-toast');
    const segmentsLen = snapshot.content && Array.isArray(snapshot.content.segments) ? snapshot.content.segments.length : 0;
    const isLastPage = segmentsLen <= 0 || (snapshot.content && snapshot.content.currentIndex >= segmentsLen - 1);

    if (bg && snapshot.content.backgroundImage) {
        bg.style.backgroundImage = `url("${snapshot.content.backgroundImage.replace(/"/g, '&quot;')}")`;
        removeImageLoadingSpinner(bg);
        removeImageEmptyPlaceholder(bg);
    } else if (bg) {
        bg.style.backgroundImage = '';
        const expectsImage = snapshot.content.imageExpectedCount > 0
            && snapshot.content.imageBoundCount < snapshot.content.imageExpectedCount;
        if (expectsImage && snapshot.content.imageLoading) {
            removeImageEmptyPlaceholder(bg);
            ensureImageLoadingSpinner(bg);
        } else if (expectsImage) {
            ensureImageEmptyPlaceholder(bg, '图片未生成');
        } else {
            removeImageLoadingSpinner(bg);
            removeImageEmptyPlaceholder(bg);
        }
    }
    if (bgBlur && snapshot.content.backgroundImage) {
        bgBlur.style.backgroundImage = `url("${snapshot.content.backgroundImage.replace(/"/g, '&quot;')}")`;
        bgBlur.style.opacity = '0.72';
    } else if (bgBlur) {
        bgBlur.style.backgroundImage = '';
        bgBlur.style.opacity = '0';
    }
    const spriteEl = root.querySelector('#igs-sprite');
    if (spriteEl && snapshot.content.spriteImage) {
        spriteEl.style.backgroundImage = `url("${snapshot.content.spriteImage.replace(/"/g, '&quot;')}")`;
        spriteEl.style.display = 'block';
        spriteEl.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;transform:none;bottom:auto;left:auto';
        if (!current.spriteEditMode) {
            const spriteKey = snapshot.content.spriteCharacter || snapshot.content.speaker;
            const spriteMood = snapshot.content.spriteMood || '';
            const layout = resolveSpriteLayout(snapshot.readerSettings.spriteLayouts, snapshot.mode, spriteKey, spriteMood);
            spriteEl.style.backgroundSize = `${layout.scale}%`;
            spriteEl.style.backgroundPosition = `${layout.posX}% ${layout.posY}%`;
            igsDebug('[DEBUG-sprite] apply-layout', { mode: snapshot.mode, speaker: spriteKey, mood: spriteMood, index: snapshot.content.currentIndex, layoutKey: spriteKey ? `${snapshot.mode}::${spriteKey}::${spriteMood}` : snapshot.mode, layout: { ...layout } });
        }
    } else if (spriteEl) {
        spriteEl.style.backgroundImage = '';
        spriteEl.style.display = 'none';
    }
    if (textEl) {
        const theme = resolveActiveTheme(snapshot);
        const sceneAssetsEnabled = snapshot.readerSettings._sceneAssets && snapshot.readerSettings._sceneAssets.enabled;
        const textType = snapshot.content.textType || 'narration';
        textEl.innerHTML = renderDialogueHtml(snapshot.content.displayText, theme, sceneAssetsEnabled);
        textEl.style.fontSize = `${snapshot.readerSettings.fontSize}px`;
        textEl.style.lineHeight = computeLineHeight(snapshot.readerSettings.fontSize);
        textEl.style.marginTop = '';
        const isNarration = textType === 'narration';
        const isThought = textType === 'thought';
        const segFont = isThought ? theme.thoughtFont : isNarration ? theme.narrationFont : theme.textFont;
        const segColor = isThought ? theme.thoughtColor : isNarration ? theme.narrationColor : theme.textColor;
        const segAlign = isThought ? theme.thoughtAlign : isNarration ? theme.narrationAlign : theme.textAlign;
        applyAlignStyle(textEl, sceneAssetsEnabled ? segAlign : '');
        if (sceneAssetsEnabled && segFont && segFont !== 'inherit') {
            textEl.style.fontFamily = segFont;
        } else {
            textEl.style.fontFamily = '';
        }
        if (sceneAssetsEnabled && segColor) {
            textEl.style.color = segColor;
        } else {
            textEl.style.color = '';
        }
    }
    const speakerEl = root.querySelector('#igs-speaker');
    if (speakerEl) {
        const theme = resolveActiveTheme(snapshot);
        const sceneAssetsEnabled = snapshot.readerSettings._sceneAssets && snapshot.readerSettings._sceneAssets.enabled;
        if (sceneAssetsEnabled && snapshot.content.speaker) {
            speakerEl.textContent = snapshot.content.speaker;
            speakerEl.style.display = 'block';
            applyAlignStyle(speakerEl, theme.nameAlign);
            speakerEl.style.fontFamily = theme.nameFont && theme.nameFont !== 'inherit' ? theme.nameFont : '';
            speakerEl.style.color = theme.nameColor || '';
        } else {
            speakerEl.style.display = 'none';
        }
    }
    const dividerEl = root.querySelector('#igs-divider');
    if (dividerEl) {
        const theme = resolveActiveTheme(snapshot);
        const sceneAssetsEnabled = snapshot.readerSettings._sceneAssets && snapshot.readerSettings._sceneAssets.enabled;
        if (sceneAssetsEnabled && snapshot.content.speaker && theme.dividerSymbol !== 'none') {
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
    const statusLine = root.querySelector('#igs-status-line');
    if (statusLine) {
        // 居中显示在气泡底部；最后一页不显示；仍受「显示状态行」开关控制。
        if (snapshot.readerSettings.showStatusLine && !isLastPage) {
            statusLine.textContent = snapshot.content.progress;
            statusLine.style.display = 'block';
        } else {
            statusLine.style.display = 'none';
        }
    }
    const controls = root.querySelector('.igs-controls');
    if (controls) {
        // 输入区（含输入框、发送按钮、上方分割线）只在最后一页显示。
        controls.style.display = isLastPage ? '' : 'none';
    }
    if (dialog) {
        const sceneAssetsEnabled = snapshot.readerSettings._sceneAssets && snapshot.readerSettings._sceneAssets.enabled;
        dialog.style.paddingTop = (sceneAssetsEnabled && snapshot.content.speaker) ? '4px' : '';
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
    if (clickLayer && !(clickLayer.dataset && clickLayer.dataset.igsBound)) {
        if (clickLayer.dataset) clickLayer.dataset.igsBound = '1';
        clickLayer.addEventListener('click', () => {
            if (current.dragSuppressClick || (current.runtime && current.runtime.dragSuppressClick)) {
                current.dragSuppressClick = false;
                if (current.runtime) current.runtime.dragSuppressClick = false;
                return;
            }
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
        });
    }
    if (dialog && !(dialog.dataset && dialog.dataset.igsBound)) {
        if (dialog.dataset) dialog.dataset.igsBound = '1';
        dialog.addEventListener('click', (event) => {
            if (current.hidden) return;
            if (event.target && event.target.closest && (
                event.target.closest('.igs-controls')
                || event.target.closest('#igs-ctrl-bar')
                || event.target.closest('#igs-settings')
            )) {
                return;
            }
            const rect = typeof dialog.getBoundingClientRect === 'function'
                ? dialog.getBoundingClientRect()
                : { left: 0, width: 0 };
            const clientX = Number(event.clientX);
            if (!Number.isFinite(clientX) || clientX < rect.left + rect.width / 2) {
                if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction('prev');
            } else {
                if (typeof ctx.handleReaderAction === 'function') ctx.handleReaderAction('next');
            }
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
    });
    if (toast) {
        toast.textContent = current.toastMessage || '';
        toast.style.opacity = current.toastMessage ? '1' : '0';
    }
}
