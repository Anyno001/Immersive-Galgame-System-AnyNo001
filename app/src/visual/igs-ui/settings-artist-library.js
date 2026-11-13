import { readArtistLibrary, importArtistLibrary, applyLibraryArtist, saveArtistEntry, removeArtistEntry } from '../../generated-images/artist-library.js';
import { PROMPT_KINDS, globalArtist, normalizeArtistByKind } from '../../generated-images/prompt-artists.js';
import { pickImagePromptFile } from './settings-image-prompt-io.js';
import { esc } from './reader-value-utils.js';
import { renderRowMenu } from './settings-outfit-fields.js';

const options = (items, value) => items.map(([id, label]) => `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(label)}</option>`).join('');

export function renderArtistSelector(nai, target = 'global', sourceMode = 'nai') {
    const library = readArtistLibrary(nai.artistLibrary);
    const entries = library.ok ? library.value : [];
    const configured = target === 'global' ? globalArtist(nai) : (() => {
        const entry = normalizeArtistByKind(nai.artistByKind).kinds[target];
        return { positivePrompt: entry.positive, negativePrompt: entry.negative };
    })();
    const selected = (configured.positivePrompt || configured.negativePrompt) && entries.find(entry => entry.positivePrompt === configured.positivePrompt
        && entry.negativePrompt === configured.negativePrompt);
    const custom = !selected && Boolean(configured.positivePrompt || configured.negativePrompt);
    const label = target === 'global' ? '全局画师串' : `${new Map(PROMPT_KINDS).get(target)}画师串`;
    const emptyLabel = target === 'global' ? (sourceMode === 'dbgen' ? '使用插件默认画师' : '不使用画师串') : '使用全局画师';
    return `<label class="igs-settings-field"><span>${esc(label)}</span><select data-artist-selection="${esc(target)}" aria-label="${esc(label)}">
${custom ? '<option value="" selected disabled>不在库中的画师串</option>' : ''}
${options([['', emptyLabel], ...entries.map(entry => [entry.id, entry.name])], selected?.id || (custom ? null : ''))}
</select></label>`;
}

export function setArtistSelection(panel, target, id) {
    const nai = panel.draft.bridge.autoIllustration.nai;
    if (target !== 'global' && !PROMPT_KINDS.some(([kind]) => kind === target))
        return { ok: false, reason: '画师应用目标无效' };
    let result;
    if (id) result = applyLibraryArtist(nai, id, target);
    else if (target === 'global') result = { ok: true, value: { ...nai, artistPrefix: '', artistNegativePrefix: '' } };
    else {
        const artistByKind = normalizeArtistByKind(nai.artistByKind);
        artistByKind.kinds[target] = { positive: '', negative: '' };
        result = { ok: true, value: { ...nai, artistByKind } };
    }
    if (!result.ok) return result;
    if (target !== 'global' && id) result.value.artistByKind.enabled = true;
    panel.draft.bridge.autoIllustration.nai = result.value;
    return { ok: true };
}

// 「通用」卡里的全局画师串一行：下拉选用，画师串库的新建、编辑、删除、导入收在右侧「⋯」。
export function renderGlobalArtistRow(nai, sourceMode = 'nai', state = {}) {
    const library = readArtistLibrary(nai.artistLibrary);
    const none = !library.ok || !library.value.length;
    const item = (verb, label, { disabled = false, danger = false } = {}) => `<button type="button" class="igs-add-menu-item${danger ? ' is-danger' : ''}" data-action="artist-library:${verb}" role="menuitem"${disabled ? ' disabled' : ''}>${label}</button>`;
    return `<div class="igs-artist-lib-row is-labeled" data-artist-library-panel>${renderArtistSelector(nai, 'global', sourceMode)}`
        + renderRowMenu([item('create', '新建', { disabled: !library.ok }), item('edit', '编辑', { disabled: none }),
            item('import', '导入JSON', { disabled: !library.ok }), item('import-text', '粘贴JSON', { disabled: !library.ok }),
            item('delete', '删除', { disabled: none, danger: true })], '画师串库操作') + '</div>'
        + `<div class="igs-settings-result" role="status" data-result="artist-library">${esc(library.ok ? (state.status || '') : library.reason)}</div>`;
}

function syncEditedArtist(nai, entry, values) {
    const oldPos = entry.positivePrompt || '';
    const oldNeg = entry.negativePrompt || '';
    const extra = {};
    let count = 0;
    if (!oldPos && !oldNeg) return { extra, count };
    const newPos = values.positivePrompt || '';
    const newNeg = values.negativePrompt || '';
    if (nai.artistPrefix === oldPos && (nai.artistNegativePrefix || '') === oldNeg) {
        extra.artistPrefix = newPos;
        extra.artistNegativePrefix = newNeg;
        count += 1;
    }
    const artistByKind = normalizeArtistByKind(nai.artistByKind);
    let kindChanged = false;
    for (const kind of Object.keys(artistByKind.kinds)) {
        const slot = artistByKind.kinds[kind];
        if (slot.positive === oldPos && slot.negative === oldNeg) {
            artistByKind.kinds[kind] = { positive: newPos, negative: newNeg };
            kindChanged = true;
            count += 1;
        }
    }
    if (kindChanged) extra.artistByKind = artistByKind;
    return { extra, count };
}

export async function handleArtistLibraryAction(action, ctx) {
    const { panel, dialogs, isCurrent, persistSettingsDraft } = ctx;
    const state = panel.asyncState.artistLibrary ||= {};
    const nai = panel.draft.bridge.autoIllustration.nai;
    const current = () => isCurrent();
    const stale = () => ({ ok: false, reason: '画师配置已变化，请重新操作' });
    const verb = action.slice('artist-library:'.length);
    if (!current()) return stale();
    // 改完即保存，界面上不再单独放「保存」。
    const commit = (value, status, extra = {}) => {
        panel.draft.bridge.autoIllustration.nai = { ...nai, ...extra, artistLibrary: value };
        const saved = typeof persistSettingsDraft === 'function' ? persistSettingsDraft() : { ok: true };
        state.status = saved && saved.ok === false ? '正在自动恢复保存。' : status;
        return { ok: true };
    };
    if (verb === 'create' || verb === 'edit' || verb === 'delete') {
        const library = readArtistLibrary(nai.artistLibrary);
        if (!library.ok) return library;
        let entry = null;
        if (verb !== 'create') {
            if (!library.value.length) return { ok: false, reason: '画师串库为空' };
            const id = await dialogs.choose(verb === 'edit' ? '编辑哪一条画师串？' : '删除哪一条画师串？', library.value.map(row => ({ value: row.id, label: row.name })), library.value[0].id, { dropdown: true });
            if (!current()) return stale();
            if (id === null || id === undefined || id === '') return { ok: true, cancelled: true };
            entry = library.value.find(row => row.id === id);
            if (!entry) return { ok: false, reason: '所选画师条目不存在' };
        }
        if (verb === 'delete') {
            if (!await dialogs.confirm(`删除「${entry.name}」？已应用的画师文本保持不变。`)) return { ok: true, cancelled: true };
            if (!current()) return stale();
            const removed = removeArtistEntry(nai.artistLibrary, entry.id);
            if (!removed.ok) return removed;
            return commit(removed.value, `已删除「${entry.name}」。`);
        }
        const values = {};
        for (const [key, label] of [['name', '画师串名称'], ['positivePrompt', '画师串正向内容（可留空）'], ['negativePrompt', '画师串负向内容（可留空）']]) {
            const answer = await dialogs.edit(label, entry?.[key] || '');
            if (!current()) return stale();
            if (answer === null || answer === undefined) return { ok: true, cancelled: true };
            values[key] = answer;
        }
        let entryId = entry?.id || `artist-${values.name.trim()}`;
        if (verb === 'create') {
            let suffix = 1;
            while (library.value.some(row => row.id === entryId)) entryId = `artist-${values.name.trim()}-${++suffix}`;
        }
        const saved = saveArtistEntry(nai.artistLibrary, { id: entryId, ...values }, { create: verb === 'create' });
        if (!saved.ok) return saved;
        if (verb === 'create') return commit(saved.value, '已新建，可在各画师串下拉中选用。');
        const synced = syncEditedArtist(nai, entry, values);
        return commit(saved.value, synced.count ? '已更新，正在使用这条的画师串已同步。' : '已更新。', synced.extra);
    }
    if (verb === 'import' || verb === 'import-text') {
        const file = verb === 'import-text'
            ? { ok: true, text: await dialogs.edit('粘贴画师 JSON（条目数组或 presets 对象）', '') }
            : await (ctx.readFile || pickImagePromptFile)(ctx.global);
        if (!current()) return stale();
        if (!file.ok) return file;
        if (file.cancelled || file.text === null) return { ok: true, cancelled: true };
        let imported = importArtistLibrary(file.text, nai.artistLibrary);
        if (!imported.ok) return imported;
        if (imported.conflicts) {
            const overwrite = await dialogs.confirm(
                `本次导入有 ${imported.conflicts} 条画师 ID 或名称重复，是否统一覆盖？选择「跳过」保留已有条目，其余画师照常导入。不自动应用，图片不导入。`,
                { okLabel: '覆盖', cancelLabel: '跳过' });
            if (!current()) return stale();
            if (overwrite) {
                imported = importArtistLibrary(file.text, nai.artistLibrary, { overwrite: true });
                if (!imported.ok) return imported;
            }
        }
        if (!current()) return stale();
        return commit(imported.value, `已新增 ${imported.added} 条、覆盖 ${imported.overwritten} 条、跳过 ${imported.skipped} 条。`);
    }
    return { ok: false, reason: '画师操作无效' };
}
