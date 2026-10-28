// 写词预设结构校验与激活校验分离：兼容存档不能冒充可执行预设。
export const IMAGE_PROMPT_TASKS = Object.freeze([
    'sprite', 'dna', 'expression', 'avatar', 'wardrobe', 'outfit', 'background', 'item', 'cg', 'consistency',
    'creature',
]);
// 后加入的任务：旧预设没有这些条目时校验不报错，读取时由内置默认补齐（见 completeMissingTaskModules）。
export const COMPLETABLE_IMAGE_TASKS = Object.freeze(['creature']);
export const IMAGE_PROMPT_FORMATS = Object.freeze([
    'sprite-data', 'expression-fragments', 'dna-template', 'caption-slots', 'asset-plan', 'cg-plan',
]);
export const PROMPT_VARIABLES = Object.freeze(['任务提示词', '任务资料', '世界书', '当前上下文',
    '角色库', '特征参考', '常驻标签', '近期生图记录', '构图标签', '用户描述']);
export const clonePromptData = (value) => JSON.parse(JSON.stringify(value));
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const roles = new Set(['system', 'user', 'assistant']);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const error = (field, reason) => ({ presetType: 'prompt-preset', field, reason });

export function validatePromptPreset(data) {
    // 已存在的通用 prompt-preset 不强制转换为生图用途。
    if (!object(data)) return { ok: false, errors: [error('data', 'invalid-data')] };
    if (data.usage !== 'imagegen') return { ok: true, data: clonePromptData(data), errors: [] };
    const errors = [];
    if (data.schemaVersion !== 1) errors.push(error('schemaVersion', 'unsupported-version'));
    if (!Number.isInteger(data.revision) || data.revision < 1) errors.push(error('revision', 'invalid-revision'));
    const ids = new Set();
    if (!Array.isArray(data.prompts) || !data.prompts.length) errors.push(error('prompts', 'missing-blocks'));
    for (const [index, block] of (Array.isArray(data.prompts) ? data.prompts : []).entries()) {
        const field = `prompts.${index}`;
        if (!object(block) || !text(block.identifier)) { errors.push(error(field, 'missing-id')); continue; }
        if (ids.has(block.identifier)) errors.push(error(field, 'duplicate-id'));
        ids.add(block.identifier);
        if (!roles.has(block.role)) errors.push(error(`${field}.role`, 'invalid-role'));
        if (typeof block.content !== 'string') errors.push(error(`${field}.content`, 'invalid-content'));
        for (const key of ['enabled', 'workbenchOnly']) {
            if (block[key] !== undefined && typeof block[key] !== 'boolean') errors.push(error(`${field}.${key}`, 'invalid-boolean'));
        }
    }
    const ordered = new Set();
    if (!Array.isArray(data.prompt_order) || !data.prompt_order.length) errors.push(error('prompt_order', 'missing-order'));
    for (const [index, entry] of (Array.isArray(data.prompt_order) ? data.prompt_order : []).entries()) {
        if (!object(entry) || !ids.has(entry.identifier)) errors.push(error(`prompt_order.${index}`, 'dangling-order'));
        if (ordered.has(entry?.identifier)) errors.push(error(`prompt_order.${index}`, 'duplicate-order'));
        ordered.add(entry?.identifier);
        if (entry?.enabled !== undefined && typeof entry.enabled !== 'boolean') errors.push(error(`prompt_order.${index}.enabled`, 'invalid-boolean'));
    }
    return { ok: !errors.length, data: clonePromptData(data), errors };
}
export const PROMPT_DATA_FIELDS = Object.freeze(['description', 'promptTask', 'characterContext', 'outfitCatalog',
    'userPrompts', 'writingRequirements', 'numberedText', 'previousText', 'lore', 'characters', 'scenes',
    'originalPrompt', 'layout', 'outputs']);
// 提供资料模式只消费当前任务资料，不能由自定义模块重新开放剧情或外部资料。
export const PROVIDED_PROMPT_DATA_FIELDS = Object.freeze(['description', 'promptTask', 'characterContext', 'outfitCatalog',
    'userPrompts', 'writingRequirements', 'originalPrompt', 'layout', 'outputs']);

export function validatePromptActivation(data) {
    const structural = validatePromptPreset(data);
    if (!structural.ok) return structural;
    if (data.usage !== 'imagegen') return { ok: false, errors: [error('usage', 'not-imagegen')] };
    const errors = [], byId = new Map(data.prompts.map((block) => [block.identifier, block]));
    const active = data.prompt_order.filter((entry) => entry.enabled !== false)
        .map((entry) => byId.get(entry.identifier)).filter((block) => block.enabled !== false);
    const slots = ['task-slot', 'data-slot'].map((kind) => active.filter((block) => block.kind === kind));
    for (const [index, kind] of ['task-slot', 'data-slot'].entries()) {
        if (slots[index].length !== 1) errors.push(error(kind, 'slot-count'));
    }
    for (const block of active) {
        const field = `prompts.${block.identifier}`;
        if (!['shared', 'task-slot', 'data-slot'].includes(block.kind)) errors.push(error(field, 'unmapped-block'));
        if ((block.injection_position ?? 0) !== 0 || (block.injection_depth ?? 0) !== 0)
            errors.push(error(field, 'unsupported-injection'));
        for (const key of Object.keys(block)) {
            if (!['identifier', 'name', 'role', 'content', 'enabled', 'workbenchOnly', 'kind',
                'injection_position', 'injection_depth', 'injection_order', 'metadata', 'contentByFormat'].includes(key))
                errors.push(error(`${field}.${key}`, 'unknown-execution-field'));
        }
        validateFormatContent(block, field, data, errors);
    }
    for (const [index, variable] of ['任务提示词', '任务资料'].entries()) {
        const slot = slots[index][0];
        if (slot && slot.content.trim() !== `{{${variable}}}`) errors.push(error(slot.kind, 'invalid-slot-content'));
        const count = active.reduce((sum, block) => sum + [...block.content.matchAll(/\{\{([^{}]+)\}\}/g)]
            .filter((match) => match[1].trim() === variable).length, 0);
        if (count !== 1) errors.push(error(variable, 'slot-count'));
    }
    validateModules(data, slots[0][0], errors);
    for (const block of active) validateVariables(block.content, `prompts.${block.identifier}`, data, errors);
    return { ok: !errors.length, errors };
}


function validateModules(data, taskSlot, errors) {
    const modules = Array.isArray(data.modules) ? data.modules : [], byId = new Map();
    for (const [index, module] of modules.entries()) {
        const field = `modules.${index}`;
        if (!object(module) || !text(module.identifier)) { errors.push(error(field, 'missing-id')); continue; }
        if (byId.has(module.identifier)) errors.push(error(field, 'duplicate-id'));
        byId.set(module.identifier, module);
        if (!IMAGE_PROMPT_TASKS.includes(module.task)) errors.push(error(`${field}.task`, 'unknown-task'));
        if (!roles.has(module.role) || (taskSlot && module.role !== taskSlot.role)) errors.push(error(`${field}.role`, 'module-role-mismatch'));
        if (typeof module.content !== 'string' || !module.content.trim()) errors.push(error(`${field}.content`, 'invalid-content'));
        if (module.enabled !== undefined && typeof module.enabled !== 'boolean') errors.push(error(`${field}.enabled`, 'invalid-boolean'));
        if (!Array.isArray(module.dataFields) || module.dataFields.some((key) => !PROMPT_DATA_FIELDS.includes(key))
            || new Set(module.dataFields).size !== module.dataFields.length) errors.push(error(`${field}.dataFields`, 'invalid-data-fields'));
        if (!Array.isArray(module.requiredFields) || !Array.isArray(module.dataFields)
            || module.requiredFields.some((key) => !module.dataFields.includes(key)))
            errors.push(error(`${field}.requiredFields`, 'invalid-required-fields'));
        if (typeof module.content === 'string') validateVariables(module.content, field, data, errors);
        validateFormatContent(module, field, data, errors);
    }
    if (!object(data.taskMap)) { errors.push(error('taskMap', 'missing-task-map')); return; }
    for (const [task, id] of Object.entries(data.taskMap)) {
        const module = byId.get(id);
        if (!IMAGE_PROMPT_TASKS.includes(task)) errors.push(error(`taskMap.${task}`, 'unknown-task'));
        if (!module || module.enabled === false || module.task !== task) errors.push(error(`taskMap.${task}`, 'module-task-mismatch'));
    }
    for (const task of IMAGE_PROMPT_TASKS) {
        if (!Object.hasOwn(data.taskMap, task) && !COMPLETABLE_IMAGE_TASKS.includes(task)) errors.push(error(`taskMap.${task}`, 'missing-task-module'));
    }
}

function validateFormatContent(block, field, data, errors) {
    if (block.contentByFormat === undefined) return;
    if (!object(block.contentByFormat) || (block.kind && block.kind !== 'shared')) {
        errors.push(error(`${field}.contentByFormat`, 'invalid-format-content'));
        return;
    }
    for (const [format, content] of Object.entries(block.contentByFormat)) {
        if (!IMAGE_PROMPT_FORMATS.includes(format) || !text(content)) {
            errors.push(error(`${field}.contentByFormat`, 'invalid-format-content'));
            continue;
        }
        validateVariables(content, `${field}.contentByFormat.${format}`, data, errors);
        if (/\{\{\s*(?:任务提示词|任务资料)\s*\}\}/.test(content))
            errors.push(error(`${field}.contentByFormat.${format}`, 'invalid-slot-content'));
    }
}

function validateVariables(content, field, data, errors) {
    const variables = Array.isArray(data.variables) ? data.variables : [];
    const literals = Array.isArray(data.literalVariables) ? data.literalVariables : [];
    for (const match of content.matchAll(/\{\{([^{}]+)\}\}/g)) {
        const name = match[1].trim();
        if (!literals.includes(name) && (!variables.includes(name) || !['任务提示词', '任务资料', '世界书'].includes(name)))
            errors.push(error(field, 'unsupported-variable'));
    }
}

// 只读补齐：旧预设缺少后加入的任务（taskMap 无此任务）时，返回补入内置默认模块的新对象，不改入参、不改用户已有条目。
// defaults 为内置模块（identifier、task、content 等）；标识符被占用时顺延编号。无需补齐时原样返回同一个对象。
// 带默认基线的预设同时把该模块补进基线副本，「恢复默认正文」才找得到。
export function completeMissingTaskModules(data, defaults) {
    if (!object(data) || data.usage !== 'imagegen' || !object(data.taskMap) || !Array.isArray(data.modules)) return data;
    const missing = (Array.isArray(defaults) ? defaults : []).filter((module) => COMPLETABLE_IMAGE_TASKS.includes(module.task)
        && !Object.hasOwn(data.taskMap, module.task));
    if (!missing.length) return data;
    const used = new Set(data.modules.map((module) => module && module.identifier));
    const added = [], taskMap = { ...data.taskMap };
    for (const module of missing) {
        let identifier = module.identifier, n = 1;
        while (used.has(identifier)) identifier = `${module.identifier}-${n++}`;
        used.add(identifier);
        added.push({ ...clonePromptData(module), identifier });
        taskMap[module.task] = identifier;
    }
    const next = { ...data, modules: [...data.modules, ...added], taskMap };
    const baseline = data.defaultState && data.defaultState.baseline;
    if (object(baseline) && Array.isArray(baseline.modules)) {
        const have = new Set(baseline.modules.map((module) => module && module.identifier));
        const extra = missing.filter((module) => !have.has(module.identifier)).map((module) => clonePromptData(module));
        if (extra.length) next.defaultState = { ...data.defaultState, baseline: { ...baseline, modules: [...baseline.modules, ...extra] } };
    }
    return next;
}
