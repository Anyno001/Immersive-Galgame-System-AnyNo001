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

test('生成细线：生图服务的失败停红线并直接展开原因，点一下收起', () => {
    const t = fakeTimers();
    const strip = createGenerationStrip({ timers: t, now: t.now });
    strip.notice('error', '第 3 楼素材未发送生图请求：超时');
    assert.equal(strip.getState().phase, 'failed');
    assert.equal(strip.getState().tip, '第 3 楼素材未发送生图请求：超时');
    t.advance(10000);
    assert.equal(strip.getState().phase, 'failed');
});

test('生成细线：成功说明弹小字，没亮时也挂得上，读完再熄', () => {
    const t = fakeTimers();
    const strip = createGenerationStrip({ timers: t, now: t.now });
    strip.notice('info', '正在请求副 LLM…');
    assert.equal(strip.getState().phase, 'idle');
    strip.notice('success', '补全素材完成：已生成 2 项素材，待确认');
    assert.equal(strip.getState().tip, '补全素材完成：已生成 2 项素材，待确认');
    t.advance(1500);
    assert.notEqual(strip.getState().phase, 'idle');
    t.advance(5000);
    assert.equal(strip.getState().phase, 'idle');
    assert.equal(strip.getState().tip, '');
});

test('生成细线：忙完时结果小字不跟着闪一下就熄', () => {
    const t = fakeTimers();
    const strip = createGenerationStrip({ timers: t, now: t.now });
    strip.activity({ type: 'start', id: 'a', kind: 'background' });
    strip.notice('info', '第 2 楼缺少 1 项素材，正在请求副 LLM…');
    assert.equal(strip.getState().tip, '第 2 楼缺少 1 项素材，正在请求副 LLM…');
    strip.notice('success', '第 2 楼已生成 1 项素材，待确认');
    strip.activity({ type: 'end', id: 'a', kind: 'background', ok: true });
    t.advance(1300);
    assert.equal(strip.getState().phase, 'done');
    assert.equal(strip.getState().tip, '第 2 楼已生成 1 项素材，待确认');
});

test('一致性进度复用细线，各阶段有文字且终态只清理本任务', () => {
    const t = fakeTimers(), strip = createGenerationStrip({ timers: t, now: t.now });
    const task = {};
    for (const [phase, text] of [['prepare', '准备'], ['reference', '读取参考立绘'],
        ['write', '写提示词'], ['paint', '局部重绘'], ['compose', '合成候选']]) {
        strip.progress(task, { phase, done: 1, total: 3 });
        assert.equal(strip.getState().phase, 'busy');
        assert.equal(strip.getState().tip, `一致性重绘：${text} 1/3…`);
    }
    strip.activity({ type: 'start', id: 'other', kind: 'cg' });
    strip.progress(task, { phase: 'done' });
    assert.equal(strip.getState().jobs, 1);
    strip.activity({ type: 'end', id: 'other', ok: true });
    assert.equal(strip.getState().phase, 'done');
    t.advance(1300);
    assert.equal(strip.getState().phase, 'idle');
    strip.dispose();
});

test('来源中立和旧绘制入口每次只发一组活动事件，保留接收者', async () => {
    const events = [], input = { imageKind: 'sprite' };
    let calls = 0;
    const original = {
        async generateCaption(request) {
            assert.equal(this, original);
            assert.equal(request, input);
            calls += 1;
            return { ok: true, dataUrl: 'data:fake' };
        },
    };
    original.generateDbgenCaption = original.generateCaption;
    const backend = trackImageActivity(original, (event) => events.push(event));
    await backend.generateCaption(input);
    await backend.generateDbgenCaption(input);
    assert.equal(calls, 2);
    assert.deepEqual(events.map(({ type, kind }) => [type, kind]), [
        ['start', 'sprite'], ['end', 'sprite'], ['start', 'sprite'], ['end', 'sprite'],
    ]);
    assert.equal(events[0].id, events[1].id);
    assert.equal(events[2].id, events[3].id);
    assert.notEqual(events[0].id, events[2].id);
});
