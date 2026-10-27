import { clonePromptData, PROMPT_DATA_FIELDS, validatePromptActivation } from '../../presets/prompt-preset.js';
import { completeImagePromptPreset, createDefaultImagePromptPreset, createBuiltinImagePromptPresets, createBuiltinImagePromptPresetFor } from '../../generated-images/image-prompt-defaults.js';
import { editImagePromptField } from './settings-image-prompt-fields.js';
import { describeFailure, describeIssues } from './settings-image-prompt-labels.js';

const TYPE = 'prompt-preset';
const fail = reason => ({ ok: false, reason });
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// 按该任务模块的资料范围生成示例资料，只在本地装配，不发送（黄金样本测试用）。
export function buildPreviewInput(data, task, format) {
    const module = data?.modules?.find(item => item.identifier === data.taskMap?.[task]);
    const input = { worldInfo: '（程序自动生成的示例世界书）' };
    for (const field of PROMPT_DATA_FIELDS) {
        if (!(module?.dataFields || []).includes(field)) continue;
        input[field] = field === 'outputs' ? { format, slotIds: [1] }
            : ['userPrompts', 'characters', 'scenes'].includes(field) ? []
                : field === 'promptTask' ? { purpose: 'sample' } : '（程序自动生成的示例资料）';
    }
    return input;
}

// 仅管理编辑副本；所有持久化与 current 变化交给注入的唯一注册表。
export function createImagePromptEditor(registry, options = {}) {
    const now = options.now || (() => Date.now());
    const state = { preset: null, baseRevision: null, draftRevision: null, dirty: false, editRevision: 0,
        rawFields: {}, errors: {}, importPreview: null, importChoices: {},
        status: '', save: null, pendingFormats: {} };
    // 激活校验按编辑版本缓存：同一版本只校验一次（校验内部有整份 JSON 往返）。
    let activationCache = { revision: -1, id: null, result: null };
    function getActivation() {
        if (!state.preset) return null;
        if (activationCache.revision !== state.editRevision || activationCache.id !== state.preset.id)
            activationCache = { revision: state.editRevision, id: state.preset.id, result: validatePromptActivation(state.preset.data) };
        return activationCache.result;
    }
    const ready = () => registry?.getStatus?.().ok === true;
    function load(id, restore = true) {
        state.editRevision += 1;
        if (state.preset?.id !== id) state.pendingFormats = {};
        const saved = registry.get(TYPE, id), draft = registry.getPromptDraft(id);
        state.preset = clonePromptData(restore && draft ? draft.preset : saved);
        // 旧预设缺非人任务条目时在编辑副本里补入内置默认；保存时才写入。
        if (state.preset) state.preset.data = completeImagePromptPreset(state.preset.data);
        state.baseRevision = restore && draft ? draft.baseRevision : saved?.data.revision ?? null;
        state.draftRevision = draft?.revision ?? null;
        state.dirty = false;
        state.rawFields = {}; state.errors = {};
        for (const [address, value] of Object.entries(restore ? draft?.editorFields || {} : {})) {
            edit(address, value);
        }
        state.dirty = false;
        return state.preset ? { ok: true } : fail('missing-image-prompt-preset');
    }
    // 轻量视图：不拷贝快照；返回值内的对象只读，调用方不得修改。
    function view() {
        if (!ready()) return { ok: false, reason: 'preset-store-unreadable', state };
        const index = registry.peekImagePromptIndex();
        if (!index) return { ok: false, reason: 'preset-store-unreadable', state };
        const items = index.items.map(item => state.preset && item.id === state.preset.id
            ? { ...item, name: state.preset.name } : item);
        if (state.preset && !items.some(item => item.id === state.preset.id))
            items.push({ id: state.preset.id, name: state.preset.name, revision: null, draftOnly: true });
        const row = items.find(item => item.id === state.preset?.id);
        return { ok: true, state, items, currentId: index.currentId,
            current: items.find(item => item.id === index.currentId) || null,
            savedRevision: row?.revision ?? null,
            get activation() { return getActivation(); } };
    }
    function edit(address, value) {
        if (!state.preset) return fail('missing-image-prompt-preset');
        const result = editImagePromptField(state, address, value);
        state.editRevision += 1;
        state.dirty = true; state.save = null;
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
    // 正式保存成功后只更新状态，不再整份重新读取克隆：编辑副本已与保存内容一致，只需同步版本号。
    function markSaved(result) {
        const revision = result.item?.data?.revision ?? registry.get(TYPE, state.preset.id)?.data.revision;
        state.preset.data.revision = revision;
        state.baseRevision = revision;
        state.draftRevision = null;
        state.dirty = false;
        state.rawFields = {}; state.errors = {};
        state.editRevision += 1;
    }
    // 自动保存：能通过激活校验就写正式版本（该预设正在使用时立即生效），否则只写草稿，正在使用的版本不变。
    function autoSave() {
        if (!ready()) return fail('preset-store-unreadable');
        if (!state.preset || !state.dirty) return { ok: true, changed: false };
        const hasErrors = Object.keys(state.errors).length > 0;
        const activation = hasErrors ? null : getActivation();
        if (activation?.ok) {
            const saved = registry.savePromptPreset(state.preset, state.baseRevision, { expectedDraftRevision: state.draftRevision });
            if (saved.ok) {
                markSaved(saved);
                state.save = { kind: 'saved', at: now() };
                return { ok: true, saved: true };
            }
        }
        const draft = saveDraft();
        if (!draft.ok) { state.save = { kind: 'error', message: describeFailure(draft, state.preset?.data) }; return draft; }
        state.save = { kind: 'draft', at: now(),
            messages: hasErrors ? ['有内容格式不正确'] : describeIssues(activation?.errors, state.preset?.data) };
        return { ...draft, draftOnly: true };
    }
    function select(id) {
        if (!ready()) return fail('preset-store-unreadable');
        const saved = autoSave();
        if (!saved.ok) return saved;
        state.save = null;
        return load(id);
    }
    function create(id, name, copy = false) {
        if (!ready()) return fail('preset-store-unreadable');
        if (typeof id !== 'string' || !id.trim() || id !== id.trim()
            || ['__proto__', 'constructor', 'prototype'].includes(id)) return fail('invalid-prompt-preset');
        if (registry.peekImagePromptIndex().items.some(item => item.id === id) || state.preset?.id === id) return fail('preset-id-conflict');
        const saved = autoSave();
        if (!saved.ok) return saved;
        const preset = copy && state.preset ? clonePromptData(state.preset) : createDefaultImagePromptPreset();
        preset.id = id; preset.name = name || id;
        delete preset.data.defaultState; delete preset.data.defaultVersion;
        state.preset = preset; state.baseRevision = null; state.draftRevision = null;
        state.rawFields = {}; state.errors = {}; state.dirty = true; state.save = null;
        state.editRevision += 1; state.pendingFormats = {};
        return autoSave();
    }
    // 新预设的稳定 ID 由程序生成且不显示。
    function newId(prefix = 'igs-imagegen-') {
        const taken = new Set((registry.peekImagePromptIndex()?.items || []).map(item => item.id));
        for (;;) {
            let tail = '';
            for (let i = 0; i < 6; i += 1) tail += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
            if (!taken.has(prefix + tail)) return prefix + tail;
        }
    }
    function rename(name) {
        const text = String(name ?? '').trim();
        if (!state.preset) return fail('missing-image-prompt-preset');
        if (!text) return fail('invalid-prompt-preset');
        if (text === state.preset.name) return { ok: true, changed: false };
        const result = edit(JSON.stringify(['preset', '', 'name']), text);
        return result.ok ? autoSave() : result;
    }
    function save() {
        if (!ready()) return fail('preset-store-unreadable');
        if (!state.preset) return fail('missing-image-prompt-preset');
        if (Object.keys(state.errors).length) return { ok: false, reason: 'invalid-prompt-fields', errors: Object.values(state.errors) };
        const result = registry.savePromptPreset(state.preset, state.baseRevision, { expectedDraftRevision: state.draftRevision });
        if (result.ok) markSaved(result);
        return result;
    }
    function activate() {
        if (!state.preset) return fail('missing-image-prompt-preset');
        if (state.dirty || state.draftRevision !== null) {
            if (Object.keys(state.errors).length) return fail('invalid-prompt-fields');
            const checked = getActivation();
            if (!checked.ok) return { ok: false, reason: 'prompt-not-activatable', errors: checked.errors };
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
            state.preset = null; state.dirty = false; state.save = null;
            const initialized = registry.ensureImagePromptDefault(createBuiltinImagePromptPresets());
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
        if (action === 'format-add') {
            // 只记界面上多出一个空文本框；填入内容后才写入数据。
            if (!target || typeof value !== 'string' || !value) return fail('prompt-block-not-found');
            state.pendingFormats[`${group}|${id}|${value}`] = true;
            return { ok: true, structural: true };
        }
        if (action === 'add') {
            if (typeof id !== 'string' || !id.trim() || blocks.some(block => block.identifier === id))
                return fail('invalid-or-duplicate-id');
            blocks.push(group === 'prompts'
                ? { identifier: id, name: typeof value === 'string' && value.trim() ? value.trim() : id, kind: 'shared', role: 'system', enabled: true, content: '' }
                : { identifier: id, task: 'sprite', role: 'system', enabled: true, content: '', dataFields: ['description', 'outputs'], requiredFields: ['description', 'outputs'] });
            if (group === 'prompts') (data.prompt_order ||= []).push({ identifier: id, enabled: true });
        } else {
            if (!target) return fail('prompt-block-not-found');
            if (action === 'copy' && group === 'modules') {
                const copy = clonePromptData(target);
                let n = 2;
                while (blocks.some(block => block.identifier === `${id}-v${n}`)) n += 1;
                copy.identifier = `${id}-v${n}`;
                blocks.push(copy);
            } else if (action === 'delete') {
                if (group === 'modules' && Object.values(data.taskMap || {}).includes(id)) return fail('module-in-use');
                if (group === 'prompts' && target.kind && target.kind !== 'shared') return fail('invalid-prompt-action');
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
        state.dirty = true; state.save = null;
        return { ok: true, structural: true };
    }

    function previewImport(input) {
        const saved = autoSave();
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
    function discardDraft() {
        if (!state.preset) return fail('missing-image-prompt-preset');
        const id = state.preset.id;
        if (state.draftRevision !== null) {
            const result = registry.removePromptDraft(id, state.draftRevision);
            if (!result.ok) return result;
        }
        if (registry.get(TYPE, id)) return load(id, false);
        state.preset = null; state.dirty = false; state.rawFields = {}; state.errors = {};
        return { ok: true };
    }
    // 恢复默认：先冲刷自动保存，再恢复；当前内容未填完整（只能存草稿）时不恢复。
    function restore(group, identifier, backupRevision) {
        if (!state.preset) return fail('missing-image-prompt-preset');
        const flushed = autoSave();
        if (!flushed.ok) return flushed;
        if (state.dirty || state.draftRevision !== null) return fail('prompt-save-before-restore');
        const options = { expectedRevision: state.baseRevision, group, identifier };
        if (backupRevision !== undefined) options.backupRevision = backupRevision;
        const result = registry.restoreImagePromptBlock(state.preset.id, options);
        if (result.ok) { load(state.preset.id, false); state.save = { kind: 'saved', at: now() }; }
        return result;
    }
    // 恢复默认框架：整组替换为内置默认（保留 id、名称）。内置预设按基线恢复，自建组按当前内置默认；随后走自动保存。
    function restoreFramework() {
        if (!state.preset) return fail('missing-image-prompt-preset');
        const old = state.preset.data.defaultState, baseline = old?.baseline;
        let next;
        if (baseline && typeof baseline === 'object') {
            next = clonePromptData(baseline);
            next.defaultState = old;
        } else {
            next = createBuiltinImagePromptPresetFor(state.preset.data).data;
            delete next.defaultState; delete next.defaultVersion;
            // 有 defaultState 但无基线：原样保留，不丢弃。
            if (old) { next.defaultState = old; if (state.preset.data.defaultVersion !== undefined) next.defaultVersion = state.preset.data.defaultVersion; }
        }
        next.revision = state.preset.data.revision;
        // 演绎档位是用户设置，不随框架文字恢复。
        if (next.spriteScheme === 'lively' && state.preset.data.performance) next.performance = state.preset.data.performance;
        state.preset.data = completeImagePromptPreset(next);
        state.editRevision += 1;
        state.dirty = true; state.save = null;
        state.rawFields = {}; state.errors = {}; state.pendingFormats = {};
        return autoSave();
    }
    function initialize() {
        if (!ready()) return fail('preset-store-unreadable');
        const result = registry.ensureImagePromptDefault(createBuiltinImagePromptPresets());
        if (!result.ok) return result;
        return load(result.presetId);
    }
    function reload() {
        const id = state.preset?.id;
        const result = registry?.hydrate?.();
        if (!result?.ok) return fail('preset-store-unreadable');
        state.importPreview = null; state.save = null;
        return id && (registry.get(TYPE, id) || registry.getPromptDraft(id)) ? load(id) : initialize();
    }
    const saved = () => state.preset ? registry.get(TYPE, state.preset.id) : null;
    return { state, view, saved, edit, select, create, newId, rename, autoSave, saveDraft, save, activate, remove, blockAction, restoreFramework,
        previewImport, commitImport, discardDraft, restore, initialize, reload };
}
