// 数据库生图模式下的前端提示词接线：素材补全的正负模板既写进交给插件写词 LLM 的描述，
// 也在出图前合并进插件返回的 NaiCaption，保证 IGS 前端填写的提示词一定进入最终请求。

const WEIGHT_RE = /^-?\d*\.?\d+::|::$/g;

export function splitTags(text) {
    return String(text || '').split(/[,，\n]/).map((t) => t.trim()).filter(Boolean);
}

// 比较用的标签键：忽略大小写、多余空格、NovelAI 权重语法与强调括号。
export function tagKey(tag) {
    return String(tag || '').trim().replace(WEIGHT_RE, '').replace(/^[{[(]+|[}\])]+$/g, '')
        .trim().toLowerCase().replace(/\s+/g, ' ');
}

// 按先后顺序合并多组标签，重复的只保留第一次出现。
export function mergeTags(...groups) {
    const seen = new Set();
    const out = [];
    for (const group of groups) {
        for (const tag of splitTags(group)) {
            const key = tagKey(tag);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(tag);
        }
    }
    return out.join(', ');
}

export function buildDbgenAssetDescription(need = {}, prompts = {}) {
    const isBackground = need.type === 'background';
    const when = [need.time, need.weather].filter(Boolean).join('、');
    const positive = mergeTags(prompts.positive);
    const negative = mergeTags(prompts.negative);
    return [
        isBackground
            ? `画场景「${need.name || ''}」${when ? `（${when}）` : ''}的背景图。`
            : `画角色「${need.name || ''}」的立绘。`,
        positive ? `用户指定的正面提示词，必须原样写入正面提示词：${positive}` : '',
        negative ? `用户指定的负面提示词，必须原样写入负面提示词，且正面提示词中不得出现：${negative}` : '',
        isBackground ? '地点陈设、光线与氛围依据楼层正文补充。' : '角色外貌与服装依据楼层正文补充。',
    ].filter(Boolean).join('\n');
}

// 正面：插件内容在前、前端正向模板追加在后，并去掉与前端负面冲突的标签；
// 负面：插件负面加上前端负面。角色 caption 结构与坐标原样保留。
export function applyUserPromptsToCaption(caption, prompts = {}) {
    const positive = splitTags(prompts.positive);
    const negative = splitTags(prompts.negative);
    if (!caption || typeof caption !== 'object' || (!positive.length && !negative.length)) return caption;
    const blocked = new Set(negative.map(tagKey));
    const keep = (text) => splitTags(text).filter((tag) => !blocked.has(tagKey(tag))).join(', ');
    const posPrompt = caption.v4_prompt || {};
    const negPrompt = caption.v4_negative_prompt || {};
    const pos = posPrompt.caption || {};
    const neg = negPrompt.caption || {};
    return {
        ...caption,
        v4_prompt: {
            ...posPrompt,
            caption: {
                ...pos,
                base_caption: mergeTags(keep(pos.base_caption), positive.join(', ')),
                char_captions: (Array.isArray(pos.char_captions) ? pos.char_captions : [])
                    .map((c) => ({ ...c, char_caption: keep(c && c.char_caption) })),
            },
        },
        v4_negative_prompt: {
            ...negPrompt,
            caption: {
                ...neg,
                base_caption: mergeTags(neg.base_caption, negative.join(', ')),
                char_captions: Array.isArray(neg.char_captions) ? neg.char_captions : [],
            },
        },
    };
}
