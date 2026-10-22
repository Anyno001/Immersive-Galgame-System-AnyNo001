// 先掷后写的技能匹配词系统（§4.1A）：本地词表为主，辅助模型只兜底。
// 组合词需「动作词 + 对象词」同时命中（防止「做作业」判成烹饪）；否定、假设、引号台词、回忆梦境、旁观他人不触发。
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS } from './stat-state.js';
import { WORLD_SKILL_LEXICON } from './stat-world-skills.js';

const COMBO_WINDOW = 6;
const NEGATION = /(不想|不会|不要|不能|没有|没|别|不|如果|要是|假如|假设|打算|万一)/;
const OBSERVE = /(看|望|盯|瞧|观看|围观|旁观)(着|了)?(她|他|它|他们|她们|别人|对方|大家)/;
const THIRD_PERSON = /^(她|他|它|他们|她们|对方|别人|大家)(?!和我|跟我|与我)/;
const MEMORY = /回忆|回想|记得|记忆中|梦里|梦中|梦见|梦到|当年|那时候/;
const QUOTED = /“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g;

export const DIFFICULTY_WORDS = Object.freeze({
    极难: Object.freeze(['传说级', '不可能', '极限', '奇迹般']),
    困难: Object.freeze(['精致', '高难度', '第一次', '赶时间', '复杂', '专业级']),
});

export const BASE_LEXICON = Object.freeze({
    烹饪: { actions: ['做', '煮', '炒', '烤', '煎', '炖', '蒸', '包'], objects: ['饭', '菜', '汤', '面', '甜点', '寿司', '便当', '蛋糕', '饼干', '饺子', '早餐', '午餐', '晚餐', '夜宵', '点心', '咖喱'], solo: ['下厨', '掌勺', '烘焙', '烹饪', '做饭', '煮饭', '料理'] },
    家务: { actions: ['打扫', '收拾', '整理', '洗', '擦', '拖'], objects: ['房间', '屋子', '衣服', '碗', '地板', '桌子', '窗户', '厨房'], solo: ['做家务', '大扫除', '打扫'] },
    学习: { actions: ['复习', '学', '背', '做', '写', '预习'], objects: ['作业', '功课', '单词', '课文', '习题', '试卷', '笔记', '论文'], solo: ['温书', '备考', '刷题'] },
    运动: { actions: ['打', '踢'], objects: ['篮球', '足球', '网球', '羽毛球', '排球'], solo: ['锻炼', '健身', '晨跑', '跑步', '游泳'] },
    艺术: { actions: ['画', '弹', '唱', '拉', '拍', '写'], objects: ['钢琴', '吉他', '歌', '小提琴', '照片', '曲子', '诗'], solo: ['作画', '演奏', '绘画', '素描', '写生', '画画', '画像'] },
    话术: { solo: ['说服', '劝说', '讨价还价', '砍价', '谈判', '套话', '辩论', '忽悠', '哄她', '哄他'] },
    照顾: { solo: ['照顾', '照料', '护理', '喂药', '包扎', '看护'] },
    应变: { solo: ['急中生智', '随机应变', '打圆场', '补救', '救场'] },
    力量: { solo: ['扛起', '举起', '推开', '撬开', '搬起', '拽住'] },
    敏捷: { solo: ['翻过', '攀爬', '爬上', '溜进', '潜入', '躲开', '闪开', '接住'] },
    观察: { solo: ['侦查', '搜查', '调查', '寻找线索', '仔细打量', '留意'] },
    魅力: { solo: ['搭讪', '表白', '告白', '约她', '约他', '示好', '撩她', '撩他'] },
    理智: { solo: ['冷静下来', '忍住', '克制住', '压住火'] },
});

export const DEFAULT_SKILL_LIST = Object.freeze([...BASE_ATTRIBUTES, ...DEFAULT_SPECIAL_SKILLS]);

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
    // 世界观附加技能词条：allowed 过滤，只有存档里真有该技能时才会命中。
    for (const [skill, entry] of Object.entries(WORLD_SKILL_LEXICON)) if (!Object.hasOwn(BASE_LEXICON, skill)) addEntry(skill, entry, 1);
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
            if (NEGATION.test(prefix) || OBSERVE.test(prefix)) { excluded += 1; continue; }
            valid.push({ ...hit, abs: base + hit.start, len: hit.end - hit.start, word: clause.slice(hit.start, hit.end) });
        }
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
