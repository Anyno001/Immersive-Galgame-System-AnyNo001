// 麻将牌桌的台词：每个键是牌桌上真会发生的一刻，带局势或牌型的键排在前面，挑不到再退回基础键。
// 句子里可以写 {对方}{牌}{番}{点}，说话时换成实际的人、牌和分；{对方} 按说话人对那个人的称呼替换。
// 句首可带 [表情]，说话时头像换成这个表情。

export const VOICE_MOODS = Object.freeze(['平和', '喜悦', '愤怒', '悲伤', '惊讶', '害羞', '紧张', '思考']);
const SLOT_RE = /\{([^{}]*)\}/g;
const SLOTS = new Set(['对方', '牌', '番', '点']);
const MOOD_RE = new RegExp(`^\\s*[\\[【](${VOICE_MOODS.join('|')})[\\]】]\\s*`);
export const LINE_MAX = 28;

// [键, 什么时候说, 能用的占位符, 默认表情]；★ 是特殊牌型，写一两句就够。
const RIICHI_TABLE = [
    ['open.first', '第一局开局，对玩家放一句话（{对方}是玩家）', '对方', '平和'],
    ['open.tilt', '上一局被打急了，这一局开局', '', '愤怒'],
    ['open.shrink', '上一局被吓到了，这一局开局', '', '紧张'],
    ['open.lead', '最后一局，她领先', '', '喜悦'],
    ['open.behind', '最后一局，她垫底', '', '紧张'],
    ['riichi', '她立直', '', '喜悦'],
    ['riichi.chase', '别人先立直了，她追立（{对方}是先立直的人）', '对方', '喜悦'],
    ['riichi.allin', '大比分落后时孤注一掷地立直', '', '紧张'],
    ['threat', '别人立直了，她感到压力（{对方}是立直的人）', '对方', '紧张'],
    ['call', '她吃或碰（{对方}是打出这张的人）', '对方 牌', '平和'],
    ['kan', '她开杠', '牌', '喜悦'],
    ['stolen', '她打的牌被别人吃碰走（{对方}是拿走的人）', '对方 牌', '愤怒'],
    ['fold', '局势危险，她决定弃和', '', '紧张'],
    ['push', '顶着别人的立直硬打危险牌（{对方}是立直的人）', '对方', '思考'],
    ['win.ron', '她荣和（{对方}是放铳的人）', '对方 牌 点', '喜悦'],
    ['win.tsumo', '她自摸和牌', '点', '喜悦'],
    ['win.dama', '她没立直默听，别人没察觉就和了（荣和时{对方}是放铳的人）', '对方 点', '喜悦'],
    ['win.cheap', '她和了小牌（2000 点以下）', '点', '平和'],
    ['win.big', '她和了满贯以上的大牌', '点', '喜悦'],
    ['win.yakuman', '她和了役满', '点', '惊讶'],
    ['win.comeback', '她落后时一把和牌翻上来', '点', '喜悦'],
    ['win.revenge', '她荣和了之前让她放铳的人（{对方}）', '对方 点', '喜悦'],
    ['dealIn', '她放铳（{对方}是和牌的人）', '对方 牌', '悲伤'],
    ['dealIn.big', '她放铳了满贯以上的大牌', '对方 点', '悲伤'],
    ['dealIn.dama', '她放铳给没立直的默听', '对方', '惊讶'],
    ['dealIn.again', '她这一场又一次放铳', '对方', '悲伤'],
    ['tsumoed', '别人自摸了大牌，她跟着赔分（{对方}是自摸的人）', '对方 点', '悲伤'],
    ['react.big', '她看着别人和了大牌（{对方}是和牌的人）', '对方 点', '惊讶'],
    ['draw.tenpai', '荒牌流局，她听着牌', '', '平和'],
    ['draw.noten', '荒牌流局，她没听牌要罚分', '', '悲伤'],
    ['draw.abort', '中途流局（九种九牌、四风连打、四杠散了、四家立直、三家和）', '', '惊讶'],
    ['draw.nagashi', '★流局满贯：她牌河里全是幺九字牌', '', '喜悦'],
    ['final.top', '整场打完她第一（{对方}是最后一名）', '对方', '喜悦'],
    ['final.last', '整场打完她垫底（{对方}是第一名）', '对方', '悲伤'],
    ['yaku.天和', '★天和', '', '惊讶'],
    ['yaku.地和', '★地和', '', '惊讶'],
    ['yaku.国士无双', '★国士无双', '对方', '惊讶'],
    ['yaku.九莲宝灯', '★九莲宝灯', '', '惊讶'],
    ['yaku.四暗刻', '★四暗刻', '', '喜悦'],
    ['yaku.大三元', '★大三元', '', '喜悦'],
    ['yaku.四喜和', '★大四喜或小四喜', '', '喜悦'],
    ['yaku.字一色', '★字一色', '', '喜悦'],
    ['yaku.岭上开花', '★岭上开花', '', '喜悦'],
    ['yaku.抢杠', '★抢杠（{对方}是加杠被抢的人）', '对方', '喜悦'],
    ['yaku.海底摸月', '★海底摸月', '', '喜悦'],
    ['yaku.河底捞鱼', '★河底捞鱼', '对方', '喜悦'],
    ['yaku.两立直', '★两立直和牌', '', '喜悦'],
    ['yaku.一发', '★一发', '', '喜悦'],
    ['yaku.清一色', '★清一色', '点', '喜悦'],
    ['yaku.混一色', '★混一色', '', '喜悦'],
    ['yaku.七对子', '★七对子', '', '喜悦'],
    ['yaku.对对和', '★对对和', '', '喜悦'],
    ['yaku.一气通贯', '★一气通贯', '', '喜悦'],
    ['yaku.三色同顺', '★三色同顺', '', '喜悦'],
];

const CHENGDU_TABLE = [
    ['open.first', '第一局开局，对玩家放一句话（{对方}是玩家）', '对方', '平和'],
    ['open.tilt', '上一局被打急了，这一局开局', '', '愤怒'],
    ['open.shrink', '上一局被吓到了，这一局开局', '', '紧张'],
    ['open.lead', '最后一局，她分数领先', '', '喜悦'],
    ['open.behind', '最后一局，她分数垫底', '', '紧张'],
    ['peng', '她碰（{对方}是打出这张的人）', '对方 牌', '平和'],
    ['gang.an', '她暗杠', '牌', '喜悦'],
    ['gang.dian', '她点杠，杠别人打出的牌（{对方}是打出的人）', '对方 牌', '喜悦'],
    ['gang.wan', '她弯杠，碰过的牌摸到第四张补杠', '牌', '喜悦'],
    ['stolen', '她打的牌被人碰走（{对方}是碰的人）', '对方 牌', '愤怒'],
    ['fanggang', '她打的牌被人杠走，要赔杠钱（{对方}是杠的人）', '对方 牌', '悲伤'],
    ['fold', '有人要胡了，她拆牌躲炮', '', '紧张'],
    ['push', '明知危险还硬打', '', '思考'],
    ['guohu', '能胡却放过这一炮，等更大的（{对方}是打出的人）', '对方 牌', '思考'],
    ['duel', '场上只剩她和另一家没胡，血战到底（{对方}是另一家）', '对方', '紧张'],
    ['win.zimo', '她自摸', '番', '喜悦'],
    ['win.ron', '她接炮胡（{对方}是点炮的人）', '对方 牌 番', '喜悦'],
    ['win.first', '她是这一局第一个胡的', '番', '喜悦'],
    ['win.cheap', '她胡了小牌（1 番以下）', '番', '平和'],
    ['win.big', '她胡了 3 番以上的大牌', '番', '喜悦'],
    ['win.comeback', '她分数落后时胡牌追分', '番', '喜悦'],
    ['win.revenge', '她胡了之前让她点炮的人（{对方}）', '对方 番', '喜悦'],
    ['win.last', '血战只剩两家时她胡了（{对方}是剩下的那家）', '对方 番', '喜悦'],
    ['dealIn', '她点炮（{对方}是胡的人）', '对方 牌', '悲伤'],
    ['dealIn.big', '她点了 3 番以上的大炮', '对方 番', '悲伤'],
    ['dealIn.multi', '一炮多响：她打的一张被两家以上同时胡', '', '惊讶'],
    ['dealIn.again', '她这一场又一次点炮', '对方', '悲伤'],
    ['robbed', '她补杠时被人抢杠胡（{对方}是胡的人）', '对方 牌', '惊讶'],
    ['tsumoed', '别人自摸了大牌，她跟着赔（{对方}是自摸的人）', '对方 番', '悲伤'],
    ['react.big', '她看着别人胡了大牌（{对方}是胡的人）', '对方 番', '惊讶'],
    ['chajiao', '流局查叫，她听着牌收钱', '', '喜悦'],
    ['beichajiao', '流局查叫，她没听牌要赔', '', '悲伤'],
    ['drawgame', '这一局谁都没胡', '', '平和'],
    ['final.top', '四局打完她第一（{对方}是最后一名）', '对方', '喜悦'],
    ['final.last', '四局打完她垫底（{对方}是第一名）', '对方', '悲伤'],
    ['pattern.天胡', '★天胡', '', '惊讶'],
    ['pattern.地胡', '★地胡', '对方', '惊讶'],
    ['pattern.杠上花', '★杠上花', '', '喜悦'],
    ['pattern.杠上炮', '★杠上炮（{对方}是杠完点炮的人）', '对方', '喜悦'],
    ['pattern.抢杠胡', '★抢杠胡（{对方}是被抢的人）', '对方', '喜悦'],
    ['pattern.海底', '★海底胡', '', '喜悦'],
    ['pattern.清一色', '★清一色', '番', '喜悦'],
    ['pattern.龙七对', '★龙七对', '', '喜悦'],
    ['pattern.七对', '★七对', '', '喜悦'],
    ['pattern.将对', '★将对', '', '喜悦'],
    ['pattern.金钩胡', '★金钩胡（手里只剩一张单吊）', '', '喜悦'],
    ['pattern.碰碰胡', '★碰碰胡', '', '喜悦'],
];

function keyTable(rows) {
    const out = {};
    for (const [key, label, slots, mood] of rows) {
        out[key] = Object.freeze({ label, slots: Object.freeze(slots ? slots.split(' ') : []), mood, special: label.startsWith('★') });
    }
    return Object.freeze(out);
}

export const VOICE_KEYS = Object.freeze({ riichi: keyTable(RIICHI_TABLE), chengdu: keyTable(CHENGDU_TABLE) });

const GENERIC = {
    riichi: {
        'open.first': ['{对方}，请多指教。今天可不会让着你。', '难得凑齐一桌，好好打吧。'],
        'open.tilt': ['刚才那把不算，这局要讨回来。', '……我现在心情很差，别惹我。'],
        'open.shrink': ['这局……稳一点打吧。', '刚才吓到了，先别冒险。'],
        'open.lead': ['最后一局了，守住就是我的。', '名次先放我这儿了。'],
        'open.behind': ['最后一局，只能拼了。', '还没结束，翻盘就看这把。'],
        riichi: ['立直！', '听牌了，就等这一张。'],
        'riichi.chase': ['{对方}先立？那我也立！', '追立。看谁先摸到。'],
        'riichi.allin': ['只能赌这一把了，立直！', '不立就没机会了，立直。'],
        threat: ['{对方}立直了……得小心。', '来了啊，{对方}的立直。'],
        call: ['{牌}，我要了。', '这张正好，鸣了。'],
        kan: ['{牌}，开杠！', '杠。宝牌多翻一张。'],
        stolen: ['啊，被{对方}拿去了。', '{对方}……这张也要？'],
        fold: ['这把不行，先躲着。', '太危险了，我退。'],
        push: ['这张……赌一下。', '{对方}的立直？管不了那么多了。'],
        'win.ron': ['荣和！{对方}，这张我收下了。', '就是{牌}，和了。'],
        'win.tsumo': ['自摸！', '摸到了，自摸和。'],
        'win.dama': ['没想到吧，我早就听了。', '默听哦，{对方}没发现吧？'],
        'win.cheap': ['小是小了点，先拿下。', '{点}点，够用了。'],
        'win.big': ['{点}点！这把大了！', '满贯以上，赚到了。'],
        'win.yakuman': ['役、役满……是真的？', '这辈子能见几回役满啊。'],
        'win.comeback': ['翻上来了！还没完呢。', '{点}点，名次要变了哦。'],
        'win.revenge': ['{对方}，刚才那笔还给你。', '报仇了，{对方}。'],
        dealIn: ['呜……点给{对方}了。', '偏偏是{牌}……'],
        'dealIn.big': ['{点}点……心好痛。', '居然放了这么大的铳给{对方}……'],
        'dealIn.dama': ['{对方}没立直怎么就听了！', '默听？太狡猾了吧。'],
        'dealIn.again': ['又是我放铳……', '{对方}，你是盯上我了吧？'],
        tsumoed: ['被{对方}自摸了{点}点……', '自摸这么大，我也要赔啊。'],
        'react.big': ['{对方}这把好大……', '{点}点？{对方}好厉害。'],
        'draw.tenpai': ['流局了，好在我听着。', '听牌了，罚符拿来。'],
        'draw.noten': ['没听……要罚了。', '这把一直没进张。'],
        'draw.abort': ['这样也能流局？', '这局作废了啊。'],
        'draw.nagashi': ['流局满贯！牌河全是幺九哦。', '一张中张都没打，满贯拿来。'],
        'final.top': ['第一是我的了。', '{对方}，下次再来挑战吧。'],
        'final.last': ['垫底了……下次一定。', '{对方}，下次绝对赢你。'],
        'yaku.天和': ['[惊讶]起手就和了……天和？', '天和！发牌就和了？！'],
        'yaku.地和': ['第一巡就和了，地和！', '地和……运气全用光了吧。'],
        'yaku.国士无双': ['国士无双！十三种幺九齐了！', '十三张幺九，一张不缺。'],
        'yaku.九莲宝灯': ['九莲宝灯……手在抖。', '九莲宝灯，听说做完会倒霉的。'],
        'yaku.四暗刻': ['四暗刻，四个刻子全是自己摸的。', '四暗刻！门清做出来了。'],
        'yaku.大三元': ['白发中全齐，大三元！', '三元牌都是我的，大三元。'],
        'yaku.四喜和': ['东南西北全拿下，四喜和！', '四风齐了，四喜！'],
        'yaku.字一色': ['全是字牌，字一色！', '一张数牌都没有哦，字一色。'],
        'yaku.岭上开花': ['杠完摸上来就和，岭上开花！', '岭上开花，这张是送上门的。'],
        'yaku.抢杠': ['{对方}的加杠，我抢了！', '抢杠！那张正好是我要的。'],
        'yaku.海底摸月': ['最后一张摸到了，海底摸月！', '海底摸月，就差这一张。'],
        'yaku.河底捞鱼': ['最后一张打出来，河底捞鱼！', '{对方}的最后一张，我和了。'],
        'yaku.两立直': ['一上来就两立直，然后和了！', '两立直，起手就听牌了。'],
        'yaku.一发': ['一发！立直下一巡就来了。', '一发和，运气不错吧？'],
        'yaku.清一色': ['一色到底，清一色！', '全是一门牌，清一色。'],
        'yaku.混一色': ['一门加字牌，混一色。', '混一色，凑得刚刚好。'],
        'yaku.七对子': ['七个对子，七对子！', '对子凑满七个了。'],
        'yaku.对对和': ['全是刻子，对对和！', '碰到底，对对和。'],
        'yaku.一气通贯': ['一到九连成一条，一气通贯！', '一条龙，通了。'],
        'yaku.三色同顺': ['三门同样的顺子，三色！', '三色同顺，好看吧？'],
    },
    chengdu: {
        'open.first': ['{对方}，血战开打，别手软。', '四局血战，看谁笑到最后。'],
        'open.tilt': ['刚才点的炮，这把全胡回来。', '这把一个都不放过。'],
        'open.shrink': ['这把先把缺门打干净，别点炮。', '收着打，先苟住。'],
        'open.lead': ['最后一把，分我先拿着。', '守到查叫就是我的。'],
        'open.behind': ['最后一把了，必须胡个大的。', '分是负的，这把拼了。'],
        peng: ['碰！{牌}拿来。', '{对方}，这张碰了。'],
        'gang.an': ['{牌}四张，暗杠！', '暗杠，下雨了哦。'],
        'gang.dian': ['{对方}打的{牌}，杠！', '点杠，{对方}给钱。'],
        'gang.wan': ['{牌}摸到了，补杠！', '弯杠，碰的那组补上。'],
        stolen: ['{对方}碰走了我的{牌}。', '啊，{对方}要这张。'],
        fanggang: ['{牌}被{对方}杠了……杠钱要出。', '点杠了，亏一笔。'],
        fold: ['这张要点炮，拆了打别的。', '有人叫了，先打熟张。'],
        push: ['管他的，这张出！', '血战到底，不躲。'],
        guohu: ['这炮不要，等自摸。', '{对方}的{牌}，放你一马。'],
        duel: ['只剩我和{对方}了。', '血战到底，{对方}，来吧。'],
        'win.zimo': ['自摸！还在桌上的都给钱。', '摸到了，自摸胡。'],
        'win.ron': ['胡！{对方}的{牌}。', '{对方}，点炮了哦。'],
        'win.first': ['第一个胡，先走一步。', '我先胡了，你们慢慢打。'],
        'win.cheap': ['平胡，先下桌。', '小是小，胡了再说。'],
        'win.big': ['{番}番！大的来了！', '这把番数够了。'],
        'win.comeback': ['分追回来了！', '这把胡完，形势就变了。'],
        'win.revenge': ['{对方}，上把的炮还你。', '刚才点给你，现在胡你。'],
        'win.last': ['血战到最后，是我赢了，{对方}。', '最后一个胡的是我。'],
        dealIn: ['点炮了……给{对方}。', '{牌}居然是炮……'],
        'dealIn.big': ['{番}番的炮……亏大了。', '给{对方}点了个大炮……'],
        'dealIn.multi': ['一炮多响……怎么都胡这张！', '一张牌点了好几家……'],
        'dealIn.again': ['又点炮了……', '{对方}，你专胡我是吧？'],
        robbed: ['我的杠被{对方}抢了！', '补杠补出一个炮……'],
        tsumoed: ['{对方}自摸{番}番，又要掏钱。', '被{对方}自摸了，痛。'],
        'react.big': ['{对方}这把胡得好大……', '{番}番？{对方}厉害了。'],
        chajiao: ['查叫，我听着牌呢。', '牌摸完了，我有叫。'],
        beichajiao: ['没叫……被查了。', '查叫要赔……'],
        drawgame: ['一局下来谁都没胡。', '这把黄了。'],
        'final.top': ['四局血战，我是第一。', '{对方}，下次血战再来。'],
        'final.last': ['垫底了……下次血战再来。', '{对方}，等着，我会胡回来。'],
        'pattern.天胡': ['[惊讶]起手就胡了，天胡！', '天胡……牌还没打就胡了。'],
        'pattern.地胡': ['第一张就胡，地胡！', '{对方}第一张就点了，地胡。'],
        'pattern.杠上花': ['杠完摸上来就胡，杠上花！', '杠上开花，好兆头。'],
        'pattern.杠上炮': ['{对方}杠完打的炮，我胡了！', '杠上炮，{对方}这张送得好。'],
        'pattern.抢杠胡': ['{对方}补杠？抢了！', '抢杠胡，这张我等很久了。'],
        'pattern.海底': ['最后一张，海底胡！', '牌墙最后一张也能胡。'],
        'pattern.清一色': ['一门到底，清一色！', '清一色，番数翻上去了。'],
        'pattern.龙七对': ['七对里还藏着一根，龙七对！', '龙七对，四张一样的拆成对子。'],
        'pattern.七对': ['七个对子，胡了！', '七对，刚刚好。'],
        'pattern.将对': ['全是二五八，将对！', '将对，碰碰胡还全是将。'],
        'pattern.金钩胡': ['手里只剩一张，钓到了！', '金钩钓，单吊胡了。'],
        'pattern.碰碰胡': ['碰碰胡，全是刻子！', '碰到底，碰碰胡。'],
    },
};

const STYLED = {
    riichi: {
        steady: {
            'open.first': ['{对方}，请多指教。按规矩来就好。'],
            'open.tilt': ['……刚才是我判断错了，这局修正。'],
            'open.shrink': ['先把防守做好，再说别的。'],
            'open.lead': ['最后一局，不贪，稳着收尾。'],
            'open.behind': ['分差还能算，一步一步追。'],
            riichi: ['立直。牌效没问题。', '形状够好，立直。'],
            'riichi.chase': ['{对方}先立了，但我这手更好。'],
            threat: ['{对方}立直，先看现物。'],
            call: ['{牌}，鸣一手，速度够了。'],
            stolen: ['被{对方}鸣了，在预料之中。'],
            fold: ['期望值不够，这把退。', '安全牌还有三张，够躲。'],
            push: ['计算过了，这张值得打。'],
            'win.ron': ['荣和，{对方}，谢谢。', '{牌}，和了，按计划。'],
            'win.tsumo': ['自摸，正好。'],
            'win.big': ['{点}点，这一手做得很完整。'],
            dealIn: ['……是我读错了。', '{对方}的听牌没看出来，记下了。'],
            'dealIn.big': ['{点}点，这个失误太重了。'],
            'final.top': ['第一。今天的判断都还算准。'],
            'final.last': ['……复盘一下，下次不会这样。'],
        },
        attack: {
            'open.first': ['{对方}，准备好被我打穿了吗？', '先说好，我只会往前冲！'],
            'open.tilt': ['好啊，这局我一张都不退！', '刚才那下我记住了，加倍还回来！'],
            'open.shrink': ['……啧，这局先收着一点。'],
            'open.lead': ['领先也不收手，继续打穿！'],
            'open.behind': ['倒数第一？正好，全力冲！'],
            riichi: ['立直！谁来都接着！', '立直！正面来啊！'],
            'riichi.chase': ['{对方}立直？追了！', '你立我也立，比比谁快！'],
            'riichi.allin': ['不立直还怎么翻盘！立直！'],
            threat: ['{对方}立直？吓唬谁呢。'],
            call: ['{牌}！拿来！', '这张我要了，别磨蹭！'],
            stolen: ['{对方}，拿我的牌胆子不小嘛。'],
            fold: ['……这次先放你一马。'],
            push: ['危险牌？照打！', '{对方}，你的立直吓不倒我！'],
            'win.ron': ['荣和！{对方}，撞我枪口上了！', '{牌}！就等你这张！'],
            'win.tsumo': ['自摸！看吧，进攻才是王道！'],
            'win.big': ['{点}点！这才叫打麻将！'],
            dealIn: ['切，{对方}运气好而已！', '放就放了，下把连本带利！'],
            'dealIn.big': ['[愤怒]{点}点……好，这口气我记下了！'],
            'final.top': ['第一！{对方}，再来几把也一样！'],
            'final.last': ['[愤怒]不服！{对方}，再来一场！'],
        },
        cautious: {
            'open.first': ['{对方}……请、请手下留情。', '我会小心打的……'],
            'open.tilt': ['不能再放铳了，绝对不能……'],
            'open.shrink': ['这局只打安全牌……', '好怕……先什么都别做。'],
            'open.lead': ['只要不放铳就能保住……'],
            'open.behind': ['再这样下去要垫底了……得想办法。'],
            riichi: ['……那就立直吧，应该没问题。', '立、立直……拜托快点来。'],
            'riichi.chase': ['{对方}立了……我也只好立了。'],
            threat: ['{对方}立直了……我先弃了。', '呜，立直了……现物在哪……'],
            call: ['{牌}……鸣一下应该没事吧。'],
            stolen: ['啊……被{对方}拿走了……'],
            fold: ['危险牌一张都不打。', '安全第一，这把不和了。'],
            push: ['这张……应该不会中吧……'],
            'win.ron': ['[害羞]和、和了！{对方}对不起……', '{牌}……真的和了？'],
            'win.tsumo': ['自摸……太好了，不用担心放铳了。'],
            'win.big': ['[惊讶]{点}点……这么多真的可以吗？'],
            dealIn: ['明明那么小心了……', '对不起……又被{对方}抓到了。'],
            'dealIn.big': ['{点}点……我要哭了……'],
            'final.top': ['[惊讶]第一？我……我居然赢了？'],
            'final.last': ['果然……我不适合打麻将……'],
        },
        swift: {
            'open.first': ['{对方}，速战速决哦！', '快开始快开始！'],
            'open.tilt': ['这局我要最快和！'],
            'open.shrink': ['……先别急，看看再说。'],
            'open.lead': ['最后一局，抢个小和就结束！'],
            'open.behind': ['来不及慢慢做了，越快越好！'],
            riichi: ['快点结束吧，立直！'],
            'riichi.chase': ['{对方}慢了，我也听了！'],
            threat: ['{对方}这么快就立直了？'],
            call: ['{牌}，鸣！', '先鸣再说～'],
            stolen: ['{对方}手真快……'],
            fold: ['算了算了，这把不抢了。'],
            push: ['来不及躲了，冲！'],
            'win.ron': ['和了！{对方}慢一步～', '{牌}！抢先一步！'],
            'win.tsumo': ['自摸！快就是正义！'],
            'win.big': ['又快又大，{点}点！'],
            dealIn: ['哎呀，太急了。', '{对方}，等等，我还没看清！'],
            'dealIn.big': ['{点}点……跑太快摔了一跤。'],
            'final.top': ['第一！一路领跑～'],
            'final.last': ['怎么会，我明明那么快……'],
        },
        gambler: {
            'open.first': ['{对方}，要玩就玩大的。', '今天赌什么？我全押。'],
            'open.tilt': ['输了就翻倍下注，这局玩把大的！'],
            'open.shrink': ['手气背……先看两手牌。'],
            'open.lead': ['领先？那就再押一把更大的。'],
            'open.behind': ['倒数第一，才最适合翻盘！'],
            riichi: ['全押！立直！', '要玩就玩大的，立直！'],
            'riichi.chase': ['{对方}也在赌？跟了！'],
            'riichi.allin': ['孤注一掷，立直！'],
            threat: ['{对方}立直了？有意思。'],
            call: ['{牌}，这张能做大。'],
            stolen: ['{对方}截我的胡？行啊。'],
            fold: ['这把运气不在，先收手。'],
            push: ['赌一把，就这张！', '{对方}，看看是谁运气好！'],
            'win.ron': ['{对方}，愿赌服输哦！', '{牌}！赌赢了！'],
            'win.tsumo': ['自摸！看到没，这才叫手气！'],
            'win.big': ['{点}点！赌对了！', '大牌！这就是赌徒的浪漫！'],
            dealIn: ['愿赌服输，下把翻倍赢回来。', '哈，{对方}这把运气好。'],
            'dealIn.big': ['{点}点……这把押输了。'],
            'final.top': ['赢家通吃！'],
            'final.last': ['全输光了……再来一局！'],
        },
        sly: {
            'open.first': ['{对方}，可要小心我哦。', '呵呵，今天你会输给我。'],
            'open.tilt': ['……好啊，那就认真点陪你们玩。'],
            'open.shrink': ['先藏好，等你们露破绽。'],
            'open.lead': ['最后一局了，我只要等着就好。'],
            'open.behind': ['落后？只是让你们放松警惕。'],
            riichi: ['立直哦，猜猜我在等什么？'],
            'riichi.chase': ['{对方}，你等的我已经看穿了。'],
            threat: ['{对方}立直了啊……听什么呢？'],
            call: ['{牌}，借来用用。'],
            stolen: ['{对方}，你拿了我想让你拿的。'],
            fold: ['这把不值得冒险。', '等下一把，有人会露馅的。'],
            push: ['这张是安全的，我算过了哦。'],
            'win.ron': ['{对方}，你上钩了。', '等的就是{牌}。'],
            'win.tsumo': ['自摸。一切都在计算之中。'],
            'win.dama': ['你以为我还没听牌吗？', '{对方}，被我埋伏到了呢。'],
            'win.big': ['{点}点，慢慢做出来的哦。'],
            dealIn: ['……被看穿了吗。', '{对方}，你比我想的要聪明。'],
            'dealIn.big': ['{点}点……这次是我算漏了。'],
            'final.top': ['第一。从开局就决定好了。'],
            'final.last': ['……今天就让你们一回。'],
        },
        airhead: {
            'open.first': ['{对方}，我们要打麻将吗？好耶！', '欸，规则……边打边想吧！'],
            'open.tilt': ['刚才的好过分！这次要认真了！'],
            'open.shrink': ['好可怕……这次要乖乖的。'],
            'open.lead': ['[惊讶]欸，我是第一？真的吗？'],
            'open.behind': ['最后一名……没关系，会有奇迹的！'],
            riichi: ['欸，可以立直了吗？那就立直！', '立直～是这么说的吧？'],
            'riichi.chase': ['{对方}立直了，那我也要！'],
            threat: ['{对方}说立直了，是什么意思来着？'],
            call: ['这个可以吃对吧？', '{牌}！我要我要！'],
            stolen: ['[惊讶]欸？{对方}拿走我的牌了？'],
            fold: ['好像很危险的样子……'],
            push: ['应该……没事吧？打了！'],
            'win.ron': ['[惊讶]欸？和了？和了！', '{对方}，这张好像是我要的～'],
            'win.tsumo': ['摸到了！是自摸吧？'],
            'win.big': ['{点}点？好多零！'],
            dealIn: ['诶诶？这张不能打吗？', '{对方}好过分……'],
            'dealIn.big': ['{点}点……是很多的意思吗？'],
            'final.top': ['欸？我是第一？太好了！'],
            'final.last': ['呜……麻将好难……'],
        },
    },
    chengdu: {
        steady: {
            'open.first': ['{对方}，血战规矩照常，请多指教。'],
            'open.tilt': ['刚才点炮是失误，这把修正。'],
            'open.shrink': ['先打缺门，炮一张都不点。'],
            'open.lead': ['最后一把，听牌守到查叫就行。'],
            'open.behind': ['分差还能追，这把做番。'],
            peng: ['{牌}，碰，牌形更顺了。'],
            stolen: ['{对方}碰了，记下她缺的门。'],
            fold: ['这张生，换熟张打。'],
            push: ['算过了，这张不是炮。'],
            guohu: ['这炮番太小，等自摸。'],
            duel: ['剩两家了，{对方}，稳着来。'],
            'win.zimo': ['自摸，在座的结账。'],
            'win.ron': ['{对方}，胡了，承让。'],
            'win.big': ['{番}番，这手做得够完整。'],
            dealIn: ['点炮了，是我读错了。'],
            'dealIn.big': ['{番}番……这笔亏得重。'],
            'final.top': ['四局下来第一，判断还算准。'],
            'final.last': ['垫底……回去复盘这几把炮。'],
        },
        attack: {
            'open.first': ['{对方}，血战就是要杀穿！'],
            'open.tilt': ['点我炮？这把加倍胡回来！'],
            'open.shrink': ['……啧，这把先收着打。'],
            'open.lead': ['领先也不躲，接着胡！'],
            'open.behind': ['分是负的？那就胡个大的！'],
            peng: ['{牌}！碰！', '碰！{对方}送得好！'],
            stolen: ['{对方}，碰我的牌？行啊。'],
            fold: ['……这张先让给你们。'],
            push: ['躲什么炮，打！', '血战就是要硬！'],
            guohu: ['小炮不要，我要大的！'],
            duel: ['就剩{对方}了？来，血战到底！'],
            'win.zimo': ['自摸！没胡的一起掏钱！'],
            'win.ron': ['胡！{对方}撞我枪口上了！'],
            'win.big': ['{番}番！这才叫血战！'],
            dealIn: ['点就点，下把胡回来！'],
            'dealIn.big': ['[愤怒]{番}番……好，这仇记下了！'],
            'final.top': ['第一！血战我从来不输！'],
            'final.last': ['[愤怒]不服！{对方}，再血战一场！'],
        },
        cautious: {
            'open.first': ['{对方}……我会努力不点炮的。'],
            'open.tilt': ['再点炮就完了……一张都不能错。'],
            'open.shrink': ['先把缺门打完……别、别点炮……'],
            'open.lead': ['只要不点炮……就能保住吧。'],
            'open.behind': ['分是负的……得胡一把才行。'],
            peng: ['碰……{牌}碰了应该安全吧。'],
            stolen: ['{对方}碰了……她是不是要胡了……'],
            fold: ['这张好生……打熟张。', '有人听了，我拆对子躲。'],
            push: ['这张……应该不是炮吧……'],
            guohu: ['这炮……先不胡了，怕等下更糟。'],
            duel: ['只剩我和{对方}了……好紧张。'],
            'win.zimo': ['自摸……太好了，没点炮就胡了。'],
            'win.ron': ['[害羞]胡、胡了……{对方}对不起。'],
            'win.big': ['[惊讶]{番}番……这么多真的可以吗？'],
            dealIn: ['明明在躲炮了……', '呜……点给{对方}了……'],
            'dealIn.big': ['{番}番的炮……完了……'],
            'final.top': ['[惊讶]第一？血战我居然赢了？'],
            'final.last': ['点了那么多炮……果然垫底了……'],
        },
        swift: {
            'open.first': ['{对方}，快点打，早胡早下桌！'],
            'open.tilt': ['这把我要第一个胡！'],
            'open.shrink': ['……先慢一点，看清楚再打。'],
            'open.lead': ['最后一把，抢先胡了就结束！'],
            'open.behind': ['没时间做大了，能胡就胡！'],
            peng: ['碰！快快快！', '{牌}，碰，别墨迹！'],
            stolen: ['{对方}碰得好快……'],
            fold: ['不抢了不抢了，先躲。'],
            push: ['来不及躲了，出！'],
            guohu: ['……忍住，这炮不胡。'],
            duel: ['就剩{对方}了，比谁先胡！'],
            'win.zimo': ['自摸！先走一步～'],
            'win.ron': ['胡了！{对方}慢一拍～'],
            'win.big': ['又快又大，{番}番！'],
            dealIn: ['哎呀，打太快点炮了。'],
            'dealIn.big': ['{番}番……跑太快摔了。'],
            'final.top': ['第一！一路抢先胡～'],
            'final.last': ['胡得快有什么用……垫底了。'],
        },
        gambler: {
            'open.first': ['{对方}，血战就赌这一口气。'],
            'open.tilt': ['输了就加注，这把做清一色！'],
            'open.shrink': ['手气背，先看两巡。'],
            'open.lead': ['领先？那就再赌把大的。'],
            'open.behind': ['垫底才好翻盘，赌了！'],
            peng: ['{牌}，碰，这把要做大。'],
            stolen: ['{对方}截我的牌？好胆。'],
            fold: ['这把牌烂，先扔缺门。'],
            push: ['赌一把，这张不是炮！'],
            guohu: ['小炮不收，我赌自摸！'],
            duel: ['就剩{对方}了，赌谁先胡！'],
            'win.zimo': ['自摸！赌赢了！'],
            'win.ron': ['{对方}，愿赌服输，给钱！'],
            'win.big': ['{番}番！就赌这个！', '大番！血战就是要赌！'],
            dealIn: ['愿赌服输，下把翻本。'],
            'dealIn.big': ['{番}番……这把押输了。'],
            'final.top': ['血战通吃，钱都是我的！'],
            'final.last': ['输光了……再开一场血战！'],
        },
        sly: {
            'open.first': ['{对方}，血战可是很漫长的哦。'],
            'open.tilt': ['……好啊，我会慢慢讨回来的。'],
            'open.shrink': ['先藏着，等你们先露叫。'],
            'open.lead': ['最后一把，看你们互相点炮就好。'],
            'open.behind': ['落后？等你们放松就行了。'],
            peng: ['{牌}，碰。你们继续～'],
            stolen: ['{对方}碰了啊，缺哪门我知道了。'],
            fold: ['这张会点炮，换一张。'],
            push: ['这张是熟张，我算过了哦。'],
            guohu: ['这炮先留着，等更大的。'],
            duel: ['只剩{对方}了……谁先忍不住呢？'],
            'win.zimo': ['自摸。计划之中。'],
            'win.ron': ['{对方}，你上钩了呢。'],
            'win.big': ['{番}番，一直藏着呢。'],
            dealIn: ['……被你们盯上了。'],
            'dealIn.big': ['{番}番……这次算漏了。'],
            'final.top': ['第一，从换三张就决定了。'],
            'final.last': ['……今天先让你们开心一下。'],
        },
        airhead: {
            'open.first': ['{对方}，血战是要打架吗？'],
            'open.tilt': ['刚才好过分！这次我要胡！'],
            'open.shrink': ['好可怕……这把要乖乖打缺门。'],
            'open.lead': ['[惊讶]欸，我分最多？真的？'],
            'open.behind': ['负分……没关系，会胡的！'],
            peng: ['这个可以碰吗？碰！'],
            stolen: ['[惊讶]欸？{对方}要我的{牌}？'],
            fold: ['缺门是哪门来着……先打这张。'],
            push: ['应该……不是炮吧？打了！'],
            guohu: ['欸，这张能胡？我、我先不胡了？'],
            duel: ['只剩我和{对方}了？好刺激！'],
            'win.zimo': ['摸到了！自摸是这个吧？'],
            'win.ron': ['[惊讶]诶，胡了？真的胡了！'],
            'win.big': ['{番}番？是很多的意思吗？'],
            dealIn: ['啊？这张是炮？'],
            'dealIn.big': ['{番}番的炮……我的钱……'],
            'final.top': ['欸？我分最多？太好了！'],
            'final.last': ['呜……血战好难……'],
        },
    },
};

// 玩家本人不替他说话，只喊牌桌上的宣言。
const DECLARE = {
    riichi: { riichi: '立直！', 'riichi.chase': '立直！', 'riichi.allin': '立直！', chi: '吃！', pon: '碰！', kan: '杠！', 'win.tsumo': '自摸！', 'win.ron': '荣和！' },
    chengdu: { peng: '碰！', 'gang.an': '杠！', 'gang.dian': '杠！', 'gang.wan': '杠！', 'win.zimo': '自摸！', 'win.ron': '胡！' },
};

export function declareLine(rules, key) {
    return (DECLARE[rules === 'chengdu' ? 'chengdu' : 'riichi'] || {})[key] || '';
}

function rulesOf(rules) {
    return rules === 'chengdu' ? 'chengdu' : 'riichi';
}

export function voiceKeys(rules) {
    return VOICE_KEYS[rulesOf(rules)];
}

// 所有内置句（含打法句），测试用来核对两套牌桌不共用句子。
export function builtinLines(rules = 'riichi') {
    const r = rulesOf(rules);
    const out = [];
    for (const list of Object.values(GENERIC[r])) out.push(...list);
    for (const pack of Object.values(STYLED[r])) for (const list of Object.values(pack)) out.push(...list);
    return out;
}

export function splitMood(line) {
    const text = String(line || '');
    const hit = text.match(MOOD_RE);
    return hit ? { mood: hit[1], text: text.slice(hit[0].length) } : { mood: '', text };
}

function slotsIn(text) {
    return [...String(text).matchAll(SLOT_RE)].map((m) => m[1]);
}

// 副 API 写回来的句子：去掉括号里的动作和引号，字数超了、用了没给的占位符的不要。
function cleanLine(raw, allowed) {
    let line = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
    const { mood, text } = splitMood(line);
    line = text.replace(/[（(][^（）()]*[）)]/g, '').replace(/^[「『“"]+|[」』”"]+$/g, '').trim();
    if (!line || line.length > LINE_MAX) return '';
    if (slotsIn(line).some((slot) => !allowed.includes(slot))) return '';
    return mood ? `[${mood}]${line}` : line;
}

export function cleanVoice(raw, rules) {
    const keys = voiceKeys(rules);
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [key, meta] of Object.entries(keys)) {
        const value = raw[key];
        const list = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
        const kept = [...new Set(list.map((line) => cleanLine(line, meta.slots)).filter(Boolean))].slice(0, 3);
        if (kept.length) out[key] = kept;
    }
    return out;
}

export function cleanAddress(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [name, term] of Object.entries(raw)) {
        const who = String(name || '').trim();
        const word = String(term || '').replace(/\s+/g, '').replace(/[{}]/g, '').slice(0, 10);
        if (who && word) out[who] = word;
    }
    return out;
}

function fill(text, persona, slots) {
    const address = (persona && persona.address) || {};
    let missing = false;
    // 对玩家没有专门称呼时 {对方} 就是「你」：去掉「你，你……」和句尾「……，你。」这种叠出来的呼语。
    if (slots['对方'] === '你' && !address['你']) {
        text = text.replace(/^\{对方\}[，,](?=你)/, '').replace(/[，,]\{对方\}([。！？!?～…]*)$/, '$1');
    }
    const out = text.replace(SLOT_RE, (whole, slot) => {
        const value = slots[slot];
        if (value == null || value === '') {
            missing = true;
            return '';
        }
        if (slot === '对方') return address[value] || String(value);
        return String(value);
    });
    return missing ? '' : out;
}

function poolOf(lines, persona, slots, avoid) {
    if (!Array.isArray(lines) || !lines.length) return [];
    const out = [];
    for (const raw of lines) {
        const { mood, text } = splitMood(raw);
        const said = fill(text, persona, slots);
        if (said) out.push({ text: said, mood });
    }
    const fresh = out.filter((line) => !avoid.includes(line.text));
    return fresh.length ? fresh : out;
}

// keys 从最具体到最一般；前面带 ~ 的键只用角色自己或打法写过的句子，不退到通用句。
// 每个键先找她自己的句子，再找打法句，最后通用句；第一个找得到的键就用它。
export function voiceLine(persona, rules, keys, { slots = {}, random = Math.random, avoid = [] } = {}) {
    const r = rulesOf(rules);
    const table = VOICE_KEYS[r];
    const own = (persona && persona.voice && persona.voice[r]) || {};
    const styled = (persona && STYLED[r][persona.style]) || {};
    const recent = Array.isArray(avoid) ? avoid : [avoid].filter(Boolean);
    for (const entry of keys) {
        const soft = entry.startsWith('~');
        const key = soft ? entry.slice(1) : entry;
        if (!table[key]) continue;
        const layers = soft ? [own[key], styled[key]] : [own[key], styled[key], GENERIC[r][key]];
        for (const lines of layers) {
            const pool = poolOf(lines, persona, slots, recent);
            if (!pool.length) continue;
            const pick = pool[Math.floor(random() * pool.length) % pool.length];
            return { key, text: pick.text, mood: pick.mood || table[key].mood, tagged: Boolean(pick.mood), own: lines === own[key] };
        }
    }
    return null;
}

// 话多话少：talk 是打法给的基数，weight 是这件事值不值得开口。
export function wantsToTalk(persona, weight, random = Math.random) {
    const talk = Number(persona && persona.params && persona.params.talk);
    const base = Number.isFinite(talk) ? talk : 0.55;
    return random() < Math.min(1, base * weight);
}

// 立直和牌：役满和少见的役先说，再看翻盘、报仇、大牌、默听，最后才是普通的荣和自摸。
const YAKUMAN_KEYS = [
    ['天和', 'yaku.天和'], ['地和', 'yaku.地和'],
    ['国士無双', 'yaku.国士无双'], ['国士無双十三面', 'yaku.国士无双'],
    ['九蓮宝燈', 'yaku.九莲宝灯'], ['純正九蓮宝燈', 'yaku.九莲宝灯'],
    ['四暗刻', 'yaku.四暗刻'], ['四暗刻単騎', 'yaku.四暗刻'],
    ['大三元', 'yaku.大三元'], ['小四喜', 'yaku.四喜和'], ['大四喜', 'yaku.四喜和'], ['字一色', 'yaku.字一色'],
];
const RARE_YAKU = [['嶺上開花', 'yaku.岭上开花'], ['槍槓', 'yaku.抢杠'], ['海底摸月', 'yaku.海底摸月'], ['河底撈魚', 'yaku.河底捞鱼'], ['ダブル立直', 'yaku.两立直']];
const MILD_YAKU = [['一発', 'yaku.一发'], ['七対子', 'yaku.七对子'], ['対々和', 'yaku.对对和'], ['混一色', 'yaku.混一色'], ['一気通貫', 'yaku.一气通贯'], ['三色同順', 'yaku.三色同顺']];

export function riichiWinKeys(hule, { dama = false, comeback = false, revenge = false, random = Math.random } = {}) {
    const names = new Set(((hule && hule.hupai) || []).map((item) => item.name));
    const keys = [];
    for (const [name, key] of YAKUMAN_KEYS) if (names.has(name) && !keys.includes(key)) keys.push(key);
    if (hule && hule.damanguan) keys.push('win.yakuman');
    for (const [name, key] of RARE_YAKU) if (names.has(name)) keys.push(key);
    if (comeback) keys.push('win.comeback');
    if (revenge) keys.push('win.revenge');
    if (names.has('清一色')) keys.push('yaku.清一色');
    const points = Number(hule && hule.defen) || 0;
    const mild = MILD_YAKU.filter(([name]) => names.has(name)).map(([, key]) => key);
    if (mild.length && random() < 0.6) keys.push(mild[Math.floor(random() * mild.length) % mild.length]);
    if (points >= 8000) keys.push('win.big');
    if (dama) keys.push('win.dama');
    if (points > 0 && points <= 2000) keys.push('~win.cheap');
    keys.push(hule && hule.baojia == null ? 'win.tsumo' : 'win.ron');
    return keys;
}

// 成都胡牌：天地胡、杠上的胡法、海底最稀罕，然后是局势，再是牌型和番数。
const CHENGDU_RARE = ['天胡', '地胡', '杠上花', '杠上炮', '抢杠胡', '海底'];
const CHENGDU_SHAPES = ['清一色', '龙七对', '将对', '七对', '金钩胡', '碰碰胡'];

export function chengduWinKeys(shape, { zimo = false, first = false, last = false, comeback = false, revenge = false } = {}) {
    const patterns = new Set((shape && shape.patterns) || []);
    const keys = [];
    for (const name of CHENGDU_RARE) if (patterns.has(name)) keys.push(`pattern.${name}`);
    if (last) keys.push('win.last');
    if (comeback) keys.push('win.comeback');
    if (revenge) keys.push('win.revenge');
    for (const name of CHENGDU_SHAPES) if (patterns.has(name)) keys.push(`pattern.${name}`);
    const fan = Number(shape && shape.fan) || 0;
    if (fan >= 3) keys.push('win.big');
    if (first) keys.push('win.first');
    if (fan <= 1) keys.push('~win.cheap');
    keys.push(zimo ? 'win.zimo' : 'win.ron');
    return keys;
}
