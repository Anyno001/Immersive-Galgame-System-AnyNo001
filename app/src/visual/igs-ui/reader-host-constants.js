import { DIALOG_FONT_CAVEAT, DIALOG_FONT_CHILL_ROUND, DIALOG_FONT_CINZEL, DIALOG_FONT_CORMORANT, DIALOG_FONT_GREAT_VIBES, DIALOG_FONT_HUIWEN, DIALOG_FONT_IM_FELL, DIALOG_FONT_MASHANZHENG, DIALOG_FONT_NEO_XIHEI, DIALOG_FONT_NEO_ZHISONG, DIALOG_FONT_PINYON_SCRIPT, DIALOG_FONT_QUICKSAND, DIALOG_FONT_ROUNDED, DIALOG_FONT_SERIF, DIALOG_FONT_SMILEY, DIALOG_FONT_SOURCE_HAN_SANS, DIALOG_FONT_WENKAI, DIALOG_FONT_WENKAI_LITE, DIALOG_FONT_YOZAI, DIALOG_FONT_YUYANG, DIALOG_FONT_ZCOOL_KUAILE } from './dialog-theme-typography.js';

export const DEFAULT_IMAGE_API = Object.freeze({
    mode: 'extension',
    externalAdapter: 'auto',
    endpoint: '',
    transport: 'direct',
    apiKey: '',
    model: '',
    size: '832x1216',
    steps: 28,
    sampler: 'k_euler_ancestral',
    requestTimeoutMs: 30000,
    pollIntervalMs: 2000,
    pollAttempts: 60,
    dbgenSpriteTransparent: true,
    naiSpriteTransparent: true,
    autoMatte: true,
    spriteMatteColor: 'auto',
    externalSpriteDna: false,
    worldInfoExclude: { books: [], entries: {} },
    cgModel: '',
    spriteModel: '',
    backgroundModel: '',
    itemModel: '',
    promptPrefix: '',
    availableModels: [],
    modelsFetchedAt: '',
});

export const VN_THEME_PRESETS = Object.freeze({
    genshin: Object.freeze({
        nameAlign: 'center',
        textAlign: 'left',
        narrationAlign: 'left',
        thoughtAlign: 'left',
        dividerSymbol: '───◇───',
        nameFont: 'inherit',
        textFont: 'inherit',
        thoughtFont: 'inherit',
        narrationFont: 'inherit',
        nameColor: '#ffeeb8',
        textColor: '#f4f4f6',
        thoughtColor: '#c8c8dc',
        narrationColor: '#f4f4f6',
        dividerColor: '#ffeeb8',
    }),
    honkai: Object.freeze({
        nameAlign: 'center',
        textAlign: 'left',
        narrationAlign: 'left',
        thoughtAlign: 'left',
        dividerSymbol: '──✦──',
        nameFont: 'inherit',
        textFont: 'inherit',
        thoughtFont: 'inherit',
        narrationFont: 'inherit',
        nameColor: '#c8e0ff',
        textColor: '#e8ecf4',
        thoughtColor: '#a0beff',
        narrationColor: '#e8ecf4',
        dividerColor: '#c8e0ff',
    }),
    minimal: Object.freeze({
        nameAlign: 'left',
        textAlign: 'left',
        narrationAlign: 'left',
        thoughtAlign: 'left',
        dividerSymbol: 'none',
        nameFont: 'inherit',
        textFont: 'inherit',
        thoughtFont: 'inherit',
        narrationFont: 'inherit',
        nameColor: '#b3b3b3',
        textColor: '#f4f4f6',
        thoughtColor: '#808080',
        narrationColor: '#f4f4f6',
        dividerColor: '#404040',
    }),
});

// 分类字体选项沿用原持久化值；主题默认字体也必须能从这里手动改回或替换。
export const DIALOG_FONT_OPTIONS = Object.freeze([
    ['inherit', '默认'],
    ['"KaiTi","STKaiti",serif', '楷体'],
    ['"SimHei",sans-serif', '黑体'],
    ['"FangSong","STFangsong",serif', '仿宋'],
    ['"Microsoft YaHei",sans-serif', '微软雅黑'],
    [DIALOG_FONT_ROUNDED, '有爱圆体'],
    [DIALOG_FONT_CHILL_ROUND, '寒蝉全圆体'],
    [DIALOG_FONT_WENKAI, '霞鹜文楷'],
    [DIALOG_FONT_WENKAI_LITE, '霞鹜文楷 Lite'],
    [DIALOG_FONT_NEO_ZHISONG, '霞鹜新致宋'],
    [DIALOG_FONT_NEO_XIHEI, '霞鹜新晰黑'],
    [DIALOG_FONT_SOURCE_HAN_SANS, '思源黑体'],
    [DIALOG_FONT_SERIF, '思源宋体'],
    [DIALOG_FONT_HUIWEN, '汇文明朝体'],
    [DIALOG_FONT_MASHANZHENG, '马善政楷书'],
    [DIALOG_FONT_YUYANG, '仓耳渔阳体'],
    [DIALOG_FONT_SMILEY, '得意黑'],
    [DIALOG_FONT_ZCOOL_KUAILE, '站酷快乐体'],
    [DIALOG_FONT_YOZAI, '悠哉字体'],
    [DIALOG_FONT_CINZEL, 'Cinzel'],
    [DIALOG_FONT_CORMORANT, 'Cormorant Garamond'],
    [DIALOG_FONT_GREAT_VIBES, 'Great Vibes'],
    [DIALOG_FONT_PINYON_SCRIPT, 'Pinyon Script'],
    [DIALOG_FONT_QUICKSAND, 'Quicksand'],
    [DIALOG_FONT_CAVEAT, 'Caveat'],
    [DIALOG_FONT_IM_FELL, 'IM Fell English'],
]);

export const READER_REQUIRED_SETTINGS_PATHS = Object.freeze([
    'readerSettings.fontSize',
    'readerSettings.dialogFontWeight',
    'readerSettings.dialogTextEffect',
    'readerSettings.dialogTextEffectColor',
    'readerSettings.dialogTextEffectStrength',
    'readerSettings.dialogTextEffectSize',
    'readerSettings.dialogSkin',
    'readerSettings.gradientVeil.color',
    'readerSettings.gradientVeil.heightPercent',
    'readerSettings.gradientVeil.opacity',
    'readerSettings.gradientVeil.speakerStyle',
    'readerSettings.xianxiaSpeaker',
    'readerSettings.classicDialogWidthPercent',
    'readerSettings.skinDialogScale',
    'readerSettings.magicHouse',
    'readerSettings.optionFontSize',
    'readerSettings.dialogWidth',
    'readerSettings.dialogHeight',
    'readerSettings.glassOpacity',
    'readerSettings.glassBackdropFilter',
    'readerSettings.imageCountOverride',
    'readerSettings.inputScale',
    'readerSettings.toolbarScale',
    'readerSettings.toolbarDock',
    'readerSettings.inputPlacement',
    'readerSettings.imgMode',
    'readerSettings.imgBrightness',
    'readerSettings.cgHoldPages',
    'readerSettings.showStatusLine',
    'readerSettings.dblclickCgOnly',
    'readerSettings.titleScreen',
    'readerSettings.resumePrompt',
    'readerSettings.dialogAutoHeight',
    'readerSettings.cinemaBars',
    'readerSettings.typewriter.enabled',
    'readerSettings.typewriter.speed',
    'readerSettings.typewriter.mode',
    'readerSettings.typewriter.sound.enabled',
    'readerSettings.typewriter.sound.volume',
    'readerSettings.typewriter.sound.dialogueVolume',
    'readerSettings.typewriter.sound.narrationVolume',
    'readerSettings.typewriter.sound.dialoguePreset',
    'readerSettings.typewriter.sound.thoughtPreset',
    'readerSettings.typewriter.sound.narrationPreset',
    'readerSettings.typewriter.sound.speakerPitch',
    'readerSettings.pinnedBtns',
    'readerSettings.hiddenBtns',
    'readerSettings.btnOrder',
    'readerSettings.toolbarSplit',
    'readerSettings.toolbarPlate',
    'readerSettings.dialogBarAlign',
    'readerSettings.dialogBarBtns',
    'readerSettings.spriteLayouts',
    'readerSettings.spriteDefaultScale',
    'readerSettings.spriteGenderScale.enabled',
    'readerSettings.spriteGenderScale.female',
    'readerSettings.spriteGenderScale.male',
    'readerSettings.spriteGenderScale.other',
    'readerSettings.spriteGenderScale.elderShorter',
    'readerSettings.spriteGenderScale.childShorter',
    'readerSettings.spriteDisplayScale',
    'readerSettings.spriteHeads',
    'readerSettings.vnTheme.preset',
    'readerSettings.classicVnTheme.preset',
]);

// 设置器外壳必有的节点：分类侧边栏（窄屏收成抽屉）、内容区、内容主体；子页条只在多页分类里出现，不列为必有。
export const SETTINGS_PANEL_REQUIRED_SELECTORS = Object.freeze([
    '#igs-unified-settings',
    '.igs-settings-shell',
    '.igs-settings-head',
    '.igs-settings-theme-switch',
    '.igs-settings-nav',
    '.igs-settings-content',
    '.igs-settings-body',
    '.igs-segmented',
    '.igs-source-filter',
    '.igs-settings-preview',
]);

const frozen = (list) => Object.freeze(list.slice());

// 按分类给出：requiredPaths 跟着项目搬到它现在所在的分类（存储路径本身不变）。
export const SETTINGS_PANEL_TAB_CONTRACT = Object.freeze({
    dash: Object.freeze({
        label: '仪表盘',
        requiredPaths: frozen(['bridge.settingsTheme']),
        requiredActions: frozen(['onboarding-start']),
    }),
    style: Object.freeze({
        label: '风格',
        requiredPaths: frozen([
            'readerSettings.dialogSkin',
            'readerSettings.gradientVeil.color',
            'readerSettings.gradientVeil.heightPercent',
            'readerSettings.gradientVeil.opacity',
            'readerSettings.gradientVeil.speakerStyle',
            'readerSettings.classicDialogWidthPercent',
            'readerSettings.skinDialogScale',
            'readerSettings.magicHouse',
            'readerSettings.dialogWidth',
            'readerSettings.dialogHeight',
            'readerSettings.glassOpacity',
            'readerSettings.glassBackdropFilter',
            'readerSettings.inputScale',
            'readerSettings.showStatusLine',
            'readerSettings.dblclickCgOnly',
            'readerSettings.titleScreen',
            'readerSettings.resumePrompt',
            'readerSettings.dialogAutoHeight',
        ]),
    }),
    text: Object.freeze({
        label: '文字',
        requiredPaths: frozen([
            'readerSettings.fontSize',
            'readerSettings.dialogFontWeight',
            'readerSettings.dialogTextEffect',
            'readerSettings.dialogTextEffectColor',
            'readerSettings.dialogTextEffectStrength',
            'readerSettings.dialogTextEffectSize',
            'readerSettings.vnTheme.preset',
            'readerSettings.classicVnTheme.preset',
        ]),
    }),
    ui: Object.freeze({
        label: '界面',
        requiredPaths: frozen([
            'bridge.openMode',
            'bridge.showToasts',
            'readerSettings.optionFontSize',
            'readerSettings.toolbarScale',
            'readerSettings.toolbarDock',
            'readerSettings.inputPlacement',
            'readerSettings.imgMode',
            'readerSettings.imgBrightness',
            'readerSettings.pinnedBtns',
            'readerSettings.hiddenBtns',
            'readerSettings.btnOrder',
            'readerSettings.toolbarSplit',
            'readerSettings.toolbarPlate',
            'readerSettings.dialogBarAlign',
            'readerSettings.dialogBarBtns',
        ]),
    }),
    perf: Object.freeze({
        label: '演出',
        requiredPaths: frozen([
            'bridge.sentencePaging',
            'bridge.dialogueSentencePaging',
            'readerSettings.cgHoldPages',
            'readerSettings.cinemaBars',
            'readerSettings.typewriter.enabled',
            'readerSettings.typewriter.speed',
            'readerSettings.typewriter.mode',
            'readerSettings.typewriter.sound.enabled',
            'readerSettings.typewriter.sound.volume',
            'readerSettings.typewriter.sound.dialogueVolume',
            'readerSettings.typewriter.sound.narrationVolume',
            'readerSettings.typewriter.sound.dialoguePreset',
            'readerSettings.typewriter.sound.thoughtPreset',
            'readerSettings.typewriter.sound.narrationPreset',
            'readerSettings.typewriter.sound.speakerPitch',
        ]),
        requiredActions: frozen(['perf-preset:']),
    }),
    sound: Object.freeze({
        label: '声音',
        requiredPaths: frozen(['readerSettings.voiceBark.enabled', 'readerSettings.tts.enabled']),
        requiredActions: frozen(['perf-preset:']),
    }),
    chars: Object.freeze({
        label: '角色',
        requiredPaths: frozen([
            'bridge.sceneAssets.enabled',
            'readerSettings.spriteLayouts',
            'readerSettings.spriteDefaultScale',
            'readerSettings.spriteGenderScale.enabled',
            'readerSettings.spriteGenderScale.female',
            'readerSettings.spriteGenderScale.male',
            'readerSettings.spriteGenderScale.other',
            'readerSettings.spriteGenderScale.elderShorter',
            'readerSettings.spriteGenderScale.childShorter',
            'readerSettings.spriteDisplayScale',
            'readerSettings.spriteHeads',
            'readerSettings.creatureDisplay.enabled',
            'readerSettings.creatureDisplay.giantFill',
            'readerSettings.creatureDisplay.small',
            'readerSettings.creatureDisplay.medium',
            'readerSettings.creatureDisplay.large',
            'bridge.autoIllustration.assets.creatureAutoProfile',
        ]),
    }),
    scenes: Object.freeze({
        label: '场景',
        requiredPaths: frozen([
            'bridge.sceneAssets.enabled',
            'bridge.autoIllustration.assets.strictMatch',
        ]),
    }),
    ai: Object.freeze({
        label: '生图与AI',
        requiredPaths: frozen([
            'bridge.imageApi.mode',
            'bridge.imageApi.externalAdapter',
            'bridge.imageApi.pollIntervalMs',
            'bridge.imageApi.pollAttempts',
            'bridge.imageApi.dbgenSpriteTransparent',
            'bridge.imageApi.naiSpriteTransparent',
            'bridge.imageApi.autoMatte',
            'bridge.imageApi.spriteMatteColor',
            'bridge.imageApi.externalSpriteDna',
            'bridge.imageApi.cgModel',
            'bridge.imageApi.spriteModel',
            'bridge.imageApi.backgroundModel',
            'bridge.imageApi.itemModel',
            'bridge.autoIllustration.nsfwEnabled',
            'bridge.autoIllustration.nsfwCount',
            'bridge.autoIllustration.interludeEnabled',
            'bridge.autoIllustration.interludeProbability',
            'bridge.autoIllustration.interludeMaxCount',
            'bridge.autoIllustration.backfillOldFloors',
            'bridge.autoIllustration.assets.spriteEnabled',
            'bridge.autoIllustration.assets.backgroundEnabled',
            'bridge.autoIllustration.assets.dayFirst',
            'bridge.autoIllustration.assets.maxPerFloor',
            'bridge.autoIllustration.assets.spriteSize',
            'bridge.itemImages.enabled',
            'bridge.itemImages.inventoryIcon',
            'bridge.autoIllustration.assets.backgroundSize',
            'bridge.autoIllustration.assets.templates.background',
            'bridge.autoIllustration.assets.templates.backgroundNegative',
            'bridge.autoIllustration.assets.templates.sprite',
            'bridge.autoIllustration.assets.templates.spriteNegative',
            'bridge.autoIllustration.assets.templates.nsfwExtra',
            'bridge.autoIllustration.llm.source',
            'bridge.autoIllustration.llm.endpoint',
            'bridge.autoIllustration.llm.apiKey',
            'bridge.autoIllustration.llm.model',
            'bridge.autoIllustration.llm.contextFloors',
            'bridge.autoIllustration.llm.jailbreakHead',
            'bridge.autoIllustration.llm.jailbreakTail',
            'bridge.autoIllustration.llm.includeHeaders',
            'bridge.autoIllustration.llm.includeBody',
            'bridge.autoIllustration.llm.excludeBody',
            'bridge.autoIllustration.nai.transport',
            'bridge.autoIllustration.nai.endpoint',
            'bridge.autoIllustration.nai.apiKey',
            'bridge.autoIllustration.nai.model',
            'bridge.autoIllustration.nai.size',
            'bridge.autoIllustration.nai.steps',
            'bridge.autoIllustration.nai.scale',
            'bridge.autoIllustration.nai.sampler',
            'bridge.autoIllustration.nai.artistPrefix',
            'bridge.autoIllustration.nai.negativePrompt',
            'bridge.sceneAssets.promptRule',
            'bridge.sceneAssets.promptRuleEnabled',
            'bridge.sourceFilter.enabled',
            'bridge.sourceFilter.textIncludeTags',
            'bridge.sourceFilter.textExcludeTags',
            'bridge.sourceFilter.imageIncludeTags',
            'bridge.sourceFilter.htmlCardTags',
            'bridge.virtualRegex.enabled',
            'bridge.virtualRegex.pattern',
            'bridge.virtualRegex.flags',
            'bridge.virtualRegex.replacement',
            'bridge.virtualRegex.rules',
            'readerSettings.imageCountOverride',
        ]),
        requiredActions: frozen([
            'fetch-llm-models',
            'fetch-nai-models',
            'test-image',
            'reset-virtual-regex',
            'test-virtual-regex',
            'add-virtual-regex',
            'remove-virtual-regex:',
            'reset-prompt-rule',
            'save-prompt-rule',
            'copy-prompt-rule',
        ]),
    }),
    data: Object.freeze({
        label: '数据',
        requiredPaths: frozen([
            'bridge.imageCache.maxCount',
            'bridge.imageCache.compressDisplay',
            'bridge.imageJobLog.retainDays',
            'bridge.imageJobLog.maxEntries',
        ]),
        requiredActions: frozen([
            'settings-export-all',
            'settings-import-all',
            'copy-page-diagnostic',
            'purge-asset-cache',
            'image-log-refresh',
            'image-log-copy',
            'image-log-clear',
        ]),
    }),
});

export const TOOLBAR_ACTIONS = Object.freeze([
    ['first-turn', '目录 / 续读'],
    ['prev-turn', '上一轮'],
    ['first-page', '第一页'],
    ['prev', '上一页'],
    ['next', '下一页'],
    ['last-page', '最后一页'],
    ['next-turn', '下一轮'],
    ['auto-play', '自动播放'],
    ['tts-replay', '重听这句'],
    ['tts-reroll', '重新生成这句'],
    ['quick-save', '快速存档'],
    ['quick-load', '快速读档'],
    ['regen', '绘制CG'],
    ['reroll-cg', '重画这张'],
    ['consistency-cg', '角色一致性重绘'],
    ['clear-cg', '清扫当前 CG'],
    ['clear-floor-cg', '清扫本楼'],
    ['generate-assets', '补全立绘与背景'],
    ['cg-gallery', 'CG库'],
    ['fill-item-images', '补全物品图'],
    ['save', '保存图片'],
    ['hide', '隐藏对话框'],
    ['sprite-edit', '调整立绘'],
    ['live2d-settings', 'Live2D 角色绑定'],
    ['mini-games', '小游戏'],
    ['rescan', '重新加载'],
    ['settings', '设置'],
]);

export const DEFAULT_PINNED_TOOLBAR_BUTTONS = Object.freeze([]);
// 按钮分布「顶栏+对话框下」：翻页和读档类默认放对话框底部的快捷栏，顶栏只留生图、素材、画面和系统。
export const TOOLBAR_SPLIT_MODES = Object.freeze(['split', 'top', 'dialog']);
// 工具栏底板：off 完全无底板（默认）、blur 展开时羽化毛玻璃、solid 实色不糊。
export const TOOLBAR_PLATE_MODES = Object.freeze(['blur', 'solid', 'off']);
// 对话框下快捷栏的对齐：auto 为手机居中、电脑靠左。
export const DIALOG_BAR_ALIGNS = Object.freeze(['auto', 'left', 'center', 'right']);
export const DEFAULT_DIALOG_BAR_BUTTONS = Object.freeze(['first-turn', 'prev-turn', 'prev', 'auto-play', 'next', 'next-turn', 'quick-save', 'quick-load']);
// 只在对话框快捷栏出现的按钮：选「只用顶栏」时不挤进顶栏（目录 › 存档里也能存读）。
export const DIALOG_ONLY_BUTTONS = Object.freeze(['quick-save', 'quick-load']);
export const READER_SETTINGS_SCHEMA_VERSION = '0.5.7';
export const INITIAL_IMAGE_POLL_ATTEMPTS = 8;
export const INITIAL_IMAGE_POLL_INTERVAL_MS = 250;

// 通用规则（每行一条、| 分隔、不发明新标签等）由 tag-grammar 统一写在最前，这里只写场景与台词本身。
export const LEGACY_DEFAULT_SCENE_PROMPT_RULE_V4 = `【场景与台词】
[igs-scene:场景名|时间|天气]：本轮开头输出一次（即使与上轮相同），换场景时再输出；NSFW场景加第4栏大写NSFW，非NSFW场景第4栏留空；换场景时，可在第5段写上此刻在场的角色名，逗号分隔，可省略；非NSFW场景第4段留空（如 [igs-scene:场景名|时间|天气||角色A,角色B]）
[igs-char:角色名|表情|服装|对白]：角色开口时使用
[igs-thought:角色名|表情|服装|心里话]：角色内心独白
角色名写完整全名；不知名角色写「？？？」，路人写「男路人A」「女同学B」；场景名写空间概念（教室、走廊），不写家具摆设。
表情：角色外在可见的神态，不是语气；只从下列词中选，不自造：
{{mood_groups}}
服装：角色每次开口都写此刻穿的哪套，不能省，也不要照抄上一句。看这个角色现在在什么地方、正在做什么，去对下面括号里的说明：对上哪套就写哪套的名字；一套都对不上，就新起一个1至12字的短名，不要空格和标点。剧情里写明这个角色换了衣服、穿上另一套、脱了或披上，服装栏必须改成换上的那套，不许再写原来那套。
{{outfit_groups}}
换衣服示例：上一句 [igs-char:林小雨|平和|校服|走吧。] 回到家换上睡衣，写成 [igs-char:林小雨|平和|睡衣|我回来了。]
新衣服示例：去宴会，上面没有能对上的说明，新起短名，写成 [igs-char:林小雨|喜悦|晚礼服|到了。]
时间：只用笼统时间段 早晨/上午/中午/下午/傍晚/晚上/深夜
{{time_groups}}
天气：只用天气类型词 晴天/多云/小雨/大雨/雷雨/小雪/大雪等
{{weather_groups}}
{{scene_groups}}`.trim();

export const DEFAULT_SCENE_PROMPT_RULE = `${LEGACY_DEFAULT_SCENE_PROMPT_RULE_V4}\n{{previous_outfit_dna}}`;

// 关闭精简注入时使用的长版原文。已保存的提示词不在这里被替换，要换新规则用「恢复默认提示词」。
export const LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3 = `[igs标签语法]
以下标签供前端渲染系统读取，是附加在正文上的元数据注释，不改变正文本身的写法。

[igs-scene:场景名|时间|天气]
[igs-scene:场景名|时间|天气|NSFW]（仅NSFW场景使用）
[igs-char:角色名|表情|服装|对白]
[igs-thought:角色名|表情|服装|心里话]

语法要求：
1. 每条标签独立成行，头尾用方括号包裹
2. 字段之间用 | 分隔
3. [igs-scene] 在本轮场景首次出现、以及任何场景切换时各输出一次；即使与上一轮场景相同，新一轮开头也要重新输出一次
4. 场景属于NSFW内容时，[igs-scene]第四栏必须填写大写NSFW；其他场景第四栏留空或不写，不得写其他词；换场景时可在第五栏写此刻在场的角色名，逗号分隔，可省略（如 [igs-scene:场景名|时间|天气||角色A,角色B]）
5. [igs-char] 在角色开口时使用
6. [igs-thought] 在需要表现角色内心独白时使用
7. 角色名必须输出完整全名
8. 场景名必须定位到空间概念（如教室、走廊），禁止描述家具
9. 不知名角色用「？？？」；路人用「男路人A」「女同学B」等
10. 禁止发明新标签

[表情词约束]
表情字段从固定池选取（2-3字词），禁止自造：
{{mood_groups}}

[服装字段约束]
角色每次开口都写此刻穿的哪套，不能省，也不要照抄上一句。看这个角色现在在什么地方、正在做什么，去对下面括号里的说明：对上哪套就写哪套的名字；一套都对不上，就新起一个1至12字的短名，不要空格和标点。剧情里写明这个角色换了衣服、穿上另一套、脱了或披上，服装栏必须改成换上的那套，不许再写原来那套。
{{outfit_groups}}
换衣服示例：上一句 [igs-char:林小雨|平和|校服|走吧。] 回到家换上睡衣，写成 [igs-char:林小雨|平和|睡衣|我回来了。]
新衣服示例：去宴会，上面没有能对上的说明，新起短名，写成 [igs-char:林小雨|喜悦|晚礼服|到了。]

[时间字段约束]
仅使用笼统时间段：早晨/上午/中午/下午/傍晚/晚上/深夜
{{time_groups}}

[天气字段约束]
仅使用天气类型词：晴天/多云/小雨/大雨/雷雨/小雪/大雪等
{{weather_groups}}

[场景字段约束]
仅定位空间概念，禁止定位家具摆设。
{{scene_groups}}

[核心原则]
igs标签是透明的元数据层。正文的文风、叙事密度、修辞手法、段落节奏完全由其他文风指令决定，不受标签存在的影响。标签插在段落之间，读者略去所有标签后，剩余正文应当是一篇完整的、符合当前文风要求的文章。其中，表情字段为角色可外在观察的神态表情，禁止理解成语气或说话方式。`.trim();

// 空值及逐字等于上一版默认的规则采用新默认；自定义原文保持不动。
export function normalizeScenePromptRule(value) {
    const rule = String(value || '');
    return !rule || rule === LEGACY_DEFAULT_SCENE_PROMPT_RULE_V4 ? DEFAULT_SCENE_PROMPT_RULE : rule;
}

// 自定义规则缺服装占位符时 AI 不会写服装栏；只提示，不改写用户规则。
export const PROMPT_RULE_OUTFIT_HINT = '自定义规则未包含服装栏，可恢复默认或添加{{outfit_groups}}。';
export const PROMPT_RULE_OUTFIT_DNA_HINT = '可添加{{previous_outfit_dna}}，注入上一轮衣装的服装DNA。';

export function scenePromptRuleOutfitHint(rule) {
    const text = String(rule || '');
    return [text.includes('{{outfit_groups}}') ? '' : PROMPT_RULE_OUTFIT_HINT,
        text.includes('{{previous_outfit_dna}}') ? '' : PROMPT_RULE_OUTFIT_DNA_HINT]
        .filter(Boolean).join('\n');
}

// 规则原文里的 {{mood_groups}} 等占位符酒馆不认识，所以提醒用「复制到酒馆预设」拿词表已展开的版本，而不是直接复制输入框。
export const PROMPT_RULE_PRESET_HINT = '规则可复制到酒馆预设使用，复制后请关闭自动注入。';
export const PROMPT_RULE_OFF_HINT = '自动注入已关闭，需将规则复制到酒馆预设，否则AI不会输出场景标签。';
