// 本轮目录只用于选择；解析后保存实际衣装来源，不跨轮复用数字编号。
import { BUILTIN_NUDE_OUTFIT, isValidOutfitName } from '../../scene/character-outfits.js';
import { confirmedCreatureOf } from '../../scene/creature-profile.js';

const NUDE_DESCRIPTION = 'completely nude';
// NSFW 楼层：衣装槽必填，没有「裸体」可选时只能套保存的整套衣服。
export const CG_NUDE_OUTFIT_RULE = `【NSFW 衣装】outfitCatalog 里名为「${BUILTIN_NUDE_OUTFIT}」的条目表示全裸。正文写明全裸、脱光时选它，名称写「${BUILTIN_NUDE_OUTFIT}」，衣装描述写 ${NUDE_DESCRIPTION}；穿着或半脱时选本人的衣装编号，敞开、掀起、拨开等衣物移位写进本人 Char；正文没提衣服时按今天的穿着选，不擅自脱掉。`;

const validDescription = value => typeof value === 'string' && !!value.trim()
    && value.length <= 4096 && !/<<\s*(?:dna|outfit)/i.test(value);
const fail = (issue, captionIndex) => ({ ok: false, reason: 'OUTFIT_TEMPLATE_INVALID',
    error: `CG 衣装引用无效 [字段=meta_outfit_id；原因=${issue}；captionIndex=${captionIndex}]；未继续绘图`,
    diagnostic: { field: 'meta_outfit_id', issue, captionIndex } });

export function buildCgOutfitCatalog(context, { nsfw = false } = {}) {
    const catalog = [];
    for (const character of context) {
        for (const outfit of character.outfits || []) {
            if (!isValidOutfitName(outfit.name) || !validDescription(outfit.description)) continue;
            catalog.push({ id: catalog.length + 1, characterKey: character.characterKey,
                name: outfit.name, description: outfit.description });
        }
        // 非人角色本就无衣装，不加。
        if (nsfw && !confirmedCreatureOf(character.dna)) catalog.push({ id: catalog.length + 1,
            characterKey: character.characterKey, name: BUILTIN_NUDE_OUTFIT, description: NUDE_DESCRIPTION });
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
