import { clonePromptData, validatePromptActivation } from '../../presets/prompt-preset.js';
import { renderImagePromptPreset } from '../../presets/prompt-preset-renderer.js';
import { completeImagePromptPreset, createDefaultImagePromptPreset } from '../../generated-images/image-prompt-defaults.js';
import { editImagePromptField } from './settings-image-prompt-fields.js';

const TYPE = 'prompt-preset';
const fail = reason => ({ ok: false, reason });

// 仅管理编辑副本；所有持久化与 current 变化交给注入的唯一注册表。
export function createImagePromptEditor(registry) {
    const state = { preset: null, baseRevision: null, draftRevision: null, dirty: false, editRevision: 0,
        rawFields: {}, errors: {}, preview: null, importPreview: null, importChoices: {},
        previewTask: 'sprite', previewInput: JSON.stringify({ description: '合成预览资料，不发送请求',
            outputs: { format: 'sprite-data', slotIds: [1] } }, null, 2), status: '' };
    const ready = () => registry?.getStatus?.().ok === true;
    function load(id, restore = true) {
        state.editRevision += 1;
        const saved = registry.get(TYPE, id), draft = registry.getPromptDraft(id);
        state.preset = clonePromptData(restore && draft ? draft.preset : saved);
        // 旧预设缺非人任务条目时在编辑副本里补入内置默认；保存时才写入。
        if (state.preset) state.preset.data = completeImagePromptPreset(state.preset.data);
        state.baseRevision = restore && draft ? draft.baseRevision : saved?.data.revision ?? null;
        state.draftRevision = draft?.revision ?? null;
        state.dirty = false;
        state.rawFields = {}; state.errors = {}; state.preview = null;
        for (const [address, value] of Object.entries(restore ? draft?.editorFields || {} : {})) {
            edit(address, value);
        }
        state.dirty = false;
        return state.preset ? { ok: true } : fail('missing-image-prompt-preset');
    }
    function view() {
        if (!ready()) return { ok: false, reason: 'preset-store-unreadable', state };
        const snapshot = registry.snapshot();
        const items = registry.list(TYPE).filter(p => p.data?.usage === 'imagegen');
        for (const [id, draft] of Object.entries(snapshot.drafts[TYPE] || {})) {
            if (!items.some(p => p.id === id) && draft.preset?.data?.usage === 'imagegen')
                items.push({ ...draft.preset, draftOnly: true });
        }
        if (state.preset && !items.some(p => p.id === state.preset.id)) items.push({ ...state.preset, draftOnly: true });
        return { ok: true, state, items, current: registry.getCurrent(TYPE),
            saved: state.preset ? registry.get(TYPE, state.preset.id) : null,
            activation: state.preset ? validatePromptActivation(state.preset.data) : null };
    }
    function edit(address, value) {
        if (!state.preset) return fail('missing-image-prompt-preset');
        const result = editImagePromptField(state, address, value);
        state.editRevision += 1;
        state.dirty = true; state.preview = null;
        if (!result.ok) { state.rawFields[address] = value; state.errors[address] = result; }
        else { delete state.rawFields[address]; delete state.errors[address]; }
        return result;
    }

    function saveDraft() {
        if (!ready()) return fail('preset-store-unreadable');
        if (!state.preset || !state.dirty) return { ok: true, changed: false };
        const result = registry.savePromptDraft(state.preset.id, state.preset, {
            expectedRevision: state.baseRevision, expectedDraftRevision: state.draftRevision,
            editorFields: state.rawFields,
        });
        if (result.ok) { state.draftRevision = result.draft.revision; state.dirty = false; }
        return result;
    }
    function select(id) {
        if (!ready()) return fail('preset-store-unreadable');
        const saved = saveDraft();
        return saved.ok ? load(id) : saved;
    }
    function create(id, name, copy = false) {
        if (!ready()) return fail('preset-store-unreadable');
        if (typeof id !== 'string' || !id.trim() || id !== id.trim()
            || ['__proto__', 'constructor', 'prototype'].includes(id)) return fail('invalid-prompt-preset');
        if (view().items.some(item => item.id === id)) return fail('preset-id-conflict');
        const saved = saveDraft();
        if (!saved.ok) return saved;
        const preset = copy && state.preset ? clonePromptData(state.preset) : createDefaultImagePromptPreset();
        preset.id = id; preset.name = name || id;
        delete preset.data.defaultState; delete preset.data.defaultVersion;
        state.preset = preset; state.baseRevision = null; state.draftRevision = null;
        state.rawFields = {}; state.errors = {}; state.preview = null; state.dirty = true;
        return saveDraft();
    }
    function save() {
        if (!ready()) return fail('preset-store-unreadable');
        if (!state.preset) return fail('missing-image-prompt-preset');
        if (Object.keys(state.errors).length) return { ok: false, reason: 'invalid-prompt-fields', errors: Object.values(state.errors) };
        const result = registry.savePromptPreset(state.preset, state.baseRevision, { expectedDraftRevision: state.draftRevision });
        if (result.ok) load(state.preset.id, false);
        return result;
    }
    function activate() {
        if (!state.preset) return fail('missing-image-prompt-preset');
        if (state.dirty || state.draftRevision !== null) {
            const saved = save();
            if (!saved.ok) return saved;
        }
        return registry.activateImagePromptPreset(state.preset.id, state.baseRevision);
    }
    function remove() {
        if (!state.preset) return fail('missing-image-prompt-preset');
        const id = state.preset.id;
        const result = state.baseRevision === null ? registry.removePromptDraft(id, state.draftRevision)
            : registry.removeImagePromptPreset(id, { expectedRevision: state.baseRevision, expectedDraftRevision: state.draftRevision });
        if (result.ok) {
            state.preset = null; state.dirty = false; state.preview = null;
            const initialized = registry.ensureImagePromptDefault(createDefaultImagePromptPreset());
            if (!initialized.ok) return initialized;
            return load(registry.getCurrent(TYPE)?.id);
        }
        return result;
    }

    function blockAction(action, group, id, value) {
        if (!state.preset || !['prompts', 'modules'].includes(group)) return fail('invalid-prompt-field');
        const data = state.preset.data;
        const blocks = data[group] ||= [];
        const target = blocks.find(block => block.identifier === id);
        if (action === 'add') {
            if (typeof id !== 'string' || !id.trim() || blocks.some(block => block.identifier === id))
                return fail('invalid-or-duplicate-id');
            blocks.push(group === 'prompts'
                ? { identifier: id, name: id, kind: 'shared', role: 'system', enabled: true, content: '' }
                : { identifier: id, task: 'sprite', role: 'system', enabled: true, content: '', dataFields: ['description', 'outputs'], requiredFields: ['description', 'outputs'] });
            if (group === 'prompts') (data.prompt_order ||= []).push({ identifier: id, enabled: true });
        } else {
            if (!target) return fail('prompt-block-not-found');
            if (action === 'delete') {
                data[group] = blocks.filter(block => block.identifier !== id);
                if (group === 'prompts') data.prompt_order = data.prompt_order.filter(entry => entry.identifier !== id);
                else for (const task of Object.keys(data.taskMap || {})) {
                    if (data.taskMap[task] === id) delete data.taskMap[task];
                }
            } else if (action === 'order-enabled' && group === 'prompts') {
                const entry = data.prompt_order.find(item => item.identifier === id);
                if (!entry) return fail('prompt-block-not-ordered');
                entry.enabled = value === true;
            } else if (action === 'move' && group === 'prompts') {
                const order = data.prompt_order, from = order.findIndex(entry => entry.identifier === id);
                const to = order.findIndex(entry => entry.identifier === value);
                if (from < 0 || to < 0) return fail('prompt-block-not-ordered');
                order.splice(to, 0, order.splice(from, 1)[0]);
            } else if (action === 'include' && group === 'prompts') {
                if (!data.prompt_order.some(entry => entry.identifier === id)) data.prompt_order.push({ identifier: id, enabled: true });
            } else return fail('invalid-prompt-action');
        }
        state.editRevision += 1;
        state.dirty = true; state.preview = null;
        return { ok: true };
    }

    function previewImport(input) {
        const saved = saveDraft();
        if (!saved.ok) return saved;
        state.importPreview = registry.previewPromptImport(input);
        state.importChoices = Object.fromEntries((state.importPreview.accepted || [])
            .filter(entry => entry.conflict).map(entry => [entry.id, 'skip']));
        return state.importPreview;
    }
    function commitImport() {
        if (state.dirty) return fail('prompt-import-preview-stale');
        const result = registry.commitPromptImport(state.importPreview, state.importChoices);
        if (result.ok) { state.importPreview = null; state.importChoices = {}; }
        return result;
    }
    function preview() {
        if (!state.preset) return fail('missing-image-prompt-preset');
        if (Object.keys(state.errors).length) return fail('invalid-prompt-fields');
        let input;
        try { input = JSON.parse(state.previewInput); } catch { return fail('invalid-json'); }
        state.preview = renderImagePromptPreset(state.preset.data, state.previewTask, input);
        return state.preview;
    }
    function discardDraft() {
        if (!state.preset) return fail('missing-image-prompt-preset');
        const id = state.preset.id;
        if (state.draftRevision !== null) {
            const result = registry.removePromptDraft(id, state.draftRevision);
            if (!result.ok) return result;
        }
        if (registry.get(TYPE, id)) return load(id, false);
        state.preset = null; state.dirty = false; state.rawFields = {}; state.errors = {}; state.preview = null;
        return { ok: true };
    }
    function restore(group, identifier, backupRevision) {
        if (!state.preset) return fail('missing-image-prompt-preset');
        if (state.dirty || state.draftRevision !== null) return fail('prompt-save-before-restore');
        const options = { expectedRevision: state.baseRevision, group, identifier };
        if (backupRevision !== undefined) options.backupRevision = backupRevision;
        const result = registry.restoreImagePromptBlock(state.preset.id, options);
        if (result.ok) load(state.preset.id, false);
        return result;
    }
    function initialize() {
        if (!ready()) return fail('preset-store-unreadable');
        const result = registry.ensureImagePromptDefault(createDefaultImagePromptPreset());
        if (!result.ok) return result;
        return load(result.presetId);
    }
    function reload() {
        const id = state.preset?.id;
        const result = registry?.hydrate?.();
        if (!result?.ok) return fail('preset-store-unreadable');
        state.importPreview = null;
        return id && (registry.get(TYPE, id) || registry.getPromptDraft(id)) ? load(id) : initialize();
    }
    return { state, view, edit, select, create, saveDraft, save, activate, remove, blockAction,
        previewImport, commitImport, preview, discardDraft, restore, initialize, reload };
}
