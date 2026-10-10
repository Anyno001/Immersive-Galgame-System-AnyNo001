import { enabledDailyFxKinds } from './fx-daily-model.js';

const DAILY_PROMPT_LINES = Object.freeze({
    timeskip: '[igs-fx:timeskip|三小时后]：剧情时间明显跳跃时报幕，文字写经过的时间，如「三小时后」「第二天清晨」',
    photo: '[igs-fx:photo|一句话题字]：角色拍照或合影的瞬间，题字写在照片下方，如[igs-fx:photo|摩天轮前的合影]',
    letter: '[igs-fx:letter|寄件人|信的内容]：收到或读到一封信、情书、交换日记，内容不超过60字',
    note: '[igs-fx:note|便签内容]：发现一张留言便签或字条',
    bell: '[igs-fx:bell]：学校上课、下课或放学铃声响起',
    broadcast: '[igs-fx:broadcast|广播内容]：校园、车站、商场等场所的广播通知',
    fireworks: '[igs-fx:fireworks]：夜空中烟花绽放（夏日祭、跨年等）',
    touch: '[igs-fx:touch|动作]：心动的肢体接触，如牵手、摸头、靠肩、拥抱，动作写两三个字；战斗中的擒抱、缠斗不算',
    alarm: '[igs-fx:alarm|07:00]：闹钟响起，时间可省略',
    omikuji: '[igs-fx:omikuji|大吉|一句签文]：神社抽签，结果只写 大吉／中吉／小吉／吉／末吉／凶／大凶，签文可省略',
    receipt: '[igs-fx:receipt|物品1、物品2|合计金额|店名]：结账时的小票，物品用顿号分隔，合计与店名可省略',
    tv: '[igs-fx:tv|频道名|播报内容]：电视、新闻或节目画面，频道名可省略',
    rps: '[igs-fx:rps|主角手势|对方手势]：猜拳，手势只写 石头／剪刀／布，胜负由手势决定',
    gacha: '[igs-fx:gacha|扭到的东西]：扭蛋机或夹娃娃得到一样东西',
    game: '[igs-fx:game|胜]：一起打电子游戏的一局结束，结果只写 胜／败／平',
    score: '[igs-fx:score|科目|分数]：拿到考试成绩或成绩单，分数写数字',
    pat: '[igs-fx:pat|角色名]：主角摸了摸角色的头',
    poke: '[igs-fx:poke|角色名]：主角捏或戳了一下角色的脸',
    fever: '[igs-fx:fever|38.2]：额头贴额头或用体温计测体温，读数写数字',
    cheers: '[igs-fx:cheers]：两人举杯相碰',
    cook: '[igs-fx:cook|料理名]：做好一道菜或便当，料理名写菜名',
    eat: '[igs-fx:eat|食物名|反应]：说话的角色吃下或喝下东西的那一刻，食物名写具体名称；反应只写 好吃、甜、辣、烫、酸、苦、噎住、饱 之一，可省；角色喂对方吃时写「喂」，被对方喂时写「被喂」，如[igs-fx:eat|章鱼烧|烫]、[igs-fx:eat|草莓蛋糕|被喂]',
    cat: '[igs-fx:cat]：撸猫、摸小动物',
    guqin: '[igs-fx:guqin]：有人抚琴、弹奏古琴',
    go: '[igs-fx:go|胜]：下围棋或对弈的一局结束，结果只写 胜／败／平，可省略',
    poem: '[igs-fx:poem|诗句]：题诗、作诗或留下墨宝，诗句不超过28字',
    edict: '[igs-fx:edict|内容]：宣读圣旨、张贴告示或榜文，内容不超过40字',
    tea: '[igs-fx:tea]：奉茶、敬茶',
    bow: '[igs-fx:bow|角色名]：角色行礼、作揖或下拜',
    spell: '[igs-fx:spell|咒语]：有人挥动魔杖施咒，咒语写咒文本身，不超过10字，可省略',
    potion: '[igs-fx:potion|魔药名]：坩埚里的魔药熬好或调配完成，魔药名可省略',
    owl: '[igs-fx:owl|寄件人]：猫头鹰飞来送信或包裹，寄件人可省略；信的内容另用 letter 标签',
    broom: '[igs-fx:broom]：骑上飞天扫帚起飞或掠过天空',
    howler: '[igs-fx:howler|寄件人|怒吼内容]：收到一封吼叫信，信封当众炸开、用寄件人的声音怒吼，内容不超过40字',
    blackout: '[igs-fx:blackout|旁白]：灯闪了几下后突然停电、陷入黑暗，旁白写黑暗里的一句感受，不超过16字，可省略',
    knock: '[igs-fx:knock|次数]：门被敲响（或墙里、窗外传来敲击声），次数写 1–6，可省略',
    murmur: '[igs-fx:murmur|低语内容]：耳边突然响起不知从哪来的低语，内容不超过16字',
    brake: '[igs-fx:brake]：车辆急刹车、马车猛地停住，人往前一冲',
    depart: '[igs-fx:depart|目的地]：车、船、马车起步出发，目的地可省略',
    arrive: '[igs-fx:arrive|站名]：列车到站、船靠岸或车到了地方，站名可省略',
    ticket: '[igs-fx:ticket|起点|终点|备注]：拿出或买到车票、船票、登机牌，只写一栏时当作终点，备注写车次座位等，可省略',
    steam: '[igs-fx:steam]：浴室、温泉里一团水汽涌过来挡住视线',
    shower: '[igs-fx:shower]：拧开淋浴、花洒的水哗地落下',
    splash: '[igs-fx:splash]：泼水、打水仗，水花溅起来',
    hairdry: '[igs-fx:hairdry|角色名]：用吹风机吹头发',
    dive: '[igs-fx:dive]：跳进水里、潜入水下的那一刻',
    bubble: '[igs-fx:bubble]：在水下说话或叹气，吐出一串气泡',
    vacuum: '[igs-fx:vacuum]：舱门打开、空气泄光，四周陷入真空的寂静',
    say: '[igs-fx:say|角色|小字]：角色头顶冒出一句小字（嘀咕、吐槽、心声），不超过12字；角色省略时是当前说话人',
});

export function resolveDailyFxPromptRule(settings) {
    const kinds = enabledDailyFxKinds(settings);
    if (!kinds.length) return '';
    const lines = kinds.map((kind, index) => `${index + 1}. ${DAILY_PROMPT_LINES[kind]}`);
    return `[igs日常演出标签]
以下日常演出标签属于允许使用的igs标签，用于点缀日常场景：

${lines.join('\n')}

语法要求：
1. 每条标签独立成行，放在它所描写的正文之前
2. 字段不得换行，不得含 | 或 ]
3. 只在剧情里确实发生对应事件时使用，每层回复最多2个，不要每层都用`;
}

// 详细约束版（演出提示词选「详细」时用，每轮都发）。
const DAILY_DETAILED_EXAMPLES = Object.freeze([
    ['eat', ['[igs-fx:eat|章鱼烧|烫]', '[igs-char:林小雨|慌张|便服|好烫好烫！]']],
    ['timeskip', ['[igs-fx:timeskip|第二天清晨]', '闹钟还没响，窗外已经亮了。']],
    ['photo', ['[igs-fx:photo|摩天轮前的合影]', '快门按下的那一刻，她悄悄往这边靠了半步。']],
    ['tea', ['[igs-fx:tea]', '她双手捧着茶盏递过来。']],
    ['spell', ['[igs-fx:spell|荧光闪烁]', '杖尖亮起一点白光。']],
]);

export function dailyDetailedBlock(settings) {
    const kinds = enabledDailyFxKinds(settings);
    if (!kinds.length) return '';
    const examples = DAILY_DETAILED_EXAMPLES.filter(([kind]) => kinds.includes(kind)).slice(0, 2).map(([, rows]) => rows.join('\n'));
    return `【日常演出】以下日常演出标签用于点缀日常场景，完整写法照抄方括号格式：
${kinds.map((kind, index) => `${index + 1}. ${DAILY_PROMPT_LINES[kind]}`).join('\n')}
使用约束：
1. 标签单独占一行，写在描写该事件的正文之前，不要夹在句子或台词中间
2. 字段内不换行、不含 | 或 ]
3. 剧情里确实发生对应事件时就主动用，不必等用户要求；每层回复最多2个，不要每层都用
4. 只用上面列出的类型，不发明新类型；正文仍要把事情完整写出来${examples.length ? `\n示例：\n${examples.join('\n\n')}` : ''}`;
}

export const DAILY_GRAMMAR_LINES = Object.freeze({
    timeskip: 'timeskip|三小时后：剧情时间明显跳跃时报幕',
    photo: 'photo|题字：拍照或合影的瞬间',
    letter: 'letter|寄件人|信的内容：收到或读到信件、情书、交换日记，内容不超过60字',
    note: 'note|便签内容：发现留言便签或字条',
    bell: 'bell：学校铃声响起',
    broadcast: 'broadcast|广播内容：校园、车站、商场等场所的广播',
    fireworks: 'fireworks：夜空中烟花绽放',
    touch: 'touch|动作：心动的肢体接触，动作写两三个字',
    alarm: 'alarm|07:00：闹钟响起，时间可省',
    omikuji: 'omikuji|大吉|签文：神社抽签，结果只写 大吉/中吉/小吉/吉/末吉/凶/大凶，签文可省',
    receipt: 'receipt|物品1、物品2|合计金额|店名：结账小票，合计与店名可省',
    tv: 'tv|频道名|播报内容：电视、新闻或节目画面，频道名可省',
    rps: 'rps|主角手势|对方手势：猜拳，手势只写 石头/剪刀/布',
    gacha: 'gacha|扭到的东西：扭蛋或夹娃娃得到一样东西',
    game: 'game|胜：一起打游戏的一局结束，结果只写 胜/败/平',
    score: 'score|科目|分数：拿到考试成绩，分数写数字',
    pat: 'pat|角色名：主角摸了摸角色的头',
    poke: 'poke|角色名：主角捏或戳了一下角色的脸',
    fever: 'fever|38.2：测体温，读数写数字',
    cheers: 'cheers：两人举杯相碰',
    cook: 'cook|料理名：做好一道菜或便当',
    eat: 'eat|食物名|反应：说话的角色吃下或喝下东西的那一刻，反应只写 好吃/甜/辣/烫/酸/苦/噎住/饱 之一，可省；喂对方写「喂」，被喂写「被喂」',
    cat: 'cat：撸猫、摸小动物',
    guqin: 'guqin：有人抚琴',
    go: 'go|胜：对弈一局结束，结果只写 胜/败/平，可省',
    poem: 'poem|诗句：题诗或作诗，诗句不超过28字',
    edict: 'edict|内容：宣读圣旨或张贴告示，内容不超过40字',
    tea: 'tea：奉茶、敬茶',
    bow: 'bow|角色名：角色行礼、作揖',
    spell: 'spell|咒语：挥动魔杖施咒，咒语不超过10字，可省',
    potion: 'potion|魔药名：魔药熬好或调配完成，魔药名可省',
    owl: 'owl|寄件人：猫头鹰送来信件或包裹，寄件人可省',
    broom: 'broom：骑飞天扫帚起飞或掠过天空',
    howler: 'howler|寄件人|怒吼内容：吼叫信当众炸开怒吼，内容不超过40字',
    blackout: 'blackout|旁白：灯闪几下后停电，旁白不超过16字，可省',
    knock: 'knock|次数：敲门或敲击声，次数 1–6，可省',
    murmur: 'murmur|低语内容：耳边的低语，不超过16字',
    brake: 'brake：急刹车',
    depart: 'depart|目的地：车船起步，目的地可省',
    arrive: 'arrive|站名：到站靠岸，站名可省',
    ticket: 'ticket|起点|终点|备注：车票船票，起点备注可省',
    steam: 'steam：浴室水汽涌来',
    shower: 'shower：拧开淋浴',
    splash: 'splash：泼水',
    hairdry: 'hairdry：吹头发',
    dive: 'dive：潜入水下',
    bubble: 'bubble：水下吐出气泡',
    vacuum: 'vacuum：泄压陷入真空',
    say: 'say|角色|小字：头顶冒小字，不超过12字，角色可省',
});

export function dailyGrammarLines(settings) {
    return enabledDailyFxKinds(settings).map((kind) => DAILY_GRAMMAR_LINES[kind]);
}
