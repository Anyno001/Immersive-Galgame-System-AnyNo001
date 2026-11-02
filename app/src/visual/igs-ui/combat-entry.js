import { extractCombatStart } from '../../scene/combat-directives.js';
import { parseChallengeStart } from '../../scene/challenge-directives.js';
import { normalizeCombatExpansionSettings } from './combat-settings.js';
import { esc } from './reader-value-utils.js';

// 开战楼入口：只在扩展开启、当前楼是最新 AI 楼、翻到末页、正文末尾是有效开战标签时显示。
// 翻到这一页即自动打开战斗面板：同一开战楼（chatId + messageId + swipeId + tagHash）只自动打开一次，
// 由调用方在面板确实打开后记入 seen；被地图、资料等面板挡住时不记，下一次渲染再弹。
// 日常挑战入口（kind 为 challenge）不自动打开：只出现「迎接挑战：事件名」，旁边有「放弃」与「交给托管」，玩家点了才开。
export const COMBAT_ENTRY_ID = 'igs-combat-entry';
const TIER_LABELS = Object.freeze({ normal: '', elite: '精英', boss: '首领' });
const CHALLENGE_ARM_MS = 4000;

// challengeQuota 为 challengeQuota 的结果：额度用完或冷却中时标签不生效，入口不出现。
export function resolveCombatEntry({ readerSettings, floor, lastPage, sourceFilter, challengeQuota } = {}) {
    const settings = normalizeCombatExpansionSettings(readerSettings && readerSettings.combatExpansion);
    if (!settings.enabled || !lastPage || !floor || !floor.isAi || !floor.isLatest || !floor.chatId) return null;
    const text = String(floor.text || '');
    if (settings.kind !== 'daily') {
        const { start } = extractCombatStart(text, { sourceFilter });
        if (start) {
            const key = [floor.chatId, floor.messageId, floor.swipeId, start.tagHash, start.occurrence].join('|');
            return { key, messageId: Number(floor.messageId), encounter: start.encounter, tier: start.tier, enemies: start.enemies };
        }
    }
    if (settings.kind === 'combat') return null;
    const { start } = parseChallengeStart(text, { sourceFilter, quota: challengeQuota || undefined });
    if (!start) return null;
    const key = ['ch', floor.chatId, floor.messageId, floor.swipeId, start.tagHash, start.occurrence].join('|');
    return { kind: 'challenge', key, messageId: Number(floor.messageId), event: start.event, domain: start.domain, tier: start.tier, allowEscape: settings.daily.allowEscape };
}

export function combatEntryHtml(entry) {
    if (entry.kind === 'challenge') {
        const meta = [entry.tier, entry.domain].filter(Boolean).join(' · ');
        return `<div class="igs-challenge-entry"><button type="button" class="igs-combat-entry-btn" data-combat-entry="open"><span class="igs-combat-entry-cap">${esc(meta || '关键挑战')}</span>`
            + `<span class="igs-combat-entry-name">迎接挑战：${esc(entry.event)}</span></button>`
            + `<div class="igs-challenge-entry-actions">${entry.allowEscape ? '<button type="button" class="igs-challenge-entry-btn" data-combat-entry="abandon">放弃</button>' : ''}`
            + '<button type="button" class="igs-challenge-entry-btn" data-combat-entry="auto">交给托管</button></div></div>';
    }
    const foes = entry.enemies.map((e) => `${e.name}${e.count > 1 ? ` ×${e.count}` : ''}`).join('、');
    const tier = TIER_LABELS[entry.tier] || '';
    return `<button type="button" class="igs-combat-entry-btn" data-combat-entry="open"><span class="igs-combat-entry-cap">ENCOUNTER${tier ? ` · ${esc(tier)}` : ''}</span>`
        + `<span class="igs-combat-entry-name">${esc(entry.encounter)}</span><span class="igs-combat-entry-foes">${esc(foes)}</span></button>`;
}

// 挂在 overlay 直属层；点击不冒泡到翻页层。entry 为 null 时移除。返回是否应自动打开：seen 里还没有这一开战楼。
// onAction(kind) 处理日常挑战入口上的「放弃」「交给托管」；「放弃」不可撤回，第一次点击只改成「确认放弃」，再点一次才执行。
export function syncCombatEntry(overlay, entry, { onOpen, onAction, seen } = {}) {
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
            const kind = target?.getAttribute?.('data-combat-entry');
            if (kind === 'open' && typeof node.onOpen === 'function') node.onOpen();
            else if (kind === 'auto' && typeof node.onAction === 'function') node.onAction('auto');
            else if (kind === 'abandon' && typeof node.onAction === 'function') {
                if (target.hasAttribute('data-armed')) node.onAction('abandon');
                else {
                    target.setAttribute('data-armed', '');
                    target.textContent = '确认放弃';
                    const timer = setTimeout(() => { if (target.isConnected !== false) { target.removeAttribute('data-armed'); target.textContent = '放弃'; } }, CHALLENGE_ARM_MS);
                    timer?.unref?.();
                }
            }
        });
        overlay.appendChild(node);
    }
    if (node.getAttribute('data-key') !== entry.key) {
        node.setAttribute('data-key', entry.key);
        node.innerHTML = combatEntryHtml(entry);
    }
    node.onOpen = onOpen;
    node.onAction = onAction;
    return Boolean(seen) && entry.kind !== 'challenge' && !seen.has(entry.key);
}
