import { normalizeAutoIllustrationSettings } from './illustration/auto-illustration-settings.js';
import { resolveNaiNativeEndpoint } from './request-builders/nai-v4-builder.js';
import { applyUserPromptsToCaption } from './dbgen-prompt.js';
import { formatStoredPrompt, promptFromCaption, promptFromText } from './generation-prompt.js';
import { findChatu8Host, requestChatu8Image } from './chatu8-client.js';
import { findBaibaiApi, requestBaibaiImage } from './baibai-client.js';
import { waitFloorPromptTags } from './floor-prompt-tags.js';
import { writeCaptionsWithLlm } from './illustration/caption-writer.js';

// 生图来源：nai = IGS 内置 NAI；dbgen = 数据库生图插件（window.NaiDbGen）；
// extension = 智绘姬：剧情 CG、素材与物品图经智绘姬的出图事件生成，剧情 CG 优先用它写在楼层里的词；
// baibai = 柏宝绘：经其公开接口 globalThis.STBaiBaiImage 出图，图不进柏宝绘图库与聊天记录；剧情 CG 优先用它写在楼层里的词。
// 未检测到智绘姬 / 柏宝绘或出图失败时，填了 NAI Key 就由内置 NAI 兜底。
export const IMAGE_SOURCE_MODES = Object.freeze(['nai', 'dbgen', 'extension', 'baibai']);
export const DBGEN_LABEL = '数据库生图插件';
export const CHATU8_LABEL = '智绘姬';
export const BAIBAI_LABEL = '柏宝绘';

export function normalizeImageSourceMode(value) {
    const mode = String(value || '').trim();
    return IMAGE_SOURCE_MODES.includes(mode) ? mode : 'extension';
}

// 插件调用不带超时会一直挂着：设置页按钮锁住、单张重画再点也没反应。超时只是不再等，插件那边可能仍在跑。
export const DBGEN_TIMEOUTS = Object.freeze({ write: 5 * 60 * 1000, paint: 3 * 60 * 1000 });

function withTimeout(promise, ms) {
    if (!(ms > 0)) return promise;
    let timer;
    const expired = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`超过 ${Math.round(ms / 1000)} 秒没有返回，已放弃等待`)), ms);
    });
    return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
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

function joinPromptTags(parts) {
    return parts
        .map((part) => String(part || '').trim().replace(/^,+|,+$/g, '').trim())
        .filter(Boolean)
        .join(', ');
}

// 智绘姬只接收一段提示词：场景 tag 在前，各角色 tag 依次追加；画师串、质量词与尺寸沿用智绘姬自己的设置。
export function buildChatu8Prompt(slot) {
    const chars = Array.isArray(slot && slot.chars) ? slot.chars : [];
    return joinPromptTags([slot && slot.scene, ...chars.map((c) => c && c.tags)]);
}

// 智绘姬回传的可能是 data URL、blob URL 或同源路径；统一转成 data URL 再交给存储层。
async function chatu8ImageToDataUrl(imageData, win) {
    if (imageData.toLowerCase().startsWith('data:image/')) return imageData;
    const fetcher = win && typeof win.fetch === 'function' ? win.fetch.bind(win) : globalThis.fetch;
    const response = await fetcher(imageData);
    if (!response || !response.ok) throw new Error(`HTTP ${response ? response.status : '无响应'}`);
    const blob = await response.blob();
    if (blob.type && !blob.type.toLowerCase().startsWith('image/')) throw new Error(`返回的不是图片（${blob.type}）`);
    return blobToDataUrl(blob, blob.type, win);
}

function captionLogText(caption) {
    const stored = promptFromCaption(caption);
    return formatStoredPrompt(stored) || '（空）';
}

// 生图日志单条最多 600 字。提示词拆开写，避免被截断后看起来像没拼上。
function reportLong(report, title, text) {
    const body = String(text || '（空）');
    if (typeof report !== 'function') return;
    const limit = 520;
    const parts = Math.max(1, Math.ceil(body.length / limit));
    for (let index = 0; index < parts; index += 1) {
        const head = parts === 1 ? title : `${title} ${index + 1}/${parts}`;
        report('info', `${head}\n${body.slice(index * limit, (index + 1) * limit)}`);
    }
}

export function createImageBackend({ nai, getBridge, global: globalObject = globalThis, chatu8, llm, report, dbgenTimeouts, floorPromptWait } = {}) {
    const timeouts = { ...DBGEN_TIMEOUTS, ...(dbgenTimeouts && typeof dbgenTimeouts === 'object' ? dbgenTimeouts : {}) };
    const readBridge = (override) => (override && typeof override === 'object' ? override : (getBridge ? getBridge() || {} : {}));
    // chatu8 可注入 { findHost, request } 供测试替换；默认走真实的智绘姬事件桥。
    const chatu8Bridge = chatu8 && typeof chatu8 === 'object' ? chatu8 : {};
    const findChatu8 = () => (typeof chatu8Bridge.findHost === 'function' ? chatu8Bridge.findHost() : findChatu8Host(globalObject));
    const requestChatu8 = typeof chatu8Bridge.request === 'function' ? chatu8Bridge.request : requestChatu8Image;

    function describe(bridgeOverride) {
        const bridge = readBridge(bridgeOverride);
        const mode = normalizeImageSourceMode(bridge.imageApi && bridge.imageApi.mode);
        if (mode === 'dbgen') {
            return findDbgenApi(globalObject)
                ? { mode, via: 'dbgen', ownPrompts: true, ready: { ok: true } }
                : { mode, via: 'none', ownPrompts: true, ready: { ok: false, error: `未检测到${DBGEN_LABEL}，请确认已安装并启用，或在「生图 → 图像来源」改用内置 NAI` } };
        }
        const settings = normalizeAutoIllustrationSettings(bridge.autoIllustration).nai;
        const hasNaiKey = Boolean(String(settings.apiKey || '').trim());
        if (mode === 'baibai') {
            if (findBaibaiApi(globalObject)) return { mode, via: 'baibai', ownPrompts: false, ready: { ok: true } };
            return hasNaiKey
                ? { mode, via: 'nai', ownPrompts: false, ready: { ok: true } }
                : { mode, via: 'none', ownPrompts: false, ready: { ok: false, error: `未检测到${BAIBAI_LABEL}，请确认已安装并启用；或在「生图 → 图像来源」填写 NAI Key 作兜底` } };
        }
        if (mode === 'extension') {
            if (findChatu8()) return { mode, via: 'chatu8', ownPrompts: false, ready: { ok: true } };
            return hasNaiKey
                ? { mode, via: 'nai', ownPrompts: false, ready: { ok: true } }
                : { mode, via: 'none', ownPrompts: false, ready: { ok: false, error: `未检测到${CHATU8_LABEL}，请确认已安装并启用；或在「生图 → 图像来源」填写 NAI Key 作兜底` } };
        }
        if (!hasNaiKey) return { mode, via: 'none', ownPrompts: false, ready: { ok: false, error: '请先在「生图 → 图像来源」填写 NAI Key' } };
        return { mode, via: 'nai', ownPrompts: false, ready: { ok: true } };
    }

    // 写词接口只收到「画什么」。前端正负模板不进这段描述，出图前再合并进插件返回的 caption。
    async function viaDbgen(meta = {}) {
        const api = findDbgenApi(globalObject);
        if (!api) return { ok: false, error: `未检测到${DBGEN_LABEL}` };
        const description = String(meta.description || '').trim();
        if (!description) return { ok: false, error: '没有可交给数据库生图插件的画面描述' };
        let written = null;
        try {
            if (typeof api.generateSinglePrompt !== 'function') return { ok: false, error: `${DBGEN_LABEL}版本过旧，缺少写提示词接口` };
            written = await withTimeout(api.generateSinglePrompt({
                description,
                ...(meta.skipRecall === true && { skipRecall: true }),
                ...(meta.messageId != null && { messageId: Number(meta.messageId) }),
            }), timeouts.write);
            if (!written || !written.ok || !written.value || !written.value.caption) {
                return { ok: false, error: `${DBGEN_LABEL}写提示词失败：${describeResultError(written, '未返回提示词')}` };
            }
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}写提示词失败：${(error && error.message) || error}` };
        }
        const size = parseSize(meta.size) || (written.value.width && written.value.height
            ? { width: written.value.width, height: written.value.height } : null);
        return paintDbgenCaption(api, { ...meta, size: size ? `${size.width}x${size.height}` : meta.size }, written.value.caption);
    }

    // 表情差分、头像、立绘与服装：数据库生图之外的来源由副 LLM 写词，返回形状与插件一致。
    async function writeDbgenPrompt(meta = {}) {
        if (describe().mode !== 'dbgen') {
            return writeCaptionsWithLlm(llm, normalizeAutoIllustrationSettings(readBridge().autoIllustration).llm, meta.description);
        }
        const api = findDbgenApi(globalObject);
        if (!api) return { ok: false, error: `未检测到${DBGEN_LABEL}` };
        const description = String(meta.description || '').trim();
        if (!description) return { ok: false, error: '没有可交给数据库生图插件的画面描述' };
        if (typeof api.generateSinglePrompt !== 'function') return { ok: false, error: `${DBGEN_LABEL}版本过旧，缺少写提示词接口` };
        let written;
        try {
            written = await withTimeout(api.generateSinglePrompt({
                description,
                skipRecall: true,
                ...(meta.messageId != null && { messageId: Number(meta.messageId) }),
            }), timeouts.write);
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}写提示词失败：${(error && error.message) || error}` };
        }
        if (!written || !written.ok || !written.value || !written.value.caption) {
            return { ok: false, error: `${DBGEN_LABEL}写提示词失败：${describeResultError(written, '未返回提示词')}` };
        }
        const captions = Array.isArray(written.value.captions) && written.value.captions.length
            ? written.value.captions.filter((item) => item && item.caption)
            : [{ slotId: 1, caption: written.value.caption, width: written.value.width, height: written.value.height }];
        return {
            ok: true,
            caption: written.value.caption,
            captions,
            width: written.value.width,
            height: written.value.height,
        };
    }

    // 楼内 CG：走召回，把生成点原样带回。不出图。
    async function writeDbgenFloorPrompts(meta = {}) {
        const api = findDbgenApi(globalObject);
        if (!api) return { ok: false, error: `未检测到${DBGEN_LABEL}` };
        const description = String(meta.description || '').trim();
        if (!description) return { ok: false, error: '没有可交给数据库生图插件的画面描述' };
        if (typeof api.generateSinglePrompt !== 'function') return { ok: false, error: `${DBGEN_LABEL}版本过旧，缺少写提示词接口` };
        let written;
        try {
            written = await withTimeout(api.generateSinglePrompt({
                description,
                ...(meta.messageId != null && { messageId: Number(meta.messageId) }),
            }), timeouts.write);
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}写提示词失败：${(error && error.message) || error}` };
        }
        if (!written || !written.ok || !written.value || !written.value.caption) {
            return { ok: false, error: `${DBGEN_LABEL}写提示词失败：${describeResultError(written, '未返回提示词')}` };
        }
        const captions = (Array.isArray(written.value.captions) && written.value.captions.length
            ? written.value.captions
            : [{ slotId: 1, caption: written.value.caption, width: written.value.width, height: written.value.height }])
            .filter((item) => item && item.caption)
            .map((item) => {
                const anchor = String(item.anchorSentence || item.anchor || '').trim();
                return {
                    slotId: Number(item.slotId) || 1,
                    caption: item.caption,
                    ...(anchor && { anchorSentence: anchor }),
                    ...(item.width != null && { width: item.width }),
                    ...(item.height != null && { height: item.height }),
                };
            });
        return { ok: true, caption: written.value.caption, captions };
    }

    async function paintDbgenCaption(api, meta, caption) {
        const userPrompts = meta.userPrompts && typeof meta.userPrompts === 'object' ? meta.userPrompts : null;
        const merged = userPrompts ? applyUserPromptsToCaption(caption, userPrompts) : caption;
        const positive = userPrompts ? String(userPrompts.positive || '').trim() : '';
        const negative = userPrompts ? String(userPrompts.negative || '').trim() : '';
        reportLong(report, '拼之前', captionLogText(caption));
        reportLong(report, '要拼的模板', positive || negative
            ? `正向：${positive || '（空）'}\n负面：${negative || '（空）'}`
            : '（这次没带模板）');
        reportLong(report, '发出去', captionLogText(merged));
        const size = parseSize(meta.size);
        // 立绘走数据库生图时默认打开透明底。模型用插件自己的运行配置，这里不传 model。
        const params = {
            ...(size || {}),
            ...(meta.transparent === true && { straight_alpha: true, tag_hint_transparent_background: true }),
            ...(Number.isInteger(meta.seed) && meta.seed >= 0 && { seed: meta.seed }),
        };
        let result;
        try {
            result = await withTimeout(api.generate({ caption: merged, replaceCharacterKeywords: true, ...(Object.keys(params).length && { params }) }), timeouts.paint);
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}出图失败：${(error && error.message) || error}`, prompt: promptFromCaption(merged) };
        }
        const image = result && result.ok && Array.isArray(result.value) ? result.value[0] : null;
        if (!image || !image.blob) return { ok: false, error: `${DBGEN_LABEL}出图失败：${describeResultError(result, '未返回图片')}`, prompt: promptFromCaption(merged) };
        try {
            return { ok: true, dataUrl: await blobToDataUrl(image.blob, image.mimeType, globalObject), prompt: promptFromCaption(merged) };
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}图片读取失败：${(error && error.message) || error}`, prompt: promptFromCaption(merged) };
        }
    }

    async function generateDbgenCaption(meta = {}) {
        if (!meta.caption) return { ok: false, error: '没有可出图的提示词' };
        if (describe().mode !== 'dbgen') return paintCaption(meta);
        const api = findDbgenApi(globalObject);
        if (!api) return { ok: false, error: `未检测到${DBGEN_LABEL}` };
        return paintDbgenCaption(api, meta, meta.caption);
    }

    // 非数据库生图来源：caption 合上模板后拆回 slot，按当前图像来源（NAI / 智绘姬 / 柏宝绘）出图。
    async function paintCaption(meta) {
        const userPrompts = meta.userPrompts && typeof meta.userPrompts === 'object' ? meta.userPrompts : null;
        const merged = userPrompts ? applyUserPromptsToCaption(meta.caption, userPrompts) : meta.caption;
        const pos = (merged && merged.v4_prompt && merged.v4_prompt.caption) || {};
        const neg = (merged && merged.v4_negative_prompt && merged.v4_negative_prompt.caption) || {};
        const negChars = Array.isArray(neg.char_captions) ? neg.char_captions : [];
        const slot = {
            scene: String(pos.base_caption || ''),
            sceneUc: String(neg.base_caption || ''),
            transparent: meta.transparent === true,
            chars: (Array.isArray(pos.char_captions) ? pos.char_captions : []).map((c, index) => {
                const center = (c && Array.isArray(c.centers) && c.centers[0]) || {};
                return { tags: String((c && c.char_caption) || ''), uc: String((negChars[index] && negChars[index].char_caption) || ''), x: Number(center.x) || 0.5, y: Number(center.y) || 0.5 };
            }),
        };
        const settings = {
            ...normalizeAutoIllustrationSettings(readBridge().autoIllustration).nai,
            ...(meta.size && { size: meta.size }),
            ...(Number.isInteger(meta.seed) && meta.seed > 0 && { seed: meta.seed }),
        };
        const prompt = promptFromCaption(merged);
        let result;
        try { result = await generate(slot, settings, meta); } catch (error) { result = { ok: false, error: (error && error.message) || String(error) }; }
        return result && result.ok && result.dataUrl
            ? { ok: true, dataUrl: result.dataUrl, prompt, via: result.via }
            : { ok: false, error: (result && result.error) || '出图失败', prompt };
    }

    // 智绘姬出图；未安装、失败或图片取不到时，填了 NAI Key 就退回内置 NAI。
    async function naiFallback(slot, naiSettings, reason) {
        const settings = naiSettings && typeof naiSettings === 'object'
            ? naiSettings
            : normalizeAutoIllustrationSettings(readBridge().autoIllustration).nai;
        if (!String(settings.apiKey || '').trim()) return { ok: false, error: reason };
        const result = await nai.generate(slot, settings);
        return result && result.ok
            ? { ...result, via: 'nai' }
            : { ok: false, error: `${reason}；内置 NAI 兜底也失败：${(result && result.error) || '未知错误'}` };
    }

    // 柏宝绘出图；未安装或失败时同样退回内置 NAI。
    // 剧情 CG（meta 带楼层号和图序号）优先用插件自己写在楼层里的第 N 个词；没有就用 IGS 的词。
    async function pluginFloorTag(source, label, meta) {
        if (meta.messageId == null || !(Number(meta.slot) >= 1)) return null;
        const tags = await waitFloorPromptTags(globalObject, source, meta.messageId, floorPromptWait);
        const tag = tags[Number(meta.slot) - 1] || null;
        if (typeof report === 'function') {
            report('info', tag
                ? `第 ${meta.messageId} 楼第 ${meta.slot} 张用${label}写的词`
                : `第 ${meta.messageId} 楼第 ${meta.slot} 张没有${label}写的词，改用 IGS 的词`);
        }
        return tag;
    }

    async function viaBaibai(slot, naiSettings, meta = {}) {
        const api = findBaibaiApi(globalObject);
        if (!api) return naiFallback(slot, naiSettings, `未检测到${BAIBAI_LABEL}`);
        const size = naiSettings && naiSettings.size;
        const floorTag = await pluginFloorTag('baibai', BAIBAI_LABEL, meta);
        const result = await requestBaibaiImage(api, slot, { size, seed: naiSettings && naiSettings.seed, floorTag });
        if (!result.ok) return naiFallback(slot, naiSettings, result.error);
        return { ok: true, via: 'baibai', dataUrl: result.dataUrl, prompt: promptFromText(result.prompt, '') };
    }

    async function viaChatu8(slot, naiSettings, meta = {}) {
        const fallback = (reason) => naiFallback(slot, naiSettings, reason);
        const host = findChatu8();
        if (!host) return fallback(`未检测到${CHATU8_LABEL}`);
        const floorTag = await pluginFloorTag('chatu8', CHATU8_LABEL, meta);
        const prompt = floorTag ? floorTag.tag : buildChatu8Prompt(slot);
        if (!prompt) return { ok: false, error: `没有可交给${CHATU8_LABEL}的提示词` };
        const result = await requestChatu8(host, prompt);
        if (!result || !result.ok) return fallback((result && result.error) || `${CHATU8_LABEL}出图失败`);
        try {
            return { ok: true, via: 'chatu8', dataUrl: await chatu8ImageToDataUrl(result.imageData, host.win || globalObject), prompt: promptFromText(prompt, '') };
        } catch (error) {
            return fallback(`${CHATU8_LABEL}图片读取失败：${(error && error.message) || error}`);
        }
    }

    // 剧情 CG 规划前调用：柏宝绘 / 智绘姬来源下等它把本楼的词写完（没开自动写词立即返回），其他来源不等。
    async function waitSourceFloorPrompts(messageId) {
        const source = { baibai: 'baibai', chatu8: 'chatu8' }[describe().via];
        return source ? waitFloorPromptTags(globalObject, source, messageId, floorPromptWait) : [];
    }

    // 剧情 CG / 素材补全入口，签名与 nai-official-client 的 generate 一致，多一个 meta。
    async function generate(slot, naiSettings, meta = {}) {
        const mode = describe().mode;
        if (mode === 'dbgen') return viaDbgen(meta);
        if (mode === 'extension') return viaChatu8(slot, naiSettings, meta);
        if (mode === 'baibai') return viaBaibai(slot, naiSettings, meta);
        return nai.generate(slot, naiSettings);
    }

    // 阅读器「重画 / 测试生成」入口：返回 reader-image-service 需要的 { url }。
    async function generateForReader(request = {}, opts = {}) {
        const unified = opts.unifiedSettings || {};
        const bridge = unified.bridge && typeof unified.bridge === 'object' ? unified.bridge : {};
        const mode = normalizeImageSourceMode((opts.imageApi && opts.imageApi.mode) || (bridge.imageApi && bridge.imageApi.mode));
        const prompt = String(request.prompt || request.input || '').trim();
        if (mode === 'extension') return { ok: false, reason: 'provider-not-enabled' };
        if (mode === 'baibai') {
            if (!prompt) return { ok: false, reason: '没有可用于生图的提示词' };
            const result = await viaBaibai({ scene: prompt }, normalizeAutoIllustrationSettings(bridge.autoIllustration).nai);
            return result.ok ? { url: result.dataUrl, providerId: `vn.provider.${result.via}` } : { ok: false, reason: result.error };
        }
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

    // 局部重绘能力协商：与普通 generate 分开；只有内置 NAI 且客户端提供 edit 时可用。
    // 不支持时返回 image-edit-unsupported，绝不静默退化为整张重画。
    function describeEdit(bridgeOverride) {
        const base = describe(bridgeOverride);
        if (base.mode !== 'nai') {
            return { supported: false, reason: 'image-edit-unsupported', message: base.mode === 'dbgen'
                ? `${DBGEN_LABEL}不支持局部重绘，请在「生图 → 图像来源」改用内置 NAI`
                : `${base.mode === 'baibai' ? BAIBAI_LABEL : CHATU8_LABEL}不支持局部重绘，请在「生图 → 图像来源」改用内置 NAI` };
        }
        if (!nai || typeof nai.edit !== 'function') {
            return { supported: false, reason: 'image-edit-unsupported', message: '当前 NAI 客户端不支持局部重绘' };
        }
        if (!base.ready.ok) return { supported: false, reason: 'backend-unavailable', message: base.ready.error };
        const naiSettings = normalizeAutoIllustrationSettings(readBridge(bridgeOverride).autoIllustration).nai;
        if (typeof nai.supportsEdit === 'function' && !nai.supportsEdit(naiSettings)) {
            return { supported: false, reason: 'image-edit-unsupported', message: '当前 NAI 模型没有局部重绘版本，请换用 V4 / V4.5 模型' };
        }
        return { supported: true, reason: '', message: '' };
    }

    // request：{ sourceDataUrl, maskDataUrl, prompt, negative, width, height }；不记录原图与请求体。
    async function edit(request = {}, bridgeOverride) {
        const capability = describeEdit(bridgeOverride);
        if (!capability.supported) return { ok: false, reason: capability.reason, error: capability.message };
        if (!request.sourceDataUrl || !request.maskDataUrl) return { ok: false, reason: 'invalid-edit-request', error: '缺少原图或修复区域' };
        const settings = normalizeAutoIllustrationSettings(readBridge(bridgeOverride).autoIllustration).nai;
        try {
            const result = await nai.edit(request, settings);
            return result && result.ok && result.dataUrl
                ? { ok: true, dataUrl: result.dataUrl }
                : { ok: false, reason: result && result.reason === 'image-edit-unsupported' ? 'image-edit-unsupported' : 'edit-failed', error: (result && result.error) || '局部重绘失败' };
        } catch (error) {
            return { ok: false, reason: 'edit-failed', error: `局部重绘失败：${(error && error.message) || error}` };
        }
    }

    function probeDbgen() {
        const api = findDbgenApi(globalObject);
        return api
            ? { ok: true, message: `已检测到${DBGEN_LABEL}。提示词、画师串和 NAI Key 在该插件中设置。` }
            : { ok: false, message: `未检测到${DBGEN_LABEL}，请确认已安装并启用。` };
    }

    return { describe, describeEdit, edit, generate, generateForReader, probeDbgen, writeDbgenPrompt, writeDbgenFloorPrompts, generateDbgenCaption, waitSourceFloorPrompts };
}
