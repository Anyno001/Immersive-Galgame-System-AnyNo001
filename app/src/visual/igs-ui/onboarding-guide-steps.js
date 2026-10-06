// 新手配置引导的步骤数据。
// tab / subTabs 交给设置控制器切换视图（subTabs 为 [种类, 子页签] 按顺序切换），不写任何设置值。
// target 为候选选择器，取第一个命中的元素高亮；全部不命中时只显示引导卡。
export const ONBOARDING_STEPS = Object.freeze([
    Object.freeze({
        id: 'welcome', tab: 'basic', subTabs: [], target: [],
        title: '欢迎',
        body: '花一分钟看看最常用的几项设置。每一步都能跳过，以后随时可改。',
    }),
    Object.freeze({
        id: 'quick', tab: 'basic', subTabs: [], target: ['.igs-perf-presets'], quiz: true,
        title: '想不想快速配置演出？',
        body: '点几下选项，帮你把演出开成合适的样子。不想答就点「下一步」，以后在「阅读器 › 演出」也能改。',
    }),
    Object.freeze({
        id: 'paging', tab: 'basic', subTabs: [], target: [],
        title: '翻页',
        body: '点画面右半边下一页，左半边上一页；空格或「→」也能前进。开着打字机时，第一次点击先显示全文。',
    }),
    Object.freeze({
        id: 'mode', tab: 'basic', subTabs: [], target: ['[data-path="bridge.openMode"]'],
        title: '选择阅读方式',
        body: '电脑浮窗、手机、楼层内嵌和全屏任选，初次使用推荐「内嵌模式」。',
    }),
    Object.freeze({
        id: 'performance', tab: 'basic', subTabs: [], target: ['.igs-perf-preset-row', '[data-action^="perf-preset:"]'],
        title: '一键演出档位',
        body: '档位决定演出开多少，拿不定就选「推荐」。手机发热就把画质换成「省电模式」。细项在「阅读器 › 演出」：每项一个开关，点右边的 › 展开参数。',
    }),
    Object.freeze({
        id: 'dialog', tab: 'reader', subTabs: [['reader', 'dialog']], target: ['[data-path="readerSettings.dialogSkin"]'],
        title: '对话框外观',
        body: '换对话框皮肤、调整大小。字号、字体和描边在旁边的「文字」页。',
    }),
    Object.freeze({
        id: 'toolbar', tab: 'reader', subTabs: [['reader', 'interface']], target: ['.igs-btn-mgr-list'],
        title: '工具栏',
        body: '工具栏默认固定在顶部，也可以选「紧贴对话框」。下面的列表里关掉眼睛就隐藏按钮，拖动调整顺序。',
    }),
    Object.freeze({
        id: 'scene', tab: 'scene', subTabs: [['scene', 'scenes']], target: ['.igs-scene-settings-subtabs'],
        title: '场景背景与角色立绘',
        body: '给地点配背景，给角色配各情绪的立绘，剧情里会自动切换。立绘大小在角色页顶部的「立绘设置」里调。',
    }),
    Object.freeze({
        id: 'assets', tab: 'scene', subTabs: [['scene', 'scenes']], target: ['[data-add-menu="scenes"]', '.igs-scene-settings-subtabs'],
        title: '配置素材',
        body: '点右侧「+」，选「下载默认素材」一次装好常用背景（同名不覆盖），或新增空白场景。不要的素材点「多选」批量删除。',
    }),
    Object.freeze({
        id: 'image', tab: 'image', subTabs: [['image', 'source']], target: ['.igs-image-subpane'], optional: true,
        title: '自动插图（可选）',
        body: '填好生图接口和 Key 就能自动出插图；不配也能正常阅读。',
    }),
    Object.freeze({
        id: 'search', tab: 'basic', subTabs: [], target: ['.igs-settings-search'],
        title: '找不到就搜',
        body: '顶部搜索框认口语，比如「黑边」「打字音」「卡顿」，点结果直接跳到那一项。',
    }),
    Object.freeze({
        id: 'done', tab: 'basic', subTabs: [], target: ['[data-action="onboarding-start"]'],
        title: '配置完成',
        body: '想再看一遍，点这里的「新手引导」。分页或图片数量不对，去「基础 › 标签解析」看看。',
    }),
]);
