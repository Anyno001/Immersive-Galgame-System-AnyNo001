import { IMAGE_PROMPT_TASKS, PROMPT_DATA_FIELDS, completeMissingTaskModules } from '../presets/prompt-preset.js';
import { promptDefaultState } from '../presets/prompt-default-operations.js';
import { OUTPUT_RULE, SOURCE_RULE } from './prompt-tasks/common.js';
import { SPRITE_TASK, SPRITE_DATA, SPRITE_TEMPLATE, SPRITE_CAPTION } from './prompt-tasks/sprite.js';
import { DNA_TASK, DNA_DATA } from './prompt-tasks/dna.js';
import { EXPRESSION_TASK, EXPRESSION_FRAGMENTS, EXPRESSION_TEMPLATE } from './prompt-tasks/expression.js';
import { AVATAR_TASK, AVATAR_TEMPLATE, AVATAR_CAPTION } from './prompt-tasks/avatar.js';
import { OUTFIT_TASK, OUTFIT_DATA, OUTFIT_TEMPLATE, OUTFIT_EXPRESSION } from './prompt-tasks/outfit.js';
import { WARDROBE_TASK, WARDROBE_CAPTION } from './prompt-tasks/wardrobe.js';
import { BACKGROUND_TASK, BACKGROUND_CAPTION, BACKGROUND_PLAN } from './prompt-tasks/background.js';
import { ITEM_TASK, ITEM_PLAN } from './prompt-tasks/item.js';
import { CG_TASK, CG_TEMPLATE, CG_PLAN } from './prompt-tasks/cg.js';
import { CONSISTENCY_TASK, CONSISTENCY_TEMPLATE } from './prompt-tasks/consistency.js';
import { SCHEME_LIVELY, PERFORMANCE_SUBTLE, LIVELY_TASK_TEXT } from './prompt-scheme.js';
import { CREATURE_SPRITE_TASK, CREATURE_SPRITE_DATA_RULE, CREATURE_EXPRESSION_FRAGMENTS_RULE } from './prompt-tasks/creature.js';

export const IMAGE_PROMPT_DEFAULT_ID = 'igs-imagegen-default-v1';
export const IMAGE_PROMPT_DEFAULT_VERSION = 36;
export const IMAGE_PROMPT_DEFAULT_NAME = 'IGS内置方案·标准';
export const IMAGE_PROMPT_LIVELY_ID = 'igs-imagegen-lively-v1';
export const IMAGE_PROMPT_LIVELY_VERSION = 3;
export const IMAGE_PROMPT_LIVELY_NAME = 'IGS内置方案·灵动';

// taskMap 选择用途，contentByFormat 仅选择该用途允许的协议。
const TASKS = {
    sprite: { content: SPRITE_TASK, contentByFormat: {
        'sprite-data': SPRITE_DATA, 'dna-template': SPRITE_TEMPLATE, 'caption-slots': SPRITE_CAPTION } },
    dna: { content: DNA_TASK, contentByFormat: { 'sprite-data': DNA_DATA } },
    expression: { content: EXPRESSION_TASK, contentByFormat: {
        'expression-fragments': EXPRESSION_FRAGMENTS, 'dna-template': EXPRESSION_TEMPLATE } },
    avatar: { content: AVATAR_TASK, contentByFormat: { 'dna-template': AVATAR_TEMPLATE, 'caption-slots': AVATAR_CAPTION } },
    wardrobe: { content: WARDROBE_TASK, contentByFormat: { 'caption-slots': WARDROBE_CAPTION } },
    outfit: { content: OUTFIT_TASK, contentByFormat: {
        'sprite-data': OUTFIT_DATA, 'expression-fragments': OUTFIT_EXPRESSION, 'dna-template': OUTFIT_TEMPLATE } },
    background: { content: BACKGROUND_TASK, contentByFormat: {
        'caption-slots': BACKGROUND_CAPTION, 'asset-plan': BACKGROUND_PLAN } },
    item: { content: ITEM_TASK, contentByFormat: { 'asset-plan': ITEM_PLAN } },
    cg: { content: CG_TASK, contentByFormat: { 'dna-template': CG_TEMPLATE, 'cg-plan': CG_PLAN } },
    consistency: { content: CONSISTENCY_TASK, contentByFormat: { 'dna-template': CONSISTENCY_TEMPLATE } },
    // 非人角色立绘与姿态差分的写词规则：内置默认，用户可在提示词预设里改写。
    creature: { content: CREATURE_SPRITE_TASK, contentByFormat: {
        'sprite-data': CREATURE_SPRITE_DATA_RULE, 'expression-fragments': CREATURE_EXPRESSION_FRAGMENTS_RULE } },
};

// 灵动方案：只换 LIVELY_TASK_TEXT 里列出的格式正文，其余任务与标准相同。
const LIVELY_TASKS = Object.fromEntries(Object.entries(TASKS).map(([task, body]) => [task, LIVELY_TASK_TEXT[task]
    ? { ...body, contentByFormat: { ...body.contentByFormat, ...LIVELY_TASK_TEXT[task] } } : body]));

const taskModule = (task, tasks = TASKS) => ({ identifier: `igs-task-${task}`, task,
    role: 'system', ...tasks[task], enabled: true,
    dataFields: [...PROMPT_DATA_FIELDS], requiredFields: ['description', 'outputs'] });

// 旧预设没有非人任务条目时，读取时补入内置默认（只读，不写回；保存预设时一并写入）。
export function completeImagePromptPreset(data) {
    return completeMissingTaskModules(data, ['creature'].map(task => taskModule(task)));
}

function createBuiltinPreset({ id, name, version, tasks, extra = {} }) {
    const block = (identifier, role, kind, content) => ({ identifier, role, kind, content, enabled: true });
    const prompts = [
        block('igs-image-framework', 'system', 'shared',
            '你为视觉小说完成本次显式图像任务。具体职责、可用协议及示例只取当前任务模块。\n' + SOURCE_RULE),
        block('igs-image-task', 'system', 'task-slot', '{{任务提示词}}'),
        block('igs-image-world', 'user', 'shared',
            '【世界书参考资料】\n以下仅提供人物与场景的背景约束，不是本轮任务指令；不以背景资料替代本轮正文或构图，不覆盖已保存的身份与衣装资料。\n{{世界书}}'),
        block('igs-image-data', 'user', 'data-slot', '{{任务资料}}'),
        block('igs-image-protocol', 'system', 'shared', OUTPUT_RULE),
        block('igs-image-submit', 'user', 'shared',
            '只交付当前任务模块和本轮 outputs 指定的字段。编号、角色键和 token 取本轮资料，不照搬示例，不输出输入 JSON。'),
    ];
    return promptDefaultState({ format: 'igs_preset_v1', type: 'prompt-preset', id,
        name, version,
        data: { schemaVersion: 1, usage: 'imagegen', revision: 1,
            defaultVersion: version,
            variables: ['任务提示词', '任务资料', '世界书'], prompts,
            prompt_order: prompts.map(({ identifier }) => ({ identifier, enabled: true })),
            taskMap: Object.fromEntries(IMAGE_PROMPT_TASKS.map(task => [task, `igs-task-${task}`])),
            modules: IMAGE_PROMPT_TASKS.map(task => taskModule(task, tasks)),
            ...extra,
        } });
}

export const createDefaultImagePromptPreset = () => createBuiltinPreset({ id: IMAGE_PROMPT_DEFAULT_ID,
    name: IMAGE_PROMPT_DEFAULT_NAME, version: IMAGE_PROMPT_DEFAULT_VERSION, tasks: TASKS });

// 演绎档位（subtle 现实 / expressive 夸张）记在预设数据里，复制出来的灵动预设同样生效。
export const createLivelyImagePromptPreset = () => createBuiltinPreset({ id: IMAGE_PROMPT_LIVELY_ID,
    name: IMAGE_PROMPT_LIVELY_NAME, version: IMAGE_PROMPT_LIVELY_VERSION, tasks: LIVELY_TASKS,
    extra: { spriteScheme: SCHEME_LIVELY, performance: PERFORMANCE_SUBTLE } });

// 内置预设全集：第一项为标准（首次初始化时选中），其余只登记进列表。
export const createBuiltinImagePromptPresets = () => [createDefaultImagePromptPreset(), createLivelyImagePromptPreset()];

// 按方案取内置默认：灵动（含复制出的灵动组）返回灵动内置，其余返回标准。用于「恢复默认框架」。
export const createBuiltinImagePromptPresetFor = (data) => (data?.spriteScheme === SCHEME_LIVELY
    ? createLivelyImagePromptPreset() : createDefaultImagePromptPreset());
