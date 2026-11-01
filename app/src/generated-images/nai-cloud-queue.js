import { imageSha256 } from '../media/image-sha256.js';
import { normalizeNaiCloudQueue, validNaiQueueEndpoint } from './nai-cloud-queue-settings.js';

const failure = (reason, error) => ({ ok: false, reason, error, recoveryStopped: true });
const cancelled = () => failure('request-stale', '任务已取消或目标失效，已停止云端排队');
const id = () => globalThis.crypto?.randomUUID?.() || `igs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

function wait(ms, signal) {
    return new Promise(resolve => {
        const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve(); };
        const timer = setTimeout(finish, ms);
        signal?.addEventListener('abort', finish, { once: true });
        if (signal?.aborted) finish();
    });
}

// 只传排队身份；不接收提示词、图片，不向队列发送 NAI Authorization。
export function createNaiCloudQueue({ fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
    now = Date.now, sleep = wait, makeId = id, requestTimeoutMs = 10000 } = {}) {
    const userId = makeId();
    async function acquire(apiKey, input, controls = {}) {
        const config = normalizeNaiCloudQueue(input);
        if (!validNaiQueueEndpoint(config.endpoint))
            return failure('nai-cloud-queue-config', '请填写有效的云端队列服务地址（不含账号、查询参数或片段）');
        const allowed = () => {
            try { return !controls.signal?.aborted && (!controls.shouldStart || controls.shouldStart() === true); }
            catch { return false; }
        };
        const report = (message, level = 'info') => { try { controls.onQueueEvent?.(level, message); } catch { /* 日志不改变任务。 */ } };
        if (!allowed()) return cancelled();
        const identity = { key_hash: await imageSha256(new TextEncoder().encode(String(apiKey).trim())),
            user_id: userId, task_id: makeId() };
        if (!allowed()) return cancelled();
        let token = null, ended = false;
        const deadline = now() + config.timeoutMs;

        async function request(path, { signal, budget = requestTimeoutMs, cleanup = false } = {}) {
            const controller = new AbortController();
            let timer, stop;
            const init = { method: path === '/my-turn' ? 'GET' : 'POST',
                mode: 'cors', credentials: 'omit', redirect: 'error', signal: controller.signal };
            let url = config.endpoint + path;
            if (init.method === 'GET') url += `?${new URLSearchParams(identity)}`;
            else {
                init.headers = { 'Content-Type': 'application/json' };
                init.body = JSON.stringify({ ...identity, ...(path === '/join-queue' ? { greeting: null } : { lock_token: token }) });
            }
            const stopped = new Promise((_, reject) => {
                stop = () => { controller.abort(); reject(new Error('cancelled')); };
                signal?.addEventListener('abort', stop, { once: true });
                timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, Math.max(1, budget));
                if (signal?.aborted) stop();
            });
            const pending = Promise.resolve().then(() => fetchImpl(url, init)).then(async response => {
                if (!response.ok) throw new Error('queue-http');
                const data = await response.json();
                if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('queue-protocol');
                // 加入回执在取消后才到达时，再退出同一任务，防止后端迟到入队。
                if (path === '/join-queue' && ended && !cleanup) void leave();
                return data;
            });
            try { return await Promise.race([pending, stopped]); }
            finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); }
        }
        async function leave() {
            try {
                const result = await request('/leave-queue', { cleanup: true });
                if (result.status !== 'ok' && result.status !== 'ignored') throw new Error('queue-protocol');
            } catch { report('云端队列退出未确认，将由服务端过期回收', 'warn'); }
        }
        const grant = data => typeof data.lock_token === 'string' && data.lock_token.length > 0
            && data.lock_token.length <= 512;
        const queueRequest = path => request(path, { signal: controls.signal,
            budget: Math.min(requestTimeoutMs, deadline - now()) });
        try {
            report('云端队列：正在取号');
            let data = await queueRequest('/join-queue');
            let errors = 0, position = -1;
            while (true) {
                if (!allowed()) throw new Error('cancelled');
                if (now() >= deadline) throw new Error('queue-timeout');
                if ((data.is_my_turn === true || data.position === 0) && grant(data)) {
                    token = data.lock_token;
                    report('云端队列：已获放行，准备生成');
                    await sleep(Math.min(1000, deadline - now()), controls.signal);
                    if (!allowed()) throw new Error('cancelled');
                    if (now() >= deadline) throw new Error('queue-timeout');
                    break;
                }
                if (!Number.isInteger(data.position) || data.position < 0 || data.position === 0)
                    throw new Error('queue-protocol');
                if (position !== data.position) {
                    position = data.position;
                    report(`云端队列：正在等候，第 ${position + 1} 位`);
                }
                await sleep(Math.min(1000, deadline - now()), controls.signal);
                if (!allowed()) throw new Error('cancelled');
                if (now() >= deadline) throw new Error('queue-timeout');
                try { data = await queueRequest('/my-turn'); errors = 0; }
                catch (error) {
                    if (!allowed() || now() >= deadline || ++errors >= 3) throw error;
                }
            }
            return { ok: true, lease: {
                // 公共协议没有续租；每次实际发送（含 429 重试）前检查原任务和 token。
                async verify() {
                    if (!allowed()) return cancelled();
                    try {
                        const data = await request('/my-turn', { signal: controls.signal });
                        if (data.is_my_turn === true && data.lock_token === token && allowed()) return { ok: true };
                    } catch { /* 不相信旧放行结果，不绕过队列发送。 */ }
                    return allowed() ? failure('nai-cloud-queue-lock-lost', '云端队列锁已失效或无法确认，已停止发送；可稍后重新生成') : cancelled();
                },
                async finish(knownFinished = true) {
                    if (ended) return;
                    ended = true;
                    if (!knownFinished) {
                        report('NAI 发送状态未知，未提前释放云端锁，等待服务端过期回收', 'warn');
                        return;
                    }
                    try {
                        const result = await request('/complete', { cleanup: true });
                        if (result.status !== 'ok') throw new Error('queue-protocol');
                        report('云端队列：本次任务已结束');
                    } catch { report('云端队列释放未确认，图片结果保留，将由服务端过期回收', 'warn'); }
                },
            } };
        } catch {
            ended = true;
            await leave();
            if (!allowed()) return cancelled();
            return now() >= deadline
                ? failure('nai-cloud-queue-timeout', '云端排队超时，已退出队列；未发送生图请求')
                : failure('nai-cloud-queue-unavailable', '云端队列不可用或回复无效，已停止本次生成；未绕过队列发送');
        }
    }
    return { acquire };
}
