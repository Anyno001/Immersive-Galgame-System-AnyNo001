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

// 柏宝绘自己写词：AI 回复渲染后读本楼正文、世界书、角色卡写词，以 <bbi_image>tag<nl>自然语言</nl></bbi_image>
// 插回楼层正文，角色外貌已展开在 tag 里。公开接口没有写词入口，所以剧情 CG 直接读楼层里的这些块。
export const BAIBAI_FLOOR_WAIT_MS = 90000;
const BAIBAI_SETTINGS_KEY = 'baibai_image';

function readStContext(globalObject) {
    for (const read of [() => globalObject, () => globalObject.parent, () => globalObject.top]) {
        try {
            const win = read();
            const context = win && win.SillyTavern && typeof win.SillyTavern.getContext === 'function' ? win.SillyTavern.getContext() : null;
            if (context) return context;
        } catch (error) { /* 跨域窗口 */ }
    }
    return null;
}

// 柏宝绘开着且开了自动写词，才值得等它写完。
export function readBaibaiAutoTag(globalObject = globalThis) {
    const context = readStContext(globalObject);
    const settings = context && context.extensionSettings && context.extensionSettings[BAIBAI_SETTINGS_KEY];
    const autoTag = settings && settings.autoTag;
    return { enabled: !!(settings && settings.enabled !== false && autoTag && autoTag.enabled), autoGenerate: !!(autoTag && autoTag.autoGenerate) };
}

export function parseBaibaiFloorTags(text) {
    const blocks = String(text || '').match(/<bbi_image>[\s\S]+?<\/bbi_image>/gi) || [];
    return blocks.map((block) => {
        const inner = block.replace(/^<bbi_image>|<\/bbi_image>$/gi, '');
        const nl = (inner.match(/<nl>([\s\S]*?)<\/nl>/i) || [])[1] || '';
        const explicit = (inner.match(/<tag>([\s\S]*?)<\/tag>/i) || [])[1] || '';
        const bare = inner.replace(/<nl>[\s\S]*?<\/nl>|<tag>[\s\S]*?<\/tag>/gi, '');
        return { tag: joinTags([explicit, bare]), nl: nl.trim() };
    }).filter((item) => item.tag);
}

export function readBaibaiFloorTags(globalObject, messageId) {
    const context = readStContext(globalObject);
    const message = context && Array.isArray(context.chat) ? context.chat[Number(messageId)] : null;
    return parseBaibaiFloorTags(message && message.mes);
}

// 本楼还没有柏宝绘的词、它又开着自动写词时，等它写完；超时返回空数组，由调用方退回 IGS 自己的词。
export async function waitBaibaiFloorTags(globalObject, messageId, { timeoutMs = BAIBAI_FLOOR_WAIT_MS, intervalMs = 1500, sleep } = {}) {
    const pause = typeof sleep === 'function' ? sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let tags = readBaibaiFloorTags(globalObject, messageId);
    if (tags.length || !readBaibaiAutoTag(globalObject).enabled) return tags;
    for (let waited = 0; waited < timeoutMs && !tags.length; waited += intervalMs) {
        await pause(intervalMs);
        tags = readBaibaiFloorTags(globalObject, messageId);
    }
    return tags;
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
