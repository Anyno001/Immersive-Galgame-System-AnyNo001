import {
    DIALOG_FONT_CAVEAT,
    DIALOG_FONT_CINZEL,
    DIALOG_FONT_CORMORANT,
    DIALOG_FONT_GREAT_VIBES,
    DIALOG_FONT_HUIWEN,
    DIALOG_FONT_IM_FELL,
    DIALOG_FONT_NEO_XIHEI,
    DIALOG_FONT_NEO_ZHISONG,
    DIALOG_FONT_PINYON_SCRIPT,
    DIALOG_FONT_QUICKSAND,
    DIALOG_FONT_ROUNDED,
    DIALOG_FONT_SERIF,
    DIALOG_FONT_SMILEY,
    DIALOG_FONT_SOURCE_HAN_SANS,
    DIALOG_FONT_WENKAI,
    DIALOG_FONT_WENKAI_LITE,
    DIALOG_FONT_YOZAI,
    DIALOG_FONT_YUYANG,
    DIALOG_FONT_ZCOOL_KUAILE,
} from './dialog-theme-typography.js';

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
    [DIALOG_FONT_WENKAI, '霞鹜文楷'],
    [DIALOG_FONT_WENKAI_LITE, '霞鹜文楷 Lite'],
    [DIALOG_FONT_NEO_ZHISONG, '霞鹜新致宋'],
    [DIALOG_FONT_NEO_XIHEI, '霞鹜新晰黑'],
    [DIALOG_FONT_SOURCE_HAN_SANS, '思源黑体'],
    [DIALOG_FONT_SERIF, '思源宋体'],
    [DIALOG_FONT_HUIWEN, '汇文明朝体'],
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
    'readerSettings.dialogSkin',
    'readerSettings.gradientVeil.color',
    'readerSettings.gradientVeil.heightPercent',
    'readerSettings.gradientVeil.opacity',
    'readerSettings.gradientVeil.speakerStyle',
    'readerSettings.classicDialogWidthPercent',
    'readerSettings.skinDialogScale',
    'readerSettings.optionFontSize',
    'readerSettings.dialogWidth',
    'readerSettings.dialogHeight',
    'readerSettings.glassOpacity',
    'readerSettings.glassBackdropFilter',
    'readerSettings.imageCountOverride',
    'readerSettings.inputScale',
    'readerSettings.toolbarScale',
    'readerSettings.toolbarDock',
    'readerSettings.imgMode',
    'readerSettings.imgBrightness',
    'readerSettings.showStatusLine',
    'readerSettings.typewriter.enabled',
    'readerSettings.typewriter.speed',
    'readerSettings.typewriter.mode',
    'readerSettings.typewriter.sound.enabled',
    'readerSettings.typewriter.sound.volume',
    'readerSettings.typewriter.sound.dialogueVolume',
    'readerSettings.typewriter.sound.narrationVolume',
    'readerSettings.pinnedBtns',
    'readerSettings.hiddenBtns',
    'readerSettings.btnOrder',
    'readerSettings.spriteLayouts',
    'readerSettings.spriteHeads',
    'readerSettings.vnTheme.preset',
    'readerSettings.classicVnTheme.preset',
]);

export const SETTINGS_PANEL_REQUIRED_SELECTORS = Object.freeze([
    '#igs-unified-settings',
    '.igs-settings-shell',
    '.igs-settings-head',
    '.igs-settings-theme-switch',
    '.igs-settings-tabs',
    '.igs-settings-body',
    '.igs-segmented',
    '.igs-scene-settings-subtabs',
    '.igs-reader-subtabs',
    '.igs-source-filter',
    '.igs-settings-preview',
]);

export const SETTINGS_PANEL_TAB_CONTRACT = Object.freeze({
    basic: Object.freeze({
        label: '基础',
        requiredPaths: Object.freeze([
            'bridge.openMode',
            'bridge.showToasts',
            'bridge.settingsTheme',
            'bridge.sourceFilter.enabled',
            'bridge.sourceFilter.textIncludeTags',
            'bridge.sourceFilter.textExcludeTags',
            'bridge.sourceFilter.imageIncludeTags',
            'bridge.sourceFilter.htmlCardTags',
            'bridge.virtualRegex.enabled',
            'bridge.virtualRegex.pattern',
            'bridge.virtualRegex.flags',
            'bridge.virtualRegex.replacement',
        ]),
        requiredActions: Object.freeze([
            'reset-virtual-regex',
            'test-virtual-regex',
        ]),
    }),
    image: Object.freeze({
        label: '生图',
        requiredPaths: Object.freeze([
            'bridge.imageApi.mode',
            'bridge.imageApi.externalAdapter',
            'bridge.imageApi.pollIntervalMs',
            'bridge.imageApi.pollAttempts',
            'bridge.autoIllustration.nsfwEnabled',
            'bridge.autoIllustration.nsfwCount',
            'bridge.autoIllustration.interludeEnabled',
            'bridge.autoIllustration.interludeProbability',
            'bridge.autoIllustration.interludeMaxCount',
            'bridge.autoIllustration.assets.spriteEnabled',
            'bridge.autoIllustration.assets.backgroundEnabled',
            'bridge.autoIllustration.assets.strictMatch',
            'bridge.autoIllustration.assets.maxPerFloor',
            'bridge.autoIllustration.assets.spriteSize',
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
            'bridge.autoIllustration.llm.prompts.illustration',
            'bridge.autoIllustration.llm.prompts.illustrationSoft',
            'bridge.autoIllustration.llm.prompts.asset',
            'bridge.autoIllustration.llm.prompts.assetSoft',
            'bridge.autoIllustration.llm.jailbreakHead',
            'bridge.autoIllustration.llm.jailbreakTail',
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
            'bridge.imageJobLog.retainDays',
            'bridge.imageJobLog.maxEntries',
        ]),
        requiredActions: Object.freeze([
            'fetch-llm-models',
            'fetch-nai-models',
            'test-image',
            'image-log-refresh',
            'image-log-copy',
            'image-log-clear',
        ]),
    }),
    scene: Object.freeze({
        label: '场景',
        requiredPaths: Object.freeze([
            'bridge.sceneAssets.enabled',
            'bridge.sceneAssets.promptRule',
        ]),
        requiredActions: Object.freeze([
            'reset-prompt-rule',
            'save-prompt-rule',
        ]),
    }),
    reader: Object.freeze({
        label: '阅读器',
        requiredPaths: READER_REQUIRED_SETTINGS_PATHS,
    }),
});

export const TOOLBAR_ACTIONS = Object.freeze([
    ['prev-turn', '上一轮'],
    ['first-page', '第一页'],
    ['prev', '上一页'],
    ['next', '下一页'],
    ['last-page', '最后一页'],
    ['next-turn', '下一轮'],
    ['regen', '画 CG'],
    ['clear-cg', '清扫当前 CG'],
    ['generate-assets', '补全素材'],
    ['save', '保存图片'],
    ['hide', '隐藏对话框'],
    ['sprite-edit', '调整立绘'],
    ['rescan', '重新加载'],
    ['settings', '设置'],
]);

export const DEFAULT_PINNED_TOOLBAR_BUTTONS = Object.freeze([]);
export const READER_SETTINGS_SCHEMA_VERSION = '0.5.6';
export const INITIAL_IMAGE_POLL_ATTEMPTS = 8;
export const INITIAL_IMAGE_POLL_INTERVAL_MS = 250;

export const DEFAULT_SCENE_PROMPT_RULE = `[igs标签语法]
以下标签供前端渲染系统读取，是附加在正文上的元数据注释，不改变正文本身的写法。

[igs-scene:场景名|时间|天气]
[igs-scene:场景名|时间|天气|NSFW]（仅NSFW场景使用）
[igs-char:角色名|表情|对白]
[igs-thought:角色名|表情|心里话]

语法要求：
1. 每条标签独立成行，头尾用方括号包裹
2. 字段之间用 | 分隔
3. [igs-scene] 在本轮场景首次出现、以及任何场景切换时各输出一次；即使与上一轮场景相同，新一轮开头也要重新输出一次
4. 场景属于NSFW内容时，[igs-scene]第四栏必须填写大写NSFW；其他场景保持三栏，禁止输出第四栏
5. [igs-char] 在角色开口时使用
6. [igs-thought] 在需要表现角色内心独白时使用
7. 角色名必须输出完整全名
8. 场景名必须定位到空间概念（如教室、走廊），禁止描述家具
9. 不知名角色用「？？？」；路人用「男路人A」「女同学B」等
10. 禁止发明新标签

[表情词约束]
表情字段从固定池选取（2-3字词），禁止自造：
{{mood_groups}}

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

export const LEGACY_DEFAULT_SCENE_PROMPT_RULE = `[igs标签语法]
以下三种标签供前端渲染系统读取，是附加在正文上的元数据注释，不改变正文本身的写法。

[igs-scene:场景名|时间|天气]
[igs-char:角色名|情绪|对白]
[igs-thought:角色名|情绪|心里话]

语法要求：
1. 每条标签独占一行，方括号为固定边界，不可拆行
2. 字段之间用 | 分隔，字段内不得含 | 或 ]
3. [igs-scene] 在场景首次出现和换场景时各出现一次
4. [igs-char] 在角色开口时使用
5. [igs-thought] 在需要表现角色内心声音时使用
6. 角色名必须输出完整全名，每次一致（立绘索引标识）
7. 场景名必须定位到空间概念（如教室、走廊），每次一致（背景图索引标识）
8. 不知名角色用「？？？」；路人用「男路人A」「女同学B」等
9. 仅有以上三种标签，不要发明新标签

[情绪词约束]
情绪字段从固定池选取（2-3字词），仅用于前端索引立绘，禁止自造：
{{mood_groups}}

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
igs标签是透明的元数据层。正文的文风、叙事密度、修辞手法、段落节奏完全由其他文风指令决定，不受标签存在的影响。标签插在段落之间，如同脚注——读者略去所有标签后，剩余正文应当是一篇完整的、符合当前文风要求的文章。情绪字段是机械索引值，不替代也不影响正文中的情感表达。`.trim();

export function normalizeScenePromptRule(value) {
    const rule = String(value || '');
    return !rule || rule === LEGACY_DEFAULT_SCENE_PROMPT_RULE
        ? DEFAULT_SCENE_PROMPT_RULE
        : rule;
}
