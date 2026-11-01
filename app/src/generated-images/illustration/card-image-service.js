// 卡面图片服务：为战斗卡牌生成并缓存卡面图（物品图管线的卡牌版本）。
// 流程：串行队列 -> 等待生图后端 -> 副 LLM 写卡面 tag -> NAI 出图 -> 抠图 -> 写入图片库与资产记录。
// 同一聊天同一张卡的并发请求共用一个 Promise；stop() 后全部请求作废。
// 按聊天懒加载「卡 key -> 图片 id」索引，供 imageUrlFor 同步取图。
import { requestWithSoftRetry } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings } from './auto-illustration-settings.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { normalizeItemImageSettings } from './item-image-settings.js';
import { createItemRecordCache } from './item-image-cache.js';
import { ITEM_PLANNER_SYSTEM_PROMPT, ITEM_PLANNER_SOFT_SYSTEM_PROMPT, buildItemPlannerUserPrompt, parseItemPlan, buildItemSlot } from './item-prompt.js';
import { inheritImageTaskLease, imageTaskState, bindImageTaskTarget } from '../image-task-runtime.js';

export const CARD_IMAGE_UPDATED_EVENT = 'igs:card-image-updated';
export const CARD_ASSET_TYPE = 'card';

// 资产 key：聊天 id + card + 卡 id
export function cardAssetKeyOf(chatId, cardId) {
    return `${chatId}|card|${String(cardId || '').trim()}`;
}

const errorText = (error) => String((error && error.message) || error || '未知错误');
// 请求被中止/过期时的统一返回
const STALE_RESULT = Object.freeze({ ok: false, cancelled: true, reason: 'request-stale' });
const failureResult = (error) => ({ ok: false, reason: 'card-image-failed', error: `卡面生成异常：${errorText(error)}` });
// 索引分页加载的最大页数（每页 100 条）
const INDEX_MAX_PAGES = 20;
const newIndex = (chatId = '') => ({ chatId, ready: false, loading: null, images: new Map() });

export function createCardImageService(options = {}) {
    const { messageHost, llm, nai, store, getSettings, events } = options;
    const matte = options.matte || (async (dataUrl) => dataUrl);
    const now = options.now || (() => new Date().toISOString());
    const report = options.report || (() => {});
    const newId = options.newId || (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const emit = (detail) => {
        if (events && typeof events.emit === 'function') events.emit(CARD_IMAGE_UPDATED_EVENT, detail);
    };
    const cache = createItemRecordCache({
        store,
        type: CARD_ASSET_TYPE,
        owner: 'card-records',
        emit,
        mediaCache: options.mediaCache,
        onError: () => report('info', '正在自动恢复卡面记录'),
    });
    const inflight = new Map(); // key -> 进行中的 Promise
    const lastErrors = new Map(); // key -> 最近一次失败原因
    let queue = Promise.resolve(); // 全局串行队列
    let stopped = false;
    const abortController = new AbortController();
    const currentChatId = () => String((messageHost && typeof messageHost.getChatId === 'function' ? messageHost.getChatId() : '') || '');

    // 读取本次任务的设置快照：优先用任务租约里的配置，其次实时配置
    const settingsSnapshot = (taskSignal) => {
        const config = imageTaskState({ signal: taskSignal })?.config || (typeof getSettings === 'function' ? getSettings() || {} : {});
        return {
            size: normalizeItemImageSettings(config.itemImages).size,
            auto: normalizeAutoIllustrationSettings(config.autoIllustration),
            itemModel: String((config.imageApi && config.imageApi.itemModel) || '').trim(),
            taskSignal,
        };
    };

    // 入队：同 key 已在进行直接复用；前一个任务无论成败都继续排下一个
    function enqueue(key, run, finalize) {
        if (inflight.has(key)) return inflight.get(key);
        const task = queue.then(run, run).catch(failureResult).then((result) => {
            if (inflight.get(key) === task) inflight.delete(key);
            return finalize(result);
        });
        queue = task.catch(() => {});
        inflight.set(key, task);
        return task;
    }

    // 副 LLM 写卡面 tag。后端自带提示词（ownPrompts）时跳过。
    async function planCard(card, settings, backend, shouldStart) {
        if (backend.ownPrompts) return { ok: true, plan: { need: card, tags: '' } };
        const canPrepare = typeof llm.prepareImagePrompt === 'function';
        const useFinalCaption = backend.mode === 'nai' && canPrepare;
        const transparent = supportsNaiTransparentBackground(settings.itemModel || settings.auto.nai.model);
        const slot = buildItemSlot('', { transparent, positiveContext: settings.auto.nai.artistPrefix });
        const userPrompt = buildItemPlannerUserPrompt([card], '');
        let reply;
        try {
            reply = await requestWithSoftRetry(llm, {
                signal: settings.taskSignal || abortController.signal,
                shouldStart,
                system: ITEM_PLANNER_SYSTEM_PROMPT,
                softSystem: ITEM_PLANNER_SOFT_SYSTEM_PROMPT,
                user: userPrompt,
                imagePrompt: {
                    task: 'item',
                    input: {
                        description: userPrompt,
                        ...(useFinalCaption && {
                            userPrompts: { positive: slot.scene, negative: slot.sceneUc },
                            writingRequirements: { size: settings.size, transparent },
                        }),
                        outputs: { format: 'asset-plan', items: [{ id: 'ch1', type: 'item' }] },
                    },
                },
                parse: (text) => parseItemPlan(text, [card], { strict: canPrepare }),
            }, settings.auto.llm);
        } catch (error) {
            return { ok: false, reason: 'card-prompt-write-failed', error: `卡面写词失败：${errorText(error)}` };
        }
        if (reply?.reason === 'request-stale') return { ok: false, cancelled: true, reason: 'request-stale' };
        if (!reply?.ok) return { ok: false, reason: reply?.reason || 'card-prompt-write-failed', error: reply?.error || '卡面写词失败，未继续绘图' };
        const item = (reply.items || []).find((candidate) => candidate.need === card && !candidate.error);
        if (!item) return { ok: false, reason: 'card-plan-incomplete', error: '副 LLM 未给出卡面 tag' };
        return { ok: true, plan: useFinalCaption ? inheritImageTaskLease(item, { ...item, captionMode: 'final', transparent }) : item };
    }

    // 出图：NAI 生成 -> 抠图 -> 存图片库与资产记录 -> 更新索引，并清掉该卡的旧图
    async function generateImage(chatId, card, plan, settings, shouldStart) {
        const key = cardAssetKeyOf(chatId, card.cardId);
        const previous = await cache.read(chatId, key);
        const via = typeof nai.describe === 'function' ? nai.describe(undefined, { signal: settings.taskSignal })?.via : 'nai';
        const isFinal = plan.captionMode === 'final';
        // 透明背景：final 模式沿用写词时的判定；否则 chatu8 / baibai 后端不走 NAI 透明
        const transparent = isFinal ? plan.transparent : via !== 'chatu8' && via !== 'baibai' && supportsNaiTransparentBackground(settings.itemModel || settings.auto.nai.model);
        const slot = inheritImageTaskLease(plan, buildItemSlot(plan.tags, { transparent, uc: plan.uc, positiveContext: settings.auto.nai.artistPrefix, final: isFinal }));
        const generateOptions = {
            size: settings.size,
            imageKind: 'item',
            signal: settings.taskSignal || abortController.signal,
            shouldStart,
            description: `卡牌：${card.name}${card.description ? `，${card.description}` : ''}`,
            ...(!isFinal && { userPrompts: { positive: slot.scene, negative: slot.sceneUc } }),
        };
        let generated;
        try {
            generated = await nai.generate(slot, { ...settings.auto.nai, size: settings.size }, generateOptions);
        } catch (error) {
            generated = { ok: false, error: `NAI 生成失败：${errorText(error)}` };
        }
        if (!shouldStart()) return STALE_RESULT;
        if (!generated || !generated.ok || !generated.dataUrl) {
            return { ok: false, reason: (generated && generated.reason) || 'card-image-failed', error: (generated && generated.error) || 'NAI 生成失败' };
        }
        const dataUrl = await matte(generated.dataUrl, { alreadyTransparent: transparent });
        if (!shouldStart()) return STALE_RESULT;
        const imageId = newId();
        const createdAt = now();
        await store.putImage({ id: imageId, dataUrl, type: CARD_ASSET_TYPE, createdAt });
        cache.rememberImage(imageId, dataUrl);
        const record = {
            key,
            chatId,
            type: CARD_ASSET_TYPE,
            name: card.name,
            cardId: card.cardId,
            description: card.description,
            tags: plan.tags || '',
            floorKey: '',
            status: 'ready',
            imageId,
            createdAt,
        };
        await store.putAsset(record);
        cache.set(record);
        if (index.chatId !== chatId) index = newIndex(chatId);
        index.images.set(key, imageId);
        // 新图落库后再删旧图；删除失败不影响结果
        if (previous && previous.imageId && previous.imageId !== imageId) {
            try {
                await cache.dropImage(previous.imageId);
            } catch {
                // 旧图残留由缓存回收处理
            }
        }
        return { ok: true, record };
    }

    // 卡 key -> 图片 id 的索引（当前聊天）
    let index = newIndex();

    // 懒加载当前聊天的索引（分页读取 ready 记录）；加载完成发 index-loaded 事件
    function loadIndex(chatId) {
        if (index.chatId !== chatId) index = newIndex(chatId);
        const current = index;
        if (!current.ready && !current.loading) {
            current.loading = (async () => {
                let afterKey = '';
                for (let page = 0; page < INDEX_MAX_PAGES; page += 1) {
                    const result = await cache.page(chatId, { statuses: ['ready'], limit: 100, ...(afterKey ? { afterKey } : {}) });
                    for (const record of result.records) {
                        if (record.imageId) current.images.set(record.key, record.imageId);
                    }
                    if (!result.hasNext || !result.lastKey) break;
                    afterKey = result.lastKey;
                }
                current.ready = true;
            })().catch(() => {}).finally(() => {
                current.loading = null;
                if (index === current && current.ready && !stopped) emit({ chatId, reason: 'index-loaded' });
            });
        }
        return current;
    }

    // 单张卡的完整任务：等后端 -> 写词 -> 出图。任何一步发现已过期（停止/换聊天/被中止）即返回 STALE_RESULT。
    async function runCard(chatId, card) {
        const subscribe = messageHost && typeof messageHost.on === 'function' ? messageHost.on.bind(messageHost) : undefined;
        const target = bindImageTaskTarget({ signal: abortController.signal, subscribe, isCurrent: () => !stopped && chatId === currentChatId() });
        const task = async (lease) => {
            const shouldStart = () => !stopped && target.shouldStart() && !lease.signal?.aborted && (typeof lease.shouldStart !== 'function' || lease.shouldStart());
            if (typeof nai.waitUntilReady === 'function') {
                const ready = await nai.waitUntilReady(lease);
                if (!shouldStart()) return STALE_RESULT;
                if (!ready?.ok) return { ok: false, reason: ready?.reason || 'card-backend-unavailable', error: ready?.error || '生图后端未就绪' };
            }
            if (!shouldStart()) return STALE_RESULT;
            const settings = settingsSnapshot(lease.signal);
            const backend = (typeof nai.describe === 'function' && nai.describe(undefined, { signal: settings.taskSignal })) || { ready: { ok: true } };
            if (!backend.ready?.ok) return { ok: false, reason: 'card-backend-unavailable', error: backend.ready?.error || '生图后端不可用' };
            const planned = await planCard(card, settings, backend, shouldStart);
            if (!planned.ok) return planned;
            return shouldStart() ? generateImage(chatId, card, planned.plan, settings, shouldStart) : STALE_RESULT;
        };
        const lease = { signal: target.signal, shouldStart: target.shouldStart };
        try {
            return await (typeof llm.runImageTask === 'function' ? llm.runImageTask(lease, task) : task(lease));
        } finally {
            target.release();
        }
    }

    // 任务收尾：成功清错误；失败记录错误并上报（取消/停止/已换聊天不报）；统一发更新事件
    function finalize(chatId, key, card, result) {
        const outcome = result && typeof result === 'object' ? result : failureResult('');
        if (outcome.ok) {
            lastErrors.delete(key);
        } else if (!outcome.cancelled && !stopped && chatId === currentChatId()) {
            lastErrors.set(key, outcome.error || '卡面生成失败');
            report('error', `卡面「${card.name}」生成失败：${outcome.error || '未知原因'}`);
        }
        emit({ chatId, key, cardId: card.cardId, reason: outcome.ok ? 'generated' : outcome.cancelled ? 'cancelled' : 'failed' });
        return outcome.ok
            ? { ok: true, cardId: card.cardId }
            : { ok: false, reason: outcome.reason || 'card-image-failed', error: outcome.error || '', ...(outcome.cancelled ? { cancelled: true } : {}) };
    }

    // 生成一张卡的卡面。参数：{ cardId, name, description }
    function generate(input = {}) {
        const chatId = currentChatId();
        const cardId = String((input && input.cardId) || '').trim();
        const name = String((input && input.name) || '').trim();
        if (stopped) return Promise.resolve({ ok: false, reason: 'card-image-stopped' });
        if (!chatId) return Promise.resolve({ ok: false, reason: 'no-chat' });
        if (!cardId || !name) return Promise.resolve({ ok: false, reason: 'card-art-invalid' });
        if (!llm || !nai || typeof nai.generate !== 'function' || !store) return Promise.resolve({ ok: false, reason: 'card-image-unavailable' });
        const key = cardAssetKeyOf(chatId, cardId);
        if (inflight.has(key)) return inflight.get(key);
        const card = { cardId, name, description: String((input && input.description) || '').trim() };
        lastErrors.delete(key);
        const task = enqueue(key, () => runCard(chatId, card), (result) => finalize(chatId, key, card, result));
        emit({ chatId, key, cardId, reason: 'pending' });
        return task;
    }

    // 同步取卡面图地址；索引未就绪时先触发加载并返回空串
    function imageUrlFor(cardId, chatId = currentChatId()) {
        const id = String(cardId || '').trim();
        if (stopped || !chatId || !id) return '';
        const imageId = loadIndex(chatId).images.get(cardAssetKeyOf(chatId, id));
        return imageId ? cache.imageUrl(imageId) : '';
    }

    // 卡面当前状态：图片地址、是否生成中、最近错误
    function stateFor(cardId, chatId = currentChatId()) {
        const id = String(cardId || '').trim();
        const key = cardAssetKeyOf(chatId, id);
        const valid = !!(chatId && id);
        return { url: imageUrlFor(id, chatId), pending: valid && inflight.has(key), error: (valid && lastErrors.get(key)) || '' };
    }

    return {
        generate,
        imageUrlFor,
        stateFor,
        stop() {
            stopped = true;
            try {
                abortController.abort();
            } catch {
                // 已中止则忽略
            }
            inflight.clear();
            lastErrors.clear();
            index = newIndex();
            cache.clear();
        },
    };
}
