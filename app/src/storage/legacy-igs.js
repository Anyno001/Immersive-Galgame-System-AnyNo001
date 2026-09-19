export const LEGACY_VN_KEYS = Object.freeze({
    bridge: 'igs_bridge_config',
    readerPrefix: 'igs-reader-settings-v9-',
    displayMode: 'igs-display-mode',
});

export const LEGACY_READER_MODES = Object.freeze(['pc', 'mobile', 'web', 'fullscreen', 'default']);

export function readLegacyIgsSettings(storageLike, preferredMode) {
    const result = {
        ok: true,
        bridge: {},
        displayMode: '',
        readerMode: 'pc',
        readerSettings: {},
        readerSettingsByMode: {},
    };
    if (!isStorageLike(storageLike)) {
        result.readerMode = resolveLegacyReaderMode(preferredMode, result.displayMode, result.bridge);
        return result;
    }

    const bridgeRecord = readJsonStorage(storageLike, LEGACY_VN_KEYS.bridge);
    if (!bridgeRecord.ok) return bridgeRecord;
    result.bridge = normalizeLegacyIgsSettings(bridgeRecord.value);

    const displayModeRecord = readStringStorage(storageLike, LEGACY_VN_KEYS.displayMode);
    if (!displayModeRecord.ok) return displayModeRecord;
    result.displayMode = displayModeRecord.value;

    for (const mode of LEGACY_READER_MODES) {
        const record = readJsonStorage(storageLike, `${LEGACY_VN_KEYS.readerPrefix}${mode}`);
        if (!record.ok) return record;
        result.readerSettingsByMode[mode] = normalizeLegacyIgsSettings(record.value);
    }

    result.readerMode = resolveLegacyReaderMode(preferredMode, result.displayMode, result.bridge);
    result.readerSettings = cloneData(result.readerSettingsByMode[result.readerMode] || {});
    return result;
}

export function writeLegacyIgsSettings(storageLike, nextState = {}) {
    if (!isStorageLike(storageLike)) {
        return {
            ok: false,
            reason: 'missing-storage-like',
        };
    }

    const normalized = normalizeLegacySnapshot(nextState);

    try {
        storageLike.setItem(LEGACY_VN_KEYS.bridge, JSON.stringify(normalized.bridge));
        storageLike.setItem(LEGACY_VN_KEYS.displayMode, normalized.displayMode);
        for (const mode of LEGACY_READER_MODES) {
            storageLike.setItem(`${LEGACY_VN_KEYS.readerPrefix}${mode}`, JSON.stringify(normalized.readerSettingsByMode[mode]));
        }
        return {
            ok: true,
            legacy: normalized,
        };
    } catch (error) {
        return {
            ok: false,
            reason: 'legacy-storage-write-failed',
            message: error instanceof Error ? error.message : String(error),
            legacy: normalized,
        };
    }
}

export function normalizeLegacyIgsSettings(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return cloneData(raw);
}

export function resolveLegacyReaderMode(preferredMode, displayMode, bridgeConfig) {
    const candidates = [
        preferredMode,
        displayMode,
        bridgeConfig && bridgeConfig.openMode,
        'pc',
    ];
    for (const candidate of candidates) {
        if (LEGACY_READER_MODES.includes(candidate)) return candidate;
    }
    return 'pc';
}

function readJsonStorage(storageLike, key) {
    const raw = readStorageValue(storageLike, key);
    if (raw == null || raw === '') {
        return { ok: true, key, value: {} };
    }
    try {
        return { ok: true, key, value: JSON.parse(raw) };
    } catch (error) {
        return {
            ok: false,
            reason: 'invalid-legacy-json',
            key,
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

function readStringStorage(storageLike, key) {
    const raw = readStorageValue(storageLike, key);
    return { ok: true, key, value: raw == null ? '' : String(raw).trim() };
}

function normalizeLegacySnapshot(raw) {
    const bridge = normalizeLegacyIgsSettings(raw.bridge);
    const displayMode = resolveLegacyReaderMode(raw.displayMode, raw.displayMode, bridge);
    const readerMode = resolveLegacyReaderMode(raw.readerMode, displayMode, bridge);
    const readerSettingsByMode = {};

    for (const mode of LEGACY_READER_MODES) {
        const sourceByMode = raw.readerSettingsByMode && raw.readerSettingsByMode[mode];
        const source = mode === readerMode
            ? firstDefined(raw.readerSettings, sourceByMode, {})
            : firstDefined(sourceByMode, {});
        readerSettingsByMode[mode] = normalizeLegacyIgsSettings(source);
    }

    return {
        ok: true,
        bridge,
        displayMode,
        readerMode,
        readerSettings: cloneData(readerSettingsByMode[readerMode] || {}),
        readerSettingsByMode,
    };
}

function readStorageValue(storageLike, key) {
    if (!isStorageLike(storageLike)) return null;
    try {
        return storageLike.getItem(key);
    } catch (error) {
        return null;
    }
}

function isStorageLike(value) {
    return !!value && typeof value.getItem === 'function';
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}

function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null) return value;
    }
    return undefined;
}
