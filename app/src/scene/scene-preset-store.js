const KEY = 'igs:scene-presets:v1';

function readStore(storage) {
    try {
        const raw = storage && storage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
}

function writeStore(storage, presets, active) {
    try { storage.setItem(KEY, JSON.stringify({ version: 1, presets, active: active || '' })); } catch {}
}

export function loadScenePresets(storage) {
    const parsed = readStore(storage);
    return parsed.presets && typeof parsed.presets === 'object' && !Array.isArray(parsed.presets)
        ? parsed.presets : {};
}

export function saveScenePresets(storage, presets) {
    writeStore(storage, presets, readStore(storage).active);
}

// 当前选中的预设名需要跨设置面板开关保留，否则关掉再打开会回到「选择预设」、保存时要重新输名字
export function loadActiveScenePresetName(storage) {
    const parsed = readStore(storage);
    const name = typeof parsed.active === 'string' ? parsed.active : '';
    return name && loadScenePresets(storage)[name] ? name : '';
}

export function saveActiveScenePresetName(storage, name) {
    writeStore(storage, loadScenePresets(storage), name);
    return name || '';
}
