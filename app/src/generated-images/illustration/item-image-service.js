import { recoverOperation } from '../../storage/automatic-recovery.js';
// 物品图服务：表格物品 + 本楼 [igs-fx:item] → 缺图物品按聊天隔离生成，存入 igs-generated-assets（type: item）。
// 关闭时入口短路：不读表、不发请求。记录用独立状态 ready，不进入素材补全的审核弹窗与临时素材列表。
import { requestWithSoftRetry, normalizeMatteColor } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings } from './auto-illustration-settings.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { numberParagraphs } from './marker-placer.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { extractFxDirectives } from '../../scene/fx-directives.js';
import { buildItemCatalog, normalizeItemName } from '../../data/shujuku/item-catalog.js';
import { normalizeItemImageSettings } from './item-image-settings.js';
import { createItemRecordCache } from './item-image-cache.js';
import { ITEM_PLANNER_SYSTEM_PROMPT, ITEM_PLANNER_SOFT_SYSTEM_PROMPT, buildItemPlannerUserPrompt, parseItemPlan, buildItemSlot } from './item-prompt.js';
import { inheritImageTaskLease, imageTaskState, bindImageTaskTarget } from '../image-task-runtime.js';

export const ITEM_IMAGE_UPDATED_EVENT = 'igs:item-image-updated';
export const ITEM_ASSET_TYPE = 'item';
const MANUAL_LIMIT = 10;
// discarded 视为用户已处理，不再自动补；只有 regenerate 会重新生成。
const SETTLED_STATUSES = new Set(['ready', 'discarded']);

export function itemAssetKeyOf(chatId, name) {
    return `${chatId}|item|${normalizeItemName(name)}`;
}

// 本楼 igs-fx:item 标签中的物品（按出现顺序）；失去／使用的物品同样需要图。
export function collectTagItems(text) {
    return extractFxDirectives(text).filter((d) => d.kind === 'item').map((d) => ({ name: d.args[1], description: d.args[2] || '' }));
}

// 标签在前（即将演出）、表格在后；同名合并并补齐缺失描述。
export function mergeItemCandidates(...lists) {
    const byName = new Map();
    for (const item of lists.flat()) {
        const norm = normalizeItemName(item && item.name);
        if (!norm) continue;
        const existing = byName.get(norm);
        if (!existing) byName.set(norm, { name: String(item.name).trim(), description: item.description || '' });
        else if (!existing.description && item.description) existing.description = item.description;
    }
    return Array.from(byName.values());
}

// 物品图只画外观：副 LLM 只拿提到这些物品的段落，总长封顶，不再随每批请求发整楼正文。
const ITEM_CONTEXT_LIMIT = 600;
export function itemContextOf(text, needs = []) {
    const names = needs.map((need) => String((need && need.name) || '').trim()).filter(Boolean);
    let out = '';
    for (const { text: paragraph } of numberParagraphs(text).paragraphs) {
        if (!names.some((name) => paragraph.includes(name))) continue;
        if (out.length + paragraph.length + 1 > ITEM_CONTEXT_LIMIT) return out || paragraph.slice(0, ITEM_CONTEXT_LIMIT);
        out += (out ? '\n' : '') + paragraph;
    }
    return out;
}

export function createItemImageService(deps) {
    const { messageHost, llm, nai, store, getSettings, events, readTables } = deps;
    const matte = deps.matte || (async (dataUrl) => dataUrl);
    const now = deps.now || (() => new Date().toISOString());
    const report = deps.report || (() => {});
    const newId = deps.newId || (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const emit = (detail) => { if (events && typeof events.emit === 'function') events.emit(ITEM_IMAGE_UPDATED_EVENT, detail); };
    const cache = createItemRecordCache({ store, type: ITEM_ASSET_TYPE, emit, mediaCache: deps.mediaCache,
        onError: () => report('info', '正在自动恢复物品记录') });
    const floorLocks = new Map();
    const inflight = new Map();
    let queue = Promise.resolve();
    let offRendered = null, retryTarget = null, stopped = false;
    let recoveryController = new AbortController();
    const recover = (chatId, execute, floor, repeatable) => recoverOperation(execute, {
        retryUnchanged: Boolean(repeatable), repeatable,
        signal: recoveryController.signal, global: deps.global || llm?.recoveryGlobal || nai?.recoveryGlobal || globalThis,
        isActive: () => !stopped && chatOf() === chatId
            && (!floor || floorKeyOf(messageHost.readFloor(floor.messageId) || {}) === floorKeyOf(floor)),
        onRecover: ({ attempt }) => { if (attempt === 1) report('info', '正在自动续接物品图任务'); },
    });

    const readSettings = signal => {
        const raw = imageTaskState({ signal })?.config || (getSettings ? getSettings() || {} : {});
        const itemModel = String((raw.imageApi && raw.imageApi.itemModel) || '').trim();
        const matteColor = normalizeMatteColor(raw.imageApi && raw.imageApi.spriteMatteColor);
        return { items: normalizeItemImageSettings(raw.itemImages), auto: normalizeAutoIllustrationSettings(raw.autoIllustration), itemModel, matteColor, taskSignal: signal };
    };

    const chatOf = () => (messageHost.getChatId ? messageHost.getChatId() : '');
    const recordFor = (chatId, name) => cache.get(chatId, itemAssetKeyOf(chatId, name));

    function readCatalog() {
        if (typeof readTables !== 'function') return [];
        try { return buildItemCatalog(readTables()).items; } catch (error) { return []; }
    }

    // 串行生成；同一物品键在途时复用同一任务，重复事件不重复出图、不重复计费。
    function enqueue(key, task) {
        if (inflight.has(key)) return inflight.get(key);
        const job = queue.then(task, task).finally(() => inflight.delete(key));
        queue = job.catch(() => {});
        inflight.set(key, job);
        return job;
    }

    // 活动预设负责完整正文；旧独立调用保留内容词模板兼容。
    async function planItems(needs, text, s, backend) {
        if (backend.ownPrompts) return needs.map((need) => ({ need, tags: '' }));
        const ordered = typeof llm?.prepareImagePrompt === 'function';
        const final = backend.mode === 'nai' && ordered;
        const transparent = supportsNaiTransparentBackground(s.itemModel || s.auto.nai.model);
        const requirements = buildItemSlot('', { transparent, matteColor: s.matteColor, positiveContext: s.auto.nai.artistPrefix });
        let planned = [];
        try {
            const plan = await requestWithSoftRetry(llm, {
                signal: s.taskSignal || recoveryController.signal,
                shouldStart: () => !stopped,
                system: ITEM_PLANNER_SYSTEM_PROMPT,
                softSystem: ITEM_PLANNER_SOFT_SYSTEM_PROMPT,
                user: buildItemPlannerUserPrompt(needs, text),
                imagePrompt: { task: 'item', input: { description: buildItemPlannerUserPrompt(needs, text),
                    ...(final && { userPrompts: { positive: requirements.scene,
                        negative: requirements.sceneUc },
                        writingRequirements: { size: s.items.size, transparent } }),
                    outputs: { format: 'asset-plan', items: needs.map((need, index) => ({ id: `ch${index + 1}`, type: 'item' })) } } },
                parse: (reply) => parseItemPlan(reply, needs, { strict: ordered }),
            }, s.auto.llm);
            if (plan?.stopGeneration) return plan;
            if (ordered && !plan?.ok) return { ...plan, ok: false, stopGeneration: true };
            if (plan && plan.ok) planned = plan.items;
        } catch (error) {
            if (ordered) return { ok: false, reason: 'item-prompt-write-failed', stopGeneration: true,
                error: '物品写词失败，未继续绘图' };
            return { ok: false, reason: 'item-prompt-write-failed' };
        }
        if (final) return planned.map(item => inheritImageTaskLease(item,
            { ...item, captionMode: 'final', transparent }));
        if (needs.some(need => !planned.some(item => item.need === need && !item.error)))
            return { ok: false, reason: 'item-plan-incomplete' };
        return planned;
    }


    // 生成单件；重画失败时保留原图，不覆盖已可用的记录。
    async function generateItem(chatId, plan, s, floor, force = false) {
        const need = plan.need;
        const key = itemAssetKeyOf(chatId, need.name);
        if (chatId !== chatOf()) return { ok: false, error: '聊天已切换', reason: 'stale-chat' };
        const previous = await cache.read(chatId, key);
        if (!force && previous && SETTLED_STATUSES.has(previous.status)) return { ok: true, record: previous, reason: 'already-present' };
        const base = { key, chatId, type: ITEM_ASSET_TYPE, name: need.name, description: need.description || '', tags: plan.tags || '',
            floorKey: floor ? floorKeyOf(floor) : '', messageId: floor ? floor.messageId : null, swipeId: floor ? floor.swipeId : null, createdAt: now() };
        let error = plan.error || '';
        let record = null;
        if (!error) {
            // 智绘姬 / 柏宝绘出图不保证透明底：走它们时按非透明底出图，不信任 NAI 模型的原生透明能力。
            const plannedVia = nai && typeof nai.describe === 'function' ? nai.describe(undefined, { signal: s.taskSignal }).via : 'nai';
            const final = plan.captionMode === 'final';
            const transparent = final ? plan.transparent : plannedVia !== 'chatu8' && plannedVia !== 'baibai' && supportsNaiTransparentBackground(s.itemModel || s.auto.nai.model);
            const slot = inheritImageTaskLease(plan, buildItemSlot(plan.tags, { transparent, matteColor: s.matteColor, uc: plan.uc,
                positiveContext: s.auto.nai.artistPrefix, final }));
            const meta = { messageId: floor ? floor.messageId : undefined, size: s.items.size, imageKind: 'item',
                signal: s.taskSignal || recoveryController.signal,
                shouldStart: () => !stopped && chatId === chatOf()
                    && (!floor || floorKeyOf(messageHost.readFloor(floor.messageId) || {}) === floorKeyOf(floor)),
                description: `物品：${need.name}${need.description ? `，${need.description}` : ''}`,
                ...(!final && { userPrompts: { positive: slot.scene, negative: slot.sceneUc } }) };
            let result;
            try { result = await recover(chatId, async () => {
                const generated = await nai.generate(slot, { ...s.auto.nai, size: s.items.size }, meta);
                return generated?.ok && generated.dataUrl ? generated : { ...generated, ok: false };
            }, floor); }
            catch (e) { result = { ok: false, error: `NAI 生成失败：${(e && e.message) || e}` }; }
            if (result && result.ok && result.dataUrl) {
                const dataUrl = await recover(chatId, () => matte(result.dataUrl, { alreadyTransparent: transparent }), floor, 'read');
                const imageId = newId();
                const persisted = await recover(chatId, () => store.putImage({ id: imageId, dataUrl, type: ITEM_ASSET_TYPE, createdAt: base.createdAt }), floor, 'save');
                if (persisted?.cancelled) return persisted;
                cache.rememberImage(imageId, dataUrl);
                record = { ...base, imageId, status: 'ready' };
            } else error = (result && result.error) || 'NAI 生成失败';
        }
        if (!record) {
            report('error', `物品「${need.name}」生图失败：${error}`);
            if (previous && previous.status === 'ready') return { ok: false, error, record: previous };
            record = { ...base, imageId: '', status: 'failed', error };
        }
        if (chatId !== chatOf() || stopped) return { ok: true, cancelled: true };
        const persisted = await recover(chatId, () => store.putAsset(record), floor, 'save');
        if (persisted?.cancelled) return persisted;
        if (record.status === 'ready' && previous && previous.imageId && previous.imageId !== record.imageId) await recover(chatId, () => cache.dropImage(previous.imageId), floor, 'save');
        cache.set(record);
        emit({ chatId, key, name: need.name, reason: record.status === 'ready' ? 'generated' : 'failed' });
        return { ok: record.status === 'ready', error, record };
    }

    async function missingNeeds(chatId, candidates, limit) {
        const needs = [];
        for (const item of candidates) {
            if (chatId !== chatOf()) throw Object.assign(new Error('media-metadata-stale'), { code: 'media-metadata-stale' });
            const record = await cache.read(chatId, itemAssetKeyOf(chatId, item.name));
            if (!record || !SETTLED_STATUSES.has(record.status)) needs.push(item);
            if (needs.length >= limit) break;
        }
        return needs;
    }

    function runBatch(chatId, needs, text, s, floor, force = false) {
        const target = bindImageTaskTarget({ signal: recoveryController.signal, subscribe: messageHost.on?.bind(messageHost),
            isCurrent: () => !stopped && chatId === chatOf()
                && (!floor || floorKeyOf(messageHost.readFloor(floor.messageId) || {}) === floorKeyOf(floor)) });
        const input = { signal: target.signal, shouldStart: target.shouldStart };
        const execute = async guarded => {
            if (typeof nai?.waitUntilReady === 'function') {
                const ready = await nai.waitUntilReady(guarded);
                if (!ready?.ok) return ready;
            }
            return runBatchOnce(chatId, needs, text, { ...readSettings(guarded.signal), items: s.items }, floor, force);
        };
        return Promise.resolve(typeof llm?.runImageTask === 'function' ? llm.runImageTask(input, execute) : execute(input))
            .finally(() => target.release());
    }
    async function runBatchOnce(chatId, needs, text, s, floor, force) {
        const plans = await recover(chatId, async () => {
            const backend = nai?.describe?.(undefined, { signal: s.taskSignal }) || { ready: { ok: true } };
            if (!backend.ready?.ok) return { ok: false, reason: 'backend-unavailable' };
            return planItems(needs, text, s, backend);
        }, floor);
        if (plans?.cancelled) return plans;
        const results = [];
        for (const plan of plans) {
            results.push(await enqueue(itemAssetKeyOf(chatId, plan.need.name), () => generateItem(chatId, plan, s, floor, force)));
        }
        const count = results.filter((r) => r.ok).length;
        const failedCount = results.length - count;
        if (count) report('success', `已生成 ${count} 张物品图`);
        const result = { ok: failedCount === 0, reason: failedCount ? 'generation-failed' : 'done', count, failedCount };
        if (failedCount) result.error = Array.from(new Set(results.filter((r) => !r.ok).map((r) => r.error))).join('；');
        return result;
    }

    // 最新 AI 楼层：本楼标签物品在前、表格物品在后，缺图者每层最多 maxPerFloor 件；同楼并发复用同一任务。
    async function processMessage(messageId) {
        const s = readSettings();
        if (!s.items.enabled) return { ok: true, reason: 'disabled' };
        const floor = messageHost.readFloor(messageId);
        if (!floor || !floor.isAi || !floor.isLatest || !floor.chatId || !String(floor.text || '').trim()) {
            return { ok: true, reason: 'not-eligible' };
        }
        const lockKey = floorKeyOf(floor);
        if (floorLocks.has(lockKey)) return floorLocks.get(lockKey);
        const job = recover(floor.chatId, async () => {
            await cache.ensure(floor.chatId);
            const candidates = mergeItemCandidates(collectTagItems(floor.text), readCatalog());
            const needs = await missingNeeds(floor.chatId, candidates, s.items.maxPerFloor);
            if (!needs.length) return { ok: true, reason: 'nothing-missing', count: 0 };
            return runBatch(floor.chatId, needs, itemContextOf(floor.text, needs), s, floor);
        }, floor).then(result => { if (result.ok && retryTarget?.chatId === floor.chatId && retryTarget?.messageId === Number(messageId)) retryTarget = null; return result; }).catch((error) => {
            if (error.code === 'media-metadata-stale') return { ok: false, reason: 'stale-chat' };
            retryTarget = { chatId: floor.chatId, messageId: Number(messageId) };
            report('error', `物品图处理异常：${(error && error.message) || error}`);
            return { ok: false, reason: 'error', error: '物品图生成失败' };
        }).finally(() => floorLocks.delete(lockKey));
        floorLocks.set(lockKey, job);
        return job;
    }

    // 手动「补全物品图」：只补表格里缺图的物品，单次上限 MANUAL_LIMIT。
    async function fillMissing({ limit = MANUAL_LIMIT } = {}) {
        const s = readSettings();
        if (!s.items.enabled) return { ok: true, reason: 'disabled' };
        const chatId = chatOf();
        if (!chatId) return { ok: false, reason: 'no-chat' };
        await cache.ensure(chatId);
        const cap = Math.max(1, Math.min(Math.trunc(Number(limit)) || MANUAL_LIMIT, MANUAL_LIMIT));
        const needs = await missingNeeds(chatId, readCatalog(), cap);
        if (!needs.length) return { ok: true, reason: 'nothing-missing', count: 0 };
        return runBatch(chatId, needs, '', s, null);
    }

    async function regenerate(name) {
        const s = readSettings();
        if (!s.items.enabled) return { ok: true, reason: 'disabled' };
        const chatId = chatOf();
        const label = String(name || '').trim();
        if (!chatId || !normalizeItemName(label)) return { ok: false, reason: 'invalid-item' };
        await cache.ensure(chatId);
        const previous = await cache.read(chatId, itemAssetKeyOf(chatId, label));
        const fromTable = readCatalog().find((item) => item.key === normalizeItemName(label));
        const need = {
            name: previous ? previous.name : label,
            description: (previous && previous.description) || (fromTable && fromTable.description) || '',
        };
        return runBatch(chatId, [need], '', s, null, true);
    }

    async function discard(name) {
        const chatId = chatOf();
        if (!chatId) return { ok: false, reason: 'no-chat' };
        await cache.ensure(chatId);
        const record = await cache.read(chatId, itemAssetKeyOf(chatId, name));
        if (!record) return { ok: false, reason: 'not-found' };
        const next = { ...record, imageId: '', status: 'discarded', updatedAt: now() };
        await recover(chatId, () => store.putAsset(next), undefined, 'save');
        cache.set(next);
        await cache.dropImage(record.imageId);
        emit({ chatId, key: record.key, name: record.name, reason: 'discarded' });
        return { ok: true, record: next };
    }

    // 同步取图（演出与背包格位用）：只读本地缓存，未命中时异步补载并发事件。
    function imageUrlFor(name, chatId = chatOf()) {
        if (!chatId || !normalizeItemName(name)) return '';
        cache.ensure(chatId);
        const record = recordFor(chatId, name);
        return record && record.status === 'ready' ? cache.imageUrl(record.imageId) : '';
    }

    return {
        processMessage, fillMissing, regenerate, discard, imageUrlFor,
        listItems: (options = {}) => cache.page(chatOf(), { ...options, statuses: ['ready'] }),
        metadataStatus: cache.status,
        async retryMetadata() {
            cache.clear();
            if (!chatOf()) return { ok: true };
            await cache.page(chatOf(), { limit: 1 });
            return retryTarget?.chatId === chatOf() ? processMessage(retryTarget.messageId) : { ok: true };
        },
        start() {
            stopped = false;
            if (recoveryController.signal.aborted) recoveryController = new AbortController();
            if (offRendered) return;
            offRendered = messageHost.on('CHARACTER_MESSAGE_RENDERED', (messageId) => { void processMessage(Number(messageId)); });
        },
        clearCache() { cache.clear(); },
        stop() {
            stopped = true; recoveryController.abort();
            cache.clear();
            if (offRendered) { offRendered(); offRendered = null; }
        },
    };
}


