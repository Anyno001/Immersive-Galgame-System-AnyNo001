import { imageBackendMethod } from '../backend-methods.js';
import { confirmedCreatureOf } from '../../scene/creature-profile.js';
import { cgGenerationSeed } from '../../scene/generation-seeds.js';
import { resolveImageSeed } from '../image-seed.js';
import { inheritImageTaskLease, imageTaskState } from '../image-task-runtime.js';
import { recoverOperation } from '../../storage/automatic-recovery.js';

import { planReferenceCanvas, buildReferencePixels, composeReferencePixels } from '../../media/cg-reference-canvas.js';
import { checkCharacterMeta } from '../../schemas/character-meta.js';
import { consistencyPromptTask, checkConsistencyCaptions } from './cg-consistency-prompt.js';
import { promptProvenance, storedPromptFromResult } from '../generation-prompt.js';
import { prepareConsistencyAppearances, consistencyAppearanceAudit } from './cg-consistency-appearance.js';
import { normalizeConsistencyStrength, isConsistencyStrengthValid, normalizeConsistencyModel, isConsistencyModelValid } from './auto-illustration-settings.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const failure = (reason, error = '一致性重绘未保存，原图保持不变') => ({ ok: false, reason, error,
    ...((reason === 'cancelled' || reason?.startsWith('stale-')) && { stopGeneration: true }) });
let serial = 0;

// 单任务、同基线并发、固定顺序合成的内存候选。提交由存储适配器负责。
export function createCgConsistencyService(deps) {
    const { store, nai, codec, getSceneAssets, resolveReference, targetStillLive, onAccepted } = deps;
    const writePrompt = imageBackendMethod(nai, 'writePrompt');
    const now = deps.now || (() => new Date().toISOString());
    const report = (task, level, message) => {
        const floor = task?.target?.floor;
        const location = Number.isInteger(floor?.messageId) && Number.isInteger(task?.target?.slot)
            ? `第 ${floor.messageId} 楼第 ${task.target.slot} 张 ` : '';
        try { deps.report?.(level, `${location}角色一致性重绘 [${task.id}] ${message}`); } catch { /* 日志失败不影响任务 */ }
    };
    const progress = (task, detail) => {
        if (active !== task) return;
        try { task.options.onProgress?.({ kind: 'consistency', taskId: task.id, ...detail }); }
        catch { /* 进度展示失败不改变生成和提交结果 */ }
    };
    const reasonCodes = new Set(['DNA_TEMPLATE_BINDING', 'DNA_TEMPLATE_UNRESOLVED', 'DNA_MISSING',
        'DNA_VIEW_MISSING', 'PROMPT_MODE_CONFLICT', 'consistency-write-failed', 'consistency-busy',
        'consistency-unavailable', 'consistency-failed', 'dbgen-infill-required', 'no-canvas',
        'consistency-strength-invalid', 'dbgen-infill-strength-required', 'dbgen-appearance-correction-required',
        'dbgen-provided-context-required', 'PROMPT_CONTEXT_MODE',
        'consistency-model-invalid', 'dbgen-infill-model-required', 'dbgen-infill-model-mismatch',
        'infill-model-unsupported', 'nai-config-unset',
        'cg-binding-incomplete', 'cg-image-missing', 'cg-reference-missing', 'cg-size-mismatch',
        'cg-position-ambiguous', 'generation-config-unavailable', 'GENERATION_CONFIG_CHANGED',
        'stale-target', 'stale-revision', 'stale-dna', 'stale-config', 'cancelled', 'edit-failed',
        'slot-update-failed', 'candidate-unavailable', 'character-meta-shape', 'character-meta-caption',
        'character-meta-key', 'character-meta-binding', 'character-meta-index', 'character-meta-text',
        'character-meta-position', 'character-meta-position-mismatch', 'character-meta-region',
        'WORKBENCH_DESC_EMPTY', 'WORKBENCH_FLOOR_UNAVAILABLE', 'WORKBENCH_CAPTION_INVALID',
        'VIEWPOINT_NOT_FOUND', 'PROMPT_LLM_UNSET', 'PROMPT_LLM_MISSING',
        'IMAGEGEN_PRESET_UNSET', 'IMAGEGEN_PRESET_MISSING', 'LLM_CONFIG_MISSING',
        'LLM_TRANSPORT_MISSING', 'LLM_COMPLETE_FAILED', 'LLM_JSON_EMPTY', 'LLM_JSON_EXTRACT_FAILED',
        'LLM_SECRET_READ_FAILED', 'LLM_SECRET_READ_HTTP', 'LLM_SECRET_EMPTY',
        'DBGEN_PROMPT_TIMEOUT', 'DBGEN_PROMPT_EXCEPTION', 'DBGEN_PROMPT_EMPTY',
        'UPSTREAM_UNKNOWN', 'UPSTREAM_ABORTED', 'NAI_401', 'NAI_403', 'NAI_429',
        ...Array.from({ length: 200 }, (_, i) => `UPSTREAM_${400 + i}`)]);
    const diagnosticFields = new Set(['record.promptRecipe', 'record.characterMeta', 'reference.token',
        'dna.views', 'promptTask', 'captions.length', 'captions.slotId', 'promptRecipe.bindings.length',
        'binding.token', 'binding.kind', 'binding.characterKey', 'binding.framing', 'binding.captionIndex',
        'characterMeta', 'characterMeta.binding', 'dnaCandidates', 'promptRecipe', 'outfit.name',
        'outfit.description', 'promptTask.slotId', 'scene.caption', 'meta_fields', 'meta_rows',
        'meta_kind', 'meta_key', 'meta_token', 'meta_frame', 'meta_identity', 'meta_signature',
        'meta_outfit_name', 'meta_outfit_description', 'meta_region', 'prompt_mode', 'identity_mode',
        'meta_correction_identity', 'meta_correction_uc', 'promptRecipe.identityMode',
        'promptTask.identityMode', 'promptTask.slots.identityMode', 'binding.correction',
        'promptTask.characters', 'promptTask.characters.characterKey', 'promptTask.characters.token',
        'promptTask.characters.kind', 'promptTask.characters.framing', 'promptTask.slots',
        'promptTask.slots.slotId', 'promptTask.slots.tokens', 'promptRecipe.bindings',
        'caption', 'caption.scene', 'caption.char', 'caption.char_uc', 'characterContext',
        'characterMeta.characters', 'dnaCandidates.characters',
        ...['full_body', 'half_body', 'portrait', 'partial'].flatMap((frame) =>
            [`meta_dna_${frame}`, `meta_dna_uc_${frame}`, `dna.views.${frame}`])]);
    // 外部错误正文可能含模型回复或凭据；日志只接受受控码、字段路径和数值索引。
    const reportFailure = (task, result) => {
        const d = result?.diagnostics || result?.diagnostic;
        const reason = [result?.reason, d?.code].find((code) => reasonCodes.has(code)) || 'consistency-failed';
        const details = [Number.isInteger(task.roundId) ? `slotid ${task.roundId}` : '',
            ['prompt-input', 'prompt-parse', 'prompt-output', 'prompt-write', 'igs-prompt-input', 'igs-prompt-output'].includes(d?.stage) ? d.stage : '',
            diagnosticFields.has(d?.field) ? d.field : '',
            ['invalid', 'missing', 'mismatch', 'duplicate', 'placeholder', 'preserved', 'locked'].includes(d?.issue) ? d.issue : '',
            d?.field === 'promptRecipe.identityMode'
                && ['appearance_correction', 'absent', 'invalid'].includes(d.expectedIdentityMode)
                && ['appearance_correction', 'absent', 'invalid'].includes(d.actualIdentityMode)
                ? `身份模式要求 ${d.expectedIdentityMode}，回复 ${d.actualIdentityMode}` : '',
            Number.isInteger(d?.slotId) && d.slotId >= 1 && d.slotId <= 9999 ? `slotid ${d.slotId}` : '',
            Number.isInteger(d?.characterIndex) && d.characterIndex >= 0 && d.characterIndex < 16 ? `角色 ${d.characterIndex}` : '',
            Number.isInteger(d?.status) && d.status >= 100 && d.status <= 599 ? `HTTP ${d.status}` : '',
            typeof d?.traceId === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(d.traceId)
                ? `traceId ${d.traceId}` : '',
            Number.isInteger(d?.captionIndex) && d.captionIndex >= 0 && d.captionIndex < 16 ? `Char ${d.captionIndex}` : '',
            Number.isInteger(d?.expectedCount) && Number.isInteger(d?.actualCount)
                ? `预期 ${d.expectedCount} 份，实际 ${d.actualCount} 份` : ''].filter(Boolean).join('；');
        report(task, reason === 'cancelled' ? 'info' : 'error',
            `阶段 ${task.phase || 'prepare'}；${reason}${details ? `；${details}` : ''}；原图保持不变`);
    };
    let active = null;
    const live = (task) => active === task && !task.controller.signal.aborted
        && targetStillLive(task.target.floor, task.target.slot)
        && (!task.options.shouldStart || task.options.shouldStart());
    const guard = (task) => { if (!live(task)) throw new Error('stale-target'); };
    const strength = () => normalizeConsistencyStrength(deps.consistencyStrength?.());
    const model = () => normalizeConsistencyModel(deps.consistencyModel?.());
    const canStart = task => live(task);
    const taskMeta = (task, extra = {}) => inheritImageTaskLease(task.options, { ...extra,
        signal: task.controller.signal, shouldStart: () => live(task) });
    const configCurrent = task => task.configIsCurrent?.() === true;
    const unchanged = async task => {
        guard(task);
        const record = await store.getSlotRecord(task.record.key);
        guard(task);
        if (record) {
            task.record.revision = record.revision;
            task.record.revisionToken = record.revisionToken;
        }
        if (!configCurrent(task)) {
            const config = await wait(task, nai.getEditConfig(taskMeta(task, { imageKind: 'cg', promptKind: 'cg', model: task.model })));
            guard(task);
            if (!config?.ok) throw new Error(config?.reason || 'generation-config-unavailable');
            task.configIsCurrent = config.isCurrent;
            task.editConfig = inheritImageTaskLease(config, { ...task.editConfig, configToken: config.configToken });
        }
    };
    const capability = (selectedModel = model(), meta = {}) => {
        if (nai?.describe?.(undefined, meta).mode && nai.describe(undefined, meta).mode !== 'nai')
            return failure('consistency-builtin-only', '角色一致性模板重绘属于内置 NAI 功能，当前外部来源的普通生成不受影响');
        if (!isConsistencyModelValid(selectedModel)) return failure('consistency-model-invalid',
            '一致性重绘模型必须为 V4.5 Inpainting 或 V5 Inpainting，请在生图设置中重新选择');
        const cap = nai?.describeEdit?.(undefined, inheritImageTaskLease(meta, { model: selectedModel }));
        if (cap?.supported && (cap.infillModelNegotiation !== 1 || cap.model !== selectedModel))
            return failure('dbgen-infill-model-required', '内置图像来源未确认所选重绘模型');
        if (cap?.supported && cap.via !== 'nai')
            return failure('consistency-builtin-only', '角色一致性模板重绘使用内置 NAI；外部生成保持原有功能');
        if (!cap?.supported || cap.via !== 'nai') return failure(cap?.reason || 'image-edit-unsupported',
            cap?.message || '请使用支持所选模型局部重绘的内置 NAI');
        if (cap.infillImg2imgStrength !== 1) return failure('dbgen-infill-strength-required',
            '内置图像来源未提供所需的局部重绘强度控制');
        if (cap.via === 'nai' && cap.providedPromptContext !== 1)
            return failure('provided-context-required', '内置写词未接入提供资料模式，未开始一致性任务');
        if (!codec?.available) return failure('no-canvas', '当前环境不支持图片画布');
        if (typeof store.updateSlot !== 'function' || typeof resolveReference !== 'function'
            || typeof writePrompt !== 'function' || typeof nai.getEditConfig !== 'function')
            return failure('consistency-unavailable');
        return { ok: true };
    };

    async function prepare(task) {
        const captured = imageTaskState(task.options)?.config?.autoIllustration;
        task.model = captured ? normalizeConsistencyModel(captured.consistencyModel) : model();
        if (nai.describe?.(undefined, task.options).mode === 'nai' && typeof nai.waitUntilReady === 'function') {
            const ready = await wait(task, nai.waitUntilReady(taskMeta(task)));
            if (!ready?.ok) return ready;
        }
        const cap = capability(task.model, task.options);
        if (!cap.ok) return cap;
        task.builtin = nai.describe?.(undefined, task.options).mode === 'nai';
        if (task.builtin && (typeof deps.readReferenceImage !== 'function' || typeof deps.captureAppearanceScope !== 'function'))
            return failure('consistency-unavailable', '内置一致性预检来源未接入，未发送请求');
        task.strength = captured ? normalizeConsistencyStrength(captured.consistencyStrength) : strength();
        if (!isConsistencyStrengthValid(task.strength)) return failure('consistency-strength-invalid',
            '一致性重绘强度必须为 0.1–1，请在生图设置中重新选择；原设置未被改写');
        guard(task);
        const record = await store.getSlotRecord(`${task.target.key}|${task.target.slot}`);
        guard(task);
        if (!record?.dataUrl || record.status !== 'done') return failure('cg-image-missing', '当前 CG 尚未保存可用图片');
        const assets = clone(getSceneAssets());
        const checked = checkCharacterMeta(record.characterMeta, record.caption, Object.keys({ ...assets.characters, ...assets.generated?.characters, ...assets.characterDna }));
        const chars = checked.value?.characters;
        if (!checked.ok) return checked;
        if (!chars?.length || chars.length !== record.caption?.v4_prompt?.caption?.char_captions?.length) return failure('cg-binding-incomplete', '旧 CG 或角色绑定不完整，不能猜测人物身份');
        // 非人角色没有衣装与人类五官可核对：含非人角色的 CG 不做一致性重绘，原图保持不变。
        if (chars.some(c => confirmedCreatureOf(assets.characterDna?.[c.characterKey]))) return failure('cg-creature-unsupported',
            '本张 CG 含非人角色，其体表与肢体特征无法按人类五官与衣装校正，一致性重绘未发送；原图保持不变');
        task.record = record;
        task.assets = assets;
        task.characters = chars.slice().sort((a, b) => a.captionIndex - b.captionIndex);
        if (task.builtin) task.seed = resolveImageSeed(cgGenerationSeed(record, assets));
        if (task.builtin) {
            task.scope = clone(deps.captureAppearanceScope(task.characters.map(c => c.characterKey)));
            task.offSources?.();
            task.offSources = deps.subscribeAppearance?.(() => {
                if (!live(task)) {
                    task.stopReason = 'stale-target';
                    task.controller.abort();
                    if (task.state !== 'accepting') release(task);
                }
            });
        }
        if (deps.writingRequirements) task.writingRequirements = clone(deps.writingRequirements());
        const config = await wait(task, nai.getEditConfig(taskMeta(task, { imageKind: 'cg', promptKind: 'cg', model: task.model })));
        guard(task);
        if (!config?.ok) return config || failure('generation-config-unavailable');
        if (config.model !== task.model || typeof config.isCurrent !== 'function' || config.isCurrent() !== true)
            return failure('generation-config-unavailable');
        task.configIsCurrent = config.isCurrent;
        task.editConfig = inheritImageTaskLease(config, { version: config.version, configToken: config.configToken,
            model: task.model, artist: clone(config.artist) });
        await unchanged(task);
        return { ok: true };
    }

    async function writeTemplates(task) {
        task.writeResults ||= new Map();
        task.phase = 'binding';
        const bundle = consistencyPromptTask(task.record, task.characters, task.assets, task.plans,
            task.builtin ? task.appearance.selections : undefined);
        if (!bundle.ok) return bundle;
        task.bundle = bundle;
        await unchanged(task);
        task.phase = 'write';
        let completed = 0;
        progress(task, { phase: 'write', done: 0, total: bundle.expected.length });
        report(task, 'info', `开始并发写词：${bundle.expected.length} 份独立模板`);
        const written = await collect(task, bundle.expected.map(expected => async () => {
            const slot = bundle.promptTask.slots.find((s) => s.slotId === expected.slotId);
            const promptTask = { ...bundle.promptTask,
                characters: bundle.promptTask.characters.filter((c) => slot.tokens.includes(c.token)), slots: [slot] };
            const characterContext = bundle.characterContext.filter((c) =>
                promptTask.characters.some((b) => b.characterKey === c.characterKey));
            const output = { slotId: expected.slotId, size: expected.size || task.record.originalSize,
                ...(slot.identityMode !== undefined && { identity_mode: slot.identityMode }),
                ...(promptTask.outfitMode !== undefined && { outfit_mode: promptTask.outfitMode }),
                characterKey: expected.characterKey, layout: expected.layout,
                rows: expected.rows.map((row, captionIndex) => ({ captionIndex, kind: row.kind,
                    characterKey: row.characterKey, token: row.token, framing: row.framing,
                    centers: row.centers, outfit: row.kind === 'reference'
                        ? { name: '', description: '' }
                        : characterContext.find((c) => c.characterKey === row.characterKey).outfit })) };
            await unchanged(task);
            if (!canStart(task)) throw new Error('stale-config');
            if (task.writeResults.has(expected.slotId)) return task.writeResults.get(expected.slotId);
            const result = await wait(task, writePrompt(inheritImageTaskLease(task.editConfig, {
                imagePromptTask: 'consistency',
                outputs: { slotIds: [expected.slotId], size: clone(output.size), rows: clone(output.rows) },
                description: bundle.description
                    + (slot.identityMode === 'appearance_correction'
                        ? '\n本槽必须输出 identity_mode: appearance_correction；不可省略。'
                        : '\n本槽未授权临时身份校正；不输出 identity_mode 或 meta_correction_*。')
                    + `\n本次只输出 slotid ${expected.slotId}，共 ${output.rows.length} 个 Char。其他轮次由独立请求完成。`
                    + '\n本次输出清单（captionIndex 是本图连续零基索引，每个字段只写一次）：\n'
                    + JSON.stringify(output),
                promptTask, characterContext: clone(characterContext),
                contextMode: 'provided',
                originalPrompt: clone(task.record.promptEdited ? task.record.prompt?.caption || task.record.prompt || task.record.caption : task.record.promptRecipe.caption),
                layout: clone(expected.layout),
                writingRequirements: { ...clone(task.writingRequirements || {}),
                    size: `${output.size.width}x${output.size.height}` },
                signal: task.controller.signal, shouldStart: () => canStart(task) })));
            await unchanged(task);
            if (!result?.ok) return result ? { ...result, diagnostics: {
                ...result.diagnostic, ...result.diagnostics, phase: 'write', slotId: expected.slotId,
            } } : { ...failure('consistency-write-failed'),
                diagnostics: { phase: 'write', slotId: expected.slotId } };
            const actualCount = Array.isArray(result.captions) ? result.captions.length : 0;
            const field = actualCount !== 1 ? 'captions.length'
                : result.captions[0]?.slotId !== expected.slotId ? 'captions.slotId' : '';
            if (field) return {
                ...failure('DNA_TEMPLATE_BINDING', `一致性绑定校验失败：slotid ${expected.slotId} ${field} 不符合本次任务；原图保持不变`),
                diagnostics: { phase: 'binding', field, slotId: expected.slotId,
                    expectedCount: 1, actualCount },
            };
            task.writeResults.set(expected.slotId, result);
            progress(task, { phase: 'write', done: ++completed, total: bundle.expected.length });
            return result;
        }));
        if (!written.ok) return written;
        await unchanged(task);
        task.phase = 'binding';
        const checked = checkConsistencyCaptions({ ok: true, captions: written.values.flatMap((r) => r.captions) }, bundle, task.characters);
        if (!checked.ok) return checked;
        task.rounds = checked.rounds;
        task.audit = [];
        return { ok: true };
    }

    const wait = (task, promise) => new Promise((resolve, reject) => {
        const signal = task.controller.signal;
        const abort = () => { cleanup(); reject(new Error('cancelled')); };
        const cleanup = () => signal.removeEventListener('abort', abort);
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true });
        Promise.resolve(promise).then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
    });
    // 每个角色独立续接失败步骤，已经完成的角色继续保留。
    async function collect(task, jobs) {
        const values = await Promise.all(jobs.map(job => recoverOperation(job, {
            signal: task.controller.signal, isActive: () => live(task),
            onRecover: () => report(task, 'info', '正在自动续接当前角色'),
        })));
        guard(task);
        const failed = values.find(value => value?.ok === false || value?.cancelled);
        if (failed) return failed;
        return { ok: true, values };
    }
    function release(task) {
        task.detach?.();
        task.offSources?.();
        task.references = null;
        task.pixels = null;
        task.dataUrl = '';
        task.originalDataUrl = '';
        if (active === task) active = null;
    }
    async function generate(task) {
        try {
            return await recoverOperation(() => generateOnce(task), {
                retryUnchanged: false,
                signal: task.controller.signal, isActive: () => live(task),
                onRecover: () => report(task, 'info', '正在自动续接一致性任务'),
                repair: async () => {
                    const revision = task.record?.revision;
                    const token = task.editConfig?.configToken;
                    await unchanged(task);
                    return { changed: revision !== task.record?.revision || token !== task.editConfig?.configToken };
                },
            });
        } finally {
            progress(task, { phase: 'done' });
            task.references = null;
            if (task.state !== 'candidate') release(task);
        }
    }
    async function generateOnce(task) {
        task.writeResults ||= new Map();
        task.editResults ||= new Map();
        try {
            progress(task, { phase: 'prepare' });
            const prepared = task.prepared ? { ok: true } : await prepare(task);
            if (!prepared.ok) return prepared;
            task.prepared = true;
            await unchanged(task);
            task.phase = 'reference';
            progress(task, { phase: 'reference', done: 0, total: task.characters.length });
            const hydrated = task.hydrated || (store.hydrateSlot ? await wait(task, store.hydrateSlot(task.record)) : task.record);
            task.hydrated = hydrated;
            let pixels = await wait(task, codec.decodeImage(hydrated.dataUrl, { signal: task.controller.signal }));
            task.originalDataUrl = hydrated.dataUrl;
            guard(task);
            const size = task.record.originalSize;
            if (size && (size.width !== pixels.width || size.height !== pixels.height)) throw new Error('cg-size-mismatch');
            task.references = task.appearance?.references || [];
            // 全部参考与几何就绪后才进入写词。
            for (const binding of task.builtin ? [] : task.characters) {
                const src = await wait(task, resolveReference(binding.characterKey, task.assets));
                guard(task);
                if (!src) return failure('cg-reference-missing', `角色「${binding.characterKey}」没有可读取的已保存默认立绘`);
                task.references.push(await wait(task, codec.decodeImage(src, { signal: task.controller.signal })));
                progress(task, { phase: 'reference', done: task.references.length, total: task.characters.length });
            }
            task.plans = task.characters.map((c, i) => planReferenceCanvas(pixels.width, pixels.height,
                { characters: task.characters }, c.characterKey, task.builtin ? task.references[i] : undefined));
            const invalid = task.plans.find(p => !p.ok);
            if (invalid) return invalid;
            const templates = await writeTemplates(task);
            if (!templates.ok) return templates;
            const baseline = pixels;
            task.phase = 'edit';
            let completed = 0;
            progress(task, { phase: 'paint', done: 0, total: task.characters.length });
            const edited = await collect(task, task.characters.map((binding, i) => async () => {
                await unchanged(task);
                const plan = task.plans[i], round = task.rounds[i];
                report(task, 'info', `开始局部重绘 ${i + 1}/${task.characters.length}；slotid ${round.slotId}`);
                const work = buildReferencePixels(baseline, task.references[i], plan);
                const sourceDataUrl = await wait(task, codec.encodePixels(work.image));
                const maskDataUrl = await wait(task, codec.encodePixels(work.mask));
                await unchanged(task);
                if (!canStart(task)) throw new Error('stale-config');
                const result = task.editResults.get(round.slotId) || await wait(task, nai.edit(inheritImageTaskLease(round, { ...round, sourceDataUrl, maskDataUrl,
                    width: plan.size.width, height: plan.size.height, strength: task.strength, imageKind: 'cg', promptKind: 'cg',
                    model: task.model, artist: task.editConfig.artist, expectedConfigToken: task.editConfig.configToken,
                    ...(task.builtin && { seed: task.seed }),
                    signal: task.controller.signal, shouldStart: () => canStart(task) })));
                if (!result?.ok || !result.dataUrl) return { ...failure(result?.reason || 'edit-failed', result?.error),
                    ...(result?.stopGeneration !== undefined && { stopGeneration: result.stopGeneration }) };
                if (!result.promptRecipe || !result.dnaSnapshot || !result.sentPrompt)
                    return failure('PROMPT_MODE_CONFLICT', '重绘结果缺少实际发送来源，原图保持不变');
                task.editResults.set(round.slotId, result);
                await unchanged(task);
                const generated = await wait(task, codec.decodeImage(result.dataUrl, { signal: task.controller.signal }));
                guard(task);
                progress(task, { phase: 'paint', done: ++completed, total: task.characters.length });
                return { ok: true, generated, audit: { slotId: round.slotId, characterKey: binding.characterKey,
                    ...(task.builtin && { seed: task.seed }),
                    ...promptProvenance(result), ...(task.appearance && { appearance: consistencyAppearanceAudit(
                        task.appearance, binding.characterKey, task.confirmed) }) } };
            }));
            if (!edited.ok) return edited;
            task.phase = 'compose';
            progress(task, { phase: 'compose' });
            // 结果到达顺序不影响回贴；重叠支撑区按原 captionIndex 顺序混合。
            for (const [i, result] of edited.values.entries()) {
                pixels = composeReferencePixels(pixels, result.generated, task.plans[i]);
                task.audit.push(result.audit);
            }
            task.dataUrl = await wait(task, codec.encodePixels(pixels));
            await unchanged(task);
            task.state = 'candidate';
            report(task, 'info', '候选已生成，尚未保存；请在预览中接受或取消');
            return { ok: true, reason: 'candidate', candidateId: task.id, dataUrl: task.dataUrl,
                originalDataUrl: task.originalDataUrl, width: pixels.width, height: pixels.height };
        } catch (error) {
            return failure(task.stopReason || (task.controller.signal.aborted ? 'cancelled' : (error?.message || 'consistency-failed')));
        }
    }

    function newTask(target, options) {
        const task = { id: `cg-consistency-${++serial}`, target: structuredClone(target), options,
            controller: new AbortController(), state: 'running', phase: 'prepare' };
        active = task;
        const abort = () => cancel(task.id);
        options.signal?.addEventListener('abort', abort, { once: true });
        task.detach = () => options.signal?.removeEventListener('abort', abort);
        if (options.signal?.aborted) task.controller.abort();
        return task;
    }
    async function preflight(target, options = {}) {
        if (nai?.describe?.(undefined, options).mode && nai.describe(undefined, options).mode !== 'nai')
            return { ok: true, reason: 'legacy-ready' };
        if (active) return failure('consistency-busy');
        const task = newTask(target, options);
        try {
            const prepared = await prepare(task);
            if (!prepared.ok) { release(task); return prepared; }
            const repairedReferences = new Set();
            const readAppearance = async () => {
                task.assets = clone(getSceneAssets());
                task.scope = clone(deps.captureAppearanceScope(task.characters.map(c => c.characterKey)));
                return wait(task, prepareConsistencyAppearances({ record: task.record,
                    characters: task.characters, assets: task.assets, scope: task.scope,
                    readImage: deps.readReferenceImage, codec, signal: task.controller.signal }));
            };
            const appearance = await recoverOperation(readAppearance, {
                signal: task.controller.signal, isActive: () => live(task),
                observe: async () => { const value = await readAppearance(); return { completed: value?.ok === true, value }; },
                repair: async failure => {
                    if (!failure?.characterKey || typeof deps.ensureReferences !== 'function') return;
                    if (!['outfit-image-missing', 'outfit-image-empty', 'outfit-unregistered', 'outfit-dna-missing',
                        'default-outfit-unset', 'default-outfit-missing', 'default-outfit-invalid',
                        'cg-reference-repair-needed'].includes(failure.reason)) return;
                    const key = JSON.stringify([failure.characterKey, failure.requestedOutfit]);
                    if (repairedReferences.has(key)) return;
                    repairedReferences.add(key);
                    const previous = JSON.stringify(task.scope);
                    const result = await deps.ensureReferences({ record: task.record, characters: task.characters, failure,
                        signal: task.controller.signal, shouldStart: () => live(task) });
                    task.assets = clone(getSceneAssets());
                    task.scope = clone(deps.captureAppearanceScope(task.characters.map(c => c.characterKey)));
                    return { changed: result?.ok === true && previous !== JSON.stringify(task.scope) };
                },
            });
            if (!appearance.ok) { release(task); return appearance; }
            task.appearance = appearance;
            await unchanged(task);
            task.prepared = true;
            task.state = 'prepared';
            return { ok: true, reason: appearance.confirmations.length ? 'needs-confirmation' : 'ready',
                preflightToken: task.id, confirmations: clone(appearance.confirmations) };
        } catch (error) {
            const result = failure(task.stopReason || (task.controller.signal.aborted ? 'cancelled' : error.message));
            release(task);
            return result;
        }
    }
    function run(target, options = {}) {
        const builtin = nai?.describe?.(undefined, options).mode === 'nai';
        if (builtin && !options.preflightToken) return preflight(target, options).then(result => {
            if (!result.ok || result.reason === 'needs-confirmation') return result;
            return run(target, { ...options, preflightToken: result.preflightToken });
        });
        if (builtin) {
            const task = active;
            if (!task || task.id !== options.preflightToken || task.state !== 'prepared'
                || JSON.stringify(task.target) !== JSON.stringify(target)) return Promise.resolve(failure('stale-preflight'));
            if (task.appearance.confirmations.length && options.confirmed !== true)
                return Promise.resolve(failure('confirmation-required'));
            if (options.onProgress !== undefined)
                task.options = { ...task.options, onProgress: options.onProgress };
            task.state = 'running';
            task.confirmed = options.confirmed === true;
            return generate(task).then(result => {
                if (!result.ok) reportFailure(task, result);
                return result;
            });
        }
        if (active) return Promise.resolve(failure('consistency-busy', '已有一致性任务或候选，请先停止或取消'));
        const task = { id: `cg-consistency-${++serial}`, target, options, controller: new AbortController(), state: 'running', phase: 'prepare' };
        active = task;
        const abort = () => cancel(task.id);
        options.signal?.addEventListener('abort', abort, { once: true });
        task.detach = () => options.signal?.removeEventListener('abort', abort);
        if (options.signal?.aborted) task.controller.abort();
        report(task, 'info', '开始准备，原 CG 保持不变');
        return generate(task).then((result) => {
            if (!result.ok) reportFailure(task, result);
            return result;
        });
    }
    async function accept(candidateId) {
        const task = active;
        if (!task || task.id !== candidateId || task.state !== 'candidate') return failure('candidate-unavailable');
        task.state = 'accepting';
        task.phase = 'commit';
        report(task, 'info', '正在保存已接受的候选');
        let committed = false;
        try {
            let attemptedRevision, attemptedToken;
            const result = await recoverOperation(async () => {
            guard(task);
            const latest = await store.getSlotRecord(task.record.key);
            guard(task);
            // 保存只更新本次接受的图像字段，修订推进时在最新记录上续存。
            const current = latest || task.record;
            attemptedRevision = current.revision;
            attemptedToken = current.revisionToken;
            const prompt = clone(current.prompt || storedPromptFromResult(current));
            if (prompt) { delete prompt.sentPrompt; delete prompt.consistencyPrompt; }
            return store.updateSlot(task.target.key, task.target.slot, current.revision || 0,
                { dataUrl: task.dataUrl, ...(prompt && { prompt }),
                    // 原正式提示词不重写；实际 infill 来源单独归档。
                    ...promptProvenance({ consistencyPrompt: { version: 1, rounds: task.audit } }),
                    preflightFailure: null, error: null, failureReason: null,
                    status: 'done', updatedAt: now() },
                { expectedToken: current.revisionToken, preserveBaseline: true, clearSentPrompt: true,
                    beforeCommit: () => guard(task), shouldCommit: () => live(task) });
            }, { repeatable: 'save', signal: task.controller.signal, isActive: () => live(task),
                repair: async result => {
                    if (!['stale-revision', 'revision-conflict'].includes(result?.reason)) return;
                    const latest = await store.getSlotRecord(task.record.key);
                    return { changed: Boolean(latest && (latest.revision !== attemptedRevision
                        || latest.revisionToken !== attemptedToken)) };
                },
                onRecover: () => report(task, 'info', '正在自动续存同一候选') });
            if (result?.cancelled || result?.ok === false) return result;
            committed = true;
            const notified = await recoverOperation(async () => {
                await onAccepted?.(task.target, result.record);
                if (result.warning) await deps.repairIndex?.(task.target, result.record);
                return { ok: true };
            }, { repeatable: 'save', signal: task.controller.signal, isActive: () => live(task) });
            if (notified?.ok === false) return notified;
            report(task, 'success', '已接受并保存');
            return { ok: true, reason: 'accepted' };
        } catch (error) {
            const result = error?.result || failure('candidate-save-failed', error?.message);
            reportFailure(task, result);
            return result;
        } finally {
            if (committed || !live(task)) release(task);
            else { task.state = 'candidate'; task.phase = 'candidate'; }
        }
    }
    function cancel(candidateId) {
        const task = active;
        if (!task || (candidateId && task.id !== candidateId)) return { ok: true, reason: 'no-task' };
        report(task, 'info', '已请求停止或取消；未接受的候选将丢弃，上游已发请求可能仍在执行');
        task.controller.abort();
        if (task.state !== 'accepting') release(task);
        return { ok: true, reason: 'cancelled' };
    }
    const withImageContext = (execute, target, options = {}) => {
        const input = options.preflightToken && active?.id === options.preflightToken
            ? inheritImageTaskLease(active.options, { ...options }) : options;
        return typeof nai?.runImageTask === 'function'
            ? nai.runImageTask(input, guarded => execute(target, guarded)) : execute(target, options);
    };
    return { run: (target, options) => withImageContext(run, target, options),
        preflight: (target, options) => withImageContext(preflight, target, options),
        accept, cancel, capability, isBusy: () => Boolean(active) };
}
