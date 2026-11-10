import { CARD_ARCHETYPES } from './attribute-policy.js';
import { fixedCardGroup } from './fixed-cards/index.js';

const TOKEN_ARCHETYPES = Object.freeze({
    'shadow-shiv': 'assassin', 'forge-blade': 'warrior', 'summon-soul': 'summoner', 'token-boulder': 'warrior',
    'token-rebuke': 'bard', 'token-grace': 'bard', 'token-miracle': 'bard',
    'token-epiphany': 'bard', 'token-shelter': 'bard', 'token-sever': 'bard',
});

export function cardArchetypeOf(card, origins = {}) {
    if (card?.archetype !== undefined && !CARD_ARCHETYPES.includes(card.archetype)) throw new Error('invalid-card-archetype');
    const archetype = fixedCardGroup(card?.id) ?? TOKEN_ARCHETYPES[card?.id]
        ?? card?.archetype ?? origins[card?.id] ?? 'general';
    if (!CARD_ARCHETYPES.includes(archetype)) throw new Error('invalid-card-archetype');
    return archetype;
}
