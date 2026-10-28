// 非人对手的战斗规则（纯函数）：多对手名拆分、目标名匹配、二阶段（狂暴）名单。
// 单对手写法（不含分隔符）原样返回，不改变任何既有解析结果。

// 只认顿号「、」和全角逗号「，」；ASCII 逗号常出现在英文名里（Arthur, King of Britons），不拆。
export const FOE_SPLIT_RE = /[、，]/;
// 一场战斗最多列出的对手数；再多的只在名牌上列出。
export const FOE_LIST_MAX = 6;
const GROUP_SUFFIX_RE = /(?:们|群|众)$/;
const text = (value) => String(value == null ? '' : value).trim();

// 「对手1、对手2」拆成名单；没有分隔符时返回只含原名的单项（空串返回空数组）。
export function splitFoeNames(raw) {
    const value = text(raw);
    if (!value) return [];
    if (!FOE_SPLIT_RE.test(value)) return [value];
    const out = [];
    for (const part of value.split(FOE_SPLIT_RE)) {
        const name = text(part);
        if (name && !out.includes(name)) out.push(name);
        if (out.length >= FOE_LIST_MAX) break;
    }
    return out;
}

// 主角称呼与 battle-context 的 PLAYER_NAMES 一致；这里单独写一份，避免神话包构建器经本模块反向引入指令解析（会形成循环依赖）。
const PLAYER_NAMES = Object.freeze(['我', '你', '主角', '玩家', '{{user}}']);
export function isPlayerName(name, userName = '') {
    const target = text(name);
    if (!target) return false;
    return PLAYER_NAMES.includes(target) || (Boolean(userName) && target === text(userName));
}

export const isMultiFoe = (raw) => splitFoeNames(raw).length > 1;
export const hasGroupSuffix = (name) => GROUP_SUFFIX_RE.test(text(name));
// 「哥布林们」「狼群」去掉群体后缀取本名；没有后缀原样返回。
export function foeBaseName(name) {
    const value = text(name);
    const base = value.replace(GROUP_SUFFIX_RE, '');
    return base.length >= 1 ? base : value;
}

// 名字相同（群体后缀「们 / 群 / 众」先去掉再比）。只做精确比较：「哥布林头目」与「哥布林」是两个对手。
export function sameFoeName(a, b) {
    const x = foeBaseName(a);
    const y = foeBaseName(b);
    return Boolean(x) && x === y;
}

// 在对手名单里找 hit 的目标 / 出手者：精确匹配优先；只有名单里没有任何精确匹配时才允许「一方包含另一方」（都不短于 2 字），
// 且候选唯一时才算匹配，多个候选一律不匹配（「头目」同时对得上两个对手就不猜）。
export function matchFoeName(target, names) {
    const list = (Array.isArray(names) ? names : []).filter(text);
    const value = text(target);
    if (!value) return '';
    const exact = list.find((name) => name === value) || list.find((name) => sameFoeName(value, name));
    if (exact) return exact;
    const base = foeBaseName(value);
    if (base.length < 2) return '';
    const fuzzy = list.filter((name) => { const other = foeBaseName(name); return other.length >= 2 && (other.includes(base) || base.includes(other)); });
    return fuzzy.length === 1 ? fuzzy[0] : '';
}

// 二阶段名单：phase 的名字为空表示本场全部对手。返回合并后的新数组，不改入参。
export function addFrenzy(current, name, foeRaw = '') {
    const base = Array.isArray(current) ? current.map(text).filter(Boolean) : [];
    const add = text(name) ? [text(name)] : splitFoeNames(foeRaw);
    const out = [...base];
    for (const item of add) if (!out.includes(item)) out.push(item);
    return out;
}

// names：本场对手名单（用来解析名单里写的简称）；name 为名单中的某个对手。
export const isFrenzyName = (list, name, names = [name]) => Array.isArray(list) && list.some((item) => matchFoeName(item, names) === name);

// 本场战斗里已被击倒 / 收服的次数（只算本页之前的）：battle.down 记每次击倒或收服的目标名；本页自己的击倒与收服由演出播放，不算在内。
// 成群杂兵每倒一个身影记一次，调用方用次数与身影数比较。
export function downCountFor(fx, raw) {
    const src = fx && (fx.battle || fx.battleOver);
    const all = src && Array.isArray(src.down) ? src.down : [];
    const names = splitFoeNames(src && src.foe);
    if (!names.includes(raw)) names.push(raw);
    const isRaw = (name) => matchFoeName(name, names) === raw;
    let count = all.filter(isRaw).length;
    if (!count) return 0;
    for (const hit of Array.isArray(fx.hits) ? fx.hits : []) if (hit && hit.result === 'ko' && isRaw(hit.target)) count -= 1;
    for (const item of Array.isArray(fx.daily) ? fx.daily : []) if (item && item.type === 'subdue' && isRaw(item.who)) count -= 1;
    return Math.max(0, count);
}
export const FOE_DOWN_MAX = 24;
