// 物品图服务：表格物品 + 本楼 [igs-fx:item] → 缺图物品按聊天隔离生成，存入 igs-generated-assets（type: item）。
// 关闭时入口短路：不读表、不发请求。记录用独立状态 ready，不进入素材补全的审核弹窗与临时素材列表。
import { requestWithSoftRetry } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings } from './auto-illustration-settings.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { numberParagraphs } from './marker-placer.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { extractFxDirectives } from '../../scene/fx-directives.js';
import { buildItemCatalog, normalizeItemName } from '../../data/shujuku/item-catalog.js';
import { normalizeItemImageSettings } from './item-image-settings.js';
import { createItemRecordCache } from './item-image-cache.js';
import { ITEM_PLANNER_SYSTEM_PROMPT, ITEM_PLANNER_SOFT_SYSTEM_PROMPT, buildItemPlannerUserPrompt, parseItemPlan, buildFallbackItemPlan, buildItemSlot } from './item-prompt.js';

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

export function createItemImageService(deps) {
    const { messageHost, llm, nai, store, getSettings, events, readTables } = deps;
    const matte = deps.matte || (async (dataUrl) => dataUrl);
    const now = deps.now || (() => new Date().toISOString());
    const report = deps.report || (() => {});
    const newId = deps.newId || (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const emit = (detail) => { if (events && typeof events.emit === 'function') events.emit(ITEM_IMAGE_UPDATED_EVENT, detail); };
    const cache = createItemRecordCache({ store, type: ITEM_ASSET_TYPE, emit });
    const floorLocks = new Map();
    const inflight = new Map();
    let queue = Promise.resolve();
    let offRendered = null;

    const readSettings = () => {
        const raw = getSettings ? getSettings() || {} : {};
        return { items: normalizeItemImageSettings(raw.itemImages), auto: normalizeAutoIllustrationSettings(raw.autoIllustration) };
    };

    const chatOf = () => (messageHost.getChatId ? messageHost.getChatId() : '');
    const recordFor = (chatId, name) => cache.get(chatId, itemAssetKeyOf(chatId, name));
    const readableOf = (text) => numberParagraphs(text).paragraphs.map((p) => p.text).join('\n').slice(0, 3000);

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

    // 数据库生图插件自己写提示词；否则副 LLM 写 tag，缺项或整体失败时逐项本地兜底。
    async function planItems(needs, text, s, backend) {
        if (backend.ownPrompts) return needs.map((need) => ({ need, tags: '' }));
        let planned = [];
        try {
            const plan = await requestWithSoftRetry(llm, {
                system: ITEM_PLANNER_SYSTEM_PROMPT,
                softSystem: ITEM_PLANNER_SOFT_SYSTEM_PROMPT,
                user: buildItemPlannerUserPrompt(needs, text),
                parse: (reply) => parseItemPlan(reply, needs),
            }, s.auto.llm);
            if (plan && plan.ok) planned = plan.items;
        } catch (error) {
            report('warn', '物品图规划失败，改用本地兜底');
        }
        return needs.map((need) => planned.find((item) => item.need === need) || buildFallbackItemPlan(need));
    }


    // 生成单件；重画失败时保留原图，不覆盖已可用的记录。
    async function generateItem(chatId, plan, s, floor) {
        const need = plan.need;
        const key = itemAssetKeyOf(chatId, need.name);
        const previous = recordFor(chatId, need.name);
        const base = { key, chatId, type: ITEM_ASSET_TYPE, name: need.name, description: need.description || '', tags: plan.tags || '',
            floorKey: floor ? floorKeyOf(floor) : '', messageId: floor ? floor.messageId : null, swipeId: floor ? floor.swipeId : null, createdAt: now() };
        let error = plan.error || '';
        let record = null;
        if (!error) {
            // 智绘姬出图不保证透明底：走智绘姬时按非透明底出图，不信任 NAI 模型的原生透明能力。
            const plannedVia = nai && typeof nai.describe === 'function' ? nai.describe().via : 'nai';
            const transparent = plannedVia !== 'chatu8' && supportsNaiTransparentBackground(s.auto.nai.model);
            const slot = buildItemSlot(plan.tags, { transparent, uc: plan.uc });
            const meta = { messageId: floor ? floor.messageId : undefined, size: s.items.size,
                description: `物品：${need.name}${need.description ? `，${need.description}` : ''}`, userPrompts: { positive: slot.scene, negative: slot.sceneUc } };
            let result;
            try { result = await nai.generate(slot, { ...s.auto.nai, size: s.items.size }, meta); }
            catch (e) { result = { ok: false, error: `NAI 生成失败：${(e && e.message) || e}` }; }
            if (result && result.ok && result.dataUrl) {
                const dataUrl = await matte(result.dataUrl, { alreadyTransparent: transparent });
                const imageId = newId();
                await store.putImage({ id: imageId, dataUrl, type: ITEM_ASSET_TYPE, createdAt: base.createdAt });
                cache.rememberImage(imageId, dataUrl);
                record = { ...base, imageId, status: 'ready' };
            } else error = (result && result.error) || 'NAI 生成失败';
        }
        if (!record) {
            report('error', `物品「${need.name}」生图失败：${error}`);
            if (previous && previous.status === 'ready') return { ok: false, error, record: previous };
            record = { ...base, imageId: '', status: 'failed', error };
        }
        if (record.status === 'ready' && previous && previous.imageId) await cache.dropImage(previous.imageId);
        await store.putAsset(record);
        cache.set(record);
        emit({ chatId, key, name: need.name, reason: record.status === 'ready' ? 'generated' : 'failed' });
        return { ok: record.status === 'ready', error, record };
    }

    function missingNeeds(chatId, candidates, limit) {
        return candidates.filter((item) => {
            const record = recordFor(chatId, item.name);
            return !record || !SETTLED_STATUSES.has(record.status);
        }).slice(0, limit);
    }

    async function runBatch(chatId, needs, text, s, floor) {
        const backend = nai && typeof nai.describe === 'function' ? nai.describe() : { ready: { ok: true } };
        if (!backend.ready || !backend.ready.ok) {
            const error = (backend.ready && backend.ready.error) || '生图后端未就绪';
            report('error', `物品图未开始：${error}`);
            return { ok: false, reason: 'backend-unavailable', error, count: 0 };
        }
        const plans = await planItems(needs, text, s, backend);
        const results = [];
        for (const plan of plans) {
            results.push(await enqueue(itemAssetKeyOf(chatId, plan.need.name), () => generateItem(chatId, plan, s, floor)));
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
        const job = (async () => {
            await cache.ensure(floor.chatId);
            const candidates = mergeItemCandidates(collectTagItems(floor.text), readCatalog());
            const needs = missingNeeds(floor.chatId, candidates, s.items.maxPerFloor);
            if (!needs.length) return { ok: true, reason: 'nothing-missing', count: 0 };
            return runBatch(floor.chatId, needs, readableOf(floor.text), s, floor);
        })().catch((error) => {
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
        const needs = missingNeeds(chatId, readCatalog(), cap);
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
        const previous = recordFor(chatId, label);
        const fromTable = readCatalog().find((item) => item.key === normalizeItemName(label));
        const need = {
            name: previous ? previous.name : label,
            description: (previous && previous.description) || (fromTable && fromTable.description) || '',
        };
        return runBatch(chatId, [need], '', s, null);
    }

    async function discard(name) {
        const chatId = chatOf();
        if (!chatId) return { ok: false, reason: 'no-chat' };
        await cache.ensure(chatId);
        const record = recordFor(chatId, name);
        if (!record) return { ok: false, reason: 'not-found' };
        await cache.dropImage(record.imageId);
        const next = { ...record, imageId: '', status: 'discarded', updatedAt: now() };
        await store.putAsset(next);
        cache.set(next);
        emit({ chatId, key: record.key, name: record.name, reason: 'discarded' });
        return { ok: true, record: next };
    }

    // 同步取图（演出与背包格位用）：只读本地缓存，未命中时异步补载并发事件。
    function imageUrlFor(name, chatId = chatOf()) {
        if (!chatId || !normalizeItemName(name)) return '';
        void cache.ensure(chatId);
        const record = recordFor(chatId, name);
        return record && record.status === 'ready' ? cache.imageUrl(record.imageId) : '';
    }

    return {
        processMessage, fillMissing, regenerate, discard, imageUrlFor,
        listItems: () => cache.list(chatOf()).filter((record) => record.status === 'ready'),
        start() {
            if (offRendered) return;
            offRendered = messageHost.on('CHARACTER_MESSAGE_RENDERED', (messageId) => { void processMessage(Number(messageId)); });
        },
        stop() {
            if (offRendered) { offRendered(); offRendered = null; }
        },
    };
}


