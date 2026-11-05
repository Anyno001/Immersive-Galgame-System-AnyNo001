import { resolveIntimatePhase } from './romance-intimate.js';
import { floorHasNewRise, underageByProfile } from '../../scene/intimate-duel.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';

const textsOf = (value, out = []) => {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach((item) => textsOf(item, out));
    else if (value && typeof value === 'object') Object.values(value).forEach((item) => textsOf(item, out));
    return out;
};

export function intimatePartnerOf(pages, userName) {
    for (const page of Array.isArray(pages) ? pages : []) {
        if (!page || !page.nsfwSpan) continue;
        const name = String(page.spriteChar || page.bubbleSpeaker || '').trim();
        if (name && name !== userName) return name;
    }
    return '';
}

export function intimateProfileTexts(assets, partner) {
    if (!assets || !partner) return [];
    const pool = { ...assets.characterDna, ...assets.characters };
    const key = resolveCharacterKey(pool, assets.characterAliases, partner) || partner;
    return [...textsOf(assets.characterDna && assets.characterDna[key]), ...textsOf(assets.characterSpriteNotes && assets.characterSpriteNotes[key])];
}

export function computeIntimateFloorGate({ pages, messageId, userName, assets, previous } = {}) {
    const newRise = floorHasNewRise(pages, resolveIntimatePhase);
    const partner = intimatePartnerOf(pages, userName);
    const eventKey = newRise ? Number(messageId) : null;
    return {
        newRise, partner, eventKey,
        ageBlocked: underageByProfile(intimateProfileTexts(assets, partner)),
        launch: Boolean(previous && previous.launch === true && previous.eventKey === eventKey),
    };
}

export function pageIsIntimateRise(page) {
    return Boolean(page && page.nsfwSpan && page.nsfwSpan.continued !== true && resolveIntimatePhase(page.nsfwSpan) === 'rise');
}
