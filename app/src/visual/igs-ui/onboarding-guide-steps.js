// 新手配置引导的步骤数据。
// tab / subTabs 交给设置控制器切换视图（subTabs 为 [种类, 子页签] 按顺序切换），不写任何设置值。
// target 为候选选择器，取第一个命中的元素高亮；全部不命中时只显示引导卡。
export const ONBOARDING_STEPS = Object.freeze([
    Object.freeze({
        id: 'welcome', tab: 'basic', subTabs: [], target: [],
        title: '欢迎',
        body: '接下来花一分钟，带你看看最常用的几项设置。每一步都可以跳过，所有选项以后都能再改。',
    }),
    Object.freeze({
        id: 'paging', tab: 'basic', subTabs: [], target: [],
        title: '翻页',
        body: '阅读时点画面右半边进入下一页，点左半边回到上一页；键盘按空格或「→」也能前进。开启打字机时，第一次点击先显示全文，再点一次才翻页。',
    }),
    Object.freeze({
        id: 'mode', tab: 'basic', subTabs: [], target: ['[data-path="bridge.openMode"]'],
        title: '选择阅读方式',
        body: '电脑浮窗、手机、楼层内嵌和全屏任选一种，初次使用推荐「内嵌模式」。',
    }),
    Object.freeze({
        id: 'performance', tab: 'basic', subTabs: [], target: ['.igs-perf-preset-row', '[data-action^="perf-preset:"]'],
        title: '一键演出档位',
        body: '档位决定转场、震动、音效这些演出开多少，拿不定主意就选「推荐」，细项可前往「阅读器 › 演出」调整。',
    }),
    Object.freeze({
        id: 'dialog', tab: 'reader', subTabs: [['reader', 'dialog']], target: ['[data-path="readerSettings.dialogSkin"]'],
        title: '对话框外观',
        body: '在这里换对话框皮肤、调整大小和背景。字号和字体在旁边的「文字」页。',
    }),
    Object.freeze({
        id: 'scene', tab: 'scene', subTabs: [['sceneSettings', 'assets'], ['scene', 'scenes']], target: ['.igs-scene-subtabs'],
        title: '场景背景与角色立绘',
        body: '给地点配背景图，给角色配不同情绪的立绘。剧情里出现对应的地点和情绪时会自动切换。',
    }),
    Object.freeze({
        id: 'assets', tab: 'scene', subTabs: [['sceneSettings', 'assets'], ['scene', 'scenes']], target: ['[data-add-menu="scenes"]', '.igs-scene-subtabs'],
        title: '配置素材',
        body: '点「背景场景」右侧的「+」：选「下载默认素材」一次装好常用背景，同名不会覆盖；也可以「新增空白场景」，填图片地址和别名。立绘在「角色立绘」页同样添加。',
    }),
    Object.freeze({
        id: 'image', tab: 'image', subTabs: [['image', 'source']], target: ['.igs-image-subpane'], optional: true,
        title: '自动插图（可选）',
        body: '填好生图接口和 Key 后可以自动生成插图。不配也能正常阅读，只是没有自动插图。',
    }),
    Object.freeze({
        id: 'done', tab: 'basic', subTabs: [], target: ['[data-action="onboarding-start"]'],
        title: '配置完成',
        body: '想再看一遍，点这里的「新手引导」。如果正文分页不对，去「基础 › 标签解析」看看。',
    }),
]);
