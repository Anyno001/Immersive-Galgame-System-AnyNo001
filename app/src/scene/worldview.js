// 世界观注册表：一键档位条里的「适配世界」下拉只读写这里，各演出/音效模块不直接判断存储字段。
// 存储：bridge.sceneAssets.worldview 是全局兜底。角色卡自己写了 worldview 时以卡为准。同时保留布尔 ancient 与古代同步写入，
// 让仍直接读 ancient 的消费方不受影响。读取时 ancient 为真即按古代；否则读 worldview，未知、预留或缺字段按现代处理。
// ready:false 为预留项：下拉里显示但不可选，applyWorldview 拒绝写入（当前无预留项）。
// 新增世界观时：先注册为 ready:false，补齐 fx-era.js 过滤表与时代规则、fx-sfx 音色和 fx-style 换皮后再改为 true。
import { isAncientEra } from './fx-era.js';

export const WORLDVIEWS = Object.freeze([
    Object.freeze({ id: 'modern', label: '现代', ready: true }),
    Object.freeze({ id: 'ancient', label: '古代', ready: true }),
    Object.freeze({ id: 'fantasy', label: '西幻', ready: true }),
    Object.freeze({ id: 'scifi', label: '科幻', ready: true }),
    Object.freeze({ id: 'apocalypse', label: '末日', ready: true }),
    Object.freeze({ id: 'taisho', label: '大正', ready: true }),
    Object.freeze({ id: 'magic', label: '魔法', ready: true }),
    Object.freeze({ id: 'horror', label: '恐怖', ready: true }),
]);

export const DEFAULT_WORLDVIEW = 'modern';

// 在现代演出结构上换皮的世界观（古代有独立分支，不在此列）；演出 / 音效层只经 worldSkinOf 判断，不各自维护列表。
export const WORLD_SKIN_IDS = Object.freeze(['fantasy', 'scifi', 'apocalypse', 'taisho', 'magic', 'horror']);
export function worldSkinOf(id) {
    return WORLD_SKIN_IDS.includes(id) ? id : '';
}

export function isKnownWorldview(id) {
    return WORLDVIEWS.some((item) => item.id === id);
}

export function isReadyWorldview(id) {
    return WORLDVIEWS.some((item) => item.id === id && item.ready === true);
}

export function normalizeWorldview(id) {
    return isReadyWorldview(id) ? id : DEFAULT_WORLDVIEW;
}

// 从场景素材设置读出当前世界观 id。
export function resolveWorldview(sceneAssets) {
    if (isAncientEra(sceneAssets)) return 'ancient';
    const stored = sceneAssets && typeof sceneAssets === 'object' && !Array.isArray(sceneAssets) ? sceneAssets.worldview : undefined;
    const id = normalizeWorldview(stored);
    // worldview 写着 ancient 但 ancient 已被置假：以 ancient 为准，按现代处理。
    return id === 'ancient' ? DEFAULT_WORLDVIEW : id;
}

// 原地写入场景素材草稿；未知、预留 id 或非对象返回 false 且不改动。
export function applyWorldview(sceneAssets, id) {
    if (!sceneAssets || typeof sceneAssets !== 'object' || Array.isArray(sceneAssets)) return false;
    if (!isReadyWorldview(id)) return false;
    sceneAssets.ancient = id === 'ancient';
    sceneAssets.worldview = id;
    return true;
}
