export function buildBackgroundRulesFromPack(pack) {
    const data = pack && typeof pack === 'object' ? pack.data || pack : {};
    const records = firstArray(data.backgrounds, data.items, data.resources, data.rules);
    return records.map((item, index) => normalizeBackgroundRule(item, index)).filter(Boolean);
}

export function buildCharacterRulesFromPack(pack) {
    const data = pack && typeof pack === 'object' ? pack.data || pack : {};
    const records = firstArray(data.characters, data.items, data.resources, data.rules);
    return records.map((item, index) => normalizeCharacterRule(item, index)).filter(Boolean);
}

export function normalizeBackgroundRulesFromPreset(preset) {
    const data = preset && typeof preset === 'object' ? preset.data || preset : {};
    const records = firstArray(data.rules, data.backgroundRules, data.items, data.backgrounds);
    return records.map((item, index) => normalizeBackgroundRule(item, index)).filter(Boolean);
}

function normalizeBackgroundRule(item, index) {
    if (!item || typeof item !== 'object') return null;
    const id = normalizeString(item.id || item.name || `background-${index + 1}`);
    const url = normalizeString(item.url || item.resource || item.src || item.value);
    const match = normalizeMatch(item.match || item.when || item.conditions || item);
    return {
        ...cloneData(item),
        id,
        url,
        resource: url ? { id, url, source: item.source || 'pack' } : cloneData(item.resource) || null,
        match,
        priority: normalizeNumber(item.priority, 0),
    };
}

function normalizeCharacterRule(item, index) {
    if (!item || typeof item !== 'object') return null;
    const character = normalizeString(item.character || item.name || item.speaker);
    if (!character) return null;
    const emotion = normalizeEmotion(item.emotion || item.mood);
    const url = normalizeString(item.url || item.resource || item.src || item.value);
    return {
        ...cloneData(item),
        id: normalizeString(item.id || `${character}.${emotion}.${index + 1}`),
        character,
        emotion,
        aliases: Array.isArray(item.aliases) ? item.aliases.map(normalizeString).filter(Boolean) : [],
        url,
        resource: url ? { id: item.id || `${character}.${emotion}`, url, source: item.source || 'pack' } : cloneData(item.resource) || null,
        priority: normalizeNumber(item.priority, 0),
    };
}

function normalizeMatch(source = {}) {
    return {
        location: normalizeMatchList(source.location || source.locations || source.地点),
        time: normalizeMatchList(source.time || source.times || source.时间),
        weather: normalizeMatchList(source.weather || source.weathers || source.天气),
    };
}

function normalizeMatchList(value) {
    if (Array.isArray(value)) return value.map(normalizeString).filter(Boolean);
    const text = normalizeString(value);
    if (!text) return [];
    return text.split(/[,\n，、]/).map(normalizeString).filter(Boolean);
}

function firstArray(...values) {
    for (const value of values) {
        if (Array.isArray(value)) return value;
    }
    return [];
}

function normalizeString(value) {
    return String(value == null ? '' : value).trim();
}

function normalizeEmotion(value) {
    const text = normalizeString(value);
    if (!text || text === '默认' || text.toLowerCase() === 'default') return 'default';
    return text;
}

function normalizeNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}
