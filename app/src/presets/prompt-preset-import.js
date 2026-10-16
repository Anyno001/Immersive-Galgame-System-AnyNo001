import { clonePromptData, validatePromptActivation, validatePromptPreset } from './prompt-preset.js';
import { parsePromptImportJson } from './prompt-import-json.js';

// 导入只读取调用者给出的文件，不探测插件、凭据或宿主宏。
export function previewPromptImport(input, snapshot) {
    let source;
    try { source = typeof input === 'string' ? parsePromptImportJson(input) : clonePromptData(input); }
    catch (error) {
        return { ok: false, reason: error?.message === 'duplicate-json-field' ? 'duplicate-json-field' : 'invalid-json',
            accepted: [], rejected: [], skipped: [] };
    }
    const items = Array.isArray(source?.items) ? source.items : [source];
    const accepted = [], rejected = [], skipped = [], ids = new Set();
    for (const item of items) {
        if (item?.kind === 'recall') { skipped.push({ id: item.id, reason: 'recall-not-executed' }); continue; }
        let manifest;
        if (item?.type === 'prompt-preset') manifest = item;
        else if (item?.kind === 'imagegen' && Array.isArray(item.prompts)) {
            const { id, name, ...original } = item;
            manifest = { format: 'igs_preset_v1', type: 'prompt-preset', id, name: name || id, version: 1,
                data: { ...original, usage: 'imagegen', schemaVersion: 1, revision: 1,
                    prompt_order: item.prompt_order ?? item.prompts.map(({ identifier, enabled }) => ({ identifier, enabled: enabled !== false })),
                    modules: [], taskMap: {}, variables: [], compatibility: { format: 'dbgen', source: item } } };
        } else { rejected.push({ id: item?.id, reason: 'unsupported-prompt-format' }); continue; }
        const id = manifest.id;
        if (typeof id !== 'string' || !id.trim() || ['__proto__', 'constructor', 'prototype'].includes(id)
            || ids.has(id)) { rejected.push({ id, reason: 'invalid-or-duplicate-id' }); continue; }
        ids.add(id);
        if (manifest.data?.usage !== 'imagegen') { rejected.push({ id, reason: 'not-imagegen' }); continue; }
        const validation = validatePromptPreset(manifest.data);
        if (!validation.ok) { rejected.push({ id, reason: 'invalid-prompt-preset', errors: validation.errors }); continue; }
        const activation = validatePromptActivation(manifest.data);
        const existing = snapshot.items?.['prompt-preset']?.[id];
        accepted.push({ manifest: clonePromptData(manifest), id, activatable: activation.ok,
            issues: activation.errors, conflict: Boolean(existing),
            expectedRevision: existing?.data?.revision ?? null });
    }
    return { ok: !rejected.length && accepted.length > 0, reason: accepted.length ? '' : 'no-imagegen-presets',
        registryRevision: snapshot.revision, accepted, rejected, skipped };
}
