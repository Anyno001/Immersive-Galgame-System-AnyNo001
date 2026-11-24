import { assetOwnerKey, effectiveSceneAssets, ensureCardLibrary, resolveAssetScope, relocateLegacyCard } from '../scene/asset-scope.js';
import { buildCharacterContext } from '../scene/character-identity.js';
import { mergeGeneratedCharacterDna } from '../scene/character-dna-preparation.js';
import { planCreatureProfiles } from '../scene/creature-registry.js';
import { resolveCharacterKey } from '../scene/scene-directives.js';
import { prepareOutfitDnaSave } from '../scene/outfit-identity.js';
import { appearanceCharacterKey, hasCharacterSprite, readDefaultOutfit } from '../scene/character-appearance.js';
import { isBuiltinNudeOutfit, isValidOutfitName, resolveWardrobePrompt } from '../scene/character-outfits.js';
import { isNonSpriteSpeaker } from '../scene/asset-match.js';

const fields = ['characters', 'characterDna', 'characterOutfits', 'characterAliases', 'characterDefaultOutfits', 'generated.characters'];
const BLOCKED_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const stale = () => ({ ok: false, reason: 'stale-target', stopGeneration: true, error: '角色或角色卡已变化，未继续生成立绘' });

// 自动建档按角色原归属保存；只写本次 DNA，不回写生图服务拿到的合并视图。
export function createCharacterDnaStore({ readAssets, readContext, saveAssets, onPlaceholderSaved } = {}) {
    function snapshot(requested, source = readAssets() || {}) {
        const scope = resolveAssetScope(readContext());
        const root = { ...source, cards: { ...source.cards } };
        relocateLegacyCard(root, scope.key, scope.legacyKey);
        const effective = effectiveSceneAssets(root, scope.key);
        const character = buildCharacterContext([requested], effective)[0];
        if (!character) return null;
        const name = character.characterKey;
        const owner = assetOwnerKey(root, scope.key, fields, name);
        const library = owner ? root.cards?.[owner] || {} : root;
        return { root, library, name, owner, scope: scope.key, dna: character.dna, wardrobe: effective.wardrobe };
    }
    // 未有立绘的出场角色：以首次登场标签里的服装作为默认服装，立即建立立绘占位（characters[name] = {}）
    // 与默认衣装槽（characterOutfits + characterDefaultOutfits），让后续立绘生成与衣柜入库都挂到该占位下。
    function ensurePortraitPlaceholders(entries = []) {
        if (!Array.isArray(entries) || !entries.length) return { ok: true, changed: false, created: [] };
        const scope = resolveAssetScope(readContext());
        const before = readAssets() || {};
        const root = structuredClone(before);
        relocateLegacyCard(root, scope.key, scope.legacyKey);
        let effective = effectiveSceneAssets(root, scope.key);
        let changed = false;
        const created = [];
        const handled = new Set();
        for (const item of entries) {
            const rawName = typeof item === 'string' ? item : item?.name;
            const requested = String(rawName || '').trim();
            if (!requested || BLOCKED_NAMES.has(requested) || isNonSpriteSpeaker(requested)) continue;
            const canonicalKey = appearanceCharacterKey(effective, requested) || requested;
            if (!canonicalKey || BLOCKED_NAMES.has(canonicalKey) || handled.has(canonicalKey)) continue;
            handled.add(canonicalKey);
            if (hasCharacterSprite(effective, canonicalKey)) continue;
            const owner = assetOwnerKey(root, scope.key, fields, canonicalKey);
            const library = owner ? ensureCardLibrary(root, owner) : root;
            let entryChanged = false;
            if (!library.characters || typeof library.characters !== 'object' || Array.isArray(library.characters)) {
                library.characters = {};
            }
            if (!Object.hasOwn(library.characters, canonicalKey)) {
                library.characters = { ...library.characters, [canonicalKey]: {} };
                entryChanged = true;
            }
            const rawOutfit = typeof item === 'object' ? String(item?.outfitName || '').trim() : '';
            const outfit = isValidOutfitName(rawOutfit) && !isBuiltinNudeOutfit(rawOutfit) ? rawOutfit : '';
            if (outfit) {
                const existingOutfits = library.characterOutfits?.[canonicalKey] || {};
                if (!Object.hasOwn(existingOutfits, outfit)) {
                    library.characterOutfits = {
                        ...(library.characterOutfits || {}),
                        [canonicalKey]: { ...existingOutfits, [outfit]: { words: [], moods: {} } },
                    };
                    entryChanged = true;
                }
                if (!readDefaultOutfit(effective, canonicalKey).ok && !Object.hasOwn(library.characterDefaultOutfits || {}, canonicalKey)) {
                    library.characterDefaultOutfits = {
                        ...(library.characterDefaultOutfits || {}),
                        [canonicalKey]: { version: 1, outfitName: outfit },
                    };
                    entryChanged = true;
                }
            }
            if (entryChanged) {
                changed = true;
                created.push({ name: canonicalKey, outfitName: outfit });
                effective = effectiveSceneAssets(root, scope.key);
            }
        }
        if (!changed) return { ok: true, changed: false, created: [] };
        let saved;
        try { saved = saveAssets(root); } catch { saved = { ok: false }; }
        if (saved?.ok !== true) return { ok: false, changed: false, created: [], reason: 'placeholder-save-failed' };
        try { onPlaceholderSaved?.(before, root); } catch { /* 同步草稿失败不影响已保存占位 */ }
        return { ok: true, changed: true, created };
    }
    // 非人角色登记（AI 标注与战斗对手临时档）：只写本卡自己的 characterDna，不改全局与别的卡。
    function registerCreatures(hints, { now = Date.now(), limit } = {}) {
        if (!Array.isArray(hints) || !hints.length) return { ok: true, changed: false };
        const scope = resolveAssetScope(readContext());
        const source = readAssets() || {};
        const root = { ...source, cards: { ...source.cards } };
        relocateLegacyCard(root, scope.key, scope.legacyKey);
        const effective = effectiveSceneAssets(root, scope.key);
        const owner = scope.key || '';
        const library = owner ? root.cards?.[owner] || {} : root;
        const known = { ...effective.characterDna, ...effective.characters, ...effective.characterOutfits };
        const plan = planCreatureProfiles({ effective, cardDna: library.characterDna || {}, hints, now,
            ...(limit && { limit }), resolve: name => resolveCharacterKey(known, effective.characterAliases || {}, name) || name });
        if (!plan.changed) return { ok: true, changed: false };
        const nextLibrary = { ...library, characterDna: plan.cardDna };
        const next = owner ? { ...root, cards: { ...root.cards, [owner]: nextLibrary } } : nextLibrary;
        let saved;
        try { saved = saveAssets(next); } catch { saved = { ok: false }; }
        if (saved?.ok !== true) return { ok: false, changed: false, reason: 'creature-save-failed' };
        return { ok: true, changed: true, created: plan.created, updated: plan.updated, evicted: plan.evicted };
    }
    return { ensurePortraitPlaceholders, registerCreatures, capture(requested) {
        const initial = snapshot(requested);
        if (!initial) return null;
        const isCurrent = () => resolveAssetScope(readContext()).key === initial.scope;
        const put = library => {
            const live = snapshot(requested);
            const next = live.owner ? { ...live.root, cards: { ...live.root.cards, [live.owner]: library(live) } } : library(live);
            try { return saveAssets(next)?.ok === true; } catch { return false; }
        };
        return { key: JSON.stringify([initial.scope, initial.owner, initial.name]), name: initial.name,
            scope: initial.scope, owner: initial.owner, dna: initial.dna, isCurrent,
            // 库里原样的 DNA（未合并全局视图），写词即存时记下以便丢弃图片时还原。
            rawDna: () => structuredClone(snapshot(requested)?.library.characterDna?.[initial.name] ?? null),
            // 写词返回的新衣装直接入衣柜；已有同名衣装说明不覆盖，空占位槽正常补写说明。
            saveOutfit(clothing) {
                if (!isCurrent()) return stale();
                const live = snapshot(requested);
                const existingEntry = live.library.characterOutfits?.[live.name]?.[clothing.name];
                const existed = Boolean(resolveWardrobePrompt(live.wardrobe, existingEntry, clothing.name)?.prompt);
                const prepared = prepareOutfitDnaSave(live.library, live.name, clothing.name, clothing.description,
                    { readWardrobe: live.wardrobe, descriptionHalfBody: clothing.descriptionHalfBody });
                if (!prepared.ok) return prepared;
                if (!Object.keys(prepared.patch).length) return { ok: true, created: false };
                if (!put(lib => ({ ...lib.library, ...prepared.patch })))
                    return { ok: false, reason: 'outfit-save-failed', error: '衣装保存失败' };
                const entry = prepared.patch.characterOutfits?.[live.name]?.[clothing.name];
                const wardrobeKey = entry?.wardrobe;
                return { ok: true, created: !existed, name: clothing.name, entry,
                    ...(wardrobeKey && prepared.patch.wardrobe?.[wardrobeKey] && { wardrobeKey, wardrobe: prepared.patch.wardrobe[wardrobeKey] }) };
            },
            save(dna) {
                if (!isCurrent()) return stale();
                const live = snapshot(requested);
                const mergedDna = mergeGeneratedCharacterDna(initial.dna, live.library.characterDna?.[live.name], dna);
                const library = { ...live.library, characterDna: { ...live.library.characterDna, [live.name]: mergedDna } };
                const next = live.owner ? { ...live.root, cards: { ...live.root.cards, [live.owner]: library } } : library;
                let saved;
                try { saved = saveAssets(next); } catch { saved = { ok: false }; }
                if (saved?.ok !== true) return { ok: false, reason: 'dna-save-failed', error: '角色 DNA 保存失败，未发起立绘生成' };
                return isCurrent() ? { ok: true, dna: mergedDna } : stale();
            } };
    } };
}
