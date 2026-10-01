// 数据库生图模式下的前端提示词接线：写词接口只说明画什么。
// 正负模板在出图前合并进插件返回的 NaiCaption，不交给写词模型照抄。

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

// 插件 LLM 回给程序的是扁平字段。已有立绘按这个格式放进用户描述。
function formatReturnedCaption(caption) {
    const pos = caption && caption.v4_prompt && caption.v4_prompt.caption;
    const neg = caption && caption.v4_negative_prompt && caption.v4_negative_prompt.caption;
    if (!pos || !neg) return '';
    const lines = ['slotid: 1'];
    const scene = String(pos.base_caption || '').trim();
    const sceneUc = String(neg.base_caption || '').trim();
    if (scene) lines.push(`scene: ${scene}`);
    if (sceneUc) lines.push(`scene_uc: ${sceneUc}`);
    const chars = Array.isArray(pos.char_captions) ? pos.char_captions : [];
    const ucs = Array.isArray(neg.char_captions) ? neg.char_captions : [];
    const count = Math.max(chars.length, ucs.length);
    for (let i = 0; i < count; i += 1) {
        const item = chars[i] && typeof chars[i] === 'object' ? chars[i] : {};
        const center = Array.isArray(item.centers) ? item.centers[0] : null;
        const x = center && Number.isFinite(Number(center.x)) ? Number(center.x) : 0.5;
        const y = center && Number.isFinite(Number(center.y)) ? Number(center.y) : 0.5;
        const text = String(item.char_caption || '').trim();
        const uc = String((ucs[i] && ucs[i].char_caption) || '').trim();
        if (text) lines.push(`char: ${x},${y} | ${text}`);
        if (uc) lines.push(`char_uc: ${uc}`);
    }
    return lines.join('\n');
}

export function buildExpressionDiffDescription(name, prompt, labels, dna, outfit) {
    const moods = (Array.isArray(labels) ? labels : []).map((item) => String(item || '').trim()).filter(Boolean);
    const stored = prompt && typeof prompt === 'object' ? prompt : {};
    const caption = formatReturnedCaption(stored.caption);
    const profile = dna && typeof dna === 'object' ? dna : {};
    const clothes = outfit && typeof outfit === 'object' ? outfit : null;
    const outfitName = clothes ? String(clothes.name || '').trim() : '';
    const words = clothes && Array.isArray(clothes.words)
        ? clothes.words.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    const identity = String(profile.identity || '').trim();
    const appearance = String(profile.defaultAppearance || '').trim();
    const dnaNegative = String(profile.negative || '').trim();
    const triggers = String(profile.triggerWords || '').trim();
    const clothesPrompt = clothes ? String(clothes.prompt || '').trim() : '';
    const wordText = words.length ? `，衣服按这些词来画：${words.join('、')}` : '';
    const wear = caption
        ? '上面 char 里的衣服换成下面的服装提示词，人还是上面那个。'
        : '衣服按下面的服装提示词来画。';
    const clothesLine = !outfitName
        ? (caption ? '服装也按上面这份画。' : '外貌、服装和构图与已有立绘保持一致。')
        : clothesPrompt
            ? (clothes.ownImage
                ? `这一套就是服装「${outfitName}」。${wear}不要画成别的衣服。`
                : `这一套要改成服装「${outfitName}」。${wear}不要沿用原装的衣服。`)
            : clothes.ownImage
                ? `这一套就是服装「${outfitName}」${words.length ? `（${words.join('、')}）` : ''}。不要画成别的衣服。`
                : `这一套要改成服装「${outfitName}」${wordText}。不要沿用原装的衣服。`;
    return [
        outfitName
            ? `为角色「${name || ''}」的服装「${outfitName}」写 ${moods.length} 份立绘表情差分。`
            : `为角色「${name || ''}」写 ${moods.length} 份立绘表情差分。`,
        caption ? '下面这份是已有立绘，外貌和构图按它画。这不是要回写的图。' : '',
        caption,
        clothesLine,
        clothesPrompt ? `服装提示词：\n${clothesPrompt}` : '',
        '表情依据该角色的性格、脾气与行为习惯分别撰写，禁止套用统一表情模板。',
        '规格：大腿以上（cowboy shot）。朝向正面，直立，平视。禁止全身，禁止露出脚，禁止侧身，禁止倾斜构图。',
        '情绪须写入肢体：手势、肩线、重心随该情绪变化。禁止仅替换面部。',
        '无背景，透明底。',
        identity ? `固定身份：\n${identity}` : '',
        appearance ? `默认外观：\n${appearance}` : '',
        triggers ? `触发词：\n${triggers}` : '',
        dnaNegative ? `不要出现：\n${dnaNegative}` : '',
        `按 slotid 1 到 ${moods.length} 的顺序另写 ${moods.length} 份：${moods.map((label, index) => `${index + 1} ${label}`).join('、')}。`,
    ].filter(Boolean).join('\n');
}

const UPRIGHT_POSITIVE = 'cowboy shot, standing, facing viewer, straight-on';
const UPRIGHT_NEGATIVE = 'dutch angle, from side, profile, full body, feet';
const EXPRESSION_DROP_POSITIVE = new Set(['arms at sides'].map(tagKey));

// 景别回到大腿以上。只拿掉双手下垂，避免表情动作被锁死。
export function expressionSpritePrompts(positive, negative) {
    const kept = splitTags(positive).filter((tag) => !EXPRESSION_DROP_POSITIVE.has(tagKey(tag))).join(', ');
    return { positive: kept, negative: String(negative || '') };
}

// 写词结果补上大腿以上和正面。负面排除全身和脚。
export function uprightSpriteCaption(caption) {
    const pos = caption && caption.v4_prompt && caption.v4_prompt.caption;
    const neg = caption && caption.v4_negative_prompt && caption.v4_negative_prompt.caption;
    if (!pos || !neg) return caption;
    const chars = Array.isArray(pos.char_captions) ? pos.char_captions : [];
    const ucs = Array.isArray(neg.char_captions) ? neg.char_captions : [];
    const nextChars = chars.map((item) => ({
        ...(item && typeof item === 'object' ? item : {}),
        char_caption: mergeTags(item && item.char_caption, UPRIGHT_POSITIVE),
    }));
    const nextUcs = (ucs.length ? ucs : nextChars.map(() => ({ char_caption: '' }))).map((item) => ({
        ...(item && typeof item === 'object' ? item : {}),
        char_caption: mergeTags(item && item.char_caption, UPRIGHT_NEGATIVE),
    }));
    return {
        ...caption,
        v4_prompt: {
            ...caption.v4_prompt,
            caption: {
                ...pos,
                base_caption: chars.length ? pos.base_caption : mergeTags(pos.base_caption, UPRIGHT_POSITIVE),
                char_captions: nextChars,
            },
        },
        v4_negative_prompt: {
            ...caption.v4_negative_prompt,
            caption: {
                ...neg,
                base_caption: mergeTags(neg.base_caption, UPRIGHT_NEGATIVE),
                char_captions: chars.length ? nextUcs : ucs,
            },
        },
    };
}

// 待确认服装：只写这一套衣服的生图标签，不写出图。
export function buildWardrobeClothingDescription(_character, outfitName) {
    const outfit = String(outfitName || '').trim();
    return [
        `为服装「${outfit}」写一份生图用的服装提示词。`,
        '一定要注意：生成的是一套衣服，而不是角色，没有角色。',
        '这是一整套穿着，从上到下写完整：头上、上身、下身、腿和脚，以及配套的饰品。不要只写其中一件。',
        '每件都写清款式、颜色和材质。',
        '不要写人，不要写表情、姿势、背景。',
        '只写一份，slotid 为 1。',
    ].join('\n');
}

// 本楼还缺的背景一次写完。名单里只有尚未生成的，已有的不进来。
export function buildDbgenBackgroundBatchDescription(needs = []) {
    const list = (Array.isArray(needs) ? needs : []).map((need, index) => {
        const when = [need && need.time, need && need.weather].filter(Boolean).join('、');
        return `${index + 1}. ${need && need.name ? need.name : ''}${when ? `（${when}）` : ''}`;
    });
    const count = list.length;
    return [
        `为本楼写${count}张背景的提示词，按下面的顺序各一份，slotid 从 1 数到 ${count}。`,
        list.join('\n'),
        '地点陈设、光线与氛围依据楼层正文补充。',
        '不要写生成点，不要从正文摘挂载句。',
    ].join('\n');
}

export function buildDbgenAssetDescription(need = {}) {
    const when = [need.time, need.weather].filter(Boolean).join('、');
    if (need.type === 'sprite') {
        return [
            `画角色「${need.name || ''}」的立绘。`,
            '角色外貌与服装依据正文补充。无背景，透明底。',
        ].join('\n');
    }
    if (need.type === 'background') {
        return [
            `画场景「${need.name || ''}」${when ? `（${when}）` : ''}的背景图。`,
            '地点陈设、光线与氛围依据楼层正文补充。',
        ].join('\n');
    }
    return '';
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
