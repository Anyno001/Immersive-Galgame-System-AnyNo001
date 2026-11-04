// 恐怖·断帧监控（dark-a）· 战斗中画面：照搬概念稿 gal/战斗界面设计稿/概念/第二轮/dark/ 的 common.js / data.js 标记，假数据换成真实视图 v.battle。
// 恐怖两套（A 断帧监控、B 无影灯）标记完全相同，只差装饰层与结束回合键，因此共用标记写在本文件并导出，combat-skin-dark-b.js 引用。
// 样式：概念稿 common.css + grid.css + A.css（或 B.css）+ minimal.css 由 落盘/gen-skin-css.mjs 生成到 combat-skin-dark-<a|b>-concept-style.js，再加本文件的接线样式。
import { esc } from './reader-value-utils.js';
import { intentIconSvg, portraitSilhouetteSvg } from './combat-card-art.js';
import { enemyArtTopOf } from './combat-enemy-art.js';
import { battlePick, needsHold, canvasW, SKILL_ICON_SVG, ITEM_ICON_SVG } from './combat-skin-canvas.js';
import { COMBAT_SKIN_DARK_A_CONCEPT_CSS } from './combat-skin-dark-a-concept-style.js';
import { KEYWORD_CHAR, cardMainKeyword, cardValueDelta } from './combat-panel-model.js';

// 概念稿 buildBattle 的 opts（方案A.html / 方案B.html 里的 ring、fan 完全一致）。
const RING_BASE = { port: { rx: 150, w: 330, lift: 60, back: 0.55, dim: 0.5 }, land: { rx: 410, w: 390, lift: 70, back: 0.58, dim: 0.5 } };
// 画布逻辑宽随容器伸缩（canvasW）：圆环横向半径随多出的宽度加大，后排敌人摊得更开。
const DESIGN_W = { port: 390, land: 1280 };
const ringOf = (orient) => { const r = RING_BASE[orient]; return { ...r, rx: Math.round(r.rx + Math.max(0, canvasW(orient) - DESIGN_W[orient]) * 0.25) }; };
const FAN = { port: { gap: 44, arc: 0.25, rot: 0.9, sink: 0 }, land: { gap: 121, arc: 0.3, rot: 0.8, sink: 0 } };
// 手牌区尺寸（grid.css：.hand 与 .hand.land 的 width、--cw、--ch、--selw、--selh、--selmin、--selmax）。
const HAND_BASE = { port: { w: 374, cw: 82, ch: 114, selw: 140, selh: 250, selmin: 70, selmax: 292 }, land: { w: 624, cw: 113, ch: 170, selw: 168, selh: 270, selmin: 0, selmax: 624 } };
// 竖屏手牌区宽 = min(画布宽 - 32, 400)；横屏手牌区固定宽并在画布中部居中。
// 横屏底部横条：版心 W = min(画布宽 - 40, 1360)；信息组宽 clamp(280, W×26%, 380)，资源列 120，组间距 16；手牌占余下全部宽度。
const landHandW = () => { const W = Math.min(canvasW('land') - 40, 1360); const iw = Math.min(380, Math.max(280, W * 0.26)); return Math.round(W - iw - 152); };
const handOf = (orient) => { const h = HAND_BASE[orient]; if (orient === 'land') { const w = landHandW(); return { ...h, w, selmax: w }; } return orient === 'port' ? { ...h, w: Math.min(canvasW('port') - 32, 400), selmax: Math.min(canvasW('port') - 32, 400) - 82 } : h; };

const B_LAMP = '<svg class="lampsvg" viewBox="0 0 32 32"><circle class="trk" cx="16" cy="16" r="14"/><circle class="prg" cx="16" cy="16" r="14"/><circle class="bulb" cx="16.0" cy="5.5" r="2"/><circle class="bulb" cx="25.1" cy="10.8" r="2"/><circle class="bulb" cx="25.1" cy="21.3" r="2"/><circle class="bulb" cx="16.0" cy="26.5" r="2"/><circle class="bulb" cx="6.9" cy="21.3" r="2"/><circle class="bulb" cx="6.9" cy="10.8" r="2"/><circle class="core" cx="16" cy="16" r="4"/><circle class="bw" cx="16.0" cy="5.5" r="2"/><circle class="bw" cx="25.1" cy="10.8" r="2"/><circle class="bw" cx="25.1" cy="21.3" r="2"/><circle class="bw" cx="16.0" cy="26.5" r="2"/><circle class="bw" cx="6.9" cy="21.3" r="2"/><circle class="bw" cx="6.9" cy="10.8" r="2"/><circle class="cw" cx="16" cy="16" r="4"/></svg><span class="et">结束<br>回合</span>';
const VARIANT = {
    'dark-a': { deco: '<div class="tint"></div><div class="grain"></div><div class="scan"></div><i class="vf a"></i><i class="vf b"></i><div class="rec"><i></i>REC 00:14:27</div>', endHtml: '<b>结束回合</b>' },
    'dark-b': { deco: '<div class="tint"></div><div class="ring3"></div><div class="cone"></div><div class="lamp"></div><div class="floor"></div>', endHtml: B_LAMP },
};

const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
    claw: P('<path d="M6 18L18 6M14 6h4v4"/>'),
    shield: P('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>'),
    potion: P('<path d="M9 3h6M10 3v5l-4.5 9a3 3 0 0 0 2.7 4.3h7.6a3 3 0 0 0 2.7-4.3L14 8V3"/>'),
    exit: P('<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    bolt: P('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
    blade: P('<path d="M19 5L11 15l-2-2z"/><path d="M7.5 13.5l3 3M9 15l-4 4"/>'),
    blades: P('<path d="M18 4L8 16M21 9L13 19M13 3L5 12"/>'),
    heart: P('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
};
const UNIT = { 伤害: ICON.blade, 群伤: ICON.blades, 格挡: ICON.shield, 回复: ICON.heart };

// 恐怖专用牌面图案（data.js SHARP）：细线、尖角、斜接。概念稿按示例牌名取图，真实牌名不同，这里按效果类别取，同类里按牌名挑一枚。
const SH = (d) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="miter" stroke-linecap="square">${d}</svg>`;
const SHARP = {
    回春: SH('<path d="M24 5L33 24L24 43L15 24Z"/><path d="M24 15V33M19 24H29"/>'),
    防御: SH('<path d="M24 5L39 11L35 33L24 43L13 33L9 11Z"/><path d="M24 12V36"/>'),
    烈焰斩: SH('<path d="M12 40L36 8M20 42L42 14M6 34L28 6"/><path d="M36 8L33 15M42 14L38 20M28 6L25 13"/>'),
    流光剑: SH('<path d="M9 39L37 11L40 8L37 14L12 42Z"/><path d="M8 33L15 40M33 7L41 15"/>'),
    横扫千军: SH('<path d="M6 30L42 14M8 38L40 24M12 22L38 8"/>'),
    天罚雷劫: SH('<path d="M28 4L14 26H24L18 44L36 18H26Z"/>'),
    混天绫: SH('<path d="M6 14L42 34M6 34L42 14"/><path d="M24 18L30 24L24 30L18 24Z"/>'),
    穿云箭: SH('<path d="M8 40L40 8"/><path d="M40 8L30 11L37 18Z"/><path d="M8 40L6 32M8 40L16 42M12 36L10 28M12 36L20 38"/>'),
};
const nameHash = (s) => [...String(s || '')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
function sharpArt(c) {
    const pick = (list) => SHARP[list[nameHash(c.name) % list.length]];
    if (c.unit === '回复') return SHARP.回春;
    if (c.unit === '格挡') return SHARP.防御;
    if (c.unit === '群伤') return SHARP.横扫千军;
    if (c.type === 'power') return SHARP.混天绫;
    if (c.type === 'attack') return c.cost >= 3 ? SHARP.天罚雷劫 : pick(['烈焰斩', '流光剑', '穿云箭']);
    return pick(['回春', '混天绫']);
}

// 没有数值的牌（能力等）在数值位放该牌型的母题图形（同 SHARP 的细线尖角语言）。
const MOTIF = { atk: SHARP.流光剑, skl: SHARP.回春, pow: SHARP.混天绫 };
const TYPE = { attack: 'atk', skill: 'skl', power: 'pow' };
const RARITY = { uncommon: ['unc', '罕'], rare: ['rare', '稀'], epic: ['epic', '史'], mythic: ['myth', '神'], personal: ['pers', '专'], signature: ['sign', '招'] };
const KWD = { 不能打出: '本牌无法被打出', 固有: '每场战斗起手必定抽到', 保留: '回合结束时不会被弃掉', 虚无: '回合结束时仍在手中则被消耗', 消耗: '打出后本场战斗内不再出现', 临时: '本场战斗中生成，战斗结束后消失' };
const CHOICE_VERB = { discard: '弃掉', copy: '复制', 'cost-mod': '减费' };
const BAD_STATUS = new Set(['vulnerable', 'weak', 'poison', 'no-draw', 'frail']);
const pol = (s) => (BAD_STATUS.has(s.key) ? 'bad' : 'good');

const face = (url, name) => (url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : esc(String(name || '').slice(0, 1)));
const atlasCell = (cell) => `<i class="igs-combat-art" data-atlas="${esc(cell.atlas)}" style="--ea-x:${esc(cell.x)};--ea-y:${esc(cell.y)}"></i>`;
const foeArt = (url, cell, name) => (url ? `<img class="cx-art-img" src="${esc(url)}" alt="" loading="lazy" decoding="async">`
    : cell ? atlasCell(cell) : `<span class="cx-silhouette">${portraitSilhouetteSvg(name)}</span>`);
const unitAct = (u, pickable) => (pickable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`目标 ${u.name}`)}"`
    : ` data-combat-act="unit-info" data-combat-id="${esc(u.id)}" data-unit-info="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`查看${u.name}的技能与被动`)}"`);
const unitCls = (u, pickable) => `cx-unit${u.alive ? '' : ' is-down'}${pickable ? ' is-targetable' : ''}`;
const unitData = (u) => ` data-unit="${esc(u.id)}" data-side="${esc(u.side)}"`;
const pctOf = (u) => (u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0);
const sc = (s) => `<span class="sc ${pol(s)}">${esc(s.label)}<b>${esc(s.stacks)}</b></span>`;
const blkChip = (n) => `<span class="sc blk">${ICON.shield}<b>${esc(n)}</b></span>`;

// 概念稿 place()：敌人圆环（--w 已含远小近大的缩放）。
function ringStyle(i, f, n, L) {
    const t = ((i - f) * 2 * Math.PI) / Math.max(n, 3), d = (1 + Math.cos(t)) / 2;
    return `--w:${(L.w * (L.back + (1 - L.back) * d)).toFixed(1)}px;--fx:${(L.rx * Math.sin(t)).toFixed(1)}px;--fb:${(L.lift * (1 - d)).toFixed(1)}px;--fz:${Math.round(d * 100)};`
        + `--fl:${(L.dim + (1 - L.dim) * d * d).toFixed(3)};--fsat:${(0.5 + 0.5 * d).toFixed(3)};--fi:${Math.max(0, (d - 0.75) / 0.25).toFixed(3)}`;
}

function cardHtml(c, p, v, picks, energy, picking) {
    const t = TYPE[c.type] || 'skl';
    const r = RARITY[c.rarity];
    const live = c.playable || c.choosable;
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const cut = c.baseCost !== undefined && c.cost < c.baseCost, rise = c.baseCost !== undefined && c.cost > c.baseCost;
    const kws = c.keywordNames || [];
    const hasVal = Number.isFinite(c.value);
    // 窄签最多一个状态记号：临时=虚线边，同名=叠层边，强化=数值旁小三角，费用变化=费用旁小三角
    const bd = [c.temp ? 'b-tmp' : '', c.stack > 1 ? 'b-stk' : '', c.upgraded ? 'b-lv' : '', c.baseCost !== undefined ? 'b-cx' : ''].filter(Boolean).join(' ');
    // 叠加 ×N 在费用格下方，强化「强」块在右上角（待选勾由 .pk 负责，优先级最高）。
    const badge = `${c.stack > 1 ? `<i class="bd">×${esc(c.stack)}</i>` : ''}${c.upgraded ? '<i class="bd up">强</i>' : ''}`;
    const poor = !live || c.cost > energy, lock = kws.includes('不能打出');
    const sel = v.selected === c.inst;
    const kg = kws.map((k) => `<i class="kg${k === '临时' ? ' tp' : ''}" data-scale-tip="${esc(`${k}：${KWD[k] || ''}`)}">${esc(k)}</i>`).join('');
    const chars = [...c.name];
    const cols = !sel && chars.length > 5;
    const half = Math.ceil(chars.length / 2);
    // 窄签竖排牌名超过 5 字时折成两列（右列在前），字号不变。
    const name = cols ? `<span>${esc(chars.slice(0, half).join(''))}</span><span>${esc(chars.slice(half).join(''))}</span>` : esc(c.name);
    // 窄签只露一枚关键字索引签（单字，从牌顶边伸出，不带解释）；放大牌的 .kws 是全称索引签，可点开。
    const mainKw = cardMainKeyword(kws);
    const kwm = !sel && mainKw ? `<i class="kwm">${esc(KEYWORD_CHAR[mainKw])}</i>` : '';
    const extra = !sel && c.extra ? `<span class="xtra">${esc(c.extra)}</span>` : '';
    const delta = cardValueDelta(c);
    const hits = c.hits > 1 ? `<i class="hits" aria-hidden="true">${'<i></i>'.repeat(Math.min(c.hits, 6))}</i>` : '';
    const valTip = sel && c.bonusNote ? ` data-scale-tip="${esc(c.bonusNote)}"` : '';
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    const cls = `card t-${t}${r ? ` r-${r[0]}` : ''}${bd ? ` ${bd}` : ''}${extra ? ' has-st' : ''}${poor ? ' poor' : ''}${lock ? ' lock' : ''}${sel ? ' sel' : ''}${v.hovered === c.inst ? ' is-hover' : ''}`
        + `${picking ? `${c.choosable ? ' cand' : ' offpick'}${chosen ? ' chosen' : ''}` : ''}`;
    return `<button type="button" class="${cls}" style="left:${p.left}px;z-index:${p.z};--rest:${p.rest}" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}`
        + `${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}">`
        + `${r ? `<i class="rtab">${r[1]}</i>` : ''}<i class="cost${cut ? ' cut' : rise ? ' rise' : ''}"><span>${esc(c.cost)}</span>${c.baseCost !== undefined ? `<s>${esc(c.baseCost)}</s>` : ''}</i><i class="cdir"></i>`
        + `<div class="name${cols ? ' cols' : ''}">${name}</div><div class="art">${sharpArt(c)}</div>`
        + (!hasVal ? `<div class="val no-num" aria-hidden="true">${MOTIF[t]}</div>` : '')
        + (hasVal ? `<div class="val"><b${valTip}>${esc(c.value)}</b>${hits}<i class="vdir"></i><em class="u" title="${esc(c.unit)}">${UNIT[c.unit] || ''}</em></div><i class="ut">${esc(c.unit)}${delta ? `<span class="delta">${esc(delta)}</span>` : ''}</i>` : '')
        + badge + kwm + extra
        + `<div class="full"><div class="kws">${kg}${c.stack > 1 ? `<i class="kg sk">×${esc(c.stack)}</i>` : ''}</div><p class="ds">${esc(c.fxText ?? c.text ?? '')}</p>`
        + `${poor && live ? '<p class="sr bad">能量不足</p>' : ''}</div><i class="pk">✓</i></button>`;
}

// 手牌摊开：概念稿 layout() + placeSel()。
function handLayout(n, sel, orient) {
    const F = FAN[orient], H = handOf(orient);
    const step = n > 1 ? Math.min(F.gap, (H.w - H.cw - 8) / (n - 1)) : F.gap;
    const x0 = orient === 'land' ? 0 : (H.w - (step * (n - 1) + H.cw)) / 2; // 横屏：填不满时左对齐、紧贴资源列
    return Array.from({ length: n }, (_, i) => {
        const o = i - (n - 1) / 2, x = Math.round(x0 + i * step);
        const left = i === sel ? Math.round(Math.max(H.selmin, Math.min(H.selmax - H.selw, x - (H.selw - H.cw) / 2))) : x;
        return { left, z: i + 1, rest: `translateY(${(F.sink + o * o * F.arc).toFixed(1)}px) rotate(${(o * F.rot).toFixed(2)}deg)` };
    });
}

function foeHtml(u, i, f, n, L, v, pick) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const it = u.intent;
    const atk = it && it.kind === 'attack';
    const intent = it ? `<div class="intent ${atk ? 'atk' : 'cast'}" title="${esc(`${it.label}·${it.name}${it.damage ? `，${it.damage} 点伤害` : ''}`)}">${atk ? ICON.claw : intentIconSvg(it.kind)}${it.damage ? `<b>${esc(it.damage)}</b>` : ''}<em>${esc(it.damage ? it.name : `${it.label}·${it.name}`)}</em></div>` : '';
    const sts = (u.block ? blkChip(u.block) : '') + u.statuses.map(sc).join('');
    const ok = pick.pickable(u);
    const aim = ok ? (pick.card || pick.skill ? ' target' : ' pickable') : '';
    return `<div class="foe${i === f ? ' front' : ''}${aim} ${unitCls(u, ok)}"${unitData(u)} style="${ringStyle(i, f, n, L)};--atop:${enemyArtTopOf(arts[u.name])}"${unitAct(u, ok)}>${intent}`
        + `<div class="plate"><span class="nm">${esc(u.name)}</span><span class="hpn cx-hp-value">${esc(u.hp)}/${esc(u.maxHp)}</span>`
        + `<div class="hpbar cx-hp" style="--igs-combat-hp:${pctOf(u)}%"><i></i></div>${sts ? `<span class="sts">${sts}</span>` : ''}</div>`
        + `<div class="art">${foeArt(pics[u.name], arts[u.name], u.name)}</div></div>`;
}

const EC = 'M0 14 H34 l5 -3 l5 3 H62 l4 5 l7 -18 l7 24 l5 -11 H112 l7 -5 l7 5 H240';
// 主动特性（最多 2 个）：一行「图标 名称 费用」，和道具入口排在同一组按钮里（第二轮规则：技能、道具在手牌上方一行 / 横屏在手牌右侧）。
const skillsHtml = (traits, v) => traits.map((t) => {
    const id = t.skillId ? `hero-skill:${t.skillId}` : 'hero-skill';
    return `<button type="button" class="skill cx-trait${v.selected === id ? ' on' : ''}${t.usable ? '' : ' off'}" data-combat-act="hero-skill"${t.skillId ? ` data-combat-id="${esc(t.skillId)}"` : ''} data-trait="${esc(t.id)}"`
        + `${t.usable ? '' : ' aria-disabled="true"'} title="${esc(t.name)}" aria-label="${esc(`主动特性 ${t.name} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`)}">${SKILL_ICON_SVG}${Number(t.cost) > 1 ? `<b class="cnt">${esc(t.cost)}</b>` : ''}</button>`;
}).join('');

function leadHtml(hero, v, pick) {
    const pics = v.portraits || {};
    const b = v.battle;
    const ok = pick.pickable(hero);
    const aw = b.awaken && !b.awaken.used && b.awaken.usable && !b.outcome ? b.awaken : null;
    const awBtn = aw ? `<span class="aw cx-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" role="button" tabindex="0" title="${esc(`觉醒·${aw.label}：${aw.text}`)}" aria-label="${esc(`觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}，不消耗能量，每场一次`)}">觉醒·${esc(aw.label)}</span>` : '';
    const chips = (hero.block ? blkChip(hero.block) : '') + hero.statuses.map(sc).join('');
    const pct = pctOf(hero);
    return `<div class="lead ${unitCls(hero, ok)}"${unitData(hero)}>`
        + `<div class="face cx-face"${unitAct(hero, ok)}>${face(pics[hero.name], hero.name)}${awBtn}</div>`
        + `<div class="info"><div class="n">${esc(hero.name)}${hero.controlled ? '<u class="ctl">操控</u>' : ''}<span class="hp"><b class="cx-hp-cur">${esc(hero.hp)}</b>/${esc(hero.maxHp)}</span></div>`
        + `<div class="hpbar cx-hp" style="--igs-combat-hp:${pct}%"><i></i></div><div class="chips">${chips}</div>`
        + `<div class="ecg"><svg viewBox="0 0 240 26" preserveAspectRatio="none"><defs><clipPath id="hpc"><rect x="0" y="-5" width="${(pct * 2.4).toFixed(1)}" height="40"/></clipPath></defs><path d="${EC}" stroke="#3d454b"/><path d="${EC}" stroke="#cf2f3a" clip-path="url(#hpc)"/></svg></div></div></div>`;
}

function mateHtml(u, v, pick) {
    const ok = pick.pickable(u);
    // 头像右下角只放一枚记号：有格挡写「护」，否则取第一个状态的首字。
    const first = u.block ? { text: `护${u.block}`, p: 'good' } : u.statuses[0] ? { text: `${u.statuses[0].label.slice(0, 1)}${u.statuses[0].stacks}`, p: pol(u.statuses[0]) } : null;
    return `<div class="mate ${unitCls(u, ok)}"${unitData(u)}${unitAct(u, ok)}><div class="mface">${face((v.portraits || {})[u.name], u.name)}${first ? `<u class="mb ${first.p}">${esc(first.text)}</u>` : ''}</div>`
        + `<div class="mn">${esc(u.name)}</div><div class="mbar cx-hp" style="--igs-combat-hp:${pctOf(u)}%"><i></i></div></div>`;
}

function trackHtml(b, v) {
    const pics = v.portraits || {}, arts = v.enemyArt || {};
    const list = (b.order || []).slice(0, 6);
    return `<div class="track" role="img" aria-label="${esc(`行动顺序：${list.map((o) => o.name).join('、')}`)}">${list.map((o, i) => {
        const pic = pics[o.name] ? `<img src="${esc(pics[o.name])}" alt="" loading="lazy" decoding="async">` : arts[o.name] && arts[o.name].atlas !== 'none' ? atlasCell(arts[o.name]) : `<b>${esc(String(o.name).slice(0, 1))}</b>`;
        return `<span class="who cx-dot ${o.controlled && i === 0 ? 'ctrl' : o.side === 'ally' ? 'ally' : 'foe'}" style="--atop:${enemyArtTopOf(arts[o.name])}" data-unit="${esc(o.id)}" title="${esc(o.name)}">${pic}</span>`;
    }).join('')}</div>`;
}

export function darkBattleHtml(v, orient, key) {
    const b = v.battle;
    const land = orient === 'land';
    const V = VARIANT[key] || VARIANT['dark-a'];
    const L = ringOf(orient);
    const pick = battlePick(v);
    const ended = Boolean(b.outcome);
    const live = !ended && v.status === 'battle';
    const hero = b.allies.find((u) => u.id === b.heroId) || b.allies.find((u) => u.controlled) || null;
    const mates = b.allies.filter((u) => u !== hero);
    const choice = b.choice || null;
    const picks = choice && Array.isArray(v.chosen) ? v.chosen : [];
    const selIdx = b.hand.findIndex((c) => c.inst === v.selected);
    const pos = handLayout(b.hand.length, selIdx, orient);
    const f = (() => { const i = b.enemies.findIndex((u) => u.id === v.front); if (i >= 0) return i; const a = b.enemies.findIndex((u) => u.alive); return a >= 0 ? a : 0; })();
    const foes = b.enemies.map((u, i) => foeHtml(u, i, f, b.enemies.length, L, v, pick)).join('');
    // 顶栏：关卡名与回合在左，倍速、撤退（常驻）、关闭在右。
    const speed = (v.status === 'battle' || v.settling) ? `<button type="button" class="x2 spd" data-combat-act="speed" aria-pressed="${(v.fxSpeed || 1) > 1 ? 'true' : 'false'}" aria-label="演出二倍速">倍速×2</button>` : '';
    const flee = live ? `<button type="button" class="ic flee" data-combat-act="escape"${b.canEscape ? '' : ' aria-disabled="true"'} title="撤退" aria-label="撤退">${ICON.exit}</button>` : '';
    const top = `<div class="top"><span class="enc" title="${esc(v.encounter || '战斗')}">${esc(v.encounter || '战斗')}</span>${live ? `<span class="rnd">第 ${esc(b.turn)} 回合</span>` : ''}<span class="sp"></span>${speed}${flee}`
        + `<button type="button" class="ic" data-combat-act="close" aria-label="关闭">${ICON.close}</button></div>`;
    // 能量、结束回合、牌堆与道具入口。
    const per = Math.max(Number(b.energyPerTurn) || 0, Number(b.energy) || 0);
    const energy = `<div class="energy" role="img" aria-label="${esc(`能量 ${b.energy}/${b.energyPerTurn}`)}"><div class="v">${ICON.bolt}${esc(b.energy)}<small>/${esc(b.energyPerTurn)}</small></div>`
        + `<div class="pips">${Array.from({ length: per }, (_, i) => `<i class="${i < b.energy ? '' : 'off'}"></i>`).join('')}</div></div>`;
    const items = (b.items || []).filter((i) => i.count > 0);
    const total = items.reduce((s, i) => s + i.count, 0);
    const selItem = pick.item ? pick.picked : null;
    const itemBtn = `<button type="button" class="mini itembtn item${items.length ? '' : ' off'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${v.itemsOpen && items.length ? 'true' : 'false'}"${items.length ? '' : ' aria-disabled="true"'} aria-label="${esc(`道具${total ? ` 共 ${total} 个` : ''}`)}" title="道具">${ITEM_ICON_SVG}${total > 1 ? `<em class="cnt">${esc(total)}</em>` : ''}</button>`;
    // .piles 现在装「技能 + 道具」这一组按钮；抽弃牌数单独成 .pcnt。
    const traitsList = (Array.isArray(b.traits) ? b.traits : b.heroSkill ? [{ ...b.heroSkill, kind: 'active', innate: true }] : []).filter((t) => t.kind === 'active');
    const piles = `<div class="piles">${skillsHtml(traitsList, v)}${itemBtn}</div><div class="pcnt"><span class="pl" title="抽牌堆"><em>抽牌</em><b>${esc(b.piles.draw)}</b></span><span class="pl" title="弃牌堆"><em>弃牌</em><b>${esc(b.piles.discard)}</b></span></div>`;
    const td = selItem ? `<b>${esc(selItem.name)}</b>${esc(selItem.text)}<u>${selItem.targets?.length ? '点选目标' : '点击承受方使用'}</u>` : '';
    const tray = `<div class="tray" role="menu" aria-label="道具">${items.map((i) => `<button type="button" role="menuitem" class="ti${i.usable ? '' : ' off'}${v.selected === `item:${i.itemId}` ? ' sel' : ''}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : ICON.potion}<span class="tn">${esc(i.name)}</span><b>×${esc(i.count)}</b></button>`).join('')}<p class="td">${td}</p></div>`;
    const end = `<button type="button" class="end" data-combat-act="end-turn"${b.canEndTurn ? '' : ' aria-disabled="true"'}${needsHold(b) ? ' data-hold' : ''}>${V.endHtml}</button>`;
    // 待选条：弃掉 k/N、候选张数、确认。
    const pickbar = choice ? `<div class="pickbar"><span class="pt">${esc(CHOICE_VERB[choice.kind] || '选择')} <b class="pc">${picks.length}</b>/${esc(choice.count)}</span><span class="ps">候选 ${esc((choice.options || []).length)} 张</span>`
        + `<button type="button" class="pok" data-combat-act="choose-confirm"${picks.length === choice.count ? '' : ' aria-disabled="true"'}>确认</button></div>` : '<div class="pickbar"></div>';
    const H = handOf(orient);
    const hand = `<div class="hand cx-hand${selIdx >= 0 ? ' has-sel' : ''}" style="--cw:${H.cw}px;--ch:${H.ch}px;--selw:${H.selw}px;--selh:${H.selh}px">${b.hand.map((c, i) => cardHtml(c, pos[i], v, picks, b.energy, Boolean(choice))).join('')}</div>`;
    const ops = ended ? '' : `${piles}${tray}${energy}${end}${pickbar}${hand}`;
    const itemNeed = pick.item && selItem && selItem.targets?.length;
    const cls = `igs-cx-canvas${land ? ' land' : ''}${pick.card || pick.skill ? ' aiming' : ''}${pick.item && selItem ? ' item-aim' : ''}${itemNeed ? ' item-need' : ''}${choice ? ' picking' : ''}${selIdx >= 0 ? ' has-sel' : ''}${v.itemsOpen && items.length ? ' tray-on' : ''}${ended ? ' is-ended' : ''}`;
    return `<div class="igs-cx-wrap"><div id="igs-cx-canvas" class="${cls}" data-cx="${key}" style="--mw:104px">`
        + `<div class="bg"></div><div class="shade"></div><div class="deco" aria-hidden="true">${V.deco}</div>`
        + `<section class="foes cx-field" data-turn="${esc(b.turn)}">${foes}</section>${top}${live ? trackHtml(b, v) : ''}`
        + `${hero ? leadHtml(hero, v, pick) : ''}<div class="mates">${mates.map((u) => mateHtml(u, v, pick)).join('')}</div>`
        + `${ops}<div class="over"></div></div></div>`;
}

const NOISE_URL = 'data:image/png;base64,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';

// 接线样式：画布缩放居中、真实立绘与头像、目标 / 出手 / 拖动等交互状态；设计稿没有的状态沿用设计稿已有的语言（红 = 敌意、青绿 = 我方 / 可用）。
const wiringCss = (key) => {
    const S = `#igs-overlay :where(.igs-cx-canvas[data-cx="${key}"],.igs-cx-ghost[data-cx="${key}"])`;
    const C = `#igs-overlay #igs-cx-canvas:where([data-cx="${key}"])`;
    const G = `#igs-overlay .igs-cx-ghost[data-cx="${key}"]`;
    const bgFilter = key === 'dark-b' ? 'grayscale(1) brightness(.3) contrast(1.15)' : 'grayscale(.9) brightness(.4) contrast(1.25)';
    return `
#igs-overlay #igs-combat-panel .igs-cx-wrap{position:absolute;inset:0;overflow:hidden;}
${C}{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(var(--cx-scale,1));transform-origin:50% 50%;background:transparent;}
${C} .bg{background:none;filter:none;-webkit-backdrop-filter:${bgFilter};backdrop-filter:${bgFilter};}
${S} .grain{background-image:url(${NOISE_URL});background-size:128px 128px;}
${S} .who img,${S} .lead .face img,${S} .mface img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 12%;}
/* 行动顺序只露头像：立绘放大取头部，矮身形按看得见的头顶下移取景 */
${S} .track .who img{inset:auto;left:-50%;top:-6%;width:200%;height:200%;object-position:50% 0;border-radius:0;}
${S} .track .who .igs-combat-art{inset:auto;left:-32.5%;top:calc(6% - var(--atop,0) * 220%);width:165%;height:220%;}
${S} .who>b{position:absolute;inset:0;display:grid;place-items:center;font:700 12px var(--serif);color:var(--bone);}
${S} .lead .face{display:grid;place-items:center;overflow:hidden;background-color:#151517;font:400 22px var(--serif);color:var(--bone);cursor:pointer;}
${S} .mface{position:relative;overflow:visible;}
${S} .foe .art .cx-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%;}
${S} .foe .art .cx-silhouette{position:absolute;inset:18% 20% 0;display:block;color:#2a2c30;}
${S} .foe .art .cx-silhouette svg{width:100%;height:100%;fill:currentColor;stroke:none;}
${S} .hpbar.cx-hp>i,${S} .mbar.cx-hp>i{width:var(--igs-combat-hp,0%);transition:width .3s;}
${S} .foe .intent svg{fill:none;}
/* 第二轮：技能、道具、牌堆整理。竖屏：技能 + 道具在手牌上方一行（能量左、结束回合右端），抽弃牌数在手牌下缘；横屏：右列 结束回合、技能、道具、抽弃牌数 同一左缘、固定位置 */
${C} .piles{left:80px;top:582px;width:218px;height:28px;gap:6px;}
${S} .piles :is(.skill,.mini){display:flex;align-items:center;gap:4px;height:28px;padding:0 8px;background:var(--ink2);color:var(--bone);font:600 11px var(--serif);letter-spacing:.04em;white-space:nowrap;min-width:0;}
${S} .piles .skill{flex:0 1 auto;} ${S} .piles .skill svg{width:12px;height:12px;color:var(--en);flex:none;}
${S} .piles .skill b{font:700 11px var(--num);color:var(--en);flex:none;}
${S} .piles .skill .sn{overflow:hidden;text-overflow:ellipsis;max-width:60px;}
${S} .piles .skill.off{opacity:.45;} ${S} .piles .skill.on{box-shadow:inset 0 0 0 1px var(--en);}
${C} .pcnt{left:80px;top:747px;display:flex;gap:10px;font-size:11px;color:var(--dim);white-space:nowrap;z-index:40;}
${S} .pcnt b{font:600 12px var(--num);color:#c8c8c4;}
${C}.land .piles{left:1092px;top:540px;width:160px;height:auto;flex-direction:column;align-items:stretch;gap:6px;}
${C}.land .piles :is(.skill,.mini){height:30px;margin-left:0;font-size:12px;}
${C}.land .piles .skill .sn{max-width:none;flex:1;text-align:left;}
/* 敌人尺寸（第三轮）：竖屏正前方缩小露出后排，脚落在操作区上沿；横屏放大放低。--base 是立绘脚到画布下缘的距离 */
${C}:not(.land) .foes{--base:124px;}
${C}.land .foes{--base:90px;}
/* 矮身形（兽、龙蛇等，图集格上方留白多）：按看得见的头顶抬高并稍放大；头顶信息位置不变 */
${S} .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.95)) scale(calc(1 + var(--atop,0) * .15));transform-origin:50% 100%;}
${C}.land .foe .art{transform:translateY(calc(var(--atop,0) * var(--w) * -0.4)) scale(calc(1 + var(--atop,0) * .8));}
/* 牌面信息规范：稀有度阶梯（索引签是主线索，再逐档累加）——罕见顶边灰带；稀有亮带 + 费用标填亮；史诗再加牌内顶光；神话再加缓慢扫光；专属 / 签名按史诗，另有反色索引签 */
${C} .hand .card::before{display:block;content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--rb,transparent);z-index:2;}
${C} .hand .card.r-unc{--rb:#6d7076;}
${C} .hand .card:is(.r-rare,.r-epic,.r-myth,.r-pers,.r-sign){--rb:var(--bone);}
${C} .hand .card:is(.r-rare,.r-epic,.r-myth,.r-pers,.r-sign) .cost{background:var(--bone);box-shadow:none;}
${C} .hand .card:is(.r-rare,.r-epic,.r-myth,.r-pers,.r-sign) .cost span{color:#121214 !important;}
${C} .hand .card:is(.r-rare,.r-epic,.r-myth,.r-pers,.r-sign) .cost.cut span{color:#0f6b4a !important;}
${C} .hand .card:is(.r-rare,.r-epic,.r-myth,.r-pers,.r-sign) .cost.rise span{color:#a3202a !important;}
${C} .hand .card:is(.r-epic,.r-myth,.r-pers,.r-sign):not(.sel){background:linear-gradient(to bottom,#2c2f33 0,var(--cbg) 48%);}
${C} .hand .card.r-myth:not(.sel)::after{display:block;content:"";position:absolute;inset:0;pointer-events:none;z-index:1;background:linear-gradient(105deg,transparent 35%,rgba(236,232,222,.2) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:cx-dark-sheen 4s linear infinite;}
@keyframes cx-dark-sheen{0%,55%{background-position:-150% 0;}100%{background-position:150% 0;}}
@media (prefers-reduced-motion:reduce){${C} .hand .card.r-myth::after{animation:none;}}
/* 强化：金色「+」角标（金色只给强化），牌名后「+」同色；同名叠加：牌背后露出两层错位牌边，角标写 ×N；待选勾优先于角标 */
${S} .hand .card .bd{position:absolute;left:6px;top:32px;z-index:4;min-width:16px;height:16px;padding:0 3px;display:grid;place-items:center;background:var(--bone);color:#121214;font:700 11px/1 var(--num);}
${S} .hand .card .bd.up{background:#e0b24a;font-size:14px;}
${C}.picking .hand .card .bd{display:none;}
${C} .hand .card.sel .bd{left:9px;top:42px;} ${C}.land .hand .card:not(.sel) .bd{left:8px;top:38px;}
/* 二稿卡面：强化实底「强」块、关键字索引签、原费小方格、数值区附加效果与差值、说明居中 */
${C} .hand .card .bd.up{left:auto;right:7px;top:9px;min-width:16px;height:16px;padding:0;display:block;text-align:center;font:700 11px/16px var(--serif);}
${C} .hand .card.sel .bd.up,${C}.land .hand .card.sel .bd.up{left:auto;right:10px;top:12px;min-width:22px;height:22px;font-size:14px;line-height:22px;}
${C}.land .hand .card:not(.sel) .bd.up{left:auto;right:7px;top:9px;}
${C} .hand .card .name.cols span{display:block;} ${C} .hand .card .name.cols span:first-child{margin-left:2px;}
${C}:not(.land) .hand .card:not(.sel) .name.cols{left:30px;}
${C} .hand .card .val .hits{display:flex;flex-direction:column;gap:3px;margin:1px 0 0;font-size:0;line-height:0;pointer-events:none;align-self:center;}
${C} .hand .card .val .hits i{display:block;width:7px;height:1.5px;background:var(--bone);transform:skewY(-20deg);}
${C} .hand .card.has-st:not(.sel) .val{transform:translateY(-11px);}
${C} .hand .card.has-st:not(.sel) .ut{transform:translateY(-14px);}
${C} .hand .card .xtra{position:absolute;left:8px;right:4px;bottom:6px;z-index:2;font:500 10px/10px var(--serif);color:var(--bone);white-space:nowrap;overflow:hidden;}
${C} .hand .card .ut{white-space:nowrap;}
${C} .hand .card .ut .delta{margin-left:3px;font-style:normal;font-size:.9em;font-weight:400;color:#62656a;}
${C} .hand .card .kwm{position:absolute;right:9px;bottom:100%;z-index:3;box-sizing:border-box;width:16px;height:14px;padding:2px 0 0;font:700 9px/1 var(--serif);font-style:normal;text-align:center;background:#121214;color:#8d8f93;box-shadow:inset 0 0 0 1px #8d8f93;white-space:nowrap;}
${C} .hand .card.sel .full .kws{position:absolute;right:12px;left:auto;top:auto;bottom:100%;z-index:3;display:flex;gap:3px;margin:0;padding:0;}
${C} .hand .card.sel .full .kws .kg{box-sizing:border-box;height:16px;margin:0;padding:3px 4px 0;font:700 10px/1 var(--serif);text-align:center;letter-spacing:.05em;background:#121214;color:#8d8f93;border:0;box-shadow:inset 0 0 0 1px #8d8f93;outline:0;}
${C} .hand .card.sel .ds{text-align:center;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}
${C} .hand .card .cost s{position:absolute;display:block !important;left:auto;top:auto;right:-3px;bottom:-5px;z-index:3;box-sizing:border-box;width:10px;height:10px;margin:0;padding:0;background:#16171a;box-shadow:inset 0 0 0 1px #4a4c50;color:#8d8f93;text-align:center;font:500 8px/10px var(--num);text-decoration:line-through;text-decoration-thickness:1px;opacity:1;}
${C} .hand .card.sel .cost s{left:auto;top:auto;margin:0;right:-8px;bottom:-8px;width:15px;height:15px;font-size:10px;line-height:15px;}
#igs-overlay #igs-combat-panel[data-igs-combat-skin^="dark"]>.igs-combat-scale-tip{border-radius:0;background:#1a1a1c;color:var(--bone,#ece8de);box-shadow:inset 0 0 0 1px #8a8d92;font-family:var(--serif,serif);}
${C} .hand .card.b-stk:not(.sel){box-shadow:inset 0 0 0 1px var(--c-frame),0 -3px 0 -1px var(--cbg),0 -4px 0 -1px #50545a,0 -7px 0 -2px var(--cbg),0 -8px 0 -2px #3a3d42,0 6px 14px rgba(0,0,0,.55);}
/* 没有数值的牌（能力等）：数值位放该牌型的母题图形 */
${S} .hand .card .val.no-num{left:7px;bottom:21px;width:30px;height:30px;color:var(--tc);}
${S} .hand .card .val.no-num svg{width:100%;height:100%;}
${C}.land .hand .card .val.no-num{left:9px;bottom:26px;width:36px;height:36px;}
${S} .hand .card.sel .val.no-num{display:none;}
/* 结束回合按住确认：控制器按住期间给按钮写 --hold（0→1）。A：顶边一条亮线自左向右走满；B：光圈走一圈、六盏灯珠依次点亮、最后灯芯亮，外圈泛光随之变强 */
${key === 'dark-a' ? `${C} .end[data-hold]{background:linear-gradient(var(--bone),var(--bone)) 0 0/calc(var(--hold,0) * 100%) 3px no-repeat,var(--blood);}` : `${C} .end .lampsvg .prg{stroke-dashoffset:calc(88 - 88 * var(--hold,0));transition:none;}
${C} .end .lampsvg :is(.bw,.cw){fill:#fff;stroke:none;opacity:0;}
${[10, 11, 12, 13, 14, 15, 16].map((n, i) => `${C} .end .lampsvg circle:nth-of-type(${n}){opacity:clamp(0,calc(var(--hold,0) * 7 - ${i}),1);}`).join('\n')}
${C} .end[data-hold]{box-shadow:inset 0 0 0 1px #3d454b,0 0 calc(22px * var(--hold,0)) calc(4px * var(--hold,0)) rgba(220,232,238,.38);}`}
${C}.land .piles .mini{justify-content:flex-start;}
${C}.land .pcnt{left:1092px;top:658px;width:160px;font-size:11px;}
/* 横屏左下：主战者在上，队友紧跟其下，左缘对齐、间距固定（四名队友也放得下） */
${C}.land .lead{left:28px;top:514px;}
${C}.land .mates{left:28px;top:590px;width:150px;}
/* 头顶信息（意图、名字血条）层级在立绘之上，立绘不压血条 */
${S} .foe .intent,${S} .foe .plate{position:relative;z-index:2;}
/* 与漫画统一的头顶位置：意图签与名字血条按立绘上沿定位（意图签顶边：竖屏 73 / 横屏 35；血条中线 117 / 79）。名字放血条左侧，去掉血条后的黑底框 */
${C} .foes .foe .art,${C}.land .foes .foe .art{margin-top:0;}
${C} .foes .foe .intent,${C} .foes .foe .plate{position:absolute;left:50%;transform:translateX(-50%);margin:0;}
${C} .foes .foe .intent{top:-42px;} ${C}.land .foes .foe .intent{top:-48px;}
${C} .foes .foe .plate{top:-8px;width:290px;grid-template-columns:auto 1fr auto;row-gap:4px;align-items:center;} ${C}.land .foes .foe .plate{top:-14px;width:310px;}
${C} .foes .foe .plate .nm{font-size:16px;letter-spacing:.1em;line-height:20px;}
${C} .foes .foe .plate .hpbar{grid-column:2;grid-row:1;} ${C} .foes .foe .plate .hpn{grid-column:3;grid-row:1;}
${C} .foes .foe .plate .sts{grid-column:1 / 4;grid-row:2;}
${C} .foes .foe.pickable.front .plate{background:none;box-shadow:none;}
${S} .lead .face .aw{cursor:pointer;z-index:2;}
${S} .top .x2{cursor:pointer;} ${S} .top .x2[aria-pressed="true"]{text-decoration:underline;text-underline-offset:3px;}
${S} .top .ic[aria-disabled="true"]{opacity:.45;}
${S} .tray .ti img{width:18px;height:18px;object-fit:contain;flex:none;}
${S} .piles .itembtn.off{opacity:.45;}
${S} .end[aria-disabled="true"],${S} .pickbar .pok[aria-disabled="true"]{opacity:.5;}
${S} .hand .card{display:flex;flex-direction:column;justify-content:flex-start;align-items:stretch;text-align:left;font:inherit;line-height:normal;}
${S} .hand .card.is-lifted{opacity:.35;}
/* 选目标：可选的单位都提亮，我方头像描青绿边 */
${S} .foe.is-drop-hover .art{filter:brightness(1.3) saturate(1.1);}
${S} :is(.lead,.mate).is-targetable :is(.face,.mface){outline:2px solid var(--good);outline-offset:2px;}
${S} :is(.lead,.mate).is-drop-hover :is(.face,.mface){outline-color:var(--bone);}
${S} :is(.lead,.mate).is-acting :is(.face,.mface){outline:2px solid var(--acc);outline-offset:2px;}
${S} .foe.is-acting .art{filter:brightness(1.2) saturate(1.1);}
${S} .who.is-acting{outline:2px solid var(--acc);outline-offset:2px;}
${S} .foe.is-down{opacity:.35;filter:grayscale(1);pointer-events:none;}
${S} :is(.lead,.mate).is-down :is(.face,.mface){filter:grayscale(1) brightness(.5);}
${C}.is-ended .foes{pointer-events:none;}
/* 出牌影子：外层按视口矩形定位（演出层给 left/top/width/height），内层按画布缩放 */
#igs-overlay .igs-cx-ghost{position:absolute;pointer-events:none;z-index:30;}
#igs-overlay .igs-cx-ghost>.hand{position:absolute;left:0;top:0;width:calc(100% / var(--cx-scale,1));height:calc(100% / var(--cx-scale,1));transform:scale(var(--cx-scale,1));transform-origin:0 0;}
${G}>.hand>.card{left:0 !important;top:0 !important;bottom:auto !important;transform:none !important;}
/* 贴左右边：画布宽随容器（--cx-w），右侧元素改 right 定位，居中元素按画布中线偏移（设计稿横屏中线 640、竖屏 195） */
${C}:not(.land){width:var(--cx-w,390px);}
${C}.land{width:var(--cx-w,1280px);}
/* 顶栏：关卡名单行省略，回合数不被挤压 */
${S} .top .enc{min-width:0;flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${S} .top .rnd{flex:none;white-space:nowrap;}
/* 操作区重排（用户 11-02）：能量在手牌正上方居中，技能 / 道具在左，结束回合在右端。竖屏同一行，横屏技能 / 道具在手牌左侧、结束回合与牌堆在右侧 */
${C} .energy{left:calc(50% - 32px);}
${C} .piles{left:8px;width:calc(50% - 46px);}
${C} .end{left:auto;right:8px;}
${C} .mates{left:auto;right:8px;}
${C} .hand{left:8px;width:calc(var(--cx-w,390px) - 16px);}
${C} .tray{left:8px;width:calc(var(--cx-w,390px) - 16px);}
${C} .pickbar{left:8px;width:calc(var(--cx-w,390px) - 100px);}
${C}.picking .energy{visibility:hidden;}
${C}.has-sel .hand{z-index:60;}
${C} .energy{filter:drop-shadow(0 2px 6px rgba(8,8,10,.9)) drop-shadow(0 0 1px #0a0a0c);}
${C} .piles .skill{min-width:0;}
${C} .piles .mini{flex:none;}
${C} .pcnt{left:8px;}

/* 横屏统一布局（用户 11-02 定稿，九套同位）：版心 W = min(画布宽 - 48, 1120) 居中，左缘 L；信息组左缘 = L，手牌右缘 = L + W；
   手牌上沿一行：能量 → 技能 / 道具 → 结束回合（右对齐手牌右缘），整行高于选中牌上弹后的顶边；抽牌堆在手牌左下外侧，弃牌堆在右下外侧 */
${C}.land .top .rnd{font-size:13px;} ${C}.land .top .x2{font-size:12px;}
${C}.land .mate .mn{font-size:13px;line-height:15px;} ${C}.land .mate .mb{font-size:12px;}
${C}.land .lead .face{width:64px;height:64px;} ${C}.land .lead .info{left:74px;}
${C}.land .lead .face .aw{font-size:12px;letter-spacing:0;height:16px;line-height:16px;}
${C}.land .lead .n .ctl,${C}.land .lead .n .hp,${C}.land .lead .skill,${C}.land .lead .skill b{font-size:12px;}
${C}.land .foe .plate u{font-size:12px;height:18px;}
${C}.land .hand .card :is(.ut,.stk,.ds,.sr,.ex,.bd){font-size:12px;}
${C}.land .hand .card .rtab{font-size:12px;width:20px;}
${S}.land .rec,${C}.land .rec{font-size:12px;}

/* 技能可发动：一道细光沿按钮边框环绕（::before 圆锥渐变旋转，::after 盖住内部只留 1px 光边，只动 transform）；不可发动不显示；减少动态效果时改静态细光边 */
${S} .piles .skill:not(.off):not([aria-disabled="true"]){position:relative;overflow:hidden;}
${S} .piles .skill:not(.off):not([aria-disabled="true"])::before{content:"";position:absolute;left:50%;top:50%;width:260px;height:260px;margin:-130px 0 0 -130px;background:conic-gradient(from 0deg,transparent 0 72%,var(--en) 100%);animation:cx-skill-flow 2.4s linear infinite;pointer-events:none;}
${S} .piles .skill:not(.off):not([aria-disabled="true"])::after{content:"";position:absolute;inset:1px;background:var(--ink2);pointer-events:none;}
${S} .piles .skill:not(.off):not([aria-disabled="true"])>*{position:relative;z-index:1;}
@keyframes cx-skill-flow{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion:reduce){${S} .piles .skill:not(.off):not([aria-disabled="true"])::before{animation:none;background:var(--en);opacity:.6;}}
.is-reduced ${S} .piles .skill:not(.off):not([aria-disabled="true"])::before{animation:none;background:var(--en);opacity:.6;}

/* 竖屏统一布局（用户 11-02，九套同位）：手牌居中（宽 = min(画布宽 - 124, 400)），左右外侧各一个小牌堆；手牌上方操作行（技能 → 道具 → 弹性空白 → 结束回合）与整组（牌堆 + 手牌）等宽对齐；
   行动点数放大放在操作行正上方、对齐整组左缘；底栏主战者 + 队友头像同行成组居中 */
${C}:not(.land){--hw:min(calc(var(--cx-w,390px) - 32px),400px);--gw:var(--hw);--gl:calc((var(--cx-w,390px) - var(--gw)) / 2);--bw:min(calc(var(--cx-w,390px) - 32px),440px);--bl:calc((var(--cx-w,390px) - var(--bw)) / 2);}
${C}:not(.land) .piles :is(.skill,.mini){margin-left:0;}
${C}:not(.land) .hand{left:var(--gl);width:var(--hw);}
${C}:not(.land) .energy{left:auto;right:calc(var(--cx-w,390px) - var(--gl) - var(--gw) + 96px);top:562px;width:auto;height:44px;align-items:center;justify-content:center;background:none;box-shadow:none;text-shadow:0 1px 3px #000,0 0 8px #000;}
${C}:not(.land) .energy .v{font-size:34px;line-height:34px;} ${C}:not(.land) .energy .v small{font-size:17px;} ${C}:not(.land) .energy .v svg{width:20px;height:20px;} ${C}:not(.land) .energy .pips{margin-top:2px;} ${C}:not(.land) .energy .pips i{width:14px;height:3px;}
${C}:not(.land) .piles{left:var(--gl);top:562px;width:calc(var(--gw) - 192px);height:44px;gap:12px;}
${C} .piles :is(.skill,.mini){padding:0 8px;gap:4px;}
${C} .piles .skill .sn,${C} .piles .mini .lb{display:none;}
${C}:not(.land) .end{left:calc(var(--gl) + var(--gw) - 84px);right:auto;top:562px;width:84px;min-width:0;height:44px;padding:0 6px;}
${C}:not(.land) .tray{left:var(--gl);width:var(--gw);top:472px;}
${C}:not(.land) .pickbar{left:var(--gl);top:566px;width:calc(var(--gw) - 96px);}
${C}.picking:not(.land) .energy{visibility:visible;}
${C}:not(.land) .pcnt{left:var(--gl);top:747px;width:var(--gw);height:16px;display:flex;justify-content:space-between;align-items:center;pointer-events:none;}
${C}:not(.land) .pcnt .pl{display:flex;flex-direction:row;align-items:baseline;gap:4px;width:auto;font-size:12px;color:var(--dim);}
${C} .pcnt .pl em{font-style:normal;font-size:12px;letter-spacing:.06em;}
${C}:not(.land) .pcnt .pl b{font-size:14px;color:var(--bone);}
${C}:not(.land) .lead{top:772px;left:var(--bl);width:calc(var(--bw) - var(--mw,104px) - 12px);}
${C}:not(.land) .mates{left:calc(var(--bl) + var(--bw) - var(--mw,104px));right:auto;top:772px;width:var(--mw,104px);flex-direction:column;flex-wrap:nowrap;justify-content:flex-start;align-items:stretch;gap:2px;}
${C}:not(.land) .mate{display:grid;grid-template-columns:19px 1fr;column-gap:5px;width:auto;height:20px;}
${C}:not(.land) .mate .mface{width:19px;height:19px;font-size:10px;}
${C}:not(.land) .mate .mn{display:block;font-size:10px;line-height:11px;}
${C}:not(.land) .mate .mbar{display:block;height:2px;margin-top:2px;}

/* 技能、道具：各自独立的完整按钮，间距 12px，最小 44×44，图标 20px，小字不小于 12px */
${C} .piles,${C}.land .piles,${C}:not(.land) .piles{gap:12px;}
${C} .piles :is(.skill,.mini),${C}.land .piles :is(.skill,.mini){box-sizing:border-box;min-width:44px;height:44px;padding:0 12px;gap:6px;justify-content:center;font-size:13px;}
${C} .piles .skill svg,${C} .piles .mini svg{width:20px;height:20px;}
${C} .piles .skill b,${C} .piles .mini em{font-size:13px;}
${C} .piles .skill .sn{max-width:92px;}
${C} .piles .mini{margin-left:0;}
${key === 'dark-a' ? `
/* 恐怖A 用户审图（11-02）：四角括装饰对齐画布四角；能量去底块；横屏右列 技能 / 道具 / 结束回合；横屏小字不小于 12px；竖屏结束回合完整显示、主战者栏随宽度铺满 */
${S} .vf.a,${C}.land .vf.a{left:4px;top:4px;}
${S} .vf.b,${C}.land .vf.b{right:4px;top:4px;}
${C} .energy{background:none;box-shadow:none;text-shadow:0 1px 3px #000,0 0 8px #000;}
${C} .piles{justify-content:flex-start;gap:6px;}
${C} .piles :is(.skill,.mini){margin-left:0;}
${S} .piles .mini:not(.off):not([aria-disabled="true"]){color:var(--bone);box-shadow:inset 0 0 0 1px var(--en);}
${S} .piles .skill:not(.off):not([aria-disabled="true"]){color:var(--bone);}
${S} .piles :is(.skill,.mini):is(.off,[aria-disabled="true"]){opacity:.45;box-shadow:none;}
${C} .end{right:12px;width:auto;min-width:76px;padding:0 10px;box-sizing:border-box;white-space:nowrap;}
${C} .lead{width:calc(var(--cx-w,390px) - 128px);}
${C}.land .top .rnd{font-size:13px;}
${C}.land .top .x2{font-size:12px;}
${S}.land .rec,${C}.land .rec{font-size:12px;}
${C}.land .pcnt{font-size:12px;} ${C}.land .pcnt b{font-size:13px;}
${C}.land .mate .mn{font-size:13px;line-height:15px;}
${C}.land .mate .mb{font-size:12px;}
${C}.land .lead .face{width:64px;height:64px;} ${C}.land .lead .info{left:74px;}
${C}.land .lead .face .aw{font-size:12px;letter-spacing:0;height:16px;line-height:16px;}
${C}.land .lead .n .ctl{font-size:12px;} ${C}.land .lead .n .hp{font-size:12px;}
${C}.land .lead .skill{font-size:12px;} ${C}.land .lead .skill b{font-size:12px;}
${C}.land .foe .plate u{font-size:12px;height:18px;}
${C}.land .hand .card :is(.ut,.stk,.ds,.sr,.ex){font-size:12px;}
${C}.land .hand .card .rtab{font-size:12px;width:20px;}
${C}.land .hand .card .bd{font-size:12px;}
` : ''}
/* 横屏底部横条（用户 11-02 终稿「扁宽饱满」，九套同位）：版心居中，左→右 信息组 → 资源列（点数 + 技能 / 道具）→ 手牌，组间距 16；手牌上沿一行：左 抽牌 / 弃牌 文字，右 结束回合 */
${C}.land{--lw:min(calc(var(--cx-w,1280px) - 40px),1360px);--ll:calc((var(--cx-w,1280px) - var(--lw)) / 2);--iw:clamp(280px,calc(var(--lw) * .26),380px);--rl:calc(var(--ll) + var(--iw) + 16px);--hl:calc(var(--rl) + 136px);--hw:calc(var(--ll) + var(--lw) - var(--hl));}
${C}.land .lead{left:var(--ll);top:516px;width:var(--iw);height:72px;}
${C}.land .lead .face{width:72px;height:72px;} ${C}.land .lead .info{left:84px;}
${C}.land .lead .n{font-size:16px;line-height:20px;} ${C}.land .lead .n .hp b{font-size:17px;} ${C}.land .lead .hpbar{height:6px;margin-top:4px;}
${C}.land .mates{left:var(--ll);right:auto;top:600px;width:var(--iw);}
${C}.land .mate{grid-template-columns:28px 1fr;height:34px;} ${C}.land .mate .mface{width:28px;height:28px;font-size:13px;} ${C}.land .mate .mn{font-size:14px;line-height:16px;}
${C}.land .energy{left:var(--rl);top:556px;width:120px;height:56px;align-items:center;justify-content:center;background:none;box-shadow:none;}
${C}.land .energy .v{font-size:30px;line-height:30px;} ${C}.land .energy .v small{font-size:15px;} ${C}.land .energy .v svg{width:18px;height:18px;}
${C}.land .piles{left:var(--rl);top:644px;width:120px;height:44px;flex-direction:row;align-items:center;justify-content:flex-start;gap:12px;}
${C}.land .piles :is(.skill,.mini){width:auto;flex:none;padding:0 6px;gap:4px;}
${C}.land .piles .skill .sn,${C}.land .piles .mini .lb{display:none;}
${C}.land .hand{left:var(--hl);width:var(--hw);top:538px;height:170px;}
${C}.land .end{left:calc(var(--ll) + var(--lw) - 160px);right:auto;top:484px;width:160px;height:44px;padding:0;}
${C}.land .pcnt{left:var(--hl);top:484px;width:240px;height:44px;display:flex;justify-content:flex-start;align-items:center;gap:20px;pointer-events:none;}
${C}.land .pcnt .pl{display:flex;flex-direction:row;align-items:baseline;gap:6px;width:auto;font-size:12px;color:var(--dim);}
${C}.land .pcnt .pl b{font-size:19px;color:var(--bone);}
${C}.land .tray{left:var(--rl);top:550px;width:300px;}
${C}.land .pickbar{left:var(--hl);top:488px;width:360px;}
/* 技能、道具只留图标（44×44，图标 22px，数量角标 12px）；行动点数固定尺寸块（高 44，数字与「/上限」同基线，点珠在正下方居中） */
${C} .piles :is(.skill,.mini),${C}.land .piles :is(.skill,.mini),${C}:not(.land) .piles :is(.skill,.mini){position:relative;width:44px;min-width:44px;height:44px;padding:0;gap:0;justify-content:center;}
${C} .piles .skill svg,${C} .piles .mini svg{width:22px;height:22px;}
${C} .piles :is(.skill,.mini)>.cnt{position:absolute;right:3px;top:2px;z-index:2;font:700 12px/1 var(--num);font-style:normal;color:var(--en);}
${C} .energy,${C}.land .energy,${C}:not(.land) .energy{height:44px;box-sizing:border-box;flex-direction:column;align-items:center;justify-content:center;}
${C} .energy .v{align-items:baseline;gap:2px;} ${C} .energy .v svg{align-self:center;}
${C} .energy .pips{justify-content:center;margin-top:2px;}
${C}:not(.land) .energy{width:84px;}
${C}.land .energy{left:var(--rl);top:592px;width:100px;}
${C}.land .piles{top:644px;width:100px;}
/* 第二轮审图（11-02）：横屏行动点数放大并上移，技能 / 道具在点数正下方；结束回合上移、右缘留空（超宽屏再往右）。竖屏技能道具往左靠、结束回合往右靠，贴边留 20px，点数不放大 */
${C}.land .energy{left:var(--rl);top:548px;width:100px;height:78px;}
${C}.land .energy .v{font-size:52px;line-height:52px;} ${C}.land .energy .v small{font-size:24px;} ${C}.land .energy .v svg{width:28px;height:28px;}
${C}.land .energy .pips i{width:18px;}
${C}.land .piles{left:var(--rl);top:644px;width:100px;}
${C}.land .hand{top:530px;}
${C}.land .end{left:calc(min(var(--cx-w,1280px) - 24px,var(--ll) + var(--lw) + 110px) - 160px);top:452px;}
${C}:not(.land) .piles{left:20px;}
${C}:not(.land) .end{left:calc(var(--cx-w,390px) - 20px - 84px);}
${C}:not(.land) .energy .v{font-size:38px;line-height:38px;} ${C}:not(.land) .energy .v small{font-size:19px;} ${C}:not(.land) .energy .v svg{width:22px;height:22px;}
${key === 'dark-b' ? `${C}:not(.land) :is(.piles,.energy,.end){top:552px;}` : ''}
`;
};

// 概念稿里以 #igs-combat-panel 开头的牌面规则只落在画布上；出牌影子（演出层里复制出来的牌）也要同样的牌面，这里把牌面规则与变量定义复制一份给影子容器。
function ghostCopies(css, key) {
    const canvas = `#igs-overlay #igs-cx-canvas:where([data-cx="${key}"])`;
    const ghost = `#igs-overlay .igs-cx-ghost[data-cx="${key}"]`;
    const out = [];
    for (const line of css.split('\n')) {
        const m = /^(.*?)\{(.*)\}$/.exec(line);
        if (!m) continue;
        const sels = [];
        let depth = 0, cur = '';
        for (const ch of m[1]) {
            if (ch === '(' || ch === '[') depth++;
            if (ch === ')' || ch === ']') depth--;
            if (ch === ',' && depth === 0) { sels.push(cur.trim()); cur = ''; } else cur += ch;
        }
        sels.push(cur.trim());
        const mapped = sels.filter((s) => s.startsWith(canvas)).map((s) => s.slice(canvas.length)).filter((rest) => /\.hand\b[^,]*\.card/.test(rest) && !/\.hand:has/.test(rest));
        if (mapped.length) out.push(`${mapped.map((r) => ghost + r).join(',')}{${m[2]}}`);
        if (sels.includes(canvas)) {
            const vars = m[2].split(';').map((d) => d.trim()).filter((d) => /^(--|font-family|color:)/.test(d));
            if (vars.length) out.push(`${ghost}{${vars.join(';')}}`);
        }
    }
    return out.join('\n');
}


export const darkStyleText = (key, concept) => `${concept}\n${ghostCopies(concept, key)}\n${wiringCss(key)}`;

export const battleHtml = (v, orient) => darkBattleHtml(v, orient, 'dark-a');
export const STYLE_TEXT = darkStyleText('dark-a', COMBAT_SKIN_DARK_A_CONCEPT_CSS);
