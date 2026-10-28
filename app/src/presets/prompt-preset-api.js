import { previewPromptImport } from './prompt-preset-import.js';
import { promptRevision, stagePromptImport, stagePromptSave } from './prompt-preset-operations.js';
import { clonePromptData, validatePromptActivation } from './prompt-preset.js';
import { stagePromptDefaultUpgrade, stagePromptDefaultRestore, renameLegacyDefaultNames } from './prompt-default-operations.js';

const TYPE = 'prompt-preset';
const fail = (reason) => ({ ok: false, reason });
const validId = (id) => typeof id === 'string' && id.trim() === id && id.length > 0
    && !['__proto__', 'constructor', 'prototype'].includes(id);

export function createPromptPresetApi({ read, commit, isReady }) {
    const ready = () => isReady() ? null : fail('preset-store-unreadable');
    const finish = (staged) => {
        if (!staged.ok) return staged;
        const { next, ...result } = staged;
        if (staged.changed === false) return result;
        const saved = commit(next);
        return saved.ok ? result : saved;
    };
    return {
        // 入参是内置预设或其数组（第一项为首选）：缺哪套补哪套，不改 current；current 是内置项时按它自己的版本升级。
        ensureImagePromptDefault(input) {
            const blocked = ready();
            if (blocked) return blocked;
            const presets = Array.isArray(input) ? input : [input];
            const preset = presets[0];
            const next = read(), currentId = next.current[TYPE];
            const shaped = (item) => item?.format === 'igs_preset_v1' && item?.type === TYPE && validId(item.id);
            // 补入缺失的内置预设；已存在的（含用户改过的）一律不动。
            const addMissing = (strict) => {
                let added = false;
                for (const item of presets) {
                    if (!shaped(item)) { if (strict) return fail('invalid-prompt-default'); continue; }
                    if (next.items[TYPE]?.[item.id]) continue;
                    const checked = validatePromptActivation(item.data);
                    if (!checked.ok) { if (strict) return { ok: false, reason: 'prompt-not-activatable', errors: checked.errors }; continue; }
                    next.items[TYPE] ||= {};
                    next.items[TYPE][item.id] = clonePromptData(item);
                    added = true;
                }
                return added;
            };
            if (currentId) {
                const current = next.items[TYPE]?.[currentId];
                if (current?.data?.usage !== 'imagegen') return fail('prompt-current-not-imagegen');
                const added = addMissing(false);
                const renamed = renameLegacyDefaultNames(next, presets);
                const own = presets.find(item => shaped(item) && item.id === currentId);
                let working = next, changed = added === true || renamed, item;
                if (own) {
                    const staged = stagePromptDefaultUpgrade(next, own);
                    if (!staged.ok) return { ...staged, presetId: currentId };
                    if (staged.changed !== false) { working = staged.next; changed = true; item = staged.item; }
                }
                if (!changed) return { ok: true, changed: false, presetId: currentId };
                return { ...finish({ ok: true, next: working, changed: true, ...(item && { item }) }), presetId: currentId };
            }
            if (!shaped(preset)) return fail('invalid-prompt-default');
            renameLegacyDefaultNames(next, presets);
            const existing = next.items[TYPE]?.[preset.id];
            const candidate = existing || preset;
            const checked = validatePromptActivation(candidate.data);
            if (!checked.ok) return { ok: false, reason: 'prompt-not-activatable', errors: checked.errors };
            next.items[TYPE] ||= {};
            next.items[TYPE][preset.id] = clonePromptData(candidate);
            const others = addMissing(true);
            if (others?.ok === false) return others;
            next.current[TYPE] = preset.id;
            return finish({ ok: true, next, changed: true, presetId: preset.id });
        },
        upgradeImagePromptDefault(preset, expectedRevision) {
            const blocked = ready();
            if (blocked) return blocked;
            const snapshot = read();
            return finish(stagePromptDefaultUpgrade(snapshot, preset));
        },
        restoreImagePromptBlock(id, options) {
            return ready() || finish(stagePromptDefaultRestore(read(), id, options));
        },
        previewPromptImport(input) {
            return ready() || previewPromptImport(input, read());
        },
        commitPromptImport(preview, choices = {}) {
            return ready() || finish(stagePromptImport(read(), preview, choices));
        },
        savePromptPreset(preset, expectedRevision, options = {}) {
            const blocked = ready();
            if (blocked) return blocked;
            const snapshot = read();
            const clearDraft = Object.hasOwn(options, 'expectedDraftRevision');
            const staged = stagePromptSave(snapshot, preset, expectedRevision);
            if (staged.ok && clearDraft && staged.next.drafts[TYPE])
                delete staged.next.drafts[TYPE][preset.id];
            return finish(staged);
        },
        activateImagePromptPreset(id, expectedRevision) {
            const blocked = ready();
            if (blocked) return blocked;
            const next = read(), candidate = next.items[TYPE]?.[id];
            if (!candidate) return fail('missing-image-prompt-preset');
            const checked = validatePromptActivation(candidate.data);
            if (!checked.ok) return { ok: false, reason: 'prompt-not-activatable', errors: checked.errors };
            next.current[TYPE] = id;
            return finish({ ok: true, next, item: clonePromptData(candidate) });
        },
        removeImagePromptPreset(id, { expectedRevision, expectedDraftRevision = null } = {}) {
            const blocked = ready();
            if (blocked) return blocked;
            const next = read(), candidate = next.items[TYPE]?.[id];
            if (!candidate || candidate.data?.usage !== 'imagegen') return fail('missing-image-prompt-preset');
            // 当前项不可删除：先显式切换到另一个合法保存版本。
            if (next.current[TYPE] === id) {
                const replacement = Object.values(next.items[TYPE] || {}).find(item => item.id !== id
                    && validatePromptActivation(item.data).ok);
                if (replacement) next.current[TYPE] = replacement.id;
                else delete next.current[TYPE];
            }
            delete next.items[TYPE][id];
            if (next.drafts[TYPE]) delete next.drafts[TYPE][id];
            return finish({ ok: true, next });
        },
        getPromptDraft(id) {
            if (!validId(id)) return null;
            const draft = read().drafts[TYPE]?.[id];
            return draft ? clonePromptData(draft) : null;
        },
        savePromptDraft(id, preset, { expectedRevision, expectedDraftRevision = null, editorFields } = {}) {
            const blocked = ready();
            if (blocked) return blocked;
            if (!validId(id) || preset?.id !== id || preset?.type !== TYPE) return fail('invalid-prompt-draft');
            const next = read(), existing = next.drafts[TYPE]?.[id];
            expectedRevision = promptRevision(next, id);
            // 草稿允许未完成的编辑，不能参与运行；来源版本独立于草稿版本。
            const draft = { preset: clonePromptData(preset), baseRevision: expectedRevision,
                revision: (existing?.revision ?? 0) + 1 };
            if (editorFields !== undefined) {
                if (!editorFields || typeof editorFields !== 'object' || Array.isArray(editorFields)
                    || Object.values(editorFields).some(value => typeof value !== 'string'))
                    return fail('invalid-prompt-draft-fields');
                draft.editorFields = clonePromptData(editorFields);
            }
            next.drafts[TYPE] ||= {};
            next.drafts[TYPE][id] = draft;
            return finish({ ok: true, next, draft });
        },
        removePromptDraft(id, expectedDraftRevision) {
            const blocked = ready();
            if (blocked) return blocked;
            if (!validId(id)) return fail('invalid-prompt-draft');
            const next = read(), existing = next.drafts[TYPE]?.[id];
            if (!existing) return { ok: true, changed: false };
            delete next.drafts[TYPE][id];
            return finish({ ok: true, next });
        },
    };
}
