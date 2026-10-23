import { setStagePauseReason } from './stage-pause.js';
import { classChoices, deckDetailView, deckRosterView, isCombatBusy, validateDraft } from './combat-deck-panel-model.js';
import { deckReasonText, renderCombatDeckPanelHtml } from './combat-deck-panel-render.js';

// 卡组构筑面板：资料菜单「战斗」项打开。账本、会话与手动生成由 options 注入；面板只编辑草稿、转发保存与生成。
export const COMBAT_DECK_PANEL_ID = 'igs-combat-deck-panel';
const PAUSE_REASON = 'panel:combat-deck';

export function createCombatDeckPanelController(doc, options = {}) {
    let root = null;
    let body = null;
    let pageOverlay = null;
    let previousFocus = null;
    let token = 0;
    let pending = '';
    let notice = '';
    let state = null;
    let status = 'loading';
    let reason = '';
    let selectedId = null;
    let draft = null;
    let generate = null;
    let abort = null;

    const ledger = () => (typeof options.getLedger === 'function' ? options.getLedger() : null);
    const session = () => (typeof options.getSession === 'function' ? options.getSession() : null);
    const sessionState = () => { try { return session()?.state() || null; } catch (error) { return null; } };
    const selectedView = () => (state?.ok && selectedId ? state.characters.get(selectedId) || null : null);
    // 待整理项来自成长缓存（扫描得到、尚未入库的 learn / upgrade / class）；缓存不可用时不显示。
    const pendingOf = () => {
        let g = null;
        try { g = typeof options.getGrowth === 'function' ? options.getGrowth() : null; } catch (error) { g = null; }
        return g && g.ok === true && Array.isArray(g.pending) ? g.pending : [];
    };

    function snapshot() {
        const ss = sessionState();
        const view = selectedView();
        return {
            status, reason, notice, pending, selectedId, generate,
            readonly: isCombatBusy(ss),
            roster: deckRosterView(state), classes: classChoices(state),
            detail: view ? deckDetailView(view, view.kind === 'deck-character' ? draft : null) : null,
            pendingGeneration: pendingOf(),
            sendFailed: ss?.status === 'send-failed',
        };
    }

    // 整块重绘后按 data-deck-act + data-deck-id 找回焦点；找不到时落到关闭按钮。
    function render() {
        if (!body) return;
        const active = doc.activeElement;
        const had = Boolean(active && root?.contains?.(active));
        const act = had ? active.getAttribute?.('data-deck-act') : null;
        const id = had ? active.getAttribute?.('data-deck-id') || '' : '';
        body.innerHTML = renderCombatDeckPanelHtml(snapshot());
        if (!had) return;
        const same = act ? [...(body.querySelectorAll?.(`[data-deck-act="${act}"]`) || [])].find((n) => (n.getAttribute('data-deck-id') || '') === id) : null;
        (same || body.querySelector?.('[data-deck-act="close"]'))?.focus?.();
    }

    const fail = (r) => { notice = deckReasonText(r); render(); return { ok: false, reason: r }; };

    // 异步动作同一时刻只跑一个；面板关闭或重开后迟到的结果不再改界面。
    async function run(kind, fn) {
        if (pending) return { ok: false, reason: 'combat-busy' };
        const my = token;
        pending = kind;
        notice = '';
        render();
        let r;
        try { r = await fn(); } catch (error) { r = { ok: false, reason: 'combat-action-threw' }; }
        if (my !== token) return { ...r, stale: true };
        pending = '';
        notice = r && r.ok === false ? deckReasonText(r.reason) : '';
        render();
        return r;
    }

    // 每次打开与写入后都从账本重读；读取失败显示原因，不当作空列表。
    async function load() {
        const l = ledger();
        if (!l) { status = 'unavailable'; state = null; render(); return { ok: false, reason: 'combat-disabled' }; }
        const my = token;
        if (!state) { status = 'loading'; render(); }
        let st;
        try { st = await l.effectiveState(); } catch (error) { st = { ok: false, reason: 'combat-ledger-read-failed' }; }
        if (my !== token) return { ok: false, reason: 'request-stale' };
        draft = null;
        if (!st || st.ok !== true) {
            state = null; status = 'error'; reason = st?.reason || 'combat-ledger-read-failed';
            render();
            return { ok: false, reason };
        }
        state = st; status = 'ready'; reason = '';
        if (!selectedId || !st.characters.has(selectedId)) selectedId = deckRosterView(st)[0]?.id || null;
        render();
        return { ok: true };
    }

    function select(id) {
        if (!state?.ok || !state.characters.has(id)) return { ok: false, reason: 'combat-character-missing' };
        if (id !== selectedId) { selectedId = id; draft = null; generate = null; notice = ''; }
        render();
        return { ok: true };
    }

    // 草稿编辑：加入受拥有数与同名上限约束，移出只减一张；与已保存卡组相同时清空草稿。
    function edit(cardId, delta) {
        const view = selectedView();
        if (!view || view.kind !== 'deck-character') return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        const cards = [...(draft || view.deck)];
        if (delta > 0) {
            const entry = deckDetailView(view, cards).owned.find((c) => c.cardId === cardId);
            if (!entry?.canAdd) return { ok: false, reason: 'combat-deck-invalid' };
            cards.push(cardId);
        } else {
            const i = cards.lastIndexOf(cardId);
            if (i < 0) return { ok: false, reason: 'combat-deck-invalid' };
            cards.splice(i, 1);
        }
        draft = cards.join('|') === view.deck.join('|') ? null : cards;
        notice = '';
        render();
        return { ok: true, size: cards.length };
    }

    async function save() {
        const view = selectedView();
        const l = ledger();
        if (!view || view.kind !== 'deck-character' || !draft || !l) return { ok: false, reason: 'combat-deck-invalid' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (!validateDraft(view, draft).ok) return fail('combat-deck-invalid');
        const cards = [...draft];
        const r = await run('save', () => l.saveDeck(view.id, cards));
        if (r.ok === true && !r.stale) await load();
        return r;
    }


    // 手动生成卡组档案：只在注入了生成能力时可用；选定已有职业时沿用其职业特性，不再请求职业部分。
    function openGenerate(id) {
        if (!state?.ok || !state.characters.has(id)) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof options.generateDeckProfile !== 'function') return fail('combat-generate-unavailable');
        generate = { id, classRef: null };
        render();
        return { ok: true };
    }

    function pickClass(classRef) {
        if (!generate) return { ok: false, reason: 'combat-generate-unavailable' };
        generate = { ...generate, classRef: classRef && state?.classes?.has(classRef) ? classRef : null };
        render();
        return { ok: true };
    }

    async function runGenerate() {
        const view = generate && state?.ok ? state.characters.get(generate.id) : null;
        if (!view || typeof options.generateDeckProfile !== 'function') return fail('combat-generate-unavailable');
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        const input = { name: view.name, classRef: generate.classRef };
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const r = await run('generate', () => options.generateDeckProfile(input, { signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        if (r.ok === true) { generate = null; if (r.id) selectedId = r.id; await load(); }
        return r;
    }

    function invoke(name, id = '') {
        if (name === 'close') return close();
        if (!root) return { ok: false, reason: 'combat-panel-closed' };
        switch (name) {
            case 'reload': return load();
            case 'select': return select(id);
            case 'add': return edit(id, 1);
            case 'remove': return edit(id, -1);
            case 'reset': draft = null; notice = ''; render(); return { ok: true };
            case 'save': return save();
            case 'generate-open': return openGenerate(id);
            case 'generate-class': return pickClass(id);
            case 'generate': return runGenerate();
            case 'cancel': generate = null; notice = ''; render(); return { ok: true };
            case 'retry-send': {
                const s = session();
                if (!s) return fail('combat-session-unavailable');
                return run('send', () => s.retrySend()).then((r) => (r.ok === true && !r.stale ? load().then(() => r) : r));
            }
            case 'retry-growth':
                if (typeof options.retryGrowth !== 'function') return fail('combat-generate-unavailable');
                return run('growth', () => options.retryGrowth()).then((r) => (r.ok === true && !r.stale ? load().then(() => r) : r));
            default: return { ok: false, reason: 'combat-action-unknown' };
        }
    }

    function onClick(event) {
        event.stopPropagation?.();
        const control = event.target?.closest?.('[data-deck-act]');
        if (!control || !root?.contains?.(control)) return;
        event.preventDefault?.();
        if (control.getAttribute('aria-disabled') === 'true') return;
        invoke(control.getAttribute('data-deck-act'), control.getAttribute('data-deck-id') || '');
    }

    function open(overlay) {
        if (root) return { ok: true, reason: 'already-open' };
        if (!overlay || !doc?.createElement) return { ok: false, reason: 'missing-combat-container' };
        if (!ledger()) return { ok: false, reason: 'combat-disabled' };
        token += 1;
        pending = ''; notice = ''; state = null; status = 'loading'; reason = ''; draft = null; generate = null;
        pageOverlay = overlay;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = COMBAT_DECK_PANEL_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '战斗');
        body = doc.createElement('div');
        body.className = 'igs-deck-body';
        root.appendChild(body);
        root.addEventListener('click', onClick);
        overlay.appendChild(root);
        overlay.classList?.toggle('igs-record-screen-open', true);
        setStagePauseReason(overlay, PAUSE_REASON, true);
        render();
        body.querySelector?.('[data-deck-act="close"]')?.focus?.();
        load();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        token += 1;
        try { abort?.abort(); } catch (error) { /* 已结束 */ }
        abort = null;
        root.removeEventListener?.('click', onClick);
        root.remove();
        root = null; body = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        setStagePauseReason(pageOverlay, PAUSE_REASON, false);
        pageOverlay = null;
        pending = ''; draft = null; generate = null;
        const focus = previousFocus;
        previousFocus = null;
        focus?.focus?.();
        return { ok: true };
    }

    return { open, close, dispose: close, invoke, reload: load, isOpen: () => Boolean(root), view: () => (root ? snapshot() : null) };
}
