import { normalizeAutoIllustrationSettings } from './illustration/auto-illustration-settings.js';
import { resolveNaiNativeEndpoint } from './request-builders/nai-v4-builder.js';

// 生图来源：nai = IGS 内置 NAI；dbgen = 数据库生图插件（window.NaiDbGen）；
// extension = 智绘姬。智绘姬无法按需出图，剧情 CG 与素材在该模式下退回内置 NAI。
export const IMAGE_SOURCE_MODES = Object.freeze(['nai', 'dbgen', 'extension']);
export const DBGEN_LABEL = '数据库生图插件';

export function normalizeImageSourceMode(value) {
    const mode = String(value || '').trim();
    return IMAGE_SOURCE_MODES.includes(mode) ? mode : 'extension';
}

export function findDbgenApi(globalObject = globalThis) {
    const candidates = [];
    const push = (read) => { try { candidates.push(read()); } catch (error) { /* 跨域窗口 */ } };
    push(() => globalObject && globalObject.NaiDbGen);
    push(() => globalObject && globalObject.top && globalObject.top.NaiDbGen);
    push(() => globalObject && globalObject.parent && globalObject.parent.NaiDbGen);
    push(() => globalThis.NaiDbGen);
    return candidates.find((api) => api && typeof api.generate === 'function') || null;
}

// 旧版「其他生图」单独存了一套 NAI Key；合并到自动插图那套，只在后者没填 Key 时搬过去。
export function mergeLegacyNaiSettings(autoIllustration, imageApi) {
    const auto = autoIllustration && typeof autoIllustration === 'object' ? JSON.parse(JSON.stringify(autoIllustration)) : {};
    const legacy = imageApi && typeof imageApi === 'object' ? imageApi : {};
    const nai = auto.nai && typeof auto.nai === 'object' ? auto.nai : {};
    const legacyKey = String(legacy.apiKey || '').trim();
    const legacyEndpoint = String(legacy.endpoint || legacy.apiUrl || '').trim();
    if (String(nai.apiKey || '').trim() || !legacyKey || !resolveNaiNativeEndpoint(legacyEndpoint)) return auto;
    const model = String(legacy.model || '').trim();
    auto.nai = {
        ...nai,
        apiKey: legacyKey,
        ...(legacyEndpoint && !nai.endpoint && { endpoint: legacyEndpoint }),
        ...(legacy.transport === 'st-proxy' && !nai.transport && { transport: 'st-proxy' }),
        ...(/^nai-diffusion-[45]/.test(model) && !nai.model && { model }),
        ...(Number(legacy.steps) > 0 && nai.steps == null && { steps: Number(legacy.steps) }),
        ...(legacy.sampler && !nai.sampler && { sampler: String(legacy.sampler) }),
        ...(String(legacy.promptPrefix || '').trim() && !nai.artistPrefix && { artistPrefix: String(legacy.promptPrefix).trim() }),
    };
    return auto;
}

function describeResultError(result, fallback) {
    const error = result && result.error;
    if (!error) return fallback;
    if (typeof error === 'string') return error;
    return [error.message, error.hint].filter(Boolean).join('：') || fallback;
}

function parseSize(size) {
    const m = String(size || '').match(/(\d+)\s*[x×*]\s*(\d+)/i);
    if (!m) return null;
    const round64 = (v) => Math.max(64, Math.round(Number(v) / 64) * 64);
    return { width: round64(m[1]), height: round64(m[2]) };
}

async function blobToDataUrl(blob, mimeType, globalObject) {
    if (typeof blob === 'string') return blob;
    const buffer = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const encode = (globalObject && typeof globalObject.btoa === 'function' ? globalObject.btoa.bind(globalObject) : null) || globalThis.btoa;
    return `data:${mimeType || blob.type || 'image/png'};base64,${encode(binary)}`;
}

export function createImageBackend({ nai, getBridge, global: globalObject = globalThis } = {}) {
    const readBridge = (override) => (override && typeof override === 'object' ? override : (getBridge ? getBridge() || {} : {}));

    function describe(bridgeOverride) {
        const bridge = readBridge(bridgeOverride);
        const mode = normalizeImageSourceMode(bridge.imageApi && bridge.imageApi.mode);
        if (mode === 'dbgen') {
            return findDbgenApi(globalObject)
                ? { mode, ownPrompts: true, ready: { ok: true } }
                : { mode, ownPrompts: true, ready: { ok: false, error: `未检测到${DBGEN_LABEL}，请确认已安装并启用，或在「生图 → 图像来源」改用内置 NAI` } };
        }
        const settings = normalizeAutoIllustrationSettings(bridge.autoIllustration).nai;
        if (!String(settings.apiKey || '').trim()) {
            return {
                mode, ownPrompts: false,
                ready: { ok: false, error: mode === 'extension'
                    ? '智绘姬无法按需生成剧情 CG 和素材，这两项改用内置 NAI：请在「生图 → 图像来源」填写 NAI Key'
                    : '请先在「生图 → 图像来源」填写 NAI Key' },
            };
        }
        return { mode, ownPrompts: false, ready: { ok: true } };
    }

    // 提示词交给插件按当前楼层来写，IGS 只给出「画什么」的自然语言描述。
    async function viaDbgen(meta = {}) {
        const api = findDbgenApi(globalObject);
        if (!api) return { ok: false, error: `未检测到${DBGEN_LABEL}` };
        const description = String(meta.description || '').trim();
        if (!description) return { ok: false, error: '没有可交给数据库生图插件的画面描述' };
        let caption;
        let written = null;
        try {
            if (typeof api.generateSinglePrompt !== 'function') return { ok: false, error: `${DBGEN_LABEL}版本过旧，缺少写提示词接口` };
            written = await api.generateSinglePrompt({ description, ...(meta.messageId != null && { messageId: Number(meta.messageId) }) });
            if (!written || !written.ok || !written.value || !written.value.caption) {
                return { ok: false, error: `${DBGEN_LABEL}写提示词失败：${describeResultError(written, '未返回提示词')}` };
            }
            caption = written.value.caption;
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}写提示词失败：${(error && error.message) || error}` };
        }
        const size = parseSize(meta.size) || (written.value.width && written.value.height
            ? { width: written.value.width, height: written.value.height } : null);
        let result;
        try {
            result = await api.generate({ caption, replaceCharacterKeywords: true, ...(size && { params: size }) });
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}出图失败：${(error && error.message) || error}` };
        }
        const image = result && result.ok && Array.isArray(result.value) ? result.value[0] : null;
        if (!image || !image.blob) return { ok: false, error: `${DBGEN_LABEL}出图失败：${describeResultError(result, '未返回图片')}` };
        try {
            return { ok: true, dataUrl: await blobToDataUrl(image.blob, image.mimeType, globalObject) };
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}图片读取失败：${(error && error.message) || error}` };
        }
    }

    // 剧情 CG / 素材补全入口，签名与 nai-official-client 的 generate 一致，多一个 meta。
    async function generate(slot, naiSettings, meta = {}) {
        if (describe().mode === 'dbgen') return viaDbgen(meta);
        return nai.generate(slot, naiSettings);
    }

    // 阅读器「重画 / 测试生成」入口：返回 reader-image-service 需要的 { url }。
    async function generateForReader(request = {}, opts = {}) {
        const unified = opts.unifiedSettings || {};
        const bridge = unified.bridge && typeof unified.bridge === 'object' ? unified.bridge : {};
        const mode = normalizeImageSourceMode((opts.imageApi && opts.imageApi.mode) || (bridge.imageApi && bridge.imageApi.mode));
        const prompt = String(request.prompt || request.input || '').trim();
        if (mode === 'extension') return { ok: false, reason: 'provider-not-enabled' };
        if (mode === 'dbgen') {
            const messageId = opts.message && opts.message.id != null ? opts.message.id : opts.messageId;
            const result = await viaDbgen({ description: prompt, messageId });
            return result.ok ? { url: result.dataUrl, providerId: 'vn.provider.dbgen' } : { ok: false, reason: result.error };
        }
        const settings = normalizeAutoIllustrationSettings(bridge.autoIllustration).nai;
        if (!String(settings.apiKey || '').trim()) return { delegate: true };
        if (!prompt) return { ok: false, reason: '没有可用于生图的提示词' };
        const result = await nai.generate({ scene: prompt }, settings);
        return result && result.ok ? { url: result.dataUrl, providerId: 'vn.provider.nai' } : { ok: false, reason: (result && result.error) || 'NAI 生成失败' };
    }

    function probeDbgen() {
        const api = findDbgenApi(globalObject);
        return api
            ? { ok: true, message: `已检测到${DBGEN_LABEL}。提示词、画师串和 NAI Key 在该插件中设置。` }
            : { ok: false, message: `未检测到${DBGEN_LABEL}，请确认已安装并启用。` };
    }

    return { describe, generate, generateForReader, probeDbgen };
}
