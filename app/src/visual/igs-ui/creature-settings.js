import { esc } from './reader-value-utils.js';
import { normalizeCharacterDna } from '../../scene/character-dna.js';
import {
    CREATURE_ANCHOR_LABELS, CREATURE_CANVAS_LABELS, CREATURE_FORM_LABELS, CREATURE_FRAMING_LABELS, CREATURE_SIZE_LABELS,
    storedCreatureOf, normalizeCreatureProfile,
} from '../../scene/creature-profile.js';

export const CREATURE_SETTING_FIELDS = Object.freeze(['enabled', 'form', 'size', 'anchor', 'canvas', 'tiers', 'framing', 'temp']);
const TIER_LABELS = Object.freeze({ full: '完整', four: '四档' });

// 返回新的角色 DNA（不改入参，存储配置是共享只读）；其余字段原样保留。开关关闭时删除 creature。
export function editCharacterCreature(raw, field, value) {
    if (!CREATURE_SETTING_FIELDS.includes(field)) return null;
    const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    const current = storedCreatureOf(base);
    if (field === 'enabled') {
        if (value === true || value === 'true' || value === '1') {
            if (current) return base;
            const profile = normalizeCreatureProfile({});
            return base ? { ...base, creature: profile } : normalizeCharacterDna({ creature: profile });
        }
        if (!base || !Object.hasOwn(base, 'creature')) return base;
        const { creature, ...rest } = base;
        return rest;
    }
    if (!current) return null;
    // 转正：临时档案去掉临时标记与最近出场序号，之后不再被淘汰。
    if (field === 'temp') {
        if (!current.temp || String(value) === 'true') return null;
        const { seenAt, ...rest } = current;
        return { ...base, creature: normalizeCreatureProfile({ ...rest, temp: false }) };
    }
    const patch = { ...current, [field]: String(value) };
    // 切换形态时差分档位回到该形态的默认值。
    if (field === 'form') { delete patch.tiers; delete patch.framing; }
    return { ...base, creature: normalizeCreatureProfile(patch) };
}

const select = (charName, field, value, labels, label) => `<div class="igs-char-info-row"><span class="igs-char-info-label">${esc(label)}</span>`
    + `<select class="igs-asset-move" data-char-creature="${esc(charName)}" data-creature-field="${field}" aria-label="${esc(label)}">`
    + Object.entries(labels).map(([id, text]) => `<option value="${id}"${id === value ? ' selected' : ''}>${esc(text)}</option>`).join('')
    + '</select></div>';

// 立绘区折叠项「非人角色」：展开状态走 advancedOpen（data-advanced）。
export function renderCharacterCreatureFold(charName, dna, isOpen = () => false) {
    const profile = storedCreatureOf(dna);
    const key = `char-creature:${charName}`;
    const body = `<div class="igs-char-info-row"><span class="igs-char-info-label">按非人角色处理</span>`
        + `<input type="checkbox" data-char-creature="${esc(charName)}" data-creature-field="enabled"${profile ? ' checked' : ''} aria-label="按非人角色处理"></div>`
        + (profile && profile.temp ? `<div class="igs-char-info-row"><span class="igs-char-info-label">临时档案</span><button type="button" class="igs-asset-move" data-action="char-creature:temp:${encodeURIComponent(charName)}:false">转为正式角色</button></div>` : '')
        + (profile ? select(charName, 'form', profile.form, CREATURE_FORM_LABELS, '形态')
            + select(charName, 'size', profile.size, CREATURE_SIZE_LABELS, '体型')
            + select(charName, 'anchor', profile.anchor, CREATURE_ANCHOR_LABELS, '落地')
            + select(charName, 'canvas', profile.canvas, CREATURE_CANVAS_LABELS, '画布')
            + '<div class="igs-outfit-muted">画布默认竖图，仅在需要时手动更换。</div>'
            + (profile.form === 'humanoid' ? select(charName, 'framing', profile.framing || 'full', CREATURE_FRAMING_LABELS, '取景')
                + select(charName, 'tiers', profile.tiers, TIER_LABELS, '情绪档') : '') : '');
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="${esc(key)}"${isOpen(key) ? ' open' : ''}><summary>非人角色${profile ? '（已启用）' : ''}</summary>${body}</details>`;
}
