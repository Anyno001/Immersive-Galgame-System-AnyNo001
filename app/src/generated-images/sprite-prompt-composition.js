import { normalizeCharacterDna, splitPromptTags, mergePromptTags } from '../scene/character-dna.js';

// DNA 是分散保存的角色词；英文资料本地组合，需转译时使用单份写词结果，不叠加旧外貌。
const englishParts = (value) => splitPromptTags(value).filter((part) => /[a-z]/i.test(part)
    && !/[\u3040-\u30ff\u3400-\u9fff]/.test(part));
const EXPRESSION_POSE_RE = /^(?:expressionless|emotionless|blank stare|straight face|serious|calm|happy|sad|angry|annoyed|smug|shy|embarrassed|surprised|nervous|worried|crying|tears|blush|laughing|smiling|grin|smirk|frown|pout|open mouth|closed mouth|parted lips|closed eyes|half-closed eyes|wide-eyed|narrowed eyes|looking (?:at viewer|away|down|up|to the side)|head tilt|standing|arms at sides|arms behind back|hands behind back|crossed arms|arms crossed|hands? on (?:own )?(?:hips?|chest|chin|cheek)|.*\b(?:smile|expression)|:\)|:d|\^_\^)$/i;
const keyOf = (part) => part.replace(/^-?\d*\.?\d+::|::$/g, '')
    .replace(/^[{[(]+|[}\])]+$/g, '').trim();
export const isSpriteExpressionTag = (part) => EXPRESSION_POSE_RE.test(keyOf(part));
// 与现有立绘动作规则一致；这些是当次姿势，不是另一份外貌资料。
const DAILY_POSE_RE = /^(?:hands? in (?:own )?(?:pockets?|hair)|adjusting hair|brushing hair|holding (?:own )?(?:shirt|clothes|hem)|hand behind head)$/i;
// 灵动方案另保留手势与上身动作类标签；衣装、道具、背景类词仍不放行。标准方案不受影响。
const GESTURE_RE = /\b(?:(?:hands?|fingers?|fists?|palms?) (?:on|to|near|over|at|behind|together|clasped|up|raised|covering|touching|scratching|against|under|pressed|holding|clenched)|fingers? \w+|arms? (?:crossed|raised|behind|up|folded|out|wide)|(?:crossed|folded|raised) arms|clenched fists?|fists? clenched|leaning (?:forward|back|backward|to the side)|shrug\w*|shoulders (?:raised|up)|head (?:down|tilt\w*)|(?:covering|touching|scratching) \w+|holding own \w+|waving|pointing|hugging|bowing)\b/i;
const NOT_GESTURE_RE = /\b(?:bare|tattoos?|broad|narrow|muscular|bag|strap|pads?|armou?r|guard|gloves?|sleeves?|ring|bracelet|watch|band|bandage|sword|gun|weapon|cape|jacket|coat|shirt|dress|skirt|background)\b|\bholding (?!own|hands?|arms?)/i;
const isGestureTag = (part) => GESTURE_RE.test(keyOf(part)) && !NOT_GESTURE_RE.test(keyOf(part));
export const spriteExpressionTags = (text, scheme) => splitPromptTags(text).filter((part) => isSpriteExpressionTag(part)
    || DAILY_POSE_RE.test(keyOf(part)) || (scheme?.id === 'lively' && isGestureTag(part))).join(', ');

export function hasSpriteDna(dna) {
    const profile = normalizeCharacterDna(dna);
    return profile.identityInitialized === true
        || ['triggerWords', 'identity', 'defaultAppearance', 'negative'].some((field) => profile[field]);
}

// 旧图重画只有可直接组合时才能复用当次动作；需要转译或按服装名写词时重新走既有写词入口。
export function spritePromptNeedsWriting(dna, outfit) {
    if (!hasSpriteDna(dna)) return false;
    const clothes = outfit && typeof outfit === 'object' ? outfit : null;
    const prompt = clothes ? (clothes.nude ? 'nude' : String(clothes.prompt || '').trim()) : undefined;
    if (clothes && !clothes.nude && !prompt) return true;
    const view = clothes ? { ...dna, defaultAppearance: '' } : dna;
    return composeSpritePromptParts(view, { outfit: prompt }) === null;
}

export function composeSpritePromptParts(dna, { expression = '', outfit } = {}) {
    const profile = normalizeCharacterDna(dna);
    const raw = [profile.triggerWords, profile.identity, profile.defaultAppearance].filter(Boolean);
    // 混合/中文资料由同次写词请求转译；不能把部分英文与完整转译结果拼接。
    const translated = [...raw, profile.negative, outfit].some((part) => /[\u3040-\u30ff\u3400-\u9fff]/.test(part || ''));
    const sourced = !translated && (raw.length > 0 || profile.identityInitialized === true);
    if (!sourced) return null;
    const fixed = [...englishParts(profile.triggerWords), ...englishParts(profile.identity)]
        .filter((part) => !isSpriteExpressionTag(part));
    const clothes = englishParts(outfit === undefined ? profile.defaultAppearance : outfit)
        .filter((part) => !isSpriteExpressionTag(part));
    return { positive: mergePromptTags(fixed.join(', '), expression, clothes.join(', ')),
        negative: mergePromptTags(englishParts(profile.negative).filter((part) => !isSpriteExpressionTag(part)).join(', ')) };
}

// 单人立绘：角色块是 DNA 的组合结果；模型的完整外貌词不再追加。
export function composeSpriteCaption(caption, dna, { outfit, scheme } = {}) {
    const pos = caption?.v4_prompt?.caption;
    const neg = caption?.v4_negative_prompt?.caption;
    if (!pos || !neg) return caption;
    const chars = Array.isArray(pos.char_captions) ? pos.char_captions : [];
    const role = chars[0]?.char_caption || pos.base_caption;
    const parts = composeSpritePromptParts(dna, { expression: spriteExpressionTags(role, scheme), outfit });
    if (!parts) return caption;
    const ucs = Array.isArray(neg.char_captions) ? neg.char_captions : [];
    return {
        ...caption,
        v4_prompt: { ...caption.v4_prompt, caption: { ...pos,
            base_caption: chars.length ? spriteExpressionTags(pos.base_caption, scheme) : parts.positive,
            char_captions: chars.map((item, index) => index === 0
                ? { ...item, char_caption: parts.positive } : item),
        } },
        v4_negative_prompt: { ...caption.v4_negative_prompt, caption: { ...neg,
            base_caption: chars.length ? neg.base_caption : mergePromptTags(neg.base_caption, parts.negative),
            char_captions: chars.length
                ? chars.map((_, index) => index === 0
                    ? { ...ucs[index], char_caption: parts.negative } : (ucs[index] || { char_caption: '' }))
                : ucs,
        } },
    };
}
