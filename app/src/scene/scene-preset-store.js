const KEY = 'igs:scene-presets:v1';

function readStore(storage) {
    try {
        const raw = storage && storage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
}

// 写失败（多半是 localStorage 满了）把错误交给上层提示，不再静默丢掉。
function writeStore(storage, presets, active) {
    try {
        storage.setItem(KEY, JSON.stringify({ version: 1, presets, active: active || '' }));
        return { ok: true };
    } catch (error) {
        return { ok: false, reason: 'store-write-failed', saveError: error };
    }
}

export function loadScenePresets(storage) {
    const parsed = readStore(storage);
    return parsed.presets && typeof parsed.presets === 'object' && !Array.isArray(parsed.presets)
        ? parsed.presets : {};
}

export function saveScenePresets(storage, presets) {
    return writeStore(storage, presets, readStore(storage).active);
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
