// 新手配置引导的步骤数据。
// page 是设置器的页面 id（见 settings-pages.js），交给设置控制器切换视图，不写任何设置值。
// open 是要自动展开的折叠 key（data-advanced）；target 为候选选择器，取第一个可见的命中元素高亮，
// 全部不命中时卡片提示 missing 或「这一项当前不可见」。
// requires：目标所在区域被隐藏时，先高亮 switch 对应的开关并提示 hint（素材模式没开就是这种情况）。
// nav：打开窄屏侧边栏抽屉，navGroup 连同组下分类一起高亮；charPanel：展开第一个角色的设定面板并切到该页；
// menu：先展开第一个角色的「⋯」菜单再找目标；gate：条件满足前「下一步」只提示不前进；branch：给「到此结束」出口。
const SCENE_ASSET_REQUIRES = Object.freeze({
    content: '.igs-scene-settings-content',
    switch: 'bridge.sceneAssets.enabled',
    hint: '先开启「启用场景素材模式」',
});

const navGroup = (n) => Object.freeze([`.igs-settings-nav > .igs-settings-nav-group:nth-of-type(${n})`]);
const navItem = (cat) => Object.freeze([`.igs-settings-nav [data-cat="${cat}"]`]);
const CHAR_MENU = '.igs-char-card .igs-row-menu';
const menuItem = (action) => Object.freeze([`${CHAR_MENU} [data-action^="${action}:"]`]);
const NO_CHAR = '还没有角色哦，先回到上一步建一个角色吧。';

const step = (fields) => Object.freeze(fields);
const menuStep = (fields) => step({ page: 'chars', requires: SCENE_ASSET_REQUIRES, menu: true, missing: NO_CHAR, ...fields });

export const ONBOARDING_STEPS = Object.freeze([
    step({
        id: 'welcome', page: 'dash', target: [],
        title: '欢迎',
        body: '欢迎来到IGS！本插件把聊天显示成Galgame，文字与剧情质量仍由酒馆AI及预设决定。每一步都可以跳过，随时按Esc暂停。引导过程中可以直接动手设置，不用等看完哦。',
    }),
    step({
        id: 'search', page: 'dash', target: ['.igs-settings-search'],
        title: '搜索',
        body: '有任何想找的功能或问题，比如「黑边」「卡顿」，都可以在这里直接搜索。',
    }),
    step({
        id: 'nav', page: 'dash', target: ['.igs-settings-nav'], nav: true,
        title: '设置',
        body: '这里能看到各个功能的目录。',
    }),
    step({
        id: 'navReading', page: 'dash', target: navGroup(1), nav: true, navGroup: 1,
        title: '阅读体验',
        body: '这里的设置决定你的阅读感受，可以按喜好慢慢调整细节。',
    }),
    step({
        id: 'navAssets', page: 'dash', target: navGroup(2), nav: true, navGroup: 2,
        title: '素材',
        body: '角色立绘、衣柜、背景与CG都在这里管理。',
    }),
    step({
        id: 'navFormat', page: 'dash', target: navGroup(3), nav: true, navGroup: 3,
        title: 'API与提示词',
        body: '这里配置生图API，也可以单独修改生图模型、提示词，以及对正文格式的要求。',
    }),
    step({
        id: 'navPlay', page: 'dash', target: navGroup(4), nav: true, navGroup: 4,
        title: '玩法与数据',
        body: '这里是进阶玩法。',
    }),
    step({
        id: 'api', page: 'source', target: [...navItem('ai'), '.igs-page-tabs'], nav: true,
        title: 'API配置',
        body: '开始配置我们的IGS吧！第一步是配置生图API和备用模型API。',
    }),
    step({
        id: 'imageSource', page: 'source', target: ['[data-image-pane="source"] .igs-settings-field', '[data-image-pane="source"]'], optional: true,
        title: '生图API',
        body: '内置模式目前只支持NAI。已安装数据库生图、智绘姬或柏宝绘插件的，选对应项就好。NAI API地址留空时使用官方地址，也可以填自己的代理；填好API Key、选好模型后，可以点「测试生成」试试能不能出图。没有NovelAI账号的，可以先跳过这一步，之后手动上传立绘。',
    }),
    step({
        id: 'llm', page: 'llm', target: ['[data-image-pane="llm"] .igs-source-filter', '[data-image-pane="llm"]'], gate: 'llm',
        title: '备用模型',
        body: '备用模型负责写生图提示词、计算数值等工作，用普通的语言模型就可以（比如Gemini或DeepSeek）。很多功能都要靠它，这一步需要填好才能继续哦：来源选「独立API」，填上地址、API Key和模型就可以啦。',
    }),
    step({
        id: 'sceneMode', page: 'chars', target: ['[data-switch="bridge.sceneAssets.enabled"]', '.igs-page-tabs'],
        title: '素材模式',
        body: '要开始处理图像啦！开启「启用场景素材模式」后才会显示人物与背景，否则只有文字。现在就打开它吧！',
    }),
    step({
        id: 'background', page: 'scenes', requires: SCENE_ASSET_REQUIRES, target: ['[data-add-menu="scenes"]', '.igs-page-tabs'],
        title: '背景',
        body: '点「+」后选「下载默认素材」，可以下载内置的背景素材，以后也可以换成自己的素材。点一下试试～',
    }),
    step({
        id: 'addChar', page: 'chars', requires: SCENE_ASSET_REQUIRES, target: ['[data-add-menu="characters"]', '.igs-page-tabs'],
        title: '角色',
        body: '点「+」后选「新增角色」，名字要和聊天正文里的称呼完全一致。先建一个自己吧！',
    }),
    step({
        id: 'sprite', page: 'chars', requires: SCENE_ASSET_REQUIRES, target: ['.igs-scene-settings-subpane .igs-settings-section', '.igs-page-tabs'],
        title: '角色立绘',
        body: '可以填网址或从本地上传准备好的图片，也可以点「生成立绘」，在弹窗里用中文描述长相。留空时会按角色卡、世界书和正文来写，需要先配置好生图API。',
    }),
    step({
        id: 'dna', page: 'chars', requires: SCENE_ASSET_REQUIRES, target: ['.igs-char-head', '.igs-scene-settings-subpane .igs-settings-section', '.igs-page-tabs'],
        title: '外貌资料',
        body: '小知识！「外貌（DNA）」是角色的外貌资料，用来让同一个角色每次都画出一样的长相。不用担心DNA怎么处理：写完中文描述后，或者随正文生成立绘时，DNA都会自动入库，一般不用手动填写。如果你是生图高手，提前准备好了角色外貌DNA，可以在生成前填进「⋯ › 角色设定 › 外貌」。无论哪种方式，以后都可以在这里查看和修改。',
    }),
    menuStep({
        id: 'charMenu', target: [CHAR_MENU],
        title: '角色菜单',
        body: '每个角色名字右边都有一个「⋯」，这个角色的所有设置都收在这里。接下来带你从上往下认识一遍，看到感兴趣的可以直接点开试试，不会弄坏东西哦。',
    }),
    step({
        id: 'charSetup', page: 'chars', requires: SCENE_ASSET_REQUIRES, charPanel: 'look', missing: NO_CHAR,
        target: ['.igs-char-card .igs-char-dna-panel', ...menuItem('scene-toggle-dna')],
        title: '角色设定',
        body: '菜单里的「角色设定」会打开下面这块面板，角色的详细资料都在这里，分三页：\n· 外貌：就是上一步说的DNA，决定这个角色画出来长什么样。没填时菜单上会写「（外貌未填）」，不影响阅读。\n· 资料：可以填别名（下一步细说）、状态栏头像（上传图片，或者点「生成Q版」自动画一个），还有名字颜色（窄屏阅读时名字的颜色，默认从立绘取色）。\n· 声音：开启语气音或台词朗读后才会出现，用来给这个角色挑声线、调音高和语速。',
    }),
    step({
        id: 'charAlias', page: 'chars', requires: SCENE_ASSET_REQUIRES, charPanel: 'profile', missing: NO_CHAR,
        target: ['.igs-char-card .igs-char-dna-panel .igs-char-info-row:has(.igs-mood-word-list)', '.igs-char-card .igs-char-dna-panel'],
        title: '别名',
        body: '别名在「角色设定 › 资料」页的第一行。正文里同一个人常常有好几种叫法，比如「林小雨」「小雨」「林同学」，把这些叫法都加进别名，插件就知道说的是同一个人，会用同一套立绘。点「+」就能添加，点名字旁边的「×」可以删掉。',
    }),
    menuStep({
        id: 'charUser', target: menuItem('scene-set-user-char'),
        title: '设为User立绘',
        body: '推荐新手先建一个自己的角色，在这里点「设为User立绘」。设好以后，名字旁边会出现「User」小标签，正文里你说话、旁白写到「你」的时候，都会显示这张立绘。一张卡只能设一个，再点一次就取消。其他角色可以随着剧情慢慢补充哦！',
    }),
    menuStep({
        id: 'charCreature', target: menuItem('char-creature'),
        title: '设为非人角色',
        body: '角色是动物、怪物、机器人、史莱姆这类非人形象时打开。打开后，「角色设定 › 外貌」里会多出几项可以调：\n· 形态：半人形或完全非人形\n· 体型：小型 / 中型 / 大型 / 巨型\n· 落地：站在地上，还是飘在空中\n· 画布：竖图 / 方图 / 横图\n出图和显示都会按这些设置来。普通人类角色不用管这一项。',
    }),
    menuStep({
        id: 'charFolder', target: [`${CHAR_MENU} .igs-folder-pick-item`], optional: true,
        missing: '还没有建素材文件夹，所以菜单里暂时没有这一项。',
        title: '移到文件夹',
        body: '建过素材文件夹以后才会出现这一项。角色多了的话，可以按卡或者按故事分进不同文件夹，找起来更方便。只是整理用的，不影响显示。',
    }),
    menuStep({
        id: 'charRename', target: menuItem('scene-rename-char'),
        title: '重命名',
        body: '修改角色的名字。点了会弹出输入框，取消的话什么都不会改。改完要和正文里的称呼对得上，否则就认不出这个角色啦。如果只是正文里多了一种叫法，加别名就好，不用改名。',
    }),
    menuStep({
        id: 'charRemove', target: menuItem('scene-remove-char'),
        title: '删除角色',
        body: '删除这个角色，立绘和别名会一起删掉。点了会先弹出确认框，不会一下子就删掉，放心。',
    }),
    step({
        id: 'basicsDone', page: 'dash', target: [],
        title: '恭喜',
        body: '你已经完成基础配置啦，接下来调整阅读体验！',
    }),
    step({
        id: 'quick', page: 'dash', target: ['.igs-perf-presets'], quiz: true,
        title: '快速配置演出',
        body: '回答几个小问题，帮你把演出调成合适的组合～',
    }),
    step({
        id: 'dashQuick', page: 'dash', target: ['.igs-perf-presets'],
        title: '快速设置',
        body: '仪表盘这一块可以快速调整演出档位、打开方式和画质。',
    }),
    step({
        id: 'preset', page: 'dash', target: ['.igs-perf-preset-row'],
        title: '演出档位',
        body: '不确定的话就选「推荐」吧。全开对正文模型有一定要求哦！',
    }),
    step({
        id: 'mode', page: 'dash', target: ['.igs-dash .igs-key-block:has([data-segment-path="bridge.openMode"])', '.igs-dash [data-segment-path="bridge.openMode"]'],
        title: '打开方式',
        body: '可选电脑、窄屏模式、网页全屏、全屏、楼层内嵌，新手建议用「楼层内嵌」。',
    }),
    step({
        id: 'quality', page: 'dash', target: ['.igs-perf-quality'],
        title: '画质',
        body: '如果设备容易发热，就把画质切到「省电模式」。',
    }),
    step({
        id: 'toolbar', page: 'ui-bar', open: ['toolbar-buttons'], target: ['[data-reader-pane="interface"] .igs-btn-mgr-list'],
        title: '工具栏',
        body: '阅读时上方的那排按钮就是工具栏，目录、存档、CG库都在里面，可以在这里隐藏或调整顺序。',
    }),
    step({
        id: 'readingDone', page: 'dash', target: [], branch: true,
        title: '恭喜',
        body: '基础的阅读配置完成啦！还想了解其他功能吗？',
    }),
    step({
        id: 'style', page: 'style', target: ['[data-path="readerSettings.dialogSkin"]'], optional: true,
        title: '对话框',
        body: '在这里换对话框风格，有很多款漂亮的对话框等你来用。选择困难的话：现代故事选「渐变黑幕」，古代故事选「水墨武侠」，奇幻故事选「魔法星夜」！',
    }),
    step({
        id: 'text', page: 'text', target: navItem('text'), nav: true, optional: true,
        title: '文字',
        body: '这里可以修改字号、字体等参数。',
    }),
    step({
        id: 'sound', page: 'sound', target: navItem('sound'), nav: true, optional: true,
        title: '声音',
        body: '这里可以调整BGM、环境音和角色说话的声音。',
    }),
    step({
        id: 'perf', page: 'perf-text', target: navItem('perf'), nav: true, optional: true,
        title: '演出',
        body: '这里可以按喜好安排各种演出，每项一个开关，点「›」能看到更细的选项。内容太丰富啦，以后慢慢看吧！',
    }),
    step({
        id: 'stats', page: 'stats-set', target: navItem('stats'), nav: true, optional: true,
        title: '数值系统',
        body: '开启后，角色会有自己的好感度和信任度，影响他们怎么看你！数值系统要搭配数据库插件的表格一起用，接下来教你怎么准备表格。',
    }),
    step({
        id: 'statsApplyChat', page: 'stats-set', open: ['stats-more'], target: ['[data-action="stats-template-apply-chat"]'], optional: true,
        title: '用于本聊天',
        body: '最省事的办法：点「用于本聊天」，当前聊天的表格就会换成IGS适配版，已经有的数据会保留。点之前会先弹出确认框，放心点就好。',
    }),
    step({
        id: 'statsImport', page: 'stats-set', open: ['stats-more'], target: ['[data-action="stats-template-import"]'], optional: true,
        title: '导入模板预设',
        body: '想让以后的新聊天也能用，就点「导入模板预设」，把适配版模板存进数据库的模板预设里，以后新开聊天时直接选它就好。',
    }),
    step({
        id: 'statsDownload', page: 'stats-set', open: ['stats-more'], target: ['[data-action="stats-template-download"]'], optional: true,
        title: '下载模板到本地',
        body: '如果上面两个按钮提示「未检测到数据库」，或者你习惯自己手动导入，就点这里把模板文件存到本地，再到数据库插件里导入。',
    }),
    step({
        id: 'combat', page: 'combat', target: navItem('combat'), nav: true, optional: true,
        title: '战斗与敌方',
        body: '想多点趣味的话，可以在这里开启卡牌战斗！不管是日常挑战还是遭遇敌人，都用卡牌一决胜负吧！',
    }),
    step({
        id: 'origin', page: 'origin', target: navItem('origin'), nav: true, optional: true,
        title: '随身系统',
        body: '这里可以开启新的玩法：完成系统发布的任务，就能获得各种奖励！',
    }),
    step({
        id: 'data', page: 'data', target: ['[data-action="copy-page-diagnostic"]', ...navItem('data')], optional: true,
        title: '数据',
        body: '遇到图片不显示、演出出错等问题时，先停在出问题的那一页，复制「本页诊断」，再截图「日志」，一起发给作者～',
    }),
]);
