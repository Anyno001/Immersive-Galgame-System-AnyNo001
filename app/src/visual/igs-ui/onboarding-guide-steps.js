// 新手配置引导的步骤数据。
// tab / subTabs 交给设置控制器切换视图（subTabs 为 [种类, 子页签] 按顺序切换），不写任何设置值。
// target 为候选选择器，取第一个命中的元素高亮；全部不命中时只显示引导卡。
export const ONBOARDING_STEPS = Object.freeze([
    Object.freeze({
        id: 'welcome', tab: 'basic', subTabs: [], target: [],
        title: '欢迎',
        body: '用一分钟了解最常用的几项设置。每一步都可以跳过，之后也可随时修改。',
    }),
    Object.freeze({
        id: 'quick', tab: 'basic', subTabs: [], target: ['.igs-perf-presets'], quiz: true,
        title: '是否快速配置演出？',
        body: '回答几个问题，即可将演出调整为合适的组合。如暂不设置，可点击「下一步」，之后也可在「阅读器 › 演出」中修改。',
    }),
    Object.freeze({
        id: 'paging', tab: 'basic', subTabs: [], target: [],
        title: '翻页',
        body: '点击画面右半边翻到下一页，点击左半边返回上一页；也可使用空格或「→」前进。开启打字机时，第一次点击会先显示全文。',
    }),
    Object.freeze({
        id: 'mode', tab: 'basic', subTabs: [], target: ['[data-path="bridge.openMode"]'],
        title: '选择阅读方式',
        body: '可在电脑浮窗、手机、楼层内嵌和全屏之间选择，初次使用建议选择「内嵌模式」。',
    }),
    Object.freeze({
        id: 'performance', tab: 'basic', subTabs: [], target: ['.igs-perf-preset-row', '[data-action^="perf-preset:"]'],
        title: '一键演出档位',
        body: '档位决定开启多少演出，不确定时建议选择「推荐」。手机发热时，可将画质切换为「省电模式」。细项位于「阅读器 › 演出」：每项各有一个开关，点击右侧的 › 可展开参数。',
    }),
    Object.freeze({
        id: 'dialog', tab: 'reader', subTabs: [['reader', 'dialog']], target: ['[data-path="readerSettings.dialogSkin"]'],
        title: '对话框外观',
        body: '在此更换对话框皮肤、调整大小。字号、字体和描边位于相邻的「文字」页。',
    }),
    Object.freeze({
        id: 'toolbar', tab: 'reader', subTabs: [['reader', 'interface']], target: ['.igs-btn-mgr-list'],
        title: '工具栏',
        body: '工具栏默认固定在顶部，也可选择「紧贴对话框」。在下方列表中关闭眼睛图标即可隐藏对应按钮，拖动可调整顺序。',
    }),
    Object.freeze({
        id: 'scene', tab: 'scene', subTabs: [['scene', 'scenes']], target: ['.igs-scene-settings-subtabs'],
        title: '场景背景与角色立绘',
        body: '为地点配置背景、为角色配置各情绪的立绘，剧情中会自动切换。立绘大小可在角色页顶部的「立绘设置」中调整。',
    }),
    Object.freeze({
        id: 'assets', tab: 'scene', subTabs: [['scene', 'scenes']], target: ['[data-add-menu="scenes"]', '.igs-scene-settings-subtabs'],
        title: '配置素材',
        body: '点击右侧「+」，选择「下载默认素材」可一次装好常用背景（同名不覆盖），也可新增空白场景。不需要的素材可通过「多选」批量删除。',
    }),
    Object.freeze({
        id: 'image', tab: 'image', subTabs: [['image', 'source']], target: ['.igs-image-subpane'], optional: true,
        title: '自动插图（可选）',
        body: '填写生图接口和 Key 后即可自动生成插图；未配置也不影响正常阅读。',
    }),
    Object.freeze({
        id: 'search', tab: 'basic', subTabs: [], target: ['.igs-settings-search'],
        title: '找不到就搜',
        body: '顶部搜索框支持口语化的说法，例如「黑边」「打字音」「卡顿」，点击结果即可跳转到对应设置。',
    }),
    Object.freeze({
        id: 'done', tab: 'basic', subTabs: [], target: ['[data-action="onboarding-start"]'],
        title: '配置完成',
        body: '如需再次查看，可点击此处的「新手引导」。若分页或图片数量不正确，请前往「基础 › 标签解析」检查。',
    }),
]);
