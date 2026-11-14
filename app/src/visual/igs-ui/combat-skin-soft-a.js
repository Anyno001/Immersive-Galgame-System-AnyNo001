// 圆润·方案A（野餐小卡）· 战斗中画面：照搬概念稿 gal/战斗界面设计稿/概念/第二轮/soft/ 的 data.js 与 common.js 的标记，假数据换成真实视图 v.battle。
// 方案A 与方案C 的标记完全相同（只有样式不同），共用部分写在本文件导出，combat-skin-soft-c.js 引用。
import { esc } from './reader-value-utils.js';
import { cardFxHtml } from './combat-card-text.js';
import { resourceBarHtml } from './combat-resource-bar.js';
import { skinIntentHtml } from './combat-intent.js';
import { enemyArtKeyFor } from '../../combat/enemy-art.js';
import { ITEM_ICON_SVG, SKILL_ICON_SVG, battlePick, canvasW, ringVars, rewardCardMarkup, rewardRowMarkup } from './combat-skin-canvas.js';
import { powerBadgesHtml } from './combat-power-badges.js';
import { statusChipAttrs } from './combat-status-tips.js';
import { enemyArtTopOf } from './combat-enemy-art.js';
import { COMBAT_SKIN_SOFT_A_CONCEPT_CSS } from './combat-skin-soft-a-concept-style.js';
import { KEYWORD_CHAR, KEYWORD_NAME_TIPS, cardMainKeyword, cardValueDelta } from './combat-panel-model.js';

// 概念稿 SCHEME.ring / SCHEME.fan（方案A、C 相同）
const RING = { port: { rx: 150, w: 330, lift: 90, back: 0.5, dim: 0.6 }, land: { rx: 430, w: 390, lift: 90, back: 0.55, dim: 0.5 } };
const FAN = {
    port: { cw: 58, ch: 104, sw: 136, sh: 198, step: 44, gap: 10, dy: 0, arc: 1.2, rot: 1.1, w: 390, h: 176 },
    land: { cw: 78, ch: 125, sw: 160, sh: 214, step: 80, gap: 8, lead: 6, dy: 0, arc: 1.2, rot: 2, w: 520, h: 210 },
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
    攻击力: '<svg class="ui" viewBox="0 0 24 24"><path d="M12 3l8 8-2 2-6-6-6 6-2-2zM12 12l8 8-2 2-6-6-6 6-2-2z"/></svg>',
    防御力: '<svg class="ui" viewBox="0 0 24 24"><path d="M12 3l8 8-2 2-6-6-6 6-2-2zM12 12l8 8-2 2-6-6-6 6-2-2z"/></svg>',
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
    const x0 = F.lead !== undefined ? F.lead : (F.w - (step * (n - 1) + F.cw)) / 2;
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
    const choice = Boolean(v.battle?.choice);
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const cut = c.baseCost !== undefined && c.cost < c.baseCost;
    const boosted = c.baseValue !== undefined && c.value > c.baseValue;
    const sel = v.selected === c.inst;
    // 待选阶段：候选牌照常亮，不在候选里的压暗；已选的抬起并挂「已选」签。强化「强」优先于叠加 ×N（叠加已由牌边错位表示）。
    const badge = c.upgraded ? '<i class="badge up">强</i>' : c.stack ? `<i class="badge">×${esc(c.stack)}</i>` : '';
    const costUp = c.baseCost !== undefined && c.cost > c.baseCost;
    const delta = cardValueDelta(c);
    const dots = c.hits > 1 ? `<i class="dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(c.hits, 5))}</i>` : '';
    const tip = sel && (c.valueTip || c.bonusNote) ? ` data-scale-tip="${esc(c.valueTip || c.bonusNote)}"` : '';
    const val = Number.isFinite(c.value)
        ? `<div class="val"><b${boosted ? ' class="up"' : ''}${tip}>${esc(c.value)}</b><em${delta ? ' class="hd"' : ''}>${UNIT[c.unit] || ''}${delta ? `<u class="dl">${esc(delta)}</u>` : ''}</em>${dots}</div>` : `<div class="val no-num"><b><svg viewBox="0 0 24 24" aria-hidden="true">${PAT[t]}</svg></b></div>`;
    // 关键字单字圆章：放大牌列全部（临时已有虚线框，不出章），可点开解释；窄签信息行只露一枚，后接第一条附加效果。
    const names = (c.keywordNames || []).filter((x) => x !== '临时');
    const kws = sel ? names.map((x) => `<i class="kw" data-scale-tip="${esc(KEYWORD_NAME_TIPS[x] || x)}">${esc(KEYWORD_CHAR[x] || String(x).slice(0, 1))}</i>`).join('') : '';
    const main = cardMainKeyword(c.keywordNames);
    const row = !sel && (main || c.extra) ? `<div class="irow">${main ? `<i class="kw">${esc(KEYWORD_CHAR[main])}</i>` : ''}${c.extra ? `<em>${esc(c.extra)}</em>` : ''}</div>` : '';
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    const dim = choice ? !c.choosable : !(live && c.cost <= energy);
    const cls = `card t-${t}${r}${c.temp ? ' tmp' : ''}${c.stack ? (c.stack > 2 ? ' dup dup2' : ' dup') : ''}${boosted ? ' boosted' : ''}${chosen ? ' picked' : ''}${dim ? ' poor' : ''}${choice && dim ? ' nopick' : ''}${sel ? ' sel' : ''}${v.hovered === c.inst ? ' is-hover' : ''}`;
    return `<button type="button" class="${cls}" style="width:${p.w}px;height:${p.h}px;left:${p.left}px;top:${p.top}px;z-index:${p.z};transform:${sel ? 'none' : `rotate(${p.rot}deg)`};--rot:${p.rot}deg" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}`
        + `${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}"><i class="win"></i>`
        + `<div class="top"><i class="cost${cut ? ' down' : ''}${costUp ? ' up' : ''}">${esc(c.cost)}</i>${c.baseCost !== undefined ? `<s class="was">${esc(c.baseCost)}</s>` : ''}<span class="name">${esc(c.name)}</span></div>`
        + `${badge}${chosen ? '<i class="pk">已选</i>' : ''}<div class="pat"><svg viewBox="0 0 24 24">${PAT[t]}</svg></div>${val}<p class="desc">${sel ? cardFxHtml(c) : ''}</p>${row}<div class="kws">${kws}</div></button>`;
}

function foeHtml(u, i, f, n, L, v, pick) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const ring = ringVars(i, f, n, L);
    const it = u.intent;
    const intent = skinIntentHtml(it);
    const chips = `${u.block ? `<span class="fchip blk">${ICON.shield}<b>${esc(u.block)}</b></span>` : ''}${u.statuses.map((s) => `<span class="fchip vul"${statusChipAttrs(s)}>${esc(s.label)}<b>${esc(s.stacks)}</b></span>`).join('')}`;
    const ok = pick.pickable(u);
    const kind = enemyArtKeyFor({ art: u.art, name: u.name });
    return `<div class="foe k-${esc(kind)}${ring.front ? ' front' : ''}${ring.rear ? ' rear' : ''} ${unitCls(u, ok)}"${unitData(u)} style="${ring.style};--atop:${enemyArtTopOf(arts[u.name])}"${unitAct(u, ok)}>`
        + `<div class="art">${foeArt(pics[u.name], arts[u.name])}</div>`
        + `<div class="plate">${intent}<div class="row2"><span class="nm">${esc(u.name)}</span>${u.tier ? `<span class="fchip tier">${u.tier === 'boss' ? '首领' : '精英'}</span>` : ''}${hpBar(u, '')}<span class="hpv cx-hp-value">${esc(u.hp)}/${esc(u.maxHp)}</span>${chips}${powerBadgesHtml(u)}</div></div></div>`;
}

function leadHtml(hero, v, pick) {
    const pics = v.portraits || {};
    const b = v.battle;
    const ok = pick.pickable(hero);
    const aw = b.awaken && !b.awaken.used && b.awaken.usable && !b.outcome ? b.awaken : null;
    const awBtn = aw ? `<span class="aw cx-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" role="button" tabindex="0" title="${esc(`觉醒·${aw.label}：${aw.text}`)}" aria-label="${esc(`觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}，不消耗能量，每场一次`)}">觉醒</span>` : '';
    const chips = `${hero.block ? `<span class="chip">${ICON.shield}<b>${esc(hero.block)}</b></span>` : ''}${hero.statuses.map((s) => `<span class="chip"${statusChipAttrs(s)}>${esc(s.label)} <b>${esc(s.stacks)}</b></span>`).join('')}`;
    return `<div class="lead ${unitCls(hero, ok)}"${unitData(hero)}>`
        + `<div class="face cx-face"${unitAct(hero, ok)}>${aw ? '<i class="chg"></i>' : ''}${face(pics[hero.name], hero.name)}${awBtn}</div>`
        + `<div class="info"><div class="n">${esc(hero.name)}<span class="hp"><b class="cx-hp-cur">${esc(hero.hp)}</b>/${esc(hero.maxHp)}</span></div>${hpBar(hero, 'ally')}<div class="chips">${chips}${powerBadgesHtml(hero)}</div>${resourceBarHtml(hero.res, { row: 'chips', item: 'chip' })}</div></div>`;
}

function mateHtml(u, v, pick) {
    const ok = pick.pickable(u);
    return `<div class="mate ${unitCls(u, ok)}"${unitData(u)}${unitAct(u, ok)}><div class="mface">${face((v.portraits || {})[u.name], u.name)}</div>`
        + `<div class="mi"><div class="mn">${esc(u.name)}</div>${hpBar(u, 'ally thin')}</div>${powerBadgesHtml(u, { compact: true })}</div>`;
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

const textBtn = (act, label, extra = '') => `<button type="button" class="ic retreat" data-combat-act="${act}"${extra}>${esc(label)}</button>`;

export function softBattleHtml(v, orient, key) {
    const b = v.battle;
    const land = orient === 'land';
    // 竖屏手牌区宽 = 画布逻辑宽（贴左右边）；横屏手牌区固定 520 居中偏右
    const landW = (() => { const W = Math.min(canvasW('land') - 40, 1360); return W - Math.min(380, Math.max(280, W * 0.26)) - 288; })();
    const F = orient === 'land' ? { ...FAN.land, w: landW } : { ...FAN.port, w: Math.min(canvasW('port') - 32, 400) }, L = RING[orient];
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
    const top = `<div class="topbar"><span class="title" title="${esc(v.encounter || '战斗')}"><b>${esc(v.encounter || '战斗')}</b></span>${live ? `<span class="round">第 ${esc(b.turn)} 回合</span>` : ''}`
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
            + `${t.usable ? '' : ' aria-disabled="true"'} title="${esc(t.name)}" aria-label="${esc(`主动特性 ${t.name} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`)}">${SKILL_ICON_SVG}${Number(t.cost) > 1 ? `<em class="cnt">${esc(t.cost)}</em>` : ''}</button>`;
    }).join('');
    const items = (b.items || []).filter((i) => i.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    const open = Boolean(v.itemsOpen && items.length);
    const itemBtn = `<button type="button" class="items${traits.length > 1 ? ' is-shift' : ''}${items.length ? '' : ' off'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${open ? 'true' : 'false'}"${items.length ? '' : ' aria-disabled="true"'} title="道具" aria-label="${esc(`道具 剩余 ${total} 个`)}">${ITEM_ICON_SVG}${total > 1 ? `<em class="cnt">${esc(total)}</em>` : ''}</button>`;
    const tray = `<div class="tray" role="menu" aria-label="道具"><div class="th">道具<em>选择道具，需目标的再点敌人</em></div><div class="tcells">${items.map((i) => `<button type="button" role="menuitem" class="tcell${i.usable ? '' : ' off'}${v.selected === `item:${i.itemId}` ? ' pick' : ''}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : ICON.flask}<b>${esc(i.name)}</b><em>×${esc(i.count)}</em>${i.targets?.length ? '<i class="tg"></i>' : ''}</button>`).join('')}</div></div>`;
    const endBtn = choice
        ? `<button type="button" class="end" data-combat-act="choose-confirm"${picks.length === choice.count ? '' : ' aria-disabled="true"'}><b>${esc(CHOICE_VERB[choice.kind] || '选择')} ${picks.length}/${esc(choice.count)}</b></button>`
        : `<button type="button" class="end" data-combat-act="end-turn"${b.canEndTurn ? '' : ' aria-disabled="true"'}><b>结束回合</b></button>`;
    const hand = `<div class="hand cx-hand">${b.hand.map((c, i) => cardHtml(c, pos[i], v, picks, b.energy)).join('')}</div>`;
    const pileBox = (cls, n, label) => `<div class="pile ${cls}" role="img" aria-label="${label} ${esc(n)}" title="${label}"><span>${label}</span><b>${esc(n)}</b></div>`;
    const piles = pileBox('pile-d', b.piles.draw, '抽牌') + pileBox('pile-x', b.piles.discard, '弃牌') + `<div class="piles">抽牌 <b>${esc(b.piles.draw)}</b> · 弃牌 <b>${esc(b.piles.discard)}</b></div>`;
    const party = `<div class="party">${hero ? leadHtml(hero, v, pick) : ''}<div class="mates">${mates.map((u) => mateHtml(u, v, pick)).join('')}</div></div>`;
    const deck = ended ? `<div class="deck">${party}</div>` : `<div class="deck">${party}${hand}${piles}${energy}${skills}${itemBtn}${tray}${endBtn}${pending}</div>`;
    const cls = `igs-cx-canvas ${land ? 'land' : 'port'}${pick.card || pick.skill ? ' aiming' : ''}${pick.item && pick.picked ? ' item-aim' : ''}${open ? ' tray-on' : ''}${ended ? ' is-ended' : ''}`;
    return `<div class="igs-cx-wrap"><div id="igs-cx-canvas" class="${cls}" data-cx="${key}">`
        + '<div class="stage"><div class="bgi"></div><div class="vig"></div></div>'
        + `${top}${live ? trackHtml(b, v) : ''}<section class="foes cx-field" data-turn="${esc(b.turn)}">${foes}</section>${deck}`
        + '</div></div>';
}

// 稀有度＝邮票同色深浅：邮票仍按牌型上色，普通最浅，罕见、稀有、史诗、神话渐深（个人按史诗、专属按神话）；每格为「邮票底 / 花纹」，饱和度封顶。
const TIERS = ['', '.r-uncommon', '.r-rare', '.r-epic', '.r-myth'];
const STAMPS = {
    'soft-a': {
        atk: '#f1d0d5/#f8e7ea #eab8c0/#f2d4d8 #e3a0ab/#ebbcc3 #dd8896/#e5a4ae #d67181/#de8c99',
        def: '#d0dff1/#e7eff8 #b8cfea/#d4e2f2 #a0bfe3/#bcd2eb #88afdd/#a4c2e5 #719fd6/#8cb2de',
        skl: '#d5ece2/#eaf6f1 #c0e3d4/#d8eee5 #abd9c6/#c3e4d6 #95d0b7/#aedbc8 #80c6a9/#99d1ba',
        pow: '#dad0f1/#ede8f8 #c8b9e9/#ddd4f2 #b5a1e2/#cbbdeb #a38adb/#b8a5e3 #9073d4/#a68edc',
    },
    'soft-c': {
        atk: '#d3deee/#e9eff7 #bdcee6/#d6e1ef #a6bedd/#c0d1e7 #90aed5/#aac1df #7a9dcc/#94b0d6',
        def: '#d3e4ee/#e9f1f6 #bdd6e5/#d7e6ef #a7c9dc/#c1d9e6 #91bbd4/#abcbde #7caecb/#95bdd5',
        skl: '#f0d7d0/#f9eeec #e9c3b9/#f2dad4 #e2afa2/#eac6bd #da9b8b/#e3b2a6 #d38773/#dc9e8f',
        pow: '#dad0f1/#ede8f8 #c8b9e9/#ddd4f2 #b5a1e2/#cbbdeb #a38adb/#b8a5e3 #9073d4/#a68edc',
    },
};
const stampCss = (S, key) => Object.entries(STAMPS[key]).flatMap(([t, row]) => row.split(' ').map((x, i) => {
    const [base, pale] = x.split('/');
    return `${S} .card.t-${t}${TIERS[i]}{--tc2:${base};--pale:${pale};}`;
})).join(' ');
// 接线样式：画布缩放居中、真实立绘与头像、目标 / 出手 / 拖动等交互状态；设计稿没有的状态沿用设计稿已有的色。两套共用，按皮肤键生成。
function softTail(key) {
    const S = `#igs-overlay :where(.igs-cx-canvas[data-cx="${key}"],.igs-cx-ghost[data-cx="${key}"])`;
    const C = `#igs-overlay #igs-cx-canvas:where([data-cx="${key}"])`;
    const a = key === 'soft-a';
    const END_BASE = a ? 'background:var(--cream);color:var(--txt);box-shadow:0 3px 0 var(--cream-2);' : 'background:var(--surf);color:var(--cream);box-shadow:0 0 0 2px #3d4452;';
    const END_FILL = a ? 'var(--pink)' : '#4f74a8';
    const COST_BG = a ? 'var(--ink)' : '#3d4452', COST_FG = 'var(--cream)';
    const DUP2 = a ? '#d2c7b6' : '#46506a';
    const INTENT = a ? 'box-shadow:none;' : '';
    // 费用圆一律黑色系白字，只分深浅（减费浅、增费深）；专属牌身反色：野餐粉换深墨、绘本蓝换奶油
    const COST = a ? { n: '#4a4347', d: '#7a7278', u: '#121212' } : { n: '#3d4452', d: '#6b7385', u: '#121316' };
    const EX = a ? { bg: '#2a272c', fg: '#f6efe4', cost: '#f6efe4', costFg: '#1d1b1e', chip: '#f6efe4', chipFg: '#1d1b1e', sub: '#aaa1a8' } : { bg: '#f6efe4', fg: '#38333a', cost: '#3d4452', costFg: '#f7efe4', chip: '#3d4452', chipFg: '#f7efe4', sub: '#6f666e' };
    const TOP = a ? '#fbdde1' : '#3d4a60';
    const WAS_BG = a ? '#2a272c' : '#2f3541', DL = a ? '#b3a9b1' : '#a9b2c2', WAS_EX_BG = a ? '#f6efe4' : '#3d4452', WAS_EX_FG = a ? '#1d1b1e' : '#f7efe4';
    const SUB = a ? '#6f666e' : '#aab2c0', INK = a ? '#1d1b1e' : '#1c1d21';
    const K = `${S} .card.card.card`, EXS = `${K}:is([data-rarity="personal"],[data-rarity="signature"])`;
    return `
${S} .foe .row2 .hpv{flex:none;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;}
/* 矮身形（兽、龙蛇等）：按看得见的头顶抬高并稍放大，头顶对到人形高度 */
${S} .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.95)) scale(calc(1 + var(--atop,0) * .15));transform-origin:50% 100%;} ${C}.land .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.4)) scale(calc(1 + var(--atop,0) * .8));}
/* 敌人意图签：平的实色胶囊，不垫底部投影 */
${S} .foes .foe .intent{${INTENT}}
/* 结束回合：和本套关卡名胶囊同一语言的圆角胶囊；按住时按 --hold 从左填色 */
${C}.port .end{left:auto;right:var(--HL);top:491px;width:72px;height:44px;} ${C}.land .end{left:auto;right:var(--L);top:474px;width:112px;height:44px;}
${S} .end{border-radius:999px;overflow:hidden;${END_BASE}}
${S} .end::before{content:"";position:absolute;inset:0;width:auto;height:auto;margin:0;border-radius:inherit;background:${END_FILL};transform:scaleX(var(--hold,0));transform-origin:0 50%;}
${S} .end b{position:relative;z-index:1;font-size:14px;line-height:1;white-space:nowrap;letter-spacing:.04em;}
/* 牌面信息规范（二稿）：稀有度只看邮票同色深浅，整牌不描边、费用圆不加圈；费用圆黑色系；个人、专属牌身反色 */
${K}{box-shadow:0 6px 12px #121012;outline:none;}
${K} .cost{background:${COST.n};color:#fff;box-shadow:0 0 0 2px var(--cardbg);}
${K} .cost.down{background:${COST.d};} ${K} .cost.up{background:${COST.u};}
${EXS}{--cardbg:${EX.bg};background:${EX.bg};color:${EX.fg};}
${EXS} :is(.name,.desc){color:${EX.fg};}
${EXS} .cost:not(.up):not(.down){background:${EX.cost};color:${EX.costFg};}
${EXS} .kw{background:${EX.chip};color:${EX.chipFg};}
${EXS} .irow em{color:${EX.sub};}
${S} .card:is(.r-epic,.r-myth){background:linear-gradient(to bottom,${TOP} 0,var(--cardbg) 55%);}
${S} .card.r-myth:not(.sel)::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:4;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.35) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:cx-soft-sheen 4.2s ease-in-out infinite;}
@keyframes cx-soft-sheen{0%,55%{background-position:-150% 0;}100%{background-position:150% 0;}}
@media (prefers-reduced-motion:reduce){${S} .card.r-myth::before{animation:none;}}
/* 强化：金底「强」字圆章（金色只给强化）；叠加：背后露出错位牌边；无数值的牌在数值位放牌型母题 */
${S} .card .badge{background:${COST_BG};color:${COST_FG};} ${S} .card .badge.up{background:#e3a92b;color:#1d1b1e;min-width:0;width:16px;height:16px;padding:0;font-size:10px;line-height:16px;right:5px;top:5px;}
${S} .card.sel .badge.up{width:20px;height:20px;font-size:12px;line-height:20px;right:9px;top:9px;}
${S} .card.dup2::after{box-shadow:0 -5px 0 -3px ${DUP2};}
${S} .card .val.no-num b svg{display:block;width:17px;height:17px;stroke:none;} ${S} .card.sel .val.no-num b svg{width:30px;height:30px;}
${S} .card .val .fl{fill:#fff8f0;stroke:none;} ${S} .card .val .ln{fill:none;stroke:#fff8f0;stroke-width:3;}
${S} .card .val{isolation:isolate;}
/* 窄签：牌名上移，牌名下一行为信息行（关键字小章 + 第一条附加效果，单行截断）；放大牌说明居中、最多两行 */
${S} .card:not(.sel) .name{top:74px;}
${S}.land .card:not(.sel) .name{top:81px;}
${S} .card .irow{position:absolute;left:3px;right:3px;top:87px;height:11px;display:flex;align-items:center;justify-content:center;gap:2px;z-index:3;white-space:nowrap;overflow:hidden;}
${S}.land .card .irow{top:98px;}
${S} .card .irow em{font-size:9px;min-width:0;overflow:hidden;text-overflow:ellipsis;line-height:12px;font-weight:700;font-style:normal;color:${SUB};}
${S} .card .irow .kw{flex:none;width:12px;height:12px;font-size:8px;line-height:1;}
${K}.sel .desc{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
${K}.sel .val b[data-scale-tip]{cursor:help;}
/* 窄签单位小章：花右下角，伤害、格挡、回复一眼分开 */
${K}:not(.sel) .val em{display:grid !important;position:absolute;right:-4px;bottom:-2px;z-index:2;width:12px;height:12px;border-radius:50%;place-items:center;background:#fff8f0;box-shadow:0 0 0 1.5px var(--tc);color:var(--tc);}
${K}:not(.sel) .val em .ui{width:6px !important;height:6px !important;}
${C} .card .val em .ui{fill:currentColor;stroke:none;}
/* 多段：花下一排奶油色实心圆点，几颗就是几段（最多 5 颗） */
${S} .card .val .dots{position:absolute;left:50%;top:calc(100% + 2px);translate:-50% 0;z-index:2;display:flex;gap:4px;}
${S} .card .val .dots i{display:block;width:6px;height:6px;border-radius:50%;background:#fff8f0;}
${S} .card.sel .val .dots{top:calc(100% - 3px);gap:5px;} ${S} .card.sel .val .dots i{width:9px;height:9px;}
/* 差值：接在单位小章后面，章扩成奶油色小胶囊；差值比单位图形更淡，0.9 倍字号，不加粗不描边，数字不转色 */
${K}:not(.sel) .val em.hd{display:flex !important;width:auto;padding:0 3px 0 2px;gap:1px;border-radius:999px;}
${K}.sel .val em.hd{display:flex !important;width:auto;padding:0 6px 0 4px;gap:3px;border-radius:999px;}
${K} .val em .dl{font-style:normal;font-weight:400;text-decoration:none;color:${DL};font-size:8px;line-height:1;}
${K}.sel .val em .dl{font-size:11px;}
${K}.sel .val b.up::after{display:none;}
${K}.sel .val em.hd .ui{flex:none;}
/* 原费副框：贴在费用圆右下边角的黑色系小圆，划掉的原费；窄签与放大牌都有 */
${K} .was{display:grid !important;position:absolute;left:22px;top:22px;z-index:6;box-sizing:border-box;width:10px;height:10px;margin:0;padding:0;place-items:center;border-radius:50%;background:${WAS_BG};box-shadow:0 0 0 1.5px var(--cardbg);color:#fff8f0;opacity:1;font:700 7px/1 var(--num,sans-serif);font-style:normal;text-decoration:line-through;text-decoration-thickness:1px;}
${K}.sel .was{left:25px;top:27px;width:14px;height:14px;font-size:9px;}
${EXS} .was{background:${WAS_EX_BG};color:${WAS_EX_FG};}
/* 待选阶段：候选牌照常亮，不在候选里的压暗；已选的抬起，头顶挂「已选」签 */
${S} .card.picked{translate:0 -10px;}
${S} .card .pk{position:absolute;left:50%;top:-8px;z-index:5;translate:-50% 0;padding:0 7px;height:16px;border-radius:999px;font-size:10px;line-height:16px;font-weight:700;font-style:normal;white-space:nowrap;background:${INK};color:#fff8f0;}
${S} .card.poor.nopick:not(.sel){filter:saturate(.4) brightness(.6);}
`;
}

export function softWiringCss(key) {
    const GLOW_A = key === 'soft-c' ? '#8fb0d8' : '#f2a1ac', GLOW_B = key === 'soft-c' ? '#dce8f7' : '#ffd9de', SKILL_BG = key === 'soft-c' ? 'var(--surf)' : 'var(--ink)';
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
${S} .mate{cursor:pointer;} ${C}.port .mate{flex:0 0 auto;min-width:0;} ${C}.land .mate{flex:1 1 0;min-width:0;}
${S} .foe .art .cx-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 8px 14px #121012);}
${S} .foe .fchip.tier{color:var(--txt);text-shadow:none;font-weight:700;}
${S} .hpbar.cx-hp>i{width:var(--igs-combat-hp,0%);transition:width .3s;}
${S} .foe .intent svg{fill:none;}
${S} .topbar .ic{border:0;cursor:pointer;} ${S} .topbar .spd[aria-pressed="true"]{color:var(--butter);}
${S} .track .who{flex:none;}
${S} .skill.off,${S} .items.off{opacity:.45;}
/* 技能可发动：一道细光沿按钮边缘环绕（旋转的锥形渐变在底层，按钮底色盖住内部只露细边；只动 transform），不可发动不显示；减少动态效果时改静态细光边 */
${S} .skill:not(.off){overflow:hidden;}
${S} .skill:not(.off)>*{position:relative;z-index:2;}
${S} .skill:not(.off)::before{content:"";position:absolute;inset:-50%;z-index:0;pointer-events:none;background:conic-gradient(transparent 0 60%,${GLOW_A} 84%,${GLOW_B} 100%);animation:cx-soft-flow 2.4s linear infinite;will-change:transform;}
${S} .skill:not(.off)::after{content:"";position:absolute;inset:1.5px;z-index:1;pointer-events:none;border-radius:14.5px;background:${SKILL_BG};}
@keyframes cx-soft-flow{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion:reduce){${S} .skill:not(.off)::before{animation:none;inset:0;background:${GLOW_A};}} ${S} .skill.on,${S} .items[aria-expanded="true"]{outline:2px solid var(--tray-ac);outline-offset:2px;}
${C}.port .skill,${C}.port .skill.is-lead2{left:20px;} ${C}.port .skill.is-second{left:76px;} ${C}.port .items{left:76px;} ${C}.port .items.is-shift{left:132px;} ${C}.port .end{right:20px;} ${C}.port .energy{right:calc(20px + 84px);}
/* 横屏统一布局：手牌上沿一行 能量（无底框）→ 技能 → 道具 → 结束回合；位置取版心变量 --R / --L */
${C}.land .skill,${C}.land .skill.is-lead2{left:calc(var(--RX) - 8px);top:630px;} ${C}.land .skill.is-second{left:calc(var(--RX) + 48px);top:630px;} ${C}.land .items{left:calc(var(--RX) + 48px);top:630px;} ${C}.land .items.is-shift{left:calc(var(--RX) + 104px);top:630px;}
${C}.land .hand{left:var(--HX);top:470px;width:var(--HWD);height:210px;}
${C}.port .energy{background:none;box-shadow:none;}
${S} .energy{filter:drop-shadow(0 2px 6px #121212) drop-shadow(0 0 1px #121212);} ${S} .skill .cx-skill-ico{stroke-width:1.4;}
/* 技能与道具：各自完整的 44 宽按钮，间距 12px；图标 20px，次数小字 12px */
${S} :is(.skill,.items){width:44px;height:44px;} ${S} :is(.skill,.items) svg{width:22px;height:22px;}
${S} :is(.skill,.items) .cnt{position:absolute;right:3px;top:2px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;display:grid;place-items:center;font-size:12px;line-height:1;background:var(--pink);color:#1c1d21;}
${S} .energy .v{display:flex;align-items:baseline;justify-content:center;} ${S} .energy .pips{justify-content:center;}
${C}.land .energy{left:calc(var(--RX) - 8px);top:552px;width:100px;height:60px;background:none;box-shadow:none;} ${C}.land .energy .v{font-size:42px;line-height:1;} ${C}.land .energy .v small{font-size:22px;} ${C}.land .energy .pips{margin-top:4px;}
/* 横屏底部：状态栏去底板，头像白圈 + 柔影，文字加阴影；手牌整体放大约 15%（选中牌保持原放大） */
${C}.land .party{background:none;box-shadow:none;outline:none;color:var(--cream);text-shadow:0 1px 3px #121212,0 0 6px #121212;}
${C}.land .lead .n .hp,${C}.land .mate .mn{color:var(--cream);} ${C}.land .lead .n .hp b{color:#fff;}
${C}.land .lead .face,${C}.land .mate .mface{box-shadow:0 0 0 2px #fff,0 3px 10px rgba(18,18,18,.55);}
${C}.land .hpbar{box-shadow:0 0 0 1px #121212;} ${C}.land :is(.face,.mface){text-shadow:none;}
${C}.land .card:not(.sel){scale:1.15;}
${S} .pile{display:none;} ${C}.land .pile,${C}.port .pile{display:flex;} ${C}.land .piles,${C}.port .piles{display:none;}
${S} .pile{color:var(--cream);} ${C}.land .pile{top:482px;}
/* 头顶信息贴顶栏、立绘放大上移（竖横屏） */
${C}.port{--foe-b:96px;--hpw:170px;} ${C}.land{--foe-b:130px;}
${C}.land :is(.chip,.fchip,.intent em,.skill .cnt,.items .cnt,.badge,.kw,.face .aw,.tray .th em,.tcell em,.tcell b,.who,.pending span,.tipbox){font-size:12px;}
/* 与漫画统一的头顶位置：信息条按立绘上沿定位（意图签顶边：竖屏 73 / 横屏 35；血条中线 117 / 79），去掉血条外的胶囊外框 */
${C} .foe .plate{bottom:auto;top:-42px;} ${C}.land .foe .plate{top:-48px;}
${C} .foe .intent{margin-bottom:1px;}
${C} .foe .row2{height:auto;min-height:26px;padding-top:0;padding-bottom:0;align-content:flex-start;} ${C} .foe .row2 .nm{line-height:26px;}
/* 行动顺序竖排贴左缘（方案C 概念稿横屏写在顶部，这里统一左缘） */
${C}.land .track{left:20px;top:70px;flex-direction:column;} ${C}.port .track{left:8px;flex-direction:column;}
/* 卡面：花朵在邮票区正中，碎花底纹减弱 */
${C}.port .card:not(.sel) .val{top:20px;} ${C}.land .card:not(.sel) .val{top:21px;}
${stampCss(S, key)}
${key === 'soft-c' ? `${S} .card.t-skl{--tc:#d8806b;}` : ''}
${S} .card .win::before{-webkit-mask-size:22px 22px;mask-size:22px 22px;}
${softTail(key)}
${S} .tcell img{width:20px;height:20px;object-fit:contain;}
${S} .tcells{flex-wrap:wrap;}
${S} .end[aria-disabled="true"]{opacity:.5;}
${S} .card.poor:not(.sel){filter:saturate(.55) brightness(.85);}
${S} .card.is-lifted{opacity:.35;}
${S} .pending{pointer-events:none;} ${S} .pending span{display:inline-block;padding:4px 12px;border-radius:999px;background:var(--surf);color:var(--cream);font-size:12px;font-weight:700;white-space:nowrap;}
${S} .pending b{color:var(--butter);}
${C}.port .pending{left:calc(var(--HL) + 100px);top:502px;} ${C}.land .pending{left:var(--HX);top:462px;}
/* 选目标：可选的敌人（不止正前方）都提亮并在立绘上发光（不再给血条加外框） */
${C}.aiming .foe.is-targetable .art,${C}.item-aim .foe.is-targetable .art{filter:brightness(1.1) drop-shadow(0 0 14px var(--aim));}
${C}.pick-tg .foe.front .row2,${C}.aiming .foe.is-targetable .row2,${C}.item-aim .foe.is-targetable .row2{outline:none;}
${C}.pick-tg .foe.front .art{filter:brightness(1.1) drop-shadow(0 0 14px var(--aim));}
${S} .foe.is-drop-hover .art{filter:brightness(1.3) drop-shadow(0 0 18px rgba(229,88,109,.7));}
${S} :is(.lead,.mate).is-targetable :is(.face,.mface){box-shadow:0 0 0 3px var(--green),0 0 14px 4px ${key === 'soft-c' ? 'rgba(143,176,216,.6)' : 'rgba(111,224,180,.6)'};}
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

// 结算三选一：候选牌用本皮肤放大牌的完整卡面，一行静态排布（soft-c 共用，key 区分样式作用域）。
const REWARD_SIZE = { port: { w: 136, h: 198 }, land: { w: 160, h: 214 }, avail: { port: 262, land: 380 } };
export const softRewardRowHtml = (views, { orient, chosen, dim, pending }, key) => rewardRowMarkup(key, orient, views.map((view, index) => rewardCardMarkup(
    cardHtml(view, { w: 0, h: 0, left: 0, top: 0, z: 1, rot: '0' }, { selected: view.inst }, [], 99), { index, chosen: chosen === index, dim, pending })), { ...REWARD_SIZE[orient], avail: REWARD_SIZE.avail?.[orient] }, '', views.map((v) => v.fxText));
export const rewardRowHtml = (views, o) => softRewardRowHtml(views, o, 'soft-a');
