import { setStagePauseReason } from './stage-pause.js';
import { planBattleFx, safePortraitUrl } from './fx-battle-model.js';
import { applyBattleFxToDom, cancelBattleFx } from './fx-battle.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { battleView, combatFxSource, endView, lobbyView, resolvePlay, rewardChoices } from './combat-panel-model.js';
import { combatReasonText, renderCombatPanelHtml } from './combat-panel-render.js';

// 卡牌战斗面板。挂在 #igs-overlay 直属层（不进 #igs-stage-motion），避免阅读器自己的演出层查到面板内的演出节点。
// 会话由 options.getSession() 注入；面板只转发动作、渲染快照，不自行结算。
export const COMBAT_PANEL_ID = 'igs-combat-panel';
const PAUSE_REASON = 'panel:combat';

export function createCombatPanelController(doc, options = {}) {
    let root = null;
    let stage = null;
    let pageOverlay = null;
    let previousFocus = null;
    let messageId = null;
    let token = 0;
    let pending = '';
    let notice = '';
    let selected = null;
    let controlledId = null;
    let fxSeq = 0;
    let rewards = null;
    let confirming = '';
    let abort = null;

    const session = () => (typeof options.getSession === 'function' ? options.getSession() : null);
    const reduced = () => {
        try { return typeof options.reducedMotion === 'function' ? options.reducedMotion() === true : prefersReducedMotion(); } catch (error) { return false; }
    };
    // 立绘地址由宿主按素材库解析（options.resolvePortrait），这里只过滤协议；取不到时渲染层用剪影。
    const portraitsFor = (names) => {
        const out = {};
        for (const name of names) {
            if (!name || Object.hasOwn(out, name)) continue;
            let url = '';
            try { url = typeof options.resolvePortrait === 'function' ? options.resolvePortrait(name) : ''; } catch (error) { url = ''; }
            out[name] = safePortraitUrl(url);
        }
        return out;
    };

    function snapshot() {
        const s = session();
        const cur = s ? s.state() : { status: 'unavailable' };
        const view = { status: cur.status, reason: cur.reason || '', notice, pending, selected, controlledId, confirming, rewards };
        if (cur.status === 'lobby') view.lobby = lobbyView(cur);
        if ((cur.status === 'battle' || cur.status === 'ended') && cur.battle) view.battle = battleView(cur.battle, cur.legal);
        if (cur.status === 'ended' && cur.battle) view.end = endView(cur.battle);
        const names = view.battle ? [...view.battle.allies, ...view.battle.enemies].map((u) => u.name)
            : view.lobby ? [...view.lobby.allies.map((a) => a.name), ...view.lobby.enemies.map((e) => e.name)] : [];
        view.portraits = portraitsFor(names);
        if (cur.status === 'send-failed' || cur.status === 'done') view.report = cur.report ? { result: cur.report.result } : null;
        view.encounter = cur.start?.encounter || cur.record?.encounter || '';
        return view;
    }

    function render() {
        if (!root) return;
        const body = root.querySelector?.('.igs-combat-body');
        if (!body) return;
        // 整块重绘会销毁当前焦点按钮：按 data-combat-act + data-combat-id 找回同一控件；找不到时落到关闭按钮，焦点不丢出面板。
        const active = doc.activeElement;
        const had = Boolean(active && root.contains?.(active));
        const act = had ? active.getAttribute?.('data-combat-act') : null;
        const id = had ? active.getAttribute?.('data-combat-id') || '' : '';
        body.innerHTML = renderCombatPanelHtml(snapshot());
        if (!had) return;
        const same = act ? [...(body.querySelectorAll?.(`[data-combat-act="${act}"]`) || [])].find((n) => (n.getAttribute('data-combat-id') || '') === id) : null;
        (same || body.querySelector?.('[data-combat-act="close"]'))?.focus?.();
    }

    const say = (r) => { notice = r && r.ok === false ? combatReasonText(r.reason) : ''; };

    // 引擎事件 → fx-battle 演出。每次演出用递增页号作身份，保证连续两次出手都会播。
    function playFx(events, { start = false } = {}) {
        const cur = session()?.state();
        if (!stage || !cur?.battle || !events?.length) return;
        const foe = cur.start?.enemies?.[0]?.name || '';
        const fx = combatFxSource(events, cur.battle, { start, foe, title: cur.start?.encounter || '' });
        fxSeq += 1;
        const plan = planBattleFx(fx, { settings: { enabled: true, letterbox: false }, identity: { chatId: 'igs-combat', messageId: cur.combatId || '', swipeId: 0, page: fxSeq } });
        const skin = typeof options.getFxSkin === 'function' ? options.getFxSkin() || {} : {};
        try {
            applyBattleFxToDom(stage, plan, { ...skin, reducedMotion: reduced(), schedule: options.schedule, clear: options.clear });
        } catch (error) { /* 演出失败不影响结算 */ }
    }

    async function prepare() {
        const s = session();
        if (!s || messageId === null || pending) return { ok: false, reason: pending ? 'combat-busy' : 'combat-session-unavailable' };
        const my = token;
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        pending = 'prepare';
        notice = '';
        render();
        let r;
        try { r = await s.prepare(messageId, { signal: abort?.signal }); } catch (error) { r = { ok: false, reason: 'combat-action-threw' }; }
        if (my !== token) return r;
        pending = '';
        abort = null;
        say(r);
        if (r.session?.lobby) controlledId = r.session.lobby.heroId;
        render();
        if (r.session?.status === 'done') loadRewards();
        return r;
    }

    async function runAsync(kind, fn) {
        if (pending) return { ok: false, reason: 'combat-busy' };
        const my = token;
        pending = kind;
        notice = '';
        render();
        let r;
        try { r = await fn(); } catch (error) { r = { ok: false, reason: 'combat-action-threw' }; }
        if (my !== token) return r;
        pending = '';
        say(r);
        render();
        if (r.ok && r.session?.status === 'done') loadRewards();
        return r;
    }

    function act(action) {
        const s = session();
        if (!s || pending) return { ok: false, reason: pending ? 'combat-busy' : 'combat-session-unavailable' };
        const r = s.act(action);
        selected = null;
        say(r);
        render();
        if (r.ok) playFx(r.events);
        return r;
    }

    function pickCard(inst) {
        const pick = resolvePlay(session().state().legal, inst);
        if (pick.ok) return act(pick.action);
        selected = pick.reason === 'combat-target-required' ? inst : null;
        notice = selected ? '' : combatReasonText(pick.reason);
        render();
        return pick;
    }

    function pickTarget(targetId) {
        if (!selected) return { ok: false, reason: 'combat-card-unselected' };
        const pick = resolvePlay(session().state().legal, selected, targetId);
        if (pick.ok) return act(pick.action);
        say(pick);
        render();
        return pick;
    }

    // 升级三选一：账本里仍有未领取的等级奖励时逐级给出；只接受本次给出的选项。
    async function loadRewards() {
        const ledger = typeof options.getLedger === 'function' ? options.getLedger() : null;
        if (!ledger) return;
        const my = token;
        let st;
        try { st = await ledger.effectiveState(); } catch (error) { st = { ok: false, reason: 'combat-ledger-read-failed' }; }
        if (my !== token) return;
        rewards = null;
        if (!st.ok) notice = combatReasonText(st.reason);
        else {
            const seed = session()?.state().reportId || '';
            for (const view of st.characters.values()) {
                if (view.kind !== 'deck-character' || !view.pendingRewards.length) continue;
                rewards = { characterId: view.id, name: view.name, ...rewardChoices(view, view.pendingRewards[0], seed) };
                break;
            }
        }
        render();
    }

    async function claimReward(id) {
        const ledger = typeof options.getLedger === 'function' ? options.getLedger() : null;
        if (!ledger || !rewards || pending) return { ok: false, reason: pending ? 'combat-busy' : 'combat-reward-unavailable' };
        const [kind, value = ''] = String(id || '').split(':');
        const offered = kind === 'card' ? rewards.cards.some((c) => c.cardId === value)
            : kind === 'upgrade' ? rewards.upgrades.some((u) => u.targetId === value) : kind === 'skip';
        if (!offered) return { ok: false, reason: 'combat-reward-choice-invalid' };
        const choice = kind === 'card' ? { kind, cardId: value } : kind === 'upgrade' ? { kind, targetId: value } : { kind: 'skip' };
        const r = await runAsync('reward', () => ledger.claimReward(rewards.characterId, rewards.level, choice));
        if (r.ok) await loadRewards();
        return r;
    }

    async function createTables() {
        if (typeof options.ensureTables !== 'function') return { ok: false, reason: 'combat-table-host-unsupported' };
        confirming = '';
        const r = await runAsync('tables', () => options.ensureTables());
        return r.ok ? prepare() : r;
    }

    function invoke(name, id = '') {
        if (name === 'close') return close();
        const s = session();
        if (!root || !s) return { ok: false, reason: root ? 'combat-session-unavailable' : 'combat-panel-closed' };
        switch (name) {
            case 'retry-prepare': return prepare();
            case 'pick':
                if (!s.state().lobby?.controllable.includes(id)) return { ok: false, reason: 'combat-controlled-invalid' };
                controlledId = id;
                render();
                return { ok: true };
            case 'start': {
                const r = s.start({ controlledId: controlledId ?? undefined });
                say(r);
                render();
                if (r.ok) playFx(r.events, { start: true });
                return r;
            }
            case 'card': return pickCard(id);
            case 'target': return pickTarget(id);
            case 'cancel': selected = null; confirming = ''; render(); return { ok: true };
            case 'end-turn': return act({ type: 'end-turn' });
            case 'escape': return act({ type: 'escape' });
            case 'finish': return runAsync('send', () => s.finish());
            case 'retry-send': return runAsync('send', () => s.retrySend());
            case 'skip': return runAsync('skip', () => s.skip());
            case 'reward': return claimReward(id);
            case 'confirm-tables': confirming = 'tables'; render(); return { ok: true };
            case 'create-tables': return createTables();
            default: return { ok: false, reason: 'combat-action-unknown' };
        }
    }

    function onClick(event) {
        event.stopPropagation?.();
        const control = event.target?.closest?.('[data-combat-act]');
        if (!control || !root?.contains?.(control)) return;
        event.preventDefault?.();
        if (control.getAttribute('aria-disabled') === 'true' && control.getAttribute('data-combat-act') !== 'card') return;
        invoke(control.getAttribute('data-combat-act'), control.getAttribute('data-combat-id') || '');
    }

    // messageId 为开战楼。未结束的战斗优先：同一时刻只推进一场，其余开战楼只显示当前这场。
    function open(overlay, openOptions = {}) {
        if (root) return { ok: true, reason: 'already-open' };
        if (!overlay || !doc?.createElement) return { ok: false, reason: 'missing-combat-container' };
        const s = session();
        if (!s) return { ok: false, reason: 'combat-session-unavailable' };
        messageId = Number.isInteger(openOptions.messageId) ? openOptions.messageId : null;
        notice = ''; pending = ''; selected = null; controlledId = null; rewards = null; confirming = '';
        token += 1;
        pageOverlay = overlay;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = COMBAT_PANEL_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '卡牌战斗');
        const body = doc.createElement('div');
        body.className = 'igs-combat-body';
        stage = doc.createElement('div');
        stage.className = 'igs-combat-fx';
        const motion = doc.createElement('div');
        motion.id = 'igs-stage-motion';
        stage.appendChild(motion);
        root.appendChild(body);
        root.appendChild(stage);
        root.addEventListener('click', onClick);
        overlay.appendChild(root);
        overlay.classList?.toggle('igs-record-screen-open', true);
        // 战斗期间隐藏背后的剧情文字（对话层），背景与立绘保留。
        overlay.setAttribute?.('data-igs-combat-open', '');
        setStagePauseReason(overlay, PAUSE_REASON, true);
        const cur = s.state();
        if (cur.lobby) controlledId = cur.lobby.heroId;
        const busy = ['battle', 'ended', 'send-failed', 'preparing'].includes(cur.status);
        const same = cur.anchor?.messageId === messageId && ['lobby', 'blocked', 'done', 'skipped'].includes(cur.status);
        render();
        if (messageId !== null && !busy && !same) prepare();
        else if (cur.status === 'done') loadRewards();
        root.querySelector?.('[data-combat-act="close"]')?.focus?.();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        token += 1;
        try { abort?.abort(); } catch (error) { /* 已结束 */ }
        abort = null;
        if (stage) cancelBattleFx(stage);
        root.removeEventListener?.('click', onClick);
        root.remove();
        root = null;
        stage = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        pageOverlay?.removeAttribute?.('data-igs-combat-open');
        setStagePauseReason(pageOverlay, PAUSE_REASON, false);
        pageOverlay = null;
        pending = ''; rewards = null; selected = null; confirming = '';
        const focus = previousFocus;
        previousFocus = null;
        focus?.focus?.();
        return { ok: true };
    }

    return {
        open, close, dispose: close, invoke,
        isOpen: () => Boolean(root),
        refresh: render,
        view: () => (root ? snapshot() : null),
    };
}
