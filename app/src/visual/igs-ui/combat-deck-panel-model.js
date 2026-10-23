import { COMBAT_RULES, validateDeck } from '../../combat/rules.js';

// 卡组构筑面板的纯视图模型：账本归并状态 → 角色列表 / 详情 / 构筑草稿校验；不操作 DOM、不写表。
export const DECK_KIND_LABELS = Object.freeze({ 'deck-character': '卡组', 'skill-character': '技能' });
// 会话处于这些状态时战斗仍在进行，构筑面板只读。
const BUSY_SESSION = Object.freeze(['preparing', 'battle', 'ended', 'send-failed']);

export function isCombatBusy(sessionState) {
    return BUSY_SESSION.includes(sessionState?.status);
}

export function deckRosterView(state) {
    if (!state?.ok) return [];
    const list = [...state.characters.values()].map((v) => ({
        id: v.id, kind: v.kind, kindLabel: DECK_KIND_LABELS[v.kind] || v.kind, name: v.name, level: v.level,
        exp: v.exp, into: v.into, next: v.next, className: v.className || '',
        deckSize: v.kind === 'deck-character' ? v.deck.length : 0,
        needsAdjust: v.kind === 'deck-character' && v.deckNeedsAdjust === true,
        pendingRewards: v.kind === 'deck-character' ? v.pendingRewards.length : 0,
    }));
    // 卡组角色在前，同类按名字排序，保证列表顺序稳定。
    return list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh') : a.kind === 'deck-character' ? -1 : 1));
}

// 构筑草稿校验：张数、同名上限、拥有数与未知卡；返回按卡归并的错误，供界面在对应卡上标错。
export function validateDraft(view, draft) {
    const cards = Array.isArray(draft) ? draft : [];
    const check = validateDeck(cards, view.owned);
    const unknown = [...new Set(cards.filter((id) => !view.catalog.has(id)))].map((cardId) => ({ path: 'cards', reason: 'unknown-card', cardId }));
    const errors = [...check.errors, ...unknown];
    const byCard = new Map();
    for (const e of errors) if (e.cardId) byCard.set(e.cardId, [...(byCard.get(e.cardId) || []), e.reason]);
    return { ok: errors.length === 0, size: cards.length, min: COMBAT_RULES.deckMin, max: COMBAT_RULES.deckMax, errors, byCard };
}

export function deckDetailView(view, draft) {
    if (!view) return null;
    const base = { id: view.id, kind: view.kind, name: view.name, level: view.level, exp: view.exp, into: view.into, next: view.next };
    if (view.kind === 'skill-character') {
        return { ...base, className: view.className || '', skills: view.skills.map((s) => ({ id: s.id, name: s.name, intent: s.intent })),
            passives: (view.passives || []).map((p) => ({ id: p.id, name: p.name })) };
    }
    const cards = draft || view.deck;
    const check = validateDraft(view, cards);
    const inDeck = new Map();
    for (const id of cards) inDeck.set(id, (inDeck.get(id) || 0) + 1);
    const owned = [...view.owned.entries()].filter(([, n]) => n > 0).map(([id, n]) => {
        const card = view.catalog.get(id);
        return { cardId: id, name: card?.name || id, type: card?.type || '', cost: card?.cost ?? '', owned: n,
            upgraded: view.upgraded.get(id) || 0, inDeck: inDeck.get(id) || 0, errors: check.byCard.get(id) || [],
            canAdd: (inDeck.get(id) || 0) < Math.min(n, COMBAT_RULES.copyLimit) };
    }).sort((a, b) => (a.cost === b.cost ? a.name.localeCompare(b.name, 'zh') : Number(a.cost) - Number(b.cost)));
    const profile = view.profile || {};
    return {
        ...base, className: view.className || '', hpMax: view.hpMax,
        classPassive: view.classProfile?.classPassive ? { name: view.classProfile.classPassive.name } : null,
        personalPassive: profile.personalPassive ? { name: profile.personalPassive.name } : null,
        owned, deck: cards, check, dirty: Boolean(draft) && draft.join('|') !== view.deck.join('|'),
        pendingRewards: [...view.pendingRewards],
    };
}

// 手动生成卡组档案的职业选项：已登记职业可沿用（不再请求职业部分），也可请副 LLM 新建职业。
export function classChoices(state) {
    if (!state?.ok || !state.classes) return [];
    return [...state.classes.values()].map((c) => ({ id: c.id, name: c.className }));
}
