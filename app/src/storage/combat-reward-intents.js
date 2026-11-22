import { writeCheckedStorage } from './checked-storage-write.js';

export const combatRewardIntentsKey = chatId => `igs:combat-reward:pending:v1:${encodeURIComponent(chatId)}`;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.length > 0;
const validOffer = offer => object(offer) && offer.type === 'offer'
    && nonempty(offer.id) && nonempty(offer.character) && object(offer.anchor)
    && object(offer.payload) && nonempty(offer.payload.combatId);
const fail = reason => ({ ok: false, reason });

export function validCombatRewardIntents(value, chatId) {
    return object(value) && value.version === 1 && nonempty(chatId) && value.chatId === chatId
        && Array.isArray(value.offers) && value.offers.length > 0 && value.offers.every(validOffer)
        && new Set(value.offers.map(offer => offer.payload.combatId)).size === value.offers.length
        && new Set(value.offers.map(offer => offer.id)).size === value.offers.length;
}

export function createCombatRewardIntents(storage) {
    function read(chatId) {
        if (!chatId || typeof storage?.getItem !== 'function') return fail('combat-offer-intent-unavailable');
        try {
            const raw = storage.getItem(combatRewardIntentsKey(chatId));
            if (raw === null) return { ok: true, offers: [] };
            const value = JSON.parse(raw);
            return validCombatRewardIntents(value, chatId) ? { ok: true, offers: value.offers } : fail('combat-offer-intent-invalid');
        } catch { return fail('combat-offer-intent-read-failed'); }
    }

    function change(chatId, offer, remove) {
        if (!validOffer(offer)) return fail('combat-offer-intent-invalid');
        const held = read(chatId);
        if (!held.ok) return held;
        const at = held.offers.findIndex(item => item.payload.combatId === offer.payload.combatId);
        if (at >= 0 && JSON.stringify(held.offers[at]) !== JSON.stringify(offer)) return fail('combat-offer-save-conflict');
        if (remove ? at < 0 : at >= 0) return { ok: true };
        const offers = remove ? held.offers.filter((_, index) => index !== at) : [...held.offers, offer];
        const value = { version: 1, chatId, offers };
        if (offers.length && !validCombatRewardIntents(value, chatId)) return fail('combat-offer-intent-invalid');
        return writeCheckedStorage(storage, combatRewardIntentsKey(chatId), offers.length ? JSON.stringify(value) : null).ok
            ? { ok: true } : fail('combat-offer-intent-write-failed');
    }

    return { read, stage: (chatId, offer) => change(chatId, offer, false), clear: (chatId, offer) => change(chatId, offer, true) };
}
