import { setStagePauseReason } from './stage-pause.js';
import { planBattleFx, safePortraitUrl } from './fx-battle-model.js';
import { applyBattleFxToDom, cancelBattleFx } from './fx-battle.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { peekSpriteHead, probeSpriteHead, waitSpriteHead } from './fx-anchor.js';
import { COMBAT_AWAKEN_END, COMBAT_CUTIN_MS, buildAwakenCutin, buildOpeningCutin, buildSkillCutin, preloadCutinFonts } from './combat-cutin.js';
import { battleSfxKind } from './fx-battle-sfx.js';
import { ensureFxLayers } from './fx-layer.js';
import { COMBAT_HIT_REACT_ATTR, COMBAT_HIT_REACT_MS, applyHitMarks, cloneCardGhost, hpSnapshot, launchCardGhost, paintUnitHp, playedCardFx, reactUnit, showHitFloats, showRarityFx, showWindupFx, windupFx } from './combat-hit-fx.js';
import { battleView, combatCutins, combatFxSource, combatHitMarks, combatLandings, endView, isItemSelection, isSkillSelection, itemSelection, lobbyView, pendingChoice, resolveHeroSkill, resolveItem, resolvePlay, rewardChoices, selectedItemView, selectedSkillView, selectionItemId, selectionSkillId, skillSelection, unitDetailView, unitView, volleyTargets } from './combat-panel-model.js';
import { combatReasonText, renderCombatPanelHtml, tintTriplet, traitTipHtml, unitTipHtml } from './combat-panel-render.js';
import { actionProgress } from '../../combat/engine.js';
import { enemyArtCell } from './combat-enemy-art.js';

// 卡牌战斗面板。挂在 #igs-overlay 直属层（不进 #igs-stage-motion），避免阅读器自己的演出层查到面板内的演出节点。
// 会话由 options.getSession() 注入；面板只转发动作、渲染快照，不自行结算。
export const COMBAT_PANEL_ID = 'igs-combat-panel';
const PAUSE_REASON = 'panel:combat';
// 逐单位演出的最短间隔：没有命中演出的出手（如格挡、强化）也停留这么久，让行动顺序看得清。
const ACT_GAP_MS = 900;
// 面板命中演出的停留倍率：出招间隔、命中停留、击倒与结算一起放慢；段时长按放慢后的 totalMs 累计，无特写段与时间轴保持一致。
// 只作用于战斗面板，阅读器正文里的 [igs-fx:battle] 仍按演出风格的停留档位。
export const COMBAT_FX_HOLD_SCALE = 1.35;
// 相邻特写的进场间隔占前一个特写时长的比例：后一个在前一个开始淡出时进场。
const CUTIN_OVERLAP = 0.85;
// 行动条头像每段前进的时长（与样式里 left 过渡一致）；减少动态效果时为 0。
const TRACK_MOVE_MS = 500;
// 演出进行中卡面图到达时，隔多久再看一次演出是否结束。
const ART_REFRESH_DELAY_MS = 400;
// 鞭尸期间打空最后一名敌人：演出放完、倒下显示后停顿这么久，再自动结束回合判胜。
const COMBAT_FINISH_BEAT_MS = 700;
// 结果横幅（胜利 / 败北 / 撤退）在战斗面板里只是换结算画面的过渡：最后一次命中落下（含稀有度停顿）后隔 BEAT 出现，最多停留 LIFE（不随停留倍率放大）；
// 放到 SWAP 时换成结算画面，横幅叠在结算画面上淡出、结算标题同时落定，不等横幅完全消失再硬切。结算入场动画只在第一次画出结算后的 INTRO 内播。
const COMBAT_RESULT_BEAT_MS = 600;
const COMBAT_RESULT_LIFE_MS = 1700;
const COMBAT_RESULT_SWAP = 0.7;
const COMBAT_RESULT_INTRO_MS = 1300;
// 场外补位（v0.39.2）：倒下的敌人先退场（out），新敌人再从侧面入场（in）；鞭尸后才补显倒下的，多停 beat 再退场，让「击倒」飘字看得清。
// 时长与 combat-panel-style.js 的 igs-combat-swap-out / -in 一致；减少动态效果与低画质时直接换上，不播。
export const COMBAT_SWAP_MS = Object.freeze({ out: 520, in: 620, beat: 600 });

// 只改这一份演出计划里的结果横幅：提前到最后一次命中落下之后、缩短停留；没有命中的计划（鞭尸后自动结束回合）横幅时刻不变。阅读器正文的 [igs-fx:battle] 仍按原时长。
// landing 为 combatLandings 的结果（时刻从命中演出开始起算，与计划里的 at 同一起点），hold 为这一段的稀有度停顿。
export function combatResultBeat(plan, landing, hold = 0) {
    const events = Array.isArray(plan?.events) ? plan.events : [];
    const i = events.findIndex((e) => e.type === 'result');
    if (i < 0) return plan;
    const hits = events.some((e) => e.type === 'hit');
    const next = events.map((e, j) => {
        if (j !== i) return e;
        const at = hits ? Math.min(e.at, Math.round(Math.max(0, Number(landing?.last) || 0) + (Number(hold) || 0) + COMBAT_RESULT_BEAT_MS)) : e.at;
        return { ...e, at, life: Math.min(e.life, COMBAT_RESULT_LIFE_MS) };
    });
    return { ...plan, events: next, totalMs: Math.max(0, ...next.map((e) => e.at + e.life)) };
}
// 连续出牌的衔接：己方出牌最后一次命中落下（含稀有度停顿）后再隔这么久，排队的下一张开始结算；与受击反馈同长，上一击的抖动播完下一击才落。
export const COMBAT_CHAIN_MS = COMBAT_HIT_REACT_MS;

// 演出速度：1 原速、2 二倍速，由右上角按钮切换并记在 options.storage（键 igs:combat-fx-speed:v1，读写失败按原速）。
// 二倍速时 JS 时间轴（later 与 fx-battle 的计时）按倍率缩短，面板内有限次的样式动画、过渡与 WAAPI 动画按同一倍率播放，节点与动画同时结束。
export const COMBAT_FX_SPEEDS = Object.freeze([1, 2]);
const FX_SPEED_KEY = 'igs:combat-fx-speed:v1';
function readFxSpeed(storage) {
    try {
        const n = Number(storage?.getItem?.(FX_SPEED_KEY));
        return COMBAT_FX_SPEEDS.includes(n) ? n : 1;
    } catch (error) { return 1; }
}
function writeFxSpeed(storage, speed) {
    try { storage?.setItem?.(FX_SPEED_KEY, String(speed)); } catch (error) { /* 存不上只影响下次打开时的默认速度 */ }
}

export function createCombatPanelController(doc, options = {}) {
    let root = null;
    let stage = null;
    let fxSpeed = readFxSpeed(options.storage);
    let speedWatch = null;
    let pageOverlay = null;
    let previousFocus = null;
    let messageId = null;
    let token = 0;
    let pending = '';
    let notice = '';
    let selected = null;
    // v4 待选阶段：已选的候选牌实例（只在引擎 pending 属于操控角色时有内容）。
    let chosen = [];
    // 炉石式拖牌：drag 为按住中的手牌（拖过阈值后 live）；dropFrom 为松手打出时影子卡的位置；dragClickUntil 吞掉拖动结束后补发的 click。
    let drag = null;
    let dropFrom = null;
    let dragClickUntil = 0;
    // 指针所在的手牌（鼠标 / 触控笔悬停，触摸不记）：整块重绘换掉手牌节点后，新节点在浏览器补发悬停前没有 :hover，牌会先落回扇形再抬起；
    // 重绘时给这张牌加 .is-hover（与 :hover 同一抬起样式），指针离开手牌或面板时清掉。
    let hoverInst = '';
    // 道具按钮点开的道具列表（界面状态，不进会话）：点列表以外的地方、Esc、用掉道具或关闭面板时收起。
    let itemsOpen = false;
    let controlledId = null;
    // 对局中「重新开始」已点过一次、等待确认（v0.39.2）；任何其他操作、重开完成与开合面板时清除。
    let restartArmed = false;
    let fxSeq = 0;
    let rewards = null;
    let abort = null;
    // 上次渲染时的能量液面（0–1）；重绘后从这里过渡到新液面。
    let lastFill = null;
    // 卡面图订阅（打开时订阅、关闭时退订）：本地图片补载或生成完成后重绘手牌。
    let offCardArt = null;
    // 物品图订阅（P7d）：道具菜单显示本聊天物品图，补载或生成完成后与卡面同样重绘。
    let offItemArt = null;
    // 立绘读回订阅：素材库立绘（igs-gen:）按名字解析时可能还没读回，读回或丢失后显示中的立绘地址有变才重绘。
    let offPortraits = null;
    // 面板尺寸变化只移动原控件，不整块重绘或复制按钮。
    let stopDockWatch = null;
    // 点开的牌面数字加成详情（挂在面板根节点上，同一时刻最多一个）。
    let scaleTip = null;
    // 演出进行中推迟的卡面刷新（同一时刻最多一个计时器；不进 cutinTimers，清演出时不受影响）。
    let artTimer = null;
    const cutinTimers = new Set();
    const cutinNodes = new Set();
    // 打击感：命中落下前各单位显示的暂存血量（unitId → { hp, maxHp, alive, refs }）；整块重绘后按它补画。
    // 连续出牌时多条时间轴可能同时在播：同一单位只暂存一份，各条时间轴的命中按增量落到它上面；refs 为还没播完、动到它的时间轴条数，减到 0 才放回真实值。
    const held = new Map();
    // 场外补位：新敌人 id → { oldId, phase }。hold 期间这一格仍画倒下的旧敌人（命中与「击倒」照常落在它身上），out 为退场中；
    // 退场放完移到 entering（新敌人 id → 入场起点），入场放完移除。
    const swaps = new Map();
    const entering = new Map();
    // 上次画出的各单位意图、格挡与行动条头像：鞭尸期间被击倒、还没显示倒下的单位按它补画（引擎在倒下时已清掉这些）。
    const drawnLook = new Map();
    // 每次动作递增，作为动作身份：结算收尾（settle）与自动行动演出锁只认对应的那次动作；更早动作的时间轴照常播完、照常落下。
    let hitGen = 0;
    // 正在播的时间轴条数，以及排队等着播的时间轴：连续出牌与结束回合后的阶段按动作顺序逐条播放（引擎已逐个立即结算）。
    let live = 0;
    // 还没交棒的时间轴条数（见 playFx）：排队的动作等它归零才开始。
    let busy = 0;
    const waiting = [];
    // 结束战斗的那次动作：演出时间轴走完前仍按战斗画面重绘（敌方单位还在，最后一击的命中与飘字落得下去），走完后才换成结算画面；关闭面板时放弃。
    let settling = false;
    // 自动行动（队友与敌人）演出播放中：引擎在结束回合时已一次结算完，面板逐段回放；播完前不接受新的己方动作，免得旧演出接在新出牌之后播。
    // 己方出牌不加锁，不等上一张的演出播完就能出下一张；结束回合时立即加锁。值为该次动作的 hitGen，-1 表示空闲。
    let autoGen = -1;
    // 本次打开后是否已画过战前：只有第一次带入场动画（data-intro），选角色等重绘不重播；开合时重置。
    let lobbyShown = false;
    // 会话订阅（打开时订阅、关闭时退订）：后台准备结束、留档写入等异步变化到达时，状态或留档提示有变才重绘。
    let offSession = null;
    let drawnStatus = '';
    let drawnRecordError = '';
    // 翻牌进度只改 flip、不改状态：记下画过的翻牌视图，异步读到 offer、翻牌写入后有变化才重绘。
    let drawnFlip = '';
    // 画过的立绘地址（按名字）：立绘读回通知到达时与当前解析结果比较，相同不重绘。
    let drawnPortraits = '';
    // 已朝上的翻牌位置（按本场与套别）：只给刚翻开的牌出光效，重开面板、换上备用套后首次画出不出光效。
    let flipShown = null;
    // 本场结算画面第一次画出的时刻（按本场与结果）：入场动画据此只播一次，期间重绘按已过时间接着播；开合时重置。
    let resultShown = null;
    const flipSig = (v) => ((v?.status === 'ended' || v?.status === 'send-failed') && v.flip ? JSON.stringify(v.flip) : '');

    const session = () => (typeof options.getSession === 'function' ? options.getSession() : null);
    const reduced = () => {
        try { return typeof options.reducedMotion === 'function' ? options.reducedMotion() === true : prefersReducedMotion(); } catch (error) { return false; }
    };
    // 演出音效：宿主注入 playSfx(kind)（按「演出音效」开关与音量合成）；减少动态效果时与阅读器战斗演出一致，不出声。
    const sfx = (kind) => {
        if (!kind || typeof options.playSfx !== 'function' || reduced()) return;
        try { options.playSfx(kind); } catch (error) { /* 音效失败不影响演出 */ }
    };
    // 战斗音乐：打开时请宿主把配乐切到 battle 情绪，关闭时放回剧情配乐（options.setBattleMusic(overlay, on)；未注入时不动配乐）。
    const battleMusic = (overlay, on) => {
        if (!overlay || typeof options.setBattleMusic !== 'function') return;
        try { options.setBattleMusic(overlay, on); } catch (error) { /* 配乐失败不影响面板 */ }
    };
    const lowQuality = () => pageOverlay?.getAttribute?.('data-igs-quality') === 'low';
    // 按 data-unit 找单位块，不把 id 拼进选择器。
    const unitEl = (id) => [...(root?.querySelectorAll?.('.igs-combat-unit') || [])].find((n) => n.getAttribute?.('data-unit') === id) || null;
    // 按 data-combat-id 找手牌（影子卡去掉了该属性，不会被找到）。
    const cardEl = (inst) => [...(root?.querySelectorAll?.('.igs-combat-card') || [])].find((n) => n.getAttribute?.('data-combat-id') === String(inst)) || null;
    // 单位呼吸跟随 IGS「立绘活动 → 待机呼吸」（options.breathing 由宿主按阅读器设置给出）；减少动态效果时不呼吸，低画质由样式层按 #igs-overlay[data-igs-quality="low"] 停。
    const breathing = () => {
        try { return typeof options.breathing === 'function' && options.breathing() === true && !reduced(); } catch (error) { return false; }
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
    // 手牌卡面只读本地缓存（options.resolveCardImage，按卡 ID），同样只过滤协议；取不到时渲染层用线条 SVG。
    const cardArtFor = (cardId) => {
        let url = '';
        try { url = typeof options.resolveCardImage === 'function' ? options.resolveCardImage(cardId) : ''; } catch (error) { url = ''; }
        return safePortraitUrl(url);
    };
    // 道具菜单图标：按物品名读本聊天物品图本地缓存（与背包同键），取不到时渲染层用线条图标。
    const itemArtFor = (name) => {
        let url = '';
        try { url = typeof options.resolveItemImage === 'function' ? options.resolveItemImage(name) : ''; } catch (error) { url = ''; }
        return safePortraitUrl(url);
    };
    // 没有素材库立绘的敌人用通用敌人图集的一格；题材优先取本场遭遇标注（会话 theme），没有时随宿主注入的世界观（getFxSkin().worldview）；按名字去重，批量敌人共用原名推断的格位。
    const worldviewOf = () => {
        try { return String((typeof options.getFxSkin === 'function' ? options.getFxSkin() : null)?.worldview || ''); } catch (error) { return ''; }
    };
    const enemyArtFor = (foes, pics, theme) => {
        const out = {};
        const worldview = worldviewOf();
        for (const u of foes) {
            if (!u?.name || pics[u.name] || Object.hasOwn(out, u.name)) continue;
            out[u.name] = enemyArtCell({ art: u.art, name: u.name, tier: u.tier, worldview, theme });
        }
        return out;
    };

    // 暂存中的单位（命中还没落完，或鞭尸期间被击倒、还没显示倒下）按暂存血量与存活画进视图：重绘不提前露出结算后的血量或倒下；
    // 引擎在倒下时清掉的意图、格挡与行动条头像沿用上次画出的。
    function shownHeld(b) {
        const shown = (u) => {
            const e = held.get(u.id);
            if (!e) return u;
            const look = drawnLook.get(u.id);
            const revived = e.alive && !u.alive ? { intent: u.intent || look?.intent || null, block: look?.block || 0 } : {};
            return { ...u, hp: e.hp, alive: e.alive, ...revived };
        };
        b.allies = b.allies.map(shown);
        b.enemies = b.enemies.map(shown);
        for (const [id, e] of held) {
            const dot = drawnLook.get(id)?.dot;
            if (e.alive && dot && !b.track.some((t) => t.id === id)) b.track.push(dot);
        }
    }

    // 补位中的格子：hold / out 期间画旧敌人（out 带 data-swap 与已过时长），入场中的新敌人带 data-swap="in"；hold / out 期间新敌人不进行动条与顺序槽。
    function swapView(b, state) {
        const now = Date.now();
        b.enemies = b.enemies.map((u) => {
            const sw = swaps.get(u.id);
            if (sw && state?.units?.[sw.oldId]) {
                const old = unitView(state, sw.oldId);
                return sw.phase === 'out' ? { ...old, swap: 'out', swapT: now - sw.at } : old;
            }
            return entering.has(u.id) ? { ...u, swap: 'in', swapT: now - entering.get(u.id) } : u;
        });
        if (!swaps.size) return;
        b.track = b.track.filter((t) => !swaps.has(t.id));
        b.order = b.order.filter((o) => !swaps.has(o.id));
    }

    function snapshot() {
        const s = session();
        const cur = s ? s.state() : { status: 'unavailable' };
        // 留档写入失败只提示、不阻断：面板自己没有提示时显示留档原因。
        const view = { status: cur.status, reason: cur.reason || '', notice: notice || (cur.recordError ? combatReasonText(cur.recordError) : ''), pending, selected, controlledId, rewards };
        if (cur.status === 'blocked' && Array.isArray(cur.rejected)) {
            const lead = cur.rejected.find((r) => r?.fallback?.kind === 'blocked') || cur.rejected[0];
            view.cause = lead?.errors?.[0]?.reason || '';
        }
        if (cur.status === 'lobby') view.lobby = lobbyView(cur);
        if ((cur.status === 'battle' || cur.status === 'ended') && cur.battle) view.battle = battleView(cur.battle, cur.legal);
        // 重新开始：会话支持且处于对局中或非胜利结算时才写字段，其余状态视图形状不变。
        if (typeof s?.restart === 'function' && (cur.status === 'battle' || cur.status === 'ended') && cur.battle && cur.battle.outcome !== 'victory') view.canRestart = true;
        if (restartArmed) view.restartArmed = true;
        // 待选阶段：只保留仍在候选里的已选牌；不在待选阶段时清空，视图不写 chosen。
        const choice = view.battle?.choice;
        if (!choice) chosen = [];
        else { chosen = chosen.filter((i) => choice.options.includes(i)); view.chosen = chosen.slice(); }
        // 只在取到图时追加 artUrl：未生成卡面时手牌视图形状不变。
        if (view.battle) view.battle.hand = view.battle.hand.map((c) => { const artUrl = cardArtFor(c.id); return artUrl ? { ...c, artUrl } : c; });
        // 道具同样只在取到物品图时追加 imageUrl。
        if (view.battle) view.battle.items = view.battle.items.map((i) => { const imageUrl = itemArtFor(i.name); return imageUrl ? { ...i, imageUrl } : i; });
        if (view.battle && (swaps.size || entering.size)) swapView(view.battle, cur.battle);
        if (view.battle && held.size) shownHeld(view.battle);
        if (cur.status === 'ended' && cur.battle) view.end = endView(cur.battle, cur.events);
        if (settling) view.settling = true;
        // 演出速度只在二倍速时写进视图：原速时视图形状不变。
        if (fxSpeed > 1) view.fxSpeed = fxSpeed;
        const names = view.battle ? [...view.battle.allies, ...view.battle.enemies].map((u) => u.name)
            : view.lobby ? [...view.lobby.allies.map((a) => a.name), ...view.lobby.enemies.map((e) => e.name)] : [];
        view.portraits = portraitsFor(names);
        const foes = view.battle ? view.battle.enemies : view.lobby ? view.lobby.enemies : [];
        view.enemyArt = enemyArtFor(foes, view.portraits, cur.theme);
        // 我方立绘框色调：取立绘探测缓存里的 tint（整幅压到 25×25 后取最亮的不透明像素）；只在取到时追加 tints，未探测的由 probeTints 在绘制后补。
        if (view.lobby) {
            const tints = {};
            for (const a of view.lobby.allies) {
                const tint = cachedSprite(view.portraits[a.name])?.tint;
                if (tintTriplet(tint)) tints[a.name] = tint;
            }
            if (Object.keys(tints).length) view.tints = tints;
        }
        if (cur.status === 'send-failed' || cur.status === 'done') view.report = cur.report ? { result: cur.report.result } : null;
        // 胜利翻牌：读取中、读取失败、读到 offer 时追加 flip；没有 offer 时不追加（视图形状不变）。
        if ((cur.status === 'ended' || cur.status === 'send-failed') && cur.flip && cur.flip.status !== 'none') view.flip = cur.flip;
        view.encounter = cur.start?.encounter || cur.record?.encounter || '';
        return view;
    }

    function freshFlip(flip, combatId) {
        const key = `${combatId}|${flip.set}`;
        const up = flip.cards.filter((c) => c.faceUp).map((c) => c.position);
        const hit = flip.cards.filter((c) => c.flipped).map((c) => c.position);
        const prev = flipShown?.key === key ? flipShown : null;
        flipShown = { key, up, hit };
        // fresh：刚朝上（翻面入场）；struck：刚被自己翻开（出稀有度光效，透视已亮出的牌也算）。
        const fresh = prev ? up.filter((p) => !prev.up.includes(p)) : [];
        const struck = prev ? hit.filter((p) => !prev.hit.includes(p)) : [];
        return fresh.length || struck.length ? { ...flip, fresh, struck } : flip;
    }

    // 整块重绘会换掉单位块：重绘前把单位块上还在播的演出（飘字、受击形态）与受击反馈收起来，重绘后挂回同一单位的新节点，
    // 并按挪动前的播放进度接上（样式动画换了位置会从头再播）；连续出牌时上一张牌的演出不被下一张的重绘清掉。
    const UNIT_FX = '.igs-combat-float, .igs-combat-rarity-fx';
    const animationsOf = (n, subtree) => { try { return (subtree ? n?.getAnimations?.({ subtree: true }) : n?.getAnimations?.()) || []; } catch (error) { return []; } };
    function liftUnitFx() {
        const out = [];
        for (const el of root?.querySelectorAll?.('.igs-combat-unit') || []) {
            const id = el.getAttribute?.('data-unit');
            if (!id) continue;
            const nodes = [...(el.querySelectorAll?.(UNIT_FX) || [])].filter((n) => n.parentNode === el);
            const react = el.getAttribute?.(COMBAT_HIT_REACT_ATTR) || '';
            if (!nodes.length && !react) continue;
            const inside = (t) => nodes.some((n) => n === t || n.contains?.(t));
            out.push({
                id, react,
                nodes: nodes.map((n) => ({ n, times: animationsOf(n, true).map((a) => a.currentTime) })),
                own: react ? animationsOf(el, true).filter((a) => a.animationName && !inside(a.effect?.target)).map((a) => [a.animationName, a.currentTime]) : [],
            });
        }
        return out;
    }
    function restoreUnitFx(list) {
        const resume = (a, t) => { try { if (Number.isFinite(t)) a.currentTime = t; } catch (error) { /* 接不上就从头播 */ } };
        for (const item of list) {
            const el = unitEl(item.id);
            if (!el) continue;
            if (item.react) {
                el.setAttribute?.(COMBAT_HIT_REACT_ATTR, item.react);
                const saved = new Map();
                for (const [name, t] of item.own) { if (!saved.has(name)) saved.set(name, []); saved.get(name).push(t); }
                for (const a of animationsOf(el, true)) if (saved.get(a.animationName)?.length) resume(a, saved.get(a.animationName).shift());
                const react = item.react;
                later(() => { if (el.getAttribute?.(COMBAT_HIT_REACT_ATTR) === react) el.removeAttribute?.(COMBAT_HIT_REACT_ATTR); }, COMBAT_HIT_REACT_MS);
            }
            for (const { n, times } of item.nodes) {
                el.appendChild(n);
                animationsOf(n, true).forEach((a, i) => resume(a, times[i]));
            }
        }
    }

    function render() {
        if (!root) return;
        const body = root.querySelector?.('.igs-combat-body');
        if (!body) return;
        // 整块重绘会销毁当前焦点按钮：按 data-combat-act + data-combat-id 找回同一控件；找不到时落回面板本身（tabindex=-1，不画焦点环），焦点不丢出面板。
        const active = doc.activeElement;
        const had = Boolean(active && root.contains?.(active));
        const act = had ? active.getAttribute?.('data-combat-act') : null;
        const id = had ? active.getAttribute?.('data-combat-id') || '' : '';
        // 呼吸开关每次重绘按当前设置刷新（设置可能在面板打开期间改动）；属性值不变时不会让动画重新起步。
        if (breathing()) root.setAttribute?.('data-igs-combat-breathe', ''); else root.removeAttribute?.('data-igs-combat-breathe');
        // 减少动态效果：结算标题与光芒静态显示、不放粒子（样式层按根节点的 data-igs-combat-reduced 停动画）。
        if (reduced()) root.setAttribute?.('data-igs-combat-reduced', ''); else root.removeAttribute?.('data-igs-combat-reduced');
        const view = snapshot();
        if (view.flip?.status === 'ready') view.flip = freshFlip(view.flip, session()?.state().combatId);
        // 结算入场：根节点 data-igs-combat-result-in 期间样式层播入场动画，--igs-cb-result-t 为负的已过毫秒（重绘时动画与光芒旋转接着播，不从头来）；减少动态效果时不播。
        if (view.status === 'ended' && view.battle && view.end && !view.settling) {
            const key = `${session()?.state().combatId || ''}|${view.end.outcome}`;
            if (resultShown?.key !== key) resultShown = { key, at: Date.now() };
            const t = Math.max(0, Date.now() - resultShown.at);
            root.style?.setProperty?.('--igs-cb-result-t', `${-t}ms`);
            if (!reduced() && t < COMBAT_RESULT_INTRO_MS) root.setAttribute?.('data-igs-combat-result-in', '');
            else root.removeAttribute?.('data-igs-combat-result-in');
        } else root.removeAttribute?.('data-igs-combat-result-in');
        drawnStatus = view.status;
        if (view.battle) {
            drawnLook.clear();
            for (const u of [...view.battle.allies, ...view.battle.enemies]) drawnLook.set(u.id, { intent: u.intent, block: u.block, dot: view.battle.track.find((t) => t.id === u.id) || null });
        }
        try { const st = session()?.state(); drawnRecordError = st?.recordError || ''; drawnFlip = flipSig(st); } catch (error) { drawnRecordError = ''; drawnFlip = ''; }
        drawnPortraits = JSON.stringify(view.portraits || {});
        const lobbyDrawn = Boolean(view.lobby) && view.pending !== 'prepare';
        // 入场只在本次打开后第一次画战前时播；减少动态效果时不播（只留静态斜切）。
        if (lobbyDrawn && !lobbyShown && !reduced()) view.intro = true;
        // 点开的头像详情重绘后保持（选中的主动特性另由下面补上）。
        const keepUnit = scaleTip?.unit || null;
        hideScaleTip();
        const lifted = liftUnitFx();
        if (view.battle && hoverInst) view.hovered = hoverInst;
        if (view.battle && itemsOpen) view.itemsOpen = true;
        // 暂存中的单位已在 snapshot 里按暂存血量写进视图：新节点首帧就是显示值，不会先按结算后的血量算一次样式再补画（那样受击前血条会先跌再回弹）。
        body.innerHTML = renderCombatPanelHtml(view);
        restoreUnitFx(lifted);
        syncControlDock();
        if (view.intro) flashScreen();
        // 自己翻开神话：短暂停顿后全屏白闪（低画质不挂，减少动态效果时不闪）。
        if (!reduced() && view.flip?.struck?.some((p) => view.flip.cards.some((c) => c.position === p && c.slot?.rarity === 'mythic'))) flashScreen();
        if (lobbyDrawn) lobbyShown = true;
        if (view.lobby) probeTints(view);
        animateEnergy(body);
        markDrag();
        // 人物特性详情：选中的主动特性重绘后在圆球旁重新弹出（4b：点选即选中并弹详情；拖动圆球途中不弹）；否则点开的头像详情保持（单位此时可选为目标、头像不可点时收起）。
        if (view.battle && isSkillSelection(selected)) { if (!drag?.live) showTraitTip((t) => t.kind === 'active' && t.skillId === selectionSkillId(selected)); }
        else if (view.battle && keepUnit) showUnitTip(keepUnit);
        if (!had) return;
        const same = act ? [...(body.querySelectorAll?.(`[data-combat-act="${act}"]`) || [])].find((n) => (n.getAttribute('data-combat-id') || '') === id) : null;
        (same || root)?.focus?.();
    }

    function syncControlDock() {
        if (!root) return;
        const dock = root.querySelector('.igs-combat-dock');
        const core = root.querySelector('.igs-combat-hero-core');
        const figure = root.querySelector('.igs-combat-hero-figure');
        const width = root.clientWidth;
        const narrow = width > 0 && width <= 720;
        if (narrow) root.setAttribute('data-igs-combat-docked', '');
        else root.removeAttribute('data-igs-combat-docked');
        if (!dock || !core || !figure) return;
        const energy = root.querySelector('.igs-combat-energy');
        const controls = root.querySelector('.igs-combat-controls');
        const ring = root.querySelector('.igs-combat-trait-ring');
        const active = doc.activeElement;
        const restoreFocus = Boolean(active && (controls?.contains?.(active) || ring?.contains?.(active)));
        let moved = false;
        if (energy && energy.parentNode !== (narrow ? dock : figure)) {
            (narrow ? dock : figure).insertBefore(energy, (narrow ? dock : figure).firstChild);
            moved = true;
        }
        // 主动特性按钮组：宽面板挂在头像框节点里（样式排到头像右上方外侧）；窄面板竖向一排没有余高，移到停靠区能量之后、觉醒 / 道具之前。
        if (ring && ring.parentNode !== (narrow ? dock : figure)) {
            if (narrow) dock.insertBefore(ring, energy?.parentNode === dock ? energy.nextSibling : dock.firstChild);
            else figure.appendChild(ring);
            moved = true;
        }
        // 觉醒 / 道具：宽面板挂在头像框节点里（主动特性圆球组之后，样式排到头像左下方圆框外沿），窄面板移到停靠区最后。
        if (controls && controls.parentNode !== (narrow ? dock : figure)) {
            (narrow ? dock : figure).appendChild(controls);
            moved = true;
        }
        if (moved && restoreFocus) active.focus?.();
    }

    function watchControlDock() {
        const host = root;
        const win = doc.defaultView;
        const sync = () => { if (root === host) syncControlDock(); };
        if (typeof win?.ResizeObserver === 'function') {
            const observer = new win.ResizeObserver(sync);
            observer.observe(host);
            stopDockWatch = () => observer.disconnect();
        } else if (win?.addEventListener) {
            win.addEventListener('resize', sync);
            stopDockWatch = () => win.removeEventListener('resize', sync);
        }
    }

    function cachedSprite(url) {
        if (!url) return null;
        try { return peekSpriteHead(url, doc); } catch (error) { return null; }
    }

    // 战前我方框补色：缓存里没有的立绘各探测一次（探测按地址去重，读不到图的不再重试）；结果到了只给本次打开中仍显示同一张图的框写色调变量，不整块重绘，入场动画与焦点不受影响。
    function probeTints(view) {
        const mine = token;
        for (const a of view.lobby.allies) {
            const url = view.portraits[a.name];
            if (!url || cachedSprite(url)) continue;
            let job;
            try { job = probeSpriteHead(url, doc); } catch (error) { continue; }
            Promise.resolve(job).then((probed) => paintTint(mine, url, probed && probed.tint), () => null);
        }
    }

    function paintTint(mine, url, tint) {
        const value = tintTriplet(tint);
        if (!value || !root || token !== mine) return;
        for (const fig of root.querySelectorAll?.('.igs-combat-lobby-figure[data-side="ally"]') || []) {
            if (fig.querySelector?.('img')?.getAttribute?.('src') === url) fig.style?.setProperty?.('--igs-combat-ally-tint', value);
        }
    }

    // 能量液面：整块重绘会重建节点，CSS 过渡不起作用；用 WAAPI 从上次液面过渡到新液面（用掉多少降多少）。
    // 减少动态效果、低画质或首次渲染时直接到位；动画不留填充，结束后由样式里的 --fill 决定液面。
    function animateEnergy(body) {
        const orb = body.querySelector?.('.igs-combat-energy-orb');
        const liquid = orb?.querySelector?.('.igs-combat-energy-liquid');
        const fill = orb ? Number(orb.style?.getPropertyValue?.('--fill')) : NaN;
        const prev = lastFill;
        lastFill = Number.isFinite(fill) ? fill : null;
        if (!liquid || lastFill === null || prev === null || prev === lastFill || typeof liquid.animate !== 'function') return;
        if (reduced() || pageOverlay?.getAttribute?.('data-igs-quality') === 'low') return;
        const sink = orb.parentNode?.classList?.contains?.('is-empty') ? 8 : 0;
        try {
            liquid.animate([{ transform: `translateY(${((1 - prev) * 100).toFixed(1)}%)` }, { transform: `translateY(calc(${((1 - lastFill) * 100).toFixed(1)}% + ${sink}px))` }],
                { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)' });
        } catch (error) { /* 不支持时直接到位 */ }
    }

    const say = (r) => { notice = r && r.ok === false ? combatReasonText(r.reason) : ''; };

    // 演出计时：按当前演出速度缩短（原速时毫秒数不变）；fx-battle 的命中演出用同一个 fxSchedule。
    const baseSchedule = (f, t) => (typeof options.schedule === 'function' ? options.schedule(f, t) : setTimeout(f, t));
    const fxSchedule = (f, t) => baseSchedule(f, fxSpeed > 1 && Number.isFinite(t) ? Math.round(t / fxSpeed) : t);
    const later = (fn, ms) => {
        const timer = fxSchedule(() => { cutinTimers.delete(timer); fn(); }, ms);
        cutinTimers.add(timer);
        return timer;
    };

    // 二倍速：面板内有限次的样式动画、过渡与 WAAPI 动画（含伪元素）按倍率播放，无限循环的（呼吸、条纹等）保持原速；
    // 打开期间观察面板子树，新节点、类名与属性变化后补设。环境不支持 getAnimations / MutationObserver 时只缩短计时。
    function boostAnimations() {
        if (!root || typeof root.getAnimations !== 'function') return;
        let list = [];
        try { list = root.getAnimations({ subtree: true }); } catch (error) { return; }
        for (const a of list) {
            try {
                const rate = a.effect?.getTiming?.().iterations === Infinity ? 1 : fxSpeed;
                if (a.playbackRate !== rate) a.playbackRate = rate;
            } catch (error) { /* 单个动画设不上不影响其余 */ }
        }
    }

    function syncSpeedWatch() {
        const Observer = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
        if (fxSpeed > 1 && root && !speedWatch && typeof Observer === 'function') {
            speedWatch = new Observer(() => boostAnimations());
            speedWatch.observe(root, { childList: true, subtree: true, attributes: true });
        } else if (fxSpeed <= 1 && speedWatch) {
            speedWatch.disconnect();
            speedWatch = null;
        }
        boostAnimations();
    }

    // 演出速度按钮：原速与二倍速切换并记住；演出进行中也能切换（不受演出锁限制）。正在播的动画立即换速，已排上的计时按排时的倍率走完。
    // 只改按钮状态、不整块重绘，避免打断正在播的演出。
    function toggleSpeed() {
        fxSpeed = fxSpeed > 1 ? 1 : 2;
        writeFxSpeed(options.storage, fxSpeed);
        root?.querySelector?.('[data-combat-act="speed"]')?.setAttribute?.('aria-pressed', fxSpeed > 1 ? 'true' : 'false');
        syncSpeedWatch();
        return { ok: true, speed: fxSpeed };
    }

    // 卡面图到达时刷新手牌：结算中不刷新（结算结束的重绘会带上新卡面）；演出计时器未走完时整块重绘会打断行动条与特写，推迟到演出结束。
    function onCardArtUpdated() {
        if (!root || pending || artTimer !== null) return;
        if (!cutinTimers.size) { render(); return; }
        const schedule = typeof options.schedule === 'function' ? options.schedule : (f, t) => setTimeout(f, t);
        artTimer = schedule(() => { artTimer = null; onCardArtUpdated(); }, ART_REFRESH_DELAY_MS);
    }

    // 立绘读回（或丢失）通知：重算显示中的立绘地址，有变化才按卡面刷新的规则重绘；动作进行中、结算演出未走完时由那次收尾重绘。
    function onPortraitsUpdated() {
        if (!root || pending || settling) return;
        let next = '';
        try { next = JSON.stringify(snapshot().portraits || {}); } catch (error) { return; }
        if (next !== drawnPortraits) onCardArtUpdated();
    }

    // 会话异步变化（后台准备结束、留档写入结果）：面板自己的动作进行中时由那次动作收尾重绘；结算演出未走完时由结算收尾重绘；
    // 状态与留档提示都没变时不重绘，有演出计时器时与卡面刷新一样推迟到演出结束。
    function onSessionChanged(v) {
        if (!root || pending) return;
        if (v?.lobby && !controlledId) controlledId = v.lobby.heroId;
        if (v?.status === drawnStatus && (v?.recordError || '') === drawnRecordError && flipSig(v) === drawnFlip) return;
        if (settling) return;
        onCardArtUpdated();
        if (v?.status === 'done') loadRewards();
    }

    function clearCutins() {
        const clear = typeof options.clear === 'function' ? options.clear : (t) => clearTimeout(t);
        for (const timer of cutinTimers) clear(timer);
        cutinTimers.clear();
        live = 0;
        busy = 0;
        waiting.length = 0;
        for (const n of cutinNodes) n.remove?.();
        cutinNodes.clear();
        root?.removeAttribute?.('data-igs-combat-hold');
        root?.removeAttribute?.('data-igs-combat-shake');
        if (stage) markCaption(stage, null);
    }

    // 战前入场白闪：挂在面板根节点（与 .igs-combat-body / .igs-combat-fx 并列），铺满整个面板而不只是舞台；
    // 低画质不挂，减少动态效果时不会进入这里（不播入场）；播完（样式延迟 .48s + 时长 .42s）移除，关闭面板时随演出节点一起清掉。
    function flashScreen() {
        if (!root || lowQuality() || typeof doc.createElement !== 'function') return;
        const el = doc.createElement('span');
        el.className = 'igs-combat-lobby-flash';
        el.setAttribute?.('aria-hidden', 'true');
        root.appendChild(el);
        cutinNodes.add(el);
        later(() => { el.remove?.(); cutinNodes.delete(el); }, 900);
    }

    // 特写：独立命名空间的二次元式 cut-in（combat-cutin.js），不复用阅读器 [igs-fx:cutin] 的节点与样式。
    // 技能特写：暗幕 + 速度线 + 斜向色带 + 半身立绘运镜 + 角色名与招式名；主角人物技能与队友技能各播一次（敌方技能不播），没有立绘时不播。
    function showCutin(host, c, url, probed) {
        if (stage !== host) return;
        const layers = ensureFxLayers(host);
        if (!layers?.front) return;
        const low = pageOverlay?.getAttribute?.('data-igs-quality') === 'low';
        preloadCutinFonts(doc, c.skill || c.name);
        const el = buildSkillCutin(doc, { name: c.name, skill: c.skill, url, probed, reduced: reduced(), low });
        layers.front.appendChild(el);
        sfx('battle-cutin');
        cutinNodes.add(el);
        later(() => { el.remove?.(); cutinNodes.delete(el); }, COMBAT_CUTIN_MS.skill);
    }

    // 觉醒特写（方案 A，节点见 combat-cutin.js 的 buildAwakenCutin）：头位可信时先切眼部斜切条再接主段，全长 COMBAT_CUTIN_MS.awaken；没有立绘时只放色幕、斜带与字幕。
    // 收尾闪白时整面板向下震一下（减少动态效果与低画质不震）。台词来自正文，只经 textContent 写入。
    function showAwakenCutin(host, c, url, probed) {
        if (stage !== host) return;
        const layers = ensureFxLayers(host);
        if (!layers?.front) return;
        const life = COMBAT_CUTIN_MS.awaken;
        const isReduced = reduced();
        const low = pageOverlay?.getAttribute?.('data-igs-quality') === 'low';
        preloadCutinFonts(doc, `觉醒·${c.skill || ''}`);
        const el = buildAwakenCutin(doc, { name: c.name, skill: c.skill, line: c.line, awakenType: c.awakenType, url, probed, reduced: isReduced, low });
        layers.front.appendChild(el);
        sfx('battle-awaken');
        cutinNodes.add(el);
        const panelEl = root;
        if (!isReduced && !low && panelEl) {
            later(() => { if (root === panelEl && stage === host) shakePanel(panelEl, { x: 0, y: 1 }, 6, 'awaken'); }, Math.round(life * COMBAT_AWAKEN_END));
        }
        later(() => { el.remove?.(); cutinNodes.delete(el); }, life);
    }

    // 开战过场：「开战」大字停留 COMBAT_CUTIN_MS.opening，返回停留时长；减少动态效果或没有演出层时不播，返回 0。不画速度线；低画质不闪白。
    function showOpening() {
        if (reduced() || !stage) return 0;
        const layers = ensureFxLayers(stage);
        if (!layers?.front) return 0;
        const el = buildOpeningCutin(doc, { low: lowQuality() });
        layers.front.appendChild(el);
        cutinNodes.add(el);
        later(() => { el.remove?.(); cutinNodes.delete(el); }, COMBAT_CUTIN_MS.opening);
        return COMBAT_CUTIN_MS.opening;
    }

    // 本段要播的特写与时间轴：觉醒总是播放，技能特写只在取到立绘时播放；逐个首尾相接（后一个在前一个开始淡出时进场）。
    // span 为整段特写占用的时长；lead 为命中演出相对出手的延后，落在最后一个特写开始淡出时。没有特写时二者为 0，节奏与旧版一致。
    function planCutins(events, battle) {
        const items = [];
        let t = 0;
        for (const c of combatCutins(events, battle)) {
            const url = portraitsFor([c.name])[c.name];
            if (c.kind !== 'awaken' && !url) continue;
            const ms = c.kind === 'awaken' ? COMBAT_CUTIN_MS.awaken : COMBAT_CUTIN_MS.skill;
            items.push({ c, url, delay: t, ms });
            t += Math.round(ms * CUTIN_OVERLAP);
        }
        const last = items[items.length - 1];
        return { items, span: last ? last.delay + last.ms : 0, lead: last ? last.delay + Math.round(last.ms * CUTIN_OVERLAP) : 0 };
    }

    // 时间轴从出手起算，不等立绘探测：出手时先发起头位探测（结果按地址缓存），到点时取缓存；仍未就绪最多再等 waitSpriteHead 的上限，
    // 超时或失败按默认头位取较宽景。面板关闭或重开后，到点的计时器与迟到的探测结果都丢弃。
    function playCutins(cuts, host, my) {
        const live = () => my === token && stage === host;
        const show = (c, url, probed) => {
            if (!live()) return;
            if (c.kind === 'awaken') showAwakenCutin(host, c, url, probed); else showCutin(host, c, url, probed);
        };
        for (const { url } of cuts.items) {
            if (!url) continue;
            try { Promise.resolve(probeSpriteHead(url, doc)).catch(() => null); } catch (error) { /* 到点时按默认头位 */ }
        }
        for (const { c, url, delay } of cuts.items) {
            const fire = () => {
                if (!live()) return;
                if (!url) { show(c, url, null); return; }
                let wait;
                try { wait = waitSpriteHead(url, doc, later); } catch (error) { show(c, url, null); return; }
                Promise.resolve(wait).then((probed) => show(c, url, probed || null), () => show(c, url, null));
            };
            if (delay > 0) later(fire, delay); else fire();
        }
    }

    // 出手分段：引擎在每个自动行动单位出手前发 act 事件，操控角色回合开始发 turn-start；按这两种边界切成逐单位的段，段内带该时刻的行动条进度快照。
    function fxSegments(events) {
        const segs = [];
        let cur = { actor: null, track: null, events: [] };
        for (const e of events) {
            const boundary = e.type === 'act' || (e.type === 'turn-start' && cur.actor);
            if (boundary && cur.events.length) { segs.push(cur); cur = { actor: null, track: null, events: [] }; }
            if (e.type === 'act') cur.actor = e.unitId;
            if ((e.type === 'act' || e.type === 'turn-start') && e.track) cur.track = e.track;
            cur.events.push(e);
        }
        if (cur.events.length) segs.push(cur);
        return segs;
    }

    // 行动条头像：动画开始时取当前节点；之后整块重绘会换掉节点，旧动画只作用在已脱离的节点上，不干扰新画面。
    function trackDots() {
        const map = new Map();
        for (const n of root?.querySelectorAll?.('.igs-combat-track-dot') || []) map.set(n.getAttribute?.('data-unit'), n);
        return map;
    }

    // 把头像移到进度快照位置；animate 为 false 时瞬移（出手者回到起点、动画起点就位）。
    function placeDots(dots, snap, animate) {
        for (const [id, p] of Object.entries(snap || {})) {
            const n = dots.get(id);
            if (!n?.style?.setProperty) continue;
            n.classList?.toggle?.('is-snap', !animate);
            n.style.setProperty('--p', String(p));
            if (!animate) void n.offsetWidth;
        }
    }

    // 正在出手的单位（立绘与行动条头像）外发光；actor 为 null 时清除。
    function markActing(actor) {
        for (const n of root?.querySelectorAll?.('.igs-combat-unit.is-acting') || []) n.classList?.remove('is-acting');
        for (const n of root?.querySelectorAll?.('.igs-combat-track-dot.is-acting') || []) n.classList?.remove('is-acting');
        if (!actor) return;
        root?.querySelector?.(`.igs-combat-unit[data-unit="${actor}"]`)?.classList?.add('is-acting');
        root?.querySelector?.(`.igs-combat-track-dot[data-unit="${actor}"]`)?.classList?.add('is-acting');
    }

    function rarityNodes(host, fx, phase) {
        const nodes = showRarityFx(doc, host, fx, phase, { schedule: (fn, ms) => later(() => {
            fn(); for (const node of nodes) cutinNodes.delete(node);
        }, ms) });
        for (const node of nodes) cutinNodes.add(node);
    }

    // 前摇节点挂在演出前层中间，由面板登记清理。
    function windupNodes(host, windup, aim) {
        const front = ensureFxLayers(host)?.front;
        const nodes = showWindupFx(doc, front, windup, { ...aim, schedule: (fn, ms) => later(() => {
            fn(); for (const node of nodes) cutinNodes.delete(node);
        }, ms) });
        for (const node of nodes) cutinNodes.add(node);
    }

    // 前摇朝向：前摇开始时量（飞卡已落定），从演出前层的前摇中心指向受击单位。angle / reach 指向各受击单位的平均中心；
    // 受击单位不止一个时 rays 为每个单位各自的朝向与距离（射击一单位一道弹道）；多段攻击一段一道，带该段相对第一段的错开时长（landing 见 combatLandings）。
    // 量不到时敌方出手朝下、我方朝上。
    function windupAim(host, marks, actorId, landing) {
        const box = ensureFxLayers(host)?.front?.getBoundingClientRect?.();
        const rects = marks.filter((m) => m.unitId !== actorId).map((m) => unitEl(m.unitId)?.getBoundingClientRect?.()).filter((r) => r?.width);
        if (box?.width && rects.length) {
            const cx = box.left + box.width / 2;
            const cy = box.top + box.height * 0.46;
            const toward = (x, y) => ({ angle: (Math.atan2(y, x) * 180) / Math.PI, reach: Math.hypot(x, y) });
            const x = rects.reduce((s, r) => s + r.left + r.width / 2, 0) / rects.length - cx;
            const y = rects.reduce((s, r) => s + r.top + r.height / 2, 0) / rects.length - cy;
            const aim = toward(x, y);
            const centerOf = (id) => {
                const r = unitEl(id)?.getBoundingClientRect?.();
                return r?.width ? toward(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy) : null;
            };
            const waves = volleyTargets(marks, landing, actorId);
            if (waves.length) aim.rays = waves.map((w) => { const t = centerOf(w.unitId); return t ? { ...t, delay: w.delay } : null; }).filter(Boolean);
            else if (rects.length > 1) aim.rays = rects.map((r) => toward(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy));
            return aim;
        }
        const actor = session()?.state()?.battle?.units?.[actorId];
        return { angle: actor?.side === 'enemy' ? 90 : -90, reach: 0 };
    }

    // 招式条按稀有度上色：舞台带 data-igs-rarity 与 --igs-rarity-caption 时，fx-battle 的招式名取稀有度色；普通牌、没有命中的段与段结束时清掉。
    function markCaption(host, fx) {
        if (!host) return;
        if (fx?.rank && fx.color) {
            host.setAttribute('data-igs-rarity', fx.rarity);
            host.style?.setProperty?.('--igs-rarity-caption', fx.color);
        } else {
            host.removeAttribute('data-igs-rarity');
            host.style?.removeProperty?.('--igs-rarity-caption');
        }
    }

    // 命中停顿与定向震屏：稀有及以上的牌第一次命中时，受击立绘停在受击首帧 hold 毫秒（data-igs-combat-hold，样式只暂停受击动画）；
    // 停顿结束后整面板朝出手方向推一下再回弹（--igs-shake-x / -y 为方向，--shake 为幅度），同时出分档冲击声。低画质不震屏，减少动态效果不停顿、不震、不出声。
    function rarityImpact(fx, targetId) {
        if (!root || !fx?.rank) return;
        const el = root;
        if (fx.hold) {
            el.setAttribute('data-igs-combat-hold', '');
            later(() => el.removeAttribute('data-igs-combat-hold'), fx.hold);
        }
        later(() => {
            if (root !== el) return;
            if (fx.shake) shakePanel(el, strikeDirection(fx.unitId, targetId), fx.shake, fx.rank);
            sfx(fx.sfx);
        }, fx.hold);
    }

    // 整面板朝 dir 方向推一下再回弹（--igs-shake-x / -y 为方向，--shake 为幅度，data-igs-combat-shake 为档位，380ms 后撤掉）；稀有命中与觉醒收尾共用。
    function shakePanel(el, dir, px, rank) {
        el.removeAttribute('data-igs-combat-shake');
        el.style?.setProperty?.('--igs-shake-x', dir.x.toFixed(2));
        el.style?.setProperty?.('--igs-shake-y', dir.y.toFixed(2));
        el.style?.setProperty?.('--shake', `${px}px`);
        void el.offsetWidth;
        el.setAttribute('data-igs-combat-shake', String(rank));
        later(() => el.removeAttribute('data-igs-combat-shake'), 380);
    }

    // 震屏方向：出手单位中心指向受击单位中心的单位向量；量不到时按受击方是敌人（在上）或我方（在下）给斜向默认值。
    function strikeDirection(fromId, toId) {
        const a = fromId ? unitEl(fromId)?.getBoundingClientRect?.() : null;
        const b = toId ? unitEl(toId)?.getBoundingClientRect?.() : null;
        if (a?.width && b?.width) {
            const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
            const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
            const len = Math.hypot(dx, dy);
            if (len > 1) return { x: dx / len, y: dy / len };
        }
        const foe = session()?.state()?.battle?.units?.[toId]?.side === 'enemy';
        return foe ? { x: 0.6, y: -0.8 } : { x: -0.6, y: 0.8 };
    }

    // 引擎事件 → 行动条推进 + fx-battle 演出。逐段串行：头像沿线前进到该段快照（出手者到达出手点）→ 暂停移动、播出手演出（至少 ACT_GAP_MS）→ 出手者回到起点 → 下一段。
    // from 为动作前的进度（结束回合时操控角色已回到起点）；fly 为出牌飞行卡的时长（第一段命中等它飞到再落下）；每段演出用递增页号作身份。
    // gen 为这次动作的身份（hitGen），ids 为这次动作暂存的单位（holdUnits 的返回值），时间轴走完时各减一次引用。
    function playFx(events, { start = false, from = null, fly = 0, gen = hitGen, held: ids = [] } = {}) {
        const cur = session()?.state();
        // 没有演出可播：照样收尾，并让排在后面的时间轴接着播。
        if (!stage || !cur?.battle || !events?.length) { if (autoGen === gen) setAuto(-1); releaseHeld(ids); if (!busy) advance(); settle(gen); return; }
        const foe = cur.start?.enemies?.[0]?.name || '';
        const skin = typeof options.getFxSkin === 'function' ? options.getFxSkin() || {} : {};
        const my = token;
        const host = stage;
        // 开局演出（start）不进出牌队列：开战标题还在播时出的牌照常立即演出；其余时间轴按动作顺序逐条播放。
        const counted = !start;
        if (counted) { live += 1; busy += 1; }
        const dots = trackDots();
        const move = reduced() ? 0 : TRACK_MOVE_MS;
        if (from && dots.size) placeDots(dots, from, false);
        let at = 0;
        // 结束战斗的那次动作：结果横幅放到 COMBAT_RESULT_SWAP 时换结算画面的时刻（-1 为这条时间轴没有结果横幅）。
        let swapAt = -1;
        const segs = fxSegments(events);
        const fxOptions = { reduced: reduced(), low: lowQuality() };
        // 队友与敌人出手的演出加锁（含开局敌方先手）；己方出牌不加锁。
        const auto = segs.some(g => g.actor);
        if (auto) setAuto(gen);
        // 交棒时刻（己方出牌）：各段最后一次命中落下、停顿之后再隔 COMBAT_CHAIN_MS；有特写或中间横幅时等它们播完。
        let handoff = 0;
        segs.forEach((seg, i) => {
            const fx = combatFxSource(seg.events, cur.battle, { start: start && i === 0, foe, title: cur.start?.encounter || '' });
            fxSeq += 1;
            const plan = planBattleFx(fx, { settings: { enabled: true, letterbox: false }, holdScale: COMBAT_FX_HOLD_SCALE, identity: { chatId: 'igs-combat', messageId: cur.combatId || '', swipeId: 0, page: fxSeq } });
            if (seg.track && dots.size) {
                if (i === 0 && !seg.actor) placeDots(dots, seg.track, false);
                else {
                    const snap = seg.track;
                    later(() => { if (my === token) placeDots(dots, snap, true); }, Math.max(at, 1));
                    at += move;
                }
            }
            // 有特写时先播特写，命中演出在最后一个特写开始淡出时落下；这一段的停留时长覆盖特写与命中两者。
            // 出牌飞行卡只在第一段：命中等影子卡飞到目标后落下。没有特写也不飞时 lead / span 为 0，节奏与旧版一致。
            const cuts = planCutins(seg.events, cur.battle);
            const marks = combatHitMarks(seg.events);
            const rarity = playedCardFx(seg.events, cur.battle, fxOptions);
            // 本段有命中演出时招式条（顶部卡名）已报出卡名，只给它按稀有度上色，不在画面中间重复横幅；没有命中（格挡、强化等）才用中间横幅。
            const caption = (plan.events || []).some(e => e.type === 'hit');
            const banner = rarity.banner && !caption;
            // 远程、施法与范围攻击：飞卡、特写与横幅之后在画面中间出前摇（射击 / 吟唱 / 横扫），前摇结束时命中落到受击单位上；
            // 单体近战没有前摇，命中直接落在受击单位上。减少动态效果与低画质没有前摇。
            const windup = windupFx(rarity);
            const before = Math.max(cuts.lead, i === 0 ? fly : 0, banner ? 300 : 0);
            const lead = before + (windup ? windup.ms : 0);
            // 命中落点：多段攻击按段依次落下，最后一次落下可能晚于计划里最后一次命中（landing.extra）。
            const landing = combatLandings(fx, plan);
            const lastHit = landing.last;
            const shown = combatResultBeat(plan, landing, rarity.hold || 0);
            // 停顿发生在第一次命中落下时，段长覆盖最后一次落下 + 停顿 + 命中光效。
            const span = Math.max(cuts.span, i === 0 ? fly : 0, rarity.life ? lead + lastHit + rarity.hold + rarity.life : 0);
            // 多段攻击第二段起每段补一声命中（第一段的声音由命中演出发出）。
            const onWave = (event, list) => sfx(battleSfxKind({ ...event, result: list.some((m) => m.kind === 'damage' || m.kind === 'ko') ? 'hit' : 'guard' }, String(skin.worldview || '')));
            const hit = () => {
                if (my !== token || stage !== host) return;
                try { applyBattleFxToDom(stage, shown, { ...skin, reducedMotion: reduced(), schedule: fxSchedule, clear: options.clear, onEvent: (event) => sfx(battleSfxKind(event, String(skin.worldview || ''))) }); } catch (error) { /* 演出失败不影响结算 */ }
                // overkill 战斗里己方出牌的击倒推迟到全部演出放完才显示（鞭尸）。
                try { landMarks(marks, landing, my, rarity, onWave, !seg.actor && cur.battle.overkill === true); } catch (error) { /* 演出失败不影响结算 */ }
            };
            const run = () => {
                if (my !== token || stage !== host) return;
                try {
                    markActing(seg.actor);
                    playCutins(cuts, host, my);
                    markCaption(host, caption ? rarity : null);
                    if (banner) rarityNodes(ensureFxLayers(host).front, rarity, 'play');
                    if (windup) {
                        const show = () => {
                            if (my !== token || stage !== host) return;
                            try { windupNodes(host, windup, windupAim(host, marks, rarity.unitId, landing)); } catch (error) {/* 演出失败不影响结算 */ }
                        };
                        if (before) later(show, before); else show();
                    }
                } catch (error) { /* 演出失败不影响结算 */ }
                if (lead) later(hit, lead); else hit();
            };
            if (at === 0) run(); else later(run, at);
            const body = lead + (shown.totalMs || 0) + landing.extra;
            const ribbon = (shown.events || []).find((e) => e.type === 'result');
            if (ribbon) swapAt = at + lead + ribbon.at + Math.round(ribbon.life * COMBAT_RESULT_SWAP);
            handoff = Math.max(handoff, at + Math.max(lead + lastHit + (rarity.hold || 0) + COMBAT_CHAIN_MS, cuts.span, banner ? span : 0));
            at += seg.actor ? Math.max(ACT_GAP_MS, body, span) : Math.max(body, span);
            if (seg.actor && dots.size) {
                const actor = seg.actor;
                later(() => { if (my === token) placeDots(dots, { [actor]: 0 }, false); }, Math.max(at, 1));
            }
        });
        // 横幅放到 COMBAT_RESULT_SWAP 就换结算画面（横幅在结算画面上淡出）；时间轴走完时的 settle 不再重复换。
        if (swapAt >= 0) later(() => { if (my === token && stage === host) settle(gen); }, Math.max(swapAt, 1));
        // 交棒：这条时间轴的命中都已落下，放回暂存血量，排队的下一条随即开始；自己的招式条、飘字与受击反馈照常播完。
        // 己方出牌在 handoff 交棒，含队友或敌人出手的时间轴走完才交棒；只交一次。
        let handed = !counted;
        const handOver = () => {
            if (handed) return;
            handed = true;
            releaseHeld(ids);
            busy = Math.max(0, busy - 1);
            if (!busy) advance();
        };
        if (counted && !auto && handoff < at) later(() => { if (my === token && stage === host) handOver(); }, Math.max(handoff, 1));
        later(() => {
            if (autoGen === gen) setAuto(-1);
            if (my !== token || stage !== host) return;
            if (counted) { handOver(); finishTimeline(); }
            else { releaseHeld(ids); if (!live) { markActing(null); markCaption(stage, null); } }
            settle(gen);
        }, Math.max(at, 1));
    }

    // 自动行动演出锁：根节点带 data-igs-combat-auto 时底栏不接收点击（样式层），act 拒绝新动作。
    function setAuto(gen) {
        autoGen = gen;
        if (gen >= 0) root?.setAttribute?.('data-igs-combat-auto', '');
        else root?.removeAttribute?.('data-igs-combat-auto');
    }

    // 一条时间轴播完：都播完时清掉出手外发光与招式条颜色（排队的下一条已在交棒时开始，队列放完由 advance 走 drained）。
    function finishTimeline() {
        live = Math.max(0, live - 1);
        if (live) return;
        markActing(null);
        if (stage) markCaption(stage, null);
    }

    function advance() {
        const next = waiting.shift();
        if (!next) { drained(); return; }
        // 排在后面的是结束回合 / 撤退：出牌的演出已全部放完，先让鞭尸期间被击倒的单位倒下，停顿片刻再播后面的阶段（否则直接判胜会跳过倒下）。
        if (next.reveal && revealDowns()) {
            const my = token;
            later(() => { if (my === token) next(); }, reduced() ? 0 : COMBAT_FINISH_BEAT_MS);
        } else next();
    }

    // 鞭尸期间被击倒、还没显示倒下的单位此时倒下：重绘（不再能被选为目标）并出「击倒」飘字；返回是否有单位倒下。
    function revealDowns() {
        const downs = [...held].filter(([, e]) => e.ko && !(e.refs > 0)).map(([id]) => id);
        if (!downs.length) return false;
        for (const id of downs) held.delete(id);
        render();
        for (const id of downs) showHitFloats(doc, unitEl(id), [{ kind: 'ko' }], { reduced: reduced(), schedule: later });
        // 刚补显倒下的旧敌人：停 beat 让「击倒」飘字看清再退场。
        let beat = false;
        for (const sw of swaps.values()) if (sw.phase === 'hold' && downs.includes(sw.oldId)) { sw.beat = true; beat = true; }
        if (beat) {
            const my = token;
            later(() => { if (my !== token) return; for (const sw of swaps.values()) sw.beat = false; startLeaves(); }, COMBAT_SWAP_MS.beat);
        }
        return true;
    }

    // 演出全部放完：鞭尸期间被击倒的单位倒下；敌人已全灭时停顿片刻后自动结束回合判胜。
    function drained() {
        revealDowns();
        startLeaves();
        maybeFinish();
    }

    // 补位退场：旧敌人的暂存已放回（命中与倒下都落完）时开始退场，放完换上新敌人并播入场。
    function startLeaves() {
        for (const [id, sw] of swaps) {
            if (sw.phase !== 'hold' || sw.beat || held.has(sw.oldId)) continue;
            sw.phase = 'out';
            sw.at = Date.now();
            render();
            const my = token;
            later(() => {
                if (my !== token || swaps.get(id) !== sw) return;
                swaps.delete(id);
                entering.set(id, Date.now());
                render();
                later(() => {
                    if (my !== token || !entering.has(id)) return;
                    entering.delete(id);
                    unitEl(id)?.removeAttribute?.('data-swap');
                }, COMBAT_SWAP_MS.in);
            }, COMBAT_SWAP_MS.out);
        }
    }

    // 登记本次动作里的补位；被换下的本身还没入场（同一轮接连倒下）时，原来那名旧敌人直接接到最新补上的。
    function noteSwaps(events) {
        for (const e of events || []) {
            if (e.type !== 'reinforce' || !e.unitId || !e.replaced) continue;
            const prev = swaps.get(e.replaced);
            swaps.delete(e.replaced);
            entering.delete(e.replaced);
            swaps.set(e.unitId, { oldId: prev ? prev.oldId : e.replaced, phase: 'hold' });
        }
    }

    // overkill 战斗在出牌阶段敌人已全灭、没有演出在播：加演出锁，停顿后发出结束回合（引擎据此判胜）；中途关掉面板时重开后照常收尾。
    function maybeFinish() {
        if (!root || busy || waiting.length || (autoGen >= 0 && autoGen === hitGen)) return;
        const cur = session()?.state();
        const b = cur?.status === 'battle' ? cur.battle : null;
        if (!b || b.outcome || b.phase !== 'player' || b.overkill !== true) return;
        if (Object.values(b.units).some((u) => u.side === 'enemy' && u.alive)) return;
        const my = token;
        const gen = hitGen;
        setAuto(gen);
        later(() => {
            if (my !== token || gen !== hitGen || !root) return;
            setAuto(-1);
            act({ type: 'end-turn' });
        }, reduced() ? 0 : COMBAT_FINISH_BEAT_MS);
    }

    // 命中落点（时刻从命中演出开始起算，见 combatLandings）：带段号的变化在该段落下的时刻落下，同一段的各单位同时、各段依次；
    // 其余变化在本段命中演出里同名目标出现的时刻落下；都没有对应命中的（格挡、中毒、荆棘等）在本段命中开始时落下。
    // 落下时更新暂存血条、飘字与受击反馈；多段攻击每段各出一次受击形态，停顿与震屏只在第一次落下时出。面板关闭或战斗结束收掉旧时间轴后不再落。
    // defer：击倒先只把血条落到 0，倒下与「击倒」飘字等全部演出放完再出（drained）；这期间该单位仍可被选为目标（鞭尸）。
    function landMarks(marks, landing, my, rarity, onWave, defer = false) {
        if (!marks.length) return;
        const units = session()?.state()?.battle?.units || {};
        const named = landing?.named || [];
        const strikes = landing?.strikes || new Map();
        const sounded = new Set();
        let impacted = false;
        for (const { unitId, marks: all } of marks) {
            const name = String(units[unitId]?.name || '').trim();
            let match;
            const buckets = new Map();
            for (const mark of all) {
                const wave = mark.strike ? strikes.get(mark.strike) : null;
                if (!wave && match === undefined) {
                    match = name ? named.find((h) => !h.used && h.target === name) || null : null;
                    if (match) match.used = true;
                }
                const key = wave ? `s${mark.strike}` : 'rest';
                if (!buckets.has(key)) buckets.set(key, { at: wave ? wave.at : match?.at || 0, wave, list: [] });
                buckets.get(key).list.push(mark);
            }
            for (const { at, wave, list } of buckets.values()) {
                const land = () => {
                    if (my !== token || !root) return;
                    const entry = held.get(unitId);
                    const el = unitEl(unitId);
                    // 受击形态只落在出手者以外、本次被打中（掉血或全挡）的单位上：普通卡与技能画基础形态，稀有及以上另加光晕、停顿与震屏。
                    const struck = Boolean(rarity?.rank || rarity?.strike) && unitId !== rarity.unitId && list.some(mark => mark.kind === 'damage' || mark.kind === 'guard' || mark.kind === 'overkill');
                    const stop = struck && !impacted ? rarity.hold : 0;
                    const ko = defer && entry && list.some((mark) => mark.kind === 'ko');
                    const shown = ko ? list.filter((mark) => mark.kind !== 'ko') : list;
                    if (entry) { applyHitMarks(entry, shown); if (ko) { entry.hp = 0; entry.ko = true; } paintUnitHp(el, entry); }
                    showHitFloats(doc, el, shown, { reduced: reduced(), schedule: later, rarity });
                    // 停顿期间受击动画暂停，摘除受击反馈的计时顺延同样时长，动画不被截短。
                    reactUnit(el, list, { reduced: reduced() || lowQuality(), schedule: stop ? (fn, ms) => later(fn, ms + stop) : later });
                    if (struck) {
                        rarityNodes(el, rarity, 'hit');
                        if (!impacted) { impacted = true; rarityImpact(rarity, unitId); }
                    }
                    if (wave && !wave.first && typeof onWave === 'function' && !sounded.has(wave)) { sounded.add(wave); onWave(wave.event, list); }
                };
                if (at > 0) later(land, at); else land();
            }
        }
    }

    // 一条时间轴走完：它暂存的单位各减一次引用；没有别的时间轴还在动它时按会话里的真实血量落笔并移出暂存，之后的重绘直接用真实值。
    function releaseHeld(ids) {
        if (!ids?.length || !held.size) return;
        const units = session()?.state()?.battle?.units || {};
        for (const id of ids) {
            const entry = held.get(id);
            if (!entry) continue;
            entry.refs = (entry.refs || 1) - 1;
            if (entry.refs > 0) continue;
            // 鞭尸期间被击倒、还没显示倒下：留在暂存里，等全部演出放完再倒下（drained）。
            if (entry.ko) continue;
            held.delete(id);
            const u = units[id];
            if (u) paintUnitHp(unitEl(id), { hp: Math.max(0, u.hp), maxHp: u.maxHp, alive: u.alive !== false });
        }
        if (swaps.size) startLeaves();
    }

    // 结算等待结束（时间轴走完，或这次动作没有演出可播）：换成结算画面；只认结束战斗那次动作的时间轴（gen），更早动作的收尾不提前换。
    function settle(gen) {
        if (!settling || gen !== hitGen) return;
        settling = false;
        render();
    }

    // 动作结算后、重绘前：本次有变化的单位先按动作前血量显示，命中落下时再落到新值；已在暂存中的（更早动作还没落完）沿用当前暂存值、加一次引用。
    // 返回本次暂存的单位，减少动态效果时不暂存，直接显示结果。
    function holdUnits(prior, events) {
        if (!prior || reduced()) return [];
        const ids = [];
        for (const { unitId } of combatHitMarks(events)) {
            const entry = held.get(unitId);
            if (entry) { entry.refs = (entry.refs || 1) + 1; ids.push(unitId); continue; }
            const p = prior.get(unitId);
            if (p) { held.set(unitId, { ...p, refs: 1 }); ids.push(unitId); }
        }
        return ids;
    }

    // 出牌飞行卡：结算前取被打出的手牌位置与影子（重绘后原节点即被替换）；减少动态效果或低画质不飞。
    function captureCard(inst) {
        if (inst == null || reduced() || lowQuality()) return null;
        const el = cardEl(inst);
        // 拖牌打出：影子卡从松手处飞出，不回到手牌原位。
        const rect = dropFrom && String(dropFrom.inst) === String(inst) ? dropFrom.rect : el?.getBoundingClientRect?.();
        if (!el || !rect?.width) return null;
        const ghost = cloneCardGhost(el);
        return ghost ? { rect, ghost } : null;
    }

    // 影子卡飞向目标：选了目标的飞向目标；不选目标的飞向第一个有变化的单位（如给自己加格挡），都没有时飞向敌方第一人。返回飞行时长，不飞为 0。
    function flyCard(card, action, events) {
        if (!card || !stage) return 0;
        const first = combatHitMarks(events)[0]?.unitId;
        const target = (action?.targetId && unitEl(action.targetId)) || (first && unitEl(first)) || root?.querySelector?.('.igs-combat-side.is-enemy .igs-combat-unit');
        const ms = launchCardGhost(stage, card.ghost, card.rect, target?.getBoundingClientRect?.(), {
            schedule: (fn, t) => later(() => { fn(); cutinNodes.delete(card.ghost); }, t),
            rarity: playedCardFx(events, session()?.state()?.battle, { reduced: reduced(), low: lowQuality() }),
        });
        if (ms) cutinNodes.add(card.ghost);
        return ms;
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

    // 「发送战报 / 重新发送」：点下就关闭面板、露出阅读器，不等发送返回；发送由会话层在后台继续（会话不随面板关闭而取消）。
    // 发送失败时会话进入 send-failed，重开面板可重新发送；升级三选一在重开面板时领取。
    function sendAndLeave(fn) {
        if (pending) return { ok: false, reason: 'combat-busy' };
        let job;
        try { job = Promise.resolve(fn()); } catch (error) { job = Promise.resolve({ ok: false, reason: 'combat-action-threw' }); }
        job = job.catch(() => ({ ok: false, reason: 'combat-action-threw' }));
        close();
        return job;
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

    // 重新开始（v0.39.2）：对局中先点一次进入确认，再点才重开；结算画面（败北 / 撤退）直接重开。成功后收掉旧演出并播开局演出。
    async function restartBattle() {
        const s = session();
        if (!s || typeof s.restart !== 'function') return { ok: false, reason: 'combat-restart-unavailable' };
        if (pending) return { ok: false, reason: 'combat-busy' };
        if (s.state().status === 'battle' && !restartArmed) { restartArmed = true; notice = ''; render(); return { ok: true, armed: true }; }
        restartArmed = false;
        clearCutins(); endDrag(); hideScaleTip();
        held.clear(); drawnLook.clear(); swaps.clear(); entering.clear();
        hitGen += 1;
        if (stage) cancelBattleFx(stage);
        selected = null; chosen = []; settling = false; autoGen = -1; flipShown = null; resultShown = null; itemsOpen = false;
        const r = await runAsync('restart', () => s.restart());
        if (r.ok && root) playFx(r.events, { start: true });
        return r;
    }

    function act(action) {
        const s = session();
        if (!s || pending) return { ok: false, reason: pending ? 'combat-busy' : 'combat-session-unavailable' };
        const was = s.state().battle;
        if (autoGen >= 0 && autoGen === hitGen) return { ok: false, reason: 'combat-busy' };
        // 结束回合：记下动作前的行动条进度，操控角色出手完毕回到起点，演出从这里开始推进。
        const before = action?.type === 'end-turn' ? was : null;
        const from = before ? { ...actionProgress(before), [before.controlledId]: 0 } : null;
        // 打击感：结算前记下各单位血量与被打出的牌（重绘会替换节点）。
        const prior = was && !reduced() ? hpSnapshot(was) : null;
        const card = action?.type === 'play' ? captureCard(action.inst) : null;
        const r = s.act(action);
        selected = null; chosen = [];
        say(r);
        // 新动作：引擎已立即结算，演出按动作顺序逐条播放——前面的时间轴还没播完时排到它们之后（拼手速可以一口气打出多张），命中按增量落到同一份暂存血量上；
        // 本次有变化、还没暂存的单位按本次动作前的血量暂存。这次动作结束了战斗：减少动态效果时收掉旧演出、直接显示结算画面；
        // 否则排在前面的演出照常播完，这次的演出走完再换结算画面（settle）。
        const ended = r.ok && s.state().status === 'ended';
        if (ended && reduced()) { clearCutins(); held.clear(); }
        let ids = [];
        if (r.ok) { hitGen += 1; ids = holdUnits(prior, r.events); settling = ended && !reduced(); }
        if (r.ok && !reduced() && !lowQuality()) noteSwaps(r.events);
        render();
        if (r.ok) {
            // 有队友或敌人出手（结束回合）：立即加演出锁；前面的演出还没播完时，行动条先停在结束回合前的进度。
            const gen = hitGen;
            const auto = fxSegments(r.events).some((g) => g.actor);
            if (auto) setAuto(gen);
            // 出手即反馈：己方出牌 / 人物技能 / 道具立即一声挥出、影子卡立即飞向目标；特效与伤害按动作顺序排队依次结算，命中音随命中演出落下。
            if (['play', 'hero-skill', 'item'].includes(action?.type)) sfx('battle-card');
            const fly = flyCard(card, action, r.events);
            const queued = busy > 0 || waiting.length > 0;
            // 排队的动作：影子卡落地时记下；轮到它时已落地就直接开演，还在飞就占住队列等落地（后面的动作不越过它）。
            let landed = !queued || !fly;
            let onLand = null;
            if (!landed) {
                later(() => {
                    landed = true;
                    const go = onLand;
                    onLand = null;
                    go?.();
                }, fly);
            }
            const start = () => {
                if (!queued) { playFx(r.events, { from, fly, gen, held: ids }); return; }
                if (landed) { playFx(r.events, { from, gen, held: ids }); return; }
                busy += 1;
                onLand = () => {
                    busy = Math.max(0, busy - 1);
                    playFx(r.events, { from, gen, held: ids });
                };
            };
            start.reveal = action?.type === 'end-turn' || action?.type === 'escape';
            if (queued) {
                const dots = trackDots();
                if (auto && from && dots.size) placeDots(dots, from, false);
                waiting.push(start);
            } else start();
        }
        return r;
    }

    // 当前选中的牌 / 人物技能 / 主动特性 / 道具的视图（含 targets 可选目标与 affects 承受方）。
    function selectionView(sel) {
        const st = session().state();
        const view = st.battle ? battleView(st.battle, st.legal) : null;
        if (isItemSelection(sel)) return selectedItemView(view, sel);
        return isSkillSelection(sel) ? selectedSkillView(view, sel) : view?.hand.find((c) => c.inst === sel);
    }
    // 既无可选目标也无承受方可点（正常牌不会出现）：只有这种情况下再点一次牌才算确认，避免牌卡在选中态。
    const nothingToClick = (v) => Boolean(v) && !v.targets.length && !v.affects.length;

    // 点牌只进入选中态，不直接打出：要选目标的牌点高亮的敌人；对自己用的牌点主战者，可对队友用的点我方单位，全体效果点承受方任一个；
    // 再点一次已选中的牌、取消按钮或 Esc 撤销（重绘时指针所在的手牌保持抬起，见 hoverInst）。返回 combat-target-required 表示已选中、等待点角色。
    // 待选阶段（v4 选牌）：点候选牌切换已选，最多选 count 张；只选 1 张时点另一张直接换选。回合按钮显示「弃掉 k/N」。
    function toggleChoice(inst) {
        const choice = pendingChoice(session().state().battle);
        if (!choice.options.includes(inst)) { notice = combatReasonText('combat-choice-invalid'); render(); return { ok: false, reason: 'combat-choice-invalid' }; }
        if (chosen.includes(inst)) chosen = chosen.filter((i) => i !== inst);
        else if (choice.count === 1) chosen = [inst];
        else if (chosen.length >= choice.count) { notice = combatReasonText('combat-choice-full'); render(); return { ok: false, reason: 'combat-choice-full' }; }
        else chosen = [...chosen, inst];
        notice = ''; render();
        return { ok: true, reason: 'combat-choice-picked', chosen: chosen.slice() };
    }

    // 待选阶段确认：已选张数等于 count 时，按引擎 legal 里的同一组合派发 choose（经 session.act 记入动作、可重放）；张数不对给原因，不派发。
    function confirmChoice() {
        const st = session().state();
        const choice = pendingChoice(st.battle);
        if (!choice) return { ok: false, reason: 'no-choice-pending' };
        if (chosen.length !== choice.count) { notice = combatReasonText('combat-choice-count'); render(); return { ok: false, reason: 'combat-choice-count' }; }
        const want = new Set(chosen);
        const action = (st.legal || []).find((a) => a.type === 'choose' && a.insts.length === want.size && a.insts.every((i) => want.has(i)))
            || { type: 'choose', insts: chosen.slice() };
        return act(action);
    }

    function pickCard(inst) {
        if (pendingChoice(session().state().battle)) return toggleChoice(inst);
        const pick = resolvePlay(session().state().legal, inst);
        if (!pick.ok && pick.reason !== 'combat-target-required') {
            selected = null; notice = combatReasonText(pick.reason); render();
            return pick;
        }
        if (selected === inst) {
            if (pick.ok && nothingToClick(selectionView(inst))) return act(pick.action);
            selected = null; render();
            return { ok: true, reason: 'combat-selection-cleared' };
        }
        selected = inst; notice = ''; render();
        return { ok: false, reason: 'combat-target-required', targets: pick.targets || [] };
    }

    // 选中后点单位：要选目标的按该目标打出；不选目标的只接受高亮的承受方，必须点到角色才打出。
    function pickTarget(targetId) {
        if (!selected) return { ok: false, reason: 'combat-card-unselected' };
        const legal = session().state().legal;
        const skill = isSkillSelection(selected);
        const itemSel = isItemSelection(selected);
        const picked = selectionView(selected);
        if (!picked) { selected = null; render(); return { ok: false, reason: itemSel ? 'combat-item-unusable' : skill ? 'combat-hero-skill-unusable' : 'combat-card-unplayable' }; }
        const free = !picked.targets.length;
        if (free && !nothingToClick(picked) && !picked.affects.includes(targetId)) { say({ ok: false, reason: 'combat-target-invalid' }); render(); return { ok: false, reason: 'combat-target-invalid' }; }
        const id = free ? undefined : targetId;
        const pick = itemSel ? resolveItem(legal, selectionItemId(selected), id)
            : skill ? resolveHeroSkill(legal, id, selectionSkillId(selected)) : resolvePlay(legal, selected, id);
        if (pick.ok) { if (itemSel) itemsOpen = false; return act(pick.action); }
        say(pick);
        render();
        return pick;
    }

    // 人物技能与主动特性（skillId 缺省为固有人物技能）：与出牌同一套选中 / 确认 / 取消流程，共用 selected；选中后详情由 render 弹在圆球旁。
    function pickHeroSkill(skillId) {
        const sel = skillSelection(skillId);
        const shown = scaleTip?.trait;
        const pick = resolveHeroSkill(session().state().legal, undefined, skillId);
        if (!pick.ok && pick.reason !== 'combat-target-required') {
            selected = null; notice = combatReasonText(pick.reason); render();
            // 不可用时也弹出详情（再点同一颗收起），能看到效果与本回合是否已用。
            const t = findTrait((x) => x.kind === 'active' && x.skillId === skillId);
            if (t && shown !== t.id) showTraitTip((x) => x.id === t.id);
            return pick;
        }
        if (selected === sel) {
            if (pick.ok && nothingToClick(selectionView(sel))) return act(pick.action);
            selected = null; render();
            return { ok: true, reason: 'combat-selection-cleared' };
        }
        selected = sel; notice = ''; render();
        return { ok: false, reason: 'combat-target-required', targets: pick.targets || [] };
    }

    // 人物特性详情浮层：按圆球的 data-trait 找重绘后的节点，内容取当前视图（选中的主动特性重绘后由 render 重新弹出）。
    function findTrait(pred) {
        const st = session()?.state();
        const view = st?.battle ? battleView(st.battle, st.legal) : null;
        return (view?.traits || []).find(pred) || null;
    }
    function showTraitTip(pred) {
        const t = findTrait(pred);
        const anchor = t ? [...(root?.querySelectorAll?.('.igs-combat-trait') || [])].find((n) => n.getAttribute?.('data-trait') === t.id) : null;
        if (!anchor) return false;
        showScaleTip(anchor, traitTipHtml(t));
        if (scaleTip) scaleTip.trait = t.id;
        return true;
    }

    // 单位详情浮层（点头像，助手 10-28）：按头像的 data-unit-info 找重绘后的节点，内容取当前战斗状态（unitDetailView）；
    // 单位此时可选为目标（头像整块是目标、不带 data-unit-info）或已不在场时不弹。
    function showUnitTip(unitId) {
        const battle = session()?.state()?.battle;
        const detail = battle ? unitDetailView(battle, unitId) : null;
        const anchor = detail ? [...(root?.querySelectorAll?.('[data-unit-info]') || [])].find((n) => n.getAttribute?.('data-unit-info') === unitId) : null;
        if (!anchor) return false;
        showScaleTip(anchor, unitTipHtml(detail), 'is-unit');
        if (scaleTip) scaleTip.unit = unitId;
        return true;
    }
    // 点头像弹出详情，再点同一头像收起；只看不动，演出锁与待选阶段都可点。
    function toggleUnitTip(unitId) {
        if (scaleTip?.unit === unitId) { hideScaleTip(); return { ok: true, reason: 'combat-unit-tip-closed' }; }
        return showUnitTip(unitId) ? { ok: true, reason: 'combat-unit-tip-open' } : { ok: false, reason: 'combat-unit-missing' };
    }

    // Esc：有选中的牌 / 技能时先撤销选中，返回 true；没有时返回 false，由宿主关闭面板。
    // 道具：不需要选目标或只剩一个可选目标时点一次直接使用；回复 / 格挡 / 净化有多名存活的己方单位、单体攻击有多名敌人时，
    // 进入与出牌同一套选中态（selected 为 item:<itemId>），高亮可选单位，点单位使用；再点同一道具撤销。不可用时用提示说明原因。
    function useItem(itemId) {
        const pick = resolveItem(session().state().legal, itemId);
        if (pick.ok) { itemsOpen = false; return act(pick.action); }
        const sel = itemSelection(itemId);
        if (pick.reason === 'combat-target-required') {
            if (selected === sel) { selected = null; render(); return { ok: true, reason: 'combat-selection-cleared' }; }
            itemsOpen = false; selected = sel; notice = ''; render();
            return pick;
        }
        selected = null; notice = combatReasonText(pick.reason); render();
        return pick;
    }

    // 道具按钮：点开 / 收起道具列表，只改界面状态，不派发引擎动作；没有道具时给出原因。
    function toggleItems() {
        const has = (session()?.state().battle?.items?.list || []).some((i) => i.count > 0);
        if (!has) { itemsOpen = false; notice = combatReasonText('combat-items-empty'); render(); return { ok: false, reason: 'combat-items-empty' }; }
        itemsOpen = !itemsOpen;
        render();
        return { ok: true, open: itemsOpen };
    }

    // 收起道具列表：移除列表节点并改类名，不整块重绘（随后的点击还要命中原节点）。
    function closeItems() {
        itemsOpen = false;
        const box = root?.querySelector?.('.igs-combat-items');
        box?.querySelector?.('.igs-combat-item-menu')?.remove?.();
        if (box) box.className = 'igs-combat-items';
        const btn = root?.querySelector?.('[data-combat-act="items"]');
        if (btn) { btn.className = String(btn.className || '').replace(/\s*\bis-open\b/g, ''); btn.setAttribute?.('aria-expanded', 'false'); }
    }

    function cancelSelection() {
        endDrag();
        if (root && itemsOpen) { itemsOpen = false; render(); return true; }
        if (!root || (!selected && !chosen.length)) return false;
        selected = null; chosen = [];
        render();
        return true;
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
        if (r.ok) {
            await loadRewards();
        }
        return r;
    }

    // 「重试」：阻断原因来自数据库表（缺表、未载入、建表失败等）时，先经服务再补建一次（清掉上次建表失败的记忆），再重新准备。
    async function retryPrepare() {
        let reason = '';
        try { reason = String(session()?.state().reason || ''); } catch (error) { reason = ''; }
        if (reason.startsWith('combat-table-') && typeof options.ensureTables === 'function') {
            const my = token;
            await runAsync('tables', () => options.ensureTables());
            if (my !== token || !root) return { ok: false, reason: 'request-stale' };
        }
        return prepare();
    }

    // 待选阶段不派发的回合操作：点了只给出「先选完牌」。
    const CHOICE_BLOCKED = new Set(['hero-skill', 'awaken', 'item', 'target', 'end-turn', 'escape']);

    function invoke(name, id = '') {
        if (name === 'close') return close();
        // 演出速度不受演出锁限制：演出进行中也能切换。
        if (name === 'speed') return root ? toggleSpeed() : { ok: false, reason: 'combat-panel-closed' };
        const s = session();
        if (!root || !s) return { ok: false, reason: root ? 'combat-session-unavailable' : 'combat-panel-closed' };
        // 单位详情（点头像）只看不动，不受演出锁与待选阶段限制。
        if (name === 'unit-info') return toggleUnitTip(id);
        if (autoGen >= 0 && autoGen === hitGen) return { ok: false, reason: 'combat-busy' };
        if (restartArmed && name !== 'restart' && name !== 'restart-cancel') restartArmed = false;
        switch (name) {
            case 'retry-prepare': return retryPrepare();
            case 'restart': return restartBattle();
            case 'restart-cancel': restartArmed = false; render(); return { ok: true };
            default: break;
        }
        if (CHOICE_BLOCKED.has(name) && pendingChoice(s.state().battle)) { notice = combatReasonText('combat-choice-pending'); render(); return { ok: false, reason: 'combat-choice-pending' }; }
        switch (name) {
            case 'pick':
                if (!s.state().lobby?.controllable.includes(id)) return { ok: false, reason: 'combat-controlled-invalid' };
                controlledId = id;
                render();
                return { ok: true };
            case 'start': {
                const r = s.start({ controlledId: controlledId ?? undefined });
                say(r);
                render();
                if (r.ok) {
                    // 开战过场走完再播开局演出；过场期间已有新动作（hitGen 变了）或面板已关闭时不再补播。
                    const lead = showOpening();
                    const my = token;
                    const gen = hitGen;
                    if (lead) later(() => { if (my === token && gen === hitGen) playFx(r.events, { start: true }); }, lead);
                    else playFx(r.events, { start: true });
                }
                return r;
            }
            case 'card': return pickCard(id);
            case 'hero-skill': return pickHeroSkill(id || undefined);
            case 'awaken': return act({ type: 'awaken' });
            case 'items': return toggleItems();
            case 'item': return useItem(id);
            case 'target': return pickTarget(id);
            case 'cancel': selected = null; chosen = []; render(); return { ok: true };
            case 'choose-confirm': return confirmChoice();
            case 'end-turn': return act({ type: 'end-turn' });
            case 'escape': return act({ type: 'escape' });
            case 'finish': return sendAndLeave(() => s.finish());
            case 'retry-send': return sendAndLeave(() => s.retrySend());
            case 'flip':
            case 'choose': {
                const position = /^\d+$/.test(id) ? Number(id) : -1;
                if (position < 0) return { ok: false, reason: 'combat-flip-position-invalid' };
                return runAsync('flip', () => (name === 'flip' ? s.flip(position) : s.choose(position)));
            }
            case 'reroll': return runAsync('flip', () => s.reroll());
            case 'retry-reward': return runAsync('reward', () => s.retryReward());
            case 'skip': return runAsync('skip', () => s.skip());
            case 'reward': return claimReward(id);
            default: return { ok: false, reason: 'combat-action-unknown' };
        }
    }

    function onClick(event) {
        event.stopPropagation?.();
        // 拖牌松手后浏览器补发的 click 不当作点选。
        if (dragClickUntil && Date.now() < dragClickUntil) { dragClickUntil = 0; event.preventDefault?.(); return; }
        // 牌面上带加成 / 减益的数字：弹出（再点收起）加成详情，不选中、不打出这张牌；点面板其他地方先收起详情。
        const tipAnchor = event.target?.closest?.('[data-scale-tip]');
        if (tipAnchor && root?.contains?.(tipAnchor)) {
            event.preventDefault?.();
            if (scaleTip?.anchor === tipAnchor) hideScaleTip(); else showScaleTip(tipAnchor);
            return;
        }
        // 点在头像详情浮层里（可滚动阅读）不收起；点特性圆球或头像时由它们自己切换详情（再点同一个收起），不先收起。
        const inTip = scaleTip?.node && event.target?.closest?.('.igs-combat-scale-tip') === scaleTip.node;
        if (inTip) return;
        if (itemsOpen && !event.target?.closest?.('.igs-combat-items')) closeItems();
        if (!event.target?.closest?.('[data-trait]') && !event.target?.closest?.('[data-unit-info]')) hideScaleTip();
        const control = event.target?.closest?.('[data-combat-act]');
        if (!control || !root?.contains?.(control)) return;
        event.preventDefault?.();
        // 不可用的牌与人物技能仍响应点击，用提示说明原因；其余禁用控件不响应。
        if (control.getAttribute('aria-disabled') === 'true' && !['card', 'hero-skill', 'awaken', 'items', 'item'].includes(control.getAttribute('data-combat-act'))) return;
        invoke(control.getAttribute('data-combat-act'), control.getAttribute('data-combat-id') || '');
    }

    function onDragStart(event) {
        event.preventDefault?.();
    }

    // 炉石式拖牌：按住手牌拖过 DRAG_SLOP 后按点选流程选中这张牌，影子卡跟随指针；松在高亮的承受方上按点选同一条路径打出（影子卡从松手处飞出），松在别处撤销选中。
    // 主动特性圆球同样可拖（助手 10-28）：拖过阈值按点选流程选中这项技能，影子圆球跟随指针，松在高亮的承受方上发动，不选目标的技能松在战场上也发动，松在别处撤销。
    // 不可出的牌与不可用的技能照常给出原因提示；点选、取消按钮与 Esc 不变，Esc 在拖动中同样撤销。drag.sel 为对应的选中标记（牌为实例 ID，技能为 skillSelection）。
    const DRAG_SLOP = 8;
    const DRAG_SOURCES = '.igs-combat-hand [data-combat-act="card"], .igs-combat-trait-ring [data-combat-act="hero-skill"]';
    // 按 data-trait 找主动特性圆球（影子圆球去掉了交互属性，但保留 data-trait，只在 .igs-combat-trait-ring 里找）。
    const orbEl = (traitId) => [...(root?.querySelectorAll?.('.igs-combat-trait-ring .igs-combat-trait') || [])].find((n) => n.getAttribute?.('data-trait') === traitId) || null;
    const dragEl = (d) => (d.skill ? orbEl(d.trait) : cardEl(d.inst));
    function onPointerDown(event) {
        dragClickUntil = 0;
        if (drag || event.isPrimary === false || (event.button ?? 0) !== 0) return;
        const el = event.target?.closest?.(DRAG_SOURCES);
        if (!el || !root?.contains?.(el)) return;
        // 待选阶段不拖：点候选牌走点击切换已选。
        const s = session();
        if (s && pendingChoice(s.state().battle)) return;
        const skill = el.getAttribute('data-combat-act') === 'hero-skill';
        const id = el.getAttribute('data-combat-id') || '';
        drag = { id: event.pointerId, skill, inst: skill ? '' : id, skillId: skill ? id : '', trait: skill ? el.getAttribute('data-trait') || '' : '',
            sel: skill ? skillSelection(id || undefined) : id, x: event.clientX, y: event.clientY,
            rect: el.getBoundingClientRect?.() || null, live: false, dead: false, ghost: null, k: 1, target: '', free: false, loose: false };
    }

    function liftCard(event) {
        const sel = drag.sel;
        if (selected !== sel) {
            if (drag.skill) pickHeroSkill(drag.skillId || undefined);
            else pickCard(drag.inst);
        }
        if (selected !== sel) { drag.dead = true; return; }
        drag.live = true;
        // 不选目标的牌 / 技能（没有可选目标）：牌拖出手牌区、技能拖到战场上松在空处也打出 / 发动。
        drag.free = !selectionView(sel)?.targets?.length;
        // 拖动中不弹选中技能的详情浮层（render 也不补弹），松手或撤销后照常。
        if (drag.skill) hideScaleTip();
        const el = dragEl(drag);
        const base = stage?.getBoundingClientRect?.();
        const ghost = el && base?.width && drag.rect?.width ? cloneCardGhost(el) : null;
        if (ghost) {
            // 影子卡挂在演出层（与出牌飞行卡同层），坐标按面板自身尺寸换算（宿主缩放不影响）。
            const k = stage.offsetWidth ? base.width / stage.offsetWidth : 1;
            const s = ghost.style;
            ghost.className = `${ghost.className} is-held`;
            s?.setProperty?.('left', `${Math.round((drag.rect.left - base.left) / k)}px`);
            s?.setProperty?.('top', `${Math.round((drag.rect.top - base.top) / k)}px`);
            s?.setProperty?.('width', `${Math.round(drag.rect.width / k)}px`);
            s?.setProperty?.('height', `${Math.round(drag.rect.height / k)}px`);
            stage.appendChild(ghost);
            drag.ghost = ghost;
            drag.k = k;
        }
        root.setAttribute?.('data-igs-combat-dragging', '');
        try { root.setPointerCapture?.(event.pointerId); } catch (error) { /* 指针已抬起 */ }
        markDrag();
    }

    // 指针下高亮的承受方（.is-targetable 单位）；影子卡不接收指针，命中的是底下的单位。
    function dropTarget(event) {
        const hit = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(event.clientX, event.clientY) : null;
        const unit = hit?.closest?.('.igs-combat-unit.is-targetable');
        return unit && root?.contains?.(unit) ? unit.getAttribute('data-unit') || '' : '';
    }

    // 不选目标的牌松在手牌区外的空处（不在承受方上）即打出；松回手牌区撤销。不选目标的技能松在战场（.igs-combat-field）上即发动。
    // 量不到手牌区 / 战场时不算，宁可撤销也不误打出。
    function looseDrop(d, event, target) {
        if (!d?.free || target) return false;
        const r = root?.querySelector?.(d.skill ? '.igs-combat-field' : '.igs-combat-hand')?.getBoundingClientRect?.();
        if (!r?.width || !r?.height) return false;
        const outside = event.clientX < r.left || event.clientX > r.left + r.width || event.clientY < r.top || event.clientY > r.top + r.height;
        return d.skill ? !outside : outside;
    }

    function onPointerMove(event) {
        if (!drag || drag.dead || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.live) {
            if (Math.hypot(dx, dy) < DRAG_SLOP) return;
            liftCard(event);
            if (!drag?.live) return;
        }
        event.preventDefault?.();
        // 位移写独立的 translate 属性：它在 scale 之外生效，放大 / 瞄准缩小时影子卡中心仍贴着指针。
        drag.ghost?.style?.setProperty?.('translate', `${Math.round(dx / drag.k)}px ${Math.round(dy / drag.k)}px`);
        const target = dropTarget(event);
        const loose = looseDrop(drag, event, target);
        if (target !== drag.target || loose !== drag.loose) { drag.target = target; drag.loose = loose; markDrag(); }
    }

    function onPointerUp(event) {
        if (!drag || event.pointerId !== drag.id) return;
        const live = drag;
        if (!live.live && !live.dead) { drag = null; return; }
        // 拖动过的手势不再当作点击：吞掉随后补发的 click。
        dragClickUntil = Date.now() + 400;
        if (!live.live) { drag = null; return; }
        event.preventDefault?.();
        const target = dropTarget(event);
        const loose = looseDrop(live, event, target);
        const rect = live.ghost?.getBoundingClientRect?.() || null;
        endDrag();
        if (selected !== live.sel) return;
        if (!target && !loose) { cancelSelection(); return; }
        // 拖牌打出时影子卡从松手处飞出；技能不飞卡。
        dropFrom = !live.skill && rect?.width ? { inst: live.inst, rect } : null;
        // 空处松手：不选目标的牌 / 技能不带 targetId，按承受方任一个走点选同一路径。
        const r = pickTarget(target || selectionView(live.sel)?.affects?.[0] || '');
        dropFrom = null;
        if (!r.ok && selected === live.sel) cancelSelection();
    }

    function onPointerCancel(event) {
        if (!drag || event.pointerId !== drag.id) return;
        const { live, sel } = drag;
        endDrag();
        if (live && selected === sel) cancelSelection();
    }

    function endDrag() {
        const live = drag;
        drag = null;
        if (!live) return;
        live.ghost?.remove?.();
        if (live.live) {
            try { root?.releasePointerCapture?.(live.id); } catch (error) { /* 已释放 */ }
            root?.removeAttribute?.('data-igs-combat-dragging');
        }
        markDrag();
    }

    // 重绘会换掉手牌、圆球与单位节点：拖动中每次重绘后补回原牌 / 原圆球隐藏、目标悬停与影子瞄准标记；拖动结束时清掉。
    function markDrag() {
        if (!root) return;
        for (const n of root.querySelectorAll?.('.is-lifted, .is-drop-hover') || []) { n.classList?.remove('is-lifted'); n.classList?.remove('is-drop-hover'); }
        const live = drag?.live ? drag : null;
        live?.ghost?.classList?.toggle?.('is-armed', Boolean(live?.target || live?.loose));
        if (!live) return;
        dragEl(live)?.classList?.add('is-lifted');
        if (live.target) unitEl(live.target)?.classList?.add('is-drop-hover');
    }

    function setHover(inst) {
        if (inst === hoverInst) return;
        if (hoverInst) cardEl(hoverInst)?.classList?.remove?.('is-hover');
        hoverInst = inst;
    }
    function onPointerOver(event) {
        if (event.pointerType === 'touch') return;
        const el = event.target?.closest?.('.igs-combat-hand [data-combat-act="card"]');
        setHover(el && root?.contains?.(el) ? el.getAttribute('data-combat-id') || '' : '');
    }
    function onPointerOut(event) {
        const to = event.relatedTarget;
        if (!to || !root?.contains?.(to)) setHover('');
    }

    // 拖牌与手牌悬停的指针事件都挂在根节点。
    const pointerListeners = [['pointerdown', onPointerDown], ['pointermove', onPointerMove], ['pointerup', onPointerUp], ['pointercancel', onPointerCancel],
        ['pointerover', onPointerOver], ['pointerout', onPointerOut]];

    function hideScaleTip() {
        scaleTip?.node?.remove?.();
        scaleTip = null;
    }

    // 详情水平对准数字中心并夹在面板内，上方放不下时放到数字下方；坐标按面板自身尺寸换算（宿主缩放不影响）；量不到时用样式里的保底位置。kind 为附加样式类（头像详情 is-unit）。
    // 头像详情可能较高：上方放不下就放下方，两边都放不下时整块夹在面板内（data-free，--tip-y 为上沿），样式层限高可滚动。
    function showScaleTip(anchor, html = '', kind = '') {
        hideScaleTip();
        if (!root || typeof doc.createElement !== 'function') return;
        const node = doc.createElement('div');
        node.className = html ? `igs-combat-scale-tip is-trait${kind ? ` ${kind}` : ''}` : 'igs-combat-scale-tip';
        node.setAttribute?.('role', 'tooltip');
        if (html) node.innerHTML = html; else node.textContent = anchor.getAttribute('data-scale-tip') || '';
        root.appendChild(node);
        scaleTip = { node, anchor };
        const a = anchor.getBoundingClientRect?.();
        const r = root.getBoundingClientRect?.();
        if (!a?.width || !r?.width) return;
        const k = root.offsetWidth ? r.width / root.offsetWidth : 1;
        const w = r.width / k;
        const half = (node.offsetWidth || 0) / 2;
        const x = Math.min(Math.max((a.left - r.left + a.width / 2) / k, half + 8), w - half - 8);
        node.style?.setProperty?.('--tip-x', `${Math.round(x)}px`);
        if (kind === 'is-unit') {
            const hgt = node.offsetHeight || 0;
            const total = r.height / k;
            const above = (a.top - r.top) / k - hgt - 8;
            const under = (a.bottom - r.top) / k + 8;
            const top = above >= 8 ? above : under + hgt <= total - 8 ? under : Math.max(8, total - hgt - 8);
            node.style?.setProperty?.('--tip-y', `${Math.round(top)}px`);
            node.setAttribute('data-free', '');
            return;
        }
        const below = (a.top - r.top) / k < (node.offsetHeight || 0) + 16;
        node.style?.setProperty?.('--tip-y', `${Math.round(((below ? a.bottom : a.top) - r.top) / k)}px`);
        if (below) node.setAttribute('data-below', '');
    }

    // messageId 为开战楼。未结束的战斗优先：同一时刻只推进一场，其余开战楼只显示当前这场。
    function open(overlay, openOptions = {}) {
        if (root) return { ok: true, reason: 'already-open' };
        if (!overlay || !doc?.createElement) return { ok: false, reason: 'missing-combat-container' };
        const s = session();
        if (!s) return { ok: false, reason: 'combat-session-unavailable' };
        messageId = Number.isInteger(openOptions.messageId) ? openOptions.messageId : null;
        notice = ''; pending = ''; selected = null; chosen = []; controlledId = null; rewards = null; settling = false; lobbyShown = false; autoGen = -1; flipShown = null; resultShown = null;
        token += 1;
        pageOverlay = overlay;
        // 招式名与「觉醒·类型」的庞门正道字体按字切片：开面板时先请求固定的「觉醒·」，播特写时再按实际文字补请求。
        preloadCutinFonts(doc, '觉醒·');
        previousFocus = doc.activeElement || null;
        root = doc.createElement('div');
        root.id = COMBAT_PANEL_ID;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '战斗');
        root.setAttribute('tabindex', '-1');
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
        // 战斗演出全程（战前、开战过场、战斗、结算）不拖动立绘、卡面等素材；框选文字由样式层禁止。
        root.addEventListener('dragstart', onDragStart);
        // 拖牌的指针事件挂在根节点：拖动中指针捕获到根节点，移出手牌区也能跟随。
        for (const [type, fn] of pointerListeners) root.addEventListener(type, fn);
        offCardArt = typeof options.subscribeCardImages === 'function' ? options.subscribeCardImages(() => onCardArtUpdated()) : null;
        offItemArt = typeof options.subscribeItemImages === 'function' ? options.subscribeItemImages(() => onCardArtUpdated()) : null;
        offPortraits = typeof options.subscribePortraits === 'function' ? options.subscribePortraits(() => onPortraitsUpdated()) : null;
        offSession = typeof s.subscribe === 'function' ? s.subscribe(onSessionChanged) : null;
        overlay.appendChild(root);
        overlay.classList?.toggle('igs-record-screen-open', true);
        // 战斗期间隐藏背后的剧情文字（对话层），背景与立绘保留。
        overlay.setAttribute?.('data-igs-combat-open', '');
        setStagePauseReason(overlay, PAUSE_REASON, true);
        battleMusic(overlay, true);
        const cur = s.state();
        if (cur.lobby) controlledId = cur.lobby.heroId;
        const busy = ['battle', 'ended', 'send-failed', 'preparing'].includes(cur.status);
        const same = cur.anchor?.messageId === messageId && ['lobby', 'blocked', 'done', 'skipped'].includes(cur.status);
        render();
        watchControlDock();
        syncSpeedWatch();
        // 鞭尸中途关掉面板：重开时敌人已全灭，停顿后照常结束回合判胜。
        maybeFinish();
        if (messageId !== null && !busy && !same) prepare();
        else if (cur.status === 'done') loadRewards();
        // 焦点落在面板本身而不是关闭按钮：打开时右上角不画焦点环，按 Tab 仍从关闭按钮开始。
        root.focus?.();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        token += 1;
        stopDockWatch?.();
        stopDockWatch = null;
        try { abort?.abort(); } catch (error) { /* 已结束 */ }
        abort = null;
        clearCutins();
        endDrag();
        hideScaleTip();
        held.clear(); drawnLook.clear(); swaps.clear(); entering.clear();
        hoverInst = '';
        itemsOpen = false;
        hitGen += 1;
        if (stage) cancelBattleFx(stage);
        if (speedWatch) { speedWatch.disconnect(); speedWatch = null; }
        root.removeEventListener?.('click', onClick);
        root.removeEventListener?.('dragstart', onDragStart);
        for (const [type, fn] of pointerListeners) root.removeEventListener?.(type, fn);
        try { if (typeof offCardArt === 'function') offCardArt(); } catch (error) { /* 宿主已卸载 */ }
        offCardArt = null;
        try { if (typeof offItemArt === 'function') offItemArt(); } catch (error) { /* 宿主已卸载 */ }
        offItemArt = null;
        try { if (typeof offPortraits === 'function') offPortraits(); } catch (error) { /* 宿主已卸载 */ }
        offPortraits = null;
        try { if (typeof offSession === 'function') offSession(); } catch (error) { /* 会话已丢弃 */ }
        offSession = null;
        drawnStatus = ''; drawnRecordError = ''; drawnPortraits = '';
        if (artTimer !== null) {
            try { (typeof options.clear === 'function' ? options.clear : (t) => clearTimeout(t))(artTimer); } catch (error) { /* 已触发 */ }
            artTimer = null;
        }
        root.remove();
        root = null;
        stage = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        pageOverlay?.removeAttribute?.('data-igs-combat-open');
        setStagePauseReason(pageOverlay, PAUSE_REASON, false);
        battleMusic(pageOverlay, false);
        pageOverlay = null;
        pending = ''; rewards = null; selected = null; chosen = []; settling = false; lobbyShown = false; autoGen = -1; flipShown = null; resultShown = null;
        const focus = previousFocus;
        previousFocus = null;
        focus?.focus?.();
        return { ok: true };
    }

    return {
        open, close, dispose: close, invoke, cancelSelection,
        isOpen: () => Boolean(root),
        refresh: render,
        view: () => (root ? snapshot() : null),
    };
}
