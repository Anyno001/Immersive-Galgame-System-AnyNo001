import { normalizeFeedFxSettings, activeFeedPlatforms, feedPlatformPrompt, stormPromptOf } from './feed-settings.js';
import { FEED_PEEK_IDS } from '../../scene/feed-platforms.js';

// 手机社区语法：先告诉模型写正文的哪一段，再给规则，再给一条填好的例子。平台行按当前世界观与开关生成。
const PEEK_IDS = new Set(FEED_PEEK_IDS);

function feedState(readerSettings) {
    const raw = readerSettings && readerSettings.feedFx;
    const s = normalizeFeedFxSettings(raw);
    // peekHint：bootstrap 按最近上下文写入；明确为 false（没有偷看迹象）时偷看专用平台不进名单；undefined 是旧路径，照旧全列。
    const peekHidden = Boolean(raw) && raw.peekHint === false;
    const platforms = s.enabled ? activeFeedPlatforms(s).filter((p) => !(peekHidden && PEEK_IDS.has(p.id))) : [];
    // mentioned：bootstrap 按最近上下文写入的平台 id；undefined 表示不按需（旧路径），全部展开。
    const mentioned = raw && Array.isArray(raw.mentioned) ? raw.mentioned : null;
    return { s, platforms, mentioned };
}

function feedLines(s, platforms, mentioned = null) {
    const detailed = mentioned ? platforms.filter((p) => mentioned.includes(p.id)) : platforms;
    const rest = platforms.filter((p) => !detailed.includes(p));
    return [
        ...feedTagLines(),
        ...(s.storm.enabled ? stormLines(s) : []),
        ...detailed.map((p) => `${p.name}（附加写${p.extraLabel}）：${feedPlatformPrompt(s, p.id)}`),
        ...(rest.length ? [`其他可用平台：${rest.map((p) => p.name).join('、')}`] : []),
    ];
}

function feedTagLines() {
    return [
        'app|平台|主人 … app-end：看社交媒体、刷手机、告示等就主动包住；平台只写列出的名字，泛指时挑最贴的；主人省略即自己的，偷看角色的写其名',
        'post|作者|内容|附加：一条帖子，写在 app 与 app-end 之间；帖子之间夹一两句看手机的叙述，别整块只有标签；每次2~4条，内容一般≤80字，豆瓣、知乎、书评可到140字，附加按平台写，可省',
        'reply|作者|内容|回复谁：上一条帖子的评论，每帖0~3条；回复谁是在回某条评论的作者时写，可省',
    ];
}

// 舆论风暴：语法行固定，写法说明可改。
function stormLines(s) {
    return [
        'storm|平台|红或黑|热搜词 … storm-end',
        'mention|网友|内容：@{{user}}的评论',
        `舆论风暴：${stormPromptOf(s)}`,
    ];
}

function detailedPlatforms(platforms, mentioned) {
    return Array.isArray(mentioned) && mentioned.length ? platforms.filter((p) => mentioned.includes(p.id)) : [];
}

// 每条：[作者, 正文, 附加, 评论?]。每个平台两条帖：第一条两条评论，第二条没有。
// 评论紧挨着它评的那条帖。附加栏填该平台真正要写的内容，不填字段名。搜索记录、备忘录、相册没有评论区。
const SAMPLE_POSTS = {
    news: [
        ['本地晚报', '校门口一辆黑车停了一夜，车主身份仍在核实。', '社会', [['网友甲', '又是豪车，先查监控'], ['网友乙', '等人家通报，别在这儿判案']]],
        ['市教育局', '暴雨预警解除，明日中小学正常上课。', '本地'],
    ],
    moments: [
        ['林小雨', '下雨了，没带伞。', '学校门口', [['{{user}}', '我过去接你'], ['林小雨', '好，我在门口等']]],
        ['陈默', '食堂新出的糖醋排骨，还行。', '第二食堂'],
    ],
    weibo: [
        ['校园墙', '今天校门口停了辆黑车，有人看见{{user}}从车上下来。', '#校门口那辆车', [['路过的', '我在现场，车窗还摇着'], ['不想惹事', '没看清脸就别@{{user}}']]],
        ['食堂阿姨', '糖醋排骨卖完了，明天早点来。', '#食堂日常'],
    ],
    confess: [
        ['匿名', '捞人，今天下午三点图书馆二楼，白衬衫戴眼镜的男生，你看了我一眼。', '一中表白墙', [['同学甲', '是不是高二三班那个'], ['同学乙', '@{{user}} 出来认']]],
        ['墙墙代发', '吐槽，谁把我的水杯拿去用了，还给我放回来。', '一中表白墙'],
    ],
    xhs: [
        ['林小雨', '学校后门那家面馆，酸汤面加一份煎蛋，一个人刚好。', '学校后门这家面，我能连吃一周', [['姐妹A', '求地址，导航发一下'], ['姐妹B', '看着就好吃，蹲个价格']]],
        ['吃货小陈', '宿舍空气炸锅版糖醋排骨，步骤写在下面。', '宿舍也能做的糖醋排骨'],
    ],
    zhihu: [
        ['林小雨，在校学生', '谢邀。先说结论：别在热搜没出的时候站队。', '如何看待校门口那辆黑车', [['网友甲', '你是不是当事人'], ['网友乙', '利益相关写清楚']]],
        ['陈默，旁观者', '我路过，只看见车，没看见人。', '校门口黑车是怎么回事'],
    ],
    tieba: [
        ['楼主', '校门口那辆黑车有人拍到了没，我只看见个车尾。', '本校吧', [['前排', '坐等图'], ['二楼', '楼主好人，先冒个泡']]],
        ['路人', '食堂糖醋排骨又卖完了，有没有同样愤怒的。', '本校吧'],
    ],
    douban: [
        ['林小雨', '今天在校门口看见一辆黑车，有人硬说是我下来的，我解释了一句，评论已经吵起来了。', '校园八卦小组', [['路人甲', '码'], ['路人乙', '楼主后续呢']]],
        ['陈默', '食堂新菜其实还行，就是排队太长。', '吃货小组'],
    ],
    hupu: [
        ['步行街网友', '校门口停辆黑车就被传成丑闻，这也能上热搜。', '步行街', [['JR', '有图吗，没图就是编的'], ['老司机', '先看监控再开口']]],
        ['食堂战神', '糖醋排骨卖完这种事也好意思发帖。', '步行街'],
    ],
    review: [
        ['林小雨', '前半本还在铺校园，后半本突然加悬疑，节奏断了。', '《晚自习》3星', [['书友甲', '我倒觉得后半本才开始'], ['书友乙', '3星合适，别吹']]],
        ['陈默', '打斗好看，文戏全在注水。', '《黑车》2星'],
    ],
    shop: [
        ['校园超市', '白衬衫男款长袖学生衬衫防皱', '¥39 月销2000+', [['买家甲', '布料薄，夏天可以'], ['买家乙', '追评：洗了一次起球']]],
        ['食堂档口', '糖醋排骨加热即食半成品', '¥18.8 月销500+'],
    ],
    search: [
        ['今天 21:40', '{{user}} 是谁', '今天 21:40'],
        ['今天 21:33', '校门口黑车 监控', '今天 21:33'],
    ],
    memo: [
        ['林小雨', '明天把伞带上。别再忘。', '明天'],
        ['林小雨', '那辆车的事不要回。', '草稿'],
    ],
    album: [
        ['林小雨', '校门口，一辆黑车停在树下，只拍到车尾。', '今天 18:02 学校门口'],
        ['林小雨', '食堂窗口，糖醋排骨还剩最后两份。', '今天 12:10 第二食堂'],
    ],
    chats: [
        ['{{user}}', '到校门口了吗', '置顶', [['林小雨', '马上'], ['{{user}}', '黑车那事你别回他们']]],
        ['妈妈', '晚上回来吃饭吗', '18:20'],
    ],
    starnet: [
        ['轨道观察员', '第三星区港口停着一艘没登记的黑船，有人看见{{user}}从舷梯下来。', '第三星区', [['旅客甲', '我在现场，舱门还开着'], ['旅客乙', '没看清脸就别点名']]],
        ['食堂机器人', '今日糖醋排骨配给已发放完毕。', '空间站食堂'],
    ],
    notice: [
        ['县衙', '城门口遗黑车一辆，认领者赴衙呈报，冒领者治罪。', '城门口', [['百姓甲', '我看见有人从车上下来'], ['百姓乙', '没看清脸，别乱指']]],
        ['张家', '寻女张小竹，年十五，身着青衫，知情者报至张家。', '十字街口'],
    ],
    teahouse: [
        ['说书人', '今早城门口停了辆没人认的黑车，有人说看见一位少年从车上下来。', '望月茶馆', [['茶客甲', '我在场，车帘还晃'], ['茶客乙', '拍桌子，没看清就别点名']]],
        ['茶博士', '今日糖醋排骨卖完了，明日早点来。', '望月茶馆'],
    ],
    guild: [
        ['委托人', '城门口黑车来历不明，查清车主，赏金币五十。', 'C级 赏金50', [['冒险者甲', '我接了，先去城门'], ['冒险者乙', '五十太少，加到一百我再揭榜']]],
        ['公会', '食堂糖醋排骨今日售罄，冒险者勿再排队。', '公告'],
    ],
    tavern: [
        ['吟游诗人', '城门口那辆黑车，有人看见{{user}}从车上下来。', '红龙酒馆', [['酒客甲', '我在场，车门还开着'], ['酒客乙', '没看清脸，你这是在编歌']]],
        ['酒保', '糖醋排骨卖完了，明天再来。', '红龙酒馆'],
    ],
    gazette: [
        ['校报记者', '校门口一辆黑车停了一夜，有人声称看见{{user}}下车。', '社会版', [['读者甲', '把车主登出来'], ['读者乙', '没核实就上头版，收回去']]],
        ['食堂专栏', '糖醋排骨今日售罄，明日恢复供应。', '生活版'],
    ],
    owl: [
        ['匿名', '校门口的黑车是空的。别再问我是谁。', '北塔', [['林小雨', '你到底看见了谁'], ['匿名', '看见了也别写出来']]],
        ['林小雨', '伞在门后。别再忘。', '宿舍'],
    ],
    radio: [
        ['呼号夜莺', '……沙沙……城门道上有一辆黑车，无人认领……沙沙……', '频段7.4', [['呼号灰烬', '收到，我在现场'], ['呼号烛火', '没看清人脸，别点名']]],
        ['营地厨房', '糖醋排骨配给发完了。完毕。', '频段7.4'],
    ],
    wall: [
        ['林小雨', '寻：昨晚在城门道看见黑车的人，请回来补一笔。', '东门营地', [['后来的人', '我看见车，没看见人'], ['又后来的人', '别在墙上点名']]],
        ['食堂', '糖醋排骨没了，别再问。', '东门营地'],
    ],
    extra: [
        ['每日新闻记者', '城门口遗黑车一辆，有人称看见{{user}}下车，警方尚未证实。', '每日新闻', [['读者甲', '把车主登出来'], ['读者乙', '未证实就出号外，太慌']]],
        ['本报', '食堂糖醋排骨今日售罄。', '每日新闻'],
    ],
    letters: [
        ['林小雨', '编辑先生，有人把城门口的黑车写成我的，我只是路过。', '文艺旬刊', [['编辑', '来信已读，下期刊出'], ['读者甲', '写信的人就是当事人吧']]],
        ['陈默', '食堂的糖醋排骨卖完了，这件事居然比小说好看。', '文艺旬刊'],
    ],
};

// 聊天列表的评论是会话消息、购物的评论是买家评价，不写回复对象。
const NO_REPLY_TO_IDS = new Set(['chats', 'shop']);

function renderSamplePosts(rows, platformId) {
    const lines = [];
    const replyTo = !NO_REPLY_TO_IDS.has(platformId);
    // 只取前两条帖：第一条两条评论（第二条评论回复第一条评论的人），第二条没有评论。
    for (const [author, text, extra, replies] of rows.slice(0, 2)) {
        // 帖子之间夹一句叙述：区间内没有正文时，演出没有页可挂。
        if (lines.length) lines.push('他往下划了划。');
        lines.push(`[igs-fx:post|${author}|${text}|${extra}]`);
        (replies || []).forEach(([who, say], n) => lines.push(`[igs-fx:reply|${who}|${say}${replyTo && n > 0 ? `|${replies[0][0]}` : ''}]`));
    }
    return lines;
}

function sampleCloser(platform) {
    if (PEEK_IDS.has(platform.id)) return '他看完林小雨的手机，把屏幕按灭。';
    if (platform.skin === 'paper') return '他看完那几条，转身离开。';
    return '他看完那几条，把手机扣在桌上。';
}

// 例子用正在展开的那个平台；一个都没点名时用名单里的第一个。
function feedSample(platforms, mentioned) {
    const detailed = detailedPlatforms(platforms, mentioned);
    const platform = detailed[0] || platforms[0];
    const where = detailed.length
        ? `角色看${detailed.map((p) => p.name).join('、')}的那一段`
        : '角色刷手机、看社区或看告示的那一段';
    const owner = PEEK_IDS.has(platform.id) ? '|林小雨' : '';
    const lead = PEEK_IDS.has(platform.id)
        ? `他翻开林小雨的手机，看${platform.name}。`
        : platform.skin === 'paper'
            ? `他停下看${platform.name}。`
            : `他掏出手机看${platform.name}。`;
    const rows = SAMPLE_POSTS[platform.id] || SAMPLE_POSTS.weibo;
    const text = [
        lead,
        `[igs-fx:app|${platform.name}${owner}]`,
        ...renderSamplePosts(rows, platform.id),
        '[igs-fx:app-end]',
        sampleCloser(platform),
    ].join('\n');
    return { where, text };
}

function feedPromptText(s, platforms, mentioned) {
    const sample = feedSample(platforms, mentioned);
    const rules = feedLines(s, platforms, mentioned).map((line) => `- ${line}`).join('\n');
    return `【手机社区】${sample.where}使用。写作 [igs-fx:app|平台|主人] 开始、[igs-fx:app-end] 结束：\n${rules}\n示例：\n${sample.text}`;
}

// 社区始终按场合展开（出现刷手机、看社区等关键词时）。detailed 时展开全部平台写法，compact 时只展开最近提到的平台。
export function feedGrammarBlocks(readerSettings, { detailed = false } = {}) {
    const { s, platforms, mentioned } = feedState(readerSettings);
    if (!platforms.length) return [];
    const full = detailed ? feedPromptText(s, platforms, null) : feedPromptText(s, platforms, mentioned || []);
    return [{ key: 'feed', adaptive: true, full, index: '社区 igs-fx:app/app-end/post/reply/storm' }];
}

// 关闭按需注入时的旧路径：平台写法全部展开，开头、规则、示例与按需展开的是同一份。
export function resolveFeedPromptRule(readerSettings) {
    const { s, platforms } = feedState(readerSettings);
    if (!platforms.length) return '';
    return feedPromptText(s, platforms, null);
}
