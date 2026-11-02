// 星辉皮肤 · 战斗中画面：照搬概念稿 gal/战斗界面设计稿/概念/第二轮/mystic/（core.js 外壳 + 定稿.js）的标记，假数据换成真实视图 v.battle。
// 样式在 combat-skin-mystic-concept-style.js（由设计稿 CSS 生成）与本文件末尾的接线样式。动作照旧走 data-combat-act / data-combat-id。
import { esc } from './reader-value-utils.js';
import { intentIconSvg, portraitSilhouetteSvg } from './combat-card-art.js';
import { enemyArtKeyFor } from '../../combat/enemy-art.js';
import { enemyArtTopOf } from './combat-enemy-art.js';
import { ITEM_ICON_SVG, SKILL_ICON_SVG, battlePick, canvasW, needsHold, ringVars } from './combat-skin-canvas.js';
import { COMBAT_SKIN_MYSTIC_CONCEPT_CSS } from './combat-skin-mystic-concept-style.js';

const partHtml = (p) => {
    const tip = p.tip ? ` data-scale-tip="${esc(p.tip)}"` : '';
    if (p.mark === 'up' || p.mark === 'down') return `<span class="igs-scale-${p.mark}"${tip}>${esc(p.text)}</span>`;
    return tip ? `<span${tip}>${esc(p.text)}</span>` : esc(p.text);
};
const cardTextHtml = (c) => (Array.isArray(c.textParts) ? c.textParts.map(partHtml).join('') : esc(c.text || ''));

// 概念稿 定稿.js 的 C.start 常数
const CFG = {
    ring: { port: { rx: 150, w: 330, lift: 62, back: 0.55, dim: 0.45 }, land: { rx: 410, w: 390, lift: 74, back: 0.58, dim: 0.5 } },
    fan: {
        port: { cw: 54, ch: 104, step: 50, y: 0, R: 1500, rk: 0.3, sw: 128, sh: 200, lift: -170 },
        land: { cw: 97, ch: 159, step: 103, y: 0, R: 2600, rk: 0.3, sw: 160, sh: 232, lift: -30 },
    },
    energyMax: 3,
};

// 手牌区：竖屏左右各留 16，横屏 620 宽居中（按当前画布宽计算）。
const landHand = (root) => {
    const W = Math.min(root - 40, 1360), iw = Math.min(380, Math.max(280, W * 0.26));
    return { left: Math.round((root - W) / 2 + iw + 156), w: Math.round(W - iw - 156), root };
};
const handOf = (orient) => {
    const root = canvasW(orient);
    return orient === 'land' ? landHand(root) : { left: Math.round((root - Math.min(root - 32, 400)) / 2), w: Math.min(root - 32, 400), root };
};
// 画布比设计稿宽时，侧边敌人沿宽度同比外移。
const ringOf = (orient) => ({ ...CFG.ring[orient], rx: Math.round(CFG.ring[orient].rx * canvasW(orient) / (orient === 'land' ? 1280 : 390)) });

const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
    shield: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
    exit: P('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    bag: P('<path d="M10 3h4M11 3v5l-5 9a3 3 0 0 0 3 4h6a3 3 0 0 0 3-4l-5-9V3"/><path d="M8.500 15h7"/>'),
    blade: P('<path d="M6 19L19 5l-1 8-9 8z"/>'),
    fan: P('<path d="M12 20L4 7M12 20V4M12 20L20 7"/><circle cx="4" cy="7" r="1.200"/><circle cx="12" cy="4" r="1.200"/><circle cx="20" cy="7" r="1.200"/>'),
    heart: P('<path d="M12 20C5 15 4 11 4 8.500A4 4 0 0 1 12 7a4 4 0 0 1 8 1.500C20 11 19 15 12 20z"/>'),
};
const UNIT = { 伤害: 'blade', 群伤: 'fan', 格挡: 'shield', 回复: 'heart' };
const D = (b) => `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
const MOTIF = {
    atk: D('<path d="M8 34L33 6"/><path d="M14 36L37 11" stroke-dasharray="0.1 4.6" stroke-width="2.6"/><circle cx="33" cy="6" r="2" fill="currentColor"/>'),
    def: D('<path d="M20 5l12 5v10c0 7-5 12-12 15C13 32 8 27 8 20V10z"/><circle cx="20" cy="19" r="1.8" fill="currentColor"/>'),
    skl: D('<circle cx="20" cy="20" r="13" stroke-dasharray="0.1 4.2" stroke-width="2.6"/><circle cx="20" cy="20" r="2" fill="currentColor"/>'),
    pow: D('<path d="M20 4l16 16-16 16L4 20z"/><path d="M20 12v16M12 20h16" stroke-width="1.2"/>'),
};
const TYPE = { attack: 'atk', skill: 'skl', power: 'pow' };
const RARITY = { uncommon: 'uncommon', rare: 'rare', epic: 'epic', mythic: 'myth', personal: 'own', signature: 'sign' };
const CHOICE_VERB = { discard: '弃掉', copy: '复制', 'cost-mod': '减费' };

// 概念稿的装饰：敌人身后的刻度盘与脚下的光点法阵（纯 SVG，随转环转动）
const dots = (r, n, w, col) => `<circle r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="0.1 ${(2 * Math.PI * r / n - 0.1).toFixed(2)}"/>`;
const ticks = (r, n, w, col) => `<circle r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="1.2 ${(2 * Math.PI * r / n - 1.2).toFixed(2)}"/>`;
const DECO = `<svg class="dial" viewBox="-220 -220 440 440" fill="none" aria-hidden="true"><g stroke-width="1.6"><circle r="206" stroke="#6e633f"/><circle r="150" stroke="#4a4332"/><circle r="96" stroke="#3a3626"/>`
    + '<path d="M-206 0H206M0-206V206" stroke="#3a3626" stroke-width="1.3"/><ellipse rx="206" ry="70" transform="rotate(-24)" stroke="#4a4332"/></g>'
    + '<path d="M0-211l5 5-5 5-5-5zM0 201l5 5-5 5-5-5zM-211 0l5-5 5 5-5 5zM201 0l5-5 5 5-5 5z" fill="#b9a46a"/></svg>'
    + `<svg class="dial2" viewBox="-220 -220 440 440" fill="none" aria-hidden="true">${ticks(198, 72, 6, '#8c7d4e')}${ticks(190, 12, 11, '#b9a46a')}</svg>`
    + `<div class="gate" aria-hidden="true"><svg viewBox="-200 -200 400 400" class="g1">${dots(190, 72, 3, '#b9a46a')}${dots(168, 48, 2.2, '#8f8cc4')}<path d="M0-190l4 6-4 6-4-6zM0 178l4 6-4 6-4-6zM-190 0l6-4 6 4-6 4zM178 0l6-4 6 4-6 4z" fill="#b9a46a"/></svg>`
    + `<svg viewBox="-200 -200 400 400" class="g2"><circle r="140" fill="none" stroke="#5d5a86" stroke-width="1.8"/>${dots(120, 36, 2.6, '#a39fd6')}<path d="M0-140L121 70-121 70z M0 140L121-70-121-70z" fill="none" stroke="#5d5a86" stroke-width="1.8"/></svg></div>`;
// 星盘小钟：十二刻度（按住进度环在真实面板里不做，点一下结束）
const TK = Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, r1 = i % 3 ? 22.5 : 20.5; return `M${(Math.sin(a) * r1).toFixed(2)} ${(-Math.cos(a) * r1).toFixed(2)}L${(Math.sin(a) * 25).toFixed(2)} ${(-Math.cos(a) * 25).toFixed(2)}`; }).join('');
const CLOCK = `<svg class="clk" viewBox="-30 -30 60 60" fill="none" aria-hidden="true"><circle r="29" class="cf"/><circle r="27.500" class="trk"/><circle r="27.500" class="run" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90)"/><path d="${TK}" class="tk"/></svg>`;
const PILE = (cls, n, label) => `<div class="pile ${cls}">${esc(label)}<b>${esc(n)}</b></div>`;

const face = (url, name) => (url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : esc(String(name || '').slice(0, 1)));
const cellArt = (c) => `<i class="igs-combat-art" data-atlas="${esc(c.atlas)}" style="--ea-x:${esc(c.x)};--ea-y:${esc(c.y)}"></i>`;
const foeArt = (url, cell, name) => (url ? `<img class="cx-art-img" src="${esc(url)}" alt="" loading="lazy" decoding="async">`
    : cell ? cellArt(cell) : `<span class="cx-silhouette">${portraitSilhouetteSvg(name)}</span>`);
const hpBar = (u, ally) => {
    const pct = u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0;
    return `<div class="hpbar${ally ? ' ally' : ''} cx-hp" style="--igs-combat-hp:${pct}%"><i></i></div>`;
};
const unitAct = (u, pickable) => (pickable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`目标 ${u.name}`)}"`
    : ` data-combat-act="unit-info" data-combat-id="${esc(u.id)}" data-unit-info="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`查看${u.name}的技能与被动`)}"`);
const unitCls = (u, pickable) => `cx-unit${u.alive ? '' : ' is-down'}${pickable ? ' is-targetable' : ''}`;
const unitData = (u) => ` data-unit="${esc(u.id)}" data-side="${esc(u.side)}"`;

// 手牌扇形：照搬 core.js fanLayout()，返回每张牌的内联位置（宽高、left、层序、下沉与旋转）。
function fanLayout(n, selIdx, orient) {
    const F = CFG.fan[orient], Hd = handOf(orient);
    const step = n > 1 ? Math.min(F.step, (Hd.w - F.cw) / (n - 1)) : F.step, span = step * (n - 1) + F.cw, x0 = orient === 'land' ? 0 : (Hd.w - span) / 2;
    return Array.from({ length: n }, (_, i) => {
        const d = (n - 1 - i) * step, sel = i === selIdx;
        const ty = Math.round(F.y + (d * d) / (2 * F.R)), rot = (-(d / F.R) * 57.2958 * F.rk).toFixed(2);
        let left = x0 + i * step, cw = F.cw;
        if (sel) { cw = F.sw; left = Math.min(Math.max(left + F.cw / 2 - F.sw / 2, 8 - Hd.left), Hd.root - 8 - F.sw - Hd.left); }
        return `width:${cw}px;height:${sel ? F.sh : F.ch}px;left:${Math.round(left)}px;z-index:${sel ? 60 : i + 1};--ty:${ty}px;--rot:${rot}deg;`
            + `transform:${sel ? `translateY(${F.lift}px)` : 'translateY(var(--ty)) rotate(var(--rot))'}`;
    });
}

function cardHtml(c, i, style, v, picks, energy) {
    const t = TYPE[c.type] || 'skl';
    const rare = RARITY[c.rarity] || '';
    const live = c.playable || c.choosable;
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const cut = c.baseCost !== undefined && c.cost < c.baseCost;
    const buff = Boolean(c.bonusNote) || (c.baseValue !== undefined && c.value > c.baseValue);
    const sel = v.selected === c.inst;
    const badge = c.choosable ? `<i class="fl nn">${chosen ? '✓' : '○'}</i>` : c.stack > 1 ? `<i class="fl nn">×${esc(c.stack)}</i>` : c.upgraded ? '<i class="fl plus">+</i>' : '';
    const fl = `${badge}${(c.keywordNames || []).includes('消耗') ? '<i class="fl kw">耗</i>' : ''}`;
    const was = cut ? `<s class="was">${esc(c.baseCost)}</s>` : '';
    const unit = UNIT[c.unit];
    const val = Number.isFinite(c.value) ? `<div class="val${unit ? ` u-${unit}` : ''}">${unit ? ICON[unit] : ''}<b${buff ? ' class="up"' : ''}>${esc(c.value)}</b></div>` : `<div class="val no-num">${MOTIF[t]}</div>`;
    const kws = (c.keywordNames || []).length ? `<span class="src">${(c.keywordNames || []).map(esc).join('　')}</span>` : '';
    const bonus = c.bonusNote ? `<span class="src">${esc(c.bonusNote)}</span>` : '';
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    const cls = `card t-${t}${rare ? ` r-${rare}` : ''}${c.cost > energy || !live ? ' poor' : ''}${cut ? ' cut' : ''}${c.baseCost !== undefined && c.cost > c.baseCost ? ' cost-up' : ''}${Number.isFinite(c.value) ? '' : ' no-num'}${c.temp ? ' tmp' : ''}${c.stack > 1 ? ' stack' : ''}${sel ? ' sel' : ''}${v.hovered === c.inst ? ' is-hover' : ''}`;
    return `<div class="${cls}" role="button" tabindex="0" style="${style}" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}`
        + `${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}">`
        + `<i class="edge"></i><div class="cost">${esc(c.cost)}</div>${was}<div class="name">${esc(c.name)}${c.upgraded ? '+' : ''}</div><div class="fls">${fl}</div><div class="art">${MOTIF[t]}</div>`
        + `${val}<p class="desc">${cardTextHtml(c)}${bonus}${kws}</p></div>`;
}

function foeHtml(u, i, f, n, L, v, pick) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const ring = ringVars(i, f, n, L);
    const it = u.intent;
    const intent = it ? `<div class="intent" title="${esc(`${it.label}·${it.name}${it.damage ? `，${it.damage} 点伤害` : ''}`)}">${intentIconSvg(it.kind)}${it.damage ? `<b>${esc(it.damage)}</b>` : ''}<em>${esc(it.damage ? it.name : `${it.label}·${it.name}`)}</em></div>` : '';
    const sts = `${u.block ? `<em class="blk">${ICON.shield}<b>${esc(u.block)}</b></em>` : ''}${u.statuses.map((s) => `<em class="st">${esc(s.label)} <b>${esc(s.stacks)}</b></em>`).join('')}`;
    const ok = pick.pickable(u);
    return `<div class="foe k-${esc(enemyArtKeyFor({ art: u.art, name: u.name }))}${ring.front ? ' front' : ''}${ring.rear ? ' rear' : ''} ${unitCls(u, ok)}"${unitData(u)} style="${ring.style};--atop:${enemyArtTopOf(arts[u.name])}"${unitAct(u, ok)}>`
        + `<div class="art">${foeArt(pics[u.name], arts[u.name], u.name)}</div><div class="head">${intent}`
        + `<div class="row2"><div class="nl"><span class="nm">${esc(u.name)}</span><span class="hpn cx-hp-value">${esc(u.hp)}/${esc(u.maxHp)}</span></div>${hpBar(u, false)}<span class="sts">${sts}</span></div></div></div>`;
}

function leadHtml(hero, v, pick) {
    const b = v.battle;
    const ok = pick.pickable(hero);
    const aw = b.awaken && !b.awaken.used && b.awaken.usable && !b.outcome ? b.awaken : null;
    const awBtn = aw ? `<span class="aw cx-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" role="button" tabindex="0" title="${esc(`觉醒·${aw.label}：${aw.text}`)}" aria-label="${esc(`觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}，不消耗能量，每场一次`)}">觉醒</span>` : '';
    const chips = `${hero.block ? `<span class="chip">${ICON.shield}<b>${esc(hero.block)}</b></span>` : ''}${hero.statuses.map((s) => `<span class="chip">${esc(s.label)} <b>${esc(s.stacks)}</b></span>`).join('')}`;
    return `<div class="lead ${unitCls(hero, ok)}"${unitData(hero)}>`
        + `<div class="face cx-face"${unitAct(hero, ok)}><span class="pic">${face((v.portraits || {})[hero.name], hero.name)}</span><svg viewBox="-50 -50 100 100" class="tk" aria-hidden="true">${dots(46, 40, 2.4, '#8c7d4e')}</svg>${awBtn}</div>`
        + `<div class="info"><div class="n"><span class="nmw">${esc(hero.name)}</span><span class="hp"><b>${esc(hero.hp)}</b>/${esc(hero.maxHp)}</span></div>${hpBar(hero, true)}<div class="chips">${chips}</div></div></div>`;
}

function mateHtml(u, v, pick) {
    const ok = pick.pickable(u);
    return `<div class="mate ${unitCls(u, ok)}"${unitData(u)}${unitAct(u, ok)}><div class="mface">${face((v.portraits || {})[u.name], u.name)}</div>`
        + `<div class="mn">${esc(u.name)}</div>${hpBar(u, true)}</div>`;
}

function trackHtml(b, v) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const list = (b.order || []).slice(0, 6);
    return `<div class="track" role="img" aria-label="${esc(`行动顺序：${list.map((o) => o.name).join('、')}`)}">${list.map((o, i) => {
        const pic = pics[o.name] ? `<img src="${esc(pics[o.name])}" alt="" loading="lazy" decoding="async">` : arts[o.name] && arts[o.name].atlas !== 'none' ? cellArt(arts[o.name]) : `<b>${esc(String(o.name).slice(0, 1))}</b>`;
        return `<span class="who cx-dot${i === 0 ? ' now' : ''}${o.side === 'ally' && i ? ' ally' : ''}" style="--atop:${enemyArtTopOf(arts[o.name])}" data-unit="${esc(o.id)}" title="${esc(o.name)}">${pic}</span>`;
    }).join('')}</div>`;
}

export function battleHtml(v, orient) {
    const b = v.battle;
    const land = orient === 'land';
    const L = ringOf(orient);
    const pick = battlePick(v);
    const ended = Boolean(b.outcome);
    const live = !ended && v.status === 'battle';
    const hero = b.allies.find((u) => u.id === b.heroId) || b.allies.find((u) => u.controlled) || null;
    const mates = b.allies.filter((u) => u !== hero);
    const choice = b.choice || null;
    const picks = choice && Array.isArray(v.chosen) ? v.chosen : [];
    const selIdx = b.hand.findIndex((c) => c.inst === v.selected);
    const fan = fanLayout(b.hand.length, selIdx, orient);
    const f = (() => { const i = b.enemies.findIndex((u) => u.id === v.front); if (i >= 0) return i; const a = b.enemies.findIndex((u) => u.alive); return a >= 0 ? a : 0; })();
    const foes = b.enemies.map((u, i) => foeHtml(u, i, f, b.enemies.length, L, v, pick)).join('');

    const topbar = `<div class="topbar"><span class="title" title="${esc(v.encounter || '战斗')}">${esc(v.encounter || '战斗')}</span>${live ? `<span class="round">第 ${esc(b.turn)} 回合</span>` : ''}</div>`;
    const speed = (v.status === 'battle' || v.settling) ? `<div class="ic ic-x" role="button" tabindex="0" data-combat-act="speed" aria-pressed="${(v.fxSpeed || 1) > 1 ? 'true' : 'false'}" aria-label="演出二倍速">倍速×2</div>` : '';
    const retreat = live && b.canEscape ? `<button type="button" class="ic ic-r" data-combat-act="escape" aria-label="撤退">${ICON.exit}<em>撤退</em></button>` : '';
    const close = `<button type="button" class="ic ic-c" data-combat-act="close" aria-label="关闭">${ICON.close}</button>`;

    const per = Math.max(Number(b.energyPerTurn) || 0, Number(b.energy) || 0, CFG.energyMax);
    const energy = `<div class="energy" role="img" aria-label="${esc(`能量 ${b.energy}/${b.energyPerTurn}`)}"><div class="v">${esc(b.energy)}<small>/${esc(b.energyPerTurn)}</small></div>`
        + `<div class="pips">${Array.from({ length: per }, (_, i) => `<i class="${i < b.energy ? '' : 'off'}"></i>`).join('')}</div></div>`;
    const traits = (Array.isArray(b.traits) ? b.traits : b.heroSkill ? [{ ...b.heroSkill, kind: 'active', innate: true }] : []).filter((t) => t.kind === 'active');
    const skills = traits.map((t, k) => {
        const id = t.skillId ? `hero-skill:${t.skillId}` : 'hero-skill';
        return `<button type="button" class="skill cx-trait${k ? ' is-second' : ''}${v.selected === id ? ' on' : ''}${t.usable ? '' : ' off'}" data-combat-act="hero-skill"${t.skillId ? ` data-combat-id="${esc(t.skillId)}"` : ''} data-trait="${esc(t.id)}" title="${esc(t.name)}"`
            + `${t.usable ? '' : ' aria-disabled="true"'} aria-label="${esc(`主动特性 ${t.name} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`)}">${SKILL_ICON_SVG}${t.cost > 1 ? `<em class="bd">${esc(t.cost)}</em>` : ''}</button>`;
    }).join('');
    const items = (b.items || []).filter((i) => i.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    const bag = `<button type="button" class="bag${traits.length > 1 ? ' is-shift' : ''}${items.length ? '' : ' off'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${v.itemsOpen && items.length ? 'true' : 'false'}"${items.length ? '' : ' aria-disabled="true"'} aria-label="道具" title="道具">${ITEM_ICON_SVG}${total > 1 ? `<em class="bd">${total}</em>` : ''}</button>`;
    const sel = pick.item ? pick.picked : null;
    const hint = sel ? (sel.targets?.length ? '点选敌人作为目标' : '点击承受方使用') : '选择道具后使用';
    const tray = `<div class="tray" role="menu" aria-label="道具"><div class="th"><b>道具</b><span class="hint">${hint}</span></div><div class="slots">${items.map((i) => `<button type="button" role="menuitem" class="slot${i.usable ? '' : ' off'}${i.targets?.length ? ' tg' : ''}${v.selected === `item:${i.itemId}` ? ' on' : ''}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : ICON.bag}<span class="sn">${esc(i.name)}</span><i class="sx">×${esc(i.count)}</i></button>`).join('')}</div></div>`;
    const end = choice
        ? `<button type="button" class="end" data-combat-act="choose-confirm"${picks.length === choice.count ? '' : ' aria-disabled="true"'}>${CLOCK}<b>${esc(CHOICE_VERB[choice.kind] || '选择')}<br>${picks.length}/${esc(choice.count)}</b></button>`
        : `<button type="button" class="end" data-combat-act="end-turn"${b.canEndTurn ? '' : ' aria-disabled="true"'}${needsHold(b) ? ' data-hold' : ''}>${CLOCK}<b>结束<br>回合</b></button>`;
    const hand = `<div class="hand cx-hand${selIdx >= 0 ? ' has-sel' : ''}">${b.hand.map((c, i) => cardHtml(c, i, fan[i], v, picks, b.energy)).join('')}</div>`;
    const pileSt = (k, label, n) => `<div class="pdk ${k}" role="img" aria-label="${label} ${esc(n)}"><small>${label}</small><b>${esc(n)}</b></div>`;
    const piles = pileSt('draw', '抽牌', b.piles.draw) + pileSt('disc', '弃牌', b.piles.discard);
    const ops = ended ? '' : `<div class="oprow">${energy}${skills || bag ? `<div class="tools">${skills}${bag}</div>` : ''}${end}</div>${tray}${hand}${piles}`;
    const opsLand = ended ? '' : `<div class="oprow"><div class="pdk-t"><span>抽牌 <b>${esc(b.piles.draw)}</b></span><span>弃牌 <b>${esc(b.piles.discard)}</b></span></div>${end}</div><div class="rescol">${energy}${skills || bag ? `<div class="tools">${skills}${bag}</div>` : ''}</div>${tray}${hand}`;
    const aiming = pick.card || pick.skill || (pick.item && pick.picked);
    const cls = `igs-cx-canvas ${land ? 'land' : 'port'}${aiming ? ' pick' : ''}${v.itemsOpen && items.length ? ' tray-open' : ''}${ended ? ' is-ended' : ''}`;
    return `<div class="igs-cx-wrap"><div id="igs-cx-canvas" class="${cls}" data-cx="mystic">`
        + `<div class="stage"></div>${DECO}<div class="shade"></div>${topbar}${speed}${retreat}${close}`
        + `${live ? trackHtml(b, v) : ''}<section class="foes cx-field" data-turn="${esc(b.turn)}">${foes}</section>`
        + `${hero ? leadHtml(hero, v, pick) : ''}<div class="mates">${mates.map((u) => mateHtml(u, v, pick)).join('')}</div>${land ? opsLand : ops}`
        + '</div></div>';
}

// 接线样式：画布缩放居中、真实立绘与头像、目标 / 出手 / 拖动等交互状态；设计稿没有的状态用设计稿已有的语言（金 = 选中、红 = 敌意、玉绿 = 我方）。
const S = '#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"])';
const C = '#igs-overlay #igs-cx-canvas:where([data-cx="mystic"])';
const WIRING_CSS = `
#igs-overlay #igs-combat-panel .igs-cx-wrap{position:absolute;inset:0;overflow:hidden;}
${C}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--cx-scale,1));transform-origin:50% 50%;background:transparent;}
${S} .stage{background:none;}
/* 用户 11-02：不要敌人脚下的光点法阵（地面光环） */
${S} .gate{display:none;} ${C}.pick .foe.front .art::after{content:none;}
${S} .who img,${S} .lead .pic img,${S} .mface img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;border-radius:50%;}
/* 行动顺序只露头像：立绘放大取头部，矮身形按看得见的头顶下移取景 */
${S} .track .who img{inset:auto;left:-50%;top:-6%;width:200%;height:200%;object-position:50% 0;border-radius:0;}
${S} .track .who .igs-combat-art{inset:auto;left:-32.5%;top:calc(6% - var(--atop,0) * 220%);width:165%;height:220%;}
${S} .who>b{position:absolute;inset:0;display:grid;place-items:center;font:600 12px var(--title);color:var(--gold);}
${S} .lead .pic{display:grid;place-items:center;overflow:hidden;font:600 18px var(--title);color:var(--gold);background:#1c1d27;}
${S} .mface{position:relative;display:grid;place-items:center;overflow:hidden;background:#1c1d27;font:600 11px var(--title);color:var(--gold);}
${S} .lead .face{cursor:pointer;} ${S} .lead .aw{z-index:2;cursor:pointer;}
${S} .foe .art .cx-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 10px 16px #000);}
${S} .foe .art .cx-silhouette{position:absolute;inset:18% 20% 0;display:block;color:#2a2b36;}
${S} .foe .art .cx-silhouette svg{width:100%;height:100%;fill:currentColor;stroke:none;}
${S} .hpbar.cx-hp>i{width:var(--igs-combat-hp,0%);transition:width .3s;}
${S} .foe .intent svg{fill:none;}
${S} .skill b{font:inherit;letter-spacing:.08em;} ${S} .skill.on,${S} .bag[aria-expanded="true"]{border-bottom-color:var(--gold-hi);}
${S} .skill.off,${S} .bag.off{opacity:.45;}
/* 概念稿 body 的内边距与最小高度被生成到了画布上：清掉，画布宽高才是 --cx-w × 设计稿高 */
${C}{padding:0;min-height:0;}
/* 顶栏：关卡名单行省略，回合数不折行；顶栏宽度让出右上角图标 */
${C} .topbar{max-width:calc(var(--cx-w) - 168px);} ${C}.land .topbar{max-width:calc(var(--cx-w) - 206px);}
${C} .topbar .title{min-width:0;flex:1 1 auto;white-space:nowrap;overflow-x:clip;overflow-y:visible;text-overflow:ellipsis;}
${C} .topbar .round{flex:none;white-space:nowrap;}
/* 操作区（11-02）：能量在手牌正上方居中；技能、道具收进 .tools，竖屏在左端、横屏在手牌左侧，放不下往上折行；结束回合在右端；牌堆跟在右侧 */
${C} .tools{position:absolute;z-index:6;display:flex;flex-wrap:wrap-reverse;align-items:flex-end;gap:6px;}
${C} .tools :is(.skill,.bag){position:static;left:auto;top:auto;}
/* 第二轮：头顶信息压在立绘之上并上移；竖屏操作行同一水平中线；横屏操作列对齐、队友固定间距 */
${S} .foe .head{z-index:3;}
${C}:not(.land) .foes{top:36px;height:522px;} ${C}.land .foes{top:84px;height:520px;}
/* 与漫画统一的头顶位置：意图签顶边、血条中线按画布坐标对齐（竖屏 73 / 117，横屏 35 / 79） */
${C} .foe .head{gap:0;} ${C}:not(.land) .foe .head{margin-bottom:-7px;} ${C}.land .foe .head{margin-bottom:-1px;}
/* 按住确认：星盘小钟指针弧按 --hold 走一圈 */
${S} .end[data-hold] .run{stroke-dasharray:calc(var(--hold,0) * 100) 100;}
${S} .end[data-hold] .clk{filter:drop-shadow(0 0 calc(var(--hold,0) * 6px) #e3d49c);}
/* 矮身形：按看得见的头顶抬高并放大 */
${S} .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.95)) scale(calc(1 + var(--atop,0) * .15));transform-origin:50% 100%;} ${C}.land .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.4)) scale(calc(1 + var(--atop,0) * .8));}
/* 牌面信息规范：稀有度阶梯（冷紫色阶，不用描边层数、不用金）；金色只给强化「+」；叠加露牌边；无数值牌放母题 */
${C} .hand .card,${C} .hand .card[class*=" r-"]{border-color:#3b3a55;}
${C} .hand .card.sel{border-color:#cfcce6;}
${C} .card .cost{box-shadow:none;}
${C} .card::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--rb,transparent);z-index:1;pointer-events:none;}
${C} .card.r-uncommon{--rb:#5d5a86;}
${C} .card:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign){--rb:#a39fd6;}
${C} .card:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost{background:#a39fd6;border-color:#a39fd6;color:#0c0c10;}
${C} .card:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost.cut,${C} .card.cut:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost{color:#0b5a3c;}
${C} .card.cost-up .cost{color:var(--red);border-color:var(--red);}
${C} .card.cost-up:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost{color:#8a1f1d;border-color:#a39fd6;}
${C} .hand .card:is(.r-epic,.r-myth,.r-own,.r-sign){background:linear-gradient(to bottom,#2c2b45 0,#14151c 55%);}
${C} .hand .card.r-myth:not(.sel)::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 35%,#e3e0f833 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:cx-mystic-sheen 4.2s ease-in-out infinite;}
@keyframes cx-mystic-sheen{0%,55%{background-position:-150% 0;}100%{background-position:150% 0;}}
@media (prefers-reduced-motion:reduce){${C} .hand .card.r-myth::after{animation:none;}}
${C} .card:not(.sel) .fl.nn{display:block;}
${C} .card .fl.nn{background:#2c2d3a;color:var(--text);}
${C} .card.no-num:not(.sel) .art{display:none;}
${C} .card .val.no-num{color:var(--tc);} ${C} .card .val.no-num svg{width:30px;height:30px;fill:none;stroke:var(--tc);stroke-width:1.8;filter:drop-shadow(0 0 4px var(--tc));}
/* 技能可发动：流光（一道细光沿圆圈环绕，约 2.4s 一圈，只动 transform；不可发动不显示；减少动态效果 / 低画质改静态细光边） */
${S} .skill:not(.off){position:relative;}
${S} .skill:not(.off)::before{content:"";position:absolute;left:50%;top:50%;width:48px;height:48px;border-radius:50%;pointer-events:none;background:conic-gradient(from 0deg,transparent 0 68%,var(--gold-hi) 100%);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 1.5px),#000 calc(100% - 1.5px));mask:radial-gradient(farthest-side,transparent calc(100% - 1.5px),#000 calc(100% - 1.5px));transform:translate(-50%,-50%);animation:cx-mystic-flow 2.4s linear infinite;}
@keyframes cx-mystic-flow{to{transform:translate(-50%,-50%) rotate(360deg);}}
#igs-overlay[data-igs-quality="low"] ${S} .skill:not(.off) .sc::before,#igs-overlay [data-igs-combat-reduced] ${S} .skill:not(.off)::before{animation:none;background:var(--gold-hi);opacity:.45;}
@media (prefers-reduced-motion:reduce){${S} .skill:not(.off)::before{animation:none;background:var(--gold-hi);opacity:.45;}}
/* 统一布局（11-02）：手牌上沿一行 技能→道具→空白→结束回合；能量在行的左上；抽牌堆在手牌左侧、弃牌堆在右侧（底边对齐手牌）。
   横屏：版心 W 居中，信息组左缘贴版心左缘，手牌右缘贴版心右缘；竖屏：手牌 + 两侧牌堆整组居中，底栏主战者与队友同一行居中成组 */
${C}.land{--W:min(calc(var(--cx-w) - 48px),1120px);--L:calc((var(--cx-w) - var(--W)) / 2);--hw:620px;--hl:calc(var(--L) + var(--W) - var(--hw));--rl:var(--hl);--rw:var(--hw);--rb:calc(720px - 478px);--rh:72px;--pb:94px;}
${C}.port{--hw:min(calc(var(--cx-w) - 32px),400px);--hl:calc((var(--cx-w) - var(--hw)) / 2);--rl:var(--hl);--rw:var(--hw);--rb:calc(844px - 584px);--rh:58px;--pb:136px;--gb:calc((var(--cx-w) - min(calc(var(--cx-w) - 32px),440px)) / 2);}
${C}.land .lead{left:var(--L);}
${C}.port .lead{left:var(--gb);top:771px;width:calc(min(calc(var(--cx-w) - 32px),440px) - 142px);}
${C}.port .mates{left:auto;right:var(--gb);top:746px;width:130px;flex-direction:column;gap:3px;}
${C}.port .mate{display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;column-gap:8px;row-gap:1px;align-items:center;width:130px;height:28px;}
${C}.port .mate .mface{grid-row:1 / 3;width:28px;height:28px;} ${C}.port .mate .mn{order:0;text-align:left;font-size:11px;} ${C}.port .mate .hpbar{width:100%;order:0;}
${C} .hand{left:var(--hl);width:var(--hw);}
${C} .oprow{position:absolute;left:var(--rl);width:var(--rw);bottom:var(--rb);height:var(--rh);display:flex;align-items:center;gap:12px;z-index:5;}
${C} .oprow .energy{filter:drop-shadow(0 2px 6px #0a0b10) drop-shadow(0 0 1px #0a0b10);position:static;width:auto;height:auto;flex:none;place-content:start;text-align:left;}
${C}.port .oprow .energy{order:2;margin-left:auto;} ${C}.port .oprow .tools{order:1;} ${C}.port .oprow .end{order:3;margin-left:0;}
${C} .oprow .tools{position:static;max-width:none;flex-wrap:nowrap;align-items:center;gap:12px;margin:0 6px;}
${C} .tools :is(.skill,.bag){position:relative;left:auto;top:auto;width:44px;height:44px;min-width:44px;padding:0;display:flex;align-items:center;justify-content:center;}
${C} .tools svg{width:22px;height:22px;} ${C} .tools .bd{position:absolute;right:2px;top:1px;font:600 12px/1 var(--num);color:var(--gold-hi);}
/* 行动点数：固定尺寸块 100×44，数字与「/上限」同基线，点珠在数字正下方居中 */
${C} .oprow .energy,${C}.land .rescol .energy{width:100px;height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;place-content:unset;text-shadow:0 1px 4px #0f1015;}
${C} .energy .v{display:flex;align-items:baseline;justify-content:center;font-size:28px;line-height:28px;} ${C} .energy small{font-size:14px;} ${C} .energy .pips{display:flex;justify-content:center;}
${C} .oprow .end{position:relative;left:auto;right:auto;top:auto;margin-left:auto;flex:none;}
${C} .tray{left:var(--rl);top:auto;bottom:calc(var(--rb) + var(--rh) + 8px);}
${C}.port .pdk{top:726px;bottom:auto;width:auto;flex-direction:row;align-items:baseline;gap:4px;} ${C}.port .pdk.draw{left:var(--hl);} ${C}.port .pdk.disc{left:auto;right:calc(var(--cx-w) - var(--hl) - var(--hw));}
${C}.port .pdk :is(small,b){font-size:12px;}
${C} .pdk small{font:12px/1 var(--serif);color:var(--dim);} ${C} .pdk b{font:700 18px/1 var(--serif);color:var(--gold-hi);}
${C} .pdk{position:absolute;bottom:var(--pb);z-index:6;display:flex;align-items:center;gap:8px;font:500 16px/1 var(--num);color:var(--gold-hi);}
/* 横屏底部横条（A3 扁宽饱满）：版心 W 居中；信息组 → 资源列（点数 + 技能道具）→ 手牌，组间距 16px；手牌上沿一行：左抽牌弃牌文字、右结束回合 */
${C}.land{--W:min(calc(var(--cx-w) - 40px),1360px);--L:calc((var(--cx-w) - var(--W)) / 2);--iw:clamp(280px,calc(var(--W) * .26),380px);--hw:calc(var(--W) - var(--iw) - 156px);--hl:calc(var(--L) + var(--iw) + 156px);--rl:var(--hl);--rw:var(--hw);--rb:calc(720px - 506px);--rh:60px;}
${C}.land .lead{left:var(--L);top:552px;width:var(--iw);} ${C}.land .lead .face{width:72px;height:72px;} ${C}.land .lead .n{font-size:16px;} ${C}.land .lead .hpbar{height:7px;}
${C}.land .mates{left:var(--L);top:646px;width:var(--iw);gap:10px;} ${C}.land .mate{width:84px;} ${C}.land .mate .mn{max-width:84px;} ${C}.land .mface{width:36px;height:36px;}
${C}.land .hand{top:516px;height:172px;}
${C}.land .rescol{position:absolute;left:calc(var(--L) + var(--iw) + 16px);top:516px;width:124px;height:172px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;z-index:5;}
${C}.land .rescol .energy{position:static;width:auto;height:auto;place-content:center;text-align:center;filter:drop-shadow(0 2px 6px #0a0b10) drop-shadow(0 0 1px #0a0b10);} ${C}.land .rescol .energy .v{font-size:32px;}
${C}.land .rescol .tools{position:static;display:flex;gap:12px;margin:0;}
${C}.land .pdk-t{display:flex;gap:16px;align-items:baseline;font:12px/1 var(--serif);color:var(--dim);} ${C}.land .pdk-t b{font:500 18px/1 var(--num);color:var(--gold-hi);}
${C}.land .tray{left:var(--hl);bottom:calc(var(--rb) + var(--rh) + 8px);}
/* 横屏最小字号 12px */
${C}.land :is(.foe .intent em,.lead .hp,.chip,.chip b,.mate .mn,.bag em,.card.sel .tag,.card.sel .val em,.card.sel .desc,.elite,.sts em,.ic-x,.lead .ty,.skill .sc,.fl,.lead .aw,.card .cost,.th .hint,.slot .sx,.was,.fl.was,.mface,.ic-s,.card.sel .fl.was){font-size:12px;}
${C}.land .card .val b.up::after{font-size:12px;}
${C}.land .fl{height:auto;min-height:14px;line-height:14px;} ${C}.land .skill .sc{width:20px;height:20px;}
${C}.land .card .val.no-num svg{width:38px;height:38px;}
${C}.land .mates{left:var(--L);top:636px;} ${C}.land .mate{width:72px;} ${C}.land .mate .mn{max-width:72px;overflow:hidden;text-overflow:ellipsis;}
/* 第二轮（11-02）：金色描边与细线全体加粗到 1.5–2px */
${S} .track .who{box-shadow:0 0 0 1.5px #4a4332;} ${S} .track .who.now{box-shadow:0 0 0 2px var(--gold);}
${S} .mface{box-shadow:0 0 0 1.5px #4a4332;} ${S} .lead .pic{box-shadow:0 0 0 2px var(--gold),0 0 12px #7a77ad66;}
${S} .lead .aw,${S} .elite,${S} .ic-x{border-width:1.5px;}
${S} .title{border-bottom-width:2px;} ${S} .pile{border-bottom-width:1.5px;} ${S} .tray::before{height:2px;} ${S} .slot.on{outline-width:2px;}
${S} .clk .cf{stroke-width:2;} ${S} .clk .trk{stroke-width:2;} ${S} .clk .tk{stroke-width:1.5;} ${S} .clk .run{stroke-width:2.5;}
${C} .hand .card{border-width:2px;} ${C} .card .cost{border-width:1.5px;} ${C} .card .edge{height:2px;}
${C} .tools :is(.skill,.bag){border:2px solid var(--gd);border-radius:50%;background:#1c1d27;}
${C} .tools .skill:not(.off)::before{width:44px;height:44px;}
${C} .tools :is(.skill.on,.bag[aria-expanded="true"]){border-color:var(--gold-hi);}
/* 第二轮：竖屏操作行贴边 20px，技能、道具靠左、结束回合靠右，点数在中间不放大 */
${C}.port .oprow{left:20px;width:calc(var(--cx-w) - 40px);}
/* 第二轮：横屏技能、道具拆成两个独立按钮，落在队友行右侧、与队友头像同一水平中线；点数放大放在其上方；结束回合上移（超宽屏下移到手牌同高带） */
${C}.land .rescol{display:contents;}
${C}.land .rescol .energy{position:absolute;left:calc(var(--L) + var(--iw) + 46px);top:573px;width:88px;height:95px;gap:6px;}
${C}.land .rescol .energy .v{font-size:50px;line-height:50px;} ${C}.land .rescol .energy small{font-size:25px;}
${C}.land .rescol .energy .pips{gap:4px;} ${C}.land .rescol .energy .pips i{width:9px;height:9px;}
${C}.land .rescol .tools{position:absolute;left:calc(var(--L) + 250px);top:632px;gap:12px;margin:0;}
${C}.land .hand{top:468px;}
${C}.land .pdk-t{transform:translate(4px,22px);}
${C}.land .oprow .end{transform:translateY(calc(-48px + clamp(0px,calc((var(--cx-w) - 1290px) * 1000),154px)));}
${S} .slot img{width:18px;height:18px;object-fit:contain;}
${S} .end[aria-disabled="true"]{opacity:.5;}
${S} .ic-x{cursor:pointer;} ${S} .ic-x[aria-pressed="true"]{color:var(--gold-hi);border-color:var(--gold-hi);}
${S} .ic-s{width:auto;padding:0 4px;font:11px var(--serif);white-space:nowrap;cursor:pointer;color:var(--dim);}
${C} .ic-s{right:108px;} ${C}.land .ic-s{right:138px;}
${C} .ic-s.ic-s2{right:152px;} ${C}.land .ic-s.ic-s2{right:182px;}
${S} .track .who{flex:none;}
${S} .pile{cursor:default;}
${C}.pick .foe.is-targetable .art{filter:brightness(calc(var(--fl,1) * 1.1)) saturate(var(--fsat,1));}
${C}.pick .foe.is-targetable:not(.front) .art::after{content:"";position:absolute;left:14%;right:14%;bottom:2%;height:22px;border:1.5px solid var(--gold-hi);border-radius:50%;box-shadow:0 0 14px #e3d49c;}
${S} .foe.is-drop-hover .art{filter:brightness(1.3) saturate(1.1) drop-shadow(0 0 18px #d06a68);}
${S} :is(.lead,.mate).is-targetable :is(.pic,.mface){box-shadow:0 0 0 2px var(--jade),0 0 14px 3px #8fc4ae99;}
${S} :is(.lead,.mate).is-drop-hover :is(.pic,.mface){box-shadow:0 0 0 2px var(--gold-hi),0 0 18px 5px #e3d49c99;}
${S} .foe.is-acting .art{filter:brightness(1.15) drop-shadow(0 0 16px #d06a68);}
${S} :is(.lead,.mate).is-acting :is(.pic,.mface){box-shadow:0 0 0 2px var(--gold-hi),0 0 16px 4px #e3d49c88;}
${S} .who.is-acting{box-shadow:0 0 0 2px var(--gold-hi),0 0 0 4px var(--red);}
${S} .foe.is-down{opacity:.35;filter:grayscale(1);pointer-events:none;}
${S} :is(.lead,.mate).is-down :is(.pic,.mface){filter:grayscale(1) brightness(.5);}
${S} .hand .card.is-lifted{opacity:.35;}
${C}.is-ended .foes{pointer-events:none;}
#igs-overlay .igs-cx-ghost{position:absolute;pointer-events:none;z-index:30;}
#igs-overlay .igs-cx-ghost>.hand{position:absolute;left:0;top:0;width:calc(100% / var(--cx-scale,1));height:calc(100% / var(--cx-scale,1));transform:scale(var(--cx-scale,1));transform-origin:0 0;}
#igs-overlay .igs-cx-ghost>.hand>.card{left:0;top:0;bottom:auto;transform:none;}
`;

export const STYLE_TEXT = `${COMBAT_SKIN_MYSTIC_CONCEPT_CSS.replace(/@font-face\{[^}]*\}/g, '')}${WIRING_CSS}`;
