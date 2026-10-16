// 删除前读取持久引用；允许存储完成元数据恢复，但不 hydrate、上传或修改图片。
import { collectGeneratedImageIds } from '../../scene/asset-match.js';
import { LEGACY_PRESET_KEY } from '../../scene/legacy-preset.js';
import { loadStoryOutfitCandidates } from '../../scene/outfit-review-store.js';

export async function protectedAssetImageIds({ readSceneAssets, storage, illustrationStore }) {
    const held = new Set();
    const collect = value => collectGeneratedImageIds(value).forEach(id => held.add(id));
    if (typeof illustrationStore?.listSlotKeys !== 'function'
        || typeof illustrationStore.getSlotRecords !== 'function') throw new Error('image-reference-unavailable');
    const keys = await illustrationStore.listSlotKeys({ requireComplete: true });
    if (!Array.isArray(keys)) throw new Error('image-reference-unavailable');
    for (let offset = 0; offset < keys.length; offset += 20) {
        const batch = keys.slice(offset, offset + 20);
        const records = await illustrationStore.getSlotRecords(batch);
        if (!Array.isArray(records) || records.length !== batch.length
            || records.some((record, i) => !record || record.key !== batch[i]))
            throw new Error('image-reference-unavailable');
        for (const record of records) collect(record);
    }
    const currentKeys = await illustrationStore.listSlotKeys({ requireComplete: true });
    if (!Array.isArray(currentKeys) || currentKeys.length !== keys.length
        || currentKeys.some(key => !keys.includes(key))) throw new Error('image-reference-unavailable');
    // 异步读完 CG 后再取当前原始全库，包含未激活角色卡及存量引用。
    const assets = readSceneAssets();
    if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw new Error('image-reference-unavailable');
    collect(assets);
    if (storage) {
        const candidates = loadStoryOutfitCandidates(storage);
        if (!candidates.ok) throw new Error('image-reference-unavailable');
        for (const row of candidates.items) if (row.imageId) held.add(row.imageId);
        const raw = storage.getItem(LEGACY_PRESET_KEY);
        if (raw) {
            const legacy = JSON.parse(raw);
            if (!legacy || typeof legacy !== 'object' || !legacy.presets
                || typeof legacy.presets !== 'object' || Array.isArray(legacy.presets))
                throw new Error('image-reference-unavailable');
            collect(legacy.presets);
        }
    }
    return [...held];
}
