const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_POLL_ATTEMPTS = 60;
const DEFAULT_MODEL = 'nai-diffusion-3';
const DEFAULT_STEPS = 28;
const DEFAULT_SAMPLER = 'k_euler_ancestral';
const DEFAULT_SIZE = '832x1216';

export function normalizeApiBase(apiUrl) {
    const trimmed = String(apiUrl || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return trimmed.replace(/\/chat\/completions\/?$/i, '');
}

export function modelsUrl(apiUrl) {
    const base = normalizeApiBase(apiUrl);
    return base ? `${base}/models` : '';
}

export function imageGenerationUrl(apiUrl) {
    const trimmed = String(apiUrl || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (/\/images\/generations$/i.test(trimmed)) return trimmed;
    if (/\/v1$/i.test(trimmed)) return `${trimmed}/images/generations`;
    try {
        const parsed = new URL(trimmed);
        if (!parsed.pathname || parsed.pathname === '/') {
            return `${trimmed}/v1/images/generations`;
        }
    } catch (error) {
        // Custom proxy paths are returned as-is and validated by the request.
    }
    return trimmed;
}

export function buildApiHeaders(apiKey, contentType) {
    const headers = {};
    if (contentType) headers['Content-Type'] = contentType;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return headers;
}

export function normalizeModelEntries(data) {
    const output = [];
    const seen = new Set();

    function add(value) {
        const text = String(value || '').trim();
        if (!text || seen.has(text)) return;
        seen.add(text);
        output.push(text);
    }

    function walk(value) {
        if (!value) return;
        if (typeof value === 'string') {
            add(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!isPlainObject(value)) return;
        if (typeof value.id === 'string' || typeof value.name === 'string' || typeof value.model === 'string') {
            add(value.id || value.name || value.model);
            return;
        }
        if (Array.isArray(value.data)) {
            walk(value.data);
            return;
        }
        if (Array.isArray(value.models)) {
            walk(value.models);
            return;
        }
        Object.keys(value).forEach((key) => {
            if (Array.isArray(value[key])) walk(value[key]);
        });
    }

    walk(data);
    return output;
}

export async function fetchModels(settings = {}, deps = {}) {
    const source = isPlainObject(settings) ? settings : {};
    const endpoint = modelsUrl(source.apiUrl || source.endpoint);
    if (!endpoint) throw new Error('请先填写 API 地址');
    const response = await fetchWithTimeout(endpoint, {
        method: 'GET',
        headers: buildApiHeaders(source.apiKey || ''),
    }, Number(source.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS, deps);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 180)}`);
    }
    const data = await response.json();
    const models = normalizeModelEntries(data);
    if (!models.length) {
        throw new Error('接口返回成功，但没有解析到模型列表');
    }
    return {
        ok: true,
        endpoint,
        models,
        count: models.length,
        modelsFetchedAt: new Date().toISOString(),
        message: `已拉取 ${models.length} 个模型`,
    };
}

export async function parseImageResponse(response) {
    const contentType = response && response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('content-type') || ''
        : '';
    if (contentType.includes('image/')) {
        return { url: await blobToDataUrl(await response.blob()), raw: null };
    }
    if (/zip|octet-stream/i.test(contentType)) {
        return { url: await binaryBlobToImageDataUrl(await response.blob(), contentType), raw: null };
    }
    const text = await response.text();
    if (!text) return { url: null, raw: null };
    try {
        const data = JSON.parse(text);
        return { url: normalizeImageResult(data), raw: data };
    } catch (error) {
        const bytes = new TextEncoder().encode(text);
        if (bytes.length > 8 && bytesToText(bytes.slice(0, 2)) === 'PK') {
            return { url: await zipBlobToFirstImageDataUrl(new Blob([bytes])), raw: null };
        }
        return { url: normalizeImageResult(text), raw: text };
    }
}

export async function pollImageTask(firstPayload, imageApi = {}, headers = {}, deps = {}) {
    const task = extractImageTask(firstPayload);
    if (!task) return null;
    const pollUrl = resolvePollUrl(task, imageApi.endpoint);
    if (!pollUrl) {
        throw new Error(`图像 API 返回了异步任务 ID（${task.id || '未知'}），但没有返回 status_url/poll_url，无法自动取图。请改用同步返回图片的接口，或让代理返回轮询地址。`);
    }
    const attempts = Math.max(1, Number(imageApi.pollAttempts) || DEFAULT_POLL_ATTEMPTS);
    const interval = Math.max(500, Number(imageApi.pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS);
    for (let index = 0; index < attempts; index += 1) {
        await sleep(index === 0 ? Math.min(1000, interval) : interval, deps);
        const response = await fetchWithTimeout(pollUrl, {
            method: 'GET',
            headers,
        }, Number(imageApi.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS, deps);
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`轮询图像任务失败 HTTP ${response.status}: ${text.slice(0, 180)}`);
        }
        const parsed = await parseImageResponse(response);
        if (parsed.url) return parsed;
        if (parsed.raw) extractImageTask(parsed.raw);
    }
    throw new Error(`图像 API 异步任务超时：已轮询 ${attempts} 次仍未返回图片`);
}

export async function generateImage(request, settings = {}, deps = {}) {
    const imageApi = {
        ...cloneData(settings || {}),
    };
    const mode = String(imageApi.mode || 'nai').trim() || 'nai';
    if (mode !== 'nai') {
        throw new Error('内置图像 API 未启用');
    }
    if (!imageApi.endpoint) throw new Error('请先在设置中填写图像 API 地址');
    const endpoint = imageGenerationUrl(imageApi.endpoint);
    if (!endpoint) throw new Error('请先在设置中填写图像 API 地址');

    const requestObject = isPlainObject(request) ? cloneData(request) : {};
    const size = String(imageApi.size || DEFAULT_SIZE).split('x');
    const width = Number(requestObject.parameters && requestObject.parameters.width) || Number(size[0]) || 832;
    const height = Number(requestObject.parameters && requestObject.parameters.height) || Number(size[1]) || 1216;
    const inputText = withPromptPrefix(
        requestObject.input || requestObject.prompt || request || '',
        imageApi.promptPrefix || '',
    );
    const body = {
        ...requestObject,
        input: withPromptPrefix(requestObject.input || inputText, imageApi.promptPrefix || ''),
        prompt: withPromptPrefix(requestObject.prompt || inputText, imageApi.promptPrefix || ''),
        model: requestObject.model || imageApi.model || DEFAULT_MODEL,
        action: requestObject.action || 'generate',
        parameters: {
            width,
            height,
            steps: Number(requestObject.parameters && requestObject.parameters.steps) || Number(imageApi.steps) || DEFAULT_STEPS,
            sampler: requestObject.parameters && requestObject.parameters.sampler || imageApi.sampler || DEFAULT_SAMPLER,
            n_samples: Number(requestObject.parameters && requestObject.parameters.n_samples) || 1,
            ...(isPlainObject(requestObject.parameters) ? requestObject.parameters : {}),
        },
    };
    const headers = buildApiHeaders(imageApi.apiKey, 'application/json');
    headers.Accept = 'application/json, image/png, image/jpeg, image/webp, application/zip, application/x-zip-compressed, */*';
    const authHeaders = buildApiHeaders(imageApi.apiKey);

    let response;
    try {
        response = await fetchWithTimeout(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        }, Number(imageApi.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS, deps);
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        throw new Error(`图像 API 请求失败：${message}；原始地址：${imageApi.endpoint}；生成地址：${endpoint}`);
    }

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}；原始地址：${imageApi.endpoint}；生成地址：${endpoint}；响应：${text.slice(0, 180)}`);
    }

    const parsed = await parseImageResponse(response);
    if (parsed.url) return { url: parsed.url, raw: parsed.raw };
    if (parsed.raw) {
        const polled = await pollImageTask(parsed.raw, imageApi, authHeaders, deps);
        if (polled && polled.url) {
            return { url: polled.url, raw: polled.raw || parsed.raw };
        }
    }
    throw new Error(`图像 API 未返回可识别图片。${describeImagePayload(parsed.raw)}`);
}

function withPromptPrefix(text, prefix) {
    const prompt = String(text || '').trim();
    const promptPrefix = String(prefix || '').trim();
    if (!promptPrefix) return prompt;
    if (!prompt) return promptPrefix;
    return prompt.startsWith(promptPrefix) ? prompt : `${promptPrefix}\n${prompt}`;
}

function looksLikeBase64Image(value) {
    const text = String(value || '').trim();
    if (text.length < 80) return false;
    return /^[A-Za-z0-9+/=\s]+$/.test(text);
}

function normalizeImageResult(data) {
    if (!data) return null;
    if (Array.isArray(data)) {
        for (const item of data) {
            const found = normalizeImageResult(item);
            if (found) return found;
        }
        return null;
    }
    if (typeof data === 'string') {
        const text = data.trim();
        if (/^(https?:|blob:|data:image\/)/i.test(text)) return text;
        if (looksLikeBase64Image(text)) return `data:image/png;base64,${text.replace(/\s+/g, '')}`;
        return null;
    }
    const directKeys = ['url', 'image', 'base64', 'b64', 'b64_json', 'image_base64', 'imageBase64', 'imageData', 'dataUrl', 'data_url', 'src'];
    for (const key of directKeys) {
        if (data[key]) {
            const found = normalizeImageResult(data[key]);
            if (found) return found;
        }
    }
    const nestedKeys = ['output', 'outputs', 'images', 'data', 'artifacts', 'result', 'results', 'files'];
    for (const key of nestedKeys) {
        if (data[key]) {
            const found = normalizeImageResult(data[key]);
            if (found) return found;
        }
    }
    return null;
}

function extractImageTask(data) {
    if (!isPlainObject(data)) return null;
    const status = String(data.status || data.state || data.task_status || data.phase || '').toLowerCase();
    const failStates = ['failed', 'failure', 'error', 'cancelled', 'canceled'];
    if (failStates.includes(status)) {
        const message = data.error && (data.error.message || data.error.msg) || data.message || data.detail || status;
        throw new Error(`图像 API 任务失败：${message}`);
    }
    const pendingStates = ['queued', 'queue', 'pending', 'processing', 'running', 'submitted', 'created', 'waiting'];
    const id = data.task_id || data.taskId || data.job_id || data.jobId || data.request_id || data.requestId || data.id;
    const pollUrl = data.status_url || data.statusUrl || data.poll_url || data.pollUrl || data.task_url || data.taskUrl;
    if (pollUrl || pendingStates.includes(status) || (id && !normalizeImageResult(data))) {
        return {
            id: id ? String(id) : '',
            pollUrl: pollUrl ? String(pollUrl) : '',
            status: status || 'pending',
        };
    }
    return null;
}

function resolvePollUrl(task, endpoint) {
    if (!task || !task.pollUrl) return '';
    try {
        return new URL(task.pollUrl, endpoint).href;
    } catch (error) {
        return task.pollUrl;
    }
}

function describeImagePayload(data) {
    if (typeof data === 'string') return data.slice(0, 220);
    if (!isPlainObject(data)) return Object.prototype.toString.call(data);
    const keys = Object.keys(data).slice(0, 12).join(', ');
    const status = data.status || data.state || data.task_status || '';
    const message = data.message || data.detail || data.error && (data.error.message || data.error.msg) || '';
    return ['返回字段：' + (keys || '无'), status ? `状态：${status}` : '', message ? `信息：${message}` : ''].filter(Boolean).join('；');
}

async function fetchWithTimeout(url, options, timeoutMs, deps = {}) {
    const fetchFn = resolveFetchFunction(deps);
    const TimeoutController = resolveAbortController(deps);
    if (!TimeoutController) {
        return fetchFn(url, options);
    }
    const controller = new TimeoutController();
    const timer = resolveSetTimeout(deps)(() => {
        try {
            controller.abort();
        } catch (error) {
            // Abort failures are ignored because the request will resolve anyway.
        }
    }, Math.max(5000, Number(timeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS));
    try {
        return await fetchFn(url, { ...(options || {}), signal: controller.signal });
    } catch (error) {
        if (error && error.name === 'AbortError') {
            throw new Error('图像 API 请求超时，请调大超时或检查后端队列状态');
        }
        throw error;
    } finally {
        resolveClearTimeout(deps)(timer);
    }
}

function resolveFetchFunction(deps) {
    const fetchFn = deps.fetch
        || deps.global && deps.global.fetch
        || globalThis.fetch;
    if (typeof fetchFn !== 'function') {
        throw new Error('当前环境不支持 fetch，无法请求图像 API');
    }
    return fetchFn.bind(deps.global && typeof deps.global.fetch === 'function' ? deps.global : globalThis);
}

function resolveAbortController(deps) {
    return deps.AbortController
        || deps.global && deps.global.AbortController
        || globalThis.AbortController
        || null;
}

function resolveSetTimeout(deps) {
    return deps.setTimeout
        || deps.global && deps.global.setTimeout
        || globalThis.setTimeout
        || setTimeout;
}

function resolveClearTimeout(deps) {
    return deps.clearTimeout
        || deps.global && deps.global.clearTimeout
        || globalThis.clearTimeout
        || clearTimeout;
}

async function blobToDataUrl(blob) {
    if (typeof FileReader === 'function') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    if (typeof Buffer === 'function') {
        const mimeType = blob && blob.type ? blob.type : 'application/octet-stream';
        const buffer = Buffer.from(await blob.arrayBuffer());
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
    }
    throw new Error('当前环境无法把图片 Blob 转成 data URL');
}

async function binaryBlobToImageDataUrl(blob, contentType) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        return zipBlobToFirstImageDataUrl(new Blob([buffer], { type: contentType || 'application/zip' }));
    }
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return blobToDataUrl(new Blob([buffer], { type: 'image/png' }));
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return blobToDataUrl(new Blob([buffer], { type: 'image/jpeg' }));
    }
    if (bytes.length >= 12 && bytesToText(bytes.slice(0, 4)) === 'RIFF' && bytesToText(bytes.slice(8, 12)) === 'WEBP') {
        return blobToDataUrl(new Blob([buffer], { type: 'image/webp' }));
    }
    throw new Error('图像 API 返回二进制数据，但不是可识别的图片或 ZIP');
}

async function zipBlobToFirstImageDataUrl(blob) {
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    let offset = 0;
    while (offset + 30 < buffer.byteLength) {
        const signature = view.getUint32(offset, true);
        if (signature !== 0x04034b50) {
            offset += 1;
            continue;
        }
        const method = view.getUint16(offset + 8, true);
        const compressedSize = view.getUint32(offset + 18, true);
        const nameLength = view.getUint16(offset + 26, true);
        const extraLength = view.getUint16(offset + 28, true);
        const nameStart = offset + 30;
        const dataStart = nameStart + nameLength + extraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > buffer.byteLength) break;
        const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLength));
        const isImage = /\.(png|jpe?g|webp)$/i.test(name) || !name;
        if (isImage && compressedSize > 0) {
            let bytes = new Uint8Array(buffer, dataStart, compressedSize);
            if (method === 8) {
                if (typeof DecompressionStream !== 'function') {
                    throw new Error('图像 API 返回 ZIP 压缩包，但当前浏览器无法解压 deflate 数据');
                }
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                bytes = new Uint8Array(await new Response(stream).arrayBuffer());
            } else if (method !== 0) {
                throw new Error(`图像 API 返回 ZIP 压缩包，但压缩方式不受支持：${method}`);
            }
            const extension = (name.match(/\.(png|jpe?g|webp)$/i) || [])[1] || 'png';
            const mimeType = extension.toLowerCase().startsWith('jp') ? 'image/jpeg' : `image/${extension.toLowerCase()}`;
            return blobToDataUrl(new Blob([bytes], { type: mimeType }));
        }
        offset = dataEnd;
    }
    throw new Error('图像 API 返回 ZIP 压缩包，但没有找到图片文件');
}

function bytesToText(bytes) {
    try {
        return new TextDecoder().decode(bytes);
    } catch (error) {
        return '';
    }
}

function sleep(duration, deps = {}) {
    return new Promise((resolve) => {
        resolveSetTimeout(deps)(resolve, duration);
    });
}

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}
