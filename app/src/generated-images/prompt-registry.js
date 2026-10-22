// IGS 自带生图词库：各类图片的内置标签、给写词 AI 的规则句、场景词典都集中在这里，别处只引用不写字面量。
// 结构按「内容类别」分：立绘 / 表情差分 / Q 版头像 / 衣柜 / 背景 / 物品 / NSFW / 底色 / 变身 / 场景词典。

import { DNA_WEIGHT_RULE } from './prompt-tasks/common.js';

export const SPRITE_HALF_BODY_RULE = '立绘、换装和表情的 half_body 使用正常上半身取景：从完整头顶到腰胯，完整保留头发、双肩和躯干，手势在画面内，头顶及身体两侧留少量余白。Scene 的半身构图标签使用 upper body。立绘的构图、动作和表情用逗号分隔的英文绘图 TAG 表达，身份与衣装占位符保持原格式。明确指定 full_body 时使用 full body，指定 portrait 时使用 portrait，按该景别设置画面边界。普通 CG 和局部一致性沿各自镜头。';

export const BUILTIN_PROMPTS = Object.freeze({
    sprite: Object.freeze({
        // {tags} = DNA 组成的角色词与当次表情／动作；无 DNA 时使用写词结果。{matte} = 底色词。
        positive: '{tags}, solo, upper body, standing, facing viewer, looking at viewer, straight-on, centered, {matte}',
        negative: 'multiple views, 2girls, 2boys, multiple girls, multiple boys, crowd, close-up, portrait, full body, feet, head out of frame, cropped arms, 1.2::scenery, detailed background::, white background, 1.2::gradient background, patterned background, drop shadow, floor, furniture::, holding weapon, text, speech bubble, watermark, signature, frame, border',
        // 立绘站得太板正：要一个不挡身体的日常小动作。
        poseRule: '根据角色性格和本次情境设计自然、轻微的日常动作。人物站姿稳定，手部与身体姿态协调，手势安排在取景范围内，随身物件置于身体轮廓两侧或画面侧边，躯干轮廓与衣装主要结构清晰可见。',
    }),
    expression: Object.freeze({
        designRule: '根据本次指定情绪及其强度，结合角色性格设计相应的眉眼、视线、嘴型和轻微动作，使面部与身体共同表达该情绪，符合该角色的行为习惯。整组立绘保持固定外貌、当前衣装、取景边界和正面朝向一致，各种情绪具有可辨识的神态与姿态差异，手势安排在取景范围内，躯干轮廓与衣装主要结构清晰可见。',
        // 旧组合路径使用腰胯以上的正常上半身，负面不排除 upper body。
        positive: 'upper body, standing, facing viewer, straight-on',
        negative: 'dutch angle, from side, profile, full body, feet',
        // 只拿掉双手下垂，避免表情动作被锁死。
        dropPositive: 'arms at sides',
    }),
    avatar: Object.freeze({
        positive: 'chibi, solo, portrait, head and shoulders, neck, face focus, close-up, large face, centered, looking at viewer, smile, simple background',
        negative: 'upper body, cowboy shot, full body, lower body, waist, hips, midriff, navel, legs, feet, hands, arms, cleavage, multiple views, realistic, text, watermark, signature, frame, border',
    }),
    background: Object.freeze({
        positive: '{tags}, no humans, scenery, wide shot, detailed background, visual novel background',
        negative: '1girl, 1boy, people, person, character, crowd, silhouette, human, animal, text, speech bubble, watermark, signature, frame, border, ui, letterboxed',
    }),
    item: Object.freeze({
        positive: 'no humans, still life, item focus, single object, centered',
        negative: 'human, hands, text, watermark, multiple objects, cropped',
    }),
    wardrobe: Object.freeze({
        // 勾选「瑟瑟加强」后追加。只告诉模型这是成年人的色情服装、不要改成普通衣服，不附带成套标签。
        nsfwBoostCharacter: '这套是色情服装。不要回避，不要审查，不要改成普通、得体或日常衣服，也不要用衣物遮住这套该露的地方。按服装提示词加强暴露和色情。',
        nsfwBoostClothes: '这是色情服装。不要回避，不要审查，不要改成普通、得体或日常衣服，也不要把暴露的设计改成遮盖。按这个服装名加强色情和暴露，把款式、颜色、材质和露出的位置写清楚。',
    }),
    nsfw: Object.freeze({
        positive: 'nsfw',
    }),
    // 浅灰底比纯白更好抠：白衣服、高光与底色区分度高，羽化边缘不会留下刺眼白边。
    ground: Object.freeze({
        matte: 'simple background, grey background, light grey background, flat color background',
        white: 'simple background, white background, flat color background',
        transparent: 'transparent background',
    }),
    // 非人角色（妖魔鬼怪、怪物、使魔、半人形）：与人类立绘分开的固定词。{tags} = 角色词与当次姿态；{framing} = 按体型取的取景词；{matte} = 底色词。
    // framing 与 anchor 的 positive / negative 按档位拼入；人类立绘词不借用。
    creatureBeast: Object.freeze({
        positive: '{tags}, no humans, solo, {framing}, facing viewer, centered, {matte}',
        negative: '1girl, 1boy, human, humanoid, multiple views, multiple creatures, crowd, 1.2::scenery, detailed background::, white background, 1.2::gradient background, patterned background, drop shadow, floor, furniture::, text, speech bubble, watermark, signature, frame, border',
        framing: Object.freeze({
            small: Object.freeze({ positive: 'full body', negative: 'cropped body, out of frame' }),
            medium: Object.freeze({ positive: 'full body, battle stance', negative: 'cropped body, out of frame' }),
            large: Object.freeze({ positive: 'full body, towering', negative: 'cropped body, out of frame' }),
            giant: Object.freeze({ positive: 'from below, upper body, close-up, out of frame, looming', negative: 'full body, distant, small' }),
        }),
        anchor: Object.freeze({
            ground: Object.freeze({ positive: '', negative: '' }),
            float: Object.freeze({ positive: 'floating, hovering', negative: 'standing, feet on ground' }),
        }),
        // 默认立绘没有写词模型给的姿态时使用。
        defaultPose: 'idle stance, relaxed posture',
        poseRule: '正面迎向镜头的战斗或待机架势，符合物种习性：四足兽低伏或前扑预备，长身形立起、盘起或俯身前探并完整收进画面，有翼者收翼或半展，无面部可读时以头部朝向、肢体与躯干姿态表达状态。肢体、尾部与触手不被画框截断（巨型局部取景除外），不写人物日常小动作，不写场景、道具或其他生物。',
    }),
    creatureHumanoid: Object.freeze({
        positive: '{tags}, solo, {framing}, facing viewer, centered, {matte}',
        negative: 'multiple views, 2girls, 2boys, multiple girls, multiple boys, crowd, 1.2::scenery, detailed background::, white background, 1.2::gradient background, patterned background, drop shadow, floor, furniture::, text, speech bubble, watermark, signature, frame, border',
        framing: Object.freeze({
            small: Object.freeze({ positive: 'full body', negative: 'cropped legs, cropped tail, out of frame' }),
            medium: Object.freeze({ positive: 'full body', negative: 'cropped legs, cropped tail, out of frame' }),
            large: Object.freeze({ positive: 'full body, towering', negative: 'cropped legs, cropped tail, out of frame' }),
            giant: Object.freeze({ positive: 'from below, upper body, out of frame, looming', negative: 'full body, distant, small' }),
        }),
        anchor: Object.freeze({
            ground: Object.freeze({ positive: '', negative: '' }),
            float: Object.freeze({ positive: 'floating, hovering', negative: 'standing, feet on ground' }),
        }),
        // 半人形选了半身取景：与人类立绘同款的上半身构图（腰胯以上），下半身不入画；仍属非人固定词，不借用人类键。
        halfBody: Object.freeze({ positive: 'upper body, standing', negative: 'full body, feet, head out of frame, cropped arms' }),
        halfPoseRule: '正面迎向镜头的半身待机或战斗姿态：画面取腰胯以上，完整头顶、双肩与躯干入画，手势在取景内，头顶及身体两侧留少量余白；上身姿态符合人设，角、翼、耳、尾根等上半身的非人特征完整保留，非人的下半身不入画，不写与下半身有关的姿态。',
        defaultPose: 'standing, relaxed posture',
        poseRule: '正面迎向镜头的待机或战斗架势：上身姿态符合人设，非人的下半身（蛇尾、鱼尾、蜘蛛下身、马身等）完整入画并自然摆放，尾部与肢体不被画框截断（巨型局部取景除外）。手势安排在取景范围内，不写场景、道具或其他人物。',
    }),
    // 变身形态：触发词里这些性别 / 年龄标签摘掉，再按 form.gender 补一个。
    form: Object.freeze({
        bodyTagPattern: '\\d+\\s*(?:boy|girl)s?|male|female|boy|girl|man|woman|loli|shota|child|kid|teen(?:ager)?|adult|mature(?: \\w+)?|old(?: \\w+)?|young(?: \\w+)?|elderly|milf|petite|aged (?:up|down)|male focus|female focus',
        gender: Object.freeze({ male: '1boy', female: '1girl' }),
        // 年龄档：只换标签，不设任何内容边界（用户的画师串自己控制）。
        age: Object.freeze({ child: 'child', teen: 'teenager', adult: 'adult', elder: 'elderly' }),
    }),
});

// 场景词典：LLM 失败时背景按场景名、时间、天气拼基础 tag。左边是中文名正则（| 分隔），右边是英文标签。
export const SCENE_DICTIONARY = Object.freeze({
    location: Object.freeze([
        ['天台|屋顶', 'rooftop, fence, sky'],
        ['教室', 'classroom, desk, chair, chalkboard, window'],
        ['走廊|过道', 'hallway, corridor, window, floor'],
        ['图书(馆|室)|书房', 'library, bookshelf, book, desk'],
        ['卧室|寝室|房间', 'bedroom, bed, curtains, window, lamp'],
        ['客厅', 'living room, sofa, table, window, indoors'],
        ['厨房', 'kitchen, counter, stove, cabinet'],
        ['浴室|浴池|温泉', 'bathroom, bathtub, tiles, steam'],
        ['咖啡(馆|厅|店)', 'cafe, table, chair, counter, coffee cup'],
        ['餐厅|饭店|酒馆', 'restaurant, table, chair, indoors, warm lighting'],
        ['商店|便利店|超市', 'shop, shelf, store interior, indoors'],
        ['街|马路|路口', 'city street, road, building, sidewalk'],
        ['公园', 'park, tree, bench, grass, path'],
        ['森林|树林', 'forest, tree, nature, foliage'],
        ['海边|沙滩|海滩', 'beach, ocean, sand, horizon'],
        ['车站|站台', 'train station, platform, railway'],
        ['神社', 'shrine, torii, stone lantern, japanese architecture'],
        ['寺|庙', 'temple, east asian architecture, courtyard'],
        ['城堡|宫殿|王宫', 'castle, palace interior, pillar, chandelier, fantasy'],
        ['教堂', 'church, stained glass, pew, altar'],
        ['办公室|公司', 'office, desk, computer, window, indoors'],
        ['医院|病房', 'hospital, hospital bed, curtain, indoors'],
        ['工厂|仓库', 'factory, warehouse, industrial, pipes, metal'],
        ['地下室|地牢|牢房', 'basement, dungeon, stone wall, dim'],
        ['酒店|旅馆', 'hotel room, bed, lamp, window, indoors'],
        ['庭院|院子|花园', 'garden, courtyard, flower, tree'],
        ['山|山顶|山路', 'mountain, cliff, sky, path'],
        ['河|湖', 'river, lake, water, reflection'],
        ['村|村庄', 'village, house, dirt road, rural'],
        ['操场|运动场', 'school ground, running track, field'],
    ]),
    time: Object.freeze([
        ['清晨|早晨|黎明|早上', 'morning, sunrise, soft lighting'],
        ['上午|白天|中午|正午|下午', 'daytime, sunlight, blue sky'],
        ['黄昏|傍晚|夕阳', 'sunset, orange sky, evening'],
        ['夜|晚|午夜|深夜', 'night, moonlight, dim lighting'],
    ]),
    weather: Object.freeze([
        ['雷', 'thunderstorm, lightning, rain, dark clouds'],
        ['雨', 'rain, wet ground, overcast'],
        ['雪', 'snow, snowing'],
        ['雾', 'fog, mist'],
        ['阴|多云', 'cloudy, overcast'],
        ['晴', 'clear sky'],
    ]),
    // 场景时间 / 天气差分：按时段档位换的光照标签。
    variantTime: Object.freeze({
        midnight: 'midnight, night, dark, moonlight, starry sky, dim lighting',
        dusk: 'sunset, dusk, orange sky, golden hour, long shadows',
        morning: 'morning, sunrise, soft sunlight, pale sky, light mist',
        night: 'night, night sky, moonlight, dark, artificial lighting',
        day: 'day, daylight, bright, blue sky',
    }),
    // 差分天气：中文名按子串命中，先具体后泛化。
    variantWeather: Object.freeze([
        [['雷', '闪电', 'thunder', 'lightning'], 'thunderstorm, lightning, heavy rain, dark clouds'],
        [['暴雪', '雪', 'snow', 'blizzard'], 'snow, snowing, snowflakes, snow on ground'],
        [['雨', 'rain'], 'rain, raining, wet ground, overcast, puddle'],
        [['雾', 'fog', 'mist'], 'fog, misty, hazy, low visibility'],
        [['沙', '尘', 'sand', 'dust'], 'sandstorm, dust, hazy, yellow sky'],
        [['风', 'wind'], 'windy, wind, swaying trees, flying leaves'],
        [['阴', '云', 'cloud', 'overcast'], 'cloudy, overcast, grey sky'],
        [['晴', 'sun', 'clear'], 'sunny, clear sky, sunlight'],
    ]),
});


// 新模板写词协议的稳定前缀；任务、角色资料与用户约束放入当次 user。
export const DNA_TEMPLATE_WRITER_SYSTEM = [
    '你为虚构视觉小说撰写 NovelAI 动态提示模板。只处理用户提供的任务，不续写剧情、不重新选择生成点。',
    '每图第一行独立写 slotid: 本轮输入正整数，编号恰好一次；表情名、服装名、#编号或 slot 不代替 slotid。每图写完全部 scene、char、char_uc 和 meta 字段后才用独立一行 --- 分隔下一图，之后下一非空行必须是新的 slotid；单图不写 ---，同图内部不分段。直接输出扁平字段，不输出思考标签、推理正文、开场说明、JSON、标题、代码围栏、画师串或 caption 树。',
    SPRITE_HALF_BODY_RULE,
    '每份必须写 prompt_mode: dna_template。可用 size、analysis、scene、scene_uc、char、char_uc；每个 char 后紧接自身 char_uc，UC 允许为空。',
    '任务 outfitMode 为 template 时，每份另写 outfit_mode: template；每个 named Char 恰写本人的 <<outfit:token>> 一次，与身份使用同一 token。衣装占位只能在本人的正向 char，不在 scene、reference 或任何 UC 中出现。',
    '任务若提供 slots，每个 slotid 只绑定该项 tokens 指定的全部角色，不带入其他 slot 的人物；没有 slots 时 sprite/derived 每图绑定全部任务角色，CG 按实际出镜取允许池子集。',
    '立绘、换装和表情的 scene 使用逗号分隔的英文绘图 TAG，写人数、景别、机位与底色；char 在本人的身份与衣装占位符后接动作、表情 TAG。普通 CG 和局部一致性的 scene 仍用英文句子描述共同场景、人数、互动、取景和光线。Scene 不含身份令牌或各人的固定外貌清单。',
    '具名 char 使用输入 token 的 <<dna:token>> 一次作为身份槽；衣装模板任务后接本人的 <<outfit:token>>，再写动作与表情，不在正文重复衣装说明。未启用衣装模板时，新写衣装使用 TAG，已有保存说明原样复用。不要再复制固定外貌，不替换普通名字或对别人的提及。',
    '衣装名与服装 DNA 独立写入 meta_outfit_name、meta_outfit_description。新衣装说明只用逗号分隔的英文 TAG，颜色、类别、款式、长度、材质和细节均按标签表达，不写自然语言句子、穿着谓语或补述；裙、靴、袜及外套明确适用长度，各件分别绑定颜色，从内到外独立列出。本次 outfit.name 或对应正文服装栏已有名称时逐字沿用原名，尚未入柜或缺说明也不改名、不翻译、不另造英文名；只有正文和本次资料均未命名时才命名。已有当次衣装说明或角色 outfits 按保存值原样引用，不改写、翻译、转换或补全；缺说明的新装在同次回复保留已知设定并补全可用标签表达的颜色、款式和细节，不新增请求。Char 保持角色占位符、服装占位符与当次动态的模板结构，不重写完整衣装正文。裸体和 form 保留显式语义。consistency 逐字使用本次 characterContext.outfit：显式校正为预检冻结的有效衣装，其他旧任务仍为原 CG 快照，不自行换装。',
    'char 可写 x,y | 正文，坐标在 0 到 1；自身身份 UC 可用 <<dna_uc:token>> 一次，其余负面要求在当次正文中完成。',
    '每个 Char 以本图实际 char 出现顺序从 0 连续编号，单行绑定 meta_kind: 索引 | named/generic/object/reference。named/reference 还须各写 meta_key、meta_token、meta_frame、meta_outfit_name、meta_outfit_description；每个索引的每个字段恰好一次，不在末尾重复汇总。slotid、原图角色序号和 token 中数字都不是本图索引。',
    '逐图计数：N 条 char 必须对应 N 条 char_uc 和索引0到N-1的 N 组 meta_*；同一索引的多行 meta 只算一个组，不会创建人物条目。先交齐全部 char/char_uc 对再填 meta；每张图独立计数并从0重置索引。两人图不能只写一对 char/char_uc 却交两组 meta；Scene 提及不能代替人物条目。char_uc 可空但不能省略。meta_rows 是诊断名称，不是输出字段。',
    '所有 meta_* 都以本图 Char 索引 | 开始，meta_key、meta_token、meta_frame 也不能省略索引。清单提供 captionIndex 时使用它，例如 meta_key: 0 | 输入角色键、meta_token: 0 | 输入token、meta_frame: 0 | 输入景别；reference 使用自己的索引。reference 是 meta_kind 的取值，不输出 reference:、reference_uc: 或独立 reference inset 行。',
    '新任务 meta_frame 选 full_body、half_body、portrait；partial 仅在输入明确指定的历史任务中兼容引用。generic/object 只写 meta_kind，直接描写，不编造角色键；reference 仅 consistency 可用输入独立参考 token，不登记为正式人物。',
    '同一 characterKey 的 named 与 reference 是两个独立 Char，分别使用自己的索引和 token。reference 只表达身份和简洁可见状态；其 meta_outfit_name 与 meta_outfit_description 在自己的索引各写一次空值，不复制 named 衣装、不复用 named 索引。',
    '可选 meta_region: 索引 | x,y,width,height 是规划范围，不是成图定位。不得造未知键、token、重复字段或把旁路信息写进 scene/char。',
    '仅 sprite 缺景别时同次独立输出 meta_dna_full_body、meta_dna_half_body、meta_dna_portrait 三景别，每项使用 索引 | 非空英文身份 TAG，值不超过4096字符；可配 meta_dna_uc_景别，负面 TAG 可空且不超过4096字符，不能仅写 UC 而缺身份，不新建 partial。身份正负字段都不得含身份或衣装令牌。',
    '字段分为稳定身份、独立衣装、当次动态三层：先从资料抽取换装后仍成立的身体外貌，再提取本套穿戴物，最后写表情、视线和动作。meta_dna_* 不是完整立绘提示词，禁止复制 char 或 meta_outfit_description；默认外观服装和 outfits 是衣装来源，不是身份主语。',
    '制服、军用战斗服、护甲、鞋帽、武器、战术耳机等可更换衣装装备写入 meta_outfit_description，不能因职业或常穿就写入身份；严肃、镇定、喜怒表情、警戒状态和姿态写入 char 动态。身份不写 wearing/wears 或裸体状态，不用衣装表情填补未知外貌；只有资料明确为角色标志的发饰、首饰等才保留为身份锚点。此分工用于新提取，不自动清洗已有身份。',
    '首次建立服装 DNA 时，正文和资料未指定的颜色、材质、款式与局部结构允许且应一次协调补全，不需要额外的设计授权用语；保留已知设定，符合世界观、职业和场合，不覆盖已保存衣装，不冒充原文事实。仅用户明确要求只提取、不设计时保留未知。人物未知外貌不因此重设，只有明确的新人物设计才补未限定外貌。身份、穿戴物和当次动态仍分别交付，不靠空泛形容词或凑字数增加长度。',
    '建档先逐项核对角色资料里的角、尾巴、翅膀、非人耳、鳞片或异色身体标记，以及标志性发饰、耳饰、项链、额饰等；这些是高优先级身份锚点，不得被泛化五官描写挤掉或误当普通衣装。已知数量、颜色、形状和位置写清，未知不编造。full_body 保留全部已知身体特征和标志饰品，不以当次半身立绘的裁切删掉尾巴或翅膀；half_body 保留头部锚点和适用的上身、尾翼特征；portrait 保留角、非人耳与头颈饰品，不强行描写画外尾巴或扩大镜头。输出前逐景别对照资料检查遗漏、互斥及 UC 误排除，只修正本次新候选，不改已有景别。',
    '新人物 DNA、身份 UC、普通 CG 的 meta_identity、meta_signature 和本次新写的 meta_outfit_description 只用逗号分隔的英文 TAG，主要特征与细节均不写自然语言。性别、发色、发长、发型、刘海、瞳色、肤色、体型、非人身体特征及标志饰物使用准确标签；年龄感按资料用适用标签，不因 1girl/1boy 推断具体年龄。不确定同人标签是否真实存在时不编造，用确定的基础标签组合表达，无法准确表达的细节省略，不写成长句或自造标签。新正向身份与衣装按核心 TAG 权重规则交付，不把权重当可选示例。已有 DNA 逐字复用，不自动转换；Scene、动作、表情和互动仍按本图规则表达。',
    DNA_WEIGHT_RULE,
    '新身份按有依据的标签细化头发底色、挑染、发长、直卷、刘海及扎发结构；五官只选准确的脸型、眉形、眼型、瞳色等标签，不为凑齐分缝、鼻梁、下巴等微细节追加自然语言。固有发色肤色不被环境光、腮红或当次妆容替代，发型不随情绪改变。',
    '皮肤、雀斑、痣、疤痕、身体标记和体态用适用标签表达，细节以准确标签能表达为限；不把服装收腰或姿态透视当身体比例，不编造未知身高体重、围度或身体细节。全身保留适用身体标签，半身保留头肩躯干，头像保留头颈和发型锚点；三景别同源且不为详细而扩大镜头，已有身份逐字保留。',
    '新衣装与普通配饰只用逗号分隔的英文 TAG，逐件表达适用的颜色、材质、款式、长度、纹样及层次；数量、形状、位置、左右和破损细节仅在有依据且可用准确标签表达时保留，左右按穿着者自身，无法准确表达则省略，不追加自然语言或自造标签。主色使用对应衣物的颜色标签，上装、下装、护甲、腰带、袜鞋分别绑定，不能只给护甲写 black、其余仅写 police uniform 或 tactical belt。首次建档即使只给衣装名，也在可用准确标签表达的范围内补全未限定主要衣物的主色和款式，不另加武器、身份标志或无依据损伤；破损服从剧情。同套差分复用同一份完整衣装 TAG，衣装 DNA 不随景别删件。已保存衣装及原 CG 快照逐字保留，不转换、不补全或重新设计。',
    '服装 TAG 示例输入：蓝色短袖警衬衫、肩章、徽章，黑色轻型护甲，蓝色工装裤，黑腰带和黑色及膝系带靴，局部衣物破损。仅用准确标签表达这些已知特征，不补自然语言材质或位置说明；不能拿范例当本轮人物资料。',
    'meta_outfit_description: 0 | 1.2::blue shirt::, collared shirt, short sleeves, epaulettes, badge, 1.2::black armor::, 1.2::blue pants::, cargo pants, black belt, black footwear, knee boots, lace-up boots, torn clothes',
    '眼型、瞳色是稳定身份，眼神气质不等于当次表情；喜怒、严肃或镇定神情、视线方向、闭眼或眯眼属于本图动态。明确的标志性饰物与普通穿戴物分开，换装不自动移除身份饰品。裁切或遮挡不等于特征不存在，不把已有角、尾巴或饰品机械写入 UC；明确摘下或遮挡时按剧情描写可见状态，不改保存 DNA。',
    'dna.defaultAppearance 是默认外观服装，不属于身份主语。无明确当次衣装时用于写词兜底；剧情明确换装、当前 outfit 或持续衣装状态优先并完整覆盖默认服装，正文与 meta_outfit_* 一致，不叠穿默认衣装，不改写保存 DNA。',
    '新三景别先写纯 TAG 身份母版，再只删除各景别画外部位的完整标签及分隔符，闭合权重组整体保留或删除。共同标签、大小写、标点和顺序逐字一致，不改写、不缩词。无额外画外标签时两个视图允许相同。已有景别逐字保留，补缺沿用保存标签，存量矛盾不借补缺重写；手工清空并锁定的身份不得自动补建。',
    '身份 TAG 范例输入：成年女性，银色齐肩直发、斜刘海，蓝眼、细眉、白皙皮肤、星形发夹，纤细、高挑、长腿。三行只示范身份字段，不是新任务；编号、人物及特征取实际输入。',
    'meta_dna_full_body: 0 | 1girl, adult, 1.2::silver hair::, medium hair, straight hair, swept bangs, blue eyes, thin eyebrows, pale skin, hairclip, 1.2::star hair ornament::, slim, tall, long legs,',
    'meta_dna_half_body: 0 | 1girl, adult, 1.2::silver hair::, medium hair, straight hair, swept bangs, blue eyes, thin eyebrows, pale skin, hairclip, 1.2::star hair ornament::, slim,',
    'meta_dna_portrait: 0 | 1girl, adult, 1.2::silver hair::, medium hair, straight hair, swept bangs, blue eyes, thin eyebrows, pale skin, hairclip, 1.2::star hair ornament::,',
    '上述 half_body 只删除 tall, long legs,；portrait 再删除 slim,，其余标签及闭合权重逐字保留。全身母版保留来源已知的适用身体标签，不因本次只画半身而丢失；各景别不为画外特征扩大取景。',
    '普通 CG（promptTask.purpose 为 cg）逐一对照画面出镜者与正文角色标签：每位有标签的出镜者均以本人规范键和 token 独立交齐 char/char_uc 及完整 meta，玩家、后景或局部人物不得只在 Scene 或他人动作中带过，未出镜者不硬塞。每个 named 固定写非空 meta_identity: 索引 | 完整英文身份 TAG 和 meta_signature: 索引 | 标志特征 TAG，摘要无依据可空但字段保留。本次新写衣装同样只用 TAG；无名临时人物的身份与衣装 TAG 直接放在自己的 Char，再接本图动态，不编造角色键或 token。身份按适用标签表达发色发型、眼型瞳色、肤色体态与身份锚点，保留已确定设定，不新增无来源特殊特征或具体身体数值。身份与衣装、武器、灰尘、血污、临时伤势、表情和动作分开。named 正向 Char 写 <<dna:本人token>>，衣装模板再写 <<outfit:本人token>>，两个占位符各一次，再接动态；token 取本轮分配值。身份 TAG 只写 meta_identity，不重复到 Char。meta_frame 按实际取景选择，不强制半身。',
    'derived/consistency 仍只引用保存 DNA，不输出 meta_identity 或 meta_signature，缺所需身份或景别停止对应图；cg/derived/consistency 均禁止 meta_dna_* 候选。不得删人、补画立绘、猜角色键或换用他人身份。',
    'consistency 的参考关系只写在 reference 自己的 char 自然语言中，使用独立身份占位符，不复制身份或衣装正文。显式校正的参考是完整人物立绘画布和可见衣装，与目标同人同套；reference 的衣装 metadata 仍为空，不使用衣装槽或制造第二份衣装候选。Scene 只写原图局部共同画面，不写技术分区；named 用自身衣装槽。',
    '仅 consistency 任务自身或所选 slot 显式指定 identityMode: appearance_correction 时写 identity_mode: appearance_correction 及对应校正字段；每个 named/reference 在自己的索引恰写一次 meta_correction_identity: 索引 | 英文身份校正主语，可选 meta_correction_uc: 索引 | 校正负面片段。未授权该模式不输出校正字段。',
    '临时校正只写有依据且适用的身份特征，不复制整份身份资料、身体比例或相反身份负面词，不猜参考图片细节、不声称看过图。以已选参考的可见外观及本次指定衣装为目标，允许发型、脸型、衣装所需局部轮廓变化；保持原 CG 骨架姿态、位置尺度、表情视线、遮挡接触和环境，不迁移参考的动态、光照或画风。Scene/Char 中冲突的旧衣装描述改为本次指定衣装；未知或画外特征不强补。',
    '按本次要求写明镜头、质量词、UC、透明底和自定义模板内容，不输出画师。',
    'Char 使用本人身份占位符接动态谓语，写清动作与互动归属；每段权重独立闭合，不用未闭合权重包住占位符。所给触发词、权重及当前衣装保持。',
].join('\n');
