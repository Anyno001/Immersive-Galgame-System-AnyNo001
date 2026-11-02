// 新手配置引导的步骤数据。
// page 是设置器的页面 id（见 settings-pages.js），交给设置控制器切换视图，不写任何设置值。
// open 是要自动展开的折叠 key（data-advanced）；target 为候选选择器，取第一个可见的命中元素高亮，
// targetNarrow 只在窄屏（与设置外壳同一断点，宽度小于 900px）使用，全部不命中时卡片提示「这一项当前不可见」。
// requires：目标所在区域被隐藏时，先高亮 switch 对应的开关并提示 hint（素材模式没开就是这种情况）。
const SCENE_ASSET_REQUIRES = Object.freeze({
    content: '.igs-scene-settings-content',
    switch: 'bridge.sceneAssets.enabled',
    hint: '先开启「启用场景素材模式」',
});

export const ONBOARDING_STEPS = Object.freeze([
    Object.freeze({
        id: 'welcome', page: 'dash', target: [],
        title: '欢迎',
        body: '本插件把聊天显示成Galgame，剧情仍由酒馆原来的AI编写。每一步都可跳过，随时按Esc暂停。',
    }),
    Object.freeze({
        id: 'sceneMode', page: 'chars', target: ['[data-switch="bridge.sceneAssets.enabled"]', '.igs-page-tabs'],
        title: '素材模式',
        body: '开启「启用场景素材模式」后才会显示人物与背景，否则只有文字。',
    }),
    Object.freeze({
        id: 'background', page: 'scenes', requires: SCENE_ASSET_REQUIRES, target: ['[data-add-menu="scenes"]', '.igs-page-tabs'],
        title: '背景',
        body: '点「+」后选「下载默认素材」，可一次装好常用背景。',
    }),
    Object.freeze({
        id: 'addChar', page: 'chars', requires: SCENE_ASSET_REQUIRES, target: ['[data-add-menu="characters"]', '.igs-page-tabs'],
        title: '新增角色',
        body: '点「+」后选「新增角色」，名字须与聊天正文中的称呼完全一致。',
    }),
    Object.freeze({
        id: 'sprite', page: 'chars', requires: SCENE_ASSET_REQUIRES, target: ['.igs-scene-settings-subpane .igs-settings-section', '.igs-page-tabs'],
        title: '角色立绘',
        body: '可上传自己的图片，或点「生成立绘」，在弹窗中用中文描述长相；留空时按角色卡编写，需先配置图像来源。',
    }),
    Object.freeze({
        id: 'dna', page: 'chars', requires: SCENE_ASSET_REQUIRES, target: ['.igs-char-head', '.igs-scene-settings-subpane .igs-settings-section', '.igs-page-tabs'],
        title: '外貌资料',
        body: '界面中的「外貌（DNA）」是角色的外貌资料，用于让同一角色每次画出的长相一致。生成立绘时通常会自动编写并保存，一般无需手动填写；已有角色外貌DNA的，可在生成前填入「⋯ › 角色设定 › 外貌」，生成时按此绘制，之后也可在此查看和修改。显示「未填」不影响阅读。',
    }),
    Object.freeze({
        id: 'imageSource', page: 'source', target: ['[data-image-pane="source"] .igs-settings-field', '[data-image-pane="source"]'], optional: true,
        title: '图像来源',
        body: '已使用数据库生图、智绘姬、柏宝绘的，选对应项；有NovelAI账号的，选「IGS内置NAI」并填写API Key。没有可跳过，手动上传立绘即可。',
    }),
    Object.freeze({
        id: 'testImage', page: 'source', target: ['[data-action="test-image"]', '[data-image-pane="source"]'], optional: true,
        title: '测试与日志',
        body: '点「测试生成」确认能否出图；失败时在「数据 › 日志」查看原因。',
    }),
    Object.freeze({
        id: 'quick', page: 'dash', target: ['.igs-perf-presets'], quiz: true,
        title: '快速配置演出',
        body: '回答几个问题，把演出调成合适的组合；暂不设置可跳过。',
    }),
    Object.freeze({
        id: 'sidebar', page: 'dash', target: ['.igs-settings-nav'], targetNarrow: ['.igs-settings-nav-toggle'],
        title: '设置分类',
        body: '设置按用途分类，仪表盘右侧能看到每类现状。',
    }),
    Object.freeze({
        id: 'preset', page: 'dash', target: ['.igs-perf-quality', '.igs-perf-preset-row'],
        title: '档位与省电',
        body: '不确定就选「推荐」；手机发热，把画质切到「省电模式」。',
    }),
    Object.freeze({
        id: 'mode', page: 'ui-reader', target: ['.igs-key-block:has([data-segment-path="bridge.openMode"])', '[data-segment-path="bridge.openMode"]'],
        title: '打开方式',
        body: '可选电脑、窄屏模式、网页全屏、全屏、楼层内嵌，建议「楼层内嵌」。',
    }),
    Object.freeze({
        id: 'toolbar', page: 'ui-bar', open: ['toolbar-buttons'], target: ['[data-reader-pane="interface"] .igs-btn-mgr-list'],
        title: '工具栏',
        body: '目录、存档、CG库都在工具栏，可在这里隐藏或排序。',
    }),
    Object.freeze({
        id: 'search', page: 'dash', target: ['.igs-settings-search'],
        title: '找不到就搜',
        body: '搜「黑边」「卡顿」这类口语词即可跳转；「最近改过」在仪表盘。',
    }),
    Object.freeze({
        id: 'perf', page: 'perf-text', target: ['.igs-perf-item:has([data-switch="readerSettings.typewriter.enabled"])', '.igs-perf-page .igs-perf-item', '.igs-perf-page'],
        title: '演出细项',
        body: '每项一个开关，点›看细项。',
    }),
    Object.freeze({
        id: 'style', page: 'style', target: ['[data-path="readerSettings.dialogSkin"]'],
        title: '对话框与文字',
        body: '在这里换对话框风格；字号、字体在「文字」。',
    }),
]);
