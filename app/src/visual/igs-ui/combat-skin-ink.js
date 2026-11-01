// 水墨（武侠）皮肤 · 战斗中画面：照搬概念稿 gal/战斗界面设计稿/概念/第二轮/ink/_common.js 的标记，假数据换成真实视图 v.battle。
// 样式在 combat-skin-ink-concept-style.js（由设计稿 _base.css、定稿.css、卡面.css 生成）与本文件末尾的接线样式。动作照旧走 data-combat-act / data-combat-id。
import { esc } from './reader-value-utils.js';
import { intentIconSvg, portraitSilhouetteSvg } from './combat-card-art.js';
import { enemyArtTopOf } from './combat-enemy-art.js';
import { battlePick, needsHold, ringVars } from './combat-skin-canvas.js';
import { COMBAT_SKIN_INK_CONCEPT_CSS } from './combat-skin-ink-concept-style.js';

// 牌面说明：与 combat-panel-render.js 的 cardTextHtml 同口径，不从渲染层引入，免得循环依赖。
const partHtml = (p) => {
    const tip = p.tip ? ` data-scale-tip="${esc(p.tip)}"` : '';
    if (p.mark === 'up' || p.mark === 'down') return `<span class="igs-scale-${p.mark}"${tip}>${esc(p.text)}</span>`;
    return tip ? `<span${tip}>${esc(p.text)}</span>` : esc(p.text);
};
const cardTextHtml = (c) => (Array.isArray(c.textParts) ? c.textParts.map(partHtml).join('') : esc(c.text || ''));

// 概念稿 定稿.html 的 INK.boot 参数
const RING = { port: { rx: 130, w: 330, lift: 90, back: 0.42, dim: 0.45 }, land: { rx: 410, w: 390, lift: 90, back: 0.58, dim: 0.5 } };
// 手牌扇形：w 为手牌区宽度，cw 窄签宽，sw 放大牌宽（见定稿.css / 卡面.css）。
const FAN = {
    port: { w: 362, cw: 62, sw: 100, step: 50, y0: 2, arc: 0.45, rot: 1.3, lift: 34 },
    land: { w: 600, cw: 94, sw: 120, step: 82, y0: 2, arc: 0.8, rot: 1.2, lift: 56 },
};
const CHOICE_VERB = { discard: '弃掉', copy: '复制', 'cost-mod': '减费' };

const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
    shield: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
    exit: P('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    speed: P('<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>'),
    redo: P('<path d="M20 12a8 8 0 1 1-3-6.2M20 4v4h-4"/>'),
    ring: P('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>'),
    pill: P('<path d="M10 3h4M10.5 3v4M13.5 3v4"/><path d="M10.5 7C6 9 5 12 5 15a7 7 0 0 0 14 0c0-3-1-6-5.5-8"/>'),
};
const G = (d, cls = '') => `<svg class="gl ${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const GLYPH = {
    伤害: G('<path d="M4 20.5L17.5 3l3 3L7 21.5z"/><path d="M4 16l4 4"/>', 'f'),
    群伤: G('<path d="M12 21.5L3 8c5.5-4 12.5-4 18 0z"/>', 'f'),
    格挡: G('<path d="M12 2.5l8 3v6c0 5.5-3.5 8.5-8 10.5-4.5-2-8-5-8-10.5v-6z"/>', 'f'),
    回复: G('<path d="M12 2.5c4.5 5.5 7 9 7 12.5a7 7 0 0 1-14 0c0-3.5 2.5-7 7-12.5z"/>', 'f'),
};
const MV = (d) => `<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true">${d}</svg>`;
const MOTIF = {
    atk: MV('<path d="M7 43Q22 31 43 5Q35 27 7 43Z"/>'),
    def: MV('<rect x="9" y="9" width="30" height="30" rx="2"/><rect x="15" y="15" width="18" height="18" fill="none" stroke="#15181a" stroke-width="2.2"/>'),
    skl: MV('<path d="M24 7A17 17 0 1 0 39 16" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>'),
    heal: MV('<path d="M24 5C32 16 38 23 38 31A14 14 0 0 1 10 31C10 23 16 16 24 5Z"/>'),
    pow: MV('<path d="M24 5L43 24L24 43L5 24Z"/>'),
};
// 真实牌型 → 概念稿的五种牌色：攻击朱砂、格挡与技能石青（回复石绿）、能力泥金。
const cardKind = (c) => (c.type === 'attack' ? 'atk' : c.type === 'power' ? 'pow' : c.unit === '回复' ? 'heal' : c.unit === '格挡' ? 'def' : 'skl');
const RARITY = { uncommon: 'uncommon', rare: 'rare', epic: 'epic', mythic: 'myth', personal: 'own', signature: 'sign' };

// 头像：有立绘用 <img>（地址已在面板层过滤），没有立绘写名字首字。
const face = (url, name) => (url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : esc(String(name || '').slice(0, 1)));
// 敌人立绘：素材库图 > 通用图集一格 > 中性剪影。
const cellHtml = (cell) => `<i class="igs-combat-art" data-atlas="${esc(cell.atlas)}" style="--ea-x:${esc(cell.x)};--ea-y:${esc(cell.y)}"></i>`;
const foeArt = (url, cell, name) => (url ? `<img class="cx-art-img" src="${esc(url)}" alt="" loading="lazy" decoding="async">`
    : cell ? cellHtml(cell) : `<span class="cx-silhouette">${portraitSilhouetteSvg(name)}</span>`);
const hpBar = (u, cls = '') => `<div class="hpbar${cls} cx-hp" style="--igs-combat-hp:${u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0}%"><i></i></div>`;
const unitAct = (u, pickable) => (pickable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`目标 ${u.name}`)}"`
    : ` data-combat-act="unit-info" data-combat-id="${esc(u.id)}" data-unit-info="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`查看${u.name}的技能与被动`)}"`);
const unitCls = (u, pickable) => `cx-unit${u.alive ? '' : ' is-down'}${pickable ? ' is-targetable' : ''}`;
const unitData = (u) => ` data-unit="${esc(u.id)}" data-side="${esc(u.side)}"`;

// 手牌扇形：照搬 _run.js layout()。
function fanLayout(n, sel, F) {
    const step = n > 1 ? Math.min(F.step, (F.w - F.cw - 6) / (n - 1)) : 0;
    const x0 = (F.w - (step * (n - 1) + F.cw)) / 2;
    return Array.from({ length: n }, (_, i) => {
        const o = i - (n - 1) / 2, on = i === sel;
        let left = Math.round(x0 + i * step);
        if (on) left = Math.max(0, Math.min(F.w - F.sw, left - Math.round((F.sw - F.cw) / 2)));
        return { left, z: on ? 40 : i + 1, ty: (F.y0 + o * o * F.arc).toFixed(1), rot: (o * F.rot).toFixed(2) };
    });
}

function cardHtml(c, i, pos, v, picks, energy) {
    const k = cardKind(c);
    const r = RARITY[c.rarity] ? ` r-${RARITY[c.rarity]}` : '';
    const live = c.playable || c.choosable;
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const sel = v.selected === c.inst;
    const cut = c.baseCost !== undefined && c.cost < c.baseCost;
    const raised = c.baseCost !== undefined && c.cost > c.baseCost;
    const buff = Boolean(c.bonusNote) || (c.baseValue !== undefined && c.value > c.baseValue);
    const badge = c.choosable ? `<i class="bd pick${chosen ? ' on' : ''}"></i>` : c.stack ? `<i class="bd">×${esc(c.stack)}</i>` : c.upgraded ? '<i class="bd up">+</i>' : '';
    const name = `${c.name}${c.upgraded ? '+' : ''}`;
    const unit = c.unit || '';
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    const p = pos[i];
    const cls = `card t-${k}${r}${c.temp ? ' temp' : ''}${c.stack ? (c.stack > 2 ? ' stack stack2' : ' stack') : ''}${buff ? ' buff' : ''}${live && c.cost <= energy ? '' : ' poor'}${sel ? ' sel' : ''}${chosen ? ' picked' : ''}${v.hovered === c.inst ? ' is-hover' : ''}`;
    return `<button type="button" class="${cls}" data-i="${i}" style="left:${p.left}px;z-index:${p.z};--ty:${p.ty}px;--rot:${p.rot}deg" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}`
        + `${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}">`
        + `<div class="cost">${cut || raised ? `<s>${esc(c.baseCost)}</s>` : ''}<b class="${cut ? 'cut' : raised ? 'up' : ''}">${esc(c.cost)}</b></div><div class="name${[...name].length > 3 ? ' n4' : ''}${[...name].length > 4 ? ' n5' : ''}">${esc(name)}</div><div class="art">${MOTIF[k]}</div>`
        + `${Number.isFinite(c.value) ? `<div class="val"><b>${esc(c.value)}</b>${GLYPH[unit] || ''}</div>` : `<div class="val no-num">${MOTIF[k]}</div>`}${badge}<i class="ut">${esc(unit)}</i><p class="fx">${cardTextHtml(c)}</p></button>`;
}

function foeHtml(u, i, f, n, L, v, pick) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const ring = ringVars(i, f, n, L);
    const it = u.intent;
    const intent = it ? `<div class="intent" title="${esc(`${it.label}·${it.name}${it.damage ? `，${it.damage} 点伤害` : ''}`)}">${intentIconSvg(it.kind)}${it.damage ? `<b>${esc(it.damage)}</b>` : ''}<em>${esc(it.damage ? it.name : `${it.label}·${it.name}`)}</em></div>` : '';
    const chips = `${u.block ? `<i class="sc">甲<b>${esc(u.block)}</b></i>` : ''}${u.statuses.map((s) => `<i class="sc">${esc(s.label)}<b>${esc(s.stacks)}</b></i>`).join('')}`;
    const ok = pick.pickable(u);
    return `<div class="foe${ring.front ? ' front' : ''}${ring.rear ? ' rear' : ''} ${unitCls(u, ok)}"${unitData(u)} style="${ring.style};--atop:${enemyArtTopOf(arts[u.name])}"${unitAct(u, ok)}>`
        + `<div class="art">${foeArt(pics[u.name], arts[u.name], u.name)}</div>${intent}`
        + `<div class="plate"><span class="pn">${esc(u.name)}</span>${hpBar(u)}<span class="php cx-hp-value">${esc(u.hp)}/${esc(u.maxHp)}</span><span class="pst">${chips}</span></div></div>`;
}

function leadHtml(hero, v, pick) {
    const pics = v.portraits || {};
    const b = v.battle;
    const ok = pick.pickable(hero);
    const aw = b.awaken && !b.awaken.used && b.awaken.usable && !b.outcome ? b.awaken : null;
    const awBtn = aw ? `<span class="aw cx-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" role="button" tabindex="0" title="${esc(`觉醒·${aw.label}：${aw.text}`)}" aria-label="${esc(`觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}，不消耗能量，每场一次`)}">觉醒</span>` : '';
    const chips = `${hero.block ? `<span class="chip">${ICON.shield}<b>${esc(hero.block)}</b></span>` : ''}${hero.statuses.map((s) => `<span class="chip">${esc(s.label)} <b>${esc(s.stacks)}</b></span>`).join('')}`;
    return `<div class="lead ${unitCls(hero, ok)}"${unitData(hero)}>`
        + `<div class="face cx-face${pics[hero.name] ? '' : ' ch'}"${unitAct(hero, ok)}>${face(pics[hero.name], hero.name)}${awBtn}</div>`
        + `<div class="info"><div class="n">${esc(hero.name)}<span class="hp"><b>${esc(hero.hp)}</b>/${esc(hero.maxHp)}</span></div>${hpBar(hero, ' ally')}`
        + `<div class="chips">${chips}</div></div></div>`;
}

function mateHtml(u, v, pick) {
    const ok = pick.pickable(u);
    const pic = (v.portraits || {})[u.name];
    return `<div class="mate ${unitCls(u, ok)}"${unitData(u)}${unitAct(u, ok)}><div class="mface${pic ? '' : ' ch'}">${face(pic, u.name)}</div>`
        + `<div class="mn">${esc(u.name)}</div>${hpBar(u, ' ally thin')}</div>`;
}

function trackHtml(b, v) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const list = (b.order || []).slice(0, 6);
    return `<div class="track" role="img" aria-label="${esc(`行动顺序：${list.map((o) => o.name).join('、')}`)}">${list.map((o, i) => {
        const pic = pics[o.name] ? `<img src="${esc(pics[o.name])}" alt="" loading="lazy" decoding="async">`
            : arts[o.name] ? cellHtml(arts[o.name]) : `<b>${esc(String(o.name).slice(0, 1))}</b>`;
        return `<span class="who cx-dot${i === 0 ? ' now' : ''}${o.side === 'ally' && i ? ' ally' : ''}" style="--atop:${enemyArtTopOf(arts[o.name])}" data-unit="${esc(o.id)}" title="${esc(o.name)}">${pic}</span>`;
    }).join('')}</div>`;
}

const toolBtn = (act, label, icon, extra = '') => `<button type="button" class="tl" data-combat-act="${act}"${extra}>${icon}<span>${esc(label)}</span></button>`;
// 关卡名竖排题签：四字以内照设计稿，更长的缩小字号、最多留六字。
const titleHtml = (name) => {
    const chars = [...String(name || '战斗')];
    const cut = chars.length > 6 ? `${chars.slice(0, 6).join('')}…` : chars.join('');
    return `<span class="title${chars.length > 4 ? ' long' : ''}" title="${esc(name || '战斗')}"><b>${esc(cut)}</b></span>`;
};

export function inkBattleHtml(v, orient) {
    const b = v.battle;
    const land = orient === 'land';
    const L = RING[orient], F = FAN[orient];
    const pick = battlePick(v);
    const ended = Boolean(b.outcome);
    const hero = b.allies.find((u) => u.id === b.heroId) || b.allies.find((u) => u.controlled) || null;
    const mates = b.allies.filter((u) => u !== hero);
    const choice = b.choice || null;
    const picks = choice && Array.isArray(v.chosen) ? v.chosen : [];
    const selIdx = b.hand.findIndex((c) => c.inst === v.selected);
    const pos = fanLayout(b.hand.length, selIdx, F);
    const f = (() => { const i = b.enemies.findIndex((u) => u.id === v.front); if (i >= 0) return i; const a = b.enemies.findIndex((u) => u.alive); return a >= 0 ? a : 0; })();
    const foes = b.enemies.map((u, i) => foeHtml(u, i, f, b.enemies.length, L, v, pick)).join('');
    // 顶栏：撤退常驻，设计稿没有取消键：再点同一张牌或点空白处撤销选中。
    const live = !ended && v.status === 'battle';
    const tools = [
        live && b.canEscape ? toolBtn('escape', '撤退', ICON.exit) : '',
        v.status === 'battle' || v.settling ? toolBtn('speed', '倍速', ICON.speed, ` aria-pressed="${(v.fxSpeed || 1) > 1 ? 'true' : 'false'}" aria-label="演出二倍速"`) : '',
        toolBtn('close', '关闭', ICON.close, ' aria-label="关闭"'),
    ].filter(Boolean);
    const top = `<div class="topbar">${titleHtml(v.encounter)}${live ? `<span class="round">第 ${esc(b.turn)} 回合</span>` : ''}<div class="tools${tools.length > 3 ? ' many' : ''}">${tools.join('')}</div></div>`;
    // 待选提示：待选阶段写「弃掉 k/N」，选中道具写用法；其余时候不出。
    const sel = pick.item ? pick.picked : null;
    const pendingText = choice ? `选择${esc(CHOICE_VERB[choice.kind] || '')} <b>${picks.length}</b>/${esc(choice.count)}`
        : sel ? `<b>${esc(sel.name)}</b> ${sel.targets?.length ? '选择目标' : '点击承受方使用'}` : '';
    const pending = pendingText && !ended ? `<div class="pending"><span>${pendingText}</span></div>` : '';
    const per = Math.max(Number(b.energyPerTurn) || 0, Number(b.energy) || 0);
    const energy = `<div class="energy" role="img" aria-label="${esc(`能量 ${b.energy}/${b.energyPerTurn}`)}"><div class="v">${esc(b.energy)}<small>/${esc(b.energyPerTurn)}</small></div>`
        + `<div class="pips">${Array.from({ length: per }, (_, i) => `<i class="${i < b.energy ? '' : 'off'}"></i>`).join('')}</div></div>`;
    // 主动特性（最多 2 个）：并排在道具入口左侧，右上角数字为费用。
    const traits = (Array.isArray(b.traits) ? b.traits : b.heroSkill ? [{ ...b.heroSkill, kind: 'active', innate: true }] : []).filter((t) => t.kind === 'active').slice(0, 2);
    const skills = traits.map((t, k) => {
        const id = t.skillId ? `hero-skill:${t.skillId}` : 'hero-skill';
        return `<button type="button" class="sq skill cx-trait${k ? ' is-second' : ''}${v.selected === id ? ' on' : ''}${t.usable ? '' : ' off'}" data-combat-act="hero-skill"${t.skillId ? ` data-combat-id="${esc(t.skillId)}"` : ''} data-trait="${esc(t.id)}"`
            + `${t.usable ? '' : ' aria-disabled="true"'} aria-label="${esc(`主动特性 ${t.name} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`)}">${ICON.ring}<span>${esc(t.name)} <b>${esc(t.cost)}</b></span></button>`;
    }).join('');
    const items = (b.items || []).filter((i) => i.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    const trayOn = Boolean(v.itemsOpen && items.length);
    const itemBtn = `<button type="button" class="sq items cx-items${items.length ? '' : ' off'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${trayOn ? 'true' : 'false'}"${items.length ? '' : ' aria-disabled="true"'} aria-label="道具">${ICON.pill}<span>道具 <b>${total}</b></span></button>`;
    const aimItem = Boolean(pick.item && pick.picked?.targets?.length);
    const th = pick.item && pick.picked ? (aimItem ? '选择目标，点击敌人生效' : '点选后使用') : '选择道具';
    const tray = `<div class="tray" role="menu" aria-label="道具"><div class="th">${th}</div><div class="tg">${items.map((i) => `<button type="button" role="menuitem" class="ti${i.usable ? '' : ' off'}${v.selected === `item:${i.itemId}` ? ' on' : ''}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : ICON.pill}<span>${esc(i.name)}</span><i>×${esc(i.count)}</i></button>`).join('')}</div></div>`;
    const endBtn = choice
        ? `<button type="button" class="end pick" data-combat-act="choose-confirm"${picks.length === choice.count ? '' : ' aria-disabled="true"'}><b>${esc(CHOICE_VERB[choice.kind] || '选择')} ${picks.length}/${esc(choice.count)}</b></button>`
        : `<button type="button" class="end" data-combat-act="end-turn"${b.canEndTurn ? '' : ' aria-disabled="true"'}${needsHold(b) ? ' data-hold' : ''}><b>结束</b></button>`;
    const hand = `<div class="hand cx-hand${selIdx >= 0 ? ' has-sel' : ''}" style="--lift:${F.lift}px">${b.hand.map((c, i) => cardHtml(c, i, pos, v, picks, b.energy)).join('')}</div>`;
    const piles = `<div class="piles"><span>抽牌 <b>${esc(b.piles.draw)}</b> · 弃牌 <b>${esc(b.piles.discard)}</b></span></div>`;
    const ops = ended ? '' : `${pending}${energy}<i class="swipe"></i>${skills}${itemBtn}${tray}${endBtn}${hand}${piles}`;
    const cls = `igs-cx-canvas ${land ? 'land' : 'port'}${traits.length === 2 ? ' two' : traits.length === 0 ? ' solo' : ''}${pick.card || pick.skill ? ' aiming' : ''}${aimItem ? ' aim' : ''}${trayOn ? ' tray-on' : ''}${ended ? ' is-ended' : ''}`;
    return `<div class="igs-cx-wrap"><div id="igs-cx-canvas" class="${cls}" data-cx="ink">`
        + '<div class="stage"></div>'
        + `<section class="foes cx-field" data-turn="${esc(b.turn)}">${foes}</section><i class="floor"></i><i class="seal">战</i>`
        + `${top}${live ? trackHtml(b, v) : ''}`
        + `<div class="deck">${hero ? leadHtml(hero, v, pick) : ''}<div class="mates">${mates.map((u) => mateHtml(u, v, pick)).join('')}</div>${ops}</div>`
        + '</div></div>';
}

// 出牌影子容器没有 port 类，也没有 .phone 的颜色变量：把概念样式里只带 .port 的规则与色板变量各复制一份给影子。
const CANVAS_SC = '.igs-cx-canvas[data-cx="ink"]';
const GHOST_SC = '.igs-cx-ghost[data-cx="ink"]';
const PORT_SC = `:where(${CANVAS_SC},${GHOST_SC}).port`;
const splitTop = (s) => {
    const out = []; let depth = 0, cur = '';
    for (const ch of s) {
        if (ch === '(' || ch === '[') depth++;
        if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
};
function ghostCopy(css) {
    const out = [];
    const rootSel = '#igs-overlay #igs-cx-canvas:where([data-cx="ink"])';
    for (const line of css.split('\n')) {
        const open = line.indexOf('{');
        if (open < 0 || line.startsWith('@')) continue;
        const sel = line.slice(0, open), body = line.slice(open + 1, line.lastIndexOf('}'));
        if (sel.trim() === rootSel) {
            const vars = body.split(';').map((d) => d.trim()).filter((d) => d.startsWith('--') && !d.includes('url('));
            if (vars.length) out.push(`#igs-overlay ${GHOST_SC}{${vars.join(';')}}`);
            continue;
        }
        const ports = splitTop(sel).filter((x) => x.includes(PORT_SC));
        if (ports.length) out.push(`${ports.map((x) => x.replace(PORT_SC, `:where(${GHOST_SC}):not(.land)`)).join(',')}{${body}}`);
    }
    return out.join('\n');
}

// 接线样式：画布缩放居中、真实立绘与头像、目标 / 出手 / 拖动等交互状态；顺序条按用户规则两种屏都竖排在左侧。
const S = `#igs-overlay :where(${CANVAS_SC},${GHOST_SC})`;
const C = '#igs-overlay #igs-cx-canvas:where([data-cx="ink"])';
const K = '#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.card.card.card';
const INK_WIRING_CSS = `
#igs-overlay #igs-combat-panel .igs-cx-wrap{position:absolute;inset:0;overflow:hidden;}
${C}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--cx-scale,1));transform-origin:50% 50%;background:transparent;}
${S} .stage{background:none;}
${S} .who img,${S} .lead .face img,${S} .mface img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;border-radius:50%;}
/* 行动顺序只露头像：立绘放大取头部，矮身形按看得见的头顶下移取景 */
${S} .track .who img{inset:auto;left:-50%;top:-6%;width:200%;height:200%;object-position:50% 0;border-radius:0;}
${S} .track .who .igs-combat-art{inset:auto;left:-32.5%;top:calc(6% - var(--atop,0) * 220%);width:165%;height:220%;}
${S} .who>b{position:absolute;inset:0;display:grid;place-items:center;font:700 12px var(--font-song);color:var(--text);}
${S} .lead .face{display:grid;place-items:center;font:400 22px var(--font-brush);color:var(--text);cursor:pointer;}
${S} .mate .mface{overflow:hidden;position:relative;font-family:var(--font-brush);}
${S} .foe .art .cx-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;}
${S} .foe .art .cx-silhouette{position:absolute;inset:18% 20% 0;display:block;color:#2c393d;}
${S} .foe .art .cx-silhouette svg{width:100%;height:100%;fill:currentColor;stroke:none;}
${S} .hpbar.cx-hp>i{width:var(--igs-combat-hp,0%);transition:width .3s;}
${S} .foe .intent svg{fill:none;}
${S} .foe.front{pointer-events:auto;}
${S} .lead .face .aw{cursor:pointer;}
${S} .hand .card{transform:translateY(var(--ty,0px)) rotate(var(--rot,0deg));text-align:left;display:block;}
${S} .hand .card.sel,${S} .hand .card.picked{transform:translateY(calc(var(--lift,0px) * -1));}
${S} .hand .card.picked:not(.sel){box-shadow:inset 0 0 0 1px var(--c-hi),0 10px 22px #05080a;}
${S} .hand .card.is-lifted{opacity:.35;}
${S} .card[aria-disabled="true"]{cursor:default;}
${S} .sq.on{transform:translateY(-5px) scale(1.08);}
${S} .sq.off{opacity:.45;}
${S} .ti img{width:24px;height:24px;object-fit:contain;}
${C}.port .tray,${C}.land .tray{height:auto;min-height:114px;}
${S} .end[aria-disabled="true"]{opacity:.5;}
${S} .end.pick b{font-size:14px;letter-spacing:.04em;text-indent:0;}
${S} .tl[aria-pressed="true"] svg,${S} .tl[aria-pressed="true"] span{color:var(--gilt);}
${S} .tools.many .tl{width:34px;}
${S} .pending{position:absolute;z-index:2;font:12px/1 var(--font-song);color:var(--moon);letter-spacing:.08em;text-shadow:var(--halo);white-space:nowrap;}
${S} .pending b{color:var(--gilt);font-weight:700;}
${C}.port .pending{left:80px;top:48px;} ${C}.land .pending{left:410px;top:4px;}
${C}.port.two .piles{left:80px;top:48px;} ${C}.port.two .pending{left:80px;top:34px;}
${C}.port.two .swipe{width:176px;} ${C}.port.two .skill.is-second{left:138px;} ${C}.port.two .items{left:196px;}
${C}.port.solo .swipe{width:62px;} ${C}.port.solo .items{left:80px;} ${C}.port.solo .piles{left:150px;}
${S} .topbar .title.long b{font-size:15px;letter-spacing:.06em;}
${C}.port .topbar .title.long,${C}.land .topbar .title.long{height:auto;min-height:124px;padding-bottom:14px;}
/* 长牌名（五字以上）：竖排窄签与放大牌都缩小字号，放大牌允许折成两行 */
${C}.port .card:not(.sel) .name.n5{font-size:11px;line-height:12px;}
${C}.land .card:not(.sel) .name.n5{font-size:13px;line-height:15px;}
${C} .card.sel .name.n5{font-size:12px;line-height:15px;white-space:normal;right:4px;}
${C}.land .card.sel .name.n5{font-size:14px;line-height:17px;}
/* 横屏操作区（第二轮规则）：能量在手牌左端旁；技能、道具、结束回合、牌堆在手牌右侧同一列；队友紧跟主战者下方、左缘对齐 */
${C}.land .lead{width:300px;}
${C}.land .mates{top:124px;gap:18px;}
${C}.land .energy{left:346px;top:24px;}
${C}.land .swipe{left:1032px;top:10px;width:128px;} ${C}.land .skill{left:1038px;top:20px;} ${C}.land .items{left:1098px;top:20px;}
${C}.land .end{left:1040px;right:auto;top:96px;} ${C}.land .piles{left:1040px;top:172px;}
${C}.land.two .swipe{width:172px;} ${C}.land.two .skill.is-second{left:1090px;} ${C}.land.two .items{left:1142px;}
${C}.land.solo .swipe{width:70px;} ${C}.land.solo .items{left:1038px;}
${C}.land .pending{left:410px;top:4px;}
/* 第三轮：敌人尺寸（竖屏缩小露出后排、横屏放大放低）与矮身形抬高 */
${C}.port .foes{--base:300px;} ${C}.land .foes{--base:130px;}
/* 与漫画统一的头顶位置：意图签顶边、血条中线按画布坐标对齐（竖屏 73 / 117，横屏 35 / 79） */
${C}.port .foe .plate{margin-bottom:-23px;} ${C}.land .foe .plate{margin-bottom:-17px;}
${C}.port .foe .intent{bottom:calc(100% + 16px);} ${C}.land .foe .intent{bottom:calc(100% + 22px);}
${S} .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.95)) scale(calc(1 + var(--atop,0) * .15));transform-origin:50% 100%;} ${C}.land .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.4)) scale(calc(1 + var(--atop,0) * .8));}
/* 舞台上没有信息作用的装饰线去掉：行动顺序的连线 */
${S} .track::before{display:none;}
/* 结束回合按住确认：朱砂印泥按 --hold 由中心向外洇开（沿用概念稿的 .end::after） */
${S} .end[data-hold]:active::after{animation:none;}
${S} .end[data-hold]::after{width:calc(var(--hold,0) * 220%);height:calc(var(--hold,0) * 360%);}
/* 牌面信息规范（水墨：只用墨色明度阶梯与朱砂；金色只给强化） */
${S} .card.card{--c-hi:var(--moon);--stk1:#2a3538;--stk2:#1f282b;}
${K}:not(.sel){box-shadow:inset 0 -3px 0 0 var(--tc),inset 0 0 0 1px var(--c-frame),0 4px 10px var(--edge);}
${K}.stack:not(.sel){box-shadow:inset 0 -3px 0 0 var(--tc),inset 0 0 0 1px var(--c-frame),-3px -3px 0 0 var(--stk1),0 4px 10px var(--edge);}
${K}.stack2:not(.sel){box-shadow:inset 0 -3px 0 0 var(--tc),inset 0 0 0 1px var(--c-frame),-3px -3px 0 0 var(--stk1),-6px -6px 0 0 var(--stk2),0 4px 10px var(--edge);}
${K}.sel{box-shadow:inset 0 -3px 0 0 var(--tc),inset 0 0 0 1px var(--c-hi),0 10px 22px #05080a;}
${K}::before{display:block;height:3px;background:var(--rb,transparent);-webkit-mask:none;mask:none;filter:none;}
${K}.r-uncommon{--rb:#55666b;}
${K}:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign){--rb:var(--moon);}
${K} .cost{box-shadow:inset 0 0 0 1px var(--faint);}
${K}:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost{background:var(--moon);color:#131719;box-shadow:none;}
${S} .cost b{font-weight:inherit;} ${S} .cost b.cut{color:#7fc9a6;} ${S} .cost b.up{color:#e8806f;}
${K}:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost b.cut{color:#0f7a52;} ${K}:is(.r-rare,.r-epic,.r-myth,.r-own,.r-sign) .cost b.up{color:#a8321f;}
${S} .cost s{position:absolute;left:0;top:100%;margin-top:1px;font:10px/1 var(--font-song);color:var(--dim);text-decoration:line-through;}
${K}:is(.r-epic,.r-myth,.r-own,.r-sign):not(.sel){background:linear-gradient(to bottom,#2c3a3f 0,#131719 48%);}
${K}.r-myth:not(.sel)::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 35%,rgba(232,239,233,.2) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:cx-ink-sheen 4.2s ease-in-out infinite;}
@keyframes cx-ink-sheen{0%,55%{background-position:-150% 0;}100%{background-position:150% 0;}}
@media (prefers-reduced-motion:reduce){${K}.r-myth::after{animation:none;}}
${S} .card .bd{position:absolute;right:4px;top:4px;min-width:14px;height:14px;padding:0 2px;background:#2c393d;color:var(--moon);font:700 10px/14px var(--font-song);text-align:center;font-style:normal;}
${S} .card .bd.up{background:var(--gilt);color:#131719;}
${S} .card .bd.pick{background:none;box-shadow:inset 0 0 0 1px var(--moon);} ${S} .card .bd.pick.on{background:var(--moon);}
${S} .card.temp{outline:1px dashed var(--dim);outline-offset:-3px;}
${S} .card.buff .val b{color:#8fd0b0;}
${S} .card .val.no-num{display:block;width:26px;height:26px;color:var(--tc);} ${S} .card .val.no-num svg{width:100%;height:100%;display:block;fill:currentColor;stroke:none;}
/* 行动顺序：两种屏都竖排在左侧（用户规则），横屏沿用竖屏的版式，放在关卡名与小印下方 */
${C}.land .track{left:25px;top:190px;flex-direction:column;gap:9px;}
${C}.land .track::before{left:50%;right:auto;top:0;bottom:0;width:1px;height:auto;}
/* 选目标：可选的敌人（不止正前方）都提亮，用概念稿 .foe.target 的亮度 */
${C}.aiming .foe.is-targetable .art{filter:brightness(1.08) saturate(var(--fsat,1)) grayscale(.3);}
${S} .foe.is-drop-hover .art{filter:brightness(1.2) grayscale(.2);}
${S} :is(.lead,.mate).is-targetable :is(.face,.mface){box-shadow:0 0 0 2px var(--edge),0 0 0 3.5px var(--mal);}
${S} :is(.lead,.mate).is-drop-hover :is(.face,.mface){box-shadow:0 0 0 2px var(--edge),0 0 0 3.5px var(--moon);}
/* 出手中、倒下 */
${S} .foe.is-acting .art{filter:brightness(1.15) grayscale(.1);}
${S} :is(.lead,.mate).is-acting :is(.face,.mface){box-shadow:0 0 0 2px var(--edge),0 0 0 3.5px var(--gilt);}
${S} .who.is-acting{box-shadow:0 0 0 2px var(--gilt),0 0 0 4px var(--edge);}
${S} .foe.is-down{opacity:.35;filter:grayscale(1);pointer-events:none;}
${S} :is(.lead,.mate).is-down :is(.face,.mface){filter:grayscale(1) brightness(.5);}
${C}.is-ended .foes{pointer-events:none;}
/* 出牌影子：外层按视口矩形定位（演出层给 left/top/width/height），内层按画布缩放 */
#igs-overlay .igs-cx-ghost{position:absolute;pointer-events:none;z-index:30;}
#igs-overlay .igs-cx-ghost>.hand{position:absolute;left:0;top:0;width:calc(100% / var(--cx-scale,1));height:calc(100% / var(--cx-scale,1));transform:scale(var(--cx-scale,1));transform-origin:0 0;}
#igs-overlay .igs-cx-ghost>.hand>.card{left:0;top:0;bottom:auto;transform:none;}
`;

export const STYLE_TEXT = `${COMBAT_SKIN_INK_CONCEPT_CSS}\n${ghostCopy(COMBAT_SKIN_INK_CONCEPT_CSS)}${INK_WIRING_CSS}`;
export const battleHtml = inkBattleHtml;
