// 衣装模板的纯校验：按角色与 Char 绑定，不访问存储、不改写衣装正文。
import { confirmedCreatureOf } from '../scene/creature-profile.js';
const marker = /<<\s*(?:dna|outfit)/i;
const text = (v, n = 4096) => typeof v === 'string' && v.length <= n && !marker.test(v);
const fail = (field, issue, captionIndex) => ({ ok: false, reason: 'OUTFIT_TEMPLATE_INVALID',
    error: `衣装模板校验失败：${field}；已停止出图`,
    diagnostic: { field, issue, ...(Number.isInteger(captionIndex) && { captionIndex }) } });

export function checkOutfitTemplates(recipe, metadata, context, task) {
    if (task?.outfitMode !== undefined && task.outfitMode !== 'template') return fail('outfitMode', 'invalid');
    if (recipe?.outfitMode !== undefined && recipe.outfitMode !== 'template') return fail('outfitMode', 'invalid');
    const enabled = recipe?.outfitMode === 'template';
    if (task?.outfitMode === 'template' && !enabled
        && recipe?.bindings?.some(b => b.kind === 'named')) return fail('outfitMode', 'missing');
    const caption = recipe?.caption;
    const pos = caption?.v4_prompt?.caption, neg = caption?.v4_negative_prompt?.caption;
    const characters = [];
    if (/<<\s*outfit/i.test((pos?.base_caption || '') + (neg?.base_caption || ''))) return fail('caption.scene', 'placeholder');
    for (const b of recipe?.bindings || []) {
        const value = pos.char_captions[b.captionIndex]?.char_caption || '';
        const uc = neg.char_captions[b.captionIndex]?.char_caption || '';
        const placeholder = `<<outfit:${b.token}>>`;
        // 非人角色在 CG 里没有衣装：绑定记为 source=none，正文不带衣装占位，也不进衣装快照。
        const none = enabled && b.kind === 'named' && recipe.outfitSelection === 'catalog' && b.outfit?.source === 'none';
        const count = enabled && b.kind === 'named' && !none ? 1 : 0;
        const matches = [...value.matchAll(/<<outfit:[^>]*>>/g)];
        if (matches.length !== count || matches.some(m => m[0] !== placeholder)
            || /<<\s*outfit/i.test(value.replaceAll(count ? placeholder : '\u0000', ''))
            || /<<\s*outfit/i.test(uc)) return fail('caption.char', 'placeholder', b.captionIndex);
        if (none && context !== undefined) {
            if (!Array.isArray(context)) return fail('outfit.binding', 'invalid', b.captionIndex);
            const source = context.filter(c => c?.characterKey === b.characterKey);
            const meta = metadata?.characters?.find(c => c.characterKey === b.characterKey && c.captionIndex === b.captionIndex);
            if (source.length !== 1 || !meta || !confirmedCreatureOf(source[0].dna)) return fail('outfit.binding', 'mismatch', b.captionIndex);
            if (meta.outfit?.name !== '' || meta.outfit?.description !== '') return fail('outfit.text', 'invalid', b.captionIndex);
        }
        if (!count || context === undefined) continue;
        if (!Array.isArray(context)) return fail('outfit.binding', 'invalid', b.captionIndex);
        const source = context.filter(c => c?.characterKey === b.characterKey);
        const meta = metadata?.characters?.find(c => c.characterKey === b.characterKey && c.captionIndex === b.captionIndex);
        if (source.length !== 1 || !meta) return fail('outfit.binding', 'mismatch', b.captionIndex);
        const outfit = meta.outfit;
        if (!outfit || !text(outfit.name, 128) || !text(outfit.description)
            || (outfit.descriptionHalfBody !== undefined && !text(outfit.descriptionHalfBody)))
            return fail('outfit.text', 'invalid', b.captionIndex);
        if (recipe.outfitSelection === 'catalog') {
            if (task && task.purpose !== 'cg') return fail('outfitSelection', 'invalid', b.captionIndex);
            if (!outfit.name.trim() || !outfit.description.trim() || !b.outfit
                || !text(b.outfit.name, 128) || !b.outfit.name.trim()
                || !text(b.outfit.description) || !b.outfit.description.trim()
                || !['saved', 'candidate'].includes(b.outfit.source)) return fail('outfit.text', 'missing', b.captionIndex);
            characters.push({ characterKey: b.characterKey, captionIndex: b.captionIndex, token: b.token,
                name: b.outfit.name, description: b.outfit.description, source: b.outfit.source });
            continue;
        }
        const current = source[0].outfit;
        if (source[0].outfits !== undefined && !Array.isArray(source[0].outfits))
            return fail('outfits', 'invalid', b.captionIndex);
        const saved = (source[0].outfits || []).filter(o => o?.name === outfit.name && o.description?.trim());
        if (saved.length > 1) return fail('outfit.name', 'duplicate', b.captionIndex);

        if ((task?.purpose === 'consistency' && (!current || outfit.name !== current.name))
            || (current?.name && outfit.name !== current.name))
            return fail('outfit.name', 'mismatch', b.captionIndex);
        const dnaDefault = task?.purpose !== 'consistency' && current?.name === '' && outfit.name === ''
            && current.description?.trim() && current.description === source[0].dna?.defaultAppearance
            ? current : undefined;
        const selected = task?.purpose === 'consistency' ? current
            : dnaDefault || saved[0] || (current?.description?.trim() && current.name === outfit.name ? current : undefined);
        if (task?.purpose !== 'consistency' && saved[0] && current?.name === outfit.name
            && current.description && current.description !== saved[0].description)
            return fail('outfit.description', 'preserved', b.captionIndex);
        if (selected && outfit.description && outfit.description !== selected.description)
            return fail('outfit.description', 'preserved', b.captionIndex);
        const description = selected ? selected.description : outfit.description;
        if (!text(description) || (!description.trim() && task?.purpose !== 'consistency')
            || ((!selected || dnaDefault) && task?.purpose !== 'consistency'
                && ((!outfit.name.trim() && !dnaDefault)
                || ['__proto__', 'constructor', 'prototype', '默认', '原装'].includes(outfit.name)
                || /[|\]\r\n]/.test(outfit.name)))) return fail('outfit.text', 'missing', b.captionIndex);
        if (task?.purpose === 'consistency' && description !== (current.description || ''))
            return fail('outfit.description', 'preserved', b.captionIndex);
        // 半身服装是同一完整母版的派生视图；CG 与一致性仍使用完整说明。
        const sprite = ['sprite', 'derived'].includes(task?.purpose);
        const savedHalf = selected?.descriptionHalfBody;
        if (sprite && savedHalf && outfit.descriptionHalfBody && outfit.descriptionHalfBody !== savedHalf)
            return fail('outfit.descriptionHalfBody', 'preserved', b.captionIndex);
        if (sprite && saved[0]?.descriptionHalfBody && current?.descriptionHalfBody
            && saved[0].descriptionHalfBody !== current.descriptionHalfBody)
            return fail('outfit.descriptionHalfBody', 'preserved', b.captionIndex);
        const half = sprite ? savedHalf || outfit.descriptionHalfBody : undefined;
        if (half !== undefined && (!text(half) || !half.trim()))
            return fail('outfit.descriptionHalfBody', 'invalid', b.captionIndex);
        characters.push({ characterKey: b.characterKey, captionIndex: b.captionIndex, token: b.token,
            name: outfit.name, description,
            ...(half !== undefined && { descriptionHalfBody: half }),
            source: selected || task?.purpose === 'consistency' ? 'saved' : 'candidate' });
    }
    return { ok: true, value: { version: 1, characters } };
}
