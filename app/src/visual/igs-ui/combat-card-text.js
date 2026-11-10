import { esc } from './reader-value-utils.js';

export function partHtml(part) {
    const tip = part.tip ? ` data-scale-tip="${esc(part.tip)}"` : '';
    const mark = part.mark === 'up' || part.mark === 'down' ? ` class="igs-scale-${part.mark}"` : '';
    return tip || mark ? `<span${mark}${tip}>${esc(part.text)}</span>` : esc(part.text);
}

export function cardTextHtml(card) {
    return Array.isArray(card?.textParts) ? card.textParts.map(partHtml).join('') : esc(card?.text || '');
}

export function cardFxHtml(card) {
    return Array.isArray(card?.fxParts) ? card.fxParts.map(partHtml).join('') : esc(card?.fxText ?? card?.text ?? '');
}
