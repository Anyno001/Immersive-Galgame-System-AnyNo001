import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyImageError } from '../src/generated-images/failure-classify.js';
import { createRateGate, withImageRetry, readImageRetrySettings } from '../src/generated-images/retry-policy.js';
import { createImageBackend } from '../src/generated-images/image-backend.js';
import { normalizeAutoIllustrationSettings } from '../src/generated-images/illustration/auto-illustration-settings.js';

const fast = () => ({ sleep: async () => {}, gate: createRateGate({ sleep: async () => {} }) });

test('gate:image-retry:classify-table', () => {
    const table = [
        [{ error: 'NAI 请求过于频繁（429）', status: 429 }, 'nai', 'rateLimit429', true],
        [{ error: 'x', status: 503 }, 'nai', 'server5xx', true],
        [{ error: 'NAI 请求超时' }, 'nai', 'timeout', true],
        [{ error: '智绘姬 240 秒内没有返回图片', reason: 'chatu8-timeout' }, 'chatu8', 'pluginTimeout', false],
        [{ error: '超过 180 秒没有返回，已放弃等待' }, 'dbgen', 'pluginTimeout', false],
        [{ error: '浏览器直连 NAI 失败（可能是 CORS 或网络不通）' }, 'nai', 'network', true],
        [{ error: '柏宝绘没有返回图片' }, 'baibai', 'emptyOrBroken', true],
        [{ error: 'NAI 图片响应解析失败' }, 'nai', 'emptyOrBroken', true],
        [{ error: '图片被内容审核拦截 moderation' }, 'baibai', 'moderation', false],
        [{ error: 'NAI 鉴权失败（401）', status: 401 }, 'nai', 'authOrParam', false],
        [{ error: '请先在设置中填写 NAI Key' }, 'nai', 'authOrParam', false],
        [{ error: '未检测到智绘姬' }, 'chatu8', 'authOrParam', false],
        [{ error: '智绘姬出图失败：未知错误' }, 'chatu8', 'unknown', true],
        ['随便什么', 'nai', 'unknown', true],
    ];
    for (const [input, source, kind, retryable] of table) {
        const got = classifyImageError(input, { source });
        assert.equal(got.kind, kind, JSON.stringify(input));
        assert.equal(got.retryable, retryable, JSON.stringify(input));
        assert.ok(got.reason);
    }
});

test('gate:image-retry:retries-twice-then-reports-failure', async () => {
    let calls = 0;
    const events = [];
    const result = await withImageRetry(async () => { calls += 1; return { ok: false, error: 'x', status: 502 }; },
        { source: 'baibai', settings: { enabled: true, times: 2 }, onRetry: (e) => events.push(e.text), ...fast() });
    assert.equal(calls, 3);
    assert.equal(events.length, 2);
    assert.equal(result.ok, false);
    assert.equal(result.failure.kind, 'server5xx');
    assert.equal(result.failure.attempts, 3);
    const ok = await withImageRetry(async ({ attempt }) => (attempt < 1 ? { ok: false, error: '没有返回图片' } : { ok: true, dataUrl: 'd' }),
        { source: 'dbgen', settings: { enabled: true, times: 2 }, ...fast() });
    assert.equal(ok.ok, true);
});
