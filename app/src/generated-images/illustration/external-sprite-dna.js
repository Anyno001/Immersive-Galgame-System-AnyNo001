import { recoverOperation } from '../../storage/automatic-recovery.js';
import { spriteDnaPreparationState, prepareCharacterDnaSave } from '../../scene/character-dna-preparation.js';
import { normalizeCharacterDna } from '../../scene/character-dna.js';
import { characterPromptTask, singleCharacterContext } from './character-prompt-task.js';
import { writeTemplateCaptionsWithLlm } from './caption-writer.js';
import { spriteUserPrompts } from '../prompt-scheme.js';
import { imageTaskConfig } from '../builtin-image-task-runtime.js';

const stale = () => ({ ok: false, reason: 'stale-target', cancelled: true, stopGeneration: true, error: '原角色卡或聊天目标已结束' });

export function createExternalSpriteDnaPreparation({ llm, readSettings, isExternal, isBuiltin = () => false, captureTarget, readChat, isStopped, readLore }) {
    const pending = new Map();
    const configOf = settings => {
        const config = imageTaskConfig({ imageApi: settings.imageApi, autoIllustration: settings.auto });
        return JSON.stringify([config.imageApi, config.autoIllustration.llm]);
    };
    async function prepareBatch({ characters = [], shouldStart, signal, numberedText, previousText, onProgress, requireDna = false } = {}) {
        const settings = readSettings(signal);
        const internal = requireDna && isBuiltin(signal);
        if (!internal && (!isExternal(signal) || !settings.externalSpriteDna)) return { ok: true, characters, shouldStart };
        const chat = readChat(), config = configOf(settings);
        const globalCurrent = () => !isStopped() && readChat() === chat;
        const current = () => globalCurrent() && !signal?.aborted && (!shouldStart || shouldStart() === true);
        if (!current()) return stale();
        const rows = [], seen = new Map();
        for (const source of characters) {
            const target = typeof source.onSaveDna === 'function' ? null : captureTarget?.(source.name);
            const name = target?.name || source.name;
            const row = { name, dna: target?.dna || source.dna,
                note: source.note ?? settings.sceneAssets.characterSpriteNotes?.[name] ?? '',
                save: source.onSaveDna || target?.save, current,
                targetCurrent: () => !target || target.isCurrent() };
            row.key = JSON.stringify([chat, target?.key || name, normalizeCharacterDna(row.dna), row.note, config]);
            const existing = seen.get(row.key);
            if (existing) { rows.push({ sourceName: source.name, row: existing }); continue; }
            seen.set(row.key, row);
            rows.push({ sourceName: source.name, row });
            if (!row.targetCurrent()) return stale();
            row.state = spriteDnaPreparationState(row.dna);
            if (!row.state.needed) continue;
            if (row.state.cleared) return { ok: false, reason: 'dna-manually-cleared',
                error: '角色身份已手动清空，请先到「素材 → 角色立绘 → 角色设定」填写 DNA，再生成立绘' };
            if (typeof row.save !== 'function') return { ok: false, reason: 'dna-save-unavailable', error: '角色 DNA 无法保存，未开始补档或出图' };
        }

        const fresh = [], consumers = [];
        for (const row of seen.values()) {
            if (!row.state.needed) continue;
            let entry = pending.get(row.key);
            if (entry && !entry.job.canJoin()) entry = null;
            if (!entry) {
                entry = { row, consumers: new Set() };
                pending.set(row.key, entry); fresh.push(entry);
            }
            entry.consumers.add(row);
            row.entry = entry; consumers.push(row);
        }
        if (fresh.length) startJob(fresh, settings, { globalCurrent, numberedText, previousText, onProgress });
        const cancelUnused = () => {
            for (const job of new Set(consumers.map(row => row.entry.job))) job.cancelUnused();
        };
        signal?.addEventListener('abort', cancelUnused, { once: true });
        try {
            const completed = await Promise.all(consumers.map(async row => {
                const result = await row.entry.promise;
                if (!result.ok) { row.failure = result; return result; }
                row.dna = result.dna;
                row.targetCurrent = result.shouldStart;
                return { ok: true };
            }));
            const failed = completed.find(result => !result.ok);
            if (failed && [...seen.values()].every(row => row.failure)) return failed;
            const rowCurrent = row => !row.failure && row.targetCurrent();
            const valid = () => current() && [...seen.values()].map(rowCurrent).some(Boolean);
            if (!valid()) return stale();
            return { ok: true, characters: rows.map(({ sourceName, row }) => ({ name: sourceName,
                characterKey: row.name, dna: row.dna, ...(row.failure && { failure: row.failure }) })),
                shouldStart: valid, shouldStartFor: name => current() && rows.some(row => row.sourceName === name && rowCurrent(row.row)) };
        } finally {
            signal?.removeEventListener('abort', cancelUnused);
            for (const row of consumers) row.entry.consumers.delete(row);
            cancelUnused();
        }
    }

    function startJob(entries, settings, { globalCurrent, ...input }) {
        const controller = new AbortController();
        const active = entry => [...entry.consumers].find(row => row.current()
            && (entry.saved ? entry.saved.ok && entry.saved.shouldStart() : row.targetCurrent()));
        const canJoin = () => !controller.signal.aborted && globalCurrent()
            && entries.some(active);
        const valid = () => canJoin() && entries.some(active);
        // 共享资料任务持有自己的租约，单个楼层取消只撤销该楼的消费。
        const job = { canJoin, done: false, saving: false,
            cancelUnused() { if (!job.done && !job.saving && !valid()) controller.abort(); } };
        for (const entry of entries) entry.job = job;
        const request = { signal: controller.signal, shouldStart: valid };
        const execute = guarded => generateBatch(entries, settings, { ...input,
            signal: guarded.signal, current: guarded.shouldStart, active, globalCurrent });
        const work = Promise.resolve().then(() => typeof llm?.runImageTask === 'function'
            ? llm.runImageTask(request, execute) : execute(request)).finally(() => { job.done = true; });
        for (const entry of entries) {
            entry.promise = work.then(result => result.ok ? entry.saved || stale() : result);
            entry.promise.finally(() => {
                if (pending.get(entry.row.key) === entry) pending.delete(entry.row.key);
            }).catch(() => {});
        }
    }

    async function generateBatch(entries, settings, { signal, numberedText, previousText, onProgress, current, active, globalCurrent }) {
        try {
            if (!current()) return stale();
            const rows = entries.map(entry => entry.row);
            onProgress?.({ phase: 'dna', done: 0, total: rows.length });
            let lore;
            try { lore = await readLore?.(rows.map(row => row.name)); } catch {
                return { ok: false, reason: 'dna-lore-unavailable', error: '角色设定读取失败，未开始补 DNA 或出图' };
            }
            if (!current()) return stale();
            const context = rows.flatMap(row => singleCharacterContext(row.name, row.dna, undefined, settings.sceneAssets));
            const task = characterPromptTask(context, 'sprite', 'half_body', rows.map(row => [row.name]));
            const written = await writeTemplateCaptionsWithLlm(llm, settings.auto.llm, { ...task,
                imagePromptTask: 'dna', outputs: { format: 'sprite-data' }, userPrompts: spriteUserPrompts(settings.promptScheme),
                description: '一次补齐本轮全部角色的三景别外貌 DNA 与独立性格，供外部写词采用为角色设定。按各槽 slotid 与规范角色键逐份交付，不遗漏或混用角色；保留已有景别及明确设定，首次缺设定时协调设计普通外貌。衣装资料与身份分开，本次只保存身份与性格。角色补充要求：'
                    + JSON.stringify(rows.map(row => ({ characterKey: row.name, note: row.note }))),
                ...(numberedText !== undefined && { numberedText }), ...(previousText !== undefined && { previousText }),
                ...(lore !== undefined && { lore }), ...(signal && { signal }), shouldStart: current,
                onRecovery: event => onProgress?.({ phase: 'dna', done: 0, total: rows.length,
                    message: event.message || (event.phase === 'slow' ? '副 API 仍在处理同一次请求'
                        : event.result?.error || '副 API 请求未完成'),
                    status: event.phase, attempt: event.outputAttempt, maxAttempts: event.maxOutputAttempts }) });
            if (!current()) return stale();
            if (!written?.ok) return written || { ok: false, reason: 'dna-write-failed', error: '副 API 补 DNA 失败，未发起立绘生成' };
            const candidates = (written.captions || [written]).flatMap(entry => entry.dnaCandidates?.characters || []);
            if (candidates.length !== rows.length || new Set(candidates.map(row => row.characterKey)).size !== rows.length)
                return { ok: false, reason: 'DNA_ADOPTION_CONFLICT', error: '角色 DNA 清单缺失或重复，未发起立绘生成' };
            const prepared = rows.map(row => prepareCharacterDnaSave(row.dna,
                candidates.find(candidate => candidate.characterKey === row.name), row.name));
            const invalid = prepared.find(result => !result.ok);
            if (invalid) return invalid;
            for (const [index, entry] of entries.entries()) {
                if (!current()) return stale();
                const owner = active(entry);
                if (!owner) continue;
                entry.job.saving = true;
                try {
                    const saved = await recoverOperation(() => owner.save(prepared[index].dna), {
                        repeatable: 'save',
                        signal, isActive: () => current() && owner.targetCurrent(),
                    });
                    if (saved?.ok !== true) {
                        entry.saved = saved || { ok: false, reason: 'dna-save-failed', error: 'DNA 保存失败，未发起立绘生成' };
                        continue;
                    }
                    entry.row = owner;
                    const targetCurrent = owner.targetCurrent;
                    entry.saved = { ok: true, dna: saved.dna || prepared[index].dna,
                        shouldStart: () => globalCurrent() && targetCurrent() };
                } finally { entry.job.saving = false; }
            }
            return current() ? { ok: true } : stale();
        } catch {
            return { ok: false, reason: 'dna-write-failed', error: '副 API 补 DNA 失败，未发起立绘生成' };
        }
    }
    const batch = (request = {}) => typeof llm?.runImageTask === 'function'
        && (request.requireDna && isBuiltin(request.signal)
            || isExternal(request.signal) && readSettings(request.signal).externalSpriteDna)
        ? llm.runImageTask(request, guarded => prepareBatch(guarded)) : prepareBatch(request);
    const single = async (request = {}) => {
        const result = await batch({ ...request, characters: [request] });
        return result.ok ? result.characters[0].failure || { ok: true, dna: result.characters[0].dna, shouldStart: result.shouldStart } : result;
    };
    single.batch = batch;
    return single;
}
