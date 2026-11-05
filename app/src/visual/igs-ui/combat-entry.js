import { extractCombatStart } from '../../scene/combat-directives.js';
import { parseChallengeStart } from '../../scene/challenge-directives.js';
import { normalizeCombatExpansionSettings } from './combat-settings.js';

// 开战楼入口：只在扩展开启、当前楼是最新 AI 楼、翻到末页、正文末尾是有效开战标签时显示。
// 翻到这一页即自动打开战斗面板：同一开战楼（chatId + messageId + swipeId + tagHash）只自动打开一次，
// 由调用方在面板确实打开后记入 seen；被地图、资料等面板挡住时不记，下一次渲染再弹。
export const COMBAT_ENTRY_ID = 'igs-combat-entry';

// challengeQuota 为 challengeQuota 的结果：额度用完或冷却中时标签不生效，入口不出现。
export function resolveCombatEntry({ readerSettings, floor, lastPage, sourceFilter, challengeQuota, intimate } = {}) {
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
    if (settings.kind === 'combat' && !intimate) return null;
    const parsed = parseChallengeStart(text, { sourceFilter, quota: challengeQuota || undefined, intimate: intimate || undefined }).start;
    let start = parsed && (parsed.intimate === true || settings.kind !== 'combat') ? parsed : null;
    if (!start && intimate && intimate.launch === true) start = { event: '亲密', domain: '亲密', tier: '普通', tagHash: 'launch', occurrence: 0, intimate: true };
    if (!start) return null;
    const key = ['ch', floor.chatId, floor.messageId, floor.swipeId, start.tagHash, start.occurrence].join('|');
    return { kind: 'challenge', key, messageId: Number(floor.messageId), event: start.event, domain: start.domain, tier: start.tier, allowEscape: settings.daily.allowEscape, ...(start.intimate ? { intimate: true } : {}) };
}

// 本页诊断用：入口没出现时，开战标签本身有没有识别到、诊断码是什么。
export function probeCombatStart(text, sourceFilter) {
    const { start, diagnostics } = extractCombatStart(String(text || ''), { sourceFilter });
    return { found: Boolean(start), name: start ? start.encounter : '', codes: diagnostics.map((d) => d.field ? `${d.code}:${d.field}:${d.problem}` : d.code) };
}

// 入口卡降级为回头路：开战标签翻到末页即自动打开战前对阵界面，在那里决定开始、跳过、放弃或托管；
// 没做选择就关闭时，原位置只留一个小标签「返回战斗」（日常挑战为「返回挑战」），点击重新打开对阵界面。
export function combatEntryHtml(entry) {
    const label = entry.kind === 'challenge' ? '返回挑战' : '返回战斗';
    return `<button type="button" class="igs-combat-entry-btn igs-combat-entry-return" data-combat-entry="open">${label}</button>`;
}

// 挂在 overlay 直属层；点击不冒泡到翻页层。entry 为 null 时移除。返回是否应自动打开：seen 里还没有这一开战楼（战斗与日常挑战相同）。
// onOpen 返回 ok:false 时交给 onFail 给出阅读器内提示。
export function syncCombatEntry(overlay, entry, { onOpen, onFail, seen, skin } = {}) {
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
            if (target?.getAttribute?.('data-combat-entry') !== 'open' || typeof node.onOpen !== 'function') return;
            const result = node.onOpen();
            if (result && result.ok === false && typeof node.onFail === 'function') node.onFail(result);
        });
        overlay.appendChild(node);
    }
    if (node.getAttribute('data-key') !== entry.key) {
        node.setAttribute('data-key', entry.key);
        node.innerHTML = combatEntryHtml(entry);
    }
    // 皮肤只决定外观，不进 key：设置里换皮肤后下一次同步即生效。
    if (skin) node.setAttribute('data-combat-skin', skin);
    node.onOpen = onOpen;
    node.onFail = onFail;
    return Boolean(seen) && !seen.has(entry.key);
}

// 持久会话里「未结束」的战斗：已开打但还没发送战报（战斗中、已分胜负待发送、发送失败）。
// 胜负已发送（done）、跳过、放弃、托管结束、失效（stale）、对阵界面未开打（lobby）都不算。
export const COMBAT_UNFINISHED_STATUSES = Object.freeze(['battle', 'ended', 'send-failed']);

export function unfinishedCombatState(session) {
    try {
        const st = session && typeof session.state === 'function' ? session.state() : null;
        return st && COMBAT_UNFINISHED_STATUSES.includes(st.status) && st.anchor ? st : null;
    } catch (error) { return null; }
}

// 会话锚点与入口是否同一开战楼（入口 key 以 chatId|楼|swipe|tagHash|occurrence 收尾，日常挑战前缀 ch）。
export function sessionMatchesEntry(st, entry) {
    if (!st || !st.anchor || !entry || !entry.key) return false;
    const a = st.anchor;
    if ((st.kind === 'challenge') !== (entry.kind === 'challenge')) return false;
    return String(entry.key).endsWith(`|${[a.messageId, a.swipeId, a.tagHash, a.occurrence].join('|')}`);
}
