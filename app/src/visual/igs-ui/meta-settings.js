// Meta 互动：角色察觉屏幕前的玩家（戳头、悬停、阅读习惯、真实时间）。本地即时反应，不经过 AI；
// 只有打开「交互摘要」时才把发生过的事带进下一次生成。总开关默认关闭，不进入演出一键档位。
export const META_COOLDOWNS = Object.freeze([2, 4, 8]);
export const META_LINE_KINDS = Object.freeze(['poke1', 'poke2', 'poke3', 'skip', 'back', 'idle', 'greetNight', 'greetMorning', 'greetAway', 'greetBirthday', 'greetFestival']);
export const META_LINE_LABELS = Object.freeze({
    poke1: '戳头 · 第 1 次',
    poke2: '戳头 · 第 2～3 次',
    poke3: '戳头 · 4 次以上',
    skip: '快速连翻',
    back: '回翻旧页',
    idle: '很久不操作',
    greetNight: '问候 · 深夜',
    greetMorning: '问候 · 早上',
    greetAway: '问候 · 久别',
    greetBirthday: '问候 · 生日',
    greetFestival: '问候 · 节日（{节日} 换成节日名）',
});
// 内置台词保持中性，不预设角色性格；可在设置里按「通用」或按角色覆盖。
export const META_DEFAULT_LINES = Object.freeze({
    poke1: Object.freeze(['？', '嗯？']),
    poke2: Object.freeze(['干、干嘛……', '别戳啦']),
    poke3: Object.freeze(['再戳要生气了！', '够了没有！']),
    skip: Object.freeze(['喂，你有好好在看吗？', '翻得也太快了吧……']),
    back: Object.freeze(['在看以前的事吗……', '那时候的事，还记得呢']),
    idle: Object.freeze(['……还在吗？', '睡着了吗？']),
    greetNight: Object.freeze(['这么晚还不睡？', '夜深了，要注意身体哦']),
    greetMorning: Object.freeze(['早上好。', '今天也来啦']),
    greetAway: Object.freeze(['好久不见……还以为你不来了', '终于回来了啊']),
    greetBirthday: Object.freeze(['今天是你的生日吧？生日快乐！']),
    greetFestival: Object.freeze(['{节日}快乐！']),
});
export const META_GLOBAL_SCOPE = '*';
export const META_LINES_MAX = 12;
const LINE_MAX = 40;
const SCOPES_MAX = 24;

// 触发阈值：连戳 3 秒无新点击归零；每页最多戳 8 次；5 秒内翻页 8 次算连翻；回翻 10 页并停留 2 秒；3 分钟不操作。
export const META_POKE_RESET_MS = 3000;
export const META_POKE_PAGE_MAX = 8;
export const META_SKIP_WINDOW_MS = 5000;
export const META_SKIP_COUNT = 8;
export const META_BACK_PAGES = 10;
export const META_BACK_DWELL_MS = 2000;
export const META_IDLE_MS = 180000;
export const META_AWAY_DAYS = 3;
const DIGEST_MAX = 80;

function plain(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function lineList(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        const line = String(item == null ? '' : item).trim().slice(0, LINE_MAX);
        if (line && !out.includes(line) && out.length < META_LINES_MAX) out.push(line);
    }
    return out;
}

function normalizeLines(value) {
    const out = {};
    let count = 0;
    for (const [scope, pools] of Object.entries(plain(value))) {
        const key = String(scope || '').trim();
        if (!key || count >= SCOPES_MAX) continue;
        const kinds = {};
        for (const kind of META_LINE_KINDS) {
            const list = lineList(plain(pools)[kind]);
            if (list.length) kinds[kind] = list;
        }
        // 角色分组即使暂时没有台词也保留（刚添加的角色要能继续编辑）。
        out[key] = kinds;
        count += 1;
    }
    return out;
}

// 生日接受「3-5」「03-05」「3月5日」「3/5」，统一成 MM-DD；无法识别返回 ''。
export function normalizeMetaBirthday(value) {
    const match = String(value == null ? '' : value).trim().match(/^(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/);
    if (!match) return '';
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeMetaFxSettings(value) {
    const src = plain(value);
    const cooldown = Number(src.cooldownSec);
    return {
        enabled: src.enabled === true,
        poke: src.poke !== false,
        hover: src.hover !== false,
        reading: src.reading !== false,
        clock: src.clock !== false,
        festivals: src.festivals !== false,
        birthday: normalizeMetaBirthday(src.birthday),
        digest: src.digest === true,
        cooldownSec: META_COOLDOWNS.includes(cooldown) ? cooldown : 4,
        lines: normalizeLines(src.lines),
    };
}

// 台词池：角色自定义 → 通用自定义 → 内置。
export function resolveMetaLines(settings, character, kind) {
    const lines = plain(settings && settings.lines);
    const name = String(character || '').trim();
    const own = name && lines[name] && lines[name][kind];
    if (Array.isArray(own) && own.length) return own;
    const shared = lines[META_GLOBAL_SCOPE] && lines[META_GLOBAL_SCOPE][kind];
    if (Array.isArray(shared) && shared.length) return shared;
    return META_DEFAULT_LINES[kind] || [];
}

// random 可注入，便于测试；vars 替换 {节日} 这类占位符。
export function pickMetaLine(settings, character, kind, random = Math.random, vars = {}) {
    const pool = resolveMetaLines(settings, character, kind);
    if (!pool.length) return '';
    const line = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
    return Object.entries(vars).reduce((text, [key, val]) => text.split(`{${key}}`).join(String(val)), line);
}

// 连戳升级：1 次、2～3 次、4 次以上。
export function pokeLevel(count) {
    if (count >= 4) return 3;
    return count >= 2 ? 2 : 1;
}

// 5 秒窗口内的翻页时间戳；返回剔除过期后的新数组与是否达到连翻阈值。
export function trackPageTurns(stamps, now) {
    const kept = (Array.isArray(stamps) ? stamps : []).filter((t) => now - t < META_SKIP_WINDOW_MS);
    kept.push(now);
    return { stamps: kept, skipping: kept.length >= META_SKIP_COUNT };
}

// 页面位置：楼层号 + 楼层内页码。回翻 = 翻回更早的楼层，或同楼层比读到最远处少 10 页以上。
export function isBackReading(furthest, current) {
    if (!furthest || !current) return false;
    const fm = Number(furthest.messageId);
    const cm = Number(current.messageId);
    if (Number.isFinite(fm) && Number.isFinite(cm) && cm !== fm) return cm < fm;
    if (String(furthest.messageId) !== String(current.messageId)) return false;
    return Number(furthest.index) - Number(current.index) >= META_BACK_PAGES;
}

export function isFurther(furthest, current) {
    if (!furthest) return true;
    const fm = Number(furthest.messageId);
    const cm = Number(current.messageId);
    if (Number.isFinite(fm) && Number.isFinite(cm) && cm !== fm) return cm > fm;
    if (String(furthest.messageId) !== String(current.messageId)) return true;
    return Number(current.index) > Number(furthest.index);
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

export function localDayKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// 农历月日（闰月返回 null），依赖浏览器 Intl 的 chinese 历法；不支持时返回 null，春节与七夕不触发。
export function lunarMonthDay(date) {
    try {
        const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'numeric', day: 'numeric' }).formatToParts(date);
        const monthPart = parts.find((p) => p.type === 'month');
        const dayPart = parts.find((p) => p.type === 'day');
        if (!monthPart || !dayPart || /闰/.test(monthPart.value)) return null;
        const month = Number(String(monthPart.value).replace(/\D/g, ''));
        const day = Number(String(dayPart.value).replace(/\D/g, ''));
        return month > 0 && day > 0 ? { month, day } : null;
    } catch (error) {
        return null;
    }
}

const SOLAR_FESTIVALS = Object.freeze({ '01-01': '新年', '02-14': '情人节', '12-25': '圣诞节' });
const LUNAR_FESTIVALS = Object.freeze({ '1-1': '春节', '7-7': '七夕' });

// 古代背景只认农历节日。
export function resolveFestival(date, { ancient = false } = {}) {
    const lunar = lunarMonthDay(date);
    if (lunar && LUNAR_FESTIVALS[`${lunar.month}-${lunar.day}`]) return LUNAR_FESTIVALS[`${lunar.month}-${lunar.day}`];
    if (ancient) return '';
    return SOLAR_FESTIVALS[`${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`] || '';
}

// 每日首次问候的种类，优先级：生日 > 节日 > 久别 > 深夜（0～5 点）> 早上（6～9 点）；都不满足返回 null。
export function resolveGreeting(settings, { now, lastSeen, ancient = false } = {}) {
    const s = normalizeMetaFxSettings(settings);
    if (!(now instanceof Date)) return null;
    if (s.birthday && s.birthday === `${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`) return { kind: 'greetBirthday' };
    if (s.festivals) {
        const festival = resolveFestival(now, { ancient });
        if (festival) return { kind: 'greetFestival', vars: { 节日: festival } };
    }
    const last = Number(lastSeen);
    if (Number.isFinite(last) && last > 0 && now.getTime() - last >= META_AWAY_DAYS * 86400000) return { kind: 'greetAway' };
    const hour = now.getHours();
    if (hour < 5) return { kind: 'greetNight' };
    if (hour >= 6 && hour < 10) return { kind: 'greetMorning' };
    return null;
}

// 交互摘要：事件 { type: 'poke' | 'skip' | 'back' | 'idle', character, hour }，每类合并成一句，总长不超过 80 字。
export function summarizeMetaEvents(events) {
    const list = Array.isArray(events) ? events : [];
    if (!list.length) return '';
    const parts = [];
    const pokes = new Map();
    for (const event of list) {
        if (event && event.type === 'poke') {
            const name = String(event.character || '').trim() || '对方';
            pokes.set(name, (pokes.get(name) || 0) + 1);
        }
    }
    for (const [name, count] of pokes) parts.push(`玩家戳了${name}的头 ${count} 次`);
    if (list.some((e) => e && e.type === 'skip')) parts.push('玩家飞快地跳过了一段剧情');
    if (list.some((e) => e && e.type === 'back')) parts.push('玩家回头翻看了之前的剧情');
    if (list.some((e) => e && e.type === 'idle')) parts.push('玩家有好一阵没有动静');
    const lateHours = list.map((e) => Number(e && e.hour)).filter((h) => Number.isFinite(h) && h < 5);
    if (lateHours.length) parts.push(`现实中已是深夜 ${lateHours[lateHours.length - 1]} 点`);
    if (!parts.length) return '';
    let text = '';
    for (const part of parts) {
        const next = text ? `${text}；${part}` : part;
        if (next.length > DIGEST_MAX) break;
        text = next;
    }
    return text;
}

export function buildMetaDigestRule(summary) {
    const text = String(summary || '').trim();
    if (!text) return '';
    return `[igs屏幕外]\n以下是阅读界面里玩家本轮的小动作，角色可以自然地察觉、回应或忽略，不要逐条复述，也不要提及「阅读界面」：\n（${text}）`;
}
