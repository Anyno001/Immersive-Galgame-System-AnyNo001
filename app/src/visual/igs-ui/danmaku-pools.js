// 弹幕本地词池：AI 只写关键弹幕，密度由这里补足，零 token 成本。全部纯文字，不含 emoji。
import { stripBilingualTranslation } from './bilingual-text.js';

const f = (list) => Object.freeze(list.slice());

export const LIVE_AMBIENT_LINES = f([
    '来了来了', '晚上好', '好可爱', '哈哈哈哈哈', '？', '？？？', '主播晚上好', '前排', '打卡', '来晚了',
    'awsl', '好耶', '草', '笑死', '这是可以说的吗', '妈妈我恋爱了', '声音好好听', '主播今天好漂亮',
    '关注了关注了', '上次直播也在', '刚来，发生了什么', '别停下来', '让我康康', '好家伙', '绷不住了',
    '有点东西', '学到了', '已截图', '录屏了', '6666', '可爱捏', '主播别害羞', '8888', '签到',
    '谁懂啊', 'DNA动了', '典', '蚌埠住了', '笑不活了', '狠狠心动了', '前方高能', '退退退', '确实',
    '什么神仙颜值', '泪目', '破防了', '芜湖', '我可以', '太强了', '栓Q', '我就说吧', '尊嘟假嘟',
    '一整个爱住', '绝了', '哈人', '麻了', '我酸了', '可', '就是玩儿', '好会啊', '这谁顶得住',
]);
export const LIVE_HOST_AMBIENT_LINES = f([
    '主播看我', '主播能念一下我的弹幕吗', '主播几点下播', '明天还播吗', '主播喝口水', '主播好认真',
    '点歌点歌', '主播看弹幕呀', '新人求关注', '主播加油',
]);
export const LIVE_NAME_HEADS = f([
    '路过的', '今天也', '不吃香菜的', '熬夜的', '一只', '想摸鱼的', '会发光的', '失眠', '爱喝奶茶的',
    '迷路的', '正在减肥的', '单推', '平平无奇', '快乐的', '早睡失败的', '咕咕咕',
]);
export const LIVE_NAME_TAILS = f([
    '咸鱼', '橘猫', '打工人', '团子', '小熊', '柠檬', '奶龙', '企鹅', '同学', '路人甲', '云朵', '仓鼠',
    '汽水', '布丁', '饭团', '松鼠',
]);
export const LIVE_AMBIENT_GIFTS = f(['小心心', '辣条', '打call', '牛哇牛哇', '这个好诶', '小花花', '干杯']);

export const AUDIENCE_MOODS = Object.freeze(['love', 'tense', 'funny', 'sad', 'anger', 'surprise']);
const AUDIENCE_MOOD_RE = Object.freeze({
    love: /心动|害羞|脸红|羞|喜欢|爱慕|甜|温柔|宠溺|陶醉|着迷|心跳/,
    tense: /紧张|害怕|恐惧|不安|惊恐|焦虑|危险|严肃|决然|坚决|冷酷/,
    funny: /尴尬|无奈|窘迫|心虚|得意|调皮|狡黠|坏笑|无语|呆/,
    sad: /难过|悲伤|哭|失落|沮丧|绝望|心疼|委屈|落寞|伤心/,
    anger: /生气|愤怒|恼火|气愤|暴怒|不爽|炸毛/,
    surprise: /震惊|惊讶|吃惊|愣|错愕|惊呆|恍然/,
});
export const AUDIENCE_AMBIENT_LINES = Object.freeze({
    love: f(['啊啊啊啊', '我死了', '好甜', 'awsl', '民政局我搬来了', '给我锁死', '嗑到了', '磕拉了', '这谁顶得住', '我又相信爱情了']),
    tense: f(['前方高能', '别过去！', '要来了要来了', '屏住呼吸', '心提到嗓子眼了', '不要啊', '空降成功']),
    funny: f(['哈哈哈哈哈', '笑死', '草', '尴尬到抠出三室一厅', '绷不住了', '这是什么操作', '？？？']),
    sad: f(['别刀了', '泪目', '我哭了你呢', '心疼', '谁在切洋葱', '破防了']),
    anger: f(['好凶', '吓死我了', '生气了生气了', '快哄哄', '危']),
    surprise: f(['？？？', '卧槽', '反转了', '我就知道', '好家伙', '什么！']),
    generic: f(['来了', '前排', '好看', '期待', '继续继续', '这集好看', '打卡']),
});

export const INNER_PHRASES = Object.freeze({
    love: f([
        '好喜欢', '心跳好快', '不行了', '在看我', '好近', '脸好烫', '冷静', '是不是喜欢我', '好帅', '想抱',
        '再近一点', '别走', '想靠过去', '他在笑', '好温柔', '心要跳出来了', '不敢看', '手好暖', '就这样吧',
        '好想牵手', '偷偷看一眼', '耳朵红了吗', '怎么办好开心', '想一直在一起', '被发现了吗', '只想看着你',
    ]),
    panic: f([
        '怎么办', '冷静冷静', '完蛋了', '怎么办怎么办', '先别慌', '啊啊啊', '跑吗', '要死了',
        '要来了', '手在抖', '腿软了', '不要啊', '别过来', '快想办法', '脑子一片空白', '来不及了',
        '不会吧', '现在怎么办', '喘不过气', '救命', '该说什么', '千万别出事',
    ]),
    anger: f([
        '可恶', '笨蛋', '笨蛋笨蛋', '气死了', '哼', '不理你了', '过分',
        '太过分了', '忍不了了', '凭什么', '给我等着', '真的生气了', '大笨蛋', '别惹我', '火大',
        '不想说话', '到底想怎样', '混蛋', '算我看错你', '气得发抖',
    ]),
    guilty: f([
        '没发现吧', '千万别问', '镇定', '看不出来', '装傻', '别看我', '糟了',
        '被看穿了吗', '不能说', '假装没事', '别追问', '心虚', '说漏嘴了', '千万别露馅', '低头低头',
        '千万别脸红', '先糊弄过去', '怎么解释', '装作没听见', '他起疑了吗',
    ]),
});

// 真实想法（心声原文、括号里的内心独白）与词池混播：有真实想法时占大头，词池补密度；没有就是纯词池。
export const INNER_REAL_SHARE = 0.65;
export function mixInnerPhrases(real, pool, count, rng = Math.random) {
    const realList = Array.from(new Set((real || []).filter(Boolean)));
    const poolList = (pool || []).filter(Boolean);
    if (!realList.length) return { phrases: poolList.slice(), real: [] };
    const realCount = Math.min(Math.round(count * INNER_REAL_SHARE), realList.length * 5);
    const size = Math.min(count, Math.ceil(realCount / INNER_REAL_SHARE));
    const out = [];
    for (let i = 0; i < realCount; i += 1) out.push(realList[i % realList.length]);
    // 词池补足到 count，随机起点避免每次同一批。
    const start = poolList.length ? Math.floor(rng() * poolList.length) : 0;
    for (let i = 0; out.length < size && poolList.length; i += 1) out.push(poolList[(start + i) % poolList.length]);
    // 把真实想法均匀穿插进词池里，而不是挤成一团。
    const mixed = [];
    const fills = out.slice(realCount);
    const reals = out.slice(0, realCount);
    const total = reals.length + fills.length;
    let ri = 0;
    let fi = 0;
    for (let i = 0; i < total; i += 1) {
        const takeReal = ri < reals.length && (fi >= fills.length || (ri + 0.5) / reals.length <= (i + 0.5) / total);
        mixed.push(takeReal ? reals[ri++] : fills[fi++]);
    }
    return { phrases: mixed, real: realList };
}

// 正文里括号包着的内心独白（全角/半角括号），截成短句。
export function parentheticalThoughts(text, limit = 4) {
    const out = [];
    const re = /[（(]([^（）()]{2,40})[）)]/g;
    const src = stripBilingualTranslation(text);
    let m = re.exec(src);
    while (m && out.length < limit) {
        out.push(...thoughtFragments(m[1], limit));
        m = re.exec(src);
    }
    return Array.from(new Set(out)).slice(0, limit);
}

export function randomItem(list, rng = Math.random) {
    return list.length ? list[Math.floor(rng() * list.length) % list.length] : '';
}

export function randomLiveName(rng = Math.random) {
    return `${randomItem(LIVE_NAME_HEADS, rng)}${randomItem(LIVE_NAME_TAILS, rng)}`;
}

export function classifyAudienceMood(emotion) {
    const target = String(emotion || '');
    if (!target) return 'generic';
    return AUDIENCE_MOODS.find((mood) => AUDIENCE_MOOD_RE[mood].test(target)) || 'generic';
}

// 从心声正文截出 2–8 字的短句，给内心弹幕用；截不出来时返回空数组，由词池兜底。
export function thoughtFragments(text, limit = 6) {
    const parts = stripBilingualTranslation(text)
        .replace(/\[[^\]]*\]/g, '')
        .split(/[，。！？、…—\-~～,.!?;；:：（）()「」『』"“”'‘’*\s]+/)
        .map((part) => part.trim())
        .filter((part) => {
            const len = Array.from(part).length;
            return len >= 2 && len <= 8;
        });
    return Array.from(new Set(parts)).slice(0, limit);
}

// 粉丝牌名：取主播名第一个字 + 固定后缀，稳定可复现。
export function fanMedalName(streamer) {
    const first = Array.from(String(streamer || '').trim())[0] || '粉';
    return `${first}团子`;
}

// 由字符串得到稳定的伪随机数，用于人气基数等「同一主播每次都一样」的数值。
export function stableHash(value) {
    let hash = 2166136261;
    for (const ch of String(value || '')) {
        hash ^= ch.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
