export const DEFAULT_IMAGE_API = Object.freeze({
    mode: 'extension',
    externalAdapter: 'auto',
    endpoint: '',
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

export const READER_REQUIRED_SETTINGS_PATHS = Object.freeze([
    'readerSettings.fontSize',
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
    'readerSettings.pinnedBtns',
    'readerSettings.hiddenBtns',
    'readerSettings.btnOrder',
    'readerSettings.spriteLayouts',
    'readerSettings.vnTheme.preset',
]);

export const SETTINGS_PANEL_REQUIRED_SELECTORS = Object.freeze([
    '#igs-unified-settings',
    '.igs-settings-shell',
    '.igs-settings-head',
    '.igs-settings-tabs',
    '.igs-settings-body',
    '.igs-segmented',
    '.igs-source-filter',
    '.igs-settings-preview',
]);

export const SETTINGS_PANEL_TAB_CONTRACT = Object.freeze({
    basic: Object.freeze({
        label: '基础',
        requiredPaths: Object.freeze([
            'bridge.openMode',
            'bridge.showToasts',
        ]),
    }),
    regex: Object.freeze({
        label: '正文替换',
        requiredPaths: Object.freeze([
            'bridge.sourceFilter.enabled',
            'bridge.sourceFilter.textIncludeTags',
            'bridge.sourceFilter.textExcludeTags',
            'bridge.sourceFilter.imageIncludeTags',
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
        label: '图像',
        requiredPaths: Object.freeze([
            'bridge.imageApi.mode',
            'bridge.imageApi.externalAdapter',
            'bridge.imageApi.endpoint',
            'bridge.imageApi.apiKey',
            'bridge.imageApi.model',
            'bridge.imageApi.size',
            'bridge.imageApi.steps',
            'bridge.imageApi.sampler',
            'bridge.imageApi.requestTimeoutMs',
            'bridge.imageApi.pollIntervalMs',
            'bridge.imageApi.pollAttempts',
            'bridge.imageApi.promptPrefix',
        ]),
        requiredActions: Object.freeze([
            'fetch-image-models',
            'test-image',
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
        ]),
    }),
    reader: Object.freeze({
        label: '阅读器',
        requiredPaths: READER_REQUIRED_SETTINGS_PATHS,
    }),
});

export const TOOLBAR_ACTIONS = Object.freeze([
    ['db-panel', '数据库'],
    ['prev-turn', '上一轮'],
    ['first-page', '第一页'],
    ['prev', '上一页'],
    ['next', '下一页'],
    ['last-page', '最后一页'],
    ['next-turn', '下一轮'],
    ['regen', '重新生图'],
    ['save', '保存图片'],
    ['hide', '隐藏对话框'],
    ['sprite-edit', '调整立绘'],
    ['rescan', '刷新'],
    ['settings', '设置'],
]);

export const DEFAULT_PINNED_TOOLBAR_BUTTONS = Object.freeze([]);
export const READER_SETTINGS_SCHEMA_VERSION = '0.5.2';
export const INITIAL_IMAGE_POLL_ATTEMPTS = 8;
export const INITIAL_IMAGE_POLL_INTERVAL_MS = 250;

export const DEFAULT_SCENE_PROMPT_RULE = `[igs标签语法]
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
