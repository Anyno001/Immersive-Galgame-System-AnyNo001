import { cryptoRandom } from './stat-rng.js';
import { COC_OCCUPATIONS } from './coc-occupations.js';

export { COC_OCCUPATIONS };

export const COC_ATTRS = ['力量', '体质', '体型', '敏捷', '外貌', '智力', '意志', '教育'];

export const COC_SKILLS = {
    会计: 5, 人类学: 1, 估价: 5, 考古学: 1, 艺术与手艺: 5, 魅惑: 15, 攀爬: 20, 计算机使用: 5,
    信用评级: 0, 克苏鲁神话: 0, 乔装: 5, 闪避: (a) => Math.floor((a.敏捷 || 0) / 2), 汽车驾驶: 20,
    电气维修: 10, 电子学: 1, 话术: 5, '格斗(斗殴)': 25, '射击(手枪)': 20, '射击(步霰)': 25,
    急救: 30, 历史: 5, 恐吓: 15, 跳跃: 20, 母语: (a) => a.教育 || 0, 外语: 1, 法律: 5,
    图书馆使用: 20, 聆听: 20, 锁匠: 1, 机械维修: 10, 医学: 1, 博物学: 10, 领航: 10, 神秘学: 5,
    操作重型机械: 1, 说服: 10, 精神分析: 1, 心理学: 10, 骑术: 5, 科学: 1, 妙手: 10, 侦查: 25,
    潜行: 20, 生存: 10, 游泳: 20, 投掷: 20, 追踪: 10, 驯兽: 5, 潜水: 1, 爆破: 1, 读唇: 1,
    催眠: 1, 炮术: 1,
};

const PARENT_EXTRA = { 格斗: 20, 射击: 20, 驾驶: 1 };

// 职业点公式：教育×倍数 + 若干组「取其中最高的属性×2」。
const FORMULAS = {
    edu4: { label: '教育×4', edu: 4, pick: [] },
    edu2dex2: { label: '教育×2+敏捷×2', edu: 2, pick: [['敏捷']] },
    edu2str2: { label: '教育×2+力量×2', edu: 2, pick: [['力量']] },
    edu2app2: { label: '教育×2+外貌×2', edu: 2, pick: [['外貌']] },
    edu2pow2: { label: '教育×2+意志×2', edu: 2, pick: [['意志']] },
    edu2strdex2: { label: '教育×2+（力量或敏捷）×2', edu: 2, pick: [['力量', '敏捷']] },
    edu2appdex2: { label: '教育×2+（外貌或敏捷）×2', edu: 2, pick: [['外貌', '敏捷']] },
    edu2apppow2: { label: '教育×2+（外貌或意志）×2', edu: 2, pick: [['外貌', '意志']] },
    edu2dexpow2: { label: '教育×2+（敏捷或意志）×2', edu: 2, pick: [['敏捷', '意志']] },
    edu2appdexstr2: { label: '教育×2+（外貌、敏捷或力量）×2', edu: 2, pick: [['外貌', '敏捷', '力量']] },
};
const OCC_FORMULAS = [...Object.keys(FORMULAS), 'custom'];
export const COC_OCC_FORMULA_ITEMS = Object.freeze([...Object.entries(FORMULAS).map(([k, v]) => [k, v.label]), ['custom', '自填']]);
const OCC_BY_ID = new Map(COC_OCCUPATIONS.map((o) => [o.id, o]));
const CREDIT = '信用评级';
// 「任选」槽可选的技能：内置技能表，去掉信用评级与克苏鲁神话。
export const COC_PICKABLE_SKILLS = Object.freeze(Object.keys(COC_SKILLS).filter((k) => k !== CREDIT && k !== '克苏鲁神话'));

export const cocOccupation = (id) => (id && OCC_BY_ID.get(String(id))) || null;

// 职业的自选位，按出现顺序展开：「多选一」一位，「任选 N 项」N 位。picks[i] 对应第 i 位。
export function cocOccSlots(occ) {
    const out = [];
    for (const s of (occ && occ.skills) || []) {
        if (typeof s === 'string') continue;
        if (s.one) out.push({ label: s.one.join('、'), options: s.one });
        else for (let i = 0; i < s.any; i++) out.push({ label: s.text, options: COC_PICKABLE_SKILLS, n: i + 1, of: s.any });
    }
    return out;
}

// 本职技能（含信用评级）；自填职业返回 null，表示不限。
export function cocOccSkills(occ, picks = []) {
    if (!occ) return null;
    const set = new Set([CREDIT]);
    for (const s of occ.skills) if (typeof s === 'string') set.add(s);
    cocOccSlots(occ).forEach((slot, i) => {
        const p = picks && picks[i];
        if (p && slot.options.includes(p)) set.add(p);
    });
    return set;
}

// 分配是否合规：超出职业点或兴趣点、职业点用在非本职技能上、信用评级不在职业范围内，都不能应用。
export function cocAllocCheck(draft) {
    const sh = { attrs: draft.attrs, occFormula: draft.occFormula, occPoints: draft.occPoints };
    const occMax = occPointsOf(sh);
    const hobMax = hobbyPointsOf(sh);
    const alloc = draft.alloc || {};
    const sum = (key) => Object.values(alloc).reduce((t, a) => t + (Number(a && a[key]) || 0), 0);
    const occ = cocOccupation(draft.occId);
    const own = cocOccSkills(occ, draft.occPicks);
    const problems = [];
    const occLeft = occMax - sum('occ');
    const hobLeft = hobMax - sum('hobby');
    if (occLeft < 0) problems.push('职业点超出');
    if (hobLeft < 0) problems.push('兴趣点超出');
    if (own) {
        const stray = Object.entries(alloc).filter(([k, a]) => (Number(a && a.occ) || 0) > 0 && !own.has(k)).map(([k]) => k);
        if (stray.length) problems.push(`${stray.join('、')}不是本职技能，不能用职业点`);
        const credit = (Number(alloc[CREDIT] && alloc[CREDIT].occ) || 0) + (Number(alloc[CREDIT] && alloc[CREDIT].hobby) || 0);
        if (credit < occ.cr[0] || credit > occ.cr[1]) problems.push(`信用评级须在${occ.cr[0]}–${occ.cr[1]}（现为${credit}）`);
    }
    return { occMax, hobMax, occLeft, hobLeft, problems, ok: problems.length === 0 };
}

const clampInt = (v, lo, hi, fallback) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hi, Math.max(lo, n));
};

const splitSpecialty = (name) => {
    const m = String(name).match(/^([^()（）:：]+?)\s*(?:[(（]\s*([^)）]+?)\s*[)）]|[:：]\s*(.+))$/);
    if (!m) return null;
    return { parent: m[1].trim(), spec: (m[2] || m[3] || '').trim() };
};

export function cocSkillBase(name, attrs = {}) {
    const key = String(name || '').trim();
    if (!key) return null;
    const resolve = (k) => {
        if (Object.prototype.hasOwnProperty.call(COC_SKILLS, k)) {
            const b = COC_SKILLS[k];
            return typeof b === 'function' ? b(attrs || {}) : b;
        }
        if (Object.prototype.hasOwnProperty.call(PARENT_EXTRA, k)) return PARENT_EXTRA[k];
        return null;
    };
    const direct = resolve(key);
    if (direct !== null) return direct;
    const sp = splitSpecialty(key);
    if (sp && sp.spec) return resolve(sp.parent);
    return null;
}

export function cocDerived(attrs = {}, skills = null) {
    const con = Number(attrs.体质) || 0;
    const siz = Number(attrs.体型) || 0;
    const str = Number(attrs.力量) || 0;
    const dex = Number(attrs.敏捷) || 0;
    const pow = Number(attrs.意志) || 0;
    const sum = str + siz;
    let db;
    let build;
    if (sum <= 64) { db = '-2'; build = -2; }
    else if (sum <= 84) { db = '-1'; build = -1; }
    else if (sum <= 124) { db = '0'; build = 0; }
    else if (sum <= 164) { db = '+1D4'; build = 1; }
    else if (sum <= 204) { db = '+1D6'; build = 2; }
    else if (sum <= 284) { db = '+2D6'; build = 3; }
    else if (sum <= 364) { db = '+3D6'; build = 4; }
    else {
        const n = Math.ceil((sum - 364) / 80);
        db = `+${3 + n}D6`;
        build = 4 + n;
    }
    let mov = 8;
    if (dex < siz && str < siz) mov = 7;
    else if (dex > siz && str > siz) mov = 9;
    const mythos = Number(skills && skills.克苏鲁神话) || 0;
    return {
        hp: Math.floor((con + siz) / 10),
        mp: Math.floor(pow / 5),
        san: pow,
        sanMax: 99 - mythos,
        db,
        build,
        mov,
    };
}

export function occPointsOf(sheet) {
    const a = (sheet && sheet.attrs) || {};
    if (sheet && sheet.occFormula === 'custom') return Math.max(0, Math.round(Number(sheet.occPoints) || 0));
    const f = FORMULAS[sheet && sheet.occFormula] || FORMULAS.edu4;
    return (Number(a.教育) || 0) * f.edu + f.pick.reduce((t, group) => t + Math.max(...group.map((k) => Number(a[k]) || 0)) * 2, 0);
}

export function hobbyPointsOf(sheet) {
    return (Number(sheet && sheet.attrs && sheet.attrs.智力) || 0) * 2;
}

export function cocSkillTotals(sheet) {
    if (!sheet) return {};
    if (sheet.source === 'paste' || sheet.source === 'ai' || sheet.source === 'module') {
        const out = {};
        for (const [k, v] of Object.entries(sheet.totals || {})) out[k] = clampInt(v, 1, 99, 1);
        return out;
    }
    const attrs = sheet.attrs || {};
    const alloc = sheet.alloc || {};
    const out = {};
    for (const [name, a] of Object.entries(alloc)) {
        const spent = (Number(a && a.occ) || 0) + (Number(a && a.hobby) || 0);
        if (spent <= 0) continue;
        const sum = (cocSkillBase(name, attrs) || 0) + spent;
        out[name] = Math.min(99, Math.max(1, sum));
    }
    return out;
}

const dice = (n, sides, random) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += 1 + Math.floor(random() * sides);
    return t;
};

export function rollCocAttributes(random = cryptoRandom) {
    const three = () => dice(3, 6, random) * 5;
    const two = () => (dice(2, 6, random) + 6) * 5;
    const attrs = {
        力量: three(),
        体质: three(),
        体型: two(),
        敏捷: three(),
        外貌: three(),
        智力: two(),
        意志: three(),
        教育: two(),
    };
    return { attrs, luck: three() };
}

export const ATTR_ALIAS = {
    力量: '力量', str: '力量',
    体质: '体质', con: '体质',
    体型: '体型', 体形: '体型', siz: '体型',
    敏捷: '敏捷', dex: '敏捷',
    外貌: '外貌', app: '外貌',
    智力: '智力', 灵感: '智力', int: '智力',
    意志: '意志', pow: '意志',
    教育: '教育', 知识: '教育', edu: '教育',
};
const LUCK_ALIAS = ['幸运', '运气', 'luck'];
const SAN_ALIAS = ['san', '理智'];
const IGNORE_ALIAS = ['hp', '生命', 'mp', '魔法', 'db', 'mov', '体格'];
const SKILL_ALIAS = {
    斗殴: '格斗(斗殴)', 格斗: '格斗(斗殴)',
    图书馆: '图书馆使用', 计算机: '计算机使用', 电脑: '计算机使用', 驾驶: '汽车驾驶',
    信用: '信用评级', 克苏鲁: '克苏鲁神话', cm: '克苏鲁神话', 手枪: '射击(手枪)',
    步枪: '射击(步霰)', 霰弹枪: '射击(步霰)', 步霰: '射击(步霰)', 开锁: '锁匠',
    重型机械: '操作重型机械', 艺术: '艺术与手艺', 手艺: '艺术与手艺', 技艺: '艺术与手艺',
    语言: '外语', 母语言: '母语', 攀爬术: '攀爬', 汽车: '汽车驾驶', 自然学: '博物学',
};

const TOKEN_RE = /([A-Za-z一-龥]+(?:[(（][^)）\s\d]+[)）]|[:：][A-Za-z一-龥]+)?)[\s:：=,，;；]*(\d{1,3})(?!\d)/g;
const NOISE_RE = /^(st|\.st|\.coc|coc|coc7|\.|\/|hp|mp)$/i;

export const normSkillName = (raw) => {
    let name = String(raw).trim();
    const sp = splitSpecialty(name);
    if (sp && sp.spec) {
        const parent = SKILL_ALIAS[sp.parent.toLowerCase()] || sp.parent;
        const pbase = parent.match(/^([^(]+)\(/);
        const pname = pbase ? pbase[1] : parent;
        return `${pname}(${sp.spec})`;
    }
    name = SKILL_ALIAS[name.toLowerCase()] || name;
    return name;
};

export function parseCocSheet(text) {
    const src = String(text || '').replace(/\r/g, '\n');
    const attrs = {};
    const skills = {};
    const unknown = [];
    let luck = null;
    let san = null;
    let last = 0;
    const addLeft = (s) => {
        for (const piece of s.split(/[\s,，;；:：=、\n]+/)) {
            const p = piece.replace(/^[.。]+|[.。]+$/g, '').trim();
            if (p && !NOISE_RE.test(p)) unknown.push(p);
        }
    };
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(src))) {
        addLeft(src.slice(last, m.index));
        last = m.index + m[0].length;
        const rawName = m[1];
        const lower = rawName.toLowerCase();
        const value = Number(m[2]);
        if (ATTR_ALIAS[lower]) attrs[ATTR_ALIAS[lower]] = value;
        else if (LUCK_ALIAS.includes(lower)) luck = value;
        else if (SAN_ALIAS.includes(lower)) san = value;
        else if (IGNORE_ALIAS.includes(lower)) continue;
        else {
            const name = normSkillName(rawName);
            if (cocSkillBase(name, {}) !== null) skills[name] = value;
            else unknown.push(`${rawName}${m[2]}`);
        }
    }
    addLeft(src.slice(last));
    const missing = COC_ATTRS.filter((k) => attrs[k] === undefined);
    const legacy6 = missing.length === 0 && COC_ATTRS.every((k) => attrs[k] <= 18);
    return { attrs, luck, skills, san, unknown, missing, legacy6 };
}

const FORMULA_LABELS = Object.fromEntries(COC_OCC_FORMULA_ITEMS);
const FORMULA_OF_LABEL = Object.fromEntries(Object.entries(FORMULA_LABELS).map(([k, v]) => [v, k]));
const SOURCE_LABEL = { paste: '粘贴', ai: 'AI生成', module: '模组', roll: '掷骰' };
const SOURCE_OF_LABEL = Object.fromEntries(Object.entries(SOURCE_LABEL).map(([k, v]) => [v, k]));
const mapObject = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));

// 数据库里的调查员档一律用中文字段名；读档同时认旧版英文字段。
export function cocSheetRecord(sheet, opts) {
    const clean = sanitizeCocSheet(sheet, opts);
    if (!clean) return null;
    const out = {
        版本: clean.v, 属性: clean.attrs, 幸运: clean.luck, 理智: clean.san, 职业: clean.occupation,
        职业点公式: FORMULA_LABELS[clean.occFormula], 职业点: clean.occPoints,
        来源: SOURCE_LABEL[clean.source] || '掷骰', 时间: clean.at,
    };
    if (clean.occId) { out.职业编号 = clean.occId; out.本职自选 = clean.occPicks; }
    if (clean.totals) out.技能 = clean.totals;
    if (clean.alloc) out.技能分配 = mapObject(clean.alloc, (a) => ({ 职业: a.occ, 兴趣: a.hobby }));
    return out;
}

function fromRecord(raw) {
    if (!raw || typeof raw !== 'object' || !raw.属性) return raw;
    return {
        v: raw.版本, attrs: raw.属性, luck: raw.幸运, san: raw.理智, occupation: raw.职业,
        occFormula: FORMULA_OF_LABEL[raw.职业点公式], occPoints: raw.职业点, occId: raw.职业编号, occPicks: raw.本职自选,
        source: SOURCE_OF_LABEL[raw.来源] || 'roll', at: raw.时间,
        totals: raw.技能,
        alloc: raw.技能分配 && typeof raw.技能分配 === 'object' ? mapObject(raw.技能分配, (a) => (a && typeof a === 'object' ? { occ: a.职业, hobby: a.兴趣 } : a)) : undefined,
    };
}

// npc 为真时额外认 ai / module 来源（NPC 技能只存合计）；主角档仍只有粘贴与掷骰。
export function sanitizeCocSheet(input, { npc = false } = {}) {
    const raw = fromRecord(input);
    if (!raw || typeof raw !== 'object') return null;
    const ra = raw.attrs;
    if (!ra || typeof ra !== 'object') return null;
    const attrs = {};
    for (const k of COC_ATTRS) {
        const n = clampInt(ra[k], 1, 99, null);
        if (n === null || ra[k] === null || ra[k] === '' || ra[k] === undefined) return null;
        attrs[k] = n;
    }
    const source = raw.source === 'paste' || (npc && (raw.source === 'ai' || raw.source === 'module')) ? raw.source : 'roll';
    const out = {
        v: 1,
        attrs,
        luck: clampInt(raw.luck, 1, 99, 50),
        occupation: String(raw.occupation || '').trim().slice(0, 12),
        occFormula: OCC_FORMULAS.includes(raw.occFormula) ? raw.occFormula : 'edu4',
        occPoints: clampInt(raw.occPoints, 0, 999, 0),
        san: clampInt(raw.san, 1, 99, attrs.意志),
        source,
        at: Number.isFinite(Number(raw.at)) ? Number(raw.at) : 0,
    };
    const occ = cocOccupation(raw.occId);
    if (occ) {
        out.occId = occ.id;
        out.occPicks = (Array.isArray(raw.occPicks) ? raw.occPicks : []).slice(0, cocOccSlots(occ).length).map((p) => String(p || '').slice(0, 24));
    }
    const cleanName = (k) => String(k).trim().slice(0, 24);
    if (source !== 'roll') {
        const totals = {};
        for (const [k, v] of Object.entries(raw.totals || {})) {
            const name = cleanName(k);
            if (name) totals[name] = clampInt(v, 1, 99, 1);
        }
        out.totals = totals;
    } else {
        const alloc = {};
        for (const [k, v] of Object.entries(raw.alloc || {})) {
            const name = cleanName(k);
            if (!name || !v || typeof v !== 'object') continue;
            alloc[name] = { occ: clampInt(v.occ, 0, 99, 0), hobby: clampInt(v.hobby, 0, 99, 0) };
        }
        out.alloc = alloc;
    }
    return out;
}

export const COC_MODES = Object.freeze(['daily', 'investigator']);
export const normalizeCocMode = (mode) => (COC_MODES.includes(mode) ? mode : null);
// 未存过模式时：有档按调查员，没有按日常。
export const cocModeOf = (catalog) => (catalog && catalog.protagonistCoc ? (normalizeCocMode(catalog.cocMode) || 'investigator') : 'daily');
