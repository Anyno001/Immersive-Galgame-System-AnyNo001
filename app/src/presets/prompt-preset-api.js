import { previewPromptImport } from './prompt-preset-import.js';
import { promptRevision, stagePromptImport, stagePromptSave } from './prompt-preset-operations.js';
import { clonePromptData, validatePromptActivation } from './prompt-preset.js';
import { stagePromptDefaultUpgrade, stagePromptDefaultRestore } from './prompt-default-operations.js';

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
        ensureImagePromptDefault(preset) {
            const blocked = ready();
            if (blocked) return blocked;
            const next = read(), currentId = next.current[TYPE];
            if (currentId) {
                const current = next.items[TYPE]?.[currentId];
                if (current?.data?.usage !== 'imagegen') return fail('prompt-current-not-imagegen');
                if (currentId === preset?.id) {
                    const upgraded = finish(stagePromptDefaultUpgrade(next, preset));
                    return { ...upgraded, presetId: currentId };
                }
                return { ok: true, changed: false, presetId: currentId };
            }
            if (preset?.format !== 'igs_preset_v1' || preset?.type !== TYPE || !validId(preset.id))
                return fail('invalid-prompt-default');
            const existing = next.items[TYPE]?.[preset.id];
            const candidate = existing || preset;
            const checked = validatePromptActivation(candidate.data);
            if (!checked.ok) return { ok: false, reason: 'prompt-not-activatable', errors: checked.errors };
            next.items[TYPE] ||= {};
            next.items[TYPE][preset.id] = clonePromptData(candidate);
            next.current[TYPE] = preset.id;
            return finish({ ok: true, next, changed: true, presetId: preset.id });
        },
        upgradeImagePromptDefault(preset, expectedRevision) {
            const blocked = ready();
            if (blocked) return blocked;
            const snapshot = read();
            if (expectedRevision !== promptRevision(snapshot, preset?.id)) return fail('preset-revision-conflict');
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
            if (clearDraft && options.expectedDraftRevision !== (snapshot.drafts[TYPE]?.[preset?.id]?.revision ?? null))
                return fail('preset-revision-conflict');
            const staged = stagePromptSave(snapshot, preset, expectedRevision);
            if (staged.ok && clearDraft && staged.next.drafts[TYPE])
                delete staged.next.drafts[TYPE][preset.id];
            return finish(staged);
        },
        activateImagePromptPreset(id, expectedRevision) {
            const blocked = ready();
            if (blocked) return blocked;
            const next = read(), candidate = next.items[TYPE]?.[id];
            if (!candidate || expectedRevision !== promptRevision(next, id)) return fail('preset-revision-conflict');
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
            if (expectedRevision !== promptRevision(next, id)
                || expectedDraftRevision !== (next.drafts[TYPE]?.[id]?.revision ?? null))
                return fail('preset-revision-conflict');
            // 当前项不可删除：先显式切换到另一个合法保存版本。
            if (next.current[TYPE] === id) return fail('prompt-current-delete-blocked');
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
            if (expectedRevision !== promptRevision(next, id)
                || expectedDraftRevision !== (existing?.revision ?? null)) return fail('preset-revision-conflict');
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
            if (!existing || existing.revision !== expectedDraftRevision) return fail('preset-revision-conflict');
            delete next.drafts[TYPE][id];
            return finish({ ok: true, next });
        },
    };
}
