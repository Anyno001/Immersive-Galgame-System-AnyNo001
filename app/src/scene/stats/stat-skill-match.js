// 先掷后写的技能匹配词系统（§4.1A）：本地词表为主，辅助模型只兜底。
// 组合词需「动作词 + 对象词」同时命中（防止「做作业」判成烹饪）；否定、假设、回忆梦境、旁观他人不触发；
// 引号台词只认 QUOTE_LEXICON 里的社交说法。
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS } from './stat-state.js';
import { WORLD_SKILL_LEXICON } from './stat-world-skills.js';
import { CORE_SKILL_NAMES } from './stat-registry.js';

const COMBO_WINDOW = 6;
// 否定分两种：成词的「不想、如果、打算」等出现在命中词之前就不算；单字「不、没、别」只看命中词前两个字
// （「我不慌不忙地翻过墙」「我毫不犹豫地表白」照常触发）；「不得不、忍不住」这类不是否定，先剔掉再判断。
const NEGATION = /(不想|不会|不要|不能|不敢|不肯|不用|没有|没法|懒得|如果|要是|假如|假设|打算|万一)/;
const NEAR_NEGATION = /[不没别].{0,1}$/;
const NOT_NEGATION = /不得不|忍不住|毫不|不顾|不由得|不禁|不停|不慌不忙|不动声色/g;
const OBSERVE = /(看|望|盯|瞧|观看|围观|旁观)(着|了)?(她|他|它|他们|她们|别人|对方|大家)/;
const THIRD_PERSON = /^(她|他|它|他们|她们|对方|别人|大家)(?!和我|跟我|与我)/;
const MEMORY = /回忆|回想|记得|记忆中|梦里|梦中|梦见|梦到|当年|那时候/;
const QUOTED = /“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g;
// 台词里的社交说法：引号内只认这张表（台词里提到「做饭」「表白」等动作词仍不触发）。
// 只在引号外没有命中时才用；台词前一个字是否定词、或是别人说的台词，不算。
export const QUOTE_LEXICON = Object.freeze({
    话术: Object.freeze(['便宜点', '便宜一点', '少一点', '打个折', '通融一下', '通融通融', '求求你', '求你了', '你就答应', '答应我吧', '相信我', '我保证', '我发誓', '你听我解释', '听我说', '给个面子', '行行好', '帮个忙吧', '算我欠你']),
    恐吓: Object.freeze(['信不信我', '给我滚', '你给我等着', '别逼我', '最好老实', '后果自负', '不然的话', '要你好看', '你试试看', '再说一遍']),
    魅惑: Object.freeze(['你真好看', '你好美', '你真美', '你好可爱', '你真可爱', '想你了', '陪陪我', '今晚别走', '亲我一下', '抱抱我']),
    魅力: Object.freeze(['我喜欢你', '我爱你', '做我女朋友', '做我男朋友', '和我交往', '跟我交往', '嫁给我', '和我约会', '跟我约会', '一起去看电影']),
    察言观色: Object.freeze(['你在骗我', '你是不是在骗我', '你在撒谎', '你有事瞒着我', '你在隐瞒什么', '说实话']),
});
const QUOTE_SPEAKER = /(^|[，,\s])(她|他|它|他们|她们|对方|别人|大家)[^，。！？!?；;]{0,6}(说|问|喊|道|叫|嘀咕|回答|答)[:：]?\s*$/;
const QUOTE_NEAR_NEGATION = /[不没别]$/;

// 引号台词逐段找社交说法；别人说的、前面紧挨否定词的不算。返回 { hits, excluded }。
function findQuoteHits(text, allowed) {
    const hits = [];
    let excluded = 0;
    for (const m of String(text ?? '').matchAll(QUOTED)) {
        const before = text.slice(Math.max(0, m.index - 20), m.index).split(/[。！？!?\n]/).at(-1);
        const inner = m[0].slice(1, -1);
        const base = m.index + 1;
        const found = [];
        for (const [skill, words] of Object.entries(QUOTE_LEXICON)) {
            if (!allowed.has(skill)) continue;
            for (const word of words) occurrences(inner, word, (i) => found.push({ skill, start: i, word }));
        }
        if (!found.length) continue;
        if (QUOTE_SPEAKER.test(before) || MEMORY.test(before)) { excluded += found.length; continue; }
        for (const f of found) {
            if (QUOTE_NEAR_NEGATION.test(inner.slice(0, f.start))) { excluded += 1; continue; }
            hits.push({ skill: f.skill, abs: base + f.start, len: f.word.length, rank: 1, word: f.word });
        }
    }
    return { hits, excluded };
}

export const DIFFICULTY_WORDS = Object.freeze({
    极难: Object.freeze(['传说级', '不可能', '极限', '奇迹般']),
    困难: Object.freeze(['精致', '高难度', '第一次', '赶时间', '复杂', '专业级']),
});

export const BASE_LEXICON = Object.freeze({
    烹饪: { actions: ['做', '煮', '炒', '烤', '煎', '炖', '蒸', '包'], objects: ['饭', '菜', '汤', '面', '甜点', '寿司', '便当', '蛋糕', '饼干', '饺子', '早餐', '午餐', '晚餐', '夜宵', '点心', '咖喱'], solo: ['下厨', '掌勺', '烘焙', '烹饪', '做饭', '煮饭', '料理'] },
    家务: { actions: ['打扫', '收拾', '整理', '洗', '擦', '拖'], objects: ['房间', '屋子', '衣服', '碗', '地板', '桌子', '窗户', '厨房'], solo: ['做家务', '大扫除', '打扫'] },
    学习: { actions: ['复习', '学', '背', '做', '写', '预习'], objects: ['作业', '功课', '单词', '课文', '习题', '试卷', '笔记', '论文'], solo: ['温书', '备考', '刷题'] },
    运动: { actions: ['打', '踢'], objects: ['篮球', '足球', '网球', '羽毛球', '排球'], solo: ['锻炼', '健身', '晨跑', '跑步', '游泳'] },
    艺术: { actions: ['画', '弹', '拉', '拍', '写'], objects: ['钢琴', '吉他', '小提琴', '照片', '曲子', '诗'], solo: ['作画', '演奏', '绘画', '素描', '写生', '画画', '画像'] },
    话术: { solo: ['说服', '劝说', '讨价还价', '谈判', '辩论', '忽悠', '哄她', '哄他', '求情', '说情', '劝她', '劝他'] },
    照顾: { solo: ['照顾', '照料', '护理', '喂药', '看护'] },
    应变: { solo: ['急中生智', '随机应变', '打圆场', '补救', '救场'] },
    力量: { solo: ['扛起', '举起', '推开', '撬开', '搬起', '拽住'] },
    敏捷: { solo: ['接住', '扑过去', '抓住', '追上去', '冲过去'] },
    感知: { solo: ['仔细打量', '留意', '环顾四周', '端详'] },
    魅力: { solo: ['搭讪', '表白', '告白', '约她', '约他', '示好', '邀请她', '邀请他', '请她吃饭', '请他吃饭'] },
    智力: { solo: ['冷静下来', '忍住', '克制住', '压住火'] },
    // v2 附录 A：从属性词表拆出的技能，D&D 下才能体现熟练加值。
    侦查: { solo: ['侦查', '搜查', '调查', '寻找线索', '搜寻', '翻找', '四处搜', '搜一搜', '找线索'] },
    聆听: { solo: ['偷听', '听动静', '侧耳细听', '竖起耳朵'] },
    察言观色: { solo: ['看穿', '识破', '察言观色', '揣摩她', '揣摩他', '试探', '观察她的表情', '观察他的表情', '看出她', '看出他'] },
    潜行: { solo: ['溜进', '潜入', '蹑手蹑脚', '悄悄靠近', '躲藏', '偷偷溜', '摸进', '溜出', '藏起来'] },
    闪避: { solo: ['躲开', '闪开', '躲闪', '闪身', '躲过'] },
    攀爬: { solo: ['翻过', '攀爬', '爬上', '翻墙'] },
    格斗: { solo: ['打架', '出拳', '搏斗', '扭打', '揍他', '揍她', '动手打'] },
    射击: { solo: ['开枪', '射箭', '开火'] },
    医术: { solo: ['包扎', '止血', '急救'] },
    恐吓: { solo: ['威胁', '恐吓', '吓唬', '吓她', '吓他', '放狠话'] },
    魅惑: { solo: ['撩她', '撩他', '调情', '勾引', '抛媚眼'] },
    开锁: { solo: ['撬锁', '开锁'] },
    驾驶: { solo: ['开车', '驾车'] },
    // 都市常用 CoC 技能。「跳过」「查看」「估计」等泛词不收。
    电脑: { solo: ['写代码', '敲代码', '恢复数据', '编程序'] },
    查资料: { solo: ['查资料', '查阅资料', '翻阅档案', '查档案'] },
    伪装: { solo: ['乔装', '伪装成', '假扮', '易容'] },
    顺手牵羊: { solo: ['顺手牵羊', '偷偷拿走', '扒窃', '摸走钱包', '偷东西', '偷了她的', '偷了他的'] },
    投掷: { solo: ['扔向', '砸向', '投掷', '甩出飞镖'] },
    法律: { solo: ['查法条', '翻阅法条', '援引法条'] },
    财务: { solo: ['查账', '做账', '算账', '核对账目'] },
    外语: { solo: ['翻译外文', '读外文', '说外语'] },
    鉴定: { solo: ['估价', '估个价', '鉴定真伪'] },
    跳跃: { solo: ['纵身一跃', '跳过去', '跳下去'] },
    追踪: { solo: ['顺着脚印', '寻找踪迹', '循着踪迹'] },
    // 新增生活与负面技能：只收 2–4 个明确说法，泛词（玩、做、看）不收。
    唱歌: { solo: ['唱歌', '唱了首歌', '一展歌喉', '哼起歌'] },
    舞蹈: { solo: ['跳舞', '跳了支舞', '翩翩起舞', '练舞'] },
    摄影: { solo: ['拍照', '拍了张照', '按下快门', '摄影'] },
    写作: { solo: ['写小说', '写文章', '写稿', '码字'] },
    手工: { solo: ['做手工', '手工制作', '编织', '折纸'] },
    化妆: { solo: ['化妆', '上妆', '涂口红', '描眉'] },
    穿搭: { solo: ['搭配衣服', '穿搭', '挑衣服', '换上新衣'] },
    园艺: { solo: ['浇花', '种花', '修剪花草', '打理花园'] },
    照顾宠物: { solo: ['喂猫', '喂狗', '遛狗', '照顾宠物'] },
    酒量: { solo: ['拼酒', '灌酒', '干杯', '比酒量'] },
    安抚: { solo: ['安慰她', '安慰他', '安抚', '轻声安慰'] },
    八卦: { solo: ['聊八卦', '打听八卦', '传闲话', '八卦'] },
    撒娇: { solo: ['撒娇', '卖萌', '软磨硬泡'] },
    游戏: { solo: ['打游戏', '玩游戏', '打电竞', '开黑'] },
    棋牌: { solo: ['下棋', '打牌', '打麻将', '下象棋'] },
    记忆: { solo: ['默记', '背下来', '强记', '记住了所有'] },
    讲故事: { solo: ['讲故事', '讲了个故事', '说书', '讲笑话'] },
    演讲: { solo: ['发表演讲', '登台演讲', '做演讲', '致辞'] },
    调酒: { solo: ['调酒', '调了杯鸡尾酒', '摇酒'] },
    按摩: { solo: ['按摩', '揉肩', '推拿', '捏肩'] },
    砍价: { solo: ['砍价', '讲价', '压价', '还价'] },
    修理: { solo: ['修理', '动手修', '修水龙头', '修电路', '焊电路', '接线路'] },
    带娃: { solo: ['带娃', '哄孩子', '哄娃', '照看孩子'] },
    记路: { solo: ['记路', '认路', '记住路线', '辨认方向'] },
    撒谎: { solo: ['撒谎', '说谎', '骗她', '骗他', '编了个理由', '编个理由'] },
    勒索: { solo: ['勒索', '敲诈', '拿把柄威胁', '要挟'] },
    挑拨: { solo: ['挑拨', '挑拨离间', '离间', '煽风点火'] },
    造谣: { solo: ['造谣', '散布谣言', '传谣', '编造谣言'] },
    装可怜: { solo: ['装可怜', '卖惨', '博同情', '扮可怜'] },
    甩锅: { solo: ['甩锅', '推卸责任', '把责任推给', '嫁祸'] },
    画大饼: { solo: ['画大饼', '开空头支票', '画饼'] },
    道德绑架: { solo: ['道德绑架', '拿恩情压人', '拿道德压人'] },
    套话: { solo: ['套话', '套她的话', '套他的话', '旁敲侧击'] },
    拍马屁: { solo: ['拍马屁', '奉承', '溜须拍马', '讨好上司'] },
    煽动: { solo: ['煽动', '起哄', '鼓动大家', '蛊惑人心'] },
    精神控制: { solo: ['精神控制', '洗脑', '操控她的心', '操控他的心'] },
    下药: { solo: ['下药', '在酒里下', '投毒', '下了药'] },
    伪造: { solo: ['伪造', '仿造签名', '仿签名', '做假证'] },
    诈骗: { solo: ['诈骗', '骗钱', '行骗', '设局骗'] },
    销毁证据: { solo: ['销毁证据', '毁灭证据', '抹去痕迹', '毁掉证据'] },
    黑话: { solo: ['黑话', '对暗号', '打暗语', '对切口'] },
    尾随: { solo: ['尾随', '盯梢', '跟踪', '悄悄跟着'] },
    偷拍: { solo: ['偷拍', '偷偷拍下', '偷偷录下'] },
    作弊: { solo: ['作弊', '打小抄', '抄袭', '偷看答案', '出老千', '千术', '偷换牌', '藏牌'] },
    开溜: { solo: ['开溜', '溜之大吉', '找机会逃跑', '趁乱跑掉'] },
    赌博: { solo: ['赌博', '下注', '赌一把', '押注'] },
    看人下菜碟: { solo: ['看人下菜碟', '见风使舵', '看脸色行事', '看人行事'] },
    装病: { solo: ['装病', '装晕', '装死', '假装生病'] },
    下黑手: { solo: ['下黑手', '偷袭', '暗算', '从背后袭击'] },
});

export const DEFAULT_SKILL_LIST = Object.freeze([...BASE_ATTRIBUTES, ...DEFAULT_SPECIAL_SKILLS, ...CORE_SKILL_NAMES]);

// 词表优先级：用户词条 2 > 内置 1 > 学习表 0；同一个词只保留优先级最高的归属（易错点 G3）。
function buildLexicon(skills, extra, learned) {
    const allowed = new Set(skills);
    const solo = new Map();
    const combos = [];
    const put = (word, skill, rank) => {
        const w = String(word || '').trim();
        if (!w || !allowed.has(skill)) return;
        const cur = solo.get(w);
        if (!cur || cur.rank <= rank) solo.set(w, { skill, rank });
    };
    const addEntry = (skill, entry, rank) => {
        if (!entry) return;
        for (const w of entry.solo || []) put(w, skill, rank);
        if (allowed.has(skill) && entry.actions && entry.objects) combos.push({ skill, actions: entry.actions, objects: entry.objects, rank });
    };
    for (const [word, skill] of Object.entries(learned || {})) put(word, skill, 0);
    for (const [skill, entry] of Object.entries(BASE_LEXICON)) addEntry(skill, entry, 1);
    // 世界观附加技能词条：allowed 过滤，只有存档里真有该技能时才会命中；与核心同名的（急救、潜行、驾驶）合并词条。
    for (const [skill, entry] of Object.entries(WORLD_SKILL_LEXICON)) addEntry(skill, entry, 1);
    // 玩家自定义技能没有词条：按技能名本身命中（基础属性不按名字触发，避免「很健康」误判）。
    for (const skill of skills) if (!BASE_ATTRIBUTES.includes(skill) && !Object.hasOwn(BASE_LEXICON, skill) && !Object.hasOwn(WORLD_SKILL_LEXICON, skill)) put(skill, skill, 1);
    for (const [skill, entry] of Object.entries(extra || {})) addEntry(skill, entry, 2);
    return { solo, combos };
}

function occurrences(text, word, fn) {
    for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) fn(i);
}

function findHits(clause, lex) {
    const hits = [];
    for (const [word, { skill, rank }] of lex.solo) occurrences(clause, word, (i) => hits.push({ skill, start: i, end: i + word.length, rank }));
    for (const c of lex.combos) {
        for (const action of c.actions) {
            occurrences(clause, action, (i) => {
                const from = i + action.length;
                const tail = clause.slice(from, from + COMBO_WINDOW);
                for (const object of c.objects) {
                    const j = tail.indexOf(object);
                    if (j >= 0) hits.push({ skill: c.skill, start: i, end: from + j + object.length, rank: c.rank });
                }
            });
        }
    }
    return hits;
}

export function detectDifficulty(text) {
    const source = String(text ?? '');
    if (DIFFICULTY_WORDS.极难.some((w) => source.includes(w))) return '极难';
    if (DIFFICULTY_WORDS.困难.some((w) => source.includes(w))) return '困难';
    return '普通';
}

// 返回 { skill, difficulty, word, reason }。skill 为 null 时 reason 为 no-match / excluded / conflict（conflict 附 candidates，交辅助模型裁决）。
export function matchSkill(text, { skills = DEFAULT_SKILL_LIST, extra, learned } = {}) {
    const source = String(text ?? '').replace(QUOTED, (m) => ' '.repeat(m.length));
    const difficulty = detectDifficulty(source);
    const lex = buildLexicon(skills, extra, learned);
    const valid = [];
    let excluded = 0;
    let offset = 0;
    for (const part of source.split(/(?<=[。！？!?，,；;\n])/)) {
        const clause = part.replace(/^\s+/, '');
        const base = offset + (part.length - clause.length);
        offset += part.length;
        const hits = findHits(clause, lex);
        if (!hits.length) continue;
        if (MEMORY.test(clause) || THIRD_PERSON.test(clause)) { excluded += hits.length; continue; }
        for (const hit of hits) {
            const prefix = clause.slice(0, hit.start);
            const plain = prefix.replace(NOT_NEGATION, (w) => '　'.repeat(w.length));
            if (NEGATION.test(plain) || NEAR_NEGATION.test(plain) || OBSERVE.test(prefix)) { excluded += 1; continue; }
            valid.push({ ...hit, abs: base + hit.start, len: hit.end - hit.start, word: clause.slice(hit.start, hit.end) });
        }
    }
    // 引号外没有行动时，再看台词里的社交说法。
    if (!valid.length) {
        const quoted = findQuoteHits(String(text ?? ''), new Set(skills));
        valid.push(...quoted.hits);
        excluded += quoted.excluded;
    }
    if (!valid.length) return { skill: null, difficulty, reason: excluded ? 'excluded' : 'no-match' };
    valid.sort((a, b) => b.len - a.len || a.abs - b.abs || b.rank - a.rank);
    const top = valid[0];
    const tied = valid.filter((h) => h.len === top.len && h.abs === top.abs && h.rank === top.rank && h.skill !== top.skill);
    // word：冲突的那个词，辅助模型裁决后写进学习表（§4.1A 学习缓存）。
    if (tied.length) return { skill: null, difficulty, reason: 'conflict', word: top.word, candidates: [...new Set([top.skill, ...tied.map((h) => h.skill)])] };
    return { skill: top.skill, difficulty, word: top.word, reason: 'matched' };
}

// 学习缓存：辅助模型判过的「动作词 → 技能」记进本卡学习表；只收清单内技能与 1–8 字、不含数字的词。返回新对象。
export function learnSkillWord(learned, word, skill, skills = DEFAULT_SKILL_LIST) {
    const w = String(word || '').trim();
    if (!skills.includes(skill) || !w || w.length > 8 || /[0-9０-９]/.test(w)) return learned || {};
    return { ...(learned || {}), [w]: skill };
}

export function forgetSkillWord(learned, word) {
    if (!learned || !Object.hasOwn(learned, word)) return learned || {};
    const next = { ...learned };
    delete next[word];
    return next;
}
