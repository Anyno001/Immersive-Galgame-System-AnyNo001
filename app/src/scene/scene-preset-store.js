const KEY = 'igs:scene-presets:v1';

export function loadScenePresets(storage) {
    try {
        const raw = storage && storage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed.presets === 'object' && !Array.isArray(parsed.presets)
            ? parsed.presets : {};
    } catch { return {}; }
}

export function saveScenePresets(storage, presets) {
    try { storage.setItem(KEY, JSON.stringify({ version: 1, presets })); } catch {}
}
