import { DEFAULT_VIRTUAL_REGEX } from '../../scene/message-source.js';
import { cloneData } from './reader-value-utils.js';
import { DEFAULT_SCENE_PROMPT_RULE, TOOLBAR_ACTIONS } from './reader-host-constants.js';
import { DEFAULT_MOOD_GROUPS, normalizeMoodGroups } from '../../scene/mood-groups.js';
import { loadScenePresets, saveScenePresets } from '../../scene/scene-preset-store.js';

function decodeSeg(value) {
    try { return decodeURIComponent(String(value == null ? '' : value)); }
    catch (error) { return String(value == null ? '' : value); }
}

export async function handleSettingsAction(action, ctx) {
    const {
        state,
        options,
        closeSettings,
        persistSettingsDraft,
        rerenderSettings,
        buildRegexPreview,
    } = ctx;

    if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
    const normalizedAction = String(action || '').trim();
    const settingsState = state.activeSettings;

    if (normalizedAction === 'close') {
        return closeSettings();
    }

    if (normalizedAction === 'reset-virtual-regex') {
        settingsState.draft.bridge.virtualRegex = cloneData(DEFAULT_VIRTUAL_REGEX);
        settingsState.asyncState.virtualRegexPreview = '已恢复默认正文替换，已自动保存。';
        persistSettingsDraft();
        return rerenderSettings();
    }

    if (normalizedAction === 'test-virtual-regex') {
        settingsState.asyncState.virtualRegexPreview = buildRegexPreview(settingsState.draft.bridge);
        return rerenderSettings();
    }

    if (normalizedAction === 'fetch-image-models') {
        if (typeof options.fetchImageModels !== 'function') {
            settingsState.asyncState.imageModelsMessage = '当前未接入内置图像模型拉取能力。';
            return rerenderSettings();
        }
        const result = await options.fetchImageModels({
            settings: cloneData(settingsState.draft),
            message: state.activeReader && state.activeReader.payload && state.activeReader.payload.message || null,
            mode: settingsState.readerMode,
        });
        if (!result || result.ok === false) {
            settingsState.asyncState.imageModelsMessage = String(result && result.reason || '图像模型拉取失败');
            return rerenderSettings();
        }
        settingsState.draft.bridge.imageApi.availableModels = Array.isArray(result.models)
            ? result.models.filter(Boolean)
            : [];
        settingsState.draft.bridge.imageApi.modelsFetchedAt = String(result.modelsFetchedAt || new Date().toISOString());
        settingsState.asyncState.imageModelsMessage = String(result.message || `已拉取 ${settingsState.draft.bridge.imageApi.availableModels.length} 个模型。`);
        persistSettingsDraft();
        return rerenderSettings();
    }

    if (normalizedAction === 'test-image') {
        if (typeof options.testImageApi !== 'function') {
            settingsState.asyncState.imageResult = '当前未接入图像测试能力。';
            return rerenderSettings();
        }
        const result = await options.testImageApi({
            settings: cloneData(settingsState.draft),
            message: state.activeReader && state.activeReader.payload && state.activeReader.payload.message || null,
            mode: settingsState.readerMode,
        });
        settingsState.asyncState.imageResult = String(
            result && (result.message || result.reason)
            || (settingsState.draft.bridge.imageApi.mode === 'nai'
                ? '图像 API 生成测试失败。'
                : '插图扩展检测失败。'),
        );
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toggle-toolbar-pin:')) {
        const id = normalizedAction.slice('toggle-toolbar-pin:'.length);
        const allowed = TOOLBAR_ACTIONS.some(([actionId]) => actionId === id);
        if (!allowed) return { ok: false, reason: 'unknown-toolbar-pin', id };
        const currentPins = Array.isArray(settingsState.draft.readerSettings.pinnedBtns)
            ? settingsState.draft.readerSettings.pinnedBtns.slice()
            : [];
        const currentHidden = Array.isArray(settingsState.draft.readerSettings.hiddenBtns)
            ? settingsState.draft.readerSettings.hiddenBtns.slice()
            : [];
        const index = currentPins.indexOf(id);
        if (index >= 0) {
            currentPins.splice(index, 1);
        } else {
            if (!currentHidden.includes(id)) currentPins.push(id);
        }
        settingsState.draft.readerSettings.pinnedBtns = currentPins;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toolbar-toggle-visible:')) {
        const id = normalizedAction.slice('toolbar-toggle-visible:'.length);
        const allowed = TOOLBAR_ACTIONS.some(([actionId]) => actionId === id);
        if (!allowed) return { ok: false, reason: 'unknown-toolbar-btn', id };
        const currentHidden = Array.isArray(settingsState.draft.readerSettings.hiddenBtns)
            ? settingsState.draft.readerSettings.hiddenBtns.slice()
            : [];
        const idx = currentHidden.indexOf(id);
        if (idx >= 0) {
            currentHidden.splice(idx, 1);
        } else {
            currentHidden.push(id);
            const currentPins = Array.isArray(settingsState.draft.readerSettings.pinnedBtns)
                ? settingsState.draft.readerSettings.pinnedBtns.slice()
                : [];
            const pinIdx = currentPins.indexOf(id);
            if (pinIdx >= 0) {
                currentPins.splice(pinIdx, 1);
                settingsState.draft.readerSettings.pinnedBtns = currentPins;
            }
        }
        settingsState.draft.readerSettings.hiddenBtns = currentHidden;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toolbar-move-up:')) {
        const id = normalizedAction.slice('toolbar-move-up:'.length);
        const order = Array.isArray(settingsState.draft.readerSettings.btnOrder)
            ? settingsState.draft.readerSettings.btnOrder.slice()
            : TOOLBAR_ACTIONS.map(([actionId]) => actionId);
        const currentIndex = order.indexOf(id);
        if (currentIndex <= 0) return { ok: true, reason: 'already-first' };
        [order[currentIndex - 1], order[currentIndex]] = [order[currentIndex], order[currentIndex - 1]];
        settingsState.draft.readerSettings.btnOrder = order;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'reset-prompt-rule') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.promptRule = DEFAULT_SCENE_PROMPT_RULE;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-add-bg') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.scenes = settingsState.draft.bridge.sceneAssets.scenes || {};
        const existingKeys = Object.keys(settingsState.draft.bridge.sceneAssets.scenes);
        const newName = '场景' + (existingKeys.length + 1);
        settingsState.draft.bridge.sceneAssets.scenes[newName] = { url: '', times: {} };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-bg:')) {
        const name = decodeSeg(normalizedAction.slice('scene-remove-bg:'.length));
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.scenes = settingsState.draft.bridge.sceneAssets.scenes || {};
        delete settingsState.draft.bridge.sceneAssets.scenes[name];
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-bg:')) {
        const oldName = decodeSeg(normalizedAction.slice('scene-rename-bg:'.length));
        const globalObj = options.global || globalThis;
        const newName = (globalObj.prompt && globalObj.prompt(`重命名场景「${oldName}」为：`, oldName) || '').trim();
        if (newName && newName !== oldName) {
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            const scenes = settingsState.draft.bridge.sceneAssets.scenes || {};
            if (Object.prototype.hasOwnProperty.call(scenes, newName)) {
                if (globalObj.alert) globalObj.alert(`场景「${newName}」已存在（同名），已阻止`);
                return rerenderSettings();
            }
            settingsState.draft.bridge.sceneAssets.scenes = reorderKey(scenes, oldName, newName);
            const sl = settingsState.asyncState.expandedSceneSlots;
            renameSetPrefix(sl, `bg\x00${oldName}`, `bg\x00${newName}`);
            renameSetPrefix(sl, `time\x00${oldName}\x00`, `time\x00${newName}\x00`);
            renameSetPrefix(sl, `weather\x00${oldName}\x00`, `weather\x00${newName}\x00`);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-bg-url:')) {
        const rest = normalizedAction.slice('scene-set-bg-url:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const name = decodeSeg(rest.slice(0, colonIdx));
            const url = rest.slice(colonIdx + 1);
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            settingsState.draft.bridge.sceneAssets.scenes = settingsState.draft.bridge.sceneAssets.scenes || {};
            const scene = settingsState.draft.bridge.sceneAssets.scenes[name];
            if (scene && typeof scene === 'object') {
                scene.url = url;
            } else {
                settingsState.draft.bridge.sceneAssets.scenes[name] = { url, times: {} };
            }
            persistSettingsDraft();
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-add-time:')) {
        const sceneName = decodeSeg(normalizedAction.slice('scene-add-time:'.length));
        const globalObj = options.global || globalThis;
        const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
        const scene = scenes[sceneName];
        if (scene && typeof scene === 'object') {
            const newTime = (globalObj.prompt && globalObj.prompt('时间名称（建议与时间组名一致）：', '') || '').trim();
            if (!newTime) return rerenderSettings();
            scene.times = scene.times || {};
            if (Object.prototype.hasOwnProperty.call(scene.times, newTime)) {
                if (globalObj.alert) globalObj.alert(`「${sceneName}」已有时间「${newTime}」（同名）`);
                return rerenderSettings();
            }
            scene.times[newTime] = { url: '', weathers: {} };
            const timeGroups = ensureTimeGroups(settingsState);
            if (!timeGroups.some((g) => g.label === newTime)) timeGroups.unshift({ label: newTime, words: [newTime] });
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-time:')) {
        const rest = normalizedAction.slice('scene-remove-time:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const timeName = decodeSeg(rest.slice(colonIdx + 1));
            const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
            const scene = scenes[sceneName];
            if (scene && scene.times) delete scene.times[timeName];
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-time:')) {
        const rest = normalizedAction.slice('scene-rename-time:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const oldTime = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const newTime = (globalObj.prompt && globalObj.prompt(`重命名时间「${oldTime}」为：`, oldTime) || '').trim();
            if (newTime && newTime !== oldTime) {
                const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times) {
                    if (Object.prototype.hasOwnProperty.call(scene.times, newTime)) {
                        if (globalObj.alert) globalObj.alert(`时间「${newTime}」已存在（同名），已阻止`);
                        return rerenderSettings();
                    }
                    scene.times = reorderKey(scene.times, oldTime, newTime);
                    // global sync: rename same time slot in all other scenes
                    for (const [otherSn, otherSv] of Object.entries(scenes)) {
                        if (otherSn === sceneName || !otherSv || typeof otherSv !== 'object') continue;
                        if (Object.prototype.hasOwnProperty.call(otherSv.times || {}, oldTime)
                            && !Object.prototype.hasOwnProperty.call(otherSv.times, newTime)) {
                            otherSv.times = reorderKey(otherSv.times, oldTime, newTime);
                        }
                    }
                    // sync timeGroups label
                    const timeGroups = ensureTimeGroups(settingsState);
                    const tg = timeGroups.find((g) => g.label === oldTime);
                    if (tg) {
                        tg.label = newTime;
                        const wi = Array.isArray(tg.words) ? tg.words.indexOf(oldTime) : -1;
                        if (wi >= 0) tg.words[wi] = newTime;
                    }
                    // update Set keys for all scenes
                    const sl = settingsState.asyncState.expandedSceneSlots;
                    for (const sn of Object.keys(scenes)) {
                        renameSetPrefix(sl, `time\x00${sn}\x00${oldTime}`, `time\x00${sn}\x00${newTime}`);
                        renameSetPrefix(sl, `weather\x00${sn}\x00${oldTime}\x00`, `weather\x00${sn}\x00${newTime}\x00`);
                    }
                    const persisted = persistSettingsDraft();
                    if (persisted.ok === false) return persisted;
                }
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-time-url:')) {
        const rest = normalizedAction.slice('scene-set-time-url:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const url = after.slice(second + 1);
                const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times && scene.times[timeName] != null) {
                    const t = scene.times[timeName];
                    if (typeof t === 'object') t.url = url;
                    else scene.times[timeName] = { url, weathers: {} };
                }
                persistSettingsDraft();
            }
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-add-weather:')) {
        const rest = normalizedAction.slice('scene-add-weather:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const timeName = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            const scene = scenes[sceneName];
            if (scene && scene.times && typeof scene.times[timeName] === 'object') {
                const timeEntry = scene.times[timeName];
                const newWeather = (globalObj.prompt && globalObj.prompt('天气名称（建议与天气组名一致）：', '') || '').trim();
                if (!newWeather) return rerenderSettings();
                timeEntry.weathers = timeEntry.weathers || {};
                if (Object.prototype.hasOwnProperty.call(timeEntry.weathers, newWeather)) {
                    if (globalObj.alert) globalObj.alert(`「${timeName}」已有天气「${newWeather}」（同名）`);
                    return rerenderSettings();
                }
                timeEntry.weathers[newWeather] = { url: '' };
                const weatherGroups = ensureWeatherGroups(settingsState);
                if (!weatherGroups.some((g) => g.label === newWeather)) weatherGroups.unshift({ label: newWeather, words: [newWeather] });
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-weather:')) {
        const rest = normalizedAction.slice('scene-remove-weather:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const weatherName = decodeSeg(after.slice(second + 1));
                const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times && scene.times[timeName]) {
                    const t = scene.times[timeName];
                    if (t && t.weathers) delete t.weathers[weatherName];
                }
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-weather:')) {
        const rest = normalizedAction.slice('scene-rename-weather:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const oldWeather = decodeSeg(after.slice(second + 1));
                const globalObj = options.global || globalThis;
                const newWeather = (globalObj.prompt && globalObj.prompt(`重命名天气「${oldWeather}」为：`, oldWeather) || '').trim();
                if (newWeather && newWeather !== oldWeather) {
                    const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                    const scene = scenes[sceneName];
                    if (scene && scene.times && scene.times[timeName]) {
                        const t = scene.times[timeName];
                        if (t && t.weathers) {
                            if (Object.prototype.hasOwnProperty.call(t.weathers, newWeather)) {
                                if (globalObj.alert) globalObj.alert(`天气「${newWeather}」已存在（同名），已阻止`);
                                return rerenderSettings();
                            }
                            // global sync: rename same weather slot across all scenes/times
                            for (const [gsn, gsv] of Object.entries(scenes)) {
                                if (!gsv || typeof gsv !== 'object') continue;
                                for (const [gtn, gtv] of Object.entries(gsv.times || {})) {
                                    if (!gtv || typeof gtv !== 'object') continue;
                                    const gw = gtv.weathers || {};
                                    if (Object.prototype.hasOwnProperty.call(gw, oldWeather)
                                        && !Object.prototype.hasOwnProperty.call(gw, newWeather)) {
                                        const ow = gw[oldWeather];
                                        gw[oldWeather] = typeof ow === 'string' ? { url: ow } : (ow || { url: '' });
                                        gtv.weathers = reorderKey(gw, oldWeather, newWeather);
                                    }
                                }
                            }
                            // sync weatherGroups label
                            const weatherGroups = ensureWeatherGroups(settingsState);
                            const wg = weatherGroups.find((g) => g.label === oldWeather);
                            if (wg) {
                                wg.label = newWeather;
                                const wi = Array.isArray(wg.words) ? wg.words.indexOf(oldWeather) : -1;
                                if (wi >= 0) wg.words[wi] = newWeather;
                            }
                            // update Set keys for all scenes/times
                            const sl = settingsState.asyncState.expandedSceneSlots;
                            for (const [gsn2, gsv2] of Object.entries(scenes)) {
                                if (!gsv2 || typeof gsv2 !== 'object') continue;
                                for (const gtn2 of Object.keys(gsv2.times || {})) {
                                    renameSetPrefix(sl, `weather\x00${gsn2}\x00${gtn2}\x00${oldWeather}`, `weather\x00${gsn2}\x00${gtn2}\x00${newWeather}`);
                                }
                            }
                            const persisted = persistSettingsDraft();
                            if (persisted.ok === false) return persisted;
                        }
                    }
                }
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-weather-url:')) {
        const rest = normalizedAction.slice('scene-set-weather-url:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const after2 = after.slice(second + 1);
                const third = after2.indexOf(':');
                if (third > 0) {
                    const weatherName = decodeSeg(after2.slice(0, third));
                    const url = after2.slice(third + 1);
                    const scenes = settingsState.draft.bridge.sceneAssets && settingsState.draft.bridge.sceneAssets.scenes || {};
                    const scene = scenes[sceneName];
                    if (scene && scene.times && scene.times[timeName]) {
                        const t = scene.times[timeName];
                        if (t && t.weathers) {
                        const existing = t.weathers[weatherName];
                        if (existing && typeof existing === 'object') {
                            existing.url = url;
                        } else {
                            t.weathers[weatherName] = { url, words: [] };
                        }
                    }
                    }
                    persistSettingsDraft();
                }
            }
        }
        return { ok: true };
    }

    if (normalizedAction === 'scene-add-char') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
        const existingKeys = Object.keys(settingsState.draft.bridge.sceneAssets.characters);
        const newName = '角色' + (existingKeys.length + 1);
        settingsState.draft.bridge.sceneAssets.characters[newName] = { '默认': '' };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-char:')) {
        const name = decodeSeg(normalizedAction.slice('scene-remove-char:'.length));
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
        delete settingsState.draft.bridge.sceneAssets.characters[name];
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-add-mood:')) {
        const charName = decodeSeg(normalizedAction.slice('scene-add-mood:'.length));
        const globalObj = options.global || globalThis;
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
        const char = settingsState.draft.bridge.sceneAssets.characters[charName];
        if (char && typeof char === 'object') {
            const newMood = (globalObj.prompt && globalObj.prompt('情绪/槽名称（建议与情绪组名一致）：', '') || '').trim();
            if (!newMood) return rerenderSettings();
            if (Object.prototype.hasOwnProperty.call(char, newMood)) {
                if (globalObj.alert) globalObj.alert(`「${charName}」已有「${newMood}」槽（同名）`);
                return rerenderSettings();
            }
            char[newMood] = '';
            // 槽名若在词库中无对应组，自动建组并把组名作为第一个词
            const groups = ensureMoodGroups(settingsState);
            if (!groups.some((g) => g.label === newMood)) {
                groups.unshift({ label: newMood, words: [newMood] });
            }
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-mood:')) {
        const rest = normalizedAction.slice('scene-remove-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const mood = decodeSeg(rest.slice(colonIdx + 1));
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
            const char = settingsState.draft.bridge.sceneAssets.characters[charName];
            if (char && typeof char === 'object') delete char[mood];
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-mood-url:')) {
        const rest = normalizedAction.slice('scene-set-mood-url:'.length);
        const firstColon = rest.indexOf(':');
        if (firstColon > 0) {
            const charName = decodeSeg(rest.slice(0, firstColon));
            const afterChar = rest.slice(firstColon + 1);
            const secondColon = afterChar.indexOf(':');
            if (secondColon > 0) {
                const mood = decodeSeg(afterChar.slice(0, secondColon));
                const url = afterChar.slice(secondColon + 1);
                settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                settingsState.draft.bridge.sceneAssets.characters = settingsState.draft.bridge.sceneAssets.characters || {};
                if (!settingsState.draft.bridge.sceneAssets.characters[charName]) {
                    settingsState.draft.bridge.sceneAssets.characters[charName] = {};
                }
                settingsState.draft.bridge.sceneAssets.characters[charName][mood] = url;
                persistSettingsDraft();
            }
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-rename-char:')) {
        const oldName = decodeSeg(normalizedAction.slice('scene-rename-char:'.length));
        const globalObj = options.global || globalThis;
        const newName = (globalObj.prompt && globalObj.prompt(`重命名角色「${oldName}」为：`, oldName) || '').trim();
        if (newName && newName !== oldName) {
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            const chars = settingsState.draft.bridge.sceneAssets.characters || {};
            settingsState.draft.bridge.sceneAssets.characters = reorderKey(chars, oldName, newName);
            renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${oldName}\x00`, `${newName}\x00`);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-mood:')) {
        const rest = normalizedAction.slice('scene-rename-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const oldMood = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const newMood = (globalObj.prompt && globalObj.prompt(`重命名情绪「${oldMood}」为：`, oldMood) || '').trim();
            if (newMood && newMood !== oldMood) {
                settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                const chars = settingsState.draft.bridge.sceneAssets.characters || {};
                // 同名检查：该角色已有同名槽，或词库已有同名情绪组 → 阻止，避免覆盖丢失
                if (chars[charName] && Object.prototype.hasOwnProperty.call(chars[charName], newMood)) {
                    if (globalObj.alert) globalObj.alert(`「${charName}」已有「${newMood}」槽（同名），改名会覆盖，已阻止`);
                    return rerenderSettings();
                }
                const groups = ensureMoodGroups(settingsState);
                if (groups.some((g) => g.label === newMood && g.label !== oldMood)) {
                    if (globalObj.alert) globalObj.alert(`词库已有情绪组「${newMood}」（同名），改名会覆盖，已阻止`);
                    return rerenderSettings();
                }
                // 改角色槽名
                if (chars[charName]) {
                    chars[charName] = reorderKey(chars[charName], oldMood, newMood);
                    renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${charName}\x00${oldMood}`, `${charName}\x00${newMood}`);
                }
                // 同步词库里同名情绪组的组名（全局：所有角色用到该组名的槽一起改）
                const group = groups.find((g) => g.label === oldMood);
                if (group) {
                    group.label = newMood;
                    const wordIdx = Array.isArray(group.words) ? group.words.indexOf(oldMood) : -1;
                    if (wordIdx >= 0) group.words[wordIdx] = newMood;
                    for (const otherName of Object.keys(chars)) {
                        if (otherName === charName) continue;
                        const other = chars[otherName];
                        if (other && typeof other === 'object' && Object.prototype.hasOwnProperty.call(other, oldMood)
                            && !Object.prototype.hasOwnProperty.call(other, newMood)) {
                            chars[otherName] = reorderKey(other, oldMood, newMood);
                            renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${otherName}\x00${oldMood}`, `${otherName}\x00${newMood}`);
                        }
                    }
                }
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'reset-mood-groups') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.moodGroups = cloneData(DEFAULT_MOOD_GROUPS);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'mood-add-group') {
        const globalObj = options.global || globalThis;
        const groups = ensureMoodGroups(settingsState);
        const raw = (globalObj.prompt && globalObj.prompt('新情绪组名称：', '') || '').trim();
        if (!raw) return rerenderSettings();
        if (groups.some((g) => g.label === raw)) {
            if (globalObj.alert) globalObj.alert(`情绪组「${raw}」已存在（同名）`);
            return rerenderSettings();
        }
        // 组名自动作为该组第一个词
        groups.unshift({ label: raw, words: [raw] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-remove-group:')) {
        const label = decodeSeg(normalizedAction.slice('mood-remove-group:'.length));
        const groups = ensureMoodGroups(settingsState);
        const idx = groups.findIndex((g) => g.label === label);
        if (idx >= 0) groups.splice(idx, 1);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-rename-group:')) {
        const oldLabel = decodeSeg(normalizedAction.slice('mood-rename-group:'.length));
        const globalObj = options.global || globalThis;
        const newLabel = (globalObj.prompt && globalObj.prompt(`重命名情绪组「${oldLabel}」为：`, oldLabel) || '').trim();
        if (newLabel && newLabel !== oldLabel) {
            const groups = ensureMoodGroups(settingsState);
            if (groups.some((g) => g.label === newLabel)) {
                if (globalObj.alert) globalObj.alert(`情绪组「${newLabel}」已存在`);
                return rerenderSettings();
            }
            const group = groups.find((g) => g.label === oldLabel);
            if (group) group.label = newLabel;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('mood-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = (globalObj.prompt && globalObj.prompt(`向「${label}」组添加情绪词：`, '') || '').trim();
        if (word) {
            const groups = ensureMoodGroups(settingsState);
            const dupGroup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dupGroup) {
                // 词撞名：弹窗询问是否删掉重复词再加到当前组
                const confirmFn = typeof globalObj.confirm === 'function' ? globalObj.confirm.bind(globalObj) : null;
                const proceed = confirmFn
                    ? confirmFn(`「${word}」已存在于「${dupGroup.label}」组。是否删除重复词并加入「${label}」组？`)
                    : true;
                if (!proceed) return rerenderSettings();
                dupGroup.words = dupGroup.words.filter((w) => w !== word);
            }
            const group = groups.find((g) => g.label === label);
            if (group) group.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-remove-word:')) {
        const rest = normalizedAction.slice('mood-remove-word:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const label = decodeSeg(rest.slice(0, colonIdx));
            const word = decodeSeg(rest.slice(colonIdx + 1));
            const groups = ensureMoodGroups(settingsState);
            const group = groups.find((g) => g.label === label);
            if (group) {
                if (group.words.length <= 1) {
                    const globalObj = options.global || globalThis;
                    if (globalObj.alert) globalObj.alert('每个情绪组至少保留 1 个词');
                    return rerenderSettings();
                }
                const wi = group.words.indexOf(word);
                if (wi >= 0) group.words.splice(wi, 1);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-mood:')) {
        const rest = normalizedAction.slice('scene-toggle-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const mood = decodeSeg(rest.slice(colonIdx + 1));
            const key = charName + "\x00" + mood;
            if (!(settingsState.asyncState.expandedSpriteSlots instanceof Set)) {
                settingsState.asyncState.expandedSpriteSlots = new Set();
            }
            const set = settingsState.asyncState.expandedSpriteSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('mood-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureMoodGroups(settingsState);
        if (groups.some((g) => g.label === label)) {
            if (globalObj.alert) globalObj.alert(`情绪组「${label}」已存在（同名）`);
            return rerenderSettings();
        }
        // 组名自动作为该组第一个词
        groups.unshift({ label, words: [label] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-preset-save') {
        const globalObj = options.global || globalThis;
        const sa = settingsState.draft.bridge.sceneAssets || {};
        let name = settingsState.asyncState.scenePresetName || '';
        if (!name) {
            name = (globalObj.prompt && globalObj.prompt('预设名称：', '') || '').trim();
            if (!name) return rerenderSettings();
        }
        const storage = globalObj.localStorage;
        const presets = loadScenePresets(storage);
        presets[name] = {
            scenes: cloneData(sa.scenes || {}),
            characters: cloneData(sa.characters || {}),
            moodGroups: cloneData(sa.moodGroups || []),
            timeGroups: cloneData(sa.timeGroups || []),
            weatherGroups: cloneData(sa.weatherGroups || []),
            spriteLayouts: cloneData((settingsState.draft.readerSettings && settingsState.draft.readerSettings.spriteLayouts) || {}),
        };
        saveScenePresets(storage, presets);
        settingsState.asyncState.scenePresetName = name;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-preset-apply:')) {
        const name = decodeSeg(normalizedAction.slice('scene-preset-apply:'.length));
        if (name) {
            const globalObj = options.global || globalThis;
            const presets = loadScenePresets(globalObj.localStorage);
            const preset = presets[name];
            if (preset) {
                // 切预设会用预设内容整体覆盖当前场景配置与立绘位置。未存进任何预设的改动
                // 会在覆盖后丢失，所以切换前先确认（取消则保持当前配置不动）。
                const confirmFn = typeof globalObj.confirm === 'function' ? globalObj.confirm.bind(globalObj) : null;
                if (confirmFn && !confirmFn(`切换到预设「${name}」会用该预设的场景、角色立绘和位置覆盖当前配置，未保存到预设的改动将丢失。是否继续？`)) {
                    return rerenderSettings();
                }
                settingsState.asyncState.scenePresetName = name;
                settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                settingsState.draft.bridge.sceneAssets.scenes = cloneData(preset.scenes || {});
                settingsState.draft.bridge.sceneAssets.characters = cloneData(preset.characters || {});
                settingsState.draft.bridge.sceneAssets.moodGroups = cloneData(preset.moodGroups || []);
                settingsState.draft.bridge.sceneAssets.timeGroups = cloneData(preset.timeGroups || []);
                settingsState.draft.bridge.sceneAssets.weatherGroups = cloneData(preset.weatherGroups || []);
                if (preset.spriteLayouts && typeof preset.spriteLayouts === 'object') {
                    settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
                    settingsState.draft.readerSettings.spriteLayouts = cloneData(preset.spriteLayouts);
                }
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            } else {
                settingsState.asyncState.scenePresetName = name;
            }
        } else {
            settingsState.asyncState.scenePresetName = name;
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-preset-rename') {
        const oldName = settingsState.asyncState.scenePresetName || '';
        if (!oldName) return rerenderSettings();
        const globalObj = options.global || globalThis;
        const newName = (globalObj.prompt && globalObj.prompt(`重命名预设「${oldName}」为：`, oldName) || '').trim();
        if (!newName || newName === oldName) return rerenderSettings();
        const storage = globalObj.localStorage;
        const presets = loadScenePresets(storage);
        if (!presets[oldName]) return rerenderSettings();
        presets[newName] = presets[oldName];
        delete presets[oldName];
        saveScenePresets(storage, presets);
        settingsState.asyncState.scenePresetName = newName;
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-preset-import') {
        const globalObj = options.global || globalThis;
        const doc = globalObj.document;
        if (!doc) return { ok: false, reason: 'no-document' };
        const fileResult = await pickPresetFile(doc);
        if (!fileResult) return rerenderSettings();
        const name = (globalObj.prompt && globalObj.prompt('预设名称：', fileResult.fileName) || '').trim();
        if (!name) return rerenderSettings();
        const storage = globalObj.localStorage;
        const presets = loadScenePresets(storage);
        presets[name] = {
            scenes: fileResult.data.scenes || {},
            characters: fileResult.data.characters || {},
            moodGroups: fileResult.data.moodGroups || [],
            timeGroups: fileResult.data.timeGroups || [],
            weatherGroups: fileResult.data.weatherGroups || [],
            spriteLayouts: (fileResult.data.spriteLayouts && typeof fileResult.data.spriteLayouts === 'object') ? fileResult.data.spriteLayouts : {},
        };
        saveScenePresets(storage, presets);
        settingsState.asyncState.scenePresetName = name;
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.scenes = cloneData(presets[name].scenes);
        settingsState.draft.bridge.sceneAssets.characters = cloneData(presets[name].characters);
        settingsState.draft.bridge.sceneAssets.moodGroups = cloneData(presets[name].moodGroups);
        settingsState.draft.bridge.sceneAssets.timeGroups = cloneData(presets[name].timeGroups || []);
        settingsState.draft.bridge.sceneAssets.weatherGroups = cloneData(presets[name].weatherGroups || []);
        settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        settingsState.draft.readerSettings.spriteLayouts = cloneData(presets[name].spriteLayouts);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-preset-export') {
        const name = settingsState.asyncState.scenePresetName || '';
        if (!name) return rerenderSettings();
        const globalObj = options.global || globalThis;
        const presets = loadScenePresets(globalObj.localStorage);
        const preset = presets[name];
        if (!preset) return rerenderSettings();
        const doc = globalObj.document;
        if (!doc) return { ok: false, reason: 'no-document' };
        const json = JSON.stringify({ scenes: preset.scenes || {}, characters: preset.characters || {}, moodGroups: preset.moodGroups || [], timeGroups: preset.timeGroups || [], weatherGroups: preset.weatherGroups || [], spriteLayouts: preset.spriteLayouts || {} }, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url;
        a.download = `${name}.json`;
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
        URL.revokeObjectURL(url);
        return { ok: true };
    }

    if (normalizedAction === 'scene-preset-delete') {
        const name = settingsState.asyncState.scenePresetName || '';
        if (!name) return rerenderSettings();
        const globalObj = options.global || globalThis;
        if (globalObj.confirm && !globalObj.confirm(`删除预设「${name}」？`)) return rerenderSettings();
        const storage = globalObj.localStorage;
        const presets = loadScenePresets(storage);
        delete presets[name];
        saveScenePresets(storage, presets);
        settingsState.asyncState.scenePresetName = '';
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-bg:')) {
        const key = 'bg\x00' + decodeSeg(normalizedAction.slice('scene-toggle-bg:'.length));
        if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
        const set = settingsState.asyncState.expandedSceneSlots;
        if (set.has(key)) set.delete(key); else set.add(key);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-time:')) {
        const rest = normalizedAction.slice('scene-toggle-time:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const key = 'time\x00' + decodeSeg(rest.slice(0, c)) + '\x00' + decodeSeg(rest.slice(c + 1));
            if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
            const set = settingsState.asyncState.expandedSceneSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-weather:')) {
        const rest = normalizedAction.slice('scene-toggle-weather:'.length);
        const c1 = rest.indexOf(':'); const c2 = c1 >= 0 ? rest.indexOf(':', c1 + 1) : -1;
        if (c1 > 0 && c2 > c1) {
            const key = 'weather\x00' + decodeSeg(rest.slice(0, c1)) + '\x00' + decodeSeg(rest.slice(c1 + 1, c2)) + '\x00' + decodeSeg(rest.slice(c2 + 1));
            if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
            const set = settingsState.asyncState.expandedSceneSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-add-bg-word:')) {
        const sceneName = decodeSeg(normalizedAction.slice('scene-add-bg-word:'.length));
        const globalObj = options.global || globalThis;
        const word = (globalObj.prompt && globalObj.prompt(`向场景「${sceneName}」添加词：`, '') || '').trim();
        if (word) {
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            const dup = findSceneWord(scenes, word);
            if (dup) {
                const proceed = typeof globalObj.confirm === 'function'
                    ? globalObj.confirm(`「${word}」已存在于${dup.label}的词库。是否删除重复词并加入场景「${sceneName}」的词库？`)
                    : true;
                if (!proceed) return rerenderSettings();
                removeSceneWordEntry(scenes, dup);
            }
            const s = scenes[sceneName];
            if (s && typeof s === 'object') { if (!Array.isArray(s.words)) s.words = []; s.words.push(word); }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-bg-word:')) {
        const rest = normalizedAction.slice('scene-remove-bg-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const sceneName = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            const s = scenes[sceneName];
            if (s && Array.isArray(s.words)) {
                const globalObj = options.global || globalThis;
                if (s.words.length <= 1) { if (globalObj.alert) globalObj.alert('至少保留 1 个词'); return rerenderSettings(); }
                s.words = s.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('time-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = (globalObj.prompt && globalObj.prompt(`向时间组「${label}」添加词：`, '') || '').trim();
        if (word) {
            const groups = ensureTimeGroups(settingsState);
            const dup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dup) {
                const proceed = typeof globalObj.confirm === 'function'
                    ? globalObj.confirm(`「${word}」已存在于时间组「${dup.label}」。是否删除重复词并加入「${label}」？`) : true;
                if (!proceed) return rerenderSettings();
                dup.words = dup.words.filter((w) => w !== word);
            }
            const g = groups.find((g) => g.label === label);
            if (g) g.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-remove-word:')) {
        const rest = normalizedAction.slice('time-remove-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const label = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const groups = ensureTimeGroups(settingsState);
            const g = groups.find((g) => g.label === label);
            if (g && Array.isArray(g.words)) {
                const globalObj = options.global || globalThis;
                if (g.words.length <= 1) { if (globalObj.alert) globalObj.alert('至少保留 1 个词'); return rerenderSettings(); }
                g.words = g.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('time-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureTimeGroups(settingsState);
        if (groups.some((g) => g.label === label)) { if (globalObj.alert) globalObj.alert(`时间组「${label}」已存在`); return rerenderSettings(); }
        groups.unshift({ label, words: [label] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('weather-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = (globalObj.prompt && globalObj.prompt(`向天气组「${label}」添加词：`, '') || '').trim();
        if (word) {
            const groups = ensureWeatherGroups(settingsState);
            const dup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dup) {
                const proceed = typeof globalObj.confirm === 'function'
                    ? globalObj.confirm(`「${word}」已存在于天气组「${dup.label}」。是否删除重复词并加入「${label}」？`) : true;
                if (!proceed) return rerenderSettings();
                dup.words = dup.words.filter((w) => w !== word);
            }
            const g = groups.find((g) => g.label === label);
            if (g) g.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-remove-word:')) {
        const rest = normalizedAction.slice('weather-remove-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const label = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const groups = ensureWeatherGroups(settingsState);
            const g = groups.find((g) => g.label === label);
            if (g && Array.isArray(g.words)) {
                const globalObj = options.global || globalThis;
                if (g.words.length <= 1) { if (globalObj.alert) globalObj.alert('至少保留 1 个词'); return rerenderSettings(); }
                g.words = g.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('weather-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureWeatherGroups(settingsState);
        if (groups.some((g) => g.label === label)) { if (globalObj.alert) globalObj.alert(`天气组「${label}」已存在`); return rerenderSettings(); }
        groups.unshift({ label, words: [label] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    return { ok: false, reason: 'unknown-settings-action', action: normalizedAction };
}

function reorderKey(obj, oldKey, newKey) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) result[k === oldKey ? newKey : k] = v;
    return result;
}

function renameSetPrefix(set, oldPrefix, newPrefix) {
    if (!(set instanceof Set)) return;
    const toUpdate = [];
    for (const key of set) if (key.startsWith(oldPrefix)) toUpdate.push(key);
    for (const k of toUpdate) { set.delete(k); set.add(newPrefix + k.slice(oldPrefix.length)); }
}

function findSceneWord(scenes, word) {
    for (const [sn, sv] of Object.entries(scenes || {})) {
        const s = typeof sv === 'string' ? {} : (sv || {});
        if (Array.isArray(s.words) && s.words.includes(word)) return { type: 'bg', keys: [sn], word, label: `场景「${sn}」` };
    }
    return null;
}

function removeSceneWordEntry(scenes, entry) {
    const [sn, tn, wn] = entry.keys;
    let arr = null;
    if (entry.type === 'bg') arr = scenes[sn] && scenes[sn].words;
    else if (entry.type === 'time') arr = scenes[sn] && scenes[sn].times && scenes[sn].times[tn] && scenes[sn].times[tn].words;
    else arr = scenes[sn] && scenes[sn].times && scenes[sn].times[tn] && scenes[sn].times[tn].weathers && scenes[sn].times[tn].weathers[wn] && scenes[sn].times[tn].weathers[wn].words;
    if (Array.isArray(arr)) { const i = arr.indexOf(entry.word); if (i >= 0) arr.splice(i, 1); }
}

function pickPresetFile(doc) {
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        let done = false;
        const finish = (val) => { if (!done) { done = true; resolve(val); } };
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) { finish(null); return; }
            const fileName = file.name.replace(/\.json$/i, '');
            const fr = new FileReader();
            fr.onload = (e) => { try { finish({ fileName, data: JSON.parse(e.target.result) }); } catch { finish(null); } };
            fr.onerror = () => finish(null);
            fr.readAsText(file);
        };
        input.click();
        setTimeout(() => finish(null), 300000);
    });
}

function ensureTimeGroups(settingsState) {
    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.timeGroups)) sa.timeGroups = [];
    return sa.timeGroups;
}

function ensureWeatherGroups(settingsState) {
    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.weatherGroups)) sa.weatherGroups = [];
    return sa.weatherGroups;
}

function ensureMoodGroups(settingsState) {    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.moodGroups)) {
        sa.moodGroups = normalizeMoodGroups(sa.moodGroups);
    }
    return sa.moodGroups;
}
