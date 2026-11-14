import { createCombatGenerationForm } from './combat-generation-form.js';
import { setStagePauseReason } from './stage-pause.js';
import { allocView, classChoices, DECK_PAGES, deckDetailView, deckRosterView, isCombatBusy, manualBuildView, validateDraft } from './combat-deck-panel-model.js';
import { deckReasonText, renderCombatDeckPanelHtml } from './combat-deck-panel-render.js';
import { CARD_TYPE_LABELS, cardArtSvg, describeEffects } from './combat-card-art.js';
import { safePortraitUrl } from './fx-battle-model.js';
import { ASI_POINTS } from '../../combat/abilities.js';
import { ASCEND_TIERS, CARD_DRAW_COST, REBUILD_COST, RESPEC_COST, TRAIT_DRAW_COST } from '../../combat/points.js';
import { nextTraitSlot, traitSwap } from '../../combat/traits.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { openItemImageViewer, closeItemImageViewer } from './item-image-viewer.js';
import { watchRecordPageLayout } from './record-page-shell.js';
import { normalizeSettingsTheme } from './settings-theme.js';

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
    // 手动建档草稿（P8c）：{ className, role, scores }；只在本聊天建档方式为「手动」、角色尚无建档记录时使用。换角色、重读与开关面板时清空。
    let manualDraft = null;
    // 待建档角色（P8c）：手动建档时，主角、队友与数值系统登记的角色里尚无建档、也没有卡组 / 技能档案的，[{ name, protagonist, attributes }]。
    // selectedBuild 为选中的名字（与 selectedId 互斥）；wantBuild 为打开时要直接定位的名字（提示条「填写」）。只开数值系统时名单是唯一内容。
    let builds = [];
    let selectedBuild = null;
    let wantBuild = null;
    let generate = null;

    // 重新生成基础卡组待确认（只主角）；换角色、换页、重读与开关面板时清空。
    let rebuild = false;
    // 转职待确认（只主角）：{ picked, classRef }，classRef 为 null 表示按剧情生成新职业；ascend 为职业升阶待确认。换角色、换页、重读与开关面板时清空。
    let respec = null;
    let ascend = false;
    // 抽人物特性待确认（只主角）；换角色、换页、重读与开关面板时清空。已满时抽到的待定特性来自账本，替换或放弃即为确认。
    let trait = false;
    // 积分抽卡待确认（只主角）；抽到的待选来自账本，选牌或放弃即为确认。与 trait 同时清空。
    let freeUpgrade = null;
    let draw = false;
    // 积分抽卡翻牌揭晓：{ drawId, played }，翻开一张后亮出全部牌面；翻面动画只在第一次画出时播放，换角色、换页与开关面板时清空。
    // drawFlipping 为正在翻（等待写账）的位置，用于给那张卡背加按下光效。
    let drawShown = null;
    let drawFlipping = null;
    let abort = null;
    // 规则 v6 御印选定（只主角）：{ key, copyId }，key 为待刻遗物「relicId|model」，copyId 为选中的副本（未选为 null）；只是面板内的选择，
    // 确认才经注入的 inscribeRelic 写账本。换角色、换页、重读与开关面板时清空。
    let seal = null;
    let scaleTip = null;
    // 抽人物特性揭晓（P-f）：{ phase: 'charge' | 'open', rarity, traitId, played }。稀有度由服务层规划后回传，界面不另抽一次。
    // 写入并重读账本后翻开；失败、换角色、换页与开关面板时清空，重读账本保留。翻开动画只在第一次画出时播放（played）。
    let reveal = null;
    // 卡面图订阅（打开时订阅、关闭时退订）：生成进度、结果与本地图片补载后重绘。
    let offCardArt = null;
    // 物品图订阅（P7d）：装备栏与道具的物品图补载或生成完成后重绘。
    let offItemArt = null;
    // 主角卡组预生成状态订阅：生成中 / 重试中 / 失败在面板内显示并可手动重试；就绪后重读账本。
    let offProtagonist = null;
    // 配色与日记、目录共用设置器的四套（getTheme / setTheme 由宿主注入）；容器宽度写布局 class（窄屏 / 短屏）。
    let theme = normalizeSettingsTheme('');
    let unwatchLayout = null;
    const readTheme = () => { try { return normalizeSettingsTheme(options.getTheme?.() || ''); } catch (error) { return normalizeSettingsTheme(''); } };

    const generationForm = createCombatGenerationForm({ inspect: options.inspectGenerationMaterials, render, errorText: deckReasonText });
    const ledger = () => (typeof options.getLedger === 'function' ? options.getLedger() : null);
    const session = () => (typeof options.getSession === 'function' ? options.getSession() : null);
    const sessionState = () => { try { return session()?.state() || null; } catch (error) { return null; } };
    const reduced = () => {
        try { return typeof options.reducedMotion === 'function' ? options.reducedMotion() === true : prefersReducedMotion(); } catch (error) { return false; }
    };
    const selectedView = () => (!selectedBuild && state?.ok && selectedId ? state.characters.get(selectedId) || null : null);
    const manualOn = () => {
        if (typeof options.writeManualInit !== 'function') return false;
        try { return typeof options.buildMode === 'function' && options.buildMode() === 'manual'; } catch (error) { return false; }
    };
    const buildEntryOn = () => { try { return typeof options.buildEntry === 'function' && options.buildEntry() === true; } catch (error) { return false; } };
    const selectedBuildView = () => (selectedBuild ? builds.find((c) => c.name === selectedBuild) || null : null);
    const manualTarget = () => selectedBuildView() || selectedView();
    const manualOf = (t) => (t && manualOn() ? manualBuildView(t.attributes, manualDraft, { readonly: isCombatBusy(sessionState()) }) : null);
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
    // 装备栏、背包装备与道具：按物品名读本聊天物品图本地缓存（与背包页同键），只在取到图时追加 imageUrl。
    const itemArtOf = (name) => {
        let url = '';
        try { url = typeof options.resolveItemImage === 'function' ? options.resolveItemImage(name) : ''; } catch (error) { url = ''; }
        return safePortraitUrl(url);
    };
    const withItemArt = (detail) => {
        const g = detail?.gear;
        if (!g) return detail;
        const art = (x) => { const imageUrl = itemArtOf(x.name); return imageUrl ? { ...x, imageUrl } : x; };
        return { ...detail, gear: { ...g, slots: g.slots.map((s) => (s.item ? { ...s, item: art(s.item) } : s)), bag: g.bag.map(art), items: g.items.map(art) } };
    };

    function snapshot() {
        const ss = sessionState();
        const view = selectedView();
        const readonly = isCombatBusy(ss);
        const still = reduced();
        return {
            status, reason, notice, pending, selectedId, generate, page, rebuild, respec, ascend, trait, draw, seal: seal ? { ...seal } : null, generationForm: generationForm.view(),
            freeUpgrade: freeUpgrade ? { ...freeUpgrade } : null,
            drawShown: drawShown ? { drawId: drawShown.drawId, fresh: !drawShown.played && !still } : null, drawFlipping,
            selectedBuild, builds: builds.map((c) => ({ name: c.name, protagonist: c.protagonist })),
            reveal: reveal ? { phase: reveal.phase, rarity: reveal.rarity, traitId: reveal.traitId, fresh: reveal.phase === 'open' && !reveal.played && !still } : null,
            reduced: still, theme, canTheme: typeof options.setTheme === 'function',
            readonly,
            roster: deckRosterView(state), classes: classChoices(state),
            detail: view ? withItemArt(withCardArt(view, deckDetailView(view, view.kind === 'deck-character' ? draft : null))) : null,
            alloc: view ? allocView(view.attributes, allocDraft, { readonly }) : null,
            manual: manualOf(manualTarget()),
            pendingGeneration: pendingOf(),
            sendFailed: ss?.status === 'send-failed',
            reportDelivered: ss?.reportDelivered === true,
            protagonist: protagonistOf(), canRetryProtagonist: typeof options.retryProtagonist === 'function',
            canEnsureTables: typeof options.ensureTables === 'function',
            canRebuild: typeof options.regenerateDeck === 'function',
            canRespec: typeof options.respecClass === 'function',
            canAscend: typeof options.ascendClass === 'function',
            canDrawTrait: typeof options.drawTrait === 'function',
            canPickTrait: typeof options.pickTrait === 'function',
            canUnlockSlot: typeof options.unlockTraitSlot === 'function',
            canDrawCard: typeof options.drawCard === 'function',
            canUpgradeCard: typeof options.upgradeCard === 'function',
            canPickCard: typeof options.pickCard === 'function' && typeof options.flipCard === 'function',
            canInscribe: typeof options.inscribeRelic === 'function',
        };
    }

    // 整块重绘后按 data-deck-act + data-deck-id 找回焦点；找不到时落到关闭按钮。
    function render() {
        if (!body) return;
        const active = doc.activeElement;
        const had = Boolean(active && root?.contains?.(active));
        const act = had ? active.getAttribute?.('data-deck-act') : null;
        const generationField = had ? active.getAttribute?.('data-generation-field') : null;
        const caret = generationField ? [active.selectionStart, active.selectionEnd] : null;
        generationForm.captureDetails(body);
        const id = had ? active.getAttribute?.('data-deck-id') || '' : '';
        // 卡面图异步到达也会重绘：保留主区滚动位置，不跳回顶部。
        const top = body.querySelector?.('.igs-deck-main')?.scrollTop || 0;
        hideScaleTip();
        body.innerHTML = renderCombatDeckPanelHtml(snapshot());
        if (reveal?.phase === 'open') reveal.played = true;
        if (drawShown) drawShown.played = true;
        const scroller = top ? body.querySelector?.('.igs-deck-main') : null;
        if (scroller) scroller.scrollTop = top;
        if (!had) return;
        if (generationField) {
            const field = body.querySelector?.(`[data-generation-field="${generationField}"]`);
            field?.focus?.();
            if (caret && typeof field?.setSelectionRange === 'function' && caret[0] != null) field.setSelectionRange(...caret);
            return;
        }
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

    // 每次打开与写入后都从账本重读；读取失败显示原因，不当作空列表。手动建档时另读待建档名单（P8c），只开数值系统时只有这份名单。
    async function load() {
        const l = ledger();
        const wantBuilds = manualOn() && typeof options.getBuildCandidates === 'function';
        if (!l && !wantBuilds) { status = 'unavailable'; state = null; builds = []; selectedBuild = null; render(); return { ok: false, reason: 'combat-disabled' }; }
        const my = token;
        if (!state && !builds.length) { status = 'loading'; render(); }
        let st = null;
        if (l) { try { st = await l.effectiveState(); } catch (error) { st = { ok: false, reason: 'combat-ledger-read-failed' }; } }
        let b = null;
        if (wantBuilds) { try { b = await options.getBuildCandidates(); } catch (error) { b = { ok: false, reason: 'combat-ledger-read-failed' }; } }
        if (my !== token) return { ok: false, reason: 'request-stale' };
        draft = null; allocDraft = null; manualDraft = null; generationForm.reset(); rebuild = false; respec = null; ascend = false; trait = false; draw = false; freeUpgrade = null; seal = null;
        const bad = l ? (st?.ok === true ? '' : st?.reason || 'combat-ledger-read-failed') : (b?.ok === true ? '' : b?.reason || 'combat-ledger-read-failed');
        if (bad) {
            state = null; builds = []; selectedBuild = null; status = 'error'; reason = bad;
            render();
            return { ok: false, reason };
        }
        state = l ? st : null; status = 'ready'; reason = '';
        // 战斗开启时名单读取失败不当作没有待建档：在提示条写明原因，档案角色照常列出。
        if (wantBuilds && b?.ok !== true) notice = deckReasonText(b?.reason || 'combat-ledger-read-failed');
        // 已有档案的角色按档案列出，待建档只列其余的。
        const known = new Set(state ? [...state.characters.values()].map((c) => c.name) : []);
        builds = b?.ok === true ? b.list.filter((c) => !known.has(c.name)) : [];
        if (wantBuild && builds.some((c) => c.name === wantBuild)) { selectedBuild = wantBuild; page = 'alloc'; }
        wantBuild = null;
        if (selectedBuild && !builds.some((c) => c.name === selectedBuild)) selectedBuild = null;
        if (!state || !selectedId || !state.characters.has(selectedId)) selectedId = deckRosterView(state)[0]?.id || null;
        if (!selectedBuild && !selectedId) selectedBuild = builds[0]?.name || null;
        render();
        return { ok: true };
    }

    function select(id) {
        if (!state?.ok || !state.characters.has(id)) return { ok: false, reason: 'combat-character-missing' };
        if (id !== selectedId || selectedBuild) { selectedBuild = null; selectedId = id; draft = null; allocDraft = null; manualDraft = null; generate = null; generationForm.reset(); rebuild = false; respec = null; ascend = false; trait = false; draw = false; freeUpgrade = null; seal = null; drawShown = null; reveal = null; notice = ''; }
        render();
        return { ok: true };
    }

    function selectBuild(name) {
        if (!builds.some((c) => c.name === name)) return { ok: false, reason: 'combat-character-missing' };
        if (name !== selectedBuild) { selectedBuild = name; draft = null; allocDraft = null; manualDraft = null; generate = null; generationForm.reset(); rebuild = false; respec = null; ascend = false; trait = false; draw = false; freeUpgrade = null; seal = null; drawShown = null; reveal = null; notice = ''; }
        render();
        return { ok: true };
    }

    // 草稿编辑：加入受拥有数与同名上限约束，移出只减一张；与已保存卡组相同时清空草稿。
    // 规则 v6 卡组即持有：只有旧档案卡组需要调整（deckNeedsAdjust）时才可整理。
    function edit(cardId, delta) {
        const view = selectedView();
        if (!view || view.kind !== 'deck-character') return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (view.deckNeedsAdjust !== true) return fail('combat-deck-locked');
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
        if (view.deckNeedsAdjust !== true) return fail('combat-deck-locked');
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

    // 手动建档（P8c）：逐点调整六维（总分与单项上下限由视图模型给出可否）、选定位；「确认建档」经注入的 writeManualInit 写属性表 init 后重读。
    function manualEdit(key, delta) {
        const m = manualOf(manualTarget());
        if (!m) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        const row = m.rows.find((r) => r.key === key);
        if (!row || !(delta > 0 ? row.canAdd : row.canRemove)) return { ok: false, reason: 'combat-manual-invalid' };
        manualDraft = { className: m.className, role: m.role, scores: { ...m.scores, [key]: m.scores[key] + delta } };
        notice = '';
        render();
        return { ok: true, left: m.left - delta };
    }

    function manualRole(role) {
        const m = manualOf(manualTarget());
        if (!m) return { ok: false, reason: 'combat-character-missing' };
        if (!m.editable) return fail(isCombatBusy(sessionState()) ? 'combat-deck-readonly' : 'combat-attribute-table-missing');
        if (!m.roles.some((r) => r.key === role)) return { ok: false, reason: 'combat-manual-invalid' };
        manualDraft = { className: m.className, role, scores: m.scores };
        notice = '';
        render();
        return { ok: true };
    }

    // 职业名输入只改草稿、不重绘（保留焦点与输入法状态）。
    function onInput(event) {
        if (pending) return;
        if (generationForm.input(event)) return;
        if (event.target?.getAttribute?.('data-deck-input') !== 'manual-class') return;
        const m = manualOf(manualTarget());
        if (!m || !m.editable) return;
        manualDraft = { className: String(event.target.value || '').slice(0, 12), role: m.role, scores: m.scores };
    }

    async function manualConfirm() {
        const view = manualTarget();
        const m = manualOf(view);
        if (!m) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (!m.ok) return fail('combat-manual-invalid');
        const r = await run('manual', () => options.writeManualInit(view.name, { className: m.className.trim(), role: m.role, scores: { ...m.scores } }));
        if (r.ok === true && !r.stale) { manualDraft = null; await load(); }
        return r;
    }

    // 手动生成卡组档案：只在注入了生成能力时可用；选定已有职业时沿用其职业特性，不再请求职业部分。
    function openGenerate(id) {
        if (!state?.ok || !state.characters.has(id)) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof options.generateDeckProfile !== 'function') return fail('combat-generate-unavailable');
        freeUpgrade = null;
        generate = { id, classRef: null };
        generationForm.open(state.characters.get(id).name, 'generate');
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
        const formOptions = generationForm.options();
        if (!formOptions.ok) return fail(formOptions.reason);
        const r = await run('generate', () => options.generateDeckProfile(input, { ...formOptions, signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        if (r.ok === true) { generate = null; if (r.id) selectedId = r.id; await load(); }
        return r;
    }

    // 主角卡组手动重试：不受「已请求失败不自动重发」限制；成功后重读账本显示新档案。失败原因显示在主角卡组行，不重复写提示条。
    async function retryProtagonist() {
        if (typeof options.retryProtagonist !== 'function') return fail('combat-generate-unavailable');
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (generationForm.view()?.kind !== 'protagonist' && protagonistOf()?.name) {
            generationForm.open(protagonistOf().name, 'protagonist'); render(); return { ok: true };
        }
        const formOptions = generationForm.view() ? generationForm.options() : { ok: true };
        if (!formOptions.ok) return fail(formOptions.reason);
        const r = await run('protagonist', () => options.retryProtagonist(formOptions));
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
    // 换装：注入服务写口时先写最新 AI 楼正文说明再改装配表 / 账本（P7c），否则直接经账本写 equip / unequip；成功后重读；战斗进行中只读。
    // slotIndex（规则 v6，可选）：装宝物时替换第几格，缺省时没满追加、满了替换最早的一件。
    async function setGear(gearId, equip, slotIndex = undefined) {
        const view = selectedView();
        const l = ledger();
        if (!view || !l) return { ok: false, reason: 'combat-character-missing' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        const write = typeof options.setGear === 'function' ? () => options.setGear(view.id, gearId, equip, slotIndex)
            : typeof l.setGear === 'function' ? () => l.setGear(view.id, gearId, equip, slotIndex) : null;
        if (!write) return fail('combat-generate-unavailable');
        const r = await run('gear', write);
        if (r.ok !== true && !r.stale && r.floorRollback === 'failed') { notice = `${notice}；正文说明未能撤回，请检查最新楼层`; render(); }
        if (r.ok === true && !r.stale) await load();
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
        rebuild = true; respec = null; ascend = false; trait = false; draw = false; freeUpgrade = null;
        generationForm.open(view.name, 'rebuild');
        notice = '';
        render();
        body?.querySelector?.('[data-deck-act="rebuild-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function rebuildConfirm() {
        if (!rebuild) return { ok: false, reason: 'combat-rebuild-unavailable' };
        if (isCombatBusy(sessionState())) return fail('combat-deck-readonly');
        if (typeof options.regenerateDeck !== 'function') return fail('combat-rebuild-unavailable');
        const formOptions = generationForm.options();
        if (!formOptions.ok) return fail(formOptions.reason);
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const r = await run('rebuild', () => options.regenerateDeck({ ...formOptions, signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        if (r.ok === true) { rebuild = false; generationForm.reset(); await load(); } else render();
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
        generationForm.reset();
        respec = { picked: false, classRef: null }; rebuild = false; ascend = false; trait = false; draw = false; freeUpgrade = null; notice = '';
        render();
        return { ok: true };
    }

    function respecPick(id) {
        if (!respec) return { ok: false, reason: 'combat-respec-unavailable' };
        const classRef = id || null;
        if (classRef && !state?.classes?.has(classRef)) return fail('combat-class-missing');
        if (classRef && classRef === selectedView()?.classRef) return fail('combat-respec-same-class');
        respec = { picked: true, classRef };
        if (classRef) generationForm.reset(); else generationForm.open(selectedView().name, 'respec');
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
        const formOptions = classRef ? { ok: true } : generationForm.options();
        if (!formOptions.ok) return fail(formOptions.reason);
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const r = await run('respec', () => options.respecClass({ ...formOptions, ...(classRef ? { classRef } : {}), signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        if (r.ok === true) { respec = null; generationForm.reset(); await load(); } else render();
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
        generationForm.open(g.view.name, 'ascend');
        ascend = true; rebuild = false; respec = null; trait = false; draw = false; freeUpgrade = null; notice = '';
        render();
        body?.querySelector?.('[data-deck-act="ascend-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function ascendConfirm() {
        if (!ascend) return { ok: false, reason: 'combat-ascend-unavailable' };
        const g = heroAction('ascendClass', 'ascend');
        if (!g.ok) return g;
        const formOptions = generationForm.options();
        if (!formOptions.ok) return fail(formOptions.reason);
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const r = await run('ascend', () => options.ascendClass({ ...formOptions, signal: abort?.signal }));
        abort = null;
        if (r.stale) return r;
        if (r.ok === true) { ascend = false; generationForm.reset(); await load(); } else render();
        return r;
    }

    // 人物特性（只主角）：「抽人物特性」后在原处确认或取消；确认经注入的 drawTrait 请副 LLM 生成并写一条 trait（扣 TRAIT_DRAW_COST），成功后重读。
    // 有待定特性（已满时抽到、尚未决定）或积分不足时不可点；失败不扣分，原因显示在提示条；关闭面板时中止生成。
    function traitOpen() {
        const g = heroAction('drawTrait', 'trait');
        if (!g.ok) return g;
        if (g.view.pendingTrait) return fail('combat-trait-pending');
        if ((g.view.points || 0) < TRAIT_DRAW_COST) return fail('combat-points-insufficient');
        generationForm.reset();
        trait = true; rebuild = false; respec = null; ascend = false; draw = false; freeUpgrade = null; notice = '';
        render();
        body?.querySelector?.('[data-deck-act="trait-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function traitConfirm() {
        if (!trait) return { ok: false, reason: 'combat-trait-unavailable' };
        const g = heroAction('drawTrait', 'trait');
        if (!g.ok) return g;
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const control = abort;
        const charging = { phase: 'charge', rarity: 'common', traitId: '', played: false };
        reveal = charging;
        const r = await run('trait', () => options.drawTrait({ signal: control?.signal, onPlan: ({ rarity }) => {
            if (reveal !== charging || control?.signal.aborted) return;
            charging.rarity = rarity;
            render();
        } }));
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

    // 规则 v6 御印（只主角）：「选定刻印」展开可刻的副本，点一张只在面板里选中并显示刻印前后的费用与说明，「确认刻印」才经注入的 inscribeRelic 写一条 relic-inscribe，成功后重读。
    // 取消只清面板里的选择；可选副本与待刻项以账本视图为准，选项失效时拒绝，不在本地改副本。
    const sealOf = (view, key) => {
        const detail = deckDetailView(view, null);
        return (detail?.relicInscribe || []).find((item) => item.key === key) || null;
    };
    function inscribeOpen(key) {
        const g = heroAction('inscribeRelic', 'relic-inscribe');
        if (!g.ok) return g;
        if (!sealOf(g.view, key)) return fail('combat-relic-inscribe-unavailable');
        seal = { key, copyId: null }; freeUpgrade = null; notice = '';
        render();
        return { ok: true };
    }
    function inscribePick(copyId) {
        const g = heroAction('inscribeRelic', 'relic-inscribe');
        if (!g.ok) return g;
        const item = seal ? sealOf(g.view, seal.key) : null;
        if (!item) return fail('combat-relic-inscribe-unavailable');
        if (!item.copies.some((c) => c.copyId === copyId)) return fail('combat-relic-inscribe-invalid');
        seal = { ...seal, copyId }; notice = '';
        render();
        return { ok: true };
    }
    async function inscribeConfirm() {
        const g = heroAction('inscribeRelic', 'relic-inscribe');
        if (!g.ok) return g;
        const item = seal ? sealOf(g.view, seal.key) : null;
        if (!item) return fail('combat-relic-inscribe-unavailable');
        if (!item.copies.some((c) => c.copyId === seal.copyId)) return fail('combat-relic-inscribe-invalid');
        const r = await run('inscribe', () => options.inscribeRelic({ relicId: item.relicId, model: item.model, copyId: seal.copyId }));
        if (r.stale) return r;
        if (r.ok === true) await load(); else render();
        return r;
    }

    // 规则 v6 积分抽卡（只主角）：「抽卡」后在原处确认或取消；确认经注入的 drawCard 请副 LLM 给随机候选起名并写一条 card-draw（扣 CARD_DRAW_COST），成功后重读。
    // 有待选或金钱不足时不可点；失败不扣钱，原因显示在提示条；关闭面板时中止生成。
    function drawOpen() {
        const g = heroAction('drawCard', 'card-draw');
        if (!g.ok) return g;
        if (g.view.pendingDraw) return fail('combat-card-draw-pending');
        const level = g.view.freeDraws?.[0];
        if (level === undefined && (g.view.points || 0) < CARD_DRAW_COST) return fail('combat-points-insufficient');
        generationForm.reset();
        draw = { free: level === undefined ? null : { level } }; freeUpgrade = null; trait = false; rebuild = false; respec = null; ascend = false; notice = '';
        render();
        body?.querySelector?.('[data-deck-act="draw-confirm"]')?.focus?.();
        return { ok: true };
    }

    async function drawConfirm() {
        if (!draw) return { ok: false, reason: 'combat-card-draw-unavailable' };
        const g = heroAction('drawCard', 'card-draw');
        if (!g.ok) return g;
        const free = draw.free;
        if (free && !g.view.freeDraws?.includes(free.level)) return fail('combat-card-draw-free-unavailable');
        abort = typeof AbortController === 'function' ? new AbortController() : null;
        const r = await run('card-draw', () => options.drawCard({ signal: abort?.signal, ...(free ? { free } : {}) }));
        abort = null;
        if (r.stale) return r;
        draw = false;
        if (r.ok === true) await load(); else render();
        return r;
    }

    function upgradeOpen() {
        const g = heroAction('upgradeCard', 'card-upgrade');
        if (!g.ok) return g;
        const level = g.view.freeUpgrades?.[0];
        if (level === undefined) return fail('combat-card-upgrade-free-unavailable');
        if (!deckDetailView(g.view, null).upgradeCards.length) return fail('combat-card-upgrade-none');
        freeUpgrade = { level, copyId: null };
        draw = false; seal = null; trait = false; rebuild = false; respec = null; ascend = false; notice = '';
        generationForm.reset();
        render();
        return { ok: true };
    }
    function upgradePick(copyId) {
        const g = heroAction('upgradeCard', 'card-upgrade');
        if (!g.ok) return g;
        if (!freeUpgrade || !g.view.freeUpgrades?.includes(freeUpgrade.level)) return fail('combat-card-upgrade-free-unavailable');
        if (!deckDetailView(g.view, null).upgradeCards.some(row => row.copyId === copyId)) return fail('combat-card-upgrade-invalid');
        freeUpgrade = { ...freeUpgrade, copyId };
        notice = '';
        render();
        return { ok: true };
    }
    async function upgradeConfirm() {
        const g = heroAction('upgradeCard', 'card-upgrade');
        if (!g.ok) return g;
        if (!freeUpgrade || !g.view.freeUpgrades?.includes(freeUpgrade.level)) return fail('combat-card-upgrade-free-unavailable');
        const { level, copyId } = freeUpgrade;
        if (!deckDetailView(g.view, null).upgradeCards.some(row => row.copyId === copyId)) return fail('combat-card-upgrade-invalid');
        const r = await run('card-upgrade', () => options.upgradeCard({ level, copyId }));
        if (r.stale) return r;
        if (r.ok === true) {
            freeUpgrade = null;
            await load();
        } else render();
        return r;
    }

    // 翻牌：id 为背面朝上的位置序号，每抽只能翻一张；经注入的 flipCard 写一条 card-flip，成功后重读并亮出全部牌面（翻面动画只播一次）。
    async function cardFlip(id) {
        const g = heroAction('flipCard', 'card-flip');
        if (!g.ok) return g;
        const fresh = g.view.pendingDraw;
        if (!fresh) return fail('combat-card-flip-invalid');
        if (Number.isInteger(fresh.flipped)) return fail('combat-card-flip-done');
        const position = Number(id);
        if (!(Number.isInteger(position) && position >= 0 && position < fresh.choices.length)) return fail('combat-card-flip-invalid');
        drawFlipping = position;
        const r = await run('card-flip', () => options.flipCard({ position }));
        drawFlipping = null;
        if (r.stale) return r;
        if (r.ok !== true) { render(); return r; }
        drawShown = { drawId: fresh.drawId, played: false };
        await load();
        return r;
    }

    // 翻开后决定：keep 把翻开的那张加入卡组，skip 放弃（翻前翻后都可，不退还）；经注入的 pickCard 写一条 card-pick，成功后重读。
    async function cardDecide(keep) {
        const g = heroAction('pickCard', 'card-pick');
        if (!g.ok) return g;
        const fresh = g.view.pendingDraw;
        if (!fresh) return fail('combat-card-pick-invalid');
        if (keep && !Number.isInteger(fresh.flipped)) return fail('combat-card-pick-unflipped');
        const pick = keep ? fresh.flipped : 'skip';
        const r = await run(keep ? 'card-keep' : 'card-skip', () => options.pickCard({ pick }));
        if (r.stale) return r;
        if (r.ok !== true) { render(); return r; }
        drawShown = null;
        notice = keep ? `「${fresh.choices[fresh.flipped]?.name || ''}」已加入卡组` : '已放弃这次抽到的牌';
        await load();
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
        if (pending) return { ok: false, reason: 'combat-busy' };
        switch (name) {
            case 'reload': return load();
            case 'select': return select(id);
            case 'select-build': return selectBuild(id);
            case 'add': return edit(id, 1);
            case 'remove': return edit(id, -1);
            case 'reset': draft = null; notice = ''; render(); return { ok: true };
            case 'save': return save();
            case 'page':
                if (!DECK_PAGES.includes(id)) return fail('combat-page-invalid');
                page = id; generationForm.reset(); rebuild = false; respec = null; ascend = false; trait = false; draw = false; freeUpgrade = null; seal = null; drawShown = null; reveal = null; notice = ''; render();
                return { ok: true, page };
            case 'alloc-add': return allocEdit(id, 1);
            case 'alloc-remove': return allocEdit(id, -1);
            case 'alloc-reset': allocDraft = null; notice = ''; render(); return { ok: true };
            case 'alloc-confirm': return allocConfirm();
            case 'manual-add': return manualEdit(id, 1);
            case 'manual-remove': return manualEdit(id, -1);
            case 'manual-role': return manualRole(id);
            case 'manual-reset': manualDraft = null; notice = ''; render(); return { ok: true };
            case 'manual-confirm': return manualConfirm();
            case 'generate-open': return openGenerate(id);
            case 'generate-class': return pickClass(id);
            case 'generate': return runGenerate();
            case 'set-tier': return setTier(id);
            case 'equip': return setGear(id, true);
            case 'unequip': return setGear(id, false);
            case 'generation-cancel': generationForm.reset(); render(); return { ok: true };
            case 'generation-refresh': return generationForm.refresh();
            case 'rebuild-open': return rebuildOpen();
            case 'rebuild-confirm': return rebuildConfirm();
            case 'rebuild-cancel': generationForm.reset(); rebuild = false; notice = ''; render(); return { ok: true };
            case 'respec-open': return respecOpen();
            case 'respec-pick': return respecPick(id);
            case 'respec-confirm': return respecConfirm();
            case 'respec-cancel': generationForm.reset(); respec = null; notice = ''; render(); return { ok: true };
            case 'ascend-open': return ascendOpen();
            case 'ascend-confirm': return ascendConfirm();
            case 'ascend-cancel': generationForm.reset(); ascend = false; notice = ''; render(); return { ok: true };
            case 'trait-open': return traitOpen();
            case 'trait-confirm': return traitConfirm();
            case 'trait-cancel': trait = false; notice = ''; render(); return { ok: true };
            case 'trait-done': reveal = null; notice = ''; render(); return { ok: true };
            case 'draw-open': return drawOpen();
            case 'draw-confirm': return drawConfirm();
            case 'draw-cancel': draw = false; notice = ''; render(); return { ok: true };
            case 'upgrade-open': return upgradeOpen();
            case 'upgrade-pick': return upgradePick(id);
            case 'upgrade-confirm': return upgradeConfirm();
            case 'upgrade-cancel': freeUpgrade = null; notice = ''; render(); return { ok: true };
            case 'card-flip': return cardFlip(id);
            case 'draw-keep': return cardDecide(true);
            case 'draw-skip': return cardDecide(false);
            case 'inscribe-open': return inscribeOpen(id);
            case 'inscribe-pick': return inscribePick(id);
            case 'inscribe-confirm': return inscribeConfirm();
            case 'inscribe-cancel': seal = null; notice = ''; render(); return { ok: true };
            case 'theme':
                theme = normalizeSettingsTheme(id);
                root.setAttribute('data-rp-theme', theme);
                try { options.setTheme?.(theme); } catch (error) { /* 保存失败只影响下次打开 */ }
                render();
                return { ok: true, theme };
            case 'trait-drop': return traitDrop(id);
            case 'trait-slot': return traitSlot();
            case 'card-art': return generateArt(id);
            case 'cancel': generationForm.reset(); generate = null; notice = ''; render(); return { ok: true };
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

    function hideScaleTip() {
        scaleTip?.node.remove();
        scaleTip = null;
    }

    function showScaleTip(anchor) {
        hideScaleTip();
        const node = doc.createElement('div');
        node.className = 'igs-deck-scale-tip';
        node.setAttribute('role', 'tooltip');
        node.textContent = anchor.getAttribute('data-scale-tip') || '';
        root.appendChild(node);
        scaleTip = { node, anchor };
        const a = anchor.getBoundingClientRect();
        const r = root.getBoundingClientRect();
        if (!a.width || !r.width) return;
        const k = root.offsetWidth ? r.width / root.offsetWidth : 1;
        const half = node.offsetWidth / 2;
        const x = Math.max(half + 8, Math.min((a.left - r.left + a.width / 2) / k, r.width / k - half - 8));
        const height = node.offsetHeight;
        const above = (a.top - r.top) / k - height - 8;
        const top = above >= 8 ? above : Math.max(8, Math.min((a.bottom - r.top) / k + 8, r.height / k - height - 8));
        node.style.setProperty('--tip-x', `${Math.round(x)}px`);
        node.style.setProperty('--tip-y', `${Math.round(top)}px`);
    }

    function onTipOver(event) {
        if (event.pointerType === 'touch' || scaleTip) return;
        const anchor = event.target?.closest?.('[data-scale-tip]');
        if (!anchor || !root?.contains?.(anchor)) return;
        showScaleTip(anchor);
        scaleTip.hover = true;
    }

    function onTipOut(event) {
        if (scaleTip?.hover && !scaleTip.anchor.contains?.(event.relatedTarget) && !scaleTip.node.contains?.(event.relatedTarget)) hideScaleTip();
    }

    function onClick(event) {
        event.stopPropagation?.();
        const tipAnchor = event.target?.closest?.('[data-scale-tip]');
        if (tipAnchor && root?.contains?.(tipAnchor)) {
            event.preventDefault?.();
            if (scaleTip?.anchor === tipAnchor) {
                if (scaleTip.hover) delete scaleTip.hover;
                else hideScaleTip();
            } else showScaleTip(tipAnchor);
            return;
        }
        hideScaleTip();
        const zoom = event.target?.closest?.('[data-deck-zoom]');
        if (zoom && root?.contains?.(zoom)) {
            event.preventDefault?.();
            const name = zoom.getAttribute('data-deck-zoom') || '';
            openItemImageViewer(doc, pageOverlay, { src: itemArtOf(name), name });
            return;
        }
        const control = event.target?.closest?.('[data-deck-act]');
        if (!control || !root?.contains?.(control)) return;
        event.preventDefault?.();
        if (control.getAttribute('aria-disabled') === 'true') return;
        invoke(control.getAttribute('data-deck-act'), control.getAttribute('data-deck-id') || '');
    }

    // build：打开后直接定位到这位待建档角色的建档页（提示条「填写」）。只开数值系统时，本聊天为手动建档才可打开。
    function open(overlay, { build = null } = {}) {
        if (root) return { ok: true, reason: 'already-open' };
        if (!overlay || !doc?.createElement) return { ok: false, reason: 'missing-combat-container' };
        if (!ledger() && !(buildEntryOn() && manualOn())) return { ok: false, reason: 'combat-disabled' };
        token += 1;
        pending = ''; notice = ''; state = null; status = 'loading'; reason = ''; draft = null; generate = null; page = 'status'; allocDraft = null; manualDraft = null; generationForm.reset(); rebuild = false; respec = null; ascend = false; trait = false; draw = false; freeUpgrade = null; seal = null; drawShown = null; reveal = null;
        builds = []; selectedBuild = null; wantBuild = build ? String(build) : null;
        pageOverlay = overlay;
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = COMBAT_DECK_PANEL_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '人物状态');
        theme = readTheme();
        root.setAttribute('data-rp-theme', theme);
        body = doc.createElement('div');
        body.className = 'igs-deck-body';
        root.appendChild(body);
        root.addEventListener('click', onClick);
        root.addEventListener('pointerover', onTipOver);
        root.addEventListener('pointerout', onTipOut);
        root.addEventListener('scroll', hideScaleTip, true);
        root.addEventListener('input', onInput);
        offCardArt = typeof options.subscribeCardImages === 'function' ? options.subscribeCardImages(() => { if (root) render(); }) : null;
        offItemArt = typeof options.subscribeItemImages === 'function' ? options.subscribeItemImages(() => { if (root) render(); }) : null;
        // 主角卡组就绪时重读账本列出新档案；有未保存的草稿或动作进行中时只重绘，不丢草稿。
        offProtagonist = typeof options.onProtagonistUpdated === 'function'
            ? options.onProtagonistUpdated((p) => { if (!root) return; if (p?.status === 'ready' && !draft && !allocDraft && !manualDraft && !pending) load(); else render(); }) : null;
        overlay.appendChild(root);
        unwatchLayout = watchRecordPageLayout(root, doc);
        overlay.classList?.toggle('igs-record-screen-open', true);
        setStagePauseReason(overlay, PAUSE_REASON, true);
        render();
        body.querySelector?.('[data-deck-act="close"]')?.focus?.();
        load();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        closeItemImageViewer(doc);
        hideScaleTip();
        token += 1;
        try { abort?.abort(); } catch (error) { /* 已结束 */ }
        abort = null;
        root.removeEventListener?.('click', onClick);
        root.removeEventListener?.('pointerover', onTipOver);
        root.removeEventListener?.('pointerout', onTipOut);
        root.removeEventListener?.('scroll', hideScaleTip, true);
        root.removeEventListener?.('input', onInput);
        try { if (typeof offCardArt === 'function') offCardArt(); } catch (error) { /* 宿主已卸载 */ }
        offCardArt = null;
        try { if (typeof offItemArt === 'function') offItemArt(); } catch (error) { /* 宿主已卸载 */ }
        offItemArt = null;
        try { if (typeof offProtagonist === 'function') offProtagonist(); } catch (error) { /* 宿主已卸载 */ }
        offProtagonist = null;
        try { unwatchLayout?.(); } catch (error) { /* 已断开 */ }
        unwatchLayout = null;
        root.remove();
        root = null; body = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        setStagePauseReason(pageOverlay, PAUSE_REASON, false);
        pageOverlay = null;
        pending = ''; draft = null; allocDraft = null; manualDraft = null; generate = null; generationForm.reset(); rebuild = false; respec = null; ascend = false; trait = false; draw = false; freeUpgrade = null; seal = null; drawShown = null; reveal = null; selectedBuild = null; wantBuild = null;
        const focus = previousFocus;
        previousFocus = null;
        focus?.focus?.();
        return { ok: true };
    }

    return { open, close, dispose: close, invoke, reload: load, isOpen: () => Boolean(root), view: () => (root ? snapshot() : null) };
}
