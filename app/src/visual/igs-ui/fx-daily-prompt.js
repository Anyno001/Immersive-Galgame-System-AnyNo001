import { enabledDailyFxKinds } from './fx-daily-model.js';
import { CAMPUS_FX_KINDS, COURTESY_FX_KINDS, PLAY_FX_KINDS, WARDROBE_FX_KINDS } from '../../scene/daily-fx-directives.js';

// 衣橱类（换装登场等）走独立的 wardrobe 块，玩乐类（唱歌、游乐…）走独立的 play 块，日常块里都不列。
const isWardrobe = (kind) => WARDROBE_FX_KINDS.includes(kind);
const isPlay = (kind) => PLAY_FX_KINDS.includes(kind);
// 日常块：既不是衣橱类也不是玩乐类才留在每轮必发的日常块里。
const isCourtesy = (kind) => COURTESY_FX_KINDS.includes(kind);
// 校园类（黑板、传纸条、抽屉、点名、考试、文化祭、毕业、纽扣）走独立的 campus 块。
const isCampus = (kind) => CAMPUS_FX_KINDS.includes(kind);
const isDailyBlock = (kind) => !isWardrobe(kind) && !isPlay(kind) && !isCourtesy(kind) && !isCampus(kind);

const DAILY_PROMPT_LINES = Object.freeze({
    timeskip: '[igs-fx:timeskip|三小时后]：剧情时间明显跳跃时报幕，文字写经过的时间，如「第二天清晨」',
    photo: '[igs-fx:photo|一句话题字]：定格拍照或合影的瞬间，题字写在照片下方',
    letter: '[igs-fx:letter|寄件人|信的内容]：收到或读到一封书面传情的文字，内容不超过60字',
    note: '[igs-fx:note|便签内容]：发现一条留给自己的简短留言',
    bell: '[igs-fx:bell]：学校铃声响起的时刻',
    broadcast: '[igs-fx:broadcast|广播内容]：公共场所响起广播通知',
    fireworks: '[igs-fx:fireworks]：夜空中烟花绽放的节庆时刻',
    touch: '[igs-fx:touch|动作]：心动的肢体接触那一刻，动作写两三个字，如「牵手」；战斗中的擒抱、缠斗不算',
    alarm: '[igs-fx:alarm|07:00]：闹钟响起，时间可省略',
    omikuji: '[igs-fx:omikuji|大吉|一句签文]：神社抽签，结果只写 大吉／中吉／小吉／吉／末吉／凶／大凶，签文可省略',
    receipt: '[igs-fx:receipt|物品1、物品2|合计金额|店名]：结账时的小票，物品用顿号分隔，合计与店名可省略',
    tv: '[igs-fx:tv|频道名|播报内容]：电视、新闻或节目画面，频道名可省略',
    rps: '[igs-fx:rps|主角手势|对方手势]：猜拳，手势只写 石头／剪刀／布，胜负由手势决定',
    gacha: '[igs-fx:gacha|扭到的东西]：抽到或夹到一件小奖品的瞬间',
    game: '[igs-fx:game|胜]：一起打电子游戏的一局结束，结果只写 胜／败／平',
    score: '[igs-fx:score|科目|分数]：拿到考试成绩或成绩单，分数写数字',
    pat: '[igs-fx:pat|角色名]：主角摸了摸角色的头',
    poke: '[igs-fx:poke|角色名]：主角捏或戳了一下角色的脸',
    fever: '[igs-fx:fever|38.2]：测量体温、确认是否发烧的时刻，读数写数字',
    cheers: '[igs-fx:cheers]：两人举杯相碰',
    cook: '[igs-fx:cook|料理名]：做好一道菜或便当，料理名写菜名',
    eat: '[igs-fx:eat|食物名|反应]：说话的角色吃下或喝下东西的那一刻，食物名写具体名称；反应只写 好吃、甜、辣、烫、酸、苦、噎住、饱 之一，可省；角色喂对方吃时写「喂」，被对方喂时写「被喂」，如[igs-fx:eat|草莓蛋糕|被喂]',
    cat: '[igs-fx:cat]：与小动物亲昵互动的片刻',
    guqin: '[igs-fx:guqin]：有人抚琴、弹奏古琴',
    go: '[igs-fx:go|胜]：下围棋或对弈的一局结束，结果只写 胜／败／平，可省略',
    poem: '[igs-fx:poem|诗句]：留下诗句或墨宝，诗句不超过28字',
    edict: '[igs-fx:edict|内容]：宣读或张贴官方文告，内容不超过40字',
    tea: '[igs-fx:tea]：递茶、敬茶的礼仪时刻',
    bow: '[igs-fx:bow|角色名]：角色向人行礼致意的那一刻',
    spell: '[igs-fx:spell|咒语]：有人挥动魔杖施咒，咒语写咒文本身，不超过10字，可省略',
    potion: '[igs-fx:potion|魔药名]：坩埚里的魔药熬好或调配完成，魔药名可省略',
    owl: '[igs-fx:owl|寄件人]：猫头鹰飞来送信或包裹，寄件人可省略；信的内容另用 letter 标签',
    broom: '[igs-fx:broom]：骑上飞天扫帚起飞或掠过天空',
    howler: '[igs-fx:howler|寄件人|怒吼内容]：收到一封吼叫信，信封当众炸开、用寄件人的声音怒吼，内容不超过40字',
    blackout: '[igs-fx:blackout|旁白]：灯闪了几下后突然停电、陷入黑暗，旁白写黑暗里的一句感受，不超过16字，可省略',
    knock: '[igs-fx:knock|次数]：门被敲响（或墙里、窗外传来敲击声），次数写 1–6，可省略',
    murmur: '[igs-fx:murmur|低语内容]：耳边突然响起不知从哪来的低语，内容不超过16字',
    brake: '[igs-fx:brake]：交通工具猛地停住或剧烈颠簸、人被甩得一晃的瞬间',
    depart: '[igs-fx:depart|目的地]：交通工具出发、起飞或腾空的时刻，目的地可省略',
    arrive: '[igs-fx:arrive|站名]：交通工具抵达、落地或靠岸的时刻，站名可省略',
    ticket: '[igs-fx:ticket|起点|终点|备注]：拿出或买到出行用的票证，只写一栏时当作终点，备注可省略',
    steam: '[igs-fx:steam]：水汽涌来遮住视线的瞬间',
    shower: '[igs-fx:shower]：水从花洒哗地落下的瞬间',
    splash: '[igs-fx:splash]：水花溅起的嬉闹瞬间',
    hairdry: '[igs-fx:hairdry|角色名]：用吹风机吹头发',
    sleep: '[igs-fx:sleep|旁白]：夜里躺下就寝、一夜睡去，画面渐暗成夜色；旁白写一句入睡的感受，不超过16字，可省略；晕倒、打盹用 eye|close，同一处只写一个',
    wake: '[igs-fx:wake|旁白]：睡了一夜、早上醒来起床，晨光自上而下铺开；旁白可省略；午睡醒、昏迷后苏醒用 eye|open，同一处只写一个',
    dressup: '[igs-fx:dressup|服装名|角色名]：角色换上新装、焕然一新登场的那一刻（含魔法变身），柔光与光点聚拢登场；服装名、角色名可省',
    drape: '[igs-fx:drape|动作|角色名]：替对方整理着装的温柔举动，动作写三四个字（如「披上外套」）；角色名可省',
    fitting: '[igs-fx:fitting|新装名]：对着试衣镜换上新装、照镜打量的那一刻，镜中映出新装；新装名可省',
    dive: '[igs-fx:dive]：跳进水里、潜入水下的那一刻',
    bubble: '[igs-fx:bubble]：在水下说话或叹气，吐出一串气泡',
    vacuum: '[igs-fx:vacuum]：舱门打开、空气泄光，四周陷入真空的寂静',
    sing: '[igs-fx:sing|歌名]：有人开口唱歌的那一刻，歌名可省略',
    dance: '[igs-fx:dance|舞种]：翩翩起舞或共舞的那一刻，舞种可省略',
    fish: '[igs-fx:fish|钓到的鱼]：垂钓、浮漂一沉有东西上钩的那一刻，钓到的鱼可省略',
    draw: '[igs-fx:draw|画的内容]：动笔作画、落笔成形的那一刻，画的内容可省略',
    music: '[igs-fx:music|乐器]：演奏乐器的那一刻，乐器名可省略；抚古琴用 guqin',
    ride: '[igs-fx:ride|设施名]：乘上游乐设施的时刻，设施名可省略',
    clean: '[igs-fx:clean]：打扫收拾、窗明几净的那一刻',
    shopping: '[igs-fx:shopping|买到的东西]：逛街购物、满载而归，买到的东西可省略',
    stroll: '[igs-fx:stroll]：两人并肩散步、信步而行的闲适时刻',
    yujian: '[igs-fx:yujian]：修士御剑飞行、飞剑掠空的那一刻，一道剑光斜掠而过',
    liandan: '[igs-fx:liandan|成]：开炉炼丹，炉烟盘升；结果只写 成 或 败，可省略',
    biguan: '[igs-fx:biguan|境界]：闭关、吐纳、打坐入定，气旋随息涨落；境界（如「筑基」）可省略',
    dianxue: '[igs-fx:dianxue]：以指力制住或解开对方穴道，指尖一点涟漪把人定住',
    qinggong: '[igs-fx:qinggong]：施展轻功、纵身飞檐走壁，身后拖出残影与落叶',
    yungong: '[igs-fx:yungong|成]：运功疗伤、调息，掌心泛起青光；结果只写 成 或 败，可省略',
    opendoor: '[igs-fx:opendoor|动作|角色名]：为对方让路、替对方做小事的体贴动作那一刻，动作写四五个字（如「替你开门」），角色名可省略',
    shield: '[igs-fx:shield|动作|角色名]：把对方护在身侧、替对方挡下危险的那一刻，动作写四五个字（如「护在身前」），角色名可省略',
    tend: '[igs-fx:tend|动作|角色名]：低头照料对方细处的举动，动作写四五个字（如「系好鞋带」），角色名可省略',
    carry: '[igs-fx:carry|动作|角色名]：把对方整个抱起或背起的那一刻，动作写三四个字（如「公主抱」），角色名可省略',
    candle: '[igs-fx:candle|烛/灯/香|角色名]：点燃蜡烛、掌起宫灯或焚香上香的那一刻，火光亮起；种类只写 烛、灯、香，可省略（默认烛）',
    pass: '[igs-fx:pass|物品|接物角色]：递出一样东西、对方接过的那一刻，物品写两三个字，接物角色可省略',
    stance: '[igs-fx:stance|姿态|角色名]：尊卑或亲近的身段变化，姿态只写 跪拜、侍立、上座、并肩、依偎、俯身；角色名省略时是当前说话人',
    console: '[igs-fx:console|游戏名|平台]：在家开机、开始玩游戏机的那一刻，屏幕光映在脸上、房间偏暗；游戏名与平台可省略；一局的结果用 game 标签',
    versus: '[igs-fx:versus|1P名|2P名|1P血量|2P血量]：两人对战、分出高下的时刻，屏幕上方出现双方血条；名字可省略，血量写 0–100 的数字、可省略，写 0 即被击倒',
    combo: '[igs-fx:combo|连击数|招式名]：手速爆发、连续命中的那一刻，连击数写数字（2–999），招式名，都可省略',
    snatch: '[igs-fx:snatch|动作|角色名]：游戏里争抢或耍赖的那一刻，动作写两三个字（如「抢手柄」），可省略；角色名可省略',
    say: '[igs-fx:say|角色|小字]：角色头顶冒出一句小字（嘀咕、吐槽、心声），不超过12字；角色省略时是当前说话人',
    chalk: '[igs-fx:chalk|板书内容]：有人在黑板上写字、板书的那一刻，粉笔一路划过、字迹逐字浮现；内容不超过20字，可省略',
    passnote: '[igs-fx:passnote|纸条内容]：课堂上悄悄传递纸条、对方展开来读的那一刻；内容必填，不超过30字；留给自己的便签留言用 note',
    drawer: '[igs-fx:drawer|物品]：翻开抽屉、鞋柜，意外发现别人留下的信或礼物的那一刻；物品写两三个字，含 信／书／卡／纸／条／笺／贺 之一画成信封，其余画成礼物盒，可省略',
    rollcall: '[igs-fx:rollcall|名字|应答]：被老师点到名字、当众被叫起来的那一刻，聚光压在这个人身上；名字、应答（一两个字）都可省略',
    exam: '[igs-fx:exam|科目|时长]：考试开考、试卷发到手上的紧张时刻；科目、时长（分钟数）可省略；成绩公布用 score',
    festival: '[igs-fx:festival|名称|副标题]：文化祭、社团活动或校园庆典开场的热闹时刻；名称默认「文化祭」，副标题如「开幕！」，均可省略',
    graduate: '[igs-fx:graduate|典礼字样]：毕业或入学典礼的仪式感时刻，樱花飘落；字样含 入学／开学／新生／迎新 之一是入学典礼（不抛学士帽），否则按毕业；可省略',
    button: '[igs-fx:button|角色名]：毕业时把制服的第二颗纽扣交给心上人的那一刻；角色名可省略',
});

export function resolveDailyFxPromptRule(settings) {
    const kinds = enabledDailyFxKinds(settings).filter(isDailyBlock);
    if (!kinds.length) return '';
    const lines = kinds.map((kind, index) => `${index + 1}. ${DAILY_PROMPT_LINES[kind]}`);
    return `【日常演出】点缀日常场景时使用：

${lines.join('\n')}

语法要求：只在剧情里确实发生对应事件时使用，每层回复最多2个，不要每层都用。`;
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
    const kinds = enabledDailyFxKinds(settings).filter(isDailyBlock);
    if (!kinds.length) return '';
    const examples = DAILY_DETAILED_EXAMPLES.filter(([kind]) => kinds.includes(kind)).slice(0, 2).map(([, rows]) => rows.join('\n'));
    return `【日常演出】以下日常演出标签用于点缀日常场景，完整写法照抄方括号格式：
${kinds.map((kind, index) => `${index + 1}. ${DAILY_PROMPT_LINES[kind]}`).join('\n')}
使用约束：
1. 剧情里确实发生对应事件时就主动用，不必等用户要求；每层回复最多2个，不要每层都用
2. 标签之外，正文仍要把事情完整写出来${examples.length ? `\n示例：\n${examples.join('\n\n')}` : ''}`;
}

// 衣橱类的详细块：换装登场等，和日常块分开，只在提到换衣时注入。
export function wardrobeDetailedBlock(settings) {
    const kinds = enabledDailyFxKinds(settings).filter((kind) => isWardrobe(kind));
    if (!kinds.length) return '';
    return `【换装登场】角色换上新装、焕然一新登场时使用，完整写法照抄方括号格式：
${kinds.map((kind, index) => `${index + 1}. ${DAILY_PROMPT_LINES[kind]}`).join('\n')}
使用约束：剧情里角色确实换装、变身登场时才用，每层最多1个；标签之外正文仍要把换装写出来。`;
}

export const DAILY_GRAMMAR_LINES = Object.freeze({
    timeskip: 'timeskip|三小时后：剧情时间明显跳跃时报幕',
    photo: 'photo|题字：拍照或合影的瞬间',
    letter: 'letter|寄件人|信的内容：收到或读到书信，不超过60字',
    note: 'note|便签内容：发现留言便签或字条',
    bell: 'bell：学校铃声响起',
    broadcast: 'broadcast|广播内容：公共场所的广播',
    fireworks: 'fireworks：夜空中烟花绽放',
    touch: 'touch|动作：心动的肢体接触，动作写两三个字',
    alarm: 'alarm|07:00：闹钟响起，时间可省',
    omikuji: 'omikuji|大吉|签文：神社抽签，结果只写 大吉/中吉/小吉/吉/末吉/凶/大凶，签文可省',
    receipt: 'receipt|物品1、物品2|合计金额|店名：结账小票，合计与店名可省',
    tv: 'tv|频道名|播报内容：电视、新闻或节目画面，频道名可省',
    rps: 'rps|主角手势|对方手势：猜拳，手势只写 石头/剪刀/布',
    gacha: 'gacha|扭到的东西：抽到或夹到小奖品',
    game: 'game|胜：一起打游戏的一局结束，结果只写 胜/败/平',
    score: 'score|科目|分数：拿到考试成绩，分数写数字',
    pat: 'pat|角色名：主角摸了摸角色的头',
    poke: 'poke|角色名：主角捏或戳了一下角色的脸',
    fever: 'fever|38.2：测体温，读数写数字',
    cheers: 'cheers：两人举杯相碰',
    cook: 'cook|料理名：做好一道菜或便当',
    eat: 'eat|食物名|反应：说话的角色吃下或喝下东西的那一刻，反应只写 好吃/甜/辣/烫/酸/苦/噎住/饱 之一，可省；喂对方写「喂」，被喂写「被喂」',
    cat: 'cat：与小动物亲昵',
    guqin: 'guqin：有人抚琴',
    go: 'go|胜：对弈一局结束，结果只写 胜/败/平，可省',
    poem: 'poem|诗句：留下诗句或墨宝，不超过28字',
    edict: 'edict|内容：宣读或张贴文告，不超过40字',
    tea: 'tea：奉茶、敬茶',
    bow: 'bow|角色名：行礼致意',
    spell: 'spell|咒语：挥动魔杖施咒，咒语不超过10字，可省',
    potion: 'potion|魔药名：魔药熬好或调配完成，魔药名可省',
    owl: 'owl|寄件人：猫头鹰送来信件或包裹，寄件人可省',
    broom: 'broom：骑飞天扫帚起飞或掠过天空',
    howler: 'howler|寄件人|怒吼内容：吼叫信当众炸开怒吼，内容不超过40字',
    blackout: 'blackout|旁白：灯闪几下后停电，旁白不超过16字，可省',
    knock: 'knock|次数：敲门或敲击声，次数 1–6，可省',
    murmur: 'murmur|低语内容：耳边的低语，不超过16字',
    brake: 'brake：交通工具急停或颠簸',
    depart: 'depart|目的地：交通工具出发或起飞，目的地可省',
    arrive: 'arrive|站名：交通工具抵达，站名可省',
    ticket: 'ticket|起点|终点|备注：出行票证，起点备注可省',
    steam: 'steam：水汽涌来遮视线',
    shower: 'shower：淋浴水落下',
    splash: 'splash：水花四溅',
    hairdry: 'hairdry：吹头发',
    sleep: 'sleep|旁白：夜里就寝，画面渐暗，旁白不超过16字可省；晕倒打盹用 eye|close',
    wake: 'wake|旁白：一夜后早上起床，晨光铺开，旁白可省；午睡昏迷醒来用 eye|open',
    dressup: 'dressup|服装名|角色名：换新装登场（含变身），均可省',
    drape: 'drape|动作|角色名：替对方整理着装，动作三四字，角色名可省',
    fitting: 'fitting|新装名：对着试衣镜换上新装照镜，新装名可省',
    dive: 'dive：潜入水下',
    bubble: 'bubble：水下吐出气泡',
    vacuum: 'vacuum：泄压陷入真空',
    sing: 'sing|歌名：有人唱歌，歌名可省',
    dance: 'dance|舞种：起舞或共舞，舞种可省',
    fish: 'fish|钓到的鱼：垂钓上钩的那一刻，鱼可省',
    draw: 'draw|画的内容：落笔成形，内容可省',
    music: 'music|乐器：演奏乐器，乐器可省；古琴用 guqin',
    ride: 'ride|设施名：乘游乐设施，设施名可省',
    clean: 'clean：打扫收拾',
    shopping: 'shopping|买到的东西：逛街购物，物品可省',
    stroll: 'stroll：两人并肩散步',
    yujian: 'yujian：御剑飞行',
    liandan: 'liandan|成：开炉炼丹，成败可省',
    biguan: 'biguan|境界：闭关吐纳，境界可省',
    dianxue: 'dianxue：制住或解开穴道',
    qinggong: 'qinggong：施展轻功',
    yungong: 'yungong|成：运功疗伤，成败可省',
    opendoor: 'opendoor|动作|角色名：为对方让路、做体贴小事，角色名可省',
    shield: 'shield|动作|角色名：护对方周全，角色名可省',
    tend: 'tend|动作|角色名：低头照料对方细处，角色名可省',
    carry: 'carry|动作|角色名：抱起或背起对方，角色名可省',
    candle: 'candle|烛/灯/香|角色名：点燃火光，种类只写 烛/灯/香，均可省',
    pass: 'pass|物品|接物角色：递出并被接过一样东西，接物角色可省',
    stance: 'stance|姿态|角色名：跪拜/侍立/上座/并肩/依偎/俯身，角色可省',
    console: 'console|游戏名|平台：在家开机玩游戏，均可省；结果用 game',
    versus: 'versus|1P名|2P名|1P血量|2P血量：双人对战，血量 0–100 可省，0 即击倒',
    combo: 'combo|连击数|招式名：连击爆发，连击数 2–999 可省',
    snatch: 'snatch|动作|角色名：游戏里争抢或耍赖，均可省',
    say: 'say|角色|小字：头顶冒小字，不超过12字，角色可省',
    chalk: 'chalk|板书内容：在黑板上写字，不超过20字，可省',
    passnote: 'passnote|纸条内容：课堂传纸条，不超过30字；留言便签用 note',
    drawer: 'drawer|物品：抽屉里发现信或礼物，含 信/书/卡/纸/条/笺/贺 画信封，其余画礼物盒，可省',
    rollcall: 'rollcall|名字|应答：被点名叫起来，均可省',
    exam: 'exam|科目|时长：考试发卷开考，均可省；成绩用 score',
    festival: 'festival|名称|副标题：文化祭或社团活动开场，均可省',
    graduate: 'graduate|典礼字样：毕业或入学典礼，含 入学/开学/新生/迎新 是入学（不抛帽），可省',
    button: 'button|角色名：赠送第二颗纽扣，可省',
});

export function dailyGrammarLines(settings) {
    return enabledDailyFxKinds(settings).filter(isDailyBlock).map((kind) => DAILY_GRAMMAR_LINES[kind]);
}

// 衣橱类的精简语法行（换装登场等），单独走 wardrobe 触发块，不占日常预算。
export function wardrobeGrammarLines(settings) {
    return enabledDailyFxKinds(settings).filter((kind) => isWardrobe(kind)).map((kind) => DAILY_GRAMMAR_LINES[kind]);
}

// 玩乐类的精简语法行（唱歌、游乐…），单独走 play 触发块，不占日常预算。
export function playGrammarLines(settings) {
    return enabledDailyFxKinds(settings).filter((kind) => isPlay(kind)).map((kind) => DAILY_GRAMMAR_LINES[kind]);
}

// 玩乐类的详细块：唱歌、跳舞、游乐设施等，和日常块分开，只在提到对应活动时注入。
export function playDetailedBlock(settings) {
    const kinds = enabledDailyFxKinds(settings).filter((kind) => isPlay(kind));
    if (!kinds.length) return '';
    return `【玩乐演出】一起玩乐、消遣时使用，完整写法照抄方括号格式：
${kinds.map((kind, index) => `${index + 1}. ${DAILY_PROMPT_LINES[kind]}`).join('\n')}
使用约束：剧情里确实发生对应活动时才用，每层最多1个；标签之外正文仍要把活动写出来。`;
}

// 体贴礼仪类的精简语法行：开门礼让、护身、照料、公主抱，及点灯烛火 / 递接 / 站位身段积木，单独走 courtesy 触发块。
export function courtesyGrammarLines(settings) {
    return enabledDailyFxKinds(settings).filter((kind) => isCourtesy(kind)).map((kind) => DAILY_GRAMMAR_LINES[kind]);
}

export function courtesyDetailedBlock(settings) {
    const kinds = enabledDailyFxKinds(settings).filter((kind) => isCourtesy(kind));
    if (!kinds.length) return '';
    return `【体贴礼仪】约会的体贴动作与宫廷、尊卑场合的烛火、递接、站位身段，完整写法照抄方括号格式：
${kinds.map((kind, index) => `${index + 1}. ${DAILY_PROMPT_LINES[kind]}`).join('\n')}
使用约束：剧情里确实发生对应动作时才用，每层最多1个；标签之外正文仍要把动作写出来。`;
}

// 校园类的精简语法行（黑板、传纸条、抽屉、点名、考试、文化祭、毕业、纽扣），单独走 campus 触发块，不占日常预算。
// 校园里的铃声 bell、广播 broadcast、成绩 score、便签 note、信件 letter 仍在日常块。
export function campusGrammarLines(settings) {
    return enabledDailyFxKinds(settings).filter((kind) => isCampus(kind)).map((kind) => DAILY_GRAMMAR_LINES[kind]);
}

export function campusDetailedBlock(settings) {
    const kinds = enabledDailyFxKinds(settings).filter((kind) => isCampus(kind));
    if (!kinds.length) return '';
    return `【校园演出】学校与校园生活里的小场面，完整写法照抄方括号格式：
${kinds.map((kind, index) => `${index + 1}. ${DAILY_PROMPT_LINES[kind]}`).join('\n')}
使用约束：剧情里确实发生对应场面时才用，每层最多1个；上下课铃用 bell、广播用 broadcast、成绩用 score；标签之外正文仍要把场面写出来。`;
}
