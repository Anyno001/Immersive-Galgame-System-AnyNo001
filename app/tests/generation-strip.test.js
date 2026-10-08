import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationStrip } from '../src/visual/igs-ui/generation-strip.js';
import { trackImageActivity } from '../src/generated-images/generation-activity.js';

function fakeTimers() {
    let clock = 0;
    let seq = 0;
    const pending = new Map();
    return {
        now: () => clock,
        setTimeout: (fn, ms) => { seq += 1; pending.set(seq, { fn, at: clock + ms }); return seq; },
        clearTimeout: (id) => pending.delete(id),
        advance(ms) {
            clock += ms;
            for (const [id, job] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
                if (job.at <= clock && pending.has(id)) { pending.delete(id); job.fn(); }
            }
        },
    };
}

test('生成细线：开始亮、结束闪一下再熄', () => {
    const t = fakeTimers();
    const strip = createGenerationStrip({ timers: t, now: t.now });
    strip.activity({ type: 'start', id: 'a', kind: 'sprite' });
    strip.activity({ type: 'start', id: 'b', kind: 'cg' });
    assert.equal(strip.getState().phase, 'busy');
    strip.activity({ type: 'end', id: 'a', kind: 'sprite', ok: true });
    assert.equal(strip.getState().phase, 'busy');
    strip.activity({ type: 'end', id: 'b', kind: 'cg', ok: true });
    assert.equal(strip.getState().phase, 'done');
    t.advance(1300);
    assert.equal(strip.getState().phase, 'idle');
});

test('生成细线：失败停住，带原因', () => {
    const t = fakeTimers();
    const strip = createGenerationStrip({ timers: t, now: t.now });
    strip.activity({ type: 'start', id: 'a', kind: 'item' });
    strip.activity({ type: 'end', id: 'a', kind: 'item', ok: false, error: '额度不足' });
    t.advance(5000);
    assert.equal(strip.getState().phase, 'failed');
    assert.deepEqual(strip.getState().failure, { kind: 'item', error: '额度不足' });
});

test('生成细线：手动出图先亮再按时熄；楼层进度漏发完成时 2 分钟兜底', () => {
    const t = fakeTimers();
    const strip = createGenerationStrip({ timers: t, now: t.now });
    strip.manual();
    assert.equal(strip.getState().phase, 'busy');
    assert.equal(strip.getState().tip, '生图中…');
    t.advance(6100);
    assert.equal(strip.getState().phase, 'done');
    t.advance(1300);
    assert.equal(strip.getState().phase, 'idle');
    strip.floor(12, false);
    assert.equal(strip.getState().phase, 'busy');
    t.advance(121000);
    assert.notEqual(strip.getState().phase, 'busy');
});

test('出图入口包一层：开始 / 结束事件带种类和成败', async () => {
    const events = [];
    const backend = trackImageActivity({
        generate: async () => ({ ok: true, dataUrl: 'data:x' }),
        generateDbgenCaption: async () => ({ ok: false, error: '插件没开' }),
        generateForReader: async () => ({ delegate: true }),
        describe: () => ({ mode: 'nai' }),
    }, (event) => events.push(event));
    await backend.generate({}, {}, { imageKind: 'item' });
    await backend.generateDbgenCaption({ imageKind: 'background' });
    await backend.generateForReader({});
    assert.deepEqual(events.map((e) => [e.type, e.kind, e.ok ?? null]), [
        ['start', 'item', null], ['end', 'item', true],
        ['start', 'background', null], ['end', 'background', false],
        ['start', 'cg', null], ['end', 'cg', null],
    ]);
    assert.equal(events[3].error, '插件没开');
    assert.equal(backend.describe().mode, 'nai');
});
