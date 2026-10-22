// 非人角色立绘的固定词与出图参数：与人类立绘分开，不借用 BUILTIN_PROMPTS.sprite。
// 词库来自 prompt-registry.js 的 creatureBeast / creatureHumanoid，取景词按体型、悬浮词按落地方式拼入。
import { BUILTIN_PROMPTS } from './prompt-registry.js';
import { normalizeCreatureProfile, creatureCanvasSize } from '../scene/creature-profile.js';
import { composeSpritePromptParts } from './sprite-prompt-composition.js';
import { mergePromptTags } from '../scene/character-dna.js';
import {
    MATTE_BACKGROUND_TAGS, WHITE_BACKGROUND_TAGS, TRANSPARENT_BACKGROUND_TAGS, NSFW_NEGATIVE_GUARD,
    applyTemplate, dropMatteTagsWhenTransparent, dropWhiteBackgroundNegative,
} from './illustration/prompt-kit.js';

const joinTags = (...parts) => parts.map((p) => String(p || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');

export const creatureTemplateKey = (profile) => (profile && profile.form === 'humanoid' ? 'creatureHumanoid' : 'creatureBeast');

// 固定正负向。positive 里的 {tags} 位置放悬浮词；角色词由 DNA 展开或 buildCreatureAssetSlot 合入。
export function creatureFixedPrompts(rawProfile, { transparent = false, whiteBackground = false, positiveContext = '', tags = '' } = {}) {
    const profile = normalizeCreatureProfile(rawProfile) || normalizeCreatureProfile({});
    const template = BUILTIN_PROMPTS[creatureTemplateKey(profile)];
    // 半人形半身取景：用非人固定词里的半身版，不带悬浮词（上半身构图没有落地与悬浮之分）；巨型仍按巨型局部取景。
    const half = profile.framing === 'half' && profile.size !== 'giant' && Boolean(template.halfBody);
    const frame = half ? template.halfBody : template.framing[profile.size], anchor = half ? template.anchor.ground : template.anchor[profile.anchor];
    const useWhite = whiteBackground && !transparent;
    const matte = transparent ? TRANSPARENT_BACKGROUND_TAGS : (useWhite ? WHITE_BACKGROUND_TAGS : MATTE_BACKGROUND_TAGS);
    const positive = applyTemplate(template.positive, { tags: joinTags(anchor.positive, tags), framing: frame.positive, matte });
    const negative = joinTags(template.negative, frame.negative, anchor.negative, NSFW_NEGATIVE_GUARD);
    return { positive: dropMatteTagsWhenTransparent(positive, positiveContext),
        negative: useWhite ? dropWhiteBackgroundNegative(negative) : negative };
}

// 模板路径的出图参数：与人类 expressionPaintMeta 同形，画布按 creature.canvas 取。
export function creaturePaintMeta(rawProfile, { transparent = false, whiteBackground = false, positiveContext = '', spriteSize = '832x1216', signal } = {}) {
    const prompts = creatureFixedPrompts(rawProfile, { transparent, whiteBackground, positiveContext });
    return {
        size: creatureCanvasSize(rawProfile, spriteSize),
        imageKind: 'sprite',
        userPrompts: { positive: prompts.positive, negative: prompts.negative },
        transparent,
        ...(signal && { signal }),
    };
}

// 旧组合路径（外部来源、旧版 DNA）的单张立绘槽：有可组合的英文 DNA 时 tags 只供姿态，否则使用写词结果。
export function buildCreatureAssetSlot(item, { transparent = false, whiteBackground = false, positiveContext = '' } = {}) {
    const profile = normalizeCreatureProfile(item.need.dna && item.need.dna.creature);
    const dnaParts = composeSpritePromptParts(item.need.dna, { expression: item.tags, outfit: '' });
    const tags = dnaParts ? dnaParts.positive : mergePromptTags(item.tags);
    const fixed = creatureFixedPrompts(profile, { transparent, whiteBackground, positiveContext, tags });
    const useWhite = whiteBackground && !transparent;
    const sceneUc = joinTags(fixed.negative, dnaParts ? dnaParts.negative : '', item.uc);
    return { scene: fixed.positive, sceneUc: useWhite ? dropWhiteBackgroundNegative(sceneUc) : sceneUc, chars: [], transparent };
}
