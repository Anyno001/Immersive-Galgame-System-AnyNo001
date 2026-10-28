import { extractCombatStart } from '../../scene/combat-directives.js';
import { normalizeCombatExpansionSettings } from './combat-settings.js';
import { esc } from './reader-value-utils.js';

// 开战楼入口：只在扩展开启、当前楼是最新 AI 楼、翻到末页、正文末尾是有效开战标签时显示。
// 翻到这一页即自动打开战斗面板：同一开战楼（chatId + messageId + swipeId + tagHash）只自动打开一次，
// 由调用方在面板确实打开后记入 seen；被地图、资料等面板挡住时不记，下一次渲染再弹。
export const COMBAT_ENTRY_ID = 'igs-combat-entry';
const TIER_LABELS = Object.freeze({ normal: '', elite: '精英', boss: '首领' });

export function resolveCombatEntry({ readerSettings, floor, lastPage, sourceFilter } = {}) {
    const settings = normalizeCombatExpansionSettings(readerSettings && readerSettings.combatExpansion);
    if (!settings.enabled || !lastPage || !floor || !floor.isAi || !floor.isLatest || !floor.chatId) return null;
    const { start } = extractCombatStart(String(floor.text || ''), { sourceFilter });
    if (!start) return null;
    const key = [floor.chatId, floor.messageId, floor.swipeId, start.tagHash, start.occurrence].join('|');
    return { key, messageId: Number(floor.messageId), encounter: start.encounter, tier: start.tier, enemies: start.enemies };
}

export function combatEntryHtml(entry) {
    const foes = entry.enemies.map((e) => `${e.name}${e.count > 1 ? ` ×${e.count}` : ''}`).join('、');
    const tier = TIER_LABELS[entry.tier] || '';
    return `<button type="button" class="igs-combat-entry-btn" data-combat-entry="open"><span class="igs-combat-entry-cap">ENCOUNTER${tier ? ` · ${esc(tier)}` : ''}</span>`
        + `<span class="igs-combat-entry-name">${esc(entry.encounter)}</span><span class="igs-combat-entry-foes">${esc(foes)}</span></button>`;
}

// 挂在 overlay 直属层；点击不冒泡到翻页层。entry 为 null 时移除。返回是否应自动打开：seen 里还没有这一开战楼。
export function syncCombatEntry(overlay, entry, { onOpen, seen } = {}) {
    if (!overlay || typeof overlay.querySelector !== 'function') return false;
    let node = overlay.querySelector(`#${COMBAT_ENTRY_ID}`);
    if (!entry) {
        if (node) node.remove();
        return false;
    }
    if (!node) {
        node = overlay.ownerDocument.createElement('div');
        node.id = COMBAT_ENTRY_ID;
        node.addEventListener('click', (event) => {
            event.stopPropagation?.();
            event.preventDefault?.();
            const target = event.target?.closest?.('[data-combat-entry]');
            if (target && typeof node.onOpen === 'function') node.onOpen();
        });
        overlay.appendChild(node);
    }
    if (node.getAttribute('data-key') !== entry.key) {
        node.setAttribute('data-key', entry.key);
        node.innerHTML = combatEntryHtml(entry);
    }
    node.onOpen = onOpen;
    return Boolean(seen) && !seen.has(entry.key);
}
