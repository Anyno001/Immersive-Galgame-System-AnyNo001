import { PROVIDED_PROMPT_DATA_FIELDS } from '../presets/prompt-preset.js';
import { inheritImageTaskLease } from './image-task-runtime.js';

// 先筛选再复制，提供资料模式不读取禁止字段的 getter，也不丢失私有租约。
export function imageWritingContext(meta = {}) {
    if (meta.contextMode !== undefined && meta.contextMode !== 'provided')
        return { ok: false, reason: 'PROMPT_CONTEXT_MODE', error: '未知写词资料模式' };
    if (meta.contextMode !== 'provided') return { ok: true, value: meta };
    const fields = [...PROVIDED_PROMPT_DATA_FIELDS, 'contextMode', 'imagePromptTask', 'systemPrompt',
        'signal', 'shouldStart', 'expectedConfigToken'];
    const value = Object.fromEntries(fields.filter(key => Object.hasOwn(meta, key))
        .map(key => [key, meta[key]]));
    return { ok: true, value: inheritImageTaskLease(meta, value) };
}
