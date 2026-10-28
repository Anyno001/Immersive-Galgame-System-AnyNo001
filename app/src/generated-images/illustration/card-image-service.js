// 卡面图服务：卡组构筑面板「生成卡面」按钮逐张触发，按聊天隔离存入 igs-generated-assets（type: card，键 chatId|card|卡ID）。
// 只有 generate() 发写词与出图请求；imageUrlFor / artFor 只读本地缓存，打开面板、重绘与战斗都不联网。
// 写词、出图、抠图与缓存沿用物品图链路（写词任务 item、出图类型 item、尺寸跟随物品图设置）；卡面不写入 shujuku。
import { requestWithSoftRetry } from './prompt-kit.js';
import { normalizeAutoIllustrationSettings } from './auto-illustration-settings.js';
import { supportsNaiTransparentBackground } from '../request-builders/nai-v4-builder.js';
import { normalizeItemImageSettings } from './item-image-settings.js';
import { createItemRecordCache } from './item-image-cache.js';
import { ITEM_PLANNER_SYSTEM_PROMPT, ITEM_PLANNER_SOFT_SYSTEM_PROMPT, buildItemPlannerUserPrompt, parseItemPlan, buildItemSlot } from './item-prompt.js';
import { inheritImageTaskLease, imageTaskState, bindImageTaskTarget } from '../image-task-runtime.js';

export const CARD_IMAGE_UPDATED_EVENT = 'igs:card-image-updated';
export const CARD_ASSET_TYPE = 'card';

export function cardAssetKeyOf(chatId, cardId) {
    return `${chatId}|card|${String(cardId || '').trim()}`;
}

const errorText = (error) => String((error && error.message) || error || '未知错误');

export function createCardImageService(deps = {}) {
    const { messageHost, llm, nai, store, getSettings, events } = deps;
    const matte = deps.matte || (async (dataUrl) => dataUrl);
    const now = deps.now || (() => new Date().toISOString());
    const report = deps.report || (() => {});
    const newId = deps.newId || (() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
    const emit = (detail) => { if (events && typeof events.emit === 'function') events.emit(CARD_IMAGE_UPDATED_EVENT, detail); };
    const cache = createItemRecordCache({ store, type: CARD_ASSET_TYPE, owner: 'card-records', emit, mediaCache: deps.mediaCache,
        onError: () => report('info', '正在自动恢复卡面记录') });
    // 在途与失败只留本会话内存：同一张卡在途时复用同一任务；失败原因供面板显示，重试成功后清除。
    const inflight = new Map();
    const failures = new Map();
    let queue = Promise.resolve();
    let stopped = false;
    const controller = new AbortController();

    const chatOf = () => String((messageHost && typeof messageHost.getChatId === 'function' ? messageHost.getChatId() : '') || '');
    const readSettings = (signal) => {
        const raw = imageTaskState({ signal })?.config || (typeof getSettings === 'function' ? getSettings() || {} : {});
        return { size: normalizeItemImageSettings(raw.itemImages).size, auto: normalizeAutoIllustrationSettings(raw.autoIllustration),
            itemModel: String((raw.imageApi && raw.imageApi.itemModel) || '').trim(), taskSignal: signal };
    };

    // 同一张卡在途时复用同一任务；任务之间串行，连续点多张时不并发出图。先撤在途标记再 settle，面板重绘即见结果。
    function enqueue(key, task, settle) {
        if (inflight.has(key)) return inflight.get(key);
        const job = queue.then(task, task).catch(failureOf).then((result) => { if (inflight.get(key) === job) inflight.delete(key); return settle(result); });
        queue = job.catch(() => {});
        inflight.set(key, job);
        return job;
    }

    // 写词：活动预设负责完整正文时按编号严格对账并走定稿协议；旧独立调用只拿内容 tag，由本地物品模板拼接。
    async function planCard(need, s, backend, guard) {
        if (backend.ownPrompts) return { ok: true, plan: { need, tags: '' } };
        const ordered = typeof llm.prepareImagePrompt === 'function';
        const final = backend.mode === 'nai' && ordered;
        const transparent = supportsNaiTransparentBackground(s.itemModel || s.auto.nai.model);
        const requirements = buildItemSlot('', { transparent, positiveContext: s.auto.nai.artistPrefix });
        const user = buildItemPlannerUserPrompt([need], '');
        let reply;
        try {
            reply = await requestWithSoftRetry(llm, {
                signal: s.taskSignal || controller.signal, shouldStart: guard,
                system: ITEM_PLANNER_SYSTEM_PROMPT, softSystem: ITEM_PLANNER_SOFT_SYSTEM_PROMPT, user,
                imagePrompt: { task: 'item', input: { description: user,
                    ...(final && { userPrompts: { positive: requirements.scene, negative: requirements.sceneUc },
                        writingRequirements: { size: s.size, transparent } }),
                    outputs: { format: 'asset-plan', items: [{ id: 'ch1', type: 'item' }] } } },
                parse: (text) => parseItemPlan(text, [need], { strict: ordered }),
            }, s.auto.llm);
        } catch (error) {
            return { ok: false, reason: 'card-prompt-write-failed', error: `卡面写词失败：${errorText(error)}` };
        }
        if (reply?.reason === 'request-stale') return { ok: false, cancelled: true, reason: 'request-stale' };
        if (!reply?.ok) return { ok: false, reason: reply?.reason || 'card-prompt-write-failed', error: reply?.error || '卡面写词失败，未继续绘图' };
        const plan = (reply.items || []).find((item) => item.need === need && !item.error);
        if (!plan) return { ok: false, reason: 'card-plan-incomplete', error: '副 LLM 未给出卡面 tag' };
        return { ok: true, plan: final ? inheritImageTaskLease(plan, { ...plan, captionMode: 'final', transparent }) : plan };
    }
    const STALE = Object.freeze({ ok: false, cancelled: true, reason: 'request-stale' });
    function failureOf(error) {
        return { ok: false, reason: 'card-image-failed', error: `卡面生成异常：${errorText(error)}` };
    }

    // 出图与入库：先写图片、再写记录、最后删旧图；任一步失败都不动已可用的旧卡面。
    async function paintCard(chatId, need, plan, s, guard) {
        const key = cardAssetKeyOf(chatId, need.cardId);
        const previous = await cache.read(chatId, key);
        const via = typeof nai.describe === 'function' ? nai.describe(undefined, { signal: s.taskSignal })?.via : 'nai';
        const final = plan.captionMode === 'final';
        // 智绘姬 / 柏宝绘出图不保证透明底：与物品图相同，走它们时按非透明底出图。
        const transparent = final ? plan.transparent
            : via !== 'chatu8' && via !== 'baibai' && supportsNaiTransparentBackground(s.itemModel || s.auto.nai.model);
        const slot = inheritImageTaskLease(plan, buildItemSlot(plan.tags, { transparent, uc: plan.uc,
            positiveContext: s.auto.nai.artistPrefix, final }));
        const meta = { size: s.size, imageKind: 'item', signal: s.taskSignal || controller.signal, shouldStart: guard,
            description: `卡牌：${need.name}${need.description ? `，${need.description}` : ''}`,
            ...(!final && { userPrompts: { positive: slot.scene, negative: slot.sceneUc } }) };
        let result;
        try { result = await nai.generate(slot, { ...s.auto.nai, size: s.size }, meta); }
        catch (error) { result = { ok: false, error: `NAI 生成失败：${errorText(error)}` }; }
        if (!guard()) return STALE;
        if (!result || !result.ok || !result.dataUrl) {
            return { ok: false, reason: (result && result.reason) || 'card-image-failed', error: (result && result.error) || 'NAI 生成失败' };
        }
        const dataUrl = await matte(result.dataUrl, { alreadyTransparent: transparent });
        if (!guard()) return STALE;
        const imageId = newId(), createdAt = now();
        await store.putImage({ id: imageId, dataUrl, type: CARD_ASSET_TYPE, createdAt });
        cache.rememberImage(imageId, dataUrl);
        const record = { key, chatId, type: CARD_ASSET_TYPE, name: need.name, cardId: need.cardId, description: need.description,
            tags: plan.tags || '', floorKey: '', status: 'ready', imageId, createdAt };
        await store.putAsset(record);
        cache.set(record);
        // 生成成功立即登记，取图不必等索引重读；索引未就绪时随后的分页读取同样会读到这条记录。
        if (index.chatId !== chatId) index = emptyIndex(chatId);
        index.images.set(key, imageId);
        if (previous && previous.imageId && previous.imageId !== imageId) {
            try { await cache.dropImage(previous.imageId); } catch (error) { /* 旧图删除失败只留下未引用图片，不影响新卡面 */ }
        }
        return { ok: true, record };
    }
    // 本聊天已有卡面的索引：首次取图时分页读一次 ready 记录（只读本地），之后随生成结果增量更新；
    // 未登记的卡直接判定无图，不逐卡反复查库，也不因缺图记录触发周期性重绘。
    const MAX_INDEX_PAGES = 20;
    const emptyIndex = (chatId = '') => ({ chatId, ready: false, loading: null, images: new Map() });
    let index = emptyIndex();
    function useIndex(chatId) {
        if (index.chatId !== chatId) index = emptyIndex(chatId);
        const mine = index;
        if (mine.ready || mine.loading) return mine;
        mine.loading = (async () => {
            let afterKey = '';
            for (let page = 0; page < MAX_INDEX_PAGES; page += 1) {
                const result = await cache.page(chatId, { statuses: ['ready'], limit: 100, ...(afterKey ? { afterKey } : {}) });
                for (const record of result.records) if (record.imageId) mine.images.set(record.key, record.imageId);
                if (!result.hasNext || !result.lastKey) break;
                afterKey = result.lastKey;
            }
            mine.ready = true;
        })().catch(() => { /* 读取失败保持未就绪，下次取图时重试；不发事件，避免重绘循环 */ }).finally(() => {
            mine.loading = null;
            if (index === mine && mine.ready && !stopped) emit({ chatId, reason: 'index-loaded' });
        });
        return mine;
    }

    // 单张卡面任务：绑定当前聊天（换聊天即作废），经生图任务租约读取当次配置，写词与出图各一次。
    async function runOnce(chatId, need) {
        const subscribe = messageHost && typeof messageHost.on === 'function' ? messageHost.on.bind(messageHost) : undefined;
        const target = bindImageTaskTarget({ signal: controller.signal, subscribe, isCurrent: () => !stopped && chatId === chatOf() });
        const execute = async (guarded) => {
            const guard = () => !stopped && target.shouldStart() && !guarded.signal?.aborted
                && (typeof guarded.shouldStart !== 'function' || guarded.shouldStart());
            if (typeof nai.waitUntilReady === 'function') {
                const ready = await nai.waitUntilReady(guarded);
                if (!guard()) return STALE;
                if (!ready?.ok) return { ok: false, reason: ready?.reason || 'card-backend-unavailable', error: ready?.error || '生图后端未就绪' };
            }
            if (!guard()) return STALE;
            const s = readSettings(guarded.signal);
            const backend = (typeof nai.describe === 'function' && nai.describe(undefined, { signal: s.taskSignal })) || { ready: { ok: true } };
            if (!backend.ready?.ok) return { ok: false, reason: 'card-backend-unavailable', error: backend.ready?.error || '生图后端不可用' };
            const planned = await planCard(need, s, backend, guard);
            if (!planned.ok) return planned;
            if (!guard()) return STALE;
            return paintCard(chatId, need, planned.plan, s, guard);
        };
        const input = { signal: target.signal, shouldStart: target.shouldStart };
        try { return await (typeof llm.runImageTask === 'function' ? llm.runImageTask(input, execute) : execute(input)); }
        finally { target.release(); }
    }

    // 结算：失败原因按卡记入内存供面板显示（取消与已换聊天不记），并发事件让面板重绘。
    function settle(chatId, key, need, result) {
        const r = result && typeof result === 'object' ? result : failureOf('');
        if (r.ok) failures.delete(key);
        else if (!r.cancelled && !stopped && chatId === chatOf()) {
            failures.set(key, r.error || '卡面生成失败');
            report('error', `卡面「${need.name}」生成失败：${r.error || '未知原因'}`);
        }
        emit({ chatId, key, cardId: need.cardId, reason: r.ok ? 'generated' : r.cancelled ? 'cancelled' : 'failed' });
        if (r.ok) return { ok: true, cardId: need.cardId };
        return { ok: false, reason: r.reason || 'card-image-failed', error: r.error || '', ...(r.cancelled ? { cancelled: true } : {}) };
    }

    // 「生成卡面」按钮：一次点击只为这一张卡写词、出图各请求一次；已有卡面时重画，失败时保留旧图。
    function generate(card = {}) {
        const chatId = chatOf();
        const cardId = String((card && card.cardId) || '').trim();
        const name = String((card && card.name) || '').trim();
        if (stopped) return Promise.resolve({ ok: false, reason: 'card-image-stopped' });
        if (!chatId) return Promise.resolve({ ok: false, reason: 'no-chat' });
        if (!cardId || !name) return Promise.resolve({ ok: false, reason: 'card-art-invalid' });
        if (!llm || !nai || typeof nai.generate !== 'function' || !store) return Promise.resolve({ ok: false, reason: 'card-image-unavailable' });
        const key = cardAssetKeyOf(chatId, cardId);
        if (inflight.has(key)) return inflight.get(key);
        const need = { cardId, name, description: String((card && card.description) || '').trim() };
        failures.delete(key);
        const job = enqueue(key, () => runOnce(chatId, need), (result) => settle(chatId, key, need, result));
        emit({ chatId, key, cardId, reason: 'pending' });
        return job;
    }

    // 同步取图（构筑面板与战斗手牌用）：只读本地索引与图片缓存；图片未载入时后台补载，补完发 CARD_IMAGE_UPDATED_EVENT。
    function imageUrlFor(cardId, chatId = chatOf()) {
        const id = String(cardId || '').trim();
        if (stopped || !chatId || !id) return '';
        const imageId = useIndex(chatId).images.get(cardAssetKeyOf(chatId, id));
        return imageId ? cache.imageUrl(imageId) : '';
    }

    // 构筑面板每张卡的卡面状态：本地图片地址（可能为空）、是否生成中、上次失败原因。
    function stateFor(cardId, chatId = chatOf()) {
        const id = String(cardId || '').trim();
        const key = cardAssetKeyOf(chatId, id);
        const scoped = Boolean(chatId && id);
        return { url: imageUrlFor(id, chatId), pending: scoped && inflight.has(key), error: (scoped && failures.get(key)) || '' };
    }

    return {
        generate, imageUrlFor, stateFor,
        stop() {
            stopped = true;
            try { controller.abort(); } catch (error) { /* 已中止 */ }
            inflight.clear(); failures.clear();
            index = emptyIndex();
            cache.clear();
        },
    };
}




