import { numberParagraphs, formatNumberedParagraphs, insertMarkers } from './marker-placer.js';
import { buildPlannerUserPrompt } from './planner-prompt.js';
import { requestWithSoftRetry, DEFAULT_ASSET_TEMPLATES } from './prompt-kit.js';
import { parseIllustrationPlan } from './planner-parser.js';
import { normalizeAutoIllustrationSettings } from './auto-illustration-settings.js';
import { floorKeyOf } from '../../media/illustration-store.js';
import { stripIllustrationMarkers } from '../../scene/scene-directives.js';

const MARKER_RE = /(?:\[igs-img:\s*(\d+)\s*\]|<IMG>\s*(\d+)\s*<\/IMG>)/gi;

export const ILLUSTRATION_UPDATED_EVENT = 'igs:illustration-updated';
const CACHE_LIMIT = 40;
// 只有这些状态算「本楼已处理完」；failed / stale / 中途刷新残留的 planning 在下次渲染时重试，
// 否则改好 Key 或地址之后，之前失败过的楼层永远不会再发请求。
const SETTLED_STATUSES = new Set(['done']);

function toReadableText(raw) {
    return numberParagraphs(raw).paragraphs.map((p) => p.text).join('\n');
}

export function createAutoIllustrationService(deps) {
    const { messageHost, llm, nai, store, getSettings, events } = deps;
    const random = deps.random || Math.random;
    const now = deps.now || (() => new Date().toISOString());
    const report = deps.report || (() => {});
    const locks = new Map();
    const cache = new Map();
    const hydrated = new Set();
    let offRendered = null;
    let regexesEnsured = false;
    const settings = () => normalizeAutoIllustrationSettings(getSettings ? getSettings() : null);

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

    async function run(messageId, floor, key, s, manual) {
        const previous = await store.getFloor(key);
        const marked = await markedSlots(key, floor.text);
        if (marked.retry.length) {
            const base = { kind: (previous && previous.kind) || 'interlude', want: (previous && previous.want) || marked.all.length };
            report('info', `第 ${messageId} 楼重试 ${marked.retry.length} 张未成功的插图…`);
            return generateSlots(messageId, floor, key, s, base, marked.retry);
        }
        if (marked.all.length) return { ok: true, reason: manual ? 'nothing-missing' : 'already-decided' };
        if (!manual && previous && SETTLED_STATUSES.has(previous.status)) return { ok: true, reason: 'already-decided' };
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
        report('info', `第 ${messageId} 楼开始规划插图（${decision.kind === 'nsfw' ? 'NSFW' : '过场'}），正在请求副 LLM…`);
        await store.putFloor(key, { ...base, status: 'planning', updatedAt: now() });
        let plan;
        try {
            const previousText = messageHost.readPreviousAiTexts(messageId, s.llm.contextFloors)
                .map(toReadableText).join('\n').slice(-1500);
            const user = buildPlannerUserPrompt({
                numberedText: formatNumberedParagraphs(numbered.paragraphs),
                scenes: numbered.scenes, characters: numbered.characters,
                previousText, want: decision.want, exact: decision.exact, isNsfw: numbered.isNsfw,
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
            return { ok: false, reason: 'plan-failed', error: plan.error };
        }

        const latest = messageHost.readFloor(messageId);
        if (!latest || !latest.isAi || !latest.isLatest || latest.chatId !== floor.chatId || latest.swipeId !== floor.swipeId || latest.text !== expected.text) {
            await store.putFloor(key, { ...base, status: 'stale', updatedAt: now() });
            report('warn', `第 ${messageId} 楼在规划期间被修改或已不是最新楼层（可能有其他插件改写了正文），本次放弃生图，下次渲染时重试`);
            return { ok: false, reason: 'stale' };
        }
        await ensureRegexesOnce();
        const written = await messageHost.writeFloor(messageId, insertMarkers(floor.text, numbered.paragraphs, plan.slots), expected);
        if (!written || !written.ok) {
            const stale = written && written.reason === 'stale';
            await store.putFloor(key, { ...base, status: stale ? 'stale' : 'failed', ...(!stale && { error: '无法写回楼层' }), updatedAt: now() });
            report(stale ? 'warn' : 'error', `第 ${messageId} 楼${stale ? '在写回前被修改' : '无法写回插图标记'}，本次放弃生图`);
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
            return { ok: false, reason: 'backend-unavailable', error: backend.ready.error };
        }
        const requests = slots.map(({ status, error, dataUrl, floorKey, key: slotKey, updatedAt, ...request }) => request);
        for (const request of requests) {
            await store.putSlot(key, { ...request, status: 'pending', updatedAt: now() });
            remember(`${key}|${request.slot}`, { status: 'pending', dataUrl: '' });
        }
        let succeeded = 0;
        const errors = [];
        for (const request of requests) {
            let result;
            const meta = { messageId, description: request.description || request.scene, size: s.nai.size };
            try { result = await nai.generate(request, s.nai, meta); }
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

    async function clearIllustration({ chatId, messageId, swipeId, slot } = {}) {
        const floor = {
            chatId: String(chatId == null ? '' : chatId).trim(),
            messageId: Number(messageId),
            swipeId: Number(swipeId || 0),
        };
        const normalizedSlot = Number(slot);
        if (!floor.chatId || !Number.isInteger(floor.messageId) || floor.messageId < 0
            || !Number.isInteger(floor.swipeId) || floor.swipeId < 0
            || !Number.isInteger(normalizedSlot) || normalizedSlot < 1) {
            return { ok: false, reason: 'invalid-identity' };
        }
        if (!store || typeof store.deleteSlot !== 'function') {
            return { ok: false, reason: 'delete-unavailable' };
        }
        const key = floorKeyOf(floor);
        try {
            await store.deleteSlot(key, normalizedSlot);
            cache.delete(`${key}|${normalizedSlot}`);
            emit(floor, normalizedSlot);
            return { ok: true, reason: 'cleared', slot: normalizedSlot };
        } catch (error) {
            return { ok: false, reason: 'delete-failed', error };
        }
    }

    return {
        processMessage, getIllustrationUrl, clearIllustration,
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
