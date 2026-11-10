// 科幻皮肤 · 战斗中画面：照搬概念稿 gal/战斗界面设计稿/概念/第二轮/tech/common.js 与 定稿.html 的标记，假数据换成真实视图 v.battle。
// 样式在 combat-skin-tech-concept-style.js（由设计稿 CSS 生成）与本文件末尾的接线样式。动作照旧走 data-combat-act / data-combat-id。
import { esc } from './reader-value-utils.js';
import { cardFxHtml } from './combat-card-text.js';
import { resourceBarHtml } from './combat-resource-bar.js';
import { intentIconSvg, portraitSilhouetteSvg } from './combat-card-art.js';
import { enemyArtTopOf } from './combat-enemy-art.js';
import { ITEM_ICON_SVG, SKILL_ICON_SVG, battlePick, canvasW, ringVars } from './combat-skin-canvas.js';
import { COMBAT_SKIN_TECH_CONCEPT_CSS } from './combat-skin-tech-concept-style.js';
import { KEYWORD_CHAR, KEYWORD_NAME_TIPS, cardMainKeyword, cardValueDelta } from './combat-panel-model.js';

// 概念稿定稿.html 的 TECHKIT.init 参数
const CFG = {
    ring: { port: { rx: 150, w: 330, lift: 100, back: 0.5, dim: 0.45, base: 156 }, land: { rx: 410, w: 390, lift: 93, back: 0.6, dim: 0.5, base: -30 } },
    hand: { port: { cw: 50, z: 1, zs: 1, step: 50, lift: 12, sink: 0.8, rot: 1 }, land: { cw: 88, z: 1.38, zs: 1.2, step: 96, lift: 14, sink: 1, rot: 1 } },
    // 手牌区宽：竖屏随画布宽（两侧各留 10），横屏固定居中
    handW: (orient, w) => { if (orient !== 'land') return Math.min(w - 32, 400); const lw = Math.min(w - 40, 1360); return lw - Math.min(Math.max(Math.round(lw * 0.26), 280), 380) - 132; },
    // 圆环横向半径随画布宽比例伸展，敌人站位铺满贴宽后的画布
    designW: { port: 390, land: 1280 },
    end: { port: { w: 76, h: 44 }, land: { w: 156, h: 44 } },
};

const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
    shield: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
    bag: P('<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>'),
    exit: P('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    skill: P('<path d="M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z"/>'),
    potion: P('<path d="M9 3h6M10 3v5l-4 9a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-4-9V3M8 15h8"/>'),
};
const MOTIF = {
    atk: '<svg viewBox="0 0 40 40"><path d="M20 3L30 22 20 37 10 22z"/><path d="M20 3V37"/></svg>',
    def: '<svg viewBox="0 0 40 40"><path d="M20 4L34 9V20C34 29 28 34 20 37 12 34 6 29 6 20V9z"/><path d="M20 12V30M12 19H28"/></svg>',
    skl: '<svg viewBox="0 0 40 40"><path d="M20 6A14 14 0 1 1 7 25"/><circle cx="20" cy="20" r="4"/></svg>',
    pow: '<svg viewBox="0 0 40 40"><path d="M20 10L30 20 20 30 10 20z"/><path d="M20 2V6M20 34V38M2 20H6M34 20H38"/></svg>',
};
const UNIT = {
    伤害: P('<path d="M6 18L18 6M13 6h5v5"/>'),
    群伤: P('<path d="M12 20V5M12 20L5 8M12 20L19 8"/>'),
    格挡: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
    回复: P('<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"/>'),
};
// 概念稿的牌型：格挡牌在真实数据里是 skill + 单位「格挡」，归到 def。
const typeOf = (c) => (c.type === 'attack' ? 'atk' : c.type === 'power' ? 'pow' : c.unit === '格挡' ? 'def' : 'skl');
const RARITY = { common: 'common', uncommon: 'unc', rare: 'rare', epic: 'epic', mythic: 'myth', personal: 'own', signature: 'own' };
const CHOICE_VERB = { discard: '弃掉', copy: '复制', 'cost-mod': '减费' };
const CIRCLED = '⓪①②③④⑤⑥⑦⑧⑨';

const face = (url, name) => (url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : esc(String(name || '').slice(0, 1)));
const art = (url, cell, name) => (url ? `<img class="cx-art-img" src="${esc(url)}" alt="" loading="lazy" decoding="async">`
    : cell ? `<i class="igs-combat-art" data-atlas="${esc(cell.atlas)}" style="--ea-x:${esc(cell.x)};--ea-y:${esc(cell.y)}"></i>` : `<span class="cx-silhouette">${portraitSilhouetteSvg(name)}</span>`);
const hpBar = (u, cls) => {
    const pct = u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0;
    return `<div class="hpbar ${cls} cx-hp" style="--igs-combat-hp:${pct}%"><i></i></div>`;
};
const unitAct = (u, pickable) => (pickable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`目标 ${u.name}`)}"`
    : ` data-combat-act="unit-info" data-combat-id="${esc(u.id)}" data-unit-info="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`查看${u.name}的技能与被动`)}"`);
const unitCls = (u, pickable) => `cx-unit${u.alive ? '' : ' is-down'}${pickable ? ' is-targetable' : ''}`;
const unitData = (u) => ` data-unit="${esc(u.id)}" data-side="${esc(u.side)}"`;

// 手牌摊开：照搬概念稿 layout()。窄签等距居中，选中牌放大并夹在手牌区内。
function handPos(n, sel, H, w) {
    const cw = H.cw, sw = 124 * H.zs;
    const step = n > 1 ? Math.min(H.step, (w - cw) / (n - 1)) : H.step;
    const x0 = (w - (step * (n - 1) + cw)) / 2;
    return Array.from({ length: n }, (_, i) => {
        const o = i - (n - 1) / 2, left = Math.round(x0 + i * step);
        const selLeft = Math.max(0, Math.min(w - sw, left + cw / 2 - sw / 2));
        return { left, z: i + 1, ty: (o * o * H.sink).toFixed(1), r: (o * H.rot).toFixed(2), sx: (selLeft - left).toFixed(1), zz: i === sel ? H.zs : H.z };
    });
}

function cardHtml(c, i, pos, v, picks, energy) {
    const t = typeOf(c);
    const rar = RARITY[c.rarity] ? ` r-${RARITY[c.rarity]}` : '';
    const live = c.playable || c.choosable;
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const cut = c.baseCost !== undefined && c.cost < c.baseCost;
    const boost = Boolean(c.bonusNote) || (c.baseValue !== undefined && c.value > c.baseValue);
    const sel = v.selected === c.inst;
    // 二稿卡面：窄签只露一枚关键字（青色单字签，接在最底一行文字末尾）；放大牌右上角列全部关键字，可点开解释；「消耗」带三道电量斜杠，其余关键字同款青色块不配符号。
    const names = c.keywordNames || [];
    const kws = sel ? names.map((x) => `<u${x === '消耗' ? ' class="ex"' : ''} data-scale-tip="${esc(KEYWORD_NAME_TIPS[x] || x)}">${x === '消耗' ? '<i class="cells"><i></i><i></i><i></i></i>' : ''}${esc(x)}</u>`).join('') : '';
    const mainKw = sel ? '' : cardMainKeyword(names);
    const kw1 = mainKw ? `<i class="kw1">${esc(KEYWORD_CHAR[mainKw] || mainKw)}</i>` : '';
    const delta = cardValueDelta(c);
    const unitText = `${esc(c.unit || '')}${delta ? `<em class="dl">${esc(delta)}</em>` : ''}`;
    const showSt = !sel && Boolean(c.extra);
    // 窄签内宽约 46px：附加效果加签放不下时，签移到单位行末尾，附加效果行保持完整。
    const exW = showSt ? [...c.extra].reduce((n, ch) => n + (/[ -~]/.test(ch) ? 5.5 : 9), 0) : 0;
    const kwDown = Boolean(kw1) && showSt && exW + 14 > 44;
    const ut = unitText ? `<span class="ut">${unitText}${(!showSt || kwDown) && !sel ? kw1 : ''}</span>` : '';
    const st = showSt ? `<em class="st${kw1 && !kwDown ? ' hk' : ''}"><span class="sx">${esc(c.extra)}</span>${kwDown ? '' : kw1}</em>` : (!sel && kw1 && !unitText ? `<em class="st">${kw1}</em>` : '');
    const cost = `<span class="cost">${c.baseCost !== undefined ? `<s>${esc(c.baseCost)}</s>` : ''}<b>${esc(c.cost)}</b></span>`;
    // 角标位：待选勾 > 叠加 ×N；强化改用独立的「强」标记
    const bdg = c.choosable ? `<span class="bdg">${chosen ? '✓' : '○'}</span>` : c.stack ? `<span class="bdg">×${esc(c.stack)}</span>` : '';
    const upg = c.upgraded ? '<i class="upg">强</i>' : '';
    const valTip = sel && (c.valueTip || c.bonusNote) ? ` data-scale-tip="${esc(c.valueTip || c.bonusNote)}"` : '';
    const val = Number.isFinite(c.value) ? `<span class="val"><b${valTip}>${esc(c.value)}</b>${ut}</span>` : `<span class="val no-num">${MOTIF[t]}</span>${ut}`;
    const tb = c.hits > 1 ? `<i class="tb segs">${'<i></i>'.repeat(Math.min(c.hits, 8))}</i>` : '<i class="tb"></i>';
    const fx = sel ? cardFxHtml(c) : '';
    const rise = c.baseCost !== undefined && c.cost > c.baseCost;
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    const p = pos[i];
    const cls = `card t-${t}${rar}${cut ? ' disc' : ''}${rise ? ' rise' : ''}${c.upgraded ? ' has-up' : ''}${sel && names.length && (c.upgraded || names.length > 1) ? ` kwrow${names.length > 2 ? ' kwrow2' : ''}` : ''}${st ? ' has-st' : ''}${[...c.name].length > 4 ? ' n5' : ''}${c.stack > 2 ? ' stk2' : ''}${boost ? ' boost' : ''}${live && c.cost <= energy ? '' : ' poor'}${c.temp ? ' tmp' : ''}${c.stack ? ' has-stk' : ''}${sel ? ' sel' : ''}${v.hovered === c.inst ? ' is-hover' : ''}`;
    return `<button type="button" class="${cls}" style="left:${p.left}px;z-index:${p.z};--ty:${p.ty}px;--r:${p.r}deg;--sx:${p.sx}px;--z:${p.zz}" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}`
        + `${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}">`
        + `<span class="cf"><i class="dash"></i>${tb}${c.rarity !== 'mythic' ? '' : '<i class="sheen"></i>'}${cost}${bdg}${upg}<span class="kws">${kws}</span><span class="nm">${esc(c.name)}</span><span class="art">${MOTIF[t]}</span>${val}${st}`
        + `<span class="desc">${fx}</span></span></button>`;
}

function foeHtml(u, i, f, n, L, v, pick) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const ring = ringVars(i, f, n, L);
    const it = u.intent;
    const intent = it ? `<div class="intent" title="${esc(`${it.label}·${it.name}${it.damage ? `，${it.damage} 点伤害` : ''}`)}">${intentIconSvg(it.kind)}${it.damage ? `<b>${esc(it.damage)}</b>` : ''}<em>${esc(it.damage ? it.name : `${it.label}·${it.name}`)}</em></div>` : '';
    const elite = u.tier ? `<span class="elite">${u.tier === 'boss' ? '首领' : '精英'}</span>` : '';
    const sts = `${u.block ? `<span class="sc">${ICON.shield}<b>${esc(u.block)}</b></span>` : ''}${u.statuses.map((s) => `<span class="sc deb">${esc(s.label)}<b>${esc(s.stacks)}</b></span>`).join('')}`;
    const ok = pick.pickable(u);
    return `<div class="foe${ring.front ? ' front' : ''}${ring.rear ? ' rear' : ''} ${unitCls(u, ok)}"${unitData(u)} style="${ring.style};--atop:${enemyArtTopOf(arts[u.name])}"${unitAct(u, ok)}>`
        + `<div class="art">${art(pics[u.name], arts[u.name], u.name)}</div><div class="tag">${intent}`
        + `<div class="plate"><span class="nm2">${esc(u.name)}</span>${elite}${hpBar(u, 'seg')}<span class="hp">${esc(u.hp)}/${esc(u.maxHp)}</span>${sts ? `<span class="st">${sts}</span>` : ''}</div></div></div>`;
}

function leadHtml(hero, v, pick) {
    const pics = v.portraits || {};
    const b = v.battle;
    const ok = pick.pickable(hero);
    const aw = b.awaken && !b.awaken.used && b.awaken.usable && !b.outcome ? b.awaken : null;
    const awBtn = aw ? `<span class="aw cx-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" role="button" tabindex="0" title="${esc(`觉醒·${aw.label}：${aw.text}`)}" aria-label="${esc(`觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}，不消耗能量，每场一次`)}">觉醒·${esc(aw.label)}</span>` : '';
    const chips = `${hero.block ? `<span class="chip">${ICON.shield}<b>${esc(hero.block)}</b></span>` : ''}${hero.statuses.map((s) => `<span class="chip">${esc(s.label)} <b>${esc(s.stacks)}</b></span>`).join('')}`;
    return `<div class="lead ${unitCls(hero, ok)}"${unitData(hero)}>`
        + `<div class="ava"><span class="face cx-face"${unitAct(hero, ok)}>${face(pics[hero.name], hero.name)}</span>${awBtn}</div>`
        + `<div class="info"><div class="n">${esc(hero.name)}${hero.controlled ? '<span class="ctl">操控</span>' : ''}<span class="hp"><b class="cx-hp-cur">${esc(hero.hp)}</b>/${esc(hero.maxHp)}</span></div>${hpBar(hero, 'ally seg')}`
        + `<div class="chips">${chips}</div>${resourceBarHtml(hero.res, { row: 'chips', item: 'chip' })}</div></div>`;
}

function mateHtml(u, v, pick) {
    const ok = pick.pickable(u);
    const s = u.statuses[0];
    return `<div class="mate ${unitCls(u, ok)}"${unitData(u)}${unitAct(u, ok)}><div class="mface">${face((v.portraits || {})[u.name], u.name)}</div>`
        + `<div class="mi"><div class="mn">${esc(u.name)}${s ? `<u>${esc(s.label)}${esc(s.stacks)}</u>` : ''}</div>${hpBar(u, 'ally')}</div></div>`;
}

function trackHtml(b, v) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const list = (b.order || []).slice(0, 6);
    return `<div class="track" role="img" aria-label="${esc(`行动顺序：${list.map((o) => o.name).join('、')}`)}">${list.map((o, i) => {
        const inner = pics[o.name] ? `<img src="${esc(pics[o.name])}" alt="" loading="lazy" decoding="async">`
            : arts[o.name] && arts[o.name].atlas !== 'none' ? `<i class="igs-combat-art" data-atlas="${esc(arts[o.name].atlas)}" style="--ea-x:${esc(arts[o.name].x)};--ea-y:${esc(arts[o.name].y)}"></i>` : `<b>${esc(String(o.name).slice(0, 1))}</b>`;
        return `<span class="who cx-dot${i === 0 ? ' now' : ''}${o.side === 'ally' && i ? ' ally' : ''}" style="--atop:${enemyArtTopOf(arts[o.name])}" data-unit="${esc(o.id)}" title="${esc(o.name)}">${inner}</span>`;
    }).join('')}</div>`;
}

// 平行四边形外轮廓（左下与右上各让出 c），同概念稿 chamfer()
const chamfer = (w, h, c, ins) => `M${c},${ins} H${w - ins} L${w - c},${h - ins} H${ins} Z`;

export function battleHtml(v, orient) {
    const b = v.battle;
    const land = orient === 'land';
    const cw = canvasW(orient);
    const H = CFG.hand[orient], E = CFG.end[orient];
    const L = { ...CFG.ring[orient], rx: Math.round(CFG.ring[orient].rx * cw / CFG.designW[orient]) };
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
    const handBox = land ? Math.min(handLimit, H.cw + H.step * Math.max(0, nHand - 1)) : handLimit;
    const pos = handPos(nHand, selIdx, H, handBox);
    const f = (() => { const i = b.enemies.findIndex((u) => u.id === v.front); if (i >= 0) return i; const a = b.enemies.findIndex((u) => u.alive); return a >= 0 ? a : 0; })();
    const foes = b.enemies.map((u, i) => foeHtml(u, i, f, b.enemies.length, L, v, pick)).join('');
    const live = !ended && v.status === 'battle';
    const retreat = live && b.canEscape ? `<button type="button" class="ic ret" data-combat-act="escape" title="撤退" aria-label="撤退">${ICON.exit}</button>` : '';
    const speed = (v.status === 'battle' || v.settling) ? `<button type="button" class="spd cx-speed" data-combat-act="speed" aria-pressed="${(v.fxSpeed || 1) > 1 ? 'true' : 'false'}" aria-label="演出二倍速">×2</button>` : '';
    const top = `<div class="topbar"><span class="title" title="${esc(v.encounter || '战斗')}">${esc(v.encounter || '战斗')}</span>${live ? `<span class="round">第 ${esc(b.turn)} 回合</span>` : ''}<span class="sp"></span>`
        + `<span class="tr">${speed}${retreat}<button type="button" class="ic" data-combat-act="close" title="关闭" aria-label="关闭">${ICON.close}</button></span></div>`;
    const item = pick.item ? pick.picked : null;
    const hint = choice ? `${CHOICE_VERB[choice.kind] || '选择'} ${picks.length}/${choice.count}` : item ? (item.targets?.length ? '选择目标' : '点击承受方使用') : '';
    const per = Math.max(Number(b.energyPerTurn) || 0, Number(b.energy) || 0);
    const energy = `<div class="energy" role="img" aria-label="${esc(`能量 ${b.energy}/${b.energyPerTurn}`)}"><div class="v">${esc(b.energy)}<small>/${esc(b.energyPerTurn)}</small></div>`
        + `<div class="pips">${Array.from({ length: per }, (_, i) => `<i class="${i < b.energy ? '' : 'off'}"></i>`).join('')}</div></div>`;
    const traits = (Array.isArray(b.traits) ? b.traits : b.heroSkill ? [{ ...b.heroSkill, kind: 'active', innate: true }] : []).filter((t) => t.kind === 'active');
    const skills = traits.map((t) => {
        const id = t.skillId ? `hero-skill:${t.skillId}` : 'hero-skill';
        const c = Number(t.cost);
        return `<button type="button" class="tool skill cx-trait${v.selected === id ? ' on' : ''}${t.usable ? '' : ' off'}" data-combat-act="hero-skill"${t.skillId ? ` data-combat-id="${esc(t.skillId)}"` : ''} data-trait="${esc(t.id)}"`
            + `${t.usable ? '' : ' aria-disabled="true"'} title="${esc(t.name)}" aria-label="${esc(`主动特性 ${t.name} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`)}">${SKILL_ICON_SVG}${c > 1 ? `<b>${esc(t.cost)}</b>` : ''}</button>`;
    }).join('');
    const items = (b.items || []).filter((i) => i.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    const itemBtn = `<button type="button" class="tool item${items.length ? '' : ' off'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${v.itemsOpen && items.length ? 'true' : 'false'}"${items.length ? '' : ' aria-disabled="true"'} title="道具" aria-label="道具">${ITEM_ICON_SVG}${total > 1 ? `<b>${total}</b>` : ''}</button>`;
    const tools = `<div class="tools${traits.length > 1 ? ' has-2' : ''}">${itemBtn}${skills}</div>`;
    const tray = `<div class="tray" role="menu" aria-label="道具"><div class="th"><b>道具</b><span class="hint">${esc(hint)}</span></div><div class="cells">${items.map((i) => `<button type="button" role="menuitem" class="cell${i.usable ? '' : ' off'}${v.selected === `item:${i.itemId}` ? ' sel' : ''}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : ICON.potion}<em>${esc(i.name)}</em><b>×${esc(i.count)}</b></button>`).join('')}</div></div>`;
    const rd = chamfer(E.w, E.h, 8, 3);
    const ring = `<svg class="hr" viewBox="0 0 ${E.w} ${E.h}" aria-hidden="true"><path class="t" pathLength="100" d="${rd}"/><path class="p" pathLength="100" d="${rd}"/></svg>`;
    const endBtn = choice
        ? `<button type="button" class="end" data-combat-act="choose-confirm"${picks.length === choice.count ? '' : ' aria-disabled="true"'}>${ring}<b>${esc(CHOICE_VERB[choice.kind] || '选择')} ${picks.length}/${esc(choice.count)}</b></button>`
        : `<button type="button" class="end" data-combat-act="end-turn"${b.canEndTurn ? '' : ' aria-disabled="true"'}>${ring}<b>结束回合</b></button>`;
    const handStyle = `--cw:${H.cw}px;--ch:${110 * H.z}px;--sw:${124 * H.zs}px;--sh:${184 * H.zs}px;--lift:${H.lift}px${land ? `;width:${handBox}px` : ''}`;
    const hand = `<div class="hand cx-hand${selIdx >= 0 ? ' has-sel' : ''}" style="${handStyle}">${b.hand.map((c, i) => cardHtml(c, i, pos, v, picks, b.energy)).join('')}</div>`;
    const piles = `<div class="piles"><span class="pl dr"><em>抽牌 </em><b>${esc(b.piles.draw)}</b></span><i></i><span class="pl dc"><em>弃牌 </em><b>${esc(b.piles.discard)}</b></span></div>`;
    const ops = ended ? '' : `${tools}${tray}${hand}${energy}${endBtn}${piles}`;
    const cls = `igs-cx-canvas ${land ? 'land' : 'port'}${pick.card || pick.skill ? ' aim' : ''}${pick.item && pick.picked ? ' item-aim' : ''}${v.itemsOpen && items.length ? ' tray-open' : ''}${ended ? ' is-ended' : ''}`;
    return `<div class="igs-cx-wrap"><div id="igs-cx-canvas" class="${cls}" data-cx="tech">`
        + '<div class="stage"></div><div class="deco" aria-hidden="true"><i class="cn tl"></i><i class="cn tr"></i></div>'
        + `${top}${live ? trackHtml(b, v) : ''}<section class="foes cx-field" data-turn="${esc(b.turn)}" style="--base:${L.base}px">${foes}</section><div class="veil"></div>`
        + `${hero ? leadHtml(hero, v, pick) : ''}<div class="mates">${mates.map((u) => mateHtml(u, v, pick)).join('')}</div>${ops}`
        + '</div></div>';
}

const S = '#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"])';
const C = '#igs-overlay #igs-cx-canvas:where([data-cx="tech"])';
const K = `${S} .card.card`;
const WIRING_CSS = `
#igs-overlay #igs-combat-panel .igs-cx-wrap{position:absolute;inset:0;overflow:hidden;}
${C}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--cx-scale,1));transform-origin:50% 50%;background:transparent;}
${S} .stage{background:none;}
${S} .who img,${S} .lead .face img,${S} .mface img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;}
/* 行动顺序只露头像：立绘放大取头部，矮身形按看得见的头顶下移取景 */
${S} .track .who img{inset:auto;left:-50%;top:-6%;width:200%;height:200%;object-position:50% 0;border-radius:0;}
${S} .track .who .igs-combat-art{inset:auto;left:-32.5%;top:calc(6% - var(--atop,0) * 220%);width:165%;height:220%;}
${S} .who>b{position:absolute;inset:0;display:grid;place-items:center;font:700 12px var(--num);color:var(--tx);}
${S} .lead .face{display:grid;place-items:center;font:800 22px var(--num);color:var(--tx);cursor:pointer;}
${S} .mface{position:relative;overflow:hidden;}
${S} .foe .art .cx-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;}
${S} .foe .art .cx-silhouette{position:absolute;inset:18% 20% 0;display:block;color:#2a343d;}
${S} .foe .art .cx-silhouette svg{width:100%;height:100%;fill:currentColor;stroke:none;}
${S} .hpbar.cx-hp>i{width:var(--igs-combat-hp,0%);}
${S} .foe .intent svg{fill:none;}
${S} .lead .aw{cursor:pointer;z-index:2;}
${S} .topbar .cx-speed{border:0;cursor:pointer;font-family:var(--ui);}
${S} .topbar .cx-speed[aria-pressed="true"]{background:var(--cy);color:#07090b;}
${S} .tool{border:0;font-family:var(--ui);}
${S} .tool.skill.on{background:var(--or);color:#07090b;}
${S} .tool.skill.on b{color:#07090b;}
${S} .tool.off{opacity:.45;}
${S} .tray .cell{border:0;font-family:var(--ui);cursor:pointer;}
${S} .tray .cell img{width:22px;height:22px;object-fit:contain;}
/* 顶栏：关卡名单行省略，回合数与右侧按钮不被挤压 */
${S} .topbar .title{min-width:0;flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${S} .topbar .round,${S} .topbar .tr{flex:none;white-space:nowrap;}
/* 画布宽度随面板伸展（--cx-w），靠右元素用 right 贴右缘，居中元素用 50% 加设计稿偏移。
   操作区（用户 11-02 定）：能量在手牌正上方居中；道具技能在左（竖屏在行左端，横屏在手牌左侧）；结束回合、牌堆在右（贴右缘）。 */
${C}.port,${C}.land{width:var(--cx-w);}
${C}.land .topbar .title{max-width:calc(50% - 180px);}
${C}.land .mates{top:652px;}
/* 技能可发动：一道细光沿按钮边框环绕（转动的圆锥渐变在内层底色之外露出 1.5px 光边，只动 transform）；不可发动不显示；减少动态时为静态细光边 */
${S} .tool.skill:not(.off){isolation:isolate;overflow:hidden;}
${S} .tool.skill:not(.off)::before{content:"";position:absolute;left:50%;top:50%;width:220px;height:220px;margin:-110px 0 0 -110px;z-index:-2;background:conic-gradient(from 0deg,transparent 0 76%,var(--cy) 94%,transparent 100%);animation:cx-tech-orbit 2.4s linear infinite;pointer-events:none;}
${S} .tool.skill:not(.off)::after{content:"";position:absolute;inset:1.5px;z-index:-1;background:var(--panel2);clip-path:var(--pg6);pointer-events:none;}
${S} .tool.skill.on:not(.off)::after{background:var(--or);}
@keyframes cx-tech-orbit{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion:reduce){${S} .tool.skill:not(.off)::before{animation:none;background:var(--cy);opacity:.7;}}
${C}:where([data-igs-combat-reduced] *) .tool.skill:not(.off)::before{animation:none;background:var(--cy);opacity:.7;}
/* 竖屏统一布局（用户 11-02）：手牌居中，左右外侧抽/弃牌堆，三者为一组；操作行与点数左缘对齐抽牌堆左缘、结束回合右缘对齐弃牌堆右缘；底栏主战者与队友成组居中 */
${C}.port{--hw:min(calc(var(--cx-w) - 32px), 400px);--hl:calc((var(--cx-w) - var(--hw)) / 2);--gl:var(--hl);--gr:calc(var(--hl) + var(--hw));--bw:min(calc(var(--cx-w) - 32px), 440px);--bl:calc((var(--cx-w) - var(--bw)) / 2);--gl:16px;--gr:calc(var(--cx-w) - 16px);}
${C}.port .hand{left:var(--hl);width:var(--hw);}
${C}.port .lead{left:var(--bl);}
${C}.port .mates{left:auto;right:var(--bl);}
${C} .energy{filter:drop-shadow(0 2px 6px #0a0a0a) drop-shadow(0 0 1px #0a0a0a);}
${C}.port .piles{left:var(--hl);top:733px;width:var(--hw);height:auto;display:flex;flex-direction:row;justify-content:space-between;align-items:baseline;pointer-events:none;gap:0;}
${C}.port .piles i{display:none;}
${C}.port .piles .pl{position:static;width:auto;display:flex;flex-direction:row;align-items:baseline;gap:4px;font-size:12px;color:var(--dim);}
${C}.port .piles .pl em{display:inline;font-style:normal;font-size:12px;}
${C}.port .piles .pl b{font:700 14px var(--num);color:var(--tx);}

${C}.port .energy{left:auto;right:calc(var(--cx-w) - var(--gr) + 88px);top:538px;width:72px;height:44px;align-items:center;background:none;clip-path:none;}
${C}.port .energy::before{display:none;}
${C}.port .energy .v{font-size:30px;}
${C}.port .energy .v small{font-size:15px;}
${C}.port .energy .pips i{width:8px;height:8px;}
${C}.port .tools{left:var(--gl);top:538px;flex-direction:row;flex-wrap:nowrap;gap:12px;width:auto;}
${C}.port .tool{width:44px;min-width:44px;padding:0;gap:0;font-size:0;justify-content:center;}
${C}.port .tool b{position:absolute;right:2px;top:1px;font-size:12px;}
${C}.port .lead{top:752px;width:calc(var(--bw) - 134px);}
${C}.port .mates{top:738px;height:80px;width:122px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:4px;}
${C}.port .mate{display:flex;flex-direction:row;align-items:center;gap:6px;width:100%;}
${C}.port .mate .mi{flex:1;min-width:0;}
${C}.port .mate .hpbar{width:100%;}
${C}.port .tool.item{order:2;}
${C}.port .end{left:auto;right:calc(var(--cx-w) - var(--gr));top:538px;}
${C}.port .tray{left:var(--gl);top:436px;}
/* 操作行紧贴手牌（行底边在手牌顶边上方约 10px）；选中牌放大后可遮挡操作行与点数，故手牌层级最高、手牌区本身不拦点击 */
${C} :is(.energy,.tools,.end){z-index:5;}
${C} .hand{pointer-events:none;}
${C} .hand .card{pointer-events:auto;}
/* 技能、道具：各自完整外形的独立按钮，最小 44×44，图标 20px，小字不小于 12px */
${C} .tool{height:44px;min-width:44px;font-size:12px;gap:6px;}
${C} .tool svg{width:22px;height:22px;flex:none;}
${C} .tool b{font-size:12px;}
/* 横屏底部横条（用户 11-02 定稿）：版心 W = min(画布宽 - 40, 1360) 居中；左→右：信息组、资源列（点数与技能道具）、手牌，组间距 16px；手牌上沿一行放抽牌弃牌文字与结束回合 */
${C}.land{--lw:min(calc(var(--cx-w) - 40px), 1360px);--ll:calc((var(--cx-w) - var(--lw)) / 2);--iw:clamp(280px, calc(var(--lw) * .26), 380px);--rw:100px;--rl:calc(var(--ll) + var(--iw) + 16px);--hl:calc(var(--rl) + var(--rw) + 16px);--hw:calc(var(--lw) - var(--iw) - var(--rw) - 32px);}
${C}.land .lead,${C}.land .mates{left:var(--ll);width:var(--iw);}
${C}.land .hand{left:var(--hl);width:var(--hw);}
${C}.land .piles{left:var(--hl);top:505px;width:auto;height:auto;display:flex;align-items:baseline;gap:16px;pointer-events:none;}
${C}.land .piles i{display:none;}
${C}.land .piles .pl{position:static;width:auto;display:flex;flex-direction:row;align-items:baseline;gap:4px;font-size:12px;color:var(--dim);}
${C}.land .piles .pl em{display:inline;font-style:normal;font-size:12px;}
${C}.land .piles .pl b{font:700 16px var(--num);color:var(--tx);}
${C}.land .end{left:auto;right:calc(var(--ll) + 8px);top:462px;}
${C}.land .lead{top:566px;height:80px;}
${C}.land .lead .ava{width:72px;height:72px;}
${C}.land .lead .n{font-size:16px;}
${C}.land .lead .hpbar{height:9px;}
${C}.land .mates{top:658px;}
${C}.land .mface{width:28px;height:28px;}
${C}.land .mn{font-size:13px;}
/* 资源列：点数（无框、柔和投影）在上，技能、道具两个 44×44 独立按钮并排在下 */
${C}.land .energy{left:var(--rl);top:540px;width:var(--rw);height:70px;align-items:center;background:none;clip-path:none;}
${C}.land .energy::before{display:none;}
${C}.land .energy .v{font-size:46px;line-height:1;}
${C}.land .energy .v small{font-size:22px;}
${C}.land .energy .pips i{width:10px;height:10px;}
${C}.land .tools{left:var(--rl);top:650px;width:var(--rw);flex-direction:row;flex-wrap:wrap;gap:12px;}
${C}.land .tool{width:44px;min-width:44px;padding:0;gap:0;font-size:0;justify-content:center;}
${C}.land .tool b{position:absolute;right:2px;top:1px;font-size:12px;}
${C}.land .tool.item{order:2;}
${C}.land .tray{left:var(--rl);top:380px;}
/* 横屏最小字号 12px */
${C}.land :is(.foe .plate .n .hp,.elite,.sc,.sc b,.lead .aw,.lead .aw b,.lead .n .ctl,.lead .n .hp,.chip,.chip b,.mface,.mn,.tray .th .hint,.tray .cell em,.end i,.card .desc){font-size:12px;}
${S} .end[aria-disabled="true"]{opacity:.5;}
${S} .card{border:0;padding:0;background:none;font-family:var(--ui);color:inherit;text-align:left;}
${S} .card .bdg{background:none;}
${S} .card.is-lifted{opacity:.35;}
/* 按住确认：按钮外框上的进度线读 --hold（控制器按住期间 0→1） */
${S} .end svg.hr .p{stroke-dasharray:calc(var(--hold,0) * 100) 100;transition:none;}
/* 矮身形（兽、龙蛇等）：按看得见的头顶抬高并稍放大，头顶对到人形高度 */
${S} .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.95)) scale(calc(1 + var(--atop,0) * .15));transform-origin:50% 100%;}
${C}.land .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.4)) scale(calc(1 + var(--atop,0) * .8));}
/* 与漫画统一的头顶位置：信息组按立绘上沿定位（意图签顶边：竖屏 73 / 横屏 35；血条中线 117 / 79）。去掉名字血条后的黑色斜切底板，靠文字阴影保证可读 */
${C} .foe .tag{bottom:auto;top:-42px;margin-bottom:0;gap:0;} ${C}.land .foe .tag{top:-48px;}
${C} .foe .plate{background:none;clip-path:none;padding:0 4px;text-shadow:0 1px 3px #0a0d10,0 0 8px #0a0d10;}
${C} .foe .plate .nm2{line-height:16px;}
${C} .foe .hpbar{margin-top:3px;box-shadow:0 0 0 1px #0a0d10;}
/* 牌面信息规范（落盘/牌面信息规范.md）：罕见顶边暗色带；稀有亮色带 + 费用菱形填亮色；史诗再加牌内顶光；神话再加缓慢扫光；专属按史诗处理并保留左上白角。不用描边层数表示稀有度；金色只给强化。 */
${S} .card{--tcb:var(--tc);}
${S} .card:is(.r-common,.r-unc) .cost{--rb:#4a5a66;}
${S} .card:is(.r-unc){--band:var(--cyd);}
${S} .card:is(.r-rare,.r-epic,.r-myth,.r-own){--band:var(--cy);}
${S} .card .cf::before{background:linear-gradient(var(--band,transparent),var(--band,transparent)) 0 0/100% 3px no-repeat,#11171c;}
${S} .card:is(.r-epic,.r-myth,.r-own) .cf::before{background:linear-gradient(var(--band),var(--band)) 0 0/100% 3px no-repeat,linear-gradient(to bottom,#1d3a4d 0,#11171c 48%);}
${S} .card:is(.r-rare,.r-epic,.r-myth,.r-own) .cost{--rb:var(--cy);}
${S} .card:is(.r-rare,.r-epic,.r-myth,.r-own) .cost::before{width:var(--d);height:var(--d);margin:calc(var(--d) / -2) 0 0 calc(var(--d) / -2);box-shadow:none;background:var(--cy);}
${S} .card:is(.r-rare,.r-epic,.r-myth,.r-own) .cost b{color:#07090b;}
${S} .card.disc .cost b{color:var(--mint);} ${S} .card.rise .cost b{color:var(--rose);}
${S} .card.disc:is(.r-rare,.r-epic,.r-myth,.r-own) .cost b{color:#0b6b45;} ${S} .card.rise:is(.r-rare,.r-epic,.r-myth,.r-own) .cost b{color:#a8222f;}
${S} .card .cf>.tb{position:absolute;left:1px;right:13px;bottom:1px;height:3px;background:var(--tc);z-index:2;}
${S} .card .cf>.sheen{position:absolute;inset:1px;z-index:1;pointer-events:none;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);background:linear-gradient(105deg,transparent 35%,rgba(233,241,246,.16) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:cx-tech-sheen 4.2s ease-in-out infinite;}
@keyframes cx-tech-sheen{0%,55%{background-position:-150% 0;}100%{background-position:150% 0;}}
@media (prefers-reduced-motion:reduce){${S} .card .cf>.sheen{animation:none;}}
${S} .card .bdg.up{color:var(--gold);border-color:var(--gold);font-size:13px;}
${S} .card .val.no-num{height:28px;align-items:center;}
${S} .card .val.no-num svg{width:28px;height:28px;stroke:var(--tc);fill:none;stroke-width:2;stroke-linejoin:miter;}
${S} .card.sel .val.no-num svg{display:none;}
/* 同名叠加：牌背后露出 1–2 层错位牌边（实色） */
${S} .card.has-stk::before,${S} .card.has-stk::after{content:"";position:absolute;inset:0;z-index:-1;clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);}
${S} .card.has-stk::before{background:#2a5673;transform:translate(-3px,-4px);}
${S} .card.has-stk::after{background:#1d3a4d;transform:translate(-6px,-8px);display:none;}
${S} .card.stk2::after{display:block;}
/* 二稿卡面（11-04）：稀有度只看费用菱形；大数值居中、单位文字加淡色差值、附加效果独占最底一行、段数切牌型色条、强化金块与军衔肩章、关键字青色块 */
${K} .cost b{position:relative;top:1px;}
${K}.r-unc .cost{--rb:var(--cy);}
${K}.r-unc .cost::before{border-width:1.5px;}
${K}:is(.r-epic,.r-myth,.r-own) .cost::before{width:calc(var(--d) - 6px);height:calc(var(--d) - 6px);margin:calc(var(--d) / -2 + 3px) 0 0 calc(var(--d) / -2 + 3px);}
${K}:is(.r-epic,.r-myth,.r-own) .cost::after{content:"";position:absolute;left:50%;top:50%;z-index:-2;box-sizing:border-box;width:var(--d);height:var(--d);margin:calc(var(--d) / -2) 0 0 calc(var(--d) / -2);border:1px solid var(--cy);transform:rotate(45deg);}
${K}.r-myth .cost::before{background:#e9f1f6;}
${K}.r-myth .cost::after{border-color:#e9f1f6;}
${K} .val{gap:0;}
${K}:not(.sel) .val{transform:translateY(1px);}
${K}.has-st:not(.sel) .val{transform:translateY(-5px);}
${K} .ut{display:block;font:normal 10px/10px var(--ui,sans-serif);color:#8aa9b3;white-space:nowrap;text-align:center;}
${K}:not(.sel) .ut{position:absolute;left:-10px;right:-10px;top:100%;}
${K} .ut .dl{margin-left:3px;color:#5f7a84;font-size:.9em;font-weight:400;font-style:normal;}
${K} .cf>.tb.segs{background:none;display:flex;gap:3px;}
${K} .cf>.tb.segs>i{flex:1;height:3px;background:var(--tc);transform:skewX(-35deg);}
${K} .st{position:absolute;left:2px;right:2px;bottom:9px;z-index:2;display:block;text-align:center;font:normal 9px/10px var(--ui,sans-serif);color:#d8f3f7;white-space:nowrap;}
${K} .st .sx{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;}
${K}.sel .st{display:none;}
${K} .st.hk .sx{max-width:calc(100% - 16px);}
${K} .kw1{position:relative;display:inline-block;vertical-align:middle;box-sizing:border-box;width:12px;height:11px;margin:-2px 0 0 2px;padding:0 0 0 1px;background:#5fd3e6;color:#07090b;font:700 8px/11px var(--ui,sans-serif);text-align:center;clip-path:polygon(3px 0,100% 0,100% calc(100% - 3px),calc(100% - 3px) 100%,0 100%,0 3px);}
${K} .ut .kw1{margin-top:0;}
${K} .upg{position:absolute;right:7px;top:9px;z-index:3;width:12px;height:12px;background:var(--gold,#f0c35a);color:#07090b;font:700 9px/12px var(--ui,sans-serif);font-style:normal;text-align:center;}
${K} .upg::after{content:"";position:absolute;left:50%;top:100%;width:10px;height:7px;margin:2px 0 0 -5px;background:var(--gold,#f0c35a);clip-path:polygon(50% 0,100% 40%,100% 60%,50% 20%,0 60%,0 40%,50% 0,50% 0,50% 50%,100% 90%,100% 100%,50% 70%,0 100%,0 90%,50% 50%);}
${K} .desc{text-align:center;}
${K}.n5:not(.sel) .nm{font-size:10px;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${K} .cost s{display:block;position:absolute;left:13px;top:11px;right:auto;z-index:4;width:14px;height:14px;margin:0;padding:0;opacity:1;text-align:center;font:600 8px/14px var(--ui,sans-serif);color:#d8f3f7;text-decoration:line-through;text-decoration-thickness:1px;}
${K} .cost s::before{content:"";position:absolute;inset:2px;z-index:-1;box-sizing:border-box;border:1px solid var(--rb,#8c9aa4);background:#11171c;transform:rotate(45deg);}
${K}.sel .cost s{left:20px;top:10px;width:17px;height:17px;font-size:10px;line-height:17px;}
${K}.sel .nm{margin-top:6px;}
${K}.sel .art{display:none;}
${K}.sel .val{top:78px;flex-direction:column;align-items:center;justify-content:flex-start;}
${K}.sel .val b{font-size:46px;line-height:44px;}
${K}.sel .val b[data-scale-tip]{cursor:help;}
${K}.sel .ut{position:static;align-self:center;margin:4px 0 0;font-size:14px;line-height:14px;text-align:center;}
${K}.sel .desc{top:150px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
${K}.sel .upg{top:15px;right:12px;width:auto;height:20px;padding:0 7px 0 28px;background:none;font:700 15px/20px var(--ui,sans-serif);}
${K}.sel .upg::before{content:"";position:absolute;inset:0 0 0 21px;z-index:-1;background:var(--gold,#f0c35a);clip-path:polygon(0 0,100% 0,100% 100%,7px 100%,0 calc(100% - 7px));}
${K}.sel .upg::after{left:0;top:3px;width:19px;height:14px;margin:0;background:var(--gold,#f0c35a);clip-path:path('M0 0 L5 0 L9 7 L5 14 L0 14 L4 7 Z M10 0 L15 0 L19 7 L15 14 L10 14 L14 7 Z');}
${K}.sel .kws{display:flex;flex-direction:row-reverse;align-items:flex-start;gap:3px;top:16px;right:12px;overflow:visible;clip-path:none;}
${K}.sel.kwrow .kws{left:4px;right:4px;top:64px;flex-direction:row;flex-wrap:wrap;justify-content:center;}
${K}.sel .kws u{white-space:nowrap;}
${K}.sel.kwrow .kws u{height:16px;font-size:11px;line-height:16px;}
${K}.sel.kwrow .val{top:86px;}
${K}.sel.kwrow .desc{top:152px;}
${K}.sel.kwrow2 .val{top:105px;}
${K}.sel.kwrow2 .val b{font-size:32px;line-height:30px;}
${K}.sel.kwrow2 .desc{top:156px;-webkit-line-clamp:1;}
${K}.sel .kws u{position:relative;z-index:0;box-sizing:border-box;width:auto;height:18px;padding:0 7px;border:0;border-radius:0;background:none;color:#07090b;font:700 12px/18px var(--ui,sans-serif);letter-spacing:.06em;text-decoration:none;overflow:visible;clip-path:none;}
${K}.sel .kws u::before{content:"";position:absolute;inset:0;z-index:-1;background:#5fd3e6;clip-path:polygon(6.5px 0,100% 0,100% 100%,0 100%);}
${K}.sel .kws u.ex{padding-left:28px;}
${K}.sel .kws u.ex::before{left:19px;}
${K}.sel .kws .cells{position:absolute;left:0;top:0;display:flex;gap:3px;height:18px;padding:0 0 0 4px;font-style:normal;}
${K}.sel .kws .cells i{display:block;flex:none;width:3px;height:18px;background:#2b4a55;transform:skewX(-20deg);}
${K}.sel .kws .cells i:first-child{background:#5fd3e6;}
/* 行动顺序：竖屏与横屏都竖排在画布左侧（用户 11-02 定） */
${C}.land .track{flex-direction:column;top:62px;}
${S} .track .who{flex:none;}
/* 选目标：可选的敌人（不止正前方）都提亮 */
${C}.aim .foe.is-targetable .art{filter:brightness(calc(var(--fl,1) * 1.1)) saturate(var(--fsat,1));}
${S} .foe.is-drop-hover .art{filter:brightness(1.3) saturate(1.1) drop-shadow(0 0 18px rgba(255,122,61,.7));}
${S} :is(.lead,.mate).is-targetable :is(.face,.mface){box-shadow:0 0 0 2px var(--mint);}
${S} :is(.lead,.mate).is-drop-hover :is(.face,.mface){box-shadow:0 0 0 2px var(--tx);}
${S} .foe.is-acting .art{filter:brightness(1.15) drop-shadow(0 0 16px rgba(255,122,61,.65));}
${S} :is(.lead,.mate).is-acting :is(.face,.mface){box-shadow:0 0 0 2px var(--cy);}
${S} .who.is-acting{box-shadow:0 0 0 2px var(--cy);}
${S} .foe.is-down{opacity:.35;filter:grayscale(1);pointer-events:none;}
${S} :is(.lead,.mate).is-down :is(.face,.mface){filter:grayscale(1) brightness(.5);}
${C}.is-ended .foes{pointer-events:none;}
#igs-overlay .igs-cx-ghost{position:absolute;pointer-events:none;z-index:30;}
#igs-overlay .igs-cx-ghost>.hand{position:absolute;left:0;top:0;width:calc(100% / var(--cx-scale,1));height:calc(100% / var(--cx-scale,1));transform:scale(var(--cx-scale,1));transform-origin:0 0;}
#igs-overlay .igs-cx-ghost>.hand>.card{left:0;top:0;bottom:auto;transform:none;margin-left:0;}
`;

export const STYLE_TEXT = `${COMBAT_SKIN_TECH_CONCEPT_CSS}${WIRING_CSS}`;
