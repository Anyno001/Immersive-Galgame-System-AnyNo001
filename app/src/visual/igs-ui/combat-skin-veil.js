// 黑幕皮肤 · 战斗中画面：照搬概念稿 gal/战斗界面设计稿/概念/第二轮/veil/common.js 的标记，假数据换成真实视图 v.battle。
// 样式在 combat-skin-veil-concept-style.js（由设计稿 CSS 生成）与本文件末尾的接线样式。动作照旧走 data-combat-act / data-combat-id。
import { esc } from './reader-value-utils.js';
import { cardFxHtml } from './combat-card-text.js';
import { resourceBarHtml } from './combat-resource-bar.js';
import { skinIntentHtml } from './combat-intent.js';
import { enemyArtKeyFor } from '../../combat/enemy-art.js';
import { enemyArtTopOf } from './combat-enemy-art.js';
import { battlePick, canvasW, ringVars, SKILL_ICON_SVG, ITEM_ICON_SVG, rewardCardMarkup, rewardRowMarkup } from './combat-skin-canvas.js';
import { powerBadgesHtml } from './combat-power-badges.js';
import { statusChipAttrs } from './combat-status-tips.js';
import { COMBAT_SKIN_VEIL_CONCEPT_CSS } from './combat-skin-veil-concept-style.js';
import { KEYWORD_CHAR, KEYWORD_NAME_TIPS, cardMainKeyword, cardValueDelta } from './combat-panel-model.js';

// 概念稿 window.SCHEME（定稿.html）；pw / hd 为敌人头顶信息区的宽与下沉量，hw 为手牌区宽度（common.css .hand）。
const CFG = {
    ring: {
        port: { rx: 150, w: 330, lift: 60, back: 0.55, dim: 0.45, base: 22, pw: 300, hd: 31 },
        land: { rx: 410, w: 390, lift: 80, back: 0.58, dim: 0.5, base: -54, pw: 330, hd: 25 },
    },
    hand: {
        port: { cw: 62, ch: 94, step: 38, sw: 114, sh: 186, arc: 0.5, lean: 2, rot: 1.2, bottom: 6, hw: 382 },
        land: { cw: 100, ch: 144, step: 108, left: true, sw: 142, sh: 224, arc: 1.0, lean: 3, rot: 1.2, bottom: 8, hw: 650 },
    },
    // 结束回合外圈（common.css .end .ring：按钮外扩 5px）
    endRing: { port: { w: 86, h: 54 }, land: { w: 160, h: 54 } },
};

const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
    shield: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    potion: P('<path d="M9.5 3h5M10.5 3v5L6 17a3 3 0 0 0 2.7 4.5h6.6A3 3 0 0 0 18 17l-4.5-9V3"/><path d="M8.2 15h7.6"/>'),
    blade: P('<path d="M5 19L17 7M17 7h-5M17 7v5M5 19l2.500-.5M5 19l.5-2.500"/>'),
    blades: P('<path d="M4 18L12 6l8 12"/><path d="M8 18l4-6 4 6"/>'),
    drop: P('<path d="M12 4c3.500 4.500 6 7.500 6 10.500a6 6 0 0 1-12 0C6 11.500 8.500 8.500 12 4z"/>'),
};
// 牌型母题：48x48，以 x=24 为轴居中。
const MOTIF = {
    atk: '<svg viewBox="0 0 48 48"><path d="M24 2L34 27L24 46L14 27Z" fill="currentColor" stroke="none"/></svg>',
    def: '<svg viewBox="0 0 48 48"><path d="M24 5L40 11V25C40 35 33 41 24 45C15 41 8 35 8 25V11Z" stroke-width="5" stroke-linejoin="miter"/></svg>',
    skl: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" stroke-width="5" stroke-dasharray="72 29" transform="rotate(-126 24 24)"/><circle cx="24" cy="24" r="3.5" fill="currentColor" stroke="none"/></svg>',
    pow: '<svg viewBox="0 0 48 48"><path d="M24 3L45 24L24 45L3 24Z" stroke-width="4" stroke-linejoin="miter"/><path d="M24 15L33 24L24 33L15 24Z" fill="currentColor" stroke="none"/></svg>',
};
const TYPE = { attack: 'atk', skill: 'skl', power: 'pow' };
const RARITY = { common: ' r-common', uncommon: ' r-uncommon', rare: ' r-rare', epic: ' r-epic', mythic: ' r-myth', signature: ' r-myth' };
const CHOICE_VERB = { discard: '弃掉', copy: '复制', 'cost-mod': '减费' };

const nameLines = (n) => { const ch = [...String(n)]; if (ch.length <= 3) return [String(n)]; const k = Math.ceil(ch.length / 2); return [ch.slice(0, k).join(''), ch.slice(k).join('')]; };
const initial = (name) => esc(String(name || '').slice(0, 1));
// 头像：有立绘用 <img>（地址已在面板层过滤），没有立绘写名字首字（概念稿 face-i）。
const faceInner = (url, name) => (url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : initial(name));
const faceCls = (url) => (url ? '' : ' face-i');
// 敌人立绘：素材库图 > 通用图集一格 > 首字。
const foeArt = (url, cell, name) => (url ? `<img class="cx-art-img" src="${esc(url)}" alt="" loading="lazy" decoding="async">`
    : cell ? `<i class="igs-combat-art" data-atlas="${esc(cell.atlas)}" style="--ea-x:${esc(cell.x)};--ea-y:${esc(cell.y)}"></i>` : `<span class="cx-initial">${initial(name)}</span>`);
const pctOf = (u) => (u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0);
const hpBar = (u, ally) => `<div class="hpbar cx-hp" style="--igs-combat-hp:${pctOf(u)}%"><i${ally ? ' class="ally"' : ''}></i></div>`;
// 单位可点：选目标时是目标，否则点开详情。
const unitAct = (u, pickable) => (pickable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`目标 ${u.name}`)}"`
    : ` data-combat-act="unit-info" data-combat-id="${esc(u.id)}" data-unit-info="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`查看${u.name}的技能与被动`)}"`);
const unitCls = (u, pickable) => `cx-unit${u.alive ? '' : ' is-down'}${pickable ? ' is-targetable' : ''}`;
const unitData = (u) => ` data-unit="${esc(u.id)}" data-side="${esc(u.side)}"`;

// 手牌扇形：照搬概念稿 layout()。选中牌放大并盖在邻牌之上，其余保持原位。
function handLayout(n, sel, H) {
    const step = n > 1 ? Math.min(H.step, (H.hw - H.cw - 4) / (n - 1)) : H.step;
    const x0 = H.left ? 0 : Math.round((H.hw - (step * (n - 1) + H.cw)) / 2);
    return Array.from({ length: n }, (_, i) => {
        const o = i - (n - 1) / 2, on = i === sel;
        const off = sel < 0 || on ? 0 : i < sel ? -(H.sw - H.cw) / 2 : (H.sw - H.cw) / 2;
        const left = on ? Math.round(x0 + i * step + H.cw / 2 - H.sw / 2) : Math.round(x0 + i * step + off);
        return { left, z: i + 1, ty: on ? 0 : Math.round(o * o * H.arc - o * H.lean), rot: on ? '0' : (o * H.rot).toFixed(1) };
    });
}

function cardHtml(c, i, pos, v, picks, energy) {
    const t = TYPE[c.type] || 'skl';
    const live = c.playable || c.choosable;
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const cut = c.baseCost !== undefined && c.cost < c.baseCost;
    const sig = c.rarity === 'signature' || c.rarity === 'personal';
    const sel = v.selected === c.inst;
    const poor = !(live && c.cost <= energy);
    const state = c.temp ? ' tmp' : c.stack > 1 ? ' stk' : '';
    const kws = [...new Set([...(c.keywordNames || []), sig && '招牌'].filter(Boolean))];
    const lines = nameLines(`${c.name}`);
    // 数值居中、单位小字在下方，差值接在单位后；点放大牌的大数值弹出来源说明。
    const delta = cardValueDelta(c);
    const valTip = sel && (c.valueTip || c.bonusNote) ? ` data-scale-tip="${esc(c.valueTip || c.bonusNote)}"` : '';
    const val = Number.isFinite(c.value) ? `<div class="val"><b${valTip}>${esc(c.value)}</b><span class="ut">${esc(c.unit || '')}${delta ? `<i class="delta">${esc(delta)}</i>` : ''}</span></div>` : `<div class="val no-num">${MOTIF[t]}</div>`;
    const badge = chosen ? '' : `${c.stack > 1 ? `<i class="bd">×${esc(c.stack)}</i>` : ''}${c.upgraded ? '<i class="bd up">强</i>' : ''}`;
    const dear = c.baseCost !== undefined && c.cost > c.baseCost;
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    const p = pos[i];
    const mainKw = cardMainKeyword(c.keywordNames);
    // 窄签小注只写关键字单字（与其他皮肤一致）；放大牌的 .kws 列全称。
    const kwm = !sel && mainKw ? `<i class="kwm one">${esc(KEYWORD_CHAR[mainKw] || mainKw)}</i>` : '';
    const xtra = !sel && c.extra ? `<span class="xtra">${esc(c.extra)}</span>` : '';
    const cls = `card t-${t}${c.upgraded ? ' enhd' : ''}${RARITY[c.rarity] || ''}${poor ? ' poor' : ''}${cut ? ' cut' : ''}${sig ? ' sig' : ''}${state}${sel ? ' sel' : ''}${chosen ? ' chosen' : ''}${dear ? ' dear' : ''}${c.choosable && !chosen ? ' cand' : ''}${xtra ? ' has-st' : ''}`;
    return `<div class="${cls}" style="left:${p.left}px;z-index:${p.z};--ty:${p.ty}px;--rot:${p.rot}deg" role="button" tabindex="0" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}`
        + `${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}">`
        + `<i class="rb"></i><div class="cost">${esc(c.cost)}</div>${badge}${cut || dear ? `<s class="c0">${esc(c.baseCost)}</s>` : ''}`
        + `<div class="plate"><div class="mt">${MOTIF[t]}</div></div>`
        + `<div class="nm">${lines.map((l) => `<span>${esc(l)}</span>`).join('')}</div>`
        + `${val}${kwm}${xtra}<div class="kws">${kws.map((k) => `<span class="kw" data-k="${esc(k)}"${KEYWORD_NAME_TIPS[k] ? ` data-scale-tip="${esc(KEYWORD_NAME_TIPS[k])}"` : ''}>${esc(k)}</span>`).join('')}</div>`
        + `<div class="ds">${cardFxHtml(c)}</div><div class="tip"></div><i class="ck">✓</i></div>`;
}

function foeHtml(u, i, f, n, L, v, pick) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const ring = ringVars(i, f, n, L);
    const it = u.intent;
    const intent = skinIntentHtml(it, { empty: '<div class="intent"></div>' });
    const fcs = `${u.block ? `<span class="fc blk">${ICON.shield}<b>${esc(u.block)}</b></span>` : ''}${u.statuses.map((s) => `<span class="fc"${statusChipAttrs(s)}>${esc(s.label)}<b>${esc(s.stacks)}</b></span>`).join('')}`;
    const ok = pick.pickable(u);
    const kind = enemyArtKeyFor({ art: u.art, name: u.name });
    return `<div class="foe k-${esc(kind)}${ring.front ? ' front' : ''}${ok ? ' target' : ''} ${unitCls(u, ok)}"${unitData(u)} style="${ring.style};--pw:${L.pw}px;--hd:${L.hd}px;--atop:${enemyArtTopOf(arts[u.name])}"${unitAct(u, ok)}>`
        + `<div class="art">${foeArt(pics[u.name], arts[u.name], u.name)}</div>`
        + `<div class="head">${intent}<div class="row2">${hpBar(u, false)}<span class="hv cx-hp-value">${esc(u.hp)}/${esc(u.maxHp)}</span></div>`
        + `<div class="row3">${u.tier ? `<b class="tier">${u.tier === 'boss' ? '首领' : '精英'}</b>` : ''}<span class="nn">${esc(u.name)}</span>${fcs}${powerBadgesHtml(u)}</div></div></div>`;
}

function leadHtml(hero, v, pick) {
    const pics = v.portraits || {};
    const b = v.battle;
    const ok = pick.pickable(hero);
    const aw = b.awaken && !b.awaken.used && b.awaken.usable && !b.outcome ? b.awaken : null;
    const awBtn = aw ? `<svg class="awr" viewBox="0 0 52 52" aria-hidden="true"><circle class="rt" cx="26" cy="26" r="24" pathLength="1"/><circle class="rp" cx="26" cy="26" r="24" pathLength="1" stroke-dasharray="1 1"/></svg>`
        + `<span class="aw cx-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" role="button" tabindex="0" title="${esc(`觉醒·${aw.label}：${aw.text}`)}" aria-label="${esc(`觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}，不消耗能量，每场一次`)}">觉醒·${esc(aw.label)}</span>` : '';
    const chips = `${hero.block ? `<span class="chip">${ICON.shield}格挡 <b>${esc(hero.block)}</b></span>` : ''}${hero.statuses.map((s) => `<span class="chip"${statusChipAttrs(s)}>${esc(s.label)} <b>${esc(s.stacks)}</b></span>`).join('')}`;
    return `<div class="lead ${unitCls(hero, ok)}"${unitData(hero)}>`
        + `<div class="face cx-face${faceCls(pics[hero.name])}${ok ? ' pick' : ''}"${unitAct(hero, ok)}>${faceInner(pics[hero.name], hero.name)}${awBtn}</div>`
        + `<div class="info"><div class="n">${esc(hero.name)}<span class="hp"><b class="cx-hp-cur">${esc(hero.hp)}</b><small>/${esc(hero.maxHp)}</small></span></div>${hpBar(hero, true)}`
        + `<div class="chips">${chips}${powerBadgesHtml(hero)}</div>${resourceBarHtml(hero.res, { row: 'chips', item: 'chip' })}</div></div>`;
}

function mateHtml(u, v, pick) {
    const ok = pick.pickable(u);
    const url = (v.portraits || {})[u.name];
    const st = u.statuses.map((s) => `<span class="st"${statusChipAttrs(s)}>${esc(s.label)}${esc(s.stacks)}</span>`).join('');
    return `<div class="mate ${unitCls(u, ok)}"${unitData(u)}${unitAct(u, ok)}><div class="mface${faceCls(url)}${ok ? ' pick' : ''}">${faceInner(url, u.name)}</div>`
        + `<div class="mn">${esc(u.name)}${st}</div>${hpBar(u, true)}${powerBadgesHtml(u, { compact: true })}</div>`;
}

function trackHtml(b, v) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const list = (b.order || []).slice(0, 6);
    return `<div class="track" role="img" aria-label="${esc(`行动顺序：${list.map((o) => o.name).join('、')}`)}">${list.map((o, i) => {
        const pic = pics[o.name] ? `<img src="${esc(pics[o.name])}" alt="" loading="lazy" decoding="async">`
            : arts[o.name] && arts[o.name].atlas !== 'none' ? `<i class="igs-combat-art" data-atlas="${esc(arts[o.name].atlas)}" style="--ea-x:${esc(arts[o.name].x)};--ea-y:${esc(arts[o.name].y)}"></i>` : initial(o.name);
        const side = o.side === 'ally' ? (o.id === b.heroId ? ' me' : ' ally') : ' en';
        return `<span class="who cx-dot${i === 0 ? ' now' : ''}${side}${pics[o.name] || arts[o.name] ? '' : ' face-i'}" style="--atop:${enemyArtTopOf(arts[o.name])}" data-unit="${esc(o.id)}" title="${esc(o.name)}">${pic}</span>`;
    }).join('')}</div>`;
}

const topBtn = (act, label, cls, extra = '') => `<button type="button" class="${cls}" data-combat-act="${act}"${extra}>${esc(label)}</button>`;

export function veilBattleHtml(v, orient) {
    const b = v.battle;
    const land = orient === 'land';
    const L = CFG.ring[orient];
    // 竖屏手牌区随画布宽（两侧各留 4px），横屏手牌区固定在中部。
    const landW = Math.min(canvasW('land') - 40, 1360);
    // 横屏手牌占横条余下的全部宽度（整体放大 1.15 倍，布局宽度按 1/1.15 折算）。
    const H = land ? { ...CFG.hand.land, hw: Math.floor((landW - Math.min(Math.max(landW * 0.26, 280), 380) - 168) / 1.15) } : { ...CFG.hand.port, hw: Math.min(canvasW('port') - 32, 400) };
    const pick = battlePick(v);
    const ended = Boolean(b.outcome);
    const hero = b.allies.find((u) => u.id === b.heroId) || b.allies.find((u) => u.controlled) || null;
    const mates = b.allies.filter((u) => u !== hero);
    const choice = b.choice || null;
    const picks = choice && Array.isArray(v.chosen) ? v.chosen : [];
    const selIdx = b.hand.findIndex((c) => c.inst === v.selected);
    const pos = handLayout(b.hand.length, selIdx, H);
    const f = (() => { const i = b.enemies.findIndex((u) => u.id === v.front); if (i >= 0) return i; const a = b.enemies.findIndex((u) => u.alive); return a >= 0 ? a : 0; })();
    const foes = b.enemies.map((u, i) => foeHtml(u, i, f, b.enemies.length, L, v, pick)).join('');
    // 顶栏：标题、回合、倍速、撤退、关闭。撤退常驻，设计稿没有取消键：再点同一张牌或点空白处撤销选中。
    const live = !ended && v.status === 'battle';
    const retreat = live && b.canEscape ? topBtn('escape', '撤退', 'retreat') : '';
    const speed = (v.status === 'battle' || v.settling) ? topBtn('speed', '×2', 'spd', ` aria-pressed="${(v.fxSpeed || 1) > 1 ? 'true' : 'false'}" aria-label="演出二倍速"`) : '';
    const top = `<div class="topbar"><span class="title" title="${esc(v.encounter || '战斗')}">${esc(v.encounter || '战斗')}</span>${live ? `<span class="round">第 ${esc(b.turn)} 回合</span>` : ''}<span class="sp"></span>`
        + `<span class="tr">${speed}${retreat}<button type="button" class="ic" data-combat-act="close" aria-label="关闭">${ICON.close}</button></span></div>`;
    const per = Math.max(Number(b.energyPerTurn) || 0, Number(b.energy) || 0);
    const energy = `<div class="energy" role="img" aria-label="${esc(`能量 ${b.energy}/${b.energyPerTurn}`)}"><div class="v">${esc(b.energy)}<small>/${esc(b.energyPerTurn)}</small></div>`
        + `<div class="pips">${Array.from({ length: per }, (_, i) => `<i class="${i < b.energy ? '' : 'off'}"></i>`).join('')}</div></div>`;
    // 主动特性（最多 2 个）：概念稿的「人物技能」钮，第二颗放在第一颗左边。
    const traits = (Array.isArray(b.traits) ? b.traits : b.heroSkill ? [{ ...b.heroSkill, kind: 'active', innate: true }] : []).filter((t) => t.kind === 'active');
    const skills = traits.map((t, k) => {
        const id = t.skillId ? `hero-skill:${t.skillId}` : 'hero-skill';
        return `<button type="button" class="opskill cx-trait${k ? ' is-second' : ''}${v.selected === id ? ' on' : ''}${t.usable ? '' : ' off'}" data-combat-act="hero-skill"${t.skillId ? ` data-combat-id="${esc(t.skillId)}"` : ''} data-trait="${esc(t.id)}"`
            + `${t.usable ? '' : ' aria-disabled="true"'} aria-label="${esc(`主动特性 ${t.name} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`)}" title="${esc(t.name)}">${SKILL_ICON_SVG}${Number(t.cost) > 1 ? `<em class="bdg">${esc(t.cost)}</em>` : ''}</button>`;
    }).join('');
    const items = (b.items || []).filter((i) => i.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    const trayOn = Boolean(v.itemsOpen && items.length);
    const opbag = `<button type="button" class="opbag${items.length ? '' : ' off'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${trayOn ? 'true' : 'false'}"${items.length ? '' : ' aria-disabled="true"'} aria-label="道具" title="道具">${ITEM_ICON_SVG}${total > 1 ? `<em class="bdg">${esc(total)}</em>` : ''}</button>`;
    // 托盘提示：选中道具后写明要选哪一边。
    const itemSel = pick.item ? pick.picked : null;
    const itemFoe = Boolean(itemSel?.targets?.some((id) => b.enemies.some((u) => u.id === id)));
    const hint = itemSel ? (itemSel.targets?.length ? (itemFoe ? '选择一名敌方目标' : '选择一名我方目标') : '点击承受方使用') : '选择一名我方目标';
    const tray = `<div class="tray${itemSel ? ' ask' : ''}" role="menu" aria-label="道具"><div class="hint">${hint}</div>${items.map((i) => `<button type="button" role="menuitem" class="cell${i.usable ? '' : ' off'}${v.selected === `item:${i.itemId}` ? ' on' : ''}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : ICON.potion}<span>${esc(i.name)}</span><em>×${esc(i.count)}</em></button>`).join('')}</div>`;
    const R = CFG.endRing[orient];
    const ring = `<svg class="ring" xmlns="http://www.w3.org/2000/svg" width="${R.w}" height="${R.h}" aria-hidden="true"><rect class="rt" x="1" y="1" width="${R.w - 2}" height="${R.h - 2}" pathLength="1"/><rect class="rp" x="1" y="1" width="${R.w - 2}" height="${R.h - 2}" pathLength="1"/></svg>`;
    const endBtn = choice
        ? `<button type="button" class="end" data-combat-act="choose-confirm"${picks.length === choice.count ? '' : ' aria-disabled="true"'}>${ring}<span>${esc(CHOICE_VERB[choice.kind] || '选择')} ${picks.length}/${esc(choice.count)}</span></button>`
        : `<button type="button" class="end" data-combat-act="end-turn"${b.canEndTurn ? '' : ' aria-disabled="true"'}>${ring}<span>结束回合</span></button>`;
    const hand = `<div class="hand cx-hand" style="--cw:${H.cw}px;--ch:${H.ch}px;--sw:${H.sw}px;--sh:${H.sh}px;--hb:${H.bottom}px">${b.hand.map((c, i) => cardHtml(c, i, pos, v, picks, b.energy)).join('')}</div>`;
    const pile = (cls, lg, sh, n) => `<div class="piles ${cls}" title="${lg}堆"><span class="pile"><span class="lg">${lg}</span><span class="sh">${sh}</span> <b>${esc(n)}</b></span></div>`;
    // 抽牌堆在手牌区左端外侧，弃牌堆在右端外侧，底部对齐手牌。
    const piles = pile('pile-d', '抽牌', '抽', b.piles.draw) + pile('pile-r', '弃牌', '弃', b.piles.discard);
    const ops = ended ? '' : `${energy}${hand}${tray}${skills}${opbag}${piles}${endBtn}`;
    const askFoe = pick.picked && b.enemies.some((u) => pick.pickable(u));
    const askAlly = Boolean(pick.picked?.targets?.length) && b.allies.some((u) => pick.pickable(u));
    const cls = `igs-cx-canvas${land ? ' land' : ' port'}${trayOn ? ' tray-on' : ''}${askAlly ? ' ask-ally' : ''}${askFoe ? ' ask-foe' : ''}${selIdx >= 0 ? ' has-sel' : ''}${ended ? ' is-ended' : ''}`;
    return `<div class="igs-cx-wrap"><div id="igs-cx-canvas" class="${cls}" data-cx="veil">`
        + '<div class="stage"></div><div class="shade a"></div><div class="shade b"></div><div class="shade c"></div>'
        + `<section class="foes cx-field" data-turn="${esc(b.turn)}" style="--base:${L.base}px">${foes}</section>`
        + `${top}${live ? trackHtml(b, v) : ''}`
        + `<div class="deck">${hero ? leadHtml(hero, v, pick) : ''}<div class="mates">${mates.map((u) => mateHtml(u, v, pick)).join('')}</div>${ops}</div>`
        + '</div></div>';
}
export const battleHtml = veilBattleHtml;

// 接线样式：画布缩放居中、真实立绘与头像、手牌尺寸变量、可点性、交互状态。设计稿没有的状态尽量用设计稿已有的语言（金 = 选中 / 可选，红 = 敌意）。
const S = '#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"])';
const C = '#igs-overlay #igs-cx-canvas:where([data-cx="veil"])';
const VEIL_WIRING_CSS = `
#igs-overlay #igs-combat-panel .igs-cx-wrap{position:absolute;inset:0;overflow:hidden;}
${C}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--cx-scale,1));transform-origin:50% 50%;background:transparent;}
${S} .stage{background:none;}
/* 行动顺序：横屏与竖屏一样竖排在左侧 */
${C}.land .track{flex-direction:column;gap:8px;}
${C}.land .track .who{width:28px;height:28px;}
${S} .track .who.now{box-shadow:0 0 0 2px var(--gold);}
${S} .who img,${S} .face img,${S} .mface img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;border-radius:50%;}
/* 行动顺序只露头像：立绘放大取头部，矮身形按看得见的头顶下移取景 */
${S} .track .who img{inset:auto;left:-50%;top:-6%;width:200%;height:200%;object-position:50% 0;border-radius:0;}
${S} .track .who .igs-combat-art{inset:auto;left:-32.5%;top:calc(6% - var(--atop,0) * 220%);width:165%;height:220%;}
${S} .mface{position:relative;overflow:hidden;flex:none;}
${S} .who.face-i{position:relative;}
${S} .face{overflow:visible;cursor:pointer;}
${S} .face-i{background-color:#26272b;}
${S} .foe .art .cx-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;}
${S} .foe .art .cx-initial{position:absolute;inset:18% 20% 0;display:grid;place-items:center;font:600 64px var(--cn);color:#3a3b40;}
${S} .hpbar.cx-hp>i{width:var(--igs-combat-hp,0%);transition:width .3s;}
${S} .foe .intent svg{fill:none;}
${S} .foe .intent:empty{display:none;}
/* 与漫画统一的头顶位置：意图签与血条之间留出间距 */
${C} .foe .intent{margin-bottom:18px;}
/* 可点性：.deck 内的容器不接收指针，头像与队友行单独放开 */
${S} .deck .lead .face,${S} .deck .mate{pointer-events:auto;}
/* 手牌：尺寸、位置、扇形由手牌区变量与单张牌的 left / --ty / --rot 给出 */
${S} .hand .card{width:var(--cw);height:var(--ch);bottom:var(--hb);transform:translateY(var(--ty,0px)) rotate(var(--rot,0deg));}
${S} .hand .card.sel{width:var(--sw);height:var(--sh);transform:none;}
${S} .hand .card.is-lifted{opacity:.35;}
${S} .card .val b{font-style:normal;}
${S} .card[aria-disabled="true"]{cursor:default;}
/* 第二轮：操作区。黑幕自己的语言：锐利方块、近黑渐变、顶边一道细亮线，不用圆圈图标；数字用金色 */
${C} .opbag,${C} .opskill{height:40px;padding:0 10px;background:linear-gradient(to bottom,#2a2a2e,#121214);box-shadow:inset 0 1px 0 #4a4a4f;font:600 12px var(--cn);letter-spacing:1px;white-space:nowrap;}
${C} .opskill{display:inline-flex;align-items:center;justify-content:center;gap:5px;}
${C} .energy{filter:drop-shadow(0 2px 6px #0a0a0b) drop-shadow(0 0 1px #0a0a0b);}
${C} .opskill.on,${C} .opbag[aria-expanded="true"]{background:var(--gold);color:#121214;box-shadow:none;}
${S} .opskill.off,${S} .opbag.off{opacity:.45;}
/* 技能可发动：一道细光沿按钮边框环绕（conic-gradient 旋转，只动 transform，约 2.4s 一圈）；不可发动或选中时不显示；低画质、减少动态效果时为静态细光边。只用于技能，不给道具与结束回合 */
${C} .opskill:not(.off):not(.on){position:absolute;overflow:hidden;isolation:isolate;}
${C} .opskill:not(.off):not(.on)::before{content:"";position:absolute;left:50%;top:50%;width:220%;aspect-ratio:1;z-index:-2;background:conic-gradient(from 0deg,transparent 0 72%,var(--gold) 100%);transform:translate(-50%,-50%) rotate(0deg);animation:cx-veil-flow 2.4s linear infinite;pointer-events:none;}
${C} .opskill:not(.off):not(.on)::after{content:"";position:absolute;inset:1px;z-index:-1;background:linear-gradient(to bottom,#2a2a2e,#121214);pointer-events:none;}
@keyframes cx-veil-flow{to{transform:translate(-50%,-50%) rotate(360deg);}}
@media (prefers-reduced-motion:reduce){${C} .opskill:not(.off):not(.on)::before{animation:none;}}
#igs-overlay[data-igs-quality="low"] ${C} .opskill:not(.off):not(.on)::before,${C}.is-reduced .opskill:not(.off):not(.on)::before{animation:none;}
/* 竖屏：手牌正上方一行，道具、技能在左端，能量居中，结束回合在右端（右手拇指区）；靠右元素以右缘定位 */
${C}.port{--hw:min(calc(var(--cx-w) - 32px),400px);--hl:calc((var(--cx-w) - var(--hw)) / 2);--gl:var(--hl);--gw:min(calc(var(--cx-w) - 32px),440px);--gx:calc((var(--cx-w) - var(--gw)) / 2);}
/* 竖屏统一版心：手牌居中，两侧各一个小牌堆（左抽右弃）；行动点数与操作行左缘对齐左牌堆左缘，结束回合右缘对齐右牌堆右缘；底栏主战者与队友成组居中 */
/* 技能、道具：44×44 独立按钮，只留图标（22px 居中），数量大于 1 时右上角小角标；行动点数：固定尺寸块，数字与上限同一基线，点珠在数字下方居中 */
${C} :is(.opskill,.opbag){width:44px;height:44px;padding:0;display:inline-flex;align-items:center;justify-content:center;overflow:visible;}
${C} :is(.opskill,.opbag) svg{width:22px;height:22px;flex:none;}
${C} .opskill:not(.off):not(.on){overflow:hidden;}
${C} :is(.opskill,.opbag) .bdg{position:absolute;right:-4px;top:-4px;z-index:3;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border-radius:8px;background:var(--gold);color:#121214;font:700 12px/16px var(--num);font-style:normal;text-align:center;}
${C} .opskill:not(.off):not(.on) .bdg{right:1px;top:1px;}
${C} .energy{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;height:44px;}
${C} .energy .v{line-height:1;white-space:nowrap;}
${C} .energy .pips{display:flex;justify-content:center;gap:4px;}
${C} .energy .pips i{width:8px;height:8px;}
${C}.port .energy{left:auto;right:calc(16px + 88px);top:532px;width:100px;}
${C}.port .energy .v{font-size:40px;}
${C}.port .energy .v small{font-size:20px;}
${C}.port :is(.opskill,.opbag){top:537px;}
${C}.port .opskill{left:16px;}
${C}.port .opskill.is-second{left:calc(16px + 56px);}
${C}.port .opbag{left:16px;}
${C}.port .opskill ~ .opbag{left:calc(16px + 56px);}
${C}.port .opskill.is-second ~ .opbag{left:calc(16px + 112px);}
${C}.land .energy{left:var(--rl);top:530px;width:100px;height:88px;}
${C}.land .energy .v{font-size:56px;}
${C}.land .energy .v small{font-size:24px;}
${C}.land .energy .pips i{width:10px;height:10px;}
${C}.land :is(.opskill,.opbag){top:640px;}
${C}.land .opskill{left:var(--rl);}
${C}.land .opskill.is-second{left:var(--rl);top:494px;}
${C}.land .opbag{left:var(--rl);}
${C}.land .opskill ~ .opbag{left:calc(var(--rl) + 56px);}
${C}.port .end{left:auto;right:16px;top:532px;}
${C}.port .lead{left:var(--gx);width:calc(var(--gw) - 144px);}
${C}.port .lead .info{width:calc(var(--gw) - 144px - 54px);}
${C}.port .lead .info .hpbar{height:4px;}
${C}.port .mates{left:auto;right:var(--gx);width:132px;}
${C}.port .piles{top:736px;height:16px;width:80px;}
${C}.port .pile .lg{font-size:12px;}
${C}.port .pile b{font-size:14px;line-height:16px;}
${C}.port .piles.pile-d{left:var(--gl);}
${C}.port .piles.pile-r{left:calc(var(--hl) + var(--hw) - 80px);justify-content:flex-end;}
${C}.port .tray{top:auto;bottom:280px;}
/* 横屏：能量在手牌上方居中；技能、道具、结束回合在右侧成一列；抽牌、弃牌在右侧成一列；队友行在主战者下方左缘对齐。手牌区以画布中线居中 */
${C}.land{--W:min(calc(var(--cx-w) - 40px),1360px);--L:calc((var(--cx-w) - var(--W)) / 2);--wi:clamp(280px,calc(var(--W) * .26),380px);--rl:calc(var(--L) + var(--wi) + 16px);--hl:calc(var(--rl) + 152px);--hwv:calc(var(--L) + var(--W) - var(--hl));}
/* 横屏底部横条（扁宽饱满）：版心 W 水平居中，左→右紧挨：信息组、资源列、手牌；手牌上沿一行放抽牌弃牌（左）与结束回合（右） */
${C}.land .hand{left:var(--hl);width:calc(var(--hwv) / 1.15);transform:scale(1.15);transform-origin:0 100%;top:auto;bottom:44px;height:236px;}
${C}.port .hand{transform:scale(1.2);transform-origin:50% 100%;}
${C}.land .end{left:auto;right:max(24px,calc(var(--L) - 80px));top:430px;width:152px;}
${C}.land .lead{left:var(--L);top:508px;width:var(--wi);}
${C}.land .lead .face{width:72px;height:72px;}
${C}.land .lead .info{width:calc(var(--wi) - 84px);}
${C}.land .lead .info .hpbar{height:6px;}
${C}.land .mates{left:var(--L);top:604px;width:var(--wi);}
${C}.land .mate{height:28px;}
${C}.land .piles{top:472px;width:72px;justify-content:flex-start;}
${C}.land .piles.pile-d{left:var(--hl);}
${C}.land .piles.pile-r{left:calc(var(--hl) + 80px);}
${C}.land .tray{left:var(--hl);right:auto;top:auto;bottom:256px;width:380px;}
/* 横屏统一版心：信息组左缘 = L，手牌右缘 = L + W；手牌上沿一行（能量、技能、道具、弹性空白、结束回合）与手牌左右缘对齐，整行底边高于选中牌顶边 */
/* 横屏左上：回合做成标题右侧小标签（基线对齐），行动顺序与标题左缘对齐并留出间距 */
${C}.land .topbar{flex-direction:row;align-items:baseline;gap:12px;}
${C}.land .topbar .round{margin-top:0;}
/* 竖屏右上按钮组靠 margin-left:auto 推到右缘，概念稿全局 * {margin:0} 是双 id 会盖掉单 id 的写法，这里同级重申 */
${C}.port .topbar .tr{margin:0 8px 0 auto;}
${C}.land .track{left:44px;top:92px;}
/* 抽牌堆在手牌左下外侧、弃牌堆在右下外侧，小牌堆图标（叠两张小卡形，实色）加数字，底边对齐手牌底边 */
${C} .piles{z-index:70;height:20px;align-items:flex-end;gap:10px;width:38px;}
${C} .piles .sh{display:none;}
${C} .pile{display:flex;align-items:baseline;gap:4px;white-space:nowrap;}
${C} .pile .lg{font-size:10px;color:var(--dim);}
${C}.land .pile .lg{font-size:12px;}
${C} .pile b{font-size:15px;line-height:17px;margin:0;color:var(--text);}
/* 横屏最小字号 12px */
${C}.land :is(.round,.who,.aw,.mface,.mn,.st,.bd,.up,.ds,.kw,.c0,.hint,.eh,.fc,.chip,.card em,.card i){font-size:12px;}
/* 第三轮·牌面信息规范：不用描边表示稀有度。罕见顶带灰；稀有顶带亮 + 费用标填亮；史诗再加顶光；神话再加扫光；强化金「+」角标；叠加「×N」；能力牌母题 */
${C} .card,${C} .card[class*=" r-"]{border:1px solid #3a3a3f;--rf:0 0 0 0 transparent;}
${C} .card::before,${C} .card[class*=" r-"]::before{border:1px solid #2e2e32;}
${C} .card .rb{position:absolute;left:0;right:0;top:0;height:3px;background:transparent;z-index:1;pointer-events:none;}
${C} .card.r-uncommon .rb{background:#7d7e84;}
${C} .card:is(.r-rare,.r-epic,.r-myth,.r-sig) .rb{background:#ece9e1;}
${C} .card .cost{background:#2a2a2e;color:var(--text);}
${C} .card:is(.r-rare,.r-epic,.r-myth) .cost{background:#ece9e1;color:#121214;}
${C} .card.cut .cost{background:#2a2a2e;color:var(--jade);box-shadow:none;}
${C} .card.cut:is(.r-rare,.r-epic,.r-myth) .cost{background:#ece9e1;color:#0f7a52;}
${C} .card.dear .cost{color:var(--red);} ${C} .card.dear:is(.r-rare,.r-epic,.r-myth) .cost{color:#c4352a;}
${C} .card:is(.r-epic,.r-myth):not(.sel){background:linear-gradient(to top,var(--tc) 0 4px,transparent 4px),linear-gradient(to bottom,#3d3e45 0,#1c1c1e 48%);}
${C} .card.r-myth:not(.sel) .rb::after{content:"";position:absolute;left:0;top:0;width:100%;height:140px;background:linear-gradient(105deg,transparent 35%,rgba(255,247,238,.2) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:cx-veil-sheen 4.2s ease-in-out infinite;}
@keyframes cx-veil-sheen{0%,55%{background-position:-150% 0;}100%{background-position:150% 0;}}
@media (prefers-reduced-motion:reduce){${C} .card.r-myth .rb::after{animation:none;}}
${C} .card .bd{position:absolute;right:3px;top:3px;z-index:2;min-width:14px;height:14px;padding:0 3px;background:#3a3a3f;color:var(--text);font:700 10px/14px var(--num);font-style:normal;text-align:center;}
${C} .card .bd.up{background:var(--gold);color:#121214;}
${C} .card .bd.up{right:7px;top:5px;min-width:14px;padding:0;background:var(--gold);color:#121214;font:700 10px/14px var(--cn);}
${C} .card.sel .bd.up{right:9px;top:9px;min-width:20px;height:20px;font-size:13px;line-height:20px;}
${C} .card.enhd .bd:not(.up){top:21px;}
/* 二稿卡面：数值居中、单位与差值、附加效果、关键字小注、原费小圆、说明去重 */
${C} .card .val{left:0;right:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:0;transform:none;}
${C} .card .val b{display:block;margin:0;}
${C} .card .val .ut{display:block;margin-top:2px;font:500 8px/8px var(--cn);color:var(--dim);white-space:nowrap;letter-spacing:.04em;}
${C} .card .val .ut .delta{margin-left:3px;font-style:normal;font-size:.9em;font-weight:400;color:#6e6e74;}
${C} .card:not(.sel) .val{bottom:8px;height:auto;}
${C} .card:not(.sel) .val b{font-size:15px;line-height:13px;}
${C} .card.has-st:not(.sel) .val{bottom:16px;}
${C} .card .xtra{position:absolute;left:4px;right:4px;bottom:5px;z-index:2;text-align:center;font:600 8.5px/9px var(--cn);color:var(--text);white-space:nowrap;overflow:hidden;}
${C} .card:not(.sel) .nm{top:27px;}
${C} .card.sel .val{top:67px;bottom:auto;height:auto;}
${C} .card.sel .val b{font-size:37px;line-height:35px;}
${C} .card.sel .val .ut{margin-top:3px;font-size:12px;line-height:13px;}
${C} .card.sel .kws{top:129px;}
${C} .card.sel .ds{top:151px;text-align:center;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
${C} .card .kwm{position:absolute;right:7px;top:8px;z-index:3;padding:0 0 2px;font:400 8px/10px var(--cn);font-style:normal;letter-spacing:.12em;color:#9a9993;box-shadow:inset 0 -1px 0 #55555b;white-space:nowrap;}
${C} .card.enhd .kwm{right:23px;letter-spacing:.04em;}
${C} .card.enhd .kwm.one{right:25px;}
${C} .card.sel .kws .kw{width:auto;height:auto;padding:0 1px 3px;border-radius:0;background:none;color:#9a9993;font:400 10px/12px var(--cn);letter-spacing:.12em;box-shadow:inset 0 -1px 0 #55555b;}
${C} .card .val b[data-scale-tip]{cursor:help;}
${C} .card .c0{display:block;box-sizing:border-box;margin:0;padding:0;border-radius:50%;background:#1c1c1e;box-shadow:inset 0 0 0 1px #55555b;color:var(--dim);text-align:center;font:600 7px/10px var(--num);text-decoration:line-through;text-decoration-thickness:1px;z-index:4;left:12.5px;top:12.5px;width:10px;height:10px;}
${C} .card.sel .c0{left:22.85px;top:22.85px;width:13px;height:13px;font-size:9px;line-height:13px;}
/* 横屏：牌更大，数值区、小注与原费小圆按横屏牌面放大 */
${C}.land .card:not(.sel) .nm{top:40px;}
${C}.land .card:not(.sel) .val b{font-size:20px;line-height:18px;}
${C}.land .card .val .ut{font-size:11px;line-height:11px;}
${C}.land .card .val .ut .delta{font-size:.9em;}
${C}.land .card.has-st:not(.sel) .val{bottom:20px;}
${C}.land .card .xtra{bottom:6px;font-size:11px;line-height:12px;}
${C}.land .card .kwm{font-size:11px;line-height:13px;}
${C}.land .card.sel .val{top:76px;}
${C}.land .card.sel .val b{font-size:38px;line-height:36px;}
${C}.land .card.sel .val .ut{font-size:13px;line-height:14px;}
${C}.land .card.sel .kws{top:136px;}
${C}.land .card.sel .ds{top:158px;}
${C}.land .card .c0{left:22.5px;top:22.5px;width:14px;height:14px;font-size:10px;line-height:14px;}
${C}.land .card.sel .c0{left:28.85px;top:28.85px;width:17px;height:17px;font-size:11px;line-height:17px;}
#igs-overlay #igs-combat-panel[data-igs-combat-skin="veil"]>.igs-combat-scale-tip{border-radius:0;background:#161618;color:#ece6d8;box-shadow:inset 0 0 0 1px #c9a96a;}
${C} .card .val.no-num svg{width:24px;height:24px;color:var(--tc);} ${C}.land .card .val.no-num svg{width:30px;height:30px;}
${C} .card.sel{box-shadow:0 0 26px rgba(244,242,236,.3),0 14px 26px rgba(0,0,0,.7);}
${C} .card.sel .bd{right:6px;top:6px;height:18px;min-width:18px;font-size:12px;line-height:18px;}
${C} .card.sel .val.no-num svg{width:34px;height:34px;} ${C}.land .card.sel .val.no-num svg{width:42px;height:42px;}
${C} .card.cand,${C} .card.chosen{box-shadow:0 0 0 2px #ece9e1,0 8px 18px rgba(0,0,0,.55);}
${C} .card.chosen .ck{color:#ece9e1;}
/* 第三轮：矮身形按看得见的头顶抬高放大 */
${C} .foe.k-beast .art,${C}.land .foe.k-beast .art{scale:none;translate:none;}
${S} .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.95)) scale(calc(1 + var(--atop,0) * .15));transform-origin:50% 100%;} ${C}.land .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.4)) scale(calc(1 + var(--atop,0) * .8));}
/* 第三轮：按住确认读 --hold */
${C} .end .ring .rp{stroke-dasharray:var(--hold,0) 1;}
/* 横屏左下：觉醒签与队友行留出间距 */
${S} .topbar .ic{cursor:pointer;} ${C} .topbar .ic{font-size:18px;}
${S} .topbar .spd{cursor:pointer;} ${S} .topbar .spd[aria-pressed="true"]{color:var(--gold);}
${S} .cell img{grid-row:1 / 3;width:22px;height:22px;object-fit:contain;}
${S} .end[aria-disabled="true"]{opacity:.5;}
${S} .foe.is-drop-hover .art{filter:brightness(1.3) saturate(1.1) drop-shadow(0 0 18px rgba(255,238,184,.5));}
${S} :is(.lead .face,.mate .mface).is-drop-hover{box-shadow:0 0 18px 3px rgba(255,238,184,.8);}
${S} .foe.is-acting .art{filter:brightness(1.15) drop-shadow(0 0 16px rgba(255,238,184,.45));}
${S} .who.is-acting{box-shadow:0 0 0 2px var(--gold);}
${S} .foe.is-down{opacity:.35;filter:grayscale(1);pointer-events:none;}
${S} :is(.lead,.mate).is-down :is(.face,.mface){filter:grayscale(1) brightness(.5);}
${C}.is-ended .foes{pointer-events:none;}
/* 出牌影子：外层按视口矩形定位，内层按画布缩放 */
#igs-overlay .igs-cx-ghost{position:absolute;pointer-events:none;z-index:30;}
#igs-overlay .igs-cx-ghost>.hand{position:absolute;left:0;top:0;width:calc(100% / var(--cx-scale,1));height:calc(100% / var(--cx-scale,1));transform:scale(var(--cx-scale,1));transform-origin:0 0;}
#igs-overlay .igs-cx-ghost>.hand>.card{left:0;top:0;bottom:auto;transform:none;}
`;

// 影子容器没有 .port 类：设计稿里「.port 后代」规则同样套到非横屏的影子上。
const concept = COMBAT_SKIN_VEIL_CONCEPT_CSS.split('.igs-cx-ghost[data-cx="veil"]).port').join('.igs-cx-ghost[data-cx="veil"]):is(.port,.igs-cx-ghost:where(:not(.land)))');
export const STYLE_TEXT = `${concept}${VEIL_WIRING_CSS}`;

// 结算三选一：候选牌用本皮肤放大牌的完整卡面，一行静态排布。
const REWARD_SIZE = { port: { w: 114, h: 186 }, land: { w: 142, h: 224 }, avail: { port: 362, land: 560 } };
export const rewardRowHtml = (views, { orient, chosen, dim, pending }) => rewardRowMarkup('veil', orient, views.map((view, index) => rewardCardMarkup(
    cardHtml(view, 0, [{ left: 0, z: 1, ty: 0, rot: '0' }], { selected: view.inst }, [], 99), { index, chosen: chosen === index, dim, pending })), { ...REWARD_SIZE[orient], avail: REWARD_SIZE.avail?.[orient] }, `--cw:${CFG.hand[orient].cw}px;--ch:${CFG.hand[orient].ch}px;--sw:${CFG.hand[orient].sw}px;--sh:${CFG.hand[orient].sh}px;`, views.map((v) => v.fxText));
