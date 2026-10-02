import { enabledDailyFxKinds } from './fx-daily-model.js';

const DAILY_PROMPT_LINES = Object.freeze({
    timeskip: '[igs-fx:timeskip|三小时后]：剧情时间明显跳跃时报幕，文字写经过的时间，如「三小时后」「第二天清晨」',
    photo: '[igs-fx:photo|一句话题字]：角色拍照或合影的瞬间，题字写在照片下方，如[igs-fx:photo|摩天轮前的合影]',
    letter: '[igs-fx:letter|寄件人|信的内容]：收到或读到一封信、情书、交换日记，内容不超过60字',
    note: '[igs-fx:note|便签内容]：发现一张留言便签或字条',
    bell: '[igs-fx:bell]：学校上课、下课或放学铃声响起',
    broadcast: '[igs-fx:broadcast|广播内容]：校园、车站、商场等场所的广播通知',
    fireworks: '[igs-fx:fireworks]：夜空中烟花绽放（夏日祭、跨年等）',
    touch: '[igs-fx:touch|动作]：心动的肢体接触，如牵手、摸头、靠肩、拥抱，动作写两三个字',
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
});

export function dailyGrammarLines(settings) {
    return enabledDailyFxKinds(settings).map((kind) => DAILY_GRAMMAR_LINES[kind]);
}
