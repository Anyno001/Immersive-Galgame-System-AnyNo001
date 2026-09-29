import { spriteIdentity } from '../../scene/character-outfits.js';

// 立绘位置（mode::身份[::槽]）与头部标定（身份[::槽]）key 的统一迁移 / 清理。
// 身份为「角色」或「角色|服装」；按完整身份比对，「小林」不会误中「小林海斗」。
// from / to 为 { character, outfit?, mood? }：未给 outfit 表示该角色全部（含各服装），outfit 为 '' 表示原有立绘；
// 未给 mood 表示该身份全部槽（含身份级 key）。to 为 null 时删除。目标 key 已有用户数据时保留目标、丢弃来源，不覆盖。
function splitIdentity(identity) {
    const index = identity.indexOf('|');
    return index < 0 ? { character: identity, outfit: '' } : { character: identity.slice(0, index), outfit: identity.slice(index + 1) };
}

function parseKey(key, withMode) {
    const parts = String(key).split('::');
    const head = withMode ? parts.shift() : null;
    if (!parts.length || !parts[0]) return null;
    const identity = parts.shift();
    return { mode: head, ...splitIdentity(identity), mood: parts.length ? parts.join('::') : null };
}

function matches(parsed, from) {
    if (!parsed || parsed.character !== from.character) return false;
    if (from.outfit != null && parsed.outfit !== from.outfit) return false;
    if (from.mood != null && parsed.mood !== from.mood) return false;
    return true;
}

function buildKey(parsed, to, withMode) {
    const identity = spriteIdentity(to.character != null ? to.character : parsed.character, to.outfit != null ? to.outfit : parsed.outfit);
    const mood = to.mood != null ? to.mood : parsed.mood;
    return [withMode ? parsed.mode : null, identity, mood].filter((part) => part != null).join('::');
}

function migrateMap(map, from, to, withMode) {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return { map, moved: 0, removed: 0, kept: 0 };
    const out = {};
    const pending = [];
    let removed = 0;
    for (const [key, value] of Object.entries(map)) {
        const parsed = parseKey(key, withMode);
        if (!matches(parsed, from)) { out[key] = value; continue; }
        if (to) pending.push([buildKey(parsed, to, withMode), value]); else removed++;
    }
    let moved = 0;
    let kept = 0;
    for (const [key, value] of pending) {
        if (Object.prototype.hasOwnProperty.call(out, key)) { kept++; continue; }
        out[key] = value;
        moved++;
    }
    return { map: out, moved, removed: removed + kept, kept };
}

export function migrateSpriteKeys(readerSettings, from, to) {
    const report = { moved: 0, removed: 0, kept: 0 };
    if (!readerSettings || typeof readerSettings !== 'object' || !from || !from.character) return report;
    for (const [field, withMode] of [['spriteLayouts', true], ['spriteHeads', false]]) {
        if (!readerSettings[field]) continue;
        const result = migrateMap(readerSettings[field], from, to || null, withMode);
        readerSettings[field] = result.map;
        report.moved += result.moved;
        report.removed += result.removed;
        report.kept += result.kept;
    }
    return report;
}
