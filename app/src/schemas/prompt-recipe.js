// IGS 请求与模板交接边界；不依赖 DBGen 的运行时，也不改写正文。
import { CHARACTER_DNA_VIEWS, CHARACTER_DNA_REQUIRED_VIEWS, checkDnaViews, checkCharacterPersonality, characterDnaIdentityCleared } from '../scene/character-dna.js';
import { checkOutfitTemplates } from './outfit-template.js';
import { isValidOutfitName } from '../scene/character-outfits.js';
import { confirmedCreatureOf } from '../scene/creature-profile.js';
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const keyOk = (v) => typeof v === 'string' && v === v.trim() && v.length > 0 && v.length <= 128
    && !['__proto__', 'constructor', 'prototype'].includes(v);
const tokenOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(v);
// 字段与原因由程序定义；只输出数值索引，不回显身份正文或 token。
const fail = (reason = 'DNA_TEMPLATE_BINDING', field = 'promptRecipe', issue = 'invalid', where = {}) => {
    const labels = { invalid: '字段取值或结构无效', missing: '缺少必需字段',
        mismatch: '与本次角色任务不匹配', duplicate: '存在重复绑定',
        placeholder: '身份占位缺失、重复或跨角色', preserved: '改写了已保存的身份资料',
        locked: '身份资料已清空并锁定，不能自动补建' };
    return { ok: false, reason,
        error: `DNA 模板校验失败：${field} ${labels[issue]}；已停止出图`,
        diagnostic: { code: reason, field, issue, ...where } };
};
export function checkPromptTask(raw, context) {
    if (raw === undefined) return { ok: true, value: undefined };
    if (!plain(raw) || raw.version !== 1 || raw.mode !== 'dna_template'
        || !['sprite', 'derived', 'cg', 'consistency'].includes(raw.purpose)
        || (raw.outfitMode !== undefined && raw.outfitMode !== 'template')
        || !Array.isArray(raw.characters) || raw.characters.length > 16 || !Array.isArray(context)) return fail('PROMPT_MODE_CONFLICT', 'promptTask');
    if (raw.identityMode !== undefined && (raw.identityMode !== 'appearance_correction'
        || raw.purpose !== 'consistency' || raw.slots !== undefined
        || !raw.characters.some(c => c?.kind === 'reference'))) return fail('PROMPT_MODE_CONFLICT', 'promptTask.identityMode');
    if (raw.outfitSelection !== undefined && (raw.outfitSelection !== 'catalog'
        || raw.purpose !== 'cg' || raw.outfitMode !== 'template')) return fail('PROMPT_MODE_CONFLICT', 'promptTask.outfitSelection');
    const keys = new Set(), tokens = new Set(), characters = [];
    for (const c of raw.characters) {
        const where = { characterIndex: characters.length };
        const reject = (field, issue = 'invalid') => fail('DNA_TEMPLATE_BINDING', `promptTask.characters.${field}`, issue, where);
        if (!plain(c) || !keyOk(c.characterKey)) return reject('characterKey');
        if (!tokenOk(c.token)) return reject('token');
        if (tokens.has(c.token) || (keys.has(c.characterKey) && c.kind !== 'reference'))
            return fail('DNA_TEMPLATE_BINDING', 'promptTask.characters', 'duplicate', where);
        if (!context.some((x) => x.characterKey === c.characterKey)) return reject('characterKey', 'mismatch');
        if ((c.kind !== undefined && !['named', 'reference'].includes(c.kind))
            || (c.kind === 'reference' && raw.purpose !== 'consistency')) return reject('kind');
        if (c.framing !== undefined && !CHARACTER_DNA_VIEWS.includes(c.framing)) return reject('framing');
        if (c.kind !== 'reference') keys.add(c.characterKey);
        tokens.add(c.token);
        characters.push({ characterKey: c.characterKey, token: c.token,
            ...(c.kind !== undefined && { kind: c.kind }), ...(c.framing !== undefined && { framing: c.framing }) });
    }
    let slots;
    if (raw.slots !== undefined) {
        if (!['sprite', 'derived', 'consistency'].includes(raw.purpose) || !Array.isArray(raw.slots)
            || !raw.slots.length || raw.slots.length > 32) return fail('DNA_TEMPLATE_BINDING', 'promptTask.slots');
        const ids = new Set(), assigned = new Set();
        slots = [];
        for (const slot of raw.slots) {
            const where = Number.isInteger(slot?.slotId) && slot.slotId >= 1 && slot.slotId <= 9999
                ? { slotId: slot.slotId } : {};
            if (!plain(slot) || !Number.isInteger(slot.slotId) || slot.slotId < 1 || slot.slotId > 9999
                || ids.has(slot.slotId) || !Array.isArray(slot.tokens) || !slot.tokens.length
                || new Set(slot.tokens).size !== slot.tokens.length || slot.tokens.some((token) => !tokens.has(token))) return fail('DNA_TEMPLATE_BINDING', 'promptTask.slots', 'invalid', where);
            ids.add(slot.slotId);
            slot.tokens.forEach((token) => assigned.add(token));
            if (slot.identityMode !== undefined && (slot.identityMode !== 'appearance_correction'
                || raw.purpose !== 'consistency'
                || !characters.some(c => c.kind === 'reference' && slot.tokens.includes(c.token))))
                return fail('PROMPT_MODE_CONFLICT', 'promptTask.slots.identityMode', 'invalid', where);
            slots.push({ slotId: slot.slotId, tokens: [...slot.tokens],
                ...(slot.identityMode !== undefined && { identityMode: slot.identityMode }) });
        }
        if (characters.some((c) => !assigned.has(c.token))) return fail('DNA_TEMPLATE_BINDING', 'promptTask.slots.tokens', 'missing');
    }
    return { ok: true, value: { version: 1, mode: 'dna_template', purpose: raw.purpose, characters,
        ...(raw.identityMode !== undefined && { identityMode: raw.identityMode }),
        ...(raw.outfitMode !== undefined && { outfitMode: raw.outfitMode }),
        ...(raw.outfitSelection !== undefined && { outfitSelection: raw.outfitSelection }),
        ...(slots !== undefined && { slots }) } };
}

// slotId 只选择任务中显式声明的角色集合，不根据输出顺序猜身份。
export function promptTaskForSlot(task, slotId) {
    if (!task?.slots) return { ok: true, value: task };
    const slot = task.slots.find((s) => s.slotId === Number(slotId));
    if (!slot) return fail('DNA_TEMPLATE_BINDING', 'promptTask.slots.slotId', 'mismatch');
    const { slots, identityMode, ...rest } = task;
    return { ok: true, value: { ...rest, characters: task.characters.filter((c) => slot.tokens.includes(c.token)),
        ...(slot.identityMode !== undefined && { identityMode: slot.identityMode }) } };
}

export function checkPromptRecipe(raw, caption, task, { allowArchivedCorrection = false, context, allowStoredNoOutfit = false } = {}) {
    if (raw === undefined) return task ? fail('PROMPT_MODE_CONFLICT', 'promptRecipe', 'missing') : { ok: true, value: undefined };
    if ((raw?.outfitSelection !== undefined && (raw.outfitSelection !== 'catalog' || raw.outfitMode !== 'template'))
        || (task && raw?.outfitSelection !== task.outfitSelection)) return fail('PROMPT_MODE_CONFLICT', 'promptRecipe.outfitSelection');
    if (raw?.identityMode !== undefined && (raw.identityMode !== 'appearance_correction'
        || (!task && !allowArchivedCorrection) || (task && task.purpose !== 'consistency')))
        return fail('PROMPT_MODE_CONFLICT', 'promptRecipe.identityMode');
    if (task && raw?.identityMode !== task.identityMode)
        return fail('PROMPT_MODE_CONFLICT', 'promptRecipe.identityMode', 'mismatch', {
            expectedIdentityMode: task.identityMode === 'appearance_correction' ? 'appearance_correction'
                : task.identityMode === undefined ? 'absent' : 'invalid',
            actualIdentityMode: raw?.identityMode === 'appearance_correction' ? 'appearance_correction'
                : raw?.identityMode === undefined ? 'absent' : 'invalid',
        });
    if (!plain(raw) || raw.version !== 1 || raw.mode !== 'dna_template'
        || (raw.outfitMode !== undefined && raw.outfitMode !== 'template')
        || !Array.isArray(raw.bindings) || raw.bindings.length > 16) return fail('DNA_TEMPLATE_BINDING', 'promptRecipe');
    const pos = caption?.v4_prompt?.caption, neg = caption?.v4_negative_prompt?.caption;
    if (!Array.isArray(pos?.char_captions) || !Array.isArray(neg?.char_captions)
        || neg.char_captions.length !== pos.char_captions.length
        || raw.bindings.length !== pos.char_captions.length) return fail('DNA_TEMPLATE_BINDING', 'promptRecipe.bindings.length', 'mismatch');
    const tokens = new Set(), indexes = new Set(), keys = new Set(), bindings = [];
    if (raw.identityMode === 'appearance_correction' && !raw.bindings.some(b => b?.kind === 'reference'))
        return fail('PROMPT_MODE_CONFLICT', 'promptRecipe.identityMode');
    for (const b of raw.bindings) {
        const where = Number.isInteger(b?.captionIndex) && b.captionIndex >= 0 && b.captionIndex < 16
            ? { captionIndex: b.captionIndex } : {};
        const reject = (field, issue = 'invalid') => fail('DNA_TEMPLATE_BINDING', `binding.${field}`, issue, where);
        if (!plain(b) || !['named', 'generic', 'object', 'reference'].includes(b.kind)) return reject('kind');
        const catalog = raw.outfitSelection === 'catalog';
        if (catalog && b.kind === 'reference') return reject('kind');
        if (catalog && b.kind === 'named' && plain(b.outfit) && b.outfit.source === 'none') {
            // 非人角色无衣装：名称与说明必为空；是否确属非人角色由带角色资料的衣装校验核对。
            // 无资料不放行：需要本次角色资料证明是已确认的非人角色；仅已存档记录的整理（promptProvenance）可免资料。
            const proven = allowStoredNoOutfit || (Array.isArray(context) && context.some(c => c?.characterKey === b.characterKey && confirmedCreatureOf(c.dna)));
            if (!proven || b.outfit.name !== '' || b.outfit.description !== '') return reject('outfit');
        } else if (catalog && b.kind === 'named') {
            if (!plain(b.outfit) || !isValidOutfitName(b.outfit.name)
                || !['saved', 'candidate'].includes(b.outfit.source)
                || typeof b.outfit.description !== 'string' || !b.outfit.description.trim()
                || b.outfit.description.length > 4096 || /<<\s*(?:dna|outfit)/i.test(b.outfit.description)) return reject('outfit');
        } else if (b.outfit !== undefined) return reject('outfit');
        const correcting = raw.identityMode === 'appearance_correction';
        if (correcting ? (!['named', 'reference'].includes(b.kind) || !plain(b.correction)
            || Object.keys(b.correction).some(k => !['subject', 'negative'].includes(k))
            || typeof b.correction.subject !== 'string' || !b.correction.subject.trim() || b.correction.subject.length > 4096
            || (b.correction.negative !== undefined && (typeof b.correction.negative !== 'string' || b.correction.negative.length > 4096))
            || /<<\s*(?:dna|outfit)/i.test(b.correction.subject + (b.correction.negative || '')))
            : b.correction !== undefined) return reject('correction');
        if (!Number.isInteger(b.captionIndex) || b.captionIndex < 0 || b.captionIndex >= pos.char_captions.length) return reject('captionIndex');
        if (indexes.has(b.captionIndex)) return reject('captionIndex', 'duplicate');
        indexes.add(b.captionIndex);
        if (b.kind === 'generic' || b.kind === 'object') {
            if (b.characterKey !== undefined || b.token !== undefined || b.framing !== undefined) return reject('kind', 'mismatch');
            bindings.push({ kind: b.kind, captionIndex: b.captionIndex }); continue;
        }
        if (!keyOk(b.characterKey)) return reject('characterKey');
        if (!tokenOk(b.token)) return reject('token');
        if (tokens.has(b.token)) return reject('token', 'duplicate');
        if (!CHARACTER_DNA_VIEWS.includes(b.framing)) return reject('framing', b.framing === undefined ? 'missing' : 'invalid');
        if (b.kind === 'named' && keys.has(b.characterKey)) return reject('characterKey', 'duplicate');
        const expected = task?.characters?.find((c) => c.token === b.token);
        if (task && !expected) return reject('token', 'mismatch');
        if (task && expected.characterKey !== b.characterKey) return reject('characterKey', 'mismatch');
        if (task && ((expected.kind || 'named') !== b.kind
            || (b.kind === 'reference' && task.purpose !== 'consistency'))) return reject('kind', 'mismatch');
        if (task && expected.framing !== undefined && expected.framing !== b.framing) return reject('framing', 'mismatch');
        tokens.add(b.token); if (b.kind === 'named') keys.add(b.characterKey);
        bindings.push({ kind: b.kind, characterKey: b.characterKey, captionIndex: b.captionIndex, token: b.token, framing: b.framing,
            ...(catalog && { outfit: { name: b.outfit.name, description: b.outfit.description, source: b.outfit.source } }),
            ...(correcting && { correction: { subject: b.correction.subject.trim(), negative: (b.correction.negative || '').trim() } }) });
    }
    if (task && ['sprite', 'derived', 'consistency'].includes(task.purpose)
        && task.characters.some((c) => !tokens.has(c.token))) return fail('DNA_TEMPLATE_BINDING', 'promptRecipe.bindings', 'missing');
    const check = (value, allowed, count) => {
        if (typeof value !== 'string') return false;
        const matches = [...value.matchAll(/<<dna(?:_uc)?:[^>]*>>/g)].map((m) => m[0]);
        return matches.length === count && matches.every((s) => s === allowed)
            && !/<<\s*dna/i.test(value.replaceAll(allowed || '\u0000', ''));
    };
    if (!check(pos.base_caption, '', 0) || !check(neg.base_caption, '', 0)) return fail('DNA_TEMPLATE_UNRESOLVED', 'caption.scene', 'placeholder');
    for (const b of bindings) {
        const slot = b.token ? `<<dna:${b.token}>>` : '', uc = b.token ? `<<dna_uc:${b.token}>>` : '';
        const positive = pos.char_captions[b.captionIndex]?.char_caption;
        const negative = neg.char_captions[b.captionIndex]?.char_caption ?? '';
        if (!check(positive, slot, slot ? 1 : 0)) return fail('DNA_TEMPLATE_UNRESOLVED', 'caption.char', 'placeholder', { captionIndex: b.captionIndex });
        if (typeof negative !== 'string' || !check(negative, uc, uc && negative.includes(uc) ? 1 : 0))
            return fail('DNA_TEMPLATE_UNRESOLVED', 'caption.char_uc', 'placeholder', { captionIndex: b.captionIndex });
    }
    const value = { version: 1, mode: 'dna_template', caption: structuredClone(caption), bindings,
        ...(raw.identityMode !== undefined && { identityMode: raw.identityMode }),
        ...(raw.outfitMode !== undefined && { outfitMode: raw.outfitMode }),
        ...(raw.outfitSelection !== undefined && { outfitSelection: raw.outfitSelection }) };
    const outfits = checkOutfitTemplates(value, undefined, undefined, task);
    if (!outfits.ok) return outfits;
    return { ok: true, value };
}

export function checkDnaCandidates(raw, { task, context, recipe } = {}) {
    if (raw === undefined) return { ok: true, value: undefined };
    if (!task || task.purpose !== 'sprite' || !plain(raw) || raw.version !== 1
        || !Array.isArray(raw.characters) || raw.characters.length > 16) return fail('PROMPT_MODE_CONFLICT', 'dnaCandidates');
    const keys = new Set(), characters = [];
    for (const c of raw.characters) {
        const where = { characterIndex: characters.length };
        const source = context?.find((x) => x.characterKey === c?.characterKey);
        if (!plain(c) || !keyOk(c.characterKey) || keys.has(c.characterKey) || !source
            || !recipe?.bindings.some((b) => b.kind === 'named' && b.characterKey === c.characterKey)
            || (CHARACTER_DNA_REQUIRED_VIEWS.every((f) => source.dna?.views?.[f]?.subject?.trim())
                &&(source.dna?.personality !== undefined || c.personality === undefined)))
            return fail('DNA_TEMPLATE_BINDING', 'dnaCandidates.characters', 'mismatch', where);
        if (characterDnaIdentityCleared(source.dna))
            return fail('DNA_TEMPLATE_BINDING', 'dnaCandidates.characters', 'locked', where);
        const checked = checkDnaViews(c.views, { complete: true });
        if (!checked.ok) {
            const binding = recipe.bindings.find(b => b.kind === 'named' && b.characterKey === c.characterKey);
            return { ...checked, diagnostic: { ...checked.diagnostic, ...where, captionIndex: binding.captionIndex } };
        }
        for (const frame of CHARACTER_DNA_VIEWS) {
            const saved = source.dna?.views?.[frame];
            if (frame === 'partial') {
                if (checked.value[frame] !== undefined && !saved?.subject?.trim())
                    return fail('DNA_TEMPLATE_BINDING', 'dna.views.partial', 'preserved', where);
                if (saved?.subject?.trim() && checked.value[frame] === undefined)
                    checked.value[frame] = { subject: saved.subject, negative: saved.negative || '' };
            }
            if ((saved?.subject?.trim() && saved.subject !== checked.value[frame].subject)
                || ((saved?.subject?.trim() || saved?.negative?.trim())
                    && (saved.negative || '') !== checked.value[frame]?.negative))
                return fail('DNA_TEMPLATE_BINDING', `dna.views.${frame}`, 'preserved', where);
        }
        const personality = checkCharacterPersonality(c.personality);
        if (!personality.ok) return personality;
        if (c.personality !== undefined && source.dna?.personality !== undefined
            && personality.value !== source.dna.personality)
            return fail('DNA_TEMPLATE_BINDING', 'dna.personality', 'preserved', where);
        keys.add(c.characterKey); characters.push({ characterKey: c.characterKey, views: checked.value,
            ...(c.personality !== undefined && { personality: personality.value }) });
    }
    return { ok: true, value: { version: 1, characters } };
}

export function checkRecipeCharacterMeta(recipe, characterMeta) {
    if (recipe) {
        const named = recipe.bindings.filter((b) => b.kind === 'named');
        const meta = characterMeta?.characters;
        if (!(named.length === 0 && meta === undefined)
            && (!Array.isArray(meta) || meta.length !== named.length || named.some((b) =>
                !meta.some((c) => c.characterKey === b.characterKey && c.captionIndex === b.captionIndex)))) return fail('DNA_TEMPLATE_BINDING', 'characterMeta.characters', 'mismatch');
    }
    return { ok: true, value: {} };
}

// 只识别协议上可确认的纯 Scene，不从自然语言猜人物身份。
export function isSceneOnlyPromptOutput(item) {
    const meta = item.characterMeta;
    return item.promptRecipe === undefined && item.dnaCandidates === undefined
        && (meta === undefined || (plain(meta) && meta.version === 1
            && Array.isArray(meta.characters) && meta.characters.length === 0))
        && [item.caption?.v4_prompt?.caption, item.caption?.v4_negative_prompt?.caption]
            .every((side) => plain(side) && typeof side.base_caption === 'string'
                && !/<<\s*(?:dna|outfit)/i.test(side.base_caption)
                && Array.isArray(side.char_captions) && side.char_captions.length === 0);
}

export function checkPromptOutput(item, task, context) {
    if (task?.purpose === 'cg' && isSceneOnlyPromptOutput(item)) return { ok: true, value: {} };
    if (item.promptRecipe !== undefined && !task
        && !(plain(item.promptRecipe) && Array.isArray(item.promptRecipe.bindings)
            && item.promptRecipe.bindings.every((b) => b && ['generic', 'object'].includes(b.kind))))
        return fail('PROMPT_MODE_CONFLICT', 'promptTask', 'missing');
    const selected = promptTaskForSlot(task, item.slotId ?? item.slotid);
    if (!selected.ok) return selected;
    task = selected.value;
    const recipe = checkPromptRecipe(item.promptRecipe, item.caption, task, { context });
    if (!recipe.ok) return recipe;
    const metadata = checkRecipeCharacterMeta(recipe.value, item.characterMeta);
    if (!metadata.ok) return metadata;
    const candidates = checkDnaCandidates(item.dnaCandidates, { task, context, recipe: recipe.value });
    if (!candidates.ok) return candidates;
    const outfits = checkOutfitTemplates(recipe.value, item.characterMeta, context, task);
    if (!outfits.ok) return outfits;
    if (task?.purpose === 'sprite') {
        for (const b of recipe.value.bindings.filter((b) => b.kind === 'named')) {
            const dna = context?.find((c) => c.characterKey === b.characterKey)?.dna;
            if (!CHARACTER_DNA_REQUIRED_VIEWS.every((f) => dna?.views?.[f]?.subject?.trim())
                && !candidates.value?.characters.some((c) => c.characterKey === b.characterKey))
                return fail(dna?.identity?.trim() || Object.values(dna?.views || {}).some((v) => v.subject?.trim())
                    ? 'DNA_VIEW_MISSING' : 'DNA_MISSING', 'dnaCandidates', 'missing', { captionIndex: b.captionIndex });
        }
    }
    return { ok: true, value: { ...(recipe.value !== undefined && { promptRecipe: recipe.value }),
        ...(candidates.value !== undefined && { dnaCandidates: candidates.value }),
        ...(recipe.value?.outfitMode === 'template' && { outfitSnapshot: outfits.value }) } };
}
