// 抠图隐藏入口：默认锁住，自动抠图强制关闭，设置页与搜索里所有抠图相关项都不出现。
// 在设置搜索框输入暗号切换解锁，状态只存本机 localStorage。源码只留暗号的哈希，不留明文。
const STORAGE_KEY = 'igs.matteUnlock';
const CODE_HASH = '5e6ad7a5';
// 锁住时搜索这些词一律无结果。
const BLOCKED_QUERY = /抠|去底|底色|遮罩|matte/i;

function storageOf(globalObject) {
    try { return (globalObject || globalThis).localStorage || null; } catch { return null; }
}

function hashCode(text) {
    let h = 0x811c9dc5;
    for (const ch of String(text)) {
        h ^= ch.codePointAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

export function isMatteUnlocked(globalObject) {
    try { return storageOf(globalObject)?.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

// 输入恰好是暗号时切换解锁状态并返回新状态；不是暗号返回 null。
export function tryToggleMatteUnlock(query, globalObject) {
    if (hashCode(String(query || '').replace(/\s+/g, '')) !== CODE_HASH) return null;
    const next = !isMatteUnlocked(globalObject);
    try {
        const storage = storageOf(globalObject);
        if (next) storage?.setItem(STORAGE_KEY, '1');
        else storage?.removeItem(STORAGE_KEY);
    } catch { /* 存不了就只在本次生效 */ }
    return next;
}

export function isMatteQueryBlocked(query, globalObject) {
    return !isMatteUnlocked(globalObject) && BLOCKED_QUERY.test(String(query || ''));
}


// 搜索条目是否属于抠图设置（锁住时从结果里剔除）。
export function isMatteEntry(entry) {
    const path = String(entry?.target?.path || '');
    return entry?.id === 'auto-matte' || entry?.id === 'sprite-matte-color'
        || path === 'bridge.imageApi.autoMatte' || path === 'bridge.imageApi.spriteMatteColor' || BLOCKED_QUERY.test(String(entry?.label || ''));
}
