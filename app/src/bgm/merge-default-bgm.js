import { DEFAULT_BGM_PACK } from './default-bgm-pack.js';

// 把默认曲目合并进 bgm.tracks：只新增不覆盖；id 或链接已存在的整条跳过。
// pack 为 'all' 时合并全部，否则只合并属于该世界观曲包的曲目（跨包共用的钢琴曲也会进来）。
const DEFAULT_IDS = new Set(DEFAULT_BGM_PACK.map((item) => item.id));

export function isDefaultBgmTrack(track) {
    return Boolean(track && DEFAULT_IDS.has(track.id));
}

export function defaultBgmPackTracks(pack = 'all', source = DEFAULT_BGM_PACK) {
    return source.filter((item) => pack === 'all' || item.packs.includes(pack));
}

export function mergeDefaultBgm(tracks, pack = 'all', { limit = Infinity, source = DEFAULT_BGM_PACK } = {}) {
    const next = Array.isArray(tracks) ? [...tracks] : [];
    const ids = new Set(next.map((track) => track && track.id));
    const urls = new Set(next.map((track) => track && track.url));
    const added = [];
    let skipped = 0;
    for (const item of defaultBgmPackTracks(pack, source)) {
        if (ids.has(item.id) || urls.has(item.url)) {
            skipped += 1;
            continue;
        }
        if (next.length >= limit) break;
        const track = {
            id: item.id, name: item.name, url: item.url, keywords: [], credit: item.credit, source: item.source,
            packs: [...item.packs], moods: [...item.moods],
        };
        for (const key of ['scenes', 'times', 'weathers']) if (item[key].length) track[key] = [...item[key]];
        next.push(track);
        added.push(track);
        ids.add(item.id);
        urls.add(item.url);
    }
    return { tracks: next, added, skipped };
}

export function removeDefaultBgm(tracks) {
    const list = Array.isArray(tracks) ? tracks : [];
    const kept = list.filter((track) => !isDefaultBgmTrack(track));
    return { tracks: kept, removed: list.length - kept.length };
}
