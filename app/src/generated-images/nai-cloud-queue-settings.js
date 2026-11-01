export const NAI_QUEUE_REFERENCE_ENDPOINT = 'https://st-chatu-novelai-queue.hf.space';

export function normalizeNaiCloudQueue(value) {
    const n = Number(value?.timeoutMs);
    const endpoint = typeof value?.endpoint === 'string' ? value.endpoint.trim().replace(/\/+$/, '') : '';
    return {
        enabled: value?.enabled === true || value?.enabled === 'true',
        endpoint: endpoint || NAI_QUEUE_REFERENCE_ENDPOINT,
        timeoutMs: value?.timeoutMs !== '' && value?.timeoutMs != null && Number.isFinite(n)
            ? Math.max(10000, Math.min(900000, Math.round(n))) : 180000,
    };
}

export function validNaiQueueEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
}
