// 命名衣装的默认选择与人物图解析；只读输入，不迁移旧原装或 DNA。
import { resolveCharacterKey, lookupAssetValue } from './scene-directives.js';
import { isValidOutfitName, isBuiltinNudeOutfit, resolveWardrobePrompt } from './character-outfits.js';

const own = (o, k) => Boolean(o && Object.hasOwn(o, k));
const plain = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const blocked = new Set(['__proto__', 'constructor', 'prototype']);
const text = v => typeof v === 'string' ? v.trim() : '';
const fail = (reason, details = {}) => ({ ok: false, reason, ...details });

// 未知版本/坏记录保留用于诊断；读时拒用，不在普通保存时修复或删除。
export function normalizeCharacterDefaultOutfits(value) {
    return Object.fromEntries(Object.entries(plain(value))
        .filter(([key]) => key.trim() && !blocked.has(key))
        .map(([key, entry]) => [key, structuredClone(entry)]));
}

export function appearanceCharacterKey(assets, name) {
    const known = { ...assets?.characterDna, ...assets?.generated?.characters,
        ...assets?.characters, ...assets?.characterOutfits, ...assets?.characterDefaultOutfits };
    return resolveCharacterKey(known, assets?.characterAliases, name) || '';
}

export function readDefaultOutfit(assets, character) {
    const characterKey = appearanceCharacterKey(assets, character);
    const map = plain(assets?.characterDefaultOutfits);
    if (!characterKey || !own(map, characterKey)) return fail('default-outfit-unset', { characterKey });
    const record = map[characterKey];
    if (!record || record.version !== 1 || !isValidOutfitName(record.outfitName)
        || record.outfitName !== record.outfitName.trim()) return fail('default-outfit-invalid', { characterKey });
    const outfits = plain(assets?.characterOutfits?.[characterKey]);
    if (!own(outfits, record.outfitName)) return fail('default-outfit-missing', { characterKey });
    return { ok: true, characterKey, outfitName: record.outfitName, entry: outfits[record.outfitName] };
}

export function outfitSpriteSlots(entry) {
    const slots = Object.fromEntries(Object.entries(plain(entry?.moods))
        .filter(([slot, url]) => !blocked.has(slot) && text(url)).map(([slot, url]) => [slot, text(url)]));
    if (isBuiltinNudeOutfit(entry?.wardrobe) && text(entry?.base)) slots['裸体'] = entry.base.trim();
    return slots;
}

// 已登记地址即算正式立绘；读取失败不等于从未有图。
export function hasCharacterSprite(assets, character) {
    const key = appearanceCharacterKey(assets, character);
    if (!key) return false;
    return [assets?.characters?.[key], assets?.generated?.characters?.[key]]
        .some(slots => Object.values(plain(slots)).some(url => text(url)))
        || Object.values(plain(assets?.characterOutfits?.[key]))
            .some(entry => Object.keys(outfitSpriteSlots(entry)).length > 0);
}

// 可用性由调用方提供；仅有 URL 表示已登记，不代表资源已经成功读取。
function imageState(url, availability) {
    try {
        const value = typeof availability === 'function' ? availability(url) : availability?.[url];
        const state = typeof value === 'string' ? { status: value } : value;
        if (!state) return { status: 'unverified' };
        return ['available', 'missing', 'read-error', 'decode-error', 'loading', 'unverified'].includes(state.status)
            ? state : { status: 'read-error' };
    } catch { return { status: 'read-error' }; }
}

export function pickOutfitSprite(entry, mood, assets = {}, availability, reference = false) {
    const all = outfitSpriteSlots(entry), slots = Object.create(null), states = Object.create(null);
    for (const [slot, url] of Object.entries(all)) {
        const state = imageState(url, availability);
        states[slot] = state;
        if (state.status === 'available' || state.status === 'unverified') slots[slot] = url;
    }
    const verifiedSlots = Object.assign(Object.create(null), Object.fromEntries(Object.entries(slots)
        .filter(([slot]) => states[slot].status === 'available')));
    const selectable = Object.keys(verifiedSlots).length ? verifiedSlots : slots;
    const match = lookupAssetValue(selectable, reference ? '平和' : mood,
        assets.moodGroups, !reference && assets.moodFuzzyMatch === true, false);
    const baseSlot = ['平和', '默认', '裸体'].find(slot => own(selectable, slot));
    const slot = match.url ? match.slot : baseSlot || Object.keys(selectable)[0];
    if (slot) return { ok: true, url: slots[slot], slot,
        quality: match.url ? match.quality : 'group',
        verified: states[slot].status === 'available',
        ...(states[slot].revision !== undefined && { revision: states[slot].revision }) };
    const values = Object.values(states);
    const reason = values.some(s => s.status === 'read-error') ? 'outfit-image-read-error'
        : values.some(s => s.status === 'decode-error') ? 'outfit-image-decode-error'
        : values.some(s => s.status === 'loading' || s.status === 'unverified') ? 'outfit-image-pending'
            : values.length ? 'outfit-image-missing' : 'outfit-image-empty';
    return fail(reason);
}

export function resolveCharacterAppearance({ characterKey: character, requestedOutfit = '', mood = '',
    purpose = 'reader', sceneAssets = {}, ownerScope = '', imageAvailability } = {}) {
    const characterKey = appearanceCharacterKey(sceneAssets, character);
    if (!characterKey) return fail('appearance-character-missing');
    const requested = text(requestedOutfit);
    const explicit = requested && !['默认', '原装'].includes(requested);
    const outfits = plain(sceneAssets.characterOutfits?.[characterKey]);
    let effectiveOutfit = explicit ? requested : '', fallbackReason = '';
    let picked = explicit && own(outfits, requested)
        ? pickOutfitSprite(outfits[requested], mood, sceneAssets, imageAvailability)
        : fail(explicit ? 'outfit-unregistered' : 'default-requested');
    if (!picked.ok) {
        if (['outfit-image-read-error', 'outfit-image-decode-error', 'outfit-image-pending'].includes(picked.reason))
            return fail(picked.reason, { characterKey, requestedOutfit: requested });
        fallbackReason = explicit ? picked.reason : '';
        const selected = readDefaultOutfit(sceneAssets, characterKey);
        if (!selected.ok) return { ...selected, requestedOutfit: requested, fallbackReason };
        effectiveOutfit = selected.outfitName;
        picked = pickOutfitSprite(selected.entry, mood, sceneAssets, imageAvailability);
        if (!picked.ok) return fail(picked.reason, { characterKey, requestedOutfit: requested, effectiveOutfit, fallbackReason });
    }
    const entry = outfits[effectiveOutfit];
    const outfitDescription = isBuiltinNudeOutfit(entry?.wardrobe)
        ? 'No clothing; retain the fixed identifying features.'
        : resolveWardrobePrompt(sceneAssets.wardrobe, entry, effectiveOutfit)?.prompt || '';
    if (purpose === 'consistency' && !outfitDescription.trim())
        return fail('outfit-dna-missing', { characterKey, requestedOutfit: requested, effectiveOutfit });
    const referenceImage = pickOutfitSprite(entry, '平和', sceneAssets, imageAvailability, true);
    const confirmationRequired = Boolean(explicit && effectiveOutfit !== requested);
    return { ok: true, characterKey, requestedOutfit: requested, effectiveOutfit, outfitDescription,
        spriteImage: picked, referenceImage,
        selectionSource: confirmationRequired ? 'default-fallback' : explicit ? 'requested' : 'default',
        fallbackReason, confirmationRequired,
        // 私有等值快照，不得进入日志、模型请求或永久存储；变更后再改回由调用方租约拒收。
        sourceToken: JSON.stringify([ownerScope, characterKey, requested, effectiveOutfit,
            sceneAssets.characterDefaultOutfits?.[characterKey] ?? null, outfitDescription,
            outfitSpriteSlots(entry), picked.url, referenceImage.url,
            picked.revision ?? null, referenceImage.revision ?? null]) };
}

export function prepareDefaultOutfitSelection(assets, character, outfitName, imageAvailability) {
    const characterKey = appearanceCharacterKey(assets, character);
    const entry = plain(assets?.characterOutfits?.[characterKey]);
    if (!characterKey || !isValidOutfitName(outfitName) || !own(entry, outfitName))
        return fail('default-outfit-missing');
    const picked = pickOutfitSprite(entry[outfitName], '平和', assets, imageAvailability, true);
    if (!picked.ok) return picked;
    if (!picked.verified) return fail('default-outfit-unverified');
    return { ok: true, patch: { characterDefaultOutfits: {
        ...plain(assets.characterDefaultOutfits), [characterKey]: { version: 1, outfitName },
    } } };
}

// 仅在新人物图核验成功的保存事件中建立首次默认，不从存量图推断。
export function prepareInitialDefaultOutfitSelection(assets, character, outfitName, imageAvailability) {
    const selected = readDefaultOutfit(assets, character);
    if (selected.ok) return { ok: true, patch: {} };
    if (selected.reason !== 'default-outfit-unset') return selected;
    return prepareDefaultOutfitSelection(assets, character, outfitName, imageAvailability);
}
