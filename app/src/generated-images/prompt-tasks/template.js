// 参考 1001适配gal前端生图预设.json 的 hard-constraints、main-uid20；按内置任务裁剪协议。
export const templateRule = ({ outfitSelection, tagDynamics = false } = {}) => [
    '每张图以独立一行 slotid: 本轮允许正整数 开始，编号恰好一次。写 prompt_mode: dna_template、scene、scene_uc，可写 size: 宽x高 和 analysis。尺寸服从本次要求。除 analysis 可多行记录简短来源与检查结论外，每字段单行，不输出推理正文。',
    '先写本图全部 char/char_uc 对，再按 Char 顺序写各自 meta 字段。--- 只分隔完整的不同图片，之后下一非空行必须是新的 slotid；单图内部和末尾不写 ---，不同人物之间绝不分段。',
    '【逐图数量与索引】本图有 N 个 Char，就必须有 N 条 char、N 条 char_uc 和 N 组不同索引的 meta_*，索引恰为 0 到 N-1。每组 meta 中的多行字段仍只算一个人物组，不会创建 Char。两人图先写 char、char_uc、char、char_uc，再写索引0和1各自的 meta；下一张图独立计数并从0重新编号。char_uc 可空但行必须保留。纯空镜 N=0，不写人物字段。meta_rows 是诊断名称，不是可交付字段，不能输出 meta_rows:。',
    tagDynamics
        ? 'char 格式为实际数字坐标 | 本人的身份与衣装占位符及逗号分隔的英文动作、表情 TAG。坐标为0到1的数字，不写字面 x,y，不增加索引、kind 或角色名等额外列。每个 char 后紧接 char_uc，可空但字段不能省略。'
        : 'char 格式为实际数字坐标 | 英文正文，例如 char: 0.32,0.52 | <<dna:r0>> <<outfit:r0>> and waves.。坐标为0到1的数字，不写字面 x,y，不增加索引、kind 或角色名等额外列。每个 char 后紧接 char_uc，可空但字段不能省略。',
    'named 正向 Char 恰好一次自己的 <<dna:token>> 作身份槽；任务 outfitMode 为 template 时另写 outfit_mode: template，本人 Char 恰好一次自己的 <<outfit:token>>，后接动作表情，不重复固定外貌或衣装正文。非衣装模板任务直接写当次衣装 TAG；已有保存说明仍原样复用。本人 char_uc 最多一次自己的 <<dna_uc:token>>；Scene、他人提及和元数据不放身份令牌。每段权重独立闭合，不用未闭合权重包住占位符。',
    '本图 Char 按实际出现顺序从0连续编号；每个索引各写 meta_kind、meta_key、meta_token、meta_frame、meta_outfit_name、meta_outfit_description 恰好一次，所有行内值都为 本图索引 | 值。前四项非空且匹配输入；衣装两项空值也必须保留索引和竖线。slotid、token 数字和原角色序号不是本图索引，不在末尾重复汇总。',
    'meta_frame 按输入及实际可见范围选 full_body、half_body、portrait，partial 只兼容输入明确指定的历史任务。输入有 outputs.rows 时按本图 captionIndex 对账；有 promptTask.slots 时仅绑定本槽全部 tokens，不照搬其他槽。',
    outfitSelection === 'catalog'
        ? '每个 named 都交付非空 meta_outfit_name 和 meta_outfit_description，并恰好一次 meta_outfit_id: 本图索引 | 本轮衣柜编号；不用保存衣装时竖线后显式留空。名称、描述与衣装槽始终完整交付，编号不是 token、slotid 或 captionIndex。'
        : '新衣装没有可复用说明时 meta_outfit_name 与 meta_outfit_description 都非空；有名保存衣装名称逐字沿用，仅本次 outfit/outfits 同名已有非空说明时，description 才可为空复用，填写则逐字照抄。不从旧默认衣装字段推断空值来源。',
].join('\n');
export const TEMPLATE_RULE = templateRule();
export const SPRITE_TEMPLATE_RULE = templateRule({ tagDynamics: true });
export const PICTURE_RULE = [
    'Scene 用连贯英文说明同一可见瞬间的人数、动作归属、接触、相对位置、取景、环境与光影，不堆固定外貌。Char 只写自身状态，互动对象可普通点名或唯一指向，不借用对方 token；可少量复述互动明确归属，不复制整段 Scene。',
    '先理解主体、核心动作、对象、接触、空间及取景，再组织动态句子，不逐词翻译 tag。信息充分但不设句数或新长度配额；简单画面简写，复杂互动写清关系。',
    '将情绪转为可见的眼、嘴、眉和姿态，不写心理、隐藏动机或先后多帧。取景、朝向、遮挡、焦点和透视一致；闭眼不要求可见瞳孔，背向不要求正脸，脸出框不写表情，不补画画外鞋脚。同一肢体不能做互斥动作，所持物和接触对象写清。',
    '按本次 userPrompts/writingRequirements 写明质量、UC、尺寸和底色。需要质量词时在 Scene 按要求写出，不添加无依据的通用词。Scene UC 只放全场排除项，Char UC 只放自身动态风险，不机械反转身份或排除必需人物。所给触发词与权重保真。',
    '默认英文，仅实际渲染的文字保留原文并说明载体。正向与排除项不能冲突。',
].join('\n');

export const SPRITE_PICTURE_RULE = [
    'Scene 使用逗号分隔的英文绘图 TAG，写人数、景别、机位、底色和本次指定的光线。Char 在本人的身份与衣装占位符后接动作、姿势和表情 TAG；完整 caption 格式则直接使用本人的可见身份与衣装 TAG。各字段按当前输出协议组织。',
    '外貌与衣装沿用本次角色资料；表情依据指定情绪与性格选择可见的眼、眉、嘴和姿态标签。构图与可见部位保持一致，画面只表达同一瞬间。',
    '按本次 userPrompts/writingRequirements 写入质量、UC、尺寸和底色。已有英文标签、触发词、权重及必须的身份与衣装占位符保持原样；英文绘图内容采用 TAG。Scene UC 放全场排除标签，Char UC 放本人的排除标签。',
].join('\n');
