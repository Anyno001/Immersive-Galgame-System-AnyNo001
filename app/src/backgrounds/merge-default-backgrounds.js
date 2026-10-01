import { DEFAULT_BACKGROUND_PACK } from './default-background-pack.js';

// 把默认背景素材包合并进场景素材：只新增，不覆盖。
// 名称已被占用（同名场景或已有别名）时整条跳过；单个别名被占用时只丢弃该别名，避免触发别名撞名确认。
export function mergeDefaultBackgrounds(scenes, pack = DEFAULT_BACKGROUND_PACK) {
    const next = { ...(scenes && typeof scenes === 'object' && !Array.isArray(scenes) ? scenes : {}) };
    const used = new Set();
    for (const [name, scene] of Object.entries(next)) {
        used.add(String(name).trim());
        const words = scene && Array.isArray(scene.words) ? scene.words : [];
        for (const word of words) {
            const term = String(word || '').trim();
            if (term) used.add(term);
        }
    }
    const added = [];
    const skipped = [];
    for (const item of pack) {
        if (!item || !item.name || !item.url) continue;
        if (used.has(item.name)) {
            skipped.push(item.name);
            continue;
        }
        const words = (item.words || []).filter((word) => word && !used.has(word));
        const times = {};
        for (const [time, url] of Object.entries(item.times || {})) times[time] = { url, weathers: {} };
        next[item.name] = { url: item.url, times, ...(words.length ? { words: [...words] } : {}) };
        used.add(item.name);
        for (const word of words) used.add(word);
        added.push({ name: item.name, folder: item.folder || '' });
    }
    return { scenes: next, added, skipped };
}
