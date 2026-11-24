import { getSillyTavernContext } from './tavern-helper-adapter.js';
import { stripIllustrationMarkers } from '../scene/scene-directives.js';
import { countWorldInfoExclude, isWorldInfoExcluded, normalizeWorldInfoExclude } from './world-info-filter.js';

const NOTE_KEY = '2_floating_prompt';
const WORLDINFO_TIMEOUT_MS = 15000;
const activeScans = new WeakMap();
const includeNamesCache = new Map();
const failure = reason => ({ ok: false, reason, stopGeneration: true,
    error: '世界书参考读取失败，未发送写词请求；请检查酒馆世界书接口' });

function withWorldInfoTimeout(promise, ms = WORLDINFO_TIMEOUT_MS) {
    if (!(ms > 0)) return promise;
    let timer = null;
    return Promise.race([
        Promise.resolve(promise),
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error('WORLDINFO_TIMEOUT'), { reason: 'WORLDINFO_TIMEOUT' })), ms);
        }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
}

function detachEvent(source, name, handler) {
    const off = typeof source?.removeListener === 'function' ? source.removeListener : source?.off;
    try { if (typeof off === 'function') off.call(source, name, handler); } catch { /* 已解绑 */ }
}

function acquireScanGuard(ctx, rawExclude) {
    const key = ctx.extensionPrompts || ctx.getWorldInfoPrompt;
    let state = activeScans.get(key);
    if (!state) {
        const prompts = ctx.extensionPrompts;
        const existed = Boolean(prompts && Object.hasOwn(prompts, NOTE_KEY));
        state = {
            count: 0,
            prompts,
            existed,
            note: existed ? { ...prompts[NOTE_KEY] } : null,
            excludes: new Set(),
            source: null,
            eventName: '',
            handler: null,
        };
        activeScans.set(key, state);
    }
    state.count += 1;

    let excludeToken = null;
    const exclude = normalizeWorldInfoExclude(rawExclude);
    if (countWorldInfoExclude(exclude) > 0) {
        const source = ctx.eventSource;
        const eventName = ctx.eventTypes?.WORLDINFO_ENTRIES_LOADED;
        if (source && typeof source.on === 'function' && eventName) {
            excludeToken = exclude;
            state.excludes.add(excludeToken);
            if (!state.handler) {
                state.source = source;
                state.eventName = eventName;
                state.handler = (lore) => {
                    if (!lore || typeof lore !== 'object' || !state.excludes.size) return;
                    const active = [...state.excludes];
                    for (const bucket of ['globalLore', 'characterLore', 'chatLore', 'personaLore']) {
                        const list = lore[bucket];
                        if (!Array.isArray(list)) continue;
                        for (let i = list.length - 1; i >= 0; i -= 1) {
                            const world = list[i] && list[i].world;
                            const uid = list[i] && list[i].uid;
                            if (active.some(spec => isWorldInfoExcluded(spec, world, uid))) list.splice(i, 1);
                        }
                    }
                };
                source.on(eventName, state.handler);
            }
        }
    }

    let released = false;
    return () => {
        if (released) return;
        released = true;
        if (excludeToken) {
            state.excludes.delete(excludeToken);
            if (!state.excludes.size && state.handler) {
                detachEvent(state.source, state.eventName, state.handler);
                state.handler = null;
                state.source = null;
                state.eventName = '';
            }
        }
        state.count -= 1;
        if (state.count <= 0) {
            if (state.handler) {
                detachEvent(state.source, state.eventName, state.handler);
                state.handler = null;
            }
            // dryRun 仍会改写作者注释；所有并发扫描都结束后再恢复原值。
            if (state.prompts) {
                if (state.existed) state.prompts[NOTE_KEY] = state.note;
                else delete state.prompts[NOTE_KEY];
            }
            if (activeScans.get(key) === state) activeScans.delete(key);
        }
    };
}

// 只向宿主交付本次写词窗口；关键词、常量、概率及递归规则均由原生扫描器决定。
export function createImageWorldInfoSource(globalObject = globalThis, deps = {}) {
    return async function resolve(input = {}) {
        const ctx = getSillyTavernContext(globalObject);
        if (typeof ctx?.getWorldInfoPrompt !== 'function') return failure('WORLDINFO_UNAVAILABLE');
        const stale = () => input.signal?.aborted || (input.shouldStart && !input.shouldStart());
        if (stale()) return failure('request-stale');
        const includeNames = await readIncludeNames(globalObject, deps);
        if (stale()) return failure('request-stale');
        const scan = [input.numberedText || input.description, input.previousText]
            .filter(value => typeof value === 'string' && value.trim())
            .map(value => stripIllustrationMarkers(value))
            .map(value => includeNames ? `${ctx.name2 || ''}: ${value}` : value);
        const release = acquireScanGuard(ctx, typeof deps.readExclude === 'function' ? deps.readExclude() : null);
        try {
            const timeoutMs = Number.isFinite(Number(deps.timeoutMs)) ? Number(deps.timeoutMs) : WORLDINFO_TIMEOUT_MS;
            const result = await withWorldInfoTimeout(ctx.getWorldInfoPrompt(scan, scanBudget(ctx), true, scanFields(ctx)), timeoutMs);
            if (stale()) return failure('request-stale');
            if (!result || typeof result.worldInfoString !== 'string') return failure('WORLDINFO_INVALID');
            return { ok: true, text: referenceText(result) };
        } catch (error) {
            return failure(error?.reason === 'WORLDINFO_TIMEOUT' ? 'WORLDINFO_TIMEOUT' : 'WORLDINFO_RESOLVE_FAILED');
        } finally {
            release();
        }
    };
}


async function readIncludeNames(root, deps) {
    if (typeof deps.readIncludeNames === 'function') return deps.readIncludeNames();
    try {
        const host = root.top?.SillyTavern ? root.top : root;
        const base = host.document?.baseURI || host.location?.href;
        if (base) {
            const url = new URL('scripts/world-info.js', base).href;
            if (!includeNamesCache.has(url)) {
                includeNamesCache.set(url, import(url).then(
                    (module) => (typeof module.world_info_include_names === 'boolean' ? module.world_info_include_names : true),
                    () => true,
                ));
            }
            return await includeNamesCache.get(url);
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
