import { forumHash } from './forum-reader-model.js';
import { FORUM_KAOMOJI } from './forum-reader-lines.js';

// 安科点击后的内置短楼：按结果情境从词池里按种子取几条，路人口吻、不涉及具体剧情。
const POOLS = {
    voteWon: ['稳了', '你这票投对了', '还得是你', '民意在你这边', '这波不亏', '懂行', '赢麻了', '我就说这个选项能行', '多数人的选择，你也在里面', '同路人，握手', '这都能蒙对', '楼主这下没法赖了', '这下舆论一边倒', '我也投的这个', '少数服从多数，服', '你是不是偷看了答案', '这个结果我满意', '今晚吃好的', '开局顺利', '没白投这一票'],
    voteLost: ['你这票……白投了', '节哀', '少数派的悲伤', '没事，下次再来', '民意不在你这边', '输得很有尊严', '建议下次跟风', '我替你难过三秒', '这选项就不该输', '你投的那个真的不差', '悲，被多数人否决了', '大家的审美出了问题', '输了不丢人', '民主的代价', '下一层记得投赢的', '我也输了，抱团', '一起沉默三秒', '默哀', '大数据没站你', '这届网友不行'],
    voteClose: ['就差一点点', '这票数是在拍悬疑片吗', '险胜，心跳都停了', '再来一票就翻了', '这也太悬了', '一票之差都不止，太刺激了', '差点就翻盘', '手心全是汗', '数票数数到手软', '这波拉锯够长的', '最后一刻才分出胜负', '惊险惊险', '这帖的票比剧情还刺激', '多一个人就变天了', '悬，太悬了', '我以为要平票了', '这个差距，说没猫腻我都不信', '紧张到忘了自己投的哪个', '再投一轮吧，不服'],
    voteCrush: ['这就叫民意', '压倒性胜利', '另一边是不是没人了', '差距有点大啊', '一边倒，没悬念', '这票数是约好的吧', '赢的那边已经开始庆祝了', '输的那边别硬撑了', '这是投票还是表态', '赢得毫无悬念', '全票通过的既视感', '这选项人气太高了', '输的选项：我有罪', '大家的意见出奇一致', '现场一面倒', '碾压局，散了散了', '输的那个选项心里苦', '民心所向', '直接封神', '另一边的人去哪了'],
    edge: ['这手气……', '首尾都能骰中，神了', '骰子也爱凑热闹', '这个位置，太会挑了', '最边上那楼被你骰中了', '极端选项预定', '绝了，直接骰到边缘', '这运气不去买彩票可惜了', '骰子：我就喜欢走极端', '楼主你完了', '好戏要开始了', '这个楼层等了很久', '该来的还是来了', '赌的就是边缘', '骰神附体', '边缘楼层的逆袭', '这结果谁敢信', '楼主要倒霉了', '这一骰骰出了气势', '收好，这是命'],
    mid: ['行，就它了', '这楼选得妙', '骰子也是有品味的', '中规中矩，勉强接受', '那就这样吧', '这下楼主没得选了', '安中了，认命吧', '这楼有点东西', '没毛病', '运气不错', '可以，这很楼主', '落定了，别反悔', '这个楼层我给满分', '好像也没那么糟', '这就推进吧', '收到，已安排', '我选的不是这楼，但行', '服从安排', '命运的选择', '楼主，你的安价到了'],
    free: ['自由安价？有想法', '楼主这是要自己写剧本', '不按套路出牌', '随你吧', '行，你说了算', '这是放弃我们了吗', '看你怎么写', '自由发挥，期待', '连候选都不选，狠', '这位主角有自己的想法', '自由安价最危险', '期待你的发挥', '我们白准备了', '所以我们是在干嘛', '你开心就好', '来吧展示', '不听劝的楼主最可爱', '放飞自我了', '好吧，你自己负责', '这一手出乎意料'],
    critOk: ['大成功！', '欧皇降临', '这运气我先跪了', '掷出这点数，不要命了', '这骰子是开过光的吧', '楼主命这么硬', '这也能大成功', '太夸张了', '直接起飞', '这点数我截图了', '我宣布这帖封神', '运气全用在这了', '楼主今晚可以买彩票', '这是什么神仙点数', '不敢信，再看一遍', '全体起立', '骰子：我尽力了', '这下稳了', '这一骰载入史册', '开挂实锤', '佩服佩服', '欧气分我一点'],
    critFail: ['大失败……', '这点数，绝了', '非酋本酋', '这骰子被诅咒了吧', '楼主你是不是得罪谁了', '大失败预定成真', '节哀', '这运气没谁了', '我看着都疼', '直接爆炸', '这骰一出我就知道不对', '惨不忍睹', '骰子：对不起我尽力了', '建议楼主今晚别出门', '这就是命', '这点数我先替你默哀', '黑到发亮', '我不敢看了', '这一骰骰出了传说', '楼主你还好吗', '这是要出事的节奏'],
    nearFail: ['就差一点点！', '这也太可惜了', '差一点就成了', '这差距是故意的吧', '就差几点，心态崩了', '再给一次机会啊', '这点数气死人', '功亏一篑', '差这么一点不如不差', '骰子在调戏楼主', '我已经开始心疼了', '就差那么一丁点', '这叫什么，擦边失败', '再加点就过了', '早知道多加点', '这下后悔药都没地方买', '失败得很有悬念', '差点就赢了', '这差距看得我难受', '好气', '真的就差一点'],
    nearPass: ['险过！', '擦边成功', '心脏都停了', '这也太险了', '差一点就翻车', '刚好够，命真好', '悬得我手心全是汗', '成功线：谢谢你没把我吓死', '多一点都不浪费', '这就叫恰好', '踩线过关', '好险好险', '成功了但我没放心', '数字刚刚好', '这点数过得真憋屈', '勉强达标', '运气卡着线', '这运气刚刚好', '惊险过关', '差一点就没了'],
    success: ['成功了', '稳', '这波可以', '没翻车', '过了', '算你走运', '这点数还行', '顺利', '妥了', '楼主这回靠谱', '成功就好', '没白骰', '这就对了', '行，成功', '比我想的顺利', '一次过，漂亮', '这个结果我能接受', '可以可以', '没出岔子', '运气不错', '看来能行'],
    fail: ['失败了', '翻车了', '没过', '这下尴尬了', '意料之中', '楼主这波不太行', '这代价怕是不小', '骰子不给面子', '失败是成功之母', '我就知道', '不意外', '下次再来', '这结果有点疼', '失手了', '就这？', '凉了', '这下有得受了', '节哀顺变', '楼主做好心理准备', '后果自负', '失败也是一种体验'],
    common: ['楼主快更', '前排', '截图了', '这帖要火', '蹲后续', '坐等下一层', '已存档', '我先看看', '这展开我没想到', '围观中', '路过留名', '这帖我追了', '楼主别太监', '好帖，顶', '高能预警', '这就是你们要的结果', '看完了，等更新', '这个楼我记下了', '不明觉厉', '吃瓜吃到现在', '下一层是不是要出事', '更新快点啊'],
};
const VOTER = ['我的{n}号啊', '{n}号选手没了', '早知道不投{n}了', '我投的{n}呢', '{n}号：我不配吗', '说好的{n}号呢', '我押的{n}号输了', '{n}号党哭晕在厕所', '为{n}号默哀', '我就是{n}号的忠实粉丝'];
const STICKERS = {
    voteWon: ['开心', '得意', '期待'], voteLost: ['无语', '委屈', '哭哭'], voteClose: ['震惊', '尴尬', '疑问'], voteCrush: ['震惊', '无语', '摆烂'],
    edge: ['震惊', '开心', '疑问'], mid: ['好的', '开心', '期待'], free: ['疑问', '无语', '摆烂'],
    critOk: ['震惊', '得意', '开心'], critFail: ['哭哭', '崩溃', '无语'], nearFail: ['崩溃', '委屈', '无语'], nearPass: ['尴尬', '心虚', '开心'],
    success: ['开心', '好的', '得意'], fail: ['无语', '哭哭', '摆烂'], common: ['期待', '无语', '开心', '疑问'],
};
const BIG = new Set(['critOk', 'critFail', 'nearFail', 'voteCrush', 'edge']);
const NEAR_GAP = 5;
const CLOSE_LEAD = 2;
const CRUSH_LEAD = 8;
const VOTER_RATE = 50;
const GENERIC_RATE = 25;

export const ANKE_REACT_POOLS = Object.freeze(Object.fromEntries(Object.entries({ ...POOLS, voter: VOTER }).map(([k, v]) => [k, Object.freeze(v)])));
export const ANKE_REACT_STICKERS = Object.freeze(STICKERS);

// outcome：vote { won, lead, voters:[{id,n}] }；anchor / collect { mode: first|last|mid|free }；check { tier, diff }（diff = 总值 - 成功线）。
export function ankeSituation(kind, outcome = {}) {
    if (kind === 'vote') return outcome.lead >= CRUSH_LEAD ? 'voteCrush' : outcome.won ? (outcome.lead <= CLOSE_LEAD ? 'voteClose' : 'voteWon') : 'voteLost';
    if (kind === 'check') {
        if (outcome.tier === '大成功') return 'critOk';
        if (outcome.tier === '大失败') return 'critFail';
        if (outcome.tier === '成功') return outcome.diff <= NEAR_GAP ? 'nearPass' : 'success';
        return -outcome.diff <= NEAR_GAP ? 'nearFail' : 'fail';
    }
    return outcome.mode === 'first' || outcome.mode === 'last' ? 'edge' : outcome.mode === 'free' ? 'free' : 'mid';
}

function fallbackId(seed, i) {
    return forumHash(`${seed}:id${i}`).toString(36).padStart(8, '0').slice(-8);
}

export function ankeReactions({ kind, outcome, seed, ids = [], avoid = [] }) {
    const situation = ankeSituation(kind, outcome);
    const h = (tag) => forumHash(`${seed}:${tag}`);
    let count = (BIG.has(situation) ? 3 : 1) + h('count') % 2;
    const out = [];
    const taken = new Set(avoid);
    const voters = kind === 'vote' && Array.isArray(outcome && outcome.voters) ? outcome.voters : [];
    if (voters.length && h('voter') % 100 < VOTER_RATE) {
        const v = voters[h('who') % voters.length];
        out.push({ id: v.id, text: VOTER[h('vline') % VOTER.length].replace('{n}', String(v.n)) });
        count -= 1;
    }
    const used = new Set(out.map((r) => r.id));
    for (let j = 0; j < count; j++) {
        const pool = (h(`g${j}`) % 100 < GENERIC_RATE ? POOLS.common : POOLS[situation]).filter((t) => !taken.has(t));
        const pooled = pool.length ? pool : POOLS[situation].filter((t) => !taken.has(t));
        if (!pooled.length) break;
        const text = pooled[h(`t${j}`) % pooled.length];
        taken.add(text);
        const sticker = `[igs-sticker:${STICKERS[situation][h(`s${j}`) % STICKERS[situation].length]}]`;
        const face = FORUM_KAOMOJI[h(`k${j}`) % FORUM_KAOMOJI.length];
        const roll = h(`m${j}`) % 100;
        const body = roll < 50 ? text : roll < 65 ? `${text}${face}` : roll < 75 ? face : roll < 90 ? sticker : `${text}${sticker}`;
        const free = ids.filter((id) => !used.has(id));
        const id = free.length ? free[h(`i${j}`) % free.length] : ids.length ? ids[h(`i${j}`) % ids.length] : fallbackId(seed, j);
        used.add(id);
        out.push({ id, text: body });
    }
    return out;
}
