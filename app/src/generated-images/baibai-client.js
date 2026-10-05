// 柏宝绘（ST-BaiBai-Image）出图桥。
// 走柏宝绘公开接口 globalThis.STBaiBaiImage（apiVersion 1）：后端、并发闸门与限流退避都由柏宝绘负责，
// 本模块只负责找接口、发请求、归一化结果；NAI 兜底由 image-backend 处理。
export const BAIBAI_DEFAULT_TIMEOUT_MS = 240000;

export function findBaibaiApi(globalObject = globalThis) {
    const candidates = [];
    const push = (read) => { try { candidates.push(read()); } catch (error) { /* 跨域窗口 */ } };
    push(() => globalObject && globalObject.STBaiBaiImage);
    push(() => globalObject && globalObject.parent && globalObject.parent.STBaiBaiImage);
    push(() => globalObject && globalObject.top && globalObject.top.STBaiBaiImage);
    return candidates.find((api) => api && api.apiVersion === 1 && typeof api.generate === 'function') || null;
}

export function readBaibaiStatus(api) {
    try {
        const status = api && typeof api.getBackendStatus === 'function' ? api.getBackendStatus() : null;
        return status && typeof status === 'object' ? status : { configured: true };
    } catch (error) {
        return { configured: false, reason: (error && error.message) || String(error) };
    }
}

function joinTags(parts) {
    return parts.map((part) => String(part || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');
}

// slot：{ scene, sceneUc, chars: [{ name?, tags }] }。后端支持多角色时按角色分开传，否则拼进一段 prompt。
// size 取 'WxH'，宽大于高按横图，具体像素用柏宝绘渠道页的设置。
export async function requestBaibaiImage(api, slot = {}, options = {}) {
    if (!api) return { ok: false, error: '未检测到柏宝绘' };
    const status = readBaibaiStatus(api);
    if (status.configured === false) return { ok: false, error: `柏宝绘未就绪：${status.reason || '请先在柏宝绘配置出图渠道'}` };
    // floorTag：柏宝绘自己写在楼层里的词，角色已展开，整串作为 prompt，不再分角色。
    const floorTag = options.floorTag && String(options.floorTag.tag || '').trim() ? options.floorTag : null;
    const chars = floorTag ? [] : (Array.isArray(slot.chars) ? slot.chars : []).filter((c) => c && String(c.tags || '').trim());
    const split = status.supportsCharacters === true && chars.length > 0;
    const prompt = floorTag ? joinTags([floorTag.tag]) : split ? joinTags([slot.scene]) : joinTags([slot.scene, ...chars.map((c) => c.tags)]);
    if (!prompt) return { ok: false, error: '没有可交给柏宝绘的提示词' };
    const m = String(options.size || '').match(/(\d+)\s*[x×*]\s*(\d+)/i);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : BAIBAI_DEFAULT_TIMEOUT_MS;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    if (timer && typeof timer.unref === 'function') timer.unref();
    try {
        const result = await api.generate({
            prompt,
            ...(floorTag && floorTag.nl && { nl: floorTag.nl }),
            ...(String(slot.sceneUc || '').trim() && { negative: String(slot.sceneUc).trim() }),
            ...(split && { characters: chars.map((c, index) => ({ name: String(c.name || `角色${index + 1}`), tag: String(c.tags).trim() })) }),
            size: m && Number(m[1]) > Number(m[2]) ? 'landscape' : 'portrait',
            ...(Number.isInteger(options.seed) && options.seed > 0 && { seed: options.seed }),
            save: false,
        }, controller ? { signal: controller.signal } : undefined);
        const dataUrl = result && typeof result.dataUrl === 'string' ? result.dataUrl : '';
        return dataUrl ? { ok: true, dataUrl, prompt } : { ok: false, error: '柏宝绘没有返回图片', prompt };
    } catch (error) {
        const code = error && error.code;
        const text = code === 'aborted' ? `${Math.round(timeoutMs / 1000)} 秒内没有返回图片` : ((error && error.message) || String(error));
        return { ok: false, error: `柏宝绘出图失败：${text}`, prompt };
    } finally {
        if (timer != null) clearTimeout(timer);
    }
}
