// 旧版本会把空地址自动填成这个公共节点；读到它且未开启队列时视为未填写。
const LEGACY_DEFAULT_ENDPOINT = 'https://st-chatu-novelai-queue.hf.space';

export function normalizeNaiCloudQueue(value) {
    const n = Number(value?.timeoutMs);
    const enabled = value?.enabled === true || value?.enabled === 'true';
    let endpoint = typeof value?.endpoint === 'string' ? value.endpoint.trim().replace(/\/+$/, '') : '';
    // 只在整组归一化时清理；单独改地址字段（不带 enabled）时保留用户手填的值。
    if (endpoint === LEGACY_DEFAULT_ENDPOINT && !enabled && value && Object.hasOwn(value, 'enabled')) endpoint = '';
    return {
        enabled,
        endpoint,
        timeoutMs: value?.timeoutMs !== '' && value?.timeoutMs != null && Number.isFinite(n)
            ? Math.max(10000, Math.min(900000, Math.round(n))) : 180000,
    };
}

// 开关打开且填了地址才排队；没填地址等同关闭。
export function naiCloudQueueActive(value) {
    const cloud = normalizeNaiCloudQueue(value);
    return cloud.enabled && cloud.endpoint !== '';
}

export function validNaiQueueEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
}
