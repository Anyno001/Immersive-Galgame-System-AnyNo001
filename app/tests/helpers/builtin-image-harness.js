import assert from 'node:assert/strict';
import { createMemoryStorage } from '../../src/storage/preset-store.js';
import { createPresetRegistry } from '../../src/presets/preset-registry.js';
import { createImageBackend } from '../../src/generated-images/image-backend.js';
import { createBuiltinImageTaskRuntime } from '../../src/generated-images/builtin-image-task-runtime.js';
import { createImagePromptLlm } from '../../src/generated-images/image-prompt-runtime.js';
import { createNaiOfficialClient } from '../../src/generated-images/nai-official-client.js';
import { createNaiRequestQueue } from '../../src/generated-images/nai-request-queue.js';
import { characterWriteFixture, spriteDataReply } from './prompt-provenance.js';
import { pngFixture } from './png-fixture.js';

// 实际预设、解析、客户端和队列；只隔离写词 transport 与图像网络端口。
export function builtinImageHarness(options = {}) {
    const bridge = options.bridge || { imageApi: { mode: 'nai' }, autoIllustration: {
        nai: { apiKey: 'fixture-builtin', model: 'nai-diffusion-5-full', artistPrefix: 'artist:fixture' },
        assets: { spriteSize: '832x1216' } } };
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    const runtime = createBuiltinImageTaskRuntime({ readBridge: () => bridge, registry });
    const writes = [], wires = [], gates = [], events = [];
    let waitWriting = false, waitImages = false, active = 0, maxActive = 0;
    const pause = () => new Promise(resolve => gates.push(resolve));
    const llm = createImagePromptLlm({ async request(request, settings) {
        const inputs = request.messages.flatMap(message => {
            try { const value = JSON.parse(message.content);
                return value?.outputs?.format ? [value] : []; }
            catch { return []; }
        });
        assert.equal(inputs.length, 1, '隔离端口必须取得唯一任务资料');
        const [input] = inputs;
        writes.push({ request, settings, input }); events.push('write');
        options.beforeWrite?.(input);
        const reply = options.reply ? options.reply(input)
            : ['sprite-data', 'expression-fragments'].includes(input.outputs.format) ? spriteDataReply(input, { ...options, outfitDescription: 'wears a white dress' })
            : input.outputs.format === 'dna-template' ? templateReply(input, options)
            : '#1\nscene: wears a white dress\nchar:\nuc:';
        if (waitWriting) await pause();
        options.afterWrite?.(input);
        return reply;
    } }, registry, runtime);
    const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), random: () => 0.5,
        async fetch(_url, init) {
            assert.equal(init.method, 'POST');
            const body = JSON.parse(init.body);
            wires.push(body); events.push('paint'); active++; maxActive = Math.max(maxActive, active);
            try {
                options.beforePaint?.(body);
                if (waitImages) await pause();
                if (options.paintFailure?.()) return new Response('', { status: 500 });
                const { width, height } = body.parameters;
                return new Response(pngFixture(width, height).bytes, { headers: { 'Content-Type': 'image/png' } });
            } finally { active--; }
        } });

    const global = { get NaiDbGen() { assert.fail('内置链路不得探测 DBG'); } };
    const backend = createImageBackend({ nai: client, global, llm, taskRuntime: runtime, getBridge: () => bridge });
    return { bridge, registry, runtime, llm, backend, writes, wires, gates, events,
        waitWriting(value = true) { waitWriting = value; }, waitImages(value = true) { waitImages = value; },
        release() { gates.splice(0).forEach(resolve => resolve()); },
        get active() { return active; }, get maxActive() { return maxActive; },
        dispose() { gates.splice(0).forEach(resolve => resolve()); runtime.dispose(); } };
}

function templateReply(input, options) {
    const written = characterWriteFixture(input, { action: 'wears a white dress and smiles.',
        outfitDescription: 'wears a white dress' });
    options.transformWritten?.(written, input);
    return written.captions.slice().reverse().map(entry => {
        const positive = entry.caption.v4_prompt.caption, negative = entry.caption.v4_negative_prompt.caption;
        return [`slotid: ${entry.slotId}`, 'prompt_mode: dna_template',
            ...(entry.promptRecipe.outfitMode && ['outfit_mode: template']),
            `scene: ${positive.base_caption}`, `scene_uc: ${negative.base_caption}`,
            ...entry.promptRecipe.bindings.flatMap(binding => {
                const index = binding.captionIndex, character = entry.characterMeta.characters.find(c => c.captionIndex === index);
                const center = positive.char_captions[index].centers[0];
                const views = entry.dnaCandidates?.characters.find(c => c.characterKey === binding.characterKey)?.views || {};
                return [`char: ${center.x},${center.y} | ${positive.char_captions[index].char_caption}`,
                    `char_uc: ${negative.char_captions[index].char_caption}`,
                    `meta_kind: ${index} | ${binding.kind}`, `meta_key: ${index} | ${binding.characterKey}`,
                    `meta_token: ${index} | ${binding.token}`, `meta_frame: ${index} | ${binding.framing}`,
                    `meta_outfit_name: ${index} | ${character.outfit.name}`,
                    `meta_outfit_description: ${index} | ${character.outfit.description}`,
                    ...Object.entries(views).flatMap(([frame, view]) => [
                        ...(view.subject !== undefined ? [`meta_dna_${frame}: ${index} | ${view.subject}`] : []),
                        `meta_dna_uc_${frame}: ${index} | ${view.negative || ''}`])];
            })].join('\n');
    }).join('\n---\n');
}
