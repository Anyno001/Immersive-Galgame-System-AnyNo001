import { numberParagraphs, formatNumberedParagraphs, insertMarkers, insertMarkersAtAnchors, findAnchorInsertIndex, appendedTail, reattachTail } from './marker-placer.js';
import { MIN_AUTO_IMAGE_BODY_CHARS, floorBodyLength } from './floor-body-length.js';
import { buildPlannerUserPrompt } from './planner-prompt.js';
import { requestWithSoftRetry, DEFAULT_ASSET_TEMPLATES } from './prompt-kit.js';
import { parseIllustrationPlan } from './planner-parser.js';
import { normalizeAutoIllustrationSettings } from './auto-illustration-settings.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { resolveCharacterKey, stripIllustrationMarker, stripIllustrationMarkers } from '../../scene/scene-directives.js';
import { buildCharacterDnaPromptParts, isCharacterDnaEmpty, mergePromptTags, resolveCharacterDna } from '../../scene/character-dna.js';
import { CG_PIXEL_CAP, clampToPixelCap, fitCgSize, parseCgSize } from './cg-pixel-cap.js';

const MARKER_RE = /(?:\[igs-img:\s*(\d+)\s*\]|<IMG>\s*(\d+)\s*<\/IMG>)/gi;

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
    const landscape = String(backgroundSize || '').trim() || '1216x832';
    if (mode === 'fullscreen') return cgSizeForAspect(landscape, viewport);
    const usePortrait = mode === 'mobile' || (mode === 'embedded' && isPhoneEmbedded(viewport));
    if (!usePortrait) return clampToPixelCap(landscape);
    const match = landscape.match(/^(\d+)\s*[xX×]\s*(\d+)$/);
    // 背景尺寸本身填成竖的就直接用，不能再对调回横屏。
    if (!match || Number(match[1]) <= Number(match[2])) return clampToPixelCap(landscape);
    return clampToPixelCap(`${match[2]}x${match[1]}`);
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

const CACHE_LIMIT = 40;
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

// CG 顺序：triggerWords → identity → 规划得到的当前外观/动作；defaultAppearance 只交给 planner，不在这里追加。
// 具名 char 直接绑定；旧格式无名 char 只在「本张单人且上下文只有一个角色」时绑定，否则不注入并给出 warning。
export function bindCharacterDnaToSlots(slots, sceneAssets, contextCharacters = []) {
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
                uc: parts.negative ? mergePromptTags(parts.negative, char.uc) : char.uc,
            };
        });
        if (ambiguous) warnings.push(`第 ${slot.slot || '?'} 张插图有角色未写名字且无法唯一确定，未注入角色 DNA`);
        return { ...slot, chars: bound };
    });
    return { slots: next, warnings };
}

// 数据库生图返回的 NaiCaption 没有角色名：按同一规则（单人且上下文唯一角色）把 DNA 并进 char caption。
export function bindCharacterDnaToCaption(caption, sceneAssets, contextCharacters = [], slotId) {
    const pos = caption && caption.v4_prompt && caption.v4_prompt.caption;
    const neg = caption && caption.v4_negative_prompt && caption.v4_negative_prompt.caption;
    const chars = pos && Array.isArray(pos.char_captions) ? pos.char_captions : [];
    if (!chars.length) return { caption, warnings: [] };
    const ucs = neg && Array.isArray(neg.char_captions) ? neg.char_captions : [];
    const bound = bindCharacterDnaToSlots([{
        slot: slotId,
        chars: chars.map((item, i) => ({ tags: (item && item.char_caption) || '', uc: (ucs[i] && ucs[i].char_caption) || '' })),
    }], sceneAssets, contextCharacters);
    const next = bound.slots[0].chars;
    return {
        warnings: bound.warnings,
        caption: {
            ...caption,
            v4_prompt: {
                ...caption.v4_prompt,
                caption: { ...pos, char_captions: chars.map((item, i) => ({ ...item, char_caption: next[i].tags })) },
            },
            v4_negative_prompt: {
                ...(caption.v4_negative_prompt || {}),
                caption: {
                    ...(neg || {}),
                    base_caption: (neg && neg.base_caption) || '',
                    char_captions: chars.map((item, i) => ({
                        ...(ucs[i] && typeof ucs[i] === 'object' ? ucs[i] : (item && item.centers ? { centers: item.centers } : {})),
                        char_caption: next[i].uc || '',
                    })),
                },
            },
        },
    };
}

export function createAutoIllustrationService(deps) {
    const { messageHost, llm, nai, store, getSettings, events } = deps;
    const random = deps.random || Math.random;
    const now = deps.now || (() => new Date().toISOString());
    const report = deps.report || (() => {});
    const minBodyChars = Number.isFinite(Number(deps.minBodyChars)) ? Number(deps.minBodyChars) : MIN_AUTO_IMAGE_BODY_CHARS;
    const sourceFilter = typeof deps.getSourceFilter === 'function' ? deps.getSourceFilter : () => undefined;
    const locks = new Map();
    const cache = new Map();
    const hydrated = new Set();
    let offRendered = null;
    let regexesEnsured = false;
    const settings = () => normalizeAutoIllustrationSettings(getSettings ? getSettings() : null);
    const cgSize = (s) => cgSizeForMode(
        s.assets && s.assets.backgroundSize,
        typeof deps.getReaderMode === 'function' ? deps.getReaderMode() : 'pc',
        typeof deps.getViewport === 'function' ? deps.getViewport() : null,
    );
    const readSceneAssets = () => {
        const value = typeof deps.getSceneAssets === 'function' ? deps.getSceneAssets() : null;
        return value && typeof value === 'object' ? value : {};
    };

    function remember(key, value) {
        cache.delete(key);
        cache.set(key, value);
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    }

    function emit(floor, slot) {
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
    function backendReady() {
        return nai && typeof nai.describe === 'function' ? nai.describe() : { ready: { ok: true } };
    }

    function decide(s, isNsfw, manual = false) {
        if (isNsfw) return s.nsfwEnabled ? { kind: 'nsfw', want: s.nsfwCount, exact: true } : null;
        if (s.interludeEnabled && (manual || random() * 100 < s.interludeProbability)) {
            return { kind: 'interlude', want: s.interludeMaxCount, exact: false };
        }
        return null;
    }

    async function ensureRegexesOnce() {
        if (regexesEnsured) return;
        try { regexesEnsured = (await messageHost.ensureMarkerRegexes()).ok === true; } catch (error) { regexesEnsured = false; }
    }

    // 数据库生图：只调插件的写词接口和出图接口。生成点按本插件的插图标记写回正文。
    async function planDbgenCg(messageId, floor, key, s, expected, decision, base, characters = []) {
        report('info', `第 ${messageId} 楼向数据库生图插件要 ${decision.want} 张 CG…`);
        progress(floor, { phase: 'write' });
        await store.putFloor(key, { ...base, status: 'planning', updatedAt: now() });
        if (!nai || typeof nai.writeDbgenFloorPrompts !== 'function' || typeof nai.generateDbgenCaption !== 'function') {
            const error = '数据库生图插件缺少楼内写词或出图接口';
            await store.putFloor(key, { ...base, status: 'failed', error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图未开始：${error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'backend-unavailable', error };
        }
        let written;
        try {
            written = await nai.writeDbgenFloorPrompts({
                messageId,
                description: [
                    `为本楼生成${decision.want}张CG，CG点自行选择。slotid从1开始数。挂载点只从剧情正文里逐字摘原句，提示词、出图指导、标签和正文以外的内容不要拿来当挂载点，也不要画进CG。`,
                    cgFramePrompt(cgSize(s)),
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
        const returned = (Array.isArray(written.captions) ? written.captions : [])
            .filter((item) => item && item.caption)
            .sort((a, b) => Number(a.slotId) - Number(b.slotId))
            .slice(0, decision.want);
        if (returned.length !== decision.want) {
            report('warn', `第 ${messageId} 楼数据库生图插件返回了 ${Array.isArray(written.captions) ? written.captions.length : 0} 张，按 ${returned.length} 张生成`);
        }
        const slots = [];
        const sceneAssets = readSceneAssets();
        for (const item of returned) {
            const anchorSentence = String(item.anchorSentence || item.anchor || '').trim();
            const found = findAnchorInsertIndex(floor.text, anchorSentence);
            if (found.index < 0) {
                report('warn', `第 ${messageId} 楼第 ${item.slotId} 张没有能对上正文的生成点，跳过`);
                continue;
            }
            const slot = Number(item.slotId) || slots.length + 1;
            const bound = bindCharacterDnaToCaption(item.caption, sceneAssets, characters, slot);
            for (const warning of bound.warnings) report('info', `第 ${messageId} 楼${warning}`);
            slots.push({ slot, caption: bound.caption, anchorSentence });
        }
        if (!slots.length) {
            const error = '数据库生图插件没有返回能对上正文的生成点';
            await store.putFloor(key, { ...base, status: 'failed', error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图规划失败，未发送生图请求：${error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'plan-failed', error };
        }
        const latest = messageHost.readFloor(messageId);
        const tail = latest ? appendedTail(expected.text, latest.text) : null;
        if (!latest || !latest.isAi || !latest.isLatest || latest.chatId !== floor.chatId || latest.swipeId !== floor.swipeId || tail == null) {
            await store.putFloor(key, { ...base, status: 'stale', updatedAt: now() });
            report('warn', `第 ${messageId} 楼在规划期间被修改或已不是最新楼层，本次放弃生图，下次渲染时重试`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'stale' };
        }
        if (tail) report('info', `第 ${messageId} 楼末尾被其他插件追加了内容，插图照常插在原文里`);
        await ensureRegexesOnce();
        const writtenText = await messageHost.writeFloor(messageId, reattachTail(insertMarkersAtAnchors(floor.text, slots), tail), latest);
        if (!writtenText || !writtenText.ok) {
            const stale = writtenText && writtenText.reason === 'stale';
            await store.putFloor(key, { ...base, status: stale ? 'stale' : 'failed', ...(!stale && { error: '无法写回楼层' }), updatedAt: now() });
            report(stale ? 'warn' : 'error', `第 ${messageId} 楼${stale ? '在写回前被修改' : '无法写回插图标记'}，本次放弃生图`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: stale ? 'stale' : 'write-failed' };
        }
        report('info', `第 ${messageId} 楼已写入 ${slots.length} 个生成点，正在出图…`);
        return paintDbgenCaptions(messageId, floor, key, s, base, slots);
    }

    async function paintDbgenCaptions(messageId, floor, key, s, base, slots) {
        const requests = slots.map(({ status, error, dataUrl, floorKey, key: slotKey, updatedAt, ...request }) => request);
        for (const request of requests) {
            await store.putSlot(key, { ...request, status: 'pending', updatedAt: now() });
            remember(`${key}|${request.slot}`, { status: 'pending', dataUrl: '' });
        }
        let succeeded = 0;
        const errors = [];
        for (let index = 0; index < requests.length; index += 1) {
            const request = requests[index];
            progress(floor, { phase: 'paint', done: index + 1, total: requests.length });
            let result;
            if (!request.caption) {
                result = { ok: false, error: '没有可出图的提示词' };
            } else {
                try {
                    result = await nai.generateDbgenCaption({ caption: request.caption, size: cgSize(s), messageId });
                } catch (error) {
                    result = { ok: false, error: (error && error.message) || '出图失败' };
                }
            }
            if (result && result.ok) succeeded += 1;
            else {
                errors.push((result && result.error) || '出图失败');
                report('error', `第 ${messageId} 楼第 ${request.slot} 张插图生成失败：${(result && result.error) || '出图失败'}`);
            }
            const record = result && result.ok
                ? { ...request, status: 'done', dataUrl: result.dataUrl }
                : { ...request, status: 'failed', error: (result && result.error) || '出图失败' };
            await store.putSlot(key, { ...record, updatedAt: now() });
            remember(`${key}|${request.slot}`, { status: record.status, dataUrl: record.dataUrl || '' });
            emit(floor, request.slot);
        }
        progress(floor, { phase: 'done' });
        const failedCount = requests.length - succeeded;
        await store.putFloor(key, { ...base, status: failedCount ? 'failed' : 'done', count: requests.length, updatedAt: now() });
        if (succeeded) report('success', `第 ${messageId} 楼已生成 ${succeeded} 张插图`);
        if (!failedCount) return { ok: true, reason: 'done', count: succeeded };
        return {
            ok: false, reason: 'generation-failed', count: succeeded, failedCount,
            error: `${failedCount} 张插图失败${succeeded ? `（成功 ${succeeded} 张）` : ''}：${Array.from(new Set(errors)).join('；')}`,
        };
    }

    async function run(messageId, floor, key, s, manual) {
        const previous = await store.getFloor(key);
        const marked = await markedSlots(key, floor.text);
        if (marked.retry.length) {
            const base = { kind: (previous && previous.kind) || 'interlude', want: (previous && previous.want) || marked.all.length };
            report('info', `第 ${messageId} 楼重试 ${marked.retry.length} 张未成功的插图…`);
            if (backendReady().via === 'dbgen') return paintDbgenCaptions(messageId, floor, key, s, base, marked.retry);
            return generateSlots(messageId, floor, key, s, base, marked.retry);
        }
        if (marked.all.length) return { ok: true, reason: manual ? 'nothing-missing' : 'already-decided' };
        if (!manual && previous && SETTLED_STATUSES.has(previous.status)) return { ok: true, reason: 'already-decided' };
        // 不记成已处理：用户点「继续」把这楼写长后，下次渲染照常规划。
        const bodyChars = floorBodyLength(floor.text, sourceFilter());
        if (!manual && bodyChars < minBodyChars) {
            report('info', `第 ${messageId} 楼跳过：正文只有 ${bodyChars} 字，少于 ${minBodyChars} 字不自动生图`);
            return { ok: true, reason: 'body-too-short' };
        }
        // 柏宝绘 / 智绘姬开着自动写词时先等它把词写回本楼再规划；两边同时写回，IGS 会因正文已改放弃本楼。
        if (typeof nai.waitSourceFloorPrompts === 'function' && ['baibai', 'chatu8'].includes(backendReady().via)) {
            progress(floor, { phase: 'write' });
            await nai.waitSourceFloorPrompts(messageId);
            floor = messageHost.readFloor(messageId) || floor;
        }
        // 标记还在但记录丢了（换设备、清缓存）时先去掉旧标记再规划，避免重复插入；写回时仍按原文校验。
        const expected = floor;
        if (/(?:\[igs-img:\s*\d+\s*\]|<IMG>\s*\d+\s*<\/IMG>)/i.test(floor.text)) floor = { ...floor, text: stripIllustrationMarkers(floor.text) };
        const numbered = numberParagraphs(floor.text);
        const decision = numbered.paragraphs.length ? decide(s, numbered.isNsfw, manual) : null;
        if (!decision) {
            await store.putFloor(key, { kind: 'none', status: 'done', updatedAt: now() });
            const why = !numbered.paragraphs.length ? '本楼没有可读正文'
                : (!numbered.isNsfw && !s.interludeEnabled ? '本楼未标记 NSFW 场景（需正文含 [igs-scene:场景|时间|天气|nsfw]），且未开启过场插图'
                    : '过场插图本次未触发（按触发概率随机）');
            report('info', `第 ${messageId} 楼跳过：${why}`);
            return { ok: true, reason: 'not-selected', why };
        }
        const base = { kind: decision.kind, want: decision.want };
        // 出图端没就绪（没填 Key、插件未安装）时不再白白请求副 LLM。
        const backend = backendReady();
        if (!backend.ready.ok) {
            await store.putFloor(key, { ...base, status: 'failed', error: backend.ready.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图未开始：${backend.ready.error}`);
            return { ok: false, reason: 'backend-unavailable', error: backend.ready.error };
        }
        if (backend.via === 'dbgen') return planDbgenCg(messageId, floor, key, s, expected, decision, base, numbered.characters);
        report('info', `第 ${messageId} 楼开始规划插图（${decision.kind === 'nsfw' ? 'NSFW' : '过场'}），正在请求副 LLM…`);
        progress(floor, { phase: 'write' });
        await store.putFloor(key, { ...base, status: 'planning', updatedAt: now() });
        let plan;
        try {
            const previousText = messageHost.readPreviousAiTexts(messageId, s.llm.contextFloors)
                .map(toReadableText).join('\n').slice(-1500);
            const user = buildPlannerUserPrompt({
                numberedText: formatNumberedParagraphs(numbered.paragraphs),
                scenes: numbered.scenes, characters: numbered.characters,
                previousText, want: decision.want, exact: decision.exact, isNsfw: numbered.isNsfw,
                characterDna: summarizeCharacterDna(numbered.characters, readSceneAssets()),
                frame: cgFramePrompt(cgSize(s)),
            });
            plan = await requestWithSoftRetry(llm, {
                system: s.llm.prompts.illustration,
                softSystem: numbered.isNsfw ? s.llm.prompts.illustrationSoft : '',
                user,
                parse: (reply) => parseIllustrationPlan(reply, { maxSlots: decision.want, paragraphCount: numbered.paragraphs.length }),
            }, s.llm);
            // 温和模式下 LLM 只给了构图，露骨 tag 在本地补上，不经过 LLM。
            if (plan.ok && plan.soft) {
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
            return { ok: false, reason: 'plan-failed', error: plan.error };
        }
        {
            const bound = bindCharacterDnaToSlots(plan.slots, readSceneAssets(), numbered.characters);
            plan.slots = bound.slots;
            for (const warning of bound.warnings) report('info', `第 ${messageId} 楼${warning}`);
        }

        // 其他插件只在末尾追加内容（平行事件、状态栏）时，段落编号不变，标记照插，再接上追加的那段；正文中间被改才放弃。
        const latest = messageHost.readFloor(messageId);
        const tail = latest ? appendedTail(expected.text, latest.text) : null;
        if (!latest || !latest.isAi || !latest.isLatest || latest.chatId !== floor.chatId || latest.swipeId !== floor.swipeId || tail == null) {
            await store.putFloor(key, { ...base, status: 'stale', updatedAt: now() });
            report('warn', `第 ${messageId} 楼在规划期间被修改或已不是最新楼层（可能有其他插件改写了正文），本次放弃生图，下次渲染时重试`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'stale' };
        }
        if (tail) report('info', `第 ${messageId} 楼末尾被其他插件追加了内容，插图照常插在原文里`);
        await ensureRegexesOnce();
        const written = await messageHost.writeFloor(messageId, reattachTail(insertMarkers(floor.text, numbered.paragraphs, plan.slots), tail), latest);
        if (!written || !written.ok) {
            const stale = written && written.reason === 'stale';
            await store.putFloor(key, { ...base, status: stale ? 'stale' : 'failed', ...(!stale && { error: '无法写回楼层' }), updatedAt: now() });
            report(stale ? 'warn' : 'error', `第 ${messageId} 楼${stale ? '在写回前被修改' : '无法写回插图标记'}，本次放弃生图`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: stale ? 'stale' : 'write-failed' };
        }

        // 数据库生图插件自己写提示词，这里交给它插图位置附近的正文作为画面描述。
        plan.slots = plan.slots.map((slot) => ({
            ...slot,
            description: numbered.paragraphs.slice(Math.max(0, slot.at - 2), slot.at).map((p) => p.text).join('\n'),
        }));
        report('info', `第 ${messageId} 楼规划完成，正在请求 ${plan.slots.length} 张插图…`);
        return generateSlots(messageId, floor, key, s, base, plan.slots);
    }

    // 有任一张失败时楼层记为 failed；下次渲染或手动生图只补失败的那几张，不重新规划、不重复写标记。
    async function generateSlots(messageId, floor, key, s, base, slots) {
        const backend = backendReady();
        if (!backend.ready.ok) {
            await store.putFloor(key, { ...base, status: 'failed', error: backend.ready.error, updatedAt: now() });
            report('error', `第 ${messageId} 楼插图未开始：${backend.ready.error}`);
            progress(floor, { phase: 'done' });
            return { ok: false, reason: 'backend-unavailable', error: backend.ready.error };
        }
        const requests = slots.map(({ status, error, dataUrl, floorKey, key: slotKey, updatedAt, ...request }) => request);
        for (const request of requests) {
            await store.putSlot(key, { ...request, status: 'pending', updatedAt: now() });
            remember(`${key}|${request.slot}`, { status: 'pending', dataUrl: '' });
        }
        let succeeded = 0;
        const errors = [];
        for (let index = 0; index < requests.length; index += 1) {
            const request = requests[index];
            progress(floor, { phase: 'paint', done: index + 1, total: requests.length });
            let result;
            const size = cgSize(s);
            const meta = { messageId, slot: request.slot, description: request.description || request.scene, size, imageKind: 'cg' };
            try { result = await nai.generate(request, { ...s.nai, size }, meta); }
            catch (error) { result = { ok: false, error: `NAI 生成失败：${(error && error.message) || error}` }; }
            if (result && result.ok) succeeded += 1;
            else {
                errors.push((result && result.error) || 'NAI 生成失败');
                report('error', `第 ${messageId} 楼第 ${request.slot} 张插图生成失败：${(result && result.error) || 'NAI 生成失败'}`);
            }
            const record = result && result.ok
                ? { ...request, status: 'done', dataUrl: result.dataUrl }
                : { ...request, status: 'failed', error: result && result.error || 'NAI 生成失败' };
            await store.putSlot(key, { ...record, updatedAt: now() });
            remember(`${key}|${request.slot}`, { status: record.status, dataUrl: record.dataUrl || '' });
            emit(floor, request.slot);
        }
        progress(floor, { phase: 'done' });
        const failedCount = requests.length - succeeded;
        await store.putFloor(key, { ...base, status: failedCount ? 'failed' : 'done', count: requests.length, updatedAt: now() });
        if (succeeded) report('success', `第 ${messageId} 楼已生成 ${succeeded} 张插图`);
        if (!failedCount) return { ok: true, reason: 'done', count: succeeded };
        return {
            ok: false, reason: 'generation-failed', count: succeeded, failedCount,
            error: `${failedCount} 张插图失败${succeeded ? `（成功 ${succeeded} 张）` : ''}：${Array.from(new Set(errors)).join('；')}`,
        };
    }

    // 正文里仍有标记的槽位，以及其中还没成功出图的。
    async function markedSlots(key, text) {
        const present = new Set(Array.from(String(text || '').matchAll(MARKER_RE), (m) => Number(m[1] || m[2])));
        const all = (await store.getSlots(key)).filter((slot) => present.has(Number(slot.slot)));
        return { all, retry: all.filter((slot) => slot.status !== 'done') };
    }

    async function processMessage(messageId, { manual = false } = {}) {
        const s = settings();
        if (!s.nsfwEnabled && !s.interludeEnabled) return { ok: true, reason: 'disabled' };
        const floor = messageHost.readFloor(messageId);
        if (!floor || !floor.isAi || !floor.isLatest || !floor.chatId || !floor.text.trim()) {
            return { ok: true, reason: 'not-eligible' };
        }
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = run(Number(messageId), floor, key, s, manual)
            .catch((error) => {
                report('error', `自动插图处理异常：${(error && error.message) || error}`);
                return { ok: false, reason: 'error', error: '自动插图处理失败' };
            })
            .finally(() => locks.delete(key));
        locks.set(key, job);
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
        const hit = cache.get(`${key}|${slot}`);
        if (hit) return hit.status === 'done' ? hit.dataUrl : '';
        if (!hydrated.has(key)) {
            hydrated.add(key);
            store.getSlots(key).then((list) => {
                let found = false;
                for (const item of list) {
                    remember(`${key}|${item.slot}`, { status: item.status, dataUrl: item.dataUrl || '' });
                    if (item.status === 'done') found = true;
                }
                if (found) emit(floor, slot);
            }).catch(() => { hydrated.delete(key); });
        }
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
            cache.delete(`${key}|${item.slot}`);
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
            cache.delete(`${key}|${identity.slot}`);
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
        const floorInfo = messageHost.readFloor(identity.floor.messageId);
        if (!floorInfo || !floorInfo.isAi || !floorInfo.isLatest || floorInfo.chatId !== identity.floor.chatId || floorInfo.swipeId !== identity.floor.swipeId) {
            return { ok: true, reason: 'not-eligible' };
        }
        const key = floorKeyOf(identity.floor);
        if (locks.has(key)) return locks.get(key);
        const job = (async () => {
            const slots = await store.getSlots(key);
            const record = slots.find((item) => Number(item.slot) === identity.slot);
            if (!record) return { ok: false, reason: 'missing-slot', error: '这张没有保存的提示词，请重画本楼' };
            const s = settings();
            const previous = await store.getFloor(key);
            const base = { kind: (previous && previous.kind) || 'interlude', want: (previous && previous.want) || 1 };
            if (backendReady().via === 'dbgen') {
                if (!record.caption) return { ok: false, reason: 'no-prompt', error: '这张没有保存提示词，请重画本楼' };
                return paintDbgenCaptions(identity.floor.messageId, floorInfo, key, s, base, [record]);
            }
            return generateSlots(identity.floor.messageId, floorInfo, key, s, base, [record]);
        })().finally(() => { if (locks.get(key) === job) locks.delete(key); });
        locks.set(key, job);
        return job;
    }

    async function rerollFloor(messageId) {
        const s = settings();
        if (!s.nsfwEnabled && !s.interludeEnabled) return { ok: true, reason: 'disabled' };
        const floor = messageHost.readFloor(messageId);
        if (!floor || !floor.isAi || !floor.isLatest || !floor.chatId || !floor.text.trim()) return { ok: true, reason: 'not-eligible' };
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = (async () => {
            const removed = await removeMarkers(floor, null);
            if (!removed.ok) return { ...removed, error: '无法删掉本楼的 CG 挂载点' };
            const slots = await store.getSlots(key);
            await dropSlots(floor, key, slots);
            if (!slots.length) emit(floor, 1);
            const latest = messageHost.readFloor(messageId) || { ...floor, text: stripIllustrationMarkers(floor.text) };
            return run(Number(messageId), latest, key, s, true);
        })().finally(() => { if (locks.get(key) === job) locks.delete(key); });
        locks.set(key, job);
        return job;
    }

    return {
        processMessage, getIllustrationUrl, clearIllustration, clearFloorIllustrations, rerollSlot, rerollFloor,
        start() {
            if (offRendered) return;
            messageHost.attachPromptStrip();
            offRendered = messageHost.on('CHARACTER_MESSAGE_RENDERED', (messageId) => {
                void processMessage(Number(messageId));
            });
        },
        stop() {
            if (offRendered) { offRendered(); offRendered = null; }
            messageHost.destroy();
        },
    };
}
