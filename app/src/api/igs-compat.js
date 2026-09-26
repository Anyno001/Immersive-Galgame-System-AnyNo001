import { resolveLegacyReaderMode } from '../storage/legacy-igs.js';
import { parseSceneText } from '../scene/text-parser.js';
import { buildIgsTextPayload, getMessagePrimaryText } from '../scene/message-source.js';
import { extractSceneDirectives, resolveLatestSceneDirective } from '../scene/scene-directives.js';
import { PUBLIC_READER_MODES } from '../schemas/reader-mode.js';

export function createIgsCompatApi(app) {
    return {
        openSettings(options = {}) {
            const payload = cloneData(options);
            if (app.events && typeof app.events.emit === 'function') {
                app.events.emit('igs:settings-requested', payload);
            }
            if (!app.igsUi || typeof app.igsUi.openSettings !== 'function') {
                return { ok: false, reason: 'settings-ui-not-mounted', options: payload };
            }
            return app.igsUi.openSettings(payload);
        },

        getConfig() {
            return cloneData(app.getState().config || {});
        },

        getUnifiedSettings(options = {}) {
            if (typeof app.getUnifiedSettingsSnapshot === 'function') {
                return app.getUnifiedSettingsSnapshot(options);
            }

            const legacy = getLegacySettings(app);
            const bridge = cloneData(app.getState().config || {});
            const readerMode = resolveReaderMode(options, legacy, bridge);
            const readerSettingsByMode = legacy.readerSettingsByMode || {};
            // 全模式共用 default 桶；老用户 default 空时回退旧分桶。
            const hasKeys = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length > 0;
            const readerSettings = cloneData(
                hasKeys(readerSettingsByMode['default']) ? readerSettingsByMode['default']
                    : hasKeys(readerSettingsByMode[readerMode]) ? readerSettingsByMode[readerMode]
                    : legacy.readerSettings || {}
            );

            return {
                version: app.version,
                bridge,
                imageApi: cloneData(bridge.imageApi || {}),
                readerMode,
                readerSettings,
            };
        },

        async openViewerFromMessage(messageId, mode, openOptions = {}) {
            const normalizedId = normalizeMessageId(messageId);
            const resolved = normalizeViewerRequest(mode, openOptions);
            const readerMode = resolveReaderMode({ mode: resolved.mode }, getLegacySettings(app), app.getState().config || {});
            if (normalizedId == null) {
                return { ok: false, reason: 'invalid-message-id', messageId, mode: readerMode, options: cloneViewerOptions(resolved.options) };
            }
            if (!app.hostAdapter || typeof app.hostAdapter.getMessageById !== 'function') {
                return { ok: false, reason: 'message-lookup-not-supported', messageId: normalizedId, mode: readerMode };
            }
            const message = resolved.options.message || await app.hostAdapter.getMessageById(normalizedId);
            if (!message) {
                return { ok: false, reason: 'message-not-found', messageId: normalizedId, mode: readerMode };
            }
            const readerPayload = await buildReaderPayload(app, message, normalizedId, readerMode);
            const refreshed = await app.refresh({
                message,
                messageId: normalizedId,
                viewerMode: readerMode,
                textScene: readerPayload.textScene,
            });
            const basePayload = {
                ...readerPayload,
                render: refreshed.render,
                scene: refreshed.scene,
                startAtEnd: resolved.options.startAtEnd === true,
            };
            const payload = resolved.options.skipImageCollection === true
                ? basePayload
                : await enrichReaderPayload(app, basePayload);
            if (resolved.options.replaceActive === true
                && app.igsUi && typeof app.igsUi.replaceReader === 'function') {
                const reader = app.igsUi.replaceReader({
                    ...payload,
                    startAtEnd: false,
                }, {
                    keepEmbeddedMount: resolved.options.keepEmbeddedMount === true,
                    turnOffset: resolved.options.turnOffset,
                });
                return {
                    ...refreshed,
                    ok: refreshed.ok !== false && reader.ok !== false,
                    ...(reader.ok === false ? { reason: reader.reason } : {}),
                    reader,
                };
            }
            return openReaderUi(app, {
                ...payload,
            }, refreshed);
        },

        async openLatestAvailable(mode, options = {}) {
            const readerMode = resolveReaderMode({ mode }, getLegacySettings(app), app.getState().config || {});
            if (!app.hostAdapter || typeof app.hostAdapter.getCurrentMessage !== 'function') {
                return { ok: false, reason: 'missing-host-message-api', mode: readerMode, options: cloneData(options) };
            }
            const message = await app.hostAdapter.getCurrentMessage();
            if (!message) {
                return { ok: false, reason: 'no-message', mode: readerMode, options: cloneData(options) };
            }
            const readerPayload = await buildReaderPayload(app, message, message.id, readerMode);
            const refreshed = await app.refresh({
                message,
                messageId: message.id,
                viewerMode: readerMode,
                textScene: readerPayload.textScene,
            });
            const payload = await enrichReaderPayload(app, {
                ...readerPayload,
                render: refreshed.render,
                scene: refreshed.scene,
            });
            return openReaderUi(app, {
                ...payload,
            }, refreshed);
        },

        generateImage(request, options = {}) {
            if (typeof app.generateImage === 'function') {
                return app.generateImage(request, options);
            }
            return {
                ok: false,
                reason: 'provider-not-enabled',
                request: cloneData(request),
                options: cloneData(options),
            };
        },
    };
}

function getLegacySettings(app) {
    if (!app || typeof app.getLegacyIgsSettings !== 'function') {
        return {
            ok: true,
            bridge: {},
            displayMode: '',
            readerMode: 'pc',
            readerSettings: {},
            readerSettingsByMode: {},
        };
    }
    return app.getLegacyIgsSettings();
}

function resolveReaderMode(options, legacySettings, bridgeConfig) {
    const requestedMode = options && typeof options === 'object' ? options.mode : options;
    const legacyDisplayMode = legacySettings && legacySettings.ok !== false ? legacySettings.displayMode : '';
    const legacyBridge = legacySettings && legacySettings.ok !== false ? legacySettings.bridge : {};
    const resolved = resolveLegacyReaderMode(
        requestedMode,
        legacyDisplayMode,
        bridgeConfig && Object.keys(bridgeConfig).length ? bridgeConfig : legacyBridge,
    );
    return PUBLIC_READER_MODES.includes(resolved) ? resolved : 'pc';
}

function normalizeMessageId(messageId) {
    const value = Number(messageId);
    if (!Number.isFinite(value) || value < 0) return null;
    return value;
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}

// 跨楼层场景追溯：AI 偶尔在 content 正文后不落 [igs-scene:] 标签，导致本楼
// 无场景指令、背景/地点栏退化为空。此时向前最多追溯 3 个 AI 楼层
// （getAdjacentMessage 已排除 user/system/hidden 楼层），取最近一条场景指令继承。
// 只有这一条追溯链：追溯结果只影响场景背景/地点栏，不写入 sceneDirectives，
// 不改变立绘与分页归属。本楼有自己的场景标签时同样计算——「正文—标签—正文」
// 楼层中标签之前的段落没有本楼场景可归属，由消费点回退到这里的继承场景。
const INHERITED_SCENE_MAX_FLOORS = 3;

async function resolveInheritedSceneState(app, visualNovelText, messageId) {
    if (!app || !app.hostAdapter || typeof app.hostAdapter.getAdjacentMessage !== 'function') return null;
    const normalizedId = Number(messageId);
    if (!Number.isFinite(normalizedId) || normalizedId < 0) return null;

    let cursor = normalizedId;
    for (let depth = 0; depth < INHERITED_SCENE_MAX_FLOORS; depth += 1) {
        let previous = null;
        try {
            previous = await app.hostAdapter.getAdjacentMessage(cursor, -1);
        } catch (error) {
            return null;
        }
        if (!previous || previous.id == null || Number(previous.id) === cursor) return null;
        cursor = Number(previous.id);
        const inherited = resolveLatestSceneDirective(
            extractSceneDirectives(getMessagePrimaryText(previous)).directives,
        );
        if (inherited) return { ...inherited, inheritedFromMessageId: cursor };
    }
    return null;
}


async function buildReaderPayload(app, message, messageId, readerMode) {
    const unifiedSettings = typeof app.getUnifiedSettingsSnapshot === 'function'
        ? app.getUnifiedSettingsSnapshot({ mode: readerMode })
        : null;
    const bridge = cloneData(
        unifiedSettings && unifiedSettings.bridge && typeof unifiedSettings.bridge === 'object'
            ? unifiedSettings.bridge
            : app.getState().config || {},
    );
    const visualNovelText = buildIgsTextPayload(message, {
        sourceFilter: bridge.sourceFilter,
        virtualRegex: bridge.virtualRegex,
        sceneAssets: bridge.sceneAssets,
        sentencePaging: bridge.sentencePaging,
    });
    // 跨楼层场景追溯只在场景素材模式启用时发生；本楼没有任何场景指令时
    // （AI 漏发 [igs-scene:]，正文照常输出）才向前最多追溯 3 个 AI 楼层。
    const sceneAssetsEnabled = Boolean(bridge.sceneAssets && bridge.sceneAssets.enabled);
    const inheritedSceneState = sceneAssetsEnabled
        ? await resolveInheritedSceneState(app, visualNovelText, messageId)
        : null;
    const textScene = parseSceneText(
        visualNovelText.formattedText || visualNovelText.visibleText || visualNovelText.cleanedRaw || '',
        { messageId },
    );
    const readerText = Array.isArray(visualNovelText.textSegments) && visualNovelText.textSegments.length
        ? visualNovelText.textSegments.join('\n')
        : textScene.text;

    return {
        ...visualNovelText,
        inheritedSceneState,
        message,
        messageId,
        mode: readerMode,
        viewerMode: readerMode,
        sourceFilter: bridge.sourceFilter,
        virtualRegex: bridge.virtualRegex,
        textScene: {
            ...textScene,
            text: readerText,
        },
    };
}

async function enrichReaderPayload(app, payload) {
    if (!app || typeof app.collectMessageImages !== 'function') {
        return payload;
    }
    const preferredImageIndex = resolvePreferredImageIndex(payload);
    const imageState = await app.collectMessageImages({
        message: payload.message,
        messageId: payload.messageId,
        scene: payload.scene,
        render: payload.render,
        currentIndex: payload.startAtEnd === true ? Number.MAX_SAFE_INTEGER : 0,
        textIndex: payload.startAtEnd === true
            ? resolveLastTextIndex(payload)
            : 0,
        preferredImageIndex,
        imageSource: payload.imageSource,
        imageSlots: payload.imageSlots,
        segmentImageSlots: payload.segmentImageSlots,
        requiresMessageScope: Array.isArray(payload.imageSlots) && payload.imageSlots.length > 0,
        mode: payload.mode,
    });
    return {
        ...payload,
        imageState,
    };
}

function openReaderUi(app, payload, refreshed) {
    if (!app.igsUi || typeof app.igsUi.openReader !== 'function') {
        return refreshed;
    }
    const reader = app.igsUi.openReader(payload, { mode: payload.mode });
    return {
        ...refreshed,
        ok: refreshed.ok !== false && reader.ok !== false,
        ...(reader.ok === false ? { reason: reader.reason } : {}),
        reader,
    };
}

function normalizeViewerRequest(mode, openOptions) {
    if (mode && typeof mode === 'object' && !Array.isArray(mode)) {
        return {
            mode: mode.mode,
            options: cloneViewerOptions(mode),
        };
    }
    return {
        mode,
        options: cloneViewerOptions(openOptions || {}),
    };
}

function cloneViewerOptions(options = {}) {
    const clone = { ...options };
    if (Object.prototype.hasOwnProperty.call(clone, 'message')) {
        clone.message = options.message || null;
    }
    return clone;
}

function resolveLastTextIndex(payload) {
    const textSegments = Array.isArray(payload && payload.textSegments) ? payload.textSegments : [];
    return textSegments.length ? textSegments.length - 1 : 0;
}

function resolvePreferredImageIndex(payload) {
    const segmentImageSlots = Array.isArray(payload && payload.segmentImageSlots)
        ? payload.segmentImageSlots
        : [];
    if (!segmentImageSlots.length) return 0;
    const textIndex = payload && payload.startAtEnd === true
        ? segmentImageSlots.length - 1
        : 0;
    const preferred = Number(segmentImageSlots[textIndex]);
    if (!Number.isFinite(preferred) || preferred < 0) return 0;
    return Math.floor(preferred);
}
