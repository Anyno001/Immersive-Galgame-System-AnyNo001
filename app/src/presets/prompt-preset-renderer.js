import { clonePromptData, IMAGE_PROMPT_TASKS, PROVIDED_PROMPT_DATA_FIELDS, validatePromptActivation } from './prompt-preset.js';

const fail = (reason, errors = []) => ({ ok: false, reason, errors });
const present = (value) => value !== undefined && value !== null && value !== '';
const worldInfoVariable = /\{\{\s*世界书\s*\}\}/g;

// 预览和发送共用：只在声明槽中替换一次，不求值注入资料里的占位符。
export function renderImagePromptPreset(data, task, input = {}) {
    const checked = validatePromptActivation(data);
    if (!checked.ok) return fail('prompt-not-activatable', checked.errors);
    if (!IMAGE_PROMPT_TASKS.includes(task)) return fail('unknown-image-prompt-task');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('invalid-prompt-data');
    if (input.contextMode !== undefined && input.contextMode !== 'provided') return fail('PROMPT_CONTEXT_MODE');
    const module = data.modules.find((item) => item.identifier === data.taskMap[task]);
    const fields = input.contextMode === 'provided'
        ? module.dataFields.filter(field => PROVIDED_PROMPT_DATA_FIELDS.includes(field)) : module.dataFields;
    // 禁止字段若被模块设为必需，明确拒绝，不读取该字段或悄悄回退。
    const missing = module.requiredFields.filter((field) => !fields.includes(field) || !present(input[field]));
    if (missing.length) return fail('missing-prompt-data', missing.map((field) => ({ field, reason: 'required' })));
    let context;
    try {
        context = clonePromptData(Object.fromEntries(fields
            .filter((field) => Object.hasOwn(input, field) && input[field] !== undefined)
            .map((field) => [field, input[field]])));
    } catch {
        return fail('invalid-prompt-data');
    }
    const format = context.outputs?.format;
    const selectContent = block => {
        if (block.contentByFormat === undefined) return block.content;
        if (typeof format !== 'string' || !Object.hasOwn(block.contentByFormat, format)) return undefined;
        return [block.content, block.contentByFormat[format]].filter(Boolean).join('\n');
    };
    // taskMap 先选具体任务；格式只在该任务内部选择，绝不合并其他任务规则。
    const moduleContent = selectContent(module);
    if (moduleContent === undefined) return fail('unsupported-prompt-format', [{ field: 'outputs.format', reason: 'unmapped-format' }]);
    const byId = new Map(data.prompts.map((block) => [block.identifier, block]));
    const blocks = [];
    let needsWorldInfo = false;
    const fillReference = content => {
        if (data.literalVariables?.includes('世界书')) return content;
        if (!/\{\{\s*世界书\s*\}\}/.test(content)) return content;
        needsWorldInfo = true;
        return content.replace(worldInfoVariable, () => typeof input.worldInfo === 'string' ? input.worldInfo : '');
    };
    for (const entry of data.prompt_order.filter(entry => entry.enabled !== false)) {
        const block = byId.get(entry.identifier);
        if (block.enabled === false) continue;
        const source = block.kind === 'task-slot' ? moduleContent
            : block.kind === 'data-slot' ? JSON.stringify(context) : selectContent(block);
        if (source === undefined) return fail('unsupported-prompt-format', [{
            field: `prompts.${block.identifier}.contentByFormat`, reason: 'unmapped-format' }]);
        // 提供资料模式整块省略世界书参考，既不扫描也不读取资料 getter。
        const reference = block.kind !== 'data-slot' && !data.literalVariables?.includes('世界书')
            && /\{\{\s*世界书\s*\}\}/.test(source);
        if (reference && input.contextMode === 'provided') continue;
        const content = block.kind === 'data-slot' ? source : fillReference(source);
        blocks.push({ identifier: block.identifier, role: block.role, content });
    }
    const messages = blocks.map(({ role, content }) => ({ role, content }));
    return { ok: true, task, revision: data.revision, moduleId: module.identifier,
        blocks, needsWorldInfo, request: { messages } };
}
