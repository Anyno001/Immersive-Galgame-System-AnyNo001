// 声望条（STATS_CROWD_IDOL_PLAN 一；E4 重做见 docs/STATS_TRAITS_BALANCE_BACKLOG.md 第五节第 3 条）：某一群体对某个人物（主角或任意角色）的态度。
// 每个聊天最多开 FAME_BAR_MAX 条。性质按数值走向分四类（FAME_CLASSES），类只决定每日自然变化与归零、满格时的强制事项；
// 每条另带归属、谁在看、两端叫法与各档描写（由类、谁在看、两端叫法按模板生成，可手改）。
// 「组合热度」（热度类、按搭档分别记）保留。数值统一存在 protagonist.fame[条名]；只对 strengthRev ≥ 2 的楼生效；没开声望的聊天不注入、不结算。
import { clamp } from './stat-state.js';
import { calcRow, withCalc } from './stat-status-defs.js';

export const FAME_BAR_MAX = 10;
export const FAME_PAIR_MAX = 8;
export const FAME_NAME_MAX = 8;
export const FAME_STRENGTHS = Object.freeze(['小', '中', '大']);
export const FAME_STEP = Object.freeze({ 小: 2, 中: 5, 大: 10 });
export const FAME_CLASSES = Object.freeze(['口碑', '热度', '威胁', '消耗']);
export const FAME_CLASS_NOTE = Object.freeze({ 口碑: '无自然变化', 热度: '每天缓降', 威胁: '每天缓降', 消耗: '每天减少或增加' });
const HERO = '主角';
const OWNER_MAX = 12;
const WATCHER_MAX = 12;
const END_MAX = 8;
const TEXT_MAX = 80;
const FAME_LOW = 33;
const FAME_HIGH = 66;
const TIER_WORDS = Object.freeze(['较低', '一般', '较高']);
const CLASS_START = Object.freeze({ 口碑: 50, 热度: 30, 威胁: 20, 消耗: 50 });
const NO_SEP = /[|｜:：\[\]【】{}<>]/;

// 每日自然变化的一天量：口碑无；热度、威胁缓降；消耗按「每天减少 / 每天增加」。
export function fameDaily(bar) {
    if (bar.cls === '热度' || bar.cls === '威胁') return -2;
    if (bar.cls === '消耗') return bar.drain === '增加' ? 5 : -5;
    return 0;
}
export const fameDailyWord = (bar) => (bar.cls === '消耗' ? `每天${bar.drain === '增加' ? '增加' : '减少'}` : bar.cls === '口碑' ? '无' : '缓降');

// 由「类 + 谁在看 + 两端叫法」生成各档描写；组合热度的搭档名写作 {搭档}。
export function describeFame({ cls, owner = HERO, watcher, zero, full, danger = '空', pair = false }) {
    const o = owner || HERO;
    if (cls === '热度' && pair) {
        return { low: `${o}与{搭档}的组合少有人提起。`, high: `${o}与{搭档}的组合人气很高，两人同框就会引来热议。`,
            zeroMandate: `${o}与{搭档}的组合已是「${zero}」，写出热度退去的情形`, fullMandate: `${o}与{搭档}的组合已是「${full}」，写出同框引发轰动的场面` };
    }
    if (cls === '口碑') {
        return { low: `${watcher}对${o}的评价偏低，态度冷淡，不愿与${o}往来。`, high: `${watcher}对${o}评价很高，愿意相信并支持${o}。`,
            zeroMandate: `${o}已到「${zero}」的地步，写出${watcher}当面冷遇的情形`, fullMandate: `${o}已达「${full}」，写出${watcher}敬重、主动相助的情形` };
    }
    if (cls === '热度') {
        return { low: `${watcher}很少关注${o}，提起的人不多。`, high: `${watcher}高度关注${o}，话题不断。`,
            zeroMandate: `${o}的热度退尽，已是「${zero}」，写出${watcher}不再关注的情形`, fullMandate: `${o}已是「${full}」，写出${watcher}追捧、围观的场面` };
    }
    if (cls === '威胁') {
        return { low: `${watcher}认为${o}威胁不大，防备松散。`, high: `${watcher}把${o}视为重大威胁，防备严密。`,
            zeroMandate: `${o}已是「${zero}」，写出${watcher}放松戒备的情形`, fullMandate: `${o}已是「${full}」，写出${watcher}全力应对的场面` };
    }
    return danger === '满'
        ? { low: `${o}这一项积累不多，${watcher}暂时没有催逼。`, high: `${o}这一项积累沉重，${watcher}步步紧逼。`,
            zeroMandate: `${o}已是「${zero}」，写出${watcher}一方松开的情形`, fullMandate: `${o}已是「${full}」，写出${watcher}一方兑现后果的情节` }
        : { low: `${o}这一项所剩无几，${watcher}随时可能收回，处境吃紧。`, high: `${o}这一项十分充足，${watcher}一方暂时无忧。`,
            zeroMandate: `${o}已是「${zero}」，写出${watcher}一方收回、${o}陷入困境的情形`, fullMandate: `${o}已是「${full}」，写出${watcher}一方显现成果的场面` };
}

const str = (raw, max) => { const t = String(raw ?? '').trim(); return t && Array.from(t).length <= max ? t : null; };

// 条名：1–8 字，不含数字与分隔符。
export function validFameName(raw) {
    const text = String(raw ?? '').trim();
    return text && Array.from(text).length <= FAME_NAME_MAX && !/[0-9０-９|｜:：\[\]【】{}<>]/.test(text) ? text : null;
}

const FIELD_NAMES = Object.freeze({ name: '条名', owner: '归属', watcher: '谁在看', cls: '类', zero: '低端叫法', full: '高端叫法' });

// 把原始字段整理成标准条。返回 { ok: true, bar } 或 { ok: false, field }。描写缺省时按模板生成。
export function buildFameBar(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const name = validFameName(r.name);
    if (!name) return { ok: false, field: FIELD_NAMES.name };
    const ownerRaw = String(r.owner ?? '').trim();
    const owner = ownerRaw ? (Array.from(ownerRaw).length <= OWNER_MAX && !NO_SEP.test(ownerRaw) ? ownerRaw : null) : HERO;
    if (!owner) return { ok: false, field: FIELD_NAMES.owner };
    const watcher = str(r.watcher, WATCHER_MAX);
    if (!watcher || NO_SEP.test(watcher)) return { ok: false, field: FIELD_NAMES.watcher };
    if (!FAME_CLASSES.includes(r.cls)) return { ok: false, field: FIELD_NAMES.cls };
    const zero = str(r.zero, END_MAX);
    if (!zero) return { ok: false, field: FIELD_NAMES.zero };
    const full = str(r.full, END_MAX);
    if (!full) return { ok: false, field: FIELD_NAMES.full };
    const bar = { name, owner, watcher, cls: r.cls };
    if (r.cls === '消耗') {
        bar.drain = r.drain === '增加' ? '增加' : '减少';
        bar.danger = r.danger === '满' || r.danger === '空' ? r.danger : bar.drain === '增加' ? '满' : '空';
    }
    const start = Number(r.start);
    bar.start = Number.isFinite(start) && r.start !== '' && r.start != null ? clamp(Math.round(start), 0, 100) : CLASS_START[r.cls];
    const pair = r.cls === '热度' && r.pair === true;
    if (pair) bar.pair = true;
    bar.zero = zero;
    bar.full = full;
    const gen = describeFame({ cls: bar.cls, owner, watcher, zero, full, danger: bar.danger, pair });
    for (const key of ['low', 'high', 'zeroMandate', 'fullMandate']) bar[key] = str(r[key], TEXT_MAX) || gen[key];
    return { ok: true, bar };
}

// ───── 模板：按世界观分组，原 11 种性质并入 ─────
// 旧性质文案原样保留（迁移时套用）；新增模板不写文案，由 describeFame 生成。
const tpl = (group, name, cls, watcher, zero, full, start, extra = {}) => Object.freeze({ group, name, cls, watcher, zero, full, start, ...extra });
export const FAME_TEMPLATES = Object.freeze([
    tpl('通用', '名誉', '口碑', '社会', '声名狼藉', '德高望重', 50, { low: '主角名声不好，旁人提起时多有非议，不愿与主角来往。', high: '主角名声很好，旁人敬重主角，说话有分量。', zeroMandate: '主角声名狼藉，写出旁人当面冷遇、避之不及的情形', fullMandate: '主角德高望重，写出众人敬重、登门求助的情形' }),
    tpl('通用', '通缉', '威胁', '官府与追兵', '安全', '天罗地网', 10, { low: '追查并不紧，主角行动尚算自由。', high: '追捕严密，主角处处受到盘查，只能躲藏行事。', zeroMandate: '追捕已经停止，写出主角终于摆脱追兵的情形', fullMandate: '主角陷入天罗地网，写出关卡封锁、追兵围捕的场面' }),
    tpl('都市娱乐圈', '名气', '热度', '大众', '过气', '顶流', 30, { low: '知道主角的人不多，出门很少被认出。', high: '主角很有名气，走到哪里都有人认出，关注和邀约不断。', zeroMandate: '主角已经过气，写出邀约中断、旁人淡忘的情形', fullMandate: '主角成为顶流，写出被追捧、被围观的场面' }),
    tpl('都市娱乐圈', '粉丝狂热', '威胁', '私生饭与狂信徒', '理智追随', '暴走', 20, { low: '追随者大多理智，与主角保持应有的距离。', high: '追随者越来越狂热，有人跟踪、守候，不顾主角的意愿。', zeroMandate: '追随者恢复理智，写出狂热退去、不再纠缠的情形', fullMandate: '追随者暴走，写出跟踪、围堵乃至献祭的极端举动' }),
    tpl('都市娱乐圈', '组合热度', '热度', 'CP粉', '无人问津', '国民CP', 20, { pair: true, low: '主角与{搭档}的组合少有人提起。', high: '主角与{搭档}的组合人气很高，两人同框就会引来热议。', zeroMandate: '主角与{搭档}的组合已无人再提，写出热度退去的情形', fullMandate: '主角与{搭档}成为国民CP，写出同框引发轰动的场面' }),
    tpl('都市娱乐圈', '路人缘', '口碑', '路人', '人人嫌弃', '人见人爱', 50),
    tpl('修仙', '宗门威望', '口碑', '宗门同道', '宗门除名', '一代宗师', 40),
    tpl('修仙', '恶名', '口碑', '敌人与平民', '无人畏惧', '闻风丧胆', 20, { low: '主角的名号毫无威慑力，敌人不把主角放在眼里。', high: '主角恶名在外，敌人忌惮，平民见了绕道走。', zeroMandate: '主角已无人畏惧，写出敌人轻视、当面挑衅的情形', fullMandate: '主角令人闻风丧胆，写出敌人望风而逃、平民噤若寒蝉的情形' }),
    tpl('西幻', '公会声望', '口碑', '冒险者公会', '被除名', '传奇冒险者', 40),
    tpl('西幻', '契约债务', '消耗', '契约方', '契约结清', '被收走灵魂', 20, { drain: '增加', danger: '满', low: '契约债务不多，契约方暂时没有催讨。', high: '契约债务沉重，契约方频频催讨，期限迫在眉睫。', zeroMandate: '契约已经结清，写出契约印记消退、契约方离去的情形', fullMandate: '契约到期，写出契约方前来收走主角灵魂的情节' }),
    tpl('宫斗古风', '宠爱', '热度', '君王、主人或金主', '失宠', '专宠', 30, { low: '主角不受宠，对方态度冷淡，旁人也敢怠慢主角。', high: '主角深受宠爱，对方有求必应，旁人不敢怠慢。', zeroMandate: '主角失宠，写出对方冷落、旁人落井下石的情形', fullMandate: '主角受到专宠，写出对方偏爱、旁人眼红的情形' }),
    tpl('宫斗古风', '民心', '口碑', '子民', '被推翻', '万民归心', 50, { low: '民心不稳，子民怨声载道，暗中有人煽动。', high: '民心归附，子民拥戴主角。', zeroMandate: '民心尽失，写出子民起义、主角被推翻的情节', fullMandate: '主角万民归心，写出子民夹道欢迎、自发拥护的场面' }),
    tpl('神话', '信仰', '口碑', '信众', '信众离散', '被奉为神使', 30, { low: '信众稀少，信仰动摇，有人开始怀疑主角。', high: '信众虔诚，对主角的话深信不疑。', zeroMandate: '信众离散，写出信众离去、圣所冷清的情形', fullMandate: '主角被奉为神使，写出信众跪拜、争相追随的场面' }),
    tpl('神话', '香火', '消耗', '信众', '神力衰竭', '神力鼎盛', 50, { drain: '减少', danger: '空', low: '香火稀薄，主角神力不济，施展神通十分吃力。', high: '香火旺盛，主角神力充沛。', zeroMandate: '主角神力衰竭，写出身形虚弱、渐渐消散的迹象', fullMandate: '主角神力鼎盛，写出神迹显现、信众惊叹的场面' }),
    tpl('末世', '幸存者信任', '口碑', '幸存者', '被驱逐', '众人推举', 40),
    tpl('末世', '尸潮威胁', '威胁', '尸群', '尸群散去', '尸潮压境', 20),
]);
export const FAME_TEMPLATE_GROUPS = Object.freeze(['通用', '都市娱乐圈', '修仙', '西幻', '宫斗古风', '神话', '末世']);
export const fameTemplate = (name) => FAME_TEMPLATES.find((t) => t.name === name) || null;
export function fameTemplateBar(name, barName = null, owner = HERO) {
    const t = fameTemplate(name);
    if (!t) return null;
    const own = String(owner || HERO).trim() || HERO;
    // 模板文案写的是「主角」，换归属时一并替换。
    const swap = (text) => (typeof text === 'string' && own !== HERO ? text.split(HERO).join(own) : text);
    const built = buildFameBar({ ...t, name: barName || t.name, owner: own, low: swap(t.low), high: swap(t.high), zeroMandate: swap(t.zeroMandate), fullMandate: swap(t.fullMandate) });
    return built.ok ? built.bar : null;
}

// ───── 旧档迁移（纯函数）：原 11 种性质 → 四类，再套对应模板文案；归属默认主角；条名与已记数值不变 ─────
export const FAME_LEGACY_CLASS = Object.freeze({ 名气: '热度', 名誉: '口碑', 恶名: '口碑', 信仰: '口碑', 香火: '消耗', 宠爱: '热度', 通缉: '威胁', 契约债务: '消耗', 民心: '口碑', 粉丝狂热: '威胁', 组合热度: '热度' });
export function migrateLegacyFameBar(item) {
    if (!item || !item.name || !Object.hasOwn(FAME_LEGACY_CLASS, item.kind)) return null;
    return fameTemplateBar(item.kind, item.name, HERO);
}

// 聊天级配置：最多 FAME_BAR_MAX 条，条名不重复；新格式整理后保留，旧格式 { name, kind } 迁移，其余丢弃。
export function sanitizeFameBars(raw) {
    const out = [];
    for (const item of Array.isArray(raw) ? raw : []) {
        const built = item && item.cls ? buildFameBar(item) : null;
        const bar = built ? (built.ok ? built.bar : null) : migrateLegacyFameBar(item);
        if (!bar || out.some((b) => b.name === bar.name)) continue;
        out.push(bar);
        if (out.length >= FAME_BAR_MAX) break;
    }
    return out;
}

// ───── 草稿文本：新建确认与编辑共用，一行一项「标签：内容」 ─────
const DRAFT_KEYS = Object.freeze({ 归属: 'owner', 条名: 'name', 谁在看: 'watcher', 类: 'cls', 每日变化: 'drain', 危险端: 'danger', 低端叫法: 'zero', 高端叫法: 'full', 低档描写: 'low', 高档描写: 'high', 归零事项: 'zeroMandate', 满格事项: 'fullMandate', 按搭档分别记: 'pair', 开条初值: 'start' });
export function fameDraftText(bar) {
    const lines = [`归属：${bar.owner}`, `条名：${bar.name}`, `谁在看：${bar.watcher}`, `类：${bar.cls}`];
    if (bar.cls === '消耗') lines.push(`每日变化：每天${bar.drain === '增加' ? '增加' : '减少'}`, `危险端：越${bar.danger === '满' ? '满' : '空'}危险`);
    lines.push(`低端叫法：${bar.zero}`, `高端叫法：${bar.full}`, `低档描写：${bar.low}`, `高档描写：${bar.high}`, `归零事项：${bar.zeroMandate}`, `满格事项：${bar.fullMandate}`, `开条初值：${bar.start}`);
    if (bar.pair) lines.push('按搭档分别记：是');
    return lines.join('\n');
}
function fieldsFromPairs(pairs) {
    const raw = {};
    for (const [label, value] of pairs) {
        const key = DRAFT_KEYS[label];
        if (!key) continue;
        const v = String(value ?? '').trim();
        if (key === 'drain') raw.drain = /增/.test(v) ? '增加' : '减少';
        else if (key === 'danger') raw.danger = /满/.test(v) ? '满' : /空/.test(v) ? '空' : '';
        else if (key === 'pair') raw.pair = /^(是|true)$/.test(v);
        else raw[key] = v;
    }
    return raw;
}
// 解析草稿文本。返回 { ok, bar } 或 { ok: false, field }。
export function parseFameDraft(text) {
    const pairs = [];
    for (const line of String(text ?? '').split(/\r?\n/)) {
        const m = /^\s*([^：:]{1,8})[：:]\s*(.*)$/.exec(line);
        if (m) pairs.push([m[1].trim(), m[2]]);
    }
    return buildFameBar(fieldsFromPairs(pairs));
}

// ───── 副模型补全：一句话 → 草稿 ─────
export function buildFameFillPrompt(sentence, { worldview = '', people = [] } = {}) {
    const refs = people.filter((p) => p && p.summary).map((p) => `${p.name}：${String(p.own ?? p.summary).slice(0, 3000)}`).join('\n');
    const user = [
        '请把下面这句话整理成一条「声望」设定。声望记录某一群体对某个人物的看法，用 0 到 100 的数值表示。',
        `一句话：${sentence}`,
        worldview ? `世界观：${worldview}` : '',
        refs ? `相关资料：\n${refs}` : '',
        '字段说明：',
        '归属：这条声望属于谁；主角写「主角」，其他人物写角色名。',
        `条名：1 到 ${FAME_NAME_MAX} 个字，不含数字与符号。`,
        '谁在看：哪一群体的看法，如「陈塘关百姓」。',
        '类：口碑（无自然变化）、热度（每天缓降）、威胁（每天缓降）、消耗（每天减少或增加）四选一。',
        `低端叫法、高端叫法：数值为 0 与 100 时各自的叫法，各不超过 ${END_MAX} 个字。`,
        '每日变化、危险端：仅当类为消耗时填写；每日变化写「每天减少」或「每天增加」，危险端写「越满危险」或「越空危险」。',
        '低档描写、高档描写：数值偏低、偏高时旁人对归属人物的态度，各一句。',
        '归零事项、满格事项：数值归零、满格时正文须写出的情形，各一句。',
        '只输出一个 JSON 对象，键名使用上面的字段名，不写其他文字。资料中没有依据的内容不要编造。',
    ].filter(Boolean).join('\n');
    return { system: '你是剧情设定助手，只依据用户给出的一句话与资料作答，只输出指定的 JSON。', user };
}
// 严格解析：只认纯 JSON（可带代码围栏）的对象；失败或字段不合格都不给草稿。
export function parseFameFill(reply) {
    const text = String(reply ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let obj;
    try { obj = JSON.parse(text); } catch (error) { return { ok: false, field: '格式' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, field: '格式' };
    return buildFameBar(fieldsFromPairs(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v : ''])));
}

// ───── 取值、档位 ─────
const textOf = (value, partner) => String(value).split('{搭档}').join(partner || '');
export const fameOn = (bars) => Array.isArray(bars) && bars.length > 0;
const isPairBar = (bar) => Boolean(bar && bar.pair);

// 当前值：没记录过的条按开条初值；组合热度返回 { 搭档: 值 }。
export function fameValue(state, bar) {
    const own = state && state.protagonist && state.protagonist.fame;
    const raw = own && typeof own === 'object' ? own[bar.name] : undefined;
    if (isPairBar(bar)) return raw && typeof raw === 'object' ? { ...raw } : {};
    const v = Number(raw);
    return Number.isFinite(v) ? clamp(Math.round(v), 0, 100) : bar.start;
}

export function fameTier(bar, value) {
    const v = Math.round(Number(value) || 0);
    if (v <= 0) return bar.zero;
    if (v >= 100) return bar.full;
    return TIER_WORDS[v <= FAME_LOW ? 0 : v < FAME_HIGH ? 1 : 2];
}

function withFame(state, fame) {
    return { ...state, protagonist: { ...state.protagonist, fame } };
}

// 组合热度按热度从高到低排；同热度按搭档名。
export function famePairs(state, bar) {
    return Object.entries(fameValue(state, bar)).map(([partner, v]) => ({ partner, value: clamp(Math.round(Number(v) || 0), 0, 100) }))
        .sort((a, b) => b.value - a.value || (a.partner < b.partner ? -1 : a.partner > b.partner ? 1 : 0));
}

// 标签方向词之前的各段按已开的条归位：
// 0 段：只开一条时用它；1 段：条名；2 段：先按「归属|条名」，认不出再按「条名|搭档」；3 段：归属|条名|搭档。
export function matchFameSegs(segs, bars) {
    const list = Array.isArray(segs) ? segs : [];
    const find = (name) => bars.find((b) => b.name === name) || null;
    if (!list.length) return bars.length === 1 ? { bar: bars[0], partner: null } : null;
    if (list.length === 1) { const bar = find(list[0]); return bar ? { bar, partner: null } : null; }
    const owned = find(list[1]);
    if (owned && owned.owner === list[0]) return { bar: owned, partner: list[2] || null };
    const plain = find(list[0]);
    return plain ? { bar: plain, partner: list[1] || null } : null;
}

// 本楼标签结算：条名省略时只开一条才认；同条（同一对）一楼只留强度最大的一条。resolve 把搭档名归到已登记角色。
// 返回新状态；变动写进 changes（带结算明细 calc），丢弃的记 diagnostics。
export function settleFameTags(state, directives, bars, { changes = [], diagnostics = [], resolve = null } = {}) {
    if (!fameOn(bars)) return state;
    const slot = new Map();
    for (const d of directives) {
        if (d.kind !== 'fame') continue;
        const hit = matchFameSegs(d.segs, bars);
        if (!hit) { diagnostics.push({ code: 'stat-fame-unknown', name: (d.segs || []).join('/') }); continue; }
        const { bar } = hit;
        let partner = null;
        if (isPairBar(bar)) {
            if (!hit.partner) { diagnostics.push({ code: 'stat-fame-no-partner', name: bar.name }); continue; }
            partner = (typeof resolve === 'function' && resolve(hit.partner)) || hit.partner;
        }
        const key = `${bar.name}|${partner || ''}`;
        const unit = FAME_STEP[d.strength || '小'];
        const step = unit * (d.value === '下降' ? -1 : 1);
        const cur = slot.get(key);
        if (!cur || Math.abs(step) > Math.abs(cur.step)) slot.set(key, { bar, partner, step, unit, note: `${d.value}${d.strength || '小'}` });
    }
    let fame = state.protagonist.fame && typeof state.protagonist.fame === 'object' ? state.protagonist.fame : {};
    const start = fame;
    for (const { bar, partner, step, unit, note } of slot.values()) {
        const calcOf = (from, to) => [calcRow(`${note}（${unit}）`, step), calcRow('结果', to - from)];
        if (partner) {
            const pairs = fameValue({ protagonist: { fame } }, bar);
            if (!Object.hasOwn(pairs, partner) && Object.keys(pairs).length >= FAME_PAIR_MAX) { diagnostics.push({ code: 'stat-fame-pair-max', name: partner }); continue; }
            const from = Object.hasOwn(pairs, partner) ? clamp(Math.round(Number(pairs[partner]) || 0), 0, 100) : bar.start;
            const to = clamp(from + step, 0, 100);
            changes.push(withCalc({ source: 'tag', target: bar.owner, key: `${bar.name}·${partner}`, from, to, note }, { calc: calcOf(from, to) }));
            fame = { ...fame, [bar.name]: { ...pairs, [partner]: to } };
            continue;
        }
        const from = fameValue({ protagonist: { fame } }, bar);
        const to = clamp(from + step, 0, 100);
        if (to !== from) changes.push(withCalc({ source: 'tag', target: bar.owner, key: bar.name, from, to, note }, { calc: calcOf(from, to) }));
        fame = { ...fame, [bar.name]: to };
    }
    return fame === start ? state : withFame(state, fame);
}

// 每日自然变化（按类）：days 天一次算完；组合热度每一对各自变化。
export function driftFame(state, bars, days = 1, changes = [], note = '日结算') {
    if (!fameOn(bars) || !(days > 0)) return state;
    let fame = state.protagonist.fame && typeof state.protagonist.fame === 'object' ? state.protagonist.fame : {};
    const start = fame;
    for (const bar of bars) {
        const perDay = fameDaily(bar);
        const delta = perDay * days;
        if (!delta) continue;
        const calcOf = (from, to) => [calcRow(`${bar.cls}${fameDailyWord(bar)}`, perDay), ...(days > 1 ? [calcRow('天数', days)] : []), calcRow('结果', to - from)];
        if (isPairBar(bar)) {
            const pairs = fameValue({ protagonist: { fame } }, bar);
            let changed = false;
            for (const [partner, raw] of Object.entries(pairs)) {
                const from = clamp(Math.round(Number(raw) || 0), 0, 100);
                const to = clamp(from + delta, 0, 100);
                if (to === from) continue;
                changes.push(withCalc({ source: 'daily', target: bar.owner, key: `${bar.name}·${partner}`, from, to, note }, { calc: calcOf(from, to) }));
                pairs[partner] = to;
                changed = true;
            }
            if (changed) fame = { ...fame, [bar.name]: pairs };
            continue;
        }
        const from = fameValue({ protagonist: { fame } }, bar);
        const to = clamp(from + delta, 0, 100);
        if (to === from) continue;
        changes.push(withCalc({ source: 'daily', target: bar.owner, key: bar.name, from, to, note }, { calc: calcOf(from, to) }));
        fame = { ...fame, [bar.name]: to };
    }
    return fame === start ? state : withFame(state, fame);
}

// 本楼前后对比：刚归零或刚满格的条（组合热度按对）给出强制事项文案。
export function fameMandates(before, after, bars) {
    const out = [];
    if (!fameOn(bars)) return out;
    for (const bar of bars) {
        const hit = (from, to, partner) => {
            if (to <= 0 && from > 0) out.push(textOf(bar.zeroMandate, partner));
            else if (to >= 100 && from < 100) out.push(textOf(bar.fullMandate, partner));
        };
        if (isPairBar(bar)) {
            const was = fameValue(before, bar);
            for (const [partner, v] of Object.entries(fameValue(after, bar))) hit(Object.hasOwn(was, partner) ? Number(was[partner]) || 0 : bar.start, Number(v) || 0, partner);
        } else hit(fameValue(before, bar), fameValue(after, bar), null);
    }
    return out;
}

// 注入用的各条描写：普通条一行；组合热度只写热度最高的两对与本楼在场搭档那一对。归属非主角的条在括号里写明归属。
export function fameLines(state, bars, { present = [] } = {}) {
    if (!fameOn(bars)) return [];
    const lines = [];
    const band = (bar, v, partner) => (v <= FAME_LOW ? textOf(bar.low, partner) : v >= FAME_HIGH ? textOf(bar.high, partner) : '');
    for (const bar of bars) {
        const head = `${bar.name}（${bar.owner === HERO ? '' : `${bar.owner}，`}${bar.watcher}）`;
        if (isPairBar(bar)) {
            const pairs = famePairs(state, bar);
            const shown = pairs.slice(0, 2);
            for (const p of pairs.slice(2)) if (present.includes(p.partner)) shown.push(p);
            if (!shown.length) continue;
            lines.push(`${head}：${shown.map((p) => `与${p.partner}的组合${fameTier(bar, p.value)}。${band(bar, p.value, p.partner)}`).join('')}`);
            continue;
        }
        const v = fameValue(state, bar);
        lines.push(`${head}：${fameTier(bar, v)}。${band(bar, v, null)}`);
    }
    return lines;
}

// 标签说明行：开了声望才出现；只开一条时条名可省；有组合热度条时追加按搭档写的一行；有归属非主角的条时在同一行补一句归属段说明。
export function fameTagLines(bars) {
    if (!fameOn(bars)) return [];
    const plain = bars.filter((b) => !isPairBar(b));
    const pairBars = bars.filter(isPairBar);
    const ownerNote = bars.some((b) => b.owner !== HERO) ? '；归属非主角的条，条名前加一段归属角色名' : '';
    const lines = [];
    if (plain.length) {
        const names = plain.map((b) => b.name).join('/');
        lines.push(`[igs-stat:fame|${names}|上升/下降|${FAME_STRENGTHS.join('/')}]（仅在剧情确实发生时才写：群体对人物的看法有变化时，如演出成功、丑闻曝光；${bars.length === 1 ? '条名可省，' : ''}强度省略时按小${ownerNote}）`);
    }
    for (const bar of pairBars) {
        lines.push(`[igs-stat:fame|${bar.name}|搭档名|上升/下降|${FAME_STRENGTHS.join('/')}]（仅在剧情确实发生时才写：某位搭档的组合热度有变化时；多位搭档的热度变化不同时，各写一条${plain.length ? '' : ownerNote}）`);
    }
    return lines;
}

// 状态栏：只开声望时一行汇总（各条名称与档位），开细项后每条、组合热度每一对各自成条。档位不写数字；非主角的条标注归属。
export function fameHudMetrics(state, bars, { detail = false } = {}) {
    if (!fameOn(bars)) return [];
    const rows = [];
    const label = (bar, extra = '') => `${bar.owner === HERO ? '' : `${bar.owner}·`}${bar.name}${extra}`;
    for (const bar of bars) {
        if (isPairBar(bar)) {
            const pairs = famePairs(state, bar);
            if (detail) for (const p of pairs) rows.push({ label: label(bar, `·${p.partner}`), value: p.value, tier: fameTier(bar, p.value) });
            else if (pairs.length) rows.push({ label: label(bar), value: pairs[0].value, tier: fameTier(bar, pairs[0].value) });
            continue;
        }
        const v = fameValue(state, bar);
        rows.push({ label: label(bar), value: v, tier: fameTier(bar, v) });
    }
    if (!rows.length) return [];
    const metric = (text, percent, display) => ({ label: text, percent, display, colorKey: 'slot-6', sourceUid: 'igs-stats' });
    if (detail) return rows.map((r) => metric(r.label, r.value, r.tier));
    const avg = Math.round(rows.reduce((sum, r) => sum + r.value, 0) / rows.length);
    return [metric('声望', avg, rows.map((r) => `${r.label}${r.tier}`).join(' · '))];
}

// 设置页「我的角色」用：每条的名称、归属、类、谁在看、每日变化与档位；组合热度附各对。kind 同 cls（兼容旧界面字段）。
export function fameRows(state, bars) {
    return (fameOn(bars) ? bars : []).map((bar) => {
        const head = { name: bar.name, owner: bar.owner, cls: bar.cls, kind: bar.cls, watcher: bar.watcher, daily: fameDailyWord(bar) };
        return isPairBar(bar)
            ? { ...head, pairs: famePairs(state, bar).map((p) => ({ partner: p.partner, tier: fameTier(bar, p.value) })) }
            : { ...head, tier: fameTier(bar, fameValue(state, bar)) };
    });
}
