// 心魔 / 与自己对话（纯函数，不碰 DOM）：识别说话人名里的「自我对话」写法、解析本体、推进黑影的进退状态。
// 心理活动（内心独白、igs-thought）不属于这里，那是另一个演出。

// 黑影一侧：心魔、另一个自己、人格分裂各种叫法。
const DEMON_WORDS = Object.freeze(['心魔', '另一个我', '另一个自己', '内心的声音', '第二人格', '副人格', '里人格', '另一个人格', '人格分裂', '分裂人格', '多重人格', '黑化人格', '镜中的我', '镜中人']);
// 本体一侧：主人格、表人格只当本体说话，不出黑影。
const BODY_WORDS = Object.freeze(['主人格', '表人格']);
// 太泛，只认「XX（本我）」「XX的超我」这两种写法，不单独成名。
const WEAK_WORDS = Object.freeze(['本我', '自我', '超我']);

const USER_WORDS = Object.freeze(['我', '你', '自己', '主角', '玩家', 'user', '{{user}}']);

// 连续这么多页「安静」（旁白页）黑影散去；本体说话的页不算安静，自我对话本来就是一来一回，且会打断连续计数。
export const DEMON_QUIET_PAGES = 3;

const alt = (list) => list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const OPEN = '[（(【\\[［]';
const CLOSE = '[）)】\\]］]';
const NAME = '(.{1,20}?)';
const STRONG_RE = new RegExp(`^(?:${alt([...DEMON_WORDS, ...BODY_WORDS])})$`);
const PAREN_RE = new RegExp(`^${NAME}\\s*${OPEN}\\s*(${alt([...DEMON_WORDS, ...BODY_WORDS, ...WEAK_WORDS])})\\s*${CLOSE}$`);
const DE_RE = new RegExp(`^${NAME}的(${alt([...DEMON_WORDS, ...BODY_WORDS, ...WEAK_WORDS])})$`);
const DOT_RE = new RegExp(`^${NAME}[·・•\\s](${alt([...DEMON_WORDS, ...BODY_WORDS])})$`);
const DOT_INNER_RE = /^(.{1,20}?)[·・•]里$/;
const DARK_RE = /^黑化(?:的)?(.{1,20})$/;
const OTHER_RE = /^另一个(.{1,20})$/;
const INNER_RE = /^里(.{1,20})$/;

const text = (value) => String(value == null ? '' : value).trim();

function sideOf(word) {
    return BODY_WORDS.includes(word) ? 'body' : 'demon';
}

function sameName(a, b) {
    const x = text(a);
    const y = text(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [long, short] = x.length >= y.length ? [x, y] : [y, x];
    return Array.from(short).length >= 2 && long.includes(short);
}

// known：[{ key, names: [...] }]，已登记角色与别名；前缀写法（黑化的XX、另一个XX、里XX、XX·里）必须命中其中一个才算。
function matchKnown(owner, known) {
    const o = text(owner);
    if (!o || !Array.isArray(known)) return '';
    const hit = known.find((k) => k && (sameName(o, k.key) || (Array.isArray(k.names) && k.names.some((n) => sameName(o, n)))));
    return hit ? text(hit.key) : '';
}

// 解析说话人名。返回 null（不是自我对话）或 { side: 'demon' | 'body', owner, word }；
// owner 是名字里带的本体名（可能为空：只写了「心魔」），由 resolveDemonOwner 落到具体角色。
export function parseInnerDemonName(name, known = []) {
    const n = text(name).replace(/\s+/g, ' ');
    if (!n || n.length > 40) return null;
    if (STRONG_RE.test(n)) return { side: sideOf(n), owner: '', word: n };
    let m = PAREN_RE.exec(n) || DE_RE.exec(n) || DOT_RE.exec(n);
    if (m) {
        const owner = text(m[1]);
        // 「我的心魔」这类写成本人称呼时 owner 留给调用方按上一位说话人解析。
        return { side: sideOf(m[2]), owner, word: m[2] };
    }
    m = DOT_INNER_RE.exec(n);
    if (m) {
        const owner = matchKnown(m[1], known);
        return owner ? { side: 'demon', owner, word: '里' } : null;
    }
    for (const [re, word] of [[DARK_RE, '黑化'], [OTHER_RE, '另一个'], [INNER_RE, '里']]) {
        m = re.exec(n);
        if (!m) continue;
        const owner = matchKnown(m[1], known);
        if (owner) return { side: 'demon', owner, word };
    }
    return null;
}

// 不带角色表的快速判断（只认不依赖角色表的写法）：用于「这不是要出立绘的角色」。
export function isInnerDemonName(name) {
    return parseInnerDemonName(name, []) !== null;
}

// 本体角色：名字里带角色名取该角色；只有「心魔」之类取上一位有立绘的说话人；写了不认识的名字不演。
export function resolveDemonOwner(parsed, { known = [], lastBody = '', userNames = [] } = {}) {
    if (!parsed) return '';
    const owner = text(parsed.owner);
    const users = [...USER_WORDS, ...userNames.map((u) => text(u).toLowerCase())];
    if (!owner || users.includes(owner.toLowerCase())) return text(lastBody);
    return matchKnown(owner, known);
}

// 黑影站位：与本体立绘对称。center 为本体立绘的水平中心（舞台百分比），返回平移量（舞台宽度百分比）。
// 本体居中时对称等于重叠，退到侧边固定距离；落点收在舞台 12–88 之内。
export function demonOffset(center) {
    const c = Number.isFinite(Number(center)) ? Number(center) : 50;
    let dx = 100 - 2 * c;
    if (Math.abs(dx) < 30) dx = c <= 50 ? 30 : -30;
    const target = Math.max(12, Math.min(88, c + dx));
    return Math.round((target - c) * 100) / 100;
}

// 立绘图片水平中心（舞台百分比）：与 stage-snapshot 翻转原点同一公式。
export function spriteCenter(position, size) {
    const posX = parseFloat(String(position || '').split(/\s+/)[0]);
    const w = parseFloat(String(size || ''));
    if (!Number.isFinite(posX)) return 50;
    return Number.isFinite(w) ? Math.round((posX + w * (50 - posX) / 100) * 100) / 100 : posX;
}

export function createDemonState() {
    return { active: false, body: '', quiet: 0, scene: '', lastKey: '', lastBody: '', turn: '' };
}

// 推进一页。input：{ pageKey, scene, parsed, owner, speaker }
//   parsed / owner 为本页说话人名解析与本体（非自我对话页为 null / ''）；speaker 为本页普通说话人的角色名（旁白为空）。
// 返回 { state, action, turn }：action 为 enter（首次出现）| switch（换了本体）| stay | leave | keep（同页重渲染）| none；
// turn 为本页谁在说：demon | body | ''。
export function stepInnerDemon(prev, input) {
    const state = prev || createDemonState();
    const { pageKey = '', scene = '', parsed = null, owner = '', speaker = '' } = input || {};
    if (pageKey && state.lastKey === pageKey) return { state, action: 'keep', turn: state.turn };
    const next = { ...state, lastKey: pageKey };
    if (scene) next.scene = scene;
    const plainSpeaker = !parsed && text(speaker) ? text(speaker) : '';
    if (plainSpeaker) next.lastBody = plainSpeaker;
    if (parsed && parsed.side === 'body' && owner) next.lastBody = owner;
    const sceneChanged = state.active && Boolean(scene) && Boolean(state.scene) && scene !== state.scene;
    const leave = () => ({ state: { ...next, active: false, body: '', quiet: 0, turn: '' }, action: 'leave', turn: '' });

    if (parsed && parsed.side === 'demon' && owner) {
        if (state.active && sceneChanged) return { state: { ...next, active: true, body: owner, quiet: 0, turn: 'demon' }, action: 'switch', turn: 'demon' };
        const action = !state.active ? 'enter' : state.body === owner ? 'stay' : 'switch';
        return { state: { ...next, active: true, body: owner, quiet: 0, turn: 'demon' }, action, turn: 'demon' };
    }
    if (!state.active) return { state: { ...next, turn: '' }, action: 'none', turn: '' };
    if (sceneChanged) return leave();
    // 主人格 / 表人格：本体在说话，对话仍在继续。
    if (parsed && parsed.side === 'body' && owner === state.body) return { state: { ...next, quiet: 0, turn: 'body' }, action: 'stay', turn: 'body' };
    // 第三人说话（既不是本体也不是旁白）：黑影散去。
    if (plainSpeaker && plainSpeaker !== state.body) return leave();
    // 本体说话：不计入安静页，并打断连续计数。
    if (plainSpeaker) return { state: { ...next, quiet: 0, turn: 'body' }, action: 'stay', turn: 'body' };
    const quiet = state.quiet + 1;
    if (quiet >= DEMON_QUIET_PAGES) return leave();
    return { state: { ...next, quiet, turn: '' }, action: 'stay', turn: '' };
}

export const INNER_DEMON_GRAMMAR_LINE = '【心魔对话】自我对话（心魔、另一个自己）时，说话人写「角色名（心魔）」；人格分裂可写「角色名（第二人格）」。内心独白仍用 igs-thought。';

export function normalizeInnerDemonSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { enabled: src.enabled !== false };
}
