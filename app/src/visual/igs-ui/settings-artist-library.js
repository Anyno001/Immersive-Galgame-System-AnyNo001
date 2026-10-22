import { readArtistLibrary, importArtistLibrary, applyLibraryArtist, saveArtistEntry, removeArtistEntry } from '../../generated-images/artist-library.js';
import { PROMPT_KINDS, globalArtist, normalizeArtistByKind } from '../../generated-images/prompt-artists.js';
import { pickImagePromptFile } from './settings-image-prompt-io.js';
import { esc } from './reader-value-utils.js';

const button = (verb, label, disabled = false) => `<button type="button" class="igs-settings-action" data-action="artist-library:${verb}"${disabled ? ' disabled' : ''}>${label}</button>`;
const MORE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
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
${custom ? '<option value="" selected disabled>当前已保存的画师串</option>' : ''}
${options([['', emptyLabel], ...entries.map(entry => [entry.id, entry.name])], selected?.id || (custom ? null : ''))}
</select>${entries.length ? '' : '<em>画师串库位于「画师与模型」页底部。</em>'}</label>`;
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

export function renderArtistLibrary(nai, state = {}) {
    const library = readArtistLibrary(nai.artistLibrary);
    const entries = library.ok ? library.value : [];
    const selected = entries.find(entry => entry.id === state.id);
    const item = (verb, label, disabled = false) => `<button type="button" class="igs-add-menu-item" data-action="artist-library:${verb}" role="menuitem"${disabled ? ' disabled' : ''}>${label}</button>`;
    const menu = `<details class="igs-add-menu igs-row-menu"><summary class="igs-btn-mgr-icon" title="画师串库操作" aria-label="画师串库操作">${MORE_SVG}</summary><div class="igs-add-menu-list" role="menu">`
        + `${item('create', '新建', !library.ok)}${item('edit', '编辑', !selected || !library.ok)}${item('delete', '删除', !selected || !library.ok)}${item('import', '导入JSON', !library.ok)}${item('import-text', '粘贴JSON', !library.ok)}</div></details>`;
    const picker = `<label class="igs-settings-field"><select data-artist-library-field="id" aria-label="画师条目">${options([['', '请选择画师'], ...entries.map(entry => [entry.id, entry.name])], state.id || '')}</select></label>`;
    return `<div class="igs-source-filter" data-artist-library-panel>
<div class="igs-source-filter-title">画师串库</div>
<div class="igs-source-filter-note">条目可在各画师串下拉框中选用。</div>
<div class="igs-artist-lib-row">${picker}${state.dirty ? button('save', '保存') : ''}${menu}</div>
${selected ? `<label class="igs-settings-field"><span>所选正向（预览）</span><textarea readonly rows="3">${esc(selected.positivePrompt)}</textarea></label><label class="igs-settings-field"><span>所选负向（预览）</span><textarea readonly rows="3">${esc(selected.negativePrompt)}</textarea></label>` : ''}
<div class="igs-settings-result" role="status" data-result="artist-library">${esc(library.ok ? (state.status || `库中 ${entries.length} 条。`) : library.reason)}</div>
</div>`;
}

export function setArtistLibraryField(panel, key, value) {
    const library = readArtistLibrary(panel.draft.bridge.autoIllustration.nai.artistLibrary);
    if (!library.ok) return library;
    if (key === 'id' && value !== '' && !library.value.some(entry => entry.id === value))
        return { ok: false, reason: '所选画师条目不存在' };
    if (key !== 'id') return { ok: false, reason: '画师字段无效' };
    const state = panel.asyncState.artistLibrary ||= {};
    state[key] = value;
    state.status = '可编辑或删除所选条目。';
    return { ok: true };
}

export async function handleArtistLibraryAction(action, ctx) {
    const { panel, dialogs, isCurrent, persistSettingsDraft } = ctx;
    const state = panel.asyncState.artistLibrary ||= {};
    const nai = panel.draft.bridge.autoIllustration.nai;
    const id = state.id;
    const current = () => isCurrent();
    const stale = () => ({ ok: false, reason: '画师配置已变化，请重新操作' });
    const verb = action.slice('artist-library:'.length);
    if (!current()) return stale();
    if (verb === 'save') {
        const result = persistSettingsDraft();
        state.status = result.ok ? '画师库已保存。' : '正在自动恢复保存。';
        if (result.ok) state.dirty = false;
        return result;
    }
    if (verb === 'create' || verb === 'edit' || verb === 'delete') {
        const library = readArtistLibrary(nai.artistLibrary);
        if (!library.ok) return library;
        const entry = library.value.find(row => row.id === id);
        if (verb !== 'create' && !entry) return { ok: false, reason: '所选画师条目不存在' };
        if (verb === 'delete') {
            if (!await dialogs.confirm(`删除「${entry.name}」？已应用的画师文本保持不变。`)) return { ok: true, cancelled: true };
            if (!current()) return stale();
            const removed = removeArtistEntry(nai.artistLibrary, id);
            if (!removed.ok) return removed;
            panel.draft.bridge.autoIllustration.nai = { ...nai, artistLibrary: removed.value };
            state.id = ''; state.dirty = true; state.status = '条目已删除，保存后生效；已应用文本保持不变。';
            return { ok: true };
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
        panel.draft.bridge.autoIllustration.nai = { ...nai, artistLibrary: saved.value };
        state.id = entryId; state.dirty = true; state.status = '条目已更新，保存后可选用。';
        return { ok: true };
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
        panel.draft.bridge.autoIllustration.nai = { ...nai, artistLibrary: imported.value };
        state.dirty = true;
        state.status = `已新增 ${imported.added} 条、覆盖 ${imported.overwritten} 条、跳过 ${imported.skipped} 条，保存后可选用。`;
        return { ok: true };
    }
    return { ok: false, reason: '画师操作无效' };
}
