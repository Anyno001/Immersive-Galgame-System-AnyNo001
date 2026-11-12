// 漫画皮肤 · 战斗中画面：照搬概念稿 gal/战斗界面设计稿/概念/第二轮/comic/common.js 的标记，假数据换成真实视图 v.battle。
// 样式在 combat-skin-comic-concept-style.js（由设计稿 CSS 生成）与本文件末尾的接线样式。动作照旧走 data-combat-act / data-combat-id。
import { esc } from './reader-value-utils.js';
import { cardFxHtml } from './combat-card-text.js';
import { resourceBarHtml } from './combat-resource-bar.js';
import { intentIconSvg, portraitSilhouetteSvg } from './combat-card-art.js';
import { enemyArtKeyFor } from '../../combat/enemy-art.js';
import { enemyArtTopOf } from './combat-enemy-art.js';
import { ITEM_ICON_SVG, SKILL_ICON_SVG, battlePick, canvasW, handLayout, handVars, ringVars, rewardCardMarkup, rewardRowMarkup } from './combat-skin-canvas.js';
import { COMBAT_SKIN_COMIC_CONCEPT_CSS } from './combat-skin-comic-concept-style.js';
import { KEYWORD_CHAR, KEYWORD_NAME_TIPS, cardMainKeyword, cardValueDelta } from './combat-panel-model.js';

// 概念稿 window.CFG（定稿.html）
const CFG = {
    ring: { port: { rx: 150, w: 330, lift: 60, back: 0.55, dim: 0.45, base: 300 }, land: { rx: 410, w: 390, lift: 80, back: 0.58, dim: 0.5, base: 130 } },
    // over：手牌少时步距不超过窄签宽度的这个倍数，保持设计稿的交叠，整手居中。
    hand: { port: { vis: 50, ch: 112, ts: 1, fs: 1.18, drop: 8, arc: 0.35, rot: 1.0, minL: 158, maxL: 158, over: 0.97 }, land: { vis: 90, ch: 172, ts: 1.6, fs: 1.55, drop: 6, arc: 0.5, rot: 1.0, over: 1.06 } },
    // 手牌区宽：竖屏随画布宽（两侧各留 8），横屏固定；圆环横向半径随画布宽比例伸展
    handW: (orient, w) => { if (orient !== 'land') return Math.min(w - 32, 400); const lw = Math.min(w - 40, 1360); return lw - Math.min(Math.max(Math.round(lw * 0.26), 280), 380) - 132; },
    designW: { port: 390, land: 1280 },
};

const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
    shield: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    blade: P('<path d="M5 19L17 5l2 2-8 14z" fill="currentColor" stroke="none"/>'),
    fan: P('<path d="M4 18L12 4M12 19V4M20 18L12 4" />'),
    heart: P('<path d="M12 20C5 15 4 11 4 8.5A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 1.5C20 11 19 15 12 20z" fill="currentColor" stroke="none"/>'),
    potion: P('<path d="M9 3h6M10 3v5l-4 9a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-4-9V3M8 15h8"/>'),
};
const MOTIF = {
    atk: '<svg viewBox="0 0 64 64"><path fill="currentColor" d="M10 52L42 8l10 4-30 44z"/><path fill="currentColor" d="M44 50l8-18 4 2-6 18z"/></svg>',
    def: '<svg viewBox="0 0 64 64"><path fill="currentColor" fill-rule="evenodd" d="M32 6l22 8v16c0 14-10 23-22 28C20 53 10 44 10 30V14zM32 17l-12 4v9c0 8 5 14 12 18 7-4 12-10 12-18v-9z"/></svg>',
    skl: '<svg viewBox="0 0 64 64"><path fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" d="M32 10a22 22 0 1 1-17 8"/></svg>',
    pow: '<svg viewBox="0 0 64 64"><path fill="currentColor" d="M32 4l20 28-20 28L12 32z"/><path fill="#000" d="M32 18l9 14-9 14-9-14z"/></svg>',
};
const TYPE = { attack: 'atk', skill: 'skl', power: 'pow' };
const RARITY = { common: 'common', uncommon: 'uncommon', rare: 'rare', epic: 'epic', mythic: 'myth', personal: 'own', signature: 'sign' };
const CHOICE_VERB = { discard: '弃掉', copy: '复制', 'cost-mod': '减费' };

// 头像：有立绘用 <img>（地址已在面板层过滤），没有立绘写名字首字。
const face = (url, name) => (url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : esc(String(name || '').slice(0, 1)));
// 敌人立绘：素材库图 > 通用图集一格 > 中性剪影。
const foeArt = (url, cell, name) => (url ? `<img class="cx-art-img" src="${esc(url)}" alt="" loading="lazy" decoding="async">`
    : cell ? `<i class="igs-combat-art" data-atlas="${esc(cell.atlas)}" style="--ea-x:${esc(cell.x)};--ea-y:${esc(cell.y)}"></i>` : `<span class="cx-silhouette">${portraitSilhouetteSvg(name)}</span>`);
const hpBar = (u, ally) => {
    const pct = u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0;
    return `<div class="hpbar${ally ? ' ally' : ''} cx-hp" style="--igs-combat-hp:${pct}%"><i></i>${ally ? '' : `<span class="cx-hp-value">${esc(u.hp)}/${esc(u.maxHp)}</span>`}</div>`;
};
// 单位可点：选目标时是目标，否则点开详情（敌人不在正前方时转到正前方）。
const unitAct = (u, pickable) => (pickable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`目标 ${u.name}`)}"`
    : ` data-combat-act="unit-info" data-combat-id="${esc(u.id)}" data-unit-info="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`查看${u.name}的技能与被动`)}"`);
const unitCls = (u, pickable) => `cx-unit${u.alive ? '' : ' is-down'}${pickable ? ' is-targetable' : ''}`;
const unitData = (u) => ` data-unit="${esc(u.id)}" data-side="${esc(u.side)}"`;

function cardHtml(c, i, pos, v, picks, energy) {
    const t = TYPE[c.type] || 'skl';
    const r = RARITY[c.rarity] ? ` r-${RARITY[c.rarity]}` : '';
    const live = c.playable || c.choosable;
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const cut = c.baseCost !== undefined && c.cost < c.baseCost;
    const rise = c.baseCost !== undefined && c.cost > c.baseCost;
    const sel = v.selected === c.inst;
    const badge = c.choosable ? `<i class="bd pick${chosen ? ' on' : ''}"></i>` : c.stack ? `<i class="bd">×${esc(c.stack)}</i>` : '';
    // 改动后的原费：斜贴在费用框左下角的小价签；增费的费用框是橙色网点底。
    const cost = `<div class="cost${cut ? ' cut' : rise ? ' rise' : ''}">${cut || rise ? `<s>${esc(c.baseCost)}</s>` : ''}<b>${esc(c.cost)}</b></div>`;
    // 单位小字在数值下方，差值接在单位后；点放大牌的大数值弹出来源说明。没有数值的牌（能力等）在数值位放该牌型的母题图形，窄签不留空。
    const delta = cardValueDelta(c);
    const valTip = sel && (c.valueTip || c.bonusNote) ? ` data-scale-tip="${esc(c.valueTip || c.bonusNote)}"` : '';
    const val = Number.isFinite(c.value) ? `<div class="val"><b${valTip}>${esc(c.value)}</b><span class="un">${esc(c.unit || '')}${delta ? `<i class="dl">${esc(delta)}</i>` : ''}</span></div>` : `<div class="val no-num"><b>${MOTIF[t]}</b></div>`;
    const hitbar = c.hits > 1 ? `<i class="hitbar" aria-hidden="true">${'<i></i>'.repeat(Math.min(c.hits, 6))}</i>` : '';
    const upk = c.upgraded ? '<i class="upk">强</i>' : '';
    const mainKw = cardMainKeyword(c.keywordNames);
    const kmk = mainKw ? `<i class="kmk">${esc(KEYWORD_CHAR[mainKw])}</i>` : '';
    const kx = (c.keywordNames || []).length ? `<div class="kx">${c.keywordNames.map((n) => `<i class="kmk" data-k="${esc(n)}" data-scale-tip="${esc(KEYWORD_NAME_TIPS[n] || n)}">${esc(n)}</i>`).join('')}</div>` : '';
    const xtra = c.extra ? `<em class="xtra">${esc(c.extra)}</em>` : '';
    const name = esc(c.name);
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    const p = pos[i];
    const cls = `card t-${t}${r}${c.temp ? ' temp' : ''}${c.stack ? ' stack' : ''}${c.hits > 1 ? ' hit' : ''}${c.upgraded ? ' has-up' : ''}${c.extra ? ' has-st' : ''}${live && c.cost <= energy ? '' : ' poor'}${sel ? ' sel' : ''}${v.hovered === c.inst ? ' is-hover' : ''}`;
    return `<button type="button" class="${cls}" style="left:${p.left}px;z-index:${p.z};--tx:${p.tx}px;--rot:${p.rot}deg" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}`
        + `${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}">`
        + `<div class="tab">${cost}<div class="name">${name}</div>${val}${badge}${hitbar}${xtra}${kmk}${upk}</div>`
        + `<div class="full">${cost}<div class="name">${name}</div><div class="motif">${MOTIF[t]}</div>${val}${hitbar}`
        + `<p class="desc">${cardFxHtml(c)}</p>${kx}${upk}</div></button>`;
}

function foeHtml(u, i, f, n, L, v, pick) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const ring = ringVars(i, f, n, L);
    const it = u.intent;
    const intent = it ? `<div class="intent" title="${esc(`${it.label}·${it.name}${it.damage ? `，${it.damage} 点伤害` : ''}`)}">${intentIconSvg(it.kind)}${it.damage ? `<b>${esc(it.damage)}</b>` : ''}<em>${esc(it.damage ? it.name : `${it.label}·${it.name}`)}</em></div>` : '';
    const bars = u.block || u.statuses.length
        ? `<div class="bars">${u.block ? `<span class="blk">${ICON.shield}<b>${esc(u.block)}</b></span>` : ''}${u.statuses.map((s) => `<span class="st">${esc(s.label)}<b>${esc(s.stacks)}</b></span>`).join('')}</div>` : '';
    const ok = pick.pickable(u);
    const kind = enemyArtKeyFor({ art: u.art, name: u.name });
    return `<div class="foe k-${esc(kind)}${ring.front ? ' front' : ''}${ring.rear ? ' rear' : ''} ${unitCls(u, ok)}"${unitData(u)} style="${ring.style};--atop:${enemyArtTopOf(arts[u.name])}"${unitAct(u, ok)}>`
        + `<div class="art">${foeArt(pics[u.name], arts[u.name], u.name)}</div><div class="head">${intent}`
        + `<div class="plate"><span class="nm">${esc(u.name)}</span>${u.tier ? `<em class="tier">${u.tier === 'boss' ? '首' : '精'}</em>` : ''}${hpBar(u, false)}</div>${bars}<i class="pickmark"></i></div></div>`;
}

function leadHtml(hero, v, pick) {
    const pics = v.portraits || {};
    const b = v.battle;
    const ok = pick.pickable(hero);
    const aw = b.awaken && !b.awaken.used && b.awaken.usable && !b.outcome ? b.awaken : null;
    const awBtn = aw ? `<span class="aw cx-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" role="button" tabindex="0" title="${esc(`觉醒·${aw.label}：${aw.text}`)}" aria-label="${esc(`觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}，不消耗能量，每场一次`)}">觉醒·${esc(aw.label)}</span>` : '';
    const chips = `${hero.block ? `<span class="chip">${ICON.shield}<b>${esc(hero.block)}</b></span>` : ''}${hero.statuses.map((s) => `<span class="chip">${esc(s.label)} <b>${esc(s.stacks)}</b></span>`).join('')}`;
    return `<div class="lead ${unitCls(hero, ok)}"${unitData(hero)}>`
        + `<div class="face cx-face"${unitAct(hero, ok)}>${aw ? '<i class="chg"></i>' : ''}${face(pics[hero.name], hero.name)}</div>${awBtn}`
        + `<div class="info"><div class="n">${esc(hero.name)}<span class="hp"><b class="cx-hp-cur">${esc(hero.hp)}</b>/${esc(hero.maxHp)}</span></div>${hpBar(hero, true)}`
        + `<div class="chips">${chips}</div>${resourceBarHtml(hero.res, { row: 'chips', item: 'chip' })}</div></div>`;
}

function mateHtml(u, v, pick) {
    const ok = pick.pickable(u);
    const n = u.statuses.length;
    return `<div class="mate ${unitCls(u, ok)}"${unitData(u)}${unitAct(u, ok)}><div class="mface">${face((v.portraits || {})[u.name], u.name)}${n ? `<i class="mst">${n}</i>` : ''}</div>`
        + `<div class="mn">${esc(u.name)}</div>${hpBar(u, true)}</div>`;
}

function trackHtml(b, v) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const list = (b.order || []).slice(0, 6);
    return `<div class="track" role="img" aria-label="${esc(`行动顺序：${list.map((o) => o.name).join('、')}`)}">${list.map((o, i) => {
        const pic = pics[o.name] ? `<img src="${esc(pics[o.name])}" alt="" loading="lazy" decoding="async">`
            : arts[o.name] && arts[o.name].atlas !== 'none' ? `<i class="igs-combat-art" data-atlas="${esc(arts[o.name].atlas)}" style="--ea-x:${esc(arts[o.name].x)};--ea-y:${esc(arts[o.name].y)}"></i>` : `<b>${esc(String(o.name).slice(0, 1))}</b>`;
        return `<span class="who cx-dot${i === 0 ? ' now' : ''}${o.side === 'ally' && i ? ' ally' : ''}" style="--atop:${enemyArtTopOf(arts[o.name])}" data-unit="${esc(o.id)}" title="${esc(o.name)}">${pic}</span>`;
    }).join('')}</div>`;
}

const textBtn = (act, label, cls = 'retreat', extra = '') => `<button type="button" class="${cls}" data-combat-act="${act}"${extra}><span>${esc(label)}</span></button>`;

export function comicBattleHtml(v, orient) {
    const b = v.battle;
    const land = orient === 'land';
    const cw = canvasW(orient);
    const H = CFG.hand[orient], L = { ...CFG.ring[orient], rx: Math.round(CFG.ring[orient].rx * cw / CFG.designW[orient]) };
    const pick = battlePick(v);
    const ended = Boolean(b.outcome);
    const hero = b.allies.find((u) => u.id === b.heroId) || b.allies.find((u) => u.controlled) || null;
    const mates = b.allies.filter((u) => u !== hero);
    const choice = b.choice || null;
    const picks = choice && Array.isArray(v.chosen) ? v.chosen : [];
    const selIdx = b.hand.findIndex((c) => c.inst === v.selected);
    // 横屏：手牌尽量摊开（间距最大到不重叠），仍填不满时左对齐、紧贴资源列；手牌区宽度取实际占宽
    const nHand = b.hand.length;
    const handLimit = CFG.handW(orient, cw);
    const handBox = land ? Math.min(handLimit, Math.round(H.vis + H.vis * (H.over || 1) * Math.max(0, nHand - 1))) : handLimit;
    const pos = handLayout(nHand, selIdx, H, handBox);
    const f = (() => { const i = b.enemies.findIndex((u) => u.id === v.front); if (i >= 0) return i; const a = b.enemies.findIndex((u) => u.alive); return a >= 0 ? a : 0; })();
    const foes = b.enemies.map((u, i) => foeHtml(u, i, f, b.enemies.length, L, v, pick)).join('');
    // 顶栏：标题、回合、倍速、撤退、关闭（撤退 / 倍速只做文字，用户 11-02 定）。撤退常驻，设计稿没有取消键：再点同一张牌或点空白处撤销选中。
    const live = !ended && v.status === 'battle';
    const speed = (v.status === 'battle' || v.settling) ? textBtn('speed', '×2', 'spd', ` aria-pressed="${(v.fxSpeed || 1) > 1 ? 'true' : 'false'}" aria-label="演出二倍速"`) : '';
    const side = live && b.canEscape ? textBtn('escape', '撤退') : '';
    const top = `<div class="top"><span class="title" title="${esc(v.encounter || '战斗')}"><b>${esc(v.encounter || '战斗')}</b></span>${live ? `<span class="round"><small>第</small><b>${esc(b.turn)}</b><small>回合</small></span>` : ''}`
        + `<span class="sp"></span>${speed}${side}<button type="button" class="ctl" data-combat-act="close" aria-label="关闭">${ICON.close}</button></div>`;
    // 待选提示：待选阶段写「弃掉 k/N」，选中道具写用法；其余时候不出。
    const sel = pick.item ? pick.picked : null;
    const pendingText = choice ? `选择${esc(CHOICE_VERB[choice.kind] || '')} <b>${picks.length}</b>/${esc(choice.count)}`
        : sel ? `<b>${esc(sel.name)}</b> ${sel.targets?.length ? '选择目标' : '点击承受方使用'}` : '';
    // 设计稿操作区的浅色装饰线常驻，只有待选时才写提示文字。
    const pending = ended ? '' : `<div class="pending"${pendingText ? '' : ' aria-hidden="true"'}><span>${pendingText}</span></div>`;
    const per = Math.max(Number(b.energyPerTurn) || 0, Number(b.energy) || 0);
    const energy = `<div class="energy" role="img" aria-label="${esc(`能量 ${b.energy}/${b.energyPerTurn}`)}"><div class="v">${esc(b.energy)}<small>/${esc(b.energyPerTurn)}</small></div>`
        + `<div class="pips">${Array.from({ length: per }, (_, i) => `<i class="${i < b.energy ? '' : 'off'}"></i>`).join('')}</div></div>`;
    // 主动特性（最多 2 个）：圆钮写「技」，右上角是费用；第二颗在第一颗右边。
    const traits = (Array.isArray(b.traits) ? b.traits : b.heroSkill ? [{ ...b.heroSkill, kind: 'active', innate: true }] : []).filter((t) => t.kind === 'active');
    const skills = traits.map((t, k) => {
        const id = t.skillId ? `hero-skill:${t.skillId}` : 'hero-skill';
        return `<button type="button" class="skill cx-trait${k ? ' is-second' : ''}${v.selected === id ? ' on' : ''}${t.usable ? '' : ' off'}" data-combat-act="hero-skill"${t.skillId ? ` data-combat-id="${esc(t.skillId)}"` : ''} data-trait="${esc(t.id)}"`
            + `${t.usable ? '' : ' aria-disabled="true"'} aria-label="${esc(`主动特性 ${t.name} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`)}">${SKILL_ICON_SVG}${Number(t.cost) > 1 ? `<i>${esc(t.cost)}</i>` : ''}</button>`;
    }).join('');
    const items = (b.items || []).filter((i) => i.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    const itemBtn = `<button type="button" class="item${traits.length > 1 ? ' is-shift' : ''}${items.length ? '' : ' off'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${v.itemsOpen && items.length ? 'true' : 'false'}"${items.length ? '' : ' aria-disabled="true"'} title="道具" aria-label="道具">${ITEM_ICON_SVG}${total > 1 ? `<i>${total}</i>` : ''}</button>`;
    const tray = `<div class="tray" role="menu" aria-label="道具">${items.map((i) => `<button type="button" role="menuitem" class="slot${i.usable ? '' : ' off'}${v.selected === `item:${i.itemId}` ? ' on' : ''}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : ICON.potion}<b>${esc(i.name)}</b><i>×${esc(i.count)}</i></button>`).join('')}</div>`;
    const endBtn = choice
        ? `<button type="button" class="end" data-combat-act="choose-confirm"${picks.length === choice.count ? '' : ' aria-disabled="true"'}><b>${esc(CHOICE_VERB[choice.kind] || '选择')} ${picks.length}/${esc(choice.count)}</b></button>`
        : `<button type="button" class="end" data-combat-act="end-turn"${b.canEndTurn ? '' : ' aria-disabled="true"'}><b>结束回合</b></button>`;
    const hand = `<div class="hand cx-hand${selIdx >= 0 ? ' has-sel' : ''}" style="${handVars(H)}${land ? `;width:${handBox}px` : ''}">${b.hand.map((c, i) => cardHtml(c, i, pos, v, picks, b.energy)).join('')}</div>`;
    const piles = `<div class="piles"><span class="pl dr"><em>抽牌 </em><b>${esc(b.piles.draw)}</b></span><i></i><span class="pl dc"><em>弃牌 </em><b>${esc(b.piles.discard)}</b></span></div>`;
    const ops = ended ? '' : `${pending}${energy}${skills}${endBtn}${hand}${itemBtn}${tray}${piles}`;
    const cls = `igs-cx-canvas${land ? ' land' : ''}${pick.card || pick.skill ? ' aiming' : ''}${pick.item && pick.picked ? ' item-aim' : ''}${v.itemsOpen && items.length ? ' tray-on' : ''}${ended ? ' is-ended' : ''}`;
    return `<div class="igs-cx-wrap"><div id="igs-cx-canvas" class="${cls}" data-cx="comic">`
        + '<div class="stage"></div><div class="decor" aria-hidden="true"><i class="d1"></i><i class="d2"></i></div><div class="veil"></div>'
        + `${top}${live ? trackHtml(b, v) : ''}<section class="foes cx-field" data-turn="${esc(b.turn)}" style="--base:${L.base}px">${foes}</section>`
        + `${ops}${hero ? leadHtml(hero, v, pick) : ''}<div class="mates">${mates.map((u) => mateHtml(u, v, pick)).join('')}</div>`
        + '</div></div>';
}

// 接线样式：画布缩放居中、真实立绘与头像、目标 / 出手 / 拖动等交互状态。设计稿没有的状态尽量用设计稿已有的语言（红 = 敌意 / 选中、绿 = 我方）。
const S = '#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"])';
const C = '#igs-overlay #igs-cx-canvas:where([data-cx="comic"])';
const COMIC_WIRING_CSS = `
#igs-overlay #igs-combat-panel .igs-cx-wrap{position:absolute;inset:0;overflow:hidden;}
${C}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--cx-scale,1));transform-origin:50% 50%;background:transparent;}
${S} .stage{background:none;}
${S} .who img,${S} .lead .face img,${S} .mface img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;border-radius:50%;}
/* 行动顺序只露头像：立绘放大取头部，矮身形按看得见的头顶下移取景 */
${S} .track .who img{inset:auto;left:-50%;top:-6%;width:200%;height:200%;object-position:50% 0;border-radius:0;}
${S} .track .who .igs-combat-art{inset:auto;left:-32.5%;top:calc(6% - var(--atop,0) * 220%);width:165%;height:220%;}
${S} .who>b{position:absolute;inset:0;display:grid;place-items:center;font:900 12px var(--num);color:var(--cream);}
${S} .lead .face{display:grid;place-items:center;overflow:visible;background-color:#232429;font:900 22px var(--num);color:var(--cream);cursor:pointer;}
${S} .foe .art .cx-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 8px 14px rgba(0,0,0,.6));}
${S} .foe .art .cx-silhouette{position:absolute;inset:18% 20% 0;display:block;color:#3a3b40;}
${S} .foe .art .cx-silhouette svg{width:100%;height:100%;fill:currentColor;stroke:none;}
${S} .hpbar.cx-hp>i{width:var(--igs-combat-hp,0%);transition:width .3s;}
${S} .foe .intent svg{fill:none;}
${S} .lead .aw{z-index:2;cursor:pointer;left:31px;top:54px;bottom:auto;} ${C}.land .lead .aw{left:40px;top:76px;}
${S} .skill b{font:inherit;}
${S} .skill.on::before,${S} .item[aria-expanded="true"]::before{background:var(--red);}
${S} .skill.off,${S} .item.off{opacity:.45;}
${S} .slot img{width:20px;height:20px;object-fit:contain;}
${S} .end[aria-disabled="true"]{opacity:.5;}
/* 按住确认：设计稿 .end::after 按 --hold 从左填红；被选中的牌盖住操作区装饰线（设计稿里线在牌下） */
${S} .pending{z-index:1;border-bottom:0;}
/* 操作区装饰线（用户 11-02）：调淡成灰线，左端一小段红、末端一个红色斜切点；舞台横贯斜线意义不明，去掉 */
${S} .pending::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.5px;background:linear-gradient(90deg,var(--red) 0 26px,#55565b 26px calc(100% - 10px),var(--red) calc(100% - 10px));clip-path:polygon(0 0,100% 0,calc(100% - 3px) 100%,0 100%);}
${S} .decor{display:none;}
/* 牌面信息规范（落盘/牌面信息规范.md）：稀有度阶梯逐档累加——罕见顶边灰带；稀有顶边亮带 + 费用框亮底；史诗再加牌内顶光；神话再加缓慢扫光；专属 / 签名按史诗处理并保留红角。不用描边层数表示稀有度。 */
${S} .card,${S} .card[class*=" r-"]{--rf:inset 0 0 0 1px #3a3b41;}
${S} .card:not(.sel){box-shadow:var(--rf),0 2px 8px rgba(0,0,0,.6);}
${S} .card .tab::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--rb,transparent);border-radius:3px 3px 0 0;z-index:1;}
${S} .card.r-uncommon{--rb:#7d7e84;}
${S} .card:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign){--rb:var(--cream);}
${S} .card:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost{--pc:var(--cream);color:var(--ink);}
${S} .card:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost b{color:var(--ink);} ${S} .card:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost.cut b{color:#0f7a52;}
${S} .card:is(.r-epic,.r-myth,.r-own,.r-sign):not(.sel){background:linear-gradient(to bottom,#3d3e45 0,var(--cbg) 48%);}
${S} .card.r-myth .tab{overflow:hidden;}
${S} .card.r-myth .tab::after{background:linear-gradient(100deg,var(--tc) 0 0) bottom/100% 5px no-repeat;}
${S} .card.r-myth:not(.sel)::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(105deg,transparent 35%,rgba(255,247,238,.22) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:cx-comic-sheen 4.2s ease-in-out infinite;}
@keyframes cx-comic-sheen{0%,55%{background-position:-150% 0;}100%{background-position:150% 0;}}
@media (prefers-reduced-motion:reduce){${S} .card.r-myth::before{animation:none;}}
/* 强化：金色「+」角标（金色只给强化）；能力牌母题图形 */
${S} .card .val.no-num b{width:30px;height:30px;margin:0 auto;color:var(--tc);} ${S} .card .val.no-num svg{width:100%;height:100%;}
/* 二稿卡面：数值竖排居中、单位与差值、多段并进色条、附加效果、强化「强」、关键字胶带、原费价签、增费网点 */
${C} .card .val{position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:0;left:50%;right:auto;width:auto;transform:translateX(-50%);white-space:nowrap;}
${C} .card .tab .val{bottom:7px;}
${C} .card .tab .val b{font-size:26px;line-height:.92;}
${S} .card .val .un{display:block;margin-top:1px;font:600 10px/.95 "Noto Sans SC",sans-serif;font-style:normal;color:var(--dim);}
${S} .card.sel .val .un{font-size:12px;margin-top:3px;}
${S} .card .val .un .dl{display:inline;margin-left:3px;font:400 9px/1 var(--num);font-style:normal;color:#6c6d72;}
${S} .card.sel .val .un .dl{font-size:11px;}
${S} .card.hit .tab::after,${S} .card.hit .full::after{display:none;}
${S} .card .hitbar{position:absolute;left:0;right:0;bottom:0;height:5px;display:flex;gap:3px;overflow:hidden;}
${S} .card .hitbar i{flex:1;background:var(--tc);transform:skewX(-35deg);}
${S} .card .full .hitbar{width:112px;right:auto;}
${S} .card .tab .name{top:38px;}
${C} .card.has-st:not(.sel) .tab .val{bottom:20px;}
${S} .card .xtra{position:absolute;left:2px;right:2px;bottom:6px;text-align:center;font:700 9px/1 "Noto Sans SC",sans-serif;font-style:normal;letter-spacing:-.02em;color:var(--cream);white-space:nowrap;overflow:hidden;}
${S} .card .full .motif{top:43px;}
${C} .card .full .val{top:88px;}
${C} .card .full .val b{font-size:36px;line-height:1;}
${S} .card .full .desc{top:148px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;text-align:center;}
${S} .card .full .name{right:6px;} ${S} .card.has-up .full .name{right:30px;}
${S} .card .val b[data-scale-tip]{cursor:help;}
${S} .card .upk{position:absolute;right:7px;top:6px;z-index:4;width:15px;height:15px;font:900 11px/15px "Noto Sans SC",sans-serif;font-style:normal;text-align:center;background:var(--gold);color:var(--ink);transform:skewX(-12deg);}
${S} .card .full .upk{right:8px;top:8px;width:18px;height:18px;font-size:13px;line-height:18px;}
${S} .card .kmk{display:block;box-sizing:border-box;min-width:16px;height:15px;padding:0 4px;font:900 12px/15px "Noto Sans SC",sans-serif;font-style:normal;text-align:center;color:var(--ink);background:#d4d3cd;transform:rotate(7deg);clip-path:polygon(0 8%,6% 0,12% 8%,18% 0,24% 8%,30% 0,36% 8%,42% 0,48% 8%,54% 0,60% 8%,66% 0,72% 8%,78% 0,84% 8%,90% 0,96% 8%,100% 0,100% 100%,94% 92%,88% 100%,82% 92%,76% 100%,70% 92%,64% 100%,58% 92%,52% 100%,46% 92%,40% 100%,34% 92%,28% 100%,22% 92%,16% 100%,10% 92%,4% 100%,0 92%);}
${S} .card .tab .kmk{position:absolute;right:7px;top:10px;z-index:4;min-width:12px;height:13px;padding:0;font-size:10px;line-height:13px;transform:none;}
${S} .card.has-up .tab .kmk{top:25px;}
${S} .card .full .kx{position:absolute;right:-8px;top:36px;z-index:4;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
${S} .card .full .kmk{height:22px;padding:0 10px;font-size:15px;line-height:22px;letter-spacing:.12em;}
${S} .card .full .kmk[data-k="消耗"]{transform:rotate(-9deg);}
${S} .card .full .kmk:not([data-k="消耗"]){transform:rotate(5deg);height:18px;line-height:18px;font-size:12px;}
${S} .card .cost s{position:absolute;left:1px;right:auto;top:18px;z-index:3;box-sizing:border-box;width:14px;height:11px;margin:0;padding:0;font:900 9px/9px var(--num);color:var(--ink);background:var(--cream);border:1px solid var(--ink);text-align:center;text-decoration:line-through;text-decoration-thickness:1px;transform:skewX(-12deg) rotate(-6deg);}
${S} .card .full .cost s{left:3px;top:22px;width:17px;height:13px;font-size:11px;line-height:11px;}
${S} .card .cost.rise{background:radial-gradient(circle,#b85a00 .9px,transparent 1.2px) 0 0/3.5px 3.5px,#ffa53d !important;color:#121212;}
${S} .card .cost.rise b{color:#121212;text-shadow:0 0 2px #ffa53d,0 0 2px #ffa53d,0 0 3px #ffa53d;}
/* 点开的解释：便签纸，左上角压一条胶带 */
#igs-overlay #igs-combat-panel[data-igs-combat-skin="comic"]>.igs-combat-scale-tip{width:140px;box-sizing:border-box;padding:14px 11px 9px;border-radius:0;background:#f4f2ec;color:#121214;box-shadow:3px 3px 0 #6b6c72;font:700 12px/1.5 "Noto Sans SC",sans-serif;rotate:2.5deg;white-space:normal;}
#igs-overlay #igs-combat-panel[data-igs-combat-skin="comic"]>.igs-combat-scale-tip::before{content:"";position:absolute;left:-14px;top:-9px;width:46px;height:18px;background:#d4d3cd;rotate:-7deg;clip-path:polygon(0 10%,5% 0,10% 10%,15% 0,20% 10%,25% 0,30% 10%,35% 0,40% 10%,45% 0,50% 10%,55% 0,60% 10%,65% 0,70% 10%,75% 0,80% 10%,85% 0,90% 10%,95% 0,100% 10%,100% 90%,95% 100%,90% 90%,85% 100%,80% 90%,75% 100%,70% 90%,65% 100%,60% 90%,55% 100%,50% 90%,45% 100%,40% 90%,35% 100%,30% 90%,25% 100%,20% 90%,15% 100%,10% 90%,5% 100%,0 90%);}
/* 矮身形（兽、龙蛇等，图集格上方留白多）：按看得见的头顶抬高并稍放大，头顶对到人形高度；头顶信息位置不变 */
${S} .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.95)) scale(calc(1 + var(--atop,0) * .15));transform-origin:50% 100%;} ${C}.land .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.4)) scale(calc(1 + var(--atop,0) * .8));}
${S} .top .spd{cursor:pointer;} ${S} .top .spd[aria-pressed="true"]{color:var(--red);}
${S} .top .retreat+.retreat{margin-left:-2px;}
${S} .track .who{flex:none;}
/* 用户 11-02：行动顺序横屏也竖排在左侧（各皮肤通用）；正前方敌人的状态栏（意图 + 名牌血条）抬高，离开立绘头部 */
${C}.land .track{left:14px;right:auto;top:72px;width:34px;height:auto;flex-direction:column;gap:9px;align-items:stretch;}
${S} .foe.front .head{translate:0 -16px;}
/* 横屏左下：觉醒签贴在头像底边，队友行与头像左缘对齐并与觉醒签留出间距 */
${C}.land .lead .aw{top:70px;} ${C}.land .mates{left:calc(var(--ll) + 4px);top:640px;} ${C}.land .foe.front .head{translate:0 -28px;}
/* 选目标：可选的敌人（不止正前方）都提亮 */
${C}.aiming .foe.is-targetable .art{filter:brightness(calc(var(--fl,1) * 1.1)) saturate(var(--fsat,1));}
${S} .foe.is-drop-hover .art{filter:brightness(1.3) saturate(1.1) drop-shadow(0 0 18px rgba(255,74,61,.7));}
${S} :is(.lead,.mate).is-targetable :is(.face,.mface){box-shadow:0 0 0 3px var(--jade),0 0 14px 4px rgba(111,224,180,.6);}
${S} :is(.lead,.mate).is-drop-hover :is(.face,.mface){box-shadow:0 0 0 3px var(--cream),0 0 18px 6px rgba(111,224,180,.8);}
/* 出手中、倒下、拖动中 */
${S} .foe.is-acting .art{filter:brightness(1.15) drop-shadow(0 0 16px rgba(255,74,61,.65));}
${S} :is(.lead,.mate).is-acting :is(.face,.mface){box-shadow:0 0 0 3px var(--acc),0 0 16px 5px rgba(255,247,238,.55);}
${S} .who.is-acting{box-shadow:0 0 0 2px var(--acc),0 0 0 4px var(--red);}
${S} .foe.is-down{opacity:.35;filter:grayscale(1);pointer-events:none;}
${S} :is(.lead,.mate).is-down :is(.face,.mface){filter:grayscale(1) brightness(.5);}
${S} .hand .card.is-lifted{opacity:.35;}
${C}.is-ended .foes{pointer-events:none;}
/* 顶栏：关卡名单行省略（下划线不拉长，只收缩不伸展），回合数与右侧按钮不被挤压 */
${S} .top .title{min-width:0;flex:0 1 auto;}
${S} .top .title b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${S} .top .round,${S} .top .ctl,${S} .top .retreat,${S} .top .spd{flex:none;white-space:nowrap;}
/* 画布宽度随面板伸展（--cx-w）：靠右元素用 right 贴右缘；横屏手牌区在画布居中（窄于设计稿时退回设计稿位置），能量、道具技能、托盘跟着手牌走 */
${C}:not(.land){width:var(--cx-w);}
${C}.land .top .title{max-width:calc(50% - 180px);}
${C} .energy{z-index:3;}
${C}.land{width:var(--cx-w);}
/* 操作区（用户 11-02 定）：能量在手牌正上方居中；道具技能在左（竖屏行左端，横屏手牌左侧）；结束回合、牌堆在右 */
/* 技能可发动：一道细光沿圆形按钮外沿环绕（转动的圆锥渐变经圆环遮罩只留 2px，只动 transform）；不可发动不显示；减少动态时为静态细光边 */
${S} .skill:not(.off)::after{content:"";position:absolute;inset:-5px;border-radius:50%;z-index:1;background:conic-gradient(from 0deg,transparent 0 76%,var(--red) 94%,transparent 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1.5px));animation:cx-comic-orbit 2.4s linear infinite;pointer-events:none;}
@keyframes cx-comic-orbit{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion:reduce){${S} .skill:not(.off)::after{animation:none;background:var(--red);opacity:.7;}}
${C}:where([data-igs-combat-reduced] *) .skill:not(.off)::after{animation:none;background:var(--red);opacity:.7;}
/* 竖屏统一布局（用户 11-02）：手牌居中，左右外侧抽/弃牌堆，三者为一组；操作行与点数左缘对齐抽牌堆左缘、结束回合右缘对齐弃牌堆右缘；底栏主战者与队友成组居中 */
${C}:not(.land){--hw:min(calc(var(--cx-w) - 32px), 400px);--hl:calc((var(--cx-w) - var(--hw)) / 2);--gl:var(--hl);--gr:calc(var(--hl) + var(--hw));--bw:min(calc(var(--cx-w) - 32px), 440px);--bl:calc((var(--cx-w) - var(--bw)) / 2);--gl:16px;--gr:calc(var(--cx-w) - 16px);}
${C}:not(.land) .hand{left:var(--hl);width:var(--hw);}
${C}:not(.land) .lead{left:var(--bl);top:756px;width:calc(var(--bw) - 152px);}
${C}:not(.land) .mates{top:745px;height:88px;width:140px;flex-direction:column;justify-content:center;gap:4px;}
${C}:not(.land) .mate{flex-direction:row;width:140px;height:26px;gap:6px;}
${C}:not(.land) .mate .mface{width:26px;height:26px;}
${C}:not(.land) .mate .mn{position:absolute;left:32px;top:0;}
${C}:not(.land) .mate .hpbar{position:absolute;left:32px;top:15px;width:100px;height:4px;}
${C}:not(.land) .mates{left:auto;right:var(--bl);}
${C} .energy{filter:drop-shadow(0 2px 6px #0a0a0a) drop-shadow(0 0 1px #0a0a0a);}
${C}:not(.land) .piles{left:var(--hl);top:734px;width:var(--hw);height:auto;display:flex;flex-direction:row;justify-content:space-between;align-items:baseline;pointer-events:none;gap:0;}
${C}:not(.land) .piles i{display:none;}
${C}:not(.land) .piles .pl{position:static;width:auto;display:flex;flex-direction:row;align-items:baseline;gap:4px;font-size:12px;color:var(--dim);}
${C}:not(.land) .piles .pl em{display:inline;font-style:normal;font-size:12px;}
${C}:not(.land) .piles .pl b{font:900 14px var(--num);color:var(--cream);}

${C}:not(.land) .energy{left:auto;right:calc(var(--cx-w) - var(--gr) + 88px);top:552px;width:72px;height:44px;align-items:center;text-align:center;}
${C}:not(.land) .energy .v{font-size:30px;line-height:1;}
${C}:not(.land) .energy .v small{font-size:15px;}
${C}:not(.land) .skill{left:var(--gl);top:552px;}
${C}:not(.land) .item{left:calc(var(--gl) + 56px);top:552px;}
${C}:not(.land) .skill.is-second{left:calc(var(--gl) + 56px);}
${C}:not(.land) .item.is-shift{left:calc(var(--gl) + 112px);}
${C}:not(.land) .end{left:auto;right:calc(var(--cx-w) - var(--gr));top:552px;}
${C}:not(.land) .pending{left:var(--gl);right:auto;top:486px;width:190px;}
${C}:not(.land) .tray{left:var(--gl);top:auto;bottom:298px;}
/* 操作行紧贴手牌（行底边在手牌顶边上方约 10px）；选中牌放大后可遮挡操作行与点数 */
${C} :is(.skill,.item,.end,.pending){z-index:3;}
${S} .skill .cx-skill-ico{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;stroke-width:1.6;}
/* 技能、道具：各自完整外形的独立按钮，最小 44×44，图标 20px，小字不小于 12px */
${C} .skill,${C} .item{width:44px;height:44px;line-height:44px;}
${C} .skill .cx-skill-ico{width:22px;height:22px;margin:-11px 0 0 -11px;}
${C} .item svg{position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;}
${C} :is(.skill,.item) i{min-width:16px;height:16px;font-size:12px;line-height:16px;}
/* 横屏底部横条（用户 11-02 定稿）：版心 W = min(画布宽 - 40, 1360) 居中；左→右：信息组、资源列（点数与技能道具）、手牌，组间距 16px；手牌上沿一行放抽牌弃牌文字与结束回合 */
${C}.land{--lw:min(calc(var(--cx-w) - 40px), 1360px);--ll:calc((var(--cx-w) - var(--lw)) / 2);--iw:clamp(280px, calc(var(--lw) * .26), 380px);--rw:100px;--rl:calc(var(--ll) + var(--iw) + 16px);--hl:calc(var(--rl) + var(--rw) + 16px);--hw:calc(var(--lw) - var(--iw) - var(--rw) - 32px);}
${C}.land .lead,${C}.land .mates{left:var(--ll);width:var(--iw);}
${C}.land .hand{left:var(--hl);width:var(--hw);}
${C}.land .piles{left:var(--hl);top:467px;width:auto;height:auto;display:flex;align-items:baseline;gap:16px;pointer-events:none;}
${C}.land .piles i{display:none;}
${C}.land .piles .pl{position:static;width:auto;display:flex;flex-direction:row;align-items:baseline;gap:4px;font-size:12px;color:var(--dim);}
${C}.land .piles .pl em{display:inline;font-style:normal;font-size:12px;}
${C}.land .piles .pl b{font:900 16px var(--num);color:var(--cream);}
${C}.land .end{left:auto;right:calc(var(--ll) + 8px);top:425px;}
${C}.land .lead{top:538px;height:86px;}
${C}.land .lead .hpbar{height:12px;}
${C}.land .mates{top:640px;gap:6px;}
${C}.land .mate{width:102px;}
${C}.land .mate .mface{width:40px;height:40px;}
${C}.land .mate .mn{left:46px;font-size:12px;}
${C}.land .mate .hpbar{left:46px;width:52px;}
/* 资源列：点数（无框、柔和投影）在上，技能、道具两个 44×44 独立按钮并排在下 */
${C}.land .energy{left:calc(var(--rl) + 8px);top:550px;width:var(--rw);height:70px;align-items:center;text-align:center;}
${C}.land .energy .v{font-size:46px;line-height:1;}
${C}.land .energy .v small{font-size:22px;}
${C}.land .energy .pips i{width:11px;height:11px;}
${C}.land .skill{left:var(--rl);top:640px;}
${C}.land .item{left:calc(var(--rl) + 56px);top:640px;}
${C}.land .skill.is-second{left:calc(var(--rl) + 56px);}
${C}.land .item.is-shift{left:calc(var(--rl) + 112px);top:640px;}
${C}.land .tray{left:var(--rl);top:auto;bottom:130px;}
${C}.land .pending{left:var(--ll);right:auto;top:462px;width:205px;}
/* 横屏最小字号 12px */
${C}.land :is(.top .round small,.foe .tier,.foe .blk,.foe .st,.foe .st b,.pending,.lead .aw,.lead .hp,.lead .chip,.lead .chip b,.mate .mn,.slot b,.slot i,.foe .hpbar span,.card .desc){font-size:12px;}
${C}.land :is(.skill i,.item i,.mst){font-size:12px;min-width:16px;height:16px;line-height:16px;}
/* 出牌影子：外层按视口矩形定位（演出层给 left/top/width/height），内层按画布缩放 */
#igs-overlay .igs-cx-ghost{position:absolute;pointer-events:none;z-index:30;}
#igs-overlay .igs-cx-ghost>.hand{position:absolute;left:0;top:0;width:calc(100% / var(--cx-scale,1));height:calc(100% / var(--cx-scale,1));transform:scale(var(--cx-scale,1));transform-origin:0 0;}
#igs-overlay .igs-cx-ghost>.hand>.card{left:0;top:0;bottom:auto;transform:none;}
`;

export const COMBAT_SKIN_COMIC_STYLE_TEXT = `${COMBAT_SKIN_COMIC_CONCEPT_CSS}${COMIC_WIRING_CSS}`;

// 结算三选一：候选牌用本皮肤放大牌的完整卡面，一行静态排布。
const REWARD_SIZE = { port: { w: 132, h: 208 }, land: { w: 174, h: 273 }, avail: { port: 362, land: 560 } };
export const rewardRowHtml = (views, { orient, chosen, dim, pending }) => rewardRowMarkup('comic', orient, views.map((view, index) => rewardCardMarkup(
    cardHtml(view, 0, [{ left: 0, z: 1, tx: 0, rot: '0' }], { selected: view.inst }, [], 99), { index, chosen: chosen === index, dim, pending })), { ...REWARD_SIZE[orient], avail: REWARD_SIZE.avail?.[orient] }, handVars(CFG.hand[orient]), views.map((v) => v.fxText));
