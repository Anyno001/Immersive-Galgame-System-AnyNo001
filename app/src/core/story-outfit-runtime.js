import { createStoryOutfitService } from '../generated-images/illustration/story-outfit-service.js';
import { resolveAssetScope, relocateLegacyCard, effectiveSceneAssets } from '../scene/asset-scope.js';
import { createOutfitResolver } from '../scene/character-outfits.js';
import { extractSceneDirectives } from '../scene/scene-directives.js';
import { storyOutfitSourceHash } from '../scene/outfit-review-store.js';
import { floorKeyOf } from '../media/illustration-store.js';
import { applyOperationEdits } from '../storage/operation-edits.js';

export function createStoryOutfitRuntime(deps) {
    let disposed = false, offReady = null;
    const listeners = new Set();
    function getContext(row) {
        if (disposed) return null;
        const host = deps.readContext();
        let messageId = row?.messageId;
        if (messageId == null) {
            const chat = host?.chat || [];
            for (let i = chat.length - 1; i >= 0; i--) {
                if (chat[i]?.is_user) break;
                if (chat[i] && !chat[i].is_system) { messageId = i; break; }
            }
        }
        if (messageId == null) return null;
        const floor = deps.messageHost.readFloor(Number(messageId));
        if (!floor?.isAi || !floor.chatId || floor.chatId !== deps.messageHost.getChatId()) return null;
        const bridge = deps.readBridge();
        const scope = resolveAssetScope(host);
        const root = structuredClone(bridge.sceneAssets || {});
        relocateLegacyCard(root, scope.key, scope.legacyKey);
        return { root, scopeKey: scope.key, floorKey: floorKeyOf(floor), messageId: Number(messageId),
            sourceHash: storyOutfitSourceHash(floor.text), text: floor.text,
            autoGenerate: bridge.autoIllustration?.assets?.outfitAutoGenerate === true };
    }
    const service = createStoryOutfitService({ storage: deps.storage, assets: deps.assets, getContext,
        commit(next, expected, guard) {
            if (disposed || !guard()) return { ok: false, reason: 'stale-target' };
            const before = deps.readBridge().sceneAssets;
            const merged = applyOperationEdits(expected, before, next);
            const result = deps.saveAssets(merged);
            if (result?.ok) {
                try { deps.onAssetsSaved?.(before, merged); } catch { /* 已保存结果不因展示失败重试。 */ }
            }
            return result;
        },
        onChanged() {
            for (const listener of [...listeners]) {
                try { listener(); } catch { /* 展示异常不影响原生成任务。 */ }
            }
        },
        onAutoResult(row, result) { deps.onAutoResult?.(row, result); },
    });
    return { ...service,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async processMessage(messageId) {
            const floor = deps.messageHost.readFloor(Number(messageId));
            if (disposed || !floor?.isAi || !floor.isLatest) return [];
            const context = getContext(floor);
            if (!context || !effectiveSceneAssets(context.root, context.scopeKey).enabled) return [];
            const assets = effectiveSceneAssets(context.root, context.scopeKey);
            const observed = service.observe(extractSceneDirectives(context.text,
                { outfitResolver: createOutfitResolver(assets) }).directives, context);
            return observed.ok ? service.autoGenerate(context) : [];
        },
        start() {
            if (disposed || offReady) return;
            const ready = id => this.processMessage(id);
            offReady = typeof deps.messageHost.onImageFloorReady === 'function'
                ? deps.messageHost.onImageFloorReady(ready)
                : deps.messageHost.on('CHARACTER_MESSAGE_RENDERED', ready);
        },
        dispose() {
            disposed = true; offReady?.(); offReady = null;
            listeners.clear(); service.dispose();
        },
    };
}
