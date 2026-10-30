import { setStagePauseReason } from './stage-pause.js';
import { allocView, classChoices, DECK_PAGES, deckDetailView, deckRosterView, isCombatBusy, validateDraft } from './combat-deck-panel-model.js';
import { deckReasonText, renderCombatDeckPanelHtml } from './combat-deck-panel-render.js';
import { CARD_TYPE_LABELS, cardArtSvg, describeEffects } from './combat-card-art.js';
import { safePortraitUrl } from './fx-battle-model.js';
import { ASI_POINTS } from '../../combat/abilities.js';
import { ASCEND_TIERS, REBUILD_COST, RESPEC_COST, TRAIT_DRAW_COST } from '../../combat/points.js';
import { nextTraitSlot, planTrait, traitSeed, traitSwap } from '../../combat/traits.js';
import { prefersReducedMotion } from './reduced-motion.js';

// 人物状态面板（状态、加点、装备、卡组、背包五页）：工具栏「人物状态」按钮与资料菜单「人物状态」项打开。账本、会话与手动生成由 options 注入；面板只编辑草稿、转发保存、换装、卖出与生成。
export const COMBAT_DECK_PANEL_ID = 'igs-combat-deck-panel';
const PAUSE_REASON = 'panel:combat-deck';
// 卡面写词用的卡牌描述：类型 + 效果说明，只取卡牌数据。
const artDescription = (card) => [CARD_TYPE_LABELS[card.type] ? `${CARD_TYPE_LABELS[card.type]}牌` : '', describeEffects(card.effects)].filter(Boolean).join('：');

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
    // 分页与加点草稿（属性 → 点数）：换角色时清空加点草稿、保留当前页；每次打开回到状态页。
    let page = 'status';
    let allocDraft = null;
    let generate = null;
    // 背包卖出待确认的那一件：{ kind: 'gear' | 'keepsake', id }；换角色、换页、重读与开关面板时清空。
    let sell = null;
    // 重新生成基础卡组待确认（只主角）；换角色、换页、重读与开关面板时清空。
    let rebuild = false;
    // 转职待确认（只主角）：{ picked, classRef }，classRef 为 null 表示按剧情生成新职业；ascend 为职业升阶待确认。换角色、换页、重读与开关面板时清空。
    let respec = null;
    let ascend = false;
    // 抽人物特性待确认（只主角）；换角色、换页、重读与开关面板时清空。已满时抽到的待定特性来自账本，替换或放弃即为确认。
    let trait = false;
    let abort = null;
    // 抽人物特性揭晓（P-f）：{ phase: 'charge' | 'open', rarity, traitId, played }。确认抽取即进入蓄力（稀有度与服务层同一 planTrait 预定），
    // 写入并重读账本后翻开；失败、换角色、换页与开关面板时清空，重读账本保留。翻开动画只在第一次画出时播放（played）。
    let reveal = null;
    // 卡面图订阅（打开时订阅、关闭时退订）：生成进度、结果与本地图片补载后重绘。
    let offCardArt = null;
    // 主角卡组预生成状态订阅：生成中 / 重试中 / 失败在面板内显示并可手动重试；就绪后重读账本。
    let offProtagonist = null;

    const ledger = () => (typeof options.getLedger === 'function' ? options.getLedger() : null);
    const session = () => (typeof options.getSession === 'function' ? options.getSession() : null);
    const sessionState = () => { try { return session()?.state() || null; } catch (error) { return null; } };
    const reduced = () => {
        try { return typeof options.reducedMotion === 'function' ? options.reducedMotion() === true : prefersReducedMotion(); } catch (error) { return false; }
    };
    const selectedView = () => (state?.ok && selectedId ? state.characters.get(selectedId) || null : null);
    // 待整理项来自成长缓存（扫描得到、尚未入库的 learn / upgrade / class）；缓存不可用时不显示。
    const pendingOf = () => {
        let g = null;
        try { g = typeof options.getGrowth === 'function' ? options.getGrowth() : null; } catch (error) { g = null; }
        return g && g.ok === true && Array.isArray(g.pending) ? g.pending : [];
    };
    const protagonistOf = () => {
        let p = null;
        try { p = typeof options.getProtagonist === 'function' ? options.getProtagonist() : null; } catch (error) { p = null; }
        return p && typeof p === 'object' ? p : null;
    };
    // 卡面：每张已拥有的卡附上本地卡面状态（只读本地缓存，不联网）与线条图标；有图用图，无图回退图标。
    const cardArtOf = (view, cardId) => {
        let s = null;
        try { s = typeof options.getCardArt === 'function' ? options.getCardArt(cardId) : null; } catch (error) { s = null; }
        return { svg: cardArtSvg(view.catalog.get(cardId)), url: safePortraitUrl(s?.url || ''), pending: s?.pending === true,
            error: String(s?.error || ''), canGenerate: typeof options.generateCardArt === 'function' };
    };
    const withCardArt = (view, detail) => (detail?.owned ? { ...detail, owned: detail.owned.map((c) => ({ ...c, art: cardArtOf(view, c.cardId) })) } : detail);

    function snapshot() {
        const ss = sessionState();
        const view = selectedView();
        const readonly = isCombatBusy(ss);
        const still = reduced();
        return {
            status, reason, notice, pending, selectedId, generate, page, sell, rebuild, respec, ascend, trait,
            reveal: reveal ? { phase: reveal.phase, rarity: reveal.rarity, traitId: reveal.traitId, fresh: reveal.phase === 'open' && !reveal.played && !still } : null,
            reduced: still,
            readonly,
            roster: deckRosterView(state), classes: classChoices(state),
            detail: view ? withCardArt(view, deckDetailView(view, view.kind === 'deck-character' ? draft : null)) : null,
            alloc: view ? allocView(view.attributes, allocDraft, { readonly }) : null,
            pendingGeneration: pendingOf(),
            sendFailed: ss?.status === 'send-failed',
            protagonist: protagonistOf(), canRetryProtagonist: typeof options.retryProtagonist === 'function',
            canEnsureTables: typeof options.ensureTables === 'function',
            canRebuild: typeof options.regenerateDeck === 'function',
            canRespec: typeof options.respecClass === 'function',
            canAscend: typeof options.ascendClass === 'function',
            canDrawTrait: typeof options.drawTrait === 'function',
            canPickTrait: typeof options.pickTrait === 'function',
            canUnlockSlot: typeof options.unlockTraitSlot === 'function',
        };
    }

    // 整块重绘后按 data-deck-act + data-deck-id 找回焦点；找不到时落到关闭按钮。
    function render() {
        if (!body) return;
        const active = doc.activeElement;
        const had = Boolean(active && root?.contains?.(active));
        const act = had ? active.getAttribute?.('data-deck-act') : null;
        const id = had ? active.getAttribute?.('data-deck-id') || '' : '';
        // 卡面图异步到达也会重绘：保留主区滚动位置，不跳回顶部。
        const top = body.querySelector?.('.igs-deck-main')?.scrollTop || 0;
        body.innerHTML = renderCombatDeckPanelHtml(snapshot());
        if (reveal?.phase === 'open') reveal.played = true;
        const scroller = top ? body.querySelector?.('.igs-deck-main') : null;
        if (scroller) scroller.scrollTop = top;
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
        draft = null; allocDraft = null; sell = null; rebuild = false; respec = null; ascend = false; trait = false;
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
        if (id !== selectedId) { selectedId = id; draft = null; allocDraft = null; generate = null; sell = null; rebuild = false; respec = null; ascend = false; trait = false; reveal = null; notice = ''; }
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

    // 加点：主角逐点分配属性提升点（每点 +1，受剩余点数与属性上限约束），「确认加点」后经账本写一条 alloc 记录并读回；
    // 非主角、缺属性表与战斗进行中不可编辑。
    function allocEdit(key, delta) {
        const view = selectedView();
        const a = view ? allocView(view.attributes, allocDraft, { readonly: isCombatBusy(sessionState()) }) : null;
        if (!a) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (!a.protagonist) return fail('combat-alloc-not-protagonist');
        if (a.table !== 'ok') return fail('combat-attribute-table-missing');
        const row = a.rows.find((r) => r.key === key);
        if (!row || !(delta > 0 ? row.canAdd : row.canRemove)) return { ok: false, reason: 'combat-alloc-invalid' };
        const next = { ...(allocDraft || {}), [key]: row.add + delta };
        if (!next[key]) delete next[key];
        allocDraft = Object.keys(next).length ? next : null;
        notice = '';
        render();
        return { ok: true, left: a.left - delta };
    }

    async function allocConfirm() {
        const view = selectedView();
        const l = ledger();
        if (!view || !l) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof l.allocate !== 'function') return fail('combat-alloc-unavailable');
        // 账本单条上限为 ASI_POINTS：同一属性超过时拆成多条，由账本合并后核对余额与上限。
        const picks = Object.entries(allocDraft || {}).flatMap(([ability, n]) =>
            Array.from({ length: Math.ceil(n / ASI_POINTS) }, (_, i) => ({ ability, amount: Math.min(ASI_POINTS, n - i * ASI_POINTS) })));
        if (!picks.length) return fail('combat-alloc-empty');
        const my = token;
        const r = await run('alloc', () => l.allocate(view.id, picks, { shouldStart: () => my === token && Boolean(root) }));
        if (r.ok === true && !r.stale) { allocDraft = null; await load(); }
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

    // 主角卡组手动重试：不受「已请求失败不自动重发」限制；成功后重读账本显示新档案。失败原因显示在主角卡组行，不重复写提示条。
    async function retryProtagonist() {
        if (typeof options.retryProtagonist !== 'function') return fail('combat-generate-unavailable');
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        const r = await run('protagonist', () => options.retryProtagonist());
        if (r.stale) return r;
        if (r.ok === true) await load();
        else if (protagonistOf()?.status === 'failed') { notice = ''; render(); }
        return r;
    }

    // 缺表修复「重试」：读表时服务已自动补建过；这里经 ensureTables 清掉上次建表失败的记忆再补建一次，然后从账本重读。
    // 补建了表时服务在后台预生成主角卡组。重读仍失败时只在错误区显示原因，不重复写提示条。
    async function retryTables() {
        if (typeof options.ensureTables !== 'function') return fail('combat-table-host-unsupported');
        const r = await run('tables', () => options.ensureTables());
        if (r.stale) return r;
        const loaded = await load();
        if (loaded.ok !== true && loaded.reason !== 'request-stale') { notice = ''; render(); }
        return r;
    }

    // 技能角色强度档：写回档案表（新版本）并读回确认；战斗进行中只读，未注入写入能力时不可用。
    // 换装：经账本写 equip / unequip（锚定最新楼层），成功后重读；战斗进行中只读。
    async function setGear(gearId, equip) {
        const view = selectedView();
        const l = ledger();
        if (!view || !l) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof l.setGear !== 'function') return fail('combat-generate-unavailable');
        const r = await run('gear', () => l.setGear(view.id, gearId, equip));
        if (r.ok === true && !r.stale) await load();
        return r;
    }

    // 背包卖出：点「卖出」只记下待确认的那一件（只主角、不在战斗中、物品仍在背包），该行换成「确认卖出 · 售价」与「取消」；
    // 确认后经账本写一条 sell（锚定最新楼层，穿戴中的装备由账本拒收）并重读；结束后清空待确认，失败原因显示在提示条。
    function sellOpen(kind, id) {
        const view = selectedView();
        if (!view) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (view.attributes?.protagonist !== true) return fail('combat-points-not-protagonist');
        const has = kind === 'gear' ? (view.gear?.bag || []).some((g) => g.gearId === id) : (view.collection || []).some((k) => k.lootId === id);
        if (!has) return fail(kind === 'gear' ? 'combat-gear-missing' : 'combat-keepsake-missing');
        sell = { kind, id };
        notice = '';
        render();
        body?.querySelector?.('[data-deck-act="sell-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function sellConfirm() {
        const view = selectedView();
        const l = ledger();
        if (!sell || !view || !l) return { ok: false, reason: 'combat-sell-unavailable' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        const write = sell.kind === 'gear' ? l.sellGear : l.sellKeepsake;
        if (typeof write !== 'function') return fail('combat-sell-unavailable');
        const target = sell.id;
        const r = await run('sell', () => write(target));
        if (r.stale) return r;
        sell = null;
        if (r.ok === true) await load(); else render();
        return r;
    }

    // 重新生成基础卡组（只主角）：点按钮后在原处确认或取消；确认后经注入的 regenerateDeck 请副 LLM 生成并写一条 rebuild（扣 REBUILD_COST），成功后重读。
    // 战斗进行中只读，积分不足不可点；生成失败不扣分，原因显示在提示条；关闭面板时中止生成。
    function rebuildOpen() {
        const view = selectedView();
        if (!view || view.kind !== 'deck-character') return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof options.regenerateDeck !== 'function') return fail('combat-rebuild-unavailable');
        if (view.attributes?.protagonist !== true) return fail('combat-points-not-protagonist');
        if ((view.points || 0) < REBUILD_COST) return fail('combat-points-insufficient');
        rebuild = true; respec = null; ascend = false; trait = false;
        notice = '';
        render();
        body?.querySelector?.('[data-deck-act="rebuild-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function rebuildConfirm() {
        if (!rebuild) return { ok: false, reason: 'combat-rebuild-unavailable' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof options.regenerateDeck !== 'function') return fail('combat-rebuild-unavailable');
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const r = await run('rebuild', () => options.regenerateDeck({ signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        rebuild = false;
        if (r.ok === true) await load(); else render();
        return r;
    }

    // 转职 / 职业升阶（只主角）共同前置：卡组角色、不在战斗中、注入了对应能力、是主角。
    function heroAction(method, kind) {
        const view = selectedView();
        if (!view || view.kind !== 'deck-character') return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof options[method] !== 'function') return fail(`combat-${kind}-unavailable`);
        if (view.attributes?.protagonist !== true) return fail('combat-points-not-protagonist');
        return { ok: true, view };
    }

    // 转职：「转职」后列出其他已登记职业与「新职业」（按剧情生成），选定后在原处确认或取消；确认经注入的 respecClass 写一条 respec（扣 RESPEC_COST），成功后重读。
    // 积分不足不可点；失败不扣分，原因显示在提示条；关闭面板时中止生成。
    function respecOpen() {
        const g = heroAction('respecClass', 'respec');
        if (!g.ok) return g;
        if ((g.view.points || 0) < RESPEC_COST) return fail('combat-points-insufficient');
        respec = { picked: false, classRef: null }; rebuild = false; ascend = false; trait = false; notice = '';
        render();
        return { ok: true };
    }

    function respecPick(id) {
        if (!respec) return { ok: false, reason: 'combat-respec-unavailable' };
        const classRef = id || null;
        if (classRef && !state?.classes?.has(classRef)) return fail('combat-class-missing');
        if (classRef && classRef === selectedView()?.classRef) return fail('combat-respec-same-class');
        respec = { picked: true, classRef };
        notice = '';
        render();
        body?.querySelector?.('[data-deck-act="respec-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function respecConfirm() {
        if (!respec?.picked) return { ok: false, reason: 'combat-respec-unavailable' };
        const g = heroAction('respecClass', 'respec');
        if (!g.ok) return g;
        const { classRef } = respec;
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const r = await run('respec', () => options.respecClass({ ...(classRef ? { classRef } : {}), signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        respec = null;
        if (r.ok === true) await load(); else render();
        return r;
    }

    // 职业升阶：未到三阶、达到下一阶等级（按 EXP 等级，与归并口径一致）且积分足够时可点，点后在原处确认或取消；
    // 确认经注入的 ascendClass 请副 LLM 生成阶名与追加职业卡并写一条 ascend（扣该阶花费），成功后重读。
    function ascendOpen() {
        const g = heroAction('ascendClass', 'ascend');
        if (!g.ok) return g;
        const rule = ASCEND_TIERS[(g.view.classTier || 1) + 1];
        if (!rule) return fail('combat-ascend-max');
        if ((g.view.level || 1) < rule.level) return fail('combat-ascend-level-unreached');
        if ((g.view.points || 0) < rule.cost) return fail('combat-points-insufficient');
        ascend = true; rebuild = false; respec = null; trait = false; notice = '';
        render();
        body?.querySelector?.('[data-deck-act="ascend-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function ascendConfirm() {
        if (!ascend) return { ok: false, reason: 'combat-ascend-unavailable' };
        const g = heroAction('ascendClass', 'ascend');
        if (!g.ok) return g;
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const r = await run('ascend', () => options.ascendClass({ signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        ascend = false;
        if (r.ok === true) await load(); else render();
        return r;
    }

    // 人物特性（只主角）：「抽人物特性」后在原处确认或取消；确认经注入的 drawTrait 请副 LLM 生成并写一条 trait（扣 TRAIT_DRAW_COST），成功后重读。
    // 有待定特性（已满时抽到、尚未决定）或积分不足时不可点；失败不扣分，原因显示在提示条；关闭面板时中止生成。
    function traitOpen() {
        const g = heroAction('drawTrait', 'trait');
        if (!g.ok) return g;
        if (g.view.pendingTrait) return fail('combat-trait-pending');
        if ((g.view.points || 0) < TRAIT_DRAW_COST) return fail('combat-points-insufficient');
        trait = true; rebuild = false; respec = null; ascend = false; notice = '';
        render();
        body?.querySelector?.('[data-deck-act="trait-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function traitConfirm() {
        if (!trait) return { ok: false, reason: 'combat-trait-unavailable' };
        const g = heroAction('drawTrait', 'trait');
        if (!g.ok) return g;
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        reveal = { phase: 'charge', rarity: planTrait(traitSeed(g.view.id, g.view.traitDraws || 0)).rarity, traitId: '', played: false };
        const r = await run('trait', () => options.drawTrait({ signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        trait = false;
        const traitId = r.ok === true ? String(r.trait?.traitId || '') : '';
        if (!traitId) { reveal = null; if (r.ok === true) await load(); else render(); return r; }
        // 先重读账本再翻开：揭晓内容以账本读回的特性为准，读取失败或期间换了角色就不翻开。
        const loaded = await load();
        if (loaded.reason === 'request-stale') return r;
        reveal = loaded.ok === true && reveal ? { ...reveal, phase: 'open', rarity: r.trait.rarity || reveal.rarity, traitId, played: false } : null;
        render();
        return r;
    }

    // 装不下时的决定：drop 为被替换的已装特性 ID、保留着的固有特性 ID（新特性装上）或新特性自己的 ID（放弃）；被 drop 的永久消失，经注入的 pickTrait 写一条 trait-pick。
    async function traitDrop(drop) {
        const g = heroAction('pickTrait', 'trait');
        if (!g.ok) return g;
        const fresh = g.view.pendingTrait;
        if (!fresh) return fail('combat-trait-pick-invalid');
        const swap = drop === fresh.traitId ? { blocked: false } : traitSwap(g.view, fresh, drop);
        if (!swap) return fail('combat-trait-pick-invalid');
        if (swap.blocked) return fail('combat-trait-pick-blocked');
        const r = await run('trait-pick', () => options.pickTrait({ drop }));
        if (r.stale) return r;
        if (r.ok === true) { reveal = null; await load(); } else render();
        return r;
    }

    // 解锁特性槽（v4，只主角）：按顺序花积分永久解锁第 3 / 4 / 5 槽，经注入的 unlockTraitSlot 写一条 trait-slot，成功后重读；积分不足不可点。
    async function traitSlot() {
        const g = heroAction('unlockTraitSlot', 'trait-slot');
        if (!g.ok) return g;
        const next = nextTraitSlot(g.view);
        if (!next) return fail('combat-trait-slot-invalid');
        if ((g.view.points || 0) < next.cost) return fail('combat-points-insufficient');
        const r = await run('trait-slot', () => options.unlockTraitSlot());
        if (r.stale) return r;
        if (r.ok === true) await load(); else render();
        return r;
    }

    async function setTier(tier) {
        const view = selectedView();
        if (!view || view.kind !== 'skill-character') return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof options.setAllyTier !== 'function') return fail('combat-generate-unavailable');
        const r = await run('tier', () => options.setAllyTier(view.id, tier));
        if (r.ok === true && !r.stale) await load();
        return r;
    }

    // 生成卡面：只由「生成卡面」按钮触发，一次点击只为这一张卡请求；出图耗时长，不占 run() 的单动作锁，构筑编辑照常。
    // 生成中与失败原因来自卡面服务（按卡显示，经订阅重绘）；服务未按卡记录的拒绝（如没有聊天）显示在提示条。
    async function generateArt(cardId) {
        const view = selectedView();
        const card = view?.kind === 'deck-character' && (view.owned.get(cardId) || 0) > 0 ? view.catalog.get(cardId) : null;
        if (!card) return { ok: false, reason: 'combat-card-art-invalid' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof options.generateCardArt !== 'function') return fail('combat-card-art-unavailable');
        const my = token;
        let job;
        try { job = options.generateCardArt({ cardId, name: card.name, description: artDescription(card) }); } catch (error) { return fail('combat-card-art-failed'); }
        notice = '';
        render();
        let r;
        try { r = await job; } catch (error) { r = null; }
        if (!r || typeof r !== 'object') r = { ok: false, reason: 'combat-card-art-failed' };
        if (my !== token || !root) return { ...r, stale: true };
        if (r.ok === false && !r.cancelled && !cardArtOf(view, cardId).error) notice = deckReasonText(r.reason);
        render();
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
            case 'page':
                if (!DECK_PAGES.includes(id)) return fail('combat-page-invalid');
                page = id; sell = null; rebuild = false; respec = null; ascend = false; trait = false; reveal = null; notice = ''; render();
                return { ok: true, page };
            case 'alloc-add': return allocEdit(id, 1);
            case 'alloc-remove': return allocEdit(id, -1);
            case 'alloc-reset': allocDraft = null; notice = ''; render(); return { ok: true };
            case 'alloc-confirm': return allocConfirm();
            case 'generate-open': return openGenerate(id);
            case 'generate-class': return pickClass(id);
            case 'generate': return runGenerate();
            case 'set-tier': return setTier(id);
            case 'equip': return setGear(id, true);
            case 'unequip': return setGear(id, false);
            case 'sell-gear': return sellOpen('gear', id);
            case 'sell-keepsake': return sellOpen('keepsake', id);
            case 'sell-confirm': return sellConfirm();
            case 'sell-cancel': sell = null; notice = ''; render(); return { ok: true };
            case 'rebuild-open': return rebuildOpen();
            case 'rebuild-confirm': return rebuildConfirm();
            case 'rebuild-cancel': rebuild = false; notice = ''; render(); return { ok: true };
            case 'respec-open': return respecOpen();
            case 'respec-pick': return respecPick(id);
            case 'respec-confirm': return respecConfirm();
            case 'respec-cancel': respec = null; notice = ''; render(); return { ok: true };
            case 'ascend-open': return ascendOpen();
            case 'ascend-confirm': return ascendConfirm();
            case 'ascend-cancel': ascend = false; notice = ''; render(); return { ok: true };
            case 'trait-open': return traitOpen();
            case 'trait-confirm': return traitConfirm();
            case 'trait-cancel': trait = false; notice = ''; render(); return { ok: true };
            case 'trait-done': reveal = null; notice = ''; render(); return { ok: true };
            case 'trait-drop': return traitDrop(id);
            case 'trait-slot': return traitSlot();
            case 'card-art': return generateArt(id);
            case 'cancel': generate = null; notice = ''; render(); return { ok: true };
            case 'retry-protagonist': return retryProtagonist();
            case 'retry-tables': return retryTables();
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
        pending = ''; notice = ''; state = null; status = 'loading'; reason = ''; draft = null; generate = null; page = 'status'; allocDraft = null; sell = null; rebuild = false; respec = null; ascend = false; trait = false; reveal = null;
        pageOverlay = overlay;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = COMBAT_DECK_PANEL_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '人物状态');
        body = doc.createElement('div');
        body.className = 'igs-deck-body';
        root.appendChild(body);
        root.addEventListener('click', onClick);
        offCardArt = typeof options.subscribeCardImages === 'function' ? options.subscribeCardImages(() => { if (root) render(); }) : null;
        // 主角卡组就绪时重读账本列出新档案；有未保存的草稿或动作进行中时只重绘，不丢草稿。
        offProtagonist = typeof options.onProtagonistUpdated === 'function'
            ? options.onProtagonistUpdated((p) => { if (!root) return; if (p?.status === 'ready' && !draft && !allocDraft && !pending) load(); else render(); }) : null;
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
        try { if (typeof offCardArt === 'function') offCardArt(); } catch (error) { /* 宿主已卸载 */ }
        offCardArt = null;
        try { if (typeof offProtagonist === 'function') offProtagonist(); } catch (error) { /* 宿主已卸载 */ }
        offProtagonist = null;
        root.remove();
        root = null; body = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        setStagePauseReason(pageOverlay, PAUSE_REASON, false);
        pageOverlay = null;
        pending = ''; draft = null; allocDraft = null; generate = null; sell = null; rebuild = false; respec = null; ascend = false; trait = false; reveal = null;
        const focus = previousFocus;
        previousFocus = null;
        focus?.focus?.();
        return { ok: true };
    }

    return { open, close, dispose: close, invoke, reload: load, isOpen: () => Boolean(root), view: () => (root ? snapshot() : null) };
}
