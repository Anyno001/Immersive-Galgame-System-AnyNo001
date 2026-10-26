import { completeImagePromptPreset, createBuiltinImagePromptPresets } from './image-prompt-defaults.js';
import { renderImagePromptPreset } from '../presets/prompt-preset-renderer.js';
import { runImageTask, staleImageTask, imageTaskState } from './image-task-runtime.js';
import { imageWritingContext } from './image-prompt-context.js';
import { recoveryCancelled } from '../storage/automatic-recovery.js';

// 注册表是唯一 current 真值；每次装配冻结本轮资料，不缓存另一份 current。
export function createImagePromptLlm(llm, registry, taskRuntime, resolveWorldInfo) {
    const wrapped = Object.create(llm || null);
    if (taskRuntime) wrapped.runImageTask = (meta, execute) => runImageTask(taskRuntime, meta, execute);
    if (taskRuntime) wrapped.readImageTaskState = () => taskRuntime.readCurrentState();
    if (taskRuntime) wrapped.recoveryGlobal = taskRuntime.recoveryGlobal;
    wrapped.prepareImagePrompt = async (task, input) => {
        const context = imageWritingContext(input);
        if (!context.ok) return context;
        const initialized = registry.ensureImagePromptDefault(createBuiltinImagePromptPresets());
        if (!initialized.ok) return { ...initialized, presetFailure: true, error:'生图提示词预设不可读取或初始化失败，未发送写词请求' };
        const current = imageTaskState(input)?.promptPreset || registry.getCurrent('prompt-preset');
        const stale = () => input.signal?.aborted || (input.shouldStart && !input.shouldStart());
        if (stale()) return staleImageTask();
        // 旧预设缺非人任务条目时只读补入内置默认；用户已有条目原样使用。
        const presetData = completeImagePromptPreset(current?.data);
        let rendered = renderImagePromptPreset(presetData, task, context.value);
        if (rendered.ok && rendered.needsWorldInfo && typeof resolveWorldInfo === 'function') {
            // 从已冻结的任务资料取扫描窗口；不读取聊天全量，也不递归求值世界书正文。
            const data = JSON.parse(rendered.blocks.find(block =>
                current.data.prompts.find(source => source.identifier === block.identifier)?.kind === 'data-slot').content);
            const reference = await resolveWorldInfo({ description: data.description,
                numberedText: data.numberedText, previousText: data.previousText,
                ...(input.signal && { signal: input.signal }),
                ...(input.shouldStart && { shouldStart: input.shouldStart }) });
            if (stale()) return staleImageTask();
            if (!reference.ok && recoveryCancelled(reference)) return reference;
            // 世界书只是参考：宿主接口缺失或扫描出错时本次不带参考照常写词，不把任务挂起。
            rendered = renderImagePromptPreset(presetData, task, { ...data,
                ...(context.value.contextMode !== undefined && { contextMode: context.value.contextMode }),
                worldInfo: reference.ok ? reference.text : '' });
        }
        return rendered.ok ? { ...rendered, presetId: current.id }
            : { ...rendered, presetFailure: true, error: '当前生图提示词预设或任务资料无效，未发送写词请求' };
    };
    if (typeof llm?.request === 'function') wrapped.request = llm.request.bind(llm);
    if (typeof llm?.fetchModels === 'function') wrapped.fetchModels = llm.fetchModels.bind(llm);
    return wrapped;
}

// 老的独立调用不添加可选字段；正式装配链才启用有序生图预设。
export async function prepareImageWritingRequest(llm, task, input, legacy) {
    const context = imageWritingContext(input);
    if (!context.ok) return { ...context, stopGeneration: true };
    if (typeof llm?.prepareImagePrompt !== 'function') return { ok: true, request: legacy };
    try {
        const prepared = await llm.prepareImagePrompt(task, context.value);
        return prepared.ok ? prepared : { ...prepared, stopGeneration: true };
    } catch {
        return { ok: false, reason: 'prompt-prepare-failed', stopGeneration: true,
            error: '生图提示词装配失败，未发送写词或绘图请求' };
    }
}
