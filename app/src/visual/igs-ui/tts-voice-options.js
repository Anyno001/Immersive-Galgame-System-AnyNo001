import { esc } from './reader-value-utils.js';

export function renderTtsVoiceOptions(groups, value, { leading = [], missingNote = '不在声音库' } = {}) {
    const option = ([id, label]) => `<option value="${esc(id)}"${String(id) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
    const known = new Set([...leading, ...groups.flatMap(group => group.items)].map(([id]) => String(id)));
    const body = groups.map(group => {
        const items = group.items.map(option).join('');
        return group.label && items ? `<optgroup label="${esc(group.label)}">${items}</optgroup>` : items;
    }).join('');
    return leading.map(option).join('') + body
        + (value && !known.has(String(value)) ? option([value, `${value}（${missingNote}）`]) : '');
}

export function ttsVoiceSelectInput(path, value, groups, options) {
    return `<select data-path="${esc(path)}">${renderTtsVoiceOptions(groups, value, options)}</select>`;
}

export function renderTtsVoicePoolGroups(groups, chip) {
    return groups.filter(group => group.items.length).map(group => {
        const body = `<div class="igs-tts-pool">${group.items.map(([id, label]) => chip(id, label)).join('')}</div>`;
        return group.label ? `<div class="igs-asset-folder"><div class="igs-asset-folder-head"><span class="igs-asset-folder-name">${esc(group.label)}</span>`
            + `<span class="igs-asset-folder-count">${group.items.length}</span></div>${body}</div>` : body;
    }).join('');
}
