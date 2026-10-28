// 酒馆 CORS 代理（/proxy/）：探测只问酒馆自身，不触达外部地址，也不发送任何生图载荷。
const PROBE_TTL_MS = 5 * 60 * 1000;
const DISABLED = /CORS proxy is disabled/i;
let cached = null;

export const TAVERN_PROXY_DISABLED_HINT = '酒馆 CORS 代理未开启，请先在酒馆 config.yaml 中设置 enableCorsProxy: true 并重启酒馆';
export const TAVERN_BACKEND_UNREACHABLE_HINT = '酒馆后端可能无法连接该地址。酒馆进程不经过浏览器所用的代理，'
    + '需在酒馆 config.yaml 的 requestProxy 中填写代理地址，或为代理软件开启 TUN 模式';

export function tavernProxyUrl(url) {
    return `/proxy/${url}`;
}

export function resetTavernProxyProbe() {
    cached = null;
}

// 关闭时酒馆回 404「CORS proxy is disabled」；开启时以本站地址探测，酒馆按循环请求拒绝（400），不外发。
export function probeTavernProxy(fetchImpl, origin = globalThis.location?.origin) {
    if (cached && Date.now() - cached.at < PROBE_TTL_MS) return cached.value;
    const value = (async () => {
        if (typeof fetchImpl !== 'function' || !origin) return false;
        try {
            const response = await fetchImpl(tavernProxyUrl(`${origin}/igs-proxy-probe`),
                { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
            const text = typeof response.text === 'function' ? String(await response.text()) : '';
            return !DISABLED.test(text) && ![401, 403].includes(response.status);
        } catch { return false; }
    })();
    cached = { at: Date.now(), value };
    return value;
}

// direct / st-proxy 原样保留；auto 在酒馆代理可用时经酒馆转发，否则浏览器直连。
export async function resolveTavernTransport(transport, fetchImpl, origin) {
    if (transport === 'st-proxy') return 'st-proxy';
    if (transport !== 'auto') return 'direct';
    return await probeTavernProxy(fetchImpl, origin) ? 'st-proxy' : 'direct';
}

// 经代理的失败响应：区分「代理未开启」「酒馆后端连不上目标」与上游自身报错（返回空串）。
export function tavernProxyFailure(status, text) {
    if (status === 404 && DISABLED.test(String(text || ''))) return 'disabled';
    if (status === 500 && /^\s*(?:Internal Server Error)?\s*$/i.test(String(text || ''))) return 'unreachable';
    return '';
}
