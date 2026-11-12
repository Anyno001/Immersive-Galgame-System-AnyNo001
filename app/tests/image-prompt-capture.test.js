import test from 'node:test';
import assert from 'node:assert/strict';
import { capturePrompt, clearPromptCaptures, formatPromptCapture, listPromptCaptures } from '../src/generated-images/image-prompt-capture.js';

const wire = (n, extra = {}) => ({
    input: `artist:foo, 1girl, ${'long prompt '.repeat(60)}#${n}`,
    model: 'nai-diffusion-4-5-full',
    action: 'generate',
    parameters: { width: 832, height: 1216, steps: 28, sampler: 'k_euler', negative_prompt: 'bad hands', ...extra },
});

test('捕获后图片 base64 被省略且正面词完整保留', () => {
    clearPromptCaptures();
    const big = 'A'.repeat(40000);
    const entry = capturePrompt(wire(1, { image: big, mask: big }), { endpointKind: '官网', transport: '直连' });
    assert.match(entry.body.parameters.image, /^\[图片已省略，约\d+ KB\]$/);
    assert.match(entry.body.parameters.mask, /^\[图片已省略/);
    const text = formatPromptCapture(entry);
    assert.ok(text.includes(wire(1).input));
    assert.ok(!text.includes(big));
    assert.ok(!('apiKey' in entry.body));
});

test('超过8条只留最近8条且新的在前', () => {
    clearPromptCaptures();
    for (let i = 0; i < 12; i += 1) capturePrompt(wire(i));
    const list = listPromptCaptures();
    assert.equal(list.length, 8);
    assert.ok(list[0].body.input.endsWith('#11'));
    assert.ok(list[7].body.input.endsWith('#4'));
});
