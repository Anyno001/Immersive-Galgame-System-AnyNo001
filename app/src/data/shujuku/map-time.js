const TIME_ALIASES = new Map([
    ['清晨', 'dawn'], ['黎明', 'dawn'], ['早晨', 'dawn'], ['早上', 'dawn'], ['dawn', 'dawn'],
    ['白天', 'day'], ['日间', 'day'], ['上午', 'day'], ['中午', 'day'], ['下午', 'day'], ['午后', 'day'], ['day', 'day'],
    ['傍晚', 'dusk'], ['黄昏', 'dusk'], ['dusk', 'dusk'],
    ['夜晚', 'night'], ['夜间', 'night'], ['晚上', 'night'], ['night', 'night'],
    ['深夜', 'minight'], ['午夜', 'minight'], ['midnight', 'minight'], ['minight', 'minight'],
]);

export function normalizeMapTime(value) {
    const text = String(value || '').trim().toLowerCase();
    return TIME_ALIASES.get(text) || '';
}

export function resolveMapTimeBasemap(baseUrl, time) {
    const source = String(baseUrl || '').trim();
    const variant = normalizeMapTime(time);
    if (!source || !variant) return source;
    return source.replace(/(map-demo-clean)(?:-(?:dawn|day|dusk|night|minight))?(\.[a-z0-9]+)([?#].*)?$/i, `$1-${variant}$2$3`);
}
