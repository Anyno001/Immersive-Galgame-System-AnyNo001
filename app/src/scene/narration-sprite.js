// 旁白页沿用上一位说话人的立绘（纯函数）：
// - 旁白写到「这个人 + 离开」的那一句起，立绘清掉，之后的旁白也不再沿用（再开口或正文写回来才回来）；
//   主语须是这个人：名字、别名，或句首没有别人时的「她/他」（指代最近说话人）；「看着她离开」「她的视线离开」不算；
// - 否则紧跟台词的 2 页旁白照常沿用；再往后只有旁白里还写着这个人才留着。
// 第二人称视角的角色（玩家本人、或本楼有心里话的人）在旁白里写作「你」，也算写到。

export const NARRATION_HOLD_PAGES = 2;

const LEAVE_RE = /离开(?!了?(?:前|之前|时|以前|的时候)|了?(?:座|椅|凳|沙发|床|桌|原位|地面|地板|身边|视线|[他她它你我]的?(?:怀|身|唇|嘴|手|肩|视线)))|离去|离场|走了(?![过进入回两三几一半很好许]|出来)|走掉|走远|走出(?!来|了?(?:阴影|阴霾|悲伤|悲痛|困境|回忆|低谷|谷底|情绪|痛苦|绝望|泥潭|噩梦|迷茫|失落|伤痛|过去|误区|沉默|漩涡))|走开|跑出(?!来)|出去|走下(?=楼|台阶|阶梯|山|车|船)|走进(?=了?(?:走廊|楼道|长廊|通道|电梯|夜色|雨幕|人群))|退下(?![盔甲])|退出|退向|退到|退回|告辞|告退|出门|出了门|下楼|转身离|转身走|拂袖而去|扬长而去|夺门而出|冲出(?!重围|包围)|跑开|跑走|溜走|离线|下线|消失在|不见了|身影远去/g;
const RETURN_RE = /回来|走进(?!了?[他她你我]?的?(?:心|回忆|生活|世界)|了?(?:走廊|楼道|长廊|通道|电梯|夜色|雨幕|人群))|走入|踏入|进来|[走跑冲钻闪踱迈]了?出来|跟了?上来|追了?上来|推门而入|推门进|闯进|折返|返回|归来|重新出现|现身|出现在(?!脑|心|记忆|梦)|赶到|回到(?:房|屋|室|厅|殿|场)/g;
const OBSERVE_RE = /看着|望着|盯着|注视|目送|看向|看见|瞥见|送|拉着|拽着|带着|扶着/;
// 主语前是使役 / 观察词（让她离开、目送她离开），或之间有意愿 / 假设词（想离开、如果离开），不算已离开。
const CAUSE_BEFORE_RE = /(?:让|叫|令|请|劝|求|目送|看着|望着|盯着|注视|看见|瞥见|看向)$/;
const INTENT_BETWEEN_RE = /想要?|打算|准备|试图|企图|欲|如果|假如|若是?|能否|可以|应该|是否|说要/;
const NEGATE_RE = /(?:不|没|未|别|莫|不曾|没有|不肯|不愿|不想)$/;
const PRONOUN_RE = /[她他它]|TA/g;
// 和主角一起走（我和她一起走出教室、她跟着你出了门）不算离场：镜头跟着走。
const WITH_SELF_BEFORE_RE = /(?:我|你|我们|咱们)(?:和|与|跟|同|陪着?|带着|拉着|牵着)$/;
const WITH_SELF_BETWEEN_RE = /一起|一同|并肩|结伴|(?:跟着|陪着?|随着?|带着|拉着|牵着|挽着|和|与|跟|同)(?:我|你)/;
// 名字到离开动作之间最多隔多少字（同一句里）。
const LEAVE_REACH = 20;

// 后两字是称谓时不当简称：尚义嬷嬷 不认「嬷嬷」。
const TITLE_RE = /^(?:嬷嬷|姐姐|哥哥|妹妹|弟弟|大人|小姐|先生|公子|少爷|夫人|姑娘|老师|同学|殿下|阿姨|叔叔|伯伯|奶奶|爷爷|妈妈|爸爸|前辈|师兄|师姐|师父|师傅|阁下|大哥|大姐|太太|老爷|娘娘|陛下|宝宝)$/;

const NAME_SEP_RE = /[·•・\s]+/;

export function namesOf(name, aliases) {
    const list = [name, ...(Array.isArray(aliases) ? aliases : [])].map((s) => String(s || '').trim()).filter(Boolean);
    // 三四个字的中文名也认后两字：李哪吒 → 哪吒。
    // 带间隔号 / 空格的外文译名按分隔符拆开，≥2 字的部分算简称（伊丽莎白·班纳特 → 伊丽莎白、班纳特），不套后两字规则。
    for (const n of [...list]) {
        if (NAME_SEP_RE.test(n)) list.push(...n.split(NAME_SEP_RE).map((part) => part.trim()).filter((part) => Array.from(part).length >= 2));
        else if (/^[一-鿿]{3,4}$/.test(n) && !TITLE_RE.test(n.slice(-2))) list.push(n.slice(-2));
    }
    return [...new Set(list)];
}

function spansOf(sentence, list, kind) {
    const out = [];
    for (const n of list) {
        for (let at = sentence.indexOf(n); at >= 0; at = sentence.indexOf(n, at + n.length)) out.push({ start: at, end: at + n.length, kind });
    }
    return out;
}

// gender 已知时，性别对不上的她 / 他算别人（和旁白点名的指代消解一致）。
// 「你 / 我 / 我们」带 self：对方视角下是主角在动（见 eventsOf 的随主角离开）；pov 角色自己则把它们当本名。
function markersOf(sentence, own, others, gender = '', pov = false, selfNames = []) {
    const marks = spansOf(sentence, own, 'own');
    const free = (s) => !marks.some((m) => s.start < m.end && m.start < s.end);
    // 酒馆用户名 / User 立绘别名和「你 / 我」同等对待。
    for (const m of marks) if (selfNames.includes(sentence.slice(m.start, m.end))) { m.self = true; m.you = true; }
    if (!pov) for (const s of spansOf(sentence, selfNames, 'other')) if (free(s)) marks.push({ ...s, self: true, you: true });
    for (const s of spansOf(sentence, others, 'other')) if (free(s)) marks.push(s);
    for (const s of spansOf(sentence, ['你'], pov ? 'own' : 'other')) if (free(s)) marks.push({ ...s, self: true, you: true });
    for (const word of ['我们', '咱们', '我']) {
        for (const s of spansOf(sentence, [word], pov ? 'own' : 'self')) if (free(s)) marks.push({ ...s, self: true, you: pov, group: word !== '我' });
    }
    for (const m of sentence.matchAll(PRONOUN_RE)) {
        const clash = gender === 'none' || (gender === 'male' && m[0] === '她') || (gender === 'female' && m[0] === '他');
        const s = { start: m.index, end: m.index + m[0].length, kind: clash ? 'other' : 'pronoun' };
        if (free(s)) marks.push(s);
    }
    return marks.sort((a, b) => a.start - b.start);
}

// 动作的主语：所在小句（逗号分隔）里最近的标记；小句里没有主语时，沿用前面最近一个有标记的小句的头一个（省略主语）。返回下标，-1 为找不到。
export function subjectOf(sentence, marks, at) {
    const clauseStart = (pos) => { let from = 0; for (const c of sentence.slice(0, pos).matchAll(/[，,；;]/g)) from = c.index + 1; return from; };
    let nearest = -1;
    for (let i = 0; i < marks.length && marks[i].end <= at; i++) nearest = i;
    if (nearest < 0) return -1;
    if (marks[nearest].start >= clauseStart(at)) return nearest;
    const from = clauseStart(marks[nearest].start);
    return marks.findIndex((m) => m.start >= from);
}

// 主角带着她走：同句有同行词、或写到本人跟着，不算对方离场。
const SELF_MOVE_RE = /走向|奔向|跑向|前往|赶往|回到(?!座|位|椅|凳|桌|床|沙发|原位|正题|话题|现实|过去|当初)/g;
const COMPANY_SIGNAL_RE = /一起|一同|并肩|结伴|同行|陪|跟|带着|带上|拉着|牵着|挽着|搀|携|追|我们|咱们|你们|两人|二人|一行人|大家/;
const POV_LEAVE_KEEP_RE = /^(?:离线|下线|退出|消失在|不见了)/;
const ENTER_RE = /^(?:走进|走入|踏入|推门进|推门而入|闯进)/;

// 一句里「这个人」做主语的离开 / 回来事件（按出现顺序）。prevMixed：上一句出现了别人，句首代词指代不明。
// ctx.follows(sentence)：主角（你 / 我）走开时对方是否跟着（同句同行词 / 和本人一起 / 下一页写他跟上）。
function eventsOf(sentence, marks, prevMixed, ctx = {}) {
    const events = [];
    const scan = (re, type, selfMove = false) => {
        for (const m of sentence.matchAll(re)) {
            const nearest = subjectOf(sentence, marks, m.index);
            if (nearest < 0) continue;
            const mark = marks[nearest];
            if (mark.self) {
                if (type !== 'leave') continue;
                const before = sentence.slice(0, m.index);
                if (NEGATE_RE.test(before) || INTENT_BETWEEN_RE.test(sentence.slice(mark.end, m.index))) continue;
                if (CAUSE_BEFORE_RE.test(sentence.slice(Math.max(0, mark.start - 4), mark.start))) continue;
                // pov 角色自己走动镜头跟着，不清自己；只认下线 / 退出这类真离场。
                if (mark.you && ctx.pov) { if (!POV_LEAVE_KEEP_RE.test(m[0])) continue; } else if (mark.you || mark.kind === 'self') {
                    if (mark.group || !ctx.selfMove || (ctx.follows && ctx.follows(sentence))) continue;
                } else continue;
                events.push({ at: m.index, type, who: nearest, soft: true });
                continue;
            }
            if (selfMove) continue;
            if (mark.kind === 'other') continue;
            if (mark.kind === 'pronoun' && (nearest > 0 || prevMixed)) continue;
            if (m.index - mark.start > LEAVE_REACH) continue;
            const between = sentence.slice(mark.end, m.index);
            if (between.includes('的') || OBSERVE_RE.test(between)) continue;
            if (type === 'leave' && (CAUSE_BEFORE_RE.test(sentence.slice(Math.max(0, mark.start - 4), mark.start)) || INTENT_BETWEEN_RE.test(between))) continue;
            if (type === 'leave' && NEGATE_RE.test(sentence.slice(0, m.index))) continue;
            if (type === 'leave' && (WITH_SELF_BEFORE_RE.test(sentence.slice(Math.max(0, mark.start - 4), mark.start)) || WITH_SELF_BETWEEN_RE.test(between) || (ctx.selfBefore && ctx.selfBefore(sentence.slice(0, mark.start))))) continue;
            events.push({ at: m.index, type, who: nearest, enter: type === 'return' && ENTER_RE.test(m[0]) });
        }
    };
    scan(LEAVE_RE, 'leave');
    scan(SELF_MOVE_RE, 'leave', true);
    scan(RETURN_RE, 'return');
    events.sort((a, b) => a.at - b.at);
    // 「转身走进浴室」：同一主语先有离开动作再「走进」别处，是离场，不是回来。
    return events.filter((e) => !(e.enter && events.some((l) => l.type === 'leave' && l.who === e.who && l.at < e.at)));
}

// 按页序推导：最后一个事件说了算。gone=true 表示此刻已离场；back 为最近一次「回来」所在页下标（没有为 -1）。
// 离场后 gone 一直保留，直到被写回来（initialGone：此前已知离场，新建 tracker 时带上）。
function createPresenceTracker(names, others, gender = '', { pov = false, gone: initialGone = false, selfMove = false, self = [] } = {}) {
    // 主角名字（酒馆用户名、User 立绘别名）在名字前：「林远跟小雪走出教室」是一起走。
    const selfNames = self.map((n) => String(n || '').trim()).filter(Boolean);
    const selfBefore = selfNames.length ? (head) => selfNames.some((n) => head.endsWith(n + '和') || head.endsWith(n + '与') || head.endsWith(n + '跟') || head.endsWith(n + '同') || /陪着?$|带着$|拉着$|牵着$/.test(head) && head.slice(0, head.search(/(?:陪着?|带着|拉着|牵着)$/)).endsWith(n)) : null;
    const own = names;
    const rest = (Array.isArray(others) ? others : []).map((s) => String(s || '').trim()).filter((s) => s.length >= 2 && !own.includes(s));
    const withOwn = names.length ? new RegExp(`(?:和|与|跟|同)(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`) : null;
    let gone = initialGone;
    let back = -1;
    let soft = false;
    let prevMixed = false;
    // 下一页开头写到他跟上来（「小雪小跑着跟了上来」）也算同行。
    const nextFollows = (next) => {
        const first = String(next || '').replace(QUOTE_RE, '').split(/[。！？!?\n]/).find((s) => s.trim()) || '';
        return COMPANY_SIGNAL_RE.test(first) && (names.some((n) => first.includes(n)) || /[她他]/.test(first));
    };
    return { push(text, index, next = '', dry = false) {
        const saved = { gone, back, prevMixed, soft };
        const bare = selfMove || pov ? String(text || '').replace(QUOTE_RE, '') : String(text || '');
        const follows = (sentence) => COMPANY_SIGNAL_RE.test(sentence) || Boolean(withOwn && withOwn.test(sentence)) || nextFollows(next);
        for (const sentence of bare.split(/[。！？!?\n]/)) {
            if (!sentence) continue;
            const marks = markersOf(sentence, own, rest, gender, pov, selfNames);
            for (const event of eventsOf(sentence, marks, prevMixed, { pov, selfMove, follows, selfBefore })) {
                if (event.type === 'leave') { gone = true; back = -1; soft = Boolean(event.soft); } else if (gone) { gone = false; back = index; soft = false; }
            }
            // 无人称的旁白不改变最近明确提到的人；否则后一句「他走了」会被每位同屏陪衬各自认领。
            if (marks.some((m) => m.kind === 'own' || m.kind === 'other')) {
                prevMixed = marks.some((m) => m.kind === 'other' || m.you);
            }
        }
        const result = { gone, back, soft: gone && soft };
        if (dry) ({ gone, back, prevMixed, soft } = saved);
        return result;
    } };
}

function presenceOf(pages, names, others, options) {
    const tracker = createPresenceTracker(names, others, '', options);
    let state = { gone: false, back: -1 };
    pages.forEach((text, index) => { state = tracker.push(text, index, pages[index + 1]); });
    return state;
}

// 整楼顺序准备时只消费新增的一页，和 narrationKeepsSprite 共用同一套离场 / 回来判断。
// hold：沿用页数，旁白点名页自己也算一页时传 NARRATION_HOLD_PAGES + 1。
// gone：此前已知离场（旁白又点到他的名字时，不能当作新上场）。返回的函数带 .gone：这一页是真离场而不是沿用到期。
export function createNarrationSpriteTracker({ name, aliases = [], others = [], pov = false, gender = '', hold = NARRATION_HOLD_PAGES, gone: wasGone = false, self = [] } = {}) {
    const names = namesOf(name, aliases);
    const tracker = createPresenceTracker(names, others, gender, { pov, gone: wasGone, selfMove: !pov, self });
    let count = 0;
    const push = (text, next = '') => {
        const { gone, back, soft } = tracker.push(text, count++, next);
        // 软撤：只因「你 / 我」走开而对方没跟，结束沿用和座位，不算她本人离场（旁白再写到她照常点出来）。
        push.gone = Boolean(names.length) && gone && !soft;
        push.soft = Boolean(names.length) && gone && soft;
        if (!names.length || gone) return false;
        if (count - Math.max(0, back) <= hold) return true;
        const current = String(text || '');
        return names.some(n => current.includes(n)) || (pov && current.includes('你'));
    };
    push.gone = false;
    push.soft = false;
    return push;
}

// pages：说话页之后到本页为止的各页文字（按顺序，最后一项是本页）。others：其他角色的名字 / 别名，用来判断主语和代词指代。
export function narrationKeepsSprite({ name, aliases = [], others = [], pov = false, pages = [] } = {}) {
    const names = namesOf(name, aliases);
    if (!names.length || !pages.length) return false;
    const { gone, back } = presenceOf(pages, names, others, { pov, selfMove: !pov });
    if (gone) return false;
    const held = back >= 0 ? pages.slice(back) : pages;
    if (held.length <= NARRATION_HOLD_PAGES) return true;
    const current = String(pages[pages.length - 1] || '');
    return names.some((n) => current.includes(n)) || (pov && current.includes('你'));
}

// 同屏陪衬是否已被正文写走：text 为他最后一次开口之后到本页的原文。
// pronoun=false：她 / 他 不算这个人（同屏多人时代词由旁白点名的指代消解认领，不让每个陪衬各自认领）。
export function narrationCastLeft({ name, aliases = [], others = [], text = '', pronoun = true, gender = '' } = {}) {
    return createCastLeftTracker({ name, aliases, others, pronoun, gender }).peek(text);
}

// 同屏陪衬逐段喂文字（每页只喂新增的），结果和一次性喂整段 narrationCastLeft 一致：
// 只提交到最后一个句末标点，没写完的半句每次临时判断，不进状态。next：下一页文字，判断「主角走开、他跟上来」。
export function createCastLeftTracker({ name, aliases = [], others = [], pronoun = true, gender = '', self = [] } = {}) {
    const names = namesOf(name, aliases);
    const tracker = names.length ? createPresenceTracker(names, others, pronoun ? gender : 'none', { selfMove: true, self }) : null;
    let pending = '';
    const api = {
        feed(chunk, next = '') {
            if (!tracker) return false;
            // 上一段里写完的句子这时才提交（下一页已知，可判断「他跟上来」），没写完的半句连同新段临时判断，不进状态。
            const cut = Math.max(pending.lastIndexOf('。'), pending.lastIndexOf('！'), pending.lastIndexOf('？'), pending.lastIndexOf('!'), pending.lastIndexOf('?'), pending.lastIndexOf('\n'));
            if (cut >= 0) {
                tracker.push(pending.slice(0, cut + 1), 0, String(chunk || ''));
                pending = pending.slice(cut + 1);
            }
            pending += String(chunk || '');
            return tracker.push(pending, 0, next, true).gone;
        },
        peek(text) { return api.feed(text); },
    };
    return api;
}

export function otherNamesOf(characters, aliasMap, selfKey, extra = []) {
    const out = new Set();
    const aliases = aliasMap && typeof aliasMap === 'object' ? aliasMap : {};
    for (const key of Object.keys(characters && typeof characters === 'object' ? characters : {})) {
        if (key === selfKey) continue;
        for (const n of namesOf(key, aliases[key])) out.add(n);
    }
    for (const n of Array.isArray(extra) ? extra : []) if (n) out.add(String(n));
    return [...out];
}

// —— 旁白提到一个人时，他是否真的在眼前（换场景往后看与旁白点名共用）——
export const QUOTE_RE = /“[^”]*”|「[^」]*」|『[^』]*』|"[^"\n]*"/g;
// 同一小句里名字前有这些词：回忆、传闻、梦、错觉，人不在眼前。
export const ABSENT_RE = /听说|听闻|据说|传闻|想起|想到|梦见|梦到|梦里|梦中|回忆|记得|以为|仿佛|好像|似乎|恍惚/;
export const MEDIA_RE = /屏幕|手机|视频|照片|相片|电视|广播|录像|录音|直播|新闻|报纸|杂志|海报|电话|听筒|画面|监控|投影|相框/;
// 名字后面紧跟「还没来 / 不在」：人不在眼前。
export const ABSENT_AFTER_RE = /^[^，,；;。！？]{0,2}?(?:还?没来(?!得及|由)|没有来|没到|没回来|缺席|不在(?!意|乎|话下|场证明))/;
export const MEDIA_AFTER_RE = /^的?(?:照片|相片|消息|信息|短信|来信|信件|信|名字|画像|肖像|影子|留言|语音|视频|头像|帖子|动态|新闻|报道)/;
const UNSEEN_RE = /(?:没|没有|未|未曾|不曾|并未|从未|从没)(?:看|听|见|瞧|望|瞥|发现|注意|察觉|找)[^，,；;]{0,4}$|[看听找瞧望][不没](?:见|到|着)[^，,；;]{0,4}$/;

export function mentionIsAbsent(sentence, start, end) {
    const s = String(sentence || '');
    const clause = s.slice(0, start).split(/[，,；;]/).pop();
    return ABSENT_RE.test(clause) || UNSEEN_RE.test(clause) || MEDIA_RE.test(clause) || MEDIA_AFTER_RE.test(s.slice(end)) || ABSENT_AFTER_RE.test(s.slice(end));
}

// —— 换场景时这个人是否跟到新场景（纯函数）——
// before / after：场景标签前一句、后一句；ahead：新场景前几页 { text, by }（by：'own' 本人开口 / 'other' 别人开口 / '' 旁白），
// 调用方已截在下一个场景标签之前。self：主角的名字。timeJump：标签时段变了。mode：strict / smart / loose。
// 规则：分开信号一律清；跳时间只认新场景里出场；移动看同行或集体主语，否则往后看；硬切往后看。
// sceneCarryOf 返回保留依据：'ahead' 新场景里出场 / 'company' 同行 / 'group' 集体主语 / 'loose' 宽松档默认留 / '' 清掉；
// 同行与集体主语没经新场景确认，同屏陪衬按旁白沿用规则衰减。
export const SCENE_AHEAD_PAGES = 3;
const SEPARATE_RE = /独自|独身|孤身|只身|一个人|告别|道别|作别|辞别|分开|分别(?=了|后|之后|时)|分手|目送|各自|各回各|回到自己的|回了自己的|散了|散去|离别/g;
const SEPARATE_NEGATE_RE = /(?:不|没|未|别|莫|不再|没有|不必|不用|不想|不愿|不肯|不是|并非|另|每|任何|哪)$/;
const TIME_JUMP_RE = /第二天|第二日|次日|翌日|翌晨|隔天|隔日|当晚|当夜|入夜后|[几数一两三四五六七八九十]+个?(?:小时|钟头|天|日|周|星期|月|年)(?:之|以)?后|过了(?:几|数|好几|一|两|三)?个?(?:天|日|周|星期|月|年)|转眼间?|不久之后/;
const MOVE_RE = /走到|来到|回到|赶到|跑到|进了|出了|上车|下车|到达|抵达|穿过|走进|走出|走向|前往|去往|奔向/;
// 「和 / 与 / 跟 / 同」要窗口内有主角（你 / 我 / 我们 / 主角名）才算同行：「白墨和阿宁留在原地」不是跟主角走。
const COMPANY_RE = /跟(?=在|着|随|上)|陪|带着|拉着|牵着|挽着|扶着|背着|抱着|领着|携|一起|一同|同行|并肩|结伴/;
const COMPANY_WITH_RE = /和|与|跟|同(?=[她他你我])/;
// 留下的人：宽松档不认（保持默认全员跟过来）。
const STAY_RE = /留在(?!心|脑|记忆)|留下(?!了?(?:一|印|痕|话|信|字|名|号|礼|眼泪|泪|血|伤|疤|影|阴影|回忆))|待在|原地|没有?跟|留守/g;
const GROUP_RE = /我们|咱们|两人|二人|两个人|他俩|她俩|俩|一行人|众人|大家|一起/;
const LATE_RE = /推门|闯了?进|走了?进|进来|赶来|赶到|赶了过来|出现|现身|到来|来到|回来|归来|返回|折返/;
const COMPANY_REACH = 4;

function taggedSpans(sentence, groups) {
    const marks = [];
    const free = (s) => !marks.some((m) => s.start < m.end && m.start < s.end);
    for (const [kind, list] of groups) for (const s of spansOf(sentence, list, kind)) if (free(s)) marks.push(s);
    return marks.sort((a, b) => a.start - b.start);
}

function pronounsFor(gender) {
    return gender === 'male' ? ['他'] : gender === 'female' ? ['她'] : ['她', '他'];
}

function separatedAt(sentences, own, self, others) {
    for (const s of sentences) {
        const marks = taggedSpans(s, [['own', own], ['self', self], ['other', others], ['pronoun', ['她', '他']]]);
        for (const m of s.matchAll(SEPARATE_RE)) {
            if (SEPARATE_NEGATE_RE.test(s.slice(0, m.index))) continue;
            let mark = null;
            for (const k of marks) if (k.end <= m.index) mark = k;
            // 主语是别人（「小雪独自走了」对小月）不算；本人、主角、代词或省略主语都算。
            if (!mark || mark.kind !== 'other') return true;
        }
    }
    return false;
}

// 「白墨和阿宁留在原地」：主语（含和 / 与 / 、连起来的并列）里有本人，才算他被留下。
function staysAt(sentences, own, self, others) {
    for (const s of sentences) {
        const marks = taggedSpans(s, [['own', own], ['self', self], ['other', others]]);
        for (const m of s.matchAll(STAY_RE)) {
            if (SEPARATE_NEGATE_RE.test(s.slice(0, m.index))) continue;
            let i = marks.length - 1;
            while (i >= 0 && marks[i].end > m.index) i--;
            if (i < 0 || m.index - marks[i].end > LEAVE_REACH) continue;
            for (; i >= 0; i--) {
                if (marks[i].kind === 'own') return true;
                if (i === 0 || !/^[和与跟及同、]$/.test(s.slice(marks[i - 1].end, marks[i].start))) break;
            }
        }
    }
    return false;
}

function accompaniedAt(sentences, own, others, lead, gender, self = []) {
    for (const s of sentences) {
        for (const clause of s.split(/[，,；;]/)) {
            const hits = spansOf(clause, own, 'own');
            if (lead && !others.some((n) => clause.includes(n))) hits.push(...spansOf(clause, pronounsFor(gender), 'pronoun'));
            for (const h of hits) {
                const around = clause.slice(Math.max(0, h.start - COMPANY_REACH), h.start) + '|' + clause.slice(h.end, h.end + COMPANY_REACH);
                if (COMPANY_RE.test(around) || (COMPANY_WITH_RE.test(around) && self.some((w) => around.includes(w)))) return true;
            }
        }
    }
    return false;
}

// 新场景前几页里本人开口，或旁白写到他（排除不在场的提法和迟到入场）。
function namedAhead(ahead, own, self, others, { pages, lead, gender }) {
    const list = (Array.isArray(ahead) ? ahead : []).slice(0, pages);
    for (let p = 0; p < list.length; p++) {
        const page = list[p] || {};
        if (page.by === 'own') return true;
        if (page.by === 'other') return false;
        const sentences = String(page.text || '').replace(QUOTE_RE, '').split(/[。！？!?…\n]/).filter((s) => s.trim());
        for (let i = 0; i < sentences.length; i++) {
            const s = sentences[i];
            let hits = spansOf(s, own, 'own');
            // 主立绘人物在新场景第一句里的代词也算点名（「第二天她和我一起去上学」）。
            if (!hits.length && lead && p === 0 && i === 0 && !others.some((n) => s.includes(n))) hits = spansOf(s, pronounsFor(gender), 'pronoun');
            if (!hits.length) continue;
            const h = hits.sort((a, b) => a.start - b.start)[0];
            if (mentionIsAbsent(s, h.start, h.end)) continue;
            const stop = taggedSpans(s, [['self', self], ['other', others]]).find((m) => m.start >= h.end);
            const tail = s.slice(h.end, Math.min(stop ? stop.start : s.length, h.end + LEAVE_REACH));
            return !(LATE_RE.test(tail) || tail.search(RETURN_RE) >= 0);
        }
    }
    return false;
}

export function carriesAcrossScene(options) {
    return Boolean(sceneCarryOf(options));
}

export function sceneCarryOf({ name, aliases = [], others = [], self = [], lead = false, gender = '', before = '', after = '', ahead = [], timeJump = false, mode = 'smart' } = {}) {
    const own = namesOf(name, aliases);
    if (!own.length) return '';
    const rest = (Array.isArray(others) ? others : []).map((s) => String(s || '').trim()).filter((s) => s.length >= 2 && !own.includes(s));
    const me = [...(Array.isArray(self) ? self : []).map((s) => String(s || '').trim()).filter((s) => s && !own.includes(s)), '我们', '咱们', '你', '我'];
    const edge = [before, after].map((s) => String(s || '').replace(QUOTE_RE, '')).filter((s) => s.trim());
    if (separatedAt(edge, own, me, rest) || (mode !== 'loose' && staysAt(edge, own, me, rest))) return '';
    const jumped = timeJump || edge.some((s) => TIME_JUMP_RE.test(s));
    const named = (pages) => (namedAhead(ahead, own, me, rest, { pages, lead, gender }) ? 'ahead' : '');
    if (mode === 'loose') return jumped ? named(SCENE_AHEAD_PAGES) : 'loose';
    if (mode === 'strict') return named(1) || (!jumped && accompaniedAt(edge, own, rest, lead, gender, me) ? 'company' : '');
    if (jumped) return named(SCENE_AHEAD_PAGES);
    const confirmed = named(SCENE_AHEAD_PAGES);
    if (confirmed || !edge.some((s) => MOVE_RE.test(s))) return confirmed;
    if (accompaniedAt(edge, own, rest, lead, gender, me)) return 'company';
    return edge.some((s) => GROUP_RE.test(s) && MOVE_RE.test(s)) ? 'group' : '';
}
