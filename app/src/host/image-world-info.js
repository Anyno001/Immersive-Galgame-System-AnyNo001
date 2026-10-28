import { getSillyTavernContext } from './tavern-helper-adapter.js';
import { stripIllustrationMarkers } from '../scene/scene-directives.js';
import { attachWorldInfoExclude } from './world-info-filter.js';

const NOTE_KEY = '2_floating_prompt';
const queues = new WeakMap();
const failure = reason => ({ ok: false, reason, stopGeneration: true,
    error: '世界书参考读取失败，未发送写词请求；请检查酒馆世界书接口' });

// 只向宿主交付本次写词窗口；关键词、常量、概率及递归规则均由原生扫描器决定。
export function createImageWorldInfoSource(globalObject = globalThis, deps = {}) {
    return async function resolve(input = {}) {
        const ctx = getSillyTavernContext(globalObject);
        if (typeof ctx?.getWorldInfoPrompt !== 'function') return failure('WORLDINFO_UNAVAILABLE');
        const key = ctx.extensionPrompts || ctx.getWorldInfoPrompt;
        const previous = queues.get(key) || Promise.resolve();
        const job = previous.catch(() => {}).then(async () => {
            const stale = () => input.signal?.aborted || (input.shouldStart && !input.shouldStart());
            if (stale()) return failure('request-stale');
            const includeNames = await readIncludeNames(globalObject, deps);
            if (stale()) return failure('request-stale');
            const scan = [input.numberedText || input.description, input.previousText]
                .filter(value => typeof value === 'string' && value.trim())
                .map(value => stripIllustrationMarkers(value))
                .map(value => includeNames ? `${ctx.name2 || ''}: ${value}` : value);
            const prompts = ctx.extensionPrompts;
            const existed = prompts && Object.hasOwn(prompts, NOTE_KEY);
            const note = existed ? { ...prompts[NOTE_KEY] } : null;
            const detach = attachWorldInfoExclude(ctx, typeof deps.readExclude === 'function' ? deps.readExclude() : null);
            try {
                const result = await ctx.getWorldInfoPrompt(scan, scanBudget(ctx), true, scanFields(ctx));
                if (stale()) return failure('request-stale');
                if (!result || typeof result.worldInfoString !== 'string') return failure('WORLDINFO_INVALID');
                return { ok: true, text: referenceText(result) };
            } catch {
                return failure('WORLDINFO_RESOLVE_FAILED');
            } finally {
                detach();
                // dryRun 仍会改写作者注释；本适配器的扫描串行，结束后恢复原值。
                if (prompts) {
                    if (existed) prompts[NOTE_KEY] = note;
                    else delete prompts[NOTE_KEY];
                }
            }
        }).catch(() => failure('WORLDINFO_RESOLVE_FAILED'));
        queues.set(key, job);
        try { return await job; }
        finally { if (queues.get(key) === job) queues.delete(key); }
    };
}


async function readIncludeNames(root, deps) {
    if (typeof deps.readIncludeNames === 'function') return deps.readIncludeNames();
    try {
        const host = root.top?.SillyTavern ? root.top : root;
        const base = host.document?.baseURI || host.location?.href;
        if (base) {
            const url = new URL('scripts/world-info.js', base).href;
            const module = await import(url);
            if (typeof module.world_info_include_names === 'boolean') return module.world_info_include_names;
        }
    } catch { /* 老宿主未导出设置时沿用酒馆默认值。 */ }
    return true;
}

function scanBudget(ctx) {
    if (ctx.mainApi === 'openai') {
        const max = Number(ctx.chatCompletionSettings?.openai_max_context);
        const reply = Number(ctx.chatCompletionSettings?.openai_max_tokens);
        if (Number.isFinite(max) && max > 0)
            return Math.max(0, max - (Number.isFinite(reply) && reply > 0 ? reply : 0));
    }
    const max = Number(ctx.maxContext);
    return Number.isFinite(max) && max > 0 ? max : 0;
}

function scanFields(ctx) {
    const fields = typeof ctx.getCharacterCardFields === 'function' ? ctx.getCharacterCardFields() : {};
    return { personaDescription: fields?.persona || '', characterDescription: fields?.description || '',
        characterPersonality: fields?.personality || '', characterDepthPrompt: fields?.charDepthPrompt || '',
        scenario: fields?.scenario || '', creatorNotes: fields?.creatorNotes || '', trigger: 'normal' };
}

// 世界书深度、示例、作者注释及 outlet 条目也属于参考，不沿用主聊天的注入位置。
function referenceText(result) {
    const list = value => Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const parts = [result.worldInfoString,
        ...list(result.worldInfoExamples).map(entry => typeof entry === 'string' ? entry : entry?.content),
        ...list(result.worldInfoDepth).flatMap(entry => list(entry?.entries)),
        ...list(result.anBefore), ...list(result.anAfter),
        ...Object.values(result.outletEntries || {}).flatMap(list)];
    return parts.filter(value => typeof value === 'string' && value.trim()).join('\n');
}
