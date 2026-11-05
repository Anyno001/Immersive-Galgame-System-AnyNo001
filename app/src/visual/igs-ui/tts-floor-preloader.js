import { normalizeTtsSettings, prefetchTtsFloor } from './tts.js';
import { clearTtsFloorAudioCache } from './tts-floor-audio-cache.js';
import { ttsFloorLines } from './tts-floor-plan.js';

export function createTtsFloorPreloader({ prepare, onFloorReady, onInvalidated, onProgress = () => {}, prefetch = prefetchTtsFloor } = {}) {
    let current = null, lastFloor = null, disposed = false;

    function invalidate(keepAudio = false) {
        current?.controller.abort();
        current = null;
        if (!keepAudio) clearTtsFloorAudioCache();
    }

    function startPrepared(prepared, readerSettings, { identity = '', userName = '' } = {}) {
        if (disposed) return null;
        const tts = normalizeTtsSettings(readerSettings.tts);
        if (!tts.enabled || !tts.api.prefetchFloor || (tts.provider !== 'api' && !tts.narratorApi.enabled)) {
            invalidate();
            return null;
        }
        const assets = readerSettings._sceneAssets;
        const settingsKey = JSON.stringify([{ ...tts, api: { ...tts.api, voiceLibrary: undefined }, narratorApi: { ...tts.narratorApi, voiceLibrary: undefined } }, readerSettings.chatShow, readerSettings.systemRole, readerSettings.romanceFx, userName,
            assets?.characterVoices, assets?.characterDna, assets?.characterAliases, assets?.generated?.characterAliases,
            readerSettings._tempSpriteTags]);
        if (current && current.identity === identity && current.source === prepared.source && current.settingsKey === settingsKey) return current.promise;
        invalidate(current?.identity === identity && current?.settingsKey === settingsKey);
        const task = { identity, source: prepared.source, settingsKey, controller: new AbortController(), progress: null };
        current = task;
        const lines = ttsFloorLines(prepared, readerSettings, { userName });
        task.promise = prefetch(lines, tts, assets, {
            identity,
            signal: task.controller.signal,
            alive: () => current === task && !disposed,
            onProgress(progress) {
                if (current !== task) return;
                task.progress = progress;
                onProgress(progress);
            },
        }).catch(() => 0);
        return task.promise;
    }

    function startFloor(floor) {
        if (disposed || !floor?.isAi) return null;
        lastFloor = floor;
        const plan = prepare?.(floor);
        if (!plan) { invalidate(); return null; }
        return startPrepared(plan.prepared, plan.readerSettings, {
            identity: `${floor.chatId}|${floor.messageId}|${floor.swipeId || 0}`, userName: plan.userName,
        });
    }

    const offReady = onFloorReady?.(startFloor) || (() => {});
    const offInvalidated = onInvalidated?.(() => { lastFloor = null; invalidate(); }) || (() => {});
    return {
        startFloor, startPrepared, invalidate,
        refresh: () => lastFloor ? startFloor(lastFloor) : null,
        getProgress: () => current?.progress ? { ...current.progress } : null,
        dispose() { disposed = true; offReady(); offInvalidated(); invalidate(); },
    };
}
