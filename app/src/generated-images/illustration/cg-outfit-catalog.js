// 本轮目录只用于选择；解析后保存实际衣装来源，不跨轮复用数字编号。
import { isValidOutfitName } from '../../scene/character-outfits.js';

const validDescription = value => typeof value === 'string' && !!value.trim()
    && value.length <= 4096 && !/<<\s*(?:dna|outfit)/i.test(value);
const fail = (issue, captionIndex) => ({ ok: false, reason: 'OUTFIT_TEMPLATE_INVALID',
    error: `CG 衣装引用无效 [字段=meta_outfit_id；原因=${issue}；captionIndex=${captionIndex}]；未继续绘图`,
    diagnostic: { field: 'meta_outfit_id', issue, captionIndex } });

export function buildCgOutfitCatalog(context) {
    const catalog = [];
    for (const character of context) {
        for (const outfit of character.outfits || []) {
            if (!isValidOutfitName(outfit.name) || !validDescription(outfit.description)) continue;
            catalog.push({ id: catalog.length + 1, characterKey: character.characterKey,
                name: outfit.name, description: outfit.description });
        }
    }
    return catalog;
}

export function resolveCgOutfit(id, proposal, binding, catalog) {
    const index = binding.captionIndex;
    if (id === undefined) return fail('missing', index);
    if (!isValidOutfitName(proposal.name) || !validDescription(proposal.description))
        return { ...fail('invalid', index), error: `CG 衣装名称和描述必须完整交付 [captionIndex=${index}]；未继续绘图` };
    if (id === '') return { ok: true, value: { name: proposal.name,
        description: proposal.description, source: 'candidate' } };
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !Array.isArray(catalog))
        return fail('invalid', index);
    const matches = catalog.filter(row => row.id === Number(id));
    if (matches.length !== 1 || matches[0].characterKey !== binding.characterKey)
        return fail('mismatch', index);
    const selected = matches[0];
    if (!isValidOutfitName(selected.name) || !validDescription(selected.description)) return fail('invalid', index);
    return { ok: true, value: { name: selected.name, description: selected.description, source: 'saved' } };
}

export function cgSelectedOutfitAnchor(entry, offset) {
    return { version: 1, offset, characters: entry.outfitSnapshot.characters.map(c => ({
        characterKey: c.characterKey, requestedOutfit: c.name, effectiveOutfit: c.name,
        requirementSource: 'cg-selection', source: 'cg-selection', reason: '', effectiveSource: 'snapshot',
    })) };
}
