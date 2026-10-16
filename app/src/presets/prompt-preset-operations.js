import { clonePromptData, validatePromptActivation, validatePromptPreset } from './prompt-preset.js';
import { previewPromptImport } from './prompt-preset-import.js';

const TYPE = 'prompt-preset';
export const promptRevision = (snapshot, id) => snapshot.items[TYPE]?.[id]?.data?.revision ?? null;
const failure = (reason, errors = []) => ({ ok: false, reason, errors });

// 预览只作为候选输入，提交时重新解析与校验，不信任 UI 的 activatable 标记。
export function stagePromptImport(snapshot, preview, choices = {}) {
    if (!preview?.ok || !Array.isArray(preview.accepted)) return failure('invalid-import-preview');
    if (preview.registryRevision !== snapshot.revision) return failure('preset-revision-conflict');
    const checked = previewPromptImport({ items: preview.accepted.map((entry) => entry.manifest) }, snapshot);
    if (!checked.ok) return failure('invalid-prompt-import', checked.rejected);
    const next = clonePromptData(snapshot), accepted = [];
    next.items[TYPE] ||= {};
    for (const entry of checked.accepted) {
        const original = preview.accepted.find((item) => item.id === entry.id);
        const existing = next.items[TYPE][entry.id];
        if (original.expectedRevision !== promptRevision(snapshot, entry.id)) return failure('preset-revision-conflict');
        const choice = choices[entry.id];
        if (existing && choice === 'skip') continue;
        if (existing && choice !== 'replace') return failure('preset-id-conflict');
        const manifest = clonePromptData(entry.manifest);
        if (existing) manifest.data.revision = Math.max(existing.data.revision || 0, manifest.data.revision) + 1;
        if (next.current[TYPE] === entry.id) {
            const active = validatePromptActivation(manifest.data);
            if (!active.ok) return failure('prompt-not-activatable', active.errors);
        }
        next.items[TYPE][entry.id] = manifest;
        accepted.push(manifest);
    }
    return { ok: true, next, accepted, changed: accepted.length > 0 };
}

export function stagePromptSave(snapshot, preset, expectedRevision) {
    if (preset?.type !== TYPE || typeof preset.id !== 'string' || !preset.id.trim()
        || ['__proto__', 'constructor', 'prototype'].includes(preset.id)) return failure('invalid-prompt-preset');
    if (expectedRevision !== promptRevision(snapshot, preset.id)) return failure('preset-revision-conflict');
    const candidate = clonePromptData(preset);
    const checked = validatePromptPreset(candidate.data);
    if (!checked.ok || candidate.data?.usage !== 'imagegen') return failure('invalid-prompt-preset', checked.errors);
    candidate.data.revision = (expectedRevision ?? 0) + 1;
    if (snapshot.current[TYPE] === candidate.id) {
        const active = validatePromptActivation(candidate.data);
        if (!active.ok) return failure('prompt-not-activatable', active.errors);
    }
    const next = clonePromptData(snapshot);
    next.items[TYPE] ||= {};
    next.items[TYPE][candidate.id] = candidate;
    return { ok: true, next, item: candidate };
}
