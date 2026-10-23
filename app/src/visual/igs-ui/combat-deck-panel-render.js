import { esc } from './reader-value-utils.js';
import { combatReasonText } from './combat-panel-render.js';

// 卡组构筑面板的 HTML：动作走 data-deck-act / data-deck-id；只输出字段、状态、错误与操作确认。
const REASON_TEXT = Object.freeze({
    'combat-deck-invalid': '卡组不合规，不能保存',
    'combat-deck-readonly': '战斗进行中，卡组只读',
    'combat-deck-no-floor': '当前聊天没有楼层，无法保存卡组',
    'combat-profile-exists': '该角色已有卡组档案',
    'combat-generate-unavailable': '当前无法生成卡组档案',
    'combat-deck-generation-failed': '卡组档案生成失败',
    'combat-profile-unverified': '档案写入后未能读回确认',
    'combat-disabled': '卡牌战斗未开启',
    'combat-growth-incomplete': '部分成长未能整理，可稍后重试',
});
export const deckReasonText = (reason) => REASON_TEXT[reason] || combatReasonText(reason);
const CARD_ERROR = Object.freeze({ 'copy-limit': '同名超过上限', 'not-owned': '未拥有', 'owned-exceeded': '超过拥有数', 'unknown-card': '图鉴中没有' });

const btn = (act, label, { id = '', primary = false, disabled = false, pressed = null } = {}) =>
    `<button type="button" class="igs-deck-btn${primary ? ' is-primary' : ''}" data-deck-act="${esc(act)}"${id ? ` data-deck-id="${esc(id)}"` : ''}${pressed === null ? '' : ` aria-pressed="${pressed}"`}${disabled ? ' aria-disabled="true"' : ''}>${esc(label)}</button>`;
const row = (label, body) => `<div class="igs-deck-row"><span class="igs-deck-label">${esc(label)}</span>${body}</div>`;
const chip = (text) => `<span class="igs-deck-chip">${esc(text)}</span>`;
const expText = (d) => (d.next ? `Lv${d.level} · ${d.into}/${d.next}` : `Lv${d.level} · 满级`);

function rosterHtml(v) {
    return `<nav class="igs-deck-roster" aria-label="角色">${v.roster.map((r) => btn('select', `${r.name}　${r.kindLabel} · ${expText(r)}${r.needsAdjust ? ' · 需调整' : ''}`, { id: r.id, pressed: r.id === v.selectedId })).join('')}</nav>`;
}

const PENDING_KIND = Object.freeze({ learn: '习得', upgrade: '精进', class: '转职' });

function cardRow(c, readonly) {
    const err = c.errors.length ? `<span class="igs-deck-err">${esc(c.errors.map((r) => CARD_ERROR[r] || r).join('、'))}</span>` : '';
    const up = c.upgraded ? ` · 已升级 ${c.upgraded}` : '';
    return `<li class="igs-deck-card${c.errors.length ? ' is-error' : ''}" data-card-type="${esc(c.type)}"><span class="igs-deck-cost">${esc(c.cost)}</span>`
        + `<span class="igs-deck-name">${esc(c.name)}</span><span class="igs-deck-count">${c.inDeck}/${c.owned}${up}</span>${err}`
        + (readonly ? '' : `${btn('remove', '移出', { id: c.cardId, disabled: c.inDeck === 0 })}${btn('add', '加入', { id: c.cardId, disabled: !c.canAdd })}`)
        + '</li>';
}

function deckHtml(v, d) {
    const c = d.check;
    const sizeBad = c.errors.some((e) => e.reason === 'deck-too-small' || e.reason === 'deck-too-large');
    const summary = `<span class="igs-deck-size${c.ok ? '' : ' is-error'}" role="status">${c.size} 张 · ${c.min}–${c.max}${sizeBad ? ' · 张数不符' : ''}${c.ok ? '' : ' · 不合规'}</span>`;
    const actions = v.readonly ? chip('战斗进行中 · 只读')
        : `${btn('reset', '还原', { disabled: !d.dirty || Boolean(v.pending) })}${btn('save', v.pending === 'save' ? '保存中' : '保存卡组', { primary: true, disabled: !d.dirty || !c.ok || Boolean(v.pending) })}`;
    return `<section class="igs-deck-build">${row('卡组', summary)}<ul class="igs-deck-cards">${d.owned.map((x) => cardRow(x, v.readonly)).join('')}</ul><div class="igs-deck-actions">${actions}</div></section>`;
}

function generateHtml(v, d) {
    if (v.readonly) return '';
    const g = v.generate;
    if (!g || g.id !== d.id) return `<div class="igs-deck-actions">${btn('generate-open', '为该角色生成卡组档案', { id: d.id, disabled: Boolean(v.pending) })}</div>`;
    const classes = v.classes.length
        ? row('职业', v.classes.map((c) => btn('generate-class', `沿用 ${c.name}`, { id: c.id, pressed: g.classRef === c.id })).join('') + btn('generate-class', '新职业', { pressed: !g.classRef }))
        : '';
    return `<div class="igs-deck-generate">${classes}${g.classRef ? row('', chip('沿用已有职业特性')) : ''}`
        + `<div class="igs-deck-actions">${btn('cancel', '取消')}${btn('generate', v.pending === 'generate' ? '生成中' : '确认生成', { primary: true, disabled: Boolean(v.pending) })}</div></div>`;
}

function detailHtml(v) {
    const d = v.detail;
    if (!d) return '';
    const head = row(d.name, chip(expText(d)) + (d.className ? chip(d.className) : '') + (d.hpMax ? chip(`HP ${d.hpMax}`) : ''));
    if (d.kind === 'skill-character') {
        return `<section class="igs-deck-detail">${head}${row('技能', d.skills.map((s) => chip(s.name)).join(''))}`
            + `${d.passives.length ? row('被动', d.passives.map((p) => chip(p.name)).join('')) : ''}${generateHtml(v, d)}</section>`;
    }
    const passives = [d.classPassive && chip(`职业 · ${d.classPassive.name}`), d.personalPassive && chip(`个人 · ${d.personalPassive.name}`)].filter(Boolean).join('');
    return `<section class="igs-deck-detail">${head}${passives ? row('被动', passives) : ''}${deckHtml(v, d)}</section>`;
}

function pendingHtml(v) {
    const parts = [];
    const items = v.pendingGeneration || [];
    if (items.length) {
        const list = items.map((p) => chip(`${p.character || p.characterId || ''} · ${PENDING_KIND[p.kind] || p.kind}${p.skill || p.className ? ` ${p.skill || p.className}` : ''}`)).join('');
        parts.push(row('待整理', list + (v.readonly ? '' : btn('retry-growth', v.pending === 'growth' ? '整理中' : '重试', { disabled: Boolean(v.pending) }))));
    }
    if (v.sendFailed) parts.push(row('战报', chip('未发送') + btn('retry-send', v.pending === 'send' ? '发送中' : '重新发送', { primary: true, disabled: Boolean(v.pending) })));
    return parts.length ? `<section class="igs-deck-pending">${parts.join('')}</section>` : '';
}

const STATE_TEXT = Object.freeze({ loading: '正在读取', unavailable: '卡牌战斗不可用' });

export function renderCombatDeckPanelHtml(v) {
    const head = `<header class="igs-deck-head"><span class="igs-deck-title">战斗</span>${btn('close', '关闭')}</header>`;
    const notice = v.notice ? `<p class="igs-deck-notice" role="alert">${esc(v.notice)}</p>` : '';
    let main;
    if (v.status === 'error') main = `<p class="igs-deck-state">${esc(deckReasonText(v.reason))}</p><div class="igs-deck-actions">${btn('reload', '重试', { primary: true })}</div>`;
    else if (v.status !== 'ready') main = `<p class="igs-deck-state"${v.status === 'loading' ? ' aria-busy="true"' : ''}>${esc(STATE_TEXT[v.status] || '')}</p>`;
    else if (!v.roster.length) main = `<p class="igs-deck-state">还没有角色档案</p>${pendingHtml(v)}`;
    else main = `${pendingHtml(v)}<div class="igs-deck-layout">${rosterHtml(v)}${detailHtml(v)}</div>`;
    return `${head}${notice}<div class="igs-deck-main" data-status="${esc(v.status)}">${main}</div>`;
}

