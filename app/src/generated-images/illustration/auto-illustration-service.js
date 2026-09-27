import { numberParagraphs, formatNumberedParagraphs, insertMarkers } from './marker-placer.js';
import { PLANNER_SYSTEM_PROMPT, PLANNER_SOFT_SYSTEM_PROMPT, buildPlannerUserPrompt } from './planner-prompt.js';
import { requestWithSoftRetry, DEFAULT_ASSET_TEMPLATES } from './prompt-kit.js';
import { parseIllustrationPlan } from './planner-parser.js';
import { normalizeAutoIllustrationSettings } from './auto-illustration-settings.js';
import { floorKeyOf } from '../../media/illustration-store.js';

export const ILLUSTRATION_UPDATED_EVENT = 'igs:illustration-updated';
const CACHE_LIMIT = 40;

function toReadableText(raw) {
    return numberParagraphs(raw).paragraphs.map((p) => p.text).join('\n');
}

export function createAutoIllustrationService(deps) {
    const { messageHost, llm, nai, store, getSettings, events } = deps;
    const random = deps.random || Math.random;
    const now = deps.now || (() => new Date().toISOString());
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

    function decide(s, isNsfw) {
        if (isNsfw) return s.nsfwEnabled ? { kind: 'nsfw', want: s.nsfwCount, exact: true } : null;
        if (s.interludeEnabled && random() * 100 < s.interludeProbability) {
            return { kind: 'interlude', want: s.interludeMaxCount, exact: false };
        }
        return null;
    }

    async function ensureRegexesOnce() {
        if (regexesEnsured) return;
        try { regexesEnsured = (await messageHost.ensureMarkerRegexes()).ok === true; } catch (error) { regexesEnsured = false; }
    }

    async function run(messageId, floor, key, s) {
        if (await store.getFloor(key)) return { ok: true, reason: 'already-decided' };
        const numbered = numberParagraphs(floor.text);
        const decision = numbered.paragraphs.length ? decide(s, numbered.isNsfw) : null;
        if (!decision) {
            await store.putFloor(key, { kind: 'none', status: 'done', updatedAt: now() });
            return { ok: true, reason: 'not-selected' };
        }
        const base = { kind: decision.kind, want: decision.want };
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
                system: PLANNER_SYSTEM_PROMPT,
                softSystem: numbered.isNsfw ? PLANNER_SOFT_SYSTEM_PROMPT : '',
                user,
                parse: (reply) => parseIllustrationPlan(reply, { maxSlots: decision.want, paragraphCount: numbered.paragraphs.length }),
            }, s.llm);
            // 温和模式下 LLM 只给了构图，露骨 tag 在本地补上，不经过 LLM。
            if (plan.ok && plan.soft) {
                const extra = s.assets.templates.nsfwExtra || DEFAULT_ASSET_TEMPLATES.nsfwExtra;
                plan.slots = plan.slots.map((slot) => ({ ...slot, scene: [extra, slot.scene].filter(Boolean).join(', ') }));
            }
        } catch (error) {
            plan = { ok: false, error: '副 LLM 规划失败' };
        }
        if (plan.ok && decision.exact && plan.slots.length !== decision.want) {
            plan = { ok: false, error: '副 LLM 未返回设定的插图张数' };
        }
        if (!plan.ok) {
            await store.putFloor(key, { ...base, status: 'failed', error: plan.error, updatedAt: now() });
            return { ok: false, reason: 'plan-failed', error: plan.error };
        }

        const latest = messageHost.readFloor(messageId);
        if (!latest || !latest.isAi || !latest.isLatest || latest.chatId !== floor.chatId || latest.swipeId !== floor.swipeId || latest.text !== floor.text) {
            await store.putFloor(key, { ...base, status: 'stale', updatedAt: now() });
            return { ok: false, reason: 'stale' };
        }
        await ensureRegexesOnce();
        const written = await messageHost.writeFloor(messageId, insertMarkers(floor.text, numbered.paragraphs, plan.slots), floor);
        if (!written || !written.ok) {
            const stale = written && written.reason === 'stale';
            await store.putFloor(key, { ...base, status: stale ? 'stale' : 'failed', ...(!stale && { error: '无法写回楼层' }), updatedAt: now() });
            return { ok: false, reason: stale ? 'stale' : 'write-failed' };
        }

        for (const slot of plan.slots) {
            await store.putSlot(key, { ...slot, status: 'pending', updatedAt: now() });
            remember(`${key}|${slot.slot}`, { status: 'pending', dataUrl: '' });
        }
        for (const slot of plan.slots) {
            let result;
            try { result = await nai.generate(slot, s.nai); }
            catch (error) { result = { ok: false, error: 'NAI 生成失败' }; }
            const record = result && result.ok
                ? { ...slot, status: 'done', dataUrl: result.dataUrl }
                : { ...slot, status: 'failed', error: result && result.error || 'NAI 生成失败' };
            await store.putSlot(key, { ...record, updatedAt: now() });
            remember(`${key}|${slot.slot}`, { status: record.status, dataUrl: record.dataUrl || '' });
            emit(floor, slot.slot);
        }
        await store.putFloor(key, { ...base, status: 'done', count: plan.slots.length, updatedAt: now() });
        return { ok: true, reason: 'done', count: plan.slots.length };
    }

    async function processMessage(messageId) {
        const s = settings();
        if (!s.nsfwEnabled && !s.interludeEnabled) return { ok: true, reason: 'disabled' };
        const floor = messageHost.readFloor(messageId);
        if (!floor || !floor.isAi || !floor.isLatest || !floor.chatId || !floor.text.trim()) {
            return { ok: true, reason: 'not-eligible' };
        }
        const key = floorKeyOf(floor);
        if (locks.has(key)) return locks.get(key);
        const job = run(Number(messageId), floor, key, s)
            .catch(() => ({ ok: false, reason: 'error', error: '自动插图处理失败' }))
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

    return {
        processMessage, getIllustrationUrl,
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
