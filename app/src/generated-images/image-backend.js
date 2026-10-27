import { isImageSeed, resolveImageSeed } from './image-seed.js';
import { normalizeAutoIllustrationSettings } from './illustration/auto-illustration-settings.js';
import { resolveNaiNativeEndpoint } from './request-builders/nai-v4-builder.js';
import { resolveNaiInpaintModel } from './request-builders/nai-inpaint-builder.js';
import { applyUserPromptsToCaption } from './dbgen-prompt.js';
import { PROMPT_KINDS, kindArtist, promptKindOf, globalArtist } from './prompt-artists.js';
import { formatStoredPrompt, promptFromCaption, promptFromText } from './generation-prompt.js';
import { findChatu8Host, requestChatu8Image } from './chatu8-client.js';
import { findBaibaiApi, requestBaibaiImage, readBaibaiStatus } from './baibai-client.js';
import { waitFloorPromptTags } from './floor-prompt-tags.js';
import { writeCaptionsWithLlm, writeTemplateCaptionsWithLlm } from './illustration/caption-writer.js';
import { clampPixelPair } from './illustration/cg-pixel-cap.js';
import { annotateImageFailure, readImageRetrySettings, sharedRateGate, withImageRetry } from './retry-policy.js';
import { recoverOperation, trackRecovery, waitForRecovery } from '../storage/automatic-recovery.js';
import { checkPromptTask, isSceneOnlyPromptOutput } from '../schemas/prompt-recipe.js';
import { prepareCharacterCaption } from './character-caption.js';
import { runImageTask, staleImageTask, inheritImageTaskLease, imageTaskState } from './image-task-runtime.js';
import { spriteSchemeOf, SCHEME_LIVELY } from './prompt-scheme.js';
import { imageWritingContext } from './image-prompt-context.js';
import { externalPromptDescription, externalCaptionFailure } from './external-prompt-reference.js';

// 生图来源：nai = IGS 内置 NAI；dbgen = 数据库生图插件（window.NaiDbGen）；
// extension = 智绘姬：剧情 CG、素材与物品图经智绘姬的出图事件生成，剧情 CG 优先用它写在楼层里的词；
// baibai = 柏宝绘：经其公开接口 globalThis.STBaiBaiImage 出图，图不进柏宝绘图库与聊天记录；剧情 CG 优先用它写在楼层里的词。
// 失败后继续恢复用户选定的来源。
export const IMAGE_SOURCE_MODES = Object.freeze(['nai', 'dbgen', 'extension', 'baibai']);
export const DBGEN_LABEL = '数据库生图插件';
export const CHATU8_LABEL = '智绘姬';
export const BAIBAI_LABEL = '柏宝绘';

export function normalizeImageSourceMode(value) {
    const mode = String(value || '').trim();
    return IMAGE_SOURCE_MODES.includes(mode) ? mode : 'extension';
}

// 等待较久只报告仍在处理；继续接收同一插件调用的结果，不再因本地计时器丢开原调用。
export const DBGEN_TIMEOUTS = Object.freeze({ write: 5 * 60 * 1000, paint: 3 * 60 * 1000 });

const secs = ms => `${(Math.max(0, ms) / 1000).toFixed(1)}s`;

// 生图分段耗时：手机端无控制台，写进排查日志供复制。
function reportNaiTiming(report, method, enteredAt, readyAt, result) {
    const t = result?.timing;
    if (typeof report !== 'function' || !t?.queuedAt) return;
    const parts = [`就绪检查 ${secs(readyAt - enteredAt)}`, `排队 ${secs((t.startedAt || t.doneAt) - t.queuedAt)}`];
    if (t.startedAt && t.headersAt) parts.push(`等服务器 ${secs(t.headersAt - t.startedAt)}`, `下载解析 ${secs((t.doneAt || t.headersAt) - t.headersAt)}`);
    parts.push(`合计 ${secs((t.doneAt || Date.now()) - enteredAt)}`);
    if (t.params) parts.push(`参数 ${t.params}`);
    report('info', `NAI 计时（${method === 'edit' ? '局部重绘' : '生图'}${result?.ok ? '' : '·失败'}）：${parts.join('，')}`);
}

function waitForPluginResult(promise, ms, onSlow, signal) {
    let timer, abort;
    const cancelled = new Promise(resolve => {
        abort = () => resolve({ ok: false, reason: 'request-stale', stopGeneration: true });
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
    });
    if (ms > 0) timer = setTimeout(() => { try { onSlow?.(); } catch { /* 状态展示不影响原请求。 */ } }, ms);
    return Promise.race([promise, cancelled]).finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', abort); });
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

// 公开诊断只接收协议字段、受控原因与有效索引；不复制模型载荷。
function promptDiagnostic(result, stage, slotId) {
    const error = result?.error;
    const source = { ...(error && typeof error === 'object' ? error.context : {}),
        ...result?.diagnostic, ...result?.diagnostics };
    const diagnostic = {};
    const code = result?.reason || source.code || error?.code;
    const characterMetaCodes = ['character-meta-shape', 'character-meta-caption', 'character-meta-key',
        'character-meta-binding', 'character-meta-index', 'character-meta-text', 'character-meta-position',
        'character-meta-position-mismatch', 'character-meta-region'];
    if (typeof code === 'string' && (/^[A-Z][A-Z0-9_]{0,63}$/.test(code)
        || characterMetaCodes.includes(code))) diagnostic.code = code;
    const stages = ['prompt-input', 'prompt-parse', 'prompt-output', 'prompt-write', 'igs-prompt-input', 'igs-prompt-output'];
    diagnostic.stage = stages.includes(source.stage) ? source.stage : stage;
    const fields = ['promptTask', 'promptTask.characters', 'promptTask.characters.characterKey',
        'promptTask.characters.token', 'promptTask.characters.kind', 'promptTask.characters.framing',
        'promptTask.slots', 'promptTask.slots.slotId', 'promptTask.slots.tokens',
        'promptRecipe', 'promptRecipe.bindings', 'promptRecipe.bindings.length',
        'promptTask.identityMode', 'promptTask.slots.identityMode', 'promptRecipe.identityMode',
        'binding.correction', 'identity_mode', 'meta_correction_identity', 'meta_correction_uc',
        'binding.kind', 'binding.captionIndex', 'binding.characterKey', 'binding.token', 'binding.framing',
        'caption', 'caption.scene', 'caption.char', 'caption.char_uc', 'characterContext',
        'characterMeta', 'characterMeta.characters', 'dnaCandidates', 'dnaCandidates.characters',
        'response_format', 'prompt_mode', 'meta_fields', 'meta_rows', 'meta_kind', 'meta_key', 'meta_token', 'meta_frame',
        'meta_identity', 'meta_signature', 'meta_outfit_name', 'meta_outfit_description', 'meta_region',
        ...['full_body', 'half_body', 'portrait', 'partial']
            .flatMap((frame) => [`meta_dna_${frame}`, `meta_dna_uc_${frame}`]),
        'dna.views', ...['full_body', 'half_body', 'portrait', 'partial']
            .flatMap(frame => [`dna.views.${frame}`, `dna.views.${frame}.subject`, `dna.views.${frame}.negative`])];
    if (fields.includes(source.field)) diagnostic.field = source.field;
    if (['invalid', 'missing', 'mismatch', 'duplicate', 'placeholder', 'preserved', 'locked'].includes(source.issue))
        diagnostic.issue = source.issue;
    if (['object-required', 'unknown-view', 'view-required', 'subject-required', 'string-required',
        'empty-subject', 'text-too-long', 'recursive-placeholder', 'code-fence'].includes(source.detail))
        diagnostic.detail = source.detail;
    const id = source.slotId ?? slotId;
    if (Number.isInteger(id) && id >= 1 && id <= 9999) diagnostic.slotId = id;
    if (Number.isSafeInteger(source.lineNumber) && source.lineNumber >= 1 && source.lineNumber <= 100000)
        diagnostic.lineNumber = source.lineNumber;
    for (const key of ['characterIndex', 'captionIndex']) {
        if (Number.isInteger(source[key]) && source[key] >= 0 && source[key] < 16) diagnostic[key] = source[key];
    }
    if (Number.isInteger(source.status) && source.status >= 100 && source.status <= 599)
        diagnostic.status = source.status;
    const traceId = source.traceId ?? error?.traceId;
    if (typeof traceId === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(traceId)) diagnostic.traceId = traceId;
    return diagnostic;
}

function describePromptFailure(result, stage, slotId, prefix = '') {
    const diagnostic = promptDiagnostic(result, stage, slotId);
    const labels = { 'prompt-input': 'DBGen 输入校验', 'prompt-parse': 'DBGen 回复解析',
        'prompt-output': 'DBGen 输出校验', 'prompt-write': 'DBGen 写词',
        'igs-prompt-input': 'IGS 输入校验', 'igs-prompt-output': 'IGS 输出校验' };
    const details = [labels[diagnostic.stage], diagnostic.code,
        diagnostic.field && `字段=${diagnostic.field}`, diagnostic.issue && `原因=${diagnostic.issue}`,
        diagnostic.detail && `detail=${diagnostic.detail}`];
    for (const key of ['slotId', 'characterIndex', 'captionIndex', 'lineNumber', 'status', 'traceId']) {
        if (diagnostic[key] !== undefined) details.push(`${key}=${diagnostic[key]}`);
    }
    // 外部 message/hint 可能含请求或模型正文，仅展示固定文案与受控诊断。
    return { ok: false, ...(diagnostic.code && { reason: diagnostic.code }), diagnostic,
        error: `${prefix}未返回可用提示词 [${details.filter(Boolean).join('；')}]` };
}

function describePromptException(error) {
    return describePromptFailure({ reason: 'DBGEN_PROMPT_EXCEPTION', error }, 'prompt-write', undefined,
        '数据库生图插件写词接口异常：');
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
    return clampPixelPair(Number(m[1]), Number(m[2]));
}

async function blobToDataUrl(blob, mimeType, globalObject) {
    if (typeof blob === 'string') {
        if (!blob.trim() || /^data:[^,]*,\s*$/.test(blob)) throw new Error('返回空图，未返回图片字节');
        return blob;
    }
    const buffer = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!bytes.length) throw new Error('返回空图，未返回图片字节');
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

export function createImageBackend({ nai, getBridge, global: globalObject = globalThis, chatu8, llm, report, dbgenTimeouts, floorPromptWait, taskRuntime, onRetry, retryGate = sharedRateGate, retrySleep, retryRandom } = {}) {
    const recoveryGlobal = taskRuntime?.recoveryGlobal || globalObject;
    const retryRun = (source, run, meta = {}, repair) => recoverOperation(() => withImageRetry(run, {
        signal: meta.signal, shouldStart: meta.shouldStart,
        source, gate: retryGate, onRetry, settings: readImageRetrySettings(readBridge(undefined, meta).autoIllustration),
        ...(retrySleep && { sleep: retrySleep }), ...(retryRandom && { random: retryRandom }),
    }), { signal: meta.signal, global: recoveryGlobal, retryUnchanged: false, repair,
        waitFor: result => source === 'nai' && repair && [400, 401, 402, 403, 422].includes(result?.status)
            ? { message: `NAI 请求被拒绝（HTTP ${result.status}）。请修正图像来源中的凭据或模型并保存；配置生效后自动续接本次请求。`,
                page: 'source', actionLabel: '打开图像来源' } : null,
        canResume: async result => {
            if (source !== 'nai' || ![400, 401, 402, 403, 422].includes(result?.status)) return false;
            const fixed = await repair?.(result);
            return fixed?.changed === true;
        },
        isActive: () => !meta.shouldStart || meta.shouldStart(),
        onRecover: ({ phase, message }) => report?.(phase === 'waiting-condition' ? 'error' : 'info', message),
    });
    const timeouts = { ...DBGEN_TIMEOUTS, ...(dbgenTimeouts && typeof dbgenTimeouts === 'object' ? dbgenTimeouts : {}) };
    const readBridge = (override, meta) => (override && typeof override === 'object' ? override
        : imageTaskState(meta)?.config || (getBridge ? getBridge() || {} : {}));
    const sendNai = (method, input, settings, meta = {}, slotArtist = false) => runImageTask(taskRuntime,
        inheritImageTaskLease(meta, inheritImageTaskLease(input, { ...meta, ...(!meta.caption && input?.caption && { caption: input.caption }),
            signal: meta.signal || input?.signal || settings?.signal,
            shouldStart: meta.shouldStart || input?.shouldStart || settings?.shouldStart })),
        async (guarded, lease) => {
            const enteredAt = Date.now();
            if (taskRuntime || getBridge) {
                const ready = await waitUntilReady(guarded);
                if (!ready?.ok) return ready;
            }
            const readyAt = Date.now();
            const config = imageTaskState(guarded)?.config || lease?.state?.config;
            const base = config?.autoIllustration?.nai;
            // 正式链路的凭据、传输和全局参数只取本轮私有快照，不复用旧设置副本。
            let frozen = base ? { ...base,
                ...(meta.size && { size: meta.size }),
                ...(isImageSeed(settings?.seed) && { seed: settings.seed }),
            } : { ...settings };
            if (base) {
                frozen.model = taskModel(meta, config);
            }
            frozen.seed = resolveImageSeed(frozen.seed);
            let prepared = input;
            if (slotArtist) ({ slot: prepared, naiSettings: frozen } = withSlotArtist(input, frozen, meta, base ? frozen : undefined));
            if (input?.captionMode === 'final') {
                const selected = artistFor(meta, base ? frozen : undefined);
                const artist = meta.artist !== undefined ? meta.artist : selected
                    ? { positivePrompt: selected.positive, negativePrompt: selected.negative }
                    : globalArtist(frozen);
                frozen.finalArtist = artist === null ? null : structuredClone(artist);
            }
            const controls = {
                ...(guarded.signal && { signal: guarded.signal }),
                ...(guarded.shouldStart && { shouldStart: guarded.shouldStart }),
            };
            const result = await retryRun('nai', () => nai[method](method === 'edit' ? { ...prepared, ...controls } : prepared,
                { ...frozen, ...controls, onSlow: () => report?.('info', 'NAI 仍在处理同一次请求，继续接收原结果') }), guarded,
            result => {
                if (![400, 401, 402, 403, 422].includes(result?.status)) return { changed: false };
                const latestBridge = getBridge?.() || {};
                const latestNai = normalizeAutoIllustrationSettings(latestBridge.autoIllustration).nai;
                const live = { ...latestNai };
                const keys = ['apiKey', 'endpoint', 'transport'];
                const repairModel = [400, 422].includes(result.status) && !Object.hasOwn(meta, 'model');
                if (repairModel) {
                    live.model = taskModel(meta, { ...latestBridge,
                        autoIllustration: { nai: latestNai } });
                    keys.push('model');
                }
                const changed = keys.some(key => live[key] !== frozen[key]);
                if (changed) {
                    const held = imageTaskState(guarded)?.config?.autoIllustration?.nai;
                    for (const key of keys) {
                        frozen[key] = live[key];
                        if (held) held[key] = live[key];
                    }
                    if (repairModel && held) {
                        held.model = latestNai.model;
                        const imageApi = imageTaskState(guarded)?.config?.imageApi;
                        const key = `${meta.imageKind}Model`;
                        if (imageApi && meta.imageKind) imageApi[key] = latestBridge.imageApi?.[key] || '';
                    }
                }
                return { changed };
            });
            reportNaiTiming(report, method, enteredAt, readyAt, result);
            return result;
        });
    // chatu8 可注入 { findHost, request } 供测试替换；默认走真实的智绘姬事件桥。
    const chatu8Bridge = chatu8 && typeof chatu8 === 'object' ? chatu8 : {};
    const findChatu8 = () => (typeof chatu8Bridge.findHost === 'function' ? chatu8Bridge.findHost() : findChatu8Host(globalObject));
    const requestChatu8 = typeof chatu8Bridge.request === 'function' ? chatu8Bridge.request : requestChatu8Image;
    async function waitSourceReady(source, meta, prompt = false) {
        let reported = false;
        const notice = trackRecovery(recoveryGlobal);
        const label = { dbgen: '数据库生图（nai-dbgen）', baibai: '柏宝绘', chatu8: '智绘姬' }[source] || source;
        try {
        while (!imageTaskStopped(meta)) {
            const api = source === 'dbgen' ? findDbgenApi(globalObject)
                : source === 'baibai' ? findBaibaiApi(globalObject) : findChatu8();
            const ready = api && (source !== 'dbgen' || !prompt || typeof api.generateSinglePrompt === 'function')
                && (source !== 'baibai' || readBaibaiStatus(api).configured !== false);
            if (ready) return api;
            if (!reported) {
                reported = true;
                const message = `${label}尚未就绪。请安装、启用并完成该插件的配置；程序每秒读取就绪状态，就绪后自动继续本次任务。`;
                notice.update({ phase: 'waiting-condition', message, page: 'source', actionLabel: '查看图像来源' });
                report?.('info', message);
            }
            await waitForRecovery(1000, { global: recoveryGlobal, signal: meta.signal });
        }
        return null;
        } finally { notice.end(); }
    }

    function waitUntilReady(meta = {}) {
        return runImageTask(taskRuntime, meta, async guarded => {
            const state = imageTaskState(guarded);
            const mode = describe(undefined, guarded).mode;
            if (mode !== 'nai') {
                const api = await waitSourceReady(mode === 'extension' ? 'chatu8' : mode, guarded, mode === 'dbgen');
                return api ? { ok: true } : staleImageTask();
            }
            const refresh = () => {
                const ready = describe(undefined, guarded).ready;
                if (ready.ok) return true;
                const current = normalizeAutoIllustrationSettings(getBridge?.()?.autoIllustration).nai;
                if (!String(current.apiKey || '').trim()) return false;
                const held = state?.config?.autoIllustration?.nai;
                if (held) for (const key of ['apiKey', 'endpoint', 'transport']) held[key] = current[key];
                return !state || describe(undefined, guarded).ready.ok;
            };
            return recoverOperation(() => refresh() ? { ok: true }
                : { ok: false, reason: 'nai-config-unset' }, {
                global: recoveryGlobal, signal: guarded.signal, retryUnchanged: false,
                isActive: () => !imageTaskStopped(guarded), canResume: refresh,
                waitFor: { message: '尚未配置 NAI Key，生图请求还未发送。请在图像来源中填写并保存；保存成功后自动继续本次任务。',
                    page: 'source', actionLabel: '打开图像来源' },
                onRecover: () => report?.('info', '原任务已保留；保存 NAI 设置后从当前步骤继续'),
            });
        });
    }

    // DBG 配置令牌属于插件；IGS 私有租约只校验来源、任务和交接，不改插件配置。
    function guardDbgenTask(meta, execute) {
        if (!taskRuntime || describe(undefined, meta).mode !== 'dbgen') return execute(meta);
        const { expectedConfigToken, ...input } = meta;
        inheritImageTaskLease(meta, input);
        input.shouldStart = () => !meta.shouldStart || meta.shouldStart() === true;
        return runImageTask(taskRuntime, input, (guarded, lease) => execute(
            inheritImageTaskLease(meta, { ...guarded,
                ...(expectedConfigToken !== undefined && { expectedConfigToken }) }), lease));
    }

    function imageTaskStopped(meta) {
        try {
            return Boolean(meta.signal?.aborted)
                || (typeof meta.shouldStart === 'function' && meta.shouldStart() !== true);
        } catch { return true; }
    }

    function describe(bridgeOverride, meta) {
        const bridge = readBridge(bridgeOverride, meta);
        const mode = normalizeImageSourceMode(bridge.imageApi && bridge.imageApi.mode);
        if (mode === 'dbgen') {
            return findDbgenApi(globalObject)
                ? { mode, via: 'dbgen', ownPrompts: true, ready: { ok: true } }
                : { mode, via: 'none', ownPrompts: true, ready: { ok: false, error: `未检测到${DBGEN_LABEL}，请确认已安装并启用，或在「生图与AI › 图像来源」改用内置 NAI` } };
        }
        const settings = normalizeAutoIllustrationSettings(bridge.autoIllustration).nai;
        const hasNaiKey = Boolean(String(settings.apiKey || '').trim());
        if (mode === 'baibai') {
            if (findBaibaiApi(globalObject)) return { mode, via: 'baibai', ownPrompts: false, ready: { ok: true } };
            return { mode, via: 'none', ownPrompts: false, ready: { ok: false, error: `正在等待${BAIBAI_LABEL}就绪` } };
        }
        if (mode === 'extension') {
            if (findChatu8()) return { mode, via: 'chatu8', ownPrompts: false, ready: { ok: true } };
            return { mode, via: 'none', ownPrompts: false, ready: { ok: false, error: `正在等待${CHATU8_LABEL}就绪` } };
        }
        if (!hasNaiKey) return { mode, via: 'none', ownPrompts: false, ready: { ok: false, error: '请先在「生图与AI › 图像来源」填写 NAI Key' } };
        return { mode, via: 'nai', ownPrompts: false, ready: { ok: true } };
    }

    function supportsCharacterTemplates() {
        return describe().mode === 'nai';
    }

    // 生图 → 图像来源 → 分类型模型：剧情 CG / 立绘 / 背景 / 物品各自的模型，留空跟随默认。
    // 内置 NAI 改 settings.model，数据库生图经 params.model 传给插件；智绘姬 / 柏宝绘没有模型参数，仍用插件自己的。
    function kindModel(meta) {
        const kind = meta && meta.imageKind;
        if (kind !== 'cg' && kind !== 'sprite' && kind !== 'background' && kind !== 'item') return '';
        const imageApi = readBridge(undefined, meta).imageApi || {};
        return String(imageApi[`${kind}Model`] || '').trim();
    }

    // 写词接口只收到「画什么」。前端正负模板不进这段描述，出图前再合并进插件返回的 caption。
    async function viaDbgen(meta = {}) {
        const api = await waitSourceReady('dbgen', meta);
        if (!api) return staleImageTask();
        const written = await writeFloorPrompts(meta);
        if (!written.ok) return written;
        const entry = written.captions[0];
        if (!entry) return { ok: false, error: '写词未返回可出图的条目' };
        const size = parseSize(meta.size) || (entry.width && entry.height
            ? clampPixelPair(entry.width, entry.height) : null);
        return paintDbgenCaption(api, { ...meta,
            slotId: entry.slotId,
            characterMeta: entry.characterMeta,
            ...(entry.promptRecipe !== undefined && { promptRecipe: entry.promptRecipe }),
            ...(entry.dnaCandidates !== undefined && { dnaCandidates: entry.dnaCandidates }),
            size: size ? `${size.width}x${size.height}` : meta.size }, entry.caption);
    }

    // 外部插件按自己的预设和 LLM 返回完整 caption；IGS 资料仅放入公开 description。
    async function writeDbgenPrompt(meta, floor = false) {
        const api = await waitSourceReady('dbgen', meta, true);
        if (!api) return staleImageTask();
        const description = externalPromptDescription(meta.description, meta.characterContext,
            floor ? { ...meta, imagePromptTask: 'cg' } : meta);
        if (!description) return { ok: false, error: '没有可交给数据库生图插件的画面描述' };
        if (typeof api.generateSinglePrompt !== 'function') return { ok: false, error: `${DBGEN_LABEL}版本过旧，缺少写提示词接口` };
        let written;
        try {
            written = await waitForPluginResult(api.generateSinglePrompt({ description,
                ...((floor ? meta.skipRecall === true : true) && { skipRecall: true }),
                ...(meta.messageId != null && { messageId: Number(meta.messageId) }),
                ...(meta.signal && { signal: meta.signal }),
            }), timeouts.write, () => report?.('info', '数据库生图插件仍在写词，继续等待同一次调用'), meta.signal);
        } catch (error) { return describePromptException(error); }
        if (!written?.ok || !written.value?.caption)
            return describePromptFailure(written || { reason: 'DBGEN_PROMPT_EMPTY' }, 'prompt-write');
        const rows = Array.isArray(written.value.captions) && written.value.captions.length
            ? written.value.captions : [{ slotId: 1, ...written.value }];
        const captions = rows.filter(row => row && captionHasPromptText(row.caption)).map(row => ({
            slotId: row.slotId, caption: row.caption,
            ...(row.anchorSentence || row.anchor ? { anchorSentence: String(row.anchorSentence || row.anchor) } : {}),
            ...(row.width != null && { width: row.width }), ...(row.height != null && { height: row.height }),
        }));
        if (!captions.length) return describePromptFailure({ reason: 'DBGEN_PROMPT_EMPTY' }, 'prompt-output');
        return { ok: true, caption: written.value.caption, captions,
            ...(written.value.width != null && { width: written.value.width }),
            ...(written.value.height != null && { height: written.value.height }) };
    }

    async function writePrompt(meta = {}) {
        const mode = describe(undefined, meta).mode;
        if (mode === 'dbgen') return writeDbgenPrompt(meta);
        if (mode !== 'nai') {
            const { characterContext, ...writing } = meta;
            return writeCaptionsWithLlm(llm,
                normalizeAutoIllustrationSettings(readBridge(undefined, meta).autoIllustration).llm,
                externalPromptDescription(meta.description, characterContext, meta), inheritImageTaskLease(meta, writing));
        }
        const context = imageWritingContext(meta);
        if (!context.ok) return context;
        meta = context.value;
        const task = checkPromptTask(meta.promptTask, meta.characterContext);
        if (!task.ok) return describePromptFailure(task, 'igs-prompt-input');
        return task.value ? writeTemplateCaptionsWithLlm(llm,
            normalizeAutoIllustrationSettings(readBridge(undefined, meta).autoIllustration).llm,
            inheritImageTaskLease(meta, { ...meta, promptTask: task.value }))
            : writeCaptionsWithLlm(llm, normalizeAutoIllustrationSettings(readBridge(undefined, meta).autoIllustration).llm, meta.description, meta);
    }

    // 楼内 CG：走召回，把生成点原样带回。不出图。
    async function writeFloorPrompts(meta = {}) {
        if (describe(undefined, meta).mode === 'dbgen') return writeDbgenPrompt(meta, true);
        const task = checkPromptTask(meta.promptTask, meta.characterContext);
        if (!task.ok) return describePromptFailure(task, 'igs-prompt-input');
        if (describe(undefined, meta).mode !== 'nai' || !task.value || task.value.purpose !== 'cg')
            return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '内置楼层写词需要显式 CG 模板任务' };
        return writeTemplateCaptionsWithLlm(llm,
            normalizeAutoIllustrationSettings(readBridge(undefined, meta).autoIllustration).llm,
            { ...meta, promptTask: task.value, imagePromptTask: 'cg',
                outputs: { ...meta.outputs, selection: 'numbered-text' } });
    }

    function captionHasPromptText(caption) {
        const pos = caption && caption.v4_prompt && caption.v4_prompt.caption;
        if (!pos || typeof pos !== 'object') return false;
        if (String(pos.base_caption || '').trim()) return true;
        const chars = Array.isArray(pos.char_captions) ? pos.char_captions : [];
        return chars.some((item) => String(item && item.char_caption || '').trim());
    }

    function paintDbgenCaption(api, meta, caption) {
        return retryRun('dbgen', ({ seed }) => paintDbgenCaptionOnce(findDbgenApi(globalObject) || api,
            seed ? inheritImageTaskLease(meta, { ...meta, seed }) : meta, caption), meta);
    }

    async function paintDbgenCaptionOnce(api, meta, caption) {
        if (imageTaskStopped(meta)) return staleImageTask();
        const incomplete = externalCaptionFailure(caption);
        if (incomplete) return incomplete;
        if (!captionHasPromptText(caption)) {
            return { ok: false, error: `${DBGEN_LABEL}返回的不是生图提示词，已停止出图`, prompt: promptFromCaption(caption) };
        }
        // DBGen 已交付完整内容；不在此套用 IGS DNA、衣装模板或定稿协议。
        const merged = caption;
        const artistSettings = readBridge(undefined, meta).autoIllustration?.nai;
        const artist = artistFor(meta, artistSettings);
        const fallbackArtist = globalArtist(artistSettings);
        const requestArtist = meta.artist !== undefined ? meta.artist
            : artist ? { positivePrompt: artist.positive, negativePrompt: artist.negative }
                : fallbackArtist.positivePrompt.trim() || fallbackArtist.negativePrompt.trim() ? fallbackArtist : undefined;
        reportLong(report, '数据库生图提供的提示词', captionLogText(caption));
        if (artist && typeof report === 'function') {
            const label = (PROMPT_KINDS.find(([id]) => id === promptKindOf(meta)) || [])[1] || '';
            report('info', `分区画师串（${label}）：作为画师串对象交给数据库生图`);
        }
        reportLong(report, '发出去', captionLogText(merged));
        const size = parseSize(meta.size);
        // 立绘走数据库生图时默认打开透明底。模型默认用插件自己的运行配置；填了分类型模型才传 model。
        const model = kindModel(meta);
        const params = {
            ...(size || {}),
            ...(model && { model }),
            ...(meta.transparent === true && { straight_alpha: true, tag_hint_transparent_background: true }),
            ...(Number.isInteger(meta.seed) && meta.seed >= 0 && { seed: meta.seed }),
        };
        let result;
        try {
            result = await waitForPluginResult(api.generate({
                caption: merged,
                replaceCharacterKeywords: meta.replaceCharacterKeywords !== false && !isSceneOnlyPromptOutput({ caption: merged }),
                signal: meta.signal,
                shouldStart: meta.shouldStart,
                ...(requestArtist !== undefined && { artist: requestArtist }),
                ...(Object.keys(params).length && { params }),
            }), timeouts.paint, () => report?.('info', '数据库生图插件仍在出图，继续接收同一次调用的结果'), meta.signal);
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}出图失败：${(error && error.message) || error}`, prompt: promptFromCaption(merged) };
        }
        const image = result && result.ok && Array.isArray(result.value) ? result.value[0] : null;
        if (!image || !image.blob) return { ok: false, error: `${DBGEN_LABEL}出图失败：${describeResultError(result, '未返回图片')}`, prompt: promptFromCaption(merged) };
        try {
            return { ok: true, dataUrl: await blobToDataUrl(image.blob, image.mimeType, globalObject),
                prompt: promptFromCaption(merged), caption: merged };
        } catch (error) {
            return { ok: false, error: `${DBGEN_LABEL}图片读取失败：${(error && error.message) || error}`, prompt: promptFromCaption(merged) };
        }
    }

    async function generateCaption(meta = {}) {
        if (!meta.caption) return { ok: false, error: '没有可出图的提示词' };
        if (describe(undefined, meta).mode !== 'nai') {
            const incomplete = externalCaptionFailure(meta.caption);
            if (incomplete) return incomplete;
        }
        if (describe(undefined, meta).mode !== 'dbgen') return paintCaption(meta);
        const api = await waitSourceReady('dbgen', meta);
        if (!api) return staleImageTask();
        return paintDbgenCaption(api, meta, meta.caption);
    }

    // 非数据库生图来源：caption 合上模板后拆回 slot，按当前图像来源（NAI / 智绘姬 / 柏宝绘）出图。
    async function paintCaption(meta) {
        const userPrompts = meta.userPrompts && typeof meta.userPrompts === 'object' ? meta.userPrompts : null;
        if (describe(undefined, meta).mode === 'nai') {
            const lively = spriteSchemeOf(imageTaskState(meta)?.promptPreset?.data).id === SCHEME_LIVELY;
            const prepared = prepareCharacterCaption(lively ? { ...meta, omitPersonality: true } : meta);
            if (!prepared.ok) return prepared;
            if (prepared.captionMode === 'final') {
                if (String(userPrompts?.positive || '').trim() || String(userPrompts?.negative || '').trim())
                    return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '定稿发送不能再追加模板，请在写词阶段提供要求' };
                const settings = { ...normalizeAutoIllustrationSettings(readBridge(undefined, meta).autoIllustration).nai,
                    ...(meta.size && { size: meta.size }),
                    ...(isImageSeed(meta.seed) && { seed: meta.seed }),
                    ...(meta.signal && { signal: meta.signal }),
                    ...(meta.shouldStart && { shouldStart: meta.shouldStart }) };
                const model = kindModel(meta);
                if (model) settings.model = model;
                const result = await sendNai('generate', { caption: prepared.caption, captionMode: 'final',
                    transparent: meta.transparent === true }, settings, meta);
                if (!result?.ok) return result;
                if (!result.sentPrompt) return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '定稿生图缺少实际发送快照' };
                return { ok: true, dataUrl: result.dataUrl, via: 'nai', caption: prepared.caption,
                    ...(isImageSeed(result.seed) && { seed: result.seed }),
                    prompt: promptFromCaption(prepared.caption), captionMode: 'final', sentPrompt: result.sentPrompt,
                    ...(meta.characterMeta !== undefined && { characterMeta: prepared.characterMeta || meta.characterMeta }),
                    ...(prepared.promptRecipe && { promptRecipe: prepared.promptRecipe, dnaSnapshot: prepared.dnaSnapshot }),
                    ...(prepared.outfitSnapshot && { outfitSnapshot: prepared.outfitSnapshot }),
                    ...(prepared.dnaCandidates && { dnaCandidates: prepared.dnaCandidates }) };
            }
        }
        const merged = describe(undefined, meta).mode === 'nai' && userPrompts ? applyUserPromptsToCaption(meta.caption, userPrompts) : meta.caption;
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
            ...normalizeAutoIllustrationSettings(readBridge(undefined, meta).autoIllustration).nai,
            ...(meta.size && { size: meta.size }),
            ...(isImageSeed(meta.seed) && { seed: meta.seed }),
        };
        const prompt = promptFromCaption(merged);
        let result;
        try { result = await generate(slot, settings, meta); } catch (error) { result = { ok: false, error: (error && error.message) || String(error) }; }
        return result && result.ok && result.dataUrl
            ? { ok: true, dataUrl: result.dataUrl, prompt, via: result.via,
                ...(isImageSeed(result.seed) && { seed: result.seed }) }
            : { ok: false, error: (result && result.error) || '出图失败', prompt,
                ...(result?.reason && { reason: result.reason }),
                ...(result?.stopGeneration && { stopGeneration: true }),
                ...(result?.failure && { failure: result.failure }),
                ...(result?.recoveryStopped && { recoveryStopped: true }) };
    }

    const sourceFailure = (reason, result) => ({ ...result, ok: false, reason: 'source-unavailable', error: reason });

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

    function viaBaibai(slot, naiSettings, meta = {}) {
        return runImageTask(taskRuntime, inheritImageTaskLease(meta, inheritImageTaskLease(slot, { ...meta })), async guarded => {
            if (imageTaskStopped(guarded)) return staleImageTask();
            const api = await waitSourceReady('baibai', guarded);
            if (!api) return staleImageTask();
            const size = naiSettings && naiSettings.size;
            const floorTag = await pluginFloorTag('baibai', BAIBAI_LABEL, guarded);
            if (imageTaskStopped(guarded)) return staleImageTask();
            const result = await retryRun('baibai', ({ seed }) => requestBaibaiImage(findBaibaiApi(globalObject) || api, slot, { size, seed: seed || naiSettings?.seed, floorTag,
                signal: guarded.signal, onSlow: () => report?.('info', '柏宝绘仍在处理同一次请求，继续接收原结果') }), guarded);
            if (imageTaskStopped(guarded)) return staleImageTask();
            if (!result.ok) return sourceFailure(result.error, result);
            return { ok: true, via: 'baibai', dataUrl: result.dataUrl, prompt: promptFromText(result.prompt, '') };
        });
    }

    function viaChatu8(slot, naiSettings, meta = {}) {
        return runImageTask(taskRuntime, inheritImageTaskLease(meta, inheritImageTaskLease(slot, { ...meta })), async guarded => {
            const fallback = (reason, result) => imageTaskStopped(guarded) ? staleImageTask() : sourceFailure(reason, result);
            if (imageTaskStopped(guarded)) return staleImageTask();
            const host = await waitSourceReady('chatu8', guarded);
            if (!host) return staleImageTask();
            const floorTag = await pluginFloorTag('chatu8', CHATU8_LABEL, guarded);
            if (imageTaskStopped(guarded)) return staleImageTask();
            const prompt = floorTag ? floorTag.tag : buildChatu8Prompt(slot);
            if (!prompt) return { ok: false, error: `没有可交给${CHATU8_LABEL}的提示词` };
            const result = await retryRun('chatu8', () => requestChatu8(findChatu8() || host, prompt, {
                signal: guarded.signal, onSlow: () => report?.('info', '智绘姬仍在处理同一个请求，继续等待相同 ID 的回执') }), guarded);
            if (imageTaskStopped(guarded)) return staleImageTask();
            if (!result || !result.ok) return fallback((result && result.error) || `${CHATU8_LABEL}出图失败`, result);
            try {
                const dataUrl = await chatu8ImageToDataUrl(result.imageData, host.win || globalObject);
                if (imageTaskStopped(guarded)) return staleImageTask();
                return { ok: true, via: 'chatu8', dataUrl, prompt: promptFromText(prompt, '') };
            } catch (error) {
                return fallback(`${CHATU8_LABEL}图片读取失败：${(error && error.message) || error}`);
            }
        });
    }

    // 剧情 CG 规划前调用：柏宝绘 / 智绘姬来源下等它把本楼的词写完（没开自动写词立即返回），其他来源不等。
    async function waitSourceFloorPrompts(messageId) {
        const source = { baibai: 'baibai', chatu8: 'chatu8' }[describe().via];
        return source ? waitFloorPromptTags(globalObject, source, messageId, floorPromptWait) : [];
    }

    // 分区画师串：开关打开且这一类填了才用。数据库生图把正负面作为 artist 对象传入；内置 NAI 拼到提示词前面。智绘姬、柏宝绘不改。
    function artistFor(meta, settings = readBridge(undefined, meta).autoIllustration?.nai) {
        return kindArtist(settings?.artistByKind, meta);
    }

    function taskModel(meta, config) {
        return Object.hasOwn(meta, 'model') ? meta.model
            : config.imageApi?.[`${meta.imageKind}Model`] || config.autoIllustration.nai.model;
    }

    function prependPrompt(head, tail) {
        return [head, tail].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
    }

    // 内置 NAI 的提示词由 IGS 自己写，画师串直接拼到前面，全局串让位，避免叠两份。
    function withSlotArtist(slot, naiSettings, meta, artistSettings) {
        const artist = artistFor(meta, artistSettings);
        if (!artist) return { slot, naiSettings };
        if (typeof report === 'function') {
            const label = (PROMPT_KINDS.find(([id]) => id === promptKindOf(meta)) || [])[1] || '';
            report('info', `分区画师串（${label}）：拼到提示词前面`);
        }
        return {
            slot: inheritImageTaskLease(slot, {
                ...slot,
                ...(artist.positive && { scene: prependPrompt(artist.positive, slot && slot.scene) }),
                ...(artist.negative && { sceneUc: prependPrompt(artist.negative, slot && slot.sceneUc) }),
            }),
            naiSettings: naiSettings && typeof naiSettings === 'object' ? {
                ...naiSettings,
                ...(artist.positive && { artistPrefix: '' }),
                ...(artist.negative && { negativePrompt: '' }),
                ...(artist.negative && Object.hasOwn(naiSettings, 'artistNegativePrefix') && { artistNegativePrefix: '' }),
            } : naiSettings,
        };
    }

    // 剧情 CG / 素材补全入口，签名与 nai-official-client 的 generate 一致，多一个 meta。
    const hasPromptProtocol = (input) => ['promptRecipe', 'promptTask', 'dnaCandidates', 'captionMode']
        .some((key) => input?.[key] !== undefined);

    async function generate(slot, naiSettings, meta = {}) {
        inheritImageTaskLease(slot, meta);
        const result = await generateRouted(slot, naiSettings, meta);
        return annotateImageFailure(result, describe(undefined, meta).via);
    }

    async function generateRouted(slot, naiSettings, meta) {
        const mode = describe(undefined, meta).mode;
        if (mode === 'nai' && (hasPromptProtocol(meta) || hasPromptProtocol(slot))) {
            const caption = meta.caption || slot?.caption;
            return caption ? generateCaption(inheritImageTaskLease(slot, { ...slot, ...meta, caption }))
                : { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '内置提示词协议缺少可发送的正文' };
        }
        const model = kindModel(meta);
        if (model && naiSettings && typeof naiSettings === 'object') naiSettings = { ...naiSettings, model };
        if (mode === 'dbgen') return viaDbgen(meta);
        if (mode === 'extension') return viaChatu8(slot, naiSettings, meta);
        if (mode === 'baibai') return viaBaibai(slot, naiSettings, meta);
        return sendNai('generate', slot, naiSettings, meta, true);
    }

    // 阅读器「重画 / 测试生成」入口：返回 reader-image-service 需要的 { url }。
    async function generateForReader(request = {}, opts = {}) {
        const unified = opts.unifiedSettings || {};
        const bridge = unified.bridge && typeof unified.bridge === 'object' ? unified.bridge : {};
        const mode = normalizeImageSourceMode((opts.imageApi && opts.imageApi.mode) || (bridge.imageApi && bridge.imageApi.mode));
        if (request.caption && mode !== 'nai') {
            const result = await generateCaption(request);
            return result.ok ? { url: result.dataUrl, providerId: `vn.provider.${mode}` } : result;
        }
        if (hasPromptProtocol(request) && mode === 'nai') {
            if (mode !== describe(undefined, request).mode)
                return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '提示词协议与当前图像来源不一致，已停止出图' };
            if (!request.caption)
                return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '新提示词协议缺少可发送的正文' };
            const result = await generateCaption(inheritImageTaskLease(request, { ...request, imageKind: 'cg' }));
            if (!result.ok) return result;
            const { dataUrl, ...details } = result;
            return { ...details, url: dataUrl, providerId: `vn.provider.${mode}` };
        }
        const prompt = String(request.prompt || request.input || '').trim();
        if (mode === 'extension') return { ok: false, reason: 'provider-not-enabled' };
        if (mode === 'baibai') {
            if (!prompt) return { ok: false, reason: '没有可用于生图的提示词' };
            const result = await viaBaibai({ scene: prompt }, normalizeAutoIllustrationSettings(bridge.autoIllustration).nai,
                inheritImageTaskLease(request, {
                    ...(request.signal && { signal: request.signal }),
                    ...(request.shouldStart && { shouldStart: request.shouldStart }),
                    ...(request.expectedConfigToken !== undefined && { expectedConfigToken: request.expectedConfigToken }) }));
            if (result?.stopGeneration) return result;
            return result.ok ? { url: result.dataUrl, providerId: `vn.provider.${result.via}` } : { ok: false, reason: result.error };
        }
        if (mode === 'dbgen') {
            const messageId = opts.message && opts.message.id != null ? opts.message.id : opts.messageId;
            const result = await viaDbgen(inheritImageTaskLease(request, { description: prompt, messageId, imageKind: 'cg',
                ...(request.signal && { signal: request.signal }),
                ...(request.shouldStart && { shouldStart: request.shouldStart }) }));
            if (result?.stopGeneration) return result;
            return result.ok ? { url: result.dataUrl, providerId: 'vn.provider.dbgen' } : { ok: false, reason: result.error };
        }
        let settings = normalizeAutoIllustrationSettings(bridge.autoIllustration).nai;
        if (!String(settings.apiKey || '').trim()) return { delegate: true };
        if (!prompt) return { ok: false, reason: '没有可用于生图的提示词' };
        const cgModel = kindModel({ imageKind: 'cg' });
        if (cgModel) settings = { ...settings, model: cgModel };
        const result = await sendNai('generate', { scene: prompt }, settings, { ...request, imageKind: 'cg' });
        if (result?.stopGeneration) return result;
        if (result?.ok) return { url: result.dataUrl, providerId: 'vn.provider.nai' };
        return { ok: false, reason: result?.reason || 'nai-generate-failed',
            error: result?.error || 'NAI 生成失败',
            ...(Number.isInteger(result?.status) && { status: result.status }) };
    }

    // 设置页显式试图：冻结本次草稿，不提交配置，也不让普通生成接受草稿覆写。
    function testForReader(request = {}, opts = {}) {
        const bridge = opts.unifiedSettings?.bridge || {};
        const imageApi = opts.imageApi || bridge.imageApi || {};
        if (normalizeImageSourceMode(imageApi.mode) !== 'nai') return guardedGenerateForReader(request, opts);
        if (hasPromptProtocol(request)) return Promise.resolve({ ok: false, reason: 'PROMPT_MODE_CONFLICT',
            error: '配置试图不接管已有提示词任务' });
        const snapshot = structuredClone({ imageApi,
            autoIllustration: normalizeAutoIllustrationSettings(bridge.autoIllustration) });
        const input = { ...request };
        const previewBackend = createImageBackend({ nai, getBridge: () => snapshot, global: globalObject });
        return runImageTask(taskRuntime, request, guarded => previewBackend.generateForReader({
            ...input,
            ...(guarded.signal && { signal: guarded.signal }),
            ...(guarded.shouldStart && { shouldStart: guarded.shouldStart }),
        }, { unifiedSettings: { bridge: snapshot }, imageApi: snapshot.imageApi }));
    }

    // 局部重绘能力协商：与普通 generate 分开；只有内置 NAI 且客户端提供 edit 时可用。
    // 不支持时返回 image-edit-unsupported，绝不静默退化为整张重画。
    function describeEdit(bridgeOverride, request = {}) {
        const base = describe(bridgeOverride, request);
        if (base.mode !== 'nai') {
            return { supported: false, reason: 'image-edit-unsupported', message: base.mode === 'dbgen'
                ? `${DBGEN_LABEL}不支持局部重绘，请在「生图与AI › 图像来源」改用内置 NAI`
                : `${base.mode === 'baibai' ? BAIBAI_LABEL : CHATU8_LABEL}不支持局部重绘，请在「生图与AI › 图像来源」改用内置 NAI` };
        }
        if (!nai || typeof nai.edit !== 'function') {
            return { supported: false, reason: 'image-edit-unsupported', message: '当前 NAI 客户端不支持局部重绘' };
        }
        if (!base.ready.ok) return { supported: false, reason: 'backend-unavailable', message: base.ready.error };
        const naiSettings = normalizeAutoIllustrationSettings(readBridge(bridgeOverride, request).autoIllustration).nai;
        const explicitModel = Object.hasOwn(request, 'model');
        if (explicitModel) naiSettings.model = request.model;
        if (!resolveNaiInpaintModel(naiSettings.model)
            || (typeof nai.supportsEdit === 'function' && !nai.supportsEdit(naiSettings))) {
            return { supported: false, reason: 'image-edit-unsupported', message: '当前 NAI 模型没有已适配的局部重绘版本，请选择 V4／V4.5 或 V5 Full' };
        }
        return { supported: true, reason: '', message: '', via: 'nai',
            ...(explicitModel && { model: request.model }), infillModelNegotiation: 1, infillImg2imgStrength: 1,
            ...(typeof llm?.request === 'function' && typeof llm?.prepareImagePrompt === 'function'
                && { providedPromptContext: 1 }) };
    }

    // 一致性任务只拿脱敏配置租约与实际画师，不读取或保存上游凭据。
    async function getEditConfig(meta = {}) {
        const capability = describeEdit(undefined, meta);
        if (!capability.supported) return { ok: false, reason: capability.reason };
        if (capability.via === 'nai') {
            if (!taskRuntime) return { ok: false, reason: 'generation-config-unavailable' };
            const lease = taskRuntime.capture(meta);
            if (!lease.ok) return lease;
            try {
                const settings = lease.state.config.autoIllustration.nai;
                const model = taskModel(meta, lease.state.config);
                const frozenCapability = describeEdit(lease.state.config, { ...meta, model });
                if (!frozenCapability.supported || !lease.isCurrent())
                    return staleImageTask();
                const selected = artistFor(meta, settings);
                const artist = meta.artist !== undefined ? meta.artist : selected
                    ? { positivePrompt: selected.positive, negativePrompt: selected.negative }
                    : globalArtist(settings);
                const result = { ok: true, version: 1, configToken: lease.token,
                    model,
                    artist: artist === null ? null : structuredClone(artist),
                    isCurrent: () => taskRuntime.isCurrent(lease.token) === true };
                lease.bind(result);
                return result;
            } finally { lease.release(); }
        }
        return { ok: false, reason: 'image-edit-unsupported' };
    }

    // request：{ sourceDataUrl, maskDataUrl, prompt, negative, width, height }；不记录原图与请求体。
    async function edit(request = {}, bridgeOverride) {
        const capability = describeEdit(bridgeOverride, request);
        if (!capability.supported) return { ok: false, reason: capability.reason, error: capability.message };
        if (!request.sourceDataUrl || !request.maskDataUrl) return { ok: false, reason: 'invalid-edit-request', error: '缺少原图或修复区域' };
        const caption = request.caption || {
            v4_prompt: { caption: { base_caption: request.prompt || '', char_captions: [] } },
            v4_negative_prompt: { caption: { base_caption: request.negative || '', char_captions: [] } },
        };
        const prepared = prepareCharacterCaption({ ...request, caption });
        if (!prepared.ok) return prepared;
        const final = prepared.captionMode === 'final';
        const settings = normalizeAutoIllustrationSettings(readBridge(bridgeOverride, request).autoIllustration).nai;
        if (Object.hasOwn(request, 'model')) settings.model = request.model;
        try {
            const result = await sendNai('edit', final ? { ...request, caption: prepared.caption, captionMode: 'final' } : request, settings, request);
            if (result?.ok && final && !result.sentPrompt)
                return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '定稿重绘缺少实际发送快照' };
            return result && result.ok && result.dataUrl
                ? { ok: true, dataUrl: result.dataUrl,
                    ...(isImageSeed(result.seed) && { seed: result.seed }),
                    ...(final && { caption: prepared.caption, captionMode: 'final', sentPrompt: result.sentPrompt }),
                    ...(prepared.promptRecipe && { promptRecipe: prepared.promptRecipe, dnaSnapshot: prepared.dnaSnapshot }),
                    ...(prepared.outfitSnapshot && { outfitSnapshot: prepared.outfitSnapshot }) }
                : { ok: false, reason: result?.reason || 'edit-failed',
                    ...(result?.stopGeneration && { stopGeneration: true }),
                ...(result?.failure && { failure: result.failure }), error: result?.error || '局部重绘失败' };
        } catch (error) {
            return { ok: false, reason: 'edit-failed', error: `局部重绘失败：${(error && error.message) || error}` };
        }
    }

    function probeDbgen() {
        const api = findDbgenApi(globalObject);
        return api
            ? { ok: true, message: `已检测到${DBGEN_LABEL}。提示词和 NAI Key 由插件管理；画师串可在 IGS 选择，留空使用插件默认画师。` }
            : { ok: false, message: `未检测到${DBGEN_LABEL}，请确认已安装并启用。` };
    }

    const withRecoveryReport = meta => inheritImageTaskLease(meta, { ...meta,
        onRecovery(event) {
            meta.onRecovery?.(event);
            report?.(event.phase === 'waiting-condition' ? 'error' : 'info', event.message || (event.phase === 'slow'
                ? '写词仍在处理同一次请求，继续接收原回复'
                : event.phase === 'waiting-condition' ? '写词尚未完成，原任务已保留；相同错误输出不会持续循环请求'
                    : '正在按上一份输出的具体缺失字段修正，继续原写词任务'));
        } });
    const guardedWritePrompt = (meta = {}) => {
        // provided 必须先于复制／租约捕获筛选，不能读取禁止字段 getter。
        const context = imageWritingContext(meta);
        return context.ok ? guardDbgenTask(withRecoveryReport(context.value), writePrompt) : Promise.resolve(context);
    };
    const guardedWriteFloorPrompts = (meta = {}) => {
        const context = imageWritingContext(meta);
        return context.ok ? guardDbgenTask(withRecoveryReport(context.value), writeFloorPrompts) : Promise.resolve(context);
    };
    const guardedGenerateCaption = (meta = {}) => guardDbgenTask(meta, generateCaption);
    const guardedGenerate = (slot, settings, meta = {}) => {
        if (!taskRuntime || describe(undefined, meta).mode !== 'dbgen') return generate(slot, settings, meta);
        return guardDbgenTask(inheritImageTaskLease(meta, inheritImageTaskLease(slot, { ...slot, ...meta })),
            guarded => generate(slot, settings, guarded));
    };
    const guardedGenerateForReader = (request = {}, opts = {}) => guardDbgenTask(request,
        guarded => generateForReader(guarded, opts));
    const guardedEdit = (request = {}, bridge) => guardDbgenTask(request, guarded => edit(guarded, bridge));
    const guardedGetEditConfig = (meta = {}) => runImageTask(taskRuntime, meta, async (guarded, lease) => {
        if (describe(undefined, guarded).mode === 'nai') {
            const ready = await waitUntilReady(guarded);
            if (!ready?.ok) return ready;
        }
        const config = await getEditConfig(guarded);
        return !config.ok || !lease ? config : inheritImageTaskLease(config, { ...config,
            isCurrent: () => taskRuntime.isCurrent(lease.token) === true && config.isCurrent() === true });
    });
    return { describe, supportsCharacterTemplates, describeEdit, waitUntilReady, recoveryGlobal,
        runImageTask: (meta, execute) => runImageTask(taskRuntime, meta, execute),
        getEditConfig: guardedGetEditConfig, edit: guardedEdit,
        generate: guardedGenerate, generateForReader: guardedGenerateForReader, testForReader, probeDbgen,
        writePrompt: guardedWritePrompt, writeFloorPrompts: guardedWriteFloorPrompts,
        generateCaption: guardedGenerateCaption, waitSourceFloorPrompts,
        // 旧公开名称保持同一实现，兼容外部调用和历史注入后端。
        writeDbgenPrompt: guardedWritePrompt, writeDbgenFloorPrompts: guardedWriteFloorPrompts,
        generateDbgenCaption: guardedGenerateCaption };
}
