// 非人角色最终提示词的整理：按标签去重、统一成单行逗号分隔、差分让固定姿态词让位。
// 只在 prepareCharacterCaption 展开身份后、且角色带 creature 档案时调用；人类提示词不经过这里。
import { splitPromptTags } from '../scene/character-dna.js';

// 同一标签的比较键：忽略大小写、空白与 n::tag:: 权重写法。
const keyOf = (tag) => tag.replace(/^-?\d*\.?\d+::|::$/g, '').replace(/^[{[(]+|[}\])]+$/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const weighted = (tag) => /^-?\d*\.?\d+::/.test(tag);
// 固定词里的姿态类词（取景词 battle stance 等）；差分自带姿态词时让位。
const POSE_TAG_RE = /^(?:.*\bstance|.*\bposture)$/i;

// sides：同一侧（正向或负向）的若干段文本，先出现的位置保留；同键标签保留带权重的那个。
export function tidyTagSegments(segments, { dropPose = false } = {}) {
    const best = new Map();
    const lists = segments.map((text) => splitPromptTags(text).filter((tag) => !(dropPose && POSE_TAG_RE.test(keyOf(tag)))));
    for (const list of lists) for (const tag of list) {
        const key = keyOf(tag);
        if (key && (!best.has(key) || (weighted(tag) && !weighted(best.get(key))))) best.set(key, tag);
    }
    const seen = new Set();
    return lists.map((list) => list.flatMap((tag) => {
        const key = keyOf(tag);
        if (!key || seen.has(key)) return [];
        seen.add(key);
        return [best.get(key)];
    }).join(', '));
}

// 就地整理已展开的 caption；derived 差分去掉基础段（场景段）里的固定姿态词。
// only：多人画面（CG）只整理这些序号的人物提示词，各自独立去重；场景段与其他人物逐字不动，人类与非人互不影响。
export function tidyCreatureCaption(caption, { derived = false, only = null } = {}) {
    const sides = [caption?.v4_prompt?.caption, caption?.v4_negative_prompt?.caption];
    sides.forEach((side, index) => {
        if (!side) return;
        const chars = Array.isArray(side.char_captions) ? side.char_captions : [];
        if (Array.isArray(only)) {
            for (const i of only) if (chars[i]) chars[i].char_caption = tidyTagSegments([chars[i].char_caption || ''])[0];
            return;
        }
        // 姿态词让位只作用于正向场景段，负向不删。
        const base = tidyTagSegments([side.base_caption || ''], { dropPose: derived && index === 0 })[0];
        const rest = tidyTagSegments([base, ...chars.map((c) => c.char_caption || '')]);
        side.base_caption = rest[0];
        chars.forEach((c, i) => { c.char_caption = rest[i + 1]; });
    });
    return caption;
}
