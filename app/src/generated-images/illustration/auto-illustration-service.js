import { recoverOperation, recoveryCancelled } from '../../storage/automatic-recovery.js';
import { requireMediaCache } from '../../media/media-cache-owner.js';
import { imageBackendMethod } from '../backend-methods.js';

import { floorHasEventCg } from '../../scene/event-cg.js';
import { numberParagraphs, formatNumberedParagraphs, insertMarkers, insertMarkersAtAnchors, findAnchorInsertIndex, appendedTail, reattachTail, transplantMarkers } from './marker-placer.js';
import { normalizeImageMarkerLayout } from '../../scene/image-marker-layout.js';
import { MIN_AUTO_IMAGE_BODY_CHARS, floorBodyLength } from './floor-body-length.js';
import { buildPlannerUserPrompt, formatTodayOutfitBlock, CG_TEMPLATE_PLANNER_SYSTEM, PLANNER_SYSTEM_PROMPT, PLANNER_SOFT_SYSTEM_PROMPT, cgWritingRequirements } from './planner-prompt.js';
import { summarizeFloorOutfits } from './floor-outfit-reference.js';

import { writeTemplateCaptionsWithLlm } from './caption-writer.js';
import { requestWithSoftRetry, DEFAULT_ASSET_TEMPLATES } from './prompt-kit.js';
import { parseIllustrationPlan } from './planner-parser.js';
import { normalizeAutoIllustrationSettings } from './auto-illustration-settings.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { resolveCharacterKey, stripIllustrationMarker, stripIllustrationMarkers } from '../../scene/scene-directives.js';
import { buildCharacterDnaPromptParts, isCharacterDnaEmpty, mergePromptTags, resolveCharacterDna } from '../../scene/character-dna.js';
import { CG_PIXEL_CAP, clampToPixelCap, fitCgSize, parseCgSize } from './cg-pixel-cap.js';
import { withCreatureCast } from './creature-cg.js';
import { cgCharacterState, bindCgCaption, cgPromptTask, preflightCgCaption, cgPaintRequests, cgFinalRequest, completedCgOutfitAnchor } from './cg-character-bindings.js';
import { cgGenerationSeed } from '../../scene/generation-seeds.js';
import { isImageSeed, resolveImageSeed } from '../image-seed.js';
import { createCgConsistencyService } from './cg-consistency-service.js';
import { promptProvenance, storedPromptFromResult } from '../generation-prompt.js';
import { outfitAdoptionEvidence } from '../../scene/outfit-identity.js';
import { buildCharacterContext } from '../../scene/character-identity.js';
import { BUILTIN_NUDE_OUTFIT, isBuiltinNudeOutfit, resolveWardrobePrompt } from '../../scene/character-outfits.js';
import { outfitSpriteSlots } from '../../scene/character-appearance.js';
import { usesCharacterTemplates } from './character-prompt-task.js';
import { inheritImageTaskLease, imageTaskState, bindImageTaskTarget } from '../image-task-runtime.js';

const MARKER_RE = /(?:\[igs-img:\s*(\d+)\s*\]|<IMG>\s*(\d+)\s*<\/IMG>)/gi;
const hasSlotImage = record => typeof record?.dataUrl === 'string' && Boolean(record.dataUrl.trim()) && !/^data:[^,]*,\s*$/.test(record.dataUrl);

export const ILLUSTRATION_UPDATED_EVENT = 'igs:illustration-updated';
export const ILLUSTRATION_PROGRESS_EVENT = 'igs:illustration-progress';

// 手机内嵌栏宽。框高是我们按尺寸钉出来的，不能拿高来判断横竖。
export const EMBEDDED_PHONE_MAX_WIDTH = 640;

// 全屏按窗口实际宽高比出图，两边都是 64 的倍数。没有量到窗口时沿用背景尺寸，但仍不得超过像素上限。
export function cgSizeForAspect(backgroundSize, viewport) {
    const base = parseCgSize(backgroundSize) || { width: 1216, height: 832 };
    const fallback = clampToPixelCap(`${base.width}x${base.height}`);
    const viewW = Number(viewport && viewport.width) || 0;
    const viewH = Number(viewport && viewport.height) || 0;
    if (!(viewW > 0) || !(viewH > 0)) return fallback;
    const budget = base.width * base.height;
    const cap = Math.min(CG_PIXEL_CAP, budget >= CG_PIXEL_CAP * 0.9 ? CG_PIXEL_CAP : budget);
    const fitted = fitCgSize(viewW / viewH, cap);
    return fitted ? `${fitted.width}x${fitted.height}` : fallback;
}

// 电脑、网页用背景尺寸。手机模式和内嵌竖屏把宽高对调。
// 全屏改按窗口实际比例出图，铺满时不再裁出屏幕。
// 内嵌：正文栏或窗口不超过 640 像素，或触屏且窗口竖着拿，钉竖屏尺寸。
// 不论哪种模式，发出去的总像素都不能超过上限。
export function cgSizeForMode(backgroundSize, mode, viewport) {
    const landscape = squareAsLandscape(String(backgroundSize || '').trim() || '1216x832');
    if (mode === 'fullscreen') return cgSizeForAspect(landscape, viewport);
    const usePortrait = mode === 'mobile' || (mode === 'embedded' && isPhoneEmbedded(viewport));
    if (!usePortrait) return clampToPixelCap(landscape);
    const match = landscape.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    // 背景尺寸本身填成竖的就直接用，不能再对调回横屏。
    if (!match || Number(match[1]) <= Number(match[2])) return clampToPixelCap(landscape);
    return clampToPixelCap(`${match[2]}x${match[1]}`);
}

// 背景尺寸填成方的，横竖交给画面决定：按 1216:832 的横图比例在同样像素内重排，手机再对调成竖图。
function squareAsLandscape(sizeText) {
    const parsed = parseCgSize(sizeText);
    if (!parsed || parsed.width !== parsed.height) return sizeText;
    const fitted = fitCgSize(1216 / 832, Math.min(CG_PIXEL_CAP, parsed.width * parsed.height));
    return fitted ? `${fitted.width}x${fitted.height}` : sizeText;
}

// 手机缩放、平板、折叠屏的正文栏可能量出超过 640。触屏且窗口竖着拿时同样钉竖屏。
export function isPortraitTouchWindow(win) {
    if (!win || !(win.innerWidth > 0) || !(win.innerHeight > win.innerWidth)) return false;
    try { return typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches; } catch (error) { return false; }
}

function isPhoneEmbedded(viewport) {
    if (viewport && viewport.portrait === true) return true;
    const width = Number(viewport && viewport.width) || 0;
    return width > 0 && width <= EMBEDDED_PHONE_MAX_WIDTH;
}

// 立绘的存档提示词只留角色那一段：分角色写的取角色提示，没有分角色就取整段正向词。
export function spritePromptTags(prompt) {
    if (!prompt || typeof prompt !== 'object') return '';
    const chars = prompt.caption?.v4_prompt?.caption?.char_captions;
    const own = Array.isArray(chars) ? chars.map(c => String(c?.char_caption || '').trim()).filter(Boolean).join(', ') : '';
    return own || String(prompt.positive || '').trim();
}

// 写提示词时告诉模型这张图的宽高。尺寸只在出图时传，写词的模型看不到。
export function cgFramePrompt(sizeText) {
    const match = String(sizeText || '').trim().match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    if (!match) return '';
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!(width > 0) || !(height > 0)) return '';
    if (width === height) return `画面是正方形，宽${width}，高${height}。构图按这个比例写。`;
    if (width > height) return `画面是横的，宽${width}，高${height}。构图按横屏写，不要写成竖屏。`;
    return `画面是竖的，宽${width}，高${height}。构图按竖屏写，不要写成横屏。`;
}

function windowViewport(globalObject, portrait) {
    const visual = globalObject && globalObject.visualViewport;
    return {
        width: Number(visual && visual.width) || Number(globalObject && globalObject.innerWidth) || 0,
        height: Number(visual && visual.height) || Number(globalObject && globalObject.innerHeight) || 0,
        ...(portrait && { portrait }),
    };
}

// 内嵌画面在页面上，浏览器窗口可以更高。出图量的是画面，不是窗口。
// 全屏盖住的是整个窗口，页面上若还有内嵌框，不能拿那个框的宽高来定全屏图。
export function readCgViewport(globalObject, mode) {
    const portrait = isPortraitTouchWindow(globalObject);
    if (mode === 'fullscreen') return windowViewport(globalObject, portrait);
    const doc = globalObject && globalObject.document;
    const host = doc && typeof doc.querySelector === 'function' ? doc.querySelector('.igs-embedded-host') : null;
    const rect = host && typeof host.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : null;
    const hostWidth = rect ? Number(rect.width) : 0;
    const hostHeight = rect ? Number(rect.height) : 0;
    if (hostWidth > 0 && hostHeight > 0) return { width: hostWidth, height: hostHeight, ...(portrait && { portrait }) };
    return windowViewport(globalObject, portrait);
}

// 只有这些状态算「本楼已处理完」；failed / stale / 中途刷新残留的 planning 在下次渲染时重试，
// 否则改好 Key 或地址之后，之前失败过的楼层永远不会再发请求。
const SETTLED_STATUSES = new Set(['done']);

function toReadableText(raw) {
    return numberParagraphs(raw).paragraphs.map((p) => p.text).join('\n');
}

// 按既有别名归约取主名 DNA；没有 DNA 映射时返回 null，调用方保持旧行为。
function createDnaResolver(sceneAssets) {
    const dnaMap = sceneAssets && sceneAssets.characterDna;
    if (!dnaMap || typeof dnaMap !== 'object' || Array.isArray(dnaMap)) return null;
    const canonical = (name) => resolveCharacterKey(sceneAssets.characters || {}, sceneAssets.characterAliases || {}, name) || '';
    const resolve = (name) => {
        const hit = resolveCharacterDna(dnaMap, name, canonical);
        return hit && !isCharacterDnaEmpty(hit.dna) ? hit : null;
    };
    return { canonical, resolve };
}

export function summarizeCharacterDna(characters, sceneAssets) {
    const resolver = createDnaResolver(sceneAssets);
    if (!resolver) return [];
    const seen = new Set();
    const out = [];
    for (const name of Array.isArray(characters) ? characters : []) {
        const hit = resolver.resolve(name);
        if (!hit || seen.has(hit.name)) continue;
        seen.add(hit.name);
        out.push({ name: hit.name, identity: hit.dna.identity, defaultAppearance: hit.dna.defaultAppearance });
    }
    return out;
}

// CG 顺序：triggerWords → identity → 规划得到的当前外观/动作。
// defaultAppearance 和今天的穿着都只交给写词那一步作参考，不在这里追加，避免正文已经换了衣服还被钉死。
// 具名 char 直接绑定；旧格式无名 char 只在「本张单人且上下文只有一个角色」时绑定，否则不注入并给出 warning。
// identityOnly：柏宝绘 / 智绘姬回退时只拼身份，DNA 负面词交给插件自己的角色库与负面预设，不再并进 uc。
export function bindCharacterDnaToSlots(slots, sceneAssets, contextCharacters = [], { identityOnly = false } = {}) {
    const resolver = createDnaResolver(sceneAssets);
    const warnings = [];
    if (!resolver || !Array.isArray(slots)) return { slots, warnings };
    const contextNames = new Set((Array.isArray(contextCharacters) ? contextCharacters : [])
        .map((name) => resolver.canonical(name) || String(name || '').trim())
        .filter(Boolean));
    const onlyContextName = contextNames.size === 1 ? Array.from(contextNames)[0] : '';
    const next = slots.map((slot) => {
        const chars = Array.isArray(slot.chars) ? slot.chars : [];
        let ambiguous = false;
        const bound = chars.map((char) => {
            const named = char.name && char.name !== '未知' ? char.name : '';
            let hit = null;
            if (named) hit = resolver.resolve(named);
            else if (chars.length === 1 && onlyContextName) hit = resolver.resolve(onlyContextName);
            else ambiguous = true;
            if (!hit) return char;
            const parts = buildCharacterDnaPromptParts(hit.dna);
            return {
                ...char,
                tags: parts.positive ? mergePromptTags(parts.positive, char.tags) : char.tags,
                uc: parts.negative && !identityOnly ? mergePromptTags(parts.negative, char.uc) : char.uc,
            };
        });
        if (ambiguous) warnings.push(`第 ${slot.slot || '?'} 张插图有角色未写名字且无法唯一确定，未注入角色 DNA`);
        return { ...slot, chars: bound };
    });
    return { slots: next, warnings };
}


export function createAutoIllustrationService(deps) {
    const { messageHost, llm, nai, store: rawStore, getSettings, events } = deps;
    // 已生成像素先留在当前步骤，存储恢复只续写同一条记录。
    const store = new Proxy(rawStore, { get(target, key) {
        const value = target[key];
        if (typeof value !== 'function') return value;
        if (!['putFloor', 'putSlot', 'deleteSlot', 'getFloor', 'getSlots', 'getSlotRecord', 'hydrateSlot'].includes(key))
            return value.bind(target);
        return (...args) => recoverOperation(() => value.apply(target, args), {
            repeatable: /^(?:get|hydrate)/.test(key) ? 'read' : 'save',
            signal: recoveryController.signal, isActive: () => !stopped,
            global: deps.global || llm?.recoveryGlobal || nai?.recoveryGlobal || globalThis,
        });
    } });
    const writeFloorPrompts = imageBackendMethod(nai, 'writeFloorPrompts');
    const generateCaption = imageBackendMethod(nai, 'generateCaption');

    const random = deps.random || Math.random;
    const now = deps.now || (() => new Date().toISOString());
    const report = deps.report || (() => {});
    const minBodyChars = Number.isFinite(Number(deps.minBodyChars)) ? Number(deps.minBodyChars) : MIN_AUTO_IMAGE_BODY_CHARS;
    const sourceFilter = typeof deps.getSourceFilter === 'function' ? deps.getSourceFilter : () => undefined;
    const locks = new Map();
    const runningFloors = new Map(), pendingFloors = new Map();
    const cache = requireMediaCache(deps.mediaCache, 'auto-illustrations');
    const states = cache.auxiliary.createMap('cg-states');
    const resourceKey = key => `cg:${key}`;
    let offRendered = null;
    let stopped = false;
    let recoveryController = new AbortController();
    const recover = (floor, execute, input, options = {}) => recoverOperation(execute, {
        retryUnchanged: false,
        signal: recoveryController.signal, global: deps.global || llm?.recoveryGlobal || nai?.recoveryGlobal || globalThis,
        isActive: () => targetStillLive(floor),
        onRecover: ({ attempt }) => { if (attempt === 1) report('info', '正在自动续接本楼 CG 任务'); },
        ...options,
    });
    let regexesEnsured = false;
    const settings = signal => ({ ...normalizeAutoIllustrationSettings(
        imageTaskState({ signal })?.config?.autoIllustration || (getSettings ? getSettings() : null)),
        ...(signal && { taskSignal: signal }) });
    function withGenerationTask(floor, execute, requireReady = false) {
        const target = bindImageTaskTarget({ signal: recoveryController.signal,
            subscribe: messageHost.on?.bind(messageHost), isCurrent: () => targetStillLive(floor) });
        const input = { signal: target.signal, shouldStart: target.shouldStart };
        const run = async guarded => {
            if (requireReady && typeof nai?.waitUntilReady === 'function') {
                const ready = await nai.waitUntilReady(guarded);
                if (!ready?.ok) return ready;
            }
            return execute(settings(guarded.signal));
        };
        return Promise.resolve(typeof llm?.runImageTask === 'function' ? llm.runImageTask(input, run) : run(input))
            .finally(() => target.release());
    }
    const cgSize = (s) => cgSizeForMode(
        s.assets && s.assets.backgroundSize,
        typeof deps.getReaderMode === 'function' ? deps.getReaderMode() : 'pc',
        typeof deps.getViewport === 'function' ? deps.getViewport() : null,
    );
    const readSceneAssets = () => {
        const value = typeof deps.getSceneAssets === 'function' ? deps.getSceneAssets() : null;
        return value && typeof value === 'object' ? value : {};
    };

    function remember(key, value, { metadataOnly = false } = {}) {
        if (stopped) return;
        states.set(key, { status: value.status, hasImage: hasSlotImage(value) });
        if (metadataOnly || !hasSlotImage(value)) return;
        if (value.dataUrl) cache.forget(resourceKey(key));
        if (/^(data:image\/|blob:|https?:)/i.test(String(value.dataUrl || ''))) cache.remember(resourceKey(key), value.dataUrl);
        else if (value.dataUrl && cache.peek(value.dataUrl)) cache.remember(resourceKey(key), cache.peek(value.dataUrl));
    }

    async function prepareSlots(key, requests) {
        const previous = new Map((await store.getSlots(key, { deferImages: true })).map(record => [Number(record.slot), record]));
        for (const request of requests) {
            const old = previous.get(Number(request.slot));
            await store.putSlot(key, { ...old, ...request, status: hasSlotImage(old) ? 'done' : 'pending', generationStatus: 'pending', updatedAt: hasSlotImage(old) ? old.updatedAt : now() });
        }
        return previous;
    }

    function paintedRecord(request, result, previous, fallback) {
        if (result?.ok && hasSlotImage(result)) return { ...request, status: 'done', generationStatus: 'done', dataUrl: result.dataUrl, updatedAt: now() };
        const old = previous.get(Number(request.slot));
        return { ...old, ...request, status: hasSlotImage(old) ? 'done' : 'failed', generationStatus: 'failed', error: result?.error || fallback, updatedAt: hasSlotImage(old) ? old.updatedAt : now() };
    }

    function emit(floor, slot) {
        if (stopped) return;
        if (events && typeof events.emit === 'function') {
            events.emit(ILLUSTRATION_UPDATED_EVENT, { chatId: floor.chatId, messageId: floor.messageId, swipeId: floor.swipeId, slot });
        }
    }

    function progress(floor, detail) {
        if (!floor || !events || typeof events.emit !== 'function') return;
        events.emit(ILLUSTRATION_PROGRESS_EVENT, {
            chatId: floor.chatId,
            messageId: floor.messageId,
            swipeId: floor.swipeId,
            ...detail,
        });
    }

    // 手动触发跳过过场概率，但仍尊重 NSFW / 过场开关。
    function backendReady(s) {
        return nai && typeof nai.describe === 'function' ? nai.describe(undefined, { signal: s?.taskSignal }) : { ready: { ok: true } };
    }
    async function readyBackend(floor, s) {
        let backend = backendReady(s);
        if (!backend.ready.ok && typeof nai?.waitUntilReady === 'function') {
            const ready = await nai.waitUntilReady({ signal: s.taskSignal || recoveryController.signal,
                shouldStart: () => targetStillLive(floor) });
            if (!ready?.ok) return { ...backend, ready };
            backend = backendReady(s);
        }
        return backend;
    }

    function decide(s, isNsfw, manual = false) {
        if (isNsfw) return s.nsfwEnabled ? { kind: 'nsfw', want: s.nsfwCount, exact: true } : null;
        if (s.interludeEnabled && (manual || random() * 100 < s.interludeProbability)) {
            return { kind: 'interlude', want: s.interludeMaxCount, exact: false };
        }
        return null;
    }

    // 灵动 CG 写词的附加信息：User 名（User立绘优先，其次酒馆用户名）与本图是否按 NSFW 出图（需已开 NSFW）。
    const cgHintsFor = (s, nsfw) => ({ nsfw: nsfw === true && s.nsfwEnabled === true,
        userName: String(readSceneAssets().userCharacter || messageHost.getUserName?.() || '').trim() });
    // 本楼是否 NSFW 场景；没写场景标签时继承最近一个带标签的楼，与规划同一判定。
    const floorNsfw = (text, messageId) => {
        const numbered = numberParagraphs(text);
        return numbered.scenes.length ? numbered.isNsfw : inheritedNsfw(messageId);
    };
    function inheritedNsfw(messageId) {
        const texts = typeof messageHost.readPreviousAiTexts === 'function' ? messageHost.readPreviousAiTexts(messageId, 5) : [];
        for (let i = texts.length - 1; i >= 0; i -= 1) {
            const { scenes } = numberParagraphs(texts[i]);
            if (scenes.length) return scenes[scenes.length - 1].nsfw;
        }
        return false;
    }

    async function ensureRegexesOnce() {
        if (regexesEnsured) return;
        try { regexesEnsured = (await messageHost.ensureMarkerRegexes()).ok === true; } catch (error) { regexesEnsured = false; }
    }

    function todayOutfits(messageId, floorText, characters) {
        const previousTexts = typeof messageHost.readPreviousAiTexts === 'function'
            ? messageHost.readPreviousAiTexts(messageId, 3) : [];
        return summarizeFloorOutfits(characters, readSceneAssets(), { floorText, previousTexts });
    }

    // 数据库生图：只调插件的写词接口和出图接口。生成点按本插件的插图标记写回正文。
    async function planDbgenCg(messageId, floor, key, s, expected, decision, base, outfits = []) {
        report('info', `第 ${messageId} 楼向数据库生图插件要 ${decision.want} 张 CG…`);
        progress(floor, { phase: 'write' });
        await store.putFloor(key, { ...base, status: 'planning', updatedAt: now() });
        if (!nai || typeof writeFloorPrompts !== 'function' || typeof generateCaption !== 'function') {
            const error = '数据库生图插件缺少楼内写词或出图接口';
            await store.putFloor(key, { ...base, status: 'failed', error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图未开始：${error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'backend-unavailable', error };
        }
        const sceneAssets = JSON.parse(JSON.stringify(readSceneAssets()));
        const characters = withCreatureCast(numberParagraphs(floor.text).characters, floor.text, sceneAssets);
        const outfitScope = deps.captureCgOutfitScope?.(characters);
        const characterState = cgCharacterState(floor.text, characters, sceneAssets,
            typeof messageHost.readPreviousAiTexts === 'function'
                ? messageHost.readPreviousAiTexts(messageId, 3) : [], deps.readOutfitClues);
        const template = nai.describe?.(undefined, { signal: s.taskSignal }).mode === 'nai' && nai.supportsCharacterTemplates?.() === true && (characterState.context.some(c => c.dna?.version === 2)
            || characterState.context.every(c => usesCharacterTemplates(nai, c.dna)));
        const task = template && characterState.context.length ? cgPromptTask(characterState.context) : null;
        let written;
        try {
            written = await writeFloorPrompts({
                messageId, signal: s.taskSignal || recoveryController.signal, shouldStart: () => targetStillLive(floor),
                ...(task || (characterState.context.length && { characterContext: characterState.context })),
                ...(template && { writingRequirements: cgWritingRequirements(s, cgSize(s), decision.kind) }),
                description: [
                    `为本楼生成${decision.want}张CG，CG点自行选择。slotid沿用本次召回分配的编号，不重新从1开始。挂载点只从剧情正文里逐字摘原句，提示词、出图指导、标签和正文以外的内容不要拿来当挂载点，也不要画进CG。`,
                    cgFramePrompt(cgSize(s)),
                    characterState.timeline.length && `衣装变化按正文生成点取值，不把楼末衣装套在前面的场景：${JSON.stringify(characterState.timeline)}`,
                    task ? '每图输出 dna_template，具名人物按允许 token 绑定，景别按实际画面选择，不为资料缺失改变镜头。每个 named 同次写 meta_identity 完整英文身份 TAG 和 meta_signature 标志特征 TAG，本次新写衣装也只用 TAG；无名临时人物的身份和衣装同样用 TAG。匹配保存景别优先；缺景别按已有身份与实际取景给当次身份标签，完全无 DNA 时依据角色库和正文给保守当次身份。不生成 DNA 候选、不写回永久身份，不删人、不改成路人。'
                        : characterState.context.length ? '场景描述人数、环境和共同互动；每个独立角色提示保留名字、固定外貌、标志细节、当前衣装及自身动作。默认立绘衣装不覆盖场景衣装。'
                        : template && '纯场景不需要 DNA 或身份任务；只写环境、光影与场景排除词，不输出人物身份占位或 DNA 候选。无独立主体时不写 Char 和 meta_ 旁路，也不要求 prompt_mode。',
                ].filter(Boolean).join('\n'),
            });
        } catch (error) {
            written = { ok: false, error: (error && error.message) || '写提示词失败' };
        }
        if (!written || !written.ok) {
            const error = (written && written.error) || '写提示词失败';
            await store.putFloor(key, { ...base, status: 'failed', error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图规划失败，未发送生图请求：${error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'plan-failed', error };
        }
        const allReturned = Array.isArray(written.captions) ? written.captions : [];
        const ids = allReturned.map((item) => Number(item?.slotId));
        if (ids.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
            const error = '数据库生图插件返回缺失、非法或重复的 CG 编号';
            await store.putFloor(key, { ...base, status: 'failed', error, updatedAt: now() });
            report('error', error);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'invalid-slot-id', error };
        }
        const returned = (Array.isArray(written.captions) ? written.captions : [])
            .filter((item) => item && item.caption)
            .sort((a, b) => Number(a.slotId) - Number(b.slotId))
            .slice(0, decision.want);
        if (returned.length !== decision.want) {
            report('warn', `第 ${messageId} 楼数据库生图插件返回了 ${Array.isArray(written.captions) ? written.captions.length : 0} 张，按 ${returned.length} 张生成`);
        }
        const slots = [];
        let unmatchedAnchors = 0, unsafeAnchors = 0;
        for (const item of returned) {
            const anchorSentence = String(item.anchorSentence || item.anchor || '').trim();
            const found = findAnchorInsertIndex(floor.text, anchorSentence);
            if (found.index < 0) {
                const matched = Number.isFinite(found.anchorIndex);
                if (matched) unsafeAnchors++; else unmatchedAnchors++;
                report('warn', `第 ${messageId} 楼第 ${item.slotId} 张${matched
                    ? '生成点已命中正文，但无法在完整结构之后安全插入'
                    : '没有能对上正文的生成点'}，跳过`);
                continue;
            }
            const slot = Number(item.slotId);
            const context = characterState.at(found.index);
            const bound = template ? preflightCgCaption(item, task?.promptTask, context) : nai.describe?.(undefined, { signal: s.taskSignal }).mode === 'dbgen' || item.characterMeta === undefined
                ? { ok: true, caption: item.caption, warnings: [] }
                : bindCgCaption(item.caption, item.characterMeta, context, sceneAssets);
            if (!bound.ok && !template) {
                await store.putFloor(key, { ...base, status: 'failed', error: bound.error, updatedAt: now() });
                report('error', bound.error);
                progress(floor, { phase: 'done' });
                return bound;
            }
            for (const warning of bound.warnings || []) report('info', `第 ${messageId} 楼${warning}`);
            slots.push({ slot, caption: template ? item.caption : bound.caption, anchorSentence,
                ...(template && outfitScope && { outfitScope }),
                ...(template && {
                    ...(bound.promptRecipe !== undefined && { promptRecipe: bound.promptRecipe }),
                    ...(bound.promptTask !== undefined && { promptTask: bound.promptTask }),
                    ...(!bound.ok && {
                        ...(item.promptRecipe !== undefined && { promptRecipe: item.promptRecipe }),
                        ...(task?.promptTask !== undefined && { promptTask: task.promptTask }) }),
                    ...(item.characterMeta !== undefined && { characterContext: context, characterMeta: item.characterMeta }),
                    ...(!bound.ok && { preflightFailure: { reason: bound.reason, error: bound.error } }) }),
                ...(bound.characterMeta && { characterMeta: bound.characterMeta, characterContext: context }),
                originalSize: parseCgSize(cgSize(s)) });
        }
        if (!slots.length) {
            const error = unsafeAnchors
                ? unmatchedAnchors ? `生成点均不可用（正文未命中 ${unmatchedAnchors} 个，无法安全插入 ${unsafeAnchors} 个）`
                    : '生成点已命中正文，但没有安全的独占行插入位置'
                : '数据库生图插件没有返回能对上正文的生成点';
            await store.putFloor(key, { ...base, status: 'failed', error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图规划失败，未发送生图请求：${error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'plan-failed', error };
        }
        const markedText = insertMarkersAtAnchors(floor.text, slots);
        let merged = mergeIntoLatest(messageId, floor, expected, markedText);
        if (!merged) {
            await store.putFloor(key, { ...base, status: 'stale', updatedAt: now() });
            report('warn', `第 ${messageId} 楼在规划期间已经有了新回复，或正文被大幅改写、插图位置都找不到，本楼不出 CG；需要的话点「绘制 CG」重画`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'stale' };
        }
        await ensureRegexesOnce();
        let writtenText = await messageHost.writeFloor(messageId, merged.text, merged.latest, { requireLatest: !floor.anyFloor });
        // 读和写之间又被插件改了一次：按最新正文重搬，最多再试两次。
        for (let retry = 0; retry < 2 && writtenText && writtenText.reason === 'stale'; retry += 1) {
            merged = mergeIntoLatest(messageId, floor, expected, markedText);
            if (!merged) break;
            writtenText = await messageHost.writeFloor(messageId, merged.text, merged.latest, { requireLatest: !floor.anyFloor });
        }
        const keptSlots = merged && merged.slots ? slots.filter((item) => merged.slots.includes(item.slot)) : slots;
        if (!writtenText?.ok || !markersWritten(floor, keptSlots)) {
            const stale = writtenText?.reason === 'stale' || !targetStillLive(floor);
            await store.putFloor(key, { ...base, status: stale ? 'stale' : 'failed', ...(!stale && { error: '无法写回楼层' }), updatedAt: now() });
            report(stale ? 'warn' : 'error', `第 ${messageId} 楼${stale ? '写回时一直被其他插件改动' : '无法写回插图标记'}，本楼不出 CG；需要的话点「绘制 CG」重画`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: stale ? 'stale' : 'write-failed' };
        }
        report('info', `第 ${messageId} 楼已写入 ${keptSlots.length} 个生成点，正在出图…`);
        return paintDbgenCaptions(messageId, floor, key, s, base, keptSlots);
    }

    // 任务归属由聊天/楼层/回复分支决定；正文图片标记只负责显示位置。
    // 清除/重画的并发写入由 slot revision/token 在存储事务中裁决。
    const targetStillLive = floor => {
        const live = messageHost.readFloor(floor.messageId);
        return !stopped && live?.isAi && floorKeyOf(live) === floorKeyOf(floor)
            && messageHost.getChatId() === floor.chatId;
    };
    const consistency = createCgConsistencyService({
        store, nai, codec: deps.imageCodec, getSceneAssets: readSceneAssets,
        consistencyStrength: () => settings().consistencyStrength,
        consistencyModel: () => settings().consistencyModel,
        resolveReference: deps.resolveCgReference, targetStillLive, now, report,
        readReferenceImage: deps.readCgReferenceImage,
        ensureReferences: deps.ensureCgReferences,
        captureAppearanceScope: deps.captureCgOutfitScope,
        subscribeAppearance: deps.subscribeCgAppearance,
        writingRequirements: () => {
            const snapshot = settings();
            return cgWritingRequirements(snapshot, cgSize(snapshot), 'cg');
        },
        onAccepted(target, record) {
            const key = `${target.key}|${target.slot}`;
            remember(key, { status: record.status, dataUrl: record.dataUrl || '' });
            emit(target.floor, target.slot);
        },
    });

    async function consistencyOperation(operation, query = {}, options = {}) {
        const identity = identityOf(query, query.slot);
        if (!identity || identity.slot == null) return Promise.resolve({ ok: false, reason: 'invalid-identity' });
        const key = floorKeyOf(identity.floor);
        if (locks.has(key)) await locks.get(key);
        return consistency[operation]({ ...identity, key }, { ...options,
            onProgress(detail) {
                progress(identity.floor, { ...detail, slot: identity.slot });
                options.onProgress?.(detail);
            },
        });
    }

    const preflightConsistency = (query, options) => consistencyOperation('preflight', query, options);
    const redrawConsistency = (query, options) => consistencyOperation('run', query, options);
    const acceptConsistency = (candidateId) => consistency.accept(candidateId);
    const cancelConsistency = (candidateId) => consistency.cancel(candidateId);
    const describeConsistency = () => consistency.capability();

    async function beginSlotPaint(key, request, floor) {
        const old = await store.getSlotRecord(`${key}|${request.slot}`);
        // 有原图时保留与像素匹配的正文和来源，成功后才一起替换。
        const pending = old?.dataUrl
            ? { ...old, updatedAt: now() }
            : { ...request, status: 'pending', updatedAt: now() };
        return recover(floor, async () => {
            const latest = await store.getSlotRecord(`${key}|${request.slot}`);
            if (latest) {
                const result = await store.updateSlot(key, request.slot, latest.revision || 0, pending,
                    { expectedToken: latest.revisionToken, shouldCommit: () => targetStillLive(floor) });
                return result?.ok ? result.record : result || { ok: false };
            }
            return await store.putSlot(key, pending) || await store.getSlotRecord(`${key}|${request.slot}`);
        });
    }

    async function finishSlotPaint(key, request, attempt, result, floor) {
        const prompt = result?.ok ? storedPromptFromResult(result, request.caption) : null;
        const record = result?.ok
            ? { ...request, status: 'done', dataUrl: result.dataUrl, error: null, failureReason: null,
                caption: result.caption || request.caption,
                ...(isImageSeed(result.seed) && { seed: result.seed }),
                ...promptProvenance(result),
                ...outfitAdoptionEvidence(request, result),
                ...completedCgOutfitAnchor(request, result),
                ...(prompt && { prompt }),
                ...(result.characterMeta && { characterMeta: result.characterMeta }) }
            : { ...(attempt.dataUrl ? attempt : request), status: attempt.dataUrl ? 'done' : 'failed',
                ...(attempt.dataUrl && { dataUrl: attempt.dataUrl }), error: result?.error || '出图失败',
                ...(result?.reason && { failureReason: result.reason }) };
        const saved = await recover(floor, async () => {
            const latest = await store.getSlotRecord(`${key}|${request.slot}`);
            if (!latest) return { ok: false, reason: 'stale-target', stopGeneration: true };
            return store.updateSlot(key, request.slot, latest.revision || 0,
                { ...record, updatedAt: now() }, { expectedToken: latest.revisionToken,
                    shouldCommit: () => targetStillLive(floor) });
        }, undefined, {
            repeatable: 'save',
            shouldRecover: value => value?.reason !== 'not-found',
        });
        if (saved?.reason === 'not-found' || recoveryCancelled(saved)) {
            return { ...saved, ok: false, stopGeneration: true,
                ...(saved?.reason === 'not-found' && { reason: 'stale-target' }) };
        }
        if (!saved?.ok) return saved || { ok: false, reason: 'save-failed', error: '插图尚未保存' };
        if (result?.ok && record.promptRecipe?.outfitMode === 'template'
            && record.promptEdited !== true && record.edited !== true
            && record.outfitSnapshot?.characters.some(c => c.source === 'candidate')) {
            try {
                const raw = await store.getSlotRecord(`${key}|${request.slot}`);
                const authoritative = raw && (store.hydrateSlot ? await store.hydrateSlot(raw) : raw);
                if (!authoritative?.dataUrl || authoritative.revision !== saved.record.revision
                    || authoritative.revisionToken !== saved.record.revisionToken
                    || !targetStillLive(floor, request.slot)) throw new Error('OUTFIT_ADOPTION_CONFLICT');
                const adopted = typeof deps.stageCgOutfits === 'function'
                    ? await deps.stageCgOutfits(authoritative, floor)
                    : { ok: false, reason: 'OUTFIT_ADOPTION_UNAVAILABLE' };
                if (!adopted?.ok) throw new Error(adopted?.reason || 'OUTFIT_ADOPTION_CONFLICT');
            } catch {
                // 图片已提交，不因候选暂存失败重发收费请求；原快照保留。
                report('warn', 'CG 已保存，但衣装候选未暂存；原衣装资料保持不变');
            }
        }
        remember(`${key}|${request.slot}`, { status: saved.record.status, dataUrl: saved.record.dataUrl || '' });
        emit(floor, request.slot);
        return saved;
    }

    async function repairPaintRequest(request, floor, signal) {
        if (!request.preflightFailure && (request.caption || request.scene)) return request;
        return recover(floor, async () => {
            const text = messageHost.readFloor(floor.messageId)?.text || floor.text;
            const state = cgCharacterState(text, withCreatureCast(numberParagraphs(text).characters, text, readSceneAssets()), readSceneAssets(),
                messageHost.readPreviousAiTexts?.(floor.messageId, 3) || [], deps.readOutfitClues);
            const context = request.characterContext?.length ? request.characterContext : state.context;
            const template = nai.describe?.().mode === 'nai';
            const task = template && context.length ? cgPromptTask(context) : {};
            const writer = imageBackendMethod(nai, 'writePrompt');
            const written = await writer({ ...task, imagePromptTask: 'cg', messageId: floor.messageId,
                description: `完善本楼第 ${request.slot} 个 CG 生成点的完整画面提示词。保留该生成点的剧情、人物和衣装，按本次输出映射交付。\n${request.description || request.scene || text}`,
                outputs: { slotIds: [request.slot] },
                writingRequirements: cgWritingRequirements(settings(signal), cgSize(settings(signal)), 'cg'),
                cgHints: cgHintsFor(settings(signal), floorNsfw(text, floor.messageId)),
                signal: signal || recoveryController.signal, shouldStart: () => targetStillLive(floor) });
            if (!written?.ok) return written || { ok: false, reason: 'cg-write-pending' };
            const entries = written.captions || [written];
            const entry = entries.find(item => Number(item.slotId) === Number(request.slot))
                || (entries.length === 1 ? entries[0] : null);
            if (!entry?.caption) return { ok: false, reason: 'cg-write-pending' };
            const checked = template ? preflightCgCaption(entry, task.promptTask, context) : { ok: true };
            if (!checked.ok) return checked;
            return inheritImageTaskLease(entry, { ...request, ...entry, ...checked,
                slot: request.slot, preflightFailure: null, ...(task.promptTask && { promptTask: task.promptTask }),
                ...(context.length && { characterContext: context }) });
        }, request);
    }
    async function preparePaintAttempts(key, requests, floor, signal) {
        const attempts = new Map();
        for (const [index, source] of requests.entries()) {
            const request = await repairPaintRequest(source, floor, signal);
            if (request?.cancelled) return null;
            requests[index] = request;
            const attempt = await beginSlotPaint(key, request, floor);
            if (recoveryCancelled(attempt)) return null;
            attempts.set(request.slot, attempt);
            remember(`${key}|${request.slot}`, { status: attempt.status, dataUrl: attempt.dataUrl || '' });
        }
        return attempts;
    }

    async function paintDbgenCaptions(messageId, floor, key, s, base, slots, { refreshDna = false } = {}) {
        const assets = refreshDna ? structuredClone(readSceneAssets()) : null;
        const requests = cgPaintRequests(slots, assets);
        const attempts = await preparePaintAttempts(key, requests, floor, s.taskSignal);
        if (!attempts) return { ok: false, cancelled: true, reason: 'cancelled' };
        let succeeded = 0;
        let firstFailure = null;
        const errors = [];
        for (let index = 0; index < requests.length; index += 1) {
            const request = requests[index];
            progress(floor, { phase: 'paint', done: index + 1, total: requests.length });
            let result;
            const edited = request.promptEdited === true || request.edited === true;
            if (!edited && request.preflightFailure) {
                result = { ok: false, ...request.preflightFailure };
            } else if (!request.caption) {
                result = { ok: false, error: '没有可出图的提示词' };
            } else {
                try {
                    result = await recover(floor, () => generateCaption({ caption: request.caption, size: cgSize(s), messageId,
                        ...((!nai.describe || nai.describe(undefined, { signal: s.taskSignal }).mode === 'nai' || nai.describe(undefined, { signal: s.taskSignal }).via === 'nai') && {
                            seed: resolveImageSeed(cgGenerationSeed(request, readSceneAssets())) }),
                        imageKind: 'cg', signal: s.taskSignal || recoveryController.signal, shouldStart: () => targetStillLive(floor), promptKind: base.kind === 'nsfw' ? 'nsfwCg' : 'cg',
                        ...(edited || (!request.promptRecipe && request.captionMode === 'final')
                            ? { captionMode: 'final' } : request.promptRecipe || request.promptTask ? {
                            ...(request.promptRecipe !== undefined && { promptRecipe: request.promptRecipe }),
                            ...(request.promptTask !== undefined && { promptTask: request.promptTask }),
                            ...(request.outfitSnapshot !== undefined && { outfitSnapshot: request.outfitSnapshot }),
                        } : {}),
                        ...(request.characterMeta && { characterMeta: request.characterMeta,
                            characterContext: request.characterContext }) }), request);
                    if (edited && result?.ok) result = { ...result,
                        ...promptProvenance({ promptRecipe: request.promptRecipe, dnaSnapshot: request.dnaSnapshot }),
                        promptEdited: true, captionMode: 'final' };
                } catch (error) {
                    result = { ok: false, error: (error && error.message) || '出图失败' };
                }
            }
            if (recoveryCancelled(result)) return result;
            if (result && result.ok && hasSlotImage(result)) succeeded += 1;
            else {
                errors.push((result && result.error) || '图像来源未返回图片，提示词已保留，可点击重试');
                if (result && result.failure && !firstFailure) firstFailure = result.failure;
                report('error', `第 ${messageId} 楼第 ${request.slot} 张插图生成失败：${(result && result.error) || '出图失败'}`);
            }
            const saved = await finishSlotPaint(key, request, attempts.get(request.slot), result, floor);
            if (!saved?.ok || recoveryCancelled(saved)) return saved;
        }
        progress(floor, { phase: 'done' });
        const failedCount = requests.length - succeeded;
        await store.putFloor(key, { ...base, status: failedCount ? 'failed' : 'done', count: requests.length, updatedAt: now() });
        if (succeeded) report('success', `第 ${messageId} 楼已生成 ${succeeded} 张插图`);
        if (!failedCount) return { ok: true, reason: 'done', count: succeeded };
        return {
            ok: false, reason: 'generation-failed', count: succeeded, failedCount,
            error: `${failedCount} 张插图失败${succeeded ? `（成功 ${succeeded} 张）` : ''}：${Array.from(new Set(errors)).join('；')}`,
            ...(firstFailure && { failure: firstFailure }),
        };
    }

    // 规划期间正文被其他插件改了：只在末尾追加时原样接上；别处改过就把标记按前后文搬到新正文，对不上的那张丢掉。
    // 「最新楼」只看后面有没有用户发言，插件在后面另起的楼不影响写回。
    // 返回 { text, latest, slots }，slots 为 null 表示全部保留；一张都放不下返回 null。
    // anyFloor：允许画不是最新的楼（工具栏手动出图、翻旧楼补 CG），写回时也不要求还是最新楼。
    function withAnyFloor(floor, anyFloor) {
        return floor && anyFloor ? { ...floor, anyFloor: true } : floor;
    }

    function slotsInText(text, slots) {
        const present = new Set(Array.from(String(text || '').matchAll(MARKER_RE), m => Number(m[1] || m[2])));
        return slots.filter(item => present.has(Number(item.slot)));
    }

    function markersWritten(floor, slots) {
        const live = messageHost.readFloor(floor.messageId);
        return live?.isAi && floorKeyOf(live) === floorKeyOf(floor)
            && slots.length > 0 && slotsInText(live.text, slots).length === slots.length;
    }

    function mergeIntoLatest(messageId, floor, expected, markedText) {
        const latest = messageHost.readFloor(messageId);
        if (!latest || !latest.isAi || !(latest.isLatest || floor.anyFloor) || latest.chatId !== floor.chatId || latest.swipeId !== floor.swipeId) return null;
        const tail = appendedTail(expected.text, latest.text);
        if (tail != null) {
            if (tail) report('info', `第 ${messageId} 楼末尾被其他插件追加了内容，插图照常插在原文里`);
            return { text: reattachTail(markedText, tail), latest, slots: null };
        }
        const moved = transplantMarkers(markedText, stripIllustrationMarkers(latest.text));
        if (!moved.slots.length) return null;
        report('info', `第 ${messageId} 楼在规划期间被其他插件改过，插图按前后文对到新正文上（${moved.slots.length} 张）`);
        return { text: moved.text, latest, slots: moved.slots };
    }

    async function run(messageId, floor, key, s, manual) {
        const previous = await store.getFloor(key);
        const marked = await markedSlots(key, floor.text);
        if (marked.retry.length) {
            const base = { kind: (previous && previous.kind) || 'interlude', want: (previous && previous.want) || marked.all.length };
            report('info', `第 ${messageId} 楼重试 ${marked.retry.length} 张未成功的插图，复用已保存的提示词直接出图…`);
            if (backendReady(s).via === 'dbgen') return paintDbgenCaptions(messageId, floor, key, s, base, marked.retry);
            return generateSlots(messageId, floor, key, s, base, marked.retry);
        }
        if (marked.all.length) return { ok: true, reason: manual ? 'nothing-missing' : 'already-decided' };
        if (!manual && previous && SETTLED_STATUSES.has(previous.status)
            && previous.kind !== 'none') return { ok: true, reason: 'already-decided' };
        // 不记成已处理：用户点「继续」把这楼写长后，下次渲染照常规划。
        const bodyChars = floorBodyLength(floor.text, sourceFilter());
        if (!manual && bodyChars < minBodyChars) {
            report('info', `第 ${messageId} 楼跳过：正文只有 ${bodyChars} 字，少于 ${minBodyChars} 字不自动生图`);
            return { ok: true, reason: 'body-too-short' };
        }
        // 柏宝绘 / 智绘姬开着自动写词时先等它把词写回本楼再规划；两边同时写回，IGS 会因正文已改放弃本楼。
        if (typeof nai.waitSourceFloorPrompts === 'function' && ['baibai', 'chatu8'].includes(backendReady(s).via)) {
            progress(floor, { phase: 'write' });
            await nai.waitSourceFloorPrompts(messageId);
            floor = withAnyFloor(messageHost.readFloor(messageId), floor.anyFloor) || floor;
        }
        // 标记还在但记录丢了（换设备、清缓存）时先去掉旧标记再规划，避免重复插入；写回时仍按原文校验。
        const expected = floor;
        if (/(?:\[igs-img:\s*\d+\s*\]|<IMG>\s*\d+\s*<\/IMG>)/i.test(floor.text)) floor = { ...floor, text: stripIllustrationMarkers(normalizeImageMarkerLayout(floor.text)) };
        const numbered = numberParagraphs(floor.text);
        // 本楼没写场景标签 = 场景延续：继承最近一个带场景标签的楼的 NSFW，不让 NSFW 掉进过场概率。
        if (!numbered.scenes.length) numbered.isNsfw = inheritedNsfw(messageId);
        // 作者在 CG 库里预置了这一幕：用库里的图，不再生成过场图（NSFW 照常）。
        const presetCg = !numbered.isNsfw && typeof deps.getSceneAssets === 'function'
            && floorHasEventCg(floor.text, (deps.getSceneAssets() || {}).eventCgs);
        const decisionKey = JSON.stringify([stripIllustrationMarkers(floor.text), s.nsfwEnabled,
            s.interludeEnabled, s.interludeProbability, numbered.isNsfw, Boolean(presetCg), bodyChars]);
        if (!manual && previous?.kind === 'none' && SETTLED_STATUSES.has(previous.status)
            && previous.decisionKey === decisionKey) return { ok: true, reason: 'already-decided' };
        const decision = numbered.paragraphs.length && !presetCg ? decide(s, numbered.isNsfw, manual) : null;
        if (!decision) {
            await store.putFloor(key, { kind: 'none', status: 'done',
                decisionKey, updatedAt: now() });
            const why = !numbered.paragraphs.length ? '本楼没有可读正文' : presetCg ? '本楼命中 CG 库里的预置 CG'
                : (!numbered.isNsfw && !s.interludeEnabled ? '本楼未标记 NSFW 场景（需正文含 [igs-scene:场景|时间|天气|nsfw]），且未开启过场插图'
                    : '过场插图本次未触发（按触发概率随机）');
            report('info', `第 ${messageId} 楼跳过：${why}`);
            return { ok: true, reason: 'not-selected', why };
        }
        const base = { kind: decision.kind, want: decision.want };
        // 出图端没就绪（没填 Key、插件未安装）时不再白白请求副 LLM。
        const backend = await readyBackend(floor, s);
        if (!backend.ready.ok) {
            await store.putFloor(key, { ...base, status: 'failed', error: backend.ready.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图未开始：${backend.ready.error}`);
            return { ok: false, reason: 'backend-unavailable', error: backend.ready.error };
        }
        const outfits = todayOutfits(messageId, floor.text, numbered.characters);
        if (backend.via === 'dbgen') return planDbgenCg(messageId, floor, key, s, expected, decision, base, outfits);
        report('info', `第 ${messageId} 楼开始规划插图（${decision.kind === 'nsfw' ? 'NSFW' : '过场'}），正在请求副 LLM…`);
        progress(floor, { phase: 'write' });
        await store.putFloor(key, { ...base, status: 'planning', updatedAt: now() });
        let plan;
        const sceneAssets = structuredClone(readSceneAssets());
        // 已登记的非人角色（战斗对手等）即使没有说话标签也并入可出镜池；纯人类楼层原样不变。
        const cast = withCreatureCast(numbered.characters, floor.text, sceneAssets);
        const profiles = cast.map(name => resolveCharacterDna(sceneAssets.characterDna, name, key =>
            resolveCharacterKey(sceneAssets.characters || {}, sceneAssets.characterAliases || {}, key))?.dna);
        const template = backend.mode === 'nai' && (profiles.some(dna => dna?.version === 2)
            || profiles.every(dna => usesCharacterTemplates(nai, dna)));
        const outfitScope = deps.captureCgOutfitScope?.(cast);
        const characterState = template ? cgCharacterState(floor.text, cast, sceneAssets,
            messageHost.readPreviousAiTexts(messageId, 3), deps.readOutfitClues) : null;
        const task = template ? cgPromptTask(characterState.context, { outfitSelection: 'catalog' }) : null;
        try {
            const previousText = messageHost.readPreviousAiTexts(messageId, s.llm.contextFloors)
                .map(toReadableText).join('\n');
            const user = buildPlannerUserPrompt({
                numberedText: formatNumberedParagraphs(numbered.paragraphs),
                scenes: numbered.scenes, characters: cast,
                previousText, want: decision.want, exact: decision.exact, isNsfw: numbered.isNsfw,
                characterDna: template ? [] : summarizeCharacterDna(numbered.characters, sceneAssets),
                outfits,
                frame: cgFramePrompt(cgSize(s)),
            });
            if (template) {
                const offsetForEntry = entry => {
                    const paragraph = Number.isSafeInteger(entry.at) && numbered.paragraphs[entry.at - 1];
                    if (!paragraph) throw new Error('invalid-cg-paragraph');
                    return floor.text.split('\n').slice(0, paragraph.lineIndex + 1).join('\n').length;
                };
                const written = await writeTemplateCaptionsWithLlm(llm, s.llm, { ...task,
                    signal: s.taskSignal || recoveryController.signal, shouldStart: () => targetStillLive(floor),
                    imagePromptTask: 'cg',
                    characterContextForEntry: entry => characterState.at(offsetForEntry(entry)),
                    outputs: { selection: 'numbered-text', maxSlots: decision.want, exact: decision.exact,
                        paragraphCount: numbered.paragraphs.length },
                    description: `${user}\n本次允许 slotid 为 1 到 ${decision.want}；不得改用其他编号。`,
                    systemPrompt: CG_TEMPLATE_PLANNER_SYSTEM,
                    writingRequirements: cgWritingRequirements(s, cgSize(s), decision.kind),
                    cgHints: cgHintsFor(s, decision.kind === 'nsfw'),
                });
                plan = written;
                if (written.ok) {
                    const ats = new Set();
                    const slots = [];
                    for (const entry of written.captions) {
                        if (entry.slotId > decision.want || !Number.isSafeInteger(entry.at)
                            || entry.at < 1 || entry.at > numbered.paragraphs.length || ats.has(entry.at)) {
                            plan = { ok: false, error: 'CG 动态规划编号或挂载段落无效，未发送图片' };
                            break;
                        }
                        ats.add(entry.at);
                        const offset = offsetForEntry(entry);
                        const context = characterState.at(offset);
                        const checked = preflightCgCaption(entry, task.promptTask, context);
                        slots.push({ ...entry, slot: entry.slotId, promptTask: task.promptTask,
                            ...(outfitScope && { outfitScope }),
                            outfitAnchor: characterState.anchorAt(offset, (entry.characterMeta?.characters || [])
                                .filter(character => character.kind === 'named' || character.characterKey).map(character => character.characterKey)),
                            characterContext: context, originalSize: parseCgSize(cgSize(s)),
                            ...(!checked.ok && { preflightFailure: { reason: checked.reason, error: checked.error } }) });
                    }
                    if (plan.ok) plan = { ok: true, slots };
                }
            } else plan = await requestWithSoftRetry(llm, {
                signal: s.taskSignal || recoveryController.signal, shouldStart: () => targetStillLive(floor),
                system: PLANNER_SYSTEM_PROMPT,
                softSystem: numbered.isNsfw ? PLANNER_SOFT_SYSTEM_PROMPT : '',
                user,
                imagePrompt: { task: 'cg', input: { description: user,
                    outputs: { format: 'cg-plan', maxSlots: decision.want, exact: decision.exact,
                        paragraphCount: numbered.paragraphs.length } } },
                parse: (reply) => parseIllustrationPlan(reply, { maxSlots: decision.want, paragraphCount: numbered.paragraphs.length }),
            }, s.llm);
            // 温和模式下 LLM 只给了构图，露骨 tag 在本地补上，不经过 LLM。
            if (!template && plan.ok && plan.soft) {
                const extra = s.assets.templates.nsfwExtra || DEFAULT_ASSET_TEMPLATES.nsfwExtra;
                plan.slots = plan.slots.map((slot) => ({ ...slot, scene: [extra, slot.scene].filter(Boolean).join(', ') }));
            }
        } catch (error) {
            plan = { ok: false, error: `副 LLM 规划失败：${(error && error.message) || error}` };
        }
        // 张数不符时多则截断、少则照用，不再整层作废（NSFW 楼层副 LLM 常少给一张）。
        if (plan.ok && decision.exact && plan.slots.length !== decision.want) {
            report('warn', `第 ${messageId} 楼副 LLM 返回了 ${plan.slots.length} 张，与设定的 ${decision.want} 张不符，按 ${Math.min(plan.slots.length, decision.want)} 张生成`);
            plan.slots = plan.slots.slice(0, decision.want);
        }
        if (!plan.ok) {
            await store.putFloor(key, { ...base, status: 'failed', error: plan.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图规划失败，未发送生图请求：${plan.error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'plan-failed', error: plan.error,
                ...(plan.diagnostic && { diagnostic: plan.diagnostic }) };
        }
        if (!template) {
            const bound = bindCharacterDnaToSlots(plan.slots, readSceneAssets(), numbered.characters, { identityOnly: backend.via === 'baibai' || backend.via === 'chatu8' });
            plan.slots = bound.slots;
            for (const warning of bound.warnings) report('info', `第 ${messageId} 楼${warning}`);
        }

        const markedText = insertMarkers(floor.text, numbered.paragraphs, plan.slots);
        const placedSlots = slotsInText(markedText, plan.slots);
        for (const slot of plan.slots.filter(item => !placedSlots.includes(item))) {
            report('warn', `第 ${messageId} 楼第 ${slot.slot} 张已选中第 ${slot.at} 段，但无法在完整结构之后安全插入，本张不出图`);
        }
        if (!placedSlots.length) {
            const error = '生成点已选中正文段落，但没有安全的独占行插入位置';
            await store.putFloor(key, { ...base, status: 'failed', error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图规划失败，未发送生图请求：${error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'plan-failed', error };
        }
        plan.slots = placedSlots;
        let merged = mergeIntoLatest(messageId, floor, expected, markedText);
        if (!merged) {
            await store.putFloor(key, { ...base, status: 'stale', updatedAt: now() });
            report('warn', `第 ${messageId} 楼在规划期间已经有了新回复，或正文被大幅改写、插图位置都找不到，本楼不出 CG；需要的话点「绘制 CG」重画`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'stale' };
        }
        await ensureRegexesOnce();
        let written = await messageHost.writeFloor(messageId, merged.text, merged.latest, { requireLatest: !floor.anyFloor });
        for (let retry = 0; retry < 2 && written && written.reason === 'stale'; retry += 1) {
            merged = mergeIntoLatest(messageId, floor, expected, markedText);
            if (!merged) break;
            written = await messageHost.writeFloor(messageId, merged.text, merged.latest, { requireLatest: !floor.anyFloor });
        }
        if (merged && merged.slots) plan.slots = plan.slots.filter((slot) => merged.slots.includes(Number(slot.slot)));
        if (!written?.ok || !markersWritten(floor, plan.slots)) {
            const stale = written?.reason === 'stale' || !targetStillLive(floor);
            await store.putFloor(key, { ...base, status: stale ? 'stale' : 'failed', ...(!stale && { error: '无法写回楼层' }), updatedAt: now() });
            report(stale ? 'warn' : 'error', `第 ${messageId} 楼${stale ? '写回时一直被其他插件改动' : '无法写回插图标记'}，本楼不出 CG；需要的话点「绘制 CG」重画`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: stale ? 'stale' : 'write-failed' };
        }

        // 数据库生图插件自己写提示词，这里交给它插图位置附近的正文作为画面描述。
        plan.slots = plan.slots.map((slot) => inheritImageTaskLease(slot, {
            ...slot,
            description: numbered.paragraphs.slice(Math.max(0, slot.at - 2), slot.at).map((p) => p.text).join('\n'),
        }));
        report('info', `第 ${messageId} 楼规划完成，正在请求 ${plan.slots.length} 张插图…`);
        return generateSlots(messageId, floor, key, s, base, plan.slots);
    }

    // 有任一张失败时楼层记为 failed；下次渲染或手动生图只补失败的那几张，不重新规划、不重复写标记。
    async function generateSlots(messageId, floor, key, s, base, slots, { refreshDna = false } = {}) {
        const backend = await readyBackend(floor, s);
        if (!backend.ready.ok) {
            await store.putFloor(key, { ...base, status: 'failed', error: backend.ready.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图未开始：${backend.ready.error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'backend-unavailable', error: backend.ready.error };
        }
        const requests = cgPaintRequests(slots, refreshDna ? structuredClone(readSceneAssets()) : null);
        const attempts = await preparePaintAttempts(key, requests, floor, s.taskSignal);
        if (!attempts) return { ok: false, cancelled: true, reason: 'cancelled' };
        let succeeded = 0;
        let firstFailure = null;
        const errors = [];
        for (let index = 0; index < requests.length; index += 1) {
            const request = requests[index];
            progress(floor, { phase: 'paint', done: index + 1, total: requests.length });
            let result;
            const size = cgSize(s);
            const meta = { messageId, slot: request.slot, description: request.description || request.scene, size, imageKind: 'cg', signal: s.taskSignal || recoveryController.signal, shouldStart: () => targetStillLive(floor), promptKind: base.kind === 'nsfw' ? 'nsfwCg' : 'cg' };
            const edited = request.promptEdited === true || request.edited === true;
            if (!edited && request.preflightFailure) result = { ok: false, ...request.preflightFailure };
            else try {
                const final = edited || (!request.promptRecipe && request.captionMode === 'final');
                const seed = (!nai.describe || nai.describe(undefined, { signal: s.taskSignal }).mode === 'nai' || nai.describe(undefined, { signal: s.taskSignal }).via === 'nai')
                    ? { seed: resolveImageSeed(cgGenerationSeed(request, readSceneAssets())) } : {};
                result = await recover(floor, () => nai.generate(final ? cgFinalRequest(request) : request, { ...s.nai, size, ...seed }, { ...meta, ...seed }), request);
                if (edited && result?.ok) result = { ...result,
                    ...promptProvenance({ promptRecipe: request.promptRecipe, dnaSnapshot: request.dnaSnapshot }),
                    promptEdited: true, captionMode: 'final' };
            }
            catch (error) { result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` }; }
            if (recoveryCancelled(result)) return result;
            if (result && result.ok && hasSlotImage(result)) succeeded += 1;
            else {
                errors.push((result && result.error) || '图像来源未返回图片，可点击重试');
                if (result && result.failure && !firstFailure) firstFailure = result.failure;
                report('error', `第 ${messageId} 楼第 ${request.slot} 张插图生成失败：${(result && result.error) || 'NAI 生成失败'}`);
            }
            const saved = await finishSlotPaint(key, request, attempts.get(request.slot), result, floor);
            if (!saved?.ok || recoveryCancelled(saved)) return saved;
        }
        progress(floor, { phase: 'done' });
        const failedCount = requests.length - succeeded;
        await store.putFloor(key, { ...base, status: failedCount ? 'failed' : 'done', count: requests.length, updatedAt: now() });
        if (succeeded) report('success', `第 ${messageId} 楼已生成 ${succeeded} 张插图`);
        if (!failedCount) return { ok: true, reason: 'done', count: succeeded };
        return {
            ok: false, reason: 'generation-failed', count: succeeded, failedCount,
            error: `${failedCount} 张插图失败${succeeded ? `（成功 ${succeeded} 张）` : ''}：${Array.from(new Set(errors)).join('；')}`,
            ...(firstFailure && { failure: firstFailure }),
        };
    }

    // 正文里仍有标记的槽位，以及其中还没成功出图的。
    async function markedSlots(key, text) {
        const present = new Set(Array.from(String(text || '').matchAll(MARKER_RE), (m) => Number(m[1] || m[2])));
        const all = (await store.getSlots(key)).filter((slot) => present.has(Number(slot.slot)));
        return { all, retry: all.filter((slot) => slot.status !== 'done' || !hasSlotImage(slot)) };
    }

    // 自动出图有没有画完：等待层要等这一楼的 CG 落到成功、失败或确定不画，才把「下一楼」亮出来。
    const floorWatch = new Map();
    function floorEntry(messageId) {
        const id = Number(messageId);
        let entry = floorWatch.get(id);
        if (!entry) {
            entry = { settled: false, result: null, waiters: [] };
            floorWatch.set(id, entry);
        }
        return entry;
    }
    function cgWatchStatus(result) {
        const reason = result && result.reason;
        if (reason === 'done') return { status: 'done' };
        if (reason === 'disabled' || reason === 'not-eligible' || reason === 'not-selected'
            || reason === 'body-too-short' || reason === 'already-decided' || reason === 'nothing-missing' || reason === 'stale') {
            return { status: 'none' };
        }
        if (result && result.ok === false) return { status: 'failed' };
        return { status: 'none' };
    }
    function settleFloorWatch(messageId, result) {
        const entry = floorEntry(messageId);
        entry.started = true;
        entry.settled = true;
        entry.result = cgWatchStatus(result);
        const waiters = entry.waiters.splice(0);
        waiters.forEach((waiter) => waiter(entry.result));
    }
    function beginFloorWatch(messageId) {
        const entry = floorEntry(messageId);
        entry.started = true;
        entry.settled = false;
        entry.result = null;
    }
    function floorCgStatus(messageId) {
        const entry = floorWatch.get(Number(messageId));
        if (!entry || !entry.started) return null;
        if (!entry.settled) return { status: 'running' };
        return entry.result;
    }
    function whenFloorSettled(messageId) {
        const id = Number(messageId);
        if (!Number.isInteger(id) || id < 0) return Promise.resolve({ status: 'none' });
        const entry = floorEntry(id);
        if (entry.settled) return Promise.resolve(entry.result);
        return new Promise((resolve) => entry.waiters.push(resolve));
    }
    function watchAutomaticFloor(messageId, job) {
        beginFloorWatch(messageId);
        Promise.resolve(job).then(
            (result) => settleFloorWatch(messageId, result),
            () => settleFloorWatch(messageId, { reason: 'error' }),
        );
    }

    // backfill：翻到旧楼时补 CG。和自动出图一样掷过场概率、看字数、跳过已经判定过的楼，只是放开最新楼的限制。
    async function processMessage(messageId, { manual = false, backfill = false } = {}) {
        const watch = !manual && !backfill;
        const s = settings();
        if (!s.nsfwEnabled && !s.interludeEnabled) {
            if (watch) settleFloorWatch(messageId, { ok: true, reason: 'disabled' });
            return { ok: true, reason: 'disabled' };
        }
        if (backfill && !s.backfillOldFloors) return { ok: true, reason: 'disabled' };
        // 手动（工具栏）可画旧楼：续读停在哪一楼就画哪一楼；自动出图仍只认最新楼。
        const floor = withAnyFloor(messageHost.readFloor(messageId), manual || backfill);
        if (!floor || !floor.isAi || !(floor.isLatest || floor.anyFloor) || !floor.chatId || !floor.text.trim()) {
            if (watch) settleFloorWatch(messageId, { ok: true, reason: 'not-eligible' });
            return { ok: true, reason: 'not-eligible' };
        }
        const key = floorKeyOf(floor);
        if (locks.has(key)) {
            if (watch) watchAutomaticFloor(messageId, locks.get(key));
            if (!manual && !backfill && runningFloors.has(key)
                && runningFloors.get(key) !== stripIllustrationMarkers(floor.text))
                pendingFloors.set(key, true);
            return locks.get(key);
        }
        if (watch) beginFloorWatch(messageId);
        const job = (async () => {
            let current = floor, config = s, result;
            do {
                pendingFloors.delete(key);
                runningFloors.set(key, stripIllustrationMarkers(current.text));
                result = await withGenerationTask(current, captured => recover(current, () => run(Number(messageId),
                    withAnyFloor(messageHost.readFloor(messageId), current.anyFloor) || current,
                    key, captured, manual)));
                if (!result?.ok || result.stopGeneration || !pendingFloors.has(key)) break;
                const latest = messageHost.readFloor(messageId);
                if (!latest?.isAi || !latest.isLatest || floorKeyOf(latest) !== key
                    || stripIllustrationMarkers(latest.text) === stripIllustrationMarkers(current.text)) break;
                config = settings();
                if (!config.nsfwEnabled && !config.interludeEnabled) break;
                current = latest;
            } while (true);
            return result;
        })()
            .catch((error) => {
                if (error.stopGeneration) {
                    progress(floor, { phase: 'done' });
                    report('info', error.message);
                    return { ok: false, reason: error.reason, stopGeneration: true, error: error.message };
                }
                report('error', `自动插图处理异常：${(error && error.message) || error}`);
                return { ok: false, reason: 'error', error: '自动插图处理失败' };
            })
            .finally(() => { locks.delete(key); runningFloors.delete(key); pendingFloors.delete(key); });
        locks.set(key, job);
        if (watch) watchAutomaticFloor(messageId, job);
        return job;
    }

    function getIllustrationUrl({ chatId, messageId, swipeId, slot }) {
        const floorInfo = messageHost.readFloor(messageId) || {};
        const floor = {
            chatId: chatId || floorInfo.chatId || messageHost.getChatId(),
            messageId: Number(messageId),
            swipeId: swipeId != null ? swipeId : (floorInfo.swipeId || 0),
        };
        if (!floor.chatId) return '';
        const key = floorKeyOf(floor);
        const slotKey = `${key}|${slot}`, resource = resourceKey(slotKey);
        const hit = cache.peek(resource);
        if (hit) return hit;
        const known = states.get(slotKey);
        if (known && !known.hasImage) return '';
        if (stopped) return '';
        const stamp = cache.token(resource), generation = states.epoch();
        void cache.load(resource, async () => {
            let record = typeof store.getSlotRecord === 'function' ? await store.getSlotRecord(slotKey)
                : (await store.getSlots(key, { deferImages: true })).find(item => Number(item.slot) === Number(slot));
            if (stopped || states.epoch() !== generation || cache.token(resource) !== stamp) return '';
            if (record && store.hydrateSlot && !/^(data:image\/|blob:|https?:)/i.test(String(record.dataUrl || ''))) record = await store.hydrateSlot(record);
            if (stopped || states.epoch() !== generation || cache.token(resource) !== stamp) return '';
            if (record) remember(slotKey, record, { metadataOnly: true });
            else remember(slotKey, { status: 'missing', dataUrl: '' }, { metadataOnly: true });
            return hasSlotImage(record) ? record.dataUrl : '';
        }, { persist: false, timeoutMs: 45000 }).then(value => { if (value && !stopped && states.epoch() === generation && cache.token(resource) === stamp) emit(floor, slot); }).catch(() => {});
        return '';
    }

    function identityOf({ chatId, messageId, swipeId } = {}, slot) {
        const floor = {
            chatId: String(chatId == null ? '' : chatId).trim(),
            messageId: Number(messageId),
            swipeId: Number(swipeId || 0),
        };
        const normalizedSlot = slot == null ? null : Number(slot);
        if (!floor.chatId || !Number.isInteger(floor.messageId) || floor.messageId < 0
            || !Number.isInteger(floor.swipeId) || floor.swipeId < 0) return null;
        if (normalizedSlot != null && (!Number.isInteger(normalizedSlot) || normalizedSlot < 1)) return null;
        return { floor, slot: normalizedSlot };
    }

    // 先改正文，再删图。写不回去就不动图，避免挂载点还在、图却没了。
    async function removeMarkers(floor, slot) {
        if (!messageHost || typeof messageHost.readFloor !== 'function' || typeof messageHost.writeFloor !== 'function') {
            return { ok: true, changed: false };
        }
        const live = messageHost.readFloor(floor.messageId);
        if (!live || live.chatId !== floor.chatId || Number(live.swipeId) !== floor.swipeId || !live.isAi) {
            return { ok: false, reason: 'stale' };
        }
        const next = slot == null ? stripIllustrationMarkers(live.text) : stripIllustrationMarker(live.text, slot);
        if (next === live.text) return { ok: true, changed: false };
        const written = await messageHost.writeFloor(floor.messageId, next, live, { requireLatest: false });
        if (!written || written.ok === false) return { ok: false, reason: (written && written.reason) || 'write-failed' };
        return { ok: true, changed: true };
    }

    async function dropSlots(floor, key, slots) {
        for (const item of slots) {
            await store.deleteSlot(key, item.slot);
            cache.forget(resourceKey(`${key}|${item.slot}`)); states.delete(`${key}|${item.slot}`);
            emit(floor, item.slot);
        }
    }

    async function clearIllustration(query = {}) {
        const identity = identityOf(query, query.slot);
        if (!identity) return { ok: false, reason: 'invalid-identity' };
        if (!store || typeof store.deleteSlot !== 'function') return { ok: false, reason: 'delete-unavailable' };
        const { floor } = identity;
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = (async () => {
            const removed = await removeMarkers(floor, identity.slot);
            // 楼层已经对不上（换了聊天、换了分支、这一楼没了）时，挂载点不在当前正文里。
            // 图仍然删掉，否则 CG 库里这些图永远删不掉。正文还对得上但写不回去时，不删图。
            if (!removed.ok && removed.reason !== 'stale') return removed;
            try {
                await store.deleteSlot(key, identity.slot);
            } catch (error) {
                return { ok: false, reason: 'delete-failed', error };
            }
            cache.forget(resourceKey(`${key}|${identity.slot}`)); states.delete(`${key}|${identity.slot}`);
            const live = messageHost && typeof messageHost.readFloor === 'function' ? messageHost.readFloor(floor.messageId) : null;
            if (!live || !/(?:\[igs-img:|<IMG>)/i.test(live.text)) {
                await store.putFloor(key, { kind: 'none', status: 'done', updatedAt: now() });
            }
            emit(floor, identity.slot);
            return { ok: true, reason: 'cleared', slot: identity.slot };
        })().finally(() => { if (locks.get(key) === job) locks.delete(key); });
        locks.set(key, job);
        return job;
    }

    async function clearFloorIllustrations(query = {}) {
        const identity = identityOf(query);
        if (!identity) return { ok: false, reason: 'invalid-identity' };
        if (!store || typeof store.deleteSlot !== 'function') return { ok: false, reason: 'delete-unavailable' };
        const { floor } = identity;
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = (async () => {
            const removed = await removeMarkers(floor, null);
            if (!removed.ok) return removed;
            const slots = await store.getSlots(key);
            await store.putFloor(key, { kind: 'none', status: 'done', updatedAt: now() });
            await dropSlots(floor, key, slots);
            if (!slots.length) emit(floor, 1);
            return { ok: true, reason: slots.length || removed.changed ? 'cleared' : 'nothing', count: slots.length };
        })().finally(() => { if (locks.get(key) === job) locks.delete(key); });
        locks.set(key, job);
        return job;
    }

    async function rerollSlot(query = {}) {
        const identity = identityOf(query, query.slot);
        if (!identity) return { ok: false, reason: 'invalid-identity' };
        const floorInfo = withAnyFloor(messageHost.readFloor(identity.floor.messageId), true);
        if (!floorInfo || !floorInfo.isAi || floorInfo.chatId !== identity.floor.chatId || floorInfo.swipeId !== identity.floor.swipeId) {
            return { ok: true, reason: 'not-eligible' };
        }
        const key = floorKeyOf(identity.floor);
        if (locks.has(key)) return locks.get(key);
        const job = withGenerationTask(floorInfo, async s => {
            const slots = await store.getSlots(key);
            const record = slots.find((item) => Number(item.slot) === identity.slot);
            if (!record) return { ok: false, reason: 'missing-slot', error: '这张没有保存的提示词，请重画本楼' };
            const previous = await store.getFloor(key);
            const base = { kind: (previous && previous.kind) || 'interlude', want: (previous && previous.want) || 1 };
            if (backendReady(s).via === 'dbgen') {
                return paintDbgenCaptions(identity.floor.messageId, floorInfo, key, s, base, [record], { refreshDna: true });
            }
            return generateSlots(identity.floor.messageId, floorInfo, key, s, base, [record], { refreshDna: true });
        }).finally(() => { if (locks.get(key) === job) locks.delete(key); });
        locks.set(key, job);
        return job;
    }

    async function rerollFloor(messageId) {
        const s = settings();
        if (!s.nsfwEnabled && !s.interludeEnabled) return { ok: true, reason: 'disabled' };
        const floor = withAnyFloor(messageHost.readFloor(messageId), true);
        if (!floor || !floor.isAi || !floor.chatId || !floor.text.trim()) return { ok: true, reason: 'not-eligible' };
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = withGenerationTask(floor, async captured => {
            const oldSlots = await store.getSlots(key, { deferImages: true });
            const oldFloor = await store.getFloor(key);
            const removed = await removeMarkers(floor, null);
            if (!removed.ok) return { ...removed, error: '无法改写本楼的 CG 挂载点' };
            const latest = withAnyFloor(messageHost.readFloor(messageId), true) || { ...floor, text: stripIllustrationMarkers(floor.text) };
            let result;
            try { result = await run(Number(messageId), latest, key, captured, true); }
            catch (error) { result = { ok: false, reason: 'generation-failed', error: error.message }; }
            if (!result.ok && !result.count) {
                const before = new Set(oldSlots.map(record => Number(record.slot)));
                const current = await store.getSlots(key, { deferImages: true });
                await dropSlots(floor, key, current.filter(record => !before.has(Number(record.slot))));
                for (const record of oldSlots) await store.putSlot(key, record);
                if (oldFloor) await store.putFloor(key, oldFloor);
                const live = messageHost.readFloor(messageId);
                if (live && live.chatId === floor.chatId && live.swipeId === floor.swipeId) {
                    const restoredText = transplantMarkers(floor.text, stripIllustrationMarkers(live.text)).text;
                    await messageHost.writeFloor(messageId, restoredText, live, { requireLatest: false });
                }
            } else if (result.ok) {
                const live = messageHost.readFloor(messageId);
                const keep = new Set(Array.from(String(live?.text || '').matchAll(MARKER_RE), match => Number(match[1] || match[2])));
                await dropSlots(floor, key, oldSlots.filter(record => !keep.has(Number(record.slot))));
            }
            return result;
        }, true).finally(() => { if (locks.get(key) === job) locks.delete(key); });
        locks.set(key, job);
        return job;
    }

    function standaloneCgStatus() {
        const s = settings();
        return { ok: Boolean(nai && typeof nai.describe === 'function'), nsfw: s.nsfwEnabled === true };
    }

    // 楼外单张 CG（等待小游戏的惩罚图等）：不写楼层、不进楼层插图库，写词和出图沿用楼内 CG 的来源与角色资料。
    // outfits 指定每人穿哪套衣装，nude 里的角色按内置裸体衣装出镜；NSFW 仍受「NSFW 插图」开关约束。
    // aspect 是成图要铺满的显示区域，尺寸和全屏阅读器一样按它的宽高比算，总像素不超过上限。
    function paintStandaloneCg({ characters = [], outfits = {}, nude = [], description = '', nsfw = false, aspect = null } = {}) {
        const text = String(description || '').trim();
        if (!text) return Promise.resolve({ ok: false, reason: 'empty-description', error: '没有画面要求' });
        if (nsfw && !settings().nsfwEnabled) return Promise.resolve({ ok: false, reason: 'nsfw-disabled', error: 'NSFW 插图没有开启' });
        const target = bindImageTaskTarget({ signal: recoveryController.signal, isCurrent: () => !stopped });
        const input = { signal: target.signal, shouldStart: target.shouldStart };
        const run = async guarded => {
            if (typeof nai?.waitUntilReady === 'function') {
                const ready = await nai.waitUntilReady(guarded);
                if (!ready?.ok) return ready;
            }
            try {
                return await paintStandalone(settings(guarded.signal), guarded, { characters, outfits, nude, text, nsfw, aspect });
            } catch (error) {
                return { ok: false, error: `CG 生成失败：${(error && error.message) || error}` };
            }
        };
        return Promise.resolve(typeof llm?.runImageTask === 'function' ? llm.runImageTask(input, run) : run(input))
            .finally(() => target.release());
    }

    async function paintStandalone(s, guarded, { characters, outfits, nude, text, nsfw, aspect }) {
        const backend = backendReady(s);
        if (!backend.ready.ok) return { ok: false, error: backend.ready.error || '图像来源没有就绪' };
        const assets = structuredClone(readSceneAssets());
        const bare = new Set((Array.isArray(nude) ? nude : []).map(name => String(name || '').trim()));
        const picked = outfits && typeof outfits === 'object' ? outfits : {};
        const context = buildCharacterContext(characters, assets).map(c => ({ ...c,
            outfit: standaloneOutfit(assets, c.characterKey, bare.has(c.characterKey) ? BUILTIN_NUDE_OUTFIT : picked[c.characterKey], c.outfit) }));
        const profiles = context.map(c => c.dna);
        const template = backend.mode === 'nai' && context.length > 0
            && (profiles.some(dna => dna?.version === 2) || profiles.every(dna => usesCharacterTemplates(nai, dna)));
        const legacyDna = backend.mode === 'nai' && !template ? summarizeCharacterDna(characters, assets) : [];
        const sprites = (await Promise.all(context.map(async c => ({ c, tags: await calmSpriteTags(assets, c.characterKey, c.outfit.name) }))))
            .filter(item => item.tags);
        const dressed = context.map(c => (isBuiltinNudeOutfit(c.outfit.name) ? `${c.characterKey}全裸出镜`
            : c.outfit.name ? `${c.characterKey}穿「${c.outfit.name}」` : '')).filter(Boolean);
        const description = [text,
            legacyDna.length ? `【角色外貌】\n${legacyDna.map(c => `${c.name}：${[c.identity, c.defaultAppearance].filter(Boolean).join('；')}`).join('\n')}` : '',
            dressed.length ? `衣装：${dressed.join('；')}。` : '',
            sprites.length ? `【角色立绘提示词】这套衣装「平和」立绘出图用的词，用来保持长相和衣装；表情、动作、镜头和背景按惩罚内容重写，不照搬白底和站姿。\n${sprites.map(({ c, tags }) => `${c.characterKey}（${c.outfit.name || '默认'}）：${tags}`).join('\n')}` : '',
        ].filter(Boolean).join('\n');
        const size = aspect && aspect.width > 0 && aspect.height > 0
            ? cgSizeForAspect(s.assets && s.assets.backgroundSize, aspect) : cgSize(s);
        const task = template ? cgPromptTask(context) : {};
        const written = await imageBackendMethod(nai, 'writePrompt')({ ...task, imagePromptTask: 'cg', description,
            outputs: { slotIds: [1] },
            writingRequirements: cgWritingRequirements(s, size, nsfw ? 'nsfw' : 'cg'),
            cgHints: cgHintsFor(s, nsfw),
            ...(!template && context.length && { characterContext: context }),
            signal: guarded.signal, shouldStart: guarded.shouldStart });
        if (!written?.ok) return { ok: false, ...written, error: written?.error || 'CG 写词失败' };
        const entries = written.captions || [written];
        const entry = entries.find(item => Number(item.slotId) === 1) || entries[0];
        if (!entry?.caption) return { ok: false, error: 'CG 写词没有交回画面' };
        const checked = template ? preflightCgCaption(entry, task.promptTask, context) : { ok: true };
        if (!checked.ok) return checked;
        const request = template
            ? inheritImageTaskLease(entry, { ...entry, ...checked, promptTask: task.promptTask, characterContext: context })
            : inheritImageTaskLease(entry, { caption: entry.caption, ...(backend.mode === 'nai' && { captionMode: 'final' }) });
        const result = await generateCaption({ ...request, size, imageKind: 'cg', promptKind: nsfw ? 'nsfwCg' : 'cg',
            description: text, signal: guarded.signal, shouldStart: guarded.shouldStart });
        if (!result?.ok || !hasSlotImage(result)) return { ok: false, ...result, error: result?.error || '图像来源没有交回图片' };
        const sent = result.prompt || {};
        return { ok: true, dataUrl: result.dataUrl, size, request: description,
            prompt: { positive: String(sent.positive || ''), negative: String(sent.negative || '') } };
    }

    function standaloneOutfit(assets, key, name, fallback) {
        if (isBuiltinNudeOutfit(name)) return { name: BUILTIN_NUDE_OUTFIT, description: 'No clothing; retain the fixed identifying features.' };
        const entry = name && assets.characterOutfits?.[key]?.[name];
        if (!entry) return fallback;
        return { name, description: resolveWardrobePrompt(assets.wardrobe, entry, name)?.prompt || '' };
    }

    // 立绘本身存着出图时的提示词；取这套衣装平和那张（没有就取底图或第一张）里这个角色的部分。
    async function calmSpriteTags(assets, key, outfitName) {
        if (typeof deps.readSpritePrompt !== 'function') return '';
        const outfits = assets.characterOutfits?.[key] || {};
        const entry = isBuiltinNudeOutfit(outfitName)
            ? Object.entries(outfits).find(([name, item]) => isBuiltinNudeOutfit(name) || isBuiltinNudeOutfit(item?.wardrobe))?.[1]
            : outfits[outfitName];
        const slots = entry ? outfitSpriteSlots(entry) : (assets.characters?.[key] || {});
        const url = slots['平和'] || slots['默认'] || slots['裸体'] || Object.values(slots).find(Boolean);
        if (!url) return '';
        try {
            return spritePromptTags(await deps.readSpritePrompt(url));
        } catch {
            return '';
        }
    }

    return {
        standaloneCgStatus, paintStandaloneCg,
        processMessage, floorCgStatus, whenFloorSettled, getIllustrationUrl, clearIllustration, clearFloorIllustrations, rerollSlot, rerollFloor,
        preflightConsistency, redrawConsistency, acceptConsistency, cancelConsistency, describeConsistency,
        start() {
            stopped = false;
            if (recoveryController.signal.aborted) recoveryController = new AbortController();
            if (offRendered) return;
            messageHost.attachPromptStrip();
            const ready = messageId => processMessage(Number(messageId));
            offRendered = typeof messageHost.onImageFloorReady === 'function'
                ? messageHost.onImageFloorReady(ready)
                : messageHost.on('CHARACTER_MESSAGE_RENDERED', ready);
        },
        clearCache() { states.clear(); },
        stop() {
            stopped = true; recoveryController.abort();
            states.clear();
            for (const id of [...floorWatch.keys()]) {
                const entry = floorWatch.get(id);
                if (entry && !entry.settled) settleFloorWatch(id, { reason: 'disabled' });
            }
            consistency.cancel();
            pendingFloors.clear();
            if (offRendered) { offRendered(); offRendered = null; }
            messageHost.destroy();
        },
    };
}
