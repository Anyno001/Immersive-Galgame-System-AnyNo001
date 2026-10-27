import { createImageTaskRuntime } from './image-task-runtime.js';
import { createBuiltinImagePromptPresets } from './image-prompt-defaults.js';
import { normalizeAutoIllustrationSettings } from './illustration/auto-illustration-settings.js';
import { normalizeItemImageSettings } from './illustration/item-image-settings.js';
import { normalizeSourceFilter } from '../scene/message-source.js';
import { normalizeImageSourceMode } from './image-backend.js';

// 装配层读取生效配置；底层租约不能依赖提示词和配置归一化，避免 ESM 初始化环。
export function imageTaskConfig(bridge = {}) {
    const api = bridge.imageApi || {};
    const autoIllustration = normalizeAutoIllustrationSettings(bridge.autoIllustration);
    // 库条目尚未应用时只是管理资料，不参与发送或使在途任务失效。
    delete autoIllustration.nai.artistLibrary;
    delete autoIllustration.nai.artistLibraryArchived;
    return { imageApi: {
        mode: normalizeImageSourceMode(api.mode),
        ...Object.fromEntries(['cgModel', 'spriteModel', 'backgroundModel', 'itemModel']
            .map(key => [key, String(api[key] || '').trim()])),
        dbgenSpriteTransparent: api.dbgenSpriteTransparent !== false,
        naiSpriteTransparent: api.naiSpriteTransparent !== false,
        spriteMatteColor: String(api.spriteMatteColor || 'auto'),
        externalSpriteDna: api.externalSpriteDna === true,
    }, autoIllustration,
        itemImages: normalizeItemImageSettings(bridge.itemImages),
        sourceFilter: normalizeSourceFilter(bridge.sourceFilter) };
}

// 相关设置只在成功提交通知后观察；角色／衣柜资料保存不改变绘图配置租约。
export function createBuiltinImageTaskRuntime({ readBridge, registry, subscribeSettings, global = globalThis } = {}) {
    return createImageTaskRuntime({
        global,
        initialize: () => imageTaskConfig(readBridge()).imageApi.mode === 'nai'
            ? registry.ensureImagePromptDefault(createBuiltinImagePromptPresets()) : { ok: true },
        readState() {
            const config = imageTaskConfig(readBridge());
            if (config.imageApi.mode !== 'nai') return { config };
            const epoch = registry.getImagePromptEpoch?.();
            if (epoch == null || registry.getStatus?.().ok !== true) throw new Error('preset-unavailable');
            return { config, presetEpoch: epoch, promptPreset: registry.getCurrent('prompt-preset') };
        },
        subscribe(refresh) {
            const offSettings = subscribeSettings?.(refresh);
            const offPreset = registry.onImagePromptChanged?.(refresh);
            return () => { offSettings?.(); offPreset?.(); };
        },
    });
}
