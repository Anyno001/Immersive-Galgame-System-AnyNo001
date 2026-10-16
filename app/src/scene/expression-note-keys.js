// 续画记录键为角色或「角色\u0001衣装」，正文及历史生成证据保持不变。
const own = (value, key) => Object.hasOwn(value, key);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

export function expressionNoteBelongsTo(key, character) {
    return key === character || key.startsWith(`${character}\u0001`);
}

export function rekeyExpressionNotes(notes, from, to) {
    if (!plain(notes)) return notes;
    const result = { ...notes }, pending = [];
    for (const [key, value] of Object.entries(notes)) {
        const separator = key.indexOf('\u0001');
        const character = separator < 0 ? key : key.slice(0, separator);
        const outfit = separator < 0 ? '' : key.slice(separator + 1);
        if (character !== from.character || (from.outfit != null && outfit !== from.outfit)) continue;
        if (from.mood != null) {
            if (!plain(value) || !own(value, from.mood)) continue;
            const moods = { ...value };
            delete moods[from.mood];
            if (to && !own(moods, to.mood ?? from.mood)) moods[to.mood ?? from.mood] = value[from.mood];
            if (Object.keys(moods).length) result[key] = moods; else delete result[key];
        } else {
            delete result[key];
            if (to) {
                const name = to.character ?? character, nextOutfit = to.outfit ?? outfit;
                pending.push([nextOutfit ? `${name}\u0001${nextOutfit}` : name, value]);
            }
        }
    }
    for (const [key, value] of pending) if (!own(result, key)) result[key] = value;
    return result;
}

export function migrateExpressionNotes(assets, from, to) {
    const notes = assets?.generated?.expressionNotes;
    if (!plain(notes)) return;
    assets.generated = { ...assets.generated, expressionNotes: rekeyExpressionNotes(notes, from, to) };
}
