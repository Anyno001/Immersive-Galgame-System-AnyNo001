// 内置生图「方案」：标准（原框架）与灵动（取景到膝、自然比例、有手势）。
// 灵动的文字全部由标准的同一批常量按句替换派生；找不到原句即抛错，不会静默失效。
// 预设里用 data.spriteScheme / data.performance 标记方案与演绎档位，运行时按当前生效预设取句。
import {
    BUILTIN_PROMPTS, SPRITE_HALF_BODY_RULE, SPRITE_FRAMING_DESCRIPTION, SPRITE_FACING_DESCRIPTION, SPRITE_UPRIGHT_LINE,
    DNA_TEMPLATE_WRITER_SYSTEM,
} from './prompt-registry.js';
import { IDENTITY_RULE, IDENTITY_FACE_RULE, OUTFIT_HALF_BODY_RULE, OUTFIT_HALF_BODY_PARTS } from './prompt-tasks/common.js';
import { SPRITE_DATA, SPRITE_TEMPLATE, SPRITE_CAPTION } from './prompt-tasks/sprite.js';
import { DNA_DATA } from './prompt-tasks/dna.js';
import { EXPRESSION_FRAGMENTS, EXPRESSION_TEMPLATE } from './prompt-tasks/expression.js';
import { OUTFIT_DATA, OUTFIT_TEMPLATE } from './prompt-tasks/outfit.js';
import { CG_TEMPLATE } from './prompt-tasks/cg.js';
import { BACKGROUND_CAPTION, BACKGROUND_PLAN } from './prompt-tasks/background.js';

export const SCHEME_STANDARD = 'standard';
export const SCHEME_LIVELY = 'lively';
export const PERFORMANCE_SUBTLE = 'subtle';
export const PERFORMANCE_EXPRESSIVE = 'expressive';
// 灵动 CG 主体：角色（User 弱化）/ User。
export const CG_SUBJECT_CHARACTER = 'character';
export const CG_SUBJECT_USER = 'user';

// 只替换出现恰好 count 次的原句，否则抛错。
export function swap(text, from, to, count = 1) {
    const found = text.split(from).length - 1;
    if (found !== count) throw new Error(`灵动方案替换失败：原句出现 ${found} 次（应为 ${count}）：${from.slice(0, 40)}`);
    return text.split(from).join(to);
}

// ---- 方案标记 ----

const STANDARD = Object.freeze({ id: SCHEME_STANDARD, performance: null, cgSubject: null, tagFill: false });

// 从预设数据读方案；无标记（含用户旧预设、复制的标准预设）一律按标准。
// 灵动另带 CG 主体（缺省角色）与补标签（缺省关）。
export function spriteSchemeOf(data) {
    if (data?.spriteScheme !== SCHEME_LIVELY) return STANDARD;
    return Object.freeze({ id: SCHEME_LIVELY,
        performance: data.performance === PERFORMANCE_EXPRESSIVE ? PERFORMANCE_EXPRESSIVE : PERFORMANCE_SUBTLE,
        cgSubject: data.cgSubject === CG_SUBJECT_USER ? CG_SUBJECT_USER : CG_SUBJECT_CHARACTER,
        tagFill: data.tagFill === true });
}
const isLively = (scheme) => scheme?.id === SCHEME_LIVELY;

// ---- 灵动：取景与衣装 ----

const LIVELY_HALF_BODY_RULE = swap(SPRITE_HALF_BODY_RULE,
    '立绘、换装和表情的 half_body 使用正常上半身取景：从完整头顶到腰胯，完整保留头发、双肩和躯干，手势在画面内，头顶及身体两侧留少量余白。Scene 的半身构图标签使用 upper body。',
    '立绘、换装和表情使用膝上取景：从完整头顶到膝盖附近，完整保留头发、双肩、躯干、双手与大腿，手势在画面内，头顶及身体两侧留少量余白，不画小腿以下与鞋袜。Scene 的构图标签使用 cowboy shot。');

// 半身衣装按段替换：段首对不上即抛错。
function replacePart(parts, prefix, text) {
    const index = parts.findIndex(part => part.startsWith(prefix));
    if (index < 0) throw new Error(`灵动方案替换失败：找不到衣装段「${prefix}」`);
    return parts.map((part, i) => (i === index ? text : part));
}
let outfitParts = [...OUTFIT_HALF_BODY_PARTS];
outfitParts = outfitParts.map(part => (part.startsWith('【半身服装 DNA】')
    ? swap(part, '只删除画外衣物、画外长度及细节的完整标签和分隔符', '只删除鞋、袜与脚踝饰物的完整标签和分隔符') : part));
outfitParts = replacePart(outfitParts, '取景为完整头顶到腰胯。',
    '取景为膝上：完整头顶到膝盖附近。保留画内的上装、裙身或裤装结构及其颜色、材质、领袖、开合、褶裥、腰带和可见口袋；裙裤类别、裙长、裤型与衣摆长度同样保留，不为保留整套衣物而延伸取景。');
outfitParts = replacePart(outfitParts, '即使裙身或裤腰仍入镜，',
    'outfit_half_body 用于膝上取景：从完整衣装删除鞋、袜与脚踝饰物，保留裙长、裤型、衣摆长度与腰部结构。knee-length、mini、maxi 等裙长，裙摆、开衩、下摆花边，裤腿长度、卷边，以及外套下摆长度等标签均保留。');
outfitParts = replacePart(outfitParts, '鞋靴、袜子、丝袜、裤袜',
    '鞋靴、袜子及脚踝饰物在膝上取景之外，整组移除，包括其颜色、材质与权重；不能只删鞋而留下 white socks、ankle socks 等。完整母版中上装和鞋袜共用的模糊材质标签，按实际归属决定，不误删画内上装细节。');
outfitParts = outfitParts.map(part => (part.startsWith('保留部分的措辞')
    ? swap(part, '派生时可删 knee-length dress 而保留原有的', '派生时保留 knee-length dress 与原有的') : part));
outfitParts = outfitParts.map(part => (part.startsWith('已有 descriptionHalfBody')
    ? swap(part, '半身栏已去掉画外长度、裙摆、裤腿和鞋袜', '半身栏已去掉鞋袜与脚踝饰物并保留裙长、裤型与衣摆长度') : part));
const LIVELY_OUTFIT_HALF_BODY_RULE = outfitParts.join('\n');

// ---- 灵动：身份规则 ----

const LIVELY_FACE_RULE = '五官按设定选择可准确表达的脸型、眉形、眼型与瞳色标签，不以漂亮、英俊或职业气质代替，也不为凑齐鼻梁、下巴等微细节而写自然语言。唇形、唇色与妆容只在角色资料明确写出时保留，否则不写。常态眼型可以来自稳定设定，喜怒、闭眼、视线方向属于当次表情，不混入身份。';

const LIVELY_IDENTITY_RULE = swap(swap(swap(IDENTITY_RULE, IDENTITY_FACE_RULE, LIVELY_FACE_RULE),
    '，不默认人人窄肩、细腰、高个、长腿。', '。未设定体格时按柔和美型：男性写 slim, bishounen，女性写 slim。'),
    '肤色和 slim 的通用组合', '肤色的通用组合');

// ---- 灵动：姿态与表情 ----

const LIVELY_POSE_RULE = '按角色性格设计一个自然的手势，不遮挡或不完全遮挡面部。';

const LIVELY_STANCE_RULE = '各张表情差分保持相同站位，切换时人物不位移。';

const sprite = BUILTIN_PROMPTS.sprite, expression = BUILTIN_PROMPTS.expression;
const LIVELY_EXPRESSION_DESIGN_RULE = swap(swap(expression.designRule, '嘴型和轻微动作', '嘴型和一个不遮挡或不完全遮挡面部的自然手势'),
    '取景边界和正面朝向一致', '取景边界和站位一致');

const SCHEME_PROMPTS = Object.freeze({
    [SCHEME_STANDARD]: Object.freeze({
        halfBodyRule: SPRITE_HALF_BODY_RULE,
        framing: SPRITE_FRAMING_DESCRIPTION,
        facing: SPRITE_FACING_DESCRIPTION,
        uprightLine: SPRITE_UPRIGHT_LINE,
        poseRule: sprite.poseRule,
        expression: Object.freeze({ designRule: expression.designRule, positive: expression.positive,
            negative: expression.negative, dropPositive: expression.dropPositive }),
        templates: Object.freeze({ sprite: sprite.positive, spriteNegative: sprite.negative }),
    }),
    [SCHEME_LIVELY]: Object.freeze({
        halfBodyRule: LIVELY_HALF_BODY_RULE,
        framing: LIVELY_HALF_BODY_RULE,
        facing: '人物面向镜头，镜头与视线齐平。',
        uprightLine: '面向镜头，平视，不使用倾斜构图与侧脸。',
        poseRule: LIVELY_POSE_RULE,
        expression: Object.freeze({
            designRule: LIVELY_EXPRESSION_DESIGN_RULE,
            positive: 'cowboy shot, standing, facing viewer',
            negative: 'dutch angle, from side, profile, upper body, full body, feet, shoes',
            dropPositive: expression.dropPositive,
        }),
        templates: Object.freeze({
            sprite: swap(sprite.positive, 'upper body, standing, facing viewer, looking at viewer, straight-on, centered',
                'cowboy shot, standing, facing viewer, looking at viewer, centered'),
            spriteNegative: swap(sprite.negative, 'portrait, full body, feet, head out of frame, cropped arms, ',
                'portrait, upper body, full body, feet, shoes, head out of frame, cropped arms, arms at sides, '),
        }),
    }),
});

export const schemePrompts = (scheme) => SCHEME_PROMPTS[isLively(scheme) ? SCHEME_LIVELY : SCHEME_STANDARD];

// 立绘模板默认值随方案取句：用户没改过（等于任一方案的默认值）才换，改过的原样保留。
// 改过的立绘模板里与灵动取景冲突的词（旧版默认的 arms at sides、straight-on 等）不进正面。
const tagKey = (tag) => tag.trim().toLowerCase();
const LIVELY_SPRITE_CONFLICTS = new Set([...SCHEME_PROMPTS[SCHEME_LIVELY].templates.spriteNegative.split(','), 'straight-on'].map(tagKey));
const dropLivelyConflicts = (text) => text.split(',').filter(part => !LIVELY_SPRITE_CONFLICTS.has(tagKey(part))).join(',');

export function schemeTemplates(templates, scheme) {
    if (!isLively(scheme)) return templates;
    const standard = SCHEME_PROMPTS[SCHEME_STANDARD].templates, lively = SCHEME_PROMPTS[SCHEME_LIVELY].templates;
    const out = { ...templates };
    for (const key of ['sprite', 'spriteNegative']) {
        if (out[key] === undefined || out[key] === standard[key]) out[key] = lively[key];
    }
    if (out.sprite !== lively.sprite) out.sprite = dropLivelyConflicts(out.sprite);
    return out;
}
// 当前方案下「默认值」：立绘固定词与自定义模板的比较基准。
export const schemeTemplateDefaults = (scheme, fallback) => (isLively(scheme)
    ? { ...fallback, ...SCHEME_PROMPTS[SCHEME_LIVELY].templates } : fallback);

// ---- 演绎档位（仅灵动） ----

const PERFORMANCE = Object.freeze({
    [PERFORMANCE_EXPRESSIVE]: Object.freeze({
        rule: '演绎档位为夸张：表情与肢体按动画电影的方式放大，人物比例与站位不变。',
        positive: 'expressive',
        negative: 'chibi',
    }),
    [PERFORMANCE_SUBTLE]: Object.freeze({
        rule: '演绎档位为现实：表情与动作取日常生活中的轻微幅度。',
        positive: 'subtle expression',
        negative: '',
    }),
});

// 写词请求里追加的规则句（标准方案为空数组）。
export const performanceLines = (scheme) => {
    const level = isLively(scheme) && PERFORMANCE[scheme.performance];
    return level ? [level.rule] : [];
};
// 默认立绘与表情差分的正负追加词（标准方案无）。
export const performanceTags = (scheme) => {
    const level = isLively(scheme) && PERFORMANCE[scheme.performance];
    return level ? { positive: level.positive, negative: level.negative } : { positive: '', negative: '' };
};

// 差分写词一句话描述：标准方案原文；灵动允许写一个手势，并带演绎档位。
export function expressionFragmentDescription(pending, note, scheme) {
    const list = pending.map((mood, index) => `${index + 1}. ${mood}`).join('；');
    const face = isLively(scheme) ? '可见面部变化与一个配合的手势，不写身份、服装、道具或场景'
        : '可见面部变化，不写身份、服装、身体姿势、道具或场景';
    return [`只编写以下表情的${face}。按编号逐项输出：${list}。表情要求：${note || ''}`, ...performanceLines(scheme)].join('\n');
}

// ---- 灵动：预设各任务模块的格式正文 ----

const outfitSwapped = (text) => swap(text, OUTFIT_HALF_BODY_RULE, LIVELY_OUTFIT_HALF_BODY_RULE);
const halfBodySwapped = (text) => swap(text, SPRITE_HALF_BODY_RULE, LIVELY_HALF_BODY_RULE);

const LIVELY_EXPRESSION_FRAGMENTS = swap(swap(EXPRESSION_FRAGMENTS,
    '按本轮指定表情与用户要求，只写眼、眉、嘴、脸颊等可见变化，可结合所给性格，不复述身份、衣装，不写身体姿势、手势、道具、背景、镜头、质量或底色。',
    '按本轮指定表情与用户要求，写眼、眉、嘴、脸颊等可见变化，可配一个自然的手势，不遮挡或不完全遮挡面部，可结合所给性格，不复述身份、衣装，不写道具、背景、镜头、质量或底色。'),
    'eyes slightly widened and lips parted in surprise', 'eyes slightly widened, lips parted in surprise, one hand raised to chest');

const LIVELY_SPRITE_DATA = ['半身衣装仍有裙身类别、材质与腰部褶裥，只有画外裙长和鞋袜被删除',
    '半身衣装保留裙身类别、材质、裙长与腰部褶裥，只有鞋袜与脚踝饰物被删除'];
const livelySpriteData = () => {
    let text = swap(outfitSwapped(SPRITE_DATA), IDENTITY_RULE, LIVELY_IDENTITY_RULE);
    text = swap(text, ...LIVELY_SPRITE_DATA);
    text = swap(text, 'high waist, pleated dress, 1.2::white cardigan::', 'high waist, pleated dress, knee-length dress, 1.2::white cardigan::');
    text = swap(text, ', slim, narrow waist', '', 2);
    text = swap(text, '，纤细体态，', '，');
    // 默认立绘的姿态由写词给出：平和表情加一个手势，替换程序的默认平和词。
    text = swap(text, 'outfit_name、outfit_description、outfit_half_body；',
        'outfit_name、outfit_description、outfit_half_body、pose；pose 用英文 TAG 写平和表情与一个符合性格的自然手势，不遮挡或不完全遮挡面部；');
    text = swap(text, 'personality: composed, attentive, patient\n', 'personality: composed, attentive, patient\npose: light smile, closed mouth, hand on own chest\n');
    return swap(text, '半身衣装不含画外长度和腿脚细节', '半身衣装不含鞋袜与脚踝饰物');
};
const livelySpriteTemplate = () => swap(halfBodySwapped(swap(SPRITE_TEMPLATE, IDENTITY_RULE, LIVELY_IDENTITY_RULE)),
    '接默认站姿与平和表情', '接符合性格的站姿手势与平和表情');
const livelySpriteCaption = () => swap(halfBodySwapped(SPRITE_CAPTION),
    '保持默认站姿和平和表情', '保持符合性格的站姿手势和平和表情');

// ---- 灵动：CG 构图（参考 数据库生图1016绘图预设 的构图决策、可见性、Char 规范，按 IGS 字段协议改写） ----

const LIVELY_CG_PICTURE_RULE = '能用 Danbooru 标签准确表达的优先用标签；标签拼不出的空间关系、复杂动作、动态过程和材质氛围，用简短英文短语紧跟所修饰的标签。关联度高的内容相邻排列。简单画面简写，复杂互动写清关系。';

export const LIVELY_CG_COMPOSITION = [
    '# 构图决策',
    '先定叙事意图，再选视角、景别与机位；下表是建议，按剧情微调，不堆叠矛盾机位。',
    '## 视角',
    '- 第三人称客观呈现：默认，不写视角标签。',
    '- 第一人称主观呈现：pov；持镜者默认不出镜，实际参与互动才露出必要肢体（pov hands 等）。',
    '## 景别（距离越近表情权重越高，越远环境权重越高）',
    '|景别|标签|用途|配重|',
    '|---|---|---|---|',
    '|特写|close-up|面部表情、关键道具|表情与微细节拉满，背景虚化|',
    '|近景|upper body|表情捕捉、突发事件、压迫感|表情与手势，弱化背景|',
    '|中景|cowboy shot|日常互动、对话推进（最常用）|动作与表情兼顾|',
    '|全景|full body|全身造型、完整动作|动作为主，表情压缩为一两个核心词，带环境定位|',
    '|远景|wide shot|交代地点、氛围、位置关系|环境为主，人物只留发色、服装色块与姿态|',
    '> 特写至少带上脸或上半身；单独的下半身、手、脚或衣物特写是无效构图。',
    '> 多图调度：全景烘托高潮，中景推进日常，近景引出冲突，特写埋伏笔。',
    '## 水平角度',
    '|类型|标签|叙事功能|',
    '|---|---|---|',
    '|正位|front view|直面镜头，客观呈现|',
    '|前侧3/4|three-quarter view|自然状态，兼顾表情与肢体，推进剧情|',
    '|侧位|from side|位置移动、双人同框互动|',
    '|后侧3/4|from behind, looking back|衬托登场或重要主体出现|',
    '|背位|from behind|离别、背影、大场景展示，看不到面部|',
    '## 垂直角度（倾角越大情绪越强）',
    '|类型|标签|情绪功能|',
    '|---|---|---|',
    '|平视|eye level|日常与平等交流|',
    '|俯视|from above|孤立无援、劣势|',
    '|仰视|from below|不容置疑、优势|',
    '|顶视|bird\'s-eye view|受监视感、环境展示|',
    '|虫视|worm\'s-eye view|危险与威胁|',
    '## 情境速查',
    '|情境|视角|景别|机位|',
    '|---|---|---|---|',
    '|日常对话|过肩或第三人称|中景|前侧3/4|',
    '|亲密互动|第三人称|中景|侧位|',
    '|暧昧压迫|pov|近景/中景|俯视|',
    '|强势支配|过肩/pov|中景/全景|仰视|',
    '|脆弱无助|第三人称|中景/全景|俯视|',
    '|孤独疏离|第三人称|全景/远景|背位+平视|',
    '|胜利定格|第三人称|全景|仰视|',
    '|败北战损|第三人称|中景|俯视|',
    '|盛大登场|第三人称|全景/远景|仰视|',
    '|战前对峙|过肩/第三人称|全景/中景|背位+平视|',
    '|交手过招|第三人称|中景/全景|侧位+平视|',
    '## 焦点与完整事件',
    '靠占比、位置和色彩对比抓视觉重心，可用景深虚化背景。每张图都呈现完整的场景事件：画面主体的脸清晰可见，动作、互动关系和所处环境可辨认；不聚焦脚、手、衣物等局部，不以局部代替角色与事件，不裁掉主体的脸。多人场景让关键人物同时入画，看得清彼此正在发生什么。',
    '## 分层',
    'Scene 按画面实际写 Foreground、Middle ground、Background，需要几层写几层。先安放主体与空间关系，再加服务主题的元素；跨层连续体（道路、墙面、列车）在每层写它的局部状态。各人的衣装细节与微表情留给本人 Char。',
    '## Char 动作',
    '- 先写整体体位（站、坐、躺、跪），再写核心动作，肢体拆成碎片标签：哪个部位、怎么持有、持有什么、放在哪、朝向哪、目标是谁。例：one hand, holding sword, sword in front of face；holding sword, hands on hilt, planted sword。',
    '- 每只手分别写，一只手的标签不覆盖另一只；手被遮挡或不在画面时不编造。',
    '- 标签拼不出的连贯动作或力学动态，用一句英文短句紧跟关联标签。持有物同样写颜色与外观。',
    '- 多人互动中归属易混的核心动作标注方向：发起方 source#action，承受方 target#action，双方同做 mutual#action。',
    '- 表情按景别详略：特写、近景写复合微表情，中景适度，全景压缩，远景省略。视线与朝向独立；看镜头以外的视线必须写明。',
    '## 坐标',
    '网格列 A–E 对应 x 0.1/0.3/0.5/0.7/0.9，行 1–5 对应 y 0.1/0.3/0.5/0.7/0.9，每人取一格。边缘格只用于局部出框。群像：2人 0.3,0.5 与 0.7,0.5；3人 0.1,0.5、0.5,0.5、0.9,0.5，或 0.3,0.7、0.5,0.3、0.7,0.7；4人及以上取 0.5,0.5，由 Scene 写清站位关系。人多时压缩次要细节，必须出镜的人与关键动作不省略。',
    '# 可见性（每张图必查）',
    '按景别裁切、朝向、遮挡依次判断，不可见的标签移出正向，需要时写进本人 char_uc：',
    '- 特写（面部）移除颈以下衣装与动作，入镜的手除外；近景移除腰以下的下装、腿部与鞋；cowboy shot 移除膝以下的鞋与脚，仍可见的袜子保留。',
    '- 背位、后侧3/4 移除面部、表情、瞳色与正面衣装细节，回头（looking back）除外。',
    '- pov 移除持镜者自身看不见的头发、瞳色与表情。闭眼移除瞳色；戴口罩移除嘴。部分可见的保留。',
    '# 排除项',
    '- char_uc 防构图漂移（cowboy shot 或 upper body 排 full body, wide shot；close-up 排 full body；wide shot 排 close-up）、防计数漂移（单人排 multiple girls, multiple boys）、防默认（没看镜头排 looking at viewer）、防污染（他人的专属发色、瞳色与衣装）。',
    '- scene_uc 只排全场都不能出现、且本图真有风险的内容，每个词答得出防什么，不堆万能清单。',
    '# 清理',
    '移除完全重复与语义重复的词（保留 white shirt，移除 shirt）、不可见的词和互相矛盾的词（blindfold 与瞳色、bra 与 topless、pantyhose 与 barefoot、站立与躺卧）。选中构图里仍可见的关键动作和人物不清掉。',
].join('\n');

function livelyCgTemplate() {
    let text = swap(swap(swap(CG_TEMPLATE, 'light skin, slim', 'light skin', 2), ', thick eyebrows, broad shoulders, muscular male', ''),
        'wavy hair, thick eyebrows', 'wavy hair');
    text = swap(text, '先理解主体、核心动作、对象、接触、空间及取景，再组织动态句子，不逐词翻译 tag。信息充分但不设句数或新长度配额；简单画面简写，复杂互动写清关系。',
        LIVELY_CG_PICTURE_RULE);
    return swap(text, '【交付前逐图核对】', `${LIVELY_CG_COMPOSITION}\n【交付前逐图核对】`);
}

// ---- 灵动：随请求追加、不进预设正文的规则（提示词页不显示） ----

const userLabel = (name) => (String(name || '').trim() ? `User（${String(name).trim()}）` : 'User（用户扮演的角色）');

const cgSubjectLine = (subject, userName) => (subject === CG_SUBJECT_USER
    ? `【CG 主体】${userLabel(userName)} 是画面主体：凡 User 在场的画面，User 正常出镜、面部清晰并位于视觉中心，其他人物围绕 User 安排位置与动作。正文明确是 User 的第一人称所见时仍可用 pov。`
    : `【CG 主体】与 ${userLabel(userName)} 互动的角色是画面主体，正常出镜、面部清晰。User 默认弱化：第一人称叙述时用 pov，User 只露出参与互动的必要肢体（pov hands 等），写进 Scene 与互动对象的 Char，不建立 User 的人物组；纯旁观的「看着」不画 User。只有画面确需 User 完整出镜时，才作为本人交付人物组并简述外貌。不为把 User 画进来而造成构图矛盾。`);

const TAG_FILL_IDENTITY = '【补标签】未设定体格时女性加 bishoujo，男性加 bishounen。首次登场的原创角色补全发型结构、五官、肤色与体型标签，并可加一个不改变设定的普通标志细节（如 mole under eye、ahoge、fang），细节越具体越容易保持一致。本条只作用于首次设计，不改写已保存资料与已明确的外貌。';

const NSFW_ESCALATE = '【NSFW 楼层】本楼为 NSFW 场景：私密部位尽量不遮挡，画面里可见却没写的部位补齐标签；一张图既可画成 SFW 也可画成 NSFW 时按 NSFW 画。同一楼的图像连环画一样连续，剧情没有明显转折时，后一张不退回 SFW、不突然衣着整齐。汗水、红晕、体液、衣物移位、发型散乱等持续状态逐图渐进，只有擦干、整理、换衣、休息或第二天才清零。';

// 立绘身份设计的补标签句（灵动且开启补标签才有）。
export const identityFillLines = (scheme) => (isLively(scheme) && scheme.tagFill ? [TAG_FILL_IDENTITY] : []);

// CG 写词追加句：标准方案为空。hints.nsfw 只在本楼按 NSFW 出图（且已开 NSFW）时为真。
export function livelyCgLines(scheme, { nsfw = false, userName = '' } = {}) {
    if (!isLively(scheme)) return [];
    return [cgSubjectLine(scheme.cgSubject, userName), ...identityFillLines(scheme), ...(nsfw === true ? [NSFW_ESCALATE] : [])];
}

// ---- 灵动：背景光色 ----

// 白天不写暖金光，避免整张背景发黄泛光。
const LIGHT_RULE = '区分固有颜色与光照。';
export const LIVELY_BACKGROUND_DAYLIGHT = '白天写 natural daylight，不写 warm、golden；暖色光只用于黄昏，或正文写明的灯光、烛火。';
const livelyBackground = (text) => swap(text, LIGHT_RULE, LIGHT_RULE + LIVELY_BACKGROUND_DAYLIGHT);

// 灵动方案各任务的格式正文；未列出的任务沿用标准。
export const LIVELY_TASK_TEXT = Object.freeze({
    sprite: Object.freeze({ 'sprite-data': livelySpriteData(), 'dna-template': livelySpriteTemplate(), 'caption-slots': livelySpriteCaption() }),
    dna: Object.freeze({ 'sprite-data': swap(DNA_DATA, IDENTITY_RULE, LIVELY_IDENTITY_RULE) }),
    expression: Object.freeze({ 'expression-fragments': LIVELY_EXPRESSION_FRAGMENTS,
        'dna-template': halfBodySwapped(swap(EXPRESSION_TEMPLATE, '完整写完本图字段再分隔下一图。', `完整写完本图字段再分隔下一图。\n${LIVELY_STANCE_RULE}`)) }),
    outfit: Object.freeze({
        'sprite-data': swap(outfitSwapped(OUTFIT_DATA), '半身栏保留画内结构并删去画外长度及鞋袜', '半身栏保留画内结构、裙长与衣摆长度并删去鞋袜与脚踝饰物'),
        'expression-fragments': LIVELY_EXPRESSION_FRAGMENTS,
        'dna-template': halfBodySwapped(OUTFIT_TEMPLATE) }),
    cg: Object.freeze({ 'dna-template': livelyCgTemplate() }),
    background: Object.freeze({ 'caption-slots': livelyBackground(BACKGROUND_CAPTION), 'asset-plan': livelyBackground(BACKGROUND_PLAN) }),
});

// 旧版写词系统提示的灵动变体（仅无预设的独立调用才会用到）。
export const LIVELY_DNA_TEMPLATE_WRITER_SYSTEM = (() => {
    let text = swap(DNA_TEMPLATE_WRITER_SYSTEM, SPRITE_HALF_BODY_RULE, LIVELY_HALF_BODY_RULE);
    text = swap(text, '，纤细、高挑、长腿。三行只示范', '。三行只示范');
    text = swap(text, '::, slim, tall, long legs,', '::,');
    text = swap(text, 'ornament::, slim,\nmeta_dna_portrait', 'ornament::,\nmeta_dna_portrait');
    return swap(text, '上述 half_body 只删除 tall, long legs,；portrait 再删除 slim,，', '上述三景别无画外体型标签需删除，');
})();

// 外部写词补身份时随任务带上的立绘固定词（标准方案即词库原对象）。
export function spriteUserPrompts(scheme) {
    if (!isLively(scheme)) return BUILTIN_PROMPTS.sprite;
    const group = SCHEME_PROMPTS[SCHEME_LIVELY];
    return { positive: group.templates.sprite, negative: group.templates.spriteNegative, poseRule: group.poseRule };
}

// 读取当前预设的方案；按预设版本号缓存，避免每次请求都深拷贝预设。
export function createPromptSchemeReader(registry) {
    let epoch = null, cached = STANDARD;
    return () => {
        const now = registry?.getImagePromptEpoch?.();
        if (now == null) return STANDARD;
        if (now !== epoch) { cached = spriteSchemeOf(registry.getCurrent('prompt-preset')?.data); epoch = now; }
        return cached;
    };
}
