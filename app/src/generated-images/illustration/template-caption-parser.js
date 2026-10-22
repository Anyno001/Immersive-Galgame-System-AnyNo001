// 内置写词的扁平 DNA 旁路解析；只组装协议，不展开身份或加工正文。
import { CHARACTER_DNA_VIEWS } from '../../scene/character-dna.js';
import { checkCharacterMeta } from '../../schemas/character-meta.js';
import { checkPromptTask, checkPromptOutput } from '../../schemas/prompt-recipe.js';
import { bindAutoSpriteOutfitNames } from './character-prompt-task.js';
import { resolveCgOutfit } from './cg-outfit-catalog.js';
import { isUnclothedCreature, stripOutfitSlot } from './creature-cg.js';

const fields = new Set(['slotid', 'size', 'analysis', 'scene', 'scene_uc', 'prompt_mode', 'outfit_mode', 'identity_mode', 'char', 'char_uc', 'at']);
const metaFields = new Set(['meta_kind', 'meta_key', 'meta_token', 'meta_frame', 'meta_identity', 'meta_signature',
    'meta_outfit_name', 'meta_outfit_description', 'meta_outfit_id', 'meta_region', 'meta_correction_identity', 'meta_correction_uc',
    ...CHARACTER_DNA_VIEWS.flatMap((f) => [`meta_dna_${f}`, `meta_dna_uc_${f}`])]);
const fail = (reason = 'DNA_TEMPLATE_BINDING', field = 'meta_fields', issue = 'invalid', where = {}) => {
    const labels = { invalid: '格式或取值无效', missing: '缺少必需字段',
        duplicate: '字段或编号重复', mismatch: '数量或任务不匹配' };
    if (where.detail === 'code-fence') labels.invalid = '回复含代码围栏包装，仅接受扁平字段';
    const details = [`字段=${field}`, `原因=${labels[issue]}`,
        ...Object.entries(where).map(([key, value]) => `${key}=${value}`)];
    return { ok: false, reason, error: `动态模板字段无效，已停止写词交接 [${details.join('；')}]`,
        diagnostic: { code: reason, stage: 'prompt-parse', field, issue, ...where } };
};
const atBlock = (result, block) => {
    const diagnostic = { ...result.diagnostic, stage: 'prompt-parse', slotId: block.slotId };
    const characterMetaFailure = result.reason?.startsWith('character-meta-');
    if (result.reason !== 'DNA_VIEW_INVALID' && !characterMetaFailure) return { ...result, diagnostic };
    const field = /^dna\.views\.(full_body|half_body|portrait|partial)(?:\.(subject|negative))?$/.exec(diagnostic.field || '');
    let key;
    if (field) {
        key = `meta_dna_${field[2] === 'negative' ? 'uc_' : ''}${field[1]}`;
    } else if (characterMetaFailure) {
        key = diagnostic.field === 'binding.characterKey' ? 'meta_key'
            : metaFields.has(diagnostic.field) ? diagnostic.field : undefined;
    }
    if (key) {
        const lineNumber = block.rowLines.get(diagnostic.captionIndex)?.[key];
        if (lineNumber !== undefined) diagnostic.lineNumber = lineNumber;
    }
    const details = (characterMetaFailure ? ['slotId', 'lineNumber'] : ['slotId', 'captionIndex', 'lineNumber'])
        .filter(key => diagnostic[key] !== undefined).map(key => `${key}=${diagnostic[key]}`);
    return { ...result, diagnostic,
        error: `${result.error} [${details.join('；')}]` };
};
const position = (slotId, captionIndex) => ({
    ...(Number.isSafeInteger(slotId) && slotId >= 1 && slotId <= 9999 && { slotId }),
    ...(Number.isInteger(captionIndex) && captionIndex >= 0 && captionIndex < 16 && { captionIndex }) });
const side = (base, chars) => ({ caption: { base_caption: base, char_captions: chars } });

export function parseTemplateCaptionSlots(text, { promptTask, characterContext, characterContextForEntry, autoSpriteOutfitNames, outfitCatalog, outputs } = {}) {
    const task = checkPromptTask(promptTask, characterContext);
    if (!task.ok) return task;
    if (!task.value) return fail('PROMPT_MODE_CONFLICT', 'promptTask', 'missing');
    const catalog = task.value.outfitSelection === 'catalog';
    const blocks = [], ids = new Set();
    let current = null, last = '';
    const lines = String(text || '').split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === '---') { current = null; last = ''; continue; }
        const reject = (field = 'meta_fields', issue = 'invalid', captionIndex) =>
            fail('DNA_TEMPLATE_BINDING', field, issue,
                { lineNumber: lineIndex + 1, ...position(current?.slotId, captionIndex) });
        if (/^(?:`{3,}|~{3,})/.test(trimmed)) return fail('DNA_TEMPLATE_BINDING',
            'response_format', 'invalid', { detail: 'code-fence', lineNumber: lineIndex + 1,
                ...position(current?.slotId) });
        const match = /^(\w+)\s*[:：]\s*(.*)$/.exec(trimmed);
        if (!match) {
            if (current && last === 'analysis') { current.analysis += '\n' + trimmed; continue; }
            return reject();
        }
        const [, key, value] = match;
        if (!fields.has(key) && !metaFields.has(key)) return reject();
        if (key === 'slotid') {
            const slotId = Number(value);
            if (!/^\d+$/.test(value) || !Number.isSafeInteger(slotId) || slotId < 1) return reject('slotid');
            if (ids.has(slotId)) return reject('slotid', 'duplicate');
            ids.add(slotId);
            current = { slotId, chars: [], ucs: [], rows: new Map(), rowLines: new Map() };
            blocks.push(current);
        } else {
            if (!current) return reject('slotid', 'missing');
            if (key === 'char') current.chars.push(value);
            else if (key === 'char_uc') current.ucs.push(value);
            else if (metaFields.has(key)) {
                const row = /^(\d+)\s*\|\s*(.*)$/.exec(value);
                if (!row) return reject(key);
                const index = Number(row[1]), data = current.rows.get(index) || {};
                if (Object.hasOwn(data, key)) return reject(key, 'duplicate', index);
                data[key] = row[2]; current.rows.set(index, data);
                const rowLines = current.rowLines.get(index) || {};
                rowLines[key] = lineIndex + 1; current.rowLines.set(index, rowLines);
            } else {
                if (Object.hasOwn(current, key)) return reject(key, 'duplicate');
                current[key] = value;
            }
        }
        last = key;
    }
    if (!blocks.length) return fail('DNA_TEMPLATE_BINDING', 'slotid', 'missing');
    const captions = [];

    for (const block of blocks) {
        const reject = (field, issue = 'invalid', captionIndex, reason = 'DNA_TEMPLATE_BINDING', detail = {}) =>
            fail(reason, field, issue, { ...position(block.slotId, captionIndex), ...detail });
        if (block.prompt_mode !== 'dna_template') return reject('prompt_mode',
            block.prompt_mode === undefined ? 'missing' : 'invalid', undefined, 'PROMPT_MODE_CONFLICT');
        if (block.outfit_mode !== undefined && block.outfit_mode !== 'template') return reject('outfit_mode', 'invalid', undefined, 'OUTFIT_TEMPLATE_INVALID');
        if (block.chars.length > 16) return reject('char');
        const rowFailure = (field, issue = 'mismatch', captionIndex) => {
            const expected = Array.from({ length: block.chars.length }, (_, index) => index);
            return reject(field, issue, captionIndex, 'DNA_TEMPLATE_BINDING', {
                charCount: block.chars.length, charUcCount: block.ucs.length, metaRowCount: block.rows.size,
                missingMetaIndexes: expected.filter(index => !block.rows.has(index)),
                extraMetaIndexes: [...block.rows.keys()].filter(index => Number.isSafeInteger(index)
                    && index >= block.chars.length).slice(0, 16),
            });
        };
        if (block.ucs.length !== block.chars.length) return rowFailure('char_uc');
        if (block.rows.size !== block.chars.length) return rowFailure('meta_rows');
        const positive = [], negative = [], bindings = [], characters = [], candidates = [];
        for (let index = 0; index < block.chars.length; index += 1) {
            const raw = block.chars[index], row = block.rows.get(index);
            if (!row) return rowFailure('meta_rows', 'missing', index);
            const coord = /^([0-9]*\.?[0-9]+)\s*,\s*([0-9]*\.?[0-9]+)\s*\|\s*([\s\S]*)$/.exec(raw);
            if (!coord && raw.includes('|')) return reject('char', 'invalid', index);
            const x = coord ? Number(coord[1]) : 0.5, y = coord ? Number(coord[2]) : 0.5;
            if (![x, y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return reject('char', 'invalid', index);
            positive.push({ char_caption: coord ? coord[3] : raw, centers: [{ x, y }] });
            negative.push({ char_caption: block.ucs[index] });
            if (['generic', 'object'].includes(row.meta_kind)) {
                if (Object.keys(row).some((key) => key !== 'meta_kind')) return reject('meta_fields', 'mismatch', index);
                bindings.push({ kind: row.meta_kind, captionIndex: index });
                continue;
            }
            if (!['named', 'reference'].includes(row.meta_kind)) return reject('meta_kind',
                row.meta_kind === undefined ? 'missing' : 'invalid', index);
            // 已登记的非人角色没有衣装：CG 里衣装三项可留空（也可整体省略），绑定记为「无衣装」。
            const noOutfit = catalog && isUnclothedCreature(characterContext, row);
            const missing = ['meta_key', 'meta_token', 'meta_frame', ...(noOutfit ? [] : ['meta_outfit_name', 'meta_outfit_description'])]
                .find((key) => !Object.hasOwn(row, key));
            if (missing) return reject(missing, 'missing', index);
            if (row.meta_kind === 'reference' && (row.meta_outfit_name !== ''
                || row.meta_outfit_description !== '')) return reject('meta_outfit_description', 'mismatch', index, 'OUTFIT_TEMPLATE_INVALID');
            if (!catalog && row.meta_outfit_id !== undefined) return reject('meta_outfit_id', 'mismatch', index);
            const selectedOutfit = noOutfit ? { ok: true, value: { name: '', description: '', source: 'none' } }
                : catalog ? resolveCgOutfit(row.meta_outfit_id,
                    { name: row.meta_outfit_name, description: row.meta_outfit_description },
                    { captionIndex: index, characterKey: row.meta_key }, outfitCatalog) : null;
            if (selectedOutfit && !selectedOutfit.ok) return atBlock(selectedOutfit, block);
            if (noOutfit) positive[index].char_caption = stripOutfitSlot(positive[index].char_caption, row.meta_token);
            bindings.push({ kind: row.meta_kind, characterKey: row.meta_key, captionIndex: index,
                token: row.meta_token, framing: row.meta_frame,
                ...(selectedOutfit && { outfit: selectedOutfit.value }),
                ...((row.meta_correction_identity !== undefined || row.meta_correction_uc !== undefined) && {
                    correction: { subject: row.meta_correction_identity, negative: row.meta_correction_uc || '' } }) });
            const character = { characterKey: row.meta_key, captionIndex: index,
                identityAnchor: row.meta_identity || '', signatureDetails: row.meta_signature || '',
                outfit: { name: row.meta_outfit_name ?? '', description: row.meta_outfit_description ?? '' },
                centers: coord ? [{ x, y }] : [], positionExplicit: Boolean(coord) };
            if (row.meta_region !== undefined) {
                const parts = row.meta_region.split(',');
                if (parts.length !== 4 || parts.some((v) => !v.trim())) return reject('meta_region', 'invalid', index);
                const [rx, ry, width, height] = parts.map(Number);
                character.region = { x: rx, y: ry, width, height };
            }
            if (row.meta_kind === 'named') characters.push(character);
            else if (row.meta_region !== undefined) return reject('meta_region', 'mismatch', index);
            const views = {};
            for (const frame of CHARACTER_DNA_VIEWS) {
                const subject = row[`meta_dna_${frame}`], uc = row[`meta_dna_uc_${frame}`];
                if (subject !== undefined || uc !== undefined) views[frame] = { subject, ...(uc !== undefined && { negative: uc }) };
            }
            if (Object.keys(views).length) candidates.push({ characterKey: row.meta_key, views });
        }

        const caption = { v4_prompt: side(block.scene || '', positive), v4_negative_prompt: side(block.scene_uc || '', negative) };
        if (!caption.v4_prompt.caption.base_caption.trim() && !positive.some((c) => c.char_caption.trim())) return reject('caption', 'missing');
        const meta = checkCharacterMeta({ version: 1, characters }, caption, characterContext.map((c) => c.characterKey));
        if (!meta.ok) return atBlock(meta, block);
        let entry = { slotId: block.slotId, caption, characterMeta: meta.value,
            promptRecipe: { version: 1, mode: 'dna_template', caption, bindings,
                ...(block.identity_mode !== undefined && { identityMode: block.identity_mode }),
                ...(catalog && { outfitSelection: 'catalog' }),
                ...(catalog && !bindings.some(b => b.kind === 'named') && { outfitMode: 'template' }),
                ...(block.outfit_mode !== undefined && { outfitMode: block.outfit_mode }) },
            ...(candidates.length && { dnaCandidates: { version: 1, characters: candidates } }),
            ...(block.analysis !== undefined && { analysis: block.analysis }) };
        const numberedCg = task.value.purpose === 'cg' && outputs?.selection === 'numbered-text';
        if (task.value.purpose === 'cg' && (numberedCg || characterContextForEntry !== undefined)
            && block.at === undefined) return reject('at', 'missing');
        if (block.at !== undefined) {
            if (task.value.purpose !== 'cg' || !/^\d+$/.test(block.at)
                || !Number.isSafeInteger(Number(block.at)) || Number(block.at) < 1
                || (numberedCg && Number.isSafeInteger(outputs.paragraphCount)
                    && Number(block.at) > outputs.paragraphCount)) return reject('at');
            entry.at = Number(block.at);
        }
        if (block.size !== undefined) {
            const size = /^(\d+)x(\d+)$/.exec(block.size);
            if (!size || !size.slice(1).every((v) => Number(v) >= 64 && Number(v) <= 4096 && Number(v) % 64 === 0)) return reject('size');
            entry.width = Number(size[1]); entry.height = Number(size[2]);
        }
        // 选点仍校验挂载上下文；catalog 的衣装由本轮引用确定，不由该点剧情衣装裁决。
        let context = characterContext;
        if (characterContextForEntry !== undefined) {
            if (task.value.purpose !== 'cg' || typeof characterContextForEntry !== 'function')
                return reject('characterContext', 'invalid');
            try { context = characterContextForEntry(entry); }
            catch { return reject('at', 'invalid'); }
            if (!Array.isArray(context)) return reject('at', 'invalid');
        }
        entry = bindAutoSpriteOutfitNames(entry, task.value, autoSpriteOutfitNames);
        const checked = checkPromptOutput(entry, task.value, context);
        if (!checked.ok) return atBlock(checked, block);
        Object.assign(entry, checked.value);
        captions.push(entry);
    }
    return { ok: true, captions };
}
