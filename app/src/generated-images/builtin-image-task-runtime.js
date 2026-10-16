import { createImageTaskRuntime } from './image-task-runtime.js';
import { createDefaultImagePromptPreset } from './image-prompt-defaults.js';
import { normalizeAutoIllustrationSettings } from './illustration/auto-illustration-settings.js';
import { normalizeItemImageSettings } from './illustration/item-image-settings.js';
import { normalizeSourceFilter } from '../scene/message-source.js';

// 装配层读取生效配置；底层租约不能依赖提示词和配置归一化，避免 ESM 初始化环。
export function imageTaskConfig(bridge = {}) {
    const api = bridge.imageApi || {};
    const autoIllustration = normalizeAutoIllustrationSettings(bridge.autoIllustration);
    // 库条目尚未应用时只是管理资料，不参与发送或使在途任务失效。
    delete autoIllustration.nai.artistLibrary;
    return { imageApi: {
        mode: String(api.mode || 'nai').trim().toLowerCase(),
        ...Object.fromEntries(['cgModel', 'spriteModel', 'backgroundModel', 'itemModel']
            .map(key => [key, String(api[key] || '').trim()])),
        dbgenSpriteTransparent: api.dbgenSpriteTransparent !== false,
        naiSpriteTransparent: api.naiSpriteTransparent !== false,
    }, autoIllustration,
        itemImages: normalizeItemImageSettings(bridge.itemImages),
        sourceFilter: normalizeSourceFilter(bridge.sourceFilter) };
}

// 相关设置只在成功提交通知后观察；角色／衣柜资料保存不改变绘图配置租约。
export function createBuiltinImageTaskRuntime({ readBridge, registry, subscribeSettings } = {}) {
    return createImageTaskRuntime({
        initialize: () => registry.ensureImagePromptDefault(createDefaultImagePromptPreset()),
        readState() {
            const epoch = registry.getImagePromptEpoch?.();
            if (epoch == null || registry.getStatus?.().ok !== true) throw new Error('preset-unavailable');
            return { config: imageTaskConfig(readBridge()), presetEpoch: epoch };
        },
        subscribe(refresh) {
            const offSettings = subscribeSettings?.(refresh);
            const offPreset = registry.onImagePromptChanged?.(refresh);
            return () => { offSettings?.(); offPreset?.(); };
        },
    });
}
