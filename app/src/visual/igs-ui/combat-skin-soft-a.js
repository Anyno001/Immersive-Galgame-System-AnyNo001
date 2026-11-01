// 圆润·方案A（野餐小卡）· 战斗中画面：照搬概念稿 gal/战斗界面设计稿/概念/第二轮/soft/ 的 data.js 与 common.js 的标记，假数据换成真实视图 v.battle。
// 方案A 与方案C 的标记完全相同（只有样式不同），共用部分写在本文件导出，combat-skin-soft-c.js 引用。
import { esc } from './reader-value-utils.js';
import { intentIconSvg } from './combat-card-art.js';
import { enemyArtKeyFor } from '../../combat/enemy-art.js';
import { battlePick, needsHold, ringVars } from './combat-skin-canvas.js';
import { enemyArtTopOf } from './combat-enemy-art.js';
import { COMBAT_SKIN_SOFT_A_CONCEPT_CSS } from './combat-skin-soft-a-concept-style.js';

// 牌面说明：与 combat-panel-render.js 的 cardTextHtml 同口径。
const partHtml = (p) => {
    const tip = p.tip ? ` data-scale-tip="${esc(p.tip)}"` : '';
    if (p.mark === 'up' || p.mark === 'down') return `<span class="igs-scale-${p.mark}"${tip}>${esc(p.text)}</span>`;
    return tip ? `<span${tip}>${esc(p.text)}</span>` : esc(p.text);
};
const cardTextHtml = (c) => (Array.isArray(c.textParts) ? c.textParts.map(partHtml).join('') : esc(c.text || ''));

// 概念稿 SCHEME.ring / SCHEME.fan（方案A、C 相同）
const RING = { port: { rx: 150, w: 330, lift: 90, back: 0.5, dim: 0.6 }, land: { rx: 430, w: 390, lift: 90, back: 0.55, dim: 0.5 } };
const FAN = {
    port: { cw: 58, ch: 104, sw: 136, sh: 198, step: 44, gap: 10, dy: 0, arc: 1.2, rot: 1.1, w: 390, h: 176 },
    land: { cw: 70, ch: 112, sw: 160, sh: 214, step: 70, gap: 8, dy: 0, arc: 1.2, rot: 2, w: 520, h: 220 },
};

const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
    shield: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
    exit: P('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    spark: P('<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>'),
    flask: P('<path d="M9 3h6M10 3v6l-4.5 8a2.5 2.5 0 0 0 2.2 3.5h8.6a2.5 2.5 0 0 0 2.2-3.5L14 9V3"/><path d="M8 14h8"/>'),
};
const PAT = {
    atk: '<path class="fl" d="M3.5 21.5L16 2.5l5.5 4.2L10.5 22z"/>',
    def: '<path class="fl" d="M12 2.5l8 3v6.2c0 4.6-3.2 7.8-8 9.8-4.8-2-8-5.2-8-9.8V5.5z"/>',
    skl: '<circle class="ln" cx="12" cy="12" r="7.5"/><circle class="fl" cx="12" cy="12" r="2.6"/>',
    pow: '<path class="fl" d="M12 2l3.2 6.8L22 12l-6.8 3.2L12 22l-3.2-6.8L2 12l6.8-3.2z"/>',
};
const UNIT = {
    伤害: '<svg class="ui" viewBox="0 0 24 24"><g transform="rotate(45 12 12)"><path d="M12 0.5l3.6 9.5v7h-7.2v-7zM6 17h12v2.4H6zM10.8 19.4h2.4V23h-2.4z"/></g></svg>',
    群伤: '<svg class="ui" viewBox="0 0 24 24"><path d="M12 2l2.6 8.5-2.6 4-2.6-4zM4 5l4.6 6.2-1.4 4.6-4.4-5.6zM20 5l1.2 5.2-4.4 5.6-1.4-4.6zM8 18h8v2.4H8z"/></svg>',
    格挡: '<svg class="ui" viewBox="0 0 24 24"><path d="M12 2.5l8 3v6.2c0 4.6-3.2 7.8-8 9.8-4.8-2-8-5.2-8-9.8V5.5z"/></svg>',
    回复: '<svg class="ui" viewBox="0 0 24 24"><path d="M12 21C5 15.5 3 12 3 8.7A4.7 4.7 0 0 1 12 6.6 4.7 4.7 0 0 1 21 8.7C21 12 19 15.5 12 21z"/></svg>',
};
const TYPE = { attack: 'atk', skill: 'skl', power: 'pow' };
// 概念稿只有 稀有 / 史诗 / 神话 三档圈层：专属按史诗、传说（signature）按神话。
const RARITY = { uncommon: 'uncommon', rare: 'rare', epic: 'epic', mythic: 'myth', personal: 'epic', signature: 'myth' };
const CHOICE_VERB = { discard: '弃掉', copy: '复制', 'cost-mod': '减费' };

const face = (url, name) => (url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : esc(String(name || '').slice(0, 1)));
const foeArt = (url, cell) => (url ? `<img class="cx-art-img" src="${esc(url)}" alt="" loading="lazy" decoding="async">`
    : cell ? `<i class="igs-combat-art" data-atlas="${esc(cell.atlas)}" style="--ea-x:${esc(cell.x)};--ea-y:${esc(cell.y)}"></i>` : '');
const hpBar = (u, cls) => `<div class="hpbar ${cls} cx-hp" style="--igs-combat-hp:${u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0}%"><i></i></div>`;
const unitAct = (u, pickable) => (pickable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`目标 ${u.name}`)}"`
    : ` data-combat-act="unit-info" data-combat-id="${esc(u.id)}" data-unit-info="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`查看${u.name}的技能与被动`)}"`);
const unitCls = (u, pickable) => `cx-unit${u.alive ? '' : ' is-down'}${pickable ? ' is-targetable' : ''}`;
const unitData = (u) => ` data-unit="${esc(u.id)}" data-side="${esc(u.side)}"`;

// 手牌：照搬 common.js layout()。收起是窄签沿弧排开，选中放大并抬起。
function handLayout(n, selIdx, F) {
    const step = n > 1 ? Math.min(F.step, (F.w - F.cw - 4) / (n - 1)) : 0;
    const x0 = (F.w - (step * (n - 1) + F.cw)) / 2;
    return Array.from({ length: n }, (_, i) => {
        const o = i - (n - 1) / 2, sel = i === selIdx;
        const cx = x0 + i * step + F.cw / 2;
        const cw = sel ? F.sw : F.cw, ch = sel ? F.sh : F.ch;
        const left = sel ? Math.max(4, Math.min(F.w - F.sw - 4, cx - F.sw / 2)) : x0 + i * step;
        const y = F.dy + o * o * F.arc;
        const rot = sel ? 0 : o * F.rot;
        return { w: cw, h: ch, left: Math.round(left), top: Math.round(sel ? F.h - ch - F.gap + 6 : F.h - ch - F.gap + y), z: sel ? 60 : i + 1, rot: rot.toFixed(1) };
    });
}

function cardHtml(c, p, v, picks, energy) {
    const t = TYPE[c.type] || 'skl';
    const r = RARITY[c.rarity] ? ` r-${RARITY[c.rarity]}` : '';
    const live = c.playable || c.choosable;
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const cut = c.baseCost !== undefined && c.cost < c.baseCost;
    const boosted = Boolean(c.bonusNote) || (c.baseValue !== undefined && c.value > c.baseValue);
    const sel = v.selected === c.inst;
    const badgeText = chosen ? '✓' : c.stack ? `×${c.stack}` : c.upgraded ? '+' : '';
    const badge = badgeText ? `<i class="badge${!chosen && !c.stack && c.upgraded ? ' up' : ''}">${esc(badgeText)}</i>` : '';
    const costUp = c.baseCost !== undefined && c.cost > c.baseCost;
    const val = Number.isFinite(c.value)
        ? `<div class="val"><b${boosted ? ` class="up"${c.bonusNote ? ` data-scale-tip="${esc(c.bonusNote)}"` : ''}` : ''}>${esc(c.value)}</b><em>${UNIT[c.unit] || ''}</em></div>` : `<div class="val no-num"><b><svg viewBox="0 0 24 24" aria-hidden="true">${PAT[t]}</svg></b></div>`;
    const kws = (c.keywordNames || []).map((x) => `<i class="kw" title="${esc(x)}">${esc(String(x).slice(0, 1))}</i>`).join('');
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    const cls = `card t-${t}${r}${c.temp ? ' tmp' : ''}${c.stack ? (c.stack > 2 ? ' dup dup2' : ' dup') : ''}${boosted ? ' boosted' : ''}${chosen ? ' picked' : ''}${live && c.cost <= energy ? '' : ' poor'}${sel ? ' sel' : ''}${v.hovered === c.inst ? ' is-hover' : ''}`;
    return `<button type="button" class="${cls}" style="width:${p.w}px;height:${p.h}px;left:${p.left}px;top:${p.top}px;z-index:${p.z};transform:${sel ? 'none' : `rotate(${p.rot}deg)`};--rot:${p.rot}deg" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}`
        + `${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}"><i class="win"></i>`
        + `<div class="top"><i class="cost${cut ? ' down' : ''}${costUp ? ' up' : ''}">${esc(c.cost)}</i>${cut ? `<s class="was">${esc(c.baseCost)}</s>` : ''}<span class="name">${esc(c.name)}${c.upgraded ? '+' : ''}</span></div>`
        + `${badge}<div class="pat"><svg viewBox="0 0 24 24">${PAT[t]}</svg></div>${val}<p class="desc">${cardTextHtml(c)}</p><div class="kws">${kws}</div></button>`;
}

function foeHtml(u, i, f, n, L, v, pick) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const ring = ringVars(i, f, n, L);
    const it = u.intent;
    const intent = it ? `<div class="intent" title="${esc(`${it.label}·${it.name}${it.damage ? `，${it.damage} 点伤害` : ''}`)}">${intentIconSvg(it.kind)}${it.damage ? `<b>${esc(it.damage)}</b>` : ''}<em>${esc(it.damage ? it.name : `${it.label}·${it.name}`)}</em></div>` : '';
    const chips = `${u.block ? `<span class="fchip blk">${ICON.shield}<b>${esc(u.block)}</b></span>` : ''}${u.statuses.map((s) => `<span class="fchip vul">${esc(s.label)}<b>${esc(s.stacks)}</b></span>`).join('')}`;
    const ok = pick.pickable(u);
    const kind = enemyArtKeyFor({ art: u.art, name: u.name });
    return `<div class="foe k-${esc(kind)}${ring.front ? ' front' : ''}${ring.rear ? ' rear' : ''} ${unitCls(u, ok)}"${unitData(u)} style="${ring.style};--atop:${enemyArtTopOf(arts[u.name])}"${unitAct(u, ok)}>`
        + `<div class="art">${foeArt(pics[u.name], arts[u.name])}</div>`
        + `<div class="plate">${intent}<div class="row2"><span class="nm">${esc(u.name)}</span>${hpBar(u, '')}<span class="hpv cx-hp-value">${esc(u.hp)}/${esc(u.maxHp)}</span>${chips}</div></div></div>`;
}

function leadHtml(hero, v, pick) {
    const pics = v.portraits || {};
    const b = v.battle;
    const ok = pick.pickable(hero);
    const aw = b.awaken && !b.awaken.used && b.awaken.usable && !b.outcome ? b.awaken : null;
    const awBtn = aw ? `<span class="aw cx-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" role="button" tabindex="0" title="${esc(`觉醒·${aw.label}：${aw.text}`)}" aria-label="${esc(`觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}，不消耗能量，每场一次`)}">觉醒</span>` : '';
    const chips = `${hero.block ? `<span class="chip">${ICON.shield}<b>${esc(hero.block)}</b></span>` : ''}${hero.statuses.map((s) => `<span class="chip">${esc(s.label)} <b>${esc(s.stacks)}</b></span>`).join('')}`;
    return `<div class="lead ${unitCls(hero, ok)}"${unitData(hero)}>`
        + `<div class="face cx-face"${unitAct(hero, ok)}>${aw ? '<i class="chg"></i>' : ''}${face(pics[hero.name], hero.name)}${awBtn}</div>`
        + `<div class="info"><div class="n">${esc(hero.name)}<span class="hp"><b>${esc(hero.hp)}</b>/${esc(hero.maxHp)}</span></div>${hpBar(hero, 'ally')}<div class="chips">${chips}</div></div></div>`;
}

function mateHtml(u, v, pick) {
    const ok = pick.pickable(u);
    return `<div class="mate ${unitCls(u, ok)}"${unitData(u)}${unitAct(u, ok)}><div class="mface">${face((v.portraits || {})[u.name], u.name)}</div>`
        + `<div class="mi"><div class="mn">${esc(u.name)}</div>${hpBar(u, 'ally thin')}</div></div>`;
}

function trackHtml(b, v) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const list = (b.order || []).slice(0, 6);
    return `<div class="track" role="img" aria-label="${esc(`行动顺序：${list.map((o) => o.name).join('、')}`)}">${list.map((o, i) => {
        const pic = pics[o.name] ? `<img src="${esc(pics[o.name])}" alt="" loading="lazy" decoding="async">`
            : arts[o.name] ? `<i class="igs-combat-art" data-atlas="${esc(arts[o.name].atlas)}" style="--ea-x:${esc(arts[o.name].x)};--ea-y:${esc(arts[o.name].y)}"></i>` : `<b>${esc(String(o.name).slice(0, 1))}</b>`;
        return `<span class="who cx-dot${i === 0 ? ' now' : ''}${o.side === 'ally' && i ? ' ally' : ''}" style="--atop:${enemyArtTopOf(arts[o.name])}" data-unit="${esc(o.id)}" title="${esc(o.name)}">${pic}</span>`;
    }).join('')}</div>`;
}

const textBtn = (act, label, extra = '') => `<button type="button" class="ic retreat" data-combat-act="${act}"${extra}>${esc(label)}</button>`;

export function softBattleHtml(v, orient, key) {
    const b = v.battle;
    const land = orient === 'land';
    const F = FAN[orient], L = RING[orient];
    const pick = battlePick(v);
    const ended = Boolean(b.outcome);
    const hero = b.allies.find((u) => u.id === b.heroId) || b.allies.find((u) => u.controlled) || null;
    const mates = b.allies.filter((u) => u !== hero);
    const choice = b.choice || null;
    const picks = choice && Array.isArray(v.chosen) ? v.chosen : [];
    const selIdx = b.hand.findIndex((c) => c.inst === v.selected);
    const pos = handLayout(b.hand.length, selIdx, F);
    const f = (() => { const i = b.enemies.findIndex((u) => u.id === v.front); if (i >= 0) return i; const a = b.enemies.findIndex((u) => u.alive); return a >= 0 ? a : 0; })();
    const foes = b.enemies.map((u, i) => foeHtml(u, i, f, b.enemies.length, L, v, pick)).join('');
    // 顶栏：关卡名、回合、倍速、撤退（图标，常驻）、关闭。设计稿没有取消键：再点同一张牌或点空白处撤销选中。
    const live = !ended && v.status === 'battle';
    const retreat = live && b.canEscape ? `<button type="button" class="ic retreat" data-combat-act="escape" title="撤退" aria-label="撤退">${ICON.exit}</button>` : '';
    const speed = (v.status === 'battle' || v.settling) ? `<button type="button" class="ic spd" data-combat-act="speed" aria-pressed="${(v.fxSpeed || 1) > 1 ? 'true' : 'false'}" aria-label="演出二倍速">×2</button>` : '';
    const top = `<div class="topbar"><span class="title"><b>${esc(v.encounter || '战斗')}</b></span>${live ? `<span class="round">第 ${esc(b.turn)} 回合</span>` : ''}`
        + `<span class="sp"></span>${speed}${retreat}<button type="button" class="ic" data-combat-act="close" aria-label="关闭">${ICON.close}</button></div>`;
    const sel = pick.item ? pick.picked : null;
    const pendingText = choice ? `选择${esc(CHOICE_VERB[choice.kind] || '')} <b>${picks.length}</b>/${esc(choice.count)}`
        : sel ? `<b>${esc(sel.name)}</b> ${sel.targets?.length ? '选择目标' : '点击承受方使用'}` : '';
    const pending = pendingText && !ended ? `<div class="pending"><span>${pendingText}</span></div>` : '';
    const per = Math.max(Number(b.energyPerTurn) || 0, Number(b.energy) || 0);
    const energy = `<div class="energy" role="img" aria-label="${esc(`能量 ${b.energy}/${b.energyPerTurn}`)}"><div class="v">${esc(b.energy)}<small>/${esc(b.energyPerTurn)}</small></div>`
        + `<div class="pips">${Array.from({ length: per }, (_, i) => `<i class="${i < b.energy ? '' : 'off'}"></i>`).join('')}</div></div>`;
    const traits = (Array.isArray(b.traits) ? b.traits : b.heroSkill ? [{ ...b.heroSkill, kind: 'active', innate: true }] : []).filter((t) => t.kind === 'active');
    const skills = traits.map((t, k) => {
        const id = t.skillId ? `hero-skill:${t.skillId}` : 'hero-skill';
        return `<button type="button" class="skill cx-trait${k ? ' is-second' : traits.length > 1 ? ' is-lead2' : ''}${v.selected === id ? ' on' : ''}${t.usable ? '' : ' off'}" data-combat-act="hero-skill"${t.skillId ? ` data-combat-id="${esc(t.skillId)}"` : ''} data-trait="${esc(t.id)}"`
            + `${t.usable ? '' : ' aria-disabled="true"'} title="${esc(t.name)}" aria-label="${esc(`主动特性 ${t.name} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`)}">${ICON.spark}<em class="cnt">${esc(t.cost)}</em></button>`;
    }).join('');
    const items = (b.items || []).filter((i) => i.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    const open = Boolean(v.itemsOpen && items.length);
    const itemBtn = `<button type="button" class="items${traits.length > 1 ? ' is-shift' : ''}${items.length ? '' : ' off'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${open ? 'true' : 'false'}"${items.length ? '' : ' aria-disabled="true"'} title="道具" aria-label="道具">${ICON.flask}${total ? `<em class="cnt">×${total}</em>` : ''}</button>`;
    const tray = `<div class="tray" role="menu" aria-label="道具"><div class="th">道具<em>选择道具，需目标的再点敌人</em></div><div class="tcells">${items.map((i) => `<button type="button" role="menuitem" class="tcell${i.usable ? '' : ' off'}${v.selected === `item:${i.itemId}` ? ' pick' : ''}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : ICON.flask}<b>${esc(i.name)}</b><em>×${esc(i.count)}</em>${i.targets?.length ? '<i class="tg"></i>' : ''}</button>`).join('')}</div></div>`;
    const endBtn = choice
        ? `<button type="button" class="end" data-combat-act="choose-confirm"${picks.length === choice.count ? '' : ' aria-disabled="true"'}><b>${esc(CHOICE_VERB[choice.kind] || '选择')} ${picks.length}/${esc(choice.count)}</b></button>`
        : `<button type="button" class="end" data-combat-act="end-turn"${b.canEndTurn ? '' : ' aria-disabled="true"'}${needsHold(b) ? ' data-hold' : ''}><b>结束回合</b></button>`;
    const hand = `<div class="hand cx-hand">${b.hand.map((c, i) => cardHtml(c, pos[i], v, picks, b.energy)).join('')}</div>`;
    const piles = `<div class="piles">抽牌 <b>${esc(b.piles.draw)}</b> · 弃牌 <b>${esc(b.piles.discard)}</b></div>`;
    const party = `<div class="party">${hero ? leadHtml(hero, v, pick) : ''}<div class="mates">${mates.map((u) => mateHtml(u, v, pick)).join('')}</div></div>`;
    const deck = ended ? `<div class="deck">${party}</div>` : `<div class="deck">${party}${hand}${piles}${energy}${skills}${itemBtn}${tray}${endBtn}${pending}</div>`;
    const cls = `igs-cx-canvas ${land ? 'land' : 'port'}${pick.card || pick.skill ? ' aiming' : ''}${pick.item && pick.picked ? ' item-aim' : ''}${open ? ' tray-on' : ''}${ended ? ' is-ended' : ''}`;
    return `<div class="igs-cx-wrap"><div id="igs-cx-canvas" class="${cls}" data-cx="${key}">`
        + '<div class="stage"><div class="bgi"></div><div class="vig"></div></div>'
        + `${top}${live ? trackHtml(b, v) : ''}<section class="foes cx-field" data-turn="${esc(b.turn)}">${foes}</section>${deck}`
        + '</div></div>';
}

// 接线样式：画布缩放居中、真实立绘与头像、目标 / 出手 / 拖动等交互状态；设计稿没有的状态沿用设计稿已有的色。两套共用，按皮肤键生成。
function softTail(key) {
    const S = `#igs-overlay :where(.igs-cx-canvas[data-cx="${key}"],.igs-cx-ghost[data-cx="${key}"])`;
    const C = `#igs-overlay #igs-cx-canvas:where([data-cx="${key}"])`;
    const a = key === 'soft-a';
    const END_BASE = a ? 'background:var(--cream);color:var(--txt);box-shadow:0 3px 0 var(--cream-2);' : 'background:var(--surf);color:var(--cream);box-shadow:0 0 0 2px #4a454d;';
    const END_FILL = a ? 'var(--pink)' : '#74505c';
    const COST_BG = a ? 'var(--ink)' : '#4a454d', COST_FG = 'var(--cream)';
    const UNC = a ? '#b4a9b0' : '#8a808a', RARE = a ? '#e5586d' : '#f08a9a';
    const TOP = a ? '#fbdde1' : '#4f4655';
    const RARE_COST = a ? '#f2a1ac' : '#f08a9a', RARE_FG = '#1d1b1e';
    const DUP2 = a ? '#d2c7b6' : '#5d5763';
    const INTENT = a ? 'box-shadow:none;' : '';
    return `
${S} .foe .row2 .hpv{flex:none;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;}
/* 矮身形（兽、龙蛇等）：按看得见的头顶抬高并稍放大，头顶对到人形高度 */
${S} .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.95)) scale(calc(1 + var(--atop,0) * .15));transform-origin:50% 100%;} ${C}.land .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.4)) scale(calc(1 + var(--atop,0) * .8));}
/* 敌人意图签：平的实色胶囊，不垫底部投影 */
${S} .foes .foe .intent{${INTENT}}
/* 结束回合：和本套关卡名胶囊同一语言的圆角胶囊；按住时按 --hold 从左填色 */
${C}.port .end{left:312px;top:562px;width:72px;height:44px;} ${C}.land .end{left:1148px;top:606px;width:112px;height:44px;}
${S} .end{border-radius:999px;overflow:hidden;${END_BASE}}
${S} .end::before{content:"";position:absolute;inset:0;width:auto;height:auto;margin:0;border-radius:inherit;background:${END_FILL};transform:scaleX(var(--hold,0));transform-origin:0 50%;}
${S} .end b{position:relative;z-index:1;font-size:14px;line-height:1;white-space:nowrap;letter-spacing:.04em;}
/* 牌面信息规范：罕见顶部色带；稀有色带换亮色 + 费用标填色；史诗再加顶光；神话再加缓慢扫光；不用描边层数表示稀有度 */
${S} .card .cost{background:${COST_BG};color:${COST_FG};}
${S} .card .cost.down{background:#3f9a78;color:#fff;} ${S} .card .cost.up{background:#c0364d;color:#fff;}
${S} .card.r-uncommon{--rb:${UNC};} ${S} .card:is(.r-rare,.r-epic,.r-myth){--rb:${RARE};}
${S} .card:is(.r-uncommon,.r-rare,.r-epic,.r-myth){background:linear-gradient(var(--rb),var(--rb)) 0 0/100% 4px no-repeat,var(--rbg,var(--cardbg));}
${S} .card:is(.r-epic,.r-myth){--rbg:linear-gradient(to bottom,${TOP} 0,var(--cardbg) 55%);outline:none;}
${S} .card:is(.r-rare,.r-epic,.r-myth) .cost{background:${RARE_COST};color:${RARE_FG};box-shadow:0 0 0 2px var(--cardbg);}
${S} .card:is(.r-rare,.r-epic,.r-myth) .cost.down{color:#0b5e3f;} ${S} .card:is(.r-rare,.r-epic,.r-myth) .cost.up{color:#8f1229;}
${S} .card.r-myth:not(.sel)::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:4;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.35) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:cx-soft-sheen 4.2s ease-in-out infinite;}
@keyframes cx-soft-sheen{0%,55%{background-position:-150% 0;}100%{background-position:150% 0;}}
@media (prefers-reduced-motion:reduce){${S} .card.r-myth::before{animation:none;}}
/* 强化：金色「+」角标（金色只给强化）；叠加：背后露出错位牌边；无数值的牌在数值位放牌型母题 */
${S} .card .badge{background:${COST_BG};color:${COST_FG};} ${S} .card .badge.up{background:#e3a92b;color:#1d1b1e;}
${S} .card.dup2::after{box-shadow:0 -5px 0 -3px ${DUP2};}
${S} .card .val.no-num b svg{display:block;width:17px;height:17px;stroke:none;} ${S} .card.sel .val.no-num b svg{width:30px;height:30px;}
${S} .card .val .fl{fill:#fff8f0;stroke:none;} ${S} .card .val .ln{fill:none;stroke:#fff8f0;stroke-width:3;}
`;
}

export function softWiringCss(key) {
    const S = `#igs-overlay :where(.igs-cx-canvas[data-cx="${key}"],.igs-cx-ghost[data-cx="${key}"])`;
    const C = `#igs-overlay #igs-cx-canvas:where([data-cx="${key}"])`;
    return `
#igs-overlay #igs-combat-panel .igs-cx-wrap{position:absolute;inset:0;overflow:hidden;}
${C}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--cx-scale,1));transform-origin:50% 50%;background:transparent;}
${S} .stage .bgi{background:rgba(18,16,18,.22);}
${S} .who img,${S} .lead .face img,${S} .mface img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;border-radius:50%;}
/* 行动顺序只露头像：立绘放大取头部，矮身形按看得见的头顶下移取景 */
${S} .track .who img{inset:auto;left:-50%;top:-6%;width:200%;height:200%;object-position:50% 0;border-radius:0;}
${S} .track .who .igs-combat-art{inset:auto;left:-32.5%;top:calc(6% - var(--atop,0) * 220%);width:165%;height:220%;}
${S} .who>b{position:absolute;inset:0;display:grid;place-items:center;font-weight:700;font-size:12px;}
${S} .who{background:var(--cream);}
${S} .lead .face{display:grid;place-items:center;background:var(--mint);color:#1d1b1e;font-weight:700;font-size:18px;cursor:pointer;}
${S} .lead .face .aw{z-index:2;cursor:pointer;}
${S} .mface{display:grid;place-items:center;position:relative;overflow:hidden;background:var(--mint);color:#1d1b1e;font-weight:700;}
${S} .mate{cursor:pointer;} ${C}.port .mate{flex:0 0 60px;min-width:0;} ${C}.land .mate{flex:0 0 88px;min-width:0;}
${S} .foe .art .cx-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 8px 14px #121012);}
${S} .hpbar.cx-hp>i{width:var(--igs-combat-hp,0%);transition:width .3s;}
${S} .foe .intent svg{fill:none;}
${S} .topbar .ic{border:0;cursor:pointer;} ${S} .topbar .spd[aria-pressed="true"]{color:var(--butter);}
${S} .track .who{flex:none;}
${S} .skill.off,${S} .items.off{opacity:.45;} ${S} .skill.on,${S} .items[aria-expanded="true"]{outline:2px solid var(--tray-ac);outline-offset:2px;}
${C}.port .skill.is-second{left:126px;} ${C}.port .items.is-shift{left:168px;}
${C}.land .skill{left:1044px;top:606px;} ${C}.land .skill.is-lead2{left:992px;} ${C}.land .skill.is-second{left:1044px;} ${C}.land .items,${C}.land .items.is-shift{left:1096px;top:606px;}
${C}.land .piles{left:auto;right:20px;top:660px;text-align:right;}
${C}.land .hand{left:460px;width:520px;}
${C}.land .energy{left:378px;top:600px;width:70px;height:56px;}
/* 头顶信息贴顶栏、立绘放大上移（竖横屏） */
${C}.port{--foe-b:96px;--hpw:170px;} ${C}.land{--foe-b:130px;}
/* 与漫画统一的头顶位置：信息条按立绘上沿定位（意图签顶边：竖屏 73 / 横屏 35；血条中线 117 / 79），去掉血条外的胶囊外框 */
${C} .foe .plate{bottom:auto;top:-42px;} ${C}.land .foe .plate{top:-48px;}
${C} .foe .intent{margin-bottom:1px;}
${C} .foe .row2{height:auto;min-height:26px;padding-top:0;padding-bottom:0;align-content:flex-start;} ${C} .foe .row2 .nm{line-height:26px;}
/* 行动顺序竖排贴左缘（方案C 概念稿横屏写在顶部，这里统一左缘） */
${C}.land .track{left:20px;top:70px;flex-direction:column;} ${C}.port .track{left:8px;flex-direction:column;}
/* 卡面：花朵在邮票区正中，碎花底纹减弱 */
${C}.port .card:not(.sel) .val{top:20px;} ${C}.land .card:not(.sel) .val{top:21px;}
${S} .card.t-atk{--pale:#f1a0ad;} ${S} .card.t-def{--pale:#92b5e0;} ${S} .card.t-skl{--pale:#82c8a9;} ${S} .card.t-pow{--pale:#b29de0;}
${S} .card .win::before{-webkit-mask-size:22px 22px;mask-size:22px 22px;}
${softTail(key)}
${S} .tcell img{width:20px;height:20px;object-fit:contain;}
${S} .tcells{flex-wrap:wrap;}
${S} .end[aria-disabled="true"]{opacity:.5;}
${S} .card.poor:not(.sel){filter:saturate(.55) brightness(.85);}
${S} .card.picked{box-shadow:0 0 0 3px var(--pink),0 12px 22px rgba(18,16,18,.6);}
${S} .card.is-lifted{opacity:.35;}
${S} .pending{pointer-events:none;} ${S} .pending span{display:inline-block;padding:4px 12px;border-radius:999px;background:var(--surf);color:var(--cream);font-size:12px;font-weight:700;white-space:nowrap;}
${S} .pending b{color:var(--butter);}
${C}.port .pending{left:126px;top:522px;} ${C}.land .pending{left:340px;top:436px;}
/* 选目标：可选的敌人（不止正前方）都提亮并在立绘上发光（不再给血条加外框） */
${C}.aiming .foe.is-targetable .art,${C}.item-aim .foe.is-targetable .art{filter:brightness(1.1) drop-shadow(0 0 14px var(--aim));}
${C}.pick-tg .foe.front .row2,${C}.aiming .foe.is-targetable .row2,${C}.item-aim .foe.is-targetable .row2{outline:none;}
${C}.pick-tg .foe.front .art{filter:brightness(1.1) drop-shadow(0 0 14px var(--aim));}
${S} .foe.is-drop-hover .art{filter:brightness(1.3) drop-shadow(0 0 18px rgba(229,88,109,.7));}
${S} :is(.lead,.mate).is-targetable :is(.face,.mface){box-shadow:0 0 0 3px var(--green),0 0 14px 4px rgba(111,224,180,.6);}
${S} :is(.lead,.mate).is-drop-hover :is(.face,.mface){box-shadow:0 0 0 3px var(--cream),0 0 18px 6px rgba(111,224,180,.8);}
${S} .foe.is-acting .art{filter:brightness(1.15) drop-shadow(0 0 16px rgba(229,88,109,.65));}
${S} :is(.lead,.mate).is-acting :is(.face,.mface){box-shadow:0 0 0 3px var(--butter),0 0 16px 5px rgba(247,220,154,.55);}
${S} .who.is-acting{box-shadow:0 0 0 3px var(--butter);}
${S} .foe.is-down{opacity:.35;filter:grayscale(1);pointer-events:none;}
${S} :is(.lead,.mate).is-down :is(.face,.mface){filter:grayscale(1) brightness(.5);}
${C}.is-ended .foes{pointer-events:none;}
/* 出牌影子：外层按视口矩形定位（演出层给 left/top/width/height），内层按画布缩放 */
#igs-overlay .igs-cx-ghost{position:absolute;pointer-events:none;z-index:30;}
#igs-overlay .igs-cx-ghost>.hand{position:absolute;left:0;top:0;width:calc(100% / var(--cx-scale,1));height:calc(100% / var(--cx-scale,1));transform:scale(var(--cx-scale,1));transform-origin:0 0;}
#igs-overlay .igs-cx-ghost>.hand>.card{left:0;top:0;bottom:auto;transform:none;--rot:0deg !important;}
`;
}

export const battleHtml = (v, orient) => softBattleHtml(v, orient, 'soft-a');
export const STYLE_TEXT = `${COMBAT_SKIN_SOFT_A_CONCEPT_CSS}${softWiringCss('soft-a')}`;
