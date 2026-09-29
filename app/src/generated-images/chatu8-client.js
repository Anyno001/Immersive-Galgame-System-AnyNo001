// 智绘姬（st-chatu8）出图桥。
// 智绘姬没有公开 API；它内部各功能（如服装图）共用酒馆全局 eventSource 上的
// generate-image-request / generate-image-response 事件出图，按 id 配对结果。
// 本模块只负责发请求、等回执、归一化结果；图片转 dataUrl 与 NAI 兜底由 image-backend 处理。
export const CHATU8_REQUEST_EVENT = 'generate-image-request';
export const CHATU8_RESPONSE_EVENT = 'generate-image-response';
export const CHATU8_DEFAULT_TIMEOUT_MS = 240000;
// 智绘姬加载后挂在主窗口上的函数，用来判断插件已安装且已启用。
const CHATU8_MARKERS = Object.freeze(['showChatuSettingsPanel', 'loadSilterTavernChatu8Settings']);

function candidateWindows(globalObject) {
    const list = [];
    const push = (read) => {
        try {
            const win = read();
            if (win && !list.includes(win)) list.push(win);
        } catch (error) { /* 跨域窗口 */ }
    };
    push(() => globalObject);
    push(() => globalObject && globalObject.parent);
    push(() => globalObject && globalObject.top);
    return list;
}

function readEventSource(win) {
    try {
        const st = win.SillyTavern;
        const ctx = st && typeof st.getContext === 'function' ? st.getContext() : null;
        const source = (ctx && ctx.eventSource) || win.eventSource;
        return source && typeof source.on === 'function' && typeof source.emit === 'function' ? source : null;
    } catch (error) {
        return null;
    }
}

export function findChatu8Host(globalObject = globalThis) {
    for (const win of candidateWindows(globalObject)) {
        let installed = false;
        try { installed = CHATU8_MARKERS.some((name) => typeof win[name] === 'function'); } catch (error) { installed = false; }
        if (!installed) continue;
        const eventSource = readEventSource(win);
        if (eventSource) return { win, eventSource };
    }
    return null;
}

function detach(eventSource, handler) {
    const off = typeof eventSource.removeListener === 'function' ? eventSource.removeListener : eventSource.off;
    if (typeof off !== 'function') return;
    try { off.call(eventSource, CHATU8_RESPONSE_EVENT, handler); } catch (error) { /* 已解绑 */ }
}

let requestSeq = 0;
function nextRequestId() {
    requestSeq += 1;
    return `igs-chatu8-${Date.now().toString(36)}-${requestSeq}`;
}

// 发一次出图请求并等待同 id 的回执。结果：{ ok: true, imageData } 或 { ok: false, reason, error }。
// imageData 原样返回（可能是 data URL、blob URL 或同源路径），转换由调用方负责。
export function requestChatu8Image(host, prompt, options = {}) {
    const text = String(prompt || '').trim();
    if (!host || !host.eventSource) return Promise.resolve({ ok: false, reason: 'chatu8-missing', error: '未检测到智绘姬' });
    if (!text) return Promise.resolve({ ok: false, reason: 'empty-prompt', error: '没有可交给智绘姬的提示词' });
    const eventSource = host.eventSource;
    const id = String(options.id || nextRequestId());
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : CHATU8_DEFAULT_TIMEOUT_MS;
    const setTimer = typeof options.setTimeout === 'function' ? options.setTimeout : globalThis.setTimeout;
    const clearTimer = typeof options.clearTimeout === 'function' ? options.clearTimeout : globalThis.clearTimeout;

    return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            if (timer != null) clearTimer(timer);
            detach(eventSource, handler);
            resolve(result);
        };
        const fail = (reason, error) => finish({ ok: false, reason, error });

        function handler(data) {
            if (!data || String(data.id) !== id) return;
            if (!data.success) return fail('chatu8-failed', `智绘姬出图失败：${data.error || '未知错误'}`);
            if (data.isVideo || data.format === 'video') return fail('chatu8-video', '智绘姬返回的是视频，剧情 CG 与素材只接受图片');
            const imageData = typeof data.imageData === 'string' ? data.imageData.trim() : '';
            if (!imageData) return fail('chatu8-empty', '智绘姬没有返回图片');
            return finish({ ok: true, imageData });
        }

        try {
            eventSource.on(CHATU8_RESPONSE_EVENT, handler);
        } catch (error) {
            fail('chatu8-bind-failed', `无法监听智绘姬回执：${(error && error.message) || error}`);
            return;
        }
        timer = setTimer(() => fail('chatu8-timeout', `智绘姬 ${Math.round(timeoutMs / 1000)} 秒内没有返回图片`), timeoutMs);
        // Node 下等待中的请求不应让进程常驻；浏览器返回数字句柄，没有 unref。
        if (timer && typeof timer.unref === 'function') timer.unref();
        try {
            // 酒馆 eventSource.emit 返回 Promise；监听器抛错时同样按失败收尾。
            const pending = eventSource.emit(CHATU8_REQUEST_EVENT, { id, prompt: text });
            if (pending && typeof pending.catch === 'function') {
                pending.catch((error) => fail('chatu8-failed', `智绘姬出图失败：${(error && error.message) || error}`));
            }
        } catch (error) {
            fail('chatu8-failed', `智绘姬出图失败：${(error && error.message) || error}`);
        }
    });
}

