// 正文自动识别立绘碰撞（纯函数）：宁可漏，不可错。施方取句首主语，受方取动作词后最近的点名角色；
// 任一方认不出、句子是否定或假设语气、写在引号里的台词，都不触发。同页已有 clash 标签时让位给标签。
import { CLASH_ACTIONS, resolveClashTier } from './clash-actions.js';
import { QUOTE_RE, namesOf, subjectOf } from './narration-sprite.js';

const DETECT_RULES = Object.freeze([
    { action: 'slap', re: /一巴掌|耳光|掴|扇(?![子动风形贝面区扇])/g },
    { action: 'punch', re: /一拳|揍|挥拳|捶(?=了|在|向|中)/g },
    { action: 'kick', re: /踹|一脚踢|踢(?=了|在|向|中|飞|开|倒)/g },
    { action: 'shove', re: /推开(?![门窗])|推了一把|一把推|推倒|猛推|搡/g },
    { action: 'bump', re: /撞了?个满怀|撞在一起|迎面撞上|撞上/g },
    { action: 'pat', re: /拍了?拍|敲了?敲|弹了?一?下/g, need: /^[^，,；;]{0,8}?(?:头|脑袋|额|脑门)/ },
    { action: 'hug', re: /扑进|扑到|扑向|扑上去|抱住|搂住|拥入怀|紧紧抱|一把抱/g },
    { action: 'highfive', re: /击掌/g },
]);

const NEGATE_RE = /没有?|没能|未曾|未|不(?![禁由住停断])|别|莫|差点|差一点|险些|几乎|想要?|打算|准备|试图|企图|恨不得|作势|假装|佯装|不敢|是否|会不会/;
const HYPO_RE = /如果|假如|要是|若是?|万一|假使|倘若|的话/;
// 不是此刻发生的。画面框（回忆、梦、照片 / 屏幕里）管整句；时间与转述（想起、上次、听说……）只管动作所在的分句，
// 「她想起昨天的事，抬手扇了他一巴掌」后一分句照常算。
const NOT_NOW_FRAME_RE = /回忆|记忆|梦[见到里中]|(?:照片|相片|屏幕|视频|电影|电视|画面|镜头|手机)(?:里|上|中)/;
const NOT_NOW_CLAUSE_RE = /想起|想到|那年|当年|曾经|以前|从前|上次|昨天|前天|听说|据说|说(?:她|他|自己|过|起)|告诉/;
// 比喻：「像一记耳光」「仿佛被揍了一拳」。
const SIMILE_RE = /像|仿佛|好像|似乎|如同|宛如|犹如|好似/;
// 动作词与受方之间只允许这些字：「扇了我」「扇在我脸上」「一拳打向我」；隔着别的话就不是打到这个人。
const OBJECT_GAP_RE = /^[了着向在到住上中往朝进打砸挥抽甩]{0,4}$/;
// 受方后面紧跟这些：撞上的是目光、扑到的是面前，不是碰到人。
const ABSTRACT_AFTER_RE = /^[^，,；;]{0,5}?(?:目光|视线|眼神|眸光|视野)|^的?(?:面前|跟前|身边|身旁|旁边|身后|对面)/;
// 「我的X」只认身体部位；「我的心」「我的话」不算碰到人。
const BODY_AFTER_RE = /^的(?:头|脑袋|额|脑门|脸|面颊|侧脸|肩|背|胸|腰|身|肚|小腹|腹|胃|肋|手|胳膊|臂|腿|膝|脚|屁股|后脑|下巴|嘴|唇|怀)/;
// 单字称呼的词内误认：我们、自我、其他、吉他……
const WORD_BEFORE_RE = /[自忘本无其吉利]$/;
const WORD_AFTER_RE = /^们/;
const USER_WORDS = Object.freeze(['你', '我']);
const PRONOUNS = Object.freeze({ 她: 'female', 他: 'male' });
const SENTENCE_RE = /[。！？!?…\n]+/;
const CLAUSE_RE = /[，,；;]/g;

function clauseStart(sentence, pos) {
    let from = 0;
    for (const m of sentence.slice(0, pos).matchAll(CLAUSE_RE)) from = m.index + 1;
    return from;
}

function marksOf(sentence, people, userNames) {
    const marks = [];
    const free = (s) => !marks.some((m) => s.start < m.end && m.start < s.end);
    const add = (word, mark) => {
        const single = word.length === 1;
        for (let at = sentence.indexOf(word); at >= 0; at = sentence.indexOf(word, at + word.length)) {
            const span = { start: at, end: at + word.length, ...mark };
            const inWord = single && (WORD_BEFORE_RE.test(sentence.slice(0, at)) || WORD_AFTER_RE.test(sentence.slice(span.end)));
            if (!inWord && free(span)) marks.push(span);
        }
    };
    const named = people.flatMap((p) => p.names.map((n) => ({ n, key: p.key }))).sort((a, b) => b.n.length - a.n.length);
    for (const { n, key } of named) add(n, { kind: 'own', key });
    for (const n of [...userNames].sort((a, b) => b.length - a.length)) add(n, { kind: 'user' });
    for (const n of USER_WORDS) add(n, { kind: 'user' });
    for (const [n, gender] of Object.entries(PRONOUNS)) add(n, { kind: 'pronoun', gender });
    return marks.sort((a, b) => a.start - b.start);
}

// 代词只在候选唯一时认人：同屏在场的人（排除另一方），性别已知时按她 / 他筛。
function resolveMark(mark, { onStage, genderOf, exclude }) {
    if (!mark) return null;
    if (mark.kind === 'own') return { key: mark.key };
    if (mark.kind === 'user') return { user: true };
    const pool = onStage.filter((key) => key !== exclude).filter((key) => {
        const g = genderOf(key);
        return !g || g === mark.gender;
    });
    return pool.length === 1 ? { key: pool[0] } : null;
}

function partyName(party) {
    return party.user ? '{{user}}' : party.key;
}

function scanSentence(sentence, ctx) {
    const found = [];
    const hits = DETECT_RULES.flatMap((rule) => [...sentence.matchAll(rule.re)].map((m) => ({ rule, at: m.index, end: m.index + m[0].length })))
        .sort((a, b) => a.at - b.at);
    if (!hits.length) return found;
    const marks = marksOf(sentence, ctx.people, ctx.userNames);
    for (const { rule, at, end } of hits) {
        if (rule.need && !rule.need.test(sentence.slice(end))) continue;
        const from = clauseStart(sentence, at);
        if (NEGATE_RE.test(sentence.slice(from, at)) || HYPO_RE.test(sentence.slice(0, at))) continue;
        if (NOT_NOW_FRAME_RE.test(sentence.slice(0, at)) || NOT_NOW_CLAUSE_RE.test(sentence.slice(from, at)) || SIMILE_RE.test(sentence.slice(from, at)) || /^过/.test(sentence.slice(end))) continue;
        const before = marks.filter((m) => m.end <= at);
        const clauseEnd = (() => { const rest = sentence.slice(end).search(CLAUSE_RE); return rest < 0 ? sentence.length : end + rest; })();
        let subject = null;
        let object = marks.find((m) => m.start >= end && m.start < clauseEnd && OBJECT_GAP_RE.test(sentence.slice(end, m.start))) || null;
        const last = before[before.length - 1];
        const leadIn = last ? sentence.slice(Math.max(from, last.start - 1), last.start) : '';
        // 「给了我一拳」：受方在动作词前，紧挨着「给（了）」。
        const given = last && last.start >= from && /给了?$/.test(sentence.slice(from, last.start)) && /^[^，,；;]{0,2}$/.test(sentence.slice(last.end, at));
        if (given && !object) {
            object = last;
            const idx = subjectOf(sentence, marks, last.start);
            subject = idx >= 0 && marks[idx] !== last ? marks[idx] : null;
        } else if (last && last.start >= from && /[把将]$/.test(leadIn)) {
            object = last;
            const idx = subjectOf(sentence, marks, last.start);
            subject = idx >= 0 && marks[idx] !== last ? marks[idx] : null;
        } else if (last && last.start >= from && /被$/.test(leadIn)) {
            const idx = subjectOf(sentence, marks, last.start);
            subject = last;
            object = idx >= 0 && marks[idx] !== last ? marks[idx] : null;
        } else if (!object && last && last.start >= from && /[和与跟同]$/.test(leadIn)) {
            object = last;
            const idx = subjectOf(sentence, marks, last.start);
            subject = idx >= 0 && marks[idx] !== last ? marks[idx] : null;
        } else {
            const idx = subjectOf(sentence, marks, at);
            subject = idx >= 0 ? marks[idx] : null;
        }
        if (!subject || !object || subject === object) continue;
        const afterObject = sentence.slice(object.end);
        if (ABSTRACT_AFTER_RE.test(afterObject) || (/^的/.test(afterObject) && !BODY_AFTER_RE.test(afterObject))) continue;
        const attackerFirst = subject.kind !== 'pronoun' ? resolveMark(subject, ctx) : null;
        const target = resolveMark(object, { ...ctx, exclude: attackerFirst && attackerFirst.key });
        const attacker = attackerFirst || resolveMark(subject, { ...ctx, exclude: target && target.key });
        if (!attacker || !target) continue;
        if (attacker.user && target.user) continue;
        if (!attacker.user && !target.user && attacker.key === target.key) continue;
        found.push({ attacker: partyName(attacker), target: partyName(target), action: rule.action, tier: resolveClashTier(rule.action, '', sentence) });
        break;
    }
    return found;
}

// people：[{ key, aliases, gender }]（gender 为 'female' / 'male' / ''）；onStage：此刻画面上的角色主名；userNames：主角在正文里的称呼。
export function detectClashes(text, { people = [], onStage = [], userNames = [], limit = 2 } = {}) {
    const body = String(text || '').replace(QUOTE_RE, '');
    if (!body.trim()) return [];
    const roster = (Array.isArray(people) ? people : []).map((p) => ({ key: String(p.key || '').trim(), names: namesOf(p.key, p.aliases).filter((n) => Array.from(n).length >= 2 || n === p.key), gender: p.gender || '' })).filter((p) => p.key);
    const genders = new Map(roster.map((p) => [p.key, p.gender]));
    const ctx = {
        people: roster,
        onStage: (Array.isArray(onStage) ? onStage : []).map((k) => String(k || '').trim()).filter(Boolean),
        genderOf: (key) => genders.get(key) || '',
        userNames: (Array.isArray(userNames) ? userNames : []).map((n) => String(n || '').trim()).filter((n) => n && !USER_WORDS.includes(n)),
    };
    const out = [];
    for (const sentence of body.split(SENTENCE_RE)) {
        if (out.length >= limit) break;
        if (!sentence.trim()) continue;
        out.push(...scanSentence(sentence, ctx));
    }
    return out.slice(0, limit);
}

// 本页要播的碰撞：有标签用标签（档位按正文补齐），否则在开启自动识别时识别正文。
export function pageClashes(tagged, text, { auto = true, ...detect } = {}) {
    const list = Array.isArray(tagged) ? tagged.filter((c) => c && c.target) : [];
    if (list.length) return list.map((c) => ({ ...c, action: Object.hasOwn(CLASH_ACTIONS, c.action) ? c.action : 'hit', tier: resolveClashTier(c.action, c.tier, text) }));
    return auto ? detectClashes(text, detect) : [];
}
