// IGS 自带生图词库：各类图片的内置标签、给写词 AI 的规则句、场景词典都集中在这里，别处只引用不写字面量。
// 结构按「内容类别」分：立绘 / 表情差分 / Q 版头像 / 衣柜 / 背景 / 物品 / NSFW / 底色 / 变身 / 场景词典。

export const SPRITE_HALF_BODY_RULE = '立绘、换装和表情的 half_body 使用正常上半身取景：从完整头顶到腰胯，完整保留头发、双肩和躯干，手势在画面内，头顶及身体两侧留少量余白。Scene 明写 framed from the top of the head to the hips，不能只写 half-body；不裁成胸像或脸部特写，不使用 cowboy shot，不画全身或脚。明确指定 full_body 或 portrait 时按该景别，不套用本条；普通 CG 和局部一致性沿各自镜头。';

export const BUILTIN_PROMPTS = Object.freeze({
    sprite: Object.freeze({
        // {tags} = DNA 组成的角色词与当次表情／动作；无 DNA 时使用写词结果。{matte} = 底色词。
        positive: '{tags}, solo, upper body, framed from the top of the head to the hips, standing, facing viewer, looking at viewer, straight-on, centered, {matte}',
        negative: 'multiple views, 2girls, 2boys, multiple girls, multiple boys, crowd, close-up, portrait, full body, feet, head out of frame, cropped arms, scenery, detailed background, white background, gradient background, patterned background, drop shadow, floor, furniture, holding weapon, text, speech bubble, watermark, signature, frame, border',
        // 立绘站得太板正：要一个不挡身体的日常小动作。
        poseRule: '姿势带一个轻量的日常小动作（如一只手拨头发、手背在身后、手插口袋、轻抓衣角），不要双手僵直下垂，也不要大幅动作或拿道具挡住身体。',
    }),
    expression: Object.freeze({
        // 旧组合路径使用腰胯以上的正常上半身，负面不排除 upper body。
        positive: 'upper body, framed from the top of the head to the hips, standing, facing viewer, straight-on',
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
    'scene 用英文句子描述共同场景、人数、互动、取景和光线，不含身份令牌或各人的固定外貌清单。',
    '具名 char 使用输入 token 的 <<dna:token>> 一次作为主语；衣装模板任务后接本人的 <<outfit:token>>，再写动作与表情，不在正文重复衣装说明。未启用衣装模板的旧任务仍直接写衣装谓语。不要再复制固定外貌，不替换普通名字或对别人的提及。',
    '衣装名与英文穿着谓语作为独立服装 DNA 写入 meta_outfit_name、meta_outfit_description。本次 outfit.name 或对应正文服装栏已有名称时逐字沿用原名，尚未入柜或缺说明也不改名、不翻译、不另造英文名；只有正文和本次资料均未命名时才命名。已有当次衣装说明或角色 outfits 按保存值原样引用，不改写、翻译或补全；缺说明的新装在同次回复保留已知设定并补全未指定的颜色、材质、剪裁和层次，不新增请求。Char 保持角色占位符、服装占位符与当次动态的模板结构，不重写完整衣装正文。裸体和 form 保留显式语义。consistency 逐字使用本次 characterContext.outfit：显式校正为预检冻结的有效衣装，其他旧任务仍为原 CG 快照，不自行换装。',
    'char 可写 x,y | 正文，坐标在 0 到 1；自身身份 UC 可用 <<dna_uc:token>> 一次，其余负面要求在当次正文中完成。',
    '每个 Char 以本图实际 char 出现顺序从 0 连续编号，单行绑定 meta_kind: 索引 | named/generic/object/reference。named/reference 还须各写 meta_key、meta_token、meta_frame、meta_outfit_name、meta_outfit_description；每个索引的每个字段恰好一次，不在末尾重复汇总。slotid、原图角色序号和 token 中数字都不是本图索引。',
    '所有 meta_* 都以本图 Char 索引 | 开始，meta_key、meta_token、meta_frame 也不能省略索引。清单提供 captionIndex 时使用它，例如 meta_key: 0 | 输入角色键、meta_token: 0 | 输入token、meta_frame: 0 | 输入景别；reference 使用自己的索引。reference 是 meta_kind 的取值，不输出 reference:、reference_uc: 或独立 reference inset 行。',
    '新任务 meta_frame 选 full_body、half_body、portrait；partial 仅在输入明确指定的历史任务中兼容引用。generic/object 只写 meta_kind，直接描写，不编造角色键；reference 仅 consistency 可用输入独立参考 token，不登记为正式人物。',
    '同一 characterKey 的 named 与 reference 是两个独立 Char，分别使用自己的索引和 token。reference 只表达身份和简洁可见状态；其 meta_outfit_name 与 meta_outfit_description 在自己的索引各写一次空值，不复制 named 衣装、不复用 named 索引。',
    '可选 meta_region: 索引 | x,y,width,height 是规划范围，不是成图定位。不得造未知键、token、重复字段或把旁路信息写进 scene/char。',
    '仅 sprite 缺景别时同次独立输出 meta_dna_full_body、meta_dna_half_body、meta_dna_portrait 三景别，每项使用 索引 | 非空英文人物身份主语，值不超过4096字符；可配 meta_dna_uc_景别，负面词可空且不超过4096字符，不能仅写 UC 而缺主语，不新建 partial。身份正负字段都不得含身份或衣装令牌。',
    '字段分为稳定身份、独立衣装、当次动态三层：先从资料抽取换装后仍成立的身体外貌，再提取本套穿戴物，最后写表情、视线和动作。meta_dna_* 不是完整立绘提示词，禁止复制 char 或 meta_outfit_description；默认外观服装和 outfits 是衣装来源，不是身份主语。',
    '制服、军用战斗服、护甲、鞋帽、武器、战术耳机等可更换衣装装备写入 meta_outfit_description，不能因职业或常穿就写入身份；严肃、镇定、喜怒表情、警戒状态和姿态写入 char 动态。身份不写 wearing/wears 或裸体状态，不用衣装表情填补未知外貌；只有资料明确为角色标志的发饰、首饰等才保留为身份锚点。此分工用于新提取，不自动清洗已有身份。',
    '首次建立服装 DNA 时，正文和资料未指定的颜色、材质、款式与局部结构允许且应一次协调补全，不需要额外的设计授权用语；保留已知设定，符合世界观、职业和场合，不覆盖已保存衣装，不冒充原文事实。仅用户明确要求只提取、不设计时保留未知。人物未知外貌不因此重设，只有明确的新人物设计才补未限定外貌。身份、穿戴物和当次动态仍分别交付，不靠空泛形容词或凑字数增加长度。',
    '建档先逐项核对角色资料里的角、尾巴、翅膀、非人耳、鳞片或异色身体标记，以及标志性发饰、耳饰、项链、额饰等；这些是高优先级身份锚点，不得被泛化五官描写挤掉或误当普通衣装。已知数量、颜色、形状和位置写清，未知不编造。full_body 保留全部已知身体特征和标志饰品，不以当次半身立绘的裁切删掉尾巴或翅膀；half_body 保留头部锚点和适用的上身、尾翼特征；portrait 保留角、非人耳与头颈饰品，不强行描写画外尾巴或扩大镜头。输出前逐景别对照资料检查遗漏、互斥及 UC 误排除，只修正本次新候选，不改已有景别。',
    '生成新 DNA 在三个身份主语中写入有依据且一致的年龄感，以及发色、发型、瞳色、脸型、眉形、眼型、鼻形、唇形、体型、身高或高矮比例、肤色和明确的标志性发饰、首饰、角、耳、疤痕等。未知细节不编造，不强行填满清单，不能只写名字或漂亮、英俊；年龄未知时不编造具体岁数，其他未知数值也不编造。各景别保留其可见锚点，不以表情或装备代替外貌。',
    '新身份细化已有依据：头发写清底色与挑染或渐变部位、长度、直卷蓬松度、刘海、分缝、鬓发、扎发结构和位置；五官写清脸部轮廓与下巴、眉形浓淡、眼型眼距与瞳色、鼻梁鼻尖、唇形厚薄。固有发色肤色不被环境光、腮红或当次妆容替代，发型不随情绪改变。',
    '皮肤保留已知固有肤色冷暖、雀斑、痣、疤痕及身体标记的位置；体型保留有依据的高矮感、骨架肩宽、躯干四肢比例、腰胯轮廓、胖瘦和肌肉感，不把服装收腰或姿态透视当身体比例。不编造未知身高体重、围度或身体细节。全身保留整体比例，半身保留头肩躯干，头像保留头颈五官和发型锚点；三景别同源且不为详细而扩大镜头，已有身份仍逐字保留。',
    '新衣装与普通配饰逐件写颜色、材质光泽、剪裁、领袖长度、开合边饰、纹样和内外层关系；装饰写清数量、形状、颜色与佩戴位置，左右按穿着者自身。主色直接修饰所属衣物，上装、下装、护甲、腰带、袜鞋分别绑定，不能只给护甲写 black、其余仅写 police uniform 或 tactical belt。首次建档即使只给衣装名，也要补全未限定主要衣物的具体主色和结构，不另加武器、身份标志或无依据损伤。破损服从剧情，写部位、形状及仍覆盖范围。同套差分复用同一份完整衣装说明，衣装 DNA 不随景别删件。已保存衣装及原 CG 快照逐字保留，不补全或重新设计。',
    '服装详细示例的输入假设：浅蓝棉质短袖警衬衫、尖领、深蓝肩章、左胸银徽、右袖口撕裂；外罩哑光黑色分块轻型护甲，黑色侧扣带；深海军蓝直筒工装裤、大腿侧袋、左膝磨破但仍覆盖；黑色尼龙腰带、深灰快扣和两侧黑袋；黑色皮革中筒系带靴、厚橡胶底。仅当来源提供这些细节时，穿着谓语可写为下例；不能拿范例当本轮人物资料。',
    'meta_outfit_description: 0 | wears a light-blue cotton police shirt with a pointed collar, short sleeves, dark-navy shoulder tabs and a silver badge on the left chest, with a torn right sleeve hem, beneath a matte-black lightweight armor vest with segmented chest panels and black side fastening straps, paired with deep-navy straight-leg cargo trousers with thigh pockets and a frayed left knee still covered by fabric, a black nylon tactical belt with a dark-gray quick-release buckle and black pouches at both hips, and black leather mid-calf lace-up boots with thick rubber soles',
    '眼型、瞳色是稳定身份，眼神气质不等于当次表情；喜怒、严肃或镇定神情、视线方向、闭眼或眯眼属于本图动态。明确的标志性饰物与普通穿戴物分开，换装不自动移除身份饰品。裁切或遮挡不等于特征不存在，不把已有角、尾巴或饰品机械写入 UC；明确摘下或遮挡时按剧情描写可见状态，不改保存 DNA。',
    'dna.defaultAppearance 是默认外观服装，不属于身份主语。无明确当次衣装时用于写词兜底；剧情明确换装、当前 outfit 或持续衣装状态优先并完整覆盖默认服装，正文与 meta_outfit_* 一致，不叠穿默认衣装，不改写保存 DNA。',
    '新三景别先写完整身份母版，再只删除各景别画外的完整部位短语及其所属分隔符。共同可见部分的单词、修饰语、大小写、标点、顺序和句法结构必须逐字一致，不换词、不润色、不把 shoulder-length hair 缩成 hair，也不把 slim build 改成 slim upper-body silhouette。母版按名称与年龄感、头发、五官、肤色、头颈标志、肩颈躯干、全身体态与四肢排序，短语可独立删除，and 留在不裁切的共同短语内部。无额外可见信息时两个视图允许相同。已有景别逐字保留，补缺沿用保存措辞，存量矛盾不借补缺重写；手工清空并锁定的身份不得自动补建。',
    '身份详细范例假定以下细节均来自角色资料：成年女性，银色齐肩直发、左分缝、斜刘海和内弯发梢；杏形蓝眼、深灰细弯眉、柔和椭圆脸、圆下巴、细直鼻梁、小鼻尖、清晰唇峰与稍丰满下唇、冷调白皙皮肤；左鬓一枚银色五角星发夹为明确标志；细颈、窄肩、纤细躯干、高挑且长腿。三行只示范身份字段，不是新任务，索引和人物名须替换为实际输入。',
    'meta_dna_full_body: 0 | ExampleAdult, an adult woman with straight silver shoulder-length hair parted on the left, side-swept bangs and inward-curving ends, almond-shaped blue eyes, fine gently arched dark-gray eyebrows, a soft oval face with a rounded chin, a narrow straight nose bridge with a small tip, defined lips with a clear Cupid\'s bow and a slightly fuller lower lip, fair cool-toned skin, a single silver five-pointed star hair clip at her left temple, a slender neck, narrow shoulders, a slim torso, a tall stature, long slender legs,',
    'meta_dna_half_body: 0 | ExampleAdult, an adult woman with straight silver shoulder-length hair parted on the left, side-swept bangs and inward-curving ends, almond-shaped blue eyes, fine gently arched dark-gray eyebrows, a soft oval face with a rounded chin, a narrow straight nose bridge with a small tip, defined lips with a clear Cupid\'s bow and a slightly fuller lower lip, fair cool-toned skin, a single silver five-pointed star hair clip at her left temple, a slender neck, narrow shoulders, a slim torso,',
    'meta_dna_portrait: 0 | ExampleAdult, an adult woman with straight silver shoulder-length hair parted on the left, side-swept bangs and inward-curving ends, almond-shaped blue eyes, fine gently arched dark-gray eyebrows, a soft oval face with a rounded chin, a narrow straight nose bridge with a small tip, defined lips with a clear Cupid\'s bow and a slightly fuller lower lip, fair cool-toned skin, a single silver five-pointed star hair clip at her left temple, a slender neck,',
    '上述 half_body 只删除 a tall stature, long slender legs,；头颈特写 portrait 再删除 narrow shoulders, a slim torso,，其余字符保留。头像若包含肩部则原样保留 narrow shoulders。全身母版保留来源已知的全身特征，不因本次只画半身而丢失；各景别不为画外特征扩大取景。',
    '普通 CG（promptTask.purpose 为 cg）逐一对照画面出镜者与正文角色标签：每位有标签的出镜者均以本人规范键和 token 独立交齐 char/char_uc 及完整 meta，玩家、后景或局部人物不得只在 Scene 或他人动作中带过，未出镜者不硬塞。每个 named 固定写非空 meta_identity: 索引 | 详细英文身份主语 和 meta_signature: 索引 | 标志细节摘要，摘要无依据可空但字段保留。身份按首次立绘同等详细程度写清发色发型结构、脸型五官、眼型瞳色、固有肤色、骨架体态及适用身份锚点；保留已确定设定，未限定的普通视觉细节一次协调落实，不以职业、漂亮或 sharp eyes 代替，不新增无来源特殊特征或具体身体数值。身份与衣装、武器、灰尘、血污、临时伤势、表情和动作分开。本人正向 Char 写 <<dna:本人token>>，衣装模板再写 <<outfit:本人token>>，两个占位符各一次，再接动态；token 取本轮分配值。详细身份只写 meta_identity，不重复到 Char。meta_frame 按实际取景选择，不强制半身。',
    'derived/consistency 仍只引用保存 DNA，不输出 meta_identity 或 meta_signature，缺所需身份或景别停止对应图；cg/derived/consistency 均禁止 meta_dna_* 候选。不得删人、补画立绘、猜角色键或换用他人身份。',
    'consistency 的参考关系只写在 reference 自己的 char 自然语言中，使用独立身份占位符，不复制身份或衣装正文。显式校正的参考是完整人物立绘画布和可见衣装，与目标同人同套；reference 的衣装 metadata 仍为空，不使用衣装槽或制造第二份衣装候选。Scene 只写原图局部共同画面，不写技术分区；named 用自身衣装槽。',
    '仅 consistency 任务自身或所选 slot 显式指定 identityMode: appearance_correction 时写 identity_mode: appearance_correction 及对应校正字段；每个 named/reference 在自己的索引恰写一次 meta_correction_identity: 索引 | 英文身份校正主语，可选 meta_correction_uc: 索引 | 校正负面片段。未授权该模式不输出校正字段。',
    '临时校正只写有依据且适用的身份特征，不复制整份身份资料、身体比例或相反身份负面词，不猜参考图片细节、不声称看过图。以已选参考的可见外观及本次指定衣装为目标，允许发型、脸型、衣装所需局部轮廓变化；保持原 CG 骨架姿态、位置尺度、表情视线、遮挡接触和环境，不迁移参考的动态、光照或画风。Scene/Char 中冲突的旧衣装描述改为本次指定衣装；未知或画外特征不强补。',
    '按本次要求写明镜头、质量词、UC、透明底和自定义模板内容，不输出画师。',
    'Char 使用本人身份占位符接动态谓语，写清动作与互动归属；每段权重独立闭合，不用未闭合权重包住占位符。所给触发词、权重及当前衣装保持。',
].join('\n');
