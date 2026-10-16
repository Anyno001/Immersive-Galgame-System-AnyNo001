import { readArtistLibrary, importArtistLibrary, applyLibraryArtist, saveArtistEntry, removeArtistEntry } from '../../generated-images/artist-library.js';
import { PROMPT_KINDS } from '../../generated-images/prompt-artists.js';
import { pickImagePromptFile } from './settings-image-prompt-io.js';
import { esc } from './reader-value-utils.js';

const button = (verb, label, disabled = false) => `<button type="button" class="igs-settings-action" data-action="artist-library:${verb}"${disabled ? ' disabled' : ''}>${label}</button>`;
const options = (items, value) => items.map(([id, label]) => `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(label)}</option>`).join('');

export function renderArtistLibrary(nai, state = {}) {
    const library = readArtistLibrary(nai.artistLibrary);
    const entries = library.ok ? library.value : [];
    const selected = entries.find(entry => entry.id === state.id);
    const field = (key, label, items, value) => `<label class="igs-settings-field"><span>${label}</span><select data-artist-library-field="${key}" aria-label="${label}">${options(items, value)}</select></label>`;
    return `<div class="igs-source-filter" data-artist-library-panel>
<div class="igs-source-filter-title">IGS 内置 NAI · 画师串库</div>
<div class="igs-source-filter-note">在库内新建、命名和编辑画师正负向。选择条目及目标后应用并保存；编辑或删除库条目不自动改变已应用文本。分区开关保持原值，空分区仍回退全局。</div>
<div class="igs-settings-row">${button('import', '导入画师 JSON', !library.ok)}${button('import-text', '粘贴画师 JSON', !library.ok)}${button('save', '保存画师与设置')}</div>
<div class="igs-source-filter-grid">${field('id', '选择画师条目', [['', '请选择画师'], ...entries.map(entry => [entry.id, entry.name])], state.id || '')}${field('target', '应用目标', [['global', '全局'], ...PROMPT_KINDS], state.target || 'global')}</div>
<div class="igs-settings-row">${button('create', '新建画师串', !library.ok)}${button('edit', '编辑名称与内容', !selected || !library.ok)}${button('delete', '删除条目', !selected || !library.ok)}${button('apply', '应用所选画师', !selected || !library.ok)}<button type="button" class="igs-settings-action" data-image-subtab="auto">分类画师设置</button></div>
${selected ? `<label class="igs-settings-field"><span>所选正向（预览）</span><textarea readonly rows="3">${esc(selected.positivePrompt)}</textarea></label><label class="igs-settings-field"><span>所选负向（预览）</span><textarea readonly rows="3">${esc(selected.negativePrompt)}</textarea></label>` : ''}
<div class="igs-settings-result" role="status" data-result="artist-library">${esc(library.ok ? (state.status || `库中 ${entries.length} 条。导入、应用后请保存。`) : library.reason)}</div>
</div>`;
}

export function setArtistLibraryField(panel, key, value) {
    const library = readArtistLibrary(panel.draft.bridge.autoIllustration.nai.artistLibrary);
    if (!library.ok) return library;
    if (key === 'id' && value !== '' && !library.value.some(entry => entry.id === value))
        return { ok: false, reason: '所选画师条目不存在' };
    if (key === 'target' && value !== 'global' && !PROMPT_KINDS.some(([kind]) => kind === value))
        return { ok: false, reason: '画师应用目标无效' };
    if (!['id', 'target'].includes(key)) return { ok: false, reason: '画师字段无效' };
    const state = panel.asyncState.artistLibrary ||= {};
    state[key] = value;
    state.status = '已选择，尚未应用；应用后请保存。';
    return { ok: true };
}

export async function handleArtistLibraryAction(action, ctx) {
    const { panel, dialogs, isCurrent, persistSettingsDraft } = ctx;
    const state = panel.asyncState.artistLibrary ||= {};
    const nai = panel.draft.bridge.autoIllustration.nai;
    const baseline = JSON.stringify(nai);
    const id = state.id, target = state.target || 'global';
    const current = () => isCurrent() && JSON.stringify(panel.draft.bridge.autoIllustration.nai) === baseline
        && state.id === id && (state.target || 'global') === target;
    const stale = () => ({ ok: false, reason: '画师配置已变化，请重新操作' });
    const verb = action.slice('artist-library:'.length);
    if (!current()) return stale();
    if (verb === 'save') {
        const result = persistSettingsDraft();
        state.status = result.ok ? '画师库与应用结果已保存。' : '保存失败；草稿仍保留，请检查提示后重试。';
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
            state.id = ''; state.status = '条目已删除，尚未保存；已应用文本保持不变。';
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
        state.id = entryId; state.status = '条目已更新，尚未应用或保存；需要生效时请应用所选画师。';
        return { ok: true };
    }
    if (verb === 'import' || verb === 'import-text') {
        const file = verb === 'import-text'
            ? { ok: true, text: await dialogs.edit('粘贴画师 JSON（条目数组或 presets 对象）', '') }
            : await (ctx.readFile || pickImagePromptFile)(ctx.global);
        if (!current()) return stale();
        if (!file.ok) return file;
        if (file.cancelled || file.text === null) return { ok: true, cancelled: true };
        const imported = importArtistLibrary(file.text, nai.artistLibrary);
        if (!imported.ok) return imported;
        if (!await dialogs.confirm(`追加 ${imported.count} 条画师？不覆盖已有条目，不自动应用，图片不导入。`))
            return { ok: true, cancelled: true };
        if (!current()) return stale();
        panel.draft.bridge.autoIllustration.nai = { ...nai, artistLibrary: imported.value };
        state.status = `已追加 ${imported.count} 条；请选择并应用，或保存画师库。`;
        return { ok: true };
    }
    if (verb === 'apply') {
        const applied = applyLibraryArtist(nai, id, target);
        if (!applied.ok) return applied;
        const label = target === 'global' ? '全局画师正负向前缀' : `${new Map(PROMPT_KINDS).get(target)}的分区正负向`;
        if (!await dialogs.confirm(`用所选画师替换${label}？分区开关保持原值，其他类别不变。`))
            return { ok: true, cancelled: true };
        if (!current()) return stale();
        panel.draft.bridge.autoIllustration.nai = applied.value;
        state.status = `已应用到${label}，尚未保存。` + (target !== 'global' && !applied.value.artistByKind.enabled
            ? '分区开关当前关闭，请在「分类画师设置」启用后保存。' : '');
        return { ok: true };
    }
    return { ok: false, reason: '画师操作无效' };
}
