import { esc } from './reader-value-utils.js';
import { intentIconSvg, portraitSilhouetteSvg } from './combat-card-art.js';
import { isItemSelection, isSkillSelection, selectedItemView, selectedSkillView, skillSelection } from './combat-panel-model.js';
import { LIVE_ICONS } from './danmaku-icons.js';
import { RECORD_ICONS } from './record-icons.js';
import { isCanvasSkin } from './combat-skin-canvas.js';
import { CANVAS_BATTLE } from './combat-skin-registry.js';
import { CHALLENGE_LABELS } from '../../combat/challenge-labels.js';
import { CHALLENGE_ACHIEVEMENTS } from '../../combat/challenge-history.js';
import { resultStageHtml, stageFxStyle } from './combat-stage-fx.js';

// 战斗面板的 HTML 片段：只输出字段、状态、错误与操作确认；动作统一走 data-combat-act / data-combat-id。
const REASON_TEXT = Object.freeze({
    'combat-busy': '上一步还在进行中',
    'combat-restart-unavailable': '现在不能重新开始',
    'combat-auto-unavailable': '现在不能交给托管',
    'combat-ally-full': '协助者最多两名',
    'combat-auto-stalled': '托管没有走完，请手动继续',
    'combat-abandon-unavailable': '现在不能放弃',
    'escape-unavailable': '这次挑战不能放弃',
    'challenge-start-missing': '这一楼没有挑战标签',
    'challenge-report-invalid': '挑战战报生成失败',
    'combat-restart-record-failed': '撤销上一局结果失败，未重新开始',
    'combat-session-save-failed': '战斗存档保存失败',
    'combat-session-not-ready': '战斗尚未就绪',
    'combat-session-unavailable': '战斗会话不可用',
    'combat-floor-missing': '开战楼不存在',
    'combat-start-missing': '这一楼没有开战标签',
    'combat-floor-changed': '开战楼已改动或切换了分支，本场战斗作废',
    'combat-user-name-missing': '未读取到主角名',
    'combat-table-missing': '数据库中没有战斗表',
    'combat-table-host-unsupported': '未检测到数据库（shujuku）',
    'combat-table-not-ready': '数据库尚未载入当前聊天，请稍后重试',
    'combat-table-template-diverged': '当前聊天的表与数据库模板不一致，未自动建战斗表',
    'combat-table-runtime-not-ready': '战斗表已写入，但数据库运行时未就绪',
    'combat-table-read-failed': '读取数据库表失败',
    'combat-table-create-failed': '战斗表创建失败',
    'combat-table-create-unverified': '战斗表创建后未能读回确认',
    'combat-table-template-unavailable': '读取数据库模板失败',
    'combat-table-template-mismatch': '数据库模板与战斗表不匹配',
    'combat-table-refresh-failed': '数据库刷新失败',
    'combat-ledger-insert-failed': '战斗记录写入失败',
    'combat-ledger-write-unverified': '战斗记录写入后未能读回确认',
    'combat-ledger-read-failed': '读取战斗记录失败',
    'combat-profile-write-failed': '角色档案写入失败',
    'combat-protagonist-generation-failed': '主角卡组生成失败',
    'combat-protagonist-missing': '没有主角卡组档案',
    'combat-deck-needs-adjust': '主角卡组需要调整后才能出战',
    'combat-llm-config-incomplete': '副 LLM 配置不完整',
    'combat-session-save-failed': '战斗进度保存失败，本步未生效',
    'combat-session-storage-unavailable': '无法读取本地战斗进度',
    'combat-session-corrupt': '本地战斗进度已损坏',
    'combat-ledger-scan-failed': '扫描成长记录失败',
    'combat-controlled-invalid': '所选角色不能由你操控',
    'combat-llm-unavailable': '副 LLM 不可用',
    'combat-llm-request-failed': '副 LLM 请求失败',
    'combat-reply-not-json': '副 LLM 回复无法解析',
    'combat-send-error': '战报发送出错',
    'combat-entry-invalid': '记录格式无效',
    'combat-outbox-save-failed': '战报暂存失败，未发送',
    'combat-report-send-failed': '战报发送失败',
    'combat-send-unavailable': '当前无法发送消息',
    'combat-skip-send-failed': '发送失败',
    'combat-rules-version-mismatch': '战斗规则已更新，旧进度无法继续',
    'combat-replay-failed': '战斗进度无法恢复',
    'combat-record-read-failed': '读取聊天记录里的战斗留档失败',
    'combat-record-corrupt': '聊天记录里的战斗留档已损坏',
    'combat-record-save-failed': '战斗留档未能写入聊天记录',
    'combat-record-unverified': '战斗留档写入后未能读回确认',
    'combat-record-stale': '开战楼已改动，留档未写入',
    'combat-reward-not-retryable': '当前不能重试奖励',
    'combat-record-unsupported': '当前宿主不支持写入聊天记录',
    'combat-card-unplayable': '能量不足或当前不能出这张牌',
    'combat-hero-skill-unusable': '人物技能本回合已用过或能量不足',
    'hero-skill-used': '人物技能本回合已用过',
    'hero-skill-missing': '这个角色没有人物技能',
    'awaken-used': '本场已经觉醒过',
    'awaken-unavailable': '本场没有觉醒',
    'item-used': '本回合已经用过道具',
    'item-empty': '这个道具已经用完',
    'item-unavailable': '本场没有这个道具',
    'combat-item-unusable': '本回合已经用过道具或道具已用完',
    'combat-items-empty': '没有可用的道具',
    'insufficient-energy': '能量不足',
    'combat-target-invalid': '目标无效',
    'combat-reward-unavailable': '没有可领取的奖励',
    'combat-reward-duplicate': '该等级奖励已领取',
    'combat-reward-choice-invalid': '选项无效',
    'request-stale': '准备已取消',
    'combat-action-threw': '操作出错',
    'not-player-phase': '现在不是我方回合',
    'battle-ended': '战斗已结束',
    'combat-flip-required': '先翻开一张战利品再发送战报',
    'combat-flip-unavailable': '现在不能翻牌',
    'combat-flip-not-ready': '战利品还没读到',
    'combat-flip-locked': '战利品已附进战报，不能再改',
    'combat-flip-busy': '上一次翻牌还在保存',
    'combat-flip-save-failed': '翻牌进度未能写入聊天记录，本步未生效',
    'combat-flip-corrupt': '翻牌进度已损坏',
    'combat-flip-done': '已经选定战利品',
    'combat-flip-already': '这张已经翻开',
    'combat-flip-choose': '从翻开的牌里选一张',
    'combat-flip-position-invalid': '这张牌不能选',
    'combat-reroll-used': '本场已经重抽过',
    'combat-reroll-unavailable': '本场不能重抽',
    'combat-points-insufficient': '金钱不足',
    'combat-choice-pending': '先选完牌',
    'combat-choice-invalid': '这张牌不能选',
    'combat-choice-full': '已选够张数，先取消一张',
    'combat-choice-count': '还没选够张数',
    'choice-pending': '先选完牌',
    'invalid-choice': '选牌无效',
    'no-choice-pending': '现在不需要选牌',
});

export function combatReasonText(reason) {
    return REASON_TEXT[reason] || (reason ? `操作失败（${reason}）` : '');
}

// 生成失败的具体原因：只按错误码给文案，不显示模型回复正文。
const GENERATION_CAUSE_TEXT = Object.freeze({
    'combat-reply-empty': '副 LLM 回复为空',
    'combat-reply-truncated': '副 LLM 回复被截断',
    'combat-reply-not-json': '副 LLM 回复不是 JSON',
    'combat-reply-shape': '副 LLM 回复缺少 entities',
    'entity-missing': '副 LLM 回复漏掉了该角色',
    'combat-llm-request-failed': '副 LLM 请求失败',
    'class-unknown': '找不到所用职业',
});

export function generationCauseText(reason) {
    return reason ? GENERATION_CAUSE_TEXT[reason] || '档案校验未通过' : '';
}

const btn = (act, label, { id = '', primary = false, disabled = false } = {}) =>
    `<button type="button" class="igs-combat-btn${primary ? ' is-primary' : ''}" data-combat-act="${esc(act)}"${id ? ` data-combat-id="${esc(id)}"` : ''}${disabled ? ' aria-disabled="true"' : ''}>${esc(label)}</button>`;

// 回合操作图标按钮：图标是程序常量；文字只放在 aria-label / title，可访问名称与原文字按钮一致。
const iconBtn = (act, label, icon, { primary = false, disabled = false } = {}) =>
    `<button type="button" class="igs-combat-btn is-icon${primary ? ' is-primary' : ''}" data-combat-act="${esc(act)}" aria-label="${esc(label)}" title="${esc(label)}"${disabled ? ' aria-disabled="true"' : ''}>${icon}</button>`;

// 关闭沿用本体图标按钮（36×36、透明底、细线 close 图标）；图标是程序常量。extra 为标题栏右侧、关闭按钮前的内容（对局中的行动条）。
// round 为当前回合数（纯数字），画成标题后的斜切回合横幅；0 时不画。
// speed 为演出速度（1 原速、2 二倍速）：对局与结算演出期间在关闭按钮前画切换按钮（aria-pressed 表示是否二倍速）；0 时不画。
const speedBtn = (speed) => `<button type="button" class="igs-combat-icon-btn igs-combat-speed" data-combat-act="speed" aria-pressed="${speed > 1 ? 'true' : 'false'}" aria-label="演出二倍速" title="演出二倍速">×2</button>`;
const head = (title, extra = '', round = 0, speed = 0, challenge = false) => `<header class="igs-combat-head"><span class="igs-combat-title">${esc(title || (challenge ? CHALLENGE_LABELS.battle : '战斗'))}</span>${round ? `<span class="igs-combat-round">第 ${esc(round)} 回合</span>` : ''}${extra}${speed ? speedBtn(speed) : ''}<button type="button" class="igs-combat-icon-btn" data-combat-act="close" aria-label="关闭">${LIVE_ICONS.close}</button></header>`;

// 行动条：一条 SVG 细线，右端菱形为出手点；参战单位的小圆头像按行动值进度（--p，0–1）沿线定位，我方在线上、敌方在线下。
// 有立绘用立绘，没有立绘的敌人用通用敌人图集的一格，否则写名字首字；可访问名称给出引擎推演的接下来几次出手顺序。
function trackHtml(b, pics, arts = {}) {
    if (!b?.track?.length) return '';
    const dots = b.track.map((t) => `<span class="igs-combat-track-dot" data-unit="${esc(t.id)}" data-side="${esc(t.side)}"${t.controlled ? ' data-controlled=""' : ''} style="--p:${Number(t.p) || 0}" title="${esc(t.name)}">`
        + (pics[t.name] ? `<img src="${esc(pics[t.name])}" alt="" loading="lazy" decoding="async">` : arts[t.name] ? artHtml(arts[t.name]) : `<span aria-hidden="true">${esc(String(t.name).slice(0, 1))}</span>`) + '</span>').join('');
    const label = b.order?.length ? `行动顺序：${b.order.map((o) => o.name).join('、')}` : '行动条';
    return `<div class="igs-combat-track" role="img" aria-label="${esc(label)}">`
        + '<svg class="igs-combat-track-line" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6H100" vector-effect="non-scaling-stroke"/><path class="is-tick" d="M25 3.5v5M50 3.5v5M75 3.5v5" vector-effect="non-scaling-stroke"/></svg>'
        + '<svg class="igs-combat-track-goal" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6Z"/></svg>'
        + `${dots}</div>`;
}

const noticeHtml = (text) => (text ? `<p class="igs-combat-notice" role="alert">${esc(text)}</p>` : '');

// 血条与状态栏数值条同一画法：细轨道加渐变填充，数值在轨道右侧。
const hpBar = (u) => {
    const pct = u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0;
    return `<div class="igs-combat-hp" style="--igs-combat-hp:${pct}%"><span class="igs-combat-hp-track"><i></i></span><span class="igs-combat-hp-value">${u.hp}/${u.maxHp}</span></div>`;
};

const statusesHtml = (list) => (list.length
    ? `<div class="igs-combat-statuses">${list.map((s) => `<span data-status="${esc(s.key)}">${esc(s.label)} <b>${esc(s.stacks)}</b></span>`).join('')}</div>` : '');

// 立绘：素材库有图时用 <img>（地址已经 safePortraitUrl 过滤）；没有图的敌人用通用敌人图集的一格（cell 只给图集与格位坐标，图集地址在样式表里）；其余用程序剪影。
const artHtml = (cell) => `<span class="igs-combat-art" data-atlas="${esc(cell.atlas)}" style="--ea-x:${esc(cell.x)};--ea-y:${esc(cell.y)}" aria-hidden="true"></span>`;
// attrs：战斗中不在选目标时头像可点开单位详情（unit-info）；战前对阵不带。
const portraitHtml = (name, side, url, cell = null, attrs = '') => `<div class="igs-combat-portrait" data-side="${esc(side)}"${attrs}>${url
    ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : cell ? artHtml(cell) : portraitSilhouetteSvg(name)}</div>`;
// 我方立绘框色调：只认 rgb(r,g,b)（各分量为 0–255 的整数），转成 CSS 变量用的「r,g,b」；其余输入一律返回空串，框用默认暖金。
export function tintTriplet(value) {
    const m = /^rgb\((\d{1,3}),(\d{1,3}),(\d{1,3})\)$/.exec(String(value || ''));
    const rgb = m ? m.slice(1).map(Number) : [];
    return rgb.length === 3 && rgb.every((n) => n <= 255) ? rgb.join(',') : '';
}

// 敌方意图：深色底小标签，图标与数值按意图着色；有伤害时显示伤害数，否则显示意图类别，后接招式名。
function intentHtml(it) {
    const head = it.damage ? `<b class="igs-combat-intent-value">${esc(it.damage)}</b>` : `<span class="igs-combat-intent-kind">${esc(it.label)}</span>`;
    const tip = `${it.label}·${it.name}${it.damage ? `，${it.damage} 点${it.unit || '伤害'}` : ''}`;
    return `<div class="igs-combat-intent" data-intent="${esc(it.kind)}" title="${esc(tip)}"><span class="igs-combat-intent-icon">${intentIconSvg(it.kind)}</span>${head}<span class="igs-combat-intent-name">${esc(it.name)}</span></div>`;
}

// 单位块：敌人是站立立绘、意图浮在上方；我方是圆框头像（样式层按 size 裁成主战者半身 / 队友头肩）。名字 / 格挡 / 血条 / 状态在下方。size 为 sm（队友）/ md（敌人）/ lg（主战者）。
// 不在选目标时点头像弹出该单位的被动、技能与阶段（助手 10-28）；选目标时整块是目标。
function unitHtml(u, { targetable = false, portrait = '', art = null, size = 'md', ring = null } = {}) {
    const intent = u.intent ? intentHtml(u.intent) : '';
    const block = u.block ? `<span class="igs-combat-block" role="img" aria-label="格挡 ${u.block}">${RECORD_ICONS.armor}${u.block}</span>` : '';
    const statuses = statusesHtml(u.statuses);
    const badges = block || statuses ? `<div class="igs-combat-unit-badges">${block}${statuses}</div>` : '';
    const attrs = targetable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0"` : '';
    const info = targetable ? '' : ` data-combat-act="unit-info" data-combat-id="${esc(u.id)}" data-unit-info="${esc(u.id)}" role="button" tabindex="0" aria-label="${esc(`查看${u.name}的技能与被动`)}"`;
    // 场外补位：退场（out）/ 入场（in）中的格子带 data-swap，--swap-t 为负的已过时长（重绘时动画接着播）。
    // 圆环站位（敌人）：--fx 左右位置（-1..1，正前方 0）、--fd 前后深度（1 正前方、0 最后）、--fz 层序，都是纯数字，几何由样式层按方向换算。
    const swapStyle = u.swap === 'out' || u.swap === 'in' ? `--swap-t:${-Math.max(0, Math.round(Number(u.swapT) || 0))}ms` : '';
    const ringStyle = ring ? `--fx:${ring.x};--fd:${ring.d};--fz:${ring.z}` : '';
    const styleAttr = swapStyle || ringStyle ? ` style="${[swapStyle, ringStyle].filter(Boolean).join(';')}"` : '';
    const swap = (u.swap === 'out' || u.swap === 'in' ? ` data-swap="${u.swap}"` : '') + styleAttr;
    return `<div class="igs-combat-unit${u.alive ? '' : ' is-down'}${u.controlled ? ' is-controlled' : ''}${targetable ? ' is-targetable' : ''}${ring?.front ? ' is-front' : ''}" data-unit="${esc(u.id)}" data-side="${esc(u.side)}" data-size="${esc(size)}"${swap}${attrs}>`
        + intent
        + portraitHtml(u.name, u.side, portrait, art, info)
        + `<div class="igs-combat-unit-info">${badges}<div class="igs-combat-unit-name"><span>${esc(u.name)}</span></div>${hpBar(u)}</div></div>`;
}

// 主动特性按钮（助手 10-28）：只放主动特性（最多 2 个），在主战者头像右上方外侧并排，固有在前；圆角方形深色底（与卡面同材质）+ 按名称与效果匹配的卡面纹样，抽到的特性细环按稀有度着色。
// 右上角暖色费用圆标，点选即选中（选目标与出牌共用 selected / 取消）并弹出详情，也可像手牌一样拖到目标上发动；可用与否只看 usable（来自 legal）。被动在头像详情里。
function traitOrbHtml(t, selected) {
    const rarity = t.rarity ? ` data-rarity="${esc(t.rarity)}"` : '';
    const head = `${t.innate ? '固有' : LOOT_RARITY_LABELS[t.rarity] || ''}主动特性 ${t.name}`;
    const icon = `<span class="igs-combat-trait-orb" aria-hidden="true">${t.icon || RECORD_ICONS.sparkle}`;
    const cls = `igs-combat-trait is-active${t.usable ? '' : ' is-disabled'}${t.used ? ' is-used' : ''}${selected === skillSelection(t.skillId) ? ' is-selected' : ''}`;
    const label = `${head} 消耗 ${t.cost} 点能量 ${t.text}${t.used ? ' 本回合已使用' : ''}`;
    return `<button type="button" class="${cls}" data-combat-act="hero-skill"${t.skillId ? ` data-combat-id="${esc(t.skillId)}"` : ''} data-trait="${esc(t.id)}"${rarity}${t.usable ? '' : ' aria-disabled="true"'} aria-label="${esc(label)}">`
        + `${icon}<span class="igs-combat-trait-cost">${esc(t.cost)}</span></span></button>`;
}

// 按钮组与主战者单位块并列放在头像框节点（.igs-combat-hero-figure）里、盖住头像区域（不嵌进可选为目标的单位块）；data-orbs 为颗数（纯数字），样式层把按钮并排在头像右上方外侧。
function traitsHtml(traits, selected) {
    const list = (Array.isArray(traits) ? traits : []).filter((t) => t.kind === 'active');
    return list.length ? `<div class="igs-combat-trait-ring" role="group" aria-label="主动特性" data-orbs="${list.length}">${list.map((t) => traitOrbHtml(t, selected)).join('')}</div>` : '';
}

// 主动特性圆球的详情浮层（挂在圆球旁）：名称与稀有度（固有特性标「固有」）、能量与次数、效果、来历。被动在头像详情里（unitTipHtml）。
export function traitTipHtml(t) {
    if (!t) return '';
    const tier = t.innate ? '固有' : LOOT_RARITY_LABELS[t.rarity] || '';
    const meta = `主动 · 消耗 ${t.cost} 点能量 · 每回合一次${t.used ? ' · 本回合已使用' : ''}`;
    return `<b class="igs-combat-trait-tip-name">${esc(t.name)}${tier ? `<i data-rarity="${esc(t.innate ? 'innate' : t.rarity)}">${esc(tier)}</i>` : ''}</b>`
        + `<span class="igs-combat-trait-tip-meta">${esc(meta)}</span><span class="igs-combat-trait-tip-text">${esc(t.text)}</span>`
        + (t.origin ? `<span class="igs-combat-trait-tip-origin">${esc(t.origin)}</span>` : '');
}

// 单位详情浮层（点头像，助手 10-28）：单位名，下面按组（人物特性 / 职业 / 装备 / 被动 / 主动 / 技能 / 阶段）列出；每项名称（特性标稀有度或「固有」）、时机或意图、效果。
export function unitTipHtml(d) {
    if (!d) return '';
    const item = (x) => {
        const tier = x.rarity === 'innate' ? '固有' : LOOT_RARITY_LABELS[x.rarity] || '';
        return `<span class="igs-combat-unit-tip-item"><b>${esc(x.name)}${tier ? `<i data-rarity="${esc(x.rarity)}">${esc(tier)}</i>` : ''}</b>`
            + `${x.meta ? `<span class="igs-combat-unit-tip-meta">${esc(x.meta)}</span>` : ''}${x.text ? `<span>${esc(x.text)}</span>` : ''}</span>`;
    };
    const groups = d.groups.map((g) => `<span class="igs-combat-unit-tip-group"><span class="igs-combat-unit-tip-label">${esc(g.label)}</span>${g.items.map(item).join('')}</span>`).join('');
    return `<b class="igs-combat-trait-tip-name">${esc(d.name)}</b>${groups || '<span class="igs-combat-unit-tip-meta">没有被动或技能</span>'}`;
}

// 觉醒 / 道具：主战者头像左下角外侧两块竖排的小长方形文字按钮（觉醒在上、道具在下）。
// 道具按钮点开 / 收起上方的道具列表（open 为面板记下的界面状态）：每项图标、名称、余量，点了直接使用；用完的不列；没有道具时按钮置灰；每回合 1 次，可用与否只看 usable（来自 legal）。
function itemsHtml(items, open = false) {
    const list = (items || []).filter((i) => i.count > 0);
    const shown = Boolean(open) && list.length > 0;
    const menu = shown ? `<div class="igs-combat-item-menu" role="menu" aria-label="道具">${list.map((i) => `<button type="button" role="menuitem" class="igs-combat-item${i.usable ? '' : ' is-disabled'}" data-combat-act="item" data-combat-id="${esc(i.itemId)}"${i.usable ? '' : ' aria-disabled="true"'}`
        + ` aria-label="${esc(`道具 ${i.name} 剩余 ${i.count} 个 ${i.text}，不消耗能量，每回合一次`)}" title="${esc(`${i.name} ×${i.count}：${i.text}`)}">`
        + `<span class="igs-combat-item-icon" aria-hidden="true">${i.imageUrl ? `<img src="${esc(i.imageUrl)}" alt="" decoding="async">` : RECORD_ICONS.potion}</span><span class="igs-combat-item-name">${esc(i.name)}</span><span class="igs-combat-item-count">${esc(i.count)}</span></button>`).join('')}</div>` : '';
    return `<div class="igs-combat-items${shown ? ' is-open' : ''}">${menu}<button type="button" class="igs-combat-ctl${shown ? ' is-open' : ''}${list.length ? '' : ' is-disabled'}" data-combat-act="items" aria-haspopup="menu" aria-expanded="${shown ? 'true' : 'false'}"${list.length ? '' : ' aria-disabled="true"'}>`
        + '<span class="igs-combat-ctl-label">道具</span></button></div>';
}

// 觉醒：每场 1 次、不耗能量，只在可用（usable 来自 legal）时出现，用后或不可用时不渲染；按类型着色（data-awaken），背景里有浮动特效层；台词与效果放在 aria-label / title。
function awakenHtml(aw) {
    if (!aw || aw.used || !aw.usable) return '';
    const tip = `觉醒·${aw.label}${aw.line ? `『${aw.line}』` : ''}：${aw.text}`;
    return `<button type="button" class="igs-combat-ctl igs-combat-awaken" data-combat-act="awaken" data-awaken="${esc(aw.type)}" aria-label="${esc(`${tip}，不消耗能量，每场一次`)}" title="${esc(tip)}">`
        + '<span class="igs-combat-ctl-fx" aria-hidden="true"></span><span class="igs-combat-ctl-label">觉醒</span></button>';
}

// 握牌扇形：以手牌中点为轴，越靠两侧旋转越大、位置越低；张数越多每张的角度越小。只输出数值，不含档案文本。
function fanStyle(i, n) {
    const d = i - (n - 1) / 2;
    const step = n > 1 ? Math.min(5, 28 / (n - 1)) : 0;
    const rot = d * step;
    return `--fan-r:${rot.toFixed(1)}deg;--fan-y:${Math.round(rot * rot * 0.1)}px;--fan-n:${n}`;
}

// hovered：面板记录的指针所在手牌，重绘后的牌带 .is-hover 保持抬起。picks：待选阶段已选的候选牌实例（.is-chosen）；候选牌不置灰（.is-choosable）。
function cardHtml(c, selected, i = 0, n = 1, hovered = '', picks = []) {
    const live = c.playable || c.choosable;
    const chosen = Boolean(c.choosable) && picks.includes(c.inst);
    const cls = `igs-combat-card${live ? '' : ' is-disabled'}${selected === c.inst ? ' is-selected' : ''}${c.choosable ? ' is-choosable' : ''}${chosen ? ' is-chosen' : ''}${c.upgraded ? ' is-upgraded' : ''}${c.temp ? ' is-temp' : ''}${hovered && hovered === c.inst ? ' is-hover' : ''}`;
    // 减费时附原费用；关键字（不能打出、固有、虚无、临时、被丢弃时）排在效果说明前。旧卡没有这些字段，标记与读屏文本不变。
    const costNote = c.baseCost !== undefined ? `（原 ${c.baseCost}）` : '';
    const label = `${c.name} 消耗 ${c.cost} 点能量${costNote} ${c.keywords ? `${c.keywords}。` : ''}${c.text || ''}${c.scaleNote ? `。${c.scaleNote}` : ''}`;
    // 卡图 SVG 由 combat-card-art 只用程序常量与数值生成，不含档案文本，可直接拼入；
    // 本地卡面图（artUrl）已在面板层过滤协议，这里转义后写入 src：有图用图，无图回退 SVG。
    return `<button type="button" class="${cls}" style="${fanStyle(i, n)}" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}${live ? '' : ' aria-disabled="true"'}${c.choosable ? ` aria-pressed="${chosen ? 'true' : 'false'}"` : ''} aria-label="${esc(label)}">`
        + `<span class="igs-combat-card-cost${c.baseCost !== undefined && c.cost < c.baseCost ? ' is-down' : ''}" title="${esc(`消耗 ${c.cost} 点能量${costNote}`)}">${esc(c.cost)}</span><span class="igs-combat-card-name">${esc(c.name)}${c.upgraded ? '+' : ''}</span>`
        + `<span class="igs-combat-card-art">${c.artUrl ? `<img src="${esc(c.artUrl)}" alt="" decoding="async">` : c.art || ''}</span><span class="igs-combat-card-type">${esc(c.typeLabel || '')}</span>`
        + cardSlotHtml(c)
        + `<span class="igs-combat-card-text">${c.keywords ? `<span class="igs-combat-card-kw">${Array.isArray(c.keywordParts) ? c.keywordParts.map(partHtml).join('') : esc(c.keywords)}</span>` : ''}${cardTextHtml(c)}</span><span class="igs-combat-card-hit" aria-hidden="true"></span></button>`;
}

// 卡面插槽（风格化皮肤的窄签与放大牌用；初始方案下样式层隐藏，读屏文本仍只用按钮的 aria-label）：
// 主效果数值与单位、同名张数角标、关键字全称（细框文字，不是按钮）、加成明细（原值 + 加成）。没有对应字段时不输出节点。
function cardSlotHtml(c) {
    const value = Number.isFinite(c.value)
        ? `<span class="igs-combat-card-value${c.baseValue !== undefined && c.value !== c.baseValue ? (c.value > c.baseValue ? ' is-up' : ' is-down') : ''}" data-unit="${esc(c.unit || '')}" aria-hidden="true">${esc(c.value)}</span>${c.unit ? `<span class="igs-combat-card-unit" aria-hidden="true">${esc(c.unit)}</span>` : ''}` : '';
    const stack = c.stack >= 2 ? `<span class="igs-combat-card-stack" aria-hidden="true">×${esc(c.stack)}</span>` : '';
    const names = Array.isArray(c.keywordNames) ? c.keywordNames : [];
    const kw = names.length ? `<span class="igs-combat-card-kwfull" aria-hidden="true">${names.map((n) => `<i>${esc(n)}</i>`).join('')}</span>` : '';
    const bonus = c.bonusNote ? `<span class="igs-combat-card-bonus" aria-hidden="true">${esc(c.bonusNote)}</span>` : '';
    return value + stack + kw + bonus;
}

// 牌面说明片段：增强的数字青绿、减弱的数字灰色；带 tip 的数字与关键字（固有、消耗等）带 data-scale-tip，点开由面板弹出加成详情或关键字注释。
function partHtml(p) {
    const tip = p.tip ? ` data-scale-tip="${esc(p.tip)}"` : '';
    if (p.mark === 'up' || p.mark === 'down') return `<span class="igs-scale-${p.mark}"${tip}>${esc(p.text)}</span>`;
    return tip ? `<span${tip}>${esc(p.text)}</span>` : esc(p.text);
}

// 没有 textParts 时按原文本输出。
export function cardTextHtml(c) {
    if (!Array.isArray(c.textParts)) return esc(c.text || '');
    return c.textParts.map(partHtml).join('');
}

// 战前对阵（格斗游戏式）：铺满面板，顶部是遭遇名斜切横幅（带档位），中间 我方 · VS · 敌方（横屏左右、竖屏敌上我下，由样式层按面板方向切换），底部「跳过」与大号「开始战斗」。
// 舞台底层是斜切分屏（VS 所在一段不铺色块），入场白闪不在本标记里，由面板挂到面板根节点、铺满整个面板；我方每人一块街霸式平行四边形立绘框，相邻框斜边相扣，外侧框斜边以外的底层色块由样式层裁掉，选中的主战者框底提亮（data-picked）。名牌是平行四边形色块：名字在前，Lv 与职业缩小；
// 我方名牌是框底色带，可操控角色的名牌铺满整框、就是选择按钮（aria-pressed），其余标「托管」；敌人不用立绘框，站立立绘下接名牌，按数量逐个画出、错落排开，首领档放大并加「首领」斜标（data-tier）。
// intro 只在本次打开后第一次画战前、且未减少动态效果时为 true：双方冲入、白闪与震屏只播一次。--n / data-n 为该侧人数（纯数字）。
const LOBBY_FOE_MAX = 5;
// 敌人数达到此值时分前后两排，每排保持原立绘宽度。
const LOBBY_FOE_ROWS_AT = 4;
// 我方名牌一行：名字、Lv、职业各自成段，放不下的段整段换到被裁掉的第二行（样式层 .igs-combat-plate-row），不出现截断残片。
// 开战生命（持续伤势已计入）紧跟 Lv；没有生命数据时不画。
const plateMeta = (a) => `<small>Lv${esc(a.level)}</small>${a.maxHp ? `<small data-hp="">生命 ${esc(a.hp)}/${esc(a.maxHp)}</small>` : ''}${a.className ? `<small>${esc(a.className)}</small>` : ''}`;
const plateRow = (a) => `<span class="igs-combat-plate-row"><b>${esc(a.name)}</b>${plateMeta(a)}</span>`;
// 胜利奖励：生成成功不显示；失败（生成失败、写库失败、重开未生成）只显示「奖励生成失败」与「重试」，不阻断开战；重试进行中显示「奖励生成中」。
function lobbyRewardHtml(r, pending) {
    if (!r || r.status === 'ready') return '';
    const waiting = r.status === 'pending';
    const retry = waiting ? '' : btn('retry-reward', '重试', { disabled: Boolean(pending) });
    return `<div class="igs-combat-row igs-combat-lobby-reward" data-state="${waiting ? 'pending' : 'failed'}"><span class="igs-combat-label">${waiting ? '奖励生成中' : '奖励生成失败'}</span>${retry}</div>`;
}
// 日常挑战的战前对阵：沿用战前对阵的版式与皮肤，主角与难关各一块，只换文案；难度与领域放在横幅里。
const CHALLENGE_LOBBY_TIER = Object.freeze({ 轻松: 'normal', 普通: 'elite', 艰难: 'boss' });
function challengeLobbyHtml(v) {
    const l = v.lobby;
    const pics = v.portraits || {};
    const hero = l.allies[0];
    const foe = l.enemies[0];
    const tint = pics[hero.name] ? tintTriplet((v.tints || {})[hero.name]) : '';
    const helperHtml = l.allies.slice(1).map((a) => `<figure class="igs-combat-lobby-figure" data-side="ally">${portraitHtml(a.name, 'ally', pics[a.name] || '')}<span class="igs-combat-plate"><span class="igs-combat-plate-row"><b>${esc(a.name)}</b><small>相助</small></span></span></figure>`).join('');
    const allyRow = l.candidates && l.candidates.length
        ? `<div class="igs-combat-row igs-challenge-allies"><span class="igs-combat-label">协助者</span>${l.candidates.map((c) => `<button type="button" class="igs-combat-chip" data-combat-act="ally" data-combat-id="${esc(c.name)}" aria-pressed="${c.picked ? 'true' : 'false'}"${v.pending ? ' aria-disabled="true"' : ''}>${esc(c.name)}</button>`).join('')}</div>` : '';
    const heroHtml = `<figure class="igs-combat-lobby-figure" data-side="ally" data-picked=""${tint ? ` style="--igs-combat-ally-tint:${tint}"` : ''}>${portraitHtml(hero.name, 'ally', pics[hero.name] || '')}`
        + `<span class="igs-combat-plate"><span class="igs-combat-plate-row"><b>${esc(hero.name)}</b>${hero.maxHp ? `<small data-hp="">${CHALLENGE_LABELS.hp} ${esc(hero.maxHp)}</small>` : ''}</span></span></figure>`;
    const foeHtml = `<figure class="igs-combat-lobby-figure" data-side="enemy" data-tier="${esc(CHALLENGE_LOBBY_TIER[l.tier] || 'normal')}">${portraitHtml(foe.name, 'enemy', '', null)}`
        + `<figcaption class="igs-combat-plate"><b>${esc(foe.name)}</b><small>${CHALLENGE_LABELS.enemy}</small></figcaption></figure>`;
    const banner = `<div class="igs-combat-lobby-top"><div class="igs-combat-lobby-banner"><b class="igs-combat-lobby-name">${esc(l.encounter || CHALLENGE_LABELS.battle)}</b><span class="igs-combat-lobby-tier">${esc([l.tierLabel, l.domain].filter(Boolean).join(' · '))}</span></div></div>`;
    return `<section class="igs-combat-lobby" data-tier="${esc(CHALLENGE_LOBBY_TIER[l.tier] || 'normal')}"${v.intro ? ' data-intro=""' : ''}>${banner}`
        + '<div class="igs-combat-lobby-stage"><span class="igs-combat-lobby-fx" aria-hidden="true"><i class="is-ally"></i><i class="is-enemy"></i></span>'
        + `<div class="igs-combat-lobby-side is-ally" style="--n:${l.allies.length}">${heroHtml}${helperHtml}</div>`
        + '<div class="igs-combat-lobby-vs" aria-hidden="true"><b>对</b></div>'
        + `<div class="igs-combat-lobby-side is-enemy" data-n="1" style="--n:1;--k:1">${foeHtml}</div></div>`
        + allyRow
        + `<div class="igs-combat-actions">${btn('history', '挑战记录', { disabled: Boolean(v.pending) })}${l.canEscape ? btn('abandon', CHALLENGE_LABELS.escape, { disabled: Boolean(v.pending) }) : ''}${btn('auto', '交给托管', { disabled: Boolean(v.pending) })}${btn('start', '开始挑战', { primary: true, disabled: Boolean(v.pending) })}</div></section>`;
}

function lobbyHtml(v) {
    if (v.lobby.challenge) return challengeLobbyHtml(v);
    const l = v.lobby;
    const pics = v.portraits || {};
    const arts = v.enemyArt || {};
    const tints = v.tints || {};
    const allies = l.allies.map((a) => {
        const picked = a.controllable && v.controlledId === a.id;
        const tint = pics[a.name] ? tintTriplet(tints[a.name]) : '';
        const plate = a.controllable
            ? `<button type="button" class="igs-combat-plate" data-combat-act="pick" data-combat-id="${esc(a.id)}" aria-pressed="${picked ? 'true' : 'false'}">${plateRow(a)}</button>`
            : `<span class="igs-combat-plate">${plateRow(a)}<em data-tag="auto">托管</em></span>`;
        return `<figure class="igs-combat-lobby-figure" data-side="ally"${picked ? ' data-picked=""' : ''}${tint ? ` style="--igs-combat-ally-tint:${tint}"` : ''}>${portraitHtml(a.name, 'ally', pics[a.name] || '')}${plate}</figure>`;
    }).join('');
    const foes = l.enemies.flatMap((e) => Array.from({ length: Math.max(1, Math.min(LOBBY_FOE_MAX, Number(e.count) || 1)) }, () => e)).slice(0, LOBBY_FOE_MAX);
    const foeHtml = (e) => {
        const tier = e.tier || l.tier;
        return `<figure class="igs-combat-lobby-figure" data-side="enemy" data-tier="${esc(tier)}">${portraitHtml(e.name, 'enemy', pics[e.name] || '', arts[e.name] || null)}`
            + `<figcaption class="igs-combat-plate"><b>${esc(e.name)}</b>${e.templated ? '<small>模板</small>' : ''}${tier === 'boss' ? '<em data-tag="boss">首领</em>' : ''}</figcaption></figure>`;
    };
    const absent = [...l.absent, ...l.skipped];
    const n = foes.length || 1;
    // 4 名以上敌人分前后两排：前排 ceil(n/2) 人、后排其余；每排按 --k（每排最多人数）均分宽度，不按总人数压缩。后排在 DOM 前面，被前排压住下沿。
    const rows = n >= LOBBY_FOE_ROWS_AT;
    const k = rows ? Math.ceil(n / 2) : n;
    const enemies = rows ? `<div class="igs-combat-lobby-row is-back">${foes.slice(k).map(foeHtml).join('')}</div><div class="igs-combat-lobby-row is-front">${foes.slice(0, k).map(foeHtml).join('')}</div>` : foes.map(foeHtml).join('');
    const banner = `<div class="igs-combat-lobby-top"><div class="igs-combat-lobby-banner"><b class="igs-combat-lobby-name">${esc(l.encounter || '遭遇')}</b>${l.tierLabel ? `<span class="igs-combat-lobby-tier">${esc(l.tierLabel)}</span>` : ''}</div></div>`;
    return `<section class="igs-combat-lobby" data-tier="${esc(l.tier)}"${v.intro ? ' data-intro=""' : ''}>${banner}`
        + '<div class="igs-combat-lobby-stage"><span class="igs-combat-lobby-fx" aria-hidden="true"><i class="is-ally"></i><i class="is-enemy"></i></span>'
        + `<div class="igs-combat-lobby-side is-ally" style="--n:${l.allies.length || 1}">${allies}</div>`
        + `<div class="igs-combat-lobby-vs" aria-hidden="true"><b>VS</b></div>`
        + `<div class="igs-combat-lobby-side is-enemy" data-n="${n}"${rows ? ' data-rows="2"' : ''} style="--n:${n};--k:${k}">${enemies}</div></div>`
        + lobbyRewardHtml(l.reward, v.pending)
        // 倒下的队友：剧情回血前不参战，与未参战分两行列出。
        + (l.downed?.length ? `<div class="igs-combat-row igs-combat-lobby-absent" data-kind="down"><span class="igs-combat-label">倒下</span>${l.downed.map((name) => `<span class="igs-combat-chip">${esc(name)}</span>`).join('')}</div>` : '')
        + (absent.length ? `<div class="igs-combat-row igs-combat-lobby-absent"><span class="igs-combat-label">未参战</span>${absent.map((name) => `<span class="igs-combat-chip">${esc(name)}</span>`).join('')}</div>` : '')
        + `<div class="igs-combat-actions">${btn('skip', '跳过战斗', { disabled: Boolean(v.pending) })}${btn('start', '开始战斗', { primary: true, disabled: Boolean(v.pending) })}</div></section>`;
}

// 待选阶段确认钮上的用途动词（引擎 pending.kind）。
const CHOICE_VERB = Object.freeze({ discard: '弃掉', copy: '复制', 'cost-mod': '减费' });

// 敌人圆环站位：front 是面板记下的「正前方」敌人（单位 id），不在场或未给时取第一名存活敌人（都倒下取第一名）。
// 每个敌人按序号绕圆环相对正前方的角度给出：x = sin（-1..1，左负右正）、d = (1+cos)/2（1 正前方、0 最后）、z = 层序（越靠前越大）。
// 只输出无量纲数字，半径、缩放、压暗、上抬由样式层按方向取值；两名以下敌人也按 3 位圆环排，正前方居中，另一名在右。
export function ringFront(enemies, front) {
    const idx = enemies.findIndex((u) => u.id === front);
    if (idx >= 0) return idx;
    const alive = enemies.findIndex((u) => u.alive);
    return alive >= 0 ? alive : 0;
}
export function ringSlot(enemies, i, front) {
    const n = enemies.length;
    const f = ringFront(enemies, front);
    const t = ((i - f) * 2 * Math.PI) / Math.max(n, 3);
    const d = (1 + Math.cos(t)) / 2;
    return { x: Number(Math.sin(t).toFixed(3)), d: Number(d.toFixed(3)), z: Math.round(d * 100), front: i === f };
}

function battleHtml(v) {
    const b = v.battle;
    const skillPicked = isSkillSelection(v.selected);
    // 选中后可点的单位：要选目标的牌 / 技能 / 道具为可选目标；不选目标的为承受方（点其中任一个确认）。
    const picked = skillPicked ? selectedSkillView(b, v.selected) : isItemSelection(v.selected) ? selectedItemView(b, v.selected)
        : v.selected ? b.hand.find((c) => c.inst === v.selected) : null;
    const targets = new Set(picked ? (picked.targets?.length ? picked.targets : picked.affects || []) : []);
    const pickable = (u) => !b.outcome && u.alive && targets.has(u.id);
    const ended = Boolean(b.outcome);
    const pics = v.portraits || {};
    const arts = v.enemyArt || {};
    const hero = b.allies.find((u) => u.id === b.heroId) || b.allies.find((u) => u.controlled) || null;
    const mates = b.allies.filter((u) => u !== hero);
    // 待选阶段：v.chosen 为面板记下的已选候选牌（实例 ID）；回合按钮换成「弃掉 k/N」确认钮，选够张数才可点。
    const choice = b.choice || null;
    const picks = choice && Array.isArray(v.chosen) ? v.chosen : [];
    const hand = b.hand.map((c, i) => cardHtml(c, v.selected, i, b.hand.length, v.hovered, picks)).join('');
    // 风格化皮肤（view.skin 给出且不是 initial）：敌人按圆环站位，底栏的能量 / 主动特性 / 觉醒道具放进停靠区。初始方案与未给 skin 的调用方标记不变。
    const styled = Boolean(v.skin) && v.skin !== 'initial';
    const foes = b.enemies.map((u, i) => unitHtml(u, { targetable: pickable(u), portrait: pics[u.name] || '', art: arts[u.name] || null, ring: styled ? ringSlot(b.enemies, i, v.front) : null })).join('');
    const matesHtml = mates.length ? `<div class="igs-combat-side is-ally">${mates.map((u) => unitHtml(u, { targetable: pickable(u), portrait: pics[u.name] || '', size: 'sm' })).join('')}</div>` : '';
    // 旧视图没有 traits 时把人物技能当作一颗固有主动特性。
    const skillHtml = ended ? '' : traitsHtml(b.traits || (b.heroSkill ? [{ ...b.heroSkill, kind: 'active', innate: true }] : []), v.selected);
    // 能量球是装着暖色液体的圆槽：液面高度 = 当前 / 每回合（--fill），用掉多少液面就降多少，液面有波纹；「能量 x/y」只在 aria-label。
    // 能量圆标叠在主战者头像左上角；主动特性按钮在主战者头像右上方外侧（挂在头像框节点里，窄面板停靠时控制器移到停靠区）；牌堆数量在右下角回合组上方。
    const fill = Number(b.energyPerTurn) > 0 ? Math.min(1, Math.max(0, Number(b.energy) / Number(b.energyPerTurn))) : 0;
    const energy = ended ? '' : `<div class="igs-combat-energy${Number(b.energy) > 0 ? '' : ' is-empty'}" role="img" aria-label="${esc(`${v.challenge ? CHALLENGE_LABELS.energy : '能量'} ${b.energy}/${b.energyPerTurn}`)}">`
        + `<span class="igs-combat-energy-orb" style="--fill:${fill.toFixed(3)}"><i class="igs-combat-energy-liquid" aria-hidden="true"></i><b>${esc(b.energy)}</b></span></div>`;
    // 觉醒与道具都没有时不出空的控件列。
    const ctrl = ended ? '' : `${awakenHtml(b.awaken)}${itemsHtml(b.items, v.itemsOpen)}`;
    const controls = ctrl ? `<div class="igs-combat-controls">${ctrl}</div>` : '';
    const piles = `<div class="igs-combat-piles"><span>抽牌<b>${esc(b.piles.draw)}</b></span><span>弃牌<b>${esc(b.piles.discard)}</b></span></div>`;
    // 主战者一组：圆框半身像（能量在左上、主动特性圆球在右上方外侧、觉醒 / 道具在左下方圆框外沿，都挂在头像框节点里，不占一栏）；队友小圆头像排在这一组之后。
    const heroCore = `<div class="igs-combat-hero-core"><div class="igs-combat-hero-figure">${styled ? '' : energy}${hero ? unitHtml(hero, { targetable: pickable(hero), portrait: pics[hero.name] || '', size: 'lg' }) + (styled ? '' : skillHtml) : ''}${styled ? '' : controls}</div></div>`;
    // 风格化皮肤：停靠区 = 能量 + 工具组（主动特性、觉醒 / 道具、牌堆文字）；牌堆不再放在回合组里。
    const dock = styled ? `${energy}<div class="igs-combat-dock-tools"><div class="igs-combat-dock-row">${skillHtml}${controls}</div>${piles}</div>` : '';
    // --n 是我方人数（纯数字）：竖向面板按它均分我方一排的立绘宽度。
    const heroZone = `<div class="igs-combat-hero" style="--n:${b.allies.length || 1}">${heroCore}${matesHtml}</div>`;
    // 右下角回合操作组：撤退（透明底，只在允许撤退时出现）或选目标期间的取消、抽牌 / 弃牌数量、结束回合；作为底栏网格区，不压手牌。
    // 横向面板样式层竖排为撤退 / 取消、牌堆数量、结束回合；竖向 / 窄面板牌堆数量在上，撤退与结束回合同排。
    const side = v.selected || picks.length ? iconBtn('cancel', '取消', RECORD_ICONS.undo) : b.canEscape ? iconBtn('escape', v.challenge ? CHALLENGE_LABELS.escape : '撤退', RECORD_ICONS.retreat) : '';
    const turnBtn = choice ? btn('choose-confirm', `${CHOICE_VERB[choice.kind] || '选择'} ${picks.length}/${choice.count}`, { primary: true, disabled: picks.length !== choice.count })
        : iconBtn('end-turn', '结束回合', RECORD_ICONS.turnEnd, { primary: true, disabled: !b.canEndTurn });
    const turn = ended ? '' : `<div class="igs-combat-turn">${styled ? '' : piles}<div class="igs-combat-turn-btns">${side}${turnBtn}</div></div>`;
    const foot = `<footer class="igs-combat-foot${ended ? ' is-ended' : ''}">${heroZone}${ended ? '' : `<div class="igs-combat-hand">${hand}</div><div class="igs-combat-dock">${dock}</div>`}${turn}</footer>`;
    // --n / data-n 是敌人数量（纯数字）：样式层按面板宽度与数量限制每个敌人的宽度，宽屏 1–2 名敌人按面板高度放大，竖屏多敌人时不换行溢出。
    const n = b.enemies.length || 1;
    return `<section class="igs-combat-field" data-turn="${b.turn}"><div class="igs-combat-side is-enemy" data-n="${n}" style="--n:${n}">${foes}</div></section>${foot}`;
}

// 结算画面：大标题置顶；胜利时隐藏敌方，标题带放射光芒与金色粒子；败北、撤退保留敌人（不再显示意图）。我方队伍立绘一律等大，名字下是伤势，最下方「发送战报」。
// --n 是人数、--i 是粒子序号（都是纯数字）：样式层按人数均分宽度、按序号错开粒子。
const RESULT_SPARK_COUNT = 12;
// 成就牌子（荣誉击杀 / 超杀）：标题、超杀段数与台词；没有成就时不出。
const featsHtml = (list) => (list?.length
    ? `<div class="igs-combat-feats">${list.map((f) => `<div class="igs-combat-feat" data-feat="${esc(f.id)}"><b>${esc(f.title)}${f.hits ? ` <span>×${esc(f.hits)}</span>` : ''}</b><span>${esc(f.line)}</span></div>`).join('')}</div>` : '');
// 战利品翻牌（v3 §5.3）：卡背一律相同，不带稀有度与内容；翻开的牌按稀有度着色（data-rarity → --rar）。
// position 是纯数字，经 data-combat-id 回传。fresh 为本次重绘刚朝上的位置（翻面入场），struck 为本次刚被自己翻开的位置（含透视已亮出的牌）：
// struck 按稀有度出光效（data-fx 1–4），随后翻开的其余牌降一档。
const LOOT_KIND_LABELS = Object.freeze({ card: '卡牌', gear: '装备', item: '道具', keepsake: '杂物' });
const LOOT_RARITY_LABELS = Object.freeze({ common: '普通', uncommon: '罕见', rare: '稀有', epic: '史诗', mythic: '神话' });
const LOOT_FX_TIER = Object.freeze({ common: 1, uncommon: 1, rare: 2, epic: 3, mythic: 4 });
const LOOT_SPARK_COUNT = 10;
const lootTier = (c, fresh, struck) => {
    const tier = LOOT_FX_TIER[c.slot?.rarity] || 1;
    if (struck.has(c.position)) return tier;
    return fresh.has(c.position) && !c.flipped ? tier - 1 : 0;
};
const lootFxHtml = (fx) => (!fx ? '' : '<span class="igs-combat-loot-burst" aria-hidden="true"></span>'
    + (fx >= 2 ? `<span class="igs-combat-loot-sparks" aria-hidden="true">${Array.from({ length: LOOT_SPARK_COUNT }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>` : '')
    + (fx >= 3 ? '<span class="igs-combat-loot-ring" aria-hidden="true"></span>' : '')
    + (fx >= 4 ? '<span class="igs-combat-loot-pillar" aria-hidden="true"></span>' : ''));
function lootCardHtml(c, f, fresh, struck, pending) {
    const s = c.faceUp ? c.slot : null;
    const tag = s ? [LOOT_KIND_LABELS[s.kind], LOOT_RARITY_LABELS[s.rarity]].filter(Boolean).join('·') : '';
    const pos = Number(c.position);
    const isFresh = fresh.has(pos);
    const fx = lootTier(c, fresh, struck);
    // 未选定时：未翻开的牌（含透视亮出的）可翻；再翻两张都翻开后只能在翻开的两张里选。
    const act = f.done ? '' : f.needChoice ? (c.flipped ? 'choose' : '') : (c.flipped ? '' : 'flip');
    const cls = `igs-combat-loot-card${s ? ' is-face' : ''}${c.chosen ? ' is-chosen' : ''}${f.done && !c.chosen ? ' is-dim' : ''}${isFresh ? ' is-fresh' : ''}${isFresh && !c.flipped ? ' is-later' : ''}`;
    const attrs = `class="${cls}"${s?.rarity ? ` data-rarity="${esc(s.rarity)}"` : ''}${fx ? ` data-fx="${fx}"` : ''}`;
    const back = !s || isFresh ? '<span class="igs-combat-loot-back" aria-hidden="true"></span>' : '';
    const face = s ? `<span class="igs-combat-loot-face"><span class="igs-combat-loot-tag">${esc(tag)}</span><span class="igs-combat-loot-name">${esc(s.name)}</span>${s.origin ? `<span class="igs-combat-loot-origin">${esc(s.origin)}</span>` : ''}</span>` : '';
    const label = s ? `${tag ? `${tag} ` : ''}${s.name}${c.chosen ? '（已选定）' : ''}` : `第 ${pos + 1} 张`;
    const inner = `${back}${face}${lootFxHtml(fx)}`;
    if (!act) return `<div ${attrs} role="img" aria-label="${esc(label)}">${inner}</div>`;
    const actLabel = act === 'choose' ? `选择 ${label}` : s ? `翻开 ${label}` : `翻开第 ${pos + 1} 张`;
    return `<button type="button" ${attrs} data-combat-act="${act}" data-combat-id="${pos}"${pending ? ' aria-disabled="true"' : ''} aria-label="${esc(actLabel)}">${inner}</button>`;
}
// 结算的战利品区：读取中 / 读取失败只出状态行；读到后出牌，选定后才出重新抽取（金钱不足置灰，不能重抽时不出按钮）。没有 offer（status none）时不出。
function lootHtml(v) {
    const f = v.flip;
    if (!f || f.status === 'none') return '';
    if (f.status === 'loading') return '<section class="igs-combat-loot" aria-busy="true"><p class="igs-combat-state">正在读取战利品</p></section>';
    if (f.status !== 'ready') return `<section class="igs-combat-loot" data-state="error"><p class="igs-combat-state">战利品读取失败：${esc(combatReasonText(f.reason))}</p></section>`;
    const fresh = new Set(Array.isArray(f.fresh) ? f.fresh : []);
    const struck = new Set(Array.isArray(f.struck) ? f.struck : []);
    const pending = Boolean(v.pending);
    // 自己翻开神话：其余牌多停一拍再翻（样式层按 data-pause 加延迟）。
    const pause = f.cards.some((c) => struck.has(c.position) && c.slot?.rarity === 'mythic');
    const r = f.reroll;
    const reroll = f.done && r && (r.available || r.reason === 'combat-points-insufficient')
        ? btn('reroll', `重新抽取（消耗${r.cost}金钱）`, { disabled: pending || !r.available }) : '';
    return `<section class="igs-combat-loot" data-n="${f.cards.length}"${pause ? ' data-pause' : ''}><div class="igs-combat-loot-cap">战利品</div>`
        + `<div class="igs-combat-loot-row" style="--n:${f.cards.length}">${f.cards.map((c) => lootCardHtml(c, f, fresh, struck, pending)).join('')}</div>`
        + `${reroll ? `<div class="igs-combat-loot-tools">${reroll}</div>` : ''}</section>`;
}
// 有 offer 时选定战利品前不能发战报：读取中或未选定时不出发送按钮；读取失败时仍出（发送前再读一次，读不到照样拦下并提示原因）。
const lootBlocksSend = (f) => Boolean(f) && (f.status === 'loading' || (f.status === 'ready' && !f.done));

// 圆满后的收获：奖金档位与经验牌，只在结算画面显示。
function harvestHtml(e) {
    const h = e.harvest;
    if (!h) return '';
    const prize = h.prize ? `<div class="igs-challenge-harvest-row"><span class="igs-combat-label">奖金</span><b>${esc(h.prize)}</b></div>` : '';
    const card = h.card ? `<div class="igs-challenge-harvest-row" data-rarity="${esc(h.card.rarity)}"><span class="igs-combat-label">经验牌</span><b>${esc(h.card.name)}</b><small>${esc(h.card.text)}</small></div>` : '';
    return `<section class="igs-challenge-harvest">${prize}${card}</section>`;
}

function resultHtml(v) {
    const e = v.end;
    const b = v.battle;
    const pics = v.portraits || {};
    const arts = v.enemyArt || {};
    const won = e.outcome === 'victory';
    const fx = won ? `<span class="igs-combat-result-rays" aria-hidden="true"></span><span class="igs-combat-result-sparks" aria-hidden="true">${Array.from({ length: RESULT_SPARK_COUNT }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>` : '';
    const n = b.enemies.length || 1;
    const foes = won ? '' : `<div class="igs-combat-side is-enemy" data-n="${n}" style="--n:${n}">${b.enemies.map((u) => unitHtml({ ...u, intent: null }, { portrait: pics[u.name] || '', art: arts[u.name] || null })).join('')}</div>`;
    const team = e.allies.map((a) => `<figure class="igs-combat-result-figure">${portraitHtml(a.name, 'ally', pics[a.name] || '')}<figcaption><span>${esc(a.name)}</span><span>${esc(a.injury)}</span></figcaption></figure>`).join('');
    return `<section class="igs-combat-result" data-outcome="${esc(e.outcome)}"><div class="igs-combat-result-head">${fx}<div class="igs-combat-result-title">${esc(e.label)}</div></div>${featsHtml(e.feats)}${foes}`
        + `<div class="igs-combat-result-team" style="--n:${e.allies.length || 1}">${team}</div>`
        + `${harvestHtml(e)}${lootHtml(v)}<div class="igs-combat-actions">${!won && v.canRestart ? btn('restart', v.pending === 'restart' ? '重开中' : '重新开始', { disabled: Boolean(v.pending) }) : ''}${lootBlocksSend(v.flip) ? '' : btn('finish', v.pending === 'send' ? '发送中' : '发送战报', { primary: true, disabled: Boolean(v.pending) })}</div></section>`;
}
// 风格化皮肤的结算：照搬设计稿的结算版式（combat-stage-fx.js），战利品与按钮放在下方可点区；初始方案仍用 resultHtml。
function stageResultHtml(v) {
    const won = v.end.outcome === 'victory';
    const order = [...v.battle.allies].sort((a, c) => Number(c.controlled) - Number(a.controlled)).map((u) => u.name);
    const actions = `<div class="igs-combat-actions">${!won && v.canRestart ? btn('restart', v.pending === 'restart' ? '重开中' : '重新开始', { disabled: Boolean(v.pending) }) : ''}${lootBlocksSend(v.flip) ? '' : btn('finish', v.pending === 'send' ? '发送中' : '发送战报', { primary: true, disabled: Boolean(v.pending) })}</div>`;
    return resultStageHtml({ skin: v.skin, orient: v.orient === 'land' ? 'land' : 'port', end: v.end, order, pics: v.portraits || {}, ui: `${harvestHtml(v.end)}${lootHtml(v)}${actions}`, esc });
}
// 对局中的「重新开始」：标题栏图标钮，点一次换成「确认重新开始 / 取消」，再点才放弃本局从头打。
const restartCtl = (v) => (v.restartArmed
    ? `<span class="igs-combat-restart">${btn('restart', v.pending === 'restart' ? '重开中' : '确认重新开始', { primary: true, disabled: Boolean(v.pending) })}${btn('restart-cancel', '取消', { disabled: Boolean(v.pending) })}</span>`
    : `<span class="igs-combat-restart">${iconBtn('restart', '重新开始', RECORD_ICONS.restart, { disabled: Boolean(v.pending) })}</span>`);

function rewardHtml(r, pending) {
    if (!r) return '';
    const cards = r.cards.map((c) => btn('reward', `${c.name}·${c.cost}`, { id: `card:${c.cardId}`, disabled: Boolean(pending) })).join('');
    const ups = r.upgrades.map((u) => btn('reward', `升级 ${u.name}`, { id: `upgrade:${u.targetId}`, disabled: Boolean(pending) })).join('');
    return `<section class="igs-combat-reward" data-level="${r.level}"><div class="igs-combat-label">${esc(r.name)} 升至 Lv${r.level}</div>`
        + `<div class="igs-combat-row">${cards}</div>${ups ? `<div class="igs-combat-row">${ups}</div>` : ''}`
        + `<div class="igs-combat-actions">${btn('reward', '跳过', { id: 'skip', disabled: Boolean(pending) })}</div></section>`;
}

// 阻断：跳过或重试；数据库表原因的「重试」先补建表再准备（combat-panel.js retryPrepare）。
function blockedHtml(v) {
    return `<div class="igs-combat-actions">${v.challenge ? '' : btn('skip', '跳过战斗', { disabled: Boolean(v.pending) })}${btn('retry-prepare', '重试', { primary: true, disabled: Boolean(v.pending) })}</div>`;
}

// 九套画布皮肤的版面固定在各自文件里：日常挑战只在输出上替换几处用户可见的战斗词，限定在带引号或尖括号的完整词与固定句式，事件名等正文不受影响。
const CANVAS_WORDS = Object.freeze([
    [/(["'>])撤退(["'<])/g, `$1${CHALLENGE_LABELS.escape}$2`], [/格挡 <b>/g, `${CHALLENGE_LABELS.block} <b>`],
    [/点伤害/g, `点${CHALLENGE_LABELS.damage}`], [/点能量/g, `点${CHALLENGE_LABELS.energy}`], [/能量 (\d+\/\d+)/g, `${CHALLENGE_LABELS.energy} $1`],
]);
const challengeCanvasText = (html) => CANVAS_WORDS.reduce((out, [pattern, text]) => out.replace(pattern, text), String(html));

// 挑战记录：由聊天里的战报楼只读推导，最近的在前。
const OUTCOME_ORDER = Object.freeze(['圆满', '勉强', '失败', '放弃']);
function historyHtml(v) {
    const h = v.history;
    if (!h) return '<p class="igs-combat-state">没有可读取的记录</p>';
    const st = h.stats;
    const summary = `<div class="igs-combat-row"><span class="igs-combat-label">总计</span><span class="igs-combat-chip">${esc(st.total)}次</span>${OUTCOME_ORDER.map((name) => `<span class="igs-combat-chip">${name} ${esc(st.byOutcome[name])}</span>`).join('')}<span class="igs-combat-chip">最长连胜 ${esc(st.bestStreak)}</span></div>`;
    const earned = new Set((h.achievements || []).map((item) => item.id));
    const feats = `<div class="igs-combat-row igs-challenge-feats"><span class="igs-combat-label">成就</span>${Object.entries(CHALLENGE_ACHIEVEMENTS).map(([id, name]) => `<span class="igs-combat-chip" data-earned="${earned.has(id) ? 'true' : 'false'}">${esc(name)}</span>`).join('')}</div>`;
    const rows = h.entries.slice().reverse().map((e) => `<li class="igs-challenge-history-row" data-outcome="${esc(e.outcome)}"><b>${esc(e.event || '挑战')}</b><span>${esc([e.tier, e.domain].filter(Boolean).join(' · '))}</span><em>${esc(e.outcome)}</em><small>第${esc(e.floor)}楼</small></li>`).join('');
    const list = h.entries.length ? `<ol class="igs-challenge-history">${rows}</ol>` : '<p class="igs-combat-state">还没有挑战记录</p>';
    return `${summary}${feats}${list}<div class="igs-combat-actions">${v.status === 'idle' ? '' : btn('history', '返回', { primary: true })}</div>`;
}

const COMBAT_STATUS_LINE = Object.freeze({
    unavailable: '战斗会话不可用', idle: '', preparing: '正在准备战斗', skipped: '已跳过战斗', stale: '',
    done: '战报已发送', 'send-failed': '战报未发送',
});

const CHALLENGE_STATUS_LINE = Object.freeze({ ...COMBAT_STATUS_LINE, unavailable: '挑战会话不可用', preparing: '正在准备挑战', skipped: '已放弃挑战' });

// 照搬概念稿的皮肤：战斗中画面换成该套的固定画布（标题栏、行动顺序都在画布里），其余阶段沿用下面的标记。

export function renderCombatPanelHtml(v) {
    const status = v.status;
    const STATUS_LINE = v.challenge ? CHALLENGE_STATUS_LINE : COMBAT_STATUS_LINE;
    if (isCanvasSkin(v.skin) && CANVAS_BATTLE[v.skin] && v.battle && v.pending !== 'prepare' && (status === 'battle' || (status === 'ended' && v.settling))) {
        const canvas = CANVAS_BATTLE[v.skin](v, v.orient === 'land' ? 'land' : 'port');
        return `${noticeHtml(v.notice)}${v.challenge ? challengeCanvasText(canvas) : canvas}`;
    }
    if (stageFxStyle(v.skin) && status === 'ended' && v.battle && v.end && !v.settling && v.pending !== 'prepare') return `${noticeHtml(v.notice)}${stageResultHtml(v)}`;
    let main = '';
    if (v.historyOpen) main = historyHtml(v);
    // 准备进行中优先显示，不被上一次的阻塞原因遮挡（重试期间状态仍是 blocked）。
    else if (v.pending === 'prepare') main = `<p class="igs-combat-state" aria-busy="true">${STATUS_LINE.preparing}</p>`;
    else if (status === 'lobby' && v.lobby) main = lobbyHtml(v);
    // 结束后先按战斗画面播完最后一段演出（settling），再换成结算画面。
    else if (status === 'ended' && v.battle && v.end && !v.settling) main = resultHtml(v);
    else if ((status === 'battle' || status === 'ended') && v.battle) main = battleHtml(v);
    else if (status === 'blocked') main = `<p class="igs-combat-state">${esc(combatReasonText(v.reason))}${v.cause ? `：${esc(generationCauseText(v.cause))}` : ''}</p>${blockedHtml(v)}`;
    else if (status === 'stale') main = `<p class="igs-combat-state">${esc(combatReasonText(v.reason))}</p>`;
    else if (status === 'send-failed') main = `<p class="igs-combat-state">${STATUS_LINE['send-failed']}</p>${lootHtml(v)}<div class="igs-combat-actions">${lootBlocksSend(v.flip) ? '' : btn('retry-send', v.pending === 'send' ? '发送中' : '重新发送', { primary: true, disabled: Boolean(v.pending) })}</div>`;
    else if (status === 'done') main = `<p class="igs-combat-state">${STATUS_LINE.done}</p>${rewardHtml(v.rewards, v.pending)}`;
    else if (status === 'preparing') main = `<p class="igs-combat-state" aria-busy="true">${STATUS_LINE.preparing}</p>`;
    else main = STATUS_LINE[status] ? `<p class="igs-combat-state">${STATUS_LINE[status]}</p>` : '';
    // 状态行已经说明同一原因时不再重复提示条。
    const notice = v.notice && !((status === 'blocked' || status === 'stale') && v.notice === combatReasonText(v.reason)) ? v.notice : '';
    const track = status === 'battle' && v.battle && !v.battle.outcome ? trackHtml(v.battle, v.portraits || {}, v.enemyArt || {}) : '';
    const restart = status === 'battle' && v.battle && !v.battle.outcome && v.canRestart ? restartCtl(v) : '';
    // 战前由斜切横幅显示遭遇名，标题栏退回默认标题；对局中标题后是回合横幅。
    const lobbyDrawn = status === 'lobby' && Boolean(v.lobby) && v.pending !== 'prepare';
    const round = status === 'battle' && v.battle && !v.battle.outcome ? Number(v.battle.turn) || 0 : 0;
    const speed = (status === 'battle' || (status === 'ended' && v.settling)) && v.battle ? v.fxSpeed || 1 : 0;
    return `${head(lobbyDrawn ? '' : v.encounter, track + restart, round, speed, v.challenge === true)}${noticeHtml(notice)}<div class="igs-combat-main" data-status="${esc(status)}">${main}</div>`;
}

