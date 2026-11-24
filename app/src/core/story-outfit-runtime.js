import { createStoryOutfitService } from '../generated-images/illustration/story-outfit-service.js';
import { resolveAssetScope, relocateLegacyCard, effectiveSceneAssets } from '../scene/asset-scope.js';
import { createOutfitResolver } from '../scene/character-outfits.js';
import { extractSceneDirectives } from '../scene/scene-directives.js';
import { visibleDirectiveSource } from '../scene/message-source.js';
import { storyOutfitSourceHash } from '../scene/outfit-review-store.js';
import { floorKeyOf } from '../media/illustration-store.js';
import { applyOperationEdits } from '../storage/operation-edits.js';

export function createStoryOutfitRuntime(deps) {
    let disposed = false, offReady = null;
    const listeners = new Set();
    const readSourceFilter = () => (typeof deps.getSourceFilter === 'function' ? deps.getSourceFilter() : deps.readBridge?.()?.sourceFilter);
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
    // 观察本楼剧情衣装前，先为未有立绘的出场角色按首个登场标签的服装建立立绘占位（含默认衣装），
    // 再用更新后的衣装表提取指令：首套服装归入默认衣装不重复询问，其余服装挂在该角色占位下入库衣柜。
    function prepareFloorDirectives(context) {
        if (!context) return { context: null, directives: [] };
        const visibleText = visibleDirectiveSource(context.text, readSourceFilter());
        let liveContext = context;
        let assets = effectiveSceneAssets(liveContext.root, liveContext.scopeKey);
        const initialDirectives = extractSceneDirectives(visibleText, { outfitResolver: createOutfitResolver(assets) }).directives;
        if (typeof deps.ensurePortraitPlaceholders === 'function') {
            const firstByCharacter = new Map();
            for (const d of initialDirectives) {
                if ((d?.type !== 'char' && d?.type !== 'thought') || !d.character) continue;
                if (!firstByCharacter.has(d.character)) {
                    firstByCharacter.set(d.character, d.unknownOutfit || d.outfit || '');
                }
            }
            if (firstByCharacter.size) {
                const entries = [...firstByCharacter.entries()].map(([name, outfitName]) => ({ name, outfitName }));
                try {
                    const ensured = deps.ensurePortraitPlaceholders(entries);
                    if (ensured?.ok && ensured.changed) {
                        const refreshed = getContext(liveContext);
                        if (refreshed) {
                            liveContext = refreshed;
                        } else {
                            const latestRoot = structuredClone(deps.readBridge?.()?.sceneAssets || liveContext.root || {});
                            relocateLegacyCard(latestRoot, liveContext.scopeKey, null);
                            liveContext = { ...liveContext, root: latestRoot };
                        }
                        assets = effectiveSceneAssets(liveContext.root, liveContext.scopeKey);
                        return {
                            context: liveContext,
                            directives: extractSceneDirectives(visibleText, { outfitResolver: createOutfitResolver(assets) }).directives,
                        };
                    }
                } catch { /* 占位写入失败时仍继续按现有素材观察 */ }
            }
        }
        return { context: liveContext, directives: initialDirectives };
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
        prepareFloorDirectives,
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        async processMessage(messageId) {
            const floor = deps.messageHost.readFloor(Number(messageId));
            if (disposed || !floor?.isAi || !floor.isLatest) return [];
            // 论坛体屏蔽生图时剧情衣装也不入库。
            if (deps.readBridge().imagesBlocked === true) return [];
            const context = getContext(floor);
            if (!context || !effectiveSceneAssets(context.root, context.scopeKey).enabled) return [];
            const prepared = prepareFloorDirectives(context);
            if (!prepared.context) return [];
            const observed = service.observe(prepared.directives, prepared.context);
            return observed.ok ? service.autoGenerate(prepared.context) : [];
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
