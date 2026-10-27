// 资料／表情协议不接收画面正文；默认立绘由程序模板组装。
import { CHARACTER_DNA_REQUIRED_VIEWS, CHARACTER_DNA_VIEWS, checkDnaViews, checkCharacterPersonality } from '../../scene/character-dna.js';
import { isValidOutfitName } from '../../scene/character-outfits.js';
import { savedExpressionTemplate, bindAutoSpriteOutfitNames } from './character-prompt-task.js';
import { checkPromptOutput, checkPromptTask } from '../../schemas/prompt-recipe.js';
import { DNA_WEIGHT_RULE, OUTFIT_HALF_BODY_RULE } from '../prompt-tasks/common.js';
import { creatureOf } from '../../scene/creature-profile.js';

export const SPRITE_DATA_RULE = [
    '仅 outputs.format 为 sprite-data 或 expression-fragments 时执行本段：只提取可复用资料，不生成 scene、char、构图、姿势、背景或完整绘图提示词。其他格式不执行本段。',
    '【先交图头】回复第一行必须是 slotid: 本轮实际槽号，第二行才写 character: 该槽唯一 token 对应的 promptTask.characters.characterKey。只有一个角色或一份资料也不能省略 slotid；输入中的 slotId 不能代替回复图头。每份从 slotid 重新开始，只输出本轮清单，角色键逐字照抄，不写 token、别名、译名或 DNA 中的英文名；字段各一次，多份用独立行 --- 分隔。',
    '资料字段直接写 字段名: 值，不带 Char 索引或竖线，不加 meta_ 前缀。景别字段为 dna_full_body、dna_half_body、dna_portrait，新身份及身份 UC 只写逗号分隔的英文 TAG，细节同样用标签，不写自然语言或人物介绍；已有身份逐字保留。expression-fragments 同样按槽号和角色键绑定，不带索引。',
    '缺身份景别时输出 dna_full_body、dna_half_body、dna_portrait，以及可选 dna_uc_对应景别。三份从同一纯 TAG 外貌母版仅删除画外部位标签，共同标签逐字相同，权重组保持完整闭合；已有景别逐字保留。身份只含稳定外貌，不含衣装、当次表情、灰尘、临时伤势、动作或场景。',
    DNA_WEIGHT_RULE,
    OUTFIT_HALF_BODY_RULE,
    '身份主语中的躯干、四肢和颈部直接描述身体本身，不夹带身穿何物、衣领露出什么、裤子或靴子；穿戴内容只放 outfit_description。dna_uc_* 只写对应身份的英文排除项，无额外排除项可省略或留空，不写默认值说明、沿用正向、表情姿势说明或交付指令。',
    '仅 sprite 任务且 personality 字段缺失时另写 personality: 独立英文性格特点；只描述稳定性格，无依据留空，不写外貌、衣装、动作或当次心情。不得把性格复制进各景别。已有性格可省略或逐字保留，显式空值不补建。derived 衣装提取不输出身份和性格。',
    '每份写 outfit_name 和 outfit_description。衣装原名逐字沿用输入，已保存说明逐字复用；缺说明时建立纯英文 TAG 服装 DNA，逐件绑定颜色、款式及适用长度，材质、剪裁及细节也只用标签，首次未指定细节协调补全。不写自然语言、人物身份、表情、动作或背景。',
    'expression-fragments 每份仅写 slotid、character、expression、expression_uc；只写指定表情的眼、眉、嘴等可见变化，可按性格表现，不写身份、衣装、身体姿势、道具、背景、镜头、底色或质量词。expression 非空，expression_uc 可空。',
    '不输出占位符、JSON、代码围栏、分析或思考正文，不照搬剧情的坐姿、动作和地点。',
].join('\n');
const fail = (field, issue = 'invalid', where = {}) => ({ ok: false, reason: 'SPRITE_DATA_INVALID',
    error: `立绘资料字段无效 [字段=${field}；原因=${issue}${where.lineNumber ? `；lineNumber=${where.lineNumber}` : ''}]；未继续绘图`,
    diagnostic: { stage: 'prompt-parse', field, issue, ...where } });
const validText = value => typeof value === 'string' && value.length <= 4096 && !/<<\s*(?:dna|outfit)/i.test(value);
const viewFields = CHARACTER_DNA_VIEWS.flatMap(view => [`dna_${view}`, `dna_uc_${view}`]);

function locateFailure(result, row) {
    const field = result.diagnostic?.field || '';
    const match = /^dna\.views\.([^.]+)\.(subject|negative)$/.exec(field);
    const key = match ? `dna_${match[2] === 'negative' ? 'uc_' : ''}${match[1]}` : field === 'dna.personality' ? 'personality' : field;
    const lineNumber = row.lines[key];
    return { ...result, error: result.error + (lineNumber ? ` [lineNumber=${lineNumber}]` : ''),
        diagnostic: { ...result.diagnostic, slotId: row.slotId, captionIndex: 0,
            ...(lineNumber !== undefined && { lineNumber }) } };
}

export function parseSpriteData(text, meta) {
    const task = checkPromptTask(meta.promptTask, meta.characterContext);
    if (!task.ok) return task;
    if (!task.value || !['sprite', 'derived'].includes(task.value.purpose)
        || !['sprite-data', 'expression-fragments'].includes(meta.outputs?.format)) return fail('task');
    meta = { ...meta, promptTask: task.value };
    const fragments = meta.outputs?.format === 'expression-fragments';
    if (fragments && task.value.purpose !== 'derived') return fail('task');
    const slots = task.value.slots || [{ slotId: 1, tokens: task.value.characters.map(c => c.token) }];
    // 仅由已校验的单份立绘请求确定缺省绑定，不按回复数量或顺序猜号。
    const implicitSlot = !fragments && task.value.purpose === 'sprite' && task.value.characters.length === 1
        && slots.length === 1 && slots[0].tokens.length === 1
        && slots[0].tokens[0] === task.value.characters[0].token ? slots[0] : undefined;
    // 非人角色与灵动方案另有默认姿态字段 pose / pose_uc；非人角色没有衣装字段要求。
    const allowed = new Set(['slotid', 'character', ...(fragments ? ['expression', 'expression_uc']
        : ['outfit_name', 'outfit_description', 'outfit_half_body', 'personality', ...viewFields, 'pose', 'pose_uc'])]);
    const rows = new Map();
    let row;
    for (const [index, line] of String(text || '').split(/\r?\n/).entries()) {
        if (!line.trim()) continue;
        if (line.trim() === '---') { row = undefined; continue; }
        const match = /^(\w+):[ \t]*(.*)$/.exec(line.trim());
        const where = { lineNumber: index + 1, ...(row && { slotId: row.slotId }) };
        if (!match || !allowed.has(match[1])) return fail('response_format', 'invalid', where);
        const [, key, value] = match;
        if (key === 'slotid') {
            const id = Number(value);
            if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id) || rows.has(id)) return fail('slotid', 'invalid', where);
            row = { slotId: id, lines: {} }; rows.set(id, row);
        } else {
            if (!row) {
                if (!implicitSlot || rows.size || key !== 'character') return fail('slotid', 'missing', where);
                row = { slotId: implicitSlot.slotId, lines: {} }; rows.set(row.slotId, row);
            }
            if (Object.hasOwn(row, key)) return fail(key, 'duplicate', where);
            if (!viewFields.includes(key) && !validText(value)) return fail(key, 'invalid', where);
            row[key] = value; row.lines[key] = index + 1;
        }
    }
    return assembleSpriteData(rows, meta, fragments, slots);
}

function assembleSpriteData(rows, meta, fragments, slots) {
    const task = meta.promptTask, context = meta.characterContext;
    if (!Array.isArray(context) || rows.size !== slots.length
        || slots.some(slot => !rows.has(slot.slotId) || slot.tokens?.length !== 1)) return fail('slots', 'mismatch');
    const captions = [];
    for (const slot of slots) {
        const row = rows.get(slot.slotId), character = task.characters.find(c => c.token === slot.tokens[0]);
        const source = context.find(c => c.characterKey === character?.characterKey);
        if (!source || row.character !== character.characterKey) return fail('character', 'mismatch');
        const data = fragments ? readExpression(row) : readIdentity(row, source, task.purpose);
        if (!data.ok) return locateFailure(data, row);
        // 默认姿态来自写词的 pose，缺省时由程序模板取平和或物种待机词。
        if (!fragments && row.pose?.trim()) data.expression = { positive: row.pose, negative: row.pose_uc || '' };
        const half = data.outfit?.descriptionHalfBody || source.outfit?.descriptionHalfBody
            || source.outfits?.find(o => o.name === data.outfit?.name)?.descriptionHalfBody;
        if (!fragments && meta.imagePromptTask !== 'dna' && character.framing === 'half_body' && !half?.trim() && !creatureOf(source.dna))
            return locateFailure(fail('outfit_half_body', 'missing'), row);
        const built = savedExpressionTemplate([{ ...source, outfit: data.outfit || source.outfit }], '平和', meta.userPrompts, {
            purpose: task.purpose, framing: character.framing, slotId: slot.slotId, promptTask: task,
            ...(data.candidate && { dnaCandidates: data.candidate }),
            ...(data.expression && { expression: data.expression }) });
        if (!built.ok || !built.available) return fail('outfit_description', 'missing');
        const entry = bindAutoSpriteOutfitNames(built.value, task, meta.autoSpriteOutfitNames);
        const checked = checkPromptOutput(entry, entry.promptTask, [source]);
        if (!checked.ok) return locateFailure(checked, row);
        captions.push({ ...entry, ...checked.value });
    }
    return { ok: true, ...captions[0], captions };
}

function readExpression(row) {
    if (!row.expression?.trim() || row.expression_uc === undefined) return fail('expression', 'missing');
    return { ok: true, expression: { positive: row.expression, negative: row.expression_uc } };
}

function readIdentity(row, source, purpose) {
    // 非人角色没有衣装：不要求衣装字段，也不进入衣柜。
    const creature = Boolean(creatureOf(source.dna));
    if (!creature && (!isValidOutfitName(row.outfit_name) || !validText(row.outfit_description))) return fail('outfit');
    const outfit = creature ? { name: '', description: '' } : { name: row.outfit_name, description: row.outfit_description,
        ...(row.outfit_half_body !== undefined && { descriptionHalfBody: row.outfit_half_body }) };
    const saved = creature ? undefined : source.outfits?.find(o => o.name === outfit.name) || (source.outfit?.name === outfit.name ? source.outfit : undefined);
    // DNA-only 仍兼容原资料协议；立绘／换装的新资料不能静默退回带鞋袜的完整服装。
    if (!outfit.descriptionHalfBody?.trim() && !saved?.descriptionHalfBody?.trim()
        && row.outfit_half_body !== undefined) return fail('outfit_half_body', 'missing');
    const hasViews = viewFields.some(key => Object.hasOwn(row, key));
    const hasPersonality = Object.hasOwn(row, 'personality');
    const missingViews = CHARACTER_DNA_REQUIRED_VIEWS.some(view => !source.dna?.views?.[view]?.subject?.trim());
    const missingPersonality = source.dna?.personality === undefined;
    if (purpose !== 'sprite') return hasViews || hasPersonality ? fail('identity', 'unexpected') : { ok: true, outfit };
    if (!missingViews && !missingPersonality) {
        if (hasViews || (hasPersonality && row.personality !== source.dna.personality)) return fail('identity', 'preserved');
        return { ok: true, outfit };
    }
    if (missingViews && !hasViews) return fail('dna', 'missing');
    if (missingPersonality && !hasPersonality) return fail('personality', 'missing');
    const views = hasViews ? Object.fromEntries(CHARACTER_DNA_VIEWS
        .filter(view => Object.hasOwn(row, `dna_${view}`) || Object.hasOwn(row, `dna_uc_${view}`))
        .map(view => [view, { ...(Object.hasOwn(row, `dna_${view}`) && { subject: row[`dna_${view}`] }),
            negative: row[`dna_uc_${view}`] || '' }])) : source.dna.views;
    const checked = checkDnaViews(views, { complete: true });
    if (!checked.ok) return checked;
    const personality = checkCharacterPersonality(hasPersonality ? row.personality : source.dna.personality);
    if (!personality.ok) return personality;
    return { ok: true, outfit, candidate: { version: 1, characters: [{ characterKey: source.characterKey,
        views: checked.value, personality: personality.value }] } };
}
