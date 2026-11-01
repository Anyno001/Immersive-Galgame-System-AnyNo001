import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildNaiV4Request } from '../src/generated-images/request-builders/nai-v4-builder.js';
import { buildNaiInpaintRequest, resolveNaiInpaintModel } from '../src/generated-images/request-builders/nai-inpaint-builder.js';
import { createNaiOfficialClient } from '../src/generated-images/nai-official-client.js';
import { createNaiRequestQueue } from '../src/generated-images/nai-request-queue.js';
import { normalizeAutoIllustrationSettings } from '../src/generated-images/illustration/auto-illustration-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { applyProfileValues, collectProfileValues, isImmediateSavePath } from '../src/visual/igs-ui/settings-model-profiles.js';
import { bootstrapIGS, createMemoryStorage } from '../src/index.js';
import { builtinImageHarness } from './helpers/builtin-image-harness.js';
import { pngFixture } from './helpers/png-fixture.js';

const FULL = 'nai-diffusion-5-full';
const MEDIUM = 'nai-diffusion-5-full-medium';
const path = 'bridge.autoIllustration.nai.effort';
const slot = { scene: 'A quiet room.', sceneUc: 'text', transparent: true, chars: [{ tags: 'a person', uc: 'hat', x: 0.3, y: 0.7 }] };
const settings = { model: FULL, steps: 23, sampler: 'k_euler', seed: 123, size: '64x128' };
const imageResponse = () => new Response(JSON.stringify({ image: 'data:image/png;base64,AAAA' }), { headers: { 'Content-Type': 'application/json' } });

function assertMedium(body, model = MEDIUM) {
    assert.equal(body.model, model);
    assert.equal(body.parameters.steps, 14);
    assert.equal(body.parameters.sampler, 'k_euler_ancestral');
    assert.equal(Object.hasOwn(body.parameters, 'cfg_rescale'), false);
    assert.equal(Object.hasOwn(body.parameters, 'skip_cfg_above_sigma'), false);
    assert.equal(Object.hasOwn(body, 'effort'), false);
    assert.equal(Object.hasOwn(body.parameters, 'effort'), false);
}

test('Medium 真正换模型并约束参数，保留 caption、透明底和原 High 配置', () => {
    const original = structuredClone({ slot, settings });
    const high = buildNaiV4Request(slot, settings);
    const medium = buildNaiV4Request(slot, { ...settings, effort: 'medium' });
    assertMedium(medium);
    assert.equal(medium.parameters.straight_alpha, true);
    assert.equal(medium.parameters.seed, 123);
    assert.deepEqual(medium.parameters.v4_prompt, high.parameters.v4_prompt);
    assert.deepEqual(medium.parameters.v4_negative_prompt, high.parameters.v4_negative_prompt);
    assert.deepEqual({ slot, settings }, original);
    assert.deepEqual(buildNaiV4Request(slot, { ...settings, effort: 'high' }), high);
    assert.equal(high.parameters.steps, 23);
    assert.equal(high.parameters.sampler, 'k_euler');
});

test('V4、V4.5、V5 Curated 不受 Medium 开关影响；显式 Medium 模型仍固定参数', () => {
    for (const model of ['nai-diffusion-4-full', 'nai-diffusion-4-5-full', 'nai-diffusion-5-curated', 'custom-model']) {
        assert.deepEqual(buildNaiV4Request(slot, { ...settings, model, effort: 'medium' }), buildNaiV4Request(slot, { ...settings, model }));
    }
    assertMedium(buildNaiV4Request(slot, { ...settings, model: MEDIUM, effort: 'high', steps: 40 }));
});

test('定稿 caption 的 Medium 请求和发送快照保持原正文、角色分段和画师', async () => {
    const caption = { v4_prompt: { caption: { base_caption: 'room', char_captions: [{ char_caption: 'person', centers: [{ x: 0.3, y: 0.7 }] }] } },
        v4_negative_prompt: { caption: { base_caption: 'text', char_captions: [{ char_caption: 'hat' }] } } };
    const original = structuredClone(caption);
    const final = { caption, captionMode: 'final', transparent: true };
    const nai = { ...settings, effort: 'medium', apiKey: 'fixture-key', finalArtist: { positivePrompt: 'artist:fixture', negativePrompt: 'blur' } };
    let wire;
    const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (_url, init) => {
        wire = JSON.parse(init.body); return imageResponse();
    } });
    const result = await client.generate(final, nai);
    assert.equal(result.ok, true);
    assertMedium(wire);
    assert.equal(result.sentPrompt.model, MEDIUM);
    assert.equal(wire.parameters.v4_prompt.caption.base_caption, 'artist:fixture, room');
    assert.equal(wire.parameters.v4_negative_prompt.caption.base_caption, 'blur, text');
    assert.deepEqual(wire.parameters.v4_prompt.caption.char_captions, original.v4_prompt.caption.char_captions);
    assert.equal(wire.parameters.tag_hint_qt, 0);
    assert.equal(wire.parameters.tag_hint_uc_preset, 0);
    assert.deepEqual(caption, original);
});

test('局部重绘和显式覆盖模型使用相应 Medium 专模，V4.5 编辑仍用原参数', () => {
    const png = pngFixture(64, 128).dataUrl;
    const request = { prompt: 'room', width: 64, height: 128, sourceDataUrl: png, maskDataUrl: png };
    for (const model of [FULL, MEDIUM, `${FULL}-inpainting`, `${MEDIUM}-inpainting`]) {
        const result = buildNaiInpaintRequest({ ...request, model }, { ...settings, model: 'nai-diffusion-4-5-full', effort: 'medium' });
        assert.equal(result.ok, true);
        assertMedium(result.body, `${MEDIUM}-inpainting`);
        assert.equal(result.body.action, 'infill');
        assert.equal(result.body.parameters.straight_alpha, false);
        assert.ok(result.body.parameters.image && result.body.parameters.mask);
    }
    const v45 = buildNaiInpaintRequest({ ...request, model: 'nai-diffusion-4-5-full' }, { ...settings, effort: 'medium' });
    assert.equal(v45.body.model, 'nai-diffusion-4-5-full-inpainting');
    assert.equal(v45.body.parameters.steps, 23);
    assert.equal(resolveNaiInpaintModel('nai-diffusion-5-curated', 'medium'), '');
    assert.equal(resolveNaiInpaintModel('unknown-medium-inpainting', 'medium'), '');
});

test('真实客户端的直连、酒馆代理和重绘 wire 都发送 Medium，计时显示实际模型', async () => {
    const wires = [];
    const client = createNaiOfficialClient({ queue: createNaiRequestQueue(), fetch: async (url, init) => {
        wires.push({ url, body: JSON.parse(init.body) }); return imageResponse();
    } });
    const nai = { ...settings, apiKey: 'fixture-key', effort: 'medium', minIntervalMs: 0 };
    for (const transport of ['direct', 'st-proxy']) {
        const result = await client.generate(slot, { ...nai, transport });
        assert.equal(result.ok, true);
        assert.match(result.timing.params, /nai-diffusion-5-full-medium .*14步 采样k_euler_ancestral/);
    }
    const png = pngFixture(64, 128).dataUrl;
    assert.equal(client.supportsEdit(nai), true);
    const edit = await client.edit({ prompt: 'room', width: 64, height: 128, sourceDataUrl: png, maskDataUrl: png }, nai);
    assert.equal(edit.ok, true);
    assert.match(edit.timing.params, /nai-diffusion-5-full-medium-inpainting/);
    assert.equal(wires[0].url, 'https://image.novelai.net/ai/generate-image');
    assert.equal(wires[1].url, '/proxy/https://image.novelai.net/ai/generate-image');
    wires.forEach(({ body }, i) => assertMedium(body, i === 2 ? `${MEDIUM}-inpainting` : MEDIUM));
});

test('正式任务链先解析 CG、立绘、背景、物品的模型覆盖，再应用档位', async () => {
    const h = builtinImageHarness({ bridge: { imageApi: { mode: 'nai', cgModel: 'nai-diffusion-4-5-full', spriteModel: FULL,
        backgroundModel: 'nai-diffusion-5-curated', itemModel: FULL }, autoIllustration: { nai: {
        ...settings, effort: 'medium', apiKey: 'fixture-key', minIntervalMs: 0 } } } });
    try {
        for (const imageKind of ['cg', 'sprite', 'background', 'item']) {
            const result = await h.backend.generate(slot, {}, { imageKind, size: '64x128' });
            assert.equal(result.ok, true, imageKind);
        }
        assert.deepEqual(h.wires.map(body => body.model), ['nai-diffusion-4-5-full', MEDIUM, 'nai-diffusion-5-curated', MEDIUM]);
        assert.deepEqual(h.wires.map(body => body.parameters.steps), [23, 14, 23, 14]);
        // 主模型不是 V5，单独给 CG 选 V5 Full 时也应生效。
        h.bridge.autoIllustration.nai.model = 'nai-diffusion-4-5-full';
        h.bridge.imageApi.cgModel = FULL;
        assert.equal((await h.backend.generate(slot, {}, { imageKind: 'cg', size: '64x128' })).ok, true);
        assertMedium(h.wires.at(-1));
    } finally { h.dispose(); }
});

test('旧配置与旧预设保留 High，Medium 设置和模型预设可往返', () => {
    assert.equal(normalizeAutoIllustrationSettings({}).nai.effort, 'high');
    assert.equal(normalizeAutoIllustrationSettings({ nai: { effort: 'unknown' } }).nai.effort, 'high');
    assert.equal(normalizeSettingsValue(path, 'medium'), 'medium');
    const draft = { bridge: { autoIllustration: { nai: { ...settings, effort: 'medium' } } } };
    const profile = collectProfileValues('image', draft);
    draft.bridge.autoIllustration.nai.effort = 'high';
    applyProfileValues('image', profile, draft);
    assert.equal(draft.bridge.autoIllustration.nai.effort, 'medium');
    applyProfileValues('image', { 'bridge.autoIllustration.nai.model': FULL }, draft);
    assert.equal(draft.bridge.autoIllustration.nai.effort, 'high');
    assert.equal(draft.bridge.autoIllustration.nai.steps, 23);
    assert.equal(isImmediateSavePath(path), true);
});

test('设置页切 Medium 显示固定参数，保存重开再切 High 恢复原参数', async () => {
    const app = bootstrapIGS({ global: { localStorage: createMemoryStorage() }, autoAttachMagicWand: false,
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    const base = 'bridge.autoIllustration.nai';
    const read = panel => {
        const dom = new JSDOM(panel.getSnapshot().html), doc = dom.window.document;
        const result = Object.fromEntries(['steps', 'sampler', 'effort'].map(key => {
            const input = doc.querySelector(`[data-path="${base}.${key}"]`);
            return [key, { value: input.value, disabled: input.disabled, hidden: Boolean(input.closest('[hidden]')) }];
        }));
        dom.window.close(); return result;
    };
    try {
        let panel = app.openSettings({ page: 'source' }).controller;
        for (const [field, value] of [['bridge.imageApi.mode', 'nai'], [`${base}.model`, FULL], [`${base}.minIntervalMs`, 20000], [`${base}.steps`, 23], [`${base}.sampler`, 'k_euler'], [path, 'medium']])
            assert.equal(panel.setValue(field, value).ok, true);
        assert.deepEqual(read(panel), { steps: { value: '14', disabled: true, hidden: false },
            sampler: { value: 'k_euler_ancestral', disabled: true, hidden: false }, effort: { value: 'medium', disabled: false, hidden: false } });
        assert.equal(panel.getSnapshot().draft.bridge.autoIllustration.nai.steps, 23);
        assert.equal((await panel.close()).ok, true);
        panel = app.openSettings({ page: 'source' }).controller;
        assert.equal(panel.getSnapshot().draft.bridge.autoIllustration.nai.minIntervalMs, 20000);
        assert.equal(read(panel).effort.value, 'medium');
        assert.equal(panel.setValue(path, 'high').ok, true);
        assert.equal(read(panel).steps.value, '23');
        assert.equal(read(panel).steps.disabled, false);
        assert.equal(read(panel).sampler.value, 'k_euler');
        assert.equal(read(panel).sampler.disabled, false);
        assert.equal(panel.setValue(`${base}.model`, MEDIUM).ok, true);
        assert.equal(read(panel).effort.value, 'medium');
        assert.equal(read(panel).effort.disabled, true);
        assert.equal(read(panel).steps.value, '14');
        assert.equal((await panel.close()).ok, true);
    } finally { await app.shutdown(); }
});
