import { getSillyTavernContext } from './tavern-helper-adapter.js';
import { collectPromptContext } from './prompt-context.js';
import { sheetHistoryContext } from '../scene/stats/stat-sheets.js';

const text = value => String(value ?? '').trim();
const cardText = card => [...new Set(['description', 'personality', 'scenario']
    .map(key => text(card?.[key] || card?.data?.[key])).filter(Boolean))].join('\n');

export function createStatsSheetContext(host = globalThis, { resolveWorldInfo, aliasesOf = name => [name] } = {}) {
    return async function readSheetContext({ names = [], protagonists = [], protagonistCards = [] } = {}) {
        const context = getSillyTavernContext(host);
        if (!context) return { ok: false, reason: 'stats-sheet-context-unavailable' };
        const history = sheetHistoryContext(collectPromptContext(context).history);
        const cards = Array.isArray(context?.characters) ? context.characters : [];
        const people = names.map(name => {
            const sources = protagonists.includes(name) ? [name, context.name1, ...protagonistCards] : [name];
            const aliases = [...new Set(sources.filter(Boolean).flatMap(aliasesOf))];
            const own = cards.filter(card => card && aliases.includes(card.name)).map(cardText).filter(Boolean).join('\n');
            return { name, own, summary: own };
        });
        const active = context?.characterId != null ? cards[context.characterId] : null;
        const group = context?.groupId != null && Array.isArray(context.groups)
            ? context.groups.find(item => item?.id === context.groupId) : null;
        const settings = cards.filter(card => card && (card === active || group?.members?.includes(card.avatar)))
            .map(card => `【${card.name}】\n${cardText(card)}`).filter(Boolean).join('\n\n');
        const userPersona = protagonists.length ? [
            text(context?.name1) ? `User：${text(context.name1)}` : '',
            text(context?.powerUserSettings?.persona_description),
        ].filter(Boolean).join('\n') : '';
        if (typeof resolveWorldInfo !== 'function') return { ok: false, reason: 'WORLDINFO_UNAVAILABLE' };
        try {
            const resolved = await resolveWorldInfo({ numberedText: history });
            if (resolved?.ok !== true) return { ok: false, reason: resolved?.reason || 'WORLDINFO_RESOLVE_FAILED' };
            if (typeof resolved.text !== 'string') return { ok: false, reason: 'WORLDINFO_INVALID' };
            return { ok: true, people, history, settings, worldInfo: text(resolved.text), userPersona, protagonists };
        } catch {
            return { ok: false, reason: 'WORLDINFO_RESOLVE_THREW' };
        }
    };
}
