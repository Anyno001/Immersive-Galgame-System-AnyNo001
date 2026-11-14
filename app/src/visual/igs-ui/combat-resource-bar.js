// 规则 v5 主战者资源条（法珠与专注、心境与乐势、圣辉、锻造、随从）：初始方案与九套画布皮肤共用这份标记。
// 每项是图形加数值，名称与机制说明在 data-scale-tip（悬停或点按弹出）与 aria-label；外壳类由调用方传入（画布皮肤传自己的状态片类），底色、字号与颜色随皮肤。
import { esc } from './reader-value-utils.js';
import { RESOURCE_TIPS } from './combat-status-tips.js';

const GLYPHS = Object.freeze({
    focus: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/>',
    radiance: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    forge: '<path d="M4 8.5h9l5-2.5v6l-5-1.5h-2V15h3v4H7v-4h3v-4.5H4z"/>',
    minion: '<path d="M7 20v-8a5 5 0 0 1 10 0v8l-2.5-1.5L12 20l-2.5-1.5z"/><path d="M10 11.5h.01M14 11.5h.01"/>',
    neutral: '<circle cx="12" cy="12" r="7"/>',
    calm: '<path d="M3 10c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0M3 15c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0"/>',
    wrath: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2.5-5.5 1 1.5 1.5 2 2.5 2.5V3z"/>',
    divinity: '<path d="M4 17h16l-1.5-9-4 4L12 6l-2.5 6-4-4z"/>',
});
const ORB_GLYPHS = Object.freeze({
    lightning: 'M9 2.8 5 9h3l-1 4.2L11 7H8z', frost: 'M8 3.5v9M4.1 5.8l7.8 4.4M4.1 10.2l7.8-4.4', dark: 'M10 4.2a4 4 0 1 0 0 7.6 3.2 3.2 0 0 1 0-7.6z',
    plasma: 'M8 3.6l1.2 3.1h3.2L9.8 8.6l1 3.2L8 9.9l-2.8 1.9 1-3.2-2.6-1.9h3.2z', glass: 'M8 3.6 11.4 8 8 12.4 4.6 8z',
});
const ORB_NAMES = Object.freeze({ lightning: '雷珠', frost: '霜珠', dark: '蚀珠', plasma: '源珠', glass: '晶珠' });
const STANCE_NAMES = Object.freeze({ neutral: '中立', calm: '静心', wrath: '怒意', divinity: '神临' });
export const MOMENTUM_GOAL = 10;

const icon = (key) => `<svg class="cx-res-ico" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[key]}</svg>`;
const orbHtml = (o) => (o
    ? `<svg class="cx-orb" data-orb="${esc(o.kind)}" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7.5"/><path d="${ORB_GLYPHS[o.kind]}"/></svg>`
    : '<svg class="cx-orb" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/></svg>');

// r 为面板视图的 res（combat-panel-model.js 的 resourceView）；没有可显示资源时返回空串。
export function resourceBarHtml(r, { row = 'igs-combat-res', item = 'igs-combat-res-item' } = {}) {
    if (!r) return '';
    const cell = (key, label, body, attrs = '', tips = [RESOURCE_TIPS[key]]) => {
        const text = [label, ...tips.filter(Boolean)].join('\n');
        return `<span class="${item} cx-res" data-res="${key}"${attrs} role="img" tabindex="0" aria-label="${esc(text)}" data-scale-tip="${esc(text)}">${body}</span>`;
    };
    const parts = [];
    const focus = r.focus !== undefined ? `${icon('focus')}<b>${esc(r.focus)}</b>` : '';
    if (r.orbs) {
        const names = r.orbs.list.map((o) => ORB_NAMES[o.kind]).join('、');
        const label = `法珠 ${r.orbs.list.length}/${r.orbs.slots}${names ? `：${names}` : ''}${r.focus !== undefined ? `，专注 ${r.focus}` : ''}`;
        const kinds = [...new Set(r.orbs.list.map((o) => o.kind))].map((kind) => RESOURCE_TIPS[`orb:${kind}`]);
        const tips = [RESOURCE_TIPS.orbs, ...(r.focus !== undefined ? [RESOURCE_TIPS.focus] : []), ...kinds];
        parts.push(cell('orbs', label, `<span class="cx-orbs">${Array.from({ length: r.orbs.slots }, (_, i) => orbHtml(r.orbs.list[i])).join('')}</span>${focus}`, '', tips));
    } else if (focus) parts.push(cell('focus', `专注 ${r.focus}`, focus));
    if (r.stance) {
        const pips = r.momentum !== undefined ? `<span class="cx-pips">${Array.from({ length: MOMENTUM_GOAL }, (_, i) => `<i${i < r.momentum ? ' class="is-on"' : ''}></i>`).join('')}</span>` : '';
        const label = `心境 ${STANCE_NAMES[r.stance]}${r.momentum !== undefined ? `，乐势 ${r.momentum}/${MOMENTUM_GOAL}` : ''}`;
        const tips = [RESOURCE_TIPS[`stance:${r.stance}`], ...(r.momentum !== undefined ? [RESOURCE_TIPS.momentum] : [])];
        parts.push(cell('stance', label, `${icon(r.stance)}${pips}`, ` data-stance="${esc(r.stance)}"`, tips));
    }
    if (r.radiance !== undefined) parts.push(cell('radiance', `圣辉 ${r.radiance}`, `${icon('radiance')}<b>${esc(r.radiance)}</b>`));
    if (r.forge !== undefined) parts.push(cell('forge', `锻造 ${r.forge}`, `${icon('forge')}<b>${esc(r.forge)}</b>`));
    if (r.minion) {
        const pct = Math.round((r.minion.hp / r.minion.maxHp) * 100);
        parts.push(cell('minion', `随从 ${r.minion.hp}/${r.minion.maxHp}`, `${icon('minion')}<span class="cx-res-hp" style="--p:${pct}%"><i></i></span><b>${esc(r.minion.hp)}</b>`));
    }
    return parts.length ? `<div class="${row} cx-res-row" role="group" aria-label="资源">${parts.join('')}</div>` : '';
}
