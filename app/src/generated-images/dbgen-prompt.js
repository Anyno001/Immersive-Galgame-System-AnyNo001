import { moodPresetUse } from '../scene/mood-groups.js';
import { BUILTIN_PROMPTS } from './prompt-registry.js';
import { schemePrompts, performanceLines } from './prompt-scheme.js';
import { hasSpriteDna, isSpriteExpressionTag } from './sprite-prompt-composition.js';

// 楼内补立绘一次最多写 8 份，超过则平分 2 批。
export const EXPRESSION_WRITE_BATCH_MAX = 8;
// 表情差分：不超过 9 份一次写完；10–18 份平分 2 批；超过 18 份平分 3 批。一批写完并出完再写下一批。
export const EXPRESSION_DIFF_BATCH_MAX = 9;
// 数据库生图模式下的前端提示词接线：写词接口只说明画什么。
// 正负模板在出图前合并进插件返回的 NaiCaption，不交给写词模型照抄。
const OUTFIT_TEMPLATE_RULE = '任务 outfitMode 为 template 时，每份写 outfit_mode: template；named Char 在身份占位后恰写本人的 <<outfit:token>> 一次，再写动作与表情，不重复衣装说明。'
    + 'meta_outfit_name 与 meta_outfit_description 是独立服装 DNA：本次 outfit.name 或对应正文服装栏已有名称时逐字沿用原名，尚未入柜或缺说明也不改名、不翻译、不另造英文名；只有正文和本次资料均未命名时才命名。已保存说明按原值复用，不改写或重新设计；缺说明的新装在同次回复提供逗号分隔的纯英文 TAG，细节同样用标签，不写自然语言穿着谓语，不增加写词请求。固定外貌、动作、表情和背景不进入服装 DNA。'
    + '新衣装逐件保留来源明确的主辅色、材质、剪裁、领袖与长度、内外层和纹样；首次建档未指定的视觉细节协调补全，不覆盖已知设定或已保存说明。配饰保留已知颜色、形状、数量与佩戴位置，左右按穿着者自身。不用泛称服装或配饰替代明确细节；同套差分复用同一说明，不随表情换色换饰。'
    + 'reference 的两项 meta_outfit_* 在自己的索引各写一次空值，reference、scene 与 UC 不使用衣装占位。';

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


function splitEven(list, parts) {
    const base = Math.floor(list.length / parts);
    let extra = list.length % parts;
    const out = [];
    let offset = 0;
    for (let i = 0; i < parts; i += 1) {
        const size = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra -= 1;
        out.push(list.slice(offset, offset + size));
        offset += size;
    }
    return out;
}

// 楼内补立绘：单次写词最多 8 份。超过 8 份均分成两批（10 份是 5 和 5），由调用方串行写。
export function splitWriteBatches(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length <= EXPRESSION_WRITE_BATCH_MAX) return list.length ? [list] : [];
    return splitEven(list, 2);
}

// 表情差分写词：9 份及以内一批；超过 9 份平分 2 批；超过 18 份平分 3 批。
export function splitExpressionWriteBatches(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    if (list.length <= EXPRESSION_DIFF_BATCH_MAX) return [list];
    return splitEven(list, list.length <= EXPRESSION_DIFF_BATCH_MAX * 2 ? 2 : 3);
}

// note 是用户这次临时补的要求（性格、某个情绪的特别表现），只影响写词这一步；
// 情绪清单保留名称与适用情境，具体神态和动作由写词模型结合角色性格设计。
export function buildExpressionDiffDescription(name, prompt, labels, dna, outfit, { note = '', nsfw = false, transparent = true, template = false, includeDna = true, scheme } = {}) {
    const P = schemePrompts(scheme);
    const moods = (Array.isArray(labels) ? labels : []).map((item) => String(item || '').trim()).filter(Boolean);
    if (template) return [
        `为角色「${name || ''}」写 ${moods.length} 份独立表情动态模板，按本次 slots 映射输出。`,
        `本批图号与表情一一对应：${moods.map((mood, index) => `slotid: ${index + 1} 对应 ${mood}`).join('；')}。每图第一行独立写 slotid: 本图编号，不输出表情标题或 #编号。`,
        '每图写完 prompt_mode、scene、scene_uc、char、char_uc 和该图全部 meta 字段；Char 索引从0重新开始。多图只在完整图片之间用独立一行 ---，之后下一非空行必须是新的 slotid；单图不写 ---，同图字段之间不分段。不输出 at 或身份候选。',
        P.halfBodyRule,
        OUTFIT_TEMPLATE_RULE,
        '只引用已保存的 half_body 身份，不生成候选、不重复固定外貌。',
        '每份 Char 正文为 <<dna:token>> <<outfit:token>> 加当次表情与动作；服装 DNA 已有则直接复用，缺失则同次写入独立 meta_outfit_*，不要重写包含外貌和衣装的完整正文。',
        outfit?.nude ? '本次不穿衣服；保留基础身份和标志性特征。'
            : outfit?.name ? `当次服装：${outfit.name}。服装名、词池和具体穿着说明以本次角色资料为准。`
            : '当次衣装沿用角色资料中的默认穿着，不复制旧立绘的固定外貌。',
        P.expression.designRule,
        ...performanceLines(scheme),
        '按本次要求写明镜头、底色、质量、UC 和用户模板内容。',
        note ? `本次额外要求：\n${note}` : '',
        ...moods.map((mood, index) => {
            const use = moodPresetUse(mood);
            return `${index + 1}. ${mood}${use ? `；用在${use}` : ''}`;
        }),
    ].filter(Boolean).join('\n');
    if (!includeDna) {
        const saved = dna?.version === 2 || hasSpriteDna(dna) ? '' : formatReturnedCaption(prompt?.caption);
        const words = Array.isArray(outfit?.words) ? outfit.words.filter(Boolean).join('、') : '';
        const requestNote = String(note || '').trim();
        return [
            `为角色「${name || ''}」写 ${moods.length} 份立绘表情差分。`,
            saved ? `已有立绘的外貌与构图：\n${saved}` : '',
            P.framing,
            P.facing,
            outfit?.nude ? '本次人物采用全裸形态，视觉要素由自身皮肤、毛发和身体特征构成，裸体细节依据本人身份描写。'
                : outfit?.name ? `本次穿着「${outfit.name}」，服装细节采用下方衣装设定。`
                : '本次穿着采用下方角色资料中的衣装设定。',
            words ? `衣装补充描述：${words}` : '',
            outfit?.nsfwBoost && !outfit?.nude ? nsfwClothingBoostLine('character') : '',
            P.expression.designRule,
            ...performanceLines(scheme),
            requestNote ? `本次补充要求：\n${requestNote}` : '',
            spriteGroundLine(transparent),
            ...moods.map((mood, index) => `${index + 1}. ${mood}${moodPresetUse(mood) ? `；用于${moodPresetUse(mood)}` : ''}`),
            `按 slotid 1 到 ${moods.length} 的顺序输出 ${moods.length} 份。`,
        ].filter(Boolean).join('\n');
    }
    const stored = prompt && typeof prompt === 'object' ? prompt : {};
    const caption = hasSpriteDna(dna) ? '' : formatReturnedCaption(stored.caption);
    const clothes = outfit && typeof outfit === 'object' ? outfit : null;
    const outfitName = clothes ? String(clothes.name || '').trim() : '';
    const words = clothes && Array.isArray(clothes.words)
        ? clothes.words.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
    const nude = Boolean(clothes && clothes.nude);
    const clothesPrompt = nude ? '' : (clothes ? String(clothes.prompt || '').trim() : '');
    const wordText = words.length ? `，衣服按这些词来画：${words.join('、')}` : '';
    const wear = caption
        ? '上面 char 里的衣服换成下面的服装提示词，人还是上面那个。'
        : '衣服按下面的服装提示词来画。';
    const clothesLine = nude
        ? '这一套是裸体。不要画任何衣服、内衣和配饰，按这个角色的长相画裸体立绘。不要沿用原装的衣服，也不要另附服装提示词。'
        : !outfitName
        ? (hasSpriteDna(dna)
            ? '角色词由下面的 DNA 字段组合，服装沿用默认外观，不另引用已有立绘的整份外貌词。'
            : (caption ? '服装也按上面这份画。' : '外貌、服装和构图与已有立绘保持一致。'))
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
        clothes && clothes.nsfwBoost && !nude ? nsfwClothingBoostLine('character') : '',
        clothesPrompt && includeDna ? `服装提示词：\n${clothesPrompt}` : '',
        P.expression.designRule,
        P.halfBodyRule,
        P.uprightLine,
        ...performanceLines(scheme),
        String(note || '').trim() ? `这次额外的要求：\n${String(note).trim()}` : '',
        caption ? '上面那份立绘的表情和动作不要沿用，每份的表情、嘴型、眼神和手势都按各自的情绪重写。' : '',
        spriteGroundLine(transparent),
        ...(includeDna ? characterDnaLines(name, expressionPaintDna(dna, outfit)) : []),
        ...moods.map((mood, index) => {
            const use = moodPresetUse(mood);
            return `${index + 1} ${mood}${use ? `；用于${use}` : ''}`;
        }).filter(Boolean),
        `按 slotid 1 到 ${moods.length} 的顺序另写 ${moods.length} 份：${moods.map((label, index) => `${index + 1} ${label}`).join('、')}。`,
    ].filter(Boolean).join('\n');
}


// 旧组合路径使用正常上半身。只拿掉双手下垂，避免表情动作被锁死。
export function expressionSpritePrompts(positive, negative, scheme) {
    const drop = new Set(splitTags(schemePrompts(scheme).expression.dropPositive).map(tagKey));
    const kept = splitTags(positive).filter((tag) => !drop.has(tagKey(tag))).join(', ');
    return { positive: kept, negative: String(negative || '') };
}

// 旧组合路径使用腰胯以上和正面。负面排除全身和脚。
export function uprightSpriteCaption(caption, scheme) {
    const { positive: UPRIGHT_POSITIVE, negative: UPRIGHT_NEGATIVE } = schemePrompts(scheme).expression;
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

// 写词来源保留自身流程，角色资料在写词时采用，不在出图时改写成品。
function characterDnaLines(name, dna) {
    const profile = dna && typeof dna === 'object' ? dna : {};
    const identity = String(profile.identity || '').trim();
    const appearance = String(profile.defaultAppearance || '').trim();
    const dnaNegative = String(profile.negative || '').trim();
    const triggers = String(profile.triggerWords || '').trim();
    if (!identity && !appearance && !dnaNegative && !triggers) return [];
    return [
        `「${name || ''}」的固定设定必须用于本次角色词，缺失细节再按角色设定补充。`,
        identity ? `固定身份：\n${identity}` : '',
        appearance ? `默认外观：\n${appearance}` : '',
        triggers ? `触发词：\n${triggers}` : '',
        dnaNegative ? `不要出现：\n${dnaNegative}` : '',
    ].filter(Boolean);
}


function spriteGroundLine(transparent) {
    return transparent === false ? '人物轮廓外为纯白色实底。' : '透明底，人物轮廓外为透明区域，人物作为独立图层完整保留。';
}

// 设置页直接出一张角色立绘。没有正文，长相和衣服按角色设定写。
export function buildCharacterSpriteDescription(name, dna, options) {
    const P = schemePrompts(options?.scheme);
    const nude = Boolean(options && options.nude);
    const note = String(options && options.note || '').trim();
    if (options?.template) return [
        `为角色「${name || ''}」写一份默认立绘动态模板，slotid 为 1。`,
        OUTFIT_TEMPLATE_RULE,
        P.halfBodyRule,
        '固定身份只引用本次任务 token；仅缺景别时同次输出独立景别 DNA 候选，衣装不进入 DNA。',
        nude ? '当次不穿衣服；保留基础身份及标志性特征，不删改 DNA。' : '衣装按当次角色资料；未指定时按角色设定设计日常穿着。',
        P.poseRule, ...performanceLines(options.scheme), note ? `本次额外要求：\n${note}` : '',
        '镜头、底色、质量、UC 和用户模板约束以本次 writingRequirements 为准，用英文绘图 TAG 写入对应字段。',
    ].filter(Boolean).join('\n');
    return [
        nude ? `画角色「${name || ''}」的裸体立绘。` : `画角色「${name || ''}」的立绘。`,
        nude
            ? '角色呈现全裸形态，人物视觉要素由自身皮肤、毛发和身体特征构成。按外貌设定描写身体及标志性特征，裸体细节直接依据本人身份撰写。'
            : '外貌与服装采用下方角色设定，缺省细节结合角色设定协调补齐。',
        P.framing,
        P.facing,
        P.poseRule,
        ...performanceLines(options?.scheme),
        note ? `这次额外的要求：\n${note}` : '',
        spriteGroundLine(options && options.transparent),
        ...(options?.includeDna !== false ? characterDnaLines(name, dna) : []),
        '按当前来源约定的格式直接输出一份完整生图提示词，slotid 为 1。',
    ].filter(Boolean).join('\n');
}

// 状态栏头像：Q 版圆脸，只画一颗头。长相按角色设定写。
export function buildCharacterAvatarDescription(name, dna, options) {
    if (options?.template) return [
        `为角色「${name || ''}」写一份 Q 版头像动态模板，slotid 为 1，使用 portrait 身份。`,
        OUTFIT_TEMPLATE_RULE,
        '仅引用已保存 DNA，不建立或补写身份候选。',
        '头像裁成圆形，只画头、脖子与肩膀；脸在正中占画面大半，圆脸、大眼、正面带一点笑。',
        '不画肩膀以下身体或手，纯色浅底，不要背景或文字。衣领沿用当次衣装。',
        '固定身份只放自身 token；质量、UC 和用户约束在当次写词中完成。',
    ].join('\n');
    return [
        `画角色「${name || ''}」的 Q 版头像（chibi）。`,
        '头像采用圆形裁切，画面主体由完整头部、颈部和双肩组成，下边缘落在肩线。脸居中占画面大半，圆脸、大眼，正面看向画面，带一点笑。',
        '发色、瞳色、发型和头部饰品逐项采用下方外貌设定，肩颈处呈现当前衣装的衣领。',
        '画面内容由角色头像和干净的纯色浅底构成，主体之外的区域保留为纯色。',
        ...(options?.includeDna !== false ? characterDnaLines(name, dna) : []),
        '按当前来源约定的格式直接输出一份完整生图提示词，slotid 为 1。',
    ].filter(Boolean).join('\n');
}

// 勾选「瑟瑟加强」后追加。只告诉模型这是成年人的色情服装、不要改成普通衣服，不附带成套标签。
export function nsfwClothingBoostLine(kind = 'clothes') {
    return kind === 'character'
        ? BUILTIN_PROMPTS.wardrobe.nsfwBoostCharacter
        : BUILTIN_PROMPTS.wardrobe.nsfwBoostClothes;
}

// 剧情入柜：提取独立服装 DNA，不生成角色立绘正文。
export function buildWardrobeClothingDescription(_character, outfitName, { nsfwBoost = false, note = '' } = {}) {
    const outfit = String(outfitName || '').trim();
    const request = String(note || '').trim();
    return [
        `为服装「${outfit}」提取一份独立服装 DNA，作为后续服装占位符的替换值。`,
        request ? `用户对这套服装的具体要求（必须照办）：${request}` : '',
        '只写英文穿着描述，不写角色主体、固定外貌、表情、动作、背景或完整立绘提示词。',
        '服装和配套饰品仅按本次依据描述，不为凑齐全套而编造未提供的衣物。',
        '逐件保留来源明确的主色与辅色、材质和光泽、剪裁、领型袖型、长度、开合、边饰与纹样，写清内外层关系；颜色紧邻对应衣物或部位，不能仅用服装名或深色衣服概括，不把光照色当固有色。',
        '配饰保留来源明确的数量、颜色、材质、形状、大小及佩戴位置，左右按穿着者自身；区分发饰、耳饰、胸针、领结和腰带扣。不编造未知颜色或装饰，不为凑细节增添饰物；产出一份可由所有表情逐字复用的完整说明。',
        nsfwBoost ? nsfwClothingBoostLine('clothes') : '',
        '不要写人，不要写表情、姿势、背景。',
        '只写一份，slotid 为 1。',
    ].filter(Boolean).join('\n');
}

// 本楼还缺的立绘一次写完。名单里只有尚未生成的，已有的不进来。
export function buildDbgenSpriteBatchDescription(needs = [], options = {}) {
    const P = schemePrompts(options.scheme);
    if (options.template) return [
        `按本次 slots 映射写 ${needs.length} 份独立立绘动态模板，slotid 从 1 到 ${needs.length}。`,
        OUTFIT_TEMPLATE_RULE,
        P.halfBodyRule,
        '每份从独立一行 slotid: 本图编号开始，写完全部 scene、char、char_uc 和 meta 字段再分隔下一图；--- 后下一非空行必须是新的 slotid，单图内部不分段。',
        ...needs.map((need, index) => `${index + 1}. ${need.name}${need.outfitName
            ? `；触发标签衣装原名：${need.outfitName}，名称逐字沿用，只补充服装描述，不采用楼末其他衣装。` : ''}`),
        '每份只画该 slot 指定的角色，固定身份使用自身 token。',
        '仅缺景别的角色同次输出独立景别 DNA 候选；已有景别逐字保留，服装独立。',
        P.poseRule,
        ...performanceLines(options.scheme),
        '按本次 writingRequirements 写明镜头、底色、质量、UC 和自定义模板内容。',
        '不重新选择生成点，不从正文摘挂载句。',
    ].join('\n');
    const items = Array.isArray(needs) ? needs : [];
    const list = items.map((need, index) => `${index + 1}. ${need && need.name ? need.name : ''}${need?.outfitName
        ? `；本次服装：${need.outfitName}（采用触发标签的原名及对应服装说明）` : ''}`);
    const count = list.length;
    const profiles = (options.includeDna === false ? [] : items)
        .map((need, index) => {
            const lines = characterDnaLines(need && need.name, need && need.dna);
            return lines.length ? [`第 ${index + 1} 份：`, ...lines].join('\n') : '';
        })
        .filter(Boolean);
    return [
        `写${count}张立绘的提示词，按下面的顺序各一份，slotid 从 1 数到 ${count}。`,
        list.join('\n'),
        profiles.length ? '角色外貌与服装依据正文补充；下面列了设定的角色，长相按设定写。' : '角色外貌与服装依据正文补充。',
        ...profiles,
        P.framing,
        P.poseRule,
        ...performanceLines(options.scheme),
        spriteGroundLine(options.transparent),
        '按上述清单逐份输出立绘提示词。',
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
        '按上述清单逐份输出背景提示词。',
    ].join('\n');
}

export function buildDbgenAssetDescription(need = {}, options = {}) {
    const P = schemePrompts(options.scheme);
    const when = [need.time, need.weather].filter(Boolean).join('、');
    if (need.type === 'sprite') {
        return [
            `画角色「${need.name || ''}」的立绘。`,
            `角色外貌与服装依据正文补充。${spriteGroundLine(options.transparent)}`,
            ...(need.outfitName ? [`本次穿着触发标签指定的「${need.outfitName}」，细节采用该套服装说明。`] : []),
            P.framing,
            P.poseRule,
            ...performanceLines(options.scheme),
            ...(options.includeDna !== false ? characterDnaLines(need.name, need.dna) : []),
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

// 独立服装词只用于当次换装，不与旧立绘的整份外貌词合并。

function dnaEnglishTags(text) {
    return splitTags(text).filter((tag) => /[a-z]/i.test(tag) && !/[\u3040-\u30ff\u3400-\u9fff]/.test(tag));
}

function isExpressionPoseTag(tag) {
    return isSpriteExpressionTag(tag);
}

// 服装提示词只发给写词，不拼进最终出图词。
// 原装或这套有自己的立绘、又没有服装提示词时，用那张立绘的提示词去掉表情、姿势后剩下的长相和衣服。
const LOOK_SKIP_TAGS = new Set(['solo', 'cowboy shot', 'facing viewer', 'straight-on', 'centered', 'transparent background', 'simple background', 'grey background', 'light grey background', 'flat color background', 'no background'].map(tagKey));

function storedCharTags(prompt) {
    const stored = prompt && typeof prompt === 'object' ? prompt : {};
    const pos = stored.caption && stored.caption.v4_prompt && stored.caption.v4_prompt.caption;
    if (pos) {
        const chars = Array.isArray(pos.char_captions) ? pos.char_captions : [];
        return String((chars[0] && chars[0].char_caption) || pos.base_caption || '');
    }
    return String(stored.positive || '');
}

export function expressionLookTags(basePrompt, outfit, dna) {
    const clothes = outfit && typeof outfit === 'object' ? outfit : null;
    const clothesPrompt = clothes ? String(clothes.prompt || '').trim() : '';
    if (clothesPrompt || (clothes && !clothes.ownImage)) return '';
    return splitTags(storedCharTags(basePrompt))
        .filter((tag) => !isExpressionPoseTag(tag) && !LOOK_SKIP_TAGS.has(tagKey(tag)))
        .join(', ');
}

// 换了衣服的那一套，DNA 的默认外观里是原装的衣服，硬合会和新衣服打架。
export function expressionPaintDna(dna, outfit) {
    if (!dna || typeof dna !== 'object' || !outfit || typeof outfit !== 'object') return dna;
    if (outfit.form) return formPaintDna(dna, outfit.form);
    return { ...dna, defaultAppearance: '' };
}

// 变身形态：身份、外观整段让给这一套的生图词；触发词里的性别 / 年龄标签摘掉，再按 form.gender 补一个。
const FORM_BODY_TAG_RE = new RegExp(`^(?:${BUILTIN_PROMPTS.form.bodyTagPattern})$`, 'i');
const FORM_GENDER_TAG = BUILTIN_PROMPTS.form.gender;
function formPaintDna(dna, form) {
    const triggers = String(dna.triggerWords || '').split(/[,，]/).map((t) => t.trim()).filter((t) => t && !FORM_BODY_TAG_RE.test(t));
    const gender = FORM_GENDER_TAG[form && form.gender];
    const age = BUILTIN_PROMPTS.form.age[form && form.age];
    return { ...dna, identity: '', defaultAppearance: '', triggerWords: [gender, age, ...triggers].filter(Boolean).join(', ') };
}

export function applyLookToCaption(caption, tags) {
    return prependCharTags(caption, tags);
}

// 把一组标签放到角色 caption（没有角色块时放 base）最前，原有标签按 keep 过滤后接在后面。
function prependCharTags(caption, tags, keep = () => true) {
    const pos = caption && caption.v4_prompt && caption.v4_prompt.caption;
    if (!String(tags || '').trim() || !pos) return caption;
    const merge = (text) => mergeTags(tags, splitTags(text).filter(keep).join(', '));
    const chars = Array.isArray(pos.char_captions) ? pos.char_captions : [];
    return {
        ...caption,
        v4_prompt: {
            ...caption.v4_prompt,
            caption: {
                ...pos,
                base_caption: chars.length ? pos.base_caption : merge(pos.base_caption),
                char_captions: chars.map((item, index) => (index === 0
                    ? { ...(item && typeof item === 'object' ? item : {}), char_caption: merge(item && item.char_caption) }
                    : item)),
            },
        },
    };
}
