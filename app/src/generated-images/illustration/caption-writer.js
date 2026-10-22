// 图像来源不是数据库生图插件时，由副 LLM 代替插件「写提示词」：
// 输入与插件同一份中文画面描述（含 slotid 份数要求），输出 NAI v4 caption，
// 供表情差分、Q 版头像、默认立绘与衣柜服装提示词共用；出图仍按当前图像来源。
import { FICTION_FRAME, SOFT_MODE_NOTE, TAG_WRITING_RULES, requestWithSoftRetry } from './prompt-kit.js';
import { DNA_TEMPLATE_WRITER_SYSTEM } from '../prompt-registry.js';
import { parseTemplateCaptionSlots } from './template-caption-parser.js';
import { checkPromptTask } from '../../schemas/prompt-recipe.js';
import { spriteIdentityRequirements, characterWritingContext, expressionWritingInput } from './character-prompt-task.js';
import { EXPRESSION_TASK, EXPRESSION_FRAGMENTS } from '../prompt-tasks/expression.js';
import { SPRITE_DATA_RULE, parseSpriteData } from './sprite-data.js';
import { CREATURE_SPRITE_DATA_RULE, CREATURE_EXPRESSION_FRAGMENTS_RULE, CREATURE_PRIORITY_NOTE, creatureCgRule } from '../prompt-tasks/creature.js';
import { creatureOf } from '../../scene/creature-profile.js';
import { prepareImageWritingRequest } from '../image-prompt-runtime.js';
import { imageWritingContext } from '../image-prompt-context.js';
import { secondaryLlmText } from '../../host/secondary-llm-result.js';
import { buildCgOutfitCatalog } from './cg-outfit-catalog.js';
import { CHARACTER_DNA_VIEWS, readCharacterDnaView } from '../../scene/character-dna.js';

export const LLM_SETUP_HINT = '请到「生图与AI › 备用模型」页接好备用模型';

const CAPTION_WRITER_RULES = [
    '用户给出一段中文画面要求，你按要求写 NovelAI 生图标签。要求里写了几份（slotid），就按顺序写几份，不要多也不要少。',
    ...TAG_WRITING_RULES,
    '每份分三行：scene 写人数、景别、机位、背景与光线；char 写这一个角色的外貌、服装、表情、动作；uc 写这一份要避开的负面标签，可留空。',
    '画面里没有角色时（例如只画一套衣服），char 留空。',
    '只输出下面的格式，不要解释、不要代码块：',
    '#1',
    'scene: ...',
    'char: ...',
    'uc: ...',
];

export const CAPTION_WRITER_SYSTEM = [...FICTION_FRAME, ...CAPTION_WRITER_RULES].join('\n');
const CAPTION_WRITER_SOFT_SYSTEM = [...FICTION_FRAME, ...CAPTION_WRITER_RULES, ...SOFT_MODE_NOTE].join('\n');

// 沿用酒馆 API 视为已接好；独立 API 要填地址和模型。
export function describeLlmReady(llmSettings = {}) {
    if (llmSettings.source !== 'openai') return { ok: true, error: '' };
    if (!String(llmSettings.endpoint || '').trim() || !String(llmSettings.model || '').trim()) {
        return { ok: false, error: `还没接副 LLM：${LLM_SETUP_HINT}，填好地址和模型，或改成沿用酒馆 API` };
    }
    return { ok: true, error: '' };
}

function side(base, char) {
    return { caption: { base_caption: base, char_captions: char == null ? [] : [{ char_caption: char, centers: [{ x: 0.5, y: 0.5 }] }] } };
}

export function parseCaptionSlots(text, options = {}) {
    if (options.slotIds) return parseRequiredCaptionSlots(text, options);
    const body = String(text || '').replace(/```[a-z]*\n?|```/gi, '').trim();
    if (!body) return { ok: false };
    const blocks = body.split(/^[ \t]*#[ \t]*(\d+)[ \t]*\r?$/m);
    const pairs = blocks.length > 1
        ? blocks.slice(1).reduce((list, item, index, all) => (index % 2 ? list : [...list, [Number(item), all[index + 1] || '']]), [])
        : [[1, body]];
    const captions = pairs.map(([slotId, block]) => {
        const read = (key) => {
            const m = String(block).match(new RegExp(`^[ \\t]*${key}[ \\t]*[:：][ \\t]*([^\\r\\n]*)\\r?$`, 'im'));
            return m ? m[1].trim() : '';
        };
        const scene = read('scene');
        const char = read('char');
        if (!scene && !char) return null;
        const hasChar = Boolean(char);
        return { slotId, caption: { v4_prompt: side(scene, hasChar ? char : null), v4_negative_prompt: side(read('uc'), hasChar ? '' : null) } };
    }).filter(Boolean);
    return captions.length ? { ok: true, captions } : { ok: false };
}

function parseRequiredCaptionSlots(text, { slotIds, noCharacters = false }) {
    const fail = (issue, field = 'slots', where = {}) => {
        const labels = { 'invalid-id': '输入图号集合无效', 'unknown-id': '回复图号不在本轮清单',
            'duplicate-id': '回复图号重复', 'invalid-field': '回复格式或字段无效',
            'duplicate-field': '字段重复', 'missing-field': '缺少必需图号或字段',
            'unexpected-character': '无人任务的 char 必须为空', 'code-fence': '回复含代码围栏包装' };
        return { ok: false, reason: 'caption-slot-fields-invalid',
            error: `写词图号或字段无效，未继续绘图 [字段=${field}；原因=${labels[issue]}；issue=${issue}${
                Object.entries(where).map(([key, value]) => `；${key}=${value}`).join('')}]`,
            diagnostic: { stage: 'prompt-parse', field, issue, ...where } };
    };
    if (!Array.isArray(slotIds) || !slotIds.length || new Set(slotIds).size !== slotIds.length
        || slotIds.some(id => !Number.isSafeInteger(id) || id < 1)) return fail('invalid-id');
    const rows = new Map();
    let current, currentId;
    const lines = secondaryLlmText(text).split(/\r?\n/);
    const position = (id, lineNumber) => ({
        ...(Number.isSafeInteger(id) && id >= 1 && id <= 9999 && { slotId: id }),
        ...(lineNumber !== undefined && { lineNumber }) });
    for (const [index, line] of lines.entries()) {
        if (!line.trim()) continue;
        const where = position(currentId, index + 1);
        if (/^(?:`{3,}|~{3,})/.test(line.trim())) return fail('code-fence', 'response_format', where);
        const header = line.match(/^#([1-9]\d*)[ \t]*$/);
        if (header) {
            const id = Number(header[1]);
            if (!slotIds.includes(id)) return fail('unknown-id', 'slots', position(id, index + 1));
            if (rows.has(id)) return fail('duplicate-id', 'slots', position(id, index + 1));
            currentId = id;
            current = {}; rows.set(id, current);
            continue;
        }
        const field = line.match(/^(scene|char|uc):[ \t]*(.*)$/i);
        if (!current || !field) return fail('invalid-field', 'slots', where);
        const key = field[1].toLowerCase();
        if (Object.hasOwn(current, key)) return fail('duplicate-field', key, where);
        current[key] = field[2].trim();
        current[`${key}Line`] = index + 1;
    }
    if (rows.size !== slotIds.length) return fail('missing-field', 'slots',
        position(slotIds.find(id => !rows.has(id))));
    for (const [id, row] of rows) {
        const missing = ['scene', 'char', 'uc'].find(key =>
            !Object.hasOwn(row, key) || (key === 'scene' && !row.scene));
        if (missing) return fail('missing-field', missing, position(id, row[`${missing}Line`]));
        if (noCharacters && row.char) return fail('unexpected-character', 'char', position(id, row.charLine));
    }
    return { ok: true, captions: slotIds.map(slotId => {
        const row = rows.get(slotId), char = row.char || null;
        return { slotId, caption: { v4_prompt: side(row.scene, char), v4_negative_prompt: side(row.uc, char ? '' : null) } };
    }) };
}

// 返回形状与数据库生图插件的 writeDbgenPrompt 一致：{ ok, caption, captions: [{ slotId, caption }] }。
export async function writeCaptionsWithLlm(llm, llmSettings, description, meta = {}) {
    const context = imageWritingContext(meta);
    if (!context.ok) return context;
    meta = context.value;
    const execute = (guarded, lease) => writeCaptions(llm,
        lease?.state?.config?.autoIllustration?.llm || llmSettings, description, guarded);
    return typeof llm?.runImageTask === 'function' ? llm.runImageTask(meta, execute) : execute(meta);
}

async function writeCaptions(llm, llmSettings, description, meta) {
    if (!llm || typeof llm.request !== 'function') return { ok: false, error: `副 LLM 不可用：${LLM_SETUP_HINT}` };
    const user = String(description || '').trim();
    if (!user) return { ok: false, error: '没有可交给副 LLM 的画面描述' };
    const result = await requestWithSoftRetry(llm, {
        validateSettings: describeLlmReady,
        system: CAPTION_WRITER_SYSTEM,
        softSystem: CAPTION_WRITER_SOFT_SYSTEM,
        user,
        ...(meta.signal && { signal: meta.signal }),
        ...(meta.shouldStart && { shouldStart: meta.shouldStart }),
        ...(meta.onRecovery && { onRecovery: meta.onRecovery }),
        imagePrompt: { task: meta.imagePromptTask || 'sprite', input: { description: user,
            ...(meta.contextMode !== undefined && { contextMode: meta.contextMode }),
            ...(meta.originalPrompt !== undefined && { originalPrompt: meta.originalPrompt }),
            ...(meta.layout !== undefined && { layout: meta.layout }),
            ...(meta.characterContext !== undefined && { characterContext: meta.characterContext }),
            ...(meta.numberedText !== undefined && { numberedText: meta.numberedText }),
            ...(meta.previousText !== undefined && { previousText: meta.previousText }),
            ...(meta.lore !== undefined && { lore: meta.lore }),
            ...(meta.userPrompts !== undefined && { userPrompts: meta.userPrompts }),
            ...(meta.writingRequirements !== undefined && { writingRequirements: meta.writingRequirements }),
            outputs: { ...meta.outputs, format: 'caption-slots' } } },
        parse: reply => parseCaptionSlots(reply, typeof llm.prepareImagePrompt === 'function' && meta.outputs?.slotIds
            ? { slotIds: meta.outputs.slotIds,
                noCharacters: meta.imagePromptTask === 'background' || meta.imagePromptTask === 'wardrobe' }
            : {}),
    }, llmSettings);
    if (!result.ok) return { ...result, error: `副 LLM 写提示词失败：${result.error}` };
    return { ok: true, caption: result.captions[0].caption, captions: result.captions };
}

// 输出纠正沿用原协议与整批资料，不改为温和模板或本地补造字段。
export async function writeTemplateCaptionsWithLlm(llm, llmSettings, meta = {}) {
    const context = imageWritingContext(meta);
    if (!context.ok) return context;
    meta = context.value;
    const execute = (guarded, lease) => writeTemplateCaptions(llm,
        lease?.state?.config?.autoIllustration?.llm || llmSettings, guarded);
    return typeof llm?.runImageTask === 'function' ? llm.runImageTask(meta, execute) : execute(meta);
}

async function writeTemplateCaptions(llm, llmSettings, meta) {
    const task = checkPromptTask(meta.promptTask, meta.characterContext);
    if (!task.ok) return task;
    const dataOnly = ['sprite-data', 'expression-fragments'].includes(meta.outputs?.format);
    if (!task.value) return { ok: false, reason: 'PROMPT_MODE_CONFLICT', error: '动态写词缺少显式任务' };
    if (!llm || typeof llm.request !== 'function') return { ok: false, error: `副 LLM 不可用：${LLM_SETUP_HINT}` };
    let description = String(meta.description || '').trim();
    if (!description) return { ok: false, error: '没有可交给副 LLM 的画面描述' };
    if (['sprite', 'expression', 'outfit', 'avatar'].includes(meta.imagePromptTask || task.value.purpose)
        && typeof meta.writingRequirements?.transparent === 'boolean') {
        const ground = meta.writingRequirements.transparent
            ? '本次生成透明背景的人物立绘，人物轮廓外保持透明。'
            : '本次生成纯白背景的人物立绘，人物轮廓外为均匀纯白色。';
        const deliver = dataOnly
            ? '本轮按指定字段输出角色资料或表情。'
            : `完整画面提示词的 scene 写明 ${meta.writingRequirements.transparent ? 'transparent background' : 'white background'}。`;
        description = `${ground}\n${deliver}\n${description}`;
    }
    // 非人角色：规则随任务描述发送（内置预设的任务模块按人类衣装与表情撰写，不改预设结构），并声明优先于模块条款。
    const creatureSystem = dataOnly && Array.isArray(meta.characterContext) && meta.characterContext.length > 0
        && meta.characterContext.every(c => creatureOf(c.dna))
        ? (meta.outputs?.format === 'expression-fragments' ? CREATURE_EXPRESSION_FRAGMENTS_RULE : CREATURE_SPRITE_DATA_RULE) : '';
    // 走预设装配时规则在预设的非人任务条目里（可编辑）；旧的独立调用仍把规则随描述发送。
    const creaturePreset = Boolean(creatureSystem) && typeof llm.prepareImagePrompt === 'function';
    if (creatureSystem && !creaturePreset) description = [CREATURE_PRIORITY_NOTE, creatureSystem, description].join('\n');
    // 非人角色 CG 出镜：角色池里有已登记的非人角色时附加专属规则；纯人类池得到空串，描述不变。
    const creatureCg = task.value.purpose === 'cg' ? creatureCgRule(meta.characterContext) : '';
    if (creatureCg) description = [creatureCg, description].join('\n');
    const stale = () => meta.signal?.aborted || (typeof meta.shouldStart === 'function' && !meta.shouldStart());
    if (stale()) return { ok: false, reason: 'request-stale', error: '任务已取消或目标失效' };
    const frozenContext = structuredClone(meta.characterContext);
    const outfitData = task.value.purpose === 'derived' && meta.imagePromptTask === 'outfit'
        && meta.outputs?.format === 'sprite-data';
    const outfitCatalog = task.value.outfitSelection === 'catalog' ? buildCgOutfitCatalog(frozenContext) : undefined;
    const writingContext = outfitCatalog
        ? frozenContext.map(({ characterKey, dna }) => ({ characterKey,
            availableFrames: CHARACTER_DNA_VIEWS.filter(frame => readCharacterDnaView(dna, frame).ok) }))
        : characterWritingContext(frozenContext, { targetOutfitOnly: outfitData });
    const input = structuredClone({ promptTask: task.value, characterContext: writingContext,
        ...(outfitCatalog && { outfitCatalog: outfitCatalog.map(({ id, characterKey, name }) => ({ id, characterKey, name })) }),
        ...(meta.contextMode !== undefined && { contextMode: meta.contextMode }),
        ...(meta.originalPrompt !== undefined && { originalPrompt: meta.originalPrompt }),
        ...(meta.layout !== undefined && { layout: meta.layout }),
        ...(meta.lore !== undefined && { lore: meta.lore }),
        ...(meta.numberedText !== undefined && { numberedText: meta.numberedText }),
        ...(meta.previousText !== undefined && { previousText: meta.previousText }),
        ...(!outfitData && meta.userPrompts !== undefined && { userPrompts: meta.userPrompts }),
        ...(meta.writingRequirements !== undefined && { writingRequirements: meta.writingRequirements }) });
    const outputs = {
        ...(task.value.slots && {
            slotIds: task.value.slots.map(slot => slot.slotId),
            // token 属于任务；captionIndex 只按本图 Char 顺序编号。
            rows: task.value.slots.flatMap(slot => slot.tokens.map((token, captionIndex) => {
                const character = task.value.characters.find(row => row.token === token);
                return { slotId: slot.slotId, captionIndex, token, characterKey: character.characterKey,
                    kind: character.kind || 'named',
                    ...(character.framing !== undefined && { framing: character.framing }) };
            })),
        }),
        ...(meta.outputs !== undefined && meta.outputs), format: dataOnly ? meta.outputs.format : 'dna-template',
        ...(task.value.purpose === 'sprite' && {
            identityRequirements: spriteIdentityRequirements(task.value, input.characterContext, dataOnly ? meta.outputs.format : 'dna-template') }),
    };
    const fragments = meta.outputs?.format === 'expression-fragments';
    let modelInput = { ...input, description, outputs };
    if (fragments) {
        const compact = expressionWritingInput(task.value, frozenContext);
        if (!compact.ok) return compact;
        modelInput = { ...compact.value, description, contextMode: 'provided',
            ...((meta.writingRequirements?.nsfw !== undefined || typeof meta.writingRequirements?.transparent === 'boolean') && {
                writingRequirements: {
                    ...(meta.writingRequirements.nsfw !== undefined && { nsfw: meta.writingRequirements.nsfw }),
                    ...(typeof meta.writingRequirements.transparent === 'boolean' && { transparent: meta.writingRequirements.transparent }),
                } }) };
    }
    const reprepare = () => prepareImageWritingRequest(llm,
        creaturePreset ? 'creature' : meta.imagePromptTask || (task.value.purpose === 'derived' ? 'expression' : task.value.purpose),
        { ...modelInput, ...(meta.signal && { signal: meta.signal }),
            ...(meta.shouldStart && { shouldStart: meta.shouldStart }) },
        { system: creatureSystem || (fragments ? [EXPRESSION_TASK, EXPRESSION_FRAGMENTS].join('\n')
            : dataOnly ? SPRITE_DATA_RULE : meta.systemPrompt || DNA_TEMPLATE_WRITER_SYSTEM),
            user: fragments ? JSON.stringify(modelInput)
                : description + '\n本次任务与角色资料（仅作输入，不输出 JSON）：\n' + JSON.stringify({ ...input, outputs }) });
    const prepared = await reprepare();
    if (!prepared.ok) return prepared;
    if (stale()) return { ok: false, reason: 'request-stale', stopGeneration: true, error: '任务已取消或目标失效' };
    const parse = reply => dataOnly ? parseSpriteData(reply, { ...meta, characterContext: frozenContext, promptTask: task.value, outputs })
        : parseTemplateCaptionSlots(reply, { ...input, outputs, characterContext: frozenContext,
        ...(outfitCatalog && { outfitCatalog }),
        ...(meta.autoSpriteOutfitNames !== undefined && {
            autoSpriteOutfitNames: meta.autoSpriteOutfitNames }),
        ...(meta.characterContextForEntry !== undefined && {
            characterContextForEntry: meta.characterContextForEntry }) });
    const parsed = await requestWithSoftRetry(llm, { preparedRequest: prepared.request, reprepare, parse,
        validateSettings: describeLlmReady,
        ...(meta.signal && { signal: meta.signal }), ...(meta.shouldStart && { shouldStart: meta.shouldStart }),
        ...(meta.onRecovery && { onRecovery: meta.onRecovery }) }, llmSettings);
    if (!parsed.ok) return parsed;
    const first = parsed.captions[0];
    return { ok: true, caption: first.caption, captions: parsed.captions,
        characterMeta: first.characterMeta, promptRecipe: first.promptRecipe, promptTask: task.value,
        ...(first.expression !== undefined && { expression: first.expression }),
        ...(first.dnaCandidates !== undefined && { dnaCandidates: first.dnaCandidates }),
        ...(first.width !== undefined && { width: first.width, height: first.height }) };
}
