import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresetRegistry } from '../src/presets/preset-registry.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createPublicApi } from '../src/api/public-api.js';

async function imagePromptPresetFixture(id = 'prompt.fixture') {
    const { IMAGE_PROMPT_TASKS } = await import('../src/presets/prompt-preset.js');
    const prompts = [
        { identifier: 'shared', role: 'system', kind: 'shared', content: '共享规则' },
        { identifier: 'task', role: 'user', kind: 'task-slot', content: '{{任务提示词}}' },
        { identifier: 'data', role: 'user', kind: 'data-slot', content: '{{任务资料}}' },
        { identifier: 'end', role: 'assistant', kind: 'shared', content: '直接输出' },
    ];
    return { format: 'igs_preset_v1', type: 'prompt-preset', id, name: id, version: 1,
        data: { schemaVersion: 1, usage: 'imagegen', revision: 1, prompts,
            prompt_order: prompts.map(({ identifier }) => ({ identifier, enabled: true })),
            variables: ['任务提示词', '任务资料'],
            modules: IMAGE_PROMPT_TASKS.map((task) => ({ identifier: `module.${task}`, task,
                role: 'user', content: `执行 ${task}`, dataFields: ['description'], requiredFields: ['description'] })),
            taskMap: Object.fromEntries(IMAGE_PROMPT_TASKS.map((task) => [task, `module.${task}`])) } };
}

test('gate:presets:prompt-import-single-write-reload-and-explicit-conflicts', async () => {
    const memory = createMemoryStorage();
    let writes = 0;
    const storage = { ...memory, setItem(key, value) { writes += 1; memory.setItem(key, value); } };
    const registry = createPresetRegistry({ storage });
    const a = await imagePromptPresetFixture('a'), b = await imagePromptPresetFixture('b');
    const preview = registry.previewPromptImport({ items: [a, b] });
    assert.equal(preview.ok, true);
    assert.equal(writes, 0);
    assert.equal(registry.commitPromptImport(preview).ok, true);
    assert.equal(writes, 1);
    assert.equal(registry.getCurrent('prompt-preset'), null);
    assert.equal(registry.setCurrent('prompt-preset', 'a').ok, true);
    const reloaded = createPresetRegistry({ storage });
    assert.deepEqual(reloaded.getCurrent('prompt-preset'), a);
    const conflict = reloaded.previewPromptImport(a), before = reloaded.snapshot();
    assert.equal(reloaded.commitPromptImport(conflict).reason, 'preset-id-conflict');
    assert.deepEqual(reloaded.snapshot(), before);
    assert.equal(reloaded.commitPromptImport(conflict, { a: 'replace' }).ok, true);
    assert.equal(reloaded.getCurrent('prompt-preset').data.revision, 2);
    assert.equal(reloaded.commitPromptImport(conflict, { a: 'replace' }).ok, true);
    assert.equal(reloaded.getCurrent('prompt-preset').data.revision, 3);
});


test('gate:presets:prompt-draft-reload-isolated-from-current-and-versioned', async () => {
    const storage = createMemoryStorage(), registry = createPresetRegistry({ storage });
    const preset = await imagePromptPresetFixture();
    assert.equal(registry.savePromptPreset(preset, null).ok, true);
    assert.equal(registry.setCurrent('prompt-preset', preset.id).ok, true);
    const draft = structuredClone(preset);
    draft.data.prompts[0].content = '草稿，不参与运行';
    draft.data.modules = [];
    assert.equal(registry.savePromptDraft(preset.id, draft, { expectedRevision: 1 }).ok, true);
    assert.deepEqual(registry.getCurrent('prompt-preset'), preset);
    const reloaded = createPresetRegistry({ storage });
    assert.deepEqual(reloaded.getPromptDraft(preset.id).preset, draft);
    assert.deepEqual(reloaded.getCurrent('prompt-preset'), preset);
    assert.equal(reloaded.savePromptDraft(preset.id, draft, { expectedRevision: 1 }).ok, true);
    assert.equal(reloaded.savePromptDraft(preset.id, draft, { expectedRevision: 1, expectedDraftRevision: 1 }).ok, true);
    assert.equal(reloaded.removePromptDraft(preset.id, 1).ok, true);
    assert.equal(createPresetRegistry({ storage }).getPromptDraft(preset.id), null);
});

test('gate:presets:legacy-imagegen-import-preserves-source-and-rejects-recall-activation', () => {
    const source = { items: [
        { kind: 'imagegen', id: 'legacy.imagegen', name: 'Legacy image preset',
            prompts: [{ identifier: 'framework', role: 'system', content: 'Preserve {{description}}.' }],
            prompt_order: [{ identifier: 'framework', enabled: true }] },
        { kind: 'recall', id: 'legacy.recall', prompts: [] },
    ] };
    const registry = createPresetRegistry(), before = structuredClone(source);
    const preview = registry.previewPromptImport(JSON.stringify(source));
    assert.equal(preview.ok, true);
    assert.equal(preview.accepted.length, 1);
    assert.equal(preview.skipped.length, 1);
    assert.equal(preview.accepted[0].activatable, false);
    assert.equal(registry.commitPromptImport(preview).ok, true);
    const imagegen = source.items.find((item) => item.kind === 'imagegen');
    const saved = registry.exportPreset('prompt-preset', imagegen.id);
    assert.deepEqual(saved.data.prompts, imagegen.prompts);
    assert.deepEqual(saved.data.prompt_order, imagegen.prompt_order);
    assert.deepEqual(saved.data.compatibility.source, imagegen);
    assert.equal(registry.setCurrent('prompt-preset', imagegen.id).reason, 'prompt-not-activatable');
    assert.equal(registry.getCurrent('prompt-preset'), null);
    assert.equal(registry.previewPromptImport(source.items.filter((item) => item.kind === 'recall')[0]).ok, false);
    const restored = createPresetRegistry();
    assert.equal(restored.commitPromptImport(restored.previewPromptImport(saved)).ok, true);
    assert.deepEqual(restored.exportPreset('prompt-preset', imagegen.id), saved);
    assert.deepEqual(source, before);
});
