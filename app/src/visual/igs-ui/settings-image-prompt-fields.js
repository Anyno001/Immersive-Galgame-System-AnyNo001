import { clonePromptData, IMAGE_PROMPT_TASKS, PROMPT_DATA_FIELDS } from '../../presets/prompt-preset.js';

const fields = {
    preset: ['name'],
    prompts: ['name', 'role', 'content', 'contentByFormat', 'enabled', 'kind', 'workbenchOnly', 'metadata',
        'injection_position', 'injection_depth', 'injection_order'],
    modules: ['role', 'content', 'contentByFormat', 'enabled', 'task', 'dataFields', 'requiredFields', 'metadata'],
    data: ['variables', 'literalVariables', 'performance'],
};
const jsonFields = new Set(['metadata', 'contentByFormat', 'dataFields', 'requiredFields', 'variables', 'literalVariables']);

const object = value => value && typeof value === 'object' && !Array.isArray(value);
// 资料范围改动后按 PROMPT_DATA_FIELDS 顺序重排；数组里不认识的项原样留在末尾，不替用户丢弃。
const orderedFields = list => [...PROMPT_DATA_FIELDS.filter(name => list.includes(name)),
    ...list.filter(name => !PROMPT_DATA_FIELDS.includes(name))];

// 界面合成项：一个「启用」开关对应块启用 + 顺序项启用；每种格式一个文本框；资料范围的两列勾选。
function editVirtual(editor, group, target, id, field, value) {
    if (group === 'prompts' && field === 'enabledCombined') {
        const entry = editor.preset.data.prompt_order?.find(item => item.identifier === id);
        if (value === true) { target.enabled = true; if (entry) entry.enabled = true; }
        else if (entry) entry.enabled = false;
        else target.enabled = false;
        return { ok: true };
    }
    if (field.startsWith('format:')) {
        const format = field.slice('format:'.length);
        if (!format || (group === 'prompts' && target.kind && target.kind !== 'shared')) return { ok: false, reason: 'invalid-prompt-field' };
        const text = typeof value === 'string' ? value : '';
        const pendingKey = `${group}|${id}|${format}`;
        if (!text.trim()) {
            // 清空即删除该键；全部删除后连 contentByFormat 字段一并删除。
            if (object(target.contentByFormat) && Object.hasOwn(target.contentByFormat, format)) {
                delete target.contentByFormat[format];
                if (!Object.keys(target.contentByFormat).length) delete target.contentByFormat;
            }
            return { ok: true };
        }
        if (target.contentByFormat === undefined) target.contentByFormat = {};
        if (!object(target.contentByFormat)) return { ok: false, reason: 'invalid-format-content' };
        target.contentByFormat[format] = text;
        if (editor.pendingFormats) delete editor.pendingFormats[pendingKey];
        return { ok: true };
    }
    if (group === 'modules' && (field.startsWith('allow:') || field.startsWith('require:'))) {
        const allow = field.startsWith('allow:'), name = field.slice(field.indexOf(':') + 1);
        if (!PROMPT_DATA_FIELDS.includes(name)) return { ok: false, reason: 'invalid-prompt-field' };
        const allowed = Array.isArray(target.dataFields) ? target.dataFields : (target.dataFields = []);
        const required = Array.isArray(target.requiredFields) ? target.requiredFields : (target.requiredFields = []);
        const wanted = value === true;
        let rerender = false;
        if (allow) {
            if (allowed.includes(name) === wanted) return { ok: true };
            if (wanted) allowed.push(name);
            else {
                target.dataFields = allowed.filter(item => item !== name);
                if (required.includes(name)) { target.requiredFields = required.filter(item => item !== name); rerender = true; }
            }
            target.dataFields = orderedFields(target.dataFields);
            if (target.requiredFields !== required) target.requiredFields = orderedFields(target.requiredFields);
        } else {
            if (required.includes(name) === wanted) return { ok: true };
            if (wanted) {
                required.push(name);
                if (!allowed.includes(name)) { allowed.push(name); target.dataFields = orderedFields(allowed); rerender = true; }
                target.requiredFields = orderedFields(required);
            } else target.requiredFields = orderedFields(required.filter(item => item !== name));
        }
        return { ok: true, rerender };
    }
    return null;
}

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
    if (group === 'data' && field === 'performance' && !['subtle', 'expressive'].includes(value)) return { ok: false, reason: 'invalid-prompt-field' };
    const isVirtual = (group === 'prompts' && field === 'enabledCombined')
        || ((group === 'prompts' || group === 'modules') && /^format:[\w-]+$/.test(field))
        || (group === 'modules' && /^(?:allow|require):[A-Za-z]+$/.test(field));
    if (!Object.hasOwn(fields, group) || !(isVirtual || fields[group].includes(field)))
        return { ok: false, reason: 'invalid-prompt-field' };
    const target = group === 'preset' ? editor.preset : group === 'data' ? editor.preset.data
        : editor.preset.data[group]?.find(block => block.identifier === id);
    if (!target) return { ok: false, reason: 'prompt-block-not-found' };
    const virtual = group === 'prompts' || group === 'modules' ? editVirtual(editor, group, target, id, field, value) : null;
    if (virtual) return virtual;
    if (group === 'prompts' && field === 'name' && !String(value ?? '').trim()) { delete target.name; return { ok: true }; }
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
