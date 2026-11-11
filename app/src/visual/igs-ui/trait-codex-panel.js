// 特质图鉴页：全局共享，只读 stat-trait-codex 的 codexView。未点亮为同尺寸的暗底「？？？」胶囊，已点亮可点开看说明与点亮记录。
import { TRAIT_DEFS, TRAIT_GROUPS } from '../../scene/stats/stat-traits.js';
import { TRAIT_RECIPES } from '../../scene/stats/stat-trait-recipes.js';
import { codexView } from '../../scene/stats/stat-trait-codex.js';
import { traitCombatNote } from '../../scene/stats/stat-trait-combat-notes.js';
import { traitCard, traitItem } from './trait-chips.js';
import { esc } from './reader-value-utils.js';

const recordText = (rec) => (rec ? [rec.char, rec.card, rec.date].filter(Boolean).join(' · ') : '');

function litChip(item, desc, parts, combatOn = false) {
    const note = combatOn ? traitCombatNote(item.name) : '';
    const rec = item.record ? `<p>首次：${esc(recordText(item.record))}</p>` : '';
    return traitItem(`<b>${esc(item.name)}</b>`, traitCard(item.name, '', desc, '', (parts ? `<p>组成：${esc(parts.join('、'))}</p>` : '') + (note ? `<p>${esc(note)}</p>` : '') + rec));
}

const dimChip = '<span class="igs-mood-review-chip igs-trait-chip is-dim"><b>？？？</b></span>';

function groupBlock(title, lit, total, inner, key, advancedOpen) {
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="${esc(key)}"${advancedOpen(key)}><summary>${esc(title)}<span class="igs-trait-count">${lit}/${total}</span></summary>${inner}</details>`;
}

// store：全局图鉴存储；characters：当前聊天各角色 [{ charName, traits: 名称或键[], states? }]，只用来给出快合成提示。
export function renderTraitCodex(store, { characters = [], nsfwOn = false, combatOn = false, advancedOpen = () => '' } = {}) {
    const view = codexView(store, characters, TRAIT_DEFS, TRAIT_RECIPES, { nsfwOn, groups: [...TRAIT_GROUPS] });
    const head = `<div class="igs-trait-progress"><span>已点亮 ${view.progress.lit} / ${view.progress.total}</span><progress max="${view.progress.total || 1}" value="${view.progress.lit}"></progress></div>`;
    const groups = view.groups.map((g) => groupBlock(g.group, g.lit, g.total,
        `<div class="igs-trait-row">${g.items.map((it) => (it.lit ? litChip(it, it.desc, null, combatOn) : dimChip)).join('')}</div>`,
        `trait-codex-${g.group}`, advancedOpen)).join('');
    const comboHints = view.combos.items.filter((it) => it.hints.length)
        .map((it) => it.hints.map((h) => `<div class="igs-source-filter-note">${esc(h.charName)}：${esc(h.parts.join(' + '))}</div>`).join('')).join('');
    const comboBody = `<div class="igs-trait-row">${view.combos.items.map((it) => (it.lit
        ? litChip(it, it.effect ? it.effect.text : '', it.parts || [], combatOn) : dimChip)).join('')}</div>${comboHints}`;
    const combos = view.combos.total ? groupBlock('合成', view.combos.lit, view.combos.total, comboBody, 'trait-codex-combo', advancedOpen) : '';
    return head + groups + combos;
}
