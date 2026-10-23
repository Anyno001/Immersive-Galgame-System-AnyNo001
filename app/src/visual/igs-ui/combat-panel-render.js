import { esc } from './reader-value-utils.js';
import { portraitSilhouetteSvg } from './combat-card-art.js';

// 战斗面板的 HTML 片段：只输出字段、状态、错误与操作确认；动作统一走 data-combat-act / data-combat-id。
const REASON_TEXT = Object.freeze({
    'combat-busy': '上一步还在进行中',
    'combat-session-not-ready': '战斗尚未就绪',
    'combat-session-unavailable': '战斗会话不可用',
    'combat-floor-missing': '开战楼不存在',
    'combat-start-missing': '这一楼没有开战标签',
    'combat-floor-changed': '开战楼已改动或切换了分支，本场战斗作废',
    'combat-user-name-missing': '未读取到主角名',
    'combat-table-missing': '数据库中没有战斗表',
    'combat-table-host-unsupported': '未检测到数据库（shujuku）',
    'combat-table-confirm-required': '需要先确认建表',
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
    'combat-reply-not-json': '副 LLM 回复无法解析',
    'combat-send-error': '战报发送出错',
    'combat-entry-invalid': '记录格式无效',
    'combat-outbox-save-failed': '战报暂存失败，未发送',
    'combat-report-send-failed': '战报发送失败',
    'combat-send-unavailable': '当前无法发送消息',
    'combat-skip-send-failed': '发送失败',
    'combat-rules-version-mismatch': '战斗规则已更新，旧进度无法继续',
    'combat-replay-failed': '战斗进度无法恢复',
    'combat-card-unplayable': '能量不足或当前不能出这张牌',
    'combat-target-invalid': '目标无效',
    'combat-reward-unavailable': '没有可领取的奖励',
    'combat-reward-duplicate': '该等级奖励已领取',
    'combat-reward-choice-invalid': '选项无效',
    'request-stale': '准备已取消',
    'combat-action-threw': '操作出错',
    'not-player-phase': '现在不是我方回合',
    'battle-ended': '战斗已结束',
});

export function combatReasonText(reason) {
    return REASON_TEXT[reason] || (reason ? `操作失败（${reason}）` : '');
}

const btn = (act, label, { id = '', primary = false, disabled = false } = {}) =>
    `<button type="button" class="igs-combat-btn${primary ? ' is-primary' : ''}" data-combat-act="${esc(act)}"${id ? ` data-combat-id="${esc(id)}"` : ''}${disabled ? ' aria-disabled="true"' : ''}>${esc(label)}</button>`;

const head = (title) => `<header class="igs-combat-head"><span class="igs-combat-title">${esc(title || '卡牌战斗')}</span>${btn('close', '关闭')}</header>`;

const noticeHtml = (text) => (text ? `<p class="igs-combat-notice" role="alert">${esc(text)}</p>` : '');

const hpBar = (u) => {
    const pct = u.maxHp ? Math.round((u.hp / u.maxHp) * 100) : 0;
    return `<div class="igs-combat-hp" style="--igs-combat-hp:${pct}%"><i></i><span>${u.hp}/${u.maxHp}</span></div>`;
};

const statusesHtml = (list) => (list.length
    ? `<div class="igs-combat-statuses">${list.map((s) => `<span data-status="${esc(s.key)}">${esc(s.label)} ${s.stacks}</span>`).join('')}</div>` : '');

// 立绘：素材库有图时用 <img>（地址已经 safePortraitUrl 过滤），否则用程序剪影。
const portraitHtml = (name, side, url) => `<div class="igs-combat-portrait" data-side="${esc(side)}">${url
    ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : portraitSilhouetteSvg(name, side)}</div>`;

function unitHtml(u, { targetable = false, portrait = '' } = {}) {
    const intent = u.intent ? `<div class="igs-combat-intent" data-intent="${esc(u.intent.kind)}">${esc(u.intent.label)}·${esc(u.intent.name)}${u.intent.damage ? ` ${u.intent.damage}` : ''}</div>` : '';
    const block = u.block ? `<span class="igs-combat-block">格挡 ${u.block}</span>` : '';
    const attrs = targetable ? ` data-combat-act="target" data-combat-id="${esc(u.id)}" role="button" tabindex="0"` : '';
    return `<div class="igs-combat-unit${u.alive ? '' : ' is-down'}${u.controlled ? ' is-controlled' : ''}${targetable ? ' is-targetable' : ''}" data-unit="${esc(u.id)}"${attrs}>`
        + portraitHtml(u.name, u.side, portrait)
        + `<div class="igs-combat-unit-info"><div class="igs-combat-unit-name">${esc(u.name)}${block}</div>${hpBar(u)}${statusesHtml(u.statuses)}${intent}</div></div>`;
}

// 握牌扇形：以手牌中点为轴，越靠两侧旋转越大、位置越低；张数越多每张的角度越小。只输出数值，不含档案文本。
function fanStyle(i, n) {
    const d = i - (n - 1) / 2;
    const step = n > 1 ? Math.min(7, 36 / (n - 1)) : 0;
    const rot = d * step;
    return `--fan-r:${rot.toFixed(1)}deg;--fan-y:${Math.round(rot * rot * 0.1)}px;--fan-n:${n}`;
}

function cardHtml(c, selected, i = 0, n = 1) {
    const cls = `igs-combat-card${c.playable ? '' : ' is-disabled'}${selected === c.inst ? ' is-selected' : ''}${c.upgraded ? ' is-upgraded' : ''}`;
    // 卡图 SVG 由 combat-card-art 只用程序常量与数值生成，不含档案文本，可直接拼入。
    return `<button type="button" class="${cls}" style="${fanStyle(i, n)}" data-combat-act="card" data-combat-id="${esc(c.inst)}" data-card-type="${esc(c.type)}"${c.playable ? '' : ' aria-disabled="true"'} aria-label="${esc(`${c.name} ${c.cost} 费 ${c.text || ''}`)}">`
        + `<span class="igs-combat-card-cost">${esc(c.cost)}</span><span class="igs-combat-card-name">${esc(c.name)}${c.upgraded ? '+' : ''}</span>`
        + `<span class="igs-combat-card-art">${c.art || ''}</span><span class="igs-combat-card-type">${esc(c.typeLabel || '')}</span>`
        + `<span class="igs-combat-card-text">${esc(c.text || '')}</span></button>`;
}

function lobbyHtml(v) {
    const l = v.lobby;
    const pics = (v.portraits || {});
    const roster = [...l.allies.map((a) => ({ name: a.name, side: 'ally' })), ...l.enemies.map((e) => ({ name: e.name, side: 'enemy' }))]
        .map((u) => `<figure class="igs-combat-lobby-figure" data-side="${u.side}">${portraitHtml(u.name, u.side, pics[u.name] || '')}<figcaption>${esc(u.name)}</figcaption></figure>`).join('');
    const allies = l.allies.map((a) => (a.controllable
        ? btn('pick', `${a.name} Lv${a.level}`, { id: a.id, primary: v.controlledId === a.id })
        : `<span class="igs-combat-chip">${esc(a.name)} Lv${a.level}·托管</span>`)).join('');
    const enemies = l.enemies.map((e) => `<span class="igs-combat-chip">${esc(e.name)}${e.count > 1 ? ` ×${e.count}` : ''}${e.templated ? '·模板' : ''}</span>`).join('');
    const absent = [...l.absent, ...l.skipped];
    return `<section class="igs-combat-lobby"><div class="igs-combat-lobby-stage">${roster}</div><div class="igs-combat-row"><span class="igs-combat-label">我方</span>${allies}</div>`
        + `<div class="igs-combat-row"><span class="igs-combat-label">敌方</span>${enemies}</div>`
        + (absent.length ? `<div class="igs-combat-row"><span class="igs-combat-label">未参战</span>${absent.map((n) => `<span class="igs-combat-chip">${esc(n)}</span>`).join('')}</div>` : '')
        + `<div class="igs-combat-actions">${btn('skip', '跳过卡牌战斗', { disabled: Boolean(v.pending) })}${btn('start', '开始战斗', { primary: true, disabled: Boolean(v.pending) })}</div></section>`;
}

function battleHtml(v) {
    const b = v.battle;
    const targets = v.selected ? new Set(b.hand.find((c) => c.inst === v.selected)?.targets || []) : new Set();
    const ended = Boolean(b.outcome);
    const hand = b.hand.map((c, i) => cardHtml(c, v.selected, i, b.hand.length)).join('');
    const foot = ended ? '' : `<footer class="igs-combat-foot"><div class="igs-combat-energy" aria-label="能量">${b.energy}/${b.energyPerTurn}</div>`
        + `<div class="igs-combat-hand">${hand}</div><div class="igs-combat-piles"><span>抽牌 ${b.piles.draw}</span><span>弃牌 ${b.piles.discard}</span></div>`
        + `<div class="igs-combat-actions">${v.selected ? btn('cancel', '取消') : ''}${b.canEscape ? btn('escape', '撤退') : ''}${btn('end-turn', '结束回合', { primary: true, disabled: !b.canEndTurn })}</div></footer>`;
    const pics = v.portraits || {};
    return `<section class="igs-combat-field" data-turn="${b.turn}"><div class="igs-combat-side is-ally">${b.allies.map((u) => unitHtml(u, { portrait: pics[u.name] || '' })).join('')}</div>`
        + `<div class="igs-combat-side is-enemy">${b.enemies.map((u) => unitHtml(u, { targetable: !ended && u.alive && targets.has(u.id), portrait: pics[u.name] || '' })).join('')}</div></section>${foot}`;
}

function endHtml(v) {
    const e = v.end;
    const allies = e.allies.map((a) => `<span class="igs-combat-chip">${esc(a.name)}·${esc(a.injury)}</span>`).join('');
    return `<section class="igs-combat-end" data-outcome="${esc(e.outcome)}"><div class="igs-combat-end-label">${esc(e.label)}</div>`
        + `<div class="igs-combat-row">${allies}</div><div class="igs-combat-actions">${btn('finish', v.pending === 'send' ? '发送中' : '发送战报', { primary: true, disabled: Boolean(v.pending) })}</div></section>`;
}

function rewardHtml(r, pending) {
    if (!r) return '';
    const cards = r.cards.map((c) => btn('reward', `${c.name}·${c.cost}`, { id: `card:${c.cardId}`, disabled: Boolean(pending) })).join('');
    const ups = r.upgrades.map((u) => btn('reward', `升级 ${u.name}`, { id: `upgrade:${u.targetId}`, disabled: Boolean(pending) })).join('');
    return `<section class="igs-combat-reward" data-level="${r.level}"><div class="igs-combat-label">${esc(r.name)} 升至 Lv${r.level}</div>`
        + `<div class="igs-combat-row">${cards}</div>${ups ? `<div class="igs-combat-row">${ups}</div>` : ''}`
        + `<div class="igs-combat-actions">${btn('reward', '跳过', { id: 'skip', disabled: Boolean(pending) })}</div></section>`;
}

function blockedHtml(v) {
    if (v.reason === 'combat-table-missing' || v.reason === 'combat-table-confirm-required') {
        const confirm = v.confirming === 'tables'
            ? `${btn('cancel', '取消')}${btn('create-tables', '确认创建', { primary: true, disabled: Boolean(v.pending) })}`
            : btn('confirm-tables', '在数据库中创建战斗表', { primary: true });
        return `<div class="igs-combat-actions">${confirm}</div>`;
    }
    return `<div class="igs-combat-actions">${btn('skip', '跳过卡牌战斗', { disabled: Boolean(v.pending) })}${btn('retry-prepare', '重试', { primary: true, disabled: Boolean(v.pending) })}</div>`;
}

const STATUS_LINE = Object.freeze({
    unavailable: '战斗会话不可用', idle: '', preparing: '正在准备战斗', skipped: '已跳过卡牌战斗', stale: '',
    done: '战报已发送', 'send-failed': '战报未发送',
});

export function renderCombatPanelHtml(v) {
    const status = v.status;
    let main = '';
    if (status === 'lobby' && v.lobby) main = lobbyHtml(v);
    else if ((status === 'battle' || status === 'ended') && v.battle) main = battleHtml(v) + (status === 'ended' && v.end ? endHtml(v) : '');
    else if (status === 'blocked') main = `<p class="igs-combat-state">${esc(combatReasonText(v.reason))}</p>${blockedHtml(v)}`;
    else if (status === 'stale') main = `<p class="igs-combat-state">${esc(combatReasonText(v.reason))}</p>`;
    else if (status === 'send-failed') main = `<p class="igs-combat-state">${STATUS_LINE['send-failed']}</p><div class="igs-combat-actions">${btn('retry-send', v.pending === 'send' ? '发送中' : '重新发送', { primary: true, disabled: Boolean(v.pending) })}</div>`;
    else if (status === 'done') main = `<p class="igs-combat-state">${STATUS_LINE.done}</p>${rewardHtml(v.rewards, v.pending)}`;
    else if (status === 'preparing' || v.pending === 'prepare') main = `<p class="igs-combat-state" aria-busy="true">${STATUS_LINE.preparing}</p>`;
    else main = STATUS_LINE[status] ? `<p class="igs-combat-state">${STATUS_LINE[status]}</p>` : '';
    // 状态行已经说明同一原因时不再重复提示条。
    const notice = v.notice && !((status === 'blocked' || status === 'stale') && v.notice === combatReasonText(v.reason)) ? v.notice : '';
    return `${head(v.encounter)}${noticeHtml(notice)}<div class="igs-combat-main" data-status="${esc(status)}">${main}</div>`;
}

