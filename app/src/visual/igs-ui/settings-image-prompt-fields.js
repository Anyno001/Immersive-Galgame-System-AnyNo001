import { clonePromptData, IMAGE_PROMPT_TASKS } from '../../presets/prompt-preset.js';

const fields = {
    preset: ['name'],
    prompts: ['name', 'role', 'content', 'contentByFormat', 'enabled', 'kind', 'workbenchOnly', 'metadata',
        'injection_position', 'injection_depth', 'injection_order'],
    modules: ['role', 'content', 'contentByFormat', 'enabled', 'task', 'dataFields', 'requiredFields', 'metadata'],
    data: ['variables', 'literalVariables'],
};
const jsonFields = new Set(['metadata', 'contentByFormat', 'dataFields', 'requiredFields', 'variables', 'literalVariables']);

// 字段地址由分组和稳定 ID 组成，禁止通用路径赋值或按数组位置猜身份。
export function editImagePromptField(editor, address, value) {
    let parts;
    try { parts = JSON.parse(address); } catch { return { ok: false, reason: 'invalid-prompt-field' }; }
    if (!Array.isArray(parts) || parts.length !== 3 || parts.some(part => typeof part !== 'string'))
        return { ok: false, reason: 'invalid-prompt-field' };
    const [group, id, field] = parts;
    if (!editor?.preset?.data) return { ok: false, reason: 'missing-image-prompt-preset' };
    if (group === 'taskMap') {
        if (!IMAGE_PROMPT_TASKS.includes(field)) return { ok: false, reason: 'invalid-prompt-field' };
        editor.preset.data.taskMap ||= {};
        editor.preset.data.taskMap[field] = String(value);
        return { ok: true };
    }
    if (!Object.hasOwn(fields, group) || !fields[group].includes(field))
        return { ok: false, reason: 'invalid-prompt-field' };
    const target = group === 'preset' ? editor.preset : group === 'data' ? editor.preset.data
        : editor.preset.data[group]?.find(block => block.identifier === id);
    if (!target) return { ok: false, reason: 'prompt-block-not-found' };
    let parsed = value;
    if (jsonFields.has(field)) {
        // 留空移除可选路由，恢复只使用正文；空对象仍是显式且无匹配项的路由。
        if (field === 'contentByFormat' && !String(value || '').trim()) {
            delete target.contentByFormat;
            return { ok: true };
        }
        try { parsed = JSON.parse(value || (field === 'metadata' ? '{}' : '[]')); }
        catch { return { ok: false, reason: 'invalid-json', field: `${group}.${id}.${field}` }; }
    } else if (field.startsWith('injection_')) {
        parsed = Number(value);
        if (!Number.isSafeInteger(parsed)) return { ok: false, reason: 'invalid-prompt-field', field };
    } else if (['enabled', 'workbenchOnly'].includes(field)) parsed = value === true;
    if (group === 'prompts' && field === 'kind') {
        if (!['shared', 'task-slot', 'data-slot'].includes(value)) return { ok: false, reason: 'invalid-prompt-field' };
        if (value === 'task-slot') target.content = '{{任务提示词}}';
        if (value === 'data-slot') target.content = '{{任务资料}}';
    }
    target[field] = clonePromptData(parsed);
    return { ok: true };
}
